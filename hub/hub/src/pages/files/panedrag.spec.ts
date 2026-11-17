// Playwright: dragging Files rows from one pane to the other with a real mouse (Two panes). From the start of the drag
// the dragged rows are dimmed and the pointer carries the name or the count; the other pane (or a folder row in it) is
// outlined with "Copy … to …" beside the pointer; a pointermove after dragstart (Firefox and WebKit send one, and it
// can end a drag there, so nothing takes it) changes nothing; the drop opens the page's own Copy dialog, whose one
// press copies; Esc cancels with nothing opened; the folder the rows are in takes no drop (and says so); nothing stays
// dimmed or outlined after a drop or a cancel. rowdrop.spec.ts holds move, the copy key and the other-computer refusal;
// panearea.spec.ts the drop anywhere in the other pane.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const KEY = process.platform === 'darwin' ? 'Option' : 'Ctrl';
const two = (bp: string) => `/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=${encodeURIComponent(bp)}`;
const pane = (page: Page, k: 'a' | 'b') => page.getByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const rowOf = (p: Locator, name: string) => p.locator('[data-row-id]', { hasText: name }).first();
const frameOf = (p: Locator) => p.locator('[data-drop-frame]').first();
const hint = (page: Page) => page.locator('[data-drop-hint]');

/** What the pointer carried at dragstart (RowDrag.preview): the words of the element given to setDragImage. */
async function recordPreview(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __preview: string[] };
    w.__preview = [];
    const real = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function (el: Element, x: number, y: number) {
      w.__preview.push(el.textContent ?? '');
      real.call(this, el, x, y);
    };
  });
}
const previews = (page: Page) => page.evaluate(() => (window as unknown as { __preview: string[] }).__preview);

/** Press on a row and drag it clear of its place: the drag has started. */
async function start(page: Page, from: Locator) {
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 3, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 3 + 12, a.y + a.height / 2 + 4, { steps: 4 });
}
async function over(page: Page, to: Locator) {
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2, { steps: 3 });
}
const nothingLeft = async (page: Page) => {
  await expect(hint(page)).toHaveCount(0);
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await expect(page.locator('[data-dragging]')).toHaveCount(0);
  await expect(page.locator('[data-drag-ghost]')).toHaveCount(0);
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

test('a file dragged to the other pane: dimmed, named, the pane outlined; a stray pointermove changes nothing; one press copies it there', async ({ page, browserName }) => {
  await recordPreview(page);
  await gotoHub(page, two('/tmp'));
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  const target = frameOf(pane(page, 'b'));
  await expect(notes).toBeVisible();
  await expect(target).toBeVisible();
  await start(page, notes);
  // From the start: the row dimmed where it is, the pointer carrying its name.
  await expect(notes).toHaveAttribute('data-dragging', '');
  await expect(notes).toHaveCSS('opacity', '0.5');
  expect(await previews(page)).toEqual(['notes.txt']);
  // What Firefox and WebKit send right after dragstart.
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0 })));
  await over(page, target);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'tmp', key: KEY }));
  await expect(target).toHaveAttribute('data-drop-over', '');
  await page.screenshot({ path: test.info().outputPath('panedrag-one.png') });
  await page.mouse.up();
  await nothingLeft(page);
  // The page's own Copy dialog, from the dragged file's folder to the other pane's: nothing is sent before its press.
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(0);
  await firstPressAfterDrag(d, browserName);
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(1);
  // A copy: the file is still where it was.
  await expect(rowOf(pane(page, 'a'), 'notes.txt')).toBeVisible();
});

test("dragged onto a folder row of the other pane: that row is outlined and named, and the copy lands in it", async ({ page, browserName }) => {
  await gotoHub(page, two('/home/ada/projects'));
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  const site = pane(page, 'b').locator('[data-row-id]').filter({ has: page.getByText('site', { exact: true }) });
  await expect(notes).toBeVisible();
  await expect(site).toBeVisible();
  await start(page, notes);
  await over(page, site);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'site', key: KEY }));
  await expect(site).toHaveAttribute('data-drop-over', '');
  await expect(frameOf(pane(page, 'b'))).not.toHaveAttribute('data-drop-over', '');
  await page.screenshot({ path: test.info().outputPath('panedrag-folder-row.png') });
  await page.mouse.up();
  await nothingLeft(page);
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
  // The dialog names the file's own folder and the folder row it was dropped on.
  await expect(d.getByText(/ \/home\/ada\/notes\.txt$/)).toBeVisible();
  await expect(d.getByText(/ \/home\/ada\/projects\/site\/notes\.txt$/)).toBeVisible();
  await firstPressAfterDrag(d, browserName);
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(d).toHaveCount(0);
  // In site, not beside it; opened at once, the folder lists the copy with no Refresh (a folder no pane showed is
  // read again after a change on its computer, never shown from the listing the dialog read before the copy).
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(0);
  await site.click();
  await expect(pane(page, 'b').getByRole('row', { name: /deploy\.sh/ })).toBeVisible();
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(1);
});

test('a row moved onto a folder row of its own pane: opened at once, the folder lists it with no Refresh', async ({ page, browserName }) => {
  await gotoHub(page, two('/tmp'));
  const a = pane(page, 'a');
  const notes = rowOf(a, 'notes.txt');
  const projects = a.locator('[data-row-id]').filter({ has: page.getByText('projects', { exact: true }) });
  await expect(notes).toBeVisible();
  await start(page, notes);
  await over(page, projects);
  await expect(projects).toHaveAttribute('data-drop-over', '');
  await page.mouse.up();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['move.title'], { name: 'notes.txt' }) })).toBeVisible();
  await firstPressAfterDrag(d, browserName);
  await d.getByRole('button', { name: ts['move.primary'], exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(a.getByRole('row', { name: /notes\.txt/ })).toHaveCount(0);
  await projects.click();
  await expect(a.getByRole('row', { name: /README\.md/ })).toBeVisible();
  await expect(a.getByRole('row', { name: /notes\.txt/ })).toHaveCount(1);
});

test('several selected rows drag together: all dimmed, the pointer carries the count, one Copy dialog for all', async ({ page, browserName }) => {
  await recordPreview(page);
  await gotoHub(page, two('/tmp'));
  const a = pane(page, 'a');
  for (const name of ['notes.txt', 'report.pdf']) {
    // The drawn box: its label (the kit's checkbox input is visually hidden under it), as a pointer presses it.
    await a.getByRole('row', { name: new RegExp(name.replace('.', '\\.')) }).locator('label').filter({ has: page.getByRole('checkbox') }).click();
  }
  await expect(a.getByText(/^2 selected$/)).toBeVisible();
  const target = frameOf(pane(page, 'b'));
  await start(page, rowOf(a, 'report.pdf'));
  await expect(a.locator('[data-dragging]')).toHaveCount(2);
  await expect(rowOf(a, 'notes.txt')).toHaveAttribute('data-dragging', '');
  expect(await previews(page)).toEqual([fill(strings['drop.items_other'], { count: '2' })]);
  await over(page, target);
  await expect(hint(page)).toHaveText(fill(strings['drop.copyKey'], { what: fill(strings['drop.items_other'], { count: '2' }), folder: 'tmp', key: KEY }));
  await page.screenshot({ path: test.info().outputPath('panedrag-several.png') });
  await page.mouse.up();
  await nothingLeft(page);
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['several.copyTitle'], { count: '2' }) })).toBeVisible();
  await firstPressAfterDrag(d, browserName);
  await d.getByRole('button', { name: ts['copy.primary'], exact: true }).click();
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(1);
  await expect(pane(page, 'b').getByRole('row', { name: /report\.pdf/ })).toHaveCount(1);
});

test('Esc cancels the drag: nothing opens, nothing is copied, nothing stays dimmed or outlined', async ({ page }) => {
  await gotoHub(page, two('/tmp'));
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  const target = frameOf(pane(page, 'b'));
  await expect(notes).toBeVisible();
  await start(page, notes);
  await over(page, target);
  await expect(target).toHaveAttribute('data-drop-over', '');
  await expect(notes).toHaveAttribute('data-dragging', '');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pane(page, 'b').getByRole('row', { name: /notes\.txt/ })).toHaveCount(0);
});

test('the other pane showing the same folder takes no drop: no outline, words saying the rows are already there, nothing opens', async ({ page }) => {
  await gotoHub(page, two('/home/ada'));
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  const target = frameOf(pane(page, 'b'));
  await expect(notes).toBeVisible();
  await expect(target).toBeVisible();
  await start(page, notes);
  await expect(notes).toHaveAttribute('data-dragging', '');
  // Over a file row of the same folder in the other pane (it means that folder).
  await over(page, rowOf(pane(page, 'b'), 'report.pdf'));
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await expect(hint(page)).toHaveText(fill(strings['drop.here'], { folder: 'ada' }));
  await expect(hint(page)).toHaveAttribute('data-drop-refused', '');
  await page.mouse.up();
  await nothingLeft(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
