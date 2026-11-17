// Playwright: a grouped table reads as a hierarchy. Its group header is a heading on its
// own band (the text font at 600 14/20, normal case, its count quieter in the small text font, never mono), the rows
// under it are its children (their first content starts at the header's label, 24 px in from its chevron), and the
// group's note is an inset callout (a framed box, its action inside it) whose edge is its own: never the
// heading's, never the rows'. Read on the Bots list grouped by computer (the shot: paused computers with
// notes), the kit gallery's grouped tables and the AI chat rail's time groups; both themes, fine and coarse pointer.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, type GotoOptions } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';

interface Font {
  family: string;
  weight: string;
  size: string;
  transform: string;
  spacing: string;
}

interface Child {
  /** The row's first content start (its first cell past any checkbox, inside its padding). */
  edge: number;
  checkbox: boolean;
  indented: boolean;
}

interface Note {
  left: number;
  right: number;
  /** The note row's cell, inside its end padding: a box that reaches it is drawn across the row. */
  cellLeft: number;
  cellRight: number;
  framed: boolean;
  /** Every button of the note lies inside its box. */
  actionsInside: boolean;
  text: number;
}

interface Group {
  where: string;
  label: string;
  chevron: number;
  labelX: number;
  font: Font;
  count: Font | null;
  headBg: string;
  rowBg: string | null;
  children: Child[];
  notes: Note[];
}

async function groups(page: Page, path: string, opts: GotoOptions): Promise<Group[]> {
  await page.goto('about:blank'); // gotoHub is same-document between Hub pages: start each read from a fresh load
  await gotoHub(page, path, opts);
  // Bots opens on Cards (its paused notes are banners there); the grouped list is the List.
  if (path === '/bots') await choosePresentation(page.locator('#hub-main'), 'list');
  const header = page.locator('#hub-main tbody > tr:not([data-row-id]) > td > span > button[aria-expanded]');
  await header.first().waitFor({ timeout: 20_000 }); // reason: any group header proves the table drew; all are read below
  return page.locator('#hub-main table').evaluateAll((tables, where) => {
    const font = (e: Element): Font => {
      const cs = getComputedStyle(e);
      return { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, transform: cs.textTransform, spacing: cs.letterSpacing };
    };
    const bgOf = (e: Element | null): string | null => {
      for (let n = e; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
      }
      return null;
    };
    const textLeft = (e: Element): number => {
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (b.width > 0) return b.left;
      }
      return NaN;
    };
    const out: Group[] = [];
    for (const t of tables) {
      if (t.getBoundingClientRect().width === 0) continue;
      const rows = [...t.querySelectorAll(':scope > tbody > tr')];
      let g: Group | null = null;
      for (const tr of rows) {
        const btn = tr.querySelector(':scope > td > span > button[aria-expanded]');
        if (btn && !tr.hasAttribute('data-row-id')) {
          const svg = btn.querySelector('svg');
          const [, label, count] = [...btn.children];
          if (!svg || !label) continue;
          g = {
            where,
            label: (label.textContent ?? '').trim(),
            chevron: svg.getBoundingClientRect().left,
            labelX: label.getBoundingClientRect().left,
            font: font(label),
            count: count && count.textContent?.trim() ? font(count) : null,
            headBg: getComputedStyle(tr.querySelector(':scope > td')!).backgroundColor,
            rowBg: null,
            children: [],
            notes: [],
          };
          out.push(g);
          continue;
        }
        if (!g) continue;
        const note = tr.querySelector('[data-group-note]');
        if (note) {
          const td = tr.querySelector(':scope > td')!;
          const tdr = td.getBoundingClientRect();
          const tcs = getComputedStyle(td);
          for (const box of [...note.children]) {
            const b = box.getBoundingClientRect();
            if (b.width === 0) continue;
            const cs = getComputedStyle(box);
            g.notes.push({
              left: b.left,
              right: b.right,
              cellLeft: tdr.left + parseFloat(tcs.paddingLeft),
              cellRight: tdr.right - parseFloat(tcs.paddingRight),
              framed: parseFloat(cs.borderTopWidth) >= 1 && parseFloat(cs.borderBottomWidth) >= 1 && parseFloat(cs.borderRightWidth) >= 1,
              actionsInside: [...box.querySelectorAll('button')].every((x) => {
                const r = x.getBoundingClientRect();
                return r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
              }),
              text: textLeft(box),
            });
          }
          continue;
        }
        if (!tr.hasAttribute('data-row-id')) continue;
        const cells = [...tr.querySelectorAll(':scope > td')];
        const checkbox = !!cells[0]?.querySelector('input[type="checkbox"], [role="checkbox"]');
        const first = checkbox ? cells[1] : cells[0];
        if (!first) continue;
        const r = first.getBoundingClientRect();
        g.children.push({ edge: r.left + parseFloat(getComputedStyle(first).paddingLeft), checkbox, indented: first.hasAttribute('data-group-indent') });
        g.rowBg ??= bgOf(first);
      }
    }
    return out;
  }, `${path} ${opts.theme ?? 'light'}`);
}

/** The heading, its children and its note, by rule; each failure names its table, group and numbers (soft: one run
 *  reports every rule a table breaks). */
function expectHierarchy(all: Group[]) {
  const name = (g: Group) => `${g.where} "${g.label}"`;
  expect(all.length, 'group headers read').toBeGreaterThan(1);
  // 1. A heading: the text font at 600 14 px, normal case and spacing.
  expect.soft(
    all.filter((g) => /mono/i.test(g.font.family) || g.font.weight !== '600' || g.font.size !== '14px' || g.font.transform !== 'none' || !/^(normal|0px)$/.test(g.font.spacing)).map((g) => `${name(g)}: ${g.font.family.slice(0, 18)} ${g.font.weight} ${g.font.size} ${g.font.transform} ${g.font.spacing}`),
    'a group heading not in the text font at 600 14 px, normal case',
  ).toEqual([]);
  // Its count is quieter: the small text font, never mono, never caps.
  expect.soft(
    all.filter((g) => g.count && (/mono/i.test(g.count.family) || g.count.size !== '12px' || g.count.transform !== 'none')).map((g) => `${name(g)}: ${g.count!.family.slice(0, 18)} ${g.count!.size} ${g.count!.transform}`),
    'a group count not in the small text font',
  ).toEqual([]);
  // On its own band: an opaque fill that is not the rows' own.
  expect.soft(
    all.filter((g) => g.rowBg !== null && (g.headBg === g.rowBg || /rgba\(.*,\s*0(\.\d+)?\)$/.test(g.headBg))).map((g) => `${name(g)}: head ${g.headBg} rows ${g.rowBg}`),
    'a group heading not on a band of its own',
  ).toEqual([]);
  // 2. Its rows are its children: their first content starts at the heading's label, 24 px in from its chevron (a
  // checkbox column stays at the edge, the content cell after it carries the indent).
  const children = all.flatMap((g) => g.children.map((c) => ({ g, c })));
  expect(children.length, 'rows under a group read').toBeGreaterThan(1);
  expect.soft(children.filter(({ c }) => !c.indented).map(({ g }) => name(g)), 'a row under a group with no indent').toEqual([]);
  expect.soft(
    children.filter(({ g, c }) => !c.checkbox && (Math.abs(c.edge - g.labelX) > 1 || c.edge - g.chevron < 20)).map(({ g, c }) => `${name(g)}: row ${Math.round(c.edge)} label ${Math.round(g.labelX)} chevron ${Math.round(g.chevron)}`),
    "a row under a group not starting at its heading's label",
  ).toEqual([]);
}

/** 3. A group's note: an inset callout with an edge of its own, between the heading's and the rows'. */
function expectCallouts(all: Group[]) {
  const name = (g: Group) => `${g.where} "${g.label}"`;
  const notes = all.flatMap((g) => g.notes.map((n) => ({ g, n })));
  expect(notes.length, 'group notes read').toBeGreaterThan(0);
  expect.soft(notes.filter(({ n }) => !n.framed).map(({ g }) => name(g)), 'a group note not drawn as a framed box').toEqual([]);
  expect.soft(notes.filter(({ n }) => n.right > n.cellRight + 0.5 || n.left < n.cellLeft - 0.5).map(({ g, n }) => `${name(g)}: box ${Math.round(n.left)}-${Math.round(n.right)} cell ${Math.round(n.cellLeft)}-${Math.round(n.cellRight)}`), "a group note drawn past its row's padding").toEqual([]);
  expect.soft(notes.filter(({ n }) => !n.actionsInside).map(({ g }) => name(g)), "a group note's action outside its box").toEqual([]);
  for (const { g, n } of notes) {
    const rows = g.children.filter((c) => !c.checkbox).map((c) => c.edge);
    const edges = [`heading ${Math.round(g.chevron)}`, ...rows.map((r) => `rows ${Math.round(r)}`)];
    expect.soft(n.left - g.chevron, `${name(g)}: the note's box (${Math.round(n.left)}) on or before the heading's edge (${edges[0]})`).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect.soft(r - n.left, `${name(g)}: the note's box (${Math.round(n.left)}) on or past the rows' edge (${Math.round(r)})`).toBeGreaterThanOrEqual(8);
  }
}

const BOTS = { path: '/bots', state: 'railPaused' }; // the shot: two paused computers with notes
const BOTS_MORE = { path: '/bots', state: 'railLong' }; // a failed read (warn, Try again), paused and more-than-listed notes

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a fine pointer at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test(`grouped tables read as heading, children and callout (${theme})`, async ({ page }) => {
      const bots = [...(await groups(page, BOTS.path, { theme, state: BOTS.state })), ...(await groups(page, BOTS_MORE.path, { theme, state: BOTS_MORE.state }))];
      const all = [...bots, ...(await groups(page, '/_kit?tab=table', { theme })), ...(await groups(page, '/ai', { theme }))];
      expectHierarchy(all);
      expectCallouts(bots);
    });
  });

  test.describe(`a touch phone at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test(`grouped lists read as heading, children and callout (${theme})`, async ({ page }) => {
      const bots = [...(await groups(page, BOTS.path, { theme, state: BOTS.state })), ...(await groups(page, BOTS_MORE.path, { theme, state: BOTS_MORE.state }))];
      const all = [...bots, ...(await groups(page, '/_kit?tab=table', { theme }))];
      expectHierarchy(all);
      expectCallouts(bots);
    });
  });
}
