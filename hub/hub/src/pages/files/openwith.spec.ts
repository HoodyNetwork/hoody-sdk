// Playwright (Open with): Files' entry points in a real browser. A file row's menu opens the drawer with the
// programs its checks found (the fixture computer has nano, mousepad and a screen); the pane bar's Run here menu
// offers a terminal or an app in the folder shown; the Preview offers Open in ‹the top program› after its check found
// it, and Open with…. Phone, laptop and wide widths, light and dark; axe finds nothing in the drawer. Nothing is
// pressed that would start a program here; a launch end to end is openwith.launch.spec.ts.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';

// The apps page's Open with strings these tests name (copied: a page imports only another page's links.ts).
const ow = {
  'ow.chooser.cmdLabel': 'Other command',
  'ow.chooser.inTerminal': 'In a terminal',
  'ow.chooser.title': 'Open “{{file}}” with',
  'ow.chooser.titleAppHere': 'Launch an app in “{{file}}”',
} as const;

const APP = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const row = (page: Page, name: string) => paneA(page).locator('tbody tr').filter({ hasText: name });
const title = (file: string) => ow['ow.chooser.title'].replace('{{file}}', file);

async function axeClean(page: Page, scope: string) {
  const r = await new AxeBuilder({ page }).include(scope).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}
async function openWithFromRow(page: Page, name: string) {
  const r = row(page, name);
  await expect(r).toBeVisible();
  await r.getByRole('button', { name: kit['table.rowActions'] }).click();
  await page.getByRole('menuitem', { name: strings['ow.openWith'] }).click();
}

for (const [width, height] of [[390, 844], [1100, 800], [1440, 900]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`@openwith the row menu opens the drawer with the found programs (${width}, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoHub(page, APP, { theme });
      await openWithFromRow(page, 'server.js');
      const drawer = page.getByRole('dialog', { name: title('server.js') });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Nano', exact: true })).toBeEnabled();
      await expect(drawer.getByText(ow['ow.chooser.inTerminal'], { exact: true })).toBeVisible();
      await expect(drawer.getByRole('textbox', { name: ow['ow.chooser.cmdLabel'] })).toBeVisible();
      // No sideways scroll at any width.
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`openwith-drawer-${width}-${theme}.png`) });
      if (width === 1100) await axeClean(page, '[role="dialog"]');
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    });
  }
}

test('@openwith the pane bar\'s More menu offers a terminal or an app in the folder shown', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoHub(page, APP);
  await expect(row(page, 'server.js')).toBeVisible();
  await paneA(page).getByRole('button', { name: strings['action.more'], exact: true }).click();
  await expect(page.getByRole('menuitem', { name: strings['ow.here'] })).toBeVisible();
  await page.getByRole('menuitem', { name: strings['ow.appHere'] }).click();
  await expect(page.getByRole('dialog', { name: ow['ow.chooser.titleAppHere'].replace('{{file}}', 'app') })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('openwith-apphere-1100.png') });
});

test('@openwith the Preview offers Open in Nano once its check found it, and Open with…', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, APP);
  await expect(row(page, 'server.js')).toBeVisible();
  await row(page, 'server.js').getByRole('button', { name: kit['table.rowActions'] }).click();
  await page.getByRole('menuitem', { name: strings['action.preview'] }).click();
  const preview = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'server.js', exact: true }) });
  await expect(preview.getByRole('button', { name: 'Open in Nano' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('openwith-preview-390.png') });
  await preview.getByRole('button', { name: strings['ow.openWith'] }).click();
  await expect(page.getByRole('dialog', { name: title('server.js') })).toBeVisible();
});

test('@openwith a key that cannot start programs: the Preview keeps Open with…, off, with the reason', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoHub(page, APP, { state: 'tokenRead' });
  await expect(row(page, 'server.js')).toBeVisible();
  await row(page, 'server.js').getByRole('button', { name: kit['table.rowActions'] }).click();
  // Keyboard: the Preview opens on press-start, and its scrim then covers the menu item a pointer click retries on.
  await page.getByRole('menuitem', { name: strings['action.preview'] }).press('Enter');
  const preview = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'server.js', exact: true }) });
  const button = preview.getByRole('button', { name: strings['ow.openWith'] });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(/This key can't start programs on this computer\./);
  // No program offer without exec (Files' own Open in viewer stays).
  await expect(preview.getByRole('button', { name: 'Open in Nano' })).toHaveCount(0);
  await expect(preview.getByRole('button', { name: strings['action.view'] })).toBeVisible();
});
