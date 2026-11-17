// Playwright: during an add the screen shows the bar's plain Add and the picker only.
// The picker opened for an empty slot is that slot's content: the slot's own Add and recent picks hide, and the picker
// is placed against the slot body's top edge (8 px below it, centred on it), not against the slot's button: on an empty
// Board (the welcome's own Add) and on a split Board (the bar's Add opens it on the new slot).
// Closing shows them again, focus back on the Add that opened it. The slot's Add carries no key cap, and only the slot N
// opens (the Board's first empty one) names N. One click on an inactive slot's Add opens its picker. Shots light and dark.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const S = strings as Record<string, string>;

const picker = (page: Page) => page.getByRole('dialog', { name: S['picker.title'] });
/** Add (the strip's when shown, else the welcome's own; the chips row's + comes after both): opens the picker on the
 *  empty slot. */
async function openAdd(page: Page) {
  await page.getByRole('button', { name: S['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  await expect(picker(page)).toBeVisible();
  return picker(page);
}
/** An empty Board, or one with a terminal on its first slot so the next Add splits it. */
async function board(page: Page, split: boolean, theme: 'light' | 'dark' = 'light') {
  await gotoHub(page, '/board', { theme });
  if (!split) return;
  const d = await openAdd(page);
  await d.getByRole('row', { name: /^atlas/ }).click();
  await d.getByRole('row', { name: new RegExp('^' + S['program.terminal']) }).click();
  await d.getByRole('row', { name: /^New session/ }).click();
  await expect(picker(page)).toBeHidden();
  await expect(page.getByRole('group', { name: S['empty.chip'] })).toHaveCount(0);
}

for (const [label, size] of [
  ['1440', { width: 1440, height: 900 }],
  ['1024', { width: 1024, height: 768 }],
] as const) {
  for (const [scheme, split] of [['light', false], ['dark', false], ['light', true], ['dark', true]] as const) {
    const name = `${label} ${scheme} ${split ? 'split' : 'empty'}`;
    test.describe(name, () => {
      test.use({ viewport: size });

      test('the picker is the slot: its own Add and recents hide, the picker sits on the slot body, closing gives them back', async ({ page }, info) => {
        // A split Board adds a program first: 25-32 s on a slow machine with every step correct (one trace: 13.5 s to
        // navigate, 11.6 s to the shell), past the 30 s default.
        test.setTimeout(90_000);
        await board(page, split, scheme);
        const d = await openAdd(page);
        const slot = page.getByRole('group', { name: S['empty.chip'] });
        await expect(slot).toHaveCount(1);
        const own = slot.locator('button', { hasText: S['empty.add'] });
        await expect(own).toHaveCount(1);
        await expect(own).toBeHidden();
        for (const g of await slot.locator('[role="group"]').all()) await expect(g).toBeHidden();
        const bodyBox = await slot.locator('[data-picking]').boundingBox();
        const dBox = await d.boundingBox();
        expect(bodyBox && dBox).toBeTruthy();
        // Placed against the body's top edge: 8 px below it when there is room below, else flipped above it.
        const below = Math.abs(dBox!.y - (bodyBox!.y + 8));
        const above = Math.abs(dBox!.y + dBox!.height - (bodyBox!.y - 8));
        expect(Math.min(below, above)).toBeLessThanOrEqual(2);
        // Centred on the body, unless the screen edge pushed it in.
        const mid = bodyBox!.x + bodyBox!.width / 2;
        if (mid - dBox!.width / 2 >= 8 && mid + dBox!.width / 2 <= size.width - 8) expect(Math.abs(dBox!.x + dBox!.width / 2 - mid)).toBeLessThanOrEqual(2);
        else expect(dBox!.x >= 0 && dBox!.x + dBox!.width <= size.width).toBe(true);
        await page.screenshot({ path: info.outputPath(`addslot-${name.replace(/\W+/g, '-')}.png`) });
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
        await expect(slot.locator('[data-picking]')).toHaveCount(0);
        await expect(own).toBeVisible();
        // Focus goes back to the Add that opened it: the welcome's own on an empty Board, the bar's on a split one.
        if (split) await expect(page.getByRole('button', { name: S['board.addProgram'] }).first()).toBeFocused(); // reason: the strip's Add comes before the slot's own of the same name
        else await expect(own).toBeFocused();
        // No key cap inside the slot's Add: N is in its tooltip only.
        await expect(own.locator('kbd')).toHaveCount(0);
        await expect(own).toHaveText(S['empty.add']!);
      });
    });
  }
}

test.describe('390 touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the picker is the phone sheet; closing it shows the slot with its Add', async ({ page }, info) => {
    await board(page, false);
    const d = await openAdd(page);
    await page.screenshot({ path: info.outputPath('addslot-390.png') });
    await d.getByRole('button', { name: 'Close', exact: true }).and(d.locator(':not([data-dialog-close])')).click();
    await expect(d).toBeHidden();
    await expect(page.getByRole('group', { name: S['empty.chip'] }).locator('button', { hasText: S['empty.add'] })).toBeVisible();
  });
});

test.describe('1440 three empty slots', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('one click on an inactive slot opens its picker; N names and opens the first empty slot, not the active one', async ({ page }) => {
    await board(page, true);
    await page.getByRole('button', { name: S['layout'], exact: true }).click();
    await page.getByRole('menuitemradio', { name: S['layout.grid'] }).or(page.getByRole('menuitem', { name: S['layout.grid'] })).click();
    const slots = page.getByRole('group', { name: S['empty.chip'] });
    await expect(slots).toHaveCount(3);
    const own = (i: number) => slots.nth(i).locator('button', { hasText: S['empty.add'] });
    // The last slot is not the active one: a single click on its Add opens its picker (activation does not remount it).
    await own(2).click();
    await expect(picker(page)).toBeVisible();
    await expect(slots.nth(2).locator('[data-picking]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toBeHidden();
    // The last slot is active now; N still goes to the first empty slot, and only that slot's Add names it.
    await expect(own(0)).toHaveAttribute('aria-keyshortcuts', 'N');
    await expect(own(1)).not.toHaveAttribute('aria-keyshortcuts', /./);
    await expect(own(2)).not.toHaveAttribute('aria-keyshortcuts', /./);
    await page.getByRole('group', { name: S['tiles'] }).focus();
    await page.keyboard.press('n');
    await expect(picker(page)).toBeVisible();
    await expect(slots.nth(0).locator('[data-picking]')).toHaveCount(1);
  });
});
