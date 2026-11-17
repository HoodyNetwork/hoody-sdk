// An ActionMenu's own trigger follows the web's `icon` (an IconButton showing it, default the "more" dots). The
// terminal drew "[⋯]" whatever the icon, so two menus side by side could not be told apart: the composer's Add files
// (plus) and More ways to send (chevron-down) both read "[⋯]", as did the file chooser's Places and View options. A
// mark that reads on its own (more, add, a split button's arrow) draws as itself; any other icon shows the label, as a
// terminal IconButton does.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ActionMenu, type MenuList } from './Menu';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

const items = (log: string[]): MenuList => [{ id: 'one', label: 'Pick me', onAction: () => log.push('one') }];

test('each trigger shows its icon\'s mark, else its label', async () => {
  term = await drawTest(
    <FocusRoot><OverlayHost>
      <Box dir="row" gap={1}>
        <ActionMenu items={items([])} label="Row actions" />
        <ActionMenu items={items([])} label="Add files" icon="plus" />
        <ActionMenu items={items([])} label="More ways to send" icon="chevron-down" />
        <ActionMenu items={items([])} label="View options" icon="sliders" />
      </Box>
    </OverlayHost></FocusRoot>,
    { width: 60, height: 8 },
  );
  const first = (await term.settle()).split('\n')[0]!;
  expect(first.trimEnd()).toBe('[⋯] [+] [▾] [View options]');
}, 60_000);

test('a labelled trigger still opens its menu from the keyboard', async () => {
  const log: string[] = [];
  term = await drawTest(
    <FocusRoot><OverlayHost>
      <Pressable autoFocus onPress={() => {}}>{() => <Text>[Page]</Text>}</Pressable>
      <ActionMenu items={items(log)} label="Places" icon="home" placement="bottom start" />
    </OverlayHost></FocusRoot>,
    { width: 40, height: 8 },
  );
  expect(await term.settle()).toContain('[Places]');
  term.mockInput.pressTab();
  await term.settle();
  term.mockInput.pressEnter();
  expect(await term.settle()).toContain('Pick me');
  term.mockInput.pressEnter();
  await term.settle();
  expect(log).toEqual(['one']);
}, 60_000);
