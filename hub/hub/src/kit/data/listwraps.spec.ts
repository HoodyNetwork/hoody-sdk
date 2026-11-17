// Playwright: a list row's line-2 field whose column sets meta listWraps wraps its content inside
// the field, never cut and never past it (DataTable.module.css .listItem[data-meta-wraps]). Page: the kit gallery's phone
// list with ?listwraps=1, whose Note field has a long listLabel and holds a Tag and a long nav Link on one row, a run with
// no break point on the next and a run of Tags on the third. On a fine and a coarse pointer, left to right and right to
// left: every field takes more than one line, nothing reaches past it, nothing is cut (label included), each Tag stays
// whole on one line, the link is hit at its middle and its keyboard focus ring is drawn clear of every clipping box.
// Its Kept field's label is an InfoTip term (meta tip, datatable-list-wraps-tip-label): the term button wraps within its
// half of the field instead of cutting at it, and its focus ring is drawn clear of every clipping box too.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

interface Wrapped {
  text: string;
  /** Lines the field takes (its height over one line of its text). */
  lines: number;
  /** Pixels any descendant reaches past the field's box, on any side. */
  spill: number;
  /** Pixels the field, its label, its label's InfoTip term or its value cuts of its own content (scroll size over client size). */
  cut: number;
  /** Pixels the field reaches past its line 2, from its words (past its separator) to its end and top to bottom. */
  out: number;
  /** A control in it is hit at its middle (not covered or clipped). */
  hit: boolean;
  /** Tags in it, and those not whole on one line (taller than one Tag, or cutting their words). */
  tags: number;
  brokenTags: number;
  /** Lines its label's InfoTip term takes (0: no term). */
  termLines: number;
  /** Every line of that term starts at the term's start edge (its words read like a label, not centred). */
  termStart: boolean;
}

async function wrapped(page: Page): Promise<Wrapped[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[class*="listMeta"] > [data-meta-wraps]'))
      .filter((f) => f.getClientRects().length > 0)
      .map((f) => {
        f.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = f.getBoundingClientRect();
        let spill = 0;
        for (const d of Array.from(f.querySelectorAll<HTMLElement>('*'))) {
          const b = d.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          spill = Math.max(spill, r.left - b.left, b.right - r.right, r.top - b.top, b.bottom - r.bottom);
        }
        const line = f.closest('[class*="listLine2"]')?.getBoundingClientRect();
        // The field's separator (::before) may hang before the line on its inline-start side: measure from its words.
        const before = getComputedStyle(f, '::before');
        const sep = (Number.parseFloat(before.width) || 0) + (Number.parseFloat(before.marginInlineEnd) || 0);
        const rtl = getComputedStyle(f).direction === 'rtl';
        const wordsFrom = rtl ? r.right - sep : r.left + sep;
        const out = line
          ? Math.max(0, rtl ? wordsFrom - line.right : line.left - wordsFrom, rtl ? line.left - r.left : r.right - line.right, line.top - r.top, r.bottom - line.bottom)
          : 99;
        const lh = Number.parseFloat(getComputedStyle(f).lineHeight) || 20;
        const ctl = f.querySelector<HTMLElement>('button, a[href], [role="button"]');
        let hit = true;
        if (ctl) {
          const c = ctl.getBoundingClientRect();
          const at = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
          hit = at !== null && ctl.contains(at);
        }
        const term = f.querySelector<HTMLElement>('[class*="listLabel"] > button');
        const termStartOf = (e: HTMLElement | null, rtlDir: boolean): boolean => {
          if (!e) return true;
          const b = e.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(e);
          return Array.from(range.getClientRects()).every((x) => Math.abs(rtlDir ? b.right - x.right : x.left - b.left) < 1);
        };
        const cutOf = (e: Element | null) => (e ? Math.max(0, e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight) : 0);
        const tags = Array.from(f.querySelectorAll<HTMLElement>('[class*="tag"]'));
        const tagH = Math.min(...tags.map((g) => g.getBoundingClientRect().height));
        return {
          text: (f.textContent ?? '').trim().slice(0, 120),
          lines: Math.round(r.height / lh),
          spill: Math.round(Math.max(0, spill)),
          cut: Math.max(cutOf(f), cutOf(f.querySelector('[class*="listLabel"]')), cutOf(term), cutOf(f.querySelector('[class*="listValue"]'))),
          out: Math.round(out),
          hit,
          tags: tags.length,
          brokenTags: tags.filter((g) => g.getBoundingClientRect().height > tagH + 0.5 || g.scrollWidth > g.clientWidth).length,
          termLines: term ? Math.round(term.getBoundingClientRect().height / (Number.parseFloat(getComputedStyle(term).lineHeight) || lh)) : 0,
          termStart: termStartOf(term, rtl),
        };
      }),
  );
}

/** The focused control's focus ring (its box-shadow spread) against every clipping box up the tree, to its row. */
async function ringClear(page: Page): Promise<{ ring: string; clipped: string[] }> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const cs = getComputedStyle(a);
    const spread = Math.max(0, ...Array.from(cs.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g), (m) => Number(m[4])));
    const r = a.getBoundingClientRect();
    const ring = { l: r.left - spread, r: r.right + spread, t: r.top - spread, b: r.bottom + spread };
    const clipped: string[] = [];
    for (let e = a.parentElement; e && e.tagName !== 'TR'; e = e.parentElement) {
      const s = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      const boxes: { l: number; r: number; t: number; b: number }[] = [];
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') boxes.push({ l: b.left, r: b.right, t: b.top, b: b.bottom });
      const m = /^inset\(([^)]*)\)$/.exec(s.clipPath);
      if (m) {
        const v = m[1]!.trim().split(/\s+/).map((x) => Number.parseFloat(x));
        const [t, rt, bt, l] = [v[0]!, v[1] ?? v[0]!, v[2] ?? v[0]!, v[3] ?? v[1] ?? v[0]!];
        boxes.push({ l: b.left + l, r: b.right - rt, t: b.top + t, b: b.bottom - bt });
      }
      for (const x of boxes)
        if (ring.l < x.l - 0.5 || ring.r > x.r + 0.5 || ring.t < x.t - 0.5 || ring.b > x.b + 0.5) clipped.push(`${e.className.slice(0, 40)}`);
    }
    return { ring: `${a.matches(':focus-visible')}|${spread}|${(a.textContent ?? '').slice(0, 20)}`, clipped };
  });
}

for (const [pointer, dir] of [['fine', 'ltr'], ['coarse', 'ltr'], ['fine', 'rtl'], ['coarse', 'rtl']] as const) {
  test.describe(`listWraps on the phone list at 390, ${pointer} pointer, ${dir}`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true, isMobile: true });

    test(`@listwraps a link, an unbroken run, a run of Tags and an InfoTip label wrap inside their field, whole and in sight (${pointer}, ${dir})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height: 900 });
      await gotoHub(page, '/_kit?tab=table&listwraps=1');
      if (dir === 'rtl') await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
      // CSS: a list meta field has no role; wait for a shown marked field (hidden lists hold some too).
      await page.locator('[class*="listMeta"] > [data-meta-wraps]:visible').first().waitFor({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(async () => {
        const list = await wrapped(page);
        // Not vacuous: all three kinds are present and each takes more than one line here.
        const link = list.filter((f) => f.text.includes('Open the long note'));
        const token = list.filter((f) => f.text.includes('Averylongunbroken'));
        const tags = list.filter((f) => f.tags >= 6);
        const terms = list.filter((f) => f.termLines > 0);
        expect(terms.length, 'fields whose label is an InfoTip term').toBeGreaterThan(0);
        // Not vacuous: the long term is wider than half its field here, so it takes more than one line.
        expect(terms.every((f) => f.termLines > 1), JSON.stringify(terms)).toBe(true);
        expect(terms.filter((f) => !f.termStart), 'InfoTip terms whose lines do not start at its start').toEqual([]);
        expect(link.length, 'fields with the long Link').toBeGreaterThan(0);
        expect(token.length, 'fields with the unbroken run').toBeGreaterThan(0);
        expect(tags.length, 'fields with the run of Tags').toBeGreaterThan(0);
        expect([...link, ...token, ...tags].every((f) => f.lines > 1), JSON.stringify(list)).toBe(true);
        expect(list.filter((f) => f.spill > 0), 'content past its field').toEqual([]);
        expect(list.filter((f) => f.cut > 0), 'fields, labels or values cutting their content').toEqual([]);
        expect(list.filter((f) => f.out > 0), 'fields past their line 2').toEqual([]);
        expect(list.filter((f) => !f.hit), 'controls covered or clipped').toEqual([]);
        expect(list.filter((f) => f.brokenTags > 0), 'Tags broken across lines or cut').toEqual([]);
      }).toPass({ timeout: 20_000 });
      // The wrapping link's keyboard focus ring: drawn, and clear of every clip up to its row.
      const link = page.locator('[class*="listMeta"] > [data-meta-wraps] a[href]:visible').first();
      await expect(async () => {
        await page.keyboard.press('Shift');
        await link.focus();
        const r = await ringClear(page);
        expect(r.ring.startsWith('true|'), r.ring).toBe(true);
        expect(r.ring.split('|')[1], r.ring).not.toBe('0');
        expect(r.clipped, r.ring).toEqual([]);
      }).toPass({ timeout: 20_000 });
      // The wrapping InfoTip term's keyboard focus ring: drawn, and clear of every clip up to its row.
      const term = page.locator('[class*="listMeta"] > [data-meta-wraps] [class*="listLabel"] > button:visible').first();
      await expect(async () => {
        await page.keyboard.press('Shift');
        await term.focus();
        const r = await ringClear(page);
        expect(r.ring.startsWith('true|'), r.ring).toBe(true);
        expect(r.ring.split('|')[1], r.ring).not.toBe('0');
        expect(r.clipped, r.ring).toEqual([]);
      }).toPass({ timeout: 20_000 });
    });
  });
}

// With listWraps on the list primary, an item name with no break point wraps whole onto more lines
// in its line 1, never cut with an ellipsis and never past the row, on a fine and a coarse pointer, both directions.
for (const [pointer, dir] of [['fine', 'ltr'], ['coarse', 'rtl']] as const) {
  test.describe(`listWraps on the list primary at 390, ${pointer} pointer, ${dir}`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true, isMobile: true });
    test(`@listwraps a long item name wraps whole inside its row (${pointer}, ${dir})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await gotoHub(page, '/_kit?tab=table&listwraps=1');
      if (dir === 'rtl') await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
      const name = page.locator('[class*="listPrimary"][data-meta-wraps]:visible').first();
      await name.waitFor({ timeout: 30_000 });
      const m = await name.evaluate((el) => {
        el.textContent = 'https://a-very-long-address-with-no-break-point-at-all.example.computer/and/a/long/path';
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const row = el.closest('td')!.getBoundingClientRect();
        const lh = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
        return { lines: Math.round(r.height / lh), cut: el.scrollWidth - el.clientWidth, past: Math.max(row.left - r.left, r.right - row.right), ellipsis: getComputedStyle(el).textOverflow };
      });
      expect(m.lines, 'the name takes more than one line').toBeGreaterThan(1);
      expect(m.cut, 'nothing of it is cut').toBeLessThanOrEqual(0);
      expect(m.past, 'it stays inside its row').toBeLessThanOrEqual(0.5);
      expect(m.ellipsis).not.toBe('ellipsis');
    });
  });
}
