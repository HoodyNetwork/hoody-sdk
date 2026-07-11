# `hoody chat` — CLI Reference

`hoody chat` is a built-in, deliberately-minimal AI assistant for the Hoody
CLI. It knows the full CLI surface and the Hoody platform concepts, answers
general tech questions when asked, and has exactly **one read-only tool**
(`hoody_docs_search`) that queries the official Hoody docs.

For full-featured agentic AI (file reads, shell execution, multi-tool
orchestration), use [`hoody agent`](../CLI-COMMANDS.md) — `hoody chat` is
intentionally non-agentic.

> **Privacy:** no session transcripts are written by default; transcript
> persistence is opt-in via `--persist` (REPL-only). Non-private runs may still
> create `~/.hoody/chats/`, and the first interactive REPL writes
> `~/.hoody/chats/.seen-privacy-banner`. Use `--private` or
> `HOODY_CHAT_PRIVATE=1` for no chat disk reads/writes. See
> [chat-privacy.md](./chat-privacy.md).

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
| `--model <id>` | tier default | Override the model identifier |
| `--no-stream` | off | Buffer the full response, print once (uses provider's non-streaming endpoint) — NOTE: disables model-initiated `hoody_docs_search` tool calls (they require streaming mode) and prints a one-line stderr notice; the client-side `@hoody.com` pre-fetch still works |
| `--no-markdown` | off | Raw text output (auto when non-TTY unless `FORCE_COLOR` is set, or when `NO_COLOR` is set to any value) |
| `--persist` | off | REPL-only: enable session persistence (writes JSONL under `~/.hoody/chats/`); one-shot prompt invocations are not written to JSONL |
| `--new` | off | Force a fresh session (overrides `--resume`) |
| `--resume [id]` | off | Resume latest (no arg) or specific session (requires `--persist`) |
| `--private` | off | Disable ALL disk writes AND reads for this process |
| `--no-tools` | off | Disable `hoody_docs_search` tool (also via `HOODY_CHAT_DOCS_TOOL=0`) |
| `--context <text>` | — | Prepended to the **first** user message as untrusted data (capped 1000 chars) |
| `--accept-endpoint <origin>` | — | Accept a non-allowlisted provider/docs origin (persisted) |
| `--max-tokens <n>` | `1024` | Response token cap (1–128000) |
| `--temperature <f>` | `0.3` | Sampling temperature (0–2) |

## REPL slash commands

When no prompt is passed and stdin is interactive, `hoody chat` enters a REPL.
Inside, these slash commands are available:

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
| `/private` | Toggle private mode for the rest of this REPL |
| `/tool on\|off` | Enable/disable `hoody_docs_search` tool for this REPL |
| `/retry` | Drop the last assistant reply and re-send the last user message (refused while a turn is in flight) |

## `@hoody.com` trigger

Typing `@hoody.com` anywhere in a user message triggers a client-side
pre-fetch against `chatbot.hoody.com`. The result is injected into your
message as untrusted reference data for the LLM to ground against. Examples:

```
> @hoody.com what is a realm?
> How do I create a branch @hoody.com
```

The trigger does **not** fire:
- Inside fenced code blocks (` ``` `, `~~~`)
- Inside inline backticks
- In 4-space or tab-indented code blocks
- When preceded by a word character (so `foo@hoody.com` — an email — does not trigger)
- On Unicode homograph lookalikes (e.g. Cyrillic `а@hoody.com`)

If the stripped query is shorter than 8 characters, the trigger is skipped
and the LLM answers from its own knowledge. In one-shot mode this prints a
one-line stderr notice; in the REPL the pre-fetch is skipped silently.

## The single tool — `hoody_docs_search`

The LLM has exactly one tool. It's read-only, backed by a single HTTPS
endpoint (`https://chatbot.hoody.com/api/chat` by default), and disableable
with `--no-tools`, `HOODY_CHAT_DOCS_TOOL=0`, or the REPL `/tool off` slash.

**Endpoint acceptance gate.** If you override `HOODY_CHAT_DOCS_URL` to a
non-allowlisted origin, the tool refuses to run until you pass
`--accept-endpoint <origin>` or set `HOODY_CHAT_ACCEPT_ENDPOINT`. (TTY
prompting is available for the LLM provider URL at session start; docs-tool
overrides require the flag or env to avoid interleaving a confirmation with
an in-flight LLM turn.) Accepted origins are persisted to
`~/.hoody/chats/chat-accept.json` (mode `0o600`).

Built-in allowlist: `chatbot.hoody.com`, `ai.hoody.com`, `api.minimax.io`,
plus localhost/RFC1918 (no prompt for local endpoints).

**Rate limiting.** Client-side rolling 1-hour window, default 20 requests,
tunable via `HOODY_CHAT_DOCS_RATE_LIMIT`. Shared between the `@hoody.com`
trigger path and any model-initiated tool calls.

**One tool call per turn.** The `MAX_TOOL_CALLS_PER_TURN = 1` invariant is
hard-enforced client-side — a model that tries to call the tool twice in
the same turn gets a synthetic refusal response and must answer from
whatever it already has.

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

Capped at `HOODY_CHAT_MAX_SESSIONS` (default **50**). On session creation,
the oldest sessions beyond the cap are deleted. Retention order is by
`createdAt` (ISO timestamp in the meta line), independent of filesystem
mtime granularity.

### Title redaction

The session title is derived from the first user message and is passed
through the same secret-detection patterns as turn content. Pre-existing
sessions from older builds are additionally re-redacted at READ time
(by `sessions list` / `sessions show`) as defense in depth.

## Delete confirmation asymmetry (scripted vs interactive)

Destructive "delete everything" has two confirmation shapes depending on
which surface you use:

- **Scripted (`hoody chat sessions delete --all`)** requires `-y` on the
  command line. Single-shot intent declaration — appropriate for automation.
  Running `--all` without `-y` refuses with exit code 1.
- **REPL (`/wipe`)** requires typing the literal word **`yes`** in full.
  Single-keystroke `y` is ignored. Prevents fat-fingered destruction when
  the user is already typing freely. In private mode `/wipe` is disabled
  outright (private mode's "no disk reads/writes" contract forbids even
  the `unlink` side effects).

Individual deletes (`sessions delete <id>` or `/delete <id>`) do NOT require
confirmation — the `-y` / typed-yes guard is scoped to the
"delete everything" semantics.

## Provider configuration

Three atomic env tiers, resolved per-tier (no cross-tier fallback). See
[CLI_AUTHENTICATION.md](../../../cli/CLI_AUTHENTICATION.md) for the full matrix.

### Tier 1 — `HOODY_CHAT_*` (Hoody chat-dedicated, default MiniMax)

```bash
HOODY_CHAT_KEY=sk-…
HOODY_CHAT_URL=https://api.minimax.io/v1   # default
HOODY_CHAT_MODEL=MiniMax-M2.7-highspeed     # default
```

### Tier 2 — `HOODY_CLI_AI_*` (shared with `ai-fix` typo corrector)

```bash
HOODY_CLI_AI_KEY=…
HOODY_CLI_AI_URL=https://ai.hoody.com/api/v1   # default
HOODY_CLI_AI_MODEL=openai/gpt-5.4-nano          # default
```

### Tier 3 — `OPENAI_*` (OpenAI / OpenAI-compatible, last resort)

Requires `OPENAI_BASE_URL` + `OPENAI_MODEL` explicit — no default endpoint assumption, so a stray
`OPENAI_API_KEY` in your shell can't silently leak to a surprise provider.

```bash
OPENAI_API_KEY=sk-…
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### All env vars

```
HOODY_CHAT_KEY / _URL / _MODEL                (Tier 1 triplet)
HOODY_CLI_AI_KEY / _URL / _MODEL              (Tier 2 triplet)
OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL  (Tier 3; URL+model required, key only for non-local)

HOODY_CHAT_PRIVATE=0                          # 1 = force private mode always
HOODY_CHAT_MAX_HISTORY=10                     # turns replayed (0 = disable memory)
HOODY_CHAT_HELP_HINT=1                        # 0 = suppress "AI mode" help footer
HOODY_CHAT_MAX_SESSIONS=50
HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS=        # colon-separated regex (paste-safety)

HOODY_CHAT_DOCS_TOOL=1                        # 1 = enable hoody_docs_search; 0 = disable
HOODY_CHAT_DOCS_URL=https://chatbot.hoody.com/api/chat   # override via --accept-endpoint gate
HOODY_CHAT_DOCS_MAX_RESULT_BYTES=16384
HOODY_CHAT_DOCS_TIMEOUT_MS=30000
HOODY_CHAT_DOCS_RATE_LIMIT=20                 # docs-tool requests/hour client-side

HOODY_CHAT_ACCEPT_ENDPOINT=<origin>           # accept a non-allowlisted LLM/docs origin
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Runtime error (HTTP failure, unknown session, `--private` + `--persist` conflict, etc.) |
| `2` | No provider configured (no key in any tier) OR LLM provider endpoint not accepted |
| `64` | Usage error (invalid `--max-tokens`, `--temperature`, etc.) |

## Examples

```bash
# Ask a CLI question:
hoody chat "how do I create a container with a specific image?"

# Get docs-grounded answer:
hoody chat "@hoody.com how do realms interact with subdomains?"

# Pipe to a file, clean text:
hoody chat --no-markdown "give me 3 hoody agent tips" > tips.md

# REPL with persistence on:
hoody chat --persist

# Resume most recent session:
hoody chat --persist --resume

# List, show, delete sessions:
hoody chat sessions list
hoody chat sessions show a1b2c3d4
hoody chat sessions delete a1b2c3d4
hoody chat sessions delete --all -y

# Use local Ollama / LM Studio / etc:
HOODY_CHAT_URL=http://localhost:11434/v1 \
HOODY_CHAT_MODEL=llama3 \
  hoody chat "say hi"

# Disable the docs tool entirely:
HOODY_CHAT_DOCS_TOOL=0 hoody chat "..."
# or
hoody chat --no-tools "..."
```

## Related

- [`hoody agent`](../CLI-COMMANDS.md) — full agentic AI for file edits, command execution, workspaces
- [Chat privacy model](./chat-privacy.md) — data retention, private mode, redaction, residual risks
- [CLI authentication](../../../cli/CLI_AUTHENTICATION.md) — all auth methods including chat provider tiers
