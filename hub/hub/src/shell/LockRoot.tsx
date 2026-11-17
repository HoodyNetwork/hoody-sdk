// The lock host's React root: app/main.tsx renders it into `#hub-lock-host`, a
// body child outside the app root, so the lock screen and its panels show while every other body child is hidden.
// It also owns the locked tab title: always mounted, so "Locked · Hub" never waits for a page (an unmatched route, a
// page chunk still loading); PageFrame keeps the title while locked and sets its own page's title at unlock.
import { useEffect, useRef } from 'react';
import { useStrings } from '@kit/strings';
import { useLocked } from '@core/shell';
import { LockNotices } from './LockNotices';
import { LockScreen } from './LockScreen';
import strings from './strings.en.json';

/** "Locked · Hub" while locked; at unlock the title from before, unless a page has set its own since. */
export function LockTitle() {
  const t = useStrings(strings);
  const locked = useLocked();
  const before = useRef<string | null>(null);
  useEffect(() => {
    const lockTitle = t('lock.tabTitle');
    if (locked) {
      if (document.title !== lockTitle) before.current = document.title;
      document.title = lockTitle;
      return;
    }
    if (before.current !== null && document.title === lockTitle) document.title = before.current;
    before.current = null;
  }, [locked, t]);
  return null;
}

export function LockRoot() {
  return (
    <>
      <LockTitle />
      <LockScreen>
        <LockNotices />
      </LockScreen>
    </>
  );
}
