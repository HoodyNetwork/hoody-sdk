# AGENTS.md — Building on Hoody via SDK, CLI, or HTTP

**Hoody** runs disposable cloud Linux containers—terminal, files, browser, GUI, an AI agent, and more—behind HTTPS endpoints. Use the same capability surface three ways:

- **SDK** for TypeScript/JavaScript apps, automation, libraries, and scripts.
- **CLI** for terminals, shell sessions, one-offs, pipes, and CI.
- **HTTP** for AI agents, other languages, and zero-dependency integrations.

Every generated HTTP endpoint has a typed SDK method and CLI command. The 1:1 map lives in [docs/reference/HTTP-METHODS.md](./docs/reference/HTTP-METHODS.md), so you can mix interfaces without changing the underlying model.

You're here to **build on Hoody**, not maintain the SDK or generator. Read the two rules, choose an interface, then jump to a recipe.

**Contents:** [Choose your interface](#choose-your-interface) · [The model in 60 seconds](#the-model-in-60-seconds) · [The five invariants](#the-five-invariants-learn-these-once) · [Running the CLI](#running-the-cli) · [HTTP and curl](#http-and-curl) · [Auth](#auth--three-shapes-one-gotcha) · [Recipes](#recipes-youll-actually-reach-for) · [The traps](#the-traps) · [Errors, retries, redaction](#errors-retries-redaction) · [Look it up fast](#look-it-up-fast) · [Accuracy discipline](#accuracy-discipline--do--dont)

**Rule 1 — Never guess a method, command, field, path, or slug.** Names are specific (`container_image`, not `image`). Inspect generated SDK signatures and use the shipped CLI/HTTP maps. A plausible guess is worse than none.

**Rule 2 — The payload is always `data`.** Ordinary HTTP and SDK responses use `{ statusCode, message, data }`; read `.data`. CLI `-o json`, `-o yaml`, and `-o raw` unwrap the envelope, so their output is already the `data` shape.

---

## Choose your interface

| You are… | Start with… | Why |
|---|---|---|
| Building a TS/JS app, automation, library, or script | **Hoody SDK** | Typed methods, autocomplete, helpers, retries, streaming clients |
| Working in a terminal, shell, one-off task, pipe, or CI job | **`hoody` CLI** | Fast commands, interactive PTYs, structured output, no glue code |
| Driving Hoody from an AI agent, another language, or a zero-dependency environment | **HTTP with `curl`**, or the CLI | Bearer token plus JSON; every endpoint is directly callable |

The SDK also fits scripting; the CLI is the natural terminal interface; HTTP is universal for agents and non-JavaScript systems.

### Rosetta: list your containers three ways

```typescript
// SDK
import { HoodyClient } from 'hoody-sdk';

const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: process.env.HOODY_TOKEN,
});

const containers = (await hoody.api.containers.list()).data?.containers ?? [];
```

```bash
# CLI: -o json unwraps the envelope to the SDK .data shape
hoody containers ls -o json
hoody ps -o json # equivalent short form

# HTTP
curl -s -H "Authorization: Bearer $HOODY_TOKEN" \
  https://api.hoody.com/api/v1/containers/ | jq '.data.containers'
```

These reach the same capability: use the SDK in your app, inspect with the CLI, and call the same endpoint from an agent with `curl`.

---

## The model in 60 seconds

Hoody exposes each container's terminal, files, browser, GUI display, agent, cron, SQLite, tunnels, and other services as HTTPS endpoints. **Everything is a URL.**

- **Account scope** — containers, projects, servers, realms, tokens, billing, and users. HTTP uses `https://api.hoody.com`; SDK calls live under `hoody.api.*`.
- **Container scope** — one container's Kit services: terminal, files, browser, display, agent, daemon, cron, SQLite, exec, and more. Calls use structural `*.containers.hoody.com` URLs; SDK calls live under `box.*`.

```typescript
import { HoodyClient } from 'hoody-sdk';

const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
  username,
  password,
});

const containers = (await hoody.api.containers.list()).data?.containers ?? [];
const container = containers.find(c => c.status === 'running' && c.hoody_kit)!;
const box = await hoody.withContainer(container);
const { stdout, exitCode } = await box.execute('uname -a');
```

> **Install:** `npm install hoody-sdk@beta` or `bun add hoody-sdk@beta`. Node ≥ 22.19.0. The browser build omits Node-only helpers such as `tunnel*` and `shell`.
>
> **SDK `baseURL`:** use `https://api.hoody.com`; the SDK derives `*.containers.hoody.com` Kit URLs from it.

No containers yet? A container lives in a project, on a server:

```typescript
const serverId = (await hoody.api.serverRental.list()).data![0]!.server_id!;
const project = await hoody.api.projects.create({ alias: 'my-first-project' });
const { data: container } = await hoody.api.containers.create(project.data!.id, {
  server_id: serverId,
  name: 'dev-box',
  hoody_kit: true,
});

while ((await hoody.api.containers.get(container!.id!)).data?.status !== 'running') {
  await new Promise(resolve => setTimeout(resolve, 1000));
}

const box = await hoody.withContainer(container!);
```

The signature is **`containers.create(projectId, data, options?)`**: `projectId` is positional. `hoody_kit: true` installs the Kit service layer required by `box.*`.

Container lifecycle lives under `hoody.api.containers.*`: `manage(id, 'start' | 'stop' | 'restart')`, `getStats(id)`, `createSnapshot(id, {...})`, `restoreSnapshot(id, name)`, and `delete(id)`.

---

## The five invariants (learn these once)

1. **The envelope.** Ordinary HTTP/SDK requests return `{ statusCode, message, data }`; HTTP reads `.data`, SDK reads `response.data`, and CLI `json`, `yaml`, and `raw` unwrap before printing. SDK failures throw `ApiError`. Streaming and structural helpers—`box.agent.sessions.promptStream()`, `box.watch`, `pipe`, `createCurlFetch`, and `EventsClient`—return purpose-built clients or streams. SDK `rawResponse: true` returns the unwrapped body.

2. **Parameters stay endpoint-specific.** Most SDK methods end with an options bag containing endpoint query parameters and transport overrides: `retries`, `retryDelayMs`, `retryOnStatuses`, `timeoutMs`, `signal`, `responseType`, and, for account calls, `_realm`. CLI exposes generated arguments/flags; HTTP uses path, query, headers, and JSON body. Check references instead of assuming argument order.

3. **Pagination is contractual.** Paginated SDK list endpoints commonly provide `list()` for one page, `listAll()` for all pages, and `listIterator()` for an async iterable. Not every `list()` paginates; consult the generated CLI command or OpenAPI contract.

4. **Everything is a structural URL.** Container services use `https://{projectId}-{containerId}-{segment}.{server}.containers.hoody.com`. Build SDK URLs with `hoody.getKitUrl(service, container, index?)`, never string concatenation; it handles slug remaps and raw-port routes.

5. **The container URL is the credential.** Open Kit services need no account bearer token: possession of the full structural URL grants access. Treat container ids and URLs like passwords. Before exposing one, use `hoody.api.proxyPermissionsContainer.replace(...)` for access rules, `hoody.api.proxyAliases.create(...)` to hide ids behind an alias, and a DNS CNAME for your own domain. The agent kit is claim-gated and requires a signed container claim.

---

## Running the CLI

The `hoody` CLI ships inside `hoody-sdk`. Choose any invocation form:

```bash
npx https://hoody.com login
npx https://hoody.com ps
npm install -g hoody-sdk
hoody login
hoody ps
ssh hoody.com # memory-only sandbox; no installation
```

The package URL also works with bunx, pnpm dlx, and Deno. Generated commands follow:

```text
hoody <group> <command> [args] [flags]
```

There are 37 generated groups mirroring SDK namespaces—including `containers`, `projects`, `files`, `terminal`, `browser`, `display`, `agent`, `exec`, `daemon`, `cron`, `sqlite`, `tunnel`, `proxy`, `realms`, `servers`, `wallet`, `auth`, and `users`—plus 24 top-level utility commands.

```text
SDK:  agent.agents.createAgent
CLI:  hoody agent agents create
HTTP: POST /api/v1/agent/agents
```

See [docs/reference/CLI-COMMANDS.md](./docs/reference/CLI-COMMANDS.md) for every command and [docs/reference/HTTP-METHODS.md](./docs/reference/HTTP-METHODS.md) for the three-way map.

### Output and global flags

```bash
hoody containers ls --output table
hoody containers ls -o json | jq '.containers[]'
hoody containers ls -o yaml
```

Modes: `table`, `json`, `yaml`, `wide`, `raw`. **`json`, `yaml`, and `raw` unwrap the API envelope.**

```json
{"statusCode":200,"message":"OK","data":{"containers":[]}}
```

Thus `-o json` prints `{"containers":[]}`. `raw` prints string payloads verbatim for piping; non-strings fall back to JSON.

```text
-c, --container <id>
--realm <id>
-t, --token <bearer>
-o, --output <mode>
-y, --yes
```

### CLI recipes

```bash
# Auth, token export, account creation
hoody login --username you@example.com
hoody login --print-token
hoody logout
hoody signup --email you@example.com

# Containers and commands
hoody ps                            # same as: hoody containers ls
hoody run <container-id> -- uname -a
hoody run <container-id> -- npm test

# Interactive PTY; hoody pty and hoody ssh are aliases
hoody shell
hoody sh
# The ssh form can bridge with --ssh-host and --ssh-user

# Kit UI: argument is a service slug, not a container id
hoody open terminal
hoody open files
hoody open code
hoody open http-8080

# Kit screenshots
hoody screenshot display --path ./display.png
hoody screenshot browser --path ./browser.png
hoody screenshot terminal --path ./terminal.png

# Mount container data
hoody mount <container-id>:/data ./data
hoody unmount

# Dropped script: exec/scripts/api/build.ts becomes this command,
# an HTTP endpoint, a cron target, and an agent tool
hoody exec api/build

# Other utilities
hoody config set <key> <value>
hoody chat
hoody chat Explain this failure
hoody update
hoody check-update
hoody completion bash
hoody completion zsh
hoody completion fish
hoody local defaults set <key> <value>
```

For generated file, browser, daemon, cron, SQLite, tunnel, and agent operations, look up the exact command instead of inferring it from SDK spelling.

---

## HTTP and curl

Use HTTP for AI agents, other languages, or environments where you want no SDK dependency.

```text
Account base: https://api.hoody.com/api/v1/...
Header:       Authorization: Bearer <token>
```

```bash
hoody login --print-token # obtain a bearer token
```

```typescript
const token = await hoody.getAuthToken(); // from an authenticated SDK client
```

You can also obtain a login token through the auth API or mint a scoped token with `authTokens.create`.

### Account API example

```bash
# Full envelope
curl -s -H "Authorization: Bearer $HOODY_TOKEN" \
  https://api.hoody.com/api/v1/containers/

# Payload only
curl -s -H "Authorization: Bearer $HOODY_TOKEN" \
  https://api.hoody.com/api/v1/containers/ | jq '.data'
```

The wire response is `{"statusCode":200,"message":"OK","data":{"containers":[]}}`.

Verified container paths:

```text
POST /api/v1/projects/{id}/containers
GET  /api/v1/containers/{id}
POST /api/v1/containers/{id}/authorize
POST /api/v1/containers/{id}/copy
```

Use [docs/reference/HTTP-METHODS.md](./docs/reference/HTTP-METHODS.md) for exact methods, paths, SDK calls, and CLI commands.

### Container and Kit calls

Kit calls use structural service URLs, not `api.hoody.com`:

```text
https://{projectId}-{containerId}-{segment}.{server}.containers.hoody.com
```

Segments include `files`, `terminal`, and `exec`; three SDK namespaces are remapped:

```text
notifications → n
proxyLogs     → logs
app           → run
```

Open kits need no account token because the URL is the credential. The agent kit requires a signed claim minted by `POST /api/v1/containers/{id}/authorize`. Kits protected by proxy rules use those rules' credentials. Never send an account-wide bearer token to a container URL.

### Exec scripts over HTTP

```text
Dropped file: exec/scripts/api/build.ts
Endpoint:     POST https://{projectId}-{containerId}-exec.{server}.containers.hoody.com/api/build
CLI:          hoody exec api/build
SDK:          box.exec.*
```

```bash
curl -s -X POST \
  "https://${PROJECT_ID}-${CONTAINER_ID}-exec.${SERVER}.containers.hoody.com/api/build?branch=main"
```

---

## Auth — three shapes, one gotcha

```typescript
// Explicit: log in now and return a ready client.
const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
  username,
  password,
});

// Lazy: log in on first request and refresh when needed.
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  credentials: { username, password },
});

// Token-only: retain no password.
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: initialToken,
  onTokenExpired: async () => (await myAuthService.refresh()) ?? undefined,
});
```

`onTokenExpired` fires once per 401, adopts the returned token, and replays the request; concurrent 401s coalesce through one refresh. `await hoody.getAuthToken()` returns the current token, logging in first for a lazy client.

```typescript
// No account yet
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
await hoody.api.authentication.signup({ email, password });
```

```bash
hoody login --print-token # feed to the SDK or HTTP Authorization header
```

Never ship account credentials or an account-wide token to a browser or untrusted agent. Mint a short-lived, realm-scoped token with `hoody.api.authTokens.create(...)`.

---

## Recipes you'll actually reach for

Assume `hoody`, `container`, and `box` from [The model](#the-model-in-60-seconds). Every method below is verified against the generated surface.

### 1. Run a command

```typescript
const { stdout, stderr, exitCode } = await box.execute('npm test', {
  cwd: '/workspace',
  timeout: 30,
});
const shell = await box.shell(); // interactive Node/Bun stream
```

`box.execute(cmd, opts?)` uses a fresh ephemeral PTY, waits, and returns `{ stdout, stderr, exitCode, timedOut, duration, commandId }`. Options include `cwd`, `timeout` in seconds, `env`, `user`, and `serviceIndex`.

```bash
hoody run <container-id> -- npm test
hoody shell
```

### 2. Files

```typescript
const text = await box.files.get('/etc/hostname', { responseType: 'text' });
await box.files.put('/tmp/in.docx', bytes);
await box.execute('libreoffice --headless --convert-to pdf --outdir /tmp /tmp/in.docx');
const pdf = await box.files.get('/tmp/in.pdf', { responseType: 'arrayBuffer' });
const entries = await box.files.listDirectory('/workspace');
```

`box.files.get(path, options?)` takes the path first. Set `responseType` explicitly for binary data. Options also support glob, grep, and archive behavior. Confirm `files.put` request shapes in [docs/reference/namespaces/files.md](./docs/reference/namespaces/files.md).

```bash
hoody mount <container-id>:/data ./data # terminal-oriented access
```

Use the CLI/HTTP maps for generated file commands and direct paths.

### 3. Headless browser and GUI display

```typescript
const shot = await box.browser.interaction.takeScreenshot({
  browser_id: '1',
  url: 'https://hoody.com',
});

await box.display.input.clickAt({ x: 100, y: 200 }, { displayId: 1 });
// box.display.input.* also supports typing, dragging, batching, and window management

await box.terminal.execution.execute(
  { command: 'firefox https://hoody.com' },
  { terminal_id: '1', display: '1' },
);

const url = hoody.getKitUrl('display', container, 1);
const redirectUrl =
  hoody.getKitUrl('terminal', container) +
  `?terminal_id=1&display=1&cmd=${btoa('firefox https://hoody.com')}&redirect=display`;
```

```bash
hoody open display
hoody screenshot display --path ./display.png
hoody screenshot browser --path ./browser.png
```

The URL is the capability; gate it before showing it to users.

### 4. The built-in agent (claim-gated)

Bare `withContainer(container)` makes `box.agent.*` return `401 CLAIM_REQUIRED`. Mint and attach a signed claim:

```typescript
const mintKitAuth = async () => {
  const { data: authz } = await hoody.api.containers.authorize(container.id);
  return {
    type: 'containerClaim' as const,
    claim: JSON.stringify(authz!.container_claim),
    token: (await hoody.getAuthToken())!,
  };
};

const box = await hoody.withContainer(container, {
  kitAuth: await mintKitAuth(),
  onKitAuthExpired: mintKitAuth,
});

const created = await box.agent.sessions.createSession();
const sessionId = (created.data!.session_id ?? created.data!.id) as string;
const turn = await box.agent.sessions.promptSync(sessionId, {
  text: 'Run the tests and fix the first failure.',
});
```

`authorize()` returns `container_claim` as an object; stringify it. It does not return the bearer token; obtain that with `getAuthToken()`.

```typescript
import { streamAgentPrompt } from 'hoody-sdk';

const run = await streamAgentPrompt(hoody, {
  container,
  sessionId,
  text: 'Audit /workspace, run the tests, and summarize what changed.',
  policy: 'auto_approve',
});

for await (const delta of run.text) process.stdout.write(delta);
const result = await run.done;
```

Do not substitute `box.agent.sessions.promptStream()`: it returns a WebSocket client whose protocol differs from the agent daemon's SSE stream.

```text
CLI:  hoody agent agents create
HTTP: POST /api/v1/agent/agents
```

The generated agent surface exists in CLI and HTTP; look up each exact operation before calling it.

### 5. Exec scripts — drop a file, get an endpoint

```typescript
await box.exec.scripts.write({
  path: 'api/build.ts',
  content: src,
  createDirs: true,
});

const res = await fetch(
  hoody.getKitUrl('exec', container) + '/api/build?branch=main',
  { method: 'POST' },
);
```

Inside a dropped script, `req`, `res`, and `metadata` are ambient. See [docs/reference/namespaces/exec.md](./docs/reference/namespaces/exec.md).

```text
CLI:  hoody exec api/build
HTTP: POST https://{projectId}-{containerId}-exec.{server}.containers.hoody.com/api/build
```

### 6. Daemon, cron, and SQLite

```typescript
const launched = await box.daemon.quickStart.launch({
  user: 'user',
  command: 'claude --print "refactor src/"',
});
const logs = await box.daemon.quickStart.getEphemeralLogs(
  launched.data!.temporary_id,
);

await box.cron.entries.create('user', {
  schedule: '0 * * * *',
  command: 'backup.sh',
});

const rows = await box.sqlite.query.executeShareable({
  db: 'app',
  sql: btoa('select count(*) from users'),
});
```

`'user'` is the container's default Linux account, unrelated to your Hoody account or `hoody`. A CLI agent such as `claude` must already be on the container `PATH`. `box.syncAgentConfig('claude', { only: 'credentials' })` copies local credentials/configuration, not the binary. Use the command map for exact daemon, cron, and SQLite CLI equivalents.

### 7. Tunnels

Node/Bun only:

```typescript
import { tunnelExpose } from 'hoody-sdk';

const handle = await tunnelExpose({
  url:
    hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') +
    '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 80,
  to: { host: '127.0.0.1', port: 3000 },
});

console.log(handle.publicUrl);
await handle.close();
```

`tunnelExpose` connects laptop-to-public; `tunnelPull` connects container-loopback-to-local TCP; `tunnelServe` accepts a fetch handler. `box.tunnel.*` manages tunnel sessions.

### 8. Multi-tenancy in three calls

A realm id is any 24-hex string you generate. A realm exists by being attached to resources through `realm_ids`. The `external_customer` template cannot create projects, so first create one carrying the realm:

```typescript
const realmId = '507f1f77bcf86cd799439011';

const project = await hoody.api.projects.create({
  alias: 'acme-workspace',
  realm_ids: [realmId],
});

const created = await hoody.api.authTokens.create({
  alias: 'Customer: Acme',
  permission_template: 'external_customer',
  realm_ids: [realmId],
  allow_no_realm: false,
  ip_whitelist: ['203.0.113.0/24'],
  expires_at: '2026-12-31T00:00:00Z',
});

const acme = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: created.data!.token!,
}).withRealm(realmId);
```

A realm-scoped client sees only resources tagged with that realm. CLI uses global `--realm <id>`.

---

## The traps

**1 — No stdout from `box.terminal.execution.execute()`.** It returns immediately with `command_id`; poll `box.terminal.execution.getResult(command_id)`. Use `box.execute(cmd)` to wait for output or `hoody run <container-id> -- <cmd>` in a shell.

**2 — `401 CLAIM_REQUIRED` from `box.agent.*`.** Attach the claim from [recipe 4](#4-the-built-in-agent-claim-gated), or let `streamAgentPrompt` do it. Stringify the `container_claim` object; obtain the bearer token through `getAuthToken()`.

**3 — Request types are not exported.** Derive the body from the method:

```typescript
type CreateReq = Parameters<HoodyClient['api']['containers']['create']>[1];
```

Field names are exact. If TypeScript rejects one, inspect the generated signature instead of using `any`.

**4 — Argument order is not uniform.** Most methods are `(…path, data?, options?)`, but some put template variables before request options:

```typescript
box.daemon.quickStart.launch(data, _templateVars?, requestOptions?)
box.cron.entries.create(user, data, _templateVars?, requestOptions?)
```

If options seem ignored, inspect the actual signature.

**5 — Three Kit slugs differ from SDK namespaces.**

```text
notifications → n
proxyLogs     → logs
app           → run
```

Always use `getKitUrl()`. Raw ports use `hoody.getKitUrl('http', container, { port: 8080 })`, producing `http-8080`. `ssh` and `proxy` are unindexed; the default service index is `1`.

**6 — Cross-origin `Authorization` is stripped.** The SDK removes the account header when targeting a container host or other origin. Open kits need no token; agent needs its claim; proxy-protected kits use their configured credentials.

**7 — Realms scope by routing.** Per call, use `{ _realm: realmId }` in an account-method options bag; for the whole client, use `hoody.withRealm(realmId)`; CLI uses `--realm <id>`. `_realm` is a host-scope override. `realm_id` is an ordinary query parameter only where declared.

**8 — Tokens are shown once.** `authTokens.create(...).data.token` appears only at creation; `list` and `get` omit it. Capture and store it immediately.

---

## Errors, retries, redaction

```typescript
import { isApiError, isRetryableApiError } from 'hoody-sdk';

try {
  await box.files.get('/nonexistent');
} catch (err) {
  if (isApiError(err)) {
    err.status;
    err.code;
    err.response;
    err.request;
    if (isRetryableApiError(err)) {
      // Replay only when safe.
    }
  }
}
```

`ApiError` represents HTTP failures. `ValidationError` means the request shape failed before sending; fix rather than retry. `VaultCryptoError` comes from vault-crypto helpers. Use guards such as `isApiError`, not `instanceof`, across module boundaries.

Sensitive request headers, URL query values, and body fields are redacted before appearing on `err.request` or `err.url`. Server-provided `err.response` and `err.message` are not automatically sanitized.

```typescript
await box.files.get('/big', {
  retries: 5,
  retryDelayMs: 500,
  timeoutMs: 60_000,
  responseType: 'arrayBuffer',
});
```

Per-request overrides live in the trailing options bag. Direct HTTP clients should retry only replay-safe operations and preserve the response envelope when reporting errors.

**Response signing:** `X-Hoody-Signature` is a response header, not `.data`. Fetch the verification key from `GET /api/v1/meta/public-key`. Empty responses and streams may omit signatures; Kit routes are not signed like account API routes. Use `parseHoodySignatureFrom()` and `verifyHoodySignatureFrom()` from the package root.

---

## Look it up fast

Never guess. Generated source and shipped references are ground truth.

```bash
# Confirm operation by path or operationId
rg -n '"/api/v1/projects/.*/containers"|createProjectContainer' \
  generated/openapi.public.json

# Exact SDK signature
rg -n "async create\(" generated/api/containers.service.generated.ts

# Request/response types
rg -n "ApiContainersCreate(Request|Response)" generated/types.ts

# CLI command
rg -n "containers" docs/reference/CLI-COMMANDS.md

# HTTP ↔ SDK ↔ CLI mapping
rg -n "/api/v1/containers" docs/reference/HTTP-METHODS.md
```

If a snippet disagrees with generated signatures or references, generated source wins. Without a checkout, use [hoody.com/SKILLS/](https://hoody.com/SKILLS/) or [docs.hoody.com](https://docs.hoody.com).

| I need… | Where |
|---|---|
| SDK methods | [docs/reference/SDK-METHODS.md](./docs/reference/SDK-METHODS.md) |
| CLI commands | [docs/reference/CLI-COMMANDS.md](./docs/reference/CLI-COMMANDS.md) |
| HTTP path ↔ SDK method ↔ CLI command | [docs/reference/HTTP-METHODS.md](./docs/reference/HTTP-METHODS.md) |
| Per-namespace guides | [docs/reference/namespaces/](./docs/reference/namespaces/_INDEX.md) |
| Exact SDK signatures | `generated/<ns>/*.service.generated.ts` |
| Request/response fields | `generated/types.ts` |
| Raw HTTP contract | `generated/openapi.public.json` or `generated/openapi.public.yaml` |
| Namespace/method counts | [docs/reference/SUMMARY.md](./docs/reference/SUMMARY.md) |
| Real-time events | `EventsClient`, `EventsManager`, and `hoody.api.events.*` |
| Vault crypto | `encrypt`, `decrypt`, `parseEnvelope` |
| WebSocket-multiplexed fetch | `createCurlFetch`; `box.curlChannel()` supplies its channel |
| Terminal, agent, tunnel, signing, and redaction helpers | `lib/` |

SDK namespaces are one account scope (`hoody.api`) plus 18 container scopes:

```text
terminal · files · browser · display · code · exec · daemon · cron
watch · sqlite · curl · pipe · app · notes · notifications · tunnel
proxyLogs · agent
```

---

## Accuracy discipline — do / don't

- **Do** use SDK for programmatic TS/JS work, CLI for terminal work, and HTTP or CLI for agents and other languages.
- **Do** translate among SDK methods, CLI commands, and paths through the HTTP map.
- **Do** snapshot before releasing an agent: `hoody.api.containers.createSnapshot(id, {...})`; `restoreSnapshot(id, name)` is the undo.
- **Do** treat container ids, structural URLs, claims, and tokens as secrets.
- **Do** use `-o json` for CLI automation; it unwraps the envelope and pipes cleanly to `jq`.
- **Don't** send an account bearer token to a container URL.
- **Don't** hand-build Kit domains; use `getKitUrl()` in SDK code and the reference map elsewhere.
- **Don't** use `as any` to force an SDK call to compile; re-check the generated signature.
- **Don't** infer CLI commands or HTTP paths from English names; look them up.
- **Don't** edit `generated/`, `dist/`, or `cli/dist/` to make application code work.
