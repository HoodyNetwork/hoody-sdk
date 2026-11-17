// PickerPanel in the terminal (the web's PickerPanel.tsx; same contract, same pure rules in pickerLogic.ts).
//   - Rows are one line each: the mark, the lead, the label, the note (muted) and the aside at the line's end; the
//     description (or a disabled row's reason) and the facts on lines under it. The mark is a glyph, never a colour:
//     single mode (•) / ( ), multi [✓] / [ ]; a disabled row is faint AND says why.
//   - One Tab stop for the list (roving, the web's): arrows / Home / End move, Space picks or ticks, Enter picks
//     (single) or confirms (multi); ↓ from the last row enters the create slot, ↑ from the first row goes to the search.
//     Typing a letter on a row starts the search. A fold toggle (▸ / ▾ and the count) is a stop in the same order.
//   - When the focused row goes away (filtered out, moved under another group) the focus goes to the same row if it
//     is still drawn, else the nearest one after, else before, else the search box or the create slot.
//   - The list scrolls inside its host (a popover is clamped to the screen) and keeps the focused row in view. With
//     `maxRows` and more rows than that, it is as tall as its first maxRows rows and scrolls the rest.
//   - The footer is two buttons under a hairline, outside the list: Tab reaches it, arrows never do.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './PickerPanel';
import { Box, Scroll, Text, isPressKey, useFocusChange, useFocusControl, useFocusable, useKeys, type Focusable, type Key } from '../../term/prim';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import { focusInk } from '../../term/prim/FocusInk';
import type { BoxRenderable } from '../../term/prim/otui';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { SearchField } from '../forms/fields';
import { useFieldLock } from '../forms/lock';
import { EmptyState, ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { arrange, filterItems, toggled, type PickerItem } from './pickerLogic';
import strings from './PickerPanel.strings.en.json';
import { StopBox } from './termStop';

export type { PickerItem } from './pickerLogic';
export type { PickerPanelProps } from './PickerPanel';

/** Rows above which the search box shows by itself (the web's constant). */
export const SEARCH_ABOVE: typeof Web.SEARCH_ABOVE = 7;

interface Stop {
  key: string;
  item?: PickerItem;
  fold?: string;
}
const foldKey = (title: string) => `\u0000fold:${title}`;
const NONE: ReadonlySet<string> = new Set();
const printable = (k: Key) => !k.ctrl && !k.meta && !k.option && typeof k.sequence === 'string' && k.sequence.length === 1 && k.sequence > ' ';

export const PickerPanel: typeof Web.PickerPanel = ({ label, showLabel, 'aria-describedby': describedBy, maxRows, items, mode, value, onChange, minPicked = 0, searchable, searchLabel, emptyText, renderCreate, collapsible, keepOrder, status, summary, onConfirm, footer, isDisabled: disabledProp, onQuery, searchTally }) => {
  const t = useStrings(strings);
  const hintId = useId();
  const isDisabled = useFieldLock(disabledProp);
  const fc = useFocusControl();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [first, setFirst] = useState<ReadonlySet<string> | null>(null);
  if (items !== undefined && items.length > 0 && first === null) setFirst(new Set(value));
  const [folded, setFolded] = useState<ReadonlySet<string> | null>(null);
  if (items !== undefined && items.length > 0 && folded === null) setFolded(new Set((collapsible ?? []).filter((g) => !items.some((i) => i.group === g && value.includes(i.id)))));
  const [searchFolded, setSearchFolded] = useState<ReadonlySet<string>>(() => new Set());
  const searching = query.trim() !== '';
  const foldable = (title: string | null): title is string => title !== null && (collapsible ?? []).includes(title);
  const isFolded = (title: string) => (searching ? searchFolded.has(title) : (folded?.has(title) ?? true));
  const fold = (title: string, on: boolean) => {
    const flip = (f: ReadonlySet<string> | null) => { const n = new Set(f ?? []); if (on) n.add(title); else n.delete(title); return n; };
    if (searching) setSearchFolded(flip);
    else setFolded(flip);
  };

  const failed = Boolean(status?.error);
  const rejection = typeof status?.error === 'object' ? status.error : undefined;
  const loading = items === undefined && !failed;
  const total = items?.length ?? 0;
  const hasSearch = items !== undefined && (searchable ?? total > SEARCH_ABOVE);
  const groups = items ? arrange(filterItems(items, hasSearch ? query : ''), keepOrder ? NONE : (first ?? NONE)) : [];
  const shown = groups.flatMap((g) => g.rows);
  const stops: Stop[] = groups.flatMap((g) => {
    const head: Stop[] = foldable(g.title) ? [{ key: foldKey(g.title), fold: g.title }] : [];
    const open = !foldable(g.title) || !isFolded(g.title);
    return [...head, ...(open ? g.rows.filter((i) => !i.isDisabled && !isDisabled).map((i) => ({ key: i.id, item: i })) : [])];
  });
  const tab = stops.find((x) => x.key === active) ?? stops.find((x) => x.item && value.includes(x.item.id)) ?? stops[0];
  // The caller hears every search text (a caller that offers more rows while a search is typed), as on the web.
  const changeQuery = (q: string) => { setQuery(q); setSearchFolded(new Set()); onQuery?.(q); };
  // maxRows: the lines its first maxRows rows take (a row's description and facts are lines of their own).
  const capLines = typeof maxRows === 'number' && maxRows > 0 && shown.length > maxRows
    ? shown.slice(0, maxRows).reduce((n, i) => n + 1 + ((i.isDisabled || isDisabled) && i.disabledReason ? 1 : i.description ? 1 : 0) + (i.facts ? 1 : 0), 0)
    : undefined;

  // Focus handles of the drawn stops, the search box and the create slot.
  const handles = useRef(new Map<string, { current: Focusable | null }>());
  const handleOf = (key: string) => { let h = handles.current.get(key); if (!h) { h = { current: null }; handles.current.set(key, h); } return h; };
  const search = useRef<HTMLInputElement | null>(null);
  const slot = useRef<BoxRenderable | null>(null);
  const focusStop = (x: Stop | undefined) => { if (!x) return; setActive(x.key); handles.current.get(x.key)?.current?.focus(); };
  // The create slot's first control, if there is a slot (the web's `slotControl()?.focus()`). focusFirst(null) would
  // focus the first stop of the whole screen: ↓ on the last row left the list for the top of the page or drawer.
  const focusSlot = () => { if (slot.current) fc.focusFirst(slot.current); };

  // Keep the keyboard where it was when its row goes away (the web's rule; see the header).
  const held = useRef<string | null>(null);
  const lastStops = useRef<string[]>([]);
  useEffect(() => {
    const h = held.current;
    const keys = stops.map((x) => x.key);
    if (h !== null && !keys.includes(h) && fc.current() === null) {
      const before = lastStops.current;
      const at = before.indexOf(h);
      const live = new Set(keys);
      const near = before.slice(at + 1).find((x) => live.has(x)) ?? before.slice(0, Math.max(at, 0)).reverse().find((x) => live.has(x)) ?? keys[0];
      held.current = near ?? null;
      if (near !== undefined) focusStop(stops.find((x) => x.key === near));
      else if (search.current) search.current.focus();
      else focusSlot();
    }
    lastStops.current = keys;
  });

  const press = (i: PickerItem) => {
    if (i.isDisabled || isDisabled) return;
    const r = toggled(mode, value, i.id, minPicked);
    setBlocked(r.blocked);
    if (!r.blocked) onChange(r.next);
  };

  const onStopKey = (k: Key, x: Stop): boolean => {
    const at = stops.findIndex((y) => y.key === x.key);
    switch (k.name) {
      case 'down':
      case 'right': {
        const next = stops[at + 1];
        if (next) focusStop(next);
        else focusSlot();
        return true;
      }
      case 'up':
      case 'left':
        if (at > 0) focusStop(stops[at - 1]);
        else search.current?.focus();
        return true;
      case 'home': focusStop(stops[0]); return true;
      case 'end': focusStop(stops[stops.length - 1]); return true;
    }
    if (hasSearch && printable(k)) {
      changeQuery(query + k.sequence);
      search.current?.focus();
      return true;
    }
    return false;
  };

  // ↑ from the create slot's first control comes back to the list's last stop (the slot's controls do not take ↑).
  useKeys((k) => {
    if (k.name !== 'up' || !fc.containsFocus(slot.current) || !stops.length) return false;
    focusStop(stops[stops.length - 1]);
    return true;
  });

  const count = mode === 'multi' ? (summary ? summary(value.length) : t('pp.selected', { count: value.length })) : null;
  const hint = minPicked > 0 && mode === 'multi' && (blocked || value.length < minPicked) ? t('pp.minPicked', { count: minPicked }) : null;
  const live = [count, hasSearch && searching ? (searchTally ? searchTally(shown.length) : t('pp.shown', { shown: shown.length, total })) : null].filter(Boolean).join(' · ');

  const row = (i: PickerItem) => {
    const on = value.includes(i.id);
    const off = Boolean(i.isDisabled || isDisabled);
    const sub = off && i.disabledReason ? i.disabledReason : i.description;
    const mark = mode === 'multi' ? (on ? '[✓]' : '[ ]') : on ? '(•)' : '( )';
    // The row's text as the web reads it: the label, its note, then what the aside draws (its words are `keywords`).
    const said = [i.label, i.note].filter((w): w is string => !!w);
    // Then the description (or a disabled row's reason) and the facts: the web reads them as part of the row too.
    const name = [...said, ...(i.keywords ?? []).filter((w) => !said.includes(w)), sub, i.facts].filter(Boolean).join(' ');
    return (
      <StopBox
        key={i.id}
        handle={handleOf(i.id)}
        disabled={off}
        tabStop={!off && tab?.key === i.id}
        onPress={() => { setActive(i.id); press(i); }}
        onKey={(k) => {
          // Enter: picks in single mode (the press), confirms in multi mode (Space ticks).
          if (mode === 'multi' && (k.name === 'return' || k.name === 'linefeed')) { if (!off) onConfirm?.(); return true; }
          return onStopKey(k, { key: i.id, item: i });
        }}
        onFocusChange={(f) => { if (f) { setActive(i.id); held.current = i.id; } else if (held.current === i.id) held.current = null; }}
        sem={{
          role: mode === 'multi' ? 'checkbox' : 'radio', name, checked: on, ...(off ? { disabled: true } : {}),
          ...(hint && blocked && active === i.id ? { describedBy: hintId } : {}),
        }}
      >
        {(focused) => (
          <>
            <Box dir="row" gap={1} shrink={0} sem={{ hidden: true }}>
              <Text colour={off ? 'faint' : 'ink'} {...focusInk(focused)}>{focused ? '›' : ' '}{mark}</Text>
              {i.lead !== undefined ? <Box dir="row" shrink={0} gap={1}>{i.lead}</Box> : null}
              <Text truncate colour={off ? 'faint' : 'ink'} {...focusInk(focused)} bold={on}>{i.label}</Text>
              {i.note ? <Text colour="muted" shrink={0}>{i.note}</Text> : null}
              {i.aside !== undefined ? <Box dir="row" grow={1} justify="end" shrink={0} gap={1}>{i.aside}</Box> : null}
            </Box>
            {sub ? <Box pad={{ left: 5 }} shrink={0} sem={{ hidden: true }}><Text colour="muted" truncate>{sub}</Text></Box> : null}
            {i.facts ? <Box pad={{ left: 5 }} shrink={0} sem={{ hidden: true }}><Text colour="faint" truncate>{i.facts}</Text></Box> : null}
          </>
        )}
      </StopBox>
    );
  };

  return (
    <Box dir="column" shrink={1} gap={0} minHeight={0}>
      {showLabel ? <Text bold>{label}</Text> : null}
      {hasSearch ? (
        <Box dir="row" shrink={0}>
          <SearchField
            label={searchLabel ?? t('pp.search')}
            placeholder={searchLabel ?? t('pp.search')}
            value={query}
            onChange={(v) => { changeQuery(v); setBlocked(false); }}
            isDisabled={isDisabled}
            inputRef={search}
            onKeyDown={(e) => { if (e.key === 'ArrowDown' && stops.length) { e.preventDefault(); focusStop(tab); } }}
          />
        </Box>
      ) : null}
      {/* One live region: the count, the search tally and the minimum-pick refusal. */}
      {live || hint ? (
        <Box dir="row" shrink={0} sem={{ role: 'status' }}>
          <Text colour="muted">{live}</Text>
          {hint ? <Box dir="row" shrink={0} sem={{ id: hintId }}><Text colour="warn">{`${live ? ' · ' : ''}! ${hint}`}</Text></Box> : null}
        </Box>
      ) : null}
      {loading ? <Skeleton rows={3} /> : null}
      {failed ? (
        <Box dir="column" shrink={0}>
          <ErrorState size="compact" title={status?.title ?? t('pp.error')} onRetry={status?.onRetry} error={rejection} />
          {status?.details as ReactNode}
        </Box>
      ) : null}
      {items !== undefined && items.length === 0 && !failed ? <EmptyState size="compact" icon="search" title={emptyText ?? t('pp.empty')} /> : null}
      {items !== undefined && items.length > 0 && shown.length === 0 ? (
        <Box dir="row" gap={1} shrink={0}>
          <Text colour="muted">{t('pp.noMatch', { q: query.trim() })}</Text>
          <TextButton onPress={() => changeQuery('')}>{t('pp.clear')}</TextButton>
        </Box>
      ) : null}
      {shown.length > 0 ? (
        <Scroll dir="column" shrink={1} minHeight={1} {...(capLines !== undefined ? { maxHeight: capLines } : {})} followFocus sem={{ role: mode === 'multi' ? 'group' : 'radiogroup', name: label, ...(describedBy ? { describedBy } : {}) }}>
          {groups.map((g, gi) => {
            const rows = g.rows.map(row);
            if (g.title === null) return <Box key="none" dir="column" shrink={0}>{rows}</Box>;
            const title = g.title;
            const heading = g.label ?? title;
            if (foldable(title)) {
              const key = foldKey(title);
              const open = !isFolded(title);
              return (
                <Box key={`g:${title}`} dir="column" shrink={0} sem={{ role: 'group', name: heading }}>
                  <StopBox
                    handle={handleOf(key)}
                    tabStop={tab?.key === key}
                    onPress={() => { setActive(key); fold(title, open); }}
                    onKey={(k) => onStopKey(k, { key, fold: title })}
                    onFocusChange={(f) => { if (f) { setActive(key); held.current = key; } else if (held.current === key) held.current = null; }}
                    sem={{ role: 'button', name: t('pp.groupCount', { title: heading, n: g.rows.length }), expanded: open }}
                  >
                    {(focused) => <Box shrink={0} sem={{ hidden: true }}><Text colour="muted" bold {...focusInk(focused)}>{`${focused ? '›' : ' '}${open ? '▾' : '▸'} ${t('pp.groupCount', { title: heading, n: g.rows.length })}`}</Text></Box>}
                  </StopBox>
                  {open ? rows : null}
                </Box>
              );
            }
            return (
              <Box key={`g:${title}`} dir="column" shrink={0} sem={{ role: 'group', name: heading }} {...(gi > 0 ? { paddingTop: 0 } : {})}>
                <Box shrink={0} sem={{ hidden: true }}><Text colour="muted" bold>{` ${heading}`}</Text></Box>
                {rows}
              </Box>
            );
          })}
        </Scroll>
      ) : null}
      {renderCreate && !loading ? (
        <Box boxRef={slot} dir="column" shrink={0}>
          {renderCreate()}
        </Box>
      ) : null}
      {footer ? (
        <Box dir="column" shrink={0} sem={{ role: 'group', name: t('pp.actions') }}>
          <Text colour="line" truncate>{'─'.repeat(120)}</Text>
          <Box dir="row" gap={2} shrink={0}>
            <Button variant="primary" size="sm" onPress={footer[0].onPress} isDisabled={footer[0].isDisabled}>{footer[0].label}</Button>
            {footer[1] ? <Button variant="secondary" size="sm" onPress={footer[1].onPress} isDisabled={footer[1].isDisabled}>{footer[1].label}</Button> : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};
