// PlanCard lines wrap as the web's do (census cluster 3). The price (.price, flex-wrap): Referrals' "Where you stand"
// card showed "Fewer than 3 of 11 neede", its "per" cut at the border. A label | value row (.row flex-wrap, the value
// margin-inline-start: auto and text-align: end): a value that does not fit beside its label takes the next line at the
// right edge, and its own wrapped lines end at the right edge too; before, the value wrapped left-aligned beside the
// label and "write" of "Disk speed 400 MiB/s read, 200 MiB/s / write" stood in the middle of the card.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { PlanCard } from './PlanCard';

/** The inside lines of the card (between its side borders), right-trimmed only of the border. */
const inside = (f: string): string[] => f.split('\n').filter((l) => /^[│┃]/.test(l)).map((l) => l.slice(1, l.trimEnd().length - 1));

test('a long price amount and its "per" wrap onto two lines, both whole', async () => {
  const t = await drawTest(<PlanCard name="Where you stand" price={{ amount: 'Fewer than 3', per: 'of 11 needed' }} />, { width: 26, height: 8 });
  const lines = inside(await t.settle());
  expect(lines.join('\n')).toContain('Fewer than 3');
  expect(lines.join('\n')).toContain('of 11 needed');
});

test('a value too wide for its label line takes the next line at the right edge; a short one stays beside its label', async () => {
  const t = await drawTest(
    <PlanCard name="Small" rows={[{ id: 'mem', label: 'Memory', value: '4 GB' }, { id: 'disk', label: 'Disk speed', value: '400 MiB/s read, 200 MiB/s write' }]} />,
    { width: 30, height: 10 },
  );
  const lines = inside(await t.settle());
  const mem = lines.find((l) => l.includes('Memory'))!;
  expect(mem.trimEnd().endsWith('4 GB')).toBe(true);
  expect(mem.trimEnd().length).toBe(mem.length - 1); // ends one cell before the border (padding), at the right edge
  const label = lines.findIndex((l) => l.includes('Disk speed'));
  expect(lines[label]!.trim()).toBe('Disk speed');
  // The value's lines end at the right edge: its last word ("write") exactly; a line broken at a space may end one
  // cell short (the engine keeps the break space on a right-aligned line), never left-aligned.
  const value = lines.slice(label + 1).filter((l) => l.trim() !== '');
  expect(value.map((l) => l.trim()).join(' ')).toBe('400 MiB/s read, 200 MiB/s write');
  const edge = mem.trimEnd().length;
  expect(value.at(-1)!.trimEnd().length).toBe(edge);
  for (const l of value) expect(l.trimEnd().length).toBeGreaterThanOrEqual(edge - 1);
});
