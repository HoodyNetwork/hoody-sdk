# `hoody chat` — what it is, and its privacy model

`hoody chat` asks Hoody's documentation assistant about Hoody, from your
terminal. It is free and needs no API key: every question is answered by Hoody's
own service, and there is no AI provider for you to choose or configure. (Hoody
in turn runs that service on model providers — see below.)

**Privacy in one line:** by default `hoody chat` writes **nothing** to your disk,
and what leaves your machine is your question plus the recent turns of the
current conversation — no account, container, or auth identifiers.

> **Where your text goes.** There is no provider for *you* to configure and no
> API key: `hoody chat` talks to exactly one endpoint, Hoody's assistant. Hoody
> is not the last stop, though — to answer you it forwards your text to the
> model providers it runs on (today: MiniMax for the answer, and OpenRouter to
> embed the question for retrieval). So the accurate statement is "one endpoint,
> Hoody's, which uses sub-processors" — not "nowhere else". Treat it as you
> would any hosted assistant: fine for questions about Hoody, not a place for
> secrets. To keep your text off that path entirely, point `HOODY_CHAT_URL` at
> your own instance of the service.

## The free "ask Hoody" service (server side)

Your question is sent to Hoody's assistant (`chatbot.hoody.com`) so it can answer
you. Hoody processes it only to produce that answer and does **not** retain long
prompts. Because the service is free, it **caps prompt length** and applies
**rate limits** so it stays available to everyone — treat it as "ask a question
about Hoody," not a place to paste long documents or anything sensitive.

Everything below is the load-bearing reference for exactly what `hoody chat` does
and does not write to **your** disk, what leaves your machine, and how to disable
each path.

## Defaults: nothing persists

By default, `hoody chat` is **ephemeral**:

| Path | Default | Enable with |
|---|---|---|
| Session transcripts (JSONL) | off (in-memory only) | `--persist` (REPL-only) |
| Endpoint-acceptance file | written **only** when you accept a non-allowlisted origin | `--accept-endpoint` flag, `HOODY_CHAT_ACCEPT_ENDPOINT` env, or the confirmation prompt shown on an interactive **one-shot** run (the REPL does not prompt mid-turn — use the flag or env there) |
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
from startup — refusing reads too keeps it from being half-private. That
includes the `hoody chat sessions` subcommands, which refuse and exit 1 rather
than read the store.

`/private` can only turn privacy **on**. It cannot downgrade a process that was
started with `--private` or `HOODY_CHAT_PRIVATE=1` — otherwise the flag's
promise would last only until someone typed a slash command. Turning it on
mid-REPL disables subsequent reads and writes, but anything already done before
the toggle (e.g. the `.seen-privacy-banner` marker) has already hit disk, so the
knobs are not exactly equivalent.

`--private` + `--persist` exits with code `1` and a diagnostic — we fail
loudly rather than silently picking one. (REPL-mode only; `--persist` has
no effect on one-shot invocations regardless of `--private`.)

## What goes over the network

| Destination | When | What |
|---|---|---|
| `chatbot.hoody.com/api/chat` | Every chat turn | Your question verbatim, plus the recent turns of the current conversation (capped by `HOODY_CHAT_MAX_HISTORY`, default 10 exchanges, and by the service's own 20-turn cap) |

That is the only destination **this client** contacts: one endpoint, no second
connection, no telemetry call. What the service does on your behalf is a
separate question — it forwards your text to its model providers (MiniMax to
generate the answer, OpenRouter to embed the question) and records the query in
its own telemetry. Those are Hoody's sub-processors, not destinations you can
see or configure from the CLI.

The request carries **no auth header** and no container / account identifiers —
just the conversation text. The target URL is gated by the endpoint-acceptance
system, so it cannot be redirected by anything in the answer.

**History is opt-outable.** `HOODY_CHAT_MAX_HISTORY=0` sends each question
standalone, with no prior turns attached. Follow-ups ("what about that one?")
stop resolving, which is the trade.

Rendered citations are **not** part of what gets sent: the links you see are
derived locally from the sources the service reports, and are never replayed
back as conversation history.

## Redaction

Any content written to disk (session JSONL body, session titles) is passed
through a redaction pass **before** hitting disk. In-memory API history keeps
raw text so the LLM still sees what you actually typed.

### Secret patterns detected

The pattern set matches the Hoody chat service's own secret detection, so
local redaction is consistent with the service. The set currently covers:

- Hoody tokens (`hdy_…`)
- OpenAI-style keys (`sk-…`)
- Bearer tokens (`Bearer …`)
- 2-part JWTs (`eyJ…` segments)
- Raw hex blobs (≥ 65 hex chars — catches SHA-512, raw keys, etc.)
- GitHub tokens (`ghp_…`, `gho_…`, `github_pat_…`)
- GitLab (`glpat-…`)
- AWS access keys (`AKIA…`) and STS temporary session credentials (`ASIA…`)
- Slack (`xox[bpras]-…`)

Matches are replaced with `<REDACTED>`.

### CLI flag values

Values following any of a broad set of credential-bearing flags (e.g.
`--token`/`-t`, `--password`/`-p`, `--username`/`-u`, `--api-key`,
`--api-secret`, `--private-key`, `--secret-access-key`, `--session-token`,
`--bearer-token`, `--auth-token`, `--client-secret`, `--ssh-password`,
`--ssh-key`, `--db-password`, `--proxy-password`, `--passphrase`, …) in
written content are also replaced with `<REDACTED>`.

### Residuals — NOT fixed, documented

- Base64-wrapped secrets
- Secrets split across multiple turns
- Novel token shapes not in the pattern set
- Non-ASCII tokens

In-memory API history keeps raw text, so the on-disk gap is bounded. If
you need stronger DLP, route chat output through an external scanner.

## Endpoint acceptance

Any non-built-in, non-local `http(s)` origin requires one-time acceptance
before your question flows to it. Note: the gate also accepts `http://`
origins — do **not** accept a non-local `http://` endpoint, since your question
and conversation history would then be sent over plaintext.

The gate also refuses to follow redirects: an accepted origin cannot bounce the
request onward to a host you never approved.

### Built-in allowlist (no prompt)

- `https://chatbot.hoody.com`
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

## No tools, no local model

`hoody chat` runs no tool loop and no local model. It sends text and renders
text. It cannot read your files, execute commands, fetch arbitrary URLs, or
reach the Hoody API on your behalf — not as a policy, but because no such code
path exists in the client. For any of that, use `hoody agent`.

## Quick privacy recipes

```bash
# "I want nothing on disk ever"
export HOODY_CHAT_PRIVATE=1

# "Nuke my existing sessions"
hoody chat sessions delete --all -y

# "Send each question standalone, with no conversation history"
export HOODY_CHAT_MAX_HISTORY=0

# "Point at my own instance of the service instead of Hoody's"
export HOODY_CHAT_URL=http://localhost:8787/api/chat
# (local origins are pre-accepted — no --accept-endpoint needed)

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
- **Answer trustworthiness.** The answer is produced by the service from
  documentation content. Terminal control sequences are stripped from the
  answer and from error text, and citation links are built only from the
  service's vetted site-relative path (its absolute `url` field is ignored
  precisely because it is not vetted), so a citation cannot point off-site. The
  prose itself is still model output — verify commands before running them.
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
