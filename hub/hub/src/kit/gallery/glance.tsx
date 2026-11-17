// The kit "At a glance" (kit/layouts/anatomy/Glance) in the gallery (/_kit?tab=pieces): one glance with each kind of fact
// (words with a limit's Meter, a floor, an InfoTip, a tip beside a meter, not read yet, can't tell), and one whose whole read is still going.
// kit3.tsx mounts it.
import { Glance } from '../layouts/anatomy/Glance';
import { useStrings } from '../strings';
import strings from './glance.strings.en.json';

export function GlancePieces() {
  const t = useStrings(strings);
  return (
    <>
      <Glance
        id="glance"
        items={[
          { label: t('kept'), value: t('kept.value'), meter: { value: 30, label: t('kept.meter') } },
          { label: t('space'), value: t('space.value'), atLeast: true },
          { label: t('access'), value: t('access.value'), tip: t('access.tip') },
          { label: t('rules'), value: t('rules.max'), tip: t('rules.tip'), meter: { value: 40, label: t('rules.meter') } },
          { label: t('newest'), read: 'reading' },
          { label: t('used'), read: 'unknown' },
        ]}
      />
      <Glance id="glance-reading" read="reading" columns={3} items={[{ label: t('kept') }, { label: t('rules'), value: t('rules.value') }, { label: t('space') }]} />
    </>
  );
}
