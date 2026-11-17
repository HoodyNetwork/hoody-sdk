// The summary above the full-width list: computers by state, servers, and the slots left (kit StatStrip, 56 px). The slots
// item carries the room upgrade.
import { StatStrip as KitStatStrip, UpgradeLink, useStrings } from '@kit';
import { links as billingLinks } from '../../billing/links';
import { serverKey, serverLabel, stripSplit } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Server } from '../types';
import { slotsOf, slotsUpgrade } from './upgrade';

export function StatStrip({ computers, servers }: { computers: Computer[]; servers: Server[] | undefined }) {
  const t = useStrings(strings);
  const names = new Set(computers.map((c) => serverLabel(c).name || serverKey(c)));
  const up = slotsUpgrade(servers);
  const slots = slotsOf(servers);
  return (
    <KitStatStrip
      label={t('strip.label')}
      items={[
        { label: t('strip.computers'), value: computers.length, detail: stripSplit(computers, t) },
        { label: t('strip.servers'), value: names.size },
        ...(slots.max > 0
          ? [
              {
                label: t('strip.slots'),
                value: t('srv.capOf', { used: slots.used, max: slots.max }),
                detail: up.available === 'none' ? undefined : <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />,
              },
            ]
          : []),
      ]}
    />
  );
}
