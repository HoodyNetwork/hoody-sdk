// SentMessage.term: who wrote a block of a conversation, and a sent message as its sender reads it, in cells. "You" and
// the Agent's name are one bold line each, the time quiet after the name. A message an "Ask the Agent" action sent
// shows its one-line request, with what went with it under a closed "Context sent" row; opened, that is the sent text,
// whole and as sent, with Copy. A typed message shows as typed. Same words, same parsing (kit/ask parseAskMessage).
import type * as Web from './SentMessage';
import { Box, Text } from '@term/prim';
import { Disclosure } from '../controls/Disclosure';
import { parseAskMessage } from '../ask';
import { CodeBlock } from '../data/Ids';
import { useStrings } from '../strings';
import strings from './SentMessage.strings.en.json';

/** The lines a folded message keeps, and the characters (the host's own rule for "long"). */
const FOLD_LINES = 8;
const FOLD_CHARS = 900;

export const Author: typeof Web.Author = ({ who, name, at }) => {
  const t = useStrings(strings);
  const d = at !== undefined && at > 0 ? new Date(at) : null;
  const time = d && Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Text bold colour={who === 'you' ? 'blueText' : 'muted'}>{who === 'you' ? t('sent.you') : '✦ ' + (name || t('sent.agent'))}</Text>
      {time ? <Text colour="faint">{time}</Text> : null}
    </Box>
  );
};

export const useAgentName: typeof Web.useAgentName = () => {
  const t = useStrings(strings);
  return (meta) => {
    const agent = meta?.agent || t('sent.agent');
    return meta?.computer ? t('sent.agentOn', { agent, computer: meta.computer }) : agent;
  };
};

/** The words a folded message shows: its first lines, within the character bound, marked when cut. */
function folded(text: string): string {
  const lines = text.split('\n');
  const head = lines.slice(0, FOLD_LINES).join('\n');
  const cut = [...head].slice(0, FOLD_CHARS).join('');
  return cut.length < text.length ? cut + '…' : text;
}

export const SentText: typeof Web.SentText = ({ text, fold }) => {
  const t = useStrings(strings);
  const m = parseAskMessage(text);
  const words = m.title ?? m.text;
  const shown = fold ? folded(words) : words;
  if (m.title === null && m.context === null) return <Text>{shown}</Text>;
  const label = m.contextLabel ? t('sent.context', { what: m.contextLabel }) : t('sent.contextPlain');
  // With a title the fold holds the message as sent; without one it holds the context alone. Nothing sent is left out.
  const sent = m.title === null ? (m.context ?? '') : text;
  return (
    <Box dir="column" shrink={0}>
      <Text bold={m.title !== null}>{shown}</Text>
      <Disclosure heading={false} title={label}>
        <CodeBlock
          code={sent}
          label={m.title === null ? t('sent.contextExact') : t('sent.exact')}
          lang="plain" // reason: English text for the Agent, not a command
          wrap
          maxHeight="md"
        />
      </Disclosure>
    </Box>
  );
};
