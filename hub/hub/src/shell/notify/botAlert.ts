// The Bot waiting alert: once in the shell, off the Bots badge's count (core useBotsWaitingRead), so it works on
// every page. botWaitRose(seen, scope, count): the count rose since the last known count of the same scope (account and
// realm). A first known count, a new scope, or a count not known re-baselines and never alerts, so Bots already waiting
// when the Hub opens, or in a realm switched to, never alert. useBotWaitingAlert hands notifyAlert one 'bot' alert per
// rise, with fixed words (never a Bot's name or question); notifyAlert does nothing unless alerts are on and the tab is away.
import { useEffect, useRef } from 'react';
import { useStrings } from '@kit/strings';
import strings from '../strings.en.json';
import { notifyAlert } from './alert';

export interface WaitSeen { scope: string; count: number | undefined }

export function botWaitRose(seen: WaitSeen | null, scope: string, count: number | undefined): boolean {
  return seen !== null && seen.scope === scope && seen.count !== undefined && count !== undefined && count > seen.count;
}

export function useBotWaitingAlert(count: number | undefined, scope: string): void {
  const t = useStrings(strings);
  const seen = useRef<WaitSeen | null>(null);
  useEffect(() => {
    const rose = botWaitRose(seen.current, scope, count);
    seen.current = { scope, count };
    if (rose) void notifyAlert('bot', { title: t('alert.botTitle'), body: t('alert.botBody'), tag: 'waiting', to: '/bots' });
  }, [count, scope, t]);
}
