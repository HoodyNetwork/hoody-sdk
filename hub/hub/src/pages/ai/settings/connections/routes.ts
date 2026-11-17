// The GitHub account requests of AI → Settings → Connections, declared once with core's defineRoute.
// All go to the computer's agent in the realm named by the call (each realm has its own GitHub accounts; never All realms).
// None takes a folder: the status read refuses X-Hoody-Cwd, so no route declares cwd. github.com only (no GitHub
// Enterprise Server host yet), so no `host` is sent and the agent uses github.com.
import { defineRoute } from '@core';

/** A device login runs at most 15 minutes (the agent clamps expires_in to 900 s and waits 30 s past it): the poll's own
 *  timeout outlives that, so only a login that truly ran over reads as unknown. */
export const POLL_TIMEOUT_MS = 990_000;

export const githubRoutes = {
  /** The realm's linked accounts (accounts[]: key, host, login, active) and the active one's health. Never a token. */
  status: defineRoute({ method: 'GET', path: '/github/auth/status', scope: 'agent', realm: 'realm' }),
  /** Starts a device login: a user code to type at GitHub. Links nothing (the code is unusable until someone types it),
   *  and its answer holds the device code, which can claim the token: secret, kept in memory only. */
  start: defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/github/auth/login', scope: 'agent', realm: 'realm', body: [], secret: true }),
  /** Waits (blocking) until the person types the code at GitHub, then links the account. Refused before linking: the code
   *  expired (410), the person declined (403), or GitHub's token failed its check (422). The device code is secret. */
  poll: defineRoute<unknown, { device_code: string; interval: number; expires_in: number; activate: boolean }>({
    method: 'POST', path: '/github/auth/login/poll', scope: 'agent', realm: 'realm',
    body: ['device_code', 'interval', 'expires_in', 'activate'], secret: ['device_code'], timeoutMs: POLL_TIMEOUT_MS,
    refuses: ['github_login_expired', 'github_login_denied', 'github_token_rejected'],
  }),
  /** Makes a linked account the one every GitHub operation uses. 400 when no linked account has the key (refused). */
  active: defineRoute<unknown, { key: string }>({ method: 'POST', path: '/github/auth/active', scope: 'agent', realm: 'realm', body: ['key'], refuses: ['bad_request'] }),
  /** Forgets a linked account and deletes the copies of its token in checkouts the agent can reach now (partial by design).
   *  404 when no linked account has the key (refused, nothing removed). */
  logout: defineRoute<unknown, { key: string }>({ method: 'POST', path: '/github/auth/logout', scope: 'agent', realm: 'realm', body: ['key'], refuses: ['not_found'] }),
} as const;
