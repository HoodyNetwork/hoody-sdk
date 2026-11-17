// Named screenshot states of the notifications page (`bun run hub:shots --page notifications`).
import type { Shots } from '@app/shots.types';

export default [
  { name: 'many', waitForText: 'Computer atlas stopped', extra: ['1350-light', '1350-dark', '390-dark'] },
  {
    name: 'detail',
    path: '?sel=4e0000000000000000000000',
    // Inspector-only text (below 846 px of the page's own width the hidden list behind it holds the title too).
    waitForText: 'This one needs a look.',
  },
  {
    name: 'formatted',
    // The announcement: **bold** and a bare https link in the message (the notice-text rule).
    path: '?sel=4e0007000000000000000000',
    // Inspector-only text: below 846 px the hidden list behind it holds the message too. The notice is unread.
    waitForText: 'Marked read',
  },
  { name: 'archive', path: '?box=archive', waitForText: 'Payment received' },
  {
    name: 'needs-a-look',
    path: '?look=1',
    waitForText: 'Computer atlas stopped',
  },
  { name: 'empty', state: 'empty', waitForText: 'No notices yet' },
  { name: 'caught-up', state: 'caught-up', waitForText: 'all caught up' },
  { name: 'capped', state: 'capped', waitForText: 'Showing newest' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  {
    name: 'ack-unconfirmed',
    state: 'ack-lost',
    path: '?sel=4e0000000000000000000000',
    // Text only the inspector shows: below 846 px of the page's own width the list behind it is hidden and holds the title too.
    waitForText: 'Check again before trying it twice',
  },
  {
    name: 'ack-error',
    state: 'ack-failed',
    path: '?sel=4e0000000000000000000000',
    waitForText: 'as read.',
  },
  { name: 'notices', path: '/notices', waitForText: 'Outgoing spam reported' },
  {
    name: 'notice-detail',
    path: '/notices?sel=ab0000000000000000000000',
    waitForText: 'Resolving this notice does not lift that suspension.',
  },
  { name: 'notice-resolved', path: '/notices?sel=ab0002000000000000000000', waitForText: 'it takes no more replies' },
  { name: 'notices-empty', path: '/notices', state: 'notices-empty', waitForText: 'No notices about your servers' },
  { name: 'notices-loading', path: '/notices', state: 'notices-loading' },
  { name: 'notices-error', path: '/notices', state: 'notices-error' },
  {
    name: 'notice-reply-unknown',
    path: '/notices?sel=ab0001000000000000000000',
    state: 'notice-reply-unknown',
    // The box is there first; the act sends, and the shot waits for the pending Outcome line its name promises.
    waitForText: 'Send reply',
    act: [{ fill: 'Your reply', text: 'Removed the script and rotated the keys.' }, { click: 'Send reply' }],
  },
  { name: 'learn', path: '/learn', waitForText: 'Hoody writes a notice' },
  {
    name: 'learn-browser-ask',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-ask',
    waitForText: 'Turn on browser alerts',
  },
  {
    name: 'learn-browser-on',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-on',
    waitForText: 'Send a test alert',
  },
  {
    name: 'learn-browser-off',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-off',
    waitForText: 'Turn on',
  },
  {
    name: 'learn-browser-blocked',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-blocked',
    waitForText: 'Blocked in this browser',
  },
  {
    name: 'learn-browser-broken',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-broken',
    // The broken state's own status (it offers no test alert; those words were only in a closed FAQ answer).
    waitForText: 'This browser cannot show them',
  },
  {
    name: 'learn-browser-ios',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-ios',
    waitForText: 'a browser tab cannot show alerts',
  },
  {
    name: 'learn-browser-insecure',
    path: '/learn#browser',
    scrolled: true, // a deep link to the Browser alerts section: it opens scrolled on purpose
    state: 'browser-insecure',
    waitForText: 'allow alerts only on secure',
  },
] satisfies Shots;
