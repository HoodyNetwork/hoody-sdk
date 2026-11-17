// clock.ts fixtureClock: every runner that draws fixture frames (render.ts renderPage: goldens, the render CLI, tests;
// dev.ts: shots via termshot) draws on ONE frozen instant, so relative times and day groups ("20 days ago",
// "Yesterday") never move with the real clock.
// This file never calls freezeClock itself: renderPage must.
import { afterAll, expect, test, setSystemTime } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

afterAll(() => { setSystemTime(); });

test('renderPage at two real times (days apart, across midnight) draws identical frames', async () => {
  const { renderPage } = await import('./render');
  const frame = async (real: string): Promise<string> => {
    setSystemTime(new Date(real));
    const s = await renderPage({ page: 'notifications', cols: 120, rows: 40 });
    try { return s.frame; } finally { s.close(); }
  };
  const a = await frame('2026-11-12T10:00:00Z');
  const b = await frame('2026-11-14T23:30:00Z');
  expect(a).toMatch(/\d+ days? ago|ago/);
  expect(b).toBe(a);
}, 120_000);

test('the frozen clock: Date.now, new Date(), the call form Date() and Intl all answer GOLDEN_NOW in UTC', async () => {
  const { GOLDEN_NOW, clockFrozen } = await import('./clock');
  const { renderPage } = await import('./render');
  const s = await renderPage({ page: 'notifications', cols: 80, rows: 24 });
  try {
    expect(clockFrozen()).toBe(true); // the open session holds it
    setSystemTime(new Date('2031-01-01T00:00:00Z'));
    expect(Date.now()).toBe(GOLDEN_NOW);
    expect(new Date().getTime()).toBe(GOLDEN_NOW);
    expect(new Date(5).getTime()).toBe(5);
    expect(String(Date())).toBe(new Date(GOLDEN_NOW).toString());
    expect(new Date() instanceof Date).toBe(true);
    expect(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())).toBe('11 Nov 2026, 09:00');
    expect(Date.UTC(2026, 0, 1)).toBe(1767225600000);
  } finally { s.close(); }
}, 60_000);

// Cross-file pollution: bun runs every test file in one process. A file that drew a page left Date.now()
// frozen and randomness seeded for every later file (boot.live/fence read 0 ms elapsed; seeded ids repeat). The last
// session's close gives the real clock and randomness back.
test('closing the last session gives the real clock, timezone and randomness back', async () => {
  const { GOLDEN_NOW, clockFrozen, holdFixtureClock } = await import('./clock');
  const { renderPage } = await import('./render');
  const tz = process.env.TZ;
  const other = holdFixtureClock(); // another holder (a goldens run) outlives the session
  try {
    const s = await renderPage({ page: 'notifications', cols: 80, rows: 24 });
    s.close();
    expect(Date.now()).toBe(GOLDEN_NOW);
  } finally { other(); }
  expect(clockFrozen()).toBe(false);
  setSystemTime(new Date('2031-01-01T00:00:00Z'));
  expect(Date.now()).toBe(Date.UTC(2031, 0, 1));
  setSystemTime();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 30));
  expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  expect(process.env.TZ).toBe(tz);
  expect(String(Math.random)).toContain('[native code]');
  expect(String(crypto.randomUUID)).toContain('[native code]');
  expect(String(crypto.getRandomValues)).toContain('[native code]');
}, 60_000);

test('dev.ts (the shots) freezes the clock before any Hub module loads, unless --real-clock', () => {
  const src = fs.readFileSync(path.join(import.meta.dir, 'dev.ts'), 'utf8');
  const call = src.indexOf("if (!process.argv.includes('--real-clock')) fixtureClock();");
  expect(call).toBeGreaterThan(0);
  expect(call).toBeLessThan(src.indexOf('await import(src('));
});
