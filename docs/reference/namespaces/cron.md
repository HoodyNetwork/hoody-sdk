# `cron` — 22 methods

**Version:** 1.0.1
**Accessor:** `client.cron`

```typescript
import * as cron from 'hoody-sdk/cron';
```

---

## `client.cron.crontabs` (5 methods)

### `get`

**GET** `/api/v1/cron/users/{user}/crontab`

Get Crontab

```typescript
client.cron.crontabs.get(user: string): Promise<CronCrontabsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |

**Returns:** `CronCrontabsGetResponse`

**CLI:** `hoody cron crontabs get`

---

### `list`

**GET** `/api/v1/cron/crontab`

List All Crontabs

```typescript
client.cron.crontabs.list(options?: { page?: number; limit?: number }): Promise<CronCrontabsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `CronCrontabsListResponse`

**CLI:** `hoody cron crontabs list`

---

### `listAll`

**GET** `/api/v1/cron/crontab`

List All Crontabs (collect all pages)

```typescript
client.cron.crontabs.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/cron/crontab`

List All Crontabs (async iterator)

```typescript
client.cron.crontabs.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/api/v1/cron/users/{user}/crontab`

Put Crontab

```typescript
client.cron.crontabs.set(user: string, data: CronCrontabsSetRequest, options?: { ifMatch?: string }): Promise<CronCrontabsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `data` | `CronCrontabsSetRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Optional precondition (RFC 9110): replace the crontab only if it is still at one of these ETags, as returned by a read of it (the ETag header or the etag field of a crontab or entries read, or of the previous replace): a quoted tag, a comma-separated list of them, or `*` for any. A weak tag never matches. Otherwise 412 PRECONDITION_FAILED and nothing is written. Without it the replace is unconditional and removes entries another client added since your read. |

**Returns:** `CronCrontabsSetResponse`

**CLI:** `hoody cron crontabs set`

---

## `client.cron.entries` (12 methods)

### `create`

**POST** `/api/v1/cron/users/{user}/entries`

Create Entry

```typescript
client.cron.entries.create(user: string, data: CronEntriesCreateRequest): Promise<CronEntriesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `data` | `CronEntriesCreateRequest` | Yes | body |  |

**Returns:** `CronEntriesCreateResponse`

**CLI:** `hoody cron entries create`

---

### `delete`

**DELETE** `/api/v1/cron/users/{user}/entries/{id}`

Delete Entry

```typescript
client.cron.entries.delete(user: string, id: string, options?: { expected_revision?: string }): Promise<CronEntriesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id (UUID) |
| `expected_revision` | `string` | No | query | The entry's revision as last read: the entry is deleted only if it is still at it (412 otherwise) |

**Returns:** `CronEntriesDeleteResponse`

**CLI:** `hoody cron entries delete`

---

### `describeSchedule`

**POST** `/api/v1/cron/schedule/describe`

Describe Schedule

```typescript
client.cron.entries.describeSchedule(data: CronEntriesDescribeScheduleRequest): Promise<CronEntriesDescribeScheduleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CronEntriesDescribeScheduleRequest` | Yes | body |  |

**Returns:** `CronEntriesDescribeScheduleResponse`

---

### `get`

**GET** `/api/v1/cron/users/{user}/entries/{id}`

Get Entry

```typescript
client.cron.entries.get(user: string, id: string): Promise<CronEntriesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id (UUID) |

**Returns:** `CronEntriesGetResponse`

**CLI:** `hoody cron entries get`

---

### `list`

**GET** `/api/v1/cron/users/{user}/entries`

List Entries

```typescript
client.cron.entries.list(user: string, options?: { page?: number; limit?: number }): Promise<CronEntriesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `CronEntriesListResponse`

**CLI:** `hoody cron entries list`

---

### `listAll`

**GET** `/api/v1/cron/users/{user}/entries`

List Entries (collect all pages)

```typescript
client.cron.entries.listAll(user: string, options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `unknown[]`

---

### `listForAllUsers`

**GET** `/api/v1/cron/entries`

List All Entries

```typescript
client.cron.entries.listForAllUsers(options?: { user?: string; page?: number; limit?: number }): Promise<CronEntriesListForAllUsersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | No | query | Only this user's entries |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `CronEntriesListForAllUsersResponse`

---

### `listForAllUsersAll`

**GET** `/api/v1/cron/entries`

List All Entries (collect all pages)

```typescript
client.cron.entries.listForAllUsersAll(options?: { user?: string; page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | No | query | Only this user's entries |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `unknown[]`

---

### `listForAllUsersIterator`

**GET** `/api/v1/cron/entries`

List All Entries (async iterator)

```typescript
client.cron.entries.listForAllUsersIterator(options?: { user?: string; page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | No | query | Only this user's entries |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/cron/users/{user}/entries`

List Entries (async iterator)

```typescript
client.cron.entries.listIterator(user: string, options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based, default 1) |
| `limit` | `number` | No | query | Items per page (default 50, max 200) |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `run`

**POST** `/api/v1/cron/users/{user}/entries/{id}/run`

Run Entry

```typescript
client.cron.entries.run(user: string, id: string, data: CronEntriesRunRequest, options?: { idempotencyKey?: string }): Promise<CronEntriesRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id (UUID) |
| `data` | `CronEntriesRunRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | A key new for this operation (1 to 255 visible ASCII characters). It is saved before the command starts: the same key and body answer the receipt of that request (200, or the same 500 when the command could not start; `state` follows the run) and never run the command again for 24 hours, and the receipt is read at GET /api/v1/cron/runs?key=. Without it, every accepted request runs the command again, so a retry cannot be told from a new request |

**Returns:** `CronEntriesRunResponse`

---

### `update`

**PATCH** `/api/v1/cron/users/{user}/entries/{id}`

Update Entry

```typescript
client.cron.entries.update(user: string, id: string, data: CronEntriesUpdateRequest): Promise<CronEntriesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id (UUID) |
| `data` | `CronEntriesUpdateRequest` | Yes | body |  |

**Returns:** `CronEntriesUpdateResponse`

**CLI:** `hoody cron entries update`

---

## `client.cron.events` (2 methods)

### `connect`

**GET** `/api/v1/cron/events/ws`

Live events about the crontabs of the computer's users: managed entries created, updated or deleted (`source` api, expired or external), whole crontabs replaced or edited (`crontab_changed`, sent after the entry events of that change), and runs of managed jobs (`job_started`, `job_finished`). Edits made outside this service, such as `crontab -e` or `crontab -r`, appear within about 2 seconds with `source: external`. Job events come from the crontab line of an enabled managed entry, which reports its own start and end: scheduled runs of raw lines (lines this service did not write) and of entries in a crontab whose `SHELL` is not a POSIX shell are not reported; Run now of a managed entry is always recorded and sends job events; and a job whose shell exits without reporting its end (it replaced itself with `exec`, or was killed) finishes with `outcome: lost`. Events are kept in memory only: the history used by `since_id` (the last 1024 events by default) is lost when the service restarts, and a `since_id` from before a restart answers 409 `HISTORY_GAP`. Runs are also kept on disk (GET /api/v1/cron/runs), so after a restart read them there (only the runs that reached the disk: see that operation).

```typescript
client.cron.events.connect(options?: { since_id?: number; user?: string; entry_id?: string; types?: string }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<CronEventsConnectWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `since_id` | `number` | No | query | Replay the retained events after this event id, then go live. Without it the stream starts with the next event |
| `user` | `string` | No | query | Only events about this user's crontab and jobs |
| `entry_id` | `string` | No | query | Only events about this managed entry (crontab_changed when it lists the entry) |
| `types` | `string` | No | query | Only these event types, comma-separated: entry_created, entry_updated, entry_deleted, crontab_changed, job_started, job_finished. lag and end always arrive |

**Returns:** `CronEventsConnectWebSocket`

---

### `stream`

**GET** `/api/v1/cron/events/sse`

Live events about the crontabs of the computer's users: managed entries created, updated or deleted (`source` api, expired or external), whole crontabs replaced or edited (`crontab_changed`, sent after the entry events of that change), and runs of managed jobs (`job_started`, `job_finished`). Edits made outside this service, such as `crontab -e` or `crontab -r`, appear within about 2 seconds with `source: external`. Job events come from the crontab line of an enabled managed entry, which reports its own start and end: scheduled runs of raw lines (lines this service did not write) and of entries in a crontab whose `SHELL` is not a POSIX shell are not reported; Run now of a managed entry is always recorded and sends job events; and a job whose shell exits without reporting its end (it replaced itself with `exec`, or was killed) finishes with `outcome: lost`. Events are kept in memory only: the history used by `since_id` (the last 1024 events by default) is lost when the service restarts, and a `since_id` from before a restart answers 409 `HISTORY_GAP`. Runs are also kept on disk (GET /api/v1/cron/runs), so after a restart read them there (only the runs that reached the disk: see that operation).

```typescript
client.cron.events.stream(options?: { since_id?: number; user?: string; entry_id?: string; types?: string }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<CronEventsStreamFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since_id` | `number` | No | query | Replay the retained events after this event id, then go live. Without it the stream starts with the next event. A browser EventSource reconnecting with its Last-Event-ID header resumes the same way |
| `user` | `string` | No | query | Only events about this user's crontab and jobs |
| `entry_id` | `string` | No | query | Only events about this managed entry (crontab_changed when it lists the entry) |
| `types` | `string` | No | query | Only these event types, comma-separated: entry_created, entry_updated, entry_deleted, crontab_changed, job_started, job_finished. lag and end always arrive |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<CronEventsStreamFrames>>`

**CLI:** `hoody cron events stream`

---

## `client.cron.kit` (2 methods)

### `getHealth`

**GET** `/api/v1/cron/health`

Health Check

```typescript
client.cron.kit.getHealth(): Promise<CronKitGetHealthResponse>
```

**Returns:** `CronKitGetHealthResponse`

**CLI:** `hoody cron health`

---

### `getInfo`

**GET** `/api/v1/cron/info`

Get Cron Info

```typescript
client.cron.kit.getInfo(): Promise<CronKitGetInfoResponse>
```

**Returns:** `CronKitGetInfoResponse`

---

## `client.cron.runs` (1 method)

### `list`

**GET** `/api/v1/cron/runs`

The latest runs of managed jobs, newest first, from the reports the jobs' crontab lines send (see the event stream). The service keeps the runs still running (a scheduled job that starts while 500 runs, scheduled and Run now together, are already running still runs but is not listed; Run now has its own limit of 16 simultaneous runs by default) and, for each entry, its last 50 ended runs of the last 30 days, at most 10 000 ended runs in all, in a history file capped at 5 MiB (the oldest ended runs are dropped first). They are kept on disk, so a restart keeps them: a run still running at the restart is followed again, or recorded `lost` when its shell is gone. When the disk cannot be used, or a write fails later, runs from then on are kept in memory only and a restart loses them; runs that reached the disk before stay (`GET /api/v1/cron/info` `history_persisted` says which). Page back with `before` (the `started_at` of the last run received). Raw lines and entries in a crontab whose `SHELL` is not a POSIX shell have no scheduled runs listed; Run now runs are listed.

```typescript
client.cron.runs.list(options?: { user?: string; entry_id?: string; run_id?: string; key?: string; before?: string; limit?: number }): Promise<CronRunsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | No | query | Only runs of this user's jobs |
| `entry_id` | `string` | No | query | Only runs of this managed entry |
| `run_id` | `string` | No | query | Only the run with this id |
| `key` | `string` | No | query | Only the run started by the Run now request with this Idempotency-Key, and that request's receipt (`receipt`) |
| `before` | `string` | No | query | Only runs that started before this RFC 3339 time: pass the started_at of the last run received for the next page |
| `limit` | `number` | No | query | Runs to return, newest first (default 50, max 200) |

**Returns:** `CronRunsListResponse`

**CLI:** `hoody cron runs list`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
