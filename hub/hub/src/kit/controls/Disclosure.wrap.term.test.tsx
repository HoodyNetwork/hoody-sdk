// A Disclosure header whose title and description do not fit on one line: the description goes under the title and
// wraps, whole (on the web it is its own wrapping line). One line when both fit.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { Disclosure } from './Disclosure';

const draw = async (width: number): Promise<string[]> => {
  const t = await drawTest(
    <FocusRoot>
      <Disclosure title="Limit what this program can do" description="The same choices as the program's Sandbox panel.">body</Disclosure>
    </FocusRoot>,
    { width, height: 6 },
  );
  const rows = t.captureCharFrame().split('\n').map((l) => l.trimEnd());
  t.renderer.destroy();
  return rows;
};

test('fits: one line, "▸ Title  description"', async () => {
  const rows = await draw(100);
  expect(rows[0]).toBe("▸ Limit what this program can do  The same choices as the program's Sandbox panel.");
});

test('does not fit: the description is whole, under the title, nothing cut', async () => {
  const rows = await draw(58);
  expect(rows[0]).toBe('▸ Limit what this program can do');
  expect(rows[1]).toBe("  The same choices as the program's Sandbox panel.");
  expect(rows.join('\n')).not.toContain('…');
});

test('narrower than the description: it wraps under the title', async () => {
  const rows = await draw(34);
  expect(rows[0]).toBe('▸ Limit what this program can do');
  expect(rows.slice(1, 3).join(' ').replace(/\s+/g, ' ').trim()).toBe("The same choices as the program's Sandbox panel.");
});
