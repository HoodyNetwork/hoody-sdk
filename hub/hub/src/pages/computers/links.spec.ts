// Playwright: a computer leads to the other pages and every link resolves (never "Page not found"); the Realm and
// Plan dropdowns keep their state in the URL; `?new=1` and the empty states lead to getting a computer.
// Fixtures only: nothing reaches a real API.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { clearFilter, pickFilter } from '@app/e2e-toolbar';
import kitStrings from '@kit/strings.en.json';
import strings from './strings.en.json';

const main = (page: Page) => page.locator('#hub-main');
const table = (page: Page) => main(page).getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
// The detail's Project fact: once it shows, the detail (and its other-pages section, when any) is drawn.
const projectFact = (page: Page) => main(page).locator('dt', { hasText: new RegExp(`^${strings['fact.project']}$`) });
const notFound = (page: Page) => page.getByRole('heading', { name: kitStrings['page.notFound.title'] });

async function pick(page: Page, chip: string, option: string) {
  await pickFilter(main(page), chip, option);
}

const PLACES = [
  { id: 'files', path: '/files' },
  { id: 'schedules', path: '/schedules' },
  { id: 'logs', path: '/logs' },
  { id: 'keys', path: '/keys/ssh' },
  { id: 'board', path: '/board' },
  { id: 'bots', path: '/bots' },
] as const;

test('@links each other-page link of a computer resolves to its page: no Page not found, Files, Logs and Bots filtered to the computer', async ({ page }) => {
  // Every page is served now: seven real page loads, more than the default 30 s on a loaded host.
  test.slow();
  // Which of the seven this run serves, read apart from the section under test: a page the load does not serve answers
  // its path with Page not found (check.ts --page computers serves only this page; the full Hub serves them all).
  const served: (typeof PLACES)[number][] = [];
  for (const p of PLACES) {
    await gotoHub(page, p.path);
    await expect(main(page).getByRole('heading').first()).toBeVisible(); // reason: any heading means the route has drawn (its own page or Page not found)
    if (!(await notFound(page).count())) served.push(p);
  }
  await gotoHub(page, '/computers');
  const first = dataRows(page).first();
  await expect(first).toBeVisible();
  const handle = (await first.getAttribute('data-row-id')) ?? '';
  expect(handle).not.toBe('');
  const section = main(page).getByRole('navigation', { name: new RegExp(strings['goto.title'].replace('{{name}}', '.+')) });
  const openDetail = async () => {
    await gotoHub(page, `/computers?sel=${encodeURIComponent(handle)}`);
    // The detail's Project fact shows once the detail (and its other-pages section, when any) is drawn.
    await expect(projectFact(page)).toBeVisible();
  };
  await openDetail();
  // The section always holds this page's own tabs (programs, backups, addresses); the other pages follow what is served.
  await expect(section).toBeVisible();
  if (!served.length) return;
  // A page this load does not serve has no link in the section (never a dead link).
  for (const p of PLACES.filter((x) => !served.includes(x))) await expect(section.getByRole('link', { name: strings[`on.${p.id}`], exact: true })).toHaveCount(0);
  // Every served page has its link, and the link resolves.
  for (const p of served) {
    await openDetail();
    const link = section.getByRole('link', { name: strings[`on.${p.id}`], exact: true });
    await expect(link).toHaveCount(1);
    // The Hub routes by hash: the href is "#/programs" (or "/#/programs").
    const href = new URL(((await link.getAttribute('href')) ?? '').replace(/^\/?#/, ''), 'http://x');
    expect(href.pathname).toBe(p.path);
    if (p.id === 'files' || p.id === 'logs' || p.id === 'bots') expect(href.searchParams.get('computer')).toBe(handle);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${p.path.replace(/\//g, '\\/')}(\\?|$)`));
    await expect(main(page)).toBeVisible();
    await expect(notFound(page)).toHaveCount(0);
  }
});

test('@filter the Plan dropdown narrows to free or paid servers and survives a reload', async ({ page }) => {
  // Two filter picks and a reload: past the default 30 s budget on a loaded host.
  test.slow();
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  const all = await dataRows(page).count();
  await pick(page, strings['filter.plan'], strings['filter.plan.free']);
  await expect(page).toHaveURL(/[?&]plan=free/);
  const free = await dataRows(page).count();
  expect(free).toBeGreaterThan(0);
  for (const row of await dataRows(page).all()) await expect(row).toContainText('Ashburn');
  await page.reload();
  await expect(page).toHaveURL(/[?&]plan=free/);
  await expect(dataRows(page)).toHaveCount(free);
  await pick(page, strings['filter.plan'], strings['filter.plan.paid']);
  await expect(page).toHaveURL(/[?&]plan=paid/);
  await expect(dataRows(page)).toHaveCount(all - free);
  for (const row of await dataRows(page).all()) await expect(row).not.toContainText('Ashburn');
});

test('@filter the Realm dropdown keeps its choice in the URL across a reload, and its × clears it', async ({ page }) => {
  // A filter pick, a reload and a clear: past the default 30 s budget on a loaded host.
  test.slow();
  await gotoHub(page, '/computers');
  await expect(dataRows(page).first()).toBeVisible();
  const all = await dataRows(page).count();
  await pick(page, strings['filter.realm'], 'Lab');
  await expect(page).toHaveURL(/[?&]realm=/);
  const lab = await dataRows(page).count();
  expect(lab).toBeLessThanOrEqual(all);
  await page.reload();
  await expect(page).toHaveURL(/[?&]realm=/);
  await expect(dataRows(page)).toHaveCount(lab);
  await clearFilter(main(page), strings['filter.realm']);
  await expect(page).not.toHaveURL(/[?&]realm=/);
  await expect(dataRows(page)).toHaveCount(all);
});

test('@create ?new=1 opens Get a computer and drops the key, so a reload does not reopen it', async ({ page }) => {
  await gotoHub(page, '/computers?new=1');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]new=/);
});
