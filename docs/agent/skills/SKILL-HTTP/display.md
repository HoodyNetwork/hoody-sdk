> _**HTTP skill · `display` namespace** · ~8,218 tokens · hoody-sdk v1.0.0-beta.16_

# `display` — programmatic GUI desktops with screenshots, input, and windows

## Purpose

Per-container HTML5 desktop (X11 via proxy): screenshots, input, windows, clipboard.

## When to use

- Click/type/drag/scroll at coords; screenshots/thumbnails for vision; X11 window ops; clipboard r/w.
- **Multiple GUI apps → one display (one `terminal_id`) per app (almost always the right call).** A single X display *can* host many windows, but giving each app its own display (`display: ":N"` paired to a distinct `terminal_id`) gives each its own `display-<N>` kit URL — a dedicated full-surface stream you can screenshot, embed / iframe, and route input to **independently, per window** — with no window-search / focus juggling on a shared display. Pin matching ids (`terminal_id=1`↔`:1`, `terminal_id=2`↔`:2`, …) so the routing stays one-to-one. Reuse a single display only when you deliberately want the apps composited together (e.g. a full desktop — see the `desktop-<N>` alias).

## When NOT to use

Not for: shell → `terminal`/`exec`, files → `files`, headless web → `browser`, toasts → `notifications`.

## Prerequisites

- Active X11 display (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"`: the create call takes `display` from the request body only, and no `terminal_id` value ever implies a `DISPLAY`. (A session the terminal kit has to create on demand for a command is configured from the request URL instead, where a `terminal-N` host already supplies `display=N`.) 
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `GET /api/v1/display/screenshot` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `POST /api/v1/display/input/click-at` / `POST /api/v1/display/input/type-at` at root-window coordinates (on a seamless session these differ from screenshot pixels; see Quirks).
3. `GET /api/v1/display/screenshot` again to see the result. There is no cheap change check: `GET /api/v1/display/screenshot` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `GET /api/v1/display/windows` (`onlyVisible` on).
2. `POST /api/v1/display/window/search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). 
3. `POST /api/v1/display/window/focus` with `sync` on (or `POST /api/v1/display/window/raise`). Read `details.inputFocus` in the focus response: `false` means the window was activated but is not viewable, so keyboard input cannot reach it.
4. `GET /api/v1/display/window/{windowId}/geometry` — coords.
5. `GET /api/v1/display/window/active` — confirms activation only, not keyboard focus.

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

1. `POST /api/v1/display/input/batch` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. 
2. `POST /api/v1/display/input/wait` — interleave waits.
3. `GET /api/v1/display/screenshot` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead.
- All endpoints except `GET /api/v1/display/health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; turn `base64` on for JSON.
- `GET /api/v1/display/screenshot/{timestamp}` needs numeric `timestamp`, not `timestamp_human`.
- **A screenshot pixel is not always a click coordinate.** A seamless session captures only the windows it shows, so the capture's origin is the top-left of their bounding box, while `POST /api/v1/display/input/click-at` and the other pointer calls take root-window coordinates. When the shown windows do not start at (0,0), add the capture origin (the smallest `x` and `y` among the shown windows' "geometry" objects in the `GET /api/v1/display/windows` response) to a point picked on the screenshot, or use `GET /api/v1/display/window/{windowId}/geometry` to target a window directly.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED`, carrying a shortened tool error; read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `GET /api/v1/display/windows`, `POST /api/v1/display/window/search` and `GET /api/v1/display/window/active` return decimal numbers; the path-parameter routes (`GET /api/v1/display/window/{windowId}/properties`, `GET /api/v1/display/window/{windowId}/geometry`, `GET /api/v1/display/window/{windowId}/name`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.{1,8}$/"]
- `POST /api/v1/display/window/focus` activates the window and then tries to give it X input focus. The second step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. `GET /api/v1/display/window/active` confirms the activation only.
- `GET /api/v1/display/info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `GET /api/v1/display/input/display-geometry`). 
- `POST /api/v1/display/input/reset` clears stuck modifiers/buttons.
- `POST /api/v1/display/input/wait-until` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `POST /api/v1/display/window/restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `500 INPUT_ACTION_FAILED`. With `sync: false` the answer has `state: null`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `GET /api/v1/display/screenshot/{timestamp}` — no stored capture has that timestamp. Refresh by calling `GET /api/v1/display/screenshot`, which **takes a fresh screenshot** (with `base64` on, the response carries its `info.timestamp`), then retry `GET /api/v1/display/screenshot/{timestamp}` with the new timestamp. `GET /api/v1/display/screenshot/last` returns the latest stored image by default; its metadata-only form (`GET /api/v1/display/screenshot/last/info`) returns only that image's metadata. Neither takes a fresh screenshot, so neither replaces a missed timestamp.

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. The `N` in the `display-N` kit hostname is the display id, so `display-1` addresses display 1; `?displayId=N` overrides it. The examples pass `displayId=1` explicitly, matching the host.

### 1. See-then-act loop — capture, click, re-capture

**Goal:** capture the screen, click a coordinate, capture again — the typical inner loop for vision-driven agents. Each capture with `base64` on returns the image and its metadata in one response, so no separate metadata call is needed. `info.timestamp` is the capture time in whole seconds; two captures in the same second share it, so it cannot tell you whether the screen changed.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" > /tmp/before.json
jq -r .info.timestamp /tmp/before.json
jq -r .image.data /tmp/before.json > /tmp/before.b64
```

**Step 2 — click at `(75, 50)`.** `POST /api/v1/display/input/click-at` moves AND clicks in one call; default `button=1` (left).

```bash
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":75,"y":50,"button":1}'
```

**Step 3 — capture again and give the new image to the vision model.** With `base64` on, `GET /api/v1/display/screenshot` returns the fresh image and its metadata. There is no cheaper probe: the metadata-only form (`GET /api/v1/display/screenshot/info`) still takes a full screenshot and only leaves the image bytes out.

```bash
curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" | jq -r .image.data > /tmp/after.b64
```

### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `POST /api/v1/display/window/search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns an object whose `windows` field is an array of numeric window ids.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/api/v1/display/window/search?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"pattern":"xeyes","name":true,"class":true,"classname":true}' \
  | jq -r '.windows[0]')
echo "wid=$WID"
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (no viewer attached, or unmapped), so keyboard input cannot reach it. `GET /api/v1/display/window/active` reports the active window, which confirms the activation only.

```bash
FOCUS=$(curl -sX POST "$KIT/api/v1/display/window/focus?displayId=1" \
  -H 'Content-Type: application/json' -d "{\"windowId\":$WID,\"sync\":true}")
[ "$(echo "$FOCUS" | jq -r .details.inputFocus)" = "true" ] && echo "keyboard focus OK"
ACTIVE=$(curl -sf "$KIT/api/v1/display/window/active?displayId=1" | jq -r .windowId)
[ "$ACTIVE" = "$WID" ] && echo "active OK"
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

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. Clipboard calls can fail with `CLIPBOARD_FAILED` (see Quirks), so read the clipboard back after the write.

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

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; only the list, search and active-window calls return decimal numbers.

### 7. List visible windows with `onlyVisible` filter

**Goal:** list the window manager's windows minus the minimized ones, then pick the one named `xeyes`, no regex. `onlyVisible` only drops windows marked `_NET_WM_STATE_HIDDEN`; it does not test whether a window is actually mapped or viewable (the list is also capped at 200 windows).

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/windows?displayId=1&onlyVisible=true" \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```

Each item carries `windowId`, `name`, `class` (the WM_CLASS instance/class pair when it can be read, otherwise an empty array), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) in one request. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The actions run in order and the batch stops at the first failure; nothing is rolled back, so actions before it have already taken effect. A failed action is still HTTP 200: check `success`, then `completed` (the actions that ran), `failed` (`{index, action, error}`) and `skipped`.

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
# → e.g. { width: 8192, height: 4096, screen: 0 }  (the virtual screen, much larger than any monitor)
```

Note: the geometry returned is the display's virtual screen (often `8192x4096`), not a physical monitor size. Pointer coordinates (`POST /api/v1/display/input/click-at` and the rest) are in this root-window space. A screenshot of a seamless session can start at a different origin, so a point picked on a screenshot may need an offset first (see Quirks).

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

### `clipboard` (2) — Display information and management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/clipboard` | Read clipboard text | `?displayId` `?selection` |
| `POST /api/v1/display/clipboard` | Write clipboard text | `?displayId` `body*:display_ClipboardWriteBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `selection` — Clipboard buffer selection

### `display` (2) — Display information and management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/info` | Get display information and screenshots | `?displayId` |
| `GET /api/v1/display/input/display-geometry` | Get display dimensions | `?displayId` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

### `input` (8) — Mouse, keyboard, and window control operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/input/act` | Execute one action with optional screenshot | `?displayId` `body*:display_ActBody` |
| `POST /api/v1/display/input/batch` | Execute a sequence of actions | `?displayId` `body*:display_BatchBody` |
| `POST /api/v1/display/input/click-at` | Move cursor and click | `?displayId` `body*:display_ClickAtBody` |
| `POST /api/v1/display/input/drag` | Drag from one position to another | `?displayId` `body*:display_DragBody` |
| `POST /api/v1/display/input/reset` | Emergency release all inputs | `?displayId` |
| `POST /api/v1/display/input/select` | Select a range via click + shift-click | `?displayId` `body*:display_SelectBody` |
| `POST /api/v1/display/input/type-at` | Move, click, and type in one operation | `?displayId` `body*:display_TypeAtBody` |
| `POST /api/v1/display/input/wait` | Wait for a duration with optional screenshot | `?displayId` `body*:display_WaitBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

### `keyboard` (4) — Mouse, keyboard, and window control operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/keyboard/key-down` | Hold a key down | `?displayId` `body*:display_KeyboardKeyDownBody` |
| `POST /api/v1/display/keyboard/key` | Press key combinations | `?displayId` `body*:display_KeyboardKeyBody` |
| `POST /api/v1/display/keyboard/type` | Type a string of text | `?displayId` `body*:display_KeyboardTypeBody` |
| `POST /api/v1/display/keyboard/key-up` | Release a held key | `?displayId` `body*` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

**Body shapes:**

- `POST /api/v1/display/keyboard/key-up` body — `{ key*: string, window: int | string }`

### `kit` (1) — Server health and status endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/health` | Service health check |  |

### `mouse` (8) — Mouse, keyboard, and window control operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/mouse/click` | Click a mouse button | `?displayId` `body:display_MouseClickBody` |
| `POST /api/v1/display/mouse/double-click` | Double-click a mouse button | `?displayId` `body` |
| `POST /api/v1/display/mouse/down` | Press and hold a mouse button | `?displayId` `body` |
| `GET /api/v1/display/mouse/location` | Get cursor position | `?displayId` |
| `POST /api/v1/display/mouse/move` | Move cursor to absolute position | `?displayId` `body*:display_MouseMoveBody` |
| `POST /api/v1/display/mouse/move-relative` | Move cursor by offset | `?displayId` `body*` |
| `POST /api/v1/display/mouse/scroll` | Scroll in a direction | `?displayId` `body*:display_MouseScrollBody` |
| `POST /api/v1/display/mouse/up` | Release a mouse button | `?displayId` `body` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

**Body shapes:**

- `POST /api/v1/display/mouse/double-click` body — `{ button: int=1, window: int | string }`
- `POST /api/v1/display/mouse/down` body — `{ button: int=1, window: int | string, holdMs: int }`
  - `holdMs` — Auto-release after this many milliseconds
- `POST /api/v1/display/mouse/move-relative` body — `{ x*: int, y*: int, sync: bool }`
- `POST /api/v1/display/mouse/up` body — `{ button: int=1, window: int | string }`

### `screenshots` (4) — Screenshot capture and retrieval operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/screenshot` | Capture a new screenshot | `?base64` `?displayId` `?region` `?cursor` `?metadata` |
| `GET /api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last` | Retrieve the most recent screenshot | `?base64` `?displayId` `?metadata` |
| `GET /api/v1/display/screenshots` | List all available screenshots | `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `region` — Crop the returned image to `x1,y1,x2,y2`. Minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else is a 400. The coordinates are **capture coordinates**, not root-window coordinates. A seamless session composites only the windows it is showing, so the capture's origin is the bounding box of those windows. Crop against the width and height reported for the capture itself, not against the geometry from `GET /input/display-geometry`.
- `cursor` — Include the pointer position in the response. Only has an effect on the base64 JSON form, which gains a `cursor` object; a binary PNG response has nowhere to put it. Accepted values: `true`, `1`, `` (empty). Anything else is off.
- `metadata` — Answer the screenshot metadata instead of the image. _(on `GET /api/v1/display/screenshot`)_
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.
- `metadata` — Answer the latest screenshot metadata instead of the image. _(on `GET /api/v1/display/screenshot/last`)_

### `thumbnails` (3) — Thumbnail image operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/thumbnail` | Capture a new screenshot thumbnail | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail | `?base64` `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.

### `windows` (14) — Mouse, keyboard, and window control operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/window/close` | Close a window | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/focus` | Focus/activate a window | `?displayId` `body*:display_WindowSyncBody` |
| `GET /api/v1/display/window/{windowId}/properties` | Get extended properties for a window | `?displayId` |
| `GET /api/v1/display/window/active` | Get the active window ID | `?displayId` |
| `GET /api/v1/display/window/{windowId}/geometry` | Get window position and size | `?displayId` |
| `GET /api/v1/display/window/{windowId}/name` | Get window title | `?displayId` |
| `GET /api/v1/display/windows` | List windows on the current display | `?displayId` `?onlyVisible` |
| `POST /api/v1/display/window/minimize` | Minimize a window | `?displayId` `body*:display_WindowSyncBody` |
| `POST /api/v1/display/window/move` | Move a window | `?displayId` `body*:display_WindowMoveBody` |
| `POST /api/v1/display/window/raise` | Raise a window to the top | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/resize` | Resize a window | `?displayId` `body*:display_WindowResizeBody` |
| `POST /api/v1/display/window/restore` | Restore (un-minimize) a window | `?displayId` `body*:display_WindowRestoreBody` |
| `POST /api/v1/display/window/search` | Search for windows by pattern | `?displayId` `body*:display_WindowSearchBody` |
| `POST /api/v1/display/input/wait-until` | Wait for a window to appear or disappear | `?displayId` `body*:display_WaitUntilBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `onlyVisible` — Drop windows carrying `_NET_WM_STATE_HIDDEN`. A minimized window carries that state, so this does exclude minimized windows. This is a different test from the `onlyVisible` on `window/search` and `input/wait-until`, which ask the X server whether the window is viewable and still match a minimized one.


### Body schemas

- `display_ClipboardWriteBody` — `{ text*: string, selection: "clipboard" | "primary" | "secondary"="clipboard" }`
- `display_WindowSyncBody` — `{ windowId*: int | string, sync: bool }`
- `display_WindowMoveBody` — `{ windowId*: int | string, x*: int, y*: int, sync: bool, relative: bool }`
- `display_WindowResizeBody` — `{ windowId*: int | string, width*: int, height*: int, sync: bool, useHints: bool }`
- `display_WindowRestoreBody` — `{ windowId*: int | string, sync: bool=true }`
  - `sync` — Wait (up to 2 s) until the window manager reports the window as no longer minimized. Defaults to true, unlike the other window actions: the restore request is a message the window manager may ignore, so without waiting the response cannot say whether it worked.
- `display_WindowIdBody` — `{ windowId*: int | string }`
- `display_WindowSearchBody` — `{ pattern*: string, name: bool, class: bool, classname: bool, onlyVisible: bool }`
- `display_WaitUntilBody` — `{ condition*: "window-present" | "window-absent", pattern: string, match: "name" | "class" | "classname"="name", onlyVisible: bool=false, windowId: int | string, timeoutMs: int=10000, pollMs: int=250 }`
  - `pattern` — Extended POSIX regex. Required for `window-present`; for `window-absent` give either this or `windowId`, not both. A pattern that does not compile is a 400, not an empty result, and so is one containing a NUL (it could never reach the subprocess).
  - `onlyVisible` — … Sending it alongside `windowId` is rejected: that is an identity check, not a search, so the flag would be silently ignored. …
  - `pollMs` — Gap between observations. An explicit value above `timeoutMs` is rejected; the default is not, so a `timeoutMs` under 250 is a legal request for a single look rather than an error.
- `display_MouseClickBody` — `{ button: int=1, repeat: int=1, delay: int, window: int | string }`
  - `repeat` — Number of clicks. `repeat` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR` naming both fields. The count is never silently capped, so `repeat: 100` stays valid at `delay: 40` or less.
- `display_MouseMoveBody` — `{ x*: int, y*: int, window: int | string, screen: int, sync: bool }`
- `display_MouseScrollBody` — `{ direction*: "up" | "down" | "left" | "right", clicks: int=5, delay: int, x: int, y: int }`
  - `clicks` — Wheel clicks. `clicks` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR`; `clicks: 100` therefore needs `delay: 40` or less.
  - `x` — Scroll at this point instead of wherever the pointer happens to be. Must be given together with `y`. The move and the wheel events are sent as one chained command, so nothing can move the pointer in between.
  - `y` — Must be given together with `x`.
- `display_KeyboardTypeBody` — `{ text*: string, window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyBody` — `{ keys*: string[], window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyDownBody` — `{ key*: string, window: int | string, holdMs: int }`
- `display_ClickAtBody` — `{ x*: int, y*: int, button: int=1, repeat: int=1, delay: int }`
  - `repeat` — Clicks at that point, in one chained invocation, so the pointer cannot be moved between them. Same 4000 ms `repeat` x `delay` budget as `/mouse/click`.
- `display_TypeAtBody` — `{ x*: int, y*: int, text*: string, delay: int }`
- `display_DragBody` — `{ startX*: int, startY*: int, endX*: int, endY*: int, button: int=1, steps: int }`
- `display_SelectBody` — `{ x*: int, y*: int, endX*: int, endY*: int }`
- `display_ActBody` — `{ action*: string, params: object, screenshot: bool=true, screenshotDelay: int=100, screenshotRegion: string }`
  - `action` — Action path. … `act` runs one action, so a rejection here IS a 400 `VALIDATION_ERROR` (inside `/input/batch` the same rejection is reported in the 200 body as `failed.error` instead).
- `display_WaitBody` — `{ ms*: int, screenshot: bool=false }`
- `display_BatchBody` — `{ actions*: { action*: string, params: object }[] }`
