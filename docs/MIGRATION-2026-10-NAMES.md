# Migration: CLI and SDK names (2026-10)

Every CLI command and SDK method now follows one vocabulary. The old names are gone: there are no aliases, no
deprecation shims and no compatibility layer. A script or program written against the old names fails until you
replace them with the names in the tables below.

- **CLI:** 618 commands changed their path. 33 are removed (the table says what to use instead).
- **SDK:** 967 accessors changed. 21 are removed, and 21 were split into several methods (pick the half that matches what you meant).
- Flags keep their names (they stay kebab-case) and request and response field names are unchanged. One addition: where two old commands became one, the replacement takes a flag that selects the old behaviour, and the row shows it (`commits create --push`, `bot tokens revoke --all`, `display mouse click --double`).

## The rules, in short

One word means one thing, on both surfaces. CLI `agent sessions model set` is SDK `agent.sessions.setModel()`.

- **Spelling.** CLI command words are lowercase and carry no hyphen (`hoody agent skills hub preview`). SDK names are camelCase; an acronym is written as a word (`Mcp`, `Pr`, `Url`).
- **Verb last.** The CLI reads `hoody <group> <noun> <verb>`: `hoody servers offers list`, not `hoody servers list-offers`. Groups are named for the resource, so a vague noun (`discovery`, `introspection`, `interaction`, `utilities`) is gone.
- **Read.** `list` returns a collection, `get` returns one item or one report, `stats`/`status`/`health`/`metrics`/`version` are the report nouns. `browse` and `discover` became `list`.
- **Write.** `create` makes a record, `update` merges (omitted fields keep their value), `set` replaces or assigns, `delete` removes, `clear` empties, `purge` deletes past a cutoff, `add`/`remove` change membership. `put`, `patch` and `edit` are gone.
- **Switches.** `toggle`, `set-enabled`, `set-state` and their relatives became a pair: `enable` / `disable`. In the SDK a facade pins the wire value, so `containers.manage(id, "start")` became `containers.start(id)`. The one remaining `toggle` is `agent definitions tools toggle`, because the API flips the value with no target.
- **Running work.** `run` executes and waits for the outcome, `start` dispatches and returns a handle, `stop`, `restart`, `pause`, `resume` and `cancel` act on it. `execute`, `abort`, `kill`, `freeze` and `unfreeze` are gone.
- **Streams and sockets.** `stream` follows events (CLI prints them, SDK returns an async iterable), `connect` attaches a socket. `watch` for events became `stream`.
- **Make active.** `use` replaces `select`, `switch` and `setActive*`.
- **Nesting.** Resources that were spread over a flat group moved under their owner: `api.authTokens` is `api.auth.tokens`, `api.tfa` is `api.auth.twoFactor`, `api.proxyAliases` is `api.proxy.aliases`, `api.rentals` and `api.serverRental` are `api.servers`, `api.containers.*Snapshot*` is `api.snapshots`.
- **Exceptions that stay.** CLI `db` and `kv` keep their group names and the SDK keeps `sqlite.sql` and `sqlite.kv` (D5); `upsert` stays for the two operations that create-or-merge (D6).

## Decisions that shaped the tables

| Decision | Result |
|---|---|
| D1 | `use` is the verb for "make this item the current one". |
| D2 | The agent definitions group is `agent definitions` (CLI) and `agent.definitions` (SDK), not `agent agents`. |
| D3 | Pull requests are `prs` on the CLI and `Pr` in the SDK (`agent github prs`, `createPr`, `mergePr`). |
| D4 | `hoody logout` signs out this device only. `hoody logout --all` ends every session of the account, and the SDK spells that `api.auth.logoutAll()`. `HoodyClient.logout()` keeps its behavior and calls `logoutAll()`. |
| D5 | `db` and `kv` stay as CLI groups (SDK: `sqlite.sql`, `sqlite.kv`). |
| D6 | `upsert` stays for `agent hooks` and `agent mcp`. |

Sign-in commands live at the top level only: `hoody login`, `hoody signup`, `hoody logout`. There is no `hoody auth login`.
The aliases `hoody ps`, `hoody ssh`, `hoody pty`, `hoody terminal sh`, `hoody check-update`, `hoody chatbot` and the `ls`-style operation aliases were removed; `hoody shell`, `hoody containers list` and `hoody update` replace them.

## CLI: group aliases

A group alias is a second name for a whole command group. These aliases were removed; use the group name. `hoody sqlite ...` is `hoody db ...`, `hoody notify ...` is `hoody notifications ...`.

| Removed alias | Use |
|---|---|
| `hoody token` | `hoody auth` |
| `hoody user` | `hoody users` |
| `hoody project` | `hoody projects` |
| `hoody container` | `hoody containers` |
| `hoody image` | `hoody images` |
| `hoody snapshot` | `hoody snapshots` |
| `hoody event` | `hoody events` |
| `hoody pool` | `hoody pools` |
| `hoody server` | `hoody servers` |
| `hoody realm` | `hoody realms` |
| `hoody file` | `hoody files` |
| `hoody note` | `hoody notes` |
| `hoody n` | `hoody notes` |
| `hoody bots` | `hoody bot` |
| `hoody watcher` | `hoody watch` |
| `hoody shares` | `hoody storage` |
| `hoody vscode` | `hoody code` |
| `hoody sqlite` | `hoody db` |
| `hoody kvstore` | `hoody kv` |
| `hoody crontab` | `hoody cron` |
| `hoody notify` | `hoody notifications` |

These short aliases stay: `u` (users), `v` (vault), `p` and `proj` (projects), `c` (containers), `img` (images), `net` (network), `snap` (snapshots), `fw` (firewall), `px` (proxy), `ev` (events), `notif` (notifications), `srv` (servers), `term` and `t` (terminal), `br` (browser), `d` (daemon), `disp` (display), `x` (exec), `f` and `fs` (files), `sql` (db), `m` (meta), `tun` (tunnel). The per-command verb aliases (`ls`, `show`, `describe`, `new`, `add`, `edit`, `set`, `rm`, `remove` and similar) are removed: type the verb itself (`list`, `get`, `create`, `update`, `delete`).

## CLI: old command to new command

Sorted by the old command. A row with several new commands was split: choose the one that matches the intent.
A command not listed here kept its name.

### `hoody activity`

| Old | New | Note |
|---|---|---|
| `hoody activity logs` | `hoody activity list` |  |

### `hoody agent`

| Old | New | Note |
|---|---|---|
| `hoody agent agents copy` | `hoody agent definitions copy` |  |
| `hoody agent agents create` | `hoody agent definitions create` |  |
| `hoody agent agents delete` | `hoody agent definitions delete` |  |
| `hoody agent agents get-source` | `hoody agent definitions source get` |  |
| `hoody agent agents list` | `hoody agent definitions list` |  |
| `hoody agent agents list-files` | `hoody agent files list` |  |
| `hoody agent agents put-source` | `hoody agent definitions source set` |  |
| `hoody agent agents rename` | `hoody agent definitions rename` |  |
| `hoody agent agents reset-to-shipped` | `hoody agent definitions reset` |  |
| `hoody agent agents set-model` | `hoody agent definitions model set` |  |
| `hoody agent agents set-tools` | `hoody agent definitions tools set` |  |
| `hoody agent agents set-turns` | `hoody agent definitions turns limit set` |  |
| `hoody agent agents toggle-tool` | `hoody agent definitions tools toggle` |  |
| `hoody agent discovery list-containers` | `hoody agent containers list` |  |
| `hoody agent discovery list-realms` | `hoody agent realms list` |  |
| `hoody agent discovery set-active-realm` | `hoody agent realms use` |  |
| `hoody agent github add-worktree` | `hoody agent github worktrees create` |  |
| `hoody agent github auth-status` | `hoody agent github auth status` |  |
| `hoody agent github branches` | `hoody agent github branches list` |  |
| `hoody agent github checkout-pr` | `hoody agent github prs checkout` |  |
| `hoody agent github clone` | `hoody agent github repos clone` |  |
| `hoody agent github commit` | `hoody agent github commits create` |  |
| `hoody agent github commit-push` | `hoody agent github commits create --push` | Without `--push` the command commits only. |
| `hoody agent github create-branch` | `hoody agent github branches create` |  |
| `hoody agent github create-issue` | `hoody agent github issues create` |  |
| `hoody agent github delete-branch` | `hoody agent github branches delete` |  |
| `hoody agent github identity` | `hoody agent github repos resolve` |  |
| `hoody agent github issues` | `hoody agent github issues list` |  |
| `hoody agent github log` | `hoody agent github commits list` |  |
| `hoody agent github login` | `hoody agent github auth login` |  |
| `hoody agent github login-poll` | `hoody agent github auth poll` |  |
| `hoody agent github logout` | `hoody agent github auth logout` |  |
| `hoody agent github merge-pr` | `hoody agent github prs merge` |  |
| `hoody agent github prs` | `hoody agent github prs list` |  |
| `hoody agent github pull-request` | `hoody agent github prs create` |  |
| `hoody agent github reconnect-repo` | `hoody agent github repos credentials set` |  |
| `hoody agent github remove-worktree` | `hoody agent github worktrees delete` |  |
| `hoody agent github repos` | `hoody agent github repos list` |  |
| `hoody agent github set-active-account` | `hoody agent github accounts use` |  |
| `hoody agent github stash` | `hoody agent github stash push` |  |
| `hoody agent github stash-pop` | `hoody agent github stash pop` |  |
| `hoody agent github suggest-commit-message` | `hoody agent github commits message suggest` |  |
| `hoody agent github switch-branch` | `hoody agent github branches use` |  |
| `hoody agent github worktrees` | `hoody agent github worktrees list` |  |
| `hoody agent headless create-run` | `hoody agent headless start` or `hoody agent headless stream` | Split: choose the command that matches what you meant. |
| `hoody agent hooks ack-trust` | `hoody agent hooks trust` |  |
| `hoody agent hooks begin-write` | `hoody agent hooks intents create` |  |
| `hoody agent hooks disable-all` | `hoody agent hooks enable --all` or `hoody agent hooks disable --all` | Split: choose the command that matches what you meant. `--all` applies it to every hook. |
| `hoody agent hooks get-rules` | `hoody agent hooks rules get` |  |
| `hoody agent hooks set-rules` | `hoody agent hooks rules set` |  |
| `hoody agent hooks test` | `hoody agent hooks run` or `hoody agent hooks test` | Split: choose the command that matches what you meant. |
| `hoody agent hooks toggle` | `hoody agent hooks enable` or `hoody agent hooks disable` | Split: choose the command that matches what you meant. |
| `hoody agent jobs get-result` | `hoody agent jobs result get` |  |
| `hoody agent logs logs-sources` | `hoody agent logs sources list` |  |
| `hoody agent logs logs-stats` | `hoody agent logs stats` |  |
| `hoody agent logs query-logs` | `hoody agent logs list` |  |
| `hoody agent logs read-log-entry` | `hoody agent logs get` |  |
| `hoody agent logs stream-logs` | `hoody agent logs stream` |  |
| `hoody agent loops list` | `hoody agent sessions loops list` |  |
| `hoody agent loops list-all` | `hoody agent loops list` |  |
| `hoody agent loops run-now` | `hoody agent loops runs start` |  |
| `hoody agent mcp begin-write` | `hoody agent mcp intents create` |  |
| `hoody agent mcp parse` | `hoody agent mcp preview` |  |
| `hoody agent mcp probe` | `hoody agent mcp test` |  |
| `hoody agent mcp set-enabled` | `hoody agent mcp enable` or `hoody agent mcp disable` | Split: choose the command that matches what you meant. |
| `hoody agent memory assign-datahost` | `hoody agent memory datahost claim` |  |
| `hoody agent memory begin-write` | `hoody agent memory intents create` |  |
| `hoody agent memory datahost` | `hoody agent memory datahost get` |  |
| `hoody agent memory delete-item` | `hoody agent memory items delete` |  |
| `hoody agent memory delete-project` | `hoody agent memory projects delete` |  |
| `hoody agent memory edit-item` | `hoody agent memory items update` |  |
| `hoody agent memory get-graph` | `hoody agent memory graph get` |  |
| `hoody agent memory get-item` | `hoody agent memory items get` |  |
| `hoody agent memory list-items` | `hoody agent memory items list` |  |
| `hoody agent memory list-projects` | `hoody agent memory projects list` |  |
| `hoody agent memory save-item` | `hoody agent memory items create` |  |
| `hoody agent memory set-enabled` | `hoody agent memory enable` or `hoody agent memory disable` | Split: choose the command that matches what you meant. |
| `hoody agent models add-provider-account` | `hoody agent providers accounts add` |  |
| `hoody agent models complete` | `hoody agent completions create` |  |
| `hoody agent models complete-stream` | `hoody agent completions create --stream` | Without `--stream` the reply is returned whole. |
| `hoody agent models delete-provider-api-key` | `hoody agent providers keys delete` |  |
| `hoody agent models get-provider` | `hoody agent providers get` |  |
| `hoody agent models get-provider-auth` | `hoody agent providers auth status` |  |
| `hoody agent models jev get-settings` | `hoody agent jev settings get` |  |
| `hoody agent models jev list` | `hoody agent jev models list` |  |
| `hoody agent models jev test` | `hoody agent jev test` |  |
| `hoody agent models jev update-settings` | `hoody agent jev settings update` |  |
| `hoody agent models list-provider-accounts` | `hoody agent providers accounts list` |  |
| `hoody agent models list-providers` | `hoody agent providers list` |  |
| `hoody agent models logout-provider-o-auth` | `hoody agent providers oauth logout` |  |
| `hoody agent models poll-provider-o-auth` | `hoody agent providers oauth poll` |  |
| `hoody agent models remove-provider-account` | `hoody agent providers accounts remove` |  |
| `hoody agent models set-provider-account-active` | `hoody agent providers accounts use` |  |
| `hoody agent models set-provider-api-key` | `hoody agent providers keys set` |  |
| `hoody agent models set-provider-default` | `hoody agent providers auth default set` |  |
| `hoody agent models start-provider-o-auth` | `hoody agent providers oauth start` |  |
| `hoody agent models submit-provider-o-auth-code` | `hoody agent providers oauth submit` |  |
| `hoody agent sessions answer-assist` | `hoody agent gates suggest` |  |
| `hoody agent sessions answer-question` | `hoody agent gates answer` |  |
| `hoody agent sessions approval delete-rule` | `hoody agent sessions approval rules delete` |  |
| `hoody agent sessions approval set` | `hoody agent sessions approval update` |  |
| `hoody agent sessions approval set-rule` | `hoody agent sessions approval rules set` |  |
| `hoody agent sessions approver-lease acquire` | `hoody agent sessions approver lease claim` |  |
| `hoody agent sessions approver-lease release` | `hoody agent sessions approver lease release` |  |
| `hoody agent sessions approver-lease renew` | `hoody agent sessions approver lease renew` |  |
| `hoody agent sessions attachments acquire` | `hoody agent sessions attachments claim` |  |
| `hoody agent sessions cancel` | `hoody agent sessions turns cancel` |  |
| `hoody agent sessions confirm-gate` | `hoody agent gates approve` or `hoody agent gates deny` | Split: choose the command that matches what you meant. |
| `hoody agent sessions list-cwds` | `hoody agent sessions directories list` |  |
| `hoody agent sessions list-gates` | `hoody agent gates list` |  |
| `hoody agent sessions post-message` | `hoody agent sessions turns start` |  |
| `hoody agent sessions post-workflow-message` | `hoody agent workflows messages send` |  |
| `hoody agent sessions prompt-stream` | `hoody agent sessions turns start --stream` | `--stream` follows the session stream from the dispatch cursor; without it the command does not. |
| `hoody agent sessions prompt-sync` | `hoody agent sessions turns run` |  |
| `hoody agent sessions rules-applies` | `hoody agent sessions rules list` |  |
| `hoody agent sessions set-auto-reply` | `hoody agent sessions autoreply set` |  |
| `hoody agent sessions set-auto-reply-writes` | `hoody agent sessions autoreply writes set` |  |
| `hoody agent sessions set-chat-agent` | `hoody agent sessions agent set` |  |
| `hoody agent sessions set-effort` | `hoody agent sessions effort set` |  |
| `hoody agent sessions set-hoody-env` | `hoody agent sessions env set` |  |
| `hoody agent sessions set-model` | `hoody agent sessions model set` |  |
| `hoody agent sessions set-verbosity` | `hoody agent sessions verbosity set` |  |
| `hoody agent sessions set-yolo` | `hoody agent sessions yolo set` |  |
| `hoody agent sessions state` | `hoody agent sessions snapshot get` |  |
| `hoody agent sessions stop-all` | `hoody agent work stop` |  |
| `hoody agent sessions transcript` | `hoody agent sessions transcript get` |  |
| `hoody agent settings delete-fusion` | `hoody agent fusions delete` |  |
| `hoody agent settings get-acp-status` | `hoody agent acp status` |  |
| `hoody agent settings list-fusion` | `hoody agent fusions list` |  |
| `hoody agent settings patch` | `hoody agent settings update` |  |
| `hoody agent settings set-acp-agent-model` | `hoody agent acp model set` |  |
| `hoody agent settings set-acp-enabled` | `hoody agent acp enable` or `hoody agent acp disable` | Split: choose the command that matches what you meant. |
| `hoody agent settings set-acp-secret` | `hoody agent acp secrets set` |  |
| `hoody agent settings upsert-fusion` | `hoody agent fusions set` |  |
| `hoody agent skills apply-import` | `hoody agent skills import` |  |
| `hoody agent skills clear-hub-cache` | `hoody agent skills hub cache clear` |  |
| `hoody agent skills get-hub-cache` | `hoody agent skills hub cache stats` |  |
| `hoody agent skills get-source` | `hoody agent skills source get` |  |
| `hoody agent skills install-hub` | `hoody agent skills hub install` |  |
| `hoody agent skills preview-hub` | `hoody agent skills hub preview` |  |
| `hoody agent skills put-source` | `hoody agent skills source set` |  |
| `hoody agent skills scan-import` | `hoody agent skills scan` |  |
| `hoody agent skills search-hub` | `hoody agent skills hub search` |  |
| `hoody agent skills toggle` | `hoody agent skills enable` or `hoody agent skills disable` | Split: choose the command that matches what you meant. |
| `hoody agent statistics get` | `hoody agent stats` |  |
| `hoody agent statistics usage-by-account` | `hoody agent usage accounts list` |  |
| `hoody agent statistics usage-by-model` | `hoody agent usage models list` |  |
| `hoody agent system health-check` | `hoody agent health` |  |
| `hoody agent system hoody-auth-status` | `hoody agent whoami` |  |
| `hoody agent system metrics` | `hoody agent metrics` |  |
| `hoody agent system version` | `hoody agent version` |  |
| `hoody agent tasks cancel-all` | `hoody agent sessions tasks cancel` |  |
| `hoody agent tasks transcript` | `hoody agent tasks transcript get` |  |
| `hoody agent todos approve-proposal` | `hoody agent todos proposals approve` |  |
| `hoody agent todos cancel-run` | `hoody agent todos cancel` |  |
| `hoody agent todos deny-proposal` | `hoody agent todos proposals deny` |  |
| `hoody agent todos get-revision` | `hoody agent todos revision get` |  |
| `hoody agent todos message` | `hoody agent todos messages send` |  |
| `hoody agent todos post-comment` | `hoody agent todos comments create` |  |
| `hoody agent todos purge` | `hoody agent todos archived purge` |  |
| `hoody agent todos run` | `hoody agent todos start` |  |
| `hoody agent tools list-read-only` | `hoody agent tools readonly list` |  |
| `hoody agent tools list-session` | `hoody agent sessions tools list` |  |
| `hoody agent tools list-session-mcp` | `hoody agent sessions mcp tools list` |  |
| `hoody agent tools run-async` | `hoody agent tools start` |  |
| `hoody agent tools run-session` | `hoody agent sessions tools run` |  |
| `hoody agent tools stream` | `hoody agent tools stream` | The name is unchanged; the command stays hidden from `--help` and is still registered. `tools run` does not stream. |
| `hoody agent workflows cancel-run` | `hoody agent workflows runs cancel` |  |
| `hoody agent workflows get-run` | `hoody agent workflows runs get` |  |
| `hoody agent workflows hide` | `hoody agent workflows hidden set` |  |
| `hoody agent workflows list-runs` | `hoody agent workflows runs list` |  |
| `hoody agent workflows put` | `hoody agent workflows set` |  |
| `hoody agent workflows resume-run` | `hoody agent workflows runs resume` |  |
| `hoody agent workflows run` | `hoody agent workflows start` |  |
| `hoody agent workflows run-session` | `hoody agent sessions workflows start` |  |
| `hoody agent workflows set-summary` | `hoody agent workflows summary set` |  |

### `hoody ai`

| Old | New | Note |
|---|---|---|
| `hoody ai chat (alias chatbot)` | removed | Use `hoody chat`. |
| `hoody ai list` | `hoody ai models list` |  |

### `hoody auth`

| Old | New | Note |
|---|---|---|
| `hoody auth 2fa gate` | `hoody auth 2fa gate enable` or `hoody auth 2fa gate disable` | Split: choose the command that matches what you meant. |
| `hoody auth 2fa regenerate` | `hoody auth 2fa backup codes rotate` |  |
| `hoody auth 2fa setup` | `hoody auth 2fa setup start` |  |
| `hoody auth 2fa verify-setup` | `hoody auth 2fa setup confirm` |  |
| `hoody auth copy` | `hoody auth tokens copy` |  |
| `hoody auth create` | `hoody auth tokens create` |  |
| `hoody auth delete` | `hoody auth tokens delete` |  |
| `hoody auth device code` | `hoody auth device start` |  |
| `hoody auth device token` | `hoody auth device poll` |  |
| `hoody auth email resend` | `hoody auth email verification send` |  |
| `hoody auth get` | `hoody auth tokens get` |  |
| `hoody auth get-current` | `hoody auth tokens get` |  |
| `hoody auth identity claim` | `hoody auth claims create` |  |
| `hoody auth list` | `hoody auth tokens list` |  |
| `hoody auth login` | removed | Use `hoody login` (password, `--web`, `--token`). |
| `hoody auth logout` | removed | Use `hoody logout` for this device, `hoody logout --all` for every session of the account. |
| `hoody auth oauth cancel-intent` | `hoody auth oauth intents cancel` |  |
| `hoody auth oauth config` | `hoody auth config get` |  |
| `hoody auth oauth github callback` | removed | Use `hoody login --web`. |
| `hoody auth oauth github redirect` | removed | Use `hoody login --web`. |
| `hoody auth oauth google callback` | removed | Use `hoody login --web`. |
| `hoody auth oauth google redirect` | removed | Use `hoody login --web`. |
| `hoody auth password forgot` | `hoody auth password recover` |  |
| `hoody auth profile by-public-key` | `hoody auth tokens profiles get` |  |
| `hoody auth profile current` | `hoody auth whoami` |  |
| `hoody auth profile update` | `hoody auth tokens profiles update` |  |
| `hoody auth realms add` | `hoody auth tokens realms add` |  |
| `hoody auth realms remove` | `hoody auth tokens realms remove` |  |
| `hoody auth regions` | `hoody servers regions list` |  |
| `hoody auth signup` | removed | Use `hoody signup`. |
| `hoody auth templates list` | `hoody auth tokens templates list` |  |
| `hoody auth update` | `hoody auth tokens update` |  |
| `hoody auth waitlist enrich` | `hoody auth waitlist update` |  |

### `hoody bot`

| Old | New | Note |
|---|---|---|
| `hoody bot logs read` | `hoody bot logs list` |  |
| `hoody bot manifest` | `hoody bot manifest get` |  |
| `hoody bot policy set` | `hoody bot policy update` |  |
| `hoody bot profile set` | `hoody bot profile update` |  |
| `hoody bot register` | `hoody bot create` |  |
| `hoody bot tokens revoke-all` | `hoody bot tokens revoke --all` | `--all` is required; there is no per-token form. |

### `hoody browser`

| Old | New | Note |
|---|---|---|
| `hoody browser action` | `hoody browser act` |  |
| `hoody browser console` | `hoody browser logs console list` |  |
| `hoody browser cookies get` | `hoody browser cookies list` |  |
| `hoody browser cookies set` | `hoody browser cookies batch set` |  |
| `hoody browser devtools` | `hoody browser devtools urls get` |  |
| `hoody browser eval` | removed | Use `hoody browser evaluate`. |
| `hoody browser eval-post` | `hoody browser evaluate` |  |
| `hoody browser history delete` | `hoody browser history clear` |  |
| `hoody browser history query` | `hoody browser history list` |  |
| `hoody browser html` | `hoody browser html get` |  |
| `hoody browser info` | `hoody browser get` |  |
| `hoody browser metrics` | `hoody browser stats` |  |
| `hoody browser navigate` | removed | Use `hoody browser navigate`. |
| `hoody browser navigate-post` | `hoody browser navigate` |  |
| `hoody browser network` | `hoody browser logs network list` |  |
| `hoody browser pdf` | `hoody browser pdf export` |  |
| `hoody browser screenshot` | `hoody browser screenshots capture` |  |
| `hoody browser snapshot` | `hoody browser snapshot get` |  |
| `hoody browser text` | `hoody browser text get` |  |

### `hoody chat`

| Old | New | Note |
|---|---|---|
| `hoody chat (alias chatbot)` | `hoody chat` |  |
| `hoody chat sessions delete (aliases rm, remove)` | `hoody chat sessions delete` |  |
| `hoody chat sessions list (alias ls)` | `hoody chat sessions list` |  |
| `hoody chat sessions show` | `hoody chat sessions get` |  |

### `hoody check-update`

| Old | New | Note |
|---|---|---|
| `hoody check-update` | removed | Use `hoody update`. |

### `hoody code`

| Old | New | Note |
|---|---|---|
| `hoody code assets favicon` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets manifest` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets robots` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets security-policy` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code vs` | removed | Use `hoody code open`. |

### `hoody config`

| Old | New | Note |
|---|---|---|
| `hoody config show` | `hoody config get` |  |
| `hoody config unset` | `hoody config clear` |  |

### `hoody containers`

| Old | New | Note |
|---|---|---|
| `hoody containers authorize` | `hoody containers claims create` |  |
| `hoody containers env bulk-set` | `hoody containers env update` |  |
| `hoody containers kvm` | `hoody containers kvm enable` or `hoody containers kvm disable` | Split: choose the command that matches what you meant. |
| `hoody containers manage` | `hoody containers start` or `hoody containers stop` or `hoody containers restart` or `hoody containers pause` or `hoody containers resume` | Split: choose the command that matches what you meant. The old `force-stop` is `hoody containers stop --force`. |
| `hoody containers proxy default` | `hoody containers proxy default set` |  |
| `hoody containers proxy discovery groups list` | `hoody containers proxy groups list` |  |
| `hoody containers proxy discovery services get` | `hoody containers proxy services get` |  |
| `hoody containers proxy discovery services list` | `hoody containers proxy services list` |  |
| `hoody containers proxy hooks clear-service` | `hoody containers proxy services hooks clear` |  |
| `hoody containers proxy hooks list-service` | `hoody containers proxy services hooks list` |  |
| `hoody containers proxy hooks update` | `hoody containers proxy hooks set` |  |
| `hoody containers proxy permissions replace` | `hoody containers proxy permissions set` |  |
| `hoody containers proxy state` | `hoody containers proxy enable` or `hoody containers proxy disable` | Split: choose the command that matches what you meant. |
| `hoody containers status-logs` | `hoody containers status history list` |  |

### `hoody cron`

| Old | New | Note |
|---|---|---|
| `hoody cron crontabs replace` | `hoody cron crontabs set` |  |

### `hoody curl`

| Old | New | Note |
|---|---|---|
| `hoody curl exec` | `hoody curl run` |  |
| `hoody curl get-url` | removed | Use `hoody curl run`. |
| `hoody curl jobs cancel` | `hoody curl jobs cancel` or `hoody curl jobs delete` | Split: choose the command that matches what you meant. |
| `hoody curl jobs result` | `hoody curl jobs result get` |  |
| `hoody curl schedules toggle` | removed | Use `hoody curl schedules update` with `--enabled` / `--no-enabled`. |
| `hoody curl sessions cookies` | `hoody curl sessions cookies list` |  |

### `hoody daemon`

| Old | New | Note |
|---|---|---|
| `hoody daemon attach` | `hoody daemon programs attach` |  |
| `hoody daemon ephemeral list` | `hoody daemon ephemeral programs list` |  |
| `hoody daemon ephemeral logs` | `hoody daemon ephemeral programs logs get` |  |
| `hoody daemon ephemeral start` | `hoody daemon ephemeral programs start` |  |
| `hoody daemon ephemeral status` | `hoody daemon ephemeral programs status` |  |
| `hoody daemon ephemeral stop` | `hoody daemon ephemeral programs stop` |  |
| `hoody daemon programs edit` | `hoody daemon programs update` |  |
| `hoody daemon programs logs` | `hoody daemon programs logs get` |  |
| `hoody daemon programs sandbox` | `hoody daemon programs sandbox get` |  |
| `hoody daemon programs statuses` | `hoody daemon programs status` |  |
| `hoody daemon programs stream-logs` | `hoody daemon programs logs stream` |  |

### `hoody db`

| Old | New | Note |
|---|---|---|
| `hoody db exec-shareable` | `hoody db readonly query` |  |
| `hoody db exec-transaction` | `hoody db transactions run` |  |
| `hoody db health-cache` | `hoody db cache stats` |  |
| `hoody db maintenance` | `hoody db maintenance run` |  |

### `hoody desktop`

| Old | New | Note |
|---|---|---|
| `hoody desktop list (alias ls)` | `hoody desktop list` |  |

### `hoody display`

| Old | New | Note |
|---|---|---|
| `hoody display access` | removed | Use `hoody display open`. |
| `hoody display info` | `hoody display get` |  |
| `hoody display input batch` | `hoody display input batch act` |  |
| `hoody display input click-at` | `hoody display input click` |  |
| `hoody display input geometry` | `hoody display geometry get` |  |
| `hoody display input type-at` | `hoody display input type` |  |
| `hoody display input wait-until` | `hoody display windows wait` |  |
| `hoody display keyboard key` | `hoody display keyboard press` |  |
| `hoody display keyboard key-down` | `hoody display keyboard down` |  |
| `hoody display keyboard key-up` | `hoody display keyboard up` |  |
| `hoody display mouse double-click` | `hoody display mouse click --double` |  |
| `hoody display mouse location` | `hoody display mouse position get` |  |
| `hoody display mouse move-relative` | `hoody display mouse move --relative` |  |
| `hoody display screenshots by-timestamp` | `hoody display screenshots get` |  |
| `hoody display screenshots capture-metadata` | `hoody display screenshots capture --metadata` | `--metadata` returns only the metadata. |
| `hoody display screenshots latest` | `hoody display screenshots latest get` |  |
| `hoody display screenshots latest-metadata` | `hoody display screenshots latest get --metadata` | `--metadata` returns only the metadata. |
| `hoody display thumbnails by-timestamp` | `hoody display thumbnails get` |  |
| `hoody display thumbnails latest` | `hoody display thumbnails latest get` |  |
| `hoody display windows active` | `hoody display windows active get` |  |
| `hoody display windows geometry` | `hoody display windows geometry get` |  |
| `hoody display windows name` | `hoody display windows title get` |  |
| `hoody display windows properties` | `hoody display windows get` |  |

### `hoody egress`

| Old | New | Note |
|---|---|---|
| `hoody egress local` | `hoody egress local start` |  |
| `hoody egress upstream clear` | `hoody egress upstream disable` |  |

### `hoody events`

| Old | New | Note |
|---|---|---|
| `hoody events bulk-delete` | `hoody events clear` |  |
| `hoody events cleanup` | `hoody events purge` |  |
| `hoody events watch` | `hoody events stream` |  |

### `hoody exec`

| Old | New | Note |
|---|---|---|
| `hoody exec logs read` | `hoody exec logs get` |  |
| `hoody exec magic-comments bulk-update` | `hoody exec magic comments batch update` |  |
| `hoody exec magic-comments read` | `hoody exec magic comments get` |  |
| `hoody exec magic-comments schema` | `hoody exec magic comments schema get` |  |
| `hoody exec magic-comments update` | `hoody exec magic comments update` |  |
| `hoody exec openapi serve` | `hoody exec openapi get` |  |
| `hoody exec openapi serve-schema` | `hoody exec openapi schema get` |  |
| `hoody exec packages add-modules` | `hoody exec modules install` |  |
| `hoody exec packages check` | `hoody exec modules test` |  |
| `hoody exec packages json init` | `hoody exec packages manifest create` |  |
| `hoody exec packages json read` | `hoody exec packages manifest get` |  |
| `hoody exec packages json update` | `hoody exec packages manifest update` |  |
| `hoody exec packages list` | `hoody exec modules list` |  |
| `hoody exec routes discover` | `hoody exec routes list` |  |
| `hoody exec schedules history` | `hoody exec schedules history list` |  |
| `hoody exec schedules trigger` | `hoody exec schedules run` |  |
| `hoody exec scripts list-user` | `hoody exec openapi scripts list` |  |
| `hoody exec scripts monitor` | `hoody exec scripts stats list` |  |
| `hoody exec scripts performance` | `hoody exec scripts stats get` |  |
| `hoody exec scripts tree` | `hoody exec scripts tree get` |  |
| `hoody exec state clear` | `hoody exec store clear` |  |
| `hoody exec state get` | `hoody exec store get` |  |
| `hoody exec state set` | `hoody exec store set` |  |
| `hoody exec system active-requests` | `hoody exec requests list` |  |
| `hoody exec system cache-clear` | `hoody exec cache clear` |  |
| `hoody exec system prometheus` | `hoody exec metrics` |  |
| `hoody exec system restart` | `hoody exec restart` |  |
| `hoody exec system restart-status` | `hoody exec status` |  |
| `hoody exec system stats` | `hoody exec stats` |  |
| `hoody exec validate dependencies` | `hoody exec scripts dependencies validate` |  |
| `hoody exec validate magic-comments` | `hoody exec magic comments validate` |  |
| `hoody exec validate return-type` | `hoody exec scripts returns validate` |  |
| `hoody exec validate script` | `hoody exec scripts validate` |  |
| `hoody exec validate syntax` | `hoody exec scripts syntax validate` |  |
| `hoody exec validate types` | `hoody exec scripts types validate` |  |
| `hoody exec validate user-schema` | `hoody exec openapi schema validate` |  |

### `hoody files`

| Old | New | Note |
|---|---|---|
| `hoody files access ftp` | `hoody files ftp get` |  |
| `hoody files access s3` | `hoody files s3 get` |  |
| `hoody files access ssh` | `hoody files ssh get` |  |
| `hoody files access ssh-upload` | `hoody files ssh upload` |  |
| `hoody files access webdav` | `hoody files webdav get` |  |
| `hoody files archive preview` | `hoody files archives preview` |  |
| `hoody files archive view` | `hoody files archives members read` |  |
| `hoody files backends connect azureblob` | `hoody files backends azureblob create` |  |
| `hoody files backends connect azurefiles` | `hoody files backends azurefiles create` |  |
| `hoody files backends connect b2` | `hoody files backends b2 create` |  |
| `hoody files backends connect box` | `hoody files backends box create` |  |
| `hoody files backends connect cloudinary` | `hoody files backends cloudinary create` |  |
| `hoody files backends connect drive` | `hoody files backends drive create` |  |
| `hoody files backends connect dropbox` | `hoody files backends dropbox create` |  |
| `hoody files backends connect fichier` | `hoody files backends fichier create` |  |
| `hoody files backends connect filefabric` | `hoody files backends filefabric create` |  |
| `hoody files backends connect filescom` | `hoody files backends filescom create` |  |
| `hoody files backends connect ftp` | `hoody files backends ftp create` |  |
| `hoody files backends connect gofile` | `hoody files backends gofile create` |  |
| `hoody files backends connect google-cloud-storage` | `hoody files backends googlecloudstorage create` |  |
| `hoody files backends connect google-photos` | `hoody files backends googlephotos create` |  |
| `hoody files backends connect hdfs` | `hoody files backends hdfs create` |  |
| `hoody files backends connect hidrive` | `hoody files backends hidrive create` |  |
| `hoody files backends connect http` | `hoody files backends http create` |  |
| `hoody files backends connect iclouddrive` | `hoody files backends iclouddrive create` |  |
| `hoody files backends connect imagekit` | `hoody files backends imagekit create` |  |
| `hoody files backends connect internetarchive` | `hoody files backends internetarchive create` |  |
| `hoody files backends connect jottacloud` | `hoody files backends jottacloud create` |  |
| `hoody files backends connect koofr` | `hoody files backends koofr create` |  |
| `hoody files backends connect linkbox` | `hoody files backends linkbox create` |  |
| `hoody files backends connect mailru` | `hoody files backends mailru create` |  |
| `hoody files backends connect mega` | `hoody files backends mega create` |  |
| `hoody files backends connect netstorage` | `hoody files backends netstorage create` |  |
| `hoody files backends connect onedrive` | `hoody files backends onedrive create` |  |
| `hoody files backends connect opendrive` | `hoody files backends opendrive create` |  |
| `hoody files backends connect oracleobjectstorage` | `hoody files backends oracleobjectstorage create` |  |
| `hoody files backends connect pcloud` | `hoody files backends pcloud create` |  |
| `hoody files backends connect pikpak` | `hoody files backends pikpak create` |  |
| `hoody files backends connect pixeldrain` | `hoody files backends pixeldrain create` |  |
| `hoody files backends connect premiumizeme` | `hoody files backends premiumizeme create` |  |
| `hoody files backends connect protondrive` | `hoody files backends protondrive create` |  |
| `hoody files backends connect putio` | `hoody files backends putio create` |  |
| `hoody files backends connect qingstor` | `hoody files backends qingstor create` |  |
| `hoody files backends connect quatrix` | `hoody files backends quatrix create` |  |
| `hoody files backends connect s3` | `hoody files backends s3 create` |  |
| `hoody files backends connect seafile` | `hoody files backends seafile create` |  |
| `hoody files backends connect sftp` | `hoody files backends sftp create` |  |
| `hoody files backends connect sharefile` | `hoody files backends sharefile create` |  |
| `hoody files backends connect sia` | `hoody files backends sia create` |  |
| `hoody files backends connect smb` | `hoody files backends smb create` |  |
| `hoody files backends connect sugarsync` | `hoody files backends sugarsync create` |  |
| `hoody files backends connect swift` | `hoody files backends swift create` |  |
| `hoody files backends connect ulozto` | `hoody files backends ulozto create` |  |
| `hoody files backends connect webdav` | `hoody files backends webdav create` |  |
| `hoody files backends connect yandex` | `hoody files backends yandex create` |  |
| `hoody files backends connect zoho` | `hoody files backends zoho create` |  |
| `hoody files backends disconnect` | `hoody files backends delete` |  |
| `hoody files delete-recursive` | removed | Use `hoody files delete`. |
| `hoody files dir` | removed | Use `hoody files get` for a listing, or `hoody files open`. |
| `hoody files downloads active` | `hoody files downloads list` |  |
| `hoody files downloads all` | `hoody files downloads list` |  |
| `hoody files downloads history` | `hoody files downloads history list` |  |
| `hoody files downloads url` | `hoody files downloads create` |  |
| `hoody files downloads zip` | `hoody files zip` |  |
| `hoody files extractions active` | removed | Use `hoody files extractions list`. |
| `hoody files extractions all` | `hoody files extractions list` |  |
| `hoody files extractions create` | `hoody files archives extract` |  |
| `hoody files extractions extract-file` | `hoody files archives members extract` |  |
| `hoody files extractions history` | `hoody files extractions history list` |  |
| `hoody files journal query` | `hoody files journal list` |  |
| `hoody files metadata` | `hoody files exists` |  |
| `hoody files mkdir` | removed | `hoody files mkdir` still exists; it now always sends the POST form. |
| `hoody files modify-properties` | `hoody files update` |  |
| `hoody files mounts unmount` | `hoody files mounts delete` |  |
| `hoody files operation` | `hoody files mkdir` or `hoody files archives extract` or `hoody files downloads create` | Split: choose the command that matches what you meant. `--owner <owner>` on `extract` and `downloads create` sets the owner of the new files; it selects the old combined operation. |
| `hoody files options` | removed | Removed: HTTP OPTIONS introspection is not a command. |
| `hoody files patch` | `hoody files chunks write` |  |
| `hoody files pending-uploads deliver` | `hoody files uploads deliver` |  |
| `hoody files pending-uploads discard` | `hoody files uploads delete` |  |
| `hoody files pending-uploads download` | `hoody files uploads download` |  |
| `hoody files pending-uploads files` | `hoody files uploads files list` |  |
| `hoody files pending-uploads list` | `hoody files uploads list` |  |
| `hoody files pending-uploads stop` | `hoody files uploads stop` |  |
| `hoody files pending-uploads unreadable discard` | `hoody files uploads unreadable delete` |  |
| `hoody files pending-uploads unreadable list` | `hoody files uploads unreadable list` |  |
| `hoody files process-image` | `hoody files images convert` |  |
| `hoody files put` | `hoody files upload` |  |
| `hoody files upload` | removed | The name now belongs to the upload command that was `hoody files put`. |

### `hoody firewall`

| Old | New | Note |
|---|---|---|
| `hoody firewall egress toggle` | `hoody firewall egress enable` or `hoody firewall egress disable` | Split: choose the command that matches what you meant. |
| `hoody firewall ingress toggle` | `hoody firewall ingress enable` or `hoody firewall ingress disable` | Split: choose the command that matches what you meant. |
| `hoody firewall list` | `hoody firewall rules list` |  |

### `hoody images`

| Old | New | Note |
|---|---|---|
| `hoody images icon` | `hoody images icon get` |  |
| `hoody images import-free` | `hoody images import` |  |
| `hoody images mine` | `hoody images list --mine` | Without `--mine` the command lists public images. |
| `hoody images purchase` | `hoody images buy` |  |

### `hoody inbox`

| Old | New | Note |
|---|---|---|
| `hoody inbox list-public` | `hoody inbox announcements list` |  |
| `hoody inbox mark` | `hoody inbox mark read` |  |
| `hoody inbox mark-all` | `hoody inbox mark read --all` | Without `--all` the command marks one notification. |

### `hoody kits`

| Old | New | Note |
|---|---|---|
| `hoody kits (alias kit) list (alias ls)` | `hoody kits list` |  |

### `hoody kv`

| Old | New | Note |
|---|---|---|
| `hoody kv arrays delete` | `hoody kv arrays remove` |  |
| `hoody kv decr` | `hoody kv decrement` |  |
| `hoody kv history` | `hoody kv history list` |  |
| `hoody kv incr` | `hoody kv increment` |  |
| `hoody kv rollback-table` | `hoody kv table rollback` |  |
| `hoody kv snapshots compare-table` | `hoody kv table snapshots compare` |  |
| `hoody kv snapshots get-key` | `hoody kv snapshots get` |  |
| `hoody kv snapshots get-table` | `hoody kv table snapshots get` |  |

### `hoody local`

| Old | New | Note |
|---|---|---|
| `hoody local defaults show` | `hoody local defaults get` |  |
| `hoody local defaults unset` | `hoody local defaults clear` |  |
| `hoody local lock change` | `hoody local lock password set` |  |
| `hoody local lock enforce` | `hoody local lock ephemeral enable` or `hoody local lock ephemeral disable` | Split: choose the command that matches what you meant. |
| `hoody local lock remove` | `hoody local lock disable` |  |
| `hoody local lock setup` | `hoody local lock enable` |  |

### `hoody logout`

| Old | New | Note |
|---|---|---|
| `hoody logout` | `hoody logout` or `hoody logout --all` | Split: choose the command that matches what you meant. |

### `hoody meta`

| Old | New | Note |
|---|---|---|
| `hoody meta config` | `hoody meta config get` |  |
| `hoody meta config-get` | `hoody meta config values get` |  |
| `hoody meta get` | `hoody meta key get` |  |
| `hoody meta social-stats` | `hoody meta social stats` |  |

### `hoody notes`

| Old | New | Note |
|---|---|---|
| `hoody notes avatar download` | `hoody notes avatars download` |  |
| `hoody notes avatar upload` | `hoody notes avatars upload` |  |
| `hoody notes collab add` | `hoody notes collaborators add` |  |
| `hoody notes collab list` | `hoody notes collaborators list` |  |
| `hoody notes collab remove` | `hoody notes collaborators remove` |  |
| `hoody notes collab update` | `hoody notes collaborators role set` |  |
| `hoody notes comment anchors` | `hoody notes comments anchors list` |  |
| `hoody notes comment create` | `hoody notes comments create` |  |
| `hoody notes comment delete` | `hoody notes comments delete` |  |
| `hoody notes comment edit` | `hoody notes comments update` |  |
| `hoody notes comment list` | `hoody notes comments list` |  |
| `hoody notes comment reanchor` | `hoody notes comments anchor set` |  |
| `hoody notes comment resolve` | `hoody notes comments resolve` |  |
| `hoody notes db create` | `hoody notes records create` |  |
| `hoody notes db delete` | `hoody notes records delete` |  |
| `hoody notes db get` | `hoody notes records get` |  |
| `hoody notes db list` | `hoody notes records list` |  |
| `hoody notes db search` | `hoody notes records search` |  |
| `hoody notes db update` | `hoody notes records update` |  |
| `hoody notes doc append` | `hoody notes document append` |  |
| `hoody notes doc block-svg` | `hoody notes document blocks export` |  |
| `hoody notes doc export-ticket` | `hoody notes document tickets create` |  |
| `hoody notes doc get` | `hoody notes document get` |  |
| `hoody notes doc patch` | `hoody notes document update` |  |
| `hoody notes doc put` | `hoody notes document set` |  |
| `hoody notes file download` | `hoody notes files download` |  |
| `hoody notes file list` | `hoody notes files list` |  |
| `hoody notes node children` | `hoody notes nodes children list` |  |
| `hoody notes node create` | `hoody notes nodes create` |  |
| `hoody notes node delete` | `hoody notes nodes delete` |  |
| `hoody notes node get` | `hoody notes nodes get` |  |
| `hoody notes node get-by-alias` | `hoody notes nodes resolve` |  |
| `hoody notes node list` | `hoody notes nodes list` |  |
| `hoody notes node mark-opened` | `hoody notes nodes mark opened` |  |
| `hoody notes node mark-seen` | `hoody notes nodes mark seen` |  |
| `hoody notes node update` | `hoody notes nodes update` |  |
| `hoody notes notebook create` | `hoody notes notebooks create` |  |
| `hoody notes notebook delete` | `hoody notes notebooks delete` |  |
| `hoody notes notebook get` | `hoody notes notebooks get` |  |
| `hoody notes notebook list` | `hoody notes notebooks list` |  |
| `hoody notes notebook update` | `hoody notes notebooks update` |  |
| `hoody notes reaction add` | `hoody notes reactions add` |  |
| `hoody notes reaction list` | `hoody notes reactions list` |  |
| `hoody notes reaction remove` | `hoody notes reactions remove` |  |
| `hoody notes user invite` | `hoody notes members invite` |  |
| `hoody notes user set-role` | `hoody notes members role set` |  |
| `hoody notes version create` | `hoody notes versions create` |  |
| `hoody notes version delete` | `hoody notes versions delete` |  |
| `hoody notes version get` | `hoody notes versions get` |  |
| `hoody notes version list` | `hoody notes versions list` |  |
| `hoody notes version restore` | `hoody notes versions restore` |  |

### `hoody notifications`

| Old | New | Note |
|---|---|---|
| `hoody notifications clear-dismissed` | `hoody notifications restore` |  |
| `hoody notifications icon` | `hoody notifications icons get` |  |
| `hoody notifications trigger` | `hoody notifications send` |  |

### `hoody pipe`

| Old | New | Note |
|---|---|---|
| `hoody pipe forward-tcp` | `hoody pipe forward` |  |
| `hoody pipe help-cheatsheet` | `hoody pipe cheatsheet get` |  |
| `hoody pipe help-cheatsheet` | `hoody pipe cheatsheet get` |  |
| `hoody pipe progress (alias watch)` | `hoody pipe progress stream` |  |
| `hoody pipe receive (alias recv)` | `hoody pipe receive` |  |
| `hoody pipe url` | `hoody pipe url get` |  |

### `hoody pools`

| Old | New | Note |
|---|---|---|
| `hoody pools members delete` | `hoody pools members remove` |  |
| `hoody pools members update-role` | `hoody pools members role set` |  |

### `hoody projects`

| Old | New | Note |
|---|---|---|
| `hoody projects proxy default` | `hoody projects proxy default set` |  |
| `hoody projects proxy permissions replace` | `hoody projects proxy permissions set` |  |
| `hoody projects proxy state` | `hoody projects proxy enable` or `hoody projects proxy disable` | Split: choose the command that matches what you meant. |

### `hoody proxy`

| Old | New | Note |
|---|---|---|
| `hoody proxy create` | `hoody proxy aliases create` |  |
| `hoody proxy delete` | `hoody proxy aliases delete` |  |
| `hoody proxy get` | `hoody proxy aliases get` |  |
| `hoody proxy list` | `hoody proxy aliases list` |  |
| `hoody proxy set-state` | `hoody proxy aliases enable` or `hoody proxy aliases disable` | Split: choose the command that matches what you meant. |
| `hoody proxy update` | `hoody proxy aliases update` |  |

### `hoody ps`

| Old | New | Note |
|---|---|---|
| `hoody ps` | removed | Use `hoody containers list`. |

### `hoody pty`

| Old | New | Note |
|---|---|---|
| `hoody pty` | removed | Use `hoody shell`. |

### `hoody run`

| Old | New | Note |
|---|---|---|
| `hoody run config` | `hoody run config get` |  |
| `hoody run go` | `hoody run resolve` |  |
| `hoody run jobs search` | `hoody run jobs search create` |  |
| `hoody run preflight` | `hoody run test` |  |
| `hoody run profiles select` | `hoody run profiles use` |  |
| `hoody run recipes run` | `hoody run recipes resolve` |  |
| `hoody run search` | removed | Use `hoody run search` (it is the paged search now). |
| `hoody run search-paged` | `hoody run search` |  |
| `hoody run sources diagnostics` | `hoody run sources diagnostics get` |  |
| `hoody run sources sync-all` | `hoody run sources sync` |  |

### `hoody screenshot`

| Old | New | Note |
|---|---|---|
| `hoody screenshot (alias ss)` | `hoody screenshot` |  |

### `hoody servers`

| Old | New | Note |
|---|---|---|
| `hoody servers commands` | `hoody servers commands list` |  |
| `hoody servers exec` | `hoody servers commands run` |  |
| `hoody servers get-rental` | removed | Use `hoody servers get`. |
| `hoody servers list-rentals` | removed | Use `hoody servers list`. |
| `hoody servers marketplace` | `hoody servers marketplace list` |  |
| `hoody servers runtime` | `hoody servers stats` |  |
| `hoody servers subscriptions auto-renew` | `hoody servers subscriptions autorenew enable` or `hoody servers subscriptions autorenew disable` | Split: choose the command that matches what you meant. |
| `hoody servers subscriptions operation` | `hoody servers jobs get` |  |
| `hoody servers subscriptions quote` | `hoody servers plans quote` |  |
| `hoody servers subscriptions quote-change` | `hoody servers subscriptions quote` |  |

### `hoody shell`

| Old | New | Note |
|---|---|---|
| `hoody shell (alias sh)` | `hoody shell` |  |

### `hoody snapshots`

| Old | New | Note |
|---|---|---|
| `hoody snapshots update-alias` | `hoody snapshots alias set` |  |

### `hoody ssh`

| Old | New | Note |
|---|---|---|
| `hoody ssh` | removed | Use `hoody shell` (`--ssh-host` still bridges to an SSH server). |

### `hoody storage`

| Old | New | Note |
|---|---|---|
| `hoody storage create` | `hoody storage shares create` |  |
| `hoody storage delete` | `hoody storage shares delete` |  |
| `hoody storage get` | `hoody storage shares get` |  |
| `hoody storage incoming list` | `hoody storage containers incoming list` |  |
| `hoody storage incoming list-all` | `hoody storage incoming list` |  |
| `hoody storage incoming toggle-mount` | `hoody storage incoming mount` or `hoody storage incoming unmount` | Split: choose the command that matches what you meant. |
| `hoody storage list` | `hoody storage containers shares list` |  |
| `hoody storage list-all` | `hoody storage shares list` |  |
| `hoody storage update` | `hoody storage shares update` |  |

### `hoody terminal`

| Old | New | Note |
|---|---|---|
| `hoody terminal automation keys` | `hoody terminal keys list` |  |
| `hoody terminal automation metrics` | `hoody terminal automation stats` |  |
| `hoody terminal processes freeze` | `hoody terminal processes pause` |  |
| `hoody terminal processes unfreeze` | `hoody terminal processes resume` |  |
| `hoody terminal sessions abort` | `hoody terminal commands cancel` |  |
| `hoody terminal sessions automation-state` | `hoody terminal sessions automation status` |  |
| `hoody terminal sessions command-result` | `hoody terminal commands get` |  |
| `hoody terminal sessions exec` | `hoody terminal commands run` |  |
| `hoody terminal sessions find` | `hoody terminal sessions search` |  |
| `hoody terminal sessions history` | `hoody terminal commands list` |  |
| `hoody terminal sessions mouse` | `hoody terminal sessions mouse send` |  |
| `hoody terminal sessions raw-output` | `hoody terminal sessions read` |  |
| `hoody terminal sessions screenshot` | `hoody terminal sessions screenshots capture` |  |
| `hoody terminal sessions snapshot` | `hoody terminal sessions snapshot get` |  |
| `hoody terminal sessions web` | removed | Use `hoody terminal open`. |
| `hoody terminal sh` | removed | Use `hoody shell`, or `hoody terminal sessions connect`. |
| `hoody terminal system daemon-config` | `hoody terminal system daemon programs list` |  |
| `hoody terminal system display-info` | `hoody terminal system displays list` |  |
| `hoody terminal system ports` | `hoody terminal system ports list` |  |
| `hoody terminal system resources` | `hoody terminal system stats` |  |
| `hoody terminal system stop-display` | `hoody terminal system displays stop` |  |

### `hoody tunnel`

| Old | New | Note |
|---|---|---|
| `hoody tunnel sessions kill` | `hoody tunnel sessions close` |  |

### `hoody users`

| Old | New | Note |
|---|---|---|
| `hoody users free-tier-status` | `hoody users free tier status` |  |
| `hoody users mark-onboarding` | `hoody users onboarding milestones complete` |  |
| `hoody users redeem-invite` | `hoody users invites redeem` |  |
| `hoody users retry-setup` | `hoody users setup retry` |  |
| `hoody users security-history` | `hoody users security history list` |  |

### `hoody wallet`

| Old | New | Note |
|---|---|---|
| `hoody wallet balance ai` | `hoody wallet credits get` |  |
| `hoody wallet balance general` | `hoody wallet balance get` |  |
| `hoody wallet balance get` | `hoody wallet balances get` |  |
| `hoody wallet github-bonus claim` | `hoody wallet github bonus claim` |  |
| `hoody wallet github-bonus status` | `hoody wallet github bonus status` |  |
| `hoody wallet invoices generate` | `hoody wallet invoices create` |  |
| `hoody wallet payment-methods create` | `hoody wallet payments methods create` |  |
| `hoody wallet payment-methods delete` | `hoody wallet payments methods delete` |  |
| `hoody wallet payment-methods get` | `hoody wallet payments methods get` |  |
| `hoody wallet payment-methods list` | `hoody wallet payments methods list` |  |
| `hoody wallet payment-methods set-default` | `hoody wallet payments methods default set` |  |
| `hoody wallet payment-methods update` | `hoody wallet payments methods update` |  |
| `hoody wallet payments availability` | `hoody wallet payments availability get` |  |
| `hoody wallet payments crypto invoice` | `hoody wallet payments crypto invoices create` |  |
| `hoody wallet payments stripe checkout` | `hoody wallet payments stripe checkout create` |  |
| `hoody wallet transactions fees` | `hoody wallet credits fees list` |  |
| `hoody wallet transfer` | `hoody wallet credits transfer` |  |

## SDK: old accessor to new accessor

Accessors are written from the client (`client.api.auth.tokens.create` is `hoody.api.auth.tokens.create` on an account client and `box.<ns>...` on a container-scoped one).
Pagination helpers (`listAll`, `listIterator`) moved with their base method and have their own rows. Request and response type names follow the final method name (`DaemonProgramsAddRequest` is now `DaemonProgramsCreateRequest`).

### Client helpers (hand-written)

| Old | New | Note |
|---|---|---|
| `HoodyClient.authenticate()` | `HoodyClient.login()` |  |
| `client.attachProgramTerminal(container, program)` | `client.daemon.programs.attachTerminal(program)` |  |
| `client.createDesktopTerminal()` | `client.terminal.sessions.createDesktop()` |  |
| `client.createLocalTerminal()` | `client.terminal.sessions.createLocal()` |  |
| `client.createSshTerminal()` | `client.terminal.sessions.createSsh()` |  |
| `client.curlChannel()` | `client.curl.channel.connect()` |  |
| `client.execute(command)` | `client.terminal.run(command)` |  |
| `client.executeSshCommand()` | `client.terminal.commands.runSsh()` |  |
| `client.getDesktopEnvironments() / HoodyClient.getDesktopEnvironments()` | `client.listDesktopEnvironments() / HoodyClient.listDesktopEnvironments()` |  |
| `client.getKitCatalog() / HoodyClient.getKitCatalog()` | `client.listKits() / HoodyClient.listKits()` |  |
| `client.getProgramTerminalId(container, program)` | `client.daemon.programs.getTerminalId(program)` |  |
| `client.listAgentConfigTools()` | `client.agent.listLocalConfigTools()` |  |
| `client.saveBrowserScreenshot()` | `client.browser.page.saveScreenshot()` |  |
| `client.saveDisplayScreenshot()` | `client.display.screenshots.save()` |  |
| `client.saveTerminalScreenshot()` | `client.terminal.sessions.saveScreenshot()` |  |
| `client.syncAgentConfig(tool)` | `client.agent.importLocalConfig(tool)` |  |
| `client.syncAgentConfigs(tools)` | `client.agent.importLocalConfigs(tools)` |  |
| `getKitCatalogEntries()` | `listKits()` |  |
| `patchExecScriptsServicePrototype, patchHoodyClientMetrics, patch*Prototype (13 exports)` | `not exported` | Install-time plumbing, no longer exported. |

### `agent`

| Old | New | Note |
|---|---|---|
| `client.agent.agents.copyAgent` | `client.agent.definitions.copy` |  |
| `client.agent.agents.createAgent` | `client.agent.definitions.create` |  |
| `client.agent.agents.deleteAgent` | `client.agent.definitions.delete` |  |
| `client.agent.agents.getAgentSource` | `client.agent.definitions.getSource` |  |
| `client.agent.agents.listAgentFiles` | `client.agent.files.list` |  |
| `client.agent.agents.listAgentFilesAll` | `client.agent.files.listAll` |  |
| `client.agent.agents.listAgentFilesIterator` | `client.agent.files.listIterator` |  |
| `client.agent.agents.listAgents` | `client.agent.definitions.list` |  |
| `client.agent.agents.listAgentsAll` | `client.agent.definitions.listAll` |  |
| `client.agent.agents.listAgentsIterator` | `client.agent.definitions.listIterator` |  |
| `client.agent.agents.putAgentSource` | `client.agent.definitions.setSource` |  |
| `client.agent.agents.renameAgent` | `client.agent.definitions.rename` |  |
| `client.agent.agents.resetAgentToShipped` | `client.agent.definitions.reset` |  |
| `client.agent.agents.setAgentModel` | `client.agent.definitions.setModel` |  |
| `client.agent.agents.setAgentTools` | `client.agent.definitions.setTools` |  |
| `client.agent.agents.setAgentTurns` | `client.agent.definitions.setTurnLimit` |  |
| `client.agent.agents.toggleAgentTool` | `client.agent.definitions.toggleTool` |  |
| `client.agent.changes.getChanges` | `client.agent.changes.get` |  |
| `client.agent.changes.streamChanges` | `client.agent.changes.stream` |  |
| `client.agent.discovery.listContainers` | `client.agent.containers.list` |  |
| `client.agent.discovery.listContainersAll` | `client.agent.containers.listAll` |  |
| `client.agent.discovery.listContainersIterator` | `client.agent.containers.listIterator` |  |
| `client.agent.discovery.listRealms` | `client.agent.realms.list` |  |
| `client.agent.discovery.listRealmsAll` | `client.agent.realms.listAll` |  |
| `client.agent.discovery.listRealmsIterator` | `client.agent.realms.listIterator` |  |
| `client.agent.exportLogs` | `client.agent.logs.export` |  |
| `client.agent.github.githubAddWorktree` | `client.agent.github.createWorktree` |  |
| `client.agent.github.githubAuthStatus` | `client.agent.github.getAuth` |  |
| `client.agent.github.githubBranches` | `client.agent.github.listBranches` |  |
| `client.agent.github.githubCheckoutPR` | `client.agent.github.checkoutPr` |  |
| `client.agent.github.githubClone` | `client.agent.github.clone` |  |
| `client.agent.github.githubCommit` | `client.agent.github.createCommit` |  |
| `client.agent.github.githubCommitPush` | `client.agent.github.createCommit` |  |
| `client.agent.github.githubCreateBranch` | `client.agent.github.createBranch` |  |
| `client.agent.github.githubCreateIssue` | `client.agent.github.createIssue` |  |
| `client.agent.github.githubDeleteBranch` | `client.agent.github.deleteBranch` |  |
| `client.agent.github.githubDiff` | `client.agent.github.diff` |  |
| `client.agent.github.githubListIssues` | `client.agent.github.listIssues` |  |
| `client.agent.github.githubListPRs` | `client.agent.github.listPrs` |  |
| `client.agent.github.githubListWorktrees` | `client.agent.github.listWorktrees` |  |
| `client.agent.github.githubLog` | `client.agent.github.listCommits` |  |
| `client.agent.github.githubLogin` | `client.agent.github.login` |  |
| `client.agent.github.githubLoginPoll` | `client.agent.github.pollLogin` |  |
| `client.agent.github.githubLogout` | `client.agent.github.logout` |  |
| `client.agent.github.githubMergePR` | `client.agent.github.mergePr` |  |
| `client.agent.github.githubPullRequest` | `client.agent.github.createPr` |  |
| `client.agent.github.githubReconnectRepo` | `client.agent.github.setRepoCredentials` |  |
| `client.agent.github.githubRemoveWorktree` | `client.agent.github.deleteWorktree` |  |
| `client.agent.github.githubRepoIdentity` | `client.agent.github.resolveRepo` |  |
| `client.agent.github.githubRepos` | `client.agent.github.listRepos` |  |
| `client.agent.github.githubSetActiveAccount` | `client.agent.github.useAccount` |  |
| `client.agent.github.githubStash` | `client.agent.github.pushStash` |  |
| `client.agent.github.githubStashPop` | `client.agent.github.popStash` |  |
| `client.agent.github.githubStatus` | `client.agent.github.getStatus` |  |
| `client.agent.github.githubSuggestCommitMessage` | `client.agent.github.suggestCommitMessage` |  |
| `client.agent.github.githubSwitchBranch` | `client.agent.github.useBranch` |  |
| `client.agent.github.githubSync` | `client.agent.github.sync` |  |
| `client.agent.headless.createHeadlessRun` | `client.agent.headless.start` or `client.agent.headless.stream` | Split: choose the method that matches what you meant. |
| `client.agent.hoody.bootstrapHoodyToken` | `client.agent.platform.bootstrapToken` |  |
| `client.agent.hoody.getHoodyAuthStatus` | `client.agent.whoami` |  |
| `client.agent.hoody.setActiveRealm` | `client.agent.realms.use` |  |
| `client.agent.hooks.ackHookTrust` | `client.agent.hooks.trust` |  |
| `client.agent.hooks.beginHookWrite` | `client.agent.hooks.createWriteIntent` |  |
| `client.agent.hooks.deleteHook` | `client.agent.hooks.delete` |  |
| `client.agent.hooks.disableAllHooks` | `client.agent.hooks.enableAll` or `client.agent.hooks.disableAll` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.getHookRules` | `client.agent.hooks.getRules` |  |
| `client.agent.hooks.listHooks` | `client.agent.hooks.list` |  |
| `client.agent.hooks.reloadHooks` | `client.agent.hooks.reload` |  |
| `client.agent.hooks.setHookRules` | `client.agent.hooks.setRules` |  |
| `client.agent.hooks.testHook` | `client.agent.hooks.run` or `client.agent.hooks.test` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.toggleHook` | `client.agent.hooks.enable` or `client.agent.hooks.disable` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.upsertHook` | `client.agent.hooks.upsert` |  |
| `client.agent.jobs.deleteJob` | `client.agent.jobs.delete` |  |
| `client.agent.jobs.getJob` | `client.agent.jobs.get` |  |
| `client.agent.jobs.getJobResult` | `client.agent.jobs.getResult` |  |
| `client.agent.logs.logsSources` | `client.agent.logs.listSources` |  |
| `client.agent.logs.logsStats` | `client.agent.logs.getStats` |  |
| `client.agent.logs.queryLogs` | `client.agent.logs.list` |  |
| `client.agent.logs.readLogEntry` | `client.agent.logs.get` |  |
| `client.agent.logs.streamLogs` | `client.agent.logs.stream` |  |
| `client.agent.loops.createLoop` | `client.agent.loops.create` |  |
| `client.agent.loops.deleteLoop` | `client.agent.loops.delete` |  |
| `client.agent.loops.listAllLoops` | `client.agent.loops.list` |  |
| `client.agent.loops.listAllLoopsAll` | `client.agent.loops.listAll` |  |
| `client.agent.loops.listAllLoopsIterator` | `client.agent.loops.listIterator` |  |
| `client.agent.loops.listLoops` | `client.agent.sessions.listLoops` |  |
| `client.agent.loops.listLoopsAll` | `client.agent.sessions.listLoopsAll` |  |
| `client.agent.loops.listLoopsIterator` | `client.agent.sessions.listLoopsIterator` |  |
| `client.agent.loops.runLoopNow` | `client.agent.loops.startRun` |  |
| `client.agent.loops.updateLoop` | `client.agent.loops.update` |  |
| `client.agent.mcp.beginMCPWrite` | `client.agent.mcp.createWriteIntent` |  |
| `client.agent.mcp.deleteMCPServer` | `client.agent.mcp.deleteServer` |  |
| `client.agent.mcp.importMCPServers` | `client.agent.mcp.importServers` |  |
| `client.agent.mcp.listMCPServers` | `client.agent.mcp.listServers` |  |
| `client.agent.mcp.parseMCPImport` | `client.agent.mcp.previewImport` |  |
| `client.agent.mcp.probeMCPServer` | `client.agent.mcp.testServer` |  |
| `client.agent.mcp.reconnectMCP` | `client.agent.mcp.reconnect` |  |
| `client.agent.mcp.setMCPServerEnabled` | `client.agent.mcp.enableServer` or `client.agent.mcp.disableServer` | Split: choose the method that matches what you meant. |
| `client.agent.mcp.upsertMCPServer` | `client.agent.mcp.upsertServer` |  |
| `client.agent.memory.assignMemoryDataHost` | `client.agent.memory.claimDataHost` |  |
| `client.agent.memory.beginMemoryWrite` | `client.agent.memory.createWriteIntent` |  |
| `client.agent.memory.consolidateMemory` | `client.agent.memory.consolidate` |  |
| `client.agent.memory.deleteMemoryItem` | `client.agent.memory.deleteItem` |  |
| `client.agent.memory.deleteMemoryProject` | `client.agent.memory.deleteProject` |  |
| `client.agent.memory.editMemoryItem` | `client.agent.memory.updateItem` |  |
| `client.agent.memory.flushMemory` | `client.agent.memory.flush` |  |
| `client.agent.memory.getMemoryDataHost` | `client.agent.memory.getDataHost` |  |
| `client.agent.memory.getMemoryGraph` | `client.agent.memory.getGraph` |  |
| `client.agent.memory.getMemoryItem` | `client.agent.memory.getItem` |  |
| `client.agent.memory.getMemoryStatus` | `client.agent.memory.getStatus` |  |
| `client.agent.memory.listMemoryItems` | `client.agent.memory.listItems` |  |
| `client.agent.memory.listMemoryItemsAll` | `client.agent.memory.listItemsAll` |  |
| `client.agent.memory.listMemoryItemsIterator` | `client.agent.memory.listItemsIterator` |  |
| `client.agent.memory.listMemoryProjects` | `client.agent.memory.listProjects` |  |
| `client.agent.memory.listMemoryProjectsAll` | `client.agent.memory.listProjectsAll` |  |
| `client.agent.memory.listMemoryProjectsIterator` | `client.agent.memory.listProjectsIterator` |  |
| `client.agent.memory.saveMemoryItem` | `client.agent.memory.createItem` |  |
| `client.agent.memory.searchMemory` | `client.agent.memory.search` |  |
| `client.agent.memory.setMemoryEnabled` | `client.agent.memory.enable` or `client.agent.memory.disable` | Split: choose the method that matches what you meant. |
| `client.agent.models.addProviderAccount` | `client.agent.providers.addAccount` |  |
| `client.agent.models.createCompletion` | `client.agent.completions.create` |  |
| `client.agent.models.decideJev` | `client.agent.jev.decide` |  |
| `client.agent.models.decideSessionJev` | `client.agent.jev.decideForSession` |  |
| `client.agent.models.deleteProviderAPIKey` | `client.agent.providers.deleteApiKey` |  |
| `client.agent.models.getJevSettings` | `client.agent.jev.getSettings` |  |
| `client.agent.models.getModel` | `client.agent.models.get` |  |
| `client.agent.models.getProvider` | `client.agent.providers.get` |  |
| `client.agent.models.getProviderAuth` | `client.agent.providers.getAuth` |  |
| `client.agent.models.listJevModels` | `client.agent.jev.listModels` |  |
| `client.agent.models.listModels` | `client.agent.models.list` |  |
| `client.agent.models.listModelsAll` | `client.agent.models.listAll` |  |
| `client.agent.models.listModelsIterator` | `client.agent.models.listIterator` |  |
| `client.agent.models.listProviderAccounts` | `client.agent.providers.listAccounts` |  |
| `client.agent.models.listProviderAccountsAll` | `client.agent.providers.listAccountsAll` |  |
| `client.agent.models.listProviderAccountsIterator` | `client.agent.providers.listAccountsIterator` |  |
| `client.agent.models.listProviders` | `client.agent.providers.list` |  |
| `client.agent.models.listProvidersAll` | `client.agent.providers.listAll` |  |
| `client.agent.models.listProvidersIterator` | `client.agent.providers.listIterator` |  |
| `client.agent.models.logoutProviderOAuth` | `client.agent.providers.logoutOauth` |  |
| `client.agent.models.pollProviderOAuth` | `client.agent.providers.pollOauth` |  |
| `client.agent.models.removeProviderAccount` | `client.agent.providers.removeAccount` |  |
| `client.agent.models.setProviderAPIKey` | `client.agent.providers.setApiKey` |  |
| `client.agent.models.setProviderAccountActive` | `client.agent.providers.useAccount` |  |
| `client.agent.models.setProviderDefault` | `client.agent.providers.setDefaultAuth` |  |
| `client.agent.models.startProviderOAuth` | `client.agent.providers.startOauth` |  |
| `client.agent.models.streamCompletion` | `client.agent.completions.create` |  |
| `client.agent.models.submitProviderOAuthCode` | `client.agent.providers.submitOauthCode` |  |
| `client.agent.models.testJev` | `client.agent.jev.test` |  |
| `client.agent.models.updateJevSettings` | `client.agent.jev.updateSettings` |  |
| `client.agent.sessions.acquireApproverLease` | `client.agent.sessions.claimApproverLease` |  |
| `client.agent.sessions.acquireSessionAttachment` | `client.agent.sessions.claimAttachment` |  |
| `client.agent.sessions.answerAssist` | `client.agent.gates.suggest` |  |
| `client.agent.sessions.answerQuestion` | `client.agent.gates.answer` |  |
| `client.agent.sessions.cancelSession` | `client.agent.sessions.turns.cancel` |  |
| `client.agent.sessions.closeSession` | `client.agent.sessions.close` |  |
| `client.agent.sessions.confirmGate` | `client.agent.gates.approve` or `client.agent.gates.deny` | Split: choose the method that matches what you meant. |
| `client.agent.sessions.createSession` | `client.agent.sessions.create` |  |
| `client.agent.sessions.createSessionTurn` | `client.agent.sessions.turns.create` |  |
| `client.agent.sessions.deleteSession` | `client.agent.sessions.delete` |  |
| `client.agent.sessions.deleteSessionApprovalRule` | `client.agent.sessions.deleteApprovalRule` |  |
| `client.agent.sessions.getSession` | `client.agent.sessions.get` |  |
| `client.agent.sessions.getSessionApproval` | `client.agent.sessions.getApproval` |  |
| `client.agent.sessions.getSessionRulesApplies` | `client.agent.sessions.listApplicableRules` |  |
| `client.agent.sessions.getSessionState` | `client.agent.sessions.getSnapshot` |  |
| `client.agent.sessions.getSessionTranscript` | `client.agent.sessions.getTranscript` |  |
| `client.agent.sessions.getSessionTurn` | `client.agent.sessions.turns.get` |  |
| `client.agent.sessions.listPendingGates` | `client.agent.gates.list` |  |
| `client.agent.sessions.listPendingGatesAll` | `client.agent.gates.listAll` |  |
| `client.agent.sessions.listPendingGatesIterator` | `client.agent.gates.listIterator` |  |
| `client.agent.sessions.listSessionCwds` | `client.agent.sessions.listDirectories` |  |
| `client.agent.sessions.listSessionTurns` | `client.agent.sessions.turns.list` |  |
| `client.agent.sessions.listSessions` | `client.agent.sessions.list` |  |
| `client.agent.sessions.listSessionsAll` | `client.agent.sessions.listAll` |  |
| `client.agent.sessions.listSessionsIterator` | `client.agent.sessions.listIterator` |  |
| `client.agent.sessions.postSessionMessage` | `client.agent.sessions.startTurn` |  |
| `client.agent.sessions.postWorkflowMessage` | `client.agent.workflows.sendMessage` |  |
| `client.agent.sessions.promptStream` | `client.agent.sessions.startTurnAndStream` |  |
| `client.agent.sessions.promptSync` | `client.agent.sessions.turns.run` |  |
| `client.agent.sessions.releaseSessionAttachment` | `client.agent.sessions.releaseAttachment` |  |
| `client.agent.sessions.renameSession` | `client.agent.sessions.rename` |  |
| `client.agent.sessions.renewSessionAttachment` | `client.agent.sessions.renewAttachment` |  |
| `client.agent.sessions.replaySession` | `client.agent.sessions.replay` |  |
| `client.agent.sessions.setSessionAgent` | `client.agent.sessions.setAgent` |  |
| `client.agent.sessions.setSessionApproval` | `client.agent.sessions.updateApproval` |  |
| `client.agent.sessions.setSessionApprovalRule` | `client.agent.sessions.setApprovalRule` |  |
| `client.agent.sessions.setSessionAutoReply` | `client.agent.sessions.setAutoReply` |  |
| `client.agent.sessions.setSessionAutoReplyWrites` | `client.agent.sessions.setAutoReplyWrites` |  |
| `client.agent.sessions.setSessionEffort` | `client.agent.sessions.setEffort` |  |
| `client.agent.sessions.setSessionHoodyEnv` | `client.agent.sessions.setHoodyEnv` |  |
| `client.agent.sessions.setSessionModel` | `client.agent.sessions.setModel` |  |
| `client.agent.sessions.setSessionVerbosity` | `client.agent.sessions.setVerbosity` |  |
| `client.agent.sessions.setSessionYolo` | `client.agent.sessions.setYolo` |  |
| `client.agent.sessions.stopAll` | `client.agent.stopAllWork` |  |
| `client.agent.sessions.streamSession` | `client.agent.sessions.connect` |  |
| `client.agent.sessions.streamSessionEvents` | `client.agent.sessions.stream` |  |
| `client.agent.sessions.trimSession` | `client.agent.sessions.trim` |  |
| `client.agent.settings.deleteFusion` | `client.agent.fusions.delete` |  |
| `client.agent.settings.getACPStatus` | `client.agent.acp.getStatus` |  |
| `client.agent.settings.getSettings` | `client.agent.settings.get` |  |
| `client.agent.settings.listFusion` | `client.agent.fusions.list` |  |
| `client.agent.settings.listFusionAll` | `client.agent.fusions.listAll` |  |
| `client.agent.settings.listFusionIterator` | `client.agent.fusions.listIterator` |  |
| `client.agent.settings.patchSettings` | `client.agent.settings.update` |  |
| `client.agent.settings.setACPAgentModel` | `client.agent.acp.setModel` |  |
| `client.agent.settings.setACPEnabled` | `client.agent.acp.enable` or `client.agent.acp.disable` | Split: choose the method that matches what you meant. |
| `client.agent.settings.setACPSecret` | `client.agent.acp.setSecret` |  |
| `client.agent.settings.upsertFusion` | `client.agent.fusions.set` |  |
| `client.agent.skills.applySkillImport` | `client.agent.skills.import` |  |
| `client.agent.skills.clearSkillHubCache` | `client.agent.skills.hub.clearCache` |  |
| `client.agent.skills.createSkill` | `client.agent.skills.create` |  |
| `client.agent.skills.deleteSkill` | `client.agent.skills.delete` |  |
| `client.agent.skills.getSkillHubCache` | `client.agent.skills.hub.getCacheStats` |  |
| `client.agent.skills.getSkillSource` | `client.agent.skills.getSource` |  |
| `client.agent.skills.installSkillHub` | `client.agent.skills.hub.install` |  |
| `client.agent.skills.listSkills` | `client.agent.skills.list` |  |
| `client.agent.skills.listSkillsAll` | `client.agent.skills.listAll` |  |
| `client.agent.skills.listSkillsIterator` | `client.agent.skills.listIterator` |  |
| `client.agent.skills.previewSkillHub` | `client.agent.skills.hub.preview` |  |
| `client.agent.skills.putSkillSource` | `client.agent.skills.setSource` |  |
| `client.agent.skills.renameSkill` | `client.agent.skills.rename` |  |
| `client.agent.skills.scanSkillImport` | `client.agent.skills.scan` |  |
| `client.agent.skills.searchSkillHub` | `client.agent.skills.hub.search` |  |
| `client.agent.skills.toggleSkill` | `client.agent.skills.enable` or `client.agent.skills.disable` | Split: choose the method that matches what you meant. |
| `client.agent.skills.trustSkill` | `client.agent.skills.trust` |  |
| `client.agent.statistics.getStatistics` | `client.agent.stats.get` |  |
| `client.agent.statistics.usageByAccount` | `client.agent.usage.listByAccount` |  |
| `client.agent.statistics.usageByModel` | `client.agent.usage.listByModel` |  |
| `client.agent.system.getAgentVersion` | `client.agent.kit.getVersion` |  |
| `client.agent.system.healthCheck` | `client.agent.kit.getHealth` |  |
| `client.agent.system.metrics` | `client.agent.kit.getMetrics` |  |
| `client.agent.tasks.cancelAllTasks` | `client.agent.sessions.cancelTasks` |  |
| `client.agent.tasks.cancelTask` | `client.agent.tasks.cancel` |  |
| `client.agent.tasks.getTaskTranscript` | `client.agent.tasks.getTranscript` |  |
| `client.agent.tasks.listTasks` | `client.agent.tasks.list` |  |
| `client.agent.todos.approveTodoProposal` | `client.agent.todos.approveProposal` |  |
| `client.agent.todos.archiveTodo` | `client.agent.todos.archive` |  |
| `client.agent.todos.cancelTodoRun` | `client.agent.todos.cancel` |  |
| `client.agent.todos.claimTodo` | `client.agent.todos.claim` |  |
| `client.agent.todos.createTodo` | `client.agent.todos.create` |  |
| `client.agent.todos.denyTodoProposal` | `client.agent.todos.denyProposal` |  |
| `client.agent.todos.getTodo` | `client.agent.todos.get` |  |
| `client.agent.todos.getTodosRevision` | `client.agent.todos.getRevision` |  |
| `client.agent.todos.listTodos` | `client.agent.todos.list` |  |
| `client.agent.todos.listTodosAll` | `client.agent.todos.listAll` |  |
| `client.agent.todos.listTodosIterator` | `client.agent.todos.listIterator` |  |
| `client.agent.todos.messageTodo` | `client.agent.todos.sendMessage` |  |
| `client.agent.todos.postTodoComment` | `client.agent.todos.createComment` |  |
| `client.agent.todos.purgeTodos` | `client.agent.todos.purgeArchived` |  |
| `client.agent.todos.releaseTodo` | `client.agent.todos.release` |  |
| `client.agent.todos.runTodo` | `client.agent.todos.start` |  |
| `client.agent.todos.snoozeTodo` | `client.agent.todos.snooze` |  |
| `client.agent.todos.triageTodos` | `client.agent.todos.triage` |  |
| `client.agent.todos.updateTodo` | `client.agent.todos.update` |  |
| `client.agent.tools.getTool` | `client.agent.tools.get` |  |
| `client.agent.tools.listReadOnlyTools` | `client.agent.tools.listReadOnly` |  |
| `client.agent.tools.listReadOnlyToolsAll` | `client.agent.tools.listReadOnlyAll` |  |
| `client.agent.tools.listReadOnlyToolsIterator` | `client.agent.tools.listReadOnlyIterator` |  |
| `client.agent.tools.listSessionMCPTools` | `client.agent.sessions.listMcpTools` |  |
| `client.agent.tools.listSessionMCPToolsAll` | `client.agent.sessions.listMcpToolsAll` |  |
| `client.agent.tools.listSessionMCPToolsIterator` | `client.agent.sessions.listMcpToolsIterator` |  |
| `client.agent.tools.listSessionTools` | `client.agent.sessions.listTools` |  |
| `client.agent.tools.listSessionToolsAll` | `client.agent.sessions.listToolsAll` |  |
| `client.agent.tools.listSessionToolsIterator` | `client.agent.sessions.listToolsIterator` |  |
| `client.agent.tools.listTools` | `client.agent.tools.list` |  |
| `client.agent.tools.listToolsAll` | `client.agent.tools.listAll` |  |
| `client.agent.tools.listToolsIterator` | `client.agent.tools.listIterator` |  |
| `client.agent.tools.runSessionTool` | `client.agent.sessions.runTool` |  |
| `client.agent.tools.runTool` | `client.agent.tools.run` |  |
| `client.agent.tools.runToolAsync` | `client.agent.tools.start` |  |
| `client.agent.tools.streamTool` | `client.agent.tools.run` |  |
| `client.agent.workflows.cancelWorkflowRun` | `client.agent.workflows.cancelRun` |  |
| `client.agent.workflows.deleteWorkflow` | `client.agent.workflows.delete` |  |
| `client.agent.workflows.getWorkflow` | `client.agent.workflows.get` |  |
| `client.agent.workflows.getWorkflowRun` | `client.agent.workflows.getRun` |  |
| `client.agent.workflows.hideWorkflow` | `client.agent.workflows.setHidden` |  |
| `client.agent.workflows.listWorkflowRuns` | `client.agent.workflows.listRuns` |  |
| `client.agent.workflows.listWorkflowRunsAll` | `client.agent.workflows.listRunsAll` |  |
| `client.agent.workflows.listWorkflowRunsIterator` | `client.agent.workflows.listRunsIterator` |  |
| `client.agent.workflows.listWorkflows` | `client.agent.workflows.list` |  |
| `client.agent.workflows.listWorkflowsAll` | `client.agent.workflows.listAll` |  |
| `client.agent.workflows.listWorkflowsIterator` | `client.agent.workflows.listIterator` |  |
| `client.agent.workflows.putWorkflow` | `client.agent.workflows.set` |  |
| `client.agent.workflows.resumeWorkflowRun` | `client.agent.workflows.resumeRun` |  |
| `client.agent.workflows.runSessionWorkflow` | `client.agent.sessions.startWorkflow` |  |
| `client.agent.workflows.runWorkflow` | `client.agent.workflows.start` |  |
| `client.agent.workflows.setWorkflowSummary` | `client.agent.workflows.setSummary` |  |

### `api`

| Old | New | Note |
|---|---|---|
| `client.api.authTokens.addRealm` | `client.api.auth.tokens.addRealm` |  |
| `client.api.authTokens.copy` | `client.api.auth.tokens.copy` |  |
| `client.api.authTokens.create` | `client.api.auth.tokens.create` |  |
| `client.api.authTokens.delete` | `client.api.auth.tokens.delete` |  |
| `client.api.authTokens.get` | `client.api.auth.tokens.get` |  |
| `client.api.authTokens.getCurrent` | `client.api.auth.tokens.getCurrent` |  |
| `client.api.authTokens.getPublicProfile` | `client.api.auth.tokens.getPublicProfile` |  |
| `client.api.authTokens.list` | `client.api.auth.tokens.list` |  |
| `client.api.authTokens.listAll` | `client.api.auth.tokens.listAll` |  |
| `client.api.authTokens.listAuthTokenPermissionTemplates` | `client.api.auth.tokens.listTemplates` |  |
| `client.api.authTokens.listIterator` | `client.api.auth.tokens.listIterator` |  |
| `client.api.authTokens.removeRealm` | `client.api.auth.tokens.removeRealm` |  |
| `client.api.authTokens.update` | `client.api.auth.tokens.update` |  |
| `client.api.authTokens.updatePublicProfile` | `client.api.auth.tokens.updatePublicProfile` |  |
| `client.api.authentication.api_issueIdentityClaim` | `client.api.auth.createIdentityClaim` |  |
| `client.api.authentication.forgotPassword` | `client.api.auth.recoverPassword` |  |
| `client.api.authentication.getAvailableRegions` | `client.api.servers.listRegions` |  |
| `client.api.authentication.getCurrentUser` | `client.api.auth.whoami` |  |
| `client.api.authentication.getCurrentUserAlias` | removed | Use `client.api.auth.whoami`. |
| `client.api.authentication.getOAuthConfig` | `client.api.auth.getConfig` |  |
| `client.api.authentication.login` | `client.api.auth.login` |  |
| `client.api.authentication.logout` | `client.api.auth.logoutAll` |  |
| `client.api.authentication.oauthAuthorize` | `client.api.auth.oauth.authorize` |  |
| `client.api.authentication.oauthCancelIntent` | `client.api.auth.oauth.cancelIntent` |  |
| `client.api.authentication.oauthDeviceCode` | `client.api.auth.device.start` |  |
| `client.api.authentication.oauthDeviceDeny` | `client.api.auth.device.deny` |  |
| `client.api.authentication.oauthDeviceLogin` | `client.api.auth.device.login` |  |
| `client.api.authentication.oauthDeviceToken` | `client.api.auth.device.poll` |  |
| `client.api.authentication.oauthDeviceVerifyCode` | `client.api.auth.device.verifyCode` |  |
| `client.api.authentication.oauthExchange` | `client.api.auth.oauth.exchange` |  |
| `client.api.authentication.oauthLaunchInitiate` | `client.api.auth.oauth.startLaunch` |  |
| `client.api.authentication.refreshToken` | `client.api.auth.refresh` |  |
| `client.api.authentication.resendVerification` | `client.api.auth.sendVerificationEmail` |  |
| `client.api.authentication.resetPassword` | `client.api.auth.resetPassword` |  |
| `client.api.authentication.signup` | `client.api.auth.signup` |  |
| `client.api.authentication.verifyEmail` | `client.api.auth.verifyEmail` |  |
| `client.api.containers.authorize` | `client.api.containers.createClaim` |  |
| `client.api.containers.createSnapshot` | `client.api.snapshots.create` |  |
| `client.api.containers.deleteSnapshot` | `client.api.snapshots.delete` |  |
| `client.api.containers.getContainerProxyUsage` | `client.api.containers.getProxyUsage` |  |
| `client.api.containers.getNetworkConfig` | `client.api.network.get` |  |
| `client.api.containers.getStatusLogs` | `client.api.containers.listStatusHistory` |  |
| `client.api.containers.listSnapshots` | `client.api.snapshots.list` |  |
| `client.api.containers.listSnapshotsAll` | `client.api.snapshots.listAll` |  |
| `client.api.containers.listSnapshotsIterator` | `client.api.snapshots.listIterator` |  |
| `client.api.containers.manage` | `client.api.containers.start` or `client.api.containers.stop` or `client.api.containers.restart` or `client.api.containers.pause` or `client.api.containers.resume` | Split: choose the method that matches what you meant. |
| `client.api.containers.removeNetworkConfig` | `client.api.network.delete` |  |
| `client.api.containers.restoreSnapshot` | `client.api.snapshots.restore` |  |
| `client.api.containers.setContainerKvm` | `client.api.containers.enableKvm` or `client.api.containers.disableKvm` | Split: choose the method that matches what you meant. |
| `client.api.containers.startNetwork` | `client.api.network.start` |  |
| `client.api.containers.stopNetwork` | `client.api.network.stop` |  |
| `client.api.containers.updateNetworkConfig` | `client.api.network.update` |  |
| `client.api.containers.updateSnapshotAlias` | `client.api.snapshots.setAlias` |  |
| `client.api.env.bulkSet` | `client.api.containers.env.update` |  |
| `client.api.env.delete` | `client.api.containers.env.delete` |  |
| `client.api.env.list` | `client.api.containers.env.list` |  |
| `client.api.env.set` | `client.api.containers.env.set` |  |
| `client.api.events.bulkDelete` | `client.api.events.clear` |  |
| `client.api.events.cleanup` | `client.api.events.purge` |  |
| `client.api.firewall.addEgressRule` | `client.api.firewall.createEgressRule` |  |
| `client.api.firewall.addIngressRule` | `client.api.firewall.createIngressRule` |  |
| `client.api.firewall.list` | `client.api.firewall.listRules` |  |
| `client.api.firewall.removeEgressRule` | `client.api.firewall.deleteEgressRule` |  |
| `client.api.firewall.removeIngressRule` | `client.api.firewall.deleteIngressRule` |  |
| `client.api.firewall.toggleEgressRule` | `client.api.firewall.enableEgressRule` or `client.api.firewall.disableEgressRule` | Split: choose the method that matches what you meant. |
| `client.api.firewall.toggleIngressRule` | `client.api.firewall.enableIngressRule` or `client.api.firewall.disableIngressRule` | Split: choose the method that matches what you meant. |
| `client.api.images.getDetails` | `client.api.images.getPublic` |  |
| `client.api.images.importFree` | `client.api.images.import` |  |
| `client.api.images.purchase` | `client.api.images.buy` |  |
| `client.api.notifications.getUserNotificationSummary` | `client.api.inbox.getSummary` |  |
| `client.api.notifications.list` | `client.api.inbox.list` |  |
| `client.api.notifications.listAll` | `client.api.inbox.listAll` |  |
| `client.api.notifications.listIterator` | `client.api.inbox.listIterator` |  |
| `client.api.notifications.listPublic` | `client.api.inbox.listAnnouncements` |  |
| `client.api.notifications.listPublicAll` | `client.api.inbox.listAnnouncementsAll` |  |
| `client.api.notifications.listPublicIterator` | `client.api.inbox.listAnnouncementsIterator` |  |
| `client.api.notifications.markAllRead` | `client.api.inbox.markAllRead` |  |
| `client.api.notifications.markRead` | `client.api.inbox.markRead` |  |
| `client.api.poolInvitations.accept` | `client.api.pools.invitations.accept` |  |
| `client.api.poolInvitations.list` | `client.api.pools.invitations.list` |  |
| `client.api.poolInvitations.reject` | `client.api.pools.invitations.reject` |  |
| `client.api.poolMembers.invite` | `client.api.pools.members.invite` |  |
| `client.api.poolMembers.remove` | `client.api.pools.members.remove` |  |
| `client.api.poolMembers.updateRole` | `client.api.pools.members.setRole` |  |
| `client.api.projects.addPermission` | `client.api.projects.createPermission` |  |
| `client.api.projects.getProjectProxyUsage` | `client.api.projects.getProxyUsage` |  |
| `client.api.projects.removePermission` | `client.api.projects.deletePermission` |  |
| `client.api.proxyAliases.create` | `client.api.proxy.aliases.create` |  |
| `client.api.proxyAliases.delete` | `client.api.proxy.aliases.delete` |  |
| `client.api.proxyAliases.get` | `client.api.proxy.aliases.get` |  |
| `client.api.proxyAliases.list` | `client.api.proxy.aliases.list` |  |
| `client.api.proxyAliases.listAll` | `client.api.proxy.aliases.listAll` |  |
| `client.api.proxyAliases.listIterator` | `client.api.proxy.aliases.listIterator` |  |
| `client.api.proxyAliases.setState` | `client.api.proxy.aliases.enable` or `client.api.proxy.aliases.disable` | Split: choose the method that matches what you meant. |
| `client.api.proxyAliases.update` | `client.api.proxy.aliases.update` |  |
| `client.api.proxyDiscovery.getContainerProxyService` | `client.api.proxy.services.get` |  |
| `client.api.proxyDiscovery.getContainerProxySettings` | `client.api.proxy.settings.get` |  |
| `client.api.proxyDiscovery.listContainerProxyGroups` | `client.api.proxy.groups.list` |  |
| `client.api.proxyDiscovery.listContainerProxyServices` | `client.api.proxy.services.list` |  |
| `client.api.proxyDiscovery.updateContainerProxySettings` | `client.api.proxy.settings.update` |  |
| `client.api.proxyHooks.addContainerProxyHook` | `client.api.proxy.hooks.create` |  |
| `client.api.proxyHooks.clearContainerProxyServiceHooks` | `client.api.proxy.hooks.clear` |  |
| `client.api.proxyHooks.getContainerProxyHook` | `client.api.proxy.hooks.get` |  |
| `client.api.proxyHooks.listContainerProxyHooks` | `client.api.proxy.hooks.list` |  |
| `client.api.proxyHooks.listContainerProxyServiceHooks` | `client.api.proxy.hooks.listByService` |  |
| `client.api.proxyHooks.moveContainerProxyHook` | `client.api.proxy.hooks.move` |  |
| `client.api.proxyHooks.removeContainerProxyHook` | `client.api.proxy.hooks.delete` |  |
| `client.api.proxyHooks.updateContainerProxyHook` | `client.api.proxy.hooks.set` |  |
| `client.api.proxyPermissionsContainer.delete` | `client.api.proxy.containerPermissions.delete` |  |
| `client.api.proxyPermissionsContainer.get` | `client.api.proxy.containerPermissions.get` |  |
| `client.api.proxyPermissionsContainer.removeAuthGroup` | `client.api.proxy.containerPermissions.deleteAuthGroup` |  |
| `client.api.proxyPermissionsContainer.removeGroup` | `client.api.proxy.containerPermissions.clearGroupPermissions` |  |
| `client.api.proxyPermissionsContainer.removeProgram` | `client.api.proxy.containerPermissions.deleteGroupPermission` |  |
| `client.api.proxyPermissionsContainer.replace` | `client.api.proxy.containerPermissions.set` |  |
| `client.api.proxyPermissionsContainer.setGroup` | `client.api.proxy.containerPermissions.setGroupPermission` |  |
| `client.api.proxyPermissionsContainer.setIpGroup` | `client.api.proxy.containerPermissions.setIpGroup` |  |
| `client.api.proxyPermissionsContainer.setJwtGroup` | `client.api.proxy.containerPermissions.setJwtGroup` |  |
| `client.api.proxyPermissionsContainer.setPasswordGroup` | `client.api.proxy.containerPermissions.setPasswordGroup` |  |
| `client.api.proxyPermissionsContainer.setTokenGroup` | `client.api.proxy.containerPermissions.setTokenGroup` |  |
| `client.api.proxyPermissionsContainer.updateDefault` | `client.api.proxy.containerPermissions.setDefault` |  |
| `client.api.proxyPermissionsContainer.updateState` | `client.api.proxy.containerPermissions.enable` or `client.api.proxy.containerPermissions.disable` | Split: choose the method that matches what you meant. |
| `client.api.proxyPermissionsProject.delete` | `client.api.proxy.projectPermissions.delete` |  |
| `client.api.proxyPermissionsProject.get` | `client.api.proxy.projectPermissions.get` |  |
| `client.api.proxyPermissionsProject.removeAuthGroup` | `client.api.proxy.projectPermissions.deleteAuthGroup` |  |
| `client.api.proxyPermissionsProject.removeGroup` | `client.api.proxy.projectPermissions.clearGroupPermissions` |  |
| `client.api.proxyPermissionsProject.removeProgram` | `client.api.proxy.projectPermissions.deleteGroupPermission` |  |
| `client.api.proxyPermissionsProject.replace` | `client.api.proxy.projectPermissions.set` |  |
| `client.api.proxyPermissionsProject.setGroup` | `client.api.proxy.projectPermissions.setGroupPermission` |  |
| `client.api.proxyPermissionsProject.setIpGroup` | `client.api.proxy.projectPermissions.setIpGroup` |  |
| `client.api.proxyPermissionsProject.setJwtGroup` | `client.api.proxy.projectPermissions.setJwtGroup` |  |
| `client.api.proxyPermissionsProject.setPasswordGroup` | `client.api.proxy.projectPermissions.setPasswordGroup` |  |
| `client.api.proxyPermissionsProject.setTokenGroup` | `client.api.proxy.projectPermissions.setTokenGroup` |  |
| `client.api.proxyPermissionsProject.updateDefault` | `client.api.proxy.projectPermissions.setDefault` |  |
| `client.api.proxyPermissionsProject.updateState` | `client.api.proxy.projectPermissions.enable` or `client.api.proxy.projectPermissions.disable` | Split: choose the method that matches what you meant. |
| `client.api.rentals.extend` | `client.api.servers.extend` |  |
| `client.api.rentals.get` | `client.api.servers.get` |  |
| `client.api.rentals.list` | `client.api.servers.list` |  |
| `client.api.rentals.listAll` | `client.api.servers.listAll` |  |
| `client.api.rentals.listIterator` | `client.api.servers.listIterator` |  |
| `client.api.serverCommands.execute` | `client.api.servers.commands.run` |  |
| `client.api.serverCommands.list` | `client.api.servers.commands.list` |  |
| `client.api.serverCommands.listAll` | `client.api.servers.commands.listAll` |  |
| `client.api.serverCommands.listIterator` | `client.api.servers.commands.listIterator` |  |
| `client.api.serverRental.browse` | `client.api.servers.listMarketplace` |  |
| `client.api.serverRental.browseAll` | `client.api.servers.listMarketplaceAll` |  |
| `client.api.serverRental.browseIterator` | `client.api.servers.listMarketplaceIterator` |  |
| `client.api.serverRental.get` | removed | Use `client.api.servers.get`. |
| `client.api.serverRental.getMyReservation` | `client.api.servers.reservations.get` |  |
| `client.api.serverRental.getRentalRuntime` | `client.api.servers.getStats` |  |
| `client.api.serverRental.getServerRuntime` | removed | Use `client.api.servers.getStats`. |
| `client.api.serverRental.list` | removed | Use `client.api.servers.list` (and `listAll` / `listIterator`). |
| `client.api.serverRental.listAll` | removed | Use the matching helper of `client.api.servers`. |
| `client.api.serverRental.listIterator` | removed | Use the matching helper of `client.api.servers`. |
| `client.api.serverRental.listMyReservations` | `client.api.servers.reservations.list` |  |
| `client.api.serverRental.listServerOffers` | `client.api.servers.offers.list` |  |
| `client.api.serverRental.rent` | `client.api.servers.rent` |  |
| `client.api.serverRental.reserveServerOffer` | `client.api.servers.offers.reserve` |  |
| `client.api.storageShares.create` | `client.api.storage.shares.create` |  |
| `client.api.storageShares.delete` | `client.api.storage.shares.delete` |  |
| `client.api.storageShares.get` | `client.api.storage.shares.get` |  |
| `client.api.storageShares.list` | `client.api.storage.shares.listByContainer` |  |
| `client.api.storageShares.listAll` | `client.api.storage.shares.listByContainerAll` |  |
| `client.api.storageShares.listGlobal` | `client.api.storage.shares.list` |  |
| `client.api.storageShares.listGlobalAll` | `client.api.storage.shares.listAll` |  |
| `client.api.storageShares.listGlobalIterator` | `client.api.storage.shares.listIterator` |  |
| `client.api.storageShares.listIncoming` | `client.api.storage.shares.listIncomingByContainer` |  |
| `client.api.storageShares.listIncomingGlobal` | `client.api.storage.shares.listIncoming` |  |
| `client.api.storageShares.listIncomingGlobalAll` | `client.api.storage.shares.listIncomingAll` |  |
| `client.api.storageShares.listIncomingGlobalIterator` | `client.api.storage.shares.listIncomingIterator` |  |
| `client.api.storageShares.listIterator` | `client.api.storage.shares.listByContainerIterator` |  |
| `client.api.storageShares.toggleIncomingMount` | `client.api.storage.shares.mountIncoming` or `client.api.storage.shares.unmountIncoming` | Split: choose the method that matches what you meant. |
| `client.api.storageShares.update` | `client.api.storage.shares.update` |  |
| `client.api.subserverPlans.listSubserverPlans` | `client.api.servers.plans.list` |  |
| `client.api.subserverSubscriptions.cancelSubserverSubscription` | `client.api.servers.subscriptions.cancel` |  |
| `client.api.subserverSubscriptions.getSubserverOperation` | `client.api.servers.jobs.get` |  |
| `client.api.subserverSubscriptions.getSubserverSubscription` | `client.api.servers.subscriptions.get` |  |
| `client.api.subserverSubscriptions.listSubserverSubscriptions` | `client.api.servers.subscriptions.list` |  |
| `client.api.subserverSubscriptions.paySubserverSubscription` | `client.api.servers.subscriptions.pay` |  |
| `client.api.subserverSubscriptions.purchaseSubserverSubscription` | `client.api.servers.subscriptions.buy` |  |
| `client.api.subserverSubscriptions.quoteSubserverPurchase` | `client.api.servers.plans.quote` |  |
| `client.api.subserverSubscriptions.quoteSubserverSubscriptionChange` | `client.api.servers.subscriptions.quote` |  |
| `client.api.subserverSubscriptions.setSubserverSubscriptionAutoRenew` | `client.api.servers.subscriptions.enableAutoRenew` or `client.api.servers.subscriptions.disableAutoRenew` | Split: choose the method that matches what you meant. |
| `client.api.subserverSubscriptions.upgradeSubserverSubscription` | `client.api.servers.subscriptions.upgrade` |  |
| `client.api.tfa.disable` | `client.api.auth.twoFactor.disable` |  |
| `client.api.tfa.getStatus` | `client.api.auth.twoFactor.getStatus` |  |
| `client.api.tfa.regenerateBackupCodes` | `client.api.auth.twoFactor.rotateBackupCodes` |  |
| `client.api.tfa.setTokenGate` | `client.api.auth.twoFactor.enableTokenGate` or `client.api.auth.twoFactor.disableTokenGate` | Split: choose the method that matches what you meant. |
| `client.api.tfa.setup` | `client.api.auth.twoFactor.startSetup` |  |
| `client.api.tfa.verify` | `client.api.auth.twoFactor.verify` |  |
| `client.api.tfa.verifySetup` | `client.api.auth.twoFactor.confirmSetup` |  |
| `client.api.users.getSecurityHistory` | `client.api.users.listSecurityHistory` |  |
| `client.api.users.getSecurityHistoryAll` | `client.api.users.listSecurityHistoryAll` |  |
| `client.api.users.getSecurityHistoryIterator` | `client.api.users.listSecurityHistoryIterator` |  |
| `client.api.users.markOnboardingMilestone` | `client.api.users.completeOnboardingMilestone` |  |
| `client.api.users.redeemInviteCode` | `client.api.users.redeemInvite` |  |
| `client.api.utilities.getIpInfo` | `client.api.ip.get` |  |
| `client.api.wallet.addPaymentMethod` | `client.api.wallet.createPaymentMethod` |  |
| `client.api.wallet.downloadInvoicePdf` | `client.api.wallet.downloadInvoice` |  |
| `client.api.wallet.generateInvoice` | `client.api.wallet.createInvoice` |  |
| `client.api.wallet.getAggregateBalances` | `client.api.wallet.getBalances` |  |
| `client.api.wallet.getAiBalance` | `client.api.wallet.getCredits` |  |
| `client.api.wallet.getGeneralBalance` | `client.api.wallet.getBalance` |  |
| `client.api.wallet.listAiFeeHistory` | `client.api.wallet.listCreditFees` |  |
| `client.api.wallet.listAiFeeHistoryAll` | `client.api.wallet.listCreditFeesAll` |  |
| `client.api.wallet.listAiFeeHistoryIterator` | `client.api.wallet.listCreditFeesIterator` |  |
| `client.api.wallet.transferToAi` | `client.api.wallet.transferToCredits` |  |

### `bot`

| Old | New | Note |
|---|---|---|
| `client.bot.registrations.commandsSync` | `client.bot.registrations.syncCommands` |  |
| `client.bot.registrations.logsPurge` | `client.bot.registrations.purgeLogs` |  |
| `client.bot.registrations.logsRead` | `client.bot.registrations.listLogs` |  |
| `client.bot.registrations.policyGet` | `client.bot.registrations.getPolicy` |  |
| `client.bot.registrations.policySet` | `client.bot.registrations.updatePolicy` |  |
| `client.bot.registrations.profileSet` | `client.bot.registrations.updateProfile` |  |
| `client.bot.registrations.register` | `client.bot.registrations.create` |  |
| `client.bot.registrations.sessionsRevoke` | `client.bot.registrations.revokeSession` |  |
| `client.bot.registrations.tokensRevokeAll` | `client.bot.registrations.revokeAllTokens` |  |
| `client.bot.system.health` | `client.bot.kit.getHealth` |  |
| `client.bot.system.keysRotate` | `client.bot.kit.rotateKeys` |  |
| `client.bot.system.manifest` | `client.bot.kit.getManifest` |  |

### `browser`

| Old | New | Note |
|---|---|---|
| `client.browser.cookies.get` | `client.browser.cookies.list` |  |
| `client.browser.cookies.set` | `client.browser.cookies.setMany` |  |
| `client.browser.debugging.getConsoleLogs` | `client.browser.logs.listConsole` |  |
| `client.browser.debugging.getNetworkLogs` | `client.browser.logs.listNetwork` |  |
| `client.browser.health.check` | `client.browser.kit.getHealth` |  |
| `client.browser.health.getMetrics` | `client.browser.kit.getStats` |  |
| `client.browser.interaction.browse` | removed | Use `client.browser.page.navigate`. |
| `client.browser.interaction.browsePost` | `client.browser.page.navigate` |  |
| `client.browser.interaction.evalGet` | removed | Use `client.browser.page.evaluate`. |
| `client.browser.interaction.evalPost` | `client.browser.page.evaluate` |  |
| `client.browser.interaction.getSnapshot` | `client.browser.page.getSnapshot` |  |
| `client.browser.interaction.performAction` | `client.browser.page.act` |  |
| `client.browser.interaction.takeScreenshot` | `client.browser.page.captureScreenshot` |  |
| `client.browser.interaction.waitFor` | `client.browser.page.wait` |  |
| `client.browser.introspection.closeTab` | `client.browser.tabs.close` |  |
| `client.browser.introspection.getDevtoolsUrl` | `client.browser.instances.getDevtoolsUrls` |  |
| `client.browser.introspection.getMetadata` | `client.browser.instances.get` |  |
| `client.browser.introspection.getViewport` | `client.browser.viewport.get` |  |
| `client.browser.introspection.listTabs` | `client.browser.tabs.list` |  |
| `client.browser.introspection.setViewport` | `client.browser.viewport.set` |  |
| `client.browser.introspection.shutdown` | `client.browser.instances.shutdown` |  |

### `code`

| Old | New | Note |
|---|---|---|
| `client.code.health.check` | `client.code.kit.getHealth` |  |
| `client.code.health.getStatus` | `client.code.kit.getStatus` |  |
| `client.code.health.getVersion` | `client.code.kit.getVersion` |  |
| `client.code.static.getFavicon` | `client.code.ui.getFavicon` |  |
| `client.code.static.getRobots` | `client.code.ui.getRobots` |  |
| `client.code.static.getSecurityPolicy` | `client.code.ui.getSecurityPolicy` |  |
| `client.code.static.getWellKnownSecurityTxt` | removed | Use `client.code.ui.getSecurityPolicy()`. |
| `client.code.vscode.embedUrl()` | `removed: client.embeds builder` |  |
| `client.code.vscode.getManifest` | `client.code.ui.getManifest` |  |
| `client.code.vscode.getVSCode` | `client.code.ui.getPage` |  |

### `cron`

| Old | New | Note |
|---|---|---|
| `client.cron.crontab.get` | `client.cron.crontabs.get` |  |
| `client.cron.crontab.listGlobal` | `client.cron.crontabs.list` |  |
| `client.cron.crontab.listGlobalAll` | `client.cron.crontabs.listAll` |  |
| `client.cron.crontab.listGlobalIterator` | `client.cron.crontabs.listIterator` |  |
| `client.cron.crontab.put` | `client.cron.crontabs.set` |  |
| `client.cron.health.check` | `client.cron.kit.getHealth` |  |

### `curl`

| Old | New | Note |
|---|---|---|
| `client.curl.events.sseJobEvents` | `client.curl.jobs.stream` |  |
| `client.curl.events.streamWs` | `client.curl.jobs.connect` |  |
| `client.curl.events.wsRequestChannel` | `client.curl.channel.connect` |  |
| `client.curl.execute` | `client.curl.run` |  |
| `client.curl.executeCurlRequestGet` | removed | Use `client.curl.run`. |
| `client.curl.health.check` | `client.curl.kit.getHealth` |  |
| `client.curl.jobs.cancel` | `client.curl.jobs.cancel` or `client.curl.jobs.delete` | Split: choose the method that matches what you meant. |
| `client.curl.ops.metrics` | `client.curl.kit.getMetrics` |  |
| `client.curl.schedules.toggle` | removed | Use `client.curl.schedules.update(id, { enabled })`. |
| `client.curl.schedules.updateSchedule` | `client.curl.schedules.update` |  |
| `client.curl.sessions.getCookies` | `client.curl.sessions.listCookies` |  |
| `client.curl.storage.deleteFile` | `client.curl.storage.delete` |  |
| `client.curl.storage.getFile` | `client.curl.storage.get` |  |

### `daemon`

| Old | New | Note |
|---|---|---|
| `client.daemon.control.disable` | `client.daemon.programs.disable` |  |
| `client.daemon.control.enable` | `client.daemon.programs.enable` |  |
| `client.daemon.control.start` | `client.daemon.programs.start` |  |
| `client.daemon.control.stop` | `client.daemon.programs.stop` |  |
| `client.daemon.health.check` | `client.daemon.kit.getHealth` |  |
| `client.daemon.programs.add` | `client.daemon.programs.create` |  |
| `client.daemon.programs.edit` | `client.daemon.programs.update` |  |
| `client.daemon.programs.getProgramSandbox` | `client.daemon.programs.getSandbox` |  |
| `client.daemon.programs.remove` | `client.daemon.programs.delete` |  |
| `client.daemon.quickStart.getEphemeralLogs` | `client.daemon.ephemeralPrograms.getLogs` |  |
| `client.daemon.quickStart.getStatus` | `client.daemon.ephemeralPrograms.getStatus` |  |
| `client.daemon.quickStart.launch` | `client.daemon.ephemeralPrograms.start` |  |
| `client.daemon.quickStart.list` | `client.daemon.ephemeralPrograms.list` |  |
| `client.daemon.quickStart.stop` | `client.daemon.ephemeralPrograms.stop` |  |
| `client.daemon.status.get` | `client.daemon.programs.getStatus` |  |
| `client.daemon.status.getAll` | `client.daemon.programs.listStatus` |  |
| `client.daemon.status.getLogs` | `client.daemon.programs.getLogs` |  |
| `client.daemon.status.streamProgramLogs` | `client.daemon.programs.streamLogs` |  |

### `display`

| Old | New | Note |
|---|---|---|
| `client.display.accessClient` | `client.display.ui.getPage` |  |
| `client.display.getClipboard` | `client.display.clipboard.get` |  |
| `client.display.getInformation` | `client.display.get` |  |
| `client.display.getWindowProperties` | `client.display.windows.get` |  |
| `client.display.health.check` | `client.display.kit.getHealth` |  |
| `client.display.input.batch` | `client.display.input.actMany` |  |
| `client.display.input.clickAt` | `client.display.input.click` |  |
| `client.display.input.geometry` | `client.display.getGeometry` |  |
| `client.display.input.keyboardKey` | `client.display.keyboard.press` |  |
| `client.display.input.keyboardKeyDown` | `client.display.keyboard.down` |  |
| `client.display.input.keyboardKeyUp` | `client.display.keyboard.up` |  |
| `client.display.input.keyboardType` | `client.display.keyboard.type` |  |
| `client.display.input.mouseClick` | `client.display.mouse.click` |  |
| `client.display.input.mouseDoubleClick` | `client.display.mouse.doubleClick` |  |
| `client.display.input.mouseDown` | `client.display.mouse.down` |  |
| `client.display.input.mouseLocation` | `client.display.mouse.getPosition` |  |
| `client.display.input.mouseMove` | `client.display.mouse.move` |  |
| `client.display.input.mouseMoveRelative` | `client.display.mouse.moveBy` |  |
| `client.display.input.mouseScroll` | `client.display.mouse.scroll` |  |
| `client.display.input.mouseUp` | `client.display.mouse.up` |  |
| `client.display.input.typeAt` | `client.display.input.type` |  |
| `client.display.input.waitUntil` | `client.display.windows.wait` |  |
| `client.display.input.windowActive` | `client.display.windows.getActive` |  |
| `client.display.input.windowClose` | `client.display.windows.close` |  |
| `client.display.input.windowFocus` | `client.display.windows.focus` |  |
| `client.display.input.windowGeometry` | `client.display.windows.getGeometry` |  |
| `client.display.input.windowMinimize` | `client.display.windows.minimize` |  |
| `client.display.input.windowMove` | `client.display.windows.move` |  |
| `client.display.input.windowName` | `client.display.windows.getTitle` |  |
| `client.display.input.windowRaise` | `client.display.windows.raise` |  |
| `client.display.input.windowResize` | `client.display.windows.resize` |  |
| `client.display.input.windowRestore` | `client.display.windows.restore` |  |
| `client.display.input.windowSearch` | `client.display.windows.search` |  |
| `client.display.listScreenshots` | `client.display.screenshots.list` |  |
| `client.display.listWindows` | `client.display.windows.list` |  |
| `client.display.screenshots.captureMetadata` | `client.display.screenshots.capture` |  |
| `client.display.screenshots.getByTimestamp` | `client.display.screenshots.get` |  |
| `client.display.screenshots.getLatestMetadata` | `client.display.screenshots.getLatest` |  |
| `client.display.setClipboard` | `client.display.clipboard.set` |  |
| `client.display.thumbnails.getByTimestamp` | `client.display.thumbnails.get` |  |

### `egress`

| Old | New | Note |
|---|---|---|
| `client.egress.disableUpstream` | `client.egress.upstream.disable` |  |
| `client.egress.getUpstream` | `client.egress.upstream.get` |  |
| `client.egress.healthCheck` | `client.egress.kit.getHealth` |  |
| `client.egress.setUpstream` | `client.egress.upstream.set` |  |
| `client.egress.setUpstreamPost` | removed | Use `client.egress.upstream.set`. |

### `exec`

| Old | New | Note |
|---|---|---|
| `client.exec.dependencies.check` | `client.exec.modules.test` |  |
| `client.exec.dependencies.install` | `client.exec.modules.install` |  |
| `client.exec.dependencies.listBundled` | `client.exec.modules.listBundled` |  |
| `client.exec.execution.callScript(name, args)` | `client.exec.call(name, args)` |  |
| `client.exec.execution.discoverScripts()` | `client.exec.listCallableScripts()` |  |
| `client.exec.execution.execute` | `client.exec.run` |  |
| `client.exec.execution.executeTypedGet() / executeTypedPost() / executeScript()` | `client.exec.run(path, { method, body, query })` |  |
| `client.exec.health.check` | `client.exec.kit.getHealth` |  |
| `client.exec.ids.list` | `client.exec.namespaces.list` |  |
| `client.exec.logs.read` | `client.exec.logs.get` |  |
| `client.exec.magic.bulkUpdate` | `client.exec.magicComments.updateMany` |  |
| `client.exec.magic.getSchema` | `client.exec.magicComments.getSchema` |  |
| `client.exec.magic.read` | `client.exec.magicComments.get` |  |
| `client.exec.magic.updateHandler` | `client.exec.magicComments.update` |  |
| `client.exec.monitor.getActiveRequests` | `client.exec.kit.listRequests` |  |
| `client.exec.monitor.getScriptPerformance` | `client.exec.scripts.getStats` |  |
| `client.exec.monitor.getStats` | `client.exec.kit.getStats` |  |
| `client.exec.monitor.listMonitorScripts` | `client.exec.scripts.listStats` |  |
| `client.exec.monitor.prometheusExport` | `client.exec.kit.getMetrics` |  |
| `client.exec.openapi.serve` | `client.exec.openapi.get` |  |
| `client.exec.openapi.serveSchema` | `client.exec.openapi.getSchema` |  |
| `client.exec.package.compare` | `client.exec.packages.compare` |  |
| `client.exec.package.initJson` | `client.exec.packages.createManifest` |  |
| `client.exec.package.install` | `client.exec.packages.install` |  |
| `client.exec.package.pinVersions` | `client.exec.packages.pin` |  |
| `client.exec.package.readJson` | `client.exec.packages.getManifest` |  |
| `client.exec.package.updateJson` | `client.exec.packages.updateManifest` |  |
| `client.exec.route.discover` | `client.exec.routes.list` |  |
| `client.exec.route.resolve` | `client.exec.routes.resolve` |  |
| `client.exec.route.test` | `client.exec.routes.test` |  |
| `client.exec.schedules.listSchedules` | `client.exec.schedules.list` |  |
| `client.exec.schedules.reloadSchedules` | `client.exec.schedules.reload` |  |
| `client.exec.schedules.scheduleHistory` | `client.exec.schedules.listHistory` |  |
| `client.exec.schedules.triggerSchedule` | `client.exec.schedules.run` |  |
| `client.exec.scripts.deleteFile / deleteMarkdown / deleteSchemaJson / deleteOpenApiJson` | `client.exec.scripts.deleteFile(path, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.listFiles / listMarkdown / listSchemaJson / listOpenApiJson` | `client.exec.scripts.listFiles({ kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.readFile / readMarkdown / readSchemaJson / readOpenApiJson` | `client.exec.scripts.readFile(path, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.writeFile / writeMarkdown / writeSchemaJson / writeOpenApiJson` | `client.exec.scripts.writeFile(path, data, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.sdk.delete` | `client.exec.sdks.delete` |  |
| `client.exec.sdk.get` | `client.exec.sdks.get` |  |
| `client.exec.sdk.importSDK` | `client.exec.sdks.import` |  |
| `client.exec.sdk.list` | `client.exec.sdks.list` |  |
| `client.exec.state.clear` | `client.exec.store.clear` |  |
| `client.exec.state.get` | `client.exec.store.get` |  |
| `client.exec.state.set` | `client.exec.store.set` |  |
| `client.exec.system.getRestartStatus` | `client.exec.kit.getStatus` |  |
| `client.exec.system.restartServer` | `client.exec.kit.restart` |  |
| `client.exec.templates.createCustom` | `client.exec.templates.create` |  |
| `client.exec.templates.deleteCustom` | `client.exec.templates.delete` |  |
| `client.exec.templates.updateCustom` | `client.exec.templates.update` |  |
| `client.exec.validate.validateDependencies` | `client.exec.scripts.validateDependencies` |  |
| `client.exec.validate.validateMagicComments` | `client.exec.magicComments.validate` |  |
| `client.exec.validate.validateReturnType` | `client.exec.scripts.validateReturnType` |  |
| `client.exec.validate.validateScript` | `client.exec.scripts.validate` |  |
| `client.exec.validate.validateSyntax` | `client.exec.scripts.validateSyntax` |  |
| `client.exec.validate.validateTypeScript` | `client.exec.scripts.validateTypes` |  |

### `files`

| Old | New | Note |
|---|---|---|
| `client.files.archives.downloadAsZip` | `client.files.zip` |  |
| `client.files.archives.extractFile` | `client.files.archives.extractMember` |  |
| `client.files.archives.getHistory` | `client.files.extractions.listHistory` |  |
| `client.files.archives.listActive` | `client.files.extractions.listByDirectory` |  |
| `client.files.archives.listGlobal` | `client.files.extractions.list` |  |
| `client.files.archives.viewFile` | `client.files.archives.readMember` |  |
| `client.files.authentication.checkAuth` | `client.files.whoami` |  |
| `client.files.authentication.logout` | `client.files.logout` |  |
| `client.files.backends.connectAzureblob` | `client.files.backends.createAzureblob` |  |
| `client.files.backends.connectAzurefiles` | `client.files.backends.createAzurefiles` |  |
| `client.files.backends.connectB2` | `client.files.backends.createB2` |  |
| `client.files.backends.connectBox` | `client.files.backends.createBox` |  |
| `client.files.backends.connectCloudinary` | `client.files.backends.createCloudinary` |  |
| `client.files.backends.connectDrive` | `client.files.backends.createDrive` |  |
| `client.files.backends.connectDropbox` | `client.files.backends.createDropbox` |  |
| `client.files.backends.connectFichier` | `client.files.backends.createFichier` |  |
| `client.files.backends.connectFilefabric` | `client.files.backends.createFilefabric` |  |
| `client.files.backends.connectFilescom` | `client.files.backends.createFilescom` |  |
| `client.files.backends.connectFtp` | `client.files.backends.createFtp` |  |
| `client.files.backends.connectGofile` | `client.files.backends.createGofile` |  |
| `client.files.backends.connectGoogleCloudStorage` | `client.files.backends.createGoogleCloudStorage` |  |
| `client.files.backends.connectGooglePhotos` | `client.files.backends.createGooglePhotos` |  |
| `client.files.backends.connectHdfs` | `client.files.backends.createHdfs` |  |
| `client.files.backends.connectHidrive` | `client.files.backends.createHidrive` |  |
| `client.files.backends.connectHttp` | `client.files.backends.createHttp` |  |
| `client.files.backends.connectIclouddrive` | `client.files.backends.createIclouddrive` |  |
| `client.files.backends.connectImagekit` | `client.files.backends.createImagekit` |  |
| `client.files.backends.connectInternetarchive` | `client.files.backends.createInternetarchive` |  |
| `client.files.backends.connectJottacloud` | `client.files.backends.createJottacloud` |  |
| `client.files.backends.connectKoofr` | `client.files.backends.createKoofr` |  |
| `client.files.backends.connectLinkbox` | `client.files.backends.createLinkbox` |  |
| `client.files.backends.connectMailru` | `client.files.backends.createMailru` |  |
| `client.files.backends.connectMega` | `client.files.backends.createMega` |  |
| `client.files.backends.connectNetstorage` | `client.files.backends.createNetstorage` |  |
| `client.files.backends.connectOnedrive` | `client.files.backends.createOnedrive` |  |
| `client.files.backends.connectOpendrive` | `client.files.backends.createOpendrive` |  |
| `client.files.backends.connectOracleobjectstorage` | `client.files.backends.createOracleobjectstorage` |  |
| `client.files.backends.connectPcloud` | `client.files.backends.createPcloud` |  |
| `client.files.backends.connectPikpak` | `client.files.backends.createPikpak` |  |
| `client.files.backends.connectPixeldrain` | `client.files.backends.createPixeldrain` |  |
| `client.files.backends.connectPremiumizeme` | `client.files.backends.createPremiumizeme` |  |
| `client.files.backends.connectProtondrive` | `client.files.backends.createProtondrive` |  |
| `client.files.backends.connectPutio` | `client.files.backends.createPutio` |  |
| `client.files.backends.connectQingstor` | `client.files.backends.createQingstor` |  |
| `client.files.backends.connectQuatrix` | `client.files.backends.createQuatrix` |  |
| `client.files.backends.connectS3` | `client.files.backends.createS3` |  |
| `client.files.backends.connectSeafile` | `client.files.backends.createSeafile` |  |
| `client.files.backends.connectSftp` | `client.files.backends.createSftp` |  |
| `client.files.backends.connectSharefile` | `client.files.backends.createSharefile` |  |
| `client.files.backends.connectSia` | `client.files.backends.createSia` |  |
| `client.files.backends.connectSmb` | `client.files.backends.createSmb` |  |
| `client.files.backends.connectStorj` | removed | Removed: the files service no longer offers this backend. |
| `client.files.backends.connectSugarsync` | `client.files.backends.createSugarsync` |  |
| `client.files.backends.connectSwift` | `client.files.backends.createSwift` |  |
| `client.files.backends.connectUlozto` | `client.files.backends.createUlozto` |  |
| `client.files.backends.connectUptobox` | removed | Removed: the files service no longer offers this backend. |
| `client.files.backends.connectWebdav` | `client.files.backends.createWebdav` |  |
| `client.files.backends.connectYandex` | `client.files.backends.createYandex` |  |
| `client.files.backends.connectZoho` | `client.files.backends.createZoho` |  |
| `client.files.backends.disconnect` | `client.files.backends.delete` |  |
| `client.files.backends.getDetails` | `client.files.backends.get` |  |
| `client.files.backends.testConnection` | `client.files.backends.test` |  |
| `client.files.classifyFile() / client.notes.files.classifyFile()` | `client.files.classify() / client.notes.files.classify()` |  |
| `client.files.deleteRecursive` | removed | Use `client.files.delete`. |
| `client.files.directories.create` | removed | Use `client.files.mkdir`. |
| `client.files.downloads.cancelDownload` | `client.files.downloads.cancel` |  |
| `client.files.downloads.fetch` | `client.files.downloads.create` |  |
| `client.files.downloads.getHistory` | `client.files.downloads.listHistory` |  |
| `client.files.downloads.listActive` | `client.files.downloads.listByDirectory` |  |
| `client.files.downloads.listGlobal` | `client.files.downloads.list` |  |
| `client.files.extractions.cancelExtraction` | `client.files.extractions.cancel` |  |
| `client.files.ftp.access` | `client.files.ftp.get` |  |
| `client.files.getDirectoryZipUrl()` | `client.files.getZipUrl()` |  |
| `client.files.getFileUrl()` | `client.files.getUrl()` |  |
| `client.files.getMetadata` | `client.files.exists` |  |
| `client.files.getThumbnailUrl()` | `client.files.images.getThumbnailUrl()` |  |
| `client.files.health.check` | `client.files.kit.getHealth` |  |
| `client.files.images.process` | `client.files.images.convert` |  |
| `client.files.journal.query` | `client.files.journal.list` |  |
| `client.files.listDirectory` | `client.files.ui.getPage` |  |
| `client.files.listDirectory()` | `client.files.list(path)` |  |
| `client.files.listRootDirectory` | removed | Use `client.files.list(path)`, or `client.files.ui.getPage` for the HTML page. |
| `client.files.mounts.deliverPendingUpload` | `client.files.uploads.deliver` |  |
| `client.files.mounts.discardPendingUpload` | `client.files.uploads.delete` |  |
| `client.files.mounts.discardUnreadablePendingUpload` | `client.files.uploads.deleteUnreadable` |  |
| `client.files.mounts.downloadPendingUploadFile` | `client.files.uploads.download` |  |
| `client.files.mounts.getDetails` | `client.files.mounts.get` |  |
| `client.files.mounts.listPendingUploadFiles` | `client.files.uploads.listFiles` |  |
| `client.files.mounts.listPendingUploads` | `client.files.uploads.list` |  |
| `client.files.mounts.listUnreadablePendingUploads` | `client.files.uploads.listUnreadable` |  |
| `client.files.mounts.stopPendingUpload` | `client.files.uploads.stop` |  |
| `client.files.mounts.unmount` | `client.files.mounts.delete` |  |
| `client.files.operate` | `client.files.mkdir` or `client.files.archives.extract` or `client.files.downloads.create` | Split: choose the method that matches what you meant. |
| `client.files.patch` | `client.files.writeChunk` |  |
| `client.files.patchApi` | `client.files.update` |  |
| `client.files.put` | `client.files.upload` |  |
| `client.files.s3.access` | `client.files.s3.get` |  |
| `client.files.ssh.access` | `client.files.ssh.get` |  |
| `client.files.system.getApiVersion` | `client.files.kit.getVersion` |  |
| `client.files.upload` | removed | Use `client.files.upload`. |
| `client.files.webdav.access` | `client.files.webdav.get` |  |
| `client.files.webdav.copyResource` | `client.files.webdav.copy` |  |
| `client.files.webdav.lockResource` | `client.files.webdav.lock` |  |
| `client.files.webdav.moveResource` | `client.files.webdav.move` |  |
| `client.files.webdav.propfindResource` | `client.files.webdav.getProperties` |  |
| `client.files.webdav.proppatchResource` | `client.files.webdav.updateProperties` |  |
| `client.files.webdav.unlockResource` | `client.files.webdav.unlock` |  |

### `notes`

| Old | New | Note |
|---|---|---|
| `client.notes.collaborators.update` | `client.notes.collaborators.setRole` |  |
| `client.notes.comments.edit` | `client.notes.comments.update` |  |
| `client.notes.comments.reanchor` | `client.notes.comments.setAnchor` |  |
| `client.notes.databases.create` | `client.notes.records.create` |  |
| `client.notes.databases.delete` | `client.notes.records.delete` |  |
| `client.notes.databases.get` | `client.notes.records.get` |  |
| `client.notes.databases.list` | `client.notes.records.list` |  |
| `client.notes.databases.listAll` | `client.notes.records.listAll` |  |
| `client.notes.databases.listIterator` | `client.notes.records.listIterator` |  |
| `client.notes.databases.search` | `client.notes.records.search` |  |
| `client.notes.databases.update` | `client.notes.records.update` |  |
| `client.notes.documents.appendDocument` | `client.notes.document.append` |  |
| `client.notes.documents.createExportTicket` | `client.notes.document.createExportTicket` |  |
| `client.notes.documents.exportBlockSvg` | `client.notes.document.exportBlock` |  |
| `client.notes.documents.get` | `client.notes.document.get` |  |
| `client.notes.documents.patch` | `client.notes.document.update` |  |
| `client.notes.documents.put` | `client.notes.document.set` |  |
| `client.notes.files.cancelUpload()` | `client.notes.files.uploads.cancel()` |  |
| `client.notes.files.tusAbortUpload` | `client.notes.files.uploads.cancel` |  |
| `client.notes.files.tusCheckUpload` | `client.notes.files.uploads.getOffset` |  |
| `client.notes.files.tusCreateUpload` | `client.notes.files.uploads.create` |  |
| `client.notes.files.tusUploadChunk` | `client.notes.files.uploads.writeChunk` |  |
| `client.notes.files.uploadFile()` | `client.notes.files.upload()` |  |
| `client.notes.files.uploadOffset()` | `client.notes.files.uploads.getOffset()` |  |
| `client.notes.health.check` | `client.notes.kit.getHealth` |  |
| `client.notes.identity.get` | `client.notes.whoami` |  |
| `client.notes.interactions.markOpened` | `client.notes.nodes.markOpened` |  |
| `client.notes.interactions.markSeen` | `client.notes.nodes.markSeen` |  |
| `client.notes.nodes.getByAlias` | `client.notes.nodes.resolve` |  |
| `client.notes.notebooks.listNotebooks` | `client.notes.notebooks.list` |  |
| `client.notes.sockets.init` | `client.notes.sockets.create` |  |
| `client.notes.sockets.open` | `client.notes.sockets.connect` |  |
| `client.notes.users.invite` | `client.notes.members.invite` |  |
| `client.notes.users.updateRole` | `client.notes.members.setRole` |  |

### `notifications`

| Old | New | Note |
|---|---|---|
| `client.notifications.clearDismissed` | `client.notifications.restore` |  |
| `client.notifications.connectStream` | `client.notifications.connect` |  |
| `client.notifications.health.check` | `client.notifications.kit.getHealth` |  |
| `client.notifications.health.getMetrics` | `client.notifications.kit.getMetrics` |  |
| `client.notifications.notify.trigger` | `client.notifications.send` |  |

### `pipe`

| Old | New | Note |
|---|---|---|
| `client.pipe.corsPreflight` | removed | Removed: CORS preflight is browser plumbing, not an API call. |
| `client.pipe.headPipeStatus` | `client.pipe.getStatus` |  |
| `client.pipe.health.check` | `client.pipe.kit.getHealth` |  |
| `client.pipe.info.getHelp` | `client.pipe.kit.getHelp` |  |
| `client.pipe.info.getMetrics` | `client.pipe.kit.getMetrics` |  |
| `client.pipe.ui.getIndex` | `client.pipe.ui.getPage` |  |
| `client.pipe.ui.getNoScript` | `client.pipe.ui.getNoScriptPage` |  |

### `proxyLogs`

| Old | New | Note |
|---|---|---|
| `client.proxyLogs.logs.getStats` | `client.proxyLogs.getStats` |  |
| `client.proxyLogs.logs.list` | `client.proxyLogs.list` |  |
| `client.proxyLogs.logs.listAll` | `client.proxyLogs.listAll` |  |
| `client.proxyLogs.logs.listIterator` | `client.proxyLogs.listIterator` |  |
| `client.proxyLogs.logs.streamLogs` | `client.proxyLogs.stream` |  |

### `run`

| Old | New | Note |
|---|---|---|
| `client.run.configuration.getConfig` | `client.run.config.get` |  |
| `client.run.jobs.cancelJob` | `client.run.jobs.cancel` |  |
| `client.run.jobs.createSearchJob` | `client.run.jobs.createSearch` |  |
| `client.run.jobs.getJobStatus` | `client.run.jobs.get` |  |
| `client.run.jobs.listJobs` | `client.run.jobs.list` |  |
| `client.run.preflightRun` | `client.run.test` |  |
| `client.run.profiles.createProfile` | `client.run.profiles.create` |  |
| `client.run.profiles.deleteProfile` | `client.run.profiles.delete` |  |
| `client.run.profiles.listProfiles` | `client.run.profiles.list` |  |
| `client.run.profiles.selectProfile` | `client.run.profiles.use` |  |
| `client.run.profiles.updateProfile` | `client.run.profiles.update` |  |
| `client.run.recipes.createRecipe` | `client.run.recipes.create` |  |
| `client.run.recipes.deleteRecipe` | `client.run.recipes.delete` |  |
| `client.run.recipes.getRecipe` | `client.run.recipes.get` |  |
| `client.run.recipes.listRecipes` | `client.run.recipes.list` |  |
| `client.run.recipes.runRecipe` | `client.run.recipes.resolve` |  |
| `client.run.recipes.searchRecipe` | `client.run.recipes.search` |  |
| `client.run.recipes.updateRecipe` | `client.run.recipes.update` |  |
| `client.run.resolveGet` | removed | Use `client.run.resolve`. |
| `client.run.runBatch` | `client.run.resolveMany` |  |
| `client.run.searchCandidates` | removed | Use `client.run.search`. |
| `client.run.searchCandidatesPaged` | `client.run.search` |  |
| `client.run.searchCandidatesPagedAll` | `client.run.searchAll` |  |
| `client.run.searchCandidatesPagedIterator` | `client.run.searchIterator` |  |
| `client.run.sources.createSource` | `client.run.sources.create` |  |
| `client.run.sources.deleteSource` | `client.run.sources.delete` |  |
| `client.run.sources.getSourceDiagnostics` | `client.run.sources.getDiagnostics` |  |
| `client.run.sources.listSources` | `client.run.sources.list` |  |
| `client.run.sources.syncAllSources` | `client.run.sources.syncAll` |  |
| `client.run.sources.syncSource` | `client.run.sources.sync` |  |
| `client.run.sources.updateSource` | `client.run.sources.update` |  |

### `sqlite`

| Old | New | Note |
|---|---|---|
| `client.sqlite.database.create` | `client.sqlite.databases.create` |  |
| `client.sqlite.database.deleteDatabase` | `client.sqlite.databases.delete` |  |
| `client.sqlite.database.executeTransaction` | `client.sqlite.sql.runTransaction` |  |
| `client.sqlite.database.listDatabases` | `client.sqlite.databases.list` |  |
| `client.sqlite.health.getHealth` | `client.sqlite.kit.getHealth` |  |
| `client.sqlite.health.getHealthCache` | `client.sqlite.kit.getCacheStats` |  |
| `client.sqlite.history.deleteEntry` | `client.sqlite.history.delete` |  |
| `client.sqlite.kvStore.batchDelete` | `client.sqlite.kv.deleteMany` |  |
| `client.sqlite.kvStore.batchGet` | `client.sqlite.kv.getMany` |  |
| `client.sqlite.kvStore.batchSet` | `client.sqlite.kv.setMany` |  |
| `client.sqlite.kvStore.compareSnapshots` | `client.sqlite.kv.compareTableSnapshots` |  |
| `client.sqlite.kvStore.decr` | `client.sqlite.kv.decrement` |  |
| `client.sqlite.kvStore.delete` | `client.sqlite.kv.delete` |  |
| `client.sqlite.kvStore.exists` | `client.sqlite.kv.exists` |  |
| `client.sqlite.kvStore.expireKvKey` | `client.sqlite.kv.setTtl` |  |
| `client.sqlite.kvStore.get` | `client.sqlite.kv.get` |  |
| `client.sqlite.kvStore.get/set/delete/exists/pop/push/rollback/getSnapshot/read` | `client.sqlite.kv.<same>` |  |
| `client.sqlite.kvStore.getHistory` | `client.sqlite.kv.listHistory` |  |
| `client.sqlite.kvStore.getHistory / removeElement (object form)` | `client.sqlite.kv.listHistory / remove` |  |
| `client.sqlite.kvStore.getKvEntry` | `client.sqlite.kv.getEntry` |  |
| `client.sqlite.kvStore.getSnapshot` | `client.sqlite.kv.getSnapshot` |  |
| `client.sqlite.kvStore.getTableSnapshot` | `client.sqlite.kv.getTableSnapshot` |  |
| `client.sqlite.kvStore.incr` | `client.sqlite.kv.increment` |  |
| `client.sqlite.kvStore.incr / decr (object form)` | `client.sqlite.kv.increment / decrement` |  |
| `client.sqlite.kvStore.list` | `client.sqlite.kv.list` |  |
| `client.sqlite.kvStore.listAll` | `client.sqlite.kv.listAll` |  |
| `client.sqlite.kvStore.listIterator` | `client.sqlite.kv.listIterator` |  |
| `client.sqlite.kvStore.listKvChanges` | `client.sqlite.kv.listChanges` |  |
| `client.sqlite.kvStore.listKvChangesAll` | `client.sqlite.kv.listChangesAll` |  |
| `client.sqlite.kvStore.listKvChangesIterator` | `client.sqlite.kv.listChangesIterator` |  |
| `client.sqlite.kvStore.persistKvKey` | `client.sqlite.kv.clearTtl` |  |
| `client.sqlite.kvStore.pop` | `client.sqlite.kv.pop` |  |
| `client.sqlite.kvStore.push` | `client.sqlite.kv.push` |  |
| `client.sqlite.kvStore.removeElement` | `client.sqlite.kv.remove` |  |
| `client.sqlite.kvStore.rollback` | `client.sqlite.kv.rollback` |  |
| `client.sqlite.kvStore.rollbackTable` | `client.sqlite.kv.rollbackTable` |  |
| `client.sqlite.kvStore.set` | `client.sqlite.kv.set` |  |
| `client.sqlite.kvStore.streamKvChanges` | `client.sqlite.kv.streamChanges` |  |
| `client.sqlite.query.execute({db, sql, params})` | `client.sqlite.sql.query({db, sql, params})` |  |
| `client.sqlite.query.executeShareable` | `client.sqlite.sql.queryReadOnly` |  |
| `client.sqlite.query.run({db, sql, params})` | `client.sqlite.sql.run({db, sql, params})` |  |
| `client.sqlite.sql.runMaintenance` | `client.sqlite.databases.runMaintenance` |  |

### `terminal`

| Old | New | Note |
|---|---|---|
| `client.terminal.abort` | `client.terminal.commands.cancel` |  |
| `client.terminal.execution.execute` | `client.terminal.commands.run` |  |
| `client.terminal.execution.getResult` | `client.terminal.commands.get` |  |
| `client.terminal.health.check` | `client.terminal.kit.getHealth` |  |
| `client.terminal.sessions.connectWebSocket` | `client.terminal.sessions.connect` |  |
| `client.terminal.sessions.getRawOutput` | `client.terminal.sessions.read` |  |
| `client.terminal.sessions.listHistory` | `client.terminal.commands.list` |  |
| `client.terminal.system.freezeProcess` | `client.terminal.processes.pause` |  |
| `client.terminal.system.getDaemonConfig` | `client.terminal.system.listDaemonPrograms` |  |
| `client.terminal.system.getDisplayInfo` | `client.terminal.system.listDisplays` |  |
| `client.terminal.system.getProcess` | `client.terminal.processes.get` |  |
| `client.terminal.system.getResources` | `client.terminal.system.getStats` |  |
| `client.terminal.system.listProcesses` | `client.terminal.processes.list` |  |
| `client.terminal.system.sendSignal` | `client.terminal.processes.signal` |  |
| `client.terminal.system.unfreezeProcess` | `client.terminal.processes.resume` |  |
| `client.terminal.terminalAutomation.findInTerminal` | `client.terminal.sessions.search` |  |
| `client.terminal.terminalAutomation.getAutomationMetrics` | `client.terminal.automation.getStats` |  |
| `client.terminal.terminalAutomation.getSessionAutomationState` | `client.terminal.sessions.getAutomationStatus` |  |
| `client.terminal.terminalAutomation.getTerminalSnapshot` | `client.terminal.sessions.getSnapshot` |  |
| `client.terminal.terminalAutomation.listSupportedKeys` | `client.terminal.keys.list` |  |
| `client.terminal.terminalAutomation.pasteTerminalText` | `client.terminal.sessions.paste` |  |
| `client.terminal.terminalAutomation.pressTerminalKeys` | `client.terminal.sessions.pressKeys` |  |
| `client.terminal.terminalAutomation.sendTerminalMouseEvents` | `client.terminal.sessions.sendMouseEvents` |  |
| `client.terminal.terminalAutomation.waitForTerminal` | `client.terminal.sessions.wait` |  |
| `client.terminal.terminalDragAndDrop.beginTerminalDrop` | `client.terminal.drops.create` |  |
| `client.terminal.terminalDragAndDrop.commitTerminalDrop` | `client.terminal.drops.commit` |  |
| `client.terminal.terminalDragAndDrop.oneShotTerminalDrop` | `client.terminal.drops.send` |  |
| `client.terminal.terminalDragAndDrop.uploadTerminalDropSlice` | `client.terminal.drops.writeChunk` |  |
| `client.terminal.terminalState.postTerminalState` | `client.terminal.sessions.reportDiagnostics` |  |
| `client.terminal.web.get` | `client.terminal.ui.getPage` |  |
| `client.terminal.write` | `client.terminal.sessions.write` |  |

### `tunnel`

| Old | New | Note |
|---|---|---|
| `client.tunnel.getMetrics` | `client.tunnel.kit.getMetrics` |  |
| `client.tunnel.health.check` | `client.tunnel.kit.getHealth` |  |
| `client.tunnel.killSession` | `client.tunnel.sessions.close` |  |
| `client.tunnel.listBindings` | `client.tunnel.bindings.list` |  |
| `client.tunnel.listSessions` | `client.tunnel.sessions.list` |  |
| `client.tunnel.listTunnels` | `client.tunnel.list` |  |

### `watch`

| Old | New | Note |
|---|---|---|
| `client.watch.health.check` | `client.watch.kit.getHealth` |  |
| `client.watch.streams.listEvents` | `client.watch.events.list` |  |
| `client.watch.streams.listEventsAll` | `client.watch.events.listAll` |  |
| `client.watch.streams.listEventsIterator` | `client.watch.events.listIterator` |  |
| `client.watch.streams.streamSse` | `client.watch.events.stream` |  |
| `client.watch.streams.streamWs` | `client.watch.events.connect` |  |
| `client.watch.watchers.updateWatcher` | `client.watch.watchers.update` |  |

## Finding a name you cannot place

Search this file for the old name (`grep -n "<old>" docs/MIGRATION-2026-10-NAMES.md`). For a method that is not listed, the
name did not change. The generated references ([SDK](./reference/SDK-METHODS.md), [CLI](./reference/CLI-COMMANDS.md))
list every current name, and `hoody --help` / `hoody <group> --help` show the live command tree.

