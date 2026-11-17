// A row of tabs or views in the terminal (DetailPage's tabs, the page view strip): Tab reaches the strip, ←/→ (h/l)
// move between items and open them (the web's automatic tab activation), Home/End jump to the ends; a click opens.
// The open item is bold and underlined with a '▸' mark (reads in mono); the focused one is on the focus plate (focusInk).
// In mono focusInk is bold and underlined, which is the open item's own look, so there the focused item is inverse too.
import { useRef, type ReactNode } from 'react';
import { Box, Text, useFocusable, type Key } from '../../term/prim';
import { useFocusSem } from './termParts';
import { colourTier, focusInk, useHoverFill } from '@term/kit';

export interface TabStripItem { id: string; label: string; badge?: ReactNode; isDisabled?: boolean }

function Tab({ item, open, onOpen, onKey, register }: {
  item: TabStripItem; open: boolean; onOpen: () => void; onKey: (k: Key) => boolean; register: (focus: (() => void) | null) => void;
}): ReactNode {
  const f = useFocusable({ disabled: item.isDisabled, onKey: (k) => (k.name === 'return' || k.name === 'space' ? (onOpen(), true) : onKey(k)) });
  register(f.focus);
  const ref = useFocusSem(f, { role: 'tab', name: item.label, selected: open, ...(item.isDisabled ? { disabled: true } : {}) });
  const hover = useHoverFill(item.isDisabled === true, f.focused);
  return (
    <Box dir="row" boxRef={ref} shrink={0} {...hover} onPress={item.isDisabled ? undefined : () => { f.focus(); onOpen(); }}>
      <Text colour={item.isDisabled ? 'faint' : open ? 'ink' : 'muted'} bold={open} underline={open} inverse={f.focused && colourTier() === 'mono'} {...focusInk(f.focused)}>
        {open ? '▸' : ' '}{item.label}
      </Text>
      {item.badge !== undefined && item.badge !== null && item.badge !== false && (
        <Box dir="row" pad={{ left: 1 }}>{typeof item.badge === 'string' || typeof item.badge === 'number' ? <Text colour="muted">{item.badge}</Text> : item.badge}</Box>
      )}
      <Text> </Text>
    </Box>
  );
}

export function TabStrip({ items, value, onChange, label }: { items: readonly TabStripItem[]; value: string | undefined; onChange: (id: string) => void; label?: string }): ReactNode {
  const focusers = useRef(new Map<string, () => void>());
  const usable = items.filter((x) => !x.isDisabled);
  const go = (to: TabStripItem | undefined) => { if (!to) return; onChange(to.id); focusers.current.get(to.id)?.(); };
  const onKey = (from: string) => (k: Key): boolean => {
    const i = usable.findIndex((x) => x.id === from);
    if (k.name === 'right' || k.name === 'l') { go(usable[(i + 1) % usable.length]); return true; }
    if (k.name === 'left' || k.name === 'h') { go(usable[(i - 1 + usable.length) % usable.length]); return true; }
    if (k.name === 'home') { go(usable[0]); return true; }
    if (k.name === 'end') { go(usable[usable.length - 1]); return true; }
    return false;
  };
  return (
    <Box dir="row" wrap shrink={0} border={['bottom']} borderColour="line" sem={{ role: 'tablist', ...(label ? { name: label } : {}) }}>
      {items.map((x) => (
        <Tab key={x.id} item={x} open={x.id === value} onOpen={() => onChange(x.id)} onKey={onKey(x.id)}
          register={(fn) => { if (fn) focusers.current.set(x.id, fn); else focusers.current.delete(x.id); }} />
      ))}
    </Box>
  );
}
