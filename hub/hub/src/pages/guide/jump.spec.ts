// Playwright: a section jump inside the guide (index click, j/k) scrolls only the page's own scroller (#hub-main).
// A document-level scrollIntoView also scrolled the shell's overflow-hidden frame, which pushed the 48 px top bar out
// of view and left a gap under the page.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

/** Nothing outside #hub-main has moved: the document and every ancestor of the scroller sit at 0. */
async function frameStill(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const moved: string[] = [];
    const doc = document.scrollingElement;
    if (doc && doc.scrollTop !== 0) moved.push(`document ${doc.scrollTop}`);
    for (let el = document.getElementById('hub-main')?.parentElement ?? null; el; el = el.parentElement) {
      if (el.scrollTop !== 0) moved.push(`${el.tagName.toLowerCase()}.${el.className} ${el.scrollTop}`);
    }
    return moved;
  });
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

for (const size of SIZES) {
  test(`an index jump keeps the shell in place and shows the heading: ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/guide#connect');
    await page.getByRole('navigation', { name: strings['sections.label'] }).getByRole('link', { name: strings['ix.build'] }).click();
    await expect(page.getByRole('heading', { level: 2, name: strings['build.title'] })).toBeInViewport();
    await page.waitForTimeout(1000);
    expect(await frameStill(page)).toEqual([]);
  });

  test(`j and k keep the shell in place: ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/guide#connect');
    await page.keyboard.press('j');
    await expect(page.getByRole('heading', { level: 2, name: strings['skills.title'] })).toBeInViewport();
    await page.waitForTimeout(1000);
    expect(await frameStill(page)).toEqual([]);
    await page.keyboard.press('k');
    await expect(page.getByRole('heading', { level: 2, name: strings['connect.title'] })).toBeInViewport();
    await page.waitForTimeout(1000);
    expect(await frameStill(page)).toEqual([]);
  });
}
