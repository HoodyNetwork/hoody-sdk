> _**CLI skill · `run` namespace** · ~3,174 tokens · hoody-sdk v1.0.0-beta.11_

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

→ See `SKILL-CLI.md § Proxy URLs`.

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
- CLI: `hoody run <app>` resolves an app to a command (e.g. `hoody run firefox`). Bare `run` PRINTS the command on stdout (context — `title · provider · kind · score`, viewer URLs, warnings — on stderr) and launches nothing; the run kit stays a pure resolver.
- CLI `--open`: after resolving, the CLI executes the command in the container for you (via the terminal kit's `POST /api/v1/terminal/execute`, detached with `wait:false`) — the run kit still never executes. `--open` needs a single pick, so it can't combine with `--pick ask` (or an unpicked candidate set); use `--pick first|id|index`. In `--open` mode the PRIMARY viewer URL goes to stdout (display URL for a GUI app, terminal URL for a CLI app).
- CLI GUI apps: a `kind:'gui'` result is launched with `DISPLAY` pointed at the handoff's display and surfaces BOTH a display URL (where it renders) and a terminal URL; a `kind:'cli'` result surfaces the terminal URL. URLs come from the resolver's `preview_*_url` when set, else are built from the container's kit routing (`display-{n}` / `terminal-{n}`).
- CLI `--browser`: with `--open`, also opens the primary viewer URL in the local browser (implies `--open`; falls back to printing the URL when headless).
## Common errors

- `400 INVALID_PICK` — bad `pick_index`/`candidate_id`.
- `409 cursor set expired` — re-search.
- `502 SOURCE_RESOLUTION_FAILED` — a source (e.g. `nix`/`pkgx`) failed or is missing.

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. The default `pick` mode is `ask` (returns candidates, no selection); use `first` to auto-pick the highest-ranked one.

**Step 1 — search.** Returns a `set_id` (binds your follow-up `pick` against this exact candidate list — `set_id` expires after ~300s) and `candidates[]` ranked by score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

**Step 2 — resolve to a command.** `pick: 'first'` returns `shell_command` for the top candidate.

```bash
# Print the command (resolver only — nothing runs):
hoody run firefox -c "$C"
# → nix run nixpkgs#firefox        (stdout; title/provider/kind/score + viewer URLs on stderr)

# Launch it in the container (detached) and print the viewer URLs.
# firefox is a GUI app, so you get BOTH a display URL and a terminal URL:
hoody run firefox -c "$C" --open
#   Firefox · registry · gui · score 337
#   command: nix run nixpkgs#firefox
#   launched (detached) in terminal 1 on display :1.
#   display:  https://<P>-<C>-display-1.<N>.containers.hoody.com/     (stderr)
#   terminal: https://<P>-<C>-terminal-1.<N>.containers.hoody.com/    (stderr)
# → https://<P>-<C>-display-1.<N>.containers.hoody.com/               (stdout: primary viewer)

# Launch AND open the display in your local browser:
hoody run firefox -c "$C" --browser
```
### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the resolved shell-form) and `execution_plan.{argv,env,cwd}` (the argv-form). When the candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated so a caller can open the preview; resolve itself never launches anything.

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` resolves to `system-path:/usr/bin/git` by default, but you specifically want the `pkgx` candidate at index 2. Bind the pick to a `set_id` to avoid the candidate list shifting under you.

**Step 1 — list candidates with `set_id`.**

**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

**Pick by id alternative** — when you know the exact candidate, use `pick: 'id'` + `candidate_id`:

### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → no filter. `kind` narrows by classification (`cli` / `gui` / `any`).

**Tags** are free-form ranking hints (e.g. `tags: ['portable']` boosts AppImage / pkgx candidates). Combine with `kind: 'gui'` for X11 apps, or `os: 'windows'` to filter the catalog to Wine-runnable variants.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

### 6. Pagination — walk a long candidate list with `POST /api/v1/run/search/paged`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

**Step 2 — fetch all pages.** ⚠ The `search/paged` endpoint returns one page per call — there is no built-in drain-all behavior, so walk it manually by carrying `next_cursor` between calls until it's null/absent.
⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

**Step 2 — poll.** Status transitions `queued → running → done` (or `error`). Search-resolve jobs have a 10-minute TTL refreshed on every status/result read, so polling keeps them alive — but plan to read the result the moment status flips to `done`/`error` rather than relying on the TTL.

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response) or `result: 'run'` (with `selected` + `shell_command`).

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; any `overrides.*` outside it is rejected with `400 "recipe override not allowed: <field>"` on `POST /api/v1/run/recipes/{name}/run` — update the recipe to widen the allow-list.

**Step 2 — list / get / update / delete.**

### 10. Invoke a recipe with overrides — `POST /api/v1/run/recipes/{name}/run`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `POST /api/v1/run/resolve` (`{ status, shell_command, selected, ... }`).

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `POST /api/v1/run/recipes/{name}/search`:

⚠ Overrides outside `allowed_overrides` are **rejected** with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped. Use `PATCH /api/v1/run/recipes/{name}` to widen the allow-list.

## Reference

_(no CLI commands registered for this namespace)_
