// Playwright: a reply's marked links in the conversation frame on fixtures
// (`/_kit?layout=ai-conversation&links=1`: atlas running, gamma off, one computer not listed). At 1350 (sidebar open and as a
// rail), 2400 and 390, light and dark: a bare address reads as its label and its Open button is inside the viewport and the
// topmost element at its centre; a labelled link keeps the agent's words and gains the button after them; a script opens as a
// script; an off computer says so; a computer not listed reads "Another computer" with its host masked (its id never shown);
// ⋯ opens inside the viewport with Copy address; nothing scrolls sideways. A local address reads as the port on
// atlas, its Open naming what was written, and its card opens inside the viewport titled with the label.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const NOT_LISTED = '0d0d0d0d0d0d0d0d0d0d0d0d';

async function open(page: Page, width: number, rail: boolean, scheme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.addInitScript((collapsed: boolean) => { try { window.localStorage.setItem('hub.v3.shell', JSON.stringify({ collapsed })); } catch { /* none */ } }, rail);
  await gotoHub(page, '/_kit?layout=ai-conversation&links=1&details=0&gates=0&turns=2', { theme: scheme });
  await expect(page.locator('[data-details]')).toBeVisible();
}

async function topmost(page: Page, l: Locator, what: string): Promise<void> {
  await l.scrollIntoViewIfNeeded();
  await expect(l, what).toBeVisible();
  const box = (await l.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, `${what} inside the viewport`).toBe(true);
  const hit = await l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at && (at === el || el.contains(at)) ? 'ok' : at ? `${at.tagName.toLowerCase()}.${String((at as HTMLElement).className)}` : 'nothing';
  });
  expect(hit, `${what} is the topmost element at its centre`).toBe('ok');
}

const CASES = [
  { width: 1350, rail: false },
  { width: 1350, rail: true },
  { width: 2400, rail: false },
  { width: 390, rail: false },
] as const;

for (const { width, rail } of CASES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`marked links at ${width}${rail ? ' (rail)' : ''}, ${scheme}`, async ({ page }) => {
      await open(page, width, rail, scheme);
      const port = page.getByRole('button', { name: 'Open atlas · port 3000', exact: true });
      await topmost(page, port, 'the port mark');
      await expect(port).toHaveText('atlas · port 3000');
      await expect(page.getByText('the checkout notes', { exact: true })).toBeVisible();
      await topmost(page, page.getByRole('button', { name: 'Open atlas · Notes 1', exact: true }), 'the labelled link mark');
      await topmost(page, page.getByRole('button', { name: 'Open atlas · Terminal 3', exact: true }), 'the terminal mark');
      await topmost(page, page.getByRole('button', { name: 'Open the script atlas · /build/run', exact: true }), 'the script mark');
      await topmost(page, page.getByRole('button', { name: 'Open gamma · Terminal 1 (off)', exact: true }), 'the off computer mark');
      const other = page.getByRole('button', { name: /^Open Another computer · / });
      await topmost(page, other, 'the other computer mark');
      await expect(page.locator('[data-details]')).not.toContainText(NOT_LISTED);
      const local = page.getByRole('button', { name: 'Open atlas · port 5173 (written as localhost:5173/admin)', exact: true });
      await topmost(page, local, 'the local address mark');
      await expect(local).toHaveText('atlas · port 5173');
      await expect(page.locator('[data-details]')).not.toContainText('localhost:5173');
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`linkmark-${width}${rail ? '-rail' : ''}-${scheme}.png`) });
      const more = page.getByRole('button', { name: 'More for atlas · port 3000', exact: true });
      await topmost(page, more, 'the port mark ⋯');
      await more.click();
      await topmost(page, page.getByRole('menuitem', { name: 'Copy address', exact: true }), 'Copy address');
      await page.screenshot({ path: test.info().outputPath(`linkmark-${width}${rail ? '-rail' : ''}-${scheme}-menu.png`) });
      await page.keyboard.press('Escape');
      await local.click();
      const card = page.getByRole('dialog', { name: 'Open atlas · port 5173 (written as localhost:5173/admin)' });
      await topmost(page, card.getByRole('heading', { name: 'atlas · port 5173' }), 'the local address card');
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`linkmark-${width}${rail ? '-rail' : ''}-${scheme}-local.png`) });
    });
  }
}
