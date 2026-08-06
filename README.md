<p align="center">
  <picture> 
    <source media="(prefers-color-scheme: dark)" srcset="./assets/hoody-logo-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/hoody-logo-black.svg">
    <img alt="Hoody" src="./assets/hoody-logo-black.svg" width="240">
  </picture>
</p>

<p align="center"><strong>Everything is a URL.</strong></p>

<p align="center"><em>Durable Linux containers, every capability as a typed HTTP API —</em><br/>
<em>terminal, files, cloud browser, GUI display, AI agent, cron, and tunnels, callable from Node.js, Bun, or a plain browser tab. No proxy server or backend of your own to run.</em></p>

<p align="center">
  <a href="https://www.npmjs.com/package/hoody-sdk"><img src="https://img.shields.io/npm/v/hoody-sdk.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="license Apache-2.0"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg" alt="TypeScript 5.0+">
  <img src="https://img.shields.io/badge/runtime-Node.js_%7C_Bun_%7C_Browser-green.svg" alt="Node.js | Bun | Browser">
</p>

<p align="center">
  <a href="https://hoody.com/signup"><b>Get a free server &rarr;</b></a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com">Website</a> &nbsp;&middot;&nbsp;
  <a href="https://docs.hoody.com">Docs</a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com/SKILLS/">AI Skills</a>
</p>

---

TypeScript SDK for [Hoody](https://hoody.com). Hoody runs full Linux containers and exposes their terminal, files, browsers, AI agent, GUI display, cron, databases, notifications, and tunnels through one typed HTTP API, callable from Node.js, Bun, a browser, or any network device (including IoT devices). You build on stable primitives: the client, auth model, and URL layout do not change as your product grows. Think of it as **"Linux as HTTP".**

| | |
|---|---|
| **Batteries included** | Create a container with the Kit (`hoody_kit: true`) and the full service layer is available at stable HTTPS URLs: shell, files, cloud browser, GUI desktop, databases, cron, tunnels, and a built-in AI agent, each starting on demand with the first call. |
| **Who it's for** | Cloud IDEs, AI-agent platforms, browser-automation pipelines, remote-desktop products, and education: anything that needs a real Linux environment on demand without running the infrastructure. |
| **The economics** | Flat-rate bare metal: a dedicated machine, marketplace-priced from ~$30/month, with no per-container fee or usage meter. Run dev through prod for every project on one box. [How ↓](#bare-metal-underneath) |
| **The surface** | 19 namespaces · <!-- ref:sdk-methods -->1095<!-- /ref:sdk-methods --> typed SDK methods · <!-- ref:cli-commands -->835<!-- /ref:cli-commands --> CLI commands, with one client, one URL grammar, and every auth mode handled by the SDK. |

**Prefer references?** Nearly the whole surface fits in three lists: [CLI commands](./docs/reference/CLI-COMMANDS.md) · [SDK methods](./docs/reference/SDK-METHODS.md) · [HTTP endpoints](./docs/reference/HTTP-METHODS.md). The HTTP list maps every endpoint to its SDK method and to a CLI command wherever one exists.

**At a glance** — one account client (`hoody.api.*`) plus eighteen container-scoped `box.*` Kit namespaces:

`terminal` · `files` · `browser` · `display` · `code` · `exec` · `daemon` · `cron` · `watch` · `sqlite` · `curl` · `pipe` · `run` · `notes` · `notifications` · `tunnel` · `proxyLogs` · `agent` — [full table ↓](#namespaces)

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

- **Start here** — [Everything is a URL](#everything-is-a-url) · [Installation](#installation) · [Quickstart](#quickstart)
- **Concepts** — [Core concepts](#core-concepts) ([one client, two scopes](#one-client-two-scopes) · [URL anatomy](#anatomy-of-a-hoody-url) · [open by default](#containers-are-open-by-default) · [bare metal](#bare-metal-underneath) · [self-host](#self-host-anything-durably) · [authentication](#authentication))
- **Build** — [What you can build](#what-you-can-build) ([no backend](#your-backend-is-optional) · [CLI agents](#run-claude-code-or-any-cli-agent-and-drive-it-over-http) · [LLM shell](#give-an-llm-a-real-bash-terminal) · [GUI streaming](#stream-any-gui-app-as-a-url) · [Linux tools](#use-real-linux-tools-over-http) · [tunnels](#reverse-tunnel-localhost-to-a-public-url) · [built-in agent](#the-built-in-agent) · [everything else](#everything-else-in-the-box)) · [Build your platform on Hoody](#build-your-platform-on-hoody) ([multi-tenancy](#give-your-own-users-their-own-hoody-api)) · [Aliases and custom domains](#aliases-and-custom-domains) ([custom domains via CNAME](#custom-domains-via-cname)) · [Drop a script, get an endpoint](#drop-a-script-get-an-endpoint)
- **Trust** — [Security model](#security-model)
- **Reference** — [Namespaces](#namespaces) · [Error handling](#error-handling) · [TypeScript](#typescript) · [Retry, middleware, token refresh](#retry-middleware-token-refresh)
- **Everywhere** — [Every front door](#every-front-door) · [CLI](#cli)
- **Meta** — [API reference](#api-reference) · [Versioning & support](#versioning--support) · [License](#license)
</details>

## Everything is a URL

A Hoody container is a full Debian Linux machine with systemd, `apt`, its own filesystem and process tree, and a boot time measured in seconds. Create it with the **Kit** service layer preinstalled (`hoody_kit: true`, as the [Quickstart](#quickstart) does), and each service below gets a stable HTTPS URL once the container is running. Services load on demand with the first call:

```text
https://{projectId}-{containerId}-{service}-{index}.{server}.containers.hoody.com
```

Each URL below is a building block, already running and wired together when the container exists:

| `{service}` | What answers there | The wheel you never rebuild |
|---|---|---|
| `terminal` | A real bash shell | No SSH keys, `sshd`, or PTY plumbing — run and stream commands over HTTPS. |
| `display` | A live GUI desktop | Stream any X11 app to a browser tab; no VNC server or RDP gateway to stand up. |
| `browser` | A cloud Chromium — drive it by API *or* open the URL to watch it live | Scrape and automate without hosting a Selenium/Playwright grid or a rendering box. |
| `code` | VS Code in the browser | A full IDE per container; no workspace server to deploy. |
| `agent` | A built-in AI coding agent | Claude & co. driving the machine over HTTP; no agent runtime to build. |
| `files` | The filesystem | Read, write, glob, grep, WebDAV, 60+ cloud backends — no SFTP daemon or storage SDK. |
| `sqlite` | SQL + a KV store | A per-container database with zero setup; nothing to provision or connect. |
| `notes` | Collaborative docs | Real-time multiplayer editing; no CRDT/OT sync layer to write. |
| `daemon` | A process supervisor | Long-running programs with restarts and logs; no systemd unit or pm2 wiring. |
| `cron` | A scheduler | Recurring jobs over HTTP; no crontab access or job runner to host. |
| `exec` | Your scripts as endpoints | Drop a file, get an authenticated HTTPS endpoint; no function platform. |
| `watch` | Filesystem watchers | React to file changes as events; no inotify plumbing. |
| `curl` | Outbound HTTP jobs | Fetches and webhooks that run from inside the container; no worker queue. |
| `pipe` | Streaming channels | Pub/sub and byte streams between clients; no message broker to run. |
| `tunnel` | Reverse tunnels | Publish localhost or a container port to a public URL; no ngrok. |
| `n` | Push notifications | Deliver alerts out of the container; no notification service to wire up. |

The grammar stays the same; bump the `{index}` for a second terminal or display ([full anatomy](#anatomy-of-a-hoody-url)). Nothing needs wiring first: no SSH keys, VNC ports, SFTP daemon, reverse-proxy config, or certificates. Every URL is HTTPS, with HTTP/2 and HTTP/3 negotiated automatically. Destroy the container and its URLs disappear with it. Because they are ordinary URLs, sharing one shares the resource, making the URL itself the credential ([why that's the default, and how to gate it ↓](#containers-are-open-by-default)).

Anything *you* run also becomes a URL when it binds a port. Start a server on `:8080` and it is live at the container's `http-8080` subdomain without an alias, firewall edit, proxy registration, port forwarding, or ngrok. Gate it with [permission rules](#containers-are-open-by-default), or front it and any `exec` script with an [alias or your own domain](#aliases-and-custom-domains); otherwise, it answers directly.

Launch Firefox in the cloud, open its live window, then drive it over HTTP:

```typescript
import { HoodyClient } from 'hoody-sdk';

const hoody     = await HoodyClient.authenticate('https://api.hoody.com', { username, password });
// Any running Kit container works (after containers.create, poll containers.get(id) until status === 'running'):
const container = (await hoody.api.containers.list()).data!.containers!
  .find(c => c.status === 'running' && c.hoody_kit)!;
const box       = await hoody.withContainer(container);

// Launch Firefox on virtual display :1 inside the container…
await box.terminal.execution.execute(
  { command: 'firefox https://hoody.com', wait: false },   // wait:false — don't block on the long-running GUI process (execute() waits for completion by default)
  { terminal_id: '1', display: '1' },   // a GUI session on virtual display :1
);

// …and the running window is now a URL. Open it on any device. Embed it in an <iframe>.
console.log(hoody.getKitUrl('display', container, 1));
// → https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com

// The same window takes input over HTTP — type into the URL bar, press Enter, screenshot:
await box.display.input.typeAt({ x: 640, y: 63, text: 'github.com' }, { displayId: 1 });
await box.display.input.keyboardKey({ keys: ['Return'] }, { displayId: 1 });
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
const livePng = shot.data!.image!.dataUrl;   // the live desktop, ready for <img src>
```

Pull cloud storage *into* the container and it becomes an ordinary directory. This example uses MEGA, one of 60+ rclone backends (S3, Drive, Dropbox, SFTP, …):

```typescript
// Connect the backend once, then FUSE-mount it (the container's files kit must allow remote backends):
const mega = await box.files.backends.connectMega({ user: 'you@example.com', pass: '…' });
await box.files.mounts.create({ backend_id: mega.data!.id, mount_path: '/hoody/mounts/mega' });
// Every process in the container — and every box.files.* call — now sees /hoody/mounts/mega.
```

…or mount the container's filesystem on your laptop, where it appears in Finder/Explorer. This needs `rclone` and the local platform driver: FUSE on Linux/macOS or WinFsp on Windows. The CLI form is `hoody mount <containerId>:/data ./data`:

```typescript
import { mount } from 'hoody-sdk/mount';

const drive = await mount({
  container,
  subpath: '/home/user',      // the container's default Linux account (uid 1000)
  localPath: './hoody-drive',
  background: true,           // detached mount — Linux/macOS only (throws on Windows;
                             // there, omit it and run the mount in its own terminal)
});
// ./hoody-drive now *is* the container's home directory. drive.unmount() when you're done.
```

The box also includes an AI agent. It is the one claim-gated kit, so authorize the container before creating sessions and sending prompts:

```typescript
// Mint a signed, time-limited claim for the agent kit and attach it:
const { data: authz } = await hoody.api.containers.authorize(container.id);
const agentBox = await hoody.withContainer(container, {
  kitAuth: { type: 'containerClaim', claim: JSON.stringify(authz!.container_claim), token: (await hoody.getAuthToken())! },
});

// Optional — bring your own model key (stored 0600 inside the container):
await agentBox.agent.models.setProviderAPIKey('anthropic', { api_key: process.env.ANTHROPIC_KEY! });

// Create a session, prompt it, block until the turn completes. The agent runs *on* the machine it edits.
const sess      = (await agentBox.agent.sessions.createSession()).data!;
const sessionId = (sess.session_id ?? sess.id) as string;
await agentBox.agent.sessions.promptSync(sessionId, {
  text: 'Clone github.com/you/app, run the tests, and fix the first failure.',
});
```

Anything you start on a port is already available over public HTTPS, with no proxy, certificate, or ngrok setup of your own:

```typescript
await box.daemon.quickStart.launch({ user: 'user', command: 'python3 -m http.server 8080' });  // a supervised server…
console.log(hoody.getKitUrl('http', container, { port: 8080 }));                                 // …already answering here
// → https://{projectId}-{containerId}-http-8080.{server}.containers.hoody.com
```

`hoody` manages your account (create, list, and destroy containers); `box` manages one container's services (terminal, files, browser, display, agent, …). Typed methods wrap every URL.

## Installation

> **Requires** Node.js >= 22.19.0 or Bun; the browser build has no runtime requirement.

```bash
npm install hoody-sdk@beta
# or
bun add hoody-sdk@beta
```

Browser (IIFE global, exposes `window.HoodySDK`) — pin to the SDK version you develop against:

```html
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.12/dist/hoody-sdk.browser.min.js"></script>
```

Browser (ESM):

```html
<script type="module">
  import { HoodyClient } from 'https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.12/dist/hoody-sdk.browser.esm.js';
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
// the returned token. (Have a username instead? `HoodyClient.authenticate(url,
// { username, password })` is the one-line form — see Authentication below.)
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await hoody.api.authentication.login({
  email: process.env.HOODY_EMAIL!,
  password: process.env.HOODY_PASSWORD!,
});
hoody.setToken(auth!.token!);   // every later call on `hoody` is now authenticated

const containers = (await hoody.api.containers.list()).data!.containers ?? [];
const ready = containers.find(c => c.status === 'running' && c.hoody_kit);
if (!ready) throw new Error('No running Kit container yet — see "Fresh account" below to create one.');

const box = await hoody.withContainer(ready);
const result = await box.execute('uname -a');   // one-shot: runs, waits, returns the output
console.log(result.stdout); // → Linux … from your live container
```

```bash
HOODY_EMAIL=you@example.com HOODY_PASSWORD=… npx tsx quickstart.ts
```

If you see a Linux kernel string, you're connected. New here? [Get a free server →](https://hoody.com/signup).

**Fresh account with no containers yet?** Create one first. A container belongs to a project on one of your servers. `serverRental.list()` includes your free-tier machine, a shared box for getting started; rent [dedicated bare metal](#bare-metal-underneath) when you need to scale:

```typescript
const rentals = (await hoody.api.serverRental.list()).data ?? [];
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
// until status is 'running'), then hand it to `hoody.withContainer(container!)`.
```

Containers are disposable: `hoody.api.containers.delete(container!.id)` removes the container and every URL it answered on.

---

## Core concepts

### One client, two scopes

The SDK has two access patterns:

- **API** (`hoody.api.*`) — account-level operations (containers, projects, billing, realms, tokens). Requires authentication via credentials or token.
- **Kit** (`box.terminal.*`, `box.files.*`, `box.browser.*`, …) — container-level services reached through Hoody's reverse proxy and scoped via `withContainer()`. *Kit* is the service layer preinstalled when you create a container with `hoody_kit: true` (as the [Quickstart](#quickstart) does). It answers on the per-service URLs in [the opener](#everything-is-a-url); a container created without it has no Kit services to call.

Every snippet uses an account client called `hoody` and a container-scoped client called `box`. Three lines create both; if your account has no containers, the [Quickstart](#quickstart) shows how to create one:

```typescript
const hoody     = await HoodyClient.authenticate('https://api.hoody.com', { username, password });
const container = (await hoody.api.containers.list()).data!.containers![0]!;
const box       = await hoody.withContainer(container);
```

- `withContainer()` accepts a container object or a container ID and returns a client with Kit URL templates pre-filled.
- Open containers ([the default](#containers-are-open-by-default)) need no Kit auth; for gated ones, pass `kitAuth` in `withContainer()`'s options to supply the initial credential, and an `onKitAuthExpired` callback to refresh it and replay the request once on a 401.
- `getKitUrl(service, container, serviceIndex?)` builds an embeddable URL for any Kit service — it's what printed the display URL in the opener. For a raw port on the container: `hoody.getKitUrl('http', container, { port: 8080 })` — the service segment becomes `http-8080`.

Three conventions every snippet relies on:

- **Response envelope** — by default every request method resolves to a typed `{ statusCode, message, data }`; payloads live on `response.data` (streaming, WebSocket, and iterator helpers return their own types, and `rawResponse: true` skips envelope normalization to hand back the parsed body directly — cast it, since the declared return type stays enveloped).
- **Options object** — most methods take a trailing options bag that mixes query params with per-request overrides (`retries`, `timeoutMs`, `responseType`, `signal`, …); the opener's `{ display: '1' }` is one.
- **Pagination triad** — most list endpoints ship three forms: `list()` (one page), `listAll()` (collect all pages), `listIterator()` (async iterator).

And the feel of the surface, in four calls on the Quickstart `box`:

```typescript
// Read a file
const file = await box.files.get('/etc/hostname', { responseType: 'text' });

// Drive a cloud browser
const shot = await box.browser.interaction.takeScreenshot({ browser_id: '1' });

// Schedule a recurring job ('user' = the container's default Linux account, whose crontab this edits)
await box.cron.entries.create('user', { schedule: '0 * * * *', command: 'backup.sh' });

// Query a SQLite database (executeShareable takes the SQL base64-encoded — URL-shareable)
const rows = await box.sqlite.query.executeShareable({ db: 'app', sql: btoa('select count(*) from users') });
```

The same client, types, and auth work in Node.js, Bun, and the browser. Generated namespace methods run everywhere. Hand-written conveniences that need Node built-ins (`box.execute`, `syncAgentConfig`/`syncAgentConfigs`/`listAgentConfigTools`, the screenshot-to-disk helper, and the `tunnel*`/`mount` helpers) are stubbed out of the browser build; there, call the generated method directly, such as `box.terminal.execution.execute(...)`. The full surface is in [Namespaces](#namespaces).

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

Beyond the indexed services in [Namespaces](#namespaces), raw container ports are reachable as `http-{port}` / `https-{port}`, while `ssh` / `proxy` are un-indexed special routes with no `-{index}` segment. Build them with `hoody.getKitUrl('terminal', container, 1)` or compose the string by hand. Two namespaces have shorter URL slugs than their SDK names: `notifications` → `n` and `proxyLogs` → `logs`. Use `getKitUrl()` for those so it applies the mapping.

### Containers are open by default

A newly created Hoody Kit container exposes **most** services at the URL above with **no authentication of their own**. Anyone who knows the full subdomain can use the file API, open a shell, or drive the display. The one built-in exception is the `agent` kit, which is always claim-gated; see [The built-in agent](#the-built-in-agent). **The container URL, specifically its `projectId`/`containerId` pair, is the access capability.** Treat it like a database password and keep it out of public tweets, shared Slack channels, and screenshots.

The capability is hard to guess: a request must name the exact `projectId`–`containerId` pair, no directory listing or discovery endpoint can enumerate either, and the wildcard certificate on `*.containers.hoody.com` keeps container hostnames out of public Certificate Transparency logs. It can still leak through DNS lookups, TLS SNI, browser history, and `Referer` headers, so on-path observers and logs can learn it over time. Possession of the URL *is* the grant: sharing it shares the resource, while revoking the container removes the URL. If an incidental observer must not reach a service, use one of the layers below instead of relying on the ID staying secret.

Hoody is permissionless by default, so the first call from a notebook, CLI, or developer laptop works without setup. To restrict access, add the layer that fits your trust model:

| Layer                        | What it does                                                                  | Set via                                  |
|------------------------------|-------------------------------------------------------------------------------|------------------------------------------|
| Permission rules             | Gate each service by **auth group** (IP / JWT / password / token) with a default allow-or-deny policy; add per-service **hooks** to match on path or method | `hoody.api.proxyPermissionsContainer.replace(containerId, {...})` / Workspaces (Hoody's web UI) / an SDK-driven agent |
| Realm-scoped API tokens      | Hand out API tokens fenced to a *realm* (a tenant label) so a token only ever sees its own resources on `api.hoody.com` — expiring, IP-pinnable ([walkthrough](#give-your-own-users-their-own-hoody-api)) | `hoody.api.authTokens.create(...)`       |
| Aliases                      | Hide IDs entirely behind a custom subdomain ([how-to](#aliases-and-custom-domains)) | `hoody.api.proxyAliases.create(...)`     |
| Custom domains               | Front the alias with your own domain (CNAME), Hoody auto-issues TLS ([how-to](#custom-domains-via-cname)) | A DNS CNAME to the alias hostname |

You can keep one service public, require a token on another, and pin a third to one IP. [`hoody chat`](#hoody-chat--built-in-ai-assistant) can produce the exact command ("lock this container so only 203.0.113.0/24 can reach it, and only until Friday"), or an agent can apply the same primitives through the SDK. [Security model](#security-model) explains how the pieces fit together.

### Bare metal underneath

The resource chain is **account → servers → projects → containers**. A *rented server* is a dedicated bare-metal machine with no VMs or noisy neighbors, available at a flat rate through Hoody's marketplace (an official Hetzner & OVH partner) and provisioned in minutes. The free-tier machine is shared, so the dedicated-hardware guarantees below apply only to rented bare metal. A *project* organizes containers; a *container* is the Linux machine where they run.

**Containers are free; you pay for the machine.** There is no usage meter on Hoody's side, so dev, staging, and prod projects can share one flat-rate machine. Containers boot in seconds and load Kit services on demand. Hoody also merges identical memory pages (KSM) and duplicate disk blocks (BTRFS) across containers, letting one box hold hundreds without giving each a full slice of RAM and disk. Some marketplace offers have a monthly traffic allowance; set `unlimited_traffic_only: true` in the `browse()` call below to exclude them. Hoody manages host provisioning, networking, and the proxy; you own what runs on it.

The same client manages the whole chain:

```typescript
// Browse the bare-metal marketplace — filter by geography, specs, price:
const offers = await hoody.api.serverRental.browse({ min_ram_gb: 64, country: 'DE' });

// Rent one at its flat rate (rental_days must be a duration the offer supports)…
const rented = await hoody.api.serverRental.rent(offers.data![0]!.id, { rental_days: 30 });

// …and it's a `server_id` you can fill with containers, as in the Quickstart.
console.log(rented.data!.rental!.server_id);
```

For production:

- **Renewal** — machines you already rent are managed under `hoody.api.rentals` (a sibling of `serverRental`): `hoody.api.rentals.extend(rentalId, { additional_days })` renews one without touching what's on it (extend before `rental_end`; the machine, its containers, and their data are what you're renting).
- **Durability** — the RAM-backed mount every container gets at `/ramdisk` (on by default) survives container restarts but is **wiped if the physical host reboots**, so keep durable state on the regular disk-backed filesystem and use `hoody.api.containers.createSnapshot(...)` as your undo button.
- **Data path** — because Hoody's reverse proxy itself runs as a container on *your* server, requests to your containers terminate on hardware you rent rather than transiting middleboxes in Hoody's own infrastructure: the control plane sees management operations and the metadata you send it (names, environment variables, token grants), not the request and response bytes flowing through your container services.

### Self-host anything, durably

A container is a full machine with a persistent, LUKS-encrypted disk. Self-host a Jellyfin media library, Postgres, game server, dashboard, or anything else you would put on a server. Put it under the daemon so it restarts after a reboot, and snapshot the container for a one-command backup. Media, data, and configuration stay on durable disk; you can stream or access the service over HTTPS from a browser on any device. `box.files.*` handles loose files with glob, grep, archives, WebDAV, and 60+ cloud backends. Run as many isolated services as the machine holds, each with its own URL. VS Code Server includes a PWA manifest, so it can be installed like a native app.

Hoody maintains the layer below: a hardened custom kernel, LXC + namespace + seccomp isolation, encrypted disks, and host-level firewalls on dedicated bare metal. There are no hypervisor neighbors, and Hoody keeps the host kernel patched while you maintain your app.

### Authentication

The login endpoint has separate email and username fields. A username must match `^[a-zA-Z0-9_-]+$` (no `@`), so an email address authenticates only through the `email` field. Every account is created with an email (see **Signup** below), making email the common path:

**Email login** — call `api.authentication.login({ email, password })` and adopt the returned token:

```typescript
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await hoody.api.authentication.login({
  email: 'you@example.com',
  password: '...',
});
hoody.setToken(auth!.token!);   // every later call on `hoody` is now authenticated
```

**Username login** — if your account has a username, the convenience helpers take `{ username, password }` and keep the credentials on file for automatic re-login on token expiry:

```typescript
// Explicit — login immediately and get a ready client:
const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
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
await hoody.api.authentication.signup({
  email: 'you@example.com',
  password: '...',
  region: 'eu-west', // optional, auto-assigned by GeoIP if omitted
});
```

For token-only flows with no credentials on file, pair `token:` with an [`onTokenExpired` refresh callback](#token-refresh-callback). `hoody.api.authTokens.create(...)` mints scoped tokens ([walkthrough](#give-your-own-users-their-own-hoody-api)); `hoody login --print-token` prints the CLI session token.

> **Two-factor accounts.** The shortcuts above assume no TOTP challenge. If 2FA is enabled, `login` resolves with a `temp_token` and no access token — complete the challenge through `hoody.api.tfa.*` and `setToken` the result.

**Browser-token hygiene.** A token in JS storage is a bearer credential; anyone who reads it can act as that user. Treat it like a password. Never put account credentials or an account-wide token in a static page. Give browser apps a short-lived, realm-scoped token minted by your control plane with the narrowest workable permission template ([how to mint one](#give-your-own-users-their-own-hoody-api)).

---

## What you can build

These are working SDK calls.

> Snippets assume the `hoody` / `box` pair from [One client, two scopes](#one-client-two-scopes): an account client and a container-scoped client.

### Your backend is optional

Paste this into a `.html` file and open it in a browser. It logs into Hoody, picks one of your containers, and replaces the page with a live XFCE desktop:

```html
<!doctype html>
<title>An entire desktop, served from a static file</title>
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.12/dist/hoody-sdk.browser.min.js"></script>
<script type="module">
  const { HoodyClient } = window.HoodySDK;
  const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
  const { data: auth } = await hoody.api.authentication.login({
    email: prompt('email'),
    password: prompt('password'),
  });
  hoody.setToken(auth.token);
  const c = (await hoody.api.containers.list()).data.containers[0];
  // Every container service lives on its own stable subdomain. This composes the
  // terminal service's URL and asks it to boot an XFCE desktop, then redirect there.
  const url = hoody.getKitUrl('terminal', c) +
    '?terminal_id=1&display=1&desktop=true&desktop_env=xfce&redirect=display';
  document.body.innerHTML =
    `<iframe src="${url}" style="width:100vw;height:100vh;border:0"></iframe>`;
</script>
```

The `prompt(...)` login is for the demo. In production, give the page a short-lived, realm-scoped token minted by your control plane (see [Authentication](#authentication)). The query string uses the [GUI recipe's](#stream-any-gui-app-as-a-url) one-shot shortcut.

This works because the Hoody API supports CORS and uses bearer tokens rather than cookies. The static page calls `api.hoody.com` directly, then reaches Kit capability URLs the same way. For most kits, the URL itself is the credential ([why that's the default](#containers-are-open-by-default)); the agent kit always adds a container claim. For a service you have locked down, the SDK attaches configured proxy-auth headers to `box.*` requests. A bare iframe `src` cannot carry those headers, so front gated embeds with an [alias + permission rules](#aliases-and-custom-domains). **No proxy server on your side:** the page talks to Hoody's edge, which routes to the container. Keep provisioning, billing, abuse controls, and customer-scoped token minting in code you control. Calls to container services (shell, file, Chromium, desktop) go directly from wherever your code runs.

### Run Claude Code (or any CLI agent) and drive it over HTTP

```typescript
const launched = await box.daemon.quickStart.launch({
  user: 'user',   // the container's default Linux account (uid 1000) — unrelated to the `hoody` client
  command: 'claude --print "refactor src/ to ES modules"',
});
const logs = await box.daemon.quickStart.getEphemeralLogs(
  launched.data!.temporary_id,
);
```

The agent runs as a supervised process you can tail, restart, and stop over HTTP. Its binary must be on the container's `PATH`: install Claude Code with `apt install` / `npm i -g`, or use a dev-kit image that already includes it. The config sync below copies local settings and credentials, not the binary. The same recipe works for `aider`, `codex`, `goose`, or anything available through `apt install`.

Two upgrades when this becomes a product:

```typescript
// Push your local `claude` config and credentials into a Kit container
// (the SDK knows the layouts for claude / codex / opencode / gemini;
// supports { dryRun: true } to preview, and { only: 'credentials' }):
await box.syncAgentConfig('claude', { only: 'credentials' });

// Promote the one-shot into a persistent, supervised program:
await box.daemon.programs.add({
  name: 'agent',
  user: 'user',
  command: 'claude --print "review the nightly diff"',
});
```

`box.daemon.control.start/stop/enable/disable` and `box.daemon.status.getLogs(id)` then manage restart policies and log tailing without an SSH session. (`box.syncAgentConfigs([...])` batches several tools; `box.listAgentConfigTools()` lists the registry.)

### Give an LLM a real bash terminal

```typescript
// Wire `shell` as a tool on your favorite chat model — in your tool handler:
const out = await box.execute(shellArgs.cmd);
return { stdout: out.stdout, exit_code: out.exitCode };
```

This is a full Debian shell with real stdout and exit codes, not a mock or restricted eval environment. The model can `npm install`, `git clone`, run tests, and edit files. With `box.files.*` and `box.browser.*`, it can also read, write, and browse. Because each capability is an HTTP endpoint returning typed JSON, the three-line handler needs no MCP server, plugin protocol, or other driver between the model and machine.

When the model needs an interactive TUI instead of one-shot exec, `box.terminal.terminalAutomation.*` can screen-scrape and drive it: `waitForTerminal` (wait for a regex match or output stability), `getTerminalSnapshot`, `findInTerminal`, `pressTerminalKeys`, `pasteTerminalText`, `sendTerminalMouseEvents`. The system surface `box.terminal.system.*` (`listProcesses`, `listPorts`, `sendSignal`, `freezeProcess` / `unfreezeProcess`, `getResources`) lets your supervisor code see and control what those commands actually spawned.

Before giving an agent control, take a snapshot (`hoody -c <containerId> snapshots create` in the CLI, `hoody.api.containers.createSnapshot(...)` in the SDK). A copy-on-write snapshot makes a bad change reversible.

### Stream any GUI app as a URL

The [opener](#everything-is-a-url) launched Firefox with two calls: `box.terminal.execution.execute(..., { terminal_id: '1', display: '1' })` puts it on a virtual display, and `getKitUrl('display', container, 1)` returns the live window's URL. Anyone with that URL sees **the actual Firefox window** in a browser on any device. Embed it:

```html
<iframe
  src="https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com?decorations=false&toolbar=false"
  style="width:100%;height:100vh;border:0"
></iframe>
```

> **Embedding is sharing.** The iframe `src` above contains the container's capability URL — anyone who can view the page can read it from the DOM, and on an open container it unlocks every URL-bearer service (`files`, `terminal`, …), not just the display (the agent kit still needs its own claim). Embedding for yourself is fine; embedding for your users means fronting it with an [alias](#aliases-and-custom-domains) plus [permission rules](#containers-are-open-by-default) first.

The same pattern works for any X11 application: Firefox, GIMP, Blender, a custom Electron app, IDE, retro game, scientific app, or full desktop environment. Its URL can be streamed to phones, embedded, shared, bookmarked, or given to an AI agent that drives it through `box.display.*`:

```typescript
await box.display.input.clickAt({ x: 100, y: 200 }, { displayId: 1 });
```

`box.display.input` includes `typeAt` (move + click + type in one call), `drag`, `select`, `batch` (a whole action sequence in one request), key and mouse primitives, window management (`windowSearch`, `windowFocus`, `windowMove`, `windowResize`, `windowClose`), and `reset`, an emergency release of all held inputs. Clipboard read/write is available through `box.display.getClipboard()` / `setClipboard({ text: '…' })`. Pair a screenshot loop with `batch` and a vision model can drive desktop applications that have no API.

**One-shot shortcut.** A request to the terminal URL with `redirect=display` (the endpoint behind `box.terminal.web.get`) creates the session, waits for X11 readiness, and returns a 302 to the display URL:

```typescript
// `btoa` is native in Node.js 22+ and every modern browser.
const url = hoody.getKitUrl('terminal', container) +
  `?terminal_id=1&display=1&cmd=${btoa('firefox https://hoody.com')}` +
  `&redirect=display`;
// Open `url` in a browser — you land directly on the running Firefox
```

Add `&desktop=true&desktop_env=xfce` instead of a `cmd` and you get a full XFCE desktop in an iframe — the exact query string the [static-page demo](#your-backend-is-optional) uses.

### Use real Linux tools over HTTP

```typescript
// Convert any office doc to PDF, no infra to maintain:
await box.files.put('/tmp/in.docx', docxBytes);
await box.execute('libreoffice --headless --convert-to pdf --outdir /tmp /tmp/in.docx');
const pdf = await box.files.get('/tmp/in.pdf', { responseType: 'arrayBuffer' });
```

The container is a Debian box. Install pandoc, ffmpeg, ImageMagick, Postgres, Redis, Playwright, or anything else through `apt-get` (or `pip install`, or `cargo install`). Pre-bake the stack into a server image or install it on demand.

### Reverse-tunnel localhost to a public URL

Publish a local HTTP / WebSocket service from your laptop to a public container URL (EXPOSE), or bind a local TCP service onto container-loopback so in-container code can reach it (PULL). The `tunnelExpose` / `tunnelPull` helpers run on Node.js or Bun (they're not in the browser build):

```typescript
import { tunnelExpose, tunnelPull } from 'hoody-sdk';

// Expose: publish your local HTTP server (:3000) on a container port.
// `containerPort: 0` auto-assigns an unprivileged port; ports 80–1023 must be
// enabled for privileged expose on the container first.
const handle = await tunnelExpose({
  url: hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') + '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 0,                // auto-assigned unprivileged port
  to: { host: '127.0.0.1', port: 3000 },
});
// `publicUrl` is present only when the deployment issues one (a public-URL
// pattern must be configured) — check it, don't hard-code the grammar:
console.log(handle.publicUrl ?? `bound on container port ${handle.bind.containerPort}`);
await handle.close();

// Pull: bind a container-loopback port (reachable only from inside the container)
// to a local TCP service — e.g. let in-container code reach your local Postgres.
const pulled = await tunnelPull({
  url: hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') + '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 8080,
  to: { host: '127.0.0.1', port: 5432 },
});
// Pull is loopback-only (no public URL) — in-container clients dial 127.0.0.1:<port>:
console.log(`reachable inside the container at 127.0.0.1:${pulled.bind.containerPort}`);
await pulled.close();
```

When the deployment is configured to issue a public URL, EXPOSE makes a local HTTP/WebSocket service reachable over public HTTPS without router or NAT configuration or a separate tunnel account. PULL instead carries raw TCP onto container loopback, letting in-container code reach a local service such as Postgres. `tunnelServe` (Bun only) accepts a `Bun.serve`-compatible `fetch` handler for a one-call listener without a separate HTTP server. For low-level session / bind / frame primitives, import `TunnelSession` from the package root; `box.tunnel.*` lists or kills sessions and manages bindings and metrics.

### The built-in agent

Every Hoody Kit container ships an agent. `box.agent.*` exposes <!-- ref:agent-sdk-methods -->222<!-- /ref:agent-sdk-methods --> methods across sessions, models, skills, memory, todos, workflows, hooks, GitHub integration, tools, and logs. It is the SDK's largest container-scoped namespace.

The agent is the one kit that needs more than the URL: it is **claim-gated**, so the
first agent call after a bare `withContainer(container)` returns `401 CLAIM_REQUIRED`.
Setup takes one call: authorize the container and attach the claim. Because the claim
is time-limited, pass an `onKitAuthExpired` callback to refresh it, or let
`streamAgentPrompt` (below) mint it once per call:

```typescript
// Mint a signed, time-limited claim for the agent kit and hand it to the client.
const { data: authz } = await hoody.api.containers.authorize(container.id);
const box = await hoody.withContainer(container, {
  kitAuth: {
    type: 'containerClaim',
    claim: JSON.stringify(authz!.container_claim),
    token: (await hoody.getAuthToken())!,
  },
});
```

Sessions are created once, then prompted turn by turn:

```typescript
// Create a session — the reply carries the new session's id, which
// every later call takes as its first argument:
const created = await box.agent.sessions.createSession();
const sessionId = (created.data!.session_id ?? created.data!.id) as string;

// Prompt it synchronously (blocks until the turn completes):
const turn = await box.agent.sessions.promptSync(sessionId, {
  text: 'Run the test suite and fix the first failure you find.',
});
```

The model behind a session is per-container configuration: provider API keys, OAuth sign-ins, and the default model live under `box.agent.models.*` (`setProviderAPIKey`, `startProviderOAuth`, `setProviderDefault`, `listModels`).

The agent includes its runtime; you supply provider access. Point it at existing provider keys or OAuth accounts (OpenAI, Anthropic/Claude, and more), or run Claude Code / Codex / Gemini *inside* the container after syncing local credentials in one call: `await box.syncAgentConfig('claude', { only: 'credentials' })`. Either way, it runs **on the machine it's editing**, with nothing to install locally and no context to ship.

For streaming on Node.js or Bun, use the package-root `streamAgentPrompt` helper. It POSTs the turn, parses the daemon's SSE stream, and returns text deltas, a turn-event stream, and a `done` promise. It also mints Kit auth through `hoody.api.containers.authorize()`. Consume the event stream promptly: buffering begins only when you iterate it, although `done`'s `text` always contains the full accumulated output:

```typescript
import { streamAgentPrompt } from 'hoody-sdk';

const run = await streamAgentPrompt(hoody, {
  container,
  sessionId,
  text: 'Audit /workspace, run the tests, and summarize what you changed.',
  policy: 'auto_approve',   // auto-approve confirmation gates instead of pausing the turn
});
for await (const delta of run.text) process.stdout.write(delta);
const result = await run.done;   // { terminal, text, data } — final text, usage, turn info
```

> **Note:** the generated `box.agent.sessions.promptStream()` returns a WebSocket client that does **not** match the agent daemon's SSE wire format. `streamAgentPrompt` is the supported streaming path.

Beyond prompting, the namespace covers recurring loops with hard budgets and one-shot headless runs (`box.agent.headless.createHeadlessRun`); memory with hybrid-recall search and a relation graph; todos and declarative workflows; a tool catalogue with sessionless `runTool` / `streamTool`; GitHub device-flow login, clone, commit, and PR; LLM provider keys and skills; hooks; and usage statistics. Full method listing: [`docs/reference/namespaces/agent.md`](./docs/reference/namespaces/agent.md).

### Everything else in the box

The box also includes filesystem watchers streaming over SSE/WebSocket (`box.watch`), collaborative docs and notebooks (`box.notes`), outbound HTTP jobs with cookie sessions and scheduling (`box.curl`), streaming transfer channels (`box.pipe`), the Hoody Run app resolver (`box.run`), desktop and mobile notifications (`box.notifications`), VS Code Server (`box.code`), and reverse-proxy access logs (`box.proxyLogs`). See [Namespaces](#namespaces) for the full map.

### Fork a machine instantly

Copy a running container in one call using btrfs copy-on-write. The copy provisions **asynchronously**: poll `hoody.api.containers.get(fork.data!.id)` until the response's `data.status === 'running'`. The fork has **its own capability URLs**, so every service, including terminal, files, and any `http-{port}` app, answers at a new address. Use forks for experiments, per-user environments, or testing changes against a copy of a live site.

```typescript
const fork = await hoody.api.containers.copy(container.id, {
  target_project_id: projectId,   // where the copy lands (target_server_id optional; defaults to the source server)
  name: 'experiment-1',           // optional; auto-named if omitted
});
// The copy provisions asynchronously — poll containers.get(fork.data!.id) until
// status === 'running' (it starts automatically once the copy completes), then:
console.log(hoody.getKitUrl('http', fork.data!, { port: 8080 }));   // the forked app, live once it's running
```

---

## Build your platform on Hoody

The SDK namespaces provide the infrastructure; your code provides the product:

```typescript
// Your AI coding agent — you write the AI logic, Hoody handles everything else
const box = await hoody.withContainer(container);
await box.execute('git clone ...');
const files = await box.files.listDirectory('/workspace');
await box.execute('git apply /workspace/patch.diff');
// Run a CLI agent in a sandbox and stream its output over HTTP:
await box.daemon.quickStart.launch({ user: 'user', command: 'aider --message "review the diff"' });
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
const { data: auth } = await hoody.api.authentication.login({
  email: process.env.PROVIDER_EMAIL!,
  password: process.env.PROVIDER_PASSWORD!,
});
hoody.setToken(auth!.token!);

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
const created = await hoody.api.authTokens.create({
  alias: 'Customer: Acme Corp',
  permission_template: 'external_customer',
  realm_ids: [realmId],
  allow_no_realm: false,          // must use realm-scoped URL
  ip_whitelist: ['203.0.113.0/24'],
  expires_at: '2026-12-31T00:00:00Z',
});

// IMPORTANT: created.data.token is shown ONCE, at creation.
// Store it / hand it off now — list & get never return it again.
const customerToken = created.data!.token;

// 4. Optionally hand the customer a ready-made cloud desktop — the
//    one-shot URL from "Stream any GUI app as a URL":
const desktopUrl =
  hoody.getKitUrl('terminal', acmeBox!) +
  '?terminal_id=1&display=1&desktop=true&desktop_env=xfce&redirect=display';

// Hand the customer: token + a realm-scoped URL — their realm ID as a
// subdomain of the API host:
// https://507f1f77bcf86cd799439011.api.hoody.com
```

The customer now has a fully typed Hoody API containing only their containers. They can list containers, run commands, read files, drive browsers, or open that desktop within the permissions you granted. Other customers, billing, and anything outside the realm are not merely access-denied; those resources are absent from the customer's API view. The consuming client takes two lines: the token you provided, scoped to the realm subdomain.

```typescript
const acme = new HoodyClient({ baseURL: 'https://api.hoody.com', token: customerToken })
  .withRealm('507f1f77bcf86cd799439011');   // routes realm-aware control-plane requests via the realm subdomain
```

**Included controls:**

- **Multi-tenancy** — one realm per customer; a realm-scoped token sees and acts only on resources tagged with that realm (control-plane scoping; the container boundary provides container-level isolation)
- **Permission templates** — `external_customer`, `dev_team`, `read_only`, `finance_team`, `full_access`, or fully custom
- **Security controls** — IP allowlists (`ip_whitelist`), expiration dates, enable/disable without deletion
- **Token introspection** — customers can call `/api/v1/auth/tokens/me` to discover their realm and permissions
- **Public token profiles** — attach metadata to tokens (display name, tier, logo) through `public_storage`; this requires a `public_key` (Ed25519), set at creation or later through the public-profile endpoint
- **No auth machinery to build** — no JWT verification, session store, or RBAC tables; your side mints, stores, and rotates the realm-scoped tokens (the code above)

The same pattern works for non-human tenants. Give each AI agent a realm, and it cannot see or manage containers outside that realm through the API.

See [Realms & Projects](https://docs.hoody.com/concepts/realms-projects/) and [Auth Tokens](https://docs.hoody.com/api/auth-tokens/) for the full reference.

## Aliases and custom domains

Realms hide your account from customers; aliases and custom domains hide Hoody. Together they provide white-labeling, so customers see your product and domain rather than a 24-hex container ID.

An alias is a per-user 3–61 char label mapped to a `(project, container, program, index)` tuple. Its subdomain is the shared URL, with no real IDs. Leave `alias` blank to auto-generate a 48-character hex string for share-by-obscurity links.

```typescript
const a = await hoody.api.proxyAliases.create({
  alias: 'team-dashboard',          // optional; auto-48-hex if omitted
  container_id,
  program: 'terminal', index: 1,
  target_path: '/?desktop=true&desktop_env=xfce&redirect=display',
  allow_path_override: false,
  expires_at: '2026-12-31T00:00:00Z',
});
console.log(a.data!.url);
// → https://team-dashboard.node-example-1.containers.hoody.com
```

| Field                  | Effect                                                                  |
|------------------------|-------------------------------------------------------------------------|
| `alias`                | Custom label (a–z, 0–9, `-`, 3–61 chars), or auto 48-hex                |
| `program` + `index`    | Which Kit service the alias points to                                   |
| `target_path`          | Pre-bake query string / path so the share link "just works"             |
| `allow_path_override`  | Whether the visitor's `?` and trailing path segments are honored        |
| `expires_at`           | Self-destruct timestamp                                                 |
| `enabled`              | Disable without deleting (404s while off)                               |

> **What's safe to alias publicly?** An alias is a label, not a lock. Permission rules follow the *container*, so you cannot lock down only the alias. Publish aliases only for services you would otherwise make public: an `http-{port}` app, `exec` endpoint, `pipe`, or `tunnel`. Never publicly alias `terminal`, `files`, `sqlite`, `display`, or `browser` without first adding permission rules to the container; a label on a shell is still a shell. Delete aliases before deleting their container.

### Custom domains via CNAME

Aliases are stable subdomains, so any domain you own can front one with a single DNS record:

```text
CNAME  api.example.com  →  team-dashboard.node-example-1.containers.hoody.com
```

On the first request to `https://api.example.com`, Hoody's reverse proxy issues a TLS certificate on demand. That request may return a `503` with `Retry-After` while ACME issuance runs. Once issuance completes, the proxy forwards requests to the alias's container. Combine this with edge permission rules and realm-scoped API tokens for tenant isolation.

There is **no limit on how many domains you point in**. Use a different CNAME per service, customer, or environment, targeting the same or different containers. Each follows its target's [permission rules](#containers-are-open-by-default): control is per *target*, not hostname. Domains pointing to different containers or services can expose different things, but domains sharing a target also share its rules; a hostname cannot gate that target independently (see the alias note above). Your app receives each visitor's **real client IP** as `client_ip`, rather than in an `X-Forwarded-For` header, so geolocation, rate-limiting, and abuse rules work as they would on a dedicated server.

Unlike default container subdomains ([kept out of CT logs by the wildcard certificate](#containers-are-open-by-default)), a custom domain gets its own certificate, so its hostname **will** appear in public CT logs. Name it accordingly.

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
| Cron            | Add `// @schedule '0 * * * *'`, then arm it with `box.exec.schedules.reloadSchedules()` (or `hoody exec schedules reload`) |
| Webhook         | Point any external system at the HTTP URL                                                |

A script can call other scripts, start cron jobs or daemons, hand control to an agent, or expose a tunnel back to your laptop. **The surface grows while the base methods, SDK, auth, and URL topology stay the same.** The full `exec` surface, including schema-typed flags, the `@schedule` magic comment, and the script tree, is in [`docs/reference/namespaces/exec.md`](./docs/reference/namespaces/exec.md).

## Hooks — run a script on any request (a man-in-the-middle for your own containers)

Every call to a container capability URL (`files`, `terminal`, `agent`, `exec`, or any `http-{port}` app you started) passes through Hoody's proxy. A **hook** runs a [drop-in exec script](#drop-a-script-get-an-endpoint) before matching requests reach the service. The script has full container powers (read files, call other kits, `fetch()` the web) and can **inspect, rewrite, redirect, or block** the request. It acts as an edge worker inside your container, on your own metal.

```typescript
// 1. Author the hook — an exec script (Bun; the SDK is auto-loaded; it can fetch() anything).
await box.exec.scripts.write({ path: 'hooks/fresh-check.ts', content: src, createDirs: true });

// 2. Attach it to the `files` service, matching reads of /docs/spec.md:
const svc = await hoody.api.proxyHooks.listContainerProxyServiceHooks(container.id, 'files');
await hoody.api.proxyHooks.addContainerProxyHook(
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

Hoody's security model uses few primitives and explicit edges. A cross-zone call carries either a scoped bearer token or, for open containers, the capability URL itself (see [Containers are open by default](#containers-are-open-by-default)). Ambient identity authorizes nothing.

### Trust zones

| Zone                                  | What it is                                                                | Trusts                                                                                | Does **not** trust                                                              |
|---------------------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| **Your machine** (laptop, server, CI) | Holds your bearer token in env, config, or memory                         | The control plane it points `baseURL` at                                              | Anything served *by* a container — that's untrusted code talking back            |
| **Control plane** (`api.hoody.com`)   | Account, billing, container provisioning, realms, tokens                  | A bearer token after a successful `/auth/login` or token-validate                     | Container file systems, processes, or anything inside `*.containers.hoody.com`    |
| **Your container**                    | A real Linux box running your code or a customer's                        | Whatever code you put in it                                                           | The control plane back. No automatic identity flows back the other way           |
| **A user's browser tab**              | Static page calling `api.hoody.com` directly                              | The token you put in `localStorage` / memory                                          | Cross-origin requests — the SDK strips `Authorization` once a request resolves to a host that is neither your `baseURL` host nor a subdomain of it |
| **Another container** (someone else's, or another of yours) | Equally a real Linux box                                | Nothing about your container                                                          | Anything about your container — no shared identity, no shared file system        |

The third row is important: **the control plane never gives a container access to your account.**

### The in-container `hoody` CLI is intentionally credential-less

Inside any Hoody container, the `hoody` binary is on every user's `$PATH` from a read-only plugin mount under `/hoody/plugins`. It is the same CLI as on your laptop, including `hoody chat` and `hoody containers list`, and talks to the same Hoody API.

The first authenticated call returns 401 until **you** provide a token. There is no auto-login for "the user who owns this container"; otherwise, any code inside it (your scripts, an `npm install` post-install hook, a misbehaving dependency, or a compromised shell) could call the API as you and act on your *other* containers, billing, and realms.

So Hoody draws the trust line at the container boundary. Authenticate the in-container CLI explicitly, with the *narrowest* token that works:

```bash
# Inside the container — pick whichever fits the situation:
hoody login                                      # interactive sign-in
export HOODY_TOKEN=<a-realm-scoped-token>        # for scripts and CI
hoody --token <a-realm-scoped-token> ps          # one-off, per call
```

Mint the in-container token with a narrow permission template (`external_customer`, `read_only`, or a custom one) and short expiry. A compromised container's API access is then limited to that container and its realm's resources, not your account or other realms.

### Defense layers, by where they live

<details>
<summary>Ten layers — where each lives and what it enforces</summary>

| Layer                          | Lives at              | Enforces                                                                                                         |
|--------------------------------|-----------------------|------------------------------------------------------------------------------------------------------------------|
| Bearer token + open CORS       | `api.hoody.com`       | Your identity. The SDK keeps `Authorization` only for your `baseURL` host and its subdomains (e.g. a realm subdomain) — it's stripped for any other host and on cross-origin redirects, so your API token never reaches a `*.containers.hoody.com` Kit URL |
| Realm scoping                  | Control plane         | A token only sees resources tagged with one of its `realm_ids`; other resources aren't "forbidden", they don't exist |
| Container-ID-as-capability     | Reverse proxy         | The default access right is "knows the `(project, container)` tuple". Treat container IDs as confidential          |
| Permission rules               | Reverse proxy         | Per-container auth groups (IP / JWT / password / token) with a default allow-or-deny policy, plus per-service hooks for path / method logic |
| Aliases & custom domains       | Reverse proxy + DNS   | Hide IDs behind your own domain; revoke by toggling `enabled=false`                                              |
| Local lock                     | Your laptop           | Encrypts CLI credentials at rest with XChaCha20-Poly1305, using key material derived from your password with argon2id |
| Automatic redaction            | The SDK               | Request `Authorization`, `Cookie`, `?token=…`, and body secret fields scrubbed before any error reaches your `catch` block ([full spec](#error-handling)) |
| Response signing (opt-in)      | The SDK               | On signing-enabled deployments, non-empty non-stream control-plane replies carry an Ed25519 `X-Hoody-Signature`; verify it with `verifyHoodySignatureHeader` to detect tampering |
| Public-SSH `bwrap` sandbox     | `gateway.hoody.com`   | Each [`ssh hoody.com`](#every-front-door) session runs in a fresh bubblewrap sandbox with seccomp, cgroup pids/cpu/mem caps, and an iptables egress lock pinned to `api.hoody.com:443` |
| In-container credential vacuum | Every container       | No ambient identity. The CLI is there; the trust isn't                                                           |

</details>

### Picking a posture

The layers combine into three common postures:

- **Development — open.** The capability URL is the password; fastest possible loop.
- **Staging — IP-restricted.** One permission rule pins the container to your office/VPN CIDR.
- **Production — locked down.** Permission rules default-deny with a token or JWT auth group at the proxy, realm-scoped API tokens for tenant isolation, aliases or your own domain in front so real IDs never circulate. Agents get their own realms; anything an agent will modify gets a snapshot first.

These layers are built in. Choose the one that fits your trust model, and keep container IDs and tokens off public surfaces.

---

## Namespaces

19 namespaces, <!-- ref:sdk-methods -->1095<!-- /ref:sdk-methods --> typed methods. Account-level (`hoody.api.*`) needs no container; everything else uses a container-scoped client (`box = await hoody.withContainer(c)`).

<details>
<summary>The full namespace map — scope, coverage, and a one-liner you'd actually call</summary>

| Namespace         | Scope     | What it covers                                                                          | One-liner you'd actually call                                              |
|-------------------|-----------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `api`             | Account   | Auth, tokens, containers, projects, realms, pools, users, billing, wallet, rentals, proxy permission rules, a secrets vault (encrypted client-side via the `encrypt`/`decrypt` helpers) | `hoody.api.containers.list()`                                              |
| `terminal`        | Container | Interactive shells, command exec, PTY sessions, system monitoring, GUI app launcher     | `box.execute('uname -a')`                                                  |
| `files`           | Container | CRUD, glob, grep, archives, downloads, 60+ cloud backends, WebDAV                       | `box.files.get('/etc/hostname', { responseType: 'text' })`                 |
| `browser`         | Container | Cloud Chromium — navigate, screenshot, eval, cookies, DevTools                       | `box.browser.interaction.takeScreenshot({ browser_id: '1' })`             |
| `display`         | Container | Remote desktop — mouse, keyboard, window manager, screen capture                        | `box.display.input.clickAt({ x: 100, y: 200 }, { displayId: 1 })`         |
| `code`            | Container | VS Code Server — extensions, auth, static, vscode bridges                               | `box.code.extensions.install({ url: 'https://…/gitlens.vsix' })`          |
| `exec`            | Container | Drop-a-script-get-an-endpoint — see [Drop a script, get an endpoint](#drop-a-script-get-an-endpoint) | `box.exec.execution.execute('build')`                                      |
| `daemon`          | Container | Long-running processes; ephemeral one-shots                                             | `box.daemon.quickStart.launch({ user, command })`                          |
| `cron`            | Container | REST-driven cron entries and crontab edits                                              | `box.cron.entries.create('user', { schedule, command })`                  |
| `watch`           | Container | Filesystem watchers, event streams                                                     | `box.watch.watchers.create({ paths: ['/workspace'] })`                     |
| `sqlite`          | Container | SQL queries, KV store, query history                                                    | `box.sqlite.query.executeShareable({ db: 'app', sql })`                    |
| `curl`            | Container | Outbound HTTP with scheduling, sessions, cookie persistence                             | `box.curl.execute({ url, method: 'GET' })`                                 |
| `pipe`            | Container | HTTP streaming channels for real-time data flow                                         | `box.pipe.send(path, body)`                                                |
| `run`             | Container | Hoody Run — resolve apps to shell commands across package sources (system-path, nixpkgs, pkgx, AppImage, OCI), profiles, recipes | `box.run.resolve({ app: 'firefox' })`                                      |
| `notes`           | Container | Collaborative docs, notebooks, comments, versioning, embedded DBs                       | `box.notes.notebooks.create({ name: 'plans' })`                            |
| `notifications`   | Container | Desktop and mobile push notifications, real-time stream                                | `box.notifications.notify.trigger({ summary, body, display: '0' })`        |
| `tunnel`          | Container | Reverse tunnels — publish HTTP/WebSocket to a public URL, or pull TCP onto container-loopback ([recipe](#reverse-tunnel-localhost-to-a-public-url)) | `box.tunnel.listSessions()`                                                |
| `proxyLogs`       | Container | Reverse-proxy access logs and stats                                                     | `box.proxyLogs.logs.list()`                                                |
| `agent`           | Container | AI agent (<!-- ref:agent-sdk-methods -->222<!-- /ref:agent-sdk-methods --> methods) — sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs ([recipe](#the-built-in-agent)) | `box.agent.sessions.promptSync(id, { text })`                              |

</details>

Useful hand-written helpers: `box.*` entries are client methods; the rest are package-root exports.

<details>
<summary>streamAgentPrompt, curl multiplexing, tunnel helpers, vault crypto, signature verify, events</summary>

- **`streamAgentPrompt`** — the supported path for streaming agent turns ([recipe](#the-built-in-agent)).
- **`box.curlChannel()` + `createCurlFetch`** — a `fetch()`-compatible function that multiplexes many concurrent HTTP requests, SSE included, over one WebSocket.
- **`box.syncAgentConfig(tool)`** (Node.js/Bun) — push local CLI-agent config into a Kit container ([recipe](#run-claude-code-or-any-cli-agent-and-drive-it-over-http)).
- **`tunnelExpose` / `tunnelPull`** (Node.js or Bun) and **`tunnelServe`** (Bun only) — reverse-tunnel helpers ([recipe](#reverse-tunnel-localhost-to-a-public-url)); `TunnelSession` carries the low-level session / bind / frame primitives.
- **`encrypt` / `decrypt` / `isEncrypted` / `parseEnvelope`** — client-side vault crypto for `hoody.api.vault.*` (errors surface as `VaultCryptoError`).
- **`getHoodySignatureHeader` / `parseHoodySignatureHeader` / `verifyHoodySignatureHeader`** — parse and cryptographically verify the Ed25519 `X-Hoody-Signature` response header the control plane signs (`parseHoodySignatureFrom` / `verifyHoodySignatureFrom` take a whole response object).
- **`EventsClient` / `EventsManager`** — real-time platform events, with `hoody.api.events.*` for history.

</details>

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
    console.error(err.status);    // HTTP status code
    console.error(err.code);      // server-supplied error code (string)
    console.error(err.response);  // parsed server body (ApiErrorResponseDetails | unknown — plain text on non-JSON errors)
    console.error(err.request);   // { method, url, headers, body, query } — secrets redacted

    if (isRetryableApiError(err)) { /* 408/425/429/500/502/503/504 — safe to replay an idempotent op */ }
  }
}
```

- **`ApiError`** — thrown on HTTP 4xx/5xx. Same class across browser, Node.js, and CLI.
- **`ValidationError`** — client-side input validation (missing required args, bad enum / range / pattern) before the request goes out; TypeScript handles most body-shape checking.
- **`VaultCryptoError`** — thrown by `decrypt` / `parseEnvelope` with a `.kind` discriminator (`'invalid-envelope'`, `'unsupported-version'`, `'invalid-kdf'`, `'decrypt-failed'`). The underlying backend error is preserved via `.cause`.
- **`isApiError()` / `isRetryableApiError()`** — type guards that work across module boundaries.
- **Automatic redaction** — the attached request context (`err.request`, `err.url`) scrubs `Authorization`, `Cookie`, `Proxy-Authorization`, `x-*-token`, `x-*-key`, URL query params (`?token=…`, `?apikey=…`), URL userinfo, and secret body fields (password / token / apikey / …) to `[REDACTED]` before the error reaches your `catch` block. This keeps your credentials out of exported Sentry / Datadog / structured logs. Two caveats: redaction is pattern-based, so you must scrub secrets sent under nonstandard field names; and `err.response` / `err.message` contain the server's reply verbatim. Sanitize them if your backend may echo sensitive data rather than treating the whole `ApiError` as safe to export.

## TypeScript

All types are included, and all methods have typed parameters and return values, with inferred response types. Runtime helpers such as `ApiError` and `ValidationError`, along with types such as `IHttpClientMiddleware`, are available from the package root. Response precision varies: request parameters are comprehensively typed, but a fair number of response payloads use loose `data` types (`unknown` or `Record<string, unknown>`). `box.agent.*` is the main example because it returns verbatim daemon replies; assorted methods in `terminal`, `exec`, `curl`, `daemon`, `notifications`, and other namespaces do the same. Expect occasional casts, as shown by the [agent recipe](#the-built-in-agent)'s `session_id as string`; each generated response type shows its exact shape.

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

- **Cross-origin auth strip.** `Authorization` is kept only when a request resolves to your `baseURL` host or a subdomain of it (same protocol) — realm subdomains stay authenticated, but any other host (and cross-origin redirects) has it dropped before fetch, so a Kit URL on `containers.hoody.com` handed to an AI agent cannot leak your API token.
- **Non-replayable bodies.** `ReadableStream` and async-iterable bodies are detected; retries on those fail fast instead of replaying an empty body.
- **RFC 9110 Retry-After.** Integer-seconds and HTTP-date forms are parsed, clamped to 30s, and respected over local backoff on any retried error status (typically 429 / 503).

## Every front door

The SDK is one of several access paths. Terminal, browser, AI chat, and CI all reach the same control plane and per-user containers. One auth token works across them, and the CLI over `ssh` is the same `hoody` binary run by `npx hoody-sdk` and shipped in this package.

<details>
<summary>Every front door — SSH (three ways), npx, static binary, npm, WebOS, and any AI chat</summary>

| Front door                                            | What it does                                                                              | Best for                                                            |
|-------------------------------------------------------|-------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **`ssh hoody.com`**                                   | Drops you straight into the Hoody CLI in a memory-only sandboxed shell. No install. Sign in interactively, or paste a token at the prompt. | Reaching your account from any laptop, jump box, or remote host with `ssh`. |
| **`ssh hoody_<token>@hoody.com`**                     | Same as above, but the SSH username carries your auth token — the sandbox auto-authenticates the moment the connection lands. Use a narrow, short-expiry token: the username is visible in shell history and host logs. | Scripts, cron, one-liners, CI pipelines — no interactive step. |
| **`ssh.hoody.com`** *(WebSSH)*                        | The same SSH shell, in your browser — a full terminal with nothing to install. Sign in and you're at a prompt on any device. | A shell from a locked-down laptop, a phone, or any machine without an `ssh` client. |
| **`npx hoody-sdk`** *(or `bunx`, `pnpm dlx`)* | Run the latest `hoody` CLI without installing anything globally. | Quick checks from a workstation that already has Node.js or Bun. |
| **`curl -fsSL https://install.hoody.com \| sh`** *(Windows: `iwr https://install.hoody.com/install.ps1 -UseB \| iex`)* | Download a single native binary for your platform — no Node.js runtime needed. | Air-gapped boxes, container build steps, locked-down CI. |
| **`npm i hoody-sdk`** | Install this very SDK from the npm registry — pin a version in production. Install guide: `sdk.hoody.com`. | TypeScript / JavaScript projects of any shape. |
| **`os.hoody.com`**                                    | A full Hoody WebOS in any browser. The UI itself is served by *your own* container — `os.hoody.com` only signs you in and forwards you there. The OS *is* your container. | Users on phones, tablets, Chromebooks, ChromeOS-Flex laptops; anyone without a terminal. |
| **`@hoody.com`**                                      | Paste `@hoody.com` into ChatGPT, Claude, Gemini, Codex, Cline, Roo Code, or any web-fetching agent. The agent fetches a Skill — a structured HTTP map of every Hoody capability — and drives your account with a token you give it, no SDK, MCP server, or plugin in between. | Letting any web-fetching AI assistant operate Hoody from a paste plus a scoped token. |

</details>

## CLI

The CLI is the `hoody` command shipped in `hoody-sdk`. Run it without a global install or project dependency:

```bash
npx hoody-sdk login  # interactive sign-in (or OAuth) — also bunx / pnpm dlx
npx hoody-sdk ps     # list containers (grab a container id)
npx hoody-sdk -c <containerId> terminal sessions exec --ephemeral --command "uname -a"
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
```

`--web` uses the RFC 8628 device flow with PKCE. The CLI prints a short code and URL, opens a browser when possible, then completes login after approval. Browser opening is suppressed by `--no-browser`, `--print-token`, a machine-readable output mode, or a non-interactive session. `hoody auth login` / `hoody auth signup` remain flag-only scripting primitives with the global `-o`; `hoody auth login` also takes `--print-token` (`hoody auth signup` does not — use the top-level `hoody signup` for that). `hoody login` adds the interactive method menu, browser/device flow, and secure password prompt.

Or install the SDK package globally for the `hoody` command:

```bash
npm install -g hoody-sdk           # installs the `hoody` command
hoody login
hoody ps
```

> The command is `hoody`; `npx hoody-sdk` runs the same CLI without adding a project dependency.

**Running from a clone.** The GitHub mirror ships the **prebuilt** CLI and SDK (`cli/dist`, `dist-ts`, browser bundles), not the build toolchain or CLI TypeScript source. The `hoody` command runs directly from the checkout with no build step.

<details>
<summary>Run the prebuilt CLI from a clone</summary>

```bash
git clone https://github.com/HoodyNetwork/hoody-sdk.git && cd hoody-sdk
npm install            # runtime deps only (the mirror ships a prebuilt cli/dist)
npm link               # puts `hoody` on your PATH, served from this checkout
hoody login && hoody ps
```

Prefer no global command? Run the prebuilt entry point directly — every `hoody <args>` becomes `node cli/dist/index.js <args>`:

```bash
node cli/dist/index.js login                  # then `cli/dist/index.js <args>` for any command
```

Both paths expose the same command tree as the npm package, using your checkout instead of the published tarball. To build from source, use this generator repo rather than the published mirror.

</details>

See the [CLI commands reference](./docs/reference/CLI-COMMANDS.md) for the full command reference.

**Pipe-friendly output.** Generated request commands accept global `--output <format>` values of `table`, `json`, `yaml`, `wide`, or `raw`; streaming commands (agent streams) accept `ndjson` (default), `pretty`, or `raw`. Dynamic exec-script commands render only `json`/`raw`; any other mode falls back to JSON for objects but still emits a top-level string result as-is, under the same add-a-newline-only-if-missing rule as `raw`. Some hand-written commands have their own flags, such as `hoody mount --list --json` (mount's `--json` reports on `--list`/`--prune` and on a successful mount, not on a usage error) and `hoody local lock status --json`. `--output raw` prints a string response body as-is, appending a trailing newline only if one is missing; for objects it emits the first string field among `content`, `data`, `body`, and `text`, and falls back to formatted JSON (with a stderr warning) only when none of those is a string. This is useful for piping file contents, logs, or `package.json` without unpacking an envelope with jq.

**Dynamic script commands.** Eligible scripts under `exec/scripts` become subcommands at `hoody exec <name>` (for example, `api/reports.ts` → `hoody exec api-reports`); reserved names, internal scripts, and command-name collisions are skipped. Declared schemas produce type-aware flags for top-level fields, and only `integer`/`number`/`boolean` keep their type — every other property, including nested objects and arrays, becomes a string flag. Schema-typed commands register **no** `--body`, so use the SDK for nested structures. Schema-less scripts accept `--method`, repeatable `--query k=v`, and `--body @file.json`. Pass `-c <containerId>` to target a container, or use the configured default. After adding or editing a script, `--refresh-scripts` bypasses the discovery cache.

### Secret storage — lock mode

`hoody local lock` encrypts CLI credentials at rest with XChaCha20-Poly1305 using key material derived from a user password with argon2id. While locked, `config.json` stores `{"token": {"__locked__": "v1"}}` sentinels instead of plaintext for every sensitive field: `refreshToken`, `kitToken`, `kitPassword`, and the routing defaults `container`, `project`, `realm`. `kitPassword` is the odd one out: setup will encrypt a legacy hand-written value, but `hoody config set kitPassword` is refused outright and the runtime never reads it back from the lock — kit password auth comes only from `HOODY_KIT_PASSWORD` / `HOODY_KIT_PASS`. The account login `password` is the exception: it is removed from `config.json` instead of encrypted, so it never sits at rest.

```bash
hoody local lock setup                   # prompts for a password; exits 11 if the
                                         # config has no plaintext field to lock yet
hoody local lock status
HOODY_LOCAL_PASSWORD=… hoody containers list   # unlocks for this invocation only
hoody local lock remove                  # needs the current password AND confirmation;
                                         # DELETES the stored tokens and routing
                                         # defaults unless you pass --write-plaintext
```

Lock mode is a CLI-only feature — SDK consumers don't interact with it.

### `hoody chat` — ask Hoody about Hoody

`hoody chat` asks Hoody's documentation assistant, from your terminal. It is **free** and needs **no API key, no model choice, and no account** — there is nothing to configure before the first question.

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

Answers are grounded in the Hoody documentation and cite the pages they came from. Scope is Hoody — the platform, CLI, SDK, API, and code meant to run on it; unrelated questions are declined.

It is deliberately non-agentic: it produces text and cannot read files, run commands, or reach your container. For that, use [`hoody agent`](./docs/reference/CLI-COMMANDS.md).

Free means metered: 30 questions/hour, 2000 characters per question.

Full command reference: [Chat guide](./docs/reference/guides/chat.md).
Privacy model and data-retention details: [Chat privacy](./docs/reference/guides/chat-privacy.md).

## API reference

- [SDK method reference](./docs/reference/SDK-METHODS.md) — full method listings for all 19 namespaces, plus the main client helpers
- [Per-namespace docs](./docs/reference/namespaces/_INDEX.md)
- [CLI commands](./docs/reference/CLI-COMMANDS.md)
- [HTTP endpoint map](./docs/reference/HTTP-METHODS.md) — every HTTP method + path ↔ its SDK method, and its CLI command where one exists
- OpenAPI spec — ships in the package as JSON and YAML: `import spec from 'hoody-sdk/openapi.json' with { type: 'json' }`, or `require.resolve('hoody-sdk/openapi.yaml')` and parse with any YAML library
- [Changelog](./CHANGELOG.md)

## Versioning & support

This SDK follows [semantic versioning](https://semver.org/); breaking changes land only in major releases. Questions, bugs, and feature requests go to [GitHub Issues](https://github.com/HoodyNetwork/hoody-sdk/issues); platform guides live at [docs.hoody.com](https://docs.hoody.com). Found a security issue? Please report it privately via [GitHub security advisories](https://github.com/HoodyNetwork/hoody-sdk/security/advisories/new) rather than a public issue.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

<p align="center">
  Spin up a container and make your first URL — <a href="https://hoody.com/signup"><strong>get a free server →</strong></a>
</p>

<p align="center">
  <a href="https://hoody.com"><strong>hoody.com</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://docs.hoody.com"><strong>Documentation</strong></a> &nbsp;&middot;&nbsp;
  <a href="https://hoody.com/SKILLS/"><strong>AI Skills</strong></a>
</p>
