// What the Notes page keeps per account and realm (core's account prefs): the computer last chosen, and the creates whose
// answer is unknown, per computer. One store for every New note of the Hub: the Notes page and the Board's Add a program
// (New page) hold and settle the same entries, so a create held in one is offered Check again in the other.
import { usePrefUpdate, useRealms } from '@core';
import { showToast, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { routes } from './routes';
import strings from './strings.en.json';
import type { SentNote } from './types';

export const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
/** A held create. `phase: 'sending'` + `sentAt` (ms): its send is out right now (the Board's New page writes it with
 *  its claim and clears it when the send answers), so no surface checks or stops tracking it meanwhile. */
export interface HeldNote extends SentNote {
  phase?: 'sending';
  sentAt?: number;
}
/** How long a claim or move waits for the store to confirm it (then it is not won, and nothing is sent). */
export const CONFIRM_FOR = 15_000;
/** How long a 'sending' record holds off Check again and Stop tracking. It is stamped when written, before its
 *  confirmation, so it covers the confirmation wait, the create request's own timeout and a margin. Past it the
 *  record reads unknown once no beat of its sender has come for BEAT_GRACE (a tab that closed mid-send never locks it
 *  for good). */
export const SENDING_FOR = CONFIRM_FOR + (routes.create.timeoutMs ?? 15_000) + 5_000;
/** How often the tab whose send is out stamps its record again (useNotesKept's beat), so a reader on this browser sees
 *  a live send by a fresh stamp whatever the wall clock did meanwhile. */
export const BEAT_EVERY = 2_000;
/** Off the wall-clock window, how long a sending record stays in flight after this page first read its current stamp:
 *  three beats, so a live sender's next beat always comes first. */
export const BEAT_GRACE = 3 * BEAT_EVERY;
const mono = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Per held id, the stamp this page last read and when (on the monotonic clock, which a wall-clock jump does not move)
 *  it first read that stamp. Bounded: the oldest reading goes past 64. */
const seen = new Map<string, { sentAt: number; changed: number }>();
/** The send of this held create is out now, by its record: its stamp is within SENDING_FOR of this clock (either side:
 *  a clock that went back leaves a stamp ahead), or less than BEAT_GRACE has passed on the monotonic clock since this
 *  page first read that stamp. Its sender stamps it again every BEAT_EVERY while the send is out (useNotesKept), so
 *  after a wall-clock jump either way a live send keeps changing stamp and stays in flight, for a reader that first
 *  sees it just after the jump too; a record no sender stamps any more (a closed tab's) frees by the wall clock as
 *  before, or at most BEAT_GRACE after this page first read its stamp. None locks a hold for good. */
export const inFlight = (h: HeldNote | null | undefined, now = Date.now(), at = mono()): boolean => {
  if (h?.phase !== 'sending' || h.sentAt === undefined) return false;
  const age = now - h.sentAt;
  let was = seen.get(h.id);
  if (!was || was.sentAt !== h.sentAt) {
    seen.delete(h.id);
    was = { sentAt: h.sentAt, changed: at };
    seen.set(h.id, was);
    if (seen.size > 64) seen.delete(seen.keys().next().value as string);
  }
  return (age > -SENDING_FOR && age < SENDING_FOR) || at - was.changed < BEAT_GRACE;
};
/** inFlight for React: true until the record changes or its time runs out (then it renders again). It wakes at the
 *  first deadline still ahead (the wall-clock window's end, BEAT_GRACE after the stamp was first read) and at least
 *  every BEAT_EVERY, since a wall-clock jump moves the first without a timer noticing; each wake reads it again and
 *  sets the timer again, so after a jump a hold no sender stamps clears within BEAT_GRACE. */
export function useInFlight(h: HeldNote | null | undefined): boolean {
  const [ticks, tick] = useState(0);
  const on = inFlight(h);
  const at = h?.sentAt;
  const id = h?.id;
  useEffect(() => {
    if (!on || at === undefined || id === undefined) return;
    const changed = seen.get(id)?.changed ?? -Infinity;
    const ahead = [at + SENDING_FOR - Date.now(), changed + BEAT_GRACE - mono()].filter((ms) => ms > 0);
    const timer = setTimeout(() => tick((n) => n + 1), Math.min(...ahead, BEAT_EVERY) + 1);
    return () => clearTimeout(timer);
  }, [on, at, id, ticks]);
  return on;
}
/** What is kept per account and realm: the computer last chosen, and the creates whose answer is unknown (per computer). */
export interface Kept {
  computer: string;
  holds: Record<string, HeldNote>;
}
export const parseKept = (raw: unknown): Kept => {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const holds: Record<string, HeldNote> = {};
  const h = o.holds && typeof o.holds === 'object' && !Array.isArray(o.holds) ? (o.holds as Record<string, unknown>) : {};
  for (const [id, s] of Object.entries(h).slice(0, 16)) {
    const x = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
    if (ID.test(id) && typeof x.id === 'string' && typeof x.parentId === 'string' && typeof x.name === 'string' && x.id.length <= 64 && x.parentId.length <= 64 && x.name.length <= 200) {
      const sending = x.phase === 'sending' && typeof x.sentAt === 'number' && Number.isFinite(x.sentAt);
      holds[id] = { id: x.id, parentId: x.parentId, name: x.name, ...(sending ? { phase: 'sending' as const, sentAt: x.sentAt as number } : {}) };
    }
  }
  return { computer: typeof o.computer === 'string' && ID.test(o.computer) ? o.computer : '', holds };
};

export function useNotesKept() {
  const t = useStrings(strings);
  // Kept per account and realm in core's account prefs (gone at sign-out, not by leaving the page or switching realm).
  // A create whose answer is unknown is held there per computer: New note offers Check again for it, never a second
  // send, until a read settles it.
  const realm = useRealms().selected;
  // Each change is a function of the stored value, so core applies it again on top of another tab's value when that
  // tab stored first. A hold that is not stored (refused now or by the browser later, beaten more often than core
  // applies it again, or dropped because the account changed or its stored value stopped opening) is not kept: say so
  // once. null: a change made through a callback of an earlier realm, not worked out; it may have held one.
  const notKept = (wanted: Kept | null) => { if (!wanted || Object.keys(wanted.holds).length) showToast({ title: t('toast.holdNotKept'), tone: 'warn' }); };
  const { value: store, update, status } = usePrefUpdate('hub_notes_v1', parseKept, { scope: 'account+realm', part: ID.test(realm) ? realm : 'x', onUnsaved: notKept });
  const storeRef = useRef(store);
  storeRef.current = store;
  const patch = (fn: (now: Kept) => Partial<Kept>) => { update((now) => ({ ...now, ...fn(now) })); };
  // ---- the beat: while this page's send of a note is out, its record is stamped again every BEAT_EVERY ----
  // Started with the write that marks it sending, ended when its sender settles it or says it answered, at most
  // SENDING_FOR after its start (no send is out longer), and when this hook unmounts (the page or Board step left: its
  // record then ends by its last stamp alone). Each beat is conditional: only that note, still sending.
  const beats = useRef(new Map<string, { note: string; timer: ReturnType<typeof setInterval> }>());
  const stopBeat = (computer: string, note?: string) => {
    const b = beats.current.get(computer);
    if (!b || (note !== undefined && b.note !== note)) return;
    clearInterval(b.timer);
    beats.current.delete(computer);
  };
  const startBeat = (computer: string, note: string): ReturnType<typeof setInterval> => {
    stopBeat(computer);
    const until = mono() + SENDING_FOR;
    const timer = setInterval(() => {
      if (mono() >= until) { stopBeat(computer, note); return; }
      patch((now) => {
        const h = now.holds[computer];
        if (h?.id !== note || h.phase !== 'sending') return {};
        const at = Date.now();
        return { holds: { ...now.holds, [computer]: { ...h, sentAt: at === h.sentAt ? at + 1 : at } } };
      });
    }, BEAT_EVERY);
    beats.current.set(computer, { note, timer });
    return timer;
  };
  useEffect(() => () => { for (const c of [...beats.current.keys()]) stopBeat(c); }, []);
  const keep = (id: string) => patch(() => ({ computer: id }));
  // Every way a hold ends is one conditional change, decided inside the update function: core applies it again over
  // another tab's newer value, so the condition is read again on every rebase, never from an earlier read.
  const drop = (computer: string, note: string, evenSending: boolean) =>
    patch((now) => {
      const h = now.holds[computer];
      if (h?.id !== note || (!evenSending && inFlight(h))) return {};
      const { [computer]: _gone, ...rest } = now.holds;
      return { holds: rest };
    });
  /** The person (Stop tracking) or a Check again ends `note`'s hold: only while it is still that note and its send is
   *  not out (a 'sending' record is never released this way). Otherwise nothing changes. */
  const release = (computer: string, note: string) => drop(computer, note, false);
  /** The sender settles its own create (its answer came, or its claim or move was not kept): `note`'s hold goes, its
   *  own 'sending' record included, never a hold of another note. */
  const settle = (computer: string, note: string) => { stopBeat(computer, note); drop(computer, note, true); };
  // The dialog's own pending toast (kit usePendingToast) is the one notice; the page holds each create before it is sent.
  const hold = (computer: string, sent: SentNote) => patch((now) => ({ holds: { ...now.holds, [computer]: sent } }));

  // ---- the Board's New page: a claim, never an overwrite ----
  const statusRef = useRef(status);
  statusRef.current = status;
  const waiters = useRef(new Set<() => void>());
  useEffect(() => { for (const w of [...waiters.current]) w(); }, [store, status]);
  /** Writes `fn` over the value stored now (core applies it again over another tab's value) and resolves true only
   *  once the store says it is stored with `id` held for the computer. `fn` returns null to refuse (nothing written):
   *  losing is decided at once; winning waits for the store (15 s at most, then false). */
  const confirm = (computer: string, id: string, fn: (now: Kept) => Kept | null, onWritten?: () => void): Promise<boolean> => {
    if (statusRef.current !== 'ok') return Promise.resolve(false);
    // Whether the last application of the change (core applies it again over another tab's value) was allowed.
    let allowed = false;
    const written = update((now) => {
      const next = fn(now);
      allowed = next !== null;
      return next ?? now;
    });
    if (!written || !allowed) return Promise.resolve(false);
    onWritten?.();
    return new Promise((done) => {
      const timer = setTimeout(() => { waiters.current.delete(w); done(false); }, CONFIRM_FOR);
      // Called after each render of a new value or status: decided once the store is neither writing nor rebasing.
      function w() {
        const st = statusRef.current;
        if (st === 'saving' || st === 'conflict' || st === 'loading') return;
        waiters.current.delete(w);
        clearTimeout(timer);
        done(st === 'ok' && allowed && storeRef.current.holds[computer]?.id === id);
      }
      waiters.current.add(w);
    });
  };
  const sending = (sent: SentNote): HeldNote => ({ id: sent.id, parentId: sent.parentId, name: sent.name, phase: 'sending', sentAt: Date.now() });
  /** confirm() for a change that marks `sent` sending: its beat starts once the change is written (a refused one starts
   *  none and leaves any beat of this page as it is), and stops if the store then does not keep it (the sender then
   *  settles it). */
  const confirmSending = (computer: string, sent: SentNote, fn: (now: Kept) => Kept | null): Promise<boolean> => {
    let mine: ReturnType<typeof setInterval> | undefined;
    return confirm(computer, sent.id, fn, () => { mine = startBeat(computer, sent.id); }).then((won) => {
      // Only the beat this change started: a refused Send again of a note whose send is out keeps that send's beat.
      if (!won && mine !== undefined && beats.current.get(computer)?.timer === mine) stopBeat(computer, sent.id);
      return won;
    });
  };
  /** Takes the computer's hold for `sent`, marked sending, only when none is there (the rendered value or the one
   *  stored now, another tab's included). false: not won (a hold is there, the prefs are not open, or the store did
   *  not keep it); nothing may be sent then. */
  const claim = (computer: string, sent: SentNote): Promise<boolean> => {
    if (storeRef.current.holds[computer]) return Promise.resolve(false);
    return confirmSending(computer, sent, (now) => {
      const h = now.holds[computer];
      if (h) return h.id === sent.id ? now : null;
      return { ...now, holds: { ...now.holds, [computer]: sending(sent) } };
    });
  };
  /** A claimed create about to be sent again under a new id (Notes said the id was taken): the claim moves to it only
   *  while it is still this create's. Resolves true once the store holds the new id; the new id is sent only then. */
  const move = (computer: string, from: string, sent: SentNote): Promise<boolean> =>
    confirmSending(computer, sent, (now) => {
      const h = now.holds[computer]?.id;
      if (h === sent.id) return now;
      return h === from ? { ...now, holds: { ...now.holds, [computer]: sending(sent) } } : null;
    });
  /** A held create sent again under its own id (the Notes page's Send again): marked sending only while the store still
   *  holds that note and its send is not out (here, on the Board or in another tab). Resolves true once the store holds
   *  it marked; it is sent again only then. */
  const resend = (computer: string, sent: SentNote): Promise<boolean> =>
    confirmSending(computer, sent, (now) => {
      const h = now.holds[computer];
      return h?.id === sent.id && !inFlight(h) ? { ...now, holds: { ...now.holds, [computer]: sending(sent) } } : null;
    });
  /** The send of `note` answered unknown: its record stops saying sending (Check again and Stop tracking open). */
  const answered = (computer: string, note: string) => {
    stopBeat(computer, note);
    patch((now) => {
      const h = now.holds[computer];
      if (h?.id !== note || h.phase === undefined) return {};
      return { holds: { ...now.holds, [computer]: { id: h.id, parentId: h.parentId, name: h.name } } };
    });
  };
  return { store, storeRef, keep, release, settle, hold, claim, move, resend, answered };
}
