// A server's flag in a terminal is its country code (kit countryFlag's terminal side), never the regional-indicator
// emoji, which a terminal draws two cells wide, in colour or not at all. Home and Guide kept their own emoji maps and
// so drew the emoji; both now go through countryFlag.
import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

test('Guide: the facts rail names the server with its country code, no flag emoji', async () => {
  s = await renderPage({ page: 'guide', cols: 200, rows: 50 });
  const frame = await s.settle();
  expect(s.failures).toEqual([]);
  expect(frame).toContain('SG n12 Singapore');
  expect(INDICATOR.test(frame)).toBe(false);
}, 120_000);

// Home draws "Loading…" in a headless render today (its own open item), so its rows cannot be read from a frame: the
// page's data module must hold no emoji of its own (the flag comes from countryFlag, as Guide's does).
test('Home and Guide data hold no flag emoji of their own', () => {
  for (const f of ['../home/data.ts', 'data.ts']) {
    const src = fs.readFileSync(path.join(import.meta.dirname, f), 'utf8');
    expect({ f, emoji: INDICATOR.test(src) }).toEqual({ f, emoji: false });
    expect(src).toContain('countryFlag(');
  }
});
