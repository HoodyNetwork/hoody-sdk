// Playwright (the meter table's columns): on Billing, AI usage & limits, the columns
// that are not meters (server, tier, action) take their own words (the server name and the action on one line, the tier
// pill whole), and the five meter columns share the rest equally, so a server name stays on one line and the Bare-metal tag is
// whole. Measured through the real page in both themes at 2400 and 1350; below the cards switch nothing here applies.
// The fit/fill sizing works only above the table's least width; at 1350 the table sits at it and
// draws every column (the action included).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

type Theme = 'light' | 'dark';
const LANES = ['chat', 'decisions', 'search', 'speech', 'transcription'] as const;

async function open(page: Page, width: number, theme: Theme) {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, '/billing?view=wallet', { theme });
  await expect(page.locator('[data-section="usage"] [data-usage="table"] tbody tr').first()).toBeVisible({ timeout: 30_000 }); // reason: any drawn usage row proves the read landed; the page mounts late on a loaded host
}

/** What the usage table draws: each column's width (by its header), and per body row whether each non-meter cell's
 * content is on one line and whole. */
const measure = (page: Page) =>
  page.locator('[data-section="usage"] [data-usage="table"] table').evaluate((table, lanes) => {
    const heads = [...table.querySelectorAll<HTMLElement>('thead th')];
    const widths: Record<string, number> = {};
    // The kit's header cells carry no column id: the columns are in UsageSection's order (the cards-only lanes column
    // is not drawn in the table), and the count is checked below.
    const order = ['server', 'tier', ...(lanes as string[]), 'action'];
    const ids = heads.map((_, i) => order[i] ?? `extra-${i}`);
    heads.forEach((th, i) => {
      widths[ids[i]!] = th.getBoundingClientRect().width;
    });
    /** One line: every text run of the element starts on the same line (text-node rects only, so a pill's dot, a box
     * of its own, is not read as a second line), within half a line box. */
    const oneLine = (el: Element | null) => {
      if (!el) return false; // a missing element is a failure, never a pass
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const tops: number[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const b of range.getClientRects()) if (b.width > 0) tops.push(b.top);
      }
      return tops.length === 0 || Math.max(...tops) - Math.min(...tops) <= lh / 2;
    };
    /** Whole: nothing of the element runs past its cell's padding box, and nothing inside it is cut by its own box. */
    const whole = (el: Element | null) => {
      if (!el) return false; // a missing element is a failure, never a pass
      const cell = el.closest('td')!;
      const c = cell.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(cell);
      const inner = { left: c.left + parseFloat(cs.paddingLeft) - 1, right: c.right - parseFloat(cs.paddingRight) + 1 };
      const cut = [el, ...el.querySelectorAll('*')].some((x) => (x as HTMLElement).scrollWidth > (x as HTMLElement).clientWidth + 1 && getComputedStyle(x).overflowX !== 'visible');
      return r.left >= inner.left && r.right <= inner.right && !cut;
    };
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')];
      const by = (id: string) => cells[ids.indexOf(id)] ?? null;
      const name = by('server')?.querySelector('strong') ?? null;
      // The tier's pill (its Bare-metal tag included): one line and whole; the multiplier beside it may wrap under it.
      const tier = by('tier')?.firstElementChild?.firstElementChild ?? null; // usageTier > the StatusPill
      const action = by('action')?.querySelector('button, a') ?? null;
      return {
        name: name?.textContent ?? '',
        hasName: name !== null && (name.textContent ?? '').trim() !== '',
        hasTier: tier !== null && (tier.textContent ?? '').trim() !== '',
        hasAction: action !== null,
        nameOneLine: oneLine(name),
        tierOneLine: oneLine(tier),
        tierText: tier?.textContent ?? '',
        tierWhole: whole(tier),
        actionOneLine: oneLine(action),
        actionWhole: whole(action),
      };
    });
    // The server column: 'fit' to its widest name, never a share of the table. `need` is the
    // widest name as drawn plus the cell's own padding.
    const serverCells = [...table.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td'));
    const need = Math.max(
      0,
      ...serverCells.map((td) => {
        const strong = td?.querySelector('strong');
        if (!td || !strong) return 0;
        const range = document.createRange();
        range.selectNodeContents(strong);
        const cs = getComputedStyle(td);
        return range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      }),
    );
    return { server: { width: widths.server ?? -1, need }, ids, widths, laneWidths: (lanes as string[]).map((l) => widths[l] ?? -1), tableWidth: table.getBoundingClientRect().width, rows };
  }, LANES as unknown as string[]);

for (const theme of ['light', 'dark'] as const) {
  for (const width of [2400, 1350]) {
    test(`usage table at ${width}, ${theme}: non-meter columns hold their words on one line, meter columns share the rest`, async ({ page }) => {
      await open(page, width, theme);
      const m = await measure(page);
      // Exactly the eight table columns, in order (so each width read is the column it names).
      expect(m.ids, `columns ${JSON.stringify(m.widths)} in a ${m.tableWidth} px table`).toEqual(['server', 'tier', ...LANES, 'action']);
      // The meter columns share the rest equally: the same spare on top of each one's least width. Four have the same
      // least width (the 60 px bar and "100%"), so they are equal (+-1 px); Quick decisions' least width is its caps
      // header's (UsageSection USAGE_MIN, the kit's header measure), a few px more, so it is that much wider and no more.
      const [chat, decisions, ...rest] = m.laneWidths as [number, number, ...number[]];
      const same = [chat, ...rest];
      expect(Math.max(...same) - Math.min(...same), `lane widths ${m.laneWidths.join(', ')}`).toBeLessThanOrEqual(1);
      expect(decisions - chat, `lane widths ${m.laneWidths.join(', ')}`).toBeGreaterThanOrEqual(-1);
      expect(decisions - chat, `lane widths ${m.laneWidths.join(', ')}`).toBeLessThanOrEqual(24);
      // The server column takes its widest name (it never cuts it) and no more than its least width or that name plus the
      // fit's own allowances (the bold measure pad, the edge pad), so the meter columns get the rest. At 1350 the table
      // is at its least width and the action column above is still drawn (the column order check).
      expect(m.server.width, `server column ${m.server.width} for names needing ${m.server.need}`).toBeGreaterThanOrEqual(m.server.need - 1);
      expect(m.server.width, `server column ${m.server.width} for names needing ${m.server.need}`).toBeLessThanOrEqual(Math.max(140, m.server.need) + 24);
      // Each row: the server name, the tier (with its Bare-metal tag) and the action on one line, whole.
      expect(m.rows.length, 'usage rows drawn').toBeGreaterThan(0);
      expect(m.rows.some((r) => r.hasAction), 'at least one row carries its action').toBe(true);
      for (const r of m.rows) {
        expect(r.hasName, `row ${JSON.stringify(r.name)}: server name drawn`).toBe(true);
        expect(r.hasTier, `${r.name}: tier pill drawn`).toBe(true);
        expect(r.nameOneLine, `${r.name}: name on one line`).toBe(true);
        expect(r.tierOneLine, `${r.name}: tier pill "${r.tierText}" on one line`).toBe(true);
        expect(r.tierWhole, `${r.name}: tier pill "${r.tierText}" whole`).toBe(true);
        if (r.hasAction) {
          expect(r.actionOneLine, `${r.name}: action on one line`).toBe(true);
          expect(r.actionWhole, `${r.name}: action whole`).toBe(true);
        }
      }
      await page.locator('[data-section="usage"]').screenshot({ path: test.info().outputPath(`d25-usage-${width}-${theme}.png`) });
    });
  }
}
