// Playwright: Rules & hooks → Agent features in the default fixture state (realm Personal, a scoped realm): account rotation
// is a switch that changes, chat titles a switch that is on, CLAUDE.md / AGENTS.md say they are set per realm; trusting the
// agent's own hook edits shows its value only, on the Hooks card; axe finds no WCAG A/AA violation in the section, light and
// dark.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { links } from './links';
import strings from './settings/rules/strings.en.json';
import hookStrings from './settings/rules/Hooks.strings.en.json';

const section = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: strings['features.title'] }) });

async function axe(page: Page) {
  // axe takes CSS only: mark the section the locator found, then scope the scan to it.
  await section(page).evaluate((el) => el.setAttribute('data-axe-scope', 'features'));
  const r = await new AxeBuilder({ page }).include('[data-axe-scope="features"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`@a11y agent features (${theme}): two switches in a scoped realm, one changes, axe finds nothing`, async ({ page }) => {
    await gotoHub(page, links.rules, { theme });
    const s = section(page);
    const rotation = s.getByRole('switch', { name: strings['f.account_rotation'] });
    await expect(rotation).toBeChecked();
    await expect(s.getByRole('switch', { name: strings['f.session_titles'] })).toBeChecked();
    await expect(s.getByRole('switch')).toHaveCount(2);
    await expect(s.getByText(strings['perRealm.pill'])).toHaveCount(2);
    // trusting the agent's own hook edits: a value, no switch, on the Hooks card and not here
    await expect(s.getByText(strings['f.hooks_agent_self_trust'])).toHaveCount(0);
    const hooks = page.locator('section', { has: page.getByRole('heading', { name: hookStrings.title }) });
    await expect(hooks.getByRole('group', { name: strings['f.hooks_agent_self_trust'] }).getByText(strings.off)).toBeVisible();
    await axe(page);
    if (process.env.HUB_WORK_DIR) await s.screenshot({ path: `${process.env.HUB_WORK_DIR}/ai28b-features-${theme}.png` });
    await rotation.click({ force: true });
    await expect(rotation).not.toBeChecked();
    await expect(rotation).toBeEnabled(); // the change answered: done, the switch is free again
  });
}
