// Playwright: in fixture mode Rules & safety shows both lists with rows, at 320 and 390 px, in
// both themes: Rules shows every rule (one with a long text), Hooks shows every hook (a long command, one with a
// label), neither says it could not be read, and the page never scrolls sideways.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import hookStrings from './settings/rules/Hooks.strings.en.json';
import ruleStrings from './settings/rules/Rules.strings.en.json';

// What settings/rules/fixtures.ts answers (a spec cannot import it: it pulls in core): every rule text, and each hook as its
// row names it (the label, else the command).
const RULE_TEXTS = [
  'Never push to main; open a pull request instead.',
  'Ask before changing a database migration, a deployment manifest or anything under infrastructure/, and say which environment the change reaches.',
  'Answer in British English.',
];
const HOOKS_SHOWN = [
  '/home/ada/.hoody/hooks/check-dangerous-commands-before-they-run.sh --strict --log /home/ada/.hoody/logs/hooks/pre-tool-use.log',
  'prettier --write "$HOODY_TOOL_FILE"',
  'Tell the team the agent finished',
];

const section = (page: Page, title: string) => page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) });

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 390]) {
    test(`${width} px, ${scheme}: Rules and Hooks both show their rows, nothing unread, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, links.rules, { theme: scheme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', scheme);
      const rules = section(page, ruleStrings.title);
      for (const text of RULE_TEXTS) await expect(rules.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
      const hooks = section(page, hookStrings.title);
      for (const shown of HOOKS_SHOWN) await expect(hooks.getByText(shown, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(rules).toHaveAttribute('data-hub-state', 'ready');
      await expect(page.getByText(hookStrings.loadFailed)).toHaveCount(0);
      await noSideScroll(page);
      if (process.env.HUB_WORK_DIR) {
        await rules.screenshot({ path: `${process.env.HUB_WORK_DIR}/rules-list-${width}-${scheme}.png` });
        await hooks.screenshot({ path: `${process.env.HUB_WORK_DIR}/hooks-list-${width}-${scheme}.png` });
      }
    });
  }
}
