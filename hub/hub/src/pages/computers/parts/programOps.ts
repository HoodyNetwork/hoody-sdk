// Program actions (start, stop, restart, boot), owned by the page, not by the Programs tab: a change that may have
// gone through (unknown) must outlive the tab and a computer switch, or the new tab would send it again. Every entry
// is bound to the computer and program it was sent to; the one-at-a-time lock (shared with the Programs page) and the
// read-back sit in core, behind the hook this page-level owner keeps alive (data.ts useProgramAction).
// What frees a held entry: a restart only by its own receipt (a program that kept running proves nothing, so a
// fresh list never frees it), read by its own key or the key core keeps for the shared lock (heldChanges), and
// a restart held without a key stays held; any other action by a fresh read-back of its own change.
// What is held comes from core, not from this hook's memory: on mount (a remount, a return to the tab) every held
// program change shows, whoever sent it, and a row clears when its sender frees it. While any page holds one action
// of a program, every other action of that program waits too (one action per program at a time).
import { heldChanges, programLock, useChangesVersion, type HeldChange, type ProgramAct } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProgramAction, subjectOf, type Subject } from '../data';
import type { Program } from '../types';

export type { ProgramAct };
export type ProgramBusy = 'busy' | 'pending' | 'failed';
// range: a port-range program; core's programOp (data.ts) makes a whole stop or restart cover every part.
type Vars = Subject & { program: string; act: ProgramAct; range?: boolean; boot?: boolean };
type Receipt = 'completed' | 'failed' | 'unknown';
type Send = {
  mutateAsync: (v: Vars) => Promise<{ outcome: string; code?: string; idem?: string; hold?: string }>;
  /** Re-reads this action's own change; true when it was freed. */
  readBack?: (a: ProgramAct) => Promise<boolean>;
  /** A restart's receipt proved it applied: lock and key go, so the next Restart is a new request (a replay of
   *  the spent key would show done and restart nothing). discard: it proved it did not apply (lock and key go). */
  complete?: (v: Vars, a: ProgramAct, hold: string) => Promise<boolean>;
  discard?: (v: Vars, a: ProgramAct, hold: string) => Promise<boolean>;
  /** The hold of the send of these variables held now (core's token), or undefined. */
  holdOf?: (v: Vars, a: ProgramAct) => Promise<string | undefined>;
  /** Reads a restart's receipt (reads only). */
  receipt?: (v: Vars, key: string) => Promise<Receipt>;
  /** The key of a restart held under the shared lock for this program (whichever page sent it): null when one
   *  is held without a key, undefined when none is held. */
  heldKey?: (v: Vars) => string | null | undefined;
  /** The person's warned Dismiss ("it may have gone through, forget it"): core frees the one send `hold` names, key kept. */
  dismiss?: (v: Vars, a: ProgramAct, hold: string) => Promise<boolean>;
  /** Who sent a held change (core): 'other' is another page's, read-only here. */
  heldBy?: (a: ProgramAct, h: HeldChange) => 'self' | 'other' | undefined;
  /** Truthy when another page holds these variables' change (asked before a dismiss: core would free nothing). */
  heldByOther?: (v: Vars, a: ProgramAct) => Promise<unknown>;
};
type Computerish = Parameters<typeof subjectOf>[0];
const ACTS: readonly ProgramAct[] = ['start', 'stop', 'restart', 'boot'];
/** A program change core holds, by the program it is for (the oldest when there are several). */
interface CoreHold { act: ProgramAct; h: HeldChange; other: boolean }

/** The variables of a held change, rebuilt from its lock identity on the computer it was sent to: the same lock
 *  (programOp's identity), so a read-back, receipt or dismiss after a remount acts on that change. */
function varsOf(c: Computerish, programId: string, hold: CoreHold): Vars {
  const id = (hold.h.identity ?? {}) as { port?: unknown; all?: unknown; boot?: unknown };
  return {
    ...subjectOf(c),
    program: programId,
    act: hold.act,
    ...(typeof id.port === 'number' ? { port: id.port } : {}),
    ...(id.all === true ? { range: true } : {}),
    ...(hold.act === 'boot' ? { boot: id.boot === true } : {}),
  } as Vars;
}

/** The key of one program on one computer. */
export const programOpKey = (computerId: string, programId: string): string => `${computerId}:${programId}`;

export function useProgramOps(useSend: () => Send = useProgramAction as () => Send) {
  const act = useSend();
  const version = useChangesVersion();
  // Every program change core holds (any sender, any realm: the key names the computer).
  const core = useMemo(() => {
    const out: Record<string, CoreHold> = {};
    for (const a of ACTS)
      for (const h of heldChanges(programLock[a])) {
        const cid = h.target?.container.id;
        const pid = (h.identity as { id?: unknown } | null)?.id;
        if (typeof cid !== 'string' || typeof pid !== 'string') continue;
        const k = programOpKey(cid, pid);
        if (!out[k] || h.at < out[k].h.at) out[k] = { act: a, h, other: act.heldBy?.(a, h) === 'other' };
      }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, act.heldBy]);
  const [busy, setBusy] = useState<Record<string, ProgramBusy>>({});
  const [held] = useState(() => new Set<string>());
  // Held restarts this tab has no receipt key for (another page sent them): their Check lives on that page.
  const [elsewhere, setElsewhere] = useState<Record<string, true>>({});
  // Held changes another page sent (core refused this tab's press with HELD_BY_OTHER): core frees a change on Dismiss
  // only for its own sender, so this tab offers no Dismiss for them; the page that sent it can. READ_BACK_FIRST is
  // this page's own earlier send (after a remount too): it keeps Check again and the warned Dismiss.
  const [foreign, setForeign] = useState<Record<string, true>>({});
  const flag = (set: typeof setElsewhere) => (k: string, on: boolean) => {
    set((e) => {
      if (!!e[k] === on) return e;
      const n = { ...e };
      if (on) n[k] = true;
      else delete n[k];
      return n;
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const markElsewhere = useCallback(flag(setElsewhere), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const markForeign = useCallback(flag(setForeign), []);
  // The held press of each entry: what was sent and, for a restart this tab sent, its receipt key.
  // `hold` is core's token for that one send, captured when the entry was made (press result, or the held change
  // adopted), never read after an await: every proof and the Dismiss free that send or nothing.
  const sent = useRef(new Map<string, { v: Vars; key?: string; hold?: string }>());
  const mark = useCallback((k: string, to: ProgramBusy | null) => {
    setBusy((b) => {
      const n = { ...b };
      if (to) n[k] = to;
      else delete n[k];
      return n;
    });
  }, []);
  // A held entry whose change core held and no longer holds was freed by its sender (here, on the Programs page,
  // or another mount): the row clears. One core never held (a press still in flight) is not judged.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const k of [...seen.current]) if (!sent.current.has(k)) seen.current.delete(k);
    for (const k of [...sent.current.keys()]) {
      if (core[k]) seen.current.add(k);
      if (core[k] || !seen.current.has(k) || busy[k] === 'busy') continue;
      seen.current.delete(k);
      sent.current.delete(k);
      held.delete(k);
      markElsewhere(k, false);
      markForeign(k, false);
      if (busy[k] === 'pending') mark(k, null);
    }
  }, [core, busy, held, mark, markElsewhere, markForeign]);
  // A change core holds that this hook has not seen (sent before a remount, or by another page): its entry, so
  // Check again, Dismiss and the receipt work on it (another page's stays read-only).
  const adopt = useCallback((c: Computerish, programId: string): { v: Vars; key?: string; hold?: string } | undefined => {
    const k = programOpKey(c.id, programId);
    const own = sent.current.get(k);
    if (own) return own;
    const hold = core[k];
    if (!hold) return undefined;
    const s = { v: varsOf(c, programId, hold), ...(hold.h.key ? { key: hold.h.key } : {}), ...(hold.h.hold ? { hold: hold.h.hold } : {}) };
    sent.current.set(k, s);
    held.add(k);
    return s;
  }, [core, held]);
  const press = useCallback(
    async (c: Parameters<typeof subjectOf>[0], p: Pick<Program, 'id' | 'range'>, a: ProgramAct, after?: () => void) => {
      const k = programOpKey(c.id, p.id);
      // Busy and unknown (read it back first) entries never send again from here, and no action of a program is
      // sent while core holds any action of it (whichever page sent it).
      if (held.has(k) || core[k]) return;
      held.add(k);
      mark(k, 'busy');
      // A range program stops and restarts as a whole (every part), the same change as on the Programs page.
      const v: Vars = { ...subjectOf(c), program: p.id, act: a, ...(p.range ? { range: true } : {}), ...(a === 'boot' ? { boot: true } : {}) };
      const r0 = await act.mutateAsync(v).catch(() => ({ outcome: 'pending', code: undefined as string | undefined, idem: undefined as string | undefined, hold: undefined as string | undefined }));
      // An earlier send of this action not read back yet is that send's unknown outcome, never "not sent": this
      // page's (READ_BACK_FIRST) or another page's (HELD_BY_OTHER).
      const r = r0.outcome === 'not_sent' && (r0.code === 'READ_BACK_FIRST' || r0.code === 'HELD_BY_OTHER') ? { ...r0, outcome: 'pending' } : r0;
      if (r.outcome === 'pending') {
        // Unknown stays held until its own proof (see the header).
        // A restart another page holds: its key is the one core keeps for the shared lock.
        const key = r.idem ?? (a === 'restart' ? act.heldKey?.(v) ?? undefined : undefined);
        // The send this press left (its own result), else the one held now for these variables (an earlier send of
        // this page that core answered READ_BACK_FIRST, or another page's, whose proofs and Dismiss free nothing).
        const hold = r.hold ?? (await act.holdOf?.(v, a).catch(() => undefined));
        sent.current.set(k, { v, ...(key ? { key } : {}), ...(hold ? { hold } : {}) });
        markElsewhere(k, a === 'restart' && !key);
        markForeign(k, r0.code === 'HELD_BY_OTHER');
        mark(k, 'pending');
        return;
      }
      held.delete(k);
      sent.current.delete(k);
      markElsewhere(k, false);
      markForeign(k, false);
      mark(k, r.outcome === 'done' || r.outcome === 'stale' ? null : 'failed');
      if (r.outcome === 'done') after?.();
    },
    [act, held, core, mark, markElsewhere, markForeign],
  );
  /** Check again (reads only): frees a pending entry once what proves its action answered (see the header). With
   *  the computer, a change held from before a remount is checked too; another page's is not checked here. */
  const settled = useCallback(async (computerId: string, programId: string, c?: Computerish) => {
    const k = programOpKey(computerId, programId);
    if (core[k]?.other) return;
    const s = c && c.id === computerId ? adopt(c, programId) : sent.current.get(k);
    if (!s || !held.has(k)) return;
    const free = (to: ProgramBusy | null) => {
      if (sent.current.get(k) !== s) return;
      sent.current.delete(k);
      held.delete(k);
      markElsewhere(k, false);
      markForeign(k, false);
      mark(k, to);
    };
    if (s.v.act === 'restart') {
      const held = act.heldKey?.(s.v);
      // Nothing is held any more (the page that sent it proved it), or what is held is another restart (its key
      // is not this entry's): this entry's own restart was proved elsewhere, and its receipt says nothing about
      // the newer one. The list shows the real state.
      if (act.heldKey && (held === undefined || (s.key && held !== s.key))) {
        free(null);
        return;
      }
      const key = s.key ?? held ?? undefined;
      if (!key || !act.receipt) return;
      // The hold was captured with the entry, before this await: a receipt that answers after a later send of the
      // restart (another hold, another key) frees nothing of it.
      const hold = s.hold;
      const got = await act.receipt(s.v, key).catch((): Receipt => 'unknown');
      if (got === 'completed') {
        await act.complete?.(s.v, 'restart', hold ?? '').catch(() => false);
        free(null);
      }
      else if (got === 'failed') free((await act.discard?.(s.v, 'restart', hold ?? '').catch(() => false)) ? 'failed' : null);
      return;
    }
    if (act.readBack && !(await act.readBack(s.v.act).catch(() => false))) return;
    free(null);
  }, [held, act, core, adopt, mark, markElsewhere, markForeign]);
  /** The warned Dismiss of a held entry this tab sent: core lets go of the change (its key kept, so a replay
   *  still shows what the first send did) and the row is free; a later press is a new request. */
  const dismiss = useCallback(async (computerId: string, programId: string, c?: Computerish, shownHold?: string) => {
    const k = programOpKey(computerId, programId);
    if (core[k]?.other || foreign[k]) return;
    const s = c && c.id === computerId ? adopt(c, programId) : sent.current.get(k);
    if (!s || !held.has(k) || !act.dismiss) return;
    // The hold this entry was made with, taken at the press, before any await: a stale entry's hold frees nothing.
    // `shownHold` is the hold the Dismiss question was opened on (holdShown): confirming frees that send only.
    const hold = shownHold ?? s.hold;
    // Another page's change of these variables is not this page's to forget (core would free nothing).
    if (act.heldByOther && (await act.heldByOther(s.v, s.v.act).catch(() => true))) return;
    await act.dismiss(s.v, s.v.act, hold ?? '').catch(() => false);
    if (sent.current.get(k) !== s) return;
    sent.current.delete(k);
    held.delete(k);
    markElsewhere(k, false);
    mark(k, null);
  }, [held, act, core, adopt, mark, markElsewhere, foreign]);
  /** The hold of the entry the row shows now (core's, else this hook's): taken when a Dismiss question opens. */
  const holdShown = useCallback((computerId: string, programId: string): string | undefined => {
    const k = programOpKey(computerId, programId);
    return core[k]?.h.hold ?? sent.current.get(k)?.hold;
  }, [core]);
  // What the tab shows: this hook's entries, plus every change core holds (pending), another page's read-only.
  const shown = useMemo(() => {
    const b: Record<string, ProgramBusy> = { ...busy };
    const e: Record<string, true> = { ...elsewhere };
    const f: Record<string, true> = { ...foreign };
    for (const [k, hold] of Object.entries(core)) {
      if (b[k] === 'busy') continue;
      b[k] = 'pending';
      if (hold.other) f[k] = true;
      // A restart held without a key and not sent from here: its receipt can only be read where it was sent.
      if (hold.act === 'restart' && !hold.h.key && !sent.current.get(k)?.key) e[k] = true;
    }
    return { busy: b, elsewhere: e, foreign: f };
  }, [busy, elsewhere, foreign, core]);
  return { ...shown, press, settled, dismiss, holdShown, canDismiss: !!act.dismiss };
}
