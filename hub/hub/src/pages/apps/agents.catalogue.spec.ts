// Playwright: Launch an app > Coding agents as a catalogue: each agent's own mark beside its name and
// maker, no command lines, on a wide mouse window and on a phone, in both themes. Screenshots are saved for inspection.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const NAMES = ['Claude Code', 'Codex CLI', 'Gemini CLI', 'OpenCode'];
const ABOUT = [strings['agents.about.claude'], strings['agents.about.codex'], strings['agents.about.gemini'], strings['agents.about.opencode']];

async function agents(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/programs?tab=apps&launch=1', { theme });
  // the Hub draws the theme asked for (its root's colour scheme), not only the browser's preference
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain(theme);
  const dialog = page.getByRole('dialog', { name: strings['launch.title'] });
  const list = dialog.getByRole('list', { name: strings['agents.tab'] });
  await list.scrollIntoViewIfNeeded();
  await expect(list.getByRole('heading')).toHaveText(NAMES);
  return list;
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, size, touch] of [
    ['1440 mouse', { width: 1440, height: 900 }, false],
    ['390 touch', { width: 390, height: 844 }, true],
  ] as const) {
    test.describe(`${label}, ${scheme}`, () => {
      test.use({ viewport: size, hasTouch: touch, isMobile: touch, colorScheme: scheme });

      test('each agent shows its own mark, its name and maker and Open, and no command line', async ({ page }, info) => {
        const list = await agents(page, scheme);
        const rows = list.getByRole('listitem');
        await expect(rows).toHaveCount(NAMES.length);
        for (let i = 0; i < NAMES.length; i++) {
          const row = rows.nth(i);
          await row.scrollIntoViewIfNeeded();
          const mark = row.locator('svg').first();
          await expect(mark).toBeVisible();
          const box = (await mark.boundingBox())!;
          // the mark is drawn at the kit's large icon size, square, beside the name (to its inline start)
          expect(box.width, `${NAMES[i]} mark width`).toBeGreaterThanOrEqual(20);
          expect(Math.abs(box.width - box.height), `${NAMES[i]} mark square`).toBeLessThan(1);
          const name = (await row.getByRole('heading').boundingBox())!;
          expect(box.x + box.width, `${NAMES[i]} mark before the name`).toBeLessThanOrEqual(name.x + 0.5);
          // the mark is drawn in the text colour, never transparent
          expect(await mark.evaluate((el) => getComputedStyle(el).fill)).not.toMatch(/none|rgba\(0, 0, 0, 0\)/);
          await expect(row.getByText(ABOUT[i]!, { exact: true })).toBeVisible();
          await expect(row.getByRole('button', { name: strings['act.open'] })).toBeVisible();
          const text = (await row.textContent()) ?? '';
          expect(text, `${NAMES[i]} shows no command`).not.toMatch(/npm|sudo|install -g|auth login/);
          await expect(row.locator('pre, code')).toHaveCount(0);
        }
        // no sideways page scroll (the page scrolls in #hub-main)
        await noSideScroll(page);
        await list.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`agents-${label.replace(' ', '-')}-${scheme}.png`) });
      });
    });
  }
}
