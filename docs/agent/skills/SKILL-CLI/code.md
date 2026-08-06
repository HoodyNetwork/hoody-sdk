> _**CLI skill · `code` namespace** · ~5,487 tokens · hoody-sdk v1.0.0-beta.12_

# `code` — VS Code in the browser, per container

## Purpose

**This is the VS Code IDE running in a browser tab — not a programmatic API.** Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>&id=1` and you get the full editor: file tree, diff view, debugger, terminals, extensions marketplace, all backed by the container's filesystem. The public `code-1` URL is served by an **orchestrator** that requires both `folder` and `id` query params on `/` (it boots child editor instance `id` and iframes it from the `{P}-{C}-http-<60000+id>.{N}` subdomain); with neither param it serves the OpenAPI spec, with only one it returns 400. The `code` namespace methods documented here exist mainly to *configure* the editor (open a folder, install an extension, mint a path-proxy URL) — the day-to-day use is "open the URL".

Like every Hoody kit URL, `code` is **iframable**: drop the `code-1` URL into an `<iframe>` and you've embedded VS Code in your own page. Same for every other kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of Hoody kit iframes with no native code, just URLs and standard CSP / cookie wiring.

**Headline mode: extension-only embed.** Add `&extension=<publisher>.<name>` (alongside the required `folder` and `id` params) and the editor boots into a **single extension's UI** — no file tree, no command palette, no marketplace, no IDE chrome. Just that extension's panel filling the viewport. Pair the extension with the iframable kit URL and you have:

- A coding agent (e.g. **Cline** — `saoudrizwan.claude-dev`) accessible from any browser, including mobile phones with no IDE installed.
- The same agent embedded into your own dashboard, a docs site, a Notion page, a Slack canvas (URL preview), a CRM, or any other HTML surface.
- A focused tool surface (Continue, Copilot Chat, Roo Cline, GitLens, Marquee, Excalidraw, Markdown previewer, Jupyter, …) without exposing the full editor.
- A "Cline-as-a-service" deployment: brand it via `hoody proxy create` and ship a URL like `https://agent.{server_name}.containers.hoody.com` to your team, hiding the `containerId`.

The container's filesystem still backs the extension (it can edit files, run terminals, hit the network, etc.) — same persistent state as the full IDE. Multiple child instances let you run multiple single-extension surfaces side-by-side under one container — same `code-1` URL, different `id` values (e.g. Cline at `?extension=…&folder=…&id=1`, Continue at `…&id=2`).

## When to use

- **Humans editing code**: hand the user the URL — that's the whole product.
- **Single-extension embed for an agent or tool** — `?extension=<publisher>.<name>` boots straight into that extension's UI; iframable, mobile-friendly, distributable as a brand-able alias.
- Pre-open a workspace/folder for them via `?folder=` / `?workspace=` (so the URL is bookmarkable).
- Pre-install extensions (custom internal VSIX) via the kit's launch flags or in-editor — the `hoody code extensions *` HTTP endpoints are spec-only, not implemented (see Quirks).
- Tunnel an in-container port through the editor's path-proxy on the **child instance** subdomain: `/proxy/{port}` (rewrites `req.base`) or `/absproxy/{port}` (verbatim — use this for APIs/WS).

## When NOT to use

Not for: non-interactive shell → `terminal`/`exec`, file I/O without a UI → `files`, long-lived processes → `daemon`, headless web → `browser`. Not a coding-agent control plane → `agent` (the typed in-container AI-agent HTTP namespace, slug `agent`; the Hoody Agent browser GUI on the same `-agent-1` host is the human surface).

## Prerequisites

- Password mode: session cookie via the HTML form login at the **child instance** root (`POST /login`, form-encoded — see Example 7). The generated `hoody code auth *` accessors build `/api/v1/code/login|logout`, which no surface routes.
- VSIX install: the `hoody code extensions *` HTTP endpoints are spec-only (not implemented) — pre-install via the child launch flags or in-editor (see Example 3).

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

## Common workflows

### 1. Open a workspace folder

1. Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>&id=1` — both `folder` and `id` are required at the public kit URL.
2. `hoody code vs` (`folder`/`workspace`/`locale`) is the child-instance surface behind it; `ew=true` clears the persisted folder.

### 2. Embed a single extension (single-tool browser surface)

Pin one extension as the entire UI of a `code-N` instance — no editor chrome around it.

1. Make sure the extension is installed in the container's VS Code: pre-install via the child launch flags (`--install-extension`, `--preload-builtin-extensions-dir`) or in-editor — the `hoody code extensions install`/`hoody code extensions list` HTTP endpoints are spec-only (see Quirks).
2. Open / iframe `https://{P}-{C}-code-1.{N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<abs-path>&id=1` (`folder` and `id` are required). Examples:
   - `?extension=saoudrizwan.claude-dev` — Cline (autonomous coding agent), works on a phone.
   - `?extension=continue.continue` — Continue chat.
   - `?extension=ms-toolsai.jupyter` — Jupyter notebooks UI only.
   - `?extension=eamodio.gitlens` — GitLens panel.
3. Point `folder` at the repo you want the extension to see (it is required either way).
4. Embed: `<iframe src="…/?extension=…&folder=…" allow="clipboard-read; clipboard-write"></iframe>` — works in any HTML page, mobile browser, Slack URL preview surface, etc.
5. Brand the URL: `hoody proxy create` → `https://agent.{server_name}.containers.hoody.com`. Hides the `containerId`; gate via `proxyPermissionsContainer.*` for production.

To run two distinct single-extension surfaces under the same container, use different `id` values at the same `code-1` URL (`id=1` for Cline, `id=2` for Continue, etc. — each `id` is its own child editor instance).

### 3. Install and verify a VSIX

`hoody code extensions install` / `hoody code extensions list` are spec-only — not implemented by the current kit (see Quirks). Pre-install via the child launch flags or in-editor, then verify on disk (Example 4).

### 4. Tunnel a container port

The **child instance** mounts `/proxy/:port` and `/absproxy/:port` at its root (`{P}-{C}-http-<60000+id>.{N}` subdomain); the public `code-1` root does NOT route them. The generated accessors `hoody code proxy-path` / `hoody code proxy` build URLs against `/api/v1/code/proxy/...` which no surface routes — drive path-proxy with raw URLs (`https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...`) or the hand-extended embed-URL builder under the `code.vscode` service (see Quirks for `embedUrl`).

### 5. Authenticate password mode

Form-POST the password to the **child instance** root `/login` (see Example 7) — the generated `hoody code auth *` accessors build `/api/v1/code/login|logout`, which no surface routes.

## Quirks & gotchas

- Login limit 2/min, 12/hr per process.
- `/api/v1/code/health` resets idle heartbeat; only `/healthz` excluded.
- 3 mount prefixes; use `/api/v1/code`.
- `hoody code vs` persists `folder`/`workspace` as the last-opened workspace in the instance's user-data dir; `ew=true` wipes.
- `hoody code auth mint-key` idempotent.
- `hoody code extensions install` / `hoody code extensions list` are declared in the kit OpenAPI (and surfaced by the generated SDK/CLI) but the current kit does NOT implement them — no extensions router is mounted anywhere; requests fall through (child: vscode catch-all SPA/302; `code-1`: orchestrator plain-text 404). Pre-install via the child launch flags (`--install-extension`, `--install-builtin-extension`, `--preload-builtin-extensions-dir`) or in-editor.
- `/proxy/:port` and `/absproxy/:port` are mounted at the **child instance root** (`{P}-{C}-http-<60000+id>.{N}` subdomain), NOT under `/api/v1/code` and NOT at the public `code-1` root — the orchestrator has no proxy routes. Use `https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...` (or `/absproxy/{port}/...`).
- `/proxy/:port/...` rewrites `req.base` so the upstream sees `/<rest>`; `/absproxy/:port/...` keeps the full `/absproxy/:port/...` prefix verbatim — use `absproxy` for APIs/WS where the upstream cares about its own base path.
- `hoody code check-update` (the generated accessor — the `update.*` service does not exist) queries GitHub releases. NOTE: the generated path is `/api/v1/code/update/check`, but `/update` is mounted on the **child instance** root only — the generated call and the public `code-1` root both miss it (orchestrator has no `/update` route). Call `https://{P}-{C}-http-<60000+id>.{N}…/update/check` directly. The route returns `{ checked, latest, current, isLatest }`, but the generated TS type `CodeHealthCheckUpdateResponse` (from the OpenAPI spec) mis-declares `{ current, latest, updateAvailable }` and drops `checked` — read `.isLatest`/`.checked` from the raw JSON, not `.updateAvailable`. `?force=true` bypasses the 24 h cache (kit-level only — not exposed via the generated SDK or CLI surfaces; reachable only by raw HTTP to `/update/check?force=true`).
- `hoody code health` at the public `code-1` URL hits the ORCHESTRATOR, which returns the standardized 9-field `{ status: "ok", service, built, started, memory, fds, pid, ip, userAgent }` envelope — matching the generated TS type. The flat `{ status: "alive" | "expired", lastHeartbeat }` shape only appears on the child instance's health route (`{P}-{C}-http-<60000+id>.{N}` subdomain).
- `kit_slug` always `code`.
- `embedUrl` is a hand-extended SDK builder hung off the `code.vscode` service; an equivalent embed builder also exists on the CLI surface. Composes the iframe URL without firing a request.

## Common errors

- `hoody code extensions install` / `hoody code extensions list`: not implemented — at `code-1` the orchestrator returns a plain-text 404; on the child the request falls through to the vscode catch-all (SPA / 302 / 401). The `MISSING_URL`/`INVALID_URL_FORMAT`/`DOWNLOAD_FAILED`/`INSTALLATION_FAILED` codes exist only in the OpenAPI spec, never at runtime.
- Path-proxy 400 `Invalid port`. The cited line only checks `isNaN(port)`; the 1024–65535 range is enforced by the OpenAPI client validator before the request lands.
- `/proxy/{port}/` unauth root returns 302 `/login`; deeper 401.
- `hoody code auth submit` rate-limit returns HTML, not JSON.
- Unauth `hoody code vs` returns 302 `/login`, not 401.
- On the **child instance** (`-http-<port>` subdomain) unmatched `/api/v1/code/*` paths fall through to the editor's catch-all route, which serves the SPA shell / 401 / 302 depending on auth — NOT a JSON 404. At the public `code-1` URL they return the orchestrator's plain-text 404 instead. Test against an explicit known-good path (e.g. `/api/v1/code/health`) for kit liveness.

## Related namespaces

→ `terminal`, `files`, `exec`, `browser`, `daemon`.

## Examples

`code` is a **URL-first** namespace — for most workflows the kit URL itself (with the right query string and / or iframe wrapper) IS the deliverable. The methods here exist to *configure* the editor (install an extension, mint a key, log in), not to drive it. Each example below is a copy-pasteable recipe in the mode you're reading. URL-composition steps are pure string templates and need no kit call. HTTP / SDK steps were verified against the kit source (orchestrator + child-instance routes). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Open the editor with a folder pre-loaded — bookmarkable URL

**Goal:** ship a teammate a single URL that opens VS Code already pointing at the right repo. `?folder=<absolute-path>` is persisted as the last-opened workspace in the instance's user-data dir, so even subsequent un-querystringed visits land back on it (until you pass `?ew=true` to clear).

```bash
# `hoody code open` puts the index in the HOSTNAME (code-1) and never emits `?id=`,
# which the orchestrator requires alongside `folder` — compose the URL yourself:
echo "https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/workspace/myrepo&id=1"
# `--url` prints the URL instead of launching $BROWSER.
```
To clear the persisted folder later (so the next visit opens the welcome page), append `?ew=true` (`hoody code vs` with `ew=true` wipes the persisted workspace).

### 2. Extension-only embed — boot straight into one extension's UI

**Goal:** open `code-1` as a single extension's panel — no file tree, no command palette, no marketplace. The whole viewport is that extension. Pair with a folder so the extension opens with the right repo selected.

URL pattern (no kit call):

```
https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<absolute-path>&id=1
```

```bash
# `hoody code embed` rewrites the path to /api/v1/code (a CHILD-instance path that is
# unrouted at the code-1 host) and sets no `id` — compose the extension URL yourself:
echo "https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/workspace/myrepo&id=1"
# emits the extension-only URL.
```
The `extension` query value MUST match `^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$` — `publisher.name` only, no version.

### 3. Install a custom VSIX programmatically

**Goal:** push an internal extension (`.vsix`) into the container's VS Code. ⚠ **`hoody code extensions install` is spec-only** — the current kit mounts no extensions router, so the documented `POST /api/v1/code/extensions/install` never reaches a handler (`code-1`: orchestrator plain-text 404; child: vscode catch-all SPA/302). What actually works:

- **At child boot (launch flags):** `--install-extension <id-or-vsix-path>`, `--install-builtin-extension <vsix-path>`, or drop VSIXes in the preload dir consumed by `--preload-builtin-extensions-dir` (the platform passes `/hoody/storage/hoody-code/extensions` by default).
- **In-editor:** Extensions view → `…` menu → "Install from VSIX…" (the VSIX must already be on the container filesystem — push it via the `files` namespace).

### 4. List installed extensions + verify a specific one is present

**Goal:** sanity-check after a deploy that the extensions you expected are actually loaded. ⚠ **`hoody code extensions list` is spec-only** (same as `hoody code extensions install` — no extensions router is mounted). Verify on disk instead: each child instance keeps its extensions at `/hoody/storage/hoody-code/data/<id>/extensions`, with directory names like `<publisher>.<name>-<version>`. Run the check inside the container via the `terminal` / `exec` namespaces:

```bash
ls /hoody/storage/hoody-code/data/1/extensions
# → ms-python.python-2024.0.0  saoudrizwan.claude-dev-3.7.0  …
ls /hoody/storage/hoody-code/data/1/extensions | grep -q '^saoudrizwan\.claude-dev-' \
  || echo "MISSING: saoudrizwan.claude-dev"
```

(Generated `hoody code extensions list` accessors on any surface target the unimplemented endpoint and return no data.)

### 5. Path-proxy a container port through the editor — `/proxy/{port}` for browser previews

**Goal:** surface a dev server (Vite, Next.js, `python -m http.server`) running inside the container at `localhost:3000` to your laptop's browser. `/proxy/{port}` rewrites `req.base` so relative URLs in the upstream HTML still resolve under the proxy prefix — use this for **browser-rendered apps with relative asset paths**.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/proxy/3000/
```

(`http-<60000+id>` is the **child instance** subdomain — `60001` for `id=1`. The public `code-1` root does NOT route `/proxy`.)

```bash
# Hidden CLI commands `hoody code proxy-path` / `hoody code proxy` exist but are
# .hideHelp()-gated; the recommended flow is to compose the URL and open it directly:
echo "https://${P}-${C}-http-60001.${N}.containers.hoody.com/proxy/3000/"
```
Port range is `1024–65535`; the kit only enforces `isNaN(port)` at `pathProxy.ts:18` (returns `400 Invalid port`); the 1024–65535 range is enforced by the SDK client validator (`proxy.service.generated.ts:157`) but NOT by the server — raw HTTP callers (curl/fetch) must self-enforce the range.

### 6. Absproxy a container port — `/absproxy/{port}` for raw API / WebSocket passthrough

**Goal:** call a JSON API or open a WebSocket running inside the container with the **path preserved verbatim**. Use this — not `/proxy/` — for any case where the upstream cares about the literal request path (REST APIs, gRPC-Web, WebSockets at fixed routes). The `/proxy` variant rewrites `req.base` and will break path-sensitive servers.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/v1/items?q=cake
                                                                              ^^^^^^^^^^^^^^^^^ ← upstream sees exactly this path
```

```bash
echo "https://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/v1/items?q=cake"
```
`/proxy` and `/absproxy` share the same auth gate: unauth root returns `302 /login`, deeper paths `401`.

### 7. Authenticate password mode — `hoody code auth login` + `hoody code auth submit`

**Goal:** when the kit is launched with `--password <plaintext>` / `--hashed-password <argon2>`, every route is gated. The login flow is HTML-form-based (not a JSON API): fetch `/login` to bootstrap, then `POST /login` form-encoded to get a session cookie.

```bash
# CLI does not expose the raw login form; open `hoody code open 1` in your browser
# and complete the login interactively, then re-use the session cookie from the browser.
```
Rate limit: **2/min, 12/hr per process**. Hitting the limit returns HTML, not JSON — tail the body for the literal string `Login rate limited!` (i18n LOGIN_RATE_LIMIT, English locale value).

### 8. Health check + extension verify — post-deploy smoke test

**Goal:** after a container rebuild, confirm the `code` kit is up AND the extensions you ship pre-installed actually loaded. One-shot smoke.

```bash
hoody --container "$C" code health -o json | jq -r .status   # → ok (orchestrator envelope)
# Extensions: `hoody code extensions list` targets the unimplemented endpoint (see Example 4);
# verify on disk instead via the terminal namespace:
#   ls /hoody/storage/hoody-code/data/1/extensions
```
⚠ On the **child instance**, `/api/v1/code/health` resets the idle-shutdown heartbeat — only `/healthz` (kit-internal, not surfaced through the public path) is excluded; hitting it on a cron keeps the child hot. The orchestrator's `code-1` health endpoint does not touch child heartbeats.

### 9. Logout + verify the session cookie is revoked

**Goal:** end the password-mode session cleanly when a teammate steps away. `hoody code auth logout` clears the cookie server-side; subsequent requests with the old cookie redirect to `/login`.

```bash
# `hoody code auth logout` exists but targets the unrouted `/api/v1/code/logout` (404 at code-1);
# drop to a raw GET on the child root `/logout`, or just clear the cookie jar. The
# alternative is to open the browser session and click Sign Out,
# OR drop the cookie file:  rm -f /tmp/code-cookie.txt
```
Note: on the child instance, `/api/v1/code` unauth → `302 /login` (NOT `401`); plan your client to follow / catch the redirect rather than expect a JSON `401` body.

### 10. Embed the extension URL in an iframe — drop VS Code into your own page

**Goal:** ship a brand-able dashboard / docs site / Notion-style canvas with VS Code (or a single extension) embedded as a panel. The kit URL is iframable; just hand the right `src` and `allow` attributes.

```html
<!-- Full editor, with a folder pre-loaded -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/workspace/myrepo&id=1"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write; cross-origin-isolated"
></iframe>

<!-- Single extension only (no IDE chrome) — Cline as a service -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/workspace/myrepo&id=1"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write"
></iframe>
```

To hide the `containerId` behind a brandable host, wrap the URL with a `hoody proxy create` — the iframe `src` becomes `https://agent.{server_name}.containers.hoody.com`, the `containerId` never leaves the server. Gate it via `proxyPermissionsContainer.*` for production (IP allow-list, basic-auth, etc. — see the `api` namespace).

The same iframe pattern works for **every** Hoody kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — compose a full HTML "operating system" out of kit iframes with no native code.

## Reference

### `hoody code` (7) — VS Code server

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody code auth mint-key` |  | write | Generate server web key | `code.vscode.mintKey` | `hoody code auth mint-key` |
| `hoody code check-update` |  | read | Check for updates | `code.health.checkUpdate` | `hoody code check-update` |
| `hoody code embed` |  | read | Build an iframeable URL for a VS Code extension (extension-only mode) | `code.vscode.embedUrl` | `hoody code embed rooveterinaryinc.roo-cline` |
| `hoody code extensions install` |  | write | Install VS Code extension from URL | `code.extensions.install` | `hoody code extensions install --url https://example.com --as-builtin` |
| `hoody code extensions list` | ls | read | List installed extensions | `code.extensions.listIterator` | `hoody code extensions list` |
| `hoody code health` |  | read | Service health check | `code.health.check` | `hoody code health` |
| `hoody code open` |  | action | Open the Code kit service in your browser |  | `hoody code open [index] [--url] [--folder PATH]` |

