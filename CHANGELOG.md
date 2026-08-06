# Changelog

All notable changes to `hoody-sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.12] — 2026-08-06

> Supersedes 1.0.0-beta.11, which was published briefly on 2026-08-05 and withdrawn. Everything it contained is in this release; nothing was dropped.

### Fixed

- **The `hoody-sdk/run` and `hoody-sdk/agent` subpath imports resolve.** Renaming the namespace in beta.10 left the package's `./app` subpath export pointing at `dist-ts/generated/app/`, a directory that is no longer built — so `import … from 'hoody-sdk/app'` failed to resolve, and `'hoody-sdk/run'` was not exported at all even though its compiled output shipped. `./app` is replaced by `./run`, and `./agent` gets a subpath entry for the first time: it shipped compiled but was unreachable by that name. Importing from the package root was never affected.

- **`hoody unmount --container <id>` unmounts instead of refusing.** The CLI hoists `-c` / `--container` onto the root program, so this command's own copy of the option never filled and the form its usage line advertises always fell through to the "nothing to unmount" error. It reads the hoisted value now. Two combinations that could only be resolved by guessing are refused instead, because the readings differ in what gets torn down: `--all` together with `-c`, and `-c` together with a positional `<idOrPath>`.

- **`KitProgram` spells the run kit `run`.** The union in the proxy-auth helper still listed `'app'` after the beta.10 rename, so a program name that both `getKitUrl()` and `client.run` accept was a type error there.

### Changed

- **Breaking — the four `kv` batch commands take typed flags instead of `--body`.** The SQLite kit now publishes real request schemas for its batch routes, so the CLI generates proper flags and the raw-JSON escape hatch is gone from these four:

  | Command | Was | Now |
  | --- | --- | --- |
  | `hoody kv batch get` | `--body '<json>'` | `--keys` — repeatable, comma-separated also accepted; 1–100 entries |
  | `hoody kv batch delete` | `--body '<json>'` | `--keys` — same |
  | `hoody kv batch set` | `--body '<json>'` | `--items '<json>'` — 1–100 entries |
  | `hoody kv rollback-table` | `--body '<json>'` | `--keys` and `--exclude-keys`, both optional, up to 10 000 entries each |

  Omitting `--keys` on `rollback-table` still rolls back the whole table, and `--exclude-keys` is applied after `--keys`.

  The same four SDK request types stop being `Record<string, unknown>` and describe their fields: `SqliteKvStoreBatchGetRequest`, `SqliteKvStoreBatchSetRequest`, `SqliteKvStoreBatchDeleteRequest` and `SqliteKvStoreRollbackTableRequest`, with `main_kvBatchSetItem` describing one write (`key`, `value`, `content_type`, `ttl`). Code already passing a correct object keeps compiling; a wrong shape is now a type error rather than a `400` at run time.

### Added

- **See your account's security history.** `api.users.getSecurityHistory` returns your own sign-ins, newest first, with the IP address, the resolved country, the client used, and the time. It paginates like the other list endpoints, so `getSecurityHistoryAll` collects every page and `getSecurityHistoryIterator` streams them one at a time.

  Two flags widen it. `include_failed=true` adds rejected sign-in attempts, which is what makes the endpoint useful defensively: a burst of them, or any from a country you have never been in, is the clearest signal someone is trying to get into your account. A rejection is only recorded when a credential was presented against a real account, so the endpoint cannot be used to test whether an address is registered, and failures are capped at 200 per account per hour. `include_security=true` adds the other account events: logout, 2FA enabled or disabled, OTP outcomes, and backup-code use. Each row carries `event` and `outcome` so you can tell them apart.

  Two properties are worth knowing before you build on it. The trail is append-only: you cannot edit or delete a record, which is what makes it usable as evidence. And it is bounded by the platform's audit retention window, 180 days by default, after which older records are purged and cannot be recovered.

  Treat `country: null` as unavailable, never as a location. It is null for an address that cannot be geolocated at all, when the provider returned nothing, or when resolution has not finished, and a null does not necessarily become non-null later, since background retries stop once a row ages out of the retry window.

- **The agent Skills bundle ships inside the package.** The mode-blend skill, the compact `SKILL.lite.md`, per-surface SDK/HTTP/CLI skills in basic and FULL variants, and one file per namespace are now part of the published tarball, so an agent working offline can read them straight out of `node_modules` — and `npx skills add HoodyNetwork/hoody-sdk` now finds a skill in this repository, which before this release it did not. The 71 files sit at the top level in `SKILLS/`, matching the path they are served from at [hoody.com/SKILLS/](https://hoody.com/SKILLS/), and are mirrored under `docs/agent/skills/` for anyone already pointing there; the two copies are identical. Both are markdown and nothing else — the browsable `index.html` skin belongs to the website and is served from there, not shipped in a package.

  The bundle also became installable and browsable. `SKILL.md` carries the `name` and `description` frontmatter that skill installers require:

  ```bash
  npx skills add https://hoody.com/SKILLS/SKILL.md   # the skill; deeper files fetched on demand
  npx skills add HoodyNetwork/hoody-sdk              # the same skill plus the whole corpus, on disk
  ```

  Every directory in the bundle now carries a `listing.md` index, with each row annotated by the file's surface and its approximate token count — so an agent can see before fetching that `SKILL-SDK-FULL.md` is an order of magnitude larger than `SKILL-SDK.md`. [hoody.com/SKILLS/](https://hoody.com/SKILLS/) renders the same listings for reading in a browser.

### Documentation

- **Accuracy pass over `README.md`, `AGENTS.md` and `CHEATSHEET.md`.** These had accumulated claims that no longer matched the CLI. Corrected, among others: `hoody login` takes `--email` for an email address (`--username` is for a username, and `--print-token` modifies a fresh login rather than exporting a stored one); `hoody run` is the Hoody Run app resolver, not a container-exec verb — that is `hoody shell`, of which `sh`, `pty` and `ssh` are aliases; `hoody ssh` opens a PTY in the container and only bridges to a real SSH server when given `--ssh-host`; `--output raw` emits a string body as-is and, for an object, the first string field among `content`, `data`, `body`, `text`; dynamic exec-script commands keep only `integer`, `number` and `boolean` types and register no `--body`; `hoody local lock setup` exits 11 when there is nothing to lock, and `remove` deletes the stored tokens unless given `--write-plaintext`; `hoody chat --persist` still creates `~/.hoody/chats`; `getKitUrl(…, { local: true })` builds the in-container URL; and `ValidationError` extends `Error`, not `ApiError`.

- **Clearer help text for `hoody containers env`, `hoody projects delete` and `hoody agent hooks ack-trust`.** These four entries explained themselves in terms of the software Hoody happens to run, which told you nothing you could act on. They now describe what the command does for you: `containers env` writes to `/etc/environment` and to the container runtime environment, visible to new exec and console sessions, with already-running processes keeping their copy until they re-exec; `projects delete` destroys the project on every target server along with its containers, permissions and proxy aliases; `ack-trust` arms the hooks that were held pending review, and reports when there is nothing to acknowledge or when the trust gate is briefly unavailable.

## [1.0.0-beta.10] — 2026-08-04

### Changed

- **Breaking — the `app` namespace is now `run`, and its methods are renamed.** `client.app` no longer exists; every one of its 35 methods lives under `client.run`. With one exception, noted below, each still calls the same `/api/v1/run/*` endpoint it always did, so the migration is a rename, one call site at a time. The methods that were grouped under `app.execution` and `app.health` are now directly on `client.run`:

  | Before | After |
  | --- | --- |
  | `app.health.check` | `run.healthCheck` |
  | `app.execution.preflight` | `run.preflightRun` |
  | `app.execution.runBatch` | `run.runBatch` |
  | `app.execution.runPathBased` | `run.runPathBased` |
  | `app.execution.runTerminalAnchored` | `run.runTerminalAnchored` |
  | `app.execution.searchCandidates` | `run.searchCandidates` |
  | `app.execution.searchCandidatesPaged` | `run.searchCandidatesPaged` |
  | `app.execution.searchCandidatesPagedAll` | `run.searchCandidatesPagedAll` |
  | `app.execution.searchCandidatesPagedIterator` | `run.searchCandidatesPagedIterator` |
  | `app.configuration.get` | `run.configuration.getConfig` |
  | `app.docs.getJson` | `run.documentation.getOpenApiJson` |
  | `app.docs.getYaml` | `run.documentation.getOpenApiYaml` |
  | `app.jobs.createSearch` | `run.jobs.createSearchJob` |
  | `app.jobs.getStatus` | `run.jobs.getJobStatus` |
  | `app.profiles.create` · `delete` · `list` · `select` · `update` | `run.profiles.createProfile` · `deleteProfile` · `listProfiles` · `selectProfile` · `updateProfile` |
  | `app.recipes.create` · `delete` · `get` · `list` · `run` · `search` · `update` | `run.recipes.createRecipe` · `deleteRecipe` · `getRecipe` · `listRecipes` · `runRecipe` · `searchRecipe` · `updateRecipe` |
  | `app.sources.create` · `delete` · `getDiagnostics` · `list` · `sync` · `syncAll` · `update` | `run.sources.createSource` · `deleteSource` · `getSourceDiagnostics` · `listSources` · `syncSource` · `syncAllSources` · `updateSource` |

  The generated types follow the same rename: the 42 `App*` types are replaced by 42 `Run*` types (`AppExecutionRunBatchRequest` → `RunRunBatchRequest`, and so on). **The CLI is unaffected** — it already spelled this `hoody run`, and no command was added, removed or renamed by this change.

- **Breaking — resolving an app moved from `/api/v1/run/run` to `/api/v1/run/resolve`.** Both methods were renamed with it: `app.execution.runAppPost` is now `run.resolve` and `app.execution.runAppGet` is now `run.resolveGet`. `GET` still takes the selector as query parameters and `POST` still takes the full selector as a JSON body; both return the exact shell command to run. The response no longer carries the `terminal` and `terminal_request_preview` fields, so the two types that described them — `TerminalExecuteResponse` and `TerminalRequestPreview` — are gone. Nothing else about the call changed.

- **`hoody chat` needs no API key any more.** It previously required a configured AI provider and refused to start without one, running the model itself. It now asks Hoody's documentation assistant: you ask, the service answers, and the CLI renders it. There is no model, provider, token or temperature setting left to configure, and answers arrive with links to the documentation pages they came from. `--private` still disables every disk read and write for the process, and a non-default service origin is still refused unless you accept it explicitly with `--accept-endpoint`. The service caps a question at 2000 characters and a conversation at 20 turns.

### Added

- **Manage the agent's MCP servers over HTTP.** Nine methods under `agent.mcp` cover the whole lifecycle: `listMCPServers` returns the effective merged configuration for a live session together with each server's live state — connected or not, negotiated protocol revision, tool count, why it was revoked, recent stderr — and reports credentials as key *names* only, never values. `upsertMCPServer` and `deleteMCPServer` write one entry, `setMCPServerEnabled` flips a single `enabled` flag so credentials survive a disable, and `reconnectMCP` re-reads the settings layers and reconciles every live session.

  Every write is nonce-guarded: `beginMCPWrite` mints a single-use nonce bound to `{session, operation, resolved path}` and returns the current config hash, which you pass back as `expect_hash` so a concurrent edit is reported as a conflict instead of being silently overwritten. A nonce minted for a different operation fails closed. `parseMCPImport` previews what an import would write without touching a file and strips credential values from the preview; `importMCPServers` then applies it, understanding the Hoody, Claude/Cursor and VS Code dialects — a document mixing more than one is refused rather than guessed at, and validation is whole-batch so one bad entry aborts the import. `probeMCPServer` connects to a candidate config, reports the tools it advertises, and tears the connection down; because probing starts a process or makes an outbound request to a caller-chosen URL, it is human-only and refuses a machine caller with `403 human_only`.

  The same nine arrive in the CLI as `hoody agent mcp list · upsert · delete · set-enabled · probe · reconnect · import · parse · begin-write`.

- **Sign out of GitHub, and switch between linked accounts.** `agent.github.githubLogout` forgets a linked account and deletes the token copies an interactive clone left in checkouts the daemon can currently reach. That purge is best-effort by construction — a repository in a stopped container keeps its copy — so the reply carries `credential_purge: "partial"` and says to revoke the token on GitHub for a complete removal. `agent.github.githubSetActiveAccount` points every subsequent GitHub operation at an already-linked account, keyed by the `accounts[].key` (`<host>/<login>`) from `githubAuthStatus`. Adding a token already activates the account it belongs to; switching between accounts that both already exist is what this route is for.

- **Arm a BYOA agent backend and pin its model.** `agent.settings.setACPEnabled` enables or disables an ACP backend for delegated sessions — a delegated session is refused while its backend is disabled, so this is the prerequisite for delegated sessions on a host configured over HTTP. `agent.settings.setACPAgentModel` sets the default model and reasoning effort that backend connects with; a delegated session started without an explicit model inherits them, and an empty value clears the pin and returns the backend to its own default. Both answer `404 unknown_agent` for anything that is not a known backend.

- **Turn hardware virtualisation on for a container.** `api.containers.setContainerKvm` enables or disables `/dev/kvm` passthrough, so a container can run full virtual machines. It is available on rented and dedicated servers only, never on free-tier ones, and the container must be stopped. Send `kvm: true` or `kvm: false` (`dev_kvm` is accepted as an alias). The CLI spells it `hoody containers kvm`.

## [1.0.0-beta.9] — 2026-07-30

### Added

- **Order machines that aren't in stock.** Four new methods cover the whole flow: `listServerOffers` lists what can be built to order — hardware, location, price per rental length, one-time setup fee and remaining stock — and `reserveServerOffer` places the order. `listMyReservations` and `getMyReservation` follow it from `pending` to `fulfilled`, or `refunded` if the order was reversed before a machine was delivered. An offer is told apart from an in-stock machine by `delivery_hours`: anything available now reports `0`, an offer reports `1`–`720`.

  Reserving **charges immediately**, so the request is built to survive a retry. `idempotency_key` is required, and replaying one returns the original reservation instead of buying a second machine; `max_charge_cents` caps the total debit and is required whenever a setup fee applies. Each way the call can refuse has its own code — the offer was withdrawn, it sold out, the key was reused for different terms, the setup fee was not confirmed, or the total exceeded your ceiling — so a client can tell "nothing was charged" from "something went wrong".

- **Snapshot counts and caps.** Listing a container's snapshots now also reports `snapshot_count` and `max_snapshots`, so you can show how much room is left rather than discovering the cap by hitting it. Creating one past the cap fails with `CONTAINER_SNAPSHOT_LIMIT`, which carries the container, the current count and the limit.

### Changed

- **Renting a server can now carry a one-time setup fee, and the rent call documents how that fails.** `serverRental.rent` accepts `max_charge_cents`, a ceiling on the *total* debit — rent plus the one-time fee. It is **required whenever the server has a non-zero `setup_fee_cents`**, so a client that rents such a server without it is refused with `SETUP_FEE_CONFIRMATION_REQUIRED` rather than being charged a total it never confirmed. It is a ceiling, not an exact match, so a price *drop* still succeeds; if the live total is higher you get `CHARGE_EXCEEDS_MAX` and nothing is charged. Read the figure to confirm from `pricing.price_tiers[rental_days].total_first_payment`.

  The endpoint previously documented only its success response. It now documents the ways it can fail — `INSUFFICIENT_BALANCE` (with the shortfall broken down), `INVALID_DURATION`, `NO_PRICING`, `SERVER_UNAVAILABLE`, `SETUP_FEE_CONFIRMATION_REQUIRED`, `CHARGE_EXCEEDS_MAX` and `PRICING_INVALID` — so these are generated into the client instead of arriving as an untyped error. The available-servers listing gained `pricing.setup_fee`, `pricing.setup_fee_cents` and `price_tiers.*.total_first_payment`, and reports `delivery_hours` — `0` for anything in stock. Servers and rentals now report `setup_fee_cents` and `total_paid_cents`, so what was actually paid is visible after the fact.

- **Listing invoices can be paged, sorted and filtered.** `listUserInvoices` gained `page` and `filter` alongside the existing `limit`, `sort_by` and `sort_order`. `filter` takes a JSON object string over the sortable fields — `{"status":"paid"}` or `{"amount":{"gte":10}}` — with `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` and `in`; an unknown field or operator is rejected with `400` rather than silently ignored. `limit` is now documented as capped at 100 (default 20), and `sort_by` lists the fields it accepts, falling back to `created_at` for anything else.

- **Creating a snapshot documents the rest of its failure surface.** Alongside the cap, the call can now report that another snapshot operation is already running for the container, that the container is still being claimed (both `409`), or that its snapshot list could not be read so the limit could not be checked (`503`, also on the alias endpoints). Each refuses without creating anything.

- **`redirect_uri` is now required when starting GitHub or Google sign-in.** Both documented it as optional. Google's description now also states it must be on an allowed domain, which GitHub's already did.
- **PKCE `code_challenge` is pinned to its real shape.** `authorize`, `device/code` and `launch/initiate` all documented 43–128 characters, but a base64url-encoded SHA-256 digest is always exactly 43. The schema now says so, rejecting a malformed challenge before it leaves the client.
- **Snapshot `expiry` is a whole number of days, from 1 to 3650.** It was an unbounded number, so `0.5`, `-3` and absurdly distant dates all looked acceptable. Values outside the range are now rejected before the snapshot is created.

### Fixed

- **The GitHub and Google callbacks now describe a declined sign-in.** When someone cancels at the provider, the callback receives `error`, `error_description` and `error_uri` and no `code`. Both were documented as though `code` always arrived, so a generated client treated an ordinary cancellation as a malformed response.

## [1.0.0-beta.8] — 2026-07-27

### Added

- **`ramdisk_scope` on container create and update.** `container` (the default) keeps `/ramdisk` private to that container; `project` additionally mounts `/ramdisk/project`, shared with your other containers in the same project **on the same server** — a RAM disk is memory on one machine, so it cannot span servers. It is refused when the project has other members.
- **Ramdisk figures in container stats.** A new `ramdisk` block reports the sharing scope, the shared pool ceiling, whether any of that ceiling is held for you (`capacity_reserved`, always `false` — the pool is first-come, first-served, so it is not a denominator for a usage bar), and measured bytes per scope. The container **list** endpoint never measures, so its `usage` is `null` — that means "not measured", not "empty".
- **`invite_code` on GitHub and Google sign-in.** Both provider redirects now accept the invite code from a signup link, so a coupon captured by your own signup page survives the round trip to the provider and applies to the new account. Only a hash of the code travels in the OAuth state.

### Fixed

- **`hoody exec` wrote where the SDK does not read.** Commands in namespaces that take no explicit instance id resolved to service index `0`, while the SDK uses `1`. For `exec` that index *is* the namespace, so a script written through the CLI landed under `default/0/` and was invisible to the matching SDK call. Every namespace now defaults to `1`; an explicit `--…-id` still wins.
- **`hoody shell -- <command>` ran inside your interactive terminal.** One-shot commands now get a session of their own instead of executing in terminal 1 and inheriting its state.
- **`--terminal-id` was silently ignored.** The id was sent as a query parameter that the container gateway overwrites, so every session landed on terminal 1 regardless. It now travels where it takes effect: `--terminal-id 3` attaches to terminal 3. The same fix applies to the SDK's terminal helpers — SSH, local, desktop, and remote command execution — where a `terminal_id` option was dropped the same way, and to the connect URL returned after creating a session, which pointed at a fresh ephemeral terminal instead of the session just created.
- **Agent event streams resolved a different address than every other agent command** — index `0` instead of the singleton the rest of the CLI uses.

### Changed

- **`ramdisk` is now described accurately.** It read as a private allocation of up to half the host's memory that persisted across container reboots. In fact `/ramdisk` draws on a shared per-server pool — 512 MiB by default, never more than half the server's memory, shared with your other containers on that server — and its contents are **lost on a host reboot**, which is what makes it suitable for secrets and scratch data that must not reach disk. It counts against memory, not disk.
- Reference documentation regenerated for this release.

## [1.0.0-beta.7] — 2026-07-27

### Fixed

- **The incoming-shares example described a response the API never returns.** The receiver's view of a storage share leaves out the sharer's `alias`, `label`, `description` and `expiry_notified`, and the endpoint documents that — but its example response still listed all four. Anyone writing against that example was expecting four fields that never arrive. The example now matches the real payload, and the omitted field is described as the expiry-notification flag it actually is.

## [1.0.0-beta.6] — 2026-07-26

### Fixed

- **`isRetryableApiError` no longer breaks type narrowing.** The guard claimed to prove `ApiError`, so TypeScript read the negative branch as impossible and this ordinary check would not compile:

  ```ts
  if (isApiError(err) && !isRetryableApiError(err)) {
    console.log(err.status); // 'status' does not exist on type 'never'
  }
  ```

  It now narrows to `RetryableApiError`, so both branches type correctly — including when the value is a union such as `ApiError | null`.

### Added

- **`RetryableApiError` and `RetryableStatus` types**, exported from both the package root and the browser entry, so you can name what `isRetryableApiError` proves: an `ApiError` whose `status` is one of the retryable codes.

## [1.0.0-beta.5] — 2026-07-26

### Added

- **Device sign-in methods** — `oauthDeviceLogin` and `oauthDeviceDeny` round out the device authorization flow that backs "Continue in browser" sign-in. The confirmation page can now approve the waiting terminal with an email and password, or refuse it outright, so you can build your own confirmation screen instead of only the hosted one. The SDK is now 1077 typed methods, up from 1075.
- **`--no-allow-no-realm` and `--no-event-access`** on `hoody auth tokens create`. Both settings are on by default and the CLI previously had no way to turn either one off.
- **Clickable menus.** A left-click now picks a row in any `hoody` menu — the scroll wheel already moved the highlight — and the "Generate a strong password" button is a real click target. Terminals that don't report clicks behave exactly as before; the keyboard path is unchanged.

### Fixed

- **A mistyped password no longer ends `hoody signup`.** Resuming a pending signup used to drop you back to the shell with an account you could not finish creating. You now get another try, and pressing `r` sends a fresh verification link straight from that screen. An account that cannot succeed by retyping — locked out, or disabled — still stops immediately rather than asking three times.
- **Verification resends report what actually happened.** A resend that hits the hourly limit now says so, with the wait when one is supplied, instead of reporting that a link was on its way. The confirmation elsewhere reads "request accepted" rather than "sent", which is all the service will confirm.
- **`--version <value>` is no longer mistaken for a version request.** On the commands that take a `--version` value, a failure now reaches the built-in fixer normally; `help` used as a verb is recognized alongside `--help`.
- **A smaller `hoody` bundle.** The published CLI carried a copy of the repository's build-time metadata that nothing referenced at runtime — it only ever needed the version string. The bundle is about 8 KB lighter and now contains runtime code only.
- **Installers.** `install.sh` checks for `awk` up front, rejects version strings carrying whitespace or control characters, and parses checksum manifests unambiguously. `install.ps1` restores the caller's TLS setting on every exit path, and a failed upgrade now states whether the previous `hoody.exe` was put back — and where to find it if it was not.

### Changed

- Device-flow endpoint descriptions now spell out how the flow differs from RFC 8628 rather than referring to a note that was not part of the published docs.
- Reference documentation regenerated for this release.

## [1.0.0-beta.4] — 2026-07-23

### Changed

- **README overhaul.** Every code snippet, method shape, count, and behavioral claim was re-verified against the generated SDK and CLI, and the prose was tightened for clarity — shorter and easier to skim, with no change to the documented surface.
- **`AGENTS.md` reframed** around the three ways to build on Hoody: the SDK for scripting, and the CLI or plain HTTP/`curl` for terminal and agent use, with a task-by-task comparison of the same operation in each.

## [1.0.0-beta.3] — 2026-07-21

### Changed

- **Documentation overhaul.** A rewritten `AGENTS.md` build guide (now shipped in the package), a clearer README with a hands-on examples tour (spawn and drive a cloud browser, mount cloud storage and local drives both ways, drive the built-in agent, and serve any port over HTTPS), per-namespace descriptions in the [namespace index](./docs/reference/namespaces/_INDEX.md), and a plain-English `hoody chat` privacy guide.
- Licensing and ecosystem notes added to `LICENSE`.

### Fixed

- Reference documentation now renders generic type parameters correctly (e.g. `ApiResponse<unknown>`).

## [1.0.0-beta.2] — 2026-07-21

### Added

- **PKCE OAuth sign-in** — new authentication endpoints for building a browser-based sign-in flow against the Hoody API: `oauthAuthorize`, `oauthExchange`, and `getOAuthConfig`.
- **Identity claims** — `issueIdentityClaim` for issuing verifiable identity claims.

### Changed

- Refreshed the generated API reference under [`docs/reference/`](./docs/reference/) and the [README](./README.md) for clarity and accuracy.
- CLI: output, flag, and help-text consistency refinements across commands (no change to the command surface).

## [1.0.0-beta.1] — 2026-07-11

Initial public release of the Hoody SDK (`hoody-sdk`) and the bundled `hoody` CLI.

### Added

- Typed TypeScript client for the public Hoody API and the container **Kit** service layer — terminal, files, browser, display, code, agent, sqlite, cron, daemon, watch, notes, tunnels, and more. See the [README](./README.md) and the full [`docs/reference/`](./docs/reference/).
- The `hoody` CLI, shipped in the same package — run with zero install via `npx hoody-sdk`, or install globally with `npm install -g hoody-sdk`.
- Node.js ≥ 22.19.0 and Bun support; browser IIFE global (`window.HoodySDK`) and ESM bundles.

> Future releases are documented here automatically, generated from the public API surface between published versions.
