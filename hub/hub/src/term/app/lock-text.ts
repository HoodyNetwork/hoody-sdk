// The lock view's sentences about the store and about a refused unlock.
// Text only: lock-host.ts decides (notice(), tryUnlock), the lock view draws what this returns.
//
//   - A store that cannot be used keeps the Hub locked. The view names the directory when it is known,
//     says why in plain words, and says how to repair it by hand: Forget cannot work without a store.
//   - Two kinds of reason. The store itself is unusable (its files, its place, a write that failed): the repair is to
//     fix or move the directory. Or the try limit was reached and forgetting this account's Hub data could not finish
//     (`forget-failed`: an unreadable record of open changes, a failed write): the Hub stays locked at every start
//     until the directory is moved aside; that sentence says the passcode will not open it.
//   - One sentence per refusal of an unlock try (`why`).
//   - The path is shown as given by the CLI (a directory under its own data directory: no account id or address is
//     part of it). A reason this module does not know is never echoed: it reads "could not be opened".
//   - Moving the directory aside also moves what this terminal kept to remove its agent keys later, so both repairs
//     say those keys stay valid until they expire and where to remove them.
//   - Every sentence is in the terminal's strings file (shell/strings.en.json, `lock.*`): this module only chooses.
import strings from '../shell/strings.en.json';
import type { StoreNotice, UnlockResult } from './lock-host';

export type UnlockRefusal = Extract<UnlockResult, { k: 'refused' }>['why'];

type Key = keyof typeof strings;
/** Why, by the reason lock-host.ts and the store name: the key of its sentence. */
const WHY: Readonly<Record<string, Key>> = Object.freeze({
  failed: 'lock.store.why.failed',
  unknown: 'lock.store.why.unknown',
  'forget-failed': 'lock.store.why.forgetFailed',
  TERM_STORE_UNSAFE: 'lock.store.why.unsafe',
  TERM_STORE_CORRUPT: 'lock.store.why.corrupt',
  TERM_STORE_FAILED: 'lock.store.why.failed',
});
const fill = (key: Key, vars: Readonly<Record<string, string>>): string => strings[key].replace(/\{\{(\w+)\}\}/g, (_m, n: string) => vars[n] ?? '');

const PRINTABLE = /^[\x20-\x7e]{1,400}$/;

export interface LockNoticeText {
  /** What is wrong. */
  readonly problem: string;
  /** Where: the directory, or null when it is not known (or is not printable text). */
  readonly where: string | null;
  /** What the person can do, by hand. */
  readonly repair: string;
  /** True when the passcode cannot open the Hub whatever is typed (the forget that could not finish). */
  readonly passcodeUseless: boolean;
}

/** The lock view's text for a store problem (lock-host.ts notice()); null when there is none. */
export function lockNoticeText(n: StoreNotice | null): LockNoticeText | null {
  if (!n) return null;
  const where = typeof n.path === 'string' && PRINTABLE.test(n.path) ? n.path : null;
  const why = strings[Object.hasOwn(WHY, n.reason) ? WHY[n.reason]! : WHY.unknown!];
  const place = strings[where === null ? 'lock.store.place.unknown' : 'lock.store.place.known'];
  const forget = n.reason === 'forget-failed';
  return Object.freeze({
    problem: fill(forget ? 'lock.store.forgetProblem' : 'lock.store.problem', { why }),
    where,
    repair: `${fill(forget ? 'lock.store.forgetRepair' : 'lock.store.repair', { place })} ${strings['lock.store.agentKeys']}`,
    passcodeUseless: forget,
  });
}

const REFUSED: Readonly<Record<UnlockRefusal, Key>> = Object.freeze({
  'other-hub': 'lock.refused.otherHub',
  'read-only-choice': 'lock.refused.readOnlyChoice',
  'no-store': 'lock.refused.noStore',
});

/** The one sentence for an unlock try that was refused without being checked. */
export function unlockRefusalText(why: UnlockRefusal): string {
  return strings[Object.hasOwn(REFUSED, why) ? REFUSED[why] : REFUSED['no-store']];
}
