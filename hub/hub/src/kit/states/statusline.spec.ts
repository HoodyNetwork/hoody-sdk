// The kit StatusLine on the gallery (/_kit?tab=overlays #status-line): the same status element stays
// in the page from empty through each step's words and back to empty (a node a live region keeps is announced on
// change), with no live region around it; empty, it takes no height and makes no gap. At 1440 and 390, both themes.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`status line at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('one kept status element; its words change in place; empty takes no height; no live region around it', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=overlays', { theme });
        const sec = page.locator('#status-line');
        await sec.scrollIntoViewIfNeeded();
        const line = sec.getByRole('status');
        await expect(line).toHaveCount(1);
        await page.evaluate(() => {
          (window as unknown as { kept: Element | null }).kept = document.querySelector('#status-line [role="status"]');
        });
        expect(await line.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
        // Empty, it makes no gap either: Next step and Start over sit one Stack gap apart, as if the line were not there.
        const apart = async () =>
          sec.evaluate((root) => {
            const [a, b] = [...root.querySelectorAll('button')].filter((x) => /Next step|Start over/.test(x.textContent ?? ''));
            const gap = Number.parseFloat(getComputedStyle(a!.parentElement!).rowGap) || 0;
            return { space: b!.getBoundingClientRect().top - a!.getBoundingClientRect().bottom, gap };
          });
        const empty = await apart();
        // Within a pixel: sub-pixel layout rounds the button edges.
        expect(Math.abs(empty.space - empty.gap), `no gap from the empty line: ${JSON.stringify(empty)}`).toBeLessThanOrEqual(1);
        const next = sec.getByRole('button', { name: 'Next step' });
        for (const words of ['Starting the run…', 'Reading the TODO list…', 'The run started.']) {
          await next.click();
          await expect(line).toHaveText(words);
        }
        // With words it takes its place between them.
        expect((await apart()).space).toBeGreaterThan(empty.gap + 1);
        await next.click();
        await expect(line).toHaveText('');
        const again = await apart();
        expect(Math.abs(again.space - again.gap), `no gap once empty again: ${JSON.stringify(again)}`).toBeLessThanOrEqual(1);
        const same = await page.evaluate(() => (window as unknown as { kept: Element | null }).kept === document.querySelector('#status-line [role="status"]'));
        expect(same, 'the same element throughout').toBe(true);
        const nested = await line.evaluate((el) => el.parentElement?.closest('[aria-live], [role="status"], [role="alert"], [role="log"]') !== null);
        expect(nested, 'no live region around it').toBe(false);
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });
