// twofa.ts: the two 2FA changes that rotate the session.
//
// Both revoke every session of the account and answer data:{token, refreshToken, expires_at, ..., session_id,
// sessions_revoked}. The routes declare `reissues`, so api() adopts the fresh pair for the account the change
// was sent as, only while storage still holds that same session, and then nulls token/refreshToken in the
// answer: a page never sees or keeps them. Not adopted (another tab signed in, another account): the next call
// meets the revoked session and signs in again.
import { defineRoute } from './routes';

export interface ReissuedSession {
  readonly data?: {
    readonly token?: null; readonly refreshToken?: null; readonly session_id?: string; readonly sessions_revoked?: boolean;
    readonly expires_at?: string; readonly refresh_expires_at?: string;
  };
}

/** POST /users/auth/2fa/verify-setup {code}: turns 2FA on. */
export const verifySetupRoute = defineRoute<ReissuedSession, { code: string }>({ method: 'POST', path: '/users/auth/2fa/verify-setup', scope: 'base', body: ['code'], reissues: true });
/** DELETE /users/auth/2fa {password, code}: turns 2FA off. */
export const turnOffRoute = defineRoute<ReissuedSession, { password: string; code: string }>({ method: 'DELETE', path: '/users/auth/2fa', scope: 'base', body: ['password', 'code'], reissues: true });
