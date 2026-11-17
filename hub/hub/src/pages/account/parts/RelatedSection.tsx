// Where else to manage what touches the account: API keys, billing, referrals and notifications. Each row follows the page
// registry (inside the Hub) and is hidden when this load does not serve the page (there is no classic
// page to fall back to).
import { Button, SettingRow, followPageLink, useGo, usePageLink, useStrings } from '@kit';
import strings from '../strings.en.json';

export function RelatedSection() {
  const t = useStrings(strings);
  const go = useGo();
  const keys = usePageLink('keys');
  const billing = usePageLink('billing');
  const referrals = usePageLink('referrals');
  const notifications = usePageLink('notifications');
  const rows = [
    { id: 'keys', link: keys, label: t('rel.keys'), help: t('rel.keysHelp') },
    { id: 'billing', link: billing, label: t('rel.billing'), help: t('rel.billingHelp') },
    { id: 'referrals', link: referrals, label: t('rel.referrals'), help: t('rel.referralsHelp') },
    { id: 'notifications', link: notifications, label: t('rel.notifications'), help: t('rel.notificationsHelp') },
  ];
  return (
    <>
      {rows.map(
        (r) =>
          r.link && (
            <SettingRow
              key={r.id}
              label={r.label}
              help={r.help}
              // The row names the place; its action at the row end says Open, named for the row.
              actions={
                <Button size="sm" aria-label={t('rel.openNamed', { name: r.label })} onPress={() => r.link && followPageLink(r.link, go)}>
                  {t('rel.open')}
                </Button>
              }
            />
          ),
      )}
    </>
  );
}
