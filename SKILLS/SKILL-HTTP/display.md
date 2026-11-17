> _**HTTP skill · `display` namespace** · ~11,182 tokens · hoody-sdk v1.0.1_

# `display` — programmatic GUI desktops with screenshots, input, and windows

## Purpose

Per-computer HTML5 desktop (X11 via proxy): screenshots, input, windows, clipboard.

## When to use

- Click/type/drag/scroll at coords; screenshots/thumbnails for vision; X11 window ops; clipboard r/w.
- **Multiple GUI apps → one display (one `terminal_id`) per app (almost always the right call).** A single X display *can* host many windows, but giving each app its own display (`display: ":N"` paired to a distinct `terminal_id`) gives each its own `display-<N>` kit URL — a dedicated full-surface stream you can screenshot, embed / iframe, and route input to **independently, per window** — with no window-search / focus juggling on a shared display. Pin matching ids (`terminal_id=1`↔`:1`, `terminal_id=2`↔`:2`, …) so the routing stays one-to-one. Reuse a single display only when you deliberately want the apps composited together (e.g. a full desktop — see the `desktop-<N>` alias).

## When NOT to use

Not for: shell → `terminal`/`exec`, files → `files`, headless web → `browser`, toasts → `notifications`.

## Prerequisites

- Active X11 display (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"`: the create call takes `display` from the request body only, and no `terminal_id` value ever implies a `DISPLAY`. (A session the terminal kit has to create on demand for a command is configured from the request URL instead, where a `terminal-N` host already supplies `display=N`.) 
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{computerId}-display-1.{node}.computers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `GET /api/v1/display/screenshot` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `POST /api/v1/display/input/click-at` / `POST /api/v1/display/input/type-at` at a point picked on that screenshot: a screenshot spans the whole screen, so its pixel (x, y) is the point (x, y) these act on.
3. `GET /api/v1/display/screenshot` again to see the result. There is no cheap change check: `GET /api/v1/display/screenshot` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `GET /api/v1/display/windows` (`onlyVisible` on).
2. `POST /api/v1/display/window/search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). 
3. `POST /api/v1/display/window/focus` with `sync` on. Read `details.inputFocus` in the response: proceed with keyboard input only when it is `true`. `false` means the window was activated but is not viewable, so keyboard input cannot reach it. `POST /api/v1/display/window/raise` is not a substitute for focusing.
4. `GET /api/v1/display/window/{windowId}/geometry` — coords.
5. `GET /api/v1/display/window/active` — confirms activation only, not keyboard focus.

`GET /api/v1/display/windows` and `GET /api/v1/display/window/active` need a window manager on a running display: `409 NO_WINDOW_MANAGER` means none is running, and retrying does not help. (A parked display answers `GET /api/v1/display/windows` with an empty list and is not started.) Without one, `POST /api/v1/display/window/focus` can still give a viewable window keyboard focus: check `details.inputFocus`, and `details.warning` then says the window was not activated or raised (and `GET /api/v1/display/window/active` cannot report it); it answers `409 NO_WINDOW_MANAGER` only when the window cannot take focus either. Start a window manager (for example a desktop session), or use `POST /api/v1/display/window/search`, window geometry and name queries, and mouse and keyboard actions, which work without one.

### 3. Drag / select

1. `POST /api/v1/display/mouse/move` — optional pre-position.
2. `POST /api/v1/display/input/drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `POST /api/v1/display/input/select` — click + shift-click.
4. `POST /api/v1/display/input/reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `POST /api/v1/display/clipboard` — `text`, optional `selection`.
2. `POST /api/v1/display/keyboard/key` — `["ctrl+v"]` (`["shift+Insert"]` if step 1 set `selection: "primary"`).
3. `GET /api/v1/display/clipboard` — read back after GUI copy.

### 5. Batch input replay

1. `POST /api/v1/display/input/batch` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. 
2. `POST /api/v1/display/input/wait` — interleave waits.
3. `GET /api/v1/display/screenshot` — confirm.

### 6. Press a key or a key combination

1. `POST /api/v1/display/keyboard/key` with `keys`, a list of up to 20 combinations pressed in turn: `["Return"]`, `["Escape"]`, `["ctrl+l"]`, `["ctrl+shift+t"]`, `["Tab", "Down", "Return"]`. Names are X keysym names (`Return`, `Escape`, `Tab`, `BackSpace`, `Delete`, `Up`/`Down`/`Left`/`Right`, `Home`, `End`, `Page_Up`, `F1`…) joined to modifiers (`ctrl`, `shift`, `alt`, `super`) with `+`. 
2. To submit typed text, end it with a line break instead: in `POST /api/v1/display/keyboard/type` and `POST /api/v1/display/input/type-at`, `\n` presses Return.
3. `POST /api/v1/display/keyboard/key-down` / `POST /api/v1/display/keyboard/key-up` hold and release one key. To release a hold made with a `window` through `POST /api/v1/display/keyboard/key-up`, pass the same `window`. `POST /api/v1/display/input/reset` releases every hold, those made with a `window` included.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); over raw HTTP an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead.
- All endpoints except `GET /api/v1/display/health` and the HTML client page at the service root need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Requests for a screenshot image return binary PNG; turn `base64` on for JSON. Metadata-only requests and the screenshot list return JSON and take no `base64`.
- `GET /api/v1/display/screenshot/{timestamp}` takes a string containing the capture's `timestamp` (Unix seconds, or milliseconds, microseconds or nanoseconds), a date such as its `timestamp_human`, its file name or stem, or `latest`/`newest`. A file name or stem identifies one capture even when captures share a second. An unparseable value returns `400 VALIDATION_ERROR`.
- **A screenshot pixel is a click coordinate.** A screenshot spans the whole screen at its current size, read from the windows as they are when it is taken, so pixel (x, y) is the point `POST /api/v1/display/input/click-at` and the other pointer calls act on at (x, y). Where no window is, the image is transparent. A `region` crop starts at its `x1,y1`: add them to a point picked on the crop. Take a new screenshot after a viewer attaches: the screen then takes the viewer's size and the windows move.
- `POST /api/v1/display/input/click-at` and `POST /api/v1/display/input/type-at` refuse a point with no viewable window with `409 WINDOW_NOT_VIEWABLE` and click nothing. That is a point on the bare desktop between windows, or on a hidden window (for example one minimized in a viewer) (unless an open menu takes the click). Pick a point on a window in a fresh screenshot (restore a hidden window with `POST /api/v1/display/window/restore` first).
- A line break in `text` (`\n`, `\r\n` or `\r`) presses Return in `POST /api/v1/display/keyboard/type` and `POST /api/v1/display/input/type-at`, so `"https://example.com\n"` types the address and submits it; `\t` presses Tab. Every other key or combination (Escape, ctrl+l, arrows) goes through `POST /api/v1/display/keyboard/key`.
- `POST /api/v1/display/input/click-at` refuses a point outside the display's current size with `400 VALIDATION_ERROR` instead of clicking the screen edge, and its `details.pointer` reports where the pointer was after the click and the window under it (`x`, `y`, `window`). A `200` means the click was delivered there, not that the program acted on it: take a new screenshot to see the effect.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED` (`details.message`: "The clipboard could not be read or written"); read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `GET /api/v1/display/windows`, `POST /api/v1/display/window/search` and `GET /api/v1/display/window/active` return decimal numbers, as does `details.windowId` of `POST /api/v1/display/window/restore`; the path-parameter routes (`GET /api/v1/display/window/{windowId}/properties`, `GET /api/v1/display/window/{windowId}/geometry`, `GET /api/v1/display/window/{windowId}/name`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.
- `POST /api/v1/display/window/focus` tries to activate the window and then to give it keyboard focus; without a window manager it can give a viewable window keyboard focus without activating it (`details.inputFocus: true` with a `warning`). With a window manager, the keyboard-focus step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. Without a window manager, a non-viewable window's focus refusal answers `409 NO_WINDOW_MANAGER`. `GET /api/v1/display/window/active` confirms the activation only.
- `GET /api/v1/display/info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `GET /api/v1/display/input/display-geometry`).
- `POST /api/v1/display/input/reset` clears stuck modifiers/buttons.
- `POST /api/v1/display/input/wait-until` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `POST /api/v1/display/window/restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `409 SYNC_TIMEOUT`. With `sync: false` the answer's `details.state` is `null`, unless the window was already normal: that no-op answers `details.state: "normal"` with `details.synced: true`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `GET /api/v1/display/screenshot/{timestamp}` — no stored capture has that timestamp. Refresh by calling `GET /api/v1/display/screenshot`, which **takes a fresh screenshot** (with `base64` on, the response carries its `info.timestamp`), then retry `GET /api/v1/display/screenshot/{timestamp}` with the new timestamp. `GET /api/v1/display/screenshot/last` returns the latest stored image by default; its metadata-only form (`GET /api/v1/display/screenshot/last/info`) returns only that image's metadata. Neither takes a fresh screenshot, so neither replaces a missed timestamp.

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first. The number in the `display-D` kit hostname is the display id `D`, so `display-1` addresses display 1; `?displayId=D` overrides it. The examples pass `displayId=1` explicitly, matching the host.

### 1. See-then-act loop — capture, click, re-capture

**Goal:** capture the screen, click a coordinate, capture again — the typical inner loop for vision-driven agents. Each capture with `base64` on returns the image and its metadata in one response, so no separate metadata call is needed. `info.timestamp` is the capture time in whole seconds; two captures in the same second share it, so it cannot tell you whether the screen changed.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
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
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
WID=$(curl -sX POST "$KIT/api/v1/display/window/search?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"pattern":"xeyes","name":true,"class":true,"classname":true}' \
  | jq -er '.windows[0] // error("No window matched xeyes")') || exit 1
echo "wid=$WID"
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (hidden, for example minimized in a viewer), so keyboard input cannot reach it. `GET /api/v1/display/window/active` reports the active window, which confirms the activation only.

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
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
# 1. click to set keyboard focus on the field
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":120,"y":80}'
# 2. type. `delay` is inter-keystroke ms (0..1000)
curl -sX POST "$KIT/api/v1/display/keyboard/type?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello world","delay":20}'
```

`POST /api/v1/display/input/type-at` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`. End `text` with `\n` to press Return after it (to submit a form or an address bar).

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/drag?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"startX":50,"startY":50,"endX":200,"endY":150,"steps":20,"button":1}'
```

If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `POST /api/v1/display/input/reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. Clipboard calls can fail with `CLIPBOARD_FAILED` (see Quirks), so read the clipboard back after the write.

**Step 1 — `POST /api/v1/display/clipboard` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/display/clipboard?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"pasted via hoody","selection":"clipboard"}'
# Verify
curl -sf "$KIT/api/v1/display/clipboard?displayId=1&selection=clipboard" | jq -r .text
```

**Step 2 — Ctrl+V into the focused window.** `keys` is an array. For an application that pastes from PRIMARY, write and verify the text with `selection: "primary"` in step 1, then pass `["shift+Insert"]`.

```bash
curl -sX POST "$KIT/api/v1/display/keyboard/key?displayId=1" \
  -H 'Content-Type: application/json' -d '{"keys":["ctrl+v"]}'
```

### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/display/window/$WID/properties?displayId=1" | jq '.properties'
# → { wmClass:["xeyes","XEyes"], wmName:"xeyes", wmRole:null, pid:null, wmState:[], wmType:[], transientFor:null }
curl -sf "$KIT/api/v1/display/window/$WID/geometry?displayId=1" | jq '{x,y,width,height}'
```

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; the list, search and active-window calls return decimal numbers, and `POST /api/v1/display/window/restore` returns `details.windowId` as a number.

### 7. List visible windows with `onlyVisible` filter

**Goal:** list the window manager's windows minus the minimized ones, then pick the one named `xeyes`, no regex. `onlyVisible` only drops windows marked `_NET_WM_STATE_HIDDEN`; it does not test whether a window is actually mapped or viewable (the list is also capped at 200 windows).

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/display/windows?displayId=1&onlyVisible=true" \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```

Each item carries `windowId`, `name`, `class` (the WM_CLASS instance/class pair when it can be read, otherwise an empty array), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) in one request. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The actions run in order and the batch stops at the first failure; nothing is rolled back, so actions before it have already taken effect. A failed action is still HTTP 200: check `success`, then `completed` (the actions that ran), `failed` (`{index, action, error}`) and `skipped`.

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/batch?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{
    "actions":[
      {"action":"mouse/move",   "params":{"x":120,"y":80}},
      {"action":"input/wait",   "params":{"ms":150}},
      {"action":"mouse/click",  "params":{"button":1}},
      {"action":"input/wait",   "params":{"ms":150}},
      {"action":"keyboard/type","params":{"text":"replayed","delay":15}}
    ]
  }'
```

`POST /api/v1/display/input/wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `POST /api/v1/display/input/batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `GET /api/v1/display/input/display-geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/display/info?displayId=1" \
  | jq '{display, pid, session_name, user, start_time, connected_clients, latency, windowCount: (.windows|length), screenshotCount: (.screenshots|length)}'
# Just the geometry (cheaper):
curl -sf "$KIT/api/v1/display/input/display-geometry?displayId=1" | jq '{width,height,screen}'
# → e.g. { width: 8192, height: 4096, screen: 0 }  (a possible initial size, before a viewer attaches)
```

Note: the geometry is the display's current virtual screen size. It may start at `8192x4096`; a viewer can resize it, and the resized size can persist after the viewer detaches. Read it again after a viewer attaches or resizes. Pointer coordinates (`POST /api/v1/display/input/click-at` and the rest) are in this screen space. An uncropped full-screen screenshot uses the same coordinates; for a screenshot captured with `region`, add the region's `x1` and `y1` to image coordinates before using them as pointer coordinates.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `POST /api/v1/display/keyboard/key-down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `POST /api/v1/display/input/reset` releases, in one call, every key and button held through this API (a hold made with a `window` is released to that window as well), the Shift / Ctrl / Alt / Super / Meta keys, and mouse buttons 1-5. A button 6 or 7 that something else left pressed is not among them: release it with a mouse up on that button.

```bash
KIT="https://${P}-${C}-display-1.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/reset?displayId=1" \
  -H 'Content-Type: application/json' -d '{}'
# → {"success":true,"action":"reset","details":{"message":"All modifier keys and mouse buttons released"}}
```

Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

**Param notes for every section** (a parameter named here means this wherever a row lists it, unless its own section says otherwise):

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

### `clipboard` (2) — Clipboard get/set

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/clipboard` | Read clipboard text | `?displayId` `?selection` |
| `POST /api/v1/display/clipboard` | Write clipboard text | `?displayId` `body*:display_ClipboardWriteBody` |

**Param notes:**

- `selection` — Clipboard buffer selection

### `display` (2) — Display information and management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/info` | Get display information and screenshots | `?displayId` |
| `GET /api/v1/display/input/display-geometry` | Get display dimensions | `?displayId` |

### `input` (8) — Mouse, keyboard, and window control operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/input/act` | Execute one action with optional screenshot | `?displayId` `body*:display_ActBody` |
| `POST /api/v1/display/input/batch` | Execute a sequence of actions | `?displayId` `body*:display_BatchBody` |
| `POST /api/v1/display/input/click-at` | Move cursor and click | `?displayId` `body*:display_ClickAtBody` |
| `POST /api/v1/display/input/drag` | Drag from one position to another | `?displayId` `body*:display_DragBody` |
| `POST /api/v1/display/input/reset` | Emergency release all inputs | `?displayId` `body` |
| `POST /api/v1/display/input/select` | Select a range via click + shift-click | `?displayId` `body*:display_SelectBody` |
| `POST /api/v1/display/input/type-at` | Move, click, and type in one operation | `?displayId` `body*:display_TypeAtBody` |
| `POST /api/v1/display/input/wait` | Wait for a duration with optional screenshot | `?displayId` `body*:display_WaitBody` |

**Body shapes:**

- `POST /api/v1/display/input/reset` body — `object` — No parameters; a body, when sent, must be a JSON object, and its fields are ignored.

### `keyboard` (4) — Keyboard automation

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/keyboard/key-down` | Hold a key down | `?displayId` `body*:display_KeyboardKeyDownBody` |
| `POST /api/v1/display/keyboard/key` | Press key combinations | `?displayId` `body*:display_KeyboardKeyBody` |
| `POST /api/v1/display/keyboard/type` | Type a string of text | `?displayId` `body*:display_KeyboardTypeBody` |
| `POST /api/v1/display/keyboard/key-up` | Release a held key | `?displayId` `body*` |

**Body shapes:**

- `POST /api/v1/display/keyboard/key-up` body — `{ key*: string, window: int | string }`
  - `key` — Key name of a key held by `keyboard/key-down`. Letters, digits, `_`, `+`, `-` and `.` only. Names of reserved commands are refused, in any letter case.
  - `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits

### `kit` (1) — Server health and status endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/health` | Service health check |  |

### `mouse` (8) — Mouse control operations

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

**Body shapes:**

- `POST /api/v1/display/mouse/double-click` body — `{ button: int=1, window: int | string }`
  - `button` — Mouse button (1=left, 2=middle, 3=right; 4-7 are the scroll wheel: 4=up, 5=down, 6=left, 7=right)
  - `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits
- `POST /api/v1/display/mouse/down` body — `{ button: int=1, window: int | string, holdMs: int }`
  - `holdMs` — Auto-release after this many milliseconds
- `POST /api/v1/display/mouse/move-relative` body — `{ x*: int, y*: int, sync: bool }`
  - `x` — Horizontal distance to move by, in pixels. Negative moves left.
  - `y` — Vertical distance to move by, in pixels. Negative moves up.
  - `sync` — Accepted and ignored. The pointer is at its new position when the call answers, whether or not it is set.
- `POST /api/v1/display/mouse/up` body — `{ button: int=1, window: int | string }`

### `screenshots` (6) — Screenshot capture and retrieval operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/screenshot` | Capture a new screenshot | `?base64` `?displayId` `?region` `?cursor` |
| `GET /api/v1/display/screenshot/info` | Capture screenshot and return metadata only | `?displayId` |
| `GET /api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last` | Retrieve the most recent screenshot | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last/info` | Get metadata for the most recent screenshot | `?displayId` |
| `GET /api/v1/display/screenshots` | List all available screenshots | `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default)
- `region` — Crop the returned image to `x1,y1,x2,y2`. Minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else, an empty `region` or one given twice included, is a 400. A capture spans the whole screen, so these are screen coordinates: the same ones `POST /input/click-at` takes and `GET /input/display-geometry` describes. The cropped image starts at `x1,y1`: its pixel (x, y) is screen point (x1 + x, y1 + y). The region must lie inside the captured screen (`x2` at most its width, `y2` at most its height): one that does not is a 400 `VALIDATION_ERROR` naming the screen size. That check needs the capture, so it comes after the display was started.
- `cursor` — Include the pointer position in the response. Only has an effect on the base64 JSON form, which gains a `cursor` object; a binary PNG response has nowhere to put it. Accepted values: `true`, `1`, `` (empty). Anything else is off.
- `timestamp` — The screenshot to return. Any of these names it: Unix time in seconds (`1749541160`), with or without a fraction (`1749541160.5`). Unix time in milliseconds, microseconds or nanoseconds (`1749541160123`); the unit is read from the number of whole digits after any leading zeros (12 or more is milliseconds, 15 or more microseconds, 18 or more nanoseconds). A number that equals a stored `timestamp` exactly, as written, matches that screenshot first. A date and time, such as the `timestamp_human` field (`2025-06-10T07:39:20+00:00`): an ISO 8601 calendar date written with dashes (`2025-06-10T07:39:20Z`, with an offset or none, or `2025-06-10` alone), an RFC 2822 date (`Tue, 10 Jun 2025 07:39:20 GMT`), or a date such as `06/10/2025 07:39:20`. A date with no zone is read as UTC. ISO 8601 week and ordinal dates and the form without dashes are not accepted. A date first matches the screenshot whose `timestamp_human` is that second, then one whose `timestamp` is: `timestamp_human` is when the file was written, which can be a few seconds after `timestamp`, so one second can name two different screenshots. Unix time matches `timestamp` only. The screenshot's file name from `full.path` or `thumbnail.path` (`1749541160.4242.17.png`), or the whole path, URL-encoded. This names exactly that screenshot, even when another was taken in the same second. The `.png` can be left off a name in three parts (`1749541160.4242.17`); an older single-number name (`1749541160.png`) needs it, as without it the value is Unix time. `latest` (or `newest`): the newest stored screenshot. Times are matched to the second. Two screenshots taken in the same second share a timestamp: Unix time returns the newer one (after any exact match as written), a date the first one whose `timestamp_human` is that second (which can be the older). Use the file name to pick a screenshot exactly. Anything else is a 400 `VALIDATION_ERROR`.

### `thumbnails` (3) — Thumbnail image operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/thumbnail` | Capture a new screenshot thumbnail | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail | `?base64` `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default)
- `timestamp` — The screenshot to return. Any of these names it: Unix time in seconds (`1749541160`), with or without a fraction (`1749541160.5`). Unix time in milliseconds, microseconds or nanoseconds (`1749541160123`); the unit is read from the number of whole digits after any leading zeros (12 or more is milliseconds, 15 or more microseconds, 18 or more nanoseconds). A number that equals a stored `timestamp` exactly, as written, matches that screenshot first. A date and time, such as the `timestamp_human` field (`2025-06-10T07:39:20+00:00`): an ISO 8601 calendar date written with dashes (`2025-06-10T07:39:20Z`, with an offset or none, or `2025-06-10` alone), an RFC 2822 date (`Tue, 10 Jun 2025 07:39:20 GMT`), or a date such as `06/10/2025 07:39:20`. A date with no zone is read as UTC. ISO 8601 week and ordinal dates and the form without dashes are not accepted. A date first matches the screenshot whose `timestamp_human` is that second, then one whose `timestamp` is: `timestamp_human` is when the file was written, which can be a few seconds after `timestamp`, so one second can name two different screenshots. Unix time matches `timestamp` only. The screenshot's file name from `full.path` or `thumbnail.path` (`1749541160.4242.17.png`), or the whole path, URL-encoded. This names exactly that screenshot, even when another was taken in the same second. The `.png` can be left off a name in three parts (`1749541160.4242.17`); an older single-number name (`1749541160.png`) needs it, as without it the value is Unix time. `latest` (or `newest`): the newest stored screenshot. Times are matched to the second. Two screenshots taken in the same second share a timestamp: Unix time returns the newer one (after any exact match as written), a date the first one whose `timestamp_human` is that second (which can be the older). Use the file name to pick a screenshot exactly. Anything else is a 400 `VALIDATION_ERROR`.

### `windows` (14) — Window management operations

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

- `onlyVisible` — Drop windows carrying `_NET_WM_STATE_HIDDEN`. A minimized window carries that state, so this does exclude minimized windows. This is a different test from the `onlyVisible` on `window/search` and `input/wait-until`, which ask the X server whether the window is viewable and still match a minimized one.


### Body schemas

- `display_ClipboardWriteBody` — `{ text*: string, selection: "clipboard" | "primary" | "secondary"="clipboard" }`
  - `text` — Clipboard text content, up to 1,048,576 characters. Its UTF-8 encoding may not exceed 4 MiB, and the whole request body is limited to 2 MiB. An empty string empties the selection.
- `display_WindowSyncBody` — `{ windowId*: int | string, sync: bool }`
  - `sync` — Wait for the change to be applied before answering. … When the display is running but the change is not seen within 5 s (the window manager refused it, or the window was already that way), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `display_WindowMoveBody` — `{ windowId*: int | string, x*: int, y*: int, sync: bool, relative: bool }`
  - `windowId` — Window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits
  - `sync` — Wait until the window is at the new position before answering. A move to where the window already is answers at once. When the display is running but the window has not moved within 2 s (the window manager refused it), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `display_WindowResizeBody` — `{ windowId*: int | string, width*: int, height*: int, sync: bool, useHints: bool }`
  - `windowId` — Window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits
  - `sync` — Wait until the change is seen before answering. When the display is running but the change is not seen within 5 s (the window manager refused or adjusted it, or the window was already that way), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `display_WindowRestoreBody` — `{ windowId*: int | string, sync: bool=true }`
  - `sync` — Wait (up to 2 s) until the window manager reports the window as no longer minimized. Defaults to true, unlike the other window actions: the restore request is a message the window manager may ignore, so without waiting the response cannot say whether it worked. A window still minimized after 2 s answers 409 `SYNC_TIMEOUT`.
- `display_WindowIdBody` — `{ windowId*: int | string }`
- `display_WindowSearchBody` — `{ pattern*: string, name: bool, class: bool, classname: bool, onlyVisible: bool }`
  - `pattern` — Extended POSIX regular expression, matched case-insensitively. A pattern that does not compile, or that contains a NUL character, is a 400 `VALIDATION_ERROR`.
- `display_WaitUntilBody` — `{ condition*: "window-present" | "window-absent", pattern: string, match: "name" | "class" | "classname"="name", onlyVisible: bool=false, windowId: int | string, timeoutMs: int=10000, pollMs: int=250 }`
  - `pattern` — Extended POSIX regex. Required for `window-present`; for `window-absent` give either this or `windowId`, not both. A pattern that does not compile is a 400, not an empty result, and so is one containing a NUL (it could never reach the subprocess).
  - `onlyVisible` — Restrict the search to windows that are currently viewable. … Sending it alongside `windowId` is rejected: that is an identity check, not a search, so the flag would be silently ignored. …
  - `pollMs` — Gap between observations. An explicit value above `timeoutMs` is rejected; the default is not, so a `timeoutMs` under 250 is a legal request for a single look rather than an error.
- `display_MouseClickBody` — `{ button: int=1, repeat: int=1, delay: int, window: int | string }`
  - `repeat` — Number of clicks. `repeat` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR` naming both fields. The count is never silently capped, so `repeat: 100` stays valid at `delay: 40` or less.
- `display_MouseMoveBody` — `{ x*: int, y*: int, window: int | string, screen: int, sync: bool }`
- `display_MouseScrollBody` — `{ direction*: "up" | "down" | "left" | "right", clicks: int=5, delay: int, x: int, y: int }`
  - `clicks` — Wheel clicks. `clicks` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR`; `clicks: 100` therefore needs `delay: 40` or less.
  - `x` — Scroll at this point instead of wherever the pointer happens to be. Must be given together with `y`. The move and the wheel events are sent as one chained command, so no other request can move the pointer in between.
  - `y` — Must be given together with `x`.
- `display_KeyboardTypeBody` — `{ text*: string, window: int | string, delay: int, clearModifiers: bool }`
  - `text` — … Each line is typed as one command and must fit its 4000 ms: its characters times `delay` (12 ms when not given; 0 counts as 1 ms), so 333 characters per line at the default delay, more with a lower one. The whole text must fit 25000 ms: all its characters times `delay`, plus 100 ms per line break (200 lines of a few characters fit at the default delay). Text over either bound is a 400 `VALIDATION_ERROR`: the message names the largest `delay` that fits when one does, and otherwise asks you to send at most 4000 characters per line or to split the text into several requests.
- `display_KeyboardKeyBody` — `{ keys*: string[], window: int | string, delay: int, clearModifiers: bool }`
  - `keys` — … Unknown names are a 400 `VALIDATION_ERROR` naming every one (with a very long list the message says "perhaps more" and that some other keys may not have been sent); otherwise the request's other keys, if it had any, were pressed. …
- `display_KeyboardKeyDownBody` — `{ key*: string, window: int | string, holdMs: int }`
  - `key` — Key name (X11 keysym, e.g. Shift_L, ctrl). Letters, digits, `_`, `+`, `-` and `.` only. Names of reserved commands are refused, in any letter case.
- `display_ClickAtBody` — `{ x*: int, y*: int, button: int=1, repeat: int=1, delay: int }`
- `display_TypeAtBody` — `{ x*: int, y*: int, text*: string, delay: int }`
  - `text` — … Each line is typed as one command and must fit its 4000 ms: its characters times `delay` (12 ms when not given; 0 counts as 1 ms), so 333 characters per line at the default delay, more with a lower one. The whole text must fit 25000 ms: all its characters times `delay`, plus 100 ms per line break (200 lines of a few characters fit at the default delay). Text over either bound is a 400 `VALIDATION_ERROR`: the message names the largest `delay` that fits when one does, and otherwise asks you to send at most 4000 characters per line or to split the text into several requests.
- `display_DragBody` — `{ startX*: int, startY*: int, endX*: int, endY*: int, button: int=1, steps: int }`
- `display_SelectBody` — `{ x*: int, y*: int, endX*: int, endY*: int }`
- `display_ActBody` — `{ action*: string, params: object, screenshot: bool=true, screenshotDelay: int=100, screenshotRegion: string }`
  - `action` — Action path. … `act` runs one action, so a rejection here IS a 400 `VALIDATION_ERROR` (inside `/input/batch` the same rejection is reported in the 200 body as `failed.error` instead).
  - `screenshotDelay` — Milliseconds to wait after the action before the screenshot is taken (0-5000)
  - `screenshotRegion` — Crop the screenshot to `x1,y1,x2,y2`, in screen coordinates: minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else is a 400 `VALIDATION_ERROR`, answered before the action runs. A cropped image carries no `dataUrl`.
- `display_WaitBody` — `{ ms*: int, screenshot: bool=false }`
- `display_BatchBody` — `{ actions*: { action*: string, params: object }[] }`
