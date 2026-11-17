// The dock header's terminal frame: every control stays on screen in a narrow dock (the end group wraps, nothing is cut),
// and the Recent button opens its popover through CountWrap (the kit Popover hands its trigger the opener as onPress).
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../term/prim/testing';
import { Box, FocusRoot, Text } from '../term/prim';
import { Button } from '../kit/controls/Button';
import { Popover } from '../kit/overlays/Popover';
import { termHead } from './dockHead';

const { CountWrap, HeadEnd, HeadRow } = termHead!;

function Head() {
  const [open, setOpen] = useState(false);
  return (
    <HeadRow>
      <Button variant="ghost" size="sm">■ Personal · ✓ atlas (Running) ▾</Button>
      <HeadEnd>
        <Popover label="Recent conversations" title="Recent conversations" isOpen={open} onOpenChange={setOpen}
          trigger={<CountWrap count={2}><Button size="sm">Recent conversations</Button></CountWrap>}>
          <Text>Check ports</Text>
        </Popover>
        <Button size="sm">New conversation</Button>
        <Button size="sm">Close Agent</Button>
      </HeadEnd>
    </HeadRow>
  );
}

test('a narrow dock keeps every header control on screen, and Recent opens its list', async () => {
  const t = await drawTest(<FocusRoot><Box dir="column" width={49} height={20}><Head /></Box></FocusRoot>, { width: 49, height: 20 });
  let f = await t.settle();
  for (const w of ['Personal', '[Recent conversations]2', '[New conversation]', '[Close Agent]']) expect(f).toContain(w);
  expect(f.split('\n').every((r) => r.trimEnd().length <= 49)).toBe(true);
  const row = f.split('\n').findIndex((r) => r.includes('[Recent conversations]'));
  const col = f.split('\n')[row]!.indexOf('[Recent');
  await t.mockMouse.click(col + 2, row);
  f = await t.settle();
  expect(f).toContain('Check ports');
  t.renderer.destroy();
});
