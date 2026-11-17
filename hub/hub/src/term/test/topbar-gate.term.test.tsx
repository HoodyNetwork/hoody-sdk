// The goldens' "row 0 is the top bar" rule reads the LAYOUT (prim/layoutcheck topBarFault), never the frame text: the
// shell's top bar box (SHELL_TOPBAR_ID) is in flow at row 0, the full terminal width, one row tall. A modal layer drawn
// over it (a full-screen drawer under 600 px, a 7-col strip at 80 cols) is an overlay above the bar, not a moved bar, so
// it passes whatever row 0 shows (never by page or case name).
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Text } from '../prim';
import { topBarFault } from '../prim/layoutcheck';
import { SHELL_TOPBAR_ID } from '../shell/TermShell';

const W = 40;
const H = 6;
const bar = (width: number | '100%' = '100%') => <Box height={1} width={width} shrink={0} raw={{ id: SHELL_TOPBAR_ID }}><Text>HOODY  Page</Text></Box>;
async function judge(node: React.ReactNode) {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: W, height: H });
  const f = topBarFault(t.renderer.root as never, { cols: W, rows: H });
  const frame = t.captureCharFrame();
  t.renderer.destroy();
  return { f, frame };
}

test('the bar at row 0, full width: no fault', async () => {
  expect((await judge(<Box dir="column" width="100%" height="100%">{bar()}<Text>page</Text></Box>)).f).toBeNull();
});
test('a full-screen modal layer over the bar: row 0 shows no HOODY, still no fault', async () => {
  const r = await judge(
    <Box dir="column" width="100%" height="100%">
      {bar()}
      <Text>page</Text>
      <Box absolute={{ top: 0, left: 0 }} width={W} height={H} bg="card"><Text>Drawer title</Text></Box>
    </Box>,
  );
  expect(r.frame.split('\n')[0]).not.toContain('HOODY');
  expect(r.f).toBeNull();
});
test('no bar, a bar pushed down, a bar narrower than the terminal: each a fault', async () => {
  expect((await judge(<Box dir="column" width="100%" height="100%"><Text>HOODY lookalike</Text></Box>)).f).toContain('no top bar');
  expect((await judge(<Box dir="column" width="100%" height="100%"><Text>above</Text>{bar()}</Box>)).f).toContain('at 0,1');
  expect((await judge(<Box dir="column" width="100%" height="100%">{bar(30)}</Box>)).f).toContain('30x1');
});
test('the shell names its bar with the id the check looks for', async () => {
  const { TOP_BAR_ID } = await import('../prim/layoutcheck');
  expect(SHELL_TOPBAR_ID).toBe(TOP_BAR_ID);
});
