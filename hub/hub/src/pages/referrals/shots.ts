// Named screenshot states of the Referrals page (`bun run hub:shots --page referrals`): one per page state, each its
// own case, the credit card's own cases (no due day, the largest amounts, a level not known, the Creator's Withdraw…
// explainer), and the writes: each confirm, and what a lost answer or a refusal leaves (pending states act and end on
// the kit's Outcome line).
import type { Shots } from '@app/shots.types';

const dark = ['390-dark'] as const;
// Retire… is a worded button in the row's action column at every width (nothing collapses into a bare ⋯).
// The first step presses it; the second presses the open confirm's title (which does nothing).
const RELEASE = 'css=button[aria-label="Retire maya-builds"]';
const RELEASE_ITEM = 'css=[role=menuitem]:has-text("Retire maya-builds"), [role=alertdialog] :is(h1, h2, h3)';
// Withdraw… is the credit section's one action: a worded button on a wide page, inside the section's ⋯ under 600 px of
// content. The first step presses whichever shows; the second presses the menu's item, or the open explainer's title
// (which does nothing).
const WITHDRAW = 'css=#referral-credit header button';
const WITHDRAW_ITEM = 'css=[role=menuitem]:has-text("Withdraw…"), [role=dialog] :is(h1, h2, h3)';

export default [
  { name: 'member', extra: dark },
  // An InfoTip open: the release tip beside Release….
  // The tip sits by the codes list, below the fold: opening it scrolls the page there on purpose.
  { name: 'tip-release', scrolled: true, act: [{ click: 'About retiring a code' }, { waitFor: 'text=Retiring stops this code for new signups, for good.' }] },
  { name: 'questions', act: [{ click: 'When can I use my credit?' }] },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'token', state: 'token' },
  { name: 'not-eligible', state: 'notEligible', extra: dark },
  { name: 'paused', state: 'paused' },
  { name: 'can-join', state: 'canJoin' },
  { name: 'earning-paused', state: 'earningPaused', extra: dark },
  { name: 'removed', state: 'removed' },
  { name: 'blocked', state: 'blocked' },
  { name: 'no-custom-codes', state: 'noCustomCodes' },
  { name: 'owed', state: 'owed' },
  { name: 'no-monthly', state: 'noMonthly' },
  // The level cards are below the fold at 390: hovering the Creator card's line brings them into view.
  { name: 'no-threshold', state: 'noThreshold', act: [{ hover: 'text=from the month after the Creator number of customers' }] },
  { name: 'creator', state: 'creator', act: [{ hover: 'text=of what they pay, this month' }] },
  { name: 'odd-money', state: 'oddMoney' },
  // Referral credit: On hold with no due day; usdText's largest amounts whole inside the card; a level the API did not name.
  { name: 'held-no-date', state: 'heldNoDate' },
  { name: 'big-credit', state: 'bigCredit', extra: dark },
  { name: 'level-not-known', state: 'unknownLevel' },
  // A Creator's Withdraw… (the section's action) opens the explainer, which sends nothing.
  { name: 'withdraw-info', state: 'creator', act: [{ click: WITHDRAW }, { click: WITHDRAW_ITEM }, { waitFor: "text=You're a Creator this month, so you can ask" }] },
  { name: 'check-500', state: 'check500', act: [{ fill: 'New code', text: 'fresh-one' }, { waitFor: "text=Couldn't check this code." }, { hover: "text=Couldn't check this code." }] },
  { name: 'join-confirm', state: 'canJoin', act: [{ click: 'Join…' }, { waitFor: 'text=Join the referral program?' }], extra: dark },
  { name: 'join-confirm-no-rate', state: 'canJoinNoRate', act: [{ click: 'Join…' }, { waitFor: 'text=Join the referral program?' }] },
  { name: 'join-pending', state: 'joinPending', act: [{ click: 'Join…' }, { click: 'role=alertdialog >> role=button[name="Join"]' }, { waitFor: 'text=Your join may have gone through' }], extra: dark },
  { name: 'release-confirm', act: [{ click: RELEASE }, { click: RELEASE_ITEM }, { waitFor: 'text=Retire maya-builds?' }] },
  { name: 'release-pending', state: 'releasePending', act: [{ click: RELEASE }, { click: RELEASE_ITEM }, { click: 'role=alertdialog >> role=button[name="Retire code"]' }, { waitFor: 'text=Retiring maya-builds may have gone through' }] },
  { name: 'code-available', act: [{ fill: 'New code', text: 'fresh-one' }, { waitFor: 'text=Available ✓' }, { hover: 'text=Available ✓' }], extra: dark },
  { name: 'create-pending', state: 'createPending', waitForText: 'Your own codes', act: [{ fill: 'New code', text: 'fresh-one' }, { click: 'Create' }, { waitFor: 'text=Creating fresh-one may have gone through' }] },
  { name: 'create-taken', state: 'createTaken', act: [{ fill: 'New code', text: 'fresh-one' }, { click: 'Create' }, { waitFor: 'text=That code is taken or was used before.' }] },
  { name: 'create-issuance-blocked', state: 'createIssuanceBlocked', act: [{ fill: 'New code', text: 'fresh-one' }, { click: 'Create' }, { waitFor: 'text=This didn\'t go through' }] },
  { name: 'check-429', state: 'check429', act: [{ fill: 'New code', text: 'fresh-one' }, { waitFor: 'text=Checking too fast. Try again in a moment.' }, { hover: 'text=Checking too fast. Try again in a moment.' }] },
  { name: 'check-gone', state: 'checkGone', waitForText: 'Your own codes', act: [{ fill: 'New code', text: 'fresh-one' }, { waitFor: 'text=No more codes of your own can be made now.' }] },
  { name: 'release-not-removable', state: 'releaseNotRemovable', act: [{ click: RELEASE }, { click: RELEASE_ITEM }, { click: 'role=alertdialog >> role=button[name="Retire code"]' }, { waitFor: 'text=Only an active code of your own can be retired.' }] },
] satisfies Shots;
