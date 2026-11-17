// Playwright: a workflow run's detail on the fixtures. All runs opens a run's detail with its steps; a
// failed run offers Resume and a running one Cancel run, each asking first in a confirm that fits a phone and a desktop with
// no sideways scroll; axe finds nothing in the detail or the confirm. Resume spends and Cancel stops a run, so the sends are
// covered by the unit tests over a fake agent (Runs.test.tsx, runActions.test.ts); here the confirm is dismissed.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import strings from './auto/workflows/Runs.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const stepsOf = (page: Page) => page.locator(`[aria-label="${strings['d.steps']}"]`);
const confirmOf = (page: Page, key: 'cancel.title' | 'resume.title', name: string) => page.getByRole('alertdialog', { name: fill(strings[key], { name }) });

async function open(page: Page, run: string, theme?: 'light' | 'dark') {
  await gotoHub(page, `${links.workflows}?view=runs&runsel=${run}`, theme ? { theme } : {});
  // A run with finished steps lists them; the running fixture run has none yet and says so.
  await expect(stepsOf(page).or(page.getByText(strings['steps.none'], { exact: true }))).toBeVisible();
}

for (const v of [
  { width: 390, height: 844, touch: true },
  { width: 1440, height: 900, touch: false },
]) {
  test.describe(`at ${v.width} px`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });
    test('a failed run shows its steps and asks before Resume', async ({ page }) => {
      await open(page, 'run-fix');
      const steps = stepsOf(page);
      await expect(steps.getByText('plan', { exact: true })).toBeVisible();
      await expect(steps.getByText(strings['step.failed'], { exact: true })).toBeVisible();
      await page.getByRole('button', { name: strings['act.resume'], exact: true }).click();
      const dialog = confirmOf(page, 'resume.title', 'fix-ci');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(strings['resume.body'])).toBeVisible();
      await test.step('no sideways scroll', () => noSideScroll(page));
      const go = dialog.getByRole('button', { name: strings['resume.confirm'], exact: true });
      await expect.poll(async () => { const r = await go.boundingBox(); return r ? r.x + r.width : Infinity; }, { message: 'Resume is inside the viewport' }).toBeLessThanOrEqual(v.width);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    });
    test('a running run asks before Cancel run, and offers no Resume', async ({ page }) => {
      await open(page, 'run-release');
      await expect(page.getByText(strings['steps.none'], { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: strings['act.resume'], exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: strings['act.cancel'], exact: true }).click();
      const dialog = confirmOf(page, 'cancel.title', 'release');
      await expect(dialog.getByText(strings['cancel.body'])).toBeVisible();
      await test.step('no sideways scroll', () => noSideScroll(page));
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    });
  });
}

test('axe finds nothing in a run detail and its confirm, light and dark', async ({ page }) => {
  // Two whole-page scans and two confirm scans: more than the default 30 s on a busy machine.
  test.setTimeout(120_000);
  for (const theme of ['light', 'dark'] as const) {
    await open(page, 'run-fix', theme);
    const d = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(d.violations.map((x) => `${theme} detail ${x.id}: ${x.nodes.length}`)).toEqual([]);
    await page.getByRole('button', { name: strings['act.resume'], exact: true }).click();
    const c = await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(c.violations.map((x) => `${theme} confirm ${x.id}: ${x.nodes.length}`)).toEqual([]);
  }
});
