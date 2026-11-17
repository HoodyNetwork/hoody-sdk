// Home widget "Notifications": the latest unread notices in 32 px rows (level dot, title, time; 44 px on a touch screen) and
// Mark all read, whose answer is the kit's Outcome (C9: an unknown one shows Check again, never a resend).
// Empty and failing bodies are one line with one action; a held Mark all read keeps Check again under it.
// A session the account's notices are not open to gets one line and no action.
import {
  EmptyState,
  ErrorState,
  Link,
  NotifyHint,
  OutcomeSlot,
  Skeleton,
  TextButton,
  WidgetActions,
  WidgetList,
  WidgetRow,
  formatRelative,
  useGo,
  useStrings,
} from '@kit';
import { useEffect, useRef, useState } from 'react';
import { type Severity, useAccountId, useMarkAllRead, useNotices, usePendingReadAll, useReadAllHolds } from './data';
import { readAllShown } from './logic';
import { ForgetReadAll } from './parts/ForgetReadAll';
import { links } from './links';
import strings from './strings.en.json';
import s from './widget.module.css';

const TONE = {
  INFO: 'info',
  SUCCESS: 'ok',
  WARNING: 'warn',
  ERROR: 'danger',
} as const satisfies Record<Severity, string>;
const SHOWN = 4;

export default function NotificationsWidget() {
  const t = useStrings(strings);
  const go = useGo();
  const unread = useNotices('unread');
  const markAll = useMarkAllRead();
  // The hold outlives this widget and any list read: core's, not this press's.
  const pending = usePendingReadAll();
  const holds = useReadAllHolds();
  const [failed, setFailed] = useState(false);
  // A failure line belongs to the account it was shown for.
  const account = useAccountId().data?.id;
  useEffect(() => setFailed(false), [account]);
  const shownFor = useRef(account);
  useEffect(() => {
    shownFor.current = account;
  }, [account]);

  if (unread.isPending) return <Skeleton variant="widget" />;
  // A shared-access (token) session: core refuses the account's notices unsent, so Try again could never work. The
  // line says where they are, as the page does, and offers no retry.
  const refused = unread.error?.code;
  const noAccess = refused === 'TOKEN_SESSION_REFUSED' || refused === 'TOKEN_LACKS';
  if (unread.isError && !unread.data) return <ErrorState size="compact" title={t(noAccess ? 'token.title' : 'widget.error')} onRetry={noAccess ? undefined : () => void unread.refetch()} />;
  const rows = unread.data?.rows ?? [];

  const markAllRead = async () => {
    setFailed(false);
    const pressedFor = account;
    const r = await markAll.run();
    // The answer is for the account it was pressed on: a refusal that lands after a switch shows nothing on the new one.
    if (shownFor.current !== pressedFor) return;
    setFailed(readAllShown(r) === 'failed');
  };

  const empty = (
    <>
      <EmptyState
        size="compact"
        icon="bell"
        title={t('widget.empty')}
        action={<TextButton onPress={() => go(links.archive)}>{t('archive')}</TextButton>}
      />
      <NotifyHint kind="bell" />
    </>
  );
  // An empty list does not end the hold: Check again (and Forget it) stay while it may have gone through.
  if (rows.length === 0 && !pending) return empty;

  return (
    <>
      {rows.length === 0 ? (
        empty
      ) : (
        <WidgetList label={t('title')}>
          {rows.slice(0, SHOWN).map((n) => (
            <WidgetRow
              key={n.id}
              label={
                // The kit row's own link is 20 px high; this one is a 44 px target on a touch screen.
                <Link href={links.item(n.id)} variant="plain" className={s.rowLink}>
                  <span className={s.rowText}>{n.title}</span>
                </Link>
              }
              tone={TONE[n.severity]}
              meta={n.at ? formatRelative(n.at) : undefined}
            />
          ))}
        </WidgetList>
      )}
      <WidgetActions>
        <OutcomeSlot
          outcome={pending ? 'pending' : failed ? 'failed' : null}
          detail={pending ? t('widget.markPending') : failed ? t('widget.markFailed') : undefined}
          onCheck={() => markAll.readBack()}
          onRetry={() => void markAllRead()}
          wrap
        >
          <TextButton className={s.markAll} isDisabled={markAll.running} onPress={() => void markAllRead()}>
            {t('readAll')}
          </TextButton>
        </OutcomeSlot>
        {pending && <ForgetReadAll holds={holds} onForget={markAll.forget} overlayId="notifications-widget-forget-all" />}
      </WidgetActions>
    </>
  );
}
