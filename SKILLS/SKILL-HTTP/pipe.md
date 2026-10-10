> _**HTTP skill · `pipe` namespace** · ~9,193 tokens · hoody-sdk v1.0.0-beta.17_

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

Send with `POST` (or `PUT`) and receive with `GET` on the same `/{path}` of the kit URL (`/api/v1/pipe/{path}` is the same route).

### 1. One-to-one

`GET /{path}` (blocks until a sender arrives); `POST /{path}` with the body. `n=1` by default.

### 2. Fan-out (N ≤ 256)

All peers use the same `path` and the same receiver count (`?n=N`). A mismatch → 400.

### 3. Download / inline per receiver

`GET /{path}?download=1` and/or `?filename=<name>` → attachment; `?download=0` → inline.

### 4. Watch via `?progress`

`GET /{path}?progress`. `Accept: text/event-stream` → SSE; `text/html` → dashboard. No receiver slot.

### 5. Video via `?video`

`GET /{path}?video` with `Accept: text/html` → MSE player; non-browser → raw bytes. Sender: WebM / fMP4 (MPEG-TS plays in VLC/mpv, not in the browser player).

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
| `quality` | `low` \| `medium` \| `high` | up to 480p / 720p / 1080p (default `medium`) |
| `fps` | 1–60 | frame rate (default 30) |
| `n` | 1–256 | viewer count |
| `live` | `1` | live broadcast: starts at once, viewers join and leave at any time through `?video&live=1`; `n` does not apply |

Video page `<kit>/api/v1/pipe/<name>?video&n=<n>&live=1&wait=<s>` (`n` only when >1, not with `live`; `live=1` plays a live broadcast; `wait` 1-3600 s is how long the player waits for the stream; opening it receives). Progress page `<kit>/api/v1/pipe/<name>?progress` (no params, no slot). No-JS form `<kit>/api/v1/pipe/noscript?path=<name>&mode=file|text&wait=<s>&sha256=1` (`wait` and `sha256` go on to its upload).

Build the URL from the tables; values are percent-encoded.

### 7. Status, waiting time and checksums

`?status` is one JSON snapshot of a name, with no receiver slot: `state` (`idle`, `waiting`, `streaming`, `complete`, `failed`), `kind` (`pipe`, `ws`, `live` or null), `peers`, `transferId`, `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed`, `eta`, `elapsed`, `reason`, `sha256`. `?wait=<s>` (1-3600, default 300) sets how long one sender or receiver waits for the other side. `?sha256` (sender or any receiver) has the kit hash the stream; receivers of an ordinary (not `?live`) transfer get the transfer id in `X-Hoody-Pipe-Transfer-Id`, and `?status&transfer=<id>` returns that transfer, for a hashed one also for up to 10 min after it ends (the kit keeps at most 1,000 receipts in all and evicts the oldest first, so a busy kit can drop one sooner). Prometheus metrics: `GET /api/v1/pipe/metrics`.

`GET /{path}?status` (also `HEAD`); `GET /{path}?status&transfer=<id>` (unknown or expired id → 404, malformed → 400). A sender can't read headers while uploading, so it can pick the id: `POST /{path}?transfer=<id>` (16-64 chars `A-Z a-z 0-9 _ -`, else 400; an id still held by a transfer on any name or a kept receipt → 409; not with `ws`; a `live` sender takes it too). That id is `transferId` from the sender's arrival (also `waiting`), and `?status&transfer=<id>` keeps a receipt for up to 10 min for every outcome (at most 1,000 receipts in all, oldest evicted first), including `failed` before streaming (`Timed out waiting for receivers`, `Sender disconnected`). Sender with `?sha256`: its status body gets `[INFO] SHA-256: <hex>` before `[INFO] Transfer complete.`. A receiver compares its own hash with `sha256` from `?status&transfer=<id>` after reading the body.

### 8. Live broadcast (`?live`)

A live sender streams at once, with nobody watching; any number of viewers (256 at once) join and leave while it runs and each gets the stream from then on (no `Content-Length`, header `X-Hoody-Pipe-Live: 1`; the headers come with the viewer's first bytes). WebM joins at the next keyframe Cluster after the stream header, so players decode it; anything else joins at the next chunk. Bytes sent while nobody watches are dropped. A viewer 8 MiB or 4096 pieces behind, taking nothing for 60 s, or furthest behind when the live memory budget (64 MiB per stream, 512 MiB in all) is full is cut: its body ends with an error. A clean sender end gives each viewer up to 60 s to finish; a sender that disconnects, fails or idles 5 min cuts every viewer. Sender status: `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` or an `[ERROR]` line. `?status` shows `kind: "live"`, viewers in `activeReceivers`, `totalReceivers: null`; `?progress` events carry `live: true`. Not with `n` above 1, `sha256`, `ws` or multipart (400); a live sender on a name with an ordinary transfer, an ordinary sender on a live name, or a plain GET while `?live` viewers wait → 409 (a plain GET on a running live stream joins it). Caps: 100 live streams, 4096 viewer responses in all (each counts until it disconnects or 35 s after its body ended) → 429.
`POST|PUT /{path}?live` starts the broadcast; viewers `GET /{path}?live`; browsers open `/{path}?video&live` for the player that keeps up with the newest data.

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
- `?video` HTML player only on `Accept: text/html`; no receiver slot. A valid `?wait` on the player URL is used by each of its receives; an invalid one is ignored. It plays each stream to its end, even a short file that arrives all at once, then waits on the same path: the next stream sent there replaces it. Audio-only WebM (Opus/Vorbis) plays as audio; with `?n=N` the players may be tabs of one browser. Without `live` it never skips content (a stream that fell behind stays behind; it reads at most 45 s ahead); with `live` (`?video&live=1`), a player that falls behind may jump to the newest buffered media. Playback stopped 1.5 s with media buffered ahead moves on to it.
- `?progress` no receiver slot. Caps: 50/path, 500 groups, 30 min TTL.
- `?receive` and `?share` serve pages only on `Accept: text/html` (a browser); any other client gets the data as a plain receiver, like `?video`. With several page params on one URL a browser gets `?progress`, then `?video`, then `?share`, then `?receive`; `=0`/`false`/`no` turns one off.
- `?receive` page: shows the name and whether a sender waits (from `?progress`, no slot). On the person's click — or by itself with `autostart=1` — the browser's download manager receives `?download` (plus `n`, `filename`, and the page's own `wait` and `sha256`), so any size goes to disk without passing through the page. Progress and the result are only in the browser's downloads list: the page cannot see the download, so after Receive it stays `Receiving in your browser` and never reports success. Its only outcome is `Failed` with the kit's error text when the download frame gets one (`Timed out waiting for sender.` after 5 min or the page's `wait`, an `n` mismatch, a taken slot); `?progress` state snapshots fill an info line labelled "Status for this name" (all its senders and receivers, not this download: no sender yet / sender waiting for receivers / transfer running; "Status unavailable, retrying…" while the stream is down) and never set an outcome. Cancel frees the slot while waiting (a started download goes on in the browser's downloads); Receive again after a failure retries. Pre-fill: `n` (invalid → 1, max 256), `filename` (sanitized like `?filename`), `autostart=1` (only `1`/`true`/`yes`/bare), `wait` (1-3600 s; invalid → dropped), `sha256` (forwarded only; the page shows no checksum).
- `?share` page: shares the screen (with its audio if ticked), the camera with the microphone, or the microphone only, live to the `?video` player.
  - Start sharing asks the browser for the capture (the person's click), then sends one WebM stream to the name and shows a viewer link (Copy + QR) to `<name>?video` (plus `&n=`).
  - Without Live, the stream starts when all `n` viewers have opened the link; until then the page shows `Waiting for viewers… x of n connected`. With Live (the Live box or `live=1`), it is a `?live` broadcast that starts at once and viewers join and leave at any time. The page shows viewers, elapsed time and bytes sent (from `?progress`, no slot).
  - Stop, or the browser's own stop-sharing control, ends the stream; Start sharing again shares on the same name and players still open on the link play it.
  - Without Live, it ends with a message when nobody (or not all `n`) opened the link within 5 min, or all viewers left. In either mode it ends with a message when the name is busy, the kit refused the share (its error text), or the connection cannot keep up.
  - It needs a browser that can stream an upload (Chromium-based) over HTTPS with HTTP/2 or HTTP/3; any other browser gets a message instead of a start. It stores nothing in the browser.
  - Pre-fill: `source=screen|camera|audio`, `audio=1` (screen audio), `surface=monitor|window|browser` (offered first in the picker), `quality=low|medium|high` (up to 480p/720p/1080p), `fps` (1–60, default 30), `n` (1–256), `live=1` (Live). Invalid values fall back to the defaults; capture still needs the click on Start sharing.
- `/` (also `/api/v1/pipe/`) is the send page.
  - It sends one file, a typed or pasted text, or a pasted image (sent as a file).
  - It fills in a random name that the person can edit, plus `n`. Send/Cancel uses one POST to `/api/v1/pipe/<name>`: each `/`-separated part of the name is encoded, so `?`, `#` and `%` stay in the name, and leading `/` are kept. A name with a `.` or `..` part (also `%2e`) is refused before sending, as in the SDK.
  - The file name, or `filename` for a text or pasted image, goes in `Content-Disposition`. A typed or URL-given file name is kept when a file is picked or pasted.
  - It reports Delivered only when the POST response ends with `[INFO] Transfer complete.`; any other ending is shown as Failed. Each `[INFO] A receiver disconnected.` after `[INFO] Streaming to …` is a receiver that did not get everything: `Delivered to 1 of 2 receivers (1 disconnected).`
  - It shows the connected receivers and the state from `?progress` (no slot). It shows a receive link (Copy + QR) to `<name>?receive` (plus `&n=`).
  - Cancel frees the name. The page stores nothing in the browser and sends a nonce CSP with `connect-src 'self'`.
  - Pre-fill: `name` (≤1024; absent → random), `n` (1–256, invalid → 1), `text` (≤100000, selects text mode), `mode=file|text`, `filename` (≤255), `autostart=1` (text mode with a text only; never for a file; a refused name shows the reason instead). Over-long values are cut without splitting a character.
- To hand a person a ready send link, build `<kit>/api/v1/pipe/?name=<name>&text=<text>` (add `&autostart=1` to send it on open, `&filename=<name.ext>`, `&n=N`). For a file, give `?name=<name>`: they pick the file and click Send.
- WebSocket relay: `GET /{name}?ws` with an upgrade pairs exactly two peers. Messages pass both ways with their type and boundaries kept, at most 1 MiB each. The first peer's messages are held (4096 / 2 MiB) until the second arrives (`?wait`, default 300 s, then close `4408`). A slow reader more than 2 MiB behind closes the pair with `1013`. Close codes 1000-1003, 1007-1014 and 3000-4999 are forwarded; a drop arrives as `1001`. The first peer's subprotocol binds the pair. A name holds either a transfer or a pair, never both (409 both ways); `?status` shows `kind: "ws"`, `peers`. 
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
container id, server name) from `GET /api/v1/containers/{id}` first, then
`KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"`.

Pipe paths are reservations: receivers and senders rendezvous on the same path.
Pick a unique path (e.g. `transfer-$(openssl rand -hex 4)`) per transfer — once
it's claimed by a sender or receiver, the same path can't host another transfer
until the first one finishes or the 5-min idle TTL evicts it.

### 1. One-to-one transfer — receiver waits, sender pushes bytes

**Goal:** stream a payload from one endpoint to another with zero staging. Receiver opens the GET first; the connection blocks until the sender POSTs to the same path.

**Step 1 — start the receiver in the background.** It blocks until the sender connects.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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

**Result:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got `content-type: text/plain` only — no Content-Disposition.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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
event: state    data: {"state":"idle",...}
event: state    data: {"state":"waiting","hasSender":true,"activeReceivers":1,...}
event: state    data: {"state":"streaming",...}
event: progress data: {"bytesTransferred":50000,"totalBytes":50000,...}
event: done     data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857}
```

Only `done` says how a transfer ended. A failed one sends `{"state":"failed",…,"reason":"Sender disconnected"}`; `state` events carry only `idle`, `waiting` and `streaming`. A spectator that connects within 30 s after a transfer ends gets `204` and no events.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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

**Result:** ~6 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="watched-$(openssl rand -hex 4)"
# Save the dashboard page
curl -s -H 'Accept: text/html' \
  "$KIT/api/v1/pipe/$PATH_NAME?progress=1" > /tmp/dashboard.html
# Or just paste into a browser:
echo "Open in browser: $KIT/api/v1/pipe/$PATH_NAME?progress=1"
```

### 7. Stream a screen-recording to an MSE video player

**Goal:** stream live WebM or fragmented MP4 from `ffmpeg` and watch it in a browser without serving a separate frontend. MPEG-TS plays only in a media player (VLC, mpv): the page tells a browser viewer so. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Result:** ~7.7 KB HTML page titled `"Hoody Pipe — Video"` with `MediaSource` + `data-path` baked in.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="screencast-$(openssl rand -hex 4)"
# 1) Open the player URL in a browser:
echo "Watch: $KIT/api/v1/pipe/$PATH_NAME?video=1"
# 2) Then on the source machine, push the live encode:
ffmpeg -f x11grab -i :0.0 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -f webm - \
  | curl --upload-file - "$KIT/api/v1/pipe/$PATH_NAME"
# Non-browser viewers (VLC/mpv/ffplay) use the same URL — they get raw bytes:
mpv "$KIT/api/v1/pipe/$PATH_NAME?video=1"
```

### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, skips the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Result:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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

**Goal:** know what blows up at the validator. The kit counts the path name after the `/api/v1/pipe` prefix, leading `/` not counted: a path name over 1024 characters → `414 Path too long`. That path cap is the only length limit the kit itself enforces.

**Result:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- The kit accepts at most 1024 characters in the path name as it is sent (percent-encoded); 1025 gets `414`. The SDK and CLI check the unencoded name, so a name that passes can still exceed the limit once percent-encoded and receive `414`.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"

# A 1100-char path is rejected with HTTP 414
LONG=$(printf 'x%.0s' {1..1100})
curl -s -o /tmp/err -w 'code=%{http_code}\n' \
  -X POST --data-binary 'data' "$KIT/api/v1/pipe/$LONG"
# → code=414
cat /tmp/err   # → [ERROR] Path too long (max 1024 characters).

# Stay under the cap — keep paths short and use a random suffix:
SHORT="t-$(openssl rand -hex 8)"  # ~17 chars total
```

### 10. Sidechannel metadata via `X-Hoody-Pipe`

**Goal:** attach commit / build / job metadata to the transfer without polluting the body. The kit forwards `X-Hoody-Pipe` and `X-Piping` (≤ 8 KiB each, CRLF-stripped) to receivers and exposes them via `Access-Control-Expose-Headers` so browsers can read them.

**Response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Hoody-Pipe-Transfer-Id, X-Piping, X-Hoody-Pipe
x-hoody-pipe: build-id=42; commit=abc1234
x-piping: legacy-meta=true
```

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
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
| `GET /api/v1/pipe/health` | Service health check |  |
| `GET /api/v1/pipe/help` | Get help text with curl examples |  |
| `GET /api/v1/pipe/metrics` | Service metrics (Prometheus) |  |

### `pipe` (2) — pipe

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/{path}` | One snapshot of a pipe name (GET ?status): state, sender, receivers, bytes. Takes no receiver slot. | `?transfer` `?headersOnly` |
| `POST /api/v1/pipe/{path}` | Send data to a pipe | `?n` `?wait` `?sha256` `?transfer` `?live` `body:application/octet-stream,text/plain,multipart/form-data` |

**Param notes:**

- `path` — Pipe path name to receive from — must match the path used by the sender. Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers. _(on `GET /api/v1/pipe/{path}`)_
- `transfer` — With `status`: answer for one transfer, by the id a receiver got in `X-Hoody-Pipe-Transfer-Id` or the id a sender chose with its own `transfer`, even after the name was reused or its 30 s linger ended. A `?sha256` transfer, and every transfer with a sender-chosen id, leaves a receipt (state, reason, digest, bytes) kept 10 minutes (at most 1000; the oldest go first), so a receiver verifies its bytes after it has read them all: `complete` with the same `sha256` means the bytes match. A sender-chosen id answers from the sender's arrival on (`waiting`). An id that is neither the name's current transfer nor a kept receipt for this name is 404. Not with `ws` (400). _(on `GET /api/v1/pipe/{path}`)_
- `headersOnly` — Answer only the response headers (HEAD ?status): a liveness probe with no snapshot.
- `path` — Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`). POST/PUT to a reserved path return 400; any other method except GET/HEAD/OPTIONS returns 405 with `[ERROR] Method <verb> is not allowed.\n` and `Allow: GET, HEAD, OPTIONS`. Examples: `myfile`, `transfer123`, `secret.png`, `logs/today` _(on `POST /api/v1/pipe/{path}`)_
- `n` — Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256.
- `wait` — How long this sender waits for its `n` receivers, in seconds, counted from its own arrival: an integer from 1 to 3600 (default 300). When it passes, the status stream ends with `[ERROR] Timed out waiting for receivers.` Receivers already waiting keep their own `wait`, so another sender may still come for them. Anything else (`abc`, `1.5`, `0`, `3601`, or a bare `?wait`) is a 400 and nothing is registered, so a script is never given a shorter wait than it asked for. **Through the Hoody edge:** a sender whose large body is still waiting is cut after about 30 minutes (the proxy's request-body timeout); receivers and small senders can wait the full hour. For long waits with large files, let the receiver wait (`?wait=3600`) and start the sender once `?status` shows it.
- `sha256` — Compute the SHA-256 of the bytes forwarded to receivers (for multipart, of the file part or `input_text`, which is what receivers get). On a complete transfer the status stream gets `[INFO] SHA-256: <64 hex>` between `[INFO] Upload complete.` and `[INFO] Transfer complete.`, and the digest is in the `?progress` `done` event and in `?status`. A failed transfer has no digest. Any receiver can switch hashing on as well. Hashing adds processing overhead per byte, so it is opt-in. **Values:** `?sha256` (bare), `true`, `yes`, `1` → on; `false`, `no`, `0` → off.
- `transfer` — This transfer's own id instead of a generated one: 16-64 characters `A-Z a-z 0-9 _ -`. A sender cannot read response headers while it uploads, so it picks the id up front to follow its own transfer with `?status&transfer=<id>`. The id is the `transferId` in `?status` from the sender's arrival (also while it waits), the `X-Hoody-Pipe-Transfer-Id` receivers get, and the `done` event's `transferId`. A transfer with its own id leaves a receipt for every outcome, kept 10 minutes: `complete`, or `failed` with its `reason`, also when it ended before streaming (`Timed out waiting for receivers`, `Sender disconnected`, `Server at capacity`). Any other value is 400. An id still held by a waiting, running or finished transfer on any name, or by a kept receipt, is 409. Not with `ws` (400). On a `live` sender it is the live stream's `transferId` in `?status` from the start, and its receipt (`"kind": "live"`, `complete` or `failed`) once it ends; live viewers get no `X-Hoody-Pipe-Transfer-Id`. _(on `POST /api/v1/pipe/{path}`)_
- `live` — Live broadcast: start streaming at once, even with no viewers, and let any number of viewers join and leave at any time (`GET /{path}?live`; up to 256 at once). Nothing waits for a receiver and nothing is stored: bytes sent while nobody watches are dropped. Viewers are never in lockstep: one that falls behind skips ahead (WebM: whole Clusters, resuming at a keyframe Cluster) or is cut, and never slows the sender or the others. **WebM bodies** (starting with the EBML magic, e.g. MediaRecorder or `ffmpeg -f webm`) get keyframe joins: a viewer receives the stream header, then the stream from the next Cluster that starts with a video keyframe (any Cluster for audio-only). Join delay is the keyframe interval. **Any other body** (logs, text, other containers) is sent to a viewer from the next chunk on. **Status lines** (at most four): `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` on a clean end, or the idle-timeout / failure `[ERROR]` lines. Viewer counts are on `?progress` and `?status` (`kind: "live"`). **Ending:** a clean end lets each viewer take what it was already sent (up to 60 s), then its body ends normally. A sender that disconnects, fails or idles 5 minutes cuts every viewer (their bodies end without the chunked terminator, which clients report as an error). The name is free for reuse as soon as the sender ends. Not with `n` above 1, `sha256`, `ws` or a multipart body (400). A name with waiting or streaming ordinary transfers, or a WebSocket pair, is 409. At most 100 live streams and 4096 viewer responses at once (429). `wait` is validated but a live sender never waits. **Values:** `?live` (bare), `true`, `yes`, `1` → live; `false`, `no`, `0` → an ordinary sender.

