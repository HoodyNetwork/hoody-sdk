// DetailHeader's meta in the terminal keeps the web's gap between its pieces (.detailMeta gap: --sp-2 = one cell): two
// controls side by side never touch ("Auto-approve is off+2" on Bots), nor two chips.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DetailHeader } from './ListDetailPage';
import { TextButton } from '../controls/Link';

test('two meta controls are one cell apart', async () => {
  const t = await drawTest(<FocusRoot><DetailHeader title="Chief" meta={<><TextButton onPress={() => {}}>Auto-approve is off</TextButton><TextButton onPress={() => {}}>+2</TextButton></>} /></FocusRoot>, { width: 80, height: 8 });
  const f = await t.settle();
  t.renderer.destroy();
  expect(f).toContain('Auto-approve is off +2');
  expect(f).not.toContain('off+2');
});
