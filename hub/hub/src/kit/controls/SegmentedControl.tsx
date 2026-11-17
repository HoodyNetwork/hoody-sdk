// SegmentedControl: a few mutually exclusive choices on one track; the current one sits on a raised thumb.
// Use it for a view switch (Computers | Servers), a filter where chips sit (All | Running | Stopped) or a short form
// choice (Card | Crypto); use `Tabs` instead when each choice owns a panel. A full-width control measures its own
// width: when its labels do not fit whole it draws a kit Select of the same choices instead of cutting them.
import { type ReactNode, type RefObject, useId, useLayoutEffect, useRef } from 'react';
import type { Key } from 'react-aria-components';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { Select } from '../forms/more';
import f from '../forms/fields.module.css';
import { InfoLine } from '../overlays/InfoTip';
import { Tooltip } from '../overlays/Popover';
import { Icon, type IconName } from '../icons';
import { type RowNeed, useRowFit } from '../media';
import { useSearchParam } from '../nav';
import { cx } from './Button';
import { useDisabledPressRef } from './disabledPress';
import { SR_ONLY } from './SrOnly';
import s from './SegmentedControl.module.css';

export interface SegmentItem<K extends string = string> {
  id: K;
  /** A resolved string: the visible label and always the option's accessible name. */
  label: string;
  icon?: IconName;
  /** A small count after the label ("Unread 3"). It is the option's description, never part of its name. */
  count?: number;
  isDisabled?: boolean;
}

interface CommonProps<K extends string> {
  items: readonly SegmentItem<K>[];
  /** Accessible name of the group ("View", "State"). */
  label: string;
  /** Id(s) of help text that describes the choice (a form row's hint): read with the group. */
  'aria-describedby'?: string;
  /** Stretch over the container, segments share the width in equal cells (phone headers). When equal
   * cells cannot hold every whole label, the same choices show as a Select (one closed field with the current choice). */
  fullWidth?: boolean;
  isDisabled?: boolean;
  className?: string;
  /** A form row's choice: the label shows above the control as a field label ("Run as"). */
  showLabel?: boolean;
  /** Field help under the control, read with the group (it may follow the choice). Shows the label. */
  description?: ReactNode;
  /** An explanation behind an icon-form InfoTip after the visible label. Shows the label. */
  info?: string;
  /** 'folder' ("Folder tabs"): the choices draw as folder tabs on a line, for a switch between
   * views of one page (Computers | Servers | Projects, Cards | List). Only the look changes: it stays a radio group with
   * the same keys, names and Select fallback. Default 'segments'. */
  variant?: 'segments' | 'folder';
  /** Icons alone, for a switch in a tight place (a header on a phone): each option that has an `icon` draws as a square
   * with its icon; its label stays its accessible name and shows in a tooltip on hover and keyboard focus. An option
   * with no icon keeps its words. Use it only when every icon is told apart at a glance (Cards | List, One | Two panes). */
  iconOnly?: boolean;
}

export interface SegmentedControlProps<K extends string = string> extends CommonProps<K> {
  /** The chosen item id (controlled). Ignored when `param` is set. */
  value?: K;
  onChange?: (value: K) => void;
  /** Keep the choice in the URL under this search parameter (?<param>=id); the first item is the default and leaves the URL clean. */
  param?: string;
  /** With `param`: push a history entry instead of replacing it (a view switch Back should undo). */
  push?: boolean;
}

/**
 * The segments need room for equal cells, each as wide as the widest whole label (labels never shrink while measured);
 * a Select in their place needs only its box. A segment is never narrower than its label, so when one or more labels
 * are longer than an equal share their cells are exactly those labels' widths and the others split the rest: the need
 * is then the track's own frame (its padding and gaps, which scrollWidth holds beside the cells, plus its borders,
 * which it does not) plus count × the widest cell. When the cells are already equal this is the track's
 * width. useRowFit allows 1 px over the box, and need minus box is the sum of each cell's shortfall from the widest,
 * so drawn cells differ by at most 1 px (plus the browser's whole-pixel rounding of the box widths).
 */
const trackNeed: RowNeed = (el) => {
  const track = el.firstElementChild as HTMLElement | null;
  if (!track) return el.scrollWidth;
  const cells = [...track.children].map((c) => c.getBoundingClientRect().width);
  const sum = cells.reduce((a, w) => a + w, 0);
  const css = getComputedStyle(track);
  const borders = (parseFloat(css.borderLeftWidth) || 0) + (parseFloat(css.borderRightWidth) || 0);
  return track.scrollWidth + borders - sum + cells.length * Math.max(0, ...cells);
};

/** Everything that changes how wide the segments are: a change measures them again from the segments. */
const fitKey = (items: readonly SegmentItem[], look: string): string => [look, ...items.map((x) => `${x.id}\t${x.label}\t${x.count ?? ''}\t${x.icon ?? ''}`)].join('\n');

/**
 * Keyboard focus survives a change of presentation (segments <-> Select): when focus was inside the control and the
 * element that held it went away with the old presentation, the new one takes it (the chosen segment, or the Select's
 * button). Focus that left the control on purpose (Tab, a click elsewhere) is never pulled back.
 */
function useFocusAcross(ref: RefObject<HTMLElement | null>, presentation: boolean): void {
  const within = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onIn = () => {
      within.current = true;
    };
    const onOut = (e: FocusEvent) => {
      const target = e.target as Node;
      const next = e.relatedTarget as Node | null;
      if (next && el.contains(next)) return;
      // Focus moving away leaves its element in the page; an element removed with its presentation does not.
      queueMicrotask(() => {
        if (target.isConnected) within.current = false;
      });
    };
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, [ref]);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || !within.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      if (!el.contains(active)) within.current = false;
      return;
    }
    const target = el.querySelector<HTMLElement>('[data-selected="true"], [aria-checked="true"]') ?? el.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  }, [presentation, ref]);
}

function Segmented<K extends string>({ items, label, 'aria-describedby': describedBy, fullWidth, isDisabled, className, variant, iconOnly, value, onChange }: CommonProps<K> & { value: K | undefined; onChange: (v: K) => void }) {
  // No value means the first item. A value that names no item shows no choice: shown as the first, that item could
  // not be pressed back (a chosen toggle sends no change). UrlSegmented passes no value for a param it does not know,
  // so junk in the URL reads as the default. A value naming a disabled item shows the first enabled item.
  const named = items.find((x) => x.id === value);
  const firstOn = items.find((x) => !x.isDisabled)?.id;
  const current = named && !named.isDisabled ? value : value === undefined || named ? firstOn : undefined;
  const fitRef = useRef<HTMLDivElement>(null);
  const asSelect = useRowFit(fitRef, 1, fitKey(items, `${variant ?? ''}${iconOnly ? ' icons' : ''}`), fullWidth === true, trackNeed) === 1;
  useFocusAcross(fitRef, asSelect);
  const group = (
    <ToggleButtonGroup
      aria-label={label}
      aria-describedby={describedBy}
      selectionMode="single"
      disallowEmptySelection
      isDisabled={isDisabled}
      selectedKeys={current !== undefined ? [current] : []}
      onSelectionChange={(keys: Set<Key>) => {
        const next = [...keys][0];
        if (next !== undefined && next !== current) onChange(String(next) as K);
      }}
      className={cx(s.track, variant === 'folder' && s.folder, fullWidth && s.full, className)}
    >
      {items.map((x) => (
        <Segment key={x.id} x={x} iconOnly={iconOnly === true && x.icon !== undefined} />
      ))}
    </ToggleButtonGroup>
  );
  if (!fullWidth) return group;
  return (
    <div ref={fitRef} className={s.fit}>
      {asSelect ? (
        <Select<K>
          aria-label={label}
          aria-describedby={describedBy}
          descriptionSlots
          className={className}
          options={items.map((x) => ({ value: x.id, label: x.label, description: x.count !== undefined ? String(x.count) : undefined, isDisabled: x.isDisabled }))}
          value={current}
          onChange={(v) => {
            if (v !== current) onChange(v);
          }}
          isDisabled={isDisabled}
        />
      ) : (
        group
      )}
    </div>
  );
}

// The option's name is its label alone ("Unread"); the count is its description, so a count
// never changes what the option is called (as FilterChips does for its menu items). The count is
// hidden from the name and read through aria-describedby; no aria-labelledby, so a field's
// getByLabelText never finds a segment that only shares its words.
// Icon-only: the label is still in the button (its name), hidden from sight, and a tooltip shows the same words.
function Segment<K extends string>({ x, iconOnly }: { x: SegmentItem<K>; iconOnly: boolean }) {
  const countId = useId();
  const hasCount = x.count !== undefined;
  // A segment (or the whole group) can be disabled and enabled in place.
  const pressRef = useDisabledPressRef<HTMLButtonElement>();
  const button = (
    <ToggleButton ref={pressRef} id={x.id} isDisabled={x.isDisabled} className={cx(s.segment, iconOnly && s.iconSegment)} data-icon-only={iconOnly ? '' : undefined} aria-describedby={hasCount ? countId : undefined}>
      {x.icon && <Icon name={x.icon} size="sm" />}
      <span className={iconOnly ? SR_ONLY : s.label}>{x.label}</span>
      {hasCount && (
        <span id={countId} className={s.count} aria-hidden="true">
          {x.count}
        </span>
      )}
    </ToggleButton>
  );
  return iconOnly ? <Tooltip content={x.label}>{button}</Tooltip> : button;
}

function UrlSegmented<K extends string>({ param, push, ...rest }: CommonProps<K> & { param: string; push?: boolean; onChange?: (v: K) => void }) {
  const [value, setValue] = useSearchParam(param);
  const first = rest.items[0]?.id;
  return (
    <Segmented
      {...rest}
      value={rest.items.some((x) => x.id === value) ? (value as K) : undefined}
      onChange={(v) => {
        setValue(v === first ? undefined : v, { replace: !push });
        rest.onChange?.(v);
      }}
    />
  );
}

export function SegmentedControl<K extends string = string>({ param, push, value, onChange, showLabel, description, info, ...rest }: SegmentedControlProps<K>) {
  const helpId = useId();
  const help = description !== undefined && description !== null && description !== false;
  const props = help ? { ...rest, 'aria-describedby': [rest['aria-describedby'], helpId].filter(Boolean).join(' ') } : rest;
  const control = param ? <UrlSegmented {...props} param={param} push={push} onChange={onChange} /> : <Segmented {...props} value={value} onChange={(v) => onChange?.(v)} />;
  if (!showLabel && !help && !info) return control;
  // A form row: the field label (with its InfoTip) above, the field help below, as the kit fields draw them. The group
  // keeps its own aria-label, so the visible label adds no second name.
  return (
    <div className={cx(f.field, s.labelled)}>
      <span className={f.label}>
        <InfoLine tip={info} subject={rest.label}>
          {rest.label}
        </InfoLine>
      </span>
      {control}
      {help && (
        <span id={helpId} className={f.description}>
          {description}
        </span>
      )}
    </div>
  );
}
