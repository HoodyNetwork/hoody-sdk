// Playwright: a log row's detail body starts where its title starts, at phone and wide widths
// (the kit DetailBody's inset, never the page's own). The bar of controls never overflows, and on a wide
// screen it never gives the search a line of its own; the sources are segments while they fit and one picker on a phone.
import { type Page, expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

// The title's left edge vs the body's first block, in the detail pane. A kit plate (a Verdict, role group) is the
// block itself: its frame starts on the title's edge and its own text is inset inside it.
async function insetGap(page: Page): Promise<{ title: number; body: number }> {
  const head = page.locator('#hub-main header[class*="detailHeader"]');
  await expect(head.locator('[data-hub-title]')).toBeVisible();
  return head.evaluate((h) => {
    const title = h.querySelector('[data-hub-title]')!.getBoundingClientRect().left;
    const body = h.nextElementSibling as HTMLElement;
    const first = [...body.querySelectorAll('[role="group"], p, dl, h3, section, [role="radiogroup"], [role="status"]')].find((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().width > 0);
    return { title, body: first ? first.getBoundingClientRect().left : -1 };
  });
}

for (const width of [360, 390, 1100]) {
  test.describe(`at ${width}px`, () => {
    test('the bar: nothing overflows, the sources fit the room, and on a wide screen the search shares its line', async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/logs?src=everything');
      // The bar is named Logs (a group; the list region shares the name, so the role is part of the match).
      const bar = page.locator(`#hub-main [role="group"][aria-label="${strings.title}"], #hub-main [role="toolbar"][aria-label="${strings.title}"]`);
      await expect(bar.getByRole('searchbox')).toBeVisible();
      const m = await bar.evaluate((el) => {
        // The bar's own controls (not the segments inside the source group, not a hidden native select).
        const ctl = [...el.querySelectorAll('button, input[type="search"], [role="radiogroup"], [role="switch"]')].filter((e) => (e as HTMLElement).offsetParent !== null && !e.parentElement?.closest('[role="radiogroup"]'));
        // What the eye sees: a switch's input is visually hidden, so it is measured by its visible label.
        const box = (e: Element) => (e.getAttribute('role') === 'switch' ? e.closest('label') ?? e : e).getBoundingClientRect();
        // Lines by vertical overlap: a control whose middle falls inside a line's span is on that
        // line. Fixed 16px buckets counted one row as two whenever a row's middles straddled a bucket edge.
        const rows: { top: number; bottom: number; members: Element[] }[] = [];
        for (const e of [...ctl].sort((a, b) => box(a).top - box(b).top)) {
          const r = box(e);
          const mid = r.top + r.height / 2;
          const row = rows.find((l) => mid >= l.top && mid <= l.bottom);
          if (row) {
            row.members.push(e);
            row.top = Math.min(row.top, r.top);
            row.bottom = Math.max(row.bottom, r.bottom);
          } else rows.push({ top: r.top, bottom: r.bottom, members: [e] });
        }
        const search = el.querySelector('input[type="search"]')!;
        const searchRow = rows.find((l) => l.members.includes(search));
        const mates = (searchRow?.members ?? []).filter((e) => e !== search && !search.contains(e) && !e.contains(search)).length;
        return { lines: rows.length, mates, over: el.scrollWidth - el.clientWidth, seg: el.querySelector(`[role="radiogroup"]`) !== null };
      });
      expect(m.over, 'the bar never overflows').toBeLessThanOrEqual(0);
      if (width >= 1100) {
        expect(m.mates, 'the search shares its line with other controls').toBeGreaterThan(0);
        expect(m.seg, 'the sources show as segments when they fit').toBe(true);
        expect(m.lines, 'the controls take two lines at most').toBeLessThanOrEqual(2);
      } else {
        expect(m.seg, 'on a phone the sources are one picker').toBe(false);
      }
    });

    test('the detail body starts where the detail title starts', async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/logs?src=everything&sel=k300');
      const g = await insetGap(page);
      expect(g.body, 'a body block is drawn').toBeGreaterThan(0);
      expect(Math.abs(g.body - g.title), `title ${g.title} vs body ${g.body}`).toBeLessThanOrEqual(1);
    });
  });
}

// On a coarse pointer the problem strip's chips hold the kit's 44 px More actions icon.
// Each chip grows to hold it (never a fixed 32 px line), so wrapped chip rows never overlap and keep the touch gap.
for (const width of [360, 390]) {
  test.describe(`coarse pointer at ${width}px`, () => {
    test('the problem chips hold their More actions button and wrapped rows never overlap', async ({ hubPageCoarse: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/logs?src=everything');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      // On a phone the strip starts collapsed (its chips would push the list below the fold); open it from its toggle.
      await page.locator('#hub-main').getByRole('button', { expanded: false, name: /kinds? of problem\. ▸$/ }).click();
      // The strip: the heading line's parent (the question sits on its own line, the chips in a group under it).
      const strip = page.getByRole('button', { name: new RegExp(`^${strings['g.title']}`) }).locator('xpath=../..');
      const more = strip.getByRole('button', { name: strings['act.more'] });
      await expect(more.first()).toBeVisible();
      const m = await strip.evaluate((el) => {
        // The chips: the spans in the strip's chip group (its last child) that hold a More actions button.
        const chips = [...(el.lastElementChild?.children ?? [])].filter((c) => c.querySelector('button[aria-haspopup], button[aria-label]') && c.tagName === 'SPAN');
        const r = (e: Element) => e.getBoundingClientRect();
        const outside = chips.filter((c) => [...c.querySelectorAll('button')].some((b) => r(b).top < r(c).top - 1 || r(b).bottom > r(c).bottom + 1)).length;
        let overlap = 0;
        let gap = Infinity;
        for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) {
          const a = r(chips[i]!), b = r(chips[j]!);
          const sameRow = Math.abs(a.top - b.top) < 4;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlap += 1;
          if (!sameRow) gap = Math.min(gap, b.top >= a.bottom ? b.top - a.bottom : a.top >= b.bottom ? a.top - b.bottom : -1);
        }
        const rows = new Set(chips.map((c) => Math.round(r(c).top / 4))).size;
        return { chips: chips.length, rows, outside, overlap, gap: gap === Infinity ? null : Math.round(gap) };
      });
      expect(m.chips, JSON.stringify(m)).toBeGreaterThan(1);
      expect(m.rows, 'the chips wrap onto more than one row at this width').toBeGreaterThan(1);
      expect(m.outside, 'every chip holds its buttons inside its own box').toBe(0);
      expect(m.overlap, 'no two chips overlap').toBe(0);
      expect(m.gap ?? 0, 'wrapped chip rows keep the touch gap (8 px)').toBeGreaterThanOrEqual(8);
    });
  });
}

// The list sheds columns by the list's own width, not the window's. At 880 px and below the
// Visitor and Took columns go; at 640 px and below the From column goes too. The window is narrowed in 20 px steps and
// the header cells are measured against the width of the list's container at each step, so a moved threshold lands
// between two steps; the three bands (wide, middle, narrow) must each be reached.
test('the list sheds Visitor and Took at 880 px and From at 640 px of its own width', async ({ hubPage: page }) => {
  // 58 window widths, one layout read each: at the edge of the 30 s budget.
  test.slow();
  await page.setViewportSize({ width: 1500, height: 900 });
  await gotoHub(page, '/logs?src=everything');
  const list = page.getByRole('region', { name: strings.list });
  await expect(list.locator('button[data-key]').first()).toBeVisible();
  const names = { visitor: strings['col.visitor'], from: strings['col.source'], took: strings['col.duration'] };
  const bands = new Set<string>();
  for (let width = 1500; width >= 360; width -= 20) {
    await page.setViewportSize({ width, height: 900 });
    const m = await list.evaluate(
      (el, n) =>
        new Promise<{ room: number; visitor: boolean; from: boolean; took: boolean }>((done) =>
          requestAnimationFrame(() => {
            const head = el.querySelector('[aria-hidden="true"]') as HTMLElement;
            let box: HTMLElement | null = head;
            while (box && getComputedStyle(box).containerType !== 'inline-size') box = box.parentElement;
            const cs = box ? getComputedStyle(box) : null;
            const room = box && cs ? box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : -1;
            const shown = (name: string) => {
              const cell = [...head.children].find((c) => c.textContent === name) as HTMLElement | undefined;
              return !!cell && getComputedStyle(cell).display !== 'none';
            };
            done({ room, visitor: shown(n.visitor), from: shown(n.from), took: shown(n.took) });
          }),
        ),
      names,
    );
    expect(m.room, `the list has a container at ${width}px`).toBeGreaterThan(0);
    const note = `${width}px window, ${m.room}px list: ${JSON.stringify(m)}`;
    expect(m.visitor, note).toBe(m.room > 880);
    expect(m.took, note).toBe(m.room > 880);
    expect(m.from, note).toBe(m.room > 640);
    bands.add(m.room > 880 ? 'wide' : m.room > 640 ? 'middle' : 'narrow');
  }
  expect([...bands].sort(), 'the window steps reach all three bands').toEqual(['middle', 'narrow', 'wide']);
});

// The Visitor cell shows each address whole beside its flag and country code, and every address in the column
// starts at one place whether or not its country is known (the flag slot is always there, so a row never moves when its
// country arrives). The fixture platform knows a country for most addresses and none for about one in seven.
test('the Visitor cell shows each address whole, a flag and code for a known country, and addresses start at one place', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await gotoHub(page, '/logs?src=everything');
  const list = page.getByRole('region', { name: strings.list });
  await expect(list.locator('button[data-key]').first()).toBeVisible();
  await expect(list.locator('[role="img"][aria-label^="From "]').first()).toBeVisible();
  const m = await list.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button[data-key]')]
      .map((row) => row.children[4] as HTMLElement | undefined)
      .filter((cell): cell is HTMLElement => !!cell && !!cell.querySelector('[class*="ipText"]'))
      .map((cell) => {
        const text = cell.querySelector<HTMLElement>('[class*="ipText"]')!;
        const box = cell.getBoundingClientRect();
        return {
          clipped: text.scrollWidth > text.clientWidth + 1 || cell.scrollWidth > cell.clientWidth + 1,
          offset: Math.round(text.getBoundingClientRect().left - box.left),
          flag: !!cell.querySelector('[role="img"]'),
          code: cell.querySelector('[class*="ipCode"]')?.textContent ?? '',
        };
      }),
  );
  expect(m.length, 'the list shows several rows with an address').toBeGreaterThan(5);
  expect(m.filter((c) => c.clipped), 'no address is cut short').toEqual([]);
  expect(new Set(m.map((c) => c.offset)).size, 'every address starts at the same place in its cell').toBe(1);
  expect(m.some((c) => c.flag), 'a known country shows its flag').toBe(true);
  expect(m.some((c) => !c.flag), 'an address without a country stands bare').toBe(true);
  for (const c of m.filter((x) => x.flag)) expect(c.code, 'the code follows the flag').toMatch(/^[A-Z]{2}$/);
});
