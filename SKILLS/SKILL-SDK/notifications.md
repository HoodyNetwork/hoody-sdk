> _**SDK skill · `notifications` namespace** · ~13,322 tokens · hoody-sdk v1.0.1_

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
- Required: `display`+`summary` on `notifications.send`; `display` on `notifications.list`; `displays` on the SSE stream (optional over WebSocket, where you can `subscribe` after connecting).

## Capability URL

Kit slug is `n` (the proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer host labels exceed the 63-character DNS label limit): `https://{P}-{C}-n-1.{N}.computers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all` in any browser and tap **Enable** under "Alerts on this device": new entries then arrive as real OS alerts on that device even with the page closed (iPhone/iPad: Add to Home Screen first). Under the default allow policy, the kit URL is sufficient. No token goes in it — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `computers.get` (`client.api.computers.get(computerId)`). When proxy permissions protect a kit, supply the credential required by its authentication group; the browser must supply it too (a password group makes the browser ask for it). → See `SKILL-SDK.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`notifications.send` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. `display` is a string holding a number from 1 through 40000, optionally `:`-prefixed (`"2"` or `":2"`; a JSON number is a `400`): display 0 returns `400 Validation Error` with `details: "Display 0 does not exist; display IDs start at 1."`, and a number above 40000 is a `400` too. With display-ensure enabled (the default) the kit tries to start a valid target display.

### 2. Read recent notifications

`notifications.list` — `display`: `":1"`, `"1"`, `"1,:2,3"`, or `"all"`. Optional `limit` (per-request page size, 1–1000, default 100), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries, listed newest-first. With `since` the page holds the OLDEST `limit` entries at or after that timestamp, with `after_id` the OLDEST `limit` ids above it, with both, the OLDEST `limit` ids above `after_id` at or after `since`, and with `cursor` the OLDEST `limit` entries after it; these forward pages are listed oldest-first in the order they were selected: with `since` alone (and a plain-listing cursor) by (timestamp, display, id) ascending, with `after_id` by (id, timestamp, display) ascending, and a `cursor` keeps the order of the request that issued it, so consecutive pages join into one ascending list. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. The SDK takes it as `{ cursor: next_cursor }`, where `next_cursor` is `r.data.data?.next_cursor` of the previous result `r` (the kit's JSON body, which this page calls `data`, sits under the SDK result's `.data`); omit `since` and `after_id` beside it; one cursor continues a listing of one display or of several. `listIterator` and `listAll` follow `next_cursor` for you: with no `since`, `after_id` or `cursor` they start at `since=0` and walk the whole retained history, so pass `since`, `after_id` or a `cursor` to start later; see Example 8. A listed row is identified by its timestamp, display AND id (ids repeat across displays and restart over time), so key stored rows by all three; only a dismissal takes just the display and id. The two helpers compare whole rows to detect a stuck walk; an SDK build from before that fix can throw `the same rows (by id) came back for two consecutive pages` on a valid walk over several displays, and then needs the manual `cursor` loop.

### 3. Subscribe to events

`notifications.connect` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`, and `resync` when the subscriber fell behind; WS sends `resync` too). `displays` is required for SSE; a WS connection without it receives no notification messages until it subscribes (the Ping and `heartbeat` still arrive). Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`notifications.list` → int `id`s → `notifications.dismiss` POST `{"notificationIds":[<int>,…],"displayId":":1"}`. `notifications.restore` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike.

### 5. Fetch an icon

`notifications.list` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `icons.get`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL) on each device and tap **Enable** under "Alerts on this device"; the page can be closed afterwards. Agent side: `notifications.send` with a `display` (1 through 40000, not 0 — by default the kit tries to start the display, so you do NOT have to set up X first; a display it cannot start answers `503`), a `summary`, and optional `body`/`urgency`. The kit hands the alert to the display's `notify-send`; the entry then reaches the notification history, which the kit watches. The kit broadcasts each new row on its stream and attempts a Web Push to the enrolled devices whose display filter includes that display; a device in a failure cooldown, or past the push queue's capacity, is skipped, and a device that receives it shows an OS notification. Full copy-paste recipe in Example 11.

Works on any device, phones included: Android browsers, desktop Chrome/Edge/Firefox (while the browser app runs), Safari on macOS 13+. iPhone/iPad (iOS/iPadOS 16.4+): the human must Add to Home Screen first, open the page from the Home Screen, then tap **Enable**; a plain Safari tab cannot receive alerts. Alerts arrive with the page closed, but delivery is best effort: for an alert that must not be missed, the notification history stays the source of truth, so read it back rather than assuming the alert was seen.

Check the enrolled devices with `push.subscriptions.list`: each row has the device's push service, the page origin and its count of failed deliveries. `push.test` (optional `subscriptionId`) sends a test alert, to one device or to all, and reports `accepted` / `failed` / `removed` / `pending`; `accepted` means the push service took it, not that the device showed it. `push.subscriptions.delete` with a subscription `id` removes that device's push registration, but the kit page enrolls the device again the next time it loads there with notification permission granted; to keep a device off, use **Turn off** under **Alerts on this device** on the page. A device enrolls from the kit page, which registers the browser's own push subscription; an SDK caller can only relay a subscription a browser made (`push.subscriptions.create`).

## Quirks & gotchas

- Kit slug is `n`; use `n-N` in kit URLs. The proxy parser also recognizes `notifications` and `notification`, but with 24-character project and computer ids those longer indexed host labels exceed the 63-character DNS label limit.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `notifications.send` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`; `display` 1–40000 (display 0 and higher numbers are a `400`).
- `list.display` is one display number, a comma list of them (`2,3`) or `all`, always passed as a string (`'2'`, not `2`); `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `list.limit` `[1,1000]` def 100 per request; forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `notifications.list`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `notifications.restore` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, closes at a heartbeat tick when two heartbeats have gone by with no inbound frame of any kind (a Pong, Ping, text or binary frame resets the count).
- `notifications.restore`=DELETE, `notifications.dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. The kit says when that happens: both SSE and WebSocket send `{"type":"resync","skipped":<n>,"timestamp":<ms>}` in place of the skipped entries (the SDK wrapper's `onResync(cb)`). To catch up, page `notifications.list` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages. Paging forward recovers only rows that sort after your position: a row that changed in place, or a new row stamped earlier than your position (clock skew), stays behind it, so after a `resync` re-read the history from the start (`since` 0) when those must not be missed. Web Push goes out only for new rows: a changed row is broadcast on the stream again but is not pushed to devices a second time.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-computer kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `client.api.inbox.*` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` and not be restricted to realms (403 otherwise), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- For live feeds use `connect` (see the next bullet).
- `connect` returns a `Promise<NotificationsConnectWebSocket>` wrapper, NOT `void`, and nothing is connected when it resolves. Wire callbacks first (`wrapper.onNotification(cb)` / `onDisconnect(cb)` / `onError(cb)`), then `await wrapper.connect()`. The wrapper also has `onHeartbeat(cb)`: it fires on the kit's JSON `heartbeat` message, which the kit sends over WebSocket too, next to a protocol Ping, once per heartbeat interval (30 s by default, not SSE's 15 s). Close with `wrapper.close()`. There is NO `onMessage`/`onClose` — those names are wrong. `displays` is optional here (only the SSE route requires it): `connect({ displays: 'all' })` subscribes on connect, while `connect()` without it opens a socket that receives no notification messages (heartbeats still arrive) until you call `wrapper.subscribe(['2'])` after `await wrapper.connect()` (`unsubscribe([...])` removes the displays you listed; it does not narrow a subscription to `all`, which only `unsubscribe(['all'])` or `unsubscribe(['*'])` clears). Register `onResync(cb)` too: it fires with `{type:"resync",skipped,timestamp}` when the socket fell behind and skipped entries, which you then read back with `notifications.list` from `since=0`, reconciling against what you hold, because paging forward from your last position misses changed or late-stamped rows.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias). While it is open it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a native alert the first time it receives a live entry for a display and id (a repeated delivery of the same one raises none, and the page remembers about 500 such entries); recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise an alert. A device enrolled for Web Push (the page's **Enable** button) also gets its alerts through the browser's push service, while the page is closed or its stream is down; the page and the push show their alerts independently, but both use a shared tag, so while one alert is showing the other replaces it instead of stacking; a duplicate that arrives after the first was closed can show again. A device that is not enrolled shows no alert for an entry that arrives while the stream is down. Keep the `?displays=all` suffix in the handed-out URL: the live feed shows every display either way, but a new enrollment takes the page's current target, which is every display only with that suffix (or the page's All displays mode), while a device already enrolled keeps its stored display filter until the person changes it on the page; without it the target is the display the hostname names (`n-1` is display 1). This is the supported path for delivering an agent's notifications to a human's device; under the default allow policy no token goes in the URL (the hostname is the capability).
- `notifications.send` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; a display that comes up with a reachable session is remembered for 60 s, a failed ensure is not remembered, so a retry tries again), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display yet, it returns `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, a `Retry-After` header and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; when no display is running and none can be started it returns `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`.

## Common errors

- Invalid input on `notifications.send` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch carries a fixed `code` and one fixed `details` sentence: no display running and none can be started → `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`; the display's notification session not up yet → `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, with `Retry-After` and `details: "The display's notification session is not available yet. Retry in a few seconds."`; it normally clears within seconds, but where the computer cannot look a display's session up at all (that lookup is switched off or its helper is not installed, and no session address is inherited) every retry gets the same 503; a timeout ("Sending the notification timed out. Retry later.") or any other failure ("The notification service failed to send the notification.") → `500` `error: "Notification dispatch failed"`, `code: "DISPATCH_FAILED"`.
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` (with `Retry-After`, the whole seconds until the window resets) on any route that reaches the rate limiter: every request counts toward a shared per-IP limit of 60 per 60-second window by default (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`), and `send`, `push.test` and `icons.get` also have separate per-IP limits of their own: 10, 10 and 100 per window by default (`RATE_LIMIT_NOTIFY_MAX` sets both of the first two, each with its own counter; `RATE_LIMIT_ICONS_MAX`). Each window starts at the first request and resets only when it ends. CORS preflights are answered before the limiter.
- `GET /api/v1/notifications/health` returning 200 does not establish that authorised endpoints are reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Use the canonical kit slug `n` in URLs; the longer `notifications` and `notification` host labels exceed the 63-character DNS label limit with 24-character project and computer ids. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first, and tag your test traffic with a distinctive `category` (the examples use `ci-build`, `maintenance`, `stream-demo` and `burst-demo`) so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. Warning: Use a display from 1 through 40000: display `:0` does not exist and returns `400 Validation Error` (`details: "Display 0 does not exist; display IDs start at 1."`). A valid display whose notification session is not up yet returns `503` `DISPLAY_NOT_READY` with `Retry-After`; resend after that wait, and stop after a few tries (where the computer cannot look the session up at all and inherits no session address, the 503 never clears).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```typescript
await client.notifications.send({
  display: '2',
  summary: 'Build done',
  body: 'v1.4.2 deployed',
  urgency: 'normal',
  category: 'ci-build',
});
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```typescript
const list = await client.notifications.list('2', { limit: 10 });
const mine = (list.data as any).data.notifications.find((n: any) => n.category === 'ci-build'); // kit envelope: response.data.data.notifications
if (!mine) {
  console.log('No matching notification in this page; page through history before assuming delivery failed.');
} else {
  const { id, display_id } = mine; // id is per-display
}
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the computer. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```typescript
const displays = ['2', '3'];
await Promise.all(displays.map(d => client.notifications.send({
  display: d, summary: 'Maintenance in 5m', urgency: 'critical', category: 'maintenance',
})));
const r = await client.notifications.list('2,3', { limit: 20 });
const mine = (r.data as any).data.notifications.filter((n: any) => n.category === 'maintenance');
```

### 3. Subscribe to the live stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry), `resync` (when the subscriber fell behind). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay, but both transports then send `{"type":"resync","skipped":<n>,"timestamp":<ms>}`. On a `resync`, re-read `notifications.list` from `since=0` (paging as in Example 8) and reconcile it with what you hold: paging forward from the last position you processed misses rows that changed in place or were stamped earlier than it. The SDK has one method per transport. `client.notifications.connect` returns the WebSocket wrapper used below, not SSE: register the handlers, `onResync` included, before `connect()`. Over WebSocket the JSON `heartbeat` (and so `onHeartbeat`) arrives every 30 s by default, not every 15 s. `client.notifications.stream` is the SSE form of the same route: `displays` is required there, and it resolves to an async iterator of frames (`for await (const ev of await client.notifications.stream({ displays: 'all' }))`).

```typescript
const stream = await client.notifications.connect({ displays: 'all' });
stream.onNotification((msg) => console.log('new:', msg.data));
stream.onDisconnect((code, reason) => { /* socket closed: code=${code} reason=${reason} */ });
stream.onError((err) => console.error(err));
// Fell behind: `msg.skipped` entries were not delivered; re-read the list from `since=0` and reconcile (paging as in Example 8).
stream.onResync((msg) => console.warn('missed', msg.skipped, 'notifications; catching up'));
await stream.connect();
// later:
stream.close();
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. Warning: Send `notificationIds` as **integers** — non-integer elements are dropped. An empty array returns `400 "notificationIds must be a non-empty array of integers"`; a non-empty array with no valid integer returns `400 "notificationIds must contain valid integer IDs"`. Warning: Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (Example 5 shows how to undo it: `notifications.restore` without `displayId` clears every scope).

```typescript
const r = await client.notifications.list('2', { limit: 50 });
const ids = (r.data as any).data.notifications.map((n: any) => n.id); // numbers, NOT strings
if (ids.length > 0) {
  await client.notifications.dismiss({ notificationIds: ids, displayId: '2' });
}
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `notifications.restore` is `DELETE /dismiss` (same path as POST `notifications.dismiss`). With `displayId: "2"` it clears every dismissal scoped to display 2, including dismissals made before Example 4; global dismissals and other displays' scoped dismissals remain. Omitting `displayId` clears every dismissal, global and on every display.

```typescript
// SDK signature is restore(options?: { displayId?: string; ... })
await client.notifications.restore({ displayId: '2' });   // scoped
await client.notifications.restore();                     // every scope, global and all displays
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried. `icons.get(iconId, { ifNoneMatch: etag })` sends a conditional request; a match answers 304, which the SDK throws as an `ApiError` with status 304. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); a name with a character other than letters, digits, `_`, `.` and `-` (an encoded slash, `%2F`, say; a raw `/` makes the URL miss the icon route and normally returns `404`, unless the fallback serves a matching asset) or an unsupported extension returns `400` with `error: "Validation Error"` and `details: "Icon ID is invalid or has an unsupported extension."`, while a name that passes that check but is not a valid icon path (a name whose session part, before the last two `_` fields, contains `..`) gets `Icon not found or path invalid`, an icon that cannot be opened returns `400 "Icon not found"`, and a read failure after opening it returns `500 "Internal server error while serving icon"`. The icon handler itself never answers 404: a missing icon is a `400`.

```typescript
const r = await client.notifications.list('2', { limit: 10 });
const withIcon = (r.data as any).data.notifications.find(
  (n: any) => n.has_icon && typeof n.icon_url === 'string',
);
if (!withIcon) {
  console.log('No notification icon in this page');
} else {
  const iconId: string | undefined = withIcon.icon_url.split('/').pop();
  if (!iconId) throw new Error('Invalid icon URL');
  const r2 = await client.notifications.icons.get(iconId);
  const bytes = r2.data; // icons.get returns ApiResponse<ArrayBuffer>; the bytes live under .data
}
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches, listed oldest-first (by (timestamp, display, id) with `since` alone; by (id, timestamp, display) whenever `after_id` is sent, also together with `since`, which then stays a lower bound on the timestamp), and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, and a string may start with a colon (`":2"`), so compare it as a string with any leading colon removed; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```typescript
const since = Date.now() - 60_000;
// With `since` the page is the OLDEST `limit` matches, listed oldest first.
// To walk every page from `since`, use listIterator('2', { since }) or listAll('2', { since }) (ids restart, so key stored rows by timestamp, display and id).
const r = await client.notifications.list('2', { limit: 100, since });
const { notifications: items, has_more, next_cursor } = (r.data as any).data;
const lastId = items.length ? Math.max(...items.map((n: any) => n.id)) : null;
```

### 8. Catch up page by page with a cursor

**Goal:** poll for rows that sort after your last cursor. To catch changed rows or rows stamped earlier than the cursor, periodically re-read from `since=0` and reconcile. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Cursors from a plain listing or a `since`-only page use (timestamp, display, id) order and cover `all` or `2,3`; cursors from an `after_id` page keep (id, timestamp, display) order. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

The SDK takes the cursor as `{ cursor: next_cursor }`. `listIterator('all', { since: 0 })` and `listAll('all', { since: 0 })` follow `next_cursor` for one walk, but they do not hand back the last `next_cursor`, so keep the manual loop below when each poll must resume where the previous one stopped. Ids repeat across displays and restart over time, so key a stored row by its timestamp, display and id; an SDK build from before the same-rows fix can throw on a valid `'all'` walk, and then needs this manual loop.

```typescript
const pageOf = (r: any) => (r.data as any).data ?? { notifications: [], has_more: false };
// First read: the newest page. Keep its next_cursor (null only when nothing is listed).
let cursor: string | undefined = pageOf(await client.notifications.list('all', { limit: 50 })).next_cursor ?? undefined;
// Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
for (;;) {
  const page = pageOf(await client.notifications.list('all',
    cursor ? { limit: 1000, cursor } : { limit: 1000, since: 0 }));
  for (const n of page.notifications) { /* handle n (oldest first) */ }
  cursor = page.next_cursor ?? cursor;
  if (!page.has_more) break;
}
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads every `alex-display-<N>-notifications.json` and every `alex-<session>-notifications.json`, then returns only the rows for display `2`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```typescript
const r = await client.notifications.list('2', {
  limit: 200,
  since: Date.now() - 86_400_000,
  username: 'alex',
  session: 'sessabc',
} as any);
```

### 10. Survive a 429 rate-limit burst on `notifications.send`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. Every route is per-IP rate-limited (60 requests per 60-second window by default), and `notifications.send` has a tighter limit of its own: by default it accepts 10 requests per client IP per 60-second window (`RATE_LIMIT_NOTIFY_MAX`, `RATE_LIMIT_WINDOW_MS`), and the window resets only when it ends, so the 11th send of a fast burst is refused until then. A `429` carries `Retry-After`, the whole seconds until the window resets: wait that long, not a short doubling backoff. Strategy: pace sends client-side (at most 10 a minute with the defaults), wait out `Retry-After` on `429`, and never retry on `400` (validation — fix the body instead). A `503` with `code: "DISPLAY_NOT_READY"` means the display's notification session is not up yet: wait for its `Retry-After` and resend a few times; where the computer cannot look the session up at all (the lookup is switched off or its helper is not installed, and no session address is inherited) it never clears, so give up after a few tries. A `503` with `code: "DISPLAY_NOT_AVAILABLE"` means the target display is not running and the computer has no display server to start it: use a computer image with display support, because retrying the same call does not help. A `500` (`code: "DISPATCH_FAILED"`) is a failed or timed-out send; its `details` says which.

```typescript
async function triggerWithBackoff(req: any, max = 5) {
  for (let i = 0; i < max; i++) {
    try { return await client.notifications.send(req); }
    catch (e: any) {
      // Wait until the rate window resets: ApiError.retryAfterMs comes from Retry-After.
      if (e?.status === 429 && i < max - 1) { await new Promise(r => setTimeout(r, e.retryAfterMs ?? 60_000)); continue; }
      throw e; // 400 / 500 / 503 — don't retry blindly (see the Goal for 503 DISPLAY_NOT_READY)
    }
  }
  throw new Error('rate-limited after retries');
}
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to every device where they enabled alerts. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser on each device, tap **Enable** and allow notifications; the page can be closed afterwards (phone, desktop, or a phone that mirrors notifications to a smartwatch; iPhone/iPad: Add to Home Screen first and enable from there). `{P}`/`{C}`/`{N}` come from `computers.get`; `?displays=all` selects every display for a new enrollment (a device that already has alerts enabled for specific displays keeps that filter when it opens the URL: click **Get alerts for all displays instead** under **Alerts on this device** to change it):

```
https://{P}-{C}-n-1.{N}.computers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and registers the device for Web Push, so alerts reach it with the page closed: the browser's push service holds an alert for an offline device for up to a day by default. Delivery is still best effort (a device in a failure cooldown, or one that was offline for longer, misses alerts), so when an alert must not be missed, the agent should also check the `notifications.list` history. Under the default allow policy, the kit URL is sufficient. No token goes in it. When proxy permissions protect a kit, supply the credential required by its authentication group: the browser must supply it too (a password group makes the browser ask for it).

**Agent side** — fire the alert. Use a display from 1 through 40000 (display 0 is a `400`). With display-ensure enabled, the default, the kit tries to start the target display, so you don't need to set up X first; if it cannot start it or its notification session is unavailable, the send returns a `503`.

```typescript
await client.notifications.send({
  display: '1',
  summary: 'Build finished',
  body: 'v1.4.2 is deployed — review when you can',
  urgency: 'normal',
});
```

## Reference

**Accessor:** `client.notifications`  |  **Import:** `import * as notifications from 'hoody-sdk/notifications'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.notifications.kit.getHealth()` returns `Promise<NotificationsKitGetHealthResponse>`. `data` is the request body; it has a row only where the row says more than the signature. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

### `client.notifications` (7) — Retrieve historical notifications

#### `connect` — Real-time notification stream (WebSocket or SSE)

```typescript
client.notifications.connect(options?: { displays?: string }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displays` | `string` | query | No | Comma-separated display IDs (`1,:2,3`), or `all` / `*` for every display. Required for SSE (400 without it). Optional for WebSocket: without it no notification is delivered until the client sends a `subscribe` message (Ping and `heartbeat` still arrive); an invalid ID arrives as an `error` frame after the upgrade. |

**Returns:** `Promise<NotificationsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/notifications/stream`
**CLI:** `hoody notifications stream`
**SSE form:** `client.notifications.stream` reads the same route as Server-Sent Events. It takes the same arguments without `wsOptions` and resolves to an `IEventStream`: iterate it with `for await`.

---

#### `dismiss` — Dismiss notifications

```typescript
client.notifications.dismiss(data: NotificationsDismissRequest)
```

**Body:** `{ displayId: string|null | int, notificationIds*: int[] }`

- `displayId` — Display to scope the dismissal to: `"1"`, `":1"` or `1` (0-99999; surrounding whitespace and extra leading colons are ignored). Omit or send `null` to dismiss globally. Any other value or type is rejected with 400; it never widens the dismissal to every display.
- `notificationIds` — … Must be a non-empty array of at most 1000 entries with at least one integer; non-integer entries are ignored. A scope (global or one display) holds at most 10000 dismissed IDs: a request that would add IDs past that is rejected with 400 and changes nothing; clear the scope with `DELETE /dismiss` first.

**HTTP:** `POST /api/v1/notifications/dismiss`
**CLI:** `hoody notifications dismiss --notification-ids <notification-ids>`

---

#### `list` — Get notifications for specified display(s)

```typescript
client.notifications.list(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `string` | path | Yes | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | query | No | Maximum number of notifications to return |
| `since` | `number` | query | No | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`, oldest first. Use it to start from a known time (`0` for the whole history); continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | query | No | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen and listed by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`. |
| `cursor` | `string` | query | No | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it, oldest first. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | query | No | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | query | No | Read only this session's history files (letters and digits only). See the operation description. |

**HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list <display>`

---

#### `listAll` — Get notifications for specified display(s) (collect all pages)

```typescript
client.notifications.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotificationsListResponse>[]>` — every item of `data.data.notifications`, pages collected from the cursor you pass, or from where `list()` starts without one (`list()` fetches one page). Each item is `Notification`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list <display>`

---

#### `listIterator` — Get notifications for specified display(s) (async iterator)

```typescript
client.notifications.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotificationsListResponse>, void, unknown>` — one item of `data.data.notifications` per step, the next page fetched on demand from the cursor you pass, or from where `list()` starts without one (`list()` fetches one page). Each item is `Notification`.  |  **HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list <display>`

---

#### `restore` — Clear dismissed notifications

```typescript
client.notifications.restore(options?: { displayId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `string` | query | No | Clear only this display's dismissals (`1` or `:1`, 0-99999; surrounding whitespace and extra leading colons are ignored). Omit to clear everything. An invalid value is rejected with 400. |

**HTTP:** `DELETE /api/v1/notifications/dismiss`
**CLI:** `hoody notifications restore`

---

#### `send` — Trigger a new desktop notification

```typescript
client.notifications.send(data: NotificationsSendRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NotificationsSendRequest` | body | Yes | Shape: `NotifyRequest` under Body schemas. |

**HTTP:** `POST /api/v1/notifications/notify`
**CLI:** `hoody notifications send --display-id <display-id> --summary <summary>`

---

### `client.notifications.icons` (1) — Serve notification icons

#### `get` — Get notification icon

```typescript
client.notifications.icons.get(iconId: string, options?: { ifNoneMatch?: string; ifModifiedSince?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `iconId` | `string` | path | Yes | The unique identifier for the icon (e.g., "6_10_1749024932903.png") |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | ETag(s) from an earlier response, or `*`. A match returns 304. Overrides If-Modified-Since. |
| `ifModifiedSince` | `string` | header `If-Modified-Since` | No | HTTP date; returns 304 when the icon has not changed since then (whole seconds). Ignored when If-None-Match is sent. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notifications/icons/{iconId}`
**CLI:** `hoody notifications icons get <icon-id>`

---

### `client.notifications.kit` (2) — Server health check

#### `getHealth` — Service health check

```typescript
client.notifications.kit.getHealth()
```

**HTTP:** `GET /api/v1/notifications/health`
**CLI:** `hoody notifications health`

---

#### `getMetrics` — Prometheus-compatible metrics endpoint

```typescript
client.notifications.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/notifications/metrics`
**CLI:** `hoody notifications metrics`

---

### `client.notifications.push` (2) — Alerts on phones and browsers with the page closed (Web Push)

#### `getPublicKey` — Get the push public key

```typescript
client.notifications.push.getPublicKey()
```

**HTTP:** `GET /api/v1/notifications/push/vapid-public-key`
**CLI:** `hoody notifications push publickey get`

---

#### `test` — Send a test push

```typescript
client.notifications.push.test(data?: NotificationsPushTestRequest)
```

**Body:** `{ subscriptionId: string|null }`

**HTTP:** `POST /api/v1/notifications/push/test`
**CLI:** `hoody notifications push test`

---

### `client.notifications.push.subscriptions` (3) — Devices subscribed to push alerts

#### `create` — Register a push subscription

```typescript
client.notifications.push.subscriptions.create(data: NotificationsPushSubscriptionsCreateRequest, options: { origin: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `origin` | `string` | header `Origin` | Yes | Set by the browser. Must be an https origin; `null` is refused. |

**Body:** `{ endpoint*: string, keys*: { p256dh*: string, auth*: string }, userAgent: string, displays: string | (string | int)[], replacesEndpoint: string|null }`

- `endpoint` — Push service URL from the browser (https, a known push service host). At most 2048 bytes (UTF-8).
- `displays` — Displays whose notifications reach this device: `"all"` (default; also `"*"`), a comma-separated string (`"1,2"`) or an array of display numbers (`[1, ":2"]`), 1 to 5 digits each. Either form selects at most 100 distinct displays after duplicates are removed.
- `replacesEndpoint` — Previous endpoint URL of the same browser, at most 2048 bytes (UTF-8).

**HTTP:** `POST /api/v1/notifications/push/subscriptions`

---

#### `delete` — Delete a push subscription

```typescript
client.notifications.push.subscriptions.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Subscription id from the list |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/notifications/push/subscriptions/{id}`
**CLI:** `hoody notifications push subscriptions delete <id>`

---

#### `list` — List push subscriptions

```typescript
client.notifications.push.subscriptions.list()
```

**HTTP:** `GET /api/v1/notifications/push/subscriptions`
**CLI:** `hoody notifications push subscriptions list`


### Body schemas

- `NotifyRequest` — `{ body: string, category: string, display*: string, expire_time: int, icon: string, summary*: string, urgency: "low" | "normal" | "critical"="normal" }`
  - `body` — Notification body, up to 1000 characters by default; longer is rejected with 400, never truncated. No NUL byte. Tabs, newlines and carriage returns are kept; other ASCII control characters are removed, and a non-empty body that becomes empty that way is rejected.
  - `category` — Notification category, at most 50 characters. Rejected when it contains a NUL byte or is empty once control characters are removed.
  - `display` — Target display, `"1"` or `":1"`, from 1 to 40000. Display 0 in any spelling (`0`, `:0`, `00`) and numbers above 40000 are rejected with 400. At most 5 digits; leading zeros are allowed (`"0001"` is display 1).
  - `icon` — Icon name or path, at most 1024 characters. No NUL byte. ASCII control characters other than tab, newline and carriage return are removed; a non-empty value that becomes empty that way is rejected with 400.
  - `summary` — Notification title, 1 to 200 characters by default; longer is rejected, never truncated. Must contain something other than control characters and no NUL byte.

