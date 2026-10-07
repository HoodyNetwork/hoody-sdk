# `display` — 46 methods

**Version:** 1.0.0-beta.16
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
