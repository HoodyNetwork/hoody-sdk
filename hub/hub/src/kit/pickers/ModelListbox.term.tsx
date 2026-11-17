// ModelListbox in the terminal (the web's ModelListbox.tsx): the model chooser's single-select grouped listbox, drawn
// like PickerPanel's rows so both pickers read the same.
//   ›(•) GPT-5  Current · Recommended                                   $1.25 / M
//        Needs setup: API key
// - The mark says the caller's value ((•) / ( )), the › and the focus colour say where the cursor is: selection never
//   follows focus. Tags are words after the label; the state line sits under it (a warn row starts it with "!"), the
//   facts at the line's end. A row that cannot be chosen yet is faint and still takes the cursor (the web's
//   aria-disabled); choosing it does nothing.
// - One Tab stop (the focused row, else the value, else the first). ↓/↑ move across groups without wrapping,
//   Home/End, PageDown/PageUp by 10, Enter/Space activate, a printable key goes to `onType`, Escape asks `onEscape`.
//   When the focused row leaves the list, the cursor goes to the nearest survivor. `focusSpec` + a new `focusToken`
//   move the cursor there (a page change, Back).
// - Groups are named by their header's text; the header itself is drawn, not read (the group carries its name).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './ModelListbox';
import { Box, Text, type Focusable, type Key } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import { textOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { domKey } from '../forms/termField';
import { optionId, specHash } from './modelListboxIds';
import { StopBox } from './termStop';

export type { ListOption, ListGroup, ModelListboxProps, OptionProps, ModelPagerProps } from './ModelListbox';
export { optionId, specHash };

const PAGE_STEP = 10;
type Handle = { current: Focusable | null };

const printable = (k: Key) => !k.ctrl && !k.meta && !k.option && typeof k.sequence === 'string' && k.sequence.length === 1 && k.sequence > ' ';

/** One row: what ModelOption and the listbox both draw. `onKey` sees the terminal key first; false lets Enter/Space press. */
function Row({ o, handle, tabStop, onKey, onPick, onFocus, onBlur }: {
  o: Web.ListOption; handle: Handle; tabStop: boolean; onKey: (k: Key) => boolean; onPick: () => void; onFocus: () => void; onBlur?: () => void;
}) {
  const off = !!o.isDisabled;
  const name = [o.label, ...(o.tags ?? [])].join(' ');
  const description = [o.state, o.hint, o.facts].filter(Boolean).join(' ') || undefined;
  const warn = o.tone === 'warn';
  return (
    <StopBox
      handle={handle}
      tabStop={tabStop}
      onPress={onPick}
      onKey={onKey}
      onFocusChange={(f) => { if (f) onFocus(); else onBlur?.(); }}
      sem={{ role: 'option', name, selected: o.selected, ...(off ? { disabled: true } : {}), ...(description ? { description } : {}) }}
    >
      {(focused) => (
        <>
          <Box dir="row" gap={1} shrink={0} sem={{ hidden: true }}>
            <Text colour={off ? 'faint' : 'ink'} {...focusInk(focused)}>{focused ? '›' : ' '}{o.selected ? '(•)' : '( )'}</Text>
            <Text truncate colour={off ? 'faint' : 'ink'} {...focusInk(focused)} bold={o.selected}>{o.label}</Text>
            {o.tags?.length ? <Text colour="muted" shrink={0}>{o.tags.join(' · ')}</Text> : null}
            {o.facts ? <Box dir="row" grow={1} justify="end" shrink={0}><Text colour="muted">{o.facts}</Text></Box> : null}
          </Box>
          {o.state ? (
            <Box pad={{ left: 5 }} shrink={0} sem={{ hidden: true }}>
              <Text colour={warn ? 'warn' : 'muted'} truncate>{warn ? `! ${o.state}` : o.state}</Text>
            </Box>
          ) : null}
        </>
      )}
    </StopBox>
  );
}

/** One option, as the web's virtualized ModelPickList draws it: its DOM-shaped key handler gets the key first. */
export const ModelOption: typeof Web.ModelOption = (({ o, tabbable, onKey, onPick, onFocusOpt, probe }: Web.OptionProps) => {
  probe?.(o.spec);
  const handle = useRef<Focusable | null>(null);
  return (
    <Row
      o={o}
      handle={handle}
      tabStop={tabbable}
      onKey={(k) => {
        // Enter and Space are the row's own press (the web handler would call onPick for them too).
        if (k.name === 'return' || k.name === 'linefeed' || k.name === 'space') return false;
        const d = domKey(k);
        onKey(d.event as never, o.spec); // contract-any: a terminal key as the slice of a DOM KeyboardEvent the web row handler reads
        return d.taken();
      }}
      onPick={() => onPick(o.spec)}
      onFocus={() => onFocusOpt(o.spec)}
    />
  );
}) as typeof Web.ModelOption;

export const ModelListbox: typeof Web.ModelListbox = ({ id, labelledBy, describedBy, groups, locked, onActivate, onType, onEscape, focusSpec, focusToken, renderProbe }) => {
  const options = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const flat = useMemo(() => options.map((o) => o.spec), [options]);
  const [active, setActive] = useState<string | null>(null);
  const lastIndex = useRef(0);
  /** The row that holds the focus (kept when it unmounts while focused: that is what "had the focus" means here). */
  const holder = useRef<string | null>(null);
  const handles = useRef(new Map<string, Handle>());
  const handleOf = (spec: string): Handle => {
    let h = handles.current.get(spec);
    if (!h) { h = { current: null }; handles.current.set(spec, h); }
    return h;
  };
  const focusAt = (spec: string | undefined) => { if (spec !== undefined) handles.current.get(spec)?.current?.focus(); };
  const stop = active !== null && flat.includes(active) ? active : (options.find((o) => o.selected)?.spec ?? flat[0] ?? null);

  // Nearest survivor: the focused row left the list.
  useEffect(() => {
    if (active === null || flat.includes(active)) return;
    const had = holder.current === active;
    setActive(null);
    if (had && flat.length) focusAt(flat[Math.min(lastIndex.current, flat.length - 1)]);
    for (const k of [...handles.current.keys()]) if (!flat.includes(k)) handles.current.delete(k);
  }, [flat, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // An asked focus: only a new token asks again.
  useEffect(() => {
    if (focusToken === undefined || !focusSpec) return;
    focusAt(flat.includes(focusSpec) ? focusSpec : flat[0]);
  }, [focusToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (o: Web.ListOption) => { if (!locked && !o.isDisabled) onActivate(o.spec); };
  const onKey = (k: Key, spec: string): boolean => {
    const i = flat.indexOf(spec);
    const go = (j: number) => { focusAt(flat[Math.max(0, Math.min(flat.length - 1, j))]); return true; };
    switch (k.name) {
      case 'down': return go(i + 1);
      case 'up': return go(i - 1);
      case 'home': return go(0);
      case 'end': return go(flat.length - 1);
      case 'pagedown': return go(i + PAGE_STEP);
      case 'pageup': return go(i - PAGE_STEP);
      case 'escape': return onEscape?.() ?? false;
    }
    if (printable(k) && onType) { onType(k.sequence!); return true; }
    return false;
  };

  return (
    <Box
      dir="column"
      shrink={0}
      sem={{ role: 'listbox', id, labelledBy, ...(describedBy ? { describedBy } : {}), ...(locked ? { disabled: true } : {}) }}
    >
      {groups.map((g, gi) => {
        const head: ReactNode = g.label === undefined ? g.header : null;
        return (
          <Box key={g.id} dir="column" shrink={0} pad={{ top: gi === 0 || head === null ? 0 : 1 }} sem={{ role: 'group', id: `${id}-g-${specHash(g.id)}`, name: g.label ?? textOf(g.header) }}>
            {head !== null ? (
              <Box dir="row" gap={1} shrink={0} pad={{ left: 1 }} sem={{ hidden: true }}>{head}</Box>
            ) : null}
            {g.options.map((o) => {
              renderProbe?.(o.spec);
              return (
                <Row
                  key={o.spec}
                  o={o}
                  handle={handleOf(o.spec)}
                  tabStop={o.spec === stop}
                  onKey={(k) => onKey(k, o.spec)}
                  onPick={() => pick(o)}
                  onFocus={() => { holder.current = o.spec; lastIndex.current = Math.max(0, flat.indexOf(o.spec)); setActive(o.spec); }}
                  onBlur={() => { if (holder.current === o.spec) holder.current = null; }}
                />
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
};

/** Previous · range · Next on one row; the buttons are disabled at the ends. */
export const ModelPager: typeof Web.ModelPager = ({ pg, navLabel, range, prev, next, onPage, idBase }) => (
  <Box dir="row" gap={2} shrink={0} sem={{ role: 'navigation', name: navLabel }}>
    <Button variant="ghost" size="sm" {...(idBase ? { id: `${idBase}-prev` } : {})} isDisabled={!pg.hasPrev} onPress={() => onPage(pg.page - 1)}>{prev}</Button>
    <Text colour="muted">{range}</Text>
    <Button variant="ghost" size="sm" {...(idBase ? { id: `${idBase}-next` } : {})} isDisabled={!pg.hasNext} onPress={() => onPage(pg.page + 1)}>{next}</Button>
  </Box>
);
