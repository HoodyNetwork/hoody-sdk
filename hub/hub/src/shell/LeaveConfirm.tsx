// The dialog core's askLeave() opens before a realm switch commits while work runs from this tab
// (core/leave.ts, core/realm.ts; a sign-out names running work in its own warning instead, signOut.tsx). Stay (Cancel,
// Esc, the scrim) keeps everything as it is; Go on anyway lets the switch go on, and the running work is cut by its own
// context end ("may have gone through" until checked). One question at a time: a second ask while the dialog is up joins
// it and gets the same answer. Unmounting answers Stay, so nothing waits forever. A caller whose own `wanted` check
// turns false (its switch was cancelled or superseded) is answered Stay alone on the next core change, and the dialog
// closes once no caller still wants it. While the sign-out confirm is up the question
// waits and shows once it closes (one dialog at a time). Each question captures core's context when it is asked; once
// that context is dead (a sign-out here or in another tab, another account, a session gone) it answers Stay, shown or
// not: the switch it was for is over.
// The dialog shows the count as it is now; once nothing runs any more it closes and answers go on (askLeave's answer
// when nothing runs), so it never says finished work is still running.
// Unsaved work a page registered (core switch-guard.ts: a New script draft) asks too: each guard's sentence is
// shown. Guards are read, not pushed, so a waiting question re-reads them when one comes or goes, every second, and
// when the sign-out confirm closes. Go on anyway confirms only what was shown: a press that finds a sentence not yet
// shown shows it instead and answers nothing; an answer records the shown sentences (noteLossesConfirmed) for the
// switch's own last check. Once nothing runs and no guard names anything, a waiting question settles as above: its
// context and each caller's `wanted` first (Stay), then go on.
import { useCallback, useEffect, useRef, useState } from 'react';
import { alive, capture, leaveCount, noteLossesConfirmed, onSwitchGuards, setLeaveAsker, switchLosses, useLeaveCount, type Ctx } from '@core';
import { subscribe } from '@core/shell';
import { ConfirmDialog } from '@kit/overlays/Dialog';
import { useStrings } from '@kit/strings';
import strings from './strings.en.json';
import { useSignOutShowing } from './signOut';

/** How often a waiting question re-reads the guards (their answers change without telling). */
const REREAD_MS = 1000;

export function LeaveConfirm() {
  const t = useStrings(strings);
  // True while a question waits for its answer.
  const [asking, setAsking] = useState(false);
  const running = useLeaveCount();
  const signOutShowing = useSignOutShowing();
  type Waiter = { resolve: (ok: boolean) => void; wanted?: () => boolean };
  const pending = useRef<{ waiters: Waiter[]; ctx: Ctx } | null>(null);
  // What the question would lose besides running work, as the guards said it at the last read: what the dialog shows.
  const [losses, setLosses] = useState<readonly string[]>([]);

  // These read only refs, setters and core, so they stay the same across renders (the effects below depend on them).
  const answer = useCallback((ok: boolean) => {
    const p = pending.current;
    pending.current = null;
    setAsking(false);
    for (const w of p?.waiters ?? []) w.resolve(ok);
  }, []);

  useEffect(() => {
    const off = setLeaveAsker((_n, wanted) => {
      let resolve!: (ok: boolean) => void;
      const promise = new Promise<boolean>((r) => { resolve = r; });
      if (pending.current) pending.current.waiters.push({ resolve, wanted });
      else { pending.current = { waiters: [{ resolve, wanted }], ctx: capture() }; setAsking(true); }
      return promise;
    });
    return () => {
      off();
      const p = pending.current;
      pending.current = null;
      // The question this registration owned ends here (an effect replay too): no dialog stays up without one.
      setAsking(false);
      for (const w of p?.waiters ?? []) w.resolve(false);
    };
  }, []);

  // Each caller that no longer wants its answer gets Stay now; with none left the question closes.
  const prune = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    const stillWanted = (w: Waiter): boolean => { if (!w.wanted) return true; try { return w.wanted() === true; } catch { return false; } };
    const gone = p.waiters.filter((w) => !stillWanted(w));
    if (gone.length === 0) return;
    p.waiters = p.waiters.filter((w) => !gone.includes(w));
    for (const w of gone) w.resolve(false);
    if (p.waiters.length === 0) { pending.current = null; setAsking(false); }
  }, []);
  // Context and callers first (Stay); then, with nothing running and nothing named, go on.
  const settle = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    if (!alive(p.ctx)) { answer(false); return; }
    prune();
    if (pending.current && leaveCount() === 0 && switchLosses().length === 0) answer(true);
  }, [answer, prune]);
  const reread = useCallback(() => {
    if (!pending.current) return;
    const now = switchLosses();
    setLosses((was) => (was.length === now.length && was.every((l, i) => l === now[i]) ? was : now));
    settle();
  }, [settle]);

  useEffect(() => {
    if (asking && running === 0) settle();
  }, [asking, running, settle]);

  // The guards' answers while a question waits (also hidden behind the sign-out confirm, and when that closes).
  useEffect(() => {
    if (!asking) { setLosses([]); return; }
    reread();
    const off = onSwitchGuards(reread);
    const timer = setInterval(reread, REREAD_MS);
    return () => { off(); clearInterval(timer); };
  }, [asking, signOutShowing, reread]);

  // A waiting question ends with its context, also while hidden behind the sign-out confirm (the dialog's own
  // context-end close listens only while it is open); a caller whose switch is over is answered on the same changes.
  useEffect(() => {
    const ctx = pending.current?.ctx;
    if (!asking || !ctx) return;
    const check = () => { if (!alive(ctx)) answer(false); else prune(); };
    check();
    if (!pending.current) return;
    return subscribe(check);
  }, [asking, answer, prune]);

  // Go on anyway: only for what is shown. A sentence named since the last read is shown first; the press answers nothing.
  const confirm = () => {
    const now = switchLosses();
    if (now.some((l) => !losses.includes(l))) { setLosses(now); return; }
    noteLossesConfirmed(losses);
    answer(true);
  };

  return (
    <ConfirmDialog
      isOpen={asking && (running > 0 || losses.length > 0) && !signOutShowing}
      onOpenChange={(o) => { if (!o) answer(false); }}
      title={running > 0 ? t('leave.title') : t('leave.unsavedTitle')}
      body={
        <>
          {running > 0 && <p>{t('leave.body', { count: running })}</p>}
          {losses.map((l, i) => <p key={i}>{l}</p>)}
        </>
      }
      confirmLabel={t('leave.confirm')}
      cancelLabel={t('leave.stay')}
      tone="danger"
      onConfirm={confirm}
    />
  );
}
