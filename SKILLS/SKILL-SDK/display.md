> _**SDK skill · `display` namespace** · ~16,073 tokens · hoody-sdk v1.0.0-beta.15_

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

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `screenshots.capture` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `input.click` / `input.type` at root-window coordinates (on a seamless session these differ from screenshot pixels; see Quirks).
3. `screenshots.capture` again to see the result. There is no cheap change check: `screenshots.capture` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `windows.list` (`onlyVisible` on).
2. `windows.search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). 
3. `windows.focus` with `sync` on (or `windows.raise`). Read `details.inputFocus` in the focus response: `false` means the window was activated but is not viewable, so keyboard input cannot reach it.
4. `windows.getGeometry` — coords.
5. `windows.getActive` — confirms activation only, not keyboard focus.

### 3. Drag / select

1. `mouse.move` — optional pre-position.
2. `input.drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `input.select` — click + shift-click.
4. `input.reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `clipboard.set` — `text`, optional `selection`.
2. `keyboard.press` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `clipboard.get` — read back after GUI copy.

### 5. Batch input replay

1. `input.actMany` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. 
2. `input.wait` — interleave waits.
3. `screenshots.capture` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead.
- All endpoints except `kit.getHealth` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; turn `base64` on for JSON.
- `screenshots.get` needs numeric `timestamp`, not `timestamp_human`.
- **A screenshot pixel is not always a click coordinate.** A seamless session captures only the windows it shows, so the capture's origin is the top-left of their bounding box, while `input.click` and the other pointer calls take root-window coordinates. When the shown windows do not start at (0,0), add the capture origin (the smallest `x` and `y` among the shown windows' "geometry" objects in the `windows.list` response) to a point picked on the screenshot, or use `windows.getGeometry` to target a window directly.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED`, carrying a shortened tool error; read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `windows.list`, `windows.search` and `windows.getActive` return decimal numbers; the path-parameter routes (`windows.get`, `windows.getGeometry`, `windows.getTitle`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.
- `windows.focus` activates the window and then tries to give it X input focus. The second step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. `windows.getActive` confirms the activation only.
- `ui.getPage` returns HTML, browser-only.
- The screenshot-list accessor hangs off the namespace root (`client.display.screenshots.list`), not the `screenshots` service — there is no `screenshots.list`.
- `display.get` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `display.getGeometry`). Its declared response type has only `display` and `screenshots`; read the other fields through a cast.
- `input.reset` clears stuck modifiers/buttons.
- `windows.wait` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `windows.restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `500 INPUT_ACTION_FAILED`. With `sync: false` the answer has `state: null`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `screenshots.get` — no stored capture has that timestamp. Refresh by calling `screenshots.capture`, which **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `screenshots.get` with the new timestamp. (`screenshots.getLatest` only returns metadata for the *latest* stored screenshot, which is not a replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. The `N` in the `display-N` kit hostname is the display id, so `display-1` addresses display 1; `displayId: N` in the options object overrides it. The examples pass `displayId=1` explicitly, matching the host.

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

**Step 3 — capture again and give the new image to the vision model.** `screenshots.capture` is not a cheaper probe: it takes a full capture too and only leaves the image bytes out of the response.

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
const wid = search.data!.windows![0]!;   // a number: body fields take it as-is
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (no viewer attached, or unmapped), so keyboard input cannot reach it. `windows.getActive` reports the active window, which confirms the activation only.

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

`input.type` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

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

**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

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

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; only the list, search and active-window calls return decimal numbers.

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

Note: the geometry returned is the display's virtual screen (often `8192x4096`), not a physical monitor size. Pointer coordinates (`input.click` and the rest) are in this root-window space. A screenshot of a seamless session can start at a different origin, so a point picked on a screenshot may need an offset first (see Quirks).

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `keyboard.down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `input.reset` releases everything in one call.

```typescript
await client.display.input.reset({ displayId: 1 });
```

Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

**Accessor:** `client.display`  |  **Import:** `import * as display from 'hoody-sdk/display'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.display.clipboard` (2) — Display information and management

#### `get` — Read clipboard text

```typescript
client.display.clipboard.get(options?: { displayId?: number; selection?: "clipboard" | "primary" | "secondary" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `selection` | `"clipboard" \| "primary" \| "secondary"` | query | No | Clipboard buffer selection |

**Returns:** `Promise<DisplayClipboardGetResponse>`  |  **HTTP:** `GET /api/v1/display/clipboard`
**CLI:** `hoody display clipboard get`

---

#### `set` — Write clipboard text

```typescript
client.display.clipboard.set(data: DisplayClipboardSetRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayClipboardSetRequest` | body | Yes | Shape: `display_ClipboardWriteBody` under Body schemas. |

**Returns:** `Promise<DisplayClipboardSetResponse>`  |  **HTTP:** `POST /api/v1/display/clipboard`
**CLI:** `hoody display clipboard set`

---

### `client.display` (2) — Display information and management

#### `get` — Get display information and screenshots

```typescript
client.display.get(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayGetResponse>`  |  **HTTP:** `GET /api/v1/display/info`
**CLI:** `hoody display get`

---

#### `getGeometry` — Get display dimensions

```typescript
client.display.getGeometry(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayGetGeometryResponse>`  |  **HTTP:** `GET /api/v1/display/input/display-geometry`
**CLI:** `hoody display geometry get`

---

### `client.display.input` (8) — Mouse, keyboard, and window control operations

#### `act` — Execute one action with optional screenshot

```typescript
client.display.input.act(data: DisplayInputActRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputActRequest` | body | Yes | Shape: `display_ActBody` under Body schemas. |

**Returns:** `Promise<DisplayInputActResponse>`  |  **HTTP:** `POST /api/v1/display/input/act`
**CLI:** `hoody display input act`

---

#### `actMany` — Execute a sequence of actions

```typescript
client.display.input.actMany(data: DisplayInputActManyRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputActManyRequest` | body | Yes | Shape: `display_BatchBody` under Body schemas. |

**Returns:** `Promise<DisplayInputActManyResponse>`  |  **HTTP:** `POST /api/v1/display/input/batch`
**CLI:** `hoody display input batch act`

---

#### `click` — Move cursor and click

```typescript
client.display.input.click(data: DisplayInputClickRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputClickRequest` | body | Yes | Shape: `display_ClickAtBody` under Body schemas. |

**Returns:** `Promise<DisplayInputClickResponse>`  |  **HTTP:** `POST /api/v1/display/input/click-at`
**CLI:** `hoody display input click`

---

#### `drag` — Drag from one position to another

```typescript
client.display.input.drag(data: DisplayInputDragRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputDragRequest` | body | Yes | Shape: `display_DragBody` under Body schemas. |

**Returns:** `Promise<DisplayInputDragResponse>`  |  **HTTP:** `POST /api/v1/display/input/drag`
**CLI:** `hoody display input drag`

---

#### `reset` — Emergency release all inputs

```typescript
client.display.input.reset(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayInputResetResponse>`  |  **HTTP:** `POST /api/v1/display/input/reset`
**CLI:** `hoody display input reset`

---

#### `select` — Select a range via click + shift-click

```typescript
client.display.input.select(data: DisplayInputSelectRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputSelectRequest` | body | Yes | Shape: `display_SelectBody` under Body schemas. |

**Returns:** `Promise<DisplayInputSelectResponse>`  |  **HTTP:** `POST /api/v1/display/input/select`
**CLI:** `hoody display input select`

---

#### `type` — Move, click, and type in one operation

```typescript
client.display.input.type(data: DisplayInputTypeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputTypeRequest` | body | Yes | Shape: `display_TypeAtBody` under Body schemas. |

**Returns:** `Promise<DisplayInputTypeResponse>`  |  **HTTP:** `POST /api/v1/display/input/type-at`
**CLI:** `hoody display input type`

---

#### `wait` — Wait for a duration with optional screenshot

```typescript
client.display.input.wait(data: DisplayInputWaitRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayInputWaitRequest` | body | Yes | Shape: `display_WaitBody` under Body schemas. |

**Returns:** `Promise<DisplayInputWaitResponse>`  |  **HTTP:** `POST /api/v1/display/input/wait`
**CLI:** `hoody display input wait`

---

### `client.display.keyboard` (4) — Mouse, keyboard, and window control operations

#### `down` — Hold a key down

```typescript
client.display.keyboard.down(data: DisplayKeyboardDownRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayKeyboardDownRequest` | body | Yes | Shape: `display_KeyboardKeyDownBody` under Body schemas. |

**Returns:** `Promise<DisplayKeyboardDownResponse>`  |  **HTTP:** `POST /api/v1/display/keyboard/key-down`
**CLI:** `hoody display keyboard down`

---

#### `press` — Press key combinations

```typescript
client.display.keyboard.press(data: DisplayKeyboardPressRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayKeyboardPressRequest` | body | Yes | Shape: `display_KeyboardKeyBody` under Body schemas. |

**Returns:** `Promise<DisplayKeyboardPressResponse>`  |  **HTTP:** `POST /api/v1/display/keyboard/key`
**CLI:** `hoody display keyboard press`

---

#### `type` — Type a string of text

```typescript
client.display.keyboard.type(data: DisplayKeyboardTypeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayKeyboardTypeRequest` | body | Yes | Shape: `display_KeyboardTypeBody` under Body schemas. |

**Returns:** `Promise<DisplayKeyboardTypeResponse>`  |  **HTTP:** `POST /api/v1/display/keyboard/type`
**CLI:** `hoody display keyboard type`

---

#### `up` — Release a held key

```typescript
client.display.keyboard.up(data: DisplayKeyboardUpRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayKeyboardUpRequest` | body | Yes |  |

**Body:** `{ key*: string, window: int | string }`

**Returns:** `Promise<DisplayKeyboardUpResponse>`  |  **HTTP:** `POST /api/v1/display/keyboard/key-up`
**CLI:** `hoody display keyboard up`

---

### `client.display.kit` (1) — Server health and status endpoints

#### `getHealth` — Service health check

```typescript
client.display.kit.getHealth()
```

**Returns:** `Promise<DisplayHealthCheckResponse>`  |  **HTTP:** `GET /api/v1/display/health`
**CLI:** `hoody display health`

---

### `client.display.mouse` (8) — Mouse, keyboard, and window control operations

#### `click` — Click a mouse button

```typescript
client.display.mouse.click(data?: DisplayMouseClickRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseClickRequest` | body | No | Shape: `display_MouseClickBody` under Body schemas. |

**Returns:** `Promise<DisplayMouseClickResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/click`
**CLI:** `hoody display mouse click`

---

#### `doubleClick` — Double-click a mouse button

```typescript
client.display.mouse.doubleClick(data?: DisplayMouseDoubleClickRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseDoubleClickRequest` | body | No |  |

**Body:** `{ button: int=1, window: int | string }`

**Returns:** `Promise<DisplayMouseDoubleClickResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/double-click`
**CLI:** `hoody display mouse click`

---

#### `down` — Press and hold a mouse button

```typescript
client.display.mouse.down(data?: DisplayMouseDownRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseDownRequest` | body | No |  |

**Body:** `{ button: int=1, window: int | string, holdMs: int }`

**Returns:** `Promise<DisplayMouseDownResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/down`
**CLI:** `hoody display mouse down`

---

#### `getPosition` — Get cursor position

```typescript
client.display.mouse.getPosition(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayMouseGetPositionResponse>`  |  **HTTP:** `GET /api/v1/display/mouse/location`
**CLI:** `hoody display mouse position get`

---

#### `move` — Move cursor to absolute position

```typescript
client.display.mouse.move(data: DisplayMouseMoveRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseMoveRequest` | body | Yes | Shape: `display_MouseMoveBody` under Body schemas. |

**Returns:** `Promise<DisplayMouseMoveResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/move`
**CLI:** `hoody display mouse move`

---

#### `moveBy` — Move cursor by offset

```typescript
client.display.mouse.moveBy(data: DisplayMouseMoveByRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseMoveByRequest` | body | Yes |  |

**Body:** `{ x*: int, y*: int, sync: bool }`

**Returns:** `Promise<DisplayMouseMoveByResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/move-relative`
**CLI:** `hoody display mouse move`

---

#### `scroll` — Scroll in a direction

```typescript
client.display.mouse.scroll(data: DisplayMouseScrollRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseScrollRequest` | body | Yes | Shape: `display_MouseScrollBody` under Body schemas. |

**Returns:** `Promise<DisplayMouseScrollResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/scroll`
**CLI:** `hoody display mouse scroll`

---

#### `up` — Release a mouse button

```typescript
client.display.mouse.up(data?: DisplayMouseUpRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayMouseUpRequest` | body | No |  |

**Body:** `{ button: int=1, window: int | string }`

**Returns:** `Promise<DisplayMouseUpResponse>`  |  **HTTP:** `POST /api/v1/display/mouse/up`
**CLI:** `hoody display mouse up`

---

### `client.display.screenshots` (4) — Screenshot capture and retrieval operations

#### `capture` — Capture a new screenshot

```typescript
client.display.screenshots.capture(options: NonNullable<Parameters<ScreenshotsServiceBase['__captureDisplayScreenshotMetadata']>[0]> & { metadata: true })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `region` | `string` | query | No | Crop the returned image to `x1,y1,x2,y2`. Minimum 10x10 px, maximum 65535 on each axis, `x2 > x1` and `y2 > y1`; anything else is a 400. The coordinates are **capture coordinates**, not root-window coordinates. A seamless session composites only the windows it is showing, so the capture's origin is the bounding box of those windows. Crop against the width and height reported for the capture itself, not against the geometry from `GET /input/display-geometry`. |
| `cursor` | `boolean` | query | No | Include the pointer position in the response. Only has an effect on the base64 JSON form, which gains a `cursor` object; a binary PNG response has nowhere to put it. Accepted values: `true`, `1`, `` (empty). Anything else is off. |
| `metadata` | `boolean` | option | No | Answer the screenshot metadata instead of the image. |

**Returns:** `ReturnType<ScreenshotsServiceBase['__captureDisplayScreenshotMetadata']>`  |  **HTTP:** `GET /api/v1/display/screenshot`
**CLI:** `hoody display screenshots capture`

---

#### `get` — Retrieve a specific screenshot by timestamp

```typescript
client.display.screenshots.get(timestamp: string, options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayScreenshotsGetResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/display/screenshot/{timestamp}`
**CLI:** `hoody display screenshots get`

---

#### `getLatest` — Retrieve the most recent screenshot

```typescript
client.display.screenshots.getLatest(options: NonNullable<Parameters<ScreenshotsServiceBase['__getDisplayLatestScreenshotMetadata']>[0]> & { metadata: true })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `integer` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `metadata` | `boolean` | option | No | Answer the latest screenshot metadata instead of the image. |

**Returns:** `ReturnType<ScreenshotsServiceBase['__getDisplayLatestScreenshotMetadata']>`  |  **HTTP:** `GET /api/v1/display/screenshot/last`
**CLI:** `hoody display screenshots latest get`

---

#### `list` — List all available screenshots

```typescript
client.display.screenshots.list(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayScreenshotsListResponse>`  |  **HTTP:** `GET /api/v1/display/screenshots`
**CLI:** `hoody display screenshots list`

---

#### `save` — Capture a display screenshot and save it to the container filesystem.

```typescript
client.display.screenshots.save(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>)
```

**Returns:** `Promise<SaveScreenshotResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.display.thumbnails` (3) — Thumbnail image operations

#### `capture` — Capture a new screenshot thumbnail

```typescript
client.display.thumbnails.capture(options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsCaptureResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/display/thumbnail`
**CLI:** `hoody display thumbnails capture`

---

#### `get` — Retrieve a specific thumbnail by timestamp

```typescript
client.display.thumbnails.get(timestamp: string, options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `string` | path | Yes | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/display/thumbnail/{timestamp}`
**CLI:** `hoody display thumbnails get`

---

#### `getLatest` — Retrieve the most recent thumbnail

```typescript
client.display.thumbnails.getLatest(options?: { base64?: boolean; displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `base64` | `boolean` | query | No | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: `true`, `1`, `` (empty) - Return base64 JSON; `false`, `0` - Return binary (default) |
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetLatestResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/display/thumbnail/last`
**CLI:** `hoody display thumbnails latest get`

---

### `client.display.ui` (1) — Display information and management

#### `getPage` — Access the HTML5 Display client interface

```typescript
client.display.ui.getPage(options?: { displayId?: number; decorations?: boolean; toolbar?: boolean; menu?: boolean; maximize_new_windows?: boolean; readonly?: boolean; dark_mode?: boolean; node?: string; project_id?: string; container_id?: string; url_display_id?: string; ssl?: boolean; webtransport?: boolean; path?: string; action?: "connect" | "start" | "shadow"; display?: string; encoding?: string; offscreen?: boolean; bandwidth_limit?: number; override_width?: string; override_height?: string; vrefresh?: number; suspend_inactive_tab?: boolean; sound?: boolean; audio_codec?: string; keyboard?: boolean; keyboard_layout?: string; swap_keys?: boolean; clipboard?: boolean; clipboard_preferred_format?: "text/plain" | "text/html" | "UTF8_STRING"; clipboard_poll?: boolean; printing?: boolean; file_transfer?: boolean; video?: boolean; mediasource_video?: boolean; open_url?: boolean; notification_server_url?: string; web_notifications?: boolean; display_notifications?: boolean; notification_connection_type?: "websocket" | "polling"; sharing?: boolean; steal?: boolean; reconnect?: boolean; floating_menu?: boolean; clock?: boolean; scroll_reverse_y?: "auto" | "true" | "false"; scroll_reverse_x?: boolean; title_show_hoody?: boolean; title_show_display_id?: boolean; app?: string; remote_logging?: boolean; insecure?: boolean; debug_main?: boolean; debug_keyboard?: boolean; debug_geometry?: boolean; debug_mouse?: boolean; debug_clipboard?: boolean; debug_draw?: boolean; debug_audio?: boolean; debug_network?: boolean; debug_file?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `decorations` | `boolean` | query | No | Show window decorations (title bar with close/minimize/maximize buttons). Set to false for headless/kiosk mode. |
| `toolbar` | `boolean` | query | No | Show entire toolbar/menu area (menu trigger + menu). Set to false to hide all menu UI elements. Takes precedence over the menu parameter. |
| `menu` | `boolean` | query | No | Show Hoody menu trigger icon. Set to false to hide menu completely. Note: toolbar parameter takes precedence over this. |
| `maximize_new_windows` | `boolean` | query | No | Open new top-level application windows maximized instead of centered at the default size (max 1024x1024). Only applies to windows that do not request their own position, and skips override-redirect windows, dialogs, other non-NORMAL window types, and windows the app itself marks undecorated via metadata (which would have no title bar to un-maximize from). Windows can still be un-maximized from their title bar. Combining with the global decorations=false parameter is honoured as explicit kiosk intent: windows open maximized without a title bar. |
| `readonly` | `boolean` | query | No | Enable read-only/view-only mode. Blocks all keyboard and mouse input from the client. Perfect for dashboards, monitoring, or demo scenarios. Works independently or combines with server readonly setting. |
| `dark_mode` | `boolean` | query | No | Enable dark mode theme |
| `node` | `string` | query | No | Hoody node identifier (e.g., node-example-1) |
| `project_id` | `string` | query | No | Hoody project ID |
| `container_id` | `string` | query | No | Hoody container ID |
| `url_display_id` | `string` | query | No | Display ID for URL construction |
| `ssl` | `boolean` | query | No | Use SSL/TLS for WebSocket connection |
| `webtransport` | `boolean` | query | No | Use WebTransport (HTTP3) instead of WebSocket |
| `path` | `string` | query | No | Connection path for the display server |
| `action` | `"connect" \| "start" \| "shadow"` | query | No | Connection action type. `connect` - Connect to existing session; `start` - Start new session; `shadow` - Shadow existing display |
| `display` | `string` | query | No | Display number to connect to |
| `encoding` | `string` | query | No | Pre-selects the encoding in the settings dialog; does not change the stream encoding. |
| `offscreen` | `boolean` | query | No | Use offscreen canvas for rendering |
| `bandwidth_limit` | `number` | query | No | Bandwidth limit in bits per second (0 = unlimited) |
| `override_width` | `string` | query | No | Override virtual desktop width (auto or numeric value) |
| `override_height` | `string` | query | No | Override virtual desktop height (auto or numeric value 480-4320) |
| `vrefresh` | `number` | query | No | Vertical refresh rate in Hz. Use -1 for auto-detect. Minimum 30 when explicitly set. |
| `suspend_inactive_tab` | `boolean` | query | No | Suspend client updates when browser tab is inactive. Enables power saving by calling client.suspend() on tab hide and client.resume() on tab show. Recommended to keep enabled for better performance. |
| `sound` | `boolean` | query | No | Enable audio forwarding |
| `audio_codec` | `string` | query | No | Preferred audio codec |
| `keyboard` | `boolean` | query | No | Show on-screen virtual keyboard |
| `keyboard_layout` | `string` | query | No | Keyboard layout (us, gb, fr, de, etc.) |
| `swap_keys` | `boolean` | query | No | Swap Cmd/Ctrl keys (useful for macOS) |
| `clipboard` | `boolean` | query | No | Enable clipboard sharing |
| `clipboard_preferred_format` | `"text/plain" \| "text/html" \| "UTF8_STRING"` | query | No | Preferred clipboard format |
| `clipboard_poll` | `boolean` | query | No | Enable clipboard polling (browser-dependent default) |
| `printing` | `boolean` | query | No | Enable printing support |
| `file_transfer` | `boolean` | query | No | Enable file transfer support |
| `video` | `boolean` | query | No | Enable video encoding support |
| `mediasource_video` | `boolean` | query | No | Enable MediaSource API for video |
| `open_url` | `boolean` | query | No | Allow opening URLs from the remote session in the local browser |
| `notification_server_url` | `string` | query | No | External notification server URL for real-time notification integration. **URL Format:** `https://{project}-{container}-n-{display}.{node}.containers.hoody.com/notification-client.js` **Auto-detection:** If not provided, the client will attempt to auto-detect from the current hostname pattern. The client transforms the display URL pattern by replacing 'display' with 'n'. **Examples:** Manual: `?notification_server_url=https://my-project-container-n-6.node.containers.hoody.com/notification-client.js`; Auto-detected from: `https://my-project-container-display-6.node.containers.hoody.com` **Integration:** The notification server (port 3999) provides: Historical notification retrieval; Real-time WebSocket notification updates; Notification icons serving; Desktop notification triggering See external notification server OpenAPI spec for complete API documentation. |
| `web_notifications` | `boolean` | query | No | Enable browser web notifications (native OS notifications) |
| `display_notifications` | `boolean` | query | No | Show notifications within display UI |
| `notification_connection_type` | `"websocket" \| "polling"` | query | No | Notification server connection type. websocket: Real-time updates via WebSocket (recommended); polling: Periodic HTTP polling (fallback) |
| `sharing` | `boolean` | query | No | Allow session sharing |
| `steal` | `boolean` | query | No | Steal existing sessions |
| `reconnect` | `boolean` | query | No | Auto-reconnect on connection loss |
| `floating_menu` | `boolean` | query | No | Show floating menu |
| `clock` | `boolean` | query | No | Show server clock |
| `scroll_reverse_y` | `"auto" \| "true" \| "false"` | query | No | Reverse vertical scrolling direction (auto, true, false) |
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

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/display/`

---

### `client.display.windows` (14) — Mouse, keyboard, and window control operations

#### `close` — Close a window

```typescript
client.display.windows.close(data: DisplayWindowsCloseRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsCloseRequest` | body | Yes | Shape: `display_WindowIdBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsCloseResponse>`  |  **HTTP:** `POST /api/v1/display/window/close`
**CLI:** `hoody display windows close`

---

#### `focus` — Focus/activate a window

```typescript
client.display.windows.focus(data: DisplayWindowsFocusRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsFocusRequest` | body | Yes | Shape: `display_WindowSyncBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsFocusResponse>`  |  **HTTP:** `POST /api/v1/display/window/focus`
**CLI:** `hoody display windows focus`

---

#### `get` — Get extended properties for a window

```typescript
client.display.windows.get(windowId: string, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex 0x...) |

**Returns:** `Promise<DisplayWindowsGetResponse>`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/properties`
**CLI:** `hoody display windows get`

---

#### `getActive` — Get the active window ID

```typescript
client.display.windows.getActive(options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `Promise<DisplayWindowsGetActiveResponse>`  |  **HTTP:** `GET /api/v1/display/window/active`
**CLI:** `hoody display windows active get`

---

#### `getGeometry` — Get window position and size

```typescript
client.display.windows.getGeometry(windowId: string, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex) |

**Returns:** `Promise<DisplayWindowsGetGeometryResponse>`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/geometry`
**CLI:** `hoody display windows geometry get`

---

#### `getTitle` — Get window title

```typescript
client.display.windows.getTitle(windowId: string, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `windowId` | `string` | path | Yes | Window ID (decimal or hex) |

**Returns:** `Promise<DisplayWindowsGetTitleResponse>`  |  **HTTP:** `GET /api/v1/display/window/{windowId}/name`
**CLI:** `hoody display windows title get`

---

#### `list` — List windows on the current display

```typescript
client.display.windows.list(options?: { displayId?: number; onlyVisible?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `onlyVisible` | `boolean` | query | No | Drop windows carrying `_NET_WM_STATE_HIDDEN`. A minimized window carries that state, so this does exclude minimized windows. This is a different test from the `onlyVisible` on `window/search` and `input/wait-until`, which ask the X server whether the window is viewable and still match a minimized one. |

**Returns:** `Promise<DisplayWindowsListResponse>`  |  **HTTP:** `GET /api/v1/display/windows`
**CLI:** `hoody display windows list`

---

#### `minimize` — Minimize a window

```typescript
client.display.windows.minimize(data: DisplayWindowsMinimizeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsMinimizeRequest` | body | Yes | Shape: `display_WindowSyncBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsMinimizeResponse>`  |  **HTTP:** `POST /api/v1/display/window/minimize`
**CLI:** `hoody display windows minimize`

---

#### `move` — Move a window

```typescript
client.display.windows.move(data: DisplayWindowsMoveRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsMoveRequest` | body | Yes | Shape: `display_WindowMoveBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsMoveResponse>`  |  **HTTP:** `POST /api/v1/display/window/move`
**CLI:** `hoody display windows move`

---

#### `raise` — Raise a window to the top

```typescript
client.display.windows.raise(data: DisplayWindowsRaiseRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsRaiseRequest` | body | Yes | Shape: `display_WindowIdBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsRaiseResponse>`  |  **HTTP:** `POST /api/v1/display/window/raise`
**CLI:** `hoody display windows raise`

---

#### `resize` — Resize a window

```typescript
client.display.windows.resize(data: DisplayWindowsResizeRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsResizeRequest` | body | Yes | Shape: `display_WindowResizeBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsResizeResponse>`  |  **HTTP:** `POST /api/v1/display/window/resize`
**CLI:** `hoody display windows resize`

---

#### `restore` — Restore (un-minimize) a window

```typescript
client.display.windows.restore(data: DisplayWindowsRestoreRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsRestoreRequest` | body | Yes | Shape: `display_WindowRestoreBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsRestoreResponse>`  |  **HTTP:** `POST /api/v1/display/window/restore`
**CLI:** `hoody display windows restore`

---

#### `search` — Search for windows by pattern

```typescript
client.display.windows.search(data: DisplayWindowsSearchRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsSearchRequest` | body | Yes | Shape: `display_WindowSearchBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsSearchResponse>`  |  **HTTP:** `POST /api/v1/display/window/search`
**CLI:** `hoody display windows search`

---

#### `wait` — Wait for a window to appear or disappear

```typescript
client.display.windows.wait(data: DisplayWindowsWaitRequest, options?: { displayId?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `number` | query | No | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `data` | `DisplayWindowsWaitRequest` | body | Yes | Shape: `display_WaitUntilBody` under Body schemas. |

**Returns:** `Promise<DisplayWindowsWaitResponse>`  |  **HTTP:** `POST /api/v1/display/input/wait-until`
**CLI:** `hoody display windows wait`


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

