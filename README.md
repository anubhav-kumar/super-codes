# Telegram TUI

A Terminal User Interface for Telegram Chat built with Python, Textual, and Telethon.

## Features

- View your chat list (private chats, groups, channels)
- Last-seen presence for each chat in the list
- Start a new chat by @username, t.me link, phone number, or numeric ID
- Delete a chat (for yourself or for both sides) and block a user
- Open any chat and view messages
- Send messages interactively
- Photos are downloaded automatically to a local folder
- Auto-refresh messages every 5 seconds
- Keyboard navigation

## Prerequisites

1. Python 3.8+
2. A Telegram account
3. Telegram API credentials

## Setup

### 1. Get Telegram API Credentials

1. Go to https://my.telegram.org/apps
2. Log in with your phone number
3. Create a new application
4. Note your **API ID** and **API Hash**

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Create a `.env` file in the project directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_api_hash_here
```

### 4. Run the Application

```bash
python telegram_tui.py
```

On first run, you'll be prompted to enter your phone number and verification code in the terminal.

## Usage

### Chat List Screen

Columns: type, name, last seen, last message, and the time of that message
(shown in your local timezone).

The **Last Seen** column reflects what Telegram is willing to tell you:

| Shown | Meaning |
|-------|---------|
| `online` | currently online |
| `22m ago`, `18h ago`, `3d ago`, `19 May` | exact last-seen time |
| `recently`, `within a week`, `within a month` | the contact has last-seen privacy on, so only a coarse bucket is available |
| `bot`, `deleted account` | not a regular user |
| `4210 members` | groups and channels have no presence, so their size is shown |
| `-` | presence not shared at all |

Presence is fetched when the list loads - press `r` to refresh it.

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate chats |
| `Enter` | Open selected chat |
| `r` | Refresh chat list |
| `n` | Start a new chat |
| `d` | Delete the selected chat |
| `b` | Block the selected user |
| `q` | Quit |

#### Starting a new chat (`n`)

Prompts for a target and opens the chat view directly. Accepted forms:

| Input | Notes |
|-------|-------|
| `@username`, `username` | also works for bots and public channels |
| `https://t.me/username`, `t.me/username` | link is unwrapped for you |
| `+919999999999` | spaces, dashes and brackets are ignored; the number must be in your contacts for Telegram to resolve it |
| `6471248658` | a numeric ID only resolves if this session has already seen that account |
| `919999999999` | ambiguous, so it is tried as an ID first and then as a phone number |

Invite links (`t.me/joinchat/...`, `t.me/+hash`) are rejected - joining a private
group is a different operation, not a new chat.

A conversation with no messages has no dialog yet, so **it will not appear in the
chat list until you send something**. That is Telegram's model, not a bug.

#### Deleting a chat (`d`)

Opens a dialog with the scope spelled out. **Cancel is focused**, so pressing
Enter by reflex never destroys anything, and `Esc` always backs out.

| Chat type | For me | For everyone |
|-----------|--------|--------------|
| Private | removes the chat from your account only | also erases it from the other person's account - **irreversible**, and requires a second confirmation |
| Group | leaves the group and deletes your copy of the history | leaves and erases the history for every member |
| Channel | leaves the channel (the channel itself is untouched) | not offered - the button is hidden |

#### Blocking (`b`)

Asks for confirmation, then blocks the selected user: they can no longer message
or call you. It does **not** delete the chat, and it only applies to users -
selecting a group or channel says so instead. Unblock from any Telegram client.

### Chat View Screen

Opening a chat marks its messages as read (`send_read_acknowledge`), the same as
any Telegram client - so `check_new_message.py` stops reporting them. This sends
a read receipt, meaning the sender sees your messages as "seen".

| Key | Action |
|-----|--------|
| `Esc` | Go back to chat list |
| `r` | Refresh messages |
| `Enter` | Send message |
| `q` | Quit |

## Files

- `telegram_tui.py` - Main application
- `check_new_message.py` - Unread-message checker (no TUI)
- `media/` - Photos downloaded from chats (git-ignored)
- `requirements.txt` - Python dependencies
- `.env.example` - Example environment configuration
- `telegram_session` - Session file (created after first login)

## Checking for new messages

A standalone checker, no TUI involved:

```bash
python check_new_message.py            # chats with unread messages
python check_new_message.py --all      # every chat, unread first
python check_new_message.py --json     # machine-readable
python check_new_message.py --limit 20 # check fewer chats
```

Output is one line per chat: unread count, `@` if you were mentioned, chat name,
age of the last message, and a preview.

It reuses the session from `telegram_tui.py` and never prompts, so it is safe in
cron or a pipeline. Exit codes: **0** unread found, **1** nothing new, **2** error.

```bash
python check_new_message.py >/dev/null && echo "you have messages"
```

Listing chats does not mark anything as read - only opening a chat in the TUI
does that.

## Photos

Opening a chat saves every photo in the loaded history (last 50 messages) to:

```
media/<chat name>_<chat id>/<message id>.jpg
```

Each photo appears in the chat log as `🖼 media/...` once written. Details:

- Both compressed photos and images sent as uncompressed files are saved; stickers
  and non-image attachments are skipped.
- Files already on disk are never re-downloaded, including across restarts.
- Downloads land on a `.part` file and are renamed only when complete, so an
  interrupted download can't leave a truncated file behind.
- Set `TELEGRAM_MEDIA_DIR` to save somewhere other than `media/`.

## Notes

- The session file `telegram_session.session` is created after your first successful login
- The first run asks for your phone number and login code in the plain terminal,
  before the TUI starts - Telethon reads them from stdin, which Textual takes over
- Messages auto-refresh every 5 seconds when viewing a chat
- Non-photo attachments are shown as a placeholder such as `<MessageMediaDocument>`
