// Playwright: Settings > Helpers at 1350 and 390, light and dark. The rail heads its sections with "The Bot itself" and
// "The helpers it starts"; Helpers draws Hoody models (what they run on, Routing with two tiers, the agents a task may name) and Claude
// Code (its model) one under the other, nothing scrolls sideways and no field overlaps another; the keyboard reaches every new field.
import { expect, type Page } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&settings=workers';

/** The boxes of the drawer's form fields that overlap another one (by more than a pixel). */
const overlaps = (page: Page) =>
  page.getByRole('dialog').evaluate((d) => {
    const boxes = Array.from(d.querySelectorAll('[role=combobox], [role=radiogroup], [role=switch], [role=group], button[aria-haspopup]'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    let n = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as DOMRect;
        const b = boxes[j] as DOMRect;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const inside = (p: DOMRect, q: DOMRect) => p.left >= q.left - 1 && p.right <= q.right + 1 && p.top >= q.top - 1 && p.bottom <= q.bottom + 1;
        if (x > 1 && y > 1 && !inside(a, b) && !inside(b, a)) n++;
      }
    return n;
  });

for (const width of [1350, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`at ${width}px, ${theme}`, () => {
      test.beforeEach(async ({ hubPage }) => {
        await hubPage.setViewportSize({ width, height: 900 });
      });

      test('Helpers shows both kinds, Routing with its tiers and the agents, nothing overlaps or scrolls sideways', async ({ hubPage: page }) => {
        await gotoHub(page, URL, { state: 'workersRouting', theme });
        await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
        const dialog = page.getByRole('dialog');
        const rail = dialog.getByRole('navigation', { name: strings['settings.rail'] });
        await expect(rail.getByText(strings['settings.group.helpers'])).toBeAttached();
        await expect(dialog.getByRole('group', { name: strings['workers.llm.title'] })).toBeVisible();
        await expect(dialog.getByText(/run on the AI helper's model, now Hoody Fast/)).toBeVisible();
        await expect(dialog.getByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) })).toHaveValue('Hoody Free');
        await expect(dialog.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) })).toHaveValue('GPT-5');
        await expect(dialog.getByRole('button', { name: new RegExp(`${strings['routing.heavy.thinking']}$`) })).toBeVisible();
        await expect(dialog.getByRole('group', { name: strings['agents.label'] })).toBeVisible();
        await expect(dialog.getByRole('group', { name: strings['workers.acp.title'] })).toBeVisible();
        expect(await overlaps(page)).toBe(0);
        await noSideScroll(page);
      });
    });
  }
}

test.describe('keyboard', () => {
  test.beforeEach(async ({ hubPage }) => {
    await hubPage.setViewportSize({ width: 1350, height: 900 });
  });

  test('Tab reaches the routing modes, both tiers, Thinking, Any agent and the Claude Code model', async ({ hubPage: page }) => {
    await gotoHub(page, URL, { state: 'workersRouting' });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('group', { name: strings['workers.llm.title'] })).toBeVisible();
    const want = [
      // The routing modes are one Tab stop (the kit's segmented control: Tab enters at the segment last focused, else the
      // first; the arrows move between them): any of its segments counts.
      dialog.getByRole('radiogroup', { name: strings['routing.mode'], exact: true }),
      dialog.getByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) }),
      dialog.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) }),
      dialog.getByRole('button', { name: new RegExp(`${strings['routing.heavy.thinking']}$`) }),
      dialog.getByRole('switch', { name: new RegExp(strings['agents.any']) }),
      dialog.getByRole('button', { name: new RegExp(`${strings['workers.model']}$`) }),
    ];
    for (const [k, l] of want.entries()) await l.evaluate((e, n) => e.setAttribute('data-want', String(n)), k);
    await dialog.getByRole('switch', { name: new RegExp(`^${strings['workers.allow.acp']}`) }).focus();
    const reached = new Set<number>();
    for (let i = 0; i < 60 && reached.size < want.length; i++) {
      await page.keyboard.press('Tab');
      const at = await page.evaluate(() => (document.activeElement?.closest('[data-want]') as HTMLElement | null)?.dataset.want);
      if (at !== undefined) reached.add(Number(at));
    }
    expect([...reached].sort()).toEqual(want.map((_, k) => k));
  });
});
