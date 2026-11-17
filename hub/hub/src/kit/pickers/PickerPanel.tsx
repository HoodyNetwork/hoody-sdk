// PickerPanel: the one kit panel for picking from a list of things (realms, computers, ...): a search box
// with the kit's folded matching, picked rows first, multi (check boxes) or single (radio) rows, an optional
// "create new" slot as the last stop, and every state (loading, empty, no match, error) in one place.
//
// Contract:
//   - `items` undefined means still loading. `value` holds the picked ids (single mode: none or one);
//     `onChange` gets the new list. The panel keeps no pick of its own.
//   - Picked rows (by the value when the list first has rows) sit on top, in both modes; a group holding a
//     picked row comes before the others. Ticking a row never moves it, so the list does not jump under the pointer.
//     The count line always shows in multi mode. Keyboard order is the order drawn.
//   - `minPicked` stops the last untick and shows a hint instead.
//   - Search shows above 7 rows (or always with `searchable`); typing anywhere in the list starts it.
//   - `collapsible` groups (by their `group` identity) start folded unless they hold a picked row: their heading is a
//     toggle naming the group (its `groupLabel`) and its count, a stop in the list's arrow order. While a search is
//     typed, every group with a match shows open, rows that arrive or move later included, unless the person folds it
//     again for that query; clearing the search brings back the folds from before it.
//   - `keepOrder` draws groups and rows in the caller's order (no picked-first move), for a caller whose order is the point.
//   - A row with a `note` or an `aside` is one line: the label, its note, and the aside at the line's end (wrapping
//     under the label when the panel is narrow).
//   - Keyboard: one tab stop for the list (roving), arrows/Home/End move, Space picks or ticks, Enter picks
//     (single) or calls `onConfirm` (multi). ArrowDown from the last row enters the create slot, ArrowUp from
//     its first control comes back. The slot is not searched and stays after any state but loading.
//   - `footer` (MenuFooter): at most two actions in a separate "Picker actions" group after the list and the
//     create slot, outside the radiogroup/group: arrows never reach it, Tab from the list does and Shift+Tab comes back.
//     It stays at the bottom while the list scrolls. Escape and focus return are the host's (popover, drawer).
//   - Errors: `status.error` shows a compact ErrorState with `status.onRetry`, the rejection's mapped words and its
//     Details; `status.details` is extra content under it. Already loaded rows stay visible under the error.
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { TextButton } from '../controls/Link';
import { Icon } from '../icons';
import { SearchField } from '../forms/fields';
import { useFieldLock } from '../forms/lock';
import { useContainerNarrow } from '../media';
import { cx } from '../controls/Button';
import { useInnerWheel } from '../overlays/innerWheel';
import { type FooterAction, type FooterActions, MenuFooter } from '../overlays/MenuFooter';
import { EmptyState, ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { arrange, filterItems, itemOff, type PickerItem, toggled } from './pickerLogic';
import strings from './PickerPanel.strings.en.json';
import s from './PickerPanel.module.css';

export type { PickerItem } from './pickerLogic';

/** Rows above which the search box shows by itself. */
export const SEARCH_ABOVE = 7;
const NARROW_PX = 480;

export interface PickerPanelProps {
  /** The accessible name of the list ("Realms"). */
  label: string;
  /** Also draw the label above the panel (a field label); the list is then named by it. Default: name only. */
  showLabel?: boolean;
  /** Text about the whole list (a Band given the panel as its `attach` sets it); it describes the list. */
  'aria-describedby'?: string;
  items: readonly PickerItem[] | undefined;
  mode: 'single' | 'multi';
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Multi: the fewest picks allowed (1 for "at least one realm"). */
  minPicked?: number;
  /** Always show the search box, or never (false); by default above SEARCH_ABOVE rows. */
  searchable?: boolean;
  searchLabel?: string;
  /** The sentence for an empty list. */
  emptyText?: string;
  /** The last stop: a "Create a new ..." control. Not searched. */
  renderCreate?: () => ReactNode;
  /** Groups (their `group` identity) whose rows fold under their heading (a toggle); they start folded unless they
   *  hold a picked row. */
  collapsible?: readonly string[];
  /** Keep the caller's order of groups and rows: picked rows and their group are not moved first. */
  keepOrder?: boolean;
  status?: { error?: unknown; onRetry?: () => void; title?: string; details?: ReactNode };
  /** Multi mode: replaces the "n selected" line. */
  summary?: (count: number) => string;
  /** Enter in multi mode (a form's next step). */
  onConfirm?: () => void;
  /** At most two actions kept at the bottom, the primary first, after the list and the create slot. */
  footer?: FooterActions<FooterAction>;
  isDisabled?: boolean;
  /** A long list keeps its height: past this many rows the rows scroll inside the panel (about this many shown, the next
   *  one peeking), while the search box, the "n selected" line, the create slot and the footer stay put. Off by
   *  default: the whole list shows. */
  maxRows?: number;
  /** Told each time the search text changes (a caller that offers more rows only while a search is typed). */
  onQuery?: (query: string) => void;
  /** Replaces the search tally ("3 of 12 shown") while a search is typed, for a caller whose rows change with the search. */
  searchTally?: (shown: number) => string;
  className?: string;
}

/** One keyboard stop of the list: a row, or a foldable group's toggle. */
interface Stop {
  key: string;
  item?: PickerItem;
  fold?: string;
}
/** A toggle's key: never a row id (ids are the caller's values, so the NUL keeps the two apart). */
const foldKey = (title: string) => `\u0000fold:${title}`;

const NONE: ReadonlySet<string> = new Set();

const PRINTABLE = (e: KeyboardEvent) => e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';
/** A control in a slot the keyboard can really land on: not disabled, hidden or inert, and not taken out of the tab order. */
const usable = (el: HTMLElement) =>
  !el.matches(':disabled') &&
  el.getAttribute('aria-disabled') !== 'true' &&
  !el.closest('[inert], [hidden]') &&
  !(el instanceof HTMLInputElement && el.type === 'hidden') &&
  !(el.hasAttribute('tabindex') && Number(el.getAttribute('tabindex')) < 0);

export function PickerPanel({ label, showLabel, 'aria-describedby': describedBy, items, mode, value, onChange, minPicked = 0, searchable, searchLabel, emptyText, renderCreate, collapsible, keepOrder, status, summary, onConfirm, footer, isDisabled: disabledProp, maxRows, onQuery, searchTally, className }: PickerPanelProps) {
  const t = useStrings(strings);
  const id = useId();
  const hintId = `${id}-hint`;
  const labelId = `${id}-label`;
  // A kit form that is saving locks every field, this one too.
  const isDisabled = useFieldLock(disabledProp);
  const root = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const createSlot = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const narrow = useContainerNarrow(NARROW_PX, root);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // The rows picked when the list first has rows: they stay on top for the panel's life.
  const [first, setFirst] = useState<ReadonlySet<string> | null>(null);
  if (items !== undefined && items.length > 0 && first === null) setFirst(new Set(value));
  // The collapsible groups folded now: fixed when the list first has rows (a group holding a picked row starts open).
  const [folded, setFolded] = useState<ReadonlySet<string> | null>(null);
  if (items !== undefined && items.length > 0 && folded === null) setFolded(new Set((collapsible ?? []).filter((g) => !items.some((i) => i.group === g && value.includes(i.id)))));
  // The groups the person folded again while the current search showed them open (cleared when the query changes).
  const [searchFolded, setSearchFolded] = useState<ReadonlySet<string>>(() => new Set());
  const searching = query.trim() !== '';
  const foldable = (title: string | null): title is string => title !== null && (collapsible ?? []).includes(title);
  // While searching, only groups with a match are drawn, so each shows open unless folded again for this query.
  const isFolded = (title: string) => (searching ? searchFolded.has(title) : (folded?.has(title) ?? true));
  const fold = (title: string, on: boolean) => {
    const flip = (f: ReadonlySet<string> | null) => { const n = new Set(f ?? []); if (on) n.add(title); else n.delete(title); return n; };
    if (searching) setSearchFolded(flip);
    else setFolded(flip);
  };

  const failed = Boolean(status?.error);
  // `error: true` only flags a failed read: there is no rejection to put words or Details to.
  const rejection = typeof status?.error === 'object' ? status.error : undefined;
  const loading = items === undefined && !failed;
  const total = items?.length ?? 0;
  const hasSearch = items !== undefined && (searchable ?? total > SEARCH_ABOVE);
  const groups = items ? arrange(filterItems(items, hasSearch ? query : ''), keepOrder ? NONE : (first ?? NONE)) : [];
  const shown = groups.flatMap((g) => g.rows);
  // maxRows: the list is capped once it holds more rows than that. Its height is measured from the rows themselves
  // (the maxRows-th row's bottom plus half the next, so a row peeks and says the list goes on); until laid out (or
  // where nothing is laid out) CSS caps it at maxRows control heights.
  const capped = typeof maxRows === 'number' && maxRows > 0 && shown.length > maxRows;
  const listRef = useRef<HTMLDivElement>(null);
  const [capPx, setCapPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!capped || !el) return setCapPx(null);
    // Measured again whenever the list's width changes or it is first laid out (a panel inside a closed Disclosure
    // has no size yet): rows wrap differently at another width.
    const measure = () => {
      const stops = el.querySelectorAll<HTMLElement>('[role="checkbox"], [role="radio"], [aria-expanded]');
      const last = stops[maxRows - 1];
      const next = stops[maxRows];
      // The cap is the list's border box (.capped): its top edge and inset are in the row's offset; the bottom inset and
      // edge are added, so the next row still peeks by half above the frame's bottom line.
      const cs = getComputedStyle(el);
      const foot = (parseFloat(cs.paddingBlockEnd) || 0) + (parseFloat(cs.borderBlockEndWidth) || 0);
      const h = last && next ? Math.ceil(last.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop + next.getBoundingClientRect().height / 2 + foot) : 0;
      setCapPx((p) => (h > 0 ? h : p));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    let width = -1;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [capped, maxRows, shown.length]);
  // A capped list takes the wheel while the pointer is on it, also mid-run of the drawer's or page's scroll.
  useInnerWheel(listRef, capped);
  const capStyle = { '--pp-rows': maxRows, ...(capPx !== null ? { maxBlockSize: `${capPx}px` } : {}) } as CSSProperties;
  // The keyboard's stops in drawn order: each foldable group's toggle, then the rows it shows (none while folded).
  const stops: Stop[] = groups.flatMap((g) => {
    const head: Stop[] = foldable(g.title) ? [{ key: foldKey(g.title), fold: g.title }] : [];
    const open = !foldable(g.title) || !isFolded(g.title);
    // A row that cannot be picked is still a stop: its reason is read there. A disabled panel has no stops.
    return [...head, ...(open && !isDisabled ? g.rows.map((i) => ({ key: i.id, item: i })) : [])];
  });
  const tab = stops.find((x) => x.key === active) ?? stops.find((x) => x.item && value.includes(x.item.id)) ?? stops[0];
  const picked = (i: PickerItem) => value.includes(i.id);
  const changeQuery = (q: string) => {
    setQuery(q);
    setSearchFolded(new Set());
    onQuery?.(q);
  };

  // Keep the keyboard where it was when the row it held goes away (filtered out, removed, or redrawn under another
  // group): back to that row if it still exists, else the nearest surviving row, else the search box or the create slot.
  const heldRow = useRef<string | null>(null);
  const heldEl = useRef<HTMLElement | null>(null);
  const lastStops = useRef<string[]>([]);
  useEffect(() => {
    const held = heldRow.current;
    const lost = held !== null && heldEl.current !== null && !heldEl.current.isConnected;
    // Focus went elsewhere in the same update (a parent moved it): the hold is over, never taken back later.
    if (lost && document.activeElement !== document.body && document.activeElement !== null) {
      heldRow.current = null;
      heldEl.current = null;
    } else if (lost) {
      const live = new Set(stops.map((x) => x.key));
      const before = lastStops.current;
      const at = before.indexOf(held);
      // The same row if it is still there, else the next surviving row after it, else the closest one before it, else any row that can take focus now.
      const nearest = live.has(held) ? held : (before.slice(at + 1).find((x) => live.has(x)) ?? before.slice(0, Math.max(at, 0)).reverse().find((x) => live.has(x)) ?? stops[0]?.key);
      const next = nearest === undefined ? undefined : rows.current.get(nearest);
      if (next) {
        heldRow.current = nearest ?? null;
        heldEl.current = next;
        next.focus(); // its onFocus makes it the active row
      } else {
        heldRow.current = null;
        heldEl.current = null;
        const box = searchBox.current?.querySelector('input');
        (box && !box.disabled ? box : slotControl())?.focus();
      }
    }
    lastStops.current = stops.map((x) => x.key);
  });

  const focusRow = (x: Stop | undefined) => {
    if (!x) return;
    setActive(x.key);
    const el = rows.current.get(x.key);
    el?.focus();
    // In a capped list the row the keyboard lands on is scrolled into view (focus alone may leave it at the clip).
    if (capped) el?.scrollIntoView?.({ block: 'nearest' });
  };
  const press = (i: PickerItem) => {
    if (itemOff(i) || isDisabled) return;
    const r = toggled(mode, value, i.id, minPicked);
    setBlocked(r.blocked);
    if (!r.blocked) onChange(r.next);
  };
  const slotControl = (): HTMLElement | null => Array.from(createSlot.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find(usable) ?? null;
  const searchInput = (): HTMLInputElement | null => searchBox.current?.querySelector('input') ?? null;

  const onRowKey = (e: KeyboardEvent, x: Stop) => {
    const at = stops.findIndex((y) => y.key === x.key);
    const i = x.item;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight': {
        e.preventDefault();
        const next = stops[at + 1];
        if (next) focusRow(next);
        else slotControl()?.focus();
        return;
      }
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        if (at > 0) focusRow(stops[at - 1]);
        else searchInput()?.focus();
        return;
      case 'Home':
        e.preventDefault();
        focusRow(stops[0]);
        return;
      case 'End':
        e.preventDefault();
        focusRow(stops[stops.length - 1]);
        return;
      case ' ':
      case 'Enter':
        // A toggle (no item) is a native button: Space and Enter press it, and its onClick folds or opens the group.
        if (!i) return;
        e.preventDefault();
        if (e.key === ' ' || mode === 'single') press(i);
        else if (!itemOff(i) && !isDisabled) onConfirm?.();
        return;
      default:
        if (hasSearch && PRINTABLE(e)) {
          // Typing anywhere in the list goes to the search box.
          e.preventDefault();
          changeQuery(query + e.key);
          searchInput()?.focus();
        }
    }
  };

  const slot = renderCreate && !loading ? (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- reason: ArrowUp from the slot's first control returns to the list
    <div
      ref={createSlot}
      className={s.create}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' && e.target === slotControl()) {
          e.preventDefault();
          focusRow(stops[stops.length - 1]);
        }
      }}
    >
      {renderCreate()}
    </div>
  ) : null;

  const count = mode === 'multi' ? (summary ? summary(value.length) : t('pp.selected', { count: value.length })) : null;
  const hint = minPicked > 0 && mode === 'multi' && (blocked || value.length < minPicked) ? t('pp.minPicked', { count: minPicked }) : null;
  const live = [count, hasSearch && query.trim() !== '' ? (searchTally ? searchTally(shown.length) : t('pp.shown', { shown: shown.length, total })) : null].filter(Boolean).join(' · ');

  return (
    <div ref={root} className={cx(s.panel, narrow && s.narrow, className)} data-narrow={narrow ? '' : undefined}>
      {showLabel && (
        <p id={labelId} className={s.fieldLabel}>
          {label}
        </p>
      )}
      {hasSearch && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- reason: ArrowDown from the search box enters the list
        <div
          ref={searchBox}
          className={s.searchRow}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && stops.length) {
              e.preventDefault();
              focusRow(tab);
            }
          }}
        >
          <SearchField label={searchLabel ?? t('pp.search')} placeholder={searchLabel ?? t('pp.search')} value={query} onChange={(v) => { changeQuery(v); setBlocked(false); }} isDisabled={isDisabled} />
        </div>
      )}
      {/* One live region: the count, the search tally and the minimum-pick refusal, so each is spoken when it appears. */}
      <p className={s.summary} role="status">
        {live}
        {hint && (
          <span id={hintId} className={s.hint}>
            {live ? ' · ' : ''}
            {hint}
          </span>
        )}
      </p>
      {loading && <Skeleton rows={3} />}
      {failed && (
        <div className={s.status}>
          <ErrorState size="compact" title={status?.title ?? t('pp.error')} onRetry={status?.onRetry} error={rejection} />
          {status?.details}
        </div>
      )}
      {items !== undefined && items.length === 0 && !failed && <EmptyState size="compact" icon="search" title={emptyText ?? t('pp.empty')} />}
      {items !== undefined && items.length > 0 && shown.length === 0 && (
        <p className={s.summary}>
          {t('pp.noMatch', { q: query.trim() })}{' '}
          <TextButton onPress={() => changeQuery('')}>{t('pp.clear')}</TextButton>
        </p>
      )}
      {shown.length > 0 && (
        <div
          ref={listRef}
          role={mode === 'multi' ? 'group' : 'radiogroup'}
          aria-label={showLabel ? undefined : label}
          aria-labelledby={showLabel ? labelId : undefined}
          aria-describedby={describedBy}
          className={cx(s.list, capped && s.capped)}
          style={capped ? capStyle : undefined}
          data-capped={capped ? '' : undefined}
        >
          {groups.map((g) => {
            const body = g.rows.map((i) => {
              const on = picked(i);
              const off = itemOff(i) || isDisabled;
              const sub = off && i.disabledReason ? i.disabledReason : i.description;
              return (
                <div
                  key={i.id}
                  ref={(el) => {
                    if (el) rows.current.set(i.id, el);
                    else rows.current.delete(i.id);
                  }}
                  id={`${id}-${i.id}`}
                  role={mode === 'multi' ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  aria-disabled={off || undefined}
                  // The look reads these presence flags: a CSS module selector holds no attribute value (kitpure).
                  data-checked={on || undefined}
                  data-off={off || undefined}
                  aria-describedby={hint && blocked && active === i.id ? hintId : undefined}
                  tabIndex={!isDisabled && tab?.key === i.id ? 0 : -1}
                  className={s.row}
                  onClick={() => { setActive(i.id); press(i); }}
                  onFocus={(e) => { if (!isDisabled) { setActive(i.id); heldRow.current = i.id; heldEl.current = e.currentTarget; } }}
                  onBlur={(e) => { if (e.currentTarget.isConnected && !e.currentTarget.contains(e.relatedTarget)) { heldRow.current = null; heldEl.current = null; } }}
                  onKeyDown={(e) => onRowKey(e, { key: i.id, item: i })}
                >
                  {mode === 'multi' ? (
                    <span className={s.box} aria-hidden="true">{on ? <Icon name="check" size="sm" /> : null}</span>
                  ) : (
                    <span className={s.dot} aria-hidden="true" />
                  )}
                  <span className={cx(s.text, (i.note !== undefined || i.aside !== undefined) && s.line)}>
                    <span className={s.label}>
                      {i.lead ?? (i.icon && <Icon name={i.icon} size="sm" />)}
                      {i.label}
                    </span>
                    {/* Spaces keep the line's words apart in the row's text (its name); a flex box draws none. */}
                    {i.note && <>{' '}<span className={s.note}>{i.note}</span></>}
                    {i.aside !== undefined && <>{' '}<span className={s.aside}>{i.aside}</span></>}
                    {sub && <span className={s.desc}>{sub}</span>}
                    {i.facts && <span className={s.facts}>{i.facts}</span>}
                  </span>
                </div>
              );
            });
            if (g.title === null) return <div key="none" className={s.group}>{body}</div>;
            if (foldable(g.title)) {
              const title = g.title;
              const key = foldKey(title);
              const open = !isFolded(title);
              const bodyId = `${id}-fold-${groups.indexOf(g)}`;
              return (
                <div key={`g:${title}`} role="group" aria-label={g.label ?? title} className={s.group}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rows.current.set(key, el);
                      else rows.current.delete(key);
                    }}
                    className={s.foldToggle}
                    aria-expanded={open}
                    data-open={open || undefined}
                    aria-controls={bodyId}
                    tabIndex={tab?.key === key ? 0 : -1}
                    onClick={() => { setActive(key); fold(title, open); }}
                    onFocus={(e) => { setActive(key); heldRow.current = key; heldEl.current = e.currentTarget; }}
                    onBlur={(e) => { if (e.currentTarget.isConnected && !e.currentTarget.contains(e.relatedTarget)) { heldRow.current = null; heldEl.current = null; } }}
                    onKeyDown={(e) => onRowKey(e, { key, fold: title })}
                  >
                    <Icon name="chevron-right" size="sm" className={s.foldChevron} />
                    {t('pp.groupCount', { title: g.label ?? title, n: g.rows.length })}
                  </button>
                  <div id={bodyId} className={s.group} hidden={!open}>
                    {open ? body : null}
                  </div>
                </div>
              );
            }
            return (
              <div key={`g:${g.title}`} role="group" aria-label={g.label ?? g.title} className={s.group}>
                <div className={s.groupTitle} aria-hidden="true">{g.label ?? g.title}</div>
                {body}
              </div>
            );
          })}
        </div>
      )}
      {slot}
      {footer && <MenuFooter label={t('pp.actions')} actions={footer} />}
    </div>
  );
}
