// Browser alerts in the terminal. On the web the card asks the browser for permission and shows alerts while the Hub
// is open in a tab (BrowserCard.tsx). A terminal has no such alerts (its host gives no alertHost: core/host-env.ts), so
// the web card read it as a browser on an insecure page and said "secure (https)", which is not true here. In its
// place: why, and the web Hub's address of this page (kit Handoff), where alerts are turned on in each browser.
// Nothing here asks for a permission or reads the stored choice. The section's lead is the terminal's own
// (term/app/termWords.json, h.browser.what).
import { Handoff, useStrings } from '@kit';
import type * as Web from './BrowserCard';
import strings from './BrowserCard.term.strings.en.json';

export const BrowserCard: typeof Web.BrowserCard = () => {
  const t = useStrings(strings);
  return <Handoff size="line" reason={t('term.alerts.reason')} what={t('term.alerts.what')} />;
};
