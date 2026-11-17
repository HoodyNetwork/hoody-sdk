// Jump to's places on Referrals that the view does not draw now (manifest searchHide; the shell loads this, never the
// page). The questions show only where the page invites (logic.ts invites): not when earning is paused, the account was
// removed, on a token session or after a failed read. While the program read is still on its way nothing is left out.
import { useErrorInfo, type SearchHide } from '@kit';
import { useMe } from './data';
import { invites, readState, type State } from './logic';

/** What Referrals leaves out in this state; null: it draws every place (or the state is not known yet). */
export function referralsHide(state: State): SearchHide | null {
  return state === 'loading' || invites(state) ? null : { hide: ['#faq-'] };
}

export default function useReferralsSearchHide(): SearchHide | null {
  const read = useMe();
  const info = useErrorInfo(read.error);
  return referralsHide(readState({ account: read.account, isPending: read.isPending, info, me: read.me }));
}
