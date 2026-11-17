> _**HTTP skill · `pipe` namespace** · ~16,432 tokens · hoody-sdk v1.0.1_

# `pipe` — Zero-storage streaming HTTP transfers

## Purpose

HTTP rendezvous. Sender POST/PUTs a path; receivers GET it; bytes fan out
in-memory, zero server storage. Paths exist only while pending/active. A name held by a live sender key stays reserved for one hour after the stream ends.

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

Send with `POST` (or `PUT`) and receive with `GET` on the same `/{path}` of the kit URL (`/api/v1/pipe/{path}` is the same route).

### 1. One-to-one

`GET /{path}` (blocks until a sender arrives); `POST /{path}` with the body. `n=1` by default.

### 2. Fan-out (N ≤ 256)

All peers use the same `path` and the same receiver count (`?n=N`). A mismatch → 400.

### 3. Download or no disposition per receiver

`GET /{path}?download=1` and/or `?filename=<name>` → attachment; `?download=0` → no `Content-Disposition` (the client decides how to show it).

### 4. Watch via `?progress`

`GET /{path}?progress`. `Accept: text/event-stream` → SSE; `text/html` → dashboard. No receiver slot.

### 5. Video via `?video`

`GET /{path}?video` with `Accept: text/html` → MSE player; non-browser → raw bytes. Sender: WebM / fMP4 (MPEG-TS plays in VLC/mpv, not in the browser player).

### 6. Page links a person only confirms

Compose one URL with every control filled in; the person opens it and clicks (capture and file picks always need their click). Invalid values fall back to the page defaults; on the receive, share and video pages an `n` above 256 is clamped to 256 instead. `<kit>` is the kit URL; `<name>` is encoded per `/` segment.

Send page `<kit>/api/v1/pipe/?name=<name>&…`:

| Param | Values | Effect |
|---|---|---|
| `name` | ≤1024 chars | pipe name (absent → random) |
| `n` | 1–256 | receiver count |
| `text` | ≤100000 chars | text to send; selects text mode |
| `mode` | `file` \| `text` | form mode |
| `filename` | ≤255 chars | name the receiver gets (for a text or pasted image; for a picked file it replaces the file's own name) |
| `autostart` | `1` | text mode with non-empty text: send on open, no click (no `name` needed: an absent one is generated, and the page still sends) |

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
| `quality` | `low` \| `medium` \| `high` | 480p / 720p / 1080p: a maximum for screen capture, a preferred size for camera capture (default `medium`) |
| `fps` | 1–60 | frame rate (default 30) |
| `n` | 1–256 | viewer count |
| `live` | `1` | live broadcast: starts at once, viewers join and leave at any time through `?video&live=1`; `n` does not apply |

Video page `<kit>/api/v1/pipe/<name>?video&n=<n>&live=1&wait=<s>` (`n` only when >1, not with `live`; `live=1` plays a live broadcast; `wait` 1-3600 s is how long the player waits for the stream; opening it receives). Progress page `<kit>/api/v1/pipe/<name>?progress` (no params, no slot). No-JS form `<kit>/api/v1/pipe/noscript?path=<name>&mode=file|text&wait=<s>&sha256=1` (`wait` and `sha256` go on to its upload).

Build the URL from the tables; values are percent-encoded.

### 7. Status, waiting time and checksums

`?status` is one JSON snapshot of a name, with no receiver slot: `state` (`idle`, `waiting`, `streaming`, `complete`, `failed`), `kind` (`pipe`, `ws`, `live` or null), `peers`, `transferId`, `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed`, `eta`, `elapsed`, `reason`, `sha256`. `?wait=<s>` (1-3600, default 300) sets how long one sender or receiver waits for the other side. `?sha256` (sender or any receiver) has the kit hash the stream; receivers of an ordinary (not `?live`) transfer get the transfer id in `X-Hoody-Pipe-Transfer-Id`, and `?status&transfer=<id>` returns that transfer, for a hashed one also for up to 10 min after it ends (the kit keeps at most 1,000 receipts in all and evicts the oldest first, so a busy kit can drop one sooner). Prometheus metrics: `GET /api/v1/pipe/metrics`.

`GET /{path}?status` (also `HEAD`); `GET /{path}?status&transfer=<id>` (unknown or expired id → 404, malformed → 400). A sender can't read headers while uploading, so it can pick the id: `POST /{path}?transfer=<id>` (16-64 chars `A-Z a-z 0-9 _ -`, else 400; an id still held by a transfer on any name or a kept receipt → 409; not with `ws`; a `live` sender takes it too). That id is `transferId` from the sender's arrival (also `waiting`), and `?status&transfer=<id>` keeps a receipt for up to 10 min for every outcome (at most 1,000 receipts in all, oldest evicted first), including `failed` before streaming (`Timed out waiting for receivers`, `Sender disconnected`). Sender with `?sha256`: its status body gets `[INFO] SHA-256: <hex>` before `[INFO] Transfer complete.`. A receiver compares its own hash with `sha256` from `?status&transfer=<id>` after reading the body.

### 8. Live broadcast (`?live`)

A live sender streams at once, with nobody watching; any number of viewers (256 at once) join and leave while it runs and each gets the stream from then on (no `Content-Length`, header `X-Hoody-Pipe-Live: 1`; no `X-Piping`, `X-Hoody-Pipe` or sender filename; the headers come with the viewer's first bytes). WebM joins at the next keyframe Cluster after the stream header, so players decode it; anything else joins at the next chunk. Bytes sent while nobody watches are dropped. A viewer 8 MiB or 4096 pieces behind, taking nothing for 60 s, or furthest behind when the live memory budget (64 MiB per stream, 512 MiB in all) is full is cut: its body ends with an error. A clean sender end gives each viewer up to 60 s to finish; a sender that disconnects, fails or idles 5 min cuts every viewer. Sender status: `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` or an `[ERROR]` line. `?status` shows `kind: "live"`, viewers in `activeReceivers`, `totalReceivers: null`; `?progress` events carry `live: true`. Not with `n` above 1, `sha256`, `ws` or multipart (400); a live sender on a name with an ordinary transfer, an ordinary sender on a live name, or a plain GET while `?live` viewers wait → 409 (a plain GET on a running live stream joins it). Caps: 100 live streams, 4096 viewer responses in all (each counts until it disconnects, or until 35 s after its body ended cleanly, 6 s after it was cut) → 429.

A live sender may send `X-Hoody-Pipe-Sender-Key`, 16–128 characters from `A-Z a-z 0-9 _ -`, to hold the name while it streams and for one hour after it ends. During the hold, a POST or PUT on the name (live or not) with no key or a different valid key gets 403 `[ERROR] This name is held by a live sender. Send its sender key.`; a malformed key gets 400. A WebSocket connection (`?ws`) on the held name gets 409. A key without `live` on a name nobody holds gets 400; a new hold when 1000 names are already held gets 429. Viewers never need the key.
`POST|PUT /{path}?live` starts the broadcast; viewers `GET /{path}?live`; browsers open `/{path}?video&live` for the player that keeps up with the newest data.

## Quirks & gotchas

- Available over SDK, HTTP and the `hoody pipe` CLI.
- `/api/v1/pipe/{path}` ≡ bare `/{path}` for transfer paths, except a name equal to `api/v1/pipe` or starting with `api/v1/pipe/` (the prefix is stripped once, so those are reachable only under the prefix: `/api/v1/pipe/api/v1/pipe/x` is the pipe `api/v1/pipe/x`). Health is the other exception: `/api/v1/pipe/health` answers GET/HEAD/OPTIONS, and a bare `/health` returns 404; both are matched case-insensitively with one trailing `/` or `.` allowed (`/api/v1/pipe/health/` is health, `/Health` is 404). Percent-escapes in a name match regardless of hex case (`caf%c3%a9` = `caf%C3%A9`); a pipe name itself is not decoded (`%41` ≠ `A`), but reserved-page and health/metrics matching decodes first (`/api/v1/pipe/h%65alth` is the health endpoint, `/h%65lp` the help page).
- Reserved: `/`, `/noscript`, `/help`, `/favicon.ico`, `/robots.txt` (alias-hardened). `health` and `metrics` are not pipe names either: under the prefix they are the health and metrics endpoints, and at the root they answer 404. The SDK (`PipeStream`, `PipeBrowser`, `PipeMedia`, page URLs) and the CLI refuse all of these before any request, and every SDK URL builder (`getUrl`, `getWsUrl`, `getDownloadUrl`, `getPageUrl`) throws on them, matched as the kit matches them: case-insensitive, one trailing `/` then one trailing `.` ignored, so `Metrics.`, `help/` and an empty name are refused. Runs of `/` are merged first, so `/help`, `//metrics` and `metrics//` are refused too: the kit itself treats `//help` as a transfer path and serves the help page at `/help` only, but an edge that merges slashes would send it to the help page.
- `n` ≤ 256; peers must agree. Caps 1000 pending + 1000 active.
- The kit limits the path name (the pathname after the `/api/v1/pipe` prefix is removed, leading `/` not counted) to 1024 characters. The generated SDK methods, the `PipeStream` transfer methods and the CLI `send`/`receive` check the unencoded name against the same cap, so a name with characters the URL must encode can pass that check and still get 414; the page URL builders check the encoded name, and `PipeBrowser.getUrl` / `PipeMedia.getUrl` apply no length check locally. That is the only limit the kit applies to the path or URL length (query parameters and headers such as `transfer` and `X-Piping` have their own limits): there is no total-URL cap in the kit, so an extremely long URL is refused (if at all) by the HTTP server in front of it, with a differently shaped error. Control characters, backslashes, encoded slashes (`%2F`, `%5C`) and a malformed percent-escape (a lone `%`, `%zz`, invalid UTF-8) → 400 `Path contains forbidden characters.`; send a literal `%` as `%25`.
- A sender or receiver waits for the other side for its own `?wait` (default 5 min, at most 1 h); an active transfer idle for 5 min is ended.
- Dangerous sender MIME (HTML/SVG/JS) → `text/plain`; `nosniff` forced.
- Forwarded sender→receiver headers: `Content-Type` (sanitized — dangerous MIME → `text/plain`), `Content-Length` (only for a non-multipart body, and only when the value is 1–19 plain digits; multipart transfers are sent without it), `X-Piping`, `X-Hoody-Pipe` (each ≤8 KiB, CRLF-stripped). `Content-Disposition` is rebuilt per-receiver from sender metadata + receiver `?download`/`?filename` params. A `?live` viewer gets the sender's sanitized `Content-Type` but not `X-Piping`, `X-Hoody-Pipe` or the sender's filename: of its `Content-Disposition` only the type (`inline` or `attachment`) is kept, and the viewer's own `?filename` still applies.
- `?download` enum (SDK-validated): `"true"`/`"false"`/`"yes"`/`"no"`/`"1"`/`"0"` (attach / no `Content-Disposition`). The kit is more permissive — bare `?download` (no value) and any non-`false`/`no`/`0` string are treated as truthy. `?filename=<v>` implies attach, sanitised (255 chars, RFC 5987), unless the same receiver also sent an explicit `download=false`/`no`/`0`, which suppresses Content-Disposition entirely. 
- `?video` HTML player only on `Accept: text/html`. The page itself takes no receiver slot, but the player it serves then receives the stream as one of the transfer's `n` receivers (`n` from the page URL, or a `?live` viewer with `live`); it is not a spectator. A valid `?wait` on the player URL is used by each of its receives; an invalid one is ignored. When a stream's download ends, the player keeps playing what it buffered and waits on the same path; the next stream sent there replaces it at once, even if the earlier one has not finished playing. Audio-only WebM (Opus/Vorbis) plays as audio; with `?n=N` the players may be tabs of one browser. Without `live` it never skips content within one stream (a stream that fell behind stays behind; it reads at most 45 s ahead); with `live` (`?video&live=1`), a player that falls behind may jump to the newest buffered media. Playback stopped 1.5 s with media buffered ahead moves on to it.
- `?progress` no receiver slot. Caps: 50/path (a further spectator on a full path gets `429`), 500 groups (once 500 groups are tracked, a new path gets `429`), 30 min TTL.
- `?receive` and `?share` serve pages only on `Accept: text/html` (a browser); any other client gets the data as a plain receiver, like `?video`. With several page params on one URL a browser gets `?video`, then `?progress`, then `?share`, then `?receive`; `=0`/`false`/`no` turns one off. With `?video` on, the others (and `?status`) are ignored for every client: a non-browser client, even one asking for SSE, is a plain receiver and takes a slot.
- `?receive` page: shows the name and whether a sender waits (from `?progress`, no slot). On the person's click — or by itself with `autostart=1` — the browser's download manager receives `?download` (plus `n`, `filename`, and the page's own `wait` and `sha256`), so any size goes to disk without passing through the page. Progress and the result are only in the browser's downloads list: the page cannot see the download, so after Receive it stays `Receiving in your browser` and never reports success. Its only outcome is `Failed` with the kit's error text when the download frame gets one (`Timed out waiting for sender.` after 5 min or the page's `wait`, an `n` mismatch, a taken slot); `?progress` state snapshots fill an info line labelled "Status for this name" (all its senders and receivers, not this download: no sender yet / sender waiting for receivers / transfer running; "Status unavailable, retrying…" while the stream is down) and never set an outcome. Cancel frees the slot while waiting (a started download goes on in the browser's downloads); Receive again after a failure retries. Pre-fill: `n` (above 256 is clamped to 256, any other invalid value becomes 1), `filename` (sanitized like `?filename`), `autostart=1` (only `1`/`true`/`yes`/bare), `wait` (1-3600 s; invalid → dropped), `sha256` (forwarded only; the page shows no checksum).
- `?share` page: shares the screen (with its audio if ticked), the camera with the microphone, or the microphone only, live to the `?video` player.
  - Start sharing asks the browser for the capture (the person's click), then sends one stream to the name and shows a viewer link (Copy + QR) to `<name>?video` (plus `&n=`). The stream is WebM when the browser can record it; a non-live video share can fall back to MP4, while Live and microphone-only sharing are WebM only.
  - Without Live, the stream starts when all `n` viewers have opened the link; until then the page shows `Waiting for viewers… x of n connected`. With Live (the Live box or `live=1`), it is a `?live` broadcast that starts at once and viewers join and leave at any time. The page shows viewers, elapsed time and bytes sent (from `?progress`, no slot).
  - Stop, or the browser's own stop-sharing control, ends the stream; Start sharing again shares on the same name and players still open on the link play it.
  - Without Live, it ends with a message when nobody (or not all `n`) opened the link within 5 min, or all viewers left. In either mode it ends with a message when the name is busy, the kit refused the share (its error text), or the connection cannot keep up.
  - It needs a browser that can stream an upload (Chromium-based) over HTTPS with HTTP/2 or HTTP/3; any other browser gets a message instead of a start. It stores nothing in the browser.
  - Pre-fill: `source=screen|camera|audio`, `audio=1` (screen audio), `surface=monitor|window|browser` (offered first in the picker), `quality=low|medium|high` (480p/720p/1080p: a maximum for screen capture, a preferred size for the camera), `fps` (1–60, default 30), `n` (receivers: above 256 is clamped to 256, any other invalid value becomes 1), `live=1` (Live). Other invalid values fall back to the defaults; capture still needs the click on Start sharing.
- `/` (also `/api/v1/pipe/`) is the send page.
  - It sends one file, a typed or pasted text, or a pasted image (sent as a file).
  - It fills in a random name that the person can edit, plus `n`. Send/Cancel uses one POST to `/api/v1/pipe/<name>`: each `/`-separated part of the name is encoded, so `?`, `#` and `%` stay in the name, and leading `/` are kept. A name with a `.` or `..` part (also `%2e`) is refused before sending, as in the SDK.
  - The file name, or `filename` for a text or pasted image, goes in `Content-Disposition`. A typed or URL-given file name is kept when a file is picked or pasted.
  - It reports Delivered only when the POST response ends with `[INFO] Transfer complete.`; any other ending is shown as Failed. Each `[INFO] A receiver disconnected.` after `[INFO] Streaming to …` is a receiver that did not get everything: `Delivered to 1 of 2 receivers (1 disconnected).`
  - It shows the connected receivers and the state from `?progress` (no slot). It shows a receive link (Copy + QR) to `<name>?receive` (plus `&n=`).
  - Cancel ends the send; receivers already waiting keep the name and its `n`. The page stores nothing in the browser and sends a nonce CSP with `connect-src 'self'`.
  - Pre-fill: `name` (≤1024; absent → random), `n` (1–256, invalid → 1), `text` (≤100000, selects text mode), `mode=file|text`, `filename` (≤255), `autostart=1` (text mode with a text only; never for a file; a refused name shows the reason instead). Over-long values are cut without splitting a character.
- To hand a person a ready send link, build `<kit>/api/v1/pipe/?name=<name>&text=<text>` (add `&autostart=1` to send it on open, `&filename=<name.ext>`, `&n=N`). For a file, give `?name=<name>`: they pick the file and click Send.
- WebSocket relay: `GET /{name}?ws` with an upgrade pairs exactly two peers. Messages pass both ways with their type and boundaries kept, at most 1 MiB each. The first peer's messages are held (4096 / 2 MiB) until the second arrives (`?wait`, default 300 s, then close `4408`). A slow reader more than 2 MiB behind closes the pair with `1013`. Close codes 1000-1003, 1007-1014 and 3000-4999 are forwarded; a drop arrives as `1001`. The first peer's subprotocol binds the pair. A name holds either a transfer or a pair, never both (409 both ways); `?status` shows `kind: "ws"`, `peers`. 
- To hand a person a ready receive link, build `<kit>/api/v1/pipe/<name>?receive&autostart=1&filename=<name.ext>` (add `&n=N` for N receivers); they open it and the file lands in their downloads when the sender sends. A share link is `<kit>/api/v1/pipe/<name>?share&source=screen|camera|audio` (capture still needs their click on Start); viewers open `<kit>/api/v1/pipe/<name>?video`.
- `Service-Worker: script` on a receiver GET → 400 (senders, reserved pages and `?status` are not checked for it).
- `Content-Range` on POST/PUT → 400.
- Multipart: the **first file part** wins. Non-file parts before it are drained; the transfer ends when that part ends; anything after it is ignored, and the body stops being read once the transfer finishes. A body cut off or dropped before that part ends fails the transfer (sender `[ERROR] Transfer failed`, waiting receivers 500). With no file part, the first `input_text` field is delivered instead (as `text/plain; charset=utf-8`, no disposition); a text field over 1 MiB fails the transfer. The 30 s deadline covers only the wait for the first file or `input_text` part; after that the 5 min idle limit applies.

## Common errors

- 400 — active / sender attached / `n` mismatch / slots full / `n`>256 / reserved / forbidden chars / `Service-Worker` (receiver GET) / `Content-Range`.
- 403 — a POST or PUT on a name held by a live sender key, without that key (`[ERROR] This name is held by a live sender. Send its sender key.`).
- 405 — method. HEAD works only on the reserved pages, `/api/v1/pipe/health`, `/api/v1/pipe/metrics` and `?status`; transfer paths accept GET, POST, PUT and OPTIONS. On a reserved page or health, the 405 carries `Allow: GET, HEAD, OPTIONS` (POST/PUT to a reserved page are 400, to health 405).
- 408 — a waiting receiver whose own `?wait` (default 5 min) passes before the pipe is established gets it; the others keep waiting. The body names the missing side: `[ERROR] Timed out waiting for sender.` when no sender is attached, `[ERROR] Timed out waiting for receivers.` when the sender is attached but some of the `n` receivers never came. The sender is not told of a receiver's 408 except as `[INFO] A receiver disconnected.`, and it keeps waiting. When the sender's own `?wait` passes, it has already had its `200` response, so it learns of that timeout only from `[ERROR] Timed out waiting for receivers.` in its streamed status body.
- 409 — `?ws` on a name with two peers already, with a transfer, or with a different subprotocol than the first peer's; a sender or receiver on a name that holds a WebSocket pair; a sender whose `?transfer=<id>` is still in use (`[ERROR] Transfer id already in use.`); a live sender or viewer on a name owned by an ordinary transfer (`[ERROR] This name is in use by a normal transfer.`); an ordinary sender on a live-owned name; a plain GET while live viewers wait, or a GET with `?live=0` on a live-owned name; or `?ws` on a name held by a live sender key.
- 426 — `?ws` without a WebSocket upgrade.
- 414 — path name (leading `/` not counted) over 1024 characters.
- 429 — pending-transfer cap, spectator caps, for receivers the active-transfer cap, the live caps (100 live streams, 256 viewers per stream, 4096 viewer responses in all), 500 WebSocket pairs, and a new sender key when 1000 names are already held. An ordinary sender that hits the active-transfer cap has already had its `200`; it gets `[ERROR] Server at maximum active transfer capacity. Try again later.` in its status body. A live sender refused by that cap or by the live-stream cap gets the `429` itself, with `[ERROR] Too many live streams. Try again later.`

## Related namespaces

`files` persist · `curl` HTTP client · `tunnel` long-lived bidi · `terminal`/`exec` shell.

## Examples

Each example is shown in the form of the surface you are reading (HTTP, CLI or SDK); the other surfaces have their own skill pages. Set `P`, `C`, `N` (project id,
computer id, server name) from `GET /api/v1/computers/{id}` first, then
`KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"`.

Pipe paths are reservations: receivers and senders rendezvous on the same path.
Pick a unique path (e.g. `transfer-$(openssl rand -hex 4)`) per transfer — once
it's claimed by a sender or receiver, the same path can't host another transfer
until the first one ends. A pending rendezvous holds its path while participants
remain; each has its own `?wait` deadline (default 5 min, maximum 1 h). An active
transfer holds its path until it ends, including a teardown after 5 min without
data flowing. A name held by a live sender key stays reserved for one hour after its stream ends (see Live broadcast).

### 1. One-to-one transfer — receiver waits, sender pushes bytes

**Goal:** stream a payload from one endpoint to another with zero staging. Receiver opens the GET first; the connection blocks until the sender POSTs to the same path.

**Step 1 — start the receiver in the background.** It blocks until the sender connects.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="transfer-$(openssl rand -hex 4)"
curl -s "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/received.bin &
RECVPID=$!
```

**Step 2 — send the bytes.** Sender's response is a streamed `[INFO]` log:
```
[INFO] Waiting for 1 receiver(s) to connect...
[INFO] 1 receiver(s) already connected.
[INFO] Streaming to 1 receiver(s)...
[INFO] Upload complete.
[INFO] Transfer complete.
```

```bash
printf 'hello pipe!' \
  | curl -s -X POST --data-binary @- -H 'Content-Type: text/plain' \
      "$KIT/api/v1/pipe/$PATH_NAME"
wait $RECVPID
cat /tmp/received.bin   # → hello pipe!
```

### 2. Fan-out 1-to-3 — one sender, three receivers

**Goal:** broadcast the same bytes to three endpoints in lockstep. All four parties (3 receivers + 1 sender) must agree on `n=3`; mismatch → 400.

**Step 1 — open three receivers.** Each must pass `?n=3`.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="broadcast-$(openssl rand -hex 4)"
for i in 1 2 3; do
  curl -s "$KIT/api/v1/pipe/$PATH_NAME?n=3" -o "/tmp/recv-$i.bin" &
  sleep 0.5
done
```

**Step 2 — send once; all three receivers get an identical copy.** Lockstep fan-out: the slowest receiver paces the transfer.

```bash
printf 'fan-out-payload' \
  | curl -s -X POST --data-binary @- "$KIT/api/v1/pipe/$PATH_NAME?n=3"
wait
ls -la /tmp/recv-*.bin   # all three identical
```

### 3. Force a download with a custom filename

**Goal:** make the browser save the response to disk with a specific name, regardless of what (or whether) the sender provided a `Content-Disposition`. `?filename=<v>` implies `?download` and overrides any sender-supplied filename, unless the same receiver passes `?download=0` (which drops Content-Disposition entirely).

**Response header:** `content-disposition: attachment; filename="report.bin"`.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="dl-$(openssl rand -hex 4)"
# Receiver: force download to report.bin
curl -s -OJ "$KIT/api/v1/pipe/$PATH_NAME?download=1&filename=report.bin" &
sleep 1
# Sender: arbitrary bytes, no Content-Disposition needed
printf 'BINARYPAYLOAD' | curl -s -X POST --data-binary @- \
    "$KIT/api/v1/pipe/$PATH_NAME"
wait
```

### 4. Force inline display, overriding a sender's `attachment`

**Goal:** the sender (e.g. a legacy script) marks every payload as `Content-Disposition: attachment; filename="leaked.txt"`, but you want to render it inline in your app. `?download=0` strips Content-Disposition entirely on the receiver side — per receiver, not globally.

**Result:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got no Content-Disposition. Its `content-type` is `text/plain` for the HTTP and SDK examples, and `text/plain; charset=utf-8` for the CLI example.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="inline-$(openssl rand -hex 4)"
curl -sD - "$KIT/api/v1/pipe/$PATH_NAME?download=0" -o /tmp/inline.txt &
sleep 1
printf 'inline body' | curl -s -X POST --data-binary @- \
  -H 'Content-Type: text/plain' \
  -H 'Content-Disposition: attachment; filename="leaked.txt"' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
```

### 5. Watch a transfer with `?progress` (SSE)

**Goal:** monitor live state + bytes/sec from a third process, without consuming a receiver slot. `?progress=1` with `Accept: text/event-stream` returns SSE events; the spectator never blocks the transfer.

**SSE stream** for a 50 KB payload:
```
event: state
data: {"state":"idle", …}

event: state
data: {"state":"waiting","hasSender":true,"activeReceivers":1, …}

event: state
data: {"state":"streaming", …}

event: progress
data: {"bytesTransferred":50000,"totalBytes":50000, …}

event: done
data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857, …}
```

Each event is an `event:` line and a `data:` line, then a blank line; `…` marks fields left out here.

Only `done` says how a transfer ended. A failed one sends `{"state":"failed",…,"reason":"Sender disconnected"}`; `state` events carry only `idle`, `waiting` and `streaming`. A sender that drops before it is paired gives a `waiting` event with `hasSender:false` and no `done`. A spectator that connects after a transfer ends gets `204` and no events while the name keeps the finished record: up to 30 s, and at most 1000 finished records are kept, the oldest dropped first. After that it gets the `idle` events of an unused name.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="watched-$(openssl rand -hex 4)"
# Spectator: SSE
curl -sN -H 'Accept: text/event-stream' \
  "$KIT/api/v1/pipe/$PATH_NAME?progress=1" &
SSE=$!
sleep 1
# Real receiver
curl -s "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/payload.bin &
sleep 1
# Sender pushes 50 KB
yes abcd | head -c 50000 | curl -s -X POST --data-binary @- \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait $!  # receiver
sleep 2 ; kill $SSE 2>/dev/null
```

### 6. Embed an HTML transfer dashboard

**Goal:** give a non-technical user a live dashboard view of an in-flight transfer. Same `?progress=1` endpoint, but `Accept: text/html` returns a self-contained HTML page (CSP nonces, EventSource client baked in). Pop it in an `<iframe>` or open it in a new tab.

**Result:** ~8 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="watched-$(openssl rand -hex 4)"
# Save the dashboard page
curl -s -H 'Accept: text/html' \
  "$KIT/api/v1/pipe/$PATH_NAME?progress=1" > /tmp/dashboard.html
# Or just paste into a browser:
echo "Open in browser: $KIT/api/v1/pipe/$PATH_NAME?progress=1"
```

### 7. Stream a screen-recording to an MSE video player

**Goal:** stream live WebM or fragmented MP4 from `ffmpeg` and watch it in a browser without serving a separate frontend. MPEG-TS plays only in a media player (VLC, mpv): the page tells a browser viewer so. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Result:** ~31 KB HTML page titled `"Hoody Pipe — Video"` with a `MediaSource` player (`data-n`, `data-live`, `data-wait`; it reads the path from its own URL).

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="screencast-$(openssl rand -hex 4)"
# 1) Open the player URL in a browser:
echo "Watch: $KIT/api/v1/pipe/$PATH_NAME?video=1"
# 2) Then on the source machine, push the live encode:
ffmpeg -f x11grab -i :0.0 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -f webm - \
  | curl --upload-file - "$KIT/api/v1/pipe/$PATH_NAME"
# A media player (mpv/VLC/ffplay) instead of the browser: start it in another terminal BEFORE the sender,
# on the same URL (it gets the raw stream). Nothing is replayed, so a player started after the sender
# finished waits for a new sender. For browser and player together, add ?n=2 to the sender URL and to both viewer URLs:
mpv "$KIT/api/v1/pipe/$PATH_NAME?video=1"
```

### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, skips the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Result:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="upload-$(openssl rand -hex 4)"
# Receiver
curl -sD /tmp/headers "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/file.bin &
sleep 1
# Sender: form fields are drained; only the FIRST file part survives
echo -n first-file-content  > /tmp/a.txt
echo -n second-file-content > /tmp/b.txt
curl -s -X POST \
  -F 'field1=ignored-form-field' \
  -F 'file=@/tmp/a.txt;type=text/plain' \
  -F 'extra=@/tmp/b.txt;type=text/plain' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
grep -i 'content-disposition' /tmp/headers   # → attachment; filename="a.txt"
cat /tmp/file.bin                             # → first-file-content
```

### 9. Path / URL length limits — 1024-char path name is the cap

**Goal:** know what blows up at the validator. The kit counts the path name after the `/api/v1/pipe` prefix, leading `/` not counted: a path name over 1024 characters → `414 Path too long`. That path cap is the kit's only limit on path or URL length: it has no total-URL cap. Some query parameters and headers have their own limits, for example `transfer` (16-64 characters) and the forwarded `X-Hoody-Pipe` / `X-Piping` headers (8 KiB each).

**Result:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- The kit accepts at most 1024 characters in the path name as it is sent (percent-encoded); 1025 gets `414`. The generated SDK methods, `PipeStream` transfers and the CLI check the unencoded name, so a name that passes can still exceed the limit once percent-encoded and receive `414`; page URL builders check the encoded name, and `PipeBrowser.getUrl` / `PipeMedia.getUrl` apply no local length check.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"

# A 1100-char path is rejected with HTTP 414
LONG=$(printf 'x%.0s' {1..1100})
curl -s -o /tmp/err -w 'code=%{http_code}\n' \
  -X POST --data-binary 'data' "$KIT/api/v1/pipe/$LONG"
# → code=414
cat /tmp/err   # → [ERROR] Path too long (max 1024 characters).

# Stay under the cap — keep paths short and use a random suffix:
SHORT="t-$(openssl rand -hex 8)"  # 18 chars total
```

### 10. Sidechannel metadata via `X-Hoody-Pipe`

**Goal:** attach commit / build / job metadata to the transfer without polluting the body. The kit forwards `X-Hoody-Pipe` and `X-Piping` (≤ 8 KiB each, CRLF-stripped) to receivers (not to `?live` viewers) and exposes them via `Access-Control-Expose-Headers` so browsers can read them.

**Response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Hoody-Pipe-Transfer-Id, X-Piping, X-Hoody-Pipe
x-hoody-pipe: build-id=42; commit=abc1234
x-piping: legacy-meta=true
```

```bash
KIT="https://${P}-${C}-pipe-1.${N}.computers.hoody.com"
PATH_NAME="meta-$(openssl rand -hex 4)"
curl -sD /tmp/h "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/body &
sleep 1
printf 'metadata payload' | curl -s -X POST --data-binary @- \
  -H 'X-Hoody-Pipe: build-id=42; commit=abc1234' \
  -H 'X-Piping: legacy-meta=true' \
  -H 'Content-Type: application/octet-stream' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
grep -iE '^x-hoody-pipe|^x-piping' /tmp/h
```

## Reference

### `kit` (3) — info

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/help` | Get help text with curl examples |  |
| `GET /api/v1/pipe/health` | Service health check |  |
| `GET /api/v1/pipe/metrics` | Service metrics (Prometheus) |  |

### `pipe` (5) — Named pipes for streaming data between clients

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/{path}` | Receive data from a pipe | `?n` `?download` `?filename` `?video` `?progress` `?receive` `?share` `?autostart` `?source` `?audio` `?surface` `?quality` `?fps` `?status` `?transfer` `?wait` `?ws` `?live` `?sha256` |
| `HEAD /api/v1/pipe/{path}` | Pipe status headers (HEAD ?status) | `?status*` `?transfer` |
| `POST /api/v1/pipe/{path}` | Send data to a pipe | `?n` `?wait` `?sha256` `?transfer` `?live` `H:X-Hoody-Pipe-Sender-Key` `body:application/octet-stream,text/plain,multipart/form-data` |
| `PUT /api/v1/pipe/{path}` | Send data to a pipe (PUT) | `?n` `?wait` `?sha256` `?transfer` `?live` `H:X-Hoody-Pipe-Sender-Key` `body:application/octet-stream,text/plain,multipart/form-data` |
| `OPTIONS /api/v1/pipe/{path}` | CORS preflight |  |

**Param notes:**

- `path` — Pipe path name to receive from. It must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. _(on `GET /api/v1/pipe/{path}`)_
- `n` — Expected number of receivers. Must match the sender's `n` value exactly: a mismatch returns 400. When `n > 1`, the pipe waits for all `n` receivers and the sender before streaming. With `video`, `share` or `receive` (browser pages), `n` is the receiver or viewer count the page uses; there an invalid value becomes 1 and a value above 256 becomes 256. _(on `GET /api/v1/pipe/{path}`)_
- `download` — Control whether the response triggers a browser download. `?download` (bare), `?download=true`, `?download=yes`, `?download=1`: force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. A `live` viewer never gets the pipe path as a filename: without a sender or `filename` value its disposition is a bare `attachment`. `?download=false`, `?download=no`, `?download=0`: suppress `Content-Disposition` entirely, even if sender set one (forces inline display). Absent: the sender's Content-Disposition is passed through after sanitising. Multipart `form-data` dispositions are auto-converted to `attachment`, and an `inline` disposition is converted to `attachment` unless the content type is an image (not SVG), audio, video, `text/plain` or `application/pdf`. Works per-receiver: with `n=2`, one receiver can have `?download` and the other can display inline.
- `filename` — Set a custom download filename. Implies `?download`: the response will have `Content-Disposition: attachment; filename="<value>"`, unless `?download` is also given as `false`, `no` or `0`, which sends no `Content-Disposition` at all. **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header. **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding. A `?filename` that sanitizes to empty falls back to the sender's filename (from its Content-Disposition), then to the pipe path's last segment (sanitized); only when neither gives a usable name is the header a bare `attachment`. A live viewer gets neither fallback: the live stream carries no sender filename and no path, so it gets a bare `attachment`. With `receive` (browser page), the sanitized value pre-fills the page's "Save as" field and names the download.
- `video` — Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally, so no pipe receiver slot is consumed by the page itself. The page does not contain the pipe name: the player fetches its own page URL (with `live`, `n` and `wait` as the page uses them), so a link that shows only its own URL keeps the name to itself and still plays. **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser) and no `X-Pipe-Stream: 1` header. Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream, ensuring automatic compatibility with media players. The player's own fetch sends `X-Pipe-Stream: 1` and gets the stream the same way. **Auto-detection:** The player detects the container/codec from the stream's first bytes: WebM (VP8/VP9/AV1 + Opus/Vorbis), or audio-only WebM (Opus/Vorbis); MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC); MPEG-TS is recognized, but most browsers cannot play it: the player then says so. Play MPEG-TS in a media player (VLC, mpv, ffplay) from the same URL. **UI features:** Click to unmute (autoplay requires muted); Right-click to pause/resume; Status overlay: "Waiting for stream…", "Connected", "Stream ended"; for audio-only streams a lasting "Audio — click to unmute" / "Playing audio"; Plays each stream to its end, including a short file that arrives all at once, and keeps waiting on the path: the next stream sent there replaces it at once, even if the earlier one has not finished playing; With `?n=N`, the N players may be tabs of one browser; Without `live`, never skips content: a stream that fell behind stays behind, and the player reads at most 45 s ahead of playback. With `?video&live`, a player that falls behind jumps to the live edge; Playback that stops for 1.5 s with media buffered ahead moves on to that media; A valid `wait` on the player URL is used by each of its receives (how long it waits for a sender); an invalid one is ignored and the default applies **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver. **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`.
- `progress` — Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot: spectators are completely independent of the transfer. **Accept header routing:** `Accept: text/event-stream` → SSE stream (EventSource, curl); `Accept: text/html` → HTML dashboard page (browser); `Accept: */*` or missing → SSE stream (default to data, not markup) **SSE event types:** `state`: state snapshots: `idle`, `waiting` or `streaming` while a transfer runs. The end arrives as a `done` event (its `state` is `complete` or `failed`), sent only to spectators connected when the transfer ends. A spectator that connects after the end gets no event and no final state: its request is answered `204 No Content` (see **After a transfer**); `progress`: during streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers; `done`: terminal event with final stats (bytesTransferred, duration, avgSpeed, `reason` when failed, `sha256` (the digest with `?sha256` on a complete transfer, else null) and `transferId`); On a live stream (`live`), every `state` and `progress` event (the first ones a spectator gets on connecting included) also carries `live: true` and `totalReceivers: null`; `activeReceivers` is the viewers watching now, and a viewer joining or leaving sends a `progress` event (within the 250 ms throttle). `totalBytes` and `eta` are null. **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed` **DoS protections:** Max 50 spectators per path. A `?progress` stream stays open for at most 30 minutes (EventSource reconnects after it closes). When 500 names have an open `?progress` stream or a waiting or running transfer, a subscription to another name gets 429 (names already counted stay allowed); a finished transfer with no open progress stream does not count. **After a transfer:** after a transfer on the path finishes, the SSE request is answered `204 No Content` for up to 30 s, until the path is used again (no stream, so EventSource does not reconnect); the HTML dashboard then shows "Transfer already finished". The dashboard's elapsed time follows the `elapsed` field of `progress` events, so it counts from the transfer start. **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver. **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility.
- `receive` — Return the receive page instead of raw pipe data. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?receive` fall through to the normal receiver and get the data. **What the page does:** it shows the pipe name and whether a sender is waiting (from the `?progress` stream). On **Receive**, or by itself with `autostart=1`, the browser's download manager receives `/{path}?download` (plus `n` and `filename`), so the data streams to disk at any size without passing through the page. Progress and the result are in the browser's downloads list: the page cannot see the download and never reports it as finished. It fails with the server's error text, for example `Timed out waiting for sender.` when no sender comes within 5 minutes (or the `wait` given), or a receiver-count mismatch; **Receive again** retries. What is happening on the path for all its senders and receivers (no sender yet, a sender waiting for receivers, a transfer running) is shown as information only, under a "Status for this name" label; while it cannot be read the page says `Status unavailable, retrying…`. **Cancel** frees the receiver slot while the receive waits; a download that has already started continues in the browser's downloads. Without JavaScript it shows a plain download link. **Page parameters:** `n` (receiver count, editable on the page), `filename` (download name), `autostart`, and the receiver's own `wait` and `sha256`, forwarded to its download (and to the no-JavaScript link). An invalid `wait` is dropped there. The page shows no checksum: compare one with `?status&transfer=<id>` from a client that reads the `X-Hoody-Pipe-Transfer-Id` header. **Values:** `?receive` (bare), `?receive=true`, `?receive=yes`, `?receive=1` → page. `?receive=false`, `?receive=no`, `?receive=0` → normal pipe receiver. **Precedence:** with several page parameters a browser gets `video`, then `progress`, then `share`, then `receive`. With `video` on, the other page parameters are ignored for every client: a browser gets the player, and the player's own request (`X-Pipe-Stream: 1`) or any other client gets the data, so a link showing only a `video` URL never reaches a page that shows the name. **Security:** CSP with nonces, `connect-src 'self'`, `frame-src 'self'`, no external resources, `Cache-Control: no-store`. Values from the URL are only rendered as escaped text. The page uses no cookies or browser storage.
- `share` — Return the share page: stream the screen (a screen, window or tab, optionally with its audio), a camera with microphone, or the microphone alone, live to the viewers of `/{path}?video`. The page itself takes no receiver slot. **Browser detection:** like `video`, only a client whose `Accept` header includes `text/html` gets the page. Other clients with `?share` fall through to the normal receiver. **What the page does:** Start asks the browser for the capture (the user picks the screen, window or tab in the browser's own picker), records it as WebM (a non-live video share falls back to MP4 in a browser that cannot record WebM) and sends it to the path as one streaming upload. The page shows a link for viewers (`?video`, with `n` when it is above 1; copy button and QR code), viewers connected, streaming state and elapsed time. Stop, or ending the share from the browser's own controls, finishes the stream; Start again on the same path reconnects the viewers. A share nobody joins ends after the server's 5-minute wait (not with Live, which starts at once). A browser that cannot stream an upload gets a clear "not supported" message. **Live:** with the Live box ticked (`live=1` on the page URL) the upload is a `live` broadcast (`POST /{path}?live`): it starts at once, viewers join and leave at any time through `?video&live=1` (each from the next keyframe; the page asks the recorder for one every 2 s), `n` is ignored, and the page shows the viewers watching now from `?progress`. Live needs a WebM recording; a browser that cannot record WebM gets a "not supported" message. **Page parameters:** `source`, `audio`, `surface`, `quality`, `fps`, `live`, `n` (viewers). They only pre-fill the controls: capture always starts with the user's click on Start. **Values:** `?share` (bare), `?share=true`, `?share=yes`, `?share=1` → page. `?share=false`, `?share=no`, `?share=0` → normal pipe receiver. **Security:** CSP with nonces, `connect-src 'self'`, no external resources, `Cache-Control: no-store`. The page uses no cookies or browser storage.
- `autostart` — Receive page (`receive`) only: `1`, `true`, `yes` or bare starts the receive without a click once the page has loaded. Any other value, or none, waits for the user's click. Ignored on every other request.
- `source` — Share page (`share`) only. Pre-selects the source. `screen` (default) is a screen, window or tab; `camera` is a camera with microphone; `audio` is the microphone alone. Invalid → `screen`.
- `audio` — Share page (`share`) only. `1`, `true`, `yes` or bare pre-checks "include audio" for a screen share (tab or system audio, where the browser offers it). Default off.
- `surface` — Share page (`share`) only. Which kind of surface the browser's picker offers first. `monitor` (a whole screen), `window` or `browser` (a tab). The user still makes the choice. Default no hint.
- `quality` — Share page (`share`) only. Capture size and bit rate. `low` (about 480p), `medium` (about 720p, default) or `high` (about 1080p). Invalid → `medium`.
- `fps` — Share page (`share`) only. Frames per second for screen and camera, 1-60. Invalid → 30.
- `status` — Return one JSON snapshot of the name (`PipeStatus`) instead of receiving. It takes no receiver slot, is answered at once and is never held open; poll it from scripts and agents that cannot hold a `?progress` stream. Checked before every other parameter (`progress`, `share`, `receive`, `n`, `wait`, and the modes `live`, `ws` and `live` with `ws`), for browsers too. With `video` on it is not answered: a link that shows only a `video` URL passes other keys through, and the snapshot carries the sender's own transfer id. Without `video`, `HEAD` with `?status` returns the headers only. A POST/PUT with `?status` ignores it and is a sender as usual (a live sender with `live`). `state`: `idle` (nobody on the name; an unused name is idle, not 404), `waiting`, `streaming`, `complete`, `failed`; `kind`: `null` when idle, `"pipe"` for a transfer, `"ws"` for a WebSocket pair (`ws`), `"live"` for a live stream (`live`); `peers`: with `"ws"`, the peers connected now (0-2); `null` for a transfer; `transferId`: set from when the transfer starts streaming, or from the sender's arrival when it chose its own (`transfer` on the sender); the same value receivers get in `X-Hoody-Pipe-Transfer-Id`; `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed` (bytes/s), `eta` (s), `elapsed` (s): the `?progress` fields; `speed` is the average since streaming started, and in `complete`/`failed` `elapsed` and `speed` are frozen at the end; `reason`: why it failed (`Timed out`, `Idle timeout`, `Sender disconnected`, ...), else `null`; `sha256`: the digest in `complete` when `?sha256` was on, else `null` A finished transfer stays visible for 30 s (at most the 1000 most recent ones), then the name reads `idle`; a new sender or receiver on the name starts a fresh `waiting`. Responses carry `Cache-Control: no-store`. **Values:** `?status` (bare), `true`, `yes`, `1` → snapshot; `false`, `no`, `0` → normal receiver. _(on `GET /api/v1/pipe/{path}`)_
- `transfer` — With `status`: answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. A `?sha256` transfer, and every transfer with a sender-chosen id, leaves a receipt (state, reason, digest, bytes) kept 10 minutes (at most 1000; the oldest go first), so a receiver verifies its bytes after it has read them all: `complete` with the same `sha256` means the bytes match. A sender-chosen id answers from the sender's arrival on (`waiting`). An id that is neither the name's current transfer nor a kept receipt for this name is 404. A `transfer` on a `ws` upgrade is 400 (with `status`, the snapshot is answered before `ws` is looked at). _(on `GET /api/v1/pipe/{path}`)_
- `wait` — How long this receiver waits for the sender (and the other receivers of an `n` transfer), in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes it gets 408 `Timed out waiting for sender.` (no sender connected) or `Timed out waiting for receivers.` (the sender is there, fewer than `n` receivers are), and a waiting sender sees `[INFO] A receiver disconnected.` and keeps waiting. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered. _(on `GET /api/v1/pipe/{path}`)_
- `ws` — WebSocket relay: open a duplex message connection on the name instead of receiving. Send `GET /{path}?ws` with a WebSocket upgrade (`Upgrade: websocket`; a plain GET is 426). Two peers on the same name are paired 1:1: every message one sends reaches the other with its type (text or binary) and boundaries kept. The first peer is accepted at once (101) and its messages are held until the second arrives (at most 4096 messages / 2 MiB); it waits `wait` seconds (default 300), then is closed with 4408 `Timed out waiting for peer.`. A third peer is 409. Behind HTTP/2 a browser opens the socket over HTTP/1.1 (no extended CONNECT is needed). A name holds one kind of session: a name with an HTTP transfer (sender or receivers) refuses `?ws` with 409, and a name with a WebSocket pair refuses senders and receivers with 409. `?status` reports a pair as `kind: "ws"` with `peers` 0-2; `?progress` sees its state and byte counts. **Subprotocol:** the first peer's `Sec-WebSocket-Protocol` choice (its first offered token, echoed back) is latched for the pair; the second peer must offer that token, or offer none when the first offered none (else 409). **Limits:** messages up to 1 MiB (a bigger one closes its sender's connection with 1009, and the other peer is closed with 1009 `Message too big.`). Each direction buffers at most 2 MiB for a slow reader; past that the pair is closed with 1013. Idle peers are pinged; one that does not answer within about 120 s is dropped. **Close codes:** a peer's close is forwarded to the other: 1000-1003, 1007-1014 and 3000-4999 as sent; 1005 (no code) as 1000; anything else (1006, a dropped connection) as 1001 `Peer disconnected.`. The relay's own: 1013 `Relay buffer full: no peer yet.` / `Relay buffer full: the reader is too slow.` / `Relay dropped a message.`, 4408 `Timed out waiting for peer.`, 1011 `Internal error.`, 1001 `Server shutting down.`. Not with `n` (400). `live` with `ws` is 400 before any other check except `status` without `video`, with or without an upgrade. `wait` applies as for receivers. **Values:** `?ws` (bare), `true`, `yes`, `1` → WebSocket relay; `false`, `no`, `0` → normal receiver. **Upgrade response:** an accepted peer gets `101 Switching Protocols`; the first peer gets it at once, before the second arrives.
- `live` — Watch a live stream (a sender with `?live`): join at any time, leave and rejoin at will. With no live sender yet, the viewer waits like a receiver (`wait`, default 300 s, then 408 `Timed out waiting for sender.`). The body is a **suffix** of the stream: no `Content-Length`, `X-Hoody-Pipe-Live: 1`, `Cache-Control: no-store`, no `X-Hoody-Pipe-Transfer-Id`. A WebM stream starts with its header, sent as soon as it is known so the response begins without waiting for a keyframe, then a Cluster that begins with a video keyframe (any Cluster for audio-only); other bodies start at the next chunk. A live viewer gets none of the sender's own metadata: no `X-Piping` or `X-Hoody-Pipe`, and of its `Content-Disposition` only the type, and only `inline`, `attachment` or `form-data` (as `attachment`), never a filename. **Slow viewers:** a viewer that falls 2 MiB behind skips whole Clusters (WebM) until it has caught up to 512 KiB, resuming at a keyframe Cluster. One more than 8 MiB or 4096 pieces behind, one that takes nothing for 60 s, or the most-behind one when the server's live memory budget is full, is cut: its body ends without the chunked terminator. The others are never slowed. **Ending:** after the sender's clean end a viewer takes what it was already sent (up to 60 s), then its body ends normally; if the sender fails, every viewer is cut. A viewer's response counts against the limits until it disconnects, or until 35 s after its body ended cleanly (6 s after it was cut). **Plain GET:** a GET without `live` on a name whose live stream is running joins it the same way (a suffix, marked `X-Hoody-Pipe-Live: 1`). While `?live` viewers wait for a sender, a plain GET or `live=0` is 409. `?video&live` serves the player for a live stream; on `?share` (a browser), `live=1` pre-ticks the page's Live box. Not with `n` above 1, `sha256` or `ws` (400). At most 256 viewers per stream and 4096 live viewer responses in all (429). **Values:** `?live` (bare), `true`, `yes`, `1` → watch live; `false`, `no`, `0` → an ordinary receiver (409 on a live name). _(on `GET /api/v1/pipe/{path}`)_
- `sha256` — Ask the server to hash the transfer (a receiver can switch it on alone). Read `X-Hoody-Pipe-Transfer-Id`, hash the bytes as you receive them, then compare with `?status&transfer=<id>` (see `transfer`). The digest cannot come in-band: response headers go out before the body, and HTTP trailers are not sent. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. _(on `GET /api/v1/pipe/{path}`)_
- `path` — Pipe path name _(on `HEAD /api/v1/pipe/{path}`)_
- `status` — Must be on (`?status`, `true`, `yes`, `1`) _(on `HEAD /api/v1/pipe/{path}`)_
- `transfer` — Answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. The answer has no body, so the status tells the result: 200 when the id is the name's current transfer or a kept receipt for this name, 404 when it is neither, 400 when it is not a transfer id. Receipts are kept as for `GET /{path}?status&transfer=<id>`, which also returns the snapshot. _(on `HEAD /api/v1/pipe/{path}`)_
- `path` — Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`). POST/PUT to a reserved path return 400; any other method except GET/HEAD/OPTIONS returns 405 with `[ERROR] Method <verb> is not allowed.\n` and `Allow: GET, HEAD, OPTIONS`. Examples: `myfile`, `transfer123`, `secret.png`, `logs/today` _(on `POST /api/v1/pipe/{path}`)_
- `n` — Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256. _(on `POST /api/v1/pipe/{path}`)_
- `wait` — How long this sender waits for its `n` receivers, in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes, the status stream ends with `[ERROR] Timed out waiting for receivers.` Receivers already waiting keep their own `wait`, so another sender may still come for them. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered, so a script is never given a shorter wait than it asked for. **Through the Hoody edge:** a sender whose large body is still waiting is cut after about 30 minutes; receivers and small senders can wait the full hour. For long waits with large files, let the receiver wait (`?wait=3600`) and start the sender once `?status` shows it. _(on `POST /api/v1/pipe/{path}`)_
- `sha256` — Compute the SHA-256 of the bytes forwarded to receivers (for multipart, of the file part or `input_text`, which is what receivers get). On a complete transfer the status stream gets `[INFO] SHA-256: <64 hex>` between `[INFO] Upload complete.` and `[INFO] Transfer complete.`, and the digest is in the `?progress` `done` event and in `?status`. A failed transfer has no digest. Any receiver can switch hashing on as well. Hashing adds processing overhead per byte, so it is opt-in. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off. _(on `POST /api/v1/pipe/{path}`)_
- `transfer` — This transfer's own id instead of a generated one: 16-64 characters `A-Z a-z 0-9 _ -`. A sender cannot read response headers while it uploads, so it picks the id up front to follow its own transfer with `?status&transfer=<id>`. The id is the `transferId` in `?status` from the sender's arrival (also while it waits), the `X-Hoody-Pipe-Transfer-Id` receivers get, and the `done` event's `transferId`. A transfer with its own id leaves a receipt for every outcome, kept 10 minutes: `complete`, or `failed` with its `reason`, also when it ended before streaming (`Timed out waiting for receivers`, `Sender disconnected`, `Server at capacity`). Any other value is 400. An id still held by a waiting, running or finished transfer on any name, or by a kept receipt, is 409. Not with `ws` (400). On a `live` sender it is the live stream's `transferId` in `?status` from the start, and its receipt (`"kind": "live"`, `complete` or `failed`) once it ends; live viewers get no `X-Hoody-Pipe-Transfer-Id`. _(on `POST /api/v1/pipe/{path}`)_
- `live` — Live broadcast: start streaming at once, even with no viewers, and let any number of viewers join and leave at any time (`GET /{path}?live`; up to 256 at once). Nothing waits for a receiver and nothing is stored: bytes sent while nobody watches are dropped. Viewers are never in lockstep: one that falls behind skips ahead (WebM: whole Clusters, resuming at a keyframe Cluster) or is cut, and never slows the sender or the others. **WebM bodies** (starting with the EBML magic, e.g. MediaRecorder or `ffmpeg -f webm`) get keyframe joins: a viewer receives the stream header, then the stream from the next Cluster that starts with a video keyframe (any Cluster for audio-only). Join delay is the keyframe interval. **Any other body** (logs, text, other containers) is sent to a viewer from the next chunk on. **Status lines** (at most four): `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` on a clean end, or the idle-timeout / failure `[ERROR]` lines. Viewer counts are on `?progress` and `?status` (`kind: "live"`). **Ending:** a clean end lets each viewer take what it was already sent (up to 60 s), then its body ends normally. A sender that disconnects, fails or idles 5 minutes cuts every viewer (their bodies end without the chunked terminator, which clients report as an error). The name is free for reuse as soon as the sender ends, unless the sender held it with `X-Hoody-Pipe-Sender-Key`. Not with `n` above 1, `sha256`, `ws` or a multipart body (400). A name with waiting or streaming ordinary transfers, or a WebSocket pair, is 409. At most 100 live streams and 4096 viewer responses at once (429). `wait` is validated but a live sender never waits. **Values:** `?live` (bare), `true`, `yes`, `1` → live; `false`, `no`, `0` → an ordinary sender. _(on `POST /api/v1/pipe/{path}`)_
- `X-Hoody-Pipe-Sender-Key` — With `live`: a secret that holds the name for this sender. The first live sender that sends one holds the name while it streams and for 1 hour after its stream ends; in that time every POST or PUT on the name, live or not, must send the same key (403 otherwise), and `?ws` on the name is 409. Viewers never need it. Send it on every restart of the stream; a name held by nobody takes a new key. The hold starts with that first keyed sender, so start the stream before sharing its viewer link. Only a hash of the key is kept, in memory. 16-128 characters `A-Z a-z 0-9 _ -` (400 otherwise); without `live` on a name nobody holds, 400. At most 1000 names are held at once (429 for a new key past that; nothing is released early). _(on `POST /api/v1/pipe/{path}`)_
- `path` — Unique pipe path name (same rules as POST, so no reserved paths and at most 1024 chars) _(on `PUT /api/v1/pipe/{path}`)_
- `n` — Number of receivers to wait for (must match receivers' `n`, max 256) _(on `PUT /api/v1/pipe/{path}`)_
- `wait` — Seconds this sender waits for its receivers, 1–3600 (default 300). Same rules as POST. _(on `PUT /api/v1/pipe/{path}`)_
- `sha256` — Compute the SHA-256 of the forwarded bytes. Same rules as POST. _(on `PUT /api/v1/pipe/{path}`)_
- `transfer` — This transfer's own id (16-64 characters `A-Z a-z 0-9 _ -`). Same rules as POST. _(on `PUT /api/v1/pipe/{path}`)_
- `live` — Live broadcast (any number of viewers join and leave at any time). Same rules as POST. _(on `PUT /api/v1/pipe/{path}`)_
- `X-Hoody-Pipe-Sender-Key` — With `live`, a secret that holds the name for this sender. Same rules as POST. _(on `PUT /api/v1/pipe/{path}`)_
- `path` — Any valid pipe path (reserved pages included). They all get the same preflight. Health has its own 204 preflight (see above). _(on `OPTIONS /api/v1/pipe/{path}`)_

