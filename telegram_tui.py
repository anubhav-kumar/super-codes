#!/usr/bin/env python3
"""
Telegram TUI - A Terminal User Interface for Telegram Chat
Built with Textual and Telethon

Setup:
1. Get your API ID and API Hash from https://my.telegram.org/apps
2. Create a .env file with:
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
3. Run: python telegram_tui.py

The first run performs the interactive login (phone + code) in the plain
terminal, *before* the TUI takes over the screen. Telethon prompts on stdin,
and stdin is unusable once Textual is running.
"""

import asyncio
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen, Screen
from textual.widgets import (
    Header,
    Footer,
    Input,
    Static,
    Button,
    Label,
    DataTable,
    RichLog,
)
from dotenv import load_dotenv

load_dotenv()

from telethon import TelegramClient, utils
from telethon.tl.functions.contacts import BlockRequest
from telethon.tl.functions.messages import GetPeerDialogsRequest
from telethon.tl.types import (
    User,
    Channel,
    UserStatusOnline,
    UserStatusOffline,
    UserStatusRecently,
    UserStatusLastWeek,
    UserStatusLastMonth,
)

SESSION_NAME = "telegram_session"

# Photos from the loaded history are saved under MEDIA_DIR/<chat folder>/.
MEDIA_DIR = Path(os.getenv("TELEGRAM_MEDIA_DIR", "media"))


def _is_photo(msg) -> bool:
    """True for a compressed photo, or an image sent as an uncompressed file."""
    if msg.photo is not None:
        return True
    # Images sent as documents keep their original bytes; stickers are excluded.
    if msg.document is not None and msg.sticker is None:
        mime = getattr(msg.document, "mime_type", "") or ""
        return mime.startswith("image/")
    return False


def _chat_folder(chat_name: str, entity_id: int) -> Path:
    """Stable, filesystem-safe folder for one chat."""
    safe = re.sub(r"[^\w.-]+", "_", chat_name or "chat").strip("._") or "chat"
    return MEDIA_DIR / f"{safe[:40]}_{entity_id}"


def _photo_path(msg, folder: Path) -> Path:
    """Deterministic destination for a photo, so restarts don't re-download."""
    ext = utils.get_extension(msg.photo or msg.document) or ".jpg"
    return folder / f"{msg.id}{ext}"


def _local_time(when, fmt: str) -> str:
    """Format a Telethon timestamp in the machine's timezone.

    Telethon returns tz-aware UTC datetimes, so formatting them directly would
    show UTC clock times rather than local ones.
    """
    return when.astimezone().strftime(fmt) if when else ""


# Service messages carry an action instead of text (mirrors check_new_message.py).
_ACTIONS = {
    "ContactSignUp": "joined Telegram",
    "ChatAddUser": "added to the chat",
    "ChatDeleteUser": "left the chat",
    "PinMessage": "pinned a message",
    "HistoryClear": "cleared the history",
}


def _preview_text(msg) -> str:
    """Short summary of a message for the chat list."""
    if msg is None:
        return ""
    if msg.text:
        return msg.text
    if msg.action is not None:
        name = type(msg.action).__name__.removeprefix("MessageAction")
        spaced = re.sub(r"(?<!^)(?=[A-Z])", " ", name).lower()
        return f"\u2022 {_ACTIONS.get(name, spaced)}"
    if _is_photo(msg):
        return "\U0001f5bc Photo"
    if msg.media is not None:
        return f"<{type(msg.media).__name__}>"  # str(media) is a raw Telethon repr
    return ""


def _parse_chat_target(text: str):
    """Turn typed input into something client.get_entity accepts.

    Accepts @username, a bare username, a t.me link, a phone number, or a
    numeric ID. Returns (target, kind); raises ValueError with a readable
    reason when the input cannot be interpreted at all.
    """
    text = text.strip()
    if not text:
        raise ValueError("Enter a username, phone number, or numeric ID.")

    username, is_invite = utils.parse_username(text)
    if is_invite:
        raise ValueError(
            "Invite links are not supported here - use a @username, "
            "phone number, or numeric ID."
        )
    if username:
        return username, "username"

    if re.fullmatch(r"-?\d+", text):
        return int(text), "id"

    phone = re.sub(r"[\s()\-.]", "", text)
    if re.fullmatch(r"\+?\d{5,15}", phone):
        return phone, "phone"

    raise ValueError(f"Could not interpret {text!r} as a username, phone, or ID.")


def _phone_retry(kind: str, target) -> Optional[str]:
    """A phone number to try after a numeric-ID lookup fails, if plausible."""
    if kind != "id":
        return None
    digits = str(target)
    if digits.startswith("-"):
        return None  # negative IDs are groups/channels, never phone numbers
    return f"+{digits}" if 8 <= len(digits) <= 15 else None


def _resolve_failure(kind: str, text: str, exc: Exception) -> str:
    """Explain why get_entity could not find a target."""
    if kind == "id":
        return (f"Telegram will not resolve the bare ID {text} unless this "
                "session has already seen that account. Use their @username "
                "or phone number instead.")
    if kind == "phone":
        return (f"No Telegram account found for {text}. The number has to be "
                "in your contacts for Telegram to resolve it.")
    return f"No Telegram user, bot, or channel found for @{text.lstrip('@')} ({type(exc).__name__})."


def _ago(when) -> str:
    """Compact 'how long ago', falling back to a date past a week."""
    delta = datetime.now(timezone.utc) - when
    seconds = delta.total_seconds()
    if seconds < 0:
        return "just now"          # clock skew
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    if seconds < 7 * 86400:
        return f"{int(seconds // 86400)}d ago"
    return when.astimezone().strftime("%d %b")


def _last_seen(entity) -> str:
    """Presence text for a chat, e.g. 'online' or '3h ago'.

    Telegram only reveals an exact timestamp when the other side shares it;
    with last-seen privacy on, it returns a coarse bucket like 'recently'.
    Groups and channels have no presence at all, so they show their size.
    """
    if not isinstance(entity, User):
        count = getattr(entity, "participants_count", None)
        return f"{count} members" if count else "-"
    if entity.deleted:
        return "deleted account"
    if entity.bot:
        return "bot"

    status = entity.status
    if isinstance(status, UserStatusOnline):
        return "online"
    if isinstance(status, UserStatusOffline):
        return _ago(status.was_online)
    if isinstance(status, UserStatusRecently):
        return "recently"
    if isinstance(status, UserStatusLastWeek):
        return "within a week"
    if isinstance(status, UserStatusLastMonth):
        return "within a month"
    return "-"  # UserStatusEmpty, or presence not shared at all


def _sender_name(msg) -> str:
    """Best-effort display name for a message's sender."""
    if msg.out:
        return "You"
    sender = getattr(msg, "sender", None)
    if sender is None:
        return "Unknown"
    name = getattr(sender, "title", None) or " ".join(
        part for part in (getattr(sender, "first_name", None),
                          getattr(sender, "last_name", None)) if part
    )
    return name or getattr(sender, "username", None) or str(getattr(sender, "id", "Unknown"))


class NewChatScreen(ModalScreen[Optional[str]]):
    """Ask for a username, phone number, or numeric ID."""

    BINDINGS = [Binding("escape", "cancel", "Cancel")]

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("Start a new chat", id="dialog-title")
            yield Static(
                "Enter a @username, t.me link, phone number (+919999999999), "
                "or numeric ID.",
                id="dialog-body",
            )
            yield Input(placeholder="@username", id="new-chat-input")
            with Horizontal(id="dialog-buttons"):
                yield Button("Cancel", id="cancel")
                yield Button("Open chat", id="confirm", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#new-chat-input", Input).focus()

    @on(Input.Submitted, "#new-chat-input")
    @on(Button.Pressed, "#confirm")
    def confirm(self, event=None) -> None:
        self.dismiss(self.query_one("#new-chat-input", Input).value)

    @on(Button.Pressed, "#cancel")
    def action_cancel(self) -> None:
        self.dismiss(None)


class ConfirmScreen(ModalScreen[bool]):
    """Yes/no confirmation. Cancel is focused, so Enter never destroys anything."""

    BINDINGS = [Binding("escape", "cancel", "Cancel")]

    def __init__(self, title: str, body: str, confirm_label: str, danger: bool = False):
        super().__init__()
        self.title_text = title
        self.body_text = body
        self.confirm_label = confirm_label
        self.danger = danger

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label(self.title_text, id="dialog-title")
            yield Static(self.body_text, id="dialog-body")
            with Horizontal(id="dialog-buttons"):
                yield Button("Cancel", id="cancel")
                yield Button(self.confirm_label, id="confirm",
                             variant="error" if self.danger else "primary")

    def on_mount(self) -> None:
        self.query_one("#cancel", Button).focus()

    @on(Button.Pressed, "#confirm")
    def confirm(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#cancel")
    def action_cancel(self) -> None:
        self.dismiss(False)


class DeleteChatScreen(ModalScreen[Optional[str]]):
    """Pick a deletion scope: "me", "both", or None to cancel."""

    BINDINGS = [Binding("escape", "cancel", "Cancel")]

    def __init__(self, chat_name: str, entity):
        super().__init__()
        self.chat_name = chat_name
        # Only private chats can have their history revoked for the other side;
        # for groups/channels delete_dialog leaves the chat instead.
        self.is_user = isinstance(entity, User)
        self.is_channel = isinstance(entity, Channel)

    def compose(self) -> ComposeResult:
        if self.is_user:
            body = (f"Delete your conversation with {self.chat_name}.\n\n"
                    "\u2022 For me - removes the chat from your account only.\n"
                    f"\u2022 For everyone - also erases it from {self.chat_name}'s "
                    "account. This cannot be undone.")
        elif self.is_channel:
            body = (f"Leave {self.chat_name} and remove it from your chat list.\n\n"
                    "The channel itself is not deleted.")
        else:
            body = (f"Leave {self.chat_name} and remove it from your chat list.\n\n"
                    "\u2022 For me - deletes your copy of the history.\n"
                    "\u2022 For everyone - also erases the history for every member.")

        with Vertical(id="dialog"):
            yield Label(f"Delete chat: {self.chat_name}", id="dialog-title")
            yield Static(body, id="dialog-body")
            with Horizontal(id="dialog-buttons"):
                yield Button("Cancel", id="cancel")
                yield Button("Delete for me", id="me", variant="warning")
                if not self.is_channel:
                    yield Button("Delete for everyone", id="both", variant="error")

    def on_mount(self) -> None:
        self.query_one("#cancel", Button).focus()

    @on(Button.Pressed, "#me")
    def delete_for_me(self) -> None:
        self.dismiss("me")

    @on(Button.Pressed, "#both")
    def delete_for_both(self) -> None:
        self.dismiss("both")

    @on(Button.Pressed, "#cancel")
    def action_cancel(self) -> None:
        self.dismiss(None)


class ChatList(Screen):
    """Screen showing list of chats."""

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("r", "refresh", "Refresh"),
        Binding("n", "new_chat", "New chat"),
        Binding("d", "delete_chat", "Delete chat"),
        Binding("b", "block_user", "Block"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Loading chats...", id="loading-label")
        yield DataTable(id="chat-table")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one("#chat-table", DataTable)
        table.add_columns("Type", "Name", "Last Seen", "Last Message", "Time")
        table.cursor_type = "row"
        self.load_chats()

    @work(exclusive=True, group="load-chats")
    async def load_chats(self) -> None:
        label = self.query_one("#loading-label", Label)
        label.update("Loading chats...")
        client = self.app.client
        if client is None:
            label.update("Not connected to Telegram.")
            return
        try:
            dialogs = await client.get_dialogs(limit=50)
            table = self.query_one("#chat-table", DataTable)
            table.clear()
            self.app.entities.clear()

            for dialog in dialogs:
                entity = dialog.entity
                chat_type = (
                    "Private" if isinstance(entity, User)
                    else "Channel" if isinstance(entity, Channel)
                    else "Group"
                )

                last_msg = " ".join(_preview_text(dialog.message).split())[:40]
                msg_time = _local_time(dialog.message.date, "%H:%M") if dialog.message else ""

                key = str(entity.id)
                self.app.entities[key] = (entity, dialog.name)
                table.add_row(chat_type, dialog.name, _last_seen(entity),
                              last_msg, msg_time, key=key)

            label.update(f"Loaded {len(dialogs)} chats. Select with Enter or double-click.")
        except Exception as e:
            label.update(f"Error loading chats: {e}")

    @on(DataTable.RowSelected)
    def on_chat_selected(self, event: DataTable.RowSelected) -> None:
        key = event.row_key.value
        if key:
            self.app.open_chat(key)

    def action_refresh(self) -> None:
        self.load_chats()

    def _selected(self):
        """(entity, name) for the highlighted row, or None."""
        table = self.query_one("#chat-table", DataTable)
        if not table.row_count:
            return None
        try:
            key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        except Exception:
            return None
        return self.app.entities.get(key)

    @work(exclusive=True, group="new-chat")
    async def action_new_chat(self) -> None:
        text = await self.app.push_screen_wait(NewChatScreen())
        if not text or not text.strip():
            return

        client = self.app.client
        if client is None:
            return

        try:
            target, kind = _parse_chat_target(text)
        except ValueError as e:
            self.app.notify(str(e), severity="warning", timeout=8)
            return

        try:
            entity = await client.get_entity(target)
        except Exception as e:
            # A bare run of digits is ambiguous: modern user IDs are ~10 digits,
            # so it could equally be a phone number typed without its "+".
            retry = _phone_retry(kind, target)
            if retry is None:
                self.app.notify(_resolve_failure(kind, text.strip(), e),
                                severity="error", timeout=10)
                return
            try:
                entity = await client.get_entity(retry)
                kind = "phone"
            except Exception as e2:
                self.app.notify(
                    f"{_resolve_failure('id', text.strip(), e)} "
                    f"Also tried {retry} as a phone number, without success.",
                    severity="error", timeout=10)
                return

        name = utils.get_display_name(entity) or str(target)
        # A chat with no messages yet has no dialog, so it will not appear in
        # the list until something is sent - open the view directly.
        self.app.entities[str(entity.id)] = (entity, name)
        self.app.push_screen(ChatView(entity, name))

    @work(exclusive=True, group="delete-chat")
    async def action_delete_chat(self) -> None:
        selected = self._selected()
        if selected is None:
            return
        entity, name = selected

        scope = await self.app.push_screen_wait(DeleteChatScreen(name, entity))
        if scope is None:
            return
        if scope == "both":
            # Irreversible and visible to the other side: confirm a second time.
            confirmed = await self.app.push_screen_wait(ConfirmScreen(
                "Delete for everyone?",
                f"This erases the conversation from {name}'s account too "
                "and cannot be undone.",
                "Yes, delete for everyone",
                danger=True,
            ))
            if not confirmed:
                return

        client = self.app.client
        if client is None:
            return
        try:
            await client.delete_dialog(entity, revoke=(scope == "both"))
        except Exception as e:
            self.app.notify(f"Could not delete: {type(e).__name__}: {e}",
                            severity="error", timeout=8)
            return

        self.app.notify(
            f"Deleted {name} " + ("for everyone." if scope == "both" else "for you."),
            severity="warning",
        )
        self.load_chats()

    @work(exclusive=True, group="block-user")
    async def action_block_user(self) -> None:
        selected = self._selected()
        if selected is None:
            return
        entity, name = selected

        if not isinstance(entity, User):
            self.app.notify("Only users can be blocked, not groups or channels.",
                            severity="warning")
            return

        confirmed = await self.app.push_screen_wait(ConfirmScreen(
            f"Block {name}?",
            f"{name} will no longer be able to message or call you. "
            "This does not delete the chat, and you can unblock them in "
            "any Telegram client.",
            f"Block {name}",
            danger=True,
        ))
        if not confirmed:
            return

        client = self.app.client
        if client is None:
            return
        try:
            await client(BlockRequest(id=entity))
        except Exception as e:
            self.app.notify(f"Could not block: {type(e).__name__}: {e}",
                            severity="error", timeout=8)
            return

        self.app.notify(f"Blocked {name}.", severity="warning")
        self.load_chats()


class ChatView(Screen):
    """Screen for viewing and sending messages in a chat."""

    BINDINGS = [
        Binding("escape", "back", "Back"),
        Binding("r", "refresh_messages", "Refresh"),
    ]

    def __init__(self, entity, chat_name: str):
        super().__init__()
        self.entity = entity
        self.chat_name = chat_name
        self.folder = _chat_folder(chat_name, entity.id)
        self._rendered: list[str] = []
        self._last_error: str = ""
        self._messages: list = []          # newest first, as Telethon returns them
        self._read_max_id: int = 0
        self._saved: dict[int, Path] = {}  # msg id -> photo saved on disk
        self._failed: dict[int, str] = {}  # msg id -> download error
        self._downloading = False
        self._acked_up_to = 0              # highest id reported read to Telegram

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="chat-container"):
            yield Label(f"Chat: {self.chat_name}", id="chat-title")
            yield RichLog(id="messages", highlight=True, markup=False)
            with Horizontal(id="input-container"):
                yield Input(placeholder="Type message...", id="message-input")
                yield Button("Send", id="send-button", variant="primary")
        yield Footer()

    def on_mount(self) -> None:
        self.load_messages()
        self.set_interval(5, self.load_messages)  # Auto-refresh every 5 seconds
        self.query_one("#message-input", Input).focus()

    async def _read_outbox_max_id(self, client) -> int:
        """Highest message id the other side has read (0 if unavailable)."""
        try:
            result = await client(GetPeerDialogsRequest(peers=[self.entity]))
            if result.dialogs:
                return result.dialogs[0].read_outbox_max_id or 0
        except Exception:
            pass
        return 0

    @work(exclusive=True, group="load-messages")
    async def load_messages(self) -> None:
        client = self.app.client
        if client is None:
            return

        try:
            self._messages = await client.get_messages(self.entity, limit=50)
            self._read_max_id = await self._read_outbox_max_id(client)
            self._adopt_existing_photos()
            self._redraw()
            self._last_error = ""
            self.download_photos()
            await self._mark_read(client)
        except Exception as e:
            # Report once per distinct error instead of hiding it forever.
            self._report(f"{type(e).__name__}: {e}")

    async def _mark_read(self, client) -> None:
        """Tell Telegram these messages have been seen.

        Without this, viewing a chat leaves everything unread server-side, so
        check_new_message.py keeps reporting messages you have already read.
        Note this sends a read receipt: the sender sees "seen".
        """
        if not self._messages:
            return
        newest = max(msg.id for msg in self._messages)
        if newest <= self._acked_up_to:
            return
        try:
            await client.send_read_acknowledge(self.entity, max_id=newest)
            self._acked_up_to = newest
        except Exception as e:
            self._report(f"could not mark read: {type(e).__name__}: {e}")

    def _report(self, error: str) -> None:
        if error == self._last_error:
            return
        self._last_error = error
        try:
            self.query_one("#messages", RichLog).write(f"[error] {error}")
        except Exception:
            self.log.error(error)  # log not mounted yet; don't cascade

    def _adopt_existing_photos(self) -> None:
        """Photos downloaded on an earlier run are already on disk."""
        for msg in self._messages:
            if msg.id in self._saved or not _is_photo(msg):
                continue
            path = _photo_path(msg, self.folder)
            if path.exists() and path.stat().st_size > 0:
                self._saved[msg.id] = path

    def _redraw(self) -> None:
        """Redraw the log from the cached messages and download state.

        Not named "_render": that name is a Textual internal (Widget._render
        must return a Visual), and overriding it breaks rendering entirely.
        """
        new_content = []
        for msg in reversed(self._messages):
            line = self._format(msg)
            if line is not None:
                new_content.append(line)

        if new_content == self._rendered:
            return
        messages_widget = self.query_one("#messages", RichLog)
        messages_widget.clear()
        for line in new_content:
            messages_widget.write(line)
        self._rendered = new_content

    def _format(self, msg) -> Optional[str]:
        """One log line for a message, or None if there is nothing to show."""
        photo = _is_photo(msg)
        if not msg.text and not photo:
            return None

        time_str = _local_time(msg.date, "%H:%M:%S")
        status = self._message_status(msg, self._read_max_id)
        status_str = f" [{status}]" if status else ""

        body = ""
        if photo:
            saved = self._saved.get(msg.id)
            if saved is not None:
                body = f"🖼 {saved}"
            elif msg.id in self._failed:
                body = f"🖼 <download failed: {self._failed[msg.id]}>"
            else:
                body = "🖼 <downloading...>"
            if msg.text:
                body = f"{body}  {msg.text}"
        else:
            body = msg.text

        return f"[{time_str}] {_sender_name(msg)}: {body}{status_str}"

    @work(group="download-photos")
    async def download_photos(self) -> None:
        """Save every not-yet-saved photo in the loaded window to disk.

        Deliberately not exclusive: the 5s refresh calls this again, and
        cancelling a download in flight would mean a photo bigger than the
        refresh interval never finishes. A plain flag lets the running pass
        continue and makes the extra calls no-ops.
        """
        client = self.app.client
        if client is None or self._downloading:
            return

        pending = [
            msg for msg in reversed(self._messages)
            if _is_photo(msg) and msg.id not in self._saved and msg.id not in self._failed
        ]
        if not pending:
            return

        try:
            self.folder.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self._report(f"cannot create {self.folder}: {e}")
            return

        self._downloading = True
        try:
            for msg in pending:
                target = _photo_path(msg, self.folder)
                # Download to .part and rename, so an interrupted download can
                # never leave a truncated file that looks already-downloaded.
                part = target.with_name(target.name + ".part")
                try:
                    saved = await client.download_media(msg, file=str(part))
                    if not saved:
                        self._failed[msg.id] = "no data returned"
                        continue
                    os.replace(saved, target)
                    self._saved[msg.id] = target
                except asyncio.CancelledError:
                    part.unlink(missing_ok=True)
                    raise
                except Exception as e:
                    self._failed[msg.id] = f"{type(e).__name__}: {e}"
                    part.unlink(missing_ok=True)
                self._redraw()  # show each photo the moment it lands
        finally:
            self._downloading = False

    @staticmethod
    def _message_status(msg, read_max_id: int) -> str:
        """Delivery status of an outgoing message."""
        if not msg.out:
            return ""  # Don't show status for received messages
        if getattr(msg, "schedule_date", None):
            return "🕐 Queued"
        if read_max_id and msg.id <= read_max_id:
            return "✓✓ Seen"
        return "✓ Sent"

    @on(Input.Submitted, "#message-input")
    @on(Button.Pressed, "#send-button")
    def send_message(self, event=None) -> None:
        self.send_msg()

    @work(exclusive=True, group="send")
    async def send_msg(self) -> None:
        client = self.app.client
        input_widget = self.query_one("#message-input", Input)
        message = input_widget.value.strip()

        if not (message and client):
            return
        try:
            await client.send_message(self.entity, message)
            input_widget.value = ""
            input_widget.focus()
            await asyncio.sleep(0.5)
            self.load_messages()
        except Exception as e:
            self.query_one("#chat-title", Label).update(f"Error: {e}")

    def action_back(self) -> None:
        self.app.pop_screen()

    def action_refresh_messages(self) -> None:
        self.load_messages()


class TelegramTUIApp(App):
    """Main Telegram TUI Application."""

    CSS = """
    #status {
        width: 100%;
        height: 100%;
        content-align: center middle;
        text-style: italic;
    }

    #chat-container {
        height: 100%;
        padding: 1;
    }

    #chat-title {
        text-style: bold;
        margin-bottom: 1;
    }

    #messages {
        height: 1fr;
        border: solid green;
        margin-bottom: 1;
        background: $surface;
    }

    #input-container {
        height: auto;
        dock: bottom;
    }

    #message-input {
        width: 1fr;
        margin-right: 1;
    }

    #send-button {
        width: auto;
    }

    #chat-table {
        height: 1fr;
    }

    #loading-label {
        text-align: center;
        padding: 1;
        text-style: italic;
    }

    ConfirmScreen, DeleteChatScreen {
        align: center middle;
        background: $background 60%;
    }

    #dialog {
        width: 64;
        height: auto;
        max-width: 90%;
        padding: 1 2;
        border: thick $error;
        background: $surface;
    }

    #dialog-title {
        text-style: bold;
        width: 100%;
        margin-bottom: 1;
    }

    #dialog-body {
        width: 100%;
        margin-bottom: 1;
    }

    #dialog-buttons {
        height: auto;
        width: 100%;
        align-horizontal: right;
    }

    #dialog-buttons Button {
        margin-left: 1;
    }

    #new-chat-input {
        width: 100%;
        margin-bottom: 1;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, api_id: int, api_hash: str):
        super().__init__()
        self.api_id = api_id
        self.api_hash = api_hash
        self.client: Optional[TelegramClient] = None
        self.entities: dict[str, tuple] = {}

    def compose(self) -> ComposeResult:
        # Without this the base screen is blank while connecting.
        yield Header()
        yield Static("Connecting to Telegram...", id="status")
        yield Footer()

    def on_mount(self) -> None:
        # Textual installs asyncio.eager_task_factory, which runs a new task
        # synchronously up to its first await. Telethon is incompatible with
        # that: MTProtoSender.connect() creates its _send_loop/_recv_loop tasks
        # *before* setting _user_connected = True, so run eagerly both loops see
        # the flag as False, return immediately, and nothing ever pumps the
        # MTProto queues -- connect() then waits forever for its first reply.
        # The same race kills auto-reconnect, so leave the factory off for good.
        asyncio.get_running_loop().set_task_factory(None)
        self.connect_telegram()

    @work(exclusive=True, group="connect")
    async def connect_telegram(self) -> None:
        """Connect to Telegram using the already-authorized session."""
        status = self.query_one("#status", Static)
        try:
            # The client must be created on the loop it will run on (Textual's).
            self.client = TelegramClient(SESSION_NAME, self.api_id, self.api_hash)
            # connect(), not start(): start() prompts on stdin, which Textual owns.
            await self.client.connect()

            if not await self.client.is_user_authorized():
                self.exit(
                    message="Session is not authorized. Quit and run "
                            "`python telegram_tui.py` again to log in."
                )
                return

            self.push_screen(ChatList())
        except Exception as e:
            status.update(f"Failed to connect: {e}")
            self.exit(message=f"Failed to connect: {e}")

    def open_chat(self, key: str) -> None:
        """Open a specific chat by its row key."""
        entry = self.entities.get(key)
        if entry is None:
            return
        entity, chat_name = entry
        self.push_screen(ChatView(entity, chat_name))

    async def on_unmount(self) -> None:
        if self.client is not None:
            await self.client.disconnect()


async def ensure_login(api_id: int, api_hash: str) -> bool:
    """Log in interactively in the plain terminal, before the TUI starts."""
    client = TelegramClient(SESSION_NAME, api_id, api_hash)
    await client.connect()
    try:
        if await client.is_user_authorized():
            return True
        print("First-time login required (Telegram will send you a code).")
        await client.start()  # prompts for phone / code / 2FA password on stdin
        return await client.is_user_authorized()
    finally:
        await client.disconnect()


def main() -> int:
    api_id = int(os.getenv("TELEGRAM_API_ID") or 0)
    api_hash = os.getenv("TELEGRAM_API_HASH") or ""
    if not api_id or not api_hash:
        print("Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file.",
              file=sys.stderr)
        return 1

    try:
        if not asyncio.run(ensure_login(api_id, api_hash)):
            print("Login failed.", file=sys.stderr)
            return 1
    except (KeyboardInterrupt, EOFError):
        print("\nLogin cancelled.", file=sys.stderr)
        return 1

    TelegramTUIApp(api_id, api_hash).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
