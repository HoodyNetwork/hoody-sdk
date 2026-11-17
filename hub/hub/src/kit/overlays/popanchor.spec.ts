// Playwright: Popover `anchor` on the gallery's overlays tab. The specimen's popover opens
// from its button but is placed against its region's top edge (8 px below it, centred on it), not against the button;
// Escape gives focus back to the button. Light and dark.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';

for (const theme of ['light', 'dark'] as const) {
  test(`an anchored popover sits on its region's top edge, centred (${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/_kit?tab=overlays', { theme });
    const region = page.getByRole('group', { name: gallery['anchored.region'] });
    const open = region.getByRole('button', { name: gallery['anchored.open'] });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const d = page.getByRole('dialog', { name: gallery['anchored.label'] });
    await expect(d).toBeVisible();
    const r = (await region.boundingBox())!;
    const b = (await open.boundingBox())!;
    const box = (await d.boundingBox())!;
    expect(Math.abs(box.y - (r.y + 8))).toBeLessThanOrEqual(2);
    expect(Math.abs(box.x + box.width / 2 - (r.x + r.width / 2))).toBeLessThanOrEqual(2);
    // Not placed against the button (which sits at the region's bottom).
    expect(box.y).toBeLessThan(b.y);
    await page.screenshot({ path: info.outputPath(`popanchor-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(open).toBeFocused();
  });
}
