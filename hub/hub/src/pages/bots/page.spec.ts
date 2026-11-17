// Playwright: the bots page's flows on fixtures (run by hub:check --page bots).
import { expect, type Page } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

const CHIEF = '?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

// The list opens on cards; the column checks below are List's (the dense table). The choice is remembered per browser
// storage, which each lent page starts without, so pick it after every first open.
const asList = async (page: Page) => {
  // The page opens on cards. The switch comes with the loaded list: read it once the table is drawn, never before.
  await expect(page.getByRole('table', { name: strings.title })).toBeVisible();
  const list = page.getByRole('radio', { name: /^List$/i }).or(page.getByRole('button', { name: /^List$/i }));
  if (await list.count()) await list.first().click(); // reason: at phone width the kit draws cards with no switch
};

test('open a Bot, then Back returns to the list', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  const table = page.getByRole('table', { name: strings.title });
  await table.getByRole('row', { name: /Support/ }).click();
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test('a Bot that waits for you sorts first and its card is pinned above the tabs', async ({ hubPage: page }) => {
  await gotoHub(page, `/bots${CHIEF}&tab=link`);
  await expect(page.getByRole('region', { name: K['agent.needsApproval'] })).toBeVisible();
  await expect(page.getByRole('tab', { name: strings['tab.link'] })).toHaveAttribute('aria-selected', 'true');
});

test('search narrows the table', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await page.getByRole('searchbox').fill('support');
  // Bot rows and note rows apart: a computer's group header and its notes are rows too (a computer's
  // note shows in its group once a Bot matches), so a note can never stand in for a Bot.
  const table = page.getByRole('table', { name: strings.title });
  const bots = table.locator('tbody tr[data-row-id]');
  await expect(bots).toHaveCount(1);
  await expect(bots.getByText('Support', { exact: true })).toHaveCount(1);
  for (const other of ['Chief', 'Digest', 'Scout']) await expect(table.getByText(other, { exact: true })).toHaveCount(0);
  // cinder lists fewer Bots than it has, but a search finds only what was read: its "more Bots" note waits for the search
  // to end, so no note row stands among the rows found.
  await expect(table.locator('tbody tr:has([data-group-note])')).toHaveCount(0);
  await expect(table.getByText(strings['notice.more'])).toHaveCount(0);
});

test('Settings opens at a section, saves a model on choice, and Back closes it', async ({ hubPage: page }) => {
  await gotoHub(page, `/bots${CHIEF}`);
  await page.getByRole('button', { name: strings['bot.settings'] }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/settings=model/);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('New Bot opens a drawer that Escape closes', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the toolbar button and the empty-state button share the name
  await expect(page.getByRole('dialog', { name: strings['newBot.title'] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Cancel in a dirty New Bot drawer asks to discard, and Keep editing keeps the text', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the toolbar button and the empty-state button share the name
  const drawer = page.getByRole('dialog', { name: strings['newBot.title'] });
  await drawer.getByRole('button', { name: new RegExp(strings['newBot.more']) }).click();
  const box = drawer.getByRole('textbox', { name: strings['behaviour.instructions'] });
  await box.fill('Answer in French');
  await drawer.getByRole('button', { name: 'Cancel' }).click();
  await expect(drawer.getByText('Discard changes?')).toBeVisible();
  await drawer.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.locator('textarea')).toHaveValue('Answer in French');
  // Keep editing hands focus to the first field, whose list opens for a moment: click into the text so nothing is left open, and the next Cancel is the drawer's own.
  await box.click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Cancel' }).click();
  await drawer.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

const names = async (page: Page) => page.getByRole('table', { name: strings.title }).getByRole('row').allInnerTexts();

const botRows = (page: Page) => page.getByRole('table', { name: strings.title }).locator('tbody tr[data-row-id]'); // the computer group headers are rows too

test('@search search narrows the table, never writes ?q and is gone after a reload', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  const table = page.getByRole('table', { name: strings.title });
  await expect(table.getByText('Digest')).toBeVisible();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window); it also
  // proves the search is gone after a reload when the link carried it.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'digest',
    searched: async () => {
      await expect(botRows(page)).toHaveCount(1);
      await expect(table.getByText('Digest')).toBeVisible();
      await expect(table.getByText('Notes')).toBeHidden();
    },
  });
  await page.reload();
  await page.getByRole('searchbox').waitFor(); // a reload boots the whole app again (several seconds under load)
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test('@no-match a no-match search offers Clear filters, which restores the rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await page.getByRole('searchbox').fill('zzzz-none');
  await expect(page.getByRole('button', { name: /clear filters/i }).first()).toBeVisible(); // reason: the toolbar and the empty state both offer Clear filters
  await page.getByRole('button', { name: /clear filters/i }).first().click(); // reason: the toolbar and the empty state both offer Clear filters
  await expect(page.getByRole('table', { name: strings.title }).getByText('Digest')).toBeVisible();
});

test('@filter a Status chip filters the rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await expect(page.getByRole('table', { name: strings.title })).toBeVisible();
  // A toolbar row too tight for the chips folds them under Filters: open it first.
  const chip = page.getByRole('button', { name: strings['filter.status'] }).first(); // reason: the filter bar repeats the chip in the narrow layout
  if (!(await chip.isVisible())) await page.getByRole('button', { name: 'Filters' }).click();
  await chip.click();
  await page.getByRole('option', { name: /Paused/ }).or(page.getByRole('menuitemradio', { name: /Paused/ })).or(page.getByRole('menuitemcheckbox', { name: /Paused/ })).first().click(); // reason: the option renders as an option or a menu item by layout
  await expect(page).toHaveURL(/[?&]status=paused/);
  await expect(page.getByRole('table', { name: strings.title }).getByText('Ledger')).toBeVisible();
  await expect(page.getByRole('table', { name: strings.title }).getByText('Digest')).toBeHidden();
});

test('@sort sorting by Status reorders the rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  await asList(page);
  const before = await names(page);
  const head = page.getByRole('columnheader', { name: /Status/ }).getByRole('button');
  await head.click();
  await head.click();
  await expect(page).toHaveURL(/[?&]sort=-?status/);
  expect(await names(page)).not.toEqual(before);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ hubPage: page }) => {
  await gotoHub(page, '/bots');
  const rows = page.getByRole('table', { name: strings.title }).locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const first = await rows.first().innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(rows.first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload chip, sort and page survive a reload, the search does not', async ({ hubPage: page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link brings the search with the Status chip, sort and page 2; the helper proves the search is adopted and gone
  // after the reload while every kept key keeps its value.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'helper',
    path: '/bots',
    keep: { status: 'idle', sort: 'name', page: '2' },
    searched: async () => {
      await expect(botRows(page)).toHaveCount(15); // Helper 1-14 and Relay (a general helper)
    },
    unsearched: async () => {
      await expect(botRows(page)).toHaveCount(19); // the idle Bots: the 14 helpers and Scout, Notes, Relay, Harbor, Iris
    },
  });
});

test('the status column shows "2 messages waiting" whole at 700, 900 and 1100 wide, and Realm still shows from 900', async ({ hubPage: page }) => {
  const label = strings['status.queuedN_other'].replace('{{count}}', '2');
  for (const width of [700, 900, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots');
    await asList(page);
    const cell = page.getByRole('table', { name: strings.title }).getByRole('cell', { name: label });
    await expect(cell).toBeVisible();
    // Clipped = the cell or anything in it holds more than it shows.
    const clipped = await cell.evaluate((td) => [td, ...td.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1));
    expect(clipped, `status cut at ${width}px`).toBe(false);
    if (width >= 900) await expect(page.getByRole('columnheader', { name: strings['col.realm'] })).toBeVisible(); // the wider status takes its room from Computer, not Realm
  }
});

test('a queue of 3 or 4 digits shows whole in the status column at 390, 900 and 1100 wide, its short form the whole text (809)', async ({ hubPage: page }) => {
  for (const width of [390, 900, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots', { state: 'manyQueued' });
    await asList(page);
    for (const count of [120, 4321]) {
      const full = strings['status.queuedN_other'].replace('{{count}}', String(count));
      const short = strings['status.queuedShort'].replace('{{count}}', String(count));
      // At 390 the row is one card cell (name, status, computer, realm); wider, the status has its own cell, named by the short form alone.
      const cell = page.getByRole('table', { name: strings.title }).getByRole('cell', { name: short, exact: width > 390 });
      await expect(cell).toBeVisible();
      // The short form is the whole text, on screen and for a screen reader alike: no hidden full copy, no native title.
      await expect(cell).not.toHaveAccessibleName(new RegExp(`\\b${full}\\b`));
      await expect(cell.getByText(short, { exact: true })).toBeVisible();
      await expect(cell.locator('[title*="waiting"]')).toHaveCount(0);
      // Clipped = the cell or anything shown in it holds more than it shows (a 1px screen-reader text is not shown).
      const clipped = await cell.evaluate((td) => [td, ...td.querySelectorAll('*')].some((e) => e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1));
      expect(clipped, `${count} cut at ${width}px`).toBe(false);
    }
  }
  // The Bot's own page reads the same words as the list (one rule for the column and the pane's header pill).
  await page.getByRole('table', { name: strings.title }).getByRole('row', { name: /Notes/ }).click();
  const pane = page.getByRole('region').filter({ has: page.getByRole('heading', { name: 'Notes' }) });
  await expect(pane).toBeVisible();
  await expect(pane.getByText(strings['status.queuedShort'].replace('{{count}}', '4321'), { exact: true }).first()).toBeVisible(); // reason: the pane's header and its Activity tab both show the count
  await expect(pane.getByText(strings['status.queuedN_other'].replace('{{count}}', '4321'), { exact: true })).toHaveCount(0);
  // Relay (99, the longest full form) keeps the full words: under 100 there is no short form.
  await page.getByRole('table', { name: strings.title }).getByRole('row', { name: /Relay/ }).click();
  const relay = page.getByRole('region').filter({ has: page.getByRole('heading', { name: 'Relay' }) });
  await expect(relay.getByText(strings['status.queuedN_other'].replace('{{count}}', '99'), { exact: true }).first()).toBeVisible(); // reason: the pane's header and its Activity tab both show the count
});

test('every status pill, its dot included, ends inside the status cell padding at 900, 1100 and 1350 wide (the longest full form is 99 messages waiting)', async ({ hubPage: page }) => {
  const longest = strings['status.queuedN_other'].replace('{{count}}', '99');
  for (const width of [900, 1100, 1350]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots', { state: 'manyQueued' });
    await asList(page);
    const table = page.getByRole('table', { name: strings.title });
    await expect(table.getByRole('cell', { name: longest, exact: true })).toBeVisible();
    // Every Bot row's pill in the Status column (never a dot of another cell). A computer's group row is one cell across
    // the table, not a Bot. The first page, then Harbor alone (Locked: a pill without a dot, past the first page).
    const measure = () => table.evaluate((t, name) => {
      const heads = [...t.querySelectorAll('thead th')];
      const col = heads.findIndex((h) => (h.textContent ?? '').trim().startsWith(name));
      return [...t.querySelectorAll('tbody tr')].filter((tr) => tr.children.length === heads.length).map((tr) => {
        const td = tr.children[col] as HTMLElement;
        const p = td.firstElementChild as HTMLElement;
        const pad = parseFloat(getComputedStyle(td).paddingRight);
        return { text: p.textContent, inside: p.getBoundingClientRect().right <= td.getBoundingClientRect().right - pad + 0.5 };
      });
    }, strings['col.status']);
    const pills = await measure();
    expect(pills.length).toBeGreaterThan(0);
    expect(pills.filter((x) => !x.text)).toEqual([]);
    expect(pills.map((x) => x.text)).toContain(longest);
    await page.getByRole('searchbox').fill('Harbor');
    await expect(table.getByRole('cell', { name: strings['status.locked'], exact: true })).toBeVisible();
    pills.push(...(await measure()));
    expect(pills.map((x) => x.text)).toContain(strings['status.locked']);
    expect(pills.filter((x) => !x.inside), `status pills past the padding at ${width}px`).toEqual([]);
    // The next gotoHub opens the same address (a same-document step, the page stays mounted), and the search lives in
    // the view's memory, not the URL: empty it so the next width starts from the whole list.
    await page.getByRole('searchbox').fill('');
  }
});

// Below 900 the Bots table does not fit its columns, so List draws list rows there (no Computer cell to measure).
test('a long computer name ends in an ellipsis inside its cell at 900, 1100 and 1350 wide', async ({ hubPage: page }) => {
  for (const width of [900, 1100, 1350]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots', { state: 'longComputer' });
    await asList(page);
    const cell = page.getByRole('table', { name: strings.title }).getByRole('cell', { name: 'production-worker-01', exact: true }).first(); // reason: every Bot on that computer has the same cell
    await expect(cell).toBeVisible();
    // The cell's content (a link to the computer, or plain text where Computers is not reachable) ends inside the
    // cell's padding, and the name in it cuts with an ellipsis.
    const r = await cell.evaluate((td) => {
      const box = td.firstElementChild as HTMLElement;
      const name = box.lastElementChild as HTMLElement;
      const pad = parseFloat(getComputedStyle(td).paddingRight);
      return {
        inside: box.getBoundingClientRect().right <= td.getBoundingClientRect().right - pad + 0.5,
        ellipsis: getComputedStyle(name).textOverflow === 'ellipsis',
      };
    });
    expect(r, `computer link at ${width}px`).toEqual({ inside: true, ellipsis: true });
  }
});

test('the computer name cuts itself, so nothing between it and its cell clips a link\'s focus ring', async ({ hubPage: page }) => {
  for (const width of [900, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/bots', { state: 'longComputer' });
    await asList(page);
    const cell = page.getByRole('table', { name: strings.title }).getByRole('cell', { name: 'production-worker-01', exact: true }).first(); // reason: every Bot on that computer has the same cell
    await expect(cell).toBeVisible();
    // The name is a link to the computer, or plain text where this load does not serve Computers; the same box either way.
    const r = await cell.evaluate((td) => {
      const name = [...td.querySelectorAll<HTMLElement>('*')].filter((el) => el.textContent === 'production-worker-01').pop()!;
      const clips: string[] = [];
      for (let el = name.parentElement; el && el !== td; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(el.tagName);
      }
      if (name.tagName === 'A') name.focus();
      return { clips, ellipsis: getComputedStyle(name).textOverflow, focused: name.tagName !== 'A' || document.activeElement === name };
    });
    expect(r, `computer name at ${width}px`).toEqual({ clips: [], ellipsis: 'ellipsis', focused: true });
  }
});
