// leases.ts: the session lease ids (hub_ai_lease_v1, {"<h>:<sid>": id}). The approver capability is a different thing and
// lives in memory; this store keeps only the id a session's lease was acquired under.
//   L1 acquire ok -> set. L2 renew ok -> nothing. L3 404/410 while needed -> acquire again. L4 release or session settled -> drop
//   (true only if written, or if the key was absent on an ok read). L5 load with an unreadable read -> no conclusion, no write.
// The journal facade declares no lease members: this store exists so the approver lease finds its one registered key
// already wired.
import { LEASE_KEY, currentAccount, readStore, updateStore } from './storage';
import { isRec, okHandle, seg } from './shape';

const nameOf = (h: string, sid: string): string => `${h}:${sid}`;
const okId = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,128}$/.test(v);

export class Leases {
  /** The stored id, or null (absent, or unreadable: the caller concludes nothing from null). */
  get(h: string, sid: string): string | null {
    if (!okHandle(h) || !seg(sid)) return null;
    const r = readStore(LEASE_KEY);
    if (r.s !== 'ok' || !isRec(r.v)) return null;
    const v = r.v[nameOf(h, sid)];
    return okId(v) ? v : null;
  }
  set(h: string, sid: string, id: string): boolean {
    if (!okHandle(h) || !seg(sid) || !okId(id)) return false;
    const acct = currentAccount();
    const r = updateStore(LEASE_KEY, (cur) => {
      if (currentAccount() !== acct) return null;
      const map = cur.s === 'missing' ? {} : isRec(cur.v) ? { ...cur.v } : null;
      if (map === null) return null;
      map[nameOf(h, sid)] = id;
      return { set: map };
    }, { keepOthers: true });
    return r === 'ok' || r === 'same';
  }
  drop(h: string, sid: string): boolean {
    if (!okHandle(h) || !seg(sid)) return false;
    const acct = currentAccount();
    let blocked = false;
    const r = updateStore(LEASE_KEY, (cur) => {
      if (currentAccount() !== acct) { blocked = true; return null; }
      if (cur.s === 'missing') return null;
      if (!isRec(cur.v)) { blocked = true; return null; }
      const name = nameOf(h, sid);
      if (!Object.prototype.hasOwnProperty.call(cur.v, name)) return null;
      const map = { ...cur.v };
      delete map[name];
      return Object.keys(map).length ? { set: map } : { remove: true };
    }, { keepOthers: true });
    return !blocked && (r === 'ok' || r === 'same');
  }
}
