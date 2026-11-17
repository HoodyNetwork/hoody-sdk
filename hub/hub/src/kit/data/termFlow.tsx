// Terminal-only (not a sibling): a sentence that holds controls, flowing as the web's inline text does. The layouts'
// Inline keeps each run of text as one box, so a row that must wrap breaks only at a control: the words after it drop
// whole to the next row, even a lone ". Then …". Flow gives every word its own box (its trailing space with it), so the
// row breaks at any word, before or after a control. All-text content stays one Text (the engine wraps it by word).
import { Fragment, type ReactNode } from 'react';
import { Box, Text } from '@term/prim';
import type { Colour } from '@term/kit';
import { pieces } from '../layouts/termParts';

/** A word with the blanks that follow it, or leading blanks alone: joined back they are the text. */
export function flowWords(text: string): string[] {
  return text.match(/\s+|\S+\s*/g) ?? [];
}

/** `words`: break only at blanks even when the content is all text (the engine's own wrap also breaks after an opening
 *  bracket, so "spreads (DNS)." could end a row with "("). */
export function Flow({ children, colour = 'ink', words = false }: { children: ReactNode; colour?: Colour; words?: boolean }): ReactNode {
  const ps = pieces(children);
  if (ps.length === 0) return null;
  if (!words && ps.every((p) => typeof p === 'string' || typeof p === 'number')) return <Text colour={colour}>{ps.join('')}</Text>;
  const out: ReactNode[] = [];
  let text = '';
  const flush = () => {
    for (const w of flowWords(text)) out.push(<Text key={`w${out.length}`} colour={colour} shrink={1}>{w}</Text>);
    text = '';
  };
  for (const p of ps) {
    if (typeof p === 'string' || typeof p === 'number') text += String(p);
    else { flush(); out.push(<Fragment key={`e${out.length}`}>{p}</Fragment>); }
  }
  flush();
  return <Box dir="row" wrap shrink={0} align="start">{out}</Box>;
}
