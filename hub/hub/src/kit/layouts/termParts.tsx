// Terminal-only parts the layout siblings share (not a sibling: nothing on the web imports it).
// - say(): a slot that may be text or a node; text gets a Text, a node is left as it is.
// - Inline: a run of mixed text and controls (a subtitle "15 schedules · next … · [Computers ›]") laid out as one
//   flowing line that wraps, instead of one block per piece. Fragments are opened, so the pieces a page writes as
//   `<>{text}{' · '}<TextButton/></>` sit side by side.
import { Children, createContext, Fragment, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { Box, Text, useTerminalSize, type Colour, type Focusable } from '../../term/prim';
import { SHORT_ROWS } from './termBreaks';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import { useStyleResolver, type StyleResolver } from '../../term/jsx/style';
import { useRegionRows } from './scrollOwner';

/** A page header's place for a panel one of its actions opens in place (AgentHint): the row under the title and the
 *  actions, full width. The web's panel is a popover; inline beside the actions it took the row's whole width and pushed
 *  the header's other actions ([⋯], New entry) past the screen's edge (Vault 80x24, 120x40). null outside a header. */
export const HeaderPanelSlot = createContext<((panel: ReactNode) => void) | null>(null);

const empty = (n: ReactNode): boolean => n === undefined || n === null || n === false || n === '' || n === true;

/** Text for a string or number, the node otherwise, null when there is nothing. */
export function say(n: ReactNode, o: { bold?: boolean; colour?: Colour; truncate?: boolean } = {}): ReactNode {
  if (empty(n)) return null;
  if (typeof n === 'string' || typeof n === 'number') return <Text bold={o.bold} colour={o.colour ?? (o.bold ? 'ink' : 'muted')} truncate={o.truncate}>{n}</Text>;
  return n;
}

/** The pieces of a node with fragments and arrays opened, in order; holes dropped. */
export function pieces(n: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  const walk = (x: ReactNode) => {
    if (empty(x)) return;
    if (Array.isArray(x)) { for (const y of x) walk(y as ReactNode); return; }
    if (isValidElement(x) && x.type === Fragment) { Children.forEach((x as ReactElement<{ children?: ReactNode }>).props.children, walk); return; }
    out.push(x);
  };
  walk(n);
  return out;
}

/** True when a node is only text (strings and numbers, through fragments). */
export function isPlain(n: ReactNode): boolean {
  return pieces(n).every((p) => typeof p === 'string' || typeof p === 'number');
}

/**
 * Mixed text and controls as one wrapping line. All-text content is one Text (it wraps by word). Otherwise each run of
 * adjacent text is one Text and each element keeps its own box, side by side, wrapping to the next row when the width
 * runs out. A separator piece (' · ') at the start of a wrapped row is not avoidable without measuring; it reads.
 */
/** `gap`: cells between the pieces when the web lays them out with a flex gap (DetailHeader meta: --sp-2, one cell). */
export function Inline({ children, colour = 'muted', truncate, gap }: { children: ReactNode; colour?: Colour; truncate?: boolean; gap?: number }): ReactNode {
  const resolve = useStyleResolver();
  const ps = pieces(children);
  if (ps.length === 0) return null;
  if (!gap && ps.every((p) => typeof p === 'string' || typeof p === 'number')) return <Text colour={colour} truncate={truncate}>{ps.join('')}</Text>;
  // Lines: a piece whose class makes it a block takes a line of its own, as in the web's inline flow.
  const lines: ReactNode[][] = [[]];
  let n = 0;
  let text = '';
  const flush = () => { if (text !== '') lines[lines.length - 1]!.push(<Text key={`t${n++}`} colour={colour} shrink={1}>{text}</Text>); text = ''; };
  for (const p of ps) {
    if (typeof p === 'string' || typeof p === 'number') { text += String(p); continue; }
    flush();
    const el = <Fragment key={`e${n++}`}>{p}</Fragment>;
    if (blockPiece(p, resolve)) lines.push([el], []);
    else lines[lines.length - 1]!.push(el);
  }
  flush();
  const rows = lines.filter((l) => l.length > 0).map((l, i) => <Box key={i} dir="row" wrap shrink={0} align="start" {...(gap ? { gap } : {})}>{l}</Box>);
  return rows.length === 1 ? rows[0] : <Box dir="column" shrink={0}>{rows}</Box>;
}

/** An element whose classes make it a block now (`display: block` on a span, often only under a width condition: Home's
 *  "What is Hoody?" under the title on a narrow page). The same reading as the compat runtime's own (jsx/dom classBlock);
 *  a hidden one is no line. */
function blockPiece(p: ReactNode, resolve: StyleResolver | null): boolean {
  if (!resolve || !isValidElement(p)) return false;
  const cls = (p.props as { className?: unknown }).className;
  if (typeof cls !== 'string' || cls.trim() === '') return false;
  const st = resolve({ tag: typeof p.type === 'string' ? p.type : 'span', classes: cls.split(/\s+/).filter(Boolean), attrs: {}, empty: false }, []);
  return st?.box?.hidden !== true && (st?.box?.dir === 'column' || st?.box?.raw?.flexDirection === 'column');
}

/** The terminal's size in cells (prim's hook: one shared listener per renderer). */
export { useTerminalSize as useTermSize } from '../../term/prim';

/**
 * The semantics of a focusable box (useFocusable): role, name, states, plus the focused state from the handle. Returns
 * one ref for `boxRef` (the focus ref and the semantics ref merged). Names are the web's aria-label.
 */
export function useFocusSem(f: Focusable, sem: Sem): (node: unknown) => void {
  const semRef = useSem(sem, { focus: f });
  return useMemo(() => mergeRefs(f.ref as never, semRef), [f.ref, semRef]); // contract-any: engine node type
}

/** A page body that ends in the page's questions (the web's `margin-block-start: auto` on `.faq` /
 *  `.listFaq`): the body is at least as tall as its scroll region and the free rows go above the questions, so under a
 *  short list, table or dashboard they sit at the region's bottom, in flow. A long body has no free rows: they follow
 *  the content and scroll with it. Goes directly inside the region's scroll owner (PageBody). */
export function QuestionsLast({ children, faq }: { children: ReactNode; faq: ReactNode }): ReactNode {
  const rows = useRegionRows();
  return (
    <Box dir="column" shrink={0} minHeight={rows ?? 0}>
      {children}
      <Box grow={1} shrink={1} minHeight={0} />
      {faq}
    </Box>
  );
}

/** A block a layout places above the page's content (a bar-only view strip, a stat line): one blank row under it (the
 *  web's gap between them), none in a short terminal (SHORT_ROWS). */
export function PageBlock({ children, gap = true }: { children: ReactNode; gap?: boolean }): ReactNode {
  const tall = useTerminalSize().height >= SHORT_ROWS && gap;
  return <Box dir="column" shrink={0} {...(tall ? { pad: { bottom: 1 } } : {})}>{children}</Box>;
}
