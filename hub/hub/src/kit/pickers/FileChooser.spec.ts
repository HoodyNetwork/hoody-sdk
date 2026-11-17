// Playwright: the kit FileChooser from the gallery (/_kit?tab=pieces&fc=folder|one), at 1440 and at 390. The title names
// the computer; Up and the places reach the computer's top folder "/" and the home folder; each step of the path opens its
// folder and a deep path folds its middle steps into one menu; a typed absolute path opens on Enter. Nothing leaves the
// screen sideways and axe finds nothing (WCAG 2 A/AA).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import fc from './FileChooser.strings.en.json';

const dialog = (page: Page) => page.getByRole('dialog', { name: fc['fc.titleOn.folder'].replace('{{computer}}', 'atlas') });
const here = (page: Page) => dialog(page).locator('[aria-current="location"]');

async function open(page: Page, state: 'folder' | 'one') {
  await gotoHub(page, `/_kit?tab=pieces&fc=${state}`);
  await page.getByRole('dialog').first().waitFor({ timeout: 60_000 }); // reason: only waits for a dialog to be drawn; each test finds the chooser by its title
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

for (const width of [1440, 390] as const) {
  test(`at ${width}: the computer's top folder and the home folder, each step, a typed path`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await open(page, 'folder');
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(here(page)).toHaveText('projects');
    const places = async (name: string) => {
      // On a phone the places are one menu; beside the list otherwise.
      if (width === 390) {
        await d.getByRole('button', { name: fc['fc.places'] }).click();
        await page.getByRole('menuitem', { name: new RegExp(`^${name.replace(/[()/]/g, '\\$&')}`) }).click();
      } else await d.getByRole('button', { name }).click();
    };
    await places(fc['fc.topHome'].replace('{{path}}', '/home/ada'));
    await expect(here(page)).toHaveText('ada');
    await d.getByRole('button', { name: fc['fc.up'] }).click();
    await d.getByRole('button', { name: fc['fc.up'] }).click();
    await expect(here(page)).toHaveText('/');
    await expect(d.getByRole('button', { name: fc['fc.up'] })).toHaveAttribute('aria-disabled', 'true');
    await expect(d.getByRole('option', { name: /^home, folder/ })).toBeVisible();
    await noSideScroll(page);
    await axe(page);

    // A typed absolute path opens on Enter; each step above it opens its own folder.
    const box = d.getByRole('searchbox', { name: fc['fc.box'] });
    await box.fill('/home/ada/projects/shop/src/');
    await box.press('Enter');
    await expect(here(page)).toHaveText('src');
    // "/" › … › shop › src: the middle steps are one menu.
    await d.getByRole('button', { name: fc['fc.crumbsMore'] }).click();
    await page.getByRole('menuitem', { name: 'ada' }).click();
    await expect(here(page)).toHaveText('ada');
    await d.getByRole('button', { name: 'home', exact: true }).click();
    await expect(here(page)).toHaveText('home');
    await noSideScroll(page);
    await axe(page);
  });
}

test('a root that is not the computer\'s top folder stops Up there and says so', async ({ page }) => {
  await open(page, 'one');
  const d = page.getByRole('dialog', { name: fc['fc.titleOn.file'].replace('{{computer}}', 'atlas') });
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: fc['fc.topHome'].replace('{{path}}', '~') }).click();
  const up = d.getByRole('button', { name: fc['fc.up'] });
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  await expect(up).toHaveAccessibleDescription(new RegExp(fc['fc.upRoot'].replace('{{root}}', '~').replace(/[.]/g, '\\.')));
  const box = d.getByRole('searchbox', { name: fc['fc.box'] });
  await box.fill('/etc/');
  await expect(d.getByText(fc['fc.outside'].replace('{{root}}', '~'))).toBeVisible();
});
