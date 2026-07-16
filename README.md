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

TypeScript SDK for [Hoody](https://hoody.com). Hoody runs full Linux containers and exposes their terminal, files, browsers, AI agent, GUI display, cron, databases, notifications, and tunnels as one typed HTTP API — callable from Node.js, Bun, and the browser. You build on primitives, not on a framework that shifts under you: the client, the auth model, and the URL layout don't change as your product grows.

| | |
|---|---|
| **Batteries included** | Create a container with the Kit (`hoody_kit: true`) and the full service layer is already answering at stable HTTPS URLs — shell, files, cloud browser, GUI desktop, databases, cron, tunnels, and a built-in AI agent. |
| **Who it's for** | Cloud IDEs, AI-agent platforms, browser-automation pipelines, remote-desktop products, education — anything needing a real Linux environment on demand without running the infrastructure. |
| **The economics** | Flat-rate bare metal underneath — a whole dedicated machine, marketplace-priced from ~$30/month, no per-container fee, no usage meter. Dev-to-prod for every project on one box. [How ↓](#bare-metal-underneath) |
| **The surface** | 19 namespaces · <!-- ref:sdk-methods -->1065<!-- /ref:sdk-methods --> typed SDK methods · <!-- ref:cli-commands -->825<!-- /ref:cli-commands --> CLI commands — one client, one URL grammar, one SDK that handles every auth mode for you. |

**Prefer the raw list to the tour?** The entire surface fits in three flat, clickable references — [CLI commands](./docs/reference/CLI-COMMANDS.md) · [SDK methods](./docs/reference/SDK-METHODS.md) · [HTTP endpoints](./docs/reference/HTTP-METHODS.md) (every endpoint ↔ SDK method ↔ CLI command) — often the fastest way to see what's here.

**At a glance** — one account client (`hoody.api.*`) plus eighteen container-scoped `box.*` Kit namespaces:

`terminal` · `files` · `browser` · `display` · `code` · `exec` · `daemon` · `cron` · `watch` · `sqlite` · `curl` · `pipe` · `app` · `notes` · `notifications` · `tunnel` · `proxyLogs` · `agent` — [full table ↓](#namespaces)

> **Reading this as an AI agent?** Fetch the machine-readable Skills at [hoody.com/SKILLS/](https://hoody.com/SKILLS/) — a structured HTTP map of every capability described below. Three facts worth caching now: every request method resolves to a `{ statusCode, message, data }` envelope (payloads live on `response.data`; streaming, WebSocket, and iterator helpers return their own types); the snippets in this README are real, verified calls; and the `hoody` / `box` convention they share is defined in [One client, two scopes](#one-client-two-scopes).

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

A Hoody container is a full Debian Linux machine — systemd, `apt`, its own filesystem and process tree — that boots in seconds. Create it with the **Kit** service layer preinstalled (`hoody_kit: true`, as the [Quickstart](#quickstart) does), and from the moment it exists every one of these services answers at stable HTTPS URLs:

```text
https://{projectId}-{containerId}-{service}-{index}.{server}.containers.hoody.com
```

Each URL below is a production-grade building block, already running and wired together the moment the container exists — so you *compose* systems instead of rebuilding the plumbing under them:

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

Same grammar every time — bump the `{index}` for a second terminal or display ([full anatomy](#anatomy-of-a-hoody-url)). There's nothing to wire up first — no SSH keys, no VNC ports, no SFTP daemon, no reverse-proxy config, no certificates. Every URL is HTTPS, with HTTP/2 and HTTP/3 negotiated automatically. The lifecycle is just as plain: destroy the container and its URLs go with it, and because they're ordinary URLs, sharing one shares the resource and composing them composes systems. (Which does make the URL itself the credential — [why that's the default, and how to gate it ↓](#containers-are-open-by-default).)

And it isn't only the Kit: anything *you* run becomes a URL the moment it binds a port. Start a server on `:8080` and it's live at the container's `http-8080` subdomain right away — no alias, no firewall edit, no proxy registration, none of the port-forwarding or ngrok dance. Every port is already a link. Gate it with [permission rules](#containers-are-open-by-default), or front it (and any `exec` script) with an [alias or your own domain](#aliases-and-custom-domains) when you're ready; until then, it just answers.

Here is what that feels like through the SDK — launch Firefox in the cloud and get a link to the live window:

```typescript
import { HoodyClient } from 'hoody-sdk';

const hoody     = await HoodyClient.authenticate('https://api.hoody.com', { username, password });
const container = (await hoody.api.containers.list()).data!.containers![0]!;
const box       = await hoody.withContainer(container);

// Launch Firefox on virtual display :1 inside the container…
await box.terminal.execution.execute(
  { command: 'firefox https://hoody.com' },
  { terminal_id: '1', display: '1' },   // a GUI session on virtual display :1
);

// …and the running window is now a URL.
console.log(hoody.getKitUrl('display', container, 1));
// → https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com
//   Open it on any device. Embed it in an <iframe>. Hand it to an AI agent.
```

That's the whole model, and it's why the SDK comes in two halves: `hoody` for your account (create, list, destroy containers) and `box` for a single container's services (terminal, files, browser, display, agent, …). Every one of those URLs is wrapped in a typed method. The rest of this README is really just proof of that.

## Installation

> **Requires** Node.js >= 22.19.0 or Bun; the browser build has no runtime requirement.

```bash
npm install hoody-sdk@beta
# or
bun add hoody-sdk@beta
```

Browser (IIFE global, exposes `window.HoodySDK`) — pin to the SDK version you develop against:

```html
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.1/dist/hoody-sdk.browser.min.js"></script>
```

Browser (ESM):

```html
<script type="module">
  import { HoodyClient } from 'https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.1/dist/hoody-sdk.browser.esm.js';
</script>
```

> All CDN URLs are pinned to a specific version. Omitting the `@<version>` segment
> gets you the latest published release from jsdelivr/unpkg, which can silently
> change underneath you — always pin in production.

## Quickstart

Sign in, grab a container, run a command — the whole loop in one file.

```typescript
// quickstart.ts
import { HoodyClient } from 'hoody-sdk';

const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
  username: process.env.HOODY_EMAIL!,
  password: process.env.HOODY_PASSWORD!,
});

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

See a Linux kernel string? You're connected. New here? [Get a free server →](https://hoody.com/signup).

**Fresh account with no containers yet?** Create one first. A container lives in a project, on one of your servers — and `serverRental.list()` already includes your free-tier machine (a shared box to start on; rent [dedicated bare metal](#bare-metal-underneath) when you're ready to scale):

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

And it's disposable by design: `hoody.api.containers.delete(container!.id)` and the container — along with every URL it answered on — is gone.

Those ten lines already touched every core idea in the SDK. The next section names them once; everything after that is just application.

---

## Core concepts

### One client, two scopes

The SDK has two access patterns:

- **API** (`hoody.api.*`) — account-level operations (containers, projects, billing, realms, tokens). Requires authentication via credentials or token.
- **Kit** (`box.terminal.*`, `box.files.*`, `box.browser.*`, …) — container-level services reached through Hoody's reverse proxy, scoped via `withContainer()`. *Kit* is the service layer preinstalled in a container created with `hoody_kit: true` (as the [Quickstart](#quickstart) does) — it is what answers on the per-service URLs in [the opener](#everything-is-a-url). A container created without it has no Kit services to call.

Every snippet in this README uses an account client called `hoody` and a container-scoped client called `box`. Three lines get you both (if your account has no containers yet, the [Quickstart](#quickstart) shows creating one):

```typescript
const hoody     = await HoodyClient.authenticate('https://api.hoody.com', { username, password });
const container = (await hoody.api.containers.list()).data!.containers![0]!;
const box       = await hoody.withContainer(container);
```

- `withContainer()` accepts a container object or a container ID and returns a client with Kit URL templates pre-filled.
- Open containers ([the default](#containers-are-open-by-default)) need no Kit auth; for gated ones, pass `kitAuth` or an `onKitAuthExpired` callback in `withContainer()`'s options and the SDK reauthenticates Kit requests on 401.
- `getKitUrl(service, container, serviceIndex?)` builds an embeddable URL for any Kit service — it's what printed the display URL in the opener. For a raw port on the container: `hoody.getKitUrl('http', container, { port: 8080 })` — the service segment becomes `http-8080`.

Three conventions every snippet relies on:

- **Response envelope** — every request method resolves to a typed `{ statusCode, message, data }`; payloads live on `response.data` (streaming, WebSocket, and iterator helpers return their own types).
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

Same client, same types, same auth — in Node.js, Bun, and the browser. The full surface is in [Namespaces](#namespaces).

### Anatomy of a Hoody URL

Hoody URLs are entirely structural. Every Kit service for every container has a stable subdomain you can construct yourself — no opaque routing token, no per-request signing, no presigned-URL TTL.

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

Beyond the indexed services in [Namespaces](#namespaces), raw container ports are reachable as `http-{port}` / `https-{port}`, and `ssh` / `proxy` are un-indexed special routes (no `-{index}` segment). Build any of them with `hoody.getKitUrl('terminal', container, 1)` or compose the string by hand. Three namespaces use a shorter URL slug than their SDK name — `notifications` → `n`, `proxyLogs` → `logs`, `app` → `run` — so reach those with `getKitUrl()` (it applies the mapping) rather than hand-composing by the namespace name.

### Containers are open by default

A freshly-created Hoody Kit container exposes its services on the URL above with **no authentication of its own**. Anyone who knows the full subdomain can hit the file API, open a shell, or drive the display. In other words, **the container URL — really the `projectId`/`containerId` pair it embeds — is the access capability** — treat it like a database password, and keep it out of public tweets, shared Slack channels, and screenshots.

Why is that a sane default rather than a hole? Because the capability is hard to guess: a request must name the exact `projectId`–`containerId` pair, there is no directory listing or discovery endpoint to enumerate either, and the wildcard certificate on `*.containers.hoody.com` keeps container hostnames out of public Certificate Transparency logs. Hard to guess is not hard to leak, though — a hostname travels in DNS lookups, TLS SNI, browser history, and `Referer` headers, so on-path observers and logs can learn it over time. Possession of the URL *is* the grant: hand someone the URL and you have handed them the resource; revoke the container and the URL ceases to exist. For anything an incidental observer must not reach, add one of the layers below instead of relying on the ID staying secret.

Hoody is permissionless by default so your first call from a notebook, a CLI, or a junior dev's laptop just works. When you need to lock things down, you add the layer that fits your trust model:

| Layer                        | What it does                                                                  | Set via                                  |
|------------------------------|-------------------------------------------------------------------------------|------------------------------------------|
| Permission rules             | Gate each service by **auth group** (IP / JWT / password / token) with a default allow-or-deny policy; add per-service **hooks** to match on path or method | `hoody.api.proxyPermissionsContainer.replace(containerId, {...})` / Workspaces (Hoody's web UI) / an SDK-driven agent |
| Realm-scoped API tokens      | Hand out API tokens fenced to a *realm* (a tenant label) so a token only ever sees its own resources on `api.hoody.com` — expiring, IP-pinnable ([walkthrough](#give-your-own-users-their-own-hoody-api)) | `hoody.api.authTokens.create(...)`       |
| Aliases                      | Hide IDs entirely behind a custom subdomain ([how-to](#aliases-and-custom-domains)) | `hoody.api.proxyAliases.create(...)`     |
| Custom domains               | Front the alias with your own domain (CNAME), Hoody auto-issues TLS ([how-to](#custom-domains-via-cname)) | A DNS CNAME to the alias hostname |

Gate a container exactly how you want: keep one service public, require a token on another, pin a third to a single IP. And you never hand-write the policy unless you want to — ask [`hoody chat`](#hoody-chat--built-in-ai-assistant) for the exact command ("lock this container so only 203.0.113.0/24 can reach it, and only until Friday") and run it, or let an agent driving the SDK apply it directly; both go through the same primitives. The systemic view of who trusts whom lives in [Security model](#security-model).

### Bare metal underneath

The resource chain is short: **account → servers → projects → containers**. A *rented server* is a dedicated bare-metal machine — no VMs, no noisy neighbors — from Hoody's marketplace (an official Hetzner & OVH partner) at a flat rate, provisioned in minutes; the free-tier machine you start on is a shared box, so read the dedicated-hardware guarantees below as describing rented bare metal. A *project* organizes containers; a *container* is the Linux machine everything above runs on.

The part that changes the economics: **containers are free — you pay for the machine.** No usage meter on Hoody's side; dev, staging, and prod for every project can share one flat-rate machine. And they pack tight: containers boot in seconds and load Kit services on demand, while Hoody merges identical memory pages (KSM) and duplicate disk blocks (BTRFS) across them — so one box holds hundreds without each costing a full slice of RAM and disk. (One honest footnote: like any dedicated server, some marketplace offers carry a monthly traffic allowance — filter with `unlimited_traffic_only: true` in the `browse()` call below if you want none.) Hoody manages the host (provisioning, networking, the proxy); you own everything that runs on it.

The whole chain is driven through the same client, so managing a fleet of any size is a loop, not a console:

```typescript
// Browse the bare-metal marketplace — filter by geography, specs, price:
const offers = await hoody.api.serverRental.browse({ min_ram_gb: 64, country: 'DE' });

// Rent one at its flat rate (rental_days must be a duration the offer supports)…
const rented = await hoody.api.serverRental.rent(offers.data![0]!.id, { rental_days: 30 });

// …and it's a `server_id` you can fill with containers, as in the Quickstart.
console.log(rented.data!.rental!.server_id);
```

Three notes before you put prod here:

- **Renewal** — machines you already rent are managed under `hoody.api.rentals` (a sibling of `serverRental`): `hoody.api.rentals.extend(rentalId, { additional_days })` renews one without touching what's on it (extend before `rental_end`; the machine, its containers, and their data are what you're renting).
- **Durability** — the RAM-backed mount every container gets at `/ramdisk` (on by default) survives container restarts but is **wiped if the physical host reboots**, so keep durable state on the regular disk-backed filesystem and use `hoody.api.containers.createSnapshot(...)` as your undo button.
- **Data path** — because Hoody's reverse proxy itself runs as a container on *your* server, requests to your containers terminate on hardware you rent rather than transiting middleboxes in Hoody's own infrastructure: the control plane sees management operations and the metadata you send it (names, environment variables, token grants), not the request and response bytes flowing through your container services.

### Self-host anything, durably

A container is a real machine with a persistent, LUKS-encrypted disk, so it keeps things as well as it runs them. Self-host whatever you'd normally stand up a server for — a Jellyfin media library, a Postgres, a game server, your own dashboard — put it under the daemon so it comes back after a reboot, and snapshot the whole box for a one-command backup. The media, the data, and the config sit on durable disk; the service answers over HTTPS, so you stream or reach it from a browser tab on any device. Park loose files behind `box.files.*` (glob, grep, archives, WebDAV, 60+ cloud backends), and run as many of these as the machine holds — each isolated, each its own URL. VS Code Server even ships a PWA manifest, so you can install it like a native app.

The layer underneath is Hoody's to keep current, not yours: a hardened, custom-built kernel, LXC + namespace + seccomp isolation, encrypted disks, and host-level firewalls on dedicated bare metal — no hypervisor neighbors, and keeping the host kernel patched is Hoody's job, not yours. You maintain your app; Hoody maintains the floor it stands on.

### Authentication

**Lazy auth** — pass credentials at construction, login happens automatically on first request:

```typescript
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  credentials: { username: 'you@example.com', password: '...' },
});
// Auto-login on first request. Auto-refresh on token expiry.
```

**Explicit auth** — login immediately and get a ready client (the form the [Quickstart](#quickstart) uses):

```typescript
const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
  username: 'you@example.com',
  password: '...',
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

Token-only flows (no credentials on file) pair `token:` with an [`onTokenExpired` refresh callback](#token-refresh-callback). Where tokens come from: `hoody.api.authTokens.create(...)` mints scoped ones ([walkthrough](#give-your-own-users-their-own-hoody-api)); `hoody login --print-token` prints your CLI session's.

**Browser-token hygiene.** A token in JS storage is a bearer credential — anyone who reads it can act as that user. Treat it like a password. Never put your own account credentials or an account-wide token in a static page; hand browser apps a short-lived, realm-scoped token minted by your control plane, with the narrowest permission template that works ([how to mint one](#give-your-own-users-their-own-hoody-api)).

---

## What you can build

Each snippet below is a real, working call against this SDK — shown once, here, at full depth.

> Snippets assume the `hoody` / `box` pair from [One client, two scopes](#one-client-two-scopes): an account client and a container-scoped client.

### Your backend is optional

Paste this into a `.html` file and open it in a browser. It logs into Hoody, picks one of your containers, and replaces the page with a live XFCE desktop:

```html
<!doctype html>
<title>An entire desktop, served from a static file</title>
<script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.0-beta.1/dist/hoody-sdk.browser.min.js"></script>
<script type="module">
  const { HoodyClient } = window.HoodySDK;
  const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
    username: prompt('email'),
    password: prompt('password'),
  });
  const c = (await hoody.api.containers.list()).data.containers[0];
  // Every container service lives on its own stable subdomain. This composes the
  // terminal service's URL and asks it to boot an XFCE desktop, then redirect there.
  const url = hoody.getKitUrl('terminal', c) +
    '?terminal_id=1&display=1&desktop=true&desktop_env=xfce&redirect=display';
  document.body.innerHTML =
    `<iframe src="${url}" style="width:100vw;height:100vh;border:0"></iframe>`;
</script>
```

The `prompt(...)` login is demo-grade; in production, hand the page a short-lived, realm-scoped token minted by your control plane (see [Authentication](#authentication)). The query string is the [GUI recipe's](#stream-any-gui-app-as-a-url) one-shot shortcut.

This works because the Hoody API is CORS-enabled and authenticates with a bearer token rather than a cookie — so the static page calls `api.hoody.com` directly, and the container's Kit URLs are capability URLs it can hit the same way: for most kits the URL itself is the credential ([why that's the default](#containers-are-open-by-default)); the agent kit always adds a container claim; and for a service you've locked down, the SDK attaches its configured proxy-auth headers to `box.*` requests (a bare iframe `src` can't carry those, so front gated embeds with an [alias + permission rules](#aliases-and-custom-domains)). **No proxy server on your side:** the page talks to Hoody's edge, which routes to the container. Provisioning, billing, abuse controls, and minting customer-scoped tokens belong in code you control — but the moment you want to talk to a container (shell, file, Chromium, desktop), you talk to it directly, from wherever your code happens to be.

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

The agent runs as a supervised process you can tail, restart, and stop — entirely over HTTP (the only prerequisite is the binary on the container's `PATH` — `apt install` / `npm i -g` Claude Code first, or use a dev-kit image that already ships it; the config sync below then copies your local settings and credentials, not the binary itself). Same recipe for `aider`, `codex`, `goose`, or anything you can `apt install`.

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

`box.daemon.control.start/stop/enable/disable` and `box.daemon.status.getLogs(id)` manage it from there — restart policies, log tailing, the whole supervisor, no SSH session anywhere. (`box.syncAgentConfigs([...])` batches several tools; `box.listAgentConfigTools()` lists the registry.)

### Give an LLM a real bash terminal

```typescript
// Wire `shell` as a tool on your favorite chat model — in your tool handler:
const out = await box.execute(shellArgs.cmd);
return { stdout: out.stdout, exit_code: out.exitCode };
```

Real shell, real stdout, real exit codes on a full Debian userland — not a mock, not a restricted eval environment. The model can `npm install`, `git clone`, run tests, edit files. Hand it `box.files.*` and `box.browser.*` next and it can read, write, and browse too. And because every capability is already a plain HTTP endpoint returning typed JSON, the three-line tool handler above is the entire integration — no MCP server, plugin protocol, or driver between the model and the machine.

When the model needs an interactive TUI instead of one-shot exec, `box.terminal.terminalAutomation.*` can screen-scrape and drive it: `waitForTerminal` (wait for a regex match or output stability), `getTerminalSnapshot`, `findInTerminal`, `pressTerminalKeys`, `pasteTerminalText`, `sendTerminalMouseEvents`. The system surface `box.terminal.system.*` (`listProcesses`, `listPorts`, `sendSignal`, `freezeProcess` / `unfreezeProcess`, `getResources`) lets your supervisor code see and control what those commands actually spawned.

One habit worth building before you turn an agent loose: snapshot first (`hoody snapshots create` in the CLI, `hoody.api.containers.createSnapshot(...)` in the SDK). Agents are confident, creative, and occasionally catastrophically wrong; a copy-on-write snapshot makes that an undo, not an incident.

### Stream any GUI app as a URL

The [opener](#everything-is-a-url) launched Firefox with two calls: `box.terminal.execution.execute(..., { terminal_id: '1', display: '1' })` to put it on a virtual display, and `getKitUrl('display', container, 1)` for the URL of the live window. Now anyone with that URL sees **the actual Firefox window**, streamed live to any browser on any device. Embed it:

```html
<iframe
  src="https://{projectId}-{containerId}-display-1.{server}.containers.hoody.com?decorations=false&toolbar=false"
  style="width:100%;height:100vh;border:0"
></iframe>
```

> **Embedding is sharing.** The iframe `src` above contains the container's capability URL — anyone who can view the page can read it from the DOM, and on an open container it unlocks every URL-bearer service (`files`, `terminal`, …), not just the display (the agent kit still needs its own claim). Embedding for yourself is fine; embedding for your users means fronting it with an [alias](#aliases-and-custom-domains) plus [permission rules](#containers-are-open-by-default) first.

The same pattern works for anything that speaks X11 — Firefox, GIMP, Blender, a custom Electron app, an IDE, a retro game, a scientific app, a full desktop environment. And because it's just a URL, you can stream it to phones, embed it in your product, share it, bookmark it, or hand it to an AI agent that drives it via `box.display.*`:

```typescript
await box.display.input.clickAt({ x: 100, y: 200 }, { displayId: 1 });
```

`box.display.input` is a complete set of hands: `typeAt` (move + click + type in one call), `drag`, `select`, `batch` (a whole action sequence in one request), key and mouse primitives, window management (`windowSearch`, `windowFocus`, `windowMove`, `windowResize`, `windowClose`) — and `reset`, an emergency release of all held inputs. Clipboard read/write sits alongside at `box.display.getClipboard()` / `setClipboard()`. Pair a screenshot loop with `batch` and a vision model can drive desktop applications no one ever wrote an API for.

**One-shot shortcut.** Prefer a single round-trip? Hitting the terminal URL with `redirect=display` (the endpoint behind `box.terminal.web.get`) creates the session, waits for X11 readiness, and returns a 302 straight to the display URL:

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

The container is a real Debian box. Anything in the package ecosystem — pandoc, ffmpeg, ImageMagick, Postgres, Redis, Playwright — is one `apt-get` (or `pip install`, or `cargo install`) away. Pre-bake your stack into a server image, or install on demand.

### Reverse-tunnel localhost to a public URL

Expose a local HTTP / TCP / WebSocket service from your laptop through a Hoody container. The `tunnelExpose` / `tunnelPull` helpers run on Node.js or Bun (they're not in the browser build):

```typescript
import { tunnelExpose, tunnelPull } from 'hoody-sdk';

// Expose: world-reachable container port 80 → your local HTTP server on :3000
const handle = await tunnelExpose({
  url: hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') + '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 80,               // 0 = auto-assigned
  to: { host: '127.0.0.1', port: 3000 },
});
console.log(handle.publicUrl);     // → https://{projectId}-{containerId}-tunnel-1.{server}.containers.hoody.com
await handle.close();

// Pull: container-loopback :8080 (reachable only from inside the container) → local TCP service on :5432
const pulled = await tunnelPull({
  url: hoody.getKitUrl('tunnel', container).replace(/^https:/, 'wss:') + '/api/v1/tunnel/connect',
  token: (await hoody.getAuthToken())!,
  containerPort: 8080,
  to: { host: '127.0.0.1', port: 5432 },
});
console.log(pulled.publicUrl);
await pulled.close();
```

World-reachable HTTPS for whatever's running on your laptop. No router config, no separate tunnel service to sign up for, no NAT gymnastics — and the pull direction works for raw TCP, so in-container code can reach your local Postgres. `tunnelServe` (Bun only) takes a `Bun.serve`-compatible `fetch` handler if you want a one-call listener without running your own HTTP server. For the low-level session / bind / frame primitives, import `TunnelSession` from the package root; `box.tunnel.*` is the admin surface (list/kill sessions, bindings, metrics).

### The built-in agent

You don't have to bring an agent — every Hoody Kit container ships one. `box.agent.*` exposes <!-- ref:agent-sdk-methods -->208<!-- /ref:agent-sdk-methods --> methods across sessions, models, skills, memory, todos, workflows, hooks, GitHub integration, tools, and logs. It is the largest container-scoped namespace in the SDK.

The agent is the one kit that needs more than the URL: it's **claim-gated**, so the
first agent call after a bare `withContainer(container)` returns `401 CLAIM_REQUIRED`.
That's a one-call setup — authorize the container, attach the claim, done. The claim
is time-limited, so pass an `onKitAuthExpired` callback to refresh it, or skip the
handshake entirely and let [`streamAgentPrompt`](#the-built-in-agent) mint (and renew) it for you:

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
const sessionId = created.data!.session_id as string;

// Prompt it synchronously (blocks until the turn completes):
const turn = await box.agent.sessions.promptSync(sessionId, {
  text: 'Run the test suite and fix the first failure you find.',
});
```

The model behind a session is per-container configuration: provider API keys, OAuth sign-ins, and the default model live under `box.agent.models.*` (`setProviderAPIKey`, `startProviderOAuth`, `setProviderDefault`, `listModels`).

For streaming (on Node.js or Bun), use the hand-written `streamAgentPrompt` helper exported from the package root — it POSTs the turn, parses the daemon's SSE stream, and hands you text deltas, every turn event, and a `done` promise (it also mints the Kit-auth handshake for you via `hoody.api.containers.authorize()`):

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

Beyond prompting, the namespace covers the agent's whole operational life: recurring loops with hard budgets and one-shot headless runs (`box.agent.headless.createHeadlessRun`); memory with hybrid-recall search and a relation graph; todos and declarative workflows; a full tool catalogue with sessionless `runTool` / `streamTool`; GitHub device-flow login, clone, commit, PR; LLM provider keys and skills; hooks and usage statistics. Full method listing: [`docs/reference/namespaces/agent.md`](./docs/reference/namespaces/agent.md).

### Everything else in the box

The recipes above lean on a handful of namespaces. Also in the box: filesystem watchers streaming over SSE/WebSocket (`box.watch`), collaborative docs and notebooks (`box.notes`), outbound HTTP jobs with cookie sessions and scheduling (`box.curl`), streaming transfer channels (`box.pipe`), a launcher for prebuilt apps (`box.app`), desktop and mobile notifications (`box.notifications`), VS Code Server (`box.code`), and reverse-proxy access logs (`box.proxyLogs`). The full map is in [Namespaces](#namespaces).

---

## Build your platform on Hoody

Every namespace in the SDK is infrastructure you don't have to build, host, or maintain. Yours is the product:

```typescript
// Your AI coding agent — you write the AI logic, Hoody handles everything else
const box = await hoody.withContainer(container);
await box.execute('git clone ...');
const files = await box.files.listDirectory('/workspace');
await box.execute('git apply /workspace/patch.diff');
// Run a CLI agent in a sandbox and stream its output over HTTP:
await box.daemon.quickStart.launch({ user: 'user', command: 'aider --message "review the diff"' });
```

You're not building any of the usual scaffolding to get there: no container orchestration, no terminal multiplexing, no filesystem abstraction layer, no browser-automation harness, no display-streaming server, no cron daemon, no reverse-proxy config. Every row below is the same SDK, same auth, same types — you call `box.terminal`, `box.files`, `box.browser`, `box.display`, and it's all one client talking to one container.

| Use case | What you write | What Hoody handles |
|---|---|---|
| Cloud IDE / coding platform | UI, collaboration, billing | Containers, terminals, file ops, AI agent, display |
| AI agent framework | Prompts, tool selection, memory | Sandboxed execution, file I/O, browser, screenshots |
| CI/CD pipeline | Build logic, triggers, dashboards | Isolated runners, cron scheduling, artifact storage |
| Education platform | Curriculum, grading, student UI | Per-student containers, code execution, terminals |
| Internal dev tools | Custom workflows, integrations | Secure remote shells, file transfer, DB queries |
| Browser automation | Scraping logic, data pipeline | Cloud Chromium, screenshots, cookie management |
| Remote desktop product | Auth, user management, UI shell | X11 display streaming, input relay, clipboard sync, multiple virtual displays |

The economics compound for platforms: you rent [flat-rate bare metal](#bare-metal-underneath) and spawn as many containers as it holds, so each customer you onboard costs no new infrastructure until the machine is full — and scaling is "rent another server", not "renegotiate a cloud bill". The SDK is Apache-2.0-licensed — use it as a dependency, fork it, wrap it in your own SDK, white-label it.

### Give your own users their own Hoody API

Multi-tenancy is normally the tax you pay before your first customer: an auth service, a session store, RBAC tables, tenant-isolation logic, and a permanent fear of cross-tenant leaks. On Hoody, it is three API calls.

With **Realms** and **Auth Tokens**, you hand each of your end users a fully isolated slice of the Hoody API — their own containers, their own files, their own terminals, even their own cloud desktop — without them ever touching your account. You mint realm-scoped tokens (the code below); Hoody's control plane enforces the scope.

And what you hand over is a finished environment, not raw infrastructure: a whole maintainable project — its code, its running GUIs, its databases, and a built-in AI agent to keep it running — delivered as a single URL you can [white-label](#aliases-and-custom-domains) as your own. Ship the URL; you've shipped the product.

```typescript
// You: the platform provider — log in with your account credentials.
// (This walkthrough uses account auth; a token can mint sub-tokens only
//  if you granted it the resources.create_tokens permission.)
const hoody = await HoodyClient.authenticate('https://api.hoody.com', {
  username: process.env.PROVIDER_EMAIL!,
  password: process.env.PROVIDER_PASSWORD!,
});

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

Your customer now has a fully typed Hoody API where only their containers exist. They can list containers, run commands, read files, drive browsers, open that desktop — whatever permissions you granted. Your other customers, your billing, anything outside their realm: not "access denied" — those resources don't exist in their universe. On the consuming side, the whole client is two lines — the token you handed off, scoped to the realm subdomain:

```typescript
const acme = new HoodyClient({ baseURL: 'https://api.hoody.com', token: customerToken })
  .withRealm('507f1f77bcf86cd799439011');   // routes every request via the realm subdomain
```

**What you get for free:**

- **Multi-tenancy** — one realm per customer; a realm-scoped token can only see or act on resources tagged with that realm (control-plane scoping — container-level isolation is the container boundary itself)
- **Permission templates** — `external_customer`, `dev_team`, `read_only`, `finance_team`, `full_access`, or fully custom
- **Security controls** — IP allowlists (`ip_whitelist`), expiration dates, enable/disable without deletion
- **Token introspection** — customers can call `/api/v1/auth/tokens/me` to discover their realm and permissions
- **Public token profiles** — attach metadata to tokens (display name, tier, logo) via `public_storage` — requires a `public_key` (Ed25519), settable at creation or later via the public-profile endpoint
- **No auth machinery to build** — no JWT verification, no session store, no RBAC tables; your side reduces to minting, storing, and rotating the realm-scoped tokens (the code above)

The same pattern works for non-human tenants: give each AI agent its own realm and a misbehaving agent can't even *see* the containers outside its realm via the API, let alone manage them through it.

See [Realms & Projects](https://docs.hoody.com/concepts/realms-projects/) and [Auth Tokens](https://docs.hoody.com/api/auth-tokens/) for the full reference.

## Aliases and custom domains

Realms hide your account from your customers; aliases and custom domains hide Hoody from them. Together they are the white-labeling layer: your customers see your product and your domain, never a 24-hex container ID.

An alias is a per-user 3–61 char label that maps to a `(project, container, program, index)` tuple. The URL you share is the alias subdomain; the real IDs never appear in it. Leave `alias` blank and the API auto-generates a 48-character hex string for share-by-obscurity links.

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

> **What's safe to alias publicly?** An alias is a label, not a lock — permission rules follow the *container*, so there is no way to lock down only the alias. Publish aliases for services whose surface you'd publish anyway: an `http-{port}` app, an `exec` endpoint, a `pipe`, a `tunnel`. Never publicly alias `terminal`, `files`, `sqlite`, `display`, or `browser` unless you've put permission rules on the container first — a label on a shell is still a shell. And delete aliases before you delete the container behind them.

### Custom domains via CNAME

Aliases are stable subdomains, so any domain you own can front one with a single DNS record:

```text
CNAME  api.example.com  →  team-dashboard.node-example-1.containers.hoody.com
```

The first time someone hits `https://api.example.com`, Hoody's reverse proxy issues a TLS certificate for it on the fly and forwards the request to the alias's container. Combine with permission rules on the edge and realm-scoped API tokens for tenant isolation: your domain on the outside, Hoody's controls underneath.

One transparency note worth knowing: unlike default container subdomains ([kept out of CT logs by the wildcard certificate](#containers-are-open-by-default)), a custom domain gets its own certificate — so the hostname you CNAME **will** appear in public CT logs. Name it accordingly.

## Drop a script, get an endpoint

Hoody's primitives don't change. Terminals, files, browsers, displays — the base layer is small, stable, and typed. Everything you build lives **above** the primitives and grows without ceremony or redeploys.

The `exec` namespace is the canonical example. Drop a TypeScript file into the container's `exec/scripts/` tree — from the SDK that is one call, or save it through VS Code / any editor attached to the container:

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

The moment you save the file, that function is reachable from **every** entry point Hoody offers — no rebuild, no router config (the CLI caches its subcommand list; `--refresh-scripts` picks up a brand-new script):

| Caller          | How they reach `exec/scripts/api/build.ts`                                               |
|-----------------|------------------------------------------------------------------------------------------|
| CLI             | `hoody exec api-build --query branch=main`                                               |
| SDK             | `await fetch(hoody.getKitUrl('exec', container) + '/api/build', { method: 'POST' })`      |
| HTTP            | `POST https://{projectId}-{containerId}-exec-1.{server}.containers.hoody.com/api/build`  |
| AI agent        | The endpoint is now in the agent's discovered tool catalog                               |
| Cron            | Add `// @schedule '0 * * * *'` to the script — done                                      |
| Webhook         | Point any external system at the HTTP URL                                                |

That property cascades. A script can call other scripts, kick off cron, spawn daemons, hand control to an agent, or expose a tunnel that pipes results back to your laptop. **The base methods don't change; the surface grows around them — same SDK, same auth, same URL topology.** (Full `exec` surface — schema-typed flags, the `@schedule` magic comment, the script tree — in [`docs/reference/namespaces/exec.md`](./docs/reference/namespaces/exec.md).)

---

## Security model

Hoody's security model is "few primitives, explicit edges": a cross-zone call carries either a scoped bearer token or, for open containers, possession of the capability URL itself (see [Containers are open by default](#containers-are-open-by-default)). Nothing is authorized by ambient identity.

### Trust zones

| Zone                                  | What it is                                                                | Trusts                                                                                | Does **not** trust                                                              |
|---------------------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| **Your machine** (laptop, server, CI) | Holds your bearer token in env, config, or memory                         | The control plane it points `baseURL` at                                              | Anything served *by* a container — that's untrusted code talking back            |
| **Control plane** (`api.hoody.com`)   | Account, billing, container provisioning, realms, tokens                  | A bearer token after a successful `/auth/login` or token-validate                     | Container file systems, processes, or anything inside `*.containers.hoody.com`    |
| **Your container**                    | A real Linux box running your code or a customer's                        | Whatever code you put in it                                                           | The control plane back. No automatic identity flows back the other way           |
| **A user's browser tab**              | Static page calling `api.hoody.com` directly                              | The token you put in `localStorage` / memory                                          | Cross-origin requests — the SDK strips `Authorization` when the URL leaves your `baseURL` origin |
| **Another container** (someone else's, or another of yours) | Equally a real Linux box                                | Nothing about your container                                                          | Anything about your container — no shared identity, no shared file system        |

The non-obvious edge is the third row: **the control plane never gives a container access to your account.**

### The in-container `hoody` CLI is intentionally credential-less

Type `hoody` inside any Hoody container — the binary is on every user's `$PATH`, shipped from a read-only plugin mount under `/hoody/plugins`. Same CLI as on your laptop, same `hoody chat`, same `hoody containers list`, same SDK behind the scenes.

But the first authenticated call returns 401 until **you** hand it a token. There's no auto-login that picks up "the user who owns this container", because the alternative would mean any code that ran inside the container — your scripts, an `npm install` post-install hook, a misbehaving dep, a shell an attacker just got — could call the API as you and act on your *other* containers, your billing, your realms.

So Hoody draws the trust line at the container boundary. Authenticate the in-container CLI explicitly, with the *narrowest* token that works:

```bash
# Inside the container — pick whichever fits the situation:
hoody login                                      # interactive sign-in
export HOODY_TOKEN=<a-realm-scoped-token>        # for scripts and CI
hoody --token <a-realm-scoped-token> ps          # one-off, per call
```

Mint that in-container token with a tight permission template (`external_customer`, `read_only`, or a custom one) and a short expiry. A compromised container's API blast radius is then that container plus its realm's resources — not your account, not your other realms.

### Defense layers, by where they live

<details>
<summary>Ten layers — where each lives and what it enforces</summary>

| Layer                          | Lives at              | Enforces                                                                                                         |
|--------------------------------|-----------------------|------------------------------------------------------------------------------------------------------------------|
| Bearer token + open CORS       | `api.hoody.com`       | Your identity. The SDK strips `Authorization` on any cross-origin request or redirect, so it never attaches your API token to a cross-origin Kit URL |
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

The layers compose into three postures you'll actually use:

- **Development — open.** The capability URL is the password; fastest possible loop.
- **Staging — IP-restricted.** One permission rule pins the container to your office/VPN CIDR.
- **Production — locked down.** Permission rules default-deny with a token or JWT auth group at the proxy, realm-scoped API tokens for tenant isolation, aliases or your own domain in front so real IDs never circulate. Agents get their own realms; anything an agent will modify gets a snapshot first.

You don't have to wire any of this up — it's how the platform is built. Your job is to pick the right layer for the trust model you want, and to keep your container IDs and tokens off public surfaces.

---

## Namespaces

19 namespaces, <!-- ref:sdk-methods -->1065<!-- /ref:sdk-methods --> typed methods. Account-level (`hoody.api.*`) is reached without a container; everything else is reached through a container-scoped client (`box = await hoody.withContainer(c)`).

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
| `app`             | Container | Application launcher — resolve & run prebuilt apps from package sources, profiles, recipes | `box.app.recipes.get('newsletter')`                                        |
| `notes`           | Container | Collaborative docs, notebooks, comments, versioning, embedded DBs                       | `box.notes.notebooks.create({ name: 'plans' })`                            |
| `notifications`   | Container | Desktop and mobile push notifications, real-time stream                                | `box.notifications.notify.trigger({ summary, body, display: '0' })`        |
| `tunnel`          | Container | Reverse tunnels — expose HTTP / TCP / WebSocket services on the public internet ([recipe](#reverse-tunnel-localhost-to-a-public-url)) | `box.tunnel.listSessions()`                                                |
| `proxyLogs`       | Container | Reverse-proxy access logs and stats                                                     | `box.proxyLogs.logs.list()`                                                |
| `agent`           | Container | AI agent (<!-- ref:agent-sdk-methods -->208<!-- /ref:agent-sdk-methods --> methods) — sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs ([recipe](#the-built-in-agent)) | `box.agent.sessions.promptSync(id, { text })`                              |

</details>

Hand-written helpers worth knowing — the `box.*` entries are client methods, the rest are package-root exports:

<details>
<summary>streamAgentPrompt, curl multiplexing, tunnel helpers, vault crypto, signature verify, events</summary>

- **`streamAgentPrompt`** — the supported path for streaming agent turns ([recipe](#the-built-in-agent)).
- **`box.curlChannel()` + `createCurlFetch`** — a `fetch()`-compatible function that multiplexes many concurrent HTTP requests, SSE included, over one WebSocket.
- **`box.syncAgentConfig(tool)`** — push local CLI-agent config into a Kit container ([recipe](#run-claude-code-or-any-cli-agent-and-drive-it-over-http)).
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
- **Automatic redaction** — on the attached request context (`err.request`, `err.url`), `Authorization`, `Cookie`, `Proxy-Authorization`, `x-*-token`, `x-*-key`, URL query params (`?token=…`, `?apikey=…`), URL userinfo, and secret body fields (password / token / apikey / …) are scrubbed to `[REDACTED]` before the error reaches your `catch` block. Your own credentials travel in that request context, so exporting the error to Sentry / Datadog / structured logs won't leak them. Two honest caveats: redaction is pattern-based, so a secret you send under a nonstandard field name is still yours to scrub; and `err.response` / `err.message` carry the server's reply verbatim — don't assume the whole `ApiError` is safe to export, and sanitize those if your backend may echo anything sensitive.

## TypeScript

All types are included. Every method has typed parameters and return values — response types are inferred, so you rarely import them by hand. (Runtime helpers like `ApiError` and `ValidationError` — plus types like `IHttpClientMiddleware` — are importable from the package root.) The main honest exception: `box.agent.*` responses are verbatim daemon replies typed as `Record<string, unknown>` (a handful of other endpoints — some terminal, notes, and exec responses — are loosely typed the same way), so expect an occasional cast there — the [agent recipe](#the-built-in-agent)'s `session_id as string` is exactly that.

```typescript
const { data } = await hoody.api.containers.list();
// `data` is fully typed — data.containers![0]!.id, .name, and every field below.
```

## Retry, middleware, token refresh

### Per-request overrides

Every service method accepts an options object with per-call overrides for retry budget, response shape, and timeouts — no need to rebuild the client:

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
  onError:    async (ctx) => { /* ship err to observability; a throw here is silently suppressed, not propagated */ },
};

const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  middlewares: [tracing],
});
```

Middleware fires on every retry attempt. If `onRequest` throws, it flows through retries and `onError` exactly like a transport failure (no special-case).

### Token refresh callback

For token-only flows (no username/password on file), supply an `onTokenExpired` callback. On 401 the SDK calls it once, adopts the returned token, and replays the original request. No global state, no login race — concurrent 401s coalesce through a single refresh.

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

- **Cross-origin auth strip.** If a request resolves to a host outside your `baseURL` origin (or a realm subdomain of it), `Authorization` is dropped before fetch — so a Kit URL handed to an AI agent cannot accidentally leak your API token.
- **Non-replayable bodies.** `ReadableStream` and async-iterable bodies are detected; retries on those fail fast instead of replaying an empty body.
- **RFC 9110 Retry-After.** Integer-seconds and HTTP-date forms are parsed, clamped to 30s, and respected over local backoff on any retried error status (typically 429 / 503).

## Every front door

The SDK is one way in, not the only one. Hoody is reachable from wherever you happen to be — terminal, browser, AI chat, CI runner — and every front door talks to the same control plane and the same per-user containers. Switching between them is a paste, not a migration: one auth token unlocks all of them, and the CLI you run over `ssh` is the same `hoody` binary `npx https://hoody.com` runs and this SDK package ships.

<details>
<summary>Seven front doors — SSH, npx, static binary, npm, WebOS, and any AI chat</summary>

| Front door                                            | What it does                                                                              | Best for                                                            |
|-------------------------------------------------------|-------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **`ssh hoody.com`**                                   | Drops you straight into the Hoody CLI in a memory-only sandboxed shell. No install. Sign in interactively, or paste a token at the prompt. | Reaching your account from any laptop, jump box, or remote host with `ssh`. |
| **`ssh hoody_<token>@hoody.com`**                     | Same as above, but the SSH username carries your auth token — the sandbox auto-authenticates the moment the connection lands. Use a narrow, short-expiry token: the username is visible in shell history and host logs. | Scripts, cron, one-liners, CI pipelines — no interactive step. |
| **`npx https://hoody.com`** *(or `bunx`, `pnpm dlx`, `yarn dlx`, `deno run`)* | Run the latest `hoody` CLI without installing anything globally.                          | Quick checks from a workstation that already has Node.js, Bun, or Deno. |
| **`curl https://hoody.com/hoody-cli`**                | Download a single static binary for your platform — no runtime needed.                    | Air-gapped boxes, container build steps, locked-down CI.             |
| **`npm i hoody-sdk`** *(URL mirror: `npm i https://sdk.hoody.com`)* | Install this very SDK from the npm registry — pin a version in production; the URL mirror always tracks latest. | TypeScript / JavaScript projects of any shape.                      |
| **`os.hoody.com`**                                    | A full Hoody WebOS in any browser. The UI itself is served by *your own* container — `os.hoody.com` only signs you in and forwards you there. The OS *is* your container. | Users on phones, tablets, Chromebooks, ChromeOS-Flex laptops; anyone without a terminal. |
| **`@hoody.com`**                                      | Paste `@hoody.com` into ChatGPT, Claude, Gemini, Codex, Cline, Roo Code, or any web-fetching agent. The agent fetches a Skill — a structured HTTP map of every Hoody capability — and drives your account with a token you give it, no SDK, MCP server, or plugin in between. | Letting any web-fetching AI assistant operate Hoody from a paste plus a scoped token. |

</details>

## CLI

The CLI is the `hoody` command shipped inside `hoody-sdk`. Run it with zero install straight from the URL — no global package, nothing added to your project:

```bash
npx https://hoody.com login       # interactive sign-in (or OAuth) — also bunx / pnpm dlx / deno run
npx https://hoody.com ps          # list containers (grab a container id)
npx https://hoody.com -c <containerId> terminal sessions exec --ephemeral --command "uname -a"
npx https://hoody.com -c <containerId> files get /etc/hostname
```

Every `hoody <args>` example below is the same command — install it once (globally, below) and drop the `npx https://hoody.com` prefix.

**Signing in.** `hoody login` is the interactive front door:

```bash
hoody login                                  # prompts for a method, then credentials
hoody login --web                            # OAuth via your browser (GitHub / Google / existing session)
hoody login --email you@example.com -p       # prompt for the password securely (never echoed)
hoody login -u alice -p "$HOODY_PASSWORD"    # fully non-interactive (keep secrets out of shell history)
hoody signup                                 # create an account, verify, and land logged in
```

`--web` runs the RFC 8628 device flow with PKCE: the CLI prints a short code + URL (and opens your browser unless `--no-browser`), you approve in the browser, and the CLI completes the login. `hoody auth login` / `hoody auth signup` remain the flag-only primitives for scripting (full `--output` parity); `hoody login` additionally supports `--print-token` and `-o json` for the common cases.

Or install it globally — the `hoody` command lives in the SDK package:

```bash
npm install -g hoody-sdk           # installs the `hoody` command
hoody login
hoody ps
```

> The command is `hoody`. The zero-install `npx https://hoody.com` form runs the exact same CLI without adding anything to your project.

**Running from a clone.** Forked this repo — as many agents do, to keep it around as living documentation? The `hoody` command builds straight from the checkout, so the CLI you run is the exact code you're reading.

<details>
<summary>Build from a clone, or run the TypeScript entry point in place</summary>

```bash
git clone https://github.com/HoodyNetwork/hoody-sdk.git && cd hoody-sdk
npm install            # root toolchain (tsx, generators)
npm run build:cli      # compiles cli/dist (via Bun)
npm link               # puts `hoody` on your PATH, served from this checkout
hoody login && hoody ps
```

Prefer no global command and no build step? Run the TypeScript entry point in place — every `hoody <args>` becomes `npx tsx cli/index.ts <args>`:

```bash
cd cli && npm install                        # one-time: CLI runtime deps
npx tsx index.ts login                        # then `index.ts <args>` for any command
```

Either path gives the identical command tree the npm package ships; you're just pointing at your own checkout instead of the published tarball.

</details>

See the [CLI commands reference](./docs/reference/CLI-COMMANDS.md) for the complete command list.

**Pipe-friendly output.** Every command accepts `--output <format>` globally (`table`, `json`, `yaml`, `wide`, `raw`). Use `--output raw` to print a string response body verbatim (non-string objects fall back to formatted JSON) — ideal for piping file contents, log lines, or `package.json` into other tools without jq-munging an envelope.

**Dynamic script commands.** Any user-authored script saved under `exec/scripts` shows up as a real subcommand at `hoody exec <name>` (e.g. `api/reports.ts` → `hoody exec api-reports`). Scripts with a declared schema get fully typed flags; schema-less scripts accept generic transport flags — `--method`, `--query k=v` (repeatable), and `--body @file.json`. Pass `--refresh-scripts` to bypass the discovery cache when you have just added or edited a script.

### Secret storage — lock mode

`hoody local lock` encrypts CLI credentials at rest with XChaCha20-Poly1305, using key material derived from a user-supplied password with argon2id. While locked, `config.json` stores `{"token": {"__locked__": "v1"}}` sentinels instead of plaintext (the same applies to every lock-eligible field — `refreshToken`, `kitToken`, `container`, `project`, `realm`, `password`):

```bash
hoody local lock setup                   # prompts for a password
hoody local lock status
HOODY_LOCAL_PASSWORD=… hoody containers list   # unlocks for this invocation only
hoody local lock remove                  # (requires confirmation)
```

Lock mode is a CLI-only feature — SDK consumers don't interact with it.

### `hoody chat` — built-in AI assistant

`hoody chat` is an interactive LLM that knows the Hoody CLI and platform. Ask it how to do something and it answers with real `hoody ...` commands.

```bash
# One-shot — pipe-safe, streams the answer to stdout:
hoody chat "how do I list containers on a specific server?"

# Interactive REPL (ephemeral — nothing persisted by default):
hoody chat

# Persistent session (opt-in):
hoody chat --persist

# Pull in Hoody docs context via the @hoody.com pre-fetch:
hoody chat "@hoody.com what is a realm?"
```

**Provider config.** `hoody chat` brings the CLI knowledge; you bring the model — without a configured provider (an LLM key, or a keyless local/RFC1918 endpoint) it won't answer. Of its three env-var tiers (first tier set wins), Tier 1 (`HOODY_CHAT_KEY`, chat-dedicated, MiniMax by default) and Tier 3 (any OpenAI-compatible endpoint) are shown below; Tier 2 (`HOODY_CLI_AI_KEY`) and the full resolution order live in [CLI authentication](./cli/CLI_AUTHENTICATION.md):

```bash
export HOODY_CHAT_KEY=sk-…          # your MiniMax API key (from minimax.io) — the chat-dedicated tier's default provider
# OR any OpenAI-compatible endpoint:
export OPENAI_API_KEY=sk-…
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
```

Full command reference: [Chat guide](./docs/reference/guides/chat.md).
Privacy model and data-retention details: [Chat privacy](./docs/reference/guides/chat-privacy.md).

## API reference

- [SDK method reference](./docs/reference/SDK-METHODS.md) — full listings for all 19 namespaces
- [Per-namespace docs](./docs/reference/namespaces/_INDEX.md)
- [CLI commands](./docs/reference/CLI-COMMANDS.md)
- [HTTP endpoint map](./docs/reference/HTTP-METHODS.md) — every HTTP method + path ↔ its SDK method ↔ its CLI command
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
