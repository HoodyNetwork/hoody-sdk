// Playwright ("Stacked readout"): the kit StatStrip, on the real pages that draw it. On the card
// fill, a caps label over a 28/34 number over a 12/16 note, cells padded 14 / 20 px, 1 px solid dividers; below 600 px
// the cells wrap two to a row instead of hiding. Colours are the tokens' (dark derived); the label keeps the
// muted text token, since the design's #6b6b6b on #edeaea is 4.46:1, under the 4.5:1 floor. Shots are artifacts.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import computers from '../../pages/computers/strings.en.json';
import vault from '../../pages/vault/strings.en.json';

type Theme = 'light' | 'dark';
const PAGES = [
  { path: '/computers', label: computers['strip.label'] },
  { path: '/vault', label: vault['stats.label'] },
] as const;

async function open(page: Page, path: string, width: number, theme: Theme, state?: string): Promise<Locator> {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, path, { theme, ...(state ? { state } : {}) });
  const strip = page.locator(`dl[aria-label="${PAGES.find((p) => p.path === path)!.label}"]`);
  await expect(strip).toBeVisible();
  return strip;
}

/** A token's value as the page resolves it, in the colour form getComputedStyle gives. */
const token = (page: Page, name: string, prop: 'color' | 'backgroundColor' = 'color') =>
  page.evaluate(([n, p]) => {
    const probe = document.createElement('i');
    probe.style.setProperty(p === 'color' ? 'color' : 'background-color', `var(${n})`);
    document.querySelector('#hub-main')!.append(probe);
    const v = getComputedStyle(probe)[p as 'color'];
    probe.remove();
    return v;
  }, [name, prop] as const);

/** What a strip draws: the dl's fill, and per cell its padding, divider, label, number and note. */
const look = (strip: Locator) =>
  strip.evaluate((dl) => {
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const fill = getComputedStyle(dl).backgroundColor;
    return {
      fill,
      display: getComputedStyle(dl).display,
      columns: getComputedStyle(dl).gridTemplateColumns.split(' ').length,
      cells: [...dl.children].map((cell) => {
        const c = getComputedStyle(cell);
        const dt = cell.querySelector('dt')!;
        const [num, note] = [...cell.querySelectorAll('dd > span')] as HTMLElement[];
        return {
          pad: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join(' '),
          start: `${c.borderInlineStartWidth} ${c.borderInlineStartStyle} ${c.borderInlineStartColor}`,
          top: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
          labelContrast: ratio(getComputedStyle(dt).color, fill),
          numberContrast: num ? ratio(getComputedStyle(num).color, fill) : 0,
          noteContrast: note ? ratio(getComputedStyle(note).color, fill) : 99,
          // A note shows whole (it wraps): a clipped note hides words, and a clipped control (Computers' upgrade link) is a hidden one.
          noteClipped: note ? note.scrollWidth > note.clientWidth + 1 || note.getBoundingClientRect().right > cell.getBoundingClientRect().right + 0.5 : false,
          // A control in the note, and whether it stays inside its cell's padding box on both sides.
          control: (() => {
            const ctl = note?.querySelector<HTMLElement>('a, button');
            if (!ctl) return null;
            const [b, r] = [ctl.getBoundingClientRect(), cell.getBoundingClientRect()];
            return { kind: ctl.dataset.upgrade ?? '', text: ctl.textContent ?? '', inside: b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.width > 0 };
          })(),
          number: num ? `${getComputedStyle(num).fontSize}/${getComputedStyle(num).lineHeight}` : '',
          note: note ? `${getComputedStyle(note).fontSize}/${getComputedStyle(note).lineHeight}` : '',
          noteBelow: num && note ? note.getBoundingClientRect().top >= num.getBoundingClientRect().bottom - 0.5 : true,
          labelAbove: num ? dt.getBoundingClientRect().bottom <= num.getBoundingClientRect().top + 0.5 : true,
        };
      }),
    };
  });

for (const theme of ['light', 'dark'] as const) {
  for (const { path } of PAGES) {
    for (const width of [2400, 1350]) {
      test(`${path} at ${width} px, ${theme}: the summary is a stacked readout on the card fill`, async ({ hubPage: page }, info) => {
        const strip = await open(page, path, width, theme);
        const l = await look(strip);
        const line = await token(page, '--hx-line');
        expect(l.fill).toBe(await token(page, '--hx-card', 'backgroundColor'));
        // The literal fill per theme also proves the requested theme applied (dark's card is #18181a).
        if (theme === 'light') {
          expect(l.fill).toBe('rgb(237, 234, 234)');
        } else expect(l.fill).toBe('rgb(24, 24, 26)');
        expect(l.cells.length).toBeGreaterThan(1);
        l.cells.forEach((c, i) => {
          expect(c.pad, `cell ${i}`).toBe('14px 20px 14px 20px');
          if (i === 0) expect(c.start, 'cell 0').toMatch(/^0px/);
          else expect(c.start, `cell ${i}`).toBe(`1px solid ${line}`);
          expect(c.number, `cell ${i}`).toBe('28px/34px');
          expect(c.labelAbove && c.noteBelow, `cell ${i}`).toBe(true);
          expect(c.labelContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
          expect(c.numberContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
          expect(c.noteContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
          expect(c.noteClipped, `cell ${i}`).toBe(false);
          if (c.note) expect(c.note, `cell ${i}`).toBe('12px/16px');
        });
        expect(l.cells.some((c) => c.note)).toBe(true);
        await strip.screenshot({ path: info.outputPath(`d37-${path.slice(1)}-${width}-${theme}.png`) });
      });
    }
  }

  for (const { path } of PAGES) {
    test(`${path} at 390 px, ${theme}: the cells wrap two to a row, a solid rule between rows, with no side scroll`, async ({ hubPage: page }, info) => {
      const strip = await open(page, path, 390, theme);
      const l = await look(strip);
      const line = await token(page, '--hx-line');
      expect(l.fill).toBe(theme === 'light' ? 'rgb(237, 234, 234)' : 'rgb(24, 24, 26)');
      expect(l.display).toBe('grid');
      expect(l.columns).toBe(2);
      expect(l.cells.length).toBeGreaterThan(1);
      l.cells.forEach((c, i) => {
        // A row's first cell has no divider before it; the second has one; every row after the first has one above.
        if (i % 2 === 0) expect(c.start, `cell ${i}`).toMatch(/^0px/);
        else expect(c.start, `cell ${i}`).toBe(`1px solid ${line}`);
        if (i >= 2) expect(c.top, `cell ${i}`).toBe(`1px solid ${line}`);
        else expect(c.top, `cell ${i}`).toMatch(/^0px/);
        expect(c.number, `cell ${i}`).toBe('28px/34px');
        if (c.note) expect(c.note, `cell ${i}`).toBe('12px/16px');
        expect(c.labelAbove && c.noteBelow, `cell ${i}`).toBe(true);
        expect(c.labelContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
        expect(c.numberContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
        expect(c.noteContrast, `cell ${i}`).toBeGreaterThanOrEqual(4.5);
        expect(c.noteClipped, `cell ${i}`).toBe(false);
      });
      // Vault's fixture has three cells, so it shows the second row; Computers' has two (no slots row in its fixture).
      if (path === '/vault') expect(l.cells.length, 'the fixture has a second row').toBe(3);
      expect(l.cells.some((c) => c.note)).toBe(true);
      expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await noSideScroll(page);
      await strip.screenshot({ path: info.outputPath(`d37-${path.slice(1)}-390-${theme}.png`) });
    });
  }
}

// Computers' slots cell with its upgrade link near and at the limit (fixtures slotsNear, slotsFull): the link keeps to its
// cell on a phone (two to a row) and in the narrowest one-row strip (a 700 px window), its words whole.
for (const state of ['slotsNear', 'slotsFull'] as const) {
  for (const width of [390, 700]) {
    test(`/computers at ${width} px, ${state}: the slots upgrade link stays inside its cell`, async ({ hubPage: page }, info) => {
      const strip = await open(page, '/computers', width, 'light', state);
      const l = await look(strip);
      expect(l.cells.length).toBe(3);
      const ctl = l.cells[2]!.control;
      expect(ctl, 'the slots cell carries the upgrade link').not.toBeNull();
      expect(ctl!.kind).toBe(state === 'slotsNear' ? 'near' : 'full');
      expect(ctl!.text).toMatch(state === 'slotsNear' ? /Running low/i : /Full/i);
      expect(ctl!.inside, 'the link stays inside its cell').toBe(true);
      l.cells.forEach((c, i) => expect(c.noteClipped, `cell ${i}`).toBe(false));
      expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await noSideScroll(page);
      await strip.screenshot({ path: info.outputPath(`d37-computers-${state}-${width}.png`) });
    });
  }
}

// The same link on a phone with a coarse pointer: a 44 px touch target (the kit's --touch-min), whatever the strip's rule.
// The shared coarse page (hubPageCoarse: touch, mobile) carries the pointer; a per-file test.use may not (e2e.contract).
test.describe('coarse pointer', () => {
  for (const state of ['slotsNear', 'slotsFull'] as const) {
    test(`/computers at 390 px, ${state}, coarse pointer: the slots upgrade link is at least 44 px tall`, async ({ hubPageCoarse: page }) => {
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the page has a coarse pointer').toBe(true);
      const strip = await open(page, '/computers', 390, 'light', state);
      const link = strip.locator('[data-upgrade]');
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  }
});
