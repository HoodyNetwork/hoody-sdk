// Playwright: Rules & hooks → Add a rule, at 1440 and 390 px, light and dark. Tools and Agents are sections, each with one
// field listing what this computer reports (its tool catalogue, its agents), not comma-separated text: with nothing chosen
// each says what it covers; a tool and an agent picked from the lists show as tags; a name the computer does not list is
// typed into the same field and added with Enter, its tag marked as not found there; axe finds no WCAG A/AA violation in
// the dialog; the page never scrolls sideways.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import strings from './settings/rules/Rules.strings.en.json';
import kitStrings from '@kit/strings.en.json';


/** Opens a picker's list and picks `name`: a click on the field may only focus it, so the list is also opened by key. */
async function pick(page: Page, box: Locator, name: string) {
  await expect(box).toBeEnabled({ timeout: 20_000 });
  const option = page.getByRole('option', { name: new RegExp(`^${name}`) });
  await expect(async () => {
    if (!(await option.isVisible())) { await box.click(); await box.press('ArrowDown'); }
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await option.click();
  // The field keeps the focus for the next name, and its list stays closed, so the tags under it can be read.
  await expect(box).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`@a11y add a rule, ${width} px, ${theme}: Tools and Agents are pickers with free entry`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, links.rules, { theme });
      // A narrow table folds Add a rule into the toolbar's More actions menu.
      const rules = page.locator('section', { has: page.getByRole('heading', { name: strings.title, exact: true }) });
      await expect(rules.getByRole('table', { name: strings.title })).toBeVisible({ timeout: 20_000 });
      const add = rules.getByRole('button', { name: strings.add, exact: true });
      if (await add.count()) await add.first().click();
      else {
        await rules.getByRole('button', { name: kitStrings['action.more'] }).first().click();
        await page.getByRole('menuitem', { name: strings.add }).click();
      }
      const dlg = page.getByRole('dialog', { name: strings['dlg.addTitle'] });
      await expect(dlg).toBeVisible();
      // A section: the innermost block holding its heading and its field.
      const section = (title: string) => dlg.locator('*').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).filter({ has: page.getByRole('combobox') }).last();
      const tools = section(strings['dlg.tools']);
      const agents = section(strings['dlg.agents']);
      await expect(tools.getByText(strings['dlg.toolsNone'], { exact: true })).toBeVisible();
      await expect(agents.getByText(strings['dlg.agentsNone'], { exact: true })).toBeVisible();
      // No comma-separated text field is left for either list.
      await expect(dlg.getByRole('textbox', { name: strings['dlg.tools'], exact: true })).toHaveCount(0);
      await expect(dlg.getByRole('textbox', { name: strings['dlg.agents'], exact: true })).toHaveCount(0);

      // Each list opens once this computer's names are read (the picker is off while they load).
      await pick(page, dlg.getByRole('combobox', { name: strings['dlg.toolsPick'] }), 'bash');
      await expect(tools.getByText('bash', { exact: true })).toBeVisible();
      await pick(page, dlg.getByRole('combobox', { name: strings['dlg.agentsPick'] }), 'reviewer');
      await expect(agents.getByText('reviewer', { exact: true })).toBeVisible();
      const toolBox = dlg.getByRole('combobox', { name: strings['dlg.toolsPick'] });
      await toolBox.fill('mcp__github__create_issue');
      await toolBox.press('Enter');
      // Taken: the field empties and its list stays closed over the tags.
      await expect(toolBox).toHaveValue('');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      // Its tag is a term: pressing it says it is not on this computer.
      const mark = tools.getByRole('button', { name: 'mcp__github__create_issue', exact: true });
      await mark.click();
      await expect(page.getByText(strings['dlg.notFound'], { exact: true })).toBeVisible();
      if (process.env.HUB_WORK_DIR) await page.screenshot({ path: `${process.env.HUB_WORK_DIR}/rule-tip-${width}-${theme}.png` });
      await mark.click();

      await dlg.evaluate((el) => el.setAttribute('data-axe-scope', 'rule-dialog'));
      const r = await new AxeBuilder({ page }).include('[data-axe-scope="rule-dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      await noSideScroll(page);
      if (process.env.HUB_WORK_DIR) await dlg.screenshot({ path: `${process.env.HUB_WORK_DIR}/rule-pickers-${width}-${theme}.png` });
    });
  }
}
