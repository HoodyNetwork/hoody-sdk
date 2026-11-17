// Playwright: the whole folder view of a pane takes a row drag from the other pane, with a real mouse. A short listing
// leaves most of the pane below its rows; a drop there, on the pane's folder bar, or on a file row of its table, goes
// into the folder the pane shows, and the whole pane is outlined while it is over it. A folder row still takes the drop
// into itself (panedrag.spec.ts). Where the other pane can't take the rows it says why beside the pointer (already
// there, a folder into itself), never a silent nothing. Esc, or a release outside the panes, leaves nothing behind.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const KEY = process.platform === 'darwin' ? 'Option' : 'Ctrl';
const two = (ap: string, bp: string) => `/files?a=atlas.00a1&ap=${encodeURIComponent(ap)}&b=atlas.00a1&bp=${encodeURIComponent(bp)}`;
const pane = (page: Page, k: 'a' | 'b') => page.getByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const rowOf = (p: Locator, name: string) => p.locator('[data-row-id]', { hasText: name }).first();
/** The pane's folder view: the outer drop frame (its table's frame sits inside it). */
const areaOf = (p: Locator) => p.locator('[data-drop-frame]').first();
const tableOf = (p: Locator) => p.locator('[data-drop-frame] [data-drop-frame]').first();
const hint = (page: Page) => page.locator('[data-drop-hint]');

/** Press on a row and drag it clear of its place: the drag has started. */
async function start(page: Page, from: Locator) {
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 3, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 3 + 12, a.y + a.height / 2 + 4, { steps: 4 });
}
/** Move the pressed pointer to a point, in steps, and rest there a moment. */
async function to(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.move(x + 3, y, { steps: 3 });
}
/** A point in the pane's folder view below its table: the room a short listing leaves. */
async function below(p: Locator): Promise<[number, number]> {
  const area = (await areaOf(p).boundingBox())!;
  const table = (await tableOf(p).boundingBox())!;
  const top = table.y + table.height;
  const bottom = area.y + area.height;
  expect(bottom - top).toBeGreaterThan(60);
  return [area.x + area.width / 2, (top + bottom) / 2];
}
const nothingLeft = async (page: Page) => {
  await expect(hint(page)).toHaveCount(0);
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await expect(page.locator('[data-dragging]')).toHaveCount(0);
};

/**
 * Playwright's WebKit ends a mouse drag so that the next press arrives without its pointerdown (traced: mousedown,
 * pointerup, mouseup, click; Chromium and Firefox send all five), and the kit Button starts a press only on
 * pointerdown, so that first click on the dialog's button is lost. In WebKit a press on the dialog's own edge (inert)
 * takes that press first. Not seen in a real Safari either way: this keeps the spec about the drag, not that quirk.
 */
async function firstPressAfterDrag(dialog: Locator, browserName: string) {
  if (browserName === 'webkit') await dialog.click({ position: { x: 2, y: 2 } });
}

test('a file dropped in the room below the other pane\'s short listing: the whole pane outlined, copied into its folder', async ({ page, browserName }) => {
  await gotoHub(page, two('/home/ada', '/home/ada/projects'));
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const notes = rowOf(a, 'notes.txt');
  await expect(notes).toBeVisible();
  await expect(rowOf(b, 'README.md')).toBeVisible();
  const [x, y] = await below(b);
  await start(page, notes);
  await to(page, x, y);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: KEY }));
  await expect(areaOf(b)).toHaveAttribute('data-drop-over', '');
  await expect(page.locator('[data-drop-over]')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('panearea-below.png') });
  await page.mouse.up();
  await nothingLeft(page);
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
  await expect(d.getByText(/ \/home\/ada\/projects\/notes\.txt$/)).toBeVisible();
  await firstPressAfterDrag(d, browserName);
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(b.getByRole('row', { name: /notes\.txt/ })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('panearea-after.png') });
});

test('a file dropped on the other pane\'s folder bar goes into the folder it shows', async ({ page }) => {
  await gotoHub(page, two('/home/ada', '/home/ada/projects'));
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const notes = rowOf(a, 'notes.txt');
  await expect(notes).toBeVisible();
  // The folder bar's path: the crumb of the folder above the one it shows.
  const crumbs = b.getByRole('link', { name: 'ada', exact: true });
  await expect(crumbs).toBeVisible();
  const c = (await crumbs.boundingBox())!;
  await start(page, notes);
  await to(page, c.x + c.width / 2, c.y + c.height / 2);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: KEY }));
  await expect(areaOf(b)).toHaveAttribute('data-drop-over', '');
  await page.mouse.up();
  await nothingLeft(page);
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
  await expect(d.getByText(/ \/home\/ada\/projects\/notes\.txt$/)).toBeVisible();
});

test('over a file row of the other pane\'s table: the same whole-pane outline (the folder it shows), the row not marked', async ({ page }) => {
  await gotoHub(page, two('/home/ada', '/home/ada/projects'));
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const notes = rowOf(a, 'notes.txt');
  const readme = rowOf(b, 'README.md');
  await expect(notes).toBeVisible();
  await expect(readme).toBeVisible();
  const r = (await readme.boundingBox())!;
  await start(page, notes);
  await to(page, r.x + r.width / 2, r.y + r.height / 2);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: KEY }));
  await expect(areaOf(b)).toHaveAttribute('data-drop-over', '');
  await expect(readme).not.toHaveAttribute('data-drop-over', '');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('right to left: a file from the right pane dropped below the left pane\'s short listing', async ({ page }) => {
  await gotoHub(page, two('/home/ada/projects', '/home/ada'));
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const notes = rowOf(b, 'notes.txt');
  await expect(notes).toBeVisible();
  await expect(rowOf(a, 'README.md')).toBeVisible();
  const [x, y] = await below(a);
  await start(page, notes);
  await to(page, x, y);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: KEY }));
  await expect(areaOf(a)).toHaveAttribute('data-drop-over', '');
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog').getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
});

test('the other pane showing the same folder says so beside the pointer; nothing is marked, nothing opens', async ({ page }) => {
  await gotoHub(page, two('/home/ada', '/home/ada'));
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  const report = rowOf(pane(page, 'b'), 'report.pdf');
  await expect(notes).toBeVisible();
  await expect(report).toBeVisible();
  const r = (await report.boundingBox())!;
  await start(page, notes);
  await to(page, r.x + r.width / 2, r.y + r.height / 2);
  await expect(hint(page)).toHaveText(fill(strings['drop.here'], { folder: 'ada' }));
  await expect(hint(page)).toHaveAttribute('data-drop-refused', '');
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('panearea-same-folder.png') });
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a folder dragged to a pane showing a folder inside it is refused with words', async ({ page }) => {
  await gotoHub(page, two('/home/ada', '/home/ada/projects/site'));
  const projects = rowOf(pane(page, 'a'), 'projects');
  await expect(projects).toBeVisible();
  await expect(rowOf(pane(page, 'b'), 'deploy.sh')).toBeVisible();
  const [x, y] = await below(pane(page, 'b'));
  await start(page, projects);
  await to(page, x, y);
  await expect(hint(page)).toHaveText(strings['drop.intoItself']);
  await expect(hint(page)).toHaveAttribute('data-drop-refused', '');
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Esc over the room below the listing, or a release outside the panes, leaves nothing behind and opens nothing', async ({ page }) => {
  await gotoHub(page, two('/home/ada', '/home/ada/projects'));
  const a = pane(page, 'a');
  const b = pane(page, 'b');
  const notes = rowOf(a, 'notes.txt');
  await expect(notes).toBeVisible();
  await expect(rowOf(b, 'README.md')).toBeVisible();
  const [x, y] = await below(b);
  await start(page, notes);
  await to(page, x, y);
  await expect(areaOf(b)).toHaveAttribute('data-drop-over', '');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Again, released over the page heading, outside both panes.
  const head = page.getByRole('heading', { name: 'Files', level: 1, exact: true });
  const h = (await head.boundingBox())!;
  await start(page, notes);
  await to(page, x, y);
  await expect(areaOf(b)).toHaveAttribute('data-drop-over', '');
  await to(page, h.x + h.width / 2, h.y + h.height / 2);
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(b.getByRole('row', { name: /notes\.txt/ })).toHaveCount(0);
});
