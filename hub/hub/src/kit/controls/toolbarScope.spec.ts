// Playwright: the toolbar size scope and its inner boundary. The gallery's controls tab draws one row of toolbar controls
// in every nesting: outside any scope, in a 32 scope, in a default Toolbar (size omitted or explicit) inside it, and in a
// default ToolbarScope inside it with a 32 scope back inside that. Each row reads as what its nearest scope asked for, in
// each theme with each pointer: control height, segmented track height and the disabled look (one recipe at every size:
// the outside look, the plate at --ctl-off-opacity, read off the screen because a plate is a painted background).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const DEFAULT = { fine: 40, coarse: 44 };
const SMALL = { fine: 32, coarse: 44 };
const ROWS: [string, 'default' | '32'][] = [
  ['outside', 'default'],
  ['toolbar-default-alone', 'default'],
  ['scope-32', '32'],
  ['toolbar-default-in-32', 'default'],
  ['toolbar-explicit-default-in-32', 'default'],
  ['toolbar-32-in-32', '32'],
  ['scope-default-in-32', 'default'],
  ['scope-32-in-default-in-32', '32'],
];

/** What a row's disabled control paints, and what lies just before it: ONE screenshot of its box and 3 px before it,
 *  decoded in the page. `fill` is 2 px inside the start line at mid height, `line` the top line, `beside` the surface. */
async function offPlate(page: Page, name: string): Promise<{ fill: string; line: string; beside: string }> {
  const off = page.locator(`[data-scope-probe="${name}"] [data-scope-off]`);
  // The middle of the view: clear of the bars fixed to its edges (a phone's bottom bar is drawn over the page).
  await off.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  const r = (await off.boundingBox())!;
  const clip = { x: Math.round(r.x) - 3, y: Math.round(r.y), width: Math.round(r.x + r.width) - Math.round(r.x) + 3, height: Math.round(r.y + r.height) - Math.round(r.y) };
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
      return { fill: at(3 + 2, h >> 1), line: at(3 + ((w - 3) >> 1), 0), beside: at(0, h >> 1) };
    },
    { src: b64, w: clip.width, h: clip.height },
  );
}

for (const theme of ['light', 'dark'] as const)
  for (const pointer of ['fine', 'coarse'] as const)
    test.describe(`toolbar size scope: ${theme}, ${pointer} pointer`, () => {
      if (pointer === 'coarse') test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test('every row reads as its nearest scope, at any depth', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=controls', { theme });
        await page.locator('[data-scope-probe="scope-32-in-default-in-32"]').waitFor();
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(pointer === 'coarse');
        const got = await page.evaluate((names) => {
          const box = (el: Element | null | undefined) => (el ? Math.round(el.getBoundingClientRect().height) : -1);
          return names.map((name) => {
            const row = document.querySelector(`[data-scope-probe="${name}"]`);
            const [text, icon, off] = [...(row?.querySelectorAll('button') ?? [])];
            const cs = off ? getComputedStyle(off) : null;
            return {
              name,
              text: box(text),
              icon: box(icon),
              off: box(off),
              track: box(row?.querySelector('[role="radiogroup"]')),
              offStyle: cs?.borderTopStyle ?? '',
              offOpacity: cs?.opacity ?? '',
            };
          });
        }, ROWS.map(([n]) => n));
        const byName = new Map(got.map((g) => [g.name, g]));
        const outside = byName.get('outside')!;
        const outsidePlate = await offPlate(page, 'outside');
        expect(outsidePlate.fill, 'the default disabled control keeps a fill').not.toBe(outsidePlate.beside);
        expect(outsidePlate.line, 'and a line around it').not.toBe(outsidePlate.beside);
        expect(outside.offOpacity, 'the kit disabled recipe (--ctl-off-opacity)').toBe('0.5');
        // The disabled look is the kit's grey plate and its line at half strength over whatever the row sits on. A row's
        // surface can differ by scope, so each row's paint is compared with that mix over its own surface (each channel
        // within 1: the compositor rounds a half either way).
        const [plateInk, lineInk] = await page.evaluate(() =>
          ['--hx-btn-plate', '--hx-btn-line'].map((tok) => {
            const probe = document.createElement('span');
            probe.style.color = `var(${tok})`;
            document.body.append(probe);
            const v = getComputedStyle(probe).color;
            probe.remove();
            return v;
          }),
        );
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const offBy = (painted: string, ink: string, under: string) => Math.max(...rgb(painted).map((v, i) => Math.abs(v - (rgb(ink)[i]! + rgb(under)[i]!) / 2)));
        for (const [name, size] of ROWS) {
          const g = byName.get(name)!;
          const h = (size === '32' ? SMALL : DEFAULT)[pointer];
          expect({ name, text: g.text, icon: g.icon, off: g.off }, 'the controls follow the nearest scope').toEqual({ name, text: h, icon: h, off: h });
          // The segmented track is the same height as a toolbar control; a coarse pointer's option keeps its own 44 hit, tested in strip.toggle-group-px-field.
          if (pointer === 'fine') expect({ name, track: g.track }, 'the segmented track follows it too').toEqual({ name, track: h });
          // One disabled recipe: no dashed look at any size. The same plate and line as outside, as painted.
          const p = await offPlate(page, name);
          expect({ name, style: g.offStyle, o: g.offOpacity }, 'disabled at any size: the outside look').toEqual({ name, style: 'solid', o: outside.offOpacity });
          expect({ name, fill: offBy(p.fill, plateInk!, p.beside) <= 1, line: offBy(p.line, lineInk!, p.beside) <= 1, painted: p }, 'the grey plate and its line at half strength, in every scope').toEqual({ name, fill: true, line: true, painted: p });
        }
      });
    });
