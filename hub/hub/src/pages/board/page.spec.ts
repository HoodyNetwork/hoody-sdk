// Playwright: the Board's flows on fixtures (run by hub:check --page board). Boards live in this browser's storage
// (hub_boards_v1, kept at sign-out, sealed per account by core's cryptStore), so each test starts from a first visit
// and builds what it needs.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const KEY = 'hub_boards_v1';
/**
 * Ready waits (tiles, sealing, a reload) have no cap of their own: the test's budget bounds them. A Board load takes
 * about 8 s on a quiet machine and over a minute with the CPU slowed 20x, so any fixed number here would be a guess.
 */
const READY = 0;
const terminal = (page: Page) => page.locator('iframe[title="terminal-1 on atlas"]');
const files = (page: Page) => page.locator('iframe[title="files-1 on atlas"]');
/** The split between the two tiles: the Board's own separator (the shell's Sidebar width handle is one too). */
const split = (page: Page) => page.getByRole('group', { name: strings.tiles }).getByRole('separator');
/** hub_boards_v1 as the browser holds it (Playwright's storage state, not page script). */
const stored = async (page: Page): Promise<string | null> =>
  (await page.context().storageState()).origins.flatMap((o) => o.localStorage).find((e) => e.name === KEY)?.value ?? null;

/** The stored Board once it holds a sealed value other than `prev` and has stopped changing (sealing is asynchronous). */
async function settled(page: Page, prev: string | null): Promise<string> {
  let last = null as string | null; // set inside the poll, so not narrowed to null
  await expect.poll(async () => {
    const v = await stored(page);
    const still = v !== null && v !== prev && v === last;
    last = v;
    return still;
  }, { intervals: [400], timeout: READY }).toBe(true);
  return last ?? '';
}

/** Every Board in `raw` is a sealed leaf (version, key id, IV, ciphertext): no program, computer, URL or token in clear. */
function expectSealed(raw: string): void {
  const doc = JSON.parse(raw) as { v: number; a: Record<string, Record<string, unknown>> };
  const leaves = Object.values(doc.a).flatMap((parts) => Object.values(parts));
  expect(leaves.length).toBeGreaterThan(0);
  for (const leaf of leaves) expect(Object.keys(leaf as object).sort()).toEqual(['ct', 'iv', 'k', 'v']);
  // Outside the base64 fields (where any short word can occur by chance), nothing of the Board is readable.
  expect(raw.replace(/"(ct|iv|k)":"[^"]*"/g, '')).not.toMatch(/https?:|token|files|terminal|atlas/i);
}

/** The strip's or the empty slot's Add a program (the chips row's + has the same name and comes after them). */
const openAdd = (page: Page) => page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own

async function addProgram(page: Page, program: RegExp, session?: RegExp) {
  await page.getByRole('row', { name: /^atlas/ }).click();
  await page.getByRole('row', { name: program }).click();
  if (session) await page.getByRole('row', { name: session }).click();
}

/** Main with terminal-1 and files-1 on atlas, side by side. */
async function twoTiles(page: Page) {
  await gotoHub(page, '/board');
  await openAdd(page);
  await addProgram(page, /^Terminal/, /^terminal-1/);
  await expect(terminal(page)).toBeAttached({ timeout: READY });
  const one = await settled(page, null);
  await page.getByRole('group', { name: strings.tiles }).focus();
  await page.keyboard.press('s');
  await addProgram(page, /^Files/);
  await expect(files(page)).toBeAttached({ timeout: READY });
  expectSealed(await settled(page, one));
}

test('a first visit shows Main with one primary Add a program', async ({ page }) => {
  await gotoHub(page, '/board');
  await expect(page.getByRole('tab', { name: /Main/ })).toBeVisible();
  await expect(page.getByText(strings['empty.first'])).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test('two tiles side by side survive a reload, and storage holds them sealed: no URL, token or program in clear', async ({ page }) => {
  test.slow(); // builds two tiles, waits for each seal, then reloads
  await twoTiles(page);
  await expect(split(page)).toHaveAttribute('aria-valuetext', '50 %', { timeout: READY });
  const before = await stored(page);
  // The tiles are program iframes, and a reload's load event waits for every frame. The Board's own state is the
  // ready signal: 'commit' (the old page is gone), then both tiles and their split back from storage.
  await page.reload({ waitUntil: 'commit' });
  await expect(terminal(page)).toBeAttached({ timeout: READY });
  await expect(files(page)).toBeAttached({ timeout: READY });
  await expect(split(page)).toHaveAttribute('aria-valuetext', '50 %', { timeout: READY });
  expect(await stored(page)).toBe(before);
});

test('Boards survive sign-out and come back identical after signing in again', async ({ page }) => {
  await twoTiles(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
  expect(await stored(page)).toBe(before);
  await gotoHub(page, '/board');
  await expect(page.locator('iframe[title="terminal-1 on atlas"]')).toBeAttached();
  await expect(page.locator('iframe[title="files-1 on atlas"]')).toBeAttached();
  expect(await stored(page)).toBe(before);
});

test('x closes the active tile and u puts it back', async ({ page }) => {
  await twoTiles(page);
  await page.getByRole('group', { name: strings.tiles }).focus();
  await page.keyboard.press('x');
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.keyboard.press('u');
  await expect(page.locator('iframe')).toHaveCount(2);
});

test('a stopped computer shows its card with Start, never a frame', async ({ page }) => {
  await gotoHub(page, '/board');
  await openAdd(page);
  await page.getByRole('row', { name: /^cedar/ }).click();
  await page.getByRole('row', { name: /^Terminal/ }).click();
  await page.getByRole('row', { name: /^terminal-1/ }).click();
  await expect(page.getByRole('heading', { name: 'cedar is stopped' })).toBeVisible();
  await expect(page.getByRole('button', { name: strings['tile.start'] })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('Start with an unknown outcome says it may have gone through and offers Check again, never Start', async ({ page }) => {
  await gotoHub(page, '/board', { state: 'powerUnknown' });
  await openAdd(page);
  await page.getByRole('row', { name: /^cedar/ }).click();
  await page.getByRole('row', { name: /^Terminal/ }).click();
  await page.getByRole('row', { name: /^terminal-1/ }).click();
  await page.getByRole('button', { name: strings['tile.start'] }).click();
  await expect(page.getByRole('heading', { name: strings['tile.startUnknown'] })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(page.getByRole('button', { name: strings['tile.start'], exact: true })).toHaveCount(0);
});
