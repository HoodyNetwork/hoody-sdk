> _**HTTP skill · `notifications` namespace** · ~10,870 tokens · hoody-sdk v1.0.1_

# `notifications` — Trigger and consume desktop notifications inside a computer

## Purpose

Two jobs in one namespace. First and most useful: **remotely inform the human operator** — an agent fires a notification from inside a computer and it pops on the user's phone, desktop, or smartwatch even when they're away from the session. Second: drive and read the computer's own desktop (`notify-send`) toasts on an X display. The user opens the kit's web page once on each device (see § Capability URL) and taps **Enable**; from then on new notifications arrive as real OS alerts on that device, even with the page closed. Delivery to devices is best-effort (bursts, connection gaps and browser limits can drop an alert), while recorded entries can also be read back over the HTTP API, subject to the configured retention (TTL), dismissals, and the history files still being there.

## When to use

- **Tell the human something happened while they're away** — "build finished", "needs your input", "deploy failed" — and have it reach their phone/desktop/smartwatch on any device where they enabled alerts on the kit page. This is the supported way for an agent to reach its operator out-of-band.
- Surface progress or alerts from a long-running agent task as desktop toasts on a computer display (`:1`, `:2`, …).
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
- Required: `display`+`summary` on `POST /api/v1/notifications/notify`; `display` on `GET /api/v1/notifications/{display}`; `displays` on the SSE stream (optional over WebSocket, where you can `subscribe` after connecting).

## Capability URL

Kit slug is `n` (the proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer host labels exceed the 63-character DNS label limit): `https://{P}-{C}-n-1.{N}.computers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all` in any browser and tap **Enable** under "Alerts on this device": new entries then arrive as real OS alerts on that device even with the page closed (iPhone/iPad: Add to Home Screen first). Under the default allow policy, the kit URL is sufficient. No token goes in it — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `GET /api/v1/computers/{id}`. When proxy permissions protect a kit, supply the credential required by its authentication group; the browser must supply it too (a password group makes the browser ask for it). → See `SKILL-HTTP.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`POST /api/v1/notifications/notify` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. HTTP: `POST /api/v1/notifications/notify`. `display` is a string holding a number from 1 through 40000, optionally `:`-prefixed (`"2"` or `":2"`; a JSON number is a `400`): display 0 returns `400 Validation Error` with `details: "Display 0 does not exist; display IDs start at 1."`, and a number above 40000 is a `400` too. With display-ensure enabled (the default) the kit tries to start a valid target display.

### 2. Read recent notifications

`GET /api/v1/notifications/{display}` — `display`: `":1"`, `"1"`, `"1,:2,3"`, or `"all"`. Optional `limit` (per-request page size, 1–1000, default 100), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries, listed newest-first. With `since` the page holds the OLDEST `limit` entries at or after that timestamp, with `after_id` the OLDEST `limit` ids above it, with both, the OLDEST `limit` ids above `after_id` at or after `since`, and with `cursor` the OLDEST `limit` entries after it; these forward pages are listed oldest-first in the order they were selected: with `since` alone (and a plain-listing cursor) by (timestamp, display, id) ascending, with `after_id` by (id, timestamp, display) ascending, and a `cursor` keeps the order of the request that issued it, so consecutive pages join into one ascending list. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. See Example 8 for the forward-paging loop.

### 3. Subscribe to events

`GET /api/v1/notifications/stream` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`, and `resync` when the subscriber fell behind; WS sends `resync` too). `displays` is required for SSE; a WS connection without it receives no notification messages until it subscribes (the Ping and `heartbeat` still arrive). Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`GET /api/v1/notifications/{display}` → int `id`s → `POST /api/v1/notifications/dismiss` POST `{"notificationIds":[<int>,…],"displayId":":1"}`. `DELETE /api/v1/notifications/dismiss` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike. HTTP: `POST /api/v1/notifications/dismiss`.

### 5. Fetch an icon

`GET /api/v1/notifications/{display}` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `GET /api/v1/notifications/icons/{iconId}`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL) on each device and tap **Enable** under "Alerts on this device"; the page can be closed afterwards. Agent side: `POST /api/v1/notifications/notify` with a `display` (1 through 40000, not 0 — by default the kit tries to start the display, so you do NOT have to set up X first; a display it cannot start answers `503`), a `summary`, and optional `body`/`urgency`. The kit hands the alert to the display's `notify-send`; the entry then reaches the notification history, which the kit watches. The kit broadcasts each new row on its stream and attempts a Web Push to the enrolled devices whose display filter includes that display; a device in a failure cooldown, or past the push queue's capacity, is skipped, and a device that receives it shows an OS notification. Full copy-paste recipe in Example 11.

Works on any device, phones included: Android browsers, desktop Chrome/Edge/Firefox (while the browser app runs), Safari on macOS 13+. iPhone/iPad (iOS/iPadOS 16.4+): the human must Add to Home Screen first, open the page from the Home Screen, then tap **Enable**; a plain Safari tab cannot receive alerts. Alerts arrive with the page closed, but delivery is best effort: for an alert that must not be missed, the notification history stays the source of truth, so read it back rather than assuming the alert was seen.

Check the enrolled devices with `GET /api/v1/notifications/push/subscriptions`: each row has the device's push service, the page origin and its count of failed deliveries. `POST /api/v1/notifications/push/test` (optional `subscriptionId`) sends a test alert, to one device or to all, and reports `accepted` / `failed` / `removed` / `pending`; `accepted` means the push service took it, not that the device showed it. `DELETE /api/v1/notifications/push/subscriptions/{id}` with a subscription `id` removes that device's push registration, but the kit page enrolls the device again the next time it loads there with notification permission granted; to keep a device off, use **Turn off** under **Alerts on this device** on the page. A device enrolls from the kit page, which registers the browser's own push subscription; a caller can only relay a subscription a browser made (`POST /api/v1/notifications/push/subscriptions`, with that page's `Origin`). HTTP: `GET /api/v1/notifications/push/subscriptions`, `POST /api/v1/notifications/push/test`, `DELETE /api/v1/notifications/push/subscriptions/{id}`.

## Quirks & gotchas

- Kit slug is `n`; use `n-N` in kit URLs. The proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer indexed host labels exceed the 63-character DNS label limit.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `POST /api/v1/notifications/notify` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`; `display` 1–40000 (display 0 and higher numbers are a `400`).
- `list.display` is one display number, a comma list of them (`2,3`) or `all`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `list.limit` `[1,1000]` def 100 per request; forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `GET /api/v1/notifications/{display}`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `DELETE /api/v1/notifications/dismiss` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, closes at a heartbeat tick when two heartbeats have gone by with no inbound frame of any kind (a Pong, Ping, text or binary frame resets the count).
- `DELETE /api/v1/notifications/dismiss`=DELETE, `POST /api/v1/notifications/dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. The kit says when that happens: both SSE and WebSocket send `{"type":"resync","skipped":<n>,"timestamp":<ms>}` in place of the skipped entries. To catch up, page `GET /api/v1/notifications/{display}` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages. Paging forward recovers only rows that sort after your position: a row that changed in place, or a new row stamped earlier than your position (clock skew), stays behind it, so after a `resync` re-read the history from the start (`since` 0) when those must not be missed. Web Push goes out only for new rows: a changed row is broadcast on the stream again but is not pushed to devices a second time.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-computer kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `* /api/v1/notifications/*` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` and not be restricted to realms (403 otherwise), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias). While it is open it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a native alert the first time it receives a live entry for a display and id (a repeated delivery of the same one raises none, and the page remembers about 500 such entries); recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise an alert. A device enrolled for Web Push (the page's **Enable** button) also gets its alerts through the browser's push service, while the page is closed or its stream is down; the page and the push show their alerts independently, but both use a shared tag, so while one alert is showing the other replaces it instead of stacking; a duplicate that arrives after the first was closed can show again. A device that is not enrolled shows no alert for an entry that arrives while the stream is down. Keep the `?displays=all` suffix in the handed-out URL: the live feed shows every display either way, but a new enrollment takes the page's current target, which is every display only with that suffix (or the page's All displays mode), while a device already enrolled keeps its stored display filter until the person changes it on the page; without it the target is the display the hostname names (`n-1` is display 1). This is the supported path for delivering an agent's notifications to a human's device; under the default allow policy no token goes in the URL (the hostname is the capability).
- `POST /api/v1/notifications/notify` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; a display that comes up with a reachable session is remembered for 60 s, a failed ensure is not remembered, so a retry tries again), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display yet, it returns `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, a `Retry-After` header and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; when no display is running and none can be started it returns `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`.

## Common errors

- Invalid input on `POST /api/v1/notifications/notify` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch carries a fixed `code` and one fixed `details` sentence: no display running and none can be started → `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`; the display's notification session not up yet → `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, with `Retry-After` and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; a timeout ("Sending the notification timed out. Retry later.") or any other failure ("The notification service failed to send the notification.") → `500` `error: "Notification dispatch failed"`, `code: "DISPATCH_FAILED"`.
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` (with `Retry-After`, the whole seconds until the window resets) on any route that reaches the rate limiter: every request counts toward a shared per-IP limit of 60 per 60-second window by default (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`), and `send`, `POST /api/v1/notifications/push/test` and `GET /api/v1/notifications/icons/{iconId}` also have separate per-IP limits of their own: 10, 10 and 100 per window by default (`RATE_LIMIT_NOTIFY_MAX` sets both of the first two, each with its own counter; `RATE_LIMIT_ICONS_MAX`). Each window starts at the first request and resets only when it ends. CORS preflights are answered before the limiter.
- `GET /api/v1/notifications/health` returning 200 does not establish that authorised endpoints are reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Use the canonical kit slug `n` in URLs; the longer `notifications` and `notification` host labels exceed the 63-character DNS label limit with 24-character project and computer ids. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first, and tag your test traffic with a distinctive `category` (the examples use `ci-build`, `maintenance`, `stream-demo` and `burst-demo`) so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. Warning: Use a display from 1 through 40000: display `:0` does not exist and returns `400 Validation Error` (`details: "Display 0 does not exist; display IDs start at 1."`). A valid display whose notification session is not up yet returns `503` `DISPLAY_NOT_READY` with `Retry-After`; resend after that wait, and stop after a few tries (where the computer cannot look the session up at all and inherits no session address, the 503 never clears).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{
    "display": "2",
    "summary": "Build done",
    "body": "v1.4.2 deployed",
    "urgency": "normal",
    "category": "ci-build"
  }'
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
ENTRY=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq '.data.notifications[] | select(.category=="ci-build") | {id, display_id}' | head -n 4)
echo "$ENTRY"
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the computer. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
for D in 2 3; do
  curl -sX POST "$KIT/api/v1/notifications/notify" \
    -H 'Content-Type: application/json' \
    -d "{\"display\":\"$D\",\"summary\":\"Maintenance in 5m\",\"urgency\":\"critical\",\"category\":\"maintenance\"}"
done
curl -sf "$KIT/api/v1/notifications/2,3?limit=20" \
  | jq '.data.notifications[] | select(.category=="maintenance") | {id, display_id}'
```

### 3. Subscribe to the live stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry), `resync` (when the subscriber fell behind). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay, but both transports then send `{"type":"resync","skipped":<n>,"timestamp":<ms>}`. On a `resync`, re-read `GET /api/v1/notifications/{display}` from `since=0` (paging as in Example 8) and reconcile it with what you hold: paging forward from the last position you processed misses rows that changed in place or were stamped earlier than it. 

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
# Open the stream in one shell — first frame is `data: {"type":"connected","displays":"all"}`,
# then a heartbeat every 15s, then live `notification` frames as they happen.
curl -sN "$KIT/api/v1/notifications/stream?displays=all"

# In another shell, fire something:
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{"display":"2","summary":"hello-stream","category":"stream-demo"}'
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. Warning: Send `notificationIds` as **integers** — non-integer elements are dropped. An empty array returns `400 "notificationIds must be a non-empty array of integers"`; a non-empty array with no valid integer returns `400 "notificationIds must contain valid integer IDs"`. Warning: Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (Example 5 shows how to undo it: `DELETE /api/v1/notifications/dismiss` without `displayId` clears every scope).

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
IDS=$(curl -sf "$KIT/api/v1/notifications/2?limit=50" \
  | jq -c '[.data.notifications[].id]')   # e.g. [2,3,4]
# notificationIds must hold at least one id, so skip an empty listing
if [ "$(printf '%s' "$IDS" | jq 'length')" -gt 0 ]; then
  curl -sX POST "$KIT/api/v1/notifications/dismiss" \
    -H 'Content-Type: application/json' \
    -d "{\"notificationIds\":$IDS,\"displayId\":\"2\"}"   # → {"success":true,"message":"3 notification(s) dismissed"}
fi
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `DELETE /api/v1/notifications/dismiss` is `DELETE /dismiss` (same path as `POST /api/v1/notifications/dismiss`). With `displayId: "2"` it clears every dismissal scoped to display 2, including dismissals made before Example 4; global dismissals and other displays' scoped dismissals remain. Omitting `displayId` clears every dismissal, global and on every display.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
# Scoped restore — only display 2:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss?displayId=2"

# Everything, global and every display:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss"
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); a name with a character other than letters, digits, `_`, `.` and `-` (an encoded slash, `%2F`, say; a raw `/` makes the URL miss the icon route and normally returns `404`, unless the fallback serves a matching asset) or an unsupported extension returns `400` with `error: "Validation Error"` and `details: "Icon ID is invalid or has an unsupported extension."`, while a name that passes that check but is not a valid icon path (a name whose session part, before the last two `_` fields, contains `..`) gets `Icon not found or path invalid`, an icon that cannot be opened returns `400 "Icon not found"`, and a read failure after opening it returns `500 "Internal server error while serving icon"`. The icon handler itself never answers 404: a missing icon is a `400`.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
ICON=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
# First fetch — download the icon and keep the response headers:
curl -s -D headers.txt -o "$ICON" "$KIT/api/v1/notifications/icons/$ICON"
ETAG=$(awk '/^[Ee][Tt][Aa][Gg]:/{print $2}' headers.txt | tr -d '\r')
# Revalidate — server returns 304 if unchanged (-I sends HEAD, so nothing is downloaded):
curl -sI -H "If-None-Match: $ETAG" "$KIT/api/v1/notifications/icons/$ICON"
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches, listed oldest-first (by (timestamp, display, id) with `since` alone; by (id, timestamp, display) whenever `after_id` is sent, also together with `since`, which then stays a lower bound on the timestamp), and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, and a string may start with a colon (`":2"`), so compare it as a string with any leading colon removed; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
SINCE=$(( $(date +%s%3N) - 60000 ))   # last 60s
curl -sf "$KIT/api/v1/notifications/2?limit=100&since=$SINCE&after_id=10" \
  | jq '.data | {count, has_more, next_cursor, last_id: ([.notifications[].id] | max)}'
```

### 8. Catch up page by page with a cursor

**Goal:** poll for rows that sort after your last cursor. To catch changed rows or rows stamped earlier than the cursor, periodically re-read from `since=0` and reconcile. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Cursors from a plain listing or a `since`-only page use (timestamp, display, id) order and cover `all` or `2,3`; cursors from an `after_id` page keep (id, timestamp, display) order. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
# First read: the newest page. Keep its next_cursor (null only when nothing is listed).
CUR=$(curl -sf "$KIT/api/v1/notifications/all?limit=50" | jq -r '.data.next_cursor // empty')
# Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
while :; do
  Q=${CUR:+cursor=$CUR}
  PAGE=$(curl -sf "$KIT/api/v1/notifications/all?limit=1000&${Q:-since=0}") \
    || { echo "page request failed (a 429 waits for Retry-After); resume from cursor $CUR" >&2; break; }
  echo "$PAGE" | jq -c '.data.notifications[]'   # handle the rows (oldest first)
  CUR=$(echo "$PAGE" | jq -r '.data.next_cursor // empty')
  [ "$(echo "$PAGE" | jq -r '.data.has_more')" = true ] || break
done
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads every `alex-display-<N>-notifications.json` and every `alex-<session>-notifications.json`, then returns only the rows for display `2`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
SINCE=$(( $(date +%s%3N) - 86400000 ))   # last 24h
curl -sf "$KIT/api/v1/notifications/2?limit=200&since=$SINCE&username=alex&session=sessabc" \
  | jq '.data.notifications | length'
```

### 10. Survive a 429 rate-limit burst on `POST /api/v1/notifications/notify`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. Every route is per-IP rate-limited (60 requests per 60-second window by default), and `POST /api/v1/notifications/notify` has a tighter limit of its own: by default it accepts 10 requests per client IP per 60-second window (`RATE_LIMIT_NOTIFY_MAX`, `RATE_LIMIT_WINDOW_MS`), and the window resets only when it ends, so the 11th send of a fast burst is refused until then. A `429` carries `Retry-After`, the whole seconds until the window resets: wait that long, not a short doubling backoff. Strategy: pace sends client-side (at most 10 a minute with the defaults), wait out `Retry-After` on `429`, and never retry on `400` (validation — fix the body instead). A `503` with `code: "DISPLAY_NOT_READY"` means the display's notification session is not up yet: wait for its `Retry-After` and resend a few times; where the computer cannot look the session up at all (the lookup is switched off or its helper is not installed, and no session address is inherited) it never clears, so give up after a few tries. A `503` with `code: "DISPLAY_NOT_AVAILABLE"` means the target display is not running and the computer has no display server to start it: use a computer image with display support, because retrying the same call does not help. A `500` (`code: "DISPATCH_FAILED"`) is a failed or timed-out send; its `details` says which.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
trigger() {
  local body="$1"
  for try in 1 2 3 4 5; do
    code=$(curl -sX POST "$KIT/api/v1/notifications/notify" \
      -H 'Content-Type: application/json' -d "$body" -D /tmp/hdr -o /tmp/out -w '%{http_code}')
    case "$code" in
      200) return 0 ;;
      429) # wait until the rate window resets (Retry-After, whole seconds)
        ra=$(awk 'tolower($1)=="retry-after:"{print $2+0}' /tmp/hdr | tail -n1); sleep "${ra:-60}" ;;
      503) # DISPLAY_NOT_READY: wait Retry-After, then resend; DISPLAY_NOT_AVAILABLE: stop
        if [ "$(jq -r .code /tmp/out)" = DISPLAY_NOT_READY ]; then
          ra=$(awk 'tolower($1)=="retry-after:"{print $2+0}' /tmp/hdr | tail -n1); sleep "${ra:-5}"
        else cat /tmp/out; return 1; fi ;;
      *) cat /tmp/out; return 1 ;;   # 400 validation, 500 DISPATCH_FAILED
    esac
  done
  return 1
}
trigger '{"display":"2","summary":"queued","category":"burst-demo"}'
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to every device where they enabled alerts. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser on each device, tap **Enable** and allow notifications; the page can be closed afterwards (phone, desktop, or a phone that mirrors notifications to a smartwatch; iPhone/iPad: Add to Home Screen first and enable from there). `{P}`/`{C}`/`{N}` come from `GET /api/v1/computers/{id}`; `?displays=all` selects every display for a new enrollment (a device that already has alerts enabled for specific displays keeps that filter when it opens the URL: click **Get alerts for all displays instead** under **Alerts on this device** to change it):

```
https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and registers the device for Web Push, so alerts reach it with the page closed: the browser's push service holds an alert for an offline device for up to a day by default. Delivery is still best effort (a device in a failure cooldown, or one that was offline for longer, misses alerts), so when an alert must not be missed, the agent should also check the `GET /api/v1/notifications/{display}` history. Under the default allow policy, the kit URL is sufficient. No token goes in it. When proxy permissions protect a kit, supply the credential required by its authentication group: the browser must supply it too (a password group makes the browser ask for it).

**Agent side** — fire the alert. Use a display from 1 through 40000 (display 0 is a `400`). With display-ensure enabled, the default, the kit tries to start the target display, so you don't need to set up X first; if it cannot start it or its notification session is unavailable, the send returns a `503`.

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
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

- `displays` — Comma-separated display IDs (`1,:2,3`), or `all` / `*` for every display. Required for SSE (400 without it). Optional for WebSocket: without it no notification is delivered until the client sends a `subscribe` message (Ping and `heartbeat` still arrive); an invalid ID arrives as an `error` frame after the upgrade.
- `limit` — Maximum number of notifications to return
- `since` — Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`, oldest first. Use it to start from a known time (`0` for the whole history); continue with `cursor` = `data.next_cursor`.
- `after_id` — Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen and listed by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`.
- `cursor` — Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it, oldest first. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`.
- `username` — Read only this user's history files (letters and digits only). See the operation description.
- `session` — Read only this session's history files (letters and digits only). See the operation description.
- `displayId` — Clear only this display's dismissals (`1` or `:1`, 0-99999; surrounding whitespace and extra leading colons are ignored). Omit to clear everything. An invalid value is rejected with 400.

**Body shapes:**

- `POST /api/v1/notifications/dismiss` body — `{ displayId: string|null | int, notificationIds*: int[] }`
  - `displayId` — Display to scope the dismissal to: `"1"`, `":1"` or `1` (0-99999; surrounding whitespace and extra leading colons are ignored). Omit or send `null` to dismiss globally. Any other value or type is rejected with 400; it never widens the dismissal to every display.
  - `notificationIds` — … Must be a non-empty array of at most 1000 entries with at least one integer; non-integer entries are ignored. A scope (global or one display) holds at most 10000 dismissed IDs: a request that would add IDs past that is rejected with 400 and changes nothing; clear the scope with `DELETE /dismiss` first.

### `push` (2) — Alerts on phones and browsers with the page closed (Web Push)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/push/vapid-public-key` | Get the push public key |  |
| `POST /api/v1/notifications/push/test` | Send a test push | `body` |

**Body shapes:**

- `POST /api/v1/notifications/push/test` body — `{ subscriptionId: string|null }`
  - `subscriptionId` — Send only to this subscription; omit it or send null to send to all.

### `push.subscriptions` (3) — Devices subscribed to push alerts

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notifications/push/subscriptions` | Register a push subscription | `H:Origin*` `body*` |
| `DELETE /api/v1/notifications/push/subscriptions/{id}` | Delete a push subscription |  |
| `GET /api/v1/notifications/push/subscriptions` | List push subscriptions |  |

**Param notes:**

- `Origin` — Set by the browser. Must be an https origin; `null` is refused.

**Body shapes:**

- `POST /api/v1/notifications/push/subscriptions` body — `{ endpoint*: string, keys*: { p256dh*: string, auth*: string }, userAgent: string, displays: string | (string | int)[], replacesEndpoint: string|null }`
  - `endpoint` — Push service URL from the browser (https, a known push service host). At most 2048 bytes (UTF-8).
  - `userAgent` — Label for the list (control characters removed, cut to 200 characters). Defaults to the User-Agent header.
  - `displays` — Displays whose notifications reach this device: `"all"` (default; also `"*"`), a comma-separated string (`"1,2"`) or an array of display numbers (`[1, ":2"]`), 1 to 5 digits each. Either form selects at most 100 distinct displays after duplicates are removed.
  - `replacesEndpoint` — Previous endpoint URL of the same browser, at most 2048 bytes (UTF-8).


### Body schemas

- `notifications_NotifyRequest` — `{ body: string, category: string, display*: string, expire_time: int, icon: string, summary*: string, urgency: "low" | "normal" | "critical"="normal" }`
  - `body` — Notification body, up to 1000 characters by default; longer is rejected with 400, never truncated. No NUL byte. Tabs, newlines and carriage returns are kept; other ASCII control characters are removed, and a non-empty body that becomes empty that way is rejected.
  - `category` — Notification category, at most 50 characters. Rejected when it contains a NUL byte or is empty once control characters are removed.
  - `display` — Target display, `"1"` or `":1"`, from 1 to 40000. Display 0 in any spelling (`0`, `:0`, `00`) and numbers above 40000 are rejected with 400. At most 5 digits; leading zeros are allowed (`"0001"` is display 1).
  - `icon` — Icon name or path, at most 1024 characters. No NUL byte. ASCII control characters other than tab, newline and carriage return are removed; a non-empty value that becomes empty that way is rejected with 400.
  - `summary` — Notification title, 1 to 200 characters by default; longer is rejected, never truncated. Must contain something other than control characters and no NUL byte.
