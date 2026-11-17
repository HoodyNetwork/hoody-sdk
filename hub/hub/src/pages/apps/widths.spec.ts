// Playwright: the apps launcher's way to find an app never cuts its labels (on a
// phone it is a picker instead of squeezed segments), and the app inspector's body starts where its title does.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const MODES = [strings['launch.mode.find'], strings['gh.tab']] as const;

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): the Apps
// section lives on the Programs page, which an apps-only server does not serve. Unset means the whole Hub.
const APPS_ONLY = process.env.HUB_PAGE === 'apps';

// The title's left edge vs the body's first block, in the detail pane. A framed plate (the verdict, role group) is a
// block by its frame: the text inside it sits at the plate's own padding, not at the body's edge.
async function insetGap(page: Page): Promise<{ title: number; body: number }> {
  const head = page.locator('#hub-main header[class*="detailHeader"]');
  await expect(head.locator('[data-hub-title]')).toBeVisible();
  return head.evaluate((h) => {
    const title = h.querySelector('[data-hub-title]')!.getBoundingClientRect().left;
    const body = h.nextElementSibling as HTMLElement;
    const first = [...body.querySelectorAll('p, dl, h3, section, [role="group"], [role="radiogroup"], [role="status"]')].find((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().width > 0);
    return { title, body: first ? first.getBoundingClientRect().left : -1 };
  });
}

for (const width of [360, 390, 1100]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.skip(APPS_ONLY, 'no Programs page on an apps-only dev server (HUB_PAGE=apps)');

    test('Launch an app: its modes are never cut', async ({ page }) => {
      await gotoHub(page, '/programs?tab=apps');
      await page.getByRole('button', { name: strings['launch.action'] }).first().click(); // reason: the page header and the empty table may both offer it (Programs says it in the same words)
      const d = page.getByRole('dialog');
      await expect(d.getByRole('heading', { name: strings['launch.title'] })).toBeVisible();
      const group = d.getByRole('radiogroup', { name: strings['launch.mode'] });
      if (await group.count()) {
        for (const m of MODES) {
          const cut = await group.getByRole('radio', { name: m }).evaluate((r) => [r, ...r.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1));
          expect(cut, `${m} keeps its whole label`).toBe(false);
        }
      } else {
        await expect(d.getByRole('button', { name: new RegExp(strings['launch.mode.find']) })).toBeVisible();
      }
      if (width >= 1100) await expect(group, 'a wide drawer keeps the segments').toHaveCount(1);
    });

    test('the app inspector: the body starts where the title starts', async ({ page }) => {
      await gotoHub(page, '/programs?tab=apps&appsel=a1b2c3');
      const g = await insetGap(page);
      expect(g.body, 'a body block is drawn').toBeGreaterThan(0);
      expect(Math.abs(g.body - g.title), `title ${g.title} vs body ${g.body}`).toBeLessThanOrEqual(1);
    });
  });
}
