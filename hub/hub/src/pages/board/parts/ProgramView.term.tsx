// One program (or port, or script) alone in the terminal: the web view is a live browser frame, so this names what the
// address opens and hands off to the web view with the same address. Add to Board stays on the web with the view.
// The address carries the view only for a listed computer's program or port (viewTravels); otherwise it opens the
// Board, and the hand-off says "the Board", never "the program".
import { CanvasPage, Handoff, useShellData, useStrings } from '@kit';
import type * as Web from './ProgramView';
import { Box, Text } from '@term/prim';
import { programViewTitle, viewTravels } from './programViewTitle';
import { useT } from './text';
import strings from './boardTerm.strings.en.json';

export const ProgramView: typeof Web.ProgramView = ({ target }) => {
  const t = useT();
  const s = useStrings(strings);
  const known = useShellData().computers;
  // The computer only from the shell's list (never the route's text); the script route is never echoed.
  const title = programViewTitle(target, t, s, known);
  // CanvasPage draws no heading in the terminal (the canvas is the page): the view names itself above the hand-off.
  return (
    <CanvasPage title={title}>
      <Box dir="column" gap={1} shrink={0} padX={1}>
        <Text bold>{title}</Text>
        <Handoff reason={s('term.view.reason')} what={viewTravels(target, known) ? s('term.view.what') : s('term.what')} />
      </Box>
    </CanvasPage>
  );
};
