// Playwright: the conversation column in a real browser (`/_kit?layout=ai-conversation`, and the open chat on /ai/c).
// One grid: the thread, the working bar and the composer's box share one start edge and one end edge, and the log's
// scrollbar is at the pane's edge, not between the text and the margin. Turns are set apart by a solid hairline. Who and
// when are on one line over every message, the person's and the Agent's, and no time stands anywhere else in the log.
// Opening a long step list scrolls the log only: the page behind the frame keeps its height (the frame fills the window).
// The composer's icon buttons have names.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import conv from './Conversation.strings.en.json';

const GALLERY = '/_kit?layout=ai-conversation&details=0&gates=0&paused=0';
const CHAT = '/ai/c/s-old?computer=atlas.00a1&realm=f1f1f1f1f1f1f1f1f1f1f1f1';

const edges = async (l: Locator): Promise<{ left: number; right: number }> => l.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right };
});
/** The composer's drawn box: the nearest ancestor of the text field that draws a border. */
const composerBox = (page: Page): Locator => page.locator('[data-composer-lane] textarea').locator('xpath=ancestor::*[1]');

for (const width of [1440, 1280, 1024, 390]) {
  test(`${width} px: the thread, the working bar and the composer share their edges; the scrollbar is at the pane's edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await gotoHub(page, `${GALLERY}&turns=40&steps=3`);
    const log = page.getByRole('log');
    await expect(log).toBeVisible();
    const thread = await edges(page.locator('[data-thread]'));
    const bar = await edges(page.locator('[data-work-bar]'));
    const box = await composerBox(page).evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n && parseFloat(getComputedStyle(n).borderTopWidth) === 0) n = n.parentElement;
      const r = (n ?? el).getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    // The scrollbar's room is kept on both sides of the log; the thread still has the pinned rows' edges.
    const slack = 0.5;
    expect(Math.abs(bar.left - box.left), 'working bar and composer: start edge').toBeLessThanOrEqual(0.5);
    expect(Math.abs(bar.right - box.right), 'working bar and composer: end edge').toBeLessThanOrEqual(0.5);
    expect(Math.abs(thread.left - bar.left), 'thread and working bar: start edge').toBeLessThanOrEqual(slack);
    expect(Math.abs(thread.right - bar.right), 'thread and working bar: end edge').toBeLessThanOrEqual(slack);
    const gutter = await log.evaluate((el) => ((el as HTMLElement).offsetWidth - el.clientWidth) / 2);
    expect(await log.evaluate((el) => el.getBoundingClientRect().right) - gutter - thread.right, 'the text keeps clear of the scrollbar').toBeGreaterThanOrEqual(8 - 0.5);
    // The log is as wide as its pane: its scrollbar is at the pane's edge.
    const pane = await edges(log.locator('xpath=..'));
    const l = await edges(log);
    expect(Math.abs(l.left - pane.left) + Math.abs(l.right - pane.right), 'the log spans its pane').toBeLessThanOrEqual(0.5);
  });
}

test('turns are set apart by a solid hairline; who and when are on one line over every message', async ({ page }) => {
  await gotoHub(page, `${GALLERY}&turns=8&steps=3`);
  await expect(page.getByRole('log')).toBeVisible();
  const turns = await page.locator('[data-turn]').evaluateAll((els) => els.map((el) => {
    const c = getComputedStyle(el);
    return { w: parseFloat(c.borderTopWidth), style: c.borderTopStyle, pad: parseFloat(c.paddingTop) };
  }));
  expect(turns.length).toBe(4);
  expect(turns[0]?.w, 'no rule over the first turn').toBe(0);
  for (const t of turns.slice(1)) {
    expect(t.w, 'a rule over each later turn').toBeGreaterThanOrEqual(1);
    expect(t.style).toBe('solid');
    expect(t.pad, 'room between the rule and the message under it').toBeGreaterThanOrEqual(16);
  }
  const rows = await page.locator('[data-author]').evaluateAll((els) => els.map((el) => {
    const name = el.querySelector('span')?.getBoundingClientRect();
    const time = el.querySelector('time')?.getBoundingClientRect();
    return { who: el.getAttribute('data-author'), dy: name && time ? Math.abs((name.top + name.bottom) / 2 - (time.top + time.bottom) / 2) : null, after: name && time ? time.left >= name.right : null };
  }));
  expect(rows.map((r) => r.who)).toEqual(['you', 'agent', 'you', 'agent', 'you', 'agent', 'you', 'agent']);
  for (const r of rows) {
    expect(r.dy, `${r.who}: the time is on the name's line`).not.toBeNull();
    expect(r.dy as number).toBeLessThanOrEqual(1);
    expect(r.after, `${r.who}: the time follows the name`).toBe(true);
  }
  expect(await page.getByRole('log').locator('time').evaluateAll((els) => els.filter((el) => !el.closest('[data-author]')).length), 'no time outside a header row').toBe(0);
  // The reply's foot holds no clock time.
  expect(await page.locator('[data-k="reply"]').evaluateAll((els) => els.filter((el) => /\d{1,2}:\d{2}/.test(el.textContent ?? '')).length)).toBe(0);
});

test('opening a long step list scrolls the log, never the page behind the frame', async ({ page }) => {
  await gotoHub(page, `${GALLERY}&turns=6&steps=60`);
  const log = page.getByRole('log');
  await expect(log).toBeVisible();
  const main = page.locator('#hub-main');
  const before = await main.evaluate((el) => el.scrollHeight);
  await log.locator('button[aria-expanded="false"]').first().click();
  await expect(log.locator('ol > li')).toHaveCount(60);
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight + 1000), 'the list is long: the log scrolls').toBe(true);
  expect(await main.evaluate((el) => el.scrollHeight), 'the page behind the frame keeps its height').toBe(before);
});

test('/ai/c: the frame fills the window with a step list open; the composer\'s icon buttons have names', async ({ page }) => {
  // A short window, so the open chat's transcript is taller than its log.
  await page.setViewportSize({ width: 1440, height: 520 });
  await gotoHub(page, CHAT);
  const log = page.getByRole('log');
  await expect(log).toBeVisible();
  const closed = log.getByRole('button', { name: /^\d+ steps?/, expanded: false });
  while (await closed.count() > 0) await closed.first().click();
  const main = page.locator('#hub-main');
  const m = await main.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(m.sh, 'the page behind the frame does not scroll').toBeLessThanOrEqual(m.ch + 1);
  for (const name of [conv['agent.add'], conv['agent.slash'], conv['agent.send'], conv['agent.sendMenu']]) {
    await expect(page.locator('[data-composer-lane]').getByRole('button', { name, exact: true }), name).toBeVisible();
  }
});
