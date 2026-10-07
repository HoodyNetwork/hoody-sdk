> _**SDK skill · `run` namespace** · ~11,126 tokens · hoody-sdk v1.0.0-beta.16_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `resolveMany`; persist profiles/recipes.

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

1. `client.run.search({ selector: { app, os?, kind?, arch?, tags?, source? }, page_size?, cursor? })` (this is the paged route: `page_size`, default 25, max 100, sets the page; `selector.limit` is ignored here) → `{ set_id, total_count, items[], next_cursor? }`.
2. `client.run.resolve({ ...selector, set_id, pick:"index", pick_index:N })` → `shell_command`.

### 2. Preflight

1. `client.run.test(Selector)` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `client.run.resolve(Selector)` → resolved command + preview.

### 3. Cursor-paged search

`client.run.search` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.
`client.run.search` fetches one page. `client.run.searchAll` collects every page and `client.run.searchIterator` yields their items; both write `next_cursor` back into the body's `cursor` for you. A manual cursor loop also works.

### 4. Batch

`client.run.resolveMany({ items: [{ request_id, mode, selector }] })`. `mode:"run"` resolves each item to a command. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code, status }`), so one bad item does not fail the batch.

### 5. Recipes

`client.run.recipes.create` with `{ name, selector_template, allowed_overrides }`; invoke it with `client.run.recipes.resolve`, passing only the allow-listed fields under `overrides`. The generated SDK takes the recipe `name` as a positional argument plus a body (`recipes.resolve(name, { overrides })`), NOT a single options object.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body). SDK: `client.run.resolve` sends the POST form.
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`), nix lets packages it cannot classify through, trusted-list and manifest entries are filtered only when they declare the field, and the nix, pkgx, OCI and AppImage sources return nothing at all for a non-Linux `os` such as `windows`. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (the trusted list outranks system-path and the package sources), then score, then title and id, so the top hit is not always the highest score. Read the returned list and use the actual index or `candidate_id`.
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for about 30 s.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url? }`); a `resolved` response has none. The two preview URLs are predicted for the target `terminal_id` (from an operator URL template when one is set, else from the container's own kit host form), not from the candidate; either is absent only when neither is available, and neither proves anything is running.
- `resolveMany` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `recipes.resolve` / `recipes.search` reject a recognized selector field outside `allowed_overrides` with `400 OVERRIDE_NOT_ALLOWED` (`recipe override not allowed: <field>`); it is not silently dropped. An unknown key under `overrides` is ignored, so spell the selector field names exactly.
- **Outbound requests the kit makes itself (webhook delivery, remote manifest index fetches, source fetches) go only to public IPv4 addresses.** Private, loopback, link-local, CGNAT, reserved and multicast destinations and every IPv6 form are refused, and a name that resolves to ANY prohibited IPv4 address is refused whole; no setting admits one, so a remote index URL on `localhost` or a sibling container's private address cannot work. Webhooks are configured in the kit's config file only (`GET /api/v1/run/config` is read-only), so this matters mainly when diagnosing a source sync or a webhook someone set up. A refusal carries the marker `refusing to connect to` and is not retried; `the name <host> resolved to no address` carries no marker and is a transient failure. Proxy environment variables are ignored; webhook and remote-index fetches follow no redirects, and source fetches follow at most ten. Helper binaries a provider shells out to (`nix search`) are outside this guarantee.
- `selected.run_plan` carries `command`/`env`/`cwd` and is always present. `selected.execution_plan` (`argv`/`env`/`cwd`) is optional: trusted-list, manifest and AppImage candidates omit it. Read it as optional and use `shell_command` for the command to run.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix, where it wins over any other `terminal_id`). Both are public HTTP routes, but neither has an SDK method: programmatic callers use the resolve endpoint from the first bullet. 

## Common errors

Every error body is `{ "error": "<text>", "code": "<code>", "status": <HTTP status> }`. Match on the symbolic `code` and the HTTP `status`; a batch error item carries the same payload under `error`.

- `400 INVALID_PICK` (`pick_index required`, `pick_index out of range: <N>`, `candidate_id required`, `candidate_id not found`) or `400 NO_CANDIDATES` (`no candidates`): the pick does not match the candidate set.
- `400 INVALID_SELECTOR: invalid <field>: <value>`: a query-string selector value is not accepted, for example an unknown `source`.
- `400 INVALID_BODY` with a deserialization message: a JSON body carries a value that is not in the field's enum (for example `"kind":"create"`), misses a required field or has a wrongly typed one.
- `409 SET_EXPIRED`: an index pick (`pick_index`) names a `set_id` that is unknown or older than 300 s and is not the freshly resolved set; search again and pick against the new `set_id`. An id pick (`candidate_id`) does not get this error: it falls back to the fresh set, since `candidate_id` is content-addressed.
- `403 POLICY_DENIED: …`: the effective policy does not permit the selected candidate.
- `409 CURSOR_SET_EXPIRED` (`cursor set expired`): `search/paged` only; start again without a cursor.
- A single source such as `nix` or `pkgx` that fails or is missing does not fail the request: the search continues with the other sources and can return an empty list (a pick against it then gives `400 NO_CANDIDATES`). An error the source reports is recorded in its diagnostics (`GET /api/v1/run/sources/{source_id}/diagnostics`), but some sources, `pkgx` among them, turn a missing tool or a failed query into an empty successful result, so the diagnostics can show no error at all. `502 SOURCE_RESOLUTION_FAILED` is reserved for a resolution that fails as a whole.
- `404 JOB_NOT_FOUND` (`job not found`): the job id is unknown or its TTL ran out (see example 7).

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected.

**Step 1 — search.** Returns a `set_id` (a later `pick:"index"` sent with it selects from this exact candidate list; `set_id` expires after ~300s) and the candidates (`candidates[]` over HTTP, `items[]` from the SDK and CLI search, which is the cursor-paged one), ordered by source priority, then score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```typescript
const r = await client.run.search({ selector: { app: 'firefox', kind: 'any' }, page_size: 5 });
const setId = (r.data as any).set_id;
const top = (r.data as any).items[0];
console.log(top.candidate_id, top.kind, top.score);
```

**Step 2 — resolve to a command.** To take the top candidate of the list you just saw, send its `set_id` with `pick:"index"` and `pick_index:0`. (`pick:"first"` also works, but it ignores `set_id` and picks from a freshly resolved list, which can differ from the one you displayed.)

```typescript
const run = await client.run.resolve({
  app: 'firefox', kind: 'any', set_id: setId, pick: 'index', pick_index: 0,
});
console.log((run.data as any).shell_command);
```

### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list, manifest and AppImage candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` come from an operator URL template when one is set, else from the container's own kit host form, and are absent only when neither is available; they are built for the target terminal, not from the candidate. Resolve itself never launches anything.

```typescript
const r = await client.run.resolve({
  app: 'echo', kind: 'cli', pick: 'first',
});
console.log('argv:', (r.data as any).selected.execution_plan?.argv); // absent for some sources
console.log('command:', (r.data as any).shell_command);
console.log('preview:', (r.data as any).handoff?.preview_terminal_url); // absent only when neither an operator URL template nor the container's kit routing is available
```

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` matches several candidates and you want one other than the first (say the `pkgx` one). Positions depend on source priority and on which sources are available, so list the candidates, find the index of the one you want, and bind the pick to the `set_id` so the list cannot shift under you. The examples below use index 2; use the index you actually found.

**Step 1 — list candidates with `set_id`.**

```typescript
const list = await client.run.search({ selector: { app: 'git', kind: 'cli' }, page_size: 5 });
(list.data as any).items.forEach((c: any, i: number) =>
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

**Pick by id alternative** — use `pick: 'id'` + `candidate_id`, copying the exact `candidate_id` from the step 1 response. It is a content hash, so never build one from the provider or the executable path.

```typescript
const wanted = (list.data as any).items[2]; // the candidate you chose in step 1
await client.run.resolve({
  app: 'git', kind: 'cli', set_id: setId, pick: 'id',
  candidate_id: wanted.candidate_id,
});
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```typescript
const r = await client.run.search({
  selector: { app: 'jq', os: 'linux', arch: 'amd64', kind: 'cli', source: ['system'] },
  page_size: 5,
});
const providers = new Set((r.data as any).items.map((c: any) => c.provider));
// providers = Set { 'system' }
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both, trusted-list and manifest entries are filtered on the fields they declare, and nix, pkgx, OCI and AppImage return no candidates at all for a Windows `os`, even though their candidates carry no kind classification.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```typescript
const pf = await client.run.test({
  app: 'xeyes', kind: 'gui', pick: 'first',
});
if ((pf.data as any).missing_requirements?.length) {
  console.error('Missing:', (pf.data as any).missing_requirements);
}
```

### 6. Pagination — walk a long candidate list with `search`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```typescript
const page1 = await client.run.search({
  selector: { app: 'git', kind: 'cli' }, page_size: 3,
});
console.log((page1.data as any).total_count, (page1.data as any).items.length);
const cursor = (page1.data as any).next_cursor;
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.
`client.run.searchAll(...)` does this for you and returns every item, and `client.run.searchIterator(...)` yields them page by page. The manual loop below is the equivalent by hand.

```typescript
// Manual drain (client.run.searchAll does the same):
let cursor2 = (page1.data as any).next_cursor;
const all = [...((page1.data as any).items as any[])];
while (cursor2) {
  const p = await client.run.search({
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
const sub = await client.run.jobs.createSearch({ app: 'firefox', kind: 'any' });
const jid = (sub.data as any).job_id;
```

**Step 2 — wait for the result.** Status transitions `queued → running → done`, or ends in `error`, or in `cancelled` after a cancel request; all three are final, so stop polling on any of them. The job's TTL restarts only when its state changes, not when it is read, so polling does not keep a finished job alive; a caller that comes back too late gets `404 JOB_NOT_FOUND`. Long-poll with `wait=done` and `timeout_ms` (max 120000) so the call returns as soon as the job finishes, and read the result from that response.

```typescript
// Keep timeout_ms below the SDK's default 30 s request timeout.
let job: any;
do {
  job = (await client.run.jobs.get(jid, { wait: 'done', timeout_ms: 25000 })).data;
} while (!['done', 'error', 'cancelled'].includes(job.status));
console.log(job.status, job.result);
```

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`resolveMany` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (with `selected` + `shell_command`) or `result: 'error'` (with `error: { error, code, status }` for that item only; the rest of the batch still runs).

```typescript
const batch = await client.run.resolveMany({
  items: [
    { request_id: 'a', mode: 'run', selector: { app: 'ls', kind: 'cli', pick: 'first' } },
    { request_id: 'b', mode: 'run', selector: { app: 'echo', kind: 'cli', pick: 'first' } },
    { request_id: 'c', mode: 'search', selector: { app: 'git', kind: 'cli', limit: 3 } },
  ],
});
for (const it of (batch.data as any).items) {
  if (it.result === 'run')    console.log(it.request_id, it.run.shell_command);
  if (it.result === 'search') console.log(it.request_id, it.search.candidates.length, 'candidates');
  if (it.result === 'error')  console.error(it.request_id, it.error.code, it.error.error);
}
```

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; a recognized selector field under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `recipes.resolve` — update the recipe to widen the allow-list. An unknown key is ignored, not rejected.

```typescript
await client.run.recipes.create({
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
const list = await client.run.recipes.list();
const one  = await client.run.recipes.get('team-js-runtime');
await client.run.recipes.update('team-js-runtime', {
  description: 'Updated: now also resolves bun/deno via override',
});
// After example 10 (it uses this recipe): await client.run.recipes.delete('team-js-runtime');
```

### 10. Invoke a recipe with overrides — `recipes.resolve(name, { overrides })`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```typescript
const r = await client.run.recipes.resolve('team-js-runtime', {
  overrides: { app: 'bun' },
});
console.log((r.data as any).shell_command, (r.data as any).selected.provider);
```

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `recipes.search`:

```typescript
const s = await client.run.recipes.search('team-js-runtime', {
  overrides: { app: 'node' },
});
console.log((s.data as any).candidates.length, 'candidates across',
  new Set((s.data as any).candidates.map((c: any) => c.provider)));
```

⚠ A recognized selector field outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a selector field at all is ignored, so spell field names exactly. Use `recipes.update` to widen the allow-list.

## Reference

**Accessor:** `client.run`  |  **Import:** `import * as run from 'hoody-sdk/run'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.run.config` (1) — APIs for retrieving consolidated runtime configuration state including active profile selection

#### `get` — Get full runtime configuration

```typescript
client.run.config.get()
```

**Returns:** `Promise<RunConfigGetResponse>`  |  **HTTP:** `GET /api/v1/run/config`
**CLI:** `hoody run config get`

---

### `client.run.jobs` (4) — APIs for tracking async job status with optional long-polling support for sync and background operations

#### `cancel` — Cancel a search job

```typescript
client.run.jobs.cancel(job_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | Job identifier (UUID) |

**Returns:** `Promise<RunJobsCancelResponse>`  |  **HTTP:** `POST /api/v1/run/jobs/{job_id}/cancel`
**CLI:** `hoody run jobs cancel`

---

#### `createSearch` — Start an async search job

```typescript
client.run.jobs.createSearch(data: RunJobsCreateSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunJobsCreateSearchRequest` | body | Yes | Shape: `run_Selector` under Body schemas. |

**Returns:** `Promise<RunJobsCreateSearchResponse>`  |  **HTTP:** `POST /api/v1/run/search/jobs`
**CLI:** `hoody run jobs search create`

---

#### `get` — Get job status

```typescript
client.run.jobs.get(job_id: string, options?: { wait?: string; timeout_ms?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | Job identifier (UUID) |
| `wait` | `string` | query | No | Set to 'done' to long-poll until the job completes, fails or is cancelled |
| `timeout_ms` | `number` | query | No | Long-poll timeout in milliseconds (default 0, max 120000) |

**Returns:** `Promise<RunJobsGetResponse>`  |  **HTTP:** `GET /api/v1/run/jobs/{job_id}`
**CLI:** `hoody run jobs get`

---

#### `list` — List background jobs

```typescript
client.run.jobs.list(options?: { kind?: "search-resolve" | "source-sync"; status?: "queued" | "running" | "done" | "error" | "cancelled" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `kind` | `"search-resolve" \| "source-sync"` | query | No | Only jobs of this kind |
| `status` | `"queued" \| "running" \| "done" \| "error" \| "cancelled"` | query | No | Only jobs in this status |

**Returns:** `Promise<RunJobsListResponse>`  |  **HTTP:** `GET /api/v1/run/jobs`
**CLI:** `hoody run jobs list`

---

### `client.run.profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

#### `create` — Create a new profile

```typescript
client.run.profiles.create(data: RunProfilesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunProfilesCreateRequest` | body | Yes | Shape: `run_ProfileConfig` under Body schemas. |

**Returns:** `Promise<RunProfilesCreateResponse>`  |  **HTTP:** `POST /api/v1/run/profiles`
**CLI:** `hoody run profiles create`

---

#### `delete` — Delete a profile

```typescript
client.run.profiles.delete(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/profiles/{profile}`
**CLI:** `hoody run profiles delete`

---

#### `list` — List all profiles

```typescript
client.run.profiles.list()
```

**Returns:** `Promise<RunProfilesListResponse>`  |  **HTTP:** `GET /api/v1/run/profiles`
**CLI:** `hoody run profiles list`

---

#### `update` — Update a profile

```typescript
client.run.profiles.update(profile: string, data: RunProfilesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |
| `data` | `RunProfilesUpdateRequest` | body | Yes | Shape: `run_ProfileUpdate` under Body schemas. |

**Returns:** `Promise<RunProfilesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/run/profiles/{profile}`
**CLI:** `hoody run profiles update`

---

#### `use` — Select the active profile

```typescript
client.run.profiles.use(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name to select |

**Returns:** `Promise<RunProfilesUseResponse>`  |  **HTTP:** `POST /api/v1/run/profiles/{profile}/select`
**CLI:** `hoody run profiles use`

---

### `client.run.recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

#### `create` — Create a saved recipe

```typescript
client.run.recipes.create(data: RunRecipesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunRecipesCreateRequest` | body | Yes | Shape: `run_RecipeConfig` under Body schemas. |

**Returns:** `Promise<RunRecipesCreateResponse>`  |  **HTTP:** `POST /api/v1/run/recipes`
**CLI:** `hoody run recipes create`

---

#### `delete` — Delete a saved recipe

```typescript
client.run.recipes.delete(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes delete`

---

#### `get` — Get a saved recipe

```typescript
client.run.recipes.get(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |

**Returns:** `Promise<RunRecipesGetResponse>`  |  **HTTP:** `GET /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes get`

---

#### `list` — List saved launch recipes

```typescript
client.run.recipes.list()
```

**Returns:** `Promise<RunRecipesListResponse>`  |  **HTTP:** `GET /api/v1/run/recipes`
**CLI:** `hoody run recipes list`

---

#### `resolve` — Run using a saved recipe

```typescript
client.run.recipes.resolve(name: string, data: RunRecipesResolveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `RunRecipesResolveRequest` | body | Yes | Shape: `run_RecipeExecutionRequest` under Body schemas. |

**Returns:** `Promise<RunRecipesResolveResponse>`  |  **HTTP:** `POST /api/v1/run/recipes/{name}/run`
**CLI:** `hoody run recipes resolve`

---

#### `search` — Search using a saved recipe

```typescript
client.run.recipes.search(name: string, data: RunRecipesSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `RunRecipesSearchRequest` | body | Yes | Shape: `run_RecipeExecutionRequest` under Body schemas. |

**Returns:** `Promise<RunRecipesSearchResponse>`  |  **HTTP:** `POST /api/v1/run/recipes/{name}/search`
**CLI:** `hoody run recipes search`

---

#### `update` — Update a saved recipe

```typescript
client.run.recipes.update(name: string, data: RunRecipesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |
| `data` | `RunRecipesUpdateRequest` | body | Yes | Shape: `run_RecipeUpdate` under Body schemas. |

**Returns:** `Promise<RunRecipesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes update`

---

### `client.run` (6) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

#### `resolve` — Resolve an application via JSON body

```typescript
client.run.resolve(data: RunResolveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunResolveRequest` | body | Yes | Shape: `run_Selector` under Body schemas. |

**Returns:** `Promise<RunResolveResponse>`  |  **HTTP:** `POST /api/v1/run/resolve`
**CLI:** `hoody run resolve`

---

#### `resolveMany` — Execute a batch of search or run requests

```typescript
client.run.resolveMany(data: RunResolveManyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunResolveManyRequest` | body | Yes | Shape: `run_BatchRequest` under Body schemas. |

**Returns:** `Promise<RunResolveManyResponse>`  |  **HTTP:** `POST /api/v1/run/batch`

---

#### `search` — Search for app candidates with cursor pagination

```typescript
client.run.search(data: RunSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSearchRequest` | body | Yes | Shape: `run_PagedSearchRequest` under Body schemas. |

**Returns:** `Promise<RunSearchResponse>`  |  **HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search`

---

#### `searchAll` — Search for app candidates with cursor pagination (collect all pages)

```typescript
client.run.searchAll(data: RunSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSearchRequest` | body | Yes | Shape: `run_PagedSearchRequest` under Body schemas. |

**Returns:** `Promise<(NonNullable<RunSearchResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`search()` fetches one page). Each item is `run_Candidate`. `searchIterator()` streams the same items instead of collecting them.  |  **HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search`

---

#### `searchIterator` — Search for app candidates with cursor pagination (async iterator)

```typescript
client.run.searchIterator(data: RunSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSearchRequest` | body | Yes | Shape: `run_PagedSearchRequest` under Body schemas. |

**Returns:** `AsyncGenerator<(NonNullable<RunSearchResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`search()` fetches one page). Each item is `run_Candidate`.  |  **HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search`

---

#### `test` — Preflight a run request

```typescript
client.run.test(data: RunTestRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunTestRequest` | body | Yes | Shape: `run_Selector` under Body schemas. |

**Returns:** `Promise<RunTestResponse>`  |  **HTTP:** `POST /api/v1/run/preflight`
**CLI:** `hoody run test`

---

### `client.run.sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

#### `create` — Create a new package source

```typescript
client.run.sources.create(data: RunSourcesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSourcesCreateRequest` | body | Yes | Shape: `run_SourceConfig` under Body schemas. |

**Returns:** `Promise<RunSourcesCreateResponse>`  |  **HTTP:** `POST /api/v1/run/sources`
**CLI:** `hoody run sources create`

---

#### `delete` — Delete a package source

```typescript
client.run.sources.delete(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/sources/{source_id}`
**CLI:** `hoody run sources delete`

---

#### `getDiagnostics` — Get runtime diagnostics for a source

```typescript
client.run.sources.getDiagnostics(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `Promise<RunSourcesGetDiagnosticsResponse>`  |  **HTTP:** `GET /api/v1/run/sources/{source_id}/diagnostics`
**CLI:** `hoody run sources diagnostics get`

---

#### `list` — List all package sources

```typescript
client.run.sources.list()
```

**Returns:** `Promise<RunSourcesListResponse>`  |  **HTTP:** `GET /api/v1/run/sources`
**CLI:** `hoody run sources list`

---

#### `sync` — Sync a single source

```typescript
client.run.sources.sync(source_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

**Returns:** `Promise<RunSourcesSyncResponse>`  |  **HTTP:** `POST /api/v1/run/sources/{source_id}/sync`
**CLI:** `hoody run sources sync`

---

#### `syncAll` — Sync all sources

```typescript
client.run.sources.syncAll()
```

**Returns:** `Promise<RunSourcesSyncAllResponse>`  |  **HTTP:** `POST /api/v1/run/sources/sync`
**CLI:** `hoody run sources sync`

---

#### `update` — Update a package source

```typescript
client.run.sources.update(source_id: string, data: RunSourcesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |
| `data` | `RunSourcesUpdateRequest` | body | Yes | Shape: `run_SourceUpdate` under Body schemas. |

**Returns:** `Promise<RunSourcesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/run/sources/{source_id}`
**CLI:** `hoody run sources update`


### Body schemas

- `run_PagedSearchRequest` — `{ selector*: run_Selector, cursor: string, page_size: int }`
- `run_Selector` — `{ app*: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
  - `pick_index` — Candidate index (required when pick=index)
  - `candidate_id` — Specific candidate ID (required when pick=id)
- `run_BatchRequest` — `{ items: run_BatchItemRequest[] }`
- `run_SourceConfig` — `{ source_id*: string, enabled*: bool, priority*: int, provider*: run_SourceKind, source_type*: run_SourceType, pin: run_SourcePin, config: object }`
- `run_SourceUpdate` — `{ enabled: bool, priority: int, pin: run_SourcePin|null, config: object }`
  - Partial source update. Only the fields present in the body are applied; everything else keeps its stored value. The merged source is re-validated before it is committed, so a patch that would downgrade a signed remote index is refused.
- `run_ProfileConfig` — `{ name*: string, description: string, defaults: run_ProfileDefaults, sources_mode: run_ProfileSourceMode, sources: run_ProfileSourceOverride[], policy: run_PolicyConfig }`
- `run_ProfileUpdate` — `{ description: string|null, defaults: run_ProfileDefaultsUpdate, sources_mode: "inherit" | "allowlist" | null, sources: run_ProfileSourceOverride[]|null, policy: run_PolicyConfigUpdate }`
  - … The merged profile is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The profile's name is taken from the path and cannot be changed here.
- `run_RecipeConfig` — `{ name*: string, description: string, selector_template: run_SelectorTemplate, allowed_overrides: string[] }`
- `run_RecipeUpdate` — `{ description: string|null, selector_template: run_SelectorTemplateUpdate, allowed_overrides: string[]|null }`
  - … The merged recipe is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The recipe's name is taken from the path and cannot be changed here.
- `run_RecipeExecutionRequest` — `{ overrides: run_SelectorTemplate }`
- `run_Os` — `"linux" | "windows" | "any"`
- `run_AppKind` — `"gui" | "cli" | "any"`
- `run_SourceKind` — `"nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "any"`
- `run_Arch` — `"amd64" | "arm64" | "any"`
- `run_PickMode` — `"ask" | "first" | "index" | "id"`
  - Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
- `run_OutputFormat` — `"json" | "html"`
- `run_PrintCurlMode` — `"hoody-run"`
- `run_BatchItemRequest` — `{ request_id*: string, mode*: run_BatchMode, selector*: run_Selector }`
- `run_SourceType` — `"nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "manifest-registry" | "manifest-remote-index" | "system-path" | "trusted-list-file"`
- `run_SourcePin` — `{ url*: string, sha256: string, author_pubkey_ed25519: string, sig_ed25519: string }`
- `run_ProfileDefaults` — `{ os: run_Os, kind: run_AppKind, source: run_SourceKind[], pick: run_PickMode, terminal_id: int, display: string, limit: int }`
- `run_ProfileSourceMode` — `"inherit" | "allowlist"`
- `run_ProfileSourceOverride` — `{ source_id*: string, enabled: bool, priority: int }`
- `run_PolicyConfig` — `{ require_verified: bool, require_integrity: bool, deny_providers: run_SourceKind[], deny_source_ids: string[] }`
- `run_ProfileDefaultsUpdate` — `{ os: "linux" | "windows" | "any" | null, kind: "gui" | "cli" | "any" | null, source: run_SourceKind[]|null, pick: "ask" | "first" | "index" | "id" | null, terminal_id: int|null, display: string|null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
- `run_PolicyConfigUpdate` — `{ require_verified: bool|null, require_integrity: bool|null, deny_providers: run_SourceKind[]|null, deny_source_ids: string[]|null }|null`
- `run_SelectorTemplate` — `{ app: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
- `run_SelectorTemplateUpdate` — `{ app: string|null, os: "linux" | "windows" | "any" | null, kind: "gui" | "cli" | "any" | null, source: run_SourceKind[]|null, arch: "amd64" | "arm64" | "any" | null, tags: string[]|null, profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: "ask" | "first" | "index" | "id" | null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: "json" | "html" | null, dry_run: bool|null, print_curl: "hoody-run" | null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
- `run_BatchMode` — `"search" | "run"`

