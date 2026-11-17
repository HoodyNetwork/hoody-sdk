// Status pills, tags and small display pieces in the terminal. A tone always has a mark, so it reads without colour.
// Facts, StatStrip and StatTile lay out by the room they really have (useBoxSize). Values are text the terminal can
// select whole: a label and its value sit in one text line, columns are separated by spaces, never by box drawing.
import { Children, Fragment, isValidElement, useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './Display';
import { Box, OneLine, Pressable, Text, TONE_MARK, colourTier, useBoxSize, useInText, type Colour } from '../../term/prim';
import type { BoxRenderable } from '../../term/prim/otui';
import { useSem } from '@term/kit';
import { cellWidth, cleanText, padCells } from '../../term/prim/TableCells';
import { Link } from '../controls/Link';
import { pieces } from '../layouts/termParts';
import { useStrings } from '../strings';
import { factControls, type Fact } from './Display.pure';
import { CopyButton, IdChip } from './Ids';
import { InfoTip, plainText } from '../overlays/InfoTip';
import { flagCode } from '../flag';
import { useTagShown, useTagsWrap } from './tagYield';
import idStrings from './Ids.strings.en.json';
import { focusInk } from '@term/kit';

export { factControls };
export type { Tone, StatusPillProps, StatusToggleProps, TagTone, TagProps, RowNoteProps, MonogramProps, Fact, FactsProps, StatTileProps, Stat, StatStripProps, RealmColor, ContextLineProps } from './Display';

const TONE: Record<Web.Tone, Colour> = { neutral: 'muted', ok: 'ok', warn: 'warn', danger: 'danger', info: 'blueText', accent: 'acc' };
const MARK: Record<Web.Tone, string> = { ...TONE_MARK, accent: '◆' };
// A tag's words take the tone's colour; a marked row's tag ("This browser") takes the accent, as the web's highlight.
const TAG_TONE: Record<Web.TagTone, Colour> = { neutral: 'muted', ok: 'ok', warn: 'warn', accent: 'acc', mark: 'acc' };

/** A child as text when it is text (a string or number, or a fragment of them); null otherwise. */
function plain(node: ReactNode): string | null {
  if (typeof node === 'string' || typeof node === 'number') return cleanText(String(node));
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) {
    let out = '';
    for (const c of node) {
      const p = plain(c);
      if (p === null) return null;
      out += p;
    }
    return out;
  }
  if (isValidElement(node) && node.type === Fragment) return plain(Children.toArray((node.props as { children?: ReactNode }).children));
  return null;
}

/** Words a page passes as a ReactNode (a value, a detail, a tag's children): text when it is text (strings, numbers,
 *  fragments of them), else the element itself in a row box beside the text. An element (an InfoTip, a link, a
 *  component drawing boxes) never goes inside a Text: the engine refuses a box inside a text node. */
function Words({ node, colour, bold, before, bg }: { node: ReactNode; colour?: Colour; bold?: boolean; before?: string; bg?: Colour }): ReactElement {
  const p = plain(node);
  // Already inside running text (a Link label, a sentence): only inline spans may be drawn, so the words go as one span.
  if (useInText()) return <Text colour={colour} bold={bold} bg={bg}>{before ?? ''}{p ?? plainText(node)}</Text>;
  if (p !== null) return <Text colour={colour} bold={bold} bg={bg} shrink={0} maxLines={1}>{before ?? ''}{p}</Text>;
  return (
    <Box dir="row" shrink={0}>
      {before ? <Text colour={colour} bold={bold}>{before}</Text> : null}
      {node}
    </Box>
  );
}

// A tip (what the state means) makes the pill an InfoTip term, as on the web.
export const StatusPill: typeof Web.StatusPill = ({ tone = 'neutral', dot, children, tip }) => {
  const pill = <Words node={children} colour={TONE[tone]} before={`${dot ? '●' : MARK[tone]} `} />;
  return tip ? <InfoTip text={tip} subject={plainText(children)}>{pill}</InfoTip> : pill;
};

/** A state that is also its own switch: the pill as one pressable, named by its words, its pressed state on the node. */
export const StatusToggle: typeof Web.StatusToggle = ({ onPress, isPressed, isDisabled, tone, dot, icon, children }) => (
  <Pressable dir="row" onPress={onPress} disabled={isDisabled} sem={{ name: plainText(children), pressed: isPressed }}>
    <StatusPill tone={tone} dot={dot} icon={icon}>{children}</StatusPill>
  </Pressable>
);

interface Geo { screenX: number; width: number; overflow?: string; parent: Geo | null }

/** A secondary tag yields WHOLE: when its row leaves it less than its full width it draws nothing (never a cut " Web r"),
 *  so the name before it keeps its room. A removable tag (a chip the person acts on) is never hidden. */
export const Tag: typeof Web.Tag = (props) => (useInText() ? <InlineTag {...props} /> : <BoxTag {...props} />);

/** A Tag inside running text (a Link label, a sentence): one inline span, no tip or remove control (neither fits in a
 *  line of text; the web's tip stays reachable from the box form). */
// A tag is a tinted cell (" Command " on the raised ground: every tone's text shade is held to 4.5:1 on it), never "‹Command›": angle quotes are what docs and goldens
// use for a stand-in (a component not drawn here), so a real tag must not look like one. Mono has no tint: "(Command)"
// (buttons are "[Start]", stand-ins "‹Name›").
const TAG_BG: Colour = 'raised';
const tagMono = (): boolean => colourTier() === 'mono';
const tagWords = (s: string): string => (tagMono() ? `(${s})` : ` ${s} `);

function InlineTag({ tone = 'neutral', children }: Parameters<typeof Web.Tag>[0]): ReactElement {
  return <Text colour={TAG_TONE[tone]} bg={TAG_BG}>{tagWords(plainText(children))}</Text>;
}

function BoxTag({ tone = 'neutral', children, onRemove, tip }: Parameters<typeof Web.Tag>[0]): ReactElement {
  const kt = useStrings(idStrings);
  const words = typeof children === 'string' || typeof children === 'number' ? tagWords(String(children)) : null;
  const [room, setRoom] = useState<number | null>(null);
  // A tip (what the tag means) makes the words an InfoTip, as on the web.
  const said = (w: ReactNode) => (tip ? <InfoTip text={tip} subject={plainText(children)}><Words node={w} colour={TAG_TONE[tone]} bg={TAG_BG} /></InfoTip> : <Words node={w} colour={TAG_TONE[tone]} bg={TAG_BG} />);
  const need = words === null ? 0 : cellWidth(words);
  // Its column decides with it (tagYield.ts): in a table every drawn row shows its tag or none does. A removable or
  // element tag always shows (it is not a secondary label), so it reports nothing.
  const fits = useTagShown(room === null || words === null || onRemove ? null : room >= need);
  // The room it really has: up to the nearest edge that clips it (a table cell, a list line), not its own box (an
  // inline tag after a name may not shrink: the cell clips it). It gives way first among its siblings (shrink 1000),
  // so the name keeps its room. Measured after each layout of its box.
  const measure = (node: unknown) => {
    const me = node as Geo | null;
    if (!me) return;
    let right = Infinity;
    for (let a = me.parent; a; a = a.parent) if (a.overflow === 'hidden') right = Math.min(right, a.screenX + a.width);
    const visible = Math.min(me.width, right - me.screenX);
    setRoom((r) => (r === visible ? r : visible));
  };
  // Checked before each paint (a cell's width or a name before it can change without this box changing size).
  const hook = useRef<((n: unknown) => void) | null>(null);
  hook.current = measure;
  const boxRef = useCallback((n: BoxRenderable | null) => {
    if (n) n.renderBefore = function () { hook.current?.(n); };
  }, []);
  const wraps = useTagsWrap();
  // In a card's marks (TagsWrap) the tag never yields: its words wrap on the tint when the line is narrower (Words
  // draws one line, so the words go as their own Text here).
  if (wraps && words !== null && !onRemove) {
    const lines = <Text colour={TAG_TONE[tone]} bg={TAG_BG}>{words}</Text>;
    return <Box shrink={1} minWidth={0} maxWidth="100%">{tip ? <InfoTip text={tip} subject={plainText(children)}>{lines}</InfoTip> : lines}</Box>;
  }
  if (words === null || onRemove) {
    const p = plain(children);
    return (
      <Box dir="row" shrink={0}>
        {p !== null ? said(tagWords(p)) : (
          // Elements (a realm's swatch and name): the tint is the chip's own box, so every cell between the pads takes
          // it too, not only the pads (a grey block each side of an untinted name). Mono has no tint: "(…)". One row high
          // where the row around it stretches (a setting row as tall as its label and help): the tint was four rows deep
          // under " █ Personal " (Get a computer > Realm).
          <Box dir="row" shrink={0} alignSelf="start" bg={tagMono() ? undefined : TAG_BG}>
            <Text colour={TAG_TONE[tone]} bg={TAG_BG}>{tagMono() ? '(' : ' '}</Text>{said(children)}<Text colour={TAG_TONE[tone]} bg={TAG_BG}>{tagMono() ? ')' : ' '}</Text>
          </Box>
        )}
        {onRemove && (
          <Pressable dir="row" onPress={onRemove} sem={{ name: kt('tag.remove', { label: plainText(children) }) }}>
            {({ focused }) => <Text colour="muted" {...focusInk(focused)}>x</Text>}
          </Pressable>
        )}
      </Box>
    );
  }
  return (
    <Box dir="row" width={need} shrink={1000} minWidth={0} clip boxRef={boxRef}>
      {fits ? said(words) : null}
    </Box>
  );
};

/** Words for a screen reader only: nothing is drawn, and the words stay in the semantics tree, where a name with no
 *  role reads as text. The box that carries them is 0x0 and out of the flow, so a row's gap does not count it. */
export const SrOnly: typeof Web.SrOnly = ({ children }) => {
  const words = plainText(children).trim();
  // Inside a text run (a text button's label: the Ask trail's step mark) there is no place for the box: a text node
  // takes only text, and the engine throws on anything else. There SrOnly is nothing, as it was before it kept words.
  const inText = useInText();
  return words && !inText ? <SrWords words={words} /> : <></>;
};
function SrWords({ words }: { words: string }) {
  const ref = useSem({ name: words }, {});
  return <Box width={0} height={0} boxRef={ref as never /* contract-any: engine node type */} raw={{ position: 'absolute' }} />;
}

// Wraps whole, `cut` too: a terminal has no hover, so it follows the web's `(hover: none)` rule, where a cut note
// wraps instead of hiding its end behind a tooltip nobody can open (Account > SSH keys' comment). Out of a table cell's
// one line (OneLine off): the table row takes the lines it needs (ClipRow `onLines`).
export const RowNote: typeof Web.RowNote = ({ children }) => <OneLine off><Text colour="muted">{children}</Text></OneLine>;

// A bold letter in the accent, no inverse block: a filled cell outweighs the name beside it (and OpenTUI's inverse on a
// cell with no background draws fg = bg). Same mark as the model chooser's ProviderMark.
export const Monogram: typeof Web.Monogram = ({ name }) => <Text bold colour="acc">{(Array.from(name.trim())[0] ?? '?').toUpperCase()}</Text>;

// ── Facts ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The label column's widest (cells), so values line up; a longer label wraps in its own column. */
const LABEL_MAX = 22;
/** A column of facts needs at least this many cells to sit beside another. */
const FACT_COL_MIN = 38;

/** A piece of a mixed value as words: bare text, or a span of plain text (the web's muted reason after a pill:
 *  `<StatusPill>No</StatusPill><span> Free servers are shared…</span>`); null for a part (a pill, a meter, a link) and
 *  for a span the web hides (`hidden`, `aria-hidden`): that one stays an element, so its own hiding still applies. */
function wordsOf(x: ReactNode): string | null {
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (!isValidElement(x)) return null;
  const q = x.props as { tag?: unknown; hidden?: unknown; 'aria-hidden'?: unknown; children?: ReactNode };
  if (q.tag !== 'span' || q.hidden === true || q['aria-hidden'] === true || q['aria-hidden'] === 'true') return null;
  return plain(q.children);
}
/** The pieces that draw something: blank text and blank spans are left out (they would only add a gap). */
const drawnPieces = (v: ReactNode): ReactNode[] => pieces(v).filter((x) => wordsOf(x)?.trim() !== '');

/** A value that is words and parts side by side (a fragment holding both): some words, and some element (a part, or
 *  a span of words beside bare text: either way the fragment's children cannot go into a row as they are). */
function mixedValue(v: ReactNode): boolean {
  if (!isValidElement(v) || v.type !== Fragment) return false;
  const ps = drawnPieces(v);
  return ps.some((x) => wordsOf(x) !== null) && ps.some((x) => isValidElement(x));
}

/** Words and parts side by side (a Meter, then "7.8 GB of 16 GB in use"): on one line while the value's column holds
 *  them, else each on its own line, parts whole and words wrapping. As bare children of the value's row the part was
 *  squeezed with the words: the ten-block meter broke in two and the words drew over it. `room`: the column's cells
 *  (0: not known yet, one line). A part's width is its own drawn width, reported once it is laid out. */
function MixedValue({ value, room }: { value: ReactNode; room: number }): ReactElement {
  const ps = drawnPieces(value);
  const [parts, setParts] = useState<Readonly<Record<number, number>>>({});
  const need = ps.reduce<number>((n, x, i) => { const w = wordsOf(x); return n + (w !== null ? cellWidth(w.trim()) : parts[i] ?? 0); }, 0) + ps.length - 1;
  const line = room <= 0 || need <= room;
  return (
    <Box dir={line ? 'row' : 'column'} gap={line ? 1 : 0} shrink={1}>
      {ps.map((x, i) => (wordsOf(x) !== null
        ? <Text key={i} colour={typeof x === 'object' ? 'muted' : 'ink'} shrink={1}>{wordsOf(x)!.trim()}</Text>
        : <Box key={i} dir="row" shrink={0} onSize={(w) => setParts((was) => (was[i] === w ? was : { ...was, [i]: w }))}>{x}</Box>))}
    </Box>
  );
}

function FactValue({ f, room = 0 }: { f: Fact; room?: number }): ReactElement {
  const t = useStrings(idStrings);
  let shown: ReactNode;
  if (f.id !== undefined) return <IdChip id={f.id} />;
  if (f.href) shown = <Link href={f.href} variant="nav">{f.value}{' ›'}</Link>;
  else if (f.url !== undefined) {
    // An address is never cut: it wraps whole. A secret one shows only its scheme (as the web's masked button).
    const secret = f.secretUrl === true || /[0-9a-f]{24}/i.test(f.url);
    shown = <Text colour="blueText" underline>{secret ? `${/^https/i.test(f.url) ? 'https' : 'http'}://••••••••` : cleanText(f.url)}</Text>;
  } else {
    const p = plain(f.value);
    shown = p !== null ? <Text colour="ink">{p}</Text> : mixedValue(f.value) ? <MixedValue value={f.value} room={room} /> : f.value;
  }
  if (f.copy === undefined) return <>{shown}</>;
  return (
    <Box dir="row" gap={2} shrink={1}>
      <Box shrink={1}>{shown}</Box>
      <CopyButton text={f.copy} label={t('copy.value', { label: f.label })} />
    </Box>
  );
}

/** A list as the value (ul, ol). It needs the value column's exact width: as an item of a row it is laid out at its
 *  text's width plus its markers, two cells past the column, and the end of each wrapped line is cut. */
const isList = (v: ReactNode): boolean => isValidElement(v) && ['ul', 'ol'].includes((v.props as { tag?: unknown }).tag as string);

function FactRow({ f, labelW, spec, colW }: { f: Fact; labelW: number; spec: boolean; /** The cells of the row's column (0: not laid out yet). */ colW: number }): ReactElement {
  const label = cleanText(f.label);
  // A label wider than its column wraps there; one that fits is padded, so a selection reads "Label  value".
  const fits = cellWidth(label) <= labelW;
  if (spec) {
    return (
      <Box dir="row" shrink={0} gap={2} justify="between" border={['bottom']} borderColour="line">
        {/* The label keeps its words up to half the row (the web's fit-content(50%) column); the value wraps in the rest. */}
        <Box shrink={0} maxWidth="50%"><Text colour="muted">{label}</Text></Box>
        <Box dir="row" shrink={1}><FactValue f={f} /></Box>
      </Box>
    );
  }
  // One label column for the whole list (as wide as the longest label, up to LABEL_MAX): a longer label wraps inside it,
  // and every value starts at the same x, two cells after the column.
  return (
    <Box dir="row" shrink={0}>
      <Box dir="row" width={labelW + 2} shrink={0}>
        <Text colour="muted" width={labelW}>{fits ? padCells(label, labelW) : label}</Text>
      </Box>
      <Box dir={isList(f.value) ? 'column' : 'row'} shrink={1} grow={1} minWidth={0}><FactValue f={f} room={Math.max(0, colW - labelW - 2)} /></Box>
    </Box>
  );
}

/** The cells a plain-words value needs on one line, with its copy mark (two cells, then "⧉ copy"); 0 for a value that
 *  is not plain words (an id chip, an address, parts: each has its own rule). */
function plainCells(f: Fact): number {
  if (f.id !== undefined || f.href || f.url !== undefined) return 0;
  const p = plain(f.value);
  return p === null ? 0 : cellWidth(p) + (f.copy === undefined ? 0 : 8);
}

export const Facts: typeof Web.Facts = ({ items, columns = 2, layout = 'grid' }) => {
  const [size, onSize] = useBoxSize();
  const spec = layout === 'spec';
  const grid = items.filter((f) => !f.wide);
  const wide = items.filter((f) => f.wide);
  const room = size?.width ?? 0;
  const labelW = Math.min(LABEL_MAX, Math.max(0, ...items.map((f) => cellWidth(cleanText(f.label)))));
  // A column's cells: the room less the gaps between columns (3 each), shared evenly.
  const widthOf = (n: number) => (room > 0 ? Math.floor((room - 3 * (n - 1)) / n) : 0);
  // As many of the asked columns as the room holds (one below FACT_COL_MIN each), filled top-down; and one fewer while
  // a plain value (with its copy mark) does not fit beside its label: a time split in two columns at 80
  // ("2026-11-11T08" / ":46:57.000Z") although the whole row had the room for it.
  let cols = Math.max(1, Math.min(columns, Math.floor(room / FACT_COL_MIN) || 1));
  while (cols > 1 && grid.some((f) => plainCells(f) > widthOf(cols) - labelW - 2)) cols -= 1;
  const perCol = Math.max(1, Math.ceil(grid.length / cols));
  const colW = widthOf(cols);
  const colList = Array.from({ length: cols }, (_, c) => grid.slice(c * perCol, (c + 1) * perCol));
  return (
    // The whole width of its container: in a wrapping row (beside a pill) its columns, which share the room they are
    // given, had no room of their own and every value collapsed to one cell.
    <Box dir="column" shrink={0} width="100%" onSize={onSize}>
      <Box dir="row" gap={3} shrink={0}>
        {colList.map((list, c) => (
          <Box key={c} dir="column" grow={1} basis={0} shrink={1}>
            {list.map((f, i) => <FactRow key={`${c}-${i}-${f.label}`} f={f} labelW={labelW} spec={spec} colW={colW} />)}
          </Box>
        ))}
      </Box>
      {wide.length > 0 && (
        <Box dir="column" shrink={0} pad={grid.length > 0 ? { top: 1 } : undefined}>
          {wide.map((f, i) => <FactRow key={`w-${i}-${f.label}`} f={f} labelW={labelW} spec={spec} colW={room} />)}
        </Box>
      )}
    </Box>
  );
};

// ── Stats ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const StatTile: typeof Web.StatTile = ({ label, value, hint, tone = 'neutral', tip }) => (
  <Box dir="column" shrink={0} padX={1}>
    <Box dir="row" gap={1}><Text colour="muted">{label}</Text>{tip ? <InfoTip text={tip} subject={label} /> : null}</Box>
    <Words node={value} colour={tone === 'neutral' ? 'ink' : TONE[tone]} bold before={tone === 'neutral' ? '' : `${MARK[tone]} `} />
    {hint !== undefined && hint !== null && <Words node={hint} colour="muted" />}
  </Box>
);

/** Widths of the parts that are elements (an upgrade link under "7 of 8"), as they were drawn: text is counted, an
 *  element can only be measured. Keyed by the stat's label and the part. */
type Drawn = Readonly<Record<string, number>>;

/** A stat's own width in cells (label, then number and caption). */
function statWidth(x: Web.Stat, drawn: Drawn): number {
  const part = (node: ReactNode, k: string): number => { const p = plain(node); return p === null ? drawn[`${x.label}\u0000${k}`] ?? 0 : cellWidth(p); };
  return Math.max(cellWidth(x.label) + (x.status ? 2 : 0), part(x.value, 'v'), part(x.detail ?? '', 'd'));
}

/** A number or caption; one that is an element reports the width it was drawn at (its own, never a stretched one).
 *  `wraps`: a caption in words takes the lines it needs in the room it has (the web's .ssDetail wraps), at the line's
 *  end when `end`; never one line running past the strip or over the label. */
function StatPart({ node, k, bold, wraps, end, onDrawn }: { node: ReactNode; k: string; bold?: boolean; wraps?: boolean; end?: boolean; onDrawn: (k: string, w: number) => void }): ReactElement {
  const p = plain(node);
  if (p !== null && wraps) return <Text colour="muted" align={end ? 'right' : 'left'}>{p}</Text>;
  const words = <Words node={node} colour={bold ? 'ink' : 'muted'} bold={bold} />;
  if (p !== null) return words;
  return <Box dir="row" shrink={0} onSize={(w) => onDrawn(k, w)}>{words}</Box>;
}

/** `narrow`: the strip left its one row (pairs or rows): the cell may be given less than its words' width, so its
 *  caption wraps and its label keeps its cells. */
function StatCell({ x, row, narrow, onDrawn }: { x: Web.Stat; row: boolean; narrow?: boolean; onDrawn: (k: string, w: number) => void }): ReactElement {
  const head = <Text colour="muted" shrink={0}>{x.status ? <Text colour={TONE[x.status]}>{MARK[x.status]} </Text> : null}{x.label}</Text>;
  const drawn = (k: string, w: number): void => onDrawn(`${x.label}\u0000${k}`, w);
  // As the web's .ssValue (a column): the number on its own line, the detail under it ("8" over "4 running · 2 stopped",
  // never "8 4 running"); in the narrow rows form both sit at the line's end.
  // A short caption that reads on from the number ("3%" + "of 50 MB") sits on the number's row when the pair is no wider
  // than the label, so the cell does not grow and no caption is left alone on a third row. A caption
  // that starts with a digit or a capital ("4 running", "This month") stays under: "8 4 running" is never drawn.
  const [pv, pd] = [plain(x.value), x.detail === undefined || x.detail === null ? null : plain(x.detail)];
  const inline = !row && !narrow && pv !== null && pd !== null && /^\p{Ll}/u.test(pd) && cellWidth(pv) + 1 + cellWidth(pd) <= cellWidth(x.label) + (x.status ? 2 : 0);
  const val = inline ? (
    <Box dir="row" gap={1} shrink={0}>
      <StatPart node={x.value} k="v" bold onDrawn={drawn} />
      <StatPart node={x.detail} k="d" onDrawn={drawn} />
    </Box>
  ) : (
    <Box dir="column" shrink={narrow ? 1 : 0} minWidth={narrow ? 0 : undefined} align={row ? 'end' : 'start'}>
      <StatPart node={x.value} k="v" bold onDrawn={drawn} />
      {x.detail !== undefined && x.detail !== null ? <StatPart node={x.detail} k="d" wraps={narrow} end={row} onDrawn={drawn} /> : null}
    </Box>
  );
  if (row) return <Box dir="row" justify="between" gap={2} shrink={0}>{head}{val}</Box>;
  return <Box dir="column" shrink={narrow ? 1 : 0} minWidth={narrow ? 0 : undefined}>{head}{val}</Box>;
}

export const StatStrip: typeof Web.StatStrip = ({ items, narrow = 'pairs' }) => {
  const [size, onSize] = useBoxSize();
  const [drawn, setDrawn] = useState<Drawn>({});
  const onDrawn = useCallback((k: string, w: number) => setDrawn((d) => (d[k] === w ? d : { ...d, [k]: w })), []);
  const shown = items.slice(0, 5);
  const GAP = 4;
  const need = shown.reduce((n, x) => n + statWidth(x, drawn), 0) + GAP * Math.max(0, shown.length - 1);
  if (size === null || need <= size.width) {
    return (
      <Box dir="row" gap={GAP} shrink={0} onSize={onSize}>
        {shown.map((x) => <StatCell key={x.label} x={x} row={false} onDrawn={onDrawn} />)}
      </Box>
    );
  }
  if (narrow === 'rows') {
    return <Box dir="column" shrink={0} onSize={onSize}>{shown.map((x) => <StatCell key={x.label} x={x} row narrow onDrawn={onDrawn} />)}</Box>;
  }
  // Two to a line, the second starting at the half (as the web's two columns). A stat wider than its half takes its
  // own width while its neighbour still fits beside it; when it does not, the two stack: a caption is never cut.
  const half = Math.floor((size.width - GAP) / 2);
  const lines: Array<{ items: Web.Stat[]; first: number }> = [];
  for (let i = 0; i < shown.length; i += 2) {
    const [a, b] = [shown[i]!, shown[i + 1]];
    const first = Math.max(half, statWidth(a, drawn));
    if (b && first + GAP + statWidth(b, drawn) > size.width) lines.push({ items: [a], first }, { items: [b], first });
    else lines.push({ items: b ? [a, b] : [a], first });
  }
  return (
    <Box dir="column" gap={1} shrink={0} onSize={onSize}>
      {lines.map((l, i) => (
        <Box key={i} dir="row" gap={GAP} shrink={0}>
          {l.items.map((x, j) => l.items.length > 1
            ? <Box key={x.label} shrink={0} width={j === 0 ? l.first : undefined}><StatCell x={x} row={false} onDrawn={onDrawn} /></Box>
            : <Box key={x.label} dir="column" shrink={1} minWidth={0}><StatCell x={x} row={false} narrow onDrawn={onDrawn} /></Box>)}
        </Box>
      ))}
    </Box>
  );
};

/** A flag as the terminal draws it (CountryFlag's rule): the two letters, never the regional-indicator emoji (wide,
 *  colour, font-dependent). An emoji flag ("🇸🇬") or a code ("sg") gives "SG"; anything else is kept as given. */
function flagLetters(s: string): string {
  const t = s.trim();
  return flagCode(t) ?? flagCode(t.toUpperCase()) ?? s;
}

// ── Context line ────────────────────────────────────────────────────────────────────────────────────────────────

export const ContextLine: typeof Web.ContextLine = ({ realm, computer, server }) => {
  const inText = useInText();
  const parts: Array<{ key: string; text: ReactNode; href?: string; shrink: number }> = [];
  if (realm) parts.push({ key: 'realm', href: realm.href, shrink: 3, text: <Text><Text colour="muted">■ </Text>{cleanText(realm.name)}</Text> });
  if (computer) {
    const tone = computer.tone ?? 'neutral';
    parts.push({ key: 'computer', href: computer.href, shrink: 1, text: <Text><Text colour={TONE[tone]}>{MARK[tone]} </Text>{cleanText(computer.name)}{computer.state ? <Text colour="muted"> ({computer.state})</Text> : null}</Text> });
  }
  if (server) {
    const flag = flagLetters(plain(server.flag ?? '') ?? '');
    parts.push({ key: 'server', href: server.href, shrink: 2, text: <Text>{flag ? `${flag} ` : ''}{cleanText(server.name)}</Text> });
  }
  // Inside running text (a Button's label, a sentence): inline spans only, links drawn as their words (a link cannot
  // sit inside another control's text; the control around it is what is pressed).
  if (inText) return <>{parts.map((p, i) => <Fragment key={p.key}>{i > 0 && <Text colour="faint"> · </Text>}{p.text}</Fragment>)}</>;
  return (
    // Wider than its row (a long computer name on a 60-cell screen): the parts wrap whole, as the web's line does;
    // nothing shrinks a part's text, so an unwrapped line ran past the edge ("… (Runni").
    <Box dir="row" wrap shrink={0} maxWidth="100%">
      {parts.map((p, i) => (
        <Box key={p.key} dir="row" shrink={0}>
          {i > 0 && <Text colour="faint"> · </Text>}
          {p.href ? <Link href={p.href} variant="nav">{p.text}</Link> : p.text}
        </Box>
      ))}
    </Box>
  );
};
