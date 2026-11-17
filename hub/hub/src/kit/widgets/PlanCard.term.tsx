// PlanCard in the terminal: the same slots in the same order (name, chip, marks; the line under the name; price; lead;
// label | value rows; the regions; specs with a check; "Show all {count} details" fold; footnote; note; the action last),
// drawn with prims in one bordered box.
// The tone the web gives by colour stays in the cell grid, and also reads in mono:
//   accent  (the one card the page points at): a heavy border in blue (web: blue line and blue tint);
//   current (a plan the person has): the selected ground inside a strong line (web: the selected ground);
//   default: the panel line.
// The web's cut corner and its ResizeObserver-sized edge have no cell form (CutFrame.term draws a plain box too), and
// the plan fills (`fill`) are colour only: the frame says the tone.
// A region tag is its two flag letters and its name; a full one is faint and says so in words (", full": the web's
// spoken suffix, shown here because grey alone does not read in mono).
// PlanGrid: rows of equal-width cards, each row as tall as its tallest card; as many columns as the web's rule gives for
// the measured width (at least 260 px = 33 cells a card, or the fixed 2 / 3 with their breakpoints), one column until
// the grid is measured. With `wide` the last card takes a row of its own and lays its label | value rows side by side.
// Not here: the web grid's shared row tracks (a card's price lining up with its neighbours' across a row).
import { Children, type ReactNode } from 'react';
import type * as Web from './PlanCard';
import { Box, Text, useBoxSize, type Colour } from '../../term/prim';
import { Disclosure } from '../controls/Disclosure';
import { TagsWrap } from '../data/tagYield';
import { flagCode } from '../flag';
import { Icon } from '../icons';
import { useHeadingLevel } from '../layouts/anatomy/Heading';
import { ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import strings from './PlanCard.strings.en.json';

export type { PlanCardProps, PlanCardRow, PlanCardRegion, PlanCardRegions, PlanGridProps } from './PlanCard';

type Tone = NonNullable<Web.PlanCardProps['tone']>;

/** The frame each tone draws: border colour, ground and border style (heavy marks accent without colour). */
const PLAN_TONE_FRAME: Readonly<Record<Tone, { border: Colour; bg?: Colour; style: 'single' | 'heavy' }>> = {
  default: { border: 'line', style: 'single' },
  accent: { border: 'blue', style: 'heavy' },
  current: { border: 'lineStrong', bg: 'selected', style: 'single' },
};

/** A wide card's label | value rows: the least cells one takes beside the next, and the gap between two. */
const WIDE_ROW_COLS = 28;
const WIDE_ROW_GAP = 3;

const isText = (n: ReactNode): n is string | number => typeof n === 'string' || typeof n === 'number';
/** A slot: plain text goes through the prim Text; anything else (a kit component) is drawn as it is. */
const slot = (n: ReactNode, colour: Colour = 'ink', bold = false, align?: 'right'): ReactNode =>
  isText(n) ? <Text colour={colour} bold={bold} align={align}>{String(n)}</Text> : n;

/** A region's flag as its two letters (CountryFlag's rule: never the regional-indicator emoji); anything else as given. */
const flagWord = (flag: string): string => flagCode(flag.trim()) ?? flagCode(flag.trim().toUpperCase()) ?? flag;

export const PlanCard: typeof Web.PlanCard = ({ name, chip, subTitle, price, lead, rows = [], regions, specs = [], more = [], footnote, marks, action, note, onRetry, retrying, tone = 'default', wide, state = 'ready' }) => {
  const t = useStrings(strings);
  const level = Math.min(6, useHeadingLevel() + 1);
  const foldLevel = Math.min(6, level + 1) as 2 | 3 | 4 | 5 | 6;
  const loading = state === 'loading';
  const error = state === 'error';
  const frame = PLAN_TONE_FRAME[tone] ?? PLAN_TONE_FRAME.default;
  // A row marked as the price is the price line of a card with no price of its own, never a row of the list.
  const priceRow = price ? undefined : rows.find((r) => r.price);
  const listed = rows.filter((r) => !r.price);
  const line = (spec: ReactNode, i: number) => (
    <Box key={i} dir="row" gap={1} shrink={0}>
      <Icon name="check" size="sm" />
      <Box dir="column" grow={1} shrink={1}>{slot(spec)}</Box>
    </Box>
  );
  return (
    <Box
      dir="column"
      border
      borderColour={frame.border}
      raw={{ borderStyle: frame.style }}
      grow={1}
      shrink={0}
      sem={{ role: 'group', name, ...(loading ? { busy: true } : {}) }}
    >
      {/* The ground fills the inside only: on the border's own cells it would show as a half cell outside the line. */}
      <Box dir="column" padX={1} grow={1} shrink={0} {...(frame.bg ? { bg: frame.bg } : {})}>
        <Box dir="row" gapX={1} shrink={0} wrap>
          <Box grow={1} shrink={1}>
            <Text bold colour="ink" sem={{ role: 'heading', level, name }}>{name}</Text>
          </Box>
          {chip ? slot(chip, 'muted') : null}
          {/* The web's .marks wrap (flex-wrap): two marks ("✓ 2 of your servers", "◆ Suggested for you") are wider than a
              narrow card, so they wrap onto the next line instead of running past the border. The head and the marks
              gap their items only (gapX): the web's 4-8 px between wrapped lines is no whole blank row here. A mark is the card's
              state, never hidden (TagsWrap): a tag wider than the card wraps its words (Referrer at 80 columns). */}
          {marks ? <Box dir="row" gapX={1} shrink={1} minWidth={0} wrap><TagsWrap>{slot(marks)}</TagsWrap></Box> : null}
        </Box>
        {/* The line under the name, on the web's marks line: what the offer is. */}
        {subTitle ? <Box dir="column" shrink={0}>{slot(subTitle, 'muted')}</Box> : null}
        {loading ? (
          <Skeleton variant="text" rows={5} immediate />
        ) : error ? (
          <ErrorState size="sm" body={note} onRetry={onRetry} retrying={retrying} />
        ) : (
          <>
            {price ? (
              // The web's .price wraps (flex-wrap): a long amount and its "per" ("Fewer than 3" "of 11 needed") take two
              // lines in a narrow card instead of cutting the second.
              <Box dir="row" gapX={1} shrink={0} wrap>
                {slot(price.amount, 'ink', true)}
                {price.per ? slot(price.per, 'muted') : null}
              </Box>
            ) : null}
            {priceRow ? (
              // A price row: its label small before its value in the price's place (From $70 a month).
              <Box dir="row" gapX={1} shrink={0} wrap>
                {slot(priceRow.label, 'muted')}
                {slot(priceRow.value, 'ink', true)}
              </Box>
            ) : null}
            {lead ? slot(lead, 'muted') : null}
            {listed.length > 0 ? (
              // A wide card (a whole row of its PlanGrid) lays its rows side by side, each at least a card's column
              // wide, and as one list where only one fits.
              <Box dir={wide ? 'row' : 'column'} shrink={0} sem={{ role: 'list' }} {...(wide ? { wrap: true, gapX: WIDE_ROW_GAP } : {})}>
                {listed.map((r) => (
                  // The web's .row wraps and its value sits at the end (margin-inline-start: auto, text-align: end): a value
                  // that does not fit beside its label takes the next line, right-aligned, and its own wrapped lines end
                  // at the right edge too ("400 MiB/s read, 200 MiB/s" / "write"). The value never shrinks (a shrinking
                  // item in a wrapping row is squeezed instead of wrapped); its width is capped at the card's.
                  // A value that is a part (a term with its tip) has no text alignment of its own: its box lays it at
                  // its end, so it stands at the right edge like the text values around it.
                  <Box key={r.id} dir="row" gapX={1} justify="between" shrink={wide ? 1 : 0} wrap {...(wide ? { grow: 1, basis: WIDE_ROW_COLS, minWidth: 0, maxWidth: '100%' } : {})}>
                    <Box shrink={0}>{slot(r.label, 'muted', true)}</Box>
                    <Box shrink={0} grow={1} maxWidth="100%" {...(isText(r.value) ? {} : { dir: 'row' as const, justify: 'end' as const })}>{slot(r.value, 'ink', false, 'right')}</Box>
                  </Box>
                ))}
              </Box>
            ) : null}
            {regions ? (
              <Box dir="column" shrink={0}>
                {slot(regions.label, 'muted', true)}
                {regions.items && regions.items.length > 0 ? (
                  <Box dir="row" gapX={2} shrink={0} wrap sem={{ role: 'list', ...(typeof regions.label === 'string' ? { name: regions.label } : {}) }}>
                    {regions.items.map((r) => (
                      <Text key={r.id} colour={r.full ? 'faint' : 'ink'}>
                        {r.flag ? `${flagWord(r.flag)} ` : ''}{r.name}{r.full ? t('planCard.fullSuffix') : ''}
                      </Text>
                    ))}
                  </Box>
                ) : null}
                {regions.note ? slot(regions.note, 'muted') : null}
              </Box>
            ) : null}
            {specs.length > 0 ? <Box dir="column" shrink={0}>{specs.map(line)}</Box> : null}
            {more.length > 0 ? (
              <Disclosure title={t('planCard.more', { count: specs.length + more.length })} level={foldLevel}>
                <Box dir="column" shrink={0}>{more.map(line)}</Box>
              </Disclosure>
            ) : null}
            {footnote ? <Box dir="column" shrink={0}>{slot(footnote, 'muted')}</Box> : null}
            {note ? <Box dir="column" shrink={0}>{slot(note)}</Box> : null}
          </>
        )}
        {action && !loading && !error ? <Box dir="row" shrink={0} pad={{ top: 1 }}>{slot(action)}</Box> : null}
      </Box>
    </Box>
  );
};

/** The least cells a card takes in a grid with no fixed columns (the web's 260 px), and the cells between two cards
 *  (the web's --sp-4). */
const CARD_MIN_COLS = 33;
const GRID_GAP = 2;
/** The web's container breakpoints of a fixed-column grid, in cells: under 600 px three columns become two, under
 *  480 px every card takes the whole width. */
const TWO_BELOW = 75;
const ONE_BELOW = 60;

/** How many columns a grid of `count` cards draws at `width` cells (0: not measured yet, one column). */
function gridColumns(width: number, count: number, columns: 2 | 3 | undefined): number {
  if (width <= 0 || count <= 1) return 1;
  if (columns !== undefined) return width < ONE_BELOW ? 1 : columns === 3 && width < TWO_BELOW ? 2 : columns;
  return Math.max(1, Math.min(count, Math.floor((width + GRID_GAP) / (CARD_MIN_COLS + GRID_GAP))));
}

export const PlanGrid: typeof Web.PlanGrid = ({ children, columns, wide }) => {
  const [size, onSize] = useBoxSize();
  const items = Children.toArray(children);
  // With `wide` the last child is the wide card: a row of its own under the others.
  const last = wide && items.length > 1 ? items[items.length - 1] : undefined;
  const cards = last !== undefined ? items.slice(0, -1) : items;
  const width = size?.width ?? 0;
  const n = gridColumns(width, cards.length, columns);
  const lines: ReactNode[][] = [];
  for (let i = 0; i < cards.length; i += n) lines.push(cards.slice(i, i + n));
  return (
    <Box dir="column" gap={1} shrink={0} width="100%" onSize={onSize}>
      {lines.map((line, y) => (
        // One row of the grid: equal columns (a short last row keeps the columns of the rows above it, as grid tracks
        // do; the web's three-column grid at two columns gives a last odd card the whole row), each card as tall as
        // the row's tallest.
        <Box key={y} dir="row" gap={GRID_GAP} shrink={0} align="stretch">
          {Array.from({ length: columns === 3 && n === 2 && line.length === 1 ? 1 : n }, (_, x) => (
            <Box key={x} dir="column" grow={1} basis={0} shrink={1} minWidth={0}>{line[x] ?? null}</Box>
          ))}
        </Box>
      ))}
      {last !== undefined ? <Box dir="column" shrink={0}>{last}</Box> : null}
    </Box>
  );
};
