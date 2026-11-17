// Bun (terminal): the Vault list keeps its columns on a common terminal. Encrypted and Kind are sized to their words
// (size 'fit'), not 150 px each, so at 120x40 every column shows (Size included) and at 80x24 only Size, the lowest
// priority, gives way.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const headRow = (frame: string): string => frame.split('\n').find((l) => l.includes(strings['col.name'])) ?? '';

test('120x40: Name, Encrypted, Kind, Size and Updated all show', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault' });
  const head = headRow(await s.settle());
  for (const k of ['col.name', 'col.lock', 'col.kind', 'col.size', 'col.updated'] as const) expect(head).toContain(strings[k]);
  expect(s.failures).toEqual([]);
}, 120_000);

test('80x24: Kind stays; only Size gives way', async () => {
  s = await renderPage({ page: 'vault', cols: 80, rows: 24, path: '/vault' });
  const head = headRow(await s.settle());
  for (const k of ['col.name', 'col.lock', 'col.kind', 'col.updated'] as const) expect(head).toContain(strings[k]);
  expect(head).not.toContain(strings['col.size']);
  expect(s.failures).toEqual([]);
}, 120_000);

// The Encrypted column fits its longest state word as the terminal pill draws it (its mark, a space, the words): a
// plain entry reads "· Not marked" whole, never cut to "· Not…", at both common sizes, with the other columns kept.
for (const [cols, rows, keep] of [[120, 40, ['col.name', 'col.lock', 'col.kind', 'col.size', 'col.updated']], [80, 24, ['col.name', 'col.lock', 'col.kind', 'col.updated']]] as const) {
  test(`${cols}x${rows}: every state word in Encrypted shows whole`, async () => {
    s = await renderPage({ page: 'vault', cols, rows, path: '/vault' });
    const frame = await s.settle();
    expect(frame).toContain(`· ${strings['lock.no']}`);
    expect(frame).toContain(`✓ ${strings['lock.yes']}`);
    expect(frame).not.toMatch(/· Not…/);
    const head = headRow(frame);
    for (const k of keep) expect(head).toContain(strings[k]);
  }, 120_000);
}
