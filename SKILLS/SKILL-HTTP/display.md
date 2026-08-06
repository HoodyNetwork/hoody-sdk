> _**HTTP skill · `display` namespace** · ~7,701 tokens · hoody-sdk v1.0.0-beta.12_

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `GET /api/v1/display/screenshot` (`base64=true` for vision).
2. `POST /api/v1/display/input/click-at` / `POST /api/v1/display/input/type-at`.
3. `GET /api/v1/display/screenshot/info` — cheap timestamp check.
4. Re-capture only when timestamp advanced.

### 2. Find and focus a window

1. `GET /api/v1/display/windows` (`onlyVisible=true`).
2. `POST /api/v1/display/window/search` — name/class/classname.
3. `POST /api/v1/display/window/focus` / `POST /api/v1/display/window/raise`.
4. `GET /api/v1/display/window/{windowId}/geometry` — coords.
5. `GET /api/v1/display/window/active` — confirm.

### 3. Drag / select

1. `POST /api/v1/display/mouse/move` — optional pre-position.
2. `POST /api/v1/display/input/drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `POST /api/v1/display/input/select` — click + shift-click.
4. `POST /api/v1/display/input/reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `POST /api/v1/display/clipboard` — `text`, optional `selection`.
2. `POST /api/v1/display/keyboard/key` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `GET /api/v1/display/clipboard` — read back after GUI copy.

### 5. Batch input replay

1. `POST /api/v1/display/input/batch` — POST ordered actions.
2. `POST /api/v1/display/input/wait` — interleave waits.
3. `GET /api/v1/display/screenshot` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (regex `^\d+$` at displayContext.ts:22, range check at :24); invalid silently falls through to host-derived id by :31.
- All endpoints except `health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; `base64=true` for JSON.
- `getByTimestamp` needs numeric `timestamp`, not `timestamp_human`.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Window IDs accept decimal or hex (`0x...`); returns decimal.
- `GET /api/v1/display/` returns HTML, browser-only.
- SDK-only quirk: the screenshot-list accessor hangs off the namespace root (`GET /api/v1/display/screenshots`), not the `screenshots` service — there is no `screenshots.list`.
- `GET /api/v1/display/info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the Xvfb canvas dimensions (those live on `GET /api/v1/display/input/display-geometry`, see `inputRoutes.ts:499`).
- `POST /api/v1/display/input/reset` clears stuck modifiers/buttons.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — X server for displayId unreachable; thrown by `inputService.parseError` (re-emitted by the input route handler) and also by the clipboard/window route handlers.
- `404` on `getByTimestamp` — no match. Refresh by calling `GET /api/v1/display/screenshot/info` (`/api/v1/display/screenshot/info`) — that endpoint **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `getByTimestamp` with the new ts. (`/screenshot/last/info`/`GET /api/v1/display/screenshot/last/info` only returns metadata for the *latest* screenshot — not a usable replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Every step in every example was live-tested against a real `display-1` kit driving an Xpra/X11 session inside a Hoody container. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, and pick a `DID` (the active display id, e.g. `1`). The `display-1` in the kit URL is the kit instance, NOT the display id — `?displayId=N` (or `--display-id N`) selects the X server.

### 1. See-then-act loop — capture, click, re-capture, diff

**Goal:** snapshot the screen, click a coordinate, snapshot again, and use cheap metadata (`timestamp`) to detect that the second capture is fresh — typical inner loop for vision-driven agents.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
TS_BEFORE=$(curl -sf "$KIT/api/v1/display/screenshot/info?displayId=1" | jq -r .timestamp)
B64=$(curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" | jq -r .image.data)
echo "before=$TS_BEFORE  bytes=${#B64}"
```
**Step 2 — click at `(75, 50)`.** `POST /api/v1/display/input/click-at` moves AND clicks in one call; default `button=1` (left).

```bash
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":75,"y":50,"button":1}'
```
**Step 3 — cheap freshness check, then full re-capture only if the timestamp advanced.** `screenshot/info` returns metadata without the PNG bytes — much cheaper than a full capture for polling.

```bash
TS_AFTER=$(curl -sf "$KIT/api/v1/display/screenshot/info?displayId=1" | jq -r .timestamp)
[ "$TS_AFTER" != "$TS_BEFORE" ] && curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" | jq -r .image.data > /tmp/after.b64
```
### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `POST /api/v1/display/window/search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns just an array of `windowId` integers.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/api/v1/display/window/search?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"pattern":"xeyes","name":true,"class":true,"classname":true}' \
  | jq -r '.windows[0]')
echo "wid=$WID"
```
**Step 2 — focus + confirm.** `GET /api/v1/display/window/active` returns the currently focused id; compare with what you focused.

```bash
curl -sX POST "$KIT/api/v1/display/window/focus?displayId=1" \
  -H 'Content-Type: application/json' -d "{\"windowId\":$WID}"
ACTIVE=$(curl -sf "$KIT/api/v1/display/window/active?displayId=1" | jq -r .windowId)
[ "$ACTIVE" = "$WID" ] && echo "focused OK"
```
### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
# 1. click to set keyboard focus on the field
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":120,"y":80}'
# 2. type. `delay` is inter-keystroke ms (0..1000)
curl -sX POST "$KIT/api/v1/display/keyboard/type?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello world","delay":20}'
```
`POST /api/v1/display/input/type-at` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/drag?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"startX":50,"startY":50,"endX":200,"endY":150,"steps":20,"button":1}'
```
If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `POST /api/v1/display/input/reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. ⚠ See quirk: clipboard ops can fail with `CLIPBOARD_FAILED` / "no HOME directory" if the X session was launched without a writable `$HOME` for the kit user; verify by reading back the clipboard after the write.

**Step 1 — `POST /api/v1/display/clipboard` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/clipboard?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"pasted via hoody","selection":"clipboard"}'
# Verify
curl -sf "$KIT/api/v1/display/clipboard?displayId=1&selection=clipboard" | jq -r .text
```
**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
curl -sX POST "$KIT/api/v1/display/keyboard/key?displayId=1" \
  -H 'Content-Type: application/json' -d '{"keys":["ctrl+v"]}'
```
### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/window/$WID/properties?displayId=1" | jq '.properties'
# → { wmClass:["xeyes","XEyes"], wmName:"xeyes", wmRole:null, pid:null, wmState:[], wmType:[], transientFor:null }
curl -sf "$KIT/api/v1/display/window/$WID/geometry?displayId=1" | jq '{x,y,width,height}'
```
`windowId` accepts decimal or hex (`0x...`); the response always normalises to decimal.

### 7. List visible windows with `onlyVisible` filter

**Goal:** enumerate everything mapped on screen (not iconified / withdrawn), pick the one with a name matching `xeyes`, no regex.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/windows?displayId=1&onlyVisible=true" \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```
Each item carries `windowId`, `name`, `class` (the WM_CLASS pair as 2 strings), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) atomically. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The response lists every step with success/failure indexed back to the request order.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/batch?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{
    "actions":[
      {"action":"mouse/move",   "params":{"x":120,"y":80}},
      {"action":"input/wait",   "params":{"ms":150}},
      {"action":"mouse/click",  "params":{"button":1}},
      {"action":"keyboard/type","params":{"text":"replayed","delay":15}}
    ]
  }'
```
`POST /api/v1/display/input/wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `POST /api/v1/display/input/batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `GET /api/v1/display/input/display-geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/info?displayId=1" \
  | jq '{display, pid, session_name, user, start_time, connected_clients, latency, windowCount: (.windows|length), screenshotCount: (.screenshots|length)}'
# Just the geometry (cheaper):
curl -sf "$KIT/api/v1/display/input/display-geometry?displayId=1" | jq '{width,height,screen}'
# → e.g. { width: 8192, height: 4096, screen: 0 }  (Xpra fakescreen — much larger than any "monitor")
```
Note: the geometry returned is the underlying Xvfb canvas (often `8192x4096` for Hoody Xpra sessions), not a physical monitor size. Click coordinates are in this canvas space.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `POST /api/v1/display/keyboard/key-down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `POST /api/v1/display/input/reset` releases everything in one call.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/reset?displayId=1" \
  -H 'Content-Type: application/json' -d '{}'
# → {"success":true,"action":"reset","details":{"message":"All modifier keys and mouse buttons released"}}
```
Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `display` (7) — Display information and management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/` | Access the HTML5 Display client interface | `?displayId` `?decorations` `?toolbar` `?menu` `?maximize_new_windows` `?readonly` `?dark_mode` `?node` `?project_id` `?container_id` `?url_display_id` `?ssl` `?webtransport` `?path` `?action` `?display` `?encoding` `?offscreen` `?bandwidth_limit` `?override_width` `?override_height` `?vrefresh` `?suspend_inactive_tab` `?sound` `?audio_codec` `?keyboard` `?keyboard_layout` `?swap_keys` `?clipboard` `?clipboard_preferred_format` `?clipboard_poll` `?printing` `?file_transfer` `?video` `?mediasource_video` `?open_url` `?notification_server_url` `?web_notifications` `?display_notifications` `?notification_connection_type` `?sharing` `?steal` `?reconnect` `?floating_menu` `?clock` `?scroll_reverse_y` `?scroll_reverse_x` `?title_show_hoody` `?title_show_display_id` `?app` `?remote_logging` `?insecure` `?debug_main` `?debug_keyboard` `?debug_geometry` `?debug_mouse` `?debug_clipboard` `?debug_draw` `?debug_audio` `?debug_network` `?debug_file` |
| `GET /api/v1/display/clipboard` | Read clipboard text | `?displayId` `?selection` |
| `GET /api/v1/display/info` | Get display information and screenshots | `?displayId` |
| `GET /api/v1/display/window/{windowId}/properties` | Get extended properties for a window | `?displayId` |
| `GET /api/v1/display/screenshots` | List all available screenshots | `?displayId` |
| `GET /api/v1/display/windows` | List windows on the current display | `?displayId` `?onlyVisible` |
| `POST /api/v1/display/clipboard` | Write clipboard text | `?displayId` `body*:display_ClipboardWriteBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `decorations` — Show window decorations (title bar with close/minimize/maximize buttons). Set to false for headless/kiosk mode.
- `toolbar` — Show entire toolbar/menu area (menu trigger + menu). Set to false to hide all menu UI elements. Takes precedence over the menu parameter.
- `menu` — Show Hoody menu trigger icon. Set to false to hide menu completely. Note: toolbar parameter takes precedence over this.
- `maximize_new_windows` — Open new top-level application windows maximized instead of centered at the default size (max 1024x1024). Only applies to windows that do not request their own position, and skips override-redirect windows, dialogs, other non-NORMAL window types, and windows the app itself marks undecorated via metadata (which would have no title bar to un-maximize from). Windows can still be un-maximized from their title bar. Combining with the global decorations=false parameter is honoured as explicit kiosk intent: windows open maximized without a title bar.
- `readonly` — Enable read-only/view-only mode. Blocks all keyboard and mouse input from the client. Perfect for dashboards, monitoring, or demo scenarios. Works independently or combines with server readonly setting.
- `dark_mode` — Enable dark mode theme
- `node` — Hoody node identifier (e.g., example-1, example-2)
- `project_id` — Hoody project ID
- `container_id` — Hoody container ID
- `url_display_id` — Display ID for URL construction
- `ssl` — Use SSL/TLS for WebSocket connection
- `webtransport` — Use WebTransport (HTTP3) instead of WebSocket
- `path` — Connection path for the display server
- `action` — Connection action type. - `connect` - Connect to existing session - `start` - Start new session - `shadow` - Shadow existing display
- `display` — Display number to connect to
- `encoding` — Video encoding type. Use auto for best automatic selection.
- `offscreen` — Use offscreen canvas for rendering
- `bandwidth_limit` — Bandwidth limit in bits per second (0 = unlimited)
- `override_width` — Override virtual desktop width (auto or numeric value)
- `override_height` — Override virtual desktop height (auto or numeric value 480-4320)
- `vrefresh` — Vertical refresh rate in Hz. Use -1 for auto-detect. Minimum 30 when explicitly set.
- `suspend_inactive_tab` — Suspend client updates when browser tab is inactive. Enables power saving by calling client.suspend() on tab hide and client.resume() on tab show. Recommended to keep enabled for better performance.
- `sound` — Enable audio forwarding
- `audio_codec` — Preferred audio codec
- `keyboard` — Show on-screen virtual keyboard
- `keyboard_layout` — Keyboard layout (us, gb, fr, de, etc.)
- `swap_keys` — Swap Cmd/Ctrl keys (useful for macOS)
- `clipboard` — Enable clipboard sharing
- `clipboard_preferred_format` — Preferred clipboard format
- `clipboard_poll` — Enable clipboard polling (browser-dependent default)
- `printing` — Enable printing support
- `file_transfer` — Enable file transfer support
- `video` — Enable video encoding support
- `mediasource_video` — Enable MediaSource API for video
- `open_url` — Allow opening URLs from the remote session in the local browser
- `notification_server_url` — External notification server URL for real-time notification integration.  **URL Format:** `https://{project}-{container}-n-{display}.{node}.containers.hoody.com/notification-client.js`  **Auto-detection:** If not provided, the client will attempt to auto-detect from the current hostname pattern. The client transforms the display URL pattern by replacing 'display' with 'n'.  **Examples:** - Manual: `?notification_server_url=https://my-project-container-n-6.node.containers.hoody.com/notification-client.js` - Auto-detected from: `https://my-project-container-display-6.node.containers.hoody.com`  **Integration:** The notification server (port 3999) provides: - Historical notification retrieval - Real-time WebSocket notification updates - Notification icons serving - Desktop notification triggering  See external notification server OpenAPI spec for complete API documentation.
- `web_notifications` — Enable browser web notifications (native OS notifications)
- `display_notifications` — Show notifications within display UI
- `notification_connection_type` — Notification server connection type. - websocket: Real-time updates via WebSocket (recommended) - polling: Periodic HTTP polling (fallback)
- `sharing` — Allow session sharing
- `steal` — Steal existing sessions
- `reconnect` — Auto-reconnect on connection loss
- `floating_menu` — Show floating menu
- `clock` — Show server clock
- `scroll_reverse_y` — Reverse vertical scrolling direction (auto, true, false)
- `scroll_reverse_x` — Reverse horizontal scrolling direction
- `title_show_hoody` — Show "Hoody" in browser title
- `title_show_display_id` — Show display ID in browser title
- `app` — Target application to launch or focus. Can be an application name, a REGEX pattern, or a window ID.
- `remote_logging` — Enable remote logging to the display server
- `insecure` — Allow insecure authentication (not recommended for production)
- `debug_main` — Enable main debug logging
- `debug_keyboard` — Enable keyboard debug logging
- `debug_geometry` — Enable geometry debug logging
- `debug_mouse` — Enable mouse debug logging
- `debug_clipboard` — Enable clipboard debug logging
- `debug_draw` — Enable draw debug logging
- `debug_audio` — Enable audio debug logging
- `debug_network` — Enable network debug logging
- `debug_file` — Enable file transfer debug logging
- `selection` — Clipboard buffer selection
- `onlyVisible` — If true, only include visible windows

### `health` (1) — Server health and status endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/health` | Service health check |  |

### `input` (31) — Mouse, keyboard, and window control operations via xdotool

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/input/act` | Execute one action with optional screenshot | `?displayId` `body*:display_ActBody` |
| `POST /api/v1/display/input/batch` | Execute a sequence of actions | `?displayId` `body*:display_BatchBody` |
| `POST /api/v1/display/input/click-at` | Move cursor and click | `?displayId` `body*:display_ClickAtBody` |
| `POST /api/v1/display/input/drag` | Drag from one position to another | `?displayId` `body*:display_DragBody` |
| `GET /api/v1/display/input/display-geometry` | Get display dimensions | `?displayId` |
| `POST /api/v1/display/keyboard/key` | Press key combinations | `?displayId` `body*:display_KeyboardKeyBody` |
| `POST /api/v1/display/keyboard/key-down` | Hold a key down | `?displayId` `body*:display_KeyboardKeyDownBody` |
| `POST /api/v1/display/keyboard/key-up` | Release a held key | `?displayId` `body*` |
| `POST /api/v1/display/keyboard/type` | Type a string of text | `?displayId` `body*:display_KeyboardTypeBody` |
| `POST /api/v1/display/mouse/click` | Click a mouse button | `?displayId` `body:display_MouseClickBody` |
| `POST /api/v1/display/mouse/double-click` | Double-click a mouse button | `?displayId` `body` |
| `POST /api/v1/display/mouse/down` | Press and hold a mouse button | `?displayId` `body` |
| `GET /api/v1/display/mouse/location` | Get cursor position | `?displayId` |
| `POST /api/v1/display/mouse/move` | Move cursor to absolute position | `?displayId` `body*:display_MouseMoveBody` |
| `POST /api/v1/display/mouse/move-relative` | Move cursor by offset | `?displayId` `body*` |
| `POST /api/v1/display/mouse/scroll` | Scroll in a direction | `?displayId` `body*:display_MouseScrollBody` |
| `POST /api/v1/display/mouse/up` | Release a mouse button | `?displayId` `body` |
| `POST /api/v1/display/input/reset` | Emergency release all inputs | `?displayId` |
| `POST /api/v1/display/input/select` | Select a range via click + shift-click | `?displayId` `body*:display_SelectBody` |
| `POST /api/v1/display/input/type-at` | Move, click, and type in one operation | `?displayId` `body*:display_TypeAtBody` |
| `POST /api/v1/display/input/wait` | Wait for a duration with optional screenshot | `?displayId` `body*:display_WaitBody` |
| `GET /api/v1/display/window/active` | Get the active window ID | `?displayId` |
| `POST /api/v1/display/window/close` | Close a window | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/focus` | Focus/activate a window | `?displayId` `body*:display_WindowIdBody` |
| `GET /api/v1/display/window/{windowId}/geometry` | Get window position and size | `?displayId` |
| `POST /api/v1/display/window/minimize` | Minimize a window | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/move` | Move a window | `?displayId` `body*:display_WindowMoveBody` |
| `GET /api/v1/display/window/{windowId}/name` | Get window title | `?displayId` |
| `POST /api/v1/display/window/raise` | Raise a window to the top | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/resize` | Resize a window | `?displayId` `body*:display_WindowResizeBody` |
| `POST /api/v1/display/window/search` | Search for windows by pattern | `?displayId` `body*:display_WindowSearchBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

**Body shapes:**

- `POST /api/v1/display/keyboard/key-up` body — `{ key*: string, window: int | string }`
- `POST /api/v1/display/mouse/double-click` body — `{ button: int=1, window: int | string }`
- `POST /api/v1/display/mouse/down` body — `{ button: int=1, window: int | string, holdMs: int }`
  - `holdMs` — Auto-release after this many milliseconds
- `POST /api/v1/display/mouse/move-relative` body — `{ x*: int, y*: int, sync: bool }`
- `POST /api/v1/display/mouse/up` body — `{ button: int=1, window: int | string }`

### `screenshots` (5) — Screenshot capture and retrieval operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/screenshot` | Capture a new screenshot | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/info` | Capture screenshot and return metadata only | `?displayId` |
| `GET /api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last` | Retrieve the most recent screenshot | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last/info` | Get metadata for the most recent screenshot | `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.

### `thumbnails` (3) — Thumbnail image operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/thumbnail` | Capture a new screenshot thumbnail | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail | `?base64` `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.


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
