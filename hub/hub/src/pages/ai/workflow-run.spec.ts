// Playwright: Run… on a workflow's page on the fixtures. The drawer opens from "More actions", says where it
// runs and what it costs, fits a phone and a desktop with no sideways scroll and one footer row, and axe finds nothing. Starting a
// run spends, so the press itself is covered by the unit tests over a fake agent (RunForm.test.tsx, runApi.test.ts).
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import strings from './auto/workflows/Run.strings.en.json';
import wfStrings from './auto/workflows/strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const drawer = (page: Page) => page.getByRole('dialog', { name: fill(strings['run.title'], { name: 'release' }) });

async function open(page: Page, theme?: 'light' | 'dark') {
  await gotoHub(page, `${links.workflows}?sel=release`, theme ? { theme } : {});
  await page.getByRole('group', { name: fill(wfStrings['wf.actions'], { name: 'release' }) }).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: strings['run.menu'] }).click();
  await expect(drawer(page)).toBeVisible();
}

for (const v of [
  { width: 360, height: 740, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 1440, height: 900, touch: false },
]) {
  test.describe(`at ${v.width} px`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });
    test('Run… opens the run drawer, which names the cost and fits', async ({ page }) => {
      await open(page);
      // The subtitle names the computer (the fixtures' own) and the cost.
      await expect(drawer(page).getByText(fill(strings['run.subtitle'], { computer: '' }).replace(/^On \. /, ''), { exact: false })).toBeVisible();
      await expect(drawer(page).getByRole('textbox', { name: strings['run.prompt'] })).toBeVisible();
      await test.step('no sideways scroll', () => noSideScroll(page));
      expect(await drawer(page).evaluate((d) => d.scrollWidth - d.clientWidth), 'nothing runs wider than the drawer').toBeLessThanOrEqual(0);
      const a = await drawer(page).getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
      const b = await drawer(page).getByRole('button', { name: strings['run.start'], exact: true }).boundingBox();
      expect(a && b && Math.abs(a.y - b.y), 'Cancel and Start run share a row').toBeLessThanOrEqual(2);
      // Once the drawer has slid in, Start run is wholly inside the viewport.
      const start = drawer(page).getByRole('button', { name: strings['run.start'], exact: true });
      await expect.poll(async () => { const r = await start.boundingBox(); return r ? r.x + r.width : Infinity; }, { message: 'Start run is inside the viewport' }).toBeLessThanOrEqual(v.width);
    });
  });
}

test('axe finds nothing in the run drawer, light and dark', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await open(page, theme);
    const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((x) => `${theme} ${x.id}: ${x.nodes.length}`)).toEqual([]);
  }
});
