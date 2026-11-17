// Playwright: an agent's page in the whole Hub. Its tools come in folds, one per group of
// the agent's own, titled with the group and its on/total count and closed until opened; a tool's line is its English
// name; a search opens the groups it finds tools in. "New chat with this agent" opens New chat on that agent
// (/ai/new?agent=<name>).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import agentStrings from './agents/strings.en.json';
import toolStrings from './agents/Tools.strings.en.json';
import toolNames from './agents/toolNames.strings.en.json';
import newStrings from './new/NewChat.strings.en.json';

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A tools group's fold trigger: its label, then its count. */
const fold = (page: Page, group: string) => page.getByRole('button', { name: new RegExp(`^${esc(group)} · `) });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
});

test('the tools groups are folds, closed by default; a line is the English name; a search opens the groups it finds tools in', async ({ page }) => {
  await gotoHub(page, '/ai/agents/general');
  await expect(page.getByRole('heading', { name: toolStrings.title, exact: true })).toBeVisible({ timeout: 20_000 });
  const coding = fold(page, toolStrings['group.coding']);
  const agents = fold(page, toolStrings['group.agents']);
  await expect(coding).toHaveAttribute('aria-expanded', 'false');
  await expect(agents).toHaveAttribute('aria-expanded', 'false');
  const shell = page.getByRole('checkbox', { name: toolNames['name.bash'], exact: true });
  await expect(shell).toHaveCount(0);
  await coding.click();
  await expect(coding).toHaveAttribute('aria-expanded', 'true');
  await expect(shell).toBeVisible();
  // The line is the name only: the agent's description waits behind the info button.
  await expect(page.getByText('Run a shell command.')).toHaveCount(0);
  await coding.click();
  await expect(coding).toHaveAttribute('aria-expanded', 'false');
  await expect(shell).toHaveCount(0);
  await page.getByRole('searchbox', { name: toolStrings.search }).fill('grep');
  await expect(coding).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox', { name: toolNames['name.grep'], exact: true })).toBeVisible();
});

test('New chat with this agent opens New chat on that agent', async ({ page }) => {
  await gotoHub(page, '/ai/agents/reviewer');
  const link = page.getByRole('link', { name: agentStrings['detail.newChat'], exact: true });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveAttribute('href', /\/ai\/new\?agent=reviewer$/);
  await link.click();
  await expect(page).toHaveURL(/#\/ai\/new\?agent=reviewer$/);
  // The agent has its own chip on the start page (no longer in the Options summary).
  await expect(page.getByRole('button', { name: newStrings['agent.chip'].replace('{{name}}', 'reviewer') })).toBeVisible({ timeout: 20_000 });
});
