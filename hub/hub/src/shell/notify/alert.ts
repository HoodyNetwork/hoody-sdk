// notifyAlert: a native browser alert for something the open Hub
// tab observed (a Bot is waiting, a script finished, a schedule failed). Sends nothing to the network
// and never asks for permission: it does nothing unless alerts are on for the shown account in this
// browser and the tab is away (hidden or unfocused; a person who is looking already sees the page).
// The caller words the alert, already translated. A click brings the Hub forward at `to` (a Hub
// path), else the inbox, only while the same account is shown. While a passcode is set the alert says only
// "New notice" and the fixed line, never the caller's words.
import { currentStatus, isAway, isHintKind, showAlert, type HintKind } from '@core/shell';
import { makeT } from '@kit/strings';
import strings from '../strings.en.json';
import { notifyPaths } from './paths';
import { shownUid } from './uid';

export interface NotifyAlertInfo {
  title: string;
  body: string;
  /** Makes the tag unique per thing (a Bot id, a run id); two tabs never stack twins of one tag. */
  tag?: string;
  /** Hub path a click opens, e.g. '/bots?sel=…'. */
  to?: `/${string}`;
}

const t = makeT(strings);

/** True when an alert was handed to the browser. */
export async function notifyAlert(kind: HintKind, info: NotifyAlertInfo): Promise<boolean> {
  const uid = shownUid();
  if (!uid || !isHintKind(kind) || !info || typeof info.title !== 'string') return false;
  if (currentStatus(uid).state !== 'on' || !isAway()) return false;
  const r = await showAlert({
    title: info.title,
    body: info.body,
    generic: { title: t('alert.untitled'), body: t('alert.body') },
    tag: `hub:${kind}${info.tag ? `:${info.tag}` : ''}`,
    onClick: () => {
      if (shownUid() !== uid) return;
      window.location.hash = `#${info.to ?? notifyPaths.inbox}`;
    },
  });
  return r.ok;
}
