// Playwright: the focus box on what code focuses, by real mouse and keyboard. Before the first key: no
// box on a heading code focused (a page title, a drawer heading), though it holds focus. The first key draws it, and the
// first Tab reaches a control with its ring. A mouse press does not lift it. A control, a roving option or a panel that is
// not a heading, focused before any key, keeps its ring. Forced colours: no stray box before a key, a box after.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const BOT = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const lifted = (page: Page) => page.evaluate(() => !document.documentElement.hasAttribute('data-hx-no-key'));
const title = (page: Page) => page.locator('#hub-main [data-hub-page]:not([data-hub-page-hidden]) h1[data-hub-title]');
/** What the element draws for focus: its box-shadow, or its outline when one is drawn. */
const mark = (l: Locator) => l.evaluate((el) => {
  const c = getComputedStyle(el);
  return { box: c.boxShadow !== 'none', outline: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0, visible: el.matches(':focus-visible') };
});
const none = { box: false, outline: false };
const press = async (page: Page, l: Locator) => {
  await l.waitFor();
  const b = await l.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
};
const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('link', { name, exact: true }).first(); // the sidebar link; a collapsed group repeats it

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1350, height: 900 }));

test('@firstkey a first load draws no box on the focused title, and a key on it draws the box', async ({ page }) => {
  await gotoHub(page, '/');
  const h = title(page);
  await expect(h).toBeFocused();
  expect(await mark(h)).toMatchObject({ ...none, visible: true });
  await page.keyboard.press('Shift');
  expect(await lifted(page)).toBe(true);
  expect((await mark(h)).box, 'the box after a key').toBe(true);
});

test('@firstkey the first Tab after a load reaches a control with its visible focus', async ({ page }) => {
  await gotoHub(page, '/');
  await expect(title(page)).toBeFocused();
  await page.keyboard.press('Tab');
  const on = page.locator(':focus');
  expect(await on.evaluate((el) => el.hasAttribute('data-hub-title'))).toBe(false);
  const m = await mark(on);
  expect(m.visible).toBe(true);
  expect(m.box || m.outline, 'a focus mark on the control').toBe(true);
});

test('@firstkey the mouse never draws the box, and does not lift the rule', async ({ page }) => {
  await gotoHub(page, '/');
  await press(page, nav(page, 'Files'));
  const h = title(page);
  await expect(h).toHaveText('Files');
  await expect(h).toBeFocused();
  expect(await mark(h)).toMatchObject({ ...none });
  await page.goBack();
  await expect(title(page)).toBeFocused();
  expect(await lifted(page), 'the rule still holds after a mouse press and the back button').toBe(false);
  const samples = await page.evaluate(async () => {
    const out: unknown[] = [];
    for (let i = 0; i < 30; i++) {
      const el = [...document.querySelectorAll<HTMLElement>('#hub-main [data-hub-page]:not([data-hub-page-hidden]) h1[data-hub-title]')][0];
      if (el) {
        const c = getComputedStyle(el);
        if (c.boxShadow !== 'none') out.push({ i, connected: el.isConnected, active: document.activeElement === el, fv: el.matches(':focus-visible'), dfv: el.hasAttribute('data-focus-visible'), noKey: document.documentElement.hasAttribute('data-hx-no-key'), shadow: c.boxShadow.slice(0, 60), transition: c.transitionProperty + ' ' + c.transitionDuration });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  });
  expect(samples, 'no box on the title at any time in the 1.5 s after Back').toEqual([]);
  expect(await mark(title(page))).toMatchObject({ ...none });
});

test('@firstkey keyboard navigation draws the box on the new title', async ({ page }) => {
  await gotoHub(page, '/');
  await page.keyboard.press('Tab');
  await nav(page, 'Files').focus();
  await page.keyboard.press('Enter');
  const h = title(page);
  await expect(h).toHaveText('Files');
  await expect(h).toBeFocused();
  expect((await mark(h)).box).toBe(true);
});

test('@firstkey a drawer opened by its URL: no box on the heading until a key, and none by mouse', async ({ page }) => {
  await gotoHub(page, `${BOT}&settings=model`);
  const heading = page.getByRole('dialog').locator('#set-mc-h');
  await expect(heading).toBeFocused();
  expect(await mark(heading)).toMatchObject({ ...none, visible: true });
  await page.keyboard.press('Shift');
  expect((await mark(heading)).box, 'the box after a key').toBe(true);
  await gotoHub(page, BOT);
  await press(page, page.getByRole('button', { name: 'Settings' }).first()); // the Bot's own Settings, before any row's
  await expect(heading).toBeFocused();
  expect(await mark(heading)).toMatchObject({ ...none });
});

test('@firstkey a roving option focused by code before any key is its list\'s tab stop and shows its ring', async ({ page }) => {
  await gotoHub(page, `${BOT}&settings=model`);
  // A roving list makes the focused option its tab stop (tabindex 0), so the option is pinned by a mark of its own first.
  const pick = page.getByRole('dialog').locator('[role="option"][tabindex="-1"]').first(); // any option off the tab stop serves
  await expect(pick).toBeVisible();
  await pick.evaluate((el) => el.setAttribute('data-probe-off', ''));
  const off = page.locator('[data-probe-off]');
  await off.evaluate((el) => (el as HTMLElement).focus());
  await expect(off).toBeFocused();
  await expect(off).toHaveAttribute('tabindex', '0');
  expect(await lifted(page)).toBe(false);
  const m = await mark(off);
  expect(m.visible).toBe(true);
  expect(m.box || m.outline, 'the option draws its mark with no key yet').toBe(true);
});

test('@firstkey a control focused by code before any key keeps its ring, as on arrival by URL or reload', async ({ page }) => {
  await gotoHub(page, '/');
  const control = page.locator('#hub-main button:visible').first(); // any control on Home serves
  await control.evaluate((el) => (el as HTMLElement).focus());
  await expect(control).toBeFocused();
  expect(await lifted(page)).toBe(false);
  const m = await mark(control);
  expect(m.visible).toBe(true);
  expect(m.box || m.outline, 'a focus mark on the control with no key yet').toBe(true);
});

test('@firstkey a panel that is not a heading, focused by code before any key, keeps its ring', async ({ page }) => {
  await gotoHub(page, '/');
  // Any element held by tabindex="-1" that is not a heading, as a result panel that replaces a form takes focus.
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.tabIndex = -1;
    el.setAttribute('data-probe-panel', '');
    el.textContent = 'probe';
    document.querySelector('#hub-main')!.prepend(el);
    el.focus();
  });
  const panel = page.locator('[data-probe-panel]');
  await expect(panel).toBeFocused();
  expect(await lifted(page)).toBe(false);
  const m = await mark(panel);
  expect(m.visible).toBe(true);
  expect(m.box || m.outline, 'the panel draws its ring with no key yet').toBe(true);
});

test('@firstkey a text field clicked before any key keeps its ring', async ({ page }) => {
  await gotoHub(page, '/');
  const field = page.getByRole('searchbox').or(page.locator('input[type="search"], input[type="text"]')).first(); // the top bar's search, the first field on Home
  await press(page, field);
  await expect(field).toBeFocused();
  expect(await lifted(page)).toBe(false);
  const m = await mark(field);
  expect(m.visible, 'a click into a text field counts as visible focus').toBe(true);
  expect(m.box || m.outline, 'the field draws its ring').toBe(true);
});

test('@firstkey forced colours: no stray box before a key, a box after it', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await gotoHub(page, '/');
  const h = title(page);
  await expect(h).toBeFocused();
  expect(await mark(h)).toMatchObject({ ...none });
  await page.keyboard.press('Shift');
  expect((await mark(h)).outline, 'an outline: forced colours drop every box-shadow').toBe(true);
});

test('@firstkey forced colours: a control focused by code before any key keeps its mark', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await gotoHub(page, '/');
  const control = page.locator('#hub-main button:visible').first(); // any control on Home serves
  await control.evaluate((el) => (el as HTMLElement).focus());
  await expect(control).toBeFocused();
  expect(await lifted(page)).toBe(false);
  const before = await mark(control);
  await page.keyboard.press('Shift');
  expect(await lifted(page)).toBe(true);
  const after = await mark(control);
  const name = await control.evaluate((el) => `${el.className} ${el.getAttribute('aria-label') ?? el.textContent ?? ''}`.slice(0, 80));
  expect(before, `the rule leaves a control's forced-colours mark as a key leaves it (${name})`).toEqual(after);
});
