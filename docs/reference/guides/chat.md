# `hoody chat` — CLI Reference

`hoody chat` asks Hoody about Hoody, from your terminal. It is **free** and needs
**no configuration**: no API key, no model to pick, no account. Your question
goes to Hoody's documentation assistant and the answer streams back.

```bash
hoody chat "how do I create a container with a specific image?"
```

That is the whole setup. There is nothing to export first.

## Scope

It answers questions about Hoody — the platform, the CLI, the SDK, the API, and
the surrounding infrastructure / HTTP / AI / security concepts — plus any
software or code meant to run in, deploy to, or call a Hoody container.

Requests with no Hoody connection at all (trivia, world knowledge, homework, a
generic algorithm that never touches Hoody) are declined in one line. This is the
same scope the documentation assistant on the docs site applies, because it is
the same assistant: `hoody chat` is a terminal front-end for it, so both surfaces
answer the same set of questions the same way.

For agentic AI — reading files, running commands, editing code — use
[`hoody agent`](../CLI-COMMANDS.md). `hoody chat` is intentionally non-agentic:
it produces text and nothing else. It cannot read your files, run commands, or
reach your container.

> **Privacy:** no transcripts are written by default; persistence is opt-in via
> `--persist` (REPL-only). Your question and the conversation history are sent to
> Hoody's assistant to answer it. See [chat-privacy.md](./chat-privacy.md).

## Command surface

```
hoody chat [prompt...]                       # one-shot OR REPL (if no prompt)
hoody chatbot [prompt...]                    # alias for `hoody chat`
hoody ai chat [prompt...]                    # identical, discoverable under `hoody ai`
hoody ai chatbot [prompt...]                 # alias

hoody chat sessions list                     # (alias: ls)
hoody chat sessions show <id>                # supports 8-hex id prefix match
hoody chat sessions delete [id]              # (aliases: rm, remove)
hoody chat sessions delete --all -y          # wipe all; requires -y
```

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--no-stream` | off | Buffer the answer and print it once instead of streaming |
| `--no-markdown` | off | Raw text output (auto when non-TTY unless `FORCE_COLOR` is set, or when `NO_COLOR` is set to any value) |
| `--persist` | off | REPL-only: enable session persistence (writes JSONL under `~/.hoody/chats/`); one-shot invocations are not written |
| `--new` | off | Force a fresh session (overrides `--resume`) |
| `--resume [id]` | off | Resume latest (no arg) or specific session (requires `--persist`) |
| `--private` | off | Disable ALL disk writes AND reads for this process |
| `--accept-endpoint <origin>` | — | Accept a non-allowlisted service origin (persisted) |

There is deliberately **no** `--model`, `--max-tokens`, `--temperature`, or
provider selection. There is one assistant, run by Hoody, and it is not
configurable from the client.

## REPL slash commands

When no prompt is passed and stdin is interactive, `hoody chat` enters a REPL.

| Slash | Behavior |
|---|---|
| `/help` | Print the slash-command table |
| `/exit`, `/quit` | Exit cleanly |
| `/clear` | Clear screen (keeps current session) |
| `/new` | Start a fresh session in-place |
| `/history` | Print the current transcript |
| `/sessions` | List persistent sessions |
| `/load <id>` | Switch REPL to that session's history |
| `/save` | Promote the current ephemeral session → persistent file |
| `/delete [id]` | Delete session; no arg deletes current + auto-`/new` |
| `/wipe` | Delete **all** persistent sessions; requires typing `yes` in full; disabled in private mode |
| `/private` | Turn private mode on for the rest of this REPL. **One-way** — it can never be turned back off, because the turns taken while it was on would become writable again. Restart `hoody chat` for a non-private session |
| `/retry` | Drop the last assistant reply and re-send the last user message |

Ctrl-C once interrupts an in-flight answer, or asks for confirmation when idle;
Ctrl-C twice exits.

## Follow-up questions

The REPL replays recent turns so follow-ups resolve:

```
hoody> What is a realm?
A realm is a 24-hex identifier that scopes what an API token can see…

hoody> Can a token belong to more than one of them?
Yes — a token's `realm_ids` array can list more than one realm…
```

How many turns are replayed is capped by `HOODY_CHAT_MAX_HISTORY` (default 10
exchanges; `0` disables memory entirely) and again by the service's own cap of
20 turns.

## Citations

The assistant grounds its answers in the Hoody documentation and reports which
pages it used. Those arrive as site-relative paths and are rendered as links to
the docs site:

```
Sources:
- [Container Images](https://docs.hoody.com/foundation/containers/images)
- [Create, Edit, Delete](https://docs.hoody.com/foundation/containers/create-edit-delete)
```

Citations are display-only: they are not replayed as conversation history, so
the assistant is never shown a hand-written source list to imitate.

## Limits

`hoody chat` is free and unauthenticated, so the service is metered. The client
enforces the same numbers locally to fail fast rather than spend a request:

| Limit | Value |
|---|---|
| Requests per hour | **30** per IP |
| Question length | **2000** characters |
| Conversation history | **20** turns |
| Service-wide daily cap | answered with "at capacity"; try again later |

Hitting the hourly limit prints a message and exits 1; it is not an error in
your setup.

## Sessions

### File format

Persistent sessions live under `~/.hoody/chats/`, one JSONL file per session:

```
~/.hoody/chats/YYYYMMDD-HHMMSS-<8-hex>.jsonl
```

First line is a metadata header; subsequent lines are per-turn records.

### List output format

`hoody chat sessions list` prints pipe-friendly TSV when stdout is not a TTY
(suitable for `awk`, `cut`, scripts). When stdout IS a TTY, a header row is
also printed for human readability.

```
# Example non-TTY output (4 tab-separated columns: ID, UPDATED-UTC, TURNS, TITLE)
a1b2c3d4	2026-04-20T10:15:42Z	   6  	how do I list containers on a specific server?
e5f6a7b8	2026-04-19T22:08:11Z	   2  	what is a realm?
```

### Retention

Capped at `HOODY_CHAT_MAX_SESSIONS` (default **50**). On session creation, the
oldest sessions beyond the cap are deleted. Retention order is by `createdAt`
(ISO timestamp in the meta line), independent of filesystem mtime granularity.

### Title redaction

The session title is derived from the first user message and is passed through
secret-detection patterns before it is written. Titles are re-redacted at READ
time too (by `sessions list` / `sessions show`), so a file that reaches disk by
any other route still cannot print a secret.

## Delete confirmation asymmetry (scripted vs interactive)

- **Scripted (`hoody chat sessions delete --all`)** requires `-y` on the command
  line. Running `--all` without `-y` refuses with exit code 1.
- **REPL (`/wipe`)** requires typing the literal word **`yes`** in full.
  Single-keystroke `y` is ignored. In private mode `/wipe` is disabled outright
  (private mode's "no disk reads/writes" contract forbids even the `unlink`).

Individual deletes (`sessions delete <id>` or `/delete <id>`) do NOT require
confirmation — the guard is scoped to "delete everything" semantics.

Under `HOODY_CHAT_PRIVATE=1` the `sessions` subcommands refuse outright and exit
1: `list`, `show`, and `delete` all read or write chat files, which that setting
forbids for the whole process.

## Endpoint acceptance

`hoody chat` talks to one origin: `https://chatbot.hoody.com`. Overriding
`HOODY_CHAT_URL` to anything not on the built-in allowlist requires explicit
authorization via `--accept-endpoint <origin>` or `HOODY_CHAT_ACCEPT_ENDPOINT`.
Accepted origins are persisted to `~/.hoody/chats/chat-accept.json` (mode
`0o600`).

Built-in allowlist: `chatbot.hoody.com`, plus localhost/RFC1918 (no prompt for
local endpoints, so you can point at your own instance while developing).

## Environment variables

```
HOODY_CHAT_PRIVATE=1                          # force private mode always
HOODY_CHAT_MAX_HISTORY=10                     # exchanges replayed (0 = disable memory)
HOODY_CHAT_MAX_SESSIONS=50                    # session retention cap
HOODY_CHAT_HELP_HINT=0                        # suppress the help footer hint
HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS=        # colon-separated regex (paste-safety)

HOODY_CHAT_URL=https://chatbot.hoody.com/api/chat   # override; gated by --accept-endpoint
HOODY_CHAT_ACCEPT_ENDPOINT=<origin>           # accept a non-allowlisted origin
HOODY_CHAT_RATE_LIMIT=30                      # client-side requests/hour
HOODY_CHAT_TIMEOUT_MS=120000                  # total request timeout
HOODY_CHAT_MAX_RESULT_BYTES=16384             # answer size cap
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Runtime error (service unreachable, rate-limited, unknown session, `--private` + `--persist` conflict) |
| `2` | Service endpoint not accepted |

## Examples

```bash
# Ask a question:
hoody chat "how do I create a container with a specific image?"

# Clean text for piping:
hoody chat --no-markdown "give me 3 hoody agent tips" > tips.md

# Interactive, with follow-ups:
hoody chat

# REPL with persistence on, then resume it later:
hoody chat --persist
hoody chat --persist --resume

# Leave nothing on disk:
hoody chat --private "what is a realm?"

# List, show, delete sessions:
hoody chat sessions list
hoody chat sessions show a1b2c3d4
hoody chat sessions delete --all -y
```

## Related

- [`hoody agent`](../CLI-COMMANDS.md) — full agentic AI for file edits, command execution, workspaces
- [Chat privacy model](./chat-privacy.md) — what leaves your machine, retention, redaction
