// The billing page's small shared pieces in the terminal: the same names as Bits.tsx, drawn with the terminal prims
// (no CSS module). A section is its heading (with its actions on the same row), the description under it, then its
// content; a band is the kit Band; money and a flag are text. The heading takes no focus here: the terminal moves to a
// section by its anchor, never by focusing a heading.
export { say } from './Bits.pure';
export type { T } from './Bits.pure';
export type { BandProps, SectionProps } from './Bits';
import { Band as KitBand, type BandTone, OUTCOME_ICON, countryFlag } from '@kit';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Box, Text } from '@term/prim';
import { cents } from '../logic';
import type * as Web from './Bits';

export const Money: typeof Web.Money = ({ cents: c }) => <Text>{c === null || c === undefined ? '—' : cents(c)}</Text>;

/** A description's pieces: text runs as one muted Text each, every element (a FAQ link) as its own box, side by side,
 *  wrapping. A fragment is opened, so "lede <FaqLink/>" reads as on the web. */
function pieces(node: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let text = '';
  const walk = (n: ReactNode) => {
    Children.forEach(n, (c) => {
      if (c === null || c === undefined || typeof c === 'boolean') return;
      if (typeof c === 'string' || typeof c === 'number') { text += String(c); return; }
      if (isValidElement(c) && c.type === Fragment) { walk((c.props as { children?: ReactNode }).children); return; }
      if (text.trim()) out.push(<Text key={`t${out.length}`} colour="muted" shrink={1}>{text.trim()}</Text>);
      text = '';
      out.push(<Box key={`e${out.length}`} dir="row" shrink={0}>{c}</Box>);
    });
  };
  walk(node);
  if (text.trim()) out.push(<Text key={`t${out.length}`} colour="muted" shrink={1}>{text.trim()}</Text>);
  return out;
}

function Description({ children }: { children: ReactNode }) {
  const ps = pieces(children);
  if (ps.length === 0) return null;
  if (ps.length === 1) return <>{ps[0]}</>;
  return <Box dir="row" wrap gapX={1} shrink={0}>{ps}</Box>;
}

export const Section: typeof Web.Section = ({ id, title, description, actions, children }) => (
  <Box dir="column" gap={1} shrink={0} sem={{ role: 'region', id: `billing-${id}`, labelledBy: `billing-${id}-title` }}>
    <Box dir="column" shrink={0}>
      <Box dir="row" wrap gapX={2} justify="between" shrink={0}>
        <Text bold sem={{ role: 'heading', level: 2, id: `billing-${id}-title` }}>{title}</Text>
        {actions && <Box dir="row" wrap gapX={1} shrink={0}>{actions}</Box>}
      </Box>
      {description !== undefined && description !== null && <Description>{description}</Description>}
    </Box>
    {children}
  </Box>
);

// A band showing a sent change whose answer is unknown (`outcome: 'pending'`) wears the kit's pending mark (a clock, ◷),
// as the terminal Outcome line and the kit Band do for a pending answer: cells have no data attribute to carry the kind,
// so the mark carries it. `dataAttr` is a DOM marker for the web shot scan and tests only; nothing reads it here.
export const Band: typeof Web.Band = ({ tone, children, actions, error, outcome }) => {
  const kit: BandTone = tone === 'warn' ? 'warn' : tone === 'danger' ? 'danger' : 'neutral';
  const icon = outcome === 'pending' ? OUTCOME_ICON.pending : tone === 'ok' ? 'check-circle' : undefined;
  return (
    <KitBand tone={kit} icon={icon} actions={actions} error={error}>
      {children}
    </KitBand>
  );
};

export const Flag: typeof Web.Flag = ({ code }) => {
  const glyph = countryFlag(code);
  if (!glyph) return null;
  return <Text sem={{ role: 'img', name: String(code).toUpperCase() }}>{glyph}</Text>;
};
