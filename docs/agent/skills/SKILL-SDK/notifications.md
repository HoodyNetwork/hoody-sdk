> _**SDK skill · `notifications` namespace** · ~9,925 tokens · hoody-sdk v1.0.0-beta.15_

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
- Required: `display`+`summary` on `notifications.send`; `display` on `list`; `displays` on `connect`.

## Capability URL

Kit slug is `n` (not `notifications`): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns each entry it receives over its SSE stream into a real OS notification (works backgrounded; the stream reconnects on its own; there is no polling fallback, so an alert that arrives during a gap is not shown). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `containers.get`. → See `SKILL-SDK.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`notifications.send` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. Pick a display that has (or can be given) a D-Bus session; `:0` often has none, see Example 1.

### 2. Read recent notifications

`list` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `limit` (1–1000, default 100), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries. With `since` the page holds the OLDEST `limit` entries at or after that timestamp; with `after_id` the OLDEST `limit` ids above it. Every page is sorted newest-first either way. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. The SDK `list` options have no `cursor` yet (an unknown key is not sent): page forward per display with `after_id` while `has_more` is `true`; see Example 8.

### 3. Subscribe to events

`connect` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`). Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`list` → int `id`s → `dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `restore` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike.

### 5. Fetch an icon

`list` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `icons.get`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `notifications.send` with a `display` (any real display number — the kit auto-ensures it, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`, not `notifications`.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `notifications.send` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`.
- `list.display` numeric or `"all"`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `list.limit` `[1,1000]` def 100; forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `list`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `restore` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, drops after 2 missed pongs.
- `restore`=DELETE, `dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. To catch up, page `list` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `client.api.inbox.*` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` (403 without it), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- For live feeds use `connect` (see the next bullet). The generated CLI command for the same route buffers SSE events instead of streaming them, so don't shell out to it.
- `connect` returns a `Promise<NotificationsConnectNotificationStreamWebSocket>` wrapper, NOT `void`, and nothing is connected when it resolves. Wire callbacks first (`wrapper.onNotification(cb)` / `onDisconnect(cb)` / `onError(cb)`), then `await wrapper.connect()`. The wrapper also has `onHeartbeat(cb)`: it fires on the kit's JSON `heartbeat` message, which the kit sends over WebSocket too, next to a protocol Ping, once per heartbeat interval (30 s by default, not SSE's 15 s). Close with `wrapper.close()`. There is NO `onMessage`/`onClose` — those names are wrong. `displays` is required twice over: the options object is required and types it `displays: string`, and the method throws `ValidationError('displays is required')` when it is missing.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a browser `Notification` per entry it receives. It has no polling fallback: recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise a native alert, so an alert that arrives while the stream is down is not shown. The `?displays=all` suffix in the handed-out URL is harmless; the page always subscribes to all displays. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `notifications.send` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; results are cached 60 s), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display it still returns `500` `error: "Notification dispatch failed"` with `details: "The display's notification session is not available yet. Start the display and retry."`

## Common errors

- Invalid input on `notifications.send` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch → `500` `error: "Notification dispatch failed"` with one fixed `details` sentence: session unavailable ("The display's notification session is not available yet. Start the display and retry."), timeout ("Sending the notification timed out. Retry later."), or any other failure ("The notification service failed to send the notification.").
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` on `send` / `icons.get`; both are enforced by the shared per-IP rate-limit middleware.
- `/health` 200 ≠ authorised endpoints reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

The kit slug is `n`, NOT `notifications` (the long form does not resolve). Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Display `:0` typically has no D-Bus session in headless containers (`500` with `details: "The display's notification session is not available yet. Start the display and retry."`); use a display that an X session is actually attached to.

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```typescript
await client.notifications.send({
  display: '2',
  summary: 'Build done',
  body: 'v1.4.2 deployed',
  urgency: 'normal',
  category: 'sdk-doc-build',
});
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```typescript
const list = await client.notifications.list('2', { limit: 10 });
const mine = (list.data as any).data.notifications.find((n: any) => n.category === 'sdk-doc-build'); // kit envelope: response.data.data.notifications
const { id, display_id } = mine; // id is per-display
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```typescript
const displays = ['2', '3'];
await Promise.all(displays.map(d => client.notifications.send({
  display: d, summary: 'Maintenance in 5m', urgency: 'critical', category: 'sdk-doc-fanout',
})));
const r = await client.notifications.list('2,3', { limit: 20 });
const mine = (r.data as any).data.notifications.filter((n: any) => n.category === 'sdk-doc-fanout');
```

### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay. When every entry matters, also page `list` forward (Example 8). The SDK wrapper connects over WebSocket, not SSE: register the handlers before `connect()`. Over WebSocket the JSON `heartbeat` (and so `onHeartbeat`) arrives every 30 s by default, not every 15 s.

```typescript
const stream = await client.notifications.connect({ displays: 'all' });
stream.onNotification((msg) => console.log('new:', msg.data));
stream.onDisconnect((code, reason) => { /* socket closed: code=${code} reason=${reason} */ });
stream.onError((err) => console.error(err));
await stream.connect();
// later:
stream.close();
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ Send `notificationIds` as **integers** — non-integer elements are dropped, and an array with no integer left returns `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (see example 5).

```typescript
const r = await client.notifications.list('2', { limit: 50 });
const ids = (r.data as any).data.notifications.map((n: any) => n.id); // numbers, NOT strings
await client.notifications.dismiss({ notificationIds: ids, displayId: '2' });
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `restore` is `DELETE /dismiss` (same path as POST `dismiss`). With `displayId: "2"` it undoes Example 4 and nothing else; omitting `displayId` clears every dismissal, global and on every display.

```typescript
// SDK signature is restore(options?: { displayId?: string; ... })
await client.notifications.restore({ displayId: '2' });   // scoped
await client.notifications.restore();                     // every scope, global and all displays
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400 "Icon ID is invalid or has an unsupported extension."`, and an existing-but-unreadable icon returns `500`. The route has no 404 path at all — a missing icon is a `400`.

```typescript
const r = await client.notifications.list('2', { limit: 10 });
const withIcon = (r.data as any).data.notifications.find((n: any) => n.has_icon);
const iconId = withIcon.icon_url.split('/').pop();
const r2 = await client.notifications.icons.get(iconId);
const bytes = r2.data; // icons.get returns ApiResponse<ArrayBuffer>; the bytes live under .data
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches (still listed newest-first), and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, so compare it loosely; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```typescript
const since = Date.now() - 60_000;
// With `since` the page is the OLDEST `limit` matches, listed newest first.
// There are no collect-all / iterator helpers for this endpoint; check has_more yourself.
const r = await client.notifications.list('2', { limit: 100, since });
const { notifications: items, has_more } = (r.data as any).data;
const lastId = items.length ? Math.max(...items.map((n: any) => n.id)) : null;
```

### 8. Catch up page by page without gaps

**Goal:** poll for what arrived since your last read, without re-reading or skipping anything. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Rows are ordered by (timestamp, display, id), so one cursor covers `all` or `2,3`. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

The SDK `list` options have no `cursor` yet (an unknown key is not sent), so page with `after_id` instead: it returns the OLDEST `limit` entries whose id is above it, so passing the highest id you hold, again while `has_more` is `true`, misses nothing. Ids are numbered per display and are not unique across displays, so keep one `after_id` per display and list each display on its own.

```typescript
const displays = ['2', '3'];
const high: Record<string, number> = {};
const pageOf = (r: any) => (r.data as any).data ?? { notifications: [], has_more: false };
for (const d of displays) {   // first read: the HIGHEST id per display (0 when empty)
  const ids: number[] = pageOf(await client.notifications.list(d, { limit: 50 })).notifications.map((n: any) => n.id);
  high[d] = ids.length ? Math.max(...ids) : 0;
}
// Each poll: per display, the OLDEST entries above that display's cursor, until has_more is false.
for (const d of displays) {
  for (;;) {
    const page = pageOf(await client.notifications.list(d, { limit: 1000, after_id: high[d] }));
    const ids: number[] = page.notifications.map((n: any) => n.id);
    if (ids.length) high[d] = Math.max(high[d], ...ids);
    if (!page.has_more) break;
  }
}
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads `alex-display-2-notifications.json` and every `alex-<session>-notifications.json`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). The display selection still filters the rows, so only display `2` entries from those files come back. Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```typescript
const r = await client.notifications.list('2', {
  limit: 200,
  since: Date.now() - 86_400_000,
  username: 'alex',
  session: 'sessabc',
} as any);
```

### 10. Survive a 429 rate-limit burst on `notifications.send`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `notifications.send` and `icons.get`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). A `500` (`error: "Notification dispatch failed"`) says why in `details`; when it reads "The display's notification session is not available yet. Start the display and retry.", bring the display up (→ `display`) before retrying instead of looping on the same call.

```typescript
async function triggerWithBackoff(req: any, max = 5) {
  let delay = 500;
  for (let i = 0; i < max; i++) {
    try { return await client.notifications.send(req); }
    catch (e: any) {
      if (e?.status === 429) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
      throw e; // 400 / 500 — don't retry blindly
    }
  }
  throw new Error('rate-limited after retries');
}
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `containers.get`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and its stream reconnects on its own. Delivery is best-effort: there is no polling fallback, so an alert fired while the connection is down is not shown. When an alert must not be missed, the agent should also check the `list` history. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any real display number works; the kit auto-ensures it, so you don't need to set up X first.

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

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.notifications.icons` (1) — Serve notification icons

#### `get` — Get notification icon

```typescript
client.notifications.icons.get(iconId: string, options?: { IfNoneMatch?: string; IfModifiedSince?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `iconId` | `string` | path | Yes | The unique identifier for the icon (e.g., "6_10_1749024932903.png") |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | ETag(s) from an earlier response, or `*`. A match returns 304. Overrides If-Modified-Since. |
| `IfModifiedSince` | `string` | header `If-Modified-Since` | No | HTTP date; returns 304 when the icon has not changed since then (whole seconds). Ignored when If-None-Match is sent. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notifications/icons/{iconId}`
**CLI:** `hoody notifications icons get`

---

### `client.notifications.kit` (2) — Server health check

#### `getHealth` — Service health check

```typescript
client.notifications.kit.getHealth()
```

**Returns:** `Promise<NotificationsHealthCheckResponse>`  |  **HTTP:** `GET /api/v1/notifications/health`
**CLI:** `hoody notifications health`

---

#### `getMetrics` — Prometheus-compatible metrics endpoint

```typescript
client.notifications.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/notifications/metrics`
**CLI:** `hoody notifications metrics`

---

### `client.notifications` (7) — Retrieve historical notifications

#### `connect` — Real-time notification stream (WebSocket or SSE)

```typescript
client.notifications.connect(options?: { displays?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displays` | `string` | query | No | Comma-separated display IDs (`1,:2,3`), or `all` / `*` for every display. Required for SSE (400 without it). Optional for WebSocket: without it the socket receives nothing until the client sends a `subscribe` message; an invalid ID arrives as an `error` frame after the upgrade. |

**Returns:** `Promise<NotificationsConnectNotificationStreamWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/notifications/stream`
**CLI:** `hoody notifications stream`

---

#### `dismiss` — Dismiss notifications

```typescript
client.notifications.dismiss(data: NotificationsDismissRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NotificationsDismissRequest` | body | Yes |  |

**Body:** `{ displayId: string|null | int, notificationIds*: int[] }`

- `displayId` — Display to scope the dismissal to: `"1"`, `":1"` or `1` (0-99999; surrounding whitespace and extra leading colons are ignored). Omit or send `null` to dismiss globally. Any other value or type is rejected with 400; it never widens the dismissal to every display.
- `notificationIds` — Notification IDs to dismiss. Must be a non-empty array with at least one integer; non-integer entries are ignored.

**Returns:** `Promise<NotificationsDismissResponse>`  |  **HTTP:** `POST /api/v1/notifications/dismiss`
**CLI:** `hoody notifications dismiss`

---

#### `list` — Get notifications for specified display(s)

```typescript
client.notifications.list(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `string` | path | Yes | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | query | No | Maximum number of notifications to return |
| `since` | `number` | query | No | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`. Use it to start from a known time; continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | query | No | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`. |
| `cursor` | `string` | query | No | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | query | No | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | query | No | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `Promise<NotificationsListResponse>`  |  **HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list`

---

#### `listAll` — Get notifications for specified display(s) (collect all pages)

```typescript
client.notifications.listAll(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `string` | path | Yes | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | query | No | Maximum number of notifications to return |
| `since` | `number` | query | No | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`. Use it to start from a known time; continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | query | No | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`. |
| `cursor` | `string` | query | No | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | query | No | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | query | No | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `Promise<(NonNullable<NotificationsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { data?: infer T1 } ? (NonNullable<T1> extends { notifications?: infer T2 } ? (NonNullable<T2> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown) : unknown)[]>` — every item of `data.data.notifications`, all pages collected (`list()` fetches one page). Each item is `notifications_Notification`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list`

---

#### `listIterator` — Get notifications for specified display(s) (async iterator)

```typescript
client.notifications.listIterator(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `string` | path | Yes | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | query | No | Maximum number of notifications to return |
| `since` | `number` | query | No | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp >= since`. Use it to start from a known time; continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | query | No | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id > after_id`, chosen by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp >= since` and `id > after_id`. |
| `cursor` | `string` | query | No | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | query | No | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | query | No | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `AsyncGenerator<(NonNullable<NotificationsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { data?: infer T1 } ? (NonNullable<T1> extends { notifications?: infer T2 } ? (NonNullable<T2> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown) : unknown), void, unknown>` — one item of `data.data.notifications` per step, next page fetched on demand (`list()` fetches one page). Each item is `notifications_Notification`.  |  **HTTP:** `GET /api/v1/notifications/{display}`
**CLI:** `hoody notifications list`

---

#### `restore` — Clear dismissed notifications

```typescript
client.notifications.restore(options?: { displayId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `displayId` | `string` | query | No | Clear only this display's dismissals (`1` or `:1`, 0-99999; surrounding whitespace and extra leading colons are ignored). Omit to clear everything. An invalid value is rejected with 400. |

**Returns:** `Promise<NotificationsRestoreResponse>`  |  **HTTP:** `DELETE /api/v1/notifications/dismiss`
**CLI:** `hoody notifications restore`

---

#### `send` — Trigger a new desktop notification

```typescript
client.notifications.send(data: NotificationsSendRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NotificationsSendRequest` | body | Yes | Shape: `notifications_NotifyRequest` under Body schemas. |

**Returns:** `Promise<NotificationsSendResponse>`  |  **HTTP:** `POST /api/v1/notifications/notify`
**CLI:** `hoody notifications send`


### Body schemas

- `notifications_NotifyRequest` — `{ body: string, category: string, display*: string, expire_time: int, icon: string, summary*: string, urgency: "low" | "normal" | "critical"="normal" }`
  - `body` — Notification body. Up to NOTIFY_SEND_MAX_BODY_LENGTH characters (default 1000); longer is rejected with 400, never truncated. No NUL byte; must not be only control characters.
  - `category` — Notification category, at most 50 characters. Rejected when it contains a NUL byte or is empty once control characters are removed.
  - `display` — Target display, `"1"` or `":1"`, from 1 to 40000. Display 0 in any spelling (`0`, `:0`, `00`) and numbers above 40000 are rejected with 400. At most 5 digits; leading zeros are allowed (`"0001"` is display 1).
  - `icon` — Icon name or path, at most 1024 characters. No NUL byte.
  - `summary` — Notification title. 1 to NOTIFY_SEND_MAX_SUMMARY_LENGTH characters (default 200); longer is rejected, never truncated. Must contain something other than control characters and no NUL byte.

