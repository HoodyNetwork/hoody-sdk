// Named screenshot states of the billing page (`bun run hub:shots --page billing`).
// Not typed against @app/shots.types; the runner reads its `act` steps (scripts/shots-lib ShotSpec).

const BUY = '?checkout=buy&plan=fam-plus';
const RESERVE = '?checkout=reserve&item=mkt_sin_m&days=30';
// Ticks the consent box, then tabs to Confirm purchase and presses it.
const SEND = [{ click: 'text=I understand' }, { press: 'Tab' }, { press: 'Tab' }, { press: 'Enter' }] as const;

// The pricing grid, the listings filter bar and checkout are also taken at 1350 (light, dark) and 390 dark.
export default [
  // The page as it opens: the header starts at the title, with no trail above it.
  { name: 'opens', extra: ['390-dark'] },
  { name: 'many', path: '?view=wallet' },
  { name: 'empty', path: '?view=wallet', state: 'empty' },
  { name: 'loading', path: '?view=wallet', state: 'loading' },
  { name: 'error', path: '?view=wallet', state: 'error' },
  { name: 'partial', path: '?view=wallet', state: 'partial' },
  { name: 'busy-tones', path: '?view=wallet', state: 'busy-tones' },
  { name: 'long', path: '?view=wallet', state: 'long' },
  { name: 'many-rows', path: '?view=wallet', state: 'many26' },
  { name: 'banned', path: '?view=wallet', state: 'banned' },
  // The notice sits below the fold on a phone: clicking the text scrolls it into the shot. The click does nothing else:
  // in a terminal of 24 rows it scrolls the page, in one of 40 rows the notice is already in view and the page stays
  // as it was. noChange lets the terminal page gate take a frame the action did not change; it asserts nothing.
  { name: 'usage-forbidden', path: '?view=wallet', state: 'usage-forbidden', act: [{ click: "text=AI usage isn't shown for this sign-in." }], noChange: true },
  { name: 'wallet-loading', path: '?view=wallet', state: 'wallet-pending' },
  { name: 'wallet-referral', path: '?view=wallet', state: 'wallet-referral' },
  { name: 'wallet-owed', path: '?view=wallet', state: 'wallet-owed' },
  { name: 'wallet-referral-owed', path: '?view=wallet', state: 'wallet-referral-owed' },
  { name: 'wallet-long-amounts', path: '?view=wallet', state: 'wallet-long-amounts' },
  { name: 'bonus-claimed', path: '?view=wallet', state: 'bonus-claimed' },
  { name: 'return-received', state: 'return-received' },
  { name: 'return-processing', state: 'return-processing' },
  { name: 'return-failed', state: 'return-failed', act: [{ waitFor: 'text=The payment failed' }] },
  { name: 'funds', path: '?sheet=funds' },
  { name: 'funds-unknown', state: 'topup-unknown', path: '?sheet=funds', act: [{ click: 'Continue to payment' }] },
  { name: 'funds-balance-unread', state: 'widget-balance-error', path: '?sheet=funds' },
  { name: 'funds-why', path: '?sheet=funds', act: [{ click: 'How does adding funds work?' }] },
  // The funds step of a checkout that is short: the wallet Ledger adds what the purchase still needs.
  { name: 'funds-from-checkout', state: 'wallet-short', path: BUY, act: [{ click: 'role=dialog >> role=button[name="Add funds"]' }, { waitFor: 'text=Still needed for' }] },
  // The drawer closed on an unknown top-up: the hold stays on the page as a band (C9).
  {
    name: 'funds-held-band',
    state: 'topup-unknown',
    path: '?sheet=funds',
    act: [{ click: 'Continue to payment' }, { waitFor: 'text=Payment page: not confirmed' }, { click: 'Cancel' }, { waitFor: 'text=top-up may have gone through' }],
  },
  { name: 'plans-suggested', path: '?plan=fam-pro', waitForText: 'Bare metal', extra: ['1350-light', '1350-dark', '390-dark'] },
  // Under the cards and the Bare metal band: the Compare plans table, then the lower sections. Clicking a
  // section's heading scrolls it into the shot; a heading does nothing else.
  { name: 'plans-compare', act: [{ click: 'text=Compare plans' }] },
  { name: 'plans-more', act: [{ click: 'text=Free has useful limits' }] },
  { name: 'checkout-review', path: BUY, extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'checkout-quoting', state: 'quote-loading', path: BUY },
  { name: 'checkout-quote-error', state: 'quote-error', path: BUY },
  { name: 'checkout-short', state: 'wallet-short', path: BUY },
  // Referral credit: spent first on servers, so "can I pay" is general + Referral credit.
  { name: 'checkout-referral-covers', state: 'checkout-referral-covers', path: BUY },
  { name: 'checkout-referral-partial', state: 'checkout-referral-partial', path: BUY },
  { name: 'checkout-baremetal-setup', state: 'checkout-baremetal-setup', path: RESERVE },
  { name: 'checkout-limit', state: 'quote-limit', path: BUY },
  // Where the server goes: every location in view (a full one listed, off), and a refused location.
  { name: 'checkout-location', path: BUY, extra: ['390-dark'], act: [{ waitFor: 'role=dialog >> label:has-text("Helsinki, Finland")' }] },
  {
    name: 'checkout-location-refused',
    state: 'send-region-full',
    path: BUY,
    extra: ['390-dark'],
    act: [{ click: 'role=dialog >> label:has-text("Helsinki, Finland")' }, { waitFor: 'text=Your server will be in Helsinki' }, ...SEND, { waitFor: 'text=Nothing was charged' }],
  },
  { name: 'checkout-location-unread', state: 'regions-error', path: BUY },
  { name: 'checkout-location-full', state: 'regions-all-full', path: BUY, extra: ['390-dark'], act: [{ waitFor: 'text=No location has room right now' }] },
  // The review with a location chosen (the recap: where the server goes, above the price) and the receipt naming it.
  {
    name: 'checkout-location-chosen',
    path: BUY,
    extra: ['390-dark'],
    act: [{ click: 'role=dialog >> label:has-text("Helsinki, Finland")' }, { waitFor: 'text=Your server will be in Helsinki' }],
  },
  {
    name: 'checkout-location-done',
    path: BUY,
    act: [{ click: 'role=dialog >> label:has-text("Helsinki, Finland")' }, { waitFor: 'text=Your server will be in Helsinki' }, ...SEND, { waitFor: 'text=Your new server is in' }],
  },
  { name: 'checkout-upgrade', path: '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro' },
  { name: 'checkout-upgrade-choose', path: '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01' },
  { name: 'checkout-pay', path: '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02' },
  { name: 'checkout-rent', path: '?checkout=rent&item=mkt_sin_m&days=30' },
  { name: 'checkout-reserve', path: RESERVE },
  { name: 'checkout-charge-loading', state: 'send-slow', path: BUY, act: SEND },
  { name: 'checkout-done', path: BUY, act: SEND },
  { name: 'checkout-already', state: 'send-already', path: BUY, act: SEND },
  { name: 'checkout-setup-failed', state: 'send-setup-failed', path: BUY, act: SEND },
  { name: 'checkout-setup-failed-noref', state: 'send-setup-failed-noref', path: BUY, act: SEND },
  { name: 'checkout-unknown', state: 'send-unknown', path: BUY, act: SEND },
  { name: 'checkout-failed', state: 'send-failed', path: BUY, act: SEND },
  { name: 'checkout-requote', state: 'send-requote', path: BUY, act: SEND },
  { name: 'checkout-notsent', state: 'send-notsent', path: BUY, act: SEND },
  { name: 'checkout-reserve-unknown', state: 'send-unknown', path: RESERVE, act: SEND },
  // The Bare metal view (the market list inside Billing): one shot per state of the list, the inspector and the reservations.
  { name: 'servers-many', path: '?view=servers', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'servers-detail-stock', path: '?view=servers&sel=l01' },
  { name: 'servers-detail-term', path: '?view=servers&sel=l01&days=365', act: [{ hover: 'css=[role=radiogroup]' }] },
  { name: 'servers-detail-offer', path: '?view=servers&sel=o01' },
  { name: 'servers-detail-unbuyable', path: '?view=servers&sel=u01' },
  { name: 'servers-detail-short', state: 'servers-balance-short', path: '?view=servers&sel=l03', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'servers-balance-failed', state: 'servers-balance-failed', noOutcome: 'a read-only page: the state is a failed read, shown by its own band or state, not a saved change', path: '?view=servers' },
  { name: 'servers-filter-country', path: '?view=servers&country=DE', act: [{ hover: 'css=[class*="tableArea"]' }] },
  { name: 'servers-filter-sort', path: '?view=servers&kind=stock&price=..100&sort=from', act: [{ hover: 'css=[class*="tableArea"]' }] },
  { name: 'servers-no-match', path: '?view=servers&cores=32..&price=..25', act: [{ hover: 'css=[class*="tableArea"]' }] },
  { name: 'servers-loading', state: 'servers-loading', path: '?view=servers' },
  { name: 'servers-one-failed', state: 'servers-one-failed', noOutcome: 'a read-only page: the state is a failed read, shown by its own band or state, not a saved change', path: '?view=servers' },
  { name: 'servers-both-failed', state: 'servers-both-failed', act: [{ hover: 'css=[class*="tableArea"]' }], noOutcome: 'a read-only page: the state is a failed read, shown by its own band or state, not a saved change', path: '?view=servers' },
  { name: 'servers-empty', state: 'servers-empty', act: [{ hover: 'css=[class*="tableArea"]' }], path: '?view=servers' },
  { name: 'servers-banned', state: 'servers-banned', path: '?view=servers' },
  { name: 'servers-balance-loading', state: 'servers-balance-loading', path: '?view=servers' },
  { name: 'servers-reservations', path: '?view=servers&tab=reservations' },
  { name: 'servers-res-loading', state: 'servers-res-loading', path: '?view=servers&tab=reservations' },
  { name: 'servers-res-empty', state: 'servers-res-empty', path: '?view=servers&tab=reservations' },
  { name: 'servers-res-error', state: 'servers-res-error', path: '?view=servers&tab=reservations', noOutcome: 'a read-only page: the state is a failed read, shown by its own band or state, not a saved change' },
  // Suspended with a listing in the URL: no inspector, no Add funds, no primary.
  { name: 'servers-banned-selected', state: 'servers-banned', path: '?view=servers&sel=l01' },
];
