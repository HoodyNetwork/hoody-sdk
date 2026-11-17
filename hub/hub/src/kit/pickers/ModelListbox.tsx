// ModelListbox: the model chooser's one single-select grouped listbox. Activation is explicit (it may
// choose, ask for consent or open setup), so this is a listbox, not PickerPanel's radiogroup.
//
// Contract:
//   - Groups are role="group", named by a plain header element inside them (never an option). Options are
//     role="option" with a stable id (list id + hashed spec); aria-selected="true" only for the caller's value
//     (selection never follows focus); aria-describedby = the option's state text.
//   - Focus is DOM focus with a roving tabIndex: the focused option, else the value, else the first option has 0.
//     ArrowDown/Up move across groups without wrapping, Home/End, PageDown/PageUp by 10, Enter/Space activate, a
//     printable key goes to `onType` (the search field), Escape asks `onEscape`. Tab leaves (one tab stop).
//   - When the focused option disappears, focus goes to the nearest survivor. An arrow move re-renders at most the
//     two options whose tab stop changed (options are memoised on stable props).
//   - `locked` (the caller is saving): aria-disabled on the listbox, activation does nothing, focus still moves.
//   - A drill-in page passes `posinset`/`setsize` per option so "101 of 598" is true.
import { type KeyboardEvent, memo, type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, cx } from '../controls/Button';
import type { Pager } from './modelPaging';
import s from './ModelChooser.module.css';
import { optionId, specHash } from './modelListboxIds';

export interface ListOption {
  spec: string;
  label: string;
  /** Visible tags after the label ("Current", "Recommended", "Checking"). Part of the accessible name (label, then tags). */
  tags?: readonly string[];
  /** The visible state line, also the option's description ("Can't tell if it runs here", "Needs setup: API key"). */
  state?: string;
  /** Extra description for assistive tech only, after the state ("Enter sets up OpenAI."). */
  hint?: string;
  /** Extra facts on the right (a price). */
  facts?: string;
  selected: boolean;
  /** Shown but not activatable (a fallback row while the catalogue loads). */
  isDisabled?: boolean;
  /** Drill-in only: the absolute position and the provider's total. */
  posinset?: number;
  setsize?: number;
  tone?: 'warn';
}

export interface ListGroup {
  id: string;
  /** The header's content (mark, name, facts). Its text names the group. */
  header: ReactNode;
  /** Draw no header (a single unnamed group, e.g. the Agent's default); then `label` names the group. */
  label?: string;
  options: readonly ListOption[];
}

export interface ModelListboxProps {
  id: string;
  /** The view heading's id. */
  labelledBy: string;
  /** The count line's id ("Showing 12 of 12"). */
  describedBy?: string;
  groups: readonly ListGroup[];
  locked?: boolean;
  onActivate: (spec: string) => void;
  /** A printable key typed in the list (the chooser puts it in the search field). */
  onType?: (ch: string) => void;
  /** Escape in the list; return true when it was handled (search cleared). */
  onEscape?: () => boolean;
  /** Move DOM focus to this option (a page change, Back) when `focusToken` changes. */
  focusSpec?: string | null;
  focusToken?: number;
  /** Test probe: called each time an option renders. */
  renderProbe?: (spec: string) => void;
}

export { optionId, specHash } from './modelListboxIds';

const PAGE_STEP = 10;

export interface OptionProps {
  listId: string;
  o: ListOption;
  /** An extra class (the virtualized list's fixed-height row). */
  className?: string;
  tabbable: boolean;
  onKey: (e: KeyboardEvent<HTMLDivElement>, spec: string) => void;
  onPick: (spec: string) => void;
  onFocusOpt: (spec: string) => void;
  probe?: (spec: string) => void;
}

/** One option, shared by this listbox and the virtualized ModelPickList (one row contract). */
export const ModelOption = memo(function ModelOption({ listId, o, className, tabbable, onKey, onPick, onFocusOpt, probe }: OptionProps) {
  probe?.(o.spec);
  const id = optionId(listId, o.spec);
  const desc = o.state || o.hint ? `${id}-d` : undefined;
  const facts = o.facts ? `${id}-f` : undefined;
  const describedBy = [desc, facts].filter(Boolean).join(' ') || undefined;
  // The name is the visible label and tags (WCAG 2.5.3: what a voice user sees is what they say); the state line and
  // the facts are the description, hidden from the name and read through aria-describedby.
  return (
    <div
      id={id}
      role="option"
      aria-selected={o.selected}
      aria-disabled={o.isDisabled || undefined}
      // The look reads these presence flags: a CSS module selector holds no attribute value (kit/kitpure.conformance).
      data-selected={o.selected || undefined}
      data-off={o.isDisabled || undefined}
      aria-describedby={describedBy}
      aria-posinset={o.posinset}
      aria-setsize={o.setsize}
      tabIndex={tabbable ? 0 : -1}
      className={cx(s.option, o.tone === 'warn' && s.optionWarn, className)}
      data-mc-row=""
      data-spec={o.spec}
      onKeyDown={(e) => onKey(e, o.spec)}
      onClick={() => onPick(o.spec)}
      onFocus={() => onFocusOpt(o.spec)}
    >
      <span className={s.optText}>
        <span className={s.optLabel} title={o.label}>
          {o.label}
        </span>
        {o.tags?.map((tag) => (
          <span key={tag} className={s.tag}>
            {tag}
          </span>
        ))}
      </span>
      {(o.state || o.hint) && (
        <span id={desc} className={s.optState} aria-hidden="true">
          {o.state}
          {o.hint && <span className={s.srOnly}>{o.state ? ` ${o.hint}` : o.hint}</span>}
        </span>
      )}
      {o.facts && (
        <span id={facts} className={s.optFacts} aria-hidden="true">
          {o.facts}
        </span>
      )}
    </div>
  );
});

export function ModelListbox({ id, labelledBy, describedBy, groups, locked, onActivate, onType, onEscape, focusSpec, focusToken, renderProbe }: ModelListboxProps) {
  const flat = useMemo(() => groups.flatMap((g) => g.options.map((o) => o.spec)), [groups]);
  const [active, setActive] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const hadFocus = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const stop = active !== null && flat.includes(active) ? active : (groups.flatMap((g) => g.options).find((o) => o.selected)?.spec ?? flat[0] ?? null);

  const focusAt = useCallback(
    (spec: string | undefined) => {
      if (spec === undefined) return;
      document.getElementById(optionId(id, spec))?.focus();
    },
    [id],
  );

  // Nearest survivor: the focused option left the list while focus was inside it.
  useLayoutEffect(() => {
    if (active === null || flat.includes(active)) return;
    const was = hadFocus.current && (document.activeElement === document.body || document.activeElement === null || boxRef.current?.contains(document.activeElement));
    setActive(null);
    if (was && flat.length) focusAt(flat[Math.min(lastIndex.current, flat.length - 1)]);
  }, [flat, active, focusAt]);

  // An asked focus (a page change, Back to this view).
  useLayoutEffect(() => {
    if (focusToken === undefined || !focusSpec) return;
    focusAt(flat.includes(focusSpec) ? focusSpec : flat[0]);
    // Only a new token asks again.
  }, [focusToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef({ flat, locked, onActivate, onType, onEscape, focusAt });
  latest.current = { flat, locked, onActivate, onType, onEscape, focusAt };

  const onPick = useCallback((spec: string) => {
    const l = latest.current;
    if (l.locked) return;
    const opt = document.getElementById(optionId(id, spec));
    if (opt?.getAttribute('aria-disabled') === 'true') return;
    l.onActivate(spec);
  }, [id]);

  const onFocusOpt = useCallback((spec: string) => {
    hadFocus.current = true;
    const i = latest.current.flat.indexOf(spec);
    if (i >= 0) lastIndex.current = i;
    setActive(spec);
  }, []);

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, spec: string) => {
      const l = latest.current;
      const i = l.flat.indexOf(spec);
      const go = (j: number) => {
        e.preventDefault();
        l.focusAt(l.flat[Math.max(0, Math.min(l.flat.length - 1, j))]);
      };
      switch (e.key) {
        case 'ArrowDown':
          return go(i + 1);
        case 'ArrowUp':
          return go(i - 1);
        case 'Home':
          return go(0);
        case 'End':
          return go(l.flat.length - 1);
        case 'PageDown':
          return go(i + PAGE_STEP);
        case 'PageUp':
          return go(i - PAGE_STEP);
        case 'Enter':
        case ' ':
          e.preventDefault();
          onPick(spec);
          return;
        case 'Escape':
          if (l.onEscape?.()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && l.onType) {
            e.preventDefault();
            l.onType(e.key);
          }
      }
    },
    [onPick],
  );

  return (
    <div
      ref={boxRef}
      id={id}
      role="listbox"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={locked || undefined}
      data-locked={locked || undefined}
      className={s.listbox}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hadFocus.current = e.relatedTarget === null;
      }}
    >
      {groups.map((g) => {
        const hid = `${id}-g-${specHash(g.id)}`;
        return (
          <div key={g.id} role="group" aria-labelledby={g.label === undefined ? hid : undefined} aria-label={g.label} className={s.group}>
            {g.label === undefined && (
              <div id={hid} className={s.groupHead}>
                {g.header}
              </div>
            )}
            {g.options.map((o) => (
              <ModelOption key={o.spec} listId={id} o={o} tabbable={o.spec === stop} onKey={onKey} onPick={onPick} onFocusOpt={onFocusOpt} probe={renderProbe} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export interface ModelPagerProps {
  pg: Pager;
  /** "{section} pages": the nav's name ("OpenAI models pages"). */
  navLabel: string;
  /** The range as shown ("101–200 of 598", "Groups 9–16 of 22"). */
  range: string;
  prev: string;
  next: string;
  onPage: (page: number) => void;
  /** Ids for the buttons, so a caller can restore focus. */
  idBase?: string;
}

/** Previous · range · Next. A page replaces the section's rows; the buttons are disabled at the ends. One row. */
export function ModelPager({ pg, navLabel, range, prev, next, onPage, idBase }: ModelPagerProps) {
  return (
    <nav aria-label={navLabel} className={s.pager} data-mc-row="">
      <Button variant="ghost" size="sm" id={idBase && `${idBase}-prev`} isDisabled={!pg.hasPrev} onPress={() => onPage(pg.page - 1)}>
        {prev}
      </Button>
      <span className={s.range}>{range}</span>
      <Button variant="ghost" size="sm" id={idBase && `${idBase}-next`} isDisabled={!pg.hasNext} onPress={() => onPage(pg.page + 1)}>
        {next}
      </Button>
    </nav>
  );
}
