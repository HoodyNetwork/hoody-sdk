// Playwright: Billing in one column at the reference widths (1350, 3440x1440, 390). No text on the page is cut (no
// ellipsis, no clipped run: the AI usage tier multiplier and the "can't read" note wrap), the wallet is the summary
// card on top (no rail), AI usage is the kit table while every column fits and cards below, and the cards keep every
// lane, named.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';
import strings from './strings.en.json';

const LANES = ['chat', 'decisions', 'search', 'speech', 'transcription'] as const;
const laneName = (l: (typeof LANES)[number]) => strings[`aiu.lane.${l}`];
/** The fixture's Plus server (n12) and its tier multiplier, which must not be cut ("4× the free allowa…" is the cut form). */
/** Each fixture server's AI usage action: an upgrade where a bigger plan exists, else Get more AI; none for the server
 * whose usage could not be read. */
const ACTIONS: Record<string, string | null> = {
  n12: strings['up.button'], // the chip button reads Upgrade; its name carries the server
  'Singapore M': strings['up.button'],
  'fra-7': strings['aiu.more'],
  'ash-3': strings['aiu.more'],
  'Tokyo M': null,
};

/** Every fixture server's row (a table row or a card) carries its own action, whole and visible. */
async function expectActions(page: Page, rows: Locator) {
  for (const [server, action] of Object.entries(ACTIONS)) {
    const row = rows.filter({ has: page.getByText(server, { exact: true }) });
    await expect(row, server).toHaveCount(1);
    if (action === null) {
      await expect(row.getByRole('button'), server).toHaveCount(0);
      await expect(row.getByRole('link'), server).toHaveCount(0);
    } else {
      await expect(row.getByText(action, { exact: true }), server).toBeVisible();
      // The upgrade reads Upgrade and is named for its server (label in name).
      if (action === strings['up.button']) await expect(row.getByRole('button', { name: strings['up.buttonNamed'].replace('{{server}}', server), exact: true }), server).toBeVisible();
    }
  }
}

/** Wait for the populated Wallet & usage view: the AI usage rows, so a measurement never runs on a loading or failed
 * section. */
async function ready(page: Page) {
  await expect(page.locator('[data-section="usage"] [data-usage] tbody tr').first()).toBeVisible(); // reason: any drawn usage row proves the read landed
}

/** Wait for the populated Plans view: its plan columns. */
async function readyPlans(page: Page) {
  await expect(page.locator('[data-section="plans"] [data-kit="plan-card"]').first()).toBeVisible(); // reason: any plan column drawn proves the plans rendered
}
const MULT = strings['aiu.mult'].replace('{{n}}', '4');

/** Every element in the page region whose own text overflows a box that clips it (overflow hidden or clip, or an
 * ellipsis), and every clipping table cell whose content is wider than it: its text, so a failure names what was cut.
 * Visually hidden text (1 px boxes) is not drawn, so not cut. */
async function clipped(page: Page): Promise<string[]> {
  return page.locator('#hub-main').evaluate((main) => {
    const out: string[] = [];
    for (const el of main.querySelectorAll<HTMLElement>('*')) {
      // A table cell that clips: content wider than its padding box is cut there, even when no text edge leaves the
      // cell's border box (a lane's words held on one line run into the cell padding).
      if (el.matches('td, th, [role="cell"]') && getComputedStyle(el).overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1)
        out.push(`cell overflows: ${(el.textContent ?? '').trim().slice(0, 60)}`);
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cs = getComputedStyle(el);
      const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      if (clips && el.scrollWidth > el.clientWidth + 1) out.push((el.textContent ?? '').trim().slice(0, 60));
      // A box that clips its children (a table cell) cuts a child's text that runs past it.
      const box = el.parentElement?.closest<HTMLElement>('td, th, [role="cell"]');
      if (box) {
        const b = box.getBoundingClientRect();
        if (r.right > b.right + 1 || r.left < b.left - 1) out.push(`past its cell: ${(el.textContent ?? '').trim().slice(0, 60)}`);
      }
    }
    return out;
  });
}

const SIZES = [
  { w: 1350, h: 900, usage: 'table' },
  { w: 3440, h: 1440, usage: 'table' },
  { w: 390, h: 844, usage: 'cards' },
] as const;

for (const z of SIZES) {
  test.describe(`at ${z.w}px`, () => {
    test.use({ viewport: { width: z.w, height: z.h } });

    test('no text on the page is cut, the AI usage tier multiplier and the unreadable-server note included', async ({ page }) => {
      await gotoHub(page, '/billing?view=wallet');
      const usage = page.locator('[data-section="usage"] [data-usage]');
      await expect(usage).toBeVisible();
      await ready(page);
      await expect(page.getByText(MULT, { exact: true })).toBeVisible();
      await expect(page.getByText(strings['aiu.unavailable'], { exact: true })).toBeVisible();
      expect(await clipped(page)).toEqual([]);
    });

    test('no text on the Plans view is cut', async ({ page }) => {
      await gotoHub(page, '/billing?view=plans');
      await readyPlans(page);
      expect(await clipped(page)).toEqual([]);
    });

    test(`the wallet is the summary card on top, and AI usage draws as ${z.usage}`, async ({ page }) => {
      await gotoHub(page, '/billing?view=wallet');
      const wallet = page.locator('[data-card="wallet"]');
      await expect(wallet).toBeVisible();
      expect(await wallet.evaluate((el) => el.closest('aside') === null)).toBe(true);
      // The wallet comes before the first section, in the same column.
      const order = await page.locator('[data-card="wallet"], [data-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? e.getAttribute('data-section')));
      expect(order[0]).toBe('wallet');
      await expect(page.locator('[data-section="usage"] [data-usage]')).toHaveAttribute('data-usage', z.usage);
    });

    if (z.usage === 'table') {
      test('the AI usage table shows the tier and every lane as columns, nothing dropped', async ({ page }) => {
        await gotoHub(page, '/billing?view=wallet');
        const table = page.getByRole('table', { name: strings['aiu.title'] });
        await expect(table).toBeVisible();
        const heads = await table.getByRole('columnheader').evaluateAll((hs) => hs.map((h) => (h.textContent ?? '').trim()));
        for (const name of [strings['col.server'], strings['col.tier'], ...LANES.map(laneName), strings['col.action']]) expect(heads).toContain(name);
        // Every server keeps its own action in the table (a column the table drops would take them off the page).
        await expectActions(page, table.locator('tbody tr'));
      });
    } else {
      test('every AI usage card names every lane; a server that could not be read says so instead', async ({ page }) => {
        await gotoHub(page, '/billing?view=wallet');
        const rows = page.locator('[data-section="usage"] [data-usage="cards"] tbody [role="row"]');
        await expect(rows.first()).toBeVisible();
        const cards = await rows.evaluateAll((els) => els.map((e) => e.textContent ?? ''));
        expect(cards.length).toBeGreaterThan(1);
        let unread = 0;
        for (const text of cards) {
          if (text.includes(strings['aiu.unavailable'])) {
            unread++;
            continue;
          }
          for (const l of LANES) expect(text, laneName(l)).toContain(laneName(l));
        }
        expect(unread).toBeLessThan(cards.length);
        // Every card keeps its server's action.
        await expectActions(page, rows);
      });
    }
  });
}

test('dark theme at 1350: no text on the page is cut', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/billing?view=wallet', { theme: 'dark' });
  await expect(page.locator('[data-section="usage"] [data-usage]')).toBeVisible();
  await ready(page);
  await expect(page.getByText(MULT, { exact: true })).toBeVisible();
  expect(await clipped(page)).toEqual([]);
});

// The bare-metal action (a server on the biggest plan: no bigger plan, no suggestion, the market open) reads Get more AI
// with its arrow, is named for bare metal, and fits the table's action column and the card: nothing cut.
for (const z of SIZES) {
  test(`at ${z.w}px the bare-metal AI usage action reads Get more AI, is named for bare metal, nothing cut`, async ({ page }) => {
    await page.setViewportSize({ width: z.w, height: z.h });
    await gotoHub(page, '/billing?view=wallet', { state: 'usage-bare-next' });
    await ready(page);
    const usage = page.locator('[data-section="usage"] [data-usage]');
    await expect(usage).toHaveAttribute('data-usage', z.usage);
    const rows = usage.locator(z.usage === 'table' ? 'tbody tr' : 'tbody [role="row"]');
    const row = rows.filter({ has: page.getByText('osa-9', { exact: true }) });
    await expect(row).toHaveCount(1);
    const action = row.getByRole('button', { name: strings['aiu.bare'], exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveText(strings['aiu.more']);
    // The other servers keep theirs.
    await expectActions(page, rows);
    expect(await clipped(page)).toEqual([]);
  });
}

// A classic scrollbar (15 to 17 px on Windows and Linux) takes more room than the Hub's own thin bar, and the shell keeps
// the bar's room beside the page (AppShell.module.css .main, scrollbar-gutter: stable). At 1350 with a 17 px bar the AI
// usage table still draws every column, every server keeps its action and no text is cut.
test('at 1350 beside a 17 px classic scrollbar the AI usage table keeps every column, nothing cut', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/billing?view=wallet');
  await ready(page);
  const usage = page.locator('[data-section="usage"] [data-usage]');
  const main = page.locator('#hub-main');
  const body = page.locator('[data-section="usage"] [data-least]');
  /** The room the page scroller's bar takes: its border box less its client box and its borders. */
  const bar = () =>
    main.evaluate((m: HTMLElement) => {
      const cs = getComputedStyle(m);
      return m.offsetWidth - m.clientWidth - parseFloat(cs.borderInlineStartWidth) - parseFloat(cs.borderInlineEndWidth);
    });
  const own = await bar();
  const room = await body.evaluate((el) => el.clientWidth);
  await page.addStyleTag({ content: '#hub-main::-webkit-scrollbar { width: 17px; }' });
  // The engine draws a scroller's bar at a new width only when it makes the bar again: hide it for one layout.
  await main.evaluate((m: HTMLElement) => {
    m.style.overflow = 'hidden';
    m.getBoundingClientRect();
    m.style.removeProperty('overflow');
  });
  // The forced bar is there (else this case proves nothing), and the usage section gave up exactly the extra room.
  await expect.poll(bar, 'the page scrollbar is the forced 17 px').toBe(17);
  const narrower = room - (17 - own);
  await expect.poll(() => body.evaluate((el) => el.clientWidth)).toBe(narrower);
  // Two frames, so the section's resize observer has seen the new width before its presentation is read.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const least = Number(await body.getAttribute('data-least'));
  expect(narrower, `AI usage has ${narrower} px beside a 17 px bar; the table needs ${least}`).toBeGreaterThanOrEqual(least);
  await expect(usage).toHaveAttribute('data-usage', 'table');
  const table = page.getByRole('table', { name: strings['aiu.title'] });
  const heads = await table.getByRole('columnheader').evaluateAll((hs) => hs.map((h) => (h.textContent ?? '').trim()));
  expect(heads).toEqual([strings['col.server'], strings['col.tier'], ...LANES.map(laneName), strings['col.action']]);
  await expectActions(page, table.locator('tbody tr'));
  await expect(page.getByText(MULT, { exact: true })).toBeVisible();
  expect(await clipped(page)).toEqual([]);
});

test('a search or sort in Server subscriptions leaves AI usage whole (the two tables keep separate URL state)', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/billing?view=wallet&q=zzzz-no-such-thing&sort=-plan');
  const usage = page.getByRole('table', { name: strings['aiu.title'] });
  await expect(usage).toBeVisible();
  await expect(usage.locator('tbody tr')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(1);
});

test('sorting AI usage leaves the Server subscriptions sort in the URL alone', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/billing?view=wallet&sort=-plan');
  const usage = page.getByRole('table', { name: strings['aiu.title'] });
  await expect(usage).toBeVisible();
  await usage.getByRole('columnheader', { name: strings['col.server'] }).getByRole('button').click();
  await expect(usage.getByRole('columnheader', { name: strings['col.server'] })).toHaveAttribute('aria-sort', /ascending|descending/);
  await expect(page).toHaveURL(/[?&]sort=-plan(&|$)/);
});

test('at the narrowest width that still draws the AI usage table, no text on the page is cut', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/billing?view=wallet');
  const usage = page.locator('[data-section="usage"] [data-usage]');
  await expect(usage).toHaveAttribute('data-usage', 'table');
  await ready(page);
  // Shrink the window until the usage section's body is as narrow as the table allows: one pixel less draws cards.
  const body = page.locator('[data-section="usage"] [data-least]');
  const room = await body.evaluate((el) => el.clientWidth);
  const least = Number(await body.getAttribute('data-least'));
  expect(least).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1350 - (room - least), height: 900 });
  await expect.poll(() => body.evaluate((el) => el.clientWidth)).toBe(least);
  await expect(usage).toHaveAttribute('data-usage', 'table');
  await expect(page.getByText(MULT, { exact: true })).toBeVisible();
  // No column dropped at the least width: the kit table sheds its rightmost column (the action) when the page's least
  // width is below the sum of the columns' floors (a header included).
  const heads = await page.getByRole('table', { name: strings['aiu.title'] }).getByRole('columnheader').evaluateAll((hs) => hs.map((h) => (h.textContent ?? '').trim()));
  expect(heads).toEqual([strings['col.server'], strings['col.tier'], ...LANES.map(laneName), strings['col.action']]);
  expect(await clipped(page)).toEqual([]);
  await page.setViewportSize({ width: 1350 - (room - least) - 1, height: 900 });
  await expect(usage).toHaveAttribute('data-usage', 'cards');
});

// A held server's retry action is a small chip button that says Try again, its name starting
// with that word and naming the server; at every width it is whole, inside its cell and clear of the row's menu.
for (const [w, h] of [
  [390, 844],
  [1100, 900],
  [1350, 900],
  [2400, 1300],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`at ${w}px (${theme}) a held server's Try again is whole and clear of its row menu`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await gotoHub(page, '/billing?view=wallet', { state: 'retry', theme });
      if (w < 700) {
        // Phone rows carry no action column: the retry is the row menu's Start it again.
        const menu = page.getByRole('button', { name: kit['table.rowActions'] });
        const item = page.locator('#hub-main *').filter({ hasText: 'fra-7' }).filter({ has: menu }).last();
        await item.getByRole('button', { name: kit['table.rowActions'] }).click();
        await expect(page.getByRole('menuitem', { name: strings['subs.resumeRetry'] })).toBeVisible();
        await page.keyboard.press('Escape');
        expect(await clipped(page)).toEqual([]);
        return;
      }
      const retry = page.getByRole('button', { name: new RegExp(`^${strings['subs.retry']}: .*fra-7`) });
      await expect(retry).toBeVisible();
      await expect(retry.locator('[data-btn-label]')).toHaveText(strings['subs.retry']);
      const label = retry.locator('[data-btn-label]');
      expect(await label.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const row = page.locator('tr, [role="row"], article').filter({ has: retry }).last();
      const menu = row.getByRole('button', { name: kit['table.rowActions'] });
      const b = (await retry.boundingBox())!;
      if (await menu.count()) {
        const m = (await menu.first().boundingBox())!;
        // Clear of the menu: side by side with a gap, or on another line.
        expect(b.x + b.width <= m.x - 4 || b.y + b.height <= m.y || m.y + m.height <= b.y, 'Try again clear of the row menu').toBe(true);
      }
      const cell = retry.locator('xpath=ancestor::td[1]');
      if (await cell.count()) {
        const c = (await cell.boundingBox())!;
        expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 1);
      }
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      expect(await clipped(page)).toEqual([]);
    });
  }
}
