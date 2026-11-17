> _**CLI skill · `notifications` namespace** · ~9,791 tokens · hoody-sdk v1.0.1_

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
- Required: `display`+`summary` on `hoody notifications send`; `display` on `hoody notifications list`; `displays` on the SSE stream (optional over WebSocket, where you can `subscribe` after connecting).

## Capability URL

Kit slug is `n` (the proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer host labels exceed the 63-character DNS label limit): `https://{P}-{C}-n-1.{N}.computers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all` in any browser and tap **Enable** under "Alerts on this device": new entries then arrive as real OS alerts on that device even with the page closed (iPhone/iPad: Add to Home Screen first). Under the default allow policy, the kit URL is sufficient. No token goes in it — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `hoody computers get`. When proxy permissions protect a kit, supply the credential required by its authentication group; the browser must supply it too (a password group makes the browser ask for it). → See `SKILL-CLI.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`hoody notifications send` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications send --display-id 2 --summary "Build done"`. `display` is a string holding a number from 1 through 40000, optionally `:`-prefixed (`"2"` or `":2"`; a JSON number is a `400`): display 0 returns `400 Validation Error` with `details: "Display 0 does not exist; display IDs start at 1."`, and a number above 40000 is a `400` too. With display-ensure enabled (the default) the kit tries to start a valid target display.

### 2. Read recent notifications

`hoody notifications list` — `display`: `":1"`, `"1"`, `"1,:2,3"`, or `"all"`. Optional `--limit N` (with `--since`, `--after-id` or `--cursor` the CLI walks the forward pages for you, returning up to N items or its 10,000-item ceiling, at most 1000 per request; without a forward start point it makes ONE request and returns only the newest `min(N, 1000)` entries, or at most 1000 when `--limit` is omitted; use `--since 0` to start from the beginning of the retained history, and if the walk reaches the ceiling continue with the returned cursor), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries, listed newest-first. With `since` the page holds the OLDEST `limit` entries at or after that timestamp, with `after_id` the OLDEST `limit` ids above it, with both, the OLDEST `limit` ids above `after_id` at or after `since`, and with `cursor` the OLDEST `limit` entries after it; these forward pages are listed oldest-first in the order they were selected: with `since` alone (and a plain-listing cursor) by (timestamp, display, id) ascending, with `after_id` by (id, timestamp, display) ascending, and a `cursor` keeps the order of the request that issued it, so consecutive pages join into one ascending list. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. When the CLI walks several pages it sets `data.count` to the number of rows it returns; `jq '.data.notifications | length'` gives the same number. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. The CLI takes it as `--cursor <next_cursor>` (omit `--since` and `--after-id` beside it); one cursor continues a listing of one display or of several; see Example 8.

### 3. Subscribe to events

`hoody notifications stream` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`, and `resync` when the subscriber fell behind; WS sends `resync` too). `displays` is required for SSE; a WS connection without it receives no notification messages until it subscribes (the Ping and `heartbeat` still arrive). Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`hoody notifications list` → int `id`s → `hoody notifications dismiss` POST `{"notificationIds":[<int>,…],"displayId":":1"}`. `hoody notifications restore` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`hoody notifications list` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `hoody notifications icons get`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL) on each device and tap **Enable** under "Alerts on this device"; the page can be closed afterwards. Agent side: `hoody notifications send` with a `display` (1 through 40000, not 0 — by default the kit tries to start the display, so you do NOT have to set up X first; a display it cannot start answers `503`), a `summary`, and optional `body`/`urgency`. The kit hands the alert to the display's `notify-send`; the entry then reaches the notification history, which the kit watches. The kit broadcasts each new row on its stream and attempts a Web Push to the enrolled devices whose display filter includes that display; a device in a failure cooldown, or past the push queue's capacity, is skipped, and a device that receives it shows an OS notification. Full copy-paste recipe in Example 11.

Works on any device, phones included: Android browsers, desktop Chrome/Edge/Firefox (while the browser app runs), Safari on macOS 13+. iPhone/iPad (iOS/iPadOS 16.4+): the human must Add to Home Screen first, open the page from the Home Screen, then tap **Enable**; a plain Safari tab cannot receive alerts. Alerts arrive with the page closed, but delivery is best effort: for an alert that must not be missed, the notification history stays the source of truth, so read it back rather than assuming the alert was seen.

Check the enrolled devices with `hoody notifications push subscriptions list`: each row has the device's push service, the page origin and its count of failed deliveries. `hoody notifications push test` (optional `subscriptionId`) sends a test alert, to one device or to all, and reports `accepted` / `failed` / `removed` / `pending`; `accepted` means the push service took it, not that the device showed it. `hoody notifications push subscriptions delete` with a subscription `id` removes that device's push registration, but the kit page enrolls the device again the next time it loads there with notification permission granted; to keep a device off, use **Turn off** under **Alerts on this device** on the page. A device enrolls from the kit page, which registers the browser's own push subscription; there is no CLI command to enroll one. CLI: `hoody notifications push subscriptions list`, `hoody notifications push test [--subscription-id <id>]`, `hoody notifications push subscriptions delete <id>`.

## Quirks & gotchas

- Kit slug is `n`; use `n-N` in kit URLs. The proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer indexed host labels exceed the 63-character DNS label limit.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `hoody notifications send` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`; `display` 1–40000 (display 0 and higher numbers are a `400`).
- `list.display` is one display number, a comma list of them (`2,3`) or `all`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `--limit N` caps the total items returned; only a forward start (`--since`, `--after-id`, `--cursor`) walks pages (CLI ceiling 10,000, at most 1000 items per request), and without one a single request returns the newest `min(N, 1000)` entries; forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `hoody notifications list`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `hoody notifications restore` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, closes at a heartbeat tick when two heartbeats have gone by with no inbound frame of any kind (a Pong, Ping, text or binary frame resets the count).
- `hoody notifications restore`=DELETE, `hoody notifications dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. The kit says when that happens: both SSE and WebSocket send `{"type":"resync","skipped":<n>,"timestamp":<ms>}` in place of the skipped entries. To catch up, page `hoody notifications list` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages. Paging forward recovers only rows that sort after your position: a row that changed in place, or a new row stamped earlier than your position (clock skew), stays behind it, so after a `resync` re-read the history from the start (`since` 0) when those must not be missed. Web Push goes out only for new rows: a changed row is broadcast on the stream again but is not pushed to devices a second time.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-computer kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `hoody inbox *` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` and not be restricted to realms (403 otherwise), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- The CLI maps the `notifications` namespace to the kit slug `n`, so `hoody --computer <C> notifications {list|dismiss|restore|send|icons get|stream}` reaches `https://{P}-{C}-n-1.{N}.computers.hoody.com/api/v1/notifications/...`.
- `hoody --computer "$C" notifications stream --display-ids all` prints SSE events as they arrive. It reads one connection and does not reconnect when it ends, so rerun it after a drop, then re-read `list` from `since=0` and reconcile, because paging forward from your last position misses changed or late-stamped rows.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias). While it is open it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a native alert the first time it receives a live entry for a display and id (a repeated delivery of the same one raises none, and the page remembers about 500 such entries); recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise an alert. A device enrolled for Web Push (the page's **Enable** button) also gets its alerts through the browser's push service, while the page is closed or its stream is down; the page and the push show their alerts independently, but both use a shared tag, so while one alert is showing the other replaces it instead of stacking; a duplicate that arrives after the first was closed can show again. A device that is not enrolled shows no alert for an entry that arrives while the stream is down. Keep the `?displays=all` suffix in the handed-out URL: the live feed shows every display either way, but a new enrollment takes the page's current target, which is every display only with that suffix (or the page's All displays mode), while a device already enrolled keeps its stored display filter until the person changes it on the page; without it the target is the display the hostname names (`n-1` is display 1). This is the supported path for delivering an agent's notifications to a human's device; under the default allow policy no token goes in the URL (the hostname is the capability).
- `hoody notifications send` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; a display that comes up with a reachable session is remembered for 60 s, a failed ensure is not remembered, so a retry tries again), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display yet, it returns `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, a `Retry-After` header and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; when no display is running and none can be started it returns `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`.

## Common errors

- Invalid input on `hoody notifications send` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch carries a fixed `code` and one fixed `details` sentence: no display running and none can be started → `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`; the display's notification session not up yet → `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, with `Retry-After` and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; a timeout ("Sending the notification timed out. Retry later.") or any other failure ("The notification service failed to send the notification.") → `500` `error: "Notification dispatch failed"`, `code: "DISPATCH_FAILED"`.
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` (with `Retry-After`, the whole seconds until the window resets) on any route that reaches the rate limiter: every request counts toward a shared per-IP limit of 60 per 60-second window by default (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`), and `send`, `hoody notifications push test` and `hoody notifications icons get` also have separate per-IP limits of their own: 10, 10 and 100 per window by default (`RATE_LIMIT_NOTIFY_MAX` sets both of the first two, each with its own counter; `RATE_LIMIT_ICONS_MAX`). Each window starts at the first request and resets only when it ends. CORS preflights are answered before the limiter.
- `GET /api/v1/notifications/health` returning 200 does not establish that authorised endpoints are reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Use the canonical kit slug `n` in URLs; the longer `notifications` and `notification` host labels exceed the 63-character DNS label limit with 24-character project and computer ids. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first, and tag your test traffic with a distinctive `category` (the examples use `ci-build`, `maintenance`, `stream-demo` and `burst-demo`) so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. Warning: Use a display from 1 through 40000: display `:0` does not exist and returns `400 Validation Error` (`details: "Display 0 does not exist; display IDs start at 1."`). A valid display whose notification session is not up yet returns `503` `DISPLAY_NOT_READY` with `Retry-After`; resend after that wait, and stop after a few tries (where the computer cannot look the session up at all and inherits no session address, the 503 never clears).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
hoody --computer "$C" notifications send \
  --display-id 2 --summary 'Build done' --body 'v1.4.2 deployed' \
  --urgency normal --category ci-build
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
hoody --computer "$C" notifications list 2 --limit 10 -o json \
  | jq '.data.notifications[] | select(.category=="ci-build")'   # CLI -o json strips only the TRANSPORT wrapper; the kit envelope survives → .data.notifications
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the computer. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```bash
for D in 2 3; do
  hoody --computer "$C" notifications send \
    --display-id "$D" --summary 'Maintenance in 5m' \
    --urgency critical --category maintenance
done
hoody --computer "$C" notifications list 2,3 --limit 20 -o json \
  | jq '.data.notifications[] | select(.category=="maintenance") | {id, display_id}'
```

### 3. Subscribe to the live stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry), `resync` (when the subscriber fell behind). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay, but both transports then send `{"type":"resync","skipped":<n>,"timestamp":<ms>}`. On a `resync`, re-read `hoody notifications list` from `since=0` (paging as in Example 8) and reconcile it with what you hold: paging forward from the last position you processed misses rows that changed in place or were stamped earlier than it. 

```bash
# Follow the stream in one shell: events print as they arrive. One connection,
# no automatic reconnect: rerun it after a drop.
hoody --computer "$C" notifications stream --display-ids all

# In another shell, fire something:
hoody --computer "$C" notifications send --display-id 2 \
  --summary 'hello-stream' --category 'stream-demo'
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. Warning: Send `notificationIds` as **integers** — non-integer elements are dropped. An empty array returns `400 "notificationIds must be a non-empty array of integers"`; a non-empty array with no valid integer returns `400 "notificationIds must contain valid integer IDs"`. Warning: Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (Example 5 shows how to undo it: `hoody notifications restore` without `displayId` clears every scope).

```bash
IDS=$(hoody --computer "$C" notifications list 2 --limit 50 -o json \
  | jq -r '.data.notifications[].id' | paste -sd, -)
if [ -n "$IDS" ]; then   # an empty list is refused
  hoody --computer "$C" notifications dismiss \
    --display-id 2 --notification-ids "$IDS"
fi
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `hoody notifications restore` is `DELETE /dismiss` (same path as POST `hoody notifications dismiss`). With `displayId: "2"` it clears every dismissal scoped to display 2, including dismissals made before Example 4; global dismissals and other displays' scoped dismissals remain. Omitting `displayId` clears every dismissal, global and on every display.

```bash
hoody --computer "$C" notifications restore --display-id 2   # display 2 scope
hoody --computer "$C" notifications restore                  # every scope
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried. `--if-none-match <etag>` on `icons get` sends a conditional request; a matching validator answers 304 with no body. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); a name with a character other than letters, digits, `_`, `.` and `-` (an encoded slash, `%2F`, say; a raw `/` makes the URL miss the icon route and normally returns `404`, unless the fallback serves a matching asset) or an unsupported extension returns `400` with `error: "Validation Error"` and `details: "Icon ID is invalid or has an unsupported extension."`, while a name that passes that check but is not a valid icon path (a name whose session part, before the last two `_` fields, contains `..`) gets `Icon not found or path invalid`, an icon that cannot be opened returns `400 "Icon not found"`, and a read failure after opening it returns `500 "Internal server error while serving icon"`. The icon handler itself never answers 404: a missing icon is a `400`.

```bash
ICON=$(hoody --computer "$C" notifications list 2 --limit 10 -o json \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
hoody --computer "$C" notifications icons get "$ICON" --out-file "/tmp/$ICON"
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches, listed oldest-first (by (timestamp, display, id) with `since` alone; by (id, timestamp, display) whenever `after_id` is sent, also together with `since`, which then stays a lower bound on the timestamp), and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, and a string may start with a colon (`":2"`), so compare it as a string with any leading colon removed; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --computer "$C" notifications list 2 \
  --limit 100 --since "$SINCE_MS" --after-id 10 -o json \
  | jq '.data | {count, has_more, next_cursor, last_id: ([.notifications[].id] | max)}'
```

### 8. Catch up page by page with a cursor

**Goal:** poll for rows that sort after your last cursor. To catch changed rows or rows stamped earlier than the cursor, periodically re-read from `since=0` and reconcile. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Cursors from a plain listing or a `since`-only page use (timestamp, display, id) order and cover `all` or `2,3`; cursors from an `after_id` page keep (id, timestamp, display) order. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

The CLI takes the cursor as `--cursor <next_cursor>`.

`hoody notifications list` walks every forward page itself (from `--since`, `--after-id` or `--cursor`; a plain listing is one request for the newest page) and, when an unfiltered walk finishes at a page boundary, keeps the last page's `data.next_cursor` in its output: save it and pass it as `--cursor` on the next poll. The cursor is `null` when the result was cut within a page or filtered. The HTTP loop below is another way to keep the cursor yourself:

```bash
KIT="https://${P}-${C}-n-1.${N}.computers.hoody.com"
# First read: the newest page. Keep its next_cursor (null only when nothing is listed).
CUR=$(curl -sf "$KIT/api/v1/notifications/all?limit=50" | jq -r '.data.next_cursor // empty')
# Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
while :; do
  if [ -n "$CUR" ]; then
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "cursor=$CUR" --data-urlencode "limit=1000")
  else
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "since=0" --data-urlencode "limit=1000")
  fi || { echo "page request failed (a 429 waits for Retry-After); resume from cursor $CUR" >&2; break; }
  echo "$PAGE" | jq -c '.data.notifications[]'   # handle the rows (oldest first)
  CUR=$(echo "$PAGE" | jq -r '.data.next_cursor // empty')
  [ "$(echo "$PAGE" | jq -r '.data.has_more')" = true ] || break
done
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads every `alex-display-<N>-notifications.json` and every `alex-<session>-notifications.json`, then returns only the rows for display `2`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --computer "$C" notifications list 2 \
  --limit 200 --since "$SINCE_MS" \
  --username alex --session sessabc -o json
```

### 10. Survive a 429 rate-limit burst on `hoody notifications send`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. Every route is per-IP rate-limited (60 requests per 60-second window by default), and `hoody notifications send` has a tighter limit of its own: by default it accepts 10 requests per client IP per 60-second window (`RATE_LIMIT_NOTIFY_MAX`, `RATE_LIMIT_WINDOW_MS`), and the window resets only when it ends, so the 11th send of a fast burst is refused until then. A `429` carries `Retry-After`, the whole seconds until the window resets: wait that long, not a short doubling backoff. Strategy: pace sends client-side (at most 10 a minute with the defaults), wait out `Retry-After` on `429`, and never retry on `400` (validation — fix the body instead). A `503` with `code: "DISPLAY_NOT_READY"` means the display's notification session is not up yet: wait for its `Retry-After` and resend a few times; where the computer cannot look the session up at all (the lookup is switched off or its helper is not installed, and no session address is inherited) it never clears, so give up after a few tries. A `503` with `code: "DISPLAY_NOT_AVAILABLE"` means the target display is not running and the computer has no display server to start it: use a computer image with display support, because retrying the same call does not help. A `500` (`code: "DISPATCH_FAILED"`) is a failed or timed-out send; its `details` says which.

```bash
# By default the CLI retries a send only when it was never dispatched, never on a 429.
# This loop does not read Retry-After, so on a 429 it waits out the default 60 s window and resends
# the SAME alert; any other error, or a 429 on the last try, stops with a nonzero exit.
for i in $(seq 1 50); do
  sent=0
  for try in 1 2 3 4 5; do
    if err=$(hoody --computer "$C" notifications send \
      --display-id 2 --summary "burst-$i" --category burst-demo 2>&1 >/dev/null); then sent=1; break; fi
    case "$err" in *'Error [429'*) [ "$try" -lt 5 ] && sleep 60 ;; *) break ;; esac
  done
  [ "$sent" = 1 ] || { echo "alert burst-$i not delivered: $err" >&2; exit 1; }
done
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to every device where they enabled alerts. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser on each device, tap **Enable** and allow notifications; the page can be closed afterwards (phone, desktop, or a phone that mirrors notifications to a smartwatch; iPhone/iPad: Add to Home Screen first and enable from there). `{P}`/`{C}`/`{N}` come from `hoody computers get`; `?displays=all` selects every display for a new enrollment (a device that already has alerts enabled for specific displays keeps that filter when it opens the URL: click **Get alerts for all displays instead** under **Alerts on this device** to change it):

```
https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and registers the device for Web Push, so alerts reach it with the page closed: the browser's push service holds an alert for an offline device for up to a day by default. Delivery is still best effort (a device in a failure cooldown, or one that was offline for longer, misses alerts), so when an alert must not be missed, the agent should also check the `hoody notifications list` history. Under the default allow policy, the kit URL is sufficient. No token goes in it. When proxy permissions protect a kit, supply the credential required by its authentication group: the browser must supply it too (a password group makes the browser ask for it).

**Agent side** — fire the alert. Use a display from 1 through 40000 (display 0 is a `400`). With display-ensure enabled, the default, the kit tries to start the target display, so you don't need to set up X first; if it cannot start it or its notification session is unavailable, the send returns a `503`.

```bash
hoody --computer "$C" notifications send \
  --display-id 1 --summary 'Build finished' \
  --body 'v1.4.2 is deployed — review when you can' --urgency normal
```

## Reference

### `hoody notifications` (13) — Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids 10` |
| `hoody notifications health` |  | read | Service health check | `notifications.kit.getHealth` | `hoody notifications health` |
| `hoody notifications icons get` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icons get 6_10_1749024932903.png --if-none-match 'W/"1a2b-5f3c"'` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.list` | `hoody notifications list 1 --limit 100 --since 1672531200000` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.kit.getMetrics` | `hoody notifications metrics` |
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open` |
| `hoody notifications push publickey get` |  | read | Show the push public key (VAPID) a page subscribes with | `notifications.push.getPublicKey` | `hoody notifications push publickey get` |
| `hoody notifications push subscriptions delete` |  | destructive | Stop push alerts to one subscribed device | `notifications.push.subscriptions.delete` | `hoody notifications push subscriptions delete q3F0b2tVc2VyQWdlbnQxMg -y` |
| `hoody notifications push subscriptions list` |  | read | List the devices subscribed to push alerts | `notifications.push.subscriptions.list` | `hoody notifications push subscriptions list --watch 2s` |
| `hoody notifications push test` |  | action | Send a test push alert to one subscribed device, or to all | `notifications.push.test` | `hoody notifications push test --subscription-id q3F0b2tVc2VyQWdlbnQxMg` |
| `hoody notifications restore` |  | destructive | Clear dismissed notifications | `notifications.restore` | `hoody notifications restore --display-id 1` |
| `hoody notifications send` |  | write | Trigger a new desktop notification | `notifications.send` | `hoody notifications send --body 'This is a test message from the API.' --category test-api --display-id 1 --summary 'Test Notification'` |
| `hoody notifications stream` |  | read | Follow new notifications as they arrive (Server-Sent Events) | `notifications.connect` | `hoody notifications stream --display-ids all` |

