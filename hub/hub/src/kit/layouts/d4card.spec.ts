// Playwright: every outermost card on a page shows one continuous 1 px line with the 16 px
// slanted bottom-right corner, in its own border colour, at 1350 and 2400 px and on a phone, light and dark, and the
// line is redrawn when the card changes size. A card in a card and a card holding a table stay square with their CSS
// border; the Computers cards keep their own frame. A focused card row shows its ring inside the cut frame.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';

// Each test loads a whole page and judges every card on it: on a busy machine that takes longer than the default.
test.describe.configure({ timeout: 90_000 });

interface Seen {
  marked: number;
  drawn: number;
  square: number;
  problems: string[];
}

/** Every [data-card-cut] card in the page: clipped, transparent border, its first child the edge over its border box
 * with the shared outline at its size, stroked in the card's own border colour (read with the mark taken off for a
 * moment, so a page or state recolour the corner misses shows), and placed as it was (static becomes relative, sticky
 * stays sticky), never clipping its own edge; a card holding a table: no edge, its border kept. No marked card sits inside another. */
async function judge(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const out = { marked: 0, drawn: 0, square: 0, problems: [] as string[] };
    const path = (w: number, h: number) => `M0.5 0.5H${w - 0.5}V${h - 0.5 - 16}L${w - 0.5 - 16} ${h - 0.5}H0.5Z`;
    const colourOf = (host: Element, v: string) => {
      const p = document.createElement('span');
      p.style.color = v;
      host.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    };
    const visible = (e: Element) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed';
    for (const card of document.querySelectorAll<HTMLElement>('#hub-main [data-card-cut]')) {
      if (!visible(card)) continue;
      out.marked++;
      const name = `${card.tagName.toLowerCase()}.${[...card.classList].join('.')} "${(card.textContent ?? '').trim().slice(0, 30)}"`;
      if (card.parentElement?.closest('[data-card-cut]')) out.problems.push(`${name}: a marked card inside a marked card`);
      card.removeAttribute('data-card-cut');
      const own = getComputedStyle(card);
      const was = { colour: own.borderTopColor, position: own.position };
      card.setAttribute('data-card-cut', '');
      const cs = getComputedStyle(card);
      const edge = card.tagName === 'TR' ? card.querySelector(':scope > td > svg[data-card-edge]') : card.querySelector(':scope > svg[data-card-edge]');
      if (card.querySelector('table, [data-table-frame]')) {
        out.square++;
        if (cs.clipPath !== 'none') out.problems.push(`${name}: holds a table but is clipped`);
        if (cs.borderTopColor === 'rgba(0, 0, 0, 0)') out.problems.push(`${name}: holds a table but lost its border`);
        if (edge && getComputedStyle(edge).display !== 'none') out.problems.push(`${name}: holds a table but draws an edge`);
        continue;
      }
      const placed = was.position === 'static' ? 'relative' : was.position;
      if (cs.position !== placed) out.problems.push(`${name}: position ${cs.position}, was ${was.position}`);
      if (cs.position === 'relative') {
        // Relative is only the edge's containing block: the card sits where static flow puts it (no stray offset).
        const flow = card.getAttribute('style');
        const at = card.getBoundingClientRect();
        card.style.position = 'static';
        const still = card.getBoundingClientRect();
        if (flow === null) card.removeAttribute('style');
        else card.setAttribute('style', flow);
        if (Math.abs(at.top - still.top) > 0.5 || Math.abs(at.left - still.left) > 0.5)
          out.problems.push(`${name}: moved ${at.left - still.left},${at.top - still.top} off its place in the flow`);
      }
      if (cs.overflowX !== 'visible' && !(cs.overflowX === 'clip' && cs.overflowClipMargin !== '0px'))
        out.problems.push(`${name}: overflow ${cs.overflowX} ${cs.overflowClipMargin} clips its own edge`);
      if (!/polygon\(.*16px.*16px/.test(cs.clipPath)) out.problems.push(`${name}: clip-path ${cs.clipPath}`);
      if (cs.borderTopColor !== 'rgba(0, 0, 0, 0)' || cs.borderBottomColor !== 'rgba(0, 0, 0, 0)') out.problems.push(`${name}: CSS border still coloured`);
      if (cs.borderTopWidth !== '1px') out.problems.push(`${name}: border width ${cs.borderTopWidth}, the layout moved`);
      if (!edge) {
        out.problems.push(`${name}: no edge`);
        continue;
      }
      if (card.tagName !== 'TR' && card.firstElementChild !== edge) out.problems.push(`${name}: the edge is not the first child`);
      const r = card.getBoundingClientRect();
      const e = edge.getBoundingClientRect();
      // The edge is the card's layout box floored to whole pixels (CutFrame useFrameSize: an offset size rounds a fractional
      // box up and puts the line on the clipped edge), so it is up to a pixel smaller than a fractional card, never larger.
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (Math.abs(r.left - e.left) > 0.5 || Math.abs(r.top - e.top) > 0.5 || Math.abs(w - e.width) > 0.5 || Math.abs(h - e.height) > 0.5)
        out.problems.push(`${name}: edge ${e.left},${e.top} ${e.width}x${e.height} vs card ${r.left},${r.top} ${r.width}x${r.height}`);
      const d = edge.querySelector('path')?.getAttribute('d');
      if (d !== path(w, h)) out.problems.push(`${name}: path ${d} for ${w}x${h}`);
      const stroke = getComputedStyle(edge.querySelector('path')!).stroke;
      if (stroke !== was.colour) out.problems.push(`${name}: stroke ${stroke}, its own border colour ${was.colour}`);
      const named = colourOf(card, 'var(--card-edge)');
      if (named !== was.colour) out.problems.push(`${name}: --card-edge ${named}, its own border colour ${was.colour}`);
      if (getComputedStyle(edge).pointerEvents !== 'none') out.problems.push(`${name}: the edge takes the pointer`);
      out.drawn++;
    }
    return out;
  });
}

const PAGES: readonly (readonly [string, string, (page: Page) => Promise<void>])[] = [
  ['Home widgets', '/', async () => undefined],
  ['Account settings cards', '/account', async () => undefined],
  ['Servers cards', '/computers/servers', async (page) => choosePresentation(page.locator('#hub-main'), 'cards')],
  ['Home welcome (a card that hides its overflow)', '/home?intro=1', async () => undefined],
  // /scripts/new mints a draft and opens its flow (a draft id this tab does not hold is the "can't be opened" state).
  ['New script flow', '/scripts/new', async () => undefined],
];

for (const theme of ['light', 'dark'] as const)
  for (const width of [1350, 2400, 390]) {
    test.describe(`the card corner at ${width} (${theme})`, () => {
      test.use({ viewport: { width, height: 1000 } });
      for (const [what, path, prepare] of PAGES)
        test(`${what}: every outermost card has one continuous cut frame in its own colour`, async ({ page }) => {
          await gotoHub(page, path, { theme });
          await prepare(page);
          await expect(page.locator('#hub-main [data-card-cut]:visible').first()).toBeVisible(); // reason: the page has drawn its cards
          await expect(page.locator('#hub-main [data-skeleton]')).toHaveCount(0, { timeout: 20_000 }); // judged loaded, never on placeholders
          await expect.poll(async () => (await judge(page)).problems).toEqual([]);
          const seen = await judge(page);
          expect(seen.drawn, `${what}: cards drawn`).toBeGreaterThan(0);
        });
    });
  }

test.describe('the card corner follows its card', () => {
  test.use({ viewport: { width: 1350, height: 1000 } });
  test('redrawn when the window narrows and the cards change size', async ({ page }) => {
    await gotoHub(page, '/account');
    const card = page.locator('#hub-main [data-card-cut]').first(); // reason: any settings card
    await expect(card).toBeVisible();
    const before = await card.evaluate((c) => (c as HTMLElement).offsetWidth);
    await page.setViewportSize({ width: 900, height: 1000 });
    await expect.poll(() => card.evaluate((c) => (c as HTMLElement).offsetWidth)).not.toBe(before);
    await expect.poll(async () => (await judge(page)).problems).toEqual([]);
  });

  test('a focused card row draws its ring inside the cut frame, never an outline it would clip', async ({ page }) => {
    await gotoHub(page, '/computers/servers', { state: 'serversKinds' });
    await choosePresentation(page.locator('#hub-main'), 'cards');
    await page.locator('#hub-main tbody tr[data-card-cut]').first().focus(); // reason: the first card row
    await page.keyboard.press('ArrowDown'); // a keyboard move: the focus is visible
    const row = page.locator('#hub-main tbody tr[data-card-cut]:focus');
    await expect(row).toHaveCount(1);
    expect(await row.evaluate((r) => r.matches(':focus-visible'))).toBe(true);
    const ring = row.locator('svg[data-card-edge] path').nth(1); // reason: the edge's second path is the ring
    await expect(ring).toBeVisible();
    expect(await row.evaluate((r) => getComputedStyle(r).outlineStyle)).toBe('none');
    const [stroke, focus] = await ring.evaluate((p) => {
      const s = document.createElement('span');
      s.style.color = 'var(--hx-focus)';
      document.body.appendChild(s);
      const f = getComputedStyle(s).color;
      s.remove();
      return [getComputedStyle(p).stroke, f];
    });
    expect(stroke).toBe(focus);
    await page.locator('#hub-main h1').first().click(); // reason: move focus off the row
    await expect(ring).toBeHidden();
  });

  test('a card that hides its overflow (Home welcome) clips at its border box, so its edge shows', async ({ page }) => {
    await gotoHub(page, '/home?intro=1');
    const card = page.locator('#hub-main [data-card-cut]:has(#home-welcome-lead)');
    await expect(card).toBeVisible();
    expect(await card.evaluate((c) => [getComputedStyle(c).overflowX, getComputedStyle(c).overflowClipMargin])).toEqual(['clip', '1px']);
    await expect.poll(async () => (await judge(page)).problems).toEqual([]);
  });

  test('a class change at the same size is followed at once: the card carries no style of the corner', async ({ page }) => {
    // The Account summary in its phone layout (the New Script form with its sticky review card is gone): the rule
    // injected below switches the card's position at the same size, and the corner must follow at once.
    await page.setViewportSize({ width: 390, height: 1000 });
    await gotoHub(page, '/account');
    const card = page.locator('#hub-main [data-card-cut][class*="settingsSummaryCard"]');
    await expect(card).toBeVisible();
    const seen = await card.evaluate((c) => {
      const tag = document.createElement('style');
      tag.textContent = '[data-card-cut][data-d4-switch] { position: sticky; inset-block-start: 3px; }';
      document.head.appendChild(tag);
      const w = (c as HTMLElement).offsetWidth;
      c.setAttribute('data-d4-switch', '');
      const switched = getComputedStyle(c).position;
      c.removeAttribute('data-d4-switch');
      const back = getComputedStyle(c).position;
      tag.remove();
      return { switched, back, same: (c as HTMLElement).offsetWidth === w, style: c.getAttribute('style') };
    });
    expect(seen).toEqual({ switched: 'sticky', back: 'relative', same: true, style: null });
  });

  test('a focused control flush in the bottom-right corner of a card keeps a visible focus ring', async ({ page }) => {
    await gotoHub(page, '/');
    await expect(page.locator('#hub-main [data-skeleton]')).toHaveCount(0, { timeout: 20_000 }); // judged loaded, never on placeholders
    const card = page.locator('#hub-main [data-card-cut]:not(:has(table))').first(); // reason: the first cut Home card
    await expect(card).toBeVisible();
    // The worst case no page has today: a control on the card's bottom-right corner, with no padding around it.
    await card.evaluate((c) => {
      const b = document.createElement('button');
      b.id = 'd4-flush';
      b.textContent = 'Flush';
      b.style.cssText = 'position:absolute;inset-inline-end:0;inset-block-end:0;margin:0';
      c.appendChild(b);
    });
    const flush = page.locator('#d4-flush');
    await flush.scrollIntoViewIfNeeded();
    // Read before focus: the button's box with a 6 px margin kept inside the viewport, the button's place in that
    // clip, the page scroll, the direction and the focus colour.
    const at = await flush.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const x0 = Math.max(0, Math.floor(r.left - 6)), y0 = Math.max(0, Math.floor(r.top - 6));
      const x1 = Math.min(innerWidth, Math.ceil(r.right + 6)), y1 = Math.min(innerHeight, Math.ceil(r.bottom + 6));
      const probe = document.createElement('span');
      probe.style.color = 'var(--hx-focus)';
      b.parentElement!.appendChild(probe);
      const focus = getComputedStyle(probe).color;
      probe.remove();
      return {
        clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        box: { x: Math.round(r.left) - x0, y: Math.round(r.top) - y0, w: Math.round(r.width), h: Math.round(r.height) },
        scroll: [scrollX, scrollY],
        rtl: getComputedStyle(b).direction === 'rtl',
        focus,
      };
    });
    const before = await page.screenshot({ clip: at.clip, scale: 'css' });
    await page.keyboard.press('Tab'); // keyboard modality: focus is visible
    await flush.focus();
    expect(await flush.evaluate((b) => b.matches(':focus-visible'))).toBe(true);
    expect(await page.evaluate(() => [scrollX, scrollY]), 'focusing the control does not scroll the page').toEqual(at.scroll);
    const after = await page.screenshot({ clip: at.clip, scale: 'css' });
    // The ring's top and inline-start sides lie 1-5 px outside the button, inside the cut frame (its bottom and end
    // sides fall past the cut by design). Pixels close to --hx-focus count (CIE76 delta E within 12, so an antialiased
    // ring still counts). Each side is judged on its own: its longest run of such pixels along the side, in any line of
    // its band, over the button's own span.
    const blank = await page.context().newPage(); // about:blank: no page CSP between the PNG and the canvas
    const sides = (png: Buffer) =>
      blank.evaluate(async ([b64, focus, rtl, box]) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const g = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
        g.drawImage(img, 0, 0);
        const { data, width, height } = g.getImageData(0, 0, img.width, img.height);
        const lab = (r: number, gr: number, b: number) => {
          const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          const [R, G, B] = [lin(r), lin(gr), lin(b)];
          const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
          const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
          const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
          const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
          return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as const;
        };
        const [fr = 0, fg = 0, fb = 0] = (focus.match(/[\d.]+/g) ?? []).map(Number);
        const want = lab(fr, fg, fb);
        const near = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= width || y >= height) return false;
          const i = (y * width + x) * 4;
          const got = lab(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
          return Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]) <= 12;
        };
        // The longest run along each line of a band; lines are offsets 1-5 px outside the button's edge.
        const run = (line: (off: number, k: number) => [number, number], span: number) => {
          let best = 0;
          for (let off = 1; off <= 5; off++)
            for (let k = 0, cur = 0; k < span; k++) best = Math.max(best, (cur = near(...line(off, k)) ? cur + 1 : 0));
          return best;
        };
        const top = run((off, k) => [box.x + k, box.y - off], box.w);
        const start = run((off, k) => [rtl ? box.x + box.w - 1 + off : box.x - off, box.y + k], box.h);
        return { top, start };
      }, [png.toString('base64'), at.focus, at.rtl, at.box] as const);
    const ring = { before: await sides(before), after: await sides(after) };
    await blank.close();
    expect(ring.before, 'no focus colour beside the button before focus').toEqual({ top: 0, start: 0 });
    expect(ring.after.top, 'the focus ring shows its top side, along at least half the button').toBeGreaterThanOrEqual(at.box.w / 2);
    expect(ring.after.start, 'the focus ring shows its start side, along at least half the button').toBeGreaterThanOrEqual(at.box.h / 2);
  });

  for (const [what, path, selector] of [
    ['the Account summary', '/account', '#hub-main [data-card-cut][class*="settingsSummaryCard"]'],
    // The New Script form and its sticky review card are gone; Home welcome is a card with its own overflow clip.
    ['the Home welcome', '/home?intro=1', '#hub-main [data-card-cut]:has(#home-welcome-lead)'],
  ] as const)
    for (const width of [390, 1350])
      test(`${what} at ${width} px sits where its own layout puts it, never offset by the corner`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await gotoHub(page, path);
        const card = page.locator(selector);
        await expect(card).toBeVisible();
        const moved = await card.evaluate((c) => {
          const at = c.getBoundingClientRect();
          const style = c.getAttribute('style');
          // The card's own CSS alone (no cut-corner placement): no mark and no style written on it.
          c.removeAttribute('data-card-cut');
          c.removeAttribute('style');
          const own = c.getBoundingClientRect();
          c.setAttribute('data-card-cut', '');
          if (style !== null) c.setAttribute('style', style);
          return [Math.round(at.left - own.left), Math.round(at.top - own.top)];
        });
        expect(moved).toEqual([0, 0]);
      });

  test('the Computers cards keep their own frame and no second corner', async ({ page }) => {
    await gotoHub(page, '/computers');
    await choosePresentation(page.locator('#hub-main'), 'cards');
    const frames = page.locator('#hub-main [data-cut-edge]');
    await expect(frames.first()).toBeVisible(); // reason: the framed cards drew
    expect(await page.locator('#hub-main tr[data-card-cut]:has([data-cut-edge]), #hub-main [data-cut-edge] [data-card-edge]').count()).toBe(0);
  });
});
