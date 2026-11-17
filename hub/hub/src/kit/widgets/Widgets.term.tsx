// Home widget building blocks in the terminal: titles with counts, 1-row list rows, a headline number, a text sparkline
// (block glyphs), a progress line and the ten-block Meter. Every tone has a mark, so a level reads without colour.
import { ClipText } from '../../term/prim/TableClip';
import { cellWidth } from '@term/prim';
import { isValidElement, useState, type ReactElement } from 'react';
import type * as Web from './Widgets';
import { Box, Text, TONE_MARK, type Colour } from '../../term/prim';
import { Link } from '../controls/Link';
import { InfoLine, plainText } from '../overlays/InfoTip';
import { StatusPill, type Tone } from '../data/Display';
import { useStrings } from '../strings';
import strings from './strings.en.json';
import { scaleSteps } from './ScaleBar.pure';

export type { WidgetTitleProps, WidgetListProps, WidgetRowProps, WidgetStatProps, SparklineProps, WidgetProgressProps, MeterProps, ScaleBarProps } from './Widgets';

const TONE: Record<Tone, Colour> = { neutral: 'muted', ok: 'ok', warn: 'warn', danger: 'danger', info: 'blueText', accent: 'acc' };
const MARK: Record<Tone, string> = { ...TONE_MARK, accent: '◆' };

export const WidgetTitle: typeof Web.WidgetTitle = ({ children, count, note, noteTone = 'neutral' }) => (
  <Text>
    <Text colour="ink" bold>{children}</Text>
    {count !== undefined && <Text colour="muted"> {count}</Text>}
    {note !== undefined && <Text colour={TONE[noteTone]}> {noteTone === 'neutral' ? '' : `${MARK[noteTone]} `}{note}</Text>}
  </Text>
);

export const WidgetList: typeof Web.WidgetList = ({ label, children }) => <Box dir="column" shrink={0} sem={{ role: 'list', ...(label !== undefined ? { name: label } : {}) }}>{children}</Box>;

// The label's floor in cells: a row too long for its card keeps this much of its name (all of a shorter one).
const LABEL_FLOOR = 12;

// A label given as an element (a page's own link, as the Notifications card passes) is drawn as it is, in the row's
// box: inside a Text it would put a pressable box in a text, which the terminal refuses (a text holds only text), and
// the whole card fell to its error state.
// A row too long for its card gives way in one order: the label first, down to its floor (the row's name, so the rows
// stay told apart), then the meta, cut with "…", and the label below its floor only when no meta is left (a Bots row:
// its pill and action leave a narrow card less than the floor). The mark (the row's level without colour), the pill
// and the action never give way. The label starts at its floor and grows into the room the others leave; the meta's
// shrink of 1000 against the label's 0.001 makes it give way first, as Display's inline tags do. The label's share
// stays under the engine's rounding tolerance (0.0001 of a cell): at 1 against 1000, a card starting on a half cell
// (two cards sharing an odd width) rounded the label's right edge down and lost the name's last cell ("fra…").
export const WidgetRow: typeof Web.WidgetRow = ({ label, href, tone, meta, pill, action }) => {
  const floor = typeof label === 'string' ? Math.min(cellWidth(label), LABEL_FLOOR) : LABEL_FLOOR;
  return (
    <Box dir="row" gap={1} shrink={0} height={1}>
      <Text colour={TONE[tone ?? 'neutral']} shrink={0}>{tone && tone !== 'neutral' ? MARK[tone] : '·'}</Text>
      <Box dir="row" grow={1} shrink={0.001} basis={floor} minWidth={0}>
        {href ? <Link href={href} variant="plain">{label}</Link> : typeof label === 'string' ? <ClipText text={label} colour="ink" /> : isValidElement(label) ? label : <Text colour="ink">{label}</Text>}
      </Box>
      {meta !== undefined && (
        <Box dir="row" shrink={1000} minWidth={0}>
          {typeof meta === 'string' ? <ClipText text={meta} colour="muted" grow={false} /> : <Text colour="muted" truncate>{meta}</Text>}
        </Box>
      )}
      {pill && <StatusPill tone={pill.tone} dot={pill.dot}>{pill.text}</StatusPill>}
      {action ? <Box dir="row" shrink={0}>{action}</Box> : null}
    </Box>
  );
};

export const WidgetStat: typeof Web.WidgetStat = ({ value, caption, tone = 'neutral', chart, tip }) => (
  <Box dir="row" gap={2} shrink={0}>
    <Box dir="column" grow={1}>
      <Text colour={tone === 'neutral' ? 'ink' : TONE[tone]} bold>{tone === 'neutral' ? '' : `${MARK[tone]} `}{value}</Text>
      <InfoLine tip={tip} subject={plainText(caption)}><Text colour="muted">{caption}</Text></InfoLine>
    </Box>
    {chart ? <Box dir="column" justify="end">{chart}</Box> : null}
  </Box>
);

const SPARK = '▁▂▃▄▅▆▇█';
/** The sparkline glyphs for `points` (pure): one block per point, its height on the web's own scale (min 0, max 1). */
function sparkGlyphs(points: readonly number[]): string {
  const finite = points.map((p) => (Number.isFinite(p) ? p : 0));
  const max = Math.max(...finite, 1);
  const min = Math.min(...finite, 0);
  const span = max - min || 1;
  return finite.map((p) => SPARK[Math.max(0, Math.min(7, Math.round(((p - min) / span) * 7)))]).join('');
}

/** A small line chart as block glyphs (24 points take 24 cells). Its label is drawn only where it is the chart's
 *  whole meaning; here, as on the web, it names the chart and the caption beside it says what it counts. */
export const Sparkline: typeof Web.Sparkline = ({ points, label, tone = 'neutral' }) => (
  <Text colour={tone === 'neutral' ? 'blueText' : TONE[tone]} sem={{ role: 'img', ...(label !== undefined ? { name: label } : {}) }}>{sparkGlyphs(points)}</Text>
);

const BAR = 10;
function bar(lit: number, cells = BAR): string {
  const n = Math.max(0, Math.min(cells, lit));
  return '█'.repeat(n) + '░'.repeat(cells - n);
}

export const WidgetProgress: typeof Web.WidgetProgress = ({ done, total, label }) => {
  const t = useStrings(strings);
  const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Text colour="blueText" sem={{ role: 'progressbar', name: label ?? t('progress', { done, total }), value: t('progressLabel', { done, total }) }}>{bar(Math.round(pct / 10))}</Text>
      <Text colour="muted">{t('progress', { done, total })}</Text>
    </Box>
  );
};

/** Ten blocks lit as whole blocks (10% lights one, any use above 0 at least one); warn and danger add their mark, so
 *  the level reads in mono. `fill` stretches to its container's width, the same share lit. */
export const Meter: typeof Web.Meter = ({ value = 0, label, tone, indeterminate, size = 'sm' }) => {
  const t = useStrings(strings);
  const [w, setW] = useState(BAR);
  const cells = size === 'fill' ? Math.max(BAR, w) : BAR;
  const box = (node: ReactElement) => (size === 'fill' ? <Box dir="row" grow={1} onSize={(x) => setW(x)}>{node}</Box> : node);
  if (indeterminate) return box(<Text colour="muted" sem={{ role: 'progressbar', busy: true, ...(label !== undefined ? { name: label } : {}) }}>{'▒'.repeat(cells)}</Text>);
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const shown = tone ?? (v >= 90 ? 'danger' : v >= 75 ? 'warn' : 'neutral');
  const lit = Math.ceil((v / 100) * cells);
  const markCells = shown === 'neutral' ? 0 : 2;
  const barCells = Math.max(1, cells - markCells);
  const litBar = Math.min(barCells, Math.ceil((v / 100) * barCells));
  // As the web's role="meter": the level in words names warn and danger for a reader (they draw alike in mono).
  const pct = v > 0 && v < 0.1 ? '<0.1' : String(Math.round(v * 10) / 10);
  const valueText = t(shown === 'danger' ? 'meterVeryHigh' : shown === 'warn' ? 'meterHigh' : 'meterValue', { pct });
  return box(
    <Text sem={{ role: 'meter', value: valueText, ...(label !== undefined ? { name: label } : {}) }}>
      <Text colour={shown === 'neutral' ? 'ink' : TONE[shown]}>{'█'.repeat(size === 'fill' ? litBar : lit)}</Text>
      <Text colour="line">{'░'.repeat(size === 'fill' ? barCells - litBar : cells - lit)}</Text>
      {shown !== 'neutral' ? <Text colour={TONE[shown]}> {MARK[shown]}</Text> : null}
    </Text>,
  );
};

/** A plan beside the others: one block per step, the lit ones full blocks in the accent's text colour, the rest
 *  light shade, so the count reads in mono too. An image named in words, as on the web. */
export const ScaleBar: typeof Web.ScaleBar = ({ value, max, label }) => {
  const { steps, lit } = scaleSteps(value, max);
  return (
    <Text sem={{ role: 'img', name: label }}>
      <Text colour="accText">{'█'.repeat(lit)}</Text>
      <Text colour="line">{'░'.repeat(steps - lit)}</Text>
    </Text>
  );
};

export const WidgetActions: typeof Web.WidgetActions = ({ children }) => <Box dir="row" gap={2} shrink={0}>{children}</Box>;
