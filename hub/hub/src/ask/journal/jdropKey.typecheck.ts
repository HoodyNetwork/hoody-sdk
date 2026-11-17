// jdropKey.typecheck.ts: type-only (never executed; the project tsc checks it). A dock key (conv.ts idKey) or a plain string must
// not be accepted where a pending journal drop's key is required. An unused @ts-expect-error fails tsc, so removing the brand turns
// this file red.
import { idKey } from '../conv';
import type { AskRecord } from '../logic';
import type { DropPend } from './dropPend';

export function typecheck(rec: AskRecord, d: DropPend): void {
  const dock = idKey(rec);
  // @ts-expect-error a dock key is not a JDropKey
  d.registerDrop('acct', dock);
  // @ts-expect-error a dock key is not a JDropKey
  d.dropPending('acct', dock);
  // @ts-expect-error a plain string is not a JDropKey
  d.releaseDrop('acct', 'x', 1);
}
