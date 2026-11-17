// Playwright: the wider buttons stay whole in the branches the page shots do not open. Each one checked has its whole
// label (the label box is not narrower than its text), sits inside its table cell, and inside the window: Bots with no
// computer running (short and long names), Servers' Pay now column (a table row's own action: a plate with no end
// glyph), a Program's port range pager and its Start a port, and the AI key step's pending state in the narrowest
// drawer and on a phone. Every other one is a glyph button: a plate with its end glyph.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import ai from '../../pages/ai/strings.en.json';
import bots from '../../pages/bots/strings.en.json';
import computers from '../../pages/computers/strings.en.json';
import overlays from '../overlays/strings.en.json';
import programs from '../../pages/programs/strings.en.json';

/** A button is whole: its label is not cut, it ends inside its table cell (when in one) and inside the window. It is a
 *  glyph button (a plate with its end glyph) unless `mark` says it is a table row's action, which draws none. */
async function whole(page: Page, b: Locator, what: string, mark: 'glyph' | 'row action' = 'glyph') {
  await expect(b, what).toBeVisible();
  expect(await b.getAttribute('data-glyph'), `${what}: ${mark}`).toBe(mark === 'glyph' ? '' : null);
  await expect(b.locator('[data-glyph-mark]'), `${what}: ${mark}`).toHaveCount(mark === 'glyph' ? 1 : 0);
  const cut = await b.locator('[data-btn-label]').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(cut, `${what}: label cut by ${cut}px`).toBeLessThanOrEqual(1);
  const r = (await b.boundingBox())!;
  const cell = b.locator('xpath=ancestor::td[1]');
  if (await cell.count()) {
    const c = (await cell.boundingBox())!;
    expect(r.x + r.width, `${what}: inside its cell`).toBeLessThanOrEqual(c.x + c.width + 1);
  }
  expect(r.x + r.width, `${what}: inside the window`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

const coarse390 = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

for (const theme of ['light', 'dark'] as const) {
  for (const [w, h] of [
    [390, 844],
    [1350, 900],
    [2400, 1300],
  ] as const) {
    test(`Bots with no computer running: each Start is whole, its name the computer's, at ${w} (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const [state, names] of [
        ['noRunning', ['atlas', 'boreal', 'cinder']],
        ['noRunningLong', ['production-worker-eu-central-01', 'boreal']],
      ] as const) {
        await gotoHub(page, '/bots', { state, theme });
        for (const name of names) {
          const b = page.getByRole('button', { name: bots['list.start'].replace('{{name}}', name), exact: true });
          await whole(page, b, `${state} ${name}`);
          await expect(b.locator('[data-btn-label]')).toHaveText(bots['list.startShort']);
        }
      }
    });
  }
}

for (const w of [1100, 1350]) {
  test(`Servers: Pay now is whole in its column at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await gotoHub(page, '/computers/servers');
    const pay = page.getByRole('button', { name: computers['sub.payNow'], exact: true });
    await expect(pay.first()).toBeVisible(); // reason: several servers owe a payment; each one is checked just below
    for (const b of await pay.all()) await whole(page, b, `Pay now at ${w}`, 'row action');
  });
}

test.describe('a port range program on a phone (coarse pointer)', () => {
  test.use(coarse390);
  test('the pager buttons and Start a port are whole; the pager goes under its summary', async ({ page }) => {
    await gotoHub(page, '/programs?sel=prog%3A40', { state: 'big-range' });
    const prev = page.getByRole('button', { name: programs['address.prev'], exact: true });
    const next = page.getByRole('button', { name: programs['address.next'], exact: true });
    await whole(page, prev, 'Previous ports');
    await whole(page, next, 'Next ports');
    await whole(page, page.getByRole('button', { name: programs['port.startA'], exact: true }), 'Start a port');
    // 18 ports, 16 a page: the first page's words, then its buttons under them (no room beside them at 390).
    const summary = page.getByText(programs['address.page'].replace('{{a}}', '9000').replace('{{b}}', '9015').replace('{{n}}', '18'), { exact: true });
    const s = (await summary.boundingBox())!;
    expect((await prev.boundingBox())!.y, 'the pager buttons under the summary').toBeGreaterThanOrEqual(s.y + s.height - 1);
  });
});

for (const w of [1100, 1350]) {
  test(`a port range program at ${w}: the pager buttons are whole in the inspector`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await gotoHub(page, '/programs?sel=prog%3A41', { state: 'big-range' });
    await whole(page, page.getByRole('button', { name: programs['address.prev'], exact: true }), 'Previous ports');
    await whole(page, page.getByRole('button', { name: programs['address.next'], exact: true }), 'Next ports');
  });
}

/** Save a key that gets no answer: the step offers to stop tracking that save, with the hint beside it. */
async function pendingKey(page: Page) {
  await page.getByLabel(/API key/).fill('sk-fixture-0000000000000000');
  await page.getByRole('button', { name: ai['key.save'] }).click();
  return page.getByRole('button', { name: ai['key.typeAgain'], exact: true });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the AI key step's pending state in the narrowest drawer (360) is whole (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/ai/models?connect=anthropic', { state: 'pending', theme });
    const edge = page.getByRole('separator', { name: overlays['resize'], exact: true }); // the drawer's resize edge
    await edge.focus();
    await page.keyboard.press('Home'); // the drawer's least width
    await expect(edge).toHaveAttribute('aria-valuenow', '360');
    await whole(page, await pendingKey(page), 'Stop tracking this save at 360');
    await expect(page.getByText(ai['key.pendingHint'], { exact: true })).toBeVisible();
  });

  test.describe(`the AI key step's pending state on a phone (${theme})`, () => {
    test.use(coarse390);
    test(`is whole (${theme})`, async ({ page }) => {
      await gotoHub(page, '/ai/models?connect=anthropic', { state: 'pending', theme });
      await whole(page, await pendingKey(page), 'Stop tracking this save at 390');
    });
  });
}
