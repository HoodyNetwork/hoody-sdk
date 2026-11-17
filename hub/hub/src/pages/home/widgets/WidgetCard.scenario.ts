// Behaviour contract of a Home web widget the Hub may not frame (web and terminal): "Open in a new tab" hands the WHOLE
// address outside the Hub; the card shows the address with its id masked.
import { scenarios } from '../../../kit/scenario-types';
import { PAGE_ID, type UrlCard } from './store';
import { UrlWidgetCard } from './WidgetCard';

const ID = '6a1f00c0ffee00000000d0c5';
const URL_ = `https://${ID}.shop.example.com/admin`;
const card = { key: 'w1', pageId: PAGE_ID, id: 'w1', title: 'Shop', name: 'Shop', order: 0, size: 'm', url: URL_, frame: false } as unknown as UrlCard;
const web = { rename: () => true, resize: () => {}, remove: () => {} };

export default scenarios('UrlWidgetCard', UrlWidgetCard, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'an address the Hub may not frame: Open in a new tab opens it whole, its id masked on the card',
      props: (s) => ({ card, web, onHide: s.fn('onHide') }),
      steps: [{ press: { role: 'button', name: 'Open in a new tab' } }],
      expect: { opened: [URL_], neverShown: [ID], calls: { onHide: 0 } },
    },
  ],
});
