// The Realm limit: an account may use a limited number of distinct realms. The API is the authority: it reports use
// against the limit on the realm list (a `cap` object) and refuses a write that would add a realm past it. The Hub
// only shows the numbers and turns off the "New realm" entry while the API says the limit is reached; it never counts
// by itself.
//
// THE ONE PLACE TO RENAME: the refusal's code and status, the cap's field names and the realms each plan includes are
// all here. Nothing else in the Hub spells them.

/** The refusal of a write that would add a realm past the limit: its code and HTTP status. */
export const REALM_LIMIT_CODE = 'REALM_LIMIT_REACHED';
export const REALM_LIMIT_STATUS = 400;
/** The cap object on the realm list answer, and its fields. */
export const REALM_CAP_FIELD = 'cap';
export const REALM_CAP_MAX = 'max';
export const REALM_CAP_USED = 'used';
export const REALM_CAP_REACHED = 'reached';
/** Realms included per plan (public plan terms). At the highest there is nothing to upgrade to: Upgrade is offered
 *  only while the limit is reached and below it (read from the cap's own `max`, never from a guess at the plan). */
export const PLAN_REALMS = { free: 5, paid: 50, bareMetal: 1000 } as const;
export const TOP_PLAN_REALMS = PLAN_REALMS.bareMetal;

/** Use against the limit as the API sent it. A missing number is unknown (null), never zero. */
export interface RealmCap { max: number | null; used: number | null; reached: boolean }

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** The cap of a realm list answer's `data`; null when the answer carries none (nothing is shown or turned off then). */
export function parseRealmCap(data: unknown): RealmCap | null {
  if (!data || typeof data !== 'object') return null;
  const c = (data as Record<string, unknown>)[REALM_CAP_FIELD];
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const o = c as Record<string, unknown>;
  const max = count(o[REALM_CAP_MAX]), used = count(o[REALM_CAP_USED]), said = o[REALM_CAP_REACHED];
  // Only the API's own word turns anything off: the Hub never works `reached` out from the numbers.
  const reached = said === true;
  if (max === null && used === null && typeof said !== 'boolean') return null;
  return { max, used, reached };
}

/** What the realm menu shows of the cap. `upgrade`: the limit is reached and a higher plan exists (false on the top plan and while the limit is unknown). */
export type RealmCapView =
  | { k: 'none' }
  | { k: 'use'; used: number; max: number; reached: boolean; upgrade: boolean }
  | { k: 'limit'; max: number; reached: boolean; upgrade: boolean }
  | { k: 'reached'; reached: true; upgrade: boolean };

export function realmCapView(cap: RealmCap | null): RealmCapView {
  if (!cap) return { k: 'none' };
  const upgrade = cap.reached && cap.max !== null && cap.max < TOP_PLAN_REALMS;
  if (cap.max !== null && cap.used !== null) return { k: 'use', used: cap.used, max: cap.max, reached: cap.reached, upgrade };
  if (cap.max !== null) return { k: 'limit', max: cap.max, reached: cap.reached, upgrade };
  return cap.reached ? { k: 'reached', reached: true, upgrade } : { k: 'none' };
}

/** A higher plan with more realms exists: only while the limit is known and below the top plan's. */
export function realmCapMore(cap: RealmCapView): boolean {
  return (cap.k === 'use' || cap.k === 'limit') && cap.max < TOP_PLAN_REALMS;
}

/** A rejection that is the Realm limit refusal (by its code; the write was not applied and is never sent again). */
export function isRealmLimit(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === REALM_LIMIT_CODE;
}

/** The numbers a refusal carries ({ max, used }), each null when absent. */
export function realmLimitNumbers(e: unknown): { max: number | null; used: number | null } {
  const d = e && typeof e === 'object' ? (e as { data?: unknown }).data : null;
  const o = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
  return { max: count(o[REALM_CAP_MAX]), used: count(o[REALM_CAP_USED]) };
}
