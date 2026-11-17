// Jump to's places on Support that the view does not draw now (manifest searchHide; the shell loads this, never the
// page). Without account access (signed out, a token session) the page draws only why (view.tsx NoAccessState), so
// none of its questions and none of the commands that open something there (New ticket: a link with a query); the
// plain page link stays. A staff or admin account is refused only by the API's answer (SUPPORT_NOT_FOR_ACCOUNT), which
// nothing the Hub holds can tell beforehand: it keeps every place.
import type { SearchHide } from '@kit';
import { useAccount } from './data';
import page from './page';

/** The manifest commands that open something inside Support, read from the manifest so a new one is covered. */
const INTO_PAGE: string[] = [];
for (const c of page.commands ?? []) if (c.to?.includes('?')) INTO_PAGE.push(c.id);

/** What Support leaves out; null: it draws every place. */
export function supportHide(account: boolean): SearchHide | null {
  return account ? null : { only: [], commands: INTO_PAGE };
}

export default function useSupportSearchHide(): SearchHide | null {
  return supportHide(useAccount());
}
