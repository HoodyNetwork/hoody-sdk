// Esc on a drawer whose change is in flight closes nothing and says why, as the web drawer does.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Drawer } from './Drawer';
import strings from './strings.en.json';

const HINT = strings.busyHint;

function view(busy: boolean, onOpenChange: (o: boolean) => void) {
  return (
    <FocusRoot><OverlayHost>
      <Drawer isOpen busy={busy} onOpenChange={onOpenChange} title="A key" size="sm" resizeKey="test-esc-busy">
        <Text>body</Text>
      </Drawer>
    </OverlayHost></FocusRoot>
  );
}

test('Esc while busy keeps the drawer and shows the busy hint', async () => {
  const closes: boolean[] = [];
  const t = await drawTest(view(true, (o) => closes.push(o)), { width: 80, height: 16 });
  try {
    expect(await t.settle()).not.toContain(HINT);
    t.mockInput.pressEscape();
    const after = await t.settle();
    expect(closes).toEqual([]);
    expect(after).toContain('A key');
    expect(after).toContain(HINT);
  } finally { t.renderer.destroy(); }
});
