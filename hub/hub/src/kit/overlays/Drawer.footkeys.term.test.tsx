// Drawer.term.tsx, a page's own footer: its items are keyed.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A footer that is one element (a kit control, as schedules' FormFooter or account's Done button) draws with no React "unique key" warning | 'one element' |
//
// Own file on purpose: React warns about a keyless list under one host type once per process, so an earlier render in
// the same file would hide it.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Button } from '../controls/Button';
import { Drawer } from './Drawer';

test('one element as the footer: drawn, and React reports no list without keys', async () => {
  const said: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => { said.push(a.map(String).join(' ')); };
  try {
    const t = await drawTest(
      <FocusRoot><OverlayHost>
        <Drawer isOpen onOpenChange={() => {}} title="Two-step sign-in" size="sm" resizeKey="test-foot-keys" footer={<Button variant="primary" onPress={() => {}}>Done</Button>}>
          <Text>Body</Text>
        </Drawer>
      </OverlayHost></FocusRoot>,
      { width: 120, height: 30 },
    );
    const f = await t.settle();
    expect(f).toContain('Done');
    t.renderer.destroy();
  } finally {
    console.error = real;
  }
  expect(said.filter((m) => m.includes('unique "key"'))).toEqual([]);
});
