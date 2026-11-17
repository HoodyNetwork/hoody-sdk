// Playwright: Import entries on fixtures: paste KEY=VALUE lines into the masked box, read, send, read back.
// Every value carries MARK; after each step the page's HTML, every field's value, the URL, browser storage and every
// console message are swept for it.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const MARK = 'QZMARKPW';
const TEXT = [`# e2e`, `export PW_ONE=${MARK}-one`, `PW_TWO="${MARK}-two\\nline"`, `github-token=${MARK}-three`, `EMPTY=`].join('\n');

async function sweep(page: Page, consoled: readonly string[], where: string) {
  const html = await page.content();
  const fields = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].map((e) => e.value));
  const stored = await page.evaluate(() => {
    const out: string[] = [];
    // eslint-disable-next-line no-restricted-properties -- the sweep reads browser storage to prove no value reached it
    for (const s of [window.localStorage, window.sessionStorage]) for (let i = 0; i < s.length; i++) out.push(`${s.key(i)}=${s.getItem(s.key(i)!)}`);
    return out.join('\n');
  });
  const found = [
    html.includes(MARK) ? 'html' : '',
    fields.some((f) => f.includes(MARK)) ? 'field value' : '',
    page.url().includes(MARK) ? 'url' : '',
    stored.includes(MARK) ? 'storage' : '',
    consoled.some((c) => c.includes(MARK)) ? 'console' : '',
  ].filter(Boolean);
  expect(found, `leak at ${where}`).toEqual([]);
}

test('paste → names-only preview → send → confirmed by read-back, with no value anywhere on the page', async ({ page }) => {
  const consoled: string[] = [];
  page.on('console', (m) => consoled.push(m.text()));
  await gotoHub(page, '/vault');
  await page.getByRole('button', { name: strings['action.more'] }).click();
  await page.getByRole('menuitem', { name: strings['action.import'] }).click();
  const dlg = page.getByRole('dialog', { name: 'Import into Personal' });
  await expect(dlg).toBeVisible();
  const box = dlg.getByLabel(strings['import.paste']);
  await box.focus();
  // A paste as the clipboard gives it (the masked box takes a paste, never typed text while hidden).
  await box.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, TEXT);
  await sweep(page, consoled, 'pasted');
  await dlg.getByRole('button', { name: strings['import.read'] }).click();
  const list = dlg.getByRole('list', { name: strings['import.list'] });
  // github-token is a vault name but not a .env name: refused, and shown by its line number only.
  await expect(list.getByRole('listitem').filter({ hasText: 'Line 4' })).toContainText(strings['import.st.invalid']);
  await expect(dlg).not.toContainText('github-token');
  await expect(list.getByRole('listitem').filter({ hasText: 'PW_ONE' })).toContainText(strings['import.st.new']);
  // A refused row is its line and reason only: EMPTY is never named.
  await expect(list.getByRole('listitem').filter({ hasText: 'Line 5' })).toContainText(strings['import.st.empty']);
  await expect(list).not.toContainText('EMPTY');
  await expect(dlg).toContainText('Sends 2 entries. This takes under a minute.');
  await sweep(page, consoled, 'preview');
  await dlg.getByRole('button', { name: 'Send 2 entries' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: 'PW_ONE' })).toContainText(strings['import.st.confirmed'], { timeout: 20_000 });
  await expect(list.getByRole('listitem').filter({ hasText: 'PW_TWO' })).toContainText(strings['import.st.confirmed']);
  // The ended import: one sentence, the counts as label/value facts under it.
  const plate = dlg.getByRole('group', { name: strings['import.verdictDone'] });
  await expect(plate).toContainText(strings['import.ended']);
  await expect(plate.getByRole('term')).toHaveText([strings['import.fact.sent'], strings['import.fact.saved'], strings['import.fact.refused']]);
  await expect(plate.getByRole('definition')).toHaveText(['2', '2', '2']);
  await sweep(page, consoled, 'done');
  // The footer's Close (the header's close x has the same name and does the same).
  await dlg.getByRole('button', { name: strings['import.close'], exact: true }).last().click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('table', { name: strings.title }).getByText('PW_ONE', { exact: true })).toBeVisible();
  await sweep(page, consoled, 'closed');
});
