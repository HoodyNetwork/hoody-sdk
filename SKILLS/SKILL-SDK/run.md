> _**SDK skill · `run` namespace** · ~13,250 tokens · hoody-sdk v1.0.1_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (the built-in starter catalogue, trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests, npm, PyPI). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `run.resolveMany`; persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `client.run.search({ selector: { app, os?, kind?, arch?, tags?, source? }, page_size?, cursor? })` (this is the paged route: `page_size`, default 25, max 100, sets the page; `selector.limit` is ignored here) → `{ set_id, total_count, items[], next_cursor? }`.
2. `client.run.resolve({ ...selector, set_id, pick:"id", candidate_id })` → `shell_command`. Copy `candidate_id` from the chosen item: `pick_index` indexes the whole cached set, not the current page, so a position from a later page can select a different candidate or fail; if the policy changed since the search, later pages may also skip candidates that are now denied.

### 2. Preflight

1. `client.run.test({ app, pick: "first" })` → `recommended_mode`, `missing_requirements`, `effective_policy` (under `.data`).
2. `client.run.resolve({ app, pick: "first" })` → `shell_command` and `handoff` (the preview).

Without a `pick` (and no profile default), or with `pick: "ask"`, preflight answers `search-only` with no command, and resolve returns the candidate set with nothing selected.

### 3. Cursor-paged search

`client.run.search` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.
`client.run.search` fetches one page. `client.run.searchAll` collects every page and `client.run.searchIterator` yields their items; both write `next_cursor` back into the body's `cursor` for you. A manual cursor loop also works.

### 4. Batch

`client.run.resolveMany({ items: [{ request_id, mode, selector }] })`. `mode:"run"` resolves each item like `resolve`: a successful `first`, `index` or `id` pick returns a selected candidate and its command; if the effective pick is absent or `ask` (an omitted pick can inherit a profile default), the item returns the candidate set with `status: "resolved"`. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code, status }`), so one bad item does not fail the batch.

### 5. Recipes

`client.run.recipes.create` with `{ name, selector_template, allowed_overrides }`; invoke it with `client.run.recipes.resolve`, passing only the allow-listed fields under `overrides`. The generated SDK takes the recipe `name` as a positional argument plus a body (`recipes.resolve(name, { overrides })`), NOT a single options object.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body). SDK: `client.run.resolve` sends the POST form.
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`); nix ignores `kind` (every nix candidate reports `kind: any`); npm and PyPI ignore `kind` and report every candidate as `kind: cli`, so a `kind: gui` search can still return them; the starter catalogue filters by exact kind for `gui` and `cli`, while `any` allows all kinds; trusted-list and manifest entries are filtered only when they declare the field; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates for an `os` other than `linux` or `any`, such as `windows`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (under the default priorities the built-in starter catalogue, 1100, ranks above the trusted list, 1000, which ranks above system-path, 200, and the package sources), then score, then the source and that source's own order, then `candidate_id`, so the top hit is not always the highest score. Read the returned list and pick by `candidate_id`, or by its index in the full cached set (not its position on a page).
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for 30 seconds by default; the kit configuration can change that duration.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url?, suggested: { band: [8001, 9999], opens_in } }`, where `suggested` is where a client that opens the app itself should put it: a starter entry's own surface, a terminal for an OCI image, a window for a `gui` candidate, else a terminal); a `resolved` response has none. The two preview URLs are predicted for the target, not from the candidate: an operator URL template takes `terminal_id`; without one, `preview_terminal_url` is the computer's own kit host for `terminal_id` and `preview_display_url` the one for `display` (default `terminal_id`). Either is absent when it cannot be built (no template or routing, or a `display` that is not a display number), and neither proves anything is running.
- `run.resolveMany` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `recipes.resolve` / `recipes.search` reject a recipe template field set (non-null) under `overrides` outside `allowed_overrides` with `400 OVERRIDE_NOT_ALLOWED` (`recipe override not allowed: <field>`); it is not silently dropped. Keys that are not recipe template fields are ignored, including `enrich`, `args`, `pass_env`, `launch_tag` and `launch_env`: a recipe cannot set them. Spell field names exactly.
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

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected.

**Step 1 — search.** Returns a `set_id` (a later `pick:"index"` sent with it selects from this exact candidate list; `set_id` expires after ~300s) and the candidates (`candidates[]` over HTTP, `items[]` from the SDK and CLI search, which is the cursor-paged one), ordered by source priority, then score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```typescript
const r = await client.run.search({ selector: { app: 'firefox', kind: 'any' }, page_size: 5 });
const setId = r.data.set_id;
const top = r.data.items[0];
if (!top) throw new Error('No candidates found for firefox');
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

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list and manifest candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` are built for the target, not from the candidate (from an operator URL template when one is set, else from the computer's own kit host for `display` and `terminal_id`), and either is absent when it cannot be built. Resolve itself never launches anything.

```typescript
const r = await client.run.resolve({
  app: 'echo', kind: 'cli', pick: 'first',
});
console.log('argv:', (r.data as any).selected.execution_plan?.argv); // absent for some sources
console.log('command:', (r.data as any).shell_command);
console.log('preview:', (r.data as any).handoff?.preview_terminal_url); // absent only when neither an operator URL template nor the computer's kit routing is available
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
if (!wanted) throw new Error('The chosen candidate is absent; search again');
await client.run.resolve({
  app: 'git', kind: 'cli', set_id: setId, pick: 'id',
  candidate_id: wanted.candidate_id,
});
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** restrict a search to one source (here the system PATH) so the nix/pkgx/appimage tails are skipped. Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```typescript
const r = await client.run.search({
  selector: { app: 'jq', os: 'linux', arch: 'amd64', kind: 'cli', source: ['system'] },
  page_size: 5,
});
const providers = new Set((r.data as any).items.map((c: any) => c.provider));
// providers = Set { 'system' }
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both; nix ignores `kind`; npm and PyPI ignore `kind` and report every candidate as `kind: cli`; the starter catalogue keeps only the requested `gui` or `cli` kind; trusted-list and manifest entries are filtered on the fields they declare; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates at all for a Windows `os`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results.

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

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` and its cached candidates. Each page re-applies the current effective policy to that cached set, so a page can hold fewer items than `page_size` and `total_count` can change between pages. The cursor's position does not shift: it is a position in the unfiltered cached set. A cursor sent with a different selector is refused with `400 INVALID_CURSOR`.

**Step 1 — first page.**

```typescript
const page1 = await client.run.search({
  selector: { app: 'git', kind: 'cli' }, page_size: 3,
});
console.log((page1.data as any).total_count, (page1.data as any).items.length);
const cursor = (page1.data as any).next_cursor;
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.
`client.run.searchAll(...)` does this for you and returns every item, and `client.run.searchIterator(...)` fetches the pages as you go and yields the items one at a time. The manual loop below is the equivalent by hand.

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

Warning: `409 CURSOR_SET_EXPIRED` means the snapshot behind the cursor is gone (it lives about 300s from the last search that stored it, and the kit keeps at most 16 per `set_id`). Search again without a cursor and page from that answer; its `set_id` is the same when the candidates are unchanged.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

Warning: `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form is refused with `400 INVALID_BODY` (missing field `app`).

**Step 1 — submit.**

```typescript
const sub = await client.run.jobs.startSearch({ app: 'firefox', kind: 'any' });
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

`run.resolveMany` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (a resolve response, including `selected` and `shell_command` when a candidate is successfully picked) or `result: 'error'` (with `error: { error, code, status }` for that item only; the rest of the batch still runs).

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

**Step 1 — create.** `allowed_overrides` is a whitelist; a recipe template field set under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `recipes.resolve` — update the recipe to widen the allow-list. A key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, not rejected.

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

Warning: A recipe template field set under `overrides` outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, so spell field names exactly. Use `recipes.update` to widen the allow-list.

## Reference

**Accessor:** `client.run`  |  **Import:** `import * as run from 'hoody-sdk/run'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.run.catalog.list()` returns `Promise<RunCatalogListResponse>`. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

**Services** (the ones the notes and examples above call most come first):

- `client.run`: resolve, resolveMany, search, searchAll, searchIterator, test, open, getStatus, wait, findOpen, canOpen, close
- `client.run.recipes`: create, delete, get, list, resolve, search, update
- `client.run.jobs`: cancel, get, list, startSearch
- `client.run.catalog`: list
- `client.run.kit`: getCapabilities, getConfig
- `client.run.profiles`: create, delete, list, update, use
- `client.run.sources`: create, delete, getDiagnostics, list, sync, syncAll, update

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

### `client.run` (6) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

#### `resolve` — Resolve an application via JSON body

```typescript
client.run.resolve(data: RunResolveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunResolveRequest` | body | Yes | Shape: `Selector` under Body schemas. |

**HTTP:** `POST /api/v1/run/resolve`
**CLI:** `hoody run resolve --app <app>`

---

#### `resolveMany` — Execute a batch of search or run requests

```typescript
client.run.resolveMany(data: RunResolveManyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunResolveManyRequest` | body | Yes | Shape: `BatchRequest` under Body schemas. |

**HTTP:** `POST /api/v1/run/batch`

---

#### `search` — Search for app candidates with cursor pagination

```typescript
client.run.search(data: RunSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSearchRequest` | body | Yes | Shape: `PagedSearchRequest` under Body schemas. |

**HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search --app <app>`

---

#### `searchAll` — Search for app candidates with cursor pagination (collect all pages)

```typescript
client.run.searchAll(/* the arguments of search */)
```

**Returns:** `Promise<Item<RunSearchResponse>[]>` — every item of `data.items`, pages collected from the cursor you pass, or from where `search()` starts without one (`search()` fetches one page). Each item is `Candidate`. `searchIterator()` streams the same items instead of collecting them.  |  **HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search --app <app>`

---

#### `searchIterator` — Search for app candidates with cursor pagination (async iterator)

```typescript
client.run.searchIterator(/* the arguments of search */)
```

**Returns:** `AsyncGenerator<Item<RunSearchResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the cursor you pass, or from where `search()` starts without one (`search()` fetches one page). Each item is `Candidate`.  |  **HTTP:** `POST /api/v1/run/search/paged`
**CLI:** `hoody run search --app <app>`

---

#### `test` — Preflight a run request

```typescript
client.run.test(data: RunTestRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunTestRequest` | body | Yes | Shape: `Selector` under Body schemas. |

**HTTP:** `POST /api/v1/run/preflight`
**CLI:** `hoody run test --app <app>`

---

#### `open` — Open an app in this computer: resolve it, create a fresh terminal (and screen) for it, and start it there as a tracked workload.

```typescript
client.run.open(request: RunOpenRequest, options?: RunOpenOptions)
```

**Returns:** `Promise<RunOpenResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `getStatus` — Where an opened app is: `started`, `running`, `ready`, `exited`, `not_started` or `unknown`.

```typescript
client.run.getStatus(handle: RunOpenHandle | string, options?: RunOpenGetStatusOptions)
```

**Returns:** `Promise<RunOpenResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `wait` — Read getStatus() until the state settles (`ready`, `exited`, `not_started`, `stopped`, `unknown`, or `running` for an app without a window or port to wait for): every second for 10 s, then every 3 s, up to `timeoutMs`; the pause before a read is not cut short at the deadline, so it can return up to one poll (3 s) plus one read after `timeoutMs`.

```typescript
client.run.wait(handle: RunOpenHandle | string, options?: RunOpenWaitOptions)
```

**Returns:** `Promise<RunOpenWaitResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `findOpen` — The app opened in terminal N, when exactly one live one runs there: its `handle`.

```typescript
client.run.findOpen(terminal: number, options?: RunOpenFindOptions)
```

**Returns:** `Promise<RunOpenFindResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `canOpen` — Whether this computer's kits can open apps: `ok: true`, else `needs_update` (a kit is too old), `access_refused` or `unreachable`.

```typescript
client.run.canOpen()
```

**Returns:** `Promise<RunOpenCanOpenResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `close` — Stop an opened app (INT, then TERM, then KILL) and close its terminal.

```typescript
client.run.close(target: RunOpenHandle | string | number, options?: RunOpenCloseOptions)
```

**Returns:** `Promise<RunOpenResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.run.recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

**Shared parameters of `client.run.recipes`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Recipe name |

#### `create` — Create a saved recipe

```typescript
client.run.recipes.create(data: RunRecipesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunRecipesCreateRequest` | body | Yes | Shape: `RecipeConfig` under Body schemas. |

**HTTP:** `POST /api/v1/run/recipes`
**CLI:** `hoody run recipes create --name <name>`

---

#### `delete` — Delete a saved recipe

```typescript
client.run.recipes.delete(name: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes delete <name>`

---

#### `get` — Get a saved recipe

```typescript
client.run.recipes.get(name: string)
```

**HTTP:** `GET /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes get <name>`

---

#### `list` — List saved launch recipes

```typescript
client.run.recipes.list()
```

**HTTP:** `GET /api/v1/run/recipes`
**CLI:** `hoody run recipes list`

---

#### `resolve` — Run using a saved recipe

```typescript
client.run.recipes.resolve(name: string, data: RunRecipesResolveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunRecipesResolveRequest` | body | Yes | Shape: `RecipeExecutionRequest` under Body schemas. |

**HTTP:** `POST /api/v1/run/recipes/{name}/run`
**CLI:** `hoody run recipes resolve <name>`

---

#### `search` — Search using a saved recipe

```typescript
client.run.recipes.search(name: string, data: RunRecipesSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunRecipesSearchRequest` | body | Yes | Shape: `RecipeExecutionRequest` under Body schemas. |

**HTTP:** `POST /api/v1/run/recipes/{name}/search`
**CLI:** `hoody run recipes search <name>`

---

#### `update` — Update a saved recipe

```typescript
client.run.recipes.update(name: string, data: RunRecipesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunRecipesUpdateRequest` | body | Yes | Shape: `RecipeUpdate` under Body schemas. |

**HTTP:** `PATCH /api/v1/run/recipes/{name}`
**CLI:** `hoody run recipes update <name>`

---

### `client.run.jobs` (4) — APIs for tracking async job status with optional long-polling support for sync and background operations

#### `cancel` — Cancel a search job

```typescript
client.run.jobs.cancel(job_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | Job identifier (UUID) |

**HTTP:** `POST /api/v1/run/jobs/{job_id}/cancel`
**CLI:** `hoody run jobs cancel <job-id>`

---

#### `get` — Get job status

```typescript
client.run.jobs.get(job_id: string, options?: { wait?: string; timeout_ms?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | Job identifier (UUID) |
| `wait` | `string` | query | No | Set to 'done' to long-poll until the job completes, fails or is cancelled, or until timeout_ms passes. Takes effect only with a positive timeout_ms; without one the current state is returned at once. |
| `timeout_ms` | `number` | query | No | Long-poll timeout in milliseconds (default 0, max 120000) |

**HTTP:** `GET /api/v1/run/jobs/{job_id}`
**CLI:** `hoody run jobs get <job-id>`

---

#### `list` — List background jobs

```typescript
client.run.jobs.list(options?: { kind?: "search-resolve" | "source-sync"; status?: "queued" | "running" | "done" | "error" | "cancelled" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `kind` | `"search-resolve" \| "source-sync"` | query | No | Only jobs of this kind |
| `status` | `"queued" \| "running" \| "done" \| "error" \| "cancelled"` | query | No | Only jobs in this status |

**HTTP:** `GET /api/v1/run/jobs`
**CLI:** `hoody run jobs list`

---

#### `startSearch` — Start an async search job

```typescript
client.run.jobs.startSearch(data: RunJobsStartSearchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunJobsStartSearchRequest` | body | Yes | Shape: `Selector` under Body schemas. |

**HTTP:** `POST /api/v1/run/search/jobs`
**CLI:** `hoody run jobs search start --app <app>`

---

### `client.run.catalog` (1) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

#### `list` — List the starter apps

```typescript
client.run.catalog.list(options?: { q?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `q` | `string` | query | No | Words to filter by; absent or blank lists every entry |

**HTTP:** `GET /api/v1/run/catalog`

---

### `client.run.kit` (2) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

#### `getCapabilities` — Resolve features of this service

```typescript
client.run.kit.getCapabilities()
```

**HTTP:** `GET /api/v1/run/capabilities`

---

#### `getConfig` — Get full runtime configuration

```typescript
client.run.kit.getConfig()
```

**HTTP:** `GET /api/v1/run/config`
**CLI:** `hoody run config get`

---

### `client.run.profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

#### `create` — Create a new profile

```typescript
client.run.profiles.create(data: RunProfilesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunProfilesCreateRequest` | body | Yes | Shape: `ProfileConfig` under Body schemas. |

**HTTP:** `POST /api/v1/run/profiles`
**CLI:** `hoody run profiles create --name <name>`

---

#### `delete` — Delete a profile

```typescript
client.run.profiles.delete(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/profiles/{profile}`
**CLI:** `hoody run profiles delete <profile>`

---

#### `list` — List all profiles

```typescript
client.run.profiles.list()
```

**HTTP:** `GET /api/v1/run/profiles`
**CLI:** `hoody run profiles list`

---

#### `update` — Update a profile

```typescript
client.run.profiles.update(profile: string, data: RunProfilesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name |
| `data` | `RunProfilesUpdateRequest` | body | Yes | Shape: `ProfileUpdate` under Body schemas. |

**HTTP:** `PATCH /api/v1/run/profiles/{profile}`
**CLI:** `hoody run profiles update <profile>`

---

#### `use` — Select the active profile

```typescript
client.run.profiles.use(profile: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `profile` | `string` | path | Yes | Profile name to select |

**HTTP:** `POST /api/v1/run/profiles/{profile}/select`
**CLI:** `hoody run profiles use <profile>`

---

### `client.run.sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

**Shared parameters of `client.run.sources`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source_id` | `string` | path | Yes | Source identifier |

#### `create` — Create a new package source

```typescript
client.run.sources.create(data: RunSourcesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSourcesCreateRequest` | body | Yes | Shape: `SourceConfig` under Body schemas. |

**HTTP:** `POST /api/v1/run/sources`
**CLI:** `hoody run sources create --source-id <source-id> --enabled --priority <priority> --provider <provider> --source-type <source-type>`

---

#### `delete` — Delete a package source

```typescript
client.run.sources.delete(source_id: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/run/sources/{source_id}`
**CLI:** `hoody run sources delete <source-id>`

---

#### `getDiagnostics` — Get runtime diagnostics for a source

```typescript
client.run.sources.getDiagnostics(source_id: string)
```

**HTTP:** `GET /api/v1/run/sources/{source_id}/diagnostics`
**CLI:** `hoody run sources diagnostics get <source-id>`

---

#### `list` — List all package sources

```typescript
client.run.sources.list()
```

**HTTP:** `GET /api/v1/run/sources`
**CLI:** `hoody run sources list`

---

#### `sync` — Sync a single source

```typescript
client.run.sources.sync(source_id: string)
```

**HTTP:** `POST /api/v1/run/sources/{source_id}/sync`
**CLI:** `hoody run sources sync <source-id>`

---

#### `syncAll` — Sync all sources

```typescript
client.run.sources.syncAll()
```

**HTTP:** `POST /api/v1/run/sources/sync`
**CLI:** `hoody run sources sync`

---

#### `update` — Update a package source

```typescript
client.run.sources.update(source_id: string, data: RunSourcesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `RunSourcesUpdateRequest` | body | Yes | Shape: `SourceUpdate` under Body schemas. |

**HTTP:** `PATCH /api/v1/run/sources/{source_id}`
**CLI:** `hoody run sources update <source-id>`


### Body schemas

- `PagedSearchRequest` — `{ selector*: Selector, cursor: string, page_size: int }`
  - `page_size` — Candidates per page (default: 25). Any non-negative value is accepted; the service clamps it to 1-100.
- `Selector` — `{ app*: string, os: Os|null, kind: AppKind|null, source: SourceKind[], source_id: string[], arch: Arch|null, tags: string[], profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: PickMode|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: OutputFormat|null, dry_run: bool|null, print_curl: PrintCurlMode|null, limit: int|null, enrich: bool=false, args: string[], pass_env: string[], launch_tag: string, launch_env: LaunchEnvMode }`
- `BatchRequest` — `{ items: BatchItemRequest[] }`
  - `items` — At most 100 items; a longer list is refused as a whole with 400 BATCH_TOO_LARGE.
- `SourceConfig` — `{ source_id*: string, enabled*: bool, priority*: int, provider*: SourceKind, source_type*: SourceType, pin: SourcePin|null, config: object }`
  - `provider` — The provider of source_type, and it must match it: nix for nix-pkgs and nix-flake, pkgx for pkgx, appimage for the app-image-* types, oci for the oci-* types, registry for manifest-registry, manifest-remote-index, trusted-list-file and starter-catalog, system for system-path, npm for npm-registry-search, pypi for pypi-exact. any is not a provider; a mismatch is refused with 400 SOURCE_PROVIDER_MISMATCH.
  - `config` — Provider-specific configuration (varies by source_type), always an object; `{}` when omitted, and null or any other type is refused with 400 INVALID_SOURCE. …
- `SourceUpdate` — `{ enabled: bool, priority: int, pin: SourcePin|null, config: object }`
  - Partial source update. Only the fields present in the body are applied; everything else keeps its stored value. The merged source is re-validated before it is committed, so a patch that would downgrade a signed remote index is refused.
  - `config` — Provider-specific configuration. Replaces the stored object as a unit; null or any other type than an object is refused with 400 INVALID_SOURCE.
- `ProfileConfig` — `{ name*: string, description: string|null, defaults: ProfileDefaults, sources_mode: ProfileSourceMode, sources: ProfileSourceOverride[], policy: PolicyConfig }`
- `ProfileUpdate` — `{ description: string|null, defaults: ProfileDefaultsUpdate, sources_mode: "inherit" | "allowlist"|null, sources: ProfileSourceOverride[]|null, policy: PolicyConfigUpdate }`
  - … The merged profile is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The profile's name is taken from the path and cannot be changed here.
- `RecipeConfig` — `{ name*: string, description: string, selector_template: SelectorTemplate, allowed_overrides: string[] }`
- `RecipeUpdate` — `{ description: string|null, selector_template: SelectorTemplateUpdate, allowed_overrides: string[]|null }`
  - … The merged recipe is validated before it is stored, and an invalid value or an unknown top-level field is a 400 with nothing stored (unknown keys inside a nested object are ignored, as on create). The recipe's name is taken from the path and cannot be changed here.
- `RecipeExecutionRequest` — `{ overrides: SelectorTemplate }`
- `Os` — `"linux" | "windows" | "any"`
- `AppKind` — `"gui" | "cli" | "any"`
- `SourceKind` — `"nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "npm" | "pypi" | "any"`
- `Arch` — `"amd64" | "arm64" | "any"`
- `PickMode` — `"ask" | "first" | "index" | "id"`
  - Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
- `OutputFormat` — `"json" | "html"`
- `PrintCurlMode` — `"hoody-run"`
- `LaunchEnvMode` — `"inline" | "separate"`
- `BatchItemRequest` — `{ request_id*: string, mode*: BatchMode, selector*: Selector }`
- `SourceType` — `"nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "oci-docker-hub-search" | "oci-ghcr" | "manifest-registry" | "manifest-remote-index" | "system-path" | "trusted-list-file" | "starter-catalog" | "npm-registry-search" | "pypi-exact"`
- `SourcePin` — `{ url*: string, sha256: string|null, author_pubkey_ed25519: string|null, sig_ed25519: string|null }`
- `ProfileDefaults` — `{ os: Os|null, kind: AppKind|null, source: SourceKind[], pick: PickMode|null, terminal_id: int|null, display: string|null, limit: int|null }`
  - `limit` — Default maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `ProfileSourceMode` — `"inherit" | "allowlist"`
- `ProfileSourceOverride` — `{ source_id*: string, enabled: bool|null, priority: int|null }`
- `PolicyConfig` — `{ require_verified: bool|null, require_integrity: bool|null, deny_providers: SourceKind[], deny_source_ids: string[] }`
- `ProfileDefaultsUpdate` — `{ os: "linux" | "windows" | "any"|null, kind: "gui" | "cli" | "any"|null, source: SourceKind[]|null, pick: "ask" | "first" | "index" | "id"|null, terminal_id: int|null, display: string|null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
  - `limit` — Default maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `PolicyConfigUpdate` — `{ require_verified: bool|null, require_integrity: bool|null, deny_providers: SourceKind[]|null, deny_source_ids: string[]|null }|null`
- `SelectorTemplate` — `{ app: string|null, os: Os|null, kind: AppKind|null, source: SourceKind[]|null, source_id: string[]|null, arch: Arch|null, tags: string[]|null, profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: PickMode|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: OutputFormat|null, dry_run: bool|null, print_curl: PrintCurlMode|null, limit: int|null }`
  - `limit` — Maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `SelectorTemplateUpdate` — `{ app: string|null, os: "linux" | "windows" | "any"|null, kind: "gui" | "cli" | "any"|null, source: SourceKind[]|null, source_id: string[]|null, arch: "amd64" | "arm64" | "any"|null, tags: string[]|null, profile: string|null, channel: string|null, version: string|null, variant: string|null, publisher: string|null, repo: string|null, release: string|null, asset: string|null, pick: "ask" | "first" | "index" | "id"|null, pick_index: int|null, candidate_id: string|null, set_id: string|null, terminal_id: int|null, display: string|null, origin: string|null, format: "json" | "html"|null, dry_run: bool|null, print_curl: "hoody-run"|null, limit: int|null }|null`
  - `pick` — Candidate selection mode: ask: return candidate list without selecting (default); first: automatically select the highest-ranked candidate; index: select by 0-based index (requires pick_index); id: select by candidate_id (requires candidate_id)
  - `limit` — Maximum candidates to return. Any non-negative value is accepted; the service clamps it to 1-100.
- `BatchMode` — `"search" | "run"`

