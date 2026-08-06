> _**HTTP skill · `pipe` namespace** · ~4,906 tokens · hoody-sdk v1.0.0-beta.12_

# `pipe` — Zero-storage streaming HTTP transfers

## Purpose

HTTP rendezvous. Sender POST/PUTs a path; receivers GET it; bytes fan out
in-memory, zero server storage. Paths exist only while pending/active.

## When to use

- Endpoint-to-endpoint bytes without staging.
- Fan-out (`?n=<count>`, N ≤ 256).
- Live video via `?video`.
- Telemetry via `?progress`.
- Browser upload UI via `/noscript` or `/`.

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

Drive via SDK (`POST /api/v1/pipe/{path}` / `GET /api/v1/pipe/{path}`), `curl` against the kit URL, or the hand-written `hoody pipe` CLI surface (subcommands `send`, `receive`, `progress`, `url`, `forward-tcp`, `health`, `help-cheatsheet` — a hand-written CLI surface, NOT part of the auto-generated command mapping).

### 1. One-to-one

`GET /api/v1/pipe/{path}` with `path` (blocks); `POST /api/v1/pipe/{path}` same `path`. `n=1`.

### 2. Fan-out (N ≤ 256)

All peers call with same `path` + `n=<N>`. Mismatch → 400.

### 3. Download / inline per receiver

`GET /api/v1/pipe/{path}` with `download=1` and/or `filename=<n>` → attachment; `download=0`
→ inline.

### 4. Watch via `?progress`

`GET /api/v1/pipe/{path}` with `progress=1`. `Accept: text/event-stream` → SSE; `text/html`
→ dashboard. No receiver slot.

### 5. Video via `?video`

`GET /api/v1/pipe/{path}` with `video=1` + `Accept: text/html` → MSE player; non-browser →
raw bytes. Sender: WebM / fMP4 / MPEG-TS.

## Quirks & gotchas

- Generated SDK + HTTP plus a hand-written `hoody pipe` CLI; the file does NOT cover its subcommands — they are a hand-written CLI surface.
- `/api/v1/pipe/{path}` ≡ bare `/{path}`.
- Reserved: `/`, `/noscript`, `/help`, `/favicon.ico`, `/robots.txt` (alias-hardened).
- `n` ≤ 256; peers must agree. Caps 1000 pending + 1000 active.
- Path ≤ 1024 enforced by kit; URL ≤ 4096 is a deployment-layer cap (proxy/Cloudflare) — `MAX_URL_LENGTH = 4096` is declared but not enforced in the kit validator. Control/backslash/%-slash → 400.
- Half-pipes / idle active evicted after 5 min.
- Dangerous sender MIME (HTML/SVG/JS) → `text/plain`; `nosniff` forced.
- Forwarded sender→receiver headers: `Content-Type` (sanitized — dangerous MIME → `text/plain`), `Content-Length` (when set), `X-Piping`, `X-Hoody-Pipe` (each ≤8 KiB, CRLF-stripped). `Content-Disposition` is rebuilt per-receiver from sender metadata + receiver `?download`/`?filename` params.
- `?download` enum (SDK-validated): `"true"`/`"false"`/`"yes"`/`"no"`/`"1"`/`"0"` (attach / inline). The kit is more permissive — bare `?download` (no value) and any non-`false`/`no`/`0` string are treated as truthy. `?filename=<v>` implies attach, sanitised (255 chars, RFC 5987).
- `?video` HTML player only on `Accept: text/html`; no receiver slot.
- `?progress` no receiver slot. Caps: 50/path, 500 groups, 30 min TTL.
- `Service-Worker: script` → 400.
- `Content-Range` on POST/PUT → 400.
- Multipart: only **first file part** used, 30s deadline.

## Common errors

- 400 — active / sender attached / `n` mismatch / slots full / `n`>256 / reserved / forbidden chars / `Service-Worker` / `Content-Range`.
- 405 — method (HEAD only on reserved).
- 408 — receivers timeout.
- 414 — path > 1024.
- 429 — pending/active/spectator cap.

## Related namespaces

`files` persist · `curl` HTTP client · `tunnel` long-lived bidi · `terminal`/`exec` shell.

## Examples

`pipe` examples below use HTTP and the generated SDK. A separate hand-written `hoody pipe` CLI also exists (subcommands `send`, `receive`, `progress`, `url`, `forward-tcp`, `health`, `help-cheatsheet`) — hand-written, NOT auto-generated. Every step in every example
was live-tested against a real `pipe-1` kit. Set `P`, `C`, `N` (project id,
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

**Goal:** make the browser save the response to disk with a specific name, regardless of what (or whether) the sender provided a `Content-Disposition`. `?filename=<v>` implies `?download` and overrides any sender-supplied filename.

**Live-tested response header:** `content-disposition: attachment; filename="report.bin"`.

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

**Live-tested:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got `content-type: text/plain` only — no Content-Disposition.

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

**Live-tested SSE stream** for a 50 KB payload:
```
event: state    data: {"state":"idle",...}
event: state    data: {"state":"waiting","hasSender":true,"activeReceivers":1,...}
event: state    data: {"state":"streaming",...}
event: progress data: {"bytesTransferred":50000,"totalBytes":50000,...}
event: done     data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857}
```

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

**Live-tested:** ~6 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

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

**Goal:** stream live MPEG-TS / fMP4 / WebM from `ffmpeg` and watch it in a browser without serving a separate frontend. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Live-tested:** ~7.7 KB HTML page titled `"Hoody Pipe — Video"` with `MediaSource` + `data-path` baked in.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="screencast-$(openssl rand -hex 4)"
# 1) Open the player URL in a browser:
echo "Watch: $KIT/api/v1/pipe/$PATH_NAME?video=1"
# 2) Then on the source machine, push the live encode:
ffmpeg -f x11grab -i :0.0 -c:v libx264 -preset ultrafast -f mpegts - \
  | curl --upload-file - "$KIT/api/v1/pipe/$PATH_NAME"
# Non-browser viewers (VLC/mpv/ffplay) use the same URL — they get raw bytes:
mpv "$KIT/api/v1/pipe/$PATH_NAME?video=1"
```
### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, drains the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Live-tested:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

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
### 9. Path / URL length limits — 1024-char path is the cap

**Goal:** know what blows up at the validator. Path > 1024 chars → `414 Path too long`; URL > 4096 chars → 414 from the proxy before the kit even sees it.

**Live-tested:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- 1024-char path: accepted by the path validator (sender hangs waiting for receiver as expected).

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

**Live-tested response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Piping, X-Hoody-Pipe
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

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/health` | Service health check |  |

### `info` (1) — info

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/help` | Get help text with curl examples |  |

### `pipe` (3) — pipe

| Method | Summary | Params |
|--------|---------|--------|
| `OPTIONS /api/v1/pipe/{path}` | CORS preflight |  |
| `GET /api/v1/pipe/{path}` | Receive data from a pipe | `?n` `?download` `?filename` `?video` `?progress` |
| `POST /api/v1/pipe/{path}` | Send data to a pipe | `?n` |

**Param notes:**

- `path` — Any path — OPTIONS is handled identically for all paths
- `path` — Pipe path name to receive from — must match the path used by the sender.  Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers.
- `n` — Expected number of receivers. Must match the sender's `n` value exactly — a mismatch returns 400.  When `n > 1`, the pipe waits for all `n` receivers and the sender before streaming.
- `download` — Control whether the response triggers a browser download.  - `?download` (bare), `?download=true`, `?download=yes`, `?download=1` — force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. - `?download=false`, `?download=no`, `?download=0` — suppress `Content-Disposition` entirely, even if sender set one (forces inline display). - Absent — passthrough sender's Content-Disposition as-is. Multipart `form-data` dispositions are auto-converted to `attachment`.  Works per-receiver — with `n=2`, one receiver can have `?download` and the other can display inline.
- `filename` — Set a custom download filename. Implies `?download` — the response will have `Content-Disposition: attachment; filename="<value>"`.  **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header.  **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding.  Filenames that sanitize to empty fall back to bare `attachment`.
- `video` — Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally — no pipe receiver slot is consumed by the page itself.  **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser). Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream — ensuring automatic compatibility with media players.  **Auto-detection:** The player detects the container/codec from the stream's first bytes: - WebM (VP8/VP9/AV1 + Opus/Vorbis) - MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC) - MPEG-TS  **UI features:** - Click to unmute (autoplay requires muted) - Right-click to pause/resume - Status overlay: "Waiting for stream…", "Connected", "Stream ended" - Buffer trimming (>30s behind currentTime removed)  **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver.  **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`. Pipe path HTML-escaped in `data-path` attribute.
- `progress` — Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot — spectators are completely independent of the transfer.  **Accept header routing:** - `Accept: text/event-stream` → SSE stream (EventSource, curl) - `Accept: text/html` → HTML dashboard page (browser) - `Accept: */*` or missing → SSE stream (default to data, not markup)  **SSE event types:** - `state` — State transitions: idle → waiting → streaming → complete/failed - `progress` — During streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers - `done` — Terminal event: final stats (bytesTransferred, duration, avgSpeed)  **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed`  **DoS protections:** Max 50 spectators per path, 500 total groups, 30-min connection TTL, 30s post-transfer linger.  **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver.  **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility.
- `path` — Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`).  Examples: `myfile`, `transfer123`, `secret.png`, `logs/today`
- `n` — Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256.

### `ui` (2) — ui

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe` | Index page (web UI) |  |
| `GET /api/v1/pipe/noscript` | No-JavaScript upload page | `?path` `?mode` |

**Param notes:**

- `path` — Pre-fill the pipe path. Only URL-safe characters allowed.
- `mode` — Input mode: `file` for file picker, `text` for textarea

