// The double-open guard of Files launches: one core hold per (computer, program, path, opens),
// claimed before anything is sent, named by the exact execute before it leaves, and freed only on evidence that names
// that launch.
//
// Contract, in plain words:
//   - Identity: a hash of the account, computer, program key and absolute path (never the launcher's candidate
//     id, which the run kit recomputes). The lock is `ow:<computer id>:<subject>`, the sender `apps:openwith`. The hold
//     stores no path, file name or command: its purpose, the program's name and word, where it opens, and once known the
//     expected launch tag and handle.
//   - Claim: holdAttempt writes, reads back and confirms under the cross-tab lock; anything but ok sends nothing.
//   - Barrier (core): before each new command id the core awaits barrier(handle). It appends to the hold's single
//     write chain an update naming that handle and tag at the version this chain last wrote, and answers true only when
//     that write returned true (then the version moves on). False, a throw, or no answer in 10 s: no execute for that
//     id. A write from anywhere else (another tab's Remove, a sign-out purge) makes the next update false.
//   - Settle: once open() answered, sent() ends the sending stamp, then: nothing sent → the unsent
//     cleanup (a versioned free 'done', its answer returned); evidence naming this launch → a versioned free 'proved';
//     anything else (started, unknown, foreign_record) keeps the hold. Every free goes through live.ts freeHold.
//   - Only this chain writes the hold: no progress listener does.
import { heldAttempts, holdAttempt, sha256Hex, type AttemptHold, type HeldAttempt, type HoldCode, type RunHandle, type RunResult } from '@core';
import { freeHold, type AttemptFree } from '../../parts/live';
import { OW_BY, owLockPrefix, owRunOf } from '../../parts/recent';
import { proves } from './facts';
import { programWord, type ScriptPlan } from './plan';

/** How long a barrier write may take before the execute is refused (its late write then fails safe). */
export const BARRIER_MS = 10000;

/** The ledger's program key: `tpl:<id>`, `run`, `cmd:<sha256(text)>` or `here`. */
export async function programKeyOf(plan: ScriptPlan): Promise<string> {
  if (plan.p === 'tpl') return `tpl:${plan.tpl}`;
  if (plan.p === 'cmd') return `cmd:${await sha256Hex(plan.text)}`;
  return plan.p;
}
/** The absolute path a plan acts on. */
export const pathOf = (plan: ScriptPlan): string => (plan.p === 'here' ? plan.dir : plan.path);
const opensOfScript = (plan: ScriptPlan): 'terminal' | 'screen' => (plan.p === 'tpl' || plan.p === 'cmd' ? plan.opens : 'terminal');

/** The identity of a Files launch: 32 hex characters, independent of the launcher's candidate id. */
export async function subjectOf(o: { account: string; project: string; computer: string; plan: ScriptPlan }): Promise<string> {
  const key = await programKeyOf(o.plan);
  const text = ['ow1', o.account, o.project, o.computer, key, pathOf(o.plan), opensOfScript(o.plan)].join('\u0000');
  return (await sha256Hex(text)).slice(0, 32);
}
export const lockOf = (cid: string, subject: string): string => `${owLockPrefix(cid)}${subject}`;

/** What the hold stores: never a path, a file name or a command. */
export interface OwMeta {
  v: 2;
  p: ScriptPlan['p'];
  program: string;
  /** The program word of the launch's identity (a template id or the purpose; never a path or a command). */
  word: string;
  opens: 'terminal' | 'screen';
  tag: string | null;
  handle: { terminal_id: number; incarnation: string; command_id: number } | null;
}

export type Claim = { ok: true; ledger: Ledger } | { ok: false; code: HoldCode; held?: HeldAttempt };

/** Claims the hold of one launch; a refusal (or a throw) holds and sends nothing. */
export async function claim(o: { cid: string; subject: string; realm: string | null; plan: ScriptPlan; program: string; project: string }): Promise<Claim> {
  const meta: OwMeta = { v: 2, p: o.plan.p, program: o.program, word: programWord(o.plan), opens: opensOfScript(o.plan), tag: null, handle: null };
  try {
    const r = await holdAttempt(lockOf(o.cid, o.subject), { by: OW_BY, meta, realm: o.realm });
    return r.ok ? { ok: true, ledger: new Ledger(r.hold, meta, o.project, o.cid) } : { ok: false, code: r.code, ...(r.held ? { held: r.held } : {}) };
  } catch {
    return { ok: false, code: 'NOT_DURABLE' };
  }
}

/** One claimed hold and its single write chain. */
export class Ledger {
  /** The metadata version this chain last wrote (0 at admission). */
  ver = 0;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly hold: AttemptHold,
    private meta: OwMeta,
    private readonly project: string,
    private readonly cid: string,
  ) {}

  /** Runs `f` after every earlier write of this hold. */
  private next<T>(f: () => Promise<T>): Promise<T> {
    const step = this.chain.then(f, f);
    this.chain = step.catch(() => undefined);
    return step;
  }

  /** The core's barrier: true only once the hold names this exact execute. */
  barrier = (h: RunHandle): Promise<boolean> =>
    this.next(async () => {
      const meta: OwMeta = { ...this.meta, tag: h.launch_tag ?? null, handle: { terminal_id: h.terminal_id, incarnation: h.incarnation, command_id: h.command_id } };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>((res) => (timer = setTimeout(() => res(false), BARRIER_MS)));
      const stored = await Promise.race([this.hold.update(meta, this.ver, { sending: true }).catch(() => false), late]);
      clearTimeout(timer);
      if (stored !== true) return false;
      this.ver += 1;
      this.meta = meta;
      return true;
    });

  /** After open() answered (null: nothing was sent for a reason of this page). */
  settle(r: RunResult | null): Promise<AttemptFree | 'kept'> {
    return this.next(async () => {
      this.hold.sent();
      if (!r || r.notSent) return this.free('done');
      if (this.meta.tag && proves(r, this.meta.tag)) return this.free('proved');
      return 'kept';
    });
  }

  /** An Open whose answer is not known (it threw): the sending stamp ends, the hold stays. */
  keep(): Promise<void> {
    return this.next(async () => this.hold.sent());
  }

  /** The unsent cleanup: every exit before an execute could leave. Its answer is the caller's to check. */
  unsent(): Promise<AttemptFree> {
    return this.next(async () => {
      this.hold.sent();
      return this.free('done');
    });
  }

  private async free(kind: 'done' | 'proved'): Promise<AttemptFree> {
    const h = heldAttempts().find((x) => x.id === this.hold.id);
    if (h) return freeHold(h, owRunOf(h, this.project, this.cid), kind, this.ver);
    // Not listed (nothing can show it): the hold's own free, which answers 'freed' for a record already gone.
    try {
      return await this.hold.free(kind, { metaVersion: this.ver });
    } catch {
      return 'unresolved';
    }
  }
}

/** Removes a hold no row shows (one with no handle: the tab died between the claim and its first barrier), after the
 *  warning that it may open twice. */
export async function removeUnlisted(h: HeldAttempt): Promise<AttemptFree> {
  return h.by === OW_BY ? freeHold(h, null, 'dismissed', h.metaVersion) : 'refused';
}
