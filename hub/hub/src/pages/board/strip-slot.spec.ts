// Playwright: the strip's end slot (where the Broadcast
// trigger renders, through a node with no box of its own) narrowing with the same masked words (Live · 123… watching
// -> Live · 2 watching) lets the row step back up; widening steps it down. Measured with the slot's real CSS
// (display: contents), which jsdom does not apply. The Broadcast is stood in for by the same DOM: a box-less node
// holding a button.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const step = async (page: Page) => Number(await page.locator('[data-strip-step]').getAttribute('data-strip-step'));

test.use({ viewport: { width: 1024, height: 768 } });

test('a slot that narrows with the same masked words steps the row back up', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoHub(page, '/board');
  const add = page.getByRole('button', { name: strings['board.new'], exact: true });
  for (let i = 0; i < 4; i++) await add.click();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await page.mouse.move(512, 760);
  await expect.poll(() => step(page)).toBe(0);
  const idle = await step(page);
  // The Broadcast, live with a count wide enough to step the row down.
  await page.locator('[data-strip-slot]').evaluate((slot) => {
    const node = document.createElement('span');
    node.style.display = 'contents';
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'lboard-live';
    b.textContent = `Live · ${'1'.repeat(120)} watching`;
    node.append(b);
    slot.append(node);
  });
  await expect.poll(() => step(page), { timeout: 10_000 }).toBeGreaterThan(idle);
  // Fewer watching: the same masked words (digits read as one), a narrower button.
  await page.locator('#lboard-live').evaluate((b) => { b.textContent = 'Live · 2 watching'; });
  await expect.poll(() => step(page), { timeout: 10_000 }).toBe(idle);
});
