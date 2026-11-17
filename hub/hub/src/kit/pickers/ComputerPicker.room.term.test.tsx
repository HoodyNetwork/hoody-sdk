// A computer picker in a toolbar row gives way first (the web's Files bar: `.bar > .picker { flex: 0 100 auto }`): when
// the row is short its name cuts with "…", and the controls after it stay whole. For example: the Files bar at 80x24 cut
// its More button to "[⋯" while the picker kept all 27 cells. A Popover whose
// trigger cannot shrink (a button) keeps it whole.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, PaneSize, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ShellDataProvider } from '../../shell/context';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import { Popover } from '../overlays/Popover';
import { Button } from '../controls/Button';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const COMPUTERS: ComputerChoice[] = [
  { id: 'a', name: 'atlas-long-computer-name', running: true, state: 'Running', stateKind: 'running', color: '#3092ff', realm: { name: 'Personal', color: 'blue' } },
];

const draw = async (node: React.ReactNode, w: number) => {
  t = await drawTest(
    <FocusRoot><OverlayHost><PaneSize>
      <ShellDataProvider value={{ realms: [], realmId: undefined, computers: [] } as never}>{node}</ShellDataProvider>
    </PaneSize></OverlayHost></FocusRoot>,
    { width: w, height: 4 },
  );
  await t.settle();
  return await t.settle();
};

test('the picker gives way in a short row: its name cuts with "…", the control after it stays whole', async () => {
  const line = await draw(
    <Box dir="row" gap={1} width={40}>
      <Box shrink={0}><Text>[Up]</Text></Box>
      <ComputerPicker label="Computer" computers={COMPUTERS} value="a" onChange={() => {}} />
      <Box shrink={0}><Text>[⋯]</Text></Box>
    </Box>,
    50,
  );
  expect(line).toContain('[Up]');
  expect(line).toContain('[⋯]');
  expect(line).toContain('…');
  expect(line).toContain('▾');
});

test('with room the picker shows its whole name', async () => {
  const line = await draw(
    <Box dir="row" gap={1}>
      <Box shrink={0}><Text>[Up]</Text></Box>
      <ComputerPicker label="Computer" computers={COMPUTERS} value="a" onChange={() => {}} />
      <Box shrink={0}><Text>[⋯]</Text></Box>
    </Box>,
    100,
  );
  expect(line).toContain('atlas-long-computer-name');
  expect(line).toContain('[⋯]');
});

test('a Popover whose trigger is a button keeps the button whole in a short row', async () => {
  const line = await draw(
    <Box dir="row" gap={1} width={20}>
      <Box grow={1} shrink={1}><Text truncate>a very long title that gives way</Text></Box>
      <Popover label="More" trigger={<Button>Options</Button>}><Text>x</Text></Popover>
    </Box>,
    30,
  );
  expect(line).toContain('[Options]');
});
