// Manifest of the Referrals page: your signup link and codes, Referral credit, level, totals in bands and the months
// with earnings. One screen (the page has no sub-paths). Account-wide: every call goes to the base host and a token
// session is refused unsent (core BASE_ONLY). Sensitive: the framed lock refuses it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'referrals',
  path: '/referrals',
  title: 'title',
  description: 'Referrals: your referral link and codes, Referral credit, your level and its bands; join the program, make custom codes and retire a code.',
  nav: { group: 'account', order: 25, icon: 'share', label: 'nav' },
  layout: 'detail',
  screens: [{ id: 'program', path: '' }],
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: true,
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['referral', 'invite', 'affiliate', 'earn', 'credit'] }],
  guide: [
    { id: 'how', title: 'guide.how.title', body: 'guide.how.body' },
    { id: 'see', title: 'guide.see.title', body: 'guide.see.body' },
  ],
});
