// Playwright: the notes page's flows on fixtures (run by hub:check --page notes).
// The five tagged tests are the functional e2e every list page keeps (@search @filter @sort @reload @no-match).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, noSideScroll } from '@app/e2e';
import kit from '@kit/strings.en.json';
import strings from './strings.en.json';

const ATLAS = 'c0a7150000000000000000a1';
const BOREALIS = 'c0a7150000000000000000b2';
const table = (page: Page) => page.getByRole('table', { name: strings.table });
const newNote = (page: Page) => page.getByRole('button', { name: strings['action.new'] }).first(); // header New note precedes the per-computer group-row copies
const navLink = (page: Page) => page.getByRole('link', { name: strings.nav }).first(); // sidebar Notes link precedes the second one lower on the page
const dataRows = (page: Page) => table(page).locator('tbody tr[data-row-id]');

test('@search the search box narrows the rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/notes');
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  // 'deploy' is only atlas's "Deploy checklist" in the default fixtures.
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'deploy',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/deploy/i);
    },
  });
});

test('@filter the Computer chip shows one computer and keeps ?computer', async ({ page }) => {
  await gotoHub(page, '/notes');
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await page.getByRole('group', { name: kit['table.filters'] }).getByRole('button', { name: strings['filter.computer'] }).click();
  await page.getByRole('menuitemradio', { name: 'borealis' }).or(page.getByRole('menuitem', { name: 'borealis' })).first().click(); // a menu item matches by either role
  await expect(page).toHaveURL(new RegExp(`[?&]computer=${BOREALIS}`));
  await expect(page.getByText('Staging release notes')).toBeVisible();
  await expect(page.getByText('Weekly plan')).toHaveCount(0);
});

test('@sort a column header sorts the rows and keeps ?sort', async ({ page }) => {
  await gotoHub(page, `/notes?computer=${ATLAS}`);
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  const header = table(page).getByRole('columnheader', { name: strings['col.title'] });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?title/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const names = await dataRows(page).locator('td:first-child').allInnerTexts();
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect([names, [...names].reverse()]).toContainEqual(sorted);
});

test('@page the pager moves to page 2, keeps ?page and shows the next rows', async ({ page }) => {
  await gotoHub(page, '/notes', { state: 'pages' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  const first = await dataRows(page).first().innerText(); // the first row stands for "the rows loaded"
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first); // the first row stands for "the rows loaded"
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload filter, sort and page survive a reload, the search does not', async ({ page }) => {
  test.slow(); // a reload, then the helper's settle windows
  await gotoHub(page, `/notes?page=2`, { state: 'pages' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page).toHaveURL(/page=2/);
  // The link brings the search with the Computer chip and the sort (borealis has four notes, so page 2 shows the last
  // page); the helper proves the search is adopted and gone after the reload while every kept key keeps its value.
  // 'notes' is the sidebar's link text and sits in two titles, so the term is 'release': only "Staging release notes".
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'release',
    path: '/notes',
    keep: { computer: BOREALIS, sort: 'title', page: '2' },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText('Staging release notes');
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(4);
    },
    after: async () => {
      await expect(page.getByText('Staging release notes')).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/notes');
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(page.getByText(kit['table.noMatch'])).toBeVisible();
  await page.getByRole('button', { name: kit['table.clearFilters'] }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('each computer says what its Notes answered', async ({ page }) => {
  await gotoHub(page, '/notes');
  await expect(page.getByText(strings['state.older'])).toBeVisible();
  await expect(page.getByText(strings['state.stopped']).first()).toBeVisible(); // several computers show this; one is enough
  await expect(page.getByText(strings['state.empty'])).toBeVisible();
});

test('a computer\'s header is one line: its name and count, Open Notes, and New note at the line\'s end', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/notes');
    await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
    await expect(table(page)).not.toHaveAttribute('data-group-header', 'stacked');
    const header = table(page).locator('tbody tr').filter({ has: page.getByRole('button', { name: /^atlas \d/i }) });
    const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
    const name = await box(header.getByRole('button', { name: /atlas/i }));
    const open = await box(header.getByRole('button', { name: new RegExp(`^${strings['action.openNotes']}`) })); // a new-tab link drawn as a button
    const add = await box(header.getByRole('button', { name: strings['action.newHere'] }));
    const row = await box(header);
    // All three share the line: each one's middle sits within the name button's height.
    for (const b of [open, add]) {
      expect(b.y + b.height / 2).toBeGreaterThan(name.y);
      expect(b.y + b.height / 2).toBeLessThan(name.y + name.height);
    }
    // Open Notes follows the name, one gap (--sp-3) after it; New note ends the line (within the row's end padding).
    expect(open.x).toBeGreaterThan(name.x + name.width);
    expect(open.x - (name.x + name.width)).toBeLessThan(16);
    expect(row.x + row.width - (add.x + add.width)).toBeLessThan(48);
    await noSideScroll(page);
  }
});

test('a computer\'s header with a state sentence: its actions keep the name\'s line at every width, only the sentence wraps', async ({ page }) => {
  // harbor: "No notes yet." with Open Notes and New note; granite: Notes too old, Open Notes only; cedar: stopped, with
  // Computers. At 1440 the sentence shares the name's line too; at 390 the kit's inline group header puts the sentence,
  // and only it, on a line of its own under the name, inside the header row: it wraps, never cut.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/notes');
    await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
    for (const [name, actions] of [['harbor', [strings['action.openNotes'], strings['action.newHere']]], ['granite', [strings['action.openNotes']]], ['cedar', [strings['action.computers']]]] as const) {
      const header = table(page).locator('tbody tr').filter({ has: page.getByRole('button', { name: new RegExp(`^${name} \\d`, 'i') }) });
      await header.scrollIntoViewIfNeeded();
      const row = (await header.boundingBox())!;
      const nameBox = (await header.getByRole('button', { name: new RegExp(`^${name}`, 'i') }).boundingBox())!;
      const sentence = (await header.locator('[data-group-text]').boundingBox())!;
      const boxes = [];
      for (const a of actions) boxes.push((await header.getByRole('button', { name: new RegExp(`^${a}`) }).boundingBox())!);
      for (const b of boxes) {
        expect(b.y).toBeGreaterThanOrEqual(row.y);
        expect(b.y + b.height).toBeLessThanOrEqual(row.y + row.height);
        expect(b.x).toBeGreaterThan(nameBox.x + nameBox.width);
        expect(b.x + b.width).toBeLessThanOrEqual(row.x + row.width);
        expect(b.y + b.height / 2).toBeGreaterThan(nameBox.y);
        expect(b.y + b.height / 2).toBeLessThan(nameBox.y + nameBox.height);
      }
      if (name === 'harbor') expect(row.x + row.width - (boxes[1]!.x + boxes[1]!.width)).toBeLessThan(48);
      expect(sentence.y + sentence.height).toBeLessThanOrEqual(row.y + row.height);
      if (width === 1440) {
        expect(sentence.y + sentence.height / 2).toBeGreaterThan(nameBox.y);
        expect(sentence.y + sentence.height / 2).toBeLessThan(nameBox.y + nameBox.height);
      } else {
        expect(sentence.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
      }
      // The sentence is whole: nothing in the header is ellipsis-cut.
      const cut = await header.evaluate((el) => [...el.querySelectorAll<HTMLElement>('*')].some((n) => getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth));
      expect(cut).toBe(false);
    }
    await noSideScroll(page);
  }
});

test('New note adds a note, closes, and opens that note beside the list', async ({ page }) => {
  await gotoHub(page, '/notes');
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  const dialog = page.getByRole('dialog', { name: strings['new.title'] });
  await dialog.getByLabel(strings['new.field']).fill('Q4 plan');
  await dialog.getByRole('button', { name: strings['new.create'] }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`[?&]sel=${ATLAS}(~|%7E)[0-9a-f]{22}08`));
  await expect(page.getByRole('button', { name: strings['action.openNoteTab'] })).toBeVisible();
  // The list was read again: the new note is a row, selected, and on screen.
  const row = table(page).locator('tbody tr[data-row-id]', { hasText: 'Q4 plan' });
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(row).toBeInViewport();
  await expect(page.getByText('Note created')).toHaveCount(0);
});

// The Title's quick-name clock sits inside the field box (as New Bot's re-roll), so nothing beside the
// box can sit off its line. Its box is within the field box's, at desktop and phone width.
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`New note: the quick-title button is inside the Title box at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await gotoHub(page, '/notes?new=1');
    const dialog = page.getByRole('dialog', { name: strings['new.title'] });
    const input = dialog.getByLabel(strings['new.field']);
    const btn = dialog.getByRole('button', { name: strings['new.quickTitleName'] });
    const frame = (await input.locator('xpath=..').boundingBox())!;
    const i = (await input.boundingBox())!;
    const b = (await btn.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(frame.y);
    expect(b.y + b.height).toBeLessThanOrEqual(frame.y + frame.height);
    expect(b.x).toBeGreaterThanOrEqual(i.x + i.width - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width);
    // Centred on the box's line (±1 px).
    expect(Math.abs(b.y + b.height / 2 - (frame.y + frame.height / 2))).toBeLessThanOrEqual(1);
    await btn.click();
    await expect(input).toHaveValue(/^Note /);
  });
}

test('an unknown New note takes Create away and offers Check again, which only reads', async ({ page }) => {
  await gotoHub(page, '/notes', { state: 'createPending' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  const dialog = page.getByRole('dialog', { name: strings['new.title'] });
  await dialog.getByLabel(strings['new.field']).fill('Q4 plan');
  await dialog.getByRole('button', { name: strings['new.create'] }).click();
  await expect(dialog.locator('[data-outcome="pending"]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: strings['new.create'] })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog.getByText(strings['new.unsure'])).toBeVisible();
});

test('closing an unknown New note does not free the next create: it offers Check again, never a second send', async ({ page }) => {
  await gotoHub(page, '/notes', { state: 'createPending' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  const dialog = page.getByRole('dialog', { name: strings['new.title'] });
  await dialog.getByLabel(strings['new.field']).fill('Q4 plan');
  await dialog.getByRole('button', { name: strings['new.create'] }).click();
  await expect(dialog.locator('[data-outcome="pending"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await newNote(page).click()
  await expect(dialog.locator('[data-outcome="pending"]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: strings['new.create'] })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('an unknown New note is still held after leaving the page and coming back', async ({ page }) => {
  await gotoHub(page, '/notes', { state: 'createPending' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  const dialog = page.getByRole('dialog', { name: strings['new.title'] });
  await dialog.getByLabel(strings['new.field']).fill('Q4 plan');
  await dialog.getByRole('button', { name: strings['new.create'] }).click();
  await expect(dialog.locator('[data-outcome="pending"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  // Away and back: the held create lives in the account's preferences, not in the page.
  await gotoHub(page, '/', { state: 'createPending' });
  await page.locator('#hub-main').waitFor();
  await navLink(page).click()
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  await expect(dialog.getByRole('button', { name: strings['new.create'] })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('a refused New note says nothing was added', async ({ page }) => {
  await gotoHub(page, '/notes', { state: 'createFailed' });
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await newNote(page).click()
  const dialog = page.getByRole('dialog', { name: strings['new.title'] });
  await dialog.getByLabel(strings['new.field']).fill('Q4 plan');
  await dialog.getByRole('button', { name: strings['new.create'] }).click();
  await expect(dialog.locator('[data-outcome="failed"]')).toBeVisible();
  await expect(dialog.getByText(strings['new.cantAdd'])).toBeVisible();
});

test('the computer chosen last time comes back when the URL names none, and the URL still wins', async ({ page }) => {
  await gotoHub(page, `/notes?computer=${BOREALIS}`);
  await expect(page.getByText('Staging release notes')).toBeVisible();
  // Leave the page (a fresh load keeps the browser's storage) and come back through the menu: no ?computer.
  await gotoHub(page, '/');
  await page.locator('#hub-main').waitFor();
  await navLink(page).click()
  await expect(page).toHaveURL(new RegExp(`computer=${BOREALIS}`));
  await expect(page.getByText('Weekly plan')).toHaveCount(0);
  // The URL wins over what was kept.
  await gotoHub(page, `/notes?computer=${ATLAS}`);
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect(page.getByText('Weekly plan')).toBeVisible();
  await expect(page.getByText('Staging release notes')).toHaveCount(0);
});

// Narrow and dark: the table never scrolls the page sideways and the group rows stay readable.
for (const [w, h] of [[1024, 768], [768, 1024], [390, 844]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`fits ${w}px in ${theme} without sideways page scroll`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await gotoHub(page, '/notes', { theme });
      await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
      await expect(page.getByText(strings['state.older'])).toBeVisible();
      await noSideScroll(page);
      await page.screenshot({ path: info.outputPath(`notes-${w}-${theme}.png`) });
    });
  }
}

test('a computer id from another realm in the URL is dropped, not kept as this realm\'s choice', async ({ page }) => {
  await gotoHub(page, '/notes?computer=c0a7150000000000000000ff');
  await expect(dataRows(page).first()).toBeVisible(); // the first row stands for "the rows loaded"
  await expect(page).not.toHaveURL(/[?&]computer=/);
});
