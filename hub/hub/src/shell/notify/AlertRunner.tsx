// Hosts the browser-alert engine for the shown account. The
// summary poller and the bounded unread read come from core (`coreSource`; tests pass their own);
// with no shown account the runner stays idle. Storage, permission and the native alert are the notifications page's browser helpers.
import { useEffect, useMemo, useRef } from 'react';
import { useGo } from '@kit/nav';
import { useStrings } from '@kit/strings';
import { notifyPaths } from './paths';
import strings from '../strings.en.json';
import { followPagePath, usePageLink } from '../pageLinks';
import { createAlertEngine, type EngineDeps } from './engine';
import { shownUid, useShownUid } from './uid';
import { capture } from '@core';
import { currentStatus, getChoice, isAway, notificationSummary, onNotificationSummary, readList, readUnreadSince, refreshNotificationSummary, setChoice, showAlert, type Seen } from '@core/shell';
import { hostEnv } from '@core/host-env';

export type NotificationSource = Pick<EngineDeps, 'summary' | 'refresh' | 'readSince'> & {
  /** Subscribe to new summaries; returns the unsubscribe. */
  onSummary: (l: () => void) => () => void;
};

function readSeen(uid: string): Seen | null {
  const raw = getChoice(uid, 'seen');
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { id?: unknown; at?: unknown };
    return v && typeof v.id === 'string' ? { id: v.id, at: typeof v.at === 'string' ? v.at : '' } : null;
  } catch {
    return null;
  }
}

/** Core's poller and unread read, bound to the context at read time. */
export const coreSource: NotificationSource = {
  summary: () => notificationSummary(),
  refresh: () => refreshNotificationSummary(),
  readSince: (older) => readUnreadSince(older, capture()),
  onSummary: (l) => onNotificationSummary(() => l()),
};

export function AlertRunner({ source = coreSource }: { source?: NotificationSource }) {
  const t = useStrings(strings);
  const go = useGo();
  // Read at click time: a new link object every render must not rebuild the engine.
  const inboxLink = usePageLink('notifications');
  const inbox = useRef(inboxLink);
  inbox.current = inboxLink;
  const uid = useShownUid();
  const engine = useMemo(() => {
    if (!source) return null;
    return createAlertEngine({
      shownUid,
      summary: source.summary,
      refresh: source.refresh,
      readSince: source.readSince,
      // No alert while this load hides Notifications: its click would have no inbox to open.
      alertsOn: (u) => inbox.current !== null && currentStatus(u).state === 'on',
      seen: readSeen,
      setSeen: (u, v) => void setChoice(u, 'seen', JSON.stringify(v)),
      shown: (u) => readList(u, 'shown'),
      setShown: (u, ids) => void setChoice(u, 'shown', JSON.stringify(ids)),
      hidden: () => !hostEnv().visible(),
      away: () => isAway(),
      show: (a) => void showAlert(a),
      openInbox: (u) => {
        if (shownUid() === u) followPagePath(inbox.current, notifyPaths.inbox, go);
      },
      text: {
        untitled: t('alert.untitled'),
        body: t('alert.body'),
        many: (n) => t('alert.many', { n }),
        manyMore: (n) => t('alert.manyMore', { n }),
      },
    });
  }, [source, go, t]);

  useEffect(() => {
    if (!engine || !source || !uid) return;
    engine.start(uid);
    const off = source.onSummary(engine.handle);
    // Through the host env (web: the document's visibility; terminal: the host's), never `document` itself.
    const offVis = hostEnv().onVisibilityChange(() => engine.visibility());
    return () => {
      off();
      offVis();
      engine.stop();
    };
  }, [engine, source, uid]);

  return null;
}
