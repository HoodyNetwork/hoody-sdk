// Playwright: the Referrals page on fixtures: the sidebar's Account
// group leads here after Billing, Copy link copies the API's link, a phone stacks it with no sideways scroll, and
// Account's Elsewhere row opens it. Your links is one three-column grid (code | link | action) shared by the main row,
// the custom rows and the create row: every link box and the new-code field start and end at one x, and Copy link,
// Retire… and Create start on one x. On a phone the rows stack and Retire… stays a worded button; the Referrer and
// Creator cards stack under 480 px of content. Row A: at 1440 Referral credit sits right of the links, tops level; on a phone it
// stacks under them on the same x and width. The cross-page tests need the whole Hub (HUB_PAGE unset or '*'); a referrals-only
// server skips them.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const ONLY = process.env.HUB_PAGE === 'referrals';
const LINK = 'https://api.hoody.com/auth/signup?ref=k7m2q9xa';
const LINK_CUSTOM = 'https://api.hoody.com/auth/signup?ref=maya-builds';
type Box = { x: number; y: number; width: number; height: number };
/** Row A's two cells (layout.ts ROW_A): the cell holding Your links and the cell holding Referral credit. */
const rowA = (page: Page, credit: string) =>
  page.evaluate((title) => {
    const box = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
    const links = document.getElementById('referral-link')!.parentElement!;
    let c: Element | null = [...document.querySelectorAll('h1, h2, h3, h4')].find((h) => h.textContent?.trim() === title) ?? null;
    while (c && c.parentElement !== links.parentElement) c = c.parentElement;
    return { links: box(links), credit: c ? box(c) : null };
  }, credit);


// How you earn is four columns on a wide content area, two under 900 px of content, one
// under 600 px. The content container (AppShell `content`) is measured, so each width checks the rule it falls under.
const earnCols = (page: Page) =>
  page.evaluate(() => {
    const earn = document.getElementById('referral-earn')!;
    let c: Element | null = earn;
    while (c && !getComputedStyle(c).containerName.split(' ').includes('content')) c = c.parentElement;
    const xs = new Set([...earn.querySelectorAll('[data-kit="plan-card"]')].map((el) => Math.round(el.getBoundingClientRect().left)));
    return { content: c ? c.getBoundingClientRect().width : -1, cols: xs.size };
  });
for (const [width, want] of [[1440, 4], [800, 2], [390, 1]] as const) {
  test(`How you earn takes ${want} column(s) at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await gotoHub(page, '/referrals');
    await expect(page.getByRole('group', { name: strings['earn.hold'] })).toBeVisible();
    const { content, cols } = await earnCols(page);
    expect(content, `content ${content} px at ${width}`).toBeGreaterThan(0);
    expect(cols).toBe(content < 600 ? 1 : content < 900 ? 2 : 4);
    expect(cols, `content ${content} px at ${width}`).toBe(want);
    await noSideScroll(page);
  });
}

test.describe('wide', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a member sees the link, codes, credit and level; Copy puts the link on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gotoHub(page, '/referrals');
    await expect(page.getByText(LINK)).toBeVisible();
    await expect(page.getByRole('heading', { name: strings['credit.title'], exact: true })).toBeVisible();
    const referrer = page.getByRole('group', { name: strings['levels.referrer'], exact: true });
    await expect(referrer.getByText('5%')).toBeVisible();
    await expect(referrer.getByText(strings['levels.yours'])).toBeVisible();
    // Row A at 1440: Referral credit beside the links, on their right, the two tops level.
    const { links, credit } = await rowA(page, strings['credit.title']);
    expect(credit).not.toBeNull();
    expect(credit!.x).toBeGreaterThanOrEqual(links.x + links.width);
    expect(Math.abs(credit!.y - links.y)).toBeLessThanOrEqual(1);
    expect(credit!.width).toBeLessThan(links.width);
    await page.getByRole('button', { name: strings['link.copyMain'], exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
  });

  // The link boxes and the new-code field share one start and one end (a subgrid); Copy link,
  // Release… and Create share the action column's start; a code row is one line; Referrer, Creator and Where you stand
  // sit side by side on the thirds.
  test('one grid: link boxes and the new-code field share both edges, the actions one start, the levels one row', async ({ page }) => {
    await gotoHub(page, '/referrals');
    await expect(page.getByText(LINK_CUSTOM)).toBeVisible();
    const cells = await page.locator('#referral-link li').evaluateAll((lis) => lis.map((li) => li.children[1]?.getBoundingClientRect()).filter(Boolean).map((r) => [r!.left, r!.right]));
    const field = await page.getByRole('textbox', { name: strings['create.label'] }).evaluate((el) => { const r = el.parentElement!.getBoundingClientRect(); return [r.left, r.right]; });
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const c of [...cells, field]) {
      expect(Math.abs(c[0]! - cells[0]![0]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(c[1]! - cells[0]![1]!)).toBeLessThanOrEqual(1);
    }
    const starts = await Promise.all(
      [page.getByRole('button', { name: strings['link.copyMain'], exact: true }), page.getByRole('button', { name: 'Retire maya-builds' }), page.getByRole('button', { name: strings['create.action'], exact: true })].map(async (b) => (await b.boundingBox())!.x),
    );
    for (const x of starts) expect(Math.abs(x - starts[0]!)).toBeLessThanOrEqual(1);
    expect(starts[0]!).toBeGreaterThan(cells[0]![1]!);
    const row = page.getByRole('listitem').filter({ hasText: 'maya-builds' });
    const code = (await row.getByText('maya-builds', { exact: true }).boundingBox())!;
    const link = (await row.getByText(LINK_CUSTOM).boundingBox())!;
    const rel = (await row.getByRole('button', { name: 'Retire maya-builds' }).boundingBox())!;
    expect(link.x).toBeGreaterThan(code.x + code.width);
    expect(rel.x).toBeGreaterThan(link.x + link.width);
    expect(Math.abs(rel.y + rel.height / 2 - (link.y + link.height / 2))).toBeLessThan(24);
    // Each action's InfoTip sits beside its button, never dropped under it (the action column holds both)
    for (const [btn, tip] of [[rel, row.getByRole('button', { name: /retiring a code/i })], [(await page.getByRole('button', { name: strings['create.action'], exact: true }).boundingBox())!, page.getByRole('button', { name: /about code rules/i })]] as const) {
      const t = (await tip.boundingBox())!;
      expect(t.x).toBeGreaterThanOrEqual(btn.x + btn.width);
      expect(Math.abs(t.y + t.height / 2 - (btn.y + btn.height / 2))).toBeLessThan(btn.height / 2);
    }
    const tops = await Promise.all([strings['levels.referrer'], strings['levels.creator'], strings['stand.title']].map(async (n) => (await page.getByRole('group', { name: n, exact: true }).boundingBox())!));
    expect(tops[1]!.x).toBeGreaterThan(tops[0]!.x + tops[0]!.width);
    expect(tops[2]!.x).toBeGreaterThan(tops[1]!.x + tops[1]!.width);
    expect(Math.abs(tops[0]!.y - tops[2]!.y)).toBeLessThanOrEqual(1);
  });

  test('the sidebar lists Referrals right after the billing page and opens the page', async ({ page }) => {
    test.skip(ONLY, 'needs the whole Hub');
    // Two whole pages load (Home, then Referrals): more than the default 30 s on a loaded host.
    test.setTimeout(90_000);
    await gotoHub(page, '/home');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const links = await nav
      .getByRole('link')
      .evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href') ?? '', name: (el.textContent ?? '').trim() })));
    // The billing page by its address, not its words: its label ("Plans & Billing") is that page's own string.
    const at = links.findIndex((l) => /(^|#)\/billing([?#]|$)/.test(l.href));
    expect(at, `the sidebar links the billing page (${links.map((l) => l.href).join(' ')})`).toBeGreaterThanOrEqual(0);
    expect(links[at + 1]?.name).toBe(strings.nav);
    await nav.getByRole('link', { name: strings.nav, exact: true }).click();
    await expect(page).toHaveURL(/#\/referrals$/);
    await expect(page.getByText(LINK)).toBeVisible();
  });

  test('Account > Elsewhere has a Referrals row that opens the page', async ({ page }) => {
    test.skip(ONLY, 'needs the whole Hub');
    await gotoHub(page, '/account');
    await page.getByRole('button', { name: 'Referrals', exact: true }).click();
    await expect(page).toHaveURL(/#\/referrals$/);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sections stack and nothing scrolls sideways', async ({ page }) => {
    await gotoHub(page, '/referrals');
    await expect(page.getByText(LINK)).toBeVisible();
    await expect(page.getByRole('heading', { name: strings['credit.title'], exact: true })).toBeVisible();
    // Row A on a phone: links first, Referral credit under them, both on one x and one width.
    const { links, credit } = await rowA(page, strings['credit.title']);
    expect(credit).not.toBeNull();
    expect(Math.abs(credit!.x - links.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(credit!.width - links.width)).toBeLessThanOrEqual(1);
    expect(credit!.y).toBeGreaterThanOrEqual(links.y + links.height);
    await noSideScroll(page);
  });

  // The whole address stays readable on a phone. It wraps; nothing between the address and its
  // row clips it (no ellipsis, no hidden overflow), and its box stays inside the screen.
  test('each signup address shows in full, wrapped, never cut', async ({ page }) => {
    await gotoHub(page, '/referrals');
    for (const url of [LINK, LINK_CUSTOM]) {
      const a = page.getByRole('link', { name: new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      await expect(a).toBeVisible();
      expect(await a.innerText()).toBe(url);
      const cut = await a.evaluate((el) => {
        const out: string[] = [];
        for (let n: Element | null = el; n && n.tagName !== 'LI'; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (n.scrollWidth > n.clientWidth + 1 && cs.overflowX !== 'visible') out.push(`${n.tagName} clips ${n.scrollWidth}>${n.clientWidth}`);
          if (cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap') out.push(`${n.tagName} ellipsis`);
        }
        const r = el.getBoundingClientRect();
        if (r.right > document.documentElement.clientWidth) out.push(`right ${r.right}`);
        return out;
      });
      expect(cut).toEqual([]);
    }
  });
  // At 390 nothing collapses into a bare ⋯. A code row stacks (link under the code, Retire… under the
  // link, still worded, opening its confirm); Referrer, Creator and Where you stand stack.
  test('a code row stacks with Retire… worded, and the level cards stack', async ({ page }) => {
    await gotoHub(page, '/referrals');
    const row = page.getByRole('listitem').filter({ hasText: 'maya-builds' });
    const code = (await row.getByText('maya-builds', { exact: true }).boundingBox())!;
    const link = (await row.getByText(LINK_CUSTOM).boundingBox())!;
    const release = row.getByRole('button', { name: 'Retire maya-builds' });
    await expect(release).toHaveText(strings['release.action']);
    await expect(row.getByRole('button', { name: 'More actions' })).toHaveCount(0);
    const rel = (await release.boundingBox())!;
    expect(link.y).toBeGreaterThanOrEqual(code.y + code.height);
    expect(rel.y).toBeGreaterThanOrEqual(link.y + link.height);
    await release.click();
    await expect(page.getByRole('alertdialog', { name: 'Retire maya-builds?' })).toBeVisible();
    await page.keyboard.press('Escape');
    const [ref, cre, stand] = await Promise.all([strings['levels.referrer'], strings['levels.creator'], strings['stand.title']].map(async (n) => (await page.getByRole('group', { name: n, exact: true }).boundingBox())!));
    expect(Math.abs(cre!.x - ref!.x)).toBeLessThanOrEqual(1);
    expect(cre!.y).toBeGreaterThanOrEqual(ref!.y + ref!.height);
    expect(stand!.y).toBeGreaterThanOrEqual(cre!.y + cre!.height);
    await noSideScroll(page);
  });

  test('earning paused: the band, no Copy, nothing scrolls sideways', async ({ page }) => {
    await gotoHub(page, '/referrals', { state: 'earningPaused' });
    await expect(page.getByText(strings['band.earningPaused'])).toBeVisible();
    await expect(page.getByRole('button', { name: /copy/i })).toHaveCount(0);
    await noSideScroll(page);
  });
});

// MONEY: at usdText's largest amounts (13 digits) every digit and every label of the credit card stays whole and inside
// the card, at both widths: the amounts wrap, never clip, and no label is squeezed out. The rows are the kit Ledger's:
// their amounts end on one edge. A Creator's Withdraw… is the credit section's own action; it opens an explainer.
test.describe('credit', () => {
  test('the ledger amounts end on one edge, and a Creator opens the Withdraw explainer from the credit section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/referrals', { state: 'creator' });
    const card = page.locator('#referral-credit');
    const ledger = card.locator(`dl[aria-label="${strings['credit.ledger']}"]`);
    await expect(ledger).toBeVisible();
    const ends = await ledger.locator('dt + dd').evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().right)));
    expect(ends.length).toBeGreaterThanOrEqual(2);
    for (const x of ends) expect(Math.abs(x - ends[0]!)).toBeLessThanOrEqual(1);
    await card.getByRole('button', { name: strings['withdraw.action'], exact: true }).click();
    const dialog = page.getByRole('dialog', { name: strings['withdraw.title'], exact: true });
    await expect(dialog.getByText(strings['withdraw.creator'])).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  for (const width of [1440, 390]) {
    test(`${width}: the largest amounts and their labels are whole and inside the card`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await gotoHub(page, '/referrals', { state: 'bigCredit' });
      const amount = page.getByText('$9,999,999,999,999.99');
      await expect(amount).toBeVisible();
      const ledger = page.locator(`dl[aria-label="${strings['credit.ledger']}"]`);
      const box = (await ledger.locator('xpath=ancestor::section[1]').boundingBox())!;
      const label = page.locator(`dl[aria-label="${strings['credit.title']}"] dt`).filter({ hasText: strings['credit.available'] });
      const held = ledger.locator('dt').filter({ hasText: strings['credit.pending'] });
      for (const el of [amount, page.getByText('$8,888,888,888,888.88'), label, held]) {
        await expect(el).toBeVisible();
        const a = (await el.boundingBox())!;
        expect(a.x).toBeGreaterThanOrEqual(box.x - 1);
        expect(a.x + a.width).toBeLessThanOrEqual(box.x + box.width + 1);
        // nothing clipped: neither the element nor the cell around it hides any of its content
        expect(await el.evaluate((n) => n.scrollWidth <= n.clientWidth + 1 && n.parentElement!.scrollWidth <= n.parentElement!.clientWidth + 1)).toBe(true);
      }
      await noSideScroll(page);
    });
  }
});

// The page's questions: a location naming one lands on it, and Join's link peeks at the share's
// answer without leaving the confirm, at both widths.
test.describe('questions', () => {
  test.describe.configure({ timeout: 90_000 });
  for (const width of [1440, 390]) {
    test(`${width}: a location naming the hold question opens it, focused, and nothing scrolls sideways`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await gotoHub(page, '/referrals#faq-hold');
      const q = page.locator('#faq-hold button[aria-expanded]');
      await expect(q).toHaveAttribute('aria-expanded', 'true');
      await expect(q).toBeFocused();
      await expect(page.getByText(strings['faq.hold.a'])).toBeVisible();
      await noSideScroll(page);
      await page.screenshot({ animations: 'disabled', path: info.outputPath('faq-hold.png') });
    });

    test(`${width}: Join's "See how credit works" shows the share's answer and Escape keeps the confirm open`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await gotoHub(page, '/referrals', { state: 'canJoin' });
      await page.getByRole('button', { name: strings['join.action'] }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog.getByText(strings['join.creditOnly'])).toBeVisible();
      const link = dialog.getByRole('link', { name: strings['join.how'] });
      await link.click();
      await expect(page.getByRole('dialog').getByText(strings['faq.rate.a'])).toBeVisible();
      await page.screenshot({ animations: 'disabled', path: info.outputPath('join-peek.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(link).toBeFocused();
    });
  }
});
