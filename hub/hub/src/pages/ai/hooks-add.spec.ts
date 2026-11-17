// Playwright: Rules & hooks → Hooks → Add hook…, at 1440 and 390 px, light and dark. Add asks how first: Write it with the
// Agent or Write it yourself. With the Agent shows the request field, where it saves, and the exact instructions the chat will
// get; it sends nothing until Start. Yourself is the hook editor. axe finds no WCAG A/AA violation in either step; the page
// never scrolls sideways.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import hookStrings from './settings/rules/Hooks.strings.en.json';
import editStrings from './settings/rules/HookEdit.strings.en.json';
import strings from './settings/rules/HookAsk.strings.en.json';
import kitStrings from '@kit/strings.en.json';

// label-content-name-mismatch (experimental) is off: it flags the kit's choice card (PickCard), whose name is its title and
// its line, wherever the card is used; that belongs to the card, not to this dialog.
async function axe(page: Page, scope: string) {
  const r = await new AxeBuilder({ page }).include(`[data-axe-scope="${scope}"]`).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['label-content-name-mismatch']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`@a11y add a hook, ${width} px, ${theme}: with the Agent or yourself`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, links.rules, { theme });
      const hooks = page.locator('section', { has: page.getByRole('heading', { name: hookStrings.title, exact: true }) });
      await expect(hooks.getByRole('table')).toBeVisible({ timeout: 20_000 });
      // A narrow table folds Add hook… into the toolbar's More actions menu.
      const add = hooks.getByRole('button', { name: editStrings['toolbar.add'], exact: true });
      if (await add.count()) await add.first().click();
      else {
        await hooks.getByRole('button', { name: kitStrings['action.more'] }).first().click();
        await page.getByRole('menuitem', { name: editStrings['toolbar.add'] }).click();
      }
      const how = page.getByRole('dialog', { name: strings['how.title'] });
      await expect(how.getByRole('button', { name: new RegExp(`^${strings['how.agent']}`) })).toBeVisible();
      await expect(how.getByRole('button', { name: new RegExp(`^${strings['how.self']}`) })).toBeVisible();
      await how.evaluate((el) => el.setAttribute('data-axe-scope', 'hook-how'));
      await axe(page, 'hook-how');
      if (process.env.HUB_WORK_DIR) await how.screenshot({ path: `${process.env.HUB_WORK_DIR}/hook-how-${width}-${theme}.png` });

      await how.getByRole('button', { name: new RegExp(`^${strings['how.agent']}`) }).click();
      const ask = page.getByRole('dialog', { name: strings['ask.title'] });
      await ask.getByRole('textbox', { name: strings['ask.text'] }).fill('Log every shell command to a file');
      await expect(ask.getByText(/What it should do: Log every shell command to a file/)).toBeVisible();
      await ask.evaluate((el) => el.setAttribute('data-axe-scope', 'hook-ask'));
      await axe(page, 'hook-ask');
      await noSideScroll(page);
      if (process.env.HUB_WORK_DIR) await ask.screenshot({ path: `${process.env.HUB_WORK_DIR}/hook-ask-${width}-${theme}.png` });
    });
  }
}
