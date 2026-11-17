// Playwright: every primary and secondary button is a slanted plate with its glyph inside, as drawn, in both themes.
// Secondary is the grey plate (#e3e3e3 in a #7a7a7a frame in light); a button is 32 tall and a small one 28; the label
// is 13 px mono uppercase with 0.3 px tracking; a "New ..." button shows the plus, another the arrow, and neither keeps
// its start icon; under the pointer the plate darkens inside a full-ink frame and nothing moves; the name stays the
// label and the focus ring shows. The plate is a painted background, so its colours are read off the screen.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';
import notes from '../../pages/notes/strings.en.json';

const PLUS = 'M4 0H6V4H10V6H6V10H4V6H0V4H4V0Z';
/** A named specimen of the gallery's button marks (the actions tab repeats some names in its other panels). */
const btn = (page: Page, name: string) => page.locator('[data-gallery="button-marks"]').getByRole('button', { name, exact: true });

/** A token resolved by the browser in the button's scope, as getComputedStyle reports a background. */
const bgOf = (scope: Locator, token: string) =>
  scope.evaluate((el, tok) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${tok})`;
    el.parentElement!.appendChild(probe);
    const v = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return v;
  }, token);

/** The focus ring as the browser resolves it in the button's scope. */
const focusRing = (scope: Locator) =>
  scope.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.boxShadow = 'var(--focus-ring)';
    el.parentElement!.appendChild(probe);
    const v = getComputedStyle(probe).boxShadow;
    probe.remove();
    return v;
  });

/** What a plate paints, read off the screen: its fill (2 px inside the start line, at mid height) and its top line.
 *  One screenshot of the plate as the browser snaps it to whole pixels, decoded in the page. */
async function plate(page: Page, b: Locator): Promise<{ fill: string; line: string }> {
  // The middle of the view, clear of the bars fixed to its edges; a second call moves nothing, so a pointer already
  // over the button stays over it.
  await b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  const r = (await b.boundingBox())!;
  const clip = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.x + r.width) - Math.round(r.x), height: Math.round(r.y + r.height) - Math.round(r.y) };
  const b64 = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
  return page.evaluate(
    async ({ src, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // The image may be at the device's pixel ratio: scale each page pixel into it.
      const at = (x: number, y: number) => {
        const [r, g, b] = ctx.getImageData(Math.floor((x * img.naturalWidth) / w), Math.floor((y * img.naturalHeight) / h), 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      return { fill: at(2, h >> 1), line: at(w >> 1, 0) };
    },
    { src: b64, w: clip.width, h: clip.height },
  );
}

const look = (b: Locator) =>
  b.evaluate((el) => {
    const c = getComputedStyle(el);
    const label = el.querySelector('[data-btn-label]')!.getBoundingClientRect();
    const mark = el.querySelector('[data-glyph-mark]')!;
    const glyph = mark.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      h: Math.round(r.height),
      glyph: `${Math.round(glyph.width)}x${Math.round(glyph.height)}`,
      glyphInside: glyph.left >= label.right && glyph.right < r.right && glyph.top > r.top && glyph.bottom < r.bottom,
      size: c.fontSize,
      family: c.fontFamily,
      tracking: c.letterSpacing,
      upper: c.textTransform,
      startIcon: el.querySelector(':scope > svg') !== null,
      mark: mark.querySelector('path')?.getAttribute('d') ?? '',
    };
  });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`plate buttons at 1350 (${theme})`, () => {
    test.use({ viewport: { width: 1350, height: 900 } });

    test(`secondary is the grey plate, 32 tall and 28 small, the glyph inside after the label, the label 13 px mono caps 0.3 px (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme });
      for (const [name, h] of [
        [gallery['btn.secondary'], 32],
        [gallery['btn.small'], 28],
      ] as const) {
        const b = btn(page, name);
        await b.waitFor();
        expect(await b.getAttribute('data-glyph'), name).not.toBeNull();
        const l = await look(b);
        expect([l.h, l.glyph, l.glyphInside], name).toEqual([h, '12x12', true]);
        const p = await plate(page, b);
        expect(p.fill, name).toBe(await bgOf(b, '--hx-btn-plate'));
        expect(p.line, name).toBe(await bgOf(b, '--hx-btn-line'));
        expect([l.size, l.tracking, l.upper], name).toEqual(['13px', '0.3px', 'uppercase']);
        expect(l.family, name).toMatch(/mono/i);
      }
      if (theme === 'light') {
        const p = await plate(page, btn(page, gallery['btn.secondary']));
        expect([p.fill, p.line]).toEqual(['rgb(227, 227, 227)', 'rgb(122, 122, 122)']);
      }
    });

    test(`under the pointer the plate darkens inside a full-ink frame and the button does not move (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme });
      const b = btn(page, gallery['btn.secondary']);
      await b.waitFor();
      await b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })); // where plate() reads it, so nothing scrolls under the pointer
      const y0 = (await b.boundingBox())!.y;
      await b.hover();
      await expect(b).toHaveAttribute('data-hovered', 'true');
      const p = await plate(page, b);
      expect(p.fill).toBe(await bgOf(b, '--hx-btn-plate-hover'));
      expect(p.line).toBe(await bgOf(b, '--hx-btn-line-hover'));
      expect(p.fill, 'a darker step than at rest').not.toBe(await bgOf(b, '--hx-btn-plate'));
      expect((await b.boundingBox())!.y - y0, 'no lift').toBe(0);
      expect(await b.evaluate((el) => [getComputedStyle(el).transform, getComputedStyle(el).boxShadow])).toEqual(['none', 'none']);
    });

    test(`"New note" shows the plus, the primary the arrow, neither keeps its start icon; name and focus ring hold (${theme})`, async ({ page }) => {
      await gotoHub(page, '/notes', { theme });
      const nb = page.getByRole('button', { name: new RegExp(`^${notes['action.new']}`) }).first(); // the header primary (its name may carry a shortcut hint); an empty list repeats it
      await nb.waitFor();
      const n = await look(nb);
      expect(n.mark).toBe(PLUS);
      expect(n.startIcon).toBe(false);
      await gotoHub(page, '/_kit?tab=actions', { theme });
      const p = btn(page, gallery['btn.primary']);
      await p.waitFor();
      const l = await look(p);
      expect(l.mark).not.toBe(PLUS);
      expect(l.mark).not.toBe('');
      expect(l.startIcon).toBe(false);
      await expect(p).toHaveAccessibleName(gallery['btn.primary']);
      await p.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(p).toBeFocused();
      // The computed shadow equals --focus-ring resolved in the button's scope, polled because the ring eases in.
      await expect(p).toHaveAttribute('data-focus-visible', 'true');
      const ring = await focusRing(p);
      await expect.poll(() => p.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(ring);
    });
  });
}
