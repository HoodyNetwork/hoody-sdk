// What an answered 401 is about, for the terminal's client (app/cli-http.ts) and its shared seam (env/client-shared.ts).
// The same reading as the web's shared.js, so the two Hubs decide alike:
// - a 401 that names a code outside the list below (a wrong or used 2FA code, a wrong current password with its own
//   code) is the route refusing what was asked. The session is untouched: no renewal, no second send, no purge;
// - a 401 with a session code, or with no readable code, is about the credential. The API answers a wrong re-entered
//   password on the 2FA routes with one of these codes too (INVALID_TOKEN), so a request that carries something the
//   person typed is never sent a second time on that answer alone and never ends the session by itself: the client
//   first asks, with one read, whether the session still works.
// Codes only, compared in upper case; an answer's message is never read.

const SESSION_CODES: readonly string[] = ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'MISSING_TOKEN', 'SESSION_REVOKED', 'UNAUTHORIZED'];

/** An answered 401 about the credential itself: its code is a session code, or it names none. */
export function sessionRefusal(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { status?: unknown; code?: unknown; notSent?: unknown; superseded?: unknown };
  if (x.status !== 401 || x.notSent || x.superseded) return false;
  return typeof x.code !== 'string' || x.code === '' || SESSION_CODES.includes(x.code.toUpperCase());
}

const TYPED_FIELDS: readonly string[] = ['password', 'current_password', 'code', 'otp_code'];

/** A request body with a password or a code in it: a 401 for it may be about that value, not about the session. */
export function carriesTyped(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return TYPED_FIELDS.some((k) => typeof (body as Record<string, unknown>)[k] === 'string');
}
