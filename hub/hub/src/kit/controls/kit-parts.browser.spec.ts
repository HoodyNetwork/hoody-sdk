// Playwright: kit parts drawn with the kit's own components, in the browser.
// - The IpInfo details button is a kit IconButton: the kit ring on keyboard focus, the details in its tooltip, a popover on
//   Enter, and the touch minimum on a coarse pointer.
// - A busy Button draws the kit Spinner in its 16 px icon box, still visibly busy under reduced motion and in perf mode.
// - The drawn toggles, swatches and the Tabs chevron keep their pixels under their tokens.
// - The Settings phone strip's items are 32 px with a mouse and 44 on a coarse pointer.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import ip from '../data/IpInfo.strings.en.json';
import gallery from '../gallery/strings.en.json';
import k2 from '../gallery/kit2.strings.en.json';

/** Keyboard focus on `l` (React Aria's ring needs keyboard modality: a Tab press first, then a scripted focus). */
async function keyFocus(page: Page, l: Locator) {
  await page.keyboard.press('Tab');
  await l.evaluate((n) => (n as HTMLElement).focus());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const box = async (l: Locator) => (await l.boundingBox())!;
const infoButton = (page: Page) => page.locator('#ip-info').getByRole('button', { name: ip['ip.details'].replace('{{ip}}', '203.0.113.58') });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`kit parts at 1440, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('IpInfo details: the kit ring on keyboard focus, every detail in its tooltip, a popover on Enter', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoHub(page, '/_kit?tab=pieces', { theme });
      const info = infoButton(page);
      await info.scrollIntoViewIfNeeded();
      await keyFocus(page, info);
      const ring = await info.evaluate((n) => {
        const probe = document.createElement('span');
        probe.style.boxShadow = 'var(--focus-ring)';
        n.appendChild(probe);
        const want = getComputedStyle(probe).boxShadow;
        probe.remove();
        return { have: getComputedStyle(n).boxShadow, want };
      });
      expect(ring.have, 'the kit focus ring').toBe(ring.want);
      const tip = page.getByRole('tooltip');
      await expect(tip).toContainText('Europe/Paris');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toContainText('Europe/Paris');
      const b = await box(info);
      expect(Math.round(b.height), 'IconButton sm: 28').toBe(28);
    });

    test('a busy Button: the kit Spinner in the 16 px icon box, busy-looking under reduced motion and in perf mode', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoHub(page, '/_kit?tab=feedback', { theme });
      const btn = page.getByRole('button', { name: k2['spinner.button'] });
      await btn.scrollIntoViewIfNeeded();
      // The kit Spinner: a span of three hidden dots, inside the button's own hidden 16 px mark.
      const spin = btn.locator('span:has(> span[aria-hidden="true"]:nth-child(3))');
      await expect(spin).toHaveCount(1);
      const holder = spin.locator('xpath=..');
      await expect(holder).toHaveAttribute('aria-hidden', 'true');
      expect(Math.round((await box(holder)).width), 'the icon box').toBe(16);
      const shades = async () => spin.evaluate((n) => [...n.children].map((d) => getComputedStyle(d).opacity));
      const still = await shades();
      expect(still, 'three dots').toHaveLength(3);
      expect(new Set(still).size, 'stepped shades, so it still reads busy').toBe(3);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => document.documentElement.setAttribute('data-hx-perf', 'on'));
      expect(new Set(await shades()).size, 'perf mode: the same still shades').toBe(3);
    });

    test('the toggles, swatches and the Tabs chevron keep their pixels under the tokens', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=forms', { theme });
      const picker = page.getByRole('radiogroup', { name: gallery['f.colour'], exact: true });
      await picker.scrollIntoViewIfNeeded();
      await expect(page.getByRole('switch').first()).toBeAttached(); // reason: the forms tab has drawn its toggles
      const px = (sel: string) =>
        page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        }, sel);
      expect(await px('[class*="track"]'), 'Switch track').toEqual([34, 20]);
      expect(await px('[class*="thumb"]'), 'Switch thumb').toEqual([14, 14]);
      expect(await px('label:has(input[type="checkbox"]) [class*="_box_"]'), 'Checkbox box').toEqual([16, 16]);
      expect(await px('[class*="radioDot"]'), 'Radio dot').toEqual([16, 16]);
      const dot = await picker.evaluate((n) => {
        const d = n.querySelector('[class*="dot"]')!.getBoundingClientRect();
        return [Math.round(d.width), Math.round(d.height)];
      });
      expect(dot, 'a swatch').toEqual([24, 24]);
    });
  });

  test.describe(`Settings strip at 390, ${theme}`, () => {
    for (const coarse of [false, true])
      test(`its items are ${coarse ? '44 on a coarse pointer' : '32 with a mouse'}`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: coarse, isMobile: coarse });
        const page = await ctx.newPage();
        await gotoHub(page, '/_kit?layout=settings', { theme });
        const items = page.locator('nav [data-nav]');
        await expect(items.first()).toBeVisible(); // reason: the strip is drawn once its first item shows
        const heights = await items.evaluateAll((xs) => xs.map((x) => Math.round(x.getBoundingClientRect().height)));
        expect(heights.length).toBeGreaterThan(1);
        for (const h of heights) expect(h).toBe(coarse ? 44 : 32);
        await ctx.close();
      });
  });
}
