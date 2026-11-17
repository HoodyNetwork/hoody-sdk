// Reply.term: the agent's reply in a terminal. The same markdown model as the web (md.ts parseMd: safe nodes only, every
// link through the reader, secrets hidden) drawn with prim text, never parsed again and never handed to a renderer that
// interprets markup or escapes: agent output is untrusted, and every string still passes prim's output filter (safe.ts).
//
//   paragraph   wrapped words; **bold**, *italic*, `code` (coloured; in mono between backticks, so it reads without colour)
//   link        the words, underlined, as a terminal hyperlink (OSC 8) to the checked address, then its host in brackets
//               when the words do not already say it. A bare address is drawn whole and wraps: never cut with an ellipsis.
//   heading     bold and underlined (the web draws every level at body size in a chat, as here)
//   list        "• " / "1. " with a hanging indent
//   quote       a "│ " rail
//   table       aligned columns when they fit (header bold, a rule under it); columns shrink and wrap when they do not;
//               below 8 cells a column, each row becomes "Header: value" lines (nothing is cut)
//   code        the kit CodeBlock (same highlighter as the web, Copy button), its language above it, folded past
//               COLLAPSE_LINES lines to the web's peek with "N more lines" / "Show less"
//   caret       ▍ after the last block while the reply streams
// Marks and actionable paths are drawn as text marks here (no menu yet): a mark shows the web's label (markLabel: the
// computer's name, the thing on it, its state), a path is underlined. As on the web, a link on some computer asks the host
// for the realm's list (`want`), words that hold an id are never drawn (a mark stands alone, a plain link shows ••••), and
// the real host after misleading words is the parser's, drawn once. ResultRow's site and the footer menu come from the same
// pure code as the web (Reply.pure.ts, ResultRow.term.tsx).
import { createContext, memo, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './Reply';
import { Box, Text, useBoxSize, useInText, cellWidth } from '@term/prim';
import { colourTier, safeText, type Colour } from '@term/kit';
import { labelNamesOtherHost, maskAddress } from '@core';
import { breakRuns, type Run } from './lineBreak.pure';
import { hyperlinksOn, linkHostShown } from './linkShown';
import { SEP, tableWidths } from './tableWidths';
import { TextButton, holdsId } from '../controls/Link';
import { BULLETS } from '../controls/Link.pure';
import { CodeBlock, CopyButton } from '../data/Ids';
import { formatNumber } from '../format';
import { useStrings } from '../strings';
import { COLLAPSE_LINES, kitLang, langOf, lineCount, peekOf } from './code';
import { hideSecrets } from './md';
import { useLinkHost, type Mark } from './linkHost';
import { parseMd, plain, type Inline, type MdBlock } from './md';
import { marksOf, pathsOf } from './Reply.pure';
import { markLabel } from './markLabel';
import markStrings from './LinkMark.strings.en.json';
import strings from './Conversation.strings.en.json';

export { siteMark } from './Reply.pure';

const Marks = createContext<ReadonlyMap<Inline, Mark> | null>(null);
const Paths = createContext<ReadonlySet<string> | null>(null);

/** How a run of prose is drawn. */
interface St { readonly bold?: boolean; readonly italic?: boolean; readonly underline?: boolean; readonly colour?: Colour; readonly href?: string }
interface InlineCtx { t: ReturnType<typeof useStrings<typeof strings>>; mt: ReturnType<typeof useStrings<typeof markStrings>>; marks: ReadonlyMap<Inline, Mark> | null; paths: ReadonlySet<string> | null; mono: boolean }

/** The styled runs of inline markdown, in order (one St object per run: breakRuns keeps a run's style across a line end). */
function runsOf(c: readonly Inline[], k: InlineCtx, base: St): Run<St>[] {
  const out: Run<St>[] = [];
  const add = (s: string, st: St): void => { if (s) out.push({ s, st }); };
  for (const x of c) {
    const m = k.marks?.get(x);
    if (x.k === 'text') { add(x.s, base); continue; }
    if (x.k === 'path') {
      if (k.paths?.has(x.target)) add(x.s, { ...base, colour: 'blueText', underline: true });
      else add(x.code && k.mono ? '`' + x.s + '`' : x.s, x.code ? { ...base, colour: 'acc' } : base);
      continue;
    }
    if (x.k === 'code') {
      if (!m) { add(k.mono ? '`' + x.s + '`' : x.s, { ...base, colour: 'acc' }); continue; }
      add('◆ ' + markLabel(m, k.mt), { ...base, colour: 'blueText', underline: true, href: m.open?.k === 'tab' ? m.open.href : undefined });
      continue;
    }
    if (x.k === 'b') { out.push(...runsOf(x.c, k, { ...base, bold: true })); continue; }
    if (x.k === 'i') { out.push(...runsOf(x.c, k, { ...base, italic: true })); continue; }
    if (x.k === 'blocked') { out.push(...runsOf(x.c, k, base)); add(' ' + k.t('agent.linkBlocked'), base); continue; }
    const words = plain(x.c);
    // Words that hold an id are not shown (the web's rule: the Link masks them, a mark stands alone).
    const idWords = holdsId(words);
    if (m) {
      const kept = x.bare || idWords ? '' : words;
      add((kept ? kept + ' ' : '') + '◆ ' + markLabel(m, k.mt), { ...base, colour: 'blueText', underline: true, href: m.open?.k === 'tab' ? m.open.href : undefined });
      continue;
    }
    // The words as a hyperlink to the checked address, then the host as one unit "(host)" (the breaker never splits it from
    // its brackets) when linkHostShown says the reader needs it. Words naming another host already have it: the parser
    // wrote " (host)" after them (md.ts linkNodes, the same test), so it is never drawn twice. A computer's host holds its
    // ids: they are masked (maskAddress), as everywhere an address is shown.
    const link: St = { ...base, colour: 'blueText', underline: true, href: x.href };
    if (idWords) add(BULLETS, link);
    else out.push(...runsOf(x.c, k, link));
    const shown = idWords ? BULLETS : words;
    if (labelNamesOtherHost(words, x.host) === null && linkHostShown(shown, x.host, !!x.bare, hyperlinksOn())) add(` (${maskAddress(x.host)})`, { ...base, colour: 'muted' });
  }
  return out;
}

/** What runsOf reads, from the reply's strings and the Prose around it (one object per change, for memo deps). */
function useInlineCtx(): InlineCtx {
  const t = useStrings(strings);
  const mt = useStrings(markStrings);
  const marks = useContext(Marks);
  const paths = useContext(Paths);
  const mono = colourTier() === 'mono';
  return useMemo(() => ({ t, mt, marks, paths, mono }), [t, mt, marks, paths, mono]);
}

/** One styled run as prim text. */
const drawRun = (r: Run<St>, j: number): ReactElement => <Text key={j} bold={r.st.bold} italic={r.st.italic} underline={r.st.underline} colour={r.st.colour} href={r.st.href}>{r.s}</Text>;

/** A paragraph, heading or list item: its runs broken into lines by breakRuns at the width the box gets (the engine's own
 *  word wrap only before the first measure). Each line is drawn whole, never wrapped again. */
function Flow({ c, base = PLAIN, tail }: { c: readonly Inline[]; base?: St; tail?: Run<St> }): ReactElement {
  const k = useInlineCtx();
  // Measured as drawn: every string reaches the screen through safeText (an escape becomes one U+FFFD cell, a bidi control or
  // zero width goes), so the lines are broken on that text, never on the raw one (a raw ESC measures 0 and its line overflowed).
  const runs = useMemo(() => [...runsOf(c, k, base), ...(tail ? [tail] : [])].map((r) => ({ s: safeText(r.s), st: r.st })), [c, k, base, tail]);
  const inText = useInText();
  const [w, setW] = useState(0);
  const lines = useMemo(() => (w > 0 ? breakRuns(runs, w, cellWidth) : null), [runs, w]);
  // The unbroken text's width (its widest hard line), for a parent that sizes to its content (a chat bubble).
  const natural = useMemo(() => Math.max(0, ...breakRuns(runs, Number.MAX_SAFE_INTEGER, cellWidth).map((ln) => ln.reduce((n, r) => n + cellWidth(r.s), 0))), [runs]);
  const draw = drawRun;
  // Inside someone's Text (a web page drawing prose in its own paragraph through compat), no box can sit: the runs go inline
  // and that Text wraps them.
  if (inText) return <>{runs.map(draw)}</>;
  return (
    // Sized by its parent, never by its lines (lines sized by the box would narrow it on every measure): it stretches across
    // its column. In a row, put it in a growing box (as list items do).
    <Box dir="column" shrink={0} alignSelf="stretch" onSize={(x) => { if (x !== w) setW(x); }}>
      {lines ? lines.map((ln, i) => <Text key={i}>{ln.length ? ln.map(draw) : ' '}</Text>) : <Text>{runs.map(draw)}</Text>}
      {/* Without it the broken lines alone sized a shrink-to-fit parent: after a narrow window the parent kept the
          narrow width, so the lines broke narrow again when the window grew back (seen on Bots Activity). */}
      {lines && <Box width={natural} maxWidth="100%" height={0} shrink={0} />}
    </Box>
  );
}
const PLAIN: St = {};
const HEADING: St = { bold: true, underline: true };

/** A fenced block: language above, the kit CodeBlock, folded to the web's peek past COLLAPSE_LINES lines. */
export const FoldedCode: typeof Web.FoldedCode = ({ text, lang, label, path, whole }) => {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const lines = lineCount(text);
  const long = !whole && lines > COLLAPSE_LINES;
  const shown = long && !open ? peekOf(text) : text;
  const tag = label ?? langOf(lang).label;
  return (
    <Box dir="column" shrink={0}>
      {/* One head row: the language, then Copy (the whole block, folded or not). */}
      <Box dir="row" gap={1}>
        <Text colour="muted" bold>{tag || t('agent.code')}</Text>
        <CopyButton text={text} label={t('agent.copy')} />
      </Box>
      <CodeBlock
        code={shown}
        label={tag || t('agent.code')}
        lang={kitLang(lang, path)} // reason: a reply block with no known language shows as text
        noCopy
      />
      {long ? (
        <Box dir="row">
          <TextButton onPress={() => setOpen((v) => !v)}>
            {open ? t('agent.showLess') : '▸ ' + t('agent.codeFolded', { n: lines - lineCount(shown) })}
          </TextButton>
        </Box>
      ) : null}
    </Box>
  );
};

// ── Tables ──────────────────────────────────────────────────────────────────────────────────────────────────────

type Cell = Run<St>[];
const HEAD_CELL: St = { bold: true };
const cellsWide = (ln: readonly Run<St>[]): number => ln.reduce((n, r) => n + cellWidth(r.s), 0);
/** A cell's widest hard line. */
const widest = (c: Cell): number => Math.max(0, ...breakRuns(c, Number.MAX_SAFE_INTEGER, cellWidth).map(cellsWide));

/** A table: each cell drawn from its inline nodes as a paragraph is (runsOf: links with their checked address and host,
 *  marks, a blocked address's warning, words holding an id masked), broken to its column's width by breakRuns. */
function TableBlock({ b }: { b: Extract<MdBlock, { k: 'table' }> }): ReactElement {
  const k = useInlineCtx();
  const [size, onSize] = useBoxSize();
  const { head, rows } = useMemo(() => {
    const of = (c: readonly Inline[], base: St): Cell => runsOf(c, k, base).map((r) => ({ s: safeText(r.s), st: r.st }));
    return { head: b.head.map((c) => of(c, HEAD_CELL)), rows: b.rows.map((r) => b.head.map((_, j) => of(r[j] ?? [], PLAIN))) };
  }, [b, k]);
  const natural = head.map((h, j) => Math.max(widest(h), ...rows.map((r) => widest(r[j]!))));
  const avail = size?.width ?? 0;
  const widths = avail > 0 ? tableWidths(natural, avail) : null;
  let body: ReactNode = null;
  if (avail > 0 && widths) {
    const line = (cells: readonly Cell[], base: St, key: string): ReactNode[] => {
      const wrapped = cells.map((c, j) => {
        const ls = breakRuns(c, widths[j]!, cellWidth);
        return ls.length ? ls : [[]];
      });
      const h = Math.max(1, ...wrapped.map((w) => w.length));
      const out: ReactNode[] = [];
      for (let r = 0; r < h; r++) {
        const parts: Run<St>[] = [];
        wrapped.forEach((w, j) => {
          const ln = w[r] ?? [];
          if (j > 0) parts.push({ s: SEP, st: base });
          parts.push(...ln);
          // Padded to the column's width (not the last column: nothing follows it).
          const pad = widths[j]! - cellsWide(ln);
          if (pad > 0 && j < wrapped.length - 1) parts.push({ s: ' '.repeat(pad), st: base });
        });
        // Nothing after the last words of the line (the row's empty tail cells draw no separator spaces).
        while (parts.length && /^\s*$/.test(parts[parts.length - 1]!.s)) parts.pop();
        const last = parts[parts.length - 1];
        if (last && /\s+$/.test(last.s)) parts[parts.length - 1] = { s: last.s.replace(/\s+$/, ''), st: last.st };
        out.push(<Text key={key + r}>{parts.length ? parts.map(drawRun) : ' '}</Text>);
      }
      return out;
    };
    const rule = widths.map((w) => '─'.repeat(w)).join('─┼─');
    body = (
      <>
        {line(head, HEAD_CELL, 'h')}
        <Text colour="line">{rule}</Text>
        {rows.flatMap((r, i) => line(r, PLAIN, 'r' + i))}
      </>
    );
  } else if (avail > 0) {
    // Too narrow for columns: each row as "Header: value" lines, a blank row between rows.
    body = rows.map((r, i) => (
      <Box key={i} dir="column" pad={{ bottom: i < rows.length - 1 ? 1 : 0 }}>
        {r.map((c, j) => <Text key={j}>{[...head[j]!, { s: ': ', st: HEAD_CELL }, ...c].map(drawRun)}</Text>)}
      </Box>
    ));
  }
  return <Box dir="column" shrink={0} onSize={onSize} sem={{ role: 'table', name: head.map((c) => c.map((r) => r.s).join('')).join(', ') }}>{body}</Box>;
}

// ── Blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────

const CARET = '▍';
const CARET_RUN: Run<St> = { s: CARET, st: { colour: 'focus' } };

function Block({ b, caret }: { b: MdBlock; caret?: boolean }): ReactElement | null {
  switch (b.k) {
    case 'p': return <Flow c={b.c} tail={caret ? CARET_RUN : undefined} />;
    case 'h': return <Flow c={b.c} base={HEADING} />;
    case 'hr': return <Box border={['top']} borderColour="line" height={1} />;
    case 'ul':
    case 'ol':
      return (
        <Box dir="column" shrink={0}>
          {b.items.map((it, i) => {
            const mark = b.k === 'ul' ? '• ' : `${b.start + i}. `;
            return (
              <Box key={i} dir="row">
                <Text colour="muted" shrink={0}>{mark}</Text>
                <Box grow={1} shrink={1}><Flow c={it} /></Box>
              </Box>
            );
          })}
        </Box>
      );
    case 'quote':
      return (
        <Box dir="row" shrink={0}>
          <Box border={['left']} borderColour="lineStrong" width={2} shrink={0} />
          <Box dir="column" grow={1} shrink={1} gap={1}>{b.c.map((x, i) => <Block key={i} b={x} />)}</Box>
        </Box>
      );
    case 'table': return <TableBlock b={b} />;
    case 'code': return <FoldedCode text={b.s.replace(/\n+$/, '')} lang={b.lang} />;
  }
}

/** Markdown prose, memoised on its text: while a reply streams only its last block changes. */
export const Prose: typeof Web.Prose = memo(function Prose({ text, caret, marks }: { text: string; caret?: boolean; marks?: boolean }) {
  const host = useLinkHost();
  const blocks = useMemo(() => parseMd(text), [text]);
  const on = !!marks && !caret && host !== null;
  const map = useMemo(() => (on && host ? marksOf(blocks, host) : null), [on, host, blocks]);
  const paths = useMemo(() => (marks && !caret ? pathsOf(blocks) : null), [marks, caret, blocks]);
  // A link on some computer asks the host for the realm's list (read only once a reply needs it). A local address needs it only
  // when the chat runs on a computer (it is read there). The web's rule (Reply.tsx Prose).
  const wants = !!map && [...map.values()].some((m) => m.kind !== 'hub' && (m.kind !== 'local' || !!host?.runs));
  const want = host?.want;
  useEffect(() => {
    if (wants) want?.();
  }, [wants, want]);
  const last = blocks[blocks.length - 1];
  return (
    <Marks.Provider value={map}>
      <Paths.Provider value={paths}>
        <Box dir="column" gap={1} shrink={0}>
          {blocks.map((b, i) => <Block key={i} b={b} caret={caret && i === blocks.length - 1} />)}
          {caret && last?.k !== 'p' ? <Text colour="focus">{CARET}</Text> : null}
        </Box>
      </Paths.Provider>
    </Marks.Provider>
  );
}) as typeof Web.Prose;

export const ReplyBox: typeof Web.ReplyBox = ({ children }) => <Box dir="column" shrink={0} gap={1}>{children}</Box>;

const noMenuOpen = (_open: boolean): void => undefined;
const FooterMenuOpen = createContext<(open: boolean) => void>(noMenuOpen);
export const useFooterMenuOpen: typeof Web.useFooterMenuOpen = () => useContext(FooterMenuOpen);

const hhmm = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Copy · cost · time · the host's turn menu. Always shown (a terminal has no hover). */
export const ReplyFooter: typeof Web.ReplyFooter = ({ text, cost, at, menu }) => {
  const t = useStrings(strings);
  // Copy writes what the reply shows: a key the Prose hides is hidden in the copy too (the web footer's rule).
  const copied = useMemo(() => hideSecrets(text), [text]);
  const bits: string[] = [];
  if (cost !== null && cost > 0) bits.push(t('agent.cost', { n: cost < 0.01 ? cost.toFixed(4) : formatNumber(Math.round(cost * 1000) / 1000) }));
  if (at !== null) bits.push(hhmm(at));
  return (
    <Box dir="row" gap={1} shrink={0}>
      <CopyButton text={copied} label={t('agent.copy')} withLabel />
      {bits.length ? <Text colour="faint">{bits.join(' · ')}</Text> : null}
      <FooterMenuOpen.Provider value={noMenuOpen}>{menu}</FooterMenuOpen.Provider>
    </Box>
  );
};
