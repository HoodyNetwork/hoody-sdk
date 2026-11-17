// PickCard in the terminal (the web's PickCard.tsx): a framed card you press to pick one thing. The whole card is one
// press: a mark, the title (bold) with its tag at the line's end, the line in ink, the note muted (two lines at most),
// the mono line muted. The frame tells the state and words always repeat it: the focused card's frame is the focus
// colour and its title gets the › cursor; "you were here" draws an ink frame AND adds its words to the mono line.
// The current choice of a set (`isSelected`) draws the ink frame too and is said as pressed. A card that cannot be picked
// stays focusable, is faint, does nothing on a press and says why on its mono line.
// Standalone it is one Pressable; inside a CardGrid the grid owns the press and the focus (PickCardRow), the card draws.
import { useContext, useImperativeHandle, useRef, type Ref } from 'react';
import type * as Web from './PickCard';
import { Box, Pressable, Text, type Focusable } from '../../term/prim';
import { Icon } from '../icons';
import { PickCardRow } from './pickCardRow';

export type { PickCardProps, PickCardRowState } from './PickCard';
export { PickCardRow } from './pickCardRow';

function Body({ title, mark, end, endIcon, line, note, meta, here, isSelected, isDisabled, disabledReason, focused }: Web.PickCardProps & { focused: boolean }) {
  // The words the mono line ends with: why the card is off, else that it is the one opened last.
  const mono = [meta, isDisabled && disabledReason ? disabledReason : here].filter(Boolean).join(' · ');
  return (
    <Box dir="column" shrink={0} border borderColour={focused ? 'focus' : here || isSelected ? 'ink' : 'lineStrong'} padX={1} sem={{ hidden: true }}>
      <Box dir="row" gap={1} shrink={0}>
        {mark !== undefined ? <Box shrink={0}>{mark}</Box> : null}
        <Text bold truncate colour={isDisabled ? 'faint' : 'ink'}>{`${focused ? '› ' : ''}${title}`}</Text>
        {end !== undefined || endIcon !== undefined ? <Box dir="row" gap={1} grow={1} justify="end" shrink={0}>{end}{endIcon !== undefined ? <Icon name={endIcon} size="sm" /> : null}</Box> : null}
      </Box>
      {line !== undefined ? <Text colour="ink" truncate>{line}</Text> : null}
      {note !== undefined ? <Box maxHeight={2} shrink={0} clip><Text colour="muted">{note}</Text></Box> : null}
      {mono ? <Text colour="muted" truncate>{mono}</Text> : null}
    </Box>
  );
}

/** The words a card is named by (the title, its tag, its line) and described by (the note, the mono line, here). */
function cardWords(p: Pick<Web.PickCardProps, 'title' | 'end' | 'line' | 'note' | 'meta' | 'here' | 'isDisabled' | 'disabledReason'>): { name: string; description?: string } {
  const text = (n: unknown) => (typeof n === 'string' || typeof n === 'number' ? String(n) : '');
  const name = [p.title, text(p.end), p.line].filter(Boolean).join(' ');
  const description = [p.note, p.meta, p.isDisabled && p.disabledReason ? p.disabledReason : p.here].filter(Boolean).join(' · ');
  return description ? { name, description } : { name };
}

export const PickCard: typeof Web.PickCard = ({ title, mark, end, endIcon, line, note, meta, here, isSelected, isDisabled, disabledReason, onPress, ref }) => {
  const row = useContext(PickCardRow);
  const handle = useRef<Focusable | null>(null);
  // The page's ref to the standalone card: focus() returns the focus to it (a drawer opened from the card).
  useImperativeHandle(row ? undefined : (ref as Ref<{ focus(): void }> | undefined), () => ({ focus: () => handle.current?.focus() }), []);
  const parts = { title, mark, end, endIcon, line, note, meta, here, isSelected, isDisabled, disabledReason };
  if (row) return <Body {...parts} focused={row.focusVisible} />;
  return (
    <Pressable dir="column" shrink={0} focusPaint={false} handle={handle} onPress={() => { if (!isDisabled) onPress?.(); }} sem={{ role: 'button', ...cardWords(parts), ...(isSelected ? { pressed: true } : {}), ...(isDisabled ? { disabled: true, ...(disabledReason ? { disabledReason } : {}) } : {}) }}>
      {({ focused }) => <Body {...parts} focused={focused} />}
    </Pressable>
  );
};
