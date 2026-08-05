> _**SDK skill · `display` namespace** · ~12,999 tokens · hoody-sdk v1.0.0-beta.11_

# `display` — programmatic GUI desktops with screenshots, input, and windows

## Purpose

Per-container HTML5 desktop (X11 via proxy): screenshots, input, windows, clipboard.

## When to use

- Click/type/drag/scroll at coords; screenshots/thumbnails for vision; X11 window ops; clipboard r/w.
- **Multiple GUI apps → one display (one `terminal_id`) per app (almost always the right call).** A single X display *can* host many windows, but giving each app its own display (`display: ":N"` paired to a distinct `terminal_id`) gives each its own `display-<N>` kit URL — a dedicated full-surface stream you can screenshot, embed / iframe, and route input to **independently, per window** — with no window-search / focus juggling on a shared display. Pin matching ids (`terminal_id=1`↔`:1`, `terminal_id=2`↔`:2`, …) so the routing stays one-to-one. Reuse a single display only when you deliberately want the apps composited together (e.g. a full desktop — see the `desktop-<N>` alias).

## When NOT to use

Not for: shell → `terminal`/`exec`, files → `files`, headless web → `browser`, toasts → `notifications`.

## Prerequisites

- Active Xpra/X11 (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"` (or CLI `--display N`); `terminal_id=N` alone does NOT set `DISPLAY`.
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `screenshots.capture` (`base64=true` for vision).
2. `input.clickAt` / `typeAt`.
3. `screenshots.captureMetadata` — cheap timestamp check.
4. Re-capture only when timestamp advanced.

### 2. Find and focus a window

1. `listWindows` (`onlyVisible=true`).
2. `input.windowSearch` — name/class/classname.
3. `input.windowFocus` / `windowRaise`.
4. `input.windowGeometry` — coords.
5. `input.windowActive` — confirm.

### 3. Drag / select

1. `input.mouseMove` — optional pre-position.
2. `input.drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `input.select` — click + shift-click.
4. `input.reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `setClipboard` — `text`, optional `selection`.
2. `input.keyboardKey` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `getClipboard` — read back after GUI copy.

### 5. Batch input replay

1. `input.batch` — POST ordered actions.
2. `input.wait` — interleave waits.
3. `screenshots.capture` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (regex `^\d+$` at displayContext.ts:22, range check at :24); invalid silently falls through to host-derived id by :31.
- All endpoints except `health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; `base64=true` for JSON.
- `getByTimestamp` needs numeric `timestamp`, not `timestamp_human`.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Window IDs accept decimal or hex (`0x...`); returns decimal.
- `accessClient` returns HTML, browser-only.
- SDK-only quirk: the screenshot-list accessor hangs off the namespace root (`client.display.listScreenshots`), not the `screenshots` service — there is no `screenshots.list`.
- `getInformation` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the Xvfb canvas dimensions (those live on `input.geometry`, see `inputRoutes.ts:499`).
- `input.reset` clears stuck modifiers/buttons.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — X server for displayId unreachable; thrown by `inputService.parseError` (re-emitted by the input route handler) and also by the clipboard/window route handlers.
- `404` on `getByTimestamp` — no match. Refresh by calling `screenshots.captureMetadata` (`/api/v1/display/screenshot/info`) — that endpoint **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `getByTimestamp` with the new ts. (`/screenshot/last/info`/`getLatestMetadata` only returns metadata for the *latest* screenshot — not a usable replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Every step in every example was live-tested against a real `display-1` kit driving an Xpra/X11 session inside a Hoody container. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first, and pick a `DID` (the active display id, e.g. `1`). The `display-1` in the kit URL is the kit instance, NOT the display id — `?displayId=N` (or `--display-id N`) selects the X server.

### 1. See-then-act loop — capture, click, re-capture, diff

**Goal:** snapshot the screen, click a coordinate, snapshot again, and use cheap metadata (`timestamp`) to detect that the second capture is fresh — typical inner loop for vision-driven agents.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```typescript
const before = await client.display.screenshots.captureMetadata({ displayId: 1 });
const tsBefore = before.data!.timestamp;
const shot = await client.display.screenshots.capture({ displayId: 1, base64: true });
const b64 = (shot.data as any).image.data;
```
**Step 2 — click at `(75, 50)`.** `clickAt` moves AND clicks in one call; default `button=1` (left).

```typescript
await client.display.input.clickAt({ x: 75, y: 50, button: 1 }, { displayId: 1 });
```
**Step 3 — cheap freshness check, then full re-capture only if the timestamp advanced.** `screenshot/info` returns metadata without the PNG bytes — much cheaper than a full capture for polling.

```typescript
const after = await client.display.screenshots.captureMetadata({ displayId: 1 });
if (after.data!.timestamp !== tsBefore) {
  const fresh = await client.display.screenshots.capture({ displayId: 1, base64: true });
  // … feed fresh.data!.image.data to your vision model
}
```
### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `windowSearch` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns just an array of `windowId` integers.

```typescript
const search = await client.display.input.windowSearch(
  { pattern: 'xeyes', name: true, class: true, classname: true },
  { displayId: 1 },
);
const wid = String(search.data!.windows![0]);   // windows is number[]; the methods take windowId: string
```
**Step 2 — focus + confirm.** `windowActive` returns the currently focused id; compare with what you focused.

```typescript
await client.display.input.windowFocus({ windowId: wid }, { displayId: 1 });
const active = await client.display.input.windowActive({ displayId: 1 });
console.log('focused:', active.data!.windowId === wid);
```
### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```typescript
await client.display.input.clickAt({ x: 120, y: 80 }, { displayId: 1 });
await client.display.input.keyboardType({ text: 'hello world', delay: 20 }, { displayId: 1 });
```
`typeAt` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```typescript
await client.display.input.drag(
  { startX: 50, startY: 50, endX: 200, endY: 150, steps: 20, button: 1 },
  { displayId: 1 },
);
```
If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `input.reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. ⚠ See quirk: clipboard ops can fail with `CLIPBOARD_FAILED` / "no HOME directory" if the X session was launched without a writable `$HOME` for the kit user; verify by reading back the clipboard after the write.

**Step 1 — `setClipboard` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```typescript
await client.display.setClipboard({ text: 'pasted via hoody', selection: 'clipboard' }, { displayId: 1 });
const r = await client.display.getClipboard({ displayId: 1, selection: 'clipboard' });
console.log(r.data!.text);
```
**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```typescript
await client.display.input.keyboardKey({ keys: ['ctrl+v'] }, { displayId: 1 });
```
### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```typescript
const props = await client.display.getWindowProperties(wid, { displayId: 1 });
const geom = await client.display.input.windowGeometry(wid, { displayId: 1 });
console.log(props.data!.properties.wmClass, geom.data);
```
`windowId` accepts decimal or hex (`0x...`); the response always normalises to decimal.

### 7. List visible windows with `onlyVisible` filter

**Goal:** enumerate everything mapped on screen (not iconified / withdrawn), pick the one with a name matching `xeyes`, no regex.

```typescript
const r = await client.display.listWindows({ displayId: 1, onlyVisible: true });
const xeyes = r.data!.windows.find(w => w.name === 'xeyes');
console.log(xeyes);
```
Each item carries `windowId`, `name`, `class` (the WM_CLASS pair as 2 strings), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) atomically. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The response lists every step with success/failure indexed back to the request order.

```typescript
await client.display.input.batch(
  {
    actions: [
      { action: 'mouse/move',    params: { x: 120, y: 80 } },
      { action: 'input/wait',    params: { ms: 150 } },
      { action: 'mouse/click',   params: { button: 1 } },
      { action: 'keyboard/type', params: { text: 'replayed', delay: 15 } },
    ],
  },
  { displayId: 1 },
);
```
`input.wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `input.geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```typescript
const info = await client.display.getInformation({ displayId: 1 });
const geom = await client.display.input.geometry({ displayId: 1 });
console.log(geom.data!.width, geom.data!.height);
```
Note: the geometry returned is the underlying Xvfb canvas (often `8192x4096` for Hoody Xpra sessions), not a physical monitor size. Click coordinates are in this canvas space.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `keyboardKeyDown` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `input.reset` releases everything in one call.

```typescript
await client.display.input.reset({ displayId: 1 });
```
Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

**Accessor:** `client.display`  |  **Import:** `import * as display from 'hoody-sdk/display'`

### `client.display` (7) — Display information and management

#### `accessClient` — Access the HTML5 Display client interface

```typescript
client.display.accessClient(displayId?: integer, decorations?: boolean, toolbar?: boolean, menu?: boolean, maximize_new_windows?: boolean, readonly?: boolean, dark_mode?: boolean, node?: string, project_id?: string, container_id?: string, url_display_id?: string, ssl?: boolean, webtransport?: boolean, path?: string, action?: string, display?: string, encoding?: string, offscreen?: boolean, bandwidth_limit?: integer, override_width?: string, override_height?: string, vrefresh?: integer, suspend_inactive_tab?: boolean, sound?: boolean, audio_codec?: string, keyboard?: boolean, keyboard_layout?: string, swap_keys?: boolean, clipboard?: boolean, clipboard_preferred_format?: string, clipboard_poll?: boolean, printing?: boolean, file_transfer?: boolean, video?: boolean, mediasource_video?: boolean, open_url?: boolean, notification_server_url?: string, web_notifications?: boolean, display_notifications?: boolean, notification_connection_type?: string, sharing?: boolean, steal?: boolean, reconnect?: boolean, floating_menu?: boolean, clock?: boolean, scroll_reverse_y?: string, scroll_reverse_x?: boolean, title_show_hoody?: boolean, title_show_display_id?: boolean, app?: string, remote_logging?: boolean, insecure?: boolean, debug_main?: boolean, debug_keyboard?: boolean, debug_geometry?: boolean, debug_mouse?: boolean, debug_clipboard?: boolean, debug_draw?: boolean, debug_audio?: boolean, debug_network?: boolean, debug_file?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `decorations` | `boolean` | query | No | Show window decorations (title bar with close/minimize/maximize buttons). Set to false for headless/kiosk mode. |
| `toolbar` | `boolean` | query | No | Show entire toolbar/menu area (menu trigger + menu). Set to false to hide all menu UI elements. Takes precedence over the menu parameter. |
| `menu` | `boolean` | query | No | Show Hoody menu trigger icon. Set to false to hide menu completely. Note: toolbar parameter takes precedence over this. |
| `maximize_new_windows` | `boolean` | query | No | Open new top-level application windows maximized instead of centered at the default size (max 1024x1024). Only applies to windows that do not request their own position, and skips override-redirect windows, dialogs, other non-NORMAL window types, and windows the app itself marks undecorated via metadata (which would have no title bar to un-maximize from). Windows can still be un-maximized from their title bar. Combining with the global decorations=false parameter is honoured as explicit kiosk intent: windows open maximized without a title bar. |
| `readonly` | `boolean` | query | No | Enable read-only/view-only mode. Blocks all keyboard and mouse input from the client. Perfect for dashboards, monitoring, or demo scenarios. Works independently or combines with server readonly setting. |
| `dark_mode` | `boolean` | query | No | Enable dark mode theme |
| `node` | `string` | query | No | Hoody node identifier (e.g., example-1, example-2) |
| `project_id` | `string` | query | No | Hoody project ID |
| `container_id` | `string` | query | No | Hoody container ID |
| `url_display_id` | `string` | query | No | Display ID for URL construction |
| `ssl` | `boolean` | query | No | Use SSL/TLS for WebSocket connection |
| `webtransport` | `boolean` | query | No | Use WebTransport (HTTP3) instead of WebSocket |
| `path` | `string` | query | No | Connection path for the display server |
| `action` | `string` | query | No | Connection action type. - `connect` - Connect to existing session - `start` - Start new session - `shadow` - Shadow existing display |
| `display` | `string` | query | No | Display number to connect to |
| `encoding` | `string` | query | No | Video encoding type. Use auto for best automatic selection. |
| `offscreen` | `boolean` | query | No | Use offscreen canvas for rendering |
| `bandwidth_limit` | `integer` | query | No | Bandwidth limit in bits per second (0 = unlimited) |
| `override_width` | `string` | query | No | Override virtual desktop width (auto or numeric value) |
| `override_height` | `string` | query | No | Override virtual desktop height (auto or numeric value 480-4320) |
| `vrefresh` | `integer` | query | No | Vertical refresh rate in Hz. Use -1 for auto-detect. Minimum 30 when explicitly set. |
| `suspend_inactive_tab` | `boolean` | query | No | Suspend client updates when browser tab is inactive. Enables power saving by calling client.suspend() on tab hide and client.resume() on tab show. Recommended to keep enabled for better performance. |
| `sound` | `boolean` | query | No | Enable audio forwarding |
| `audio_codec` | `string` | query | No | Preferred audio codec |
| `keyboard` | `boolean` | query | No | Show on-screen virtual keyboard |
| `keyboard_layout` | `string` | query | No | Keyboard layout (us, gb, fr, de, etc.) |
| `swap_keys` | `boolean` | query | No | Swap Cmd/Ctrl keys (useful for macOS) |
| `clipboard` | `boolean` | query | No | Enable clipboard sharing |
| `clipboard_preferred_format` | `string` | query | No | Preferred clipboard format |
| `clipboard_poll` | `boolean` | query | No | Enable clipboard polling (browser-dependent default) |
| `printing` | `boolean` | query | No | Enable printing support |
| `file_transfer` | `boolean` | query | No | Enable file transfer support |
| `video` | `boolean` | query | No | Enable video encoding support |
| `mediasource_video` | `boolean` | query | No | Enable MediaSource API for video |
| `open_url` | `boolean` | query | No | Allow opening URLs from the remote session in the local browser |
| `notification_server_url` | `string` | query | No | External notification server URL for real-time notification integration.  **URL Format:** `https://{project}-{container}-n-{display}.{node}.containers.hoody.com/notification-client.js`  **Auto-detection:** If not provided, the client will attempt to auto-detect from the current hostname pattern. The client transforms the display URL pattern by replacing 'display' with 'n'.  **Examples:** - Manual: `?notification_server_url=https://my-project-container-n-6.node.containers.hoody.com/notification-client.js` - Auto-detected from: `https://my-project-container-display-6.node.containers.hoody.com`  **Integration:** The notification server (port 3999) provides: - Historical notification retrieval - Real-time WebSocket notification updates - Notification icons serving - Desktop notification triggering  See external notification server OpenAPI spec for complete API documentation. |
| `web_notifications` | `boolean` | query | No | Enable browser web notifications (native OS notifications) |
| `display_notifications` | `boolean` | query | No | Show notifications within display UI |
| `notification_connection_type` | `string` | query | No | Notification server connection type. - websocket: Real-time updates via WebSocket (recommended) - polling: Periodic HTTP polling (fallback) |
| `sharing` | `boolean` | query | No | Allow session sharing |
| `steal` | `boolean` | query | No | Steal existing sessions |
| `reconnect` | `boolean` | query | No | Auto-reconnect on connection loss |
| `floating_menu` | `boolean` | query | No | Show floating menu |
| `clock` | `boolean` | query | No | Show server clock |
| `scroll_reverse_y` | `string` | query | No | Reverse vertical scrolling direction (auto, true, false) |
| `scroll_reverse_x` | `boolean` | query | No | Reverse horizontal scrolling direction |
| `title_show_hoody` | `boolean` | query | No | Show "Hoody" in browser title |
| `title_show_display_id` | `boolean` | query | No | Show display ID in browser title |
| `app` | `string` | query | No | Target application to launch or focus. Can be an application name, a REGEX pattern, or a window ID. |
| `remote_logging` | `boolean` | query | No | Enable remote logging to the display server |
| `insecure` | `boolean` | query | No | Allow insecure authentication (not recommended for production) |
| `debug_main` | `boolean` | query | No | Enable main debug logging |
| `debug_keyboard` | `boolean` | query | No | Enable keyboard debug logging |
| `debug_geometry` | `boolean` | query | No | Enable geometry debug logging |
| `debug_mouse` | `boolean` | query | No | Enable mouse debug logging |
| `debug_clipboard` | `boolean` | query | No | Enable clipboard debug logging |
| `debug_draw` | `boolean` | query | No | Enable draw debug logging |
| `debug_audio` | `boolean` | query | No | Enable audio debug logging |
| `debug_network` | `boolean` | query | No | Enable network debug logging |
| `debug_file` | `boolean` | query | No | Enable file transfer debug logging |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/display/`
**CLI:** `hoody display access`

---

#### `getClipboard` — Read clipboard text

```typescript
client.display.getClipboard(displayId?: integer, selection?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `selection` | `string` | query | No | Clipboard buffer selection |

**Returns:** `display_ClipboardReadResult`  |  **HTTP:** `GET /api/v1/display/clipboard`
**CLI:** `hoody display clipboard get`

---

#### `getInformation` — Get display information and screenshots

```typescript
client.display.getInformation(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_DisplayInfo`  |  **HTTP:** `GET /api/v1/display/info`
**CLI:** `hoody display info`

---

#### `getWindowProperties` — Get extended properties for a window

```typescript
client.display.getWindowProperties(displayId?: integer, windowId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex 0x...) |

**Returns:** `display_WindowPropertiesResult`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/properties`
**CLI:** `hoody display windows properties`

---

#### `listScreenshots` — List all available screenshots

```typescript
client.display.listScreenshots(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_ScreenshotsList`  |  **HTTP:** `GET /api/v1/display/screenshots`
**CLI:** `hoody display screenshots list`

---

#### `listWindows` — List windows on the current display

```typescript
client.display.listWindows(displayId?: integer, onlyVisible?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `onlyVisible` | `boolean` | query | No | If true, only include visible windows |

**Returns:** `display_WindowListResult`  |  **HTTP:** `GET /api/v1/display/windows`
**CLI:** `hoody display windows list`

---

#### `setClipboard` — Write clipboard text

```typescript
client.display.setClipboard(displayId?: integer, data: display_ClipboardWriteBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_ClipboardWriteBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/clipboard`
**CLI:** `hoody display clipboard set`

---

### `client.display.health` (1) — Server health and status endpoints

#### `check` — Service health check

```typescript
client.display.health.check()
```

**Returns:** `display_HealthResponse`  |  **HTTP:** `GET /api/v1/display/health`
**CLI:** `hoody display health`

---

### `client.display.input` (31) — Mouse, keyboard, and window control operations via xdotool

#### `act` — Execute one action with optional screenshot

```typescript
client.display.input.act(displayId?: integer, data: display_ActBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_ActBody` | body | Yes |  |

**Returns:** `display_ActionWithScreenshotResult`  |  **HTTP:** `POST /api/v1/display/input/act`
**CLI:** `hoody display input act`

---

#### `batch` — Execute a sequence of actions

```typescript
client.display.input.batch(displayId?: integer, data: display_BatchBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_BatchBody` | body | Yes |  |

**Returns:** `display_BatchResult`  |  **HTTP:** `POST /api/v1/display/input/batch`
**CLI:** `hoody display input batch`

---

#### `clickAt` — Move cursor and click

```typescript
client.display.input.clickAt(displayId?: integer, data: display_ClickAtBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_ClickAtBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/input/click-at`
**CLI:** `hoody display input click-at`

---

#### `drag` — Drag from one position to another

```typescript
client.display.input.drag(displayId?: integer, data: display_DragBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_DragBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/input/drag`
**CLI:** `hoody display input drag`

---

#### `geometry` — Get display dimensions

```typescript
client.display.input.geometry(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_DisplayGeometryResult`  |  **HTTP:** `GET /api/v1/display/input/display-geometry`
**CLI:** `hoody display input geometry`

---

#### `keyboardKey` — Press key combinations

```typescript
client.display.input.keyboardKey(displayId?: integer, data: display_KeyboardKeyBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_KeyboardKeyBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/keyboard/key`
**CLI:** `hoody display keyboard key`

---

#### `keyboardKeyDown` — Hold a key down

```typescript
client.display.input.keyboardKeyDown(displayId?: integer, data: display_KeyboardKeyDownBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_KeyboardKeyDownBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/keyboard/key-down`
**CLI:** `hoody display keyboard key-down`

---

#### `keyboardKeyUp` — Release a held key

```typescript
client.display.input.keyboardKeyUp(displayId?: integer, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `object` | body | Yes |  |

**Body:** `{ key*: string, window: int | string }`

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/keyboard/key-up`
**CLI:** `hoody display keyboard key-up`

---

#### `keyboardType` — Type a string of text

```typescript
client.display.input.keyboardType(displayId?: integer, data: display_KeyboardTypeBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_KeyboardTypeBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/keyboard/type`
**CLI:** `hoody display keyboard type`

---

#### `mouseClick` — Click a mouse button

```typescript
client.display.input.mouseClick(displayId?: integer, data?: display_MouseClickBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_MouseClickBody` | body | No |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/click`
**CLI:** `hoody display mouse click`

---

#### `mouseDoubleClick` — Double-click a mouse button

```typescript
client.display.input.mouseDoubleClick(displayId?: integer, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `object` | body | No |  |

**Body:** `{ button: int=1, window: int | string }`

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/double-click`
**CLI:** `hoody display mouse double-click`

---

#### `mouseDown` — Press and hold a mouse button

```typescript
client.display.input.mouseDown(displayId?: integer, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `object` | body | No |  |

**Body:** `{ button: int=1, window: int | string, holdMs: int }`

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/down`
**CLI:** `hoody display mouse down`

---

#### `mouseLocation` — Get cursor position

```typescript
client.display.input.mouseLocation(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_MouseLocationResult`  |  **HTTP:** `GET /api/v1/display/mouse/location`
**CLI:** `hoody display mouse location`

---

#### `mouseMove` — Move cursor to absolute position

```typescript
client.display.input.mouseMove(displayId?: integer, data: display_MouseMoveBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_MouseMoveBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/move`
**CLI:** `hoody display mouse move`

---

#### `mouseMoveRelative` — Move cursor by offset

```typescript
client.display.input.mouseMoveRelative(displayId?: integer, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `object` | body | Yes |  |

**Body:** `{ x*: int, y*: int, sync: bool }`

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/move-relative`
**CLI:** `hoody display mouse move-relative`

---

#### `mouseScroll` — Scroll in a direction

```typescript
client.display.input.mouseScroll(displayId?: integer, data: display_MouseScrollBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_MouseScrollBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/scroll`
**CLI:** `hoody display mouse scroll`

---

#### `mouseUp` — Release a mouse button

```typescript
client.display.input.mouseUp(displayId?: integer, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `object` | body | No |  |

**Body:** `{ button: int=1, window: int | string }`

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/mouse/up`
**CLI:** `hoody display mouse up`

---

#### `reset` — Emergency release all inputs

```typescript
client.display.input.reset(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/input/reset`
**CLI:** `hoody display input reset`

---

#### `select` — Select a range via click + shift-click

```typescript
client.display.input.select(displayId?: integer, data: display_SelectBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_SelectBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/input/select`
**CLI:** `hoody display input select`

---

#### `typeAt` — Move, click, and type in one operation

```typescript
client.display.input.typeAt(displayId?: integer, data: display_TypeAtBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_TypeAtBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/input/type-at`
**CLI:** `hoody display input type-at`

---

#### `wait` — Wait for a duration with optional screenshot

```typescript
client.display.input.wait(displayId?: integer, data: display_WaitBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WaitBody` | body | Yes |  |

**Returns:** `display_WaitResult`  |  **HTTP:** `POST /api/v1/display/input/wait`
**CLI:** `hoody display input wait`

---

#### `windowActive` — Get the active window ID

```typescript
client.display.input.windowActive(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_ActiveWindowResult`  |  **HTTP:** `GET /api/v1/display/window/active`
**CLI:** `hoody display windows active`

---

#### `windowClose` — Close a window

```typescript
client.display.input.windowClose(displayId?: integer, data: display_WindowIdBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowIdBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/close`
**CLI:** `hoody display windows close`

---

#### `windowFocus` — Focus/activate a window

```typescript
client.display.input.windowFocus(displayId?: integer, data: display_WindowIdBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowIdBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/focus`
**CLI:** `hoody display windows focus`

---

#### `windowGeometry` — Get window position and size

```typescript
client.display.input.windowGeometry(displayId?: integer, windowId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex) |

**Returns:** `display_WindowGeometryResult`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/geometry`
**CLI:** `hoody display windows geometry`

---

#### `windowMinimize` — Minimize a window

```typescript
client.display.input.windowMinimize(displayId?: integer, data: display_WindowIdBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowIdBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/minimize`
**CLI:** `hoody display windows minimize`

---

#### `windowMove` — Move a window

```typescript
client.display.input.windowMove(displayId?: integer, data: display_WindowMoveBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowMoveBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/move`
**CLI:** `hoody display windows move`

---

#### `windowName` — Get window title

```typescript
client.display.input.windowName(displayId?: integer, windowId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex) |

**Returns:** `display_WindowNameResult`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/name`
**CLI:** `hoody display windows name`

---

#### `windowRaise` — Raise a window to the top

```typescript
client.display.input.windowRaise(displayId?: integer, data: display_WindowIdBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowIdBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/raise`
**CLI:** `hoody display windows raise`

---

#### `windowResize` — Resize a window

```typescript
client.display.input.windowResize(displayId?: integer, data: display_WindowResizeBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowResizeBody` | body | Yes |  |

**Returns:** `display_InputActionResponse`  |  **HTTP:** `POST /api/v1/display/window/resize`
**CLI:** `hoody display windows resize`

---

#### `windowSearch` — Search for windows by pattern

```typescript
client.display.input.windowSearch(displayId?: integer, data: display_WindowSearchBody)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `display_WindowSearchBody` | body | Yes |  |

**Returns:** `display_WindowSearchResult`  |  **HTTP:** `POST /api/v1/display/window/search`
**CLI:** `hoody display windows search`

---

### `client.display.screenshots` (5) — Screenshot capture and retrieval operations

#### `capture` — Capture a new screenshot

```typescript
client.display.screenshots.capture(base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/screenshot`
**CLI:** `hoody display screenshots capture`

---

#### `captureMetadata` — Capture screenshot and return metadata only

```typescript
client.display.screenshots.captureMetadata(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_ScreenshotInfo`  |  **HTTP:** `GET /api/v1/display/screenshot/info`
**CLI:** `hoody display screenshots capture-metadata`

---

#### `getByTimestamp` — Retrieve a specific screenshot by timestamp

```typescript
client.display.screenshots.getByTimestamp(timestamp: string, base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/screenshot/{timestamp}`
**CLI:** `hoody display screenshots by-timestamp`

---

#### `getLatest` — Retrieve the most recent screenshot

```typescript
client.display.screenshots.getLatest(base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/screenshot/last`
**CLI:** `hoody display screenshots latest`

---

#### `getLatestMetadata` — Get metadata for the most recent screenshot

```typescript
client.display.screenshots.getLatestMetadata(displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_ScreenshotInfo`  |  **HTTP:** `GET /api/v1/display/screenshot/last/info`
**CLI:** `hoody display screenshots latest-metadata`

---

### `client.display.thumbnails` (3) — Thumbnail image operations

#### `capture` — Capture a new screenshot thumbnail

```typescript
client.display.thumbnails.capture(base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/thumbnail`
**CLI:** `hoody display thumbnails capture`

---

#### `getByTimestamp` — Retrieve a specific thumbnail by timestamp

```typescript
client.display.thumbnails.getByTimestamp(timestamp: string, base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/thumbnail/{timestamp}`
**CLI:** `hoody display thumbnails by-timestamp`

---

#### `getLatest` — Retrieve the most recent thumbnail

```typescript
client.display.thumbnails.getLatest(base64?: boolean, displayId?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `display_Base64ScreenshotResponse`  |  **HTTP:** `GET /api/v1/display/thumbnail/last`
**CLI:** `hoody display thumbnails latest`


### Body schemas

- `display_ClipboardWriteBody` — `{ text*: string, selection: "clipboard" | "primary" | "secondary"="clipboard" }`
- `display_MouseClickBody` — `{ button: int=1, repeat: int=1, delay: int, window: int | string }`
- `display_MouseMoveBody` — `{ x*: int, y*: int, window: int | string, screen: int, sync: bool }`
- `display_MouseScrollBody` — `{ direction*: "up" | "down" | "left" | "right", clicks: int=5 }`
- `display_KeyboardTypeBody` — `{ text*: string, window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyBody` — `{ keys*: string[], window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyDownBody` — `{ key*: string, window: int | string, holdMs: int }`
- `display_WindowIdBody` — `{ windowId*: int | string }`
- `display_WindowMoveBody` — `{ windowId*: int | string, x*: int, y*: int, sync: bool, relative: bool }`
- `display_WindowResizeBody` — `{ windowId*: int | string, width*: int, height*: int, sync: bool, useHints: bool }`
- `display_WindowSearchBody` — `{ pattern*: string, name: bool, class: bool, classname: bool, onlyVisible: bool }`
- `display_ClickAtBody` — `{ x*: int, y*: int, button: int=1 }`
- `display_TypeAtBody` — `{ x*: int, y*: int, text*: string, delay: int }`
- `display_DragBody` — `{ startX*: int, startY*: int, endX*: int, endY*: int, button: int=1, steps: int }`
- `display_SelectBody` — `{ x*: int, y*: int, endX*: int, endY*: int }`
- `display_ActBody` — `{ action*: string, params: object, screenshot: bool=true, screenshotDelay: int=100, screenshotRegion: string }`
- `display_WaitBody` — `{ ms*: int, screenshot: bool=false }`
- `display_BatchBody` — `{ actions*: { action*: string, params: object }[] }`

