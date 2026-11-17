// Manifest of the notifications page: the Inbox and the "Get notified" guide.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'notifications',
  path: '/notifications',
  title: 'title',
  description:
    'Your notifications: an Inbox to search, read and mark read, what each kind of notification teaches, and how to get notified on this device.',
  nav: { group: 'account', order: 60, icon: 'hoody-notifications', label: 'nav' },
  layout: 'table',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  widgets: [{ id: 'notifications', title: 'widget.title', size: 's', order: 40, load: () => import('./widget') }],
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['inbox', 'bell', 'alerts'] },
    {
      id: 'archive',
      label: 'cmd.archive',
      to: '/notifications?box=archive',
      keywords: ['read', 'old'],
    },
    {
      id: 'learn',
      label: 'cmd.learn',
      to: '/notifications/learn',
      keywords: ['browser alerts', 'email', 'phone'],
    },
  ],
});
