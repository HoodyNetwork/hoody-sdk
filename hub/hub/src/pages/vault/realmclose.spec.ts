// Playwright guard: a realm
// switch while a drawer opened by its button (its own history entry, closed by stepping Back) holds unsaved text closes
// the drawer: no "Discard changes?", nothing saved, the new realm's list shown. And a person cannot reach a realm switch
// with the drawer open: the switcher press is the drawer's dismiss (its guard asks first), Alt+R opens nothing over it,
// and another tab's realm switch does not move this tab.
// Known and left as is (script-only): a switch fired by script in the same task as a Back steps Back twice
// (closeEdit reads the drawer's entry before the person's Back lands; the tab leaves the page), and a switch from a
// Replace drawer opened over an entry brings that entry's ?sel back. Neither is reachable by a person, so neither is
// asserted here. Another tab's sign-out: realmclose-superseded.spec.ts.
// The CPU is throttled 4x; each case records the tab's URL, history length, router state and navigations.
import { type Page, type TestInfo, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const RUNS = 5;
// Throttled flows take longer than the default per-test budget.
test.describe.configure({ timeout: 90_000 });
const OTHER = 'Acme client';
const table = (page: Page) => page.getByRole('table', { name: strings.title });
const switcher = (page: Page) => page.locator('header [data-hub-switch="realm"]');

type Snap = { at: string; href: string; length: number; state: unknown };

async function snap(page: Page, at: string): Promise<Snap> {
  try {
    return await page.evaluate((a) => ({ at: a, href: location.href, length: history.length, state: history.state as unknown }), at);
  } catch (e) {
    return { at, href: `(unreadable: ${String(e).slice(0, 120)})`, length: -1, state: null };
  }
}

/** The tab's diagnostics: snapshots plus every main-frame navigation, attached whatever the outcome. */
function diagnose(page: Page) {
  const snaps: Snap[] = [];
  const navs: string[] = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(`${Date.now()} ${f.url()}`); });
  return {
    take: async (at: string) => { snaps.push(await snap(page, at)); },
    attach: async (info: TestInfo) => {
      snaps.push(await snap(page, 'end'));
      await info.attach('history-diagnostics', { body: JSON.stringify({ snaps, navs }, null, 2), contentType: 'application/json' });
    },
  };
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

/** Opens the realm menu by script (the drawer is modal), so its items exist for the same-task switch. */
async function openRealmMenu(page: Page) {
  await page.evaluate(() => (document.querySelector('header [data-hub-switch="realm"]') as HTMLElement).click());
  await expect(page.locator('[role^="menuitem"]').filter({ hasText: OTHER }).first()).toBeAttached(); // reason: the menu's item for the other realm
}

/** The realm item's press, by script (the drawer is modal). */
async function switchByScript(page: Page) {
  await page.evaluate((other) => {
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find((el) => el.textContent?.includes(other));
    if (!item) throw new Error('realm item missing');
    item.click();
  }, OTHER);
}

async function expectClosedOnOther(page: Page, title: string, puts: string[]) {
  await expect(switcher(page)).toContainText(OTHER);
  await expect(page.getByRole('dialog', { name: title })).toHaveCount(0);
  // Give a late Back every chance to land and the guard to ask (throttled).
  await page.waitForTimeout(1200);
  await expect(page.getByText('Discard changes?')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: title })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/vault/);
  await expect(page).not.toHaveURL(/[?&](edit|sel)=/);
  await expect(table(page).getByRole('row', { name: /stripe-key/ })).toBeVisible();
  expect(puts).toEqual([]);
}

async function dirtyNew(page: Page) {
  await gotoHub(page, '/vault');
  await expect(table(page).getByRole('row', { name: /deploy\.notes/ })).toBeVisible();
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the header's New entry
  const name = page.getByRole('dialog', { name: strings['edit.newTitle'] }).getByLabel(strings['edit.name'], { exact: true });
  await name.click();
  await page.keyboard.type('typed-before-switch');
  await expect(name).toHaveValue('typed-before-switch');
}

for (let i = 1; i <= RUNS; i++)
  test(`New entry, unsaved, CPU 4x: a realm switch closes it with no discard question (run ${i})`, async ({ page }, info) => {
    const d = diagnose(page);
    const puts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'PUT') puts.push(r.url()); });
    try {
      await throttle(page);
      await dirtyNew(page);
      await openRealmMenu(page);
      await d.take('drawer open, menu open');
      await switchByScript(page);
      await d.take('right after the switch');
      await expectClosedOnOther(page, strings['edit.newTitle'], puts);
    } finally {
      await d.attach(info);
    }
  });

test('a person pressing the realm switcher with an unsaved drawer open gets the drawer guard first', async ({ page }) => {
  await dirtyNew(page);
  await switcher(page).click({ force: true });
  await expect(page.getByText('Discard changes?')).toBeVisible();
  await expect(switcher(page)).not.toContainText(OTHER);
});

// The other ways a realm switch could reach a tab whose drawer is open:
// - another tab switching realm: the choice is stored for the next start only; no storage or broadcast listener moves
//   an open tab, so this tab keeps its realm and its drawer (and the unsaved text);
// - Alt+R (the realm switcher's key): the shell gives no key to the page while an overlay is open;
// - the command palette (Ctrl/Cmd+K opens over a drawer) has no realm command; a ?open_realm= link needs a press
//   outside the modal drawer, which is the drawer's own dismiss.
test('another tab switching realm leaves this tab, its drawer and its unsaved text as they are', async ({ page, context }) => {
  await dirtyNew(page);
  const other = await context.newPage();
  await gotoHub(other, '/vault');
  await other.locator('header [data-hub-switch="realm"]').click();
  await other.locator('[role^="menuitem"]').filter({ hasText: OTHER }).first().click(); // reason: the menu's item for the other realm
  await expect(other.locator('header [data-hub-switch="realm"]')).toContainText(OTHER);
  await page.bringToFront();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole('dialog', { name: strings['edit.newTitle'] });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel(strings['edit.name'], { exact: true })).toHaveValue('typed-before-switch');
  await expect(switcher(page)).not.toContainText(OTHER);
  await expect(page.getByText('Discard changes?')).toHaveCount(0);
});

test('Alt+R with an unsaved drawer open opens no realm menu', async ({ page }) => {
  await dirtyNew(page);
  await page.keyboard.press('Alt+KeyR');
  await page.waitForTimeout(500);
  await expect(page.locator('[role^="menuitem"]').filter({ hasText: OTHER })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: strings['edit.newTitle'] })).toBeVisible();
});
