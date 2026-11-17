// Facts layout="spec": a value as long as the row never touches its label: two cells between them, and the label keeps
// its words whole (the web's fit-content label column and the grid's gap).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { Facts } from './Display';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('40 cells: "Delivery" and a long value keep two cells between them, label whole', async () => {
  t = await drawTest(
    <FocusRoot><Facts layout="spec" columns={1} items={[{ label: 'Delivery', value: 'Instant delivery after the payment clears' }]} /></FocusRoot>,
    { width: 40, height: 8 },
  );
  const f = await t.settle();
  const line = f.split('\n').find((l) => l.includes('Deliver'))!;
  expect(line).toMatch(/Delivery {2,}\S/);
});
