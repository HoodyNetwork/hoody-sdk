// Use your own domain for an alias: the person adds one DNS record (a CNAME from their domain to the alias's host)
// at their DNS provider. Nothing is sent from here: the edge follows the CNAME to the alias, sets up HTTPS on the
// first visit, and the computer's access rules still apply. Read-only, so no hold and no runner.
// Order: the route as the verdict, the three things the person does as steps, then the one hazard (a record left
// behind after the alias is removed). The verdict says the Hub cannot check the record, since it never reads DNS.
import { Band, CodeLine, Drawer, Facts, StepList, Verdict, useStrings } from '@kit';
import { useAliases } from '../data';
import { aliasHost } from '../logic';
import strings from '../strings.en.json';
import type { Computer } from '../types';

export function DomainDrawer({ c, alias, onClose }: { c: Computer | null; alias: string | null; onClose: () => void }) {
  const t = useStrings(strings);
  const row = useAliases(c?.id).data?.find((a) => a.id === alias);
  const host = row ? aliasHost(row.url) : null;
  return (
    <Drawer overlayId="computers-domain" resizeKey="computers-domain"
      isOpen={c !== null && alias !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('domaind.title', { name: row?.name ?? '' })}
      subtitle={t('domaind.lede')}
      size="sm"
      cancel={t('domaind.close')}
    >
      {host ? (
        <>
          <Verdict
            label={t('domaind.routeLabel')}
            next={t('domaind.blind')}
            facts={
              <Facts
                columns={1}
                label={t('domaind.record')}
                items={[
                  { label: t('domaind.type'), value: 'CNAME', mono: true },
                  { label: t('domaind.name'), value: t('domaind.nameValue') },
                  { label: t('domaind.accessLabel'), value: t('domaind.access') },
                ]}
              />
            }
          >
            {t('domaind.route')}
          </Verdict>
          <StepList
            label={t('domaind.steps')}
            groups={[
              {
                items: [
                  {
                    id: 'record',
                    text: (
                      <>
                        {t('domaind.step')} <CodeLine value={host} copyLabel={t('domaind.copyTarget')} />
                      </>
                    ),
                    note: t('domaind.subdomain'),
                  },
                  { id: 'proxy', text: t('domaind.proxyOff'), note: t('domaind.dnsOnly') },
                  { id: 'open', text: t('domaind.open'), note: `${t('domaind.wait')} ${t('domaind.https')}` },
                ],
              },
            ]}
          />
          <Band tone="warn" /* noDetails: a standing caution about removing the record, not a failed request */>{t('domaind.undo')}</Band>
        </>
      ) : (
        <Verdict label={t('domaind.routeLabel')}>{t('domaind.noHost')}</Verdict>
      )}
    </Drawer>
  );
}
