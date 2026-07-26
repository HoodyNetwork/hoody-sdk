/**
 * TypeScript Type Definitions
 * Generated from OpenAPI specification
 * 
 * This file contains all request and response type definitions.
 * These types provide compile-time type safety for API calls.
 */

export interface ApiResponse<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
}

// Primitive type aliases for clarity
export type Integer = number;
export type Float = number;
export type Double = number;
export type Long = number;

export interface ApiAuthTokensListResponse {
  statusCode: 200;
  message: string;
  data: ({ id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string })[];
  truncated?: boolean;
}

export interface ApiAuthTokensCreateRequest {
  /**
   * User-friendly alias for the token. If not provided, a random animal name will be generated (e.g., "clever-dolphin").
   * @minLength 1
   * @maxLength 254
   * @pattern ^[a-zA-Z0-9 _-]*$
   */
  alias?: string;
  /** Optional ED25519 public key used for client identity derivation */
  public_key?: string | null;
  /** Public JSON profile storage attached to the token public_key (max 64KB) */
  public_storage?: Record<string, unknown> | null;
  /** IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided. */
  ip_whitelist?: string[] | string;
  /** Optional permission template to apply. If provided, it takes precedence over `permissions`. Templates: full_access, external_customer, dev_team, finance_team, read_only. */
  permission_template?: string;
  /** Fine-grained permissions for this token. Any missing permission path defaults to false (deny). */
  permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } };
  /** List of realm IDs this token is restricted to. If provided, the token can ONLY be used on these specific realm subdomains. */
  realm_ids?: string[];
  /** Whether this token can be used without a realm scope (e.g. on base domain). Defaults to true (server-side). Set to false to create a strict sub-account token that ONLY works on specific realms. */
  allow_no_realm?: boolean;
  /** Whether this token can access user vault endpoints. Defaults to false (server-side) for security. */
  vault_access?: boolean;
  /** Whether this token can access real-time event streams and event history endpoints. Defaults to true (server-side). */
  event_access?: boolean;
  /** Opt-in least-privilege belt for scoped/script tokens. When true, the server strips the `resources.create_tokens` and `resources.vault` permission leaves from the resolved token, forces `vault_access` to false, and forces a bounded (non-permanent) expiry — producing a locked-down leaf that can never re-delegate or reach the vault. Rejected (400) if combined with an explicit `create_tokens`/`resources.vault`/`vault_access` grant. Defaults to false; omitted callers are unaffected. */
  deny_reauthorization?: boolean;
  /** Token expiration. Can be an ISO string, Unix timestamp, "today", or "tomorrow". If not provided, the token never expires. */
  expires_at?: string | "today" | "tomorrow" | number /* min: 0 */;
  /**
   * TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiAuthTokensCreateResponse {
  statusCode: 201;
  message: string;
  data: { token: string; id: string; alias: string; prefix: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled: boolean; vault_access: boolean; event_access: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at: string; updated_at: string };
}

export interface ApiAuthTokensCopyRequest {
  /**
   * Optional alias for the copied token. If omitted, a deterministic alias like "<source> copy" is generated.
   * @minLength 1
   * @maxLength 254
   * @pattern ^[a-zA-Z0-9 _-]*$
   */
  alias?: string;
  /** Optional expiration override for the copied token. If omitted, source expiration is copied when still in the future. */
  expires_at?: string | "today" | "tomorrow" | number /* min: 0 */ | null;
  /**
   * TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiAuthTokensCopyResponse {
  statusCode: 201;
  message: string;
  data: { token: string; id: string; alias: string; prefix: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled: boolean; vault_access: boolean; event_access: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at: string; updated_at: string };
}

export interface ApiAuthTokensGetCurrentResponse {
  statusCode: 200;
  message: string;
  data: { token: { id: string; alias: string; prefix: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled: boolean; vault_access: boolean; event_access: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at: string; updated_at: string }; restrictions: { has_realm_restrictions: boolean; requires_realm_scope: boolean; allowed_realm_ids: string[]; allow_no_realm: boolean; active_realm_id: null | string } };
}

export interface ApiAuthTokensUpdatePublicProfileRequest {
  /** Optional ED25519 public key used for client identity derivation */
  public_key?: string | null;
  /** Public JSON profile storage attached to the token public_key (max 64KB) */
  public_storage?: Record<string, unknown> | null;
}

export interface ApiAuthTokensUpdatePublicProfileResponse {
  statusCode: 200;
  message: string;
  data: { id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiAuthTokensGetPublicProfileResponse {
  statusCode: 200;
  message: string;
  data: { public_key: string; public_storage: Record<string, unknown> | null };
}

export interface ApiAuthTokensGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiAuthTokensUpdateRequest {
  /**
   * User-friendly alias for the token
   * @minLength 1
   * @maxLength 254
   * @pattern ^[a-zA-Z0-9 _-]*$
   */
  alias?: string;
  /** Optional ED25519 public key used for client identity derivation */
  public_key?: string | null;
  /** Public JSON profile storage attached to the token public_key (max 64KB) */
  public_storage?: Record<string, unknown> | null;
  /** IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided. */
  ip_whitelist?: string[] | string;
  /** Fine-grained permissions for this token. Any missing permission path defaults to false (deny). */
  permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } };
  /** List of realm IDs this token is restricted to */
  realm_ids?: string[];
  /** Whether this token can be used without a realm scope */
  allow_no_realm?: boolean;
  /** Whether this token can access user vault endpoints */
  vault_access?: boolean;
  /** Whether this token can access real-time event streams and event history endpoints */
  event_access?: boolean;
  /** Token expiration. Can be an ISO string, Unix timestamp, "today", "tomorrow", or null. */
  expires_at?: string | "today" | "tomorrow" | number /* min: 0 */ | null;
  /** Enable or disable the token */
  is_enabled?: boolean;
  /**
   * TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiAuthTokensUpdateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiAuthTokensDeleteResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiAuthTokensAddRealmRequest {
  /**
   * Realm ID to add to the token
   * @pattern ^[0-9a-f]{24}$
   */
  realm_id: string;
  /**
   * TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiAuthTokensAddRealmResponse {
  statusCode: 200;
  message: string;
  data: { id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiAuthTokensRemoveRealmRequest {
  /**
   * Realm ID to remove from the token
   * @pattern ^[0-9a-f]{24}$
   */
  realm_id: string;
  /**
   * TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiAuthTokensRemoveRealmResponse {
  statusCode: 200;
  message: string;
  data: { id: string; alias?: string; prefix?: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist?: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions?: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled?: boolean; vault_access?: boolean; event_access?: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiVaultGetStatsResponse {
  statusCode: 200;
  message: string;
  data: { total_keys: number; total_size_bytes: number; total_size_mb: number; limit_mb: number; used_percentage: number; remaining_mb: number };
}

export interface ApiVaultListResponse {
  statusCode: 200;
  message: string;
  data: ({ key: string; realm_id: string; metadata?: Record<string, unknown> | null; size_bytes: number; created_at: string; updated_at: string })[];
}

export interface ApiVaultGetResponse {
  statusCode: 200;
  message: string;
  data: { key: string; realm_id: string; value: string; metadata?: Record<string, unknown> | null; size_bytes: number; created_at: string; updated_at: string };
}

export interface ApiVaultSetRequest {
  /** Value to store. Can be any UTF-8 string: JSON, encrypted data, plain text, etc. The API does NOT validate or verify the content - encryption is highly recommended for sensitive data such as secrets, passwords, or API keys. */
  value: string;
  /** Optional JSON metadata (max 256KB). Useful for file uploads to store content-type, filename, upload date, etc. Must be valid JSON or null. This counts toward your total vault storage limit. */
  metadata?: Record<string, unknown> | null;
}

export interface ApiVaultSetResponse {
  statusCode: 200;
  message: string;
  data: { key: string; realm_id: string; value: string; metadata?: Record<string, unknown> | null; size_bytes: number; created_at: string; updated_at: string };
}

export interface ApiVaultDeleteResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiVaultClearResponse {
  statusCode: 200;
  message: string;
  data: { deleted_count: number };
}

export interface ApiAuthenticationLoginRequest {
  /**
   * Username (alphanumeric characters, underscores, and hyphens)
   * @minLength 3
   * @maxLength 50
   * @pattern ^[a-zA-Z0-9_-]+$
   */
  username?: string;
  /**
   * Email address (alternative to username)
   * @maxLength 255
   */
  email?: string;
  /**
   * Account password. Must be at least 8 characters with uppercase, lowercase, and number.
   * @minLength 8
   * @maxLength 128
   */
  password: string;
  /** Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange (hosted auth UI only; server forces intent mode for requests from the hosted UI origin with code_challenge). */
  response_mode?: "intent" | "tokens";
  /** PKCE code_challenge (base64url SHA-256 of the code_verifier). Required when response_mode=intent. */
  code_challenge?: string;
}

export interface ApiAuthenticationLoginResponse {
  statusCode: 200;
  message: string;
  data: ({ requires_2fa?: boolean; temp_token?: string; method?: "totp"; token?: string; refreshToken?: string; expires_at?: string; expires_in?: number; refresh_expires_at?: string; refresh_expires_in?: number; auth_intent_token?: string; identity_claim?: { kid?: string; payload_b64?: string; signature_hex?: string }; client_ip?: string; recent_login_ips?: { ip?: string; timestamp?: string }[]; auth_token_count?: number; user?: { id: string; username?: string; email?: string; alias?: string; public_key?: string; metadata?: Record<string, unknown>; is_admin?: boolean; is_banned?: boolean; email_verified?: boolean; avatar_url?: string | null; signup_method?: string | null; free_tier_unlocked?: boolean; free_tier_unlocked_at?: string | null; free_tier_unlock_source?: string | null; onboarding?: Record<string, unknown>; created_at?: string; updated_at?: string }; server?: { id: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; is_ready?: boolean } | null; project?: { id: string; alias?: string } | null; container?: { id: string; name?: string } | null } & { token: string; refreshToken: string }) | { temp_token: string; token?: never; refreshToken?: never };
}

export interface ApiAuthenticationRefreshTokenRequest {
  /**
   * Valid refresh token from previous login/refresh
   * @minLength 1
   */
  refreshToken: string;
}

export interface ApiAuthenticationRefreshTokenResponse {
  statusCode: 200;
  message: string;
  data: { token?: string; refreshToken?: string; expires_at?: string; expires_in?: number; refresh_expires_at?: string; refresh_expires_in?: number };
}

export interface ApiTfaVerifyRequest {
  /** Temporary token from login response (valid for 5 minutes). Alternatively pass it as Authorization: Bearer header. */
  temp_token?: string;
  /** 6-digit OTP code from authenticator app OR 10-character backup code */
  code: string;
  /** Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange. */
  response_mode?: "intent" | "tokens";
}

export interface ApiTfaVerifyResponse {
  statusCode: 200;
  message: string;
  data: { status?: "approved"; token?: string; refreshToken?: string; auth_intent_token?: string; identity_claim?: { kid?: string; payload_b64?: string; signature_hex?: string }; user?: Record<string, unknown>; server?: { id: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; is_ready?: boolean } | null; project?: { id: string; alias?: string } | null; container?: { id: string; name?: string; status?: string | null } | null };
}

export interface ApiTfaSetupRequest {
  /**
   * Current account password for verification
   * @minLength 8
   * @maxLength 128
   */
  password: string;
}

export interface ApiTfaSetupResponse {
  statusCode: 200;
  message: string;
  data: { qr_code: string; manual_entry_key: string; backup_codes: string[] };
}

export interface ApiTfaVerifySetupRequest {
  /**
   * 6-digit code from authenticator app
   * @pattern ^\d{6}$
   */
  code: string;
}

export interface ApiTfaVerifySetupResponse {
  statusCode: 200;
  message: string;
  data: { enabled: boolean; enabled_at: string; token?: string; refreshToken?: string; sessions_revoked?: boolean };
}

export interface ApiTfaGetStatusResponse {
  statusCode: 200;
  message: string;
  data: { enabled: boolean; verified: boolean; enabled_at?: string; backup_codes_remaining: number; require_for_tokens: boolean };
}

export interface ApiTfaDisableRequest {
  /**
   * Current account password
   * @minLength 8
   * @maxLength 128
   */
  password: string;
  /** 6-digit OTP code from authenticator app OR backup code */
  code: string;
}

export interface ApiTfaDisableResponse {
  statusCode: 200;
  message: string;
  data: { token?: string; refreshToken?: string; sessions_revoked?: boolean };
}

export interface ApiTfaRegenerateBackupCodesRequest {
  /**
   * Current account password
   * @minLength 8
   * @maxLength 128
   */
  password: string;
  /**
   * 6-digit OTP code from authenticator app
   * @pattern ^\d{6}$
   */
  code: string;
}

export interface ApiTfaRegenerateBackupCodesResponse {
  statusCode: 200;
  message: string;
  data: { backup_codes: string[] };
}

export interface ApiTfaSetTokenGateRequest {
  /** true = require OTP for token mutations (default), false = skip OTP gate */
  enabled: boolean;
  /** Required when setting enabled=false (security downgrade requires primary-factor reauth) */
  password?: string;
  /**
   * TOTP code or backup code. Required when setting enabled=false.
   * @maxLength 12
   */
  otp_code?: string;
}

export interface ApiTfaSetTokenGateResponse {
  statusCode: 200;
  message: string;
  data: { require_for_tokens?: boolean };
}

export interface ApiAuthenticationGetCurrentUserResponse {
  statusCode: 200;
  message: string;
  data: { id: string; username?: string; email?: string; alias?: string; public_key?: string; metadata?: Record<string, unknown>; is_admin?: boolean; is_banned?: boolean; email_verified?: boolean; avatar_url?: string | null; signup_method?: string | null; free_tier_unlocked?: boolean; free_tier_unlocked_at?: string | null; free_tier_unlock_source?: string | null; onboarding?: Record<string, unknown>; created_at?: string; updated_at?: string; auth_token?: { token: { id: string; alias: string; prefix: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled: boolean; vault_access: boolean; event_access: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at: string; updated_at: string }; restrictions: { has_realm_restrictions: boolean; requires_realm_scope: boolean; allowed_realm_ids: string[]; allow_no_realm: boolean; active_realm_id: null | string } }; pending_pool_invitations?: number };
}

export interface GetCurrentUserAliasResponse {
  statusCode: 200;
  message: string;
  data: { id: string; username?: string; email?: string; alias?: string; public_key?: string; metadata?: Record<string, unknown>; is_admin?: boolean; is_banned?: boolean; email_verified?: boolean; avatar_url?: string | null; signup_method?: string | null; free_tier_unlocked?: boolean; free_tier_unlocked_at?: string | null; free_tier_unlock_source?: string | null; onboarding?: Record<string, unknown>; created_at?: string; updated_at?: string; auth_token?: { token: { id: string; alias: string; prefix: string; public_key?: string | null; public_storage?: Record<string, unknown> | null; ip_whitelist: string[]; realm_ids?: string[]; allow_no_realm?: boolean; permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } }; expires_at?: null | string; is_enabled: boolean; vault_access: boolean; event_access: boolean; created_by_token_id?: null | string; delegation_depth?: number; last_used_at?: null | string; last_used_ip?: null | string; created_at: string; updated_at: string }; restrictions: { has_realm_restrictions: boolean; requires_realm_scope: boolean; allowed_realm_ids: string[]; allow_no_realm: boolean; active_realm_id: null | string } }; pending_pool_invitations?: number };
}

export interface ApiAuthenticationLogoutResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiUsersGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; username?: string; email?: string; alias?: string; public_key?: string; metadata?: Record<string, unknown>; is_admin?: boolean; is_banned?: boolean; email_verified?: boolean; avatar_url?: string | null; signup_method?: string | null; free_tier_unlocked?: boolean; free_tier_unlocked_at?: string | null; free_tier_unlock_source?: string | null; onboarding?: Record<string, unknown>; created_at?: string; updated_at?: string };
}

export interface ApiUsersUpdateRequest {
  /**
   * New display name/alias
   * @minLength 1
   * @maxLength 100
   */
  alias?: string;
  /**
   * ED25519 public key (exactly 64 hexadecimal characters). Used for cryptographic identity and verification.
   * @pattern ^[0-9a-fA-F]{64}$
   */
  public_key?: string;
  /** Custom metadata object for storing additional user information. Can include nested objects. */
  metadata?: Record<string, unknown>;
  /**
   * New password. Must be at least 12 characters, 3 of 4 character classes. Requires current_password for verification.
   * @minLength 12
   * @maxLength 128
   */
  password?: string;
  /**
   * Current password (REQUIRED when setting new password for verification)
   * @minLength 8
   * @maxLength 128
   */
  current_password?: string;
  /** Admin status (read-only) */
  is_admin?: boolean;
  /** Ban status. Banned users cannot access the API. */
  is_banned?: boolean;
}

export interface ApiUsersUpdateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; username?: string; email?: string; alias?: string; public_key?: string; metadata?: Record<string, unknown>; is_admin?: boolean; is_banned?: boolean; email_verified?: boolean; avatar_url?: string | null; signup_method?: string | null; free_tier_unlocked?: boolean; free_tier_unlocked_at?: string | null; free_tier_unlock_source?: string | null; onboarding?: Record<string, unknown>; created_at?: string; updated_at?: string };
}

export interface ApiIssueIdentityClaimRequest {
  /**
   * Consumer identifier this claim is bound to (e.g. your app hostname). Verifiers reject the claim unless they expect exactly this audience. Printable ASCII, no whitespace or double quotes.
   * @minLength 1
   * @maxLength 256
   * @pattern ^[\x21\x23-\x7e]{1,256}$
   */
  audience: string;
  /**
   * Requested claim lifetime in seconds. Clamped to [60, min(server ceiling, remaining JWT lifetime)]. Default: server-configured (1h).
   * @minimum 60
   * @maximum 86400
   */
  expires_in?: number /* min: 60, max: 86400 */;
}

export interface ApiIssueIdentityClaimResponse {
  statusCode: 200;
  message: string;
  data: { identity_claim?: { kid?: string; payload_b64?: string; signature_hex?: string }; expires_in?: number; expires_at?: string; audience?: string };
}

export interface MarkOnboardingMilestoneRequest {
  /**
   * Milestone key, e.g. "hub_tour_v1".
   * @pattern ^(hub_tour_v[0-9]{1,3}|dashboard_[a-z0-9_]{1,30}|onboarding_[a-z0-9_]{1,30})$
   */
  milestone: string;
}

export interface MarkOnboardingMilestoneResponse {
  statusCode: 200;
  message: string;
  data: { onboarding?: Record<string, unknown> };
}

export interface RetrySetupRequest {
  /**
   * Optional preferred region override
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  region?: string;
}

export interface RetrySetupResponse {
  statusCode: 200;
  data: { server?: Record<string, unknown> | null; project?: Record<string, unknown> | null; container?: Record<string, unknown> | null; blocked_reason?: null | "admin_recovery_required" };
  message: string;
}

export interface RedeemInviteCodeRequest {
  /**
   * The invite code (case/format-insensitive).
   * @minLength 1
   * @maxLength 64
   */
  code: string;
}

export interface RedeemInviteCodeResponse {
  statusCode: 200;
  message: string;
  data: { unlocked?: boolean; required?: boolean; claim_blocked_reason?: "none" | "pool_empty"; server?: Record<string, unknown> | null; project?: Record<string, unknown> | null; container?: Record<string, unknown> | null };
}

export interface GetFreeTierStatusResponse {
  statusCode: 200;
  message: string;
  data: { gate_enabled?: boolean; unlocked?: boolean; has_free_server?: boolean; can_claim?: boolean; claim_blocked_reason?: "none" | "invite_required" | "pool_empty" | "already_claimed"; signup_code_failed?: boolean };
}

export interface ApiProjectsListResponse {
  statusCode: 200;
  message: string;
  data: { projects?: ({ id: string; user_id: string; alias: string; color: string; created_at: string; updated_at: string; max_containers?: null | number; is_default?: boolean; realm_ids?: string[] })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiProjectsCreateRequest {
  /**
   * Human-readable project name. Must be unique across your projects (e.g., "Production", "Development", "Client-ABC").
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * HEX color code for visual organization in dashboards. Accepts 3-digit (#RGB) or 6-digit (#RRGGBB). The # prefix is auto-added if missing, and the value is auto-normalized to uppercase. If not provided, a random color is generated.
   * @pattern ^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$
   */
  color?: string;
  /** Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation. */
  max_containers?: number | null;
  /** Realm IDs to assign this project to. If you are creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids. */
  realm_ids?: string[];
}

export interface ApiProjectsCreateResponse {
  statusCode: 201;
  message: string;
  data: { id: string; user_id: string; alias: string; color: string; created_at: string; updated_at: string; max_containers?: null | number; is_default?: boolean; realm_ids?: string[] };
}

export interface ApiProjectsGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; user_id: string; alias: string; color: string; created_at: string; updated_at: string; max_containers?: null | number; is_default?: boolean; realm_ids?: string[]; permissions?: ({ id: string; project_id: string; user_id: string; permission_level: "read" | "edit" | "delete"; created_at: string; updated_at: string; user?: { id: string; username?: string; alias?: string } })[] };
}

export interface ApiProjectsUpdateRequest {
  /**
   * New project name. Must be unique across your projects.
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * New HEX color code. Auto-normalized to uppercase with # prefix.
   * @pattern ^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$
   */
  color?: string;
  /** Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation. */
  max_containers?: number | null;
  /** Update realm membership for this project. If updating from a realm subdomain, the subdomain realm is automatically preserved and merged. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership. */
  realm_ids?: string[];
}

export interface ApiProjectsUpdateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; user_id: string; alias: string; color: string; created_at: string; updated_at: string; max_containers?: null | number; is_default?: boolean; realm_ids?: string[] };
}

export interface ApiProjectsDeleteResponse {
  statusCode: 200;
  message: string;
  data: { deleted: { containers: number; permissions: number; aliases: number }; deleted_items?: { containers?: { id: string; name: string }[] } };
}

export interface ApiProjectsListPermissionsResponse {
  statusCode: 200;
  message: string;
  data: { permissions?: ({ id: string; project_id: string; user_id: string; permission_level: "read" | "edit" | "delete"; created_at: string; updated_at: string; user?: { id: string; username?: string; alias?: string } })[]; pagination?: { total: number; page: number; limit: number; totalPages: number } };
}

export interface ApiProjectsAddPermissionRequest {
  /**
   * User ID to grant access to
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /** Access level: "read", "edit", or "delete" */
  permission_level: "read" | "edit" | "delete";
}

export interface ApiProjectsAddPermissionResponse {
  statusCode: 201;
  message: string;
  data: { id: string; project_id: string; user_id: string; permission_level: "read" | "edit" | "delete"; created_at: string; updated_at: string; user?: { id: string; username?: string; alias?: string } };
}

export interface ApiProjectsUpdatePermissionRequest {
  /** New permission level */
  permission_level: "read" | "edit" | "delete";
}

export interface ApiProjectsUpdatePermissionResponse {
  statusCode: 200;
  message: string;
  data: { id: string; project_id: string; user_id: string; permission_level: "read" | "edit" | "delete"; created_at: string; updated_at: string; user?: { id: string; username?: string; alias?: string } };
}

export interface ApiProjectsRemovePermissionResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiContainersListByProjectResponse {
  statusCode: number;
  message: string;
  data: { containers?: ({ id: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; ssh_hostname?: null | string; name?: string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; prespawn?: boolean; is_default?: boolean; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; created_at?: string; updated_at?: string; realm_ids?: string[]; snapshot_count?: number; last_used_snapshot?: null | string; runtime_info?: { displays?: ({ display?: number; pid?: number; session_name?: string; user?: string; project_id?: string; container_id?: string; start_time?: string; connected_clients?: number; last_activity_timestamp?: string; latency?: null | Record<string, unknown> | number; windows?: { id: number; title?: string; pid?: number; size?: { width?: number; height?: number }; position?: { x?: number; y?: number }; state?: string[]; focused?: boolean; fullscreen?: boolean; "class-instance"?: string[]; role?: string; group_leader_xid?: string; command?: string }[]; screenshots?: Record<string, unknown>[] })[]; services?: ({ name?: string; status?: string; pid?: number; unit?: string; load?: string; active?: string; sub?: string; description?: string; since?: string; memory?: null | string; cpu_usage?: null | string; tasks?: null | number; restart_count?: null | number; last_restart?: null | string; enabled?: null | boolean; vendor_preset?: null | string; main_pid?: null | number; control_group?: null | string; drop_in?: null | string; loaded?: null | string; docs?: null | string; fragment_path?: null | string })[]; network_services?: { protocol?: string; port?: number; ip?: string; pid?: number; user?: string; program?: string; path?: string; args?: string }[]; terminals?: { id: string; display?: number; username?: string; created_at?: number; created_at_formatted?: string; last_activity?: number; last_activity_formatted?: string; command_history?: string[] }[] } | null; pool_id?: null | string; proxy_domains?: ({ id: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string })[]; has_proxy_permissions?: boolean; proxy_permissions_scope?: "none" | "container" | "project" | "both"; has_proxy_domains?: boolean; proxy_domains_count?: number /* min: 0 */; proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string }; project_proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string } })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
  example?: unknown;
}

export interface ApiContainersCreateRequest {
  server_id: string;
  /**
   * Name for the container. Must be 3-100 characters, alphanumeric with hyphens and underscores. Omit or use "rand" to generate a random name.
   * @minLength 3
   * @maxLength 100
   * @pattern ^[a-zA-Z0-9-_]+$
   */
  name?: string;
  /**
   * HEX color for the container (e.g., #FF0000 or FF0000). If not provided, a random color will be generated. The # prefix will be added automatically if missing, and the color will be converted to uppercase.
   * @pattern ^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$
   */
  color?: string;
  /** Container image to use. If null or not provided, will use the default configured image. */
  container_image?: string | null;
  /** Whether AI features are enabled (default: true) */
  ai?: boolean;
  environment_vars?: Record<string, unknown>;
  /** SSH public key for container access. SSH public keys must be unique per container (one container per key). If not provided, will inherit from project defaults. */
  ssh_public_key?: string | null;
  /**
   * Optional comment for the container (max 16000 characters)
   * @maxLength 16000
   */
  comment?: string | null;
  /** Enable all Hoody Kit features (extra-apt-sources, basic-packages, hoody-daemon, sudo-env, remove-snapd, webview, user, hoody-ai, ttyd) */
  hoody_kit?: boolean;
  /** Enable dev_kit development tools in the container. Defaults to true when hoody_kit is true, false when hoody_kit is false (unless explicitly set). Cannot be updated after creation. */
  dev_kit?: boolean;
  /** Whether the container should start automatically on host boot (default: true) */
  autostart?: boolean;
  /** Whether to mount a ramdisk at /ramdisk in the container (default: true). The ramdisk KEEPS data when you stop/start/reboot the container, but LOSES data if the physical host server reboots. Can store up to 50% of total host memory. Ideal for security (data automatically wiped on server seizure), temporary files, or extremely fast I/O at no cost. */
  ramdisk?: boolean;
  /** Enable use of cached images during container creation (--use-cache-image). When false, no cache options are added. */
  cache?: boolean;
  /** Force the creation of a new cached image from the container image. This option is only available to admins or the owner of the image. */
  cache_image?: boolean;
  /** INTERNAL — not user-settable. Prespawn cache containers are provisioned only by the system pool producer. Passing `true` is rejected (403); an explicit `false` is accepted. */
  prespawn?: boolean;
  /** Bypass prespawn container claiming and create a fresh container directly. By default (false), the system will attempt to claim a matching prespawn container if available. */
  bypass_prespawn?: boolean;
  /** Realm IDs to assign this container to. If creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids. Note: Containers can have different realm membership than their parent project. */
  realm_ids?: string[];
}

export interface ApiContainersCreateResponse {
  statusCode: number;
  message: string;
  data: { id: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; ssh_hostname?: null | string; name?: string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; prespawn?: boolean; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; created_at?: string; updated_at?: string; realm_ids?: string[] };
  example?: unknown;
}

export interface ApiContainersListResponse {
  statusCode: number;
  message: string;
  data: { containers?: ({ id: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; server?: null | { name?: string; country?: string; country_name?: string; city?: string; region?: string; datacenter?: string; is_free?: boolean; specs?: null | { cpu_cores?: null | number; ram_gb?: null | number; disk_gb?: null | number; shared_compute?: boolean }; expires_at?: null | string }; ssh_hostname?: null | string; name?: string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; ramdisk?: boolean; prespawn?: boolean; is_default?: boolean; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; source_container_id?: null | string; server_expired?: boolean; server_expired_at?: null | string; server_expired_reason?: null | string; created_at?: string; updated_at?: string; realm_ids?: string[]; snapshot_count?: number; last_used_snapshot?: null | string; runtime_info?: { displays?: ({ display?: number; pid?: number; session_name?: string; user?: string; project_id?: string; container_id?: string; start_time?: string; connected_clients?: number; last_activity_timestamp?: string; latency?: null | Record<string, unknown> | number; windows?: { id: number; title?: string; pid?: number; size?: { width?: number; height?: number }; position?: { x?: number; y?: number }; state?: string[]; focused?: boolean; fullscreen?: boolean; "class-instance"?: string[]; role?: string; group_leader_xid?: string; command?: string }[]; screenshots?: Record<string, unknown>[] })[]; services?: ({ name?: string; status?: string; pid?: number; unit?: string; load?: string; active?: string; sub?: string; description?: string; since?: string; memory?: null | string; cpu_usage?: null | string; tasks?: null | number; restart_count?: null | number; last_restart?: null | string; enabled?: null | boolean; vendor_preset?: null | string; main_pid?: null | number; control_group?: null | string; drop_in?: null | string; loaded?: null | string; docs?: null | string; fragment_path?: null | string })[]; network_services?: { protocol?: string; port?: number; ip?: string; pid?: number; user?: string; program?: string; path?: string; args?: string }[]; terminals?: { id: string; display?: number; username?: string; created_at?: number; created_at_formatted?: string; last_activity?: number; last_activity_formatted?: string; command_history?: string[] }[] } | null; pool_id?: null | string; proxy_domains?: ({ id: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string })[]; has_proxy_permissions?: boolean; proxy_permissions_scope?: "none" | "container" | "project" | "both"; has_proxy_domains?: boolean; proxy_domains_count?: number /* min: 0 */; proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string }; project_proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string } })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiContainersGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; server?: null | { name?: string; country?: string; country_name?: string; city?: string; region?: string; datacenter?: string; is_free?: boolean; specs?: null | { cpu_cores?: null | number; ram_gb?: null | number; disk_gb?: null | number; shared_compute?: boolean }; expires_at?: null | string }; ssh_hostname?: null | string; name?: string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; ramdisk?: boolean; prespawn?: boolean; is_default?: boolean; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; source_container_id?: null | string; server_expired?: boolean; server_expired_at?: null | string; server_expired_reason?: null | string; created_at?: string; updated_at?: string; realm_ids?: string[]; snapshot_count?: number; last_used_snapshot?: null | string; warnings?: ({ type?: string; message?: string; expired_at?: null | string })[]; runtime_info?: { displays?: ({ display?: number; pid?: number; session_name?: string; user?: string; project_id?: string; container_id?: string; start_time?: string; connected_clients?: number; last_activity_timestamp?: string; latency?: null | Record<string, unknown> | number; windows?: { id: number; title?: string; pid?: number; size?: { width?: number; height?: number }; position?: { x?: number; y?: number }; state?: string[]; focused?: boolean; fullscreen?: boolean; "class-instance"?: string[]; role?: string; group_leader_xid?: string; command?: string }[]; screenshots?: Record<string, unknown>[] })[]; services?: ({ name?: string; status?: string; pid?: number; unit?: string; load?: string; active?: string; sub?: string; description?: string; since?: string; memory?: null | string; cpu_usage?: null | string; tasks?: null | number; restart_count?: null | number; last_restart?: null | string; enabled?: null | boolean; vendor_preset?: null | string; main_pid?: null | number; control_group?: null | string; drop_in?: null | string; loaded?: null | string; docs?: null | string; fragment_path?: null | string })[]; network_services?: { protocol?: string; port?: number; ip?: string; pid?: number; user?: string; program?: string; path?: string; args?: string }[]; terminals?: { id: string; display?: number; username?: string; created_at?: number; created_at_formatted?: string; last_activity?: number; last_activity_formatted?: string; command_history?: string[] }[] } | null; pool_id?: null | string; proxy_domains?: ({ id: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string })[]; has_proxy_permissions?: boolean; proxy_permissions_scope?: "none" | "container" | "project" | "both"; has_proxy_domains?: boolean; proxy_domains_count?: number /* min: 0 */; proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string }; project_proxy_permissions?: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string } };
}

export interface ApiContainersUpdateRequest {
  /**
   * Human-readable name for the container - must be unique within the project
   * @minLength 1
   * @maxLength 100
   */
  name?: string;
  /**
   * HEX color for the container (e.g., #FF0000 or FF0000). If not provided, a random color will be generated. The # prefix will be added automatically if missing, and the color will be converted to uppercase.
   * @pattern ^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$
   */
  color?: string;
  /** Whether AI features are enabled. If omitted, the current value is preserved. */
  ai?: boolean;
  /** Whether the container starts automatically on host boot. If omitted, the current value is preserved. */
  autostart?: boolean;
  /** Whether to mount a ramdisk at /ramdisk in the container. If omitted, the current value is preserved. Persistent across container reboots, not host reboots. Can store up to 50% of total host memory. Ideal for security or safeguarding against server seizure, and provides extremely fast read performance at no cost. */
  ramdisk?: boolean;
  /** Environment variables to set in the container as key-value pairs */
  environment_vars?: Record<string, unknown>;
  /** SSH public key for container access. SSH public keys must be unique per container (one container per key). Re-sending the same key for the same container is treated as a no-op. Set to null to clear or inherit from project defaults. */
  ssh_public_key?: string | null;
  /** Optional comment for the container (max 16000 characters). Set to null to clear existing comment. */
  comment?: string | null;
  /** Update realm membership for this container. Containers can have different realm membership than their parent project. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership for security. */
  realm_ids?: string[];
}

export interface ApiContainersUpdateResponse {
  statusCode: number;
  message: string;
  data: { id: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; server?: null | { name?: string; country?: string; country_name?: string; city?: string; region?: string; datacenter?: string; is_free?: boolean; specs?: null | { cpu_cores?: null | number; ram_gb?: null | number; disk_gb?: null | number; shared_compute?: boolean }; expires_at?: null | string }; ssh_hostname?: null | string; name?: string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; ramdisk?: boolean; prespawn?: boolean; is_default?: boolean; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; source_container_id?: null | string; created_at?: string; updated_at?: string; realm_ids?: string[]; pool_id?: null | string };
}

export interface ApiContainersDeleteResponse {
  statusCode: number;
  message: string;
  data: null;
}

/**
 * Successful response
 */
export interface ApiContainersGetStatusLogsResponse {
  statusCode: number;
  message: string;
  data: { logs?: ({ id: string; container_id?: string; from_status?: null | string; to_status?: string; transition_time?: string; duration_ms?: null | number; triggered_by?: string; metadata?: null | Record<string, unknown> })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiContainersCopyRequest {
  /**
   * ID of the project where the copy will be created
   * @pattern ^[0-9a-f]{24}$
   */
  target_project_id: string;
  /**
   * ID of the server where the copy will be created (defaults to source server)
   * @pattern ^[0-9a-f]{24}$
   */
  target_server_id?: string;
  /**
   * Name for the copied container (auto-generated if not provided)
   * @minLength 3
   * @maxLength 100
   * @pattern ^[a-zA-Z0-9-_]+$
   */
  name?: string;
  /** SSH public key for the copied container (must be unique, not inherited from source) */
  ssh_public_key?: string | null;
  /**
   * Specific snapshot to copy from (copies latest state if not provided)
   * @pattern ^[a-zA-Z0-9-_]+$
   */
  source_snapshot?: string;
  /** Whether to copy firewall rules (ACL) from source container to target container */
  copy_firewall_rules?: boolean;
  /** Whether to copy network rules/settings from source container to target container */
  copy_network_rules?: boolean;
}

/**
 * Container copy initiated successfully
 */
export interface ApiContainersCopyResponse {
  statusCode: number;
  message: string;
  data: { id: string; name?: string; status?: "creating" | "running" | "paused" | "stopped" | "failed" | "deleted" | "copying" | "deleting" | "claiming"; source_container_id?: string; project_id?: string; project_alias?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; server?: null | { name?: string; country?: string; country_name?: string; city?: string; region?: string; datacenter?: string; is_free?: boolean; specs?: null | { cpu_cores?: null | number; ram_gb?: null | number; disk_gb?: null | number; shared_compute?: boolean }; expires_at?: null | string }; ssh_hostname?: null | string; color?: string; container_image?: string; ai?: boolean; hoody_kit?: boolean; dev_kit?: boolean; autostart?: boolean; ramdisk?: boolean; prespawn?: boolean; is_default?: boolean; container_image_id?: null | string; environment_vars?: Record<string, unknown>; volumes?: Record<string, unknown>; ssh_public_key?: null | string; comment?: null | string; copy_firewall_rules?: boolean; copy_network_rules?: boolean; created_at?: string; updated_at?: string; realm_ids?: string[] };
}

/**
 * Container sync initiated successfully
 */
export interface ApiContainersSyncResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; source_container_id?: string; status?: string };
}

export interface ApiContainersAuthorizeResponse {
  statusCode: number;
  message: string;
  data: { container_claim: { kid: string; payload_b64: string; signature_hex: string }; expires_in: number; container_id: string; project_id: string };
}

export interface ApiContainersManageResponse {
  statusCode: number;
  message: string;
  data: { error?: boolean; operation?: string; container_id?: string; project_id?: string; message?: string; status?: string };
}

export interface ApiImagesListPublicResponse {
  statusCode: number;
  message: string;
  data: { images?: ({ id: string; alias?: string; description?: string; image_name?: string; architecture?: string; os?: string; release?: string; variant?: null | string; size?: number; price?: number; added_date?: string; average_rating?: number; rating_count?: number; icon_url?: null | string; prespawn?: boolean })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiImagesGetDetailsResponse {
  statusCode: number;
  message: string;
  data: { id: string; alias?: string; description?: string; image_name?: string; architecture?: string; os?: string; release?: string; serial?: string; variant?: null | string; size?: number; price?: number; added_date?: string; average_rating?: number; rating_count?: number; icon_url?: null | string; prespawn?: boolean };
}

/**
 * PNG image
 */
export interface ApiImagesGetIconResponse {
  statusCode: number;
  message: string;
  data: string;
}

export interface ApiImagesListResponse {
  statusCode: number;
  message: string;
  data: { images?: ({ id: string; alias?: string; description?: string; image_name?: string; architecture?: string; os?: string; release?: string; variant?: null | string; size?: number; price?: number; user_rating?: null | number; has_rated?: boolean; average_rating?: number; rating_count?: number; icon_url?: null | string; prespawn?: boolean })[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiImagesImportFreeResponse {
  statusCode: number;
  message: string;
  data: {  };
}

export interface ApiImagesPurchaseResponse {
  statusCode: number;
  message: string;
  data: { price_paid?: number; remaining_balance?: number };
}

export interface ApiImagesRateRequest {
  /**
   * Rating for the image from 0 to 5 stars
   * @minimum 0
   * @maximum 5
   */
  rating: number /* min: 0, max: 5 */;
}

export interface ApiImagesRateResponse {
  statusCode: number;
  message: string;
  data: { new_rating?: number; average_rating?: number; rating_count?: number };
}

export interface ApiContainersGetNetworkConfigResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; configured?: boolean; type?: "socks5" | "http" | "https" | "block"; proxy?: string; credentials_configured?: boolean; country?: string; city?: string; region?: string; comment?: string; dns_servers?: string[]; status?: "configured" | "running" | "stopped" | "error"; configured_at?: string; last_status_check?: string; remote_status?: { is_running?: boolean; last_check?: string } };
}

export interface ApiContainersUpdateNetworkConfigRequest {
  /** Network configuration type - proxy type or block for traffic blocking */
  type: "socks5" | "http" | "https" | "block";
  /** Proxy server URL (required for non-block types), e.g. "socks5://proxy.example.com:1080". Credentials may be embedded as userinfo ("socks5://host:port") to set/replace them; omitting userinfo on an UNCHANGED endpoint preserves the stored credentials (write-only secret). The response never echoes userinfo back — see `credentials_configured`. */
  proxy?: string;
  /** Optional country for geographical proxy selection */
  country?: string;
  /** Optional city for geographical proxy selection */
  city?: string;
  /** Optional region for geographical proxy selection */
  region?: string;
  /** Optional comment describing the network configuration */
  comment?: string;
  /**
   * Custom DNS servers (max 4, defaults to ["1.1.1.1", "8.8.8.8"])
   * @maxItems 4
   */
  dns_servers?: string[];
}

export interface ApiContainersUpdateNetworkConfigResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; type?: "socks5" | "http" | "https" | "block"; proxy?: string; credentials_configured?: boolean; country?: string; city?: string; region?: string; comment?: string; dns_servers?: string[]; status?: "configured" | "running" | "stopped" | "error"; configured_at?: string };
}

export interface ApiContainersRemoveNetworkConfigResponse {
  statusCode: number;
  message: string;
  data: null;
}

export interface ApiContainersStartNetworkResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; status?: "configured" | "running" | "stopped" | "error"; is_running?: boolean; last_check?: string };
}

export interface ApiContainersStopNetworkResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; status?: "configured" | "running" | "stopped" | "error"; is_running?: boolean; last_check?: string };
}

export interface ApiContainersListSnapshotsResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; project_id?: string; snapshots?: ({ name?: string; alias?: null | string; created_at?: string; last_used_at?: null | string; expires_at?: null | string; stateful?: boolean; size?: number })[] };
}

export interface ApiContainersCreateSnapshotRequest {
  /**
   * Optional user-friendly alias for the snapshot
   * @maxLength 100
   */
  alias?: string;
  /** Expiry in days */
  expiry?: number;
}

export interface ApiContainersCreateSnapshotResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; project_id?: string; snapshot?: { name?: string; alias?: null | string; created_at?: string; last_used_at?: null | string; expires_at?: null | string; stateful?: boolean; size?: number } };
}

export interface ApiContainersRestoreSnapshotResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; message?: string; snapshot?: null | { name?: string; alias?: null | string; created_at?: string; last_used_at?: null | string; expires_at?: null | string; stateful?: boolean; size?: number } };
}

export interface ApiContainersDeleteSnapshotResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; project_id?: string; snapshot_name?: string };
}

export interface ApiContainersUpdateSnapshotAliasRequest {
  /** New alias for the snapshot (set to null to remove alias) */
  alias: string | null;
}

export interface ApiContainersUpdateSnapshotAliasResponse {
  statusCode: number;
  message: string;
  data: { container_id?: string; project_id?: string; snapshot?: { name?: string; alias?: null | string; created_at?: string; last_used_at?: null | string; expires_at?: null | string; stateful?: boolean; size?: number } };
}

export interface ApiFirewallListResponse {
  statusCode: number;
  message: string;
  data: { ingress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string; direction?: "ingress" | "egress" })[]; egress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string; direction?: "ingress" | "egress" })[] };
}

export interface ApiFirewallResetResponse {
  statusCode: number;
  message: string;
  data: { rules?: { ingress?: Record<string, unknown>[]; egress?: Record<string, unknown>[] } };
}

export interface ApiFirewallAddIngressRuleRequest {
  /** Action to take: allow (permit), reject (deny with response), drop (deny silently) */
  action: "allow" | "reject" | "drop";
  /** Network protocol */
  protocol: "tcp" | "udp" | "icmp4";
  /** Human-readable rule description */
  description: string;
  /** Port number, range (80-90), or comma-separated list (80,443). Required for TCP/UDP. */
  destination_port?: string;
  /** Source IPv4 address or CIDR range. Use 0.0.0.0/0 for any source. */
  source?: string;
  /** Source port filter (rarely used) */
  source_port?: string;
  /** Rule state (defaults to enabled) */
  state?: "enabled" | "disabled";
  /** ICMP type number (e.g., 8 for echo request/ping) */
  icmp_type?: string;
  /** ICMP code number */
  icmp_code?: string;
}

export interface ApiFirewallAddIngressRuleResponse {
  statusCode: 200;
  message: string;
  data: { ingress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[]; egress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[] } | { action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string; duplicate?: boolean; duplicate_of?: { direction: "ingress" | "egress"; index: number } };
}

export interface ApiFirewallToggleIngressRuleRequest {
  /** New state for the rule */
  state: "enabled" | "disabled";
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Rule description */
  description?: string;
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
}

export interface ApiFirewallToggleIngressRuleResponse {
  statusCode: number;
  message: string;
  data: { direction?: string; new_state?: string; updated?: { action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string } };
}

export interface ApiFirewallRemoveIngressRuleRequest {
  /** Remove all matching rules (default: first match only). Set to true with no other filters to remove all ingress rules. */
  all?: boolean;
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule description */
  description?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
}

export interface ApiFirewallRemoveIngressRuleResponse {
  statusCode: number;
  message: string;
  data: { direction?: string; removed_count?: number; removed?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[] };
}

export interface ApiFirewallAddEgressRuleRequest {
  /** Action to take: allow (permit), reject (deny with response), drop (deny silently) */
  action: "allow" | "reject" | "drop";
  /** Network protocol */
  protocol: "tcp" | "udp" | "icmp4";
  /** Human-readable rule description */
  description: string;
  /** Port number, range (80-90), or comma-separated list (80,443). Required for TCP/UDP. */
  destination_port?: string;
  /** Destination IPv4 address or CIDR range. Use 0.0.0.0/0 for any destination. */
  destination?: string;
  /** Source port filter (rarely used) */
  source_port?: string;
  /** Rule state (defaults to enabled) */
  state?: "enabled" | "disabled";
  /** ICMP type number */
  icmp_type?: string;
  /** ICMP code number */
  icmp_code?: string;
}

export interface ApiFirewallAddEgressRuleResponse {
  statusCode: 200;
  message: string;
  data: { ingress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[]; egress?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[] } | { action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; source?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string; duplicate?: boolean; duplicate_of?: { direction: "ingress" | "egress"; index: number } };
}

export interface ApiFirewallToggleEgressRuleRequest {
  /** New state for the rule */
  state: "enabled" | "disabled";
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Rule description */
  description?: string;
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
}

export interface ApiFirewallToggleEgressRuleResponse {
  statusCode: number;
  message: string;
  data: { direction?: string; new_state?: string; updated?: { action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string } };
}

export interface ApiFirewallRemoveEgressRuleRequest {
  /** Remove all matching rules (default: first match only). Set to true with no other filters to remove all egress rules. */
  all?: boolean;
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule description */
  description?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
}

export interface ApiFirewallRemoveEgressRuleResponse {
  statusCode: number;
  message: string;
  data: { direction?: string; removed_count?: number; removed?: ({ action?: "allow" | "reject" | "drop"; protocol?: "tcp" | "udp" | "icmp4"; description?: string; destination_port?: string; destination?: string; source_port?: string; state?: "enabled" | "disabled"; icmp_type?: string; icmp_code?: string })[] };
}

export interface ApiEnvListResponse {
  statusCode: number;
  message: string;
  data: { environment_vars?: Record<string, unknown> };
}

export type ApiEnvBulkSetRequest = Record<string, unknown>;

export interface ApiEnvBulkSetResponse {
  statusCode: number;
  message: string;
  data: { environment_vars?: Record<string, unknown>; synced?: boolean };
}

export interface ApiEnvSetRequest {
  /**
   * Value for the environment variable
   * @maxLength 32768
   */
  value: string;
}

export interface ApiEnvSetResponse {
  statusCode: number;
  message: string;
  data: { environment_vars?: Record<string, unknown>; synced?: boolean };
}

export interface ApiEnvDeleteResponse {
  statusCode: number;
  message: string;
  data: { environment_vars?: Record<string, unknown>; synced?: boolean };
}

export interface ApiContainersGetStatsResponse {
  statusCode: number;
  message: string;
  data: { id: string; project_id: string; project_name?: null | string; server_name?: null | string; subserver_name?: string; status: string; status_code: number; processes: number; started_at: string; cpu?: null | { usage?: number; allocated_time?: number; usage_percent?: number }; memory?: null | { usage?: number; total?: number; usage_percent?: number; swap_usage?: number; swap_usage_peak?: number; usage_peak?: number }; disk: { root?: { total?: number; usage?: number } }; network: { interface?: string; addresses?: { address?: string; family?: string; netmask?: string; scope?: string }[]; counters?: { bytes_received?: number; bytes_sent?: number; packets_received?: number; packets_sent?: number; errors_received?: number; errors_sent?: number; packets_dropped_inbound?: number; packets_dropped_outbound?: number }; state?: string; type?: string }[]; processing_time: string };
}

export interface ApiProjectsGetStatsResponse {
  statusCode: number;
  message: string;
  data: { stats: ({ id: string; project_id?: string; project_name?: null | string; server_name?: null | string; subserver_name?: string; status?: string; status_code?: number; processes?: number; started_at?: string; cpu?: null | { usage?: number; allocated_time?: number; usage_percent?: number }; memory?: null | { usage?: number; total?: number; usage_percent?: number; swap_usage?: number; swap_usage_peak?: number; usage_peak?: number }; disk?: { root?: { total?: number; usage?: number } }; network?: { interface?: string; addresses?: { address?: string; family?: string; netmask?: string; scope?: string }[]; counters?: { bytes_received?: number; bytes_sent?: number; packets_received?: number; packets_sent?: number; errors_received?: number; errors_sent?: number; packets_dropped_inbound?: number; packets_dropped_outbound?: number }; state?: string; type?: string }[]; processing_time?: string })[]; summary: { project_id: string; project_name?: null | string; container_count: number; total_processing_time: string } };
}

export interface ApiNotificationsListPublicResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; title?: string; message?: string; type?: "MAINTENANCE" | "ANNOUNCEMENT" | "STATUS_UPDATE"; severity?: "INFO" | "WARNING" | "ERROR" | "SUCCESS"; is_public?: boolean; is_global?: boolean; target_user_ids?: string[] | null; expires_at?: string | null; created_at?: string; updated_at?: string })[];
}

export interface ApiNotificationsListResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; title?: string; message?: string; type?: "MAINTENANCE" | "ANNOUNCEMENT" | "STATUS_UPDATE"; severity?: "INFO" | "WARNING" | "ERROR" | "SUCCESS"; is_public?: boolean; is_global?: boolean; target_user_ids?: string[] | null; expires_at?: string | null; created_at?: string; updated_at?: string; is_read?: boolean; read_at?: string | null })[];
}

export interface ApiNotificationsMarkReadResponse {
  statusCode: number;
  message: string;
  data: { id: string; notification_id?: string; is_read?: boolean; read_at?: string | null };
}

export interface ApiNotificationsMarkAllReadResponse {
  statusCode: number;
  message: string;
  data: { count?: number };
}

export interface ApiProxyPermissionsProjectGetResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string };
}

export interface ApiProxyPermissionsProjectReplaceRequest {
  /**
   * Project ID (must match path:id)
   * @pattern ^[0-9a-f]{24}$
   */
  project: string;
  /** Authentication groups. Key is group name (^[A-Za-z0-9_-]{1,50}$), value is group config. */
  groups: Record<string, unknown>;
  /** Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists. */
  permissions: Record<string, unknown>;
  /** Default access policy when no rules match (defaults to "deny" if omitted) */
  default?: "allow" | "deny";
  /** Enable or disable the proxy. Defaults to true. */
  enable_proxy?: boolean;
}

export interface ApiProxyPermissionsProjectReplaceResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsProjectDeleteResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsProjectUpdateDefaultRequest {
  /** Default access policy for unmatched requests */
  default: "allow" | "deny";
}

export interface ApiProxyPermissionsProjectUpdateDefaultResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: string };
}

export interface ApiProxyPermissionsProjectUpdateStateRequest {
  /** Enable or disable the proxy entirely */
  enable_proxy: boolean;
}

export interface ApiProxyPermissionsProjectUpdateStateResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: string; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsProjectRemoveAuthGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectSetJwtGroupRequest {
  /**
   * JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
   * @minLength 1
   * @maxLength 8192
   */
  secret: string;
  /** JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys. */
  algorithm: "HS256" | "RS256" | "ES256";
  /**
   * Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
   * @minItems 1
   */
  sources: string[];
  /** Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean. */
  claims?: Record<string, unknown>;
}

export interface ApiProxyPermissionsProjectSetJwtGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectSetPasswordGroupRequest {
  /**
   * Username for authentication. Must match exactly what the client provides.
   * @minLength 1
   */
  username: string;
  /**
   * Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
   * @minLength 1
   */
  password: string;
  /** Hashing algorithm used for password verification. Currently only SHA256 is supported. */
  algorithm?: "sha256";
  /**
   * Salt used for password hashing. Should be unique per user/group for security.
   * @minLength 1
   */
  salt: string;
}

export interface ApiProxyPermissionsProjectSetPasswordGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectSetIpGroupRequest {
  /**
   * IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
   * @pattern ^(\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$
   */
  range: string;
}

export interface ApiProxyPermissionsProjectSetIpGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

/**
 * Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
 */
export type ApiProxyPermissionsProjectSetTokenGroupRequest = { header: string; value: string } | { cookie: string; value: string } | { param: string; value: string };

export interface ApiProxyPermissionsProjectSetTokenGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectSetGroupRequest {
  /**
   * Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
   * @minLength 1
   */
  program: string;
  /** Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boolean, port number(s), port range, or "*". */
  access: boolean | number | number[] | string | "*";
}

export interface ApiProxyPermissionsProjectSetGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectRemoveGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsProjectRemoveProgramResponse {
  statusCode: number;
  message: string;
  data: { project?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerGetResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean; hooks?: Record<string, unknown>; schema_version?: number; file_version?: number; etag?: string };
}

export interface ApiProxyPermissionsContainerReplaceRequest {
  /**
   * Project ID owning this container
   * @pattern ^[0-9a-f]{24}$
   */
  project: string;
  /**
   * Container ID (must match path:id)
   * @pattern ^[0-9a-f]{24}$
   */
  container: string;
  /** Authentication groups. Key is group name, value is group config. */
  groups: Record<string, unknown>;
  /** Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists. */
  permissions: Record<string, unknown>;
  /** Defaults to deny if omitted */
  default?: "allow" | "deny";
  /** Enable or disable the proxy. Defaults to true. */
  enable_proxy?: boolean;
  /** Per-service proxy hooks. Keys are service names; values are first-match-wins arrays of { match, script, timeout? } rules. Max 8 per service, 32 per file total. Reject-listed services: logs, proxy, workspaces, cdp. */
  hooks?: Record<string, unknown>;
}

export interface ApiProxyPermissionsContainerReplaceResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsContainerDeleteResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny"; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsContainerUpdateDefaultRequest {
  /** Default access policy for unmatched requests */
  default: "allow" | "deny";
}

export interface ApiProxyPermissionsContainerUpdateDefaultResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: string };
}

export interface ApiProxyPermissionsContainerUpdateStateRequest {
  /** Enable or disable the proxy entirely */
  enable_proxy: boolean;
}

export interface ApiProxyPermissionsContainerUpdateStateResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: string; enable_proxy?: boolean };
}

export interface ApiProxyPermissionsContainerRemoveAuthGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerSetJwtGroupRequest {
  /**
   * JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
   * @minLength 1
   * @maxLength 8192
   */
  secret: string;
  /** JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys. */
  algorithm: "HS256" | "RS256" | "ES256";
  /**
   * Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
   * @minItems 1
   */
  sources: string[];
  /** Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean. */
  claims?: Record<string, unknown>;
}

export interface ApiProxyPermissionsContainerSetJwtGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerSetPasswordGroupRequest {
  /**
   * Username for authentication. Must match exactly what the client provides.
   * @minLength 1
   */
  username: string;
  /**
   * Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
   * @minLength 1
   */
  password: string;
  /** Hashing algorithm used for password verification. Currently only SHA256 is supported. */
  algorithm?: "sha256";
  /**
   * Salt used for password hashing. Should be unique per user/group for security.
   * @minLength 1
   */
  salt: string;
}

export interface ApiProxyPermissionsContainerSetPasswordGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerSetIpGroupRequest {
  /**
   * IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
   * @pattern ^(\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$
   */
  range: string;
}

export interface ApiProxyPermissionsContainerSetIpGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

/**
 * Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
 */
export type ApiProxyPermissionsContainerSetTokenGroupRequest = { header: string; value: string } | { cookie: string; value: string } | { param: string; value: string };

export interface ApiProxyPermissionsContainerSetTokenGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerSetGroupRequest {
  /**
   * Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
   * @minLength 1
   */
  program: string;
  /** Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boolean, port number(s), port range, or "*". */
  access: boolean | number | number[] | string | "*";
}

export interface ApiProxyPermissionsContainerSetGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerRemoveGroupResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ApiProxyPermissionsContainerRemoveProgramResponse {
  statusCode: number;
  message: string;
  data: { project?: string; container?: string; groups?: Record<string, unknown>; permissions?: Record<string, unknown>; default?: "allow" | "deny" };
}

export interface ListContainerProxyHooksResponse {
  statusCode: number;
  message: string;
  data: { hooks?: Record<string, unknown>; file_version?: number; etag?: string };
}

export interface ListContainerProxyServiceHooksResponse {
  statusCode: number;
  message: string;
  data: { service?: string; hooks?: ({ id: string; position?: number /* min: 0 */; match?: { method?: string | string[]; path?: string; headers?: Record<string, unknown> }; script?: { subdomain?: string; execId?: string; path: string }; timeout?: number /* min: 1, max: 30000 */; applies_to?: { groups?: string[] } })[]; file_version?: number; etag?: string };
}

export interface AddContainerProxyHookRequest {
  match: { method?: string | string[]; path?: string; headers?: Record<string, unknown> };
  script: { subdomain?: string; execId?: string; path: string };
  /**
   * @minimum 1
   * @maximum 30000
   */
  timeout?: number /* min: 1, max: 30000 */;
  applies_to?: { groups?: string[] };
  /**
   * 0-indexed insertion position (POST only)
   * @minimum 0
   */
  position?: number /* min: 0 */;
}

export interface AddContainerProxyHookResponse {
  statusCode: number;
  message: string;
  data: { hook?: { id: string; position?: number /* min: 0 */; match?: { method?: string | string[]; path?: string; headers?: Record<string, unknown> }; script?: { subdomain?: string; execId?: string; path: string }; timeout?: number /* min: 1, max: 30000 */; applies_to?: { groups?: string[] } }; file_version?: number; etag?: string };
}

export interface ClearContainerProxyServiceHooksResponse {
  statusCode: number;
  message: string;
  data: { removed?: number; file_version?: number; etag?: string };
}

export interface GetContainerProxyHookResponse {
  statusCode: number;
  message: string;
  data: { hook?: { id: string; position?: number /* min: 0 */; match?: { method?: string | string[]; path?: string; headers?: Record<string, unknown> }; script?: { subdomain?: string; execId?: string; path: string }; timeout?: number /* min: 1, max: 30000 */; applies_to?: { groups?: string[] } }; file_version?: number; etag?: string };
}

export interface UpdateContainerProxyHookPatchRequest {
  match: { method?: string | string[]; path?: string; headers?: Record<string, unknown> };
  script: { subdomain?: string; execId?: string; path: string };
  /**
   * @minimum 1
   * @maximum 30000
   */
  timeout?: number /* min: 1, max: 30000 */;
  applies_to?: { groups?: string[] };
  /**
   * 0-indexed insertion position (POST only)
   * @minimum 0
   */
  position?: number /* min: 0 */;
}

export interface UpdateContainerProxyHookPatchResponse {
  statusCode: number;
  message: string;
  data: { hook?: { id: string; position?: number /* min: 0 */; match?: { method?: string | string[]; path?: string; headers?: Record<string, unknown> }; script?: { subdomain?: string; execId?: string; path: string }; timeout?: number /* min: 1, max: 30000 */; applies_to?: { groups?: string[] } }; file_version?: number; etag?: string };
}

export interface RemoveContainerProxyHookResponse {
  statusCode: number;
  message: string;
  data: { file_version?: number; etag?: string };
}

export interface MoveContainerProxyHookRequest {
  /** @minimum 0 */
  position: number /* min: 0 */;
}

export interface MoveContainerProxyHookResponse {
  statusCode: number;
  message: string;
  data: { hook?: { id: string; position?: number /* min: 0 */; match?: { method?: string | string[]; path?: string; headers?: Record<string, unknown> }; script?: { subdomain?: string; execId?: string; path: string }; timeout?: number /* min: 1, max: 30000 */; applies_to?: { groups?: string[] } }; file_version?: number; etag?: string };
}

export interface GetContainerProxySettingsResponse {
  statusCode: number;
  message: string;
  data: { enable_proxy?: boolean; default?: "allow" | "deny"; file_version?: number; etag?: string };
}

export interface UpdateContainerProxySettingsPatchRequest {
  enable_proxy?: boolean;
  default?: "allow" | "deny";
}

export interface UpdateContainerProxySettingsPatchResponse {
  statusCode: number;
  message: string;
  data: { enable_proxy?: boolean; default?: string; file_version?: number; etag?: string };
}

export interface ListContainerProxyGroupsResponse {
  statusCode: number;
  message: string;
  data: { groups?: { name?: string; auth_rule_count?: number }[]; file_version?: number; etag?: string };
}

export interface ListContainerProxyServicesResponse {
  statusCode: number;
  message: string;
  data: { services?: string[]; file_version?: number; etag?: string };
}

export interface GetContainerProxyServiceResponse {
  statusCode: number;
  message: string;
  data: { service?: string; is_reject_listed?: boolean; permissions_raw?: Record<string, unknown>; hooks?: Record<string, unknown>[]; effective_default?: "allow" | "deny"; file_version?: number; etag?: string };
}

export interface ApiProxyAliasesListResponse {
  statusCode: 200;
  message: string;
  data: { aliases?: ({ id: string; user_id?: string; project_id?: string; container_id?: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; server_id?: null | string; server_name?: null | string; subserver_name?: string; url?: null | string })[]; count?: number };
}

export interface ApiProxyAliasesCreateRequest {
  /**
   * Container ID that this alias points to. You must own this container.
   * @pattern ^[0-9a-f]{24}$
   */
  container_id: string;
  /** Custom alias name (a-z, 0-9, hyphens only, 3-61 chars, cannot start/end with hyphen) OR null/false for auto-generated 48-char hex. Must be unique across your account. */
  alias?: string | null | false;
  /** Which container service the alias targets — a built-in Hoody program ("terminal", "files", "code", "browser", "agent", "display", …) or a transport protocol ("http", "https", "ssh"). To point an alias at an HTTP server you run yourself inside the container (a process started via the daemon, a dev server, anything listening on a TCP port) use program "http" — or "https" for a TLS backend — and give the port via the "port" field (e.g. program "http" + port 3000 forwards to http://<container>:3000). The combined "http-3000" form and the legacy "index"-as-port form also work; when more than one is supplied the order of authority is port > the port embedded in "http-<port>" > index, so a leftover/default index can never override a real port. Must be a name or alias from container-programs.json. */
  program: string;
  /**
   * Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000 → http://<container>:3000). Preferred, unambiguous way to point an alias at a raw HTTP/HTTPS server; takes precedence over "index" and over any port embedded in the program string ("http-3000"). Ignored for built-in Hoody programs, which have fixed kit ports.
   * @minimum 1
   * @maximum 65535
   */
  port?: number /* min: 1, max: 65535 */;
  /**
   * Instance index, or (legacy) target port for the "http"/"https" protocol. Defaults to 1. For a built-in Hoody program it selects which running instance to route to (e.g. terminal 2). For "http"/"https" it is the port your server listens on inside the container — but prefer the dedicated "port" field; if "port" or a port embedded in the program ("http-3000") is also supplied, that wins over this index (so an accidental index of 1 will not route you to port 1).
   * @minimum 1
   */
  index?: number /* min: 1 */;
  /** Base path for routing. Requests to https://{alias}.../ will be forwarded to the container with this path prefix. Auto-prefixed with / if missing. */
  target_path?: string | null;
  /** Whether to allow paths beyond target_path. If false, only the exact target_path is accessible. */
  allow_path_override?: boolean;
  /** Optional ISO 8601 expiration date. Alias will be automatically disabled after this date. */
  expires_at?: string | null;
  /** Whether the alias is initially enabled (defaults to true) */
  enabled?: boolean;
}

export interface ApiProxyAliasesCreateResponse {
  statusCode: 201;
  message: string;
  data: { id: string; user_id?: string; project_id?: string; container_id?: string; alias?: string; program?: string; index?: number /* min: 1 */; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; server_id?: null | string; server_name?: null | string; subserver_name?: string; url?: null | string };
}

export interface ApiProxyAliasesGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; user_id?: string; project_id?: string; container_id?: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string; project?: { id: string; alias?: string }; container?: { id: string; name?: string } };
}

export interface ApiProxyAliasesUpdateRequest {
  /**
   * New alias name. Must be unique across your account.
   * @minLength 3
   * @maxLength 61
   * @pattern ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
   */
  alias?: string;
  /** Program or protocol the alias targets — a built-in Hoody program ("terminal", "files", "code", …) or a transport protocol ("http", "https", "ssh"). Use "http"/"https" with the "port" field to reach an HTTP server running on that port inside the container (e.g. program "http" + port 3000). The combined "http-3000" form and "index"-as-port also work; order of authority is port > embedded "http-<port>" > index. Must exist in container-programs.json. */
  program?: string;
  /**
   * Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000). Preferred over "index"; takes precedence over "index" and over any port embedded in the program string. Ignored for built-in Hoody programs.
   * @minimum 1
   * @maximum 65535
   */
  port?: number /* min: 1, max: 65535 */;
  /**
   * Instance index, or (legacy) target port when program is "http"/"https". Prefer the dedicated "port" field; if "port" or a port embedded in the program ("http-3000") is also supplied, that wins over this index.
   * @minimum 1
   */
  index?: number /* min: 1 */;
  /** Base path for routing. Set to null to remove path prefix. */
  target_path?: string | null;
  /** Whether to allow paths beyond target_path */
  allow_path_override?: boolean;
  /** Expiration date (ISO string, Unix timestamp seconds/ms, or null to remove expiration) */
  expires_at?: string | number /* min: 0 */ | null;
  /** Whether the alias is enabled */
  enabled?: boolean;
}

export interface ApiProxyAliasesUpdateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; user_id?: string; project_id?: string; container_id?: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string };
}

export interface ApiProxyAliasesDeleteResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiProxyAliasesSetStateRequest {
  /** Set to true to enable, false to disable */
  enabled: boolean;
}

export interface ApiProxyAliasesSetStateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; user_id?: string; project_id?: string; container_id?: string; alias?: string; program?: string; index?: number; target_path?: null | string; allow_path_override?: boolean; expires_at?: null | string; enabled?: boolean; created_at?: string; updated_at?: string; url?: null | string; server_id?: null | string; server_name?: null | string; subserver_name?: string };
}

export interface ApiStorageSharesListResponse {
  statusCode: 200;
  message: string;
  data: ({ id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string })[];
}

export interface ApiStorageSharesCreateRequest {
  /**
   * ARCHITECTURE: Source containers control WHAT to share (this path). Target mount paths are determined by the server, NOT by users. SECURITY-HARDENED: Character whitelist (a-z A-Z 0-9 / - _.), path normalization applied, blocks system paths (/proc/*, /sys/*, /dev/*, /boot/*, /run/*, /var/run/*), no path traversal (..), no null bytes. Returns normalized canonical path.
   * @minLength 1
   * @maxLength 4096
   * @pattern ^/.*
   */
  source_path: string;
  /**
   * 1:1 Container Share: Share with a specific container. Specify this OR target_project_id, not both.
   * @pattern ^[0-9a-f]{24}$
   */
  target_container_id?: string;
  /**
   * Project-Wide Share: Share with all containers in a project. Auto-mounts on all current and future containers. Specify this OR target_container_id, not both.
   * @pattern ^[0-9a-f]{24}$
   */
  target_project_id?: string;
  /** Mount mode - readonly (read-only) or readwrite (read-write) */
  mode: "readonly" | "readwrite";
  /**
   * Optional alias (lowercase alphanumeric with hyphens/underscores)
   * @minLength 3
   * @maxLength 63
   * @pattern ^[a-z0-9][a-z0-9_-]*[a-z0-9]$
   */
  alias?: string;
  /**
   * Optional label for organizing shares
   * @minLength 3
   * @maxLength 63
   * @pattern ^[a-z0-9][a-z0-9_-]*[a-z0-9]$
   */
  label?: string;
  /**
   * Optional description
   * @maxLength 1000
   */
  description?: string;
  /** Whether to enable the share (default: true). Disabled shares are kept in database but not mounted. */
  enabled?: boolean;
  /**
   * Unix timestamp (seconds) when share should expire
   * @minimum 0
   */
  expires_at?: number /* min: 0 */;
}

export interface ApiStorageSharesCreateResponse {
  statusCode: 201;
  message: string;
  data: { id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string };
}

export interface ApiStorageSharesGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string };
}

export interface ApiStorageSharesUpdateRequest {
  /** Mount mode */
  mode?: "readonly" | "readwrite";
  /** Alias (null to remove) */
  alias?: string | null;
  /** Label (null to remove) */
  label?: string | null;
  /** Description (null to remove) */
  description?: string | null;
  /** Enable or disable the share */
  enabled?: boolean;
  /** Unix timestamp (seconds) when share expires (null to never expire) */
  expires_at?: number | null;
}

export interface ApiStorageSharesUpdateResponse {
  statusCode: 200;
  message: string;
  data: { id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string };
}

export interface ApiStorageSharesDeleteResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiStorageSharesListIncomingResponse {
  statusCode: 200;
  message: string;
  data: ({ id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; created_by: string; created_at: string; updated_at: string })[];
}

export interface ApiStorageSharesListIncomingGlobalResponse {
  statusCode: 200;
  message: string;
  data: ({ id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; created_by: string; created_at: string; updated_at: string })[];
}

export interface ApiStorageSharesListGlobalResponse {
  statusCode: 200;
  message: string;
  data: ({ id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string })[];
}

export interface ApiStorageSharesToggleIncomingMountRequest {
  /** Set to true to accept and mount the share, false to reject/unmount it */
  mount: boolean;
}

export interface ApiStorageSharesToggleIncomingMountResponse {
  statusCode: 200;
  message: string;
  data: { share?: { id: string; source_container_id: string; source_path: string; target_container_id?: null | string; target_project_id?: null | string; target_type: "container" | "project"; mode: "readonly" | "readwrite"; alias?: null | string; label?: null | string; description?: null | string; enabled: boolean; status: "active" | "failed"; status_message?: null | string; expires_at?: null | number; expiry_notified?: boolean; created_by: string; realm_ids?: string[]; created_at: string; updated_at: string }; override?: { id: string; share_id?: string; container_id?: string; mount?: boolean; created_at?: string; updated_at?: string } };
}

export interface ApiUtilitiesGetIpInfoResponse {
  statusCode: number;
  message: string;
  data: { ip?: string; user_agent?: string; headers?: Record<string, unknown>; referer?: string; timestamp?: string; is_logged?: boolean; protocol?: string; ip_info?: { ip?: string; hostname?: string; city?: string; region?: string; country?: string; loc?: string; postal?: string; timezone?: string; asn?: Record<string, unknown>; is_anycast?: boolean; is_mobile?: boolean; is_anonymous?: boolean; is_satellite?: boolean; is_hosting?: boolean } | null };
}

export interface ApiEventsGetStatsResponse {
  statusCode: 200;
  message: string;
  data: { total_events: number; by_type: Record<string, unknown>; by_resource: Record<string, unknown>; oldest_event?: string; newest_event?: string };
}

export interface ApiEventsListResponse {
  statusCode: 200;
  message: string;
  data: { events: ({ id: string; event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged"; resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log"; resource_id: string; user_id: string; payload: Record<string, unknown>; realm_ids: string[]; created_at: string })[]; pagination: { total: number; limit: number; offset: number; has_more: boolean } };
}

export interface ApiEventsBulkDeleteRequest {
  /** Delete all events of this type */
  event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged";
  /** Delete all events for this resource type */
  resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log";
  /**
   * Delete all events for this resource
   * @pattern ^[0-9a-f]{24}$
   */
  resource_id?: string;
  /** Delete events before this date */
  before_date?: string;
  /**
   * Delete events in this realm
   * @pattern ^[0-9a-f]{24}$
   */
  realm_id?: string;
}

export interface ApiEventsBulkDeleteResponse {
  statusCode: 200;
  message: string;
  data: { deleted_count: number };
}

export interface ApiEventsGetResponse {
  statusCode: 200;
  message: string;
  data: { id: string; event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "user.created" | "auth.token.updated" | "auth.token.enabled" | "auth.token.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "storage.share.mount_changed" | "notification.read" | "server.health_changed" | "server.rental_expiring" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "user.banned" | "user.unbanned" | "user.role_changed" | "activity.logged"; resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "user" | "activity_log"; resource_id: string; user_id: string; payload: Record<string, unknown>; realm_ids: string[]; created_at: string };
}

export interface ApiEventsDeleteResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiEventsCleanupRequest {
  /**
   * Delete events older than this many days
   * @minimum 1
   * @maximum 365
   */
  retention_days: number /* min: 1, max: 365 */;
}

export interface ApiEventsCleanupResponse {
  statusCode: 200;
  message: string;
  data: { deleted_count: number; retention_days: number; cutoff_date: string };
}

export interface ApiActivityListResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; realm_id?: string; method?: string; path?: string; status_code?: number; ip_address?: string; user_agent?: string; created_at?: string }[];
  metadata?: { total?: number; page?: number; limit?: number; pages?: number };
}

export interface ApiActivityGetStatsResponse {
  statusCode: number;
  message: string;
  data: { total_size_bytes?: number; total_records?: number; oldest_record?: string; newest_record?: string; retention_days?: number };
}

export interface ApiAiListModelsResponse {
  statusCode: 200;
  message: string;
  data: { updated_at: null | string; models: ({ id: string; name: string; description?: null | string; created?: null | number; context_length?: null | number; input_modalities?: string[]; output_modalities?: string[]; pricing: Record<string, unknown> })[] };
}

export interface ApiMetaGetPublicKeyResponse {
  statusCode: number;
  message: string;
  data: { keys: { kid: string; algorithm: "ed25519"; public_key_hex: string; public_key_b64: string; public_key_b64url: string }[]; active_kid: string; usage: string[]; signing_format: { response_header?: string; response_signed_data?: string; identity_claim_signed_data?: string; container_claim_signed_data?: string; replay_tolerance_seconds?: number } };
}

export interface GetSocialStatsResponse {
  statusCode: number;
  message: string;
  data: { github: number | null; telegram: number | null; discord: number | null; discord_online: number | null; x: number | null; linkedin: number | null; fetchedAt: string | null };
}

export interface ApiRealmsListResponse {
  statusCode: 200;
  message: string;
  data: { realm_ids: string[]; total: number; usage?: Record<string, unknown> };
}

export interface ApiWalletGetAggregateBalancesResponse {
  statusCode: number;
  message: string;
  data: { general_balance?: string; ai_limit?: string; ai_usage?: string; ai_remaining?: string; ai_usage_status?: "live" | "unavailable" };
}

export interface GetPaymentAvailabilityResponse {
  statusCode: number;
  message: string;
  data: { stripe?: { enabled?: boolean; min_usd?: number; max_usd?: number }; nowpayments?: { enabled?: boolean; min_usd?: number; max_usd?: number }; ai_credit_fee_bps?: number };
}

export interface ApiWalletGetGeneralBalanceResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; general_balance?: string; created_at?: string; updated_at?: string };
}

export interface ApiWalletGetAiBalanceResponse {
  statusCode: number;
  message: string;
  data: { ai_limit?: string; ai_usage?: string; ai_remaining?: string };
}

export interface ApiWalletTransferToAiRequest {
  /**
   * USD amount as a string with up to 2 decimals, e.g., "10.00". No exponent, no negatives.
   * @pattern ^(0|[1-9]\d*)(\.\d{1,2})?$
   */
  amount: string;
  /**
   * Optional caller idempotency key. Retrying with the SAME key AND same amount returns the original receipt without moving funds again; the same key with a different amount is rejected (409 TRANSFER_IDEMPOTENCY_KEY_REUSED). Recommended for the UI to make a double-click / retry-after-timeout safe.
   * @minLength 1
   * @maxLength 128
   * @pattern \S
   */
  idempotency_key?: string;
  /**
   * Optional: the platform fee (basis points) the client displayed at confirmation. If it no longer matches the current server fee, the transfer is rejected (409 TRANSFER_FEE_CHANGED) so the user re-confirms — so an irreversible transfer can never be charged a fee the user was not shown.
   * @minimum 0
   * @maximum 9999
   */
  expected_fee_bps?: number /* min: 0, max: 9999 */;
}

export interface ApiWalletTransferToAiResponse {
  statusCode: number;
  message: string;
  data: { gross_transferred?: string; net_ai_credit?: string; fee?: string; general_balance?: string; ai_balance?: string; key_created?: boolean; limit_sync_pending?: boolean; replayed?: boolean };
}

export interface ApiWalletListAiFeeHistoryResponse {
  statusCode: number;
  message: string;
  data: { fees?: { id: string; transaction_id?: string; amount?: string; created_at?: string; transaction?: { id: string; reason?: string; amount?: string } }[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
}

export interface ApiWalletListPaymentMethodsResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; type?: string; name?: string; status?: string; details?: Record<string, unknown>; is_default?: boolean; created_at?: string; updated_at?: string }[];
}

export interface ApiWalletAddPaymentMethodRequest {
  name: string;
  details?: Record<string, unknown>;
  is_default?: boolean;
}

export interface ApiWalletAddPaymentMethodResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; type?: string; name?: string; status?: string; details?: Record<string, unknown>; is_default?: boolean; created_at?: string; updated_at?: string };
}

export interface ApiWalletGetPaymentMethodResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; type?: string; name?: string; status?: string; details?: Record<string, unknown>; is_default?: boolean; created_at?: string; updated_at?: string };
}

export interface ApiWalletUpdatePaymentMethodRequest {
  details?: Record<string, unknown>;
  status?: "active" | "inactive";
  is_default?: boolean;
}

export interface ApiWalletUpdatePaymentMethodResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; type?: string; name?: string; status?: string; details?: Record<string, unknown>; is_default?: boolean; created_at?: string; updated_at?: string };
}

export interface ApiWalletDeletePaymentMethodResponse {
  statusCode: number;
  message: string;
  data: null;
}

export interface ApiWalletSetDefaultPaymentMethodResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; type?: string; name?: string; status?: string; details?: Record<string, unknown>; is_default?: boolean; created_at?: string; updated_at?: string };
}

export interface CreateStripeCheckoutRequest {
  /**
   * USD amount as a strict decimal string (e.g., "25" or "25.00")
   * @pattern ^(0|[1-9]\d*)(\.\d{1,2})?$
   */
  amount: string;
  /**
   * Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent
   * @minLength 1
   * @maxLength 128
   * @pattern \S
   */
  idempotency_key?: string;
}

export interface CreateStripeCheckoutResponse {
  statusCode: 201;
  message: string;
  data: { intent?: { id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string }; checkout_url?: string };
}

export interface ListStripePaymentIntentsResponse {
  statusCode: 200;
  message: string;
  data: { intents?: ({ id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string })[]; total?: number };
}

export interface GetStripePaymentIntentResponse {
  statusCode: 200;
  message: string;
  data: { id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string };
}

export interface CreateCryptoInvoiceRequest {
  /**
   * USD amount as a strict decimal string (e.g., "25" or "25.00")
   * @pattern ^(0|[1-9]\d*)(\.\d{1,2})?$
   */
  amount: string;
  /**
   * Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent
   * @minLength 1
   * @maxLength 128
   * @pattern \S
   */
  idempotency_key?: string;
}

export interface CreateCryptoInvoiceResponse {
  statusCode: 201;
  message: string;
  data: { intent?: { id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string }; invoice_url?: string };
}

export interface ListCryptoPaymentIntentsResponse {
  statusCode: 200;
  message: string;
  data: { intents?: ({ id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string })[]; total?: number };
}

export interface GetCryptoPaymentIntentResponse {
  statusCode: 200;
  message: string;
  data: { id: string; provider?: string; status?: "creating" | "pending" | "processing" | "completed" | "failed" | "expired" | "cancelled" | "admin_review"; amount?: number; currency?: string; redirect_url?: null | string; credited_at?: null | string; expires_at?: null | string; created_at?: string; updated_at?: string };
}

export interface ApiWalletListInvoicesResponse {
  statusCode: number;
  message: string;
  data: { invoices?: { id: string; user_id?: string; transaction_id?: string; invoice_number?: string; status?: string; amount?: number; currency?: string; issue_date?: string; due_date?: string; paid_date?: string; created_at?: string; updated_at?: string; transaction?: { id: string; transaction_type?: string; status?: string; amount?: number; currency?: string; created_at?: string } }[]; pagination?: { total?: number; page?: number; limit?: number; totalPages?: number } };
  example?: unknown;
}

export interface ApiWalletGetInvoiceResponse {
  statusCode: number;
  message: string;
  data: { id: string; user_id?: string; transaction_id?: string; invoice_number?: string; status?: string; amount?: number; currency?: string; billing_details?: Record<string, unknown>; items?: unknown[]; issue_date?: string; due_date?: string; paid_date?: string; created_at?: string; updated_at?: string; transaction?: { id: string; transaction_type?: string; status?: string; amount?: number; currency?: string; created_at?: string } };
  example?: unknown;
}

/**
 * PDF file
 */
export interface ApiWalletDownloadInvoicePdfResponse {
  statusCode: number;
  message: string;
  data: string;
}

export interface ApiWalletGenerateInvoiceResponse {
  statusCode: number;
  message: string;
  data: { invoice_id?: string; invoice_number?: string };
  example?: unknown;
}

export interface ApiPoolInvitationsListResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; pool_id?: string; pool_name?: string; pool_description?: string | null; role?: "admin" | "user"; invited_by?: { id: string; username?: string; alias?: string | null } | null; invited_at?: string })[];
}

export interface ApiPoolsListResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; name?: string; description?: string | null; is_default?: boolean; settings?: Record<string, unknown>; created_at?: string; updated_at?: string; owner_id?: null | string; user_role?: "owner" | "admin" | "user"; member_count?: number; server_count?: number })[];
}

export interface ApiPoolsCreateRequest {
  /** @maxLength 100 */
  name: string;
  /** @maxLength 500 */
  description?: string;
  settings?: Record<string, unknown>;
}

export interface ApiPoolsCreateResponse {
  statusCode: number;
  message: string;
  data: { id: string; name?: string; description?: string | null; owner_id?: string; is_default?: boolean; settings?: Record<string, unknown>; created_at?: string };
}

export interface ApiPoolsGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; name?: string; description?: string | null; is_default?: boolean; settings?: Record<string, unknown>; created_at?: string; updated_at?: string; owner_id?: null | string; members?: ({ id: string; role?: "owner" | "admin" | "user"; is_authorized?: boolean; joined_at?: string | null; user?: { id: string; username?: string; alias?: string } })[]; servers?: { id: string; name?: string; rental_status?: string; is_ready?: boolean }[] };
}

export interface ApiPoolsUpdateRequest {
  /** @maxLength 500 */
  description?: string;
  settings?: Record<string, unknown>;
}

export interface ApiPoolsUpdateResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiPoolsDeleteResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiPoolMembersInviteRequest {
  /**
   * Username of the user to invite
   * @minLength 1
   * @maxLength 100
   * @pattern ^[a-zA-Z0-9_-]+$
   */
  username: string;
  role: "admin" | "user";
}

export interface ApiPoolMembersInviteResponse {
  statusCode: number;
  message: string;
  data: { id: string; role?: string; is_authorized?: boolean; invited_at?: string };
}

export interface ApiPoolMembersUpdateRoleRequest {
  role: "admin" | "user";
}

export interface ApiPoolMembersUpdateRoleResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiPoolMembersRemoveResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiPoolInvitationsAcceptResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiPoolInvitationsRejectResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export interface ApiServerRentalBrowseResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; model?: string; is_vm?: boolean; category?: null | "compute" | "memory" | "storage" | "general" | "gpu"; featured?: boolean; popularity_rank?: null | number; setup_time_minutes?: null | number; pricing?: { prices?: Record<string, unknown>; price_tiers?: Record<string, unknown> }; specs?: { cpu?: { model?: string | null; cores?: number | null; threads?: number | null; score?: number | null; score_type?: "passmark" | "geekbench_single" | "geekbench_multi" | null } | null; ram?: { capacity_gb?: number; type?: "DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5" | null; speed_mhz?: number | null } | null; disks?: { config?: ({ count?: number; capacity_gb?: number; type?: "HDD" | "SSD" | "NVMe" | "SAS"; interface?: string; model?: string })[]; total_gb?: number; summary?: string } | null; network?: { bandwidth_mbps?: number | null; bandwidth_formatted?: string | null; traffic_tb?: number | null; traffic_unlimited?: boolean } | null; additional?: { ipv4_count?: number; ipv6_enabled?: boolean } } })[];
}

export interface ApiServerRentalRentRequest {
  /** @pattern ^[0-9a-f]{24}$ */
  pool_id?: string;
  /**
   * Number of days to rent (must match server pricing durations)
   * @minimum 1
   */
  rental_days: number /* min: 1 */;
}

export interface ApiServerRentalRentResponse {
  statusCode: number;
  message: string;
  data: { rental?: { id: string; server_id?: string; rental_start?: string; rental_end?: string; hold_days?: number; actual_usage_days?: number; status?: string }; transaction?: { id: string; amount?: number; currency?: string } };
  example?: unknown;
}

export interface ApiRentalsListResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; rental_start?: string; rental_end?: string; status?: string; amount?: string; remaining_days?: number; server_id?: null | string; pool_id?: null | string; is_free_tier?: boolean; server?: null | { container_capacity?: { used: number /* min: 0 */; max: number /* min: 0 */ }; id?: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; model?: string; is_vm?: boolean; specs?: { cpu?: null | { model?: null | string; cores?: null | number; threads?: null | number; score?: null | number; score_type?: null | "passmark" | "geekbench_single" | "geekbench_multi" }; ram?: null | { capacity_gb?: number; type?: null | "DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5"; speed_mhz?: null | number }; disks?: null | { config?: ({ count?: number; capacity_gb?: number; type?: "HDD" | "SSD" | "NVMe" | "SAS"; interface?: string; model?: string })[]; total_gb?: number; summary?: string }; network?: null | { bandwidth_mbps?: null | number; bandwidth_formatted?: null | string; traffic_tb?: null | number; traffic_unlimited?: boolean }; additional?: { ipv4_count?: number; ipv6_enabled?: boolean } } } })[];
}

export interface ApiRentalsGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; rental_start?: string; rental_end?: string; hold_days?: number; status?: string; amount?: string; remaining_days?: number; usage_days?: number; server_id?: null | string; pool_id?: null | string; is_free_tier?: boolean; server?: null | { container_capacity?: { used: number /* min: 0 */; max: number /* min: 0 */ }; id?: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; model?: string; is_vm?: boolean; specs?: { cpu?: null | { model?: null | string; cores?: null | number; threads?: null | number; score?: null | number; score_type?: null | "passmark" | "geekbench_single" | "geekbench_multi" }; ram?: null | { capacity_gb?: number; type?: null | "DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5"; speed_mhz?: null | number }; disks?: null | { config?: ({ count?: number; capacity_gb?: number; type?: "HDD" | "SSD" | "NVMe" | "SAS"; interface?: string; model?: string })[]; total_gb?: number; summary?: string }; network?: null | { bandwidth_mbps?: null | number; bandwidth_formatted?: null | string; traffic_tb?: null | number; traffic_unlimited?: boolean }; additional?: { ipv4_count?: number; ipv6_enabled?: boolean } } }; transaction?: null | { id?: string; amount?: number; currency?: string; created_at?: string } };
  example?: unknown;
}

export interface ApiRentalsExtendRequest {
  /**
   * Number of additional days to extend the rental (must match server pricing durations)
   * @minimum 1
   */
  additional_days: number /* min: 1 */;
}

export interface ApiRentalsExtendResponse {
  statusCode: number;
  message: string;
  data: { rental?: { id: string; rental_end?: string; status?: string; amount?: string; remaining_days?: number }; transaction?: { id: string; amount?: number; currency?: string } };
}

export interface ApiServerRentalListResponse {
  statusCode: number;
  message: string;
  data: ({ id: string; rental_start?: string; rental_end?: string; status?: string; amount?: string; remaining_days?: number; server_id?: null | string; pool_id?: null | string; is_free_tier?: boolean; server?: null | { container_capacity?: { used: number /* min: 0 */; max: number /* min: 0 */ }; id?: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; model?: string; is_vm?: boolean; specs?: { cpu?: null | { model?: null | string; cores?: null | number; threads?: null | number; score?: null | number; score_type?: null | "passmark" | "geekbench_single" | "geekbench_multi" }; ram?: null | { capacity_gb?: number; type?: null | "DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5"; speed_mhz?: null | number }; disks?: null | { config?: ({ count?: number; capacity_gb?: number; type?: "HDD" | "SSD" | "NVMe" | "SAS"; interface?: string; model?: string })[]; total_gb?: number; summary?: string }; network?: null | { bandwidth_mbps?: null | number; bandwidth_formatted?: null | string; traffic_tb?: null | number; traffic_unlimited?: boolean }; additional?: { ipv4_count?: number; ipv6_enabled?: boolean } } } })[];
}

export interface ApiServerRentalGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; rental_start?: string; rental_end?: string; hold_days?: number; status?: string; amount?: string; remaining_days?: number; usage_days?: number; server_id?: null | string; pool_id?: null | string; is_free_tier?: boolean; server?: null | { container_capacity?: { used: number /* min: 0 */; max: number /* min: 0 */ }; id?: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; model?: string; is_vm?: boolean; specs?: { cpu?: null | { model?: null | string; cores?: null | number; threads?: null | number; score?: null | number; score_type?: null | "passmark" | "geekbench_single" | "geekbench_multi" }; ram?: null | { capacity_gb?: number; type?: null | "DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5"; speed_mhz?: null | number }; disks?: null | { config?: ({ count?: number; capacity_gb?: number; type?: "HDD" | "SSD" | "NVMe" | "SAS"; interface?: string; model?: string })[]; total_gb?: number; summary?: string }; network?: null | { bandwidth_mbps?: null | number; bandwidth_formatted?: null | string; traffic_tb?: null | number; traffic_unlimited?: boolean }; additional?: { ipv4_count?: number; ipv6_enabled?: boolean } } }; transaction?: null | { id?: string; amount?: number; currency?: string; created_at?: string } };
}

export interface GetRentalRuntimeResponse {
  statusCode: number;
  message: string;
  data: { scope: "server"; ts: string; cache_age_ms: number; stale: boolean; uptime_s?: number | null; cores?: number | null; load?: { "1"?: number | null; "5"?: number | null; "15"?: number | null }; cpu?: { busy_pct?: number | null }; mem?: { used_bytes?: number | null; total_bytes?: number | null; pct?: number | null }; swap?: { used_bytes?: number | null; total_bytes?: number | null }; storage?: { used_bytes?: number | null; total_bytes?: number | null; pct?: number | null } } | { scope: "subserver"; ts: string; cache_age_ms: number; stale: boolean; health: "ok" | "unverified"; cpu?: { usage_cores?: number | null; usage_pct?: number | null; limit_cores?: number | null }; mem?: { used_bytes?: number | null; limit_bytes?: number | null; pct?: number | null }; disk?: { used_bytes?: number | null; limit_bytes?: number | null; pct?: number | null }; pids?: { current?: number | null; max?: number | null }; io?: { read_bytes?: number | null; write_bytes?: number | null } };
}

export interface GetServerRuntimeResponse {
  statusCode: number;
  message: string;
  data: { scope: "server"; ts: string; cache_age_ms: number; stale: boolean; uptime_s?: number | null; cores?: number | null; load?: { "1"?: number | null; "5"?: number | null; "15"?: number | null }; cpu?: { busy_pct?: number | null }; mem?: { used_bytes?: number | null; total_bytes?: number | null; pct?: number | null }; swap?: { used_bytes?: number | null; total_bytes?: number | null }; storage?: { used_bytes?: number | null; total_bytes?: number | null; pct?: number | null } } | { scope: "subserver"; ts: string; cache_age_ms: number; stale: boolean; health: "ok" | "unverified"; cpu?: { usage_cores?: number | null; usage_pct?: number | null; limit_cores?: number | null }; mem?: { used_bytes?: number | null; limit_bytes?: number | null; pct?: number | null }; disk?: { used_bytes?: number | null; limit_bytes?: number | null; pct?: number | null }; pids?: { current?: number | null; max?: number | null }; io?: { read_bytes?: number | null; write_bytes?: number | null } };
}

export interface ApiServerCommandsExecuteRequest {
  /**
   * Command ID to execute (one of command_id or command_slug required)
   * @pattern ^[0-9a-f]{24}$
   */
  command_id?: string;
  /**
   * Command slug to execute (one of command_id or command_slug required)
   * @pattern ^[a-z0-9-]+$
   */
  command_slug?: string;
  /** Parameters for command template processing */
  parameters?: Record<string, unknown>;
  /** Wait for command completion before returning */
  wait?: boolean;
  /**
   * Command timeout in seconds (cannot exceed command max_timeout)
   * @minimum 1
   * @maximum 7200
   */
  timeout?: number /* min: 1, max: 7200 */;
  /** Confirmation token for high-risk commands */
  confirmation_token?: string;
}

export interface ApiServerCommandsExecuteResponse {
  statusCode: number;
  message: string;
  data: { command_log_id?: string; command_id?: string; status?: string; output?: string | null; exit_code?: number | null; execution_time?: number | null; start_time?: string | null; end_time?: string | null };
}

export interface ApiServerCommandsListResponse {
  statusCode: number;
  message: string;
  data: { commands?: ({ id: string; name?: string; slug?: string; description?: string | null; category?: string | null; mode?: string; command?: string | null; working_directory?: string | null; risk_level?: string; requires_confirmation?: boolean; parameter_schema?: Record<string, unknown> | null; example_parameters?: Record<string, unknown> | null; default_timeout?: number; cooldown_seconds?: number | null; rate_limit_per_hour?: number | null; rate_limit_per_day?: number | null; created_by?: string | null; execution_count?: number | null })[]; server_info?: { id: string; name?: string; is_ready?: boolean; rental_status?: string } };
}

export interface ApiAuthenticationSignupRequest {
  /**
   * Email address for the new account
   * @maxLength 255
   */
  email: string;
  /**
   * Password (min 12 chars, must include uppercase, lowercase, number, and special char)
   * @minLength 12
   * @maxLength 128
   */
  password: string;
  /**
   * Optional preferred server region (e.g., "eu-west"). If omitted, auto-assigned by GeoIP proximity.
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  region?: string;
  /**
   * Optional invite code ("coupon") captured from the signup link. Memorized (hash-only) and applied automatically after email verification — not validated at signup.
   * @minLength 1
   * @maxLength 128
   */
  invite_code?: string;
}

export interface ApiAuthenticationSignupResponse {
  statusCode: 200;
  message: string;
  data: { email?: string };
}

export interface ApiAuthenticationVerifyEmailRequest {
  /**
   * Verification token from the email link
   * @minLength 64
   * @maxLength 64
   */
  token: string;
  /** Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange. */
  response_mode?: "intent" | "tokens";
  /** PKCE code_challenge (base64url SHA-256 of code_verifier). Required when response_mode=intent. */
  code_challenge?: string;
}

export interface ApiAuthenticationVerifyEmailResponse {
  statusCode: 200;
  message: string;
  data: { token?: string; refreshToken?: string; expires_at?: string; expires_in?: number; refresh_expires_at?: string; refresh_expires_in?: number; auth_intent_token?: string; requires_2fa?: boolean; temp_token?: string; method?: "totp"; identity_claim?: Record<string, unknown>; user?: { id: string; username?: string; alias?: string; email?: string; is_admin?: boolean; email_verified?: boolean; signup_method?: string; avatar_url?: string | null; created_at?: string; updated_at?: string }; server?: { id: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; is_ready?: boolean } | null; project?: { id: string; alias?: string } | null; container?: { id: string; name?: string } | null };
}

export interface ApiAuthenticationResendVerificationRequest {
  /**
   * Email address to resend verification to
   * @maxLength 255
   */
  email: string;
}

export interface ApiAuthenticationResendVerificationResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiAuthenticationForgotPasswordRequest {
  /**
   * Email address associated with the account
   * @maxLength 255
   */
  email: string;
}

export interface ApiAuthenticationForgotPasswordResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface ApiAuthenticationResetPasswordRequest {
  /**
   * Password reset token from the email link
   * @minLength 64
   * @maxLength 64
   */
  token: string;
  /**
   * New password (min 12 chars)
   * @minLength 12
   * @maxLength 128
   */
  password: string;
}

export interface ApiAuthenticationResetPasswordResponse {
  statusCode: 200;
  message: string;
  data: null;
}

export interface GetAvailableRegionsResponse {
  statusCode: 200;
  data: { regions?: { region?: string; country?: string; city?: string; available?: boolean }[] };
  message: string;
}

export interface WaitlistJoinRequest {
  /**
   * Signup email address.
   * @maxLength 255
   * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$
   */
  email: string;
}

export interface WaitlistJoinResponse {
  statusCode: 200;
  message: string;
  data: { email?: string };
}

export interface WaitlistEnrichRequest {
  /**
   * Email of an existing signup.
   * @maxLength 255
   * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$
   */
  email: string;
  interest?: "dev" | "ai" | "saas" | "security" | "creative" | "productivity" | "it" | "other" | "";
  context?: "individual" | "startup" | "medium" | "enterprise" | "academic" | "";
  industry?: "softdev" | "saas" | "paas" | "cloud" | "ai-ml" | "datasci" | "cyber" | "devops" | "gamedev" | "ecom" | "fintech" | "healthtech" | "edtech" | "agritech" | "marketing" | "consulting" | "telecom" | "iot" | "blockchain" | "arvr" | "robotics" | "research" | "freelance" | "techstartup" | "enterprise-sw" | "opensource" | "other-tech" | "other-nontech" | "";
  role?: "lead" | "manager" | "director" | "exec" | "founder" | "engineer" | "devops" | "ml" | "security" | "consultant" | "student" | "researcher" | "other" | "";
}

export interface WaitlistEnrichResponse {
  statusCode: 200;
  message: string;
  data: { email?: string };
}

export interface OauthLaunchInitiateRequest {
  provider: "github" | "google";
  /**
   * PKCE code_challenge (base64url SHA-256 of code_verifier, 43–128 chars)
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9_-]+$
   */
  code_challenge: string;
  /**
   * Per-attempt UUID v4 — plumbed through state JWT, cookie name, fragment, message filter
   * @pattern ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
   */
  state_id: string;
}

export interface OauthLaunchInitiateResponse {
  statusCode: number;
  data: { launch_url?: string };
  message: string;
}

export interface OauthDeviceCodeRequest {
  /**
   * Shown on the verification page as "X is requesting access"
   * @maxLength 64
   */
  client_name?: string;
  /**
   * Optional PKCE on the device flow itself; if present the poll REQUIRES the verifier
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9_-]+$
   */
  code_challenge?: string;
}

export interface OauthDeviceCodeResponse {
  statusCode: number;
  data: { device_code?: string; user_code?: string; verification_uri?: string; verification_uri_complete?: string; interval?: number; expires_in?: number };
  message: string;
}

export interface OauthDeviceVerifyCodeRequest {
  /**
   * XXXX-XXXX user code (dashes optional)
   * @maxLength 16
   */
  user_code: string;
}

export interface OauthDeviceVerifyCodeResponse {
  statusCode: number;
  data: Record<string, unknown>;
  message: string;
}

export interface OauthDeviceLoginRequest {
  /**
   * device_verify_ticket from /device/verify_code
   * @pattern ^[0-9a-f]{64}$
   */
  ticket: string;
  /**
   * Username (alternative to email)
   * @minLength 3
   * @maxLength 50
   * @pattern ^[a-zA-Z0-9_-]+$
   */
  username?: string;
  /**
   * Email address (alternative to username)
   * @maxLength 255
   */
  email?: string;
  /**
   * Account password
   * @minLength 8
   * @maxLength 128
   */
  password: string;
}

export interface OauthDeviceLoginResponse {
  statusCode: number;
  data: { status?: "approved"; requires_2fa?: boolean; temp_token?: string };
  message: string;
}

export interface OauthDeviceDenyRequest {
  /**
   * device_verify_ticket from /device/verify_code
   * @pattern ^[0-9a-f]{64}$
   */
  ticket: string;
}

export interface OauthDeviceDenyResponse {
  statusCode: number;
  data: { status?: "denied" };
  message: string;
}

export interface OauthDeviceTokenRequest {
  /** @pattern ^[0-9a-f]{64}$ */
  device_code: string;
  /**
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9_-]+$
   */
  code_verifier?: string;
}

export interface OauthDeviceTokenResponse {
  statusCode: number;
  data: { token?: string; refreshToken?: string; expires_at?: string; expires_in?: number; refresh_expires_at?: string; refresh_expires_in?: number; identity_claim?: { kid?: string; payload_b64?: string; signature_hex?: string }; user?: { id: string; username?: string; alias?: string; email?: string; is_admin?: boolean; email_verified?: boolean; signup_method?: string; avatar_url?: string | null; created_at?: string; updated_at?: string }; server?: { id: string; name?: string; country?: string; region?: string; city?: string; datacenter?: string; is_ready?: boolean } | null; project?: { id: string; alias?: string } | null; container?: { id: string; name?: string; status?: string | null } | null };
  message: string;
}

export interface OauthAuthorizeRequest {
  /**
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9_-]+$
   */
  code_challenge: string;
  /**
   * @minLength 1
   * @maxLength 2048
   * @pattern ^https://
   */
  redirect_uri: string;
}

export interface OauthExchangeRequest {
  /** @pattern ^[0-9a-f]{64}$ */
  code: string;
  /**
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9_\-.~]+$
   */
  code_verifier: string;
  /**
   * @minLength 1
   * @maxLength 2048
   * @pattern ^https://
   */
  redirect_uri: string;
}

export interface GetGithubBonusResponse {
  statusCode: 200;
  message: string;
  data: { enabled?: boolean; repo?: string; amount_usd?: string; github_linked?: boolean; github_username?: string | null; claimed?: boolean; identity_claimed_elsewhere?: boolean; claim?: { amount_usd?: string; at?: string | null; transaction_id?: string } | null };
}

export interface ClaimGithubBonusResponse {
  statusCode: 200;
  message: string;
  data: { result?: "granted" | "already_claimed" | "identity_claimed_elsewhere" | "not_linked" | "offer_ended" | "retry" | "error"; amount_usd?: string; transaction_id?: string; claim?: { amount_usd?: string; at?: string | null; transaction_id?: string } | null };
}

export interface BrowserInstancesStartResponse {
  statusCode: number;
  message: string;
  data: { engine?: "playwright" | "patchright"; stealth?: boolean; headless?: boolean; chromiumBuildId?: string; chromiumExecutablePath?: string; browserExecutablePath?: string; fingerprintId?: string; display?: string; iframe_url?: string | null; browser_id?: string; browser_host?: string; browser_port?: number; sessionId?: string; sessionName?: string; timezoneId?: string; locale?: string; geolocation?: Geolocation; viewport?: Viewport; viewportSource?: "creation" | "runtime"; userAgentString?: string; browserName?: string; browserFullVersion?: string; operatingSystemName?: string; operatingSystemPlatform?: string; operatingSystemVersion?: string; renderingEngine?: string; renderingEngineVersion?: string; webSocketDebuggerUrl?: string | null; devtoolsHttpUrl?: string | null; devtoolsFrontendUrl?: string | null; extensions?: string[]; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number | null; remoteDebuggingAddress?: string | null; quicDisabled?: boolean; http3Disabled?: boolean; dnsOverHttpsEnabled?: boolean; dnsOverHttpsUrl?: string | null; tabs?: { id: number; url?: string }[] };
}

export interface BrowserInstancesStopResponse {
  message: string;
  meta?: BrowserMetadata;
  statusCode: number;
  data: null;
}

export interface BrowserInstancesRestartResponse {
  message: string;
  meta?: BrowserMetadata;
  statusCode: number;
  data: null;
}

export interface BrowserInteractionTakeScreenshotResponse {
  data: string;
  statusCode: number;
  message: string;
}

export interface BrowserInteractionBrowseResponse {
  statusCode: number;
  message: string;
  data: { tabId?: number; url?: string; created?: boolean; reused?: boolean };
}

export interface BrowsePostRequest {
  url: string;
  tabId?: number;
  active?: boolean;
  onlyIfNotExists?: boolean;
  ignoreGetParameters?: boolean;
}

export interface BrowsePostResponse {
  statusCode: number;
  message: string;
  data: { tabId?: number; url?: string; created?: boolean; reused?: boolean };
}

/**
 * Result of the evaluated JavaScript expression
 */
export interface EvalGetResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface EvalPostRequest {
  /** JavaScript code to execute */
  script?: string;
}

/**
 * Result of the evaluated JavaScript expression
 */
export interface EvalPostResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface BrowserIntrospectionGetMetadataResponse {
  statusCode: number;
  message: string;
  data: { engine?: "playwright" | "patchright"; stealth?: boolean; headless?: boolean; chromiumBuildId?: string; chromiumExecutablePath?: string; browserExecutablePath?: string; fingerprintId?: string; display?: string; iframe_url?: string | null; browser_id?: string; browser_host?: string; browser_port?: number; sessionId?: string; sessionName?: string; timezoneId?: string; locale?: string; geolocation?: Geolocation; viewport?: Viewport; viewportSource?: "creation" | "runtime"; userAgentString?: string; browserName?: string; browserFullVersion?: string; operatingSystemName?: string; operatingSystemPlatform?: string; operatingSystemVersion?: string; renderingEngine?: string; renderingEngineVersion?: string; webSocketDebuggerUrl?: string | null; devtoolsHttpUrl?: string | null; devtoolsFrontendUrl?: string | null; extensions?: string[]; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number | null; remoteDebuggingAddress?: string | null; quicDisabled?: boolean; http3Disabled?: boolean; dnsOverHttpsEnabled?: boolean; dnsOverHttpsUrl?: string | null; tabs?: { id: number; url?: string }[] };
}

export interface BrowserIntrospectionListTabsResponse {
  statusCode: number;
  message: string;
  data: Tab[];
}

export interface BrowserIntrospectionCloseTabRequest {
  /** The ID of the tab to close */
  tabId?: number;
}

export interface BrowserIntrospectionCloseTabResponse {
  statusCode: number;
  message: string;
  data: { closed?: number; remaining?: number };
}

export interface BrowserIntrospectionShutdownResponse {
  message: string;
  statusCode: number;
  data: null;
}

export interface BrowserHealthCheckResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface BrowserHealthGetMetricsResponse {
  statusCode: number;
  message: string;
  data: { instances?: { total?: number; active?: number; byAge?: { lessThan1Min?: number; lessThan5Min?: number; lessThan15Min?: number; moreThan15Min?: number }; oldestInstance?: number; newestInstance?: number }; system?: { uptime?: number; memory?: Record<string, unknown>; cpu?: Record<string, unknown>; platform?: string; nodeVersion?: string }; configuration?: Record<string, unknown>; timestamp?: string };
}

export interface BrowserHealthGetOpenApiJsonResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface BrowserIntrospectionGetDevtoolsUrlResponse {
  statusCode: number;
  message: string;
  data: { webSocketDebuggerUrl?: string | null; devtoolsHttpUrl?: string | null; devtoolsFrontendUrl?: string | null };
}

/**
 * Live viewport policy of a browser instance.
 */
export interface GetViewportResponse {
  statusCode: number;
  message: string;
  data: { viewport: { width: number /* min: 1, max: 8192 */; height: number /* min: 1, max: 8192 */ } | null; source: "creation" | "runtime"; tabs: number /* min: 0 */; converged: boolean };
}

export interface SetViewportRequest {
  /** Fixed size {width,height} (integers 1..8192, no other keys), or null for responsive. */
  viewport: { width: number /* min: 1, max: 8192 */; height: number /* min: 1, max: 8192 */ } | null;
}

/**
 * Live viewport policy of a browser instance.
 */
export interface SetViewportResponse {
  statusCode: number;
  message: string;
  data: { viewport: { width: number /* min: 1, max: 8192 */; height: number /* min: 1, max: 8192 */ } | null; source: "creation" | "runtime"; tabs: number /* min: 0 */; converged: boolean };
}

export interface BrowserCookiesGetResponse {
  statusCode: number;
  message: string;
  data: { cookies?: { name?: string; value?: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean }[] };
}

export interface BrowserCookiesSetRequest {
  cookies: { name: string; value: string; url: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean }[];
}

export interface BrowserCookiesSetResponse {
  statusCode: number;
  message: string;
  data: { added?: number };
}

export interface BrowserCookiesClearResponse {
  statusCode: number;
  message: string;
  data: { cleared?: boolean };
}

export interface BrowserDebuggingGetConsoleLogsResponse {
  statusCode: number;
  message: string;
  data: { logs?: { timestamp?: string; type?: string; text?: string; tabId?: number }[]; count?: number };
}

export interface BrowserDebuggingGetNetworkLogsResponse {
  statusCode: number;
  message: string;
  data: { logs?: ({ timestamp?: string; method?: string; url?: string; status?: number | null; resourceType?: string; tabId?: number })[]; count?: number };
}

export interface BrowserHistoryListResponse {
  statusCode: number;
  message: string;
  data: { entries?: NavigationRecord[]; total?: number; has_more?: boolean; limit?: number; offset?: number };
}

export interface BrowserHistoryClearResponse {
  statusCode: number;
  message: string;
  data: { deleted?: number };
}

export interface CodeExtensionsInstallRequest {
  /** URL to the VSIX file to install. Supports:
- HTTPS URLs (recommended)
- HTTP URLs */
  url: string;
  /** If true, install as a system/built-in extension.
Built-in extensions cannot be uninstalled by users. */
  asBuiltin?: boolean;
}

export interface CodeExtensionsInstallResponse {
  success?: boolean;
  message: string;
  url?: string;
  vsixPath?: string;
  asBuiltin?: boolean;
  installed?: boolean;
  statusCode: number;
  data: unknown;
}

export interface CodeExtensionsListResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; extensionsDir?: string; count?: number; extensions?: string[] };
}

export interface CodeHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { status: "ok"; service: "hoody-code"; built: string | null; started: string; memory: { rss: number; heap: number | null } | null; fds: number | null; pid: number; ip: string; userAgent: string | null };
}

export interface CodeHealthCheckUpdateResponse {
  statusCode: number;
  message: string;
  data: { current?: string; latest?: string; updateAvailable?: boolean };
}

/**
 * Paginated job summaries response.
 */
export interface CurlJobsListResponse {
  items: JobSummary[];
  meta: PaginationMeta;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Job record
 */
export interface CurlJobsGetResponse {
  completed_at?: string | null;
  created_at: string;
  error?: string | null;
  id: string;
  name?: string | null;
  request: CurlRequest;
  response?: null | CurlResponse;
  retry_attempts: number /* min: 0 */;
  retry_count: number /* min: 0 */;
  session_id?: string | null;
  started_at?: string | null;
  status: JobStatus;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * JSON-wrapped response
 */
export interface ExecuteCurlRequestGetResponse {
  statusCode: number;
  message: string;
  data: { body: string; headers: Record<string, unknown>; is_binary: boolean; job_id?: string | null; metadata: ResponseMetadata; status_code: number /* min: 0 */; success: boolean; timing: ResponseTiming };
}

export type CurlExecuteRequest = CurlRequest;

/**
 * JSON-wrapped response
 */
export interface CurlExecuteResponse {
  statusCode: number;
  message: string;
  data: { body: string; headers: Record<string, unknown>; is_binary: boolean; job_id?: string | null; metadata: ResponseMetadata; status_code: number /* min: 0 */; success: boolean; timing: ResponseTiming };
}

export interface CurlSchedulesListResponse {
  statusCode: number;
  message: string;
  data: { total: number; schedules: ({ scriptPath: string; scriptRel: string; subdomain: string; execId?: string | null; vmCacheKey: string; expression: string; timeoutMs: number; registeredAt: string; nextFire?: string | null; lastFireAt?: string | null; lastFireStatus?: "ok" | "error" | "timeout" | "disabled" | "load_error" | "incompatible" | "skipped_overload" | null; lastFireRunId?: string | null })[] };
}

export type CurlSchedulesCreateRequest = CreateScheduleRequest2;

/**
 * Scheduled job
 */
export interface CurlSchedulesGetResponse {
  statusCode: number;
  message: string;
  data: { created_at: string; cron: string; enabled: boolean; id: string; last_run?: string | null; name?: string | null; next_run?: string | null; request: CurlRequest };
}

export type CurlSchedulesToggleRequest = unknown;

/**
 * Paginated sessions response.
 */
export interface CurlSessionsListResponse {
  items: Session[];
  meta: PaginationMeta;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Session record
 */
export interface CurlSessionsGetResponse {
  statusCode: number;
  message: string;
  data: { cookies: Record<string, unknown>; created_at: string; id: string; last_used: string; scoped_cookies?: StoredCookie[] };
}

/**
 * Paginated storage entries response.
 */
export interface CurlStorageListResponse {
  items: StorageEntry[];
  meta: PaginationMeta;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface DaemonProgramsListResponse {
  statusCode: number;
  message: string;
  data: { programs: Program[] };
}

export interface DaemonProgramsGetResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; program: Program };
}

export interface DaemonProgramsResetResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean };
}

export type DaemonProgramsAddRequest = ProgramInput;

export interface DaemonProgramsAddResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; id: number; program: Program };
}

export type DaemonProgramsEditRequest = ProgramInput;

export interface DaemonProgramsEditResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; program: Program };
}

export interface DaemonProgramsRemoveResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; id: number };
}

export interface DaemonControlEnableResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; program: Program };
}

export interface DaemonControlDisableResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; program: Program };
}

export interface DaemonControlStartRequest {
  /**
   * Port number to start (required for port-range programs)
   * @minimum 1
   * @maximum 65535
   */
  port?: number /* min: 1, max: 65535 */;
  /** Wait for program to reach RUNNING state before returning */
  wait?: boolean;
  /**
   * Timeout in seconds when wait=true (default: 30)
   * @minimum 1
   * @maximum 300
   */
  timeout?: number /* min: 1, max: 300 */;
  /** Only start if not already running (idempotent mode). If true, checks if instance is running first. Returns already_running field in response. Use this for edge proxy automation. */
  if_not_running?: boolean;
}

export interface DaemonControlStartResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; already_running?: boolean; instance?: { port?: number; instance_name?: string; status?: string; pid?: number; uptime?: string } };
}

export interface DaemonControlStopRequest {
  /**
   * Specific port to stop
   * @minimum 1
   * @maximum 65535
   */
  port?: number /* min: 1, max: 65535 */;
  /** Stop all instances (for port-range programs) */
  all?: boolean;
}

export interface DaemonControlStopResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface DaemonStatusGetAllResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; statuses: { id: number; name: string; enabled: boolean; status: ProgramStatus }[] };
}

export interface DaemonStatusGetResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; status: ProgramStatus; stats?: unknown };
}

/**
 * Response listing all ephemeral programs
 */
export interface DaemonQuickStartListResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; count: number; ephemeral_programs: EphemeralProgram[] };
}

export type DaemonQuickStartLaunchRequest = EphemeralProgramInput;

/**
 * Response from quick-start endpoint
 */
export interface DaemonQuickStartLaunchResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; temporary_id: string; name: string; display?: string | null; status: "running" | "starting"; pid?: number | null; uptime?: string | null; created_at: string; expires_at?: string | null };
}

/**
 * Response from quick-start endpoint
 */
export interface DaemonQuickStartGetStatusResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; temporary_id: string; name: string; display?: string | null; status: "running" | "starting"; pid?: number | null; uptime?: string | null; created_at: string; expires_at?: string | null };
}

export interface DaemonStatusGetLogsResponse {
  success?: boolean;
  error?: string | null;
  logs?: string | null;
  type?: "stdout" | "stderr";
  lines?: number;
  log_file?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface DaemonQuickStartGetEphemeralLogsResponse {
  success?: boolean;
  error?: string | null;
  logs?: string | null;
  type?: "stdout" | "stderr";
  lines?: number;
  log_file?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Response from stopping ephemeral program
 */
export interface DaemonQuickStartStopResponse {
  success: boolean;
  temporary_id: string;
  cleaned_up: boolean;
  message: string;
  statusCode: number;
  data: unknown;
}

export interface DisplayScreenshotsCaptureResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayScreenshotsCaptureMetadataResponse {
  statusCode: number;
  message: string;
  data: { timestamp: string; timestamp_human?: string; full: FileInfo; thumbnail?: FileInfo | null };
}

export interface DisplayScreenshotsGetLatestResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayScreenshotsGetLatestMetadataResponse {
  statusCode: number;
  message: string;
  data: { timestamp: string; timestamp_human?: string; full: FileInfo; thumbnail?: FileInfo | null };
}

export interface DisplayScreenshotsGetByTimestampResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayThumbnailsCaptureResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayThumbnailsGetLatestResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayThumbnailsGetByTimestampResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayGetInformationResponse {
  statusCode: number;
  message: string;
  data: { display?: number; screenshots?: ScreenshotInfo[] };
}

export interface DisplayListScreenshotsResponse {
  statusCode: number;
  message: string;
  data: { display: number; screenshots: ScreenshotInfo[] };
}

export interface DisplayGetClipboardResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; text?: string; selection?: "clipboard" | "primary" | "secondary" };
}

export type DisplaySetClipboardRequest = ClipboardWriteBody;

export interface DisplaySetClipboardResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayListWindowsResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; display?: number; focusedWindowId?: number | null; windows?: WindowListItem[] };
}

export interface DisplayGetWindowPropertiesResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; windowId?: string; properties?: WindowProperties };
}

export type DisplayInputMouseClickRequest = MouseClickBody;

export interface DisplayInputMouseClickResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputMouseDoubleClickRequest {
  /**
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
  window?: number | string;
}

export interface DisplayInputMouseDoubleClickResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputMouseMoveRequest = MouseMoveBody;

export interface DisplayInputMouseMoveResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputMouseMoveRelativeRequest {
  x: number;
  y: number;
  sync?: boolean;
}

export interface DisplayInputMouseMoveRelativeResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputMouseDownRequest {
  /**
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
  window?: number | string;
  /**
   * Auto-release after this many milliseconds
   * @minimum 100
   * @maximum 60000
   */
  holdMs?: number /* min: 100, max: 60000 */;
}

export interface DisplayInputMouseDownResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputMouseUpRequest {
  /**
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
  window?: number | string;
}

export interface DisplayInputMouseUpResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputMouseScrollRequest = MouseScrollBody;

export interface DisplayInputMouseScrollResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputMouseLocationResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; x?: number; y?: number; screen?: number; window?: number };
}

export type DisplayInputKeyboardTypeRequest = KeyboardTypeBody;

export interface DisplayInputKeyboardTypeResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputKeyboardKeyRequest = KeyboardKeyBody;

export interface DisplayInputKeyboardKeyResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputKeyboardKeyDownRequest = KeyboardKeyDownBody;

export interface DisplayInputKeyboardKeyDownResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputKeyboardKeyUpRequest {
  /** @maxLength 100 */
  key: string;
  window?: number | string;
}

export interface DisplayInputKeyboardKeyUpResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowFocusRequest = WindowIdBody;

export interface DisplayInputWindowFocusResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowMoveRequest = WindowMoveBody;

export interface DisplayInputWindowMoveResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowResizeRequest = WindowResizeBody;

export interface DisplayInputWindowResizeResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowMinimizeRequest = WindowIdBody;

export interface DisplayInputWindowMinimizeResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowCloseRequest = WindowIdBody;

export interface DisplayInputWindowCloseResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputWindowRaiseRequest = WindowIdBody;

export interface DisplayInputWindowRaiseResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputWindowActiveResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; windowId?: number };
}

export type DisplayInputWindowSearchRequest = WindowSearchBody;

export interface DisplayInputWindowSearchResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; windows?: number[] };
}

export interface DisplayInputWindowGeometryResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; windowId?: number; x?: number; y?: number; width?: number; height?: number };
}

export interface DisplayInputWindowNameResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; windowId?: number; name?: string };
}

export type DisplayInputClickAtRequest = ClickAtBody;

export interface DisplayInputClickAtResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputTypeAtRequest = TypeAtBody;

export interface DisplayInputTypeAtResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputDragRequest = DragBody;

export interface DisplayInputDragResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputSelectRequest = SelectBody;

export interface DisplayInputSelectResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export type DisplayInputActRequest = ActBody;

export interface DisplayInputActResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; action?: { success?: boolean; action?: string; details?: Record<string, unknown> }; screenshot?: { timestamp?: string; image?: Base64ImageData } };
}

export type DisplayInputWaitRequest = WaitBody;

export interface DisplayInputWaitResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; action?: string; details?: { ms?: number }; screenshot?: { timestamp?: string; image?: Base64ImageData } };
}

export type DisplayInputBatchRequest = BatchBody;

export interface DisplayInputBatchResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; completed: { index?: number; action?: string; success?: boolean }[]; failed?: { index?: number; action?: string; error?: string }; skipped?: number[] };
}

export interface DisplayInputResetResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayInputGeometryResponse {
  statusCode: number;
  message: string;
  data: { success?: boolean; width?: number; height?: number; screen?: number };
}

export type ExecExecutionExecuteRequest = Record<string, unknown>;

export interface ExecValidateValidateTypeScriptRequest {
  /** Code */
  code: string;
}

export interface ExecValidateValidateTypeScriptResponse {
  valid: boolean;
  javascript: string;
  originalLength: number;
  transpiledLength: number;
  normalized: boolean;
  transformations: string[];
  message: "TypeScript validation successful";
  statusCode: number;
  data: unknown;
}

export interface ExecValidateValidateSyntaxRequest {
  /** Code */
  code: string;
}

export interface ExecValidateValidateSyntaxResponse {
  valid: boolean;
  message: "JavaScript syntax is valid";
  codeLength: number;
  normalized: boolean;
  transformations: string[];
  statusCode: number;
  data: unknown;
}

export interface ExecValidateValidateDependenciesRequest {
  /** Code */
  code: string;
}

export interface ExecValidateValidateDependenciesResponse {
  totalModules: number;
  allInstalled: boolean;
  missingCount: number;
  missingModules: unknown[];
  dependencies: unknown[];
  message: string;
  installCommand: string | null;
  statusCode: number;
  data: unknown;
}

export interface ExecValidateValidateReturnTypeRequest {
  /** Type Definition */
  typeDefinition: string;
  /** Arbitrary JSON value to validate against the declared return type */
  value: unknown;
}

export interface ExecValidateValidateReturnTypeResponse {
  valid: boolean;
  errors: Record<string, unknown>[];
  typeDefinition: string;
  parsedType: Record<string, unknown>;
  message: string;
  statusCode: number;
  data: unknown;
}

export interface ExecValidateValidateMagicCommentsRequest {
  /** Code */
  code: string;
}

export interface ExecValidateValidateMagicCommentsResponse {
  magicComments: Record<string, unknown> | null;
  warnings: { directive: string; value: string; message: string }[];
  returnType: { definition: string; mode: string; location: string } | null;
  message: string;
  statusCode: number;
  data: unknown;
}

export interface ExecValidateValidateScriptRequest {
  /** Code */
  code: string;
}

export interface ExecValidateValidateScriptResponse {
  valid: boolean;
  results: { syntax: { valid: true; message: string } | { valid: false; error: string }; typescript: { valid: true; transpiledLength: number } | { valid: false; error: string } | null; dependencies: { total: number; installed: number; missing: number; missingModules: string[]; allInstalled: boolean }; magicComments: Record<string, unknown> | null; magicCommentWarnings: { directive: string; value: string; message: string }[]; normalized: boolean; transformations: string[] };
  message: string;
  statusCode: number;
  data: unknown;
}

export interface ExecTemplatesListResponse {
  statusCode: number;
  message: string;
  data: { count: number; templates: unknown[] };
}

export interface ExecTemplatesPreviewResponse {
  statusCode: number;
  message: string;
  data: { template: { name: string; metadata: Record<string, unknown>; code: string; originalCode: string; substituted: boolean } };
}

export interface ExecTemplatesGenerateRequest {
  /** Name */
  name: string;
  /** Variables */
  variables?: Record<string, unknown>;
  /** Output Path */
  outputPath?: string;
  /** Save File */
  saveFile?: boolean;
}

export interface ExecTemplatesGenerateResponse {
  statusCode: number;
  message: string;
  data: { generated: boolean; template: string; code: string; saved: boolean; path: string | null; variables: Record<string, unknown> };
}

/**
 * Request payload
 */
export type ExecTemplatesCreateCustomRequest = Record<string, unknown>;

export interface ExecTemplatesCreateCustomResponse {
  statusCode: number;
  message: string;
  data: { created: boolean; name: string; path: string; metadata: { name: string; category: string; tags: string[]; description: string; params: string[]; version: string; author: string } };
}

export interface ExecTemplatesUpdateCustomRequest {
  /** Code */
  code?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface ExecTemplatesUpdateCustomResponse {
  statusCode: number;
  message: string;
  data: { updated: true; name: string; metadata: Record<string, unknown> };
}

export interface ExecTemplatesDeleteCustomResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean; name: string };
}

export interface ExecScriptsReadResponse {
  statusCode: number;
  message: string;
  data: { path: string; resolvedPath: string; content: string; magicComments: Record<string, unknown> | null; metadata: { size: number; created: string; modified: string; isDirectory: boolean; extension: string } };
}

export interface ExecScriptsWriteRequest {
  /** Path */
  path: string;
  /** Content */
  content: string;
  /** Create Dirs */
  createDirs?: boolean;
  /** Validate */
  validate?: boolean;
  /** Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. */
  execId?: string;
  /** Alias for execId (snake_case). */
  exec_id?: string;
  /** Optional subdomain namespace used with execId for path resolution. */
  subdomain?: string;
}

export interface ExecScriptsWriteResponse {
  statusCode: number;
  message: string;
  data: { path: string; resolvedPath: string; created: boolean; updated: boolean; size: number; modified: string; validated: boolean; env?: Record<string, unknown> | null; schedule?: { action: string; reason?: string } };
}

export interface ExecScriptsDeleteResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean; path: string; resolvedPath: string; size: number };
}

export interface ExecScriptsListResponse {
  statusCode: number;
  message: string;
  data: { directory: string; count: number; recursive: boolean; filters: { label?: string; tags?: string; mode?: string; enabled?: string; websocket?: string }; scripts: { name: string; path: string; isDirectory: boolean }[] } | { directory: string; count: number; scripts: unknown[] };
}

export interface ExecScriptsGetTreeRequest {
  /** Base Dir */
  baseDir?: string;
  /** Max Depth */
  maxDepth?: number;
  /** Include Metadata */
  includeMetadata?: boolean;
  /** Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. */
  execId?: string;
  /** Alias for execId (snake_case). */
  exec_id?: string;
  /** Optional subdomain namespace used with execId for path resolution. */
  subdomain?: string;
}

export interface ExecScriptsGetTreeResponse {
  statusCode: number;
  message: string;
  data: { baseDir: string; tree: Record<string, unknown>[] };
}

export interface ExecScriptsMoveRequest {
  /** From */
  from: string;
  /** To */
  to: string;
  /** Overwrite */
  overwrite?: boolean;
  /** Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. */
  execId?: string;
  /** Alias for execId (snake_case). */
  exec_id?: string;
  /** Optional subdomain namespace used with execId for path resolution. */
  subdomain?: string;
}

export interface ExecScriptsMoveResponse {
  statusCode: number;
  message: string;
  data: { moved: boolean; from: string; to: string; resolvedFrom: string; resolvedTo: string; size: number };
}

export interface ExecLogsListResponse {
  statusCode: number;
  message: string;
  data: { logs: unknown[]; count: number } | { directory: string | null; count: number; logs: unknown[] };
}

export interface ExecLogsReadRequest {
  /** File */
  file?: string;
  /** Execution Id */
  executionId?: string;
  /** Lines */
  lines?: number;
  /** Tail */
  tail?: boolean;
  /** Search */
  search?: string;
}

export interface ExecLogsReadResponse {
  statusCode: number;
  message: string;
  data: { file: string; totalLines: number; filteredLines: number; returnedLines: number; lines: string[]; size: number; modified: string };
}

export interface ExecLogsSearchRequest {
  /** Query */
  query?: string;
  /** Regex */
  regex?: string;
  /** Files */
  files?: unknown[];
  /** Limit */
  limit?: number;
  /** Case Sensitive */
  caseSensitive?: boolean;
}

export interface ExecLogsSearchResponse {
  statusCode: number;
  message: string;
  data: { query: string; searchType: string; filesSearched: number; matchesFound: number; results: unknown[] };
}

export interface ExecLogsClearResponse {
  deleted: number;
  totalSize: number;
  message: string;
  statusCode: number;
  data: unknown;
}

export interface ExecCacheClearRequest {
  /** Hostname */
  hostname?: string;
  /** DEPRECATED: scriptPath-based clear returns HTTP 400. VM cache is keyed by hostname. Use hostname or clearAll=true instead. */
  scriptPath?: string;
  /** Clear Vm */
  clearVm?: boolean;
  /** Clear State */
  clearState?: boolean;
  /** Clear All */
  clearAll?: boolean;
}

export interface ExecCacheClearResponse {
  statusCode: number;
  message: string;
  data: { cleared: boolean; vmCache: { cleared: number; remaining: number }; sharedState: { cleared: number; remaining: number } };
}

export interface ExecStateGetRequest {
  /** Hostname */
  hostname: string;
  /** Path */
  path?: string;
}

export interface ExecStateGetResponse {
  statusCode: number;
  message: string;
  data: { hostname: string; path?: string; exists: false; state: Record<string, unknown> | null } | ({ hostname: string; path?: string | null; exists: true; state: unknown; size: number } & { exists: true });
}

export interface ExecStateSetRequest {
  /** Hostname */
  hostname: string;
  /** Path */
  path?: string;
  /** Arbitrary JSON value to store */
  value: unknown;
  /** Merge */
  merge?: boolean;
}

export interface ExecStateSetResponse {
  statusCode: number;
  message: string;
  data: { hostname: string; path: string | null; updated: boolean; merged: boolean; size: number };
}

export interface ExecStateClearRequest {
  /** Hostname */
  hostname: string;
  /** Path */
  path?: string;
  /** Clear All */
  clearAll?: boolean;
}

export interface ExecStateClearResponse {
  statusCode: number;
  message: string;
  data: { cleared: boolean; count: number; remaining: number };
}

/**
 * Request payload
 */
export type ExecRouteResolveRequest = Record<string, unknown>;

export interface ExecRouteResolveResponse {
  statusCode: number;
  message: string;
  data: { matched: boolean; path: string; hostname: string; execId: string | null; triedDirectories: unknown[] };
}

export interface ExecRouteDiscoverRequest {
  /** Base Dir */
  baseDir?: string;
  /** Include Metadata */
  includeMetadata?: boolean;
}

export interface ExecRouteDiscoverResponse {
  statusCode: number;
  message: string;
  data: { baseDir: string; count: number; routes: unknown[] };
}

/**
 * Request payload
 */
export type ExecRouteTestRequest = Record<string, unknown>;

export interface ExecRouteTestResponse {
  statusCode: number;
  message: string;
  data: { tested: number; matched: number; notMatched: number; results: unknown[] };
}

export interface ExecMonitorGetStatsResponse {
  statusCode: number;
  message: string;
  data: { uptime: number; memory: { used: number; total: number; percentage: number; rss?: number; external?: number }; cache: { scripts: number; vms: number; sharedStates?: number; activeWsHostnames?: number }; requests: { total: number; success: number; errors: number; activeHttp?: number; perSecond?: number; per1m?: number; per5m?: number; per15m?: number }; websocket?: { opened?: number; closed?: number; active?: number; normalCloses?: number; abnormalCloses?: number }; cron?: { fires?: number; errors?: number; active?: number; wrapperActive?: number }; droppedScripts?: number; sinceMs?: number };
}

export interface ExecMonitorGetActiveRequestsResponse {
  statusCode: number;
  message: string;
  data: { count: number; active: { executionId: string; scriptPath: string; hostname?: string; clientIp?: string; method: string; url: string; startedAt: string; duration: number }[] };
}

export interface ListMonitorScriptsResponse {
  statusCode: number;
  message: string;
  data: { count: number; total: number; scripts: ({ scriptPath: string; hostname: string; vmCached: boolean; sharedStateBytes?: number | null; activeHttp: number; activeWs: number; concurrentRunning?: number; http: { total?: number; success?: number; errors?: number; meanDurationMs?: number; p50DurationMs?: number; p95DurationMs?: number; maxDurationMs?: number }; ws: { opened?: number; closed?: number; normalCloses?: number; abnormalCloses?: number; meanSessionMs?: number; maxSessionMs?: number }; recentErrors?: { timestamp: string; statusCode: number; message: string; executionId: string }[]; firstSeenAt: string; lastActivityAt: string })[] };
}

/**
 * Request payload
 */
export type ExecMonitorGetScriptPerformanceRequest = Record<string, unknown>;

export interface ExecMonitorGetScriptPerformanceResponse {
  statusCode: number;
  message: string;
  data: { metrics: { scriptPath?: string; period?: "lifetime"; http?: { total?: number; success?: number; errors?: number; meanDurationMs?: number; p50DurationMs?: number; p95DurationMs?: number; maxDurationMs?: number; recentDurationsMs?: number[] }; ws?: { opened?: number; closed?: number; normalCloses?: number; abnormalCloses?: number; meanSessionMs?: number; maxSessionMs?: number }; activeHttp?: number; activeWs?: number; firstSeenAt?: string; lastActivityAt?: string } };
}

export interface ExecDependenciesListBundledResponse {
  statusCode: number;
  message: string;
  data: { total: number; packages: unknown[]; allAvailable: boolean };
}

export interface ExecDependenciesCheckRequest {
  /** Code */
  code?: string;
  /** Modules */
  modules?: string;
}

export interface ExecDependenciesCheckResponse {
  statusCode: number;
  message: string;
  data: { total: number; installed: unknown[]; missing: unknown[]; message: string } | { total: number; installed: unknown[]; missing: unknown[]; details: unknown[] };
}

export interface ExecDependenciesInstallRequest {
  /** One npm module spec (e.g. `"lodash"`, `"axios@1.2.3"`) or an array of specs. Array form installs every module in sequence. */
  modules: string | string[];
  /** When true, reinstall modules that are already present instead of reporting them as `already-installed`. */
  force?: boolean;
}

export interface ExecDependenciesInstallResponse {
  statusCode: number;
  message: string;
  data: { total: number; installed: number; failed: number; installedModules: string[]; failedModules: string[]; details: Record<string, unknown>[] };
}

export interface ExecSystemRestartServerRequest {
  /** Graceful */
  graceful?: boolean;
  /** Drain Timeout Ms */
  drainTimeoutMs?: number;
  /** Reason */
  reason?: string;
}

export interface ExecSystemGetRestartStatusResponse {
  statusCode: number;
  message: string;
  data: { canRestart: boolean; uptime: number; uptimeFormatted: string; activeRequests: number; active: unknown[]; restartReady: boolean };
}

export interface ExecPackageReadJsonResponse {
  statusCode: number;
  message: string;
  data: { path: string; content: Record<string, unknown>; dependencies: Record<string, unknown>; devDependencies: Record<string, unknown>; scripts: Record<string, unknown>; dependencyCount: number; devDependencyCount: number };
}

export interface ExecPackageUpdateJsonRequest {
  /** Dependencies */
  dependencies?: string;
  /** Scripts */
  scripts?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Remove */
  remove?: string;
}

export interface ExecPackageUpdateJsonResponse {
  message: "package.json updated successfully";
  changes: string[];
  changeCount: number;
  dependencies: Record<string, unknown>;
  statusCode: number;
  data: unknown;
}

export interface ExecPackageInstallRequest {
  /** Packages */
  packages?: unknown[];
  /** Dev */
  dev?: boolean;
  /** Save */
  save?: boolean;
  /** Force */
  force?: boolean;
}

export interface ExecPackageInstallResponse {
  status: "installing";
  command: string;
  message: string;
  statusCode: number;
  data: unknown;
}

/**
 * Request payload
 */
export type ExecPackageCompareRequest = Record<string, unknown>;

export interface ExecPackageCompareResponse {
  statusCode: number;
  message: string;
  data: { summary: { total: number; installed: number; missing: number; outdated: number; extra: number }; missing: string[]; outdated: { package: string; declared: string; installed: string }[]; extra: string[]; allInstalled: boolean; upToDate: boolean };
}

export interface ExecPackagePinVersionsRequest {
  /** Packages */
  packages?: unknown[];
}

export interface ExecPackagePinVersionsResponse {
  statusCode: number;
  message: string;
  data: ({ message: "All dependencies are already pinned to exact versions"; pinned: unknown[]; count: number } & { message: "All dependencies are already pinned to exact versions" }) | ({ message: "Dependencies pinned to exact versions"; pinned: string[]; count: number; dependencies: Record<string, unknown> } & { message: "Dependencies pinned to exact versions" });
}

export interface ExecPackageInitJsonRequest {
  /** Name */
  name?: string;
  /** Version */
  version?: string;
  /** Description */
  description?: string;
  /** Force */
  force?: boolean;
}

export interface ExecPackageInitJsonResponse {
  message: "package.json created successfully";
  path: string;
  content: { name: string; version: string; description: string; main: "src/index.ts"; scripts: { start: "bun src/index.ts"; "compile:modern": "bun build --compile --external=* --outfile bin/hoody-exec src/index.ts"; "build:openapi": "bun run" }; dependencies: {  } };
  created: boolean;
  statusCode: number;
  data: unknown;
}

/**
 * Request payload
 */
export type ExecOpenapiGenerateRequest = Record<string, unknown>;

export interface ExecOpenapiGenerateResponse {
  success: boolean;
  data: Record<string, unknown>;
  meta: { pathCount?: number; scanDirectory?: string; generatedAt?: string };
  statusCode: number;
  message: string;
}

export interface ExecOpenapiListScriptsResponse {
  success: boolean;
  data: { directory: string; totalScripts: number; withSchemas: number; scripts: ({ path: string; routePath: string; hasSchema: boolean; schemaFormat?: string | null; pathParameters?: string[] })[] };
  statusCode: number;
  message: string;
}

/**
 * Request payload
 */
export type ExecOpenapiValidateSchemaRequest = Record<string, unknown>;

export interface ExecOpenapiValidateSchemaResponse {
  success: boolean;
  data: Record<string, unknown> | null;
  errors?: string[];
  statusCode: number;
  message: string;
}

/**
 * Schema file contents (Zod or JSON Schema)
 */
export interface ExecOpenapiServeSchemaResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Generated OpenAPI specification
 */
export interface ExecOpenapiServeResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Request payload
 */
export type ExecOpenapiMergeRequest = Record<string, unknown>;

export interface ExecOpenapiMergeResponse {
  success: boolean;
  data: Record<string, unknown>;
  statusCode: number;
  message: string;
}

export interface ExecSdkImportSDKRequest {
  /** Exec Id */
  execId: string;
  /** Source_url */
  source_url: string;
  /** Source_auth */
  source_auth?: string;
  /** Middleware */
  middleware?: string;
  /** Magic_comments */
  magic_comments?: string;
  /** Force */
  force?: boolean;
}

export interface ExecSdkImportSDKResponse {
  statusCode: number;
  message: string;
  data: { action: "imported"; summary: { new: number; updated: number; conflicts: number; total: number }; sdk: { id: string; source_url: string; path: string; files: { endpoints: number; pre: string; post: string; marker: string } } };
}

export interface ExecSdkListResponse {
  statusCode: number;
  message: string;
  data: { sdks: { id: string; source_url: string; files: number; middleware: { pre: boolean; post: boolean }; marker: string }[]; total: number };
}

export interface ExecSdkGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; type: "sdk"; source_url: string; path: string; marker: string; middleware: { pre: { exists: boolean; path?: string | null; hash?: string | null }; post: { exists: boolean; path?: string | null; hash?: string | null } }; files: { total: number; endpoints: number; list: unknown[] } };
}

export interface ExecSdkDeleteResponse {
  message: "SDK deleted";
  removed: { marker: string; files: number; directory: string };
  statusCode: number;
  data: unknown;
}

export interface ExecIdsListResponse {
  statusCode: number;
  message: string;
  data: { execIds: (({ id: string; type: "sdk"; source_url: string; files: number } & { type: "sdk" }) | ({ id: string; type: "custom"; files: number } & { type: "custom" }))[]; total: number; summary: { sdk: number; custom: number } };
}

export interface ExecMagicGetSchemaResponse {
  statusCode: number;
  message: string;
  data: { schema_version: string; total_fields: number; parse_window_lines: number; unknown_keys_behavior: string; defaults_context: MagicCommentDefaultsContext; source_of_truth: MagicCommentSourceOfTruth; categories: MagicCommentCategories; fields: MagicCommentSchemaField[] };
}

export interface ExecMagicReadResponse {
  statusCode: number;
  message: string;
  data: { path: string; comments: Record<string, unknown> };
}

export interface ExecMagicUpdateHandlerRequest {
  /** Path */
  path: string;
  /** Comments */
  comments?: string;
  /** Dry_run */
  dry_run?: boolean;
}

export interface ExecMagicUpdateHandlerResponse {
  statusCode: number;
  message: string;
  data: ({ dry_run: boolean; path: string; current: Record<string, unknown> | null; proposed: Record<string, unknown> | null; changes: string[]; message: "Preview only - set dry_run=false to apply changes" } & { message: "Preview only - set dry_run=false to apply changes" }) | ({ dry_run: boolean; path: string; previous: Record<string, unknown> | null; updated: Record<string, unknown> | null; message: "Magic comments updated successfully" } & { message: "Magic comments updated successfully" });
}

export interface ExecMagicBulkUpdateRequest {
  /** Directory */
  directory?: string;
  /** Exec Id */
  execId?: string;
  /** Comments */
  comments?: string;
  /** Extension */
  extension?: string;
  /** Recursive */
  recursive?: boolean;
  /** Dry_run */
  dry_run?: boolean;
}

export interface ExecMagicBulkUpdateResponse {
  statusCode: number;
  message: string;
  data: ({ dry_run: boolean; directory: string; execId: string; recursive: boolean; comments: Record<string, unknown> | null; would_affect: { total: number; files: ({ file: string; current: Record<string, unknown> | null; proposed: Record<string, unknown> | null; changes: string[] } | { file: string; error: string })[] }; message: "Preview only - set dry_run=false to apply changes" } & { message: "Preview only - set dry_run=false to apply changes" }) | ({ dry_run: boolean; directory: string; execId: string; recursive: boolean; comments: Record<string, unknown> | null; results: { total: number; updated: number; failed: number; files: { updated: string[]; failed: { file: string; error: string }[] } }; message: "Magic comments updated successfully" } & { message: "Magic comments updated successfully" });
}

export interface TriggerScheduleRequest {
  /** Script path (absolute or relative to scripts-dir) of a script with a valid @schedule directive. */
  scriptPath: string;
  /** When true, bypass the @token refusal. Use with care — this fires the script as cron (no token auth). */
  force?: boolean;
}

export interface TriggerScheduleResponse {
  triggered: boolean;
  scriptPath: string;
  runId: string;
  status: "ok" | "error" | "timeout" | "disabled" | "load_error" | "incompatible" | "skipped_overload" | "stale_generation" | "unregistered" | "scheduler_not_ready";
  durationMs: number;
  error?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Request payload
 */
export interface ReloadSchedulesRequest {
  /** When true, compute the diff against the filesystem but do not apply. Returns the same shape with {added, kept, removed} lists. */
  dry_run?: boolean;
}

export interface ReloadSchedulesResponse {
  statusCode: number;
  message: string;
  data: { dry_run: boolean; added: string[]; kept: string[]; removed: string[]; failed?: { path: string; reason: string }[] };
}

export interface ScheduleHistoryResponse {
  statusCode: number;
  message: string;
  data: { total: number; limit: number; includeRotated: boolean; entries: ({ ts: string; scriptPath: string; expression: string; runId: string; status: "ok" | "error" | "timeout" | "disabled" | "load_error" | "incompatible" | "skipped_overload"; durationMs: number; returnPreview?: string; error?: string })[] };
}

/**
 * Historical record of completed and failed downloads
 */
export interface FilesDownloadsGetHistoryResponse {
  statusCode: number;
  message: string;
  data: { history?: ({ directory?: string; end_time?: number | null; error?: string | null; file_path?: string; filename?: string; id: string; start_time?: number; status?: "completed" | "failed"; total_bytes?: number | null; url?: string })[] };
}

/**
 * Historical record of completed and failed extractions
 */
export interface FilesArchivesGetHistoryResponse {
  statusCode: number;
  message: string;
  data: { history?: ({ archive_path?: string; dest_path?: string; end_time?: number | null; error?: string | null; extracted_bytes?: number; extracted_files?: number; id: string; selective?: boolean; selective_path?: string | null; start_time?: number; status?: "completed" | "failed"; total_bytes?: number; total_files?: number })[] };
}

/**
 * List of currently running archive extractions
 */
export interface FilesArchivesListActiveResponse {
  statusCode: number;
  message: string;
  data: { extractions?: ExtractionProgress[] };
}

export interface FilesBackendsListResponse {
  statusCode: number;
  message: string;
  data: { backends?: { backend_type?: string; connected?: boolean; created_at?: string; id: string; mount_paths?: string[]; server?: string; user?: string }[]; count?: number };
}

/**
 * alias backend configuration
 */
export interface FilesBackendsConnectAliasRequest {
  /** Description of the remote. */
  description?: string;
  /** Remote or path to alias.

Can be "myremote:path/to/dir", "myremote:bucket", "myremote:" or "/local/path". */
  remote: string;
}

export interface FilesBackendsConnectAliasResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * azureblob backend configuration
 */
export interface FilesBackendsConnectAzureblobRequest {
  /** Access tier of blob: hot, cool, cold or archive.

Archived blobs can be restored by setting access tier to hot, cool or
cold. Leave blank if you intend to use default access tier, which is
set at account level

If there is no "access tier" specified, Hoody doesn't apply any tier.
Hoody performs "Set Tier" operation on blobs while uploading, if objects
are not modified, specifying "access tier" to new one will have no effect.
If blobs are in "archive tier" at remote, trying to perform data transfer
operations from remote will not be allowed. User should first restore by
tiering blob to "Hot", "Cool" or "Cold". */
  access_tier?: string;
  /** Azure Storage Account Name.

Set this to the Azure Storage Account Name in use.

Leave blank to use SAS URL or Emulator, otherwise it needs to be set.

If this is blank and if env_auth is set it will be read from the
environment variable `AZURE_STORAGE_ACCOUNT_NAME` if possible. */
  account?: string;
  /** Delete archive tier blobs before overwriting.

Archive tier blobs cannot be updated. So without this flag, if you
attempt to update an archive tier blob, then Hoody will produce the
error:

 can't update archive tier blob without --azureblob-archive-tier-delete

With this flag set then before Hoody attempts to overwrite an archive
tier blob, it will delete the existing blob before uploading its
replacement. This has the potential for data loss if the upload fails
(unlike updating a normal blob) and also may cost more since deleting
archive tier blobs early may be chargable. */
  archive_tier_delete?: boolean;
  /** Upload chunk size.

Note that this is stored in memory and there may be up to
"--transfers" * "--azureblob-upload-concurrency" chunks stored at once
in memory. */
  chunk_size?: string;
  /** Password for the certificate file (optional).

Optionally set this if using
- Service principal with certificate

And the certificate has a password. */
  client_certificate_password?: string;
  /** Path to a PEM or PKCS12 certificate file including the private key.

Set this if using
- Service principal with certificate */
  client_certificate_path?: string;
  /** The ID of the client in use.

Set this if using
- Service principal with client secret
- Service principal with certificate
- User with username and password */
  client_id?: string;
  /** One of the service principal's client secrets

Set this if using
- Service principal with client secret */
  client_secret?: string;
  /** Send the certificate chain when using certificate auth.

Specifies whether an authentication request will include an x5c header
to support subject name / issuer based authentication. When set to
true, authentication requests include the x5c header.

Optionally set this if using
- Service principal with certificate */
  client_send_certificate_chain?: boolean;
  /** Set to specify how to deal with snapshots on blob deletion. */
  delete_snapshots?: "" | "include" | "only";
  /** Description of the remote. */
  description?: string;
  /** Upload an empty object with a trailing slash when a new directory is created

Empty folders are unsupported for bucket based remotes, this option
creates an empty object ending with "/", to persist the folder.

This object also has the metadata "hdi_isfolder = true" to conform to
the Microsoft standard. */
  directory_markers?: boolean;
  /** Don't store MD5 checksum with object metadata.

Normally Hoody will calculate the MD5 checksum of the input before
uploading it so it can add it to metadata on the object. This is great
for data integrity checking but can cause long delays for large files
to start uploading. */
  disable_checksum?: boolean;
  /** Skip requesting Microsoft Entra instance metadata

This should be set true only by applications authenticating in
disconnected clouds, or private clouds such as Azure Stack.

It determines whether Hoody requests Microsoft Entra instance
metadata from `https://login.microsoft.com/` before
authenticating.

Setting this to true will skip this request, making you responsible
for ensuring the configured authority is valid and trustworthy. */
  disable_instance_discovery?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for the service.

Leave blank normally. */
  endpoint?: string;
  /** Read credentials from runtime (environment variables, CLI or MSI).

See the [authentication docs](/azureblob#authentication) for full info. */
  env_auth?: boolean;
  /** Storage Account Shared Key.

Leave blank to use SAS URL or Emulator. */
  key?: string;
  /** Size of blob list.

This sets the number of blobs requested in each listing chunk. Default
is the maximum, 5000. "List blobs" requests are permitted 2 minutes
per megabyte to complete. If an operation is taking longer than 2
minutes per megabyte on average, it will time out (
[source](https://docs.microsoft.com/en-us/rest/api/storageservices/setting-timeouts-for-blob-service-operations#exceptions-to-default-timeout-interval)
). This can be used to limit the number of blobs items to return, to
avoid the time out. */
  list_chunk?: number;
  /** How often internal memory buffer pools will be flushed. (no longer used) (in seconds) */
  memory_pool_flush_time?: number;
  /** Whether to use mmap buffers in internal memory pool. (no longer used) */
  memory_pool_use_mmap?: boolean;
  /** Object ID of the user-assigned MSI to use, if any.

Leave blank if msi_object_id or msi_mi_res_id specified. */
  msi_client_id?: string;
  /** Azure resource ID of the user-assigned MSI to use, if any.

Leave blank if msi_client_id or msi_object_id specified. */
  msi_mi_res_id?: string;
  /** Object ID of the user-assigned MSI to use, if any.

Leave blank if msi_client_id or msi_mi_res_id specified. */
  msi_object_id?: string;
  /** If set, don't attempt to check the container exists or create it.

This can be useful when trying to minimise the number of transactions
Hoody does if you know the container exists already. */
  no_check_container?: boolean;
  /** If set, do not do HEAD before GET when getting objects. */
  no_head_object?: boolean;
  /** The user's password

Set this if using
- User with username and password */
  password?: string;
  /** Public access level of a container: blob or container. */
  public_access?: "" | "blob" | "container";
  /** SAS URL for container level access only.

Leave blank if using account/key or Emulator. */
  sas_url?: string;
  /** Path to file containing credentials for use with a service principal.

Leave blank normally. Needed only if you want to use a service principal instead of interactive login.

 $ az ad sp create-for-rbac --name "<name>" \
 --role "Storage Blob Data Owner" \
 --scopes "/subscriptions/<subscription>/resourceGroups/<resource-group>/providers/Microsoft.Storage/storageAccounts/<storage-account>/blobServices/default/containers/<container>" \
 > azure-principal.json

See ["Create an Azure service principal"](https://docs.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli) and ["Assign an Azure role for access to blob data"](https://docs.microsoft.com/en-us/azure/storage/common/storage-auth-aad-rbac-cli) pages for more details.

It may be more convenient to put the credentials directly into the
Hoody config file under the `client_id`, `tenant` and `client_secret`
keys instead of setting `service_principal_file`. */
  service_principal_file?: string;
  /** ID of the service principal's tenant. Also called its directory ID.

Set this if using
- Service principal with client secret
- Service principal with certificate
- User with username and password */
  tenant?: string;
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently.

If you are uploading small numbers of large files over high-speed
links and these uploads do not fully utilize your bandwidth, then
increasing this may help to speed up the transfers.

In tests, upload speed increases almost linearly with upload
concurrency. For example to fill a gigabit pipe it may be necessary to
raise this to 64. Note that this will use more memory.

Note that chunks are stored in memory and there may be up to
"--transfers" * "--azureblob-upload-concurrency" chunks stored at once
in memory. */
  upload_concurrency?: number;
  /** Cutoff for switching to chunked upload (<= 256 MiB) (deprecated). */
  upload_cutoff?: string;
  /** Use Azure CLI tool az for authentication

Set to use the [Azure CLI tool az](https://learn.microsoft.com/en-us/cli/azure/)
as the sole means of authentication.

Setting this can be useful if you wish to use the az CLI on a host with
a System Managed Identity that you do not want to use.

Don't set env_auth at the same time. */
  use_az?: boolean;
  /** Uses local storage emulator if provided as 'true'.

Leave blank if using real azure storage endpoint. */
  use_emulator?: boolean;
  /** Use a managed service identity to authenticate (only works in Azure).

When true, use a [managed service identity](https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)
to authenticate to Azure Storage instead of a SAS token or account key.

If the VM(SS) on which this program is running has a system-assigned identity, it will
be used by default. If the resource has no system-assigned but exactly one user-assigned identity,
the user-assigned identity will be used by default. If the resource has multiple user-assigned
identities, the identity to use must be explicitly specified using exactly one of the msi_object_id,
msi_client_id, or msi_mi_res_id parameters. */
  use_msi?: boolean;
  /** User name (usually an email address)

Set this if using
- User with username and password */
  username?: string;
}

export interface FilesBackendsConnectAzureblobResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * azurefiles backend configuration
 */
export interface FilesBackendsConnectAzurefilesRequest {
  /** Azure Storage Account Name.

Set this to the Azure Storage Account Name in use.

Leave blank to use SAS URL or connection string, otherwise it needs to be set.

If this is blank and if env_auth is set it will be read from the
environment variable `AZURE_STORAGE_ACCOUNT_NAME` if possible. */
  account?: string;
  /** Upload chunk size.

Note that this is stored in memory and there may be up to
"--transfers" * "--azurefile-upload-concurrency" chunks stored at once
in memory. */
  chunk_size?: string;
  /** Password for the certificate file (optional).

Optionally set this if using
- Service principal with certificate

And the certificate has a password. */
  client_certificate_password?: string;
  /** Path to a PEM or PKCS12 certificate file including the private key.

Set this if using
- Service principal with certificate */
  client_certificate_path?: string;
  /** The ID of the client in use.

Set this if using
- Service principal with client secret
- Service principal with certificate
- User with username and password */
  client_id?: string;
  /** One of the service principal's client secrets

Set this if using
- Service principal with client secret */
  client_secret?: string;
  /** Send the certificate chain when using certificate auth.

Specifies whether an authentication request will include an x5c header
to support subject name / issuer based authentication. When set to
true, authentication requests include the x5c header.

Optionally set this if using
- Service principal with certificate */
  client_send_certificate_chain?: boolean;
  /** Azure Files Connection String. */
  connection_string?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for the service.

Leave blank normally. */
  endpoint?: string;
  /** Read credentials from runtime (environment variables, CLI or MSI).

See the [authentication docs](/azurefiles#authentication) for full info. */
  env_auth?: boolean;
  /** Storage Account Shared Key.

Leave blank to use SAS URL or connection string. */
  key?: string;
  /** Max size for streamed files.

Azure files needs to know in advance how big the file will be. When
Hoody doesn't know it uses this value instead.

This will be used when Hoody is streaming data, the most common uses are:

- Uploading files with `--vfs-cache-mode off` with `Hoody mount`
- Using `Hoody rcat`
- Copying files with unknown length

You will need this much free space in the share as the file will be this size temporarily. */
  max_stream_size?: string;
  /** Object ID of the user-assigned MSI to use, if any.

Leave blank if msi_object_id or msi_mi_res_id specified. */
  msi_client_id?: string;
  /** Azure resource ID of the user-assigned MSI to use, if any.

Leave blank if msi_client_id or msi_object_id specified. */
  msi_mi_res_id?: string;
  /** Object ID of the user-assigned MSI to use, if any.

Leave blank if msi_client_id or msi_mi_res_id specified. */
  msi_object_id?: string;
  /** The user's password

Set this if using
- User with username and password */
  password?: string;
  /** SAS URL.

Leave blank if using account/key or connection string. */
  sas_url?: string;
  /** Path to file containing credentials for use with a service principal.

Leave blank normally. Needed only if you want to use a service principal instead of interactive login.

 $ az ad sp create-for-rbac --name "<name>" \
 --role "Storage Files Data Owner" \
 --scopes "/subscriptions/<subscription>/resourceGroups/<resource-group>/providers/Microsoft.Storage/storageAccounts/<storage-account>/blobServices/default/containers/<container>" \
 > azure-principal.json

See ["Create an Azure service principal"](https://docs.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli) and ["Assign an Azure role for access to files data"](https://docs.microsoft.com/en-us/azure/storage/common/storage-auth-aad-rbac-cli) pages for more details.

**NB** this section needs updating for Azure Files - pull requests appreciated!

It may be more convenient to put the credentials directly into the
Hoody config file under the `client_id`, `tenant` and `client_secret`
keys instead of setting `service_principal_file`. */
  service_principal_file?: string;
  /** Azure Files Share Name.

This is required and is the name of the share to access. */
  share_name?: string;
  /** ID of the service principal's tenant. Also called its directory ID.

Set this if using
- Service principal with client secret
- Service principal with certificate
- User with username and password */
  tenant?: string;
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently.

If you are uploading small numbers of large files over high-speed
links and these uploads do not fully utilize your bandwidth, then
increasing this may help to speed up the transfers.

Note that chunks are stored in memory and there may be up to
"--transfers" * "--azurefile-upload-concurrency" chunks stored at once
in memory. */
  upload_concurrency?: number;
  /** Use a managed service identity to authenticate (only works in Azure).

When true, use a [managed service identity](https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)
to authenticate to Azure Storage instead of a SAS token or account key.

If the VM(SS) on which this program is running has a system-assigned identity, it will
be used by default. If the resource has no system-assigned but exactly one user-assigned identity,
the user-assigned identity will be used by default. If the resource has multiple user-assigned
identities, the identity to use must be explicitly specified using exactly one of the msi_object_id,
msi_client_id, or msi_mi_res_id parameters. */
  use_msi?: boolean;
  /** User name (usually an email address)

Set this if using
- User with username and password */
  username?: string;
}

export interface FilesBackendsConnectAzurefilesResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * b2 backend configuration
 */
export interface FilesBackendsConnectB2Request {
  /** Account ID or Application Key ID. */
  account: string;
  /** Upload chunk size.

When uploading large files, chunk the file into this size.

Must fit in memory. These chunks are buffered in memory and there
might a maximum of "--transfers" chunks in progress at once.

5,000,000 Bytes is the minimum size. */
  chunk_size?: string;
  /** Cutoff for switching to multipart copy.

Any files larger than this that need to be server-side copied will be
copied in chunks of this size.

The minimum is 0 and the maximum is 4.6 GiB. */
  copy_cutoff?: string;
  /** Description of the remote. */
  description?: string;
  /** Disable checksums for large (> upload cutoff) files.

Normally Hoody will calculate the SHA1 checksum of the input before
uploading it so it can add it to metadata on the object. This is great
for data integrity checking but can cause long delays for large files
to start uploading. */
  disable_checksum?: boolean;
  /** Time before the public link authorization token will expire in s or suffix ms|s|m|h|d.

This is used in combination with "Hoody link" for making files
accessible to the public and sets the duration before the download
authorization token will expire.

The minimum value is 1 second. The maximum value is one week. */
  download_auth_duration?: number;
  /** Custom endpoint for downloads.

This is usually set to a Cloudflare CDN URL as Backblaze offers
free egress for data downloaded through the Cloudflare network.
Hoody-VFS works with private buckets by sending an "Authorization" header.
If the custom endpoint rewrites the requests for authentication,
e.g., in Cloudflare Workers, this header needs to be handled properly.
Leave blank if you want to use the endpoint provided by Backblaze.

The URL provided here SHOULD have the protocol and SHOULD NOT have
a trailing slash or specify the /file/bucket subpath as Hoody will
request files with "{download_url}/file/{bucket_name}/{path}".

Example:
> https://mysubdomain.mydomain.tld
(No trailing "/", "file" or "bucket") */
  download_url?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for the service.

Leave blank normally. */
  endpoint?: string;
  /** Permanently delete files on remote removal, otherwise hide files. */
  hard_delete?: boolean;
  /** Application Key. */
  key: string;
  /** Set the number of days deleted files should be kept when creating a bucket.

On bucket creation, this parameter is used to create a lifecycle rule
for the entire bucket.

If lifecycle is 0 (the default) it does not create a lifecycle rule so
the default B2 behaviour applies. This is to create versions of files
on delete and overwrite and to keep them indefinitely.

If lifecycle is >0 then it creates a single rule setting the number of
days before a file that is deleted or overwritten is deleted
permanently. This is known as daysFromHidingToDeleting in the b2 docs.

The minimum value for this parameter is 1 day.

You can also enable hard_delete in the config also which will mean
deletions won't cause versions but overwrites will still cause
versions to be made.

See: [Hoody backend lifecycle](#lifecycle) for setting lifecycles after bucket creation. */
  lifecycle?: number;
  /** How often internal memory buffer pools will be flushed. (no longer used) (in seconds) */
  memory_pool_flush_time?: number;
  /** Whether to use mmap buffers in internal memory pool. (no longer used) */
  memory_pool_use_mmap?: boolean;
  /** A flag string for X-Bz-Test-Mode header for debugging.

This is for debugging purposes only. Setting it to one of the strings
below will cause b2 to return specific errors:

 * "fail_some_uploads"
 * "expire_some_account_authorization_tokens"
 * "force_cap_exceeded"

These will be set in the "X-Bz-Test-Mode" header which is documented
in the [b2 integrations checklist](https://www.backblaze.com/docs/cloud-storage-integration-checklist). */
  test_mode?: string;
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently.

Note that chunks are stored in memory and there may be up to
"--transfers" * "--b2-upload-concurrency" chunks stored at once
in memory. */
  upload_concurrency?: number;
  /** Cutoff for switching to chunked upload.

Files above this size will be uploaded in chunks of "--b2-chunk-size".

This value should be set no larger than 4.657 GiB (== 5 GB). */
  upload_cutoff?: string;
  /** Show file versions as they were at the specified time.

Note that when using this no file write operations are permitted,
so you can't upload files or delete them. */
  version_at?: string;
  /** Include old versions in directory listings.

Note that when using this no file write operations are permitted,
so you can't upload files or delete them. */
  versions?: boolean;
}

export interface FilesBackendsConnectB2Response {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * box backend configuration
 */
export interface FilesBackendsConnectBoxRequest {
  /** Box App Primary Access Token

Leave blank normally. */
  access_token?: string;
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Box App config.json location

Leave blank normally.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  box_config_file?: string;
  box_sub_type?: "user" | "enterprise";
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Max number of times to try committing a multipart file. */
  commit_retries?: number;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Impersonate this user ID when using a service account.

Setting this flag allows Hoody, when using a JWT service account, to
act on behalf of another user by setting the as-user header.

The user ID is the Box identifier for a user. User IDs can found for
any user via the GET /users endpoint, which is only available to
admins, or by calling the GET /users/me endpoint with an authenticated
user session.

See: https://developer.box.com/guides/authentication/jwt/as-user/ */
  impersonate?: string;
  /** Size of listing chunk 1-1000. */
  list_chunk?: number;
  /** Only show items owned by the login (email address) passed in. */
  owned_by?: string;
  /** Fill in for Hoody to use a non root folder as its starting point. */
  root_folder_id?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Cutoff for switching to multipart upload (>= 50 MiB). */
  upload_cutoff?: string;
}

export interface FilesBackendsConnectBoxResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * cache backend configuration
 */
export interface FilesBackendsConnectCacheRequest {
  /** How often should the cache perform cleanups of the chunk storage.

The default value should be ok for most people. If you find that the
cache goes over "cache-chunk-total-size" too often then try to lower
this value to force it to perform cleanups more often. (in seconds) */
  chunk_clean_interval?: number;
  /** Disable the in-memory cache for storing chunks during streaming.

By default, cache will keep file data during streaming in RAM as well
to provide it to readers as fast as possible.

This transient data is evicted as soon as it is read and the number of
chunks stored doesn't exceed the number of workers. However, depending
on other settings like "cache-chunk-size" and "cache-workers" this footprint
can increase if there are parallel streams too (multiple files being read
at the same time).

If the hardware permits it, use this feature to provide an overall better
performance during streaming but it can also be disabled if RAM is not
available on the local machine. */
  chunk_no_memory?: boolean;
  /** Directory to cache chunk files.

Path to where partial file data (chunks) are stored locally. The remote
name is appended to the final path.

This config follows the "--cache-db-path". If you specify a custom
location for "--cache-db-path" and don't specify one for "--cache-chunk-path"
then "--cache-chunk-path" will use the same path as "--cache-db-path". */
  chunk_path?: string;
  /** The size of a chunk (partial file data).

Use lower numbers for slower connections. If the chunk size is
changed, any downloaded chunks will be invalid and cache-chunk-path
will need to be cleared or unexpected EOF errors will occur. */
  chunk_size?: "1M" | "5M" | "10M";
  /** The total size that the chunks can take up on the local disk.

If the cache exceeds this value then it will start to delete the
oldest chunks until it goes under this value. */
  chunk_total_size?: "500M" | "1G" | "10G";
  /** Directory to store file structure metadata DB.

The remote name is used as the DB file name. */
  db_path?: string;
  /** Clear all the cached data for this remote on start. */
  db_purge?: boolean;
  /** How long to wait for the DB to be available - 0 is unlimited.

Only one process can have the DB open at any one time, so Hoody waits
for this duration for the DB to become available before it gives an
error.

If you set it to 0 then it will wait forever. (in seconds) */
  db_wait_time?: number;
  /** Description of the remote. */
  description?: string;
  /** How long to cache file structure information (directory listings, file size, times, etc.). 
If all write operations are done through the cache then you can safely make
this value very large as the cache store will also be updated in real time. (in seconds) */
  info_age?: number;
  /** Skip all certificate verification when connecting to the Plex server. */
  plex_insecure?: string;
  /** The password of the Plex user. */
  plex_password?: string;
  /** The plex token for authentication - auto set normally. */
  plex_token?: string;
  /** The URL of the Plex server. */
  plex_url?: string;
  /** The username of the Plex user. */
  plex_username?: string;
  /** How many times to retry a read from a cache storage.

Since reading from a cache stream is independent from downloading file
data, readers can get to a point where there's no more data in the
cache. Most of the times this can indicate a connectivity issue if
cache isn't able to provide file data anymore.

For really slow connections, increase this to a point where the stream is
able to provide data but your experience will be very stuttering. */
  read_retries?: number;
  /** Remote to cache.

Normally should contain a ':' and a path, e.g. "myremote:path/to/dir",
"myremote:bucket" or maybe "myremote:" (not recommended). */
  remote: string;
  /** Limits the number of requests per second to the source FS (-1 to disable).

This setting places a hard limit on the number of requests per second
that cache will be doing to the cloud provider remote and try to
respect that value by setting waits between reads.

If you find that you're getting banned or limited on the cloud
provider through cache and know that a smaller number of requests per
second will allow you to work with it then you can use this setting
for that.

A good balance of all the other settings should make this setting
useless but it is available to set for more special cases.

**NOTE**: This will limit the number of requests during streams but
other API calls to the cloud provider like directory listings will
still pass. */
  rps?: number;
  /** Directory to keep temporary files until they are uploaded.

This is the path where cache will use as a temporary storage for new
files that need to be uploaded to the cloud provider.

Specifying a value will enable this feature. Without it, it is
completely disabled and files will be uploaded directly to the cloud
provider */
  tmp_upload_path?: string;
  /** How long should files be stored in local cache before being uploaded.

This is the duration that a file must wait in the temporary location
_cache-tmp-upload-path_ before it is selected for upload.

Note that only one file is uploaded at a time and it can take longer
to start the upload if a queue formed for this purpose. (in seconds) */
  tmp_wait_time?: number;
  /** How many workers should run in parallel to download chunks.

Higher values will mean more parallel processing (better CPU needed)
and more concurrent requests on the cloud provider. This impacts
several aspects like the cloud provider API limits, more stress on the
hardware that Hoody runs on but it also means that streams will be
more fluid and data will be available much more faster to readers.

**Note**: If the optional Plex integration is enabled then this
setting will adapt to the type of reading performed and the value
specified here will be used as a maximum number of workers to use. */
  workers?: number;
  /** Cache file data on writes through the FS.

If you need to read files immediately after you upload them through
cache you can enable this flag to have their data stored in the
cache store at the same time during upload. */
  writes?: boolean;
}

export interface FilesBackendsConnectCacheResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * chunker backend configuration
 */
export interface FilesBackendsConnectChunkerRequest {
  /** Files larger than chunk size will be split in chunks. */
  chunk_size?: string;
  /** Description of the remote. */
  description?: string;
  /** Choose how chunker should handle files with missing or invalid chunks. */
  fail_hard?: boolean;
  /** Choose how chunker handles hash sums.

All modes but "none" require metadata. */
  hash_type?: "none" | "md5" | "sha1" | "md5all" | "sha1all" | "md5quick" | "sha1quick";
  /** Format of the metadata object or "none".

By default "simplejson".
Metadata is a small JSON file named after the composite file. */
  meta_format?: "none" | "simplejson";
  /** String format of chunk file names.

The two placeholders are: base file name (*) and chunk number (#...).
There must be one and only one asterisk and one or more consecutive hash characters.
If chunk number has less digits than the number of hashes, it is left-padded by zeros.
If there are more digits in the number, they are left as is.
Possible chunk files are ignored if their name does not match given format. */
  name_format?: string;
  /** Remote to chunk/unchunk.

Normally should contain a ':' and a path, e.g. "myremote:path/to/dir",
"myremote:bucket" or maybe "myremote:" (not recommended). */
  remote: string;
  /** Minimum valid chunk number. Usually 0 or 1.

By default chunk numbers start from 1. */
  start_from?: number;
  /** Choose how chunker should handle temporary files during transactions. */
  transactions?: "rename" | "norename" | "auto";
}

export interface FilesBackendsConnectChunkerResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * cloudinary backend configuration
 */
export interface FilesBackendsConnectCloudinaryRequest {
  /** Cloudinary API Key */
  api_key: string;
  /** Cloudinary API Secret */
  api_secret: string;
  /** Cloudinary Environment Name */
  cloud_name: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Wait N seconds for eventual consistency of the databases that support the backend operation */
  eventually_consistent_delay?: number;
  /** Specify the API endpoint for environments out of the US */
  upload_prefix?: string;
  /** Upload Preset to select asset manipulation on upload */
  upload_preset?: string;
}

export interface FilesBackendsConnectCloudinaryResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * combine backend configuration
 */
export interface FilesBackendsConnectCombineRequest {
  /** Description of the remote. */
  description?: string;
  /** Upstreams for combining

These should be in the form

 dir=remote:path dir2=remote2:path

Where before the = is specified the root directory and after is the remote to
put there.

Embedded spaces can be added using quotes

 "dir=remote:path with space" "dir2=remote2:path with space" */
  upstreams: string;
}

export interface FilesBackendsConnectCombineResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * compress backend configuration
 */
export interface FilesBackendsConnectCompressRequest {
  /** Description of the remote. */
  description?: string;
  /** GZIP compression level (-2 to 9).

Generally -1 (default, equivalent to 5) is recommended.
Levels 1 to 9 increase compression at the cost of speed. Going past 6 
generally offers very little return.

Level -2 uses Huffman encoding only. Only use if you know what you
are doing.
Level 0 turns off compression. */
  level?: number;
  /** Compression mode. */
  mode?: "gzip";
  /** Some remotes don't allow the upload of files with unknown size.
In this case the compressed file will need to be cached to determine
it's size.

Files smaller than this limit will be cached in RAM, files larger than 
this limit will be cached on disk. */
  ram_cache_limit?: string;
  /** Remote to compress. */
  remote: string;
}

export interface FilesBackendsConnectCompressResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * crypt backend configuration
 */
export interface FilesBackendsConnectCryptRequest {
  /** Description of the remote. */
  description?: string;
  /** Option to either encrypt directory names or leave them intact.

NB If filename_encryption is "off" then this option will do nothing. */
  directory_name_encryption?: boolean;
  /** How to encode the encrypted filename to text string.

This option could help with shortening the encrypted filename. The 
suitable option would depend on the way your remote count the filename
length and if it's case sensitive. */
  filename_encoding?: "base32" | "base64" | "base32768";
  /** How to encrypt the filenames. */
  filename_encryption?: "standard" | "obfuscate" | "off";
  /** Option to either encrypt file data or leave it unencrypted. */
  no_data_encryption?: boolean;
  /** If set this will pass bad blocks through as all 0.

This should not be set in normal operation, it should only be set if
trying to recover an encrypted file with errors and it is desired to
recover as much of the file as possible. */
  pass_bad_blocks?: boolean;
  /** Password or pass phrase for encryption. */
  password: string;
  /** Password or pass phrase for salt.

Optional but recommended.
Should be different to the previous password. */
  password2?: string;
  /** Remote to encrypt/decrypt.

Normally should contain a ':' and a path, e.g. "myremote:path/to/dir",
"myremote:bucket" or maybe "myremote:" (not recommended). */
  remote: string;
  /** Deprecated: use --server-side-across-configs instead.

Allow server-side operations (e.g. copy) to work across different crypt configs.

Normally this option is not what you want, but if you have two crypts
pointing to the same backend you can use it.

This can be used, for example, to change file name encryption type
without re-uploading all the data. Just make two crypt backends
pointing to two different directories with the single changed
parameter and use Hoody move to move the files between the crypt
remotes. */
  server_side_across_configs?: boolean;
  /** For all files listed show how the names encrypt.

If this flag is set then for each file that the remote is asked to
list, it will log (at level INFO) a line stating the decrypted file
name and the encrypted file name.

This is so you can work out which encrypted names are which decrypted
names just in case you need to do something with the encrypted file
names, or for debugging purposes. */
  show_mapping?: boolean;
  /** If set, this will raise an error when crypt comes across a filename that can't be decrypted.

(By default, Hoody will just log a NOTICE and continue as normal.)
This can happen if encrypted and unencrypted files are stored in the same
directory (which is not recommended.) It may also indicate a more serious
problem that should be investigated. */
  strict_names?: boolean;
  /** If this is set it will override the default suffix of ".bin".

Setting suffix to "none" will result in an empty suffix. This may be useful 
when the path length is critical. */
  suffix?: string;
}

export interface FilesBackendsConnectCryptResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * drive backend configuration
 */
export interface FilesBackendsConnectDriveRequest {
  /** Set to allow files which return cannotDownloadAbusiveFile to be downloaded.

If downloading a file returns the error "This file has been identified
as malware or spam and cannot be downloaded" with the error code
"cannotDownloadAbusiveFile" then supply this flag to Hoody to
indicate you acknowledge the risks of downloading the file and Hoody
will download it anyway.

Note that if you are using service account it will need Manager
permission (not Content Manager) to for this flag to work. If the SA
does not have the right permission, Google will just ignore the flag. */
  acknowledge_abuse?: boolean;
  /** Allow the filetype to change when uploading Google docs.

E.g. file.doc to file.docx. This will confuse sync and reupload every time. */
  allow_import_name_change?: boolean;
  /** Deprecated: No longer needed. */
  alternate_export?: boolean;
  /** Only consider files owned by the authenticated user. */
  auth_owner_only?: boolean;
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Upload chunk size.

Must a power of 2 >= 256k.

Making this larger will improve performance, but note that each chunk
is buffered in memory one per transfer.

Reducing this will reduce memory usage but decrease performance. */
  chunk_size?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** Google Application Client Id
Setting your own is recommended.
If you leave this blank, it will use an internal key which is low performance. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Server side copy contents of shortcuts instead of the shortcut.

When doing server side copies, normally Hoody will copy shortcuts as
shortcuts.

If this flag is used then Hoody will copy the contents of shortcuts
rather than shortcuts themselves when doing server side copies. */
  copy_shortcut_content?: boolean;
  /** Description of the remote. */
  description?: string;
  /** Disable drive using http2.

There is currently an unsolved issue with the google drive backend and
HTTP/2. HTTP/2 is therefore disabled by default for the drive backend
but can be re-enabled here. When the issue is solved this flag will
be removed.

See: https://github.com/Hoody/Hoody/issues/3631 */
  disable_http2?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Get IAM credentials from runtime (environment variables or instance meta data if no env vars).

Only applies if service_account_file and service_account_credentials is blank. */
  env_auth?: boolean;
  /** Comma separated list of preferred formats for downloading Google docs. */
  export_formats?: string;
  /** Work around a bug in Google Drive listing.

Normally Hoody will work around a bug in Google Drive when using
--fast-list (ListR) where the search "(A in parents) or (B in
parents)" returns nothing sometimes. See #3114, #4289 and
https://issuetracker.google.com/issues/149522397

Hoody-VFS detects this by finding no items in more than one directory
when listing and retries them as lists of individual directories.

This means that if you have a lot of empty directories Hoody will end
up listing them all individually and this can take many more API
calls.

This flag allows the work-around to be disabled. This is **not**
recommended in normal use - only if you have a particular case you are
having trouble with like many empty directories. */
  fast_list_bug_fix?: boolean;
  /** Deprecated: See export_formats. */
  formats?: string;
  /** Impersonate this user when using a service account. */
  impersonate?: string;
  /** Comma separated list of preferred formats for uploading Google docs. */
  import_formats?: string;
  /** Keep new head revision of each file forever. */
  keep_revision_forever?: boolean;
  /** Size of listing chunk 100-1000, 0 to disable. */
  list_chunk?: number;
  /** Control whether labels should be read or written in metadata.

Reading labels metadata from files takes an extra API transaction and
will slow down listings. It isn't always desirable to set the labels
from the metadata.

The format of labels is documented in the drive API documentation at
https://developers.google.com/drive/api/reference/rest/v3/Label -
Hoody just provides a JSON dump of this format.

When setting labels, the label and fields must already exist - Hoody
will not create them. This means that if you are transferring labels
from two different accounts you will have to create the labels in
advance and use the metadata mapper to translate the IDs between the
two accounts. */
  metadata_labels?: "off" | "read" | "write" | "failok" | "read,write";
  /** Control whether owner should be read or written in metadata.

Owner is a standard part of the file metadata so is easy to read. But it
isn't always desirable to set the owner from the metadata.

Note that you can't set the owner on Shared Drives, and that setting
ownership will generate an email to the new owner (this can't be
disabled), and you can't transfer ownership to someone outside your
organization. */
  metadata_owner?: "off" | "read" | "write" | "failok" | "read,write";
  /** Control whether permissions should be read or written in metadata.

Reading permissions metadata from files can be done quickly, but it
isn't always desirable to set the permissions from the metadata.

Note that Hoody drops any inherited permissions on Shared Drives and
any owner permission on My Drives as these are duplicated in the owner
metadata. */
  metadata_permissions?: "off" | "read" | "write" | "failok" | "read,write";
  /** Number of API calls to allow without sleeping. */
  pacer_burst?: number;
  /** Minimum time to sleep between API calls. (in seconds) */
  pacer_min_sleep?: number;
  /** Resource key for accessing a link-shared file.

If you need to access files shared with a link like this

 https://drive.google.com/drive/folders/XXX?resourcekey=YYY&usp=sharing

Then you will need to use the first part "XXX" as the "root_folder_id"
and the second part "YYY" as the "resource_key" otherwise you will get
404 not found errors when trying to access the directory.

See: https://developers.google.com/drive/api/guides/resource-keys

This resource key requirement only applies to a subset of old files.

Note also that opening the folder once in the web interface (with the
user you've authenticated Hoody with) seems to be enough so that the
resource key is not needed. */
  resource_key?: string;
  /** ID of the root folder.
Leave blank normally.

Fill in to access "Computers" folders (see docs), or for Hoody to use
a non root folder as its starting point. */
  root_folder_id?: string;
  /** Comma separated list of scopes that Hoody should use when requesting access from drive. */
  scope?: "drive" | "drive.readonly" | "drive.file" | "drive.appfolder" | "drive.metadata.readonly";
  /** Deprecated: use --server-side-across-configs instead.

Allow server-side operations (e.g. copy) to work across different drive configs.

This can be useful if you wish to do a server-side copy between two
different Google drives. Note that this isn't enabled by default
because it isn't easy to tell if it will work between any two
configurations. */
  server_side_across_configs?: boolean;
  /** Service Account Credentials JSON blob.

Leave blank normally.
Needed only if you want use SA instead of interactive login. */
  service_account_credentials?: string;
  /** Service Account Credentials JSON file path.

Leave blank normally.
Needed only if you want use SA instead of interactive login.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  service_account_file?: string;
  /** Only show files that are shared with me.

Instructs Hoody to operate on your "Shared with me" folder (where
Google Drive lets you access the files and folders others have shared
with you).

This works both with the "list" (lsd, lsl, etc.) and the "copy"
commands (copy, sync, etc.), and with all other commands too. */
  shared_with_me?: boolean;
  /** Show all Google Docs including non-exportable ones in listings.

If you try a server side copy on a Google Form without this flag, you
will get this error:

 No export formats found for "application/vnd.google-apps.form"

However adding this flag will allow the form to be server side copied.

Note that Hoody doesn't add extensions to the Google Docs file names
in this mode.

Do **not** use this flag when trying to download Google Docs - Hoody
will fail to download them. */
  show_all_gdocs?: boolean;
  /** Show sizes as storage quota usage, not actual size.

Show the size of a file as the storage quota used. This is the
current version plus any older versions that have been set to keep
forever.

**WARNING**: This flag may have some unexpected consequences.

It is not recommended to set this flag in your config - the
recommended usage is using the flag form --drive-size-as-quota when
doing Hoody ls/lsl/lsf/lsjson/etc only.

If you do use this flag for syncing (not recommended) then you will
need to use --ignore size also. */
  size_as_quota?: boolean;
  /** Skip checksums on Google photos and videos only.

Use this if you get checksum errors when transferring Google photos or
videos.

Setting this flag will cause Google photos and videos to return a
blank checksums.

Google photos are identified by being in the "photos" space.

Corrupted checksums are caused by Google modifying the image/video but
not updating the checksum. */
  skip_checksum_gphotos?: boolean;
  /** If set skip dangling shortcut files.

If this is set then Hoody will not show any dangling shortcuts in listings. */
  skip_dangling_shortcuts?: boolean;
  /** Skip google documents in all listings.

If given, gdocs practically become invisible to Hoody. */
  skip_gdocs?: boolean;
  /** If set skip shortcut files.

Normally Hoody dereferences shortcut files making them appear as if
they are the original file (see [the shortcuts section](#shortcuts)).
If this flag is set then Hoody will ignore shortcut files completely. */
  skip_shortcuts?: boolean;
  /** Only show files that are starred. */
  starred_only?: boolean;
  /** Make download limit errors be fatal.

At the time of writing it is only possible to download 10 TiB of data from
Google Drive a day (this is an undocumented limit). When this limit is
reached Google Drive produces a slightly different error message. When
this flag is set it causes these errors to be fatal. These will stop
the in-progress sync.

Note that this detection is relying on error message strings which
Google don't document so it may break in the future. */
  stop_on_download_limit?: boolean;
  /** Make upload limit errors be fatal.

At the time of writing it is only possible to upload 750 GiB of data to
Google Drive a day (this is an undocumented limit). When this limit is
reached Google Drive produces a slightly different error message. When
this flag is set it causes these errors to be fatal. These will stop
the in-progress sync.

Note that this detection is relying on error message strings which
Google don't document so it may break in the future.

See: https://github.com/Hoody/Hoody/issues/3857 */
  stop_on_upload_limit?: boolean;
  /** ID of the Shared Drive (Team Drive). */
  team_drive?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Only show files that are in the trash.

This will show trashed files in their original directory structure. */
  trashed_only?: boolean;
  /** Cutoff for switching to chunked upload. */
  upload_cutoff?: string;
  /** Use file created date instead of modified date.

Useful when downloading data and you want the creation date used in
place of the last modified date.

**WARNING**: This flag may have some unexpected consequences.

When uploading to your drive all files will be overwritten unless they
haven't been modified since their creation. And the inverse will occur
while downloading. This side effect can be avoided by using the
"--checksum" flag.

This feature was implemented to retain photos capture date as recorded
by google photos. You will first need to check the "Create a Google
Photos folder" option in your google drive settings. You can then copy
or move the photos locally and use the date the image was taken
(created) set as the modification date. */
  use_created_date?: boolean;
  /** Use date file was shared instead of modified date.

Note that, as with "--drive-use-created-date", this flag may have
unexpected consequences when uploading/downloading files.

If both this flag and "--drive-use-created-date" are set, the created
date is used. */
  use_shared_date?: boolean;
  /** Send files to the trash instead of deleting permanently.

Defaults to true, namely sending files to the trash.
Use `--drive-use-trash=false` to delete files permanently instead. */
  use_trash?: boolean;
  /** If Object's are greater, use drive v2 API to download. */
  v2_download_min_size?: string;
}

export interface FilesBackendsConnectDriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * dropbox backend configuration
 */
export interface FilesBackendsConnectDropboxRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Max time to wait for a batch to finish committing (in seconds) */
  batch_commit_timeout?: number;
  /** Upload file batching sync|async|off.

This sets the batch mode used by Hoody.

For full info

This has 3 possible values

- off - no batching
- sync - batch uploads and check completion (default)
- async - batch upload and don't check completion

Hoody-VFS will close any outstanding batches when it exits which may make
a delay on quit. */
  batch_mode?: string;
  /** Max number of files in upload batch.

This sets the batch size of files to upload. It has to be less than 1000.

By default this is 0 which means Hoody will calculate the batch size
depending on the setting of batch_mode.

- batch_mode: async - default batch_size is 100
- batch_mode: sync - default batch_size is the same as --transfers
- batch_mode: off - not in use

Hoody-VFS will close any outstanding batches when it exits which may make
a delay on quit.

Setting this is a great idea if you are uploading lots of small files
as it will make them a lot quicker. You can use --transfers 32 to
maximise throughput. */
  batch_size?: number;
  /** Max time to allow an idle upload batch before uploading.

If an upload batch is idle for more than this long then it will be
uploaded.

The default for this is 0 which means Hoody will choose a sensible
default based on the batch_mode in use.

- batch_mode: async - default batch_timeout is 10s
- batch_mode: sync - default batch_timeout is 500ms
- batch_mode: off - not in use (in seconds) */
  batch_timeout?: number;
  /** Upload chunk size (< 150Mi).

Any files larger than this will be uploaded in chunks of this size.

Note that chunks are buffered in memory (one at a time) so Hoody can
deal with retries. Setting this larger will increase the speed
slightly (at most 10% for 128 MiB in tests) at the cost of using more
memory. It can be set smaller if you are tight on memory. */
  chunk_size?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Impersonate this user when using a business account.

Note that if you want to use impersonate, you should make sure this
flag is set when running "Hoody config" as this will cause Hoody to
request the "members.read" scope which it won't normally. This is
needed to lookup a members email address into the internal ID that
dropbox uses in the API.

Using the "members.read" scope will require a Dropbox Team Admin
to approve during the OAuth flow.

You will have to use your own App (setting your own client_id and
client_secret) to use this option as currently Hoody's default set of
permissions doesn't include "members.read". This can be added once
v1.55 or later is in use everywhere. */
  impersonate?: string;
  /** Minimum time to sleep between API calls. (in seconds) */
  pacer_min_sleep?: number;
  /** Specify a different Dropbox namespace ID to use as the root for all paths. */
  root_namespace?: string;
  /** Instructs Hoody to work on individual shared files.

In this mode Hoody's features are extremely limited - only list (ls, lsl, etc.) 
operations and read operations (e.g. downloading) are supported in this mode.
All other operations will be disabled. */
  shared_files?: boolean;
  /** Instructs Hoody to work on shared folders.
 
When this flag is used with no path only the List operation is supported and 
all available shared folders will be listed. If you specify a path the first part 
will be interpreted as the name of shared folder. Hoody-VFS will then try to mount this 
shared to the root namespace. On success shared folder Hoody proceeds normally. 
The shared folder is now pretty much a normal folder and all normal operations 
are supported. 

Note that we don't unmount the shared folder afterwards so the 
--dropbox-shared-folders can be omitted after the first use of a particular 
shared folder.

See also --dropbox-root-namespace for an alternative way to work with shared
folders. */
  shared_folders?: boolean;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectDropboxResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * fichier backend configuration
 */
export interface FilesBackendsConnectFichierRequest {
  /** Your API Key, get it from https://1fichier.com/console/params.pl. */
  api_key?: string;
  /** Set if you wish to use CDN download links. */
  cdn?: boolean;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** If you want to download a shared file that is password protected, add this parameter. */
  file_password?: string;
  /** If you want to list the files in a shared folder that is password protected, add this parameter. */
  folder_password?: string;
  /** If you want to download a shared folder, add this parameter. */
  shared_folder?: string;
}

export interface FilesBackendsConnectFichierResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * filefabric backend configuration
 */
export interface FilesBackendsConnectFilefabricRequest {
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Permanent Authentication Token.

A Permanent Authentication Token can be created in the Enterprise File
Fabric, on the users Dashboard under Security, there is an entry
you'll see called "My Authentication Tokens". Click the Manage button
to create one.

These tokens are normally valid for several years.

For more info see: https://docs.storagemadeeasy.com/organisationcloud/api-tokens */
  permanent_token?: string;
  /** ID of the root folder.

Leave blank normally.

Fill in to make Hoody start with directory of a given ID. */
  root_folder_id?: string;
  /** Session Token.

This is a session token which Hoody caches in the config file. It is
usually valid for 1 hour.

Don't set this value - Hoody will set it automatically. */
  token?: string;
  /** Token expiry time.

Don't set this value - Hoody will set it automatically. */
  token_expiry?: string;
  /** URL of the Enterprise File Fabric to connect to. */
  url: "https://storagemadeeasy.com" | "https://eu.storagemadeeasy.com" | "https://yourfabric.smestorage.com";
  /** Version read from the file fabric.

Don't set this value - Hoody will set it automatically. */
  version?: string;
}

export interface FilesBackendsConnectFilefabricResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * filescom backend configuration
 */
export interface FilesBackendsConnectFilescomRequest {
  /** The API key used to authenticate with Files.com. */
  api_key?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** The password used to authenticate with Files.com. */
  password?: string;
  /** Your site subdomain (e.g. mysite) or custom domain (e.g. myfiles.customdomain.com). */
  site?: string;
  /** The username used to authenticate with Files.com. */
  username?: string;
}

export interface FilesBackendsConnectFilescomResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * ftp backend configuration
 */
export interface FilesBackendsConnectFtpRequest {
  /** Allow asking for FTP password when needed.

If this is set and no password is supplied then Hoody will ask for a password */
  ask_password?: boolean;
  /** Maximum time to wait for a response to close. (in seconds) */
  close_timeout?: number;
  /** Maximum number of FTP simultaneous connections, 0 for unlimited.

Note that setting this is very likely to cause deadlocks so it should
be used with care.

If you are doing a sync or copy then make sure concurrency is one more
than the sum of `--transfers` and `--checkers`.

If you use `--check-first` then it just needs to be one more than the
maximum of `--checkers` and `--transfers`.

So for `concurrency 3` you'd use `--checkers 2 --transfers 2
--check-first` or `--checkers 1 --transfers 1`. */
  concurrency?: number;
  /** Description of the remote. */
  description?: string;
  /** Disable using EPSV even if server advertises support. */
  disable_epsv?: boolean;
  /** Disable using MLSD even if server advertises support. */
  disable_mlsd?: boolean;
  /** Disable TLS 1.3 (workaround for FTP servers with buggy TLS) */
  disable_tls13?: boolean;
  /** Disable using UTF-8 even if server advertises support. */
  disable_utf8?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: "Asterisk,Ctl,Dot,Slash" | "BackSlash,Ctl,Del,Dot,RightSpace,Slash,SquareBracket" | "Ctl,LeftPeriod,Slash";
  /** Use Explicit FTPS (FTP over TLS).

When using explicit FTP over TLS the client explicitly requests
security from the server in order to upgrade a plain text connection
to an encrypted one. Cannot be used in combination with implicit FTPS. */
  explicit_tls?: boolean;
  /** Use LIST -a to force listing of hidden files and folders. This will disable the use of MLSD. */
  force_list_hidden?: boolean;
  /** FTP host to connect to.

E.g. "ftp.example.com". */
  host: string;
  /** Max time before closing idle connections.

If no connections have been returned to the connection pool in the time
given, Hoody will empty the connection pool.

Set to 0 to keep connections indefinitely. (in seconds) */
  idle_timeout?: number;
  /** Do not verify the TLS certificate of the server. */
  no_check_certificate?: boolean;
  /** Don't check the upload is OK

Normally Hoody will try to check the upload exists after it has
uploaded a file to make sure the size and modification time are as
expected.

This flag stops Hoody doing these checks. This enables uploading to
folders which are write only.

You will likely need to use the --inplace flag also if uploading to
a write only folder. */
  no_check_upload?: boolean;
  /** FTP password. */
  pass?: string;
  /** FTP port number. */
  port?: number;
  /** Maximum time to wait for data connection closing status. (in seconds) */
  shut_timeout?: number;
  /** Socks 5 proxy host.
 
Supports the format user:pass@host:port, user@host:port, host:port.
 
Example:
 
 myUser:myPass@localhost:9005 */
  socks_proxy?: string;
  /** Use Implicit FTPS (FTP over TLS).

When using implicit FTP over TLS the client connects using TLS
right from the start which breaks compatibility with
non-TLS-aware servers. This is usually served over port 990 rather
than port 21. Cannot be used in combination with explicit FTPS. */
  tls?: boolean;
  /** Size of TLS session cache for all control and data connections.

TLS cache allows to resume TLS sessions and reuse PSK between connections.
Increase if default size is not enough resulting in TLS resumption errors.
Enabled by default. Use 0 to disable. */
  tls_cache_size?: number;
  /** FTP username. */
  user?: string;
  /** Use MDTM to set modification time (VsFtpd quirk) */
  writing_mdtm?: boolean;
}

export interface FilesBackendsConnectFtpResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * gofile backend configuration
 */
export interface FilesBackendsConnectGofileRequest {
  /** API Access token

You can get this from the web control panel. */
  access_token?: string;
  /** Account ID

Leave this blank normally, Hoody will fill it in automatically. */
  account_id?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Number of items to list in each call */
  list_chunk?: number;
  /** ID of the root folder

Leave this blank normally, Hoody will fill it in automatically.

If you want Hoody to be restricted to a particular folder you can
fill it in - see the docs for more info. */
  root_folder_id?: string;
}

export interface FilesBackendsConnectGofileResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * google cloud storage backend configuration
 */
export interface FilesBackendsConnectGoogleCloudStorageRequest {
  /** Short-lived access token.

Leave blank normally.
Needed only if you want use short-lived access token instead of interactive login. */
  access_token?: string;
  /** Access public buckets and objects without credentials.

Set to 'true' if you just want to download files and don't configure credentials. */
  anonymous?: boolean;
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Access Control List for new buckets. */
  bucket_acl?: "authenticatedRead" | "private" | "projectPrivate" | "publicRead" | "publicReadWrite";
  /** Access checks should use bucket-level IAM policies.

If you want to upload objects to a bucket with Bucket Policy Only set
then you will need to set this.

When it is set, Hoody:

- ignores ACLs set on buckets
- ignores ACLs set on objects
- creates buckets with Bucket Policy Only set

Docs: https://cloud.google.com/storage/docs/bucket-policy-only */
  bucket_policy_only?: boolean;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** If set this will decompress gzip encoded objects.

It is possible to upload objects to GCS with "Content-Encoding: gzip"
set. Normally Hoody will download these files as compressed objects.

If this flag is set then Hoody will decompress these files with
"Content-Encoding: gzip" as they are received. This means that Hoody
can't check the size and hash but the file contents will be decompressed. */
  decompress?: boolean;
  /** Description of the remote. */
  description?: string;
  /** Upload an empty object with a trailing slash when a new directory is created

Empty folders are unsupported for bucket based remotes, this option creates an empty
object ending with "/", to persist the folder. */
  directory_markers?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for the service.

Leave blank normally. */
  endpoint?: string;
  /** Get GCP IAM credentials from runtime (environment variables or instance meta data if no env vars).

Only applies if service_account_file and service_account_credentials is blank. */
  env_auth?: boolean;
  /** Location for the newly created buckets. */
  location?: "" | "asia" | "eu" | "us" | "asia-east1" | "asia-east2" | "asia-northeast1" | "asia-northeast2" | "asia-northeast3" | "asia-south1" | "asia-south2" | "asia-southeast1" | "asia-southeast2" | "australia-southeast1" | "australia-southeast2" | "europe-north1" | "europe-west1" | "europe-west2" | "europe-west3" | "europe-west4" | "europe-west6" | "europe-central2" | "us-central1" | "us-east1" | "us-east4" | "us-west1" | "us-west2" | "us-west3" | "us-west4" | "northamerica-northeast1" | "northamerica-northeast2" | "southamerica-east1" | "southamerica-west1" | "asia1" | "eur4" | "nam4";
  /** If set, don't attempt to check the bucket exists or create it.

This can be useful when trying to minimise the number of transactions
Hoody does if you know the bucket exists already. */
  no_check_bucket?: boolean;
  /** Access Control List for new objects. */
  object_acl?: "authenticatedRead" | "bucketOwnerFullControl" | "bucketOwnerRead" | "private" | "projectPrivate" | "publicRead";
  /** Project number.

Optional - needed only for list/create/delete buckets - see your developer console. */
  project_number?: string;
  /** Service Account Credentials JSON blob.

Leave blank normally.
Needed only if you want use SA instead of interactive login. */
  service_account_credentials?: string;
  /** Service Account Credentials JSON file path.

Leave blank normally.
Needed only if you want use SA instead of interactive login.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  service_account_file?: string;
  /** The storage class to use when storing objects in Google Cloud Storage. */
  storage_class?: "" | "MULTI_REGIONAL" | "REGIONAL" | "NEARLINE" | "COLDLINE" | "ARCHIVE" | "DURABLE_REDUCED_AVAILABILITY";
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** User project.

Optional - needed only for requester pays. */
  user_project?: string;
}

export interface FilesBackendsConnectGoogleCloudStorageResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * google photos backend configuration
 */
export interface FilesBackendsConnectGooglePhotosRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Max time to wait for a batch to finish committing (in seconds) */
  batch_commit_timeout?: number;
  /** Upload file batching sync|async|off.

This sets the batch mode used by Hoody.

This has 3 possible values

- off - no batching
- sync - batch uploads and check completion (default)
- async - batch upload and don't check completion

Hoody-VFS will close any outstanding batches when it exits which may make
a delay on quit. */
  batch_mode?: string;
  /** Max number of files in upload batch.

This sets the batch size of files to upload. It has to be less than 50.

By default this is 0 which means Hoody will calculate the batch size
depending on the setting of batch_mode.

- batch_mode: async - default batch_size is 50
- batch_mode: sync - default batch_size is the same as --transfers
- batch_mode: off - not in use

Hoody-VFS will close any outstanding batches when it exits which may make
a delay on quit.

Setting this is a great idea if you are uploading lots of small files
as it will make them a lot quicker. You can use --transfers 32 to
maximise throughput. */
  batch_size?: number;
  /** Max time to allow an idle upload batch before uploading.

If an upload batch is idle for more than this long then it will be
uploaded.

The default for this is 0 which means Hoody will choose a sensible
default based on the batch_mode in use.

- batch_mode: async - default batch_timeout is 10s
- batch_mode: sync - default batch_timeout is 1s
- batch_mode: off - not in use (in seconds) */
  batch_timeout?: number;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Also view and download archived media.

By default, Hoody does not request archived media. Thus, when syncing,
archived media is not visible in directory listings or transferred.

Note that media in albums is always visible and synced, no matter
their archive status.

With this flag, archived media are always visible in directory
listings and transferred.

Without this flag, archived media will not be visible in directory
listings and won't be transferred. */
  include_archived?: boolean;
  /** Use the gphotosdl proxy for downloading the full resolution images

The Google API will deliver images and video which aren't full
resolution, and/or have EXIF data missing.

However if you ue the gphotosdl proxy tnen you can download original,
unchanged images.

This runs a headless browser in the background.

Download the software from [gphotosdl](https://github.com/Hoody/gphotosdl)

First run with

 gphotosdl -login

Then once you have logged into google photos close the browser window
and run

 gphotosdl

Then supply the parameter `--gphotos-proxy "http://localhost:8282"` to make
Hoody use the proxy. */
  proxy?: string;
  /** Set to make the Google Photos backend read only.

If you choose read only then Hoody will only request read only access
to your photos, otherwise Hoody will request full access. */
  read_only?: boolean;
  /** Set to read the size of media items.

Normally Hoody does not read the size of media items since this takes
another transaction. This isn't necessary for syncing. However
Hoody mount needs to know the size of files in advance of reading
them, so setting this flag when using Hoody mount is recommended if
you want to read the media. */
  read_size?: boolean;
  /** Year limits the photos to be downloaded to those which are uploaded after the given year. */
  start_year?: number;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectGooglePhotosResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * hasher backend configuration
 */
export interface FilesBackendsConnectHasherRequest {
  /** Auto-update checksum for files smaller than this size (disabled by default). */
  auto_size?: string;
  /** Description of the remote. */
  description?: string;
  /** Comma separated list of supported checksum types. */
  hashes?: string;
  /** Maximum time to keep checksums in cache (0 = no cache, off = cache forever). (in seconds) */
  max_age?: number;
  /** Remote to cache checksums for (e.g. myRemote:path). */
  remote: string;
}

export interface FilesBackendsConnectHasherResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * hdfs backend configuration
 */
export interface FilesBackendsConnectHdfsRequest {
  /** Kerberos data transfer protection: authentication|integrity|privacy.

Specifies whether or not authentication, data signature integrity
checks, and wire encryption are required when communicating with
the datanodes. Possible values are 'authentication', 'integrity'
and 'privacy'. Used only with KERBEROS enabled. */
  data_transfer_protection?: "privacy";
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Hadoop name nodes and ports.

E.g. "namenode-1:8020,namenode-2:8020,..." to connect to host namenodes at port 8020. */
  namenode: string;
  /** Kerberos service principal name for the namenode.

Enables KERBEROS authentication. Specifies the Service Principal Name
(SERVICE/FQDN) for the namenode. E.g. \"hdfs/namenode.hadoop.docker\"
for namenode running as service 'hdfs' with FQDN 'namenode.hadoop.docker'. */
  service_principal_name?: string;
  /** Hadoop user name. */
  username?: "root";
}

export interface FilesBackendsConnectHdfsResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * hidrive backend configuration
 */
export interface FilesBackendsConnectHidriveRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Chunksize for chunked uploads.

Any files larger than the configured cutoff (or files of unknown size) will be uploaded in chunks of this size.

The upper limit for this is 2147483647 bytes (about 2.000Gi).
That is the maximum amount of bytes a single upload-operation will support.
Setting this above the upper limit or to a negative value will cause uploads to fail.

Setting this to larger values may increase the upload speed at the cost of using more memory.
It can be set to smaller values smaller to save on memory. */
  chunk_size?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** Do not fetch number of objects in directories unless it is absolutely necessary.

Requests may be faster if the number of objects in subdirectories is not fetched. */
  disable_fetching_member_count?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for the service.

This is the URL that API-calls will be made to. */
  endpoint?: string;
  /** The root/parent folder for all paths.

Fill in to use the specified folder as the parent for all paths given to the remote.
This way Hoody can use any folder as its starting point. */
  root_prefix?: "/" | "root" | "";
  /** Access permissions that Hoody should use when requesting access from HiDrive. */
  scope_access?: "rw" | "ro";
  /** User-level that Hoody should use when requesting access from HiDrive. */
  scope_role?: "user" | "admin" | "owner";
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Concurrency for chunked uploads.

This is the upper limit for how many transfers for the same file are running concurrently.
Setting this above to a value smaller than 1 will cause uploads to deadlock.

If you are uploading small numbers of large files over high-speed links
and these uploads do not fully utilize your bandwidth, then increasing
this may help to speed up the transfers. */
  upload_concurrency?: number;
  /** Cutoff/Threshold for chunked uploads.

Any files larger than this will be uploaded in chunks of the configured chunksize.

The upper limit for this is 2147483647 bytes (about 2.000Gi).
That is the maximum amount of bytes a single upload-operation will support.
Setting this above the upper limit will cause uploads to fail. */
  upload_cutoff?: string;
}

export interface FilesBackendsConnectHidriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * http backend configuration
 */
export interface FilesBackendsConnectHttpRequest {
  /** Description of the remote. */
  description?: string;
  /** Set HTTP headers for all transactions.

Use this to set additional HTTP headers for all transactions.

The input format is comma separated list of key,value pairs. Standard
[CSV encoding](https://godoc.org/encoding/csv) may be used.

For example, to set a Cookie use 'Cookie,name=value', or '"Cookie","name=value"'.

You can set multiple headers, e.g. '"Cookie","name=value","Authorization","xxx"'. */
  headers?: string;
  /** Do not escape URL metacharacters in path names. */
  no_escape?: boolean;
  /** Don't use HEAD requests.

HEAD requests are mainly used to find file sizes in dir listing.
If your site is being very slow to load then you can try this option.
Normally Hoody does a HEAD request for each potential file in a
directory listing to:

- find its size
- check it really exists
- check to see if it is a directory

If you set this option, Hoody will not do the HEAD request. This will mean
that directory listings are much quicker, but Hoody won't have the times or
sizes of any files, and some files that don't exist may be in the listing. */
  no_head?: boolean;
  /** Set this if the site doesn't end directories with /.

Use this if your target website does not use / on the end of
directories.

A / on the end of a path is how Hoody normally tells the difference
between files and directories. If this flag is set, then Hoody will
treat all files with Content-Type: text/html as directories and read
URLs from them rather than downloading them.

Note that this may cause Hoody to confuse genuine HTML files with
directories. */
  no_slash?: boolean;
  /** URL of HTTP host to connect to.

E.g. "https://example.com", or "https://example.com" to use a username and password. */
  url: string;
}

export interface FilesBackendsConnectHttpResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * iclouddrive backend configuration
 */
export interface FilesBackendsConnectIclouddriveRequest {
  /** Apple ID. */
  apple_id: string;
  /** Client id */
  client_id?: string;
  /** cookies (internal use only) */
  cookies?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Password. */
  password: string;
  /** Trust token */
  trust_token?: string;
}

export interface FilesBackendsConnectIclouddriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * imagekit backend configuration
 */
export interface FilesBackendsConnectImagekitRequest {
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** You can find your ImageKit.io URL endpoint in your [dashboard](https://imagekit.io/dashboard/developer/api-keys) */
  endpoint: string;
  /** If you have configured `Restrict unsigned image URLs` in your dashboard settings, set this to true. */
  only_signed?: boolean;
  /** You can find your ImageKit.io private key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys) */
  private_key: string;
  /** You can find your ImageKit.io public key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys) */
  public_key: string;
  /** Tags to add to the uploaded files, e.g. "tag1,tag2". */
  upload_tags?: string;
  /** Include old versions in directory listings. */
  versions?: boolean;
}

export interface FilesBackendsConnectImagekitResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * internetarchive backend configuration
 */
export interface FilesBackendsConnectInternetarchiveRequest {
  /** IAS3 Access Key.

Leave blank for anonymous access.
You can find one here: https://archive.org/account/s3.php */
  access_key_id?: string;
  /** Description of the remote. */
  description?: string;
  /** Don't ask the server to test against MD5 checksum calculated by Hoody.
Normally Hoody will calculate the MD5 checksum of the input before
uploading it so it can ask the server to check the object against checksum.
This is great for data integrity checking but can cause long delays for
large files to start uploading. */
  disable_checksum?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** IAS3 Endpoint.

Leave blank for default value. */
  endpoint?: string;
  /** Host of InternetArchive Frontend.

Leave blank for default value. */
  front_endpoint?: string;
  /** IAS3 Secret Key (password).

Leave blank for anonymous access. */
  secret_access_key?: string;
  /** Timeout for waiting the server's processing tasks (specifically archive and book_op) to finish.
Only enable if you need to be guaranteed to be reflected after write operations.
0 to disable waiting. No errors to be thrown in case of timeout. (in seconds) */
  wait_archive?: number;
}

export interface FilesBackendsConnectInternetarchiveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * jottacloud backend configuration
 */
export interface FilesBackendsConnectJottacloudRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Delete files permanently rather than putting them into the trash. */
  hard_delete?: boolean;
  /** Files bigger than this will be cached on disk to calculate the MD5 if required. */
  md5_memory_limit?: string;
  /** Avoid server side versioning by deleting files and recreating files instead of overwriting them. */
  no_versions?: boolean;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Only show files that are in the trash.

This will show trashed files in their original directory structure. */
  trashed_only?: boolean;
  /** Files bigger than this can be resumed if the upload fail's. */
  upload_resume_limit?: string;
}

export interface FilesBackendsConnectJottacloudResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * koofr backend configuration
 */
export interface FilesBackendsConnectKoofrRequest {
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** The Koofr API endpoint to use. */
  endpoint: string;
  /** Mount ID of the mount to use.

If omitted, the primary mount is used. */
  mountid?: string;
  /** Your password for Hoody (generate one at your service's settings page). */
  password: string;
  /** Choose your storage provider. */
  provider?: "koofr" | "digistorage" | "other";
  /** Does the backend support setting modification time.

Set this to false if you use a mount ID that points to a Dropbox or Amazon Drive backend. */
  setmtime?: boolean;
  /** Your user name. */
  user: string;
}

export interface FilesBackendsConnectKoofrResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * linkbox backend configuration
 */
export interface FilesBackendsConnectLinkboxRequest {
  /** Description of the remote. */
  description?: string;
  /** Token from https://www.linkbox.to/admin/account */
  token: string;
}

export interface FilesBackendsConnectLinkboxResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * local backend configuration
 */
export interface FilesBackendsConnectLocalRequest {
  /** Force the filesystem to report itself as case insensitive.

Normally the local backend declares itself as case insensitive on
Windows/macOS and case sensitive for everything else. Use this flag
to override the default choice. */
  case_insensitive?: boolean;
  /** Force the filesystem to report itself as case sensitive.

Normally the local backend declares itself as case insensitive on
Windows/macOS and case sensitive for everything else. Use this flag
to override the default choice. */
  case_sensitive?: boolean;
  /** Follow symlinks and copy the pointed to item. */
  copy_links?: boolean;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Translate symlinks to/from regular files with a '.hoody-vfslink' extension for the local backend. */
  links?: boolean;
  /** Don't check to see if the files change during upload.

Normally Hoody checks the size and modification time of files as they
are being uploaded and aborts with a message which starts "can't copy -
source file is being updated" if the file changes during upload.

However on some file systems this modification time check may fail (e.g.
[Glusterfs #2206](https://github.com/Hoody/Hoody/issues/2206)) so this
check can be disabled with this flag.

If this flag is set, Hoody will use its best efforts to transfer a
file which is being updated. If the file is only having things
appended to it (e.g. a log) then Hoody will transfer the log file with
the size it had the first time Hoody saw it.

If the file is being modified throughout (not just appended to) then
the transfer may fail with a hash check failure.

In detail, once the file has had stat() called on it for the first
time we:

- Only transfer the size that stat gave
- Only checksum the size that stat gave
- Don't update the stat info for the file

**NB** do not use this flag on a Windows Volume Shadow (VSS). For some
unknown reason, files in a VSS sometimes show different sizes from the
directory listing (where the initial stat value comes from on Windows)
and when stat is called on them directly. Other copy tools always use
the direct stat value and setting this flag will disable that. */
  no_check_updated?: boolean;
  /** Disable reflink cloning for server-side copies.

Normally, for local-to-local transfers, Hoody will "clone" the file when
possible, and fall back to "copying" only when cloning is not supported.

Cloning creates a shallow copy (or "reflink") which initially shares blocks with
the original file. Unlike a "hardlink", the two files are independent and
neither will affect the other if subsequently modified.

Cloning is usually preferable to copying, as it is much faster and is
deduplicated by default (i.e. having two identical files does not consume more
storage than having just one.) However, for use cases where data redundancy is
preferable, --local-no-clone can be used to disable cloning and force "deep" copies.

Currently, cloning is only supported when using APFS on macOS (support for other
platforms may be added in the future.) */
  no_clone?: boolean;
  /** Disable preallocation of disk space for transferred files.

Preallocation of disk space helps prevent filesystem fragmentation.
However, some virtual filesystem layers (such as Google Drive File
Stream) may incorrectly set the actual file size equal to the
preallocated space, causing checksum and file size checks to fail.
Use this flag to disable preallocation. */
  no_preallocate?: boolean;
  /** Disable setting modtime.

Normally Hoody updates modification time of files after they are done
uploading. This can cause permissions issues on Linux platforms when 
the user Hoody is running as does not own the file uploaded, such as
when copying to a CIFS mount owned by another user. If this option is 
enabled, Hoody will no longer update the modtime after copying a file. */
  no_set_modtime?: boolean;
  /** Disable sparse files for multi-thread downloads.

On Windows platforms Hoody will make sparse files when doing
multi-thread downloads. This avoids long pauses on large files where
the OS zeros the file. However sparse files may be undesirable as they
cause disk fragmentation and can be slow to work with. */
  no_sparse?: boolean;
  /** Disable UNC (long path names) conversion on Windows. */
  nounc?: boolean;
  /** Don't cross filesystem boundaries (unix/macOS only). */
  one_file_system?: boolean;
  /** Don't warn about skipped symlinks.

This flag disables warning messages on skipped symlinks or junction
points, as you explicitly acknowledge that they should be skipped. */
  skip_links?: boolean;
  /** Set what kind of time is returned.

Normally Hoody does all operations on the mtime or Modification time.

If you set this flag then Hoody will return the Modified time as whatever
you set here. So if you use "Hoody lsl --local-time-type ctime" then
you will see ctimes in the listing.

If the OS doesn't support returning the time_type specified then Hoody
will silently replace it with the modification time which all OSes support.

- mtime is supported by all OSes
- atime is supported on all OSes except: plan9, js
- btime is only supported on: Windows, macOS, freebsd, netbsd
- ctime is supported on all Oses except: Windows, plan9, js

Note that setting the time will still set the modified time so this is
only useful for reading. */
  time_type?: "mtime" | "atime" | "btime" | "ctime";
  /** Apply unicode NFC normalization to paths and filenames.

This flag can be used to normalize file names into unicode NFC form
that are read from the local filesystem.

Hoody-VFS does not normally touch the encoding of file names it reads from
the file system.

This can be useful when using macOS as it normally provides decomposed (NFD)
unicode which in some language (eg Korean) doesn't display properly on
some OSes.

Note that Hoody compares filenames with unicode normalization in the sync
routine so this flag shouldn't normally be used. */
  unicode_normalization?: boolean;
  /** Assume the Stat size of links is zero (and read them instead) (deprecated).

Hoody-VFS used to use the Stat size of links as the link size, but this fails in quite a few places:

- Windows
- On some virtual filesystems (such ash LucidLink)
- Android

So Hoody now always reads the link. */
  zero_size_links?: boolean;
}

export interface FilesBackendsConnectLocalResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * mailru backend configuration
 */
export interface FilesBackendsConnectMailruRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** What should copy do if file checksum is mismatched or invalid. */
  check_hash?: boolean;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Password.

This must be an app password - Hoody will not work with your normal
password. See the Configuration section in the docs for how to make an
app password. */
  pass: string;
  /** Comma separated list of internal maintenance flags.

This option must not be used by an ordinary user. It is intended only to
facilitate remote troubleshooting of backend issues. Strict meaning of
flags is not documented and not guaranteed to persist between releases.
Quirks will be removed when the backend grows stable.
Supported quirks: atomicmkdir binlist unknowndirs */
  quirks?: string;
  /** Skip full upload if there is another file with same data hash.

This feature is called "speedup" or "put by hash". It is especially efficient
in case of generally available files like popular books, video or audio clips,
because files are searched by hash in all accounts of all mailru users.
It is meaningless and ineffective if source file is unique or encrypted.
Please note that Hoody may need local memory and disk space to calculate
content hash in advance and decide whether full upload is required.
Also, if Hoody does not know file size in advance (e.g. in case of
streaming or partial uploads), it will not even try this optimization. */
  speedup_enable?: boolean;
  /** Comma separated list of file name patterns eligible for speedup (put by hash).

Patterns are case insensitive and can contain '*' or '?' meta characters. */
  speedup_file_patterns?: "" | "*" | "*.mkv,*.avi,*.mp4,*.mp3" | "*.zip,*.gz,*.rar,*.pdf";
  /** This option allows you to disable speedup (put by hash) for large files.

Reason is that preliminary hashing can exhaust your RAM or disk space. */
  speedup_max_disk?: "0" | "1G" | "3G";
  /** Files larger than the size given below will always be hashed on disk. */
  speedup_max_memory?: "0" | "32M" | "256M";
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** User name (usually email). */
  user: string;
  /** HTTP user agent used internally by client.

Defaults to "Hoody/VERSION" or "--user-agent" provided on command line. */
  user_agent?: string;
}

export interface FilesBackendsConnectMailruResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * mega backend configuration
 */
export interface FilesBackendsConnectMegaRequest {
  /** Output more debug from Mega.

If this flag is set (along with -vv) it will print further debugging
information from the mega backend. */
  debug?: boolean;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Delete files permanently rather than putting them into the trash.

Normally the mega backend will put all deletions into the trash rather
than permanently deleting them. If you specify this then Hoody will
permanently delete objects instead. */
  hard_delete?: boolean;
  /** Password. */
  pass: string;
  /** Use HTTPS for transfers.

MEGA uses plain text HTTP connections by default.
Some ISPs throttle HTTP connections, this causes transfers to become very slow.
Enabling this will force MEGA to use HTTPS for all transfers.
HTTPS is normally not necessary since all data is already encrypted anyway.
Enabling it will increase CPU usage and add network overhead. */
  use_https?: boolean;
  /** User name. */
  user: string;
}

export interface FilesBackendsConnectMegaResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * memory backend configuration
 */
export interface FilesBackendsConnectMemoryRequest {
  /** Description of the remote. */
  description?: string;
}

export interface FilesBackendsConnectMemoryResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * netstorage backend configuration
 */
export interface FilesBackendsConnectNetstorageRequest {
  /** Set the NetStorage account name */
  account: string;
  /** Description of the remote. */
  description?: string;
  /** Domain+path of NetStorage host to connect to.

Format should be `<domain>/<internal folders>` */
  host: string;
  /** Select between HTTP or HTTPS protocol.

Most users should choose HTTPS, which is the default.
HTTP is provided primarily for debugging purposes. */
  protocol?: "http" | "https";
  /** Set the NetStorage account secret/G2O key for authentication.

Please choose the 'y' option to set your own password then enter your secret. */
  secret: string;
}

export interface FilesBackendsConnectNetstorageResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * onedrive backend configuration
 */
export interface FilesBackendsConnectOnedriveRequest {
  /** Set scopes to be requested by Hoody.

Choose or manually enter a custom space separated list with all scopes, that Hoody should request. */
  access_scopes?: "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" | "Files.Read Files.Read.All Sites.Read.All offline_access" | "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All offline_access";
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Allows download of files the server thinks has a virus.

The onedrive/sharepoint server may check files uploaded with an Anti
Virus checker. If it detects any potential viruses or malware it will
block download of the file.

In this case you will see a message like this

 server reports this file is infected with a virus - use --onedrive-av-override to download anyway: Infected (name of virus): 403 Forbidden: 

If you are 100% sure you want to download this file anyway then use
the --onedrive-av-override flag, or av_override = true in the config
file. */
  av_override?: boolean;
  /** Chunk size to upload files with - must be multiple of 320k (327,680 bytes).

Above this size files will be chunked - must be multiple of 320k (327,680 bytes) and
should not exceed 250M (262,144,000 bytes) else you may encounter \"Microsoft.SharePoint.Client.InvalidClientQueryException: The request message is too big.\"
Note that the chunks will be buffered into memory. */
  chunk_size?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** If set Hoody will use delta listing to implement recursive listings.

If this flag is set the onedrive backend will advertise `ListR`
support for recursive listings.

Setting this flag speeds up these things greatly:

 Hoody lsf -R onedrive:
 Hoody size onedrive:
 Hoody rc vfs/refresh recursive=true

**However** the delta listing API **only** works at the root of the
drive. If you use it not at the root then it recurses from the root
and discards all the data that is not under the directory you asked
for. So it will be correct but may not be very efficient.

This is why this flag is not set as the default.

As a rule of thumb if nearly all of your data is under Hoody's root
directory (the `root/directory` in `onedrive:root/directory`) then
using this flag will be be a big performance win. If your data is
mostly not under the root then using this flag will be a big
performance loss.

It is recommended if you are mounting your onedrive at the root
(or near the root when using crypt) and using Hoody `rc vfs/refresh`. */
  delta?: boolean;
  /** Description of the remote. */
  description?: string;
  /** Disable the request for Sites.Read.All permission.

If set to true, you will no longer be able to search for a SharePoint site when
configuring drive ID, because Hoody will not request Sites.Read.All permission.
Set it to true if your organization didn't assign Sites.Read.All permission to the
application, and your organization disallows users to consent app permission
request on their own. */
  disable_site_permission?: boolean;
  /** The ID of the drive to use. */
  drive_id?: string;
  /** The type of the drive (personal | business | documentLibrary). */
  drive_type?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Set to make OneNote files show up in directory listings.

By default, Hoody will hide OneNote files in directory listings because
operations like "Open" and "Update" won't work on them. But this
behaviour may also prevent you from deleting them. If you want to
delete OneNote files or otherwise want them to show up in directory
listing, set this option. */
  expose_onenote_files?: boolean;
  /** Permanently delete files on removal.

Normally files will get sent to the recycle bin on deletion. Setting
this flag causes them to be permanently deleted. Use with care.

OneDrive personal accounts do not support the permanentDelete API,
it only applies to OneDrive for Business and SharePoint document libraries. */
  hard_delete?: boolean;
  /** Specify the hash in use for the backend.

This specifies the hash type in use. If set to "auto" it will use the
default hash which is QuickXorHash.

Before Hoody 1.62 an SHA1 hash was used by default for Onedrive
Personal. For 1.62 and later the default is to use a QuickXorHash for
all onedrive types. If an SHA1 hash is desired then set this option
accordingly.

From July 2023 QuickXorHash will be the only available hash for
both OneDrive for Business and OneDrive Personal.

This can be set to "none" to not use any hashes.

If the hash requested does not exist on the object, it will be
returned as an empty string which is treated as a missing hash by
Hoody. */
  hash_type?: "auto" | "quickxor" | "sha1" | "sha256" | "crc32" | "none";
  /** Set the password for links created by the link command.

At the time of writing this only works with OneDrive personal paid accounts. */
  link_password?: string;
  /** Set the scope of the links created by the link command. */
  link_scope?: "anonymous" | "organization";
  /** Set the type of the links created by the link command. */
  link_type?: "view" | "edit" | "embed";
  /** Size of listing chunk. */
  list_chunk?: number;
  /** Control whether permissions should be read or written in metadata.

Reading permissions metadata from files can be done quickly, but it
isn't always desirable to set the permissions from the metadata. */
  metadata_permissions?: "off" | "read" | "write" | "read,write" | "failok";
  /** Remove all versions on modifying operations.

Onedrive for business creates versions when Hoody uploads new files
overwriting an existing one and when it sets the modification time.

These versions take up space out of the quota.

This flag checks for versions after file upload and setting
modification time and removes all but the last version.

**NB** Onedrive personal can't currently delete versions so don't use
this flag there. */
  no_versions?: boolean;
  /** Choose national cloud region for OneDrive. */
  region?: "global" | "us" | "de" | "cn";
  /** ID of the root folder.

This isn't normally needed, but in special circumstances you might
know the folder ID that you wish to access but not be able to get
there through a path traversal. */
  root_folder_id?: string;
  /** Deprecated: use --server-side-across-configs instead.

Allow server-side operations (e.g. copy) to work across different onedrive configs.

This will work if you are copying between two OneDrive *Personal* drives AND the files to
copy are already shared between them. Additionally, it should also function for a user who
has access permissions both between Onedrive for *business* and *SharePoint* under the *same
tenant*, and between *SharePoint* and another *SharePoint* under the *same tenant*. In other
cases, Hoody will fall back to normal copy (which will be slightly slower). */
  server_side_across_configs?: boolean;
  /** ID of the service principal's tenant. Also called its directory ID.

Set this if using
- Client Credential flow */
  tenant?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectOnedriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * opendrive backend configuration
 */
export interface FilesBackendsConnectOpendriveRequest {
  /** Files will be uploaded in chunks this size.

Note that these chunks are buffered in memory so increasing them will
increase memory use. */
  chunk_size?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Password. */
  password: string;
  /** Username. */
  username: string;
}

export interface FilesBackendsConnectOpendriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * oracleobjectstorage backend configuration
 */
export interface FilesBackendsConnectOracleobjectstorageRequest {
  /** If true attempt to resume previously started multipart upload for the object.
This will be helpful to speed up multipart transfers by resuming uploads from past session.

WARNING: If chunk size differs in resumed session from past incomplete session, then the resumed multipart upload is 
aborted and a new multipart upload is started with the new chunk size.

The flag leave_parts_on_error must be true to resume and optimize to skip parts that were already uploaded successfully. */
  attempt_resume_upload?: boolean;
  /** Chunk size to use for uploading.

When uploading files larger than upload_cutoff or files with unknown
size (e.g. from "Hoody rcat" or uploaded with "Hoody mount" they will be uploaded 
as multipart uploads using this chunk size.

Note that "upload_concurrency" chunks of this size are buffered
in memory per transfer.

If you are transferring large files over high-speed links and you have
enough memory, then increasing this will speed up the transfers.

Hoody-VFS will automatically increase the chunk size when uploading a
large file of known size to stay below the 10,000 chunks limit.

Files of unknown size are uploaded with the configured
chunk_size. Since the default chunk size is 5 MiB and there can be at
most 10,000 chunks, this means that by default the maximum size of
a file you can stream upload is 48 GiB. If you wish to stream upload
larger files then you will need to increase chunk_size.

Increasing the chunk size decreases the accuracy of the progress
statistics displayed with "-P" flag. */
  chunk_size?: string;
  /** Specify compartment OCID, if you need to list buckets.

List objects works without compartment OCID. */
  compartment?: string;
  /** Path to OCI config file */
  config_file?: "~/.oci/config";
  /** Profile name inside the oci config file */
  config_profile?: "Default";
  /** Cutoff for switching to multipart copy.

Any files larger than this that need to be server-side copied will be
copied in chunks of this size.

The minimum is 0 and the maximum is 5 GiB. */
  copy_cutoff?: string;
  /** Timeout for copy.

Copy is an asynchronous operation, specify timeout to wait for copy to succeed (in seconds) */
  copy_timeout?: number;
  /** Description of the remote. */
  description?: string;
  /** Don't store MD5 checksum with object metadata.

Normally Hoody will calculate the MD5 checksum of the input before
uploading it so it can add it to metadata on the object. This is great
for data integrity checking but can cause long delays for large files
to start uploading. */
  disable_checksum?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for Object storage API.

Leave blank to use the default endpoint for the region. */
  endpoint?: string;
  /** If true avoid calling abort upload on a failure, leaving all successfully uploaded parts for manual recovery.

It should be set to true for resuming uploads across different sessions.

WARNING: Storing parts of an incomplete multipart upload counts towards space usage on object storage and will add
additional costs if not cleaned up. */
  leave_parts_on_error?: boolean;
  /** Maximum number of parts in a multipart upload.

This option defines the maximum number of multipart chunks to use
when doing a multipart upload.

OCI has max parts limit of 10,000 chunks.

Hoody-VFS will automatically increase the chunk size when uploading a
large file of a known size to stay below this number of chunks limit. */
  max_upload_parts?: number;
  /** Object storage namespace */
  namespace: string;
  /** If set, don't attempt to check the bucket exists or create it.

This can be useful when trying to minimise the number of transactions
Hoody does if you know the bucket exists already.

It can also be needed if the user you are using does not have bucket
creation permissions. */
  no_check_bucket?: boolean;
  /** Choose your Auth Provider */
  provider: "env_auth" | "user_principal_auth" | "instance_principal_auth" | "workload_identity_auth" | "resource_principal_auth" | "no_auth";
  /** Object storage Region */
  region: string;
  /** If using SSE-C, the optional header that specifies "AES256" as the encryption algorithm.
Object Storage supports "AES256" as the encryption algorithm. For more information, see
Using Your Own Keys for Server-Side Encryption (https://docs.cloud.oracle.com/Content/Object/Tasks/usingyourencryptionkeys.htm). */
  sse_customer_algorithm?: "" | "AES256";
  /** To use SSE-C, the optional header that specifies the base64-encoded 256-bit encryption key to use to
encrypt or decrypt the data. Please note only one of sse_customer_key_file|sse_customer_key|sse_kms_key_id is
needed. For more information, see Using Your Own Keys for Server-Side Encryption 
(https://docs.cloud.oracle.com/Content/Object/Tasks/usingyourencryptionkeys.htm) */
  sse_customer_key?: "";
  /** To use SSE-C, a file containing the base64-encoded string of the AES-256 encryption key associated
with the object. Please note only one of sse_customer_key_file|sse_customer_key|sse_kms_key_id is needed.' */
  sse_customer_key_file?: "";
  /** If using SSE-C, The optional header that specifies the base64-encoded SHA256 hash of the encryption
key. This value is used to check the integrity of the encryption key. see Using Your Own Keys for 
Server-Side Encryption (https://docs.cloud.oracle.com/Content/Object/Tasks/usingyourencryptionkeys.htm). */
  sse_customer_key_sha256?: "";
  /** if using your own master key in vault, this header specifies the
OCID (https://docs.cloud.oracle.com/Content/General/Concepts/identifiers.htm) of a master encryption key used to call
the Key Management service to generate a data encryption key or to encrypt or decrypt a data encryption key.
Please note only one of sse_customer_key_file|sse_customer_key|sse_kms_key_id is needed. */
  sse_kms_key_id?: "";
  /** The storage class to use when storing new objects in storage. https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/understandingstoragetiers.htm */
  storage_tier?: "Standard" | "InfrequentAccess" | "Archive";
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently.

If you are uploading small numbers of large files over high-speed links
and these uploads do not fully utilize your bandwidth, then increasing
this may help to speed up the transfers. */
  upload_concurrency?: number;
  /** Cutoff for switching to chunked upload.

Any files larger than this will be uploaded in chunks of chunk_size.
The minimum is 0 and the maximum is 5 GiB. */
  upload_cutoff?: string;
}

export interface FilesBackendsConnectOracleobjectstorageResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * pcloud backend configuration
 */
export interface FilesBackendsConnectPcloudRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Hostname to connect to.

This is normally set when Hoody initially does the oauth connection,
however you will need to set it by hand if you are using remote config
with Hoody authorize. */
  hostname?: "api.pcloud.com" | "eapi.pcloud.com";
  /** Your pcloud password. */
  password?: string;
  /** Fill in for Hoody to use a non root folder as its starting point. */
  root_folder_id?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Your pcloud username.
 
This is only required when you want to use the cleanup command. Due to a bug
in the pcloud API the required API does not support OAuth authentication so
we have to rely on user password authentication for it. */
  username?: string;
}

export interface FilesBackendsConnectPcloudResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * pikpak backend configuration
 */
export interface FilesBackendsConnectPikpakRequest {
  /** Chunk size for multipart uploads.
	
Large files will be uploaded in chunks of this size.

Note that this is stored in memory and there may be up to
"--transfers" * "--pikpak-upload-concurrency" chunks stored at once
in memory.

If you are transferring large files over high-speed links and you have
enough memory, then increasing this will speed up the transfers.

Hoody-VFS will automatically increase the chunk size when uploading a
large file of known size to stay below the 10,000 chunks limit.

Increasing the chunk size decreases the accuracy of the progress
statistics displayed with "-P" flag. */
  chunk_size?: string;
  /** Description of the remote. */
  description?: string;
  /** Device ID used for authorization. */
  device_id?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Files bigger than this will be cached on disk to calculate hash if required. */
  hash_memory_limit?: string;
  /** Use original file links instead of media links.

This avoids issues caused by invalid media links, but may reduce download speeds. */
  no_media_link?: boolean;
  /** Pikpak password. */
  pass: string;
  /** ID of the root folder.
Leave blank normally.

Fill in for Hoody to use a non root folder as its starting point. */
  root_folder_id?: string;
  /** Only show files that are in the trash.

This will show trashed files in their original directory structure. */
  trashed_only?: boolean;
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently for multipart uploads.

Note that chunks are stored in memory and there may be up to
"--transfers" * "--pikpak-upload-concurrency" chunks stored at once
in memory.

If you are uploading small numbers of large files over high-speed links
and these uploads do not fully utilize your bandwidth, then increasing
this may help to speed up the transfers. */
  upload_concurrency?: number;
  /** Send files to the trash instead of deleting permanently.

Defaults to true, namely sending files to the trash.
Use `--pikpak-use-trash=false` to delete files permanently instead. */
  use_trash?: boolean;
  /** Pikpak username. */
  user: string;
  /** HTTP user agent for pikpak.

Defaults to "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" or "--pikpak-user-agent" provided on command line. */
  user_agent?: string;
}

export interface FilesBackendsConnectPikpakResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * pixeldrain backend configuration
 */
export interface FilesBackendsConnectPixeldrainRequest {
  /** API key for your pixeldrain account.
Found on https://pixeldrain.com/user/api_keys. */
  api_key?: string;
  /** The API endpoint to connect to. In the vast majority of cases it's fine to leave
this at default. It is only intended to be changed for testing purposes. */
  api_url: string;
  /** Description of the remote. */
  description?: string;
  /** Root of the filesystem to use.

Set to 'me' to use your personal filesystem. Set to a shared directory ID to use a shared directory. */
  root_folder_id?: string;
}

export interface FilesBackendsConnectPixeldrainResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * premiumizeme backend configuration
 */
export interface FilesBackendsConnectPremiumizemeRequest {
  /** API Key.

This is not normally used - use oauth instead. */
  api_key?: string;
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectPremiumizemeResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * protondrive backend configuration
 */
export interface FilesBackendsConnectProtondriveRequest {
  /** The 2FA code

The value can also be provided with --protondrive-2fa=000000

The 2FA code of your proton drive account if the account is set up with 
two-factor authentication */
  "2fa"?: string;
  /** The app version string 

The app version string indicates the client that is currently performing 
the API request. This information is required and will be sent with every 
API request. */
  app_version?: string;
  /** Client access token key (internal use only) */
  client_access_token?: string;
  /** Client refresh token key (internal use only) */
  client_refresh_token?: string;
  /** Client salted key pass key (internal use only) */
  client_salted_key_pass?: string;
  /** Client uid key (internal use only) */
  client_uid?: string;
  /** Description of the remote. */
  description?: string;
  /** Caches the files and folders metadata to reduce API calls

Notice: If you are mounting ProtonDrive as a VFS, please disable this feature, 
as the current implementation doesn't update or clear the cache when there are 
external changes. 

The files and folders on ProtonDrive are represented as links with keyrings, 
which can be cached to improve performance and be friendly to the API server.

The cache is currently built for the case when the Hoody is the only instance 
performing operations to the mount point. The event system, which is the proton
API system that provides visibility of what has changed on the drive, is yet 
to be implemented, so updates from other clients won’t be reflected in the 
cache. Thus, if there are concurrent clients accessing the same mount point, 
then we might have a problem with caching the stale data. */
  enable_caching?: boolean;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** The mailbox password of your two-password proton account.

For more information regarding the mailbox password, please check the 
following official knowledge base article: 
https://proton.me/support/the-difference-between-the-mailbox-password-and-login-password */
  mailbox_password?: string;
  /** Return the file size before encryption
 
The size of the encrypted file will be different from (bigger than) the 
original file size. Unless there is a reason to return the file size 
after encryption is performed, otherwise, set this option to true, as 
features like Open() which will need to be supplied with original content 
size, will fail to operate properly */
  original_file_size?: boolean;
  /** The password of your proton account. */
  password: string;
  /** Create a new revision when filename conflict is detected

When a file upload is cancelled or failed before completion, a draft will be 
created and the subsequent upload of the same file to the same location will be 
reported as a conflict.

The value can also be set by --protondrive-replace-existing-draft=true

If the option is set to true, the draft will be replaced and then the upload 
operation will restart. If there are other clients also uploading at the same 
file location at the same time, the behavior is currently unknown. Need to set 
to true for integration tests.
If the option is set to false, an error "a draft exist - usually this means a 
file is being uploaded at another client, or, there was a failed upload attempt" 
will be returned, and no upload will happen. */
  replace_existing_draft?: boolean;
  /** The username of your proton account */
  username: string;
}

export interface FilesBackendsConnectProtondriveResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * putio backend configuration
 */
export interface FilesBackendsConnectPutioRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectPutioResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * qingstor backend configuration
 */
export interface FilesBackendsConnectQingstorRequest {
  /** QingStor Access Key ID.

Leave blank for anonymous access or runtime credentials. */
  access_key_id?: string;
  /** Chunk size to use for uploading.

When uploading files larger than upload_cutoff they will be uploaded
as multipart uploads using this chunk size.

Note that "--qingstor-upload-concurrency" chunks of this size are buffered
in memory per transfer.

If you are transferring large files over high-speed links and you have
enough memory, then increasing this will speed up the transfers. */
  chunk_size?: string;
  /** Number of connection retries. */
  connection_retries?: number;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Enter an endpoint URL to connection QingStor API.

Leave blank will use the default value "https://qingstor.com:443". */
  endpoint?: string;
  /** Get QingStor credentials from runtime.

Only applies if access_key_id and secret_access_key is blank. */
  env_auth?: boolean;
  /** QingStor Secret Access Key (password).

Leave blank for anonymous access or runtime credentials. */
  secret_access_key?: string;
  /** Concurrency for multipart uploads.

This is the number of chunks of the same file that are uploaded
concurrently.

NB if you set this to > 1 then the checksums of multipart uploads
become corrupted (the uploads themselves are not corrupted though).

If you are uploading small numbers of large files over high-speed links
and these uploads do not fully utilize your bandwidth, then increasing
this may help to speed up the transfers. */
  upload_concurrency?: number;
  /** Cutoff for switching to chunked upload.

Any files larger than this will be uploaded in chunks of chunk_size.
The minimum is 0 and the maximum is 5 GiB. */
  upload_cutoff?: string;
  /** Zone to connect to.

Default is "pek3a". */
  zone?: "pek3a" | "sh1a" | "gd2a";
}

export interface FilesBackendsConnectQingstorResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * quatrix backend configuration
 */
export interface FilesBackendsConnectQuatrixRequest {
  /** API key for accessing Quatrix account */
  api_key: string;
  /** Description of the remote. */
  description?: string;
  /** Wanted upload time for one chunk */
  effective_upload_time?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Delete files permanently rather than putting them into the trash */
  hard_delete?: boolean;
  /** Host name of Quatrix account */
  host: string;
  /** The maximal summary for all chunks. It should not be less than 'transfers'*'minimal_chunk_size' */
  maximal_summary_chunk_size?: string;
  /** The minimal size for one chunk */
  minimal_chunk_size?: string;
  /** Skip project folders in operations */
  skip_project_folders?: boolean;
}

export interface FilesBackendsConnectQuatrixResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * s3 backend configuration
 */
export interface FilesBackendsConnectS3Request {
  /** AWS Access Key ID.

Leave blank for anonymous access or runtime credentials. */
  access_key_id?: string;
  /** Canned ACL used when creating buckets and storing or copying objects.

This ACL is used for creating objects and if bucket_acl isn't set, for creating buckets too.

For more info visit https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl

Note that this ACL is applied when server-side copying objects as S3
doesn't copy the ACL from the source but rather writes a fresh one.

If the acl is an empty string then no X-Amz-Acl: header is added and
the default (private) will be used. */
  acl?: "default" | "private" | "public-read" | "public-read-write" | "authenticated-read" | "bucket-owner-read" | "bucket-owner-full-control" | "private" | "public-read" | "public-read-write" | "authenticated-read";
  /** Canned ACL used when creating buckets.

For more info visit https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl

Note that this ACL is applied when only when creating buckets. If it
isn't set then "acl" is used instead.

If the "acl" and "bucket_acl" are empty strings then no X-Amz-Acl:
header is added and the default (private) will be used. */
  bucket_acl?: "private" | "public-read" | "public-read-write" | "authenticated-read";
  /** Chunk size to use for uploading.

When uploading files larger than upload_cutoff or files with unknown
size (e.g. from "Hoody rcat" or uploaded with "Hoody mount" or google
photos or google docs) they will be uploaded as multipart uploads
using this chunk size.

Note that "--s3-upload-concurrency" chunks of this size are buffered
in memory per transfer.

If you are transferring large files over high-speed links and you have
enough memory, then increasing this will speed up the transfers.

Hoody-VFS will automatically increase the chunk size when uploading a
large file of known size to stay below the 10,000 chunks limit.

Files of unknown size are uploaded with the configured
chunk_size. Since the default chunk size is 5 MiB and there can be at
most 10,000 chunks, this means that by default the maximum size of
a file you can stream upload is 48 GiB. If you wish to stream upload
larger files then you will need to increase chunk_size.

Increasing the chunk size decreases the accuracy of the progress
statistics displayed with "-P" flag. Hoody-VFS treats chunk as sent when
it's buffered by the AWS SDK, when in fact it may still be uploading.
A bigger chunk size means a bigger AWS SDK buffer and progress
reporting more deviating from the truth. */
  chunk_size?: string;
  /** Cutoff for switching to multipart copy.

Any files larger than this that need to be server-side copied will be
copied in chunks of this size.

The minimum is 0 and the maximum is 5 GiB. */
  copy_cutoff?: string;
  /** If set this will decompress gzip encoded objects.

It is possible to upload objects to S3 with "Content-Encoding: gzip"
set. Normally Hoody will download these files as compressed objects.

If this flag is set then Hoody will decompress these files with
"Content-Encoding: gzip" as they are received. This means that Hoody
can't check the size and hash but the file contents will be decompressed. */
  decompress?: boolean;
  /** Description of the remote. */
  description?: string;
  /** Set to use AWS Directory Buckets

If you are using an AWS Directory Bucket then set this flag.

This will ensure no `Content-Md5` headers are sent and ensure `ETag`
headers are not interpreted as MD5 sums. `X-Amz-Meta-Md5chksum` will
be set on all objects whether single or multipart uploaded.

This also sets `no_check_bucket = true`.

Note that Directory Buckets do not support:

- Versioning
- `Content-Encoding: gzip`

Hoody-VFS limitations with Directory Buckets:

- Hoody does not support creating Directory Buckets with `Hoody mkdir`
-... or removing them with `Hoody rmdir` yet
- Directory Buckets do not appear when doing `Hoody lsf` at the top level.
- Hoody-VFS can't remove auto created directories yet. In theory this should
 work with `directory_markers = true` but it doesn't.
- Directories don't seem to appear in recursive (ListR) listings. */
  directory_bucket?: boolean;
  /** Upload an empty object with a trailing slash when a new directory is created

Empty folders are unsupported for bucket based remotes, this option creates an empty
object ending with "/", to persist the folder. */
  directory_markers?: boolean;
  /** Don't store MD5 checksum with object metadata.

Normally Hoody will calculate the MD5 checksum of the input before
uploading it so it can add it to metadata on the object. This is great
for data integrity checking but can cause long delays for large files
to start uploading. */
  disable_checksum?: boolean;
  /** Disable usage of http2 for S3 backends.

There is currently an unsolved issue with the s3 (specifically minio) backend
and HTTP/2. HTTP/2 is enabled by default for the s3 backend but can be
disabled here. When the issue is solved this flag will be removed.

See: https://github.com/Hoody/Hoody/issues/4673, https://github.com/Hoody/Hoody/issues/3631 */
  disable_http2?: boolean;
  /** Custom endpoint for downloads.
This is usually set to a CloudFront CDN URL as AWS S3 offers
cheaper egress for data downloaded through the CloudFront network. */
  download_url?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for S3 API.

Required when using an S3 clone. */
  endpoint: "objects-us-east-1.dream.io" | "syd1.digitaloceanspaces.com" | "sfo3.digitaloceanspaces.com" | "fra1.digitaloceanspaces.com" | "nyc3.digitaloceanspaces.com" | "ams3.digitaloceanspaces.com" | "sgp1.digitaloceanspaces.com" | "localhost:8333" | "s3.us-east-1.lyvecloud.seagate.com" | "s3.us-west-1.lyvecloud.seagate.com" | "s3.ap-southeast-1.lyvecloud.seagate.com" | "oos.eu-west-2.outscale.com" | "oos.us-east-2.outscale.com" | "oos.us-west-1.outscale.com" | "oos.cloudgouv-eu-west-1.outscale.com" | "oos.ap-northeast-1.outscale.com" | "s3.wasabisys.com" | "s3.us-east-2.wasabisys.com" | "s3.us-central-1.wasabisys.com" | "s3.us-west-1.wasabisys.com" | "s3.ca-central-1.wasabisys.com" | "s3.eu-central-1.wasabisys.com" | "s3.eu-central-2.wasabisys.com" | "s3.eu-west-1.wasabisys.com" | "s3.eu-west-2.wasabisys.com" | "s3.eu-south-1.wasabisys.com" | "s3.ap-northeast-1.wasabisys.com" | "s3.ap-northeast-2.wasabisys.com" | "s3.ap-southeast-1.wasabisys.com" | "s3.ap-southeast-2.wasabisys.com" | "storage.iran.liara.space" | "s3.ir-thr-at1.arvanstorage.ir" | "s3.ir-tbz-sh1.arvanstorage.ir" | "br-se1.magaluobjects.com" | "br-ne1.magaluobjects.com";
  /** Get AWS credentials from runtime (environment variables or EC2/ECS meta data if no env vars).

Only applies if access_key_id and secret_access_key is blank. */
  env_auth?: boolean;
  /** If true use path style access if false use virtual hosted style.

If this is true (the default) then Hoody will use path style access,
if false then Hoody will use virtual path style. See [the AWS S3
docs](https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html#access-bucket-intro)
for more info.

Some providers (e.g. AWS, Aliyun OSS, Netease COS, or Tencent COS) require this set to
false - Hoody will do this automatically based on the provider
setting.

Note that if your bucket isn't a valid DNS name, i.e. has '.' or '_' in,
you'll need to set this to true. */
  force_path_style?: boolean;
  /** If true avoid calling abort upload on a failure, leaving all successfully uploaded parts on S3 for manual recovery.

It should be set to true for resuming uploads across different sessions.

WARNING: Storing parts of an incomplete multipart upload counts towards space usage on S3 and will add additional costs if not cleaned up. */
  leave_parts_on_error?: boolean;
  /** Size of listing chunk (response list for each ListObject S3 request).

This option is also known as "MaxKeys", "max-items", or "page-size" from the AWS S3 specification.
Most services truncate the response list to 1000 objects even if requested more than that.
In AWS S3 this is a global maximum and cannot be changed, see [AWS S3](https://docs.aws.amazon.com/cli/latest/reference/s3/ls.html).
In Ceph, this can be increased with the "rgw list buckets max chunk" option. */
  list_chunk?: number;
  /** Whether to url encode listings: true/false/unset

Some providers support URL encoding listings and where this is
available this is more reliable when using control characters in file
names. If this is set to unset (the default) then Hoody will choose
according to the provider setting what to apply, but you can override
Hoody's choice here. */
  list_url_encode?: string;
  /** Version of ListObjects to use: 1,2 or 0 for auto.

When S3 originally launched it only provided the ListObjects call to
enumerate objects in a bucket.

However in May 2016 the ListObjectsV2 call was introduced. This is
much higher performance and should be used if at all possible.

If set to the default, 0, Hoody will guess according to the provider
set which list objects method to call. If it guesses wrong, then it
may be set manually here. */
  list_version?: number;
  /** Location constraint - must be set to match the Region.

Leave blank if not sure. Used when creating buckets only. */
  location_constraint?: string;
  /** Maximum number of parts in a multipart upload.

This option defines the maximum number of multipart chunks to use
when doing a multipart upload.

This can be useful if a service does not support the AWS S3
specification of 10,000 chunks.

Hoody-VFS will automatically increase the chunk size when uploading a
large file of a known size to stay below this number of chunks limit. */
  max_upload_parts?: number;
  /** How often internal memory buffer pools will be flushed. (no longer used) (in seconds) */
  memory_pool_flush_time?: number;
  /** Whether to use mmap buffers in internal memory pool. (no longer used) */
  memory_pool_use_mmap?: boolean;
  /** Set this if the backend might gzip objects.

Normally providers will not alter objects when they are downloaded. If
an object was not uploaded with `Content-Encoding: gzip` then it won't
be set on download.

However some providers may gzip objects even if they weren't uploaded
with `Content-Encoding: gzip` (eg Cloudflare).

A symptom of this would be receiving errors like

 ERROR corrupted on transfer: sizes differ NNN vs MMM

If you set this flag and Hoody downloads an object with
Content-Encoding: gzip set and chunked transfer encoding, then Hoody
will decompress the object on the fly.

If this is set to unset (the default) then Hoody will choose
according to the provider setting what to apply, but you can override
Hoody's choice here. */
  might_gzip?: string;
  /** If set, don't attempt to check the bucket exists or create it.

This can be useful when trying to minimise the number of transactions
Hoody does if you know the bucket exists already.

It can also be needed if the user you are using does not have bucket
creation permissions. Before v1.52.0 this would have passed silently
due to a bug. */
  no_check_bucket?: boolean;
  /** If set, don't HEAD uploaded objects to check integrity.

This can be useful when trying to minimise the number of transactions
Hoody does.

Setting it means that if Hoody receives a 200 OK message after
uploading an object with PUT then it will assume that it got uploaded
properly.

In particular it will assume:

- the metadata, including modtime, storage class and content type was as uploaded
- the size was as uploaded

It reads the following items from the response for a single part PUT:

- the MD5SUM
- The uploaded date

For multipart uploads these items aren't read.

If an source object of unknown length is uploaded then Hoody **will** do a
HEAD request.

Setting this flag increases the chance for undetected upload failures,
in particular an incorrect size, so it isn't recommended for normal
operation. In practice the chance of an undetected upload failure is
very small even with this flag. */
  no_head?: boolean;
  /** If set, do not do HEAD before GET when getting objects. */
  no_head_object?: boolean;
  /** Suppress setting and reading of system metadata */
  no_system_metadata?: boolean;
  /** Profile to use in the shared credentials file.

If env_auth = true then Hoody can use a shared credentials file. This
variable controls which profile is used in that file.

If empty it will default to the environment variable "AWS_PROFILE" or
"default" if that environment variable is also not set. */
  profile?: string;
  /** Choose your S3 provider. */
  provider?: "AWS" | "Alibaba" | "ArvanCloud" | "Ceph" | "ChinaMobile" | "Cloudflare" | "DigitalOcean" | "Dreamhost" | "GCS" | "HuaweiOBS" | "IBMCOS" | "IDrive" | "IONOS" | "LyveCloud" | "Leviia" | "Liara" | "Linode" | "Magalu" | "Minio" | "Netease" | "Outscale" | "Petabox" | "RackCorp" | "Hoody-VFS" | "Scaleway" | "SeaweedFS" | "Selectel" | "StackPath" | "Storj" | "Synology" | "TencentCOS" | "Wasabi" | "Qiniu" | "Other";
  /** Region to connect to.

Leave blank if you are using an S3 clone and you don't have a region. */
  region?: "" | "other-v2-signature";
  /** Enables requester pays option when interacting with S3 bucket. */
  requester_pays?: boolean;
  /** Set to debug the SDK

This can be set to a comma separated list of the following functions:

- `Signing`
- `Retries`
- `Request`
- `RequestWithBody`
- `Response`
- `ResponseWithBody`
- `DeprecatedUsage`
- `RequestEventMessage`
- `ResponseEventMessage`

Use `Off` to disable and `All` to set all log levels. You will need to
use `-vv` to see the debug level logs. */
  sdk_log_mode?: string;
  /** AWS Secret Access Key (password).

Leave blank for anonymous access or runtime credentials. */
  secret_access_key?: string;
  /** The server-side encryption algorithm used when storing this object in S3. */
  server_side_encryption?: "" | "AES256" | "aws:kms";
  /** An AWS session token. */
  session_token?: string;
  /** Path to the shared credentials file.

If env_auth = true then Hoody can use a shared credentials file.

If this variable is empty Hoody will look for the
"AWS_SHARED_CREDENTIALS_FILE" env variable. If the env value is empty
it will default to the current user's home directory.

 Linux/OSX: "$HOME/.aws/credentials"
 Windows: "%USERPROFILE%\.aws\credentials" */
  shared_credentials_file?: string;
  /** If using SSE-C, the server-side encryption algorithm used when storing this object in S3. */
  sse_customer_algorithm?: "" | "AES256";
  /** To use SSE-C you may provide the secret encryption key used to encrypt/decrypt your data.

Alternatively you can provide --sse-customer-key-base64. */
  sse_customer_key?: "";
  /** If using SSE-C you must provide the secret encryption key encoded in base64 format to encrypt/decrypt your data.

Alternatively you can provide --sse-customer-key. */
  sse_customer_key_base64?: "";
  /** If using SSE-C you may provide the secret encryption key MD5 checksum (optional).

If you leave it blank, this is calculated automatically from the sse_customer_key provided. */
  sse_customer_key_md5?: "";
  /** If using KMS ID you must provide the ARN of Key. */
  sse_kms_key_id?: "" | "arn:aws:kms:us-east-1:*";
  /** The storage class to use when storing new objects in Qiniu. */
  storage_class?: "STANDARD" | "LINE" | "GLACIER" | "DEEP_ARCHIVE";
  /** Endpoint for STS (deprecated).

Leave blank if using AWS to use the default endpoint for the region. */
  sts_endpoint?: string;
  /** Concurrency for multipart uploads and copies.

This is the number of chunks of the same file that are uploaded
concurrently for multipart uploads and copies.

If you are uploading small numbers of large files over high-speed links
and these uploads do not fully utilize your bandwidth, then increasing
this may help to speed up the transfers. */
  upload_concurrency?: number;
  /** Cutoff for switching to chunked upload.

Any files larger than this will be uploaded in chunks of chunk_size.
The minimum is 0 and the maximum is 5 GiB. */
  upload_cutoff?: string;
  /** If true use the AWS S3 accelerated endpoint.

See: [AWS S3 Transfer acceleration](https://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration-examples.html) */
  use_accelerate_endpoint?: boolean;
  /** Whether to send `Accept-Encoding: gzip` header.

By default, Hoody will append `Accept-Encoding: gzip` to the request to download
compressed objects whenever possible.

However some providers such as Google Cloud Storage may alter the HTTP headers, breaking
the signature of the request.

A symptom of this would be receiving errors like

	SignatureDoesNotMatch: The request signature we calculated does not match the signature you provided.

In this case, you might want to try disabling this option. */
  use_accept_encoding_gzip?: string;
  /** Set if Hoody should report BucketAlreadyExists errors on bucket creation.

At some point during the evolution of the s3 protocol, AWS started
returning an `AlreadyOwnedByYou` error when attempting to create a
bucket that the user already owned, rather than a
`BucketAlreadyExists` error.

Unfortunately exactly what has been implemented by s3 clones is a
little inconsistent, some return `AlreadyOwnedByYou`, some return
`BucketAlreadyExists` and some return no error at all.

This is important to Hoody because it ensures the bucket exists by
creating it on quite a lot of operations (unless
`--s3-no-check-bucket` is used).

If Hoody knows the provider can return `AlreadyOwnedByYou` or returns
no error then it can report `BucketAlreadyExists` errors when the user
attempts to create a bucket not owned by them. Otherwise Hoody
ignores the `BucketAlreadyExists` error which can lead to confusion.

This should be automatically set correctly for all providers Hoody
knows about - please make a bug report if not. */
  use_already_exists?: string;
  /** If true use AWS S3 dual-stack endpoint (IPv6 support).

See [AWS Docs on Dualstack Endpoints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/dual-stack-endpoints.html) */
  use_dual_stack?: boolean;
  /** Whether to use ETag in multipart uploads for verification

This should be true, false or left unset to use the default for the provider. */
  use_multipart_etag?: string;
  /** Set if Hoody should use multipart uploads.

You can change this if you want to disable the use of multipart uploads.
This shouldn't be necessary in normal operation.

This should be automatically set correctly for all providers Hoody
knows about - please make a bug report if not. */
  use_multipart_uploads?: string;
  /** Whether to use a presigned request or PutObject for single part uploads

If this is false Hoody will use PutObject from the AWS SDK to upload
an object.

Versions of Hoody < 1.59 use presigned requests to upload a single
part object and setting this flag to true will re-enable that
functionality. This shouldn't be necessary except in exceptional
circumstances or for testing. */
  use_presigned_request?: boolean;
  /** Whether to use an unsigned payload in PutObject

Hoody-VFS has to avoid the AWS SDK seeking the body when calling
PutObject. The AWS provider can add checksums in the trailer to avoid
seeking but other providers can't.

This should be true, false or left unset to use the default for the provider. */
  use_unsigned_payload?: string;
  /** If true use v2 authentication.

If this is false (the default) then Hoody will use v4 authentication.
If it is set then Hoody will use v2 authentication.

Use this only if v4 signatures don't work, e.g. pre Jewel/v10 CEPH. */
  v2_auth?: boolean;
  /** Show file versions as they were at the specified time.

The parameter should be a date, "2006-01-02", datetime "2006-01-02
15:04:05" or a duration for that long ago, eg "100d" or "1h".

Note that when using this no file write operations are permitted,
so you can't upload files or delete them.

See [the time option docs](/docs/#time-option) for valid formats. */
  version_at?: string;
  /** Show deleted file markers when using versions.

This shows deleted file markers in the listing when using versions. These will appear
as 0 size files. The only operation which can be performed on them is deletion.

Deleting a delete marker will reveal the previous version.

Deleted files will always show with a timestamp. */
  version_deleted?: boolean;
  /** Include old versions in directory listings. */
  versions?: boolean;
}

export interface FilesBackendsConnectS3Response {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * seafile backend configuration
 */
export interface FilesBackendsConnectSeafileRequest {
  /** Two-factor authentication ('true' if the account has 2FA enabled). */
  "2fa"?: boolean;
  /** Authentication token. */
  auth_token?: string;
  /** Should Hoody create a library if it doesn't exist. */
  create_library?: boolean;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Name of the library.

Leave blank to access all non-encrypted libraries. */
  library?: string;
  /** Library password (for encrypted libraries only).

Leave blank if you pass it through the command line. */
  library_key?: string;
  /** Password. */
  pass?: string;
  /** URL of seafile host to connect to. */
  url: "https://cloud.seafile.com/";
  /** User name (usually email address). */
  user: string;
}

export interface FilesBackendsConnectSeafileResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * sftp backend configuration
 */
export interface FilesBackendsConnectSftpRequest {
  /** Allow asking for SFTP password when needed.

If this is set and no password is supplied then Hoody will:
- ask for a password
- not contact the ssh agent */
  ask_password?: boolean;
  /** Upload and download chunk size.

This controls the maximum size of payload in SFTP protocol packets.
The RFC limits this to 32768 bytes (32k), which is the default. However,
a lot of servers support larger sizes, typically limited to a maximum
total package size of 256k, and setting it larger will increase transfer
speed dramatically on high latency links. This includes OpenSSH, and,
for example, using the value of 255k works well, leaving plenty of room
for overhead while still being within a total packet size of 256k.

Make sure to test thoroughly before using a value higher than 32k,
and only use it if you always connect to the same server or after
sufficiently broad testing. If you get errors such as
"failed to send packet payload: EOF", lots of "connection lost",
or "corrupted on transfer", when copying a larger file, try lowering
the value. The server run by [Hoody serve sftp](/commands/hoody-vfs_serve_sftp)
sends packets with standard 32k maximum payload so you must not
set a different chunk_size when downloading files, but it accepts
packets up to the 256k total size, so for uploads the chunk_size
can be set as for the OpenSSH example above. */
  chunk_size?: string;
  /** Space separated list of ciphers to be used for session encryption, ordered by preference.

At least one must match with server configuration. This can be checked for example using ssh -Q cipher.

This must not be set if use_insecure_cipher is true.

Example:

 aes128-ctr aes192-ctr aes256-ctr aes128-gcm@openssh.com aes256-gcm@openssh.com */
  ciphers?: string;
  /** The maximum number of outstanding requests for one file

This controls the maximum number of outstanding requests for one file.
Increasing it will increase throughput on high latency links at the
cost of using more memory. */
  concurrency?: number;
  /** Maximum number of SFTP simultaneous connections, 0 for unlimited.

Note that setting this is very likely to cause deadlocks so it should
be used with care.

If you are doing a sync or copy then make sure connections is one more
than the sum of `--transfers` and `--checkers`.

If you use `--check-first` then it just needs to be one more than the
maximum of `--checkers` and `--transfers`.

So for `connections 3` you'd use `--checkers 2 --transfers 2
--check-first` or `--checkers 1 --transfers 1`. */
  connections?: number;
  /** Set to enable server side copies using hardlinks.

The SFTP protocol does not define a copy command so normally server
side copies are not allowed with the sftp backend.

However the SFTP protocol does support hardlinking, and if you enable
this flag then the sftp backend will support server side copies. These
will be implemented by doing a hardlink from the source to the
destination.

Not all sftp servers support this.

Note that hardlinking two files together will use no additional space
as the source and the destination will be the same file.

This feature may be useful backups made with --copy-dest. */
  copy_is_hardlink?: boolean;
  /** Description of the remote. */
  description?: string;
  /** If set don't use concurrent reads.

Normally concurrent reads are safe to use and not using them will
degrade performance, so this option is disabled by default.

Some servers limit the amount number of times a file can be
downloaded. Using concurrent reads can trigger this limit, so if you
have a server which returns

 Failed to copy: file does not exist

Then you may need to enable this flag.

If concurrent reads are disabled, the use_fstat option is ignored. */
  disable_concurrent_reads?: boolean;
  /** If set don't use concurrent writes.

Normally Hoody uses concurrent writes to upload files. This improves
the performance greatly, especially for distant servers.

This option disables concurrent writes should that be necessary. */
  disable_concurrent_writes?: boolean;
  /** Disable the execution of SSH commands to determine if remote file hashing is available.

Leave blank or set to false to enable hashing (recommended), set to true to disable hashing. */
  disable_hashcheck?: boolean;
  /** SSH host to connect to.

E.g. "example.com". */
  host: string;
  /** Space separated list of host key algorithms, ordered by preference.

At least one must match with server configuration. This can be checked for example using ssh -Q HostKeyAlgorithms.

Note: This can affect the outcome of key negotiation with the server even if server host key validation is not enabled.

Example:

 ssh-ed25519 ssh-rsa ssh-dss */
  host_key_algorithms?: string;
  /** Max time before closing idle connections.

If no connections have been returned to the connection pool in the time
given, Hoody will empty the connection pool.

Set to 0 to keep connections indefinitely. (in seconds) */
  idle_timeout?: number;
  /** Space separated list of key exchange algorithms, ordered by preference.

At least one must match with server configuration. This can be checked for example using ssh -Q kex.

This must not be set if use_insecure_cipher is true.

Example:

 sntrup761x25519-sha512@openssh.com curve25519-sha256 curve25519-sha256@libssh.org ecdh-sha2-nistp256 */
  key_exchange?: string;
  /** Path to PEM-encoded private key file.

Leave blank or set key-use-agent to use ssh-agent.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  key_file?: string;
  /** The passphrase to decrypt the PEM-encoded private key file.

Only PEM encrypted key files (old OpenSSH format) are supported. Encrypted keys
in the new OpenSSH format can't be used. */
  key_file_pass?: string;
  /** Raw PEM-encoded private key.

Note that this should be on a single line, with every line ending (the BEGIN/END
header lines included) replaced by the two characters '\n'.

This command generates the single line correctly:

 awk '{printf "%s\\n", $0}' < ~/.ssh/id_rsa

If specified, it will override the key_file parameter. */
  key_pem?: string;
  /** When set forces the usage of the ssh-agent.

When key-file is also set, the ".pub" file of the specified key-file is read and only the associated key is
requested from the ssh-agent. This allows to avoid `Too many authentication failures for *username*` errors
when the ssh-agent contains many keys. */
  key_use_agent?: boolean;
  /** Optional path to known_hosts file.

Set this value to enable server host key validation.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  known_hosts_file?: "~/.ssh/known_hosts";
  /** Space separated list of MACs (message authentication code) algorithms, ordered by preference.

At least one must match with server configuration. This can be checked for example using ssh -Q mac.

Example:

 umac-64-etm@openssh.com umac-128-etm@openssh.com hmac-sha2-256-etm@openssh.com */
  macs?: string;
  /** The command used to read md5 hashes.

Leave blank for autodetect. */
  md5sum_command?: string;
  /** SSH password, leave blank to use ssh-agent. */
  pass?: string;
  /** Override path used by SSH shell commands.

This allows checksum calculation when SFTP and SSH paths are
different. This issue affects among others Synology NAS boxes.

E.g. if shared folders can be found in directories representing volumes:

 Hoody sync /home/local/directory remote:/directory --sftp-path-override /volume2/directory

E.g. if home directory can be found in a shared folder called "home":

 Hoody sync /home/local/directory remote:/home/directory --sftp-path-override /volume1/homes/USER/directory
	
To specify only the path to the SFTP remote's root, and allow Hoody to add any relative subpaths automatically (including unwrapping/decrypting remotes as necessary), add the '@' character to the beginning of the path.

E.g. the first example above could be rewritten as:

	Hoody sync /home/local/directory remote:/directory --sftp-path-override @/volume2
	
Note that when using this method with Synology "home" folders, the full "/homes/USER" path should be specified instead of "/home".

E.g. the second example above should be rewritten as:

	Hoody sync /home/local/directory remote:/homes/USER/directory --sftp-path-override @/volume1 */
  path_override?: string;
  /** SSH port number. */
  port?: number;
  /** SSH public certificate for public certificate based authentication.
Set this if you have a signed certificate you want to use for authentication.
If specified will override pubkey_file. */
  pubkey?: string;
  /** Optional path to public key file.

Set this if you have a signed certificate you want to use for authentication.

Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`. */
  pubkey_file?: string;
  /** Specifies the path or command to run a sftp server on the remote host.

The subsystem option is ignored when server_command is defined.

If adding server_command to the configuration file please note that 
it should not be enclosed in quotes, since that will make Hoody fail.

A working example is:

 [remote_name]
 type = sftp
 server_command = sudo /usr/libexec/openssh/sftp-server */
  server_command?: string;
  /** Environment variables to pass to sftp and commands

Set environment variables in the form:

 VAR=value

to be passed to the sftp client and to any commands run (eg md5sum).

Pass multiple variables space separated, eg

 VAR1=value VAR2=value

and pass variables with spaces in quotes, eg

 "VAR3=value with space" "VAR4=value with space" VAR5=nospacehere */
  set_env?: string;
  /** Set the modified time on the remote if set. */
  set_modtime?: boolean;
  /** The command used to read sha1 hashes.

Leave blank for autodetect. */
  sha1sum_command?: string;
  /** The type of SSH shell on remote server, if any.

Leave blank for autodetect. */
  shell_type?: "none" | "unix" | "powershell" | "cmd";
  /** Set to skip any symlinks and any other non regular files. */
  skip_links?: boolean;
  /** Socks 5 proxy host.
	
Supports the format user:pass@host:port, user@host:port, host:port.

Example:

	myUser:myPass@localhost:9005 */
  socks_proxy?: string;
  /** Path and arguments to external ssh binary.

Normally Hoody will use its internal ssh library to connect to the
SFTP server. However it does not implement all possible ssh options so
it may be desirable to use an external ssh binary.

Hoody-VFS ignores all the internal config if you use this option and
expects you to configure the ssh binary with the user/host/port and
any other options you need.

**Important** The ssh command must log in without asking for a
password so needs to be configured with keys or certificates.

Hoody-VFS will run the command supplied either with the additional
arguments "-s sftp" to access the SFTP subsystem or with commands such
as "md5sum /path/to/file" appended to read checksums.

Any arguments with spaces in should be surrounded by "double quotes".

An example setting might be:

 ssh -o ServerAliveInterval=20 user@example.com

Note that when using an external ssh binary Hoody makes a new ssh
connection for every hash it calculates. */
  ssh?: string;
  /** Specifies the SSH2 subsystem on the remote host. */
  subsystem?: string;
  /** If set use fstat instead of stat.

Some servers limit the amount of open files and calling Stat after opening
the file will throw an error from the server. Setting this flag will call
Fstat instead of Stat which is called on an already open file handle.

It has been found that this helps with IBM Sterling SFTP servers which have
"extractability" level set to 1 which means only 1 file can be opened at
any given time. */
  use_fstat?: boolean;
  /** Enable the use of insecure ciphers and key exchange methods.

This enables the use of the following insecure ciphers and key exchange methods:

- aes128-cbc
- aes192-cbc
- aes256-cbc
- 3des-cbc
- diffie-hellman-group-exchange-sha256
- diffie-hellman-group-exchange-sha1

Those algorithms are insecure and may allow plaintext data to be recovered by an attacker.

This must be false if you use either ciphers or key_exchange advanced options. */
  use_insecure_cipher?: boolean;
  /** SSH username. */
  user?: string;
}

export interface FilesBackendsConnectSftpResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * sharefile backend configuration
 */
export interface FilesBackendsConnectSharefileRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Upload chunk size.

Must a power of 2 >= 256k.

Making this larger will improve performance, but note that each chunk
is buffered in memory one per transfer.

Reducing this will reduce memory usage but decrease performance. */
  chunk_size?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint for API calls.

This is usually auto discovered as part of the oauth process, but can
be set manually to something like: https://XXX.sharefile.com */
  endpoint?: string;
  /** ID of the root folder.

Leave blank to access "Personal Folders". You can use one of the
standard values here or any folder ID (long hex number ID). */
  root_folder_id?: "" | "favorites" | "allshared" | "connectors" | "top";
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Cutoff for switching to multipart upload. */
  upload_cutoff?: string;
}

export interface FilesBackendsConnectSharefileResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * sia backend configuration
 */
export interface FilesBackendsConnectSiaRequest {
  /** Sia Daemon API Password.

Can be found in the apipassword file located in HOME/.sia/ or in the daemon directory. */
  api_password?: string;
  /** Sia daemon API URL, like http://sia.daemon.host:9980.

Note that siad must run with --disable-api-security to open API port for other hosts (not recommended).
Keep default if Sia daemon runs on localhost. */
  api_url?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Siad User Agent

Sia daemon requires the 'Sia-Agent' user agent by default for security */
  user_agent?: string;
}

export interface FilesBackendsConnectSiaResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * smb backend configuration
 */
export interface FilesBackendsConnectSmbRequest {
  /** Whether the server is configured to be case-insensitive.

Always true on Windows shares. */
  case_insensitive?: boolean;
  /** Description of the remote. */
  description?: string;
  /** Domain name for NTLM authentication. */
  domain?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Hide special shares (e.g. print$) which users aren't supposed to access. */
  hide_special_share?: boolean;
  /** SMB server hostname to connect to.

E.g. "example.com". */
  host: string;
  /** Max time before closing idle connections.

If no connections have been returned to the connection pool in the time
given, Hoody will empty the connection pool.

Set to 0 to keep connections indefinitely. (in seconds) */
  idle_timeout?: number;
  /** SMB password. */
  pass?: string;
  /** SMB port number. */
  port?: number;
  /** Service principal name.

Hoody-VFS presents this name to the server. Some servers use this as further
authentication, and it often needs to be set for clusters. For example:

 cifs/remotehost:1020

Leave blank if not sure. */
  spn?: string;
  /** SMB username. */
  user?: string;
}

export interface FilesBackendsConnectSmbResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * storj backend configuration
 */
export interface FilesBackendsConnectStorjRequest {
  /** Access grant. */
  access_grant?: string;
  /** API key. */
  api_key?: string;
  /** Description of the remote. */
  description?: string;
  /** Encryption passphrase.

To access existing objects enter passphrase used for uploading. */
  passphrase?: string;
  /** Choose an authentication method. */
  provider?: "existing" | "new";
  /** Satellite address.

Custom satellite address should match the format: `<nodeid>@<address>:<port>`. */
  satellite_address?: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io";
}

export interface FilesBackendsConnectStorjResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * sugarsync backend configuration
 */
export interface FilesBackendsConnectSugarsyncRequest {
  /** Sugarsync Access Key ID.

Leave blank to use Hoody's. */
  access_key_id?: string;
  /** Sugarsync App ID.

Leave blank to use Hoody's. */
  app_id?: string;
  /** Sugarsync authorization.

Leave blank normally, will be auto configured by Hoody. */
  authorization?: string;
  /** Sugarsync authorization expiry.

Leave blank normally, will be auto configured by Hoody. */
  authorization_expiry?: string;
  /** Sugarsync deleted folder id.

Leave blank normally, will be auto configured by Hoody. */
  deleted_id?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Permanently delete files if true
otherwise put them in the deleted files. */
  hard_delete?: boolean;
  /** Sugarsync Private Access Key.

Leave blank to use Hoody's. */
  private_access_key?: string;
  /** Sugarsync refresh token.

Leave blank normally, will be auto configured by Hoody. */
  refresh_token?: string;
  /** Sugarsync root id.

Leave blank normally, will be auto configured by Hoody. */
  root_id?: string;
  /** Sugarsync user.

Leave blank normally, will be auto configured by Hoody. */
  user?: string;
}

export interface FilesBackendsConnectSugarsyncResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * swift backend configuration
 */
export interface FilesBackendsConnectSwiftRequest {
  /** Application Credential ID (OS_APPLICATION_CREDENTIAL_ID). */
  application_credential_id?: string;
  /** Application Credential Name (OS_APPLICATION_CREDENTIAL_NAME). */
  application_credential_name?: string;
  /** Application Credential Secret (OS_APPLICATION_CREDENTIAL_SECRET). */
  application_credential_secret?: string;
  /** Authentication URL for server (OS_AUTH_URL). */
  auth?: "https://auth.api.rackspacecloud.com/v1.0" | "https://lon.auth.api.rackspacecloud.com/v1.0" | "https://identity.api.rackspacecloud.com/v2.0" | "https://auth.storage.memset.com/v1.0" | "https://auth.storage.memset.com/v2.0" | "https://auth.cloud.ovh.net/v3" | "https://authenticate.ain.net";
  /** Auth Token from alternate authentication - optional (OS_AUTH_TOKEN). */
  auth_token?: string;
  /** AuthVersion - optional - set to (1,2,3) if your auth URL has no version (ST_AUTH_VERSION). */
  auth_version?: number;
  /** Above this size files will be chunked.

Above this size files will be chunked into a a `_segments` container
or a `.file-segments` directory. (See the `use_segments_container` option
for more info). Default for this is 5 GiB which is its maximum value, which
means only files above this size will be chunked.

Hoody-VFS uploads chunked files as dynamic large objects (DLO). */
  chunk_size?: string;
  /** Description of the remote. */
  description?: string;
  /** User domain - optional (v3 auth) (OS_USER_DOMAIN_NAME) */
  domain?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Endpoint type to choose from the service catalogue (OS_ENDPOINT_TYPE). */
  endpoint_type?: "public" | "internal" | "admin";
  /** Get swift credentials from environment variables in standard OpenStack form. */
  env_auth?: boolean;
  /** When paginating, always fetch unless we received an empty page.

Consider using this option if Hoody listings show fewer objects
than expected, or if repeated syncs copy unchanged objects.

It is safe to enable this, but Hoody may make more API calls than
necessary.

This is one of a pair of workarounds to handle implementations
of the Swift API that do not implement pagination as expected. See
also "partial_page_fetch_threshold". */
  fetch_until_empty_page?: boolean;
  /** API key or password (OS_PASSWORD). */
  key?: string;
  /** If true avoid calling abort upload on a failure.

It should be set to true for resuming uploads across different sessions. */
  leave_parts_on_error?: boolean;
  /** Don't chunk files during streaming upload.

When doing streaming uploads (e.g. using `rcat` or `mount` with
`--vfs-cache-mode off`) setting this flag will cause the swift backend
to not upload chunked files.

This will limit the maximum streamed upload size to 5 GiB. This is
useful because non chunked files are easier to deal with and have an
MD5SUM.

Hoody-VFS will still chunk files bigger than `chunk_size` when doing
normal copy operations. */
  no_chunk?: boolean;
  /** Disable support for static and dynamic large objects

Swift cannot transparently store files bigger than 5 GiB. There are
two schemes for chunking large files, static large objects (SLO) or
dynamic large objects (DLO), and the API does not allow Hoody to
determine whether a file is a static or dynamic large object without
doing a HEAD on the object. Since these need to be treated
differently, this means Hoody has to issue HEAD requests for objects
for example when reading checksums.

When `no_large_objects` is set, Hoody will assume that there are no
static or dynamic large objects stored. This means it can stop doing
the extra HEAD calls which in turn increases performance greatly
especially when doing a swift to swift transfer with `--checksum` set.

Setting this option implies `no_chunk` and also that no files will be
uploaded in chunks, so files bigger than 5 GiB will just fail on
upload.

If you set this option and there **are** static or dynamic large objects,
then this will give incorrect hashes for them. Downloads will succeed,
but other operations such as Remove and Copy will fail. */
  no_large_objects?: boolean;
  /** When paginating, fetch if the current page is within this percentage of the limit.

Consider using this option if Hoody listings show fewer objects
than expected, or if repeated syncs copy unchanged objects.

It is safe to enable this, but Hoody may make more API calls than
necessary.

This is one of a pair of workarounds to handle implementations
of the Swift API that do not implement pagination as expected. See
also "fetch_until_empty_page". */
  partial_page_fetch_threshold?: number;
  /** Region name - optional (OS_REGION_NAME). */
  region?: string;
  /** The storage policy to use when creating a new container.

This applies the specified storage policy when creating a new
container. The policy cannot be changed afterwards. The allowed
configuration values and their meaning depend on your Swift storage
provider. */
  storage_policy?: "" | "pcs" | "pca";
  /** Storage URL - optional (OS_STORAGE_URL). */
  storage_url?: string;
  /** Tenant name - optional for v1 auth, this or tenant_id required otherwise (OS_TENANT_NAME or OS_PROJECT_NAME). */
  tenant?: string;
  /** Tenant domain - optional (v3 auth) (OS_PROJECT_DOMAIN_NAME). */
  tenant_domain?: string;
  /** Tenant ID - optional for v1 auth, this or tenant required otherwise (OS_TENANT_ID). */
  tenant_id?: string;
  /** Choose destination for large object segments

Swift cannot transparently store files bigger than 5 GiB and Hoody
will chunk files larger than `chunk_size` (default 5 GiB) in order to
upload them.

If this value is `true` the chunks will be stored in an additional
container named the same as the destination container but with
`_segments` appended. This means that there won't be any duplicated
data in the original container but having another container may not be
acceptable.

If this value is `false` the chunks will be stored in a
`.file-segments` directory in the root of the container. This
directory will be omitted when listing the container. Some
providers (eg Blomp) require this mode as creating additional
containers isn't allowed. If it is desired to see the `.file-segments`
directory in the root then this flag must be set to `true`.

If this value is `unset` (the default), then Hoody will choose the value
to use. It will be `false` unless Hoody detects any `auth_url`s that
it knows need it to be `true`. In this case you'll see a message in
the DEBUG log. */
  use_segments_container?: string;
  /** User name to log in (OS_USERNAME). */
  user?: string;
  /** User ID to log in - optional - most swift systems use user and leave this blank (v3 auth) (OS_USER_ID). */
  user_id?: string;
}

export interface FilesBackendsConnectSwiftResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * tardigrade backend configuration
 */
export interface FilesBackendsConnectTardigradeRequest {
  /** Access grant. */
  access_grant?: string;
  /** API key. */
  api_key?: string;
  /** Description of the remote. */
  description?: string;
  /** Encryption passphrase.

To access existing objects enter passphrase used for uploading. */
  passphrase?: string;
  /** Choose an authentication method. */
  provider?: "existing" | "new";
  /** Satellite address.

Custom satellite address should match the format: `<nodeid>@<address>:<port>`. */
  satellite_address?: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io";
}

export interface FilesBackendsConnectTardigradeResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * ulozto backend configuration
 */
export interface FilesBackendsConnectUloztoRequest {
  /** The application token identifying the app. An app API key can be either found in the API
doc https://uloz.to/upload-resumable-api-beta or obtained from customer service. */
  app_token?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** The size of a single page for list commands. 1-500 */
  list_page_size?: number;
  /** The password for the user. */
  password?: string;
  /** If set, Hoody will use this folder as the root folder for all operations. For example,
if the slug identifies 'foo/bar/', 'ulozto:baz' is equivalent to 'ulozto:foo/bar/baz' without
any root slug set. */
  root_folder_slug?: string;
  /** The username of the principal to operate as. */
  username?: string;
}

export interface FilesBackendsConnectUloztoResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * union backend configuration
 */
export interface FilesBackendsConnectUnionRequest {
  /** Policy to choose upstream on ACTION category. */
  action_policy?: string;
  /** Cache time of usage and free space (in seconds).

This option is only useful when a path preserving policy is used. */
  cache_time?: number;
  /** Policy to choose upstream on CREATE category. */
  create_policy?: string;
  /** Description of the remote. */
  description?: string;
  /** Minimum viable free space for lfs/eplfs policies.

If a remote has less than this much free space then it won't be
considered for use in lfs or eplfs policies. */
  min_free_space?: string;
  /** Policy to choose upstream on SEARCH category. */
  search_policy?: string;
  /** List of space separated upstreams.

Can be 'upstreama:test/dir upstreamb:', '"upstreama:test/space:ro dir" upstreamb:', etc. */
  upstreams: string;
}

export interface FilesBackendsConnectUnionResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * uptobox backend configuration
 */
export interface FilesBackendsConnectUptoboxRequest {
  /** Your access token.

Get it from https://uptobox.com/my_account. */
  access_token?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Set to make uploaded files private */
  private?: boolean;
}

export interface FilesBackendsConnectUptoboxResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * webdav backend configuration
 */
export interface FilesBackendsConnectWebdavRequest {
  /** Preserve authentication on redirect.

If the server redirects Hoody to a new domain when it is trying to
read a file then normally Hoody will drop the Authorization: header
from the request.

This is standard security practice to avoid sending your credentials
to an unknown webserver.

However this is desirable in some circumstances. If you are getting
an error like "401 Unauthorized" when Hoody is attempting to read
files from the webdav server then you can try this option. */
  auth_redirect?: boolean;
  /** Bearer token instead of user/pass (e.g. a Macaroon). */
  bearer_token?: string;
  /** Command to run to get a bearer token. */
  bearer_token_command?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info.

Default encoding is Slash,LtGt,DoubleQuote,Colon,Question,Asterisk,Pipe,Hash,Percent,BackSlash,Del,Ctl,LeftSpace,LeftTilde,RightSpace,RightPeriod,InvalidUtf8 for sharepoint-ntlm or identity otherwise. */
  encoding?: string;
  /** Set HTTP headers for all transactions.

Use this to set additional HTTP headers for all transactions

The input format is comma separated list of key,value pairs. Standard
[CSV encoding](https://godoc.org/encoding/csv) may be used.

For example, to set a Cookie use 'Cookie,name=value', or '"Cookie","name=value"'.

You can set multiple headers, e.g. '"Cookie","name=value","Authorization","xxx"'. */
  headers?: string;
  /** Nextcloud upload chunk size.

We recommend configuring your NextCloud instance to increase the max chunk size to 1 GB for better upload performances.
See https://docs.nextcloud.com/server/latest/admin_manual/configuration_files/big_file_upload_configuration.html#adjust-chunk-size-on-nextcloud-side

Set to 0 to disable chunked uploading. */
  nextcloud_chunk_size?: string;
  /** Exclude ownCloud mounted storages */
  owncloud_exclude_mounts?: boolean;
  /** Exclude ownCloud shares */
  owncloud_exclude_shares?: boolean;
  /** Minimum time to sleep between API calls. (in seconds) */
  pacer_min_sleep?: number;
  /** Password. */
  pass?: string;
  /** Path to a unix domain socket to dial to, instead of opening a TCP connection directly */
  unix_socket?: string;
  /** URL of http host to connect to.

E.g. https://example.com. */
  url: string;
  /** User name.

In case NTLM authentication is used, the username should be in the format 'Domain\User'. */
  user?: string;
  /** Name of the WebDAV site/service/software you are using. */
  vendor?: "fastmail" | "nextcloud" | "owncloud" | "sharepoint" | "sharepoint-ntlm" | "hoody-vfs" | "other";
}

export interface FilesBackendsConnectWebdavResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * yandex backend configuration
 */
export interface FilesBackendsConnectYandexRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Delete files permanently rather than putting them into the trash. */
  hard_delete?: boolean;
  /** Set the user agent to match an official version of the yandex disk client. May help with upload performance. */
  spoof_ua?: boolean;
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
}

export interface FilesBackendsConnectYandexResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

/**
 * zoho backend configuration
 */
export interface FilesBackendsConnectZohoRequest {
  /** Auth server URL.

Leave blank to use the provider defaults. */
  auth_url?: string;
  /** Use client credentials OAuth flow.

This will use the OAUTH2 client Credentials Flow as described in RFC 6749. */
  client_credentials?: boolean;
  /** OAuth Client Id.

Leave blank normally. */
  client_id?: string;
  /** OAuth Client Secret.

Leave blank normally. */
  client_secret?: string;
  /** Description of the remote. */
  description?: string;
  /** The encoding for the backend.

See the [encoding section in the overview](/overview/#encoding) for more info. */
  encoding?: string;
  /** Zoho region to connect to.

You'll have to use the region your organization is registered in. If
not sure use the same top level domain as you connect to in your
browser. */
  region?: "com" | "eu" | "in" | "jp" | "com.cn" | "com.au";
  /** OAuth Access Token as a JSON blob. */
  token?: string;
  /** Token server url.

Leave blank to use the provider defaults. */
  token_url?: string;
  /** Cutoff for switching to large file upload api (>= 10 MiB). */
  upload_cutoff?: string;
}

export interface FilesBackendsConnectZohoResponse {
  data: { backend_type?: string; id: string; mount_paths?: string[]; type?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

export interface FilesBackendsGetDetailsResponse {
  statusCode: number;
  message: string;
  data: { backend_type?: string; connected?: boolean; created_at?: string; id: string; last_used?: string; mount_paths?: string[]; server?: string; user?: string };
}

/**
 * Credential fields to update. Allowed keys: pass, password, key, passphrase, token, refresh_token, auth_token, bearer_token, session_token, secret, secret_key, secret_access_key, access_key_id, client_secret, client_id, service_account_credentials, private_key. Values must be strings or null (null deletes the field).
 */
export type FilesBackendsUpdateRequest = Record<string, unknown>;

export interface FilesBackendsUpdateResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface FilesBackendsDisconnectResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface FilesBackendsTestConnectionResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

/**
 * List of currently running downloads
 */
export interface FilesDownloadsListGlobalResponse {
  statusCode: number;
  message: string;
  data: { downloads?: DownloadProgress[] };
}

/**
 * List of currently running archive extractions
 */
export interface FilesArchivesListGlobalResponse {
  statusCode: number;
  message: string;
  data: { extractions?: ExtractionProgress[] };
}

/**
 * Result of an append operation
 */
export interface FilesAppendResponse {
  statusCode: number;
  message: string;
  data: { new_size?: number; path?: string; success?: boolean };
}

/**
 * Result of a chmod operation
 */
export interface FilesChmodResponse {
  statusCode: number;
  message: string;
  data: { mode?: string; path?: string; success?: boolean };
}

/**
 * Result of a chown operation
 */
export interface FilesChownResponse {
  statusCode: number;
  message: string;
  data: { group?: string; owner?: string; path?: string; success?: boolean };
}

/**
 * Result of a copy operation
 */
export interface FilesCopyResponse {
  statusCode: number;
  message: string;
  data: { destination?: string; source?: string; success?: boolean };
}

/**
 * Results of a file pattern search (glob) operation
 */
export interface FilesGlobResponse {
  statusCode: number;
  message: string;
  data: { count: number; duration_ms: number; entries: GlobEntry[]; path: string; pattern: string; total_scanned: number; truncated: boolean };
}

/**
 * Results of a content search (grep) operation
 */
export interface FilesGrepResponse {
  statusCode: number;
  message: string;
  data: { duration_ms: number; matches: GrepMatch[]; path: string; pattern: string; total_files_matched: number; total_files_searched: number; total_matches: number; truncated: boolean };
}

/**
 * Result of a move operation
 */
export interface FilesMoveResponse {
  statusCode: number;
  message: string;
  data: { destination?: string; source?: string; success?: boolean };
}

export interface FilesRealpathResponse {
  statusCode: number;
  message: string;
  data: { path: string; real_path: string };
}

/**
 * File or directory metadata (stat)
 */
export interface FilesStatResponse {
  statusCode: number;
  message: string;
  data: { group?: string; is_symlink?: boolean; mtime?: number; name?: string; owner?: string; path?: string; path_type?: "File" | "Dir" | "SymlinkFile" | "SymlinkDir"; permissions?: string; revisions?: number | null; size?: number; symlink_target?: string | null };
}

export interface FilesGetResponse {
  statusCode: number;
  message: string;
  data: DirectoryListing | GrepResults | GlobResults;
}

export interface FilesOperateResponse {
  statusCode: number;
  message: string;
  data: MoveResponse | CopyResponse;
}

/**
 * Result of an append operation
 */
export interface FilesPutResponse {
  statusCode: number;
  message: string;
  data: { new_size?: number; path?: string; success?: boolean };
}

export type FilesPatchApiRequest = MoveRequest | RenameRequest;

export interface FilesPatchApiResponse {
  statusCode: number;
  message: string;
  data: ChmodResponse | ChownResponse | MoveResponse;
}

export interface FilesDeleteResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface FilesJournalQueryResponse {
  statusCode: number;
  message: string;
  data: { count: number; entries: ({ after?: string | null; before?: string | null; blob?: boolean | null; blob_after?: boolean | null; blob_before?: boolean | null; dest?: string | null; hash?: string | null; id: number; new_group?: string | null; new_mode?: string | null; new_owner?: string | null; old_group?: string | null; old_mode?: string | null; old_owner?: string | null; op: "create" | "write" | "append" | "delete" | "touch" | "moved_from" | "moved_to" | "copied_from" | "copied_to" | "dir_moved_from" | "dir_moved_to" | "dir_copied_from" | "dir_copied_to" | "dir_deleted" | "mkdir" | "chmod" | "chown" | "gap"; path: string; reason?: string | null; seq?: number | null; size?: number | null; size_after?: number | null; size_before?: number | null; source?: string | null; ts: number })[]; has_more: boolean; next_after_id?: number | null };
}

export interface FilesJournalFlushResponse {
  statusCode: number;
  message: string;
  data: { flushed: boolean };
}

export interface FilesJournalGetStatsResponse {
  statusCode: number;
  message: string;
  data: { entries_skipped_total: number; newest_entry_ts?: number | null; parse_failures: number; pruned_before_date?: string | null; skipped_overflow: number; total_blob_bytes: number; total_blobs: number; total_entries: number; total_storage_bytes: number; writer_healthy: boolean };
}

export interface FilesMountsListResponse {
  statusCode: number;
  message: string;
  data: { count?: number; mounts?: ({ backend_id?: string; created_at?: number; id: string; label?: string | null; mount_path?: string; status?: string })[] };
}

export interface FilesMountsCreateRequest {
  /** ID of an existing backend connection */
  backend_id: string;
  /** Optional human-readable label for this mount (e.g., "My NAS", "Work S3", "Photos Backup"). Used by the UI to identify mounts. Can be used to filter mounts via GET /api/v1/mounts?label=... */
  label?: string;
  /** Path for the mount. If omitted, defaults to /hoody/mounts/mount_{uuid}. Relative paths are resolved under the server's mount directory (/hoody/mounts/ by default). */
  mount_path?: string;
  /** VFS configuration for performance tuning (optional) */
  vfs_config?: { cache_max_age?: number | string; cache_max_size?: number | string; cache_mode?: "off" | "minimal" | "writes" | "full"; dir_cache_time?: number | string };
}

export interface FilesMountsCreateResponse {
  data: { backend_id?: string; id: string; label?: string | null; mount_path?: string; status?: string };
  message: string;
  success?: boolean;
  statusCode: number;
}

export interface FilesMountsGetDetailsResponse {
  statusCode: number;
  message: string;
  data: { backend_id?: string; created_at?: number; id: string; label?: string | null; mount_path?: string; status?: string; vfs_config?: Record<string, unknown> };
}

export interface FilesMountsUpdateRequest {
  /** VFS configuration parameters */
  vfs_config: Record<string, unknown>;
}

export interface FilesMountsUpdateResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface FilesMountsUnmountResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface FilesSystemGetApiVersionResponse {
  statusCode: number;
  message: string;
  data: { server_version?: string; version?: string };
}

/**
 * Result of archive extraction operation
 */
export interface FilesArchivesExtractResponse {
  destination?: string;
  error?: string | null;
  extracted_bytes?: number;
  extracted_files?: number;
  extraction_id?: string;
  message: string;
  selective?: boolean;
  selective_path?: string | null;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

/**
 * Result of archive extraction operation
 */
export interface FilesArchivesExtractFileResponse {
  destination?: string;
  error?: string | null;
  extracted_bytes?: number;
  extracted_files?: number;
  extraction_id?: string;
  message: string;
  selective?: boolean;
  selective_path?: string | null;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

/**
 * Contents listing of an archive file
 */
export interface FilesArchivesPreviewResponse {
  statusCode: number;
  message: string;
  data: { entries?: ArchiveEntry[]; format?: "zip" | "tar" | "tar.gz" | "tar.bz2" | "tar.xz"; total_compressed_size?: number | null; total_files?: number; total_size?: number };
}

/**
 * Result of file download from remote URL
 */
export interface FilesDownloadsFetchResponse {
  download_id?: string;
  error?: string | null;
  filename?: string;
  message: string;
  path?: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

/**
 * List of currently running downloads
 */
export interface FilesDownloadsListActiveResponse {
  statusCode: number;
  message: string;
  data: { downloads?: DownloadProgress[] };
}

export interface FilesSearchResponse {
  statusCode: number;
  message: string;
  data: { allow_archive?: boolean; allow_delete?: boolean; allow_search?: boolean; allow_upload?: boolean; auth?: boolean; dir_exists?: boolean; href?: string; kind?: "Index"; paths?: PathItem[]; uri_prefix?: string; user?: string | null };
}

export interface FilesListDirectoryResponse {
  statusCode: number;
  message: string;
  data: { allow_archive?: boolean; allow_delete?: boolean; allow_search?: boolean; allow_upload?: boolean; auth?: boolean; dir_exists?: boolean; href?: string; kind?: "Index"; paths?: PathItem[]; uri_prefix?: string; user?: string | null };
}

export type FilesPatchRequest = ChmodRequest | ChownRequest | RenameRequest;

export interface FilesDeleteRecursiveResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface NotificationsDismissRequest {
  /** Optional display ID to scope the dismissal */
  displayId?: string;
  /** Array of notification IDs to dismiss */
  notificationIds: number[];
}

export interface NotificationsDismissResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface NotificationsClearDismissedResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export type NotificationsNotifyTriggerRequest = NotifyRequest;

export interface NotificationsNotifyTriggerResponse {
  message: string;
  success?: boolean;
  statusCode: number;
  data: unknown;
}

export interface NotificationsListResponse {
  data: { count?: number; displays?: string[]; notifications?: Notification[] };
  success?: boolean;
  statusCode: number;
  message: string;
}

export type SqliteDatabaseExecuteTransactionRequest = main_request;

export type SqliteKvStoreSetRequest = string;

export type SqliteKvStorePushRequest = Record<string, unknown>;

export type SqliteKvStoreRemoveElementRequest = Record<string, unknown>;

export type SqliteKvStoreBatchDeleteRequest = Record<string, unknown>;

export type SqliteKvStoreBatchGetRequest = Record<string, unknown>;

export type SqliteKvStoreBatchSetRequest = Record<string, unknown>;

export type SqliteKvStoreRollbackTableRequest = Record<string, unknown>;

export type RunMaintenanceRequest = Record<string, unknown>;

export interface TerminalExecutionExecuteRequest {
  /** The command to execute */
  command: string;
  /** Custom command ID (numeric 1-65535, auto-generated if not provided) */
  id?: string;
  /** Timeout in seconds (0 = no timeout, default: 0) */
  timeout?: number;
  /** Whether to wait for completion (default: true; forced false when defer_pid is set) */
  wait?: boolean;
  /** Working directory for command execution (for local bash only) */
  cwd?: string;
  /** Environment variables as key-value pairs */
  env?: Record<string, unknown>;
}

export interface TerminalExecutionExecuteResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSessionsCreateRequest {
  /** Terminal session ID (numeric 1-65535). Required unless ephemeral is true, in which case it is auto-generated (range 40000-65535). */
  terminal_id?: string;
  /** Auto-generate terminal ID and enable ephemeral session mode. Ephemeral sessions auto-clean after idle timeout and strip DISPLAY environment. (default: false) */
  ephemeral?: boolean;
  /** X11 display number (e.g., "1" or ":1"). Sets the DISPLAY env var and enables Hoody Display readiness waiting. */
  display?: string;
  /** Shell to use (bash/zsh/fish/sh). Ignored for SSH sessions. */
  shell?: string;
  /** System user to spawn the shell as. Ignored for SSH sessions. */
  user?: string;
  /** Working directory for the terminal. Ignored for SSH sessions. */
  cwd?: string;
  /** Path to startup script to run */
  startup_script?: string;
  /** Show welcome message on startup (default: false) */
  welcome?: boolean;
  /** Enable debug output in wrapper script (default: false) */
  debug?: boolean;
  /** Enable Hoody Display desktop mode. Provides a full desktop environment instead of seamless individual windows (default: false) */
  desktop?: boolean;
  /** Desktop environment to launch (implies desktop=true). Valid values: xfce, mate */
  desktop_env?: string;
  /** Terminal columns (default: 80) */
  cols?: number;
  /** Terminal rows (default: 24) */
  rows?: number;
  /** Whether to wait for Hoody Display readiness (default: true when display is configured) */
  wait_until_display?: boolean;
  /** Timeout in seconds for waiting (default: 300) */
  wait_timeout?: number;
  /** SSH hostname/IP. Required together with ssh_user for SSH sessions. */
  ssh_host?: string;
  /** SSH username. Required together with ssh_host for SSH sessions. */
  ssh_user?: string;
  /** SSH port (default: 22) */
  ssh_port?: string;
  /** SSH password. Cannot contain shell-dangerous characters. */
  ssh_password?: string;
  /** Base64-encoded SSH private key (PEM format) */
  ssh_key?: string;
  /** SOCKS5 proxy hostname/IP for routing SSH connections */
  socks5_host?: string;
  /** SOCKS5 proxy port (default: 1080) */
  socks5_port?: string;
  /** SOCKS5 proxy authentication username */
  socks5_user?: string;
  /** SOCKS5 proxy authentication password */
  socks5_pass?: string;
}

export interface TerminalSessionsCreateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalExecutionGetResultResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSessionsListHistoryResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSessionsDeleteResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalDocsGetJsonResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemSendSignalRequest {
  /** Process ID to signal (mutually exclusive with name) */
  pid?: number;
  /** Process name to signal - signals ALL matching processes (mutually exclusive with pid) */
  name?: string;
  /** Signal to send. String form accepts `SIGTERM`, `TERM`, `15`, etc. (with or without `SIG` prefix). Integer form accepts any value in `[0, NSIG)` including realtime signals `SIGRTMIN`..`SIGRTMAX` (typically 34..64 on Linux), which have no portable string names. */
  signal?: unknown;
  /** Shorthand for SIGKILL (true) or SIGTERM (false) - overrides signal parameter */
  force?: boolean;
}

export interface TerminalSystemSendSignalResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface FreezeProcessRequest {
  /** Process ID to freeze (mutually exclusive with name). PIDs 1 (init), 2 (kthreadd), the server's own PID, and the server's parent PID are guarded — freezing them would wedge the host or the daemon — and are rejected with 403. */
  pid?: number;
  /** Process name (case-insensitive `comm` match — freezes EVERY matching process; mutually exclusive with pid). NOTE: Linux truncates `comm` to TASK_COMM_LEN-1 = 15 chars; a name longer than 15 characters silently matches nothing. */
  name?: string;
  /** When true, also freezes every descendant via a one-shot /proc PPID snapshot (bounded at 65535 PIDs). Default false. The parent is signalled before descendants to shrink the fork/escape race window — but the operation is best-effort, not atomic. With descendants, by-name dedupes overlapping subtrees so the same PID isn't signalled twice. */
  include_descendants?: boolean;
}

export interface FreezeProcessResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface UnfreezeProcessRequest {
  /** Process ID to unfreeze (mutually exclusive with name). The guarded-PID set (1, 2, self, parent) is the same as for freeze; calling unfreeze on a guarded PID returns 403. */
  pid?: number;
  /** Process name (case-insensitive comm match; mutually exclusive with pid). NOTE: Linux truncates `comm` to 15 chars; longer names silently match nothing. */
  name?: string;
  /** Also unfreeze all descendants via /proc PPID snapshot (bounded at 65535 PIDs). Default false. By-name dedupes overlapping subtrees. */
  include_descendants?: boolean;
}

export interface UnfreezeProcessResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalWriteRequest {
  /** The text to type into the terminal */
  input: string;
  /** Auto-append Enter (newline) after input. Default: true. Set to false for raw keystroke input */
  enter?: boolean;
}

export interface TerminalWriteResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemShutdownResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemRebootResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalAbortRequest {
  /** Send SIGKILL to process group instead of SIGINT (default: false) */
  force?: boolean;
}

export interface TerminalAbortResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSessionsListResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemGetDisplayInfoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemListPortsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemGetDaemonConfigResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface PostTerminalStateRequest {
  /** Frontend build identifier */
  build_id?: string;
  /** Effective renderer (webgl|dom) */
  renderer?: string;
  /** What triggered this beacon */
  reason?: string;
}

export interface PostTerminalStateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface GetTerminalSnapshotResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface FindInTerminalResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface PressTerminalKeysRequest {
  /** Array of key names to press in sequence (e.g. ["ctrl+c", "arrow_up", "enter"]). Mutually exclusive with `key`. Maximum 256 entries per request. */
  keys?: unknown[];
  /** Single key name for one-shot press (e.g. "enter"). Mutually exclusive with `keys` */
  key?: string;
}

export interface PressTerminalKeysResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface SendTerminalMouseEventsRequest {
  event?: TerminalMouseEvent;
  /**
   * @minItems 1
   * @maxItems 256
   */
  events?: TerminalMouseEvent[];
}

export interface SendTerminalMouseEventsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface PasteTerminalTextRequest {
  /** Text to paste (UTF-8) */
  text: string;
  /** Use bracketed paste mode if the program supports it. Default: true */
  bracketed?: boolean;
}

export interface PasteTerminalTextResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface WaitForTerminalRequest {
  /** Wait mode: stable, regex, or either. Default: stable */
  mode?: string;
  /** Stable mode debounce in milliseconds (10-60000). Default: 100 */
  debounce_ms?: number;
  /** PCRE2 regex pattern (required for regex/either modes, max 1024 bytes) */
  pattern?: string;
  /** Hard deadline in milliseconds (10-300000). Default: 5000 */
  timeout_ms?: number;
  /** Where to search: screen, scrollback, or all. Default: screen */
  search_scope?: string;
  /** Include colored_lines in response snapshot. Default: false */
  include_colors?: boolean;
  /** Include highlights in response snapshot. Default: true */
  include_highlights?: boolean;
}

export interface WaitForTerminalResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface GetAutomationMetricsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface ListSupportedKeysResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface GetSessionAutomationStateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface BeginTerminalDropResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface UploadTerminalDropSliceResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface CommitTerminalDropRequest {
  /** Drop context: "drop" or "paste" */
  ctx: string;
  /** Drop cell row (Chat grid pane mapping) */
  r?: number;
  /** Drop cell column */
  c?: number;
  /** Clip-read correlation nonce ([A-Za-z0-9_-]{1,64}); echoed verbatim as the injected frame's cr field so the TUI can match a clipboard-read landing. Invalid/oversized values are ignored. */
  cr?: string;
  /** Manifest entries [{p,d,s,name,h?}] */
  items: unknown[];
}

export interface CommitTerminalDropResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface OneShotTerminalDropRequest {
  /** Drop context: "drop" or "paste" */
  ctx: string;
  /** Drop cell row */
  r?: number;
  /** Drop cell column */
  c?: number;
  /** File/dir items ([{name,b64}|{name,dir:true,items:[...]}]) */
  items: unknown[];
}

export interface OneShotTerminalDropResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemListProcessesResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemGetProcessResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface TerminalSystemGetResourcesResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface WatchHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { built?: string | null; fds?: number | null; ip: string; memory?: null | HealthMemory4; pid: number /* min: 0 */; service: string; started: string; status: string; userAgent?: string | null };
}

export interface WatchWatchersListResponse {
  statusCode: number;
  message: string;
  data: { items: WatcherResponse[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export type WatchWatchersCreateRequest = CreateWatcherRequest;

export interface WatchWatchersCreateResponse {
  statusCode: number;
  message: string;
  data: { config: WatcherConfigView; created_at: string; id: string; stats: WatcherStats };
}

export interface WatchWatchersGetResponse {
  statusCode: number;
  message: string;
  data: { config: WatcherConfigView; created_at: string; id: string; stats: WatcherStats };
}

export interface WatchWatchersDeleteResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean; id: string };
}

export interface WatchStreamsListEventsResponse {
  statusCode: number;
  message: string;
  data: { items: FileEvent[]; limit: number /* min: 0 */; newest_available_id?: number | null; newest_available_timestamp?: string | null; oldest_available_id?: number | null; oldest_available_timestamp?: string | null; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export interface CronCrontabListGlobalResponse {
  statusCode: number;
  message: string;
  data: { items: RawCrontabResponse[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export interface CronHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { built?: string | null; fds?: number | null; ip: string; memory?: null | HealthMemory5; pid: number /* min: 0 */; service: string; started: string; status: string; user_agent?: string | null };
}

export interface CronCrontabGetResponse {
  statusCode: number;
  message: string;
  data: { crontab: string; user: string };
}

export type CronCrontabPutRequest = RawCrontabRequest;

export interface CronCrontabPutResponse {
  statusCode: number;
  message: string;
  data: { crontab: string; removed_expired: number /* min: 0 */; user: string };
}

export interface CronEntriesListResponse {
  statusCode: number;
  message: string;
  data: { entries: CrontabEntryView[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */; user: string };
}

export type CronEntriesCreateRequest = CreateEntryRequest;

export interface CronEntriesCreateResponse {
  statusCode: number;
  message: string;
  data: { command: string; comment?: string | null; created_at: string; enabled: boolean; expired: boolean; expires_at?: string | null; id: string; name?: string | null; schedule: string; schedule_human: string; updated_at: string; user: string };
}

export interface CronEntriesGetResponse {
  statusCode: number;
  message: string;
  data: { command: string; comment?: string | null; created_at: string; enabled: boolean; expired: boolean; expires_at?: string | null; id: string; name?: string | null; schedule: string; schedule_human: string; updated_at: string; user: string };
}

export type CronEntriesUpdateRequest = UpdateEntryRequest;

export interface CronEntriesUpdateResponse {
  statusCode: number;
  message: string;
  data: { command: string; comment?: string | null; created_at: string; enabled: boolean; expired: boolean; expires_at?: string | null; id: string; name?: string | null; schedule: string; schedule_human: string; updated_at: string; user: string };
}

export interface CronEntriesDeleteResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean };
}

export interface PipeHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { status: "ok"; service: string; built?: string | null; started: string; memory?: HealthMemory6 | null; fds?: number | null; pid: number; ip: string; userAgent?: string | null };
}

/**
 * HealthResponse
 */
export interface NotesHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { status: "ok"; service: string; built: string | null; started: string; memory: { rss: number; heap: number | null } | null; fds: number | null; pid: number; ip: string; userAgent: string | null };
}

export interface NotesSocketsInitResponse {
  statusCode: number;
  message: string;
  data: { id: string };
}

export interface NotesAvatarsUploadResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; id: string };
}

export interface NotesListNotebooksResponse {
  statusCode: number;
  message: string;
  data: { notebooks: ({ id: string; name: string; description?: string | null; avatar?: string | null; user: { id: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" }; status: 1 | 2 | 3; maxFileSize?: string })[] };
}

export interface NotesNotebooksCreateRequest {
  name: string;
  description?: string | null;
  avatar?: string | null;
}

export interface NotesNotebooksCreateResponse {
  statusCode: number;
  message: string;
  data: { id: string; name: string; description?: string | null; avatar?: string | null; user: { id: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" }; status: 1 | 2 | 3; maxFileSize?: string };
}

export interface NotesNotebooksGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; name: string; description?: string | null; avatar?: string | null; user: { id: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" }; status: 1 | 2 | 3; maxFileSize?: string };
}

export interface NotesNotebooksUpdateRequest {
  name: string;
  description?: string | null;
  avatar?: string | null;
}

export interface NotesNotebooksUpdateResponse {
  statusCode: number;
  message: string;
  data: { id: string; name: string; description?: string | null; avatar?: string | null; user: { id: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" }; status: 1 | 2 | 3; maxFileSize?: string };
}

export interface NotesNotebooksDeleteResponse {
  statusCode: number;
  message: string;
  data: { id: string; name: string; description?: string | null; avatar?: string | null; user: { id: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" }; status: 1 | 2 | 3; maxFileSize?: string };
}

export interface NotesFilesListResponse {
  statusCode: number;
  message: string;
  data: { files: ({ id: string; name: string; mimeType: string; size: number; createdAt: string; createdBy: string; documentId: string; documentName: string | null })[]; total: number };
}

export interface NotesNodesListResponse {
  statusCode: number;
  message: string;
  data: { nodes: Record<string, unknown>[]; total: number };
}

export interface NotesNodesCreateRequest {
  id?: string;
  type: string;
  parentId?: string;
  attributes: Record<string, unknown>;
}

export interface NotesNodesCreateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesNodesGetByAliasResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesNodesGetResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesNodesUpdateRequest {
  attributes: Record<string, unknown>;
}

export interface NotesNodesUpdateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesNodesDeleteResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesNodesListChildrenResponse {
  statusCode: number;
  message: string;
  data: { nodes: Record<string, unknown>[]; total: number };
}

export interface NotesDocumentsCreateExportTicketRequest {
  output?: "html";
  includeComments?: "none" | "appendix";
  includeBackground?: boolean;
  themeMode?: "light" | "dark";
  themeId?: string | null;
  themeVariables?: Record<string, unknown>;
  /** @maxLength 128 */
  fileName?: string;
}

export interface NotesDocumentsCreateExportTicketResponse {
  statusCode: number;
  message: string;
  data: { ticket: string; expiresAt: string; usesRemaining: number /* min: 1, max: 9007199254740991 */ };
}

export interface NotesDocumentsGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; content: Record<string, unknown>; createdAt: string; createdBy: string; updatedAt: string | null; updatedBy: string | null };
}

export interface NotesDocumentsPutRequest {
  content: Record<string, unknown>;
}

export interface NotesDocumentsPutResponse {
  statusCode: number;
  message: string;
  data: { id: string; content: Record<string, unknown>; createdAt: string; createdBy: string; updatedAt: string | null; updatedBy: string | null };
}

export interface NotesDocumentsPatchRequest {
  content: Record<string, unknown>;
}

export interface NotesDocumentsPatchResponse {
  statusCode: number;
  message: string;
  data: { id: string; content: Record<string, unknown>; createdAt: string; createdBy: string; updatedAt: string | null; updatedBy: string | null };
}

export type NotesAppendDocumentRequest = { text: string; type?: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"; attrs?: Record<string, unknown> | null } | { blocks: ({ type?: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock" | "horizontalRule"; content?: ({ type: "text"; text: string; marks?: ({ type: string; attrs?: Record<string, unknown> | null })[] | null })[]; attrs?: Record<string, unknown> | null })[] };

export interface NotesAppendDocumentResponse {
  statusCode: number;
  message: string;
  data: { id: string; content: Record<string, unknown>; createdAt: string; createdBy: string; updatedAt: string | null; updatedBy: string | null; appendedBlockIds: string[] };
}

export interface NotesCollaboratorsListResponse {
  statusCode: number;
  message: string;
  data: { collaborators: ({ userId: string; role: "admin" | "editor" | "collaborator" | "viewer"; name: string | null; username: string | null; avatar: string | null; createdAt: string; updatedAt: string | null })[] };
}

export interface NotesCollaboratorsAddRequest {
  collaboratorId: string;
  role: "admin" | "editor" | "collaborator" | "viewer";
}

export interface NotesCollaboratorsAddResponse {
  statusCode: number;
  message: string;
  data: { userId: string; role: "admin" | "editor" | "collaborator" | "viewer"; createdAt: string; updatedAt: string | null };
}

export interface NotesCollaboratorsUpdateRequest {
  role: "admin" | "editor" | "collaborator" | "viewer";
}

export interface NotesCollaboratorsUpdateResponse {
  statusCode: number;
  message: string;
  data: { userId: string; role: "admin" | "editor" | "collaborator" | "viewer"; createdAt: string; updatedAt: string | null };
}

export interface NotesCollaboratorsRemoveResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesReactionsListResponse {
  statusCode: number;
  message: string;
  data: { reactions: ({ reaction: string; collaboratorId: string; createdAt: string; name: string | null; username: string | null })[] };
}

export interface NotesReactionsAddRequest {
  /**
   * @minLength 1
   * @maxLength 64
   */
  reaction: string;
}

export interface NotesReactionsAddResponse {
  statusCode: number;
  message: string;
  data: { reaction: string; collaboratorId: string; createdAt: string };
}

export interface NotesReactionsRemoveResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesInteractionsMarkSeenRequest {
  seenAt?: string;
}

export interface NotesInteractionsMarkSeenResponse {
  statusCode: number;
  message: string;
  data: { nodeId: string; collaboratorId: string; firstSeenAt: string | null; lastSeenAt: string | null; firstOpenedAt: string | null; lastOpenedAt: string | null };
}

export interface NotesInteractionsMarkOpenedRequest {
  openedAt?: string;
}

export interface NotesInteractionsMarkOpenedResponse {
  statusCode: number;
  message: string;
  data: { nodeId: string; collaboratorId: string; firstSeenAt: string | null; lastSeenAt: string | null; firstOpenedAt: string | null; lastOpenedAt: string | null };
}

export interface NotesCommentsListResponse {
  statusCode: number;
  message: string;
  data: { comments: ({ id: string; documentId: string; parentId: string | null; anchorBlockId: string | null; anchorType: "document" | "block" | "text-range"; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */; content: string; createdAt: string; createdBy: string; createdByName: string | null; updatedAt: string | null; resolvedAt: string | null; resolvedBy: string | null })[]; nextCursor: string | null; hasMore: boolean };
}

export interface NotesCommentsCreateRequest {
  /**
   * @minLength 1
   * @maxLength 10000
   */
  content: string;
  parentId?: string;
  anchorBlockId?: string;
  anchor?: { type: "document" } | { type: "block"; blockId: string } | { type: "text-range"; startBlockId: string; startOffset: number /* min: 0, max: 9007199254740991 */; endBlockId: string; endOffset: number /* min: 0, max: 9007199254740991 */; quote?: string; contextBefore?: string; contextAfter?: string };
}

export interface NotesCommentsCreateResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; parentId: string | null; anchorBlockId: string | null; anchorType: "document" | "block" | "text-range"; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */; content: string; createdAt: string; createdBy: string; createdByName: string | null; updatedAt: string | null; resolvedAt: string | null; resolvedBy: string | null };
}

export interface NotesCommentsListAnchorsResponse {
  statusCode: number;
  message: string;
  data: { anchors: ({ threadId: string; anchor: { anchorType: "document" | "block" | "text-range"; anchorBlockId: string | null; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null }; anchorStatus: "active" | "orphaned"; resolvedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */ })[]; nextCursor: string | null; hasMore: boolean };
}

export interface NotesCommentsEditRequest {
  /**
   * @minLength 1
   * @maxLength 10000
   */
  content: string;
  /**
   * @minimum 1
   * @maximum 9007199254740991
   */
  expectedVersion?: number /* min: 1, max: 9007199254740991 */;
}

export interface NotesCommentsEditResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; parentId: string | null; anchorBlockId: string | null; anchorType: "document" | "block" | "text-range"; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */; content: string; createdAt: string; createdBy: string; createdByName: string | null; updatedAt: string | null; resolvedAt: string | null; resolvedBy: string | null };
}

export interface NotesCommentsDeleteResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesCommentsResolveRequest {
  /**
   * @minimum 1
   * @maximum 9007199254740991
   */
  expectedVersion?: number /* min: 1, max: 9007199254740991 */;
}

export interface NotesCommentsResolveResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; parentId: string | null; anchorBlockId: string | null; anchorType: "document" | "block" | "text-range"; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */; content: string; createdAt: string; createdBy: string; createdByName: string | null; updatedAt: string | null; resolvedAt: string | null; resolvedBy: string | null };
}

export interface NotesCommentsReanchorRequest {
  anchor: { type: "document" } | { type: "block"; blockId: string } | { type: "text-range"; startBlockId: string; startOffset: number /* min: 0, max: 9007199254740991 */; endBlockId: string; endOffset: number /* min: 0, max: 9007199254740991 */; quote?: string; contextBefore?: string; contextAfter?: string };
  /**
   * @minimum 1
   * @maximum 9007199254740991
   */
  expectedVersion?: number /* min: 1, max: 9007199254740991 */;
}

export interface NotesCommentsReanchorResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; parentId: string | null; anchorBlockId: string | null; anchorType: "document" | "block" | "text-range"; startBlockId: string | null; startOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; endBlockId: string | null; endOffset: number /* min: -9007199254740991, max: 9007199254740991 */ | null; anchorQuote: string | null; anchorContextBefore: string | null; anchorContextAfter: string | null; anchorStatus: "active" | "orphaned"; anchorUpdatedAt: string | null; version: number /* min: -9007199254740991, max: 9007199254740991 */; content: string; createdAt: string; createdBy: string; createdByName: string | null; updatedAt: string | null; resolvedAt: string | null; resolvedBy: string | null };
}

export interface NotesVersionsListResponse {
  statusCode: number;
  message: string;
  data: { versions: { id: string; documentId: string; revision: number; createdAt: string; createdBy: string }[]; total: number };
}

export interface NotesVersionsCreateResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; revision: number; createdAt: string; createdBy: string };
}

export interface NotesVersionsGetResponse {
  statusCode: number;
  message: string;
  data: { id: string; documentId: string; revision: number; content: Record<string, unknown>; createdAt: string; createdBy: string };
}

export interface NotesVersionsDeleteResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesVersionsRestoreResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesDatabasesListResponse {
  statusCode: number;
  message: string;
  data: { records: Record<string, unknown>[]; total: number /* min: -9007199254740991, max: 9007199254740991 */; page: number /* min: -9007199254740991, max: 9007199254740991 */; count: number /* min: -9007199254740991, max: 9007199254740991 */ };
}

export interface NotesDatabasesCreateRequest {
  id?: string;
  name?: string;
  avatar?: string | null;
  fields?: Record<string, unknown>;
}

export interface NotesDatabasesCreateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesDatabasesSearchResponse {
  statusCode: number;
  message: string;
  data: { records: Record<string, unknown>[]; total: number /* min: -9007199254740991, max: 9007199254740991 */ };
}

export interface NotesDatabasesGetResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesDatabasesUpdateRequest {
  name?: string;
  avatar?: string | null;
  fields?: Record<string, unknown>;
}

export interface NotesDatabasesUpdateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface NotesDatabasesDeleteResponse {
  statusCode: number;
  message: string;
  data: { success: boolean };
}

export interface NotesUsersInviteRequest {
  /** @maxItems 50 */
  users: ({ username: string; role: "owner" | "admin" | "collaborator" | "guest" | "none" })[];
}

export interface NotesUsersInviteResponse {
  statusCode: number;
  message: string;
  data: { users: ({ id: string; name: string; avatar?: string | null; role: "owner" | "admin" | "collaborator" | "guest" | "none"; customName?: string | null; customAvatar?: string | null; createdAt: string; updatedAt?: string | null; revision: string; status: 1 | 2 })[]; errors: { username: string; error: string }[] };
}

export interface NotesUsersUpdateRoleRequest {
  role: "owner" | "admin" | "collaborator" | "guest" | "none";
}

export interface NotesUsersUpdateRoleResponse {
  statusCode: number;
  message: string;
  data: { id: string; name: string; avatar?: string | null; role: "owner" | "admin" | "collaborator" | "guest" | "none"; customName?: string | null; customAvatar?: string | null; createdAt: string; updatedAt?: string | null; revision: string; status: 1 | 2 };
}

export interface NotesMutationsSyncRequest {
  /** @maxItems 500 */
  mutations: ({ id: string; createdAt: string; type: "node.create"; data: { nodeId: string; updateId: string; createdAt: string; data: string } } | { id: string; createdAt: string; type: "node.update"; data: { nodeId: string; updateId: string; data: string; createdAt: string } } | { id: string; createdAt: string; type: "node.delete"; data: { nodeId: string; rootId: string; deletedAt: string } } | { id: string; createdAt: string; type: "node.reaction.create"; data: { nodeId: string; reaction: string; rootId: string; createdAt: string } } | { id: string; createdAt: string; type: "node.reaction.delete"; data: { nodeId: string; reaction: string; rootId: string; deletedAt: string } } | { id: string; createdAt: string; type: "node.interaction.seen"; data: { nodeId: string; collaboratorId: string; seenAt: string } } | { id: string; createdAt: string; type: "node.interaction.opened"; data: { nodeId: string; collaboratorId: string; openedAt: string } } | { id: string; createdAt: string; type: "document.update"; data: { documentId: string; updateId: string; data: string; createdAt: string } })[];
}

export interface TunnelListBindingsResponse {
  statusCode: number;
  message: string;
  data: { bindings: BindingDetail[]; total: number /* min: 0 */ };
}

export interface TunnelHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { built?: string | null; fds?: number | null; ip: string; memory?: null | HealthMemory7; pid: number /* min: 0 */; service: string; started: string; status: string; userAgent: string };
}

export interface TunnelListSessionsResponse {
  statusCode: number;
  message: string;
  data: { sessions: SessionInfo[]; total: number /* min: 0 */ };
}

export interface TunnelKillSessionResponse {
  statusCode: number;
  message: string;
  data: { sessionId: string; status: string };
}

export interface TunnelListTunnelsResponse {
  statusCode: number;
  message: string;
  data: { fdPermitsAvailable: number /* min: 0 */; orphanedSessions: number /* min: 0 */; sessions: TunnelSessionView[]; totalBindings: number /* min: 0 */; totalStreams: number /* min: 0 */ };
}

export interface AppHealthCheckResponse {
  statusCode: number;
  message: string;
  data: { status: "ok"; service: string; built?: string | null; started: string; memory?: HealthMemory8 | null; fds?: number | null; pid: number; ip: string; userAgent?: string | null };
}

export interface AppDocsGetJsonResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Response from the search endpoint containing a set ID for race-free selection and the ranked list of candidates.
 */
export interface AppExecutionSearchCandidatesResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; candidates: Candidate[] };
}

export type AppExecutionSearchCandidatesPagedRequest = PagedSearchRequest;

export interface AppExecutionSearchCandidatesPagedResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; total_count: number; items: Candidate[]; next_cursor?: string };
}

export type AppJobsCreateSearchRequest = Selector;

/**
 * Represents an async background job (e.g. source sync).
 */
export interface AppJobsCreateSearchResponse {
  job_id: string;
  kind: JobKind;
  status: JobStatus2;
  created_at: string;
  updated_at: string;
  error?: string;
  result_type?: JobResultType;
  result?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  statusCode: number;
  message: string;
  data: unknown;
}

export type AppExecutionPreflightRequest = Selector;

export interface AppExecutionPreflightResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; selected?: Candidate; shell_command?: string; recommended_mode: RecommendedMode; terminal_request_preview?: TerminalRequestPreview; redirect_target?: string; handoff?: RunHandoff; missing_requirements: MissingRequirement[]; warnings: WarningEntry[]; effective_policy: EffectivePolicy };
}

export type AppExecutionRunBatchRequest = BatchRequest;

export interface AppExecutionRunBatchResponse {
  statusCode: number;
  message: string;
  data: { items?: BatchItemResult[] };
}

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface AppRunAppGetResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

export type AppRunAppPostRequest = Selector;

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface AppRunAppPostResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface AppExecutionRunPathBasedResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface AppExecutionRunTerminalAnchoredResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AppSourcesListResponse {
  statusCode: number;
  message: string;
  data: SourceConfig[];
}

export type AppSourcesCreateRequest = SourceConfig;

export interface AppSourcesCreateResponse {
  statusCode: number;
  message: string;
  data: SourceConfig[];
}

export interface AppSourcesUpdateRequest {
}

/**
 * Configuration for a package source including its type, provider, priority, and provider-specific settings.
 */
export interface AppSourcesUpdateResponse {
  statusCode: number;
  message: string;
  data: { source_id: string; enabled: boolean; priority: number; provider: SourceKind; source_type: SourceType; pin?: SourcePin; config?: Record<string, unknown> };
}

/**
 * Represents an async background job (e.g. source sync).
 */
export interface AppSourcesSyncResponse {
  job_id: string;
  kind: JobKind;
  status: JobStatus2;
  created_at: string;
  updated_at: string;
  error?: string;
  result_type?: JobResultType;
  result?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Represents an async background job (e.g. source sync).
 */
export interface AppSourcesSyncAllResponse {
  job_id: string;
  kind: JobKind;
  status: JobStatus2;
  created_at: string;
  updated_at: string;
  error?: string;
  result_type?: JobResultType;
  result?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AppSourcesGetDiagnosticsResponse {
  statusCode: number;
  message: string;
  data: { source_id: string; status: SourceHealthStatus; last_success_at?: string; last_error_at?: string; last_error?: string; last_search_latency_ms?: number; last_sync_job_id?: string; cache_hint?: string; effective_enabled_reason?: string; provider_details?: Record<string, unknown> };
}

/**
 * Full runtime configuration snapshot including sources, profiles, and active profile selection.
 */
export interface AppConfigurationGetResponse {
  statusCode: number;
  message: string;
  data: { version: number; sources: SourceConfig[]; profiles: ProfileConfig[]; policy?: PolicyConfig; selected_profile?: string; recipes?: RecipeConfig[]; webhooks?: WebhookConfig[] };
}

export interface AppProfilesListResponse {
  statusCode: number;
  message: string;
  data: ProfileConfig[];
}

export type AppProfilesCreateRequest = ProfileConfig;

export interface AppProfilesCreateResponse {
  statusCode: number;
  message: string;
  data: ProfileConfig[];
}

export interface AppProfilesUpdateRequest {
}

/**
 * User profile containing default preferences and source overrides.
 */
export interface AppProfilesUpdateResponse {
  statusCode: number;
  message: string;
  data: { name: string; description?: string; defaults?: ProfileDefaults; sources_mode?: ProfileSourceMode; sources?: ProfileSourceOverride[]; policy?: PolicyConfig };
}

/**
 * Confirms which profile is currently selected as the active default profile.
 */
export interface AppProfilesSelectResponse {
  statusCode: number;
  message: string;
  data: { selected_profile: string };
}

export interface AppRecipesListResponse {
  statusCode: number;
  message: string;
  data: RecipeConfig[];
}

export type AppRecipesCreateRequest = RecipeConfig;

export interface AppRecipesCreateResponse {
  statusCode: number;
  message: string;
  data: RecipeConfig[];
}

export interface AppRecipesGetResponse {
  statusCode: number;
  message: string;
  data: { name: string; description?: string; selector_template?: SelectorTemplate; allowed_overrides?: string[] };
}

export interface AppRecipesUpdateRequest {
}

export interface AppRecipesUpdateResponse {
  statusCode: number;
  message: string;
  data: { name: string; description?: string; selector_template?: SelectorTemplate; allowed_overrides?: string[] };
}

export type AppRecipesSearchRequest = RecipeExecutionRequest;

/**
 * Response from the search endpoint containing a set ID for race-free selection and the ranked list of candidates.
 */
export interface AppRecipesSearchResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; candidates: Candidate[] };
}

export type AppRecipesRunRequest = RecipeExecutionRequest;

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface AppRecipesRunResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Represents an async background job (e.g. source sync).
 */
export interface AppJobsGetStatusResponse {
  job_id: string;
  kind: JobKind;
  status: JobStatus2;
  created_at: string;
  updated_at: string;
  error?: string;
  result_type?: JobResultType;
  result?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface ProxyLogsLogsListResponse {
  statusCode: number;
  message: string;
  data: { entries?: proxyLogs_LogEntry[]; total?: number; limit?: number; offset?: number };
}

export interface ProxyLogsLogsGetStatsResponse {
  statusCode: number;
  message: string;
  data: { total?: number; byLevel?: Record<string, unknown>; byProject?: Record<string, unknown>; byContainer?: Record<string, unknown>; byService?: Record<string, unknown> };
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetACPStatusResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetACPSecretRequest {
  /** The env secret value. Empty string clears (unsets) the reference. Stored only in the 0600 acp-secrets.env store. */
  value?: string;
}

/**
 * Confirmation that the (agent,key) value was stored or cleared — never the value itself.
 */
export interface AgentSetACPSecretResponse {
  statusCode: number;
  message: string;
  data: { agent?: string; key?: string; stored?: boolean; cleared?: boolean };
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListAgentsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentCreateAgentRequest {
  /** Agent name (the definition file stem). */
  name: string;
  /** Optional frontmatter keys (model/tools/turns/description). */
  frontmatter?: Record<string, unknown>;
  /** The agent's system prompt body. */
  system_prompt?: string;
}

/**
 * The verbatim JSON reply from the daemon `agents.create` RPC.
 */
export interface AgentCreateAgentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentDeleteAgentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentCopyAgentRequest {
  /** Name for the copied agent. */
  new_name: string;
}

/**
 * The verbatim JSON reply from the daemon `agents.copy` RPC.
 */
export interface AgentCopyAgentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetAgentModelRequest {
  /** Model spec (e.g. anthropic/claude-opus-4-8); "" removes the frontmatter model line. */
  model?: string;
}

/**
 * The verbatim JSON reply from the daemon `agents.set_model` RPC.
 */
export interface AgentSetAgentModelResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentRenameAgentRequest {
  /** New agent name. */
  new_name: string;
}

/**
 * The verbatim JSON reply from the daemon `agents.rename` RPC.
 */
export interface AgentRenameAgentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentResetAgentToShippedResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The verbatim JSON reply from the daemon `agents.read_source` RPC.
 */
export interface AgentGetAgentSourceResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentPutAgentSourceRequest {
  /** The full markdown source (frontmatter + system prompt). */
  content: string;
  /** The gen returned by agents.read_source, for conflict detection. */
  base_gen?: number;
}

/**
 * The verbatim JSON reply from the daemon `agents.write_source` RPC.
 */
export interface AgentPutAgentSourceResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetAgentToolsRequest {
  /** Tool names allowed for the agent; an empty list removes the line (= all tools). */
  tools?: unknown[];
}

/**
 * The verbatim JSON reply from the daemon `agents.set_tools` RPC.
 */
export interface AgentSetAgentToolsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentToggleAgentToolRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `agents.toggle_tool` RPC.
 */
export interface AgentToggleAgentToolResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetAgentTurnsRequest {
  /** Max agent turns per dispatch. */
  turns?: number;
}

/**
 * The verbatim JSON reply from the daemon `agents.set_turns` RPC.
 */
export interface AgentSetAgentTurnsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListContainersResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentGithubLoginRequest {
  /** Optional PAT. When present the login validates + persists this token (no device flow); kept in env, never returned. */
  token?: string;
  /** GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call. */
  host?: string;
}

/**
 * The reply: a device flow {device_code, user_code, verification_uri, interval, expires_in}, or for a PAT {key, login, host}.
 */
export interface AgentGithubLoginResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentGithubLoginPollRequest {
  /** The GitHub host (default github.com); must match the start call. */
  host?: string;
  /** The device_code returned by POST /github/auth/login. */
  device_code: string;
  /** The poll interval (seconds) the start reply returned. */
  interval?: number;
  /** The device-code lifetime (seconds) the start reply returned. */
  expires_in?: number;
}

/**
 * The reply {key, login, host} — secret-free.
 */
export interface AgentGithubLoginPollResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGithubAuthStatusResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGithubBranchesResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentGithubCloneRequest {
  /** The repository to clone: "owner/name" or an https github URL (https://<host>/<owner>/<name>[.git]). Translated to full_name + clone_url against the active account host. Supply this OR the canonical full_name+clone_url; if both, the canonical fields win. */
  repo?: string;
  /** Optional managed clone root override (clone_root); the traversal-safe parent/dest are derived under it. */
  dir?: string;
  /** Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url. */
  full_name?: string;
  /** Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name. */
  clone_url?: string;
  /** Shallow clone (default true). */
  shallow?: boolean;
}

/**
 * The verbatim github.repo.clone reply.
 */
export interface AgentGithubCloneResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentGithubCommitRequest {
  /** The commit message. */
  message: string;
}

/**
 * The verbatim github.commit reply.
 */
export interface AgentGithubCommitResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentGithubPullRequestRequest {
  /** The PR title (required, non-empty). */
  title: string;
  /** The PR description. */
  body?: string;
  /** Optional base branch (default the repo default). */
  base?: string;
}

/**
 * The verbatim github.pr.create reply (PR url/number).
 */
export interface AgentGithubPullRequestResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGithubReposResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGithubStatusResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentGithubSyncRequest {
  /** Optional: "pull" (fetch+pull) or "push" (push only). Default is the full fetch→pull→push. */
  direction?: string;
}

/**
 * The reply {steps:[…]}.
 */
export interface AgentGithubSyncResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentCreateHeadlessRunRequest {
  /** The prompt to drive the ephemeral session (required). */
  prompt: string;
  /** Optional workflow name to run instead of / alongside the prompt. */
  workflow?: string;
  /** Optional model spec for the run. */
  model?: string;
  /** Output rendering: text | json | stream-json. stream-json (or stream:true) streams the run over SSE; otherwise the run is an async job. */
  format?: string;
  /** Force SSE streaming (equivalent to format:stream-json). */
  stream?: boolean;
  /** Optional run timeout in milliseconds (clamped to the hard ceiling). */
  timeout_ms?: number;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentHealthCheckResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentBootstrapHoodyTokenRequest {
  /** The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed. */
  token: string;
  /** The operator bootstrap capability (--http-bootstrap-token), required only when the daemon was started with one; a mismatch is answered 404. */
  capability?: string;
}

/**
 * {outcome:"renewed", connected, and the secret-free identity (username/email/alias)}.
 */
export interface AgentBootstrapHoodyTokenResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentListHooksRequest {
  /** Live session id (hooks are session-scoped; required by the daemon RPC). */
  session_id?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentListHooksResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentUpsertHookRequest {
  /** Live session id (hooks are session-scoped). */
  session_id: string;
  /** The single-use write nonce from beginHookWrite minted for op:upsert + this scope; the RPC fails closed without it. */
  nonce: string;
  /** Scope of the settings file to write (must match the nonce's scope). */
  scope?: string;
  /** Lifecycle event the hook fires on. */
  event?: string;
  /** Matcher selecting when the hook fires. */
  matcher?: string;
  /** Command to run when the hook fires. */
  command?: string;
  /** Per-fire timeout (optional). */
  timeout?: number;
  /** Short human label shown in the Hooks tab (required when creating a new hook; omit to preserve on update). */
  name?: string;
  /** Short description of what the hook does (required when creating a new hook; omit to preserve on update). */
  description?: string;
}

/**
 * The verbatim JSON reply from the daemon `hooks.upsert` RPC.
 */
export interface AgentUpsertHookResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentDeleteHookRequest {
  /** Live session id (hooks are session-scoped). */
  session_id: string;
  /** The single-use write nonce from beginHookWrite minted for op:delete + this scope; the RPC fails closed without it. */
  nonce: string;
  /** Scope of the settings file to write (must match the nonce's scope). */
  scope?: string;
}

/**
 * The verbatim JSON reply from the daemon `hooks.delete` RPC.
 */
export interface AgentDeleteHookResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentBeginHookWriteRequest {
  /** Live session id (hooks are session-scoped). */
  session_id: string;
  /** The write the nonce authorizes; one of: upsert, delete, toggle, set_disabled. The nonce is rejected by any other op. */
  op: string;
  /** Scope of the settings file the write targets (e.g. project/user); the nonce binds to its resolved path. */
  scope: string;
}

/**
 * The verbatim JSON reply from the daemon `hooks.begin_write` RPC.
 */
export interface AgentBeginHookWriteResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentDisableAllHooksRequest {
  /** Live session id (hooks are session-scoped). */
  session_id: string;
  /** The single-use write nonce from beginHookWrite minted for op:set_disabled + this scope; the RPC fails closed without it. */
  nonce: string;
  /** Scope of the settings file to write (must match the nonce's scope). */
  scope?: string;
}

/**
 * The verbatim JSON reply from the daemon `hooks.set_disabled` RPC.
 */
export interface AgentDisableAllHooksResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentReloadHooksRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `hooks.reload` RPC.
 */
export interface AgentReloadHooksResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentTestHookRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `hooks.test` RPC.
 */
export interface AgentTestHookResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentToggleHookRequest {
  /** Live session id (hooks are session-scoped). */
  session_id: string;
  /** The single-use write nonce from beginHookWrite minted for op:toggle + this scope; the RPC fails closed without it. */
  nonce: string;
  /** Scope of the settings file to write (must match the nonce's scope). */
  scope?: string;
}

/**
 * The verbatim JSON reply from the daemon `hooks.toggle` RPC.
 */
export interface AgentToggleHookResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentAckHookTrustRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `hooks.trust_ack` RPC.
 */
export interface AgentAckHookTrustResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The gateway-local async job record.
 */
export interface AgentGetJobResponse {
  job_id?: string;
  kind?: string;
  session_id?: string;
  run_id?: string | null;
  status?: string;
  error?: string;
  result?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * The gateway-local cancel/delete outcome.
 */
export interface AgentDeleteJobResponse {
  statusCode: number;
  message: string;
  data: { status?: string; canceled?: boolean; deleted?: boolean };
}

/**
 * The gateway-local job result.
 */
export interface AgentGetJobResultResponse {
  status?: string;
  result?: Record<string, unknown>;
  error?: string;
  session_id?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentQueryLogsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentReadLogEntryResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentLogsSourcesResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentLogsStatsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentConsolidateMemoryRequest {
  /** Project key to consolidate (required). */
  project: string;
  /** Optional minimum-observations threshold for a fact to be consolidated. */
  min_observations?: number;
}

export interface AgentSetMemoryEnabledRequest {
  /** Whether memory capture is enabled. */
  enabled?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetMemoryEnabledResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentFlushMemoryRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `memory.flush` RPC.
 */
export interface AgentFlushMemoryResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The verbatim memory.graph reply {nodes, edges, stats, limit, offset, truncated, …}.
 */
export interface AgentGetMemoryGraphResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListMemoryItemsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentSaveMemoryItemRequest {
  /** Project key the memory belongs to. */
  project: string;
  /** The memory content. */
  content: string;
  /** Memory type (e.g. workflow, fact). */
  type?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSaveMemoryItemResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentDeleteMemoryItemRequest {
  /** Memory record id. */
  id: string;
  /** Project key the memory belongs to. */
  project?: string;
  /** Memory kind/store the record lives in. */
  kind?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentDeleteMemoryItemResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetMemoryItemResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentEditMemoryItemRequest {
  /** Project key the memory belongs to. */
  project?: string;
  /** Memory kind/store the record lives in. */
  kind?: string;
  /** Replacement memory content. */
  content?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentEditMemoryItemResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListMemoryProjectsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentSearchMemoryRequest {
  /** Project key to search within. */
  project?: string;
  /** The natural-language recall query (privacy-Strip'd server-side). */
  query?: string;
  /** Maximum hits to return. */
  limit?: number;
  /** Optional memory kinds/stores to restrict the search to. */
  kinds?: unknown[];
  /** Skip the graph-fusion component of recall. */
  skip_graph?: boolean;
}

/**
 * The verbatim memory.search reply {hits:[…secret-free heads + fusion ranks…]}.
 */
export interface AgentSearchMemoryResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListModelsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetModelResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentOpenapiJSONResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListProvidersResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetProviderResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetProviderAuthResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListProviderAccountsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export type AgentAddProviderAccountRequest = Record<string, unknown>;

/**
 * The started OAuth job {job_id, verification_uri?, user_code?} (secret-free).
 */
export interface AgentAddProviderAccountResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The verbatim providers.accounts.remove reply {accounts:[…secret-free…]}.
 */
export interface AgentRemoveProviderAccountResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentSetProviderAccountActiveRequest = Record<string, unknown>;

/**
 * The verbatim providers.accounts.set_active reply {accounts:[…secret-free…]}.
 */
export interface AgentSetProviderAccountActiveResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetProviderAPIKeyRequest {
  /** The provider API key. Stored in the 0600 ~/.hoody/.env store; the reply echoes only a prefix. */
  api_key: string;
}

/**
 * The verbatim providers.auth.set_key reply {auth:<secret-free status, prefix only>}.
 */
export interface AgentSetProviderAPIKeyResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The verbatim providers.auth.delete_key reply {auth:<secret-free status>}.
 */
export interface AgentDeleteProviderAPIKeyResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetProviderDefaultRequest {
  /** The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for. */
  default: string;
}

/**
 * The verbatim providers.auth.set_default reply {auth:<secret-free status>}.
 */
export interface AgentSetProviderDefaultResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentStartProviderOAuthRequest {
  /** When true, the login ADDS to the provider's OAuth account pool (LoginAddAccount) instead of replacing the primary login. */
  add_account?: boolean;
}

/**
 * The started OAuth job (secret-free).
 */
export interface AgentStartProviderOAuthResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string; verification_uri?: string; user_code?: string };
}

/**
 * The verbatim providers.oauth.logout reply {auth:<secret-free status>}.
 */
export interface AgentLogoutProviderOAuthResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The poll snapshot (secret-free). A terminal failure is carried under state/error, never as an HTTP error.
 */
export interface AgentPollProviderOAuthResponse {
  state?: string;
  verification_uri?: string;
  user_code?: string;
  needs_code?: boolean;
  error?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentSubmitProviderOAuthCodeRequest {
  /** The authorization code (or the full redirect URL) to complete the exchange. */
  code: string;
}

/**
 * The verbatim providers.oauth.submit reply {submitted, message?}.
 */
export interface AgentSubmitProviderOAuthCodeResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListRealmsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListSessionsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentCreateSessionRequest {
  /** Realm selector to scope the session (frozen at start). */
  realm?: string;
  /** Container id/selector to run tools on (frozen at start). */
  container?: string;
  /** Working directory for the session (frozen at start). */
  cwd?: string;
  /** Config directory override. */
  config_dir?: string;
  /** Model for this session. On a fresh create/fork it OVERRIDES the chat agent's pinned model for this session only (it is NOT written to the agent; use PATCH /sessions/{id}/model to change it and repin the agent globally). Omit it to use the agent's pinned model (or your default). Rejected (400) together with attach (a resumed session keeps its model) or backend:"acp" (the delegated agent selects its own). */
  model?: string;
  /** Initial chat-agent name. Rejected (400) together with fork (a fork inherits its parent's chat agent) or attach (a resumed session keeps its agent). */
  agent?: string;
  /** Initial tool mode (frozen at start). */
  tool_mode?: string;
  /** Initial directory-access scope: home|full (frozen at start). */
  dir_scope?: string;
  /** attach_session_id — attach to an existing session instead of creating one. */
  attach?: string;
  /** fork_session_id — fork from an existing session. */
  fork?: string;
  /** Turn index to fork at (with fork). */
  fork_turn_idx?: number;
  /** Session backend: "" (Hoody LLM) or "acp" (BYOA delegated agent). */
  backend?: string;
  /** BYOA agent when backend:"acp": codex|claude|gemini|opencode. */
  delegated_agent?: string;
  /** Start the session in headless posture. */
  headless?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCreateSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentListSessionCwdsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentDeleteSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionAgentRequest {
  /** Chat-agent name to switch to. */
  agent?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionAgentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentAnswerQuestionRequest {
  /** Optional echo of the parked gate id (stale/mismatch → 409). */
  gate_id?: string;
  /** Optional echo of the parked gate generation. */
  generation?: number;
  /** Free-form answer text. */
  answer?: string;
  /** Alternate answer text field (forwarded alongside answer). */
  text?: string;
  /** Structured per-field answers for a multi-field question. */
  answers?: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentAnswerQuestionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentAnswerAssistRequest {
  /** Suggestion mode (default "suggest"). */
  mode?: string;
  /** Helper model override; empty uses the configured helper. */
  model?: string;
  /** Generation counter to correlate the suggestion event. */
  gen?: number;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentAnswerAssistResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionAutoReplyRequest {
  /** true to arm the auto-reply loop, false to disarm. */
  armed?: boolean;
  /** Number of auto-reply rounds budgeted. */
  rounds?: number;
  /** Replier model override. */
  model?: string;
  /** Opt in to write-class actions during auto-reply. */
  allow_writes?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionAutoReplyResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionAutoReplyWritesRequest {
  /** New write-class opt-in state. */
  allow_writes?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionAutoReplyWritesResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCancelSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCloseSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentConfirmGateRequest {
  /** Optional echo of the parked gate id (stale/mismatch → 409). */
  gate_id?: string;
  /** Optional echo of the parked gate generation. */
  generation?: number;
  /** true to approve, false to deny (defaults to true if omitted). */
  approved?: boolean;
  /** Persist an approved directory grant to settings.json (WS↔REST parity). */
  persist_dirs?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentConfirmGateResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionEffortRequest {
  /** low|medium|high|xhigh, or "" for the model default. */
  effort?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionEffortResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionHoodyEnvRequest {
  /** Whether to inject the HOODY_* shell-env contract. */
  enabled?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionHoodyEnvResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListLoopsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentCreateLoopRequest {
  /** The prompt fired each loop run. */
  prompt: string;
  /** Run interval (duration token, e.g. "30m"). */
  interval?: string;
  /** Stop after this many runs (0 = unlimited). */
  max_runs?: number;
  /** Optional stop predicate evaluated each run. */
  stop_when?: string;
  /** Cost ceiling (0 = unlimited). */
  max_cost_usd?: number;
  /** Wall-clock ceiling in ms (0 = unlimited). */
  max_wall_ms?: number;
}

/**
 * The verbatim JSON reply from the daemon `loops.create` RPC.
 */
export interface AgentCreateLoopResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentUpdateLoopRequest {
  /** Run-state intent → loops.set_state (true pauses, false resumes). */
  paused?: boolean;
  /** Expiry intent → loops.set_expiry (duration-from-now token, e.g. "2h"; ""/"never" clears). */
  expires_in?: string;
  /** Budget intent → loops.update (cost ceiling; 0 = unlimited). */
  max_cost_usd?: number;
  /** Budget intent → loops.update (wall-clock ceiling in ms, or a duration token; 0 = unlimited). */
  max_wall_ms?: number;
}

/**
 * The verbatim JSON reply from the daemon `loops.set_state / loops.set_expiry / loops.update (by body shape)` RPC.
 */
export interface AgentUpdateLoopResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentDeleteLoopRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `loops.delete` RPC.
 */
export interface AgentDeleteLoopResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentRunLoopNowRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `loops.run_now` RPC.
 */
export interface AgentRunLoopNowResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentPostSessionMessageRequest {
  /** The user message text for this turn. */
  text?: string;
  /** Optional per-turn tool mode override. */
  tool_mode?: string;
  /** Optional per-turn directory-access scope override: home|full. */
  dir_scope?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentPostSessionMessageResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionModelRequest {
  /** Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op. */
  model: string;
}

/**
 * The applied model switch.
 */
export interface AgentSetSessionModelResponse {
  statusCode: number;
  message: string;
  data: { status?: string; model?: string; persisted?: boolean };
}

export interface AgentPromptStreamRequest {
  /** The user message text for this turn. */
  text?: string;
  /** Optional per-turn tool mode override. */
  tool_mode?: string;
  /** Optional per-turn directory-access scope override: home|full. */
  dir_scope?: string;
}

export interface AgentPromptSyncRequest {
  /** The user message text for this turn. */
  text?: string;
  /** Optional per-turn tool mode override. */
  tool_mode?: string;
  /** Optional per-turn directory-access scope override: home|full. */
  dir_scope?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentPromptSyncResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentReplaySessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentListTasksResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCancelAllTasksResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCancelTaskResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentRequestTaskTranscriptResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListSessionToolsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListSessionMCPToolsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentRunSessionToolRequest {
  /** The tool's input parameters (its JSON-Schema body). */
  params?: Record<string, unknown>;
  /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed. */
  confirm?: boolean;
  /** The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run. */
  confirm_token?: string;
  /** Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused). */
  allow_mutations?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentRunSessionToolResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetSessionTranscriptResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentTrimSessionRequest {
  /** Turn index to truncate history to (and including). */
  turn_idx?: number;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentTrimSessionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentSetSessionVerbosityRequest {
  /** normal|concise|terse|minimal. */
  level?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSetSessionVerbosityResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentPostWorkflowMessageRequest {
  /** Feedback/input text fed to the running workflow. */
  text?: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentPostWorkflowMessageResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentRunSessionWorkflowRequest {
  /** Optional input text fed to the workflow run ($(workflow.prompt)). */
  prompt?: string;
  /** Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400. */
  inputs?: Record<string, unknown>;
}

/**
 * The minted gateway job and session correlation. run_id is null during the brief dispatch window and is populated once the workflow loop registers the run.
 */
export interface AgentRunSessionWorkflowResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string; session_id?: string; run_id?: string | null };
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetSettingsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentPatchSettingsRequest {
  /** Top-level keys to merge into the home settings.json (a null value deletes the key). */
  patch: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentPatchSettingsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListFusionResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentUpsertFusionRequest {
  /** The FusionSpec object (name, method, members,...). */
  spec: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentUpsertFusionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentDeleteFusionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListSkillsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentCreateSkillRequest {
  /** Skill name (the SKILL.md directory stem). */
  name: string;
  /** Skill description (frontmatter). */
  description?: string;
  /** Initial SKILL.md body. */
  content?: string;
}

/**
 * The verbatim JSON reply from the daemon `skills.create` RPC.
 */
export interface AgentCreateSkillResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentDeleteSkillRequest {
  /** Skill root directory (identity; alias: root). */
  root_dir: string;
  /** Skill relative directory (identity; alias: rel). */
  rel_dir: string;
}

/**
 * The verbatim JSON reply from the daemon `skills.delete` RPC.
 */
export interface AgentDeleteSkillResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetSkillHubCacheResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentClearSkillHubCacheResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentInstallSkillHubRequest {
  /** Hub skill identifier (from searchSkillHub/previewSkillHub). */
  id: string;
}

/**
 * The verbatim JSON reply from the daemon `skills.hub_install` RPC.
 */
export interface AgentInstallSkillHubResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentPreviewSkillHubResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentSearchSkillHubResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentApplySkillImportRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `skills.import_apply` RPC.
 */
export interface AgentApplySkillImportResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentScanSkillImportResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentRenameSkillRequest {
  /** Skill root directory (identity; alias: root). */
  root_dir: string;
  /** Skill relative directory (identity; alias: rel). */
  rel_dir: string;
  /** New skill directory name. */
  new_name: string;
}

/**
 * The verbatim JSON reply from the daemon `skills.rename` RPC.
 */
export interface AgentRenameSkillResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetSkillSourceResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentPutSkillSourceRequest {
  /** Skill root directory (identity; alias: root). */
  root_dir: string;
  /** Skill relative directory (identity; alias: rel). */
  rel_dir: string;
  /** New SKILL.md body (alias: source). */
  content: string;
  /** The gen returned by skills.read_source, for conflict detection. */
  base_gen?: number;
}

/**
 * The verbatim JSON reply from the daemon `skills.write_source` RPC.
 */
export interface AgentPutSkillSourceResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentToggleSkillRequest {
  /** Effective skill name (NOT root/rel — toggle is name-scoped). */
  name: string;
  /** true to disable the skill, false to enable it. */
  disabled?: boolean;
}

/**
 * The verbatim JSON reply from the daemon `skills.toggle` RPC.
 */
export interface AgentToggleSkillResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentTrustSkillRequest {
  /** Skill root directory (identity; alias: root). */
  root_dir: string;
  /** Skill relative directory (identity; alias: rel). */
  rel_dir: string;
  /** true to grant execution trust, false to revoke. */
  trusted: boolean;
}

/**
 * The verbatim JSON reply from the daemon `skills.set_trust` RPC.
 */
export interface AgentTrustSkillResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetStatisticsResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentListTodosRequest {
  /** Filter to these todo states (array of strings). */
  states?: unknown[];
  /** Filter to todos carrying these tags (array of strings). */
  tags?: unknown[];
  /** Free-text filter over title/body. */
  query?: string;
  /** When true, only open (non-terminal) todos. */
  open_only?: boolean;
  /** When true, include archived/closed todos. */
  all?: boolean;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListTodosResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

export interface AgentCreateTodoRequest {
  /** Todo title. */
  title: string;
  /** Todo body / description. */
  body?: string;
  /** Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected. */
  priority?: number;
  /** Optional tags. */
  tags?: unknown[];
  /** The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set. */
  cwd?: string;
}

/**
 * The verbatim JSON reply from the daemon `todos.create` RPC.
 */
export interface AgentCreateTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentPurgeTodosRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `todos.purge` RPC.
 */
export interface AgentPurgeTodosResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetTodosRevisionResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentTriageTodosRequest = Record<string, unknown>;

/**
 * The gateway-minted job ack for the `todos.triage` dispatch: a `job_id` plus the daemon reply's passthrough fields (the daemon `status` field is stripped).
 */
export interface AgentTriageTodosResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string };
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentUpdateTodoRequest {
  /** The TODO's own current `revision` (from getTodo — NOT the store-wide revision); a stale value is rejected. */
  revision: number;
  /** New title. */
  title?: string;
  /** New body. */
  body?: string;
  /** New state transition. */
  state?: string;
  /** New priority. */
  priority?: number;
  /** New ordering rank. */
  rank?: number;
  /** New tag set. */
  tags?: unknown[];
  /** Retarget the todo's working directory. */
  cwd?: string;
}

/**
 * The verbatim JSON reply from the daemon `todos.update` RPC.
 */
export interface AgentUpdateTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentArchiveTodoRequest {
  /** The TODO's own current `revision` (from getTodo); required — a stale or absent value is rejected. */
  revision: number;
}

/**
 * The verbatim JSON reply from the daemon `todos.archive` RPC.
 */
export interface AgentArchiveTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentCancelTodoRunRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `todos.cancel_run` RPC.
 */
export interface AgentCancelTodoRunResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentClaimTodoRequest {
  /** The TODO's own current `revision` (from getTodo); required for a fresh claim (only the lease's existing owner may refresh without it). */
  revision?: number;
}

/**
 * The verbatim JSON reply from the daemon `todos.claim` RPC.
 */
export interface AgentClaimTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentMessageTodoRequest {
  /** The message that both comments and prompts the orchestrator. */
  text: string;
}

/**
 * The gateway-minted job ack for the `todos.message` dispatch: a `job_id` plus the daemon reply's passthrough fields (the daemon `status` field is stripped).
 */
export interface AgentMessageTodoResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string };
}

export interface AgentPostTodoCommentRequest {
  /** The comment body to append to the todo timeline. */
  text: string;
}

/**
 * The verbatim JSON reply from the daemon `todos.post_message` RPC.
 */
export interface AgentPostTodoCommentResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentApproveTodoProposalRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `todos.approve_proposal` RPC.
 */
export interface AgentApproveTodoProposalResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentDenyTodoProposalRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `todos.deny_proposal` RPC.
 */
export interface AgentDenyTodoProposalResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentReleaseTodoRequest = Record<string, unknown>;

/**
 * The verbatim JSON reply from the daemon `todos.release` RPC.
 */
export interface AgentReleaseTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export type AgentRunTodoRequest = Record<string, unknown>;

/**
 * The gateway-minted job ack for the `todos.run` dispatch: a `job_id` plus the daemon reply's passthrough fields (the daemon `status` field is stripped).
 */
export interface AgentRunTodoResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string; session_id?: string };
}

export interface AgentSnoozeTodoRequest {
  /** Wake time, RFC3339 (e.g. 2026-07-04T09:00:00Z); an empty string clears the snooze. */
  wake_at: string;
  /** The TODO's own current `revision` (from getTodo); a stale value is rejected. */
  revision: number;
}

/**
 * The verbatim JSON reply from the daemon `todos.snooze` RPC.
 */
export interface AgentSnoozeTodoResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListToolsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListReadOnlyToolsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetToolResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentRunToolRequest {
  /** The tool's input parameters (its JSON-Schema body). */
  params?: Record<string, unknown>;
  /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed. */
  confirm?: boolean;
  /** The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run. */
  confirm_token?: string;
  /** Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused). */
  allow_mutations?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentRunToolResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentRunToolAsyncRequest {
  /** The tool's input parameters (its JSON-Schema body). */
  params?: Record<string, unknown>;
  /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed. */
  confirm?: boolean;
  /** The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run. */
  confirm_token?: string;
  /** Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused). */
  allow_mutations?: boolean;
}

/**
 * The minted gateway job; poll GET /jobs/{id}/result.
 */
export interface AgentRunToolAsyncResponse {
  statusCode: number;
  message: string;
  data: { job_id?: string };
}

export interface AgentStreamToolRequest {
  /** The tool's input parameters (its JSON-Schema body). */
  params?: Record<string, unknown>;
  /** Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed. */
  confirm?: boolean;
  /** The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run. */
  confirm_token?: string;
  /** Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused). */
  allow_mutations?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentUsageByAccountResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentUsageByModelResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListWorkflowsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Kit list envelope: a page of items plus pagination metadata.
 */
export interface AgentListWorkflowRunsResponse {
  items: Record<string, unknown>[];
  meta: { total?: number; page?: number; limit?: number };
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentGetWorkflowRunResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentCancelWorkflowRunResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentResumeWorkflowRunRequest {
  /** A live session matching the run's realm, owner, working directory, and container binding. */
  session_id: string;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentResumeWorkflowRunResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

/**
 * The tool envelope carrying the definition JSON in `output`. With ?include_revision=true the output's first line is `revision: r1:<64hex>` (the CAS baseline); the JSON below it is unchanged.
 */
export interface AgentGetWorkflowResponse {
  statusCode: number;
  message: string;
  data: { status?: string; output?: string; is_error?: boolean };
}

export interface AgentPutWorkflowRequest {
  /** The full workflow definition object (steps, entry_point, summary). Validated strictly server-side before an atomic write. */
  definition: Record<string, unknown>;
  /** Optional optimistic-concurrency guard: the 'revision:' value from getWorkflow (?include_revision=true). If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. Omit to save unconditionally. */
  expected_revision?: string;
  /** Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision. */
  expected_absent?: boolean;
}

/**
 * The tool envelope. On a CAS refusal (expected_revision/expected_absent failed) output is bracket-tagged ([revision_conflict] / [already_exists]) and the additive code/current_revision keys are present.
 */
export interface AgentPutWorkflowResponse {
  statusCode: number;
  message: string;
  data: { status?: string; output?: string; is_error?: boolean; code?: string; current_revision?: string };
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentDeleteWorkflowResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface AgentHideWorkflowRequest {
  /** true (default) to hide the workflow; false to un-hide it. */
  hidden?: boolean;
}

/**
 * Verbatim daemon reply (free-form object — fields are the forwarded daemon action's own).
 */
export interface AgentHideWorkflowResponse {
  statusCode: number;
  message: string;
  data: Record<string, unknown>;
}

export interface BadRequestError {
  statusCode: number;
  error: string;
  message: string;
}

export interface UnauthorizedError {
  statusCode: number;
  error: string;
  message: string;
}

export interface ForbiddenError {
  statusCode: number;
  error: string;
  message: string;
}

export interface NotFoundError {
  statusCode: number;
  error: string;
  message: string;
}

export interface ConflictError {
  statusCode: number;
  error: string;
  message: string;
}

export interface User {
  /**
   * Unique user identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Unique username (alphanumeric + underscores + hyphens)
   * @pattern ^[a-zA-Z0-9_-]+$
   */
  username: string;
  /** User email address */
  email?: string;
  /** Display name (can differ from username) */
  alias: string;
  /**
   * ED25519 public key (64 hexadecimal characters)
   * @pattern ^[0-9a-fA-F]{64}$
   */
  public_key?: string;
  /** Custom metadata object for storing additional user information */
  metadata?: Record<string, unknown>;
  /** Administrative privileges flag */
  is_admin: boolean;
  /** Account ban status. Banned users cannot access the API. */
  is_banned: boolean;
  /** Whether the user has verified their email address */
  email_verified?: boolean;
  /** Avatar image URL from OAuth provider */
  avatar_url?: string | null;
  /** How the user signed up (email, github, google, admin) */
  signup_method?: string | null;
  /** Beta gate: whether this account may claim a free-tier server while BETA_GATE_ENABLED is on. Always true (or irrelevant) when the gate is off. */
  free_tier_unlocked?: boolean;
  /** When the account was unlocked for free-tier claiming. */
  free_tier_unlocked_at?: string | null;
  /** How the account was unlocked: 'invite_code' | 'admin_grant' | 'grandfathered'. */
  free_tier_unlock_source?: string | null;
  /** Per-account onboarding/UI milestones: key -> ISO timestamp (presence = done). The /auth/home first-run tour sets hub_tour_v1. */
  onboarding?: Record<string, unknown>;
  /** ISO 8601 account creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
}

export interface Project {
  /**
   * Unique project identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /**
   * Human-readable project name. Must be unique per user.
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * HEX color code for visual organization (auto-normalized to uppercase with # prefix)
   * @pattern ^#[0-9A-F]{3,6}$
   */
  color: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** Maximum containers quota for this project. Null = unlimited. */
  max_containers?: number | null;
}

export interface ProjectWithPermissions {
  /**
   * Unique project identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /**
   * Human-readable project name. Must be unique per user.
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * HEX color code for visual organization (auto-normalized to uppercase with # prefix)
   * @pattern ^#[0-9A-F]{3,6}$
   */
  color: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** Maximum containers quota for this project. Null = unlimited. */
  max_containers?: null | number;
  /** True if this is the user's auto-provisioned default project. Exactly one project per user has this flag after signup. */
  is_default?: boolean;
  /** Realm IDs this project belongs to. Projects can belong to multiple realms for multi-tenant isolation. */
  realm_ids?: string[];
  /** List of users with access to this project (only included when include_permissions=true) */
  permissions?: ProjectPermission[];
}

export interface PaginationMetadata {
  /** Total items matching query */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total pages available */
  totalPages: number;
}

export interface ProxyAlias {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
}

export interface ProxyAliasWithServer {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
}

export interface ProxyAliasWithRelations {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id?: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id?: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id?: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias?: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program?: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index?: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override?: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled?: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at?: string;
  /** ISO 8601 last modification timestamp */
  updated_at?: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
  /** Associated project details */
  project?: { id?: string; alias?: string };
  /** Associated container details */
  container?: { id?: string; name?: string };
}

export interface AuthToken {
  /**
   * Unique identifier for the token
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * User-friendly alias for the token
   * @maxLength 254
   */
  alias: string;
  /** Token prefix (e.g., "hdy_") */
  prefix: string;
  /** Optional ED25519 public key (64 hex characters) */
  public_key?: string | null;
  /** Optional public JSON profile storage (max 64KB serialized) */
  public_storage?: Record<string, unknown> | null;
  /** Array of whitelisted IP addresses/CIDR ranges or "*" for all IPs */
  ip_whitelist: string[];
  /** List of realm IDs this token is restricted to. Empty means no specific realm restrictions (unless allow_no_realm is false). */
  realm_ids?: string[];
  /** Whether this token can be used without a realm scope (e.g. on base domain). Set to false for strict sub-account tokens. */
  allow_no_realm?: boolean;
  /** Fine-grained permissions for this token. Any missing permission path defaults to false (deny). */
  permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } };
  /** ISO 8601 date when the token expires, or null if it never expires */
  expires_at?: null | string;
  /** Whether the token is currently active and can be used for authentication */
  is_enabled: boolean;
  /** Whether this token can access user vault endpoints */
  vault_access: boolean;
  /** Whether this token can access real-time event streams and event history endpoints */
  event_access: boolean;
  /** Lineage: id of the auth token that minted this one (delegated issuance). null = minted directly by the account. */
  created_by_token_id?: null | string;
  /** Delegation chain depth. 0 = root (account-minted); child = creator depth + 1. */
  delegation_depth?: number;
  /** ISO 8601 date when the token was last used */
  last_used_at?: null | string;
  /** The last IP address that used this token */
  last_used_ip?: null | string;
  /** ISO 8601 date when the token was created */
  created_at: string;
  /** ISO 8601 date when the token was last updated */
  updated_at: string;
}

export interface FirewallRulesList {
  /** List of ingress (inbound) rules */
  ingress?: FirewallRule[];
  /** List of egress (outbound) rules */
  egress?: FirewallRule[];
}

export interface DuplicateRuleInfo {
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Rule description */
  description?: string;
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
  /** Indicates the rule was a duplicate */
  duplicate?: boolean;
  /** Information about the existing rule */
  duplicate_of?: { direction: "ingress" | "egress"; index: number };
}

export interface def_0 {
  statusCode: number;
  error: string;
  message: string;
}

export interface def_1 {
  statusCode: number;
  error: string;
  message: string;
}

export interface def_2 {
  statusCode: number;
  error: string;
  message: string;
}

export interface def_3 {
  statusCode: number;
  error: string;
  message: string;
}

export interface def_4 {
  statusCode: number;
  error: string;
  message: string;
}

export interface def_5 {
  /**
   * Unique user identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Unique username (alphanumeric + underscores + hyphens)
   * @pattern ^[a-zA-Z0-9_-]+$
   */
  username: string;
  /** User email address */
  email?: string;
  /** Display name (can differ from username) */
  alias: string;
  /**
   * ED25519 public key (64 hexadecimal characters)
   * @pattern ^[0-9a-fA-F]{64}$
   */
  public_key?: string;
  /** Custom metadata object for storing additional user information */
  metadata?: Record<string, unknown>;
  /** Administrative privileges flag */
  is_admin: boolean;
  /** Account ban status. Banned users cannot access the API. */
  is_banned: boolean;
  /** Whether the user has verified their email address */
  email_verified?: boolean;
  /** Avatar image URL from OAuth provider */
  avatar_url?: string | null;
  /** How the user signed up (email, github, google, admin) */
  signup_method?: string | null;
  /** Beta gate: whether this account may claim a free-tier server while BETA_GATE_ENABLED is on. Always true (or irrelevant) when the gate is off. */
  free_tier_unlocked?: boolean;
  /** When the account was unlocked for free-tier claiming. */
  free_tier_unlocked_at?: string | null;
  /** How the account was unlocked: 'invite_code' | 'admin_grant' | 'grandfathered'. */
  free_tier_unlock_source?: string | null;
  /** Per-account onboarding/UI milestones: key -> ISO timestamp (presence = done). The /auth/home first-run tour sets hub_tour_v1. */
  onboarding?: Record<string, unknown>;
  /** ISO 8601 account creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
}

export interface def_6 {
  /**
   * Unique project identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /**
   * Human-readable project name. Must be unique per user.
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * HEX color code for visual organization (auto-normalized to uppercase with # prefix)
   * @pattern ^#[0-9A-F]{3,6}$
   */
  color: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** Maximum containers quota for this project. Null = unlimited. */
  max_containers?: number | null;
}

export interface def_7 {
  /**
   * Unique project identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /**
   * Human-readable project name. Must be unique per user.
   * @minLength 1
   * @maxLength 100
   */
  alias: string;
  /**
   * HEX color code for visual organization (auto-normalized to uppercase with # prefix)
   * @pattern ^#[0-9A-F]{3,6}$
   */
  color: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** Maximum containers quota for this project. Null = unlimited. */
  max_containers?: number | null;
  /** True if this is the user's auto-provisioned default project. Exactly one project per user has this flag after signup. */
  is_default?: boolean;
  /** Realm IDs this project belongs to. Projects can belong to multiple realms for multi-tenant isolation. */
  realm_ids?: string[];
  /** List of users with access to this project (only included when include_permissions=true) */
  permissions?: ProjectPermission[];
}

export interface def_8 {
  /**
   * Unique permission identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * User granted this permission
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /** Access level: "read" (view only), "edit" (modify), "delete" (destroy) */
  permission_level: "read" | "edit" | "delete";
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** User details for this permission */
  user?: { id?: string; username?: string; alias?: string };
}

export interface def_9 {
  /** Total items matching query */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total pages available */
  totalPages: number;
}

export interface def_10 {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
}

export interface def_11 {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
}

export interface def_12 {
  /**
   * Unique proxy alias identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id?: string;
  /**
   * Owner user ID
   * @pattern ^[0-9a-f]{24}$
   */
  user_id?: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id?: string;
  /**
   * Target container ID
   * @pattern ^[0-9a-f]{24}$
   */
  container_id?: string;
  /** Custom domain alias (custom or auto-generated 48-char hex). Creates URL: https://{alias}.{server_name}.containers.hoody.com/ instead of default https://{projectId}-{containerId}.{server_name}.containers.hoody.com/ */
  alias?: string;
  /** Program or protocol the alias targets — a built-in Hoody program (e.g. "terminal", "files", "code") or a transport protocol ("http", "https", "ssh"). For "http"/"https", index is the target port your server listens on inside the container. */
  program?: string;
  /**
   * Instance index (1-based), or the target port when program is "http"/"https".
   * @minimum 1
   */
  index?: number /* min: 1 */;
  /** Base path for routing (e.g., "/api/v1"). Requests are prefixed with this path. */
  target_path?: string | null;
  /** Whether to allow URL paths beyond target_path. If false, only target_path is accessible. */
  allow_path_override?: boolean;
  /** ISO 8601 expiration date, or null if it never expires */
  expires_at?: string | null;
  /** Whether the alias is active. Disabled aliases return 404. */
  enabled?: boolean;
  /** Realm IDs this proxy alias belongs to */
  realm_ids?: string[];
  /** ISO 8601 creation timestamp */
  created_at?: string;
  /** ISO 8601 last modification timestamp */
  updated_at?: string;
  /** ID of the server resource you own. For containers on a subserver, this is the subserver ID; for containers on a physical host, this is the physical server ID. */
  server_id?: string | null;
  /** Routable hostname label for URL construction. Always the physical (parent) server name, even for subserver containers. */
  server_name?: string | null;
  /** Display name of the subserver (slice). Present only when the container is on a subserver; omitted on physical hosts. */
  subserver_name?: string;
  /** Complete ready-to-use proxy alias URL */
  url?: string | null;
  /** Associated project details */
  project?: { id?: string; alias?: string };
  /** Associated container details */
  container?: { id?: string; name?: string };
}

export interface def_13 {
  /**
   * Unique identifier for the token
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * User-friendly alias for the token
   * @maxLength 254
   */
  alias: string;
  /** Token prefix (e.g., "hdy_") */
  prefix: string;
  /** Optional ED25519 public key (64 hex characters) */
  public_key?: string | null;
  /** Optional public JSON profile storage (max 64KB serialized) */
  public_storage?: Record<string, unknown> | null;
  /** Array of whitelisted IP addresses/CIDR ranges or "*" for all IPs */
  ip_whitelist: string[];
  /** List of realm IDs this token is restricted to. Empty means no specific realm restrictions (unless allow_no_realm is false). */
  realm_ids?: string[];
  /** Whether this token can be used without a realm scope (e.g. on base domain). Set to false for strict sub-account tokens. */
  allow_no_realm?: boolean;
  /** Fine-grained permissions for this token. Any missing permission path defaults to false (deny). */
  permissions: { containers?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; actions?: { start?: boolean; stop?: boolean; restart?: boolean; exec?: boolean; logs?: boolean }; features?: { ai?: boolean; hoody_kit?: boolean; snapshots?: boolean; networking?: boolean } }; projects?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; members?: { invite?: boolean; remove?: boolean; change_roles?: boolean } }; financial?: { wallet?: { read?: boolean; transfer?: boolean; withdraw?: boolean }; billing?: { read?: boolean; manage_payment_methods?: boolean; download_invoices?: boolean }; server_rental?: { view_marketplace?: boolean; rent_servers?: boolean; extend_rentals?: boolean; terminate_rentals?: boolean } }; resources?: { vault?: boolean; events?: boolean; ssh_keys?: boolean; storage_shares?: boolean; proxy_aliases?: boolean; firewalls?: boolean; realms?: boolean; auth_token_public_profile?: boolean; create_tokens?: boolean; read_account?: boolean }; admin?: { users?: boolean; servers?: boolean; system?: boolean; billing?: boolean; monitoring?: boolean } };
  /** ISO 8601 date when the token expires, or null if it never expires */
  expires_at?: string | null;
  /** Whether the token is currently active and can be used for authentication */
  is_enabled: boolean;
  /** Whether this token can access user vault endpoints */
  vault_access: boolean;
  /** Whether this token can access real-time event streams and event history endpoints */
  event_access: boolean;
  /** Lineage: id of the auth token that minted this one (delegated issuance). null = minted directly by the account. */
  created_by_token_id?: string | null;
  /** Delegation chain depth. 0 = root (account-minted); child = creator depth + 1. */
  delegation_depth?: number;
  /** ISO 8601 date when the token was last used */
  last_used_at?: string | null;
  /** The last IP address that used this token */
  last_used_ip?: string | null;
  /** ISO 8601 date when the token was created */
  created_at: string;
  /** ISO 8601 date when the token was last updated */
  updated_at: string;
}

export interface def_14 {
  /** Action for matching traffic */
  action: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol: "tcp" | "udp" | "icmp4";
  /** Rule description */
  description: string;
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
  /** Rule direction (ingress for inbound, egress for outbound) */
  direction?: "ingress" | "egress";
}

export interface def_15 {
  /** List of ingress (inbound) rules */
  ingress?: FirewallRule[];
  /** List of egress (outbound) rules */
  egress?: FirewallRule[];
}

export interface def_16 {
  /** Action for matching traffic */
  action?: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol?: "tcp" | "udp" | "icmp4";
  /** Rule description */
  description?: string;
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
  /** Indicates the rule was a duplicate */
  duplicate?: boolean;
  /** Information about the existing rule */
  duplicate_of?: { direction: "ingress" | "egress"; index: number };
}

/**
 * Standardized health response (9-field contract shared across all kit services).
 */
export interface HealthCheck {
  /** Literal 'ok' when the service is healthy. */
  status: "ok";
  /** Service identifier (always 'hoody-browser'). */
  service: string;
  /** ISO-8601 mtime of the server module at startup. */
  built: string | null;
  /** ISO-8601 timestamp when the process started. */
  started: string;
  /** Process memory usage in bytes. */
  memory: { rss: number; heap: number | null } | null;
  /** Number of open file descriptors (null on non-Linux). */
  fds: number | null;
  /** Process id. */
  pid: number;
  /** Caller's socket remote address (no X-Forwarded-For). */
  ip: string;
  /** Caller's User-Agent header, if present. */
  userAgent: string | null;
}

export interface Error {
  /** Error message */
  error: string;
  /** Error code */
  code: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  status: "alive" | "expired";
  lastHeartbeat: number;
}

export interface ManifestIcon {
  src: string;
  type: string;
  sizes: string;
  purpose?: "any" | "maskable";
}

export interface UpdateInfo {
  current?: string;
  latest?: string;
  updateAvailable?: boolean;
}

/**
 * Paginated schedules response.
 */
export interface PaginatedSchedules {
  items: ScheduledJob[];
  meta: PaginationMeta;
}

export interface HealthResponse {
  statusCode: number;
  message: string;
  data: { status: "ok"; service: string; built?: string | null; started: string; memory?: HealthMemory; fds?: number | null; pid: number; ip: string; userAgent?: string | null };
}

export interface Error2 {
  /** Always false for error responses */
  success: boolean;
  /** Human-readable error message */
  error: string;
}

/**
 * Program configuration with optional runtime status (when include_status=true)
 */
export type ProgramWithStatus = Program & { status?: { id?: number; status?: "RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "BACKOFF" | "FATAL"; pid?: number | null; uptime?: string | null } | { type?: "port-range"; running_instances?: number; total_instances?: number; instances?: ProgramInstance[] } };

/**
 * JSON payload sent to webhook URLs when a program lifecycle event occurs. This is the exact HTTP POST body your webhook endpoint will receive.
 */
export interface WebhookPayload {
  /** Event type (short form without PROCESS_STATE_ prefix). BACKOFF = program crashed and is retrying with delay. */
  event: "STARTING" | "RUNNING" | "BACKOFF" | "STOPPING" | "STOPPED" | "EXITED" | "FATAL" | "UNKNOWN";
  /** Program information */
  program: { id?: number; name: string };
  /** Previous state before this event (e.g., STARTING → RUNNING, RUNNING → STOPPED) */
  from_state?: string | null;
  /** Process ID when program is running, null otherwise */
  pid?: number | null;
  /** ISO 8601 timestamp when the event occurred */
  timestamp: string;
  /** Hostname of the server where daemon manager is running */
  hostname: string;
  /** Additional metadata about the event */
  metadata?: { daemon_manager_version?: string } | null;
}

export interface Error3 {
  /** Human-readable error message */
  error: string;
  /** Machine-readable error code */
  code: "NO_DISPLAY_CONTEXT" | "INVALID_DISPLAY_ID" | "DISPLAY_NOT_FOUND" | "SCREENSHOT_FAILED" | "THUMBNAIL_NOT_FOUND" | "THUMBNAIL_NOT_AVAILABLE" | "VALIDATION_ERROR";
  details?: { message?: string; help?: string };
}

export interface InputError {
  /** Human-readable error message */
  error: string;
  code: "INPUT_ACTION_FAILED" | "DISPLAY_NOT_AVAILABLE" | "WINDOW_NOT_FOUND" | "VALIDATION_ERROR" | "QUEUE_FULL";
  details?: { message?: string; help?: string };
}

export interface HealthResponse2 {
  status: "ok";
  service: string;
  built?: string | null;
  started: string;
  memory?: HealthMemory2 | null;
  fds?: number | null;
  pid: number;
  ip: string;
  userAgent?: string | null;
}

export interface Error4 {
  /** Human-readable error message */
  error: string;
  /** Machine-readable error code (e.g. ERROR_400, ERROR_404, ERROR_500, ERROR_503). */
  code: string;
  /** ISO 8601 timestamp emitted by the server. */
  timestamp: string;
  /** Optional additional error details (shape varies per endpoint). */
  details?: Record<string, unknown>;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  success: boolean;
  statusCode: number;
  message: string;
  data: unknown;
}

export interface HealthResponse3 {
  status: "ok";
  service: string;
  /** Executable mtime as RFC3339 string */
  built?: string | null;
  /** Process start time as RFC3339 string */
  started: string;
  memory?: HealthMemory3 | null;
  /** Count of open file descriptors */
  fds?: number | null;
  pid: number;
  ip: string;
  userAgent?: string | null;
}

export interface Error5 {
  /** Detailed error message (especially in development mode) */
  details?: string;
  /** Error type or category */
  error?: string;
  success?: boolean;
}

export interface main_response {
  results?: main_responseItem[];
}

export interface main_wsError {
  error?: string;
  reqIdx?: number;
}

export interface ErrorResponse2 {
  code: string;
  details?: string | null;
  message: string;
}

export interface ErrorResponse3 {
  code: string;
  details?: string | null;
  message: string;
}

/**
 * A line-delimited status message streamed to the sender during transfer. Prefixed with `[INFO]` or `[ERROR]`, terminated with `\n`. Authoritative vocabulary:

**INFO:**
- `[INFO] Waiting for N receiver(s) to connect...`
- `[INFO] N receiver(s) already connected.`
- `[INFO] A receiver connected.`
- `[INFO] Streaming to N receiver(s)...`
- `[INFO] A receiver disconnected.`
- `[INFO] Upload complete.`
- `[INFO] Transfer complete.`
- `[INFO] All receivers disconnected before transfer completed.`

**ERROR:**
- `[ERROR] Timed out waiting for receivers.`
- `[ERROR] Transfer aborted — idle timeout exceeded.`
- `[ERROR] Transfer failed — sender encountered an error.`
- `[ERROR] Server at maximum active transfer capacity. Try again later.`
 */
export type StatusMessage = string;

/**
 * A plain text error message prefixed with `[ERROR]` and terminated with `\n`. All error responses use `Content-Type: text/plain` with `X-Content-Type-Options: nosniff`.
 */
export type ErrorMessage = string;

export interface KillError {
  error: string;
}

export interface BrowseResult {
  /** The ID of the tab used */
  tabId?: number;
  /** The final URL after navigation */
  url?: string;
  /** Whether a new tab was created */
  created?: boolean;
  /** Whether an existing tab was reused */
  reused?: boolean;
}

export interface BrowserMetadata {
  /** Automation engine used by the child process */
  engine?: "playwright" | "patchright";
  /** Whether the instance was launched in stealth mode using Patchright (Chromium only) */
  stealth?: boolean;
  /** Whether the browser was launched headless */
  headless?: boolean;
  /** Puppeteer-style Chrome build identifier that was downloaded/used for this instance.
Usually a full Chrome version string (e.g. `136.0.7103.113`). */
  chromiumBuildId?: string;
  /** Absolute path to the Chromium executable used for this instance. */
  chromiumExecutablePath?: string;
  /** Absolute path to the browser executable used for this instance. */
  browserExecutablePath?: string;
  /** Base fingerprint profile id used to seed launch/context defaults */
  fingerprintId?: string;
  /** Display identifier */
  display?: string;
  /** URL for the display iframe, if configured */
  iframe_url?: string | null;
  /** Unique identifier for the browser instance */
  browser_id?: string;
  /** Browser instance host */
  browser_host?: string;
  /** Browser instance port */
  browser_port?: number;
  /** Unique session identifier */
  sessionId?: string;
  /** Session name */
  sessionName?: string;
  /** Timezone identifier */
  timezoneId?: string;
  /** Locale setting */
  locale?: string;
  geolocation?: Geolocation;
  viewport?: Viewport;
  /** Where the current viewport policy came from: "creation" until the first successful POST /viewport, then "runtime". */
  viewportSource?: "creation" | "runtime";
  /** User agent string */
  userAgentString?: string;
  /** Browser name */
  browserName?: string;
  /** Full browser version */
  browserFullVersion?: string;
  /** Operating system name */
  operatingSystemName?: string;
  /** Operating system platform */
  operatingSystemPlatform?: string;
  /** Operating system version */
  operatingSystemVersion?: string;
  /** Rendering engine name */
  renderingEngine?: string;
  /** Rendering engine version */
  renderingEngineVersion?: string;
  /** Chrome DevTools WebSocket debugger URL for remote debugging.

**How to use this URL**:
- **Chrome DevTools**: Open `chrome://inspect`, click "Configure", add this URL as a network target
- **Puppeteer**: `await puppeteer.connect({ browserWSEndpoint: url })`
- **Playwright**: `await playwright.chromium.connectOverCDP(url)`

**Availability**: Only populated when browser is launched with `useRemoteDebuggingPort: true`.
In Hoody container deployments this URL is rewritten onto the `cdp-{N}` proxy hostname
(paired 1:1 with the `browser-{N}` instance it debugs). The raw WebSocket URL is not
promised stable across browser restarts — prefer connecting with
`chromium.connectOverCDP("https://…-cdp-{N}/")`, which resolves the live WebSocket URL via
`/json/version` and cold-starts instance `N` on demand if it isn't already running.

**Security Warning**: This URL provides full control over the browser instance.
Only expose to trusted clients in secure environments. */
  webSocketDebuggerUrl?: string | null;
  /** Chrome DevTools HTTP discovery URL (`/json/version`) for this instance.
Tools can resolve the WebSocket URL from this endpoint.
In Hoody container deployments this URL is rewritten onto the `cdp-{N}` proxy hostname
pattern (paired 1:1 with the `browser-{N}` instance) — the same on-demand relay used by
`connectOverCDP("https://…-cdp-{N}/")`. */
  devtoolsHttpUrl?: string | null;
  /** Public URL to access Chrome DevTools frontend in a browser.
Uses the `cdp-{N}` subdomain pattern routed by the Hoody reverse proxy, paired 1:1 with the
`browser-{N}` instance; on-demand — hitting this URL cold-starts instance `N` if it is not
already running.
Open this URL to get a live DevTools inspector for the running browser. */
  devtoolsFrontendUrl?: string | null;
  /** List of loaded Chrome extension directory paths (if any) */
  extensions?: string[];
  /** Whether the instance was launched with a DevTools remote debugging port */
  useRemoteDebuggingPort?: boolean;
  /** DevTools remote debugging port if enabled */
  remoteDebuggingPort?: number | null;
  /** Interface address bound for DevTools. Defaults to `0.0.0.0` (all interfaces).
Containers are behind a reverse proxy so this is safe by default. */
  remoteDebuggingAddress?: string | null;
  /** Whether QUIC transport is disabled for this instance. Defaults to `true` to enforce TCP-only transport. */
  quicDisabled?: boolean;
  /** Whether HTTP/3 is disabled for this instance. This follows QUIC policy and defaults to `true`. */
  http3Disabled?: boolean;
  /** Whether DNS-over-HTTPS is enabled for this instance. Defaults to `true`. */
  dnsOverHttpsEnabled?: boolean;
  /** DoH resolver endpoint used by the browser when DoH is enabled. Defaults to Cloudflare. */
  dnsOverHttpsUrl?: string | null;
  /** List of currently open tabs in the browser instance */
  tabs?: { id?: number; url?: string }[];
}

export interface Tab {
  /** Tab identifier */
  id?: number;
  /** Current tab URL */
  url?: string;
  /** Whether the tab is currently active */
  isActive?: boolean;
}

export interface Metrics {
  instances?: { total?: number; active?: number; byAge?: { lessThan1Min?: number; lessThan5Min?: number; lessThan15Min?: number; moreThan15Min?: number }; oldestInstance?: number; newestInstance?: number };
  system?: { uptime?: number; memory?: Record<string, unknown>; cpu?: Record<string, unknown>; platform?: string; nodeVersion?: string };
  configuration?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Live viewport policy of a browser instance.
 */
export interface ViewportStatus {
  /** The runtime policy: {width,height} or null (responsive — the page follows the real window). */
  viewport: { width: number /* min: 1, max: 8192 */; height: number /* min: 1, max: 8192 */ } | null;
  /** "creation" until the first successful POST /viewport, then "runtime". */
  source: "creation" | "runtime";
  /**
   * Number of live tabs at the time of the read.
   * @minimum 0
   */
  tabs: number /* min: 0 */;
  /** Whether every live page currently reflects the policy. */
  converged: boolean;
}

export interface NavigationRecord {
  /** Unique navigation entry ID (timestamp-random) */
  id?: string;
  /** Final URL after navigation */
  url?: string;
  /** Original URL passed to /browse */
  requestedUrl?: string;
  /** Page title after navigation */
  title?: string;
  /** Extracted hostname */
  domain?: string;
  /** Browser tab ID */
  tabId?: number;
  /** Derived browser ID */
  browserId?: string;
  /** Browser instance port */
  browserPort?: number;
  /** Session identifier */
  sessionId?: string;
  /** HTTP status code, null for manual navigations */
  httpStatus?: number | null;
  /** Error message if navigation failed */
  error?: string | null;
  /** Navigation source: api = /browse endpoint, page = framenavigated event */
  source?: "api" | "page";
  /** ISO 8601 timestamp */
  timestamp?: string;
  /** Whether a new tab was created */
  created?: boolean;
  /** Whether an existing tab was reused */
  reused?: boolean;
}

/**
 * Paginated job summaries response.
 */
export interface PaginatedJobSummaries {
  items: JobSummary[];
  meta: PaginationMeta;
}

/**
 * Job record
 */
export interface Job {
  completed_at?: string | null;
  created_at: string;
  error?: string | null;
  id: string;
  name?: string | null;
  request: CurlRequest;
  response?: null | CurlResponse;
  /**
   * Number of attempts the executor has actually made so far.
   * @minimum 0
   */
  retry_attempts: number /* min: 0 */;
  /**
   * Reserved for persisted retry-policy metadata on the job record.

The current runtime keeps retry configuration on `request.retry_count`.
   * @minimum 0
   */
  retry_count: number /* min: 0 */;
  session_id?: string | null;
  started_at?: string | null;
  status: JobStatus;
}

/**
 * JSON-wrapped response
 */
export interface JsonResponse {
  statusCode: number;
  message: string;
  data: { body: string; headers: Record<string, unknown>; is_binary: boolean; job_id?: string | null; metadata: ResponseMetadata; status_code: number /* min: 0 */; success: boolean; timing: ResponseTiming };
}

/**
 * Request to create a scheduled job
 */
export interface CreateScheduleRequest2 {
  cron: string;
  request: CurlRequest;
}

/**
 * Paginated sessions response.
 */
export interface PaginatedSessions {
  items: Session[];
  meta: PaginationMeta;
}

/**
 * Paginated storage entries response.
 */
export interface PaginatedStorageEntries {
  items: StorageEntry[];
  meta: PaginationMeta;
}

export interface ProgramListResponse {
  statusCode: number;
  message: string;
  data: { programs: Program[] };
}

export interface AddProgramResponse2 {
  success: boolean;
  /** ID of the newly created program */
  id: number;
  program: Program;
}

export interface ProgramInput {
  /**
   * Specific ID to assign (optional - auto-assigned if not provided)
   * @minimum 1
   */
  id?: number /* min: 1 */;
  /**
   * Program name - must be unique, cannot contain quotes
   * @pattern ^[^"']+$
   */
  name: string;
  /**
   * Human-readable description of the program
   * @maxLength 500
   */
  description?: string;
  /**
   * Command to execute with full arguments for your custom program. Use only for custom applications/scripts; system services (`apache2`, `nginx`, `mysql`, etc.) belong under `systemctl`.
   * @minLength 1
   */
  command: string;
  /** System user (must exist on the system) */
  user: string;
  /** Enable the program immediately */
  enabled?: boolean;
  /** Start automatically on system boot */
  boot?: boolean;
  /**
   * Startup delay in seconds
   * @minimum 0
   * @maximum 3600
   */
  delay_seconds?: number /* min: 0, max: 3600 */;
  /** Restart policy for the program */
  autorestart?: "true" | "false" | "unexpected";
  /**
   * Working directory path
   * @pattern ^/
   */
  directory?: string;
  /**
   * Start priority (1-999, lower starts first)
   * @minimum 1
   * @maximum 999
   */
  priority?: number /* min: 1, max: 999 */;
  /**
   * Path for standard output log
   * @pattern ^/
   */
  stdout_logfile?: string;
  /**
   * Path for standard error log
   * @pattern ^/
   */
  stderr_logfile?: string;
  /** Whether logging is enabled for this program. Default: true. */
  logs_enabled?: boolean;
  /**
   * Maximum size of each log file in bytes before rotation. Default: 5242880 (5MB).
   * @minimum 0
   */
  log_max_bytes?: number /* min: 0 */;
  /**
   * Number of rotated backup log files to keep. Default: 2.
   * @minimum 0
   * @maximum 100
   */
  log_backups?: number /* min: 0, max: 100 */;
  /** Environment variables as key-value pairs */
  environment?: Record<string, unknown>;
  /** Read-only. Server-derived from the program directory (true iff under /hoody/plugins). Any value supplied in a create/update request body is ignored. */
  hoody_kit?: boolean;
  /** Port range for multi-instance programs. Each port in the range creates a separate INSTANCE (running process). Example: {start:8000, end:8099} creates 100 instances. Independent from lazy_load - can use with boot:true (all instances auto-start) OR lazy_load:true (instances start on-demand). */
  port_range?: { start: number /* min: 1, max: 65535 */; end: number /* min: 1, max: 65535 */ };
  /** Parameter name for passing port (e.g., "--port", "-p") */
  port_param?: string;
  /** Enable lazy loading (autostart=false). When true, program/instances NOT started automatically. Started on-demand by edge proxy via ensure-started endpoint. Cannot be combined with boot:true. */
  lazy_load?: boolean;
  /** X11 DISPLAY number for GUI programs. Accepts both "1" and ":1" formats (auto-prepends ":" if missing). Sets the DISPLAY environment variable for the program. */
  display?: string | null;
  /**
   * Hoody Terminal integration: Session ID (1-65535). Designed for use with hoody-terminal web interface. When specified, program runs in a persistent terminal session.
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  /** Hoody Terminal integration: Shell for environment loading or terminal multiplexer. Requires terminal_id. Enables web-based terminal access through hoody-terminal. Shells load RC files, tmux creates shared sessions. Auto-detects interactive tools vs services. */
  terminal_shell?: "bash" | "zsh" | "fish" | "sh" | "tmux" | null;
  /** Hoody Terminal integration: Override auto-detection of interactive vs service mode. true = interactive (-ic, shell persists), false = service (-c, exec replaces shell), undefined = auto-detect (recommended). Works with hoody-terminal web interface. */
  terminal_interactive?: boolean | null;
  /** Webhook notification configuration for program lifecycle events */
  webhooks?: { enabled?: boolean; urls?: string[]; events?: string | string[]; headers?: Record<string, unknown>; timeout?: number /* min: 1, max: 60 */; retry?: number /* min: 0, max: 5 */ } | null;
}

export interface RemoveProgramResponse2 {
  success: boolean;
  /** ID of the removed program */
  id: number;
}

export interface ProgramResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; program: Program };
}

export interface Success {
  /** Indicates successful operation */
  success: boolean;
}

export interface AllStatusResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; statuses: { id: number; name: string; enabled: boolean; status: ProgramStatus }[] };
}

export interface StatusResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; status: ProgramStatus; stats?: unknown };
}

/**
 * Response listing all ephemeral programs
 */
export interface QuickStartListResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; count: number; ephemeral_programs: EphemeralProgram[] };
}

/**
 * Input for creating ephemeral (temporary) program via quick-start
 */
export interface EphemeralProgramInput {
  /**
   * Command to execute with full arguments for your custom program/script. Custom code only; system services (`apache2`, `nginx`, etc.) belong under `systemctl`.
   * @minLength 1
   */
  command: string;
  /** System user to run as (must exist on the system) */
  user: string;
  /**
   * Custom name (auto-generated if not provided). Cannot contain quotes.
   * @pattern ^[^"']+$
   */
  name?: string;
  /** Restart policy while running: "true" (always), "false" (never), "unexpected" (only on crashes) */
  autorestart?: "true" | "false" | "unexpected";
  /**
   * Working directory (defaults to user home if not specified)
   * @pattern ^/
   */
  directory?: string;
  /** Environment variables as key-value pairs */
  environment?: Record<string, unknown>;
  /**
   * Start priority (1-999, lower starts first)
   * @minimum 1
   * @maximum 999
   */
  priority?: number /* min: 1, max: 999 */;
  /**
   * Delay before starting (seconds)
   * @minimum 0
   * @maximum 3600
   */
  delay_seconds?: number /* min: 0, max: 3600 */;
  /**
   * Path for standard output log
   * @pattern ^/
   */
  stdout_logfile?: string;
  /**
   * Path for standard error log
   * @pattern ^/
   */
  stderr_logfile?: string;
  /** Whether logging is enabled for this program. Default: true. */
  logs_enabled?: boolean;
  /**
   * Maximum size of each log file in bytes before rotation. Default: 5242880 (5MB).
   * @minimum 0
   */
  log_max_bytes?: number /* min: 0 */;
  /**
   * Number of rotated backup log files to keep. Default: 2.
   * @minimum 0
   * @maximum 100
   */
  log_backups?: number /* min: 0, max: 100 */;
  /**
   * Time-to-live in seconds. Program auto-stops after this duration.
   * @minimum 1
   * @maximum 86400
   */
  ttl?: number /* min: 1, max: 86400 */;
  /** Wait for program to reach RUNNING state before returning */
  wait?: boolean;
  /**
   * Timeout in seconds when wait=true
   * @minimum 1
   * @maximum 300
   */
  timeout?: number /* min: 1, max: 300 */;
  /** X11 DISPLAY number for GUI programs. Accepts both "1" and ":1" formats (auto-prepends ":" if missing). Sets the DISPLAY environment variable for the program. */
  display?: string | null;
  /**
   * Hoody Terminal integration: Session ID (1-65535). Enables web-based terminal access via hoody-terminal.
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  /** Hoody Terminal integration: Shell wrapper for environment loading. Requires terminal_id. Works with hoody-terminal web interface. Auto-detects interactive vs service mode. */
  terminal_shell?: "bash" | "zsh" | "fish" | "sh" | "tmux" | null;
  /** Hoody Terminal integration: Override auto-detection. true=interactive (-ic), false=service (-c), undefined=auto-detect. For use with hoody-terminal. */
  terminal_interactive?: boolean | null;
}

/**
 * Response from quick-start endpoint
 */
export interface QuickStartResponse2 {
  success: boolean;
  /** Unique temporary identifier for this ephemeral program */
  temporary_id: string;
  /** Program name (auto-generated or custom) */
  name: string;
  /** X11 DISPLAY number (normalized with ":" prefix) */
  display?: string | null;
  /** Current program status */
  status: "running" | "starting";
  /** Process ID (if wait=true and running) */
  pid?: number | null;
  /** Uptime (if wait=true and running) */
  uptime?: string | null;
  /** ISO timestamp when program was created */
  created_at: string;
  /** ISO timestamp when program will auto-stop (if TTL set) */
  expires_at?: string | null;
}

export interface LogResponse {
  success?: boolean;
  error?: string | null;
  logs?: string | null;
  type?: "stdout" | "stderr";
  lines?: number;
  log_file?: string;
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Response from stopping ephemeral program
 */
export interface QuickStartStopResponse {
  success: boolean;
  temporary_id: string;
  cleaned_up: boolean;
  message: string;
  statusCode: number;
  data: unknown;
}

export interface Base64ScreenshotResponse {
  statusCode: number;
  message: string;
  data: { info: ScreenshotInfo; image: Base64ImageData };
}

export interface DisplayInfo {
  /** Display ID */
  display?: number;
  /** List of available screenshots */
  screenshots?: ScreenshotInfo[];
}

export interface ScreenshotsList {
  display: number;
  screenshots: ScreenshotInfo[];
}

export interface ClipboardReadResult {
  success?: boolean;
  text?: string;
  selection?: "clipboard" | "primary" | "secondary";
}

export interface ClipboardWriteBody {
  /**
   * Clipboard text content
   * @maxLength 1048576
   */
  text: string;
  /** Clipboard buffer selection */
  selection?: "clipboard" | "primary" | "secondary";
}

export interface WindowListResult {
  success?: boolean;
  display?: number;
  focusedWindowId?: number | null;
  windows?: WindowListItem[];
}

export interface WindowPropertiesResult {
  success?: boolean;
  windowId?: string;
  properties?: WindowProperties;
}

export interface MouseClickBody {
  /**
   * Mouse button (1=left, 2=middle, 3=right, 4-7=extra)
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
  /**
   * @minimum 1
   * @maximum 100
   */
  repeat?: number /* min: 1, max: 100 */;
  /**
   * Delay between repeats in milliseconds
   * @minimum 0
   * @maximum 5000
   */
  delay?: number /* min: 0, max: 5000 */;
  /** Target window ID (decimal or hex 0x...) */
  window?: number | string;
}

export interface MouseMoveBody {
  /**
   * @minimum -65535
   * @maximum 65535
   */
  x: number /* min: -65535, max: 65535 */;
  /**
   * @minimum -65535
   * @maximum 65535
   */
  y: number /* min: -65535, max: 65535 */;
  /** Target window ID */
  window?: number | string;
  /**
   * @minimum 0
   * @maximum 15
   */
  screen?: number /* min: 0, max: 15 */;
  sync?: boolean;
}

export interface MouseScrollBody {
  direction: "up" | "down" | "left" | "right";
  /**
   * @minimum 1
   * @maximum 100
   */
  clicks?: number /* min: 1, max: 100 */;
}

export interface MouseLocationResult {
  success?: boolean;
  x?: number;
  y?: number;
  screen?: number;
  window?: number;
}

export interface KeyboardTypeBody {
  /** @maxLength 10000 */
  text: string;
  /** Target window ID */
  window?: number | string;
  /**
   * Inter-keystroke delay in milliseconds
   * @minimum 0
   * @maximum 1000
   */
  delay?: number /* min: 0, max: 1000 */;
  /** Clear modifier keys before typing */
  clearModifiers?: boolean;
}

export interface KeyboardKeyBody {
  /**
   * Key combinations (e.g. ['ctrl+c', 'Return'])
   * @minItems 1
   * @maxItems 20
   */
  keys: string[];
  /** Target window ID */
  window?: number | string;
  /**
   * @minimum 0
   * @maximum 5000
   */
  delay?: number /* min: 0, max: 5000 */;
  clearModifiers?: boolean;
}

export interface KeyboardKeyDownBody {
  /**
   * Key name (X11 keysym, e.g. Shift_L, ctrl)
   * @maxLength 100
   */
  key: string;
  /** Target window ID */
  window?: number | string;
  /**
   * Auto-release after this many milliseconds
   * @minimum 100
   * @maximum 60000
   */
  holdMs?: number /* min: 100, max: 60000 */;
}

export interface WindowMoveBody {
  windowId: number | string;
  x: number;
  y: number;
  sync?: boolean;
  relative?: boolean;
}

export interface WindowResizeBody {
  windowId: number | string;
  /** @minimum 0 */
  width: number /* min: 0 */;
  /** @minimum 0 */
  height: number /* min: 0 */;
  sync?: boolean;
  useHints?: boolean;
}

export interface WindowIdBody {
  /** Window ID (decimal or hex 0x...) */
  windowId: number | string;
}

export interface ActiveWindowResult {
  success?: boolean;
  windowId?: number;
}

export interface WindowSearchBody {
  /**
   * Search pattern (regex)
   * @maxLength 200
   */
  pattern: string;
  /** Search by window name/title */
  name?: boolean;
  /** Search by window class */
  class?: boolean;
  /** Search by window classname */
  classname?: boolean;
  /** Only return visible windows */
  onlyVisible?: boolean;
}

export interface WindowSearchResult {
  success?: boolean;
  windows?: number[];
}

export interface WindowGeometryResult {
  success?: boolean;
  windowId?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WindowNameResult {
  success?: boolean;
  windowId?: number;
  name?: string;
}

export interface ClickAtBody {
  x: number;
  y: number;
  /**
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
}

export interface TypeAtBody {
  x: number;
  y: number;
  /** @maxLength 10000 */
  text: string;
  /**
   * @minimum 0
   * @maximum 1000
   */
  delay?: number /* min: 0, max: 1000 */;
}

export interface DragBody {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /**
   * @minimum 1
   * @maximum 7
   */
  button?: number /* min: 1, max: 7 */;
  /**
   * Number of intermediate mouse positions for smooth drag
   * @minimum 1
   * @maximum 1000
   */
  steps?: number /* min: 1, max: 1000 */;
}

export interface SelectBody {
  x: number;
  y: number;
  endX: number;
  endY: number;
}

export interface ActBody {
  /**
   * Action path (e.g. mouse/click, keyboard/type)
   * @maxLength 50
   */
  action: string;
  params?: Record<string, unknown>;
  /** Capture screenshot after action */
  screenshot?: boolean;
  /**
   * Delay before screenshot in milliseconds
   * @minimum 0
   * @maximum 5000
   */
  screenshotDelay?: number /* min: 0, max: 5000 */;
  /**
   * Crop region in format x1,y1,x2,y2
   * @maxLength 40
   * @pattern ^\d+,\d+,\d+,\d+$
   */
  screenshotRegion?: string;
}

export interface ActionWithScreenshotResult {
  success?: boolean;
  action?: { success?: boolean; action?: string; details?: Record<string, unknown> };
  screenshot?: { timestamp?: string; image?: Base64ImageData };
}

export interface WaitBody {
  /**
   * Wait duration in milliseconds
   * @minimum 50
   * @maximum 30000
   */
  ms: number /* min: 50, max: 30000 */;
  /** Capture screenshot after wait */
  screenshot?: boolean;
}

export interface WaitResult {
  success?: boolean;
  action?: string;
  details?: { ms?: number };
  screenshot?: { timestamp?: string; image?: Base64ImageData };
}

export interface BatchBody {
  /**
   * @minItems 1
   * @maxItems 50
   */
  actions: { action: string; params?: Record<string, unknown> }[];
}

export interface BatchResult {
  success: boolean;
  completed: { index?: number; action?: string; success?: boolean }[];
  failed?: { index?: number; action?: string; error?: string };
  skipped?: number[];
}

export interface InputActionResponse {
  statusCode: number;
  message: string;
  data: { success: boolean; action: string; details?: Record<string, unknown> };
}

export interface DisplayGeometryResult {
  success?: boolean;
  width?: number;
  height?: number;
  screen?: number;
}

export interface MagicCommentSchemaDocument {
  schema_version: string;
  total_fields: number;
  parse_window_lines: number;
  unknown_keys_behavior: string;
  defaults_context: MagicCommentDefaultsContext;
  source_of_truth: MagicCommentSourceOfTruth;
  categories: MagicCommentCategories;
  fields: MagicCommentSchemaField[];
}

/**
 * Historical record of completed and failed downloads
 */
export interface DownloadHistory {
  history?: ({ directory?: string; end_time?: number | null; error?: string | null; file_path?: string; filename?: string; id?: string; start_time?: number; status?: "completed" | "failed"; total_bytes?: number | null; url?: string })[];
}

/**
 * Historical record of completed and failed extractions
 */
export interface ExtractionHistory {
  history?: ({ archive_path?: string; dest_path?: string; end_time?: number | null; error?: string | null; extracted_bytes?: number; extracted_files?: number; id?: string; selective?: boolean; selective_path?: string | null; start_time?: number; status?: "completed" | "failed"; total_bytes?: number; total_files?: number })[];
}

/**
 * List of currently running archive extractions
 */
export interface ActiveExtractions {
  extractions?: ExtractionProgress[];
}

/**
 * File or directory metadata (stat)
 */
export interface FileStatResponse {
  statusCode: number;
  message: string;
  data: { group?: string; is_symlink?: boolean; mtime?: number; name?: string; owner?: string; path?: string; path_type?: "File" | "Dir" | "SymlinkFile" | "SymlinkDir"; permissions?: string; revisions?: number | null; size?: number; symlink_target?: string | null };
}

/**
 * Results of a content search (grep) operation
 */
export interface GrepResults {
  /** Search duration in milliseconds */
  duration_ms: number;
  matches: GrepMatch[];
  /** Root path that was searched */
  path: string;
  /** The search pattern used */
  pattern: string;
  /** Number of files containing matches */
  total_files_matched: number;
  /** Total files scanned */
  total_files_searched: number;
  /** Number of matching lines returned */
  total_matches: number;
  /** True if results were limited by budget/timeout */
  truncated: boolean;
}

/**
 * Results of a file pattern search (glob) operation
 */
export interface GlobResults {
  /** Number of entries returned */
  count: number;
  /** Search duration in milliseconds */
  duration_ms: number;
  /** Matching files and directories */
  entries: GlobEntry[];
  /** Root directory that was searched */
  path: string;
  /** The glob pattern used */
  pattern: string;
  /** Total filesystem entries scanned */
  total_scanned: number;
  /** True if results were limited by budget/timeout */
  truncated: boolean;
}

/**
 * Result of a copy operation
 */
export interface CopyResponse {
  statusCode: number;
  message: string;
  data: { destination?: string; source?: string; success?: boolean };
}

/**
 * Result of an append operation
 */
export interface AppendResponse {
  statusCode: number;
  message: string;
  data: { new_size?: number; path?: string; success?: boolean };
}

/**
 * Request to move a file or directory to a new path
 */
export interface MoveRequest {
  /** Full destination path */
  move_to: string;
}

/**
 * Result of a chmod operation
 */
export interface ChmodResponse {
  statusCode: number;
  message: string;
  data: { mode?: string; path?: string; success?: boolean };
}

/**
 * Result of a chown operation
 */
export interface ChownResponse {
  statusCode: number;
  message: string;
  data: { group?: string; owner?: string; path?: string; success?: boolean };
}

/**
 * Result of a move operation
 */
export interface MoveResponse {
  statusCode: number;
  message: string;
  data: { destination?: string; source?: string; success?: boolean };
}

/**
 * Result of archive extraction operation
 */
export interface ExtractionResult {
  destination?: string;
  error?: string | null;
  extracted_bytes?: number;
  extracted_files?: number;
  extraction_id?: string;
  message?: string;
  /** True if this was a selective extraction (only present for selective) */
  selective?: boolean;
  /** The selective path used (only present for selective) */
  selective_path?: string | null;
  success?: boolean;
}

/**
 * Contents listing of an archive file
 */
export interface ArchiveContents {
  entries?: ArchiveEntry[];
  format?: "zip" | "tar" | "tar.gz" | "tar.bz2" | "tar.xz";
  total_compressed_size?: number | null;
  total_files?: number;
  total_size?: number;
}

/**
 * Result of file download from remote URL
 */
export interface DownloadResult {
  download_id?: string;
  error?: string | null;
  filename?: string;
  message?: string;
  path?: string;
  success?: boolean;
}

/**
 * List of currently running downloads
 */
export interface ActiveDownloads {
  downloads?: DownloadProgress[];
}

export interface DirectoryListing {
  allow_archive?: boolean;
  allow_delete?: boolean;
  allow_search?: boolean;
  allow_upload?: boolean;
  auth?: boolean;
  dir_exists?: boolean;
  href?: string;
  kind?: "Index";
  paths?: PathItem[];
  uri_prefix?: string;
  user?: string | null;
}

/**
 * Request to change file permissions (Unix only)
 */
export interface ChmodRequest {
  /** Octal permission mode (e.g., '755', '644') */
  mode: string;
}

/**
 * Request to change file ownership (Unix only)
 */
export interface ChownRequest {
  /** Group name or GID */
  group?: string;
  /** Username or UID */
  owner?: string;
}

/**
 * Request to rename a file or directory
 */
export interface RenameRequest {
  /** New filename (cannot contain path separators) */
  name: string;
}

export interface NotifyRequest {
  /** Notification body text */
  body?: string;
  /** Notification category */
  category?: string;
  /** Target display ID (e.g., "0" or ":0") */
  display: string;
  /** Expiration time in milliseconds */
  expire_time?: number;
  /** Icon name or path */
  icon?: string;
  /** Notification summary/title */
  summary: string;
  /** Notification urgency level */
  urgency?: "low" | "normal" | "critical";
}

export interface Notification {
  /** Name of the application that triggered the notification */
  appname?: string;
  /** Notification body text */
  body?: string;
  /** Notification category */
  category?: string;
  /** Display ID where the notification was shown */
  display_id?: number;
  /** Expiration time in milliseconds */
  expire_time?: number;
  /** Whether the notification has an icon */
  has_icon?: boolean;
  /** Relative URL to the notification icon */
  icon_url?: string;
  /** Unique notification ID */
  id?: number;
  /** Combined message text */
  message?: string;
  /** Notification summary/title */
  summary?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  timestamp?: number;
  /** Urgency level of the notification */
  urgency?: "low" | "normal" | "critical";
}

export interface main_request {
  resultFormat?: string;
  transaction?: main_requestItem[];
}

export interface TerminalMouseEvent {
  /** Mouse event kind. `click` expands to down/up; `scroll` uses wheel buttons. */
  type: "move" | "down" | "up" | "click" | "scroll";
  /**
   * Zero-based terminal row cell.
   * @minimum 0
   */
  row: number /* min: 0 */;
  /**
   * Zero-based terminal column cell.
   * @minimum 0
   */
  col: number /* min: 0 */;
  /**
   * Mouse button. Non-scroll events accept 1-3; scroll accepts 4-5.
   * @minimum 1
   * @maximum 5
   */
  button?: number /* min: 1, max: 5 */;
  /**
   * Scroll repeat count for scroll events.
   * @minimum 1
   * @maximum 20
   */
  amount?: number /* min: 1, max: 20 */;
  /** Optional scroll direction; overrides the scroll button. */
  direction?: "up" | "down";
  /**
   * Keyboard modifiers applied to the mouse event.
   * @maxItems 8
   */
  modifiers?: ("shift" | "alt" | "meta" | "ctrl" | "control")[];
}

export interface HealthResponse4 {
  built?: string | null;
  fds?: number | null;
  ip: string;
  memory?: null | HealthMemory4;
  /** @minimum 0 */
  pid: number /* min: 0 */;
  service: string;
  started: string;
  status: string;
  userAgent?: string | null;
}

export interface WatcherListResponse {
  statusCode: number;
  message: string;
  data: { items: WatcherResponse[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export interface CreateWatcherRequest {
  /** Coalescing window in milliseconds. */
  coalesce_ms?: number | null;
  /** Optional exclude glob patterns. Excludes take precedence over includes. */
  exclude?: string[] | null;
  /** Replay history capacity for this watcher. */
  history_size?: number | null;
  /** Directory names or subdirectory paths to skip entirely (no inotify watches, no scanning).
Supports simple names ("node_modules") and compound paths ("ibus/bus").
Defaults to server-configured ignore list (node_modules,.git, target, etc.).
Pass empty array to disable. */
  ignore_dirs?: string[] | null;
  /** Optional include glob patterns. If present, path must match one include. */
  include?: string[] | null;
  /** Optional event kind filter. */
  kinds?: WatchEventKind[] | null;
  /** Absolute or relative filesystem paths to watch. */
  paths: string[];
  /** Recursive mode. Defaults to server config value. */
  recursive?: boolean | null;
  /** When true, hidden directories (dot-prefixed basenames, e.g. `.git`,
`.cache`, `.venv`) are never watched or scanned into — no inotify watches
are placed inside them. Hidden *files* in visible directories still emit
events. Defaults to the server's `--default-skip-hidden` (false unless
configured). Note: this governs whether we watch/scan *into* hidden
directories; a single create/rename/remove event *about* a hidden
directory itself may still flow. A directory renamed from a visible name
to a hidden name while watched retains its existing watch (same limitation
as `ignore_dirs`). */
  skip_hidden?: boolean | null;
}

export interface DeleteWatcherResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean; id: string };
}

export interface EventHistoryResponse {
  statusCode: number;
  message: string;
  data: { items: FileEvent[]; limit: number /* min: 0 */; newest_available_id?: number | null; newest_available_timestamp?: string | null; oldest_available_id?: number | null; oldest_available_timestamp?: string | null; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export interface RawCrontabListResponse {
  statusCode: number;
  message: string;
  data: { items: RawCrontabResponse[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */ };
}

export interface HealthResponse5 {
  built?: string | null;
  fds?: number | null;
  ip: string;
  memory?: null | HealthMemory5;
  /** @minimum 0 */
  pid: number /* min: 0 */;
  service: string;
  started: string;
  status: string;
  user_agent?: string | null;
}

export interface RawCrontabRequest {
  crontab: string;
}

export interface RawCrontabUpdateResponse {
  statusCode: number;
  message: string;
  data: { crontab: string; removed_expired: number /* min: 0 */; user: string };
}

export interface EntryListResponse {
  statusCode: number;
  message: string;
  data: { entries: CrontabEntryView[]; limit: number /* min: 0 */; page: number /* min: 0 */; total: number /* min: 0 */; user: string };
}

export interface CreateEntryRequest {
  command: string;
  comment?: string | null;
  enabled?: boolean | null;
  expires_at?: string | null;
  name?: string | null;
  schedule: string;
}

export interface UpdateEntryRequest {
  clear_expiration?: boolean | null;
  command?: string | null;
  comment?: string | null;
  enabled?: boolean | null;
  expires_at?: string | null;
  name?: string | null;
  schedule?: string | null;
}

export interface ManagedEntryResponse {
  statusCode: number;
  message: string;
  data: { command: string; comment?: string | null; created_at: string; enabled: boolean; expired: boolean; expires_at?: string | null; id: string; name?: string | null; schedule: string; schedule_human: string; updated_at: string; user: string };
}

export interface DeleteEntryResponse {
  statusCode: number;
  message: string;
  data: { deleted: boolean };
}

export interface HealthResponse6 {
  status: "ok";
  service: string;
  /** Module mtime as ISO 8601 string */
  built?: string | null;
  /** Process start time as ISO 8601 string */
  started: string;
  memory?: HealthMemory6 | null;
  fds?: number | null;
  pid: number;
  ip: string;
  userAgent?: string | null;
}

export interface BindingsResponse {
  statusCode: number;
  message: string;
  data: { bindings: BindingDetail[]; total: number /* min: 0 */ };
}

export interface HealthResponse7 {
  built?: string | null;
  fds?: number | null;
  ip: string;
  memory?: null | HealthMemory7;
  /** @minimum 0 */
  pid: number /* min: 0 */;
  service: string;
  started: string;
  status: string;
  userAgent: string;
}

export interface SessionsResponse {
  statusCode: number;
  message: string;
  data: { sessions: SessionInfo[]; total: number /* min: 0 */ };
}

export interface KillResponse {
  statusCode: number;
  message: string;
  data: { sessionId: string; status: string };
}

export interface TunnelOverview {
  /** @minimum 0 */
  fdPermitsAvailable: number /* min: 0 */;
  /** @minimum 0 */
  orphanedSessions: number /* min: 0 */;
  sessions: TunnelSessionView[];
  /** @minimum 0 */
  totalBindings: number /* min: 0 */;
  /** @minimum 0 */
  totalStreams: number /* min: 0 */;
}

export interface HealthResponse8 {
  status: "ok";
  service: string;
  /** Executable mtime as RFC3339 string */
  built?: string | null;
  /** Process start time as RFC3339 string */
  started: string;
  memory?: HealthMemory8 | null;
  /** Count of open file descriptors */
  fds?: number | null;
  pid: number;
  ip: string;
  userAgent?: string | null;
}

export interface PagedSearchRequest {
  selector: Selector;
  cursor?: string;
  /**
   * @minimum 1
   * @maximum 100
   */
  page_size?: number /* min: 1, max: 100 */;
}

export interface PagedSearchResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; total_count: number; items: Candidate[]; next_cursor?: string };
}

export interface PreflightResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; selected?: Candidate; shell_command?: string; recommended_mode: RecommendedMode; terminal_request_preview?: TerminalRequestPreview; redirect_target?: string; handoff?: RunHandoff; missing_requirements: MissingRequirement[]; warnings: WarningEntry[]; effective_policy: EffectivePolicy };
}

export interface BatchRequest {
  items?: BatchItemRequest[];
}

export interface BatchResponse {
  statusCode: number;
  message: string;
  data: { items?: BatchItemResult[] };
}

export interface SourceDiagnostics {
  source_id: string;
  status: SourceHealthStatus;
  last_success_at?: string;
  last_error_at?: string;
  last_error?: string;
  last_search_latency_ms?: number;
  last_sync_job_id?: string;
  cache_hint?: string;
  effective_enabled_reason?: string;
  provider_details?: Record<string, unknown>;
}

/**
 * Full runtime configuration snapshot including sources, profiles, and active profile selection.
 */
export interface ConfigFile {
  /** Configuration file schema version */
  version: number;
  /** All configured package sources */
  sources: SourceConfig[];
  /** All configured profiles */
  profiles: ProfileConfig[];
  policy?: PolicyConfig;
  /** Name of the active profile applied to requests that do not specify a profile explicitly */
  selected_profile?: string;
  recipes?: RecipeConfig[];
  webhooks?: WebhookConfig[];
}

/**
 * Confirms which profile is currently selected as the active default profile.
 */
export interface SelectedProfileResponse {
  statusCode: number;
  message: string;
  data: { selected_profile: string };
}

export interface RecipeExecutionRequest {
  overrides?: SelectorTemplate;
}

/**
 * Represents an async background job (e.g. source sync).
 */
export interface Job2 {
  /** Unique job identifier */
  job_id: string;
  kind: JobKind;
  status: JobStatus2;
  /** ISO 8601 timestamp when the job was created */
  created_at: string;
  /** ISO 8601 timestamp of the last status change */
  updated_at: string;
  /** Error message (present when status=error) */
  error?: string;
  result_type?: JobResultType;
  /** Inline job result payload when available */
  result?: Record<string, unknown>;
  /** Optional progress metadata for long-running jobs */
  progress?: Record<string, unknown>;
}

export interface proxyLogs_UrlData {
  targetUrl?: string;
  addArgs?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  containerIp?: string;
  projectId?: string;
  containerId?: string;
  serviceName?: string;
  serviceIndex?: string | number;
}

export interface proxyLogs_InlineResponse {
  statusCode: number;
  message: string;
  data: { type?: "inline"; status?: number; headers?: Record<string, unknown>; body?: string };
}

export interface proxyLogs_LogQueryResult {
  entries?: proxyLogs_LogEntry[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface proxyLogs_LogConfig {
  enabled?: boolean;
  minLevel?: "debug" | "info" | "warn" | "error";
  redactHeaders?: boolean;
  redactBodies?: boolean;
  excludePaths?: string[];
  loggedMethods?: string[];
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
  maxRows?: number;
  retentionHours?: number;
}

export interface proxyLogs_LogStats {
  total?: number;
  byLevel?: Record<string, unknown>;
  byProject?: Record<string, unknown>;
  byContainer?: Record<string, unknown>;
  byService?: Record<string, unknown>;
}

export interface ProjectPermission {
  /**
   * Unique permission identifier
   * @pattern ^[0-9a-f]{24}$
   */
  id: string;
  /**
   * Associated project ID
   * @pattern ^[0-9a-f]{24}$
   */
  project_id: string;
  /**
   * User granted this permission
   * @pattern ^[0-9a-f]{24}$
   */
  user_id: string;
  /** Access level: "read" (view only), "edit" (modify), "delete" (destroy) */
  permission_level: "read" | "edit" | "delete";
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last modification timestamp */
  updated_at: string;
  /** User details for this permission */
  user?: { id?: string; username?: string; alias?: string };
}

export interface FirewallRule {
  /** Action for matching traffic */
  action: "allow" | "reject" | "drop";
  /** Protocol type */
  protocol: "tcp" | "udp" | "icmp4";
  /** Rule description */
  description: string;
  /** Destination port, range (e.g., 80-90), or list (e.g., 80,443) */
  destination_port?: string;
  /** Source IPv4/CIDR address(es) */
  source?: string;
  /** Destination IPv4/CIDR address(es) */
  destination?: string;
  /** Source port, range, or list */
  source_port?: string;
  /** Rule state */
  state?: "enabled" | "disabled";
  /** ICMP type number for icmp4 protocol */
  icmp_type?: string;
  /** ICMP code number for icmp4 protocol */
  icmp_code?: string;
  /** Rule direction (ingress for inbound, egress for outbound) */
  direction?: "ingress" | "egress";
}

/**
 * Scheduled job
 */
export interface ScheduledJob {
  created_at: string;
  /** Six-field cron expression: `second minute hour day month weekday`. */
  cron: string;
  enabled: boolean;
  id: string;
  last_run?: string | null;
  name?: string | null;
  next_run?: string | null;
  request: CurlRequest;
}

export interface HealthMemory {
  /** Resident set size in bytes */
  rss: number;
  /** Language runtime heap in bytes (null for Rust) */
  heap?: number | null;
}

/**
 * Represents a running instance of a port-range program. Each instance is an actual process running on a specific port.
 */
export interface ProgramInstance {
  /** Port number this instance is running on */
  port?: number;
  /** Supervisord process name (format: programname_port) */
  instance_name?: string;
  /** Current runtime status of this instance */
  status?: "RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "BACKOFF" | "FATAL";
  /** Process ID when running */
  pid?: number | null;
  /** Uptime in format "H:MM:SS" */
  uptime?: string | null;
  /** Resource stats for this instance's process tree. Only present when include_stats=true and the instance is running. */
  stats?: unknown;
}

export interface HealthMemory2 {
  /** Resident set size in bytes */
  rss: number;
  /** V8 heap used in bytes */
  heap?: number | null;
}

export interface HealthMemory3 {
  /** Resident set size in bytes */
  rss: number;
  /** Language runtime heap in bytes (null for Rust) */
  heap?: number | null;
}

export interface main_responseItem {
  error?: string;
  resultHeaders?: string[];
  /** omitnil is used by jettison */
  resultSet?: orderedmap_OrderedMap[];
  /** omitnil is used by jettison */
  resultSetList?: unknown[][];
  /** RowErrors carries per-row parse failures surfaced under
noFail=true for valuesBatch statements. When present alongside
Success=true, it means the batch executed successfully for the
surviving rows but some rows were skipped because they failed
to parse. Empty when unused (omitempty keeps the wire format
identical for existing clients). */
  rowErrors?: string[];
  rowsUpdated?: number;
  rowsUpdatedBatch?: number[];
  success?: boolean;
  /** set when resultSet hit sqlExecMaxQueryRows cap */
  truncated?: boolean;
}

export interface Geolocation {
  /**
   * @minimum -90
   * @maximum 90
   */
  latitude?: number /* min: -90, max: 90 */;
  /**
   * @minimum -180
   * @maximum 180
   */
  longitude?: number /* min: -180, max: 180 */;
  accuracy?: number;
}

/**
 * Fixed-viewport emulation settings. `null` means fixed-viewport emulation is disabled (`viewport=null` / `noViewport=true`) and the page follows the real browser window size.
 */
export interface Viewport {
  /**
   * @minimum 1
   * @maximum 8192
   */
  width: number /* min: 1, max: 8192 */;
  /**
   * @minimum 1
   * @maximum 8192
   */
  height: number /* min: 1, max: 8192 */;
  deviceScaleFactor?: number;
  screenWidth?: number;
  screenHeight?: number;
}

/**
 * Job summary for listings
 */
export interface JobSummary {
  completed_at?: string | null;
  created_at: string;
  id: string;
  method?: string | null;
  name?: string | null;
  status: JobStatus;
  url: string;
}

/**
 * cURL response
 */
export interface CurlResponse {
  statusCode: number;
  message: string;
  data: { body: number /* min: 0 */[]; connect_time: number; content_type?: string | null; effective_url: string; headers: Record<string, unknown>; namelookup_time: number; pretransfer_time: number; primary_ip?: string | null; raw_headers?: ResponseHeader[]; redirect_count: number /* min: 0 */; redirect_time: number; size_download: number /* min: 0 */; size_upload: number /* min: 0 */; speed_download: number; speed_upload: number; starttransfer_time: number; status_code: number /* min: 0 */; total_time: number };
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  content_type?: string | null;
  effective_url: string;
  /** @minimum 0 */
  redirect_count: number /* min: 0 */;
  /** @minimum 0 */
  size_download: number /* min: 0 */;
  /** @minimum 0 */
  size_upload: number /* min: 0 */;
  speed_download: number;
  speed_upload: number;
}

/**
 * Response timing information
 */
export interface ResponseTiming {
  connect: number;
  namelookup: number;
  pretransfer: number;
  redirect: number;
  starttransfer: number;
  total: number;
}

/**
 * Session record
 */
export interface Session {
  cookies: Record<string, unknown>;
  created_at: string;
  id: string;
  /** Updated when response cookies are persisted, not on every read/apply. */
  last_used: string;
  scoped_cookies?: StoredCookie[];
}

/**
 * Storage entry
 */
export interface StorageEntry {
  created_at: string;
  /** UUID parsed from the storage path when present.

For synchronous saves this may be a storage-only UUID rather than an async job ID. */
  job_id?: string | null;
  /** Path relative to the downloads root (for example `by-job/...` or `by-date/...`). */
  path: string;
  /** @minimum 0 */
  size: number /* min: 0 */;
  url?: string | null;
}

/**
 * Pagination metadata for list endpoints.
 */
export interface PaginationMeta {
  /** @minimum 0 */
  limit: number /* min: 0 */;
  /** @minimum 0 */
  page: number /* min: 0 */;
  /** @minimum 0 */
  total: number /* min: 0 */;
}

export interface Program {
  /**
   * Unique program identifier (auto-assigned if not provided)
   * @minimum 1
   */
  id: number /* min: 1 */;
  /**
   * Program name - must be unique, cannot contain quotes
   * @pattern ^[^"']+$
   */
  name: string;
  /**
   * Human-readable description of the program purpose
   * @maxLength 500
   */
  description?: string;
  /** Whether the program is currently enabled and should be managed by supervisord */
  enabled: boolean;
  /**
   * Full command to execute including all arguments. Use for your custom programs only — `node app.js`, `python main.py`, `ruby server.rb`. Do not use for system services like `apache2`, `nginx`, `postgresql`; use `systemctl` for those.
   * @minLength 1
   */
  command: string;
  /** Start automatically when supervisord starts (typically on system boot) */
  boot?: boolean;
  /**
   * Number of seconds to wait before starting the program after boot
   * @minimum 0
   * @maximum 3600
   */
  delay_seconds?: number /* min: 0, max: 3600 */;
  /** Restart policy: "true" (always restart), "false" (never restart), "unexpected" (restart only on unexpected exits) */
  autorestart?: "true" | "false" | "unexpected";
  /** System user account to run the program as (must exist on the system) */
  user: string;
  /** Environment variables to set for the program */
  environment?: Record<string, unknown>;
  /**
   * Working directory for the program (defaults to user home directory if not specified)
   * @pattern ^/
   */
  directory?: string;
  /**
   * Start priority - programs with lower numbers start first (range: 1-999)
   * @minimum 1
   * @maximum 999
   */
  priority?: number /* min: 1, max: 999 */;
  /**
   * Path to standard output log file
   * @pattern ^/
   */
  stdout_logfile?: string;
  /**
   * Path to standard error log file
   * @pattern ^/
   */
  stderr_logfile?: string;
  /** Whether logging is enabled for this program. Default: true. */
  logs_enabled?: boolean;
  /**
   * Maximum size of each log file in bytes before rotation. Default: 5242880 (5MB).
   * @minimum 0
   */
  log_max_bytes?: number /* min: 0 */;
  /**
   * Number of rotated backup log files to keep. Default: 2.
   * @minimum 0
   * @maximum 100
   */
  log_backups?: number /* min: 0, max: 100 */;
  /** Indicates if this is a Hoody Kit program (its directory is under /hoody/plugins). Server-derived from the directory and not settable via the API. */
  hoody_kit?: boolean;
  /** Port range for multi-instance programs. Defines a range of ports where each port creates a separate INSTANCE (actual running process). Example: ports 8000-8099 creates 100 potential instances. Each instance runs the same command with a different --port argument. Can be combined with lazy_load for on-demand startup. */
  port_range?: { start: number /* min: 1, max: 65535 */; end: number /* min: 1, max: 65535 */ };
  /** Parameter name to pass port to command (used with port_range) */
  port_param?: string;
  /** Enable lazy loading (autostart=false). When true, program/instances NOT started automatically. Started on-demand by edge proxy via ensure-started endpoint. Cannot be combined with boot:true. */
  lazy_load?: boolean;
  /** X11 DISPLAY number for GUI programs. Accepts both "1" and ":1" formats (auto-prepends ":" if missing). Sets the DISPLAY environment variable for the program. */
  display?: string | null;
  /**
   * Hoody Terminal integration: Session ID (1-65535). Designed for use with hoody-terminal web interface. When specified, program runs in a persistent terminal session.
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  /** Hoody Terminal integration: Shell for environment loading or terminal multiplexer. Requires terminal_id. Shells (bash/zsh/fish/sh) load RC files before command execution. tmux creates/attaches shared session named with terminal_id for multi-user collaboration via hoody-terminal. Auto-detects interactive tools (25+ AI assistants, editors, REPLs) vs services. */
  terminal_shell?: "bash" | "zsh" | "fish" | "sh" | "tmux" | null;
  /** Hoody Terminal integration: Override auto-detection of interactive vs service mode. true = force interactive mode (-ic, shell persists after command exits), false = force service mode (-c, exec replaces shell), undefined/null = auto-detect based on command (recommended). Auto-detection recognizes 25+ AI coding assistants, editors, shells, multiplexers, and REPLs. */
  terminal_interactive?: boolean | null;
  /** Webhook notification configuration for real-time program lifecycle events (start, stop, crash, etc.) */
  webhooks?: { enabled: boolean; urls: string[]; events?: "*" | "all" | "ALL" | "STARTING" | "RUNNING" | "BACKOFF" | "STOPPING" | "STOPPED" | "EXITED" | "FATAL" | string[]; headers?: Record<string, unknown>; timeout?: number /* min: 1, max: 60 */; retry?: number /* min: 0, max: 5 */ } | null;
  /** Runtime status of the program. Only present when include_status=true or include_stats=true is passed to the listing endpoint. */
  status?: ProgramStatus | Record<string, unknown>;
  /** Resource stats (CPU, memory, process tree) for the program. Only present when include_stats=true and the program is running. For port-range programs, stats appear per-instance inside the status.instances array. */
  stats?: unknown;
}

/**
 * Ephemeral (temporary) program configuration. Not stored in programs.json, only tracked in ephemeral.json. Auto-cleans up when stopped or on container reboot.
 */
export interface EphemeralProgram {
  /**
   * Unique temporary identifier (format: quick_<timestamp>)
   * @pattern ^quick_\d+$
   */
  temporary_id: string;
  /** Program name (auto-generated or custom) */
  name: string;
  /** Command to execute */
  command: string;
  /** System user to run as */
  user: string;
  /**
   * Path to standard output log file
   * @pattern ^/
   */
  stdout_logfile?: string;
  /**
   * Path to standard error log file
   * @pattern ^/
   */
  stderr_logfile?: string;
  /** Whether logging is enabled for this program. Default: true. */
  logs_enabled?: boolean;
  /**
   * Maximum size of each log file in bytes before rotation. Default: 5242880 (5MB).
   * @minimum 0
   */
  log_max_bytes?: number /* min: 0 */;
  /**
   * Number of rotated backup log files to keep. Default: 2.
   * @minimum 0
   * @maximum 100
   */
  log_backups?: number /* min: 0, max: 100 */;
  /** X11 DISPLAY number (normalized with ":" prefix) */
  display?: string | null;
  /** Current runtime status */
  status?: "running" | "stopped" | "starting" | "stopping" | "backoff" | "fatal";
  /** Process ID when running */
  pid?: number | null;
  /** Uptime in format "H:MM:SS" */
  uptime?: string | null;
  /** ISO timestamp when program was created */
  created_at: string;
  /** ISO timestamp when program will auto-stop (if TTL set) */
  expires_at?: string | null;
}

export interface ScreenshotInfo {
  /** Unix timestamp used for `/screenshot/{timestamp}` and `/thumbnail/{timestamp}` queries */
  timestamp: string;
  /** Human-readable screenshot timestamp (ISO-8601) */
  timestamp_human?: string;
  full: FileInfo;
  /** Thumbnail image (may be null) */
  thumbnail?: FileInfo | null;
}

export interface WindowListItem {
  /** Window ID (decimal) */
  windowId?: number;
  name?: string;
  class?: string[];
  desktop?: number;
  geometry?: { x?: number; y?: number; width?: number; height?: number };
  focused?: boolean;
  states?: string[];
}

export interface WindowProperties {
  wmClass?: string[];
  wmName?: string;
  wmRole?: string | null;
  pid?: number | null;
  wmState?: string[];
  wmType?: string[];
  transientFor?: number | null;
}

export interface Base64ImageData {
  /** Base64 encoded image data (without data URL prefix) */
  data: string;
  /** MIME type of the image */
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  /** Complete data URL ready for use */
  dataUrl: string;
}

export interface MagicCommentDefaultsContext {
  when_omitted: string;
  runtime: string;
  sdk_import: string;
}

export interface MagicCommentSourceOfTruth {
  interface: string;
  parser: string;
  runtime_defaults: string;
  sdk_import_defaults: string;
}

export interface MagicCommentCategories {
  execution: string[];
  logging: string[];
  cors: string[];
  ai: string[];
  metadata: string[];
}

export interface MagicCommentSchemaField {
  key: string;
  directive: string;
  category: string;
  type: string;
  enum_values?: string[];
  accepts_keywords?: string[];
  range?: MagicCommentRange;
  description: string;
  defaults: MagicCommentDefaults;
  examples?: string[];
  notes?: string[];
}

/**
 * Progress information for an active extraction
 */
export interface ExtractionProgress {
  archive_path?: string;
  dest_path?: string;
  extracted_bytes?: number;
  extracted_files?: number;
  id?: string;
  percentage?: number | null;
  /** True if this is a selective extraction */
  selective?: boolean;
  /** The selective path being extracted */
  selective_path?: string | null;
  start_time?: number;
  status?: string;
  total_bytes?: number | null;
  total_files?: number | null;
}

/**
 * A single content search match within a file
 */
export interface GrepMatch {
  /** Byte offset of match start within the line */
  column_byte: number;
  /** Lines after the match (when context > 0) */
  context_after?: string[];
  /** Lines before the match (when context > 0) */
  context_before?: string[];
  /** The matched line content (truncated at 4096 chars) */
  line: string;
  /** 1-based line number */
  line_number: number;
  /** API path of the matched file */
  path: string;
}

/**
 * A file or directory matching a glob pattern
 */
export interface GlobEntry {
  /** Whether the entry is a directory */
  is_dir: boolean;
  /** Last modification time as Unix timestamp (seconds) */
  modified?: number | null;
  /** API path of the matched file or directory */
  name: string;
  /** File size in bytes (0 for directories) */
  size: number;
}

/**
 * Individual entry within an archive
 */
export interface ArchiveEntry {
  compressed_size?: number | null;
  /** Entry type: "directory", "symlink", or "file" */
  entry_type?: string | null;
  is_dir?: boolean;
  /** Symlink target path (only present for symlink entries) */
  link_target?: string | null;
  modified_time?: number | null;
  path?: string;
  permissions?: number | null;
  size?: number;
}

/**
 * Progress information for an active download
 */
export interface DownloadProgress {
  current_size?: number;
  directory?: string;
  expected_size?: number | null;
  file_path?: string;
  filename?: string;
  id?: string;
  progress_percentage?: number | null;
  start_time?: number;
  status?: "starting" | "downloading" | "completed";
  url?: string;
}

/**
 * Represents a file or directory entry
 */
export interface PathItem {
  /** Unix timestamp in milliseconds */
  mtime?: number;
  name?: string;
  path_type?: "File" | "Dir" | "SymlinkFile" | "SymlinkDir";
  /** Number of journal revisions for this file (null if never mutated via API or journal disabled) */
  revisions?: number | null;
  /** File size in bytes or number of items in directory */
  size?: number;
}

export interface main_requestItem {
  noFail?: boolean;
  query?: string;
  /** SQL statement to execute (preferred field) */
  statement?: string;
  values?: number[];
  valuesBatch?: number[][];
  /** Alias for `statement` (backward compatibility) */
  sql?: string;
}

export interface HealthMemory4 {
  heap?: number | null;
  /** @minimum 0 */
  rss: number /* min: 0 */;
}

export interface WatcherResponse {
  statusCode: number;
  message: string;
  data: { config: WatcherConfigView; created_at: string; id: string; stats: WatcherStats };
}

export interface FileEvent {
  /** Optional details, mainly for overflow/error events. */
  details?: string | null;
  /**
   * Monotonic event id (per process)
   * @minimum 0
   */
  id: number /* min: 0 */;
  is_dir?: boolean | null;
  kind: WatchEventKind;
  /** Current file size in bytes when known. */
  new_size_bytes?: number | null;
  /** Old path for rename events. */
  old_path?: string | null;
  /** Previous file size in bytes when known. */
  old_size_bytes?: number | null;
  /** New/current path for the event. */
  path: string;
  timestamp: string;
  watcher_id: string;
}

export interface RawCrontabResponse {
  statusCode: number;
  message: string;
  data: { crontab: string; user: string };
}

export interface HealthMemory5 {
  heap?: number | null;
  /** @minimum 0 */
  rss: number /* min: 0 */;
}

export type CrontabEntryView = { command: string; comment?: string | null; created_at: string; enabled: boolean; expired: boolean; expires_at?: string | null; id: string; name?: string | null; schedule: string; schedule_human: string; type: "managed"; updated_at: string } | { line: string; type: "raw" };

export interface HealthMemory6 {
  /** Resident set size in bytes */
  rss: number;
  /** V8 heap used in bytes */
  heap?: number | null;
}

export interface BindingDetail {
  /** @minimum 0 */
  bindId: number /* min: 0 */;
  kind: string;
  mode: string;
  /** @minimum 0 */
  port: number /* min: 0 */;
  sessionId: string;
}

export interface HealthMemory7 {
  heap?: number | null;
  /** @minimum 0 */
  rss: number /* min: 0 */;
}

export interface SessionInfo {
  /** @minimum 0 */
  activeStreams: number /* min: 0 */;
  bindings: BindingInfo[];
  /** @minimum 0 */
  connectionsGranted: number /* min: 0 */;
  isV2: boolean;
  /** @minimum 0 */
  maxStreams: number /* min: 0 */;
  peerAddr: string;
  sessionId: string;
}

export interface TunnelSessionView {
  /** @minimum 0 */
  activeStreams: number /* min: 0 */;
  /** @minimum 0 */
  connectionsGranted: number /* min: 0 */;
  exposeBindings: TunnelBindingView[];
  peerAddr: string;
  protocol: string;
  pullBindings: TunnelBindingView[];
  sessionId: string;
}

export interface HealthMemory8 {
  /** Resident set size in bytes */
  rss: number;
  /** Language runtime heap in bytes (null for Rust) */
  heap?: number | null;
}

/**
 * Recommended execution mode returned by preflight.
 */
export type RecommendedMode = "search-only" | "dry-run" | "delegated-execute" | "printed-curl";

export interface TerminalRequestPreview {
  terminal_url: string;
  terminal_id: number;
  display: string;
  origin: string;
  command: string;
  defer_pid?: number;
  defer_start_time_ticks?: string;
  defer_timeout_ms?: number;
  defer_poll_ms?: number;
}

export interface MissingRequirement {
  kind: string;
  name: string;
  message: string;
  resolution?: string;
}

export interface EffectivePolicy {
  require_verified: boolean;
  require_integrity: boolean;
  allow_delegated_execution: boolean;
  allow_redirect: boolean;
  deny_providers?: SourceKind[];
  deny_source_ids?: string[];
}

export interface BatchItemRequest {
  request_id: string;
  mode: BatchMode;
  selector: Selector;
}

export interface BatchItemResult {
  result: "search" | "run" | "error";
  request_id: string;
  search?: SearchResponse;
  run?: RunResponse;
  error?: ApiError;
}

/**
 * Runtime health status for a source.
 */
export type SourceHealthStatus = "unknown" | "idle" | "ok" | "error" | "disabled" | "filtered";

/**
 * Configuration for a package source including its type, provider, priority, and provider-specific settings.
 */
export interface SourceConfig {
  /** Unique source identifier */
  source_id: string;
  /** Whether this source is active for searches */
  enabled: boolean;
  /** Source priority (higher values are searched first and ranked higher) */
  priority: number;
  provider: SourceKind;
  source_type: SourceType;
  pin?: SourcePin;
  /** Provider-specific configuration (varies by source_type) */
  config?: Record<string, unknown>;
}

/**
 * User profile containing default preferences and source overrides.
 */
export interface ProfileConfig {
  /** Unique profile name */
  name: string;
  /** Human-readable profile description */
  description?: string;
  defaults?: ProfileDefaults;
  sources_mode?: ProfileSourceMode;
  /** Per-source overrides (enable/disable/reprioritize) */
  sources?: ProfileSourceOverride[];
  policy?: PolicyConfig;
}

export interface RecipeConfig {
  name: string;
  description?: string;
  selector_template?: SelectorTemplate;
  allowed_overrides?: string[];
}

export interface WebhookConfig {
  id: string;
  url: string;
  enabled: boolean;
  events?: string[];
  secret?: string;
  timeout_ms?: number;
  max_retries?: number;
}

/**
 * Background job type.
 */
export type JobKind = "source-sync" | "search-resolve";

/**
 * Current status of an async background job (e.g. source sync).
 */
export type JobStatus2 = "queued" | "running" | "done" | "error";

/**
 * Type of inline job result payload.
 */
export type JobResultType = "search-response";

export interface proxyLogs_LogEntry {
  id?: number;
  traceId?: string;
  tsMs?: number;
  tsIso?: string;
  kind?: "request" | "response" | "event";
  level?: "debug" | "info" | "warn" | "error";
  projectId?: string;
  containerId?: string;
  serviceName?: string;
  method?: string;
  url?: string;
  clientIp?: string;
  status?: number;
  data?: Record<string, unknown>;
  source?: "backend" | "edge";
}

/**
 * cURL request parameters

F15: `deny_unknown_fields` rejects any unexpected field in JSON bodies.
Protects against clients silently sending removed-or-future fields that
bypass the runtime validation.
 */
export interface CurlRequest {
  auth_method?: string | null;
  auth_password?: string | null;
  auth_user?: string | null;
  bearer_token?: string | null;
  cacert?: string | null;
  cert?: string | null;
  cert_type?: string | null;
  compressed?: boolean | null;
  connect_timeout?: number | null;
  cookie?: string | null;
  data?: string | null;
  follow_redirects?: boolean | null;
  form?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
  insecure?: boolean | null;
  job_name?: string | null;
  json?: unknown;
  keepalive?: boolean | null;
  keepalive_time?: number | null;
  key?: string | null;
  max_filesize?: number | null;
  max_redirects?: number | null;
  method?: string | null;
  mode?: null | ExecutionMode;
  proxy?: string | null;
  proxy_password?: string | null;
  proxy_user?: string | null;
  range?: string | null;
  referer?: string | null;
  response?: null | ResponseMode;
  retry_count?: number | null;
  retry_delay?: number | null;
  save?: boolean | null;
  /** Relative path under this job's download directory (downloads/by-job/{job_id}).
Must not be absolute or contain `..`. */
  save_path?: string | null;
  schedule?: string | null;
  session_id?: string | null;
  speed_limit?: number | null;
  speed_time?: number | null;
  tcp_nodelay?: boolean | null;
  timeout?: number | null;
  url: string;
  user_agent?: string | null;
}

export type orderedmap_OrderedMap = Record<string, unknown>;

/**
 * Job status
 */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * A single response header as received from the upstream server.
 */
export interface ResponseHeader {
  name: string;
  value: string;
}

/**
 * Persisted cookie metadata used to prevent cross-domain replay.
 */
export interface StoredCookie {
  domain: string;
  host_only: boolean;
  name: string;
  path: string;
  secure: boolean;
  value: string;
}

/**
 * Runtime status for a standard (non-port-range) program
 */
export interface ProgramStatus {
  /** Program identifier */
  id?: number;
  /** Current runtime status of the program */
  status?: "RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "BACKOFF" | "FATAL";
  /** Process ID when running, null otherwise */
  pid?: number | null;
  /**
   * Uptime in format "H:MM:SS" when running
   * @pattern ^\d+:\d{2}:\d{2}$
   */
  uptime?: string | null;
}

export interface FileInfo {
  /** Absolute file path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
}

export interface MagicCommentRange {
  min?: number;
  max?: number;
}

export interface MagicCommentDefaults {
  when_omitted: AnyValue;
  runtime: AnyValue;
  sdk_import: AnyValue;
}

export interface WatcherConfigView {
  /** @minimum 0 */
  coalesce_ms: number /* min: 0 */;
  exclude: string[];
  /** @minimum 0 */
  history_limit_bytes: number /* min: 0 */;
  /** @minimum 0 */
  history_size: number /* min: 0 */;
  ignore_dirs: string[];
  include: string[];
  kinds: WatchEventKind[];
  paths: string[];
  recursive: boolean;
  skip_hidden: boolean;
}

export interface WatcherStats {
  /** @minimum 0 */
  active_clients: number /* min: 0 */;
  /** @minimum 0 */
  events_broadcast: number /* min: 0 */;
  /** @minimum 0 */
  events_dropped: number /* min: 0 */;
  /** @minimum 0 */
  events_seen: number /* min: 0 */;
  /** @minimum 0 */
  stream_errors: number /* min: 0 */;
}

export interface BindingInfo {
  /** @minimum 0 */
  bindId: number /* min: 0 */;
  /** @minimum 0 */
  containerPort: number /* min: 0 */;
  kind: string;
  mode: string;
}

export interface TunnelBindingView {
  /** @minimum 0 */
  bindId: number /* min: 0 */;
  /** @minimum 0 */
  containerPort: number /* min: 0 */;
}

/**
 * Batch item mode.
 */
export type BatchMode = "search" | "run";

/**
 * Full selector (search/run request) combining query filters, pick mode,
execution context, deferred execution, and output control fields. Can be
expressed via query parameters, path segments, or JSON body.
 */
export interface Selector {
  /** Primary name query (aliases q, name) */
  app: string;
  os?: Os;
  kind?: AppKind;
  /** Source kind filter (repeatable). Empty means no filter. */
  source?: SourceKind[];
  arch?: Arch;
  /** Free-form tags for filtering and ranking */
  tags?: string[];
  /** Named profile for default preferences */
  profile?: string;
  /** Release channel hint (e.g. stable, beta, nightly) */
  channel?: string;
  /** Exact version or constraint (provider-defined) */
  version?: string;
  /** Provider-defined variant (e.g. portable, headless) */
  variant?: string;
  /** Publisher hint for curated registries */
  publisher?: string;
  /** Repository hint (e.g. owner/name for GitHub sources) */
  repo?: string;
  /** Release hint (e.g. tag for release-based sources) */
  release?: string;
  /** Desired asset name or pattern */
  asset?: string;
  pick?: PickMode;
  /**
   * Candidate index (required when pick=index)
   * @minimum 0
   */
  pick_index?: number /* min: 0 */;
  /** Specific candidate ID (required when pick=id) */
  candidate_id?: string;
  /** Bind pick to a specific candidate set to avoid races */
  set_id?: string;
  /**
   * Terminal session ID for execution (default: 1)
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  /** X11 DISPLAY number (defaults to terminal_id) */
  display?: string;
  /** Origin identifier for observability propagation */
  origin?: string;
  /** Defer command injection until this PID exits (TUI-safe) */
  defer_pid?: number;
  /** /proc/<pid>/stat field 22 to avoid PID reuse bugs */
  defer_start_time_ticks?: string;
  /** Max wait time for defer_pid exit in ms (default: 60000) */
  defer_timeout_ms?: number;
  /** Poll interval for defer_pid in ms (default: 50, min: 10) */
  defer_poll_ms?: number;
  format?: OutputFormat;
  /** If true and HTML, redirect to display page after scheduling */
  redirect?: boolean;
  /** Override redirect target URL */
  redirect_to?: string;
  /** If true, force command-only output (no hoody-terminal delegation) */
  dry_run?: boolean;
  print_curl?: PrintCurlMode;
  /**
   * Maximum candidates to return (default: 25)
   * @minimum 1
   * @maximum 100
   */
  limit?: number /* min: 1, max: 100 */;
}

/**
 * Response from the search endpoint containing a set ID for race-free selection and the ranked list of candidates.
 */
export interface SearchResponse {
  statusCode: number;
  message: string;
  data: { set_id: string; candidates: Candidate[] };
}

/**
 * Response from run endpoints. The shape varies by status:
- resolved: set_id + candidates (no execution)
- scheduled: set_id + selected + shell_command + terminal response (only when execution is enabled)
- dry-run: set_id + selected + shell_command (default command-only behavior)
- printed-curl: set_id + selected + curl command
- error: set_id + error message
 */
export interface RunResponse {
  status: RunStatus;
  set_id?: string;
  candidates?: Candidate[];
  selected?: Candidate;
  shell_command?: string;
  terminal?: TerminalExecuteResponse;
  curl?: string;
  error?: string;
  handoff?: RunHandoff;
  warnings?: WarningEntry[];
  statusCode: number;
  message: string;
  data: unknown;
}

/**
 * Standard JSON error payload for request validation, lookup failures, and upstream/service issues.
 */
export interface ApiError {
  /** Human-readable error message */
  error: string;
  /** HTTP status code associated with the error */
  code: number;
}

/**
 * Specific source implementation type. Determines how the source resolves and syncs candidates.
 */
export type SourceType = "nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "manifest-registry" | "manifest-remote-index" | "system-path" | "trusted-list-file";

/**
 * Pin configuration for a source, including URL and optional integrity verification fields.
 */
export interface SourcePin {
  /** Pinned URL for the source */
  url: string;
  /** SHA-256 hash for integrity verification */
  sha256?: string;
  /** Ed25519 public key of the source author (base64) */
  author_pubkey_ed25519?: string;
  /** Ed25519 signature for provenance verification (base64) */
  sig_ed25519?: string;
}

/**
 * Default selector values applied when a profile is active and the request does not explicitly set these fields.
 */
export interface ProfileDefaults {
  os?: Os;
  kind?: AppKind;
  /** Default source filter */
  source?: SourceKind[];
  pick?: PickMode;
  /**
   * Default terminal session ID
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  /** Default X11 DISPLAY number */
  display?: string;
  /** Default redirect behavior for HTML responses */
  redirect?: boolean;
  /**
   * Default maximum candidates to return
   * @minimum 1
   * @maximum 100
   */
  limit?: number /* min: 1, max: 100 */;
}

/**
 * How a profile interacts with the global source list:
- inherit: start from global sources, apply overrides
- allowlist: disable all sources first, then enable only those listed in the profile's sources array
 */
export type ProfileSourceMode = "inherit" | "allowlist";

/**
 * Per-source override within a profile.
 */
export interface ProfileSourceOverride {
  /** ID of the source to override */
  source_id: string;
  /** Override enabled state */
  enabled?: boolean;
  /** Override priority */
  priority?: number;
}

export interface PolicyConfig {
  require_verified?: boolean;
  require_integrity?: boolean;
  allow_delegated_execution?: boolean;
  allow_redirect?: boolean;
  deny_providers?: SourceKind[];
  deny_source_ids?: string[];
}

/**
 * Partial selector template used by saved recipes and recipe override requests.
 */
export interface SelectorTemplate {
  app?: string;
  os?: Os;
  kind?: AppKind;
  source?: SourceKind[];
  arch?: Arch;
  tags?: string[];
  profile?: string;
  channel?: string;
  version?: string;
  variant?: string;
  publisher?: string;
  repo?: string;
  release?: string;
  asset?: string;
  pick?: PickMode;
  /** @minimum 0 */
  pick_index?: number /* min: 0 */;
  candidate_id?: string;
  set_id?: string;
  /**
   * @minimum 1
   * @maximum 65535
   */
  terminal_id?: number /* min: 1, max: 65535 */;
  display?: string;
  origin?: string;
  defer_pid?: number;
  defer_start_time_ticks?: string;
  defer_timeout_ms?: number;
  defer_poll_ms?: number;
  format?: OutputFormat;
  redirect?: boolean;
  redirect_to?: string;
  dry_run?: boolean;
  print_curl?: PrintCurlMode;
  /**
   * @minimum 1
   * @maximum 100
   */
  limit?: number /* min: 1, max: 100 */;
}

/**
 * Job execution mode
 */
export type ExecutionMode = "sync" | "async";

/**
 * Response mode
 */
export type ResponseMode = "transparent" | "json";

/**
 * Flexible value type used for defaults metadata
 */
export type AnyValue = string | number | boolean | unknown[] | Record<string, unknown> | null;

export type WatchEventKind = "created" | "modified" | "removed" | "renamed" | "metadata" | "overflow" | "other";

/**
 * Status of a run request:
- resolved: candidates found but no execution (no pick or pick=ask)
- scheduled: candidate selected and execution delegated to hoody-terminal (only when HOODY_RUN_ENABLE_TERMINAL_EXECUTE=true)
- dry-run: candidate selected and exact shell command returned without delegation
- printed-curl: equivalent curl command generated (print_curl set)
- error: an error occurred during resolution or execution
 */
export type RunStatus = "resolved" | "scheduled" | "dry-run" | "printed-curl" | "error";

/**
 * A standardized runnable application candidate produced by a source provider. Contains all information needed to identify, rank, and return exact shell commands for execution.
 */
export interface Candidate {
  /** Stable hash of canonical candidate payload, unique within a candidate set */
  candidate_id: string;
  /** Human-readable display title */
  title: string;
  /** Brief description of the candidate */
  description: string;
  /** Provider-reported version string */
  version?: string;
  /** Provider or project homepage URL */
  homepage?: string;
  /** Tags for categorization and filtering */
  tags?: string[];
  provider: SourceKind;
  /** ID of the source that produced this candidate */
  source_id: string;
  /** Ranking score (higher is better) */
  score: number;
  /** Human-readable reasons why this candidate matched or ranked highly */
  reasons?: string[];
  integrity?: Integrity;
  run_plan: RunPlan;
  execution_plan?: ExecutionPlan;
  /** Whether the candidate was verified by a trusted source or integrity check */
  verified?: boolean;
  provenance?: CandidateProvenance;
  /** Exact shell command after applying run_plan.env and run_plan.cwd wrapping */
  shell_command?: string;
  /** Path-only reference URL (no domain) for HTML links */
  href_path?: string;
}

/**
 * Response received from the hoody-terminal execute API after delegating command execution.
 */
export interface TerminalExecuteResponse {
  statusCode: number;
  message: string;
  data: { status: number; ok: boolean; body_text?: string; json: Record<string, unknown> | null };
}

/**
 * Where the selected app appears (scheduled) or will appear (preview).
 */
export interface RunHandoff {
  state: HandoffState;
  terminal_id: number;
  display: string;
  /** Live display page URL (present only when state=scheduled) */
  display_url?: string;
  /** Live terminal viewer URL (present only when state=scheduled) */
  terminal_url?: string;
  /** Predicted display page URL (present only when state=preview) */
  predicted_display_url?: string;
  /** Predicted terminal viewer URL (present only when state=preview) */
  predicted_terminal_url?: string;
}

export interface WarningEntry {
  code: string;
  message: string;
}

/**
 * Target app runtime OS (not the host OS). Determines which candidates are eligible.
 */
export type Os = "linux" | "windows" | "any";

/**
 * Application kind filter - gui for graphical apps, cli for terminal apps, any for both.
 */
export type AppKind = "gui" | "cli" | "any";

/**
 * Target CPU architecture for filtering candidates.
 */
export type Arch = "amd64" | "arm64" | "any";

/**
 * Candidate selection mode:
- ask: return candidate list without selecting (default)
- first: automatically select the highest-ranked candidate
- index: select by 0-based index (requires pick_index)
- id: select by candidate_id (requires candidate_id)
 */
export type PickMode = "ask" | "first" | "index" | "id";

/**
 * Output format override. When set, takes precedence over Accept header content negotiation.
 */
export type OutputFormat = "json" | "html";

/**
 * Curl command generation mode:
- hoody-run: generate curl for the hoody-run /api/v1/run/run endpoint
- hoody-terminal: generate curl for the hoody-terminal /api/v1/terminal/execute endpoint directly
 */
export type PrintCurlMode = "hoody-run" | "hoody-terminal";

/**
 * Package source provider kind. Used for filtering candidates by source and as the provider field on candidates.
 */
export type SourceKind = "nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "any";

/**
 * Optional integrity and provenance information for a candidate, including download URL, hash, and optional Ed25519 signature.
 */
export interface Integrity {
  /** Download or source URL */
  url: string;
  /** SHA-256 hash of the artifact */
  sha256?: string;
  /** Ed25519 public key of the manifest author (base64) */
  author_pubkey_ed25519?: string;
  /** Ed25519 signature of the manifest content (base64) */
  sig_ed25519?: string;
}

/**
 * Execution plan for a candidate. Contains the base shell command with optional environment variables and working directory metadata.
 */
export interface RunPlan {
  /** Complete shell command (no placeholders) */
  command: string;
  /** Environment variables to set before command execution */
  env?: Record<string, unknown>;
  /** Working directory for command execution */
  cwd?: string;
}

export interface ExecutionPlan {
  mode?: ExecutionMode2;
  shell?: string;
  shell_command?: string;
  argv?: string[];
  env?: Record<string, unknown>;
  cwd?: string;
  side_effect_hints?: SideEffectHint[];
}

export interface CandidateProvenance {
  match_kind?: string;
  matched_value?: string;
  match_evidence?: MatchEvidence[];
  score_components?: ScoreComponent[];
  verification?: VerificationEvidence;
  provider_notes?: string[];
}

/**
 * Liveness of the display/terminal handoff:
- preview: nothing executed; predicted_* URLs show where the app WILL appear
- scheduled: delegated execution succeeded; live display_url/terminal_url
- failed: delegation was attempted and failed; no URL is asserted
 */
export type HandoffState = "preview" | "scheduled" | "failed";

/**
 * Structured execution plan mode.
 */
export type ExecutionMode2 = "shell-inline" | "argv";

export interface SideEffectHint {
  code: string;
  description: string;
}

export interface MatchEvidence {
  field: string;
  kind: string;
  value: string;
}

export interface ScoreComponent {
  label: string;
  delta: number;
  detail?: string;
}

export interface VerificationEvidence {
  verified: boolean;
  status?: string;
  note?: string;
}
