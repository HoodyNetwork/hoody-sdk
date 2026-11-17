// Playwright: the Apps tab of Programs (pages/apps/launch AppsSection), on the apps fixtures.
// They replace the old pages/apps/page.spec.ts flows; the old /apps links are tested there (pages/apps/page.spec.ts).
// The Apps tab's URL keys carry the "app" prefix (appq, appf, appsort, apppage, appsel); Launch an app is
// launch=1 (+ launchq).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
// The apps page's strings these tests name (a page imports only another page's links.ts, so they are copied).
const apps = {
  'filter.state': 'State',
  'filter.stopped': 'Stopped',
  'launch.action': 'Launch an app',
  'launch.search': 'Search apps, programs and coding agents',
  'launch.title': 'Launch an app',
  'tab.find': 'Find apps',
  'tab.open': 'Opened apps',
  search: 'Search opened apps', // the box's placeholder (its accessible name is the kit's "Search")
} as const;

const openTable = (page: Page) => page.getByRole('table', { name: apps['tab.open'] });

test('apps: select an open app, then Back returns to the list', async ({ page }) => {
  await gotoHub(page, '/programs?tab=apps');
  await openTable(page).getByRole('row', { name: /JupyterLab/ }).click();
  await expect(page).toHaveURL(/appsel=a1b2c3/);
  await expect(page.getByText('jupyter lab --no-browser')).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/appsel=/);
});

test('apps: Launch an app finds an app across sources', async ({ page }) => {
  await gotoHub(page, '/programs?tab=apps');
  await page.getByRole('button', { name: apps['launch.action'] }).first().click(); // the header button; the empty state repeats it when no app is open
  const find = page.getByRole('dialog', { name: apps['launch.title'] });
  await find.getByRole('searchbox', { name: apps['launch.search'] }).fill('jupyter');
  await expect(find.getByRole('table', { name: apps['tab.find'] }).getByText('jupyter/base-notebook')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]launchq=/);
});

test('apps: search narrows the Open list and never writes ?appq', async ({ page }) => {
  await gotoHub(page, '/programs?tab=apps');
  await page.getByPlaceholder(apps.search).fill('jupy');
  await expect(openTable(page).getByRole('row', { name: /JupyterLab/ })).toBeVisible();
  await expect(openTable(page).getByRole('row', { name: /htop/ })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]appq=/);
});

test('apps: chip, sort, page and the open row survive a reload, the search does not', async ({ page }) => {
  await gotoHub(page, '/programs?tab=apps&appq=note&appf=stopped&appsort=name&apppage=2&appsel=e00059', { state: 'long' });
  // The link's appq searches once on load, then the view drops it from the URL.
  await expect(page.getByPlaceholder(apps.search)).toHaveValue('note');
  await expect(page).not.toHaveURL(/[?&]appq=/);
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page.getByPlaceholder(apps.search)).toHaveValue('');
  await expect(page).not.toHaveURL(/[?&]appq=/);
  await expect(page).toHaveURL(/[?&]appf=stopped/);
  await expect(page).toHaveURL(/[?&]appsort=name/);
  await expect(page).toHaveURL(/[?&]apppage=2/);
  await expect(page.getByRole('heading', { name: 'notebook-60' })).toBeVisible();
  // Without a search to lose, the same chip, sort and page show the same Open rows after a reload.
  await gotoHub(page, '/programs?tab=apps&appf=stopped&appsort=name&apppage=2', { state: 'long' });
  await expect(openTable(page).locator('tbody tr').first()).toBeVisible();
  const rows = () => openTable(page).locator('tbody tr').allInnerTexts();
  const before = await rows();
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect.poll(rows).toEqual(before);
});

test('apps: the State chip filters the rows and keeps ?appf', async ({ page }) => {
  await gotoHub(page, '/programs?tab=apps');
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: apps['filter.state'] }).click();
  await page.getByRole('menuitemradio', { name: apps['filter.stopped'], exact: true }).click();
  await expect(page).toHaveURL(/[?&]appf=stopped/);
  await expect(openTable(page).getByRole('row', { name: /Shared folder/ })).toBeVisible();
  await expect(openTable(page).getByRole('row', { name: /JupyterLab/ })).toHaveCount(0);
});
