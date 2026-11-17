// A sentence that names chat apps: Telegram, Slack and Discord always carry their official mark.
// A page's string writes {{telegram}}, {{slack}} or {{discord}} where the app is named; the page passes CHAT_SLOTS to
// its t() and the result to <ChatNames>, which draws each one as the app's mark (the kit icon of that name, decoration)
// followed by its name. The sentence reads exactly as the plain text would.
import { Focusable } from 'react-aria-components';
import { Icon } from '../icons';
import { useListPane } from '../layouts/pane';
import { Tooltip } from '../overlays/Popover';
import { useStrings } from '../strings';
import strings from './ChatNames.strings.en.json';
import s from './ChatNames.module.css';

import { CHAT_NAME_KEY as NAME_KEY, chatParts, isChatApp as isApp } from './ChatNames.pure';

export { CHAT_SLOTS, markChatApps } from './ChatNames.pure';

/** `text`: a string built with CHAT_SLOTS. Text without a slot is drawn as it is. `marksInRail`: in a rail each app is its
 *  mark alone, its name in the tooltip and accessible label (three names would take a row's line of their own). */
export function ChatNames({ text, marksInRail }: { text: string; marksInRail?: boolean }) {
  const t = useStrings(strings);
  const marksOnly = useListPane().rail && marksInRail;
  // Even parts are text; odd parts are what a slot held.
  const parts = chatParts(text);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 && isApp(p) && marksOnly ? (
          <Tooltip key={i} content={t(NAME_KEY[p])}>
            <Focusable excludeFromTabOrder>
              <span className={s.app} data-chat-app={p} role="img" aria-label={t(NAME_KEY[p])}>
                <Icon name={p} size="sm" />
              </span>
            </Focusable>
          </Tooltip>
        ) : i % 2 === 1 && isApp(p) ? (
          <span key={i} className={s.app} data-chat-app={p}>
            <Icon name={p} size="sm" className={s.mark} />
            {t(NAME_KEY[p])}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
