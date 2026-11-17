// Tabs in the terminal: one strip line, then a rule, then only the open tab's panel. The open tab is "▸ Label" (bold,
// and filled while the strip has the focus), the others "  Label", so the choice reads in mono; a badge follows its label
// in muted text, with its unit as on the web. One Tab stop: Left/Right move and select (skipping disabled tabs), Home
// and End go to the first and last, as React Aria's tabs with automatic activation. A strip wider than its room shows
// the run of tabs around the open one with "‹ n" / "n ›" counting the hidden ones at each end (tabWindow); the keys and
// a click still reach every tab. `before`, `after` and `end` sit on the strip's row. With `param` the open tab lives in
// the URL; an item's `href` is followed on selection. `sticky` holds in a ListDetail detail that scrolls whole (the
// strip sticks under the detail's header). Not drawn here: the accent band, the edit gestures (rename, reorder, ⋯ menu)
// and the drop target.
import { Fragment, useContext, useRef, type ReactNode } from 'react';
import { Item } from 'react-stately/Item';
import { useTabListState } from 'react-stately/useTabListState';
import type * as Web from './Tabs';
import { Box, Text, useBoxSize, useFocusable, useTerminalSize, type Focusable } from '../../term/prim';
import { SHORT_ROWS } from '../layouts/termBreaks';
import { focusInk } from '../../term/prim/FocusInk';
import { useSem } from '../../term/prim/semantics';
import type { BoxRenderable } from '../../term/prim/otui';
import { DetailStickCtx, useSticky } from '../../term/jsx/sticky';
import { cellWidth } from '../../term/prim/Caret';
import { useGoTerm } from '../../term/app/nav';
import { useSearchParam } from '../nav';
import { TAB_MORE_CELLS, badgeText, tabWindow } from './Tabs.pure';
import { useHoverFill } from '@term/kit';

export type { TabItem, TabsEdit, TabsEditHandle, TabsProps } from './Tabs';
export { dropIndex } from './Tabs.pure';

type Item = Web.TabItem;
type ViewProps = Omit<Web.TabsProps, 'param' | 'push' | 'onChange'> & { onChange: (v: string) => void; go?: (href: string) => void };

/** A badge as words (strings and numbers; any other node counts two cells). */
const badgeWords = (x: Item): string | null => {
  if (x.badge === undefined || x.badge === null || x.badge === false) return null;
  const b = badgeText(x.badge, x.badgeUnit);
  return typeof b === 'string' || typeof b === 'number' ? String(b) : null;
};
/** Cells one tab takes: its mark, label, badge and the gap after it. */
const tabCells = (x: Item): number => {
  const b = badgeWords(x);
  return 2 + cellWidth(x.label) + (b !== null ? cellWidth(b) + 1 : x.badge !== undefined ? 3 : 0) + 2;
};

function TabsView({ items, label, value, onChange, children, before, after, end, go, sticky }: ViewProps) {
  // The web's rule: the value when it names an enabled tab, else the first enabled one.
  const current = items.some((x) => x.id === value && !x.isDisabled) ? value : items.find((x) => !x.isDisabled)?.id;
  const enabled = items.filter((x) => !x.isDisabled);
  // React Stately's tab list state (the web's AriaTabs): the selected key, onSelectionChange only for a different key
  // (the web's onChange adds the same guard). Given the web's `current`, so it never picks one of its own.
  const state = useTabListState<Web.TabsProps['items'][number]>({
    items, children: (x) => <Item key={x.id} textValue={typeof x.label === 'string' ? x.label : x.id}>{x.id}</Item>,
    selectedKey: current, onSelectionChange: (k) => { if (k !== null && String(k) !== current) onChange(String(k)); },
    disabledKeys: items.filter((x) => x.isDisabled).map((x) => x.id),
  });
  const pick = (id: string | undefined): void => {
    if (id === undefined || id === current) return;
    state.setSelectedKey(id);
    const href = items.find((x) => x.id === id)?.href;
    if (href && go) go(href);
  };
  const step = (dir: 1 | -1): void => {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((x) => x.id === current);
    pick(enabled[(at + dir + enabled.length) % enabled.length]?.id);
  };
  const f = useFocusable({
    disabled: enabled.length === 0,
    onKey: (k) => {
      if (k.name === 'right') { step(1); return true; }
      if (k.name === 'left') { step(-1); return true; }
      if (k.name === 'home') { pick(enabled[0]?.id); return true; }
      if (k.name === 'end') { pick(enabled[enabled.length - 1]?.id); return true; }
      return false;
    },
  });
  const [size, onSize] = useBoxSize();
  // A sticky strip in a detail that scrolls whole sticks under the detail's sticky header (the web's --tabs-sticky-top).
  const stick = useContext(DetailStickCtx);
  const self = useRef<BoxRenderable | null>(null);
  useSticky(self, sticky && stick?.on ? { top: stick.head } : undefined);
  const widths = items.map(tabCells);
  const at = Math.max(0, items.findIndex((x) => x.id === current));
  const win = size ? tabWindow(widths, at, size.width) : { from: 0, to: items.length };
  const hiddenBefore = win.from;
  const hiddenAfter = items.length - win.to;
  const panels = items.some((x) => x.content !== undefined);
  const open = items.find((x) => x.id === current);
  const body: ReactNode = panels ? open?.content : current !== undefined ? children : null;
  const hasBody = body !== undefined && body !== null;
  // The strip's own panel starts one blank row under the rule (the web's panel margin): content on the row right under
  // the rule read as part of the bar. None in a short terminal (SHORT_ROWS). A bar-only strip leaves that row to the
  // layout that places it (termParts PageBlock), so a strip at the end of a toolbar block gets one row, not two.
  const air = useTerminalSize().height >= SHORT_ROWS ? 1 : 0;
  return (
    // Stretched across its parent's width even where the parent sizes its children to their content (a toolbar column
    // aligned to the start): the strip measures its ROOM, never its own folded tabs, or a badge arriving on a later
    // render folds "Get notified" into "1 ›" for good (Tabs.room.term.test.tsx). A strip with no panel of its own (the page
    // draws the tab's content after it: Bots, with `display: contents` on the web) is at most its two rows tall: growing in
    // a column parent it took a share of the spare rows and the content below sat that far down (12 blank
    // rows above Bots "Link and keys" at 240x67, 24 at 320x90). It still grows in a row parent (Board's strip row).
    <Box boxRef={self} dir="column" grow={1} shrink={1} alignSelf="stretch" {...(hasBody ? {} : { maxHeight: 2 })} {...(sticky && stick?.on ? { bg: 'bg' as const } : {})}>
      <Box dir="row" shrink={0} gap={1}>
        {before !== undefined ? <Box dir="row" shrink={0}>{before}</Box> : null}
        <Box dir="row" grow={1} shrink={1} onSize={onSize}>
          <Box boxRef={f.ref} dir="row" shrink={0} sem={{ role: 'tablist', name: label }}>
            {hiddenBefore > 0 ? <Text colour="muted">{`‹ ${hiddenBefore} `.padEnd(TAB_MORE_CELLS)}</Text> : null}
            {items.slice(win.from, win.to).map((x) => {
              const on = x.id === current;
              const off = x.isDisabled === true;
              const b = badgeWords(x);
              return (
                <Fragment key={x.id}>
                  <TabCell item={x} on={on} off={off} badge={b} strip={f} onPress={() => { f.focus(); pick(x.id); }} />
                  <Text>{'  '}</Text>
                </Fragment>
              );
            })}
            {hiddenAfter > 0 ? <Text colour="muted">{` ${hiddenAfter} ›`.padStart(TAB_MORE_CELLS)}</Text> : null}
          </Box>
          {after !== undefined ? <Box dir="row" shrink={0}>{after}</Box> : null}
        </Box>
        {end !== undefined ? <Box dir="row" shrink={0}>{end}</Box> : null}
      </Box>
      <Box border={['bottom']} borderColour="line" height={1} shrink={0} />
      {hasBody && air > 0 && <Box height={air} shrink={0} />}
      {hasBody ? <Box dir="column" grow={1} shrink={1} sem={{ role: 'tabpanel', name: open?.label }}>{body}</Box> : null}
    </Box>
  );
}

/** One tab: "▸ Label" open, "  Label" not. The open tab carries the strip's focus (React Aria keeps the focus on the
 *  selected tab), so a reader sees it focused; the others are reached by a click or the arrows. */
function TabCell({ item, on, off, badge, strip, onPress }: { item: Item; on: boolean; off: boolean; badge: string | null; strip: Focusable; onPress: () => void }) {
  // A closed tab's focus is the strip's, moved onto it: focusing a tab selects it (automatic activation).
  const focus: Focusable = on ? strip : { focused: false, ref: strip.ref, focus: onPress, blur: () => strip.blur() };
  const semRef = useSem({ role: 'tab', name: badge !== null ? `${item.label} ${badge}` : item.label, selected: on, disabled: off || undefined }, { role: 'tab', focus, disabled: off });
  const hover = useHoverFill(off, on && strip.focused);
  return (
    <Box boxRef={semRef} dir="row" shrink={0} {...hover} onPress={off ? undefined : onPress}>
      <Text colour={off ? 'faint' : on ? 'ink' : 'muted'} bold={on} dim={off} {...focusInk(on && strip.focused)}>
        {on ? '▸ ' : '  '}
        {item.label}
        {badge !== null ? <Text colour="muted">{` ${badge}`}</Text> : item.badge !== undefined ? <Text colour="muted"> •</Text> : null}
      </Text>
    </Box>
  );
}

/** Items with an href navigate on selection: only then is the router needed. */
function HrefTabs(p: ViewProps) {
  const go = useGoTerm();
  return <TabsView {...p} go={go} />;
}

function View(p: ViewProps) {
  return p.items.some((x) => x.href !== undefined) ? <HrefTabs {...p} /> : <TabsView {...p} />;
}

function UrlTabs({ param, push, onChange, ...rest }: Omit<ViewProps, 'onChange'> & { param: string; push?: boolean; onChange?: (v: string) => void }) {
  const [value, setValue] = useSearchParam(param);
  const first = rest.items[0]?.id;
  return (
    <View
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v === first ? undefined : v, { replace: !push });
        onChange?.(v);
      }}
    />
  );
}

export function Tabs<K extends string = string>({ param, push, value, onChange, ...rest }: Web.TabsProps<K>) {
  const change = onChange as ((v: string) => void) | undefined;
  const props = rest as unknown as Omit<ViewProps, 'onChange' | 'value'>; // contract-any: the item key type K widens to string; ids are compared, never built
  if (param) return <UrlTabs {...props} param={param} push={push} onChange={change} />;
  return <View {...props} value={value} onChange={(v) => change?.(v)} />;
}

/** The terminal has no scroll fades: the strip's edges are drawn by Tabs itself (its hidden-tab counts). */
export const useStripEdges: typeof Web.useStripEdges = () => ({ ref: { current: null }, edges: { start: false, end: false }, fadeClassName: '' });

/** A ‹ or › while that side has more (never here: useStripEdges reports no edges; Tabs counts its hidden tabs itself). */
export const StripMore: typeof Web.StripMore = ({ side, edges }) => (edges[side] ? <Text colour="muted">{side === 'start' ? '‹' : '›'}</Text> : null);
