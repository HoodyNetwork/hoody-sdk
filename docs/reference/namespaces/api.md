# `api` — 303 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.api`

```typescript
import * as api from 'hoody-sdk/api';
```

---

## `client.api.activity` (4 methods)

### `getStats`

**GET** `/api/v1/users/auth/activity/stats`

Get activity stats

```typescript
client.api.activity.getStats(options?: { cache?: boolean | number }): Promise<ApiActivityGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiActivityGetStatsResponse`

**CLI:** `hoody activity stats`

---

### `list`

**GET** `/api/v1/users/auth/activity`

Get activity logs

```typescript
client.api.activity.list(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string; cache?: boolean | number }): Promise<ApiActivityListResponse>
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiActivityListResponse`

**CLI:** `hoody activity list`

---

### `listAll`

**GET** `/api/v1/users/auth/activity`

Get activity logs (collect all pages)

```typescript
client.api.activity.listAll(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/users/auth/activity`

Get activity logs (async iterator)

```typescript
client.api.activity.listIterator(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.api.ai` (1 method)

### `listModels`

**GET** `/api/v1/ai/models`

List available AI models (Hoody catalog)

```typescript
client.api.ai.listModels(options?: { cache?: boolean | number }): Promise<ApiAiListModelsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAiListModelsResponse`

**CLI:** `hoody ai models list`

---

## `client.api.auth` (11 methods)

### `createIdentityClaim`

**POST** `/api/v1/users/auth/identity-claim`

Issue a fresh audience-bound identity claim

```typescript
client.api.auth.createIdentityClaim(data: ApiAuthCreateIdentityClaimRequest, options?: { cache?: boolean | number }): Promise<ApiAuthCreateIdentityClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthCreateIdentityClaimRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthCreateIdentityClaimResponse`

**CLI:** `hoody auth claims create`

---

### `getConfig`

**GET** `/api/v1/auth/config`

Get the public sign-in configuration

```typescript
client.api.auth.getConfig(options?: { cache?: boolean | number }): Promise<ApiAuthGetConfigResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthGetConfigResponse`

**CLI:** `hoody auth config get`

---

### `login`

**POST** `/api/v1/users/auth/login`

Login with username and password

```typescript
client.api.auth.login(data: ApiAuthLoginRequest, options?: { cache?: boolean | number }): Promise<ApiAuthLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthLoginRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthLoginResponse`

---

### `logoutAll`

**POST** `/api/v1/users/auth/logout`

Log out everywhere

```typescript
client.api.auth.logoutAll(options?: { cache?: boolean | number }): Promise<ApiAuthLogoutAllResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthLogoutAllResponse`

---

### `recoverPassword`

**POST** `/api/v1/auth/forgot-password`

Request password reset

```typescript
client.api.auth.recoverPassword(data: ApiAuthRecoverPasswordRequest, options?: { cache?: boolean | number }): Promise<ApiAuthRecoverPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthRecoverPasswordRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthRecoverPasswordResponse`

**CLI:** `hoody auth password recover`

---

### `refresh`

**POST** `/api/v1/users/auth/refresh`

Refresh access token

```typescript
client.api.auth.refresh(data: ApiAuthRefreshRequest, options?: { cache?: boolean | number }): Promise<ApiAuthRefreshResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthRefreshRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthRefreshResponse`

**CLI:** `hoody auth refresh`

---

### `resetPassword`

**POST** `/api/v1/auth/reset-password`

Reset password

```typescript
client.api.auth.resetPassword(data: ApiAuthResetPasswordRequest, options?: { cache?: boolean | number }): Promise<ApiAuthResetPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthResetPasswordRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthResetPasswordResponse`

**CLI:** `hoody auth password reset`

---

### `sendVerificationEmail`

**POST** `/api/v1/auth/resend-verification`

Resend verification email

```typescript
client.api.auth.sendVerificationEmail(data: ApiAuthSendVerificationEmailRequest, options?: { cache?: boolean | number }): Promise<ApiAuthSendVerificationEmailResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthSendVerificationEmailRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthSendVerificationEmailResponse`

**CLI:** `hoody auth email verification send`

---

### `signup`

**POST** `/api/v1/auth/signup`

Sign up with email and password

```typescript
client.api.auth.signup(data: ApiAuthSignupRequest, options?: { cache?: boolean | number }): Promise<ApiAuthSignupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthSignupRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthSignupResponse`

---

### `verifyEmail`

**POST** `/api/v1/auth/verify-email`

Verify email address

```typescript
client.api.auth.verifyEmail(data: ApiAuthVerifyEmailRequest, options?: { cache?: boolean | number }): Promise<ApiAuthVerifyEmailResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthVerifyEmailRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthVerifyEmailResponse`

**CLI:** `hoody auth email verify`

---

### `whoami`

**GET** `/api/v1/users/auth/me`

Get current user profile

```typescript
client.api.auth.whoami(options?: { cache?: boolean | number }): Promise<ApiAuthWhoamiResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthWhoamiResponse`

**CLI:** `hoody auth whoami`

---

## `client.api.auth.device` (5 methods)

### `deny`

**POST** `/api/v1/auth/device/deny`

Refuse the device ('Don't authorize')

```typescript
client.api.auth.device.deny(data: ApiAuthDeviceDenyRequest, options?: { cache?: boolean | number }): Promise<ApiAuthDeviceDenyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceDenyRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthDeviceDenyResponse`

---

### `login`

**POST** `/api/v1/auth/device/login`

Password sign-in for the device authorize step (cookie + ticket gated)

```typescript
client.api.auth.device.login(data: ApiAuthDeviceLoginRequest, options?: { cache?: boolean | number }): Promise<ApiAuthDeviceLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceLoginRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthDeviceLoginResponse`

---

### `poll`

**POST** `/api/v1/auth/device/token`

Poll for device-flow tokens (RFC-8628-inspired)

```typescript
client.api.auth.device.poll(data: ApiAuthDevicePollRequest, options?: { cache?: boolean | number }): Promise<ApiAuthDevicePollResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDevicePollRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthDevicePollResponse`

**CLI:** `hoody auth device poll`

---

### `start`

**POST** `/api/v1/auth/device/code`

Start a device authorization flow (RFC-8628-inspired)

```typescript
client.api.auth.device.start(data: ApiAuthDeviceStartRequest, options?: { cache?: boolean | number }): Promise<ApiAuthDeviceStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceStartRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthDeviceStartResponse`

**CLI:** `hoody auth device start`

---

### `verifyCode`

**POST** `/api/v1/auth/device/verify_code`

Confirm a device user_code (verification page)

```typescript
client.api.auth.device.verifyCode(data: ApiAuthDeviceVerifyCodeRequest, options?: { cache?: boolean | number }): Promise<ApiAuthDeviceVerifyCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthDeviceVerifyCodeRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthDeviceVerifyCodeResponse`

---

## `client.api.auth.oauth` (4 methods)

### `authorize`

**POST** `/api/v1/auth/authorize`

Begin a PKCE OAuth authorization

```typescript
client.api.auth.oauth.authorize(data: ApiAuthOauthAuthorizeRequest, options?: { cache?: boolean | number }): Promise<ApiAuthOauthAuthorizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthAuthorizeRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthOauthAuthorizeResponse`

**CLI:** `hoody auth oauth authorize`

---

### `cancelIntent`

**POST** `/api/v1/auth/intent/cancel`

Cancel a pending OAuth intent or 2FA temp_token

```typescript
client.api.auth.oauth.cancelIntent(options?: { cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth intents cancel`

---

### `exchange`

**POST** `/api/v1/auth/exchange`

Exchange a PKCE authorization code for tokens

```typescript
client.api.auth.oauth.exchange(data: ApiAuthOauthExchangeRequest, options?: { cache?: boolean | number }): Promise<ApiAuthOauthExchangeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthExchangeRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthOauthExchangeResponse`

**CLI:** `hoody auth oauth exchange`

---

### `startLaunch`

**POST** `/api/v1/auth/launch/initiate`

Initiate OAuth popup-handoff launch

```typescript
client.api.auth.oauth.startLaunch(data: ApiAuthOauthStartLaunchRequest, options?: { cache?: boolean | number }): Promise<ApiAuthOauthStartLaunchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthOauthStartLaunchRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthOauthStartLaunchResponse`

---

## `client.api.auth.tokens` (14 methods)

### `addRealm`

**POST** `/api/v1/auth/tokens/{id}/add-realm`

Add realm to auth token

```typescript
client.api.auth.tokens.addRealm(id: string, data: ApiAuthTokensAddRealmRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensAddRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensAddRealmRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensAddRealmResponse`

**CLI:** `hoody auth tokens realms add`

---

### `copy`

**POST** `/api/v1/auth/tokens/{id}/copy`

Copy auth token

```typescript
client.api.auth.tokens.copy(id: string, data: ApiAuthTokensCopyRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |
| `data` | `ApiAuthTokensCopyRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensCopyResponse`

**CLI:** `hoody auth tokens copy`

---

### `create`

**POST** `/api/v1/auth/tokens`

Create a new auth token

```typescript
client.api.auth.tokens.create(data: ApiAuthTokensCreateRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensCreateResponse`

**CLI:** `hoody auth tokens create`

---

### `delete`

**DELETE** `/api/v1/auth/tokens/{id}`

Delete auth token

```typescript
client.api.auth.tokens.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiAuthTokensDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensDeleteResponse`

**CLI:** `hoody auth tokens delete`

---

### `get`

**GET** `/api/v1/auth/tokens/{id}`

Get auth token by ID

```typescript
client.api.auth.tokens.get(id: string, options?: { cache?: boolean | number }): Promise<ApiAuthTokensGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensGetResponse`

**CLI:** `hoody auth tokens get`

---

### `getCurrent`

**GET** `/api/v1/auth/tokens/me`

Get current auth token details

```typescript
client.api.auth.tokens.getCurrent(options?: { cache?: boolean | number }): Promise<ApiAuthTokensGetCurrentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensGetCurrentResponse`

**CLI:** `hoody auth tokens get`

---

### `getPublicProfile`

**GET** `/api/v1/auth/tokens/public-profiles/{public_key}`

Get auth token public profile by public key

```typescript
client.api.auth.tokens.getPublicProfile(public_key: string, options?: { cache?: boolean | number }): Promise<ApiAuthTokensGetPublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `public_key` | `string` | Yes | path | ED25519 public key to resolve |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensGetPublicProfileResponse`

**CLI:** `hoody auth tokens profiles get`

---

### `list`

**GET** `/api/v1/auth/tokens`

List auth tokens

```typescript
client.api.auth.tokens.list(options?: { cache?: boolean | number }): Promise<ApiAuthTokensListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensListResponse`

**CLI:** `hoody auth tokens list`

---

### `listAll`

**GET** `/api/v1/auth/tokens`

List auth tokens (collect all pages)

```typescript
client.api.auth.tokens.listAll(options?: { cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/auth/tokens`

List auth tokens (async iterator)

```typescript
client.api.auth.tokens.listIterator(options?: { cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listTemplates`

**GET** `/api/v1/auth/tokens/templates`

List permission templates

```typescript
client.api.auth.tokens.listTemplates(options?: { cache?: boolean | number }): Promise<ApiAuthTokensListTemplatesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensListTemplatesResponse`

**CLI:** `hoody auth tokens templates list`

---

### `removeRealm`

**POST** `/api/v1/auth/tokens/{id}/remove-realm`

Remove realm from auth token

```typescript
client.api.auth.tokens.removeRealm(id: string, data: ApiAuthTokensRemoveRealmRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensRemoveRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensRemoveRealmRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensRemoveRealmResponse`

**CLI:** `hoody auth tokens realms remove`

---

### `update`

**PUT** `/api/v1/auth/tokens/{id}`

Update auth token

```typescript
client.api.auth.tokens.update(id: string, data: ApiAuthTokensUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token to update |
| `data` | `ApiAuthTokensUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensUpdateResponse`

**CLI:** `hoody auth tokens update`

---

### `updatePublicProfile`

**PUT** `/api/v1/auth/tokens/me/public-profile`

Update current auth token public profile

```typescript
client.api.auth.tokens.updatePublicProfile(data: ApiAuthTokensUpdatePublicProfileRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTokensUpdatePublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensUpdatePublicProfileRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTokensUpdatePublicProfileResponse`

**CLI:** `hoody auth tokens profiles update`

---

## `client.api.auth.twoFactor` (8 methods)

### `confirmSetup`

**POST** `/api/v1/users/auth/2fa/verify-setup`

Complete 2FA Setup

```typescript
client.api.auth.twoFactor.confirmSetup(data: ApiAuthTwoFactorConfirmSetupRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorConfirmSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorConfirmSetupRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorConfirmSetupResponse`

**CLI:** `hoody auth 2fa setup confirm`

---

### `disable`

**DELETE** `/api/v1/users/auth/2fa`

Disable 2FA

```typescript
client.api.auth.twoFactor.disable(data: ApiAuthTwoFactorDisableRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorDisableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorDisableRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorDisableResponse`

**CLI:** `hoody auth 2fa disable`

---

### `disableTokenGate`

**PUT** `/api/v1/users/auth/2fa/token-gate`

Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.disableTokenGate(data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody auth 2fa gate disable`

---

### `enableTokenGate`

**PUT** `/api/v1/users/auth/2fa/token-gate`

Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.enableTokenGate(data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody auth 2fa gate enable`

---

### `getStatus`

**GET** `/api/v1/users/auth/2fa/status`

Get 2FA Status

```typescript
client.api.auth.twoFactor.getStatus(options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorGetStatusResponse`

**CLI:** `hoody auth 2fa status`

---

### `rotateBackupCodes`

**POST** `/api/v1/users/auth/2fa/backup-codes/regenerate`

Regenerate Backup Codes

```typescript
client.api.auth.twoFactor.rotateBackupCodes(data: ApiAuthTwoFactorRotateBackupCodesRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorRotateBackupCodesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorRotateBackupCodesRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorRotateBackupCodesResponse`

**CLI:** `hoody auth 2fa backup codes rotate`

---

### `startSetup`

**POST** `/api/v1/users/auth/2fa/setup`

Initialize 2FA Setup

```typescript
client.api.auth.twoFactor.startSetup(data: ApiAuthTwoFactorStartSetupRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorStartSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorStartSetupRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorStartSetupResponse`

**CLI:** `hoody auth 2fa setup start`

---

### `verify`

**POST** `/api/v1/users/auth/2fa/verify`

Verify 2FA Code During Login

```typescript
client.api.auth.twoFactor.verify(data: ApiAuthTwoFactorVerifyRequest, options?: { cache?: boolean | number }): Promise<ApiAuthTwoFactorVerifyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTwoFactorVerifyRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiAuthTwoFactorVerifyResponse`

**CLI:** `hoody auth 2fa verify`

---

## `client.api.containers` (23 methods)

### `copy`

**POST** `/api/v1/containers/{id}/copy`

Copy a container

```typescript
client.api.containers.copy(id: string, data: ApiContainersCopyRequest, options?: { cache?: boolean | number }): Promise<ApiContainersCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the source container to copy |
| `data` | `ApiContainersCopyRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersCopyResponse`

**CLI:** `hoody containers copy`

---

### `create`

**POST** `/api/v1/projects/{id}/containers`

Create a new container

```typescript
client.api.containers.create(id: string, data: ApiContainersCreateRequest, options?: { cache?: boolean | number }): Promise<ApiContainersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiContainersCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersCreateResponse`

**CLI:** `hoody containers create`

---

### `createClaim`

**POST** `/api/v1/containers/{id}/authorize`

Authorize Container Access

```typescript
client.api.containers.createClaim(id: string, options?: { cache?: boolean | number }): Promise<ApiContainersCreateClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID (24-char hex) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersCreateClaimResponse`

**CLI:** `hoody containers claims create`

---

### `delete`

**DELETE** `/api/v1/containers/{id}`

Delete a container

```typescript
client.api.containers.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiContainersDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to delete |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersDeleteResponse`

**CLI:** `hoody containers delete`

---

### `disableKvm`

**PUT** `/api/v1/containers/{id}/kvm`

Enable or disable /dev/kvm (run VMs in the container)

```typescript
client.api.containers.disableKvm(id: string): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |

**Returns:** `any`

**CLI:** `hoody containers kvm disable`

---

### `enableKvm`

**PUT** `/api/v1/containers/{id}/kvm`

Enable or disable /dev/kvm (run VMs in the container)

```typescript
client.api.containers.enableKvm(id: string): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |

**Returns:** `any`

**CLI:** `hoody containers kvm enable`

---

### `get`

**GET** `/api/v1/containers/{id}`

Get a container by ID

```typescript
client.api.containers.get(id: string, options?: { runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; cache?: boolean | number }): Promise<ApiContainersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersGetResponse`

**CLI:** `hoody containers get`

---

### `getProxyUsage`

**GET** `/api/v1/containers/{id}/proxy-usage`

Get proxied-usage documents for a container

```typescript
client.api.containers.getProxyUsage(id: string, options: { from: string; to: string; cache?: boolean | number }): Promise<ApiContainersGetProxyUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container id |
| `from` | `string` | Yes | query | First month, inclusive (YYYY-MM) |
| `to` | `string` | Yes | query | Last month, inclusive (YYYY-MM). Max 12 months. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersGetProxyUsageResponse`

**CLI:** `hoody containers proxy usage`

---

### `getStats`

**GET** `/api/v1/containers/{id}/stats`

Get container resource statistics

```typescript
client.api.containers.getStats(id: string, options?: { cache?: boolean | number }): Promise<ApiContainersGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersGetStatsResponse`

**CLI:** `hoody containers stats`

---

### `list`

**GET** `/api/v1/containers/`

Get all containers

```typescript
client.api.containers.list(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): Promise<ApiContainersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersListResponse`

**CLI:** `hoody containers list`

---

### `listAll`

**GET** `/api/v1/containers/`

Get all containers (collect all pages)

```typescript
client.api.containers.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listByProject`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project

```typescript
client.api.containers.listByProject(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): Promise<ApiContainersListByProjectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersListByProjectResponse`

---

### `listByProjectAll`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project (collect all pages)

```typescript
client.api.containers.listByProjectAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listByProjectIterator`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project (async iterator)

```typescript
client.api.containers.listByProjectIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/containers/`

Get all containers (async iterator)

```typescript
client.api.containers.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listStatusHistory`

**GET** `/api/v1/containers/{id}/status-logs`

Get status logs for a container

```typescript
client.api.containers.listStatusHistory(id: string, options?: { page?: number; limit?: number; sort_by?: "transition_time" | "created_at" | "to_status" | "from_status"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<ApiContainersListStatusHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"transition_time" \| "created_at" \| "to_status" \| "from_status"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersListStatusHistoryResponse`

**CLI:** `hoody containers status history list`

---

### `pause`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.pause(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody containers pause`

---

### `restart`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.restart(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody containers restart`

---

### `resume`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.resume(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody containers resume`

---

### `start`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.start(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to manage |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody containers start`

---

### `stop`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.stop(id: string, data?: object, options?: { force?: boolean }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to manage |
| `data` | `object` | No | body |  |
| `force` | `boolean` | No | option | Kill the container without a graceful shutdown (the force-stop operation). |

**Returns:** `any`

**CLI:** `hoody containers stop`

---

### `sync`

**POST** `/api/v1/containers/{id}/sync`

Sync a copied container with its source

```typescript
client.api.containers.sync(id: string, options?: { cache?: boolean | number }): Promise<ApiContainersSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to sync (must have been created via copy) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersSyncResponse`

**CLI:** `hoody containers sync`

---

### `update`

**PUT** `/api/v1/containers/{id}`

Update a container

```typescript
client.api.containers.update(id: string, data: ApiContainersUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiContainersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to update |
| `data` | `ApiContainersUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersUpdateResponse`

**CLI:** `hoody containers update`

---

## `client.api.containers.env` (4 methods)

### `delete`

**DELETE** `/api/v1/containers/{id}/env/{key}`

Delete a single environment variable

```typescript
client.api.containers.env.delete(id: string, key: string, options?: { cache?: boolean | number }): Promise<ApiContainersEnvDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `key` | `string` | Yes | path | Environment variable key |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersEnvDeleteResponse`

**CLI:** `hoody containers env delete`

---

### `list`

**GET** `/api/v1/containers/{id}/env`

List container environment variables

```typescript
client.api.containers.env.list(id: string, options?: { cache?: boolean | number }): Promise<ApiContainersEnvListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersEnvListResponse`

**CLI:** `hoody containers env list`

---

### `set`

**PUT** `/api/v1/containers/{id}/env/{key}`

Set a single environment variable

```typescript
client.api.containers.env.set(id: string, key: string, data: ApiContainersEnvSetRequest, options?: { cache?: boolean | number }): Promise<ApiContainersEnvSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `key` | `string` | Yes | path | Environment variable key |
| `data` | `ApiContainersEnvSetRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersEnvSetResponse`

**CLI:** `hoody containers env set`

---

### `update`

**PUT** `/api/v1/containers/{id}/env`

Bulk set container environment variables

```typescript
client.api.containers.env.update(id: string, data: ApiContainersEnvUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiContainersEnvUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiContainersEnvUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiContainersEnvUpdateResponse`

**CLI:** `hoody containers env update`

---

## `client.api.events` (8 methods)

### `clear`

**DELETE** `/api/v1/events`

Bulk delete events

```typescript
client.api.events.clear(data: ApiEventsClearRequest, options?: { cache?: boolean | number }): Promise<ApiEventsClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsClearRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsClearResponse`

**CLI:** `hoody events clear`

---

### `delete`

**DELETE** `/api/v1/events/{id}`

Delete a single event

```typescript
client.api.events.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiEventsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Event ID to delete |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsDeleteResponse`

**CLI:** `hoody events delete`

---

### `get`

**GET** `/api/v1/events/{id}`

Get event details by ID

```typescript
client.api.events.get(id: string, options?: { cache?: boolean | number }): Promise<ApiEventsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Event ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsGetResponse`

**CLI:** `hoody events get`

---

### `getStats`

**GET** `/api/v1/events/stats`

Get event statistics

```typescript
client.api.events.getStats(options?: { start_date?: string; end_date?: string; realm_id?: string; cache?: boolean | number }): Promise<ApiEventsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `start_date` | `string` | No | query | Start of time range |
| `end_date` | `string` | No | query | End of time range |
| `realm_id` | `string` | No | query | Filter by realm |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsGetStatsResponse`

**CLI:** `hoody events stats`

---

### `list`

**GET** `/api/v1/events`

List event history

```typescript
client.api.events.list(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean; cache?: boolean | number }): Promise<ApiEventsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsListResponse`

**CLI:** `hoody events list`

---

### `listAll`

**GET** `/api/v1/events`

List event history (collect all pages)

```typescript
client.api.events.listAll(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/events`

List event history (async iterator)

```typescript
client.api.events.listIterator(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | No | query | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | No | query | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `purge`

**POST** `/api/v1/events/cleanup`

Cleanup old events

```typescript
client.api.events.purge(data: ApiEventsPurgeRequest, options?: { cache?: boolean | number }): Promise<ApiEventsPurgeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsPurgeRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiEventsPurgeResponse`

**CLI:** `hoody events purge`

---

## `client.api.firewall` (10 methods)

### `createEgressRule`

**POST** `/api/v1/containers/{id}/firewall/egress`

Add Egress Rule

```typescript
client.api.firewall.createEgressRule(id: string, data: ApiFirewallCreateEgressRuleRequest, options?: { cache?: boolean | number }): Promise<ApiFirewallCreateEgressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallCreateEgressRuleRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallCreateEgressRuleResponse`

**CLI:** `hoody firewall egress create`

---

### `createIngressRule`

**POST** `/api/v1/containers/{id}/firewall/ingress`

Add Ingress Rule

```typescript
client.api.firewall.createIngressRule(id: string, data: ApiFirewallCreateIngressRuleRequest, options?: { cache?: boolean | number }): Promise<ApiFirewallCreateIngressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallCreateIngressRuleRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallCreateIngressRuleResponse`

**CLI:** `hoody firewall ingress create`

---

### `deleteEgressRule`

**DELETE** `/api/v1/containers/{id}/firewall/egress`

Remove Egress Rule(s)

```typescript
client.api.firewall.deleteEgressRule(id: string, data: ApiFirewallDeleteEgressRuleRequest, options?: { cache?: boolean | number }): Promise<ApiFirewallDeleteEgressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallDeleteEgressRuleRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallDeleteEgressRuleResponse`

**CLI:** `hoody firewall egress delete`

---

### `deleteIngressRule`

**DELETE** `/api/v1/containers/{id}/firewall/ingress`

Remove Ingress Rule(s)

```typescript
client.api.firewall.deleteIngressRule(id: string, data: ApiFirewallDeleteIngressRuleRequest, options?: { cache?: boolean | number }): Promise<ApiFirewallDeleteIngressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallDeleteIngressRuleRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallDeleteIngressRuleResponse`

**CLI:** `hoody firewall ingress delete`

---

### `disableEgressRule`

**PATCH** `/api/v1/containers/{id}/firewall/egress`

Toggle Egress Rule State

```typescript
client.api.firewall.disableEgressRule(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall egress disable`

---

### `disableIngressRule`

**PATCH** `/api/v1/containers/{id}/firewall/ingress`

Toggle Ingress Rule State

```typescript
client.api.firewall.disableIngressRule(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall ingress disable`

---

### `enableEgressRule`

**PATCH** `/api/v1/containers/{id}/firewall/egress`

Toggle Egress Rule State

```typescript
client.api.firewall.enableEgressRule(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall egress enable`

---

### `enableIngressRule`

**PATCH** `/api/v1/containers/{id}/firewall/ingress`

Toggle Ingress Rule State

```typescript
client.api.firewall.enableIngressRule(id: string, data?: object): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `object` | No | body |  |

**Returns:** `any`

**CLI:** `hoody firewall ingress enable`

---

### `listRules`

**GET** `/api/v1/containers/{id}/firewall/rules`

List container firewall rules

```typescript
client.api.firewall.listRules(id: string, options?: { cache?: boolean | number }): Promise<ApiFirewallListRulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallListRulesResponse`

**CLI:** `hoody firewall rules list`

---

### `reset`

**POST** `/api/v1/containers/{id}/firewall/reset`

Reset container firewall

```typescript
client.api.firewall.reset(id: string, options?: { cache?: boolean | number }): Promise<ApiFirewallResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiFirewallResetResponse`

**CLI:** `hoody firewall reset`

---

## `client.api.images` (11 methods)

### `buy`

**POST** `/api/v1/images/purchase/{id}`

Purchase image

```typescript
client.api.images.buy(id: string, options?: { cache?: boolean | number }): Promise<ApiImagesBuyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the paid container image to purchase |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesBuyResponse`

**CLI:** `hoody images buy`

---

### `getIcon`

**GET** `/api/v1/images/{id}/icon`

Get image icon

```typescript
client.api.images.getIcon(id: string, options?: { cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | ApiImagesGetIconResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container image to retrieve icon for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | ApiImagesGetIconResponse`

**CLI:** `hoody images icon get`

---

### `getPublic`

**GET** `/api/v1/images/public/{id}`

Get public image details

```typescript
client.api.images.getPublic(id: string, options?: { cache?: boolean | number }): Promise<ApiImagesGetPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public container image to retrieve details for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesGetPublicResponse`

**CLI:** `hoody images get`

---

### `import`

**POST** `/api/v1/images/import/{id}`

Import free image

```typescript
client.api.images.import(id: string, options?: { cache?: boolean | number }): Promise<ApiImagesImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public container image to import |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesImportResponse`

**CLI:** `hoody images import`

---

### `list`

**GET** `/api/v1/images/user`

List user images

```typescript
client.api.images.list(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<ApiImagesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesListResponse`

**CLI:** `hoody images list`

---

### `listAll`

**GET** `/api/v1/images/user`

List user images (collect all pages)

```typescript
client.api.images.listAll(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/images/user`

List user images (async iterator)

```typescript
client.api.images.listIterator(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listPublic`

**GET** `/api/v1/images/public`

List public images

```typescript
client.api.images.listPublic(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<ApiImagesListPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesListPublicResponse`

**CLI:** `hoody images list`

---

### `listPublicAll`

**GET** `/api/v1/images/public`

List public images (collect all pages)

```typescript
client.api.images.listPublicAll(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listPublicIterator`

**GET** `/api/v1/images/public`

List public images (async iterator)

```typescript
client.api.images.listPublicIterator(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc"; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `rate`

**POST** `/api/v1/images/rate/{id}`

Rate image

```typescript
client.api.images.rate(id: string, data: ApiImagesRateRequest, options?: { cache?: boolean | number }): Promise<ApiImagesRateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container image to rate |
| `data` | `ApiImagesRateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiImagesRateResponse`

**CLI:** `hoody images rate`

---

## `client.api.inbox` (9 methods)

### `getSummary`

**GET** `/api/v1/notifications/summary`

Unread notification count and newest position

```typescript
client.api.inbox.getSummary(options?: { cache?: boolean | number }): Promise<ApiInboxGetSummaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiInboxGetSummaryResponse`

**CLI:** `hoody inbox summary`

---

### `list`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user

```typescript
client.api.inbox.list(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string; cache?: boolean | number }): Promise<ApiInboxListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiInboxListResponse`

**CLI:** `hoody inbox list`

---

### `listAll`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user (collect all pages)

```typescript
client.api.inbox.listAll(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listAnnouncements`

**GET** `/api/v1/notifications/public`

Get all public notifications

```typescript
client.api.inbox.listAnnouncements(options?: { cache?: boolean | number }): Promise<ApiInboxListAnnouncementsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiInboxListAnnouncementsResponse`

**CLI:** `hoody inbox announcements list`

---

### `listAnnouncementsAll`

**GET** `/api/v1/notifications/public`

Get all public notifications (collect all pages)

```typescript
client.api.inbox.listAnnouncementsAll(options?: { cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listAnnouncementsIterator`

**GET** `/api/v1/notifications/public`

Get all public notifications (async iterator)

```typescript
client.api.inbox.listAnnouncementsIterator(options?: { cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notifications/`

List notifications for the authenticated user (async iterator)

```typescript
client.api.inbox.listIterator(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | No | query | Rows per page (max 100). |
| `unread_only` | `boolean` | No | query | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | No | query | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | No | query | Keyset cursor from a previous response's pagination.next_cursor ("&lt;created_at&gt;,&lt;id&gt;"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `markAllRead`

**PUT** `/api/v1/notifications/read-all`

Mark all notifications as read

```typescript
client.api.inbox.markAllRead(options?: { cache?: boolean | number }): Promise<ApiInboxMarkAllReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiInboxMarkAllReadResponse`

**CLI:** `hoody inbox mark read`

---

### `markRead`

**PUT** `/api/v1/notifications/{id}/read`

Mark a notification as read

```typescript
client.api.inbox.markRead(id: string, options?: { cache?: boolean | number }): Promise<ApiInboxMarkReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the notification to mark as read |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiInboxMarkReadResponse`

**CLI:** `hoody inbox mark read`

---

## `client.api.ip` (1 method)

### `get`

**GET** `/api/v1/ip`

Get IP Information

```typescript
client.api.ip.get(options?: { cache?: boolean | number }): Promise<ApiIpGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiIpGetResponse`

**CLI:** `hoody ip get`

---

## `client.api.meta` (1 method)

### `getPublicKey`

**GET** `/api/v1/meta/public-key`

Get Hoody API Signing Public Key

```typescript
client.api.meta.getPublicKey(options?: { cache?: boolean | number }): Promise<ApiMetaGetPublicKeyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiMetaGetPublicKeyResponse`

**CLI:** `hoody meta key get`

---

## `client.api.network` (5 methods)

### `delete`

**DELETE** `/api/v1/containers/{id}/network`

Remove container network configuration

```typescript
client.api.network.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiNetworkDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to remove network configuration from |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiNetworkDeleteResponse`

**CLI:** `hoody network delete`

---

### `get`

**GET** `/api/v1/containers/{id}/network`

Get container network configuration

```typescript
client.api.network.get(id: string, options?: { cache?: boolean | number }): Promise<ApiNetworkGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve network configuration for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiNetworkGetResponse`

**CLI:** `hoody network get`

---

### `start`

**POST** `/api/v1/containers/{id}/network/start`

Start container network proxy/blocking

```typescript
client.api.network.start(id: string, options?: { cache?: boolean | number }): Promise<ApiNetworkStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to start network for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiNetworkStartResponse`

**CLI:** `hoody network start`

---

### `stop`

**POST** `/api/v1/containers/{id}/network/stop`

Stop container network proxy/blocking

```typescript
client.api.network.stop(id: string, options?: { cache?: boolean | number }): Promise<ApiNetworkStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to stop network for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiNetworkStopResponse`

**CLI:** `hoody network stop`

---

### `update`

**PUT** `/api/v1/containers/{id}/network`

Update container network configuration

```typescript
client.api.network.update(id: string, data: ApiNetworkUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiNetworkUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to configure network for |
| `data` | `ApiNetworkUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiNetworkUpdateResponse`

**CLI:** `hoody network update`

---

## `client.api.pools` (7 methods)

### `create`

**POST** `/api/v1/pools`

Create pool

```typescript
client.api.pools.create(data: ApiPoolsCreateRequest, options?: { cache?: boolean | number }): Promise<ApiPoolsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiPoolsCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsCreateResponse`

**CLI:** `hoody pools create`

---

### `delete`

**DELETE** `/api/v1/pools/{id}`

Delete pool

```typescript
client.api.pools.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiPoolsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsDeleteResponse`

**CLI:** `hoody pools delete`

---

### `get`

**GET** `/api/v1/pools/{id}`

Get pool details

```typescript
client.api.pools.get(id: string, options?: { cache?: boolean | number }): Promise<ApiPoolsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsGetResponse`

**CLI:** `hoody pools get`

---

### `list`

**GET** `/api/v1/pools`

List user pools

```typescript
client.api.pools.list(options?: { cache?: boolean | number }): Promise<ApiPoolsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsListResponse`

**CLI:** `hoody pools list`

---

### `listAll`

**GET** `/api/v1/pools`

List user pools (collect all pages)

```typescript
client.api.pools.listAll(options?: { cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/pools`

List user pools (async iterator)

```typescript
client.api.pools.listIterator(options?: { cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PUT** `/api/v1/pools/{id}`

Update pool

```typescript
client.api.pools.update(id: string, data: ApiPoolsUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiPoolsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiPoolsUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsUpdateResponse`

**CLI:** `hoody pools update`

---

## `client.api.pools.invitations` (3 methods)

### `accept`

**POST** `/api/v1/pools/{id}/accept`

Accept invitation

```typescript
client.api.pools.invitations.accept(id: string, options?: { cache?: boolean | number }): Promise<ApiPoolsInvitationsAcceptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsInvitationsAcceptResponse`

**CLI:** `hoody pools invitations accept`

---

### `list`

**GET** `/api/v1/pools/invitations/pending`

List pending invitations

```typescript
client.api.pools.invitations.list(options?: { cache?: boolean | number }): Promise<ApiPoolsInvitationsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsInvitationsListResponse`

**CLI:** `hoody pools invitations list`

---

### `reject`

**POST** `/api/v1/pools/{id}/reject`

Reject invitation

```typescript
client.api.pools.invitations.reject(id: string, options?: { cache?: boolean | number }): Promise<ApiPoolsInvitationsRejectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsInvitationsRejectResponse`

**CLI:** `hoody pools invitations reject`

---

## `client.api.pools.members` (3 methods)

### `invite`

**POST** `/api/v1/pools/{id}/members`

Invite member

```typescript
client.api.pools.members.invite(id: string, data: ApiPoolsMembersInviteRequest, options?: { cache?: boolean | number }): Promise<ApiPoolsMembersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiPoolsMembersInviteRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsMembersInviteResponse`

**CLI:** `hoody pools members invite`

---

### `remove`

**DELETE** `/api/v1/pools/{id}/members/{userId}`

Remove member

```typescript
client.api.pools.members.remove(id: string, userId: string, options?: { cache?: boolean | number }): Promise<ApiPoolsMembersRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsMembersRemoveResponse`

**CLI:** `hoody pools members remove`

---

### `setRole`

**PUT** `/api/v1/pools/{id}/members/{userId}`

Update member role

```typescript
client.api.pools.members.setRole(id: string, userId: string, data: ApiPoolsMembersSetRoleRequest, options?: { cache?: boolean | number }): Promise<ApiPoolsMembersSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `ApiPoolsMembersSetRoleRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiPoolsMembersSetRoleResponse`

**CLI:** `hoody pools members role set`

---

## `client.api.projects` (15 methods)

### `create`

**POST** `/api/v1/projects/`

Create a new project

```typescript
client.api.projects.create(data: ApiProjectsCreateRequest, options?: { cache?: boolean | number }): Promise<ApiProjectsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiProjectsCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsCreateResponse`

**CLI:** `hoody projects create`

---

### `createPermission`

**POST** `/api/v1/projects/{id}/permissions`

Grant project access

```typescript
client.api.projects.createPermission(id: string, data: ApiProjectsCreatePermissionRequest, options?: { cache?: boolean | number }): Promise<ApiProjectsCreatePermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProjectsCreatePermissionRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsCreatePermissionResponse`

**CLI:** `hoody projects permissions create`

---

### `delete`

**DELETE** `/api/v1/projects/{id}`

Delete project

```typescript
client.api.projects.delete(id: string, options?: { include_deleted_items?: boolean; cache?: boolean | number }): Promise<ApiProjectsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID to delete |
| `include_deleted_items` | `boolean` | No | query | Include a short list of the deleted container IDs and names in the response. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsDeleteResponse`

**CLI:** `hoody projects delete`

---

### `deletePermission`

**DELETE** `/api/v1/projects/{id}/permissions/{permissionId}`

Revoke project access

```typescript
client.api.projects.deletePermission(id: string, permissionId: string, options?: { cache?: boolean | number }): Promise<ApiProjectsDeletePermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to remove |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsDeletePermissionResponse`

**CLI:** `hoody projects permissions delete`

---

### `get`

**GET** `/api/v1/projects/{id}`

Get project by ID

```typescript
client.api.projects.get(id: string, options?: { include_permissions?: boolean; cache?: boolean | number }): Promise<ApiProjectsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `include_permissions` | `boolean` | No | query | Include project permissions with user details in response |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsGetResponse`

**CLI:** `hoody projects get`

---

### `getProxyUsage`

**GET** `/api/v1/projects/{id}/proxy-usage`

Get proxied-usage documents for every container in a project

```typescript
client.api.projects.getProxyUsage(id: string, options: { from: string; to: string; cache?: boolean | number }): Promise<ApiProjectsGetProxyUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project id |
| `from` | `string` | Yes | query | First month, inclusive (YYYY-MM) |
| `to` | `string` | Yes | query | Last month, inclusive (YYYY-MM). Max 12 months. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsGetProxyUsageResponse`

**CLI:** `hoody projects proxy usage`

---

### `getStats`

**GET** `/api/v1/projects/{id}/stats`

Get statistics for all containers in a project

```typescript
client.api.projects.getStats(id: string, options?: { cache?: boolean | number }): Promise<ApiProjectsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the project |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsGetStatsResponse`

**CLI:** `hoody projects stats`

---

### `list`

**GET** `/api/v1/projects/`

List all projects

```typescript
client.api.projects.list(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; cache?: boolean | number }): Promise<ApiProjectsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsListResponse`

**CLI:** `hoody projects list`

---

### `listAll`

**GET** `/api/v1/projects/`

List all projects (collect all pages)

```typescript
client.api.projects.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/projects/`

List all projects (async iterator)

```typescript
client.api.projects.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listPermissions`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions

```typescript
client.api.projects.listPermissions(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<ApiProjectsListPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsListPermissionsResponse`

**CLI:** `hoody projects permissions list`

---

### `listPermissionsAll`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (collect all pages)

```typescript
client.api.projects.listPermissionsAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listPermissionsIterator`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (async iterator)

```typescript
client.api.projects.listPermissionsIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PUT** `/api/v1/projects/{id}`

Update project

```typescript
client.api.projects.update(id: string, data: ApiProjectsUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiProjectsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID to update |
| `data` | `ApiProjectsUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsUpdateResponse`

**CLI:** `hoody projects update`

---

### `updatePermission`

**PUT** `/api/v1/projects/{id}/permissions/{permissionId}`

Update project permission

```typescript
client.api.projects.updatePermission(id: string, permissionId: string, data: ApiProjectsUpdatePermissionRequest, options?: { cache?: boolean | number }): Promise<ApiProjectsUpdatePermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to update |
| `data` | `ApiProjectsUpdatePermissionRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProjectsUpdatePermissionResponse`

**CLI:** `hoody projects permissions update`

---

## `client.api.proxy.aliases` (9 methods)

### `create`

**POST** `/api/v1/proxy/aliases`

Create a new proxy alias

```typescript
client.api.proxy.aliases.create(data: ApiProxyAliasesCreateRequest, options?: { cache?: boolean | number }): Promise<ApiProxyAliasesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiProxyAliasesCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyAliasesCreateResponse`

**CLI:** `hoody proxy aliases create`

---

### `delete`

**DELETE** `/api/v1/proxy/aliases/{id}`

Delete proxy alias

```typescript
client.api.proxy.aliases.delete(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyAliasesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to delete |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyAliasesDeleteResponse`

**CLI:** `hoody proxy aliases delete`

---

### `disable`

**PATCH** `/api/v1/proxy/aliases/{id}/state`

Enable or disable proxy alias

```typescript
client.api.proxy.aliases.disable(id: string): Promise<any>
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
client.api.proxy.aliases.enable(id: string): Promise<any>
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
client.api.proxy.aliases.get(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyAliasesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyAliasesGetResponse`

**CLI:** `hoody proxy aliases get`

---

### `list`

**GET** `/api/v1/proxy/aliases`

List proxy aliases

```typescript
client.api.proxy.aliases.list(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean; cache?: boolean | number }): Promise<ApiProxyAliasesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyAliasesListResponse`

**CLI:** `hoody proxy aliases list`

---

### `listAll`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (collect all pages)

```typescript
client.api.proxy.aliases.listAll(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (async iterator)

```typescript
client.api.proxy.aliases.listIterator(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `expired` | `boolean` | No | query | Filter by expiration: true = only expired, false = only non-expired |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/proxy/aliases/{id}`

Update proxy alias

```typescript
client.api.proxy.aliases.update(id: string, data: ApiProxyAliasesUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiProxyAliasesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to update |
| `data` | `ApiProxyAliasesUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyAliasesUpdateResponse`

**CLI:** `hoody proxy aliases update`

---

## `client.api.proxy.containerPermissions` (14 methods)

### `clearGroupPermissions`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a container group

```typescript
client.api.proxy.containerPermissions.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsClearGroupPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsClearGroupPermissionsResponse`

**CLI:** `hoody containers proxy groups permissions clear`

---

### `delete`

**DELETE** `/api/v1/containers/{id}/proxy/permissions`

Delete container proxy permissions

```typescript
client.api.proxy.containerPermissions.delete(id: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsDeleteResponse`

**CLI:** `hoody containers proxy permissions delete`

---

### `deleteAuthGroup`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}`

Remove container authentication group

```typescript
client.api.proxy.containerPermissions.deleteAuthGroup(id: string, groupName: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsDeleteAuthGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsDeleteAuthGroupResponse`

**CLI:** `hoody containers proxy groups delete`

---

### `deleteGroupPermission`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a container group

```typescript
client.api.proxy.containerPermissions.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsDeleteGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsDeleteGroupPermissionResponse`

**CLI:** `hoody containers proxy groups permissions delete`

---

### `disable`

**PATCH** `/api/v1/containers/{id}/proxy/permissions/state`

Update container proxy enable state

```typescript
client.api.proxy.containerPermissions.disable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody containers proxy disable`

---

### `enable`

**PATCH** `/api/v1/containers/{id}/proxy/permissions/state`

Update container proxy enable state

```typescript
client.api.proxy.containerPermissions.enable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody containers proxy enable`

---

### `get`

**GET** `/api/v1/containers/{id}/proxy/permissions`

Get container proxy permissions

```typescript
client.api.proxy.containerPermissions.get(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyContainerPermissionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsGetResponse`

**CLI:** `hoody containers proxy permissions get`

---

### `set`

**PUT** `/api/v1/containers/{id}/proxy/permissions`

Replace container proxy permissions JSON

```typescript
client.api.proxy.containerPermissions.set(id: string, data: ApiProxyContainerPermissionsSetRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetResponse`

**CLI:** `hoody containers proxy permissions set`

---

### `setDefault`

**PATCH** `/api/v1/containers/{id}/proxy/permissions/default`

Update container default proxy permission policy

```typescript
client.api.proxy.containerPermissions.setDefault(id: string, data: ApiProxyContainerPermissionsSetDefaultRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiProxyContainerPermissionsSetDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetDefaultResponse`

**CLI:** `hoody containers proxy default set`

---

### `setGroupPermission`

**PUT** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`

Set container group program permission

```typescript
client.api.proxy.containerPermissions.setGroupPermission(id: string, groupName: string, data: ApiProxyContainerPermissionsSetGroupPermissionRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetGroupPermissionRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetGroupPermissionResponse`

**CLI:** `hoody containers proxy groups permissions set`

---

### `setIpGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (container)

```typescript
client.api.proxy.containerPermissions.setIpGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetIpGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetIpGroupResponse`

**CLI:** `hoody containers proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (container)

```typescript
client.api.proxy.containerPermissions.setJwtGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetJwtGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetJwtGroupResponse`

**CLI:** `hoody containers proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (container)

```typescript
client.api.proxy.containerPermissions.setPasswordGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetPasswordGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetPasswordGroupResponse`

**CLI:** `hoody containers proxy groups password set`

---

### `setTokenGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (container)

```typescript
client.api.proxy.containerPermissions.setTokenGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetTokenGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyContainerPermissionsSetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyContainerPermissionsSetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyContainerPermissionsSetTokenGroupResponse`

**CLI:** `hoody containers proxy groups token set`

---

## `client.api.proxy.groups` (1 method)

### `list`

**GET** `/api/v1/containers/{id}/proxy/groups`

List container proxy groups

```typescript
client.api.proxy.groups.list(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyGroupsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyGroupsListResponse`

**CLI:** `hoody containers proxy groups list`

---

## `client.api.proxy.hooks` (8 methods)

### `clear`

**DELETE** `/api/v1/containers/{id}/proxy/hooks/{service}`

Clear all hooks for a service

```typescript
client.api.proxy.hooks.clear(id: string, service: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyHooksClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksClearResponse`

**CLI:** `hoody containers proxy services hooks clear`

---

### `create`

**POST** `/api/v1/containers/{id}/proxy/hooks/{service}`

Append or insert a new hook

```typescript
client.api.proxy.hooks.create(id: string, service: string, data: ApiProxyHooksCreateRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyHooksCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `data` | `ApiProxyHooksCreateRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksCreateResponse`

**CLI:** `hoody containers proxy hooks create`

---

### `delete`

**DELETE** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Remove a hook

```typescript
client.api.proxy.hooks.delete(id: string, service: string, hookId: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyHooksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksDeleteResponse`

**CLI:** `hoody containers proxy hooks delete`

---

### `get`

**GET** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Get a single hook by id

```typescript
client.api.proxy.hooks.get(id: string, service: string, hookId: string, options?: { cache?: boolean | number }): Promise<ApiProxyHooksGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksGetResponse`

**CLI:** `hoody containers proxy hooks get`

---

### `list`

**GET** `/api/v1/containers/{id}/proxy/hooks`

List all proxy hooks for a container

```typescript
client.api.proxy.hooks.list(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyHooksListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksListResponse`

**CLI:** `hoody containers proxy hooks list`

---

### `listByService`

**GET** `/api/v1/containers/{id}/proxy/hooks/{service}`

List hooks for a specific service

```typescript
client.api.proxy.hooks.listByService(id: string, service: string, options?: { cache?: boolean | number }): Promise<ApiProxyHooksListByServiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksListByServiceResponse`

**CLI:** `hoody containers proxy services hooks list`

---

### `move`

**PATCH** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position`

Move a hook to a new position

```typescript
client.api.proxy.hooks.move(id: string, service: string, hookId: string, data: ApiProxyHooksMoveRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyHooksMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `ApiProxyHooksMoveRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksMoveResponse`

**CLI:** `hoody containers proxy hooks move`

---

### `set`

**PUT** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Replace a hook in place

```typescript
client.api.proxy.hooks.set(id: string, service: string, hookId: string, data: ApiProxyHooksSetRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyHooksSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `ApiProxyHooksSetRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyHooksSetResponse`

**CLI:** `hoody containers proxy hooks set`

---

## `client.api.proxy.projectPermissions` (14 methods)

### `clearGroupPermissions`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a project group

```typescript
client.api.proxy.projectPermissions.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsClearGroupPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsClearGroupPermissionsResponse`

**CLI:** `hoody projects proxy groups permissions clear`

---

### `delete`

**DELETE** `/api/v1/projects/{id}/proxy/permissions`

Delete project proxy permissions

```typescript
client.api.proxy.projectPermissions.delete(id: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsDeleteResponse`

**CLI:** `hoody projects proxy permissions delete`

---

### `deleteAuthGroup`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}`

Remove project authentication group

```typescript
client.api.proxy.projectPermissions.deleteAuthGroup(id: string, groupName: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsDeleteAuthGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsDeleteAuthGroupResponse`

**CLI:** `hoody projects proxy groups delete`

---

### `deleteGroupPermission`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a project group

```typescript
client.api.proxy.projectPermissions.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsDeleteGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsDeleteGroupPermissionResponse`

**CLI:** `hoody projects proxy groups permissions delete`

---

### `disable`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/state`

Update project proxy enable state

```typescript
client.api.proxy.projectPermissions.disable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody projects proxy disable`

---

### `enable`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/state`

Update project proxy enable state

```typescript
client.api.proxy.projectPermissions.enable(id: string, data: object, options: { ifMatch: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `data` | `object` | Yes | body |  |

**Returns:** `any`

**CLI:** `hoody projects proxy enable`

---

### `get`

**GET** `/api/v1/projects/{id}/proxy/permissions`

Get project proxy permissions

```typescript
client.api.proxy.projectPermissions.get(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyProjectPermissionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsGetResponse`

**CLI:** `hoody projects proxy permissions get`

---

### `set`

**PUT** `/api/v1/projects/{id}/proxy/permissions`

Replace project proxy permissions JSON

```typescript
client.api.proxy.projectPermissions.set(id: string, data: ApiProxyProjectPermissionsSetRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetResponse`

**CLI:** `hoody projects proxy permissions set`

---

### `setDefault`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/default`

Update project default proxy permission policy

```typescript
client.api.proxy.projectPermissions.setDefault(id: string, data: ApiProxyProjectPermissionsSetDefaultRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProxyProjectPermissionsSetDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetDefaultResponse`

**CLI:** `hoody projects proxy default set`

---

### `setGroupPermission`

**PUT** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Set project group program permission

```typescript
client.api.proxy.projectPermissions.setGroupPermission(id: string, groupName: string, data: ApiProxyProjectPermissionsSetGroupPermissionRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetGroupPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetGroupPermissionRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetGroupPermissionResponse`

**CLI:** `hoody projects proxy groups permissions set`

---

### `setIpGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (project)

```typescript
client.api.proxy.projectPermissions.setIpGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetIpGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetIpGroupResponse`

**CLI:** `hoody projects proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (project)

```typescript
client.api.proxy.projectPermissions.setJwtGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetJwtGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetJwtGroupResponse`

**CLI:** `hoody projects proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (project)

```typescript
client.api.proxy.projectPermissions.setPasswordGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetPasswordGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetPasswordGroupResponse`

**CLI:** `hoody projects proxy groups password set`

---

### `setTokenGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (project)

```typescript
client.api.proxy.projectPermissions.setTokenGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetTokenGroupRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxyProjectPermissionsSetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyProjectPermissionsSetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyProjectPermissionsSetTokenGroupResponse`

**CLI:** `hoody projects proxy groups token set`

---

## `client.api.proxy.services` (2 methods)

### `get`

**GET** `/api/v1/containers/{id}/proxy/services/{service}`

Get merged proxy view for a service

```typescript
client.api.proxy.services.get(id: string, service: string, options?: { cache?: boolean | number }): Promise<ApiProxyServicesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyServicesGetResponse`

**CLI:** `hoody containers proxy services get`

---

### `list`

**GET** `/api/v1/containers/{id}/proxy/services`

List services referenced in proxy config

```typescript
client.api.proxy.services.list(id: string, options?: { cache?: boolean | number }): Promise<ApiProxyServicesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxyServicesListResponse`

**CLI:** `hoody containers proxy services list`

---

## `client.api.proxy.settings` (2 methods)

### `get`

**GET** `/api/v1/containers/{id}/proxy/settings`

Get container proxy root settings

```typescript
client.api.proxy.settings.get(id: string, options?: { cache?: boolean | number }): Promise<ApiProxySettingsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxySettingsGetResponse`

**CLI:** `hoody containers proxy settings get`

---

### `update`

**PUT** `/api/v1/containers/{id}/proxy/settings`

Update container proxy root settings

```typescript
client.api.proxy.settings.update(id: string, data: ApiProxySettingsUpdateRequest, options: { ifMatch: string; cache?: boolean | number }): Promise<ApiProxySettingsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiProxySettingsUpdateRequest` | Yes | body |  |
| `ifMatch` | `string` | Yes | header | file:v&lt;N&gt; ETag precondition |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiProxySettingsUpdateResponse`

**CLI:** `hoody containers proxy settings update`

---

## `client.api.realms` (1 method)

### `list`

**GET** `/api/v1/realms/`

List your realm IDs

```typescript
client.api.realms.list(options?: { include_usage?: boolean; cache?: boolean | number }): Promise<ApiRealmsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `include_usage` | `boolean` | No | query | Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiRealmsListResponse`

**CLI:** `hoody realms list`

---

## `client.api.servers` (11 methods)

### `extend`

**POST** `/api/v1/rentals/{id}/extend`

Extend rental

```typescript
client.api.servers.extend(id: string, data: ApiServersExtendRequest, options?: { cache?: boolean | number }): Promise<ApiServersExtendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersExtendRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersExtendResponse`

**CLI:** `hoody servers extend`

---

### `get`

**GET** `/api/v1/rentals/{id}`

Get rental details

```typescript
client.api.servers.get(id: string, options?: { cache?: boolean | number }): Promise<ApiServersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersGetResponse`

**CLI:** `hoody servers get`

---

### `getStats`

**GET** `/api/v1/rentals/{id}/runtime`

Get live runtime info for a rented server or subserver

```typescript
client.api.servers.getStats(id: string, options?: { cache?: boolean | number }): Promise<ApiServersGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersGetStatsResponse`

**CLI:** `hoody servers stats`

---

### `list`

**GET** `/api/v1/rentals`

List user rentals

```typescript
client.api.servers.list(options?: { cache?: boolean | number }): Promise<ApiServersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersListResponse`

**CLI:** `hoody servers list`

---

### `listAll`

**GET** `/api/v1/rentals`

List user rentals (collect all pages)

```typescript
client.api.servers.listAll(options?: { cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/rentals`

List user rentals (async iterator)

```typescript
client.api.servers.listIterator(options?: { cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listMarketplace`

**GET** `/api/v1/servers/available`

Browse rental marketplace

```typescript
client.api.servers.listMarketplace(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; cache?: boolean | number }): Promise<ApiServersListMarketplaceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | Filter servers that support these rental durations (days) |
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersListMarketplaceResponse`

**CLI:** `hoody servers marketplace list`

---

### `listMarketplaceAll`

**GET** `/api/v1/servers/available`

Browse rental marketplace (collect all pages)

```typescript
client.api.servers.listMarketplaceAll(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | Filter servers that support these rental durations (days) |
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listMarketplaceIterator`

**GET** `/api/v1/servers/available`

Browse rental marketplace (async iterator)

```typescript
client.api.servers.listMarketplaceIterator(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `country` | `string` | No | query | Filter by country code (e.g., US, DE) |
| `region` | `string` | No | query | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | No | query | Maximum price per day in USD |
| `available_durations` | `number[]` | No | query | Filter servers that support these rental durations (days) |
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
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listRegions`

**GET** `/api/v1/auth/available-regions`

Get available server regions

```typescript
client.api.servers.listRegions(options?: { cache?: boolean | number }): Promise<ApiServersListRegionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersListRegionsResponse`

**CLI:** `hoody servers regions list`

---

### `rent`

**POST** `/api/v1/servers/{id}/rent`

Rent server

```typescript
client.api.servers.rent(id: string, data: ApiServersRentRequest, options?: { cache?: boolean | number }): Promise<ApiServersRentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersRentRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersRentResponse`

**CLI:** `hoody servers rent`

---

## `client.api.servers.commands` (4 methods)

### `list`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands

```typescript
client.api.servers.commands.list(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical"; cache?: boolean | number }): Promise<ApiServersCommandsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersCommandsListResponse`

**CLI:** `hoody servers commands list`

---

### `listAll`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (collect all pages)

```typescript
client.api.servers.commands.listAll(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical"; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (async iterator)

```typescript
client.api.servers.commands.listIterator(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical"; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `run`

**POST** `/api/v1/servers/{serverId}/execute-command`

Execute server command

```typescript
client.api.servers.commands.run(serverId: string, data: ApiServersCommandsRunRequest, options?: { cache?: boolean | number }): Promise<ApiServersCommandsRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to execute command on |
| `data` | `ApiServersCommandsRunRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersCommandsRunResponse`

**CLI:** `hoody servers commands run`

---

## `client.api.servers.jobs` (1 method)

### `get`

**GET** `/api/v1/subserver-operations/{id}`

Status of a paid subserver operation

```typescript
client.api.servers.jobs.get(id: string, options?: { cache?: boolean | number }): Promise<ApiServersJobsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersJobsGetResponse`

**CLI:** `hoody servers jobs get`

---

## `client.api.servers.offers` (2 methods)

### `list`

**GET** `/api/v1/offers`

Browse machines available to order

```typescript
client.api.servers.offers.list(options?: { cache?: boolean | number }): Promise<ApiServersOffersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersOffersListResponse`

**CLI:** `hoody servers offers list`

---

### `reserve`

**POST** `/api/v1/offers/{id}/reserve`

Reserve an offer (charges immediately)

```typescript
client.api.servers.offers.reserve(id: string, data: ApiServersOffersReserveRequest, options?: { cache?: boolean | number }): Promise<ApiServersOffersReserveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersOffersReserveRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersOffersReserveResponse`

**CLI:** `hoody servers offers reserve`

---

## `client.api.servers.plans` (2 methods)

### `list`

**GET** `/api/v1/subserver-plans`

List subserver plans available to you

```typescript
client.api.servers.plans.list(options?: { locale?: string; cache?: boolean | number }): Promise<ApiServersPlansListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `locale` | `string` | No | query | Language tag such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersPlansListResponse`

**CLI:** `hoody servers plans list`

---

### `quote`

**GET** `/api/v1/subserver-subscriptions/quote`

Quote a paid subserver purchase

```typescript
client.api.servers.plans.quote(options: { plan_id: string; cache?: boolean | number }): Promise<ApiServersPlansQuoteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `plan_id` | `string` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersPlansQuoteResponse`

**CLI:** `hoody servers plans quote`

---

## `client.api.servers.reservations` (2 methods)

### `get`

**GET** `/api/v1/reservations/{id}`

One of your reservations

```typescript
client.api.servers.reservations.get(id: string, options?: { cache?: boolean | number }): Promise<ApiServersReservationsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersReservationsGetResponse`

**CLI:** `hoody servers reservations get`

---

### `list`

**GET** `/api/v1/reservations`

Your reservations

```typescript
client.api.servers.reservations.list(options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<ApiServersReservationsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersReservationsListResponse`

**CLI:** `hoody servers reservations list`

---

## `client.api.servers.subscriptions` (9 methods)

### `buy`

**POST** `/api/v1/subserver-subscriptions`

Buy a paid subserver (charges immediately)

```typescript
client.api.servers.subscriptions.buy(data: ApiServersSubscriptionsBuyRequest, options?: { cache?: boolean | number }): Promise<ApiServersSubscriptionsBuyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiServersSubscriptionsBuyRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsBuyResponse`

**CLI:** `hoody servers subscriptions buy`

---

### `cancel`

**POST** `/api/v1/subserver-subscriptions/{id}/cancel`

Cancel a paid subserver subscription

```typescript
client.api.servers.subscriptions.cancel(id: string, options?: { cache?: boolean | number }): Promise<ApiServersSubscriptionsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsCancelResponse`

**CLI:** `hoody servers subscriptions cancel`

---

### `disableAutoRenew`

**PUT** `/api/v1/subserver-subscriptions/{id}/auto-renew`

Turn auto-renew on or off

```typescript
client.api.servers.subscriptions.disableAutoRenew(id: string): Promise<any>
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
client.api.servers.subscriptions.enableAutoRenew(id: string): Promise<any>
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
client.api.servers.subscriptions.get(id: string, options?: { locale?: string; cache?: boolean | number }): Promise<ApiServersSubscriptionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `locale` | `string` | No | query | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsGetResponse`

**CLI:** `hoody servers subscriptions get`

---

### `list`

**GET** `/api/v1/subserver-subscriptions`

List your paid subserver subscriptions

```typescript
client.api.servers.subscriptions.list(options?: { limit?: number; offset?: number; locale?: string; cache?: boolean | number }): Promise<ApiServersSubscriptionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `locale` | `string` | No | query | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsListResponse`

**CLI:** `hoody servers subscriptions list`

---

### `pay`

**POST** `/api/v1/subserver-subscriptions/{id}/pay`

Pay a held subscription and resume it (charges one month)

```typescript
client.api.servers.subscriptions.pay(id: string, data: ApiServersSubscriptionsPayRequest, options?: { cache?: boolean | number }): Promise<ApiServersSubscriptionsPayResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersSubscriptionsPayRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsPayResponse`

**CLI:** `hoody servers subscriptions pay`

---

### `quote`

**GET** `/api/v1/subserver-subscriptions/{id}/quote`

Quote an upgrade or a payment

```typescript
client.api.servers.subscriptions.quote(id: string, options: { action: "upgrade" | "pay"; plan_id?: string; cache?: boolean | number }): Promise<ApiServersSubscriptionsQuoteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `action` | `"upgrade" \| "pay"` | Yes | query |  |
| `plan_id` | `string` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsQuoteResponse`

**CLI:** `hoody servers subscriptions quote`

---

### `upgrade`

**POST** `/api/v1/subserver-subscriptions/{id}/upgrade`

Upgrade a paid subserver (charges the difference)

```typescript
client.api.servers.subscriptions.upgrade(id: string, data: ApiServersSubscriptionsUpgradeRequest, options?: { cache?: boolean | number }): Promise<ApiServersSubscriptionsUpgradeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServersSubscriptionsUpgradeRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiServersSubscriptionsUpgradeResponse`

**CLI:** `hoody servers subscriptions upgrade`

---

## `client.api.snapshots` (7 methods)

### `create`

**POST** `/api/v1/containers/{id}/snapshots`

Create container snapshot

```typescript
client.api.snapshots.create(id: string, data: ApiSnapshotsCreateRequest, options?: { cache?: boolean | number }): Promise<ApiSnapshotsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to create snapshot for |
| `data` | `ApiSnapshotsCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiSnapshotsCreateResponse`

**CLI:** `hoody snapshots create`

---

### `delete`

**DELETE** `/api/v1/containers/{id}/snapshots/{name}`

Delete container snapshot

```typescript
client.api.snapshots.delete(id: string, name: string, options?: { cache?: boolean | number }): Promise<ApiSnapshotsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiSnapshotsDeleteResponse`

**CLI:** `hoody snapshots delete`

---

### `list`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots

```typescript
client.api.snapshots.list(id: string, options?: { cache?: boolean | number }): Promise<ApiSnapshotsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiSnapshotsListResponse`

**CLI:** `hoody snapshots list`

---

### `listAll`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots (collect all pages)

```typescript
client.api.snapshots.listAll(id: string, options?: { cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots (async iterator)

```typescript
client.api.snapshots.listIterator(id: string, options?: { cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `restore`

**PUT** `/api/v1/containers/{id}/snapshots/{name}`

Restore container from snapshot

```typescript
client.api.snapshots.restore(id: string, name: string, options?: { cache?: boolean | number }): Promise<ApiSnapshotsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to restore |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiSnapshotsRestoreResponse`

**CLI:** `hoody snapshots restore`

---

### `setAlias`

**PUT** `/api/v1/containers/{id}/snapshots/{name}/alias`

Update snapshot alias

```typescript
client.api.snapshots.setAlias(id: string, name: string, data: ApiSnapshotsSetAliasRequest, options?: { cache?: boolean | number }): Promise<ApiSnapshotsSetAliasResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |
| `name` | `string` | Yes | path | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |
| `data` | `ApiSnapshotsSetAliasRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiSnapshotsSetAliasResponse`

**CLI:** `hoody snapshots alias set`

---

## `client.api.storage.shares` (16 methods)

### `create`

**POST** `/api/v1/containers/{id}/storage/shares`

Create storage share

```typescript
client.api.storage.shares.create(id: string, data: ApiStorageSharesCreateRequest, options?: { cache?: boolean | number }): Promise<ApiStorageSharesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `data` | `ApiStorageSharesCreateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesCreateResponse`

**CLI:** `hoody storage shares create`

---

### `delete`

**DELETE** `/api/v1/storage/shares/{shareId}`

Delete storage share

```typescript
client.api.storage.shares.delete(shareId: string, options?: { cache?: boolean | number }): Promise<ApiStorageSharesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `shareId` | `string` | Yes | path | Share ID (globally unique, no container ID needed) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesDeleteResponse`

**CLI:** `hoody storage shares delete`

---

### `get`

**GET** `/api/v1/containers/{id}/storage/shares/{shareId}`

Get storage share

```typescript
client.api.storage.shares.get(id: string, shareId: string, options?: { cache?: boolean | number }): Promise<ApiStorageSharesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `shareId` | `string` | Yes | path | Share ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesGetResponse`

**CLI:** `hoody storage shares get`

---

### `list`

**GET** `/api/v1/storage/shares`

List all your storage shares

```typescript
client.api.storage.shares.list(options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiStorageSharesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesListResponse`

**CLI:** `hoody storage shares list`

---

### `listAll`

**GET** `/api/v1/storage/shares`

List all your storage shares (collect all pages)

```typescript
client.api.storage.shares.listAll(options?: { realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listByContainer`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares

```typescript
client.api.storage.shares.listByContainer(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string; cache?: boolean | number }): Promise<ApiStorageSharesListByContainerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesListByContainerResponse`

**CLI:** `hoody storage containers shares list`

---

### `listByContainerAll`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares (collect all pages)

```typescript
client.api.storage.shares.listByContainerAll(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listByContainerIterator`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares (async iterator)

```typescript
client.api.storage.shares.listByContainerIterator(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `boolean` | No | query | Filter by enabled status |
| `include_expired` | `boolean` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIncoming`

**GET** `/api/v1/storage/incoming`

Get all incoming shares

```typescript
client.api.storage.shares.listIncoming(options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiStorageSharesListIncomingResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesListIncomingResponse`

**CLI:** `hoody storage incoming list`

---

### `listIncomingAll`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (collect all pages)

```typescript
client.api.storage.shares.listIncomingAll(options?: { realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIncomingByContainer`

**GET** `/api/v1/containers/{id}/storage/incoming`

Get incoming shares

```typescript
client.api.storage.shares.listIncomingByContainer(id: string, options?: { cache?: boolean | number }): Promise<ApiStorageSharesListIncomingByContainerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesListIncomingByContainerResponse`

**CLI:** `hoody storage containers incoming list`

---

### `listIncomingIterator`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (async iterator)

```typescript
client.api.storage.shares.listIncomingIterator(options?: { realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/storage/shares`

List all your storage shares (async iterator)

```typescript
client.api.storage.shares.listIterator(options?: { realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `mountIncoming`

**PATCH** `/api/v1/containers/{id}/storage/incoming/{shareId}/mount`

Toggle incoming share mount

```typescript
client.api.storage.shares.mountIncoming(id: string, shareId: string): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Target container ID (receiver container) |
| `shareId` | `string` | Yes | path | Share ID to toggle |

**Returns:** `any`

**CLI:** `hoody storage incoming mount`

---

### `unmountIncoming`

**PATCH** `/api/v1/containers/{id}/storage/incoming/{shareId}/mount`

Toggle incoming share mount

```typescript
client.api.storage.shares.unmountIncoming(id: string, shareId: string): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Target container ID (receiver container) |
| `shareId` | `string` | Yes | path | Share ID to toggle |

**Returns:** `any`

**CLI:** `hoody storage incoming unmount`

---

### `update`

**PATCH** `/api/v1/containers/{id}/storage/shares/{shareId}`

Update storage share

```typescript
client.api.storage.shares.update(id: string, shareId: string, data: ApiStorageSharesUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiStorageSharesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `shareId` | `string` | Yes | path | Share ID |
| `data` | `ApiStorageSharesUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiStorageSharesUpdateResponse`

**CLI:** `hoody storage shares update`

---

## `client.api.users` (9 methods)

### `completeOnboardingMilestone`

**POST** `/api/v1/users/me/onboarding`

Mark an onboarding milestone as completed

```typescript
client.api.users.completeOnboardingMilestone(data: ApiUsersCompleteOnboardingMilestoneRequest, options?: { cache?: boolean | number }): Promise<ApiUsersCompleteOnboardingMilestoneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersCompleteOnboardingMilestoneRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersCompleteOnboardingMilestoneResponse`

**CLI:** `hoody users onboarding milestones complete`

---

### `get`

**GET** `/api/v1/users/{id}`

Get user by ID

```typescript
client.api.users.get(id: string, options?: { cache?: boolean | number }): Promise<ApiUsersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | User ID to retrieve |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersGetResponse`

**CLI:** `hoody users get`

---

### `getFreeTierStatus`

**GET** `/api/v1/users/me/free-tier-status`

Get free-tier claim status

```typescript
client.api.users.getFreeTierStatus(options?: { cache?: boolean | number }): Promise<ApiUsersGetFreeTierStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersGetFreeTierStatusResponse`

**CLI:** `hoody users free tier status`

---

### `listSecurityHistory`

**GET** `/api/v1/users/me/security-history`

Get your account security history

```typescript
client.api.users.listSecurityHistory(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean; cache?: boolean | number }): Promise<ApiUsersListSecurityHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersListSecurityHistoryResponse`

**CLI:** `hoody users security history list`

---

### `listSecurityHistoryAll`

**GET** `/api/v1/users/me/security-history`

Get your account security history (collect all pages)

```typescript
client.api.users.listSecurityHistoryAll(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listSecurityHistoryIterator`

**GET** `/api/v1/users/me/security-history`

Get your account security history (async iterator)

```typescript
client.api.users.listSecurityHistoryIterator(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `include_failed` | `boolean` | No | query | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | No | query | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `redeemInvite`

**POST** `/api/v1/users/me/redeem-invite`

Redeem a beta invite code

```typescript
client.api.users.redeemInvite(data: ApiUsersRedeemInviteRequest, options?: { cache?: boolean | number }): Promise<ApiUsersRedeemInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersRedeemInviteRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersRedeemInviteResponse`

**CLI:** `hoody users invites redeem`

---

### `retrySetup`

**POST** `/api/v1/users/me/retry-setup`

Retry free-tier account setup

```typescript
client.api.users.retrySetup(data: ApiUsersRetrySetupRequest, options?: { cache?: boolean | number }): Promise<ApiUsersRetrySetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiUsersRetrySetupRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersRetrySetupResponse`

**CLI:** `hoody users setup retry`

---

### `update`

**PUT** `/api/v1/users/{id}`

Update user profile

```typescript
client.api.users.update(id: string, data: ApiUsersUpdateRequest, options?: { cache?: boolean | number }): Promise<ApiUsersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | User ID to update |
| `data` | `ApiUsersUpdateRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiUsersUpdateResponse`

**CLI:** `hoody users update`

---

## `client.api.vault` (8 methods)

### `clear`

**DELETE** `/api/v1/vault`

Clear entire vault

```typescript
client.api.vault.clear(options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultClearResponse`

**CLI:** `hoody vault clear`

---

### `delete`

**DELETE** `/api/v1/vault/keys/{key}`

Delete vault key

```typescript
client.api.vault.delete(key: string, options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultDeleteResponse`

**CLI:** `hoody vault delete`

---

### `get`

**GET** `/api/v1/vault/keys/{key}`

Get vault key

```typescript
client.api.vault.get(key: string, options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultGetResponse`

**CLI:** `hoody vault get`

---

### `getStats`

**GET** `/api/v1/vault/stats`

Get vault statistics

```typescript
client.api.vault.getStats(options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultGetStatsResponse`

**CLI:** `hoody vault stats`

---

### `list`

**GET** `/api/v1/vault/keys`

List vault keys

```typescript
client.api.vault.list(options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultListResponse`

**CLI:** `hoody vault list`

---

### `listAll`

**GET** `/api/v1/vault/keys`

List vault keys (collect all pages)

```typescript
client.api.vault.listAll(options?: { realm_id?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/vault/keys`

List vault keys (async iterator)

```typescript
client.api.vault.listIterator(options?: { realm_id?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/api/v1/vault/keys/{key}`

Set vault key

```typescript
client.api.vault.set(key: string, data: ApiVaultSetRequest, options?: { realm_id?: string; cache?: boolean | number }): Promise<ApiVaultSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `data` | `ApiVaultSetRequest` | Yes | body |  |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiVaultSetResponse`

**CLI:** `hoody vault set`

---

## `client.api.wallet` (34 methods)

### `claimGithubBonus`

**POST** `/api/v1/wallet/github-bonus/claim`

Claim the GitHub connection bonus

```typescript
client.api.wallet.claimGithubBonus(options?: { cache?: boolean | number }): Promise<ApiWalletClaimGithubBonusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletClaimGithubBonusResponse`

**CLI:** `hoody wallet github bonus claim`

---

### `createCryptoInvoice`

**POST** `/api/v1/wallet/payments/crypto/invoice`

Start a crypto payment (hosted invoice)

```typescript
client.api.wallet.createCryptoInvoice(data: ApiWalletCreateCryptoInvoiceRequest, options?: { cache?: boolean | number }): Promise<ApiWalletCreateCryptoInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletCreateCryptoInvoiceRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletCreateCryptoInvoiceResponse`

**CLI:** `hoody wallet payments crypto invoices create`

---

### `createInvoice`

**POST** `/api/v1/wallet/invoices/generate/{id}`

Generate invoice for transaction

```typescript
client.api.wallet.createInvoice(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletCreateInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletCreateInvoiceResponse`

**CLI:** `hoody wallet invoices create`

---

### `createPaymentMethod`

**POST** `/api/v1/wallet/payment-methods/`

Add a new payment method

```typescript
client.api.wallet.createPaymentMethod(data: ApiWalletCreatePaymentMethodRequest, options?: { cache?: boolean | number }): Promise<ApiWalletCreatePaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletCreatePaymentMethodRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletCreatePaymentMethodResponse`

**CLI:** `hoody wallet payments methods create`

---

### `createStripeCheckout`

**POST** `/api/v1/wallet/payments/stripe/checkout`

Start a card payment (Stripe Checkout)

```typescript
client.api.wallet.createStripeCheckout(data: ApiWalletCreateStripeCheckoutRequest, options?: { cache?: boolean | number }): Promise<ApiWalletCreateStripeCheckoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletCreateStripeCheckoutRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletCreateStripeCheckoutResponse`

**CLI:** `hoody wallet payments stripe checkout create`

---

### `deletePaymentMethod`

**DELETE** `/api/v1/wallet/payment-methods/{id}`

Delete a payment method

```typescript
client.api.wallet.deletePaymentMethod(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletDeletePaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletDeletePaymentMethodResponse`

**CLI:** `hoody wallet payments methods delete`

---

### `downloadInvoice`

**GET** `/api/v1/wallet/invoices/{id}/pdf`

Download invoice PDF

```typescript
client.api.wallet.downloadInvoice(id: string, options?: { cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | ApiWalletDownloadInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | ApiWalletDownloadInvoiceResponse`

**CLI:** `hoody wallet invoices download`

---

### `getBalance`

**GET** `/api/v1/wallet/balances/general`

Get general balance only

```typescript
client.api.wallet.getBalance(options?: { cache?: boolean | number }): Promise<ApiWalletGetBalanceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetBalanceResponse`

**CLI:** `hoody wallet balance get`

---

### `getBalances`

**GET** `/api/v1/wallet/balances`

Get aggregate balances (general + AI)

```typescript
client.api.wallet.getBalances(options?: { cache?: boolean | number }): Promise<ApiWalletGetBalancesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetBalancesResponse`

**CLI:** `hoody wallet balances get`

---

### `getCredits`

**GET** `/api/v1/wallet/balances/ai`

Get AI balance (limit, usage, remaining)

```typescript
client.api.wallet.getCredits(options?: { cache?: boolean | number }): Promise<ApiWalletGetCreditsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetCreditsResponse`

**CLI:** `hoody wallet credits get`

---

### `getCryptoPaymentIntent`

**GET** `/api/v1/wallet/payments/crypto/intents/{id}`

Get a crypto payment intent

```typescript
client.api.wallet.getCryptoPaymentIntent(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletGetCryptoPaymentIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetCryptoPaymentIntentResponse`

**CLI:** `hoody wallet payments crypto intents get`

---

### `getGithubBonus`

**GET** `/api/v1/wallet/github-bonus`

Get GitHub connection bonus status

```typescript
client.api.wallet.getGithubBonus(options?: { cache?: boolean | number }): Promise<ApiWalletGetGithubBonusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetGithubBonusResponse`

**CLI:** `hoody wallet github bonus status`

---

### `getInvoice`

**GET** `/api/v1/wallet/invoices/{id}`

Get invoice by ID

```typescript
client.api.wallet.getInvoice(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletGetInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetInvoiceResponse`

**CLI:** `hoody wallet invoices get`

---

### `getPaymentAvailability`

**GET** `/api/v1/wallet/payment-availability`

Get top-up payment availability (providers, bounds, AI transfer fee)

```typescript
client.api.wallet.getPaymentAvailability(options?: { cache?: boolean | number }): Promise<ApiWalletGetPaymentAvailabilityResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetPaymentAvailabilityResponse`

**CLI:** `hoody wallet payments availability get`

---

### `getPaymentMethod`

**GET** `/api/v1/wallet/payment-methods/{id}`

Get payment method by ID

```typescript
client.api.wallet.getPaymentMethod(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletGetPaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetPaymentMethodResponse`

**CLI:** `hoody wallet payments methods get`

---

### `getStripePaymentIntent`

**GET** `/api/v1/wallet/payments/stripe/intents/{id}`

Get a card payment intent

```typescript
client.api.wallet.getStripePaymentIntent(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletGetStripePaymentIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetStripePaymentIntentResponse`

**CLI:** `hoody wallet payments stripe intents get`

---

### `getTransaction`

**GET** `/api/v1/wallet/transactions/{id}`

Get transaction by ID

```typescript
client.api.wallet.getTransaction(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletGetTransactionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletGetTransactionResponse`

**CLI:** `hoody wallet transactions get`

---

### `listCreditFees`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history

```typescript
client.api.wallet.listCreditFees(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<ApiWalletListCreditFeesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListCreditFeesResponse`

**CLI:** `hoody wallet credits fees list`

---

### `listCreditFeesAll`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (collect all pages)

```typescript
client.api.wallet.listCreditFeesAll(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc"; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listCreditFeesIterator`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (async iterator)

```typescript
client.api.wallet.listCreditFeesIterator(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc"; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listCryptoPaymentIntents`

**GET** `/api/v1/wallet/payments/crypto/intents`

List crypto payment intents

```typescript
client.api.wallet.listCryptoPaymentIntents(options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<ApiWalletListCryptoPaymentIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListCryptoPaymentIntentsResponse`

**CLI:** `hoody wallet payments crypto intents list`

---

### `listInvoices`

**GET** `/api/v1/wallet/invoices/`

Get all invoices

```typescript
client.api.wallet.listInvoices(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): Promise<ApiWalletListInvoicesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListInvoicesResponse`

**CLI:** `hoody wallet invoices list`

---

### `listInvoicesAll`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (collect all pages)

```typescript
client.api.wallet.listInvoicesAll(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listInvoicesIterator`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (async iterator)

```typescript
client.api.wallet.listInvoicesIterator(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | No | query | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listPaymentMethods`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods

```typescript
client.api.wallet.listPaymentMethods(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<ApiWalletListPaymentMethodsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListPaymentMethodsResponse`

**CLI:** `hoody wallet payments methods list`

---

### `listPaymentMethodsAll`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (collect all pages)

```typescript
client.api.wallet.listPaymentMethodsAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listPaymentMethodsIterator`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (async iterator)

```typescript
client.api.wallet.listPaymentMethodsIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query | Results per page. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listStripePaymentIntents`

**GET** `/api/v1/wallet/payments/stripe/intents`

List card payment intents

```typescript
client.api.wallet.listStripePaymentIntents(options?: { limit?: number; offset?: number; cache?: boolean | number }): Promise<ApiWalletListStripePaymentIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListStripePaymentIntentsResponse`

**CLI:** `hoody wallet payments stripe intents list`

---

### `listTransactions`

**GET** `/api/v1/wallet/transactions`

List transactions

```typescript
client.api.wallet.listTransactions(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): Promise<ApiWalletListTransactionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletListTransactionsResponse`

**CLI:** `hoody wallet transactions list`

---

### `listTransactionsAll`

**GET** `/api/v1/wallet/transactions`

List transactions (collect all pages)

```typescript
client.api.wallet.listTransactionsAll(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listTransactionsIterator`

**GET** `/api/v1/wallet/transactions`

List transactions (async iterator)

```typescript
client.api.wallet.listTransactionsIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number, starting from 1. |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `filter` | `string` | No | query | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `setDefaultPaymentMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}/default`

Set a payment method as default

```typescript
client.api.wallet.setDefaultPaymentMethod(id: string, options?: { cache?: boolean | number }): Promise<ApiWalletSetDefaultPaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletSetDefaultPaymentMethodResponse`

**CLI:** `hoody wallet payments methods default set`

---

### `transferToCredits`

**POST** `/api/v1/wallet/transfers`

Transfer from general balance to AI credits

```typescript
client.api.wallet.transferToCredits(data: ApiWalletTransferToCreditsRequest, options?: { cache?: boolean | number }): Promise<ApiWalletTransferToCreditsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletTransferToCreditsRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletTransferToCreditsResponse`

**CLI:** `hoody wallet credits transfer`

---

### `updatePaymentMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}`

Update a payment method

```typescript
client.api.wallet.updatePaymentMethod(id: string, data: ApiWalletUpdatePaymentMethodRequest, options?: { cache?: boolean | number }): Promise<ApiWalletUpdatePaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiWalletUpdatePaymentMethodRequest` | Yes | body |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiWalletUpdatePaymentMethodResponse`

**CLI:** `hoody wallet payments methods update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
