// Named screenshot states of the Support page (`bun run hub:shots --page support`).
// The runner takes 1440 light/dark and 390 light; `390-dark` is added where a state needs it. Pending states act
// and end on the kit's pending banner; Check again then shows the hint and the banner stays pending.
import type { Shots } from '@app/shots.types';

const WAITING = '0000000000000000' + (0x6720a1b2 + 1).toString(16);
const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);
const CLOSED_UNREAD = '0000000000000000' + (0x6720a1b2 + 4).toString(16);
const CLOSED = '0000000000000000' + (0x6720a1b2 + 3).toString(16);
const GOOD = '0000000000000000' + (0x6720a1b2 + 5).toString(16);
const HOSTILE = '0000000000000000' + (0x6720a1b2 + 6).toString(16);
const LONG = '0000000000000000' + (0x6720a1b2 + 7).toString(16);
const DARK = ['390-dark'] as const;

export default [
  // The list
  { name: 'list-empty', state: 'empty', extra: DARK },
  { name: 'list-all', extra: DARK },
  { name: 'list-waiting-you', path: '?status=waiting_user' },
  { name: 'list-closed-unread', path: '?status=closed' },
  { name: 'list-error', state: 'error' },
  { name: 'list-partial', state: 'partial', act: [{ click: 'Load more' }, { waitFor: "text=Some tickets couldn't be loaded." }] },
  { name: 'list-badge-partial', state: 'badgePartial', waitForText: "The unread count isn't available." },
  { name: 'list-loading', state: 'loading' },
  // The thread
  { name: 'thread-waiting-you', path: `?sel=${WAITING}`, extra: DARK },
  { name: 'thread-open', path: `?sel=${OPEN}` },
  { name: 'thread-closed-reopenable', path: `?sel=${CLOSED}` },
  { name: 'thread-closed-unread', path: `?sel=${CLOSED_UNREAD}` },
  { name: 'thread-closed-for-good', path: `?sel=${GOOD}` },
  { name: 'thread-message-cap', state: 'messageCap', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'One more detail.' }, { click: 'Send' }, { waitFor: "text=You've sent the most messages one ticket allows. Open a new ticket to go on." }] },
  { name: 'thread-older', path: `?sel=${LONG}`, act: [{ click: 'Show older messages' }] },
  { name: 'thread-hostile', path: `?sel=${HOSTILE}`, extra: DARK },
  // New ticket
  { name: 'new-ticket', path: '?new=1', extra: ['390-dark', '1350-light'] },
  { name: 'new-near-limit', state: 'nearLimit', path: '?new=1' },
  {
    name: 'new-quota-reached',
    state: 'quotaReached',
    path: '?new=1',
    act: [{ click: 'role=dialog >> role=button[name=/Category/]' }, { click: 'role=option[name=/Billing/]' }, { fill: 'Subject', text: 'A question' }, { fill: 'role=dialog >> role=textbox[name="Message"]', text: 'Details here.' }, { click: 'Send ticket' }, { waitFor: 'text=You can send again in' }],
    noOutcome: 'A definite refusal: the failed banner shows the limit words, not an outcome line.',
  },
  {
    name: 'new-text-invalid',
    state: 'textInvalid',
    path: '?new=1',
    act: [{ click: 'role=dialog >> role=button[name=/Category/]' }, { click: 'role=option[name=/Bug report/]' }, { fill: 'Subject', text: 'A question' }, { fill: 'role=dialog >> role=textbox[name="Message"]', text: 'Details here.' }, { click: 'Send ticket' }, { waitFor: 'text=This has a hidden character' }],
    noOutcome: 'A field error under Message: the refusal names the field and the rule.',
  },
  // Sends whose answers were lost
  { name: 'send-unknown', state: 'sendUnknown', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'Any news on this?' }, { click: 'Send' }, { waitFor: 'text=Your message may have been sent. We couldn\'t confirm it.' }], extra: DARK },
  { name: 'check-not-found', state: 'sendUnknown', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'Any news on this?' }, { click: 'Send' }, { click: 'Check again' }, { waitFor: 'text=Not found (checked at' }] },
  { name: 'check-possible-match', state: 'sendUnknownApplied', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'Any news on this?' }, { click: 'Send' }, { click: 'Check again' }, { waitFor: 'text=A message like this one is in the ticket' }] },
  { name: 'stop-tracking-confirm', state: 'sendUnknown', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'Any news on this?' }, { click: 'Send' }, { click: 'Stop tracking' }] },
  { name: 'busy-until-midnight', state: 'busy', path: `?sel=${OPEN}`, act: [{ fill: 'Your reply', text: 'Any news on this?' }, { click: 'Send' }, { waitFor: 'text=Support is taking no new messages until' }], noOutcome: 'A definite refusal: the failed banner says until when.' },
  { name: 'close-unknown', state: 'closeLostOpen', path: `?sel=${OPEN}`, act: [{ click: 'More actions' }, { click: 'role=menuitem[name=/Close ticket/]' }, { click: 'role=alertdialog >> role=button[name="Close ticket"]' }, { click: 'Check again' }, { waitFor: 'text=Still open when checked at' }] },
  { name: 'token', state: 'token' },
  { name: 'member', state: 'member' },
  { name: 'banned', state: 'banned', path: '?new=1', act: [{ click: 'role=dialog >> role=button[name=/Category/]' }, { click: 'role=option[name=/Account/]' }, { fill: 'Subject', text: 'Appeal' }, { fill: 'role=dialog >> role=textbox[name="Message"]', text: 'Please look at my account again.' }, { click: 'Send ticket' }, { waitFor: 'text=While your account is suspended' }], noOutcome: 'A definite refusal with the appeal words.' },
] satisfies Shots;
