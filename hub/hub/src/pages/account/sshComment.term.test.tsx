// Account > SSH keys: each key's comment is drawn under its key, whole. A table row was one
// line, so the comment (KeysSection's RowNote cut) was dropped behind a "…" and could not be read anywhere in the
// terminal; now the row takes the lines the comment needs, and a long comment wraps.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) test(`SSH keys at ${cols}x${rows}: every comment shows whole under its key`, async () => {
  s = await renderPage({ page: 'account', cols, rows, path: '/account?section=ssh' });
  const lines = (await s.settle()).split('\n');
  expect(s.failures).toEqual([]);
  const atlas = lines.findIndex((l) => /› atlas|\batlas\b.*AcctKey1/.test(l));
  expect(atlas).toBeGreaterThan(-1);
  expect(lines[atlas + 1]).toContain('ada@laptop');
  expect(lines.join('\n')).toContain('read-only)');
  expect(lines.join('\n')).not.toMatch(/AcctKey1…|Granite7…/);
}, 240_000);
