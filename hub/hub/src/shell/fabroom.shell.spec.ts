// Playwright: on a phone (390 × 844, touch) the content area keeps the floating action button's room under its content
// only while a page draws that button. An open chat has none: its composer sits right on the bottom bar's strip, with
// no empty band between them. A page that floats its primary action (billing) keeps the room (kit/layouts/fabroom.spec.ts
// proves its last row stays above the button).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const CHAT = '/ai/c/s-old?computer=atlas.00a1&realm=f1f1f1f1f1f1f1f1f1f1f1f1';

/** main's end padding and the strip the bottom bar covers, in px, and whether a floating action button is drawn. */
async function room(page: Page) {
  const bar = page.getByRole('navigation', { name: strings['bottom.label'] });
  await expect(bar).toBeVisible();
  return page.evaluate((label) => {
    const main = document.getElementById('hub-main') as HTMLElement;
    const nav = document.querySelector<HTMLElement>(`nav[aria-label="${label}"]`) as HTMLElement;
    return {
      pad: parseFloat(getComputedStyle(main).paddingBlockEnd),
      strip: window.innerHeight - nav.getBoundingClientRect().top,
      fab: document.querySelector('[data-hub-fab]') !== null,
    };
  }, strings['bottom.label']);
}

test('an open chat (no action button) keeps only the bottom bar strip under it; its composer sits on the bar', async ({ page }) => {
  await gotoHub(page, CHAT);
  const box = page.getByRole('textbox', { name: /Message to your agent/ });
  await expect(box).toBeVisible({ timeout: 30_000 });
  const r = await room(page);
  expect(r.fab).toBe(false);
  expect(Math.abs(r.pad - r.strip), `main pads ${r.pad} px over a ${r.strip} px bar strip`).toBeLessThanOrEqual(1);
  // The chat's frame (the lowest drawn box holding the composer) ends on the bar, not a button's room above it.
  const gap = await page.evaluate((label) => {
    const nav = document.querySelector<HTMLElement>(`nav[aria-label="${label}"]`) as HTMLElement;
    let bottom = 0;
    for (let e = document.querySelector<HTMLElement>('#hub-main textarea'); e && e.id !== 'hub-main'; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (r.height > 0) bottom = Math.max(bottom, r.bottom);
    }
    return nav.getBoundingClientRect().top - bottom;
  }, strings['bottom.label']);
  expect(Math.abs(gap), `the chat ends ${gap} px above the bar`).toBeLessThanOrEqual(1);
});

test('a page with a floating action button keeps the button room under its content', async ({ page }) => {
  await gotoHub(page, '/billing');
  await expect(page.locator('[data-hub-fab]')).toBeVisible({ timeout: 30_000 });
  const r = await room(page);
  expect(r.fab).toBe(true);
  expect(r.pad - r.strip, `main pads ${r.pad} px over a ${r.strip} px bar strip`).toBeGreaterThanOrEqual(56);
});
