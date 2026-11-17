// Why a subscription row's disabled auto-renew menu item is disabled, as a strings key. In order: a suspended account;
// this row's own change whose answer is unknown (the page's "may have gone through" words, as in the row's band), which
// no other row's send hides; a change being sent right now (saving); a change core still holds after the page was left
// (may have gone through); else a lock with no answer yet (saving). Asked only for a disabled item.
export type RenewReasonKey = 'mkt.suspended' | 'subs.renewBusy' | 'renewUnknown';

export function renewReasonKey(o: { banned: boolean; unknown: boolean; sending: boolean; held: boolean; locked: boolean }): RenewReasonKey {
  if (o.banned) return 'mkt.suspended';
  if (o.unknown) return 'renewUnknown';
  if (o.sending) return 'subs.renewBusy';
  if (o.held) return 'renewUnknown';
  return 'subs.renewBusy';
}
