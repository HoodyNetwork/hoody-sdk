# AGENTS.md — Building with `@hoody-ai/hoody-sdk`

You cloned this repo to **build an app with the Hoody SDK** — not to maintain the SDK or its generator. This file gets you productive in 10 minutes and keeps you out of the handful of traps that break almost every first attempt. Read the two rules, then jump to whatever you're building.

**Rule 1 — Never guess a method, field, or slug.** The typed surface is large (19 namespaces, 1064 methods) and the names are specific (`container_image`, not `image`). When unsure, grep `generated/` before you write the call — see [Look it up fast](#look-it-up-fast). A hallucinated field compiles to `any` and fails at runtime; it's worse than none.

**Rule 2 — The payload is always on `.data`.** Every request method resolves to `{ statusCode, message, data }`. Fields are typed but usually optional, so optional-chain: `(await hoody.api.containers.list()).data?.containers?.[0]`. Streaming, WebSocket, and iterator helpers are the exceptions — they return their own types.

---

## The model in 60 seconds

Hoody runs disposable Debian containers and exposes each one's capabilities — terminal, files, headless browser, GUI display, an AI agent, cron, SQLite, tunnels — as typed HTTPS endpoints. **Everything is a URL.** You run no proxy and no backend; your code (Node, Bun, or a browser tab) calls Hoody's edge, which routes to your container.

The SDK is **one client class at two scopes**:

- **`hoody.api.*`** — your *account* (control plane): containers, projects, servers, realms, tokens, billing. Needs auth.
- **`box.*`** — one *container's* Kit services: `box.terminal`, `box.files`, `box.browser`, `box.display`, `box.agent`, `box.daemon`, `box.cron`, `box.sqlite`, `box.exec`, and more. Obtained by scoping the account client to a container.

```typescript
import { HoodyClient } from '@hoody-ai/hoody-sdk';

const hoody     = await HoodyClient.authenticate('https://api.hoody.com', { username, password });
const container = (await hoody.api.containers.list()).data!.containers![0]!;
const box       = await hoody.withContainer(container);   // container object OR id string

const { stdout, exitCode } = await box.execute('uname -a');   // runs, waits, returns output
```

> **Install:** `npm install @hoody-ai/hoody-sdk` (Node ≥ 22.19.0, or `bun add`). A browser build ships too (`exports["."].browser`, or the pinned jsDelivr/unpkg CDN bundle) and omits Node-only helpers (`tunnel*`, `shell`). Examples use `api.hoody.com` (the dev host in this source tree); the published product is `hoody.com`. The SDK derives every container domain from your `baseURL`, so pointing `baseURL` at `api.hoody.com` makes Kit URLs resolve to `*.containers.hoody.com` — set it once and everything follows.

**No containers yet?** Create one — a container lives in a project, on a server, and your free tier already has a server. The resource chain is **account → server → project → container**:

```typescript
const serverId = (await hoody.api.serverRental.list()).data![0]!.server_id!;
const project  = await hoody.api.projects.create({ alias: 'my-first-project' });
const { data: container } = await hoody.api.containers.create(project.data!.id, {
  server_id: serverId,
  name: 'dev-box',
  hoody_kit: true,   // ← preinstalls the Kit service layer; REQUIRED for any box.* call
});
const box = await hoody.withContainer(container!);
```

Note the signature: **`containers.create(projectId, data, options?)`** — the project id is a positional first argument, not a field in `data`. And `hoody_kit: true` is load-bearing: a container without it boots fine but has **no Kit services**, so every `box.*` call fails. Delete with `hoody.api.containers.delete(container!.id)` — the container and all its URLs vanish.

---

## The five invariants (learn these once)

These hold across all 1064 methods. Internalize them and you can call methods you've never read.

1. **The envelope.** Every request method resolves to `{ statusCode, message, data }`. **Your payload is on `.data`.** (Streams / WebSocket / iterator helpers return their own types.)
2. **The trailing options bag.** Almost every method ends with an options object that fuses endpoint query params with per-request transport overrides: `retries`, `retryDelayMs`, `retryOnStatuses`, `timeoutMs`, `signal`, `responseType` (`'auto'|'json'|'text'|'arrayBuffer'|'blob'`), and — on `api.*` methods — `_realm`. Kit query params live here too. No client rebuild needed.
3. **The pagination triad.** List endpoints ship three forms: `list()` (one page), `listAll()` (collects every page), `listIterator()` (async-iterable). Reach for `listAll()`/`listIterator()` when you can't assume one page.
4. **Everything is a structural URL.** Each Kit service has a deterministic subdomain: `https://{projectId}-{containerId}-{segment}.{server}.containers.hoody.com`. **Build it with `hoody.getKitUrl(service, container, index?)`** — never hand-concatenate (it knows the slug remaps and the port form; see [trap 5](#the-traps)).
5. **The container URL *is* the credential.** Open containers have no auth of their own — possession of the full subdomain grants access. Treat container ids like passwords; front user-facing embeds with permission rules / realms / aliases. The one exception is the **agent** kit, which is claim-gated ([trap 2](#the-traps)).

---

## Auth — three shapes, one gotcha

```typescript
// Explicit — login now, get a ready client (what you'll use most):
const hoody = await HoodyClient.authenticate('https://api.hoody.com', { username, password });

// Lazy — pass credentials; login fires on first request, refreshes on expiry:
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', credentials: { username, password } });

// Token-only (no password on file) — pair with onTokenExpired so 401s self-heal:
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: initialToken,
  onTokenExpired: async () => (await myAuthService.refresh()) ?? undefined,  // undefined → let the 401 throw
});
```

`onTokenExpired` fires once per 401, adopts the returned token, and **replays** the original request; concurrent 401s coalesce through a single refresh. `await hoody.getAuthToken()` returns the current bearer token (logging in first if the client was built lazily) — you'll need it for tunnels and the agent handshake; its type is `Promise<string | undefined>`, hence the `!` in snippets.

**Never** ship account credentials or an account-wide token to a browser or an untrusted agent. Mint a short-lived, realm-scoped token with `hoody.api.authTokens.create(...)` and hand out *that* (see [Multi-tenancy](#multi-tenancy-in-one-call)).

---

## Recipes you'll actually reach for

Assume the `hoody` / `box` pair above. Every method here is verified against `generated/`.

### 1. Run a command — use `box.execute`, not the raw call

```typescript
const { stdout, stderr, exitCode } = await box.execute('npm test', { cwd: '/workspace', timeout: 30 });
```

`box.execute(cmd, opts?)` is the supported one-shot (a hand-written mixin in `lib/terminal-exec.ts`): it runs the command in a fresh ephemeral PTY, **waits**, and returns `{ stdout, stderr, exitCode, timedOut, duration, commandId }` (`exitCode` is `number | null`). Options include `cwd`, `timeout` (**seconds**, `0` = none), `env`, `user`, `serviceIndex`. This is the correct primitive for wiring a shell tool onto an LLM. `box.shell(opts?)` opens an interactive PTY as a Node Duplex stream (Node/Bun; PTYs don't report exit codes). See [trap 1](#the-traps) for why the raw generated method is *not* a substitute.

### 2. Files

```typescript
const text    = await box.files.get('/etc/hostname', { responseType: 'text' });
await box.files.put('/tmp/in.docx', bytes);
await box.execute('libreoffice --headless --convert-to pdf --outdir /tmp /tmp/in.docx');
const pdf     = await box.files.get('/tmp/in.pdf', { responseType: 'arrayBuffer' });
const entries = await box.files.listDirectory('/workspace');
```

`box.files.get(path, options?)` takes the path first; set `responseType` explicitly for binary. It also does glob/grep/archive via options (`{ glob }`, `{ grep }`, `{ zip: '' }`). `box.files.*` is the widest Kit namespace (127 methods) — archives, WebDAV, cloud backends. `files.put(path, data, options?)` takes an `object` body; confirm the shape in `docs/reference/namespaces/files.md` before assuming an envelope.

### 3. Headless browser & GUI display

```typescript
// Headless Chromium
const shot = await box.browser.interaction.takeScreenshot({ browser_id: '1', url: 'https://hoody.com' });

// Drive a live X11 desktop (a vision model + screenshot loop can operate any GUI app)
await box.display.input.clickAt({ x: 100, y: 200 }, { displayId: 1 });   // data first, { displayId } in options
```

`box.display.input.*` is a full set of hands (`typeAt`, `drag`, `batch`, window management). **Turn a running window into a URL** — launch a GUI app on a virtual display, then compose the display URL and drop it in an `<iframe>`:

```typescript
await box.terminal.execution.execute({ command: 'firefox https://hoody.com' }, { terminal_id: '1', display: '1' });
const url = hoody.getKitUrl('display', container, 1);   // embeddable live window
```

One-shot shortcut (single round-trip, 302s straight to the live window):

```typescript
const url = hoody.getKitUrl('terminal', container) +
  `?terminal_id=1&display=1&cmd=${btoa('firefox https://hoody.com')}&redirect=display`;
```

> The URL *is* the capability — anyone who can read that iframe `src` reaches the service. Gate it before showing it to users.

### 4. The built-in agent (claim-gated — read [trap 2](#the-traps) first)

`box.agent.*` (212 methods, the largest namespace) is the **only** kit where the URL isn't enough. A bare `withContainer(container)` gives `box.agent` calls that return **`401 CLAIM_REQUIRED`**. Mint a signed container claim once and attach it:

```typescript
const { data: authz } = await hoody.api.containers.authorize(container.id);   // → data.container_claim (object)
const box = await hoody.withContainer(container, {
  kitAuth: {
    type: 'containerClaim',
    claim: JSON.stringify(authz!.container_claim),   // MUST be the stringified object, not the object
    token: (await hoody.getAuthToken())!,            // authorize() does NOT return a token
  },
});

const created   = await box.agent.sessions.createSession();
const sessionId = created.data!.session_id as string;   // agent replies are Record<string,unknown> — cast is expected
const turn      = await box.agent.sessions.promptSync(sessionId, { text: 'Run the tests and fix the first failure.' });
```

For **streaming**, use the hand-written helper — it mints the claim for you and parses the daemon's SSE (Node/Bun; the *supported* streaming path):

```typescript
import { streamAgentPrompt } from '@hoody-ai/hoody-sdk';

const run = await streamAgentPrompt(hoody, {
  container,
  sessionId,                 // from createSession above
  text: 'Audit /workspace, run the tests, summarize what changed.',
  policy: 'auto_approve',    // auto-approve confirm gates instead of pausing the turn
});
for await (const delta of run.text) process.stdout.write(delta);   // run.text is AsyncIterable<string>
const result = await run.done;   // { terminal, text, data }
```

> **Do not use `box.agent.sessions.promptStream()` for streaming.** It returns a WebSocket client whose wire format does **not** match the agent daemon's SSE stream. `streamAgentPrompt` is the one that works. Provider keys / default model live under `box.agent.models.*`.

### 5. Exec scripts — drop a file, get an endpoint

```typescript
await box.exec.scripts.write({ path: 'api/build.ts', content: src, createDirs: true });
// exec/scripts/api/build.ts → POST /api/build, reachable via HTTP, CLI, cron, and the agent's tool catalog — no redeploy.
const res = await fetch(hoody.getKitUrl('exec', container) + '/api/build?branch=main', { method: 'POST' });
```

Inside a dropped script, `req` / `res` / `metadata` are ambient — no import. See `docs/reference/namespaces/exec.md`.

### 6. Other everyday one-liners

```typescript
// Supervised process (run a CLI agent, tail over HTTP). NOTE arg order: launch(data, _templateVars?, requestOptions?)
const launched = await box.daemon.quickStart.launch({ user: 'hoody', command: 'claude --print "refactor src/"' });
const logs     = await box.daemon.quickStart.getEphemeralLogs(launched.data!.temporary_id);

// Cron — first arg is the crontab-owning Linux user
await box.cron.entries.create('hoody', { schedule: '0 * * * *', command: 'backup.sh' });

// SQLite — executeShareable takes base64-encoded SQL
const rows = await box.sqlite.query.executeShareable({ db: 'app', sql: btoa('select count(*) from users') });
```

`user: 'hoody'` is the container-side **Linux** user — unrelated to the `hoody` client variable. The binary must be on the container `PATH` first (`apt install` / `npm i -g`, or push your local config with `await box.syncAgentConfig('claude', { only: 'credentials' })`).

### 7. Tunnels (Node/Bun only — not in the browser build)

```typescript
import { tunnelExpose } from '@hoody-ai/hoody-sdk';
const handle = await tunnelExpose({
  url: hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') + '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 80,                 // world-reachable container port
  to: { host: '127.0.0.1', port: 3000 },
});
console.log(handle.publicUrl); await handle.close();
```

`tunnelExpose` = laptop→public; `tunnelPull` = container-loopback→your local TCP; `tunnelServe` takes a fetch handler. `box.tunnel.*` is the admin surface (list/kill sessions).

---

## The traps

These cause most first-hour failures. Each has the fix in place.

**1 — `box.terminal.execution.execute()` does NOT return stdout.** The raw generated method returns immediately with a `command_id` and needs a `terminal_id` (or `{ ephemeral: true }`); you'd then poll `box.terminal.execution.getResult(command_id)`. **Use `box.execute(cmd)`** — the mixin that does the run-poll-collect loop. Only reach for the raw method when you specifically need a GUI-display session (`{ terminal_id: '1', display: '1' }`), a long-lived named terminal, or SSH options.

**2 — The agent kit returns `401 CLAIM_REQUIRED` on a bare `withContainer`.** It's the one claim-gated kit. Either mint the claim (`containers.authorize(id)` → `kitAuth: { type:'containerClaim', claim: JSON.stringify(authz.container_claim), token: await hoody.getAuthToken() }`, as in recipe 4) **or** use `streamAgentPrompt`, which mints it for you. `authorize()`'s response has `container_claim` (an object → stringify it) and `expires_in` but **no token** — the token comes from `getAuthToken()`.

**3 — Request types aren't exported.** Response types are inferred (you rarely annotate). For a *request* body you need to name, derive it from the method — don't invent an import path:
```typescript
type CreateReq = Parameters<HoodyClient['api']['containers']['create']>[1];  // create(projectId, body, opts) → body is [1]
```
Field names are exact: `container_image` not `image`, `server_id` not `server`. If TypeScript rejects a field, the signature is right and your guess is wrong.

**4 — Argument order isn't uniform — the options bag isn't always arg 2.** Most methods are `(…path, data?, options?)`, but some generated methods put the options bag later: `box.daemon.quickStart.launch(data, _templateVars?, requestOptions?)` and `box.cron.entries.create(user, data, _templateVars?, requestOptions?)`. If a call ignores your options silently, re-check the real signature ([Look it up](#look-it-up-fast)).

**5 — Kit URL slug ≠ SDK namespace for three services.** The subdomain segment differs from the namespace name: **`notifications`→`n`**, **`proxyLogs`→`logs`**, **`app`→`run`**. Hand-building `…-notifications-1.…` 404s. **Always use `getKitUrl()`** — it normalizes the slug. Raw ports: `getKitUrl('http', container, { port: 8080 })` → `http-8080` (a number in the 3rd arg is also read as the port for `http`/`https`). `ssh` and `proxy` are un-indexed special routes. Default `serviceIndex` is `1`; the agent daemon is a singleton at index 1.

**6 — Cross-origin `Authorization` is stripped.** When a request resolves to a host outside your `baseURL` origin (any Kit URL on `*.containers.hoody.com`, or a redirect), the SDK drops the `Authorization` header before fetch — by design, so your API token can't leak onto a container URL. Consequence: Kit auth is *separate* from API auth. Open kits need none (URL is the credential); the agent kit needs its claim; a locked-down kit carries its own proxy-auth. Realm subdomains of your `baseURL` count as same-origin and keep the header.

**7 — Realms scope by routing; pick one form.** Per-call: pass `{ _realm: realmId }` in an `api.*` options bag. Whole-client: `hoody.withRealm(realmId)` routes every request via `{realmId}.api.hoody.com`; or set `baseURL` to that subdomain directly. `_realm` is the **host-scope override**; `realm_id` is a plain query param that exists *only* on operations whose OpenAPI declares it — don't substitute one for the other. There is no create-realm call: a realm exists by being attached (`realm_ids: [...]`) to a project/container/token. A realm-scoped token only *sees* resources in its realm — others don't 403, they don't exist for it.

**8 — Tokens are shown once.** `authTokens.create(...).data.token` is returned only at creation; `list`/`get` never return it. Capture and store it immediately.

---

## Multi-tenancy in one call

Hand each customer an isolated slice of your account. `created.data.token` is returned **once**, at creation:

```typescript
const created = await hoody.api.authTokens.create({
  alias: 'Customer: Acme',
  permission_template: 'external_customer',   // or full_access | dev_team | finance_team | read_only, or fine-grained `permissions`
  realm_ids: [realmId],
  allow_no_realm: false,                       // force the realm-scoped URL
  ip_whitelist: ['203.0.113.0/24'],
  expires_at: '2026-12-31T00:00:00Z',          // ISO string, unix ts, "today"/"tomorrow"; omit = never expires
});
const acme = new HoodyClient({ baseURL: 'https://api.hoody.com', token: created.data!.token }).withRealm(realmId);
```

---

## Errors, retries, redaction

```typescript
import { isApiError, isRetryableApiError } from '@hoody-ai/hoody-sdk';

try {
  await box.files.get('/nonexistent');
} catch (err) {
  if (isApiError(err)) {
    err.status;    // HTTP code (number)
    err.code;      // server error code string, e.g. 'CLAIM_REQUIRED'
    err.response;  // parsed server body
    err.request;   // { method, url, headers, body, query } — secrets already redacted
    if (isRetryableApiError(err)) { /* 408/425/429/500/502/503/504 — safe to replay an idempotent op */ }
  }
}
```

`ApiError` (any 4xx/5xx, same class in Node/Bun/browser/CLI), `ValidationError` (bad input shape, thrown *before* the request goes out — fix the call, don't retry), and `VaultCryptoError` are package-root exports. Use the guards (`isApiError`), not `instanceof`, so they work across module boundaries. **Request secrets are auto-redacted** (`Authorization`, `Cookie`, `?token=…`, secret body fields → `[REDACTED]`) on `err.request`/`err.url` before the error reaches your `catch` — but `err.response`/`err.message` carry the server's reply verbatim, so sanitize those before logging if your backend echoes anything sensitive.

Per-call overrides live in the trailing options bag — no client rebuild:

```typescript
await box.files.get('/big', { retries: 5, retryDelayMs: 500, timeoutMs: 60_000, responseType: 'arrayBuffer' });
```

**Response signing (if you verify it):** `X-Hoody-Signature` is a response *header*, not on `.data`. Verification key comes from `GET /api/v1/meta/public-key`; empty responses, streams, and signing-disabled deployments may omit it; **Kit routes are not signed like API routes.** Verify with `parseHoodySignatureFrom()` / `verifyHoodySignatureFrom()` (package root).

---

## Look it up fast

You'll constantly need a method or field you haven't seen. **Don't guess — grep.** This is the single highest-leverage habit for building correctly here.

```bash
# 1. Confirm the operation exists (path or operationId) in the merged spec:
rg -n '"/api/v1/projects/.*/containers"|createProjectContainer' generated/openapi.public.json

# 2. Read the exact typed signature — arg order, options bag, and return type are inline:
rg -n "async create\(" generated/api/containers.service.generated.ts

# 3. Find the request/response type body:
rg -n "ApiContainersCreate(Request|Response)" generated/types.ts
```

The generated signature is ground truth. If a snippet (even one here) disagrees with it, the signature wins.

| I need… | Where |
|---|---|
| The SDK method for X (flat list, all 1065) | `docs/reference/SDK-METHODS.md` |
| The CLI command for X (flat list, all 826) | `docs/reference/CLI-COMMANDS.md` |
| What `box.<ns>` can do (per-namespace deep dive) | `docs/reference/namespaces/<ns>.md` |
| HTTP path ↔ SDK method ↔ CLI command | `docs/reference/HTTP-METHODS.md` |
| Exact param & return shape | `generated/<ns>/*.service.generated.ts` |
| Field names / request-body types | `generated/types.ts` |
| The raw contract | `generated/openapi.public.json` |
| Method counts & namespace map | `docs/reference/SUMMARY.md` |
| Hand-written helpers (the "supported" paths) | `lib/` — `terminal-exec.ts` (`execute`/`shell`), `agent-client.ts` (`streamAgentPrompt`), `tunnel-*.ts`, `signing.ts`, `redact.ts`, `kit-catalog.ts` |

**Namespaces (19):** account = `api`. Container = `terminal · files · browser · display · code · exec · daemon · cron · watch · sqlite · curl · pipe · app · notes · notifications · tunnel · proxyLogs · agent`. `agent` (212) and `files` (127) are the largest.

---

## Running the CLI from this clone

The repo ships a `hoody` CLI (`bin` → `cli/dist/index.js`). To run the exact code you're reading:

```bash
npm install && npm run build:cli && npm link   # `hoody` on your PATH, served from this checkout
hoody login && hoody ps
```

Zero-build alternative — run the TS entry point in place:

```bash
cd cli && npm install && npx tsx index.ts login   # then `npx tsx cli/index.ts <args>` from the repo root
```

Every command takes `--output <table|json|yaml|wide|raw>`; `--output raw` prints a string body verbatim (non-string objects fall back to JSON) for piping. Scripts under `exec/scripts` appear as `hoody exec <name>`. Full command list: `docs/reference/CLI-COMMANDS.md`.

---

## Accuracy discipline — do / don't

- **Do** grep the generated signature before writing an unfamiliar call. **Don't** infer field names — it's `container_image` not `image`, `server_id` not `server`.
- **Do** read `.data` and optional-chain nested fields (`?.`). **Don't** assume a field is present because it's typed — most are optional.
- **Do** use `box.execute()` for one-shot commands and `streamAgentPrompt` for agent streaming. **Don't** use the raw `terminal.execution.execute` (no stdout) or `promptStream` (wrong wire format) as substitutes.
- **Do** build Kit URLs with `getKitUrl()`. **Don't** hand-build `notifications`/`proxyLogs`/`app` segments.
- **Do** snapshot before turning an agent loose in a container (`hoody.api.containers.createSnapshot(id, {...})`) — it turns a mistake into an undo.
- **Do** treat container ids and tokens as secrets — the URL is the capability. **Don't** paste them into public issues, screenshots, or shared channels.
- **Don't** write `as any` to force a call to compile — that's the signal you guessed a field; re-grep instead. (The legitimate cast is `box.agent.*` responses, which are genuinely `Record<string, unknown>`.)
- **Don't** edit `generated/`, `dist/`, or `cli/dist/` to make app code work — that's the SDK, not your app.
