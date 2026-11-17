// Playwright: the field widths measured in a real layout engine, on the kit's own CSS (tokens.css and
// fields.module.css with their source class names), so no page has to render the props yet. A full field beside a
// fixed one leaves the fixed one its size and takes the rest; on a phone row too narrow for both, the full field gives
// way first, down to the xs width; a wrapping row puts it on its own line; a column never stretches it.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Run from the API tree or from hub (Playwright's cwd), as the other kit specs that read sources.
const KIT = [resolve('hub/src/kit'), resolve('src/kit')].find((d) => existsSync(join(d, 'tokens.css'))) ?? resolve('hub/src/kit');
const CSS = ['tokens.css', 'forms/fields.module.css'].map((f) => readFileSync(join(KIT, f), 'utf8')).join('\n');

/** A field root as the kit draws it: the field class, a width class, and a 30 px tall input stand-in. */
const field = (id: string, width: string) => `<div id="${id}" class="field w_${width}"><div style="block-size: 30px"></div></div>`;

async function mount(page: Page, row: string, items: string) {
  await page.setContent(`<!doctype html><html><head><style>${CSS}\nbody { margin: 0; }</style></head><body><div id="row" style="${row}">${items}</div></body></html>`);
}

const box = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });

const ROW = 'display: flex; inline-size: 600px; gap: 0';

test('a 600 px row: sm beside full is 240 + 360', async ({ page }) => {
  await mount(page, ROW, field('a', 'sm') + field('b', 'full'));
  expect([(await box(page, 'a')).w, (await box(page, 'b')).w]).toEqual([240, 360]);
});

test('a 600 px row: a 100 px button beside full is 100 + 500', async ({ page }) => {
  await mount(page, ROW, `<button id="a" style="inline-size: 100px; flex: none">Go</button>` + field('b', 'full'));
  expect([(await box(page, 'a')).w, (await box(page, 'b')).w]).toEqual([100, 500]);
});

test('a 358 px phone row: full gives way first, down to the xs width (128), then sm shrinks: 230 + 128', async ({ page }) => {
  await mount(page, 'display: flex; inline-size: 358px; gap: 0', field('a', 'sm') + field('b', 'full'));
  expect([(await box(page, 'a')).w, (await box(page, 'b')).w]).toEqual([230, 128]);
});

test('a phone row narrower than xs: full is capped by the line, never wider than the row', async ({ page }) => {
  await mount(page, 'display: flex; inline-size: 100px; gap: 0', field('b', 'full'));
  expect((await box(page, 'b')).w).toBe(100);
});

test('a wrapping row: full goes to its own line at the row width', async ({ page }) => {
  await mount(page, `${ROW}; flex-wrap: wrap`, field('a', 'sm') + field('b', 'full'));
  const [a, b] = [await box(page, 'a'), await box(page, 'b')];
  expect(a.w).toBe(240);
  expect(b.w).toBe(600);
  expect(b.top).toBeGreaterThan(a.top);
});

test('a tall column: full and a fixed width keep their content height', async ({ page }) => {
  await mount(page, 'display: flex; flex-direction: column; inline-size: 600px; block-size: 400px', field('a', 'md') + field('b', 'full'));
  const [a, b] = [await box(page, 'a'), await box(page, 'b')];
  expect([a.h, b.h]).toEqual([30, 30]);
  expect([a.w, b.w]).toEqual([360, 600]);
});

test('a fixed width never passes its container: lg in a 300 px row is 300', async ({ page }) => {
  await mount(page, 'display: flex; inline-size: 300px; gap: 0', field('a', 'lg'));
  expect((await box(page, 'a')).w).toBe(300);
});
