# `display` — 47 methods

**Version:** 1.0.0-beta.11
**Accessor:** `client.display`

```typescript
import * as display from 'hoody-sdk/display';
```

---

## `client.display` (7 methods)

### `accessClient`

**GET** `/api/v1/display/`

Access the HTML5 Display client interface

```typescript
client.display.accessClient(options?: { displayId?: number; decorations?: boolean; toolbar?: boolean; menu?: boolean; maximize_new_windows?: boolean; readonly?: boolean; dark_mode?: boolean; node?: string; project_id?: string; container_id?: string; url_display_id?: string; ssl?: boolean; webtransport?: boolean; path?: string; action?: "connect" | "start" | "shadow"; display?: string; encoding?: "auto" | "webp" | "jpeg" | "png" | "rgb" | "rgb24" | "rgb32" | "h264" | "vp8" | "vp9" | "mpeg1" | "mpeg4+mp4" | "h264+mp4" | "vp8+webm" | "scroll" | "void"; offscreen?: boolean; bandwidth_limit?: number; override_width?: string; override_height?: string; vrefresh?: number; suspend_inactive_tab?: boolean; sound?: boolean; audio_codec?: string; keyboard?: boolean; keyboard_layout?: string; swap_keys?: boolean; clipboard?: boolean; clipboard_preferred_format?: "text/plain" | "text/html" | "UTF8_STRING"; clipboard_poll?: boolean; printing?: boolean; file_transfer?: boolean; video?: boolean; mediasource_video?: boolean; open_url?: boolean; notification_server_url?: string; web_notifications?: boolean; display_notifications?: boolean; notification_connection_type?: "websocket" | "polling"; sharing?: boolean; steal?: boolean; reconnect?: boolean; floating_menu?: boolean; clock?: boolean; scroll_reverse_y?: "auto" | "true" | "false"; scroll_reverse_x?: boolean; title_show_hoody?: boolean; title_show_display_id?: boolean; app?: string; remote_logging?: boolean; insecure?: boolean; debug_main?: boolean; debug_keyboard?: boolean; debug_geometry?: boolean; debug_mouse?: boolean; debug_clipboard?: boolean; debug_draw?: boolean; debug_audio?: boolean; debug_network?: boolean; debug_file?: boolean }): Promise<ApiResponse<unknown>>
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
| `node` | `string` | No | query | Hoody node identifier (e.g., example-1, example-2) |
| `project_id` | `string` | No | query | Hoody project ID |
| `container_id` | `string` | No | query | Hoody container ID |
| `url_display_id` | `string` | No | query | Display ID for URL construction |
| `ssl` | `boolean` | No | query | Use SSL/TLS for WebSocket connection |
| `webtransport` | `boolean` | No | query | Use WebTransport (HTTP3) instead of WebSocket |
| `path` | `string` | No | query | Connection path for the display server |
| `action` | `"connect" \| "start" \| "shadow"` | No | query | Connection action type. - `connect` - Connect to existing session - `start` - Start new session - `shadow` - Shadow existing display |
| `display` | `string` | No | query | Display number to connect to |
| `encoding` | `"auto" \| "webp" \| "jpeg" \| "png" \| "rgb" \| "rgb24" \| "rgb32" \| "h264" \| "vp8" \| "vp9" \| "mpeg1" \| "mpeg4+mp4" \| "h264+mp4" \| "vp8+webm" \| "scroll" \| "void"` | No | query | Video encoding type. Use auto for best automatic selection. |
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

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody display access`

---

### `getClipboard`

**GET** `/api/v1/display/clipboard`

Read clipboard text

```typescript
client.display.getClipboard(options?: { displayId?: number; selection?: "clipboard" | "primary" | "secondary" }): Promise<DisplayGetClipboardResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `selection` | `"clipboard" \| "primary" \| "secondary"` | No | query | Clipboard buffer selection |

**Returns:** `DisplayGetClipboardResponse`

**CLI:** `hoody display clipboard get`

---

### `getInformation`

**GET** `/api/v1/display/info`

Get display information and screenshots

```typescript
client.display.getInformation(options?: { displayId?: number }): Promise<DisplayGetInformationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayGetInformationResponse`

**CLI:** `hoody display info`

---

### `getWindowProperties`

**GET** `/api/v1/display/window/{windowId}/properties`

Get extended properties for a window

```typescript
client.display.getWindowProperties(windowId: string, options?: { displayId?: number }): Promise<DisplayGetWindowPropertiesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex 0x...) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayGetWindowPropertiesResponse`

**CLI:** `hoody display windows properties`

---

### `listScreenshots`

**GET** `/api/v1/display/screenshots`

List all available screenshots

```typescript
client.display.listScreenshots(options?: { displayId?: number }): Promise<DisplayListScreenshotsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayListScreenshotsResponse`

**CLI:** `hoody display screenshots list`

---

### `listWindows`

**GET** `/api/v1/display/windows`

List windows on the current display

```typescript
client.display.listWindows(options?: { displayId?: number; onlyVisible?: boolean }): Promise<DisplayListWindowsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |
| `onlyVisible` | `boolean` | No | query | If true, only include visible windows |

**Returns:** `DisplayListWindowsResponse`

**CLI:** `hoody display windows list`

---

### `setClipboard`

**POST** `/api/v1/display/clipboard`

Write clipboard text

```typescript
client.display.setClipboard(data: DisplaySetClipboardRequest, options?: { displayId?: number }): Promise<DisplaySetClipboardResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplaySetClipboardRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplaySetClipboardResponse`

**CLI:** `hoody display clipboard set`

---

## `client.display.health` (1 method)

### `check`

**GET** `/api/v1/display/health`

Service health check

```typescript
client.display.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody display health`

---

## `client.display.input` (31 methods)

### `act`

**POST** `/api/v1/display/input/act`

Execute one action with optional screenshot

```typescript
client.display.input.act(data: DisplayInputActRequest, options?: { displayId?: number }): Promise<DisplayInputActResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputActRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputActResponse`

**CLI:** `hoody display input act`

---

### `batch`

**POST** `/api/v1/display/input/batch`

Execute a sequence of actions

```typescript
client.display.input.batch(data: DisplayInputBatchRequest, options?: { displayId?: number }): Promise<DisplayInputBatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputBatchRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputBatchResponse`

**CLI:** `hoody display input batch`

---

### `clickAt`

**POST** `/api/v1/display/input/click-at`

Move cursor and click

```typescript
client.display.input.clickAt(data: DisplayInputClickAtRequest, options?: { displayId?: number }): Promise<DisplayInputClickAtResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputClickAtRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputClickAtResponse`

**CLI:** `hoody display input click-at`

---

### `drag`

**POST** `/api/v1/display/input/drag`

Drag from one position to another

```typescript
client.display.input.drag(data: DisplayInputDragRequest, options?: { displayId?: number }): Promise<DisplayInputDragResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputDragRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputDragResponse`

**CLI:** `hoody display input drag`

---

### `geometry`

**GET** `/api/v1/display/input/display-geometry`

Get display dimensions

```typescript
client.display.input.geometry(options?: { displayId?: number }): Promise<DisplayInputGeometryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputGeometryResponse`

**CLI:** `hoody display input geometry`

---

### `keyboardKey`

**POST** `/api/v1/display/keyboard/key`

Press key combinations

```typescript
client.display.input.keyboardKey(data: DisplayInputKeyboardKeyRequest, options?: { displayId?: number }): Promise<DisplayInputKeyboardKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputKeyboardKeyRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputKeyboardKeyResponse`

**CLI:** `hoody display keyboard key`

---

### `keyboardKeyDown`

**POST** `/api/v1/display/keyboard/key-down`

Hold a key down

```typescript
client.display.input.keyboardKeyDown(data: DisplayInputKeyboardKeyDownRequest, options?: { displayId?: number }): Promise<DisplayInputKeyboardKeyDownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputKeyboardKeyDownRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputKeyboardKeyDownResponse`

**CLI:** `hoody display keyboard key-down`

---

### `keyboardKeyUp`

**POST** `/api/v1/display/keyboard/key-up`

Release a held key

```typescript
client.display.input.keyboardKeyUp(data: DisplayInputKeyboardKeyUpRequest, options?: { displayId?: number }): Promise<DisplayInputKeyboardKeyUpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputKeyboardKeyUpRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputKeyboardKeyUpResponse`

**CLI:** `hoody display keyboard key-up`

---

### `keyboardType`

**POST** `/api/v1/display/keyboard/type`

Type a string of text

```typescript
client.display.input.keyboardType(data: DisplayInputKeyboardTypeRequest, options?: { displayId?: number }): Promise<DisplayInputKeyboardTypeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputKeyboardTypeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputKeyboardTypeResponse`

**CLI:** `hoody display keyboard type`

---

### `mouseClick`

**POST** `/api/v1/display/mouse/click`

Click a mouse button

```typescript
client.display.input.mouseClick(data?: DisplayInputMouseClickRequest, options?: { displayId?: number }): Promise<DisplayInputMouseClickResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseClickRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseClickResponse`

**CLI:** `hoody display mouse click`

---

### `mouseDoubleClick`

**POST** `/api/v1/display/mouse/double-click`

Double-click a mouse button

```typescript
client.display.input.mouseDoubleClick(data?: DisplayInputMouseDoubleClickRequest, options?: { displayId?: number }): Promise<DisplayInputMouseDoubleClickResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseDoubleClickRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseDoubleClickResponse`

**CLI:** `hoody display mouse double-click`

---

### `mouseDown`

**POST** `/api/v1/display/mouse/down`

Press and hold a mouse button

```typescript
client.display.input.mouseDown(data?: DisplayInputMouseDownRequest, options?: { displayId?: number }): Promise<DisplayInputMouseDownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseDownRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseDownResponse`

**CLI:** `hoody display mouse down`

---

### `mouseLocation`

**GET** `/api/v1/display/mouse/location`

Get cursor position

```typescript
client.display.input.mouseLocation(options?: { displayId?: number }): Promise<DisplayInputMouseLocationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseLocationResponse`

**CLI:** `hoody display mouse location`

---

### `mouseMove`

**POST** `/api/v1/display/mouse/move`

Move cursor to absolute position

```typescript
client.display.input.mouseMove(data: DisplayInputMouseMoveRequest, options?: { displayId?: number }): Promise<DisplayInputMouseMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseMoveRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseMoveResponse`

**CLI:** `hoody display mouse move`

---

### `mouseMoveRelative`

**POST** `/api/v1/display/mouse/move-relative`

Move cursor by offset

```typescript
client.display.input.mouseMoveRelative(data: DisplayInputMouseMoveRelativeRequest, options?: { displayId?: number }): Promise<DisplayInputMouseMoveRelativeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseMoveRelativeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseMoveRelativeResponse`

**CLI:** `hoody display mouse move-relative`

---

### `mouseScroll`

**POST** `/api/v1/display/mouse/scroll`

Scroll in a direction

```typescript
client.display.input.mouseScroll(data: DisplayInputMouseScrollRequest, options?: { displayId?: number }): Promise<DisplayInputMouseScrollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseScrollRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseScrollResponse`

**CLI:** `hoody display mouse scroll`

---

### `mouseUp`

**POST** `/api/v1/display/mouse/up`

Release a mouse button

```typescript
client.display.input.mouseUp(data?: DisplayInputMouseUpRequest, options?: { displayId?: number }): Promise<DisplayInputMouseUpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputMouseUpRequest` | No | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputMouseUpResponse`

**CLI:** `hoody display mouse up`

---

### `reset`

**POST** `/api/v1/display/input/reset`

Emergency release all inputs

```typescript
client.display.input.reset(options?: { displayId?: number }): Promise<DisplayInputResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputResetResponse`

**CLI:** `hoody display input reset`

---

### `select`

**POST** `/api/v1/display/input/select`

Select a range via click + shift-click

```typescript
client.display.input.select(data: DisplayInputSelectRequest, options?: { displayId?: number }): Promise<DisplayInputSelectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputSelectRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputSelectResponse`

**CLI:** `hoody display input select`

---

### `typeAt`

**POST** `/api/v1/display/input/type-at`

Move, click, and type in one operation

```typescript
client.display.input.typeAt(data: DisplayInputTypeAtRequest, options?: { displayId?: number }): Promise<DisplayInputTypeAtResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputTypeAtRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputTypeAtResponse`

**CLI:** `hoody display input type-at`

---

### `wait`

**POST** `/api/v1/display/input/wait`

Wait for a duration with optional screenshot

```typescript
client.display.input.wait(data: DisplayInputWaitRequest, options?: { displayId?: number }): Promise<DisplayInputWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWaitRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWaitResponse`

**CLI:** `hoody display input wait`

---

### `windowActive`

**GET** `/api/v1/display/window/active`

Get the active window ID

```typescript
client.display.input.windowActive(options?: { displayId?: number }): Promise<DisplayInputWindowActiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowActiveResponse`

**CLI:** `hoody display windows active`

---

### `windowClose`

**POST** `/api/v1/display/window/close`

Close a window

```typescript
client.display.input.windowClose(data: DisplayInputWindowCloseRequest, options?: { displayId?: number }): Promise<DisplayInputWindowCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowCloseRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowCloseResponse`

**CLI:** `hoody display windows close`

---

### `windowFocus`

**POST** `/api/v1/display/window/focus`

Focus/activate a window

```typescript
client.display.input.windowFocus(data: DisplayInputWindowFocusRequest, options?: { displayId?: number }): Promise<DisplayInputWindowFocusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowFocusRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowFocusResponse`

**CLI:** `hoody display windows focus`

---

### `windowGeometry`

**GET** `/api/v1/display/window/{windowId}/geometry`

Get window position and size

```typescript
client.display.input.windowGeometry(windowId: string, options?: { displayId?: number }): Promise<DisplayInputWindowGeometryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowGeometryResponse`

**CLI:** `hoody display windows geometry`

---

### `windowMinimize`

**POST** `/api/v1/display/window/minimize`

Minimize a window

```typescript
client.display.input.windowMinimize(data: DisplayInputWindowMinimizeRequest, options?: { displayId?: number }): Promise<DisplayInputWindowMinimizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowMinimizeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowMinimizeResponse`

**CLI:** `hoody display windows minimize`

---

### `windowMove`

**POST** `/api/v1/display/window/move`

Move a window

```typescript
client.display.input.windowMove(data: DisplayInputWindowMoveRequest, options?: { displayId?: number }): Promise<DisplayInputWindowMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowMoveRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowMoveResponse`

**CLI:** `hoody display windows move`

---

### `windowName`

**GET** `/api/v1/display/window/{windowId}/name`

Get window title

```typescript
client.display.input.windowName(windowId: string, options?: { displayId?: number }): Promise<DisplayInputWindowNameResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `windowId` | `string` | Yes | path | Window ID (decimal or hex) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowNameResponse`

**CLI:** `hoody display windows name`

---

### `windowRaise`

**POST** `/api/v1/display/window/raise`

Raise a window to the top

```typescript
client.display.input.windowRaise(data: DisplayInputWindowRaiseRequest, options?: { displayId?: number }): Promise<DisplayInputWindowRaiseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowRaiseRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowRaiseResponse`

**CLI:** `hoody display windows raise`

---

### `windowResize`

**POST** `/api/v1/display/window/resize`

Resize a window

```typescript
client.display.input.windowResize(data: DisplayInputWindowResizeRequest, options?: { displayId?: number }): Promise<DisplayInputWindowResizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowResizeRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowResizeResponse`

**CLI:** `hoody display windows resize`

---

### `windowSearch`

**POST** `/api/v1/display/window/search`

Search for windows by pattern

```typescript
client.display.input.windowSearch(data: DisplayInputWindowSearchRequest, options?: { displayId?: number }): Promise<DisplayInputWindowSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DisplayInputWindowSearchRequest` | Yes | body |  |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayInputWindowSearchResponse`

**CLI:** `hoody display windows search`

---

## `client.display.screenshots` (5 methods)

### `capture`

**GET** `/api/v1/display/screenshot`

Capture a new screenshot

```typescript
client.display.screenshots.capture(options?: { base64?: boolean; displayId?: number }): Promise<DisplayScreenshotsCaptureResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayScreenshotsCaptureResponse`

**CLI:** `hoody display screenshots capture`

---

### `captureMetadata`

**GET** `/api/v1/display/screenshot/info`

Capture screenshot and return metadata only

```typescript
client.display.screenshots.captureMetadata(options?: { displayId?: number }): Promise<DisplayScreenshotsCaptureMetadataResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayScreenshotsCaptureMetadataResponse`

**CLI:** `hoody display screenshots capture-metadata`

---

### `getByTimestamp`

**GET** `/api/v1/display/screenshot/{timestamp}`

Retrieve a specific screenshot by timestamp

```typescript
client.display.screenshots.getByTimestamp(timestamp: string, options?: { base64?: boolean; displayId?: number }): Promise<DisplayScreenshotsGetByTimestampResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `timestamp` | `string` | Yes | path | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayScreenshotsGetByTimestampResponse`

**CLI:** `hoody display screenshots by-timestamp`

---

### `getLatest`

**GET** `/api/v1/display/screenshot/last`

Retrieve the most recent screenshot

```typescript
client.display.screenshots.getLatest(options?: { base64?: boolean; displayId?: number }): Promise<DisplayScreenshotsGetLatestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayScreenshotsGetLatestResponse`

**CLI:** `hoody display screenshots latest`

---

### `getLatestMetadata`

**GET** `/api/v1/display/screenshot/last/info`

Get metadata for the most recent screenshot

```typescript
client.display.screenshots.getLatestMetadata(options?: { displayId?: number }): Promise<DisplayScreenshotsGetLatestMetadataResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayScreenshotsGetLatestMetadataResponse`

**CLI:** `hoody display screenshots latest-metadata`

---

## `client.display.thumbnails` (3 methods)

### `capture`

**GET** `/api/v1/display/thumbnail`

Capture a new screenshot thumbnail

```typescript
client.display.thumbnails.capture(options?: { base64?: boolean; displayId?: number }): Promise<DisplayThumbnailsCaptureResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayThumbnailsCaptureResponse`

**CLI:** `hoody display thumbnails capture`

---

### `getByTimestamp`

**GET** `/api/v1/display/thumbnail/{timestamp}`

Retrieve a specific thumbnail by timestamp

```typescript
client.display.thumbnails.getByTimestamp(timestamp: string, options?: { base64?: boolean; displayId?: number }): Promise<DisplayThumbnailsGetByTimestampResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `timestamp` | `string` | Yes | path | Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security. |
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayThumbnailsGetByTimestampResponse`

**CLI:** `hoody display thumbnails by-timestamp`

---

### `getLatest`

**GET** `/api/v1/display/thumbnail/last`

Retrieve the most recent thumbnail

```typescript
client.display.thumbnails.getLatest(options?: { base64?: boolean; displayId?: number }): Promise<DisplayThumbnailsGetLatestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `base64` | `boolean` | No | query | Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data. Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default) |
| `displayId` | `number` | No | query | Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999 |

**Returns:** `DisplayThumbnailsGetLatestResponse`

**CLI:** `hoody display thumbnails latest`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
