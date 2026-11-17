import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Ledger, ShortcutTable } from './Ledger';

test('Ledger: amounts at the end, a warn row marked, the total after a rule', async () => {
  const t = await drawTest(
    <Ledger label="Wallet" rows={[{ id: 'a', label: 'Balance', amount: '$12.00' }, { id: 'b', label: 'Short by', amount: '$6.80', tone: 'warn' }]} total={{ label: 'Total', amount: '$5.20' }} attach={{ text: 'Add funds to continue.' }} />,
    { width: 40, height: 7 },
  );
  const f = await t.settle();
  expect(f).toMatch(/Balance\s+\$12\.00/);
  expect(f).toMatch(/! Short by\s+\$6\.80/);
  expect(f).toMatch(/─+\nTotal\s+\$5\.20/);
  expect(f).toContain('! Add funds to continue.');
  t.renderer.destroy();
});

test('ShortcutTable lines up keys and words', async () => {
  const t = await drawTest(<ShortcutTable label="Keys" groups={[{ id: 'g', title: 'Lists', rows: [{ keys: ['j', 'k'], label: 'Move' }, { keys: ['g', 'h'], then: true, label: 'Home' }, { keys: [' '], label: 'Select' }] }]} />, { width: 40, height: 6 });
  const f = await t.settle();
  expect(f).toMatch(/\[j\] or \[k\]\s+Move/);
  expect(f).toMatch(/\[g\] then \[h\]\s+Home/);
  expect(f).toMatch(/\[Space\]\s+Select/);
  t.renderer.destroy();
});
