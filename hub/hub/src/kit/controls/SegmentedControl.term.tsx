// SegmentedControl in the terminal: the choices in one row, ‹ Label › around the chosen one (also filled), plain
// "  Label  " around the others, so the choice reads in mono. As React Aria's toggle group (a toolbar of radios): one Tab
// stop, Left/Right move the focus between enabled segments without wrapping, Enter / Space or a click choose. A count follows its label in muted text. With
// `param` the choice lives in the URL as on the web (the first item is the default and leaves it clean). The folder
// variant is the kit Tabs strip's look on the web (SegmentedControl.module.css .folder), so here it draws Tabs.term's
// tab: "▸ Label" bold for the chosen view, "  Label" for the others, no fill and never ‹ › (a terminal tab strip's
// carousel markers: a folder switch must not read as a folded strip). A control whose labels do not all fit whole draws a Select of the same choices (the web
// does so for fullWidth only; a clipped terminal row would silently drop choices). A form
// row (showLabel, description, info) is a FieldFrame; `info` shows as its help line when there is no description.
import type * as Web from './SegmentedControl';
import { useRef, useState } from 'react';
import { useToggleGroupState } from 'react-stately/useToggleGroupState';
import { Box, Pressable, Text, useBoxSize, type Focusable } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import { cellWidth } from '../../term/prim/Caret';
import { Select } from '../forms/more';
import { FieldFrame } from '../forms/termField';
import { useSearchParam } from '../nav';

export type { SegmentItem, SegmentedControlProps } from './SegmentedControl';

type Item = Web.SegmentItem;

/** One segment as text: the label, then its count. */
const segText = (x: Item): string => (x.count !== undefined ? `${x.label} ${x.count}` : x.label);
/** Cells the row needs: each segment plus its two marks and a space each side. */
const rowNeed = (items: readonly Item[]): number => items.reduce((n, x) => n + cellWidth(segText(x)) + 4, 0);

function Segmented({ items, label, fullWidth, isDisabled, value, onChange, folder }: { items: readonly Item[]; label: string; fullWidth?: boolean; isDisabled?: boolean; value: string | undefined; onChange: (v: string) => void; folder?: boolean }) {
  // The web's rule: no value means the first enabled item; a value naming no item shows no choice; a disabled one shows
  // the first enabled item.
  const named = items.find((x) => x.id === value);
  const firstOn = items.find((x) => !x.isDisabled)?.id;
  const current = named && !named.isDisabled ? value : value === undefined || named ? firstOn : undefined;
  // React Stately's toggle group state (the web's ToggleButtonGroup: single, never empty), given the web's `current`.
  const state = useToggleGroupState({
    selectionMode: 'single', disallowEmptySelection: true, isDisabled,
    selectedKeys: current !== undefined ? [current] : [],
    onSelectionChange: (keys) => { const next = [...keys][0]; if (next !== undefined && String(next) !== current) onChange(String(next)); },
  });
  const pick = (id: string): void => {
    if (id !== current) state.setSelected(id, true);
  };
  // React Aria's toggle group is a toolbar: ← → move the focus between enabled segments (no wrap), Enter / Space or a
  // click choose; Tab enters at the segment last focused (else the first enabled) and leaves the group.
  const handles = useRef(new Map<string, Focusable | null>());
  const [last, setLast] = useState<string | undefined>();
  const usable = items.filter((x) => !x.isDisabled && !isDisabled);
  const entry = usable.some((x) => x.id === last) ? last : usable[0]?.id;
  const move = (from: string, dir: 1 | -1): boolean => {
    const at = usable.findIndex((x) => x.id === from);
    const to = usable[at + dir];
    if (to) handles.current.get(to.id)?.focus();
    return true;
  };
  const [size, onSize] = useBoxSize();
  // The web falls back only for fullWidth (a browser row overflows visibly otherwise). Here an overflowing row would be
  // clipped and its last choices silently gone (7 colours in a dialog), so any row that cannot hold every
  // whole segment shows the Select. The measured box is the ROOM the row is given, the same box in both modes: it asks
  // for the segments' width and shrinks to what is left (full width when fullWidth). Measuring what is drawn would
  // stick: the Select's own box is always narrower than the segments, so one narrow first layout never came back
  // (AI goldens flapping between the segments and the Select).
  const need = rowNeed(items);
  // shrink caps it in a row; maxWidth in a column (a row's width is the column's cross axis, which shrink never cuts).
  const room = fullWidth ? { grow: 1, shrink: 1, minWidth: 0 } : { width: need, maxWidth: '100%' as const, shrink: 1, minWidth: 0 };
  // fullWidth grows into the row, and its basis is the segments' width in BOTH modes: the Select's box also holds a
  // zero-height strut of that width. A basis of what is drawn (the narrower Select) took a smaller share beside another
  // grow item, so a row with room for the segments had a second stable layout stuck on the Select (AI
  // chat-list toolbar). The Select stays a column child, stretched to the box and cut with "…" as before.
  if (size && size.width > 0 && need > size.width) {
    return (
      <Box onSize={onSize} {...room}>
        {fullWidth ? <Box width={need} height={0} shrink={0} /> : null}
        <Select
          aria-label={label}
          options={items.map((x) => ({ value: x.id, label: x.label, description: x.count !== undefined ? String(x.count) : undefined, isDisabled: x.isDisabled }))}
          value={current}
          onChange={(v) => pick(v)}
          isDisabled={isDisabled}
        />
      </Box>
    );
  }
  return (
    <Box onSize={onSize} {...room} dir="row">
      <Box dir="row" shrink={0} sem={{ role: 'radiogroup', name: label, disabled: isDisabled || undefined }}>
        {items.map((x) => {
          const on = x.id === current;
          const off = isDisabled === true || x.isDisabled === true;
          return (
            <Pressable
              key={x.id}
              dir="row"
              shrink={0}
              disabled={off}
              tabStop={x.id === entry}
              handle={{ get current() { return handles.current.get(x.id) ?? null; }, set current(h) { handles.current.set(x.id, h); } }}
              onFocusChange={(f) => { if (f) setLast(x.id); }}
              onPress={() => pick(x.id)}
              onKey={(k) => (k.name === 'right' ? move(x.id, 1) : k.name === 'left' ? move(x.id, -1) : false)}
              sem={{ role: 'radio', name: x.label, checked: on, ...(x.count !== undefined ? { description: String(x.count) } : {}) }}
            >
              {({ focused }) => (
                <Text colour={off ? 'faint' : on ? 'ink' : 'muted'} bg={on && !off && !folder ? 'selected' : undefined} bold={on} dim={off && !on} {...focusInk(focused)}>
                  {on ? (folder ? '▸ ' : '‹ ') : '  '}
                  {x.label}
                  {x.count !== undefined ? <Text colour="muted">{` ${x.count}`}</Text> : null}
                  {on && !folder ? ' ›' : '  '}
                </Text>
              )}
            </Pressable>
          );
        })}
      </Box>
    </Box>
  );
}

function UrlSegmented({ param, push, onChange, ...rest }: { items: readonly Item[]; label: string; fullWidth?: boolean; isDisabled?: boolean; param: string; push?: boolean; onChange?: (v: string) => void; folder?: boolean }) {
  const [value, setValue] = useSearchParam(param);
  const first = rest.items[0]?.id;
  return (
    <Segmented
      {...rest}
      value={rest.items.some((x) => x.id === value) ? value : undefined}
      onChange={(v) => {
        setValue(v === first ? undefined : v, { replace: !push });
        onChange?.(v);
      }}
    />
  );
}

export function SegmentedControl<K extends string = string>({ param, push, value, onChange, showLabel, description, info, items, label, fullWidth, isDisabled, variant }: Web.SegmentedControlProps<K>) {
  const change = onChange as ((v: string) => void) | undefined;
  const folder = variant === 'folder';
  const control = param
    ? <UrlSegmented items={items} label={label} fullWidth={fullWidth} isDisabled={isDisabled} param={param} push={push} onChange={change} folder={folder} />
    : <Segmented items={items} label={label} fullWidth={fullWidth} isDisabled={isDisabled} value={value} onChange={(v) => change?.(v)} folder={folder} />;
  const help = description !== undefined && description !== null && description !== false;
  if (!showLabel && !help && !info) return control;
  return (
    <FieldFrame label={label} disabled={isDisabled} description={help ? description : info}>
      {control}
    </FieldFrame>
  );
}
