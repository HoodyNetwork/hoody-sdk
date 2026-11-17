// Playwright: on the Files page every control of the pane's rail, one 32 px hairline rail,
// is 32 px: the computer picker (in the folder bar), Find, More (Run here, Download from link, Put on Board), Up one folder, Search, Kind, View options and Refresh. List /
// Icons is the kit's folder-tab strip, a tab strip at the tab height, not a toolbar control: it
// keeps it. Icon buttons are 32 px squares. Each control wears the kit's toolbar look (as toolbar.d17.spec.ts reads it:
// the picker and Search the field line and fill; Up, Find, More, View options and Refresh grey button plates), and
// a disabled icon button takes the kit's one disabled recipe. New folder and Upload keep their own look. Files only: another table
// toolbar keeps 40. A coarse pointer keeps 44.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';
import strings from './strings.en.json';
import mountStrings from './Mount.strings.en.json';

const AT = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';
const TOP = '/files?a=atlas.00a1&ap=%2F';
const pane = (page: Page) => page.getByRole('region', { name: strings['pane.a'] });
const named = (page: Page, name: string | RegExp) => pane(page).getByRole('button', { name, exact: typeof name === 'string' });

/** A colour token as the page computes it. */
const colour = (page: Page, value: string) =>
  page.evaluate((v) => {
    const el = document.createElement('div');
    el.style.color = v;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, value);

const look = (el: Locator) =>
  el.evaluate((n) => {
    const c = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return {
      h: Math.round(r.height),
      w: Math.round(r.width),
      line: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
      fill: c.backgroundColor,
      opacity: c.opacity,
      plate: c.getPropertyValue('--plate').trim(),
      plateLine: c.getPropertyValue('--plate-line').trim(),
    };
  });

/** Every 32 px control of the rail, by its accessible name (the Kind chip and the view group by their own roles). */
function rail(page: Page) {
  const p = pane(page);
  return {
    picker: p.getByRole('button', { name: strings['pick.label'].replace('{{pane}}', strings['pane.a']) }),
    up: named(page, strings['action.up']),
    find: named(page, strings['action.find']),
    more: named(page, strings['action.more']),
    search: p.getByRole('searchbox'),
    kind: p.locator('[data-chip="kind"]'),
    options: named(page, kit['table.view']),
    refresh: named(page, kit['action.refresh']),
  };
}

for (const theme of ['light', 'dark'] as const)
  test(`${theme}: every control of the Files rail is 32 px, in the kit toolbar look`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, AT, { theme });
    await expect(pane(page).locator('tbody tr').first()).toBeVisible();
    const line = `1px solid ${await colour(page, 'var(--hx-field-line)')}`;
    const fill = await colour(page, 'var(--hx-field-bg)');
    const r = rail(page);
    for (const [name, el] of Object.entries(r)) expect((await look(el)).h, `${name} is 32 px tall`).toBe(32);
    // List / Icons: the folder-tab strip keeps the tab height (--tabs-h), as on every other page.
    const tabs = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabs-h')));
    expect((await look(pane(page).getByRole('radiogroup', { name: kit['table.present'] }))).h, 'List / Icons keeps the tab height').toBe(tabs);
    for (const name of ['up', 'more', 'options', 'refresh'] as const)
      expect((await look(r[name])).w, `${name} is a 32 px square`).toBe(32);
    // Browse has no Mount (the Use from your PC tab is its one entry in Files).
    await expect(named(page, mountStrings['mount.short'])).toHaveCount(0);
    for (const name of ['picker', 'search'] as const) {
      const l = await look(r[name]);
      expect([l.line, l.fill], `${name} wears the field line and fill`).toEqual([line, fill]);
    }
    // The icon buttons are grey button plates: the plate fill in the plate's frame, as the theme resolves them.
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { plate: cs.getPropertyValue('--hx-btn-plate').trim(), line: cs.getPropertyValue('--hx-btn-line').trim() };
    });
    if (theme === 'light') expect(tokens, 'light: the designer\'s plate').toEqual({ plate: '#e3e3e3', line: '#7a7a7a' });
    for (const name of ['up', 'find', 'more', 'options', 'refresh'] as const) {
      const l = await look(r[name]);
      expect({ plate: l.plate, line: l.plateLine }, `${name} is a grey button plate`).toEqual(tokens);
    }
    // New folder and Upload are unchanged: 32 px secondary buttons, not the field look.
    for (const name of [strings['action.newFolder'], /^Upload/]) {
      const l = await look(named(page, name));
      expect(l.h, `${String(name)} stays 32 px`).toBe(32);
      expect(l.fill, `${String(name)} keeps its own fill`).not.toBe(fill);
    }
  });

test('a disabled icon button of the rail takes the kit disabled recipe (Up at the top folder)', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, TOP);
  const d = named(page, strings['action.up']);
  await expect(d).toBeDisabled();
  await expect(d).toBeVisible();
  const l = await look(d);
  expect([l.h, l.w]).toEqual([32, 32]);
  // The 32 rail's look is the one recipe: the toolbar line and fill, at --ctl-off-opacity.
  const on = await look(named(page, strings['action.find']));
  expect(l.line, 'the toolbar line, solid').toBe(on.line);
  expect(l.fill, 'the toolbar fill').toBe(on.fill);
  expect(l.opacity, 'the kit disabled opacity').toBe('0.5');
});

test('at phone width the folder actions are 32 px squares too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, AT);
  await expect(pane(page).locator('tbody tr').first()).toBeVisible();
  const r = rail(page);
  for (const name of ['up', 'find', 'more', 'options', 'refresh'] as const)
    expect([(await look(r[name])).h, (await look(r[name])).w], `${name} is a 32 px square`).toEqual([32, 32]);
});

test('another table toolbar keeps the 40 px family (Files only)', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/computers');
  const refresh = page.getByRole('button', { name: kit['action.refresh'], exact: true });
  await expect(refresh).toBeVisible();
  expect((await look(refresh)).h).toBe(40);
});

test.describe('on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the rail keeps the 44 px touch size', async ({ page }) => {
    await gotoHub(page, AT);
    await expect(pane(page).locator('tbody tr').first()).toBeVisible();
    const r = rail(page);
    for (const name of ['up', 'options', 'refresh', 'search'] as const)
      expect((await look(r[name])).h, `${name} is 44 px on touch`).toBe(44);
  });
});
