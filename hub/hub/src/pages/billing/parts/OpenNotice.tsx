// The page's announcement: one sentence in the kit Band's accent tone, saying when server plans and
// bare-metal servers open for orders. It is information, not a warning: a calendar icon, the Band's status role, no
// action and no close. It sits first in the banner of every Billing view,
// while its switch (../open-notice.ts) is on.
import { Band } from '@kit';
import { LISTINGS_OPEN_NOTICE } from '../open-notice';
import type { T } from './Bits';

export function OpenNotice({ t, show = LISTINGS_OPEN_NOTICE }: { t: T; show?: boolean }) {
  if (!show) return null;
  return (
    <div data-band="listings-open">
      <Band tone="accent" icon="calendar">{t('band.listingsOpen')}</Band>
    </div>
  );
}
