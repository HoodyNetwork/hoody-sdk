// account-mail.ts: the two mails a signed-in account asks Hoody to send to its own address (the Account page): the
// link that sets or resets the password, and the address's verification link.
//
// Contract:
//   - Endpoints: POST /auth/forgot-password and POST /auth/resend-verification, each with the address alone. They are
//     the routes the sign-in screens call (signin.ts); Hoody answers the same whether or not a mail goes out.
//   - Sent as nobody ({anonymous: true}): in a browser no stored session is read, attached, refreshed or cleared for the
//     call, so no answer to it can end the session of the page that asked. No redirect is followed.
//   - Answers are typed outcomes only: a rejection's message, data and body never leave this file.
//   - A Hub that sends no change where it runs (a terminal started read-only, or one with no usable store) refuses the
//     ask unsent: `read-only`.
//   - This file reads no browser global, so a page drawn in a terminal can import it (signin.ts is the web sign-in
//     screens' and keeps their storage rules).
import { apiOrigin } from './origin';
import { shared } from './session';

export type AccountMailResult =
  | { readonly kind: 'sent' } // the Hoody answers the same whether or not the address has an account
  | { readonly kind: 'refused'; readonly why: 'address' | 'retry' | 'network' | 'unavailable' | 'framed' | 'no-api' | 'read-only'; readonly retryAfter?: number };

/** One anonymous POST to the Hoody API base; tests pass their own. */
export type AccountMailCall = (path: string, body: Record<string, unknown>) => Promise<unknown>;

const TIMEOUT_MS = 20_000;
const liveCall: AccountMailCall = (path, body) => shared().apiCall('POST', path, body, undefined, undefined, { anonymous: true, noRedirect: true, timeoutMs: TIMEOUT_MS });

/** Asks the Hoody to email the link that sets a new password (POST /auth/forgot-password). */
export function requestPasswordReset(email: string, call: AccountMailCall = liveCall, origin: () => string | null = apiOrigin): Promise<AccountMailResult> {
  return ask('/auth/forgot-password', email, call, origin);
}

/** Asks the Hoody to email the address's verification link again (POST /auth/resend-verification). */
export function resendVerification(email: string, call: AccountMailCall = liveCall, origin: () => string | null = apiOrigin): Promise<AccountMailResult> {
  return ask('/auth/resend-verification', email, call, origin);
}

async function ask(path: string, email: string, call: AccountMailCall, origin: () => string | null): Promise<AccountMailResult> {
  if (origin() === null) return { kind: 'refused', why: 'no-api' };
  try {
    await call(path, { email: email.trim() });
    return { kind: 'sent' };
  } catch (e) {
    return refusalOf(e);
  }
}

/** A rejection as a typed refusal: only its status, code and wait are read. */
function refusalOf(e: unknown): AccountMailResult {
  const r = e && typeof e === 'object' && !Array.isArray(e) ? (e as { status?: unknown; code?: unknown; retryAfter?: unknown }) : null;
  const status = typeof r?.status === 'number' ? r.status : null;
  const code = typeof r?.code === 'string' ? r.code : '';
  if (code === 'FRAMED_ACTION_REFUSED') return { kind: 'refused', why: 'framed' };
  if (code === 'BAD_API_BASE') return { kind: 'refused', why: 'no-api' };
  if (code === 'TERM_READ_ONLY' || code === 'NOT_DURABLE') return { kind: 'refused', why: 'read-only' };
  if (status === null || status === 0) return { kind: 'refused', why: 'network' };
  if (status === 429) {
    const after = typeof r?.retryAfter === 'number' && Number.isFinite(r.retryAfter) && r.retryAfter > 0 ? r.retryAfter : undefined;
    return after !== undefined ? { kind: 'refused', why: 'retry', retryAfter: after } : { kind: 'refused', why: 'retry' };
  }
  // The request check refused the address (400), or the answer was a 401: nothing was mailed.
  if (status === 400 || status === 401) return { kind: 'refused', why: 'address' };
  return { kind: 'refused', why: 'unavailable' };
}
