// ListItemButton in the terminal (the web's ListItemButton.tsx): the kit Button's row look, [Words]. A terminal line has
// no leading box and no muted end, so the button's words are the row's whole name as a reader hears it on the web: the
// label, then " · " and the facts when there are any (ListItemButton.scenario.ts pins both to the same name). The mark
// is decoration on the web and is not drawn here.
import type * as Web from './ListItemButton';
import { Button } from './Button';

export type { ListItemButtonProps } from './ListItemButton';

/** Between the name and the facts, as the web row's hidden separator reads. */
const SEPARATOR = ' · ';

export const ListItemButton: typeof Web.ListItemButton = ({ children, meta, id, isDisabled, onPress }) => (
  <Button variant="row" size="sm" id={id} isDisabled={isDisabled} onPress={onPress ? () => onPress() : undefined}>
    {meta === undefined ? children : children + SEPARATOR + meta}
  </Button>
);
