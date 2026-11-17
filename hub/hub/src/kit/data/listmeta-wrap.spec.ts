// Playwright: a list row's line 2 shows every meta field. Fields wrap whole onto more
// lines, so none is in the DOM but out of sight (for example Rules' and Hooks' Saved in / Runs at
// phone width). Each field brings its " · ", and the first on a line hangs before the line where it is clipped, so no
// line starts with a dot. Pages: the kit gallery's list with ?tipwrap=1 (a tip term in a field too long for one line) at
// 390, and the Programs list and a range program's Ports table (meta lines with per-port actions) at 320, on a fine and
// a coarse pointer (the list presentation; wider, these lists are tables). Rules & safety
// has no rule or hook rows in the dev fixtures (its reads answer an error there), so the kit list stands in for it.
import { writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import programs from '../../pages/programs/strings.en.json';

interface Field {
  text: string;
  /** The field lies inside its row's line 2 and inside the row: vertically, and across from its words (past its
   * separator, which may hang before the line) to its end. */
  inside: boolean;
  /** The point at the middle of the field's words hits the field itself (not clipped or covered). */
  hit: boolean;
  /** The field starts a line of line 2. */
  starts: boolean;
  /** For a field that starts a line: its separator's middle hits nothing of the field (clipped away). */
  dotHidden: boolean;
}

/** Every list line 2 on the page, or only inside the element marked `data-lmw-scope` when `scoped` (a list the page
 * draws under another surface, such as the Programs list beneath the inspector at 320, is covered there, not cut). */
async function fields(page: Page, scoped = false): Promise<{ rows: number; wrapped: number; shared: number; list: Field[] }> {
  return page.evaluate((sc) => {
    const root: ParentNode = (sc ? document.querySelector('[data-lmw-scope]') : null) ?? document;
    const lines = Array.from(root.querySelectorAll<HTMLElement>('[class*="listLine2"]'));
    const list: Field[] = [];
    let wrapped = 0;
    // Lines of fields that hold two or more fields side by side (so a field's start is told from its line's start).
    let shared = 0;
    for (const line2 of lines) {
      // Hit tests need the row on screen.
      line2.scrollIntoView({ block: 'center', inline: 'nearest' });
      const meta = line2.querySelector<HTMLElement>('[class*="listMeta"]');
      const row = line2.closest('tr');
      if (!meta || !row) continue;
      const items = Array.from(meta.children).filter((e): e is HTMLElement => e instanceof HTMLElement && getComputedStyle(e).display !== 'none');
      if (items.length === 0) continue;
      const l = line2.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const tops = new Set(items.map((e) => Math.round(e.getBoundingClientRect().top)));
      if (tops.size > 1) wrapped += 1;
      const perTop = new Map<number, number>();
      for (const e of items) perTop.set(Math.round(e.getBoundingClientRect().top), (perTop.get(Math.round(e.getBoundingClientRect().top)) ?? 0) + 1);
      shared += [...perTop.values()].filter((n) => n > 1).length;
      const rtl = getComputedStyle(line2).direction === 'rtl';
      // Where each line of fields starts: its leftmost field's left edge, or in RTL its rightmost field's right edge.
      const starts0 = new Map<number, number>();
      for (const e of items) {
        const b = e.getBoundingClientRect();
        const top = Math.round(b.top);
        starts0.set(top, rtl ? Math.max(starts0.get(top) ?? -Infinity, b.right) : Math.min(starts0.get(top) ?? Infinity, b.left));
      }
      for (const e of items) {
        const b = e.getBoundingClientRect();
        const before = getComputedStyle(e, '::before');
        // The separator's whole run: its width and the space after it (a line with controls keeps a ring's reach there).
        const sep = (Number.parseFloat(before.width) || 0) + (Number.parseFloat(before.marginInlineEnd) || 0);
        const edge = starts0.get(Math.round(b.top)) ?? (rtl ? b.right : b.left);
        const starts = Math.abs((rtl ? b.right : b.left) - edge) < 0.5;
        const wordsFrom = rtl ? b.right - sep : b.left + sep;
        const midY = b.top + b.height / 2;
        // The words: past the separator (inline-start side), a few px in.
        const wordX = rtl ? wordsFrom - 3 : wordsFrom + 3;
        const dotX = rtl ? b.right - sep / 2 : b.left + sep / 2;
        const at = (x: number) => document.elementFromPoint(x, midY);
        const hitEl = at(wordX);
        const dotEl = at(dotX);
        list.push({
          text: (e.textContent ?? '').trim(),
          inside:
            b.top >= l.top - 0.5 &&
            b.bottom <= l.bottom + 0.5 &&
            b.top >= r.top - 0.5 &&
            b.bottom <= r.bottom + 0.5 &&
            (rtl ? wordsFrom <= l.right + 0.5 && b.left >= l.left - 0.5 : wordsFrom >= l.left - 0.5 && b.right <= l.right + 0.5),
          hit: hitEl !== null && e.contains(hitEl),
          starts,
          dotHidden: !starts || dotEl === null || !e.contains(dotEl),
        });
      }
    }
    return { rows: lines.length, wrapped, shared, list };
  }, scoped);
}

async function open(page: Page, path: string, width: number, dir: 'ltr' | 'rtl' = 'ltr'): Promise<void> {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, path);
  // RTL: the document's direction, which the list's :dir(rtl) rules (mirrored clip and run start) follow.
  if (dir === 'rtl') await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  // CSS: a list meta field has no role; the first match can be an empty (display: none) field or a hidden list's.
  await page.locator('[class*="listMeta"] [class*="listItem"]:visible').first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

function expectAllInSight(r: Awaited<ReturnType<typeof fields>>): void {
  expect(r.list.length, 'meta fields to check').toBeGreaterThan(0);
  expect(r.list.filter((f) => !f.inside).map((f) => f.text), 'fields outside their line 2 or row').toEqual([]);
  expect(r.list.filter((f) => !f.hit).map((f) => f.text), 'fields clipped or covered').toEqual([]);
  expect(r.list.filter((f) => !f.dotHidden).map((f) => f.text), 'lines that start with a separator').toEqual([]);
}

for (const [pointer, dir] of [['fine', 'ltr'], ['coarse', 'ltr'], ['fine', 'rtl'], ['coarse', 'rtl']] as const) {
  test.describe(`phone list at 390, ${pointer} pointer, ${dir}`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true, isMobile: true });

    test('gallery list with a long tip field: every meta field in sight, no line starts with a dot', async ({ page }) => {
      await open(page, '/_kit?tab=table&tipwrap=1', 390, dir);
      const r = await fields(page);
      // Not vacuous: the flag's field does not fit one line here, and lines hold fields side by side.
      expect(r.wrapped, 'rows whose line 2 wraps').toBeGreaterThan(0);
      expect(r.shared, 'lines with two or more fields').toBeGreaterThan(0);
      expectAllInSight(r);
    });

    test('Programs list and a Ports table with per-port actions at 320: every meta field in sight', async ({ page }) => {
      await open(page, '/programs', 320, dir);
      expectAllInSight(await fields(page));
      await open(page, '/programs?sel=prog%3A2', 320, dir);
      // The fixtures' range program "api" and its first port.
      const ports = page.getByRole('table', { name: programs['detail.portsOf'].replace('{{name}}', 'api'), exact: true });
      await ports.getByRole('button', { name: programs['action.restartPort'].replace('{{port}}', '8000').replace('{{name}}', 'api'), exact: true }).waitFor({ timeout: 30_000 });
      // The inspector covers the Programs list here: check the Ports table's own rows.
      await ports.evaluate((t) => t.setAttribute('data-lmw-scope', ''));
      expectAllInSight(await fields(page, true));
    });
  });
}

// An inline verb and the open chevron took 189 of a 258 px line, which left the fields a 61 px column,
// so a field wider than that was cut, and the row grew by a line per field. Now the actions drop under the fields.
test.describe('a row whose actions hold words, at 390 on a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the actions take their own line under the fields, the fields have the width and none is cut', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    const lines = page.locator('[data-gallery="pick-open"] [class*="listLine2"]:has(> [class*="rowActionsWrap"] > span[data-row-actions])');
    await expect.poll(() => lines.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    const rows = await lines.evaluateAll((els) =>
      els.map((line) => {
        const actions = line.querySelector(':scope > [class*="rowActionsWrap"]')!.getBoundingClientRect();
        const items = [...line.querySelectorAll<HTMLElement>('[class*="listItem"]')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
        return {
          items: items.length,
          under: items.every((e) => e.getBoundingClientRect().bottom <= actions.top + 0.5),
          cut: items.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
          lines: new Set(items.map((e) => Math.round(e.getBoundingClientRect().top))).size,
          endsAtLine: Math.abs(actions.right - line.getBoundingClientRect().right) < 1,
        };
      }),
    );
    for (const r of rows) {
      expect(r.items).toBeGreaterThan(0);
      expect(r).toMatchObject({ under: true, cut: [], endsAtLine: true });
    }
  });
});

test('a focused tip term in a wrapped field: nothing scrolls, the field stays where it is drawn', async ({ page }) => {
  await open(page, '/_kit?tab=table&tipwrap=1', 390);
  const terms = page.locator('[class*="listMeta"] [class*="listLabel"] > button');
  await terms.first().waitFor();
  const r = await page.evaluate(() => {
    const term = document.querySelector<HTMLElement>('[class*="listMeta"] [class*="listLabel"] > button');
    if (!term) return null;
    const meta = term.closest('[class*="listMeta"]') as HTMLElement;
    const line2 = term.closest('[class*="listLine2"]') as HTMLElement;
    // Where the term sits in its line 2: the page itself may scroll to the focused term, the line must not.
    const offset = () => term.getBoundingClientRect().top - line2.getBoundingClientRect().top;
    const before = offset();
    term.focus();
    const after = term.getBoundingClientRect();
    const l = line2.getBoundingClientRect();
    return { focused: document.activeElement === term, moved: Math.abs(offset() - before), scroll: [meta.scrollTop, meta.scrollLeft, line2.scrollTop], inside: after.top >= l.top - 0.5 && after.bottom <= l.bottom + 0.5 };
  });
  expect(r, 'a tip term on line 2').not.toBeNull();
  expect(r!.focused).toBe(true);
  expect(r!.moved).toBeLessThan(0.5);
  expect(r!.scroll).toEqual([0, 0, 0]);
  expect(r!.inside).toBe(true);
});

/** Marks the gallery's 240-row table `data-lmw-big` (the page has other tables; it has the most rows, aria-rowcount)
 * and its scroll box `data-lmw-scroller`: the table's parent, the DataTable's own scroller the virtualizer reads. */
async function markScroller(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tables = [...document.querySelectorAll<HTMLElement>('table[aria-rowcount]')];
    const big = tables.reduce<HTMLElement | null>((a, b) => (!a || Number(b.getAttribute('aria-rowcount')) > Number(a.getAttribute('aria-rowcount')) ? b : a), null);
    big?.setAttribute('data-lmw-big', '');
    big?.parentElement?.setAttribute('data-lmw-scroller', '');
  });
}

test('a virtual list (240 rows) with tall rows scrolls smoothly down and back up: each row moves by the scroll, never jumps, and holds still once scrolling stops', async ({ page }) => {
  // The gallery's Data tab: 240 rows, virtual, a list at 390. Rows whose index ends in 3 or 7 are made 37.5 px taller
  // (a stable per-row height, like a wrapped line 2, fractional on purpose), so tall rows pass above the viewport.
  await open(page, '/_kit?tab=data', 390);
  await markScroller(page);
  await page.addStyleTag({ content: '[data-lmw-big] tr[data-index$="3"] > td, [data-lmw-big] tr[data-index$="7"] > td { padding-bottom: 37.5px; }' });
  const r = await page.evaluate(async () => {
    const box = document.querySelector<HTMLElement>('[data-lmw-scroller]') as HTMLElement;
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const rows = () => [...document.querySelectorAll<HTMLElement>('[data-lmw-big] tr[data-row-id]')];
    const heights = new Set(rows().map((x) => Math.round(x.getBoundingClientRect().height)));
    const total = rows().length;
    let jumps = 0;
    let steps = 0;
    let upSteps = 0;
    let anchor: { id: string; top: number } | null = null;
    // 150 steps of 24 px down (about 60 rows pass, so tall rows leave the drawn window above and come back as spacer),
    // then 150 back up (the measured rows above come back into the window).
    for (let i = 0; i < 300; i++) {
      const dir = i < 150 ? 1 : -1;
      if (i === 150) anchor = null;
      const before = box.scrollTop;
      box.scrollTop = before + 24 * dir;
      await frame();
      const moved = box.scrollTop - before;
      if (moved === 0) continue;
      steps += 1;
      if (dir < 0) upSteps += 1;
      if (anchor) {
        const el = document.querySelector<HTMLElement>(`[data-lmw-big] tr[data-row-id="${CSS.escape(anchor.id)}"]`);
        if (el) {
          const top = el.getBoundingClientRect().top;
          if (Math.abs(anchor.top - moved - top) > 1) jumps += 1;
        }
      }
      // The next anchor: the row at the middle of the scroller.
      const b = box.getBoundingClientRect();
      const mid = (Math.max(b.top, 0) + Math.min(b.bottom, window.innerHeight)) / 2;
      const at = rows().find((x) => { const q = x.getBoundingClientRect(); return q.top <= mid && q.bottom >= mid; });
      anchor = at ? { id: at.dataset.rowId ?? '', top: at.getBoundingClientRect().top } : null;
    }
    // Once scrolling stops, nothing moves: no measure-and-shift loop (the virtualizer measures in its own observer).
    const still = { top: box.scrollTop, row: anchor ? document.querySelector<HTMLElement>(`[data-lmw-big] tr[data-row-id="${CSS.escape(anchor.id)}"]`)?.getBoundingClientRect().top : undefined };
    let drift = 0;
    for (let i = 0; i < 20; i++) {
      await frame();
      const now = anchor ? document.querySelector<HTMLElement>(`[data-lmw-big] tr[data-row-id="${CSS.escape(anchor.id)}"]`)?.getBoundingClientRect().top : undefined;
      if (box.scrollTop !== still.top || (still.row !== undefined && now !== undefined && Math.abs(now - still.row) > 0.5)) drift += 1;
    }
    return { heights: [...heights], total, steps, upSteps, jumps, drift };
  });
  // Not vacuous: the list is virtual (fewer rows drawn than 240), it scrolled, and its rows are not all the 56 px estimate.
  expect(r.total, 'rows drawn of 240').toBeLessThan(240);
  expect(r.steps, 'scroll steps taken').toBeGreaterThan(100);
  expect(r.upSteps, 'scroll steps taken back up').toBeGreaterThan(50);
  expect(r.heights.some((h) => h !== 56), `row heights ${r.heights.join(',')}`).toBe(true);
  expect(r.jumps, 'steps where the row under the middle moved by other than the scroll').toBe(0);
  expect(r.drift, 'frames that moved after scrolling stopped').toBe(0);
});

test('PageDown on a list of wrapped rows moves to a row that was in sight, never past it', async ({ page }) => {
  await open(page, '/_kit?tab=table&tipwrap=1', 390);
  await markScroller(page);
  const first = page.locator('[data-lmw-big] tr[data-row-id]').first(); // CSS: a list row is a table row; the first drawn one
  await first.focus();
  const r = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-lmw-scroller]') as HTMLElement;
    const b = box.getBoundingClientRect();
    const top = Math.max(b.top, 0);
    const bottom = Math.min(b.bottom, window.innerHeight);
    const inSight = [...document.querySelectorAll<HTMLElement>('[data-lmw-big] tr[data-row-id]')].filter((x) => { const q = x.getBoundingClientRect(); return q.height > 0 && q.top >= top - 0.5 && q.bottom <= bottom + 0.5; });
    return { from: Number((document.activeElement as HTMLElement | null)?.dataset.index), last: Math.max(...inSight.map((x) => Number(x.dataset.index))), shown: inSight.length };
  });
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => Number((document.activeElement as HTMLElement | null)?.dataset.index))).not.toBe(r.from);
  const to = await page.evaluate(() => Number((document.activeElement as HTMLElement | null)?.dataset.index));
  // Not vacuous: several rows were in sight. The step is the rows in sight less one, so it lands on one of them.
  expect(r.shown, 'rows in sight before').toBeGreaterThan(2);
  expect(to, `from ${r.from}, last in sight ${r.last}`).toBeGreaterThan(r.from);
  expect(to, `from ${r.from}, last in sight ${r.last}`).toBeLessThanOrEqual(r.last);
});

// Guard: measuring rows moves nothing where rows are their estimate. The gallery table at 1280 (240 rows,
// virtual, fixed 44 px rows; the Data tab): at the top, two middle positions and the end, every drawn row sits at its item index
// x 44 below the body's top, at DPR 1 and 2. fp-dpr<n>.json is the fingerprint the check compares with the run before the
// change (evidence: identical).
for (const dpr of [1, 2] as const) {
  test.describe(`fixed-height virtual table at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test(`rows sit at index x 44 at every scroll position, scrollHeight unchanged (DPR ${dpr})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await gotoHub(page, '/_kit?tab=data');
      await page.locator('tr[data-row-id]').first().waitFor({ timeout: 30_000 }); // CSS: a table row has no unique name
      await markScroller(page);
      const fp = await page.evaluate(async () => {
        const body = document.querySelector('[data-lmw-big] tbody') as HTMLElement;
        const box = document.querySelector<HTMLElement>('[data-lmw-scroller]') as HTMLElement;
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const out: { at: number; scrollHeight: number; rows: [string, number, number][] }[] = [];
        for (const f of [0, 0.33, 0.66, 1]) {
          box.scrollTop = (box.scrollHeight - box.clientHeight) * f;
          await frame();
          await frame();
          const top = body.getBoundingClientRect().top;
          const rows = [...body.querySelectorAll<HTMLElement>('tr[data-row-id]')].map((r) => [r.dataset.rowId ?? '', Number(r.dataset.index), Math.round((r.getBoundingClientRect().top - top) * 100) / 100] as [string, number, number]);
          out.push({ at: f, scrollHeight: box.scrollHeight, rows });
        }
        return out;
      });
      // The fingerprint the check diffs against the run before the change (the test's own output folder).
      writeFileSync(test.info().outputPath(`fp-dpr${dpr}.json`), JSON.stringify(fp));
      for (const pos of fp) {
        expect(pos.rows.length, `rows drawn at ${pos.at}`).toBeGreaterThan(0);
        expect(pos.rows.length, `rows drawn at ${pos.at}`).toBeLessThan(240);
        for (const [id, index, top] of pos.rows) expect(top, `row ${id} (index ${index}) at ${pos.at}`).toBe(index * 44);
      }
    });

    // Fractional heights do not drift: rows forced to 44.5 px, the list walked end to end so every row is measured,
    // then at each position every drawn row sits at index x its real height (a rounded measure puts row 200 100 px low).
    test(`rows of a fractional height sit at index x that height once measured (DPR ${dpr})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await gotoHub(page, '/_kit?tab=data');
      await page.locator('tr[data-row-id]').first().waitFor({ timeout: 30_000 }); // CSS: a table row has no unique name
      await markScroller(page);
      await page.addStyleTag({ content: '[data-lmw-big] tbody tr[data-row-id] > td { height: 44.5px; box-sizing: border-box; padding-block: 0; }' });
      const r = await page.evaluate(async () => {
        const body = document.querySelector('[data-lmw-big] tbody') as HTMLElement;
        const box = document.querySelector<HTMLElement>('[data-lmw-scroller]') as HTMLElement;
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        await frame();
        const h = (body.querySelector('tr[data-row-id]') as HTMLElement).getBoundingClientRect().height;
        let steps = 0;
        for (let y = 0; y < box.scrollHeight - box.clientHeight && steps < 200; y += box.clientHeight * 0.8, steps++) {
          box.scrollTop = y;
          await frame();
        }
        box.scrollTop = box.scrollHeight;
        await frame();
        const worst: { at: number; index: number; off: number; drawn: number }[] = [];
        for (const f of [0, 0.33, 0.66, 1]) {
          box.scrollTop = (box.scrollHeight - box.clientHeight) * f;
          await frame();
          await frame();
          const top = body.getBoundingClientRect().top;
          const drawn = body.querySelectorAll<HTMLElement>('tr[data-row-id]');
          let w = { at: f, index: -1, off: 0, drawn: drawn.length };
          for (const row of drawn) {
            const off = Math.abs(row.getBoundingClientRect().top - top - Number(row.dataset.index) * h);
            if (off > Math.abs(w.off)) w = { at: f, index: Number(row.dataset.index), off, drawn: drawn.length };
          }
          worst.push(w);
        }
        return { h, steps, worst };
      });
      expect(r.h % 1, `row height ${r.h} is fractional`).not.toBe(0);
      expect(r.steps, 'steps walked').toBeGreaterThan(5);
      for (const w of r.worst) {
        // Not vacuous: rows are drawn at every position, and fewer than all (virtual).
        expect(w.drawn, `rows drawn at ${w.at}`).toBeGreaterThan(0);
        expect(w.drawn, `rows drawn at ${w.at}`).toBeLessThan(240);
        expect(w.off, `worst row ${w.index} at ${w.at}: off by ${w.off} px`).toBeLessThan(0.05);
      }
    });
  });
}
