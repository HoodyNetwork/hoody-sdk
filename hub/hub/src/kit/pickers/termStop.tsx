// The terminal side of the pickers, shared by PickerPanel.term and ModelListbox.term (never imported by web code).
import { useMemo, type ReactNode } from 'react';
import { Box, isPressKey, useFocusChange, useFocusable, type Focusable, type Key } from '../../term/prim';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import type { BoxRenderable } from '../../term/prim/otui';

/** One keyboard stop (a row or a fold toggle): focusable, roving (`tabStop` only on the active stop), its keys in the
 *  web's order: `onKey` first (Enter in multi mode confirms rather than ticks), then Enter / Space press. A click
 *  presses. A disabled stop takes no focus and no press. */
export function StopBox({ handle, disabled, tabStop, onPress, onKey, onFocusChange, sem, children }: {
  handle: { current: Focusable | null }; disabled?: boolean; tabStop: boolean; onPress: () => void; onKey: (k: Key) => boolean;
  onFocusChange: (f: boolean) => void; sem: Sem; children: (focused: boolean) => ReactNode;
}) {
  const f = useFocusable({
    disabled,
    tabStop,
    onKey: (k) => {
      if (onKey(k)) { k.preventDefault?.(); return true; }
      if (isPressKey(k)) { k.preventDefault?.(); onPress(); return true; }
      return false;
    },
  });
  handle.current = f;
  useFocusChange(f.focused, onFocusChange);
  const semRef = useSem(sem, { role: sem.role ?? 'button', disabled, focus: f });
  const ref = useMemo(() => mergeRefs<BoxRenderable>(f.ref, semRef), [f.ref, semRef]);
  return (
    <Box boxRef={ref} dir="column" shrink={0} onPress={() => { if (disabled) return; f.focus(); onPress(); }}>
      {children(f.focused)}
    </Box>
  );
}
