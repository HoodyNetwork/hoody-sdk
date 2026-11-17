// Playwright: a stacked group header's targets meet WCAG 2.5.8 (24 x 24 CSS px) on a fine pointer, where
// --touch-min is 0: the title button (it wraps, so its height is auto) and the links and buttons on its second line (Notes:
// Open Notes, Try again, New note), which sit side by side. Measured on Notes (the stacked list with controls on the second
// line) and on the kit gallery's stacked table (title buttons only), then axe target-size on the Notes table. On a coarse
// pointer the title button keeps --touch-min and axe stays clean. Open Notes is a link in look: its address holds the
// computer's id, so the kit draws it as the secret ExtLink, a button with no href (kit Link); it is found by its
// words.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import notesStrings from '../../pages/notes/strings.en.json';

const TARGET = 24;
const STACKED = '[data-group-header="stacked"]';

/** Every box of the locator's matches, with what each says (for the failure message). */
async function boxes(loc: Locator) {
  const out: { name: string; w: number; h: number }[] = [];
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (!b) continue; // reason: a control the row has not laid out (a collapsed group) is not a target
    out.push({ name: (await el.innerText()).trim(), w: b.width, h: b.height });
  }
  return out;
}

/** The group title buttons: on the header rows (no data-row-id), so a row's own expand button is not one. */
const titles = (table: Locator) => table.locator(':scope > tbody > tr:not([data-row-id]) button[aria-expanded]');
const extras = (table: Locator) => table.locator('[data-group-extra] :is(a[href], button)');

async function notes(page: Page, state?: string) {
  await gotoHub(page, '/notes', state ? { state } : {});
  const table = page.locator(STACKED).first();
  await expect(table.locator('[data-group-extra]').getByText(notesStrings['action.openNotes'], { exact: true }).first()).toBeVisible({ timeout: 30_000 }); // reason: each computer's line draws its own Open Notes
  await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
  return table;
}

const targetSize = async (page: Page) =>
  (await new AxeBuilder({ page }).include(STACKED).withRules(['target-size']).analyze()).violations.flatMap((v) => v.nodes.map((n) => n.html));

test('@stacked on a fine pointer every stacked header target on Notes is at least 24 x 24 and axe target-size is clean', async ({ page }) => {
  const table = await notes(page);
  const t = await boxes(titles(table));
  const x = await boxes(extras(table));
  expect(t.length, 'the Notes table has group title buttons').toBeGreaterThan(0);
  expect(x.length, 'the Notes group lines have controls').toBeGreaterThan(0);
  for (const b of [...t, ...x]) {
    expect(b.h, `${b.name} height`).toBeGreaterThanOrEqual(TARGET);
    expect(b.w, `${b.name} width`).toBeGreaterThanOrEqual(TARGET);
  }
  expect(await targetSize(page)).toEqual([]);
});

test('@stacked on a fine pointer the kit gallery stacked table titles are at least 24 px high', async ({ page }) => {
  await gotoHub(page, '/_kit?tab=table');
  const table = page.locator(STACKED).first();
  await table.waitFor({ timeout: 30_000 });
  const t = await boxes(titles(table));
  expect(t.length).toBeGreaterThan(0);
  for (const b of t) expect(b.h, `${b.name} height`).toBeGreaterThanOrEqual(TARGET);
});

/** The second-line controls Notes draws only in some states (GroupNote.tsx), each named so a missing one fails: a stopped
 *  computer's Computers (default: cedar), a retryable read's Try again (mixed: harbor busy). `error` is not used: with no note
 *  anywhere the page draws its empty list, not the stacked table. */
const CONDITIONAL = [
  { state: 'default', name: notesStrings['action.computers'] },
  { state: 'mixed', name: notesStrings['action.tryAgain'] },
] as const;

for (const c of CONDITIONAL) {
  test(`@stacked on a fine pointer Notes (${c.state}) draws ${c.name} on a stacked header line at least 24 x 24`, async ({ page }) => {
    const table = await notes(page, c.state === 'default' ? undefined : c.state);
    const control = table.locator('[data-group-extra]').getByRole('button', { name: c.name }).first(); // reason: every computer that is not running draws its own Computers button; any one shows the stacked size
    await expect(control, `${c.name} on a stacked header line`).toBeVisible();
    const b = await control.boundingBox();
    expect(b, `${c.name} laid out`).not.toBeNull();
    expect(b!.height, `${c.name} height`).toBeGreaterThanOrEqual(TARGET);
    expect(b!.width, `${c.name} width`).toBeGreaterThanOrEqual(TARGET);
    expect(await targetSize(page)).toEqual([]);
  });
}

test.describe('stacked header targets on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 845 }, hasTouch: true, isMobile: true });

  test('@stacked the Notes title buttons keep --touch-min, the second line keeps its own sizes, and axe target-size stays clean', async ({ page }) => {
    const table = await notes(page);
    const touchMin = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.height = 'var(--touch-min)';
      document.body.append(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      return h;
    });
    expect(touchMin).toBeGreaterThanOrEqual(44);
    const t = await boxes(titles(table));
    expect(t.length).toBeGreaterThan(0);
    for (const b of t) expect(b.h, `${b.name} height`).toBeGreaterThanOrEqual(touchMin);
    // The second-line rule is fine-pointer only: on a coarse pointer a TextButton keeps its --touch-min box (the kit's coarse
    // rule) and a link-look control (Open Notes) keeps no minimum of its own, as before the 24 px rule.
    const second = await extras(table).evaluateAll(
      (els, open) => els.map((el) => ({ name: (el.textContent ?? '').trim(), link: (el.textContent ?? '').trim() === open, h: el.getBoundingClientRect().height, min: getComputedStyle(el).minBlockSize })),
      notesStrings['action.openNotes'],
    );
    expect(second.some((c) => c.link), 'the Notes second line has Open Notes').toBe(true);
    expect(second.some((c) => !c.link), 'the Notes second line has a button').toBe(true);
    for (const c of second) {
      if (c.link) expect(c.min, `${c.name} min height`).toBe('auto');
      else expect(c.h, `${c.name} height`).toBeGreaterThanOrEqual(touchMin);
    }
    expect(await targetSize(page)).toEqual([]);
  });

  test('@stacked a retryable read\'s Try again keeps the coarse --touch-min box', async ({ page }) => {
    const table = await notes(page, 'mixed');
    const retry = table.locator('[data-group-extra]').getByRole('button', { name: notesStrings['action.tryAgain'] }).first(); // reason: every retryable failed read draws its own Try again; the first one shows the coarse size
    await expect(retry).toBeVisible();
    const touchMin = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.height = 'var(--touch-min)';
      document.body.append(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      return h;
    });
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(touchMin);
  });
});
