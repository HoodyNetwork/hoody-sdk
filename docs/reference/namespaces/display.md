# `display` — 47 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.display`

```typescript
import * as display from 'hoody-sdk/display';
```

---

## `client.display.clipboard` (2 methods)

### `get`

**GET** `/api/v1/display/clipboard`

Read clipboard text

```typescript
client.display.clipboard.get(options?: { displayId?: number; selection?: "clipboard" | "primary" | "secondary"; cache?: boolean | number }): Promise<DisplayClipboardGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `selection` | `"clipboard" \| "primary" \| "secondary"` | No | query | Clipboard buffer selection |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayClipboardGetResponse`

**CLI:** `hoody display clipboard get`

---

### `set`

**POST** `/api/v1/display/clipboard`

Write clipboard text

```typescript
client.display.clipboard.set(data: DisplayClipboardSetRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayClipboardSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayClipboardSetRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayClipboardSetResponse`

**CLI:** `hoody display clipboard set`

---

## `client.display` (2 methods)

### `get`

**GET** `/api/v1/display/info`

Get display information and screenshots

```typescript
client.display.get(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayGetResponse`

**CLI:** `hoody display get`

---

### `getGeometry`

**GET** `/api/v1/display/input/display-geometry`

Get display dimensions

```typescript
client.display.getGeometry(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayGetGeometryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayGetGeometryResponse`

**CLI:** `hoody display geometry get`

---

## `client.display.input` (8 methods)

### `act`

**POST** `/api/v1/display/input/act`

Execute one action with optional screenshot

```typescript
client.display.input.act(data: DisplayInputActRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputActResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputActRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputActResponse`

**CLI:** `hoody display input act`

---

### `actMany`

**POST** `/api/v1/display/input/batch`

Execute a sequence of actions

```typescript
client.display.input.actMany(data: DisplayInputActManyRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputActManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputActManyRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputActManyResponse`

**CLI:** `hoody display input batch act`

---

### `click`

**POST** `/api/v1/display/input/click-at`

Move cursor and click

```typescript
client.display.input.click(data: DisplayInputClickRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputClickResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputClickRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputClickResponse`

**CLI:** `hoody display input click`

---

### `drag`

**POST** `/api/v1/display/input/drag`

Drag from one position to another

```typescript
client.display.input.drag(data: DisplayInputDragRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputDragResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputDragRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputDragResponse`

**CLI:** `hoody display input drag`

---

### `reset`

**POST** `/api/v1/display/input/reset`

Emergency release all inputs

```typescript
client.display.input.reset(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputResetResponse`

**CLI:** `hoody display input reset`

---

### `select`

**POST** `/api/v1/display/input/select`

Select a range via click + shift-click

```typescript
client.display.input.select(data: DisplayInputSelectRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputSelectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputSelectRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputSelectResponse`

**CLI:** `hoody display input select`

---

### `type`

**POST** `/api/v1/display/input/type-at`

Move, click, and type in one operation

```typescript
client.display.input.type(data: DisplayInputTypeRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputTypeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputTypeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputTypeResponse`

**CLI:** `hoody display input type`

---

### `wait`

**POST** `/api/v1/display/input/wait`

Wait for a duration with optional screenshot

```typescript
client.display.input.wait(data: DisplayInputWaitRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayInputWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWaitRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayInputWaitResponse`

**CLI:** `hoody display input wait`

---

## `client.display.keyboard` (4 methods)

### `down`

**POST** `/api/v1/display/keyboard/key-down`

Hold a key down

```typescript
client.display.keyboard.down(data: DisplayKeyboardDownRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayKeyboardDownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayKeyboardDownRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayKeyboardDownResponse`

**CLI:** `hoody display keyboard down`

---

### `press`

**POST** `/api/v1/display/keyboard/key`

Press key combinations

```typescript
client.display.keyboard.press(data: DisplayKeyboardPressRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayKeyboardPressResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayKeyboardPressRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayKeyboardPressResponse`

**CLI:** `hoody display keyboard press`

---

### `type`

**POST** `/api/v1/display/keyboard/type`

Type a string of text

```typescript
client.display.keyboard.type(data: DisplayKeyboardTypeRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayKeyboardTypeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayKeyboardTypeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayKeyboardTypeResponse`

**CLI:** `hoody display keyboard type`

---

### `up`

**POST** `/api/v1/display/keyboard/key-up`

Release a held key

```typescript
client.display.keyboard.up(data: DisplayKeyboardUpRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayKeyboardUpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayKeyboardUpRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayKeyboardUpResponse`

**CLI:** `hoody display keyboard up`

---

## `client.display.kit` (1 method)

### `getHealth`

**GET** `/api/v1/display/health`

Service health check

```typescript
client.display.kit.getHealth(): Promise<DisplayHealthCheckResponse>
```

**Returns:** `DisplayHealthCheckResponse`

**CLI:** `hoody display health`

---

## `client.display.mouse` (8 methods)

### `click`

**POST** `/api/v1/display/mouse/click`

Click a mouse button

```typescript
client.display.mouse.click(data?: DisplayMouseClickRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseClickResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseClickRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseClickResponse`

**CLI:** `hoody display mouse click`

---

### `doubleClick`

**POST** `/api/v1/display/mouse/double-click`

Double-click a mouse button

```typescript
client.display.mouse.doubleClick(data?: DisplayMouseDoubleClickRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseDoubleClickResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseDoubleClickRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseDoubleClickResponse`

**CLI:** `hoody display mouse click`

---

### `down`

**POST** `/api/v1/display/mouse/down`

Press and hold a mouse button

```typescript
client.display.mouse.down(data?: DisplayMouseDownRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseDownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseDownRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseDownResponse`

**CLI:** `hoody display mouse down`

---

### `getPosition`

**GET** `/api/v1/display/mouse/location`

Get cursor position

```typescript
client.display.mouse.getPosition(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseGetPositionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseGetPositionResponse`

**CLI:** `hoody display mouse position get`

---

### `move`

**POST** `/api/v1/display/mouse/move`

Move cursor to absolute position

```typescript
client.display.mouse.move(data: DisplayMouseMoveRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseMoveRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseMoveResponse`

**CLI:** `hoody display mouse move`

---

### `moveBy`

**POST** `/api/v1/display/mouse/move-relative`

Move cursor by offset

```typescript
client.display.mouse.moveBy(data: DisplayMouseMoveByRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseMoveByResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseMoveByRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseMoveByResponse`

**CLI:** `hoody display mouse move`

---

### `scroll`

**POST** `/api/v1/display/mouse/scroll`

Scroll in a direction

```typescript
client.display.mouse.scroll(data: DisplayMouseScrollRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseScrollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseScrollRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseScrollResponse`

**CLI:** `hoody display mouse scroll`

---

### `up`

**POST** `/api/v1/display/mouse/up`

Release a mouse button

```typescript
client.display.mouse.up(data?: DisplayMouseUpRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayMouseUpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayMouseUpRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayMouseUpResponse`

**CLI:** `hoody display mouse up`

---

## `client.display.screenshots` (4 methods)

### `capture`

**GET** `/api/v1/display/screenshot`

Capture a new screenshot

```typescript
client.display.screenshots.capture(options?: { base64?: boolean; displayId?: integer; region?: string; cursor?: boolean; metadata?: boolean }): Promise<display_Base64ScreenshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `region` | `string` | No | query | Crop the returned image to `x1,y1,x2,y2`. Minimum 10x10 px, maximum 65535 on each axis, `x2 &gt; x1` and `y2 &gt; y1`; anything else is a 400. The coordinates are **capture coordinates**, not root-window coordinates. A seamless session composites only the windows it is showing, so the capture's origin is the bounding box of those windows. Crop against the width and height reported for the capture itself, not against the geometry from `GET /input/display-geometry`. |
| `cursor` | `boolean` | No | query | Include the pointer position in the response. Only has an effect on the base64 JSON form, which gains a `cursor` object; a binary PNG response has nowhere to put it. Accepted values: `true`, `1`, `` (empty). Anything else is off. |
| `metadata` | `boolean` | No | option | Answer the screenshot metadata instead of the image. |

**Returns:** `display_Base64ScreenshotResponse`

**CLI:** `hoody display screenshots capture`

---

### `get`

**GET** `/api/v1/display/screenshot/{timestamp}`

Retrieve a specific screenshot by timestamp

```typescript
client.display.screenshots.get(timestamp: string, options?: { base64?: boolean; displayId?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | DisplayScreenshotsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `timestamp` | `string` | Yes | path | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | DisplayScreenshotsGetResponse`

**CLI:** `hoody display screenshots get`

---

### `getLatest`

**GET** `/api/v1/display/screenshot/last`

Retrieve the most recent screenshot

```typescript
client.display.screenshots.getLatest(options?: { base64?: boolean; displayId?: integer; metadata?: boolean }): Promise<display_Base64ScreenshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `metadata` | `boolean` | No | option | Answer the latest screenshot metadata instead of the image. |

**Returns:** `display_Base64ScreenshotResponse`

**CLI:** `hoody display screenshots latest get`

---

### `list`

**GET** `/api/v1/display/screenshots`

List all available screenshots

```typescript
client.display.screenshots.list(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayScreenshotsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayScreenshotsListResponse`

**CLI:** `hoody display screenshots list`

---

## `client.display.thumbnails` (3 methods)

### `capture`

**GET** `/api/v1/display/thumbnail`

Capture a new screenshot thumbnail

```typescript
client.display.thumbnails.capture(options?: { base64?: boolean; displayId?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsCaptureResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | DisplayThumbnailsCaptureResponse`

**CLI:** `hoody display thumbnails capture`

---

### `get`

**GET** `/api/v1/display/thumbnail/{timestamp}`

Retrieve a specific thumbnail by timestamp

```typescript
client.display.thumbnails.get(timestamp: string, options?: { base64?: boolean; displayId?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `timestamp` | `string` | Yes | path | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | DisplayThumbnailsGetResponse`

**CLI:** `hoody display thumbnails get`

---

### `getLatest`

**GET** `/api/v1/display/thumbnail/last`

Retrieve the most recent thumbnail

```typescript
client.display.thumbnails.getLatest(options?: { base64?: boolean; displayId?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | DisplayThumbnailsGetLatestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | DisplayThumbnailsGetLatestResponse`

**CLI:** `hoody display thumbnails latest get`

---

## `client.display.ui` (1 method)

### `getPage`

**GET** `/api/v1/display/`

Access the HTML5 Display client interface

```typescript
client.display.ui.getPage(options?: { displayId?: number; decorations?: boolean; toolbar?: boolean; menu?: boolean; maximize_new_windows?: boolean; readonly?: boolean; dark_mode?: boolean; node?: string; project_id?: string; container_id?: string; url_display_id?: string; ssl?: boolean; webtransport?: boolean; path?: string; action?: "connect" | "start" | "shadow"; display?: string; encoding?: string; offscreen?: boolean; bandwidth_limit?: number; override_width?: string; override_height?: string; vrefresh?: number; suspend_inactive_tab?: boolean; sound?: boolean; audio_codec?: string; keyboard?: boolean; keyboard_layout?: string; swap_keys?: boolean; clipboard?: boolean; clipboard_preferred_format?: "text/plain" | "text/html" | "UTF8_STRING"; clipboard_poll?: boolean; printing?: boolean; file_transfer?: boolean; video?: boolean; mediasource_video?: boolean; open_url?: boolean; notification_server_url?: string; web_notifications?: boolean; display_notifications?: boolean; notification_connection_type?: "websocket" | "polling"; sharing?: boolean; steal?: boolean; reconnect?: boolean; floating_menu?: boolean; clock?: boolean; scroll_reverse_y?: "auto" | "true" | "false"; scroll_reverse_x?: boolean; title_show_hoody?: boolean; title_show_display_id?: boolean; app?: string; remote_logging?: boolean; insecure?: boolean; debug_main?: boolean; debug_keyboard?: boolean; debug_geometry?: boolean; debug_mouse?: boolean; debug_clipboard?: boolean; debug_draw?: boolean; debug_audio?: boolean; debug_network?: boolean; debug_file?: boolean; cache?: boolean | number }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `decorations` | `boolean` | No | query | Show window decorations (title bar with close/minimize/maximize buttons). Set to false for headless/kiosk mode. |
| `toolbar` | `boolean` | No | query | Show entire toolbar/menu area (menu trigger + menu). Set to false to hide all menu UI elements. Takes precedence over the menu parameter. |
| `menu` | `boolean` | No | query | Show Hoody menu trigger icon. Set to false to hide menu completely. Note: toolbar parameter takes precedence over this. |
| `maximize_new_windows` | `boolean` | No | query | Open new top-level application windows maximized instead of centered at the default size (max 1024x1024). Only applies to windows that do not request their own position, and skips override-redirect windows, dialogs, other non-NORMAL window types, and windows the app itself marks undecorated via metadata (which would have no title bar to un-maximize from). Windows can still be un-maximized from their title bar. Combining with the global decorations=false parameter is honoured as explicit kiosk intent: windows open maximized without a title bar. |
| `readonly` | `boolean` | No | query | Enable read-only/view-only mode. Blocks all keyboard and mouse input from the client. Perfect for dashboards, monitoring, or demo scenarios. Works independently or combines with server readonly setting. |
| `dark_mode` | `boolean` | No | query | Enable dark mode theme |
| `node` | `string` | No | query | Hoody node identifier (e.g., node-example-1) |
| `project_id` | `string` | No | query | Hoody project ID |
| `container_id` | `string` | No | query | Hoody container ID |
| `url_display_id` | `string` | No | query | Display ID for URL construction |
| `ssl` | `boolean` | No | query | Use SSL/TLS for WebSocket connection |
| `webtransport` | `boolean` | No | query | Use WebTransport (HTTP3) instead of WebSocket |
| `path` | `string` | No | query | Connection path for the display server |
| `action` | `"connect" \| "start" \| "shadow"` | No | query | Connection action type. - `connect` - Connect to existing session - `start` - Start new session - `shadow` - Shadow existing display |
| `display` | `string` | No | query | Display number to connect to |
| `encoding` | `string` | No | query | Pre-selects the encoding in the settings dialog; does not change the stream encoding. |
| `offscreen` | `boolean` | No | query | Use offscreen canvas for rendering |
| `bandwidth_limit` | `number` | No | query | Bandwidth limit in bits per second (0 = unlimited) |
| `override_width` | `string` | No | query | Override virtual desktop width (auto or numeric value) |
| `override_height` | `string` | No | query | Override virtual desktop height (auto or numeric value 480-4320) |
| `vrefresh` | `number` | No | query | Vertical refresh rate in Hz. Use -1 for auto-detect. Minimum 30 when explicitly set. |
| `suspend_inactive_tab` | `boolean` | No | query | Suspend client updates when browser tab is inactive. Enables power saving by calling client.suspend() on tab hide and client.resume() on tab show. Recommended to keep enabled for better performance. |
| `sound` | `boolean` | No | query | Enable audio forwarding |
| `audio_codec` | `string` | No | query | Preferred audio codec |
| `keyboard` | `boolean` | No | query | Show on-screen virtual keyboard |
| `keyboard_layout` | `string` | No | query | Keyboard layout (us, gb, fr, de, etc.) |
| `swap_keys` | `boolean` | No | query | Swap Cmd/Ctrl keys (useful for macOS) |
| `clipboard` | `boolean` | No | query | Enable clipboard sharing |
| `clipboard_preferred_format` | `"text/plain" \| "text/html" \| "UTF8_STRING"` | No | query | Preferred clipboard format |
| `clipboard_poll` | `boolean` | No | query | Enable clipboard polling (browser-dependent default) |
| `printing` | `boolean` | No | query | Enable printing support |
| `file_transfer` | `boolean` | No | query | Enable file transfer support |
| `video` | `boolean` | No | query | Enable video encoding support |
| `mediasource_video` | `boolean` | No | query | Enable MediaSource API for video |
| `open_url` | `boolean` | No | query | Allow opening URLs from the remote session in the local browser |
| `notification_server_url` | `string` | No | query | External notification server URL for real-time notification integration. **URL Format:** `https://{project}-{container}-n-{display}.{node}.containers.hoody.com/notification-client.js` **Auto-detection:** If not provided, the client will attempt to auto-detect from the current hostname pattern. The client transforms the display URL pattern by replacing 'display' with 'n'. **Examples:** - Manual: `?notification_server_url=https://my-project-container-n-6.node.containers.hoody.com/notification-client.js` - Auto-detected from: `https://my-project-container-display-6.node.containers.hoody.com` **Integration:** The notification server (port 3999) provides: - Historical notification retrieval - Real-time WebSocket notification updates - Notification icons serving - Desktop notification triggering See external notification server OpenAPI spec for complete API documentation. |
| `web_notifications` | `boolean` | No | query | Enable browser web notifications (native OS notifications) |
| `display_notifications` | `boolean` | No | query | Show notifications within display UI |
| `notification_connection_type` | `"websocket" \| "polling"` | No | query | Notification server connection type. - websocket: Real-time updates via WebSocket (recommended) - polling: Periodic HTTP polling (fallback) |
| `sharing` | `boolean` | No | query | Allow session sharing |
| `steal` | `boolean` | No | query | Steal existing sessions |
| `reconnect` | `boolean` | No | query | Auto-reconnect on connection loss |
| `floating_menu` | `boolean` | No | query | Show floating menu |
| `clock` | `boolean` | No | query | Show server clock |
| `scroll_reverse_y` | `"auto" \| "true" \| "false"` | No | query | Reverse vertical scrolling direction (auto, true, false) |
| `scroll_reverse_x` | `boolean` | No | query | Reverse horizontal scrolling direction |
| `title_show_hoody` | `boolean` | No | query | Show "Hoody" in browser title |
| `title_show_display_id` | `boolean` | No | query | Show display ID in browser title |
| `app` | `string` | No | query | Target application to launch or focus. Can be an application name, a REGEX pattern, or a window ID. |
| `remote_logging` | `boolean` | No | query | Enable remote logging to the display server |
| `insecure` | `boolean` | No | query | Allow insecure authentication (not recommended for production) |
| `debug_main` | `boolean` | No | query | Enable main debug logging |
| `debug_keyboard` | `boolean` | No | query | Enable keyboard debug logging |
| `debug_geometry` | `boolean` | No | query | Enable geometry debug logging |
| `debug_mouse` | `boolean` | No | query | Enable mouse debug logging |
| `debug_clipboard` | `boolean` | No | query | Enable clipboard debug logging |
| `debug_draw` | `boolean` | No | query | Enable draw debug logging |
| `debug_audio` | `boolean` | No | query | Enable audio debug logging |
| `debug_network` | `boolean` | No | query | Enable network debug logging |
| `debug_file` | `boolean` | No | query | Enable file transfer debug logging |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<string>`

---

## `client.display.windows` (14 methods)

### `close`

**POST** `/api/v1/display/window/close`

Close a window

```typescript
client.display.windows.close(data: DisplayWindowsCloseRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsCloseRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsCloseResponse`

**CLI:** `hoody display windows close`

---

### `focus`

**POST** `/api/v1/display/window/focus`

Focus/activate a window

```typescript
client.display.windows.focus(data: DisplayWindowsFocusRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsFocusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsFocusRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsFocusResponse`

**CLI:** `hoody display windows focus`

---

### `get`

**GET** `/api/v1/display/window/{windowId}/properties`

Get extended properties for a window

```typescript
client.display.windows.get(windowId: string, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex 0x...) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsGetResponse`

**CLI:** `hoody display windows get`

---

### `getActive`

**GET** `/api/v1/display/window/active`

Get the active window ID

```typescript
client.display.windows.getActive(options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsGetActiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsGetActiveResponse`

**CLI:** `hoody display windows active get`

---

### `getGeometry`

**GET** `/api/v1/display/window/{windowId}/geometry`

Get window position and size

```typescript
client.display.windows.getGeometry(windowId: string, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsGetGeometryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsGetGeometryResponse`

**CLI:** `hoody display windows geometry get`

---

### `getTitle`

**GET** `/api/v1/display/window/{windowId}/name`

Get window title

```typescript
client.display.windows.getTitle(windowId: string, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsGetTitleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsGetTitleResponse`

**CLI:** `hoody display windows title get`

---

### `list`

**GET** `/api/v1/display/windows`

List windows on the current display

```typescript
client.display.windows.list(options?: { displayId?: number; onlyVisible?: boolean; cache?: boolean | number }): Promise<DisplayWindowsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `onlyVisible` | `boolean` | No | query | Drop windows carrying `_NET_WM_STATE_HIDDEN`. A minimized window carries that state, so this does exclude minimized windows. This is a different test from the `onlyVisible` on `window/search` and `input/wait-until`, which ask the X server whether the window is viewable and still match a minimized one. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsListResponse`

**CLI:** `hoody display windows list`

---

### `minimize`

**POST** `/api/v1/display/window/minimize`

Minimize a window

```typescript
client.display.windows.minimize(data: DisplayWindowsMinimizeRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsMinimizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsMinimizeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsMinimizeResponse`

**CLI:** `hoody display windows minimize`

---

### `move`

**POST** `/api/v1/display/window/move`

Move a window

```typescript
client.display.windows.move(data: DisplayWindowsMoveRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsMoveRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsMoveResponse`

**CLI:** `hoody display windows move`

---

### `raise`

**POST** `/api/v1/display/window/raise`

Raise a window to the top

```typescript
client.display.windows.raise(data: DisplayWindowsRaiseRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsRaiseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsRaiseRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsRaiseResponse`

**CLI:** `hoody display windows raise`

---

### `resize`

**POST** `/api/v1/display/window/resize`

Resize a window

```typescript
client.display.windows.resize(data: DisplayWindowsResizeRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsResizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsResizeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsResizeResponse`

**CLI:** `hoody display windows resize`

---

### `restore`

**POST** `/api/v1/display/window/restore`

Restore (un-minimize) a window

```typescript
client.display.windows.restore(data: DisplayWindowsRestoreRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsRestoreRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsRestoreResponse`

**CLI:** `hoody display windows restore`

---

### `search`

**POST** `/api/v1/display/window/search`

Search for windows by pattern

```typescript
client.display.windows.search(data: DisplayWindowsSearchRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsSearchRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsSearchResponse`

**CLI:** `hoody display windows search`

---

### `wait`

**POST** `/api/v1/display/input/wait-until`

Wait for a window to appear or disappear

```typescript
client.display.windows.wait(data: DisplayWindowsWaitRequest, options?: { displayId?: number; cache?: boolean | number }): Promise<DisplayWindowsWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayWindowsWaitRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DisplayWindowsWaitResponse`

**CLI:** `hoody display windows wait`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
