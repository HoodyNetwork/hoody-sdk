// SentMessage: who wrote a block of a conversation, and a sent message as its sender reads it. A message an "Ask the
// Agent" action sent shows as its one-line request, with what went with it (the action's instructions and the page's
// context) folded under "Context sent"; opened, that is the sent text, whole and as sent, with Copy. A typed message
// shows as typed. The AI tab, the dock and the dock's first frame draw their messages with these two parts; engine-free:
// props only. The text is the person's or a page's, never markup: it is drawn as text.
import { cx } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { parseAskMessage } from '../ask';
import { CodeBlock } from '../data/Ids';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import strings from './SentMessage.strings.en.json';
import s from './SentMessage.module.css';

/** Who wrote what follows: "You" at the end edge, the Agent (as the host names it) at the start edge, the time quiet. The time is
 *  when the message was sent for "You" and when the answer was finished for the Agent; its title says which. */
export function Author({ who, name, at }: { who: 'you' | 'agent'; name?: string; at?: number }) {
  const t = useStrings(strings);
  const d = at !== undefined && at > 0 ? new Date(at) : null;
  return (
    <p className={cx(s.author, who === 'you' && s.authorYou)} data-author={who}>
      {who === 'agent' && <Icon name="sparkle" size="sm" className={s.authorMark} />}
      <span className={s.authorName}>{who === 'you' ? t('sent.you') : name || t('sent.agent')}</span>
      {d && Number.isFinite(d.getTime()) && (
        <time className={s.authorTime} dateTime={d.toISOString()} title={t(who === 'you' ? 'sent.atSent' : 'sent.atAnswered', { when: d.toLocaleString() })}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
      )}
    </p>
  );
}

/** The Agent's name in an author row: the chat's agent when the host names it, on its computer when known. */
export function useAgentName(): (meta: { agent?: string; computer?: string } | undefined) => string {
  const t = useStrings(strings);
  return (meta) => {
    const agent = meta?.agent || t('sent.agent');
    return meta?.computer ? t('sent.agentOn', { agent, computer: meta.computer }) : agent;
  };
}

/** A sent message's words. `fold`: the words are cut to eight lines (a long typed message the host can open whole). */
export function SentText({ text, fold }: { text: string; fold?: boolean }) {
  const className = fold ? s.fold : undefined;
  const mark = fold ? { 'data-fold': '' } : {};
  const t = useStrings(strings);
  const m = parseAskMessage(text);
  if (m.title === null && m.context === null) return <div className={className} {...mark}>{text}</div>;
  const label = m.contextLabel ? t('sent.context', { what: m.contextLabel }) : t('sent.contextPlain');
  // With a title the fold holds the message as sent (instructions and context); without one the words above are the
  // message's own and the fold holds the context alone. Either way nothing that was sent is left out.
  const sent = m.title === null ? (m.context ?? '') : text;
  return (
    <>
      <div className={cx(className, m.title !== null && s.request)} {...mark}>{m.title ?? m.text}</div>
      {(m.title !== null || m.context !== null) && (
        <Disclosure heading={false} title={label} className={s.context}>
          <CodeBlock
            code={sent}
            label={m.title === null ? t('sent.contextExact') : t('sent.exact')}
            lang="plain" // reason: English text for the Agent, not a command
            wrap
            maxHeight="md"
          />
        </Disclosure>
      )}
    </>
  );
}
