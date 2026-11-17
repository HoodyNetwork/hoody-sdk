// Terminal ChatNames: the sentence as text. Each named app is its mark (the kit icon map's glyph; none today, so its
// name alone) followed by its name. In a rail with marksInRail the web shows the mark alone; with no glyph the terminal
// keeps the name (a mark-only cell would say nothing). Always inline spans, so it sits inside a sentence's Text.
import type { ReactElement } from 'react';
import { Text, useInText } from '../../term/prim';
import { iconMark } from '../data/termIcons';
import { useStrings } from '../strings';
import type * as Web from './ChatNames';
import strings from './ChatNames.strings.en.json';
import { CHAT_NAME_KEY, chatParts, isChatApp } from './ChatNames.pure';

export { CHAT_SLOTS, markChatApps } from './ChatNames.pure';

export const ChatNames: typeof Web.ChatNames = ({ text, marksInRail: _rail }) => {
  const t = useStrings(strings);
  const inText = useInText();
  const spans: ReactElement[] = chatParts(text).map((p, i) => {
    if (i % 2 === 1 && isChatApp(p)) {
      const mark = iconMark(p);
      return <Text key={i} bold>{mark ? `${mark} ${t(CHAT_NAME_KEY[p])}` : t(CHAT_NAME_KEY[p])}</Text>;
    }
    return <Text key={i}>{p}</Text>;
  });
  return inText ? <>{spans}</> : <Text>{spans}</Text>;
};
