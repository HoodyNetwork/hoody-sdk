// Playwright (chat-attention, core/chat-attention.ts): the shell's observer lights the AI dot for a chat nobody is looking
// at, the AI page marks a chat it let go while its turn ran "Turn ended" once idle, a gate in a realm the login does not
// serve never lights anything, /ai reads GET /gates once per tick (the AI page and the observer share one query), and a
// hidden tab reads nothing. Fixture state `attention` (pages/ai/fixtures.ts) counts every GET /gates sent in the page
// (globalThis.aiGatesSent: the fixture core answers in the page, so no request reaches the network to be counted there).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, hubUrl, noSideScroll } from '@app/e2e';
// eslint-disable-next-line no-restricted-imports -- the shell's own badge words, read by a whole-Hub test
import shell from '@shell/strings.en.json';
import { chatLink } from './links';
import ai from './strings.en.json';
import paneStrings from './parts/Pane.strings.en.json';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const WAIT_CHAT = chatLink({ computer: 'atlas.00a1', realm: REALM, sid: 's-wait' });
const TICK = 30_000;
// The fixture world's account and its current computer (atlas): core/world.ts.
const ACCOUNT_ID = '64f0ada00000000000000001';
const ATLAS_ID = 'c0a7150000000000000000a1';

const nav = (page: Page) => page.getByRole('navigation', { name: shell['nav.label'], exact: true });
/** The AI link of the sidebar with its "waiting for you" dot. */
const aiDot = (page: Page) => nav(page).getByRole('link', { name: shell['nav.badge.aiWaiting'].replace('{{name}}', ai.nav), exact: true });
const sent = (page: Page) => page.evaluate(() => (globalThis as { aiGatesSent?: number }).aiGatesSent ?? 0);
const moveTo = (page: Page, path: string) => page.evaluate((h) => { window.location.hash = h; }, `#${path}`);
async function hide(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

test('(a) leaving a chat with a pending gate lights the AI dot on another page', async ({ page }) => {
  await gotoHub(page, WAIT_CHAT, { state: 'attention' });
  await expect(page.locator('[data-details]')).toBeVisible();
  await expect.poll(() => sent(page)).toBeGreaterThan(0);
  // The chat is held here: its own engine shows the gate, and that card is what lights the dot (ask anyWaiting: an
  // engine's card counts, wherever it is shown). The observer's copy of a held chat's gate never counts on its own
  // (ask/registry.attention.test.ts).
  await expect(page.locator('[data-ask-gate]')).toBeVisible();
  await expect(aiDot(page)).toBeVisible();
  await moveTo(page, '/home');
  await expect(aiDot(page)).toBeVisible();
  await noSideScroll(page);
});

// The fixture Hub cannot keep one chat running across its engines (each scripted agent is its own), so the note the
// registry writes when the last holder lets a running chat go (ask/registry.attention.test.ts proves that write) is
// seeded in session storage, as that release leaves it; the list then reads the chat running, then idle.
test('(b) a chat left running shows "Turn ended" in the chat marks once it idles, until it is opened', async ({ page }) => {
  await page.goto(hubUrl('/home', { state: 'attention' }));
  await page.locator('#hub-main').waitFor();
  await page.evaluate(({ uid, computer, realm }) => {
    const note = { computer, realm, sid: 'sess-1', at: Date.now(), last: 'running' };
    // eslint-disable-next-line no-restricted-globals -- the test seeds the page's own session storage, as the release leaves it
    sessionStorage.setItem('hub_ai_attn_v1', JSON.stringify({ v: 1, a: { [uid]: [note] } }));
  }, { uid: ACCOUNT_ID, computer: ATLAS_ID, realm: REALM });
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await moveTo(page, '/ai');
  const pane = page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true });
  const row = pane.getByRole('row').filter({ hasText: 'Build the status page' });
  // Still running: the running mark, no words.
  await expect(row.getByRole('img', { name: paneStrings['mark.running'], exact: true })).toBeVisible();
  await expect(row.getByText(paneStrings['mark.ended'], { exact: true })).toHaveCount(0);
  await page.evaluate(() => { (globalThis as { aiAttnIdle?: boolean }).aiAttnIdle = true; });
  // The list re-reads (the slow re-read, or a re-list): the chat is idle now.
  await moveTo(page, '/home');
  await moveTo(page, '/ai');
  await expect(row.getByText(paneStrings['mark.ended'], { exact: true })).toBeVisible();
  await noSideScroll(page);
  // Opened: the note goes, and with it the words.
  await moveTo(page, chatLink({ computer: 'atlas.00a1', realm: REALM, sid: 'sess-1' }));
  await expect(page.locator('[data-details]')).toBeVisible();
  await moveTo(page, '/ai');
  await expect(row).toBeVisible();
  await expect(row.getByText(paneStrings['mark.ended'], { exact: true })).toHaveCount(0);
});

test('(c) a gate in a realm the login does not serve never lights the dot', async ({ page }) => {
  await page.goto(hubUrl('/home', { state: 'attentionUnserved' }).replace('/?', '/?fxrealm=all&'));
  await page.locator('#hub-main').waitFor();
  await expect.poll(() => sent(page)).toBeGreaterThan(0);
  // The read answered (its gate is in an unserved realm): settle a moment, then the dot is still off.
  await page.waitForTimeout(1000);
  await expect(aiDot(page)).toHaveCount(0);
});

for (const state of ['attention', 'attentionFeedDown']) {
  test(`(d) /ai reads GET /gates exactly once per tick; (e) a hidden tab reads nothing (${state})`, async ({ page }) => {
    await page.clock.install();
    await gotoHub(page, '/ai', { state });
    await expect(page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true })).toBeVisible();
    await expect.poll(() => sent(page)).toBeGreaterThan(0);
    // Let the first reads settle (every reader's mount read), then count tick by tick.
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      const before = await sent(page);
      await page.clock.fastForward(TICK);
      await page.waitForTimeout(800);
      expect(await sent(page), `tick ${i + 1}: one GET /gates`).toBe(before + 1);
    }
    await hide(page, true);
    const hiddenAt = await sent(page);
    for (let i = 0; i < 4; i++) {
      await page.clock.fastForward(TICK);
      await page.waitForTimeout(300);
    }
    expect(await sent(page), 'a hidden tab sends no GET /gates').toBe(hiddenAt);
  });
}
