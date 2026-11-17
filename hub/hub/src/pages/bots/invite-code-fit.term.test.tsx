// A secret field under a step's text (People: the issued invite code) is never wider than the step's text column: at
// 80x24 its masked line wraps inside the card ("(Hidden until you" / "press Show)") instead of running one cell under
// the card's border ("…you pres│").
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const at = (f: string[], t: string): [number, number] => {
  const y = f.findIndex((l) => l.includes(t));
  expect(y, `"${t}" on screen`).toBeGreaterThan(-1);
  return [f[y]!.indexOf(t) + 1, y];
};

test('80x24: the issued invite code wraps inside its step', async () => {
  s = await renderPage({ page: 'bots', fx: 'channelPairing', cols: 80, rows: 24, path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=apps&app=ch-tg' });
  let f = (await s.settle()).split('\n');
  await s.click(...at(f, 'People'));
  f = (await s.settle()).split('\n');
  for (let i = 0; i < 2; i++) { await s.keys.press('pagedown'); f = (await s.settle()).split('\n'); }
  await s.click(...at(f, 'Create invite code'));
  f = (await s.settle()).split('\n');
  const masked = f.findIndex((l) => l.includes('Hidden until you'));
  expect(masked).toBeGreaterThan(-1);
  // The words of the masked line are all on screen inside the card: nothing is cut under its right border.
  const line = f[masked]!;
  const right = line.lastIndexOf('│');
  const left = line.lastIndexOf('│', line.indexOf('•') - 3);
  const inCard = (l: string): string => l.slice(left + 1, right);
  const words = `${inCard(line)} ${inCard(f[masked + 1]!)}`.replace(/[│ ]+/g, ' ');
  expect(words).toContain('(Hidden until you press Show)');
}, 180_000);
