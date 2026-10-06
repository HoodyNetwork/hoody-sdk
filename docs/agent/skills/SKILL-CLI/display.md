> _**CLI skill · `display` namespace** · ~6,452 tokens · hoody-sdk v1.0.0-beta.15_

# `display` — programmatic GUI desktops with screenshots, input, and windows

## Purpose

Per-container HTML5 desktop (X11 via proxy): screenshots, input, windows, clipboard.

## When to use

- Click/type/drag/scroll at coords; screenshots/thumbnails for vision; X11 window ops; clipboard r/w.
- **Multiple GUI apps → one display (one `terminal_id`) per app (almost always the right call).** A single X display *can* host many windows, but giving each app its own display (`display: ":N"` paired to a distinct `terminal_id`) gives each its own `display-<N>` kit URL — a dedicated full-surface stream you can screenshot, embed / iframe, and route input to **independently, per window** — with no window-search / focus juggling on a shared display. Pin matching ids (`terminal_id=1`↔`:1`, `terminal_id=2`↔`:2`, …) so the routing stays one-to-one. Reuse a single display only when you deliberately want the apps composited together (e.g. a full desktop — see the `desktop-<N>` alias).

## When NOT to use

Not for: shell → `terminal`/`exec`, files → `files`, headless web → `browser`, toasts → `notifications`.

## Prerequisites

- Active X11 display (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"`: the create call takes `display` from the request body only, and no `terminal_id` value ever implies a `DISPLAY`. (A session the terminal kit has to create on demand for a command is configured from the request URL instead, where a `terminal-N` host already supplies `display=N`.) On `hoody terminal sessions create` the flag is `--display N`.
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `hoody display screenshots capture` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `hoody display input click` / `hoody display input type` at root-window coordinates (on a seamless session these differ from screenshot pixels; see Quirks).
3. `hoody display screenshots capture` again to see the result. There is no cheap change check: `hoody display screenshots capture` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `hoody display windows list` (`onlyVisible` on).
2. `hoody display windows search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). Add `-o json` to the list and search commands to get the full response, window ids included.
3. `hoody display windows focus` with `sync` on (or `hoody display windows raise`). Read `details.inputFocus` in the focus response: `false` means the window was activated but is not viewable, so keyboard input cannot reach it.
4. `hoody display windows geometry get` — coords.
5. `hoody display windows active get` — confirms activation only, not keyboard focus.

### 3. Drag / select

1. `hoody display mouse move` — optional pre-position.
2. `hoody display input drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `hoody display input select` — click + shift-click.
4. `hoody display input reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `hoody display clipboard set` — `text`, optional `selection`.
2. `hoody display keyboard press` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `hoody display clipboard get` — read back after GUI copy.

### 5. Batch input replay

1. `hoody display input batch act` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. Add `-o json` to get the full result body. When the body says `success: false`, the command still prints it, then writes `✗ … reported success: false` to stderr and exits 1.
2. `hoody display input wait` — interleave waits.
3. `hoody display screenshots capture` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead.
- All endpoints except `hoody display health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; turn `base64` on for JSON.
- `hoody display screenshots get` needs numeric `timestamp`, not `timestamp_human`.
- **A screenshot pixel is not always a click coordinate.** A seamless session captures only the windows it shows, so the capture's origin is the top-left of their bounding box, while `hoody display input click` and the other pointer calls take root-window coordinates. When the shown windows do not start at (0,0), add the capture origin (the smallest `x` and `y` among the shown windows' "geometry" objects in the `hoody display windows list` response) to a point picked on the screenshot, or use `hoody display windows geometry get` to target a window directly.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED`, carrying a shortened tool error; read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `hoody display windows list`, `hoody display windows search` and `hoody display windows active get` return decimal numbers; the path-parameter routes (`hoody display windows get`, `hoody display windows geometry get`, `hoody display windows title get`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.
- `hoody display windows focus` activates the window and then tries to give it X input focus. The second step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. `hoody display windows active get` confirms the activation only.
- `GET /api/v1/display/` (HTTP only; no CLI command) returns HTML, browser-only.
- `hoody display get` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `hoody display geometry get`). 
- `hoody display input reset` clears stuck modifiers/buttons.
- `hoody display windows wait` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `hoody display windows restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `500 INPUT_ACTION_FAILED`. With `sync: false` the answer has `state: null`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `hoody display screenshots get` — no stored capture has that timestamp. Refresh by calling `hoody display screenshots capture`, which **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `hoody display screenshots get` with the new timestamp. (`hoody display screenshots latest get` only returns metadata for the *latest* stored screenshot, which is not a replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The `N` in the `display-N` kit hostname is the display id, so `display-1` addresses display 1; `--display-id N` overrides it. The examples pass `displayId=1` explicitly, matching the host.

### 1. See-then-act loop — capture, click, re-capture

**Goal:** capture the screen, click a coordinate, capture again — the typical inner loop for vision-driven agents. Each capture with `base64` on returns the image and its metadata in one response, so no separate metadata call is needed. `info.timestamp` is the capture time in whole seconds; two captures in the same second share it, so it cannot tell you whether the screen changed.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json > /tmp/before.json
jq -r .info.timestamp /tmp/before.json
jq -r .image.data /tmp/before.json > /tmp/before.b64
```

**Step 2 — click at `(75, 50)`.** `hoody display input click` moves AND clicks in one call; default `button=1` (left).

```bash
hoody --container "$C" display input click --display-id 1 --x 75 --y 50 --button 1
```

**Step 3 — capture again and give the new image to the vision model.** `hoody display screenshots capture` is not a cheaper probe: it takes a full capture too and only leaves the image bytes out of the response.

```bash
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/after.b64
```

### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `hoody display windows search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns an object whose `windows` field is an array of numeric window ids.

```bash
WID=$(hoody --container "$C" display windows search --display-id 1 \
  --pattern xeyes --name --class --classname -o json | jq -r '.windows[0]')
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (no viewer attached, or unmapped), so keyboard input cannot reach it. `hoody display windows active get` reports the active window, which confirms the activation only.

```bash
hoody --container "$C" display windows focus --display-id 1 --window-id "$WID" --sync -o json \
  | jq -r .details.inputFocus        # true = keyboard input will reach the window
hoody --container "$C" display windows active get --display-id 1 -o json | jq -r .windowId
```

### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
hoody --container "$C" display input click --display-id 1 --x 120 --y 80
hoody --container "$C" display keyboard type --display-id 1 --text "hello world" --delay 20
```

`hoody display input type` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
hoody --container "$C" display input drag --display-id 1 \
  --start-x 50 --start-y 50 --end-x 200 --end-y 150 --button 1 --steps 20
```

If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `hoody display input reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. Clipboard calls can fail with `CLIPBOARD_FAILED` (see Quirks), so read the clipboard back after the write.

**Step 1 — `hoody display clipboard set` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
hoody --container "$C" display clipboard set --display-id 1 --text "pasted via hoody" --selection clipboard
hoody --container "$C" display clipboard get --display-id 1 --selection clipboard
```

**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
hoody --container "$C" display keyboard press --display-id 1 --keys ctrl+v
```

### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
hoody --container "$C" display windows get "$WID" --display-id 1 -o json | jq '.properties'
hoody --container "$C" display windows geometry get "$WID" --display-id 1 -o json | jq '{x,y,width,height}'
```

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; only the list, search and active-window calls return decimal numbers.

### 7. List visible windows with `onlyVisible` filter

**Goal:** list the window manager's windows minus the minimized ones, then pick the one named `xeyes`, no regex. `onlyVisible` only drops windows marked `_NET_WM_STATE_HIDDEN`; it does not test whether a window is actually mapped or viewable (the list is also capped at 200 windows).

```bash
hoody --container "$C" display windows list --display-id 1 --only-visible -o json \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```

Each item carries `windowId`, `name`, `class` (the WM_CLASS instance/class pair when it can be read, otherwise an empty array), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) in one request. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The actions run in order and the batch stops at the first failure; nothing is rolled back, so actions before it have already taken effect. A failed action is still HTTP 200: check `success`, then `completed` (the actions that ran), `failed` (`{index, action, error}`) and `skipped`.

```bash
# --actions takes a file holding the actions ARRAY (not the {"actions": ...} wrapper):
cat > /tmp/actions.json <<'JSON'
[
  {"action":"mouse/move",   "params":{"x":120,"y":80}},
  {"action":"input/wait",   "params":{"ms":150}},
  {"action":"mouse/click",  "params":{"button":1}},
  {"action":"keyboard/type","params":{"text":"replayed","delay":15}}
]
JSON
hoody --container "$C" display input batch act --display-id 1 --actions @/tmp/actions.json -o json \
  | jq '{success, failed, skipped}'
```

`hoody display input wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `hoody display input batch act`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `hoody display geometry get` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
hoody --container "$C" display get --display-id 1 -o json
hoody --container "$C" display geometry get --display-id 1 -o json
```

Note: the geometry returned is the display's virtual screen (often `8192x4096`), not a physical monitor size. Pointer coordinates (`hoody display input click` and the rest) are in this root-window space. A screenshot of a seamless session can start at a different origin, so a point picked on a screenshot may need an offset first (see Quirks).

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `hoody display keyboard down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `hoody display input reset` releases everything in one call.

```bash
hoody --container "$C" display input reset --display-id 1
```

Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `hoody display` (49) — Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display clipboard get` |  | read | Read clipboard text | `display.clipboard.get` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.clipboard.set` | `hoody display clipboard set --display-id 10 --text Hello --selection clipboard` |
| `hoody display geometry get` |  | read | Get display dimensions | `display.getGeometry` | `hoody display geometry get --display-id 10` |
| `hoody display get` |  | read | Get display information and screenshots | `display.get` | `hoody display get --display-id 10` |
| `hoody display health` |  | read | Service health check | `display.kit.getHealth` | `hoody display health` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action mouse/click --screenshot` |
| `hoody display input batch act` |  | write | Execute a sequence of actions | `display.input.actMany` | `hoody display input batch act --display-id 10 --actions @path.json` |
| `hoody display input click` |  | write | Move cursor and click | `display.input.click` | `hoody display input click --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type` |  | write | Move, click, and type in one operation | `display.input.type` | `hoody display input type --display-id 10 --x 10 --y 10 --text Hello --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard down` |  | write | Hold a key down | `display.keyboard.down` | `hoody display keyboard down --display-id 10 --key Shift_L --window 100` |
| `hoody display keyboard press` |  | write | Press key combinations | `display.keyboard.press` | `hoody display keyboard press --display-id 10 --keys <keys> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.keyboard.type` | `hoody display keyboard type --display-id 10 --text Hello --window 100` |
| `hoody display keyboard up` |  | write | Release a held key | `display.keyboard.up` | `hoody display keyboard up --display-id 10 --key <key> --window 100` |
| `hoody display mouse click` |  | write | Click a mouse button | `display.mouse.click` | `hoody display mouse click --double --display-id 10` |
| `hoody display mouse click` |  | write | Double-click a mouse button | `display.mouse.doubleClick` | `hoody display mouse click --double --display-id 10` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.mouse.down` | `hoody display mouse down --display-id 10 --button 1` |
| `hoody display mouse move` |  | write | Move the cursor to an absolute position | `display.mouse.move` | `hoody display mouse move --relative --display-id 10 --x 10 --y 10` |
| `hoody display mouse move` |  | write | Move the cursor by an offset from its current position | `display.mouse.moveBy` | `hoody display mouse move --relative --display-id 10 --x 10 --y 10` |
| `hoody display mouse position get` |  | read | Get cursor position | `display.mouse.getPosition` | `hoody display mouse position get --display-id 10` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.mouse.scroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.mouse.up` | `hoody display mouse up --display-id 10 --button 1` |
| `hoody display open` |  | action | Open the Display kit service in your browser |  | `hoody display open` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot | `display.screenshots.capture` | `hoody display screenshots capture --metadata --base64` |
| `hoody display screenshots capture` |  | read | Capture a screenshot and return only its metadata | `display.screenshots.capture` | `hoody display screenshots capture --metadata --base64` |
| `hoody display screenshots get` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.get` | `hoody display screenshots get 1749541160 --base64 --display-id 10` |
| `hoody display screenshots latest get` |  | read | Retrieve the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest get --metadata --base64` |
| `hoody display screenshots latest get` |  | read | Get only the metadata of the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest get --metadata --base64` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.screenshots.list` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails get` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.get` | `hoody display thumbnails get 1749541160 --base64 --display-id 10` |
| `hoody display thumbnails latest get` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest get --base64 --display-id 10` |
| `hoody display windows active get` |  | read | Get the active window ID | `display.windows.getActive` | `hoody display windows active get --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.windows.close` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.windows.focus` | `hoody display windows focus --display-id 10 --window-id 100 --sync` |
| `hoody display windows geometry get` |  | read | Get window position and size | `display.windows.getGeometry` | `hoody display windows geometry get 1 --display-id 10` |
| `hoody display windows get` |  | read | Get extended properties for a window | `display.windows.get` | `hoody display windows get 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.windows.list` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.windows.minimize` | `hoody display windows minimize --display-id 10 --window-id 100 --sync` |
| `hoody display windows move` |  | write | Move a window | `display.windows.move` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.windows.raise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.windows.resize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync` |
| `hoody display windows restore` |  | write | Restore (un-minimize) a window | `display.windows.restore` | `hoody display windows restore --display-id 10 --window-id 100 --sync` |
| `hoody display windows search` |  | read | Search for windows by pattern | `display.windows.search` | `hoody display windows search --display-id 10 --pattern TODO --name` |
| `hoody display windows title get` |  | read | Get window title | `display.windows.getTitle` | `hoody display windows title get 1 --display-id 10` |
| `hoody display windows wait` |  | read | Wait for a window to appear or disappear | `display.windows.wait` | `hoody display windows wait --display-id 10 --condition window-present --pattern Firefox` |

