# `api` — 351 methods

**Version:** 1.0.1
**Accessor:** `client.api`

```typescript
import * as api from 'hoody-sdk/api';
```

---

## `client.api.abuseNotices` (3 methods)

### `get`

**GET** `/api/v1/abuse-notices/{id}`

Read one notice with every message

```typescript
client.api.abuseNotices.get(id: string): Promise<ApiAbuseNoticesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiAbuseNoticesGetResponse`

**CLI:** `hoody abusenotices get`

---

### `list`

**GET** `/api/v1/abuse-notices`

List notices Hoody sent you about your servers

```typescript
client.api.abuseNotices.list(options?: { page?: number; limit?: number }): Promise<ApiAbuseNoticesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |

**Returns:** `ApiAbuseNoticesListResponse`

**CLI:** `hoody abusenotices list`

---

### `reply`

**POST** `/api/v1/abuse-notices/{id}/messages`

Reply to a notice

```typescript
client.api.abuseNotices.reply(id: string, data: ApiAbuseNoticesReplyRequest): Promise<ApiAbuseNoticesReplyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiAbuseNoticesReplyRequest` | Yes | body |  |

**Returns:** `ApiAbuseNoticesReplyResponse`

**CLI:** `hoody abusenotices reply`

---

## `client.api.activity` (4 methods)

### `getStats`

**GET** `/api/v1/users/auth/activity/stats`

Get activity stats

```typescript
client.api.activity.getStats(): Promise<ApiActivityGetStatsResponse>
```

**Returns:** `ApiActivityGetStatsResponse`

**CLI:** `hoody activity stats`

---

### `list`

**GET** `/api/v1/users/auth/activity`

Get activity logs

```typescript
client.api.activity.list(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): Promise<ApiActivityListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `boolean` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `ApiActivityListResponse`

**CLI:** `hoody activity list`

---

### `listAll`

**GET** `/api/v1/users/auth/activity`

Get activity logs (collect all pages)

```typescript
client.api.activity.listAll(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `boolean` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/users/auth/activity`

Get activity logs (async iterator)

```typescript
client.api.activity.listIterator(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `boolean` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.api.ai` (2 methods)

### `getFreeUsage`

**GET** `/api/v1/users/me/free-ai-usage`

Get free AI usage for your servers

```typescript
client.api.ai.getFreeUsage(): Promise<ApiAiGetFreeUsageResponse>
```

**Returns:** `ApiAiGetFreeUsageResponse`

**CLI:** `hoody ai freeusage get`

---

### `listModels`

**GET** `/api/v1/ai/models`

List available AI models (Hoody catalog)

```typescript
client.api.ai.listModels(): Promise<ApiAiListModelsResponse>
```

**Returns:** `ApiAiListModelsResponse`

**CLI:** `hoody ai models list`

---

## `client.api.auth` (9 methods)

### `createIdentityClaim`

**POST** `/api/v1/users/auth/identity-claim`

Issue a fresh audience-bound identity claim

```typescript
client.api.auth.createIdentityClaim(data: ApiAuthCreateIdentityClaimRequest): Promise<ApiAuthCreateIdentityClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthCreateIdentityClaimRequest` | Yes | body |  |

**Returns:** `ApiAuthCreateIdentityClaimResponse`

**CLI:** `hoody auth identityclaims create`

---

### `getConfig`

**GET** `/api/v1/auth/config`

Get the public sign-in configuration

```typescript
client.api.auth.getConfig(): Promise<ApiAuthGetConfigResponse>
```

**Returns:** `ApiAuthGetConfigResponse`

**CLI:** `hoody auth config get`

---

### `login`

**POST** `/api/v1/users/auth/login`

Login with username and password

```typescript
client.api.auth.login(data: ApiAuthLoginRequest): Promise<ApiAuthLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthLoginRequest` | Yes | body |  |

**Returns:** `ApiAuthLoginResponse`

---

### `logoutAll`

**POST** `/api/v1/users/auth/logout`

Log out everywhere

```typescript
client.api.auth.logoutAll(): Promise<ApiAuthLogoutAllResponse>
```

**Returns:** `ApiAuthLogoutAllResponse`

---

### `recoverPassword`

**POST** `/api/v1/auth/forgot-password`

Request password reset

```typescript
client.api.auth.recoverPassword(data: ApiAuthRecoverPasswordRequest): Promise<ApiAuthRecoverPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthRecoverPasswordRequest` | Yes | body |  |

**Returns:** `ApiAuthRecoverPasswordResponse`

**CLI:** `hoody auth password recover`

---

### `refresh`

**POST** `/api/v1/users/auth/refresh`

Refresh access token

```typescript
client.api.auth.refresh(data: ApiAuthRefreshRequest): Promise<ApiAuthRefreshResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthRefreshRequest` | Yes | body |  |

**Returns:** `ApiAuthRefreshResponse`

**CLI:** `hoody auth refresh`

---

### `resetPassword`

**POST** `/api/v1/auth/reset-password`

Reset password

```typescript
client.api.auth.resetPassword(data: ApiAuthResetPasswordRequest): Promise<ApiAuthResetPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthResetPasswordRequest` | Yes | body |  |

**Returns:** `ApiAuthResetPasswordResponse`

**CLI:** `hoody auth password reset`

---

### `signup`

**POST** `/api/v1/auth/signup`

Sign up with email and password

```typescript
client.api.auth.signup(data: ApiAuthSignupRequest): Promise<ApiAuthSignupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthSignupRequest` | Yes | body |  |

**Returns:** `ApiAuthSignupResponse`

---

### `whoami`

**GET** `/api/v1/users/auth/me`

Get current user profile

```typescript
client.api.auth.whoami(): Promise<ApiAuthWhoamiResponse>
```

**Returns:** `ApiAuthWhoamiResponse`

**CLI:** `hoody auth whoami`

---

## `client.api.auth.device` (5 methods)

### `deny`

**POST** `/api/v1/auth/device/deny`

Refuse the device ('Don't authorize')

```typescript
client.api.auth.device.deny(data: ApiAuthDeviceDenyRequest): Promise<ApiAuthDeviceDenyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceDenyRequest` | Yes | body |  |

**Returns:** `ApiAuthDeviceDenyResponse`

---

### `login`

**POST** `/api/v1/auth/device/login`

Password sign-in for the device authorize step (cookie + ticket gated)

```typescript
client.api.auth.device.login(data: ApiAuthDeviceLoginRequest): Promise<ApiAuthDeviceLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceLoginRequest` | Yes | body |  |

**Returns:** `ApiAuthDeviceLoginResponse`

---

### `poll`

**POST** `/api/v1/auth/device/token`

Poll for device-flow tokens (RFC-8628-inspired)

```typescript
client.api.auth.device.poll(data: ApiAuthDevicePollRequest): Promise<ApiAuthDevicePollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDevicePollRequest` | Yes | body |  |

**Returns:** `ApiAuthDevicePollResponse`

**CLI:** `hoody auth device poll`

---

### `start`

**POST** `/api/v1/auth/device/code`

Start a device authorization flow (RFC-8628-inspired)

```typescript
client.api.auth.device.start(data: ApiAuthDeviceStartRequest): Promise<ApiAuthDeviceStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceStartRequest` | Yes | body |  |

**Returns:** `ApiAuthDeviceStartResponse`

**CLI:** `hoody auth device start`

---

### `verifyCode`

**POST** `/api/v1/auth/device/verify_code`

Confirm a device user_code (verification page)

```typescript
client.api.auth.device.verifyCode(data: ApiAuthDeviceVerifyCodeRequest): Promise<ApiAuthDeviceVerifyCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceVerifyCodeRequest` | Yes | body |  |

**Returns:** `ApiAuthDeviceVerifyCodeResponse`

---

## `client.api.auth.email` (6 methods)

### `cancelChange`

**DELETE** `/api/v1/users/me/email-change`

Cancel a pending email address change

```typescript
client.api.auth.email.cancelChange(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth email change cancel`

---

### `confirmChange`

**POST** `/api/v1/auth/email-change/confirm`

Confirm an email address change

```typescript
client.api.auth.email.confirmChange(data: ApiAuthEmailConfirmChangeRequest): Promise<ApiAuthEmailConfirmChangeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthEmailConfirmChangeRequest` | Yes | body |  |

**Returns:** `ApiAuthEmailConfirmChangeResponse`

**CLI:** `hoody auth email change confirm`

---

### `sendVerification`

**POST** `/api/v1/auth/resend-verification`

Resend verification email

```typescript
client.api.auth.email.sendVerification(data: ApiAuthEmailSendVerificationRequest): Promise<ApiAuthEmailSendVerificationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthEmailSendVerificationRequest` | Yes | body |  |

**Returns:** `ApiAuthEmailSendVerificationResponse`

**CLI:** `hoody auth email verification send`

---

### `startChange`

**POST** `/api/v1/users/me/email-change`

Request an email address change

```typescript
client.api.auth.email.startChange(data: ApiAuthEmailStartChangeRequest): Promise<ApiAuthEmailStartChangeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthEmailStartChangeRequest` | Yes | body |  |

**Returns:** `ApiAuthEmailStartChangeResponse`

**CLI:** `hoody auth email change start`

---

### `undoChange`

**POST** `/api/v1/auth/email-change/revert`

Undo an email address change

```typescript
client.api.auth.email.undoChange(data: ApiAuthEmailUndoChangeRequest): Promise<ApiAuthEmailUndoChangeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthEmailUndoChangeRequest` | Yes | body |  |

**Returns:** `ApiAuthEmailUndoChangeResponse`

**CLI:** `hoody auth email change undo`

---

### `verify`

**POST** `/api/v1/auth/verify-email`

Verify email address

```typescript
client.api.auth.email.verify(data: ApiAuthEmailVerifyRequest): Promise<ApiAuthEmailVerifyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthEmailVerifyRequest` | Yes | body |  |

**Returns:** `ApiAuthEmailVerifyResponse`

**CLI:** `hoody auth email verify`

---

## `client.api.auth.oauth` (4 methods)

### `authorize`

**POST** `/api/v1/auth/authorize`

Begin a PKCE OAuth authorization

```typescript
client.api.auth.oauth.authorize(data: ApiAuthOauthAuthorizeRequest): Promise<ApiAuthOauthAuthorizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthAuthorizeRequest` | Yes | body |  |

**Returns:** `ApiAuthOauthAuthorizeResponse`

**CLI:** `hoody auth oauth authorize`

---

### `cancelIntent`

**POST** `/api/v1/auth/intent/cancel`

Cancel a pending OAuth intent or 2FA temp_token

```typescript
client.api.auth.oauth.cancelIntent(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth intents cancel`

---

### `exchange`

**POST** `/api/v1/auth/exchange`

Exchange a PKCE authorization code for tokens

```typescript
client.api.auth.oauth.exchange(data: ApiAuthOauthExchangeRequest): Promise<ApiAuthOauthExchangeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthExchangeRequest` | Yes | body |  |

**Returns:** `ApiAuthOauthExchangeResponse`

**CLI:** `hoody auth oauth exchange`

---

### `startLaunch`

**POST** `/api/v1/auth/launch/initiate`

Initiate OAuth popup-handoff launch

```typescript
client.api.auth.oauth.startLaunch(data: ApiAuthOauthStartLaunchRequest): Promise<ApiAuthOauthStartLaunchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthStartLaunchRequest` | Yes | body |  |

**Returns:** `ApiAuthOauthStartLaunchResponse`

---

## `client.api.auth.sessions` (5 methods)

### `list`

**GET** `/api/v1/users/auth/sessions`

List your sign-in sessions

```typescript
client.api.auth.sessions.list(options?: { state?: "active" | "ended"; limit?: number; cursor?: string }): Promise<ApiAuthSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `state` | `"active" \| "ended"` | No | query | Open sessions, or sessions ended in the last 180 days |
| `limit` | `number` | No | query | Sessions per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `ApiAuthSessionsListResponse`

**CLI:** `hoody auth sessions list`

---

### `listAll`

**GET** `/api/v1/users/auth/sessions`

List your sign-in sessions (collect all pages)

```typescript
client.api.auth.sessions.listAll(options?: { state?: "active" | "ended"; limit?: number; cursor?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `state` | `"active" \| "ended"` | No | query | Open sessions, or sessions ended in the last 180 days |
| `limit` | `number` | No | query | Sessions per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/users/auth/sessions`

List your sign-in sessions (async iterator)

```typescript
client.api.auth.sessions.listIterator(options?: { state?: "active" | "ended"; limit?: number; cursor?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `state` | `"active" \| "ended"` | No | query | Open sessions, or sessions ended in the last 180 days |
| `limit` | `number` | No | query | Sessions per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `revoke`

**DELETE** `/api/v1/users/auth/sessions/{id}`

End one of your sign-in sessions

```typescript
client.api.auth.sessions.revoke(id: string): Promise<ApiAuthSessionsRevokeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Session id, or `current` |

**Returns:** `ApiAuthSessionsRevokeResponse`

**CLI:** `hoody auth sessions revoke`

---

### `revokeOthers`

**POST** `/api/v1/users/auth/sessions/revoke-others`

End all your other sign-in sessions

```typescript
client.api.auth.sessions.revokeOthers(): Promise<ApiAuthSessionsRevokeOthersResponse>
```

**Returns:** `ApiAuthSessionsRevokeOthersResponse`

**CLI:** `hoody auth sessions revoke`

---

## `client.api.auth.tokens` (14 methods)

### `addRealm`

**POST** `/api/v1/auth/tokens/{id}/add-realm`

Add realm to auth token

```typescript
client.api.auth.tokens.addRealm(id: string, data: ApiAuthTokensAddRealmRequest): Promise<ApiAuthTokensAddRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensAddRealmRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensAddRealmResponse`

**CLI:** `hoody auth tokens realms add`

---

### `copy`

**POST** `/api/v1/auth/tokens/{id}/copy`

Copy auth token

```typescript
client.api.auth.tokens.copy(id: string, data: ApiAuthTokensCopyRequest): Promise<ApiAuthTokensCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |
| `data` | `ApiAuthTokensCopyRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensCopyResponse`

**CLI:** `hoody auth tokens copy`

---

### `create`

**POST** `/api/v1/auth/tokens`

Create a new auth token

```typescript
client.api.auth.tokens.create(data: ApiAuthTokensCreateRequest): Promise<ApiAuthTokensCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensCreateRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensCreateResponse`

**CLI:** `hoody auth tokens create`

---

### `delete`

**DELETE** `/api/v1/auth/tokens/{id}`

Delete auth token

```typescript
client.api.auth.tokens.delete(id: string): Promise<ApiAuthTokensDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |

**Returns:** `ApiAuthTokensDeleteResponse`

**CLI:** `hoody auth tokens delete`

---

### `get`

**GET** `/api/v1/auth/tokens/{id}`

Get auth token by ID

```typescript
client.api.auth.tokens.get(id: string): Promise<ApiAuthTokensGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |

**Returns:** `ApiAuthTokensGetResponse`

**CLI:** `hoody auth tokens get`

---

### `getCurrent`

**GET** `/api/v1/auth/tokens/me`

Get current auth token details

```typescript
client.api.auth.tokens.getCurrent(): Promise<ApiAuthTokensGetCurrentResponse>
```

**Returns:** `ApiAuthTokensGetCurrentResponse`

**CLI:** `hoody auth tokens get`

---

### `getPublicProfile`

**GET** `/api/v1/auth/tokens/public-profiles/{public_key}`

Get auth token public profile by public key

```typescript
client.api.auth.tokens.getPublicProfile(public_key: string): Promise<ApiAuthTokensGetPublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `public_key` | `string` | Yes | path | ED25519 public key to resolve |

**Returns:** `ApiAuthTokensGetPublicProfileResponse`

**CLI:** `hoody auth tokens publicprofiles get`

---

### `list`

**GET** `/api/v1/auth/tokens`

List auth tokens

```typescript
client.api.auth.tokens.list(): Promise<ApiAuthTokensListResponse>
```

**Returns:** `ApiAuthTokensListResponse`

**CLI:** `hoody auth tokens list`

---

### `listAll`

**GET** `/api/v1/auth/tokens`

List auth tokens (collect all pages)

```typescript
client.api.auth.tokens.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/auth/tokens`

List auth tokens (async iterator)

```typescript
client.api.auth.tokens.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listTemplates`

**GET** `/api/v1/auth/tokens/templates`

List permission templates

```typescript
client.api.auth.tokens.listTemplates(): Promise<ApiAuthTokensListTemplatesResponse>
```

**Returns:** `ApiAuthTokensListTemplatesResponse`

**CLI:** `hoody auth tokens templates list`

---

### `removeRealm`

**POST** `/api/v1/auth/tokens/{id}/remove-realm`

Remove realm from auth token

```typescript
client.api.auth.tokens.removeRealm(id: string, data: ApiAuthTokensRemoveRealmRequest): Promise<ApiAuthTokensRemoveRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensRemoveRealmRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensRemoveRealmResponse`

**CLI:** `hoody auth tokens realms remove`

---

### `update`

**PUT** `/api/v1/auth/tokens/{id}`

Update auth token

```typescript
client.api.auth.tokens.update(id: string, data: ApiAuthTokensUpdateRequest): Promise<ApiAuthTokensUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token to update |
| `data` | `ApiAuthTokensUpdateRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensUpdateResponse`

**CLI:** `hoody auth tokens update`

---

### `updatePublicProfile`

**PUT** `/api/v1/auth/tokens/me/public-profile`

Update current auth token public profile

```typescript
client.api.auth.tokens.updatePublicProfile(data: ApiAuthTokensUpdatePublicProfileRequest): Promise<ApiAuthTokensUpdatePublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensUpdatePublicProfileRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensUpdatePublicProfileResponse`

**CLI:** `hoody auth tokens publicprofiles update`

---

## `client.api.auth.twoFactor` (9 methods)

### `confirmSetup`

**POST** `/api/v1/users/auth/2fa/verify-setup`

Complete 2FA Setup

```typescript
client.api.auth.twoFactor.confirmSetup(data: ApiAuthTwoFactorConfirmSetupRequest): Promise<ApiAuthTwoFactorConfirmSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorConfirmSetupRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorConfirmSetupResponse`

**CLI:** `hoody auth 2fa setup confirm`

---

### `disable`

**DELETE** `/api/v1/users/auth/2fa`

Disable 2FA

```typescript
client.api.auth.twoFactor.disable(data: ApiAuthTwoFactorDisableRequest): Promise<ApiAuthTwoFactorDisableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorDisableRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorDisableResponse`

**CLI:** `hoody auth 2fa disable`

---

### `disableTokenGate`

**PUT** `/api/v1/users/auth/2fa/token-gate`

Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.disableTokenGate(data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody auth 2fa tokengate disable`

---

### `enableTokenGate`

**PUT** `/api/v1/users/auth/2fa/token-gate`

Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.enableTokenGate(data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody auth 2fa tokengate enable`

---

### `getStatus`

**GET** `/api/v1/users/auth/2fa/status`

Get 2FA Status

```typescript
client.api.auth.twoFactor.getStatus(): Promise<ApiAuthTwoFactorGetStatusResponse>
```

**Returns:** `ApiAuthTwoFactorGetStatusResponse`

**CLI:** `hoody auth 2fa status`

---

### `rotateBackupCodes`

**POST** `/api/v1/users/auth/2fa/backup-codes/regenerate`

Regenerate Backup Codes

```typescript
client.api.auth.twoFactor.rotateBackupCodes(data: ApiAuthTwoFactorRotateBackupCodesRequest): Promise<ApiAuthTwoFactorRotateBackupCodesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorRotateBackupCodesRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorRotateBackupCodesResponse`

**CLI:** `hoody auth 2fa backupcodes rotate`

---

### `startSetup`

**POST** `/api/v1/users/auth/2fa/setup`

Initialize 2FA Setup

```typescript
client.api.auth.twoFactor.startSetup(data: ApiAuthTwoFactorStartSetupRequest): Promise<ApiAuthTwoFactorStartSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorStartSetupRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorStartSetupResponse`

**CLI:** `hoody auth 2fa setup start`

---

### `undoEnrollment`

**POST** `/api/v1/auth/two-factor/undo`

Undo a two-factor enrollment ("this was not me")

```typescript
client.api.auth.twoFactor.undoEnrollment(data: ApiAuthTwoFactorUndoEnrollmentRequest): Promise<ApiAuthTwoFactorUndoEnrollmentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorUndoEnrollmentRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorUndoEnrollmentResponse`

**CLI:** `hoody auth 2fa enrollment undo`

---

### `verify`

**POST** `/api/v1/users/auth/2fa/verify`

Verify 2FA Code During Login

```typescript
client.api.auth.twoFactor.verify(data: ApiAuthTwoFactorVerifyRequest): Promise<ApiAuthTwoFactorVerifyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorVerifyRequest` | Yes | body |  |

**Returns:** `ApiAuthTwoFactorVerifyResponse`

**CLI:** `hoody auth 2fa verify`

---

## `client.api.botUrls` (10 methods)

### `create`

**POST** `/api/v1/bot-urls`

Create a Bot URL

```typescript
client.api.botUrls.create(data: ApiBotUrlsCreateRequest): Promise<ApiBotUrlsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiBotUrlsCreateRequest` | Yes | body |  |

**Returns:** `ApiBotUrlsCreateResponse`

**CLI:** `hoody boturls create`

---

### `delete`

**DELETE** `/api/v1/bot-urls/{id}`

Delete a Bot URL

```typescript
client.api.botUrls.delete(id: string): Promise<ApiBotUrlsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |

**Returns:** `ApiBotUrlsDeleteResponse`

**CLI:** `hoody boturls delete`

---

### `get`

**GET** `/api/v1/bot-urls/{id}`

Get a Bot URL

```typescript
client.api.botUrls.get(id: string): Promise<ApiBotUrlsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |

**Returns:** `ApiBotUrlsGetResponse`

**CLI:** `hoody boturls get`

---

### `list`

**GET** `/api/v1/bot-urls`

List your Bot URLs

```typescript
client.api.botUrls.list(options?: { project_id?: string; computer_id?: string; limit?: number; cursor?: string }): Promise<ApiBotUrlsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query |  |
| `computer_id` | `string` | No | query |  |
| `limit` | `number` | No | query | Bot URLs per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `ApiBotUrlsListResponse`

**CLI:** `hoody boturls list`

---

### `listAll`

**GET** `/api/v1/bot-urls`

List your Bot URLs (collect all pages)

```typescript
client.api.botUrls.listAll(options?: { project_id?: string; computer_id?: string; limit?: number; cursor?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query |  |
| `computer_id` | `string` | No | query |  |
| `limit` | `number` | No | query | Bot URLs per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/bot-urls`

List your Bot URLs (async iterator)

```typescript
client.api.botUrls.listIterator(options?: { project_id?: string; computer_id?: string; limit?: number; cursor?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query |  |
| `computer_id` | `string` | No | query |  |
| `limit` | `number` | No | query | Bot URLs per page |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `panic`

**POST** `/api/v1/bot-urls/{id}/panic`

Panic: turn a Bot URL off and revoke every key

```typescript
client.api.botUrls.panic(id: string): Promise<ApiBotUrlsPanicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |

**Returns:** `ApiBotUrlsPanicResponse`

**CLI:** `hoody boturls panic`

---

### `repoint`

**POST** `/api/v1/bot-urls/{id}/repoint`

Point a Bot URL at another computer

```typescript
client.api.botUrls.repoint(id: string, data: ApiBotUrlsRepointRequest): Promise<ApiBotUrlsRepointResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `data` | `ApiBotUrlsRepointRequest` | Yes | body |  |

**Returns:** `ApiBotUrlsRepointResponse`

**CLI:** `hoody boturls repoint`

---

### `suggestLabel`

**GET** `/api/v1/bot-urls/suggest-label`

Suggest a free Bot name

```typescript
client.api.botUrls.suggestLabel(): Promise<ApiBotUrlsSuggestLabelResponse>
```

**Returns:** `ApiBotUrlsSuggestLabelResponse`

**CLI:** `hoody boturls label suggest`

---

### `update`

**PATCH** `/api/v1/bot-urls/{id}`

Change Bot URL settings

```typescript
client.api.botUrls.update(id: string, data: ApiBotUrlsUpdateRequest): Promise<ApiBotUrlsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `data` | `ApiBotUrlsUpdateRequest` | Yes | body |  |

**Returns:** `ApiBotUrlsUpdateResponse`

**CLI:** `hoody boturls update`

---

## `client.api.botUrls.keys` (5 methods)

### `create`

**POST** `/api/v1/bot-urls/{id}/keys`

Create a key

```typescript
client.api.botUrls.keys.create(id: string, data: ApiBotUrlsKeysCreateRequest): Promise<ApiBotUrlsKeysCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `data` | `ApiBotUrlsKeysCreateRequest` | Yes | body |  |

**Returns:** `ApiBotUrlsKeysCreateResponse`

**CLI:** `hoody boturls keys create`

---

### `revoke`

**DELETE** `/api/v1/bot-urls/{id}/keys/{keyId}`

Revoke a key

```typescript
client.api.botUrls.keys.revoke(id: string, keyId: string): Promise<ApiBotUrlsKeysRevokeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `keyId` | `string` | Yes | path | Key id: `bk_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_KEY_NOT_FOUND. |

**Returns:** `ApiBotUrlsKeysRevokeResponse`

**CLI:** `hoody boturls keys revoke`

---

### `revokeAll`

**POST** `/api/v1/bot-urls/{id}/keys/revoke-all`

Revoke every key

```typescript
client.api.botUrls.keys.revokeAll(id: string): Promise<ApiBotUrlsKeysRevokeAllResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |

**Returns:** `ApiBotUrlsKeysRevokeAllResponse`

**CLI:** `hoody boturls keys revoke`

---

### `rotate`

**POST** `/api/v1/bot-urls/{id}/keys/{keyId}/rotate`

Rotate a key

```typescript
client.api.botUrls.keys.rotate(id: string, keyId: string, data?: ApiBotUrlsKeysRotateRequest): Promise<ApiBotUrlsKeysRotateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `keyId` | `string` | Yes | path | Key id: `bk_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_KEY_NOT_FOUND. |
| `data` | `ApiBotUrlsKeysRotateRequest` | No | body |  |

**Returns:** `ApiBotUrlsKeysRotateResponse`

**CLI:** `hoody boturls keys rotate`

---

### `update`

**PATCH** `/api/v1/bot-urls/{id}/keys/{keyId}`

Change a key

```typescript
client.api.botUrls.keys.update(id: string, keyId: string, data: ApiBotUrlsKeysUpdateRequest): Promise<ApiBotUrlsKeysUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Bot URL id: `bu_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_URL_NOT_FOUND. |
| `keyId` | `string` | Yes | path | Key id: `bk_` and 24 lowercase hexadecimal characters. A malformed id answers 404 BOT_KEY_NOT_FOUND. |
| `data` | `ApiBotUrlsKeysUpdateRequest` | Yes | body |  |

**Returns:** `ApiBotUrlsKeysUpdateResponse`

**CLI:** `hoody boturls keys update`

---

## `client.api.computers` (22 methods)

### `copy`

**POST** `/api/v1/computers/{id}/copy`

Copy a computer

```typescript
client.api.computers.copy(id: string, data: ApiComputersCopyRequest): Promise<ApiComputersCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the source computer to copy |
| `data` | `ApiComputersCopyRequest` | Yes | body |  |

**Returns:** `ApiComputersCopyResponse`

**CLI:** `hoody computers copy`

---

### `create`

**POST** `/api/v1/projects/{id}/computers`

Create a new computer

```typescript
client.api.computers.create(id: string, data: ApiComputersCreateRequest, options?: { idempotencyKey?: string }): Promise<ApiComputersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiComputersCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Makes the create safe to retry. 1 to 128 printable characters, for example a UUID; use a new key for each new computer. A retry with the same key and the same body gets the first answer; the same key with a different body is refused with 422 IDEMPOTENCY_KEY_REUSED. |

**Returns:** `ApiComputersCreateResponse`

**CLI:** `hoody computers create`

---

### `createClaim`

**POST** `/api/v1/computers/{id}/authorize`

Authorize Computer Access

```typescript
client.api.computers.createClaim(id: string): Promise<ApiComputersCreateClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID (24-char hex) |

**Returns:** `ApiComputersCreateClaimResponse`

**CLI:** `hoody computers claims create`

---

### `delete`

**DELETE** `/api/v1/computers/{id}`

Delete a computer

```typescript
client.api.computers.delete(id: string): Promise<ApiComputersDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to delete |

**Returns:** `ApiComputersDeleteResponse`

**CLI:** `hoody computers delete`

---

### `disableKvm`

**PUT** `/api/v1/computers/{id}/kvm`

Enable or disable /dev/kvm (run VMs in the computer)

```typescript
client.api.computers.disableKvm(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer |

**Returns:** `any`

**CLI:** `hoody computers kvm disable`

---

### `enableKvm`

**PUT** `/api/v1/computers/{id}/kvm`

Enable or disable /dev/kvm (run VMs in the computer)

```typescript
client.api.computers.enableKvm(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer |

**Returns:** `any`

**CLI:** `hoody computers kvm enable`

---

### `get`

**GET** `/api/v1/computers/{id}`

Get a computer by ID

```typescript
client.api.computers.get(id: string, options?: { runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean }): Promise<ApiComputersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to retrieve |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for this computer. When true, adds a proxy_domains array to the computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |

**Returns:** `ApiComputersGetResponse`

**CLI:** `hoody computers get`

---

### `getStats`

**GET** `/api/v1/computers/{id}/stats`

Get computer resource statistics

```typescript
client.api.computers.getStats(id: string): Promise<ApiComputersGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer |

**Returns:** `ApiComputersGetStatsResponse`

**CLI:** `hoody computers stats`

---

### `list`

**GET** `/api/v1/computers/`

Get all computers

```typescript
client.api.computers.list(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): Promise<ApiComputersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of computers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort computers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns computers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `ApiComputersListResponse`

**CLI:** `hoody computers list`

---

### `listAll`

**GET** `/api/v1/computers/`

Get all computers (collect all pages)

```typescript
client.api.computers.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of computers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort computers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns computers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `unknown[]`

---

### `listByProject`

**GET** `/api/v1/projects/{id}/computers`

Get all computers for a project

```typescript
client.api.computers.listByProject(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): Promise<ApiComputersListByProjectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `ApiComputersListByProjectResponse`

---

### `listByProjectAll`

**GET** `/api/v1/projects/{id}/computers`

Get all computers for a project (collect all pages)

```typescript
client.api.computers.listByProjectAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `unknown[]`

---

### `listByProjectIterator`

**GET** `/api/v1/projects/{id}/computers`

Get all computers for a project (async iterator)

```typescript
client.api.computers.listByProjectIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/computers/`

Get all computers (async iterator)

```typescript
client.api.computers.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of computers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort computers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns computers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each computer. When true, adds a proxy_domains array to each computer object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (computer-level proxy_permissions and parent-project-level project_proxy_permissions) for each computer. Returns proxy authentication group configuration including credentials. Request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include computers that have expired due to server termination. By default, expired computers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include computers currently being deleted. By default, deleting computers are excluded from results. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listStatusHistory`

**GET** `/api/v1/computers/{id}/status-logs`

Get status logs for a computer

```typescript
client.api.computers.listStatusHistory(id: string, options?: { page?: number; limit?: number; sort_by?: "transition_time" | "created_at" | "to_status" | "from_status"; sort_order?: "asc" | "desc" }): Promise<ApiComputersListStatusHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"transition_time" \| "created_at" \| "to_status" \| "from_status"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiComputersListStatusHistoryResponse`

**CLI:** `hoody computers statushistory list`

---

### `pause`

**POST** `/api/v1/computers/{id}/{operation}`

Manage computer

```typescript
client.api.computers.pause(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody computers pause`

---

### `restart`

**POST** `/api/v1/computers/{id}/{operation}`

Manage computer

```typescript
client.api.computers.restart(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody computers restart`

---

### `resume`

**POST** `/api/v1/computers/{id}/{operation}`

Manage computer

```typescript
client.api.computers.resume(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody computers resume`

---

### `start`

**POST** `/api/v1/computers/{id}/{operation}`

Manage computer

```typescript
client.api.computers.start(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody computers start`

---

### `stop`

**POST** `/api/v1/computers/{id}/{operation}`

Manage computer

```typescript
client.api.computers.stop(id: string, data?: object, options?: { force?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to manage |
| `data` | `object` | No | body |  |
| `force` | `boolean` | No | option | Kill the computer without a graceful shutdown (the force-stop operation). |

**Returns:** `any`

**CLI:** `hoody computers stop`

---

### `sync`

**POST** `/api/v1/computers/{id}/sync`

Sync a copied computer with its source

```typescript
client.api.computers.sync(id: string): Promise<ApiComputersSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to sync (must have been created via copy) |

**Returns:** `ApiComputersSyncResponse`

**CLI:** `hoody computers sync`

---

### `update`

**PUT** `/api/v1/computers/{id}`

Update a computer

```typescript
client.api.computers.update(id: string, data: ApiComputersUpdateRequest, options?: { ifMatch?: string }): Promise<ApiComputersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to update |
| `data` | `ApiComputersUpdateRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Save only over the settings you read: the ETag from an earlier GET or PUT of this computer. If its editable settings now differ from the ones that tag names, the answer is 412 PRECONDITION_FAILED and nothing is saved. Without it the update is unconditional. |

**Returns:** `ApiComputersUpdateResponse`

**CLI:** `hoody computers update`

---

## `client.api.computers.env` (4 methods)

### `delete`

**DELETE** `/api/v1/computers/{id}/env/{key}`

Delete a single environment variable

```typescript
client.api.computers.env.delete(id: string, key: string): Promise<ApiComputersEnvDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `key` | `string` | Yes | path | Environment variable key |

**Returns:** `ApiComputersEnvDeleteResponse`

**CLI:** `hoody computers env delete`

---

### `list`

**GET** `/api/v1/computers/{id}/env`

List computer environment variables

```typescript
client.api.computers.env.list(id: string): Promise<ApiComputersEnvListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersEnvListResponse`

**CLI:** `hoody computers env list`

---

### `set`

**PUT** `/api/v1/computers/{id}/env/{key}`

Set a single environment variable

```typescript
client.api.computers.env.set(id: string, key: string, data: ApiComputersEnvSetRequest): Promise<ApiComputersEnvSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `key` | `string` | Yes | path | Environment variable key |
| `data` | `ApiComputersEnvSetRequest` | Yes | body |  |

**Returns:** `ApiComputersEnvSetResponse`

**CLI:** `hoody computers env set`

---

### `update`

**PUT** `/api/v1/computers/{id}/env`

Bulk set computer environment variables

```typescript
client.api.computers.env.update(id: string, data: ApiComputersEnvUpdateRequest): Promise<ApiComputersEnvUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiComputersEnvUpdateRequest` | Yes | body |  |

**Returns:** `ApiComputersEnvUpdateResponse`

**CLI:** `hoody computers env update`

---

## `client.api.computers.proxy` (28 methods)

### `clearGroupPermissions`

**DELETE** `/api/v1/computers/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a computer group

```typescript
client.api.computers.proxy.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string }): Promise<ApiComputersProxyClearGroupPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxyClearGroupPermissionsResponse`

**CLI:** `hoody computers proxy groups permissions clear`

---

### `clearHooks`

**DELETE** `/api/v1/computers/{id}/proxy/hooks/{service}`

Clear all hooks for a service

```typescript
client.api.computers.proxy.clearHooks(id: string, service: string, options: { ifMatch: string }): Promise<ApiComputersProxyClearHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxyClearHooksResponse`

**CLI:** `hoody computers proxy hooks clear`

---

### `createHook`

**POST** `/api/v1/computers/{id}/proxy/hooks/{service}`

Append or insert a new hook

```typescript
client.api.computers.proxy.createHook(id: string, service: string, data: ApiComputersProxyCreateHookRequest, options: { ifMatch: string }): Promise<ApiComputersProxyCreateHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `data` | `ApiComputersProxyCreateHookRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxyCreateHookResponse`

**CLI:** `hoody computers proxy hooks create`

---

### `deleteGroup`

**DELETE** `/api/v1/computers/{id}/proxy/permissions/groups/{groupName}`

Remove computer authentication group

```typescript
client.api.computers.proxy.deleteGroup(id: string, groupName: string, options: { ifMatch: string }): Promise<ApiComputersProxyDeleteGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxyDeleteGroupResponse`

**CLI:** `hoody computers proxy groups delete`

---

### `deleteGroupPermission`

**DELETE** `/api/v1/computers/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a computer group

```typescript
client.api.computers.proxy.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string }): Promise<ApiComputersProxyDeleteGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxyDeleteGroupPermissionResponse`

**CLI:** `hoody computers proxy groups permissions delete`

---

### `deleteHook`

**DELETE** `/api/v1/computers/{id}/proxy/hooks/{service}/{hookId}`

Remove a hook

```typescript
client.api.computers.proxy.deleteHook(id: string, service: string, hookId: string, options: { ifMatch: string }): Promise<ApiComputersProxyDeleteHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxyDeleteHookResponse`

**CLI:** `hoody computers proxy hooks delete`

---

### `deletePermissions`

**DELETE** `/api/v1/computers/{id}/proxy/permissions`

Delete computer proxy permissions

```typescript
client.api.computers.proxy.deletePermissions(id: string, options: { ifMatch: string }): Promise<ApiComputersProxyDeletePermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxyDeletePermissionsResponse`

**CLI:** `hoody computers proxy permissions delete`

---

### `disable`

**PATCH** `/api/v1/computers/{id}/proxy/permissions/state`

Update computer proxy enable state

```typescript
client.api.computers.proxy.disable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody computers proxy disable`

---

### `enable`

**PATCH** `/api/v1/computers/{id}/proxy/permissions/state`

Update computer proxy enable state

```typescript
client.api.computers.proxy.enable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody computers proxy enable`

---

### `getHook`

**GET** `/api/v1/computers/{id}/proxy/hooks/{service}/{hookId}`

Get a single hook by id

```typescript
client.api.computers.proxy.getHook(id: string, service: string, hookId: string): Promise<ApiComputersProxyGetHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |

**Returns:** `ApiComputersProxyGetHookResponse`

**CLI:** `hoody computers proxy hooks get`

---

### `getPermissions`

**GET** `/api/v1/computers/{id}/proxy/permissions`

Get computer proxy permissions

```typescript
client.api.computers.proxy.getPermissions(id: string): Promise<ApiComputersProxyGetPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersProxyGetPermissionsResponse`

**CLI:** `hoody computers proxy permissions get`

---

### `getService`

**GET** `/api/v1/computers/{id}/proxy/services/{service}`

Get merged proxy view for a service

```typescript
client.api.computers.proxy.getService(id: string, service: string): Promise<ApiComputersProxyGetServiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Service name |

**Returns:** `ApiComputersProxyGetServiceResponse`

**CLI:** `hoody computers proxy services get`

---

### `getSettings`

**GET** `/api/v1/computers/{id}/proxy/settings`

Get computer proxy root settings

```typescript
client.api.computers.proxy.getSettings(id: string): Promise<ApiComputersProxyGetSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersProxyGetSettingsResponse`

**CLI:** `hoody computers proxy settings get`

---

### `getUsage`

**GET** `/api/v1/computers/{id}/proxy-usage`

Get proxied-usage documents for a computer

```typescript
client.api.computers.proxy.getUsage(id: string, options: { from: string; to: string }): Promise<ApiComputersProxyGetUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer id |
| `from` | `string` | Yes | query | First month, inclusive (YYYY-MM), from 2020-01. |
| `to` | `string` | Yes | query | Last month, inclusive (YYYY-MM), up to 2099-12 and not before `from`. At most 12 months. |

**Returns:** `ApiComputersProxyGetUsageResponse`

**CLI:** `hoody computers proxy usage get`

---

### `listGroups`

**GET** `/api/v1/computers/{id}/proxy/groups`

List computer proxy groups

```typescript
client.api.computers.proxy.listGroups(id: string): Promise<ApiComputersProxyListGroupsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersProxyListGroupsResponse`

**CLI:** `hoody computers proxy groups list`

---

### `listHooks`

**GET** `/api/v1/computers/{id}/proxy/hooks`

List all proxy hooks for a computer

```typescript
client.api.computers.proxy.listHooks(id: string): Promise<ApiComputersProxyListHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersProxyListHooksResponse`

**CLI:** `hoody computers proxy hooks list`

---

### `listHooksByService`

**GET** `/api/v1/computers/{id}/proxy/hooks/{service}`

List hooks for a specific service

```typescript
client.api.computers.proxy.listHooksByService(id: string, service: string): Promise<ApiComputersProxyListHooksByServiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |

**Returns:** `ApiComputersProxyListHooksByServiceResponse`

**CLI:** `hoody computers proxy hooks list`

---

### `listServices`

**GET** `/api/v1/computers/{id}/proxy/services`

List services referenced in proxy config

```typescript
client.api.computers.proxy.listServices(id: string): Promise<ApiComputersProxyListServicesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiComputersProxyListServicesResponse`

**CLI:** `hoody computers proxy services list`

---

### `moveHook`

**PATCH** `/api/v1/computers/{id}/proxy/hooks/{service}/{hookId}/position`

Move a hook to a new position

```typescript
client.api.computers.proxy.moveHook(id: string, service: string, hookId: string, data: ApiComputersProxyMoveHookRequest, options: { ifMatch: string }): Promise<ApiComputersProxyMoveHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `ApiComputersProxyMoveHookRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxyMoveHookResponse`

**CLI:** `hoody computers proxy hooks move`

---

### `setDefault`

**PATCH** `/api/v1/computers/{id}/proxy/permissions/default`

Update computer default proxy permission policy

```typescript
client.api.computers.proxy.setDefault(id: string, data: ApiComputersProxySetDefaultRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiComputersProxySetDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetDefaultResponse`

**CLI:** `hoody computers proxy default set`

---

### `setGroupPermission`

**PUT** `/api/v1/computers/{id}/proxy/permissions/permissions/{groupName}`

Set computer group program permission

```typescript
client.api.computers.proxy.setGroupPermission(id: string, groupName: string, data: ApiComputersProxySetGroupPermissionRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetGroupPermissionRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetGroupPermissionResponse`

**CLI:** `hoody computers proxy groups permissions set`

---

### `setHook`

**PUT** `/api/v1/computers/{id}/proxy/hooks/{service}/{hookId}`

Replace a hook in place

```typescript
client.api.computers.proxy.setHook(id: string, service: string, hookId: string, data: ApiComputersProxySetHookRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `service` | `string` | Yes | path | Canonical name of the computer program the hook applies to. Every program takes hooks except logs, egress and cdp, which answer 404. Adding a hook under another name, or under an alias of a program name, is refused with 422; the message lists the names that take hooks. |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `ApiComputersProxySetHookRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxySetHookResponse`

**CLI:** `hoody computers proxy hooks set`

---

### `setIpGroup`

**PUT** `/api/v1/computers/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (computer)

```typescript
client.api.computers.proxy.setIpGroup(id: string, groupName: string, data: ApiComputersProxySetIpGroupRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetIpGroupResponse`

**CLI:** `hoody computers proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/computers/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (computer)

```typescript
client.api.computers.proxy.setJwtGroup(id: string, groupName: string, data: ApiComputersProxySetJwtGroupRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetJwtGroupResponse`

**CLI:** `hoody computers proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/computers/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (computer)

```typescript
client.api.computers.proxy.setPasswordGroup(id: string, groupName: string, data: ApiComputersProxySetPasswordGroupRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetPasswordGroupResponse`

**CLI:** `hoody computers proxy groups password set`

---

### `setPermissions`

**PUT** `/api/v1/computers/{id}/proxy/permissions`

Replace computer proxy permissions JSON

```typescript
client.api.computers.proxy.setPermissions(id: string, data: ApiComputersProxySetPermissionsRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetPermissionsRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetPermissionsResponse`

**CLI:** `hoody computers proxy permissions set`

---

### `setTokenGroup`

**PUT** `/api/v1/computers/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (computer)

```typescript
client.api.computers.proxy.setTokenGroup(id: string, groupName: string, data: ApiComputersProxySetTokenGroupRequest, options: { ifMatch: string }): Promise<ApiComputersProxySetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiComputersProxySetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiComputersProxySetTokenGroupResponse`

**CLI:** `hoody computers proxy groups token set`

---

### `updateSettings`

**PUT** `/api/v1/computers/{id}/proxy/settings`

Update computer proxy root settings

```typescript
client.api.computers.proxy.updateSettings(id: string, data: ApiComputersProxyUpdateSettingsRequest, options: { ifMatch: string }): Promise<ApiComputersProxyUpdateSettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiComputersProxyUpdateSettingsRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ApiComputersProxyUpdateSettingsResponse`

**CLI:** `hoody computers proxy settings update`

---

## `client.api.events` (8 methods)

### `clear`

**DELETE** `/api/v1/events`

Bulk delete events

```typescript
client.api.events.clear(data: ApiEventsClearRequest): Promise<ApiEventsClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsClearRequest` | Yes | body |  |

**Returns:** `ApiEventsClearResponse`

**CLI:** `hoody events clear`

---

### `delete`

**DELETE** `/api/v1/events/{id}`

Delete a single event

```typescript
client.api.events.delete(id: string): Promise<ApiEventsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Event ID to delete |

**Returns:** `ApiEventsDeleteResponse`

**CLI:** `hoody events delete`

---

### `get`

**GET** `/api/v1/events/{id}`

Get event details by ID

```typescript
client.api.events.get(id: string): Promise<ApiEventsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Event ID |

**Returns:** `ApiEventsGetResponse`

**CLI:** `hoody events get`

---

### `getStats`

**GET** `/api/v1/events/stats`

Get event statistics

```typescript
client.api.events.getStats(options?: { start_date?: string; end_date?: string; realm_id?: string }): Promise<ApiEventsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `start_date` | `string` | No | query | Start of time range |
| `end_date` | `string` | No | query | End of time range |
| `realm_id` | `string` | No | query | Filter by realm |

**Returns:** `ApiEventsGetStatsResponse`

**CLI:** `hoody events stats`

---

### `list`

**GET** `/api/v1/events`

List event history

```typescript
client.api.events.list(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "computer.creating" | "computer.running" | "computer.stopped" | "computer.failed" | "computer.deleting" | "computer.deleted" | "computer.autostart_enabled" | "computer.autostart_disabled" | "computer.renamed" | "computer.resource_updated" | "computer.ssh_key.added" | "computer.ssh_key.removed" | "computer.snapshot.created" | "computer.snapshot.deleted" | "computer.snapshot.restored" | "computer.snapshot.renamed" | "computer.display.enabled" | "computer.paused" | "computer.copying" | "computer.updated" | "computer.env.updated" | "computer.env.applied" | "computer.env.failed" | "computer.network.created" | "computer.network.updated" | "computer.network.running" | "computer.network.stopped" | "computer.network.failed" | "computer.network.deleted" | "computer.access_suspended" | "computer.access_restored" | "computer.operation.completed" | "computer.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "computer" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "computer_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; computer_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean }): Promise<ApiEventsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"computer.creating" \| "computer.running" \| "computer.stopped" \| "computer.failed" \| "computer.deleting" \| "computer.deleted" \| "computer.autostart_enabled" \| "computer.autostart_disabled" \| "computer.renamed" \| "computer.resource_updated" \| "computer.ssh_key.added" \| "computer.ssh_key.removed" \| "computer.snapshot.created" \| "computer.snapshot.deleted" \| "computer.snapshot.restored" \| "computer.snapshot.renamed" \| "computer.display.enabled" \| "computer.paused" \| "computer.copying" \| "computer.updated" \| "computer.env.updated" \| "computer.env.applied" \| "computer.env.failed" \| "computer.network.created" \| "computer.network.updated" \| "computer.network.running" \| "computer.network.stopped" \| "computer.network.failed" \| "computer.network.deleted" \| "computer.access_suspended" \| "computer.access_restored" \| "computer.operation.completed" \| "computer.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"computer" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "computer_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, computer_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `ApiEventsListResponse`

**CLI:** `hoody events list`

---

### `listAll`

**GET** `/api/v1/events`

List event history (collect all pages)

```typescript
client.api.events.listAll(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "computer.creating" | "computer.running" | "computer.stopped" | "computer.failed" | "computer.deleting" | "computer.deleted" | "computer.autostart_enabled" | "computer.autostart_disabled" | "computer.renamed" | "computer.resource_updated" | "computer.ssh_key.added" | "computer.ssh_key.removed" | "computer.snapshot.created" | "computer.snapshot.deleted" | "computer.snapshot.restored" | "computer.snapshot.renamed" | "computer.display.enabled" | "computer.paused" | "computer.copying" | "computer.updated" | "computer.env.updated" | "computer.env.applied" | "computer.env.failed" | "computer.network.created" | "computer.network.updated" | "computer.network.running" | "computer.network.stopped" | "computer.network.failed" | "computer.network.deleted" | "computer.access_suspended" | "computer.access_restored" | "computer.operation.completed" | "computer.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "computer" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "computer_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; computer_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"computer.creating" \| "computer.running" \| "computer.stopped" \| "computer.failed" \| "computer.deleting" \| "computer.deleted" \| "computer.autostart_enabled" \| "computer.autostart_disabled" \| "computer.renamed" \| "computer.resource_updated" \| "computer.ssh_key.added" \| "computer.ssh_key.removed" \| "computer.snapshot.created" \| "computer.snapshot.deleted" \| "computer.snapshot.restored" \| "computer.snapshot.renamed" \| "computer.display.enabled" \| "computer.paused" \| "computer.copying" \| "computer.updated" \| "computer.env.updated" \| "computer.env.applied" \| "computer.env.failed" \| "computer.network.created" \| "computer.network.updated" \| "computer.network.running" \| "computer.network.stopped" \| "computer.network.failed" \| "computer.network.deleted" \| "computer.access_suspended" \| "computer.access_restored" \| "computer.operation.completed" \| "computer.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"computer" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "computer_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, computer_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/events`

List event history (async iterator)

```typescript
client.api.events.listIterator(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "computer.creating" | "computer.running" | "computer.stopped" | "computer.failed" | "computer.deleting" | "computer.deleted" | "computer.autostart_enabled" | "computer.autostart_disabled" | "computer.renamed" | "computer.resource_updated" | "computer.ssh_key.added" | "computer.ssh_key.removed" | "computer.snapshot.created" | "computer.snapshot.deleted" | "computer.snapshot.restored" | "computer.snapshot.renamed" | "computer.display.enabled" | "computer.paused" | "computer.copying" | "computer.updated" | "computer.env.updated" | "computer.env.applied" | "computer.env.failed" | "computer.network.created" | "computer.network.updated" | "computer.network.running" | "computer.network.stopped" | "computer.network.failed" | "computer.network.deleted" | "computer.access_suspended" | "computer.access_restored" | "computer.operation.completed" | "computer.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "computer" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "computer_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; computer_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"computer.creating" \| "computer.running" \| "computer.stopped" \| "computer.failed" \| "computer.deleting" \| "computer.deleted" \| "computer.autostart_enabled" \| "computer.autostart_disabled" \| "computer.renamed" \| "computer.resource_updated" \| "computer.ssh_key.added" \| "computer.ssh_key.removed" \| "computer.snapshot.created" \| "computer.snapshot.deleted" \| "computer.snapshot.restored" \| "computer.snapshot.renamed" \| "computer.display.enabled" \| "computer.paused" \| "computer.copying" \| "computer.updated" \| "computer.env.updated" \| "computer.env.applied" \| "computer.env.failed" \| "computer.network.created" \| "computer.network.updated" \| "computer.network.running" \| "computer.network.stopped" \| "computer.network.failed" \| "computer.network.deleted" \| "computer.access_suspended" \| "computer.access_restored" \| "computer.operation.completed" \| "computer.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"computer" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "computer_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, computer_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `purge`

**POST** `/api/v1/events/cleanup`

Cleanup old events

```typescript
client.api.events.purge(data: ApiEventsPurgeRequest): Promise<ApiEventsPurgeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsPurgeRequest` | Yes | body |  |

**Returns:** `ApiEventsPurgeResponse`

**CLI:** `hoody events purge`

---

## `client.api.firewall` (2 methods)

### `listRules`

**GET** `/api/v1/computers/{id}/firewall/rules`

List computer firewall rules

```typescript
client.api.firewall.listRules(id: string): Promise<ApiFirewallListRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiFirewallListRulesResponse`

**CLI:** `hoody firewall rules list`

---

### `reset`

**POST** `/api/v1/computers/{id}/firewall/reset`

Reset computer firewall

```typescript
client.api.firewall.reset(id: string): Promise<ApiFirewallResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiFirewallResetResponse`

**CLI:** `hoody firewall reset`

---

## `client.api.firewall.egress` (4 methods)

### `create`

**POST** `/api/v1/computers/{id}/firewall/egress`

Add Egress Rule

```typescript
client.api.firewall.egress.create(id: string, data: ApiFirewallEgressCreateRequest): Promise<ApiFirewallEgressCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiFirewallEgressCreateRequest` | Yes | body |  |

**Returns:** `ApiFirewallEgressCreateResponse`

**CLI:** `hoody firewall egress create`

---

### `delete`

**DELETE** `/api/v1/computers/{id}/firewall/egress`

Remove Egress Rule(s)

```typescript
client.api.firewall.egress.delete(id: string, data: ApiFirewallEgressDeleteRequest): Promise<ApiFirewallEgressDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiFirewallEgressDeleteRequest` | Yes | body |  |

**Returns:** `ApiFirewallEgressDeleteResponse`

**CLI:** `hoody firewall egress delete`

---

### `disable`

**PATCH** `/api/v1/computers/{id}/firewall/egress`

Toggle Egress Rule State

```typescript
client.api.firewall.egress.disable(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall egress disable`

---

### `enable`

**PATCH** `/api/v1/computers/{id}/firewall/egress`

Toggle Egress Rule State

```typescript
client.api.firewall.egress.enable(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall egress enable`

---

## `client.api.firewall.ingress` (4 methods)

### `create`

**POST** `/api/v1/computers/{id}/firewall/ingress`

Add Ingress Rule

```typescript
client.api.firewall.ingress.create(id: string, data: ApiFirewallIngressCreateRequest): Promise<ApiFirewallIngressCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiFirewallIngressCreateRequest` | Yes | body |  |

**Returns:** `ApiFirewallIngressCreateResponse`

**CLI:** `hoody firewall ingress create`

---

### `delete`

**DELETE** `/api/v1/computers/{id}/firewall/ingress`

Remove Ingress Rule(s)

```typescript
client.api.firewall.ingress.delete(id: string, data: ApiFirewallIngressDeleteRequest): Promise<ApiFirewallIngressDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `ApiFirewallIngressDeleteRequest` | Yes | body |  |

**Returns:** `ApiFirewallIngressDeleteResponse`

**CLI:** `hoody firewall ingress delete`

---

### `disable`

**PATCH** `/api/v1/computers/{id}/firewall/ingress`

Toggle Ingress Rule State

```typescript
client.api.firewall.ingress.disable(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall ingress disable`

---

### `enable`

**PATCH** `/api/v1/computers/{id}/firewall/ingress`

Toggle Ingress Rule State

```typescript
client.api.firewall.ingress.enable(id: string, data?: object, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall ingress enable`

---

## `client.api.images` (11 methods)

### `buy`

**POST** `/api/v1/images/purchase/{id}`

Purchase image

```typescript
client.api.images.buy(id: string): Promise<ApiImagesBuyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the paid computer image to purchase |

**Returns:** `ApiImagesBuyResponse`

**CLI:** `hoody images buy`

---

### `getIcon`

**GET** `/api/v1/images/{id}/icon`

Get image icon

```typescript
client.api.images.getIcon(id: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer image to retrieve icon for |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody images icon get`

---

### `getPublic`

**GET** `/api/v1/images/public/{id}`

Get public image details

```typescript
client.api.images.getPublic(id: string): Promise<ApiImagesGetPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public computer image to retrieve details for |

**Returns:** `ApiImagesGetPublicResponse`

**CLI:** `hoody images get`

---

### `import`

**POST** `/api/v1/images/import/{id}`

Import free image

```typescript
client.api.images.import(id: string): Promise<ApiImagesImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public computer image to import |

**Returns:** `ApiImagesImportResponse`

**CLI:** `hoody images import`

---

### `listMine`

**GET** `/api/v1/images/user`

List user images

```typescript
client.api.images.listMine(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): Promise<ApiImagesListMineResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `ApiImagesListMineResponse`

**CLI:** `hoody images list`

---

### `listMineAll`

**GET** `/api/v1/images/user`

List user images (collect all pages)

```typescript
client.api.images.listMineAll(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `unknown[]`

---

### `listMineIterator`

**GET** `/api/v1/images/user`

List user images (async iterator)

```typescript
client.api.images.listMineIterator(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listPublic`

**GET** `/api/v1/images/public`

List public images

```typescript
client.api.images.listPublic(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" }): Promise<ApiImagesListPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term matched as a substring against the image alias, image name and description |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `ApiImagesListPublicResponse`

**CLI:** `hoody images list`

---

### `listPublicAll`

**GET** `/api/v1/images/public`

List public images (collect all pages)

```typescript
client.api.images.listPublicAll(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term matched as a substring against the image alias, image name and description |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `unknown[]`

---

### `listPublicIterator`

**GET** `/api/v1/images/public`

List public images (async iterator)

```typescript
client.api.images.listPublicIterator(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term matched as a substring against the image alias, image name and description |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rate`

**POST** `/api/v1/images/rate/{id}`

Rate image

```typescript
client.api.images.rate(id: string, data: ApiImagesRateRequest): Promise<ApiImagesRateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer image to rate |
| `data` | `ApiImagesRateRequest` | Yes | body |  |

**Returns:** `ApiImagesRateResponse`

**CLI:** `hoody images rate`

---

## `client.api.inbox` (9 methods)

### `getSummary`

**GET** `/api/v1/notifications/summary`

Unread notification count and newest position

```typescript
client.api.inbox.getSummary(): Promise<ApiInboxGetSummaryResponse>
```

**Returns:** `ApiInboxGetSummaryResponse`

**CLI:** `hoody inbox summary get`

---

### `list`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user

```typescript
client.api.inbox.list(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string }): Promise<ApiInboxListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read (the archive half of the inbox). `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `ApiInboxListResponse`

**CLI:** `hoody inbox list`

---

### `listAll`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user (collect all pages)

```typescript
client.api.inbox.listAll(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read (the archive half of the inbox). `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `unknown[]`

---

### `listAnnouncements`

**GET** `/api/v1/notifications/public`

Get all public notifications

```typescript
client.api.inbox.listAnnouncements(): Promise<ApiInboxListAnnouncementsResponse>
```

**Returns:** `ApiInboxListAnnouncementsResponse`

**CLI:** `hoody inbox announcements list`

---

### `listAnnouncementsAll`

**GET** `/api/v1/notifications/public`

Get all public notifications (collect all pages)

```typescript
client.api.inbox.listAnnouncementsAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

---

### `listAnnouncementsIterator`

**GET** `/api/v1/notifications/public`

Get all public notifications (async iterator)

```typescript
client.api.inbox.listAnnouncementsIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user (async iterator)

```typescript
client.api.inbox.listIterator(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read (the archive half of the inbox). `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `markAllRead`

**PUT** `/api/v1/notifications/read-all`

Mark all notifications as read

```typescript
client.api.inbox.markAllRead(): Promise<ApiInboxMarkAllReadResponse>
```

**Returns:** `ApiInboxMarkAllReadResponse`

**CLI:** `hoody inbox markread`

---

### `markRead`

**PUT** `/api/v1/notifications/{id}/read`

Mark a notification as read

```typescript
client.api.inbox.markRead(id: string): Promise<ApiInboxMarkReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the notification to mark as read |

**Returns:** `ApiInboxMarkReadResponse`

**CLI:** `hoody inbox markread`

---

## `client.api.ip` (2 methods)

### `get`

**GET** `/api/v1/ip`

Get IP Information

```typescript
client.api.ip.get(): Promise<ApiIpGetResponse>
```

**Returns:** `ApiIpGetResponse`

**CLI:** `hoody ip get`

---

### `lookup`

**GET** `/api/v1/ip/lookup`

Look Up IP Information

```typescript
client.api.ip.lookup(options: { ip: string }): Promise<ApiIpLookupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ip` | `string` | Yes | query | Comma-separated public IPv4 addresses, at most 25 |

**Returns:** `ApiIpLookupResponse`

**CLI:** `hoody ip lookup`

---

## `client.api.meta` (1 method)

### `getPublicKey`

**GET** `/api/v1/meta/public-key`

Get Hoody API Signing Public Key

```typescript
client.api.meta.getPublicKey(): Promise<ApiMetaGetPublicKeyResponse>
```

**Returns:** `ApiMetaGetPublicKeyResponse`

**CLI:** `hoody meta publickey get`

---

## `client.api.network` (5 methods)

### `delete`

**DELETE** `/api/v1/computers/{id}/network`

Remove computer network configuration

```typescript
client.api.network.delete(id: string): Promise<ApiNetworkDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to remove network configuration from |

**Returns:** `ApiNetworkDeleteResponse`

**CLI:** `hoody network delete`

---

### `get`

**GET** `/api/v1/computers/{id}/network`

Get computer network configuration

```typescript
client.api.network.get(id: string): Promise<ApiNetworkGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to retrieve network configuration for |

**Returns:** `ApiNetworkGetResponse`

**CLI:** `hoody network get`

---

### `start`

**POST** `/api/v1/computers/{id}/network/start`

Start computer network proxy/blocking

```typescript
client.api.network.start(id: string): Promise<ApiNetworkStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to start network for |

**Returns:** `ApiNetworkStartResponse`

**CLI:** `hoody network start`

---

### `stop`

**POST** `/api/v1/computers/{id}/network/stop`

Stop computer network proxy/blocking

```typescript
client.api.network.stop(id: string): Promise<ApiNetworkStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to stop network for |

**Returns:** `ApiNetworkStopResponse`

**CLI:** `hoody network stop`

---

### `update`

**PUT** `/api/v1/computers/{id}/network`

Update computer network configuration

```typescript
client.api.network.update(id: string, data: ApiNetworkUpdateRequest): Promise<ApiNetworkUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to configure network for |
| `data` | `ApiNetworkUpdateRequest` | Yes | body |  |

**Returns:** `ApiNetworkUpdateResponse`

**CLI:** `hoody network update`

---

## `client.api.pools` (7 methods)

### `create`

**POST** `/api/v1/pools`

Create pool

```typescript
client.api.pools.create(data: ApiPoolsCreateRequest): Promise<ApiPoolsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiPoolsCreateRequest` | Yes | body |  |

**Returns:** `ApiPoolsCreateResponse`

**CLI:** `hoody pools create`

---

### `delete`

**DELETE** `/api/v1/pools/{id}`

Delete pool

```typescript
client.api.pools.delete(id: string): Promise<ApiPoolsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolsDeleteResponse`

**CLI:** `hoody pools delete`

---

### `get`

**GET** `/api/v1/pools/{id}`

Get pool details

```typescript
client.api.pools.get(id: string): Promise<ApiPoolsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolsGetResponse`

**CLI:** `hoody pools get`

---

### `list`

**GET** `/api/v1/pools`

List user pools

```typescript
client.api.pools.list(): Promise<ApiPoolsListResponse>
```

**Returns:** `ApiPoolsListResponse`

**CLI:** `hoody pools list`

---

### `listAll`

**GET** `/api/v1/pools`

List user pools (collect all pages)

```typescript
client.api.pools.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/pools`

List user pools (async iterator)

```typescript
client.api.pools.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PUT** `/api/v1/pools/{id}`

Update pool

```typescript
client.api.pools.update(id: string, data: ApiPoolsUpdateRequest): Promise<ApiPoolsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiPoolsUpdateRequest` | Yes | body |  |

**Returns:** `ApiPoolsUpdateResponse`

**CLI:** `hoody pools update`

---

## `client.api.pools.invitations` (3 methods)

### `accept`

**POST** `/api/v1/pools/{id}/accept`

Accept invitation

```typescript
client.api.pools.invitations.accept(id: string): Promise<ApiPoolsInvitationsAcceptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolsInvitationsAcceptResponse`

**CLI:** `hoody pools invitations accept`

---

### `list`

**GET** `/api/v1/pools/invitations/pending`

List pending invitations

```typescript
client.api.pools.invitations.list(): Promise<ApiPoolsInvitationsListResponse>
```

**Returns:** `ApiPoolsInvitationsListResponse`

**CLI:** `hoody pools invitations list`

---

### `reject`

**POST** `/api/v1/pools/{id}/reject`

Reject invitation

```typescript
client.api.pools.invitations.reject(id: string): Promise<ApiPoolsInvitationsRejectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolsInvitationsRejectResponse`

**CLI:** `hoody pools invitations reject`

---

## `client.api.pools.members` (3 methods)

### `invite`

**POST** `/api/v1/pools/{id}/members`

Invite member

```typescript
client.api.pools.members.invite(id: string, data: ApiPoolsMembersInviteRequest): Promise<ApiPoolsMembersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiPoolsMembersInviteRequest` | Yes | body |  |

**Returns:** `ApiPoolsMembersInviteResponse`

**CLI:** `hoody pools members invite`

---

### `remove`

**DELETE** `/api/v1/pools/{id}/members/{userId}`

Remove member

```typescript
client.api.pools.members.remove(id: string, userId: string): Promise<ApiPoolsMembersRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |

**Returns:** `ApiPoolsMembersRemoveResponse`

**CLI:** `hoody pools members remove`

---

### `setRole`

**PUT** `/api/v1/pools/{id}/members/{userId}`

Update member role

```typescript
client.api.pools.members.setRole(id: string, userId: string, data: ApiPoolsMembersSetRoleRequest): Promise<ApiPoolsMembersSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `ApiPoolsMembersSetRoleRequest` | Yes | body |  |

**Returns:** `ApiPoolsMembersSetRoleResponse`

**CLI:** `hoody pools members role set`

---

## `client.api.projects` (8 methods)

### `create`

**POST** `/api/v1/projects/`

Create a new project

```typescript
client.api.projects.create(data: ApiProjectsCreateRequest): Promise<ApiProjectsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiProjectsCreateRequest` | Yes | body |  |

**Returns:** `ApiProjectsCreateResponse`

**CLI:** `hoody projects create`

---

### `delete`

**DELETE** `/api/v1/projects/{id}`

Delete project

```typescript
client.api.projects.delete(id: string, options?: { include_deleted_items?: boolean; delete_computers?: boolean }): Promise<ApiProjectsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID to delete |
| `include_deleted_items` | `boolean` | No | query | Include a short list of the deleted computer IDs and names in the response. |
| `delete_computers` | `boolean` | No | query | Also delete every computer in the project. Without it, a project that still holds computers is refused with 422 PROJECT_HAS_COMPUTERS and nothing is changed. |

**Returns:** `ApiProjectsDeleteResponse`

**CLI:** `hoody projects delete`

---

### `get`

**GET** `/api/v1/projects/{id}`

Get project by ID

```typescript
client.api.projects.get(id: string, options?: { include_permissions?: boolean }): Promise<ApiProjectsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `include_permissions` | `boolean` | No | query | Include project permissions with user details in response. An auth token needs a projects.members capability (invite, remove or change_roles) to request it, as for the member list endpoint |

**Returns:** `ApiProjectsGetResponse`

**CLI:** `hoody projects get`

---

### `getStats`

**GET** `/api/v1/projects/{id}/stats`

Get statistics for all computers in a project

```typescript
client.api.projects.getStats(id: string): Promise<ApiProjectsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the project |

**Returns:** `ApiProjectsGetStatsResponse`

**CLI:** `hoody projects stats`

---

### `list`

**GET** `/api/v1/projects/`

List all projects

```typescript
client.api.projects.list(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string }): Promise<ApiProjectsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `ApiProjectsListResponse`

**CLI:** `hoody projects list`

---

### `listAll`

**GET** `/api/v1/projects/`

List all projects (collect all pages)

```typescript
client.api.projects.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/projects/`

List all projects (async iterator)

```typescript
client.api.projects.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PUT** `/api/v1/projects/{id}`

Update project

```typescript
client.api.projects.update(id: string, data: ApiProjectsUpdateRequest): Promise<ApiProjectsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID to update |
| `data` | `ApiProjectsUpdateRequest` | Yes | body |  |

**Returns:** `ApiProjectsUpdateResponse`

**CLI:** `hoody projects update`

---

## `client.api.projects.permissions` (6 methods)

### `add`

**POST** `/api/v1/projects/{id}/permissions`

Grant project access

```typescript
client.api.projects.permissions.add(id: string, data: ApiProjectsPermissionsAddRequest): Promise<ApiProjectsPermissionsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProjectsPermissionsAddRequest` | Yes | body |  |

**Returns:** `ApiProjectsPermissionsAddResponse`

**CLI:** `hoody projects permissions add`

---

### `list`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions

```typescript
client.api.projects.permissions.list(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<ApiProjectsPermissionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query | Page number (1-based). Default: 1. |
| `limit` | `number` | No | query | Items per page, from 1 to 100. Default: 10. |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiProjectsPermissionsListResponse`

**CLI:** `hoody projects permissions list`

---

### `listAll`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (collect all pages)

```typescript
client.api.projects.permissions.listAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query | Page number (1-based). Default: 1. |
| `limit` | `number` | No | query | Items per page, from 1 to 100. Default: 10. |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (async iterator)

```typescript
client.api.projects.permissions.listIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query | Page number (1-based). Default: 1. |
| `limit` | `number` | No | query | Items per page, from 1 to 100. Default: 10. |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `remove`

**DELETE** `/api/v1/projects/{id}/permissions/{permissionId}`

Revoke project access

```typescript
client.api.projects.permissions.remove(id: string, permissionId: string): Promise<ApiProjectsPermissionsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to remove |

**Returns:** `ApiProjectsPermissionsRemoveResponse`

**CLI:** `hoody projects permissions remove`

---

### `update`

**PUT** `/api/v1/projects/{id}/permissions/{permissionId}`

Update project permission

```typescript
client.api.projects.permissions.update(id: string, permissionId: string, data: ApiProjectsPermissionsUpdateRequest): Promise<ApiProjectsPermissionsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to update |
| `data` | `ApiProjectsPermissionsUpdateRequest` | Yes | body |  |

**Returns:** `ApiProjectsPermissionsUpdateResponse`

**CLI:** `hoody projects permissions update`

---

## `client.api.projects.proxy` (15 methods)

### `clearGroupPermissions`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a project group

```typescript
client.api.projects.proxy.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string }): Promise<ApiProjectsProxyClearGroupPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxyClearGroupPermissionsResponse`

**CLI:** `hoody projects proxy groups permissions clear`

---

### `deleteGroup`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}`

Remove project authentication group

```typescript
client.api.projects.proxy.deleteGroup(id: string, groupName: string, options: { ifMatch: string }): Promise<ApiProjectsProxyDeleteGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxyDeleteGroupResponse`

**CLI:** `hoody projects proxy groups delete`

---

### `deleteGroupPermission`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a project group

```typescript
client.api.projects.proxy.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string }): Promise<ApiProjectsProxyDeleteGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxyDeleteGroupPermissionResponse`

**CLI:** `hoody projects proxy groups permissions delete`

---

### `deletePermissions`

**DELETE** `/api/v1/projects/{id}/proxy/permissions`

Delete project proxy permissions

```typescript
client.api.projects.proxy.deletePermissions(id: string, options: { ifMatch: string }): Promise<ApiProjectsProxyDeletePermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxyDeletePermissionsResponse`

**CLI:** `hoody projects proxy permissions delete`

---

### `disable`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/state`

Update project proxy enable state

```typescript
client.api.projects.proxy.disable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody projects proxy disable`

---

### `enable`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/state`

Update project proxy enable state

```typescript
client.api.projects.proxy.enable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody projects proxy enable`

---

### `getPermissions`

**GET** `/api/v1/projects/{id}/proxy/permissions`

Get project proxy permissions

```typescript
client.api.projects.proxy.getPermissions(id: string): Promise<ApiProjectsProxyGetPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |

**Returns:** `ApiProjectsProxyGetPermissionsResponse`

**CLI:** `hoody projects proxy permissions get`

---

### `getUsage`

**GET** `/api/v1/projects/{id}/proxy-usage`

Get proxied-usage documents for every computer in a project

```typescript
client.api.projects.proxy.getUsage(id: string, options: { from: string; to: string }): Promise<ApiProjectsProxyGetUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project id |
| `from` | `string` | Yes | query | First month, inclusive (YYYY-MM), from 2020-01. |
| `to` | `string` | Yes | query | Last month, inclusive (YYYY-MM), up to 2099-12 and not before `from`. At most 12 months. |

**Returns:** `ApiProjectsProxyGetUsageResponse`

**CLI:** `hoody projects proxy usage get`

---

### `setDefault`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/default`

Update project default proxy permission policy

```typescript
client.api.projects.proxy.setDefault(id: string, data: ApiProjectsProxySetDefaultRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProjectsProxySetDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetDefaultResponse`

**CLI:** `hoody projects proxy default set`

---

### `setGroupPermission`

**PUT** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Set project group program permission

```typescript
client.api.projects.proxy.setGroupPermission(id: string, groupName: string, data: ApiProjectsProxySetGroupPermissionRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetGroupPermissionRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetGroupPermissionResponse`

**CLI:** `hoody projects proxy groups permissions set`

---

### `setIpGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (project)

```typescript
client.api.projects.proxy.setIpGroup(id: string, groupName: string, data: ApiProjectsProxySetIpGroupRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetIpGroupResponse`

**CLI:** `hoody projects proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (project)

```typescript
client.api.projects.proxy.setJwtGroup(id: string, groupName: string, data: ApiProjectsProxySetJwtGroupRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetJwtGroupResponse`

**CLI:** `hoody projects proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (project)

```typescript
client.api.projects.proxy.setPasswordGroup(id: string, groupName: string, data: ApiProjectsProxySetPasswordGroupRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetPasswordGroupResponse`

**CLI:** `hoody projects proxy groups password set`

---

### `setPermissions`

**PUT** `/api/v1/projects/{id}/proxy/permissions`

Replace project proxy permissions JSON

```typescript
client.api.projects.proxy.setPermissions(id: string, data: ApiProjectsProxySetPermissionsRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetPermissionsRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetPermissionsResponse`

**CLI:** `hoody projects proxy permissions set`

---

### `setTokenGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (project)

```typescript
client.api.projects.proxy.setTokenGroup(id: string, groupName: string, data: ApiProjectsProxySetTokenGroupRequest, options: { ifMatch: string }): Promise<ApiProjectsProxySetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProjectsProxySetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition. Read the current file_version with GET first. |

**Returns:** `ApiProjectsProxySetTokenGroupResponse`

**CLI:** `hoody projects proxy groups token set`

---

## `client.api.proxy.aliases` (9 methods)

### `create`

**POST** `/api/v1/proxy/aliases`

Create a new proxy alias

```typescript
client.api.proxy.aliases.create(data: ApiProxyAliasesCreateRequest): Promise<ApiProxyAliasesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiProxyAliasesCreateRequest` | Yes | body |  |

**Returns:** `ApiProxyAliasesCreateResponse`

**CLI:** `hoody proxy aliases create`

---

### `delete`

**DELETE** `/api/v1/proxy/aliases/{id}`

Delete proxy alias

```typescript
client.api.proxy.aliases.delete(id: string): Promise<ApiProxyAliasesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to delete |

**Returns:** `ApiProxyAliasesDeleteResponse`

**CLI:** `hoody proxy aliases delete`

---

### `disable`

**PATCH** `/api/v1/proxy/aliases/{id}/state`

Enable or disable proxy alias

```typescript
client.api.proxy.aliases.disable(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |

**Returns:** `any`

**CLI:** `hoody proxy aliases disable`

---

### `enable`

**PATCH** `/api/v1/proxy/aliases/{id}/state`

Enable or disable proxy alias

```typescript
client.api.proxy.aliases.enable(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |

**Returns:** `any`

**CLI:** `hoody proxy aliases enable`

---

### `get`

**GET** `/api/v1/proxy/aliases/{id}`

Get proxy alias by ID

```typescript
client.api.proxy.aliases.get(id: string): Promise<ApiProxyAliasesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |

**Returns:** `ApiProxyAliasesGetResponse`

**CLI:** `hoody proxy aliases get`

---

### `list`

**GET** `/api/v1/proxy/aliases`

List proxy aliases

```typescript
client.api.proxy.aliases.list(options?: { project_id?: string; computer_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean }): Promise<ApiProxyAliasesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `ApiProxyAliasesListResponse`

**CLI:** `hoody proxy aliases list`

---

### `listAll`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (collect all pages)

```typescript
client.api.proxy.aliases.listAll(options?: { project_id?: string; computer_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (async iterator)

```typescript
client.api.proxy.aliases.listIterator(options?: { project_id?: string; computer_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `computer_id` | `string` | No | query | Filter by computer ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/proxy/aliases/{id}`

Update proxy alias

```typescript
client.api.proxy.aliases.update(id: string, data: ApiProxyAliasesUpdateRequest): Promise<ApiProxyAliasesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to update |
| `data` | `ApiProxyAliasesUpdateRequest` | Yes | body |  |

**Returns:** `ApiProxyAliasesUpdateResponse`

**CLI:** `hoody proxy aliases update`

---

## `client.api.realms` (1 method)

### `list`

**GET** `/api/v1/realms/`

List your realm IDs

```typescript
client.api.realms.list(options?: { include_usage?: boolean }): Promise<ApiRealmsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_usage` | `boolean` | No | query | Include resource counts per realm_id (projects, computers, servers, auth_tokens). Adds "usage" object to response data. |

**Returns:** `ApiRealmsListResponse`

**CLI:** `hoody realms list`

---

## `client.api.referrals` (2 methods)

### `get`

**GET** `/api/v1/referrals/me`

Show your referral program status

```typescript
client.api.referrals.get(): Promise<ApiReferralsGetResponse>
```

**Returns:** `ApiReferralsGetResponse`

**CLI:** `hoody referrals get`

---

### `join`

**POST** `/api/v1/referrals/me`

Join the referral program

```typescript
client.api.referrals.join(): Promise<ApiReferralsJoinResponse>
```

**Returns:** `ApiReferralsJoinResponse`

**CLI:** `hoody referrals join`

---

## `client.api.referrals.codes` (3 methods)

### `check`

**GET** `/api/v1/referrals/me/codes/check`

Check a custom referral code

```typescript
client.api.referrals.codes.check(options: { code: string }): Promise<ApiReferralsCodesCheckResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code` | `string` | Yes | query | The custom code to check: 4 to 20 lowercase letters or digits, single hyphens between them. |

**Returns:** `ApiReferralsCodesCheckResponse`

**CLI:** `hoody referrals codes check`

---

### `create`

**POST** `/api/v1/referrals/me/codes`

Create a custom referral code

```typescript
client.api.referrals.codes.create(data: ApiReferralsCodesCreateRequest): Promise<ApiReferralsCodesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiReferralsCodesCreateRequest` | Yes | body |  |

**Returns:** `ApiReferralsCodesCreateResponse`

**CLI:** `hoody referrals codes create`

---

### `release`

**DELETE** `/api/v1/referrals/me/codes/{code}`

Release a custom referral code

```typescript
client.api.referrals.codes.release(code: string): Promise<ApiReferralsCodesReleaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code` | `string` | Yes | path | Referral code: 4 to 20 letters or digits, single hyphens between them (any letter case). |

**Returns:** `ApiReferralsCodesReleaseResponse`

**CLI:** `hoody referrals codes release`

---

## `client.api.servers` (20 methods)

### `extend`

**POST** `/api/v1/rentals/{id}/extend`

Extend rental

```typescript
client.api.servers.extend(id: string, data: ApiServersExtendRequest): Promise<ApiServersExtendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersExtendRequest` | Yes | body |  |

**Returns:** `ApiServersExtendResponse`

**CLI:** `hoody servers extend`

---

### `get`

**GET** `/api/v1/rentals/{id}`

Get rental details

```typescript
client.api.servers.get(id: string): Promise<ApiServersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServersGetResponse`

**CLI:** `hoody servers get`

---

### `getJob`

**GET** `/api/v1/subserver-operations/{id}`

Status of a paid subserver operation

```typescript
client.api.servers.getJob(id: string): Promise<ApiServersGetJobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServersGetJobResponse`

**CLI:** `hoody servers jobs get`

---

### `getReservation`

**GET** `/api/v1/reservations/{id}`

One of your reservations

```typescript
client.api.servers.getReservation(id: string): Promise<ApiServersGetReservationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServersGetReservationResponse`

**CLI:** `hoody servers reservations get`

---

### `getStats`

**GET** `/api/v1/rentals/{id}/runtime`

Get live runtime info for a rented server or subserver

```typescript
client.api.servers.getStats(id: string): Promise<ApiServersGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServersGetStatsResponse`

**CLI:** `hoody servers stats`

---

### `list`

**GET** `/api/v1/rentals`

List user rentals

```typescript
client.api.servers.list(): Promise<ApiServersListResponse>
```

**Returns:** `ApiServersListResponse`

**CLI:** `hoody servers list`

---

### `listAll`

**GET** `/api/v1/rentals`

List user rentals (collect all pages)

```typescript
client.api.servers.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

---

### `listCommands`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands

```typescript
client.api.servers.listCommands(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): Promise<ApiServersListCommandsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `ApiServersListCommandsResponse`

**CLI:** `hoody servers commands list`

---

### `listCommandsAll`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (collect all pages)

```typescript
client.api.servers.listCommandsAll(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `unknown[]`

---

### `listCommandsIterator`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (async iterator)

```typescript
client.api.servers.listCommandsIterator(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/rentals`

List user rentals (async iterator)

```typescript
client.api.servers.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listMarketplace`

**GET** `/api/v1/servers/available`

Browse rental marketplace

```typescript
client.api.servers.listMarketplace(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; discounted_only?: boolean; locale?: string }): Promise<ApiServersListMarketplaceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | A server matches when it supports at least one of these rental durations (days). |
| `min_cpu_cores` | `number` | No | query | Minimum CPU cores |
| `min_cpu_score` | `number` | No | query | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | No | query | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | No | query | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | No | query | Filter by RAM types |
| `min_total_storage_gb` | `number` | No | query | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | No | query | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | No | query | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | No | query | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | No | query | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | No | query | Filter by server category |
| `featured_only` | `boolean` | No | query | Show only featured servers |
| `discounted_only` | `boolean` | No | query | Only listings with a sale running now. |
| `locale` | `string` | No | query | Language for the sale label (e.g. de, pt-BR). Wins over Accept-Language; unknown or invalid values fall back to English. |

**Returns:** `ApiServersListMarketplaceResponse`

**CLI:** `hoody servers marketplace list`

---

### `listMarketplaceAll`

**GET** `/api/v1/servers/available`

Browse rental marketplace (collect all pages)

```typescript
client.api.servers.listMarketplaceAll(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; discounted_only?: boolean; locale?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | A server matches when it supports at least one of these rental durations (days). |
| `min_cpu_cores` | `number` | No | query | Minimum CPU cores |
| `min_cpu_score` | `number` | No | query | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | No | query | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | No | query | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | No | query | Filter by RAM types |
| `min_total_storage_gb` | `number` | No | query | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | No | query | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | No | query | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | No | query | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | No | query | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | No | query | Filter by server category |
| `featured_only` | `boolean` | No | query | Show only featured servers |
| `discounted_only` | `boolean` | No | query | Only listings with a sale running now. |
| `locale` | `string` | No | query | Language for the sale label (e.g. de, pt-BR). Wins over Accept-Language; unknown or invalid values fall back to English. |

**Returns:** `unknown[]`

---

### `listMarketplaceIterator`

**GET** `/api/v1/servers/available`

Browse rental marketplace (async iterator)

```typescript
client.api.servers.listMarketplaceIterator(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; discounted_only?: boolean; locale?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | A server matches when it supports at least one of these rental durations (days). |
| `min_cpu_cores` | `number` | No | query | Minimum CPU cores |
| `min_cpu_score` | `number` | No | query | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | No | query | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | No | query | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | No | query | Filter by RAM types |
| `min_total_storage_gb` | `number` | No | query | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | No | query | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | No | query | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | No | query | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | No | query | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | No | query | Filter by server category |
| `featured_only` | `boolean` | No | query | Show only featured servers |
| `discounted_only` | `boolean` | No | query | Only listings with a sale running now. |
| `locale` | `string` | No | query | Language for the sale label (e.g. de, pt-BR). Wins over Accept-Language; unknown or invalid values fall back to English. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listOffers`

**GET** `/api/v1/offers`

Browse machines available to order

```typescript
client.api.servers.listOffers(options?: { discounted_only?: boolean; locale?: string }): Promise<ApiServersListOffersResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `discounted_only` | `boolean` | No | query | Only listings with a sale running now. |
| `locale` | `string` | No | query | Language for the sale label (e.g. de, pt-BR). Wins over Accept-Language; unknown or invalid values fall back to English. |

**Returns:** `ApiServersListOffersResponse`

**CLI:** `hoody servers offers list`

---

### `listRegions`

**GET** `/api/v1/auth/available-regions`

Get available server regions

```typescript
client.api.servers.listRegions(): Promise<ApiServersListRegionsResponse>
```

**Returns:** `ApiServersListRegionsResponse`

**CLI:** `hoody servers regions list`

---

### `listReservations`

**GET** `/api/v1/reservations`

Your reservations

```typescript
client.api.servers.listReservations(options?: { limit?: number; offset?: number }): Promise<ApiServersListReservationsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `ApiServersListReservationsResponse`

**CLI:** `hoody servers reservations list`

---

### `rent`

**POST** `/api/v1/servers/{id}/rent`

Rent server

```typescript
client.api.servers.rent(id: string, data: ApiServersRentRequest): Promise<ApiServersRentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersRentRequest` | Yes | body |  |

**Returns:** `ApiServersRentResponse`

**CLI:** `hoody servers rent`

---

### `reserveOffer`

**POST** `/api/v1/offers/{id}/reserve`

Reserve an offer (charges immediately)

```typescript
client.api.servers.reserveOffer(id: string, data: ApiServersReserveOfferRequest): Promise<ApiServersReserveOfferResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersReserveOfferRequest` | Yes | body |  |

**Returns:** `ApiServersReserveOfferResponse`

**CLI:** `hoody servers offers reserve`

---

### `runCommand`

**POST** `/api/v1/servers/{serverId}/execute-command`

Execute server command

```typescript
client.api.servers.runCommand(serverId: string, data: ApiServersRunCommandRequest): Promise<ApiServersRunCommandResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to execute command on |
| `data` | `ApiServersRunCommandRequest` | Yes | body |  |

**Returns:** `ApiServersRunCommandResponse`

**CLI:** `hoody servers commands run`

---

## `client.api.servers.plans` (4 methods)

### `list`

**GET** `/api/v1/subserver-plans`

List subserver plans available to you

```typescript
client.api.servers.plans.list(options?: { locale?: string }): Promise<ApiServersPlansListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `locale` | `string` | No | query | Language tag such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `ApiServersPlansListResponse`

**CLI:** `hoody servers plans list`

---

### `listPublic`

**GET** `/api/v1/meta/subserver-plans`

List public subserver plans

```typescript
client.api.servers.plans.listPublic(options?: { locale?: string }): Promise<ApiServersPlansListPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `locale` | `string` | No | query | Language tag such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `ApiServersPlansListPublicResponse`

---

### `listRegions`

**GET** `/api/v1/subserver-subscriptions/regions`

List the regions a paid subserver plan is sold in

```typescript
client.api.servers.plans.listRegions(options: { plan_id: string }): Promise<ApiServersPlansListRegionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `plan_id` | `string` | Yes | query | Plan version id from GET /api/v1/subserver-plans. |

**Returns:** `ApiServersPlansListRegionsResponse`

**CLI:** `hoody servers plans regions`

---

### `quote`

**GET** `/api/v1/subserver-subscriptions/quote`

Quote a paid subserver purchase

```typescript
client.api.servers.plans.quote(options: { plan_id: string; region?: string }): Promise<ApiServersPlansQuoteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `plan_id` | `string` | Yes | query |  |
| `region` | `string` | No | query | Region code from GET /api/v1/subserver-subscriptions/regions. Leave out to let Hoody choose. |

**Returns:** `ApiServersPlansQuoteResponse`

**CLI:** `hoody servers plans quote`

---

## `client.api.servers.subscriptions` (9 methods)

### `buy`

**POST** `/api/v1/subserver-subscriptions`

Buy a paid subserver (charges immediately)

```typescript
client.api.servers.subscriptions.buy(data: ApiServersSubscriptionsBuyRequest): Promise<ApiServersSubscriptionsBuyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiServersSubscriptionsBuyRequest` | Yes | body |  |

**Returns:** `ApiServersSubscriptionsBuyResponse`

**CLI:** `hoody servers subscriptions buy`

---

### `cancel`

**POST** `/api/v1/subserver-subscriptions/{id}/cancel`

Cancel a paid subserver subscription

```typescript
client.api.servers.subscriptions.cancel(id: string): Promise<ApiServersSubscriptionsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServersSubscriptionsCancelResponse`

**CLI:** `hoody servers subscriptions cancel`

---

### `disableAutoRenew`

**PUT** `/api/v1/subserver-subscriptions/{id}/auto-renew`

Turn auto-renew on or off

```typescript
client.api.servers.subscriptions.disableAutoRenew(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `any`

**CLI:** `hoody servers subscriptions autorenew disable`

---

### `enableAutoRenew`

**PUT** `/api/v1/subserver-subscriptions/{id}/auto-renew`

Turn auto-renew on or off

```typescript
client.api.servers.subscriptions.enableAutoRenew(id: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `any`

**CLI:** `hoody servers subscriptions autorenew enable`

---

### `get`

**GET** `/api/v1/subserver-subscriptions/{id}`

One of your paid subserver subscriptions

```typescript
client.api.servers.subscriptions.get(id: string, options?: { locale?: string }): Promise<ApiServersSubscriptionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `locale` | `string` | No | query | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `ApiServersSubscriptionsGetResponse`

**CLI:** `hoody servers subscriptions get`

---

### `list`

**GET** `/api/v1/subserver-subscriptions`

List your paid subserver subscriptions

```typescript
client.api.servers.subscriptions.list(options?: { limit?: number; offset?: number; locale?: string }): Promise<ApiServersSubscriptionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `locale` | `string` | No | query | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `ApiServersSubscriptionsListResponse`

**CLI:** `hoody servers subscriptions list`

---

### `pay`

**POST** `/api/v1/subserver-subscriptions/{id}/pay`

Pay a held subscription and resume it (charges one month)

```typescript
client.api.servers.subscriptions.pay(id: string, data: ApiServersSubscriptionsPayRequest): Promise<ApiServersSubscriptionsPayResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersSubscriptionsPayRequest` | Yes | body |  |

**Returns:** `ApiServersSubscriptionsPayResponse`

**CLI:** `hoody servers subscriptions pay`

---

### `quote`

**GET** `/api/v1/subserver-subscriptions/{id}/quote`

Quote an upgrade or a payment

```typescript
client.api.servers.subscriptions.quote(id: string, options: { action: "upgrade" | "pay"; plan_id?: string; region?: string }): Promise<ApiServersSubscriptionsQuoteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `action` | `"upgrade" \| "pay"` | Yes | query |  |
| `plan_id` | `string` | No | query |  |
| `region` | `string` | No | query | upgrade only, optional: the region you expect the subserver to be in. An upgrade never moves it: another region is refused (409). |

**Returns:** `ApiServersSubscriptionsQuoteResponse`

**CLI:** `hoody servers subscriptions quote`

---

### `upgrade`

**POST** `/api/v1/subserver-subscriptions/{id}/upgrade`

Upgrade a paid subserver (charges the difference)

```typescript
client.api.servers.subscriptions.upgrade(id: string, data: ApiServersSubscriptionsUpgradeRequest): Promise<ApiServersSubscriptionsUpgradeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersSubscriptionsUpgradeRequest` | Yes | body |  |

**Returns:** `ApiServersSubscriptionsUpgradeResponse`

**CLI:** `hoody servers subscriptions upgrade`

---

## `client.api.snapshots` (7 methods)

### `create`

**POST** `/api/v1/computers/{id}/snapshots`

Create computer snapshot

```typescript
client.api.snapshots.create(id: string, data: ApiSnapshotsCreateRequest): Promise<ApiSnapshotsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to create snapshot for |
| `data` | `ApiSnapshotsCreateRequest` | Yes | body |  |

**Returns:** `ApiSnapshotsCreateResponse`

**CLI:** `hoody snapshots create`

---

### `delete`

**DELETE** `/api/v1/computers/{id}/snapshots/{name}`

Delete computer snapshot

```typescript
client.api.snapshots.delete(id: string, name: string): Promise<ApiSnapshotsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias (or when sanitization leaves nothing), a timestamped snap-YYYYMMDD-HHMMSS. |

**Returns:** `ApiSnapshotsDeleteResponse`

**CLI:** `hoody snapshots delete`

---

### `list`

**GET** `/api/v1/computers/{id}/snapshots`

Get computer snapshots

```typescript
client.api.snapshots.list(id: string): Promise<ApiSnapshotsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to retrieve snapshots for |

**Returns:** `ApiSnapshotsListResponse`

**CLI:** `hoody snapshots list`

---

### `listAll`

**GET** `/api/v1/computers/{id}/snapshots`

Get computer snapshots (collect all pages)

```typescript
client.api.snapshots.listAll(id: string): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to retrieve snapshots for |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/computers/{id}/snapshots`

Get computer snapshots (async iterator)

```typescript
client.api.snapshots.listIterator(id: string): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to retrieve snapshots for |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `restore`

**PUT** `/api/v1/computers/{id}/snapshots/{name}`

Restore computer from snapshot

```typescript
client.api.snapshots.restore(id: string, name: string): Promise<ApiSnapshotsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer to restore |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias (or when sanitization leaves nothing), a timestamped snap-YYYYMMDD-HHMMSS. |

**Returns:** `ApiSnapshotsRestoreResponse`

**CLI:** `hoody snapshots restore`

---

### `setAlias`

**PUT** `/api/v1/computers/{id}/snapshots/{name}/alias`

Update snapshot alias

```typescript
client.api.snapshots.setAlias(id: string, name: string, data: ApiSnapshotsSetAliasRequest): Promise<ApiSnapshotsSetAliasResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the computer |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias (or when sanitization leaves nothing), a timestamped snap-YYYYMMDD-HHMMSS. |
| `data` | `ApiSnapshotsSetAliasRequest` | Yes | body |  |

**Returns:** `ApiSnapshotsSetAliasResponse`

**CLI:** `hoody snapshots alias set`

---

## `client.api.storage.incoming` (6 methods)

### `list`

**GET** `/api/v1/storage/incoming`

Get all incoming shares

```typescript
client.api.storage.incoming.list(options?: { realm_id?: string }): Promise<ApiStorageIncomingListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageIncomingListResponse`

**CLI:** `hoody storage incoming list`

---

### `listAll`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (collect all pages)

```typescript
client.api.storage.incoming.listAll(options?: { realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

---

### `listByComputer`

**GET** `/api/v1/computers/{id}/storage/incoming`

Get incoming shares

```typescript
client.api.storage.incoming.listByComputer(id: string): Promise<ApiStorageIncomingListByComputerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Computer ID |

**Returns:** `ApiStorageIncomingListByComputerResponse`

**CLI:** `hoody storage computers incoming list`

---

### `listIterator`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (async iterator)

```typescript
client.api.storage.incoming.listIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `mount`

**PATCH** `/api/v1/computers/{id}/storage/incoming/{shareId}/mount`

Toggle incoming share mount

```typescript
client.api.storage.incoming.mount(id: string, shareId: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Target computer ID (receiver computer) |
| `shareId` | `string` | Yes | path | Share ID to toggle |

**Returns:** `any`

**CLI:** `hoody storage incoming mount`

---

### `unmount`

**PATCH** `/api/v1/computers/{id}/storage/incoming/{shareId}/mount`

Toggle incoming share mount

```typescript
client.api.storage.incoming.unmount(id: string, shareId: string, options?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Target computer ID (receiver computer) |
| `shareId` | `string` | Yes | path | Share ID to toggle |

**Returns:** `any`

**CLI:** `hoody storage incoming unmount`

---

## `client.api.storage.shares` (10 methods)

### `create`

**POST** `/api/v1/computers/{id}/storage/shares`

Create storage share

```typescript
client.api.storage.shares.create(id: string, data: ApiStorageSharesCreateRequest): Promise<ApiStorageSharesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `data` | `ApiStorageSharesCreateRequest` | Yes | body |  |

**Returns:** `ApiStorageSharesCreateResponse`

**CLI:** `hoody storage shares create`

---

### `delete`

**DELETE** `/api/v1/storage/shares/{shareId}`

Delete storage share

```typescript
client.api.storage.shares.delete(shareId: string): Promise<ApiStorageSharesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `shareId` | `string` | Yes | path | Share ID (globally unique, no computer ID needed) |

**Returns:** `ApiStorageSharesDeleteResponse`

**CLI:** `hoody storage shares delete`

---

### `get`

**GET** `/api/v1/computers/{id}/storage/shares/{shareId}`

Get storage share

```typescript
client.api.storage.shares.get(id: string, shareId: string): Promise<ApiStorageSharesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `shareId` | `string` | Yes | path | Share ID |

**Returns:** `ApiStorageSharesGetResponse`

**CLI:** `hoody storage shares get`

---

### `list`

**GET** `/api/v1/storage/shares`

List all your storage shares

```typescript
client.api.storage.shares.list(options?: { realm_id?: string }): Promise<ApiStorageSharesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageSharesListResponse`

**CLI:** `hoody storage shares list`

---

### `listAll`

**GET** `/api/v1/storage/shares`

List all your storage shares (collect all pages)

```typescript
client.api.storage.shares.listAll(options?: { realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

---

### `listByComputer`

**GET** `/api/v1/computers/{id}/storage/shares`

List storage shares

```typescript
client.api.storage.shares.listByComputer(id: string, options?: { target_type?: "computer" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string }): Promise<ApiStorageSharesListByComputerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `target_type` | `"computer" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageSharesListByComputerResponse`

**CLI:** `hoody storage computers shares list`

---

### `listByComputerAll`

**GET** `/api/v1/computers/{id}/storage/shares`

List storage shares (collect all pages)

```typescript
client.api.storage.shares.listByComputerAll(id: string, options?: { target_type?: "computer" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `target_type` | `"computer" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

---

### `listByComputerIterator`

**GET** `/api/v1/computers/{id}/storage/shares`

List storage shares (async iterator)

```typescript
client.api.storage.shares.listByComputerIterator(id: string, options?: { target_type?: "computer" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `target_type` | `"computer" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/storage/shares`

List all your storage shares (async iterator)

```typescript
client.api.storage.shares.listIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/computers/{id}/storage/shares/{shareId}`

Update storage share

```typescript
client.api.storage.shares.update(id: string, shareId: string, data: ApiStorageSharesUpdateRequest): Promise<ApiStorageSharesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source computer ID |
| `shareId` | `string` | Yes | path | Share ID |
| `data` | `ApiStorageSharesUpdateRequest` | Yes | body |  |

**Returns:** `ApiStorageSharesUpdateResponse`

**CLI:** `hoody storage shares update`

---

## `client.api.support` (1 method)

### `getLimits`

**GET** `/api/v1/support/limits`

Your support limits

```typescript
client.api.support.getLimits(): Promise<ApiSupportGetLimitsResponse>
```

**Returns:** `ApiSupportGetLimitsResponse`

**CLI:** `hoody support limits get`

---

## `client.api.support.tickets` (10 methods)

### `close`

**POST** `/api/v1/support/tickets/{id}/close`

Close a support ticket

```typescript
client.api.support.tickets.close(id: string): Promise<ApiSupportTicketsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ticket id |

**Returns:** `ApiSupportTicketsCloseResponse`

**CLI:** `hoody support close`

---

### `create`

**POST** `/api/v1/support/tickets`

Open a support ticket

```typescript
client.api.support.tickets.create(data: ApiSupportTicketsCreateRequest): Promise<ApiSupportTicketsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiSupportTicketsCreateRequest` | Yes | body |  |

**Returns:** `ApiSupportTicketsCreateResponse`

---

### `get`

**GET** `/api/v1/support/tickets/{id}`

Read a support ticket

```typescript
client.api.support.tickets.get(id: string, options?: { before_seq?: number; limit?: number }): Promise<ApiSupportTicketsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ticket id |
| `before_seq` | `number` | No | query | Only messages older than this `seq` (pass the smallest `seq` you have). Omit for the latest page, which also marks the ticket read. |
| `limit` | `number` | No | query | Messages per page |

**Returns:** `ApiSupportTicketsGetResponse`

**CLI:** `hoody support get`

---

### `getByKey`

**GET** `/api/v1/support/tickets/by-key`

Find the ticket a create with a client_key made

```typescript
client.api.support.tickets.getByKey(options: { client_key: string }): Promise<ApiSupportTicketsGetByKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `client_key` | `string` | Yes | query | The `client_key` your create or reply sent, exactly as sent. In a raw HTTP query string, URL-encode it (encode `+`, `&`, `#`, `%` and any non-ASCII character); the SDK and CLI encode it for you, so pass the plain key. |

**Returns:** `ApiSupportTicketsGetByKeyResponse`

**CLI:** `hoody support keys get`

---

### `getMessageByKey`

**GET** `/api/v1/support/tickets/{id}/messages/by-key`

Find the reply a client_key added to a ticket

```typescript
client.api.support.tickets.getMessageByKey(id: string, options: { client_key: string }): Promise<ApiSupportTicketsGetMessageByKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ticket id |
| `client_key` | `string` | Yes | query | The `client_key` your create or reply sent, exactly as sent. In a raw HTTP query string, URL-encode it (encode `+`, `&`, `#`, `%` and any non-ASCII character); the SDK and CLI encode it for you, so pass the plain key. |

**Returns:** `ApiSupportTicketsGetMessageByKeyResponse`

**CLI:** `hoody support messages keys get`

---

### `list`

**GET** `/api/v1/support/tickets`

List your support tickets

```typescript
client.api.support.tickets.list(options?: { status?: "open" | "waiting_user" | "closed"; cursor?: string; limit?: number }): Promise<ApiSupportTicketsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `status` | `"open" \| "waiting_user" \| "closed"` | No | query | Only tickets in this status (open: waiting for support; waiting_user: support answered; closed). Omit for all. |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |
| `limit` | `number` | No | query | Tickets per page |

**Returns:** `ApiSupportTicketsListResponse`

**CLI:** `hoody support list`

---

### `listAll`

**GET** `/api/v1/support/tickets`

List your support tickets (collect all pages)

```typescript
client.api.support.tickets.listAll(options?: { status?: "open" | "waiting_user" | "closed"; cursor?: string; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `status` | `"open" \| "waiting_user" \| "closed"` | No | query | Only tickets in this status (open: waiting for support; waiting_user: support answered; closed). Omit for all. |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |
| `limit` | `number` | No | query | Tickets per page |

**Returns:** `unknown[]`

---

### `listChanges`

**GET** `/api/v1/support/tickets/changes`

Poll for ticket changes

```typescript
client.api.support.tickets.listChanges(options?: { since?: string; limit?: number }): Promise<ApiSupportTicketsListChangesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `string` | No | query | `next_since` of the previous call |
| `limit` | `number` | No | query | Changed tickets per call; `has_more` is true when more are waiting |

**Returns:** `ApiSupportTicketsListChangesResponse`

**CLI:** `hoody support changes list`

---

### `listIterator`

**GET** `/api/v1/support/tickets`

List your support tickets (async iterator)

```typescript
client.api.support.tickets.listIterator(options?: { status?: "open" | "waiting_user" | "closed"; cursor?: string; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `status` | `"open" \| "waiting_user" \| "closed"` | No | query | Only tickets in this status (open: waiting for support; waiting_user: support answered; closed). Omit for all. |
| `cursor` | `string` | No | query | `next_cursor` of the previous page |
| `limit` | `number` | No | query | Tickets per page |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `reply`

**POST** `/api/v1/support/tickets/{id}/messages`

Reply to a support ticket

```typescript
client.api.support.tickets.reply(id: string, data: ApiSupportTicketsReplyRequest): Promise<ApiSupportTicketsReplyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ticket id |
| `data` | `ApiSupportTicketsReplyRequest` | Yes | body |  |

**Returns:** `ApiSupportTicketsReplyResponse`

---

## `client.api.users` (9 methods)

### `completeOnboardingMilestone`

**POST** `/api/v1/users/me/onboarding`

Mark an onboarding milestone as completed

```typescript
client.api.users.completeOnboardingMilestone(data: ApiUsersCompleteOnboardingMilestoneRequest): Promise<ApiUsersCompleteOnboardingMilestoneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersCompleteOnboardingMilestoneRequest` | Yes | body |  |

**Returns:** `ApiUsersCompleteOnboardingMilestoneResponse`

**CLI:** `hoody users onboardingmilestones complete`

---

### `get`

**GET** `/api/v1/users/{id}`

Get user by ID

```typescript
client.api.users.get(id: string): Promise<ApiUsersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | User ID to retrieve |

**Returns:** `ApiUsersGetResponse`

**CLI:** `hoody users get`

---

### `getFreeTierStatus`

**GET** `/api/v1/users/me/free-tier-status`

Get free-tier claim status

```typescript
client.api.users.getFreeTierStatus(): Promise<ApiUsersGetFreeTierStatusResponse>
```

**Returns:** `ApiUsersGetFreeTierStatusResponse`

**CLI:** `hoody users freetier status`

---

### `listSecurityHistory`

**GET** `/api/v1/users/me/security-history`

Get your account security history

```typescript
client.api.users.listSecurityHistory(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean }): Promise<ApiUsersListSecurityHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `ApiUsersListSecurityHistoryResponse`

**CLI:** `hoody users securityhistory list`

---

### `listSecurityHistoryAll`

**GET** `/api/v1/users/me/security-history`

Get your account security history (collect all pages)

```typescript
client.api.users.listSecurityHistoryAll(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `unknown[]`

---

### `listSecurityHistoryIterator`

**GET** `/api/v1/users/me/security-history`

Get your account security history (async iterator)

```typescript
client.api.users.listSecurityHistoryIterator(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `redeemInvite`

**POST** `/api/v1/users/me/redeem-invite`

Redeem a beta invite code

```typescript
client.api.users.redeemInvite(data: ApiUsersRedeemInviteRequest): Promise<ApiUsersRedeemInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersRedeemInviteRequest` | Yes | body |  |

**Returns:** `ApiUsersRedeemInviteResponse`

**CLI:** `hoody users invites redeem`

---

### `retrySetup`

**POST** `/api/v1/users/me/retry-setup`

Retry free-tier account setup

```typescript
client.api.users.retrySetup(data: ApiUsersRetrySetupRequest): Promise<ApiUsersRetrySetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersRetrySetupRequest` | Yes | body |  |

**Returns:** `ApiUsersRetrySetupResponse`

**CLI:** `hoody users setup retry`

---

### `update`

**PUT** `/api/v1/users/{id}`

Update user profile

```typescript
client.api.users.update(id: string, data: ApiUsersUpdateRequest): Promise<ApiUsersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | User ID to update |
| `data` | `ApiUsersUpdateRequest` | Yes | body |  |

**Returns:** `ApiUsersUpdateResponse`

**CLI:** `hoody users update`

---

## `client.api.vault` (8 methods)

### `clear`

**DELETE** `/api/v1/vault`

Clear the vault of the current realm

```typescript
client.api.vault.clear(options?: { realm_id?: string }): Promise<ApiVaultClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `ApiVaultClearResponse`

**CLI:** `hoody vault clear`

---

### `delete`

**DELETE** `/api/v1/vault/keys/{key}`

Delete vault key

```typescript
client.api.vault.delete(key: string, options?: { realm_id?: string }): Promise<ApiVaultDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `ApiVaultDeleteResponse`

**CLI:** `hoody vault delete`

---

### `get`

**GET** `/api/v1/vault/keys/{key}`

Get vault key

```typescript
client.api.vault.get(key: string, options?: { realm_id?: string }): Promise<ApiVaultGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `ApiVaultGetResponse`

**CLI:** `hoody vault get`

---

### `getStats`

**GET** `/api/v1/vault/stats`

Get vault statistics

```typescript
client.api.vault.getStats(options?: { realm_id?: string }): Promise<ApiVaultGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `ApiVaultGetStatsResponse`

**CLI:** `hoody vault stats`

---

### `list`

**GET** `/api/v1/vault/keys`

List vault keys

```typescript
client.api.vault.list(options?: { realm_id?: string }): Promise<ApiVaultListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `ApiVaultListResponse`

**CLI:** `hoody vault list`

---

### `listAll`

**GET** `/api/v1/vault/keys`

List vault keys (collect all pages)

```typescript
client.api.vault.listAll(options?: { realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/vault/keys`

List vault keys (async iterator)

```typescript
client.api.vault.listIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/api/v1/vault/keys/{key}`

Set vault key

```typescript
client.api.vault.set(key: string, data: ApiVaultSetRequest, options?: { realm_id?: string; ifMatch?: string; ifNoneMatch?: "*" }): Promise<ApiVaultSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `data` | `ApiVaultSetRequest` | Yes | body |  |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive: uppercase is normalized to lowercase. |
| `ifMatch` | `string` | No | header | Save only over the version you read: the ETag from an earlier GET or PUT of this key. If the key as stored now no longer matches it (value, metadata or millisecond timestamps), or no longer exists, the answer is 412 PRECONDITION_FAILED and nothing is saved. `*` matches any existing version. |
| `ifNoneMatch` | `"*"` | No | header | Send `*` to create the key only if it does not exist yet. If it exists, the answer is 412 PRECONDITION_FAILED and nothing is saved. |

**Returns:** `ApiVaultSetResponse`

**CLI:** `hoody vault set`

---

## `client.api.wallet` (8 methods)

### `claimGithubBonus`

**POST** `/api/v1/wallet/github-bonus/claim`

Claim the GitHub connection bonus

```typescript
client.api.wallet.claimGithubBonus(): Promise<ApiWalletClaimGithubBonusResponse>
```

**Returns:** `ApiWalletClaimGithubBonusResponse`

**CLI:** `hoody wallet githubbonus claim`

---

### `getBalances`

**GET** `/api/v1/wallet/balances`

Get aggregate balances (general + AI)

```typescript
client.api.wallet.getBalances(): Promise<ApiWalletGetBalancesResponse>
```

**Returns:** `ApiWalletGetBalancesResponse`

**CLI:** `hoody wallet balances get`

---

### `getGeneralBalance`

**GET** `/api/v1/wallet/balances/general`

Get general balance only

```typescript
client.api.wallet.getGeneralBalance(): Promise<ApiWalletGetGeneralBalanceResponse>
```

**Returns:** `ApiWalletGetGeneralBalanceResponse`

**CLI:** `hoody wallet balances general get`

---

### `getGithubBonusStatus`

**GET** `/api/v1/wallet/github-bonus`

Get GitHub connection bonus status

```typescript
client.api.wallet.getGithubBonusStatus(): Promise<ApiWalletGetGithubBonusStatusResponse>
```

**Returns:** `ApiWalletGetGithubBonusStatusResponse`

**CLI:** `hoody wallet githubbonus status`

---

### `getTransaction`

**GET** `/api/v1/wallet/transactions/{id}`

Get transaction by ID

```typescript
client.api.wallet.getTransaction(id: string): Promise<ApiWalletGetTransactionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletGetTransactionResponse`

**CLI:** `hoody wallet transactions get`

---

### `listTransactions`

**GET** `/api/v1/wallet/transactions`

List transactions

```typescript
client.api.wallet.listTransactions(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string }): Promise<ApiWalletListTransactionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `ApiWalletListTransactionsResponse`

**CLI:** `hoody wallet transactions list`

---

### `listTransactionsAll`

**GET** `/api/v1/wallet/transactions`

List transactions (collect all pages)

```typescript
client.api.wallet.listTransactionsAll(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `unknown[]`

---

### `listTransactionsIterator`

**GET** `/api/v1/wallet/transactions`

List transactions (async iterator)

```typescript
client.api.wallet.listTransactionsIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.api.wallet.credits` (5 methods)

### `get`

**GET** `/api/v1/wallet/balances/ai`

Get AI balance (limit, usage, remaining)

```typescript
client.api.wallet.credits.get(): Promise<ApiWalletCreditsGetResponse>
```

**Returns:** `ApiWalletCreditsGetResponse`

**CLI:** `hoody wallet credits get`

---

### `listFees`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history

```typescript
client.api.wallet.credits.listFees(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): Promise<ApiWalletCreditsListFeesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiWalletCreditsListFeesResponse`

**CLI:** `hoody wallet credits fees list`

---

### `listFeesAll`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (collect all pages)

```typescript
client.api.wallet.credits.listFeesAll(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

---

### `listFeesIterator`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (async iterator)

```typescript
client.api.wallet.credits.listFeesIterator(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `transfer`

**POST** `/api/v1/wallet/transfers`

Transfer from general balance to AI credits

```typescript
client.api.wallet.credits.transfer(data: ApiWalletCreditsTransferRequest): Promise<ApiWalletCreditsTransferResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletCreditsTransferRequest` | Yes | body |  |

**Returns:** `ApiWalletCreditsTransferResponse`

**CLI:** `hoody wallet credits transfer`

---

## `client.api.wallet.invoices` (6 methods)

### `create`

**POST** `/api/v1/wallet/invoices/generate/{id}`

Generate invoice for transaction

```typescript
client.api.wallet.invoices.create(id: string): Promise<ApiWalletInvoicesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletInvoicesCreateResponse`

**CLI:** `hoody wallet invoices create`

---

### `download`

**GET** `/api/v1/wallet/invoices/{id}/pdf`

Download invoice PDF

```typescript
client.api.wallet.invoices.download(id: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody wallet invoices download`

---

### `get`

**GET** `/api/v1/wallet/invoices/{id}`

Get invoice by ID

```typescript
client.api.wallet.invoices.get(id: string): Promise<ApiWalletInvoicesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletInvoicesGetResponse`

**CLI:** `hoody wallet invoices get`

---

### `list`

**GET** `/api/v1/wallet/invoices/`

Get all invoices

```typescript
client.api.wallet.invoices.list(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string }): Promise<ApiWalletInvoicesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `ApiWalletInvoicesListResponse`

**CLI:** `hoody wallet invoices list`

---

### `listAll`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (collect all pages)

```typescript
client.api.wallet.invoices.listAll(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (async iterator)

```typescript
client.api.wallet.invoices.listIterator(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.api.wallet.payments` (15 methods)

### `createCardCheckout`

**POST** `/api/v1/wallet/payments/card/checkout`

Start a card payment (card checkout)

```typescript
client.api.wallet.payments.createCardCheckout(data: ApiWalletPaymentsCreateCardCheckoutRequest): Promise<ApiWalletPaymentsCreateCardCheckoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletPaymentsCreateCardCheckoutRequest` | Yes | body |  |

**Returns:** `ApiWalletPaymentsCreateCardCheckoutResponse`

**CLI:** `hoody wallet payments card checkout create`

---

### `createCryptoInvoice`

**POST** `/api/v1/wallet/payments/crypto/invoice`

Start a crypto payment (hosted invoice)

```typescript
client.api.wallet.payments.createCryptoInvoice(data: ApiWalletPaymentsCreateCryptoInvoiceRequest): Promise<ApiWalletPaymentsCreateCryptoInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletPaymentsCreateCryptoInvoiceRequest` | Yes | body |  |

**Returns:** `ApiWalletPaymentsCreateCryptoInvoiceResponse`

**CLI:** `hoody wallet payments crypto invoices create`

---

### `createMethod`

**POST** `/api/v1/wallet/payment-methods/`

Add a new payment method

```typescript
client.api.wallet.payments.createMethod(data: ApiWalletPaymentsCreateMethodRequest): Promise<ApiWalletPaymentsCreateMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletPaymentsCreateMethodRequest` | Yes | body |  |

**Returns:** `ApiWalletPaymentsCreateMethodResponse`

**CLI:** `hoody wallet payments methods create`

---

### `deleteMethod`

**DELETE** `/api/v1/wallet/payment-methods/{id}`

Delete a payment method

```typescript
client.api.wallet.payments.deleteMethod(id: string): Promise<ApiWalletPaymentsDeleteMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletPaymentsDeleteMethodResponse`

**CLI:** `hoody wallet payments methods delete`

---

### `getAvailability`

**GET** `/api/v1/wallet/payment-availability`

Get top-up payment availability (providers, bounds, AI transfer fee)

```typescript
client.api.wallet.payments.getAvailability(): Promise<ApiWalletPaymentsGetAvailabilityResponse>
```

**Returns:** `ApiWalletPaymentsGetAvailabilityResponse`

**CLI:** `hoody wallet payments availability get`

---

### `getCardIntent`

**GET** `/api/v1/wallet/payments/card/intents/{id}`

Get a card payment intent

```typescript
client.api.wallet.payments.getCardIntent(id: string): Promise<ApiWalletPaymentsGetCardIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletPaymentsGetCardIntentResponse`

**CLI:** `hoody wallet payments card intents get`

---

### `getCryptoIntent`

**GET** `/api/v1/wallet/payments/crypto/intents/{id}`

Get a crypto payment intent

```typescript
client.api.wallet.payments.getCryptoIntent(id: string): Promise<ApiWalletPaymentsGetCryptoIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletPaymentsGetCryptoIntentResponse`

**CLI:** `hoody wallet payments crypto intents get`

---

### `getMethod`

**GET** `/api/v1/wallet/payment-methods/{id}`

Get payment method by ID

```typescript
client.api.wallet.payments.getMethod(id: string): Promise<ApiWalletPaymentsGetMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletPaymentsGetMethodResponse`

**CLI:** `hoody wallet payments methods get`

---

### `listCardIntents`

**GET** `/api/v1/wallet/payments/card/intents`

List card payment intents

```typescript
client.api.wallet.payments.listCardIntents(options?: { limit?: number; offset?: number }): Promise<ApiWalletPaymentsListCardIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `ApiWalletPaymentsListCardIntentsResponse`

**CLI:** `hoody wallet payments card intents list`

---

### `listCryptoIntents`

**GET** `/api/v1/wallet/payments/crypto/intents`

List crypto payment intents

```typescript
client.api.wallet.payments.listCryptoIntents(options?: { limit?: number; offset?: number }): Promise<ApiWalletPaymentsListCryptoIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `ApiWalletPaymentsListCryptoIntentsResponse`

**CLI:** `hoody wallet payments crypto intents list`

---

### `listMethods`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods

```typescript
client.api.wallet.payments.listMethods(options?: { page?: number; limit?: number }): Promise<ApiWalletPaymentsListMethodsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |

**Returns:** `ApiWalletPaymentsListMethodsResponse`

**CLI:** `hoody wallet payments methods list`

---

### `listMethodsAll`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (collect all pages)

```typescript
client.api.wallet.payments.listMethodsAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |

**Returns:** `unknown[]`

---

### `listMethodsIterator`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (async iterator)

```typescript
client.api.wallet.payments.listMethodsIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `setDefaultMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}/default`

Set a payment method as default

```typescript
client.api.wallet.payments.setDefaultMethod(id: string): Promise<ApiWalletPaymentsSetDefaultMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletPaymentsSetDefaultMethodResponse`

**CLI:** `hoody wallet payments methods default set`

---

### `updateMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}`

Update a payment method

```typescript
client.api.wallet.payments.updateMethod(id: string, data: ApiWalletPaymentsUpdateMethodRequest): Promise<ApiWalletPaymentsUpdateMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiWalletPaymentsUpdateMethodRequest` | Yes | body |  |

**Returns:** `ApiWalletPaymentsUpdateMethodResponse`

**CLI:** `hoody wallet payments methods update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
