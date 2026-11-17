> _**SDK skill · `display` namespace** · ~15,431 tokens · hoody-sdk v1.0.1_

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

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `screenshots.capture` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `input.click` / `input.type` at a point picked on that screenshot: a screenshot spans the whole screen, so its pixel (x, y) is the point (x, y) these act on.
3. `screenshots.capture` again to see the result. There is no cheap change check: `screenshots.capture` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `windows.list` (`onlyVisible` on).
2. `windows.search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). 
3. `windows.focus` with `sync` on. Read `details.inputFocus` in the response: proceed with keyboard input only when it is `true`. `false` means the window was activated but is not viewable, so keyboard input cannot reach it. `windows.raise` is not a substitute for focusing.
4. `windows.getGeometry` — coords.
5. `windows.getActive` — confirms activation only, not keyboard focus.

`windows.list` and `windows.getActive` need a window manager on a running display: `409 NO_WINDOW_MANAGER` means none is running, and retrying does not help. (A parked display answers `windows.list` with an empty list and is not started.) Without one, `windows.focus` can still give a viewable window keyboard focus: check `details.inputFocus`, and `details.warning` then says the window was not activated or raised (and `windows.getActive` cannot report it); it answers `409 NO_WINDOW_MANAGER` only when the window cannot take focus either. Start a window manager (for example a desktop session), or use `windows.search`, window geometry and name queries, and mouse and keyboard actions, which work without one.

### 3. Drag / select

1. `mouse.move` — optional pre-position.
2. `input.drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `input.select` — click + shift-click.
4. `input.reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `clipboard.set` — `text`, optional `selection`.
2. `keyboard.press` — `["ctrl+v"]` (`["shift+Insert"]` if step 1 set `selection: "primary"`).
3. `clipboard.get` — read back after GUI copy.

### 5. Batch input replay

1. `input.actMany` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. 
2. `input.wait` — interleave waits.
3. `screenshots.capture` — confirm.

### 6. Press a key or a key combination

1. `keyboard.press` with `keys`, a list of up to 20 combinations pressed in turn: `["Return"]`, `["Escape"]`, `["ctrl+l"]`, `["ctrl+shift+t"]`, `["Tab", "Down", "Return"]`. Names are X keysym names (`Return`, `Escape`, `Tab`, `BackSpace`, `Delete`, `Up`/`Down`/`Left`/`Right`, `Home`, `End`, `Page_Up`, `F1`…) joined to modifiers (`ctrl`, `shift`, `alt`, `super`) with `+`. 
2. To submit typed text, end it with a line break instead: in `keyboard.type` and `input.type`, `\n` presses Return.
3. `keyboard.down` / `keyboard.up` hold and release one key. To release a hold made with a `window` through `keyboard.up`, pass the same `window`. `input.reset` releases every hold, those made with a `window` included.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); over raw HTTP an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead; the SDK refuses such a value with a `ValidationError` before sending.
- All endpoints except `kit.getHealth` and the HTML client page at the service root need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Requests for a screenshot image return binary PNG; turn `base64` on for JSON. Metadata-only requests and the screenshot list return JSON and take no `base64`.
- `screenshots.get` takes a string containing the capture's `timestamp` (Unix seconds, or milliseconds, microseconds or nanoseconds), a date such as its `timestamp_human`, its file name or stem, or `latest`/`newest`. A file name or stem identifies one capture even when captures share a second. An unparseable value returns `400 VALIDATION_ERROR`.
- **A screenshot pixel is a click coordinate.** A screenshot spans the whole screen at its current size, read from the windows as they are when it is taken, so pixel (x, y) is the point `input.click` and the other pointer calls act on at (x, y). Where no window is, the image is transparent. A `region` crop starts at its `x1,y1`: add them to a point picked on the crop. Take a new screenshot after a viewer attaches: the screen then takes the viewer's size and the windows move.
- `input.click` and `input.type` refuse a point with no viewable window with `409 WINDOW_NOT_VIEWABLE` and click nothing. That is a point on the bare desktop between windows, or on a hidden window (for example one minimized in a viewer) (unless an open menu takes the click). Pick a point on a window in a fresh screenshot (restore a hidden window with `windows.restore` first).
- A line break in `text` (`\n`, `\r\n` or `\r`) presses Return in `keyboard.type` and `input.type`, so `"https://example.com\n"` types the address and submits it; `\t` presses Tab. Every other key or combination (Escape, ctrl+l, arrows) goes through `keyboard.press`.
- `input.click` refuses a point outside the display's current size with `400 VALIDATION_ERROR` instead of clicking the screen edge, and its `details.pointer` reports where the pointer was after the click and the window under it (`x`, `y`, `window`). A `200` means the click was delivered there, not that the program acted on it: take a new screenshot to see the effect.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED` (`details.message`: "The clipboard could not be read or written"); read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `windows.list`, `windows.search` and `windows.getActive` return decimal numbers, as does `details.windowId` of `windows.restore`; the path-parameter routes (`windows.get`, `windows.getGeometry`, `windows.getTitle`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.
- `windows.focus` tries to activate the window and then to give it keyboard focus; without a window manager it can give a viewable window keyboard focus without activating it (`details.inputFocus: true` with a `warning`). With a window manager, the keyboard-focus step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. Without a window manager, a non-viewable window's focus refusal answers `409 NO_WINDOW_MANAGER`. `windows.getActive` confirms the activation only.
- The HTML5 client page has no SDK method. Build its URL with `client.embeds.display.client()` on a client scoped to one computer (`withComputer()`), and open it or put it in an iframe. On an unscoped client pass the computer as the first argument (`client.embeds.display.client(computer)`); without one the call throws `TARGET_INVALID`.
- List stored screenshots with `client.display.screenshots.list({ displayId: 1 })`; the list method belongs to the `screenshots` service.
- `display.get` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `display.getGeometry`).
- `input.reset` clears stuck modifiers/buttons.
- `windows.wait` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `windows.restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `409 SYNC_TIMEOUT`. With `sync: false` the answer's `details.state` is `null`, unless the window was already normal: that no-op answers `details.state: "normal"` with `details.synced: true`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `screenshots.get` — no stored capture has that timestamp. Refresh by calling `screenshots.capture`, which **takes a fresh screenshot** (with `base64` on, the response carries its `info.timestamp`), then retry `screenshots.get` with the new timestamp. `screenshots.getLatest` returns the latest stored image by default; its metadata-only form (`getLatest({ metadata: true })`) returns only that image's metadata. Neither takes a fresh screenshot, so neither replaces a missed timestamp.

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first. The number in the `display-D` kit hostname is the display id `D`, so `display-1` addresses display 1; `displayId: D` in the options object overrides it. The examples pass `displayId=1` explicitly, matching the host.

### 1. See-then-act loop — capture, click, re-capture

**Goal:** capture the screen, click a coordinate, capture again — the typical inner loop for vision-driven agents. Each capture with `base64` on returns the image and its metadata in one response, so no separate metadata call is needed. `info.timestamp` is the capture time in whole seconds; two captures in the same second share it, so it cannot tell you whether the screen changed.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```typescript
const shot = await client.display.screenshots.capture({ displayId: 1, base64: true });
const before = shot.data as any;           // { info: { timestamp, full, ... }, image: { data, ... } }
const b64 = before.image.data;
```

**Step 2 — click at `(75, 50)`.** `input.click` moves AND clicks in one call; default `button=1` (left).

```typescript
await client.display.input.click({ x: 75, y: 50, button: 1 }, { displayId: 1 });
```

**Step 3 — capture again and give the new image to the vision model.** With `base64` on, `screenshots.capture` returns the fresh image and its metadata. There is no cheaper probe: the metadata-only form (`metadata: true`) still takes a full screenshot and only leaves the image bytes out.

```typescript
const fresh = await client.display.screenshots.capture({ displayId: 1, base64: true });
// … feed (fresh.data as any).image.data to your vision model
```

### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `windows.search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns an object whose `windows` field is an array of numeric window ids.

```typescript
const search = await client.display.windows.search(
  { pattern: 'xeyes', name: true, class: true, classname: true },
  { displayId: 1 },
);
const wid = search.data!.windows?.[0];   // a number: body fields take it as-is
if (wid === undefined) throw new Error('No window matched xeyes');
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (hidden, for example minimized in a viewer), so keyboard input cannot reach it. `windows.getActive` reports the active window, which confirms the activation only.

```typescript
const focus = await client.display.windows.focus({ windowId: wid, sync: true }, { displayId: 1 });
console.log('keyboard focus:', focus.data!.details?.inputFocus === true);
const active = await client.display.windows.getActive({ displayId: 1 });
console.log('active:', active.data!.windowId === wid);
```

### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```typescript
await client.display.input.click({ x: 120, y: 80 }, { displayId: 1 });
await client.display.keyboard.type({ text: 'hello world', delay: 20 }, { displayId: 1 });
```

`input.type` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`. End `text` with `\n` to press Return after it (to submit a form or an address bar).

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

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. Clipboard calls can fail with `CLIPBOARD_FAILED` (see Quirks), so read the clipboard back after the write.

**Step 1 — `clipboard.set` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```typescript
await client.display.clipboard.set({ text: 'pasted via hoody', selection: 'clipboard' }, { displayId: 1 });
const r = await client.display.clipboard.get({ displayId: 1, selection: 'clipboard' });
console.log(r.data!.text);
```

**Step 2 — Ctrl+V into the focused window.** `keys` is an array. For an application that pastes from PRIMARY, write and verify the text with `selection: "primary"` in step 1, then pass `["shift+Insert"]`.

```typescript
await client.display.keyboard.press({ keys: ['ctrl+v'] }, { displayId: 1 });
```

### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```typescript
// Path-parameter methods take the id as a string:
const props = await client.display.windows.get(String(wid), { displayId: 1 });
const geom = await client.display.windows.getGeometry(String(wid), { displayId: 1 });
console.log(props.data!.properties?.wmClass, geom.data);
```

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; the list, search and active-window calls return decimal numbers, and `windows.restore` returns `details.windowId` as a number.

### 7. List visible windows with `onlyVisible` filter

**Goal:** list the window manager's windows minus the minimized ones, then pick the one named `xeyes`, no regex. `onlyVisible` only drops windows marked `_NET_WM_STATE_HIDDEN`; it does not test whether a window is actually mapped or viewable (the list is also capped at 200 windows).

```typescript
const r = await client.display.windows.list({ displayId: 1, onlyVisible: true });
const xeyes = r.data!.windows?.find(w => w.name === 'xeyes');
console.log(xeyes);
```

Each item carries `windowId`, `name`, `class` (the WM_CLASS instance/class pair when it can be read, otherwise an empty array), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) in one request. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The actions run in order and the batch stops at the first failure; nothing is rolled back, so actions before it have already taken effect. A failed action is still HTTP 200: check `success`, then `completed` (the actions that ran), `failed` (`{index, action, error}`) and `skipped`.

```typescript
await client.display.input.actMany(
  {
    actions: [
      { action: 'mouse/move',    params: { x: 120, y: 80 } },
      { action: 'input/wait',    params: { ms: 150 } },
      { action: 'mouse/click',   params: { button: 1 } },
      { action: 'input/wait',    params: { ms: 150 } },
      { action: 'keyboard/type', params: { text: 'replayed', delay: 15 } },
    ],
  },
  { displayId: 1 },
);
```

`input.wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `input.actMany`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `display.getGeometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```typescript
const info = await client.display.get({ displayId: 1 });
const geom = await client.display.getGeometry({ displayId: 1 });
console.log(geom.data!.width, geom.data!.height);
```

Note: the geometry is the display's current virtual screen size. It may start at `8192x4096`; a viewer can resize it, and the resized size can persist after the viewer detaches. Read it again after a viewer attaches or resizes. Pointer coordinates (`input.click` and the rest) are in this screen space. An uncropped full-screen screenshot uses the same coordinates; for a screenshot captured with `region`, add the region's `x1` and `y1` to image coordinates before using them as pointer coordinates.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `keyboard.down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `input.reset` releases, in one call, every key and button held through this API (a hold made with a `window` is released to that window as well), the Shift / Ctrl / Alt / Super / Meta keys, and mouse buttons 1-5. A button 6 or 7 that something else left pressed is not among them: release it with a mouse up on that button.

```typescript
await client.display.input.reset(undefined, { displayId: 1 });
```

Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

**Accessor:** `client.display`  |  **Import:** `import * as display from 'hoody-sdk/display'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.display.clipboard.get()` returns `Promise<DisplayClipboardGetResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.display.windows`: close, focus, get, getActive, getGeometry, getTitle, list, minimize, move, raise, resize, restore, search, wait
- `client.display`: get, getGeometry
- `client.display.input`: act, actMany, click, drag, reset, select, type, wait
- `client.display.screenshots`: capture, get, getLatest, list, save
- `client.display.clipboard`: get, set
- `client.display.keyboard`: down, press, type, up
- `client.display.kit`: getHealth
- `client.display.mouse`: click, doubleClick, down, getPosition, move, moveBy, scroll, up
- `client.display.thumbnails`: capture, get, getLatest

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

### `client.display.windows` (14) — Window management operations

**Shared parameters of `client.display.windows`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `windowId` | `string` | path | Yes | Window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits |

#### `close` — Close a window

```typescript
client.display.windows.close(data: DisplayWindowsCloseRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsCloseRequest` | body | Yes | Shape: `WindowIdBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/close`
**CLI:** `hoody display windows close <window-id>`

---

#### `focus` — Focus/activate a window

```typescript
client.display.windows.focus(data: DisplayWindowsFocusRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsFocusRequest` | body | Yes | Shape: `WindowSyncBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/focus`
**CLI:** `hoody display windows focus <window-id>`

---

#### `get` — Get extended properties for a window

```typescript
client.display.windows.get(windowId: string, options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/window/{windowId}/properties`
**CLI:** `hoody display windows get <window-id>`

---

#### `getActive` — Get the active window ID

```typescript
client.display.windows.getActive(options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/window/active`
**CLI:** `hoody display windows active get`

---

#### `getGeometry` — Get window position and size

```typescript
client.display.windows.getGeometry(windowId: string, options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/window/{windowId}/geometry`
**CLI:** `hoody display windows geometry get <window-id>`

---

#### `getTitle` — Get window title

```typescript
client.display.windows.getTitle(windowId: string, options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/window/{windowId}/name`
**CLI:** `hoody display windows title get <window-id>`

---

#### `list` — List windows on the current display

```typescript
client.display.windows.list(options?: { displayId?: number; onlyVisible?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `onlyVisible` | `boolean` | query | No | Drop windows carrying `_NET_WM_STATE_HIDDEN`. A minimized window carries that state, so this does exclude minimized windows. This is a different test from the `onlyVisible` on `window/search` and `input/wait-until`, which ask the X server whether the window is viewable and still match a minimized one. |

**HTTP:** `GET /api/v1/display/windows`
**CLI:** `hoody display windows list`

---

#### `minimize` — Minimize a window

```typescript
client.display.windows.minimize(data: DisplayWindowsMinimizeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsMinimizeRequest` | body | Yes | Shape: `WindowSyncBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/minimize`
**CLI:** `hoody display windows minimize <window-id>`

---

#### `move` — Move a window

```typescript
client.display.windows.move(data: DisplayWindowsMoveRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsMoveRequest` | body | Yes | Shape: `WindowMoveBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/move`
**CLI:** `hoody display windows move <window-id> --x <x> --y <y>`

---

#### `raise` — Raise a window to the top

```typescript
client.display.windows.raise(data: DisplayWindowsRaiseRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsRaiseRequest` | body | Yes | Shape: `WindowIdBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/raise`
**CLI:** `hoody display windows raise <window-id>`

---

#### `resize` — Resize a window

```typescript
client.display.windows.resize(data: DisplayWindowsResizeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsResizeRequest` | body | Yes | Shape: `WindowResizeBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/resize`
**CLI:** `hoody display windows resize <window-id> --width <width> --height <height>`

---

#### `restore` — Restore (un-minimize) a window

```typescript
client.display.windows.restore(data: DisplayWindowsRestoreRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsRestoreRequest` | body | Yes | Shape: `WindowRestoreBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/restore`
**CLI:** `hoody display windows restore <window-id>`

---

#### `search` — Search for windows by pattern

```typescript
client.display.windows.search(data: DisplayWindowsSearchRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsSearchRequest` | body | Yes | Shape: `WindowSearchBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/window/search`
**CLI:** `hoody display windows search --pattern <pattern>`

---

#### `wait` — Wait for a window to appear or disappear

```typescript
client.display.windows.wait(data: DisplayWindowsWaitRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayWindowsWaitRequest` | body | Yes | Shape: `WaitUntilBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/wait-until`
**CLI:** `hoody display windows wait --condition <condition>`

---

### `client.display` (2) — Display information and management

#### `get` — Get display information and screenshots

```typescript
client.display.get(options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/info`
**CLI:** `hoody display get`

---

#### `getGeometry` — Get display dimensions

```typescript
client.display.getGeometry(options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/input/display-geometry`
**CLI:** `hoody display geometry get`

---

### `client.display.input` (8) — Mouse, keyboard, and window control operations

#### `act` — Execute one action with optional screenshot

```typescript
client.display.input.act(data: DisplayInputActRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputActRequest` | body | Yes | Shape: `ActBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/act`
**CLI:** `hoody display input act --action <action>`

---

#### `actMany` — Execute a sequence of actions

```typescript
client.display.input.actMany(data: DisplayInputActManyRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputActManyRequest` | body | Yes | Shape: `BatchBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/batch`
**CLI:** `hoody display input batch act --actions <actions>`

---

#### `click` — Move cursor and click

```typescript
client.display.input.click(data: DisplayInputClickRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputClickRequest` | body | Yes | Shape: `ClickAtBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/click-at`
**CLI:** `hoody display input click --x <x> --y <y>`

---

#### `drag` — Drag from one position to another

```typescript
client.display.input.drag(data: DisplayInputDragRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputDragRequest` | body | Yes | Shape: `DragBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/drag`
**CLI:** `hoody display input drag --start-x <start-x> --start-y <start-y> --end-x <end-x> --end-y <end-y>`

---

#### `reset` — Emergency release all inputs

```typescript
client.display.input.reset(data?: DisplayInputResetRequest, options?: { displayId?: number })
```

**HTTP:** `POST /api/v1/display/input/reset`
**CLI:** `hoody display input reset`

---

#### `select` — Select a range via click + shift-click

```typescript
client.display.input.select(data: DisplayInputSelectRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputSelectRequest` | body | Yes | Shape: `SelectBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/select`
**CLI:** `hoody display input select --x <x> --y <y> --end-x <end-x> --end-y <end-y>`

---

#### `type` — Move, click, and type in one operation

```typescript
client.display.input.type(data: DisplayInputTypeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputTypeRequest` | body | Yes | Shape: `TypeAtBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/type-at`
**CLI:** `hoody display input type --x <x> --y <y> --text <text>`

---

#### `wait` — Wait for a duration with optional screenshot

```typescript
client.display.input.wait(data: DisplayInputWaitRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayInputWaitRequest` | body | Yes | Shape: `WaitBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/input/wait`
**CLI:** `hoody display input wait --ms <ms>`

---

### `client.display.screenshots` (4) — Screenshot capture and retrieval operations

**Shared parameters of `client.display.screenshots`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |

#### `capture` — Capture a new screenshot

```typescript
client.display.screenshots.capture(options: { displayId?: number; metadata: true })  // → Promise<DisplayScreenshotsCaptureResponse>
client.display.screenshots.capture(options?: { base64?: boolean; displayId?: number; region?: string; cursor?: boolean; metadata?: false })  // → Promise<ApiResponse<ArrayBuffer> | { statusCode: number; message: string; data: { info: ScreenshotInfo; image: Base64ImageData; cursor?: { x: number; y: number } } }>
client.display.screenshots.capture(options?: { base64?: boolean; displayId?: number; region?: string; cursor?: boolean; metadata?: boolean })  // → Promise<DisplayScreenshotsCaptureResponse> | Promise<ApiResponse<ArrayBuffer> | { statusCode: number; message: string; data: { info: ScreenshotInfo; image: Base64ImageData; cursor?: { x: number; y: number } } }>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `region` | `string` | query | No | Crop the returned image to `x1,y1,x2,y2`. Minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else, an empty `region` or one given twice included, is a 400. A capture spans the whole screen, so these are screen coordinates: the same ones `POST /input/click-at` takes and `GET /input/display-geometry` describes. The cropped image starts at `x1,y1`: its pixel (x, y) is screen point (x1 + x, y1 + y). The region must lie inside the captured screen (`x2` at most its width, `y2` at most its height): one that does not is a 400 `VALIDATION_ERROR` naming the screen size. That check needs the capture, so it comes after the display was started. |
| `cursor` | `boolean` | query | No | Include the pointer position in the response. Only has an effect on the base64 JSON form, which gains a `cursor` object; a binary PNG response has nowhere to put it. Accepted values: `true`, `1`, `` (empty). Anything else is off. |
| `metadata` | `boolean` | option | No | Answer the screenshot metadata instead of the image. |

**Returns:** see each form above  |  **HTTP:** `GET /api/v1/display/screenshot` (with `metadata: true`: `GET /api/v1/display/screenshot/info`)
**CLI:** `hoody display screenshots capture`

---

#### `get` — Retrieve a specific screenshot by timestamp

```typescript
client.display.screenshots.get(timestamp: string, options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | The screenshot to return. Any of these names it: Unix time in seconds (`1749541160`), with or without a fraction (`1749541160.5`). Unix time in milliseconds, microseconds or nanoseconds (`1749541160123`); the unit is read from the number of whole digits after any leading zeros (12 or more is milliseconds, 15 or more microseconds, 18 or more nanoseconds). A number that equals a stored `timestamp` exactly, as written, matches that screenshot first. A date and time, such as the `timestamp_human` field (`2025-06-10T07:39:20+00:00`): an ISO 8601 calendar date written with dashes (`2025-06-10T07:39:20Z`, with an offset or none, or `2025-06-10` alone), an RFC 2822 date (`Tue, 10 Jun 2025 07:39:20 GMT`), or a date such as `06/10/2025 07:39:20`. A date with no zone is read as UTC. ISO 8601 week and ordinal dates and the form without dashes are not accepted. A date first matches the screenshot whose `timestamp_human` is that second, then one whose `timestamp` is: `timestamp_human` is when the file was written, which can be a few seconds after `timestamp`, so one second can name two different screenshots. Unix time matches `timestamp` only. The screenshot's file name from `full.path` or `thumbnail.path` (`1749541160.4242.17.png`), or the whole path, URL-encoded. This names exactly that screenshot, even when another was taken in the same second. The `.png` can be left off a name in three parts (`1749541160.4242.17`); an older single-number name (`1749541160.png`) needs it, as without it the value is Unix time. `latest` (or `newest`): the newest stored screenshot. Times are matched to the second. Two screenshots taken in the same second share a timestamp: Unix time returns the newer one (after any exact match as written), a date the first one whose `timestamp_human` is that second (which can be the older). Use the file name to pick a screenshot exactly. Anything else is a 400 `VALIDATION_ERROR`. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayScreenshotsGetResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/display/screenshot/{timestamp}`
**CLI:** `hoody display screenshots get <timestamp>`

---

#### `getLatest` — Retrieve the most recent screenshot

```typescript
client.display.screenshots.getLatest(options: { displayId?: number; metadata: true })  // → Promise<DisplayScreenshotsGetLatestResponse>
client.display.screenshots.getLatest(options?: { base64?: boolean; displayId?: number; metadata?: false })  // → Promise<ApiResponse<ArrayBuffer> | { statusCode: number; message: string; data: { info: ScreenshotInfo; image: Base64ImageData; cursor?: { x: number; y: number } } }>
client.display.screenshots.getLatest(options?: { base64?: boolean; displayId?: number; metadata?: boolean })  // → Promise<DisplayScreenshotsGetLatestResponse> | Promise<ApiResponse<ArrayBuffer> | { statusCode: number; message: string; data: { info: ScreenshotInfo; image: Base64ImageData; cursor?: { x: number; y: number } } }>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `metadata` | `boolean` | option | No | Answer the latest screenshot metadata instead of the image. |

**Returns:** see each form above  |  **HTTP:** `GET /api/v1/display/screenshot/last` (with `metadata: true`: `GET /api/v1/display/screenshot/last/info`)
**CLI:** `hoody display screenshots latest get`

---

#### `list` — List all available screenshots

```typescript
client.display.screenshots.list(options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/screenshots`
**CLI:** `hoody display screenshots list`

---

#### `save` — Capture a display screenshot and save it to the computer filesystem.

```typescript
client.display.screenshots.save(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>)
```

**Returns:** `Promise<SaveScreenshotResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.display.clipboard` (2) — Clipboard get/set

#### `get` — Read clipboard text

```typescript
client.display.clipboard.get(options?: { displayId?: number; selection?: "clipboard" | "primary" | "secondary" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `selection` | `"clipboard" \| "primary" \| "secondary"` | query | No | Clipboard buffer selection |

**HTTP:** `GET /api/v1/display/clipboard`
**CLI:** `hoody display clipboard get`

---

#### `set` — Write clipboard text

```typescript
client.display.clipboard.set(data: DisplayClipboardSetRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayClipboardSetRequest` | body | Yes | Shape: `ClipboardWriteBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/clipboard`
**CLI:** `hoody display clipboard set --text <text>`

---

### `client.display.keyboard` (4) — Keyboard automation

#### `down` — Hold a key down

```typescript
client.display.keyboard.down(data: DisplayKeyboardDownRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayKeyboardDownRequest` | body | Yes | Shape: `KeyboardKeyDownBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/keyboard/key-down`
**CLI:** `hoody display keyboard down --key <key>`

---

#### `press` — Press key combinations

```typescript
client.display.keyboard.press(data: DisplayKeyboardPressRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayKeyboardPressRequest` | body | Yes | Shape: `KeyboardKeyBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/keyboard/key`
**CLI:** `hoody display keyboard press --keys <keys>`

---

#### `type` — Type a string of text

```typescript
client.display.keyboard.type(data: DisplayKeyboardTypeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayKeyboardTypeRequest` | body | Yes | Shape: `KeyboardTypeBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/keyboard/type`
**CLI:** `hoody display keyboard type --text <text>`

---

#### `up` — Release a held key

```typescript
client.display.keyboard.up(data: DisplayKeyboardUpRequest, options?: { displayId?: number })
```

**Body:** `{ key*: string, window: int | string }`

- `key` — Key name of a key held by `keyboard/key-down`. Letters, digits, `_`, `+`, `-` and `.` only. Names of reserved commands are refused, in any letter case.
- `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits

**HTTP:** `POST /api/v1/display/keyboard/key-up`
**CLI:** `hoody display keyboard up --key <key>`

---

### `client.display.kit` (1) — Server health and status endpoints

#### `getHealth` — Service health check

```typescript
client.display.kit.getHealth()
```

**HTTP:** `GET /api/v1/display/health`
**CLI:** `hoody display health`

---

### `client.display.mouse` (8) — Mouse control operations

#### `click` — Click a mouse button

```typescript
client.display.mouse.click(data?: DisplayMouseClickRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayMouseClickRequest` | body | No | Shape: `MouseClickBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/mouse/click`
**CLI:** `hoody display mouse click`

---

#### `doubleClick` — Double-click a mouse button

```typescript
client.display.mouse.doubleClick(data?: DisplayMouseDoubleClickRequest, options?: { displayId?: number })
```

**Body:** `{ button: int=1, window: int | string }`

- `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits

**HTTP:** `POST /api/v1/display/mouse/double-click`
**CLI:** `hoody display mouse click --double`

---

#### `down` — Press and hold a mouse button

```typescript
client.display.mouse.down(data?: DisplayMouseDownRequest, options?: { displayId?: number })
```

**Body:** `{ button: int=1, window: int | string, holdMs: int }`

- `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits

**HTTP:** `POST /api/v1/display/mouse/down`
**CLI:** `hoody display mouse down`

---

#### `getPosition` — Get cursor position

```typescript
client.display.mouse.getPosition(options?: { displayId?: number })
```

**HTTP:** `GET /api/v1/display/mouse/location`
**CLI:** `hoody display mouse position get`

---

#### `move` — Move cursor to absolute position

```typescript
client.display.mouse.move(data: DisplayMouseMoveRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayMouseMoveRequest` | body | Yes | Shape: `MouseMoveBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/mouse/move`
**CLI:** `hoody display mouse move --x <x> --y <y>`

---

#### `moveBy` — Move cursor by offset

```typescript
client.display.mouse.moveBy(data: DisplayMouseMoveByRequest, options?: { displayId?: number })
```

**Body:** `{ x*: int, y*: int, sync: bool }`

**HTTP:** `POST /api/v1/display/mouse/move-relative`
**CLI:** `hoody display mouse move --relative --x <x> --y <y>`

---

#### `scroll` — Scroll in a direction

```typescript
client.display.mouse.scroll(data: DisplayMouseScrollRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DisplayMouseScrollRequest` | body | Yes | Shape: `MouseScrollBody` under Body schemas. |

**HTTP:** `POST /api/v1/display/mouse/scroll`
**CLI:** `hoody display mouse scroll --direction <direction>`

---

#### `up` — Release a mouse button

```typescript
client.display.mouse.up(data?: DisplayMouseUpRequest, options?: { displayId?: number })
```

**Body:** `{ button: int=1, window: int | string }`

- `window` — Target window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits

**HTTP:** `POST /api/v1/display/mouse/up`
**CLI:** `hoody display mouse up`

---

### `client.display.thumbnails` (3) — Thumbnail image operations

**Shared parameters of `client.display.thumbnails`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |

#### `capture` — Capture a new screenshot thumbnail

```typescript
client.display.thumbnails.capture(options?: { base64?: boolean; displayId?: number })
```

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsCaptureResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/display/thumbnail`
**CLI:** `hoody display thumbnails capture`

---

#### `get` — Retrieve a specific thumbnail by timestamp

```typescript
client.display.thumbnails.get(timestamp: string, options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | The screenshot to return. Any of these names it: Unix time in seconds (`1749541160`), with or without a fraction (`1749541160.5`). Unix time in milliseconds, microseconds or nanoseconds (`1749541160123`); the unit is read from the number of whole digits after any leading zeros (12 or more is milliseconds, 15 or more microseconds, 18 or more nanoseconds). A number that equals a stored `timestamp` exactly, as written, matches that screenshot first. A date and time, such as the `timestamp_human` field (`2025-06-10T07:39:20+00:00`): an ISO 8601 calendar date written with dashes (`2025-06-10T07:39:20Z`, with an offset or none, or `2025-06-10` alone), an RFC 2822 date (`Tue, 10 Jun 2025 07:39:20 GMT`), or a date such as `06/10/2025 07:39:20`. A date with no zone is read as UTC. ISO 8601 week and ordinal dates and the form without dashes are not accepted. A date first matches the screenshot whose `timestamp_human` is that second, then one whose `timestamp` is: `timestamp_human` is when the file was written, which can be a few seconds after `timestamp`, so one second can name two different screenshots. Unix time matches `timestamp` only. The screenshot's file name from `full.path` or `thumbnail.path` (`1749541160.4242.17.png`), or the whole path, URL-encoded. This names exactly that screenshot, even when another was taken in the same second. The `.png` can be left off a name in three parts (`1749541160.4242.17`); an older single-number name (`1749541160.png`) needs it, as without it the value is Unix time. `latest` (or `newest`): the newest stored screenshot. Times are matched to the second. Two screenshots taken in the same second share a timestamp: Unix time returns the newer one (after any exact match as written), a date the first one whose `timestamp_human` is that second (which can be the older). Use the file name to pick a screenshot exactly. Anything else is a 400 `VALIDATION_ERROR`. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/display/thumbnail/{timestamp}`
**CLI:** `hoody display thumbnails get <timestamp>`

---

#### `getLatest` — Retrieve the most recent thumbnail

```typescript
client.display.thumbnails.getLatest(options?: { base64?: boolean; displayId?: number })
```

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetLatestResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/display/thumbnail/last`
**CLI:** `hoody display thumbnails latest get`


### Body schemas

- `ClipboardWriteBody` — `{ text*: string, selection: "clipboard" | "primary" | "secondary"="clipboard" }`
  - `text` — Clipboard text content, up to 1,048,576 characters. Its UTF-8 encoding may not exceed 4 MiB, and the whole request body is limited to 2 MiB. An empty string empties the selection.
- `WindowSyncBody` — `{ windowId*: int | string, sync: bool }`
  - `sync` — Wait for the change to be applied before answering. … When the display is running but the change is not seen within 5 s (the window manager refused it, or the window was already that way), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `WindowMoveBody` — `{ windowId*: int | string, x*: int, y*: int, sync: bool, relative: bool }`
  - `windowId` — Window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits
  - `sync` — Wait until the window is at the new position before answering. A move to where the window already is answers at once. When the display is running but the window has not moved within 2 s (the window manager refused it), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `WindowResizeBody` — `{ windowId*: int | string, width*: int, height*: int, sync: bool, useHints: bool }`
  - `windowId` — Window ID: a decimal number up to 4294967295, or 0x followed by 1-8 hex digits
  - `sync` — Wait until the change is seen before answering. When the display is running but the change is not seen within 5 s (the window manager refused or adjusted it, or the window was already that way), the call answers 409 `SYNC_TIMEOUT`; the request was still sent.
- `WindowRestoreBody` — `{ windowId*: int | string, sync: bool=true }`
  - `sync` — Wait (up to 2 s) until the window manager reports the window as no longer minimized. Defaults to true, unlike the other window actions: the restore request is a message the window manager may ignore, so without waiting the response cannot say whether it worked. A window still minimized after 2 s answers 409 `SYNC_TIMEOUT`.
- `WindowIdBody` — `{ windowId*: int | string }`
- `WindowSearchBody` — `{ pattern*: string, name: bool, class: bool, classname: bool, onlyVisible: bool }`
  - `pattern` — Extended POSIX regular expression, matched case-insensitively. A pattern that does not compile, or that contains a NUL character, is a 400 `VALIDATION_ERROR`.
- `WaitUntilBody` — `{ condition*: "window-present" | "window-absent", pattern: string, match: "name" | "class" | "classname"="name", onlyVisible: bool=false, windowId: int | string, timeoutMs: int=10000, pollMs: int=250 }`
  - `pattern` — Extended POSIX regex. Required for `window-present`; for `window-absent` give either this or `windowId`, not both. A pattern that does not compile is a 400, not an empty result, and so is one containing a NUL (it could never reach the subprocess).
  - `onlyVisible` — Restrict the search to windows that are currently viewable. … Sending it alongside `windowId` is rejected: that is an identity check, not a search, so the flag would be silently ignored. …
  - `pollMs` — Gap between observations. An explicit value above `timeoutMs` is rejected; the default is not, so a `timeoutMs` under 250 is a legal request for a single look rather than an error.
- `MouseClickBody` — `{ button: int=1, repeat: int=1, delay: int, window: int | string }`
  - `repeat` — Number of clicks. `repeat` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR` naming both fields. The count is never silently capped, so `repeat: 100` stays valid at `delay: 40` or less.
- `MouseMoveBody` — `{ x*: int, y*: int, window: int | string, screen: int, sync: bool }`
- `MouseScrollBody` — `{ direction*: "up" | "down" | "left" | "right", clicks: int=5, delay: int, x: int, y: int }`
  - `clicks` — Wheel clicks. `clicks` x `delay` must not exceed 4000 ms, or the request is rejected with 400 `VALIDATION_ERROR`; `clicks: 100` therefore needs `delay: 40` or less.
  - `x` — Scroll at this point instead of wherever the pointer happens to be. Must be given together with `y`. The move and the wheel events are sent as one chained command, so no other request can move the pointer in between.
  - `y` — Must be given together with `x`.
- `KeyboardTypeBody` — `{ text*: string, window: int | string, delay: int, clearModifiers: bool }`
  - `text` — … Each line is typed as one command and must fit its 4000 ms: its characters times `delay` (12 ms when not given; 0 counts as 1 ms), so 333 characters per line at the default delay, more with a lower one. The whole text must fit 25000 ms: all its characters times `delay`, plus 100 ms per line break (200 lines of a few characters fit at the default delay). Text over either bound is a 400 `VALIDATION_ERROR`: the message names the largest `delay` that fits when one does, and otherwise asks you to send at most 4000 characters per line or to split the text into several requests.
- `KeyboardKeyBody` — `{ keys*: string[], window: int | string, delay: int, clearModifiers: bool }`
  - `keys` — … Unknown names are a 400 `VALIDATION_ERROR` naming every one (with a very long list the message says "perhaps more" and that some other keys may not have been sent); otherwise the request's other keys, if it had any, were pressed. …
- `KeyboardKeyDownBody` — `{ key*: string, window: int | string, holdMs: int }`
  - `key` — Key name (X11 keysym, e.g. Shift_L, ctrl). Letters, digits, `_`, `+`, `-` and `.` only. Names of reserved commands are refused, in any letter case.
- `ClickAtBody` — `{ x*: int, y*: int, button: int=1, repeat: int=1, delay: int }`
- `TypeAtBody` — `{ x*: int, y*: int, text*: string, delay: int }`
  - `text` — … Each line is typed as one command and must fit its 4000 ms: its characters times `delay` (12 ms when not given; 0 counts as 1 ms), so 333 characters per line at the default delay, more with a lower one. The whole text must fit 25000 ms: all its characters times `delay`, plus 100 ms per line break (200 lines of a few characters fit at the default delay). Text over either bound is a 400 `VALIDATION_ERROR`: the message names the largest `delay` that fits when one does, and otherwise asks you to send at most 4000 characters per line or to split the text into several requests.
- `DragBody` — `{ startX*: int, startY*: int, endX*: int, endY*: int, button: int=1, steps: int }`
- `SelectBody` — `{ x*: int, y*: int, endX*: int, endY*: int }`
- `ActBody` — `{ action*: string, params: object, screenshot: bool=true, screenshotDelay: int=100, screenshotRegion: string }`
  - `action` — Action path. … `act` runs one action, so a rejection here IS a 400 `VALIDATION_ERROR` (inside `/input/batch` the same rejection is reported in the 200 body as `failed.error` instead).
  - `screenshotDelay` — Milliseconds to wait after the action before the screenshot is taken (0-5000)
  - `screenshotRegion` — Crop the screenshot to `x1,y1,x2,y2`, in screen coordinates: minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else is a 400 `VALIDATION_ERROR`, answered before the action runs. A cropped image carries no `dataUrl`.
- `WaitBody` — `{ ms*: int, screenshot: bool=false }`
- `BatchBody` — `{ actions*: { action*: string, params: object }[] }`

