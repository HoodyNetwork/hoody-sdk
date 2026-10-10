# `pipe` — 6 methods

**Version:** 1.0.0-beta.17
**Accessor:** `client.pipe`

```typescript
import * as pipe from 'hoody-sdk/pipe';
```

---

## `client.pipe.kit` (3 methods)

### `getHealth`

**GET** `/api/v1/pipe/health`

Service health check

```typescript
client.pipe.kit.getHealth(): Promise<PipeKitGetHealthResponse>
```

**Returns:** `PipeKitGetHealthResponse`

**CLI:** `hoody pipe health`

---

### `getHelp`

**GET** `/api/v1/pipe/help`

Get help text with curl examples

```typescript
client.pipe.kit.getHelp(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody pipe cheatsheet get`

---

### `getMetrics`

**GET** `/api/v1/pipe/metrics`

Service metrics (Prometheus)

```typescript
client.pipe.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody pipe metrics`

---

## `client.pipe` (3 methods)

### `getStatus`

**GET** `/api/v1/pipe/{path}`

One snapshot of a pipe name (GET ?status): state, sender, receivers, bytes. Takes no receiver slot.

```typescript
client.pipe.getStatus(path: string, options?: { transfer?: string; headersOnly?: boolean }): Promise<pipe_PipeStatus>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Pipe path name to receive from — must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. |
| `transfer` | `string` | No | query | With `status`: answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. A `?sha256` transfer, and every transfer with a sender-chosen id, leaves a receipt (state, reason, digest, bytes) kept 10 minutes (at most 1000; the oldest go first), so a receiver verifies its bytes after it has read them all: `complete` with the same `sha256` means the bytes match. A sender-chosen id answers from the sender's arrival on (`waiting`). An id that is neither the name's current transfer nor a kept receipt for this name is 404. Not with `ws` (400). |
| `headersOnly` | `boolean` | No | option | Answer only the response headers (HEAD ?status): a liveness probe with no snapshot. |

**Returns:** `pipe_PipeStatus`

---

### `receive`

**GET** `/api/v1/pipe/{path}`

Receive data from a pipe

```typescript
client.pipe.receive(path: string, options?: { n?: integer; download?: string; filename?: string; video?: string; progress?: string; receive?: string; share?: string; autostart?: string; source?: string; audio?: string; surface?: string; quality?: string; fps?: integer; status?: string; transfer?: string; wait?: integer; ws?: string; live?: string; sha256?: string }): Promise<pipe_PipeStatus>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Pipe path name to receive from — must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. |
| `n` | `number` | No | query | Expected number of receivers. Must match the sender's `n` value exactly — a mismatch returns 400. When `n &gt; 1`, the pipe waits for all `n` receivers and the sender before streaming. With `video`, `share` or `receive` (browser pages), `n` is the receiver or viewer count the page uses; there an invalid value becomes 1 and a value above 256 becomes 256. |
| `download` | `string` | No | query | Control whether the response triggers a browser download. - `?download` (bare), `?download=true`, `?download=yes`, `?download=1` — force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. - `?download=false`, `?download=no`, `?download=0` — suppress `Content-Disposition` entirely, even if sender set one (forces inline display). - Absent — passthrough sender's Content-Disposition as-is. Multipart `form-data` dispositions are auto-converted to `attachment`. Works per-receiver — with `n=2`, one receiver can have `?download` and the other can display inline. |
| `filename` | `string` | No | query | Set a custom download filename. Implies `?download` — the response will have `Content-Disposition: attachment; filename="&lt;value&gt;"`. **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header. **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding. Filenames that sanitize to empty fall back to bare `attachment`. With `receive` (browser page), the sanitized value pre-fills the page's "Save as" field and names the download. |
| `video` | `string` | No | query | Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally — no pipe receiver slot is consumed by the page itself. **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser). Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream — ensuring automatic compatibility with media players. **Auto-detection:** The player detects the container/codec from the stream's first bytes: - WebM (VP8/VP9/AV1 + Opus/Vorbis), or audio-only WebM (Opus/Vorbis) - MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC) - MPEG-TS is recognized, but most browsers cannot play it: the player then says so. Play MPEG-TS in a media player (VLC, mpv, ffplay) from the same URL. **UI features:** - Click to unmute (autoplay requires muted) - Right-click to pause/resume - Status overlay: "Waiting for stream…", "Connected", "Stream ended"; for audio-only streams a lasting "Audio — click to unmute" / "Playing audio" - Plays each stream to its end, including a short file that arrives all at once, and keeps waiting on the path: the next stream sent there replaces it - With `?n=N`, the N players may be tabs of one browser - Never skips content: a stream that fell behind stays behind; the player reads at most 45 s ahead of playback - Playback that stops for 1.5 s with media buffered ahead moves on to that media - A valid `wait` on the player URL is used by each of its receives (how long it waits for a sender); an invalid one is ignored and the default applies **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver. **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`. Pipe path HTML-escaped in `data-path` attribute. |
| `progress` | `string` | No | query | Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot — spectators are completely independent of the transfer. **Accept header routing:** - `Accept: text/event-stream` → SSE stream (EventSource, curl) - `Accept: text/html` → HTML dashboard page (browser) - `Accept: */*` or missing → SSE stream (default to data, not markup) **SSE event types:** - `state` — State transitions: idle → waiting → streaming → complete/failed - `progress` — During streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers - `done` — Terminal event: final stats (bytesTransferred, duration, avgSpeed, `reason` when failed, `sha256` — the digest with `?sha256` on a complete transfer, else null — and `transferId`) - On a live stream (`live`), every `state` and `progress` event (the first ones a spectator gets on connecting included) also carries `live: true` and `totalReceivers: null`; `activeReceivers` is the viewers watching now, and a viewer joining or leaving sends a `progress` event (within the 250 ms throttle). `totalBytes` and `eta` are null. **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed` **DoS protections:** Max 50 spectators per path, 500 total groups, 30-min connection TTL, 30s post-transfer linger. **After a transfer:** after a transfer on the path finishes, the SSE request is answered `204 No Content` for up to 30 s, until the path is used again (no stream, so EventSource does not reconnect); the HTML dashboard then shows "Transfer already finished". The dashboard's elapsed time follows the `elapsed` field of `progress` events, so it counts from the transfer start. **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver. **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility. |
| `receive` | `string` | No | query | Return the receive page instead of raw pipe data. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?receive` fall through to the normal receiver and get the data. **What the page does:** it shows the pipe name and whether a sender is waiting (from the `?progress` stream). On **Receive**, or by itself with `autostart=1`, the browser's download manager receives `/{path}?download` (plus `n` and `filename`), so the data streams to disk at any size without passing through the page. Progress and the result are in the browser's downloads list: the page cannot see the download and never reports it as finished. It fails with the server's error text, for example `Timed out waiting for sender.` when no sender comes within 5 minutes (or the `wait` given), or a receiver-count mismatch; **Receive again** retries. What is happening on the path for all its senders and receivers (no sender yet, a sender waiting for receivers, a transfer running) is shown as information only, under a "Status for this name" label; while it cannot be read the page says `Status unavailable, retrying…`. **Cancel** frees the receiver slot while the receive waits; a download that has already started continues in the browser's downloads. Without JavaScript it shows a plain download link. **Page parameters:** `n` (receiver count, editable on the page), `filename` (download name), `autostart`, and the receiver's own `wait` and `sha256`, forwarded to its download (and to the no-JavaScript link). An invalid `wait` is dropped there. The page shows no checksum: compare one with `?status&transfer=&lt;id&gt;` from a client that reads the `X-Hoody-Pipe-Transfer-Id` header. **Values:** `?receive` (bare), `?receive=true`, `?receive=yes`, `?receive=1` → page. `?receive=false`, `?receive=no`, `?receive=0` → normal pipe receiver. **Precedence:** with several page parameters a browser gets `progress`, then `video`, then `share`, then `receive`. **Security:** CSP with nonces, `connect-src 'self'`, `frame-src 'self'`, no external resources, `Cache-Control: no-store`. Values from the URL are only rendered as escaped text. The page uses no cookies or browser storage. |
| `share` | `string` | No | query | Return the share page: stream the screen (a screen, window or tab, optionally with its audio), a camera with microphone, or the microphone alone, live to the viewers of `/{path}?video`. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?share` fall through to the normal receiver. **What the page does:** Start asks the browser for the capture (the user picks the screen, window or tab in the browser's own picker), records it as WebM and sends it to the path as one streaming upload. The page shows a link for viewers (`?video`, with `n` when it is above 1; copy button and QR code), viewers connected, streaming state and elapsed time. Stop, or ending the share from the browser's own controls, finishes the stream; Start again on the same path reconnects the viewers. A share nobody joins ends after the server's 5-minute wait. A browser that cannot stream an upload gets a clear "not supported" message. **Live:** with the Live box ticked (`live=1` on the page URL) the upload is a `live` broadcast (`POST /{path}?live`): it starts at once, viewers join and leave at any time through `?video&live=1` (each from the next keyframe; the page asks the recorder for one every 2 s), `n` is ignored, and the page shows the viewers watching now from `?progress`. Live needs a WebM recording; a browser that cannot record WebM gets a "not supported" message. **Page parameters:** `source`, `audio`, `surface`, `quality`, `fps`, `live`, `n` (viewers). They only pre-fill the controls: capture always starts with the user's click on Start. **Values:** `?share` (bare), `?share=true`, `?share=yes`, `?share=1` → page. `?share=false`, `?share=no`, `?share=0` → normal pipe receiver. **Security:** CSP with nonces, `connect-src 'self'`, no external resources, `Cache-Control: no-store`. The page uses no cookies or browser storage. |
| `autostart` | `string` | No | query | Receive page (`receive`) only: `1`, `true`, `yes` or bare starts the receive without a click once the page has loaded. Any other value, or none, waits for the user's click. Ignored on every other request. |
| `source` | `string` | No | query | Share page (`share`) only — pre-selects the source. `screen` (default) is a screen, window or tab; `camera` is a camera with microphone; `audio` is the microphone alone. Invalid → `screen`. |
| `audio` | `string` | No | query | Share page (`share`) only — `1`, `true`, `yes` or bare pre-checks "include audio" for a screen share (tab or system audio, where the browser offers it). Default off. |
| `surface` | `string` | No | query | Share page (`share`) only — which kind of surface the browser's picker offers first. `monitor` (a whole screen), `window` or `browser` (a tab). The user still makes the choice. Default no hint. |
| `quality` | `string` | No | query | Share page (`share`) only — capture size and bit rate. `low` (about 480p), `medium` (about 720p, default) or `high` (about 1080p). Invalid → `medium`. |
| `fps` | `number` | No | query | Share page (`share`) only — frames per second for screen and camera, 1-60. Invalid → 30. |
| `status` | `string` | No | query | Return one JSON snapshot of the name (`PipeStatus`) instead of receiving. It takes no receiver slot, is answered at once and is never held open; poll it from scripts and agents that cannot hold a `?progress` stream. Checked before every other parameter (`progress`, `video`, `share`, `receive`, `n`, `wait`, and the modes `live`, `ws` and `live` with `ws`), for browsers too. `HEAD` with `?status` returns the headers only. A POST/PUT with `?status` is an ordinary sender. - `state`: `idle` (nobody on the name; an unused name is idle, not 404), `waiting`, `streaming`, `complete`, `failed` - `kind`: `null` when idle, `"pipe"` for a transfer, `"ws"` for a WebSocket pair (`ws`) - `peers`: with `"ws"`, the peers connected now (0-2); `null` for a transfer - `transferId`: set from when the transfer starts streaming, or from the sender's arrival when it chose its own (`transfer` on the sender); the same value receivers get in `X-Hoody-Pipe-Transfer-Id` - `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed` (bytes/s), `eta` (s), `elapsed` (s): the `?progress` fields; `speed` is the average since streaming started, and in `complete`/`failed` `elapsed` and `speed` are frozen at the end - `reason`: why it failed (`Timed out`, `Idle timeout`, `Sender disconnected`, ...), else `null` - `sha256`: the digest in `complete` when `?sha256` was on, else `null` A finished transfer stays visible for 30 s (at most the 1000 most recent ones), then the name reads `idle`; a new sender or receiver on the name starts a fresh `waiting`. Responses carry `Cache-Control: no-store`. **Values:** `?status` (bare), `true`, `yes`, `1` → snapshot; `false`, `no`, `0` → normal receiver. |
| `transfer` | `string` | No | query | With `status`: answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. A `?sha256` transfer, and every transfer with a sender-chosen id, leaves a receipt (state, reason, digest, bytes) kept 10 minutes (at most 1000; the oldest go first), so a receiver verifies its bytes after it has read them all: `complete` with the same `sha256` means the bytes match. A sender-chosen id answers from the sender's arrival on (`waiting`). An id that is neither the name's current transfer nor a kept receipt for this name is 404. Not with `ws` (400). |
| `wait` | `number` | No | query | How long this receiver waits for the sender (and the other receivers of an `n` transfer), in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes it gets 408 `Timed out waiting for sender.` (no sender connected) or `Timed out waiting for receivers.` (the sender is there, fewer than `n` receivers are), and a waiting sender sees `[INFO] A receiver disconnected.` and keeps waiting. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered. |
| `ws` | `string` | No | query | WebSocket relay: open a duplex message connection on the name instead of receiving. Send `GET /{path}?ws` with a WebSocket upgrade (`Upgrade: websocket`; a plain GET is 426). Two peers on the same name are paired 1:1: every message one sends reaches the other with its type (text or binary) and boundaries kept. The first peer is accepted at once (101) and its messages are held until the second arrives (at most 4096 messages / 2 MiB); it waits `wait` seconds (default 300), then is closed with 4408 `Timed out waiting for peer.`. A third peer is 409. Behind HTTP/2 a browser opens the socket over HTTP/1.1 (no extended CONNECT is needed). A name holds one kind of session: a name with an HTTP transfer (sender or receivers) refuses `?ws` with 409, and a name with a WebSocket pair refuses senders and receivers with 409. `?status` reports a pair as `kind: "ws"` with `peers` 0-2; `?progress` sees its state and byte counts. **Subprotocol:** the first peer's `Sec-WebSocket-Protocol` choice (its first offered token, echoed back) is latched for the pair; the second peer must offer that token, or offer none when the first offered none (else 409). **Limits:** messages up to 1 MiB (a bigger one drops its sender's connection: the sender sees 1006, with no close frame, and the other peer is closed with 1009 `Message too big.`). Each direction buffers at most 2 MiB for a slow reader; past that the pair is closed with 1013. Idle peers are pinged; one that does not answer within about 120 s is dropped. **Close codes:** a peer's close is forwarded to the other: 1000-1003, 1007-1014 and 3000-4999 as sent; 1005 (no code) as 1000; anything else (1006, a dropped connection) as 1001 `Peer disconnected.`. The relay's own: 1013 `Relay buffer full: no peer yet.` / `Relay buffer full: the reader is too slow.` / `Relay dropped a message.`, 4408 `Timed out waiting for peer.`, 1011 `Internal error.`, 1001 `Server shutting down.`. Not with `n` (400). `live` with `ws` is 400 before any other check except `status`, with or without an upgrade. `wait` applies as for receivers. **Values:** `?ws` (bare), `true`, `yes`, `1` → WebSocket relay; `false`, `no`, `0` → normal receiver. **Upgrade response:** an accepted peer gets `101 Switching Protocols`; the first peer gets it at once, before the second arrives. |
| `live` | `string` | No | query | Watch a live stream (a sender with `?live`): join at any time, leave and rejoin at will. With no live sender yet, the viewer waits like a receiver (`wait`, default 300 s, then 408 `Timed out waiting for sender.`). The body is a **suffix** of the stream: no `Content-Length`, `X-Hoody-Pipe-Live: 1`, `Cache-Control: no-store`, no `X-Hoody-Pipe-Transfer-Id`. A WebM stream starts with its header, then a Cluster that begins with a video keyframe (any Cluster for audio-only); other bodies start at the next chunk. **Slow viewers:** a viewer that falls 2 MiB behind skips whole Clusters (WebM) until it has caught up to 512 KiB, resuming at a keyframe Cluster. One more than 8 MiB or 4096 pieces behind, one that takes nothing for 60 s, or the most-behind one when the server's live memory budget is full, is cut: its body ends without the chunked terminator. The others are never slowed. **Ending:** after the sender's clean end a viewer takes what it was already sent (up to 60 s), then its body ends normally; if the sender fails, every viewer is cut. A viewer's response counts against the limits until it disconnects, or until 35 s after its body ended. **Plain GET:** a GET without `live` on a name whose live stream is running joins it the same way (a suffix, marked `X-Hoody-Pipe-Live: 1`). While `?live` viewers wait for a sender, a plain GET or `live=0` is 409. `?video&live` serves the player for a live stream; on `?share` (a browser), `live=1` pre-ticks the page's Live box. Not with `n` above 1, `sha256` or `ws` (400). At most 256 viewers per stream and 4096 live viewer responses in all (429). **Values:** `?live` (bare), `true`, `yes`, `1` → watch live; `false`, `no`, `0` → an ordinary receiver (409 on a live name). |
| `sha256` | `string` | No | query | Ask the server to hash the transfer (a receiver can switch it on alone). Read `X-Hoody-Pipe-Transfer-Id`, hash the bytes as you receive them, then compare with `?status&transfer=&lt;id&gt;` (see `transfer`). The digest cannot come in-band: response headers go out before the body, and HTTP trailers are not sent. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. |

**Returns:** `pipe_PipeStatus`

**CLI:** `hoody pipe receive`

---

### `send`

**POST** `/api/v1/pipe/{path}`

Send data to a pipe

```typescript
client.pipe.send(path: string, data?: string | FormData | Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: { n?: number; wait?: number; sha256?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; transfer?: string; live?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; contentType?: 'application/octet-stream' }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`). POST/PUT to a reserved path return 400; any other method except GET/HEAD/OPTIONS returns 405 with `[ERROR] Method &lt;verb&gt; is not allowed.\n` and `Allow: GET, HEAD, OPTIONS`. Examples: `myfile`, `transfer123`, `secret.png`, `logs/today` |
| `data` | `string \| FormData \| Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt;` | No | body |  |
| `n` | `number` | No | query | Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256. |
| `wait` | `number` | No | query | How long this sender waits for its `n` receivers, in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes, the status stream ends with `[ERROR] Timed out waiting for receivers.` Receivers already waiting keep their own `wait`, so another sender may still come for them. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered, so a script is never given a shorter wait than it asked for. **Through the Hoody edge:** a sender whose large body is still waiting is cut after about 30 minutes (the proxy's request-body timeout); receivers and small senders can wait the full hour. For long waits with large files, let the receiver wait (`?wait=3600`) and start the sender once `?status` shows it. |
| `sha256` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | No | query | Compute the SHA-256 of the bytes forwarded to receivers (for multipart, of the file part or `input_text`, which is what receivers get). On a complete transfer the status stream gets `[INFO] SHA-256: &lt;64 hex&gt;` between `[INFO] Upload complete.` and `[INFO] Transfer complete.`, and the digest is in the `?progress` `done` event and in `?status`. A failed transfer has no digest. Any receiver can switch hashing on as well. Hashing adds processing overhead per byte, so it is opt-in. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. |
| `transfer` | `string` | No | query | This transfer's own id instead of a generated one: 16-64 characters `A-Z a-z 0-9 _ -`. A sender cannot read response headers while it uploads, so it picks the id up front to follow its own transfer with `?status&transfer=&lt;id&gt;`. The id is the `transferId` in `?status` from the sender's arrival (also while it waits), the `X-Hoody-Pipe-Transfer-Id` receivers get, and the `done` event's `transferId`. A transfer with its own id leaves a receipt for every outcome, kept 10 minutes: `complete`, or `failed` with its `reason`, also when it ended before streaming (`Timed out waiting for receivers`, `Sender disconnected`, `Server at capacity`). Any other value is 400. An id still held by a waiting, running or finished transfer on any name, or by a kept receipt, is 409. Not with `ws` (400). On a `live` sender it is the live stream's `transferId` in `?status` from the start, and its receipt (`"kind": "live"`, `complete` or `failed`) once it ends; live viewers get no `X-Hoody-Pipe-Transfer-Id`. |
| `live` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | No | query | Live broadcast: start streaming at once, even with no viewers, and let any number of viewers join and leave at any time (`GET /{path}?live`; up to 256 at once). Nothing waits for a receiver and nothing is stored: bytes sent while nobody watches are dropped. Viewers are never in lockstep: one that falls behind skips ahead (WebM: whole Clusters, resuming at a keyframe Cluster) or is cut, and never slows the sender or the others. **WebM bodies** (starting with the EBML magic, e.g. MediaRecorder or `ffmpeg -f webm`) get keyframe joins: a viewer receives the stream header, then the stream from the next Cluster that starts with a video keyframe (any Cluster for audio-only). Join delay is the keyframe interval. **Any other body** (logs, text, other containers) is sent to a viewer from the next chunk on. **Status lines** (at most four): `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` on a clean end, or the idle-timeout / failure `[ERROR]` lines. Viewer counts are on `?progress` and `?status` (`kind: "live"`). **Ending:** a clean end lets each viewer take what it was already sent (up to 60 s), then its body ends normally. A sender that disconnects, fails or idles 5 minutes cuts every viewer (their bodies end without the chunked terminator, which clients report as an error). The name is free for reuse as soon as the sender ends. Not with `n` above 1, `sha256`, `ws` or a multipart body (400). A name with waiting or streaming ordinary transfers, or a WebSocket pair, is 409. At most 100 live streams and 4096 viewer responses at once (429). `wait` is validated but a live sender never waits. **Values:** `?live` (bare), `true`, `yes`, `1` → live; `false`, `no`, `0` → an ordinary sender. |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody pipe send`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
