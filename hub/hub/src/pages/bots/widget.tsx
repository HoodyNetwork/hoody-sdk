// Home widget "Bots": the Bots that need you first, then the busiest, in 32 px rows with a status
// pill, and Review on a Bot that waits. Empty and failing bodies are one line with one action. A row names its
// computer (and realm) when the name alone would not say which Bot it is (botDisplayName).
import { Button, EmptyState, ErrorState, Skeleton, TextButton, WidgetList, WidgetRow, useGo, useStrings } from '@kit';
import { useBots, useComputers } from './data';
import { botDisplayName, widgetRows } from './logic';
import { links } from './links';
import { STATUS_TONE } from './parts/Bits';
import strings from './strings.en.json';

export default function BotsWidget() {
  const t = useStrings(strings);
  const go = useGo();
  const bots = useBots();
  const computers = useComputers();
  // Only the Bots read gates the body: a computers read still running (or one that never ends) leaves a row its computer
  // name to come, never hidden behind the skeleton (botDisplayName names an unnamed computer by its id's last four).
  if (bots.isPending) return <Skeleton variant="widget" />;
  if (bots.isError) return <ErrorState size="compact" title={t('widget.error')} onRetry={() => void bots.refetch()} />;
  const all = bots.data ?? [];
  const rows = widgetRows(all, 5);
  const nameOf = (id: string) => computers.data?.find((c) => c.id === id)?.name;
  const label = (r: (typeof all)[number]) => {
    const d = botDisplayName(r, all, nameOf);
    return d.realm !== undefined ? t('widget.nameOnIn', { name: d.name, computer: d.computer, realm: d.realm }) : d.computer !== undefined ? t('widget.nameOn', { name: d.name, computer: d.computer }) : d.name;
  };
  if (rows.length === 0)
    return <EmptyState size="compact" icon="bot" title={t('widget.empty')} action={<TextButton onPress={() => go(links.newBot())}>{t('action.new')}</TextButton>} />;
  return (
    <WidgetList label={t('title')}>
      {rows.map((r) => (
        <WidgetRow
          key={r.key}
          label={label(r)}
          href={links.item(r.key)}
          tone={STATUS_TONE[r.status]}
          pill={{ tone: STATUS_TONE[r.status], text: r.status === 'queued' ? t('status.queuedN', { count: r.queued }) : t(`status.${r.status}`) }}
          action={
            r.status === 'waiting' ? (
              <Button size="sm" onPress={() => go(links.item(r.key))}>
                {t('widget.review')}
              </Button>
            ) : undefined
          }
        />
      ))}
    </WidgetList>
  );
}
