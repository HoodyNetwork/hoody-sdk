// realm-id.ts: the one check for a realm id (24 lowercase hex characters) and for a realm scope ('global' or one id).
// Callers that also accept 'all' or another word add that test themselves; the check is never loosened here.

export const RE24 = /^[0-9a-f]{24}$/;

/** A realm id: a string of exactly 24 lowercase hex characters. */
export const isRealmId = (v: unknown): v is string => typeof v === 'string' && RE24.test(v);

/** One realm scope: 'global' or a realm id (never 'all'). */
export const isRealmOrGlobal = (v: unknown): v is string => v === 'global' || isRealmId(v);
