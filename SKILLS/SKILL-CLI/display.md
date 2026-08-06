> _**CLI skill · `display` namespace** · ~5,816 tokens · hoody-sdk v1.0.0-beta.12_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `hoody display screenshots capture` (`base64=true` for vision).
2. `hoody display input click-at` / `hoody display input type-at`.
3. `hoody display screenshots capture-metadata` — cheap timestamp check.
4. Re-capture only when timestamp advanced.

### 2. Find and focus a window

1. `hoody display windows list` (`onlyVisible=true`).
2. `hoody display windows search` — name/class/classname.
3. `hoody display windows focus` / `hoody display windows raise`.
4. `hoody display windows geometry` — coords.
5. `hoody display windows active` — confirm.

### 3. Drag / select

1. `hoody display mouse move` — optional pre-position.
2. `hoody display input drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `hoody display input select` — click + shift-click.
4. `hoody display input reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `hoody display clipboard set` — `text`, optional `selection`.
2. `hoody display keyboard key` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `hoody display clipboard get` — read back after GUI copy.

### 5. Batch input replay

1. `hoody display input batch` — POST ordered actions.
2. `hoody display input wait` — interleave waits.
3. `hoody display screenshots capture` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (regex `^\d+$` at displayContext.ts:22, range check at :24); invalid silently falls through to host-derived id by :31.
- All endpoints except `health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; `base64=true` for JSON.
- `getByTimestamp` needs numeric `timestamp`, not `timestamp_human`.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Window IDs accept decimal or hex (`0x...`); returns decimal.
- `hoody display access` returns HTML, browser-only.
- SDK-only quirk: the screenshot-list accessor hangs off the namespace root (`hoody display screenshots list`), not the `screenshots` service — there is no `screenshots.list`.
- `hoody display info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the Xvfb canvas dimensions (those live on `hoody display input geometry`, see `inputRoutes.ts:499`).
- `hoody display input reset` clears stuck modifiers/buttons.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — X server for displayId unreachable; thrown by `inputService.parseError` (re-emitted by the input route handler) and also by the clipboard/window route handlers.
- `404` on `getByTimestamp` — no match. Refresh by calling `hoody display screenshots capture-metadata` (`/api/v1/display/screenshot/info`) — that endpoint **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `getByTimestamp` with the new ts. (`/screenshot/last/info`/`hoody display screenshots latest-metadata` only returns metadata for the *latest* screenshot — not a usable replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Every step in every example was live-tested against a real `display-1` kit driving an Xpra/X11 session inside a Hoody container. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and pick a `DID` (the active display id, e.g. `1`). The `display-1` in the kit URL is the kit instance, NOT the display id — `?displayId=N` (or `--display-id N`) selects the X server.

### 1. See-then-act loop — capture, click, re-capture, diff

**Goal:** snapshot the screen, click a coordinate, snapshot again, and use cheap metadata (`timestamp`) to detect that the second capture is fresh — typical inner loop for vision-driven agents.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
TS_BEFORE=$(hoody --container "$C" display screenshots capture-metadata --display-id 1 -o json | jq -r .timestamp)
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/before.b64
```
**Step 2 — click at `(75, 50)`.** `hoody display input click-at` moves AND clicks in one call; default `button=1` (left).

```bash
hoody --container "$C" display input click-at --display-id 1 --x 75 --y 50 --button 1
```
**Step 3 — cheap freshness check, then full re-capture only if the timestamp advanced.** `screenshot/info` returns metadata without the PNG bytes — much cheaper than a full capture for polling.

```bash
TS_AFTER=$(hoody --container "$C" display screenshots capture-metadata --display-id 1 -o json | jq -r .timestamp)
[ "$TS_AFTER" != "$TS_BEFORE" ] && hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/after.b64
```
### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `hoody display windows search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns just an array of `windowId` integers.

```bash
WID=$(hoody --container "$C" display windows search --display-id 1 \
  --pattern xeyes --name --class --classname -o json | jq -r '.windows[0]')
```
**Step 2 — focus + confirm.** `hoody display windows active` returns the currently focused id; compare with what you focused.

```bash
hoody --container "$C" display windows focus --display-id 1 --window-id "$WID"
hoody --container "$C" display windows active --display-id 1 -o json | jq -r .windowId
```
### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
hoody --container "$C" display input click-at --display-id 1 --x 120 --y 80
hoody --container "$C" display keyboard type --display-id 1 --text "hello world" --delay 20
```
`hoody display input type-at` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
hoody --container "$C" display input drag --display-id 1 \
  --start-x 50 --start-y 50 --end-x 200 --end-y 150 --button 1 --steps 20
```
If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `hoody display input reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. ⚠ See quirk: clipboard ops can fail with `CLIPBOARD_FAILED` / "no HOME directory" if the X session was launched without a writable `$HOME` for the kit user; verify by reading back the clipboard after the write.

**Step 1 — `hoody display clipboard set` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
hoody --container "$C" display clipboard set --display-id 1 --text "pasted via hoody" --selection clipboard
hoody --container "$C" display clipboard get --display-id 1 --selection clipboard
```
**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
hoody --container "$C" display keyboard key --display-id 1 --keys ctrl+v
```
### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
hoody --container "$C" display windows properties "$WID" --display-id 1 -o json | jq '.properties'
hoody --container "$C" display windows geometry "$WID" --display-id 1 -o json | jq '{x,y,width,height}'
```
`windowId` accepts decimal or hex (`0x...`); the response always normalises to decimal.

### 7. List visible windows with `onlyVisible` filter

**Goal:** enumerate everything mapped on screen (not iconified / withdrawn), pick the one with a name matching `xeyes`, no regex.

```bash
hoody --container "$C" display windows list --display-id 1 --only-visible -o json \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```
Each item carries `windowId`, `name`, `class` (the WM_CLASS pair as 2 strings), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) atomically. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The response lists every step with success/failure indexed back to the request order.

```bash
# The generated CLI exposes NO flag for the actions array (only --display-id) — run
# the sequence as per-step `input act` calls, or POST the batch over HTTP:
hoody --container "$C" display input act --display-id 1 --action mouse/move  --params x=120 --params y=80
hoody --container "$C" display input act --display-id 1 --action input/wait  --params ms=150
hoody --container "$C" display input act --display-id 1 --action mouse/click --params button=1
hoody --container "$C" display input act --display-id 1 --action keyboard/type --params text=replayed --params delay=15
```
`hoody display input wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `hoody display input batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `hoody display input geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
hoody --container "$C" display info --display-id 1 -o json
hoody --container "$C" display input geometry --display-id 1 -o json
```
Note: the geometry returned is the underlying Xvfb canvas (often `8192x4096` for Hoody Xpra sessions), not a physical monitor size. Click coordinates are in this canvas space.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `hoody display keyboard key-down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `hoody display input reset` releases everything in one call.

```bash
hoody --container "$C" display input reset --display-id 1
```
Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `hoody display` (48) — Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display access` |  | read | Access the HTML5 Display client interface | `display.accessClient` | `hoody display access --display-id 10 --decorations --toolbar --menu --maximize-new-windows --readonly --dark-mode --node node-abc --project-id abc-123 --container-id abc-123 --url-display-id abc-123 --ssl --webtransport --path / --action connect --display :0 --encoding auto --offscreen --bandwidth-limit 0 --override-width auto --override-height auto --vrefresh=-1 --suspend-inactive-tab --sound --audio-codec <audio_codec> --keyboard --keyboard-layout us --swap-keys --clipboard --clipboard-preferred-format text/plain --clipboard-poll --printing --file-transfer --video --mediasource-video --open-url --notification-server-url https://example.com --web-notifications --display-notifications --notification-connection-type websocket --sharing --steal --reconnect --floating-menu --clock --scroll-reverse-y auto --scroll-reverse-x --title-show-hoody --title-show-display-id --app firefox --remote-logging --insecure --debug-main --debug-keyboard --debug-geometry --debug-mouse --debug-clipboard --debug-draw --debug-audio --debug-network --debug-file` |
| `hoody display clipboard get` |  | read | Read clipboard text | `display.getClipboard` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.setClipboard` | `hoody display clipboard set --display-id 10 --text "Hello" --selection clipboard` |
| `hoody display health` |  | read | Service health check | `display.health.check` | `hoody display health` |
| `hoody display info` |  | read | Get display information and screenshots | `display.getInformation` | `hoody display info --display-id 10` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action <action> --params <key=value> --screenshot --screenshot-delay 100 --screenshot-region <screenshot_region>` |
| `hoody display input batch` |  | write | Execute a sequence of actions | `display.input.batch` | `hoody display input batch --display-id 10` |
| `hoody display input click-at` |  | write | Move cursor and click | `display.input.clickAt` | `hoody display input click-at --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1 --steps 10` |
| `hoody display input geometry` |  | read | Get display dimensions | `display.input.geometry` | `hoody display input geometry --display-id 10` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type-at` |  | write | Move, click, and type in one operation | `display.input.typeAt` | `hoody display input type-at --display-id 10 --x 10 --y 10 --text "Hello" --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard key` |  | write | Press key combinations | `display.input.keyboardKey` | `hoody display keyboard key --display-id 10 --keys <keys> --window 100 --delay 10 --clear-modifiers` |
| `hoody display keyboard key-down` |  | write | Hold a key down | `display.input.keyboardKeyDown` | `hoody display keyboard key-down --display-id 10 --key <key> --window 100 --hold-ms 100` |
| `hoody display keyboard key-up` |  | write | Release a held key | `display.input.keyboardKeyUp` | `hoody display keyboard key-up --display-id 10 --key <key> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.input.keyboardType` | `hoody display keyboard type --display-id 10 --text "Hello" --window 100 --delay 10 --clear-modifiers` |
| `hoody display mouse click` |  | write | Click a mouse button | `display.input.mouseClick` | `hoody display mouse click --display-id 10 --button 1 --repeat 1 --delay 10 --window 100` |
| `hoody display mouse double-click` |  | write | Double-click a mouse button | `display.input.mouseDoubleClick` | `hoody display mouse double-click --display-id 10 --button 1 --window 100` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.input.mouseDown` | `hoody display mouse down --display-id 10 --button 1 --window 100 --hold-ms 100` |
| `hoody display mouse location` |  | read | Get cursor position | `display.input.mouseLocation` | `hoody display mouse location --display-id 10` |
| `hoody display mouse move` |  | write | Move cursor to absolute position | `display.input.mouseMove` | `hoody display mouse move --display-id 10 --x 10 --y 10 --window 100 --screen 10 --sync` |
| `hoody display mouse move-relative` |  | write | Move cursor by offset | `display.input.mouseMoveRelative` | `hoody display mouse move-relative --display-id 10 --x 10 --y 10 --sync` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.input.mouseScroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.input.mouseUp` | `hoody display mouse up --display-id 10 --button 1 --window 100` |
| `hoody display open` | browse | action | Open the Display kit service in your browser |  | `hoody display open [index] [--decorations]` |
| `hoody display screenshots by-timestamp` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.getByTimestamp` | `hoody display screenshots by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot | `display.screenshots.capture` | `hoody display screenshots capture --base64 --display-id 10` |
| `hoody display screenshots capture-metadata` |  | read | Capture screenshot and return metadata only | `display.screenshots.captureMetadata` | `hoody display screenshots capture-metadata --display-id 10` |
| `hoody display screenshots latest` |  | read | Retrieve the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest --base64 --display-id 10` |
| `hoody display screenshots latest-metadata` |  | read | Get metadata for the most recent screenshot | `display.screenshots.getLatestMetadata` | `hoody display screenshots latest-metadata --display-id 10` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.listScreenshots` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails by-timestamp` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.getByTimestamp` | `hoody display thumbnails by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails latest` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest --base64 --display-id 10` |
| `hoody display windows active` |  | read | Get the active window ID | `display.input.windowActive` | `hoody display windows active --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.input.windowClose` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.input.windowFocus` | `hoody display windows focus --display-id 10 --window-id 100` |
| `hoody display windows geometry` |  | read | Get window position and size | `display.input.windowGeometry` | `hoody display windows geometry 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.listWindows` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.input.windowMinimize` | `hoody display windows minimize --display-id 10 --window-id 100` |
| `hoody display windows move` |  | write | Move a window | `display.input.windowMove` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync --relative` |
| `hoody display windows name` |  | read | Get window title | `display.input.windowName` | `hoody display windows name 1 --display-id 10` |
| `hoody display windows properties` |  | read | Get extended properties for a window | `display.getWindowProperties` | `hoody display windows properties 1 --display-id 10` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.input.windowRaise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.input.windowResize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync --use-hints` |
| `hoody display windows search` |  | write | Search for windows by pattern | `display.input.windowSearch` | `hoody display windows search --display-id 10 --pattern "TODO" --name --class --classname --only-visible` |

