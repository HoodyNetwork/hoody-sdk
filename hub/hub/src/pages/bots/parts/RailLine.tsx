// The Bots web rail's line 2 after a row's status column: its realm where the listed Bots differ in it, then what the
// Bot is doing, then Privacy on, starting at one x on every row; then its chat apps' marks at the line's end (a row
// with its own word, Answer, Write or Let in, ends with the word after them; an empty end takes no room). Each phrase
// is drawn whole or not at all, never cut mid-word: one that does not fit moves to a line that is not shown, and stays
// in the row's words. A " · " is drawn only between two phrases, on the second, so it leaves with it. The terminal
// draws no such line (RailLine.term.tsx).
import { ChatNames, SrOnly, StatusPill, type Tone } from '@kit';
import type { ReactNode } from 'react';
import p from './pane.module.css';

export function RailLine({ now, realm, apps, privacy }: { now: ReactNode | null; realm: string | null; apps: string | null; privacy: string | null }) {
  // The phrases in order; the first has no dot before it.
  const phrases: { key: string; node: ReactNode }[] = [];
  if (realm !== null) phrases.push({ key: 'realm', node: realm });
  if (now !== null) phrases.push({ key: 'now', node: now });
  if (privacy !== null) phrases.push({ key: 'privacy', node: privacy });
  if (phrases.length === 0 && apps === null) return null;
  return (
    <span className={p.railLine}>
      <span className={`${p.railNow} ${p.railWhole}`}>
        {phrases.map((ph, i) => (
          <span key={ph.key} className={p.railPhrase}>
            {i > 0 ? <>· {ph.node}</> : ph.node}
          </span>
        ))}
      </span>
      {apps !== null && (
        <span className={`${p.railEnd} ${p.railWhole}`}>
          <ChatNames text={apps} marksInRail />
        </span>
      )}
    </span>
  );
}

/**
 * The web rail's status column, one width on every row (pane.module.css), so the line's words start at one x. `shown`
 * is the short word the eye reads; where it differs from `full`, the row's words say `full` ("2 messages waiting",
 * "Waiting for you"). `boxed`: the Bot waits on the person (Needs you, Paused), so its status keeps the pill's box.
 */
export const railStatus = (shown: string, full: string, tone: Tone, boxed: boolean): ReactNode => (
  <span className={p.railStatusTrack} data-boxed={boxed ? '' : undefined}>
    <StatusPill tone={tone} dot>
      {shown === full ? (
        shown
      ) : (
        <>
          <span aria-hidden="true" data-rail-status-word="">
            {shown}
          </span>
          <SrOnly>{full}</SrOnly>
        </>
      )}
    </StatusPill>
  </span>
);
