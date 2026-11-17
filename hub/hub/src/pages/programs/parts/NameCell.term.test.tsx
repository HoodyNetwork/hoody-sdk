import { afterEach, expect, test } from 'bun:test';
import { Box } from '../../../term/prim';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { nameCell } from './NameCell';


let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('names start in one column on marked and unmarked rows (fixed mark gutter)', async () => {
  t = await drawTest(
    <Box dir="column">
      {nameCell({ attention: true, attentionLabel: 'Needs attention', name: 'worker' })}
      {nameCell({ attention: false, attentionLabel: 'Needs attention', name: 'api' })}
    </Box>,
    { width: 30, height: 2 },
  );
  const [a = '', b = ''] = (await t.settle()).split('\n');
  expect(a.indexOf('worker')).toBeGreaterThan(0);
  expect(a.indexOf('worker')).toBe(b.indexOf('api'));
});

test('a long name is cut at its end with one ellipsis', async () => {
  t = await drawTest(nameCell({ attention: false, attentionLabel: 'x', name: 'a-very-long-program-name-indeed' }), { width: 14, height: 1 });
  const f = (await t.settle()).split('\n')[0] ?? '';
  expect(f).toContain('a-very-long');
  expect(f).toContain('…');
  expect(f).not.toContain('indeed');
});
