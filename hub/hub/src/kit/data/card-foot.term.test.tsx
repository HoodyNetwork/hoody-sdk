// Cards drawn as rows keep their footer (columns marked card: 'foot'): a Servers card shows its AI use and Wallet &
// usage shows each server's lanes. Each lane is one line, its whole name, then its meter and percent (or its words).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const laneLine = (lines: string[], name: string): string => {
  const l = lines.find((x) => new RegExp(`\\b${name}\\s+\\S`).test(x));
  expect(l, `no lane line for ${name}`).toBeDefined();
  return l!;
};

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: a Servers card shows its AI use, one line per lane`, async () => {
    s = await renderPage({ page: 'computers', path: '/computers/servers', cols, rows });
    const lines = (await s.settle()).split('\n');
    expect(lines.some((l) => l.includes('AI USE'))).toBe(true);
    expect(laneLine(lines, 'Chat')).toMatch(/Chat\s+[█░]+ 40%/);
    expect(laneLine(lines, 'Quick decisions')).toMatch(/Quick decisions\s+[█░]+ 0%/);
    expect(lines.join('\n')).not.toMatch(/Chat\d|decisions\d|SpeechNot/);
  }, 240_000);
}

test('120x60: Wallet & usage: each lane name is whole on its line ("Quick decisions" never wraps)', async () => {
  s = await renderPage({ page: 'billing', fx: 'bonus-claimed', path: '/billing?view=wallet', cols: 120, rows: 60 });
  const lines = (await s.settle()).split('\n');
  expect(laneLine(lines, 'Quick decisions')).toMatch(/Quick decisions\s+[█░]+ 10%/);
  expect(lines.some((l) => l.replace(/^.*│/, '').trim() === 'decisions')).toBe(false);
}, 240_000);
