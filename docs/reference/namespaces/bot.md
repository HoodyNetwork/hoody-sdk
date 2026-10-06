# `bot` — 17 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.bot`

```typescript
import * as bot from 'hoody-sdk/bot';
```

---

## `client.bot.kit` (3 methods)

### `getHealth`

**GET** `/api/v1/bot/health`

Nine-field kit health; unauthenticated by design.

```typescript
client.bot.kit.getHealth(): Promise<BotKitGetHealthResponse>
```

**Returns:** `BotKitGetHealthResponse`

**CLI:** `hoody bot health`

---

### `getManifest`

**GET** `/api/v1/bot/manifest`

The chat manifest this build is pinned to, as it was baked.

```typescript
client.bot.kit.getManifest(): Promise<BotKitGetManifestResponse>
```

**Returns:** `BotKitGetManifestResponse`

**CLI:** `hoody bot manifest get`

---

### `rotateKeys`

**POST** `/api/v1/bot/kit/keys/rotate`

Re-encrypt every sealed column under a new kit key.

```typescript
client.bot.kit.rotateKeys(options?: { force?: "true" | "false"; cache?: boolean | number }): Promise<BotKitRotateKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `force` | `"true" \| "false"` | No | query | Rotate even though a poller is running. Without it an active poller refuses the rotation. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BotKitRotateKeysResponse`

**CLI:** `hoody bot keys rotate`

---

## `client.bot.registrations` (14 methods)

### `create`

**POST** `/api/v1/bot/registrations`

Register a channel bot; the token arrives in the body and is stored encrypted.

```typescript
client.bot.registrations.create(data: BotRegistrationsCreateRequest): Promise<BotRegistrationsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BotRegistrationsCreateRequest` | Yes | body |  |

**Returns:** `BotRegistrationsCreateResponse`

**CLI:** `hoody bot create`

---

### `delete`

**DELETE** `/api/v1/bot/registrations/{registrationId}`

Delete a registration and its stored channel token.

```typescript
client.bot.registrations.delete(registrationId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody bot delete`

---

### `get`

**GET** `/api/v1/bot/registrations/{registrationId}`

Read one registration.

```typescript
client.bot.registrations.get(registrationId: string): Promise<BotRegistrationsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsGetResponse`

**CLI:** `hoody bot get`

---

### `getPolicy`

**GET** `/api/v1/bot/registrations/{registrationId}/policy`

Read a registration’s mode and allowlists.

```typescript
client.bot.registrations.getPolicy(registrationId: string): Promise<BotRegistrationsGetPolicyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsGetPolicyResponse`

**CLI:** `hoody bot policy get`

---

### `list`

**GET** `/api/v1/bot/registrations`

List the registrations owned by the calling account.

```typescript
client.bot.registrations.list(): Promise<BotRegistrationsListResponse>
```

**Returns:** `BotRegistrationsListResponse`

**CLI:** `hoody bot list`

---

### `listLogs`

**GET** `/api/v1/bot/registrations/{registrationId}/logs`

Read the redacted audit log of a registration, newest first.

```typescript
client.bot.registrations.listLogs(registrationId: string, options?: { actor?: string; since?: number; limit?: number; before_id?: number; cache?: boolean | number }): Promise<BotRegistrationsListLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |
| `actor` | `string` | No | query | Narrow the page to one chat user. Matched exactly against the stored `actor` value, which carries the channel prefix — for Telegram `telegram:&lt;user id&gt;`, not the bare id the revoke path takes. |
| `since` | `number` | No | query | Drop entries older than this epoch-millisecond timestamp. A filter on the page, not a cursor: paging continues past it. |
| `limit` | `number` | No | query | Page size; capped by the store at 500. The answer reports the size actually used. |
| `before_id` | `number` | No | query | The cursor: the `next_before_id` of the previous page. Omit for the newest page. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BotRegistrationsListLogsResponse`

**CLI:** `hoody bot logs list`

---

### `purgeLogs`

**DELETE** `/api/v1/bot/registrations/{registrationId}/logs`

Delete audit rows older than a cutoff, never inside the retention window.

```typescript
client.bot.registrations.purgeLogs(registrationId: string, options?: { older_than?: number; all?: "true" | "false"; cache?: boolean | number }): Promise<BotRegistrationsPurgeLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |
| `older_than` | `number` | No | query | Delete entries at or below this epoch-millisecond timestamp. Defaults to the 90-day retention boundary. |
| `all` | `"true" \| "false"` | No | query | Waive the 90-day retention floor. Without it a cutoff inside the retention window is refused, never clamped. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BotRegistrationsPurgeLogsResponse`

**CLI:** `hoody bot logs purge`

---

### `revokeAllTokens`

**POST** `/api/v1/bot/registrations/{registrationId}/tokens/revoke-all`

Revoke every chat user’s lineage for this registration.

```typescript
client.bot.registrations.revokeAllTokens(registrationId: string): Promise<BotRegistrationsRevokeAllTokensResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsRevokeAllTokensResponse`

**CLI:** `hoody bot tokens revoke`

---

### `revokeSession`

**POST** `/api/v1/bot/registrations/{registrationId}/sessions/{channelUserId}/revoke`

Revoke one chat user’s login: delete the leaf through the parent and forget it.

```typescript
client.bot.registrations.revokeSession(registrationId: string, channelUserId: string): Promise<BotRegistrationsRevokeSessionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |
| `channelUserId` | `string` | Yes | path | The channel's own id for the chat user (the Telegram user id), without a channel prefix. The audit log's `actor` column spells the same user differently — `telegram:&lt;user id&gt;` — so a value copied from there is not accepted here. |

**Returns:** `BotRegistrationsRevokeSessionResponse`

**CLI:** `hoody bot sessions revoke`

---

### `start`

**POST** `/api/v1/bot/registrations/{registrationId}/start`

Start long-polling for a registration.

```typescript
client.bot.registrations.start(registrationId: string): Promise<BotRegistrationsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsStartResponse`

**CLI:** `hoody bot start`

---

### `stop`

**POST** `/api/v1/bot/registrations/{registrationId}/stop`

Stop long-polling for a registration.

```typescript
client.bot.registrations.stop(registrationId: string): Promise<BotRegistrationsStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsStopResponse`

**CLI:** `hoody bot stop`

---

### `syncCommands`

**POST** `/api/v1/bot/registrations/{registrationId}/commands/sync`

Publish the registered commands to the channel and return the readback diff.

```typescript
client.bot.registrations.syncCommands(registrationId: string): Promise<BotRegistrationsSyncCommandsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |

**Returns:** `BotRegistrationsSyncCommandsResponse`

**CLI:** `hoody bot commands sync`

---

### `updatePolicy`

**PUT** `/api/v1/bot/registrations/{registrationId}/policy`

Set a registration’s mode and allowlists.

```typescript
client.bot.registrations.updatePolicy(registrationId: string, data: BotRegistrationsUpdatePolicyRequest): Promise<BotRegistrationsUpdatePolicyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |
| `data` | `BotRegistrationsUpdatePolicyRequest` | Yes | body |  |

**Returns:** `BotRegistrationsUpdatePolicyResponse`

**CLI:** `hoody bot policy update`

---

### `updateProfile`

**PUT** `/api/v1/bot/registrations/{registrationId}/profile`

Set the bot profile (name, descriptions, default admin rights) and publish it.

```typescript
client.bot.registrations.updateProfile(registrationId: string, data: BotRegistrationsUpdateProfileRequest): Promise<BotRegistrationsUpdateProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `registrationId` | `string` | Yes | path | Registration id returned by register or list. |
| `data` | `BotRegistrationsUpdateProfileRequest` | Yes | body |  |

**Returns:** `BotRegistrationsUpdateProfileResponse`

**CLI:** `hoody bot profile update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
