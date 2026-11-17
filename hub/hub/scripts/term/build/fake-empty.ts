// The ship gate's LOADED-EMPTY account: what the API answers a signed-in account that owns nothing (no computers,
// subscriptions, rentals, tokens or notifications, zero balances). measure.ts's fakeClient serves these in mode
// 'empty'; mode 'error' (the default) refuses every page read with 404.
// Each answer is written by hand from the API's response schema of that route (generated/openapi.public.json, GET 200), never
// copied from a page's fixtures; fake-empty.term.test.ts checks each body against that schema and each path against a
// GET route the Hub declares (defineRoute). A page read that is not here still gets 404 in this mode: add it here.
// Plain data, no import: ship-run.ts loads nothing of hub/src.

export interface EmptyAnswer {
  /** The Hub's route path (defineRoute `path`, no /api/v1 prefix, no query). */
  path: string;
  /** Matched against the request path without its query. */
  match: RegExp;
  body: { statusCode: 200; message: string; data: unknown };
}

const ok = (data: unknown, message = 'OK'): EmptyAnswer['body'] => ({ statusCode: 200, message, data });
const ZERO = '0.00';

export const EMPTY_ACCOUNT: readonly EmptyAnswer[] = Object.freeze([
  // The boot fake (measure.ts) answers /computers with a bare `data: []`, which the shell reads as "Computers not
  // loaded"; the empty account answers the declared shape, so this one wins over the boot answer in mode 'empty'.
  { path: '/computers', match: /^\/computers$/, body: ok({ computers: [], pagination: { total: 0, page: 1, limit: 100, totalPages: 0 } }) },
  { path: '/notifications/summary', match: /^\/notifications\/summary$/, body: ok({ unread_count: 0, is_capped: false, unread_cap: 100, latest_id: null, latest_created_at: null, poll_interval_seconds: 300 }) },
  { path: '/wallet/balances', match: /^\/wallet\/balances$/, body: ok({ general_balance: ZERO, referral_credit: ZERO, referral_credit_owed: ZERO, ai_limit: ZERO, ai_usage: ZERO, ai_remaining: ZERO, ai_reserved: ZERO, ai_usage_status: 'live' }) },
  { path: '/subserver-subscriptions', match: /^\/subserver-subscriptions$/, body: ok([]) },
  { path: '/subserver-plans', match: /^\/subserver-plans$/, body: ok({ requested_locale: 'en', plans: [] }) },
  { path: '/servers/available', match: /^\/servers\/available$/, body: ok([]) },
  { path: '/offers', match: /^\/offers$/, body: ok([]) },
  { path: '/rentals', match: /^\/rentals$/, body: ok([]) },
  { path: '/users/me/free-ai-usage', match: /^\/users\/me\/free-ai-usage$/, body: ok({ servers: [], truncated: false }) },
  // No free server and none to claim (pool_empty): the page offers nothing that would send a claim.
  { path: '/users/me/free-tier-status', match: /^\/users\/me\/free-tier-status$/, body: ok({ gate_enabled: false, unlocked: true, has_free_server: false, can_claim: false, claim_blocked_reason: 'pool_empty', signup_code_failed: false, hold: null }) },
  { path: '/auth/tokens', match: /^\/auth\/tokens$/, body: ok([]) },
  { path: '/auth/tokens/templates', match: /^\/auth\/tokens\/templates$/, body: ok([]) },
]);

/** The empty-account answer of a GET, or null (the caller refuses it). */
export function emptyAnswer(method: string, p: string): EmptyAnswer['body'] | null {
  if (method !== 'GET') return null;
  const bare = p.replace(/[?#].*$/s, '');
  return EMPTY_ACCOUNT.find((a) => a.match.test(bare))?.body ?? null;
}
