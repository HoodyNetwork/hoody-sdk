// Where payments are made, in the terminal. A terminal Hub sends no payment. The live one refuses every money route at
// the wire and keeps no money record there (term/app/live-wire.ts: isMoneyRoute, recoveryClosed); the demo's client
// refuses every change before anything is sent (scripts/term/build/demo-client.ts). Both mounts install a gate
// (core/live-gate.ts: the live wire's, or the demo's pass-through one from term/app/boot.demo.ts), and an installed
// gate is what this reads. So where the web takes a payment (the checkout: buy, upgrade, pay, rent, reserve; Add funds)
// the terminal draws no Confirm or Continue at all and says, before any press, that payments are made in the web Hub,
// with this page's web address (kit Handoff: the address, Copy link, QR code). It mirrors the standalone Hub's
// hand-off (isStandalone in CheckoutDrawer.tsx and Funds.tsx). Fixtures and tests with no gate keep the web's steps.
import { Handoff, useStrings } from '@kit';
import { liveGateInstalled } from '../../../core/live-gate';
import type * as Web from './moneyHandoff';
import strings from './moneyTerm.strings.en.json';

export const moneyInWebHub: typeof Web.moneyInWebHub = () => liveGateInstalled();

export const MoneyHandoff: typeof Web.MoneyHandoff = () => {
  const t = useStrings(strings);
  return <Handoff reason={t('term.money.reason')} />;
};
