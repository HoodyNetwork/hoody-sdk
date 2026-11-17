// Playwright: Look inside and Extract here… in a real browser, on a wide screen with a fine
// pointer and on a phone with a coarse one. The dialog fits the screen with no sideways scroll, its buttons keep their
// hit size, axe finds nothing in it, and each answer is said in the dialog as the vitest flow pins it: the counts and the
// link left out, then the new folder in the listing; a failure answer that contradicts itself says files may have
// changed. archive.flow.test.tsx covers every other answer and the dialog's life across leaving and realm switches.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';
import a from './Archive.strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });

async function rowAction(page: Page, name: RegExp, action: string) {
  await paneA(page).getByRole('row', { name }).getByRole('button', { name: /actions|more/i }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

/** The box holds still (three reads in a row agree): a drawer slides in, so a read before this measures it mid-way. Motion
    stays on, so the page under test is the real one. */
async function holdsStill(el: Locator) {
  let was = '';
  let same = 0;
  await expect
    .poll(async () => { const b = JSON.stringify(await el.boundingBox()); same = b === was && b !== 'null' ? same + 1 : 0; was = b; return same; }, { timeout: 15_000, intervals: [100] })
    .toBeGreaterThanOrEqual(2);
}

/** The dialog fits the screen, the page does not scroll sideways, and every button in the dialog keeps its hit size. */
async function expectFits(page: Page, d: Locator, hit: number) {
  await holdsStill(d);
  const box = (await d.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x, 'the dialog starts on screen').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'the dialog ends on screen').toBeLessThanOrEqual(vw + 1);
  await noSideScroll(page);
  const small = await d.getByRole('button').evaluateAll(
    (els, min) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && Math.min(r.width, r.height) < min; }).map((el) => el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName),
    hit - 1,
  );
  expect(small, `buttons under ${hit}px`).toEqual([]);
}

async function expectAxeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).include('[role=dialog]').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
}

const PLACES = [
  { name: 'wide screen, fine pointer', use: { viewport: { width: 1440, height: 900 } }, hit: 28 },
  { name: 'phone, coarse pointer', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, hit: 44 },
];

// The first visit pays the dev server's cold transform of the Hub, which under host load outlasts one 30 s test: warm it
// once here. A whole-Hub page under load takes about 20 s per step (goto, shell, row menu), so axe, the last step, ran past
// a 90 s budget there while the Files-only run passed: each case gets 180 s.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await browser.newPage();
  await gotoHub(page, ADA, { state: 'archive' });
  await page.close();
});

for (const p of PLACES) {
  test.describe(p.name, () => {
    test.use(p.use);
    test.describe.configure({ timeout: 180_000 });

    test('Look inside lists site.zip in a dialog that fits, axe clean', async ({ page }) => {
      await gotoHub(page, ADA, { state: 'archive' });
      await rowAction(page, /site\.zip/, `${a['action.look']}…`);
      const d = page.getByRole('dialog', { name: fill(a['look.title'], { name: 'site.zip' }) });
      await expect(d.getByRole('list', { name: fill(a['look.list'], { name: 'site.zip' }) }).getByRole('listitem')).toHaveCount(4);
      await expect(d.getByText(a['look.link'])).toBeVisible();
      await expectFits(page, d, p.hit);
      await expectAxeClean(page);
    });

    test('Extract here says the counts and the link left out, and the new folder lists', async ({ page }) => {
      await gotoHub(page, ADA, { state: 'archive' });
      await rowAction(page, /site\.zip/, `${a['action.extract']}…`);
      const d = page.getByRole('dialog', { name: fill(a['extract.title'], { name: 'site.zip' }) });
      await expect(d.getByRole('textbox', { name: a['extract.field'] })).toHaveValue('site');
      const go = d.getByRole('button', { name: a['extract.primary'], exact: true });
      await expect(go).toBeEnabled();
      await expectFits(page, d, p.hit);
      await expectAxeClean(page);
      await go.click();
      await expect(d.getByText(/Extracted 2 files into site\. 1 entry was not extracted\./)).toBeVisible();
      await expectFits(page, d, p.hit);
      // The footer's worded Close (data-dialog-cancel), not the dialog's X, which has the same name.
      await d.getByRole('button', { name: a['extract.close'], exact: true }).and(d.locator('[data-dialog-cancel]')).click();
      await expect(d).toHaveCount(0);
      await expect(paneA(page).getByRole('row', { name: /\bsite\b(?!\.zip)/ })).toBeVisible();
    });

    test('a failure answer that contradicts itself says files may have changed', async ({ page }) => {
      await gotoHub(page, ADA, { state: 'archiveContradicted' });
      await rowAction(page, /site\.zip/, `${a['action.extract']}…`);
      const d = page.getByRole('dialog', { name: fill(a['extract.title'], { name: 'site.zip' }) });
      const go = d.getByRole('button', { name: a['extract.primary'], exact: true });
      await expect(go).toBeEnabled();
      await go.click();
      await expect(d.getByText(/Couldn't extract site\.zip\. Files in site may have changed\./)).toBeVisible();
      await expectFits(page, d, p.hit);
      await expectAxeClean(page);
    });
  });
}
