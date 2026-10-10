> _**CLI skill · `notifications` namespace** · ~7,320 tokens · hoody-sdk v1.0.0-beta.17_

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
- Required: `display`+`summary` on `hoody notifications send`; `display` on `hoody notifications list`; `displays` on the SSE stream (optional over WebSocket, where you can `subscribe` after connecting).

## Capability URL

Kit slug is `n` (the proxy also accepts `notifications` and `notification` as hostname aliases): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns each entry it receives over its SSE stream into a real OS notification (works backgrounded; the stream reconnects on its own; there is no polling fallback, so an alert that arrives during a gap is not shown). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `hoody containers get`. → See `SKILL-CLI.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`hoody notifications send` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications send --display 2 --summary "Build done"`. `display` is a number from 1 through 40000, optionally `:`-prefixed: display 0 returns `400 Validation Error` with `details: "Display 0 does not exist; display IDs start at 1."`, and a number above 40000 is a `400` too. With display-ensure enabled (the default) the kit tries to start a valid target display.

### 2. Read recent notifications

`hoody notifications list` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `--limit N` (caps the total items returned, at most 10,000; each request carries up to 1000, and without `--limit` the CLI walks all pages), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries, listed newest-first. With `since` the page holds the OLDEST `limit` entries at or after that timestamp, with `after_id` the OLDEST `limit` ids above it, and with `cursor` the OLDEST `limit` entries after it; these forward pages are listed oldest-first, in the order they were selected, so consecutive pages join into one ascending list. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. The CLI takes it as `--cursor <next_cursor>` (omit `--since` and `--after-id` beside it); one cursor continues a listing of one display or of several; see Example 8.

### 3. Subscribe to events

`hoody notifications stream` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`, and `resync` when the subscriber fell behind; WS sends `resync` too). `displays` is required for SSE; a WS connection without it receives nothing until it subscribes. Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`hoody notifications list` → int `id`s → `hoody notifications dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `hoody notifications restore` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`hoody notifications list` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `hoody notifications icons get`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `hoody notifications send` with a `display` (1 through 40000, not 0 — the kit auto-ensures a valid display, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`; the proxy also accepts `notifications` and `notification` as hostname aliases, but use `n`.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `hoody notifications send` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`; `display` 1–40000 (display 0 and higher numbers are a `400`).
- `list.display` numeric or `"all"`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `--limit N` caps the total items returned (CLI ceiling 10,000; requests carry at most 1000 items); forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `hoody notifications list`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `hoody notifications restore` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, drops after 2 missed pongs.
- `hoody notifications restore`=DELETE, `hoody notifications dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. The kit says when that happens: both SSE and WebSocket send `{"type":"resync","skipped":<n>,"timestamp":<ms>}` in place of the skipped entries. To catch up, page `hoody notifications list` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `hoody inbox *` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` (403 without it), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- The CLI maps the `notifications` namespace to the kit slug `n`, so `hoody --container <C> notifications {list|dismiss|restore|send|icons get|stream}` reaches `https://{P}-{C}-n-1.{N}.containers.hoody.com/api/v1/notifications/...`.
- `hoody --container "$C" notifications stream --displays all` prints SSE events as they arrive. It reads one connection and does not reconnect when it ends, so rerun it (and page `list` forward from your last position) after a drop.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a browser `Notification` per entry it receives. It has no polling fallback: recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise a native alert, so an alert that arrives while the stream is down is not shown. The `?displays=all` suffix in the handed-out URL is harmless; the page always subscribes to all displays. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `hoody notifications send` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; results are cached 60 s), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display yet, it returns `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, a `Retry-After` header and `details: "The display's notification session is not available yet. Retry in a few seconds."`; when no display is running and none can be started it returns `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`.

## Common errors

- Invalid input on `hoody notifications send` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch carries a fixed `code` and one fixed `details` sentence: no display running and none can be started → `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`; the display's notification session not up yet → `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, with `Retry-After` and `details: "The display's notification session is not available yet. Retry in a few seconds."`; a timeout ("Sending the notification timed out. Retry later.") or any other failure ("The notification service failed to send the notification.") → `500` `error: "Notification dispatch failed"`, `code: "DISPATCH_FAILED"`.
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` on `send` / `hoody notifications icons get`; both are enforced by the shared per-IP rate-limit middleware.
- `GET /api/v1/notifications/health` returning 200 does not establish that authorised endpoints are reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Use the canonical kit slug `n` in URLs; the proxy also accepts `notifications` and `notification` as hostname aliases. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Use a display from 1 through 40000: display `:0` does not exist and returns `400 Validation Error` (`details: "Display 0 does not exist; display IDs start at 1."`). A valid display whose notification session is not up yet returns `503` `DISPLAY_NOT_READY` with `Retry-After`; resend after that wait.

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
hoody --container "$C" notifications send \
  --display 2 --summary 'Build done' --body 'v1.4.2 deployed' \
  --urgency normal --category sdk-doc-build
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build")'   # CLI -o json strips only the TRANSPORT wrapper; the kit envelope survives → .data.notifications
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```bash
for D in 2 3; do
  hoody --container "$C" notifications send \
    --display "$D" --summary 'Maintenance in 5m' \
    --urgency critical --category sdk-doc-fanout
done
hoody --container "$C" notifications list 2,3 --limit 20 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```

### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry), `resync` (when the subscriber fell behind). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay, but both transports then send `{"type":"resync","skipped":<n>,"timestamp":<ms>}`. On a `resync`, page `hoody notifications list` forward from the last position you processed (Example 8) to recover the skipped entries. 

```bash
# Follow the stream in one shell: events print as they arrive. One connection,
# no automatic reconnect: rerun it after a drop.
hoody --container "$C" notifications stream --displays all

# In another shell, fire something:
hoody --container "$C" notifications send --display 2 \
  --summary 'hello-stream' --category 'sdk-doc-stream'
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ Send `notificationIds` as **integers** — non-integer elements are dropped, and an array with no integer left returns `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (see example 5).

```bash
IDS=$(hoody --container "$C" notifications list 2 --limit 50 -o json \
  | jq -r '.data.notifications[].id' | paste -sd, -)
if [ -n "$IDS" ]; then   # an empty list is refused
  hoody --container "$C" notifications dismiss \
    --display-id 2 --notification-ids "$IDS"
fi
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `hoody notifications restore` is `DELETE /dismiss` (same path as POST `hoody notifications dismiss`). With `displayId: "2"` it clears every dismissal scoped to display 2, including dismissals made before Example 4; global dismissals and other displays' scoped dismissals remain. Omitting `displayId` clears every dismissal, global and on every display.

```bash
hoody --container "$C" notifications restore --display-id 2   # display 2 scope
hoody --container "$C" notifications restore                  # every scope
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400` with `error: "Validation Error"` and `details: "Icon ID is invalid or has an unsupported extension."`, an icon that cannot be opened returns `400 "Icon not found"`, and a read failure after opening it returns `500 "Internal server error while serving icon"`. The route has no 404 path at all — a missing icon is a `400`.

```bash
ICON=$(hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
hoody --container "$C" notifications icons get "$ICON" --out-file "/tmp/$ICON"
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches, listed oldest-first, and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, so compare it loosely; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 100 --since "$SINCE_MS" --after-id 10 -o json \
  | jq '.data | {count, has_more, last_id: ([.notifications[].id] | max)}'
```

### 8. Catch up page by page without gaps

**Goal:** poll for what arrived since your last read, without re-reading or skipping anything. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Rows are ordered by (timestamp, display, id), so one cursor covers `all` or `2,3`. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

The CLI takes the cursor as `--cursor <next_cursor>`.

`hoody notifications list` walks every page itself and, when an unfiltered walk finishes at a page boundary, keeps the last page's `data.next_cursor` in its output: save it and pass it as `--cursor` on the next poll. The cursor is `null` when the result was cut within a page or filtered. The HTTP loop below is another way to keep the cursor yourself:

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# First read: the newest page. Keep its next_cursor (null only when nothing is listed).
CUR=$(curl -sf "$KIT/api/v1/notifications/all?limit=50" | jq -r '.data.next_cursor // empty')
# Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
while :; do
  if [ -n "$CUR" ]; then
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "cursor=$CUR" --data-urlencode "limit=1000")
  else
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "since=0" --data-urlencode "limit=1000")
  fi
  echo "$PAGE" | jq -c '.data.notifications[]'   # handle the rows (oldest first)
  CUR=$(echo "$PAGE" | jq -r '.data.next_cursor // empty')
  [ "$(echo "$PAGE" | jq -r '.data.has_more')" = true ] || break
done
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads `alex-display-2-notifications.json` and every `alex-<session>-notifications.json`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). The display selection still filters the rows, so only display `2` entries from those files come back. Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 200 --since "$SINCE_MS" \
  --username alex --session sessabc -o json
```

### 10. Survive a 429 rate-limit burst on `hoody notifications send`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `hoody notifications send` and `hoody notifications icons get`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). A `503` with `code: "DISPLAY_NOT_READY"` means the display's notification session is not up yet: wait for its `Retry-After` and resend. A `503` with `code: "DISPLAY_NOT_AVAILABLE"` means the target display is not running and the container has no display server to start it: use a container image with display support, because retrying the same call does not help. A `500` (`code: "DISPATCH_FAILED"`) is a failed or timed-out send; its `details` says which.

```bash
# By default the CLI retries a send only when it was never dispatched, never on a 429.
# Resend the SAME alert with bounded backoff,
# but only on 429; any other error, or a 429 on the last try, stops with a nonzero exit.
for i in $(seq 1 50); do
  delay=1; sent=0
  for try in 1 2 3 4 5; do
    if err=$(hoody --container "$C" notifications send \
      --display 2 --summary "burst-$i" --category sdk-doc-burst 2>&1 >/dev/null); then sent=1; break; fi
    case "$err" in *'Error [429'*) [ "$try" -lt 5 ] && { sleep "$delay"; delay=$((delay*2)); } ;; *) break ;; esac
  done
  [ "$sent" = 1 ] || { echo "alert burst-$i not delivered: $err" >&2; exit 1; }
done
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `hoody containers get`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and its stream reconnects on its own. Delivery is best-effort: there is no polling fallback, so an alert fired while the connection is down is not shown. When an alert must not be missed, the agent should also check the `hoody notifications list` history. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any display from 1 through 40000 works (display 0 is a `400`); the kit auto-ensures it, so you don't need to set up X first.

```bash
hoody --container "$C" notifications send \
  --display 1 --summary 'Build finished' \
  --body 'v1.4.2 is deployed — review when you can' --urgency normal
```

## Reference

### `hoody notifications` (9) — Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids 10` |
| `hoody notifications health` |  | read | Service health check | `notifications.kit.getHealth` | `hoody notifications health` |
| `hoody notifications icons get` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icons get 6_10_1749024932903.png --if-none-match 'W/"1a2b-5f3c"'` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.list` | `hoody notifications list 1 --limit 100 --since 1672531200000` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.kit.getMetrics` | `hoody notifications metrics` |
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open` |
| `hoody notifications restore` |  | destructive | Clear dismissed notifications | `notifications.restore` | `hoody notifications restore --display-id 1` |
| `hoody notifications send` |  | write | Trigger a new desktop notification | `notifications.send` | `hoody notifications send --body 'This is a test message from the API.' --category test-api --display 1 --summary 'Test Notification'` |
| `hoody notifications stream` |  | read | Follow new notifications as they arrive (Server-Sent Events) | `notifications.connect` | `hoody notifications stream --displays all` |

