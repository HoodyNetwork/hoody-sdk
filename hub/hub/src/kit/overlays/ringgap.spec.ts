// Playwright: a focus ring's gap is the surface the control sits on. Dialogs, popovers and the phone
// Sheet are --hx-raised, so a kit Button focused inside one shows a --hx-raised gap, not the page's --hx-card (the
// :root gap, which the overlays' own --ring-gap never reached before: app/conformance.ringgap.test.ts). The gallery's
// overlays tab, light and dark; card and raised differ in both themes, so a ring that kept the :root gap fails. Also
// the one-pane list/detail header at 390, which sits on the page grey (--hx-bg).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { focusRingGap } from '@app/e2e-focus';
import gallery from '../gallery/overlays.strings.en.json';

/** A token's colour as the page computes it. */
const colour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`wide (${theme})`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });

    test(`a Button in a dialog footer has the bar's gap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      // The dialog footer is a --bar-bg bar, so its buttons' ring gap is the bar, still not the card.
      const [bar, card] = [await colour(page, '--bar-bg'), await colour(page, '--hx-card')];
      expect(bar, 'bar and card differ, so the check can fail').not.toBe(card);
      await page.getByRole('button', { name: gallery['open.confirm'], exact: true }).click();
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      await expect(dialog).toBeVisible();
      expect(await focusRingGap(page, dialog.getByRole('button').last()), 'dialog button ring gap').toBe(bar); // the confirm action, last in the foot
    });

    test(`a Button in a popover has a raised gap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      const raised = await colour(page, '--hx-raised');
      await page.getByRole('button', { name: gallery['btn.picker'], exact: true }).click();
      const pop = page.getByRole('dialog', { name: gallery['picker.label'] });
      await expect(pop).toBeVisible();
      expect(await focusRingGap(page, pop.getByRole('button', { name: new RegExp(gallery['pc.atlas']) })), 'popover button ring gap').toBe(raised);
    });
  });

  test.describe(`phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`a Button in the phone Sheet has a raised gap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
      await gotoHub(page, '/_kit?tab=overlays', { theme });
      const raised = await colour(page, '--hx-raised');
      await page.getByRole('button', { name: gallery['btn.picker'], exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      // Within 0.5 px: under host load the layout width read 390.0000305; a popover is far narrower.
      const width = await sheet.evaluate((d) => d.getBoundingClientRect().width);
      expect(Math.abs(width - 390), `the full-width Sheet, not the popover (width ${width})`).toBeLessThanOrEqual(0.5);
      expect(await focusRingGap(page, sheet.getByRole('button', { name: new RegExp(gallery['pc.atlas']) })), 'sheet button ring gap').toBe(raised);
    });

    // One pane under 600 px of content drops the detail's card, so its header (the way back) sits on
    // the page grey and its rings take that grey, not the wide detail's card.
    test(`the narrow list/detail header has a page-grey gap (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
      await gotoHub(page, '/scripts?sel=atlas.00a1~daily-digest.ts', { theme });
      const [bg, card] = [await colour(page, '--hx-bg'), await colour(page, '--hx-card')];
      expect(bg, 'page grey and card differ, so the check can fail').not.toBe(card);
      const back = page.getByRole('button', { name: 'Scripts', exact: true });
      await expect(back, 'one pane: the way back is in the detail header').toBeVisible();
      expect(await focusRingGap(page, back), 'back button ring gap').toBe(bg);
    });
  });
}
