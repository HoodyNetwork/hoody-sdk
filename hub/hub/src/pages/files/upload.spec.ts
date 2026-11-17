// Playwright: Upload in a real browser. Files picked with the toolbar's Upload go through the plan, the
// batch and its band; lost.txt loses its answer unwritten (fixtures), so the batch stops on it, the band holds the
// computer until Check again reads that it is not there. axe finds nothing in the plan, the result or the band.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import us from './Upload.strings.en.json';

const TMP = '/files?a=atlas.00a1&ap=%2Ftmp';
const paneA = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const fill = (s: string, folder: string) => s.replace('{{folder}}', folder);
const file = (name: string, body = 'abc') => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) });
async function axeClean(page: Page) {
  // The page and, when one is open, the dialog (it renders outside #hub-main); the shell's own chrome has its specs.
  const b = new AxeBuilder({ page }).include('#hub-main');
  if (await page.getByRole('dialog').count()) b.include('[role="dialog"]');
  const r = await b.analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}

test('upload: the plan, a lost answer that stops the batch, the band, Check again; axe finds nothing', async ({ page }) => {
  await gotoHub(page, TMP);
  const upload = paneA(page).getByRole('button', { name: us['action.upload'] });
  await expect(upload).toBeEnabled();
  await paneA(page).getByLabel(us['pick.label']).setInputFiles([file('a.txt'), file('lost.txt'), file('b.txt', 'hello')]);
  const d = page.getByRole('dialog');
  await expect(d.getByText('3 files, 11 B')).toBeVisible();
  await axeClean(page);
  await d.getByRole('button', { name: 'Upload 3 files' }).click();
  await expect(d.getByText(us['row.unknown'])).toBeVisible();
  await expect(d.getByText(us['row.unknown'])).toHaveCount(1);
  await axeClean(page);
  // The footer's worded Close (data-dialog-cancel), not the dialog's X, which has the same name.
  await d.getByRole('button', { name: us.close, exact: true }).and(d.locator('[data-dialog-cancel]')).click();
  await expect(page.getByText('1 upload to /tmp may have gone through: lost.txt.', { exact: false })).toBeVisible();
  await axeClean(page);
  await paneA(page).getByRole('button', { name: us.check, exact: true }).click();
  await expect(page.getByText('lost.txt was not uploaded: it isn\'t in /tmp.')).toBeVisible();
  await axeClean(page);
  // Picked files that went through are listed; lost.txt is not.
  await expect(paneA(page).locator('tbody tr', { hasText: 'a.txt' })).toBeVisible();
  await expect(paneA(page).locator('tbody tr', { hasText: 'lost.txt' })).toHaveCount(0);
});

test('upload at phone width: the toolbar keeps Upload as an icon with its name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, TMP);
  await expect(paneA(page).getByRole('button', { name: us['action.upload'] })).toBeVisible();
  await paneA(page).getByLabel(us['pick.label']).setInputFiles([file('a.txt')]);
  await expect(page.getByRole('dialog')).toBeVisible();
  await axeClean(page);
});

test('files dropped from the desktop on a folder row go into that folder; the row is marked while dragging', async ({ page }) => {
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fhome');
  const row = paneA(page).locator('tbody tr', { hasText: 'ada' });
  await expect(row).toBeVisible();
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['abc'], 'dropped.txt', { type: 'text/plain' })); return d; });
  await row.dispatchEvent('dragenter', { dataTransfer: dt });
  await row.dispatchEvent('dragover', { dataTransfer: dt });
  await expect(row).toHaveAttribute('data-drop-over', '');
  await page.screenshot({ path: test.info().outputPath('drop-row.png') });
  await row.dispatchEvent('drop', { dataTransfer: dt });
  const d = page.getByRole('dialog');
  await expect(d.getByRole('heading', { name: fill(us.title, '/home/ada') })).toBeVisible();
  await axeClean(page);
  await d.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(d.getByText(us['row.done'])).toBeVisible();
});
