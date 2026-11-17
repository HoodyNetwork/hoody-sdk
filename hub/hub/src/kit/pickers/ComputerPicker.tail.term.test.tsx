// The picker trigger in a row too short for it: nothing of it is cut mid-word. Seen in the terminal (the
// Files bar at 80x24): the trigger got 14 cells and drew "│ ● SG  · █ Per", the name gone, the realm cut without "…"
// and no ▾. The web's order (ComputerPicker.module.css): the name gives way first, down to 4ch, then the realm. Here the
// tail (the realm chip) then goes whole and the name takes the room back; lead and ▾ always stay.
import { useState } from 'react';
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, PaneSize, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ShellDataProvider } from '../../shell/context';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const pc = (name: string): ComputerChoice[] => [{ id: 'a', name, running: true, state: 'Running', stateKind: 'running', flag: 'SG', realm: { name: 'Personal', color: 'blue' } }];

let setWidth: (w: number) => void = () => {};
function Bar({ name, width }: { name: string; width: number }) {
  const [w, set] = useState(width);
  setWidth = set;
  return (
    <Box dir="row" gap={1} width={w}>
      <Box shrink={0}><Text>[Up]</Text></Box>
      <ComputerPicker label="Computer" computers={pc(name)} value="a" onChange={() => {}} />
      <Box shrink={0}><Text>/ › srv › app</Text></Box>
      <Box shrink={0}><Text>[⋯]</Text></Box>
    </Box>
  );
}

const draw = async (name: string, width: number) => {
  t = await drawTest(
    <FocusRoot><OverlayHost><PaneSize>
      <ShellDataProvider value={{ realms: [], realmId: undefined, computers: [] } as never}><Bar name={name} width={width} /></ShellDataProvider>
    </PaneSize></OverlayHost></FocusRoot>,
    { width: 100, height: 3 },
  );
  await t.settle();
  return (await t.settle()).split('\n')[0]!.trimEnd();
};

// [Up] + gap + picker + gap + crumbs (13) + gap + [⋯] : the picker's room is the width less 23.
test('with room: name, · realm and ▾', async () => {
  const line = await draw('atlas', 80);
  expect(line).toMatch(/^\[Up\] │ ● .*atlas · .*Personal ▾ \/ › srv › app \[⋯\]$/);
});

test('14 cells (the Files bar at 80 columns): the whole name and ▾, no half realm', async () => {
  const line = await draw('atlas', 37);
  expect(line).toMatch(/^\[Up\] │ ● .*atlas ▾ \/ › srv › app \[⋯\]$/);
  expect(line).not.toContain('·');
  expect(line).not.toContain('Per');
});

test('a long name gives way first: it cuts with "…" while the realm stays', async () => {
  const line = await draw('atlas-long-computer-name', 37 + 14);
  expect(line).toMatch(/atlas.*… · .*Personal ▾ \/ › srv › app \[⋯\]$/);
});

test('a long name with no room for the realm: the name takes the room, cut with "…"', async () => {
  const line = await draw('atlas-long-computer-name', 37);
  expect(line).toMatch(/^\[Up\] │ ● .*atla… ▾ \/ › srv › app \[⋯\]$/);
  expect(line).not.toContain('·');
});

test('the realm comes back when the row has room again', async () => {
  await draw('atlas', 37);
  setWidth(80);
  await t!.settle();
  const line = (await t!.settle()).split('\n')[0]!.trimEnd();
  expect(line).toMatch(/atlas · .*Personal ▾ \/ › srv › app \[⋯\]$/);
});
