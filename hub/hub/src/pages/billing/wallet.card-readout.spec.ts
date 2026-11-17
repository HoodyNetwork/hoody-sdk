// Playwright (the Wallet card's stacked readout): the Billing wallet card reads like the kit
// StatStrip cell: 14 / 20 px padding, the label over the 28/34 balance over the 12/16 note, 4 px apart, the
// label in the strip's muted text token (the design's #6b6b6b is 4.46:1 on the card fill, under the 4.5:1 floor, the
// same call as the strip's). Through the real page at 2400, 1350 and 390 in both themes. The GitHub bonus heading under
// the balance takes the same label colour. Nothing is cut with the Referral credit and owed lines shown, nor with
// seven-figure amounts on every line at phone width.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

type Theme = 'light' | 'dark';

async function open(page: Page, width: number, theme: Theme, state?: string) {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, '/billing?view=wallet', state ? { theme, state } : { theme });
  await expect(page.locator('section[data-card="wallet"] [data-balance]')).toBeVisible();
}

/** A token's value as the page resolves it, in the colour form getComputedStyle gives. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('i');
    probe.style.setProperty('color', `var(${n})`);
    document.querySelector('#hub-main')!.append(probe);
    const v = getComputedStyle(probe).color;
    probe.remove();
    return v;
  }, name);

/** What the wallet card draws: its padding, the label's colour and contrast, the gap, the balance and note type. */
const look = (page: Page) =>
  page.locator('section[data-card="wallet"]').evaluate((card) => {
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const cs = getComputedStyle(card);
    const label = card.querySelector('h2#bill-wallet')!;
    const main = label.parentElement!;
    const balance = card.querySelector<HTMLElement>('[data-balance]')!;
    const note = balance.nextElementSibling as HTMLElement;
    const lc = getComputedStyle(label).color;
    // The bonus heading, when the account has an offer: the second label of the same card.
    const bonus = card.querySelector('h2#bill-bonus');
    const bc = bonus ? getComputedStyle(bonus).color : null;
    // Cut either way, measured on the text itself. For every element holding text, each line of that text (its text-node
    // range rects) must lie inside every box that clips it: the element itself when it clips, each clipping ancestor up
    // to the root (the card's own box included even though it does not clip), so a zero-height or one-line-short box is
    // caught however small its size. Separately, any clipping element whose content is larger than its box is counted.
    const clips = (x: Element) => getComputedStyle(x).overflowX !== 'visible' || getComputedStyle(x).overflowY !== 'visible';
    // The one allowance, vertical only: a kit Button's one-line label is a line box a few px shorter than its glyphs (its
    // ascenders run 2 px past it by design, nothing is hidden). Only text inside a <button> gets it, and only up and down;
    // every horizontal check, and every vertical check outside a button, is held to 1 px.
    const GLYPH_RUN = 4;
    const slackY = (x: Element) => (x.closest('button') ? GLYPH_RUN : 1);
    // The kit's screen-reader-only text (1 x 1 px, clip-path inset(50%)) is hidden on purpose and is not a cut.
    const srOnly = (x: Element) => {
      const o = getComputedStyle(x);
      return o.position === 'absolute' && o.clipPath.startsWith('inset(50%') && x.clientWidth <= 1;
    };
    const name = (x: Element) => `${x.tagName.toLowerCase()}${x.id ? `#${x.id}` : ''}${x.getAttribute('class') ? `.${String(x.getAttribute('class')).split(' ')[0]}` : ''}`;
    const all = [card, ...card.querySelectorAll<HTMLElement>('*')];
    const overflows = all
      .filter((x) => !srOnly(x))
      .filter((x) => {
        const o = getComputedStyle(x);
        return (o.overflowX !== 'visible' && x.scrollWidth > x.clientWidth + 1) || (o.overflowY !== 'visible' && x.scrollHeight > x.clientHeight + slackY(x));
      })
      .map((x) => `overflow ${name(x)} ${x.scrollWidth}x${x.scrollHeight}>${x.clientWidth}x${x.clientHeight}`);
    const lines = (x: Element) =>
      [...x.childNodes]
        .filter((n) => n.nodeType === 3 && n.textContent!.trim() !== '')
        .flatMap((n) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          return [...r.getClientRects()];
        });
    const outside = all
      .filter((x) => !srOnly(x))
      .flatMap((x) => {
        const rs = lines(x);
        if (rs.length === 0) return [];
        const e = slackY(x);
        for (let a: Element | null = x; a && a !== document.documentElement; a = a.parentElement) {
          if (a !== card && !clips(a)) continue;
          // A clipping box clips at its padding edge; the card (not clipping) is held to its border edge.
          const bb = a.getBoundingClientRect();
          const b = a === card && !clips(a) ? bb : { left: bb.left + a.clientLeft, top: bb.top + a.clientTop, right: bb.left + a.clientLeft + a.clientWidth, bottom: bb.top + a.clientTop + a.clientHeight };
          if (rs.some((r) => r.top < b.top - e || r.bottom > b.bottom + e || r.left < b.left - 1 || r.right > b.right + 1)) return [`${name(x)} text past ${a === x ? 'its own box' : name(a)}`];
        }
        return [];
      });
    const cut = [...overflows, ...outside];
    const order = label.getBoundingClientRect().bottom <= balance.getBoundingClientRect().top + 1 && balance.getBoundingClientRect().bottom <= note.getBoundingClientRect().top + 1;
    return {
      pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
      labelColor: lc,
      labelContrast: ratio(lc, cs.backgroundColor),
      bonusColor: bc,
      bonusContrast: bc ? ratio(bc, cs.backgroundColor) : null,
      gap: getComputedStyle(main).rowGap,
      balance: `${getComputedStyle(balance).fontSize}/${getComputedStyle(balance).lineHeight}`,
      note: `${getComputedStyle(note).fontSize}/${getComputedStyle(note).lineHeight}`,
      order,
      cut,
    };
  });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [2400, 1350, 390]) {
    test(`wallet card at ${width}, ${theme}: the StatStrip readout look`, async ({ page }) => {
      await open(page, width, theme);
      const l = await look(page);
      expect(l.pad).toBe('14px 20px 14px 20px');
      expect(l.gap).toBe('4px');
      expect(l.labelColor).toBe(await token(page, '--hx-muted'));
      expect(l.labelContrast).toBeGreaterThanOrEqual(4.5);
      // The default account has a bonus offer: its heading is drawn, in the same muted label colour.
      expect(l.bonusColor, 'the bonus heading is drawn').not.toBeNull();
      expect(l.bonusColor).toBe(await token(page, '--hx-muted'));
      expect(l.bonusContrast).toBeGreaterThanOrEqual(4.5);
      expect(l.balance).toBe('28px/34px');
      expect(l.note).toBe('12px/16px');
      expect(l.order, 'label above balance above note').toBe(true);
      expect(l.cut, 'nothing in the wallet card is cut').toEqual([]);
      await noSideScroll(page);
      await page.locator('section[data-card="wallet"]').screenshot({ path: test.info().outputPath(`d37-wallet-${width}-${theme}.png`) });
    });
  }
}

// The lines under the note sit 4 px apart like the triple above them: with both shown, and with amounts as long as a
// wallet can hold, every line is whole at every width (a long amount wraps or widens the card, it is never clipped).
for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 390]) {
    test(`wallet card at ${width}, ${theme}: the Referral credit and owed lines are whole`, async ({ page }) => {
      await open(page, width, theme, 'wallet-referral-owed');
      const card = page.locator('section[data-card="wallet"]');
      await expect(card.locator('[data-referral]')).toBeVisible();
      await expect(card.locator('[data-owed]')).toBeVisible();
      await expect(card.locator('[data-referral]')).toContainText('$12.40');
      await expect(card.locator('[data-owed]')).toContainText('$3.00');
      const l = await look(page);
      expect(l.gap).toBe('4px');
      expect(l.order, 'label above balance above note').toBe(true);
      expect(l.cut, 'nothing in the wallet card is cut').toEqual([]);
      await noSideScroll(page);
    });

    test(`wallet card at ${width}, ${theme}: seven-figure amounts are whole`, async ({ page }) => {
      await open(page, width, theme, 'wallet-long-amounts');
      const card = page.locator('section[data-card="wallet"]');
      await expect(card.locator('[data-balance]')).toHaveText('$1,234,567.89');
      await expect(card.locator('[data-referral]')).toContainText('$123,456.40');
      await expect(card.locator('[data-owed]')).toContainText('$98,765.00');
      const l = await look(page);
      expect(l.balance).toBe('28px/34px');
      expect(l.cut, 'nothing in the wallet card is cut').toEqual([]);
      // The balance is one line of digits inside the card: its box neither leaves the card nor hides any of it.
      const fits = await card.evaluate((c) => {
        const b = c.querySelector<HTMLElement>('[data-balance]')!;
        const cb = c.getBoundingClientRect();
        const bb = b.getBoundingClientRect();
        return bb.left >= cb.left - 1 && bb.right <= cb.right + 1 && b.scrollWidth <= b.clientWidth + 1;
      });
      expect(fits, 'the balance stays inside the card').toBe(true);
      await noSideScroll(page);
    });
  }
}
