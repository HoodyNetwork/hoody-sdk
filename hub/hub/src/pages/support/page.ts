// Manifest of the Support page: your tickets with Hoody support, each a
// plain-text thread, and New ticket. Account-wide and member-only: every call goes to the base host and a token
// session is refused unsent (core BASE_ONLY). Sensitive: the framed lock refuses it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'support',
  path: '/support',
  title: 'title',
  description: 'Support: your support tickets in the Hub. Read them, open a new ticket, reply and close one.',
  nav: { group: 'help', order: 20, icon: 'mail', label: 'nav' },
  navCount: { load: () => import('./count'), label: 'nav.countLabel', tip: 'nav.countTip' },
  layout: 'list-detail',
  // One screen: the ticket list, its selection in ?sel (ListDetailPage), New ticket in ?new=1; no sub-path.
  screens: [{ id: 'tickets', path: '' }],
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['help', 'ticket', 'contact', 'question', 'problem'] },
    { id: 'new', label: 'cmd.new', to: '/support?new=1', keywords: ['ticket', 'contact', 'help', 'report', 'bug'] },
  ],
  guide: [{ id: 'how', title: 'guide.how.title', body: 'guide.how.body' }],
});
