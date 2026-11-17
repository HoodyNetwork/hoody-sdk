// Playwright: dragging Files rows with a real mouse in a real browser. A row dragged onto a folder row
// shows the drop hint and the row's outline, and on release opens Move for it; dragged to the other pane it opens Copy
// and with the copy key held Move; to a pane showing another computer it is refused, with words saying copying
// between computers isn't available yet. Nothing is sent before the dialog's press. axe finds nothing while the hint
// shows.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, hubUrl } from '@app/e2e';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const TWO = '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp';
const pane = (page: Page, k: 'a' | 'b') => page.getByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const rowOf = (p: Locator, name: string) => p.locator('[data-row-id]', { hasText: name }).first();

/** A mouse drag from one element to another, in steps so the browser fires its drag events. */
async function drag(page: Page, from: Locator, to: Locator, hold?: 'Control') {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 3, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 3 + 12, a.y + a.height / 2 + 4, { steps: 4 });
  if (hold) await page.keyboard.down(hold);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2, { steps: 3 });
}

test('a row dragged onto a folder row: the hint and the outline show, and the drop opens Move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, TWO);
  const a = pane(page, 'a');
  const notes = rowOf(a, 'notes.txt');
  const projects = rowOf(a, 'projects');
  await expect(notes).toBeVisible();
  await drag(page, notes, projects);
  const hint = page.locator('[data-drop-hint]');
  await expect(hint).toHaveText(fill(strings['drop.move'], { what: 'notes.txt', folder: 'projects', key: process.platform === 'darwin' ? 'Option' : 'Ctrl' }));
  await expect(projects).toHaveAttribute('data-drop-over', '');
  await page.screenshot({ path: test.info().outputPath('rowdrop-over.png') });
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.mouse.up();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['move.title'], { name: 'notes.txt' }) })).toBeVisible();
  await expect(hint).toHaveCount(0);
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
});

const KEY = process.platform === 'darwin' ? 'Option' : 'Ctrl';

test('a row dragged to the other pane opens Copy, its hint naming the key that moves instead', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, TWO);
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  await expect(notes).toBeVisible();
  const target = pane(page, 'b').locator('[data-drop-frame]').first();
  await expect(target).toBeVisible();
  await drag(page, notes, target);
  await expect(page.locator('[data-drop-hint]')).toHaveText(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'tmp', key: KEY }));
  await expect(target).toHaveAttribute('data-drop-over', '');
  await page.screenshot({ path: test.info().outputPath('rowdrop-copy-other-pane.png') });
  await page.mouse.up();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeVisible();
  await expect(d.getByRole('button', { name: ts['copy.primary'] })).toBeVisible();
});

test('a row dragged to the other pane with the copy key opens Move', async ({ page }) => {
  test.skip(process.platform === 'darwin', 'the copy key is Option on macOS');
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, TWO);
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  await expect(notes).toBeVisible();
  const target = pane(page, 'b').locator('[data-drop-frame]').first();
  await expect(target).toBeVisible();
  await drag(page, notes, target, 'Control');
  await expect(page.locator('[data-drop-hint]')).toHaveText(fill(strings['drop.moveKey'], { what: 'notes.txt', folder: 'tmp' }));
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.getByRole('dialog').getByRole('heading', { name: fill(ts['move.title'], { name: 'notes.txt' }) })).toBeVisible();
});

test('a row dragged to a pane showing another computer is refused, with words: no copy between computers yet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // All realms (the fixtures' fxrealm=all): pane B shows granite, another running computer.
  await page.goto(hubUrl('/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=granite.0107&bp=%2F').replace('/?', '/?fxrealm=all&'));
  await page.locator('#hub-main').waitFor();
  const notes = rowOf(pane(page, 'a'), 'notes.txt');
  await expect(notes).toBeVisible();
  const target = pane(page, 'b').locator('[data-drop-frame]').first();
  await expect(target).toBeVisible();
  await drag(page, notes, target);
  const hint = page.locator('[data-drop-hint]');
  await expect(hint).toHaveText(strings['drop.otherComputer']);
  await expect(hint).toHaveAttribute('data-drop-refused', '');
  await expect(page.locator('[data-drop-over]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('rowdrop-other-computer.png') });
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(hint).toHaveCount(0);
});
