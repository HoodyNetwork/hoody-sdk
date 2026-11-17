// Playwright: a tile with a saved option shows the count on its options button
// (the icon, a 6 px dot and the number), not a separate chip, and the button opens the options. The header reads
// name · computer, ⇕ session and the state dot right after the name, then options, maximise, reload, ⋯ at the end; no
// key cap shows; hovering the count button shows its name as the tooltip, with O. Shots light and dark.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const S = strings as Record<string, string>;

/** A Board with a new terminal session on atlas, and one option saved on it (font size 18). */
async function tileWithOption(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/board', { theme });
  await page.getByRole('button', { name: S['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  const d = page.getByRole('dialog', { name: S['picker.title'] });
  await d.getByRole('row', { name: /^atlas/ }).click();
  await d.getByRole('row', { name: new RegExp('^' + S['program.terminal']) }).click();
  await d.getByRole('row', { name: /^New session/ }).click();
  await expect(d).toBeHidden();
  const tile = page.getByRole('group', { name: /^terminal-\d+ · atlas/ });
  await tile.getByRole('button', { name: /^Options for terminal-\d+$/ }).click();
  const o = page.getByRole('dialog', { name: /Options for terminal-\d+/ });
  await o.getByRole('button', { name: 'Text' }).click();
  const size = o.getByRole('textbox', { name: 'Font size' });
  await size.fill('18');
  await size.press('Tab');
  await o.getByRole('button', { name: 'Save' }).click();
  await expect(o).toBeHidden();
  return tile;
}

for (const theme of ['light', 'dark'] as const) {
  test(`saved options are a count on the options button, which opens them; ⇕ and the dot follow the name (${theme})`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const tile = await tileWithOption(page, theme);
    const b = tile.getByRole('button', { name: /^Options for terminal-\d+ \(1 changed\)$/ });
    await expect(b).toBeVisible();
    await expect(tile.getByRole('button', { name: /^\d+ changed$/ })).toHaveCount(0);
    await expect(b).toHaveText('1');
    // ⇕ and the state dot follow the name (the label hugs its text): the session button starts within 24 px of the label.
    const gap = await tile.evaluate((g) => {
      const head = g.firstElementChild as HTMLElement;
      const label = head.querySelector<HTMLElement>('[class*="label"]')!.getBoundingClientRect();
      const session = head.querySelector<HTMLElement>('button')!.getBoundingClientRect();
      return getComputedStyle(head).direction === 'rtl' ? label.left - session.right : session.left - label.right;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(24);
    // The header's order: session, the state dot, then options, maximise, reload, ⋯; no key cap.
    const order = await tile.evaluate((g) => [...g.firstElementChild!.querySelectorAll<HTMLElement>('button, [role="img"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('role') === 'img' ? 'dot' : e.getAttribute('aria-label') ?? '')));
    const at = (re: RegExp) => { const k = order.findIndex((n) => re.test(n)); expect(k, `${re} is in the header`).toBeGreaterThanOrEqual(0); return k; };
    const session = at(/^Change session/), dot = at(/^dot$/), options = at(/^Options for/);
    const max = at(/^Maximi[sz]e/i), reload = at(/^Reload/i), menu = at(new RegExp('^' + S['tile.menu']));
    expect([session < dot, dot < options, options < max, max < reload, reload < menu]).toEqual([true, true, true, true, true]);
    expect(await tile.evaluate((g) => g.firstElementChild!.querySelectorAll('kbd').length)).toBe(0);
    const hb = (await tile.locator('xpath=*[1]').boundingBox())!;
    await page.screenshot({ path: info.outputPath(`tilehead-count-${theme}.png`), clip: { x: hb.x, y: hb.y, width: hb.width, height: hb.height } });
    // Its tooltip is its own name (kit nameTooltip): hover shows it, with O while keys are on.
    const bb = (await b.boundingBox())!;
    await b.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText(/^Options for terminal-\d+ \(1 changed\)/);
    await expect(tip.locator('kbd')).toHaveText('O');
    await page.screenshot({ path: info.outputPath(`tilehead-count-tip-${theme}.png`), clip: { x: Math.max(0, bb.x - 300), y: bb.y - 8, width: 560, height: 90 } });
    await b.click();
    await expect(page.getByRole('dialog', { name: /Options for terminal-\d+/ })).toBeVisible();
  });
}
