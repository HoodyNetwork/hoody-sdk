// Playwright: the secondary strip, measured as drawn in both themes on its kit specimen (the gallery's Actions tab: "Use
// with your agent", More, then the New entry primary). "Use with your agent" and More are plates side by side at the header button height (32 px, the height of the primary beside them) on one shared line
// (the More button has no start edge), square, with no gap; only the strip's last button carries the cut; the pointer
// darkens the plate; keyboard focus keeps the ring, drawn whole over the neighbour; New entry follows outside the strip. The plates are painted backgrounds, so
// their colours are read off the screen and compared with the tokens (a probe reads them in each theme); light also
// checks the literal values (#e3e3e3 in a #7a7a7a frame, #d6d6d6 under the pointer).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';

async function token(page: Page, name: string, prop: 'color' | 'background-color' = 'color') {
  return page.evaluate(
    ([n, p]) => {
      const d = document.createElement('div');
      d.style.setProperty(p as string, `var(${n})`);
      document.body.append(d);
      const c = getComputedStyle(d);
      const v = p === 'color' ? c.color : c.backgroundColor;
      d.remove();
      return v;
    },
    [name, prop],
  );
}

async function drawn(l: Locator) {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      h: Math.round(r.height),
      left: r.left,
      right: r.right,
      y: r.top,
      bottom: r.bottom,
      start: c.borderLeftWidth,
      radius: c.borderTopLeftRadius,
      shadow: c.boxShadow,
      clip: c.clipPath,
    };
  });
}

/** The colours drawn at some page pixels, from ONE screenshot of the box around them, decoded in the page (so each reads
 * as getComputedStyle writes a colour). Animations disabled: the ring's box-shadow transition is finished, never
 * sampled half-grown. */
async function pixels(page: Page, points: { x: number; y: number }[]): Promise<string[]> {
  const x0 = Math.min(...points.map((p) => p.x));
  const y0 = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - x0 + 1;
  const height = Math.max(...points.map((p) => p.y)) - y0 + 1;
  const b64 = (await page.screenshot({ clip: { x: x0, y: y0, width, height }, animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ src, w, h, at }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // The image may be at the device's pixel ratio: scale each page pixel into it.
      const sx = img.naturalWidth / w;
      const sy = img.naturalHeight / h;
      return at.map(({ x, y }) => {
        const [r, g, b] = ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      });
    },
    { src: b64, w: width, h: height, at: points.map((p) => ({ x: p.x - x0, y: p.y - y0 })) },
  );
}

/** A plate's painted pixels, counted from the box the browser snaps it to: its fill (2 px inside the start line at mid
 * height), its top line, and the pixels of its bottom end corner, `i` in from the end line and `j` up from the bottom. */
async function plate(page: Page, l: Locator, corner: [number, number][] = []) {
  const d = await drawn(l);
  const [left, right, top, bottom] = [Math.round(d.left), Math.round(d.right) - 1, Math.round(d.y), Math.round(d.bottom) - 1];
  const midY = Math.round((top + bottom) / 2);
  const [fill = '', line = '', ...at] = await pixels(page, [{ x: left + 2, y: midY }, { x: Math.round((left + right) / 2), y: top }, ...corner.map(([i, j]) => ({ x: right - i, y: bottom - j }))]);
  return { fill, line, at };
}

/** A strip plate's cut is 9 px. As plates.spec.ts cutFaults reads a grey plate: the diagonal walked from the end line
 * (k = 0) to the bottom line is a soft outer stair at (k, CUT-1-k) (the frame mixed into the surface: neither the surface
 * nor the plate), then two unbroken stairs of the frame at (k+1, CUT-1-k) and (k+1, CUT-k) (Button.module.css
 * --plate-cut-grow / --plate-cut-soft, pinned by Button.glyph.css.test.ts). */
const CUT = 9;
const STEPS = Array.from({ length: CUT }, (_, k) => k);
const SOFT: [number, number][] = STEPS.map((k) => [k, CUT - 1 - k]);
const STAIRS: [number, number][] = STEPS.flatMap((k): [number, number][] => [[k + 1, CUT - 1 - k], [k + 1, CUT - k]]);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the secondary strip at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`the strip specimen as drawn (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      const group = page.getByRole('group', { name: gallery['strip.label'] });
      const more = group.getByRole('button', { name: gallery['strip.more'] });
      await more.waitFor({ timeout: 15_000 });
      await group.scrollIntoViewIfNeeded(); // the specimen sits down the Actions tab; its pixels are read from the viewport
      const agent = group.getByRole('button').first(); // reason: the strip's first button is the specimen's agent button
      const fill = await token(page, '--hx-btn-plate', 'background-color');
      const line = await token(page, '--hx-btn-line');
      const a = await drawn(agent);
      const m = await drawn(more);
      for (const [name, d] of [['agent', a], ['more', m]] as const) expect([d.h, d.radius, d.shadow, d.clip], name).toEqual([32, '0px', 'none', 'none']);
      // Each is a plate: the plate fill inside the plate line.
      const pa = await plate(page, agent, [[0, 0], [1, 1]]);
      const pm = await plate(page, more, [[0, 0], ...SOFT, ...STAIRS, [CUT, 0], [0, CUT]]);
      for (const [name, p] of [['agent', pa], ['more', pm]] as const) expect([p.fill, p.line], name).toEqual([fill, line]);
      if (theme === 'light') expect([pa.fill, pa.line]).toEqual(['rgb(227, 227, 227)', 'rgb(122, 122, 122)']);
      expect(a.start).toBe('1px');
      expect(m.start).toBe('0px'); // one shared line: the agent button's end edge
      expect(Math.abs(m.left - a.right)).toBeLessThan(0.5); // joined, no gap
      // Only the strip's last button carries the cut. The agent button's bottom end corner is square (its lines meet
      // there); More's shows what is behind the strip, and its frame runs down the diagonal to both lines.
      expect(pa.at, 'agent: a square corner').toEqual([line, fill]);
      const [corner, ...rest] = pm.at;
      expect(corner, 'more: the corner shows the surface').not.toBe(line);
      expect(corner, 'more: the corner shows the surface').not.toBe(fill);
      const soft = rest.slice(0, CUT);
      for (const [k, c] of soft.entries()) expect([c === corner, c === fill], `more: the soft outer stair ${k}: neither the surface nor the plate`).toEqual([false, false]);
      expect(rest.slice(CUT), 'more: two frame stairs down the diagonal, then the bottom line and the end line it joins').toEqual(Array.from({ length: 2 * CUT + 2 }, () => line));
      // New entry: outside the strip, after it.
      const add = page.getByRole('button', { name: gallery['strip.new'] });
      expect(await group.evaluate((g, b) => !g.contains(b as Node), await add.elementHandle())).toBe(true);
      const primary = await drawn(add);
      expect(primary.left).toBeGreaterThan(m.right);
      expect([primary.h, Math.abs(primary.y - m.y) < 0.5], 'the strip is the height of the primary beside it, on its line').toEqual([32, true]);
      // Under the pointer: the darker plate inside the full-ink frame.
      await more.hover();
      await expect(more).toHaveAttribute('data-hovered', 'true');
      await expect.poll(async () => (await plate(page, more)).fill).toBe(await token(page, '--hx-btn-plate-hover', 'background-color'));
      const over = await plate(page, more);
      expect(over.line).toBe(await token(page, '--hx-btn-line-hover'));
      if (theme === 'light') expect(over.fill).toBe('rgb(214, 214, 214)');
      // Keyboard focus keeps the ring.
      await page.mouse.move(0, 0);
      await agent.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect.poll(async () => (await drawn(agent)).shadow).not.toBe('none');
      // The ring is drawn whole: the 2 px focus colour 2 px past the agent button's end edge lies over the More button,
      // and it is the ring there, not More's plate painted over it.
      const f = await drawn(agent);
      const [px] = await pixels(page, [{ x: Math.round(f.right) + 3, y: Math.round((f.y + f.bottom) / 2) }]);
      expect(px).toBe(await token(page, '--hx-focus', 'background-color'));
    });
  });
}
