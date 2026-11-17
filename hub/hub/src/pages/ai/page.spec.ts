// Playwright: the ai page's flows on fixtures (run by hub:check --page ai).
import { type Page, expect } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, test } from '@app/e2e';
import kit from '@kit/pickers/ModelChooser.strings.en.json';
import strings from './strings.en.json';

test('the page shows what the computer uses and the connected accounts', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  await expect(page.getByText(strings['def.helper'], { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('OpenAI').first()).toBeVisible(); // OpenAI is both an account row and a spending model name; the accounts table is the one asserted
});

test('Connect an account opens the provider directory and Esc closes it', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  await page.getByRole('button', { name: strings['connect.open'] }).first().click(); // the header button; the empty-state button repeats it
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: kit['dir.endpoint'], exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the key step takes a key in a password field and keeps Check and save off until one is typed', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?connect=google');
  const field = page.getByLabel(/API key/);
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('');
  await expect(page.getByRole('button', { name: strings['key.save'] })).toBeDisabled();
  await field.fill('sk-fixture-0000000000000000');
  await expect(page.getByRole('button', { name: strings['key.save'] })).toBeEnabled();
});

test('Change opens the picker, a pick shows what changes before it saves', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?pick=helper');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('option', { name: /GPT-5/ }).first().click(); // the chooser's Ready view ; the first GPT-5 option is OpenAI's
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('button', { name: strings['impact.save'] })).toBeVisible();
});

test('a send that may have gone through says so and offers Check again', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?pick=helper', { state: 'pending' });
  await page.getByRole('dialog').getByRole('option', { name: /GPT-5/ }).first().click(); // same chooser: the first GPT-5 option is the one saved
  await page.getByRole('button', { name: strings['impact.save'] }).click();
  await expect(page.getByRole('alert').filter({ hasText: strings['def.notConfirmed'] }).first()).toBeVisible(); // the banner under the row is the alert; a toast may repeat it, so the first is enough
});

test('Escape from the default-model confirm returns focus to that row\'s Change button', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?pick=helper');
  await page.getByRole('dialog').getByRole('option', { name: /GPT-5/ }).first().click(); // same chooser as above
  await expect(page.getByRole('button', { name: strings['impact.save'] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-def-change="helper"]')).toBeFocused();
});

test('the command palette connects a provider directly', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?connect=openai');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(strings['connect.chatgpt']) })).toBeVisible();
});

test('the Spending period changes the rows and survives a reload', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models?section=spending');
  await expect(page.getByText('gpt-3.5-turbo')).toBeVisible();
  await page.getByText(strings['spend.p.d30'], { exact: true }).click();
  await expect(page).toHaveURL(/period=30d/);
  await expect(page.getByText('gpt-3.5-turbo')).toHaveCount(0);
  await page.reload();
  await page.locator('#hub-main').waitFor(); // the reload boots the whole app again, as gotoHub waits for it
  await expect(page).toHaveURL(/period=30d/);
  await expect(page.getByRole('radio', { name: strings['spend.p.d30'] })).toBeChecked();
  // The 30-day rows are back after the reload: GPT-5 (the row draws the model's name) is their second row.
  await expect(page.getByRole('table', { name: strings['spend.title'] }).getByRole('cell', { name: 'GPT-5', exact: true })).toBeVisible();
  await expect(page.getByText('gpt-3.5-turbo')).toHaveCount(0);
});

// OpenAI is the connected account with a key to test and disconnect; its row owns its own menu button.
const openAccountMenu = (page: Page) => page.getByRole('row', { name: /OpenAI/ }).getByRole('button', { name: 'Row actions' }).click();

test('Test shows its result in the account row for a few seconds, then clears', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: strings['acc.act.test'] }).click();
  await expect(page.getByText(strings['acc.testValid']).first()).toBeVisible(); // the Test result shows in the row and in the live region; the row is the first
  await expect(page.getByText(strings['acc.testValid'])).toBeHidden({ timeout: 12000 });
});

test('Disconnect opens a dialog that says what stops and what does not switch', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: strings['acc.act.disconnect'] }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  // In the dialog: the page's FAQ answer says the same sentence.
  await expect(page.getByRole('alertdialog').getByText(strings['dis.nothingSwitches'], { exact: false })).toBeVisible();
});

test('searching the Accounts table does not move the Spending table: each keeps its own search', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  await expect(page.getByRole('table').getByText('OpenAI').first()).toBeVisible(); // OpenAI also names a spending model; the first match is the account row
  await page.getByRole('searchbox').first().fill('open'); // the Accounts search comes before Spending's in the page
  await expect(accountsTable(page).getByText('Hoody AI')).toHaveCount(0); // the Accounts rows narrowed
  await expect(page.getByRole('searchbox').nth(1)).toHaveValue(''); // Spending's own search is untouched
  await expect(page).not.toHaveURL(/[?&](acc)?q=/);
});

const accountsTable = (page: Page) => page.getByRole('table', { name: strings['acc.title'] });

/** The Accounts search box: the table's own toolbar (Spending has another search box on the page). */
const accountsBox = (page: Page) => accountsTable(page).locator('xpath=ancestor::*[.//input[@type="search"]][1]').getByRole('searchbox');
const accountRows = (page: Page) => accountsTable(page).locator('tbody tr');

test('@search the Accounts search narrows the rows and never writes its URL key', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: 'acc', box: accountsBox(page) }, {
    text: 'openai',
    searched: async () => {
      await expect(accountRows(page)).toHaveCount(1);
      await expect(accountRows(page).first()).toContainText('OpenAI');
    },
  });
});

test('@sort an Accounts column header sorts and keeps its own sort key', async ({ hubPage: page }) => {
  await gotoHub(page, '/ai/models');
  const header = accountsTable(page).getByRole('columnheader').first(); // the provider column heads the table
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]accsort=/);
});

test('@reload the Accounts search does not survive a reload', async ({ hubPage: page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link's accq searches once on load; the helper proves it is adopted and gone after the reload.
  await expectLinkSearchDroppedOnReload(page, { param: 'acc', box: accountsBox(page) }, {
    text: 'openai',
    path: '/ai/models',
    keep: { accsort: 'provider', accpage: '1' },
    searched: async () => {
      await expect(accountRows(page)).toHaveCount(1);
      await expect(accountRows(page).first()).toContainText('OpenAI');
    },
    unsearched: async () => {
      await expect(accountsTable(page).getByText('OpenAI')).toBeVisible(); // the rows have loaded
      await expect(accountsTable(page).getByText('Hoody AI')).toBeVisible(); // and the unsearched list is back
      await expect(accountRows(page)).toHaveCount(2);
    },
  });
});

test('the Accounts table shows how an account connects whole at 700, 900 and 1100 wide, and keeps Used by', async ({ hubPage: page }) => {
  test.slow(); // six page loads in one test
  const cases = [700, 900, 1100].flatMap(
    (w) =>
      [
        [w, undefined, strings['page.accIncluded']],
        [w, 'external', strings['page.accExternal']],
      ] as const,
  );
  for (const [i, [width, state, label]] of cases.entries()) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/ai/models', { state });
    const cell = accountsTable(page).getByRole('cell', { name: label });
    // First visit loads the screen's own chunk.
    await expect(cell).toBeVisible(i === 0 ? { timeout: 20_000 } : undefined);
    // Clipped = the cell or anything in it holds more than it shows.
    const clipped = await cell.evaluate((td) => [td, ...td.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1));
    expect(clipped, `"${label}" cut at ${width}px`).toBe(false);
    await expect(accountsTable(page).getByRole('columnheader', { name: strings['acc.used'] })).toBeVisible();
  }
});

test('the Accounts columns hold their own words down to their floors: no table width that keeps Used by cuts a label', async ({ hubPage: page }) => {
  test.slow(); // two page loads, each narrowed step by step
  // No viewport measured (820-1100 wide) gives the table its floors (below a content width of 840 the settings section
  // rail folds and the table widens), so the table's own box is narrowed from 600px, 2px at a time, while Used by is
  // kept, and past the point where it is shed: down to the floors' sum every column has its
  // floor and no more (floors under the words would cut "Key set outside Hoody" and "Not
  // known" at about 538-559). The words are measured in the run's own font, so a floor too small for it fails here.
  await page.setViewportSize({ width: 900, height: 900 });
  // external: an account whose key is set outside Hoody (the longest How it connects); partial: the Bot list fails, so
  // Used by says Not known.
  // The row measured: the external key's account (Anthropic), and in the partial state OpenAI (Used by reads Not known on
  // every row there, so the row names the cell).
  for (const [state, label, account] of [['external', strings['page.accExternal'], 'Anthropic'], ['partial', strings['acc.usedUnknown'], 'OpenAI']] as const) {
    await gotoHub(page, '/ai/models', { state });
    const table = accountsTable(page);
    const cell = table.getByRole('row').filter({ hasText: account }).getByRole('cell', { name: label, exact: true });
    await expect(cell).toBeVisible({ timeout: 20_000 });
    const used = table.getByRole('columnheader', { name: strings['acc.used'] });
    let kept = 0;
    let shed = false;
    for (let w = 600; w >= 520; w -= 2) {
      await table.evaluate((tb, px) => { (tb.parentElement as HTMLElement).style.width = `${px}px`; }, w);
      await expect.poll(() => table.evaluate((tb) => Math.round(tb.getBoundingClientRect().width))).toBe(w);
      if ((await used.count()) === 0) { shed = true; break; } // narrower than the floors: a column is shed, the floors no longer hold
      kept++;
      const clipped = await cell.evaluate((td) => [td, ...td.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1));
      expect(clipped, `"${label}" cut at a ${w}px table`).toBe(false);
    }
    expect(kept).toBeGreaterThan(10); // the sweep reached the floors with Used by still there
    expect(shed).toBe(true); // and went past them: every width down to the floors' sum was checked
  }
});

test('@perf Change on the 7k catalogue: time to the chooser\'s first rows (evidence)', async ({ hubPage: page }, info) => {
  // The real chat catalogue (fixture state catalogue7k: 206 providers, 7,078 models). Recorded, never asserted.
  test.skip(process.env.HUB_PERF !== '1', 'HUB_PERF=1 only');
  test.setTimeout(180_000);
  const runs: number[] = [];
  await gotoHub(page, '/ai/models', { state: 'catalogue7k' });
  const change = page.locator('[data-def-change="helper"]');
  const drawer = page.getByRole('dialog', { name: strings['pick.title'] });
  for (let i = 0; i < 5; i++) {
    await expect(change).toBeEnabled({ timeout: 60_000 });
    const t0 = await page.evaluate(() => performance.now());
    await change.click();
    await drawer.getByRole('option').first().waitFor({ timeout: 60_000 }); // reason: any first row ends the measure
    runs.push((await page.evaluate(() => performance.now())) - t0);
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
  }
  const sorted = [...runs].sort((a, b) => a - b);
  info.annotations.push({ type: 'perf', description: `ai catalogue7k Change→first rows ms: ${runs.map((x) => x.toFixed(0)).join(', ')} (median ${sorted[2]!.toFixed(0)})` });
  expect(runs).toHaveLength(5);
});
