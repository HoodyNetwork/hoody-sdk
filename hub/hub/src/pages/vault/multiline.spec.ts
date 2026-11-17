// Playwright: the Value field's multi-line secret. While hidden, the field is read-only and holds bullets
// and line ends only: typed keys, an IME commit, a drop and undo never put a character into it, at any event; two different
// keys of the same shape draw the same pixels and the page holds neither (value, accessibility tree, HTML); Show draws the
// key; the field resizes vertically.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const KEY_A = fake('-----BEGIN ', 'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nk3Zq9pLmXw==\n-----END PRIVATE KEY-----\n');
const KEY_B = KEY_A.replace(/[A-Za-z0-9=-]/g, 'q');
const valueBox = (page: Page) => page.getByRole('textbox', { name: strings['edit.value'] });

/** A real paste: the text is copied with the keyboard from a scratch field, then pasted into the Value field with the keyboard. */
async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const scratch = document.createElement('textarea');
    scratch.id = 'scratch-copy';
    scratch.value = t;
    (document.querySelector('[role="dialog"]') ?? document.body).appendChild(scratch);
    scratch.focus();
    scratch.select();
  }, text);
  await page.keyboard.press('ControlOrMeta+c');
  await page.evaluate(() => document.getElementById('scratch-copy')?.remove());
  await valueBox(page).focus();
  await page.keyboard.press('ControlOrMeta+v');
}

/** From now on, records the hidden field's value at every input-related event and after every DOM change. */
async function watch(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const look = () => {
      const el = document.querySelector('textarea[data-secret-input]') as HTMLTextAreaElement | null;
      if (el?.hasAttribute('data-secret-hidden')) seen.push(el.value);
    };
    const kinds = ['keydown', 'keypress', 'beforeinput', 'input', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'drop', 'paste', 'select', 'selectionchange'];
    for (const k of kinds) {
      document.addEventListener(
        k,
        () => {
          look();
          queueMicrotask(look);
        },
        true,
      );
    }
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}
const seenValues = (page: Page) => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);

test('hidden: typed keys, an IME commit, a drop and undo never put a character into the field', async ({ page }) => {
  await gotoHub(page, '/vault?edit=new');
  const box = valueBox(page);
  await expect(box).toBeVisible();
  await watch(page);
  await box.click();
  await page.keyboard.type('hunter2-secret');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line2');
  await expect(box).toHaveValue(/^•{14}\n•{5}$/);
  // An IME commit and a drop go nowhere while hidden (the field is read-only); undo changes nothing.
  await page.keyboard.insertText('imetext');
  await box.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'droptext');
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(box).toHaveValue(/^•{14}\n•{5}$/);
  const seen = await seenValues(page);
  expect(seen.length).toBeGreaterThan(20);
  for (const v of seen) expect(v).toMatch(/^[•\n]*$/);
  expect(await page.content()).not.toContain('hunter2');
  await page.getByRole('button', { name: 'Show what you typed' }).click();
  await expect(box).toHaveValue('hunter2-secret\nline2');
});

test('a hidden multi-line value shows no characters, on screen or in the page', async ({ page }, info) => {
  await gotoHub(page, '/vault?edit=new');
  const box = valueBox(page);
  await expect(box).toBeVisible();
  expect(await box.evaluate((el) => [el.tagName, getComputedStyle(el).resize])).toEqual(['TEXTAREA', 'vertical']);
  await watch(page);

  await paste(page, KEY_A);
  await expect(box).toHaveValue(/^[•\n]+$/);
  expect(await page.content()).not.toContain('MIIEvQ');
  expect(await page.getByRole('dialog').ariaSnapshot()).not.toContain('MIIEvQ');
  const hiddenA = await box.screenshot({ path: info.outputPath('hidden-key-a.png') });

  await box.press('ControlOrMeta+a');
  await box.press('Backspace');
  await expect(box).toHaveValue('');
  await paste(page, KEY_B);
  const hiddenB = await box.screenshot({ path: info.outputPath('hidden-key-b.png') });
  expect(hiddenA.equals(hiddenB)).toBe(true);
  for (const v of await seenValues(page)) expect(v).toMatch(/^[\u2022\n]*$/);

  await page.getByRole('button', { name: 'Show what you typed' }).click();
  await expect(box).toHaveValue(KEY_B);
  const shown = await box.screenshot({ path: info.outputPath('shown-key-b.png') });
  expect(shown.equals(hiddenB)).toBe(false);
});
