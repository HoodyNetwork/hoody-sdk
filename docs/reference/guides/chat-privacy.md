# `hoody chat` — Privacy Model

This document is the load-bearing reference for exactly what `hoody chat`
does and does not write to disk, what leaves your machine, and how to
disable each path.

## Defaults: nothing persists

By default, `hoody chat` is **ephemeral**:

| Path | Default | Enable with |
|---|---|---|
| Session transcripts (JSONL) | off (in-memory only) | `--persist` (REPL-only) |
| Endpoint-acceptance file | written **only** when you accept a non-allowlisted origin | `--accept-endpoint` flag, `HOODY_CHAT_ACCEPT_ENDPOINT` env, or a TTY prompt shown at session start for the LLM provider URL (docs-tool overrides require flag/env) |
| First-run banner marker | zero-byte file after first interactive run | automatic |

A user who runs `hoody chat "some question"` and never sets `--persist`
leaves **zero chat bytes on disk**. The only file that might appear is
`~/.hoody/chats/.seen-privacy-banner` (empty) after the first interactive
REPL.

There is no separate REPL readline-history file and no `HOODY_CHAT_DEBUG`
debug-log path wired into the chat runtime — `--persist` writes session JSONL
transcripts only.

## The three private-mode scopes

`hoody chat` offers three overlapping knobs for "no disk":

| Scope | Flag / command / env | Precedence |
|---|---|---|
| This REPL only (mid-session) | `/private` slash command | REPL-scoped |
| This invocation only | `--private` flag | process-scoped |
| Every invocation (shell rc) | `HOODY_CHAT_PRIVATE=1` | process-scoped |

`--private` and `HOODY_CHAT_PRIVATE=1` prevent any file under
`~/.hoody/chats/` from being **created, modified, OR read** by this process
from startup — refusing reads too keeps it from being half-private. `/private`
only disables subsequent reads/writes after it is toggled mid-REPL; anything
already done before the toggle (e.g. the `.seen-privacy-banner` marker) may
already have hit disk, so the three knobs are not exactly equivalent.

`--private` + `--persist` exits with code `1` and a diagnostic — we fail
loudly rather than silently picking one. (REPL-mode only; `--persist` has
no effect on one-shot invocations regardless of `--private`.)

## What goes over the network

| Destination | When | What |
|---|---|---|
| Provider LLM endpoint | Every chat turn | System prompt + user message + message history |
| `chatbot.hoody.com/api/chat` | On `@hoody.com` trigger OR when the LLM calls `hoody_docs_search` | For `@hoody.com`, the stripped user query text verbatim; for model tool calls, the model-provided query (which may be paraphrased) |

The docs-chatbot service is separate from the LLM provider. A compromised or
jailbroken LLM can't redirect the docs tool — the tool's target URL is gated
by the endpoint-acceptance system.

`hoody_docs_search` sends **no auth header** and no container / account
identifiers. Just the query text.

## Redaction

Any content written to disk (session JSONL body, session titles) is passed
through a redaction pass **before** hitting disk. In-memory API history keeps
raw text so the LLM still sees what you actually typed.

### Secret patterns detected

The pattern set is copied byte-for-byte from the Hoody chatbot server's
`chat-handler.ts` so local-redaction matches the service's own detection.
The set currently covers:

- Hoody tokens (`hdy_…`)
- OpenAI-style keys (`sk-…`)
- Bearer tokens (`Bearer …`)
- 2-part JWTs (`eyJ…` segments)
- Raw hex blobs (≥ 65 hex chars — catches SHA-512, raw keys, etc.)
- GitHub tokens (`ghp_…`, `gho_…`, `github_pat_…`)
- GitLab (`glpat-…`)
- AWS access keys (`AKIA…`) and STS temporary session credentials (`ASIA…`)
- Slack (`xox[bpras]-…`)

Matches are replaced with `<REDACTED>`. Parity with the upstream set is
locked by a CI unit test that reads the upstream file at test time.

### CLI flag values

Values following any of a broad set of credential-bearing flags (e.g.
`--token`/`-t`, `--password`/`-p`, `--username`/`-u`, `--api-key`,
`--api-secret`, `--private-key`, `--secret-access-key`, `--session-token`,
`--bearer-token`, `--auth-token`, `--client-secret`, `--ssh-password`,
`--ssh-key`, `--db-password`, `--proxy-password`, `--passphrase`, …) in
written content are also replaced with `<REDACTED>` (the full list is
`ai-fix`'s sensitive set; parity locked by test).

### Residuals — NOT fixed, documented

- Base64-wrapped secrets
- Secrets split across multiple turns
- Novel token shapes not in the pattern set
- Non-ASCII tokens

In-memory API history keeps raw text, so the on-disk gap is bounded. If
you need stronger DLP, route chat output through an external scanner.

## Endpoint acceptance

Any non-built-in, non-local `http(s)` origin requires one-time acceptance
before credentials or query text flows to it. Note: the gate also accepts
`http://` origins — do **not** accept a non-local `http://` provider/docs
endpoint, since credentials or query text would then be sent over plaintext.
Acceptance prevents a stray
`OPENAI_API_KEY=sk-…` + `OPENAI_BASE_URL=https://attacker.example.com/v1`
combo from silently leaking your key to an unintended host.

### Built-in allowlist (no prompt)

- `https://chatbot.hoody.com`
- `https://ai.hoody.com`
- `https://api.minimax.io`
- `localhost`, `127.0.0.1`, `::1`, RFC1918 private IPs (10/8, 172.16/12,
  192.168/16) — local endpoints don't prompt and allow keyless auth

Notably **not** local: link-local (`169.254/16`, cloud metadata endpoints),
CGNAT (`100.64/10`), IPv6 ULA (`fc00::/7`), IPv6 link-local (`fe80::/10`).
Unit tests explicitly cover the IMDS SSRF guard.

### Non-allowlisted origins

One of:

- `--accept-endpoint <origin>` flag (one-shot or persisted)
- `HOODY_CHAT_ACCEPT_ENDPOINT=<origin>` env
- TTY confirmation prompt on first use

Accepted origins persist at `~/.hoody/chats/chat-accept.json` with `0o600`
mode. Keyed by normalized origin (`scheme://host[:port]`, lowercase host,
default-port stripped). Run `rm ~/.hoody/chats/chat-accept.json` to reset.

## Session file semantics

### Location and format

```
~/.hoody/chats/YYYYMMDD-HHMMSS-<8-hex>.jsonl
```

One file per session. Directory is `0o700`, files are `0o600`. First line
is a JSON meta record (`type: "meta"`, `id`, `title`, `createdAt`, `model`,
`tier`). Subsequent lines are turn records (`type: "turn"`, `role`,
`content`, `ts`).

### Concurrency

Each `hoody chat --persist` process writes to its own uniquely-named file
(timestamp + random short id). No shared mutable index → concurrent REPLs
cannot race.

### Malformed-file recovery

If a session file is empty or has a corrupt meta line, it's renamed to
`<name>.bad-<unix-ts>.jsonl` with a one-line stderr warning and the rest of
the CLI continues. Malformed individual turn lines are skipped during load
(power-loss-mid-write tolerance) without quarantining the file. The
quarantined file is **not** deleted — recover from it manually if needed.

### Retention

Capped at `HOODY_CHAT_MAX_SESSIONS` (default 50). On session creation,
oldest sessions (by `createdAt` ISO timestamp, filesystem-mtime-independent)
beyond the cap are unlinked.

### Titles

Derived from the first user message, redacted, collapsed to single-line,
truncated to 60 chars. The `list` and `show` commands re-run redaction at
READ time as defense-in-depth for any legacy pre-redaction files.

## Destructive operation confirmations

Two asymmetric shapes depending on surface, by design:

| Operation | Scripted CLI | Interactive REPL |
|---|---|---|
| Delete ALL sessions | `hoody chat sessions delete --all -y` — requires `-y` flag; refused otherwise with exit 1 | `/wipe` — requires typing the full word `yes` (lowercase); `y` / `YES` / etc. cancel; **disabled in private mode** |
| Delete one session | `hoody chat sessions delete <id>` — no confirm | `/delete <id>` — no confirm |

Rationale: scripts declare intent once via a flag (correct shape for
automation); interactive users might fat-finger `y` while typing freely,
so the REPL asks for a full typed-out confirmation. Both surfaces call
into the same underlying `wipeAllSessions` / `deleteSession` primitives.

## `hoody_docs_search` tool

Exactly one tool, read-only, disableable:

- `HOODY_CHAT_DOCS_TOOL=0` (env) — disables at startup
- `--no-tools` (flag) — disables for one invocation
- `/tool off` (REPL) — disables for the rest of the REPL

When disabled, the outbound request payload has **no `tools` key at all**
(not `tools: []`) — some providers 400 on empty arrays.

When the user types `@hoody.com`, the client pre-fetches the docs answer
and injects it as untrusted reference data in the user message. When the
tool is disabled, `@hoody.com` is not pre-fetched at all — the current
implementation does no trigger detection and emits no stderr notice in that
case.

## Quick privacy recipes

```bash
# "I want nothing on disk ever"
export HOODY_CHAT_PRIVATE=1

# "Nuke my existing sessions"
hoody chat sessions delete --all -y

# "Disable docs search (I don't want any query text leaving my machine
# except to the LLM endpoint I configured)"
export HOODY_CHAT_DOCS_TOOL=0

# "Use a fully local LLM (no cloud at all)"
export HOODY_CHAT_URL=http://localhost:11434/v1
export HOODY_CHAT_MODEL=llama3
# (no HOODY_CHAT_KEY needed — local origins allow keyless auth)

# "Reset endpoint acceptances"
rm ~/.hoody/chats/chat-accept.json

# "Show the first-run banner again"
rm ~/.hoody/chats/.seen-privacy-banner

# "Wipe EVERYTHING related to hoody chat"
rm -rf ~/.hoody/chats/
```

## What we explicitly do NOT promise

- **Detection of all unsafe shell output.** Paste-safety gutter + destructive
  pattern matching is best-effort. The `Review before pasting` footer is
  always shown on shell fences; the `⚠ DESTRUCTIVE SUGGESTION` header fires
  on a closed pattern set. Obfuscated or novel destructive commands may
  slip through. Users must still review before pasting.
- **Prompt-injection immunity.** Untrusted-data tags (`<hoody-docs-result
  untrusted="true">`, `<user-context untrusted="true">`) plus in-prompt
  negative examples reduce but do not eliminate prompt-injection risk.
  Strong LLMs respect them; weaker ones may not.
- **Tamper-resistance of the acceptance file.** An attacker with FS write
  access to `~/.hoody/chats/` can add entries. The threat model assumes
  that if an attacker has local FS write, they can already exfiltrate your
  provider key directly from the environment; acceptance gating is
  defense-in-depth against misconfiguration, not against active attackers.
- **Multi-user session separation.** Single-user scope. If multiple UIDs
  share a `$HOME` (bad idea), they share everything.

## Related

- [`chat.md`](./chat.md) — full command reference
- [CLI_AUTHENTICATION.md](../../../cli/CLI_AUTHENTICATION.md) — all auth methods
- The CLI chat design documents every design decision and its review
  history.
