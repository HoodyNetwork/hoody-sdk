// Playwright: the page's questions in a ListDetail list pane never shrink the rows. At 1350 and 2400,
// light and dark, on Bots (23 rows), Scripts and Support (tables inside a page's own wrapper) and Vault (3 rows):
//   - a long list keeps the whole pane: its table ends at the pane's end, the questions start under it, out of view, and
//     at least as many rows show as fit (counted inside the table's own scroller, so a clipped row does not count);
//   - a short list keeps its own height: the questions start right under its last row, in view;
//   - a location naming a question (#faq-<id>) lands on it, and it stays in view after the rows have arrived;
//   - at 390 a row menu (⋯) the keyboard moves to below the fold scrolls clear of the floating New Bot button;
//   - the FaqLink in the empty Bots list's sentence is underlined at rest, and axe finds no link-in-text-block there
//     at 390, light and dark.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';
import kit from '../strings.en.json';

const LIST = 'section[class*="ListDetailPage"][class*="list"]';

test.describe.configure({ timeout: 90_000 });

/** The pane, its table, the questions, and the rows wholly inside the table's scroller and the pane. */
async function boxes(page: Page) {
  return page.evaluate((sel) => {
    const list = document.querySelector(sel);
    const body = list?.querySelector<HTMLElement>('[class*="listBody"]');
    const table = body?.querySelector<HTMLElement>(':scope > [data-fill], :scope > * [data-fill]');
    const faq = body?.querySelector<HTMLElement>('[class*="listFaq"]');
    if (!body || !table || !faq) return null;
    const b = body.getBoundingClientRect();
    const t = table.getBoundingClientRect();
    const f = faq.getBoundingClientRect();
    let clip = b;
    for (let el = table.querySelector('tbody')?.parentElement ?? null; el && el !== table; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if (o === 'auto' || o === 'scroll') { clip = el.getBoundingClientRect(); break; }
    }
    const rows = [...table.querySelectorAll('tbody tr')].filter((r) => {
      const g = r.getBoundingClientRect();
      return g.height > 0 && g.top >= Math.max(clip.top, b.top) - 1 && g.bottom <= Math.min(clip.bottom, b.bottom) + 1;
    }).length;
    return { bodyTop: b.top, bodyBottom: b.bottom, tableBottom: t.bottom, faqTop: f.top, rows, lastRow: [...table.querySelectorAll('tbody tr')].at(-1)?.getBoundingClientRect().bottom ?? 0 };
  }, LIST);
}

for (const theme of ['light', 'dark'] as const) {
  // `many` = the List rows that fit the pane with table rows of 44 px under the toolbar, head and one group row.
  for (const [width, height, many] of [[1350, 800, 8], [2400, 1300, 18]] as const) {
    const where = `${theme} ${width}`;

    test(`${where}: a long list keeps the whole pane and the questions start under it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, '/bots', { theme });
      // Bots opens on Cards; the rows of this check are the List's (the table's own rows).
      await choosePresentation(page.locator('#hub-main'), 'list');
      await expect.poll(async () => (await boxes(page))?.rows ?? 0, { message: 'the rows have arrived' }).toBeGreaterThanOrEqual(many);
      const m = (await boxes(page))!;
      expect(Math.abs(m.tableBottom - m.bodyBottom), 'the table ends at the pane end').toBeLessThanOrEqual(1);
      expect(m.faqTop, 'the questions start under the pane, reached by scrolling it').toBeGreaterThanOrEqual(m.bodyBottom);
    });

    for (const path of ['/scripts', '/support']) {
      test(`${where}: ${path}, a table inside the page's wrapper, keeps the pane or its own height, never less`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await gotoHub(page, path, { theme });
        await expect.poll(async () => (await boxes(page))?.rows ?? 0, { message: 'the rows have arrived' }).toBeGreaterThanOrEqual(3);
        const m = (await boxes(page))!;
        const all = await page.locator(`${LIST} [data-fill] tbody tr`).count();
        // Either every row shows and the questions follow, or the table keeps the pane down to its end.
        if (m.rows < all) expect(m.faqTop, 'rows left to scroll: the questions start under the pane').toBeGreaterThanOrEqual(m.bodyBottom);
        else {
          expect(m.faqTop, 'every row shows: the questions follow the last row').toBeGreaterThanOrEqual(m.lastRow);
          expect(m.faqTop, 'every row shows: the questions start in view, not under a wrapper of the pane height').toBeLessThan(m.bodyBottom);
        }
        expect(m.rows, 'at least as many rows as the old pane share showed, and more than a few').toBeGreaterThanOrEqual(Math.min(all, width === 1350 ? 8 : 12));
      });
    }

    test(`${where}: a short list keeps its own height and the questions sit right under it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, '/vault', { theme });
      await expect.poll(async () => (await boxes(page))?.rows ?? 0, { message: 'the rows have arrived' }).toBeGreaterThanOrEqual(3);
      const m = (await boxes(page))!;
      expect(m.tableBottom, 'the table ends above the pane end').toBeLessThan(m.bodyBottom - 40);
      expect(m.faqTop, 'the questions start in view').toBeLessThan(m.bodyBottom);
    });

    test(`${where}: a location naming a question lands on it and keeps it in view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, '/bots#faq-whatIsBot', { theme });
      const q = page.locator('#faq-whatIsBot button[aria-expanded]');
      await expect(q).toHaveAttribute('aria-expanded', 'true');
      // The pane is scrolled to the question, so the rows are counted in the document, not in view.
      await expect.poll(() => page.locator(`${LIST} [data-fill] tbody tr`).count(), { message: 'the rows have arrived' }).toBeGreaterThan(9);
      await page.waitForTimeout(1500);
      const inView = await q.evaluate((el, sel) => {
        const body = document.querySelector(sel)?.querySelector('[class*="listBody"]')?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return !!body && r.top >= body.top - 1 && r.bottom <= Math.min(body.bottom, innerHeight) + 1;
      }, LIST);
      expect(inView, 'the landed question is inside the pane and the window').toBe(true);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 390: the FaqLink in the empty list's sentence is underlined, axe link-in-text-block clean`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHub(page, '/bots', { theme, state: 'empty' });
    const link = page.locator(`${LIST} a[href*="faq-whatIsBot"]`).first();
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
    const r = await new AxeBuilder({ page }).include(LIST).withRules(['link-in-text-block', 'color-contrast']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 390: a row menu reached by the keyboard below the fold is not under the floating button`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHub(page, '/bots', { theme });
    const menus = page.locator(`${LIST} [data-fill] tbody button[aria-label="${kit['table.rowActions']}"]`);
    await expect.poll(() => menus.count(), { message: 'the rows have arrived' }).toBeGreaterThan(12);
    await expect(page.locator('[class*="fab"]').first()).toBeVisible();
    for (const i of [8, 12]) {
      const menu = menus.nth(i);
      await menu.focus();
      await page.waitForTimeout(300);
      const hit = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { own: !!at && (at === el || el.contains(at)), at: at ? `<${at.tagName.toLowerCase()} ${String(at.className).slice(0, 50)}>` : 'nothing' };
      });
      expect(hit.own, `row ${i}'s menu is the element at its own centre, not ${hit.at}`).toBe(true);
    }
  });
}
