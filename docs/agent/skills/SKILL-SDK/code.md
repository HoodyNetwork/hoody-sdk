> _**SDK skill · `code` namespace** · ~6,748 tokens · hoody-sdk v1.0.0-beta.17_

# `code` — VS Code in the browser, per container

## Purpose

**This is the VS Code IDE running in a browser tab — not a programmatic API.** Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/` and you get the full editor: file tree, diff view, debugger, terminals, extensions marketplace, all backed by the container's filesystem. The `code-N` URL is served by an **orchestrator** that starts one isolated editor instance per index and returns a page that embeds it. The index is the hostname: `code-1` is instance 1, `code-2` is instance 2, each with its own settings, state and running process.

On a `code-N` host the platform's edge fills in the two parameters the entry page needs. It sets the instance selector `id` from the hostname, overwriting anything the caller sent, and it sets `folder` to the container's default workspace when the request names none. Add `?folder=<abs-path>` to open a different folder. Talking to a bare kit server with no edge in front of it, a client must send both `folder` and `id` itself: with neither the entry path returns the kit specification, with only one it returns `400`.

The methods in this namespace read the service's state (health, running instances, versions), stop editor instances, stage extensions and confirm what an instance has installed, and build embed URLs. Day-to-day use is "open the URL".

Like every Hoody kit URL, `code` is **iframable**: drop the `code-N` URL into an `<iframe>` and you've embedded VS Code in your own page. Same for every other kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of Hoody kit iframes with no native code, just URLs and standard CSP / cookie wiring.

**Headline mode: extension-only embed.** Add `?extension=<publisher>.<name>` and the editor hides its chrome and opens that extension's **sidebar view** filling the viewport. It works for an installed extension that contributes a sidebar view (an Activity Bar panel); when no sidebar view of that extension can be found, even after activating it, the editor falls back to the file explorer. Pair such an extension with the iframable kit URL and you have:

- A coding agent (e.g. **Cline** — `saoudrizwan.claude-dev`) accessible from any browser, including mobile phones with no IDE installed.
- The same agent embedded into your own dashboard, a docs site, a Notion page, a Slack canvas (URL preview), a CRM, or any other HTML surface.
- A focused tool surface from any other extension with its own sidebar view (Continue, Roo Cline, GitLens, …) without exposing the full editor. An extension that only adds editors, commands or previews has no sidebar view to open.
- A branded deployment: point a proxy alias at the `code` service and hand out the alias URL instead of one that carries the `containerId` (Example 7).

The container's filesystem still backs the extension (it can edit files, run terminals, hit the network, etc.) — same persistent state as the full IDE. To run two single-extension surfaces side by side, give each its own instance through its own hostname: Cline on `code-1`, Continue on `code-2`.

## When to use

- **Humans editing code**: hand the user the URL — that's the whole product.
- **Single-extension embed for an agent or tool** — `?extension=<publisher>.<name>` opens that extension's sidebar view full-screen; iframable, mobile-friendly, distributable behind a proxy alias.
- Pre-open a folder with `?folder=<abs-path>`, so the URL is bookmarkable.
- Stage a custom VSIX with `extensions.install`, then confirm with `extensions.list` that an instance actually installed it.
- Read which editor instances are running (`kit.getStatus`) and which orchestrator and editor builds are deployed (`kit.getVersion`).

## When NOT to use

Not for: non-interactive shell → `terminal`/`exec`, file I/O without a UI → `files`, long-lived processes → `daemon`, headless web → `browser`, exposing a dev server that runs in the container → a proxy alias with program `http` and its port (see the `api` namespace). Not a coding-agent control plane → `agent` (the typed in-container AI-agent HTTP namespace, slug `agent`; the Hoody Agent browser GUI on the same `-agent-1` host is the human surface).

## Prerequisites

- A running container. Set `P`, `C`, `N` (project id, container id, server name) from `containers.get`.
- Address the service through its `code-N` URL. That hostname selects the instance. The generated SDK sends no `id` unless you pass one.  An SDK client pointed at a bare kit server passes `id` itself.
- VSIX staging needs a downloadable `.vsix` URL that the service may fetch: `http` or `https`, no credentials in the URL, and not an address inside the container or on a private network.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

## Common workflows

### 1. Open the editor on a folder

1. Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>`. Leave `folder` out to open the container's default workspace.
2. To switch folders, open the same URL with another `folder`. A running instance is reused, and the page loads the editor on the folder the request names. `kit.getStatus` keeps reporting the folder the instance was started with. Add `restart=true` only when you mean to restart the instance's process.

### 2. Embed a single extension (single-tool browser surface)

1. Make sure the extension is installed in that instance: stage it (workflow 3) or install it in the editor.
2. Open or iframe `https://{P}-{C}-code-1.{N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<abs-path>`. `client.embeds.code.extension` builds the same URL without sending a request.
3. Brand it with `proxy.aliases.create` (program `code`, the landing query in `target_path`) and gate it with `proxy.containerPermissions.*` before sharing.

### 3. Stage a VSIX, apply it, confirm it installed

1. `extensions.install` with the `.vsix` URL. A success means the file is staged, not installed: the response reports `requiresRestartToApply: true` and `appliesAt: "next-instance-start"`. 
2. Start or restart the instance that should have it (open its URL with `restart=true`). Staging is shared across instances, so every instance installs it at its next start.
3. `extensions.list` and read `observed`: `status: "running"` means the instance is running and the version it has installed is the staged one. It compares version numbers only; it does not show that the extension activated.

### 4. Inspect instances and versions

1. `kit.getStatus` lists the running instances (id, port, folder, uptime) and the orchestrator's `basePort`.
2. `kit.getVersion` reports the orchestrator build and the packaged editor tree separately.

### 5. Stop an editor instance and release capacity

Stop an instance you no longer need: it ends its editors, integrated terminals, tasks and extension host, and keeps its settings, installed extensions and workspace state for its next start.

Call `client.code.stop({ id: N })` on the container client.

A `200` means the instance's process has exited; `404` with `unknown-instance` means it was not running.

## Quirks & gotchas

- On a `code-N` host the edge sets `id` from the hostname and overwrites a caller's value, so a query-string `id` cannot pick another instance. `code-0` is treated as `code-1`.
- The edge fills `folder` with the container's default workspace only when the request carries no `folder`; an explicit `folder` wins.
- A request with a different `folder` for a running instance reuses that instance and its page loads the editor on the requested folder; no restart is needed. The instance keeps the folder it was started with as its own, which is the one `kit.getStatus` reports. `restart=true` kills and respawns the instance.
- The entry path forwards only the query parameters it declares (`?folder`, `?id`, `?extension`, `?restart`, `?page-loader`, `?disable-walkthroughs`, `?hoody-code`, `?welcome-iframe-url`, `?page-loader-path`, `?proxy-domain`, `?locale`, `?app-name`) and drops any other name without reporting it.
- The query string on the entry path is capped at 8192 bytes; a longer one is answered `400` and starts nothing.
- The page embeds the instance from the container's `http-<port>` host, where the port is `basePort + id`. `basePort` is deployment configuration: read `orchestrator.basePort`, or the instance's own `port`, from `kit.getStatus` instead of assuming a number. That host is editor transport, not part of the kit API.
- Staging is not installation. The editor installs staged extensions only while an instance starts, and the stage directory is shared, so one stage reaches every instance at its next start.
- A stage that lands while an instance is starting can be installed with one version's details and another's contents. `extensions.list` reads only the installed version number, so it may not reveal that pairing; restarting the instance installs whatever is staged then. Stage before starting an instance.
- `extensions.list` keeps `desired` (what is staged) and `observed` (what this instance appears to have) apart. A section that could not be read reports `status: "unavailable"` and has no `extensions` key at all, and `partial` is then true.
- An observed entry's `status` is `running` (the instance is running and its installed version equals the staged version, or the extension is installed with nothing staged for it), `stale` (normal between a stage and the next start), `failed` (started after the stage and still lacks it), `stopped` or `unavailable`. `running` is a version comparison, not proof that the extension activated. Match entries on `logicalKey`, the lowercased `publisher.name`.
- `allowDowngrade` is off by default, so a restage cannot silently roll an extension back; a refused downgrade is `409`.
- `kit.getVersion` reports the orchestrator and the packaged editor as two figures because they are built and deployed separately. It never contacts the network and there is no update check.
- `kit.getHealth`, `kit.getStatus` and `kit.getVersion` take no query parameters; an `id` sent to them changes nothing.
- Building an extension-only URL does not open the editor or start an instance. `client.embeds.code.extension` builds it locally, with no request, and adds `folder` and `locale` only when you pass them in `params`. 
- `kit_slug` always `code`.

## Common errors

- `429` HTML page from the entry path — starting another instance would pass the instance limit this deployment is configured with (none by default). Nothing was started; stop an instance you do not need (workflow 5), then retry. An already running instance is still served at the limit.
- `403` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON. Use the `code-N` URL.
- `400` HTML page from the entry path: exactly one of `folder` and `id` carried a value, `id` is not an unsigned decimal integer or was sent twice, `id` exceeds `65535 - basePort`, or the query is over 8192 bytes. Only a bare kit server hits the first case; behind the edge both are filled.
- `409` from the entry path: the instance's port is held by a process the orchestrator did not start. Retrying does not help until it is released.
- `503` from the entry path: the instance did not finish starting in time. Worth retrying.
- `extensions.install` errors carry a stable `error` code: `destination-refused` (`403`, the URL is outside the fetch policy), `downgrade-refused` (`409`), `not-a-vsix` (`422`), `upstream-error` (`502`, may be retried), `upstream-timeout` (`504`), `installs-at-capacity` (`503`, honour `Retry-After`), `insufficient-storage` (`507`), `extension-too-large` (`413`, the archive is over the size limit). Branch on `error`, not on the message.
- Either extensions operation can return `invalid-selector` (`400`, an `id` the service cannot parse) or `internal-error` (`500`). Only `extensions.install` reads a request body, so only it returns `invalid-request` (`400`, malformed body or `url`), `unsupported-media-type` (`415`, body not sent as `application/json`) and `request-too-large` (`413`, body over the limit).
- `404` with `error: "unknown-instance"` from either extensions operation means the service has no extensions directory configured, despite the code's name; retrying with another instance id does not help. An instance that was never started lists as `stopped`, not 404.
- `503` from `extensions.list` carries the normal result body with `desired.status: "unavailable"`: the staged set could not be read, and `observed` is still reported.

## Related namespaces

→ `terminal`, `files`, `exec`, `browser`, `daemon`, `api` (proxy aliases and permissions).

## Examples

`code` is a **URL-first** namespace — for most workflows the kit URL itself (with the right query string and / or iframe wrapper) IS the deliverable. The methods here read state, stage extensions and build URLs; they do not drive the editor. Each example below is a copy-pasteable recipe in the mode you're reading. URL-composition steps are pure string templates and need no kit call. Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

### 1. Open the editor with a folder pre-loaded — bookmarkable URL

**Goal:** ship a teammate a single URL that opens VS Code already pointing at the right repo.

```typescript
const url = `https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=${encodeURIComponent('/home/user/myrepo')}`;
console.log(url);
```

### 2. Extension-only embed — open one extension's sidebar view

**Goal:** open `code-1` as a single extension's panel — the editor chrome is hidden and the extension's sidebar view fills the viewport. Pair it with a folder so the extension opens with the right repo selected. The extension must be installed in that instance and contribute a sidebar view; otherwise the file explorer opens instead.

URL pattern (no kit call):

```
https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<absolute-path>
```

```typescript
// Pure URL builder — no request is made. The target is the scoped container
// (omitted on a withContainer() client); the edge picks the instance from the
// code-N hostname.
const url = client.embeds.code.extension(undefined, {
  params: { extension: 'saoudrizwan.claude-dev', folder: '/home/user/myrepo' },
});
```

Name the extension as `publisher.name`, no version. `client.embeds.code.extension` throws on any value that does not match `^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$`. A second surface (say Continue, `continue.continue`) goes on its own instance: build the same URL on `code-2`.

### 3. Open another folder on a running instance

**Goal:** instance 1 is open on `/home/user/myrepo` and you want the editor on `/home/user/other`. Open the same instance URL with the new `folder`: the running instance is reused and the page loads the editor on that folder. `kit.getStatus` keeps reporting the folder the instance was started with.

```typescript
const url = `https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=${encodeURIComponent('/home/user/other')}`;
```

Add `restart=true` only when the process itself must restart, for example to apply a staged extension (Example 4). Restarting ends that instance's running editor session, including its terminals. Other instances are untouched.

### 4. Stage a custom VSIX and confirm it installed

**Goal:** push an internal extension (`.vsix`) into the editor and confirm the instance has it installed.

**Step 1 — stage it.**

```typescript
const staged = (await client.code.extensions.install({
  url: 'https://example.com/acme.internal-tools-1.2.3.vsix',
})).data;
console.log(staged.outcome, staged.appliesAt, staged.extension.logicalKey);
```

**Step 2 — apply it** by starting or restarting the instance: open its URL with `restart=true`. Every other instance picks it up at its own next start.

**Step 3 — confirm.** The observed entry reports `status: "running"` when the running instance has the staged version installed. This compares version numbers; it does not show that the extension activated.

```typescript
const list = (await client.code.extensions.list()).data;
const entry = list.observed.extensions?.find(e => e.logicalKey === 'acme.internal-tools');
console.log(list.observed.status, entry?.status, entry?.installedVersion);
```

`stale` right after a stage is normal; `failed` means the instance started after the stage, had time to install it, and still does not have it. If `observed.status` is `unavailable` there is no `extensions` array and nothing can be concluded from it.

To install without the API: drop the VSIX on the container filesystem through the `files` namespace and use the editor's Extensions view → `…` menu → "Install from VSIX…".

### 5. Which instances are running, and which builds

**Goal:** see what the service is doing before you restart anything.

```typescript
const status = (await client.code.kit.getStatus()).data;
for (const i of status.instances) console.log(i.id, i.port, i.folder);
const version = (await client.code.kit.getVersion()).data;
console.log(version.orchestrator.version, version.editor.vscodeVersion);
```

An instance that has not been opened since the service started is simply absent from `instances`.

### 6. Health check + extension verify — post-deploy smoke test

**Goal:** after a container rebuild, confirm the `code` service is up AND instance 1 has the extension you ship installed at the staged version. This is a service-health and installed-version check; it does not prove the extension activated.

```typescript
const health = (await client.code.kit.getHealth()).data;
if (health.status !== 'ok') throw new Error('service unhealthy');
const ext = (await client.code.extensions.list()).data;
const live = ext.observed.extensions?.some(
  e => e.logicalKey === 'saoudrizwan.claude-dev' && e.status === 'running',
);
if (!live) throw new Error('extension not installed on instance 1');
```

An instance that has not started since the rebuild reports every entry as `stopped`, including a staged version it has not installed yet; a running instance that has not installed the stage reports `stale` (`failed` if it started after the stage and its install grace has passed). Open the instance's URL once before the check.

### 7. Embed the editor in your own page, behind a branded URL

**Goal:** ship a dashboard / docs site / Notion-style canvas with VS Code (or a single extension) embedded as a panel.

```html
<!-- Full editor, with a folder pre-loaded -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/home/user/myrepo"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write; cross-origin-isolated"
></iframe>

<!-- Single extension only (no IDE chrome) — Cline as a service -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/home/user/myrepo"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write"
></iframe>
```

To keep the `containerId` out of the iframe `src`, create a proxy alias on the `code` service with the landing query as its `target_path`, and use the URL the call returns. Leave `id` out of the target: the alias's `index` picks the instance, and a target query naming `id` is refused with `404 ALIAS_TARGET_QUERY_FORCED_KEY`. The `folder` (and `extension`) in the target is a landing preference only: the editor opens there, but it does not confine the session, and anyone using the editor can open any other folder the container user can read.

```typescript
const alias = await client.api.proxy.aliases.create({
  container_id: C,
  program: 'code',
  index: 1,
  alias: 'agent',
  target_path: '/?extension=saoudrizwan.claude-dev&folder=/home/user/myrepo',
});
```

Gate the alias with `proxy.containerPermissions.*` before sharing it (see the `api` namespace). The same iframe pattern works for **every** Hoody kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …).

## Reference

**Accessor:** `client.code`  |  **Import:** `import * as code from 'hoody-sdk/code'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.code` (1) — VS Code web interface

#### `stop` — Stop an editor instance

```typescript
client.code.stop(options?: { id?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | query | No | Which instance to stop. On a `code-{N}` service URL the edge proxy sets it from the hostname and overrides any value sent, so a caller there neither needs to send it nor can change it. It is required: there is no default instance to stop, so a request without it is answered `400`. Read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. |

**Returns:** `Promise<CodeStopResponse>`  |  **HTTP:** `DELETE /api/v1/code`
**CLI:** `hoody code stop`

---

### `client.code.extensions` (2) — Extension staging and inspection

#### `install` — Stage a VS Code extension from a URL

```typescript
client.code.extensions.install(data: CodeExtensionsInstallRequest, options?: { id?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | query | No | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. Where it comes from: On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. It is required because there is no discovery branch here to fall back to: a request without an `id` has named no instance and is answered `400`. |
| `data` | `CodeExtensionsInstallRequest` | body | Yes |  |

**Body:** `{ url*: string, allowDowngrade: bool=false }`

- `allowDowngrade` — Permit replacing a staged version with an older one. Refused by default so a routine restage cannot silently roll an extension back.

**Returns:** `Promise<CodeExtensionsInstallResponse>`  |  **HTTP:** `POST /api/v1/code/extensions/install`
**CLI:** `hoody code extensions install`

---

#### `list` — Staged extensions, and what the instance appears to have installed

```typescript
client.code.extensions.list(options?: { id?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | query | No | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. Where it comes from: On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. It is required because there is no discovery branch here to fall back to: a request without an `id` has named no instance and is answered `400`. |

**Returns:** `Promise<CodeExtensionsListResponse>`  |  **HTTP:** `GET /api/v1/code/extensions/list`
**CLI:** `hoody code extensions list`

---

### `client.code.kit` (3) — Health, version and status monitoring

#### `getHealth` — Service health check

```typescript
client.code.kit.getHealth()
```

**Returns:** `Promise<CodeKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/code/health`
**CLI:** `hoody code health`

---

#### `getStatus` — Get orchestrator and instance status

```typescript
client.code.kit.getStatus()
```

**Returns:** `Promise<CodeKitGetStatusResponse>`  |  **HTTP:** `GET /status`
**CLI:** `hoody code status`

---

#### `getVersion` — Versions of the running orchestrator and its packaged editor

```typescript
client.code.kit.getVersion()
```

**Returns:** `Promise<CodeKitGetVersionResponse>`  |  **HTTP:** `GET /api/v1/code/version`
**CLI:** `hoody code version`

---

### `client.code.ui` (4) — Static assets and descriptors served by this host

#### `getFavicon` — Site icon

```typescript
client.code.ui.getFavicon()
```

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /favicon.ico`

---

#### `getManifest` — Web application manifest for installing the editor

```typescript
client.code.ui.getManifest()
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/code/manifest.json`

---

#### `getRobots` — Crawler policy

```typescript
client.code.ui.getRobots()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /robots.txt`

---

#### `getSecurityPolicy` — Security contact information

```typescript
client.code.ui.getSecurityPolicy()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /security.txt`

