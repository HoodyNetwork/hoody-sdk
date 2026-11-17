// Playwright (the "Dashed ledger with marker row" design): Account, Sign-in sessions. The table is
// capped at 432 px and its rows scroll inside the frame under a pinned header, every row still reachable from the
// keyboard; this browser's row carries a 4 px highlight bar and a wash, and its "This browser" words sit in a mono caps
// tag on the highlight (the words carry the meaning, the bar is decorative); row lines are dashed, the header shaded
// over a dashed line; Keys made is mono and right-aligned; the Where column holds the address whole. Through the real
// page (fixture: 12 active sessions) at 1350 and 390 in both themes.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

type Theme = 'light' | 'dark';
const SEC = '[data-section="sessions"]';
const ROWS = `${SEC} table tbody tr[data-row-id]`;

async function open(page: Page, width: number, theme: Theme) {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, '/account', { theme });
  // reason: the account page mounts late on a loaded host; the rows prove the sessions read landed
  await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 30_000 });
}

/** A token as the page resolves it, in the form getComputedStyle gives for `prop`. */
const token = (page: Page, name: string, prop: 'color' | 'background-color' = 'color') =>
  page.evaluate(
    ([n, p]) => {
      const probe = document.createElement('i');
      probe.style.setProperty(p!, `var(${n})`);
      document.querySelector('#hub-main')!.append(probe);
      const cs = getComputedStyle(probe);
      const v = p === 'color' ? cs.color : cs.backgroundColor;
      probe.remove();
      return v;
    },
    [name, prop],
  );

const look = (page: Page) =>
  page.locator(`${SEC} [data-table-frame]`).evaluate((frame, [thisWords, keysHead, whereHead]) => {
    const box = frame.querySelector<HTMLElement>('[data-plan-width]')!;
    const rows = [...frame.querySelectorAll<HTMLElement>('tbody tr[data-row-id]')];
    const marked = rows.filter((r) => r.dataset.mark !== undefined);
    const mark = marked[0];
    const first = mark?.querySelector('td');
    const tag = mark ? [...mark.querySelectorAll<HTMLElement>('span')].find((x) => x.textContent?.trim() === thisWords && x.children.length === 0) : undefined;
    const tagBox = tag?.closest<HTMLElement>('span[class*="tag"]') ?? tag;
    const plain = rows.find((r) => r !== mark)?.querySelector('td');
    const th = frame.querySelector<HTMLElement>('thead th');
    const thVisible = th ? getComputedStyle(th).position === 'sticky' && th.getBoundingClientRect().height > 2 : false;
    // Cells by their header's position: the kit sheds columns, so a fixed nth-child would read another column.
    const headTexts = [...frame.querySelectorAll<HTMLElement>('thead th')].map((x) => (x.textContent ?? '').trim());
    const cellsOf = (head: string) => {
      const i = headTexts.indexOf(head);
      return i < 0 ? [] : (rows.map((r) => r.querySelectorAll<HTMLElement>(':scope > td')[i]).filter(Boolean) as HTMLElement[]);
    };
    const keys = cellsOf(keysHead!);
    const where = cellsOf(whereHead!);
    return {
      boxMax: getComputedStyle(box).maxHeight,
      boxH: box.clientHeight,
      scrolls: box.scrollHeight > box.clientHeight + 1,
      rows: rows.length,
      marks: marked.map((r) => r.dataset.mark),
      markShadow: first ? getComputedStyle(first).boxShadow : '',
      markWash: first ? getComputedStyle(first).backgroundColor : '',
      plainWash: plain ? getComputedStyle(plain).backgroundColor : '',
      tagText: tag?.textContent?.trim() ?? '',
      tagBg: tagBox ? getComputedStyle(tagBox).backgroundColor : '',
      tagCase: tagBox ? getComputedStyle(tagBox).textTransform : '',
      tagMono: tagBox ? getComputedStyle(tagBox).fontFamily : '',
      lineStyle: plain ? getComputedStyle(plain).borderBottomStyle : '',
      lineColor: plain ? getComputedStyle(plain).borderBottomColor : '',
      thVisible,
      thLine: th ? getComputedStyle(th).borderBottomStyle : '',
      thLineColor: th ? getComputedStyle(th).borderBottomColor : '',
      thBg: th ? getComputedStyle(th).backgroundColor : '',
      heads: [...frame.querySelectorAll<HTMLElement>('thead th')].map((x) => (x.textContent ?? '').trim()),
      keysAlign: keys.map((k) => getComputedStyle(k).textAlign),
      keysMono: keys.map((k) => getComputedStyle(k).fontFamily),
      whereCount: where.length,
      whereCut: where.some((w) => w.scrollWidth > w.clientWidth + 1),
    };
  }, [strings['s.this'], strings['s.col.keys'], strings['s.col.where']]);

/** Text the section cuts: an element with its own text whose box clips it (overflow not visible and content wider or
 * taller than the box). The kit's screen-reader-only text (absolute, clipped to nothing) is skipped. */
const cutText = (page: Page) =>
  page.locator(SEC).evaluate((sec) => {
    const out: string[] = [];
    for (const el of sec.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'absolute' && el.clientWidth <= 1) continue;
      if (el.getClientRects().length === 0) continue;
      const x = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
      const y = cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1 && !el.matches('[data-plan-width]');
      if (x || y) out.push(`${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 40)}" ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
    }
    return out;
  });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 390]) {
    test(`sessions ledger at ${width}, ${theme}: capped, marked, dashed`, async ({ page }) => {
      await open(page, width, theme);
      const l = await look(page);
      // Capped at 432 px and the rows scroll inside it (the fixture's 12 rows are taller than that).
      expect(l.boxMax).toBe('432px');
      expect(l.boxH).toBeLessThanOrEqual(432);
      expect(l.rows).toBe(12);
      expect(l.scrolls, 'rows scroll inside the frame').toBe(true);
      // This browser's row: one marked row, the 4 px highlight bar and the wash from their tokens; the words in a tag on
      // the highlight, mono caps.
      expect(l.marks).toEqual(['acc']);
      const bar = await token(page, '--dt-mark-bar-acc');
      expect(l.markShadow).toContain(bar);
      expect(l.markShadow).toContain('4px 0px 0px 0px inset');
      expect(l.markWash).toBe(await token(page, '--dt-mark-wash-acc', 'background-color'));
      expect(l.markWash).not.toBe(l.plainWash);
      expect(l.tagText).toBe(strings['s.this']);
      expect(l.tagBg).toBe(await token(page, '--hx-acc', 'background-color'));
      expect(l.tagCase).toBe('uppercase');
      const mono = await page.evaluate(() => {
        const probe = document.createElement('i');
        probe.style.setProperty('font-family', 'var(--font-mono)');
        document.querySelector('#hub-main')!.append(probe);
        const v = getComputedStyle(probe).fontFamily;
        probe.remove();
        return v;
      });
      expect(l.tagMono, 'the tag is mono').toBe(mono);
      // Dashed row lines in the ledger colour.
      expect(l.lineStyle).toBe('dashed');
      expect(l.lineColor).toBe(await token(page, '--hx-ledger-line'));
      if (width >= 600) {
        // The column table: the header shaded over a dashed line and pinned while the rows scroll under it.
        expect(l.thVisible, 'column header drawn and sticky').toBe(true);
        expect(l.thLine).toBe('dashed');
        expect(l.thLineColor).toBe(await token(page, '--hx-ledger-head-line'));
        expect(l.thBg).toBe(await token(page, '--hx-ledger-head-bg', 'background-color'));
        const pinned = await page.locator(`${SEC} [data-table-frame] [data-plan-width]`).evaluate((box) => {
          box.scrollTop = 200;
          const th = box.querySelector('thead th')!.getBoundingClientRect();
          return Math.abs(th.top - box.getBoundingClientRect().top) <= 1 && box.scrollTop > 0;
        });
        expect(pinned, 'header pinned at the top of the scrolled frame').toBe(true);
        expect(l.heads, 'Keys made shown at this width').toContain(strings['s.col.keys']);
        expect(l.whereCount, 'IP / country shown at this width').toBe(12);
        // The kit writes the logical value (end); in this left-to-right page end is the right edge.
        expect([...new Set(l.keysAlign)].every((v) => v === 'end' || v === 'right') && l.keysAlign.length > 0, `Keys made right-aligned: ${[...new Set(l.keysAlign)].join(',')}`).toBe(true);
        expect(new Set(l.keysMono), 'Keys made mono').toEqual(new Set([mono]));
        expect(l.whereCut, 'the Where column holds the address whole').toBe(false);
      }
      // Every row is reachable by keyboard: the last row comes into the frame.
      await page.locator(ROWS).first().focus();
      await page.keyboard.press('End');
      const last = page.locator(ROWS).last();
      await expect(last).toBeFocused();
      const inFrame = await last.evaluate((tr) => {
        const box = tr.closest('[data-plan-width]')!.getBoundingClientRect();
        const r = tr.getBoundingClientRect();
        return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      });
      expect(inFrame, 'the last row scrolled into the frame').toBe(true);
      await noSideScroll(page);
      // No text in the section is cut, the capped table and its footer included; the footer (count, and Show more when
      // there is more) sits below the capped frame, outside its scroll.
      expect(await cutText(page), 'cut text in Sign-in sessions').toEqual([]);
      const below = await page.locator(SEC).evaluate((sec) => {
        const box = sec.querySelector('[data-plan-width]')!.getBoundingClientRect();
        const foot = [...sec.querySelectorAll<HTMLElement>('[class*="footer"]')].filter((f) => !f.closest('[data-plan-width]') && f.getClientRects().length > 0);
        return { n: foot.length, under: foot.every((f) => f.getBoundingClientRect().top >= box.bottom - 1) };
      });
      expect(below.under, 'the table footer sits below the capped frame').toBe(true);
      await page.locator(SEC).screenshot({ path: test.info().outputPath(`d41-sessions-${width}-${theme}.png`) });
    });
  }
}

// The same as on Keys: the kit's planner sheds columns by priority when the frame is too
// narrow, Keys made first. It is drawn from 760 px to the sidebar breakpoint, and again from 1080 px, where the frame
// has room beside the sidebar; between (920-1040) and below 760 it is shed, and the table never cuts text or scrolls
// sideways instead. The column is drawn wherever it fits.
for (const [width, keys] of [
  [600, false],
  [720, false],
  [760, true],
  [880, true],
  [960, false],
  [1040, false],
  [1080, true],
  [1350, true],
  [1920, true],
] as const) {
  test(`sessions columns at ${width}: Keys made ${keys ? 'drawn' : 'shed'}, nothing cut`, async ({ page }) => {
    await open(page, width, 'light');
    const l = await look(page);
    for (const head of [strings['s.col.device'], strings['s.col.method'], strings['s.col.lastSeen']]) expect(l.heads, `${head} drawn`).toContain(head);
    if (keys) {
      expect(l.heads, 'Keys made drawn').toContain(strings['s.col.keys']);
      expect(l.heads, 'IP / country drawn (it sheds after Keys made)').toContain(strings['s.col.where']);
    } else {
      expect(l.heads, 'Keys made shed at this width').not.toContain(strings['s.col.keys']);
    }
    expect(await cutText(page), `cut text at ${width}`).toEqual([]);
    await noSideScroll(page);
  });
}
