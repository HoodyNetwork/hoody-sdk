// CountBadge in the terminal: the count in round brackets after its label, "(3)" or "(99+)", inside the text run it
// sits in. An accent count (something is waiting on the person) is bold in the accent colour; a neutral one is muted.
// With `label` the count is named in words ("3 unread"); `hidden` keeps it out of the names (its link or button
// already says the count). The counting rule is the web's (countText).
import type * as Web from './CountBadge';
import { Text } from '../../term/prim';

export type { CountBadgeProps } from './CountBadge';

/** The count as shown: whole, never negative, capped at `max`; a lower bound gets a "+". */
export const countText: typeof Web.countText = (count, max, atLeast = false) => {
  const n = Math.max(0, Math.floor(count));
  if (n > max) return `${max}+`;
  return atLeast ? `${n}+` : String(n);
};

export const CountBadge: typeof Web.CountBadge = ({ count, max = 99, atLeast = false, hidden = false, tone = 'neutral', label }) => {
  const text = countText(count, max, atLeast);
  const sem = hidden ? { hidden: true as const } : label ? { role: 'img' as const, name: label } : undefined;
  return <Text shrink={0} colour={tone === 'accent' ? 'acc' : 'muted'} bold={tone === 'accent'} {...(sem ? { sem } : {})}>{`(${text})`}</Text>;
};

// It stays inside a text run ("Inbox (3)" is one line), as the web's inline box does.
(CountBadge as { hxInline?: boolean }).hxInline = true;
