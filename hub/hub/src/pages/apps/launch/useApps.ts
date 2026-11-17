// The launcher's state and actions for one computer: Open (send once), Stop, Check, Restart, Forget or Dismiss, and
// the dialogs they ask through. One hook for every place that launches apps (the Programs Apps tab, a Board tile's
// Launch an app step), so the C9 rules are written once:
//   - One request per press. A second Open of an app while a copy of it is starting or unknown is held: the
//     store is read (not the render), and the store and the recent list are module state, so a launch from the
//     Board holds an Open of the same app on Programs and the other way round.
//   - An outcome that may have gone through is "unknown" with Check, never failed; only a warned Dismiss lifts it.
//   - Options' hidden values, the share note and the confirms close on an account, realm or computer switch.
//   - A Files launch (a marked row) starts again only through recoveryFor: with its plan, a
//     new claim; without one (a reload), only Open again from Files, which stops and sends nothing. Restart checks
//     the plan, the exec permission and that the row is not held before anything is stopped; every exit before the
//     new launch drops what the plan claimed (unsent cleanup).
//   - A row whose terminal may still be open (a leftover, live.ts) offers Remove: only that terminal's DELETE; the row
//     goes once it is proven closed, else it stays with a note. Its menu's Remove from this list is the same Remove.
// The place decides where things show: `nav` says which row is selected, what happens once a launch is listed or
// held, and how to show Find for a word.
import { can, useCore, type Target } from '@core';
import { showToast, useStrings } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIVE, useCheckApp, useForgetApp, useOpenApp, useOpenApps, useRestartApp, useStopApp } from '../data';
import { type Action, type Item, type OpenApp, candidateOf, heldOpen, marked, unresolved } from '../logic';
import { itemFor, liveAck, liveAcked, liveCheck, liveForget, liveHeld, liveOpen, liveRemove, liveRemoveHold, liveRestart, liveStop, liveUndoable, recoveryFor, relistStored, useLiveApps, type OpenOpts, type RecoverAt } from '../parts/live';
import { merge, ops, useOps } from '../parts/ops';
import { sourceWord } from '../parts/words';
import strings from '../strings.en.json';

export interface AppsNav {
  /** The selected row's key, if any. */
  selected?: string | undefined;
  select: (key: string | undefined, o?: { replace?: boolean }) => void;
  /** A launch was listed under `key` (it may still be going through). */
  onListed?: (key: string) => void;
  /** An Open was held by row `key`, a copy of the same app not read back yet. */
  onHeld?: (key: string) => void;
  /** Shows Find, with `q` typed in when given. */
  showFind?: (q?: string) => void;
  /** Opens Files on the row's computer: the only way to start a Files launch again without its plan. */
  openFiles?: (r: OpenApp) => void;
}

/** A row as an item to open again (its app by name, or its starter). */
const itemFromApp = (a: OpenApp): Item => ({
  type: a.catalogId ? 'starter' : 'row', name: a.name, id: a.catalogId ?? a.key, description: '', opensIn: a.opensIn, by: 'server', provider: null, version: '', attr: '', path: '', sourceId: '', setId: '', app: a.app ?? a.name,
  shares: false, runnable: true, unsure: false, installed: false, also: [], ready: true, tier: 0, ord: 0, group: 0, detail: '',
});

let counter = 0;

export function useApps(o: { target?: Target | null | undefined; nav: AppsNav; /** A place that shows no code (a Board tile): leaving it wipes none. */ keepCodes?: boolean }) {
  const { nav } = o;
  const t = useStrings(strings);
  const opened = useOpenApps();
  const snap = useOps();
  const launchM = useOpenApp();
  const stopM = useStopApp();
  const checkM = useCheckApp();
  const restartM = useRestartApp();
  const forgetM = useForgetApp();

  // Live: Open, Stop, Check and Restart run through core's run-open machine; the list is the recent list's
  // rows of this computer plus this session's launches (parts/live.ts).
  const live = useLiveApps(LIVE, t('src.catalogue'), t('src.other'), o.target, t('src.files'));
  const cid = live.target?.container.id;
  const rows = useMemo(() => merge(opened.data, snap).filter((r) => !LIVE || r.computer === cid), [opened.data, snap, cid]);

  // Options for an item; `reopen`: a row's own app opened again by name (no starter, no search candidate kept).
  const [options, setOptionsState] = useState<{ item: Item; reopen: boolean } | null>(null);
  const setOptions = (item: Item | null, reopen = false) => setOptionsState(item ? { item, reopen } : null);
  const [share, setShare] = useState<{ item: Item; o: OpenOpts } | null>(null);
  const [stopping, setStopping] = useState<OpenApp | null>(null);
  const [dismissing, setDismissing] = useState<OpenApp | null>(null);

  // An account, realm or computer switch closes what was open for the old one: Options (its secret values), the
  // share note and the Stop confirm never act in the new context.
  const core = useCore();
  useEffect(() => {
    setOptionsState(null);
    setShare(null);
    setStopping(null);
    setDismissing(null);
  }, [core.account, core.realm, cid]);

  // Access codes live in memory only: leaving the place that shows them forgets them.
  const keepCodes = !!o.keepCodes;
  useEffect(() => (keepCodes ? undefined : () => ops.wipeCodes()), [keepCodes]);

  // ── Actions ───────────────────────────────────────────────────────────────────────

  /** Where a marked row's plan runs again: this place's machine and Open, while it is mounted and shows the computer
   *  it showed at the press (live.ts Recovery). */
  const shownNow = useRef(cid);
  shownNow.current = cid;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);
  const at: RecoverAt = { live, launch: (item, op) => void launch(item, op), shows: () => mounted.current && shownNow.current === cid };

  async function launch(item: Item, op: OpenOpts = {}, reopen = false) {
    const opensIn = op.opensIn ?? (item.opensIn === 'unknown' ? undefined : item.opensIn);
    if (!opensIn) return setOptions(item, reopen);
    // C9: never a second copy over one whose outcome is not read back (read from the store, not this render).
    // Live: the recent list is read again first, so a copy another tab stored holds this Open too.
    if (LIVE) relistStored(live);
    const now = merge(opened.data, ops.get()).filter((r) => !LIVE || r.computer === cid);
    // A reopen by name has no candidate (its row key is not one).
    const candidate = reopen ? undefined : candidateOf(item);
    const held = unresolved(now, { ...(item.type === 'starter' ? { catalogId: item.id } : {}), app: item.app || item.name, ...(candidate ? { candidate } : {}) });
    const first = held[0];
    if (first) {
      ops.patch(first.key, { note: first.state === 'starting' ? 'opening' : 'held' });
      // Options closes too: its values never stay open over the row that holds them back.
      setOptions(null);
      setShare(null);
      nav.onHeld?.(first.key);
      return;
    }
    const key = `local-${Date.now()}-${counter++}`;
    ops.addLaunch({
      key, name: item.name, ...(item.type === 'starter' ? { catalogId: item.id } : {}), ...(candidate ? { candidate } : {}), ...(item.agent ? { agent: item.agent } : {}), app: item.app || item.name, opensIn, state: 'starting', terminal: null, handle: '', // no handle until the computer admits the launch
      // A Files launch lists no settings: its only one is internal (the file's path rides as a staged value).
      source: item.type === 'starter' ? t('src.catalogue') : sourceWord(t, item.provider), command: '', settings: marked(item) ? [] : Object.keys(op.env ?? {}), urls: {}, startedAt: Date.now(), ...(cid ? { computer: cid } : {}),
      ...(marked(item) ? { p: item.p } : {}),
    });
    setOptions(null);
    setShare(null);
    nav.onListed?.(key);
    if (LIVE) return liveOpen(live, key, item, op, reopen);
    try {
      const r = await launchM.mutateAsync({ id: item.id, name: item.name, ...(item.type === 'starter' ? { catalogId: item.id } : {}), app: item.app || item.name, opensIn, ...(op.args?.length ? { args: op.args } : {}), ...(op.env ? { envNames: Object.keys(op.env) } : {}) });
      if (r.outcome === 'done') ops.patch(key, { state: r.data?.state ?? 'starting', ...(r.data?.accessCode ? { accessCode: r.data.accessCode } : {}) });
      else if (r.outcome === 'pending') ops.patch(key, { state: 'unknown', code: 'start_unconfirmed' });
      else ops.patch(key, { state: 'not_started', code: r.code ?? 'couldnt_start' });
    } catch (e) {
      // not_wired: the source refused the call before sending anything, so it is "didn't start", never "may have gone through".
      if ((e as { kind?: string }).kind === 'not_wired') ops.patch(key, { state: 'not_started', code: 'couldnt_start' });
      else ops.patch(key, { state: 'unknown', code: 'start_unconfirmed' });
    }
  }

  /** The first Open of a starter that shares files says so once. */
  function open(item: Item, op: OpenOpts = {}) {
    if (item.type === 'starter' && item.shares && !snap.acked.has(item.id) && !(LIVE && liveAcked(item.id))) return setShare({ item, o: op }); // the Options it was opened with go through the note
    void launch(item, op);
  }

  /** One action per row at a time: a second press while one runs does nothing. A Check may be
   *  waiting out a server's Retry-After (up to minutes): a Stop or Restart goes ahead of it and the Check's read
   *  is dropped (live.ts liveCheck), so a Stop is never refused for a read. */
  const busyNow = (key: string, overCheck = false): boolean => {
    const b = ops.get().patches.get(key)?.busy;
    return b !== undefined && !(overCheck && b === 'check');
  };
  /** The store's session at the press. The store is reset when the session ends or the account or realm changes, and
   *  the next session may list a row under the same key: an answer that comes after the reset writes nothing (no note,
   *  state or selection, and no busy mark settled). */
  const sameSession = (): (() => boolean) => {
    const ep = ops.get().epoch;
    return () => ops.get().epoch === ep;
  };
  /** Settles this action's busy mark only if no other action took the row meanwhile, in the session it began in. */
  const settle = (key: string, mine: 'check' | 'restart' | 'stop', same: () => boolean) => {
    if (same() && ops.get().patches.get(key)?.busy === mine) ops.unset(key, 'busy');
  };

  async function check(r: OpenApp) {
    if (busyNow(r.key)) return;
    const same = sameSession();
    ops.patch(r.key, { busy: 'check' });
    ops.unset(r.key, 'note');
    try {
      if (LIVE) return await liveCheck(live, r.key);
      const res = await checkM.mutateAsync({ key: r.key });
      if (res.outcome === 'done' && same()) ops.patch(r.key, { state: res.data?.state ?? r.state, code: '' });
    } catch {
      /* still unknown: the row keeps saying so */
    } finally {
      settle(r.key, 'check', same);
    }
  }

  async function restart(r: OpenApp) {
    if (busyNow(r.key, true)) return;
    const same = sameSession();
    ops.patch(r.key, { busy: 'restart' });
    ops.unset(r.key, 'note');
    // On a row already unknown, "Didn't restart" alone reads as settled: the note says it is still unknown.
    const failedNote = r.state === 'unknown' ? 'restartFailedUnknown' : 'restartFailed';
    try {
      if (LIVE) {
        // Checked before anything is stopped: a Files launch without its plan restarts only from Files;
        // without the exec permission nothing is stopped; a held Files launch is checked first, never restarted.
        const how = recoveryFor(r);
        if (how.kind === 'files') return void nav.openFiles?.(r);
        if (!can('computers.actions.exec')) return void (ops.patch(r.key, { note: 'execOff' }), nav.select(r.key));
        if (how.kind === 'plan' && heldOpen(r)) return void (ops.patch(r.key, { note: 'restartHeld' }), nav.select(r.key));
        if (how.kind === 'plan') {
          const ready = await how.rec.prepare(at);
          if (!ready.ok) {
            if (same()) {
              ops.patch(r.key, { note: ready.kept ? 'restartKept' : 'restartRefused' });
              nav.select(r.key);
            }
            return;
          }
          let done: Awaited<ReturnType<typeof liveRestart>> | 'threw' | 'execOff' | 'restartHeld' | 'moved' = 'threw';
          let kept = false;
          try {
            // Checked again after the claim, right before the Stop (nothing awaits in between): the permission or the
            // row, the computer this place shows, or the session, may have changed while prepare waited.
            if (!can('computers.actions.exec')) done = 'execOff';
            else if (!at.shows() || !same()) done = 'moved';
            else if (liveHeld(r.key)) done = 'restartHeld';
            else done = await liveRestart(live, r.key, ready.go);
          } finally {
            // Every exit before the new launch: what prepare claimed is dropped, and the answer is checked.
            // Anything but freed (or nothing claimed) leaves the new start reserved: the row says so.
            if (done !== 'done') {
              const out = await ready.unsent().catch(() => 'unresolved' as const);
              kept = out !== 'freed' && out !== 'none';
            }
          }
          // The original row keeps its own outcome. An unconfirmed stop is said first (C9); then a reservation kept.
          const note =
            done === 'unconfirmed' ? 'restartUnconfirmed'
            : kept ? 'restartKept'
            : done === 'failed' ? failedNote
            : done === 'execOff' || done === 'restartHeld' ? done
            : done === 'moved' ? 'restartRefused'
            : null;
          if (note && same()) {
            ops.patch(r.key, { note });
            nav.select(r.key);
          }
          return;
        }
        const from = itemFor(r.key);
        const done = await liveRestart(live, r.key, () => void launch(from?.item ?? itemFromApp(r), from?.o ?? { opensIn: r.opensIn }, from ? from.reopen : !r.catalogId));
        // A restart that started nothing (live.ts liveRestart): the stop failed, or its outcome is unknown.
        if ((done === 'failed' || done === 'unconfirmed') && same()) {
          ops.patch(r.key, { note: done === 'failed' ? failedNote : 'restartUnconfirmed' });
          nav.select(r.key);
        }
        return;
      }
      const res = await restartM.mutateAsync({ key: r.key });
      if (!same()) return;
      if (res.outcome === 'done') ops.patch(r.key, { state: res.data?.state ?? 'starting', code: '', ...(res.data?.accessCode ? { accessCode: res.data.accessCode } : {}) });
      else if (res.outcome === 'pending') ops.patch(r.key, { state: 'unknown', code: 'start_unconfirmed' });
      else ops.patch(r.key, { note: failedNote });
    } catch {
      if (same()) ops.patch(r.key, { state: 'unknown', code: 'start_unconfirmed' });
    } finally {
      settle(r.key, 'restart', same);
    }
  }

  async function stop(r: OpenApp) {
    if (busyNow(r.key, true)) return void setStopping(null);
    const same = sameSession();
    ops.patch(r.key, { busy: 'stop' });
    ops.unset(r.key, 'note');
    try {
      if (LIVE) {
        // A close that was not sent, or that left the app running, leaves the row as it was with the failure note.
        const res = await liveStop(live, r.key);
        if (same() && res && (res.notSent || res.state === 'running')) ops.patch(r.key, { note: 'stopFailed' });
        return;
      }
      const res = await stopM.mutateAsync({ key: r.key });
      if (!same()) return;
      if (res.outcome === 'done') ops.patch(r.key, { state: 'stopped', code: '' });
      // Only an outcome that may have gone through is unconfirmed (C9); a definite failure or an unsent stop
      // leaves the row as it was, with a note.
      else if (res.outcome === 'failed' || res.outcome === 'not_sent') ops.patch(r.key, { note: 'stopFailed' });
      else ops.patch(r.key, { state: 'unknown', code: 'stop_unconfirmed' });
    } catch {
      if (same()) ops.patch(r.key, { state: 'unknown', code: 'stop_unconfirmed' });
    } finally {
      settle(r.key, 'stop', same);
      // The Stop confirm of the next session is its own.
      if (same()) setStopping(null);
    }
  }

  /** Remove of a row whose terminal may still be open: only its DELETE (live.ts liveRemove). Unconfirmed, the row stays
   *  with a note (C9). */
  async function remove(r: OpenApp) {
    if (!LIVE || busyNow(r.key, true)) return;
    const same = sameSession();
    // Busy as a Stop is (it ends something on the computer): one action of the row at a time.
    ops.patch(r.key, { busy: 'stop' });
    ops.unset(r.key, 'note');
    try {
      const out = await liveRemove(live, r.key);
      if (!same()) return;
      if (out === 'removed') {
        if (nav.selected === r.key) nav.select(undefined, { replace: true });
      } else {
        ops.patch(r.key, { note: 'removeUnconfirmed' });
        nav.select(r.key);
      }
    } finally {
      settle(r.key, 'stop', same);
    }
  }

  function forget(r: OpenApp) {
    // A leftover terminal never just leaves the list: its Remove closes it first.
    if (LIVE && ops.get().runs.get(r.key)?.left) return void remove(r);
    const same = sameSession();
    if (LIVE) {
      // A row an Open-with hold keeps: the warned Remove frees the hold, and the row goes only once that answered
      // freed (no Undo: a freed hold cannot come back). Otherwise it stays, with its Check and Remove, and a note.
      if (!liveUndoable(r.key)) {
        return void liveRemoveHold(r.key).then((out) => {
          if (!same()) return;
          if (out === 'freed') {
            if (nav.selected === r.key) nav.select(undefined, { replace: true });
            showToast({ title: t('forgot', { name: r.name }), tone: 'info' });
          } else {
            ops.patch(r.key, { note: 'notForgotten' });
            nav.select(r.key);
          }
        });
      }
      // Live: off this list and the recent list; nothing is sent, so the Undo brings it back as it was.
      const undo = liveForget(r.key, live);
      if (nav.selected === r.key) nav.select(undefined, { replace: true });
      return void showToast({ title: t('forgot', { name: r.name }), tone: 'info', action: { label: t('forgot.undo'), onAction: undo } });
    }
    ops.forget(r.key);
    if (nav.selected === r.key) nav.select(undefined, { replace: true });
    // A Forget that didn't go through brings the row back with a note, so the Undo toast never lies.
    void forgetM.mutateAsync({ key: r.key }).catch(() => {
      if (!same()) return;
      ops.unforget(r.key);
      ops.patch(r.key, { note: 'notForgotten' });
      nav.select(r.key);
    });
    showToast({ title: t('forgot', { name: r.name }), tone: 'info', action: { label: t('forgot.undo'), onAction: () => { if (same()) ops.unforget(r.key); } } });
  }

  /** Forget, or for a row whose Open may still be going through, a Dismiss that warns first: the row is what
   *  holds a second Open of its app, so removing it could start a second copy (C9). */
  function askForget(r: OpenApp) {
    if (heldOpen(r)) return void setDismissing(r);
    forget(r);
  }

  /** Starts a marked row again through its plan (a new claim): nothing is stopped. */
  async function replan(r: OpenApp, rec: Extract<ReturnType<typeof recoveryFor>, { kind: 'plan' }>['rec']) {
    if (!can('computers.actions.exec')) return void (ops.patch(r.key, { note: 'execOff' }), nav.select(r.key));
    const same = sameSession();
    const ready = await rec.prepare(at);
    // A reset while it prepared: the press was the last session's, so nothing starts in this one and what it claimed
    // is dropped (unsent cleanup).
    if (!same()) {
      if (ready.ok) void ready.unsent().catch(() => undefined);
      return;
    }
    // Refused (another computer, no machine, a claim refused): nothing was sent, and the row says so; a claim it could
    // not clear holds the next try, and the row says that instead.
    if (!ready.ok) return void (ops.patch(r.key, { note: ready.kept ? 'openKept' : 'openRefused' }), nav.select(r.key));
    ready.go();
  }

  function act(r: OpenApp, a: Action) {
    // A Files launch starts again only through its plan, or (without one) from Files.
    if (a === 'files') return void nav.openFiles?.(r);
    if (LIVE && marked(r) && (a === 'openAgain' || a === 'retry' || a === 'options' || a === 'pick' || a === 'plain')) {
      const how = recoveryFor(r);
      return void (how.kind === 'plan' ? replan(r, how.rec) : nav.openFiles?.(r));
    }
    switch (a) {
      case 'stop':
      case 'stopAgain':
        return setStopping(r);
      case 'check':
        return void check(r);
      case 'remove':
        return void remove(r);
      case 'openAgain':
      case 'retry': {
        // The same request as before when this session opened it; otherwise a plain Open of its app.
        const from = itemFor(r.key);
        if (from) return void launch(from.item, from.o, from.reopen);
        return LIVE && !r.catalogId ? void launch(itemFromApp(r), { opensIn: r.opensIn }, true) : open(itemFromApp(r));
      }
      case 'switch': {
        const twin = rows.find((x) => x.key !== r.key && x.catalogId === r.catalogId && (x.state === 'running' || x.state === 'ready'));
        return twin ? nav.select(twin.key) : undefined;
      }
      case 'apps':
        return nav.select(undefined, { replace: true });
      case 'starters':
        return nav.showFind?.();
      case 'options':
      case 'pick':
      case 'plain': {
        // The item the row was opened from, when this session has it. A row that is not a starter has no
        // candidate to send again (its key is not one): a pick searches Find for its app, and
        // Options opens its app by name.
        // A pick (more than one match, a version the computer refuses, tools it lacks) never sends the same
        // request again: a starter opens its Options fresh, anything else searches Find.
        const from = a === 'pick' ? undefined : itemFor(r.key);
        if (from) return setOptions(from.item, from.reopen);
        if (r.catalogId) return setOptions(itemFromApp(r));
        if (a === 'pick') return nav.showFind?.(r.app ?? r.name);
        return setOptions(itemFromApp(r), true);
      }
      default:
        return undefined;
    }
  }

  /** The row's note, if any. "held"/"opening" describe a row still unresolved; once it has a state, its action
   *  shows again. */
  const noteOf = (r: OpenApp) => {
    const raw = snap.patches.get(r.key)?.note;
    return (raw === 'held' || raw === 'opening') && r.state !== 'unknown' && r.state !== 'starting' ? undefined : raw;
  };

  // Cells and panels are memoized by their places, but the actions close over this render's machine, computer
  // and rows: they call the latest handlers through this ref, never the render they were built in. (The live
  // machine is made in an effect, so the first render's actions have none: a stale Open sent nothing.)
  const latest = useRef({ open, act, launch, setOptions });
  latest.current = { open, act, launch, setOptions };

  return {
    t, live, cid, rows, opened, snap, latest,
    launch, open, check, restart, stop, remove, forget, askForget, act, noteOf,
    options, setOptions, share, setShare, stopping, setStopping, dismissing, setDismissing,
    stopPending: stopM.isPending,
  };
}

export type Apps = ReturnType<typeof useApps>;

/** The share note's confirm: remembered once, then the Open it held goes ahead. */
export function confirmShare(a: Apps): void {
  if (!a.share) return;
  ops.ack(a.share.item.id);
  if (LIVE) liveAck(a.share.item.id);
  void a.launch(a.share.item, a.share.o);
}
