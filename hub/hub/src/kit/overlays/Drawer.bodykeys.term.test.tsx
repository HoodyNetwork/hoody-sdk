// Drawer.term.tsx: the body scrolls on the Page keys.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Text below the last control of a body taller than the screen is reached with PageDown / End, and Home goes back | 'page keys' |
//
// At 80x24 a free server's panel ends with a section of plain text ("Renewal and billing") under its last
// link. The body moved only with the focus, so that text could not be brought on screen.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { Drawer } from './Drawer';

test('page keys scroll a body taller than the screen: End shows its last line, Home its first', async () => {
  const t = await drawTest(
    <FocusRoot><OverlayHost>
      <Drawer isOpen onOpenChange={() => {}} title="A server" size="sm" resizeKey="test-body-keys">
        <Text>first line</Text>
        <Button onPress={() => {}}>Only control</Button>
        {Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Text>last line</Text>
      </Drawer>
    </OverlayHost></FocusRoot>,
    { width: 80, height: 16 },
  );
  const open = await t.settle();
  expect(open).toContain('first line');
  expect(open).not.toContain('last line');
  t.mockInput.pressKey('\x1b[6~' as never); // PageDown: mockInput has no name for it
  const paged = await t.settle();
  expect(paged).not.toContain('first line');
  expect(paged).toContain('A server'); // the head stays
  t.mockInput.pressKey('END');
  const end = await t.settle();
  expect(end).toContain('last line');
  t.mockInput.pressKey('HOME');
  expect(await t.settle()).toContain('first line');
  t.renderer.destroy();
}, 60_000);
