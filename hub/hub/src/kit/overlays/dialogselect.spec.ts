// Playwright (OP-F, OP-G), in a real browser:
// - dialog text can be selected with the mouse and copied: a drag over the title, a body line, a field's label and
//   help, and an outcome selects that text (window.getSelection()), and Ctrl+C puts it on the clipboard (read back).
//   A field that validates on blur does not end the drag. Buttons stay user-select: none;
// - every dialog with Cancel has a close x in its header: it is labelled, 44 x 44 on a touch screen, never over a
//   wrapped title, never focused when the dialog opens, and closes like Cancel with focus where Cancel sends it.
// Not covered here: selecting with a long press on a touch screen (no Playwright gesture does it). That needs a
// manual check, and it is still outstanding.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const DIALOG = '[role="dialog"], [role="alertdialog"]';
// A file's delete confirm in Files (a plain danger confirm with a body line).
const FILES = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';

/** Open one of the kit gallery's sample dialogs (kit/gallery/overlays.tsx). */
async function openSample(page: Page, open: 'rename' | 'confirm-pending', title: string): Promise<Locator> {
  await gotoHub(page, `/_kit?tab=overlays&open=${open}`);
  const dlg = page.getByRole(open === 'rename' ? 'dialog' : 'alertdialog', { name: title });
  await dlg.waitFor();
  return dlg;
}

/** Ctrl+C, then the clipboard read back (bounded: a copy that never lands fails here, not at the test timeout). */
async function copyAndRead(page: Page): Promise<string> {
  await page.keyboard.press('ControlOrMeta+c');
  return page.evaluate(() => Promise.race([navigator.clipboard.readText(), new Promise<string>((_, no) => setTimeout(() => no(new Error('clipboard read timed out')), 3000))]));
}

async function openFileDelete(page: Page): Promise<Locator> {
  await gotoHub(page, FILES);
  const pane = page.getByRole('region', { name: 'Left pane' });
  await pane.getByRole('row', { name: /notes\.txt/ }).getByRole('button', { name: /Row actions/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dlg = page.locator(DIALOG).first();
  await dlg.getByText("There is no trash: this can't be undone.").waitFor();
  return dlg;
}

/** Drag the mouse across an element's first line, left to right, and return what is selected. */
async function dragAcross(page: Page, el: Locator): Promise<string> {
  const range = await el.evaluate((node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    const first = r.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: first.left, y: first.top + first.height / 2, w: first.width };
  });
  await page.mouse.move(range.x + 1, range.y);
  await page.mouse.down();
  await page.mouse.move(range.x + range.w - 1, range.y, { steps: 10 });
  await page.mouse.up();
  return page.evaluate(() => String(window.getSelection()));
}

test.describe('dialog text selection (OP-F)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

  test('a mouse drag selects the title and a body line, and copy carries the selection', async ({ page }) => {
    const dlg = await openFileDelete(page);
    const title = dlg.getByRole('heading');
    const titleText = (await title.textContent())!.trim();
    const sel = await dragAcross(page, title);
    expect(sel.length, sel).toBeGreaterThan(Math.min(6, titleText.length - 2));
    expect(titleText).toContain(sel.trim());
    // Focus stays in the dialog (on the dialog itself), not moved to a button that would end the selection.
    expect(await page.evaluate((d) => document.activeElement?.closest(d) !== null, DIALOG)).toBe(true);
    // Ctrl+C puts exactly the selected title text on the clipboard.
    expect(await copyAndRead(page)).toBe(sel);

    const line = dlg.getByText("There is no trash: this can't be undone.");
    const bodySel = await dragAcross(page, line);
    expect(bodySel.trim().length, bodySel).toBeGreaterThan(10);
    expect("There is no trash: this can't be undone.").toContain(bodySel.trim());

    // Copy: Ctrl+C puts exactly that text on the clipboard.
    expect(await copyAndRead(page)).toBe(bodySel);
  });

  test("a field's label and help line, and an outcome, can be selected and copied too", async ({ page }) => {
    let dlg = await openSample(page, 'rename', 'Rename atlas');
    const label = dlg.getByText('New name', { exact: true });
    const labelSel = await dragAcross(page, label);
    // A drag from the first glyph's edge may start just past it: most of the label, from that label only.
    expect(labelSel.trim().length, labelSel).toBeGreaterThanOrEqual(6);
    expect('New name').toContain(labelSel.trim());
    expect(await copyAndRead(page)).toBe(labelSel);
    const help = dlg.getByText('Lowercase letters, digits and dashes.');
    const helpSel = await dragAcross(page, help);
    expect(helpSel.trim().length, helpSel).toBeGreaterThan(10);
    expect('Lowercase letters, digits and dashes.').toContain(helpSel.trim());
    expect(await copyAndRead(page)).toBe(helpSel);

    dlg = await openSample(page, 'confirm-pending', 'Stop hoody-agent?');
    const outcome = dlg.locator('[data-dialog-outcome]');
    await expect(outcome).toBeVisible();
    for (const text of ['This may have gone through', "The server didn't confirm it. Check before you try again."]) {
      const outSel = await dragAcross(page, outcome.getByText(text, { exact: true }));
      expect(outSel.trim().length, outSel).toBeGreaterThan(6);
      expect(text).toContain(outSel.trim());
      expect(await copyAndRead(page)).toBe(outSel);
    }
  });

  test('a field that validates on blur (adds its error) does not end a drag that starts on the title', async ({ page }) => {
    const dlg = await openSample(page, 'rename', 'Rename atlas');
    const field = dlg.getByRole('textbox', { name: 'New name' });
    // As ChatPeople's Add person: the field's blur adds an error line inside the dialog.
    await field.evaluate((input) => {
      input.addEventListener('blur', () => {
        const p = document.createElement('p');
        p.textContent = 'Use the number from the app.';
        input.closest('[data-dialog-body]')!.append(p);
      });
    });
    await field.focus();
    const title = dlg.getByRole('heading');
    const titleText = (await title.textContent())!.trim();
    const sel = await dragAcross(page, title);
    await expect(dlg.getByText('Use the number from the app.')).toBeVisible();
    // Frames for the rescue the added line schedules.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(sel.length, sel).toBeGreaterThan(6);
    expect(titleText).toContain(sel.trim());
    expect(String(await page.evaluate(() => String(window.getSelection())))).toBe(sel);
    expect(await page.evaluate((d) => document.activeElement === document.querySelector(d), DIALOG)).toBe(true);
    expect(await copyAndRead(page)).toBe(sel);
  });

  test('buttons stay unselectable; no text wrapper in the dialog turns selection off', async ({ page }) => {
    const dlg = await openFileDelete(page);
    const styles = await dlg.evaluate((root) => {
      const off: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        if (el.closest('button')) continue;
        if (getComputedStyle(el).userSelect === 'none' && (el.textContent ?? '').trim()) off.push(el.tagName + '.' + el.className);
      }
      const cancel = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!;
      return { off, cancel: getComputedStyle(cancel).userSelect };
    });
    expect(styles.off).toEqual([]);
    expect(styles.cancel).toBe('none');
  });
});

test.describe('dialog close x (OP-G), fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the x closes the dialog like Cancel, and focus lands where Cancel sends it', async ({ page }) => {
    const focusNow = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a ? `${a.tagName}|${a.getAttribute('aria-label') ?? ''}|${(a.textContent ?? '').trim().slice(0, 40)}` : 'none';
      });
    let dlg = await openFileDelete(page);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    const afterCancel = await focusNow();
    expect(afterCancel).not.toBe('BODY||');

    dlg = await openFileDelete(page);
    const x = dlg.getByRole('button', { name: 'Close', exact: true });
    await expect(x).toBeVisible();
    await x.click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(await focusNow()).toBe(afterCancel);
  });
});

test.describe('dialog close x (OP-G), opening', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the x never takes focus while a dialog opens, not even for a moment', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { xFocus: number };
      w.xFocus = 0;
      document.addEventListener('focusin', (e) => {
        if (e.target instanceof Element && e.target.hasAttribute('data-dialog-close')) w.xFocus += 1;
      }, true);
    });
    const dlg = await openFileDelete(page);
    await expect(dlg.locator('[data-dialog-close]')).toBeVisible();
    await openSample(page, 'rename', 'Rename atlas');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => (window as unknown as { xFocus: number }).xFocus)).toBe(0);
  });
});

test.describe('dialog close x (OP-G), touch at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the x is 44 x 44 and stays clear of a title that wraps', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const dlg = await openFileDelete(page);
    const x = dlg.getByRole('button', { name: 'Close', exact: true });
    const title = dlg.getByRole('heading');
    // A long title that must wrap at this width.
    await title.evaluate((h) => { h.textContent = 'Delete notes.txt and every other file that shares its long and winding name forever?'; });
    const m = await dlg.evaluate((root) => {
      const xr = root.querySelector('[data-dialog-close]')!.getBoundingClientRect();
      const tr = root.querySelector('h2, [role="heading"]')!.getBoundingClientRect();
      const lines = Math.round(tr.height / parseFloat(getComputedStyle(root.querySelector('h2, [role="heading"]')!).lineHeight || '24'));
      const overlap = !(xr.right <= tr.left || xr.left >= tr.right || xr.bottom <= tr.top || xr.top >= tr.bottom);
      return { w: xr.width, h: xr.height, overlap, lines, inside: xr.right <= root.getBoundingClientRect().right + 0.5 };
    });
    // 44 css px (a device-pixel rounding may leave 43.999).
    expect(m.w, JSON.stringify(m)).toBeGreaterThanOrEqual(43.5);
    expect(m.h, JSON.stringify(m)).toBeGreaterThanOrEqual(43.5);
    expect(m.lines, JSON.stringify(m)).toBeGreaterThan(1);
    expect(m.overlap, JSON.stringify(m)).toBe(false);
    expect(m.inside, JSON.stringify(m)).toBe(true);
    await x.tap();
    await expect(page.locator(DIALOG)).toHaveCount(0);
  });
});
