// The Free badge: shown only while every server of the person is a free one (FreeBadge.logic.ts). Pressing it
// opens the offers: the plans (billing) and the servers to rent (market), each only when this load has somewhere to go.
// The shell mounts it once in the top bar, near the account: <FreeBadge />. It is the plan's mark, not an action of the
// page: the seedling and the plan's name here, its tinted plate from the top bar (shell/TopBar.module.css, the
// billing:free part).
import { Button, followPageLink, Popover, useGo, usePageLink, useStrings, type PageLink } from '@kit';
import { links as market } from '../../market/links';
import { links } from '../links';
import strings from '../strings.en.json';
import { useFreeNetworkMbps, useFreeVerdict } from './FreeBadge.data';
import s from './FreeBadge.module.css';

/** Inside the Hub: the exact place. (A PageLink is a Hub link only now, so the else branch is never taken.) */
function follow(link: PageLink, path: string, go: (to: string) => void): void {
  if (link.kind === 'hub') go(path);
  else followPageLink(link, go);
}

export function FreeBadge({ className }: { className?: string }) {
  const t = useStrings(strings);
  const go = useGo();
  const verdict = useFreeVerdict();
  // The free server's network cap as the API states it on the free row; no number, no sentence (never a Hub default).
  const mbps = useFreeNetworkMbps();
  const billing = usePageLink('billing');
  const shop = usePageLink('market');
  if (verdict !== 'free' || (!billing && !shop)) return null;
  return (
    <Popover
      trigger={
        <Button variant="ghost" icon="sprout" className={className}>
          {t('free.badge')}
        </Button>
      }
      label={t('free.label')}
      title={t('free.title')}
      width="sm"
      placement="bottom end"
    >
      {(close) => (
        <div>
          <p>{mbps === null ? t('free.body') : `${t('free.body')} ${t('free.network', { n: mbps })}`}</p>
          <div className={s.offers}>
            {billing ? (
              <Button
                variant="primary"
                onPress={() => {
                  close();
                  follow(billing, links.plans, go);
                }}
              >
                {t('free.plans')}
              </Button>
            ) : null}
            {shop ? (
              <Button
                variant="secondary"
                onPress={() => {
                  close();
                  follow(shop, market.list, go);
                }}
              >
                {t('free.market')}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Popover>
  );
}
