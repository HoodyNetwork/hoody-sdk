// Playwright: the ComputerPicker as drawn. On a wide screen the popover is up to 640px and never past the screen,
// and each row is one line: the name, then the place (and realm) at the line's end, inside the row. On a phone the
// sheet holds every row with nothing past its edge (the aside wraps under the name). The Files page under All realms
// lists every fixture computer: realm headings, stopped rows and the folded "Not running" group. The gallery's
// long-realm sample (/_kit?tab=pieces) adds a long name and a long realm: wrapped, never past either edge.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, hubUrl, noSideScroll } from '@app/e2e';
import files from '../../pages/files/strings.en.json';
import gallery from '../gallery/computerPicker.strings.en.json';
import strings from './ComputerPicker.strings.en.json';

async function openPicker(page: Page, width: number, height: number) {
  // All realms (the fixtures' fxrealm=all), so the list holds more than one realm; then the size under test.
  await page.setViewportSize({ width, height });
  await page.goto(hubUrl('/files').replace('/?', '/?fxrealm=all&'));
  await page.locator('#hub-main').waitFor();
  await page.getByRole('button', { name: new RegExp(`${files['pick.label'].replace('{{pane}}', files['pane.a'])}$`) }).click();
  const dlg = page.getByRole('dialog').last();
  await dlg.getByRole('searchbox').waitFor();
  const fold = dlg.getByRole('button', { name: new RegExp(strings.notRunning) });
  if (await fold.getAttribute('aria-expanded') === 'false') await fold.click();
  await page.waitForTimeout(300);
  expect(await dlg.getByRole('group').count(), 'All realms: two realm groups and Not running').toBeGreaterThan(2);
  return dlg;
}

/** The box holds still (three reads in a row agree): a sheet slides in, so a read before this measures it mid-way. Motion
    stays on, so the page under test is the real one. */
async function holdsStill(el: Locator) {
  let was = '';
  let same = 0;
  await expect
    .poll(async () => { const b = JSON.stringify(await el.boundingBox()); same = b === was && b !== 'null' ? same + 1 : 0; was = b; return same; }, { timeout: 15_000, intervals: [100] })
    .toBeGreaterThanOrEqual(2);
}

const rowsOf = (dlg: ReturnType<Page['getByRole']>) =>
  dlg.evaluate((d) =>
    Array.from(d.querySelectorAll<HTMLElement>('[role="radio"]')).map((r) => {
      const box = r.getBoundingClientRect();
      const label = r.querySelector<HTMLElement>('[class*="__label_"]')!.getBoundingClientRect();
      const aside = r.querySelector<HTMLElement>('[class*="__aside_"]')!.getBoundingClientRect();
      return { name: r.textContent, row: { left: box.left, right: box.right }, label: { top: label.top, left: label.left, right: label.right, bottom: label.bottom }, aside: { top: aside.top, left: aside.left, right: aside.right } };
    }),
  );

test('@pickerlayout wide: up to 640px, one line per row with the place at its end (1400x900)', async ({ page }) => {
  const dlg = await openPicker(page, 1400, 900);
  const pop = await dlg.evaluate((d) => { const p = (d.closest('[data-placement]') ?? d).getBoundingClientRect(); return { width: p.width, right: p.right, vw: window.innerWidth }; });
  expect(pop.width, 'wide popover').toBeGreaterThan(600);
  expect(pop.width).toBeLessThanOrEqual(640);
  expect(pop.right).toBeLessThanOrEqual(pop.vw);
  const rows = await rowsOf(dlg);
  expect(rows.length).toBeGreaterThan(5);
  for (const r of rows) {
    expect(Math.abs(r.aside.top - r.label.top), `${r.name}: the aside is on the name's line`).toBeLessThanOrEqual(4);
    expect(r.aside.left, `${r.name}: the aside comes after the name`).toBeGreaterThan(r.label.right);
    expect(r.aside.right, `${r.name}: the aside ends inside the row`).toBeLessThanOrEqual(r.row.right + 1);
  }
});

test('@pickerlayout phone: every row inside the sheet, nothing past its edge (390x844)', async ({ page }) => {
  const dlg = await openPicker(page, 390, 844);
  const over = await dlg.evaluate((d) => {
    const vw = window.innerWidth;
    const past = Array.from(d.querySelectorAll<HTMLElement>('[role="radio"], [role="radio"] *')).filter((e) => { const b = e.getBoundingClientRect(); return b.right > vw + 1 || b.left < -1; }).map((e) => e.textContent);
    return { past, vw };
  });
  expect(over.past, 'nothing drawn past the screen edge').toEqual([]);
  await noSideScroll(page);
  const rows = await rowsOf(dlg);
  for (const r of rows) expect(r.aside.right, `${r.name}: the aside ends inside the row`).toBeLessThanOrEqual(r.row.right + 1);
});

// A long name and a long realm stay inside the row on both edges; on a phone the aside goes under the
// name instead of past the edge.
for (const [width, height] of [[1400, 900], [390, 844]] as const) {
  test(`@pickerlayout long name and realm: wrapped inside the row on both edges (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await gotoHub(page, '/_kit?tab=pieces');
    await page.getByRole('button', { name: new RegExp(`${gallery.long}$`) }).click();
    const dlg = page.getByRole('dialog').last();
    // The long sample has one computer, so its one row is the only radio.
    await dlg.getByRole('radio').waitFor();
    await holdsStill(dlg);
    const past = await dlg.evaluate((d) => {
      const vw = window.innerWidth;
      return Array.from(d.querySelectorAll<HTMLElement>('*')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 1 || b.left < -1); }).map((e) => e.className);
    });
    expect(past, 'nothing in the picker is drawn past either screen edge').toEqual([]);
    const rows = await rowsOf(dlg);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.label.left, `${r.name}: the name starts inside the row`).toBeGreaterThanOrEqual(r.row.left - 1);
      expect(r.label.right, `${r.name}: the name ends inside the row`).toBeLessThanOrEqual(r.row.right + 1);
      expect(r.aside.left, `${r.name}: the aside starts inside the row`).toBeGreaterThanOrEqual(r.row.left - 1);
      expect(r.aside.right, `${r.name}: the aside ends inside the row`).toBeLessThanOrEqual(r.row.right + 1);
      if (width < 600) expect(r.aside.top, `${r.name}: on a phone the aside wraps under the name`).toBeGreaterThanOrEqual(r.label.bottom - 1);
    }
  });
}
