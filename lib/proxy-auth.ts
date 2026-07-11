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

/** Static token auth, sent as Authorization: Bearer or custom header */
export interface ProxyAuthToken {
  type: 'token';
  value: string;
  header?: string; // custom header name (default: 'Authorization')
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
  | 'sqlite' | 'agent' | 'watch' | 'logs' | 'notes' | 'app' | 'pipe'
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
