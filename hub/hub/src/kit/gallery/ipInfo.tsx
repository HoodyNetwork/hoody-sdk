// The kit IpInfo in the gallery (/_kit?tab=pieces #ip-info): an address with its place, its copy button and its
// details button, a kit IconButton whose tooltip body is the details (and a popover on a press). kit3.tsx mounts it;
// kit/controls/kit-parts.browser.spec.ts reads it. The flag is drawn as its country code, so the specimen looks the same everywhere.
import { IpInfo, type IpDetails } from '../data/IpInfo';
import { AnatomySection } from '../layouts/anatomy/Section';
import { useStrings } from '../strings';
import strings from './ipInfo.strings.en.json';

const DETAILS: IpDetails = { ip: '203.0.113.58', version: 4, city: 'Paris', region: 'Île-de-France', country: 'FR', timezone: 'Europe/Paris', hostname: 'host.example.net' };

export function IpInfoPieces() {
  const t = useStrings(strings);
  return (
    <AnatomySection id="ip-info" title={t('title')} description={t('desc')} state={{ kind: 'ready' }}>
      <IpInfo details={DETAILS} flags="code" />
    </AnatomySection>
  );
}
