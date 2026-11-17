// Drawer.term.tsx: `topNote` brings the body back to its top.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A note that appears at the body's top while the body is scrolled to its end is shown: the body goes to its top | 'appears' |
// | 2 | The same value again, and the value going back to null, move nothing | 'same value, null' |
//
// At 80x24 a checkout's Confirm is pressed with the body at its end; the notice of a refused send is put at the body's
// top, out of sight.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { Drawer } from './Drawer';

let setNote: (v: string | null) => void = () => {};
let bump: () => void = () => {};
function Case() {
  const [note, set] = useState<string | null>(null);
  const [, again] = useState(0);
  setNote = set;
  bump = () => again((n) => n + 1);
  return (
    <FocusRoot><OverlayHost>
      <Drawer isOpen onOpenChange={() => {}} title="A purchase" size="sm" resizeKey="test-top-note-term" topNote={note}>
        {note !== null && <Text>{`note: ${note}`}</Text>}
        <Text>first line</Text>
        <Button onPress={() => {}}>Only control</Button>
        {Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>)}
        <Text>last line</Text>
      </Drawer>
    </OverlayHost></FocusRoot>
  );
}

test('a note that appears while the body is at its end is shown: the body goes back to its top', async () => {
  const t = await drawTest(<Case />, { width: 80, height: 16 });
  expect(await t.settle()).toContain('first line');
  t.mockInput.pressKey('END');
  const end = await t.settle();
  expect(end).toContain('last line');
  expect(end).not.toContain('first line');
  setNote('the price changed');
  const shown = await t.settle();
  expect(shown).toContain('note: the price changed');
  expect(shown).toContain('first line');
  expect(shown).not.toContain('last line');
  t.renderer.destroy();
}, 60_000);

test('the same value again and the value going back to null move nothing', async () => {
  const t = await drawTest(<Case />, { width: 80, height: 16 });
  await t.settle();
  setNote('the price changed');
  await t.settle();
  t.mockInput.pressKey('END');
  expect(await t.settle()).toContain('last line');
  bump();
  expect(await t.settle()).toContain('last line');
  setNote(null);
  const cleared = await t.settle();
  expect(cleared).toContain('last line');
  expect(cleared).not.toContain('first line');
  // A later note is new again.
  setNote('it did not go through');
  expect(await t.settle()).toContain('note: it did not go through');
  t.renderer.destroy();
}, 60_000);
