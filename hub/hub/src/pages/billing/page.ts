// Manifest of the Plans & billing page (views: Plans, Bare metal, Wallet & usage; Bare metal is the Market,
// /market redirects here) and the home of the shared Checkout drawer (buy, pay, upgrade, rent, reserve). Sensitive: the
// framed lock refuses it, and it gets the security tier.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'billing',
  path: '/billing',
  title: 'title',
  description:
    'Plans & billing: the plans; bare-metal servers to rent or pre-order, with their specs, terms and your reservations; your wallet and top-ups, the GitHub bonus, paid-server subscriptions (pay, upgrade, auto-renew), AI usage and limits; and checkout for every purchase. A charge whose outcome is unknown is never resent blindly.',
  nav: { group: 'account', order: 10, icon: 'hoody-marketplace', label: 'nav' },
  layout: 'detail',
  load: () => import('./view'),
  // The Free badge, in the top bar on every page (the shell mounts it before the account menu).
  topBar: { id: 'free', load: () => import('./parts/FreeBadgeSlot') },
  widgets: [{ id: 'billing', title: 'widget.title', size: 's', order: 35, load: () => import('./widget') }],
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    {
      id: 'open',
      label: 'cmd.open',
      keywords: ['wallet', 'balance', 'subscription', 'plans'],
    },
    {
      id: 'funds',
      label: 'cmd.funds',
      to: '/billing?sheet=funds',
      icon: 'plus',
      keywords: ['top up', 'wallet', 'pay', 'card', 'crypto'],
    },
    {
      id: 'plans',
      label: 'cmd.plans',
      to: '/billing?view=plans',
      keywords: ['upgrade', 'buy', 'server'],
    },
    {
      id: 'usage',
      label: 'cmd.usage',
      to: '/billing?view=wallet#usage',
      keywords: ['ai', 'limits', 'allowance'],
    },
  ],
});
