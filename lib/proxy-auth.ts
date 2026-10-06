/**
 * Kit Proxy Authentication Types (v1 — simplified)
 *
 * These types define credentials for authenticating against
 * Hoody Kit services protected by proxy permissions.
 */

/** JWT auth — pre-signed token, sent as Authorization: Bearer or custom header */
export interface ProxyAuthJwt {
  type: 'jwt';
  token: string;
  header?: string; // custom header name (default: 'Authorization')
}

/** Password auth — Basic auth (Authorization: Basic base64(user:pass)) */
export interface ProxyAuthPassword {
  type: 'password';
  username: string;
  password: string;
}

/**
 * Static token auth, sent as Authorization: Bearer, a custom header, or a
 * query parameter.
 *
 * Match the proxy rule's TokenAuth delivery (hoody-containers-reverse-proxy-
 * endpoints src/types/matrix.types.ts TokenAuth {param, header, cookie};
 * checked in src/permissions/matrix.service.ts case 'token'): a rule with
 * `param` reads ONLY that query parameter, whose name the operator chose —
 * there is no fixed name.
 */
export interface ProxyAuthToken {
  type: 'token';
  value: string;
  header?: string; // custom header name (default: 'Authorization')
  /**
   * Query parameter the proxy rule reads (its TokenAuth `param`). When set,
   * the value is sent as `?<param>=<value>` on every kit request and on
   * WebSocket upgrade URLs (HttpClient.prepareUpgrade, tunnel, curl channel)
   * INSTEAD of a header — the only token form a browser WebSocket can carry.
   * The proxy strips the parameter before forwarding to the container. The
   * HTTP clients record the name for each request
   * (`middlewareContext._credentialQueryParams`) and mask the parameter in
   * logged URLs, ApiError request context and bodies whatever it is called,
   * and they drop it when a request leaves the credential's origin. The
   * WebSocket helpers return the name as `credentialQueryParams`; pass it to
   * `redactUrl(url, names)` before such a URL reaches your own logs. Without
   * those names, `redactUrl` masks only secret-looking names (token, key,
   * auth, …).
   */
  param?: string;
}

/** Container claim auth — sends both X-Hoody-Container-Claim and X-Hoody-Token */
export interface ProxyAuthContainerClaim {
  type: 'containerClaim';
  claim: string;  // JSON-stringified claim object
  token: string;  // API auth token
}

/** IP auth — no credentials, proxy checks client IP */
export interface ProxyAuthIp {
  type: 'ip';
}

export type ProxyAuth = ProxyAuthJwt | ProxyAuthPassword | ProxyAuthToken | ProxyAuthContainerClaim | ProxyAuthIp;

/** Known Kit program slugs (from kit-catalog). Extensible with string. */
export type KitProgram =
  | 'terminal' | 'browser' | 'code' | 'curl' | 'cron'
  | 'daemon' | 'display' | 'exec' | 'files' | 'notifications'
  | 'sqlite' | 'agent' | 'watch' | 'logs' | 'notes' | 'run' | 'pipe'
  | (string & {}); // extensible but autocomplete-friendly

/** Per-service auth overrides. */
export interface ProxyAuthPolicy {
  default?: ProxyAuth;
  services?: Partial<Record<KitProgram, ProxyAuth>>;
}

/** Type guard: distinguishes ProxyAuth (has 'type') from ProxyAuthPolicy. */
export function isProxyAuthPolicy(auth: ProxyAuth | ProxyAuthPolicy): auth is ProxyAuthPolicy {
  return auth !== null && typeof auth === 'object' && !('type' in auth);
}

/**
 * UTF-8-safe Base64 encoding (works in both browser and Node.js).
 * Checks Buffer first (Node.js — no deprecated functions) then btoa (browser).
 */
export function base64Encode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  // Browser: btoa only handles Latin-1, so encode UTF-8 first
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * `url` with a token credential in its query parameter (`auth.param`),
 * replacing any value already there. Only a kit credential ever goes here —
 * never the account API token.
 */
export function withTokenQueryParam(url: string, auth: ProxyAuthToken & { param: string }): string {
  const name = auth.param.trim();
  if (!name) throw new Error('kitAuth token: `param` must be a non-empty query parameter name');
  const u = new URL(url);
  u.searchParams.set(name, auth.value);
  return u.toString();
}
