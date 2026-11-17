// Playwright: Export vault downloads one file, on fixtures, mouse and keyboard.
import { readFile } from 'node:fs/promises';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const IN = '/vault';
const PW = 'e2e-export-pw';

async function openExport(page: Page) {
  await gotoHub(page, IN);
  await page.getByRole('button', { name: strings['action.more'] }).click();
  await page.getByRole('menuitem', { name: strings['action.export'] }).click();
  return page.getByRole('alertdialog', { name: /Export Personal/ });
}

test('Encrypted export downloads vault-personal-<date>.json holding envelopes, never the plain values', async ({ page }) => {
  const dlg = await openExport(page);
  await dlg.getByLabel(strings['export.password']).fill(PW);
  await dlg.getByLabel(strings['export.repeat']).fill(PW);
  const download = page.waitForEvent('download');
  await dlg.getByRole('button', { name: strings['export.confirm'] }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^vault-personal-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await d.path()) as string, 'utf8');
  const f = JSON.parse(text) as Record<string, { value: string; metadata?: Record<string, unknown> }>;
  expect(Object.keys(f)).toEqual(['db-password', 'deploy.notes', 'github-token']);
  for (const e of Object.values(f)) expect(JSON.parse(e.value)).toMatchObject({ _enc: 1, iter: 600000 });
  expect(text).not.toContain('fixture-token-value');
  expect(text).not.toContain(PW);
  await expect(dlg).toBeHidden();
  await expect(page.getByText(d.suggestedFilename())).toBeVisible();
});

test('Readable export by keyboard: the danger confirm first, then the values as stored', async ({ page }) => {
  await gotoHub(page, IN);
  await page.getByRole('button', { name: strings['action.more'] }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: strings['action.export'] }).focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('alertdialog', { name: /Export Personal/ });
  await dlg.getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }).focus();
  await page.keyboard.press('Space');
  await dlg.getByRole('button', { name: strings['export.confirm'] }).focus();
  await page.keyboard.press('Enter');
  const danger = page.getByRole('alertdialog', { name: strings['export.readableTitle'] });
  await expect(danger).toBeVisible();
  const download = page.waitForEvent('download');
  await danger.getByRole('button', { name: strings['export.readableConfirm'] }).focus();
  await page.keyboard.press('Enter');
  const text = await readFile((await (await download).path()) as string, 'utf8');
  expect((JSON.parse(text) as Record<string, { value: string }>)['github-token']).toEqual({ value: 'fixture-token-value-000000000001' });
});
