// A SettingsPage section with AnatomySection's slots on the gallery's settings layout. The head's
// ActionBar follows an AnatomySection head: beside the titles when the row has room, else under them. The notice is
// above the list, the note under it, and nothing runs wider than #hub-main. Both themes.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../gallery/layouts.strings.en.json';
import kit from '../strings.en.json';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`settings section slots at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('head actions beside or under the titles; notice, list, note in order; no overflow', async ({ page }) => {
        await gotoHub(page, '/_kit?layout=settings', { theme });
        const sec = page.locator('section[data-section="keys"]');
        await sec.scrollIntoViewIfNeeded();
        const titles = (await sec.getByRole('heading', { level: 2, name: strings['settings.keys'] }).locator('xpath=ancestor::div[2]').boundingBox())!;
        const add = sec.getByRole('button', { name: strings['settings.keysAdd'] });
        await expect(add).toBeVisible();
        // The kit ActionBar's own rule: the secondary shows at 1440, and folds into the bar's menu on a phone.
        if (width === 1440) await expect(sec.getByRole('button', { name: strings['settings.keysImport'] })).toBeVisible();
        else {
          // On a phone the secondary is in the bar's ⋯ menu.
          await expect(sec.getByRole('button', { name: strings['settings.keysImport'] })).toHaveCount(0);
          await sec.getByRole('button', { name: kit['action.more'] }).click();
          await expect(page.getByRole('menuitem', { name: strings['settings.keysImport'] })).toBeVisible();
          await page.keyboard.press('Escape');
        }
        const a = (await add.boundingBox())!;
        // As an AnatomySection head: the actions sit beside the titles when the row has room, else wholly under them;
        // never over them, and never past the section's edge.
        const beside = a.x >= titles.x + titles.width - 1;
        const under = a.y >= titles.y + titles.height - 1;
        expect(beside || under, 'the actions beside or under the titles').toBe(true);
        const box = (await sec.boundingBox())!;
        expect(a.x + a.width).toBeLessThanOrEqual(box.x + box.width);
        const notice = (await sec.getByText(strings['settings.keysOld']).boundingBox())!;
        const item = (await sec.getByText(strings['settings.keyLaptop']).boundingBox())!;
        const note = (await sec.getByText(strings['settings.keysNote']).boundingBox())!;
        expect(notice.y).toBeLessThan(item.y);
        expect(item.y).toBeLessThan(note.y);
        const over = await page.locator('#hub-main').evaluate((m) => m.scrollWidth - m.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });
