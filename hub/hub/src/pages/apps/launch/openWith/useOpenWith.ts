// Starting a Files launch: the one place a plan becomes a listed launch.
//
// Contract, in plain words:
//   - Checked first, in this order, and nothing is claimed or sent when one refuses: the exec permission, a machine
//     for the computer, the launcher row (bash), the launcher's own path not containing the staged value.
//   - The identity is hashed under a captured context; after the await the launch goes on only while that
//     context is alive and the place still shows that computer.
//   - Before the claim: a launch of the same identity still opening or unknown holds this one (r.held); one proven
//     running is offered (Show it / Open another) and only "Open another" starts a second one; after a screen
//     program ended without a window here, the next press asks once. The stored list is read again first, so
//     another tab's launch counts even before its storage event arrives; and again after the claim: one stored
//     meanwhile holds this launch too, and the claim is dropped unsent (said when it could not be cleared).
//   - The claim (ledger.ts) decides: a refusal sends nothing (refused as held by a start whose cleanup this tab saw
//     fail, it says so: kept). Only then is the row listed ("Started from Files") and the Open sent with the
//     ledger's barrier; once it answers, the ledger settles the hold.
//   - The row keeps the plan (in memory) for Restart and Open again: a new claim each time, through the machine of
//     the place pressing it then, and only on the row's own computer.
import { alive, can, capture, heldAttempts, type Target } from '@core';
import { useStrings } from '@kit';
import { useEffect } from 'react';
import { heldOpen, type OpenApp } from '../../logic';
import { liveOpen, owCandidate, recoverHere, relistStored, useLiveApps, type AttemptFree, type LiveCtx, type RecoverFor, type Recovery } from '../../parts/live';
import { merge, ops } from '../../parts/ops';
import appsStrings from '../../strings.en.json';
import { collides } from './argv';
import { namesOf, owText, wordsFor, type Words } from './facts';
import { claim, lockOf, subjectOf, type Ledger } from './ledger';
import { programWord, scriptOf, toLaunch, type Launcher, type ScriptPlan } from './plan';

const EXEC = 'computers.actions.exec';

/** Where a launch goes and how its row is named. */
export interface OwEnv {
  live: LiveCtx;
  /** The row's source word ("Started from Files"). */
  source: string;
  /** The place still shows the computer the press was made on. */
  shows?: () => boolean;
}
export interface StartOpts {
  /** The bash launcher row of this computer (discovery finds it; none: the computer has no bash for Files). */
  launcher?: Launcher | null;
  /** The program's name ("Nano"), as the hold and the words show it. */
  program: string;
  /** The row's name ("Nano · a b.txt"), already made safe (safeLabel). */
  label: string;
  /** The person chose Open another over a running launch of the same identity. */
  another?: boolean;
  /** The person confirmed starting again after a hand-off. */
  again?: boolean;
}
export type OwOutcome =
  | { kind: 'listed'; key: string; done: Promise<void> }
  /** `kept` (held, running): found only after this press claimed, and that claim could not be cleared; or (held) the
   *  hold that refused the claim is a start an earlier cleanup could not clear (C9). */
  | { kind: 'held'; key?: string; words: Words; kept?: true }
  | { kind: 'running'; key: string; words: Words; kept?: true }
  | { kind: 'ask'; key: string; words: Words }
  | { kind: 'refused'; words: Words }
  /** The account, realm or computer changed while it was being prepared: nothing was sent. `kept`: what it had
   *  claimed could not be cleared, so that start stays reserved (C9: said, never hidden). */
  | { kind: 'dropped'; kept?: boolean };
type Listed = Extract<OwOutcome, { kind: 'listed' }>;
export type Prepared = { ok: true; go: () => Listed; unsent: Ledger['unsent'] } | { ok: false; out: Exclude<OwOutcome, Listed> };

let counter = 0;

// The rows that showed a window this session (a screen program that ended after one "closed"; without one, its
// end may be a hand-off). Memory only, dropped with the list on an account or realm switch.
const readyKeys = new Set<string>();
let readyEpoch = -1;
let watching = false;
function watchReady(): void {
  if (watching) return;
  watching = true;
  const note = () => {
    const s = ops.get();
    if (s.epoch !== readyEpoch) {
      readyKeys.clear();
      readyEpoch = s.epoch;
    }
    for (const [k, p] of s.patches) if (p.state === 'ready') readyKeys.add(k);
  };
  note();
  ops.subscribe(note);
}
/** A row showed a window this session. */
export const readySeen = (key: string): boolean => (watchReady(), readyKeys.has(key));
/** A marked row's words: the drawer, the tile, the hold card and the inspector all say these. */
export const rowWords = (r: OpenApp): Words => wordsFor(r, { ready: readySeen(r.key), exec: can(EXEC) });
/** A marked row's sentence: its words as text. */
export const rowSentence = (r: OpenApp): string => owText(rowWords(r));

/** Holds whose unsent cleanup answered anything but freed in this tab: the evidence that a start is kept (a hold's
 *  own fields cannot tell it from a claim of a suspended tab). Memory only: after a reload such a hold reads as held. */
const keptHere = new Set<string>();

/** Checks and claims one launch (identity, hold, read-back); `go` lists and sends it, `unsent` drops the claim unsent. */
export async function prepareLaunch(env: OwEnv, plan: ScriptPlan, o: StartOpts): Promise<Prepared> {
  watchReady();
  const words = (key: string): Words => ({ key, vars: { p: o.program, file: namesOf(o.label).file } });
  const no = (key: string): Prepared => ({ ok: false, out: { kind: 'refused', words: words(key) } });
  if (!can(EXEC)) return no('w.execOff');
  const target = env.live.target;
  if (!env.live.m || !target) return no('w.notStarted');
  const launcher = o.launcher;
  if (!launcher) return no('w.noBash');
  const s = scriptOf(plan);
  if (collides(s.value, [launcher.path, ...s.args])) return no('r.collision');

  const ctx = capture(target);
  const still = () => alive(ctx) && (env.shows?.() ?? true);
  const cid = target.container.id;
  const project = target.project.id;
  let subject: string;
  try {
    subject = await subjectOf({ account: ctx.account ?? '', project, computer: cid, plan });
  } catch {
    return no('w.notStarted');
  }
  if (!still()) return { ok: false, out: { kind: 'dropped' } };

  const candidate = owCandidate(programWord(plan), subject);
  // The rows of this identity, another tab's stored launch included: the stored list is read first (its storage event
  // may come late).
  const sameNow = (): OpenApp[] => {
    relistStored(env.live);
    return merge(undefined, ops.get()).filter((r) => r.computer === cid && r.candidate === candidate);
  };
  // A hold of this identity whose unsent cleanup this tab saw fail is still there: every refusal says the start is kept.
  const keptNow = (): { kept?: true } => (heldAttempts().some((h) => h.lock === lockOf(cid, subject) && keptHere.has(h.id)) ? { kept: true } : {});
  const blockedBy = (rows: OpenApp[]): Extract<OwOutcome, { kind: 'held' | 'running' }> | null => {
    const held = rows.find(heldOpen);
    if (held) return { kind: 'held', key: held.key, words: words('r.held'), ...keptNow() };
    const running = rows.find((r) => r.state === 'running' || r.state === 'ready');
    return running && !o.another ? { kind: 'running', key: running.key, words: words('r.running'), ...keptNow() } : null;
  };
  const same = sameNow();
  const first = blockedBy(same);
  if (first) return { ok: false, out: first };
  const last = same.reduce<OpenApp | undefined>((a, r) => (!a || r.startedAt > a.startedAt ? r : a), undefined);
  if (last && !o.again && last.opensIn === 'screen' && wordsFor(last, { ready: readySeen(last.key) }).key === 'w.handoff')
    return { ok: false, out: { kind: 'ask', key: last.key, words: words('r.handoffAgain') } };

  const c = await claim({ cid, subject, realm: ctx.realm, plan, program: o.program, project });
  if (!c.ok) {
    if (c.code === 'HELD') {
      const key = same[0]?.key;
      // Held by a start whose unsent cleanup this tab saw fail: the row says it is kept (C9).
      return { ok: false, out: { kind: 'held', ...(key ? { key } : {}), words: words('r.held'), ...keptNow() } };
    }
    return no(c.code === 'FULL' ? 'r.full' : c.code === 'NO_ACCOUNT' ? 'r.noAccount' : c.code === 'TOO_LARGE' ? 'r.tooLarge' : 'w.notDurable');
  }
  const ledger = c.ledger;
  const id = ledger.hold.id;
  // The unsent cleanup, its answer noted: anything but freed keeps the start (keptHere).
  const unsent = async (): Promise<AttemptFree> => {
    const out = await ledger.unsent().catch(() => 'unresolved' as const);
    if (out !== 'freed') keptHere.add(id);
    return out;
  };
  if (!still()) {
    // The unsent cleanup's answer is checked: anything but freed leaves the start reserved, and says so.
    const out = await unsent();
    return { ok: false, out: { kind: 'dropped', ...(out !== 'freed' ? { kept: true } : {}) } };
  }
  // Another tab's launch of this identity stored while this one claimed holds it too: the claim is dropped unsent.
  const late = blockedBy(sameNow());
  if (late) {
    const out = await unsent();
    return { ok: false, out: { ...late, ...(out !== 'freed' ? { kept: true as const } : {}) } };
  }

  const go = (): Listed => {
    const built = toLaunch(plan, { launcher, label: o.label, subject, beforeExecute: ledger.barrier, recovery: recoveryOf(env.source, plan, o, { project, computer: cid }) });
    const key = `local-ow-${Date.now()}-${counter++}`;
    const opensIn = built?.o.opensIn ?? 'terminal';
    ops.addLaunch({
      key, name: o.label, candidate, app: o.label, opensIn, state: 'starting', terminal: null, handle: '', source: env.source, command: '', settings: [], urls: {},
      startedAt: Date.now(), computer: cid, p: plan.p,
    });
    if (!built) {
      // Checked before the claim, so not reached: refused unsent all the same.
      ops.patch(key, { state: 'not_started', code: 'invalid_options' });
      return { kind: 'listed', key, done: unsent().then(() => undefined) };
    }
    const done = liveOpen(env.live, key, built.item, built.o).then(
      // Nothing sent (or refused unsent) and its free not answered freed: the start stays reserved (keptHere).
      (r) => {
        const unsentNow = !r || !!r.notSent;
        void ledger.settle(r).then((out) => void (unsentNow && out !== 'freed' && keptHere.add(id)), () => void (unsentNow && keptHere.add(id)));
      },
      // An Open that threw may have sent: the hold stays (unknown), only its sending stamp ends.
      () => void ledger.keep(),
    );
    return { kind: 'listed', key, done };
  };
  return { ok: true, go, unsent };
}

/** Starts a plan: checked, claimed, listed and sent, or refused with the words why. */
export async function startPlan(env: OwEnv, plan: ScriptPlan, o: StartOpts): Promise<OwOutcome> {
  const p = await prepareLaunch(env, plan, o);
  return p.ok ? p.go() : p.out;
}

/** A row's plan for Restart and Open again: a new claim, made through the place pressing it now and only on the
 *  row's own computer (it is the person's own press on that row, so a running copy or a past hand-off does not ask
 *  again). */
function recoveryOf(source: string, plan: ScriptPlan, o: StartOpts, on: RecoverFor): Recovery {
  return {
    async prepare(at) {
      if (!recoverHere(at, on)) return { ok: false };
      // The place's liveness rides along: a computer switch while the identity is hashed claims nothing.
      const p = await prepareLaunch({ live: at.live, source, shows: at.shows }, plan, { ...o, another: true, again: true });
      if (p.ok) return { ok: true, go: () => void p.go(), unsent: p.unsent };
      return 'kept' in p.out && p.out.kept ? { ok: false, kept: true } : { ok: false };
    },
  };
}

/** Files launches on one computer (the chooser and entry points mount it). */
export function useOpenWith(o: { target?: Target | null; shows?: () => boolean }) {
  const t = useStrings(appsStrings);
  // Always the live machine: the drawer has no fixture launch of its own. The production build is unchanged (the
  // Apps page's LIVE is always true there); in dev fixtures the Open with fixture rules answer its kit calls.
  const live = useLiveApps(true, t('src.catalogue'), t('src.other'), o.target, t('src.files'));
  useEffect(() => watchReady(), []);
  const env: OwEnv = { live, source: t('src.files'), ...(o.shows ? { shows: o.shows } : {}) };
  return {
    live,
    start: (plan: ScriptPlan, so: StartOpts) => startPlan(env, plan, so),
    /** A marked row's words: the drawer, the tile and the row say the same sentence. */
    wordsOf: (r: OpenApp) => wordsFor(r, { ready: readySeen(r.key), exec: can(EXEC) }),
  };
}
