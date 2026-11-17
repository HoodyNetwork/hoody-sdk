// The live changes of the schedules page: one request per press, never resent (C9). A change that may have gone
// through answers 'pending'; the page's Check again only reads (the schedules are loaded again). Core's lock refuses
// a second send of the same entry until the lock is settled; settling is the caller's call and happens in two ways:
// after a fresh read proved the outcome, or when the person explicitly dismisses or allows another try (no proof).
// Nothing here proves an outcome by itself. A settle names the one send it is about (its hold): the pending answer
// carries it, and the page keeps it, so a late proof for an older send never frees a newer send of the same change.
import { defineMutation } from '@core';
import { routes } from './routes';
import type { Act, SchedRow } from './logic';

type Out = { outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; code?: string; hold?: string };
type Ref = SchedRow['ref'];
const s = (v: unknown): string => (typeof v === 'string' ? v : '');

// Pause, edit, run and delete of one entry share a lock: while any may have gone through, none of the others is sent
// (their request bodies differ, so core's default key would let them pass each other). The computer is part of the key.
const cronEdit = defineMutation<{ user: string; id: string; body: Record<string, unknown>; at?: string }>(routes.edit, {
  lock: 'cron.entry',
  lockKey: (v) => ({ user: v.user, id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { user: v.user, id: v.id }, body: v.body }),
});
// The create route takes no idempotency key, so while one is held nothing else may be created on the computer.
const cronCreate = defineMutation<{ user: string; body: Record<string, unknown>; at?: string }>(routes.create, {
  lockKey: (v) => ({ at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { user: v.user }, body: v.body }),
});
const cronDelete = defineMutation<{ user: string; id: string; rev: string; at?: string }>(routes.remove, {
  lock: 'cron.entry',
  lockKey: (v) => ({ user: v.user, id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { user: v.user, id: v.id }, ...(v.rev ? { query: { expected_revision: v.rev } } : {}) }),
});
const cronRun = defineMutation<{ user: string; id: string; rev: string; at?: string }>(routes.run, {
  lock: 'cron.entry',
  lockKey: (v) => ({ user: v.user, id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { user: v.user, id: v.id }, body: v.rev ? { expected_revision: v.rev } : {} }),
});
// Scripts presses the same trigger: one shared lock, keyed by the script path (the computer is in core's scope).
const execRun = defineMutation<{ path: string; at?: string }>(routes.execTrigger, {
  lock: 'exec.script.run',
  lockKey: (v) => ({ path: v.path }),
  input: (v) => ({ index: 1, recovers: true, body: { scriptPath: v.path, force: true } }),
});
const curlToggle = defineMutation<{ id: string; enabled: boolean; at?: string }>(routes.curlToggle, {
  lock: 'curl.job',
  lockKey: (v) => ({ id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { id: v.id }, body: { enabled: v.enabled } }),
});
const curlEdit = defineMutation<{ id: string; cron: string; at?: string }>(routes.curlEdit, {
  lock: 'curl.job',
  lockKey: (v) => ({ id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { id: v.id }, body: { cron: v.cron } }),
});
const curlDelete = defineMutation<{ id: string; at?: string }>(routes.curlRemove, {
  lock: 'curl.job',
  lockKey: (v) => ({ id: v.id, at: v.at }),
  input: (v) => ({ index: 1, recovers: true, params: { id: v.id } }),
});
const loopPause = defineMutation<{ sid: string; loop: string; paused: boolean; at?: string }>(routes.loopPatch, {
  lock: 'loop.item',
  lockKey: (v) => ({ sid: v.sid, loop: v.loop, at: v.at }),
  input: (v) => ({ recovers: true, params: { sid: v.sid, loop: v.loop }, body: { paused: v.paused } }),
});
const loopRun = defineMutation<{ sid: string; loop: string; at?: string }>(routes.loopRun, {
  lock: 'loop.item',
  lockKey: (v) => ({ sid: v.sid, loop: v.loop, at: v.at }),
  input: (v) => ({ recovers: true, params: { sid: v.sid, loop: v.loop } }),
});
const loopDelete = defineMutation<{ sid: string; loop: string; at?: string }>(routes.loopDelete, {
  lock: 'loop.item',
  lockKey: (v) => ({ sid: v.sid, loop: v.loop, at: v.at }),
  input: (v) => ({ recovers: true, params: { sid: v.sid, loop: v.loop } }),
});

const done = (r: { outcome: Out['outcome']; error?: { code?: unknown } }): Out => ({ outcome: r.outcome, ...(typeof r.error?.code === 'string' ? { code: r.error.code } : {}) });
const refuse = (code: string): Out => ({ outcome: 'not_sent', code });

interface Plan { run: () => Promise<Out>; hold: () => Promise<string | undefined>; settle: (hold?: string) => Promise<void> }
// The computer rides in the variables the lock is keyed on (the request ignores it): a held change on one
// computer must not lock the same script path or entry on another.
// Settle names the send it frees (core needs its hold). A proof passes the hold of the send it is about: the pending
// answer's (Out.hold), or, when that is unknown, the one held just before the proving read (hold()). Only the
// person's Dismiss or another try without a known hold frees the send of these variables held now (holdOf).
type Def<V> = {
  run(v: V): Promise<{ outcome: Out['outcome']; error?: { code?: unknown }; hold?: string }>;
  settle(v: V, hold: string): Promise<boolean>;
  holdOf(v: V): Promise<string | undefined>;
};
const plan = <V extends object>(m: Def<V>, v: V, at: string): Plan => {
  const vars = { ...v, at } as V;
  const holdNow = async (): Promise<string | undefined> => { try { return await m.holdOf(vars); } catch { return undefined; } };
  return {
    run: async () => {
      // The lookup starts in the same synchronous step as the press, so it reads the press's computer and realm: a
      // switch while the run awaits never names another computer's send (a script's lock key is its path only).
      const sending = m.run(vars);
      const before = holdNow();
      const r = await sending;
      const out = done(r);
      // A pending answer names its own send; READ_BACK_FIRST refused this one because an earlier send is held: that one.
      const hold = r.outcome === 'pending' ? r.hold : out.outcome === 'not_sent' && out.code === 'READ_BACK_FIRST' ? await before : undefined;
      return hold !== undefined ? { ...out, hold } : out;
    },
    hold: holdNow,
    settle: async (hold) => { const h = hold ?? (await holdNow()); if (h !== undefined) await m.settle(vars, h); },
  };
};
const refused = (code: string): Plan => ({ run: async () => refuse(code), hold: async () => undefined, settle: async () => undefined });

/** The one mutation and variables an action on a row sends; send and settle share them. */
function planFor(act: Act, row: SchedRow, enabled?: boolean): Plan {
  const r: Ref = row.ref;
  const user = s(r.user);
  const id = s(r.entry);
  const rev = s(r.revision);
  const at = s(r.computer);
  switch (act) {
    case 'pause':
      return typeof enabled === 'boolean' ? plan(cronEdit, { user, id, body: { enabled } }, at) : refused('BAD_ARGS');
    case 'del':
      return plan(cronDelete, { user, id, rev }, at);
    case 'run':
      return plan(cronRun, { user, id, rev }, at);
    case 'exec.run':
      return s(r.path) ? plan(execRun, { path: s(r.path) }, at) : refused('BAD_ROW');
    case 'curl.pause':
      return typeof enabled === 'boolean' ? plan(curlToggle, { id: s(r.job), enabled }, at) : refused('BAD_ARGS');
    case 'curl.del':
      return plan(curlDelete, { id: s(r.job) }, at);
    case 'loop.pause':
      return typeof enabled === 'boolean' ? plan(loopPause, { sid: s(r.sid), loop: s(r.loop), paused: !enabled }, at) : refused('BAD_ARGS');
    case 'loop.run':
      return plan(loopRun, { sid: s(r.sid), loop: s(r.loop) }, at);
    case 'loop.del':
      return plan(loopDelete, { sid: s(r.sid), loop: s(r.loop) }, at);
    default:
      return refused('BAD_ACTION');
  }
}

/** Sends one action on a row. Resolves with the C9 outcome; never throws. */
export function liveAct(act: Act, row: SchedRow, enabled?: boolean): Promise<Out> {
  return planFor(act, row, enabled).run();
}

/** The hold of the action of these variables held now: taken before a proving read when the answer named none. */
export function liveHold(act: Act, row: SchedRow, enabled?: boolean): Promise<string | undefined> {
  return planFor(act, row, enabled).hold();
}

/** Releases core's lock on a pending action: the send `hold` names (after a read proved that send), or, without a
 *  hold, the one held now (the person dismisses it, no proof). A hold that no longer holds frees nothing. */
export function liveSettle(act: Act, row: SchedRow, enabled?: boolean, hold?: string): Promise<void> {
  return planFor(act, row, enabled).settle(hold);
}

export interface LiveSave {
  row: SchedRow | null;
  name: string;
  command: string;
  schedule: string;
  runAs: 'user' | 'root';
  /** The computer the change is for (part of its lock). */
  computer?: string;
}

function savePlan(a: LiveSave): Plan {
  const at = s(a.computer ?? a.row?.ref.computer);
  if (!a.row) return plan(cronCreate, { user: a.runAs, body: { name: a.name, command: a.command, schedule: a.schedule } }, at);
  const r = a.row.ref;
  if (a.row.src === 'curl') return plan(curlEdit, { id: s(r.job), cron: a.schedule }, at);
  const body: Record<string, unknown> = { name: a.name, schedule: a.schedule };
  if (a.command.trim()) body.command = a.command;
  if (s(r.revision)) body.expected_revision = s(r.revision);
  return plan(cronEdit, { user: s(r.user), id: s(r.entry), body }, at);
}

/** Creates a command, or edits a command's name, schedule and (when typed) command, or a web request's time. */
export function liveSave(a: LiveSave): Promise<Out> {
  return savePlan(a).run();
}

/** The hold of the save of these variables held now: taken before a proving read when the answer named none. */
export function liveHoldSave(a: LiveSave): Promise<string | undefined> {
  return savePlan(a).hold();
}

/** Releases core's lock on a pending save: the send `hold` names (after a read proved that send), or, without a hold,
 *  the one held now (the person allows another try, no proof). A hold that no longer holds frees nothing. */
export function liveSettleSave(a: LiveSave, hold?: string): Promise<void> {
  return savePlan(a).settle(hold);
}
