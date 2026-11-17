// Playwright: Jump to finds what the pages draw, on the real deep index, at desktop and phone width,
// light, dark and right to left. "passcode" and "pin" both put Account's Passcode lock first, the keyboard alone lands on
// its section, and no result row runs past the palette; on a phone a row's place sits under its label, neither cut.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const out = process.env.HUB_PW_OUT;

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  return palette;
}

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 780 }])
  for (const theme of ['light', 'dark'] as const)
    for (const rtl of [false, true])
      test(`passcode and pin find the passcode lock first (${size.width}, ${theme}${rtl ? ', right to left' : ''})`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize(size);
        await gotoHub(page, '/home', { theme });
        if (rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
        for (const typed of ['passcode', 'pin']) {
          const palette = await openPalette(page);
          await palette.getByRole('searchbox').fill(typed);
          const first = palette.getByRole('menuitem').first(); // the rank is the point: the top result, whatever else matches
          await expect(first, `"${typed}" puts the passcode lock first`).toHaveText(/^Passcode lock/, { timeout: 15_000 });
          // No row wider than the list it sits in.
          const overflow = await palette.getByRole('menuitem').evaluateAll((rows) =>
            rows.filter((r) => r.scrollWidth > r.clientWidth + 1 || r.getBoundingClientRect().right > (r.parentElement?.getBoundingClientRect().right ?? 1e9) + 1).length,
          );
          expect(overflow, 'result rows that run past the list').toBe(0);
          if (size.width < 768) {
            // A phone stacks a row's place under its label: neither is cut (no "…unt" for Account).
            const cut = await palette.getByRole('menuitem').evaluateAll((rows) =>
              rows.flatMap((r) => [...r.querySelectorAll('span')]).filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent),
            );
            expect(cut, 'texts cut in a result row at phone width').toEqual([]);
          }
          if (out && typed === 'passcode') await page.screenshot({ path: `${out}/palette-passcode-${size.width}-${theme}${rtl ? '-rtl' : ''}.png` });
          // One Escape closes the palette, with text in the field too.
          await page.keyboard.press('Escape');
          await expect(palette).toBeHidden();
        }
      });

test('the keyboard alone lands on the section: type, Down to the first result, Enter', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoHub(page, '/home');
  const palette = await openPalette(page);
  await palette.getByRole('searchbox').fill('pascode'); // one typo
  await expect(palette.getByRole('menuitem').first()).toHaveText(/^Passcode lock/, { timeout: 15_000 }); // Enter below opens the top row, so check that one
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 15_000 }).toBe('#/account?section=passcode');
});
