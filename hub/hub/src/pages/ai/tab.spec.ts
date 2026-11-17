// Playwright: the AI tab in the whole Hub. The sidebar names it AI and opens the AI pane;
// New chat and conversation links stay on their routes; the models page's old links land on Models & keys, replacing
// themselves (Back skips them); a folder link opens the folder's page; Knowledge → Instructions has its own
// route; Connections carries MCP servers.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import folderStrings from './folders/strings.en.json';
import instructionStrings from './knowledge/instructions/strings.en.json';
import mcpStrings from './settings/connections/Mcp.strings.en.json';
import { chatLink, folderLink, links } from './links';
import paneStrings from './parts/Pane.strings.en.json';
import strings from './strings.en.json';

const pane = (page: Page) => page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true });
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: strings['models.title'], exact: true });

test('the sidebar names the tab AI and it opens the AI pane', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/home');
  // The shell's main navigation (shell/strings.en.json nav.label): the AI pane is a navigation too. The fixture world has a
  // chat waiting for you, so the link may carry the AI dot's words after its name ("AI, waiting for you").
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: new RegExp(`^${strings.nav}(?:,|$)`) }).click();
  await expect(page).toHaveURL(/#\/ai$/);
  await expect(pane(page)).toBeVisible();
});

test('an old /ai?connect= link opens the Connect drawer on Models & keys', async ({ page }) => {
  await gotoHub(page, '/ai?connect=google');
  await expect(page).toHaveURL(/#\/ai\/models/);
  await expect(page.getByLabel(/API key/)).toHaveAttribute('type', 'password');
});

test('New chat and a conversation link stay on their route with the AI pane', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  // Warm-up: the first visit to the tab loads its lazy chunk (slow on a cold dev server); what this test checks starts after.
  await gotoHub(page, '/ai');
  await expect(pane(page)).toBeVisible({ timeout: 20_000 });
  await gotoHub(page, '/home');
  // A session id with a colon (escaped in the link).
  const conv = chatLink({ computer: 'atlas.a1b2', realm: 'global', sid: 'sess_01HX.y:z-9' });
  expect(conv).toContain('%3A');
  for (const to of ['/ai/new', conv]) {
    await page.evaluate((h) => { window.location.hash = h; }, `#${to}`);
    await expect(pane(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${to.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')}$`));
    await page.goBack();
    await expect(page).toHaveURL(/#\/home$/);
  }
});

test('an old /ai#anchor link goes to Models & keys, and Back skips it', async ({ page }) => {
  await gotoHub(page, '/home');
  for (const to of ['/ai#spending']) {
    await page.evaluate((h) => { window.location.hash = h; }, `#${to}`);
    await expect(page).toHaveURL(/#\/ai\/models(#spending)?$/);
    await expect(heading(page)).toBeVisible();
    await page.goBack();
    // At once, as a person may: the shell draws the tab again as it leaves, and that must not move Home's entry (tab.tsx).
    await expect(page).toHaveURL(/#\/home$/);
    await expect(heading(page)).toBeHidden();
  }
});

test("a folder link opens the folder's page with the AI pane and keeps it on reload; an incomplete one says so", async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  // atlas.00a1: the fixture world's atlas (core/world.ts; a handle is the name and the id's last four), so the folder's
  // computer is found in the account's list and its tabs draw.
  const href = folderLink({ computer: 'atlas.00a1', realm: 'global', path: '/home/ada/shop' });
  expect(href).toBe('/ai/f/L2hvbWUvYWRhL3Nob3A?computer=atlas.00a1&realm=global');
  await gotoHub(page, href);
  const shop = page.getByRole('heading', { level: 1, name: 'shop', exact: true });
  // First visit loads the folder screen's own chunk.
  await expect(shop).toBeVisible({ timeout: 20_000 });
  await expect(pane(page)).toBeVisible();
  await page.reload();
  await expect(shop).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/#\/ai\/f\/L2hvbWUvYWRhL3Nob3A\?computer=atlas\.00a1&realm=global$/);
  // The open tab is in the link: Repository stays open on reload.
  await gotoHub(page, `${href}&tab=repository`);
  const repository = page.getByRole('tab', { name: folderStrings['folder.tab.repository'], exact: true });
  await expect(repository).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await page.reload();
  await expect(repository).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]tab=repository(&|$)/);
  // Without its computer the link is not complete: it says so, and Open AI goes to the tab.
  await gotoHub(page, '/ai/f/L2hvbWUvYWRhL3Nob3A?realm=global');
  const region = page.getByRole('region', { name: folderStrings['folder.region'], exact: true });
  await expect(region.getByText(folderStrings['folder.incomplete.title'], { exact: true })).toBeVisible({ timeout: 20_000 });
  await region.getByRole('link', { name: folderStrings['folder.openAi'], exact: true }).click();
  await expect(page).toHaveURL(/#\/ai$/);
});

test('Knowledge → Instructions opens at its own route with the AI pane and keeps it on reload', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, links.instructions);
  const title = page.getByRole('heading', { level: 1, name: instructionStrings.title, exact: true });
  // First visit loads the screen's own chunk.
  await expect(title).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(instructionStrings.subtitle, { exact: true })).toBeVisible();
  await expect(pane(page).getByRole('link', { name: paneStrings['switch.knowledge'], exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(title).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/#\/ai\/knowledge\/instructions$/);
});

test('Connections shows MCP servers under GitHub accounts, for the top bar realm', async ({ page }) => {
  await gotoHub(page, links.connections);
  await expect(page.getByRole('heading', { level: 1, name: strings['connections.title'], exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: mcpStrings.title, exact: true })).toBeVisible({ timeout: 20_000 });
});
