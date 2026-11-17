// The Referrals page's routes. Every /referrals path goes to the base
// host in any realm view and is refused unsent in a token session (core/api.ts BASE_ONLY): the program is the
// account's own. Each route lists every code it can answer with (the API's affiliate routes and the auth and ban
// middleware before it); a 429 is read by its status, not a code. The writes are JWT-only and take no
// idempotency key: core's lock is what keeps a change that may have gone through from being sent again.
import { defineRoute } from '@core';

const ANY = ['INSUFFICIENT_PERMISSIONS', 'ACCOUNT_BANNED'] as const;
const CODES_GONE = ['REFERRAL_CODE_LIMIT_REACHED', 'REFERRAL_CODE_ISSUANCE_BLOCKED', 'AFFILIATE_NOT_ENROLLED', 'AFFILIATE_REMOVED', 'AFFILIATE_NOT_ELIGIBLE'] as const;

export const routes = {
  me: defineRoute({ method: 'GET', path: '/referrals/me', scope: 'base', codes: [...ANY] }),
  check: defineRoute({ method: 'GET', path: '/referrals/me/codes/check', scope: 'base', query: ['code'], codes: [...CODES_GONE, ...ANY] }),
  /** Join: 201 with the same answer as `me`. */
  join: defineRoute({
    method: 'POST',
    path: '/referrals/me',
    scope: 'base',
    body: [],
    codes: ['AFFILIATE_NOT_ELIGIBLE', 'AFFILIATE_REMOVED', 'AFFILIATE_ALREADY_ENROLLED', 'AFFILIATE_ENROLMENT_PAUSED', ...ANY],
  }),
  /** A custom code, sent as the server stores it (normCode). */
  create: defineRoute({
    method: 'POST',
    path: '/referrals/me/codes',
    scope: 'base',
    body: ['code'],
    codes: ['REFERRAL_CODE_INVALID', 'REFERRAL_CODE_RESERVED', 'REFERRAL_CODE_TAKEN', ...CODES_GONE, ...ANY],
  }),
  /** Release one listed custom code, for good. */
  release: defineRoute({ method: 'DELETE', path: '/referrals/me/codes/:code', scope: 'base', codes: ['REFERRAL_CODE_NOT_FOUND', 'REFERRAL_CODE_NOT_REMOVABLE', ...ANY] }),
} as const;
