// "Share with another computer…" on a folder in Files: the row menu's and the bar's More menu's way into Share
// a folder. It opens the Storage tab of that folder's computer with the dialog filled in for the folder; nothing is
// sent from here. Offered only while the Shared folders switch is on and the session may change shares (an account
// session); a folder sharing would refuse is shown off, with why (pathProblem.ts).
import { computerHandle, useCan } from '@core';
import { useGo, useStrings, type RowActionEntry } from '@kit';
import { links } from '../hrefs';
import { findByHandle } from '../logic';
import { sharesUiOn } from './flag';
import { sharePathProblem } from './pathProblem';
import strings from './strings.en.json';

/** The search key the Storage tab reads the folder from (StoragePanel drops it once the dialog closes). */
export const SHARE_PARAM = 'share';

/** Files with that computer's Storage tab open on Share a folder for `path`. `id`: the computer's id, for a handle
 *  that does not name it alone (Files' start move keeps it as pane A's exact computer). */
export const shareHref = (handle: string, path: string, id?: string): string =>
  `${links.at(handle)}${id ? `&cid=${encodeURIComponent(id)}` : ''}&tab=storage&${SHARE_PARAM}=${encodeURIComponent(path)}`;

/** The menu entry for one folder of one computer ('bar': the folder shown; 'row': a folder in the list), or none.
 *  `listed`: the computers Files lists; the link carries the computer's id unless its handle names it alone there. */
export function useShareEntry(): (computer: { id: string; name: string } | undefined, path: string, where: 'row' | 'bar', listed: readonly { id: string; name: string }[]) => RowActionEntry[] {
  const t = useStrings(strings);
  const go = useGo();
  const canWrite = useCan('account');
  if (!sharesUiOn() || !canWrite) return () => [];
  return (computer, path, where, listed) => {
    if (!computer) return [];
    const problem = sharePathProblem(path);
    return [{
      id: 'share',
      label: t(where === 'bar' ? 'act.shareThis' : 'act.shareRow'),
      icon: 'share',
      opens: true,
      ...(problem ? { isDisabled: true, disabledReason: t(`why.${problem}`) } : {}),
      onAction: () => {
        const handle = computerHandle(computer);
        go(shareHref(handle, path, findByHandle(listed, handle)?.id === computer.id ? undefined : computer.id));
      },
    }];
  };
}
