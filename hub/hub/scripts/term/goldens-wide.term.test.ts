// Bigger terminals in the page gate (bigger sizes must be covered by the gates, not only by looking at them):
// a page's default state and main states (`wide`) are also drawn at WIDE_SIZE (200x50, stored like 80x24 and
// 120x40) and at LAYOUT_SIZE (240x67: the layout and table gates judge it, no frame is stored).
import { afterAll, expect, test } from 'bun:test';
afterAll(async () => { (await import('./clock')).thawClock(); });
import fs from 'node:fs';
import path from 'node:path';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `goldens-wide-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('wide cases: the default state and the dense list states (many, long); never a loading state', async () => {
  const { casesOf, sizesOf, WIDE_SIZE, LAYOUT_SIZE, SIZES } = await import('./goldens');
  const cases = (await casesOf('apps')).filter((c) => !c.steps);
  const want = cases.filter((c, i) => !c.loading && (i === 0 || c.name === 'many' || c.name === 'long')).map((c) => c.name);
  expect(cases.filter((c) => c.wide).map((c) => c.name)).toEqual(want);
  expect(want).toContain('long');
  for (const c of cases) if (c.loading) expect(c.wide).toBeUndefined();
  expect(sizesOf({ wide: true })).toEqual([...SIZES, WIDE_SIZE, LAYOUT_SIZE]);
  expect(sizesOf({})).toEqual(SIZES);
});

test('a wide case stores 80x24, 120x40 and 200x50 frames, is drawn at 240x67 without a stored frame; others store two', async () => {
  const { runPageGoldens, casesOf } = await import('./goldens');
  const { renderPage } = await import('./render');
  const dir = path.join(TMP, 'api');
  fs.mkdirSync(dir, { recursive: true });
  const drawn: string[] = [];
  const render: Parameters<typeof runPageGoldens>[1]['render'] = async (o) => { drawn.push(`${o.fx ?? 'default'}@${o.cols}x${o.rows}`); return renderPage(o); };
  await runPageGoldens('api', { update: true, strict: false, render, dir });
  const cases = (await casesOf('api')).filter((c) => !c.steps);
  const key = (c: { fx: string | null }): string => c.fx ?? 'default';
  const first = cases[0]!;
  expect(first.wide).toBe(true);
  expect(drawn).toEqual(expect.arrayContaining([`${key(first)}@200x50`, `${key(first)}@240x67`]));
  const files = fs.readdirSync(dir);
  expect(files).toContain(`${first.name}.200x50.txt`);
  expect(files.filter((f) => f.endsWith('.240x67.txt'))).toEqual([]);
  const narrow = cases.find((c) => !c.wide && !c.loading);
  if (narrow) {
    expect(files.filter((f) => f.startsWith(`${narrow.name}.`) && f.endsWith('.txt')).sort()).toEqual([`${narrow.name}.120x40.txt`, `${narrow.name}.80x24.txt`]);
    expect(drawn.filter((d) => d.startsWith(`${key(narrow)}@`)).every((d) => /@(80x24|120x40)$/.test(d))).toBe(true);
  }
}, 300_000);
