// Widget body pieces for the kit `Widget` frame (title with count, list rows, headline stat, progress line, footer
// actions), so every widget reads as one hand. Meter and Sparkline live here too and are used kit-wide (table cells,
// tiles, detail pages), not only inside Widget cards. A list widget shows 3-5 real 32 px rows with at most one inline
// action each and its count in the title; empty or failing: EmptyState / ErrorState size="compact"; loading: Skeleton variant="widget".
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { Link } from '../controls/Link';
import { StatusPill, type Tone } from '../data/Display';
import { Icon, type IconName } from '../icons';
import { InfoLine, plainText } from '../overlays/InfoTip';
import { useStrings } from '../strings';
import { scaleSteps } from './ScaleBar.pure';
import strings from './strings.en.json';
import s from './Widgets.module.css';

export interface WidgetTitleProps {
  children: ReactNode;
  /** The count after the title ("Bots 3"). */
  count?: number;
  /** A short status after the count ("1 failed today"); `tone` colours it. */
  note?: ReactNode;
  noteTone?: Tone;
}

/** A widget title with its count: pass it as the Widget `title`. */
export function WidgetTitle({ children, count, note, noteTone = 'neutral' }: WidgetTitleProps) {
  return (
    <span className={s.title}>
      <span className={s.titleText}>{children}</span>
      {count !== undefined && <span className={s.count}>{count}</span>}
      {note !== undefined && <span className={cx(s.note, s[`t_${noteTone}`])}>{note}</span>}
    </span>
  );
}

export interface WidgetListProps {
  /** Accessible name of the list ("Bots"). */
  label: string;
  children: ReactNode;
  className?: string;
}

/** The list a widget's WidgetRows sit in. */
export function WidgetList({ label, children, className }: WidgetListProps) {
  return (
    <ul className={cx(s.list, className)} aria-label={label}>
      {children}
    </ul>
  );
}

export interface WidgetRowProps {
  /** The row's name. */
  label: ReactNode;
  /** Opens the item (the label becomes a link). */
  href?: string;
  /** A leading status dot in this tone (`accent` = needs you). Ignored when `icon` is set. */
  tone?: Tone;
  icon?: IconName;
  /** Short muted context right of the label ("in 2h", "3d"). */
  meta?: ReactNode;
  /** A one-word status pill. */
  pill?: { tone: Tone; text: string; dot?: boolean };
  /** One inline action (a small Button or TextButton). */
  action?: ReactNode;
  className?: string;
}

/** One 32 px widget row: dot or icon, label, meta, pill, inline action. */
export function WidgetRow({ label, href, tone, icon, meta, pill, action, className }: WidgetRowProps) {
  return (
    <li className={cx(s.row, className)}>
      {icon ? (
        <Icon name={icon} size="sm" className={cx(s.icon, tone && s[`t_${tone}`])} />
      ) : (
        <span className={cx(s.dot, s[`d_${tone ?? 'neutral'}`])} aria-hidden="true" />
      )}
      <span className={s.label}>
        {href ? (
          <Link href={href} variant="plain" className={s.labelLink}>
            {label}
          </Link>
        ) : (
          label
        )}
      </span>
      {meta !== undefined && <span className={s.meta}>{meta}</span>}
      {pill && (
        <StatusPill tone={pill.tone} dot={pill.dot}>
          {pill.text}
        </StatusPill>
      )}
      {action && <span className={s.action}>{action}</span>}
    </li>
  );
}

export interface WidgetStatProps {
  /** The big number, already formatted ("$42.10", "12"). */
  value: ReactNode;
  /** What it counts ("failed in the last hour"). */
  caption: ReactNode;
  tone?: Tone;
  /** A Sparkline or other small chart beside the number. */
  chart?: ReactNode;
  /** What the number means, behind an icon-form InfoTip after the caption (the number stays plain). */
  tip?: string;
}

/** A widget headline number with its caption and an optional sparkline: the one stat a Widget card leads with. Use the
 *  data family's StatTile (one labelled stat in a tile) or StatStrip (up to five stats above a table) instead when the
 *  number sits on a page outside a Widget card. */
export function WidgetStat({ value, caption, tone = 'neutral', chart, tip }: WidgetStatProps) {
  return (
    <div className={s.stat}>
      <div className={s.statText}>
        <span className={cx(s.value, s[`t_${tone}`])}>{value}</span>
        <InfoLine tip={tip} subject={plainText(caption)}>
          <span className={s.caption}>{caption}</span>
        </InfoLine>
      </div>
      {chart && <div className={s.chart}>{chart}</div>}
    </div>
  );
}

export interface SparklineProps {
  points: readonly number[];
  /** What the line shows ("Failed requests per hour, last 24 hours"). */
  label: string;
  tone?: 'neutral' | 'danger' | 'warn' | 'ok';
  className?: string;
}

/** A small line chart of a value over time (24 points is typical); decorative detail with an accessible label. Use
 *  Meter instead when there is one current level against a limit. */
export function Sparkline({ points, label, tone = 'neutral', className }: SparklineProps) {
  const w = 120;
  const h = 32;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const xy = points.map((p, i) => [i * step, h - 2 - ((p - min) / span) * (h - 4)] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = xy.length > 1 ? `${line} L${w} ${h} L0 ${h} Z` : '';
  return (
    <svg className={cx(s.spark, s[`s_${tone}`], className)} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {area && <path d={area} className={s.sparkArea} />}
      <path d={line} className={s.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface WidgetProgressProps {
  done: number;
  total: number;
  /** The bar's accessible name ("Get started"); without it, the visible "2 of 4" names it. */
  label?: string;
}

/** "2 of 4" with a 4 px bar: counted steps done in a Widget card (Get started). Use Meter instead for a usage level
 *  (a percent of a limit), and the data family's ProgressCell for a transfer's progress in a table cell. */
export function WidgetProgress({ done, total, label }: WidgetProgressProps) {
  const t = useStrings(strings);
  const textId = useId();
  const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
  return (
    <div className={s.progress}>
      <div
        className={s.track}
        role="progressbar"
        aria-label={label}
        aria-labelledby={label ? undefined : textId}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={t('progressLabel', { done, total })}
      >
        <span className={s.bar} style={{ inlineSize: `${pct}%` }} />
      </div>
      <span id={textId} className={s.progressText}>
        {t('progress', { done, total })}
      </span>
    </div>
  );
}

export interface MeterProps {
  /** Percent used, 0-100 (clamped). Ignored when `indeterminate`. */
  value?: number;
  /** The accessible name, with the value in words ("CPU 82%"). */
  label: string;
  /** Default: neutral, warn from 75, danger from 90. */
  tone?: 'neutral' | 'warn' | 'danger';
  /** Work under way with no known amount (a computer being set up). */
  indeterminate?: boolean;
  /** `sm` (60 px wide: ten 4 px blocks in a table cell or tile hint) or `fill` (the width of its container). */
  size?: 'sm' | 'fill';
  className?: string;
}

/** A small usage bar (CPU, memory, disk, quota): ten blocks, lit as whole blocks, so 10% lights
 *  exactly one and any use above 0 lights at least one; aria-valuenow keeps the exact value. Ink blocks; warn and danger,
 *  only past their thresholds, light the one toned look; aria-valuetext names the level ("95%, very high"). Use
 *  WidgetProgress instead for counted steps ("2 of 4"), and ProgressCell for a transfer in a table cell. */
export function Meter({ value = 0, label, tone, indeterminate, size = 'sm', className }: MeterProps) {
  const t = useStrings(strings);
  if (indeterminate) {
    return <span className={cx(s.meter, s.meterBusy, size === 'fill' && s.meterFill, className)} role="progressbar" aria-label={label} title={label} />;
  }
  // A value that is not a finite number (a missing reading) shows as 0, never as NaN% or a warning. Never rounded: 0.1
  // lights a block and 90.1 lights all ten; aria-valuenow carries the exact clamped value.
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const shown = tone ?? (v >= 90 ? 'danger' : v >= 75 ? 'warn' : 'neutral');
  const blocks = Math.ceil(v / 10);
  // In words: one decimal at most; a use under 0.1 still reads as a use, never as 0.
  const pct = v > 0 && v < 0.1 ? '<0.1' : String(Math.round(v * 10) / 10);
  // Warn and danger draw alike, so the value in words names the level for assistive tech.
  const valueText = t(shown === 'danger' ? 'meterVeryHigh' : shown === 'warn' ? 'meterHigh' : 'meterValue', { pct });
  // --meter-lit: how much of the track the lit blocks cover. The bar is always the track's full width, clipped to
  // the lit blocks (Widgets.module.css), so its toned edges repeat on the very box the track's mask does.
  const bar = { '--meter-lit': `${blocks * 10}%` } as CSSProperties;
  return (
    <span
      className={cx(s.meter, size === 'fill' && s.meterFill, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-valuetext={valueText}
      title={label}
      data-tone={shown}
    >
      <span className={cx(s.meterBar, s[`meter_${shown}`])} style={bar} />
    </span>
  );
}

export interface ScaleBarProps {
  /** This one's place on the scale: a whole number of steps (a plan's multiple of the smallest plan's allowance). */
  value: number;
  /** The scale's end: the largest value among the things compared, so each is drawn relative to the others. */
  max: number;
  /** The accessible name, with the value in words ("AI allowance: 2 times the Free plan"). */
  label: string;
  className?: string;
}

/** A plan's place beside the others, as a row of boxes (the website's plan scale): one box per step of the scale, the
 *  first `value` filled in the accent with a dark edge, the rest outlined. Not a usage meter (Meter is): it compares
 *  fixed amounts, so it is an image named in words, and the words beside it say the value too. */
export function ScaleBar({ value, max, label, className }: ScaleBarProps) {
  const { steps, lit } = scaleSteps(value, max);
  return (
    <span className={cx(s.scale, className)} role="img" aria-label={label}>
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} className={cx(s.scaleStep, i < lit && s.scaleLit)} />
      ))}
    </span>
  );
}

/** The widget's footer line of links and text buttons ("Mark all read", "See what failed"). */
export function WidgetActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.actions, className)}>{children}</div>;
}
