// Playwright: the kit gallery's SystemSteps and ExamplePicker (/_kit?tab=text, "Command steps"). Both
// pickers are full width, so at any width every label shows whole: segments when they fit, else a Select of the same
// choices; never a cut label and no sideways scroll. Boxes need a real browser, not jsdom.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import gallery from '../gallery/kit2.strings.en.json';

for (const width of [1440, 390, 320]) {
  test(`steps and example pickers at ${width}: every label whole, segments or a Select, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/_kit?tab=text');
    for (const name of [gallery['steps.label'], gallery['ex.label']]) {
      const group = page.getByRole('radiogroup', { name });
      // the fallback Select's name is the choice then the label ("Mac Your device")
      const select = page.getByRole('button', { name: new RegExp(` ${name}$`) });
      await expect(group.or(select).first()).toBeVisible({ timeout: 30_000 });
      if (await group.isVisible()) {
        const cut = await group.getByRole('radio').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
        expect(cut, `${name}: no segment label cut`).toEqual([]);
      }
    }
    await noSideScroll(page);
  });
}
