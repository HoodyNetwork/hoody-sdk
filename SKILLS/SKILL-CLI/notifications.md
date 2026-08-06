> _**CLI skill · `notifications` namespace** · ~4,994 tokens · hoody-sdk v1.0.0-beta.12_

# `notifications` — Trigger and consume desktop notifications inside a container

## Purpose

Two jobs in one namespace. First and most useful: **remotely inform the human operator** — an agent fires a notification from inside a container and it pops on the user's phone, desktop, or smartwatch even when they're away from the session. Second: drive and read the container's own desktop (`notify-send`) toasts on an X display. The user opens the kit's web page once (see § Capability URL), grants browser-notification permission, and leaves it backgrounded; from then on every notification the agent fires is delivered to them as a real OS notification, and is also queryable and streamable over the HTTP API.

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

- Target display exists.
- Required: `display`+`summary` on `hoody notifications trigger`; `display` on `hoody notifications list`; `displays` on `hoody notifications stream`.

## Capability URL

Kit slug is `n` (not `notifications`): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns every streamed entry into a real OS notification (works backgrounded; auto-reconnects, polling fallback). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `hoody containers get`. → See `SKILL-CLI.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`hoody notifications trigger` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications trigger --display :0 --summary "Build done"`.

### 2. Read recent notifications

`hoody notifications list` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `limit` (1–1000, default 100), `since` (ms), `username`, `session`. **`after_id` is supported by the kit HTTP route but is NOT in the generated SDK options** (`notifications.service.generated.ts:340-422`); use raw HTTP/curl when you need cursor pagination. The SDK additionally exposes `hoody notifications list` (one-shot fetch-all) and `hoody notifications list` (async page iterator) on top of plain list; the CLI exposes only a single `hoody notifications list` subcommand under `hoody notifications`. CLI: see CLI-broken caveat in Quirks.

### 3. Subscribe to events

`hoody notifications stream` — `displays`: `"all"`, `"*"`, or 1–3-digit IDs comma list. WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`). WS sends `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`hoody notifications list` → int `id`s → `hoody notifications dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `hoody notifications clear-dismissed` DELETE (optional `displayId`) restores. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`hoody notifications list` → `icon` → `hoody notifications icon` by `iconId`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `hoody notifications trigger` with a `display` (any real display number — the kit auto-ensures it, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`, not `notifications`.
- `dismiss.notificationIds` MUST be integers (strings → `400`); `displayId` strips leading `:`.
- `hoody notifications trigger` limits: `summary` ≤200, `body` ≤1000, `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`.
- `list.display` numeric or `"all"`; `connectStream.displays` accepts 1–5-digit IDs (`20001` is valid; 6+ digits rejected) (`"1000"` rejected).
- `list.limit` `[1,1000]` def 100; cursor `after_id`; `username`/`session` 1–100 ASCII alnum.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s heartbeat. WS: per-IP caps, origin allow-list, drops after 2 missed pongs.
- `hoody notifications clear-dismissed`=DELETE, `hoody notifications dismiss`=POST, same path.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `hoody inbox *` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated.
- The CLI uses `namespace: 'notifications'`, which routes through `normalizeKitProgram` to the kit slug `n` and builds `https://{P}-{C}-n-{N}.{server}.containers.hoody.com/api/v1/notifications/...` — `hoody --container <C> notifications {list|dismiss|icon|trigger}` reaches the kit correctly.
- `notifications stream` mapping has no `cli_stream` flag — the generated CLI buffers SSE events forever instead of streaming. Use SDK `hoody notifications stream` (returns a WebSocket wrapper, not void) or hit `/api/v1/notifications/stream` directly with `EventSource`/`fetch` for live feeds.
- `hoody notifications stream` returns a `Promise<NotificationsConnectNotificationStreamWebSocket>` wrapper. Wire callbacks first (`wrapper.onNotification(cb)` / `onHeartbeat(cb)` / `onDisconnect(cb)` / `onError(cb)`), then `await wrapper.connect()`. Close with `wrapper.close()`. There is NO `onMessage`/`onClose` — those names are wrong. `displays` is typed optional in the TS signature but is required at runtime — the SDK throws `ValidationError('displays is required')` if omitted, so always pass it.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it connects to the stream and raises a browser `Notification` per entry, with a polling fallback and auto-reconnect. Mount it as `?displays=all` to catch every display. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `hoody notifications trigger` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit runs `hoody-terminal create --terminal-id N --display-id N --wait-for-display --wait-timeout S` (where `S` is the display-ensure timeout, default 30 s; results are cached 60 s) to bring the target display up before calling `notify-send`, so firing to e.g. `:1` works on demand. It still returns `500 "No D-Bus session available"` if the display genuinely can't be brought up — pick another display instead of retrying the same one.

## Common errors

- `400 "Notification dispatch failed"` w/ details; non-`Invalid` → `500`.
- WS `1008` origin-deny; `1001` heartbeat timeout. `429` on `hoody notifications trigger` / `hoody notifications icon`; both are enforced by the shared per-IP rate-limit middleware.
- `/health` 200 ≠ authorised endpoints reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Every step in every example was live-tested against a real `n-1` kit (kit slug is `n`, NOT `notifications` — the long form returns DNS NXDOMAIN). Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Display `:0` typically has no D-Bus session in headless containers (`500 "No D-Bus session available for display :0"`); use a display that an X session is actually attached to (`:2` and `3` were live on the test container).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
hoody --container "$C" notifications trigger \
  --display 2 --summary 'Build done' --body 'v1.4.2 deployed' \
  --urgency normal --category sdk-doc-build
```
**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build")'   # CLI -o json strips only the TRANSPORT wrapper; the kit envelope survives → .data.notifications
```
### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and per-display id sequences are independent (display `:2` and `:3` each have their own `id=1`, `id=2`…).

```bash
for D in 2 3; do
  hoody --container "$C" notifications trigger \
    --display "$D" --summary 'Maintenance in 5m' \
    --urgency critical --category sdk-doc-fanout
done
hoody --container "$C" notifications list 2,3 --limit 20 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```
### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that processes every new notification as it arrives. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. Frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry).

```bash
# Generated CLI buffers SSE events in memory (no cli_stream flag in the namespace
# mapping), so `notifications stream` is not a true live tail. For a streaming
# feed, drop to EventSource/fetch on $KIT/api/v1/notifications/stream or use the
# SDK connectStream() wrapper.
hoody --container "$C" notifications trigger --display 2 \
  --summary 'hello-stream' --category 'sdk-doc-stream'
```
### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ `notificationIds` MUST be **integers** — strings return `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides the entries from `GET /:displayId` but they remain visible from `GET /all`; for cross-display hide, omit `displayId` (see example 5).

```bash
IDS=$(hoody --container "$C" notifications list 2 --limit 50 -o json \
  | jq -r '.data.notifications[].id' | paste -sd, -)
hoody --container "$C" notifications dismiss \
  --display-id 2 --notification-ids "$IDS"
```
### 5. Restore everything you just dismissed

**Goal:** undo step 4 — bring dismissed items back into the listing. `hoody notifications clear-dismissed` is `DELETE /dismiss` (same path as POST `hoody notifications dismiss`); pass `displayId` to scope, or omit it for global restore.

```bash
hoody --container "$C" notifications clear-dismissed --display-id 2
hoody --container "$C" notifications clear-dismissed
```
### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400 "Icon ID is invalid or has an unsupported extension."`, and an existing-but-unreadable icon returns `500` — NOT 404, despite the openapi.yaml documenting a 404 for this case.

```bash
ICON=$(hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
hoody --container "$C" notifications icon "$ICON" > /tmp/icon.bin
```
### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me everything new on display `:2` since the last poll, with a stable cursor for the next call." `since` is **Unix milliseconds**, `after_id` is the per-display integer cursor (HTTP only — neither the SDK nor the CLI exposes `after_id`). `display_id` in responses is a `DisplayIdValue` — either a number or a string depending on the entry source — but the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 100 --since "$SINCE_MS" -o json \
  | jq '.data | {count, last_id: ([.notifications[].id] | max)}'
```
### 8. Page through history — newest 50, then walk backwards

**Goal:** the listing default is 100 newest; you want clean pagination. The kit hands back items already in newest-first order. There's no `before_id` flag — you walk by re-querying with `after_id` for forward catch-up, or take page slices client-side. The SDK adds two helpers on top of plain list: a one-shot fetch-all and a streaming iterator (both shown in the SDK example below).

```bash
hoody --container "$C" notifications list all --limit 50 -o json \
  | jq '[.notifications[].id] | min'
```
### 9. Audit notifications by username / session

**Goal:** "show me everything user `alex` saw in session `sessabc`." `username` and `session` are filter query params on `hoody notifications list`; pure ASCII alnum 1–100 chars — hyphens/underscores are rejected with `400` (e.g. `sess-abc` would fail validation). ⚠ Unknown values DO NOT 404 — the kit returns `count` of whatever it has from the wider context (live-confirmed: `username=root` returned non-empty even though notifications never had that field set), so always combine with `display`+`since` to keep the result tight.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 36*60*60*1000 ))  # last 36h, ms
hoody --container "$C" notifications list all \
  --limit 200 --since "$SINCE_MS" \
  --username alex --session sessabc -o json
```
### 10. Survive a 429 rate-limit burst on `hoody notifications trigger`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `hoody notifications trigger` and `hoody notifications icon`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). On `500 "No D-Bus session available"`, the display has no live X session — pick another display, don't retry the same one.

```bash
# CLI has no built-in retry — wrap in shell:
for i in $(seq 1 50); do
  hoody --container "$C" notifications trigger \
    --display 2 --summary "burst-$i" --category sdk-doc-burst || sleep 2
done
```
### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `hoody containers get`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load, reconnects on its own, and falls back to polling if WebSocket is blocked. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any real display number works; the kit auto-ensures it, so you don't need to set up X first.

```bash
hoody --container "$C" notifications trigger \
  --display 1 --summary 'Build finished' \
  --body 'v1.4.2 is deployed — review when you can' --urgency normal
```

## Reference

### `hoody notifications` (9) — Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications clear-dismissed` |  | destructive | Clear dismissed notifications | `notifications.clearDismissed` | `hoody notifications clear-dismissed --display-id 1` |
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids <notification_ids>` |
| `hoody notifications health` |  | read | Service health check | `notifications.health.check` | `hoody notifications health` |
| `hoody notifications icon` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icon abc-123` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.listIterator` | `hoody notifications list :0 --limit 100 --since 1750000000000 --session sess-abc` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.health.getMetrics` | `hoody notifications metrics` |
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open [index] [--url]` |
| `hoody notifications stream` |  | read | Real-time notification stream via WebSocket | `notifications.connectStream` | `hoody notifications stream --displays <displays>` |
| `hoody notifications trigger` |  | write | Trigger a new desktop notification | `notifications.notify.trigger` | `hoody notifications trigger --body '{}' --category general --display :0 --expire-time 10 --icon <icon> --summary <summary> --urgency low` |

