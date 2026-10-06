> _**HTTP skill · `notifications` namespace** · ~7,489 tokens · hoody-sdk v1.0.0-beta.15_

# `notifications` — Trigger and consume desktop notifications inside a container

## Purpose

Two jobs in one namespace. First and most useful: **remotely inform the human operator** — an agent fires a notification from inside a container and it pops on the user's phone, desktop, or smartwatch even when they're away from the session. Second: drive and read the container's own desktop (`notify-send`) toasts on an X display. The user opens the kit's web page once (see § Capability URL), grants browser-notification permission, and leaves it backgrounded; from then on the page shows the notifications it receives over its live connection as real OS notifications. Delivery to the page is best-effort (bursts, connection gaps and browser limits can drop an alert), while recorded entries can also be read back over the HTTP API, subject to the configured retention (TTL), dismissals, and the history files still being there.

## When to use

- **Tell the human something happened while they're away** — "build finished", "needs your input", "deploy failed" — and have it reach their phone/desktop/smartwatch via the backgrounded web page. This is the supported way for an agent to reach its operator out-of-band.
- Surface progress or alerts from a long-running agent task as desktop toasts on a container display (`:1`, `:2`, …).
- Pull the notification log after a task; subscribe (WS/SSE) to react to new entries in real time.
- Dismiss handled entries (or restore them); fetch a notification's icon.

## When NOT to use

- Status you'll read yourself in the same session → just read the command output (→ see `terminal` / `exec`); a notification is for reaching a human who isn't watching.
- Account-level inbox, email, SMS, or verification mail → see `api` (the control-plane account inbox, unrelated to this kit).
- Cross-process or agent-to-agent message passing with no human and no display → see `pipe`.
- Reacting to file changes rather than pushing a message to someone → see `watch`.
- Managing the X display or windows themselves → see `display`.

## Prerequisites

- A valid target display number. With display-ensure enabled (the default) the kit brings the display up itself before sending; dispatch still needs a usable D-Bus session on it.
- Required: `display`+`summary` on `POST /api/v1/notifications/notify`; `display` on `GET /api/v1/notifications/{display}`; `displays` on `GET /api/v1/notifications/stream`.

## Capability URL

Kit slug is `n` (not `notifications`): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns each entry it receives over its SSE stream into a real OS notification (works backgrounded; the stream reconnects on its own; there is no polling fallback, so an alert that arrives during a gap is not shown). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `GET /api/v1/containers/{id}`. → See `SKILL-HTTP.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`POST /api/v1/notifications/notify` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. HTTP: `POST /api/v1/notifications/notify`. Pick a display that has (or can be given) a D-Bus session; `:0` often has none, see Example 1.

### 2. Read recent notifications

`GET /api/v1/notifications/{display}` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `limit` (1–1000, default 100), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries. With `since` the page holds the OLDEST `limit` entries at or after that timestamp; with `after_id` the OLDEST `limit` ids above it. Every page is sorted newest-first either way. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. See Example 8 for the forward-paging loop.

### 3. Subscribe to events

`GET /api/v1/notifications/stream` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`). Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`GET /api/v1/notifications/{display}` → int `id`s → `POST /api/v1/notifications/dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `DELETE /api/v1/notifications/dismiss` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike. HTTP: `POST /api/v1/notifications/dismiss`.

### 5. Fetch an icon

`GET /api/v1/notifications/{display}` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `GET /api/v1/notifications/icons/{iconId}`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `POST /api/v1/notifications/notify` with a `display` (any real display number — the kit auto-ensures it, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`, not `notifications`.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `POST /api/v1/notifications/notify` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`.
- `list.display` numeric or `"all"`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `list.limit` `[1,1000]` def 100; forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `GET /api/v1/notifications/{display}`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `DELETE /api/v1/notifications/dismiss` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, drops after 2 missed pongs.
- `DELETE /api/v1/notifications/dismiss`=DELETE, `POST /api/v1/notifications/dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. To catch up, page `GET /api/v1/notifications/{display}` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `* /api/v1/notifications/*` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` (403 without it), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a browser `Notification` per entry it receives. It has no polling fallback: recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise a native alert, so an alert that arrives while the stream is down is not shown. The `?displays=all` suffix in the handed-out URL is harmless; the page always subscribes to all displays. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `POST /api/v1/notifications/notify` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; results are cached 60 s), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display it still returns `500` `error: "Notification dispatch failed"` with `details: "The display's notification session is not available yet. Start the display and retry."`

## Common errors

- Invalid input on `POST /api/v1/notifications/notify` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch → `500` `error: "Notification dispatch failed"` with one fixed `details` sentence: session unavailable ("The display's notification session is not available yet. Start the display and retry."), timeout ("Sending the notification timed out. Retry later."), or any other failure ("The notification service failed to send the notification.").
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` on `send` / `GET /api/v1/notifications/icons/{iconId}`; both are enforced by the shared per-IP rate-limit middleware.
- `/health` 200 ≠ authorised endpoints reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

The kit slug is `n`, NOT `notifications` (the long form does not resolve). Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Display `:0` typically has no D-Bus session in headless containers (`500` with `details: "The display's notification session is not available yet. Start the display and retry."`); use a display that an X session is actually attached to.

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{
    "display": "2",
    "summary": "Build done",
    "body": "v1.4.2 deployed",
    "urgency": "normal",
    "category": "sdk-doc-build"
  }'
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
ENTRY=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build") | {id, display_id}' | head -n 4)
echo "$ENTRY"
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
for D in 2 3; do
  curl -sX POST "$KIT/api/v1/notifications/notify" \
    -H 'Content-Type: application/json' \
    -d "{\"display\":\"$D\",\"summary\":\"Maintenance in 5m\",\"urgency\":\"critical\",\"category\":\"sdk-doc-fanout\"}"
done
curl -sf "$KIT/api/v1/notifications/2,3?limit=20" \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```

### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay. When every entry matters, also page `GET /api/v1/notifications/{display}` forward (Example 8). 

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# Open the stream in one shell — first frame is `data: {"type":"connected","displays":"all"}`,
# then a heartbeat every 15s, then live `notification` frames as they happen.
curl -sN "$KIT/api/v1/notifications/stream?displays=all"

# In another shell, fire something:
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{"display":"2","summary":"hello-stream","category":"sdk-doc-stream"}'
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ Send `notificationIds` as **integers** — non-integer elements are dropped, and an array with no integer left returns `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (see example 5).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
IDS=$(curl -sf "$KIT/api/v1/notifications/2?limit=50" \
  | jq -c '[.data.notifications[].id]')   # e.g. [2,3,4]
curl -sX POST "$KIT/api/v1/notifications/dismiss" \
  -H 'Content-Type: application/json' \
  -d "{\"notificationIds\":$IDS,\"displayId\":\"2\"}"
# → {"success":true,"message":"3 notification(s) dismissed"}
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `DELETE /api/v1/notifications/dismiss` is `DELETE /dismiss` (same path as `POST /api/v1/notifications/dismiss`). With `displayId: "2"` it undoes Example 4 and nothing else; omitting `displayId` clears every dismissal, global and on every display.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# Scoped restore — only display 2:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss?displayId=2"

# Everything, global and every display:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss"
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400 "Icon ID is invalid or has an unsupported extension."`, and an existing-but-unreadable icon returns `500`. The route has no 404 path at all — a missing icon is a `400`.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
ICON=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
# First fetch — capture ETag:
ETAG=$(curl -sI "$KIT/api/v1/notifications/icons/$ICON" | awk '/^[Ee][Tt][Aa][Gg]:/{print $2}' | tr -d '\r')
# Revalidate — server returns 304 if unchanged:
curl -sI -H "If-None-Match: $ETAG" "$KIT/api/v1/notifications/icons/$ICON"
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches (still listed newest-first), and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, so compare it loosely; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
SINCE=$(( $(date +%s%3N) - 60000 ))   # last 60s
curl -sf "$KIT/api/v1/notifications/2?limit=100&since=$SINCE&after_id=10" \
  | jq '.data | {count, has_more, next_cursor, last_id: ([.notifications[].id] | max)}'
```

### 8. Catch up page by page without gaps

**Goal:** poll for what arrived since your last read, without re-reading or skipping anything. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Rows are ordered by (timestamp, display, id), so one cursor covers `all` or `2,3`. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# First read: the newest page. Keep its next_cursor (null only when nothing is listed).
CUR=$(curl -sf "$KIT/api/v1/notifications/all?limit=50" | jq -r '.data.next_cursor // empty')
# Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
while :; do
  Q=${CUR:+cursor=$CUR}
  PAGE=$(curl -sf "$KIT/api/v1/notifications/all?limit=1000&${Q:-since=0}")
  echo "$PAGE" | jq -c '.data.notifications[]'   # handle the rows (newest first within the page)
  CUR=$(echo "$PAGE" | jq -r '.data.next_cursor // empty')
  [ "$(echo "$PAGE" | jq -r '.data.has_more')" = true ] || break
done
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads `alex-display-2-notifications.json` and every `alex-<session>-notifications.json`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). The display selection still filters the rows, so only display `2` entries from those files come back. Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
SINCE=$(( $(date +%s%3N) - 86400000 ))   # last 24h
curl -sf "$KIT/api/v1/notifications/2?limit=200&since=$SINCE&username=alex&session=sessabc" \
  | jq '.data.notifications | length'
```

### 10. Survive a 429 rate-limit burst on `POST /api/v1/notifications/notify`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `POST /api/v1/notifications/notify` and `GET /api/v1/notifications/icons/{iconId}`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). A `500` (`error: "Notification dispatch failed"`) says why in `details`; when it reads "The display's notification session is not available yet. Start the display and retry.", bring the display up (→ `display`) before retrying instead of looping on the same call.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
trigger() {
  local body="$1" delay=1
  for try in 1 2 3 4 5; do
    code=$(curl -sX POST "$KIT/api/v1/notifications/notify" \
      -H 'Content-Type: application/json' -d "$body" -o /tmp/out -w '%{http_code}')
    case "$code" in
      200) return 0 ;;
      429) sleep "$delay"; delay=$((delay*2)) ;;
      400|500) cat /tmp/out; return 1 ;;
    esac
  done
  return 1
}
trigger '{"display":"2","summary":"queued","category":"sdk-doc-burst"}'
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `GET /api/v1/containers/{id}`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and its stream reconnects on its own. Delivery is best-effort: there is no polling fallback, so an alert fired while the connection is down is not shown. When an alert must not be missed, the agent should also check the `GET /api/v1/notifications/{display}` history. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any real display number works; the kit auto-ensures it, so you don't need to set up X first.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{"display":"1","summary":"Build finished","body":"v1.4.2 is deployed — review when you can","urgency":"normal"}'
```

## Reference

### `icons` (1) — Serve notification icons

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/icons/{iconId}` | Get notification icon | `H:If-None-Match` `H:If-Modified-Since` |

**Param notes:**

- `If-None-Match` — ETag(s) from an earlier response, or `*`. A match returns 304. Overrides If-Modified-Since.
- `If-Modified-Since` — HTTP date; returns 304 when the icon has not changed since then (whole seconds). Ignored when If-None-Match is sent.

### `kit` (2) — Server health check

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/health` | Service health check |  |
| `GET /api/v1/notifications/metrics` | Prometheus-compatible metrics endpoint |  |

### `notifications` (5) — Retrieve historical notifications

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/stream` | Real-time notification stream (WebSocket or SSE) | `?displays` |
| `POST /api/v1/notifications/dismiss` | Dismiss notifications | `body*` |
| `GET /api/v1/notifications/{display}` | Get notifications for specified display(s) | `?limit` `?since` `?after_id` `?cursor` `?username` `?session` |
| `DELETE /api/v1/notifications/dismiss` | Clear dismissed notifications | `?displayId` |
| `POST /api/v1/notifications/notify` | Trigger a new desktop notification | `body*:notifications_NotifyRequest` |

**Param notes:**

- `displays` — Comma-separated display IDs (`1,:2,3`), or `all` / `*` for every display. Required for SSE (400 without it). Optional for WebSocket: without it the socket receives nothing until the client sends a `subscribe` message; an invalid ID arrives as an `error` frame after the upgrade.
- `limit` — Maximum number of notifications to return
- `since` — Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`. Use it to start from a known time; continue with `cursor` = `data.next_cursor`.
- `after_id` — Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`.
- `cursor` — Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`.
- `username` — Read only this user's history files (letters and digits only). See the operation description.
- `session` — Read only this session's history files (letters and digits only). See the operation description.
- `displayId` — Clear only this display's dismissals (`1` or `:1`, 0-99999; surrounding whitespace and extra leading colons are ignored). Omit to clear everything. An invalid value is rejected with 400.

**Body shapes:**

- `POST /api/v1/notifications/dismiss` body — `{ displayId: string|null | int, notificationIds*: int[] }`
  - `displayId` — Display to scope the dismissal to: `"1"`, `":1"` or `1` (0-99999; surrounding whitespace and extra leading colons are ignored). Omit or send `null` to dismiss globally. Any other value or type is rejected with 400; it never widens the dismissal to every display.
  - `notificationIds` — Notification IDs to dismiss. Must be a non-empty array with at least one integer; non-integer entries are ignored.


### Body schemas

- `notifications_NotifyRequest` — `{ body: string, category: string, display*: string, expire_time: int, icon: string, summary*: string, urgency: "low" | "normal" | "critical"="normal" }`
  - `body` — Notification body. Up to NOTIFY_SEND_MAX_BODY_LENGTH characters (default 1000); longer is rejected with 400, never truncated. No NUL byte; must not be only control characters.
  - `category` — Notification category, at most 50 characters. Rejected when it contains a NUL byte or is empty once control characters are removed.
  - `display` — Target display, `"1"` or `":1"`, from 1 to 40000. Display 0 in any spelling (`0`, `:0`, `00`) and numbers above 40000 are rejected with 400. At most 5 digits; leading zeros are allowed (`"0001"` is display 1).
  - `icon` — Icon name or path, at most 1024 characters. No NUL byte.
  - `summary` — Notification title. 1 to NOTIFY_SEND_MAX_SUMMARY_LENGTH characters (default 200); longer is rejected, never truncated. Must contain something other than control characters and no NUL byte.
