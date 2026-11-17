// Behaviour contract of Your links (web and terminal): each code shows with its kind and the API's link byte for byte; a
// blocked code shows its note and no link; the rules line and its link show while the account copies links; Share
// material (the media kit link) shows only while the account copies links and a code has a link.
import strings from '../strings.en.json';
import { scenarios } from '../../../kit/scenario-types';
import type { Me } from '../logic';
import { LinkCard } from './LinkCard';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const LINK = 'https://hoody.example/auth/signup?ref=ALPHA7';
const me = (codes: Me['codes']): Me => ({
  eligible: true,
  enrolled: true,
  state: 'active',
  enrolmentOpen: true,
  level: 'referrer',
  ratePercent: '5',
  creatorThreshold: 11,
  creatorRatePercent: '10',
  creatorCustomers: '0',
  codes,
  vanityLeft: null,
  counts: { signedUp: '0', paying: '0', active: '0' },
  credit: { pending: '0.00', available: '0.00', reversed: '0.00', owed: '0.00' },
  monthly: [],
  nextReleaseAt: null,
});

export default scenarios('LinkCard', LinkCard, {
  ignored: {},
  unsupported: {
    release: 'the Retire… control a custom code gets: the page builds it (ReleaseConfirm), pinned by the referrals page tests',
    form: 'the create row: CodeForm\'s own contract',
  },
  cases: [
    {
      name: 'the main code with its link, then a blocked custom code with its note and no link',
      props: {
        t,
        copy: true,
        noCustom: false,
        me: me([
          { code: 'ALPHA7', kind: 'random', state: 'active', link: LINK },
          { code: 'MYCODE', kind: 'vanity', state: 'blocked', link: null },
        ]),
      },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'heading', name: 'Your links' } },
          { target: { role: 'link', name: /signup\?ref=ALPHA7/ } },
          { target: { text: 'MYCODE' } },
          { target: { text: 'This code was blocked and no longer works.' } },
          { target: { text: 'Code rules' } },
          { target: { role: 'heading', name: 'Share material' } },
          { target: { text: 'Logos, banners and text you can use when you share Hoody.' } },
          { target: { role: 'link', name: /^Media kit/ } },
        ],
      },
    },
    {
      name: 'not earning: the codes alone, no rules line',
      props: { t, copy: false, noCustom: false, me: me([{ code: 'ALPHA7', kind: 'random', state: 'active', link: LINK }]) },
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'Your codes' } }, { target: { text: 'ALPHA7' } }, { target: { role: 'link', name: /signup\?ref=ALPHA7/ }, absent: true }, { target: { text: 'Code rules' }, absent: true }, { target: { role: 'link', name: /^Media kit/ }, absent: true }, { target: { text: 'Share material' }, absent: true }] },
    },
    {
      name: 'earning, but no code has a link (the only code is blocked): no share material',
      props: { t, copy: true, noCustom: false, me: me([{ code: 'ALPHA7', kind: 'random', state: 'blocked', link: null }]) },
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'Your links' } }, { target: { text: 'ALPHA7' } }, { target: { role: 'link', name: /^Media kit/ }, absent: true }, { target: { text: 'Share material' }, absent: true }] },
    },
  ],
});
