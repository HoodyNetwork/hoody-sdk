// The passcode lock screen. It renders in `#hub-lock-host`, its own
// React root (app/main.tsx), and shows only while this tab is locked.
// - No account name, email, realm or computer: the title, one line, the field, Unlock and Forget.
// - Focus: the field takes focus at every lock. Nothing outside the host can take it: every other body child is
//   `display:none` and `inert` while locked (core/applock-host.ts), which is the containment.
// - An answer applies only to the lock it was asked under: a check that comes back after the tab locked again (or
//   unlocked) changes nothing on the screen but the "Locked again" line.
// - Forgot → a confirm portalled into the host (kit Dialog `portalContainer`), then forgetHere(); 'failed' stays here
//   with the purge message and Try again. The terminal path (10th wrong, `out` at load) runs in the engine; when its
//   Forget failed, the page is still here and the screen offers Try again (forgetHere({ terminal: true })). A stored
//   `out` (lockView().tries) shows that view too, so a reload whose boot terminal path failed reaches it unasked.
// - The countdown and the tries-left warning come only from the stored record (lockView().tries, shared by every tab of
//   the account; the engine tells this screen when another tab changes it): a reload or another tab's wrong try counts
//   down at once, and the warning from 3 left stays under the field during the wait and after it. This screen's own
//   answer adds only the words "Wrong passcode." (or check / locked again).
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@kit/controls/Button';
import { TextButton } from '@kit/controls/Link';
import { TextField } from '@kit/forms/fields';
import { BrandMark } from '@kit/data/BrandMark';
import { ConfirmDialog } from '@kit/overlays/Dialog';
import { useStrings } from '@kit/strings';
import { checkPasscode, forgetHere, lockHost, lockSettings, lockView, MAX_TRIES, useLockVersion, type CheckResult } from '@core/shell';
import strings from './strings.en.json';
import s from './LockScreen.module.css';

/** What the line under the field says. `forgetFailed`: a Forget (here or terminal) left data behind. */
type Line = { k: 'wrong' } | { k: 'wait' } | { k: 'check' } | { k: 'again' } | { k: 'forgetFailed'; terminal: boolean } | null;

/** m:ss, as in "Try again in 0:28". */
export function clock(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** How many tries are left before the terminal path, shown from 3 left (lock.screen.wrongLeft). */
function triesLeft(n: number): number | null {
  const left = MAX_TRIES - n;
  return left > 0 && left <= 3 ? left : null;
}

/** `children`: the lock notices (LockRoot), inside the screen so the Forgot confirm isolates them with the card. */
export function LockScreen({ children }: { children?: ReactNode } = {}) {
  const t = useStrings(strings);
  useLockVersion();
  const view = lockView();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<Line>(null);
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Each lock is its own episode: an answer from an earlier one is not shown as this one's.
  const episode = useRef(0);
  const wasLocked = useRef(view.locked);

  useEffect(() => {
    if (view.locked && !wasLocked.current) {
      episode.current += 1;
      setPass('');
      setBusy(false);
      setAsking(false);
      setLine((l) => (l && l.k === 'forgetFailed' ? l : null));
    }
    wasLocked.current = view.locked;
    if (view.locked) field.current = formRef.current?.querySelector('input') ?? null;
    if (view.locked && document.activeElement !== field.current) field.current?.focus({ preventScroll: true });
  }, [view.locked]);

  const stored = view.tries;
  const waitUntil = stored && !stored.out ? stored.until : 0;
  // Date.now() too: a stored wait can arrive long after the last tick set `now`.
  const at = Math.max(now, Date.now());
  const waiting = waitUntil > at;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waiting]);
  useEffect(() => {
    if (!waiting && line?.k === 'wait') setLine(null);
    // The field was disabled while waiting, which dropped its focus: give it back.
    if (!waiting && view.locked && document.activeElement === document.body) formRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [waiting, line, view.locked]);

  if (!view.locked) return null;

  const apply = (r: CheckResult): void => {
    switch (r.k) {
      case 'unlocked':
        setLine(null);
        return;
      // The count and the wait are in the stored record, which this render re-reads.
      case 'wrong':
        setLine({ k: 'wrong' });
        setNow(Date.now());
        return;
      case 'wait':
        setLine({ k: 'wait' });
        setNow(Date.now());
        return;
      case 'again':
        setLine({ k: 'again' });
        return;
      case 'terminal':
        // Still here: the engine's Forget did not finish (a 'purged' answer leaves the page).
        setLine({ k: 'forgetFailed', terminal: true });
        return;
      case 'cancelled':
        return;
      // removed / noWebLocks / noVerifier change the view (lockView); check and noSession: try again.
      default:
        setLine(r.k === 'check' || r.k === 'noSession' ? { k: 'check' } : null);
    }
  };

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    if (busy || waiting || !pass) return;
    const ep = episode.current;
    setBusy(true);
    const typed = pass;
    setPass('');
    let r: CheckResult;
    try {
      r = await checkPasscode(typed);
    } catch {
      r = { k: 'check' };
    }
    if (ep !== episode.current) return;
    setBusy(false);
    apply(r);
  };

  const forget = (terminal: boolean): void => {
    setAsking(false);
    if (forgetHere(terminal ? { terminal: true } : {}) === 'failed') setLine({ k: 'forgetFailed', terminal });
  };

  const digits = lockSettings()?.digits === true;
  const host = lockHost() ?? undefined;
  const forgetOnly = view.noWebLocks || view.record === 'malformed';
  const failed = line?.k === 'forgetFailed' ? line : stored?.out ? ({ k: 'forgetFailed', terminal: true } as const) : null;

  let message: string | null = null;
  if (failed) message = t('notice.purgeBody');
  else if (view.removed) message = t('lock.removedElsewhere');
  else if (view.noWebLocks) message = t('lock.noWebLocks');
  else if (view.record === 'malformed') message = t('lock.screen.noVerifier');
  else if (line?.k === 'check') message = t('lock.screen.check');
  else if (line?.k === 'again') message = t('lock.screen.again');
  else {
    // From 3 left, the stored count's warning, during a wait and after it; else this screen's own "Wrong passcode."
    const left = stored && !stored.out ? triesLeft(stored.n) : null;
    if (left !== null) message = t('lock.screen.wrongLeft', { count: left });
    else if (line?.k === 'wrong') message = t('lock.screen.wrong');
  }

  return (
    // While the Forgot confirm is open, everything behind it is inert: the host is a React Aria top layer, so the
    // confirm's own ariaHideOutside and focus containment skip the host and would leave the card reachable.
    <div className={s.screen} role="dialog" aria-modal="true" aria-labelledby="hub-lock-title" data-hub-lock-screen="" inert={asking || undefined}>
      <div className={s.card}>
        {/* The Hoody logo: the kit's brand (the sidebar's), the mark and the first word. */}
        <p className={s.brand} aria-hidden="true" data-hub-lock-brand="">
          <BrandMark hub={false} />
        </p>
        <h1 id="hub-lock-title" className={s.title}>
          {t('lock.screen.title')}
        </h1>
        {!forgetOnly && !view.removed && !failed && <p className={s.body}>{t('lock.screen.body')}</p>}
        {failed ? (
          <>
            <p className={s.error} role="alert">
              {message}
            </p>
            <Button variant="primary" onPress={() => forget(failed.terminal)}>
              {t('notice.tryAgain')}
            </Button>
          </>
        ) : view.removed ? (
          <>
            <p className={s.body} role="alert">
              {message}
            </p>
            <Button variant="primary" onPress={() => window.location.reload()}>
              {t('notice.reload')}
            </Button>
          </>
        ) : forgetOnly ? (
          <>
            <p className={s.body} role="alert">
              {message}
            </p>
            <Button variant="primary" onPress={() => setAsking(true)}>
              {t('lock.screen.forget')}
            </Button>
          </>
        ) : (
          <form ref={formRef} className={s.form} onSubmit={(e) => void submit(e)} noValidate>
            <TextField
              label={t('lock.field')}
              type="password"
              value={pass}
              onChange={setPass}
              isDisabled={waiting}
              autoComplete="off"
              inputMode={digits ? 'numeric' : undefined}
              className={s.field}
            />
            <p className={s.error} role="alert">
              {message}
            </p>
            <Button type="submit" variant="primary" isDisabled={busy || waiting || !pass} className={s.unlock}>
              {waiting ? t('lock.screen.wait', { time: clock(waitUntil - at) }) : t('lock.screen.unlock')}
            </Button>
            <p className={s.forgot}>
              <span>{t('lock.screen.forgotAsk')}</span> <TextButton onPress={() => setAsking(true)}>{t('lock.screen.forget')}</TextButton>
            </p>
          </form>
        )}
      </div>
      {children}
      <ConfirmDialog
        isOpen={asking}
        onOpenChange={setAsking}
        title={t('lock.forgot.title')}
        body={t('lock.forgot.body')}
        confirmLabel={t('lock.screen.forget')}
        tone="danger"
        onConfirm={() => forget(false)}
        portalContainer={host}
      />
    </div>
  );
}
