# Hoody CLI Authentication

The Hoody CLI supports multiple authentication methods. They can be combined; precedence is **CLI flags > environment variables > config file**.

## 1. Token Authentication (recommended)

Pass a pre-obtained API token directly:

```bash
hoody --token <TOKEN> servers list
```

Or via environment variable:

```bash
export HOODY_TOKEN=<TOKEN>
hoody servers list
```

`HOODY_API_TOKEN` is also accepted as an alias.

## 2. Username / Password

The CLI can log in automatically using `/api/v1/users/auth/login`:

```bash
hoody --username alice --password s3cret servers list
```

Or via environment variables:

```bash
export HOODY_USERNAME=alice
export HOODY_PASSWORD=s3cret
hoody servers list
```

Aliases: `HOODY_USER`, `HOODY_PASS`.

## 3. Interactive Login & Signup

If required options are missing and the terminal is a TTY, the CLI will prompt for them interactively:

```bash
hoody login
hoody signup
```

Passwords are masked with `*` during input. Signup requires password confirmation.

### Browser / device-flow login

`hoody login --web` (alias `--oauth`) signs in through your browser — GitHub, Google, or an existing web session — via the OAuth device flow, with no password typed at the terminal.

> **2FA:** password auto-login fails on accounts that require two-factor authentication. Use browser login (`hoody login --web`), which completes 2FA in the browser, or supply a pre-obtained token (`--token` / `HOODY_TOKEN`).

## 4. Config File

The CLI reads `~/.hoody/config.json` by default. Override the path with `--config <path>`.

```json
{
  "profiles": {
    "default": {
      "token": "<TOKEN>",
      "baseUrl": "https://api.hoody.com"
    },
    "work": {
      "username": "alice",
      "password": "s3cret",
      "baseUrl": "https://custom.example.com"
    }
  }
}
```

Select a profile:

```bash
hoody --profile work servers list
```

Or via `HOODY_PROFILE` environment variable.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HOODY_TOKEN` / `HOODY_API_TOKEN` | API bearer token |
| `HOODY_USERNAME` / `HOODY_USER` | Login username |
| `HOODY_PASSWORD` / `HOODY_PASS` | Login password |
| `HOODY_BASE_URL` / `HOODY_API_URL` | API base URL |
| `HOODY_CONTAINER` / `HOODY_CONTAINER_ID` | Default container ID |
| `HOODY_REALM` / `HOODY_REALM_ID` | Realm ID for realm-scoped API requests |
| `HOODY_PROFILE` | Config file profile name |
| `HOODY_KIT_AUTH` / `HOODY_KIT_AUTH_TYPE` | Kit auth type (`jwt`, `password`, `token`) |
| `HOODY_KIT_USER` | Kit auth username |
| `HOODY_KIT_TOKEN` | Kit auth token or JWT |
| `HOODY_KIT_PASSWORD` / `HOODY_KIT_PASS` | Kit auth password for `--kit-auth password` (Basic auth) |
| `HOODY_KIT_TOKEN_HEADER` | Kit auth custom header name (default: `Authorization`) |
| `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Proxy URL (case-insensitive variants also supported) |

## 5. `hoody chat` provider authentication

`hoody chat` uses its own provider auth — separate from the Hoody API
token above, because chat talks to an LLM endpoint rather than `api.hoody.com`.
Three atomic tiers; first tier with any variable set wins:

### Tier 1 — Hoody chat-dedicated (default MiniMax)

```bash
export HOODY_CHAT_KEY=sk-…                          # required
export HOODY_CHAT_URL=https://api.minimax.io/v1      # default
export HOODY_CHAT_MODEL=MiniMax-M2.7-highspeed       # default
```

### Tier 2 — shared with `ai-fix` typo corrector

```bash
export HOODY_CLI_AI_KEY=…
export HOODY_CLI_AI_URL=https://ai.hoody.com/api/v1   # default
export HOODY_CLI_AI_MODEL=openai/gpt-5.4-nano          # default
```

### Tier 3 — OpenAI-compatible

`OPENAI_BASE_URL` and `OPENAI_MODEL` are required — no defaults, to prevent silently leaking a key to a surprise endpoint. `OPENAI_API_KEY` is required for non-local endpoints; localhost / RFC1918 origins may omit it (keyless local models).

```bash
export OPENAI_API_KEY=sk-…
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
```

Tier resolution is **atomic**: if you set any of `HOODY_CHAT_KEY`, `HOODY_CHAT_URL`, or `HOODY_CHAT_MODEL`, tier 1
wins and tier 2's defaults are never used. Prevents your OpenAI key from
accidentally going to MiniMax because you forgot to set the base URL.

### Endpoint acceptance

Non-allowlisted origins require `--accept-endpoint <origin>`,
`HOODY_CHAT_ACCEPT_ENDPOINT`, or a one-time interactive confirmation at a TTY prompt. Built-in allowlist: `chatbot.hoody.com`,
`ai.hoody.com`, `api.minimax.io`, plus localhost/RFC1918 private IPs.
Accepted origins persist to `~/.hoody/chats/chat-accept.json`.

### Other chat env vars

| Variable | Description |
|----------|-------------|
| `HOODY_CHAT_PRIVATE` | `1` = force private mode (no disk writes/reads) |
| `HOODY_CHAT_MAX_SESSIONS` | Retention cap (default 50) |
| `HOODY_CHAT_MAX_HISTORY` | Turns replayed to the LLM (default 10; `0` disables memory) |
| `HOODY_CHAT_DOCS_TOOL` | `0` disables the `hoody_docs_search` tool |
| `HOODY_CHAT_DOCS_URL` | Override docs-tool endpoint (acceptance-gated) |
| `HOODY_CHAT_DOCS_RATE_LIMIT` | Docs-tool requests per hour (default 20) |
| `HOODY_CHAT_HELP_HINT` | `0` suppresses the "AI mode" footer on `--help` output |
| `HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS` | Colon-separated extra paste-safety regex |

Full reference: [docs/reference/guides/chat.md](../docs/reference/guides/chat.md).
Privacy model: [docs/reference/guides/chat-privacy.md](../docs/reference/guides/chat-privacy.md).

## Precedence

```
CLI flags  >  Environment variables  >  Config file (~/.hoody/config.json)
```

Undefined CLI flags are ignored (they do not override env/config values).

## Config Management

The CLI includes a `config` command group for managing the config file:

```bash
hoody config path              # Print config file path
hoody config show              # Show config (secrets masked)
hoody config show --resolved   # Show merged config (file + env vars)
hoody config validate          # Validate config and report issues
hoody config reset --yes       # Reset config to defaults
hoody config set <key> <value> # Set a config value
hoody config get <key>         # Get a config value
hoody config unset <key>       # Remove a config key
```

Profile-scoped operations:

```bash
hoody config set --for-profile work baseUrl https://custom.example.com
hoody config get --for-profile work baseUrl
```

> **Shell history warning:** `hoody config set token <value>` passes the token as a CLI argument, which may be recorded in your shell history. For sensitive values, prefer environment variables (`HOODY_TOKEN`, `HOODY_PASSWORD`) or edit the config file directly.
