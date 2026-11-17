// Playwright: the gallery's guided-setup drawer (/_kit?tab=overlays&open=
// drawer-setup), the banner with a recovery action (?tab=states&part=outcomes) and the secret field's promises
// (?tab=secure&part=secrets). Wide: the step holds the primary, the footer holds the reason line and Cancel only. 390: the sticky
// footer mirrors the primary full width and the step's own is gone, the reason line above it; so does a wide screen's
// drawer drawn narrow. The banner's action keeps
// its place before the close; the promises wrap between them. Light and dark; nothing wider than the page.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`drawer foot, banner actions, promises at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('the guided-setup primary sits in the step when wide and in the sticky footer at 390; the reason line shows', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=overlays&open=drawer-setup', { theme });
        const dialog = page.getByRole('dialog', { name: 'Connect a mail server' });
        await expect(dialog).toBeVisible();
        const foot = dialog.locator('footer');
        await expect(foot.getByText('Connect signs in to the server once to check the address.')).toBeVisible();
        // The step's own primary sits in the drawer body; the mirrored one in the footer.
        const step = dialog.locator('[data-drawer-body]');
        if (width === 1440) {
          await expect(step.getByRole('button', { name: 'Connect' })).toBeVisible();
          await expect(foot.getByRole('button', { name: 'Connect' })).toHaveCount(0);
          await expect(dialog.locator('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary', '');
          // Drawn narrow on a wide screen, the body under 600 px but the drawer at or over 480 (the old narrow-footer bound, so
          // only the mirror's own data-narrow lays the footer out as a phone's): the footer mirrors the primary, the reason line
          // on its own row above the buttons. Home is the narrowest; each ArrowLeft (the edge moves left) adds 16.
          const handle = dialog.getByRole('separator');
          await handle.focus();
          await page.keyboard.press('Home');
          for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
          await expect(handle).toHaveAttribute('aria-valuenow', '520');
          await expect(dialog.locator('[data-drawer-body]')).toHaveAttribute('data-foot-primary', '');
          await expect(step.getByRole('button', { name: 'Connect' })).toBeHidden();
          await expect(foot.getByRole('button', { name: 'Connect' })).toBeVisible();
          const narrow = await foot.evaluate((f) => {
            const b = [...f.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Connect')!.getBoundingClientRect();
            const r = f.querySelector('[data-drawer-reason]')!.getBoundingClientRect();
            return r.bottom <= b.top + 0.5;
          });
          expect(narrow, 'drawn narrow, the reason line sits above the buttons').toBe(true);
        } else {
          await expect(step.getByRole('button', { name: 'Connect' })).toBeHidden();
          const btn = foot.getByRole('button', { name: 'Connect' });
          await expect(btn).toBeVisible();
          const m = await foot.evaluate((f) => {
            const b = [...f.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Connect')!.getBoundingClientRect();
            const r = f.querySelector('[data-drawer-reason]')!.getBoundingClientRect();
            return { reasonAbove: r.bottom <= b.top + 0.5, h: b.height, fb: f.getBoundingClientRect() };
          });
          expect(m.reasonAbove, 'the reason line sits above the buttons').toBe(true);
          // A kit button's height: --btn-h with a mouse (this test's pointer), --touch-min on a coarse pointer (44, measured).
          const full = await page.evaluate(() => { const e = document.createElement('div'); e.style.height = 'max(var(--btn-h), var(--touch-min))'; document.body.append(e); const h = e.getBoundingClientRect().height; e.remove(); return h; });
          expect(m.h, 'the mirrored primary is a full button').toBeGreaterThanOrEqual(full - 0.5);
        }
        const over = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });

      test('a banner\'s recovery action sits before its close, inside the banner', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=states&part=outcomes', { theme });
        const banner = page.locator('[data-outcome]').filter({ hasText: 'Your sign-in to OpenRouter ended' });
        await banner.scrollIntoViewIfNeeded();
        const m = await banner.evaluate((b) => {
          const bb = b.getBoundingClientRect();
          const buttons = [...b.querySelectorAll('button')].map((x) => ({ name: x.textContent?.trim(), r: x.getBoundingClientRect() }));
          return { names: buttons.map((x) => x.name), inside: buttons.every((x) => x.r.left >= bb.left - 0.5 && x.r.right <= bb.right + 0.5) };
        });
        expect(m.names[0]).toBe('Sign in again');
        expect(m.names.length).toBe(2);
        expect(m.inside, 'every button inside the banner').toBe(true);
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });

      test('a secret field\'s promises show with a glyph each and wrap between them', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=secure&part=secrets', { theme });
        const row = page.locator('[data-secret-promises]').first();
        await row.scrollIntoViewIfNeeded();
        const m = await row.evaluate((r) => {
          const rb = r.getBoundingClientRect();
          const items = [...r.querySelectorAll('[data-secret-promise]')].map((c) => ({ r: c.getBoundingClientRect(), glyph: c.querySelector('svg') !== null }));
          return { glyphs: items.every((i) => i.glyph), inside: items.every((i) => i.r.right <= rb.right + 0.5 && i.r.left >= rb.left - 0.5), count: items.length };
        });
        expect(m.count).toBe(2);
        expect(m.glyphs, 'each promise has its glyph').toBe(true);
        expect(m.inside, 'the promises stay inside the field').toBe(true);
        // Read as sentences: the spoken copy gives each promise its full stop.
        await expect(page.getByLabel('Bot token', { exact: true })).toHaveAccessibleDescription(/Pasted here only\. This page doesn't store it\./);
        // "Pasted here only": a token typed into this specimen stays in its own field.
        await page.getByLabel('Bot token', { exact: true }).fill('123:abc');
        await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
        await expect(page.getByLabel('Provider API key', { exact: true })).toHaveValue('');
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });
