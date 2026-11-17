// SideTabs in the terminal: the choices in one column, "▸ Label" bold for the picked row and "  Label" for the others;
// the caller draws the panel beside it. As on the web each row is a toggle button (pressed) in a named group, reached
// by Tab; Up/Left and Down/Right, Home and End pick the previous, next, first or last row and move the focus to it.
// Enter, Space or a click pick a row. Picking changes nothing but `value` through `onChange`.
import type * as Web from './SideTabs';
import { useRef } from 'react';
import { Box, Pressable, Text, type Focusable } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';

export type { SideTabItem, SideTabsProps } from './SideTabs';

export function SideTabs<K extends string>({ items, value, onChange, label }: Web.SideTabsProps<K>) {
  const handles = useRef(new Map<string, Focusable | null>());
  const to = (next: number): boolean => {
    const target = items[next];
    if (!target) return true;
    if (target.id !== value) onChange(target.id);
    handles.current.get(target.id)?.focus();
    return true;
  };
  const at = items.findIndex((it) => it.id === value);
  return (
    <Box dir="column" shrink={0} sem={{ role: 'group', name: label }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            dir="row"
            shrink={0}
            hoverFill
            handle={{ get current() { return handles.current.get(it.id) ?? null; }, set current(h) { handles.current.set(it.id, h); } }}
            onPress={() => onChange(it.id)}
            onKey={(k) =>
              k.name === 'down' || k.name === 'right' ? to(Math.min(at + 1, items.length - 1))
              : k.name === 'up' || k.name === 'left' ? to(Math.max(at - 1, 0))
              : k.name === 'home' ? to(0)
              : k.name === 'end' ? to(items.length - 1)
              : false}
            sem={{ role: 'button', name: it.label, pressed: on }}
          >
            {({ focused }) => (
              <Text colour={on ? 'ink' : 'muted'} bold={on} {...focusInk(focused)}>
                {on ? '▸ ' : '  '}
                {it.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </Box>
  );
}
