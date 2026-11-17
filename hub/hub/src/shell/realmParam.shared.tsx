// The shared body of shell/realmParam.tsx (web) and shell/realmParam.term.tsx (terminal): what a link asking for a
// realm does, rule for rule (see realmParam.tsx for the rules). The only browser part, the popstate wake-up, comes in
// as a parameter (createUseRealmParam), so this module reads no browser global unless a browser history is in use.
import { useEffect, useRef, useState } from 'react';
import { leaveCount, switchLosses, useRealms } from '@core';
import { loadRealms, realmList, realmName, snapshot, type SwitchOp, switchRevision } from '@core/shell';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { usePathname, useSearch } from '@kit/nav';
import { showToast } from '@kit/states/Toast';
import { type Translate, useStrings } from '@kit/strings';
import strings from './strings.en.json';
import { startSwitch } from './switchOp';

const HEX = /^[0-9a-f]{24}$/;
/** The search key of a link asking the shell for a realm. Pages build such links with this key (pages/keys/links.ts
 *  shareRealm spells it out: pages cannot import @shell; realmParam.test.tsx pins the two equal). */
export const OPEN_REALM = 'open_realm';
/** The All realms view's value, in the address as in the shell (core's selected realm). */
const ALL_REALMS = 'all';

type Outcome = 'switched' | 'refused' | 'unknown' | 'stale';

async function openRealm(id: string, owns: () => boolean, start: (id: string) => Promise<boolean>): Promise<Outcome> {
  if (id !== ALL_REALMS) {
    let ids = realmList();
    if (!ids || !ids.includes(id)) ids = await loadRealms().then(null, () => null);
    if (!owns()) return 'stale';
    if (!ids || !ids.includes(id)) return 'unknown';
  }
  const ok = await start(id);
  return !owns() ? 'stale' : ok ? 'switched' : 'refused';
}

/** The live search without the param that asked for `id` (and, for a Keys share link that contradicts itself, its share),
 *  every other param as the address holds it now; null when the address no longer holds that param (a page took it
 *  out, or a newer link's param is there: that one is the newer link's): the address then stays as it is. */
function withoutParam(prev: Readonly<Record<string, string>>, id: string, shareLink: boolean): Record<string, string> | null {
  if (prev[OPEN_REALM] !== id) return null;
  const out: Record<string, string> = { ...prev };
  delete out[OPEN_REALM];
  if (shareLink && prev.realm !== undefined && prev.realm !== id) delete out.share;
  return out;
}

/** A history entry's key (TanStack's __TSR_key), or undefined when it has none. */
function keyOf(state: unknown): string | undefined {
  const k = (state as { __TSR_key?: unknown } | null | undefined)?.__TSR_key;
  return typeof k === 'string' ? k : undefined;
}

/** Whether a router history writes the browser's own entries (TanStack's browser and hash histories: the Hub's). Only
 *  those set `_ignoreNextBeforeUnload`; a memory history (tests) never touches window.history. Pinned by
 *  realmParam.drop.test.tsx ('which histories are the browser's'), so a router upgrade that drops the field fails a
 *  test instead of turning the browser check off. */
function browserBacked(history: { _ignoreNextBeforeUnload?: unknown }): boolean {
  return typeof history._ignoreNextBeforeUnload === 'function';
}

/** The browser's own history entry state, read only for a browser-backed history (never in a terminal). */
function browserState(): unknown {
  return (globalThis as { history?: { state?: unknown } }).history?.state;
}

function nameOf(t: Translate<typeof strings>, id: string): string {
  const n = realmName(id);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('top.realmAll') : t('notice.noRealm');
}

/** A source of the browser's own history moves (popstate): the web's window, none in a terminal (a memory history
 *  has no browser entries, so no move the router did not make). Returns its removal. */
export type BrowserMoves = (wake: () => void) => () => void;

/** The useRealmParam hook over a source of browser moves (realmParam.tsx: window's popstate; the terminal: none). */
export function createUseRealmParam(browserMoves: BrowserMoves): (shareRoute?: string) => boolean {
  return function useRealmParam(shareRoute?: string): boolean {
    return useRealmParamWith(browserMoves, shareRoute);
  };
}

/** Whether the page area waits for a realm a link asked for. `shareRoute`: the Keys page's shared tab path, when the
 *  Keys page is served (the place shell/Switchers' share link goes to). */
function useRealmParamWith(browserMoves: BrowserMoves, shareRoute?: string): boolean {
  const t = useStrings(strings);
  const view = useRealms();
  const search = useSearch();
  const asked = search[OPEN_REALM];
  // Kept although its value is unused (the share route is judged on the location cleaned): the subscription renders
  // this component again on every path change, which openwith.launch.spec needs (without it a kept Board is shown
  // now and then for an Add link drawn late, the link left in the address).
  const path = usePathname();
  const navigate = useNavigate();
  const router = useRouter();
  // The param this hook still has to take out of the address (the id it asked for), and the wake-up of its check.
  // The check runs a task after each wake (drop, the router's resolve, a browser Back/Forward) and acts only on one
  // settled entry: the router not loading, and the router's location, the history's entry and, for a history that
  // writes the browser's entries (browserBacked: the Hub's), the browser's own entry (window.history.state) all carry
  // one key. A browser entry without a key never matches (TanStack invents a key for the router when it reads one, so
  // nothing proves it is the entry checked): its param stays rather than risk replacing another entry. A push that has
  // not reached the browser yet, or a Back or Forward the browser took while a leave guard decides, is not settled: the
  // next wake checks again. On a settled entry that still holds the param it replaces exactly that
  // entry, at once and past any leave guard (the router's replace reaches the history's entry before navigate()
  // returns; the browser write follows in a microtask, before any other task, so no held navigation can commit in
  // between), without the param (and without the share of a Keys share link that contradicts itself,
  // judged on that location's path); the replace gives the entry a new key at once (the router reads the history as it
  // notifies), so a later check never takes the replaced entry for the one it checked. When the entry no longer holds
  // the param (gone, or another value: a newer link's) the debt ends. So a navigation started beside the cleanup is never overwritten or carried onto the
  // entry it leaves, and a param it leaves behind (a guard refused it) is still taken out.
  const owed = useRef<string | null>(null);
  const wake = useRef<() => void>(() => undefined);
  const shareAt = useRef(shareRoute);
  shareAt.current = shareRoute;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const id = owed.current;
      if (id === null || router.state.status === 'pending') return;
      const at = router.latestLocation;
      const key = keyOf(at.state);
      if (key !== keyOf(router.history.location.state)) return;
      if (key === undefined) return;
      if (browserBacked(router.history) && keyOf(browserState()) !== key) return;
      const next = withoutParam(at.search as Record<string, string>, id, at.pathname === shareAt.current);
      if (next === null) {
        owed.current = null;
        return;
      }
      void navigate({ to: at.pathname, search: next as never, hash: at.hash, replace: true, ignoreBlocker: true } as never);
    };
    // A task after the wake: a navigation started in its tick has reached the history, or waits on a guard.
    wake.current = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 0);
    };
    const onWake = () => wake.current();
    const off = router.subscribe('onResolved', onWake);
    // A guard that refuses a Back returns the browser to the entry after the router has resolved: the browser's own
    // move wakes the check.
    const offMoves = browserMoves(onWake);
    // A debt this effect inherits (StrictMode's second setup, or a new router) is checked again.
    if (owed.current !== null) onWake();
    return () => {
      off();
      offMoves();
      clearTimeout(timer);
      wake.current = () => undefined;
    };
  }, [router, navigate, browserMoves]);
  const drop = () => {
    if (asked === undefined) return;
    owed.current = asked;
    wake.current();
  };
  const [busy, setBusy] = useState(false);
  // The value whose request ended without a switch: it stays in the address and nothing waits on it.
  const [left, setLeft] = useState<string | undefined>(undefined);
  const usable = asked !== undefined && (HEX.test(asked) || asked === ALL_REALMS) && view.pinned === null;
  const wants = usable && asked !== view.selected && asked !== left;
  // A link on the path already shown, while its page holds work a switch would lose: the page stays drawn until the
  // switch ends. Withheld, it would unmount and take its switch guard with it before core asks, so the leave question
  // would not name that work. That page already shows in the realm being left, so nothing new renders there; Stay
  // keeps it as it was, and a switch that commits drops it as any realm switch does. A link to another path waits as
  // before (the page left goes with the navigation, which asks on its own).
  const [came, setCame] = useState({ asked, path, holds: false });
  let holds = came.holds;
  if (came.asked !== asked || came.path !== path) {
    holds = asked !== undefined && asked !== came.asked && path === came.path && (switchLosses().length > 0 || leaveCount() > 0);
    setCame({ asked, path, holds });
  }
  // Only a new value starts the work below; what it reads besides is taken as it is then.
  const latest = useRef({ usable, t, drop });
  useEffect(() => {
    latest.current = { usable, t, drop };
  });
  // The value handled, so a re-run of the effect (StrictMode) does not ask twice; cleared once the param is gone.
  const handled = useRef<string | undefined>(undefined);
  // The newest request's number, and the switch this hook started in core (cancelled when a newer request comes).
  const seq = useRef(0);
  const pending = useRef<SwitchOp | null>(null);
  useEffect(() => {
    // Every new value (or none) ends the older request: its switch is cancelled, its wait and its failure dropped.
    const retire = () => {
      pending.current?.cancel();
      pending.current = null;
      setLeft(undefined);
    };
    if (asked === undefined) {
      handled.current = undefined;
      seq.current += 1;
      retire();
      setBusy(false);
      return;
    }
    if (handled.current === asked) return;
    handled.current = asked;
    const me = ++seq.current;
    retire();
    const { usable: ok, t: tr, drop: dropParam } = latest.current;
    const from = snapshot().realm;
    if (!ok || asked === from) {
      if (ok) dropParam();
      setBusy(false);
      return;
    }
    // The owner while it is the newest request and no switch started since but its own.
    let rev = switchRevision();
    const owns = () => seq.current === me && switchRevision() === rev;
    const start = (id: string) => {
      const op = startSwitch(id);
      pending.current = op;
      rev = switchRevision();
      return op.done;
    };
    setBusy(true);
    void openRealm(asked, owns, start)
      .then((r) => {
        // Stale while still the newest link: a switch from elsewhere won, and the link is left as it is.
        if (r === 'stale') {
          if (seq.current === me) setLeft(asked);
          return;
        }
        if (r === 'switched') latest.current.drop();
        else setLeft(asked);
        if (r === 'unknown') showToast({ tone: 'warn', title: tr('realmParam.unknown', { realm: nameOf(tr, asked) }), body: tr('notice.stillShowing', { realm: nameOf(tr, from) }) });
      })
      .finally(() => {
        if (seq.current === me) setBusy(false);
      });
  }, [asked]);
  return (wants || busy) && !holds;
}

