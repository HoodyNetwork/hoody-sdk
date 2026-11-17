// Passcode lock: one setting row. Off: Set a passcode. On: the timer line, Lock now,
// Change and Remove, and what the lock protects. The record belongs to core's engine (core/applock.ts): this section
// only reads it (lockSettings) and opens the sheet; it re-reads on this tab's lock changes and on another tab's write.
import { IDLE_LABEL } from './LockSection.pure';
export { IDLE_LABEL } from './LockSection.pure';
import { hostEnv, lockNow, lockSettings, lockSupport, lockView, useLockVersion } from '@core';
import { Button, FaqLink, SettingRow, useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { pageFaq } from '../faq';
import type { LockSheetMode } from '../logic';
import strings from '../strings.en.json';
import l from './Lock.module.css';

/** Re-render when another tab sets, changes or removes a passcode: on every storage event, since the record's key
 *  belongs to the engine alone; lockSettings() re-reads it. */
function useRecordVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    // hostEnv's external-change hook is the window 'storage' event on the web; absent (a no-op) where the host has none.
    return hostEnv().onExternalChange(() => setV((n) => n + 1));
  }, []);
  return v;
}

export function LockSection({ onOpen }: { onOpen: (mode: LockSheetMode) => void }) {
  const t = useStrings(strings);
  useLockVersion();
  useRecordVersion();
  const supported = lockSupport();
  const on = lockSettings();
  if (!on && lockView().record === 'malformed') {
    // A record this browser cannot read: no verifier, so nothing here can change or remove it (only Forget).
    return (
      <SettingRow label={t('lock.on')} help={t('lock.err.noVerifier')} actions={<Button onPress={() => void lockNow()}>{t('lock.now')}</Button>} />
    );
  }
  if (!on) {
    return (
      <SettingRow
        label={t('lock.off')}
        help={supported ? t('lock.offBody') : t('lock.err.unsupported')}
        actions={
          <Button isDisabled={!supported} onPress={() => onOpen('lock-set')}>
            {t('lock.set')}
          </Button>
        }
      />
    );
  }
  const time = t(IDLE_LABEL[on.idleMin]).toLowerCase();
  return (
    <>
      <SettingRow
        label={t('lock.on')}
        help={t(on.onLeave ? 'lock.onBodyLeave' : 'lock.onBody', { time })}
        actions={
          <>
            <Button onPress={() => void lockNow()}>{t('lock.now')}</Button>
            <Button onPress={() => onOpen('lock-change')}>{t('lock.change')}</Button>
            <Button onPress={() => onOpen('lock-remove')}>{t('lock.remove')}</Button>
          </>
        }
      />
      {/* The lock's one stated limit stays on the row; the whole explanation is the page FAQ's answer. */}
      <p className={l.help}>
        {t('lock.limit')} <FaqLink item={pageFaq(t).byId.lockProtects}>{t('lock.protects')}</FaqLink>
      </p>
    </>
  );
}
