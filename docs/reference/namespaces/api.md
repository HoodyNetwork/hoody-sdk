# `api` — 285 methods

**Version:** 1.0.0-beta.8
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
client.api.activity.getStats(): Promise<ApiActivityGetStatsResponse>
```

**Returns:** `ApiActivityGetStatsResponse`

**CLI:** `hoody activity stats`

---

### `list`

**GET** `/api/v1/users/auth/activity`

Get activity logs

```typescript
client.api.activity.list(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: "true" | "false"; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): Promise<ApiActivityListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `"true" \| "false"` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `ApiActivityListResponse`

**CLI:** `hoody activity logs`

---

### `listAll`

**GET** `/api/v1/users/auth/activity`

Get activity logs (collect all pages)

```typescript
client.api.activity.listAll(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: "true" | "false"; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `"true" \| "false"` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `unknown[]`

**CLI:** `hoody activity logs`

---

### `listIterator`

**GET** `/api/v1/users/auth/activity`

Get activity logs (async iterator)

```typescript
client.api.activity.listIterator(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: "true" | "false"; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number |
| `limit` | `number` | No | query | Results per page |
| `start_date` | `string` | No | query | Filter logs after this date |
| `end_date` | `string` | No | query | Filter logs before this date |
| `errors_only` | `"true" \| "false"` | No | query | Show only errors (status &gt;= 400) |
| `min_status` | `number` | No | query | Minimum status code |
| `max_status` | `number` | No | query | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | No | query | Filter by HTTP method |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody activity logs`

---

## `client.api.ai` (1 method)

### `listModels`

**GET** `/api/v1/ai/models`

List available AI models (Hoody catalog)

```typescript
client.api.ai.listModels(): Promise<ApiAiListModelsResponse>
```

**Returns:** `ApiAiListModelsResponse`

**CLI:** `hoody ai list`

---

## `client.api.authTokens` (14 methods)

### `addRealm`

**POST** `/api/v1/auth/tokens/{id}/add-realm`

Add realm to auth token

```typescript
client.api.authTokens.addRealm(id: string, data: ApiAuthTokensAddRealmRequest): Promise<ApiAuthTokensAddRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensAddRealmRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensAddRealmResponse`

**CLI:** `hoody auth realms add`

---

### `copy`

**POST** `/api/v1/auth/tokens/{id}/copy`

Copy auth token

```typescript
client.api.authTokens.copy(id: string, data: ApiAuthTokensCopyRequest): Promise<ApiAuthTokensCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |
| `data` | `ApiAuthTokensCopyRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensCopyResponse`

**CLI:** `hoody auth copy`

---

### `create`

**POST** `/api/v1/auth/tokens`

Create a new auth token

```typescript
client.api.authTokens.create(data: ApiAuthTokensCreateRequest): Promise<ApiAuthTokensCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensCreateRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensCreateResponse`

**CLI:** `hoody auth create`

---

### `delete`

**DELETE** `/api/v1/auth/tokens/{id}`

Delete auth token

```typescript
client.api.authTokens.delete(id: string): Promise<ApiAuthTokensDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |

**Returns:** `ApiAuthTokensDeleteResponse`

**CLI:** `hoody auth delete`

---

### `get`

**GET** `/api/v1/auth/tokens/{id}`

Get auth token by ID

```typescript
client.api.authTokens.get(id: string): Promise<ApiAuthTokensGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token |

**Returns:** `ApiAuthTokensGetResponse`

**CLI:** `hoody auth get`

---

### `getCurrent`

**GET** `/api/v1/auth/tokens/me`

Get current auth token details

```typescript
client.api.authTokens.getCurrent(): Promise<ApiAuthTokensGetCurrentResponse>
```

**Returns:** `ApiAuthTokensGetCurrentResponse`

**CLI:** `hoody auth get-current`

---

### `getPublicProfile`

**GET** `/api/v1/auth/tokens/public-profiles/{public_key}`

Get auth token public profile by public key

```typescript
client.api.authTokens.getPublicProfile(public_key: string): Promise<ApiAuthTokensGetPublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `public_key` | `string` | Yes | path | ED25519 public key to resolve |

**Returns:** `ApiAuthTokensGetPublicProfileResponse`

**CLI:** `hoody auth profile by-public-key`

---

### `list`

**GET** `/api/v1/auth/tokens`

List auth tokens

```typescript
client.api.authTokens.list(): Promise<ApiAuthTokensListResponse>
```

**Returns:** `ApiAuthTokensListResponse`

**CLI:** `hoody auth list`

---

### `listAll`

**GET** `/api/v1/auth/tokens`

List auth tokens (collect all pages)

```typescript
client.api.authTokens.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody auth list`

---

### `listAuthTokenPermissionTemplates`

**GET** `/api/v1/auth/tokens/templates`

List permission templates

```typescript
client.api.authTokens.listAuthTokenPermissionTemplates(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `listIterator`

**GET** `/api/v1/auth/tokens`

List auth tokens (async iterator)

```typescript
client.api.authTokens.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody auth list`

---

### `removeRealm`

**POST** `/api/v1/auth/tokens/{id}/remove-realm`

Remove realm from auth token

```typescript
client.api.authTokens.removeRealm(id: string, data: ApiAuthTokensRemoveRealmRequest): Promise<ApiAuthTokensRemoveRealmResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Auth token ID |
| `data` | `ApiAuthTokensRemoveRealmRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensRemoveRealmResponse`

**CLI:** `hoody auth realms remove`

---

### `update`

**PUT** `/api/v1/auth/tokens/{id}`

Update auth token

```typescript
client.api.authTokens.update(id: string, data: ApiAuthTokensUpdateRequest): Promise<ApiAuthTokensUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the token to update |
| `data` | `ApiAuthTokensUpdateRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensUpdateResponse`

**CLI:** `hoody auth update`

---

### `updatePublicProfile`

**PUT** `/api/v1/auth/tokens/me/public-profile`

Update current auth token public profile

```typescript
client.api.authTokens.updatePublicProfile(data: ApiAuthTokensUpdatePublicProfileRequest): Promise<ApiAuthTokensUpdatePublicProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthTokensUpdatePublicProfileRequest` | Yes | body |  |

**Returns:** `ApiAuthTokensUpdatePublicProfileResponse`

**CLI:** `hoody auth profile update`

---

## `client.api.authentication` (28 methods)

### `api_issueIdentityClaim`

**POST** `/api/v1/users/auth/identity-claim`

Issue a fresh audience-bound identity claim

```typescript
client.api.authentication.api_issueIdentityClaim(data: ApiIssueIdentityClaimRequest): Promise<ApiIssueIdentityClaimResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiIssueIdentityClaimRequest` | Yes | body |  |

**Returns:** `ApiIssueIdentityClaimResponse`

---

### `forgotPassword`

**POST** `/api/v1/auth/forgot-password`

Request password reset

```typescript
client.api.authentication.forgotPassword(data: ApiAuthenticationForgotPasswordRequest): Promise<ApiAuthenticationForgotPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationForgotPasswordRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationForgotPasswordResponse`

**CLI:** `hoody auth password forgot`

---

### `getAvailableRegions`

**GET** `/api/v1/auth/available-regions`

Get available server regions

```typescript
client.api.authentication.getAvailableRegions(): Promise<GetAvailableRegionsResponse>
```

**Returns:** `GetAvailableRegionsResponse`

**CLI:** `hoody auth regions`

---

### `getCurrentUser`

**GET** `/api/v1/users/auth/me`

Get current user profile

```typescript
client.api.authentication.getCurrentUser(): Promise<ApiAuthenticationGetCurrentUserResponse>
```

**Returns:** `ApiAuthenticationGetCurrentUserResponse`

**CLI:** `hoody auth profile current`

---

### `getCurrentUserAlias`

**GET** `/api/v1/users/me`

Get current user profile (alias of /users/auth/me)

```typescript
client.api.authentication.getCurrentUserAlias(): Promise<GetCurrentUserAliasResponse>
```

**Returns:** `GetCurrentUserAliasResponse`

---

### `getOAuthConfig`

**GET** `/api/v1/auth/config`

Get the public sign-in configuration

```typescript
client.api.authentication.getOAuthConfig(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `githubOAuthCallback`

**GET** `/api/v1/auth/github/callback`

GitHub OAuth callback

```typescript
client.api.authentication.githubOAuthCallback(options?: { code: string; state: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code` | `string` | Yes | query |  |
| `state` | `string` | Yes | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth github callback`

---

### `githubOAuthRedirect`

**GET** `/api/v1/auth/github`

Redirect to GitHub OAuth

```typescript
client.api.authentication.githubOAuthRedirect(options?: { code_challenge: string; intent?: "login" | "star_check"; redirect_uri?: string; invite_code?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code_challenge` | `string` | Yes | query | PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration. |
| `intent` | `"login" \| "star_check"` | No | query | OAuth intent: login (default). "star_check" is accepted but ignored (retired). |
| `redirect_uri` | `string` | No | query | Frontend URL to redirect to after OAuth completes (must be on allowed domain) |
| `invite_code` | `string` | No | query | Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth github redirect`

---

### `googleOAuthCallback`

**GET** `/api/v1/auth/google/callback`

Google OAuth callback

```typescript
client.api.authentication.googleOAuthCallback(options?: { code: string; state: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code` | `string` | Yes | query |  |
| `state` | `string` | Yes | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth google callback`

---

### `googleOAuthRedirect`

**GET** `/api/v1/auth/google`

Redirect to Google OAuth

```typescript
client.api.authentication.googleOAuthRedirect(options?: { code_challenge: string; redirect_uri?: string; invite_code?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `code_challenge` | `string` | Yes | query | PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration. |
| `redirect_uri` | `string` | No | query | Frontend URL to redirect to after OAuth completes |
| `invite_code` | `string` | No | query | Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody auth oauth google redirect`

---

### `login`

**POST** `/api/v1/users/auth/login`

Login with username and password

```typescript
client.api.authentication.login(data: ApiAuthenticationLoginRequest): Promise<ApiAuthenticationLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationLoginRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationLoginResponse`

**CLI:** `hoody auth login`

---

### `logout`

**POST** `/api/v1/users/auth/logout`

Logout

```typescript
client.api.authentication.logout(): Promise<ApiAuthenticationLogoutResponse>
```

**Returns:** `ApiAuthenticationLogoutResponse`

**CLI:** `hoody auth logout`

---

### `oauthAuthorize`

**POST** `/api/v1/auth/authorize`

Begin a PKCE OAuth authorization

```typescript
client.api.authentication.oauthAuthorize(data: OauthAuthorizeRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthAuthorizeRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

---

### `oauthCancelIntent`

**POST** `/api/v1/auth/intent/cancel`

Cancel a pending OAuth AuthIntent or 2FA temp_token

```typescript
client.api.authentication.oauthCancelIntent(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `oauthDeviceAuthorize`

**GET** `/api/v1/auth/device/authorize`

Start the device-leg OAuth (cookie + ticket gated)

```typescript
client.api.authentication.oauthDeviceAuthorize(options?: { ticket: string; provider: "github" | "google" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ticket` | `string` | Yes | query |  |
| `provider` | `"github" \| "google"` | Yes | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `oauthDeviceCode`

**POST** `/api/v1/auth/device/code`

Start a device authorization flow (RFC-8628-inspired)

```typescript
client.api.authentication.oauthDeviceCode(data: OauthDeviceCodeRequest): Promise<OauthDeviceCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthDeviceCodeRequest` | Yes | body |  |

**Returns:** `OauthDeviceCodeResponse`

---

### `oauthDeviceDeny`

**POST** `/api/v1/auth/device/deny`

Refuse the device ('Don't authorize')

```typescript
client.api.authentication.oauthDeviceDeny(data: OauthDeviceDenyRequest): Promise<OauthDeviceDenyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthDeviceDenyRequest` | Yes | body |  |

**Returns:** `OauthDeviceDenyResponse`

---

### `oauthDeviceLogin`

**POST** `/api/v1/auth/device/login`

Password sign-in for the device authorize step (cookie + ticket gated)

```typescript
client.api.authentication.oauthDeviceLogin(data: OauthDeviceLoginRequest): Promise<OauthDeviceLoginResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthDeviceLoginRequest` | Yes | body |  |

**Returns:** `OauthDeviceLoginResponse`

---

### `oauthDeviceToken`

**POST** `/api/v1/auth/device/token`

Poll for device-flow tokens (RFC-8628-inspired)

```typescript
client.api.authentication.oauthDeviceToken(data: OauthDeviceTokenRequest): Promise<OauthDeviceTokenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthDeviceTokenRequest` | Yes | body |  |

**Returns:** `OauthDeviceTokenResponse`

---

### `oauthDeviceVerifyCode`

**POST** `/api/v1/auth/device/verify_code`

Confirm a device user_code (verification page)

```typescript
client.api.authentication.oauthDeviceVerifyCode(data: OauthDeviceVerifyCodeRequest): Promise<OauthDeviceVerifyCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthDeviceVerifyCodeRequest` | Yes | body |  |

**Returns:** `OauthDeviceVerifyCodeResponse`

---

### `oauthExchange`

**POST** `/api/v1/auth/exchange`

Exchange a PKCE authorization code for tokens

```typescript
client.api.authentication.oauthExchange(data: OauthExchangeRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthExchangeRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

---

### `oauthLaunchInitiate`

**POST** `/api/v1/auth/launch/initiate`

Initiate OAuth popup-handoff launch

```typescript
client.api.authentication.oauthLaunchInitiate(data: OauthLaunchInitiateRequest): Promise<OauthLaunchInitiateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OauthLaunchInitiateRequest` | Yes | body |  |

**Returns:** `OauthLaunchInitiateResponse`

---

### `oauthLaunchStart`

**GET** `/api/v1/auth/launch/start`

Start OAuth popup-handoff via single-use ticket

```typescript
client.api.authentication.oauthLaunchStart(options?: { ticket: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `ticket` | `string` | Yes | query | One-shot ticket from /launch/initiate response |

**Returns:** `ApiResponse<unknown>`

---

### `refreshToken`

**POST** `/api/v1/users/auth/refresh`

Refresh access token

```typescript
client.api.authentication.refreshToken(data: ApiAuthenticationRefreshTokenRequest): Promise<ApiAuthenticationRefreshTokenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationRefreshTokenRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationRefreshTokenResponse`

**CLI:** `hoody auth refresh`

---

### `resendVerification`

**POST** `/api/v1/auth/resend-verification`

Resend verification email

```typescript
client.api.authentication.resendVerification(data: ApiAuthenticationResendVerificationRequest): Promise<ApiAuthenticationResendVerificationResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationResendVerificationRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationResendVerificationResponse`

**CLI:** `hoody auth email resend`

---

### `resetPassword`

**POST** `/api/v1/auth/reset-password`

Reset password

```typescript
client.api.authentication.resetPassword(data: ApiAuthenticationResetPasswordRequest): Promise<ApiAuthenticationResetPasswordResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationResetPasswordRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationResetPasswordResponse`

**CLI:** `hoody auth password reset`

---

### `signup`

**POST** `/api/v1/auth/signup`

Sign up with email and password

```typescript
client.api.authentication.signup(data: ApiAuthenticationSignupRequest): Promise<ApiAuthenticationSignupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationSignupRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationSignupResponse`

**CLI:** `hoody auth signup`

---

### `verifyEmail`

**POST** `/api/v1/auth/verify-email`

Verify email address

```typescript
client.api.authentication.verifyEmail(data: ApiAuthenticationVerifyEmailRequest): Promise<ApiAuthenticationVerifyEmailResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiAuthenticationVerifyEmailRequest` | Yes | body |  |

**Returns:** `ApiAuthenticationVerifyEmailResponse`

**CLI:** `hoody auth email verify`

---

## `client.api.containers` (28 methods)

### `authorize`

**POST** `/api/v1/containers/{id}/authorize`

Authorize Container Access

```typescript
client.api.containers.authorize(id: string): Promise<ApiContainersAuthorizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID (24-char hex) |

**Returns:** `ApiContainersAuthorizeResponse`

**CLI:** `hoody containers authorize`

---

### `copy`

**POST** `/api/v1/containers/{id}/copy`

Copy a container

```typescript
client.api.containers.copy(id: string, data: ApiContainersCopyRequest): Promise<ApiContainersCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the source container to copy |
| `data` | `ApiContainersCopyRequest` | Yes | body |  |

**Returns:** `ApiContainersCopyResponse`

**CLI:** `hoody containers copy`

---

### `create`

**POST** `/api/v1/projects/{id}/containers`

Create a new container

```typescript
client.api.containers.create(id: string, data: ApiContainersCreateRequest): Promise<ApiContainersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiContainersCreateRequest` | Yes | body |  |

**Returns:** `ApiContainersCreateResponse`

**CLI:** `hoody containers create`

---

### `createSnapshot`

**POST** `/api/v1/containers/{id}/snapshots`

Create container snapshot

```typescript
client.api.containers.createSnapshot(id: string, data: ApiContainersCreateSnapshotRequest): Promise<ApiContainersCreateSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to create snapshot for |
| `data` | `ApiContainersCreateSnapshotRequest` | Yes | body |  |

**Returns:** `ApiContainersCreateSnapshotResponse`

**CLI:** `hoody snapshots create`

---

### `delete`

**DELETE** `/api/v1/containers/{id}`

Delete a container

```typescript
client.api.containers.delete(id: string): Promise<ApiContainersDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to delete |

**Returns:** `ApiContainersDeleteResponse`

**CLI:** `hoody containers delete`

---

### `deleteSnapshot`

**DELETE** `/api/v1/containers/{id}/snapshots/{name}`

Delete container snapshot

```typescript
client.api.containers.deleteSnapshot(id: string, name: string): Promise<ApiContainersDeleteSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |
| `name` | `string` | Yes | path |  |

**Returns:** `ApiContainersDeleteSnapshotResponse`

**CLI:** `hoody snapshots delete`

---

### `get`

**GET** `/api/v1/containers/{id}`

Get a container by ID

```typescript
client.api.containers.get(id: string, options?: { runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false" }): Promise<ApiContainersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |

**Returns:** `ApiContainersGetResponse`

**CLI:** `hoody containers get`

---

### `getNetworkConfig`

**GET** `/api/v1/containers/{id}/network`

Get container network configuration

```typescript
client.api.containers.getNetworkConfig(id: string): Promise<ApiContainersGetNetworkConfigResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve network configuration for |

**Returns:** `ApiContainersGetNetworkConfigResponse`

**CLI:** `hoody network get`

---

### `getStats`

**GET** `/api/v1/containers/{id}/stats`

Get container resource statistics

```typescript
client.api.containers.getStats(id: string): Promise<ApiContainersGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |

**Returns:** `ApiContainersGetStatsResponse`

**CLI:** `hoody containers stats`

---

### `getStatusLogs`

**GET** `/api/v1/containers/{id}/status-logs`

Get status logs for a container

```typescript
client.api.containers.getStatusLogs(id: string, options?: { page?: number; limit?: number; sort_by?: "transition_time" | "created_at" | "to_status" | "from_status"; sort_order?: "asc" | "desc" }): Promise<ApiContainersGetStatusLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"transition_time" \| "created_at" \| "to_status" \| "from_status"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiContainersGetStatusLogsResponse`

**CLI:** `hoody containers status-logs`

---

### `list`

**GET** `/api/v1/containers/`

Get all containers

```typescript
client.api.containers.list(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_expired?: "true" | "false"; include_deleting?: "true" | "false" }): Promise<ApiContainersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `"true" \| "false"` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `ApiContainersListResponse`

**CLI:** `hoody containers list`

---

### `listAll`

**GET** `/api/v1/containers/`

Get all containers (collect all pages)

```typescript
client.api.containers.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_expired?: "true" | "false"; include_deleting?: "true" | "false" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `"true" \| "false"` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `unknown[]`

**CLI:** `hoody containers list`

---

### `listByProject`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project

```typescript
client.api.containers.listByProject(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_deleting?: "true" | "false" }): Promise<ApiContainersListByProjectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `ApiContainersListByProjectResponse`

**CLI:** `hoody containers list`

---

### `listByProjectAll`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project (collect all pages)

```typescript
client.api.containers.listByProjectAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_deleting?: "true" | "false" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `unknown[]`

**CLI:** `hoody containers list`

---

### `listByProjectIterator`

**GET** `/api/v1/projects/{id}/containers`

Get all containers for a project (async iterator)

```typescript
client.api.containers.listByProjectIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_deleting?: "true" | "false" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody containers list`

---

### `listIterator`

**GET** `/api/v1/containers/`

Get all containers (async iterator)

```typescript
client.api.containers.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: "true" | "false"; include_proxy_permissions?: "true" | "false"; include_prespawn?: "true" | "false"; include_expired?: "true" | "false"; include_deleting?: "true" | "false" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | No | query | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |
| `realm_id` | `string` | No | query | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | No | query | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `"true" \| "false"` | No | query | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `"true" \| "false"` | No | query | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `"true" \| "false"` | No | query | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `"true" \| "false"` | No | query | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `"true" \| "false"` | No | query | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody containers list`

---

### `listSnapshots`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots

```typescript
client.api.containers.listSnapshots(id: string): Promise<ApiContainersListSnapshotsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |

**Returns:** `ApiContainersListSnapshotsResponse`

**CLI:** `hoody snapshots list`

---

### `listSnapshotsAll`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots (collect all pages)

```typescript
client.api.containers.listSnapshotsAll(id: string): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |

**Returns:** `unknown[]`

**CLI:** `hoody snapshots list`

---

### `listSnapshotsIterator`

**GET** `/api/v1/containers/{id}/snapshots`

Get container snapshots (async iterator)

```typescript
client.api.containers.listSnapshotsIterator(id: string): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to retrieve snapshots for |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody snapshots list`

---

### `manage`

**POST** `/api/v1/containers/{id}/{operation}`

Manage container

```typescript
client.api.containers.manage(id: string, operation: "start" | "stop" | "force-stop" | "restart" | "pause" | "resume"): Promise<ApiContainersManageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `operation` | `"start" \| "stop" \| "force-stop" \| "restart" \| "pause" \| "resume"` | Yes | path |  |

**Returns:** `ApiContainersManageResponse`

**CLI:** `hoody containers manage`

---

### `removeNetworkConfig`

**DELETE** `/api/v1/containers/{id}/network`

Remove container network configuration

```typescript
client.api.containers.removeNetworkConfig(id: string): Promise<ApiContainersRemoveNetworkConfigResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to remove network configuration from |

**Returns:** `ApiContainersRemoveNetworkConfigResponse`

**CLI:** `hoody network delete`

---

### `restoreSnapshot`

**PUT** `/api/v1/containers/{id}/snapshots/{name}`

Restore container from snapshot

```typescript
client.api.containers.restoreSnapshot(id: string, name: string): Promise<ApiContainersRestoreSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to restore |
| `name` | `string` | Yes | path |  |

**Returns:** `ApiContainersRestoreSnapshotResponse`

**CLI:** `hoody snapshots restore`

---

### `startNetwork`

**POST** `/api/v1/containers/{id}/network/start`

Start container network proxy/blocking

```typescript
client.api.containers.startNetwork(id: string): Promise<ApiContainersStartNetworkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to start network for |

**Returns:** `ApiContainersStartNetworkResponse`

**CLI:** `hoody network start`

---

### `stopNetwork`

**POST** `/api/v1/containers/{id}/network/stop`

Stop container network proxy/blocking

```typescript
client.api.containers.stopNetwork(id: string): Promise<ApiContainersStopNetworkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to stop network for |

**Returns:** `ApiContainersStopNetworkResponse`

**CLI:** `hoody network stop`

---

### `sync`

**POST** `/api/v1/containers/{id}/sync`

Sync a copied container with its source

```typescript
client.api.containers.sync(id: string): Promise<ApiContainersSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to sync (must have been created via copy) |

**Returns:** `ApiContainersSyncResponse`

**CLI:** `hoody containers sync`

---

### `update`

**PUT** `/api/v1/containers/{id}`

Update a container

```typescript
client.api.containers.update(id: string, data: ApiContainersUpdateRequest): Promise<ApiContainersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to update |
| `data` | `ApiContainersUpdateRequest` | Yes | body |  |

**Returns:** `ApiContainersUpdateResponse`

**CLI:** `hoody containers update`

---

### `updateNetworkConfig`

**PUT** `/api/v1/containers/{id}/network`

Update container network configuration

```typescript
client.api.containers.updateNetworkConfig(id: string, data: ApiContainersUpdateNetworkConfigRequest): Promise<ApiContainersUpdateNetworkConfigResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container to configure network for |
| `data` | `ApiContainersUpdateNetworkConfigRequest` | Yes | body |  |

**Returns:** `ApiContainersUpdateNetworkConfigResponse`

**CLI:** `hoody network update`

---

### `updateSnapshotAlias`

**PUT** `/api/v1/containers/{id}/snapshots/{name}/alias`

Update snapshot alias

```typescript
client.api.containers.updateSnapshotAlias(id: string, name: string, data: ApiContainersUpdateSnapshotAliasRequest): Promise<ApiContainersUpdateSnapshotAliasResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container |
| `name` | `string` | Yes | path |  |
| `data` | `ApiContainersUpdateSnapshotAliasRequest` | Yes | body |  |

**Returns:** `ApiContainersUpdateSnapshotAliasResponse`

**CLI:** `hoody snapshots update-alias`

---

## `client.api.env` (4 methods)

### `bulkSet`

**PUT** `/api/v1/containers/{id}/env`

Bulk set container environment variables

```typescript
client.api.env.bulkSet(id: string, data: ApiEnvBulkSetRequest): Promise<ApiEnvBulkSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiEnvBulkSetRequest` | Yes | body |  |

**Returns:** `ApiEnvBulkSetResponse`

**CLI:** `hoody containers env bulk-set`

---

### `delete`

**DELETE** `/api/v1/containers/{id}/env/{key}`

Delete a single environment variable

```typescript
client.api.env.delete(id: string, key: string): Promise<ApiEnvDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `key` | `string` | Yes | path | Environment variable key |

**Returns:** `ApiEnvDeleteResponse`

**CLI:** `hoody containers env delete`

---

### `list`

**GET** `/api/v1/containers/{id}/env`

List container environment variables

```typescript
client.api.env.list(id: string): Promise<ApiEnvListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ApiEnvListResponse`

**CLI:** `hoody containers env list`

---

### `set`

**PUT** `/api/v1/containers/{id}/env/{key}`

Set a single environment variable

```typescript
client.api.env.set(id: string, key: string, data: ApiEnvSetRequest): Promise<ApiEnvSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `key` | `string` | Yes | path | Environment variable key |
| `data` | `ApiEnvSetRequest` | Yes | body |  |

**Returns:** `ApiEnvSetResponse`

**CLI:** `hoody containers env set`

---

## `client.api.events` (8 methods)

### `bulkDelete`

**DELETE** `/api/v1/events`

Bulk delete events

```typescript
client.api.events.bulkDelete(data: ApiEventsBulkDeleteRequest): Promise<ApiEventsBulkDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsBulkDeleteRequest` | Yes | body |  |

**Returns:** `ApiEventsBulkDeleteResponse`

**CLI:** `hoody events bulk-delete`

---

### `cleanup`

**POST** `/api/v1/events/cleanup`

Cleanup old events

```typescript
client.api.events.cleanup(data: ApiEventsCleanupRequest): Promise<ApiEventsCleanupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiEventsCleanupRequest` | Yes | body |  |

**Returns:** `ApiEventsCleanupResponse`

**CLI:** `hoody events cleanup`

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
client.api.events.list(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string }): Promise<ApiEventsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "auth.token.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "user.created" \| "auth.token.updated" \| "auth.token.enabled" \| "auth.token.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "storage.share.mount_changed" \| "notification.read" \| "server.health_changed" \| "server.rental_expiring" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "user.banned" \| "user.unbanned" \| "user.role_changed" \| "activity.logged"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "user" \| "activity_log"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `ApiEventsListResponse`

**CLI:** `hoody events list`

---

### `listAll`

**GET** `/api/v1/events`

List event history (collect all pages)

```typescript
client.api.events.listAll(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "auth.token.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "user.created" \| "auth.token.updated" \| "auth.token.enabled" \| "auth.token.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "storage.share.mount_changed" \| "notification.read" \| "server.health_changed" \| "server.rental_expiring" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "user.banned" \| "user.unbanned" \| "user.role_changed" \| "activity.logged"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "user" \| "activity_log"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `unknown[]`

**CLI:** `hoody events list`

---

### `listIterator`

**GET** `/api/v1/events`

List event history (async iterator)

```typescript
client.api.events.listIterator(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Number of events to return (max 500) |
| `offset` | `number` | No | query | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | No | query | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "auth.token.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "user.created" \| "auth.token.updated" \| "auth.token.enabled" \| "auth.token.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "storage.share.mount_changed" \| "notification.read" \| "server.health_changed" \| "server.rental_expiring" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "user.banned" \| "user.unbanned" \| "user.role_changed" \| "activity.logged"` | No | query | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "user" \| "activity_log"` | No | query | Filter by resource type |
| `resource_id` | `string` | No | query | Filter by specific resource ID |
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `start_date` | `string` | No | query | Filter events after this timestamp |
| `end_date` | `string` | No | query | Filter events before this timestamp |
| `realm_id` | `string` | No | query | Filter by realm ID |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody events list`

---

## `client.api.firewall` (10 methods)

### `addEgressRule`

**POST** `/api/v1/containers/{id}/firewall/egress`

Add Egress Rule

```typescript
client.api.firewall.addEgressRule(id: string, data: ApiFirewallAddEgressRuleRequest): Promise<ApiFirewallAddEgressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallAddEgressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallAddEgressRuleResponse`

**CLI:** `hoody firewall egress create`

---

### `addIngressRule`

**POST** `/api/v1/containers/{id}/firewall/ingress`

Add Ingress Rule

```typescript
client.api.firewall.addIngressRule(id: string, data: ApiFirewallAddIngressRuleRequest): Promise<ApiFirewallAddIngressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallAddIngressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallAddIngressRuleResponse`

**CLI:** `hoody firewall ingress create`

---

### `list`

**GET** `/api/v1/containers/{id}/firewall/rules`

List container firewall rules

```typescript
client.api.firewall.list(id: string): Promise<ApiFirewallListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ApiFirewallListResponse`

**CLI:** `hoody firewall list`

---

### `listAll`

**GET** `/api/v1/containers/{id}/firewall/rules`

List container firewall rules (collect all pages)

```typescript
client.api.firewall.listAll(id: string): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `unknown[]`

**CLI:** `hoody firewall list`

---

### `listIterator`

**GET** `/api/v1/containers/{id}/firewall/rules`

List container firewall rules (async iterator)

```typescript
client.api.firewall.listIterator(id: string): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody firewall list`

---

### `removeEgressRule`

**DELETE** `/api/v1/containers/{id}/firewall/egress`

Remove Egress Rule(s)

```typescript
client.api.firewall.removeEgressRule(id: string, data: ApiFirewallRemoveEgressRuleRequest): Promise<ApiFirewallRemoveEgressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallRemoveEgressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallRemoveEgressRuleResponse`

**CLI:** `hoody firewall egress delete`

---

### `removeIngressRule`

**DELETE** `/api/v1/containers/{id}/firewall/ingress`

Remove Ingress Rule(s)

```typescript
client.api.firewall.removeIngressRule(id: string, data: ApiFirewallRemoveIngressRuleRequest): Promise<ApiFirewallRemoveIngressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallRemoveIngressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallRemoveIngressRuleResponse`

**CLI:** `hoody firewall ingress delete`

---

### `reset`

**POST** `/api/v1/containers/{id}/firewall/reset`

Reset container firewall

```typescript
client.api.firewall.reset(id: string): Promise<ApiFirewallResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ApiFirewallResetResponse`

**CLI:** `hoody firewall reset`

---

### `toggleEgressRule`

**PATCH** `/api/v1/containers/{id}/firewall/egress`

Toggle Egress Rule State

```typescript
client.api.firewall.toggleEgressRule(id: string, data: ApiFirewallToggleEgressRuleRequest): Promise<ApiFirewallToggleEgressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallToggleEgressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallToggleEgressRuleResponse`

**CLI:** `hoody firewall egress toggle`

---

### `toggleIngressRule`

**PATCH** `/api/v1/containers/{id}/firewall/ingress`

Toggle Ingress Rule State

```typescript
client.api.firewall.toggleIngressRule(id: string, data: ApiFirewallToggleIngressRuleRequest): Promise<ApiFirewallToggleIngressRuleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiFirewallToggleIngressRuleRequest` | Yes | body |  |

**Returns:** `ApiFirewallToggleIngressRuleResponse`

**CLI:** `hoody firewall ingress toggle`

---

## `client.api.images` (11 methods)

### `getDetails`

**GET** `/api/v1/images/public/{id}`

Get public image details

```typescript
client.api.images.getDetails(id: string): Promise<ApiImagesGetDetailsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public container image to retrieve details for |

**Returns:** `ApiImagesGetDetailsResponse`

**CLI:** `hoody images get`

---

### `getIcon`

**GET** `/api/v1/images/{id}/icon`

Get image icon

```typescript
client.api.images.getIcon(id: string): Promise<ApiImagesGetIconResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container image to retrieve icon for |

**Returns:** `ApiImagesGetIconResponse`

**CLI:** `hoody images icon`

---

### `importFree`

**POST** `/api/v1/images/import/{id}`

Import free image

```typescript
client.api.images.importFree(id: string): Promise<ApiImagesImportFreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the public container image to import |

**Returns:** `ApiImagesImportFreeResponse`

**CLI:** `hoody images import-free`

---

### `list`

**GET** `/api/v1/images/user`

List user images

```typescript
client.api.images.list(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): Promise<ApiImagesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `ApiImagesListResponse`

**CLI:** `hoody images mine`

---

### `listAll`

**GET** `/api/v1/images/user`

List user images (collect all pages)

```typescript
client.api.images.listAll(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `unknown[]`

**CLI:** `hoody images mine`

---

### `listIterator`

**GET** `/api/v1/images/user`

List user images (async iterator)

```typescript
client.api.images.listIterator(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | No | query | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody images mine`

---

### `listPublic`

**GET** `/api/v1/images/public`

List public images

```typescript
client.api.images.listPublic(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" }): Promise<ApiImagesListPublicResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., ubuntu, debian, alpine, centos |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating &lt;= this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
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
| `os` | `string` | No | query | Filter images by operating system - e.g., ubuntu, debian, alpine, centos |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating &lt;= this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `unknown[]`

**CLI:** `hoody images list`

---

### `listPublicIterator`

**GET** `/api/v1/images/public`

List public images (async iterator)

```typescript
client.api.images.listPublicIterator(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `os` | `string` | No | query | Filter images by operating system - e.g., ubuntu, debian, alpine, centos |
| `architecture` | `string` | No | query | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | No | query | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | No | query | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | No | query | Minimum average rating filter - filters images with rating &gt;= this value (0-5 stars) |
| `max_rating` | `number` | No | query | Maximum average rating filter - filters images with rating &lt;= this value (0-5 stars) |
| `search` | `string` | No | query | Search term to filter images by name, description, or tags |
| `page` | `number` | No | query | Page number for pagination - starts from 1 |
| `limit` | `number` | No | query | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | No | query | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | No | query | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody images list`

---

### `purchase`

**POST** `/api/v1/images/purchase/{id}`

Purchase image

```typescript
client.api.images.purchase(id: string): Promise<ApiImagesPurchaseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the paid container image to purchase |

**Returns:** `ApiImagesPurchaseResponse`

**CLI:** `hoody images purchase`

---

### `rate`

**POST** `/api/v1/images/rate/{id}`

Rate image

```typescript
client.api.images.rate(id: string, data: ApiImagesRateRequest): Promise<ApiImagesRateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the container image to rate |
| `data` | `ApiImagesRateRequest` | Yes | body |  |

**Returns:** `ApiImagesRateResponse`

**CLI:** `hoody images rate`

---

## `client.api.meta` (2 methods)

### `getPublicKey`

**GET** `/api/v1/meta/public-key`

Get Hoody API Signing Public Key

```typescript
client.api.meta.getPublicKey(): Promise<ApiMetaGetPublicKeyResponse>
```

**Returns:** `ApiMetaGetPublicKeyResponse`

**CLI:** `hoody meta get`

---

### `getSocialStats`

**GET** `/api/v1/meta/social-stats`

Get Hoody Social Counters

```typescript
client.api.meta.getSocialStats(): Promise<GetSocialStatsResponse>
```

**Returns:** `GetSocialStatsResponse`

---

## `client.api.notifications` (8 methods)

### `list`

**GET** `/api/v1/notifications/`

Get all notifications for the authenticated user

```typescript
client.api.notifications.list(): Promise<ApiNotificationsListResponse>
```

**Returns:** `ApiNotificationsListResponse`

**CLI:** `hoody inbox list`

---

### `listAll`

**GET** `/api/v1/notifications/`

Get all notifications for the authenticated user (collect all pages)

```typescript
client.api.notifications.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody inbox list`

---

### `listIterator`

**GET** `/api/v1/notifications/`

Get all notifications for the authenticated user (async iterator)

```typescript
client.api.notifications.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody inbox list`

---

### `listPublic`

**GET** `/api/v1/notifications/public`

Get all public notifications

```typescript
client.api.notifications.listPublic(): Promise<ApiNotificationsListPublicResponse>
```

**Returns:** `ApiNotificationsListPublicResponse`

**CLI:** `hoody inbox list-public`

---

### `listPublicAll`

**GET** `/api/v1/notifications/public`

Get all public notifications (collect all pages)

```typescript
client.api.notifications.listPublicAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody inbox list-public`

---

### `listPublicIterator`

**GET** `/api/v1/notifications/public`

Get all public notifications (async iterator)

```typescript
client.api.notifications.listPublicIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody inbox list-public`

---

### `markAllRead`

**PUT** `/api/v1/notifications/read-all`

Mark all notifications as read

```typescript
client.api.notifications.markAllRead(): Promise<ApiNotificationsMarkAllReadResponse>
```

**Returns:** `ApiNotificationsMarkAllReadResponse`

**CLI:** `hoody inbox mark-all`

---

### `markRead`

**PUT** `/api/v1/notifications/{id}/read`

Mark a notification as read

```typescript
client.api.notifications.markRead(id: string): Promise<ApiNotificationsMarkReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique identifier of the notification to mark as read |

**Returns:** `ApiNotificationsMarkReadResponse`

**CLI:** `hoody inbox mark`

---

## `client.api.poolInvitations` (3 methods)

### `accept`

**POST** `/api/v1/pools/{id}/accept`

Accept invitation

```typescript
client.api.poolInvitations.accept(id: string): Promise<ApiPoolInvitationsAcceptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolInvitationsAcceptResponse`

**CLI:** `hoody pools invitations accept`

---

### `list`

**GET** `/api/v1/pools/invitations/pending`

List pending invitations

```typescript
client.api.poolInvitations.list(): Promise<ApiPoolInvitationsListResponse>
```

**Returns:** `ApiPoolInvitationsListResponse`

**CLI:** `hoody pools invitations list`

---

### `reject`

**POST** `/api/v1/pools/{id}/reject`

Reject invitation

```typescript
client.api.poolInvitations.reject(id: string): Promise<ApiPoolInvitationsRejectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiPoolInvitationsRejectResponse`

**CLI:** `hoody pools invitations reject`

---

## `client.api.poolMembers` (3 methods)

### `invite`

**POST** `/api/v1/pools/{id}/members`

Invite member

```typescript
client.api.poolMembers.invite(id: string, data: ApiPoolMembersInviteRequest): Promise<ApiPoolMembersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiPoolMembersInviteRequest` | Yes | body |  |

**Returns:** `ApiPoolMembersInviteResponse`

**CLI:** `hoody pools members invite`

---

### `remove`

**DELETE** `/api/v1/pools/{id}/members/{userId}`

Remove member

```typescript
client.api.poolMembers.remove(id: string, userId: string): Promise<ApiPoolMembersRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |

**Returns:** `ApiPoolMembersRemoveResponse`

**CLI:** `hoody pools members delete`

---

### `updateRole`

**PUT** `/api/v1/pools/{id}/members/{userId}`

Update member role

```typescript
client.api.poolMembers.updateRole(id: string, userId: string, data: ApiPoolMembersUpdateRoleRequest): Promise<ApiPoolMembersUpdateRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `ApiPoolMembersUpdateRoleRequest` | Yes | body |  |

**Returns:** `ApiPoolMembersUpdateRoleResponse`

**CLI:** `hoody pools members update-role`

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

**CLI:** `hoody pools list`

---

### `listIterator`

**GET** `/api/v1/pools`

List user pools (async iterator)

```typescript
client.api.pools.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody pools list`

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

## `client.api.projects` (14 methods)

### `addPermission`

**POST** `/api/v1/projects/{id}/permissions`

Grant project access

```typescript
client.api.projects.addPermission(id: string, data: ApiProjectsAddPermissionRequest): Promise<ApiProjectsAddPermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProjectsAddPermissionRequest` | Yes | body |  |

**Returns:** `ApiProjectsAddPermissionResponse`

**CLI:** `hoody projects permissions create`

---

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
client.api.projects.delete(id: string, options?: { include_deleted_items?: boolean }): Promise<ApiProjectsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID to delete |
| `include_deleted_items` | `boolean` | No | query | Include a lightweight list of deleted container IDs/names in the response for confirmation UX. |

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
| `include_permissions` | `boolean` | No | query | Include project permissions with user details in response |

**Returns:** `ApiProjectsGetResponse`

**CLI:** `hoody projects get`

---

### `getStats`

**GET** `/api/v1/projects/{id}/stats`

Get statistics for all containers in a project

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

**CLI:** `hoody projects list`

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

**CLI:** `hoody projects list`

---

### `listPermissions`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions

```typescript
client.api.projects.listPermissions(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<ApiProjectsListPermissionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiProjectsListPermissionsResponse`

**CLI:** `hoody projects permissions list`

---

### `listPermissionsAll`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (collect all pages)

```typescript
client.api.projects.listPermissionsAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody projects permissions list`

---

### `listPermissionsIterator`

**GET** `/api/v1/projects/{id}/permissions`

List project permissions (async iterator)

```typescript
client.api.projects.listPermissionsIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody projects permissions list`

---

### `removePermission`

**DELETE** `/api/v1/projects/{id}/permissions/{permissionId}`

Revoke project access

```typescript
client.api.projects.removePermission(id: string, permissionId: string): Promise<ApiProjectsRemovePermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to remove |

**Returns:** `ApiProjectsRemovePermissionResponse`

**CLI:** `hoody projects permissions delete`

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

### `updatePermission`

**PUT** `/api/v1/projects/{id}/permissions/{permissionId}`

Update project permission

```typescript
client.api.projects.updatePermission(id: string, permissionId: string, data: ApiProjectsUpdatePermissionRequest): Promise<ApiProjectsUpdatePermissionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `permissionId` | `string` | Yes | path | Permission ID to update |
| `data` | `ApiProjectsUpdatePermissionRequest` | Yes | body |  |

**Returns:** `ApiProjectsUpdatePermissionResponse`

**CLI:** `hoody projects permissions update`

---

## `client.api.proxyAliases` (8 methods)

### `create`

**POST** `/api/v1/proxy/aliases`

Create a new proxy alias

```typescript
client.api.proxyAliases.create(data: ApiProxyAliasesCreateRequest): Promise<ApiProxyAliasesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiProxyAliasesCreateRequest` | Yes | body |  |

**Returns:** `ApiProxyAliasesCreateResponse`

**CLI:** `hoody proxy create`

---

### `delete`

**DELETE** `/api/v1/proxy/aliases/{id}`

Delete proxy alias

```typescript
client.api.proxyAliases.delete(id: string): Promise<ApiProxyAliasesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to delete |

**Returns:** `ApiProxyAliasesDeleteResponse`

**CLI:** `hoody proxy delete`

---

### `get`

**GET** `/api/v1/proxy/aliases/{id}`

Get proxy alias by ID

```typescript
client.api.proxyAliases.get(id: string): Promise<ApiProxyAliasesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |

**Returns:** `ApiProxyAliasesGetResponse`

**CLI:** `hoody proxy get`

---

### `list`

**GET** `/api/v1/proxy/aliases`

List proxy aliases

```typescript
client.api.proxyAliases.list(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: "true" | "false"; expired?: "true" | "false" }): Promise<ApiProxyAliasesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `expired` | `"true" \| "false"` | No | query | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `ApiProxyAliasesListResponse`

**CLI:** `hoody proxy list`

---

### `listAll`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (collect all pages)

```typescript
client.api.proxyAliases.listAll(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: "true" | "false"; expired?: "true" | "false" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `expired` | `"true" \| "false"` | No | query | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `unknown[]`

**CLI:** `hoody proxy list`

---

### `listIterator`

**GET** `/api/v1/proxy/aliases`

List proxy aliases (async iterator)

```typescript
client.api.proxyAliases.listIterator(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: "true" | "false"; expired?: "true" | "false" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `project_id` | `string` | No | query | Filter by project ID |
| `container_id` | `string` | No | query | Filter by container ID |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `expired` | `"true" \| "false"` | No | query | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody proxy list`

---

### `setState`

**PATCH** `/api/v1/proxy/aliases/{id}/state`

Enable or disable proxy alias

```typescript
client.api.proxyAliases.setState(id: string, data: ApiProxyAliasesSetStateRequest): Promise<ApiProxyAliasesSetStateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID |
| `data` | `ApiProxyAliasesSetStateRequest` | Yes | body |  |

**Returns:** `ApiProxyAliasesSetStateResponse`

**CLI:** `hoody proxy set-state`

---

### `update`

**PATCH** `/api/v1/proxy/aliases/{id}`

Update proxy alias

```typescript
client.api.proxyAliases.update(id: string, data: ApiProxyAliasesUpdateRequest): Promise<ApiProxyAliasesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Proxy alias ID to update |
| `data` | `ApiProxyAliasesUpdateRequest` | Yes | body |  |

**Returns:** `ApiProxyAliasesUpdateResponse`

**CLI:** `hoody proxy update`

---

## `client.api.proxyDiscovery` (5 methods)

### `getContainerProxyService`

**GET** `/api/v1/containers/{id}/proxy/services/{service}`

Get merged proxy view for a service

```typescript
client.api.proxyDiscovery.getContainerProxyService(id: string, service: string): Promise<GetContainerProxyServiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |

**Returns:** `GetContainerProxyServiceResponse`

**CLI:** `hoody containers proxy discovery services get`

---

### `getContainerProxySettings`

**GET** `/api/v1/containers/{id}/proxy/settings`

Get container proxy root settings

```typescript
client.api.proxyDiscovery.getContainerProxySettings(id: string): Promise<GetContainerProxySettingsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `GetContainerProxySettingsResponse`

**CLI:** `hoody containers proxy settings get`

---

### `listContainerProxyGroups`

**GET** `/api/v1/containers/{id}/proxy/groups`

List container proxy groups

```typescript
client.api.proxyDiscovery.listContainerProxyGroups(id: string): Promise<ListContainerProxyGroupsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ListContainerProxyGroupsResponse`

**CLI:** `hoody containers proxy discovery groups list`

---

### `listContainerProxyServices`

**GET** `/api/v1/containers/{id}/proxy/services`

List services referenced in proxy config

```typescript
client.api.proxyDiscovery.listContainerProxyServices(id: string): Promise<ListContainerProxyServicesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ListContainerProxyServicesResponse`

**CLI:** `hoody containers proxy discovery services list`

---

### `updateContainerProxySettings`

**PUT** `/api/v1/containers/{id}/proxy/settings`

Update container proxy root settings

```typescript
client.api.proxyDiscovery.updateContainerProxySettings(id: string, data: UpdateContainerProxySettingsPatchRequest, options?: { ifMatch?: string }): Promise<UpdateContainerProxySettingsPatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `UpdateContainerProxySettingsPatchRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `UpdateContainerProxySettingsPatchResponse`

**CLI:** `hoody containers proxy settings update`

---

## `client.api.proxyHooks` (8 methods)

### `addContainerProxyHook`

**POST** `/api/v1/containers/{id}/proxy/hooks/{service}`

Append or insert a new hook

```typescript
client.api.proxyHooks.addContainerProxyHook(id: string, service: string, data: AddContainerProxyHookRequest, options?: { ifMatch?: string }): Promise<AddContainerProxyHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `data` | `AddContainerProxyHookRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `AddContainerProxyHookResponse`

**CLI:** `hoody containers proxy hooks create`

---

### `clearContainerProxyServiceHooks`

**DELETE** `/api/v1/containers/{id}/proxy/hooks/{service}`

Clear all hooks for a service

```typescript
client.api.proxyHooks.clearContainerProxyServiceHooks(id: string, service: string, options?: { ifMatch?: string }): Promise<ClearContainerProxyServiceHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `ClearContainerProxyServiceHooksResponse`

**CLI:** `hoody containers proxy hooks clear-service`

---

### `getContainerProxyHook`

**GET** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Get a single hook by id

```typescript
client.api.proxyHooks.getContainerProxyHook(id: string, service: string, hookId: string): Promise<GetContainerProxyHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |

**Returns:** `GetContainerProxyHookResponse`

**CLI:** `hoody containers proxy hooks get`

---

### `listContainerProxyHooks`

**GET** `/api/v1/containers/{id}/proxy/hooks`

List all proxy hooks for a container

```typescript
client.api.proxyHooks.listContainerProxyHooks(id: string): Promise<ListContainerProxyHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ListContainerProxyHooksResponse`

**CLI:** `hoody containers proxy hooks list`

---

### `listContainerProxyServiceHooks`

**GET** `/api/v1/containers/{id}/proxy/hooks/{service}`

List hooks for a specific service

```typescript
client.api.proxyHooks.listContainerProxyServiceHooks(id: string, service: string): Promise<ListContainerProxyServiceHooksResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |

**Returns:** `ListContainerProxyServiceHooksResponse`

**CLI:** `hoody containers proxy hooks list-service`

---

### `moveContainerProxyHook`

**PATCH** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position`

Move a hook to a new position

```typescript
client.api.proxyHooks.moveContainerProxyHook(id: string, service: string, hookId: string, data: MoveContainerProxyHookRequest, options?: { ifMatch?: string }): Promise<MoveContainerProxyHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `MoveContainerProxyHookRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `MoveContainerProxyHookResponse`

**CLI:** `hoody containers proxy hooks move`

---

### `removeContainerProxyHook`

**DELETE** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Remove a hook

```typescript
client.api.proxyHooks.removeContainerProxyHook(id: string, service: string, hookId: string, options?: { ifMatch?: string }): Promise<RemoveContainerProxyHookResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `RemoveContainerProxyHookResponse`

**CLI:** `hoody containers proxy hooks delete`

---

### `updateContainerProxyHook`

**PUT** `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`

Replace a hook in place

```typescript
client.api.proxyHooks.updateContainerProxyHook(id: string, service: string, hookId: string, data: UpdateContainerProxyHookPatchRequest, options?: { ifMatch?: string }): Promise<UpdateContainerProxyHookPatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `service` | `string` | Yes | path | Service name |
| `hookId` | `string` | Yes | path | 26-char Crockford base32 ULID (lowercase) |
| `data` | `UpdateContainerProxyHookPatchRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition |

**Returns:** `UpdateContainerProxyHookPatchResponse`

**CLI:** `hoody containers proxy hooks update`

---

## `client.api.proxyPermissionsContainer` (13 methods)

### `delete`

**DELETE** `/api/v1/containers/{id}/proxy/permissions`

Delete container proxy permissions

```typescript
client.api.proxyPermissionsContainer.delete(id: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerDeleteResponse`

**CLI:** `hoody containers proxy permissions delete`

---

### `get`

**GET** `/api/v1/containers/{id}/proxy/permissions`

Get container proxy permissions

```typescript
client.api.proxyPermissionsContainer.get(id: string): Promise<ApiProxyPermissionsContainerGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ApiProxyPermissionsContainerGetResponse`

**CLI:** `hoody containers proxy permissions get`

---

### `removeAuthGroup`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}`

Remove container authentication group

```typescript
client.api.proxyPermissionsContainer.removeAuthGroup(id: string, groupName: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerRemoveAuthGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerRemoveAuthGroupResponse`

**CLI:** `hoody containers proxy groups delete`

---

### `removeGroup`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a container group

```typescript
client.api.proxyPermissionsContainer.removeGroup(id: string, groupName: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerRemoveGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerRemoveGroupResponse`

**CLI:** `hoody containers proxy groups permissions clear`

---

### `removeProgram`

**DELETE** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a container group

```typescript
client.api.proxyPermissionsContainer.removeProgram(id: string, groupName: string, program: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerRemoveProgramResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerRemoveProgramResponse`

**CLI:** `hoody containers proxy groups permissions delete`

---

### `replace`

**PUT** `/api/v1/containers/{id}/proxy/permissions`

Replace container proxy permissions JSON

```typescript
client.api.proxyPermissionsContainer.replace(id: string, data: ApiProxyPermissionsContainerReplaceRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerReplaceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerReplaceRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerReplaceResponse`

**CLI:** `hoody containers proxy permissions replace`

---

### `setGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`

Set container group program permission

```typescript
client.api.proxyPermissionsContainer.setGroup(id: string, groupName: string, data: ApiProxyPermissionsContainerSetGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerSetGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerSetGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerSetGroupResponse`

**CLI:** `hoody containers proxy groups permissions set`

---

### `setIpGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setIpGroup(id: string, groupName: string, data: ApiProxyPermissionsContainerSetIpGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerSetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerSetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerSetIpGroupResponse`

**CLI:** `hoody containers proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setJwtGroup(id: string, groupName: string, data: ApiProxyPermissionsContainerSetJwtGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerSetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerSetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerSetJwtGroupResponse`

**CLI:** `hoody containers proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setPasswordGroup(id: string, groupName: string, data: ApiProxyPermissionsContainerSetPasswordGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerSetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerSetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerSetPasswordGroupResponse`

**CLI:** `hoody containers proxy groups password set`

---

### `setTokenGroup`

**PUT** `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setTokenGroup(id: string, groupName: string, data: ApiProxyPermissionsContainerSetTokenGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerSetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsContainerSetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerSetTokenGroupResponse`

**CLI:** `hoody containers proxy groups token set`

---

### `updateDefault`

**PATCH** `/api/v1/containers/{id}/proxy/permissions/default`

Update container default proxy permission policy

```typescript
client.api.proxyPermissionsContainer.updateDefault(id: string, data: ApiProxyPermissionsContainerUpdateDefaultRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerUpdateDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiProxyPermissionsContainerUpdateDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerUpdateDefaultResponse`

**CLI:** `hoody containers proxy default`

---

### `updateState`

**PATCH** `/api/v1/containers/{id}/proxy/permissions/state`

Update container proxy enable state

```typescript
client.api.proxyPermissionsContainer.updateState(id: string, data: ApiProxyPermissionsContainerUpdateStateRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsContainerUpdateStateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |
| `data` | `ApiProxyPermissionsContainerUpdateStateRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsContainerUpdateStateResponse`

**CLI:** `hoody containers proxy state`

---

## `client.api.proxyPermissionsProject` (13 methods)

### `delete`

**DELETE** `/api/v1/projects/{id}/proxy/permissions`

Delete project proxy permissions

```typescript
client.api.proxyPermissionsProject.delete(id: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectDeleteResponse`

**CLI:** `hoody projects proxy permissions delete`

---

### `get`

**GET** `/api/v1/projects/{id}/proxy/permissions`

Get project proxy permissions

```typescript
client.api.proxyPermissionsProject.get(id: string): Promise<ApiProxyPermissionsProjectGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |

**Returns:** `ApiProxyPermissionsProjectGetResponse`

**CLI:** `hoody projects proxy permissions get`

---

### `removeAuthGroup`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}`

Remove project authentication group

```typescript
client.api.proxyPermissionsProject.removeAuthGroup(id: string, groupName: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectRemoveAuthGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name to remove |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectRemoveAuthGroupResponse`

**CLI:** `hoody projects proxy groups delete`

---

### `removeGroup`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Remove all program permissions for a project group

```typescript
client.api.proxyPermissionsProject.removeGroup(id: string, groupName: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectRemoveGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectRemoveGroupResponse`

**CLI:** `hoody projects proxy groups permissions clear`

---

### `removeProgram`

**DELETE** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`

Remove a single program permission for a project group

```typescript
client.api.proxyPermissionsProject.removeProgram(id: string, groupName: string, program: string, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectRemoveProgramResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `groupName` | `string` | Yes | path | Group name |
| `program` | `string` | Yes | path | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectRemoveProgramResponse`

**CLI:** `hoody projects proxy groups permissions delete`

---

### `replace`

**PUT** `/api/v1/projects/{id}/proxy/permissions`

Replace project proxy permissions JSON

```typescript
client.api.proxyPermissionsProject.replace(id: string, data: ApiProxyPermissionsProjectReplaceRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectReplaceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectReplaceRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectReplaceResponse`

**CLI:** `hoody projects proxy permissions replace`

---

### `setGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`

Set project group program permission

```typescript
client.api.proxyPermissionsProject.setGroup(id: string, groupName: string, data: ApiProxyPermissionsProjectSetGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectSetGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectSetGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectSetGroupResponse`

**CLI:** `hoody projects proxy groups permissions set`

---

### `setIpGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip`

Set IP authentication group (project)

```typescript
client.api.proxyPermissionsProject.setIpGroup(id: string, groupName: string, data: ApiProxyPermissionsProjectSetIpGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectSetIpGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectSetIpGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectSetIpGroupResponse`

**CLI:** `hoody projects proxy groups ip set`

---

### `setJwtGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt`

Set JWT authentication group (project)

```typescript
client.api.proxyPermissionsProject.setJwtGroup(id: string, groupName: string, data: ApiProxyPermissionsProjectSetJwtGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectSetJwtGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectSetJwtGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectSetJwtGroupResponse`

**CLI:** `hoody projects proxy groups jwt set`

---

### `setPasswordGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password`

Set password authentication group (project)

```typescript
client.api.proxyPermissionsProject.setPasswordGroup(id: string, groupName: string, data: ApiProxyPermissionsProjectSetPasswordGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectSetPasswordGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectSetPasswordGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectSetPasswordGroupResponse`

**CLI:** `hoody projects proxy groups password set`

---

### `setTokenGroup`

**PUT** `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token`

Set token authentication group (project)

```typescript
client.api.proxyPermissionsProject.setTokenGroup(id: string, groupName: string, data: ApiProxyPermissionsProjectSetTokenGroupRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectSetTokenGroupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `groupName` | `string` | Yes | path |  |
| `data` | `ApiProxyPermissionsProjectSetTokenGroupRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectSetTokenGroupResponse`

**CLI:** `hoody projects proxy groups token set`

---

### `updateDefault`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/default`

Update project default proxy permission policy

```typescript
client.api.proxyPermissionsProject.updateDefault(id: string, data: ApiProxyPermissionsProjectUpdateDefaultRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectUpdateDefaultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProxyPermissionsProjectUpdateDefaultRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectUpdateDefaultResponse`

**CLI:** `hoody projects proxy default`

---

### `updateState`

**PATCH** `/api/v1/projects/{id}/proxy/permissions/state`

Update project proxy enable state

```typescript
client.api.proxyPermissionsProject.updateState(id: string, data: ApiProxyPermissionsProjectUpdateStateRequest, options?: { ifMatch?: string }): Promise<ApiProxyPermissionsProjectUpdateStateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Project ID |
| `data` | `ApiProxyPermissionsProjectUpdateStateRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | file:v&lt;N&gt; ETag precondition — read current file_version from GET first |

**Returns:** `ApiProxyPermissionsProjectUpdateStateResponse`

**CLI:** `hoody projects proxy state`

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
| `include_usage` | `boolean` | No | query | Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data. |

**Returns:** `ApiRealmsListResponse`

**CLI:** `hoody realms list`

---

## `client.api.rentals` (5 methods)

### `extend`

**POST** `/api/v1/rentals/{id}/extend`

Extend rental

```typescript
client.api.rentals.extend(id: string, data: ApiRentalsExtendRequest): Promise<ApiRentalsExtendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiRentalsExtendRequest` | Yes | body |  |

**Returns:** `ApiRentalsExtendResponse`

**CLI:** `hoody servers extend`

---

### `get`

**GET** `/api/v1/rentals/{id}`

Get rental details

```typescript
client.api.rentals.get(id: string): Promise<ApiRentalsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiRentalsGetResponse`

**CLI:** `hoody servers get-rental`

---

### `list`

**GET** `/api/v1/rentals`

List user rentals

```typescript
client.api.rentals.list(): Promise<ApiRentalsListResponse>
```

**Returns:** `ApiRentalsListResponse`

**CLI:** `hoody servers list-rentals`

---

### `listAll`

**GET** `/api/v1/rentals`

List user rentals (collect all pages)

```typescript
client.api.rentals.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody servers list-rentals`

---

### `listIterator`

**GET** `/api/v1/rentals`

List user rentals (async iterator)

```typescript
client.api.rentals.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody servers list-rentals`

---

## `client.api.serverCommands` (4 methods)

### `execute`

**POST** `/api/v1/servers/{serverId}/execute-command`

Execute server command

```typescript
client.api.serverCommands.execute(serverId: string, data: ApiServerCommandsExecuteRequest): Promise<ApiServerCommandsExecuteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to execute command on |
| `data` | `ApiServerCommandsExecuteRequest` | Yes | body |  |

**Returns:** `ApiServerCommandsExecuteResponse`

**CLI:** `hoody servers exec`

---

### `list`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands

```typescript
client.api.serverCommands.list(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): Promise<ApiServerCommandsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `ApiServerCommandsListResponse`

**CLI:** `hoody servers commands`

---

### `listAll`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (collect all pages)

```typescript
client.api.serverCommands.listAll(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `unknown[]`

**CLI:** `hoody servers commands`

---

### `listIterator`

**GET** `/api/v1/servers/{serverId}/available-commands`

Get available commands (async iterator)

```typescript
client.api.serverCommands.listIterator(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serverId` | `string` | Yes | path | Server ID to get available commands for |
| `category` | `string` | No | query | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | No | query | Filter by maximum risk level |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody servers commands`

---

## `client.api.serverRental` (10 methods)

### `browse`

**GET** `/api/v1/servers/available`

Browse rental marketplace

```typescript
client.api.serverRental.browse(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean }): Promise<ApiServerRentalBrowseResponse>
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

**Returns:** `ApiServerRentalBrowseResponse`

**CLI:** `hoody servers marketplace`

---

### `browseAll`

**GET** `/api/v1/servers/available`

Browse rental marketplace (collect all pages)

```typescript
client.api.serverRental.browseAll(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean }): Promise<unknown[]>
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

**Returns:** `unknown[]`

**CLI:** `hoody servers marketplace`

---

### `browseIterator`

**GET** `/api/v1/servers/available`

Browse rental marketplace (async iterator)

```typescript
client.api.serverRental.browseIterator(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean }): AsyncIterableIterator<unknown>
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

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody servers marketplace`

---

### `get`

**GET** `/api/v1/servers/{id}`

Get server details (alias for /rentals/:id)

```typescript
client.api.serverRental.get(id: string): Promise<ApiServerRentalGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiServerRentalGetResponse`

**CLI:** `hoody servers get`

---

### `getRentalRuntime`

**GET** `/api/v1/rentals/{id}/runtime`

Get live runtime info for a rented server or subserver

```typescript
client.api.serverRental.getRentalRuntime(id: string): Promise<GetRentalRuntimeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `GetRentalRuntimeResponse`

---

### `getServerRuntime`

**GET** `/api/v1/servers/{id}/runtime`

Get live runtime info (alias for /rentals/:id/runtime)

```typescript
client.api.serverRental.getServerRuntime(id: string): Promise<GetServerRuntimeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `GetServerRuntimeResponse`

---

### `list`

**GET** `/api/v1/servers`

List user servers (alias for /rentals)

```typescript
client.api.serverRental.list(): Promise<ApiServerRentalListResponse>
```

**Returns:** `ApiServerRentalListResponse`

**CLI:** `hoody servers list`

---

### `listAll`

**GET** `/api/v1/servers`

List user servers (alias for /rentals) (collect all pages)

```typescript
client.api.serverRental.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody servers list`

---

### `listIterator`

**GET** `/api/v1/servers`

List user servers (alias for /rentals) (async iterator)

```typescript
client.api.serverRental.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody servers list`

---

### `rent`

**POST** `/api/v1/servers/{id}/rent`

Rent server

```typescript
client.api.serverRental.rent(id: string, data: ApiServerRentalRentRequest): Promise<ApiServerRentalRentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiServerRentalRentRequest` | Yes | body |  |

**Returns:** `ApiServerRentalRentResponse`

**CLI:** `hoody servers rent`

---

## `client.api.storageShares` (15 methods)

### `create`

**POST** `/api/v1/containers/{id}/storage/shares`

Create storage share

```typescript
client.api.storageShares.create(id: string, data: ApiStorageSharesCreateRequest): Promise<ApiStorageSharesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `data` | `ApiStorageSharesCreateRequest` | Yes | body |  |

**Returns:** `ApiStorageSharesCreateResponse`

**CLI:** `hoody storage create`

---

### `delete`

**DELETE** `/api/v1/storage/shares/{shareId}`

Delete storage share

```typescript
client.api.storageShares.delete(shareId: string): Promise<ApiStorageSharesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `shareId` | `string` | Yes | path | Share ID (globally unique, no container ID needed) |

**Returns:** `ApiStorageSharesDeleteResponse`

**CLI:** `hoody storage delete`

---

### `get`

**GET** `/api/v1/containers/{id}/storage/shares/{shareId}`

Get storage share

```typescript
client.api.storageShares.get(id: string, shareId: string): Promise<ApiStorageSharesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `shareId` | `string` | Yes | path | Share ID |

**Returns:** `ApiStorageSharesGetResponse`

**CLI:** `hoody storage get`

---

### `list`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares

```typescript
client.api.storageShares.list(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: "true" | "false"; include_expired?: "true" | "false"; realm_id?: string }): Promise<ApiStorageSharesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `include_expired` | `"true" \| "false"` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageSharesListResponse`

**CLI:** `hoody storage list`

---

### `listAll`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares (collect all pages)

```typescript
client.api.storageShares.listAll(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: "true" | "false"; include_expired?: "true" | "false"; realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `include_expired` | `"true" \| "false"` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

**CLI:** `hoody storage list`

---

### `listGlobal`

**GET** `/api/v1/storage/shares`

List all your storage shares

```typescript
client.api.storageShares.listGlobal(options?: { realm_id?: string }): Promise<ApiStorageSharesListGlobalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageSharesListGlobalResponse`

**CLI:** `hoody storage list-all`

---

### `listGlobalAll`

**GET** `/api/v1/storage/shares`

List all your storage shares (collect all pages)

```typescript
client.api.storageShares.listGlobalAll(options?: { realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

**CLI:** `hoody storage list-all`

---

### `listGlobalIterator`

**GET** `/api/v1/storage/shares`

List all your storage shares (async iterator)

```typescript
client.api.storageShares.listGlobalIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody storage list-all`

---

### `listIncoming`

**GET** `/api/v1/containers/{id}/storage/incoming`

Get incoming shares

```typescript
client.api.storageShares.listIncoming(id: string): Promise<ApiStorageSharesListIncomingResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Container ID |

**Returns:** `ApiStorageSharesListIncomingResponse`

**CLI:** `hoody storage incoming list`

---

### `listIncomingGlobal`

**GET** `/api/v1/storage/incoming`

Get all incoming shares

```typescript
client.api.storageShares.listIncomingGlobal(options?: { realm_id?: string }): Promise<ApiStorageSharesListIncomingGlobalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `ApiStorageSharesListIncomingGlobalResponse`

**CLI:** `hoody storage incoming list-all`

---

### `listIncomingGlobalAll`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (collect all pages)

```typescript
client.api.storageShares.listIncomingGlobalAll(options?: { realm_id?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `unknown[]`

**CLI:** `hoody storage incoming list-all`

---

### `listIncomingGlobalIterator`

**GET** `/api/v1/storage/incoming`

Get all incoming shares (async iterator)

```typescript
client.api.storageShares.listIncomingGlobalIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody storage incoming list-all`

---

### `listIterator`

**GET** `/api/v1/containers/{id}/storage/shares`

List storage shares (async iterator)

```typescript
client.api.storageShares.listIterator(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: "true" | "false"; include_expired?: "true" | "false"; realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `target_type` | `"container" \| "project"` | No | query | Filter by target type |
| `label` | `string` | No | query | Filter by label |
| `status` | `"active" \| "failed"` | No | query | Filter by status |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status |
| `include_expired` | `"true" \| "false"` | No | query | Include expired shares (default: false) |
| `realm_id` | `string` | No | query | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody storage list`

---

### `toggleIncomingMount`

**PATCH** `/api/v1/containers/{id}/storage/incoming/{shareId}/mount`

Toggle incoming share mount

```typescript
client.api.storageShares.toggleIncomingMount(id: string, shareId: string, data: ApiStorageSharesToggleIncomingMountRequest): Promise<ApiStorageSharesToggleIncomingMountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Target container ID (receiver container) |
| `shareId` | `string` | Yes | path | Share ID to toggle |
| `data` | `ApiStorageSharesToggleIncomingMountRequest` | Yes | body |  |

**Returns:** `ApiStorageSharesToggleIncomingMountResponse`

**CLI:** `hoody storage incoming toggle-mount`

---

### `update`

**PATCH** `/api/v1/containers/{id}/storage/shares/{shareId}`

Update storage share

```typescript
client.api.storageShares.update(id: string, shareId: string, data: ApiStorageSharesUpdateRequest): Promise<ApiStorageSharesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Source container ID |
| `shareId` | `string` | Yes | path | Share ID |
| `data` | `ApiStorageSharesUpdateRequest` | Yes | body |  |

**Returns:** `ApiStorageSharesUpdateResponse`

**CLI:** `hoody storage update`

---

## `client.api.tfa` (7 methods)

### `disable`

**DELETE** `/api/v1/users/auth/2fa`

Disable 2FA

```typescript
client.api.tfa.disable(data: ApiTfaDisableRequest): Promise<ApiTfaDisableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaDisableRequest` | Yes | body |  |

**Returns:** `ApiTfaDisableResponse`

**CLI:** `hoody auth 2fa disable`

---

### `getStatus`

**GET** `/api/v1/users/auth/2fa/status`

Get 2FA Status

```typescript
client.api.tfa.getStatus(): Promise<ApiTfaGetStatusResponse>
```

**Returns:** `ApiTfaGetStatusResponse`

**CLI:** `hoody auth 2fa status`

---

### `regenerateBackupCodes`

**POST** `/api/v1/users/auth/2fa/backup-codes/regenerate`

Regenerate Backup Codes

```typescript
client.api.tfa.regenerateBackupCodes(data: ApiTfaRegenerateBackupCodesRequest): Promise<ApiTfaRegenerateBackupCodesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaRegenerateBackupCodesRequest` | Yes | body |  |

**Returns:** `ApiTfaRegenerateBackupCodesResponse`

**CLI:** `hoody auth 2fa regenerate`

---

### `setTokenGate`

**PUT** `/api/v1/users/auth/2fa/token-gate`

Set 2FA token gate preference

```typescript
client.api.tfa.setTokenGate(data: ApiTfaSetTokenGateRequest): Promise<ApiTfaSetTokenGateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaSetTokenGateRequest` | Yes | body |  |

**Returns:** `ApiTfaSetTokenGateResponse`

**CLI:** `hoody auth 2fa gate`

---

### `setup`

**POST** `/api/v1/users/auth/2fa/setup`

Initialize 2FA Setup

```typescript
client.api.tfa.setup(data: ApiTfaSetupRequest): Promise<ApiTfaSetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaSetupRequest` | Yes | body |  |

**Returns:** `ApiTfaSetupResponse`

**CLI:** `hoody auth 2fa setup`

---

### `verify`

**POST** `/api/v1/users/auth/2fa/verify`

Verify 2FA Code During Login

```typescript
client.api.tfa.verify(data: ApiTfaVerifyRequest): Promise<ApiTfaVerifyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaVerifyRequest` | Yes | body |  |

**Returns:** `ApiTfaVerifyResponse`

**CLI:** `hoody auth 2fa verify`

---

### `verifySetup`

**POST** `/api/v1/users/auth/2fa/verify-setup`

Complete 2FA Setup

```typescript
client.api.tfa.verifySetup(data: ApiTfaVerifySetupRequest): Promise<ApiTfaVerifySetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiTfaVerifySetupRequest` | Yes | body |  |

**Returns:** `ApiTfaVerifySetupResponse`

**CLI:** `hoody auth 2fa verify-setup`

---

## `client.api.users` (6 methods)

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
client.api.users.getFreeTierStatus(): Promise<GetFreeTierStatusResponse>
```

**Returns:** `GetFreeTierStatusResponse`

---

### `markOnboardingMilestone`

**POST** `/api/v1/users/me/onboarding`

Mark an onboarding milestone as completed

```typescript
client.api.users.markOnboardingMilestone(data: MarkOnboardingMilestoneRequest): Promise<MarkOnboardingMilestoneResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `MarkOnboardingMilestoneRequest` | Yes | body |  |

**Returns:** `MarkOnboardingMilestoneResponse`

---

### `redeemInviteCode`

**POST** `/api/v1/users/me/redeem-invite`

Redeem a beta invite code

```typescript
client.api.users.redeemInviteCode(data: RedeemInviteCodeRequest): Promise<RedeemInviteCodeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RedeemInviteCodeRequest` | Yes | body |  |

**Returns:** `RedeemInviteCodeResponse`

**CLI:** `hoody users redeem-invite`

---

### `retrySetup`

**POST** `/api/v1/users/me/retry-setup`

Retry free-tier account setup

```typescript
client.api.users.retrySetup(data: RetrySetupRequest): Promise<RetrySetupResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RetrySetupRequest` | Yes | body |  |

**Returns:** `RetrySetupResponse`

**CLI:** `hoody users retry-setup`

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

## `client.api.utilities` (1 method)

### `getIpInfo`

**GET** `/api/v1/ip`

Get IP Information

```typescript
client.api.utilities.getIpInfo(): Promise<ApiUtilitiesGetIpInfoResponse>
```

**Returns:** `ApiUtilitiesGetIpInfoResponse`

**CLI:** `hoody ip get`

---

## `client.api.vault` (8 methods)

### `clear`

**DELETE** `/api/v1/vault`

Clear entire vault

```typescript
client.api.vault.clear(options?: { realm_id?: string }): Promise<ApiVaultClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

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
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

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
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

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
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

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
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

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
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `unknown[]`

**CLI:** `hoody vault list`

---

### `listIterator`

**GET** `/api/v1/vault/keys`

List vault keys (async iterator)

```typescript
client.api.vault.listIterator(options?: { realm_id?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody vault list`

---

### `set`

**PUT** `/api/v1/vault/keys/{key}`

Set vault key

```typescript
client.api.vault.set(key: string, data: ApiVaultSetRequest, options?: { realm_id?: string }): Promise<ApiVaultSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `data` | `ApiVaultSetRequest` | Yes | body |  |
| `realm_id` | `string` | No | query | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `ApiVaultSetResponse`

**CLI:** `hoody vault set`

---

## `client.api.waitlist` (2 methods)

### `waitlistEnrich`

**PATCH** `/api/v1/waitlist`

Enrich an existing waitlist signup

```typescript
client.api.waitlist.waitlistEnrich(data: WaitlistEnrichRequest): Promise<WaitlistEnrichResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `WaitlistEnrichRequest` | Yes | body |  |

**Returns:** `WaitlistEnrichResponse`

---

### `waitlistJoin`

**POST** `/api/v1/waitlist`

Join the Hoody waitlist

```typescript
client.api.waitlist.waitlistJoin(data: WaitlistJoinRequest): Promise<WaitlistJoinResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `WaitlistJoinRequest` | Yes | body |  |

**Returns:** `WaitlistJoinResponse`

---

## `client.api.wallet` (34 methods)

### `addPaymentMethod`

**POST** `/api/v1/wallet/payment-methods/`

Add a new payment method

```typescript
client.api.wallet.addPaymentMethod(data: ApiWalletAddPaymentMethodRequest): Promise<ApiWalletAddPaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletAddPaymentMethodRequest` | Yes | body |  |

**Returns:** `ApiWalletAddPaymentMethodResponse`

**CLI:** `hoody wallet payment-methods create`

---

### `claimGithubBonus`

**POST** `/api/v1/wallet/github-bonus/claim`

Claim the GitHub connection bonus

```typescript
client.api.wallet.claimGithubBonus(): Promise<ClaimGithubBonusResponse>
```

**Returns:** `ClaimGithubBonusResponse`

---

### `createCryptoInvoice`

**POST** `/api/v1/wallet/payments/crypto/invoice`

Start a crypto payment (hosted invoice)

```typescript
client.api.wallet.createCryptoInvoice(data: CreateCryptoInvoiceRequest): Promise<CreateCryptoInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CreateCryptoInvoiceRequest` | Yes | body |  |

**Returns:** `CreateCryptoInvoiceResponse`

---

### `createStripeCheckout`

**POST** `/api/v1/wallet/payments/stripe/checkout`

Start a card payment (Stripe Checkout)

```typescript
client.api.wallet.createStripeCheckout(data: CreateStripeCheckoutRequest): Promise<CreateStripeCheckoutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CreateStripeCheckoutRequest` | Yes | body |  |

**Returns:** `CreateStripeCheckoutResponse`

---

### `deletePaymentMethod`

**DELETE** `/api/v1/wallet/payment-methods/{id}`

Delete a payment method

```typescript
client.api.wallet.deletePaymentMethod(id: string): Promise<ApiWalletDeletePaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletDeletePaymentMethodResponse`

**CLI:** `hoody wallet payment-methods delete`

---

### `downloadInvoicePdf`

**GET** `/api/v1/wallet/invoices/{id}/pdf`

Download invoice PDF

```typescript
client.api.wallet.downloadInvoicePdf(id: string): Promise<ApiWalletDownloadInvoicePdfResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletDownloadInvoicePdfResponse`

**CLI:** `hoody wallet invoices download`

---

### `generateInvoice`

**POST** `/api/v1/wallet/invoices/generate/{id}`

Generate invoice for transaction

```typescript
client.api.wallet.generateInvoice(id: string): Promise<ApiWalletGenerateInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletGenerateInvoiceResponse`

**CLI:** `hoody wallet invoices generate`

---

### `getAggregateBalances`

**GET** `/api/v1/wallet/balances`

Get aggregate balances (general + AI)

```typescript
client.api.wallet.getAggregateBalances(): Promise<ApiWalletGetAggregateBalancesResponse>
```

**Returns:** `ApiWalletGetAggregateBalancesResponse`

**CLI:** `hoody wallet balance get`

---

### `getAiBalance`

**GET** `/api/v1/wallet/balances/ai`

Get AI balance (limit, usage, remaining)

```typescript
client.api.wallet.getAiBalance(): Promise<ApiWalletGetAiBalanceResponse>
```

**Returns:** `ApiWalletGetAiBalanceResponse`

**CLI:** `hoody wallet balance ai`

---

### `getCryptoPaymentIntent`

**GET** `/api/v1/wallet/payments/crypto/intents/{id}`

Get a crypto payment intent

```typescript
client.api.wallet.getCryptoPaymentIntent(id: string): Promise<GetCryptoPaymentIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `GetCryptoPaymentIntentResponse`

---

### `getGeneralBalance`

**GET** `/api/v1/wallet/balances/general`

Get general balance only

```typescript
client.api.wallet.getGeneralBalance(): Promise<ApiWalletGetGeneralBalanceResponse>
```

**Returns:** `ApiWalletGetGeneralBalanceResponse`

**CLI:** `hoody wallet balance general`

---

### `getGithubBonus`

**GET** `/api/v1/wallet/github-bonus`

Get GitHub connection bonus status

```typescript
client.api.wallet.getGithubBonus(): Promise<GetGithubBonusResponse>
```

**Returns:** `GetGithubBonusResponse`

---

### `getInvoice`

**GET** `/api/v1/wallet/invoices/{id}`

Get invoice by ID

```typescript
client.api.wallet.getInvoice(id: string): Promise<ApiWalletGetInvoiceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletGetInvoiceResponse`

**CLI:** `hoody wallet invoices get`

---

### `getPaymentAvailability`

**GET** `/api/v1/wallet/payment-availability`

Get top-up payment availability (providers, bounds, AI transfer fee)

```typescript
client.api.wallet.getPaymentAvailability(): Promise<GetPaymentAvailabilityResponse>
```

**Returns:** `GetPaymentAvailabilityResponse`

---

### `getPaymentMethod`

**GET** `/api/v1/wallet/payment-methods/{id}`

Get payment method by ID

```typescript
client.api.wallet.getPaymentMethod(id: string): Promise<ApiWalletGetPaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletGetPaymentMethodResponse`

**CLI:** `hoody wallet payment-methods get`

---

### `getStripePaymentIntent`

**GET** `/api/v1/wallet/payments/stripe/intents/{id}`

Get a card payment intent

```typescript
client.api.wallet.getStripePaymentIntent(id: string): Promise<GetStripePaymentIntentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `GetStripePaymentIntentResponse`

---

### `getTransaction`

**GET** `/api/v1/wallet/transactions/{id}`

Get transaction by ID

```typescript
client.api.wallet.getTransaction(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody wallet transactions get`

---

### `listAiFeeHistory`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history

```typescript
client.api.wallet.listAiFeeHistory(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): Promise<ApiWalletListAiFeeHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiWalletListAiFeeHistoryResponse`

**CLI:** `hoody wallet transactions fees`

---

### `listAiFeeHistoryAll`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (collect all pages)

```typescript
client.api.wallet.listAiFeeHistoryAll(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody wallet transactions fees`

---

### `listAiFeeHistoryIterator`

**GET** `/api/v1/wallet/ai-fee-history`

Get AI credit fee history (async iterator)

```typescript
client.api.wallet.listAiFeeHistoryIterator(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query |  |
| `limit` | `number` | No | query |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody wallet transactions fees`

---

### `listCryptoPaymentIntents`

**GET** `/api/v1/wallet/payments/crypto/intents`

List crypto payment intents

```typescript
client.api.wallet.listCryptoPaymentIntents(options?: { limit?: number; offset?: number }): Promise<ListCryptoPaymentIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `ListCryptoPaymentIntentsResponse`

---

### `listInvoices`

**GET** `/api/v1/wallet/invoices/`

Get all invoices

```typescript
client.api.wallet.listInvoices(options?: { limit?: number; sort_by?: string; sort_order?: "asc" | "desc" }): Promise<ApiWalletListInvoicesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `string` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiWalletListInvoicesResponse`

**CLI:** `hoody wallet invoices list`

---

### `listInvoicesAll`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (collect all pages)

```typescript
client.api.wallet.listInvoicesAll(options?: { limit?: number; sort_by?: string; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `string` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody wallet invoices list`

---

### `listInvoicesIterator`

**GET** `/api/v1/wallet/invoices/`

Get all invoices (async iterator)

```typescript
client.api.wallet.listInvoicesIterator(options?: { limit?: number; sort_by?: string; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `string` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody wallet invoices list`

---

### `listPaymentMethods`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods

```typescript
client.api.wallet.listPaymentMethods(): Promise<ApiWalletListPaymentMethodsResponse>
```

**Returns:** `ApiWalletListPaymentMethodsResponse`

**CLI:** `hoody wallet payment-methods list`

---

### `listPaymentMethodsAll`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (collect all pages)

```typescript
client.api.wallet.listPaymentMethodsAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody wallet payment-methods list`

---

### `listPaymentMethodsIterator`

**GET** `/api/v1/wallet/payment-methods/`

Get all payment methods (async iterator)

```typescript
client.api.wallet.listPaymentMethodsIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody wallet payment-methods list`

---

### `listStripePaymentIntents`

**GET** `/api/v1/wallet/payments/stripe/intents`

List card payment intents

```typescript
client.api.wallet.listStripePaymentIntents(options?: { limit?: number; offset?: number }): Promise<ListStripePaymentIntentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `ListStripePaymentIntentsResponse`

---

### `listTransactions`

**GET** `/api/v1/wallet/transactions`

List transactions

```typescript
client.api.wallet.listTransactions(options?: { limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody wallet transactions list`

---

### `listTransactionsAll`

**GET** `/api/v1/wallet/transactions`

List transactions (collect all pages)

```typescript
client.api.wallet.listTransactionsAll(options?: { limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody wallet transactions list`

---

### `listTransactionsIterator`

**GET** `/api/v1/wallet/transactions`

List transactions (async iterator)

```typescript
client.api.wallet.listTransactionsIterator(options?: { limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | No | query |  |
| `sort_order` | `"asc" \| "desc"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody wallet transactions list`

---

### `setDefaultPaymentMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}/default`

Set a payment method as default

```typescript
client.api.wallet.setDefaultPaymentMethod(id: string): Promise<ApiWalletSetDefaultPaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiWalletSetDefaultPaymentMethodResponse`

**CLI:** `hoody wallet payment-methods set-default`

---

### `transferToAi`

**POST** `/api/v1/wallet/transfers`

Transfer from general balance to AI credits

```typescript
client.api.wallet.transferToAi(data: ApiWalletTransferToAiRequest): Promise<ApiWalletTransferToAiResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ApiWalletTransferToAiRequest` | Yes | body |  |

**Returns:** `ApiWalletTransferToAiResponse`

**CLI:** `hoody wallet transfer`

---

### `updatePaymentMethod`

**PUT** `/api/v1/wallet/payment-methods/{id}`

Update a payment method

```typescript
client.api.wallet.updatePaymentMethod(id: string, data: ApiWalletUpdatePaymentMethodRequest): Promise<ApiWalletUpdatePaymentMethodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `data` | `ApiWalletUpdatePaymentMethodRequest` | Yes | body |  |

**Returns:** `ApiWalletUpdatePaymentMethodResponse`

**CLI:** `hoody wallet payment-methods update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
