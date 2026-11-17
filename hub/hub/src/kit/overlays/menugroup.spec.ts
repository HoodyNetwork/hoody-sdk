// Playwright: the computed side of menugroup.test.tsx on the gallery's grouped Layout menu and
// its Row actions menu, light and dark. A keyboard open lands on the current choice of the first one-of group, else the
// first enabled non-danger item (React Aria's own autofocus, which happy-dom cannot lay out); the state combinations
// paint as specified; the on/off box edges read; axe finds nothing on the open grouped menu.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';

/** A token's colour as the page computes it, read through `prop` so a background token compares with a background. */
const token = (page: Page, name: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
const css = (l: Locator, prop: 'backgroundColor' | 'borderTopColor' | 'color' | 'opacity') => l.evaluate((el, p) => getComputedStyle(el)[p], prop);
const row = (page: Page, name: string) => page.locator('[role^="menuitem"]').filter({ has: page.locator('[slot="label"]', { hasText: new RegExp(`^${name}$`) }) });
const focused = async (page: Page) => page.evaluate(() => document.activeElement?.querySelector('[slot="label"]')?.textContent ?? document.activeElement?.getAttribute('role'));

/** `top` painted over the opaque `under` (a translucent fill such as --pop-hover reads as it shows). */
const over = (top: string, under: string) => {
  const [r, g, b, a = 1] = (top.match(/[\d.]+/g) ?? []).map(Number);
  const [R, G, B] = (under.match(/[\d.]+/g) ?? []).map(Number);
  const mix = (x = 0, y = 0) => Math.round(x * a + y * (1 - a));
  return `rgb(${mix(r, R)}, ${mix(g, G)}, ${mix(b, B)})`;
};

/** WCAG contrast of two opaque rgb() colours. */
const contrast = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

test.describe('keyboard open', () => {
  test.use({ viewport: { width: 1350, height: 900 } });

  test('Enter on the Layout menu lands on the current preset; Escape returns to the trigger', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/_kit?tab=overlays');
    const trigger = page.getByRole('button', { name: gallery['btn.layoutMenu'], exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect.poll(() => focused(page)).toBe(gallery['menu.g.side']);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('ArrowUp on the Row actions menu never lands on Delete: the first enabled non-danger item', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHub(page, '/_kit?tab=overlays');
    const trigger = page.getByRole('button', { name: gallery['btn.menu'], exact: true });
    await trigger.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect.poll(() => focused(page)).toBe(gallery['menu.makeCurrent']);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`grouped menu (${theme})`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });

    test(`state combinations paint as specified (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays&menu=groups', { theme });
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      const hover = await token(page, '--pop-hover');
      const selected = await token(page, '--hx-selected-bar');
      const off = await token(page, '--pop-off');
      const muted = await token(page, '--hx-muted');
      const popBg = await token(page, '--pop-bg');
      const ink = await token(page, '--hx-ink');

      // Focused + current: the fill is --pop-hover and the blue check stays --hx-selected-bar.
      const side = row(page, gallery['menu.g.side']);
      await side.focus();
      expect(await css(side, 'backgroundColor'), 'focused current fill').toBe(hover);
      expect(await css(side.locator('[data-current]'), 'color'), 'current mark').toBe(selected);
      expect(await side.getAttribute('aria-checked')).toBe('true');

      // Focused + danger unavailable: --pop-off label and lead on --pop-hover, full opacity.
      const del = row(page, gallery['menu.g.deleteBoard']);
      await del.focus();
      expect(await css(del, 'backgroundColor'), 'focused off danger fill').toBe(hover);
      expect(await css(del.locator('[slot="label"]'), 'color'), 'off danger label').toBe(off);
      expect(await css(del.locator('[data-lead]'), 'color'), 'off danger lead').toBe(off);
      expect(await css(del, 'opacity')).toBe('1');
      // Its group note stayed with Rename; Delete says the reason on its own line, readable.
      expect(await del.locator('[slot="description"]').textContent()).toBe(gallery['menu.g.saving']);
      expect(await css(del.locator('[slot="description"]'), 'color'), 'reason line').toBe(muted);

      // Unavailable presets: their shared reason shows once as a note, both described by it.
      const notes = menu.locator('[data-note]');
      await expect(notes).toHaveText([gallery['menu.g.tooNarrow'], gallery['menu.g.saving']]);
      for (const n of [gallery['menu.g.stacked'], gallery['menu.g.three']])
        await expect(row(page, n)).toHaveAccessibleDescription(gallery['menu.g.tooNarrow']);

      // On/off boxes, each read as painted on its own row's fill: an enabled unticked edge reaches 3:1 on the menu and
      // on the focused fill; ticked = ink fill; unavailable = --pop-off edge.
      const names = row(page, gallery['menu.g.names']).locator('[data-box]');
      expect(await css(names, 'backgroundColor'), 'ticked box fill').toBe(ink);
      const lines = row(page, gallery['menu.g.lines']).locator('[data-box]');
      expect(await css(lines, 'borderTopColor'), 'unavailable box edge').toBe(off);
      const labelsRow = row(page, gallery['menu.g.labels']);
      const labels = labelsRow.locator('[data-box]');
      expect(await labelsRow.getAttribute('aria-checked')).toBe('false');
      expect(contrast(over(await css(labels, 'borderTopColor'), popBg), popBg), 'enabled unticked box edge on the menu').toBeGreaterThanOrEqual(3);
      await labelsRow.focus();
      expect(await css(labelsRow, 'backgroundColor'), 'focused row fill').toBe(hover);
      const focusedFill = over(hover, popBg);
      expect(contrast(over(await css(labels, 'borderTopColor'), focusedFill), focusedFill), 'enabled unticked box edge, focused').toBeGreaterThanOrEqual(3);
      await row(page, gallery['menu.g.names']).focus();
      expect(await css(names, 'backgroundColor'), 'ticked box fill, focused').toBe(ink);
      expect(contrast(ink, focusedFill), 'ticked box on the focused fill').toBeGreaterThanOrEqual(3);

      // Groups are found by their names; the danger section carries its group's.
      await expect(page.getByRole('group', { name: gallery['menu.g.board'] })).toHaveCount(2);
      await expect(page.getByRole('group', { name: gallery['menu.g.presets'] })).toHaveCount(1);
    });

    test(`focused + available danger: --hx-danger on --pop-hover (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays&menu=1', { theme });
      await expect(page.getByRole('menu')).toBeVisible();
      const del = row(page, gallery['menu.delete']);
      await del.focus();
      expect(await css(del, 'backgroundColor')).toBe(await token(page, '--pop-hover'));
      expect(await css(del.locator('[slot="label"]'), 'color')).toBe(await token(page, '--hx-danger'));
      expect(await css(del.locator('[data-lead]'), 'color')).toBe(await token(page, '--hx-danger'));
    });

    test(`axe finds nothing on the open grouped menu (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await gotoHub(page, '/_kit?tab=overlays&menu=groups', { theme });
      await expect(page.getByRole('menu')).toBeVisible();
      // label-content-name-mismatch (experimental) is off here: a row's shortcut hint (Kbd) and the line under its label
      // (its description) are visible text outside its name by design, on every ActionMenu (the Row
      // actions menu flags the same).
      const axe = await new AxeBuilder({ page }).include('[role="menu"]').disableRules(['label-content-name-mismatch']).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    });
  });
}
