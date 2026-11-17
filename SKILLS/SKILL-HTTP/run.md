> _**HTTP skill · `run` namespace** · ~11,471 tokens · hoody-sdk v1.0.1_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (the built-in starter catalogue, trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests, npm, PyPI). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

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

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. POST `/api/v1/run/search/paged` with `{ "selector": { "app": "<app>" }, "page_size": 25 }` (add any of `os`, `kind`, `arch`, `tags`, `source` inside `selector` when you need that filter; all are optional; `page_size`, default 25, max 100, sets the page; `selector.limit` is ignored here; pass `cursor` for the next page) → `{ set_id, total_count, items[], next_cursor? }`.
2. POST `/api/v1/run/resolve` with `{ "app": "<app>", "set_id": "<set_id>", "pick": "id", "candidate_id": "<id>" }` (copy `candidate_id` from the chosen item; add the same selector fields as the search) → `shell_command`. `pick_index` indexes the whole cached set, not the current page, so a position from a later page can select a different candidate or fail; if the policy changed since the search, later pages may also skip candidates that are now denied.

### 2. Preflight

1. POST `/api/v1/run/preflight` with `{ "app": "<app>", "pick": "first" }` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. POST `/api/v1/run/resolve` with `{ "app": "<app>", "pick": "first" }` → `shell_command` and `handoff` (the preview).

Without `pick` (and no profile default), or with `"pick": "ask"`, preflight answers `search-only` with no command, and resolve returns the candidate set with nothing selected.

### 3. Cursor-paged search

`POST /api/v1/run/search/paged` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.

### 4. Batch

`POST /api/v1/run/batch` with `{ items: [{ request_id, mode, selector }] }`. `mode:"run"` resolves each item like `resolve`: a successful `first`, `index` or `id` pick returns a selected candidate and its command; if the effective pick is absent or `ask` (an omitted pick can inherit a profile default), the item returns the candidate set with `status: "resolved"`. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code, status }`), so one bad item does not fail the batch.

### 5. Recipes

`POST /api/v1/run/recipes` with `{ name, selector_template, allowed_overrides }`; invoke it with `POST /api/v1/run/recipes/{name}/run`, passing only the allow-listed fields under `overrides`.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body).
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`); nix ignores `kind` (every nix candidate reports `kind: any`); npm and PyPI ignore `kind` and report every candidate as `kind: cli`, so a `kind: gui` search can still return them; the starter catalogue filters by exact kind for `gui` and `cli`, while `any` allows all kinds; trusted-list and manifest entries are filtered only when they declare the field; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates for an `os` other than `linux` or `any`, such as `windows`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (under the default priorities the built-in starter catalogue, 1100, ranks above the trusted list, 1000, which ranks above system-path, 200, and the package sources), then score, then the source and that source's own order, then `candidate_id`, so the top hit is not always the highest score. Read the returned list and pick by `candidate_id`, or by its index in the full cached set (not its position on a page).
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for 30 seconds by default; the kit configuration can change that duration.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url?, suggested: { band: [8001, 9999], opens_in } }`, where `suggested` is where a client that opens the app itself should put it: a starter entry's own surface, a terminal for an OCI image, a window for a `gui` candidate, else a terminal); a `resolved` response has none. The two preview URLs are predicted for the target, not from the candidate: an operator URL template takes `terminal_id`; without one, `preview_terminal_url` is the computer's own kit host for `terminal_id` and `preview_display_url` the one for `display` (default `terminal_id`). Either is absent when it cannot be built (no template or routing, or a `display` that is not a display number), and neither proves anything is running.
- `POST /api/v1/run/batch` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `POST /api/v1/run/recipes/{name}/run` / `POST /api/v1/run/recipes/{name}/search` reject a recipe template field set (non-null) under `overrides` outside `allowed_overrides` with `400 OVERRIDE_NOT_ALLOWED` (`recipe override not allowed: <field>`); it is not silently dropped. Keys that are not recipe template fields are ignored, including `enrich`, `args`, `pass_env`, `launch_tag` and `launch_env`: a recipe cannot set them. Spell field names exactly.
- **Outbound requests the kit makes itself (webhook delivery, remote manifest index fetches, source fetches) go only to public internet destinations.** A URL that points at the computer itself or at another computer is refused, so a remote index or webhook URL of that kind cannot work. Webhooks are configured in the kit's config file only (`GET /api/v1/run/config` is read-only), so this matters mainly when diagnosing a source sync or a webhook someone set up. A refusal carries the marker `refusing to connect to` and is not retried; `the name <host> resolved to no address` carries no marker and is a transient failure. Proxy environment variables are ignored; webhook and remote-index fetches follow no redirects, and source fetches follow at most ten. Helper binaries a provider shells out to (`nix search`) are outside this guarantee.
- `selected.run_plan` carries `command`/`env`/`cwd` and is always present. `selected.execution_plan` (`argv`/`env`/`cwd`) is optional: trusted-list and manifest candidates omit it. Read it as optional and use `shell_command` for the command to run.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix, where it wins over any other `terminal_id`). Both are public HTTP routes, but neither has an SDK method: programmatic callers use the resolve endpoint from the first bullet. 

## Common errors

Every error body is `{ "error": "<text>", "code": "<code>", "status": <HTTP status> }`. Match on the symbolic `code` and the HTTP `status`; a batch error item carries the same payload under `error`.

- `400 INVALID_PICK` (`pick_index required`, `pick_index out of range: <N>`, `candidate_id required`, `candidate_id not found`) or `400 NO_CANDIDATES` (`no candidates`): the pick does not match the candidate set.
- `400 INVALID_SELECTOR: invalid <field>: <value>`: a query-string selector value is not accepted, for example an unknown `source`.
- `400 INVALID_BODY` with a deserialization message: a JSON body carries a value that is not in the field's enum (for example `"kind":"create"`), misses a required field or has a wrongly typed one.
- `409 SET_EXPIRED`: an index pick (`pick_index`) names a `set_id` that is unknown or older than 300 s and is not the freshly resolved set; search again and pick against the new `set_id`. An id pick (`candidate_id`) does not get this error: it falls back to the fresh set, since `candidate_id` is content-addressed.
- `403 POLICY_DENIED: …`: the effective policy does not permit the selected candidate.
- `409 CURSOR_SET_EXPIRED` (`cursor set expired`): `search/paged` only; start again without a cursor.
- A single source such as `nix` or `pkgx` that fails or is missing does not fail the request: the search continues with the other sources and can return an empty list (a pick against it then gives `400 NO_CANDIDATES`). An error the source reports is recorded in its diagnostics (`GET /api/v1/run/sources/{source_id}/diagnostics`), and can also appear in the response `warnings`, for example as `SOURCE_FAILED` for a source error or `SOURCE_TIMEOUT` for a source timeout. A missing pkgx tool is treated as an empty successful result, so it produces no warning and the diagnostics can show no error. `502 SOURCE_RESOLUTION_FAILED` is reserved for a resolution that fails as a whole.
- `404 JOB_NOT_FOUND` (`job not found`): the job id is unknown or its TTL ran out (see example 7).

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected.

**Step 1 — search.** Returns a `set_id` (a later `pick:"index"` sent with it selects from this exact candidate list; `set_id` expires after ~300s) and the candidates (`candidates[]` over HTTP, `items[]` from the SDK and CLI search, which is the cursor-paged one), ordered by source priority, then score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
SEARCH=$(curl -sf "$KIT/api/v1/run/search?app=firefox&kind=any&limit=5") || exit 1
echo "$SEARCH" | jq '{set_id, count: (.candidates|length), top: (.candidates[0]|{candidate_id,title,provider,kind,score})}'
```

**Step 2 — resolve to a command.** To take the top candidate of the list you just saw, send its `set_id` with `pick:"index"` and `pick_index:0`. (`pick:"first"` also works, but it ignores `set_id` and picks from a freshly resolved list, which can differ from the one you displayed.)

```bash
SET=$(jq -r .set_id <<< "$SEARCH")   # the set_id from step 1
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg s "$SET" '{app:"firefox",kind:"any",set_id:$s,pick:"index",pick_index:0}')" \
  | jq '{shell_command, candidate_id: .selected.candidate_id, status}'
# → { "shell_command": "'nix' '--extra-experimental-features' 'nix-command' '--extra-experimental-features' 'flakes' 'run' 'nixpkgs#firefox' '--'", "candidate_id": "<64-hex content hash>", "status": "dry-run" }
# Illustrative: with the default sources the starter catalogue's entry ranks first; the exact command
# depends on the enabled sources, their priorities and how nix is invoked on the computer.
```

### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list and manifest candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` are built for the target, not from the candidate (from an operator URL template when one is set, else from the computer's own kit host for `display` and `terminal_id`), and either is absent when it cannot be built. Resolve itself never launches anything.

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"echo","kind":"cli","pick":"first"}' \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url: .handoff.preview_terminal_url}'
```

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` matches several candidates and you want one other than the first (say the `pkgx` one). Positions depend on source priority and on which sources are available, so list the candidates, find the index of the one you want, and bind the pick to the `set_id` so the list cannot shift under you. The examples below use index 2; use the index you actually found.

**Step 1 — list candidates with `set_id`.**

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
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

**Pick by id alternative** — use `pick: 'id'` + `candidate_id`, copying the exact `candidate_id` from the step 1 response. It is a content hash, so never build one from the provider or the executable path.

```bash
CID="<paste candidate_id from step 1>"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg s "$SET" --arg c "$CID" '{app:"git",kind:"cli",set_id:$s,pick:"id",candidate_id:$c}')" \
  | jq .shell_command
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** restrict a search to one source (here the system PATH) so the nix/pkgx/appimage tails are skipped. Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=jq&os=linux&arch=amd64&kind=cli&source=system&limit=5" \
  | jq '{count: (.candidates|length), providers: [.candidates[].provider]}'
# → { "count": 1, "providers": ["system"] }
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both; nix ignores `kind`; npm and PyPI ignore `kind` and report every candidate as `kind: cli`; the starter catalogue keeps only the requested `gui` or `cli` kind; trusted-list and manifest entries are filtered on the fields they declare; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates at all for a Windows `os`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/preflight" \
  -H 'Content-Type: application/json' \
  -d '{"app":"xeyes","kind":"gui","pick":"first"}' \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```

### 6. Pagination — walk a long candidate list with `search`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` and its cached candidates. Each page re-applies the current effective policy to that cached set, so a page can hold fewer items than `page_size` and `total_count` can change between pages. The cursor's position does not shift: it is a position in the unfiltered cached set. A cursor sent with a different selector is refused with `400 INVALID_CURSOR`.

**Step 1 — first page.**

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
RESP=$(curl -sf -X POST "$KIT/api/v1/run/search/paged" \
  -H 'Content-Type: application/json' \
  -d '{"selector":{"app":"git","kind":"cli"},"page_size":3}')
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.

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

Warning: `409 CURSOR_SET_EXPIRED` means the snapshot behind the cursor is gone (it lives about 300s from the last search that stored it, and the kit keeps at most 16 per `set_id`). Search again without a cursor and page from that answer; its `set_id` is the same when the candidates are unchanged.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

Warning: `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form is refused with `400 INVALID_BODY` (missing field `app`).

**Step 1 — submit.**

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/run/search/jobs" \
  -H 'Content-Type: application/json' \
  -d '{"app":"firefox","kind":"any"}' \
  | jq -r .job_id)
echo "$JID"   # e.g. 7cbf9b58-1aeb-499d-a8fa-6ed160c90893
```

**Step 2 — wait for the result.** Status transitions `queued → running → done`, or ends in `error`, or in `cancelled` after a cancel request; all three are final, so stop polling on any of them. The job's TTL restarts only when its state changes, not when it is read, so polling does not keep a finished job alive; a caller that comes back too late gets `404 JOB_NOT_FOUND`. Long-poll with `wait=done` and `timeout_ms` (max 120000) so the call returns as soon as the job finishes, and read the result from that response.

```bash
while :; do
  R=$(curl -sf "$KIT/api/v1/run/jobs/$JID?wait=done&timeout_ms=60000") || { echo "job lookup failed" >&2; break; }
  S=$(echo "$R" | jq -r .status)
  case "$S" in done|error|cancelled) echo "$R" | jq '{status, result}'; break;; esac
done
```

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (a resolve response, including `selected` and `shell_command` when a candidate is successfully picked) or `result: 'error'` (with `error: { error, code, status }` for that item only; the rest of the batch still runs).

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/batch" \
  -H 'Content-Type: application/json' \
  -d '{"items":[
    {"request_id":"a","mode":"run","selector":{"app":"ls","kind":"cli","pick":"first"}},
    {"request_id":"b","mode":"run","selector":{"app":"echo","kind":"cli","pick":"first"}},
    {"request_id":"c","mode":"search","selector":{"app":"git","kind":"cli","limit":3}}
  ]}' \
  | jq '.items | map({request_id, result, shell: .run.shell_command, count: (if .search then (.search.candidates | length) else null end), error: .error})'
```

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; a recipe template field set under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `POST /api/v1/run/recipes/{name}/run` — update the recipe to widen the allow-list. A key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, not rejected.

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
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
# After example 10 (it uses this recipe):
# curl -sX DELETE "$KIT/api/v1/run/recipes/team-js-runtime"
```

### 10. Invoke a recipe with overrides — `POST /api/v1/run/recipes/{name}/run` with `{ overrides }`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```bash
KIT="https://${P}-${C}-run-1.${N}.computers.hoody.com"
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

Warning: A recipe template field set under `overrides` outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, so spell field names exactly. Use `PATCH /api/v1/run/recipes/{name}` to widen the allow-list.

## Reference

### `catalog` (1) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/catalog` | List the starter apps | `?q` |

**Param notes:**

- `q` — Words to filter by; absent or blank lists every entry

### `jobs` (4) — APIs for tracking async job status with optional long-polling support for sync and background operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/jobs/{job_id}/cancel` | Cancel a search job |  |
| `GET /api/v1/run/jobs/{job_id}` | Get job status | `?wait` `?timeout_ms` |
| `GET /api/v1/run/jobs` | List background jobs | `?kind` `?status` |
| `POST /api/v1/run/search/jobs` | Start an async search job | `body*:run_Selector` |

**Param notes:**

- `wait` — Set to 'done' to long-poll until the job completes, fails or is cancelled, or until timeout_ms passes. Takes effect only with a positive timeout_ms; without one the current state is returned at once.
- `timeout_ms` — Long-poll timeout in milliseconds (default 0, max 120000)
- `kind` — Only jobs of this kind
- `status` — Only jobs in this status

### `kit` (2) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/capabilities` | Resolve features of this service |  |
| `GET /api/v1/run/config` | Get full runtime configuration |  |

### `profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/profiles` | Create a new profile | `body*:run_ProfileConfig` |
| `DELETE /api/v1/run/profiles/{profile}` | Delete a profile |  |
| `GET /api/v1/run/profiles` | List all profiles |  |
| `PATCH /api/v1/run/profiles/{profile}` | Update a profile | `body*:run_ProfileUpdate` |
| `POST /api/v1/run/profiles/{profile}/select` | Select the active profile |  |

**Param notes:**

- `profile` — Profile name _(on `DELETE /api/v1/run/profiles/{profile}`, `PATCH /api/v1/run/profiles/{profile}`)_
- `profile` — Profile name to select _(on `POST /api/v1/run/profiles/{profile}/select`)_

### `recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/recipes` | Create a saved recipe | `body*:run_RecipeConfig` |
| `DELETE /api/v1/run/recipes/{name}` | Delete a saved recipe |  |
| `GET /api/v1/run/recipes/{name}` | Get a saved recipe |  |
| `GET /api/v1/run/recipes` | List saved launch recipes |  |
| `POST /api/v1/run/recipes/{name}/run` | Run using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `POST /api/v1/run/recipes/{name}/search` | Search using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `PATCH /api/v1/run/recipes/{name}` | Update a saved recipe | `body*:run_RecipeUpdate` |

**Param notes:**

- `name` — Recipe name

### `run` (9) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/resolve` | Resolve an application via JSON body | `body*:run_Selector` |
| `GET /api/v1/run/resolve` | Resolve an application and return exact shell command | `?app*` `?os` `?source` `?source_id` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` `?enrich` `?args` `?pass_env` `?launch_tag` `?launch_env` |
| `POST /api/v1/run/batch` | Execute a batch of search or run requests | `body*:run_BatchRequest` |
| `POST /api/v1/run/search/paged` | Search for app candidates with cursor pagination | `body*:run_PagedSearchRequest` |
| `POST /api/v1/run/preflight` | Preflight a run request | `body*:run_Selector` |
| `GET /api/v1/run/health` | Service health check |  |
| `GET /api/v1/run/search` | Search for app candidates | `?app*` `?os` `?source` `?source_id` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?limit` `?enrich` |
| `GET /api/v1/run/go/{rest}` | Path-based resolve (positional or key-value) | `?os` `?source` `?source_id` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` `?enrich` `?args` `?pass_env` `?launch_tag` `?launch_env` |
| `GET /api/v1/run/t/{terminal_id}/go/{rest}` | Terminal-anchored path-based resolve | `?os` `?source` `?source_id` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` `?enrich` `?args` `?pass_env` `?launch_tag` `?launch_env` |

**Param notes:**

- `app` — Primary name query _(on `GET /api/v1/run/resolve`)_
- `os` — Target OS filter _(on `GET /api/v1/run/resolve`, `GET /api/v1/run/search`)_
- `source` — Source kind filter (repeatable)
- `source_id` — Search only the configured sources with these source ids (repeatable; GET /api/v1/run/sources lists them). Intersects with source, the profile and the policy; it never enables a source. An id that is not configured gives 400 INVALID_SELECTOR; a named source that is disabled or filtered out adds a SOURCE_NOT_SEARCHED warning
- `kind` — App kind filter _(on `GET /api/v1/run/resolve`)_
- `arch` — Target CPU architecture filter
- `tags` — Free-form selector tags (repeatable). Accepted and passed through to sources and recipe templates; they do not filter or rank candidates
- `profile` — Named profile for default preferences
- `channel` — Release channel hint. Accepted but not applied yet: no source filters or ranks on it, and setting it adds a SELECTOR_HINT_IGNORED warning _(on `GET /api/v1/run/resolve`, `GET /api/v1/run/go/{rest}`, `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_
- `version` — Exact version or provider-defined version constraint
- `variant` — Provider-specific variant hint. Accepted but not applied yet: no source filters or ranks on it, and setting it adds a SELECTOR_HINT_IGNORED warning _(on `GET /api/v1/run/resolve`, `GET /api/v1/run/go/{rest}`, `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_
- `publisher` — Keep only candidates by this publisher, compared case-insensitively: a Docker Hub namespace or publisher (library or docker for official images), a GHCR owner, an npm scope (with or without @) or publisher, a PyPI author, a GitHub owner of an AppImage. A candidate whose source reports no publisher (nix, pkgx, system) is kept with a provider note saying it was not checked
- `repo` — Repository hint such as owner/name
- `release` — Release hint such as a tag name
- `asset` — Desired asset name or pattern
- `pick` — Candidate selection mode (ask, first, index, id)
- `pick_index` — Candidate index (required when pick=index)
- `candidate_id` — Specific candidate ID (required when pick=id)
- `set_id` — Bind pick to a specific candidate set
- `terminal_id` — Terminal session ID (default 1) _(on `GET /api/v1/run/resolve`)_
- `display` — X11 DISPLAY number
- `origin` — Origin identifier for observability propagation
- `dry_run` — If true, force command-only response (hoody-run never executes)
- `print_curl` — Generate curl command (hoody-run)
- `format` — Output format (json or html)
- `limit` — Max candidates (default 25, clamped to 1-100) _(on `GET /api/v1/run/resolve`, `GET /api/v1/run/go/{rest}`, `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_
- `enrich` — Fill candidate details more completely with extra requests per candidate (Docker Hub repository and tags, the npm packument, PyPI download stats, GitHub repository metadata); at most 10 candidates per source, inside the source timeout. Default false: a plain search makes none of these requests. Accepts true, false, 1 or 0
- `args` — Launch argument for the selected app (repeatable, in order; at most 64, each at most 4096 bytes). Appended as separate words to the selected command; a source-authored shell command answers 400 ARGS_UNSUPPORTED
- `pass_env` — Env name an OCI command passes into the container as --env NAME, without a value (repeatable, at most 32)
- `launch_tag` — Tag of one launch, 16 lowercase hex characters; an OCI command gets -it --name hoody-run-<tag> --label hoody.run.tag=<tag>
- `launch_env` — inline (default) exports env values in shell_command; separate writes no value into any command and returns them in launch_env
- `app` — Primary name query (aliases q, name) _(on `GET /api/v1/run/search`)_
- `kind` — App kind filter (gui, cli, any) _(on `GET /api/v1/run/search`)_
- `channel` — Release channel hint (for example stable or beta). Accepted but not applied yet: no source filters or ranks on it, and setting it adds a SELECTOR_HINT_IGNORED warning _(on `GET /api/v1/run/search`)_
- `variant` — Provider-specific variant hint (for example portable or headless). Accepted but not applied yet: no source filters or ranks on it, and setting it adds a SELECTOR_HINT_IGNORED warning _(on `GET /api/v1/run/search`)_
- `limit` — Max candidates to return (default 25, clamped to 1-100) _(on `GET /api/v1/run/search`)_
- `rest` — Path segments for positional or key-value app specification _(on `GET /api/v1/run/go/{rest}`)_
- `os` — Target OS filter when not supplied in the path _(on `GET /api/v1/run/go/{rest}`, `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_
- `kind` — App kind filter when not supplied in the path _(on `GET /api/v1/run/go/{rest}`, `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_
- `terminal_id` — Terminal session ID when not supplied in the path _(on `GET /api/v1/run/go/{rest}`)_
- `rest` — Path segments for app specification _(on `GET /api/v1/run/t/{terminal_id}/go/{rest}`)_

### `sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/sources` | Create a new package source | `body*:run_SourceConfig` |
| `DELETE /api/v1/run/sources/{source_id}` | Delete a package source |  |
| `GET /api/v1/run/sources/{source_id}/diagnostics` | Get runtime diagnostics for a source |  |
| `GET /api/v1/run/sources` | List all package sources |  |
| `POST /api/v1/run/sources/{source_id}/sync` | Sync a single source |  |
| `POST /api/v1/run/sources/sync` | Sync all sources |  |
| `PATCH /api/v1/run/sources/{source_id}` | Update a package source | `body*:run_SourceUpdate` |


### Body schemas

- `run_PagedSearchRequest` — `{ selector*: run_Selector, cursor: string, page_size: int }`
  - `page_size` — Candidates per page (default: 25). Any non-negative value is accepted; the service clamps it to 1-100.
- `run_Selector` — `{ app*: string, os: run_Os|null, kind: run_AppKind|null, source: run_SourceKind[], source_id: string[], arch: run_Arch|null, tags: string[], profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: run_PickMode|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: run_OutputFormat|null, dry_run: bool|null, print_curl: run_PrintCurlMode|null, limit: int|null, enrich: bool=false, args: string[], pass_env: string[], launch_tag: string, launch_env: run_LaunchEnvMode }`
- `run_BatchRequest` — `{ items: run_BatchItemRequest[] }`
  - `items` — At most 100 items; a longer list is refused as a whole with 400 BATCH_TOO_LARGE.
- `run_SourceConfig` — `{ source_id*: string, enabled*: bool, priority*: int, provider*: run_SourceKind, source_type*: run_SourceType, pin: run_SourcePin|null, config: object }`
  - `provider` — The provider of source_type, and it must match it: nix for nix-pkgs and nix-flake, pkgx for pkgx, appimage for the app-image-* types, oci for the oci-* types, registry for manifest-registry, manifest-remote-index, trusted-list-file and starter-catalog, system for system-path, npm for npm-registry-search, pypi for pypi-exact. any is not a provider; a mismatch is refused with 400 SOURCE_PROVIDER_MISMATCH.
  - `config` — Provider-specific configuration (varies by source_type), always an object; `{}` when omitted, and null or any other type is refused with 400 INVALID_SOURCE. …
- `run_SourceUpdate` — `{ enabled: bool, priority: int, pin: run_SourcePin|null, config: object }`
  - Partial source update. Only the fields present in the body are applied; everything else keeps its stored value. The merged source is re-validated before it is committed, so a patch that would downgrade a signed remote index is refused.
  - `config` — Provider-specific configuration. Replaces the stored object as a unit; null or any other type than an object is refused with 400 INVALID_SOURCE.
- `run_ProfileConfig` — `{ name*: string, description: string|null, defaults: run_ProfileDefaults, sources_mode: run_ProfileSourceMode, sources: run_ProfileSourceOverride[], policy: run_PolicyConfig }`
- `run_ProfileUpdate` — `{ description: string|null, defaults: run_ProfileDefaultsUpdate, sources_mode: "inherit" | "allowlist"|null, sources: run_ProfileSourceOverride[]|null, policy: run_PolicyConfigUpdate }`
  - … The merged profile is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The profile's name is taken from the path and cannot be changed here.
- `run_RecipeConfig` — `{ name*: string, description: string, selector_template: run_SelectorTemplate, allowed_overrides: string[] }`
- `run_RecipeUpdate` — `{ description: string|null, selector_template: run_SelectorTemplateUpdate, allowed_overrides: string[]|null }`
  - … The merged recipe is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The recipe's name is taken from the path and cannot be changed here.
- `run_RecipeExecutionRequest` — `{ overrides: run_SelectorTemplate }`
- `run_Os` — `"linux" | "windows" | "any"`
- `run_AppKind` — `"gui" | "cli" | "any"`
- `run_SourceKind` — `"nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "npm" | "pypi" | "any"`
- `run_Arch` — `"amd64" | "arm64" | "any"`
- `run_PickMode` — `"ask" | "first" | "index" | "id"`
  - Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
- `run_OutputFormat` — `"json" | "html"`
- `run_PrintCurlMode` — `"hoody-run"`
- `run_LaunchEnvMode` — `"inline" | "separate"`
- `run_BatchItemRequest` — `{ request_id*: string, mode*: run_BatchMode, selector*: run_Selector }`
- `run_SourceType` — `"nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "oci-docker-hub-search" | "oci-ghcr" | "manifest-registry" | "manifest-remote-index" | "system-path" | "trusted-list-file" | "starter-catalog" | "npm-registry-search" | "pypi-exact"`
- `run_SourcePin` — `{ url*: string, sha256: string|null, author_pubkey_ed25519: string|null, sig_ed25519: string|null }`
- `run_ProfileDefaults` — `{ os: run_Os|null, kind: run_AppKind|null, source: run_SourceKind[], pick: run_PickMode|null, terminal_id: int|null, display: string|null, limit: int|null }`
  - `limit` — Default maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `run_ProfileSourceMode` — `"inherit" | "allowlist"`
- `run_ProfileSourceOverride` — `{ source_id*: string, enabled: bool|null, priority: int|null }`
- `run_PolicyConfig` — `{ require_verified: bool|null, require_integrity: bool|null, deny_providers: run_SourceKind[], deny_source_ids: string[] }`
- `run_ProfileDefaultsUpdate` — `{ os: "linux" | "windows" | "any"|null, kind: "gui" | "cli" | "any"|null, source: run_SourceKind[]|null, pick: "ask" | "first" | "index" | "id"|null, terminal_id: int|null, display: string|null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
  - `limit` — Default maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `run_PolicyConfigUpdate` — `{ require_verified: bool|null, require_integrity: bool|null, deny_providers: run_SourceKind[]|null, deny_source_ids: string[]|null }|null`
- `run_SelectorTemplate` — `{ app: string|null, os: run_Os|null, kind: run_AppKind|null, source: run_SourceKind[]|null, source_id: string[]|null, arch: run_Arch|null, tags: string[]|null, profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: run_PickMode|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: run_OutputFormat|null, dry_run: bool|null, print_curl: run_PrintCurlMode|null, limit: int|null }`
  - `limit` — Maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `run_SelectorTemplateUpdate` — `{ app: string|null, os: "linux" | "windows" | "any"|null, kind: "gui" | "cli" | "any"|null, source: run_SourceKind[]|null, source_id: string[]|null, arch: "amd64" | "arm64" | "any"|null, tags: string[]|null, profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: "ask" | "first" | "index" | "id"|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: "json" | "html"|null, dry_run: bool|null, print_curl: "hoody-run"|null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
  - `limit` — Maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `run_BatchMode` — `"search" | "run"`
