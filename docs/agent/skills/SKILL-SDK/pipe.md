> _**SDK skill · `pipe` namespace** · ~16,732 tokens · hoody-sdk v1.0.0-beta.15_

# `pipe` — Zero-storage streaming HTTP transfers

## Purpose

HTTP rendezvous. Sender POST/PUTs a path; receivers GET it; bytes fan out
in-memory, zero server storage. Paths exist only while pending/active.

## When to use

- Endpoint-to-endpoint bytes without staging.
- Fan-out (`?n=<count>`, N ≤ 256).
- Live video via `?video`.
- Telemetry via `?progress`.
- Browser send page `/` (file, text or pasted image; receive link + QR), no-JS form `/noscript`.

## When NOT to use

Persist → `files`, HTTP client → `curl`, shell → `terminal`; no replay/queue (no storage).

## Prerequisites

- All peers share kit URL, `{path}`, `n`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

Send with `client.pipe.send` (per-call request headers go in `{ headers }`). The generated pipe service has no receive method: receive with `PipeStream` (Node entry of `hoody-sdk`; `const ps = PipeStream.fromClient(client, container)`), whose `ps.receive(path, { n, download, filename, wait, sha256, live, signal })` resolves once the sender starts, with `{ body, headers, status, transferId }`: `body` is a `ReadableStream<Uint8Array>` and `headers` the forwarded response headers. A non-2xx answer throws. In a browser, `PipeBrowser.receive` gives the same shape.

### 1. One-to-one

`ps.receive` with `path` (resolves once a sender arrives; read `body` to the end); `pipe.send` same `path`. `n=1`.

### 2. Fan-out (N ≤ 256)

All peers use the same `path` and the same receiver count (`n: N`). A mismatch → 400.

### 3. Download / inline per receiver

`ps.receive` with `download: true` and/or `filename` → attachment; `download: false` → inline.

### 4. Watch via `?progress`

Open an `EventSource` on the transfer URL with `?progress=1` for live SSE events, or open that URL in a browser for the HTML dashboard. From Node, `ps.subscribeProgress(path)` (`PipeStream`) yields the same events. `ps.receive` is a receiver, not a spectator: it takes a slot and gets the data. No receiver slot.

### 5. Video via `?video`

Open the transfer URL with `?video=1` in a browser → MSE player. `ps.receive(path)` does not ask for HTML, so it gets the raw bytes. Sender: WebM / fMP4 (MPEG-TS plays in VLC/mpv, not in the browser player).

### 6. Page links a person only confirms

Compose one URL with every control filled in; the person opens it and clicks (capture and file picks always need their click). Invalid values fall back to the page defaults. `<kit>` is the kit URL; `<name>` is encoded per `/` segment.

Send page `<kit>/api/v1/pipe/?name=<name>&…`:

| Param | Values | Effect |
|---|---|---|
| `name` | ≤1024 chars | pipe name (absent → random) |
| `n` | 1–256 | receiver count |
| `text` | ≤100000 chars | text to send; selects text mode |
| `mode` | `file` \| `text` | form mode |
| `filename` | ≤255 chars | name the receiver gets for a text or pasted image |
| `autostart` | `1` | text mode with a text and a name: send on open, no click |

Receive page `<kit>/api/v1/pipe/<name>?receive&…`:

| Param | Values | Effect |
|---|---|---|
| `n` | 1–256 | receiver count, the sender's `n` |
| `filename` | ≤255 chars | download name |
| `autostart` | `1` | start the download on open, no click |

Share page `<kit>/api/v1/pipe/<name>?share&…` (viewers open the video page):

| Param | Values | Effect |
|---|---|---|
| `source` | `screen` \| `camera` \| `audio` | what to capture (default `screen`) |
| `audio` | `1` \| `0` | include the screen's audio |
| `surface` | `monitor` \| `window` \| `browser` | kind offered first in the screen picker |
| `quality` | `low` \| `medium` \| `high` | up to 480p / 720p / 1080p (default `medium`) |
| `fps` | 1–60 | frame rate (default 30) |
| `n` | 1–256 | viewer count |
| `live` | `1` | live broadcast: starts at once, viewers join and leave at any time through `?video&live=1`; `n` does not apply |

Video page `<kit>/api/v1/pipe/<name>?video&n=<n>&live=1&wait=<s>` (`n` only when >1, not with `live`; `live=1` plays a live broadcast; `wait` 1-3600 s is how long the player waits for the stream; opening it receives). Progress page `<kit>/api/v1/pipe/<name>?progress` (no params, no slot). No-JS form `<kit>/api/v1/pipe/noscript?path=<name>&mode=file|text&wait=<s>&sha256=1` (`wait` and `sha256` go on to its upload).

In a browser, `PipeBrowser` and `PipeMedia` (from `hoody-sdk`, `fromClient(client, container)` or `{ pipeBaseUrl }`) have `getPageUrl(page, name, options)` and `openPage(page, name, options)` for `send`, `receive`, `share`, `video`, `progress`, `noscript`; options use the param names above (`autostart: true`, `audio: true|false`, `sha256: true`, `live: true`, `wait: <s>`; `wait`/`sha256` on receive and noscript, `live`/`wait` on video). A wrong option, out-of-range value, reserved name (see Quirks), `.`/`..` segment or over-long name throws. The `noscript` link carries the name encoded as in the pipe URL in its `path` (so its form posts to the same pipe) and refuses a name with `/`. `PipeBrowser` also has `sendFile(path, File|Blob|string|ArrayBuffer, { n, filename, contentType, transfer, onProgress, onStatus, signal })` (resolves when the transfer completes, rejects with `PipeTransferError`), `receive(path, { n, signal })` → `{ body, headers, status }`, `download(path, { n, filename })` (browser download manager) and `subscribeProgress(path)` (same events as `PipeStream`). `PipeMedia.shareAudio({ microphone, systemAudio, n })` streams audio only; listeners open `session.url` (`?video`). A share session (`shareScreen`, `shareWebcam`, `shareAudio`) uploads with its own transfer id (`?transfer=`, `session.transferId`) and follows only that transfer (`?status&transfer=<id>` and its `done` event), so another transfer on the name never ends it. It stops the capture when its transfer ends; `session.done` rejects with `PipeTransferError` when it failed (nobody joined in 5 minutes, every viewer left, idle timeout, network, an id in use (409), or its transfer unknown to the kit for about 30 s after it was seen), and a bad `path` throws before capture starts. The recording follows the upload: once 8 MiB of it wait to be sent (no receiver reading yet, a slow network) the recorder pauses (`session.paused` is true), and it resumes when the upload is back to 4 MiB behind; a pause by `session.pause()` stays until `session.resume()`. More than 16 MiB waiting ends the share and `session.done` rejects. Embed views `pipe.send`, `pipe.share`, `pipe.receive` take the same params except `autostart`; framing the share page needs `allow="display-capture; camera; microphone; autoplay"`.

### 7. Status, waiting time and checksums

`?status` is one JSON snapshot of a name, with no receiver slot: `state` (`idle`, `waiting`, `streaming`, `complete`, `failed`), `kind` (`pipe`, `ws`, `live` or null), `peers`, `transferId`, `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed`, `eta`, `elapsed`, `reason`, `sha256`. `?wait=<s>` (1-3600, default 300) sets how long one sender or receiver waits for the other side. `?sha256` (sender or any receiver) has the kit hash the stream; receivers get the transfer id in `X-Hoody-Pipe-Transfer-Id`, and `?status&transfer=<id>` returns that transfer, for a hashed one also for 10 min after it ends. Prometheus metrics: `GET /api/v1/pipe/metrics`.

Through `PipeStream` (`const ps = PipeStream.fromClient(client, container)`; `PipeBrowser` has `status` too): `ps.status(path, { transfer? })` returns the snapshot. `ps.send` also takes `transfer` (its own transfer id, 16-64 of A-Z a-z 0-9 `_` `-`; the kit uses it as the transfer id, so `ps.status(path, { transfer })` reads this transfer from admission on; an id in use → 409; `PipeBrowser.sendFile` too). `ps.send` and `ps.receive` take `wait` and `sha256`: on send the result's `sha256` promise gives the kit's digest (null when not hashed or failed); on receive `sha256: true` hashes the body while it is read and `verified` rejects with `PipeIntegrityError` (`kind` `mismatch`, `unavailable` or `incomplete`) unless it matches the kit's digest. `ps.send` returns once the kit takes the upload. Its `done` resolves only when the kit's last status line confirms the transfer (`Transfer complete.`, or `Live stream ended (peak N viewers).` for `live`); otherwise it rejects with `PipeTransferError`, whose `message` is the kit's text (`Timed out waiting for receivers.`, `All receivers disconnected before transfer completed.`, an idle timeout) or `pipe send failed: the response ended before the transfer completed`, with `status` and the status lines in `messages`. A refused send (non-2xx) throws `PipeTransferError` with that `status`. `ps.send` `filename` goes in `Content-Disposition` as `PipeBrowser.sendFile` sends it: a non-ASCII name as RFC 5987 `filename*` plus an ASCII fallback. `ps.metrics()` returns the metrics text.

### 8. Live broadcast (`?live`)

A live sender streams at once, with nobody watching; any number of viewers (256 at once) join and leave while it runs and each gets the stream from then on (no `Content-Length`, header `X-Hoody-Pipe-Live: 1`; the headers come with the viewer's first bytes). WebM joins at the next keyframe Cluster after the stream header, so players decode it; anything else joins at the next chunk. Bytes sent while nobody watches are dropped. A viewer 8 MiB or 4096 pieces behind, taking nothing for 60 s, or furthest behind when the live memory budget (64 MiB per stream, 512 MiB in all) is full is cut: its body ends with an error. A clean sender end gives each viewer up to 60 s to finish; a sender that disconnects, fails or idles 5 min cuts every viewer. Sender status: `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` or an `[ERROR]` line. `?status` shows `kind: "live"`, viewers in `activeReceivers`, `totalReceivers: null`; `?progress` events carry `live: true`. Not with `n` above 1, `sha256`, `ws` or multipart (400); a live sender on a name with an ordinary transfer, an ordinary sender on a live name, or a plain GET while `?live` viewers wait → 409 (a plain GET on a running live stream joins it). Caps: 100 live streams, 4096 viewer responses in all (each counts until it disconnects or 35 s after its body ended) → 429.
`ps.send(path, source, { live: true })` and `ps.receive(path, { live: true })` (`PipeStream`); `PipeBrowser.receive(path, { live: true })`; `PipeMedia.shareScreen|shareWebcam|shareAudio({ live: true })` (WebM only; asks the recorder for a keyframe every 2 s; `session.url` carries `live`), `sendStream`/`receiveStream`/`receiveMedia` `{ live: true }`, `getPageUrl('video'|'share', name, { live: true })`. `subscribeProgress` (`PipeStream` and `PipeBrowser`) sets `live: true` on a live stream's `state` and `progress` events (false otherwise), and a live `state` event's `totalReceivers` is null. `live` with `n` above 1 or `sha256`, or a share with a non-WebM `mimeType`, throws before any request or capture. With Node's fetch the sender's request goes out with the first body chunk. A `PipeStream` live viewer under Bun is never skipped or cut for reading slowly: Bun's `fetch` reads the body ahead without backpressure, so the kit sees it keeping up and the backlog grows in the viewer's own memory instead. Under Node a slow viewer is skipped and cut as described.

## Quirks & gotchas

- Available over SDK, HTTP and the `hoody pipe` CLI.
- `/api/v1/pipe/{path}` ≡ bare `/{path}` for transfer paths, except a name equal to `api/v1/pipe` or starting with `api/v1/pipe/` (the prefix is stripped once, so those are reachable only under the prefix: `/api/v1/pipe/api/v1/pipe/x` is the pipe `api/v1/pipe/x`). Health is the other exception: `/api/v1/pipe/health` answers GET/HEAD/OPTIONS, and a bare `/health` returns 404; both are matched case-insensitively with one trailing `/` or `.` allowed (`/api/v1/pipe/health/` is health, `/Health` is 404). Percent-escapes in a name match regardless of hex case (`caf%c3%a9` = `caf%C3%A9`) but are not decoded (`%41` ≠ `A`).
- Reserved: `/`, `/noscript`, `/help`, `/favicon.ico`, `/robots.txt` (alias-hardened). `health` and `metrics` are not pipe names either: under the prefix they are the health and metrics endpoints, and at the root they answer 404. The SDK (`PipeStream`, `PipeBrowser`, `PipeMedia`, page URLs) and the CLI refuse all of these before any request, and every SDK URL builder (`getUrl`, `getWsUrl`, `getDownloadUrl`, `getPageUrl`) throws on them, matched as the kit matches them: case-insensitive, one trailing `/` then one trailing `.` ignored, so `Metrics.`, `help/` and an empty name are refused. Runs of `/` are merged first, so `/help`, `//metrics` and `metrics//` are refused too: the kit itself serves `/help` as the pipe `//help`, but an edge that merges slashes would send it to the help page.
- `n` ≤ 256; peers must agree. Caps 1000 pending + 1000 active.
- The kit limits the path name (the pathname after the `/api/v1/pipe` prefix is removed, leading `/` not counted) to 1024 characters, the same cap the SDK and CLI check. Percent-encoding counts against the kit's limit, so a name with characters the URL must encode can pass the SDK and CLI check and still get 414. That is the only length limit the kit applies: there is no total-URL cap in the kit, so an extremely long URL is refused (if at all) by the HTTP server in front of it, with a differently shaped error. Control characters, backslashes and encoded slashes → 400.
- A sender or receiver waits for the other side for its own `?wait` (default 5 min, at most 1 h); an active transfer idle for 5 min is ended.
- Dangerous sender MIME (HTML/SVG/JS) → `text/plain`; `nosniff` forced.
- Forwarded sender→receiver headers: `Content-Type` (sanitized — dangerous MIME → `text/plain`), `Content-Length` (only for a non-multipart body, and only when the value is 1–19 plain digits; multipart transfers are sent without it), `X-Piping`, `X-Hoody-Pipe` (each ≤8 KiB, CRLF-stripped). `Content-Disposition` is rebuilt per-receiver from sender metadata + receiver `?download`/`?filename` params.
- `?download` enum (SDK-validated): `"true"`/`"false"`/`"yes"`/`"no"`/`"1"`/`"0"` (attach / inline). The kit is more permissive — bare `?download` (no value) and any non-`false`/`no`/`0` string are treated as truthy. `?filename=<v>` implies attach, sanitised (255 chars, RFC 5987), unless the same receiver also sent an explicit `download=false`/`no`/`0`, which suppresses Content-Disposition entirely. 
- `?video` HTML player only on `Accept: text/html`; no receiver slot. A valid `?wait` on the player URL is used by each of its receives; an invalid one is ignored. It plays each stream to its end, even a short file that arrives all at once, then waits on the same path: the next stream sent there replaces it. Audio-only WebM (Opus/Vorbis) plays as audio; with `?n=N` the players may be tabs of one browser. It never skips content (a stream that fell behind stays behind; it reads at most 45 s ahead). Playback stopped 1.5 s with media buffered ahead moves on to it.
- `?progress` no receiver slot. Caps: 50/path, 500 groups, 30 min TTL.
- `?receive` and `?share` serve pages only on `Accept: text/html` (a browser); any other client gets the data as a plain receiver, like `?video`. With several page params on one URL a browser gets `?progress`, then `?video`, then `?share`, then `?receive`; `=0`/`false`/`no` turns one off.
- `?receive` page: shows the name and whether a sender waits (from `?progress`, no slot). On the person's click — or by itself with `autostart=1` — the browser's download manager receives `?download` (plus `n`, `filename`, and the page's own `wait` and `sha256`), so any size goes to disk without passing through the page. Progress and the result are only in the browser's downloads list: the page cannot see the download, so after Receive it stays `Receiving in your browser` and never reports success. Its only outcome is `Failed` with the kit's error text when the download frame gets one (`Timed out waiting for sender.` after 5 min or the page's `wait`, an `n` mismatch, a taken slot); `?progress` state snapshots fill an info line labelled "Status for this name" (all its senders and receivers, not this download: no sender yet / sender waiting for receivers / transfer running; "Status unavailable, retrying…" while the stream is down) and never set an outcome. Cancel frees the slot while waiting (a started download goes on in the browser's downloads); Receive again after a failure retries. Pre-fill: `n` (invalid → 1, max 256), `filename` (sanitized like `?filename`), `autostart=1` (only `1`/`true`/`yes`/bare), `wait` (1-3600 s; invalid → dropped), `sha256` (forwarded only; the page shows no checksum).
- `?share` page: shares the screen (with its audio if ticked), the camera with the microphone, or the microphone only, live to the `?video` player.
  - Start sharing asks the browser for the capture (the person's click), then sends one WebM stream to the name and shows a viewer link (Copy + QR) to `<name>?video` (plus `&n=`).
  - The stream starts when all `n` viewers have opened the link; until then the page shows `Waiting for viewers… x of n connected`. Live shows viewers, elapsed time and bytes sent (from `?progress`, no slot).
  - Stop, or the browser's own stop-sharing control, ends the stream; Start sharing again shares on the same name and players still open on the link play it.
  - It ends with a message when nobody (or not all `n`) opened the link within 5 min, all viewers left, the name is busy, the kit refused the share (its error text), or the connection cannot keep up.
  - It needs a browser that can stream an upload (Chromium-based) over HTTPS with HTTP/2 or HTTP/3; any other browser gets a message instead of a start. It stores nothing in the browser.
  - Pre-fill: `source=screen|camera|audio`, `audio=1` (screen audio), `surface=monitor|window|browser` (offered first in the picker), `quality=low|medium|high` (up to 480p/720p/1080p), `fps` (1–60, default 30), `n` (1–256). Invalid values fall back to the defaults; capture still needs the click on Start sharing.
- `/` (also `/api/v1/pipe/`) is the send page.
  - It sends one file, a typed or pasted text, or a pasted image (sent as a file).
  - It fills in a random name that the person can edit, plus `n`. Send/Cancel uses one POST to `/api/v1/pipe/<name>`: each `/`-separated part of the name is encoded, so `?`, `#` and `%` stay in the name, and leading `/` are kept. A name with a `.` or `..` part (also `%2e`) is refused before sending, as in the SDK.
  - The file name, or `filename` for a text or pasted image, goes in `Content-Disposition`. A typed or URL-given file name is kept when a file is picked or pasted.
  - It reports Delivered only when the POST response ends with `[INFO] Transfer complete.`; any other ending is shown as Failed. Each `[INFO] A receiver disconnected.` after `[INFO] Streaming to …` is a receiver that did not get everything: `Delivered to 1 of 2 receivers (1 disconnected).`
  - It shows the connected receivers and the state from `?progress` (no slot). It shows a receive link (Copy + QR) to `<name>?receive` (plus `&n=`).
  - Cancel frees the name. The page stores nothing in the browser and sends a nonce CSP with `connect-src 'self'`.
  - Pre-fill: `name` (≤1024; absent → random), `n` (1–256, invalid → 1), `text` (≤100000, selects text mode), `mode=file|text`, `filename` (≤255), `autostart=1` (text mode with a text only; never for a file; a refused name shows the reason instead). Over-long values are cut without splitting a character.
- To hand a person a ready send link, build `<kit>/api/v1/pipe/?name=<name>&text=<text>` (add `&autostart=1` to send it on open, `&filename=<name.ext>`, `&n=N`). For a file, give `?name=<name>`: they pick the file and click Send.
- WebSocket relay: `GET /{name}?ws` with an upgrade pairs exactly two peers. Messages pass both ways with their type and boundaries kept, at most 1 MiB each. The first peer's messages are held (4096 / 2 MiB) until the second arrives (`?wait`, default 300 s, then close `4408`). A slow reader more than 2 MiB behind closes the pair with `1013`. Close codes 1000-1003, 1007-1014 and 3000-4999 are forwarded; a drop arrives as `1001`. The first peer's subprotocol binds the pair. A name holds either a transfer or a pair, never both (409 both ways); `?status` shows `kind: "ws"`, `peers`. SDK: `PipeStream.connect(name, { wait, protocols, signal })` → `{ readable, writable, closed, close }`, one chunk = one message; a refusal is a `PipeWsError` with `.status`; `forwardTcp({ transport: 'ws', path, listen|connect })`.
- To hand a person a ready receive link, build `<kit>/api/v1/pipe/<name>?receive&autostart=1&filename=<name.ext>` (add `&n=N` for N receivers); they open it and the file lands in their downloads when the sender sends. A share link is `<kit>/api/v1/pipe/<name>?share&source=screen|camera|audio` (capture still needs their click on Start); viewers open `<kit>/api/v1/pipe/<name>?video`.
- `Service-Worker: script` → 400.
- `Content-Range` on POST/PUT → 400.
- Multipart: the **first file part** wins. Non-file parts before it are drained; the transfer ends when that part ends; anything after it is ignored, and the body stops being read once the transfer finishes. A body cut off or dropped before that part ends fails the transfer (sender `[ERROR] Transfer failed`, waiting receivers 500). With no file part, the first `input_text` field is delivered instead (as `text/plain; charset=utf-8`, no disposition); a text field over 1 MiB fails the transfer. The 30 s deadline covers only the wait for the first file or `input_text` part; after that the 5 min idle limit applies.

## Common errors

- 400 — active / sender attached / `n` mismatch / slots full / `n`>256 / reserved / forbidden chars / `Service-Worker` / `Content-Range`.
- 405 — method. HEAD works only on the reserved pages, `/api/v1/pipe/health`, `/api/v1/pipe/metrics` and `?status`; transfer paths accept GET, POST, PUT and OPTIONS. On a reserved page or health, the 405 carries `Allow: GET, HEAD, OPTIONS` (POST/PUT to a reserved page are 400, to health 405).
- 408 — a waiting receiver whose own `?wait` (default 5 min) passes before the pipe is established gets it; the others keep waiting. The body names the missing side: `[ERROR] Timed out waiting for sender.` when no sender is attached, `[ERROR] Timed out waiting for receivers.` when the sender is attached but some of the `n` receivers never came. The sender has already had its `200` response; it learns of the timeout only from `[ERROR] Timed out waiting for receivers.` in its streamed status body.
- 409 — `?ws` on a name with two peers already, with a transfer, or with a different subprotocol than the first peer's; a sender or receiver on a name that holds a WebSocket pair; a sender whose `?transfer=<id>` is still in use (`[ERROR] Transfer id already in use.`).
- 426 — `?ws` without a WebSocket upgrade.
- 414 — path name (leading `/` not counted) over 1024 characters.
- 429 — pending-transfer cap, spectator caps, and, for receivers, the active-transfer cap. A sender that hits the active-transfer cap has already had its `200`; it gets `[ERROR] Server at maximum active transfer capacity.` in its status body.

## Related namespaces

`files` persist · `curl` HTTP client · `tunnel` long-lived bidi · `terminal`/`exec` shell.

## Examples

Each example has HTTP, CLI and SDK forms. The CLI forms use the `hoody pipe` subcommands.  Set `P`, `C`, `N` (project id,
container id, server name) from `containers.get` first, then
`KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"`.

Pipe paths are reservations: receivers and senders rendezvous on the same path.
Pick a unique path (e.g. `transfer-$(openssl rand -hex 4)`) per transfer — once
it's claimed by a sender or receiver, the same path can't host another transfer
until the first one finishes or the 5-min idle TTL evicts it.

### 1. One-to-one transfer — receiver waits, sender pushes bytes

**Goal:** stream a payload from one endpoint to another with zero staging. Receiver opens the GET first; the connection blocks until the sender POSTs to the same path.

**Step 1 — start the receiver in the background.** It blocks until the sender connects.

```typescript
import { PipeStream } from 'hoody-sdk';
// `container` is the container record (from containers.get) the pipe kit runs in.
const ps = PipeStream.fromClient(client, container);
const pathName = `transfer-${crypto.randomUUID().slice(0, 8)}`;
// ps.receive resolves once the sender arrives; read its body stream to the end.
const recvPromise = ps.receive(pathName)
  .then(async (r) => new Uint8Array(await new Response(r.body).arrayBuffer()));
```

**Step 2 — send the bytes.** Sender's response is a streamed `[INFO]` log:
```
[INFO] Waiting for 1 receiver(s) to connect...
[INFO] 1 receiver(s) already connected.
[INFO] Streaming to 1 receiver(s)...
[INFO] Upload complete.
[INFO] Transfer complete.
```

```typescript
// `data` accepts a string, Blob, ArrayBuffer, Uint8Array, FormData or ReadableStream.
await client.pipe.send(pathName, new Blob(['hello pipe!'], { type: 'text/plain' }));
const received = await recvPromise;
console.log(new TextDecoder().decode(received)); // → hello pipe!
```

### 2. Fan-out 1-to-3 — one sender, three receivers

**Goal:** broadcast the same bytes to three endpoints in lockstep. All four parties (3 receivers + 1 sender) must agree on `n=3`; mismatch → 400.

**Step 1 — open three receivers.** Each must pass `?n=3`.

```typescript
const pathName = `broadcast-${crypto.randomUUID().slice(0, 8)}`;
// ps = PipeStream.fromClient(client, container), as in example 1
const receivers = [1, 2, 3].map(() =>
  ps.receive(pathName, { n: 3 })
    .then(async (r) => new Uint8Array(await new Response(r.body).arrayBuffer()))
);
```

**Step 2 — send once; all three receivers get an identical copy.** Lockstep fan-out: the slowest receiver paces the transfer.

```typescript
await client.pipe.send(pathName, new Blob(['fan-out-payload'], { type: 'text/plain' }), { n: 3 });
const all = await Promise.all(receivers);
// all three Uint8Arrays are byte-identical
```

### 3. Force a download with a custom filename

**Goal:** make the browser save the response to disk with a specific name, regardless of what (or whether) the sender provided a `Content-Disposition`. `?filename=<v>` implies `?download` and overrides any sender-supplied filename, unless the same receiver passes `?download=0` (which drops Content-Disposition entirely).

**Response header:** `content-disposition: attachment; filename="report.bin"`.

```typescript
const pathName = `dl-${crypto.randomUUID().slice(0, 8)}`;
// ps = PipeStream.fromClient(client, container), as in example 1
const recv = ps.receive(pathName, { download: true, filename: 'report.bin' })
  .then(async (r) => ({ headers: r.headers, bytes: new Uint8Array(await new Response(r.body).arrayBuffer()) }));
await client.pipe.send(pathName, new Blob(['BINARYPAYLOAD'], { type: 'application/octet-stream' }));
const r = await recv;
console.log(r.headers.get('content-disposition')); // → attachment; filename="report.bin"
// r.bytes holds the payload; in a browser, PipeBrowser.download(path, { filename }) hands it to the download manager
```

### 4. Force inline display, overriding a sender's `attachment`

**Goal:** the sender (e.g. a legacy script) marks every payload as `Content-Disposition: attachment; filename="leaked.txt"`, but you want to render it inline in your app. `?download=0` strips Content-Disposition entirely on the receiver side — per receiver, not globally.

**Result:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got `content-type: text/plain` only — no Content-Disposition.

```typescript
const pathName = `inline-${crypto.randomUUID().slice(0, 8)}`;
// ps = PipeStream.fromClient(client, container), as in example 1.
// Open the receiver BEFORE starting the sender (a GET after the transfer starts a new rendezvous).
const recv = ps.receive(pathName, { download: false })
  .then(async (r) => ({ headers: r.headers, text: await new Response(r.body).text() }));
await client.pipe.send(pathName, new Blob(['inline body'], { type: 'text/plain' }), {
  headers: { 'Content-Disposition': 'attachment; filename="leaked.txt"' },
});
const r = await recv;
console.log(r.headers.get('content-disposition')); // → null
console.log(r.text);                               // → inline body
```

### 5. Watch a transfer with `?progress` (SSE)

**Goal:** monitor live state + bytes/sec from a third process, without consuming a receiver slot. `?progress=1` with `Accept: text/event-stream` returns SSE events; the spectator never blocks the transfer.

**SSE stream** for a 50 KB payload:
```
event: state    data: {"state":"idle",...}
event: state    data: {"state":"waiting","hasSender":true,"activeReceivers":1,...}
event: state    data: {"state":"streaming",...}
event: progress data: {"bytesTransferred":50000,"totalBytes":50000,...}
event: done     data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857}
```

Only `done` says how a transfer ended. A failed one sends `{"state":"failed",…,"reason":"Sender disconnected"}`; `state` events carry only `idle`, `waiting` and `streaming`. A spectator that connects within 30 s after a transfer ends gets `204` and no events.

```typescript
// Browser/Node: use EventSource with the kit URL directly
const url = `${kitUrl}/api/v1/pipe/${pathName}?progress=1`;
const es = new EventSource(url, { withCredentials: false });
es.addEventListener('state',    e => console.log('state', JSON.parse((e as MessageEvent).data)));
es.addEventListener('progress', e => console.log('progress', JSON.parse((e as MessageEvent).data)));
es.addEventListener('done',     e => { console.log('done', (e as MessageEvent).data); es.close(); });
```

### 6. Embed an HTML transfer dashboard

**Goal:** give a non-technical user a live dashboard view of an in-flight transfer. Same `?progress=1` endpoint, but `Accept: text/html` returns a self-contained HTML page (CSP nonces, EventSource client baked in). Pop it in an `<iframe>` or open it in a new tab.

**Result:** ~6 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

```typescript
// Just point the browser at the URL — no SDK call needed:
const dashUrl = `${kitUrl}/api/v1/pipe/${pathName}?progress=1`;
window.open(dashUrl, '_blank');
// Or embed:
//   <iframe src={dashUrl} sandbox="allow-scripts" />
```

### 7. Stream a screen-recording to an MSE video player

**Goal:** stream live WebM or fragmented MP4 from `ffmpeg` and watch it in a browser without serving a separate frontend. MPEG-TS plays only in a media player (VLC, mpv): the page tells a browser viewer so. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Result:** ~7.7 KB HTML page titled `"Hoody Pipe — Video"` with `MediaSource` + `data-path` baked in.

```typescript
// Player URL is just a browser navigation — open it directly:
const playerUrl = `${kitUrl}/api/v1/pipe/${pathName}?video=1`;
window.open(playerUrl, '_blank');
// To push the encode from Node, stream a ReadableStream into pipe.send (raw fetch
// preserves backpressure better than the SDK wrapper for unbounded uploads).
```

### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, skips the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Result:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

```typescript
const pathName = `upload-${crypto.randomUUID().slice(0, 8)}`;
// ps = PipeStream.fromClient(client, container), as in example 1
const recv = ps.receive(pathName)
  .then(async (r) => ({ headers: r.headers, text: await new Response(r.body).text() }));
const fd = new FormData();
fd.append('field1', 'ignored-form-field');
fd.append('file', new Blob(['first-file-content'], { type: 'text/plain' }), 'a.txt');
fd.append('extra', new Blob(['second-file-content'], { type: 'text/plain' }), 'b.txt');
await client.pipe.send(pathName, fd);
const r = await recv;
console.log(r.text);                               // → first-file-content (b.txt is dropped server-side)
console.log(r.headers.get('content-disposition')); // → attachment; filename="a.txt"
```

### 9. Path / URL length limits — 1024-char path name is the cap

**Goal:** know what blows up at the validator. The kit counts the path name after the `/api/v1/pipe` prefix, leading `/` not counted: a path name over 1024 characters → `414 Path too long`. That path cap is the only length limit the kit itself enforces.

**Result:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- A 1024-char path name is the longest the kit accepts, matching the SDK and CLI checks; 1025 characters gets `414`.

```typescript
// The SDK rejects names over 1024 characters BEFORE hitting the network
// (the kit accepts the same 1024-character maximum):
try {
  await client.pipe.send('x'.repeat(1100), new Blob(['data'], { type: 'text/plain' }));
} catch (e: any) {
  console.log(e.message); // → "path must be at most 1024 characters" (ps.send: "pipe path must be <= 1024 characters")
}
```

### 10. Sidechannel metadata via `X-Hoody-Pipe`

**Goal:** attach commit / build / job metadata to the transfer without polluting the body. The kit forwards `X-Hoody-Pipe` and `X-Piping` (≤ 8 KiB each, CRLF-stripped) to receivers and exposes them via `Access-Control-Expose-Headers` so browsers can read them.

**Response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Piping, X-Hoody-Pipe
x-hoody-pipe: build-id=42; commit=abc1234
x-piping: legacy-meta=true
```

```typescript
// client.pipe.send merges per-call request headers from `{ headers }`. Its
// `ApiResponse<T>` carries no response headers, so receive with PipeStream,
// whose result has `headers` (ps = PipeStream.fromClient(client, container)).
const pathName = `meta-${crypto.randomUUID().slice(0, 8)}`;
const recv = ps.receive(pathName)
  .then(async (r) => ({ headers: r.headers, text: await new Response(r.body).text() }));
await client.pipe.send(pathName, new Blob(['metadata payload'], { type: 'application/octet-stream' }), {
  headers: {
    'X-Hoody-Pipe': 'build-id=42; commit=abc1234',
    'X-Piping':     'legacy-meta=true',
  },
});
const res = await recv;
console.log(res.headers.get('x-hoody-pipe')); // → "build-id=42; commit=abc1234"
console.log(res.headers.get('x-piping'));     // → "legacy-meta=true"
```

## Reference

**Accessor:** `client.pipe`  |  **Import:** `import * as pipe from 'hoody-sdk/pipe'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.pipe.kit` (3) — info

#### `getHealth` — Service health check

```typescript
client.pipe.kit.getHealth()
```

**Returns:** `Promise<PipeKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/pipe/health`
**CLI:** `hoody pipe health`

---

#### `getHelp` — Get help text with curl examples

```typescript
client.pipe.kit.getHelp()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/pipe/help`
**CLI:** `hoody pipe cheatsheet get`

---

#### `getMetrics` — Service metrics (Prometheus)

```typescript
client.pipe.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/pipe/metrics`
**CLI:** `hoody pipe metrics`

---

### `client.pipe` (3) — pipe

#### `getStatus` — Pipe status headers (HEAD ?status)

```typescript
client.pipe.getStatus(path: string, options: { status: "" | "true" | "yes" | "1" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Pipe path name |
| `status` | `"" \| "true" \| "yes" \| "1"` | query | Yes | Must be on (`?status`, `true`, `yes`, `1`) |

**Returns:** `Promise<ApiResponse<Record<string, string>>>`  |  **HTTP:** `HEAD /api/v1/pipe/{path}`
**CLI:** `hoody pipe status`

---

#### `receive` — Receive data from a pipe

```typescript
client.pipe.receive(path: string, options?: { n?: number; download?: "true" | "false" | "yes" | "no" | "1" | "0"; filename?: string; video?: "true" | "false" | "yes" | "no" | "1" | "0"; progress?: "true" | "false" | "yes" | "no" | "1" | "0"; receive?: "true" | "false" | "yes" | "no" | "1" | "0"; share?: "true" | "false" | "yes" | "no" | "1" | "0"; autostart?: "1" | "true" | "yes" | "0" | "false" | "no"; source?: "screen" | "camera" | "audio"; audio?: "1" | "true" | "yes" | "0" | "false" | "no"; surface?: "monitor" | "window" | "browser"; quality?: "low" | "medium" | "high"; fps?: number; status?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; transfer?: string; wait?: number; ws?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; live?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; sha256?: "" | "true" | "false" | "yes" | "no" | "1" | "0" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Pipe path name to receive from — must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. |
| `n` | `number` | query | No | Expected number of receivers. Must match the sender's `n` value exactly — a mismatch returns 400. When `n > 1`, the pipe waits for all `n` receivers and the sender before streaming. With `video`, `share` or `receive` (browser pages), `n` is the receiver or viewer count the page uses; there an invalid value becomes 1 and a value above 256 becomes 256. |
| `download` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Control whether the response triggers a browser download. `?download` (bare), `?download=true`, `?download=yes`, `?download=1` — force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. `?download=false`, `?download=no`, `?download=0` — suppress `Content-Disposition` entirely, even if sender set one (forces inline display). Absent — passthrough sender's Content-Disposition as-is. Multipart `form-data` dispositions are auto-converted to `attachment`. Works per-receiver — with `n=2`, one receiver can have `?download` and the other can display inline. |
| `filename` | `string` | query | No | Set a custom download filename. Implies `?download` — the response will have `Content-Disposition: attachment; filename="<value>"`. **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header. **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding. Filenames that sanitize to empty fall back to bare `attachment`. With `receive` (browser page), the sanitized value pre-fills the page's "Save as" field and names the download. |
| `video` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally — no pipe receiver slot is consumed by the page itself. **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser). Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream — ensuring automatic compatibility with media players. **Auto-detection:** The player detects the container/codec from the stream's first bytes: WebM (VP8/VP9/AV1 + Opus/Vorbis), or audio-only WebM (Opus/Vorbis); MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC); MPEG-TS is recognized, but most browsers cannot play it: the player then says so. Play MPEG-TS in a media player (VLC, mpv, ffplay) from the same URL. **UI features:** Click to unmute (autoplay requires muted); Right-click to pause/resume; Status overlay: "Waiting for stream…", "Connected", "Stream ended"; for audio-only streams a lasting "Audio — click to unmute" / "Playing audio"; Plays each stream to its end, including a short file that arrives all at once, and keeps waiting on the path: the next stream sent there replaces it; With `?n=N`, the N players may be tabs of one browser; Never skips content: a stream that fell behind stays behind; the player reads at most 45 s ahead of playback; Playback that stops for 1.5 s with media buffered ahead moves on to that media; A valid `wait` on the player URL is used by each of its receives (how long it waits for a sender); an invalid one is ignored and the default applies **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver. **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`. Pipe path HTML-escaped in `data-path` attribute. |
| `progress` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot — spectators are completely independent of the transfer. **Accept header routing:** `Accept: text/event-stream` → SSE stream (EventSource, curl); `Accept: text/html` → HTML dashboard page (browser); `Accept: */*` or missing → SSE stream (default to data, not markup) **SSE event types:** `state` — State transitions: idle → waiting → streaming → complete/failed; `progress` — During streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers; `done` — Terminal event: final stats (bytesTransferred, duration, avgSpeed, `reason` when failed, `sha256` — the digest with `?sha256` on a complete transfer, else null — and `transferId`); On a live stream (`live`), every `state` and `progress` event (the first ones a spectator gets on connecting included) also carries `live: true` and `totalReceivers: null`; `activeReceivers` is the viewers watching now, and a viewer joining or leaving sends a `progress` event (within the 250 ms throttle). `totalBytes` and `eta` are null. **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed` **DoS protections:** Max 50 spectators per path, 500 total groups, 30-min connection TTL, 30s post-transfer linger. **After a transfer:** after a transfer on the path finishes, the SSE request is answered `204 No Content` for up to 30 s, until the path is used again (no stream, so EventSource does not reconnect); the HTML dashboard then shows "Transfer already finished". The dashboard's elapsed time follows the `elapsed` field of `progress` events, so it counts from the transfer start. **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver. **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility. |
| `receive` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Return the receive page instead of raw pipe data. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?receive` fall through to the normal receiver and get the data. **What the page does:** it shows the pipe name and whether a sender is waiting (from the `?progress` stream). On **Receive**, or by itself with `autostart=1`, the browser's download manager receives `/{path}?download` (plus `n` and `filename`), so the data streams to disk at any size without passing through the page. Progress and the result are in the browser's downloads list: the page cannot see the download and never reports it as finished. It fails with the server's error text, for example `Timed out waiting for sender.` when no sender comes within 5 minutes (or the `wait` given), or a receiver-count mismatch; **Receive again** retries. What is happening on the path for all its senders and receivers (no sender yet, a sender waiting for receivers, a transfer running) is shown as information only, under a "Status for this name" label; while it cannot be read the page says `Status unavailable, retrying…`. **Cancel** frees the receiver slot while the receive waits; a download that has already started continues in the browser's downloads. Without JavaScript it shows a plain download link. **Page parameters:** `n` (receiver count, editable on the page), `filename` (download name), `autostart`, and the receiver's own `wait` and `sha256`, forwarded to its download (and to the no-JavaScript link). An invalid `wait` is dropped there. The page shows no checksum: compare one with `?status&transfer=<id>` from a client that reads the `X-Hoody-Pipe-Transfer-Id` header. **Values:** `?receive` (bare), `?receive=true`, `?receive=yes`, `?receive=1` → page. `?receive=false`, `?receive=no`, `?receive=0` → normal pipe receiver. **Precedence:** with several page parameters a browser gets `progress`, then `video`, then `share`, then `receive`. **Security:** CSP with nonces, `connect-src 'self'`, `frame-src 'self'`, no external resources, `Cache-Control: no-store`. Values from the URL are only rendered as escaped text. The page uses no cookies or browser storage. |
| `share` | `"true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Return the share page: stream the screen (a screen, window or tab, optionally with its audio), a camera with microphone, or the microphone alone, live to the viewers of `/{path}?video`. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?share` fall through to the normal receiver. **What the page does:** Start asks the browser for the capture (the user picks the screen, window or tab in the browser's own picker), records it as WebM and sends it to the path as one streaming upload. The page shows a link for viewers (`?video`, with `n` when it is above 1; copy button and QR code), viewers connected, streaming state and elapsed time. Stop, or ending the share from the browser's own controls, finishes the stream; Start again on the same path reconnects the viewers. A share nobody joins ends after the server's 5-minute wait. A browser that cannot stream an upload gets a clear "not supported" message. **Live:** with the Live box ticked (`live=1` on the page URL) the upload is a `live` broadcast (`POST /{path}?live`): it starts at once, viewers join and leave at any time through `?video&live=1` (each from the next keyframe; the page asks the recorder for one every 2 s), `n` is ignored, and the page shows the viewers watching now from `?progress`. Live needs a WebM recording; a browser that cannot record WebM gets a "not supported" message. **Page parameters:** `source`, `audio`, `surface`, `quality`, `fps`, `live`, `n` (viewers). They only pre-fill the controls: capture always starts with the user's click on Start. **Values:** `?share` (bare), `?share=true`, `?share=yes`, `?share=1` → page. `?share=false`, `?share=no`, `?share=0` → normal pipe receiver. **Security:** CSP with nonces, `connect-src 'self'`, no external resources, `Cache-Control: no-store`. The page uses no cookies or browser storage. |
| `autostart` | `"1" \| "true" \| "yes" \| "0" \| "false" \| "no"` | query | No | Receive page (`receive`) only: `1`, `true`, `yes` or bare starts the receive without a click once the page has loaded. Any other value, or none, waits for the user's click. Ignored on every other request. |
| `source` | `"screen" \| "camera" \| "audio"` | query | No | Share page (`share`) only — pre-selects the source. `screen` (default) is a screen, window or tab; `camera` is a camera with microphone; `audio` is the microphone alone. Invalid → `screen`. |
| `audio` | `"1" \| "true" \| "yes" \| "0" \| "false" \| "no"` | query | No | Share page (`share`) only — `1`, `true`, `yes` or bare pre-checks "include audio" for a screen share (tab or system audio, where the browser offers it). Default off. |
| `surface` | `"monitor" \| "window" \| "browser"` | query | No | Share page (`share`) only — which kind of surface the browser's picker offers first. `monitor` (a whole screen), `window` or `browser` (a tab). The user still makes the choice. Default no hint. |
| `quality` | `"low" \| "medium" \| "high"` | query | No | Share page (`share`) only — capture size and bit rate. `low` (about 480p), `medium` (about 720p, default) or `high` (about 1080p). Invalid → `medium`. |
| `fps` | `number` | query | No | Share page (`share`) only — frames per second for screen and camera, 1-60. Invalid → 30. |
| `status` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Return one JSON snapshot of the name (`PipeStatus`) instead of receiving. It takes no receiver slot, is answered at once and is never held open; poll it from scripts and agents that cannot hold a `?progress` stream. Checked before every other parameter (`progress`, `video`, `share`, `receive`, `n`, `wait`, and the modes `live`, `ws` and `live` with `ws`), for browsers too. `HEAD` with `?status` returns the headers only. A POST/PUT with `?status` is an ordinary sender. `state`: `idle` (nobody on the name; an unused name is idle, not 404), `waiting`, `streaming`, `complete`, `failed`; `kind`: `null` when idle, `"pipe"` for a transfer, `"ws"` for a WebSocket pair (`ws`); `peers`: with `"ws"`, the peers connected now (0-2); `null` for a transfer; `transferId`: set from when the transfer starts streaming, or from the sender's arrival when it chose its own (`transfer` on the sender); the same value receivers get in `X-Hoody-Pipe-Transfer-Id`; `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed` (bytes/s), `eta` (s), `elapsed` (s): the `?progress` fields; `speed` is the average since streaming started, and in `complete`/`failed` `elapsed` and `speed` are frozen at the end; `reason`: why it failed (`Timed out`, `Idle timeout`, `Sender disconnected`, ...), else `null`; `sha256`: the digest in `complete` when `?sha256` was on, else `null` A finished transfer stays visible for 30 s (at most the 1000 most recent ones), then the name reads `idle`; a new sender or receiver on the name starts a fresh `waiting`. Responses carry `Cache-Control: no-store`. **Values:** `?status` (bare), `true`, `yes`, `1` → snapshot; `false`, `no`, `0` → normal receiver. |
| `transfer` | `string` | query | No | With `status`: answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. A `?sha256` transfer, and every transfer with a sender-chosen id, leaves a receipt (state, reason, digest, bytes) kept 10 minutes (at most 1000; the oldest go first), so a receiver verifies its bytes after it has read them all: `complete` with the same `sha256` means the bytes match. A sender-chosen id answers from the sender's arrival on (`waiting`). An id that is neither the name's current transfer nor a kept receipt for this name is 404. Not with `ws` (400). |
| `wait` | `number` | query | No | How long this receiver waits for the sender (and the other receivers of an `n` transfer), in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes it gets 408 `Timed out waiting for sender.` (no sender connected) or `Timed out waiting for receivers.` (the sender is there, fewer than `n` receivers are), and a waiting sender sees `[INFO] A receiver disconnected.` and keeps waiting. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered. |
| `ws` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | WebSocket relay: open a duplex message connection on the name instead of receiving. Send `GET /{path}?ws` with a WebSocket upgrade (`Upgrade: websocket`; a plain GET is 426). Two peers on the same name are paired 1:1: every message one sends reaches the other with its type (text or binary) and boundaries kept. The first peer is accepted at once (101) and its messages are held until the second arrives (at most 4096 messages / 2 MiB); it waits `wait` seconds (default 300), then is closed with 4408 `Timed out waiting for peer.`. A third peer is 409. Behind HTTP/2 a browser opens the socket over HTTP/1.1 (no extended CONNECT is needed). A name holds one kind of session: a name with an HTTP transfer (sender or receivers) refuses `?ws` with 409, and a name with a WebSocket pair refuses senders and receivers with 409. `?status` reports a pair as `kind: "ws"` with `peers` 0-2; `?progress` sees its state and byte counts. **Subprotocol:** the first peer's `Sec-WebSocket-Protocol` choice (its first offered token, echoed back) is latched for the pair; the second peer must offer that token, or offer none when the first offered none (else 409). **Limits:** messages up to 1 MiB (a bigger one drops its sender's connection: the sender sees 1006, with no close frame, and the other peer is closed with 1009 `Message too big.`). Each direction buffers at most 2 MiB for a slow reader; past that the pair is closed with 1013. Idle peers are pinged; one that does not answer within about 120 s is dropped. **Close codes:** a peer's close is forwarded to the other: 1000-1003, 1007-1014 and 3000-4999 as sent; 1005 (no code) as 1000; anything else (1006, a dropped connection) as 1001 `Peer disconnected.`. The relay's own: 1013 `Relay buffer full: no peer yet.` / `Relay buffer full: the reader is too slow.` / `Relay dropped a message.`, 4408 `Timed out waiting for peer.`, 1011 `Internal error.`, 1001 `Server shutting down.`. Not with `n` (400). `live` with `ws` is 400 before any other check except `status`, with or without an upgrade. `wait` applies as for receivers. **Values:** `?ws` (bare), `true`, `yes`, `1` → WebSocket relay; `false`, `no`, `0` → normal receiver. **Upgrade response:** an accepted peer gets `101 Switching Protocols`; the first peer gets it at once, before the second arrives. |
| `live` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Watch a live stream (a sender with `?live`): join at any time, leave and rejoin at will. With no live sender yet, the viewer waits like a receiver (`wait`, default 300 s, then 408 `Timed out waiting for sender.`). The body is a **suffix** of the stream: no `Content-Length`, `X-Hoody-Pipe-Live: 1`, `Cache-Control: no-store`, no `X-Hoody-Pipe-Transfer-Id`. A WebM stream starts with its header, then a Cluster that begins with a video keyframe (any Cluster for audio-only); other bodies start at the next chunk. **Slow viewers:** a viewer that falls 2 MiB behind skips whole Clusters (WebM) until it has caught up to 512 KiB, resuming at a keyframe Cluster. One more than 8 MiB or 4096 pieces behind, one that takes nothing for 60 s, or the most-behind one when the server's live memory budget is full, is cut: its body ends without the chunked terminator. The others are never slowed. **Ending:** after the sender's clean end a viewer takes what it was already sent (up to 60 s), then its body ends normally; if the sender fails, every viewer is cut. A viewer's response counts against the limits until it disconnects, or until 35 s after its body ended. **Plain GET:** a GET without `live` on a name whose live stream is running joins it the same way (a suffix, marked `X-Hoody-Pipe-Live: 1`). While `?live` viewers wait for a sender, a plain GET or `live=0` is 409. `?video&live` serves the player for a live stream; on `?share` (a browser), `live=1` pre-ticks the page's Live box. Not with `n` above 1, `sha256` or `ws` (400). At most 256 viewers per stream and 4096 live viewer responses in all (429). **Values:** `?live` (bare), `true`, `yes`, `1` → watch live; `false`, `no`, `0` → an ordinary receiver (409 on a live name). |
| `sha256` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Ask the server to hash the transfer (a receiver can switch it on alone). Read `X-Hoody-Pipe-Transfer-Id`, hash the bytes as you receive them, then compare with `?status&transfer=<id>` (see `transfer`). The digest cannot come in-band: response headers go out before the body, and HTTP trailers are not sent. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | PipeReceiveResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/pipe/{path}`
**CLI:** `hoody pipe receive`

---

#### `send` — Send data to a pipe

```typescript
client.pipe.send(path: string, data?: string | FormData | Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: { n?: number; wait?: number; sha256?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; transfer?: string; live?: "" | "true" | "false" | "yes" | "no" | "1" | "0"; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`). POST/PUT to a reserved path return 400; any other method except GET/HEAD/OPTIONS returns 405 with `[ERROR] Method <verb> is not allowed.\n` and `Allow: GET, HEAD, OPTIONS`. Examples: `myfile`, `transfer123`, `secret.png`, `logs/today` |
| `n` | `number` | query | No | Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256. |
| `wait` | `number` | query | No | How long this sender waits for its `n` receivers, in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes, the status stream ends with `[ERROR] Timed out waiting for receivers.` Receivers already waiting keep their own `wait`, so another sender may still come for them. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered, so a script is never given a shorter wait than it asked for. **Through the Hoody edge:** a sender whose large body is still waiting is cut after about 30 minutes (the proxy's request-body timeout); receivers and small senders can wait the full hour. For long waits with large files, let the receiver wait (`?wait=3600`) and start the sender once `?status` shows it. |
| `sha256` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Compute the SHA-256 of the bytes forwarded to receivers (for multipart, of the file part or `input_text`, which is what receivers get). On a complete transfer the status stream gets `[INFO] SHA-256: <64 hex>` between `[INFO] Upload complete.` and `[INFO] Transfer complete.`, and the digest is in the `?progress` `done` event and in `?status`. A failed transfer has no digest. Any receiver can switch hashing on as well. Hashing adds processing overhead per byte, so it is opt-in. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. |
| `transfer` | `string` | query | No | This transfer's own id instead of a generated one: 16-64 characters `A-Z a-z 0-9 _ -`. A sender cannot read response headers while it uploads, so it picks the id up front to follow its own transfer with `?status&transfer=<id>`. The id is the `transferId` in `?status` from the sender's arrival (also while it waits), the `X-Hoody-Pipe-Transfer-Id` receivers get, and the `done` event's `transferId`. A transfer with its own id leaves a receipt for every outcome, kept 10 minutes: `complete`, or `failed` with its `reason`, also when it ended before streaming (`Timed out waiting for receivers`, `Sender disconnected`, `Server at capacity`). Any other value is 400. An id still held by a waiting, running or finished transfer on any name, or by a kept receipt, is 409. Not with `ws` (400). On a `live` sender it is the live stream's `transferId` in `?status` from the start, and its receipt (`"kind": "live"`, `complete` or `failed`) once it ends; live viewers get no `X-Hoody-Pipe-Transfer-Id`. |
| `live` | `"" \| "true" \| "false" \| "yes" \| "no" \| "1" \| "0"` | query | No | Live broadcast: start streaming at once, even with no viewers, and let any number of viewers join and leave at any time (`GET /{path}?live`; up to 256 at once). Nothing waits for a receiver and nothing is stored: bytes sent while nobody watches are dropped. Viewers are never in lockstep: one that falls behind skips ahead (WebM: whole Clusters, resuming at a keyframe Cluster) or is cut, and never slows the sender or the others. **WebM bodies** (starting with the EBML magic, e.g. MediaRecorder or `ffmpeg -f webm`) get keyframe joins: a viewer receives the stream header, then the stream from the next Cluster that starts with a video keyframe (any Cluster for audio-only). Join delay is the keyframe interval. **Any other body** (logs, text, other containers) is sent to a viewer from the next chunk on. **Status lines** (at most four): `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` on a clean end, or the idle-timeout / failure `[ERROR]` lines. Viewer counts are on `?progress` and `?status` (`kind: "live"`). **Ending:** a clean end lets each viewer take what it was already sent (up to 60 s), then its body ends normally. A sender that disconnects, fails or idles 5 minutes cuts every viewer (their bodies end without the chunked terminator, which clients report as an error). The name is free for reuse as soon as the sender ends. Not with `n` above 1, `sha256`, `ws` or a multipart body (400). A name with waiting or streaming ordinary transfers, or a WebSocket pair, is 409. At most 100 live streams and 4096 viewer responses at once (429). `wait` is validated but a live sender never waits. **Values:** `?live` (bare), `true`, `yes`, `1` → live; `false`, `no`, `0` → an ordinary sender. |
| `data` | `string \| FormData \| Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array>` | body | No |  |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `POST /api/v1/pipe/{path}`
**CLI:** `hoody pipe send`

---

### `client.pipe.ui` (2) — ui

#### `getNoScriptPage` — No-JavaScript upload page

```typescript
client.pipe.ui.getNoScriptPage(options?: { path?: string; mode?: "file" | "text"; wait?: number; sha256?: "" | "1" | "true" | "yes" | "0" | "false" | "no" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | No | Pre-fill the pipe path. Only URL-safe characters allowed. |
| `mode` | `"file" \| "text"` | query | No | Input mode: `file` for file picker, `text` for textarea |
| `wait` | `number` | query | No | Seconds the upload waits for its receivers (1-3600), forwarded to the form's POST. An invalid value is dropped. |
| `sha256` | `"" \| "1" \| "true" \| "yes" \| "0" \| "false" \| "no"` | query | No | `1`, `true`, `yes` or bare: the upload is hashed with SHA-256, forwarded to the form's POST. `0`, `false`, `no` or absent: not hashed. |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/pipe/noscript`

---

#### `getPage` — Send page

```typescript
client.pipe.ui.getPage(options?: { name?: string; n?: number; text?: string; mode?: "file" | "text"; filename?: string; autostart?: "1" | "true" | "yes" | "0" | "false" | "no" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | query | No | Pre-fills the pipe name (up to 1024 characters). Absent → a random name. |
| `n` | `number` | query | No | Pre-fills the receiver count (1-256). Invalid → 1. |
| `text` | `string` | query | No | Pre-fills the text to send (up to 100000 characters) and selects text mode. |
| `mode` | `"file" \| "text"` | query | No | Selects file or text mode. Default `file`, or `text` when `text` is given. |
| `filename` | `string` | query | No | Pre-fills the file name used for a text or pasted send (up to 255 characters). |
| `autostart` | `"1" \| "true" \| "yes" \| "0" \| "false" \| "no"` | query | No | Text mode only — `1`, `true`, `yes` or bare sends the pre-filled text without a click once the page has loaded (needs a text; a name the page refuses shows the reason instead). A file send always needs the user to pick the file. |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/pipe/`

