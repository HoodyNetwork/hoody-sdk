// Small display components: StatusPill, Tag, RowNote, Monogram, Facts (key/value), StatStrip, StatTile, ContextLine.
import { type CSSProperties, type ReactNode, useContext, useEffect } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { useDisabledPressRef } from '../controls/disabledPress';
import { ExtLink, Link, autolink } from '../controls/Link';
import { SR_ONLY } from '../controls/SrOnly';
import { Icon, type IconName } from '../icons';
import { useStrings } from '../strings';
import { CardEdge, useCardCut } from '../layouts/CardEdge';
import { InClampedSubtitle } from '../layouts/subtitleScope';
import { InfoTip, plainText } from '../overlays/InfoTip';
import { CopyButton, IdChip } from './Ids';
import idStrings from './Ids.strings.en.json';
import { Meter } from '../widgets/Widgets';
import { factControls, factsPlan, type Fact } from './Display.pure';
import s from './Display.module.css';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export interface StatusPillProps {
  tone?: Tone;
  /** A leading dot (live states) instead of an icon. */
  dot?: boolean;
  icon?: IconName;
  /** A short Hub-written status word. The theme may set it in capitals, so user or server text (names,
   * addresses, error prose) goes in a Tag or plain text instead. */
  children: ReactNode;
  className?: string;
  /** What the state means when its word is not the whole meaning ("Couldn't check"): the word becomes an InfoTip term
   * (a press or a resting mouse shows the sentence; while it shows, it describes the word), as Tag's `tip`. The dot or
   * icon stays outside the term. */
  tip?: string;
}

/** The state of a thing in one short Hub-written word (Running, Failed), with a tone and an optional dot or icon.
 * Use Tag instead when the words are a label that does not change on its own, or text a person typed. */
export function StatusPill({ tone = 'neutral', dot, icon, children, className, tip }: StatusPillProps) {
  return (
    <span className={cx(s.pill, s[tone], className)}>
      {dot && <span className={s.dot} aria-hidden="true" />}
      {icon && <Icon name={icon} size="sm" />}
      {tip ? (
        <InfoTip text={tip} subject={plainText(children)}>
          {children}
        </InfoTip>
      ) : (
        children
      )}
    </span>
  );
}

export interface StatusToggleProps extends Omit<StatusPillProps, 'className' | 'tip'> {
  /** Presses the switch: the caller changes the state (after a confirm, if one direction needs it). */
  onPress: () => void;
  /** On, off, or `'mixed'` when the state cannot be told (aria-pressed). */
  isPressed: boolean | 'mixed';
  /** Refuses presses and shows the disabled look. */
  isDisabled?: boolean;
  className?: string;
}

/** A state that is also its own switch, drawn as its StatusPill (a setting shown as its state where a Switch does not
 * fit: a confirm before one direction, or a third "cannot tell" state). One toggle button named by the pill's words;
 * the kit owns its focus ring, disabled look and coarse-pointer floor. */
export function StatusToggle({ onPress, isPressed, isDisabled, className, ...pill }: StatusToggleProps) {
  // Disabled while its change is sent, and enabled in place when that settles.
  const pressRef = useDisabledPressRef<HTMLButtonElement>();
  return (
    <AriaButton ref={pressRef} className={cx(s.pillPress, className)} aria-pressed={isPressed} isDisabled={isDisabled} onPress={onPress} data-status-pill-press="">
      <StatusPill {...pill} />
    </AriaButton>
  );
}

export type TagTone = 'neutral' | 'ok' | 'warn' | 'accent' | 'mark';

export type TagProps = {
  /** `accent` only for the one thing to look at ("Recommended"); `warn` for a gap ("Needs a key"). */
  tone?: TagTone;
  className?: string;
  /** What the tag means when its words are not the whole meaning ("system", "Critical"): the tag becomes an InfoTip
   * term (its words are the trigger). With `onRemove` the term wraps the label; the remove button stays outside it. */
  tip?: string;
} & (
  | { children: ReactNode; onRemove?: never }
  | {
      /** The label as text: the remove button is named "Remove <label>". */
      children: string;
      /** Shows a remove button (a kit IconButton) after the label. */
      onRemove: () => void;
    }
);

/** Words only a screen reader gets: in the accessibility tree, no space on the screen (a mark's outcome, a state a dot
 *  shows). */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className={SR_ONLY}>{children}</span>;
}

/** A label on a row ("Included", "Your key", "Current"): a hairline box, no dot, no fill. A state
 * that changes on its own (running, failed) is a StatusPill instead. With `onRemove` it is a value
 * the person picked (a label on a key, a region in a filter) and carries its own remove button. */
export function Tag({ tone = 'neutral', children, className, onRemove, tip }: TagProps) {
  const label = tip ? (
    <InfoTip text={tip} subject={plainText(children)}>
      {children}
    </InfoTip>
  ) : (
    children
  );
  // data-hx-tag: a text surface that holds Tags inline (an EmptyState body) spaces its lines for them.
  if (!onRemove) return <span className={cx(s.tag, s[`tag_${tone}`], className)} data-hx-tag="">{label}</span>;
  return (
    <span className={cx(s.tag, s[`tag_${tone}`], s.tagRemovable, className)} data-hx-tag="">
      {label}
      <TagRemove label={children as string} onRemove={onRemove} />
    </span>
  );
}

function TagRemove({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useStrings(idStrings);
  return <IconButton icon="x" size="sm" label={t('tag.remove', { label })} onPress={onRemove} className={s.tagRemove} />;
}

export interface RowNoteProps {
  /** One Hub-written sentence about the row ("Couldn't confirm it stopped"). */
  children: ReactNode;
  /** Placement in the cell only (a page lines it up with its controls); the look is the kit's. */
  className?: string;
  /** One line, cut with an ellipsis instead of wrapping (a short label under a row's main line, such as an SSH key's
   *  comment). In a DataTable the cut cell's tooltip shows it whole; without hover (a touch phone), or while focus is in its row
   *  (keyboard), it wraps whole. Keep
   *  the whole text in children: CSS does the cutting. */
  cut?: boolean;
}

/** A muted sentence in a table row's cell (the row's item meta): it wraps inside the cell, so a narrow column or
 * larger text never pushes it past the cell's edge (with `cut`, one line ending in an ellipsis). A state that changes
 * on its own is a StatusPill (one short word, never wraps); a label is a Tag. */
export function RowNote({ children, className, cut }: RowNoteProps) {
  return <span className={cx(s.rowNote, cut && s.rowNoteCut, className)}>{children}</span>;
}

export interface MonogramProps {
  /** The name it stands for; only its first letter is drawn. */
  name: string;
  /** sm 16 px and md 24 px sit in a row; lg 36 px marks a card (PickCard), xl 56 px heads a page or panel. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** A light tint of a palette colour under the ink letter (a category's colour). Decoration only: it carries no
   * meaning, so the words next to the mark say whatever the colour stands for. Without it, the plain fill. */
  tint?: RealmColor;
  className?: string;
}

const MONOGRAM_SIZE = { sm: undefined, md: s.monogram_md, lg: s.monogram_lg, xl: s.monogram_xl } as const;

/** A provider or app mark: the first letter in a square. Decorative; the name sits next to it.
 * The swap point if real logos ship later. */
export function Monogram({ name, size = 'sm', tint, className }: MonogramProps) {
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? '';
  return (
    <span className={cx(s.monogram, MONOGRAM_SIZE[size], tint && s.monogramTint, tint && `rc-${tint}`, className)} aria-hidden="true">
      {letter}
    </span>
  );
}

export type { Fact } from './Display.pure';
export { factControls };

// What a one-column Facts list draws (and a list on a phone that holds a long fact): 'rows', the compact ruled rows
// with the label beside its value, or 'stack', full-width cells with the label over the value.
const ONE_COLUMN = 'rows' as 'rows' | 'stack';

// One warning per fact label and control for the page's life: Facts re-render with fresh item arrays.
const factWarned = new Set<string>();

export interface FactsProps {
  items: readonly Fact[];
  /**
   * `1`: one fact to a row, as compact ruled rows (the label beside its value, one label width for the list).
   * Otherwise (default 2) the grid fits its cells itself: up to four facts share a row, more take three or four to a
   * row, and a short last row widens to fill. Below the phone breakpoint, 600 px of its own width (rails, phones), a
   * list of short facts keeps two cells to a row and any other list becomes the one-column rows. For `spec`: its
   * columns, filled top-down, one below the phone breakpoint.
   */
  columns?: 1 | 2 | 3;
  /** Accessible name when the grid has no visible heading. */
  label?: string;
  /**
   * `grid` (default): ruled cells that share their borders, each the label in small capitals over its value; a fact
   * with a `meter` draws it under the value. `spec`: a spec sheet, the label at the start
   * and the value at the end of one row, a hairline under each row, a label that stays on one line until it would
   * take more than half the row; `columns` as for grid (one column below the phone breakpoint, 600 px of its own width).
   */
  layout?: 'grid' | 'spec';
  className?: string;
}

function FactValue({ f }: { f: Fact }) {
  const t = useStrings(idStrings);
  if (f.id !== undefined) return <IdChip id={f.id} />;
  const shown = f.href ? (
    <Link href={f.href} variant="nav" className={s.factLink}>
      {f.value}
      <Icon name="chevron-right" size="sm" className={s.factChevron} />
    </Link>
  ) : f.url !== undefined ? (
    <ExtLink url={f.url} look="nav" {...(f.secretUrl !== undefined ? { secret: f.secretUrl } : {})} />
  ) : typeof f.value === 'string' ? (
    autolink(f.value, { look: 'nav' })
  ) : (
    f.value
  );
  if (f.copy === undefined) return <>{shown}</>;
  return (
    <span className={s.factCopyRow}>
      <span className={s.factCopyText}>{shown}</span>
      <CopyButton text={f.copy} label={t('copy.value', { label: f.label })} className={s.factCopy} />
    </span>
  );
}

/** Label and value pairs about one thing (a host, a version, an id), as a description list drawn as a grid of ruled cells; a value may be
 * a link, a masked id or copyable text, never a control. Use Ledger instead when the rows are amounts that end in a
 * total, StatStrip when they are a few headline numbers above a table. */
export function Facts({ items, columns = 2, label, layout = 'grid', className }: FactsProps) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    for (const { label: l, control } of factControls(items)) {
      const key = `${l}\u0000${control}`;
      if (factWarned.has(key)) continue;
      factWarned.add(key);
      // eslint-disable-next-line no-console -- dev-only diagnostic: a warning, never a throw
      console.warn(`hub Facts: "${l}" holds a ${control}; a fact with an action is a SettingRow`);
    }
  }, [items]);
  const grid = items.filter((f) => !f.wide);
  const wide = items.filter((f) => f.wide);
  if (layout === 'grid') {
    const plan = factsPlan(grid, columns);
    const firstOfLast = grid.length - plan.last;
    const cell = (f: Fact, i: number, span: number) => (
      <div key={`${i}-${f.label}`} className={cx(s.cell, f.wide && s.cellWide)} style={{ '--cell-span': span } as CSSProperties}>
        <dt className={s.cellLabel}>{f.label}</dt>
        <dd className={cx(s.cellValue, f.mono && s.cellMono)}>
          <span className={s.cellText}>
            <FactValue f={f} />
          </span>
          {f.meter && <Meter size="fill" value={f.meter.value} label={f.meter.label} className={s.cellMeter} />}
        </dd>
      </div>
    );
    const rowsWhen = ONE_COLUMN === 'stack' ? undefined : columns === 1 ? 'always' : plan.phoneOne || wide.length > 0 ? 'narrow' : undefined;
    return (
      <div className={cx(s.factsWrap, className)}>
        <dl className={s.cells} data-across={plan.across} data-phone={plan.phoneOne || wide.length > 0 ? 'one' : 'two'} data-rows={rowsWhen} aria-label={label}>
          {grid.map((f, i) => cell(f, i, 12 / (i >= firstOfLast ? plan.last : plan.across)))}
          {wide.map((f, i) => cell(f, grid.length + i, 12))}
        </dl>
      </div>
    );
  }
  const rows = Math.max(1, Math.ceil(grid.length / columns));
  const row = (f: Fact, i: number) => (
    <div key={`${i}-${f.label}`} className={cx(s.fact, f.wide && s.factWide)}>
      <dt className={s.factLabel}>{f.label}</dt>
      <dd className={cx(s.factValue, f.mono && s.mono)}>
        <FactValue f={f} />
      </dd>
    </div>
  );
  return (
    <div className={cx(s.factsWrap, s.spec, className)}>
      <dl className={cx(s.facts, s[`cols${columns}`])} style={{ '--fact-rows': rows } as CSSProperties} aria-label={label}>
        {grid.map(row)}
      </dl>
      {wide.length > 0 && <dl className={cx(s.facts, s.cols1, grid.length > 0 && s.factsAfter)}>{wide.map((f, i) => row(f, grid.length + i))}</dl>}
    </div>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** A short change or context line under the value. */
  hint?: ReactNode;
  tone?: Tone;
  icon?: IconName;
  /** What the number counts or means, behind an icon-form InfoTip after the label (the number stays plain). */
  tip?: string;
  className?: string;
}

/** One headline number in its own card: a caps label, the value (toned when it is a status), an optional hint.
 * Use StatStrip instead when several stats sit side by side above a table: one strip, never a row of cards. */
export function StatTile({ label, value, hint, tone = 'neutral', icon, tip, className }: StatTileProps) {
  const cut = useCardCut();
  return (
    <div {...cut} className={cx(s.stat, className)}>
      <CardEdge />
      <div className={s.statHead}>
        {icon && <Icon name={icon} size="sm" />}
        <span className={s.statLabel}>{label}</span>
        {tip && <InfoTip text={tip} subject={label} />}
      </div>
      <div className={cx(s.statValue, s[`v_${tone}`])}>{value}</div>
      {hint && <div className={s.statHint}>{hint}</div>}
    </div>
  );
}

export interface Stat {
  /** Caps label ("Computers"). */
  label: string;
  /** The number, in ink. Never status-coloured: a status gets the dot instead. */
  value: ReactNode;
  /** A short muted caption after the number ("7 running · 4 stopped", "of 16"). */
  detail?: ReactNode;
  /** Only when the stat IS a status ("Open alerts"): a dot in this tone before the label. */
  status?: Tone;
  /** Spoken text for the dot ("needs you"); without it the dot is decoration. */
  statusLabel?: string;
}

export interface StatStripProps {
  items: readonly Stat[];
  /** Accessible name for the strip ("Summary"). */
  label?: string;
  /** Below 600 px wide: `pairs` (default) wraps the cells two to a row; `rows` gives each stat a row, label and caption
   *  at the start and the number at the end (an odd count never leaves one cell alone on a row). */
  narrow?: 'pairs' | 'rows';
  className?: string;
}

/**
 * A strip of up to five stats above a table: caps label over an ink number (`--t-readout`) over a muted caption
 * (`--t-small`), dashed dividers, never cards. Below 600 px wide the cells wrap two to a row, or one stat per row
 * with `narrow="rows"`. Use StatTile instead when one number stands alone as a card, Facts for label/value pairs
 * that are not headline numbers.
 */
export function StatStrip({ items, label, narrow = 'pairs', className }: StatStripProps) {
  return (
    <div className={cx(s.ssWrap, className)}>
      <dl className={s.ss} aria-label={label} data-narrow={narrow}>
        {items.slice(0, 5).map((x) => (
          <div key={x.label} className={s.ssItem}>
            <dt className={s.ssLabel}>
              {x.status && (
                <span className={cx(s.ssDot, s[`ssDot_${x.status}`])} role={x.statusLabel ? 'img' : undefined} aria-label={x.statusLabel} aria-hidden={x.statusLabel ? undefined : true} />
              )}
              {x.label}
            </dt>
            <dd className={s.ssValue}>
              <span className={s.ssNumber}>{x.value}</span>
              {x.detail !== undefined && <span className={s.ssDetail}>{x.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type RealmColor = 'blue' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow';

export interface ContextLineProps {
  /** The realm: its colour square and name. */
  realm?: { name: string; color?: RealmColor; href?: string };
  /** The computer: a state dot in `tone`, its name, and `state` as the dot's spoken text. */
  computer?: { name: string; tone?: Tone; state?: string; href?: string };
  /** The server: a flag (emoji or a kit flag element) and its name. */
  server?: { name: string; flag?: ReactNode; href?: string };
  className?: string;
}

/**
 * Where you are, on one line: realm square + name · state dot + computer ·
 * flag + server. Each part is a link when it has an href. Ink text; the realm truncates first,
 * then the server, the computer last.
 */
export function ContextLine({ realm, computer, server, className }: ContextLineProps) {
  // Read while rendering, not from the DOM afterwards: a ContextLine any descendant of the subtitle adds, at any render,
  // is caught, and nothing else in the subtitle can be mistaken for one.
  const clamped = useContext(InClampedSubtitle);
  if (import.meta.env.DEV && clamped) throw new Error('hub PageHeader: a ContextLine is in `subtitle`, whose clamp clips its tap targets; pass it as `context`');
  const parts: Array<{ key: string; node: ReactNode; href?: string }> = [];
  if (realm) {
    parts.push({
      key: 'realm',
      href: realm.href,
      node: (
        <>
          <span className={s.realmSquare} style={realm.color ? { background: `var(--hx-r-${realm.color})` } : undefined} aria-hidden="true" />
          <span className={s.ctxText}>{realm.name}</span>
        </>
      ),
    });
  }
  if (computer) {
    parts.push({
      key: 'computer',
      href: computer.href,
      node: (
        <>
          <span className={cx(s.ctxDot, s[`cd_${computer.tone ?? 'neutral'}`])} aria-hidden="true" />
          <span className={s.ctxText}>{computer.name}</span>
          {computer.state && <span className={SR_ONLY}>{computer.state}</span>}
        </>
      ),
    });
  }
  if (server) {
    parts.push({
      key: 'server',
      href: server.href,
      node: (
        <>
          {server.flag !== undefined && <span className={s.ctxFlag}>{server.flag}</span>}
          <span className={s.ctxText}>{server.name}</span>
        </>
      ),
    });
  }
  return (
    <p className={cx(s.context, className)}>
      {parts.map((p, i) => (
        <span key={p.key} className={cx(s.ctxPart, s[`cp_${p.key}`])}>
          {i > 0 && (
            <span className={s.ctxSep} aria-hidden="true">
              ·
            </span>
          )}
          {p.href ? (
            <Link href={p.href} variant="nav" className={s.ctxLink}>
              {p.node}
            </Link>
          ) : (
            <span className={s.ctxLink}>{p.node}</span>
          )}
        </span>
      ))}
    </p>
  );
}
