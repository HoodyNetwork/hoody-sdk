// Playwright: at 1350 px the Bot's header is two rows, the name with its state and the meta line,
// with the actions beside them (a third row would push the actions under the meta when Stop and Bot settings are long). Measured
// on a running Bot, a paused one, the Link tab of a Bot with no link, the Work tab and two Bots needing a fix, in both
// reading directions.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

/** The header's rows: the distinct lines of the name and each meta item (centres 8 px apart count as one), and whether the
 *  actions start beside them (above the bottom of the name and meta) rather than on a row of their own. */
const rows = (page: Page) =>
  page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('#hub-main header')).find((e) => e.querySelector('h2')?.textContent?.trim() === 'Chief')!;
    const meta = h.querySelector('h2')!.parentElement!.nextElementSibling;
    const acts = h.lastElementChild!;
    const parts = [h.querySelector('h2')!, ...(meta ? Array.from(meta.children) : [])];
    const tops = parts.map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.top + r.height / 2).sort((a, b) => a - b);
    const lines: number[] = [];
    for (const t of tops) if (!lines.length || t - lines[lines.length - 1]! > 8) lines.push(t);
    const titles = h.querySelector('h2')!.parentElement!.parentElement!.getBoundingClientRect();
    const a = acts.getBoundingClientRect();
    return { lines: lines.length, metaKids: meta?.children.length ?? 0, beside: a.top < titles.bottom - 1 };
  });

for (const [name, state, extra] of [
  ['a running Bot', 'working', ''],
  ['a paused Bot', 'paused', ''],
  ['the Link tab of a Bot with no link', 'noLink', '&tab=link'],
  ['the Work tab', 'working', '&tab=work'],
] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`the header is two rows at 1350 px: ${name} (${dir})`, async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      await gotoHub(page, `${URL}${extra}`, { state });
      if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
      await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
      await page.waitForTimeout(300);
      const r = await rows(page);
      expect(r.metaKids, 'the meta line holds the computer, the model, Auto-approve and "+N"').toBeGreaterThanOrEqual(4);
      expect(r.lines, 'the name\'s line and one meta line').toBeLessThanOrEqual(2);
      expect(r.beside, 'the actions beside them, not on a row of their own').toBe(true);
    });
  }
}

// A running Bot that needs a fix: Stop and Fix are the actions that matter then, so Bot settings and the
// Details toggle lead the Bot's ⋯ (Details alone left the meta 32 px short).
// Stop, Fix, More and the list toggle fit beside the name and the meta line in the 722 px header with the list beside it,
// and with it folded away. The reason beside the name lets the button say only "Fix".
for (const [name, state] of [
  ['a chat app with no owner (Fix in Chat apps)', 'chatAppAttention'],
  ['a model whose provider needs a key (Fix in settings)', 'needsKey'],
] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`a running Bot needing a fix at 1350 px: ${name} (${dir})`, async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      for (const extra of ['', '&list=0']) {
        await gotoHub(page, `${URL}${extra}`, { state });
        if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
        await expect(page.getByRole('heading', { level: 2, name: 'Chief' })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Fix in / })).toHaveText(/^Fix$/);
        await page.waitForTimeout(300);
        const r = await rows(page);
        const where = extra ? 'list folded away' : 'list beside';
        expect(r.lines, `${where}: the name's line and one meta line`).toBe(2);
        expect(r.beside, `${where}: the actions beside them, not on a row of their own`).toBe(true);
        const head = page.getByRole('heading', { level: 2, name: 'Chief' }).locator('xpath=ancestor::header[1]');
        await expect(head.getByRole('button', { name: /^(Bot settings|Details)$/ }), `${where}: Bot settings and Details are not header buttons`).toHaveCount(0);
      }
      // Bot settings and Details lead the ⋯; Details opens the panel as the button did.
      await page.getByRole('heading', { level: 2, name: 'Chief' }).locator('xpath=ancestor::header[1]').getByRole('button', { name: 'More actions' }).click();
      const items = page.getByRole('menuitem');
      // nth(0)/nth(1): the order of the first two entries is the point.
      await expect(items.nth(0)).toHaveText(/^Bot settings/);
      await expect(items.nth(1)).toHaveText('Details');
      await items.nth(1).click();
      await expect(page.getByRole('complementary', { name: 'Details' })).toBeVisible();
    });
  }
}
