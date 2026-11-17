// The Board in the terminal: tiles are live browser frames, so they cannot be drawn here, and Boards are saved in each
// web browser (data.ts: hub_boards_v1 through accountPref), which a terminal never holds: there is no Board here to
// list. The view says so and hands off to the web Board with the current address, so an Add link (?add=…) is taken
// there, never dropped here: this view does not call useAddLinks.
import { Handoff, useStrings } from '@kit';
import type * as Web from './BoardView';
import { Box, Text } from '@term/prim';
import strings from './boardTerm.strings.en.json';

export { ADD_WAIT_MS, TAKEN_KEEP, useAddLinks } from './addLinks';

export const BoardView: typeof Web.BoardView = () => {
  const s = useStrings(strings);
  return (
    // One cell of margin on each side, as every page with a header has: the web Board is full-bleed, this view is not.
    <Box dir="column" gap={1} shrink={0} padX={1}>
      <Handoff reason={s('term.reason')} what={s('term.what')} />
      <Text colour="muted">{s('term.local')}</Text>
    </Box>
  );
};
