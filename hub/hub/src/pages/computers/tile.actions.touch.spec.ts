// Playwright, coarse pointer: every address action under an Open on tile (the
// Overview) and under a Home widget tile is a whole 44 px touch target inside its card, never squeezed by a narrow
// card. With the Board page served, every row holds Copy, QR and Board.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function measure(page: Page) {
  return page.getByRole('group', { name: / address$/ }).evaluateAll((rows) =>
    rows.map((row) => {
      const card = row.parentElement!.getBoundingClientRect();
      return {
        name: row.getAttribute('aria-label'),
        buttons: [...row.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { w: r.width, h: r.height, inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5 };
        }),
      };
    }),
  );
}

async function check(page: Page) {
  await page.getByRole('group', { name: /^Terminal address/ }).first().waitFor({ timeout: 15000 }); // reason: any one terminal row shows the tiles rendered; every row is measured below
  const rows = await measure(page);
  expect(rows.length).toBeGreaterThan(0);
  const board = rows.some((r) => r.buttons.length === 3);
  for (const r of rows) {
    expect(r.buttons.length, `${r.name}: Copy and QR${board ? ' and Board' : ''}`).toBe(board ? 3 : 2);
    for (const b of r.buttons) {
      expect(b.w, `${r.name}: button width`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${r.name}: button height`).toBeGreaterThanOrEqual(44);
      expect(b.inside, `${r.name}: button inside its card`).toBe(true);
    }
  }
}

test('@tiles on a phone with a coarse pointer, every Open on tile action is a whole 44 px target inside its card', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1');
  await check(page);
});

test('@tiles on a phone with a coarse pointer, every Home widget tile action is a whole 44 px target inside its card', async ({ page }) => {
  await gotoHub(page, '/');
  // Home exists only when its page is served (the every-page run); a computers-only server has no widget to check.
  const home = await page.getByRole('heading', { name: 'Your computer' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  test.skip(!home, 'Home is not served by this run');
  await check(page);
});
