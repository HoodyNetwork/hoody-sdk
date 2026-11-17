// Playwright: an inline group header keeps its extra (chips,
// short actions) whole on the name's line at every header width; the label gives way first (an ellipsis, the count
// staying), and only the group's text wraps, on a line of its own under the name when the header is under 600px wide.
// Measured in a browser on real headers: the Notes page (text plus inline actions: harbor's "No notes yet." with Open
// Notes and New note) and the kit gallery (an extraEnd chip). The other presentations share the markup and the rules and
// are measured the same way: list rows (the gallery's groups at a phone width, with its
// end chip), a list rail beside a detail (the Bots page), sticky virtual nested rows (the gallery's nested groups, with a
// group's text), and cards (the Servers page's kinds, name and count only). Each case sets the header's own width (the header is its
// own container, so the rule follows it, not the window) and, for the long cases, a long label and text, all inside one
// evaluate, so nothing re-renders between the change and the reading.
import { type Locator, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';
import gallery from '../gallery/table.strings.en.json';
import notes from '../../pages/notes/strings.en.json';

type Box = { l: number; r: number; t: number; b: number };

interface Head {
  inner: Box;
  /** The header's own content reaches past its box (scrollWidth over clientWidth). */
  overflows: boolean;
  name: Box;
  count: Box;
  labelCut: boolean;
  /** The label's computed text-overflow: a cut label must end in an ellipsis, not be clipped. */
  labelOverflow: string;
  countCut: boolean;
  text: (Box & { overflows: boolean }) | null;
  /** Every element drawn inside the extra slot, and its interactive ones by name. */
  extra: Box[];
  controls: (Box & { name: string })[];
  /** Every text run drawn inside the extra slot: its line boxes (more than one = it wrapped) and whether an element
   *  between it and the slot clips it (its content wider than its box). */
  extraText: { lines: Box[]; cut: boolean }[];
  /** Every asked change found its text node. */
  applied: boolean;
}

const LONG_LABEL = 'a-computer-with-a-very-long-name-'.repeat(8);
const LONG_TEXT = 'This computer answered with a long sentence that has to wrap over several lines. '.repeat(3);

/** Sets the header to `width` px (and the label/text when given), reads it, then puts everything back. */
function head(groupBtn: Locator, width: number, label: string | null, text: string | null): Promise<Head> {
  return groupBtn.evaluate(
    (b, [w, lab, tx]) => {
      const inner = b.parentElement as HTMLElement;
      const labelEl = b.querySelector(':scope > span') as HTMLElement; // the label; the count is the second span
      const countEl = b.querySelector(':scope > span:last-of-type') as HTMLElement;
      const textEl = inner.querySelector<HTMLElement>(':scope > [data-group-text]');
      const extraEl = inner.querySelector<HTMLElement>(':scope > [data-group-extra-inline], :scope > [data-group-extra-end]');
      // Only the value of an existing text node changes (the first non-blank one), so React's nodes and the caller's
      // markup (Notes' note or Notice) stay as rendered, and each is put back after the reading.
      const firstText = (el: Element | null): Text | null => {
        if (!el) return null;
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => ((n.nodeValue ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
        return walk.nextNode() as Text | null;
      };
      const labelNode = firstText(labelEl);
      const textNode = firstText(textEl);
      const saved = { width: inner.style.width, label: labelNode?.nodeValue ?? null, text: textNode?.nodeValue ?? null };
      inner.style.width = `${w as number}px`;
      if (labelNode && lab !== null) labelNode.nodeValue = lab as string;
      if (textNode && tx !== null) textNode.nodeValue = tx as string;
      const box = (e: Element): Box => {
        const q = e.getBoundingClientRect();
        return { l: q.left, r: q.right, t: q.top, b: q.bottom };
      };
      const out = {
        applied: (lab === null || labelNode !== null) && (tx === null || textEl === null || textNode !== null),
        inner: box(inner),
        overflows: inner.scrollWidth > inner.clientWidth + 0.5,
        name: box(b),
        count: box(countEl),
        labelCut: labelEl.scrollWidth > labelEl.clientWidth + 0.5,
        labelOverflow: getComputedStyle(labelEl).textOverflow,
        countCut: countEl.scrollWidth > countEl.clientWidth + 0.5 || countEl.getBoundingClientRect().right > b.getBoundingClientRect().right + 0.5,
        text: textEl ? { ...box(textEl), overflows: textEl.scrollWidth > textEl.clientWidth + 0.5 } : null,
        extra: extraEl ? [...extraEl.querySelectorAll('*')].map(box).filter((x) => x.r > x.l) : [],
        controls: extraEl
          ? [...extraEl.querySelectorAll<HTMLElement>('a[href], button')].map((e) => ({ ...box(e), name: (e.textContent ?? '').trim() }))
          : [],
        extraText: extraEl
          ? (() => {
              const runs: { lines: Box[]; cut: boolean }[] = [];
              const walk = document.createTreeWalker(extraEl, NodeFilter.SHOW_TEXT, { acceptNode: (n) => ((n.nodeValue ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const r = document.createRange();
                r.selectNodeContents(n);
                const lines: Box[] = [];
                for (const q of r.getClientRects()) {
                  if (q.width > 0 && !lines.some((x) => Math.abs(x.t - q.top) < 1)) lines.push({ l: q.left, r: q.right, t: q.top, b: q.bottom });
                }
                let cut = false;
                for (let e = n.parentElement; e; e = e === extraEl ? null : e.parentElement) {
                  if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 0.5) cut = true;
                }
                runs.push({ lines, cut });
              }
              return runs;
            })()
          : [],
      };
      inner.style.width = saved.width;
      if (labelNode && saved.label !== null) labelNode.nodeValue = saved.label;
      if (textNode && saved.text !== null) textNode.nodeValue = saved.text;
      return out;
    },
    [width, label, text] as const,
  );
}

/** The long name is cut and ends in an ellipsis (a clipped name would be cut too). */
function expectNameEllipsis(h: Head) {
  expect(h.labelCut).toBe(true);
  expect(h.labelOverflow).toBe('ellipsis');
}

/** The extra is whole, inside the header, after the name and on its line; nothing in the header overflows. */
function expectExtraKeepsTheLine(h: Head) {
  expect(h.applied).toBe(true);
  expect(h.overflows).toBe(false);
  expect(h.extra.length).toBeGreaterThan(0);
  for (const e of h.extra) {
    expect(e.l).toBeGreaterThanOrEqual(h.name.r);
    expect(e.r).toBeLessThanOrEqual(h.inner.r + 0.5);
  }
  for (const c of h.controls) {
    const mid = (c.t + c.b) / 2;
    expect(mid).toBeGreaterThan(h.name.t);
    expect(mid).toBeLessThan(h.name.b);
  }
  // Its text (a chip's words, an action's name) stays whole: one line, on the name's line, not clipped.
  expect(h.extraText.length).toBeGreaterThan(0);
  for (const x of h.extraText) {
    expect(x.cut).toBe(false);
    expect(x.lines.length).toBe(1);
    const mid = (x.lines[0]!.t + x.lines[0]!.b) / 2;
    expect(mid).toBeGreaterThan(h.name.t);
    expect(mid).toBeLessThan(h.name.b);
    expect(x.lines[0]!.l).toBeGreaterThanOrEqual(h.name.r);
    expect(x.lines[0]!.r).toBeLessThanOrEqual(h.inner.r + 0.5);
  }
  // The count stays whole beside the label, before the extra.
  expect(h.count.r).toBeLessThanOrEqual(h.name.r + 0.5);
  expect(h.count.r - h.count.l).toBeGreaterThan(0);
  expect(h.countCut).toBe(false);
}

test('a long name and sentence: the actions stay whole on the name\'s line, the name ends in an ellipsis, the sentence wraps uncut (Notes header)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/notes');
  const btn = page.getByRole('table', { name: notes.table }).getByRole('button', { name: /^harbor \d/i });
  await btn.waitFor({ timeout: 30_000 });
  for (const width of [320, 420, 599, 600, 900]) {
    const h = await head(btn, width, LONG_LABEL, LONG_TEXT);
    expectExtraKeepsTheLine(h);
    expectNameEllipsis(h);
    expect(h.controls.map((c) => c.name)).toEqual([expect.stringMatching(new RegExp(`^${notes['action.openNotes']}`)), notes['action.newHere']]);
    // New note ends the header's line.
    expect(h.inner.r - h.controls[1]!.r).toBeLessThan(2);
    const t = h.text!;
    expect(t.overflows).toBe(false);
    expect(t.r).toBeLessThanOrEqual(h.inner.r + 0.5);
    if (width < 600) {
      expect(t.t).toBeGreaterThanOrEqual(h.name.b - 1); // its own line under the name
    } else {
      expect(t.t).toBeLessThan(h.name.b); // it starts on the name's line, between the name and the actions
      expect(t.l).toBeGreaterThanOrEqual(h.name.r);
      expect(t.r).toBeLessThanOrEqual(h.controls[0]!.l);
    }
  }
});

test('the sentence moves under the name exactly below a 600px header, whatever the window (Notes header)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/notes');
  const btn = page.getByRole('table', { name: notes.table }).getByRole('button', { name: /^harbor \d/i });
  await btn.waitFor({ timeout: 30_000 });
  const under = await head(btn, 599, null, null);
  const beside = await head(btn, 600, null, null);
  expect(under.labelCut).toBe(false);
  expect(beside.labelCut).toBe(false);
  expect(under.text!.t).toBeGreaterThanOrEqual(under.name.b - 1);
  expect((beside.text!.t + beside.text!.b) / 2).toBeGreaterThan(beside.name.t);
  expect((beside.text!.t + beside.text!.b) / 2).toBeLessThan(beside.name.b);
  for (const h of [under, beside]) expectExtraKeepsTheLine(h);
});

test('an end chip (extraEnd) stays whole at the header\'s end beside a long name, which ends in an ellipsis (kit gallery)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=table');
  const btn = page.getByRole('table', { name: gallery['sec.groups'] }).getByRole('button', { name: new RegExp(`^${gallery['group.system']}`) });
  await btn.waitFor({ timeout: 30_000 });
  for (const width of [240, 360, 600]) {
    const h = await head(btn, width, LONG_LABEL, null);
    expectExtraKeepsTheLine(h);
    expectNameEllipsis(h);
    expect(h.text).toBeNull();
    // The chip ends the line.
    expect(h.inner.r - Math.max(...h.extra.map((e) => e.r))).toBeLessThan(2);
  }
});

/** A header with only a name and a count: the name gives way (an ellipsis), the count stays whole, nothing overflows. */
function expectNameFits(h: Head) {
  expect(h.applied).toBe(true);
  expect(h.overflows).toBe(false);
  expectNameEllipsis(h);
  expect(h.countCut).toBe(false);
  expect(h.count.r - h.count.l).toBeGreaterThan(0);
  expect(h.name.r).toBeLessThanOrEqual(h.inner.r + 0.5);
}

/** The cell a header button sits in, as the browser draws it: sticky or not. */
const position = (btn: Locator) => btn.evaluate((b) => getComputedStyle(b.closest('td') as HTMLElement).position);

/** The header's table draws list rows: no column layout (a table presentation has its colgroup) and no cards. */
const listRows = (btn: Locator) =>
  btn.evaluate((b) => {
    const table = b.closest('table') as HTMLTableElement;
    return table.querySelector(':scope > colgroup') === null && table.querySelector('tr[data-card-cut]') === null;
  });

test('list rows (the groups table at a phone width): the end chip stays whole at the line\'s end beside a long name (kit gallery)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, '/_kit?tab=table');
  const btn = page.getByRole('table', { name: gallery['sec.groups'] }).getByRole('button', { name: new RegExp(`^${gallery['group.system']}`) });
  await btn.waitFor({ timeout: 30_000 });
  expect(await listRows(btn), 'the groups table is drawn as list rows').toBe(true);
  for (const width of [240, 320]) {
    const h = await head(btn, width, LONG_LABEL, null);
    expectExtraKeepsTheLine(h);
    expectNameEllipsis(h);
    expect(h.inner.r - Math.max(...h.extra.map((e) => e.r))).toBeLessThan(2);
  }
});

test('sticky virtual nested rows: a group\'s text moves under the name below a 600px header and never overflows (kit gallery)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=table');
  const table = page.getByRole('table', { name: gallery['sec.nested'] });
  const btn = table.getByRole('button', { name: new RegExp(`^${gallery['group.agent']}`) });
  await btn.waitFor({ timeout: 30_000 });
  expect(await position(btn), 'the header sticks').toBe('sticky');
  expect(await table.locator('tbody tr[data-vindex]').count(), 'the rows are virtual').toBeGreaterThan(0);
  for (const width of [320, 599, 600, 900]) {
    const h = await head(btn, width, LONG_LABEL, LONG_TEXT);
    expect(h.applied).toBe(true);
    expect(h.overflows).toBe(false);
    expectNameEllipsis(h);
    expect(h.countCut).toBe(false);
    const t = h.text!;
    expect(t.overflows).toBe(false);
    expect(t.r).toBeLessThanOrEqual(h.inner.r + 0.5);
    if (width < 600) {
      expect(t.t).toBeGreaterThanOrEqual(h.name.b - 1);
    } else {
      expect(t.t).toBeLessThan(h.name.b);
      expect(t.l).toBeGreaterThanOrEqual(h.name.r);
    }
  }
});

test('a list rail beside a detail: a long group name ends in an ellipsis, its count and any extra stay whole (Bots page)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hub.v3.pane.bots.list', '280');
    } catch {
      /* the default width then */
    }
  });
  await gotoHub(page, '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', { state: 'railLong' });
  const btn = page.locator('#hub-main [data-rail] tbody tr > td > span > button[aria-expanded]').first(); // reason: the rail's first group header
  await btn.waitFor({ timeout: 30_000 });
  for (const width of [200, 280]) {
    const h = await head(btn, width, LONG_LABEL, null);
    if (h.extra.length > 0) expectExtraKeepsTheLine(h);
    expectNameFits(h);
  }
});

test('cards: a long kind name ends in an ellipsis and its count stays whole (Servers page)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/computers/servers', { state: 'serversKinds' });
  await choosePresentation(page.locator('#hub-main'), 'cards');
  const btn = page.locator('#hub-main tbody tr > td > span > button[aria-expanded]').first(); // reason: the first kind's header
  await btn.waitFor({ timeout: 30_000 });
  expect(await page.locator('#hub-main tbody tr[data-card-cut]').count(), 'drawn as cards').toBeGreaterThan(0);
  for (const width of [200, 320, 600]) {
    const h = await head(btn, width, LONG_LABEL, null);
    expectNameFits(h);
    expect(h.text).toBeNull();
  }
});
