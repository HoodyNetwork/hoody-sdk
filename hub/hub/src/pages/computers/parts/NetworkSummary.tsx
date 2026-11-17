// Network tab, "At a glance": three facts read from the same queries the sections below show
// (one query key each, so no second fetch): whether internet access is blocked, where traffic leaves from, and how many
// firewall rules there are. Anything not read whole says "Can't tell", never a guess: a failed or partial rules read
// gives no count and no access state.
import { AnatomySection, Facts, InfoTip, Meter, useStrings, type Fact } from '@kit';
import { useFirewall } from '../firewall.data';
import type { Computer } from '../types';
import { useExitGlance, type ExitGlance } from './ExitIp';
import { accessPill } from './Firewall';
import fwStrings from './Firewall.strings.en.json';
import { noInternetState } from './NoInternet.logic';
import strings from './Network.strings.en.json';
import s from './parts.module.css';

export function NetworkSummary({ c }: { c: Computer }) {
  const t = useStrings(strings);
  const tf = useStrings(fwStrings);
  const q = useFirewall(c.id, !!c.id);
  const exit = useExitGlance(c);
  const l = q.isError ? undefined : q.data;
  const whole = !!l && l.unreadable === 0;
  const access = q.isPending ? t('glance.reading') : q.isError || !l ? t('glance.cantTell') : tf(accessPill(noInternetState(l)).key);
  // Rules used of the computer's limit (the API's rule_count / max_rules), with a Meter; the count alone when the limit is
  // not given. Only when every rule was read (a partial read counts nothing); then the API's count when it gives
  // one, else the rules read.
  const count = whole && l ? (l.count ?? l.ingress.length + l.egress.length) : null;
  // As the Backups glance shows its kept count: the words, then the meter.
  const used = count !== null && l?.maxRules ? t('glance.fw.max', { count, max: l.maxRules }) : '';
  const rules = q.isPending ? (
    t('glance.reading')
  ) : count === null ? (
    t('glance.cantTell')
  ) : l?.maxRules ? (
    <span className={s.meterFact}>
      {used}
      <Meter value={(count / l.maxRules) * 100} label={t('glance.fw.meter', { count, max: l.maxRules })} />
    </span>
  ) : (
    t('glance.fw.count', { count })
  );
  const items: Fact[] = [
    { label: t('glance.access'), value: <InfoTip text={t('glance.access.tip', { name: c.name })} subject="">{access}</InfoTip> },
    // Wide: the exit's address (a proxy URL, a host and port) is the longest value and must not be split mid-word.
    { label: t('glance.exit'), value: <InfoTip text={t('glance.exit.tip', { name: c.name })} subject="">{exitWords(exit, c.name, t)}</InfoTip>, wide: true },
    { label: t('glance.fw'), value: <InfoTip text={t('glance.fw.tip', { name: c.name })} subject="">{rules}</InfoTip> },
  ];
  return (
    <AnatomySection id="net-glance" title={t('glance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={2} label={t('glance.title')} />
    </AnatomySection>
  );
}

type T = ReturnType<typeof useStrings<typeof strings>>;
function exitWords(e: ExitGlance, name: string, t: T): string {
  switch (e.kind) {
    case 'reading': return t('glance.reading');
    case 'stopped': return t('glance.exit.stopped', { name });
    case 'noAddress': return t('glance.exit.noAddress');
    case 'unknown': return t('glance.cantTell');
    case 'direct': return t('glance.exit.direct', { name });
    case 'via': return !e.label ? t('glance.exit.unnamed') : e.down ? t('glance.exit.down', { proxy: e.label }) : e.unsure ? t('glance.exit.unsure', { proxy: e.label }) : e.label;
  }
}
