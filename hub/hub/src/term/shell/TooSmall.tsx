// The "terminal too small" screen. Below MIN_COLS x MIN_ROWS the shell's frame is not squeezed into the window (the
// top bar's controls and the key line went off its edge): this full-screen layer says, centred, how large the terminal
// is and how large it must be. It is a Layer, so it takes every key, paste and click (nothing reaches the page or a
// layer under it), and the page stays mounted under it: what was typed, an open palette or drawer, and the focus are
// there again once the window is large enough. Only `q` (leave, the shell's own rule: not while the Hub is locked) and
// the overlay's global keys (Ctrl-C, Ctrl-Z) act here. A layer opened after it (the quit question `q` may ask) is drawn
// above it, so it can be read and answered. ShellFrame mounts it last: a layer opening in the same commit (the Ask
// sheet a shrink below 120 columns opens) is under it.
import { useLocked } from '@core/shell';
import { useStrings } from '@kit/strings';
import { Box, Text, useTerminalSize } from '../prim';
import { Layer } from '../prim/Overlay';
import { hubKey } from './hubKey';
import strings from './strings.en.json';

/** The smallest terminal the shell draws its frame in. */
export const MIN_COLS = 80;
export const MIN_ROWS = 24;

export function TooSmall({ onQuit }: { onQuit: () => void }) {
  const { width, height } = useTerminalSize();
  const locked = useLocked();
  const tt = useStrings(strings);
  const title = tt('small.title');
  return (
    <Layer
      open={width < MIN_COLS || height < MIN_ROWS}
      kind="modal"
      place={{ at: 'full' }}
      frame="none"
      padX={1}
      sem={{ role: 'alertdialog', name: title }}
      onKeyFirst={(raw) => {
        if (raw.eventType === 'release') return true;
        const k = hubKey(raw);
        if (k.key === 'q' && !k.ctrlKey && !k.altKey && !k.metaKey && !locked) onQuit();
        return true;
      }}
    >
      {/* Centred both ways, as the lock screen and the empty states are: top-left text on an empty screen reads as
          stray output. The last row stays free: the keymap's note ("Press Ctrl+C again to leave") is drawn there above
          every layer. The two spacers start at zero rows, so when the lines do not fit they shrink to nothing and the
          title stays on the first row (a centred column that overflows would cut its top line). */}
      <Box dir="column" height={Math.max(1, height - 1)} align="center">
        <Box grow={1} shrink={1} basis={0} />
        <Box dir="column" shrink={0} align="center">
          {/* Each line is centred on its own, so a line that wraps on a narrow screen keeps every row centred. */}
          <Text bold align="center">{title}</Text>
          <Text colour="muted" align="center">
            {tt('small.size', { cols: width, rows: height, minCols: MIN_COLS, minRows: MIN_ROWS })}
          </Text>
          {/* The line that says what to do takes the size line's colour: never fainter than it. */}
          <Text colour="muted" align="center">{tt(locked ? 'small.leaveLocked' : 'small.leave')}</Text>
        </Box>
        <Box grow={1} shrink={1} basis={0} />
      </Box>
    </Layer>
  );
}
