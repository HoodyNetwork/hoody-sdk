// The lifecycle panels the lock host shows while this tab is locked. The shell's
// CoreNotices renders inside the hidden app root, so a sign-out whose purge failed, or a suspension, would be invisible
// behind the lock. These are the same messages, sanitised: no page links, no page content, no kept-send counts.
// - purge-failed (a sign-out's, a token session's, or the one a live boot ended in): the purge message and Try again,
//   which runs the same retry as CoreNotices (logout() again, or the token session's end with its own reason).
// - suspended (mid-session or at boot): the title and body only; its links and Sign out are on the app's screen,
//   reached after unlock (a sign-out here would skip the shell's kept-sends warning, which renders in the app root).
// A boot panel reaches this module through setLockBootPanel (app/core-boot.ts, beside showBootPanel), so a page that
// boots both locked and purge-failed shows it at once.
import { useEffect, useState } from 'react';
import { Button } from '@kit/controls/Button';
import { useStrings } from '@kit/strings';
import { useCore } from '@core';
import { endTokenSession, logout, onLifecycle, useLocked, type LifecycleEvent, type TokenPanel } from '@core/shell';
import strings from './strings.en.json';
import s from './LockScreen.module.css';

type TokenAgain = Extract<TokenPanel, { panel: 'purgeFailed' }>['again'];
type Panel = { kind: 'suspended' } | { kind: 'purge-failed'; again?: TokenAgain } | null;

let bootPanel: Panel = null;
const bootListeners = new Set<() => void>();

/** For app/core-boot.ts: the purge-failed result a live boot ended in (other results show nothing here). */
export function setLockBootPanel(result: { state: string; again?: TokenAgain }): void {
  if (result.state !== 'purge-failed') return;
  bootPanel = result.again ? { kind: 'purge-failed', again: result.again } : { kind: 'purge-failed' };
  for (const l of [...bootListeners]) l();
}

/** Tests. */
export function resetLockNoticesForTests(): void {
  bootPanel = null;
}

/** Follows core's lifecycle from module load on: a panel sent while the host root is not mounted yet is kept. */
let lastPanel: Panel = null;
const panelListeners = new Set<() => void>();
onLifecycle((e: LifecycleEvent) => {
  let next: Panel | undefined;
  if (e.kind === 'suspended') next = { kind: 'suspended' };
  else if (e.kind === 'purge-failed') next = { kind: 'purge-failed' };
  else if (e.kind === 'token-panel' && e.panel === 'purgeFailed') next = { kind: 'purge-failed', again: e.again };
  if (next === undefined) return;
  lastPanel = next;
  for (const l of [...panelListeners]) l();
});

export function LockNotices() {
  const t = useStrings(strings);
  const locked = useLocked();
  const [, render] = useState(0);
  useEffect(() => {
    const l = () => render((n) => n + 1);
    bootListeners.add(l);
    panelListeners.add(l);
    return () => {
      bootListeners.delete(l);
      panelListeners.delete(l);
    };
  }, []);
  const banned = useCore().identity?.banned === true;
  const shown: Panel = lastPanel ?? bootPanel ?? (banned ? { kind: 'suspended' } : null);
  if (!locked || !shown) return null;
  const suspended = shown.kind === 'suspended';
  return (
    <div className={s.notice} role="alert" data-hub-lock-notice={shown.kind}>
      <p className={s.noticeTitle}>{suspended ? t('notice.suspendedTitle') : t('notice.purgeTitle')}</p>
      <p className={s.body}>{suspended ? t('notice.suspendedBody') : t('notice.purgeBody')}</p>
      {!suspended && (
        <Button variant="secondary" size="sm" onPress={() => (shown.again ? endTokenSession(shown.again) : logout())}>
          {t('notice.tryAgain')}
        </Button>
      )}
    </div>
  );
}
