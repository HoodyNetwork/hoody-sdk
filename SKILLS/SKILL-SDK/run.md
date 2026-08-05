> _**SDK skill · `run` namespace** · ~9,971 tokens · hoody-sdk v1.0.0-beta.11_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `runBatch`; persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `client.run.searchCandidates({ app, os?, kind?, arch?, tags?, source? })` → `{ set_id, candidates[] }`.
2. `client.run.resolve({ ...selector, set_id, pick:"index", pick_index:N })` → `shell_command`.

### 2. Preflight

1. `client.run.preflightRun(Selector)` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `client.run.resolve(Selector)` → resolved command + preview.

### 3. Cursor-paged search

`client.run.searchCandidatesPaged` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; drain manually by carrying `next_cursor` forward until it's null/absent.
The SDK exposes `client.run.searchCandidatesPagedAll` and `client.run.searchCandidatesPagedIterator`, but they currently only return/yield the **first page** — the generated paginator can't thread the cursor back into a cursor-paged call, so it stops after one page. To collect all candidates reliably, carry `next_cursor` forward by hand until it's null/absent.
### 4. Batch

`client.run.runBatch({ items: [{ request_id, mode, selector }] })`. `mode:"run"` resolves each item to a command.

### 5. Recipes

`recipes.createRecipe({ name, selector_template, allowed_overrides })`; invoke via `recipes.runRecipe(name, data)` — generated SDK takes `name` positional + a body, NOT a single options object.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint is `GET|POST /api/v1/run/resolve` (operations `resolveGet` / `resolve`).
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). Pass `kind` in the selector to narrow (`kind:'cli'`, `kind:'gui'`), or `kind:'any'` for no filter.
- `limit` default 25, clamped 1..=100.
- 30s query cache; `HOODY_RUN_QUERY_CACHE_TTL_MS`.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only: the response `status` is `"dry-run"` (a single picked candidate) or `"resolved"` (an unpicked candidate set), and carries a `handoff` object whose `state` is `"preview"`. When the resolved candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated. The kit never launches the app or executes anything.
- `runBatch` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `recipes.runRecipe` / `recipes.searchRecipe` reject disallowed overrides with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped.
- `selected.run_plan` carries `command`/`env`/`cwd`; `argv` is on `selected.execution_plan`.
- `/go/...` are alias routes for bookmarkable resolve URLs — `client.run.runPathBased` (selector parsed from path segments) and `client.run.runTerminalAnchored` (terminal id baked into the path prefix). Both are public and supported, but the canonical machine-facing entrypoint is `client.run.resolve` (`GET|POST /api/v1/run/resolve`) — prefer it for programmatic callers.
## Common errors

- `400 INVALID_PICK` — bad `pick_index`/`candidate_id`.
- `409 cursor set expired` — re-search.
- `502 SOURCE_RESOLUTION_FAILED` — a source (e.g. `nix`/`pkgx`) failed or is missing.

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. The default `pick` mode is `ask` (returns candidates, no selection); use `first` to auto-pick the highest-ranked one.

**Step 1 — search.** Returns a `set_id` (binds your follow-up `pick` against this exact candidate list — `set_id` expires after ~300s) and `candidates[]` ranked by score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```typescript
const r = await client.run.searchCandidates({ app: 'firefox', kind: 'any', limit: 5 });
const setId = (r.data as any).set_id;
const top = (r.data as any).candidates[0];
console.log(top.candidate_id, top.kind, top.score);
```
**Step 2 — resolve to a command.** `pick: 'first'` returns `shell_command` for the top candidate.

```typescript
const run = await client.run.resolve({
  app: 'firefox', kind: 'any', pick: 'first',
});
console.log((run.data as any).shell_command);
```
### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the resolved shell-form) and `execution_plan.{argv,env,cwd}` (the argv-form). When the candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated so a caller can open the preview; resolve itself never launches anything.

```typescript
const r = await client.run.resolve({
  app: 'echo', kind: 'cli', pick: 'first',
});
console.log('argv:', (r.data as any).selected.execution_plan.argv);
console.log('preview:', (r.data as any).preview_terminal_url);
```
### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` resolves to `system-path:/usr/bin/git` by default, but you specifically want the `pkgx` candidate at index 2. Bind the pick to a `set_id` to avoid the candidate list shifting under you.

**Step 1 — list candidates with `set_id`.**

```typescript
const list = await client.run.searchCandidates({ app: 'git', kind: 'cli', limit: 5 });
(list.data as any).candidates.forEach((c, i) =>
  console.log(i, c.candidate_id, c.provider, c.score));
const setId = (list.data as any).set_id;
```
**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```typescript
const r = await client.run.resolve({
  app: 'git', kind: 'cli', set_id: setId, pick: 'index', pick_index: 2,
});
console.log((r.data as any).shell_command);
```
**Pick by id alternative** — when you know the exact candidate, use `pick: 'id'` + `candidate_id`:

```typescript
await client.run.resolve({
  app: 'git', kind: 'cli', pick: 'id',
  candidate_id: 'system-path:/usr/bin/git',
});
```
### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → no filter. `kind` narrows by classification (`cli` / `gui` / `any`).

```typescript
const r = await client.run.searchCandidates({
  app: 'jq', os: 'linux', arch: 'amd64', kind: 'cli', source: ['system'], limit: 5,
});
const providers = new Set((r.data as any).candidates.map(c => c.provider));
// providers = Set { 'system' }
```
**Tags** are free-form ranking hints (e.g. `tags: ['portable']` boosts AppImage / pkgx candidates). Combine with `kind: 'gui'` for X11 apps, or `os: 'windows'` to filter the catalog to Wine-runnable variants.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```typescript
const pf = await client.run.preflightRun({
  app: 'xeyes', kind: 'gui', pick: 'first',
});
if ((pf.data as any).missing_requirements?.length) {
  console.error('Missing:', (pf.data as any).missing_requirements);
}
```
### 6. Pagination — walk a long candidate list with `searchCandidatesPaged`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```typescript
const page1 = await client.run.searchCandidatesPaged({
  selector: { app: 'git', kind: 'cli' }, page_size: 3,
});
console.log((page1.data as any).total_count, (page1.data as any).items.length);
const cursor = (page1.data as any).next_cursor;
```
**Step 2 — fetch all pages.** ⚠ The `search/paged` endpoint returns one page per call — there is no built-in drain-all behavior, so walk it manually by carrying `next_cursor` between calls until it's null/absent.
⚠ The SDK's `client.run.searchCandidatesPagedAll(...)` and `client.run.searchCandidatesPagedIterator(...)` helpers currently return/yield only the **first page** (the generated paginator can't advance the cursor on a cursor-paged op) — relying on them silently drops later pages, so use the manual `next_cursor` loop above to collect all candidates.
```typescript
// ⚠ searchCandidatesPagedAll / searchCandidatesPagedIterator currently return
// only the FIRST page (the paginator can't advance the cursor). Drain by hand:
let cursor2 = (page1.data as any).next_cursor;
const all = [...((page1.data as any).items as any[])];
while (cursor2) {
  const p = await client.run.searchCandidatesPaged({
    selector: { app: 'git', kind: 'cli' }, page_size: 3, cursor: cursor2,
  });
  all.push(...((p.data as any).items as any[]));
  cursor2 = (p.data as any).next_cursor;
}
console.log('drained:', all.length);
```
⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

```typescript
const sub = await client.run.jobs.createSearchJob({ app: 'firefox', kind: 'any' });
const jid = (sub.data as any).job_id;
```
**Step 2 — poll.** Status transitions `queued → running → done` (or `error`). Search-resolve jobs have a 10-minute TTL refreshed on every status/result read, so polling keeps them alive — but plan to read the result the moment status flips to `done`/`error` rather than relying on the TTL.

```typescript
let status = '';
while (!['done', 'error'].includes(status)) {
  await new Promise(r => setTimeout(r, 1000));
  const s = await client.run.jobs.getJobStatus(jid);
  status = (s.data as any).status;
}
const final = await client.run.jobs.getJobStatus(jid); // read result inline
```
### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`runBatch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response) or `result: 'run'` (with `selected` + `shell_command`).

```typescript
const batch = await client.run.runBatch({
  items: [
    { request_id: 'a', mode: 'run', selector: { app: 'ls', kind: 'cli', pick: 'first' } },
    { request_id: 'b', mode: 'run', selector: { app: 'echo', kind: 'cli', pick: 'first' } },
    { request_id: 'c', mode: 'search', selector: { app: 'git', kind: 'cli', limit: 3 } },
  ],
});
for (const it of (batch.data as any).items) {
  if (it.result === 'run')    console.log(it.request_id, it.run.shell_command);
  if (it.result === 'search') console.log(it.request_id, it.search.candidates.length, 'candidates');
}
```
### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; any `overrides.*` outside it is rejected with `400 "recipe override not allowed: <field>"` on `recipes.runRecipe` — update the recipe to widen the allow-list.

```typescript
await client.run.recipes.createRecipe({
  name: 'team-js-runtime',
  description: 'Resolve a JS runtime; team-default = node CLI',
  selector_template: {
    app: 'node', kind: 'cli', os: 'linux', arch: 'amd64', pick: 'first',
  },
  allowed_overrides: ['app', 'version', 'tags'],
});
```
**Step 2 — list / get / update / delete.**

```typescript
const list = await client.run.recipes.listRecipes();
const one  = await client.run.recipes.getRecipe('team-js-runtime');
await client.run.recipes.updateRecipe('team-js-runtime', {
  description: 'Updated: now also resolves bun/deno via override',
});
await client.run.recipes.deleteRecipe('team-js-runtime');
```
### 10. Invoke a recipe with overrides — `recipes.runRecipe(name, { overrides })`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```typescript
const r = await client.run.recipes.runRecipe('team-js-runtime', {
  overrides: { app: 'bun' },
});
console.log((r.data as any).shell_command, (r.data as any).selected.provider);
```
**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `recipes.searchRecipe`:

```typescript
const s = await client.run.recipes.searchRecipe('team-js-runtime', {
  overrides: { app: 'node' },
});
console.log((s.data as any).candidates.length, 'candidates across',
  new Set((s.data as any).candidates.map(c => c.provider)));
```
⚠ Overrides outside `allowed_overrides` are **rejected** with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped. Use `recipes.updateRecipe` to widen the allow-list.

## Reference

**Accessor:** `client.run`  |  **Import:** `import * as run from 'hoody-sdk/run'`

### `client.run.configuration` (1) — APIs for retrieving consolidated runtime configuration state including active profile selection

#### `getConfig` — Get full runtime configuration

```typescript
client.run.configuration.getConfig()
```

**Returns:** `run_ConfigFile`  |  **HTTP:** `GET /api/v1/run/config`

---

### `client.run.documentation` (2) — Self-documenting specification endpoints in JSON and YAML formats

#### `getOpenApiJson` — OpenAPI specification (JSON)

```typescript
client.run.documentation.getOpenApiJson()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/run/openapi.json`

---

#### `getOpenApiYaml` — OpenAPI specification (YAML)

```typescript
client.run.documentation.getOpenApiYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/run/openapi.yaml`

---

### `client.run.jobs` (2) — APIs for tracking async job status with optional long-polling support for sync and background operations

#### `createSearchJob` — Start an async search job

```typescript
client.run.jobs.createSearchJob(data: run_Selector)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_Selector` | body | Yes |  |

**Returns:** `run_Job`  |  **HTTP:** `POST /api/v1/run/search/jobs`

---

#### `getJobStatus` — Get job status

```typescript
client.run.jobs.getJobStatus(job_id: string, wait?: string, timeout_ms?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | Job identifier (UUID) |
| `wait` | `string` | query | No | Set to 'done' to long-poll until job completes |
| `timeout_ms` | `integer` | query | No | Long-poll timeout in milliseconds (default 0, max 120000) |

**Returns:** `run_Job`  |  **HTTP:** `GET /api/v1/run/jobs/{job_id}`

---

### `client.run.profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

#### `createProfile` — Create a new profile

```typescript
client.run.profiles.createProfile(data: run_ProfileConfig)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_ProfileConfig` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/run/profiles`

---

#### `deleteProfile` — Delete a profile

```typescript
client.run.profiles.deleteProfile(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |

**Returns:** `void`  |  **HTTP:** `DELETE /api/v1/run/profiles/{profile}`

---

#### `listProfiles` — List all profiles

```typescript
client.run.profiles.listProfiles()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/run/profiles`

---

#### `selectProfile` — Select the active profile

```typescript
client.run.profiles.selectProfile(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name to select |

**Returns:** `run_SelectedProfileResponse`  |  **HTTP:** `POST /api/v1/run/profiles/{profile}/select`

---

#### `updateProfile` — Update a profile

```typescript
client.run.profiles.updateProfile(profile: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |
| `data` | `object` | body | Yes |  |

**Returns:** `run_ProfileConfig`  |  **HTTP:** `PATCH /api/v1/run/profiles/{profile}`

---

### `client.run.recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

#### `createRecipe` — Create a saved recipe

```typescript
client.run.recipes.createRecipe(data: run_RecipeConfig)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_RecipeConfig` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/run/recipes`

---

#### `deleteRecipe` — Delete a saved recipe

```typescript
client.run.recipes.deleteRecipe(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |

**Returns:** `void`  |  **HTTP:** `DELETE /api/v1/run/recipes/{name}`

---

#### `getRecipe` — Get a saved recipe

```typescript
client.run.recipes.getRecipe(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |

**Returns:** `run_RecipeConfig`  |  **HTTP:** `GET /api/v1/run/recipes/{name}`

---

#### `listRecipes` — List saved launch recipes

```typescript
client.run.recipes.listRecipes()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/run/recipes`

---

#### `runRecipe` — Run using a saved recipe

```typescript
client.run.recipes.runRecipe(name: string, data: run_RecipeExecutionRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `run_RecipeExecutionRequest` | body | Yes |  |

**Returns:** `run_RunResponse`  |  **HTTP:** `POST /api/v1/run/recipes/{name}/run`

---

#### `searchRecipe` — Search using a saved recipe

```typescript
client.run.recipes.searchRecipe(name: string, data: run_RecipeExecutionRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `run_RecipeExecutionRequest` | body | Yes |  |

**Returns:** `run_SearchResponse`  |  **HTTP:** `POST /api/v1/run/recipes/{name}/search`

---

#### `updateRecipe` — Update a saved recipe

```typescript
client.run.recipes.updateRecipe(name: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `object` | body | Yes |  |

**Returns:** `run_RecipeConfig`  |  **HTTP:** `PATCH /api/v1/run/recipes/{name}`

---

### `client.run` (11) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

#### `healthCheck` — Service health check

```typescript
client.run.healthCheck()
```

**Returns:** `run_HealthResponse`  |  **HTTP:** `GET /api/v1/run/health`

---

#### `preflightRun` — Preflight a run request

```typescript
client.run.preflightRun(data: run_Selector)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_Selector` | body | Yes |  |

**Returns:** `run_PreflightResponse`  |  **HTTP:** `POST /api/v1/run/preflight`

---

#### `resolve` — Resolve an application via JSON body

```typescript
client.run.resolve(data: run_Selector)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_Selector` | body | Yes |  |

**Returns:** `run_RunResponse`  |  **HTTP:** `POST /api/v1/run/resolve`

---

#### `resolveGet` — Resolve an application and return exact shell command

```typescript
client.run.resolveGet(app: string, os?: string, source?: array, kind?: string, arch?: string, tags?: array, profile?: string, channel?: string, version?: string, variant?: string, publisher?: string, repo?: string, release?: string, asset?: string, pick?: string, pick_index?: integer, candidate_id?: string, set_id?: string, terminal_id?: integer, display?: string, origin?: string, dry_run?: boolean, print_curl?: string, format?: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `app` | `string` | query | Yes | Primary name query |
| `os` | `string` | query | No | Target OS filter |
| `source` | `array` | query | No | Source kind filter (repeatable) |
| `kind` | `string` | query | No | App kind filter |
| `arch` | `string` | query | No | Target CPU architecture filter |
| `tags` | `array` | query | No | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | query | No | Named profile for default preferences |
| `channel` | `string` | query | No | Release channel hint |
| `version` | `string` | query | No | Exact version or provider-defined version constraint |
| `variant` | `string` | query | No | Provider-specific variant hint |
| `publisher` | `string` | query | No | Publisher hint for curated registries |
| `repo` | `string` | query | No | Repository hint such as owner/name |
| `release` | `string` | query | No | Release hint such as a tag name |
| `asset` | `string` | query | No | Desired asset name or pattern |
| `pick` | `string` | query | No | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `integer` | query | No | Candidate index (required when pick=index) |
| `candidate_id` | `string` | query | No | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | query | No | Bind pick to a specific candidate set |
| `terminal_id` | `integer` | query | No | Terminal session ID (default 1) |
| `display` | `string` | query | No | X11 DISPLAY number |
| `origin` | `string` | query | No | Origin identifier for observability propagation |
| `dry_run` | `boolean` | query | No | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `string` | query | No | Generate curl command (hoody-run) |
| `format` | `string` | query | No | Output format (json or html) |
| `limit` | `integer` | query | No | Max candidates (default 25) |

**Returns:** `run_RunResponse`  |  **HTTP:** `GET /api/v1/run/resolve`

---

#### `runBatch` — Execute a batch of search or run requests

```typescript
client.run.runBatch(data: run_BatchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_BatchRequest` | body | Yes |  |

**Returns:** `run_BatchResponse`  |  **HTTP:** `POST /api/v1/run/batch`

---

#### `runPathBased` — Path-based resolve (positional or key-value)

```typescript
client.run.runPathBased(rest: string, os?: string, source?: array, kind?: string, arch?: string, tags?: array, profile?: string, channel?: string, version?: string, variant?: string, publisher?: string, repo?: string, release?: string, asset?: string, pick?: string, pick_index?: integer, candidate_id?: string, set_id?: string, terminal_id?: integer, display?: string, origin?: string, dry_run?: boolean, print_curl?: string, format?: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `rest` | `string` | path | Yes | Path segments for positional or key-value app specification |
| `os` | `string` | query | No | Target OS filter when not supplied in the path |
| `source` | `array` | query | No | Source kind filter (repeatable) |
| `kind` | `string` | query | No | App kind filter when not supplied in the path |
| `arch` | `string` | query | No | Target CPU architecture filter |
| `tags` | `array` | query | No | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | query | No | Named profile for default preferences |
| `channel` | `string` | query | No | Release channel hint |
| `version` | `string` | query | No | Exact version or provider-defined version constraint |
| `variant` | `string` | query | No | Provider-specific variant hint |
| `publisher` | `string` | query | No | Publisher hint for curated registries |
| `repo` | `string` | query | No | Repository hint such as owner/name |
| `release` | `string` | query | No | Release hint such as a tag name |
| `asset` | `string` | query | No | Desired asset name or pattern |
| `pick` | `string` | query | No | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `integer` | query | No | Candidate index (required when pick=index) |
| `candidate_id` | `string` | query | No | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | query | No | Bind pick to a specific candidate set |
| `terminal_id` | `integer` | query | No | Terminal session ID when not supplied in the path |
| `display` | `string` | query | No | X11 DISPLAY number |
| `origin` | `string` | query | No | Origin identifier for observability propagation |
| `dry_run` | `boolean` | query | No | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `string` | query | No | Generate curl command (hoody-run) |
| `format` | `string` | query | No | Output format (json or html) |
| `limit` | `integer` | query | No | Max candidates (default 25) |

**Returns:** `run_RunResponse`  |  **HTTP:** `GET /api/v1/run/go/{rest}`

---

#### `runTerminalAnchored` — Terminal-anchored path-based resolve

```typescript
client.run.runTerminalAnchored(terminal_id: integer, rest: string, os?: string, source?: array, kind?: string, arch?: string, tags?: array, profile?: string, channel?: string, version?: string, variant?: string, publisher?: string, repo?: string, release?: string, asset?: string, pick?: string, pick_index?: integer, candidate_id?: string, set_id?: string, display?: string, origin?: string, dry_run?: boolean, print_curl?: string, format?: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `integer` | path | Yes | Terminal session ID (1-65535) |
| `rest` | `string` | path | Yes | Path segments for app specification |
| `os` | `string` | query | No | Target OS filter when not supplied in the path |
| `source` | `array` | query | No | Source kind filter (repeatable) |
| `kind` | `string` | query | No | App kind filter when not supplied in the path |
| `arch` | `string` | query | No | Target CPU architecture filter |
| `tags` | `array` | query | No | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | query | No | Named profile for default preferences |
| `channel` | `string` | query | No | Release channel hint |
| `version` | `string` | query | No | Exact version or provider-defined version constraint |
| `variant` | `string` | query | No | Provider-specific variant hint |
| `publisher` | `string` | query | No | Publisher hint for curated registries |
| `repo` | `string` | query | No | Repository hint such as owner/name |
| `release` | `string` | query | No | Release hint such as a tag name |
| `asset` | `string` | query | No | Desired asset name or pattern |
| `pick` | `string` | query | No | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `integer` | query | No | Candidate index (required when pick=index) |
| `candidate_id` | `string` | query | No | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | query | No | Bind pick to a specific candidate set |
| `display` | `string` | query | No | X11 DISPLAY number |
| `origin` | `string` | query | No | Origin identifier for observability propagation |
| `dry_run` | `boolean` | query | No | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `string` | query | No | Generate curl command (hoody-run) |
| `format` | `string` | query | No | Output format (json or html) |
| `limit` | `integer` | query | No | Max candidates (default 25) |

**Returns:** `run_RunResponse`  |  **HTTP:** `GET /api/v1/run/t/{terminal_id}/go/{rest}`

---

#### `searchCandidates` — Search for app candidates

```typescript
client.run.searchCandidates(app: string, os?: string, source?: array, kind?: string, arch?: string, tags?: array, profile?: string, channel?: string, version?: string, variant?: string, publisher?: string, repo?: string, release?: string, asset?: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `app` | `string` | query | Yes | Primary name query (aliases q, name) |
| `os` | `string` | query | No | Target OS filter |
| `source` | `array` | query | No | Source kind filter (repeatable) |
| `kind` | `string` | query | No | App kind filter (gui, cli, any) |
| `arch` | `string` | query | No | Target CPU architecture filter |
| `tags` | `array` | query | No | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | query | No | Named profile for default preferences |
| `channel` | `string` | query | No | Release channel hint (for example stable or beta) |
| `version` | `string` | query | No | Exact version or provider-defined version constraint |
| `variant` | `string` | query | No | Provider-specific variant hint (for example portable or headless) |
| `publisher` | `string` | query | No | Publisher hint for curated registries |
| `repo` | `string` | query | No | Repository hint such as owner/name |
| `release` | `string` | query | No | Release hint such as a tag name |
| `asset` | `string` | query | No | Desired asset name or pattern |
| `limit` | `integer` | query | No | Max candidates to return (default 25) |

**Returns:** `run_SearchResponse`  |  **HTTP:** `GET /api/v1/run/search`

---

#### `searchCandidatesPaged` — Search for app candidates with cursor pagination

```typescript
client.run.searchCandidatesPaged(data: run_PagedSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_PagedSearchRequest` | body | Yes |  |

**Returns:** `run_PagedSearchResponse`  |  **HTTP:** `POST /api/v1/run/search/paged`

---

#### `searchCandidatesPagedAll` — Search for app candidates with cursor pagination (collect all pages)

```typescript
client.run.searchCandidatesPagedAll(data: run_PagedSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_PagedSearchRequest` | body | Yes |  |

**Returns:** `run_PagedSearchResponse[]`  |  **HTTP:** `POST /api/v1/run/search/paged`

---

#### `searchCandidatesPagedIterator` — Search for app candidates with cursor pagination (async iterator)

```typescript
client.run.searchCandidatesPagedIterator(data: run_PagedSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_PagedSearchRequest` | body | Yes |  |

**Returns:** `AsyncIterableIterator<run_PagedSearchResponse>`  |  **HTTP:** `POST /api/v1/run/search/paged`

---

### `client.run.sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

#### `createSource` — Create a new package source

```typescript
client.run.sources.createSource(data: run_SourceConfig)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `run_SourceConfig` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/run/sources`

---

#### `deleteSource` — Delete a package source

```typescript
client.run.sources.deleteSource(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `void`  |  **HTTP:** `DELETE /api/v1/run/sources/{source_id}`

---

#### `getSourceDiagnostics` — Get runtime diagnostics for a source

```typescript
client.run.sources.getSourceDiagnostics(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `run_SourceDiagnostics`  |  **HTTP:** `GET /api/v1/run/sources/{source_id}/diagnostics`

---

#### `listSources` — List all package sources

```typescript
client.run.sources.listSources()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/run/sources`

---

#### `syncAllSources` — Sync all sources

```typescript
client.run.sources.syncAllSources()
```

**Returns:** `run_Job`  |  **HTTP:** `POST /api/v1/run/sources/sync`

---

#### `syncSource` — Sync a single source

```typescript
client.run.sources.syncSource(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `run_Job`  |  **HTTP:** `POST /api/v1/run/sources/{source_id}/sync`

---

#### `updateSource` — Update a package source

```typescript
client.run.sources.updateSource(source_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |
| `data` | `object` | body | Yes |  |

**Returns:** `run_SourceConfig`  |  **HTTP:** `PATCH /api/v1/run/sources/{source_id}`


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

