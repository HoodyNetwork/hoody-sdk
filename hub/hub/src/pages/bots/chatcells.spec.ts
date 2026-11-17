// Playwright: the Chats and People tables of a chat app keep their marks when the cell holds kit parts only
// (kit CellLines, no line break written in the cell). The Home chat mark and the language note sit under the name, never over it or
// past the cell; the rights Tags have a space between them. Same at 1350 and at a phone's 390.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=apps&app=ch-tg';

const open = async (page: Page, section: 'chats' | 'people') => {
  await gotoHub(page, URL, { state: 'channelGroupAsks' });
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: strings[`chan.rail.${section}`], exact: true }).click();
  return dlg;
};

/** Where the name (the first text of the row's first cell) ends and starts, and the cell's right edge, as numbers. */
async function nameBox(row: Locator): Promise<{ bottom: number; left: number; cellRight: number }> {
  return row.evaluate((el) => {
    const cell = (el.querySelector('td, [role="cell"]') ?? el) as HTMLElement;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent ?? '').trim() === '') continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      return { bottom: b.bottom, left: b.left, cellRight: cell.getBoundingClientRect().right };
    }
    throw new Error('no name text');
  });
}

for (const width of [1350, 390]) {
  test.describe(`${width} wide`, () => {
    test('the Home chat mark sits under the chat name, inside its cell', async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      const dlg = await open(page, 'chats');
      const table = dlg.getByRole('table').first(); // reason: the Chats section holds one table
      await expect(table).toBeVisible();
      const row = table.getByRole('row').filter({ hasText: strings['chan.chat.home'] }).first(); // reason: only the home chat's row carries the mark
      const mark = row.getByText(strings['chan.chat.home'], { exact: true });
      await expect(mark).toBeVisible();
      const [name, box] = [await nameBox(row), await mark.boundingBox()];
      expect(box, 'the mark has a box').toBeTruthy();
      expect(box!.y, 'the mark is under the name').toBeGreaterThanOrEqual(name.bottom - 2);
      expect(box!.x + box!.width, 'inside the cell').toBeLessThanOrEqual(name.cellRight + 1);
    });

    test('the language note sits under the person name, and the rights Tags keep a space', async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      const dlg = await open(page, 'people');
      const table = dlg.getByRole('table', { name: /People paired with/ });
      await expect(table).toBeVisible();
      const row = table.getByRole('row').filter({ hasText: 'Ana' }).first(); // reason: one row per person
      const note = row.getByText(strings['chan.person.langIs'].replace('{{lang}}', strings['set.v.lang.en']), { exact: true });
      await expect(note).toBeVisible();
      const [name, n] = [await nameBox(row), await note.boundingBox()];
      expect(n, 'the note has a box').toBeTruthy();
      // On its own line under the name, inside the cell: never over it, never past the cell.
      expect(n!.y, 'the note is under the name').toBeGreaterThanOrEqual(name.bottom - 2);
      expect(n!.x + n!.width, 'inside the cell').toBeLessThanOrEqual(name.cellRight + 1);
      // Owner and Chat sit side by side with a space between them, or one under the other: never touching.
      const [o, c] = [await row.getByText(strings['chan.person.owner'], { exact: true }).boundingBox(), await row.getByText(strings['chan.right.chat'], { exact: true }).first().boundingBox()]; // reason: Ana's own rights
      expect(o && c).toBeTruthy();
      const sameLine = Math.abs((o?.y ?? 0) - (c?.y ?? 99)) < 4;
      if (sameLine) expect((c?.x ?? 0) - ((o?.x ?? 0) + (o?.width ?? 0)), 'a gap between the Tags').toBeGreaterThanOrEqual(2);
    });
  });
}
