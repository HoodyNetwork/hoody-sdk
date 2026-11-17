// Playwright: the gallery's InfoTip specimen in its icon and term forms, open, at 1440 and
// 390, light and dark. At 1440 a fine pointer gets the 24 px icon box and a mouse resting on it opens the tip; at 390
// on a coarse pointer the box is 44 px, the popover opens below its trigger and stays 8 px inside the viewport, no
// wider than 280 px. axe finds nothing on the open tip. The kit Tabs badge with a unit reads "9 programs".
// HUB_INFOTIP_SHOTS=<dir> also writes the frames there.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import kit2 from '../gallery/kit2.strings.en.json';
import strings from './InfoTip.strings.en.json';

const GALLERY = '/_kit?tab=overlays';
const about = (subject: string) => strings['info.about'].replace('{{subject}}', subject);
const iconTip = (page: Page) => page.getByRole('button', { name: about(gallery['infotip.realm']), exact: true });
const termTip = (page: Page) => page.getByRole('button', { name: gallery['infotip.tools'], exact: true });
const tipDialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

async function shot(page: Page, name: string) {
  const dir = process.env.HUB_INFOTIP_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function noAxe(page: Page) {
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').include('#hub-main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`wide, fine pointer (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`icon form: a 24 px box; a press opens the tip beside it and keeps focus on the trigger (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, GALLERY, { theme });
      const b = iconTip(page);
      await b.scrollIntoViewIfNeeded();
      const box = (await b.boundingBox())!;
      expect(Math.round(box.width), 'icon box width').toBe(24);
      expect(Math.round(box.height), 'icon box height').toBe(24);
      await b.click();
      const d = tipDialog(page, about(gallery['infotip.realm']));
      await expect(d).toBeVisible();
      await expect(d).toContainText(gallery['infotip.realmText']);
      await expect(b).toBeFocused();
      await expect(b).toHaveAttribute('aria-expanded', 'true');
      const pop = (await d.boundingBox())!;
      expect(pop.x, 'opens at the inline end of the trigger').toBeGreaterThanOrEqual(box.x + box.width);
      await shot(page, `infotip-icon-1440-${theme}`);
      await noAxe(page);
      await page.keyboard.press('Escape');
      await expect(d).toBeHidden();
      await expect(b).toBeFocused();
    });

    test(`term form: the words are the trigger; the tip opens on press (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, GALLERY, { theme });
      const b = termTip(page);
      await b.scrollIntoViewIfNeeded();
      const deco = await b.evaluate((el) => getComputedStyle(el).textDecorationStyle);
      expect(deco, 'dotted underline').toBe('dotted');
      await b.click();
      const d = tipDialog(page, gallery['infotip.tools']);
      await expect(d).toBeVisible();
      await shot(page, `infotip-term-1440-${theme}`);
      await noAxe(page);
    });

    test(`a mouse resting on the icon opens the tip after its delay (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, GALLERY, { theme });
      const b = iconTip(page);
      await b.scrollIntoViewIfNeeded();
      await b.hover();
      await expect(tipDialog(page, about(gallery['infotip.realm']))).toBeVisible();
    });

    test(`the Tabs number badge carries its unit (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=nav', { theme });
      const tab = page.getByRole('tab', { name: `${kit2['tabs.programs']} 9 ${kit2['tabs.programsUnit_other']}`, exact: true }).first(); // the nav tab draws this Tabs specimen three times (wide, then two narrow containers): the wide one
      await expect(tab).toBeVisible();
      await expect(tab).toContainText(`9 ${kit2['tabs.programsUnit_other']}`);
      await tab.scrollIntoViewIfNeeded();
      await shot(page, `infotip-tabs-badge-1440-${theme}`);
    });
  });

  test.describe(`390, coarse pointer (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`icon form: a 44 px target; the tip opens below it, 8 px inside the screen, at most 280 px wide (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, GALLERY, { theme });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const b = iconTip(page);
      await b.scrollIntoViewIfNeeded();
      const box = (await b.boundingBox())!;
      expect(Math.round(box.width), 'touch box width').toBe(44);
      expect(Math.round(box.height), 'touch box height').toBe(44);
      await b.tap();
      const d = tipDialog(page, about(gallery['infotip.realm']));
      await expect(d).toBeVisible();
      const frame = d.locator('xpath=..');
      const pop = (await frame.boundingBox())!;
      expect(pop.y, 'opens below the trigger').toBeGreaterThanOrEqual(box.y + box.height);
      expect(pop.x, 'start edge 8 px inside').toBeGreaterThanOrEqual(8 - 0.5);
      expect(pop.x + pop.width, 'end edge 8 px inside').toBeLessThanOrEqual(390 - 8 + 0.5);
      expect(pop.width, 'at most --tip-max-w').toBeLessThanOrEqual(280 + 0.5);
      await shot(page, `infotip-icon-390-${theme}`);
      await noAxe(page);
    });

    test(`term form at 390: the tip stays inside the screen (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, GALLERY, { theme });
      const b = termTip(page);
      await b.scrollIntoViewIfNeeded();
      await b.tap();
      const d = tipDialog(page, gallery['infotip.tools']);
      await expect(d).toBeVisible();
      const pop = (await d.locator('xpath=..').boundingBox())!;
      expect(pop.x).toBeGreaterThanOrEqual(8 - 0.5);
      expect(pop.x + pop.width).toBeLessThanOrEqual(390 - 8 + 0.5);
      await shot(page, `infotip-term-390-${theme}`);
    });
  });
}
