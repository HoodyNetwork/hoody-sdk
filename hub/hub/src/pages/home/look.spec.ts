// The Home look. The Ask button is 160 px or wider and 40 px high (the box beside it
// is the kit text field's height). The ideas under the box are chat bubbles that wrap onto more rows instead of scrolling sideways, and
// they stay buttons in a list (keyboard and role unchanged). The Shortcuts card has its own spec (columns.spec.ts).
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};

async function open(page: Page, width: number, theme: 'light' | 'dark' = 'light') {
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, '/home', { theme });
}

const form = (page: Page) => page.locator('form').filter({ has: page.getByRole('list', { name: strings['ask.chips'] }) });

for (const width of [2400, 1350, 390]) {
  test(`at ${width} px the Ask button is at least 160 px wide and 40 px high`, async ({ hubPage: page }) => {
    await open(page, width);
    const ask = form(page).getByRole('button', { name: strings['ask.submit'], exact: true });
    const b = await box(ask);
    expect(b.width).toBeGreaterThanOrEqual(160);
    expect(b.height).toBe(40);
    // Its label is centred: the text sits in the middle of its label cell (the whole button when it has no arrow chip).
    const label = await ask.evaluate((el) => {
      const cell = el.querySelector('[data-chip-label]') ?? el;
      const words = [...cell.querySelectorAll('*'), cell].find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim()));
      const r = document.createRange();
      r.selectNodeContents(words!);
      const t = r.getBoundingClientRect();
      const o = cell.getBoundingClientRect();
      return Math.abs(t.left - o.left - (o.right - t.right));
    });
    expect(label).toBeLessThanOrEqual(1);
  });

  test(`at ${width} px the Ask ideas wrap onto more rows and never scroll sideways`, async ({ hubPage: page }) => {
    await open(page, width);
    const list = page.getByRole('list', { name: strings['ask.chips'] });
    await expect(list).toBeVisible();
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await list.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('wrap');
    // Every idea is drawn whole inside the card: none reaches past the list's end edge.
    const l = await box(list);
    for (const chip of await list.getByRole('button').all()) {
      const c = await box(chip);
      expect(c.x + c.width).toBeLessThanOrEqual(l.x + l.width + 0.5);
    }
  });
}

test('the Ask ideas stay buttons in a list: Tab walks them from the Ask button and Enter fills the box', async ({ hubPage: page }) => {
  await open(page, 1350);
  const list = page.getByRole('list', { name: strings['ask.chips'] });
  const chips = list.getByRole('button');
  const first = chips.first(); // reason: Tab from the Ask button lands on the first idea
  await expect(first).toBeVisible();
  expect(await chips.count()).toBeGreaterThan(1);
  await form(page).getByRole('button', { name: strings['ask.submit'], exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('data-focus-visible', 'true');
  await page.keyboard.press('Enter');
  await expect(form(page).getByRole('textbox')).not.toHaveValue('');
});

test('an Ask idea reads as a sentence in Geist 14 px, with no arrow chip', async ({ hubPage: page }) => {
  await open(page, 1350);
  const chip = page.getByRole('list', { name: strings['ask.chips'] }).getByRole('button').first(); // reason: every idea shares one style; the first proves it
  const st = await chip.evaluate((el) => {
    const c = getComputedStyle(el);
    return { size: c.fontSize, family: c.fontFamily, transform: c.textTransform, white: c.whiteSpace };
  });
  expect(st.size).toBe('14px');
  expect(st.family).toMatch(/^"?Geist"?,/);
  expect(st.transform).toBe('none');
  expect(st.white).not.toBe('nowrap');
});

// View all: link blue, on the right of the card header, its text ending at the card's padding line
// (20 px inside the 1 px border, 21 px from the card edge; the kit's narrower padding where it narrows it).
for (const theme of ['light', 'dark'] as const) {
  for (const width of [2400, 1350, 390]) {
    test(`${theme} ${width} px: every Home card's View all is link blue and ends at the card's padding line`, async ({ hubPage: page }) => {
      await open(page, width, theme);
      const links = page.locator('section > header > a');
      await expect(links.first()).toBeVisible(); // reason: wait for the cards to render; any card's link will do
      const n = await links.count();
      expect(n).toBeGreaterThan(0);
      const blue = await page.evaluate(() => {
        const p = document.createElement('a');
        p.style.color = 'var(--hx-link)';
        document.body.append(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      });
      for (let i = 0; i < n; i++) {
        const m = await links.nth(i).evaluate((a) => { // reason: each card's own View all, one by one
          const card = a.closest('section')!;
          const head = a.parentElement!;
          const c = card.getBoundingClientRect();
          const r = a.getBoundingClientRect();
          return {
            last: head.lastElementChild === a,
            color: getComputedStyle(a).color,
            fromEdge: Math.round(c.right - (r.right - parseFloat(getComputedStyle(a).paddingInlineEnd))),
            line: Math.round(parseFloat(getComputedStyle(head).paddingInlineEnd) + parseFloat(getComputedStyle(card).borderInlineEndWidth)),
          };
        });
        expect(m, `card ${i}`).toEqual({ last: true, color: blue, fromEdge: m.line, line: m.line });
        if (width >= 1350) expect(m.line, `card ${i}`).toBe(21);
      }
    });
  }
}

// An idea that names a computer with a long unbroken name still fits at 390: the bubble wraps the word inside the
// card (all of it readable), nothing scrolls sideways and no clipping box cuts its focus ring.
for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 390 px: an idea with a long unbroken name wraps inside the card`, async ({ hubPage: page }) => {
    await open(page, 390, theme);
    const list = page.getByRole('list', { name: strings['ask.chips'] });
    const chip = list.getByRole('button').nth(2); // reason: the third idea is "What is running on {{name}}?"
    const long = `What is running on ${'averyveryverylongcomputername'.repeat(3)}?`;
    await chip.evaluate((b, text) => {
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      const n = w.nextNode()!;
      n.textContent = text;
    }, long);
    await expect(chip).toHaveAccessibleName(long);
    await chip.focus();
    const m = await chip.evaluate((b) => {
      const card = b.closest('section')!.getBoundingClientRect();
      const ul = b.closest('ul')!;
      const r = b.getBoundingClientRect();
      return {
        inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5,
        listOverflow: ul.scrollWidth - ul.clientWidth,
        wrapped: r.height > 48,
        // The focus ring (--focus-ring, 4 px outside the box) is cut by no clipping ancestor.
        ringClippedBy: (() => {
          for (let el = b.parentElement; el; el = el.parentElement) {
            const st = getComputedStyle(el);
            if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
            const a = el.getBoundingClientRect();
            if (r.left - 4 < a.left - 0.5 || r.right + 4 > a.right + 0.5 || r.top - 4 < a.top - 0.5 || r.bottom + 4 > a.bottom + 0.5) return el.className;
          }
          return null;
        })(),
      };
    });
    expect(m).toEqual({ inside: true, listOverflow: 0, wrapped: true, ringClippedBy: null });
    await noSideScroll(page);
  });
}
