// The warned sign-out. Sign-out stops tracking the leaving account's changes that may have
// gone through: its change and attempt holds, as core's signOutHolds() lists them. While there are any, every
// sign-out control asks first, naming how many. A preference not saved yet (crypt
// pendingPrefWrites: still being stored, refused and kept only in this page, or plaintext not sealed; any kept key,
// so the text names no page) asks too: logout() waits only 3 s for a write and drops a page-only value.
// The holds come from core's signOutHolds(): the same predicate core's forget uses, each hold
// named by its record id and hold token (HoldRef). Every confirm, a save-only one included, passes exactly the holds the dialog
// showed to signOutForgetting(account, shown): under the store locks it forgets those of that
// account on this browser and only then signs out (logout, reason 'signout'; the purge itself deletes no hold).
// 'changed': the account holds something the dialog did not show, nothing was deleted, so the dialog shows the
// warning as it is now and that press signs nothing out. (Core also answers 'changed' when another account shows
// after its removal ran; the dialog has closed by then, since the account it was opened for is gone.) 'failed' (or a throw): nothing purged, nothing navigates,
// the session stays and the dialog says why (or closes, when another account now shows). 'unknown'
// (the storage rollback after a failed check was refused): the confirmed holds may already be forgotten here, so the
// session stays with a neutral line and the dialog re-reads. signOutHolds() is a clean read of storage:
// records the removal did not reach show again and the next confirm forgets them; none left, the next
// press signs out. Only 'done' signs out.
// Cancel, Esc or the scrim send nothing. Expiry never comes here: automatic ends keep every hold.
// The dialog belongs to the account core shows when it opens (snapshot().account, the key core files changes
// under; none while a sign-out runs). Another account showing (a switch, even mid-forget) closes it and stops the
// flow; every press checks the account again and passes that account to signOutForgetting.
// What the dialog warns about stays live while it is open (core's change and attempt versions, a short re-read for
// the preference count, which has no notice). Every press reads it again: when a hold the dialog did not show is
// there (a new one, or a hold sent again under a new token), or a preference became unsaved, the press shows the new
// warning and signs nothing out. Core checks the same under its locks ('changed').
// One flow at a time: asking again while a forget runs changes nothing. Without an account there is nothing keyed
// to forget, so sign-out goes straight through, as it does when nothing is unresolved or unsaved.
// The mounted AppShell registers the dialog; without a shell, sign-out goes straight through.
// Sends still out: the removal keeps a change record whose sending stamp is live,
// shown or not, so 'done' can sign out while such sends stay stored. A shown hold core marks `sending` is named in
// the warning before the press (the person is told before choosing): it stays on this browser and keeps the same
// change blocked until its answer settles it. Never "removed", never "failed". After 'done' the page normally
// leaves; where it stays (the purge-failed panel of that sign-out) the panel says the same (useSendsKeptAtSignOut).
// The count line covers every shown hold; the "forgets" sentence names only those that are not sends still out.
// A shown hold that turns into a send still out (another tab's heartbeat renewed, same record and
// token) is more than the dialog said: the press re-shows it before anything is forgotten.
// Questions to the assistant: the scripts writer's stored asks of this
// account (core readScriptAsks(account), live on useScriptAsksVersion) are warned about too, and every confirm goes
// through signOutForgettingAsks(account, holds, asks) with exactly the asks the dialog showed: core drops them in one
// write bound to the account (all or none), then runs signOutForgetting whatever the drop answered. Only its `result`
// decides what the dialog does; an ask the drop did not remove stays stored under that account (secret-free) and shows
// again at its next sign-in. Asks that cannot be read are not shown (nothing could drop them). A press whose fresh read
// holds an ask the dialog did not show, or a shown ask that moved on (another record, sameScriptAsk), re-shows the
// warning and signs nothing out, as for holds; a shown ask that settled meanwhile is fine (the drop finds it gone).
// The drop runs before the forget, so a press that does not sign out ('failed', 'changed', 'unknown') can leave the
// person signed in with the shown questions no longer followed: when the drop answered 'ok', the dialog
// says so until it closes, and never says everything is confirmed; an asks-only 'unknown' names no changes.
// Work running from this tab (core leave.ts: uploads, copies, deletes, publish steps, pulls) is warned about
// too, in this same dialog: signing out stops it, and each may have gone through. The count is live while the dialog
// is open, and a press that finds more running than the dialog said re-shows the warning and signs nothing out, as for
// holds. Work that ended meanwhile is fine. The realm switch asks through core's own guard (realm.ts), not here.
// Unsaved work a page registered (core switch-guard.ts: a New script draft whose typed input or edited code nothing
// can bring back) is warned about too: each guard's sentence is a line of the warning, re-read while the dialog is open,
// and a press that finds a sentence the dialog did not show re-shows the warning and signs nothing out.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { leaveCount, pendingPrefWrites, switchLosses, useAttemptsVersion, useChangesVersion, useLeaveCount } from '@core';
import { logout, readScriptAsks, sameScriptAsk, signOutForgettingAsks, signOutHolds, snapshot, subscribe, useScriptAsksVersion, type HoldRef, type ScriptAsk } from '@core/shell';
import { ConfirmDialog } from '@kit/overlays/Dialog';
import { ErrorState } from '@kit/states/States';
import { useStrings } from '@kit/strings';
import strings from './strings.en.json';

/** What the dialog warns about: the holds it names (unresolved changes and attempts), whether a preference is unsaved. */
interface Warning {
  holds: readonly HoldRef[];
  count: number;
  /** How many of `holds` core marks as a live send: kept stored by the sign-out, named in the warning. */
  sending: number;
  saving: boolean;
  /** The account's questions to the assistant still waiting for an answer (none when they cannot be read). */
  asks: readonly ScriptAsk[];
  /** Work running from this tab now (core leaveCount); a sign-out stops it. */
  running: number;
  /** What a sign-out loses that nothing brings back: each registered guard's sentence (core switchLosses). */
  unsaved: readonly string[];
}
type Opener = (w: Warning, account: string) => void;
let opener: Opener | undefined;
/** True from the press that starts a forget until the flow ends (signed out, failed, closed). */
let inFlight = false;
/** True while the dialog is up: a second ask does not reopen or reset it. LeaveConfirm waits while it is: one dialog at
 *  a time, so a realm switch's leave question (its probe ended while this was up) shows once this closes. */
let shown = false;
const shownListeners = new Set<() => void>();
function setShown(v: boolean): void {
  if (v === shown) return;
  shown = v;
  for (const fn of [...shownListeners]) fn();
}
const subscribeShown = (fn: () => void) => {
  shownListeners.add(fn);
  return () => void shownListeners.delete(fn);
};
/** Whether the sign-out confirm is up (LeaveConfirm waits while it is). */
export function useSignOutShowing(): boolean {
  return useSyncExternalStore(subscribeShown, () => shown);
}
/** How often an open dialog re-reads the preference count (it has no change notice). */
const REREAD_MS = 1000;

/** The account core files changes under now (snapshot().account; a suspended one too), null while a sign-out runs. */
function accountNow(): string | null {
  try {
    const s = snapshot();
    return s.loggingOut ? null : s.account || null;
  } catch {
    return null;
  }
}

/** Whether a kept preference is not saved yet (false when the store cannot say). */
function prefsSaving(): boolean {
  try {
    return pendingPrefWrites() > 0;
  } catch {
    return false;
  }
}

/** The shown account's holds that may have gone through (core's one predicate). A sign-out forgets those that are not
 *  sends still out (`sending`); it keeps those, and the warning says so. */
function holdsAtSignOut(): readonly HoldRef[] {
  return signOutHolds();
}

/** The account's stored asks; [] when storage cannot be read (they stay stored, nothing here could drop them). */
function asksOf(account: string): readonly ScriptAsk[] {
  try {
    const a = readScriptAsks(account);
    return a === 'unreadable' ? [] : a;
  } catch {
    return [];
  }
}

/** The guards' sentences now; [] when they cannot be read (a fault never blocks a sign-out). */
function unsavedNow(): readonly string[] {
  try {
    return switchLosses();
  } catch {
    return [];
  }
}

const warningNow = (account: string): Warning => {
  const holds = holdsAtSignOut();
  return { holds, count: holds.length, sending: holds.filter((h) => h.sending === true).length, saving: prefsSaving(), asks: asksOf(account), running: leaveCount(), unsaved: unsavedNow() };
};
const key = (h: HoldRef): string => h.id + '\u0000' + h.token;
/** Every hold of `now` is one `was` named (same record, same token). */
const within = (now: readonly HoldRef[], was: readonly HoldRef[]): boolean => {
  const seen = new Set(was.map(key));
  return now.every((h) => seen.has(key(h)));
};
/** A hold of `now` that is a send still out where `was` named it without that (same record, same token). */
const newlySending = (now: readonly HoldRef[], was: readonly HoldRef[]): boolean => {
  const sending = new Set(was.filter((h) => h.sending === true).map(key));
  return now.some((h) => h.sending === true && !sending.has(key(h)));
};
/** Every ask of `now` is one `was` showed, as the same record (an ask that moved on is a new one to show). */
const asksWithin = (now: readonly ScriptAsk[], was: readonly ScriptAsk[]): boolean =>
  now.every((a) => was.some((b) => sameScriptAsk(a, b)));
/** More to warn about than `was` said: a hold it did not name, a hold it did not call a send still out, an unsaved
 *  preference it did not name, an ask it did not show as it is now, or more work running than it said. */
const moreThan = (now: Warning, was: Warning): boolean =>
  !within(now.holds, was.holds) || newlySending(now.holds, was.holds) || (now.saving && !was.saving) || !asksWithin(now.asks, was.asks)
  || now.running > was.running || now.unsaved.some((u) => !was.unsaved.includes(u));
const sameWarning = (a: Warning, b: Warning): boolean =>
  a.running === b.running && a.unsaved.length === b.unsaved.length && a.count === b.count && a.sending === b.sending && a.saving === b.saving && a.asks.length === b.asks.length && !moreThan(a, b) && !moreThan(b, a);

// Live sends a 'done' sign-out left stored, for a page that stays after it (the purge-failed panel). 0 otherwise.
let keptSends = 0;
const keptListeners = new Set<() => void>();
function setKeptSends(n: number): void {
  if (n === keptSends) return;
  keptSends = n;
  for (const fn of keptListeners) fn();
}
const subscribeKept = (fn: () => void) => {
  keptListeners.add(fn);
  return () => void keptListeners.delete(fn);
};
/** For the purge-failed panel: how many live sends the sign-out that led to it kept stored (0: none, or no such sign-out). */
export function useSendsKeptAtSignOut(): number {
  return useSyncExternalStore(subscribeKept, () => keptSends);
}

/** Every sign-out control calls this: it asks first while something is unresolved or unsaved, else signs out. */
export function requestSignOut(): void {
  if (inFlight || shown) return;
  setKeptSends(0);
  const account = accountNow();
  if (!account) {
    logout();
    return;
  }
  const w = warningNow(account);
  if ((w.count > 0 || w.saving || w.asks.length > 0 || w.running > 0 || w.unsaved.length > 0) && opener) opener(w, account);
  else logout();
}

export function SignOutConfirm() {
  const t = useStrings(strings);
  const [open, setOpen] = useState<{ warning: Warning; account: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Core's last answer when it was neither 'done' nor 'failed': a neutral note for 'changed' (a re-shown warning that
  // looks the same still says why nothing happened) or 'unknown' (the confirmed changes may already be forgotten).
  const [note, setNote] = useState<'changed' | 'unknown' | null>(null);
  // A press of this dialog dropped the questions it showed ('ok') and the person is still signed in.
  const [asksStopped, setAsksStopped] = useState(false);
  // Core says its forget ran over the shown changes, then refused the sign-out (work started meanwhile): they may be
  // forgotten. Said on its own line, and never "everything is confirmed", until the dialog closes.
  const [mayForgot, setMayForgot] = useState(false);
  // 'unknown' after a press whose warning showed no change: its words name no changes.
  const [unknownPlain, setUnknownPlain] = useState(false);
  // Bumped whenever the dialog closes: a forget that resolves after it ends changes nothing in the dialog (a 'done'
  // still records the sends it kept, for a page that stays: see confirm).
  const epoch = useRef(0);
  const changesVersion = useChangesVersion();
  const attemptsVersion = useAttemptsVersion();
  const asksVersion = useScriptAsksVersion();
  const runningNow = useLeaveCount();

  const close = () => {
    epoch.current += 1;
    inFlight = false;
    setShown(false);
    setOpen(null);
    setBusy(false);
    setFailed(false);
    setNote(null);
    setAsksStopped(false);
    setMayForgot(false);
    setUnknownPlain(false);
  };

  useEffect(() => {
    const fn: Opener = (warning, account) => {
      setShown(true);
      setFailed(false);
      setNote(null);
      setAsksStopped(false);
      setMayForgot(false);
      setUnknownPlain(false);
      setBusy(false);
      setOpen({ warning, account });
    };
    opener = fn;
    return () => {
      if (opener === fn) opener = undefined;
      epoch.current += 1;
      inFlight = false;
      setShown(false);
    };
  }, []);

  // Another account showing (or a sign-out starting) ends the dialog, even while its forget runs.
  const bound = open?.account;
  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    const off = subscribe(() => {
      if (accountNow() !== bound) close();
    });
    // A change before this subscription existed (between the ask and the first render) closes it too.
    if (accountNow() !== bound) close();
    return off;
  }, [isOpen, bound]);

  // The warning follows what is unresolved now. Not while a forget runs: it empties the count itself.
  useEffect(() => {
    if (!isOpen || busy) return;
    const reread = () => setOpen((o) => {
      if (!o || accountNow() !== o.account) return o; // another account's holds never show here (it closes)
      const w = warningNow(o.account);
      return sameWarning(w, o.warning) ? o : { ...o, warning: w };
    });
    reread();
    const timer = setInterval(reread, REREAD_MS);
    return () => clearInterval(timer);
  }, [isOpen, busy, changesVersion, attemptsVersion, asksVersion, runningNow]);

  const confirm = async () => {
    if (!open || inFlight) return;
    const account = open.account;
    if (accountNow() !== account) {
      close();
      return;
    }
    // More than the dialog said: show that first, with the same neutral line as core's 'changed'; this press signs
    // nothing out, and the person presses again for what they now see.
    const now = warningNow(account);
    if (moreThan(now, open.warning)) {
      setFailed(false);
      setNote('changed');
      setOpen({ ...open, warning: now });
      return;
    }
    const run = epoch.current;
    inFlight = true;
    setBusy(true);
    setFailed(false);
    setNote(null);
    // Live sends this press leaves stored: the shown ones the fresh read still calls sends still out. A shown send that
    // settled before the press is no longer one, and core removes it with the rest.
    const stillOut = new Set(now.holds.filter((h) => h.sending === true).map(key));
    const sending = open.warning.holds.filter((h) => h.sending === true && stillOut.has(key(h))).length;
    let result: 'done' | 'changed' | 'failed' | 'unknown' = 'failed';
    let dropped = false;
    let forgot = false;
    try {
      // Only `result` decides; the drop's answer only says whether the shown questions are still followed. An ask it
      // did not remove stays stored for this account.
      // Work started from this tab while core waits (the store lock, the forget) is asked about, never cut unwarned:
      // core reads this right before the sign-out and answers 'changed'.
      // Unsaved work a page names after the press (switch-guard.ts) counts the same way.
      const shownRunning = open.warning.running;
      const shownUnsaved = open.warning.unsaved;
      const r = await signOutForgettingAsks(account, open.warning.holds, open.warning.asks, {}, () => leaveCount() <= shownRunning && unsavedNow().every((u) => shownUnsaved.includes(u)));
      result = r.result;
      forgot = r.forgot === true;
      dropped = r.asksDropped === 'ok' && open.warning.asks.length > 0;
    } catch {
      result = 'failed';
    }
    // Signed out with live sends shown and still out at the press: they stay stored. Recorded before the epoch check, since the sign-out itself
    // closes the dialog (no account while it runs), for a page that stays after it.
    if (result === 'done') setKeptSends(sending);
    if (epoch.current !== run) return; // closed meanwhile (an account switch, the sign-out starting): the flow is over
    // Signed out: the page normally leaves; when it cannot (a failed purge shows its own retry panel), close here.
    // Refused because another account shows now: nothing failed for this one, so just close.
    if (result === 'done' || accountNow() !== account) {
      close();
      return;
    }
    // Still signed in: no purge, no navigation. Sign out can be pressed again.
    inFlight = false;
    setBusy(false);
    if (dropped) setAsksStopped(true);
    setUnknownPlain(result === 'unknown' && open.warning.count === 0);
    if (result === 'changed' || result === 'unknown') {
      // 'changed': something the dialog did not show (nothing was forgotten, or, for work that started while core
      // forgot, only what the person confirmed). 'unknown': what the person confirmed may already be forgotten. Either way show what is there now; the next press decides.
      setFailed(false);
      setNote(result);
      if (forgot) setMayForgot(true);
      setOpen({ account, warning: warningNow(account) });
      return;
    }
    setFailed(true);
  };

  const w = open?.warning ?? { count: 0, sending: 0, saving: false, asks: [], running: 0, unsaved: [] };
  const changes = w.count > 0;
  const asks = w.asks.length;
  // What a sign-out forgets: every shown hold but the sends still out, which core keeps (named in their own line).
  const forgets = w.count - w.sending;
  const title = changes ? t('signout.title') : w.running > 0 ? t('leave.title') : w.unsaved.length > 0 ? t('leave.unsavedTitle') : w.saving ? t('signout.savingTitle') : asks > 0 ? t('signout.asksTitle') : t('signout.plainTitle');
  // What the person is told before the press, one sentence per thing at stake. One sentence is the dialog's body; more
  // are the confirm's list of consequences, so several warnings never stack as paragraphs.
  const lines: string[] = [
    ...(changes ? [t('signout.body', { count: w.count }) + (forgets > 0 ? ' ' + (forgets === w.count ? t('signout.forgetAll', { count: w.count }) : t('signout.forgetSome', { count: forgets })) : '')] : []),
    ...(w.running > 0 ? [t('leave.body', { count: w.running })] : []),
    ...w.unsaved,
    ...(w.sending > 0 ? [t('signout.sending', { count: w.sending })] : []),
    ...(w.saving ? [t('signout.stillSaving')] : []),
    ...(asks > 0 ? [t('signout.asks', { count: asks })] : []),
    ...(asksStopped ? [t('signout.asksStopped')] : []),
    ...(mayForgot ? [t('signout.mayForgot')] : []),
  ];
  if (lines.length === 0 && note !== 'unknown') lines.push(t('signout.plainBody'));
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={(o) => {
        // A close the dialog asks for (Cancel, Esc, the scrim, a context end). While a forget runs only the end of
        // the bound account closes it, so a page that is leaving never shows a stale failure.
        if (!o && (!busy || accountNow() !== bound)) close();
      }}
      overlayId="sign-out"
      title={title}
      body={lines.length === 1 ? lines[0] : undefined}
      consequences={lines.length > 1 ? lines : undefined}
      confirmLabel={t('signout.confirm')}
      tone="danger"
      busy={busy}
      onConfirm={() => void confirm()}
    >
      {note && <p role="status">{t(note === 'changed' ? 'signout.changed' : unknownPlain ? 'signout.unknownPlain' : 'signout.unknown')}</p>}
      {failed && <ErrorState size="compact" title={changes ? t('signout.forgetFailed') : t('signout.failed')} />}
    </ConfirmDialog>
  );
}
