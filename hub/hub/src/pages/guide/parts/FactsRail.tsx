// "On this computer": the facts that fill the commands and addresses on the page, as the kit's Facts. A value that
// names something links to it. Unknown is never shown as "none": a failed read says so and offers a retry. In a narrow
// frame the rail is one fold titled by its summary ("atlas · Running · Acme client") that opens the same facts.
import { Disclosure, ErrorState, Facts, Skeleton, StatusPill, useStrings, type Fact } from '@kit';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import strings from '../strings.en.json';
import { computerHandle } from '@core';
import type { GuideFacts } from '../logic';
import s from './guide.module.css';

interface Props {
  facts: GuideFacts | undefined;
  failed: boolean;
  onRetry: () => void;
}

export function FactsRail({ facts, failed, onRetry }: Props) {
  const t = useStrings(strings);
  const c = facts?.computer;
  const realm = facts ? (facts.realm.all ? t('rail.allRealms') : facts.realm.name) : '';
  const items: Fact[] = facts
    ? [
        c ? { label: t('rail.computer'), value: c.name, href: computers.item(computerHandle(c)) } : { label: t('rail.computer'), value: t('rail.pick'), href: computers.list },
        ...(c ? [{ label: t('rail.state'), value: <StatusPill tone={c.running ? 'ok' : 'neutral'} dot>{t(c.running ? 'rail.running' : 'rail.stopped')}</StatusPill> }] : []),
        { label: t('rail.realm'), value: realm },
        ...(c?.serverName ? [{ label: t('rail.server'), value: `${c.flag ? `${c.flag} ` : ''}${c.serverName}`, href: computers.servers }] : []),
        { label: t('rail.botLabel'), value: facts.botLabel ?? t('rail.makeBot'), href: bots.list },
      ]
    : [];
  return (
    <aside className={s.rail} aria-label={t('rail.title')}>
      <h2 className={s.railTitle}>{t('rail.title')}</h2>
      <p className={s.railNote}>{t('rail.explain')}</p>
      {failed ? (
        <ErrorState size="compact" title={t('rail.unknown')} onRetry={onRetry} />
      ) : !facts ? (
        <Skeleton variant="rows" rows={3} />
      ) : (
        <>
          {/* The sheet shows one of the two by the frame's width, so the facts are never in the page twice. */}
          <div className={s.railFold}>
            <Disclosure level={3} title={t('phone.facts', { computer: c ? c.name : t('rail.pick'), state: c ? t(c.running ? 'rail.running' : 'rail.stopped') : '-', realm })}>
              <Facts items={items} columns={1} />
            </Disclosure>
          </div>
          <div className={s.railFacts}>
            <Facts items={items} columns={3} />
          </div>
        </>
      )}
    </aside>
  );
}
