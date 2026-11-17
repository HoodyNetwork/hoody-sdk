// Playwright: on Computer › Connect the SSH section's parts,
// its facts and its two folds (the command line, the public gateway), each take the section's whole inner width
// wherever the detail is: at 1440 with the computer list shown (the default view) and hidden (\),
// at 1920, and on a phone; nothing sits alone in a half
// row. Layout needs a real browser.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

async function parts(page: Page, hideList = false) {
  await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
  const section = page.locator('section#connect-ssh');
  await section.getByRole('button', { name: new RegExp(`^${strings['ssh.gateway.title']}`) }).waitFor({ timeout: 15_000 });
  if (hideList) {
    const before = await section.evaluate((sec) => sec.getBoundingClientRect().width);
    await page.keyboard.press('Backslash');
    await expect.poll(() => section.evaluate((sec) => sec.getBoundingClientRect().width)).toBeGreaterThan(before + 100);
  }
  return section.evaluate((sec) => {
    // The facts grid and the two folds: the body's direct blocks (whatever wrapper the kit puts them in).
    const dl = sec.querySelector('dl')!;
    const folds = [...sec.querySelectorAll('button[slot="trigger"]')].map((b) => b.closest('h1, h2, h3, h4, h5, h6')!.parentElement!);
    const box = (e: Element) => e.getBoundingClientRect();
    const body = dl.parentElement!.getBoundingClientRect();
    return { body: { left: body.left, width: body.width }, blocks: [dl, ...folds].map((e) => ({ left: box(e).left, width: box(e).width, top: box(e).top })) };
  });
}

const full = (p: Awaited<ReturnType<typeof parts>>) => {
  expect(p.blocks).toHaveLength(3);
  // One per line, top to bottom, each as wide as the others (the body's inner width).
  const tops = p.blocks.map((b) => Math.round(b.top));
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  expect(new Set(tops).size).toBe(3);
  const w = p.blocks[0]!.width;
  for (const b of p.blocks) expect(Math.abs(b.width - w)).toBeLessThanOrEqual(2);
  expect(w).toBeGreaterThan(p.body.width * 0.8);
};

for (const [width, hideList] of [[1440, false], [1440, true], [1920, false]] as const)
  test.describe(`${width} px${hideList ? ', computer list hidden' : ''}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('the SSH facts and folds each take the section width, one per line', async ({ page }) => {
      full(await parts(page, hideList));
    });
  });

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the SSH facts and folds stack one per line, each the section wide', async ({ page }) => {
    full(await parts(page));
  });
});
