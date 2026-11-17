// shape.ts: the small validators the journal's files share (handles, realms, keys). Pure.
import * as L from '../logic';

const HANDLE = /^[^\s/?#]{1,80}$/;
const REALM = /^[0-9a-f]{24}$/;
export const KEY32 = /^hx-[0-9a-f]{32}$/;
export const KEY24 = /^hx-[0-9a-f]{24}$/;
/** A computer handle (name.last4) as an entry and a record carry it. */
export const okHandle = (v: unknown): v is string => typeof v === 'string' && HANDLE.test(v);
/** `global` or a 24-hex realm. */
export const okRealm = (v: unknown): v is string => v === 'global' || (typeof v === 'string' && REALM.test(v));
export const isObj = L.isObj;
export const seg = L.seg;
/** A plain object (not an array). */
export const isRec = (v: unknown): v is Record<string, unknown> => L.isObj(v) && !Array.isArray(v);
