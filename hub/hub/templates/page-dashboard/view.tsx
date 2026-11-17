// The __ID__ page: a dashboard (layout `dashboard`). Widgets in reading order; each
// reads its own query and shows its own compact loading, empty and error state, so one failing
// read never blanks the page.
//
// The standard pieces, all from the kit:
//   DashboardPage + Widget     size s/m/l, a "View all ›" link to the page that holds everything
//   WidgetStat / WidgetList / WidgetRow / WidgetActions   the widget bodies
//   EmptyState / ErrorState size="compact"   one line plus one action inside a widget
//   Outcome                    an action's C9 line where the action was ("Check again" only reads)
import {
  Button,
  DashboardPage,
  EmptyState,
  ErrorState,
  Outcome,
  Skeleton,
  Sparkline,
  TextButton,
  Widget,
  WidgetActions,
  WidgetList,
  WidgetRow,
  WidgetStat,
  formatDateTime,
  useStrings,
  type Tone,
} from '@kit';
import { useState } from 'react';
import { type ItemStatus, useRecent, useRestartFailed, useStats } from './data';
import { links } from './links';
import { runsToday } from './logic';
import strings from './strings.en.json';

const TONE: Record<ItemStatus, Tone> = { active: 'ok', paused: 'neutral', failed: 'danger' };

export default function __PASCAL__Page() {
  const t = useStrings(strings);
  return (
    // No header primary: a dashboard has no create flow of its own; its action lives in a widget.
    <DashboardPage header={{ title: t('title'), subtitle: t('subtitle') }}>
      <RunningWidget />
      <FailedWidget />
      <RecentWidget />
    </DashboardPage>
  );
}

function RunningWidget() {
  const t = useStrings(strings);
  const stats = useStats();
  return (
    <Widget size="s" title={t('running.title')}>
      {stats.isPending ? (
        <Skeleton variant="widget" rows={1} />
      ) : !stats.data ? (
        <ErrorState size="compact" title={t('running.error')} onRetry={() => void stats.refetch()} retrying={stats.isFetching} />
      ) : stats.data.running === 0 ? (
        <EmptyState size="compact" icon="apps" title={t('running.empty')} />
      ) : (
        <WidgetStat
          value={stats.data.running}
          caption={t('running.caption', { count: runsToday(stats.data) })}
          chart={<Sparkline points={stats.data.perHour} label={t('running.chart')} />}
        />
      )}
    </Widget>
  );
}

/** The action widget: Restart failed, then its C9 outcome on the same widget. */
function FailedWidget() {
  const t = useStrings(strings);
  const stats = useStats();
  const restart = useRestartFailed();
  const [settled, setSettled] = useState<'done' | null>(null);
  const outcome = settled ?? restart.data?.outcome ?? (restart.isError ? 'failed' : undefined);
  // Check again only READS the figures: no failed runs left means the restart went through (done);
  // otherwise the line goes so the user can restart again. It never sends the restart itself.
  const check = async () => {
    const fresh = await stats.refetch();
    if (fresh.data && fresh.data.failed === 0) setSettled('done');
    else restart.reset();
  };
  return (
    <Widget size="s" title={t('failed.title')} tone={stats.data && stats.data.failed > 0 ? 'danger' : undefined}>
      {stats.isPending ? (
        <Skeleton variant="widget" rows={1} />
      ) : !stats.data ? (
        <ErrorState size="compact" title={t('failed.error')} onRetry={() => void stats.refetch()} retrying={stats.isFetching} />
      ) : stats.data.failed === 0 && outcome === undefined ? (
        <EmptyState size="compact" icon="check" title={t('failed.empty')} />
      ) : (
        <>
          <WidgetStat value={stats.data.failed} caption={t('failed.caption')} tone="danger" />
          <WidgetActions>
            <Button size="sm" icon="reload" busy={restart.isPending} isDisabled={outcome === 'pending'} onPress={() => {
                setSettled(null);
                restart.mutate();
              }}>
              {t('failed.restart')}
            </Button>
          </WidgetActions>
          <Outcome outcome={outcome} onCheck={check} wrap />
        </>
      )}
    </Widget>
  );
}

function RecentWidget() {
  const t = useStrings(strings);
  const recent = useRecent();
  return (
    <Widget size="m" title={t('recent.title')} viewAll={{ href: links.page, label: t('viewAll') }}>
      {recent.isPending ? (
        <Skeleton variant="widget" rows={4} />
      ) : !recent.data ? (
        <ErrorState size="compact" title={t('recent.error')} onRetry={() => void recent.refetch()} retrying={recent.isFetching} />
      ) : recent.data.length === 0 ? (
        <EmptyState size="compact" icon="clock" title={t('recent.empty')} action={<TextButton icon="plus">{t('recent.create')}</TextButton>} />
      ) : (
        <WidgetList label={t('recent.list')}>
          {recent.data.map((r) => (
            <WidgetRow key={r.id} label={r.name} tone={TONE[r.status]} meta={formatDateTime(r.updatedAt)} pill={{ tone: TONE[r.status], text: t(`status.${r.status}`) }} />
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}
