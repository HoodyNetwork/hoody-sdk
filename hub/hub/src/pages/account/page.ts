// Manifest of the account page. Sensitive: the framed lock refuses it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'account',
  path: '/account',
  title: 'title',
  description:
    'Your account: your name and email address, sign-in sessions and security history, two-factor sign-in, SSH keys and the passcode lock of this browser.',
  nav: { group: 'account', order: 50, icon: 'hoody-account', label: 'nav' },
  layout: 'settings',
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['profile', 'me', 'email'] },
    { id: 'password', label: 'cmd.password', to: '/account?sheet=password', keywords: ['security'] },
    { id: 'twofa', label: 'cmd.twofa', to: '/account?sheet=setup', keywords: ['2fa', 'authenticator', 'security'] },
    { id: 'sessions', label: 'cmd.sessions', to: '/account?section=sessions', keywords: ['devices', 'sign out'] },
  ],
});
