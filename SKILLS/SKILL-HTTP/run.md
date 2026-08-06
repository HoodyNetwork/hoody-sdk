> _**HTTP skill · `run` namespace** · ~6,513 tokens · hoody-sdk v1.0.0-beta.12_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `POST /api/v1/run/batch`; persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `GET /api/v1/run/search` → `{ set_id, candidates[] }`.
2. `POST /api/v1/run/resolve` → `shell_command`.

### 2. Preflight

1. `POST /api/v1/run/preflight` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `POST /api/v1/run/resolve` → resolved command + preview.

### 3. Cursor-paged search

`POST /api/v1/run/search/paged` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; drain manually by carrying `next_cursor` forward until it's null/absent.
### 4. Batch

`POST /api/v1/run/batch`. `mode:"run"` resolves each item to a command.

### 5. Recipes

`POST /api/v1/run/recipes`; invoke via `POST /api/v1/run/recipes/{name}/run` — generated SDK takes `name` positional + a body, NOT a single options object.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint is `GET|POST /api/v1/run/resolve` (operations `GET /api/v1/run/resolve` / `POST /api/v1/run/resolve`).
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). Pass `kind` in the selector to narrow (`kind:'cli'`, `kind:'gui'`), or `kind:'any'` for no filter.
- `limit` default 25, clamped 1..=100.
- 30s query cache; `HOODY_RUN_QUERY_CACHE_TTL_MS`.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only: the response `status` is `"dry-run"` (a single picked candidate) or `"resolved"` (an unpicked candidate set), and carries a `handoff` object whose `state` is `"preview"`. When the resolved candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated. The kit never launches the app or executes anything.
- `POST /api/v1/run/batch` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `POST /api/v1/run/recipes/{name}/run` / `POST /api/v1/run/recipes/{name}/search` reject disallowed overrides with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped.
- `selected.run_plan` carries `command`/`env`/`cwd`; `argv` is on `selected.execution_plan`.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix). Both are public and supported, but the canonical machine-facing entrypoint is `POST /api/v1/run/resolve` (`GET|POST /api/v1/run/resolve`) — prefer it for programmatic callers.
## Common errors

- `400 INVALID_PICK` — bad `pick_index`/`candidate_id`.
- `409 cursor set expired` — re-search.
- `502 SOURCE_RESOLUTION_FAILED` — a source (e.g. `nix`/`pkgx`) failed or is missing.

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. The default `pick` mode is `ask` (returns candidates, no selection); use `first` to auto-pick the highest-ranked one.

**Step 1 — search.** Returns a `set_id` (binds your follow-up `pick` against this exact candidate list — `set_id` expires after ~300s) and `candidates[]` ranked by score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=firefox&kind=any&limit=5" \
  | jq '{set_id, count: (.candidates|length), top: (.candidates[0]|{candidate_id,title,provider,kind,score})}'
```
**Step 2 — resolve to a command.** `pick: 'first'` returns `shell_command` for the top candidate.

```bash
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"firefox","kind":"any","pick":"first"}' \
  | jq '{shell_command, candidate_id: .selected.candidate_id, status}'
# → { "shell_command": "'/usr/bin/firefox'", "candidate_id": "system-path:/usr/bin/firefox", "status": "dry-run" }
```
### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the resolved shell-form) and `execution_plan.{argv,env,cwd}` (the argv-form). When the candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated so a caller can open the preview; resolve itself never launches anything.

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"echo","kind":"cli","pick":"first"}' \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url}'
```
### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` resolves to `system-path:/usr/bin/git` by default, but you specifically want the `pkgx` candidate at index 2. Bind the pick to a `set_id` to avoid the candidate list shifting under you.

**Step 1 — list candidates with `set_id`.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=git&kind=cli&limit=5" \
  | jq '{set_id, listing: (.candidates | to_entries | map({i: .key, id: .value.candidate_id, provider: .value.provider, score: .value.score}))}'
```
**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```bash
SET="<paste set_id from step 1>"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg s "$SET" '{app:"git",kind:"cli",set_id:$s,pick:"index",pick_index:2}')" \
  | jq '{shell_command, picked: .selected.candidate_id, provider: .selected.provider}'
```
**Pick by id alternative** — when you know the exact candidate, use `pick: 'id'` + `candidate_id`:

```bash
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"git","kind":"cli","pick":"id","candidate_id":"system-path:/usr/bin/git"}' \
  | jq .shell_command
```
### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → no filter. `kind` narrows by classification (`cli` / `gui` / `any`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=jq&os=linux&arch=amd64&kind=cli&source=system&limit=5" \
  | jq '{count: (.candidates|length), providers: [.candidates[].provider]}'
# → { "count": 1, "providers": ["system"] }
```
**Tags** are free-form ranking hints (e.g. `tags: ['portable']` boosts AppImage / pkgx candidates). Combine with `kind: 'gui'` for X11 apps, or `os: 'windows'` to filter the catalog to Wine-runnable variants.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/preflight" \
  -H 'Content-Type: application/json' \
  -d '{"app":"xeyes","kind":"gui","pick":"first"}' \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```
### 6. Pagination — walk a long candidate list with `POST /api/v1/run/search/paged`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
RESP=$(curl -sf -X POST "$KIT/api/v1/run/search/paged" \
  -H 'Content-Type: application/json' \
  -d '{"selector":{"app":"git","kind":"cli"},"page_size":3}')
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```
**Step 2 — fetch all pages.** ⚠ The `search/paged` endpoint returns one page per call — there is no built-in drain-all behavior, so walk it manually by carrying `next_cursor` between calls until it's null/absent.
```bash
# Manual: walk by feeding back next_cursor
while [ -n "$CURSOR" ] && [ "$CURSOR" != "null" ]; do
  RESP=$(curl -sf -X POST "$KIT/api/v1/run/search/paged" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg c "$CURSOR" '{selector:{app:"git",kind:"cli"},page_size:3,cursor:$c}')")
  echo "$RESP" | jq '.items | length'
  CURSOR=$(echo "$RESP" | jq -r .next_cursor)
done
```
⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/run/search/jobs" \
  -H 'Content-Type: application/json' \
  -d '{"app":"firefox","kind":"any"}' \
  | jq -r .job_id)
echo "$JID"   # e.g. 7cbf9b58-1aeb-499d-a8fa-6ed160c90893
```
**Step 2 — poll.** Status transitions `queued → running → done` (or `error`). Search-resolve jobs have a 10-minute TTL refreshed on every status/result read, so polling keeps them alive — but plan to read the result the moment status flips to `done`/`error` rather than relying on the TTL.

```bash
while :; do
  S=$(curl -sf "$KIT/api/v1/run/jobs/$JID" | jq -r .status)
  echo "$S"
  case "$S" in done|error) break;; esac
  sleep 1
done
curl -sf "$KIT/api/v1/run/jobs/$JID" | jq '{status, result}'
```
### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response) or `result: 'run'` (with `selected` + `shell_command`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/batch" \
  -H 'Content-Type: application/json' \
  -d '{"items":[
    {"request_id":"a","mode":"run","selector":{"app":"ls","kind":"cli","pick":"first"}},
    {"request_id":"b","mode":"run","selector":{"app":"echo","kind":"cli","pick":"first"}},
    {"request_id":"c","mode":"search","selector":{"app":"git","kind":"cli","limit":3}}
  ]}' \
  | jq '.items | map({request_id, result, shell: .run.shell_command, count: (.search.candidates|length // null)})'
```
### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; any `overrides.*` outside it is rejected with `400 "recipe override not allowed: <field>"` on `POST /api/v1/run/recipes/{name}/run` — update the recipe to widen the allow-list.

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/recipes" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"team-js-runtime",
    "description":"Resolve a JS runtime; team-default = node CLI",
    "selector_template":{"app":"node","kind":"cli","os":"linux","arch":"amd64","pick":"first"},
    "allowed_overrides":["app","version","tags"]
  }' | jq 'map(.name)'
```
**Step 2 — list / get / update / delete.**

```bash
curl -sf "$KIT/api/v1/run/recipes" | jq 'map({name, description})'
curl -sf "$KIT/api/v1/run/recipes/team-js-runtime" | jq .
curl -sf -X PATCH "$KIT/api/v1/run/recipes/team-js-runtime" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Updated: now also resolves bun/deno via override"}'
# When done:
curl -sX DELETE "$KIT/api/v1/run/recipes/team-js-runtime"
```
### 10. Invoke a recipe with overrides — `POST /api/v1/run/recipes/{name}/run`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `POST /api/v1/run/resolve` (`{ status, shell_command, selected, ... }`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/recipes/team-js-runtime/run" \
  -H 'Content-Type: application/json' \
  -d '{"overrides":{"app":"bun"}}' \
  | jq '{status, shell_command, picked: .selected.candidate_id}'
```
**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `POST /api/v1/run/recipes/{name}/search`:

```bash
curl -sf -X POST "$KIT/api/v1/run/recipes/team-js-runtime/search" \
  -H 'Content-Type: application/json' \
  -d '{"overrides":{"app":"node"}}' \
  | jq '{set_id, count: (.candidates|length), providers: [.candidates[].provider] | unique}'
```
⚠ Overrides outside `allowed_overrides` are **rejected** with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped. Use `PATCH /api/v1/run/recipes/{name}` to widen the allow-list.

## Reference

### `configuration` (1) — APIs for retrieving consolidated runtime configuration state including active profile selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/config` | Get full runtime configuration |  |

### `documentation` (2) — Self-documenting specification endpoints in JSON and YAML formats

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/openapi.json` | OpenAPI specification (JSON) |  |
| `GET /api/v1/run/openapi.yaml` | OpenAPI specification (YAML) |  |

### `jobs` (2) — APIs for tracking async job status with optional long-polling support for sync and background operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/search/jobs` | Start an async search job | `body*:run_Selector` |
| `GET /api/v1/run/jobs/{job_id}` | Get job status | `?wait` `?timeout_ms` |

**Param notes:**

- `wait` — Set to 'done' to long-poll until job completes
- `timeout_ms` — Long-poll timeout in milliseconds (default 0, max 120000)

### `profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/profiles` | Create a new profile | `body*:run_ProfileConfig` |
| `DELETE /api/v1/run/profiles/{profile}` | Delete a profile |  |
| `GET /api/v1/run/profiles` | List all profiles |  |
| `POST /api/v1/run/profiles/{profile}/select` | Select the active profile |  |
| `PATCH /api/v1/run/profiles/{profile}` | Update a profile | `body*` |

**Param notes:**

- `profile` — Profile name
- `profile` — Profile name to select

**Body shapes:**

- `PATCH /api/v1/run/profiles/{profile}` body — `object` — Partial profile fields to update

### `recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/recipes` | Create a saved recipe | `body*:run_RecipeConfig` |
| `DELETE /api/v1/run/recipes/{name}` | Delete a saved recipe |  |
| `GET /api/v1/run/recipes/{name}` | Get a saved recipe |  |
| `GET /api/v1/run/recipes` | List saved launch recipes |  |
| `POST /api/v1/run/recipes/{name}/run` | Run using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `POST /api/v1/run/recipes/{name}/search` | Search using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `PATCH /api/v1/run/recipes/{name}` | Update a saved recipe | `body*` |

**Param notes:**

- `name` — Recipe name

**Body shapes:**

- `PATCH /api/v1/run/recipes/{name}` body — `object` — Partial recipe update

### `run` (9) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/health` | Service health check |  |
| `POST /api/v1/run/preflight` | Preflight a run request | `body*:run_Selector` |
| `POST /api/v1/run/resolve` | Resolve an application via JSON body | `body*:run_Selector` |
| `GET /api/v1/run/resolve` | Resolve an application and return exact shell command | `?app*` `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `POST /api/v1/run/batch` | Execute a batch of search or run requests | `body*:run_BatchRequest` |
| `GET /api/v1/run/go/{rest}` | Path-based resolve (positional or key-value) | `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `GET /api/v1/run/t/{terminal_id}/go/{rest}` | Terminal-anchored path-based resolve | `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `GET /api/v1/run/search` | Search for app candidates | `?app*` `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?limit` |
| `POST /api/v1/run/search/paged` | Search for app candidates with cursor pagination | `body*:run_PagedSearchRequest` |

**Param notes:**

- `app` — Primary name query
- `os` — Target OS filter
- `source` — Source kind filter (repeatable)
- `kind` — App kind filter
- `arch` — Target CPU architecture filter
- `tags` — Free-form tags for filtering and ranking (repeatable)
- `profile` — Named profile for default preferences
- `channel` — Release channel hint
- `version` — Exact version or provider-defined version constraint
- `variant` — Provider-specific variant hint
- `publisher` — Publisher hint for curated registries
- `repo` — Repository hint such as owner/name
- `release` — Release hint such as a tag name
- `asset` — Desired asset name or pattern
- `pick` — Candidate selection mode (ask, first, index, id)
- `pick_index` — Candidate index (required when pick=index)
- `candidate_id` — Specific candidate ID (required when pick=id)
- `set_id` — Bind pick to a specific candidate set
- `terminal_id` — Terminal session ID (default 1)
- `display` — X11 DISPLAY number
- `origin` — Origin identifier for observability propagation
- `dry_run` — If true, force command-only response (hoody-run never executes)
- `print_curl` — Generate curl command (hoody-run)
- `format` — Output format (json or html)
- `limit` — Max candidates (default 25)
- `rest` — Path segments for positional or key-value app specification
- `os` — Target OS filter when not supplied in the path
- `kind` — App kind filter when not supplied in the path
- `terminal_id` — Terminal session ID when not supplied in the path
- `rest` — Path segments for app specification
- `app` — Primary name query (aliases q, name)
- `kind` — App kind filter (gui, cli, any)
- `channel` — Release channel hint (for example stable or beta)
- `variant` — Provider-specific variant hint (for example portable or headless)
- `limit` — Max candidates to return (default 25)

### `sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/sources` | Create a new package source | `body*:run_SourceConfig` |
| `DELETE /api/v1/run/sources/{source_id}` | Delete a package source |  |
| `GET /api/v1/run/sources/{source_id}/diagnostics` | Get runtime diagnostics for a source |  |
| `GET /api/v1/run/sources` | List all package sources |  |
| `POST /api/v1/run/sources/sync` | Sync all sources |  |
| `POST /api/v1/run/sources/{source_id}/sync` | Sync a single source |  |
| `PATCH /api/v1/run/sources/{source_id}` | Update a package source | `body*` |

**Body shapes:**

- `PATCH /api/v1/run/sources/{source_id}` body — `object` — Partial source configuration fields to update


### Body schemas

- `run_PagedSearchRequest` — `{ selector*: run_Selector, cursor: string, page_size: int }`
- `run_Selector` — `{ app*: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
- `run_BatchRequest` — `{ items: run_BatchItemRequest[] }`
- `run_SourceConfig` — `{ source_id*: string, enabled*: bool, priority*: int, provider*: run_SourceKind, source_type*: run_SourceType, pin: run_SourcePin, config: object }`
- `run_ProfileConfig` — `{ name*: string, description: string, defaults: run_ProfileDefaults, sources_mode: run_ProfileSourceMode, sources: run_ProfileSourceOverride[], policy: run_PolicyConfig }`
- `run_RecipeConfig` — `{ name*: string, description: string, selector_template: run_SelectorTemplate, allowed_overrides: string[] }`
- `run_RecipeExecutionRequest` — `{ overrides: run_SelectorTemplate }`
- `run_Os` — `"linux" | "windows" | "any"`
- `run_AppKind` — `"gui" | "cli" | "any"`
- `run_SourceKind` — `"nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "any"`
- `run_Arch` — `"amd64" | "arm64" | "any"`
- `run_PickMode` — `"ask" | "first" | "index" | "id"`
- `run_OutputFormat` — `"json" | "html"`
- `run_PrintCurlMode` — `"hoody-run"`
- `run_BatchItemRequest` — `{ request_id*: string, mode*: run_BatchMode, selector*: run_Selector }`
- `run_SourceType` — `"nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "manifest-registry" | …(11 values)`
- `run_SourcePin` — `{ url*: string, sha256: string, author_pubkey_ed25519: string, sig_ed25519: string }`
- `run_ProfileDefaults` — `{ os: run_Os, kind: run_AppKind, source: run_SourceKind[], pick: run_PickMode, terminal_id: int, display: string, limit: int }`
- `run_ProfileSourceMode` — `"inherit" | "allowlist"`
- `run_ProfileSourceOverride` — `{ source_id*: string, enabled: bool, priority: int }`
- `run_PolicyConfig` — `{ require_verified: bool, require_integrity: bool, deny_providers: run_SourceKind[], deny_source_ids: string[] }`
- `run_SelectorTemplate` — `{ app: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
- `run_BatchMode` — `"search" | "run"`
