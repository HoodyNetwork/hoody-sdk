// The Questions "split ledger" (after the "Inset well" design), through the real
// Faq section (gallery `/_kit?layout=faq`, three questions): a framed well under a mono-caps band; two questions to a row
// on a wide well, one on a narrow one; a question a step above its answer; an open question one card (the plate and an
// ink bar at its start) that its focus ring wraps; a hover tint with the accent's 3 px bar that leaves the focus ring
// alone; the answer under the question's words, or under the chevron on a narrow well. Light and dark, at 1350, 2400
// and on a phone with a coarse pointer.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const ROUTE = '/_kit?layout=faq';
const WELL = { light: 'rgb(230, 227, 227)', dark: 'rgb(22, 22, 24)' };
/** The page ground (--hx-bg): the dark well must not be it (a well of the ground's colour vanishes). */
const PAGE = { light: 'rgb(240, 240, 240)', dark: 'rgb(17, 17, 18)' };
const FRAME = { light: 'rgba(0, 0, 0, 0.14)', dark: 'rgba(255, 255, 255, 0.14)' };
const HOVER = { light: 'rgb(240, 237, 237)', dark: 'rgb(32, 32, 36)' };
const PLATE = { light: 'rgb(247, 245, 245)', dark: 'rgb(30, 30, 34)' };
const INK = { light: 'rgb(39, 39, 39)', dark: 'rgb(237, 237, 237)' };
const ANSWER = { light: 'rgb(58, 58, 58)', dark: 'rgb(194, 194, 198)' };
const BAND = { light: 'rgba(0, 0, 0, 0.05)', dark: 'rgba(255, 255, 255, 0.06)' };
const BAND_LINE = { light: 'rgba(0, 0, 0, 0.2)', dark: 'rgba(255, 255, 255, 0.24)' };
const ROW_LINE = { light: 'rgba(0, 0, 0, 0.09)', dark: 'rgba(255, 255, 255, 0.07)' };
/** The accent (--hx-acc, #ef2), the hover bar's colour in both themes. */
const ACC = 'rgb(238, 255, 34)';

const ITEM = '#faq [id^="faq-"]';
const Q = `${ITEM} button[aria-expanded]`;

const style = (page: Page, sel: string, props: string[]) =>
  page.locator(sel).first().evaluate((el, ps) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
  }, props);

/** The bar layer: the background shorthand adds a second, empty layer for the tint (`…, none`). */
const barLayer = (img: string) => img.replace(/, none$/, '');

/** WCAG contrast of two `rgb(…)` colours. */
const contrast = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/**
 * The start edge of the first line of text inside the first element `sel` matches (its words, not its box): the left
 * edge in a left-to-right page, the right edge in a right-to-left one. A line can be several bidi runs (Latin words,
 * digits and a "?" in a right-to-left page), so the edge is the extent of every run on the first line, not the first run.
 */
const textX = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((c) => c.width > 0);
    if (rects.length === 0) return NaN;
    const top = Math.min(...rects.map((c) => c.top));
    const line = rects.filter((c) => Math.abs(c.top - top) < 2);
    return getComputedStyle(el).direction === 'rtl' ? Math.max(...line.map((c) => c.right)) : Math.min(...line.map((c) => c.left));
  });

/** Waits for the chevron's turn to finish: a turning chevron's box is wider than its resting one (a box read mid-turn
 *  is off by up to 3 px, and a loaded host reads it mid-turn). */
const settled = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => undefined));

/** The start edge of an element's box: left in a left-to-right page, right in a right-to-left one. */
const boxX = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return getComputedStyle(el).direction === 'rtl' ? b.right : b.left;
  });

/** The kit's focus ring over a `gap` colour, as the browser computes it, read from a probe so the token's shape and
 *  the theme's --hx-focus are the page's own. */
const ringOver = (page: Page, gap: string) =>
  page.evaluate((g) => {
    const probe = document.createElement('div');
    probe.style.boxShadow = `0 0 0 2px ${g}, 0 0 0 4px var(--hx-focus)`;
    document.body.append(probe);
    const v = getComputedStyle(probe).boxShadow;
    probe.remove();
    return v;
  }, gap);

/** The open card's focus ring: drawn by its overlay, so a landing's pulse on the card's own shadow leaves it alone. */
const cardRing = (page: Page, i = 0) => page.locator(ITEM).nth(i).evaluate((el) => getComputedStyle(el, '::after').boxShadow);

const boxes = (page: Page) => page.locator(ITEM).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));

test.describe.configure({ timeout: 90_000 });

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 1350: the Questions section is a framed ledger under a mono-caps band`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, ROUTE, { theme });
    await expect(page.locator('#faq')).toBeVisible();
    const well = await style(page, '#faq', ['background-color', 'border-top-width', 'border-left-width', 'border-top-color']);
    expect(well['background-color'], 'the well is #e6e3e3 (dark: #161618)').toBe(WELL[theme]);
    expect(well['background-color'], 'the well is not the page ground').not.toBe(PAGE[theme]);
    expect([well['border-top-width'], well['border-left-width']], 'the well has a 1 px frame').toEqual(['1px', '1px']);
    expect(well['border-top-color'], 'the frame is the faint well border').toBe(FRAME[theme]);

    const title = await style(page, '#faq [data-faq-title]', ['font-family', 'font-size', 'letter-spacing', 'text-transform', 'border-bottom-width', 'border-bottom-color', 'background-color', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'margin-bottom']);
    expect(title['font-family'], 'the band is the mono face').toContain('Mono');
    expect(title['font-size'], 'the band is 12 px').toBe('12px');
    expect(title['letter-spacing'], 'the band is tracked .16em').toBe('1.92px');
    expect(title['text-transform'], 'the band is in capitals').toBe('uppercase');
    expect(title['border-bottom-width'], 'a 1 px rule closes the band').toBe('1px');
    expect([title['padding-left'], title['padding-right'], title['padding-top'], title['padding-bottom']], 'the band is padded 12 / 20').toEqual(['20px', '20px', '12px', '12px']);
    expect(title['margin-bottom'], 'the band meets the first row').toBe('0px');
    expect(title['background-color'], 'the band is the faint band tint').toBe(BAND[theme]);
    expect(title['border-bottom-color'], 'the band rule is the .2 line').toBe(BAND_LINE[theme]);

    // Two to a row: the first two questions side by side, the third under the first, a line over it.
    const b = await boxes(page);
    expect(b.length, 'the gallery shows three questions').toBe(3);
    expect(Math.abs(b[0]!.top - b[1]!.top), 'the first two questions share a row').toBeLessThanOrEqual(2);
    expect(b[1]!.left, 'the second question is beside the first').toBeGreaterThanOrEqual(b[0]!.right - 2);
    expect(b[2]!.top, 'the third question starts the next row').toBeGreaterThanOrEqual(b[0]!.bottom - 2);
    const lines = await page.locator(ITEM).evaluateAll((els) => els.map((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderLeftWidth]));
    expect(lines, 'a line over the second row, a line between the columns, none over the first row').toEqual([['0px', '0px'], ['0px', '1px'], ['1px', '0px']]);
    const lineColour = await page.locator(ITEM).nth(2).evaluate((e) => getComputedStyle(e).borderTopColor);
    expect(lineColour, 'the line between rows is the kit hairline').toBe(ROW_LINE[theme]);

    const q = page.locator(Q).first();
    const words = await style(page, `${Q} [class*="title"]`, ['font-size', 'font-weight', 'line-height', 'color']);
    expect([words['font-size'], words['font-weight'], words['line-height']], 'a question is 14/20 semibold').toEqual(['14px', '600', '20px']);
    expect(words['color'], 'a question is the ink').toBe(INK[theme]);
    const hits = await page.locator(Q).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...hits), 'every question row is at least 44 px with a mouse too').toBeGreaterThanOrEqual(44);

    // The keyboard reaches the question first, so its focus ring is drawn; the pointer then rests on the same row.
    await q.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(q).toBeFocused();
    const ring = await q.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring, 'the keyboard-focused question shows the kit focus ring over the well').toBe(await ringOver(page, WELL[theme]));
    await q.hover();
    await expect(q).toHaveAttribute('data-hovered', 'true');
    const hov = await q.evaluate((el) => {
      const cs = getComputedStyle(el);
      const t = el.querySelector('[class*="title"]')!;
      return { bg: cs.backgroundColor, img: cs.backgroundImage, ring: cs.boxShadow, deco: getComputedStyle(t).textDecorationLine };
    });
    expect(hov.bg, 'a hovered question is tinted').toBe(HOVER[theme]);
    expect(barLayer(hov.img), 'a hovered question shows the 3 px accent bar at its start').toBe(`linear-gradient(to right, ${ACC} 3px, rgba(0, 0, 0, 0) 3px)`);
    expect(hov.ring, 'the focus ring stays, unchanged, while the focused question is hovered').toBe(ring);
    expect(hov.deco, 'a hovered question is not also underlined').toBe('none');

    // Opened, from the keyboard: one card, its focus ring around question and answer together.
    await page.keyboard.press('Enter');
    await expect(q).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(0, 0);
    const card = await page.locator(ITEM).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, img: cs.backgroundImage };
    });
    expect(card.bg, 'an open question is the plate').toBe(PLATE[theme]);
    expect(barLayer(card.img), 'an open question has the ink bar at its start').toBe(`linear-gradient(to right, ${INK[theme]} 3px, rgba(0, 0, 0, 0) 3px)`);
    expect(await cardRing(page), 'the focus ring wraps the open card, its gap the plate').toBe(await ringOver(page, PLATE[theme]));
    const edge = await page.locator(ITEM).first().evaluate((el) => {
      const a = getComputedStyle(el, '::after');
      return [a.top, a.right, a.bottom, a.left];
    });
    expect(edge, "the ring is drawn 4 px inside the card, so it ends at the card's edge and no scrollport clips it").toEqual(['4px', '4px', '4px', '4px']);
    expect(await q.evaluate((el) => getComputedStyle(el).boxShadow), 'no ring of its own between the question and its answer').toBe('none');

    const ans = await style(page, `${ITEM} p`, ['font-size', 'font-weight', 'line-height', 'color']);
    expect([ans['font-size'], ans['font-weight'], ans['line-height']], 'an answer is 13/20 regular').toEqual(['13px', '400', '20px']);
    expect(ans['color'], 'an answer is the softer answer ink').toBe(ANSWER[theme]);
    expect(contrast(ans['color']!, PLATE[theme]), 'the answer reads at 4.5:1 or more on the plate').toBeGreaterThanOrEqual(4.5);
    expect(contrast(INK[theme], WELL[theme]), 'a question reads at 4.5:1 or more on the well').toBeGreaterThanOrEqual(4.5);
    expect((await page.locator(`${ITEM} p`).first().boundingBox())!.width, 'the answer keeps a reading measure').toBeLessThanOrEqual(480);
    const qx = await textX(page, `${Q} [class*="title"]`);
    const ax = await textX(page, `${ITEM} p`);
    expect(Math.abs(qx - ax), `the answer starts under the question's words (${qx} vs ${ax})`).toBeLessThanOrEqual(1);
    // The closed neighbour's question stays at the row's top, and the line between the columns runs the whole row.
    const after = await boxes(page);
    expect(Math.abs(after[1]!.top - after[0]!.top - (b[1]!.top - b[0]!.top)), 'an open answer leaves its closed neighbour where it was').toBeLessThanOrEqual(1);
    expect(Math.abs(after[1]!.height - after[0]!.height), 'the line between the columns runs down the open card too').toBeLessThanOrEqual(1);
    const nq = await page.locator(Q).nth(1).boundingBox();
    expect(Math.abs(nq!.y - after[1]!.y), "the neighbour's question stays at the top of its cell").toBeLessThanOrEqual(1);
    // The odd last question is alone on its row: one column wide, no line at its side.
    expect(Math.abs(after[2]!.width - after[0]!.width), 'the odd last question keeps one column').toBeLessThanOrEqual(1);
    expect(await page.locator(ITEM).nth(2).evaluate((e) => getComputedStyle(e).borderLeftWidth), 'no column line beside the odd last question').toBe('0px');

    // A landing on the focused open card: the "here" pulse animates the card's own shadow, the ring stays on its overlay,
    // in motion and with reduced motion.
    const ringNow = await cardRing(page);
    await page.locator(ITEM).first().evaluate((el) => el.setAttribute('data-hub-here', ''));
    expect(await page.locator(ITEM).first().evaluate((el) => getComputedStyle(el).animationName), 'the landing pulse runs on the card').toBe('hub-here');
    expect(await cardRing(page), 'the focus ring stays through the landing pulse').toBe(ringNow);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator(ITEM).first().evaluate((el) => getComputedStyle(el).boxShadow), 'with reduced motion the still tint takes the card shadow').not.toBe('none');
    const still = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--hx-selected)';
      document.body.append(probe);
      const v = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return v;
    });
    expect(await page.locator(ITEM).first().evaluate((el) => getComputedStyle(el).backgroundColor), 'with reduced motion the still tint also fills the open card').toBe(still);
    expect(await cardRing(page), 'the focus ring stays through the still tint').toBe(ringNow);
    await page.locator(ITEM).first().evaluate((el) => el.removeAttribute('data-hub-here'));
    await page.emulateMedia({ reducedMotion: null });
    await page.screenshot({ path: test.info().outputPath(`faqwell-${theme}-1350.png`), fullPage: true });
  });

  test(`${theme} 2400: still two to a row, each answer at a reading measure`, async ({ page }) => {
    await page.setViewportSize({ width: 2400, height: 1200 });
    await gotoHub(page, ROUTE, { theme });
    await expect(page.locator('#faq')).toBeVisible();
    const b = await boxes(page);
    expect(Math.abs(b[0]!.top - b[1]!.top), 'the first two questions share a row at 2400').toBeLessThanOrEqual(2);
    expect(b[1]!.left, 'the second question is beside the first at 2400').toBeGreaterThanOrEqual(b[0]!.right - 2);
    expect(b[2]!.top, 'the third question starts the next row at 2400').toBeGreaterThanOrEqual(Math.max(b[0]!.bottom, b[1]!.bottom) - 2);
    expect(Math.abs(b[2]!.left - b[0]!.left), 'the third question sits under the first at 2400').toBeLessThanOrEqual(2);
    await page.locator(Q).first().click();
    await expect(page.locator(Q).first()).toHaveAttribute('aria-expanded', 'true');
    expect((await page.locator(`${ITEM} p`).first().boundingBox())!.width, 'the answer keeps a reading measure at 2400').toBeLessThanOrEqual(480);
    await page.screenshot({ path: test.info().outputPath(`faqwell-${theme}-2400.png`), fullPage: true });
  });
}

// A real page's questions (Referrals) get the same well, and its answers sit under their words.
test('light 1350 /referrals: the page questions are the same ledger', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/referrals', { theme: 'light' });
  await expect(page.locator('#faq')).toBeVisible({ timeout: 20_000 });
  expect((await style(page, '#faq', ['background-color']))['background-color'], 'the Referrals questions are the well').toBe(WELL.light);
  const q = page.locator(Q).first();
  await q.click();
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  const qx = await textX(page, `${Q} [class*="title"]`);
  const ax = await textX(page, `${ITEM} p`);
  expect(Math.abs(qx - ax), `a Referrals answer starts under its question (${qx} vs ${ax})`).toBeLessThanOrEqual(1);
});

// A list pane's questions (Vault: ListDetailPage, titleLevel 3) are the same ledger, under an h3 band; with compact
// density their rows keep 44 px and the answer its start under the words.
test('light 1350 /vault list pane, compact: the same ledger under an h3 band', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, '/vault', { theme: 'light' });
  await expect(page.locator('#faq')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-density', 'compact'));
  expect(await page.locator('#faq [data-faq-title]').evaluate((e) => e.tagName), 'the list pane band is an h3').toBe('H3');
  expect((await style(page, '#faq', ['background-color']))['background-color'], 'the list pane questions are the well').toBe(WELL.light);
  const words = await style(page, `${Q} [class*="title"]`, ['font-size', 'font-weight', 'line-height']);
  expect([words['font-size'], words['font-weight'], words['line-height']], 'a list pane question is 14/20 semibold').toEqual(['14px', '600', '20px']);
  const hits = await page.locator(Q).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...hits), 'compact density keeps 44 px question rows').toBeGreaterThanOrEqual(44);
  const q = page.locator(Q).first();
  await q.click();
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  const qx = await textX(page, `${Q} [class*="title"]`);
  const ax = await textX(page, `${ITEM} p`);
  expect(Math.abs(qx - ax), `a list pane answer starts under its question (${qx} vs ${ax})`).toBeLessThanOrEqual(1);
});

// In a right-to-left page the hover bar and the open card's bar move to the start, on the right.
test('light rtl: the bars and the answer all sit at the start, on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, ROUTE, { theme: 'light' });
  await expect(page.locator('#faq')).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  const q = page.locator(Q).first();
  await q.hover();
  await expect(q).toHaveAttribute('data-hovered', 'true');
  expect(barLayer(await q.evaluate((el) => getComputedStyle(el).backgroundImage)), 'the rtl hover bar is drawn from the right').toBe(`linear-gradient(to left, ${ACC} 3px, rgba(0, 0, 0, 0) 3px)`);
  await q.click();
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.move(0, 0);
  expect(barLayer(await page.locator(ITEM).first().evaluate((el) => getComputedStyle(el).backgroundImage)), 'the rtl card bar is drawn from the right').toBe(`linear-gradient(to left, ${INK.light} 3px, rgba(0, 0, 0, 0) 3px)`);
  const qx = await textX(page, `${Q} [class*="title"]`);
  const ax = await textX(page, `${ITEM} p`);
  expect(Math.abs(qx - ax), `the rtl answer starts under its question's words (${qx} vs ${ax})`).toBeLessThanOrEqual(1);
  // On a narrow well every answer starts under its chevron at the right-hand start edge, wrapped answers included (390).
  await page.setViewportSize({ width: 390, height: 844 });
  const questions = page.locator(Q);
  for (const one of await questions.all()) {
    if ((await one.getAttribute('aria-expanded')) !== 'true') await one.click();
    await expect(one).toHaveAttribute('aria-expanded', 'true');
  }
  const n = await page.locator(ITEM).count();
  let wrapped = 0;
  for (let i = 0; i < n; i++) {
    const item = `${ITEM} >> nth=${i}`;
    await settled(page, `${item} >> button[aria-expanded] svg`);
    const cx = await boxX(page, `${item} >> button[aria-expanded] svg`);
    const ax2 = await textX(page, `${item} >> p`);
    expect(Math.abs(cx - ax2), `rtl answer ${i} starts under its chevron (${cx} vs ${ax2})`).toBeLessThanOrEqual(1);
    const lines = await page.locator(`${item} >> p`).first().evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return new Set([...r.getClientRects()].filter((c) => c.width > 0).map((c) => Math.round(c.top))).size;
    });
    if (lines > 1) wrapped++;
  }
  expect(wrapped, 'some rtl answer wraps at 390, and its start still lines up').toBeGreaterThan(0);
});

test.describe('a phone with a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const theme of ['light', 'dark'] as const)
    test(`${theme}: one question to a row, each a 44 px row in the well, and its answer takes the width back`, async ({ page }) => {
      await gotoHub(page, ROUTE, { theme });
      await expect(page.locator('#faq')).toBeVisible();
      const hs = await page.locator(Q).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(hs.length, 'the phone shows the questions').toBeGreaterThan(1);
      expect(Math.min(...hs), 'every question row is a 44 px touch target').toBeGreaterThanOrEqual(44);
      const b = await boxes(page);
      expect(b[1]!.top, 'the questions stack, one to a row').toBeGreaterThanOrEqual(b[0]!.bottom - 2);
      expect(Math.abs(b[0]!.left - b[1]!.left), 'stacked questions share their start').toBeLessThanOrEqual(2);
      expect((await style(page, '#faq', ['background-color']))['background-color'], 'the phone shows the same well').toBe(WELL[theme]);
      const band = await style(page, '#faq [data-faq-title]', ['background-color', 'border-bottom-color', 'border-bottom-width', 'text-transform', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-bottom']);
      expect(band['background-color'], 'the phone shows the same band').toBe(BAND[theme]);
      expect([band['border-bottom-width'], band['border-bottom-color']], 'the phone band keeps its 1 px rule').toEqual(['1px', BAND_LINE[theme]]);
      expect([band['padding-top'], band['padding-bottom'], band['padding-left'], band['padding-right']], 'the phone band is padded 12 / 16').toEqual(['12px', '12px', '16px', '16px']);
      expect([band['text-transform'], band['margin-bottom']], 'the phone band is the same capitals band, on the first row').toEqual(['uppercase', '0px']);
      // One item, tapped and measured: its own question and its own answer.
      const item = `${ITEM} >> nth=0`;
      const q = page.locator(`${item} >> button[aria-expanded]`);
      await q.tap();
      await expect(q).toHaveAttribute('aria-expanded', 'true');
      const p = page.locator(`${item} >> p`);
      await expect(p, 'a tapped question opens its own answer in the well').toBeVisible();
      await settled(page, `${item} >> button[aria-expanded] svg`);
      const cx = await boxX(page, `${item} >> button[aria-expanded] svg`);
      const ax = await textX(page, `${item} >> p`);
      expect(Math.abs(cx - ax), `on the phone the answer starts under the chevron (${cx} vs ${ax})`).toBeLessThanOrEqual(1);
      expect((await p.boundingBox())!.width, 'the phone answer gets the width back').toBeGreaterThanOrEqual(295);
      await page.screenshot({ path: test.info().outputPath(`faqwell-${theme}-390.png`), fullPage: true });
    });
});
