// Playwright: the conversation frame in a real browser. At 1024, 1180, 1350, 1700 and 2500, with the
// sidebar open and as a rail, Details closed and open on each tab, a gate waiting and the computer paused, every decision
// button, Stop and Resume is inside the viewport at once (nothing is scrolled to first) and is the topmost element at its
// centre: nothing overlays the conversation. The frame mode is asserted from the page's own width class, not taken from
// the implementation. With the Needs-you bar showing, the bar sits above the composer and every control still hits. Below 840
// the Details sheet takes the whole page and a gate arriving closes it, with focus on the card; a long Edits list scrolls
// inside Details; Show brings the first card into view and focuses it. On a phone, Activity's Show on a later card closes
// the sheet, scrolls that card in and focuses a control in it, and a later Show moves to its own card.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const TARGETS = ['Allow once', 'Allow for this session', 'Deny', 'Stop', 'Resume'] as const;

async function open(page: Page, width: number, o: { rail: boolean; details: 'none' | 'activity' | 'edits' | 'usage'; query?: string }): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.addInitScript((collapsed: boolean) => { try { window.localStorage.setItem('hub.v3.shell', JSON.stringify({ collapsed })); } catch { /* none */ } }, o.rail);
  const details = o.details === 'none' ? 'details=0' : `details=1&tab=${o.details}`;
  await gotoHub(page, `/_kit?layout=ai-conversation&${details}&gates=1&paused=1${o.query ?? ''}`);
  await expect(page.locator('[data-details]')).toBeVisible();
}

/** The frame's mode must follow the rule for the page's own width class: a sheet below 840 when Details is open, a column
 *  beside the conversation at 840 and wider, nothing when closed. */
async function expectMode(page: Page, detailsOpen: boolean): Promise<'sheet' | 'column' | 'none'> {
  const frame = page.locator('[data-details]');
  const size = (await frame.getAttribute('data-size')) as string;
  const small = size === 'xs' || size === 's';
  const want = !detailsOpen ? 'none' : small ? 'sheet' : 'column';
  expect(await frame.getAttribute('data-details'), `Details mode at size class ${size}`).toBe(want);
  const w = await frame.evaluate((n) => n.getBoundingClientRect().width);
  const expectedSize = w < 600 ? 'xs' : w < 840 ? 's' : w < 1180 ? 'm' : w < 1560 ? 'l' : w < 2400 ? 'xl' : 'xxl';
  expect(size, `size class of a ${Math.round(w)} px page`).toBe(expectedSize);
  return want;
}

async function reachable(page: Page, name: string, within?: Locator): Promise<void> {
  // A card button's name carries its key hint ("Allow once Y", "Deny N"). With several gates waiting, `within` names one card.
  const el = (within ?? page).getByRole('button', { name: new RegExp(`^${name}( [YN])?$`) });
  await expect(el, `${name} drawn`).toBeVisible();
  const r = await el.evaluate((node) => {
    const b = node.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const top = document.elementFromPoint(x, y);
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, hit: !!top && (top === node || node.contains(top)), vw: window.innerWidth, vh: window.innerHeight };
  });
  expect(r.hit, `${name} is the topmost element at its centre`).toBe(true);
  expect(r.left, `${name} inside the viewport (left)`).toBeGreaterThanOrEqual(0);
  expect(r.top, `${name} inside the viewport (top)`).toBeGreaterThanOrEqual(0);
  expect(r.right, `${name} inside the viewport (right)`).toBeLessThanOrEqual(r.vw);
  expect(r.bottom, `${name} inside the viewport (bottom)`).toBeLessThanOrEqual(r.vh);
}

for (const width of [1024, 1180, 1350, 1700, 2500]) {
  for (const rail of [false, true]) {
    for (const details of ['none', 'activity', 'edits'] as const) {
      test(`${width} px, sidebar ${rail ? 'rail' : 'open'}, Details ${details}: decisions, Stop and Resume are reachable`, async ({ page }) => {
        await open(page, width, { rail, details });
        if ((await expectMode(page, details !== 'none')) === 'sheet') {
          // Below 840 the sheet takes the whole page: it is drawn, and closing it returns the conversation.
          await expect(page.getByRole('tab', { name: details === 'edits' ? 'Edits' : 'Activity' })).toBeVisible();
          await reachable(page, 'Close details');
          await page.getByRole('button', { name: 'Close details' }).click();
          await expectMode(page, false);
        }
        for (const name of TARGETS) await reachable(page, name);
      });
    }
  }
}

test('with the Needs-you bar showing (three gates), it sits above the composer and the controls still hit', async ({ page }) => {
  await open(page, 1180, { rail: false, details: 'none', query: '&gates=3&paused=0&turns=40' });
  const bar = page.locator('[data-needs-bar]');
  await expect(bar, 'three gates wait: the bar shows').toBeVisible();
  await expect(bar.getByText('2 more')).toBeVisible();
  const stop = (await page.getByRole('button', { name: 'Stop' }).boundingBox())!;
  const b = (await bar.boundingBox())!;
  expect(b.y + b.height, 'the bar sits above the composer, in the column').toBeLessThanOrEqual(stop.y + 1);
  const log = (await page.getByRole('log').boundingBox())!;
  expect(b.y, 'the bar is below the transcript, not over it').toBeGreaterThanOrEqual(log.y + log.height - 1);
  await reachable(page, 'Stop');
  // The first card is below the visible transcript (that is why the bar shows); Show brings it in, and then its controls hit.
  await bar.getByRole('button', { name: 'Show' }).click();
  await reachable(page, 'Deny', page.locator('[data-gate-wrap]'));
  await reachable(page, 'Allow once', page.locator('[data-gate-wrap]'));
});

test('Show brings the first waiting card into view and focuses a control in it', async ({ page }) => {
  await open(page, 1350, { rail: true, details: 'none', query: '&gates=3&paused=0&turns=40' });
  await page.getByRole('log').evaluate((n) => { n.scrollTop = 0; });
  await expect(page.locator('[data-needs-bar]')).toBeVisible();
  await page.locator('[data-needs-bar]').getByRole('button', { name: 'Show' }).click();
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    const wrap = document.querySelector('[data-gate-wrap]');
    return { inside: !!a && !!wrap && wrap.contains(a), name: a?.getAttribute('aria-label') ?? a?.textContent ?? '' };
  });
  expect(focused.inside, `focus is inside the first waiting card (${focused.name})`).toBe(true);
});

test('a long Edits list scrolls inside Details, in the column and in the phone sheet', async ({ page }) => {
  for (const [width, label] of [[1350, 'column'], [390, 'sheet']] as const) {
    await open(page, width, { rail: true, details: 'edits', query: '&edits=120&gates=0&paused=0' });
    const m = await page.locator('[data-details-panel]').evaluate((panel) => {
      const body = Array.from(panel.querySelectorAll<HTMLElement>('*')).find((n) => getComputedStyle(n).overflowY === 'auto' && n.scrollHeight > n.clientHeight + 40);
      const p = panel.getBoundingClientRect();
      return { found: !!body, bottom: p.bottom, vh: window.innerHeight };
    });
    expect(m.found, `${label}: the Edits list scrolls inside a bounded body`).toBe(true);
    expect(m.bottom, `${label}: Details ends inside the viewport`).toBeLessThanOrEqual(m.vh);
    await page.getByText('src/checkout/cart/part-119.ts').scrollIntoViewIfNeeded();
    await expect(page.getByText('src/checkout/cart/part-119.ts')).toBeInViewport();
  }
});

test('on a phone a gate arriving closes the Details sheet, so Allow once can act, and focus lands on the card', async ({ page }) => {
  await open(page, 390, { rail: true, details: 'activity', query: '&gates=0&paused=0' });
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Allow once/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop' }), 'the sheet takes the whole page').toBeHidden();
  await page.getByRole('button', { name: 'Another approval' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeHidden();
  await reachable(page, 'Allow once');
  await reachable(page, 'Deny');
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-ask-gate'))).toBe(true);
  await page.getByRole('button', { name: /^Allow once/ }).click();
});

test('on a phone with a gate waiting, the person can open Details over it and close it again', async ({ page }) => {
  await open(page, 390, { rail: true, details: 'none', query: '&paused=0' });
  await reachable(page, 'Allow once');
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'focus moved into Details').toBe('tab');
  await page.getByRole('button', { name: 'Close details' }).click();
  await reachable(page, 'Allow once');
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-details-toggle')), 'focus returned to the Details button').toBe(true);
});

test('on a phone, Show on a later card in Activity closes the sheet, scrolls that card in and focuses its first control; the next Show moves to its own card', async ({ page }) => {
  await open(page, 390, { rail: true, details: 'none', query: '&gates=3&paused=0&turns=40' });
  const keys = await page.locator('[data-gate-key]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-gate-key') as string));
  expect(keys, 'three cards are drawn').toHaveLength(3);
  for (const n of [1, 2]) {
    const card = page.locator(`[data-gate-key="${keys[n]}"]`);
    await page.getByRole('log').evaluate((el) => { el.scrollTop = 0; });
    await expect(card, `card ${n + 1} starts out of view`).not.toBeInViewport();
    await page.getByRole('button', { name: 'Details' }).click();
    const panel = page.locator('[data-details-panel]');
    await panel.getByRole('tab', { name: 'Activity' }).click();
    // The Activity row names its gate's command (the gallery's gate n pushes feature/cart-n); its Show is that row's own.
    await panel.getByRole('listitem').filter({ hasText: `feature/cart-${n + 1}` }).getByRole('button', { name: 'Show' }).click();
    await expect(page.getByRole('tab', { name: 'Activity' }), 'the sheet closed').toBeHidden();
    await expect(card, `Show scrolled card ${n + 1} into view`).toBeInViewport();
    await expect.poll(() => card.evaluate((w) => {
      const a = document.activeElement;
      return !!a && w.contains(a) && a.tagName === 'BUTTON';
    }), `a control in card ${n + 1} has focus`).toBe(true);
    for (const [i, k] of keys.entries()) {
      if (i === n) continue;
      expect(await page.locator(`[data-gate-key="${k}"]`).evaluate((w) => w.contains(document.activeElement)), `card ${i + 1} does not have focus`).toBe(false);
    }
    await reachable(page, 'Allow once', card);
  }
});

test('on a phone the header keeps computer · realm', async ({ page }) => {
  await open(page, 390, { rail: true, details: 'none', query: '&paused=0' });
  await expect(page.getByText('atlas · Work')).toBeVisible();
});

test('Edits wording', async ({ page }) => {
  await open(page, 1180, { rail: false, details: 'edits', query: '&paused=0' });
  await expect(page.getByText("Edits made with the edit tools in this chat, read from the tools' own inputs. Commands and helpers may have changed other files: see the folder's Repository.")).toBeVisible();
});

// The host passes the chat's Usage tab to Details (one store per chat, the turns from the stream). On the fixture
// page it is canned; the tab is in the strip, selected on request, and shows the totals and the turns.
test('the Usage tab is mounted in Details and shows the chat\'s totals and turns', async ({ page }) => {
  await open(page, 1350, { rail: true, details: 'usage', query: '&usage=1&gates=0&paused=0' });
  await expect(page.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Model calls')).toBeVisible();
  await expect(page.getByText('Turn 1')).toBeVisible();
  await expect(page.getByText('Turn 2')).toBeVisible();
  // the totals, and each turn holding its own finished request (a wrongly shaped row would leave a turn empty or "can't be found")
  const body = page.getByRole('tabpanel');
  await expect(body.getByText('$0.0123').first()).toBeVisible(); // the chat total shows in the facts row and again in the Cost column of the By model table
  const turn1 = page.getByText('Turn 1', { exact: true }).locator('xpath=../..');
  const turn2 = page.getByText('Turn 2', { exact: true }).locator('xpath=../..');
  await expect(turn1).toContainText('1 request');
  await expect(turn1).toContainText('$0.0042');
  await expect(turn1).toContainText('340 out');
  await expect(turn2).toContainText('1 request');
  await expect(turn2).toContainText('$0.0081');
  await expect(turn2).toContainText('610 out');
  await expect(body.getByText("can't be found in the usage rows")).toHaveCount(0);
  await expect(body.getByText('No request found for this turn.')).toHaveCount(0);
  await expect(body.getByText('Other spend')).toHaveCount(0);
});
test('without usage the host passes no Usage tab', async ({ page }) => {
  await open(page, 1350, { rail: true, details: 'activity', query: '&gates=0&paused=0' });
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Usage' })).toHaveCount(0);
});
