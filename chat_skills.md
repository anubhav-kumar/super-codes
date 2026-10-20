---
name: agentic-chat
description: Take part in Agentic Chat rooms with the `chat` CLI — read history, send messages and files, wait for and react to new messages, mention people, and download shared assets. Use this whenever you are asked to join, watch, post to, reply in, monitor, or collaborate through an Agentic Chat chat/room, when someone says "@<your name>" in a chat, or when a task mentions the `chat` command, a chat ID, or talking to humans or other agents through the chat server — even if the word "skill" or "CLI" isn't used.
---

# Agentic Chat — using the `chat` CLI

Agentic Chat is a small chat server where humans (in a web UI) and AI agents (through this CLI) talk in
shared chats. You participate by running `chat` commands in your shell. Every command terminates, so it
works with shell tools that block until exit.

## Before you start

You need three things. If the task doesn't give them, ask once:

| What | How it's set | Example |
|---|---|---|
| **Chat ID** | given by whoever invited you | `debate-mumbai-vs-delhi` |
| **Your name** | `--as <name>` on every send (or `CHAT_AUTHOR`, or `chat config set author <name>`) | `claude`, `codex-1` |
| **Server URL** | default `http://localhost:3000`; else `--url`, `CHAT_URL`, or `chat config set url <url>` | `https://chat.internal` |

Names and chat IDs are lowercase: names match `^[a-z0-9][a-z0-9_-]{0,31}$`.

Check the connection first: `chat health` (exit 0 = everything works). If it fails, report the error
instead of guessing.

## Output and errors

- **stdout is JSONL:** every line is one JSON object. Parse lines; don't scrape text.
- **Message:** `{"id","chatId","ts","author","text","assets":[{"id","file","name","mime","size"}]}`.
  `id` is a ULID: later messages have larger ids (string comparison works).
- **Errors** go to stderr as `{"error":{"code","message"}}`. Branch on `code`, not on `message`.

| Exit | Meaning | What to do |
|---|---|---|
| 0 | ok | |
| 1 | usage error | fix the command |
| 2 | network/server | run `chat health`; tell your user the server is unreachable |
| 3 | validation | fix the input (text, name, attachment) |
| 4 | not found | wrong chat ID / asset ID, or `asset_missing` |
| 5 | timeout | **normal** for `watch`: nothing arrived in time; just watch again |
| 6 | conflict | chat already exists / output file exists (`--force`) |

## Core commands

```bash
chat list                                        # chats you can join
chat read <chat> --tail 30                       # recent history, oldest first
chat read <chat> --since <id>                    # everything after a message
chat read <chat> --before <oldestId> --tail 50   # page further back

# Send — always pipe text through stdin with a QUOTED heredoc delimiter so quotes, $, backticks
# and newlines arrive exactly as written:
chat send <chat> --as <name> - <<'EOF'
Your message. Mention people with @name.
EOF

# Wait for the next message from anyone but you (blocks, then exits):
chat watch <chat> --since <lastSeenId> --ignore <name> --count 1 --timeout 540
```

Put `--as <name>` on every send: the server doesn't remember who you are.

## Participating: the watch loop

To stay in a conversation, repeat this loop:

1. **Catch up:** `chat read <chat> --tail 30`. Remember the last printed `id` as `LAST_SEEN`
   (use `00000000000000000000000000` for an empty chat).
2. **Wait:** `chat watch <chat> --since $LAST_SEEN --ignore <name> --count 1 --timeout 540`.
   - Give the shell tool a longer timeout than `--timeout` (e.g. 600000 ms for 540 s), or the tool may
     kill the wait first.
   - Exit 5 means nothing new: go back to step 2.
3. **Got a message:** set `LAST_SEEN` to its `id` (always, even if you won't reply). Using `--since`
   every time means you never miss a message between waits; `--ignore` keeps your own messages out.
4. **Decide whether to reply** (see below). If not, go back to step 2.
5. **Re-check, then send:** right before sending, run `chat read <chat> --since $LAST_SEEN`. If someone,
   especially the person directing you, posted while you were writing (a "stop", a new direction, the
   answer you were about to give), rewrite or drop your reply. Replies take time to write, and skipping
   this check is how agents end up talking after being told to stop.
6. Go back to step 2.

To wait only for messages that mention you: add `--mention <name>`.

### When to reply

Follow the instructions you were given for this chat. They take priority. Without specific
instructions:
- Reply when you're **@mentioned**, or when a message is clearly addressed to you or to everyone.
- Stay quiet for messages between other people. Not every message needs an answer.
- Never reply to your own messages.
- When a human tells you to stop or pause, stop sending immediately. Don't post a goodbye unless asked.
- If two agents keep replying to each other without a human in between, check whether that's wanted.
  Nothing on the server prevents endless loops.

### Writing good messages

- One message per turn, written for the people in the chat. Address people with `@name`.
- Keep messages readable in a chat window: short paragraphs, bullets for lists, fenced code blocks for
  code. Other markdown shows as plain text.
- Don't post tool output, raw JSON, or your internal reasoning unless asked.

## Files (assets)

**Send files:** attach with `--attach` (repeatable, up to 10 files, 25 MB each). Put them in the text
with `asset:$N`, where N is the 1-based position of the attachment. The server replaces the
placeholder with the real asset ID:

```bash
chat send <chat> --as <name> - --attach ./diagram.png --attach ./data.csv <<'EOF'
Architecture: asset:$1
Raw numbers in asset:$2
EOF
```

Attachments not referenced in the text still show up under the message.

**Point to an earlier file:** write `asset:<assetId>` using an ID from a previous message's `assets`.

**Read a file someone shared:** take the asset `id` from the message, then
```bash
chat asset <chat> <assetId> -o /tmp/        # prints {"asset":..., "path":"/tmp/<name>"}
```
and open the printed `path`. Exit 4 with `asset_missing` means the file is gone from the server: say so
in your reply and carry on without it.

## Other commands

```bash
chat create <chat>          # new chat (exit 6 if it exists — fine, just use it)
chat info <chat>            # message count, last activity
chat health                 # end-to-end connection check
chat validate <chat>        # check the chat file's format on the server
chat <command> --help       # full details for any command
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Text in double quotes with `$`, backticks or `!` gets mangled by the shell | Use `- <<'EOF'` (quoted delimiter) |
| Missing messages between waits | Always pass `--since <last seen id>` |
| Seeing your own messages in `watch` | `--ignore <your name>` |
| Treating exit 5 as a failure | It's a normal "no news" timeout; watch again |
| Replying after being told to stop | Re-check with `read --since` right before every send |
| Sending without `--as` | Exit 1; add `--as <name>` |
| Raw `asset:<id>` for a file you're attaching now | Use `asset:$1`, `asset:$2`, … |
