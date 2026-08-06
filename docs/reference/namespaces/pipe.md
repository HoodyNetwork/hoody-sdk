# `pipe` — 7 methods

**Version:** 1.0.0-beta.12
**Accessor:** `client.pipe`

```typescript
import * as pipe from 'hoody-sdk/pipe';
```

---

## `client.pipe.health` (1 method)

### `check`

**GET** `/api/v1/pipe/health`

Service health check

```typescript
client.pipe.health.check(): Promise<PipeHealthCheckResponse>
```

**Returns:** `PipeHealthCheckResponse`

---

## `client.pipe.info` (1 method)

### `getHelp`

**GET** `/api/v1/pipe/help`

Get help text with curl examples

```typescript
client.pipe.info.getHelp(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.pipe` (3 methods)

### `corsPreflight`

**OPTIONS** `/api/v1/pipe/{path}`

CORS preflight

```typescript
client.pipe.corsPreflight(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Any path — OPTIONS is handled identically for all paths |

**Returns:** `ApiResponse<unknown>`

---

### `receive`

**GET** `/api/v1/pipe/{path}`

Receive data from a pipe

```typescript
client.pipe.receive(path: string, options?: { n?: number; download?: "true" | "false" | "yes" | "no" | "1" | "0"; filename?: string; video?: "true" | "false" | "yes" | "no" | "1" | "0"; progress?: "true" | "false" | "yes" | "no" | "1" | "0" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Pipe path name to receive from — must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. |
| `n` | `number` | No | query | Expected number of receivers. Must match the sender's `n` value exactly — a mismatch returns 400. When `n &gt; 1`, the pipe waits for all `n` receivers and the sender before streaming. |
| `download` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | No | query | Control whether the response triggers a browser download. - `?download` (bare), `?download=true`, `?download=yes`, `?download=1` — force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. - `?download=false`, `?download=no`, `?download=0` — suppress `Content-Disposition` entirely, even if sender set one (forces inline display). - Absent — passthrough sender's Content-Disposition as-is. Multipart `form-data` dispositions are auto-converted to `attachment`. Works per-receiver — with `n=2`, one receiver can have `?download` and the other can display inline. |
| `filename` | `string` | No | query | Set a custom download filename. Implies `?download` — the response will have `Content-Disposition: attachment; filename="&lt;value&gt;"`. **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header. **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding. Filenames that sanitize to empty fall back to bare `attachment`. |
| `video` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | No | query | Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally — no pipe receiver slot is consumed by the page itself. **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser). Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream — ensuring automatic compatibility with media players. **Auto-detection:** The player detects the container/codec from the stream's first bytes: - WebM (VP8/VP9/AV1 + Opus/Vorbis) - MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC) - MPEG-TS **UI features:** - Click to unmute (autoplay requires muted) - Right-click to pause/resume - Status overlay: "Waiting for stream…", "Connected", "Stream ended" - Buffer trimming (&gt;30s behind currentTime removed) **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver. **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`. Pipe path HTML-escaped in `data-path` attribute. |
| `progress` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | No | query | Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot — spectators are completely independent of the transfer. **Accept header routing:** - `Accept: text/event-stream` → SSE stream (EventSource, curl) - `Accept: text/html` → HTML dashboard page (browser) - `Accept: */*` or missing → SSE stream (default to data, not markup) **SSE event types:** - `state` — State transitions: idle → waiting → streaming → complete/failed - `progress` — During streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers - `done` — Terminal event: final stats (bytesTransferred, duration, avgSpeed) **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed` **DoS protections:** Max 50 spectators per path, 500 total groups, 30-min connection TTL, 30s post-transfer linger. **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver. **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility. |

**Returns:** `ApiResponse<unknown>`

---

### `send`

**POST** `/api/v1/pipe/{path}`

Send data to a pipe

```typescript
client.pipe.send(path: string, data?: object, options?: { n?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`). Examples: `myfile`, `transfer123`, `secret.png`, `logs/today` |
| `data` | `object` | No | body |  |
| `n` | `number` | No | query | Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256. |

**Returns:** `ApiResponse<unknown>`

---

## `client.pipe.ui` (2 methods)

### `getIndex`

**GET** `/api/v1/pipe`

Index page (web UI)

```typescript
client.pipe.ui.getIndex(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getNoScript`

**GET** `/api/v1/pipe/noscript`

No-JavaScript upload page

```typescript
client.pipe.ui.getNoScript(options?: { path?: string; mode?: "file" | "text" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | No | query | Pre-fill the pipe path. Only URL-safe characters allowed. |
| `mode` | `"file" \| "text"` | No | query | Input mode: `file` for file picker, `text` for textarea |

**Returns:** `ApiResponse<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
