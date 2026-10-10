<p align="center">
  <picture> 
    <source media="(prefers-color-scheme: dark)" srcset="./assets/hoody-logo-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/hoody-logo-black.svg">
    <img alt="Hoody" src="./assets/hoody-logo-black.svg" width="240">
  </picture>
</p>

<p align="center"><strong>Everything is a URL.</strong></p>

<p align="center"><em>Durable Linux containers, every capability as a typed HTTP API.</em><br/>
<em>terminal, files, cloud browser, GUI display, AI agent, cron, and tunnels, callable from Node.js, Bun, Deno, or a plain browser tab. No proxy server or backend of your own to run.</em></p>

<p align="center">
  <a href="https://www.npmjs.com/package/hoody-sdk"><img src="https://img.shields.io/npm/v/hoody-sdk.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="license Apache-2.0"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg" alt="TypeScript 5.0+">
  <img src="https://img.shields.io/badge/runtime-Node.js_%7C_Bun_%7C_Deno_%7C_Browser-green.svg" alt="Node.js | Bun | Deno | Browser">
</p>

<p align="center">
  <a href="https://hoody.com/signup"><b>Get a free server &rarr;</b></a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com">Website</a> &nbsp;&middot;&nbsp;
  <a href="https://docs.hoody.com">Docs</a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com/SKILLS/">AI Skills</a>
</p>

---

TypeScript SDK for [Hoody](https://hoody.com). Hoody runs full Linux containers and exposes their terminal, files, browsers, AI agent, GUI display, cron, databases, notifications, and tunnels through one typed HTTP API, callable from Node.js, Bun, Deno, a browser, or any network device (including IoT devices). You build on stable primitives: the client, auth model, and URL layout do not change as your product grows. Think of it as **"Linux as HTTP".**

| | |
|---|---|
| **Batteries included** | Create a container with the Kit (`hoody_kit: true`) and the full service layer is available at stable HTTPS URLs: shell, files, cloud browser, GUI desktop, databases, cron, tunnels, and a built-in AI agent, each starting on demand with the first call. |
| **Who it's for** | Cloud IDEs, AI-agent platforms, browser-automation pipelines, remote-desktop products, and education: anything that needs a real Linux environment on demand without running the infrastructure. |
| **The economics** | Flat-rate bare metal: a dedicated machine, marketplace-priced from ~$30/month, with no per-container fee or usage meter. Run dev through prod for every project on one box. [How ↓](#bare-metal-underneath) |
| **The surface** | <!-- ref:sdk-namespaces -->21<!-- /ref:sdk-namespaces --> namespaces · <!-- ref:sdk-methods -->1212<!-- /ref:sdk-methods --> typed SDK methods · <!-- ref:cli-commands -->1046<!-- /ref:cli-commands --> CLI commands, with one client, one URL grammar, and every auth mode handled by the SDK. |

**Prefer references?** Nearly the whole surface fits in three lists: [CLI commands](./docs/reference/CLI-COMMANDS.md) · [SDK methods](./docs/reference/SDK-METHODS.md) · [HTTP endpoints](./docs/reference/HTTP-METHODS.md). The HTTP list maps every endpoint to its SDK method and to a CLI command wherever one exists.

**At a glance.** One account client (`hoody.api.*`) plus twenty container-scoped `box.*` Kit namespaces:

`terminal` · `files` · `browser` · `display` · `code` · `exec` · `daemon` · `cron` · `watch` · `sqlite` · `curl` · `egress` · `pipe` · `run` · `notes` · `notifications` · `tunnel` · `proxyLogs` · `agent` · `bot`. [Full table ↓](#namespaces)

> **Reading this as an AI agent?** Install the skill:
>
> ```bash
> npx skills add https://hoody.com/SKILLS/SKILL.md   # the skill; deeper docs fetched on demand
> npx skills add HoodyNetwork/hoody-sdk              # same skill + the whole corpus on disk (offline)
> ```
>
> Or fetch the machine-readable Skills at [hoody.com/SKILLS/](https://hoody.com/SKILLS/), a structured HTTP map of every capability below. Three facts: request methods resolve by default to a `{ statusCode, message, data }` envelope (payloads live on `response.data`; streaming, WebSocket, and iterator helpers return their own types, and `rawResponse: true` skips envelope normalization and returns the parsed body directly); the snippets are real, verified calls; and [One client, two scopes](#one-client-two-scopes) defines their `hoody` / `box` convention. Building from a clone? [**AGENTS.md**](./AGENTS.md) is the 10-minute guide to driving this SDK with an agent.

<details open>
<summary><b>Contents</b></summary>

- **Start here.** [Everything is a URL](#everything-is-a-url) · [Installation](#installation) · [Quickstart](#quickstart)
- **Concepts.** [Core concepts](#core-concepts) ([one client, two scopes](#one-client-two-scopes) · [URL anatomy](#anatomy-of-a-hoody-url) · [open by default](#containers-are-open-by-default) · [bare metal](#bare-metal-underneath) · [self-host](#self-host-anything-durably) · [authentication](#authentication))
- **Build.** [What you can build](#what-you-can-build) ([no backend](#your-backend-is-optional) · [CLI agents](#run-claude-code-or-any-cli-agent-and-drive-it-over-http) · [LLM shell](#give-an-llm-a-real-bash-terminal) · [GUI streaming](#stream-any-gui-app-as-a-url) · [Linux tools](#use-real-linux-tools-over-http) · [tunnels](#reverse-tunnel-localhost-to-a-public-url) · [built-in agent](#the-built-in-agent) · [everything else](#everything-else-in-the-box)) · [Build your platform on Hoody](#build-your-platform-on-hoody) ([multi-tenancy](#give-your-own-users-their-own-hoody-api)) · [Aliases and custom domains](#aliases-and-custom-domains) ([custom domains via CNAME](#custom-domains-via-cname)) · [Drop a script, get an endpoint](#drop-a-script-get-an-endpoint)
- **Trust.** [Security model](#security-model)
- **Reference.** [Namespaces](#namespaces) · [Error handling](#error-handling) · [TypeScript](#typescript) · [Retry, middleware, token refresh](#retry-middleware-token-refresh)
- **Everywhere.** [Every front door](#every-front-door) · [CLI](#cli)
- **Meta.** [API reference](#api-reference) · [Versioning & support](#versioning--support) · [License](#license)
</details>

## Everything is a URL

A Hoody container is a full Debian Linux machine with systemd, `apt`, its own filesystem and process tree, and a boot time measured in seconds. Create it with the **Kit** service layer preinstalled (`hoody_kit: true`, as the [Quickstart](#quickstart) does), and each service below gets a stable HTTPS URL once the container is running. Services load on demand with the first call:

```text
https://{projectId}-{containerId}-{service}-{index}.{server}.containers.hoody.com
```

Each URL below is a building block, already running and wired together when the container exists:

| `{service}` | What answers there | The wheel you never rebuild |
|---|---|---|
| `terminal` | A real bash shell | No SSH keys, `sshd`, or PTY plumbing; run and stream commands over HTTPS. |
| `display` | A live GUI desktop | Stream any X11 app to a browser tab; no VNC server or RDP gateway to stand up. |
| `browser` | A cloud Chromium, driven by API *or* watched live in the URL | Scrape and automate without hosting a Selenium/Playwright grid or a rendering box. |
| `code` | VS Code in the browser | A full IDE per container; no workspace server to deploy. |
| `agent` | A built-in AI coding agent | Claude & co. driving the machine over HTTP; no agent runtime to build. |
| `files` | The filesystem | Read, write, glob, grep, WebDAV, 60+ cloud backends, with no SFTP daemon or storage SDK. |
| `sqlite` | SQL + a KV store | A per-container database with zero setup; nothing to provision or connect. |
| `notes` | Collaborative docs | Real-time multiplayer editing; no CRDT/OT sync layer to write. |
| `daemon` | A process supervisor | Long-running programs with restarts and logs; no systemd unit or pm2 wiring. |
| `cron` | A scheduler | Recurring jobs over HTTP; no crontab access or job runner to host. |
| `exec` | Your scripts as endpoints | Drop a file, get an authenticated HTTPS endpoint; no function platform. |
| `watch` | Filesystem watchers | React to file changes as events; no inotify plumbing. |
| `curl` | Outbound HTTP jobs | Fetches and webhooks that run from inside the container; no worker queue. |
| `pipe` | Streaming channels | Pub/sub and byte streams between clients; no message broker to run. |
| `tunnel` | Reverse tunnels | Publish localhost or a container port to a public URL; no ngrok. |
| `egress` | An outbound proxy | Route a client's traffic out through the container, or through an upstream you choose; no proxy server to deploy. |
| `n` | Push notifications | Deliver alerts out of the container; no notification service to wire up. |

The grammar stays the same; bump the `{index}` for a second terminal or display ([full anatomy](#anatomy-of-a-hoody-url)). The one exception is `egress`, whose canonical URL carries no index (`https://{projectId}-{containerId}-egress.{server}.containers.hoody.com`). Nothing needs wiring first: no SSH keys, VNC ports, SFTP daemon, reverse-proxy config, or certificates. Every URL is HTTPS, with HTTP/2 and HTTP/3 negotiated automatically. Destroy the container and its URLs disappear with it. Because they are ordinary URLs, sharing one shares the resource, making the URL itself the credential ([why that's the default, and how to gate it ↓](#containers-are-open-by-default)).

Anything *you* run also becomes a URL when it binds a port. Start a server on `:8080` and it is live at the container's `http-8080` subdomain without an alias, firewall edit, proxy registration, port forwarding, or ngrok. Gate it with [permission rules](#containers-are-open-by-default), or front it and any `exec` script with an [alias or your own domain](#aliases-and-custom-domains); otherwise, it answers directly.

Launch Firefox in the cloud, open its live window, then drive it over HTTP:

```typescript
import { HoodyClient } from 'hoody-sdk';

const hoody     = await HoodyClient.login('https://api.hoody.com', { username, password });
// Any running Kit container works (after containers.create, poll containers.get(id) until status === 'running'):
const found     = (await hoody.api.containers.list()).data?.containers
  ?.find(c => c.status === 'running' && c.hoody_kit);
if (!found?.id || !found.project_id) throw new Error('No running Kit container yet');
const container = { ...found, id: found.id, project_id: found.project_id };
const box       = await hoody.withContainer(container);

// Launch Firefox on virtual display :1 inside the container…
await box.terminal.commands.run(
  { command: 'firefox https://hoody.com', wait: false },   // wait:false — don't block on the long-running GUI process (run() waits for completion by default)
  { terminal_id: '1', display: '1' },   // a GUI session on virtual display :1
);

// …and the running window is now a URL. Open it on any device. Embed it in an <iframe>.
console.log(hoody.getKitUrl('display', container, 1));
// → https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com

// The same window takes input over HTTP — type into the URL bar, press Enter, screenshot:
await box.display.input.type({ x: 640, y: 63, text: 'github.com' }, { displayId: 1 });
await box.display.keyboard.press({ keys: ['Return'] }, { displayId: 1 });
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
if (!shot.data || !('image' in shot.data)) throw new Error('Expected a base64 screenshot');
const livePng = shot.data.image.dataUrl;   // the live desktop, ready for <img src>
```

Pull cloud storage *into* the container and it becomes an ordinary directory. This example uses MEGA, one of 60+ rclone backends (S3, Drive, Dropbox, SFTP, …):

```typescript
// Connect the backend once, then FUSE-mount it (the container's files kit must allow remote backends):
const mega = await box.files.backends.createMega({ user: 'you@example.com', pass: '…' });
await box.files.mounts.create({ backend_id: mega.data.data.id, mount_path: '/hoody/mounts/mega' });
// Every process in the container — and every box.files.* call — now sees /hoody/mounts/mega.
```

…or mount the container's filesystem on your laptop, where it appears in Finder/Explorer. This needs `rclone` and the local platform driver: FUSE on Linux/macOS or WinFsp on Windows. The CLI form is `hoody mount <containerId>:/data ./data`:

```typescript
import { mount } from 'hoody-sdk/mount';

const drive = await mount({
  container,
  client: hoody,              // the kit URL is built on this client's API domain
  subpath: '/home/user',      // the container's default Linux account (uid 1000)
  localPath: './hoody-drive',
  background: true,           // detached mount — Linux/macOS only (throws on Windows;
                             // there, omit it and run the mount in its own terminal)
});
// ./hoody-drive now *is* the container's home directory. drive.unmount() when you're done.
```

A file you change is uploaded whole once it has been closed and idle for about 1 s. If the file on the kit is a version your mount never received (another machine or the container changed it in the meantime), the files kit keeps that version as a conflict copy next to the file (`report (conflict <host> <time>).txt`) and your upload lands at the name; neither side gets an error and neither version is lost (safe save). Conflict copies stay until you delete them. A change made elsewhere shows up at the next lookup once it has landed and the mount's 5 s directory cache has expired; a program that already has the file open may keep its old view. `hoody mount --help` covers the details and the cases safe save does not cover.

The box also includes an AI agent, on the same `box` client and the same container URL as every other kit:

```typescript
// Optional — bring your own model key (stored 0600 inside the container):
await box.agent.providers.setApiKey('anthropic', { api_key: process.env.ANTHROPIC_KEY! });

// Create a session and prompt it. The agent runs *on* the machine it edits.
const sess      = (await box.agent.sessions.create()).data!;
const sessionId = sess.session_id;
if (!sessionId) throw new Error('Agent session creation returned no session_id');
await box.agent.sessions.turns.run(sessionId, {
  text: 'Clone github.com/you/app, run the tests, and fix the first failure.',
});
```

Anything you start on a port is already available over public HTTPS, with no proxy, certificate, or ngrok setup of your own:

```typescript
await box.daemon.ephemeralPrograms.start({ user: 'user', command: 'python3 -m http.server 8080' });  // a supervised server…
console.log(hoody.getKitUrl('http', container, { port: 8080 }));                                 // …already answering here
// → https://{projectId}-{containerId}-http-8080.{server}.containers.hoody.com
```

`hoody` manages your account (create, list, and destroy containers); `box` manages one container's services (terminal, files, browser, display, agent, …). Typed methods wrap every URL.

## Installation

> **Requires** Node.js 20.3 or later, Bun, or Deno; the browser build has no runtime requirement. Node.js 22 or later
> is recommended: Node.js 20 is end-of-life and gets no more security fixes from the Node.js project.
>
> On Node.js releases whose built-in WebSocket is affected by CVE-2026-12151 (before 22.23.0, all of 23 and 25, 24
> before 24.17.0, 26 before 26.3.1) the SDK opens its WebSockets with the `ws` package instead. Upgrading Node.js is
> still recommended. This covers the sockets the SDK opens itself: a `webSocketFactory` or socket.io transport you
> supply, and a global `WebSocket` your application replaces, are yours to keep current.
>
> Before Node.js 22.19 the SDK sends its HTTP requests through Node's built-in `fetch`, which ends a request after 300
> seconds, and a configured proxy is refused with an error instead of being ignored.
>
> On Node.js 20.3 to 22.18 npm prints an engine warning for `undici`, which the SDK does not load there (it uses Node's
> built-in `fetch`); installs with `engine-strict=true` need Node.js 22.19 or later. CLI proxy settings (`--proxy`,
> `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`, the config `proxy` key) need Node.js 22.19 or later or the standalone
> binary; on older Node.js, with a proxy configured, requests stop with `PROXY_UNSUPPORTED` and are not sent, except to
> hosts in `NO_PROXY`.

```bash
npm install hoody-sdk@beta
# or
bun add hoody-sdk@beta
```

Browser (IIFE global, exposes `window.HoodySDK`). Pin to the SDK version you develop against:

```html
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.17/dist/hoody-sdk.browser.min.js"></script>
```

Browser (ESM):

```html
<script type="module">
  import { HoodyClient } from 'https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.17/dist/hoody-sdk.browser.esm.js';
</script>
```

> These CDN URLs pin a specific version. Without the `@<version>` segment,
> jsdelivr/unpkg serves the latest published release, which can change silently.
> Always pin in production.

## Quickstart

Sign in, choose a container, and run a command in one file.

```typescript
// quickstart.ts
import { HoodyClient } from 'hoody-sdk';

// Every Hoody account is created with an email, so sign in by email and adopt
// the returned token. (Have a username instead? `HoodyClient.login(url,
// { username, password })` is the one-line form — see Authentication below.
// On a 2FA account login returns a `temp_token` and no `token`; Authentication
// below shows how to finish the challenge.)
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await hoody.api.auth.login({
  email: process.env.HOODY_EMAIL!,
  password: process.env.HOODY_PASSWORD!,
});
if (!auth || !('token' in auth)) throw new Error('This account needs a second factor: see Authentication below.');
hoody.setToken(auth.token);   // every later call on `hoody` is now authenticated

const containers = (await hoody.api.containers.list()).data?.containers ?? [];
const ready = containers.find(c => c.status === 'running' && c.hoody_kit);
if (!ready?.id || !ready.project_id) throw new Error('No running Kit container yet — see "Fresh account" below to create one.');

const box = await hoody.withContainer({ ...ready, id: ready.id, project_id: ready.project_id });
const result = await box.terminal.run('uname -a');   // one-shot: runs, waits, returns the output
console.log(result.stdout); // → Linux … from your live container
```

```bash
HOODY_EMAIL=you@example.com HOODY_PASSWORD=… npx tsx quickstart.ts
```

If you see a Linux kernel string, you're connected. New here? [Get a free server →](https://hoody.com/signup).

**Fresh account with no containers yet?** Create one first. A container belongs to a project on one of your servers. `servers.list()` includes your free-tier machine, a shared box for getting started; rent [dedicated bare metal](#bare-metal-underneath) when you need to scale:

```typescript
const rentals = (await hoody.api.servers.list()).data ?? [];
const active  = rentals.find(r => r.status === 'active' && r.server_id);
if (!active) throw new Error('No active server yet — a free-tier server can take a moment to provision; retry shortly.');
const serverId = active.server_id!;
const project  = await hoody.api.projects.create({ alias: 'my-first-project' });
const { data: container } = await hoody.api.containers.create(project.data!.id, {
  server_id: serverId,
  name: 'dev-box',
  hoody_kit: true,   // preinstall the Kit service layer (terminal, files, display, agent, …)
});
// Yours immediately; Kit routing comes up within a few seconds (poll `containers.get(id)`
// until status is 'running'), then hand it to `hoody.withContainer()` as above.
// Its services finish starting about 10 seconds after that. A read call (GET) waits for them
// on its own, up to `kitStartingWaitMs` (default 20000; 0 turns it off), and then fails with
// code KIT_NOT_READY; to send a write first, wait for a read such as `box.files.kit.getHealth()`.
```

Containers are disposable. Check that creation returned an ID, then delete the container to remove it and every URL it answered on:

```typescript
if (!container?.id) throw new Error('Container creation returned no ID.');
await hoody.api.containers.delete(container.id);
```

---

## Core concepts

### One client, two scopes

The SDK has two access patterns:

- **API** (`hoody.api.*`) covers account-level operations (containers, projects, billing, realms, tokens). Requires authentication via credentials or token.
- **Kit** (`box.terminal.*`, `box.files.*`, `box.browser.*`, …) covers container-level services reached through Hoody's reverse proxy and scoped via `withContainer()`. *Kit* is the service layer preinstalled when you create a container with `hoody_kit: true` (as the [Quickstart](#quickstart) does). It answers on the per-service URLs in [the opener](#everything-is-a-url); a container created without it has no Kit services to call.

Every snippet uses an account client called `hoody` and a container-scoped client called `box`. Three lines create both; if your account has no containers, the [Quickstart](#quickstart) shows how to create one:

```typescript
const hoody     = await HoodyClient.login('https://api.hoody.com', { username, password });
const first     = (await hoody.api.containers.list()).data?.containers?.[0];
if (!first?.id || !first.project_id) throw new Error('No containers yet');
const container = { ...first, id: first.id, project_id: first.project_id };
const box       = await hoody.withContainer(container);
```

- `withContainer()` accepts a container object or a container ID and returns a client with Kit URL templates pre-filled.
- Open containers ([the default](#containers-are-open-by-default)) need no Kit auth; for gated ones, pass `kitAuth` in `withContainer()`'s options to supply the initial credential, and an `onKitAuthExpired` callback to refresh it and replay the request once on a 401. When the proxy rule reads its token from a query parameter, name it: `{ type: 'token', value, param: 'access_token' }` sends the token in the URL instead of a header, on WebSocket upgrades too, which is the only way a browser socket can carry one.
- `getKitUrl(service, container, serviceIndex?)` builds an embeddable URL for any Kit service; it's what printed the display URL in the opener. For a raw port on the container, `hoody.getKitUrl('http', container, { port: 8080 })` makes the service segment `http-8080`.
- A client whose `baseURL` is the account API refuses Kit calls until you `withContainer()`, instead of sending them to the API host. The client treats `baseURL` as the account API when it is a Hoody API host (`api.hoody.com` or a realm host under it), when you pass `credentials`, or when you pass no `baseURL`; any other host is used as given, as a Kit or daemon reached directly. Set `target: 'account'` or `target: 'kit'` to say which when the host does not tell.

Three conventions every snippet relies on:

- **Response envelope.** By default every request method resolves to a typed `{ statusCode, message, data }`; payloads live on `response.data`, and any other top-level field the operation documents (`propagation`, `pagination`, `total`) sits beside them (streaming, WebSocket, and iterator helpers return their own types, and `rawResponse: true` skips envelope normalization to hand back the parsed body directly, which you cast, since the declared return type stays enveloped).
- **Options object.** Most methods take a trailing options bag that mixes query params with per-request overrides (`retries`, `timeoutMs`, `responseType`, `signal`, …); the opener's `{ display: '1' }` is one.
- **Pagination triad.** A list endpoint that pages ships three forms: `list()` (one page), `listAll()` (collect all pages), `listIterator()` (async iterator). The helpers follow the page, offset or cursor parameter the operation actually takes, and start where your arguments say (a `page`, `offset` or cursor you pass). An operation that declares pagination but takes no page, offset or cursor parameter gets a `listAll()` that is one request; a list that declares no pagination, such as `daemon.programs.list()`, has only `list()`. A walk that stops advancing throws instead of returning a partial list when two consecutive pages echo the same numeric page or offset position; when, with no position echo on the current page, two consecutive pages hold the same ordered ids (at least two rows, each with a string or number id unique within the page); when a walk from the first row returns more rows than the largest numeric total the server reported; or when it needs more than 1000 requests. Singleton pages and rows without usable ids can evade the id comparison, leaving the other checks and the request cap. A cursor walk started without a cursor also throws when it stops while a numeric total says more rows exist, as does a one-request `listAll()` whose response holds fewer rows than its own numeric total. A page or offset walk ends on an empty page.

  A page or offset walk is not a snapshot: every page is a new query against the live list. A row deleted during the walk moves the rows after it back across the position already passed, so some are never returned. A row added at the head of a newest-first list pushes rows forward, so some are returned twice. Neither case throws. Where the operation takes a stable position, walk with that: `afterId` or a fixed `untilMs` on `proxyLogs.list`, `after_id` on `watch.events.list`, `after` on `sqlite.kv.list`, `cursor` on `notifications.list`.

  `notifications.list` called with none of `since`, `after_id` or `cursor` returns the newest page only. `listAll()` / `listIterator()` called that way return that page and stop, until the notifications service states where a full walk begins; from then on they start at the oldest row. Passing `since: 0` walks the whole history in either case. Each page comes newest first, so sort the collected rows yourself if their order matters.
- **64-bit integers (sqlite).** `box.sqlite` methods return an integer above 2^53 - 1 as a `bigint` instead of rounding it to the nearest `number`; every other number is a `number` as before. A `bigint` you pass in a request body, such as a bound parameter, is sent as a plain integer.

And the feel of the surface, in four calls on the Quickstart `box`:

```typescript
// Read a file (readText resolves to the string itself, no envelope)
const file = await box.files.readText('/etc/hostname');

// Drive a cloud browser
const shot = await box.browser.page.captureScreenshot({ browser_id: '1' });

// Schedule a recurring job ('user' = the container's default Linux account, whose crontab this edits)
await box.cron.entries.create('user', { schedule: '0 * * * *', command: 'backup.sh' });

// Query a SQLite database (queryReadOnly takes the SQL base64-encoded — URL-shareable)
const rows = await box.sqlite.sql.queryReadOnly({ db: 'app', sql: btoa('select count(*) from users') });
```

The same client, types, and auth work in Node.js, Bun, Deno, and the browser. Generated namespace methods run everywhere, and so does `box.terminal.run`. Hand-written conveniences that need Node built-ins (`agent.importLocalConfig`/`importLocalConfigs`/`listLocalConfigTools`, the screenshot-to-disk helper, and the `tunnel*`/`mount` helpers) are left out of the browser build: there the method does not exist, so calling it throws a `TypeError`. Where a generated method does the same job, call it directly, such as `box.display.screenshots.capture(...)` in place of the save-to-disk helper. The full surface is in [Namespaces](#namespaces).

### Anatomy of a Hoody URL

Hoody URLs are structural. Every Kit service for every container has a stable subdomain you can construct yourself, with no opaque routing token, per-request signing, or presigned-URL TTL.

```text
https://{projectId}-{containerId}-{service}-{index}.{server}.containers.hoody.com
```

| Part           | Example            | What it identifies                                      | Visibility   |
|----------------|--------------------|--------------------------------------------------------|--------------|
| `projectId`    | `662ea1…` (24-hex) | Project that owns the container                        | Confidential |
| `containerId`  | `662ec3…` (24-hex) | The container itself                                   | **Confidential** |
| `service`      | `terminal`, `display`, `files`, … ([full list](#namespaces)) | Which Kit service inside the container | Public       |
| `index`        | `1`, `2`, …        | Which instance (terminal 1 vs terminal 2)              | Public       |
| `server`       | `node-example-1`    | Physical host. Stable per container                    | Public       |

Beyond the indexed services in [Namespaces](#namespaces), raw container ports are reachable as `http-{port}` / `https-{port}`. `ssh` is an un-indexed special route with no `-{index}` segment, and the canonical `egress` URL omits the index as well; an explicit `egress-{index}` above 1 selects a separate permission scope on the same proxy process. Build them with `hoody.getKitUrl('terminal', container, 1)` or compose the string by hand. Two namespaces have shorter URL slugs than their SDK names: `notifications` → `n` and `proxyLogs` → `logs`. Use `getKitUrl()` for those so it applies the mapping.

### Containers are open by default

A newly created Hoody Kit container exposes **every Kit service in [Namespaces](#namespaces)** on its own subdomain with **no authentication of their own**. Anyone who knows the full subdomain can use the file API, open a shell, drive the display, or prompt the AI agent. **The container URL, specifically its `projectId`/`containerId` pair, is the access capability.** Treat it like a database password and keep it out of public tweets, shared Slack channels, and screenshots.

The capability is hard to guess: a request must name the exact `projectId` and `containerId` pair, no directory listing or discovery endpoint can enumerate either, and the wildcard certificate on `*.containers.hoody.com` keeps container hostnames out of public Certificate Transparency logs. It can still leak through DNS lookups, TLS SNI, browser history, and `Referer` headers, so on-path observers and logs can learn it over time. Possession of the URL *is* the grant: sharing it shares the resource, while revoking the container removes the URL. If an incidental observer must not reach a service, use one of the layers below instead of relying on the ID staying secret.

Hoody is permissionless by default, so the first call from a notebook, CLI, or developer laptop works without setup. To restrict access, add the layer that fits your trust model:

| Layer                        | What it does                                                                  | Set via                                  |
|------------------------------|-------------------------------------------------------------------------------|------------------------------------------|
| Permission rules             | Gate each service by **auth group** (IP / JWT / password / token / Hoody identity) with a default allow-or-deny policy; add per-service **hooks** to match on path or method | `hoody.api.proxy.containerPermissions.set(...)` (needs `ifMatch`, like [hooks](#hooks-a-script-on-any-request)) / Workspaces (Hoody's web UI) / an SDK-driven agent |
| Realm-scoped API tokens      | Hand out API tokens fenced to a *realm* (a tenant label) so a token only ever sees its own resources on `api.hoody.com`. Expiring and IP-pinnable ([walkthrough](#give-your-own-users-their-own-hoody-api)) | `hoody.api.auth.tokens.create(...)`       |
| Aliases                      | Hide IDs entirely behind a custom subdomain ([how-to](#aliases-and-custom-domains)) | `hoody.api.proxy.aliases.create(...)`     |
| Custom domains               | Front the alias with your own domain (CNAME), Hoody auto-issues TLS ([how-to](#custom-domains-via-cname)) | A DNS CNAME to the alias hostname |

You can keep one service public, require a token on another, and pin a third to one IP. [`hoody chat`](#hoody-chat-the-documentation-assistant) can produce the exact command ("lock this container so only 203.0.113.0/24 can reach it, and only until Friday"), or an agent can apply the same primitives through the SDK. [Security model](#security-model) explains how the pieces fit together.

### Bare metal underneath

The resource chain is **account → servers → projects → containers**. A *rented server* is a dedicated bare-metal machine with no VMs or noisy neighbors, available at a flat rate through Hoody's marketplace (an official Hetzner & OVH partner) and provisioned in minutes. The free-tier machine is shared, so the dedicated-hardware guarantees below apply only to rented bare metal. A *project* organizes containers; a *container* is the Linux machine where they run.

**Containers are free; you pay for the machine.** There is no usage meter on Hoody's side, so dev, staging, and prod projects can share one flat-rate machine. Containers boot in seconds and load Kit services on demand. Hoody also merges identical memory pages (KSM) and duplicate disk blocks (BTRFS) across containers, letting one box hold hundreds without giving each a full slice of RAM and disk. Some marketplace offers have a monthly traffic allowance; set `unlimited_traffic_only: true` in the `listMarketplace()` call below to exclude them. Hoody manages host provisioning, networking, and the proxy; you own what runs on it.

The same client manages the whole chain:

```typescript
// Browse the bare-metal marketplace — filter by geography, specs, price:
const offers = await hoody.api.servers.listMarketplace({ min_ram_gb: 64, country: 'DE' });

// Rent one at its flat rate. `rental_days` must be a duration the offer supports, and every
// paid rental must confirm a ceiling on the total debit or the call is refused with
// 409 CHARGE_CONFIRMATION_REQUIRED (or SETUP_FEE_CONFIRMATION_REQUIRED when the server
// also carries a one-time fee). Read the total from the offer's own pricing:
const offer = offers.data![0]!;
const tier  = (offer.pricing!.price_tiers! as Record<string, { total_first_payment: string }>)['30']!;
const rented = await hoody.api.servers.rent(offer.id, {
  rental_days: 30,
  max_charge_cents: Math.round(Number(tier.total_first_payment) * 100),  // price + one-time setup fee, in cents
});

// …and it's a `server_id` you can fill with containers, as in the Quickstart.
console.log(rented.data!.rental!.server_id);
```

For production:

- **Renewal.** Machines you already rent are managed under `hoody.api.servers`: `hoody.api.servers.extend(rentalId, { expected_rental_end, additional_days })` renews one without touching what's on it. `expected_rental_end` is the rental's current `rental_end` exactly as the API returned it, so a retried request is refused instead of charging twice; add `max_charge_cents` unless the rental still carries frozen renewal pricing. Extend before `rental_end`: the machine, its containers, and their data are what you're renting.
- **Durability.** The optional RAM-backed mount at `/ramdisk` (on by default; `ramdisk: false` at creation turns it off) survives container restarts but is **wiped if the physical host reboots**, so keep durable state on the regular disk-backed filesystem and use `hoody.api.snapshots.create(...)` as your undo button.
- **Data path.** Because Hoody's reverse proxy itself runs as a container on *your* server, requests to your containers terminate on hardware you rent rather than transiting middleboxes in Hoody's own infrastructure: the control plane sees management operations and the metadata you send it (names, environment variables, token grants), not the request and response bytes flowing through your container services.

### Self-host anything, durably

A container is a full machine with a persistent, LUKS-encrypted disk. Self-host a Jellyfin media library, Postgres, game server, dashboard, or anything else you would put on a server. Put it under the daemon so it restarts after a reboot, and snapshot the container for a one-command backup. Media, data, and configuration stay on durable disk; you can stream or access the service over HTTPS from a browser on any device. `box.files.*` handles loose files with glob, grep, archives, WebDAV, and 60+ cloud backends. Run as many isolated services as the machine holds, each with its own URL. VS Code Server includes a PWA manifest, so it can be installed like a native app.

Hoody maintains the layer below: a hardened custom kernel, container + namespace + seccomp isolation, encrypted disks, and host-level firewalls on dedicated bare metal. There are no hypervisor neighbors, and Hoody keeps the host kernel patched while you maintain your app.

### Authentication

The login endpoint has separate email and username fields. A username must match `^[a-zA-Z0-9_-]+$` (no `@`), so an email address authenticates only through the `email` field. Every account is created with an email (see **Signup** below), making email the common path:

**Email login.** Call `api.auth.login({ email, password })` and adopt the returned token:

```typescript
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await hoody.api.auth.login({
  email: 'you@example.com',
  password: '...',
});
if (!auth || !('token' in auth)) throw new Error('This account needs a second factor: see Two-factor accounts below.');
hoody.setToken(auth.token);   // every later call on `hoody` is now authenticated
```

**Username login.** If your account has a username, the convenience helpers take `{ username, password }` and keep the credentials on file for automatic re-login on token expiry:

```typescript
// Explicit — login immediately and get a ready client:
const hoody = await HoodyClient.login('https://api.hoody.com', {
  username: 'alice',
  password: '...',
});

// Lazy — pass credentials at construction; login happens on the first request:
const lazy = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  credentials: { username: 'alice', password: '...' },
});
```

**Signup:**

```typescript
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
await hoody.api.auth.signup({
  email: 'you@example.com',
  password: '...',
  region: 'eu-west', // optional, auto-assigned by GeoIP if omitted
});
```

For token-only flows with no credentials on file, pair `token:` with an [`onTokenExpired` refresh callback](#token-refresh-callback). `hoody.api.auth.tokens.create(...)` mints scoped tokens ([walkthrough](#give-your-own-users-their-own-hoody-api)); `hoody login --print-token` prints the CLI session token.

> **Two-factor accounts.** If 2FA is enabled, `login` resolves with a `temp_token` and no access token; `await hoody.completeTwoFactorLogin(temp_token, code)` verifies the code and adopts the session, refresh token included. `HoodyClient.login()` rejects with a `TwoFactorRequiredError` instead, and `await err.complete(code)` resolves to the signed-in client.

**Sessions.** A client and every client derived from it with `withContainer()` or `withRealm()` share one session: its access token, refresh token and stored credentials.

- `setToken(token)` changes the token of that one client, which leaves the shared session; clients derived from it afterwards share its new one. `setSessionToken(token)` changes the token of every client in the session.
- `adoptSession(tokens)` adopts a session issued outside `login()`: the result of `api.auth.twoFactor.verify()` or `api.auth.oauth.exchange()`, or tokens you saved. It keeps the refresh token for automatic refresh and drops the previous session's credentials.
- `logout()` ends this session only and makes no request: every client in the session drops its token, refresh token, credentials and `kitAuth`, and the account stays signed in on other devices. The dropped access token stays valid on the server until it expires. `logoutAll()` signs the account out everywhere (it calls `api.auth.logoutAll()`), then clears this session the same way, even when the request fails. Both end the `hoody.events` session, as every session change does ([Real-time events](#real-time-events)). Other streams and sockets you opened stay open until you close them.
- `onSession` in the client config is called each time the SDK itself obtains a token pair: on `login()` (`reason: 'login'`), and when it recovers from a 401 by exchanging the refresh token (`'refresh'`) or by signing in again with the stored credentials (`'relogin'`). A refresh spends the previous refresh token, so a long-running service saves each new pair and starts its next run with `adoptSession()`. The callback is not awaited and what it throws is discarded, so handle errors inside it. It is not called for tokens you supply yourself.

  ```typescript
  const hoody = new HoodyClient({
    baseURL: 'https://api.hoody.com',
    onSession: ({ token, refreshToken, reason }) => {
      saveSession({ token, refreshToken }).catch((err) => console.error('session not saved', reason, err));
    },
  });
  ```

**Browser-token hygiene.** A token in JS storage is a bearer credential; anyone who reads it can act as that user. Treat it like a password. Never put account credentials or an account-wide token in a static page. Give browser apps a short-lived, realm-scoped token minted by your control plane with the narrowest workable permission template ([how to mint one](#give-your-own-users-their-own-hoody-api)).

---

## What you can build

These are working SDK calls.

> Snippets assume the `hoody` / `box` pair from [One client, two scopes](#one-client-two-scopes): an account client and a container-scoped client.

### Your backend is optional

Paste this into a `.html` file and open it in a browser. It logs into Hoody, picks a running Kit container, and replaces the page with a live XFCE desktop:

```html
<!doctype html>
<title>An entire desktop, served from a static file</title>
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.17/dist/hoody-sdk.browser.min.js"></script>
<script type="module">
  const { HoodyClient } = window.HoodySDK;
  const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
  const { data: auth } = await hoody.api.auth.login({
    email: prompt('email'),
    password: prompt('password'),
  });
  if (!auth || !('token' in auth)) throw new Error('This account needs a second factor: see Authentication below.');
  hoody.setToken(auth.token);
  const c = (await hoody.api.containers.list()).data?.containers?.find(x => x.status === 'running' && x.hoody_kit);
  if (!c) throw new Error('No running Kit container yet: create one first (see Quickstart).');
  // Every container service lives on its own stable subdomain. This builds the
  // desktop service's URL; opening it starts an XFCE desktop and shows it once it is ready.
  const url = hoody.embeds.desktop.session(c, { params: { desktop_env: 'xfce' } });
  // https://{projectId}-{containerId}-desktop-1.{server}.containers.hoody.com/?desktop_env=xfce
  document.body.innerHTML =
    `<iframe src="${url}" style="width:100vw;height:100vh;border:0"></iframe>`;
</script>
```

The `prompt(...)` login is for the demo; an account that signs in with a username passes `username` in place of `email`. In production, give the page a short-lived, realm-scoped token minted by your control plane (see [Authentication](#authentication)). The URL comes from [`hoody.embeds`](#embed-urls).

This works because the Hoody API supports CORS and uses bearer tokens rather than cookies. The static page calls `api.hoody.com` directly, then reaches Kit capability URLs the same way. For every kit, the URL itself is the credential ([why that's the default](#containers-are-open-by-default)). For a service you have locked down, the SDK attaches configured proxy-auth headers to `box.*` requests. A bare iframe `src` cannot carry those headers, so front gated embeds with an [alias + permission rules](#aliases-and-custom-domains). **No proxy server on your side:** the page talks to Hoody's edge, which routes to the container. Keep provisioning, billing, abuse controls, and customer-scoped token minting in code you control. Calls to container services (shell, file, Chromium, desktop) go directly from wherever your code runs.

### Run Claude Code (or any CLI agent) and drive it over HTTP

```typescript
const launched = await box.daemon.ephemeralPrograms.start({
  user: 'user',   // the container's default Linux account (uid 1000) — unrelated to the `hoody` client
  command: 'claude --print "refactor src/ to ES modules"',
});
const logs = await box.daemon.ephemeralPrograms.getLogs(
  launched.data!.temporary_id,
);
```

The agent runs as a supervised process you can tail, poll for status, and stop over HTTP; a quick-start program is ephemeral, so `stop` removes it rather than parking it for a restart. Its binary must be on the container's `PATH`: install Claude Code with `apt install` / `npm i -g`, or use a dev-kit image that already includes it. The config sync below copies local settings and credentials, not the binary. The same recipe works for `aider`, `codex`, `goose`, or anything available through `apt install`.

Two upgrades when this becomes a product:

```typescript
// Push your local `claude` config and credentials into a Kit container
// (the SDK knows the layouts for claude / codex / opencode / gemini;
// supports { dryRun: true } to preview, and { only: 'credentials' }):
await box.agent.importLocalConfig('claude', { only: 'credentials' });

// Promote the one-shot into a persistent, supervised program:
await box.daemon.programs.create({
  name: 'agent',
  user: 'user',
  command: 'claude --print "review the nightly diff"',
});
```

`box.daemon.programs.start/stop/enable/disable` and `box.daemon.programs.getLogs(id)` then manage running state and log tailing without an SSH session; the restart policy itself is the program's own `autorestart` field (`'true'` always restarts after a successful start, `'false'` never does, and `'unexpected'` restarts after any nonzero exit, including a deliberate one; a program that exits during startup follows separate retry rules), set on `programs.create` and changed later with `programs.update`. (`box.agent.importLocalConfigs([...])` batches several tools; `box.agent.listLocalConfigTools()` lists the registry.)

`programs.update` merges: send only the fields that change and the daemon keeps the rest, so `update(id, { description: '...' })` is a complete request. `sandbox` is the one three-state field on update. Omitting it keeps the stored block, `sandbox: null` clears it, and an object replaces the block whole, because there is no field-level merge inside a sandbox. `programs.getSandbox(id)` reports the stored block, the policy revision, the `bwrap` and `systemd-run` argument vectors it resolves to, the nftables state the kernel is holding, and a `firewall` verdict of `ok`, `degraded`, `draining` or `none`, with one `problems` line per reason when it is `degraded`. From the CLI the same block is set flag by flag (`hoody daemon programs update 12 --sandbox-network-mode restricted --sandbox-network-bind-ports 8000-8003,443`), cleared with `--sandbox null`, and read with `hoody daemon programs sandbox get 12`. An update that sets any `--sandbox-*` flag sends a new block, so it must resend every restriction it wants kept. The CLI reads the stored block first and refuses an edit that would drop a stored restriction, listing what it would remove; `--sandbox-replace` sends it anyway. So `--sandbox-process-max-pids 32` on its own is refused while filesystem or network restrictions are stored.

### Give an LLM a real bash terminal

```typescript
// Wire `shell` as a tool on your favorite chat model — in your tool handler:
const out = await box.terminal.run(shellArgs.cmd);
return { stdout: out.stdout, exit_code: out.exitCode };
```

This is a full Debian shell with real stdout and exit codes, not a mock or restricted eval environment. The model can `npm install`, `git clone`, run tests, and edit files. With `box.files.*` and `box.browser.*`, it can also read, write, and browse. Because each capability is an HTTP endpoint returning typed JSON, the three-line handler needs no MCP server, plugin protocol, or other driver between the model and machine.

An interactive `box.shell({ reconnect: true })` comes back to the same session after a drop. Input, signals and resizes sent while it reconnects are held until the session is confirmed to be the same one, then sent in order. If the session is gone, the shell ends with a "session was lost" error and what was held is dropped, never sent to another session.

When the model needs an interactive TUI instead of one-shot exec, `box.terminal.sessions.*` can screen-scrape and drive it: `wait` (wait for a regex match or output stability), `getSnapshot`, `search`, `pressKeys`, `paste`, `sendMouseEvents`. The system surface, `box.terminal.processes.*` (`list`, `signal`, `pause` / `resume`) and `box.terminal.system.*` (`listPorts`, `getStats`), lets your supervisor code see and control what those commands actually spawned.

Before giving an agent control, take a snapshot (`hoody -c <containerId> snapshots create` in the CLI, `hoody.api.snapshots.create(...)` in the SDK). A copy-on-write snapshot makes a bad change reversible.

### Stream any GUI app as a URL

The [opener](#everything-is-a-url) launched Firefox with two calls: `box.terminal.commands.run(..., { terminal_id: '1', display: '1' })` puts it on a virtual display, and `getKitUrl('display', container, 1)` returns the live window's URL. Anyone with that URL sees **the actual Firefox window** in a browser on any device. Embed it:

```html
<iframe
  src="https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com?decorations=false&toolbar=false"
  style="width:100%;height:100vh;border:0"
></iframe>
```

> **Embedding is sharing.** The iframe `src` above contains the container's capability URL. Anyone who can view the page can read it from the DOM, and on an open container it unlocks every URL-bearer service (`files`, `terminal`, `agent`, …), not just the display. Embedding for yourself is fine; embedding for your users means fronting it with an [alias](#aliases-and-custom-domains) plus [permission rules](#containers-are-open-by-default) first.

The same pattern works for any X11 application: Firefox, GIMP, Blender, a custom Electron app, IDE, retro game, scientific app, or full desktop environment. Its URL can be streamed to phones, embedded, shared, bookmarked, or given to an AI agent that drives it through `box.display.*`:

```typescript
await box.display.input.click({ x: 100, y: 200 }, { displayId: 1 });
```

`box.display.input` includes `type` (move + click + type in one call), `drag`, `select`, `actMany` (a whole action sequence in one request), and `reset`, an emergency release of all held inputs. `box.display.mouse` and `box.display.keyboard` hold the key and mouse primitives, and `box.display.windows` handles window management (`search`, `focus`, `move`, `resize`, `close`). Clipboard read/write is available through `box.display.clipboard.get()` / `box.display.clipboard.set({ text: '…' })`. Pair a screenshot loop with `actMany` and a vision model can drive desktop applications that have no API.

**One-shot shortcut.** A request to the terminal page URL (the one `hoody.embeds.terminal.session()` builds) with `redirect=display` creates the session, waits for X11 readiness, and returns a 302 to the display URL:

```typescript
// `btoa` is native in Node.js 22+ and every modern browser.
const url = hoody.getKitUrl('terminal', container) +
  `?terminal_id=1&display=1&cmd=${btoa('firefox https://hoody.com')}` +
  `&redirect=display`;
// Open `url` in a browser — you land directly on the running Firefox
```

For a full XFCE desktop in an iframe, use the desktop service instead: `hoody.embeds.desktop.session(container, { params: { desktop_env: 'xfce' } })`, the URL the [static-page demo](#your-backend-is-optional) uses.

### Use real Linux tools over HTTP

```typescript
// Convert any office doc to PDF, no infra to maintain:
await box.files.upload('/tmp/in.docx', docxBytes);
await box.terminal.run('libreoffice --headless --convert-to pdf --outdir /tmp /tmp/in.docx');
const pdf = await box.files.readBytes('/tmp/in.pdf');   // Uint8Array
```

The container is a Debian box. Install pandoc, ffmpeg, ImageMagick, Postgres, Redis, Playwright, or anything else through `apt-get` (or `pip install`, or `cargo install`). Pre-bake the stack into a server image or install it on demand.

### Reverse-tunnel localhost to a public URL

Publish a local HTTP / WebSocket service from your laptop on a container port (EXPOSE), or bind a local TCP service onto container-loopback so in-container code can reach it (PULL). On a container-scoped client, `box.tunnel.expose()` / `box.tunnel.pull()` build the tunnel's WebSocket URL from the container and send the client's `kitAuth`. They run on Node.js or Bun (they're not in the browser build):

```typescript
const box = await hoody.withContainer(container);

// Expose: publish your local HTTP server (:3000) on a container port.
// `containerPort: 0` auto-assigns an unprivileged port; ports 80-1023 must be
// enabled for privileged expose on the container first.
const handle = await box.tunnel.expose({
  containerPort: 3000,
  to: { host: '127.0.0.1', port: 3000 },
});
// Visitors reach it at the container's URL for that port:
console.log(hoody.getKitUrl('http', container, { port: handle.bind.containerPort }));
await handle.close();

// Pull: bind a container-loopback port (reachable only from inside the container)
// to a local TCP service, e.g. let in-container code reach your local Postgres.
const pulled = await box.tunnel.pull({
  containerPort: 8080,
  to: { host: '127.0.0.1', port: 5432 },
});
// Pull is loopback-only (no public URL); in-container clients dial 127.0.0.1:<port>:
console.log(`reachable inside the container at 127.0.0.1:${pulled.bind.containerPort}`);
await pulled.close();
```

EXPOSE makes a local HTTP/WebSocket service reachable over public HTTPS at `https://{projectId}-{containerId}-http-{port}.{server}.containers.hoody.com` without router or NAT configuration or a separate tunnel account. The handle's `publicUrl` is the URL the kit returns, or the public HTTPS URL derived locally from a recognized Hoody tunnel hostname, so it can be set without `HOODY_TUNNEL_PUBLIC_URL_PATTERN`; it is unset when neither applies. PULL instead carries raw TCP onto container loopback, letting in-container code reach a local service such as Postgres. `box.tunnel.serve()` (Bun only) accepts a `Bun.serve`-compatible `fetch` handler for a one-call listener without a separate HTTP server.

`keepTunnelAlive(handle, { mode, container, to })` keeps an `expose()` or `pull()` tunnel up across connection drops: the kit holds a dropped session's binds for 60 seconds by default, and the helper reconnects with the session id inside that window so the same ports keep serving. Its `ended` promise never rejects. It settles with `{ deliberate, reason, code? }`, and `code === 'RESUME_EXPIRED'` means a drop could not be resumed before the hold ran out. A single resume attempt (`tunnelResumeExpose`, `tunnelResumePull`) takes `signal` and `handshakeTimeoutMs`; aborting it rejects with `TunnelResumeAbortedError` and releases any binds the kit had already handed back.

A tunnel gated by a proxy permission rule takes the credential as `kitAuth` (from `withContainer(container, { kitAuth })`, or per call); the account token is never sent to the tunnel. Each call opens its own session. Without a scoped client, the package-root `tunnelExpose` / `tunnelPull` / `tunnelServe` take the WebSocket URL as `url`, or the tunnel host as `container`. For several bindings on one session and the low-level bind / frame primitives, import `TunnelSession` from the package root; `box.tunnel.*` also lists or kills sessions and reads bindings and metrics.

### The built-in agent

Every Hoody Kit container ships an agent. `box.agent.*` exposes <!-- ref:agent-sdk-methods -->326<!-- /ref:agent-sdk-methods --> methods across sessions, models, skills, memory, todos, workflows, hooks, GitHub integration, tools, and logs. It is the SDK's largest container-scoped namespace.

The agent kit takes the same auth as the rest: none of its own. A bare
`withContainer(container)` can list models, create a session, and prompt it, because
the container URL is the credential ([what that means](#containers-are-open-by-default)).
Gate it the way you gate any other service, with a permission rule on `agent`.

Sessions are created once, then prompted turn by turn:

```typescript
// Create a session — the reply carries the new session's id, which
// every later call takes as its first argument:
const created = await box.agent.sessions.create();
const sessionId = created.data!.session_id;
if (!sessionId) throw new Error('Agent session creation returned no session_id');

// Prompt it synchronously. This blocks until the turn finishes, or returns a
// pending_gate the moment the turn parks on a confirmation or a question:
const turn = await box.agent.sessions.turns.run(sessionId, {
  text: 'Run the test suite and fix the first failure you find.',
});
```

A parked turn waits for `box.agent.gates.approve()` or `deny()` to settle a confirmation, or `box.agent.gates.answer()` for a question. For unattended runs, pass `{ policy: 'auto_approve' }` as `turns.run`'s third argument: ordinary confirmation gates are approved automatically for that turn, while confirmation gates raised by tool-call rules are denied automatically; questions still park, so arm `sessions.setAutoReply` if nothing will be there to answer them.

The model behind a session is per-container configuration: provider API keys, OAuth sign-ins, and the default model live under `box.agent.providers.*` (`setApiKey`, `startOauth`, `setDefaultAuth`) and `box.agent.models.list`.

The agent includes its runtime; you supply provider access. Point it at existing provider keys or OAuth accounts (OpenAI, Anthropic/Claude, and more), or run Claude Code / Codex / Gemini *inside* the container after syncing local credentials in one call: `await box.agent.importLocalConfig('claude', { only: 'credentials' })`. Either way, it runs **on the machine it's editing**, with nothing to install locally and no context to ship.

For streaming on Node.js or Bun, use the package-root `streamAgentPrompt` helper. It POSTs the turn, parses the daemon's SSE stream, and returns text deltas, a turn-event stream, and a `done` promise. It sends the client's configured `kitAuth`, or an explicit per-call `auth`, for proxy permission rules. It never sends the account token and never mints a container claim. With no credential configured it requests the bare capability URL, so a gated deployment needs an accepted credential. Consume the event stream promptly: buffering begins only when you iterate it, although `done`'s `text` always contains the full accumulated output:

```typescript
import { streamAgentPrompt } from 'hoody-sdk';

const run = await streamAgentPrompt(hoody, {
  container,
  sessionId,
  text: 'Audit /home/user, run the tests, and summarize what you changed.',
  policy: 'auto_approve',   // approve ordinary confirmations; deny tool-call-rule confirmations
});
for await (const delta of run.text) process.stdout.write(delta);
const result = await run.done;   // { terminal, text, data } — final text, usage, turn info
```

> **Note:** the generated `box.agent.sessions.startTurnAndStream()` returns a lazy SSE event stream: the request starts when you iterate it. `streamAgentPrompt` additionally parses the turn events and exposes text deltas and a `done` promise.

Beyond prompting, the namespace covers recurring loops with hard budgets and one-shot headless runs (`box.agent.headless.start`, or `stream` to follow it); memory with hybrid-recall search and a relation graph; todos and declarative workflows; a tool catalogue with sessionless `tools.run` (pass `stream: true` to follow it); GitHub device-flow login, clone, commit, and PR; LLM provider keys and skills; hooks; and usage statistics. Full method listing: [`docs/reference/namespaces/agent.md`](./docs/reference/namespaces/agent.md).

### Everything else in the box

The box also includes filesystem watchers streaming over SSE/WebSocket (`box.watch`), collaborative docs and notebooks (`box.notes`), outbound HTTP jobs with cookie sessions and scheduling (`box.curl`), streaming transfer channels (`box.pipe`), the Hoody Run app resolver (`box.run`), desktop notifications on a container display (`box.notifications`), VS Code Server (`box.code`), and reverse-proxy access logs (`box.proxyLogs`). See [Namespaces](#namespaces) for the full map.

### Fork a machine instantly

Copy a running container in one call using btrfs copy-on-write. The copy provisions **asynchronously**: check that `fork.data.id` is present, then poll `hoody.api.containers.get(fork.data.id)` until the response's `data.status === 'running'`. The fork has **its own capability URLs**, so every service, including terminal, files, and any `http-{port}` app, answers at a new address. Use forks for experiments, per-user environments, or testing changes against a copy of a live site.

```typescript
const fork = await hoody.api.containers.copy(container.id, {
  target_project_id: projectId,   // where the copy lands (target_server_id optional; defaults to the source server)
  name: 'experiment-1',           // optional; auto-named if omitted
});
const forkId = fork.data.id;
if (!forkId) throw new Error('Copy response did not include a container id');
// The copy provisions asynchronously — poll containers.get(forkId) until
// status === 'running' (it starts automatically once the copy completes), then:
const forkContainer = (await hoody.api.containers.get(forkId)).data;
if (!forkContainer.project_id || !forkContainer.server_name) throw new Error('Fork response did not include URL routing fields');
console.log(hoody.getKitUrl('http', { ...forkContainer, id: forkId }, { port: 8080 }));   // the forked app, live once it's running
```

---

## Build your platform on Hoody

The SDK namespaces provide the infrastructure; your code provides the product:

```typescript
// Your AI coding agent — you write the AI logic, Hoody handles everything else
const box = await hoody.withContainer(container);
await box.terminal.run('git clone ...');
const files = await box.files.list('/home/user');
await box.terminal.run('git apply /home/user/patch.diff');
// Run a CLI agent as an ephemeral program (not sandboxable; use programs.create for a confined one); read its output with ephemeralPrograms.getLogs():
await box.daemon.ephemeralPrograms.start({ user: 'user', command: 'aider --message "review the diff"' });
```

You do not need to build container orchestration, terminal multiplexing, a filesystem abstraction, browser-automation harness, display-streaming server, cron daemon, or reverse-proxy config. Every row below uses the same SDK, auth, and types through `box.terminal`, `box.files`, `box.browser`, and `box.display`, all on one client and container.

| Use case | What you write | What Hoody handles |
|---|---|---|
| Cloud IDE / coding platform | UI, collaboration, billing | Containers, terminals, file ops, AI agent, display |
| AI agent framework | Prompts, tool selection, memory | Sandboxed execution, file I/O, browser, screenshots |
| CI/CD pipeline | Build logic, triggers, dashboards | Isolated runners, cron scheduling, artifact storage |
| Education platform | Curriculum, grading, student UI | Per-student containers, code execution, terminals |
| Internal dev tools | Custom workflows, integrations | Secure remote shells, file transfer, DB queries |
| Browser automation | Scraping logic, data pipeline | Cloud Chromium, screenshots, cookie management |
| Remote desktop product | Auth, user management, UI shell | X11 display streaming, input relay, clipboard sync, multiple virtual displays |

Platforms rent [flat-rate bare metal](#bare-metal-underneath) and add containers until the machine is full, so new customers need no additional infrastructure until then. Another server adds capacity. The SDK is Apache-2.0-licensed: use it as a dependency, fork it, wrap it in your own SDK, or white-label it.

### Give your own users their own Hoody API

Multi-tenancy often requires an auth service, session store, RBAC tables, and tenant-isolation logic. On Hoody, the setup below takes three API calls.

With **Realms** and **Auth Tokens**, each end user gets a fully isolated slice of the Hoody API: their own containers, files, terminals, and cloud desktop, without access to your account. You mint the realm-scoped tokens below, and Hoody's control plane enforces their scope.

You hand over a finished environment rather than raw infrastructure: a maintainable project with its code, running GUIs, databases, and a built-in AI agent that can keep it running. It is delivered through one URL that you can [white-label](#aliases-and-custom-domains).

```typescript
// You: the platform provider — log in with your account credentials.
// (This walkthrough uses account auth; a token can mint sub-tokens only
//  if you granted it the resources.create_tokens permission.)
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await hoody.api.auth.login({
  email: process.env.PROVIDER_EMAIL!,
  password: process.env.PROVIDER_PASSWORD!,
});
if (!auth || !('token' in auth)) throw new Error('This account needs a second factor: see Authentication.');
hoody.setToken(auth.token);

// Pick a realm ID for the new customer — any 24-hex string you
// generate (there is no create-realm call). Realms are just
// labels — they "exist" by being attached to resources.
const realmId = '507f1f77bcf86cd799439011';

// 1. Pre-create at least one project in this realm so the customer
//    has somewhere to put containers (the external_customer template
//    cannot create projects on its own).
const project = await hoody.api.projects.create({
  alias: 'acme-workspace',
  realm_ids: [realmId],
});

// 2. Pre-create containers in that project / realm (optional — customers
//    can create their own inside the project). Anything you want the
//    customer to see must carry their realm_id.
const { data: acmeBox } = await hoody.api.containers.create(project.data!.id, {
  server_id: process.env.SERVER_ID!,
  name: 'acme-box-1',
  hoody_kit: true,
  realm_ids: [realmId],
});

// 3. Issue the customer a realm-scoped token.
const created = await hoody.api.auth.tokens.create({
  alias: 'Customer Acme Corp',    // letters, digits, spaces, underscore and hyphen only
  permission_template: 'external_customer',
  realm_ids: [realmId],
  allow_no_realm: false,          // must use realm-scoped URL
  ip_whitelist: ['203.0.113.0/24'],
  expires_at: '2026-12-31T00:00:00Z',
});

// IMPORTANT: created.data.token is shown ONCE, at creation.
// Store it / hand it off now — list & get never return it again.
const customerToken = created.data!.token;

// 4. Optionally hand the customer a ready-made cloud desktop, built by
//    the desktop embed view (see "Embed URLs"):
if (!acmeBox?.id || !acmeBox.project_id) throw new Error('containers.create returned no container');
const desktopUrl = hoody.embeds.desktop.session(
  { ...acmeBox, id: acmeBox.id, project_id: acmeBox.project_id },
  { params: { desktop_env: 'xfce' } },
);

// Hand the customer: token + a realm-scoped URL — their realm ID as a
// subdomain of the API host:
// https://507f1f77bcf86cd799439011.api.hoody.com
```

The customer now has a fully typed Hoody API containing only their containers. They can list containers, run commands, read files, drive browsers, or open that desktop within the permissions you granted. Other customers, billing, and anything outside the realm are not merely access-denied; those resources are absent from the customer's API view. The consuming client takes two lines: the token you provided, scoped to the realm subdomain.

```typescript
const acme = new HoodyClient({ baseURL: 'https://api.hoody.com', token: customerToken })
  .withRealm('507f1f77bcf86cd799439011');   // routes realm-aware control-plane requests via the realm subdomain
```

A realm id is 24 hexadecimal characters; `withRealm('all')` (or `'default'`, `'*'`) clears the realm, and any other value throws `ValidationError`. One call can choose its own realm with the `_realm` option, a realm id or `null` for none. A generated call on a realm-scoped client goes to the realm host even if a middleware points it at another API host. A realm-scope 403 arrives as an `ApiError` with `code: 'REALM_SCOPE_ERROR'` and a `hint` (test it with `isRealmScopeError(err)`); with `realmErrorIntrospection: true` the client makes one extra request to list the realms the token allows (unless it already has a cached answer for that token) and attaches the result as `allowedRealms` when the lookup succeeds. On a client that treats its base as a Kit (a host that is not a Hoody API host, such as `https://app.example.com/proxy`), a raw `.http` request with a realm bound for that base host is refused with a `ValidationError`, not sent unscoped, unless the base host already carries that realm (`https://{realmId}.api.example.com`); drop the realm or pass `target: 'account'`, and note that with such a base, or a relative one (`'/proxy'`), realm requests go to `{realmId}.<that host>`, so those realm hosts must be served on that domain.

**Included controls:**

- **Multi-tenancy.** One realm per customer; a realm-scoped token sees and acts only on resources tagged with that realm (control-plane scoping; the container boundary provides container-level isolation)
- **Permission templates.** `external_customer`, `dev_team`, `read_only`, `finance_team`, `full_access`, or fully custom
- **Security controls.** IP allowlists (`ip_whitelist`), expiration dates, enable/disable without deletion
- **Token introspection.** Customers can call `/api/v1/auth/tokens/me` to discover their realm and permissions
- **Public token profiles.** Attach metadata to tokens (display name, tier, logo) through `public_storage`; this requires a `public_key` (Ed25519), set at creation or later through the public-profile endpoint
- **No auth machinery to build.** No JWT verification, session store, or RBAC tables; your side mints, stores, and rotates the realm-scoped tokens (the code above)

The same pattern works for non-human tenants. Give each AI agent a realm, and it cannot see or manage containers outside that realm through the API.

See [Realms & Projects](https://docs.hoody.com/concepts/realms-projects/) and [Auth Tokens](https://docs.hoody.com/api/auth-tokens/) for the full reference.

## Aliases and custom domains

Realms hide your account from customers; aliases and custom domains hide Hoody. Together they provide white-labeling, so customers see your product and domain rather than a 24-hex container ID.

An alias is a per-user label of 3 to 61 characters mapped to a `(project, container, program, index)` tuple. Its subdomain is the shared URL, with no real IDs. Leave `alias` blank to auto-generate a 48-character hex string for share-by-obscurity links.

```typescript
const a = await hoody.api.proxy.aliases.create({
  alias: 'team-dashboard',          // optional; auto-48-hex if omitted
  container_id,
  program: 'exec', index: 1,        // an exec endpoint: a service you would publish anyway
  target_path: '/report',           // what a root request ("/") serves
  allow_path_override: false,       // pins the alias: "/" and target_path itself; any other path is a 404
  expires_at: '2026-12-31T00:00:00Z',
});
console.log(a.data!.url);
// → https://team-dashboard.node-example-1.containers.hoody.com
```

| Field                  | Effect                                                                  |
|------------------------|-------------------------------------------------------------------------|
| `alias`                | Custom label (`a-z`, `0-9`, `-`, 3 to 61 chars), or auto 48-hex         |
| `program` + `index`    | Which Kit service the alias points to                                   |
| `target_path`          | What a root request serves, with its own query; while `allow_path_override` is false, the root and `target_path` itself are the only paths served |
| `allow_path_override`  | `false` pins the alias: `/` (which lands on `target_path`) and `target_path` itself are served, any other path (sub-paths and page assets included) is a 404 `ALIAS_PATH_PINNED`, and `target_path`'s own query keys win over the visitor's; the method, body and other query keys pass. `true` (the default) forwards paths as sent. Either way anyone with the link can open it: restrict who may with proxy permissions |
| `expires_at`           | Timestamp after which the alias is automatically disabled               |
| `enabled`              | Disable without deleting (404s while off)                               |

> **What's safe to alias publicly?** An alias is a label, not a lock. Permission rules follow the *container*, so you cannot lock down only the alias. Publish aliases only for services you would otherwise make public: an `http-{port}` app, `exec` endpoint, `pipe`, or `tunnel`. Never publicly alias `terminal`, `files`, `sqlite`, `display`, or `browser` without first adding permission rules to the container; a label on a shell is still a shell. Delete aliases before deleting their container.

### Custom domains via CNAME

Aliases are stable subdomains, so any domain you own can front one with a single DNS record:

```text
CNAME  api.example.com  →  team-dashboard.node-example-1.containers.hoody.com
```

On the first request to `https://api.example.com`, Hoody's reverse proxy issues a TLS certificate on demand. That request may return a `503` with `Retry-After` while ACME issuance runs. Once issuance completes, the proxy forwards requests to the alias's container. Combine this with edge permission rules and realm-scoped API tokens for tenant isolation.

There is **no limit on how many domains you point in**. Use a different CNAME per service, customer, or environment, targeting the same or different containers. Each follows its target's [permission rules](#containers-are-open-by-default): control is per *target*, not hostname. Domains pointing to different containers or services can expose different things, but domains sharing a target also share its rules; a hostname cannot gate that target independently (see the alias note above). Your app receives each visitor's **real client IP** as the connection's own peer address (`remoteAddress` in Node.js, `REMOTE_ADDR` in PHP, `$remote_addr` in nginx), because netfilter hooks in the host kernel preserve the original client connection: there is no `X-Forwarded-For` to parse, though the edge still sets one alongside `X-Real-IP`. A dropped `exec` script reads the same value as `metadata.clientIp`. Geolocation, rate-limiting, and abuse rules work as they would on a dedicated server.

Unlike default container subdomains ([kept out of CT logs by the wildcard certificate](#containers-are-open-by-default)), a custom domain gets its own certificate, so its hostname **will** appear in public CT logs. Name it accordingly.

## Embed URLs

`hoody.embeds` builds the URL of one page of a kit's browser UI, such as the file editor, a terminal session, the cron manager or the SQLite studio, ready to open or put in an iframe. Each view is a typed function that takes the view's parameters; on a `withContainer()` client the container can be left out.

```typescript
hoody.embeds.files.editor(container, { params: { path: '/etc/hosts' } });
// https://{projectId}-{containerId}-files-1.{server}.containers.hoody.com/etc/hosts?edit=

box.embeds.cron.manager();
// https://{projectId}-{containerId}-cron-1.{server}.containers.hoody.com/
```

For a kit's own views, a parameter that writes or runs something, a value the edge sets from the hostname, or an index outside the published bounds throws `EmbedValidationError`, whose `code` names the rule (`PARAM_EXCLUDED`, `PARAM_FORCED`, `INDEX_OUT_OF_RANGE`, …). The host comes from `getKitUrl()`, so an embed URL and a kit API call address the same host. `buildEmbedUrl`, `listEmbedViews` and `getEmbedCatalog` do the same without a client. The CLI builds the same URLs: `hoody files open --view editor --path /etc/hosts --url` prints the first one. The parameter refusals do not cover three views: `http.content` and `https.content` pass any query to your own application, and opening `exec.script` runs your script with the query it carries.

Every view, with its parameters, framing and alias support, is listed in the [embed URLs guide](https://docs.hoody.com/guides/embed-urls/) and in the machine-readable [construction catalog](https://docs.hoody.com/embeds/catalog.v1.json), which also ships in this package: `import catalog from 'hoody-sdk/embeds/catalog.v1.json' with { type: 'json' }`. An iframe `src` carries the container's capability URL, so the [embedding-is-sharing note](#stream-any-gui-app-as-a-url) applies to every view.

## Drop a script, get an endpoint

Hoody's terminal, file, browser, and display primitives form a small, stable, typed base. What you build above them can grow without redeploying those primitives.

The `exec` namespace is the clearest example. Drop a TypeScript file into the container's `exec/scripts/` tree with one SDK call, or save it through VS Code or another attached editor:

```typescript
await box.exec.scripts.write({ path: 'api/build.ts', content: src, createDirs: true });
```

```typescript
// exec/scripts/api/build.ts  →  reachable as POST /api/build
// In a dropped script, req / res / metadata are ambient — no import, no wrapper.
const { branch } = metadata.query;   // typed flags when the script declares a schema
// The script runs inside the container — do the work, return JSON.
return { ok: true, branch };
```

Once saved, the function is reachable from **every** Hoody entry point without a rebuild or router config. The CLI caches its subcommand list; `--refresh-scripts` discovers a brand-new script:

| Caller          | How they reach `exec/scripts/api/build.ts`                                               |
|-----------------|------------------------------------------------------------------------------------------|
| CLI             | `hoody -c <containerId> exec api-build --method POST --query branch=main` (schema-less scripts default to `GET`) |
| SDK             | `await fetch(hoody.getKitUrl('exec', container) + '/api/build', { method: 'POST' })`      |
| HTTP            | `POST https://{projectId}-{containerId}-exec-1.{server}.containers.hoody.com/api/build`  |
| AI agent        | The endpoint is now in the agent's discovered tool catalog                               |
| Cron            | Add `// @schedule '0 * * * *'`, then arm it with `box.exec.schedules.reload()` (or `hoody exec schedules reload`) |
| Webhook         | Point any external system at the HTTP URL                                                |

A script can call other scripts, start cron jobs or daemons, hand control to an agent, or expose a tunnel back to your laptop. **The surface grows while the base methods, SDK, auth, and URL topology stay the same.** The full `exec` surface, including schema-typed flags, the `@schedule` magic comment, and the script tree, is in [`docs/reference/namespaces/exec.md`](./docs/reference/namespaces/exec.md).

## Hooks, a script on any request

Every call to a container capability URL (`files`, `terminal`, `agent`, `exec`, or any `http-{port}` app you started) passes through Hoody's proxy. A **hook** runs a [drop-in exec script](#drop-a-script-get-an-endpoint) before matching requests reach the service. The script has full container powers (read files, call other kits, `fetch()` the web) and can **inspect, rewrite, redirect, or block** the request. It acts as an edge worker inside your container, on your own metal.

```typescript
// 1. Author the hook — an exec script (Bun; the SDK is auto-loaded; it can fetch() anything).
await box.exec.scripts.write({ path: 'hooks/fresh-check.ts', content: src, createDirs: true });

// 2. Attach it to the `files` service, matching reads of /docs/spec.md:
const svc = await hoody.api.proxy.hooks.listByService(container.id, 'files');
await hoody.api.proxy.hooks.create(
  container.id,
  'files',
  { match: { method: 'GET', path: '/docs/spec.md' }, script: { path: 'hooks/fresh-check.ts' }, timeout: 5000 },
  { ifMatch: svc.data!.etag! },   // optimistic-concurrency tag, e.g. "file:v3"
);
// Now every fetch of /docs/spec.md through the files URL runs your script first — block it,
// redirect it, or fetch the upstream source and refuse to serve a stale copy.
```

Hooks operate on HTTP requests, first match wins, with up to 8 per service and a 30 s budget each. They see only requests through the proxy (a `GET` through the `files` URL, not a local `cat`). To capture what a service *returned* without changing it, use `box.proxyLogs.*`.

---

## Security model

Hoody's security model uses few primitives and explicit edges. A cross-zone call carries either a scoped bearer token or, for open containers, the capability URL itself (see [Containers are open by default](#containers-are-open-by-default)); a gated container adds whatever credential its permission rule's auth group expects. Ambient identity authorizes nothing.

### Trust zones

| Zone                                  | What it is                                                                | Trusts                                                                                | Does **not** trust                                                              |
|---------------------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| **Your machine** (laptop, server, CI) | Holds your bearer token in env, config, or memory                         | The control plane it points `baseURL` at                                              | Anything served *by* a container, which is untrusted code talking back           |
| **Control plane** (`api.hoody.com`)   | Account, billing, container provisioning, realms, tokens                  | A bearer token, issued by `/api/v1/users/auth/login` and re-checked on `/api/v1/users/auth/me` | Container file systems, processes, or anything inside `*.containers.hoody.com`    |
| **Your container**                    | A real Linux box running your code or a customer's                        | Whatever code you put in it                                                           | The control plane back. No automatic identity flows back the other way           |
| **A user's browser tab**              | Static page calling `api.hoody.com` directly                              | The token you put in `localStorage` / memory                                          | Cross-origin requests. The SDK strips `Authorization` once a request resolves to a host that is neither your `baseURL` host nor a subdomain of it |
| **Another container** (someone else's, or another of yours) | Equally a real Linux box                                | Nothing about your container                                                          | Anything about your container. No shared identity, no shared file system         |

The third row is important: **the control plane never gives a container access to your account.**

### The in-container `hoody` CLI is intentionally credential-less

Inside any Hoody container, the `hoody` binary is on every user's `$PATH` from a read-only plugin mount under `/hoody/plugins`. It is the same CLI as on your laptop, including `hoody chat` and `hoody containers list`, and talks to the same Hoody API.

The first authenticated call needs credentials **you** supply explicitly: a token, or a username and password the CLI signs in with. With no credentials at all the CLI stops locally with `No authentication credentials found`; a stale token gets a 401 from the API unless a username and password are configured, in which case the CLI signs in again and retries. There is no auto-login for "the user who owns this container"; otherwise, any code inside it (your scripts, an `npm install` post-install hook, a misbehaving dependency, or a compromised shell) could call the API as you and act on your *other* containers, billing, and realms.

So Hoody draws the trust line at the container boundary. Authenticate the in-container CLI explicitly, with the *narrowest* token that works:

```bash
# Inside the container — pick whichever fits the situation:
hoody login                                      # interactive sign-in
export HOODY_TOKEN=<a-realm-scoped-token>        # for scripts and CI
hoody --token <a-realm-scoped-token> containers list   # one-off, per call
```

A realm-scoped token only works on its realm's subdomain, so also give the CLI the realm: `--realm <realmId>` per call, or `export HOODY_REALM=<realmId>` for scripts and CI. Use the realm's 24-character hexadecimal ID, not its name.

Mint the in-container token with a narrow permission template (`external_customer`, `read_only`, or custom permissions) and short expiry. Set `realm_ids` to the intended realm and `allow_no_realm: false` so the token cannot be used outside it. A token is not bound to one container: its reach is whatever its permissions allow across that realm's resources, so use a dedicated realm when a container must not touch anything else.

### Defense layers, by where they live

<details>
<summary>Ten layers, where each lives and what it enforces</summary>

| Layer                          | Lives at              | Enforces                                                                                                         |
|--------------------------------|-----------------------|------------------------------------------------------------------------------------------------------------------|
| Bearer token + open CORS       | `api.hoody.com`       | Your identity. The SDK keeps `Authorization` only for your `baseURL` host and its subdomains (e.g. a realm subdomain). It is stripped for any other host and on cross-origin redirects, so your API token never reaches a `*.containers.hoody.com` Kit URL |
| Realm scoping                  | Control plane         | A token only sees resources tagged with one of its `realm_ids`; other resources aren't "forbidden", they don't exist |
| Container-ID-as-capability     | Reverse proxy         | The default access right is "knows the `(project, container)` tuple". Treat container IDs as confidential          |
| Permission rules               | Reverse proxy         | Per-container auth groups (IP / JWT / password / token / Hoody identity) with a default allow-or-deny policy, plus per-service hooks for path / method logic |
| Aliases & custom domains       | Reverse proxy + DNS   | Hide IDs behind your own domain; revoke by toggling `enabled=false`                                              |
| Local lock                     | Your laptop           | Encrypts CLI credentials at rest with XChaCha20-Poly1305, using key material derived from your password with argon2id |
| Automatic redaction            | The SDK               | Request `Authorization`, `Cookie`, `?token=…`, and body secret fields scrubbed before any error reaches your `catch` block ([full spec](#error-handling)) |
| Response signing (opt-in)      | The SDK               | On signing-enabled deployments, non-empty non-stream control-plane replies carry an Ed25519 `X-Hoody-Signature`; verify it with `verifyHoodySignatureHeader` to detect tampering |
| Public-SSH `bwrap` sandbox     | `gateway.hoody.com`   | Each [`ssh hoody.com`](#every-front-door) session runs in a fresh bubblewrap sandbox with seccomp, cgroup pids/cpu/mem caps, and an iptables egress lock pinned to `api.hoody.com:443` |
| In-container credential vacuum | Every container       | No ambient identity. The CLI is there; the trust isn't                                                           |

</details>

### Picking a posture

The layers combine into three common postures:

- **Development, open.** The capability URL is the password; fastest possible loop.
- **Staging, IP-restricted.** One permission rule pins the container to your office/VPN CIDR.
- **Production, locked down.** Permission rules default-deny with a token or JWT auth group at the proxy, realm-scoped API tokens for tenant isolation, aliases or your own domain in front so real IDs never circulate. Agents get their own realms; anything an agent will modify gets a snapshot first.

These layers are built in. Choose the one that fits your trust model, and keep container IDs and tokens off public surfaces.

---

## Namespaces

<!-- ref:sdk-namespaces -->21<!-- /ref:sdk-namespaces --> namespaces, <!-- ref:sdk-methods -->1212<!-- /ref:sdk-methods --> typed methods. Account-level (`hoody.api.*`) needs no container; everything else uses a container-scoped client (`box = await hoody.withContainer(c)`).

<details>
<summary>The full namespace map: scope, coverage, and a one-liner you'd actually call</summary>

| Namespace         | Scope     | What it covers                                                                          | One-liner you'd actually call                                              |
|-------------------|-----------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `api`             | Account   | Auth, tokens, containers, projects, realms, pools, users, billing, wallet, rentals, proxy permission rules, a secrets vault (encrypted client-side via the `encrypt`/`decrypt` helpers) | `hoody.api.containers.list()`                                              |
| `terminal`        | Container | Interactive shells, command exec, PTY sessions, system monitoring, GUI app launcher     | `box.terminal.run('uname -a')`                                             |
| `files`           | Container | CRUD, glob, grep, archives, downloads, 60+ cloud backends, WebDAV                       | `box.files.readText('/etc/hostname')`                                      |
| `browser`         | Container | Cloud Chromium: navigate, screenshot, eval, cookies, DevTools                       | `box.browser.page.captureScreenshot({ browser_id: '1' })`             |
| `display`         | Container | Remote desktop: mouse, keyboard, window manager, screen capture                        | `box.display.input.click({ x: 100, y: 200 }, { displayId: 1 })`         |
| `code`            | Container | VS Code Server: extensions, auth, static, vscode bridges                               | `box.code.extensions.install({ url: 'https://…/gitlens.vsix' })`          |
| `exec`            | Container | Drop-a-script-get-an-endpoint; see [Drop a script, get an endpoint](#drop-a-script-get-an-endpoint) | `box.exec.run('build')`                                      |
| `daemon`          | Container | Long-running processes; ephemeral one-shots                                             | `box.daemon.ephemeralPrograms.start({ user, command })`                          |
| `cron`            | Container | REST-driven cron entries and crontab edits                                              | `box.cron.entries.create('user', { schedule, command })`                  |
| `watch`           | Container | Filesystem watchers, event streams                                                     | `box.watch.watchers.create({ paths: ['/home/user'] })`                     |
| `sqlite`          | Container | SQL queries, KV store, query history                                                    | `box.sqlite.sql.queryReadOnly({ db: 'app', sql })`                    |
| `curl`            | Container | Outbound HTTP with scheduling, sessions, cookie persistence                             | `box.curl.run({ url, method: 'GET' })`                                 |
| `egress`          | Container | Outbound HTTP/CONNECT proxy; set a `socks5h`/`socks5`/`http`/`https` upstream to change the container's exit IP | `box.egress.upstream.set('socks5h://user:pass@host:1080')`                  |
| `pipe`            | Container | HTTP streaming channels for real-time data flow                                         | `box.pipe.send(path, body)`                                                |
| `run`             | Container | Hoody Run: resolve apps to shell commands across package sources (system-path, nixpkgs, pkgx, AppImage, OCI), profiles, recipes | `box.run.resolve({ app: 'firefox' })`                                      |
| `notes`           | Container | Collaborative docs, notebooks, comments, versioning, embedded DBs                       | `box.notes.notebooks.create({ name: 'plans' })`                            |
| `notifications`   | Container | Desktop notifications on a container display (`notify-send`), real-time stream          | `box.notifications.send({ summary, body, display: '0' })`        |
| `tunnel`          | Container | Reverse tunnels: publish HTTP/WebSocket to a public URL, or pull TCP onto container-loopback ([recipe](#reverse-tunnel-localhost-to-a-public-url)) | `box.tunnel.sessions.list()`                                                |
| `proxyLogs`       | Container | Reverse-proxy access logs and stats                                                     | `box.proxyLogs.list()`                                                |
| `bot`             | Container | Chat-app control: register a chat bot, run its poll loop, set who it serves, read its audit log ([front doors](#every-front-door)) | `box.bot.registrations.list()`                                             |
| `agent`           | Container | AI agent (<!-- ref:agent-sdk-methods -->326<!-- /ref:agent-sdk-methods --> methods): sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs ([recipe](#the-built-in-agent)) | `box.agent.sessions.turns.run(id, { text })`                              |

</details>

Useful hand-written helpers: `box.*` entries are client methods; the rest are package-root exports.

<details>
<summary>streamAgentPrompt, curl multiplexing, tunnel helpers, vault crypto, signature verify, events, notes upload</summary>

- **`streamAgentPrompt`** (Node.js/Bun) is the supported path for streaming agent turns ([recipe](#the-built-in-agent)).
- **`box.curl.channel.connect()` + `createCurlFetch`** give you a `fetch()`-compatible function that multiplexes many concurrent HTTP requests, SSE included, over one WebSocket.
- **`box.agent.importLocalConfig(tool)`** (Node.js/Bun) pushes local CLI-agent config into a Kit container ([recipe](#run-claude-code-or-any-cli-agent-and-drive-it-over-http)).
- **`box.tunnel.expose` / `box.tunnel.pull`** (Node.js or Bun) and **`box.tunnel.serve`** (Bun only) are the reverse-tunnel helpers ([recipe](#reverse-tunnel-localhost-to-a-public-url)); the package-root `tunnelExpose` / `tunnelPull` / `tunnelServe` take an explicit URL, and `TunnelSession` carries the low-level session / bind / frame primitives.
- **`encrypt` / `decrypt` / `isEncrypted` / `parseEnvelope`** are client-side vault crypto for `hoody.api.vault.*` (errors surface as `VaultCryptoError`).
- **`getHoodySignatureHeader` / `parseHoodySignatureHeader` / `verifyHoodySignatureHeader`** parse and cryptographically verify the Ed25519 `X-Hoody-Signature` response header the control plane signs (`parseHoodySignatureFrom` / `verifyHoodySignatureFrom` take a whole response object; `verifyHoodySignatureFromContext` takes a response middleware's context, and `hoodySignaturePath` gives the path a request URL is signed under).
- **`hoody.events`** (an `EventsClient`) carries real-time platform events, with recovery from history ([Real-time events](#real-time-events)); `hoody.api.events.*` is the REST history. The catalog helpers `EVENT_TYPES`, `EVENT_CATALOG`, `isEventType` and `expandEventPattern` are package-root exports.
- **`box.notes.files.upload`** creates a notebook file node and uploads its bytes over TUS; **`resumeUpload`**, **`uploads.getOffset`** and **`uploads.cancel`** continue, inspect and abandon an interrupted upload. `generateNotesFileId`, `encodeTusMetadata` and `NOTES_UPLOAD_CHUNK_BYTES` serve callers that drive TUS themselves.
- **`pipeTransportFromClient(client)`** returns a pipe transport that sends through the client's own HTTP transport (its injected fetch, middleware and `kitAuth`) rather than the global `fetch`.
- **`withTokenQueryParam(url, auth)`** puts a Kit token credential in the query parameter its `param` names, for URLs you open yourself.
- **`TwoFactorRequiredError`**, **`isRealmScopeError`** and the `HttpClient` transport class are exported from the package root, and every generated request and response type is importable type-only: `import type { DaemonProgramsCreateRequest } from 'hoody-sdk'`.

</details>

## Real-time events

`hoody.events` delivers changes to your account as they happen: a container starting, an alias being created, a share expiring, a payment clearing. Each client instance has its own stream, opened on first use (a client built with credentials logs in first); a `withRealm` client sees only that realm's events. `hoody.api.events.*` stays the plain REST history.

```typescript
const off = await hoody.events.on('container.*', (event) => {
  console.log(event.type, event.resource_id, event.data);
}, { filter: { projectId } });

// Start a container and wait for it to run. The action runs only once the stream
// has caught up, so its event cannot be missed, even on a fresh connection.
const running = await hoody.events.waitFor(
  'container.running',
  { resourceId: containerId },
  () => hoody.api.containers.start(containerId),
  { timeoutMs: 120_000 },
);
```

Names are checked against the event catalog: `'container.*'`, `'container.snapshot.*'` and `'*'` are patterns, and a misspelt type or prefix is a compile error and a runtime `TypeError`, never a handler that silently stays quiet. `event.data` is typed per event type from the same catalog. A few names are reserved: declared, but never emitted. `isReservedEventType(name)` tells you which, and subscribing to one simply never fires.

**Connection.** The socket stays open while something needs it: a handler from `on()`, a `stream()`, a pending wait, or a running `bootstrap()`. `ready()` resolves once the stream is live and holds the connection only while it waits, so on its own the socket closes again once it resolves. Register handlers first, or use `waitFor`, `prepareWait` or `bootstrap`, which hold the connection themselves.

**Delivery.** Every persisted event carries a `cursor`. After a disconnect the SDK reconnects on its own (backoff from 1 s to 30 s), reads what it missed from history, and delivers it with `replayed: true`. An event reaches each subscription once, even when the socket and history both carry it. Delivery is at least once across the live stream and history, for events up to 90 days old, and only for what the current credential may read. A single socket frame is never promised on its own, and GET is the source of truth for current state.

**Gaps.** When continuity cannot be restored (the resume point expired or became invalid, the history was deleted, or too much was missed), the stream resumes from its current boundary and `onState` reports `{ kind: 'gap', reason }`. Re-read with GET whatever you keep in sync:

```typescript
hoody.events.onState((s) => {
  if (s.kind === 'gap') void reloadEverything();
  if (s.kind === 'state') console.log(s.previous, '->', s.state);   // idle, connecting, recovering, live, offline, closed
});
```

**A consistent starting state.** `bootstrap(readFn)` waits until the stream has caught up, runs your GET calls, and returns them with the resources that events touched meanwhile. It holds the connection for its whole run, so it works without any other subscriber. Refetch those; never apply an event payload over a snapshot.

```typescript
const { snapshot, touched } = await hoody.events.bootstrap(() => hoody.api.containers.list());
for (const { resource_type, resource_id } of touched) { /* GET it again */ }
```

**Resuming a process.** `stream()` is the same feed as an async iterator. Each event it yields carries `resume_after`. Save it after you handle the event, and pass it back as `after` to continue where you stopped. With `after`, the iterator yields the missed history first, in order; live events that arrive meanwhile wait behind it:

```typescript
for await (const event of hoody.events.stream({ types: ['proxy.alias.*'], after: saved, signal })) {
  await handle(event);
  saved = event.resume_after ?? saved;
}
```

Resuming never skips an event but can repeat some, so de-duplicate by `id`. Don't save `event.cursor` for this: it is the event's own position, and an event recovered from history can arrive after later ones, so resuming after its cursor can skip events the loop has not seen yet. `resume_after` is `null` only when the server keeps no history. Transient history errors (503, 429, a dropped connection) are retried with the reconnect backoff; only a terminal error ends the iterator. Each retry is reported through `onState` as `{ kind: 'notice', code: 'EVENTS_HISTORY_RETRY', message, attempt, delayMs }`, where `attempt` counts from 1 for each history page and `delayMs` is the wait before the next try.

The iterator marks the first event after any loss with `gap_before: { reason, dropped? }`; when you see it, refetch what you show. Losses include a resume point passed as `after` that history can no longer honour (or `after` on a server that keeps no history, reported as `cursor_invalid`), and a loop that falls more than `maxBytes` (default 8 MiB) behind, which drops the oldest buffered events (`reason: 'overflow'`, with the `dropped` count). `onState` also reports every gap; one with `stream: true` affected only that iterator. `onGap: 'throw'` ends the iterator with `EventsGapError` instead.

**Operations.** Starting, stopping, copying or syncing a container returns an `operation_id`, and the outcome arrives as `container.operation.completed` or `container.operation.failed` with the same `operation_id`. Server commands do the same with `server.command.*`. `.completed` means the command finished with exit code 0. Any other ending is `.failed`, with `reason_code` `nonzero_exit`, `timeout`, `terminated` or `failed`. The payload carries `status`, `exit_code` and `reason_code` in `data.operation` (container operations) or `data.command` (server commands).

**Activity.** `activity.logged` (one event per API request you make) is live only: it has `cursor: null`, is never replayed, and losing one never causes a gap. Wildcards leave it out; name it, or pass `includeEphemeral: true`, to receive it.

**Scope.**
- Account-wide events (notifications, pools, billing, image library) never reach a realm-scoped client.
- Global events (broadcast notifications and `server.offer.*`) arrive on the stream and through cursor history, never through offset-paged history (`GET /api/v1/events` without `after`).
- A token receives the event types its permissions allow for the matching reads. A permission or realm added to a token applies from its next connection. One removed applies at once.
- `logout()`, `logoutAll()`, `login()`, `adoptSession()`, `setToken()`, `setSessionToken()` and a direct `api.auth.logoutAll()` end the stream's session. Pending waits reject with `EventsSessionChangedError`, handlers stay registered and reconnect once the new session has a token, and no resume point carries over into it.
- A token restricted to realms must be used through `withRealm()`. An unscoped client is refused with `REALM_REQUIRED`, which is terminal.
- A refused or revoked stream raises `EventsAuthError`.

**History pagination.** `GET /api/v1/events` also accepts `after` (a cursor) and `bootstrap=true`. In those modes `pagination` carries `next_cursor` and `latest_cursor`, `total` is `-1` (not computed) and `offset` is `0`.

## Error handling

```typescript
import {
  ApiError,
  ValidationError,
  VaultCryptoError,
  isApiError,
  isRetryableApiError,
} from 'hoody-sdk';

try {
  await box.files.get('/nonexistent');
} catch (err) {
  if (isApiError(err)) {
    console.error(err.status);    // HTTP status code, or 0 for a transport, timeout, or parse failure
    console.error(err.code);      // error code, may be undefined: server-supplied on HTTP errors; from the client 'ABORTED' (your signal), 'ETIMEDOUT' (a timeout) or 'PARSE_ERROR'
    console.error(err.response);  // parsed server body (ApiErrorResponseDetails | unknown — plain text on non-JSON errors)
    console.error(err.request);   // { method, url, headers, body, query } — secrets redacted

    if (isRetryableApiError(err)) { /* 408/425/429/500/502/503/504 — safe to replay an idempotent op */ }
  }
}
```

- **`ApiError`** is thrown on HTTP 4xx/5xx, and on transport, timeout, and parse failures with `status: 0`. Same class across browser, Node.js, and CLI. On an HTTP error, `code` comes from the body (a `code` field, an upper-case code in `error`, or `error.code`), else from the `X-Hoody-Error-Code` response header, which is the only place a `HEAD` answer can carry one.
- **`ValidationError`** is client-side input validation (missing required args, bad enum / range / pattern) before the request goes out; TypeScript handles most body-shape checking.
- **`VaultCryptoError`** is thrown by `decrypt` / `parseEnvelope` with a `.kind` discriminator (`'invalid-envelope'`, `'unsupported-version'`, `'invalid-kdf'`, `'decrypt-failed'`). The underlying backend error is preserved via `.cause`.
- **`isApiError()` / `isRetryableApiError()`** are type guards that work across module boundaries.
- **Automatic redaction.** The attached request context (`err.request`, `err.url`) scrubs `Authorization`, `Cookie`, `Proxy-Authorization`, `x-*-token`, `x-*-key`, URL query params (`?token=…`, `?apikey=…`), URL userinfo, and secret body fields (password / token / apikey / …) to `[REDACTED]` before the error reaches your `catch` block. This keeps your credentials out of exported Sentry / Datadog / structured logs. Two caveats: redaction is pattern-based, so you must scrub secrets sent under nonstandard field names; and `err.response` / `err.message` contain the server's reply verbatim. Sanitize them if your backend may echo sensitive data rather than treating the whole `ApiError` as safe to export.

## TypeScript

All types are included, and all methods have typed parameters and return values, with inferred response types. Runtime helpers such as `ApiError` and `ValidationError`, along with types such as `IHttpClientMiddleware`, are available from the package root. Response precision varies: request parameters are comprehensively typed, but a fair number of response payloads use loose `data` types (`unknown` or `Record<string, unknown>`). `box.agent.*` is the main example because it returns verbatim daemon replies; assorted methods in `terminal`, `exec`, `curl`, `daemon`, `notifications`, and other namespaces do the same. Expect occasional casts or presence checks, as the [agent recipe](#the-built-in-agent) does for `session_id`; each generated response type shows its exact shape.

```typescript
const { data } = await hoody.api.containers.list();
// `data` is fully typed — data.containers![0]!.id, .name, and every field below.
```

## Retry, middleware, token refresh

### Per-request overrides

Every service method accepts per-call options for retry budget, response shape, and timeouts without rebuilding the client:

```typescript
await box.files.get('/bigfile', {
  retries: 5,
  retryDelayMs: 500,               // base for exponential backoff; up to 50ms random jitter; capped at 30s
  retryOnStatuses: [502, 503, 504],
  responseType: 'arrayBuffer',     // 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob'
  timeoutMs: 60_000,
  signal: AbortSignal.timeout(120_000),
});
```

Per-call `headers` add request headers to one call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and refused there. A direct call to a kit service that takes its own `headers`, such as `box.exec.run(…)` with `headers: { Authorization: 'Bearer …' }` in its options, does deliver that `Authorization` to the script. The account token is still never sent to a kit.

`timeoutMs` bounds the wait for the response headers (code `ETIMEDOUT`, "Request timed out after <ms>ms"); a buffered body then fails with code `ETIMEDOUT` only when no data arrives for that long. A call your `signal` aborts fails with code `ABORTED` and the message "Request aborted by the caller", followed by the reason when you passed one to `abort()`. Neither is retried. GET responses are not cached unless you turn it on, with `cache: { enabled: true, ttl }` on the client or `cache: true` (or a TTL in milliseconds) on one call.

### Middleware

```typescript
import type { IHttpClientMiddleware } from 'hoody-sdk';

const tracing: IHttpClientMiddleware = {
  onRequest: async (ctx) => { /* mutate headers, inject request-id, etc. */ return ctx; },
  onResponse: async (ctx) => { /* observe latency + status */ },
  onError:    async (ctx) => { /* ship err to observability; a throw here never replaces the real error — Node logs it via console.error, the browser build stays silent */ },
};

const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  middlewares: [tracing],
});
```

Middleware runs on every retry attempt. If `onRequest` throws, retries and `onError` handle it like a transport failure.

A middleware can change where a request goes, with limits:

- A call made through a generated method still reaches the realm it was made for. If a middleware moves it to another host inside the API (the account host or a realm host), the SDK sends it back to the host the method chose.
- A request that a middleware sends outside the API goes where the middleware sent it, but without the credentials the client would otherwise attach. The SDK refuses to send its own login, 2FA and token calls there at all.
- The request body is not filtered. If a call carries a secret you supplied, such as a new password for `api.users.update` or a proxy password-group setting, that secret goes wherever a middleware routes the request. The SDK only withholds credentials that it sends itself.
- The SDK's own login, 2FA and token-refresh calls refuse HTTP redirects.

`onResponse` receives the response with its body unread, so a middleware can read it (`await ctx.response.text()`). Set `captureRawBody: true` on the client to also get the exact response bytes as `ctx.rawBody`, which is what `verifyHoodySignatureFromContext(ctx, publicKey)` checks a response signature against. A direct `HttpClient` request also accepts the option per request; generated service methods do not expose it.

Two ways around these rules exist, both deliberate. `hoody.http.getFetch()` returns the raw fetch function the client was given: a request made with it runs no middleware and none of the SDK's realm or credential handling. And `new HttpClient(config)` is a plain transport: the session and realm routing belong to `HoodyClient`, and token recovery runs only through the `onTokenExpired` or `refreshToken` callbacks you configure.

### Token refresh callback

For token-only flows with no username/password on file, supply an `onTokenExpired` callback. On 401, the SDK calls it once, adopts the returned token, and replays the request. There is no global state or login race; concurrent 401s coalesce into one refresh.

```typescript
import type { ApiError } from 'hoody-sdk';

const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: initialToken,
  onTokenExpired: async (error: ApiError) => {
    const refreshed = await myAuthService.refresh();
    return refreshed ?? undefined;   // undefined → let the 401 surface as ApiError
  },
});
```

A few security and retry defaults worth knowing:

- **Cross-origin auth strip.** `Authorization` is kept only when a request resolves to your `baseURL` host or a subdomain of it (same protocol). Realm subdomains stay authenticated, but any other host (and cross-origin redirects) has it dropped before fetch, so a Kit URL on `containers.hoody.com` handed to an AI agent cannot leak your API token.
- **Non-replayable bodies.** `ReadableStream` and async-iterable bodies are detected; retries on those fail fast instead of replaying an empty body.
- **RFC 9110 Retry-After.** Integer-seconds and HTTP-date forms are parsed, clamped to 30s, and respected over local backoff on any retried error status (typically 429 / 503).

## Every front door

The SDK is one of several access paths. Terminal, browser, AI chat, and CI all reach the same control plane and per-user containers. One auth token works across them, and the CLI over `ssh` is the same `hoody` binary run by `npx hoody-sdk` and shipped in this package.

A chat app is another front door. `hoody bot create` registers a chat bot against one of your containers and `hoody bot start` runs its poll loop; from then on the commands you can send from the chat are the operations enabled in the bot's built-in chat manifest (it leaves some CLI operations out), each one behind a risk gate that asks for a tapped or a typed confirmation before anything destructive runs. You log in through the bot as yourself, so every command runs with your own token and lands in a per-actor audit log. Telegram is the channel implemented today, and the surface is written to be chat-app neutral. This is not `hoody chat`, which answers questions about Hoody at your terminal and controls nothing. Reference: [`bot` namespace](./docs/reference/namespaces/bot.md).

<details>
<summary>Every front door: SSH (three ways), npx, static binary, npm, WebOS, and any AI chat</summary>

| Front door                                            | What it does                                                                              | Best for                                                            |
|-------------------------------------------------------|-------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **`ssh hoody.com`**                                   | Drops you straight into the Hoody CLI in a memory-only sandboxed shell. No install. Sign in interactively, or paste a token at the prompt. | Reaching your account from any laptop, jump box, or remote host with `ssh`. |
| **`ssh hoody_<token>@hoody.com`**                     | Same as above, but the SSH username carries your auth token, so the sandbox auto-authenticates the moment the connection lands. Use a narrow, short-expiry token: the username is visible in shell history and host logs. | Scripts, cron, one-liners, CI pipelines, with no interactive step. |
| **`ssh.hoody.com`** *(WebSSH)*                        | The same SSH shell, in your browser, a full terminal with nothing to install. Sign in and you're at a prompt on any device. | A shell from a locked-down laptop, a phone, or any machine without an `ssh` client. |
| **`npx hoody-sdk`** *(or `bunx`, `pnpm dlx`)* | Run the latest `hoody` CLI without installing anything globally. | Quick checks from a workstation that already has Node.js or Bun. |
| **`curl -fsSL https://install.hoody.com \| sh`** *(Windows: `iwr https://install.hoody.com/install.ps1 -UseB \| iex`)* | Download a single native binary for your platform, with no Node.js runtime needed. | Air-gapped boxes, container build steps, locked-down CI. |
| **`npm i hoody-sdk`** | Install this very SDK from the npm registry, and pin a version in production. Install guide: `sdk.hoody.com`. | TypeScript / JavaScript projects of any shape. |
| **`os.hoody.com`**                                    | A full Hoody WebOS in any browser. The UI itself is served by *your own* container; `os.hoody.com` only signs you in and forwards you there. The OS *is* your container. | Users on phones, tablets, Chromebooks, ChromeOS-Flex laptops; anyone without a terminal. |
| **`@hoody.com`**                                      | Paste `@hoody.com` into ChatGPT, Claude, Gemini, Codex, Cline, Roo Code, or any web-fetching agent. The agent fetches a Skill, a structured HTTP map of every Hoody capability, and drives your account with a token you give it, with no SDK, MCP server, or plugin in between. | Letting any web-fetching AI assistant operate Hoody from a paste plus a scoped token. |

</details>

## CLI

The CLI is the `hoody` command shipped in `hoody-sdk`. Run it without a global install or project dependency:

```bash
npx hoody-sdk login  # interactive sign-in (or OAuth) — also bunx / pnpm dlx
npx hoody-sdk containers list   # list containers (grab a container id)
npx hoody-sdk -c <containerId> terminal commands run --ephemeral --command "uname -a"
npx hoody-sdk -c <containerId> files get /etc/hostname
```

After a global install, run each `hoody <args>` example below without the `npx hoody-sdk` prefix.

**Signing in.** `hoody login` is the interactive front door:

```bash
hoody login                                  # prompts for a method, then credentials
hoody login --web                            # OAuth via your browser (GitHub / Google / existing session)
hoody login --email you@example.com -p       # prompt for the password securely (never echoed)
hoody login -u alice -p "$HOODY_PASSWORD"    # supplies credentials up front (add global --non-interactive to refuse any 2FA/onboarding prompt; keep secrets out of shell history)
hoody signup                                 # create an account, verify, and land logged in
hoody logout                                 # sign out of this device (--all ends every session of the account)
```

`--web` uses an RFC-8628-inspired device flow with RFC 7636 PKCE. The device grant is deliberately not standards-compliant: no `client_id`/`grant_type`. Polling starts at the server-provided interval (5 seconds when it gives none) and adds 5 seconds after each `slow_down`. The CLI prints a short code and URL, opens a browser when possible, then completes login after approval. Browser opening is suppressed by `--no-browser`, `--print-token`, a machine-readable output mode, or a non-interactive session. `hoody login` and `hoody signup` are the sign-in commands. Every method has a flag form for scripts, and `hoody login --print-token` prints the session token.

Or install the SDK package globally for the `hoody` command:

```bash
npm install -g hoody-sdk           # installs the `hoody` command
hoody login
hoody containers list
```

> The command is `hoody`; `npx hoody-sdk` runs the same CLI without adding a project dependency.

**Running from a clone.** The GitHub repository ships the **prebuilt** CLI and SDK (`cli/dist`, `dist-ts`, browser bundles), not the build toolchain or CLI TypeScript source. The `hoody` command runs directly from the checkout with no build step.

<details>
<summary>Run the prebuilt CLI from a clone</summary>

```bash
git clone https://github.com/HoodyNetwork/hoody-sdk.git && cd hoody-sdk
npm install            # runtime deps only (the repository ships a prebuilt cli/dist)
npm link               # puts `hoody` on your PATH, served from this checkout
hoody login && hoody containers list
```

Prefer no global command? Run the prebuilt entry point directly, so every `hoody <args>` becomes `node cli/dist/index.js <args>`:

```bash
node cli/dist/index.js login                  # then `cli/dist/index.js <args>` for any command
```

Both paths expose the same command tree as the npm package, using your checkout instead of the published tarball.

</details>

See the [CLI commands reference](./docs/reference/CLI-COMMANDS.md) for the full command reference.

**Pipe-friendly output.** Generated request commands accept global `--output <format>` values of `table`, `json`, `yaml`, `wide`, or `raw`; streaming commands (agent streams) accept `ndjson` (default), `pretty`, or `raw`. Dynamic exec-script commands render only `json`/`raw`; any other mode falls back to JSON for objects but still emits a top-level string result as-is, under the same add-a-newline-only-if-missing rule as `raw`. Some hand-written commands have their own flags, such as `hoody mount --list --json` (mount's `--json` reports on `--list`/`--prune` and on a successful mount, not on a usage error) and `hoody local lock status --json`. `--output raw` prints a string response body as-is, appending a trailing newline only if one is missing; for objects it emits the first string field among `content`, `data`, `body`, and `text`, and falls back to formatted JSON (with a stderr warning) only when none of those is a string. This is useful for piping file contents, logs, or `package.json` without unpacking an envelope with jq.

**Dynamic script commands.** Eligible scripts under `exec/scripts` become subcommands at `hoody exec <name>` (for example, `api/reports.ts` → `hoody exec api-reports`); reserved names, internal scripts, and command-name collisions are skipped. Declared schemas produce type-aware flags for top-level fields, and only `integer`/`number`/`boolean` keep their type. Every other property, including nested objects and arrays, becomes a string flag. Schema-typed commands register **no** `--body`, so use the SDK for nested structures. Schema-less scripts accept `--method`, repeatable `--query k=v`, and `--body @file.json`. Pass `-c <containerId>` to target a container, or use the configured default. After adding or editing a script, `--refresh-scripts` bypasses the discovery cache.

### Secret storage, lock mode

`hoody local lock` encrypts CLI credentials at rest with XChaCha20-Poly1305 using key material derived from a user password with argon2id. While locked, `config.json` stores `{"token": {"__locked__": "v1"}}` sentinels instead of plaintext for every sensitive field: `refreshToken`, `kitToken`, `kitPassword`, and the routing defaults `container`, `project`, `realm`. `kitPassword` is the odd one out: setup will encrypt a legacy hand-written value, but `hoody config set kitPassword` is refused outright and the runtime never reads it back from the lock: kit password auth comes only from `HOODY_KIT_PASSWORD` / `HOODY_KIT_PASS`. The account login `password` is the exception: it is removed from `config.json` instead of encrypted, so it never sits at rest.

```bash
hoody local lock enable                  # prompts for a password; exits 11 if the
                                         # config has no plaintext field to lock yet
hoody local lock status
HOODY_LOCAL_PASSWORD=… hoody containers list   # unlocks for this invocation only
hoody local lock disable                 # needs the current password AND confirmation;
                                         # DELETES the stored tokens and routing
                                         # defaults unless you pass --write-plaintext
```

Lock mode is a CLI-only feature; SDK consumers don't interact with it.

### `hoody chat`, the documentation assistant

`hoody chat` asks Hoody's documentation assistant, from your terminal. It is **free** and needs **no API key, no model choice, and no account**, so there is nothing to configure before the first question.

```bash
# One-shot — pipe-safe, streams the answer to stdout:
hoody chat "how do I list containers on a specific server?"

# Interactive REPL — follow-up questions resolve against earlier turns:
hoody chat

# Persistent session (opt-in; transcripts are not saved by default, though
# ~/.hoody/chats is still created — --private keeps the session in memory, with
# no chat-store reads or writes; the local-lock preflight still stats ~/.hoody):
hoody chat --persist

# Leave nothing on disk at all:
hoody chat --private "what is a realm?"
```

Answers are grounded in the Hoody documentation and cite the pages they came from. Scope is Hoody itself: the platform, CLI, SDK, API, and code meant to run on it. Unrelated questions are declined. It answers questions and runs nothing, which is what separates it from the `bot` namespace, where a chat user drives real commands.

It is deliberately non-agentic: it produces text and cannot read files, run commands, or reach your container. For that, use [`hoody agent`](./docs/reference/CLI-COMMANDS.md).

Free means metered: 30 questions/hour, 2000 characters per question.

Full command reference: [Chat guide](./docs/reference/guides/chat.md).
Privacy model and data-retention details: [Chat privacy](./docs/reference/guides/chat-privacy.md).

## API reference

- [SDK method reference](./docs/reference/SDK-METHODS.md), full method listings for all <!-- ref:sdk-namespaces -->21<!-- /ref:sdk-namespaces --> namespaces, plus the main client helpers
- [Per-namespace docs](./docs/reference/namespaces/_INDEX.md)
- [CLI commands](./docs/reference/CLI-COMMANDS.md)
- [HTTP endpoint map](./docs/reference/HTTP-METHODS.md), every SDK-backed HTTP method + path ↔ its SDK method, and its CLI command where one exists
- OpenAPI spec, shipped in the package as JSON and YAML: `import spec from 'hoody-sdk/openapi.json' with { type: 'json' }`, or `require.resolve('hoody-sdk/openapi.yaml')` and parse with any YAML library
- [Changelog](./CHANGELOG.md)

## Versioning & support

This SDK follows [semantic versioning](https://semver.org/). Prerelease versions may introduce breaking changes; after the stable 1.0 release, breaking changes land only in major releases. Questions, bugs, and feature requests go to [GitHub Issues](https://github.com/HoodyNetwork/hoody-sdk/issues); platform guides live at [docs.hoody.com](https://docs.hoody.com). Found a security issue? Please report it privately via [GitHub security advisories](https://github.com/HoodyNetwork/hoody-sdk/security/advisories/new) rather than a public issue.

## License

Apache-2.0. See [LICENSE](./LICENSE).

---

<p align="center">
  Spin up a container and make your first URL. <a href="https://hoody.com/signup"><strong>Get a free server →</strong></a>
</p>

<p align="center">
  <a href="https://hoody.com"><strong>hoody.com</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://docs.hoody.com"><strong>Documentation</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com/SKILLS/"><strong>AI Skills</strong></a>
</p>
