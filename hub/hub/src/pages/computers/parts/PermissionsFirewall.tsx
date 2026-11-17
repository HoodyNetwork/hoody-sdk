// Permissions tab, the Firewall reminder: permissions decide who may open programs through their web addresses, the
// firewall decides which traffic reaches the computer at all. Read only: the same query as the Network tab (one
// cache entry, no second fetch while both are fresh), four facts, and one action that shows the Network tab with its
// Firewall section in view. Anything not read whole says "Can't tell", never a count. Nothing is read (and no fact
// is claimed) for a computer whose server is gone, or with a sign-in that may not read firewalls.
import { useCan } from '@core';
import { AnatomySection, Band, Facts, useGo, useStrings, type Fact } from '@kit';
import { useFirewall } from '../firewall.data';
import { links } from '../links';
import { handleOf } from '../logic';
import type { Computer } from '../types';
import { accessPill } from './Firewall';
import fwStrings from './Firewall.strings.en.json';
import type { FwList } from './Firewall.logic';
import { permissionsFrozen } from './AccessDrawer';
import { noInternetState } from './NoInternet.logic';
import netStrings from './Network.strings.en.json';
import strings from './AccessDrawer.strings.en.json';

/** The enabled inbound rules that turn traffic away (Block or Refuse), or null when a rule could not be read. */
export function blockingInbound(l: FwList): number | null {
  if (l.unreadable > 0) return null;
  return l.ingress.filter((r) => r.action !== 'allow' && r.state === 'enabled').length;
}

export function PermissionsFirewall({ c }: { c: Computer }) {
  const t = useStrings(strings);
  const tf = useStrings(fwStrings);
  const tn = useStrings(netStrings);
  const go = useGo();
  const may = useCan('resources.firewalls');
  const gone = permissionsFrozen(c) !== undefined;
  const on = may && !gone;
  const q = useFirewall(c.id, on && !!c.id);
  // A failed or paused read proves nothing (what is cached may be old): every fact then says so.
  const l = q.isError || q.fetchStatus === 'paused' ? undefined : q.data;
  const reading = q.isPending && q.fetchStatus !== 'paused';
  const whole = !!l && l.unreadable === 0;
  const count = whole && l ? (l.count ?? l.ingress.length + l.egress.length) : null;
  const blocking = l ? blockingInbound(l) : null;
  const say = (v: string | null) => (reading ? t('perm.fw.reading') : (v ?? t('perm.fw.cantTell')));
  const items: Fact[] = [
    { label: t('perm.fw.internet'), value: say(l ? tf(accessPill(noInternetState(l)).key) : null) },
    { label: t('perm.fw.rules'), value: say(count === null ? null : l?.maxRules ? tn('glance.fw.max', { count, max: l.maxRules }) : tn('glance.fw.count', { count })) },
    { label: t('perm.fw.blocking'), value: say(blocking === null ? null : blocking === 0 ? t('perm.fw.blocking.none') : t('perm.fw.blocking.count', { count: blocking })) },
    // A constant of the firewall, said because people expect the opposite: what no rule matches gets through.
    // Only beside rules read whole: next to "Can't tell" it would read as "nothing is blocked".
    ...(whole ? [{ label: t('perm.fw.unmatched'), value: t('perm.fw.unmatched.value') }] : []),
  ];
  // No facts for a gone server or a sign-in that may not read firewalls: one calm line says which.
  const off = gone ? t('perm.fw.gone', { name: c.name }) : !may ? t('perm.fw.cant') : null;
  return (
    <AnatomySection
      id="perm-firewall"
      title={t('perm.fw.title')}
      description={t('perm.fw.lede', { name: c.name })}
      {...(on ? { actions: { secondary: [{ id: 'open-firewall', label: t('perm.fw.open'), icon: 'chevron-right' as const, onPress: () => go(links.firewall(handleOf(c))) }] } } : {})}
      {...(off ? { notices: <Band size="table" /* noDetails: why no firewall facts show, not a rejection */>{off}</Band> } : {})}
      state={{ kind: 'ready' }}
    >
      {on ? <Facts items={items} columns={2} label={t('perm.fw.title')} /> : null}
    </AnatomySection>
  );
}
