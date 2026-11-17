// Playwright: on a coarse pointer every kit tab is a 44 px target, 44 px tall and at
// least 44 px wide; on a fine pointer the strip stays 34 px (folder tabs; desktop tabs never
// grow), except below 600 px where it is 44 too. Checked on the real strips of Scripts, Programs and Board. One named
// exception: Board's strip is a Tabs toolbarRow, drawn at max(--tb-ctl-h, --touch-min) +
// --sp-2 = 40 with a mouse (Tabs.toolbarrow.test.tsx, board/oneline.spec.ts). Boxes need a real browser, not jsdom.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const SCRIPTS = '/scripts?sel=atlas.00a1~weather.ts';

/** Every tablist on the page that is drawn, with its tabs' boxes. */
async function strips(page: Page) {
  await page.locator('[role=tablist]').first().waitFor({ timeout: 15_000 });
  const all = await page.locator('[role=tablist]').evaluateAll((ls) =>
    ls.map((l) => {
      const r = l.getBoundingClientRect();
      return {
        name: l.getAttribute('aria-label') ?? '',
        h: r.height,
        tabs: [...l.querySelectorAll('[role=tab]')].map((t) => {
          const b = t.getBoundingClientRect();
          return { label: t.textContent?.trim() ?? '', w: b.width, h: b.height };
        }),
      };
    }),
  );
  const shown = all.filter((s) => s.h > 0);
  // At least one drawn strip, each with its tabs: an empty or missing strip never passes.
  expect(shown.length > 0 && shown.every((s) => s.tabs.length > 0), JSON.stringify(shown)).toBe(true);
  return shown;
}

/** What on the strips falls short of a 44 px target (empty when every tab is one). */
async function shortOfTouch(page: Page) {
  const out: string[] = [];
  for (const s of await strips(page)) {
    if (s.h < 44) out.push(`${s.name}: strip ${Math.round(s.h)} px tall`);
    for (const t of s.tabs) if (t.w < 44 || t.h < 44) out.push(`${s.name}/${t.label}: ${Math.round(t.w)}x${Math.round(t.h)}`);
  }
  return out;
}

test.describe('fine pointer at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [name, url, tall] of [['Scripts', SCRIPTS, 34], ['Programs', '/programs', 34], ['Board', '/board', 40]] as const) {
    test(`${name}: the strip and its tabs stay ${tall} px tall`, async ({ page }) => {
      await gotoHub(page, url);
      const all = await strips(page);
      expect(all.length).toBeGreaterThan(0);
      for (const s of all) {
        expect(s.h, s.name).toBe(tall);
        for (const t of s.tabs) expect(t.h, `${s.name}/${t.label}`).toBe(tall);
      }
    });
  }
});

test.describe('fine pointer below 600', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Scripts: the strip is 44 px tall, as on touch', async ({ page }) => {
    await gotoHub(page, SCRIPTS);
    for (const s of await strips(page)) expect(s.h, s.name).toBe(44);
  });
});

test.describe('touch at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const [name, url] of [['Scripts', SCRIPTS], ['Programs', '/programs']] as const) {
    test(`${name}: every tab is at least 44 x 44`, async ({ page }) => {
      await gotoHub(page, url);
      expect(await shortOfTouch(page)).toEqual([]);
    });
  }
});

test.describe('touch at 1024 (a tablet)', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  for (const [name, url] of [['Scripts', SCRIPTS], ['Programs', '/programs'], ['Board', '/board']] as const) {
    test(`${name}: every tab is at least 44 x 44`, async ({ page }) => {
      await gotoHub(page, url);
      expect(await shortOfTouch(page)).toEqual([]);
    });
  }
});
