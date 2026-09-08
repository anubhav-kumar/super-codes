#!/usr/bin/env python3
"""
Check for unread Telegram messages.

    python check_new_message.py            # chats with unread messages
    python check_new_message.py --all      # every chat, unread first
    python check_new_message.py --json     # machine-readable output

Reads the session created by telegram_tui.py and never prompts: if the session
is missing or expired it says so and exits, so this is safe to run from cron or
a shell pipeline. Listing chats does not mark anything as read.

Exit codes: 0 = unread messages found, 1 = nothing new, 2 = error.
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

from telethon import TelegramClient

# Session name kept in step with telegram_tui.py by hand, so this script needs
# only telethon. Resolved against the script's directory, not the working
# directory, so it can be run from anywhere (cron included).
SESSION_NAME = str(BASE_DIR / "telegram_session")


# Service messages carry an action instead of text; these are the readable names.
_ACTIONS = {
    "ContactSignUp": "joined Telegram",
    "ChatAddUser": "added to the chat",
    "ChatDeleteUser": "left the chat",
    "PinMessage": "pinned a message",
    "HistoryClear": "cleared the history",
}


def _preview(msg, width: int = 60) -> str:
    """Short one-line summary of a message."""
    if msg is None:
        return "<no messages>"
    if msg.text:
        text = " ".join(msg.text.split())  # collapse newlines
        return text[:width] + ("..." if len(text) > width else "")
    if msg.action is not None:
        name = type(msg.action).__name__.removeprefix("MessageAction")
        spaced = re.sub(r"(?<!^)(?=[A-Z])", " ", name).lower()
        return f"• {_ACTIONS.get(name, spaced)}"
    if msg.photo is not None:
        return "🖼 Photo"
    if msg.sticker is not None:
        return "🎨 Sticker"
    if msg.voice is not None:
        return "🎤 Voice message"
    if msg.video is not None:
        return "🎬 Video"
    if msg.document is not None:
        name = getattr(msg.file, "name", None) or "file"
        return f"📎 {name}"
    if msg.media is not None:
        return f"<{type(msg.media).__name__}>"
    return ""


def _age(when: datetime) -> str:
    """Compact 'how long ago', e.g. 3m / 5h / 2d."""
    if when is None:
        return "?"
    seconds = (datetime.now(timezone.utc) - when).total_seconds()
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h"
    return f"{int(seconds // 86400)}d"


async def collect(limit: int) -> list[dict]:
    api_id = int(os.getenv("TELEGRAM_API_ID") or 0)
    api_hash = os.getenv("TELEGRAM_API_HASH") or ""
    if not api_id or not api_hash:
        raise SystemExit("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file.")

    client = TelegramClient(SESSION_NAME, api_id, api_hash)
    # connect(), not start(): start() would prompt for a phone number.
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise SystemExit(
                f"No authorized session ({SESSION_NAME}.session). "
                "Run `python telegram_tui.py` once to log in."
            )

        chats = []
        for dialog in await client.get_dialogs(limit=limit):
            msg = dialog.message
            chats.append({
                "name": dialog.name or str(dialog.entity.id),
                "id": dialog.entity.id,
                "unread": dialog.unread_count,
                "mentions": dialog.unread_mentions_count,
                "last_message": _preview(msg),
                "from_me": bool(msg and msg.out),
                "date": msg.date.isoformat() if msg and msg.date else None,
                "age": _age(msg.date) if msg and msg.date else "?",
            })
        return chats
    finally:
        await client.disconnect()


def report(chats: list[dict], show_all: bool) -> int:
    unread = [c for c in chats if c["unread"]]

    # Newest first, then (for --all) float unread chats to the top. Two stable
    # sorts, because the two keys run in opposite directions.
    rows = sorted(chats if show_all else unread,
                  key=lambda c: c["date"] or "", reverse=True)
    if show_all:
        rows.sort(key=lambda c: -c["unread"])

    if not rows:
        print("No new messages." if not show_all else "No chats found.")
        return 1 if not unread else 0

    total = sum(c["unread"] for c in unread)
    if unread:
        print(f"{total} new message(s) in {len(unread)} chat(s):\n")
    else:
        print("No new messages. Recent chats:\n")

    width = min(max((len(c["name"]) for c in rows), default=4), 28)
    for c in rows:
        count = f"{c['unread']:>3}" if c["unread"] else "  ."
        flag = " @" if c["mentions"] else "  "
        prefix = "you: " if c["from_me"] else ""
        print(f"{count}{flag} {c['name'][:width]:<{width}} {c['age']:>4} ago  {prefix}{c['last_message']}")

    return 0 if unread else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Check for unread Telegram messages.")
    parser.add_argument("--all", action="store_true", help="show every chat, not just unread ones")
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    parser.add_argument("--limit", type=int, default=50, help="how many chats to check (default: 50)")
    args = parser.parse_args()

    try:
        chats = asyncio.run(collect(args.limit))
    except SystemExit as e:
        print(e, file=sys.stderr)
        return 2
    except Exception as e:
        print(f"{type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if args.json:
        selected = chats if args.all else [c for c in chats if c["unread"]]
        print(json.dumps(selected, indent=2, ensure_ascii=False))
        return 0 if any(c["unread"] for c in chats) else 1

    return report(chats, args.all)


if __name__ == "__main__":
    raise SystemExit(main())
