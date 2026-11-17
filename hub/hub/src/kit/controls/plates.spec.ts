// Playwright: the kit buttons as drawn, the "Slanted plates" family. Every button is one square plate with a cut at its
// bottom end, painted as a background, so the plate, its frame and its cut are read off the screen (a screenshot of the
// button's box), never from background-color. Measured in the gallery's Buttons panel at 1350 and 390, light and dark:
// the heights (md 32, sm 28, xs 24, a toolbar control 40, a three-dot 28 x 28; on a coarse pointer at least 44 both ways
// for a button with words and 44 x 44 for an icon button), the plate and frame colours at rest, under the pointer and
// pressed, the cut (9 px, 7 px on small plates; the corner shows the surface behind and the frame runs unbroken down
// the diagonal from the end line to the bottom line), the end glyph inside the plate after the label, the focus ring,
// the disabled look and the label's contrast on every plate. Then the places that hold a button in a
// layout of their own: a dialog footer, the Bots notice and the phone's floating button.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';
import overlays from '../gallery/overlays.strings.en.json';
import bots from '../../pages/bots/strings.en.json';

type Theme = 'light' | 'dark';

/** The plus glyph's path (a "New ..." or "Add" button's end glyph). */
const PLUS = 'M4 0H6V4H10V6H6V10H4V6H0V4H4V0Z';

/** The design's colours, as the screen shows them. The tokens must resolve to these, and the plates must paint them. */
const LOOK = {
  light: { plate: '#e3e3e3', hover: '#d6d6d6', press: '#cacaca', line: '#7a7a7a', lineOn: '#101010', acc: '#eeff22', accHover: '#e3f30c', accPress: '#d3e300', accLine: '#101010', focus: '#0741ff' },
  dark: { plate: '#222225', hover: '#2d2d31', press: '#38383d', line: '#6d6d70', lineOn: '#ededed', acc: '#eeff22', accHover: '#e3f30c', accPress: '#d3e300', accLine: '#eeff22', focus: '#8aa4ff' },
} as const;
const TOKENS: [keyof (typeof LOOK)['light'], string][] = [
  ['plate', '--hx-btn-plate'],
  ['hover', '--hx-btn-plate-hover'],
  ['press', '--hx-btn-plate-press'],
  ['line', '--hx-btn-line'],
  ['lineOn', '--hx-btn-line-hover'],
  ['acc', '--hx-acc'],
  ['accHover', '--hx-acc-hover'],
  ['accPress', '--hx-acc-press'],
  ['accLine', '--hx-btn-primary-line'],
  ['focus', '--hx-focus'],
];

/** The matrix's rows, top to bottom: a row per size, then per state at the medium size. */
const ROWS = ['md', 'sm', 'xs', 'toolbar', 'disabled', 'soft', 'busy'] as const;
type Row = (typeof ROWS)[number];
type Kind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'primaryDanger' | 'row';
/** The icon matrix's rows: the sizes, the toggled state, then the same states. */
const ICON_ROWS = ['md', 'sm', 'xs', 'toolbar', 'pressed', 'disabled', 'soft', 'busy'] as const;
type IconKind = 'refresh' | 'edit' | 'add' | 'delete';

const matrix = (page: Page) => page.locator('[data-gallery="buttons"]');
const marks = (page: Page) => page.locator('[data-gallery="button-marks"]');
const icons = (page: Page) => page.locator('[data-gallery="icon-buttons"]');
/** A matrix specimen: the kind's column in a size's or state's row. */
const specimen = (page: Page, kind: Kind, row: Row) => matrix(page).getByRole('button', { name: gallery[`kind.${kind}`], exact: true }).nth(ROWS.indexOf(row)); // reason: every row repeats the kind's name as its label; the rows come in ROWS order
const iconSpecimen = (page: Page, kind: IconKind, row: (typeof ICON_ROWS)[number]) => icons(page).getByRole('button', { name: gallery[`icon.${kind}`], exact: true }).nth(ICON_ROWS.indexOf(row)); // reason: every row repeats the icon's name; the rows come in ICON_ROWS order
/** The three-dot buttons under the icon matrix: asked for md, for sm and for a toolbar, in that order. */
const threeDot = (page: Page, asked: 'md' | 'sm' | 'toolbar') => icons(page).locator('xpath=..').getByRole('button', { name: gallery['icon.more'], exact: true }).nth(['md', 'sm', 'toolbar'].indexOf(asked)); // reason: three buttons of one name, in the order the panel draws them
const mark = (page: Page, key: keyof typeof gallery) => marks(page).getByRole('button', { name: gallery[key], exact: true });

async function open(page: Page, theme: Theme) {
  await gotoHub(page, '/_kit?tab=actions', { theme });
  await matrix(page).waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const hex = (rgb: string) => {
  const [r = 0, g = 0, b = 0] = (rgb.match(/[\d.]+/g) ?? []).map(Number);
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
};

/** A colour token as the browser resolves it beside the element, as #rrggbb. */
const token = async (scope: Locator, name: string) =>
  hex(
    await scope.evaluate((el, tok) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${tok})`;
      el.parentElement!.appendChild(probe);
      const v = getComputedStyle(probe).color;
      probe.remove();
      return v;
    }, name),
  );

/** WCAG contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Scrolls the button to the middle of the view: clear of the bars fixed to the view's edges (a phone's bottom bar is
 *  drawn over the page), and a second call moves nothing, so a pointer already over the button stays over it. */
const centre = (b: Locator) => b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));

interface Painted {
  /** The plate as painted, in pixels: the button's box as the browser snaps it to the screen. */
  w: number;
  h: number;
  /** What lies around the button. */
  surface: string;
  /** A pixel counted from the plate's top-left corner. */
  at(x: number, y: number): string;
  /** A pixel counted from the plate's bottom end corner, where the cut is: `i` px in from the end line, `j` px up from
   *  the bottom line. */
  end(i: number, j: number): string;
  /** A pixel counted from the plate's top-left corner that may lie outside it (negative, or past its size). */
  around(x: number, y: number): string;
}

/** What a button paints, read off the screen: ONE screenshot of its box and `margin` px around it, decoded in the page.
 *  The box may sit on a fraction of a pixel; the browser snaps the plate to whole pixels, so the plate's edges are found
 *  in the picture (the first pixels that are not the surface) and every reading is counted from them. `rtl`: the cut is
 *  at the bottom left. `ringed`: a focus ring is drawn around the plate, so the edges are the box's own, rounded as the
 *  browser snaps them. */
async function painted(page: Page, b: Locator, opts: { rtl?: boolean; margin?: number; ringed?: boolean } = {}): Promise<Painted> {
  const margin = opts.margin ?? 3;
  await centre(b);
  const r = (await b.boundingBox())!;
  const x0 = Math.floor(r.x) - margin;
  const y0 = Math.floor(r.y) - margin;
  const width = Math.ceil(r.x + r.width) + margin - x0;
  const height = Math.ceil(r.y + r.height) + margin - y0;
  const b64 = (await page.screenshot({ clip: { x: x0, y: y0, width, height }, animations: 'disabled' })).toString('base64');
  const px = await page.evaluate(
    async ({ src, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      // The image may be at the device's pixel ratio: one reading per page pixel.
      const sx = img.naturalWidth / w;
      const sy = img.naturalHeight / h;
      const out: string[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (Math.floor(y * sy) * c.width + Math.floor(x * sx)) * 4;
          out.push(`#${[d[i]!, d[i + 1]!, d[i + 2]!].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
        }
      return out;
    },
    { src: b64, w: width, h: height },
  );
  const get = (x: number, y: number) => px[y * width + x] ?? 'outside';
  const surface = get(0, 0);
  // The four corners of the picture lie outside the plate: one colour, or the readings below would mean nothing.
  expect([get(width - 1, 0), get(0, height - 1), get(width - 1, height - 1)], 'the surface around the button is one colour').toEqual([surface, surface, surface]);
  const midY = height >> 1;
  let left = Math.round(r.x) - x0;
  let right = Math.round(r.x + r.width) - 1 - x0;
  let top = Math.round(r.y) - y0;
  let bottom = Math.round(r.y + r.height) - 1 - y0;
  if (!opts.ringed) {
    left = 0;
    while (left < width && get(left, midY) === surface) left++;
    right = width - 1;
    while (right > left && get(right, midY) === surface) right--;
    // A column clear of the cut: 4 px in from the side the cut is not on.
    const col = opts.rtl ? right - 4 : left + 4;
    top = 0;
    while (top < height && get(col, top) === surface) top++;
    bottom = height - 1;
    while (bottom > top && get(col, bottom) === surface) bottom--;
  }
  return {
    w: right - left + 1,
    h: bottom - top + 1,
    surface,
    at: (x, y) => get(left + x, top + y),
    around: (x, y) => get(left + x, top + y),
    end: (i, j) => get(opts.rtl ? left + i : right - i, bottom - j),
  };
}

/** The cut as painted, for a leg of `cut` px: the corner shows the surface and the frame runs down the diagonal from the
 *  end line to the bottom line. On a grey plate (and a row's plate, whatever it is lifted to) the diagonal is a soft
 *  outer stair (the frame mixed into the surface: pixels `cut - 1` steps from the corner, counting in and up) and two
 *  unbroken stairs of the frame's own colour inside it, then the plate: wider than one line on purpose, so it never
 *  breaks up on a fractional size or under zoom. A primary plate (`exact`) keeps two unbroken stairs and no soft one.
 *  Returns every reading that is not so. */
function cutFaults(p: Painted, cut: number, frame: string, plate: string, exact = false): string[] {
  const faults: string[] = [];
  const want = (i: number, j: number, colour: string, what: string) => {
    if (p.end(i, j) !== colour) faults.push(`${what} at ${i} in, ${j} up: ${p.end(i, j)}, want ${colour}`);
  };
  // The corner itself and everything outside the diagonal: the surface behind the button.
  for (let j = 0; j <= cut - 2; j++) for (let i = 0; i + j <= cut - 2; i++) want(i, j, p.surface, 'surface');
  // The diagonal, walked from the end line (k = 0) to the bottom line (k = cut - 1): the soft outer stair (neither the
  // surface nor the plate), then the frame twice, each step touching the next, then the plate.
  for (let k = 0; k < cut; k++) {
    if (exact) {
      want(k, cut - 1 - k, frame, 'frame');
      want(k + 1, cut - 1 - k, frame, 'frame (inner stair)');
      want(k + 1, cut - k, plate, 'plate');
      continue;
    }
    const soft = p.end(k, cut - 1 - k);
    if (soft === p.surface || soft === plate) faults.push(`soft outer stair at ${k} in, ${cut - 1 - k} up: ${soft}`);
    want(k + 1, cut - 1 - k, frame, 'frame');
    want(k + 1, cut - k, frame, 'frame (inner stair)');
    want(k + 2, cut - k, plate, 'plate');
  }
  // The lines the diagonal meets: the end line above the cut and the bottom line before it.
  want(0, cut, frame, 'the end line');
  want(cut, 0, frame, 'the bottom line');
  return faults;
}

/** The button's box and what its styles say that the picture cannot. */
const box = (b: Locator) =>
  b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    const label = el.querySelector('[data-btn-label]')?.getBoundingClientRect();
    const glyph = el.querySelector('[data-glyph-mark]')?.getBoundingClientRect();
    const svg = el.querySelector('[data-glyph-mark] > svg')?.getBoundingClientRect();
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      w: round(r.width),
      h: round(r.height),
      y: round(r.y),
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      clip: c.clipPath,
      shadow: c.boxShadow,
      transform: c.transform,
      translate: c.translate,
      radius: c.borderTopLeftRadius,
      bg: c.backgroundColor,
      opacity: c.opacity,
      color: c.color,
      weight: c.fontWeight,
      size: c.fontSize,
      family: c.fontFamily,
      tracking: c.letterSpacing,
      upper: c.textTransform,
      minW: c.minInlineSize,
      label: label ? { left: label.left, right: label.right } : null,
      glyph: glyph ? { left: glyph.left, right: glyph.right, top: glyph.top, bottom: glyph.bottom, w: round(glyph.width), h: round(glyph.height) } : null,
      svg: svg ? { w: round(svg.width), h: round(svg.height) } : null,
    };
  });

/** Keyboard focus on the button: React Aria draws the ring only after a key press. */
async function keyFocus(page: Page, b: Locator) {
  await b.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(b).toBeFocused();
  await expect(b).toHaveAttribute('data-focus-visible', 'true');
}

for (const theme of ['light', 'dark'] as const)
  for (const width of [1350, 390] as const) {
    const L = LOOK[theme];

    test.describe(`plates on a fine pointer at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('the tokens are the design\'s colours', async ({ page }) => {
        await open(page, theme);
        const got: Record<string, string> = {};
        for (const [key, name] of TOKENS) got[key] = await token(matrix(page), name);
        expect(got).toEqual(L);
      });

      test('heights: md 32, sm 28, xs 24, a toolbar control 40; a three-dot 28 x 28; icon buttons are squares of their size', async ({ page }) => {
        await open(page, theme);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
        const heights: Record<string, number> = {};
        for (const kind of ['primary', 'secondary', 'ghost', 'danger', 'primaryDanger', 'row'] as const)
          for (const row of ['md', 'sm', 'xs', 'toolbar'] as const) heights[`${kind} ${row}`] = (await box(specimen(page, kind, row))).h;
        expect(heights).toEqual(Object.fromEntries(Object.keys(heights).map((k) => [k, { md: 32, sm: 28, xs: 24, toolbar: 40 }[k.split(' ')[1] as 'md' | 'sm' | 'xs' | 'toolbar']])));
        const squares: Record<string, string> = {};
        for (const kind of ['refresh', 'edit', 'add', 'delete'] as const)
          for (const row of ['md', 'sm', 'xs', 'toolbar'] as const) {
            const b = await box(iconSpecimen(page, kind, row));
            squares[`${kind} ${row}`] = `${b.w}x${b.h}`;
          }
        expect(squares).toEqual(Object.fromEntries(Object.keys(squares).map((k) => [k, { md: '32x32', sm: '28x28', xs: '24x24', toolbar: '40x40' }[k.split(' ')[1] as 'md' | 'sm' | 'xs' | 'toolbar']])));
        // A three-dot is the small plate whatever size it was asked for; a toolbar's keeps the toolbar's.
        const dots: string[] = [];
        for (const asked of ['md', 'sm', 'toolbar'] as const) {
          const b = await box(threeDot(page, asked));
          dots.push(`${b.w}x${b.h}`);
        }
        expect(dots).toEqual(['28x28', '28x28', '40x40']);
      });

      test('compact density changes no button height', async ({ page }) => {
        await open(page, theme);
        const inCompact = await matrix(page).evaluate((el) => {
          el.setAttribute('data-density', 'compact');
          const v = (n: string) => getComputedStyle(el).getPropertyValue(n).trim();
          return { row: v('--row-h') === v('--row-h-dense'), btn: v('--btn-h'), sm: v('--btn-h-sm') };
        });
        // Compact really applies there (its rows go dense), and the button heights stay.
        expect(inCompact).toEqual({ row: true, btn: '32px', sm: '28px' });
        const got: number[] = [];
        for (const row of ['md', 'sm', 'toolbar'] as const) for (const kind of ['primary', 'secondary', 'ghost'] as const) got.push((await box(specimen(page, kind, row))).h);
        expect(got).toEqual([32, 32, 32, 28, 28, 28, 40, 40, 40]);
      });

      test('a plate is square and flat: no clip-path, no shadow, no radius, no fill of its own; 13 px mono capitals', async ({ page }) => {
        await open(page, theme);
        for (const kind of ['primary', 'secondary', 'ghost', 'danger'] as const)
          for (const row of ['md', 'sm'] as const) {
            const b = await box(specimen(page, kind, row));
            const what = `${kind} ${row}`;
            expect([b.clip, b.shadow, b.radius, b.transform], what).toEqual(['none', 'none', '0px', 'none']);
            // The plate is a painted background image, so the flat colour under it stays clear.
            expect(b.bg, what).toBe('rgba(0, 0, 0, 0)');
            expect([b.size, b.tracking, b.upper, b.weight], what).toEqual(['13px', '0.3px', 'uppercase', '400']);
            expect(b.family, what).toMatch(/mono/i);
          }
      });

      test('the end glyph: inside the plate after the label, 12 x 12, on every primary and secondary at md and sm, on no other', async ({ page }) => {
        await open(page, theme);
        for (const kind of ['primary', 'secondary'] as const)
          for (const row of ['md', 'sm'] as const) {
            const s = specimen(page, kind, row);
            const what = `${kind} ${row}`;
            await expect(s, what).toHaveAttribute('data-glyph', '');
            const b = await box(s);
            expect(b.glyph, what).not.toBeNull();
            expect([b.glyph!.w, b.glyph!.h], `${what}: the glyph's box`).toEqual([12, 12]);
            // The glyph draws at its own size, centred on its box: the arrow 14 x 14, the plus 10 x 10.
            expect([{ w: 14, h: 14 }, { w: 10, h: 10 }], `${what}: the glyph at its own size`).toContainEqual(b.svg);
            expect(b.glyph!.left, `${what}: after the label`).toBeGreaterThanOrEqual(b.label!.right);
            expect(Math.round((b.glyph!.left - b.label!.right) * 10) / 10, `${what}: 10 px after the label`).toBe(10);
            // Inside the plate's frame on every side, the end padding kept.
            expect(Math.round((b.right - b.glyph!.right) * 10) / 10, `${what}: the end padding`).toBe(15);
            expect(b.glyph!.top, what).toBeGreaterThan(b.top);
            expect(b.glyph!.bottom, what).toBeLessThan(b.bottom);
            expect(Math.abs(b.glyph!.top - b.top - (b.bottom - b.glyph!.bottom)), `${what}: centred in the height`).toBeLessThanOrEqual(1);
          }
        for (const [kind, row] of [['primary', 'xs'], ['secondary', 'xs'], ['primary', 'toolbar'], ['secondary', 'toolbar'], ['ghost', 'md'], ['ghost', 'sm'], ['danger', 'md'], ['primaryDanger', 'md'], ['row', 'md']] as const) {
          const s = specimen(page, kind, row);
          expect(await s.getAttribute('data-glyph'), `${kind} ${row}: no end glyph`).toBeNull();
          await expect(s.locator('[data-glyph-mark]'), `${kind} ${row}`).toHaveCount(0);
        }
        // chip={false} draws none; a "New" primary draws the plus, another the arrow, and neither keeps a start icon.
        await expect(mark(page, 'btn.noChip').locator('[data-glyph-mark]')).toHaveCount(0);
        expect(await mark(page, 'btn.noChip').getAttribute('data-glyph')).toBeNull();
        const glyphOf = (l: Locator) => l.locator('[data-glyph-mark] path').first().getAttribute('d'); // reason: the glyph's first path names its shape
        expect(await glyphOf(mark(page, 'btn.smallPrimary')), 'the plus').toBe(PLUS);
        expect(await glyphOf(mark(page, 'btn.primary')), 'the arrow').not.toBe(PLUS);
        // A button asked for a start icon and drawing the end glyph shows the glyph alone.
        await expect(mark(page, 'strip.new')).toHaveAttribute('data-glyph', '');
        await expect(mark(page, 'strip.new').locator(':scope > svg'), 'no start icon beside the glyph').toHaveCount(0);
        await expect(mark(page, 'btn.primary')).toHaveAccessibleName(gallery['btn.primary']);
      });

      test('the grey plate: its fill and frame at rest, under the pointer and pressed; nothing moves', async ({ page }) => {
        await open(page, theme);
        for (const [kind, row] of [['secondary', 'md'], ['ghost', 'md'], ['secondary', 'sm'], ['secondary', 'toolbar']] as const) {
          const s = specimen(page, kind, row);
          const what = `${kind} ${row}`;
          const ink = hex((await box(s)).color);
          const rest = await painted(page, s);
          const y0 = (await box(s)).y;
          expect([rest.at(3, rest.h >> 1), rest.at(rest.w >> 1, 0), rest.at(0, rest.h >> 1)], `${what} at rest: fill, top line, start line`).toEqual([L.plate, L.line, L.line]);
          expect(contrast(ink, rest.at(3, rest.h >> 1)), `${what}: label on the plate at rest`).toBeGreaterThanOrEqual(4.5);
          await s.hover();
          await expect(s).toHaveAttribute('data-hovered', 'true');
          const over = await painted(page, s);
          expect([over.at(3, over.h >> 1), over.at(over.w >> 1, 0), over.at(0, over.h >> 1)], `${what} under the pointer: a darker fill in a full-ink frame`).toEqual([L.hover, L.lineOn, L.lineOn]);
          expect(contrast(hex((await box(s)).color), over.at(3, over.h >> 1)), `${what}: label on the hover plate`).toBeGreaterThanOrEqual(4.5);
          const moved = await box(s);
          expect([moved.transform, moved.translate, moved.shadow, moved.y], `${what}: no lift, no shadow under the pointer`).toEqual(['none', 'none', 'none', y0]);
          expect([over.w, over.h], `${what}: the same box`).toEqual([rest.w, rest.h]);
          await page.mouse.down();
          await expect(s).toHaveAttribute('data-pressed', 'true');
          const down = await painted(page, s);
          await page.mouse.up();
          expect([down.at(3, down.h >> 1), down.at(down.w >> 1, 0)], `${what} pressed: one step darker, the frame still full ink`).toEqual([L.press, L.lineOn]);
          expect(contrast(ink, down.at(3, down.h >> 1)), `${what}: label on the pressed plate`).toBeGreaterThanOrEqual(4.5);
          await page.mouse.move(0, 0);
        }
      });

      // A row's main action: the grey plate at rest; its row under the pointer lifts it to the accent, so a table never
      // stacks a column of accent buttons. The matrix draws each size as a table row.
      test('the row plate: grey at rest, the accent while its row is under the pointer, the accent steps under its own', async ({ page }) => {
        await open(page, theme);
        const s = specimen(page, 'row', 'md');
        const rest = await painted(page, s);
        expect([rest.at(3, rest.h >> 1), rest.at(rest.w >> 1, 0)], 'at rest: the grey plate').toEqual([L.plate, L.line]);
        expect(contrast(hex((await box(s)).color), L.plate), 'label on the grey plate').toBeGreaterThanOrEqual(4.5);
        // The pointer on a neighbour in the same row.
        const beside = specimen(page, 'ghost', 'md');
        await beside.hover();
        await expect(beside).toHaveAttribute('data-hovered', 'true');
        const lifted = await painted(page, s);
        expect([lifted.at(3, lifted.h >> 1), lifted.at(lifted.w >> 1, 0)], 'its row under the pointer: the accent plate in its frame').toEqual([L.acc, L.accLine]);
        const ink = hex((await box(s)).color);
        expect(contrast(ink, L.acc), 'label on the accent').toBeGreaterThanOrEqual(4.5);
        expect(cutFaults(lifted, 9, L.accLine, L.acc), 'the cut keeps its frame on the accent').toEqual([]);
        // The pointer on the button itself, then pressed.
        await s.hover();
        await expect(s).toHaveAttribute('data-hovered', 'true');
        const over = await painted(page, s);
        expect([over.at(3, over.h >> 1), over.at(over.w >> 1, 0)], 'under the pointer').toEqual([L.accHover, L.accLine]);
        expect(contrast(ink, L.accHover), 'label on the hover plate').toBeGreaterThanOrEqual(4.5);
        await page.mouse.down();
        await expect(s).toHaveAttribute('data-pressed', 'true');
        const down = await painted(page, s);
        await page.mouse.up();
        expect([down.at(3, down.h >> 1), down.at(down.w >> 1, 0)], 'pressed').toEqual([L.accPress, L.accLine]);
        expect(contrast(ink, L.accPress), 'label on the pressed plate').toBeGreaterThanOrEqual(4.5);
        expect([over.w, over.h, (await box(s)).transform], 'the same box, no lift').toEqual([rest.w, rest.h, 'none']);
      });

      test('the accent plate: one fill inside its frame at rest, under the pointer and pressed', async ({ page }) => {
        await open(page, theme);
        for (const row of ['md', 'sm'] as const) {
          const s = specimen(page, 'primary', row);
          const ink = hex((await box(s)).color);
          const rest = await painted(page, s);
          expect([rest.at(3, rest.h >> 1), rest.at(rest.w >> 1, 0), rest.at(0, rest.h >> 1)], `primary ${row} at rest`).toEqual([L.acc, L.accLine, L.accLine]);
          expect(contrast(ink, L.acc), `primary ${row}: label on the plate`).toBeGreaterThanOrEqual(4.5);
          await s.hover();
          await expect(s).toHaveAttribute('data-hovered', 'true');
          const over = await painted(page, s);
          expect([over.at(3, over.h >> 1), over.at(over.w >> 1, 0)], `primary ${row} under the pointer`).toEqual([L.accHover, L.accLine]);
          expect(contrast(ink, over.at(3, over.h >> 1)), `primary ${row}: label on the hover plate`).toBeGreaterThanOrEqual(4.5);
          expect((await box(s)).transform, `primary ${row}: no lift`).toBe('none');
          await page.mouse.down();
          await expect(s).toHaveAttribute('data-pressed', 'true');
          const down = await painted(page, s);
          await page.mouse.up();
          expect([down.at(3, down.h >> 1), down.at(down.w >> 1, 0)], `primary ${row} pressed`).toEqual([L.accPress, L.accLine]);
          expect(contrast(ink, down.at(3, down.h >> 1)), `primary ${row}: label on the pressed plate`).toBeGreaterThanOrEqual(4.5);
          await page.mouse.move(0, 0);
        }
      });

      test('the danger plate: the grey fill in the danger ink and frame, never a red fill; its label reads at 4.5:1 at rest and under the pointer', async ({ page }) => {
        await open(page, theme);
        const danger = await token(matrix(page), '--hx-danger');
        for (const kind of ['danger', 'primaryDanger'] as const) {
          const s = specimen(page, kind, 'md');
          expect(hex((await box(s)).color), `${kind}: the danger ink`).toBe(danger);
          const rest = await painted(page, s);
          expect([rest.at(3, rest.h >> 1), rest.at(rest.w >> 1, 0)], `${kind} at rest: the grey plate in the danger frame`).toEqual([L.plate, danger]);
          expect(contrast(danger, rest.at(3, rest.h >> 1)), `${kind}: label on the plate`).toBeGreaterThanOrEqual(4.5);
          await s.hover();
          await expect(s).toHaveAttribute('data-hovered', 'true');
          const over = await painted(page, s);
          expect(over.at(3, over.h >> 1), `${kind} under the pointer: its own hover plate`).toBe(await token(matrix(page), '--hx-btn-danger-hover'));
          expect(over.at(over.w >> 1, 0), `${kind} under the pointer: the danger frame`).toBe(danger);
          expect(contrast(danger, over.at(3, over.h >> 1)), `${kind}: label on the hover plate`).toBeGreaterThanOrEqual(4.5);
          await page.mouse.move(0, 0);
        }
      });

      test('the cut: 9 px on md and toolbar plates, 7 px on sm and three-dot plates; the corner shows the surface and the frame runs unbroken down the diagonal', async ({ page }) => {
        await open(page, theme);
        const cases: [string, Locator, number, string, string, boolean?][] = [
          ['secondary md', specimen(page, 'secondary', 'md'), 9, L.line, L.plate],
          ['ghost md', specimen(page, 'ghost', 'md'), 9, L.line, L.plate],
          ['primary md', specimen(page, 'primary', 'md'), 9, L.accLine, L.acc, true],
          ['secondary toolbar', specimen(page, 'secondary', 'toolbar'), 9, L.line, L.plate],
          ['secondary sm', specimen(page, 'secondary', 'sm'), 7, L.line, L.plate],
          ['primary sm', specimen(page, 'primary', 'sm'), 7, L.accLine, L.acc, true],
          ['secondary xs', specimen(page, 'secondary', 'xs'), 7, L.line, L.plate],
          ['three-dot', threeDot(page, 'md'), 7, L.line, L.plate],
          ['three-dot in a toolbar', threeDot(page, 'toolbar'), 9, L.line, L.plate],
        ];
        for (const [what, s, cut, frame, plate, exact] of cases) {
          const p = await painted(page, s);
          expect(p.surface, `${what}: the corner pixel is neither the plate nor the frame`).not.toBe(plate);
          expect(p.surface, what).not.toBe(frame);
          expect(p.end(0, 0), `${what}: the corner of the box shows the surface behind`).toBe(p.surface);
          expect(cutFaults(p, cut, frame, plate, exact), `${what}: a ${cut} px cut`).toEqual([]);
          // The other three corners are square: the frame, to the last pixel.
          expect([p.at(0, 0), p.at(p.w - 1, 0), p.at(0, p.h - 1)], `${what}: the other corners`).toEqual([frame, frame, frame]);
        }
        // Under the pointer the diagonal takes the frame's full ink with the lines it joins.
        const s = specimen(page, 'secondary', 'md');
        await s.hover();
        await expect(s).toHaveAttribute('data-hovered', 'true');
        expect(cutFaults(await painted(page, s), 9, L.lineOn, L.hover), 'secondary md under the pointer').toEqual([]);
      });

      test('right to left: the cut is at the bottom left, the glyph before the label on screen, its arrow mirrored', async ({ page }) => {
        await open(page, theme);
        const s = specimen(page, 'secondary', 'md');
        await s.waitFor();
        await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
        const b = await box(s);
        expect(b.glyph!.right, 'the glyph sits at the inline end: left of the label').toBeLessThanOrEqual(b.label!.left);
        expect(await s.locator('[data-px-mirror]').evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
        const p = await painted(page, s, { rtl: true });
        expect(cutFaults(p, 9, L.line, L.plate), 'the cut, mirrored').toEqual([]);
        expect([p.at(0, 0), p.at(p.w - 1, 0), p.at(p.w - 1, p.h - 1)], 'the other corners are square').toEqual([L.line, L.line, L.line]);
      });

      test('keyboard focus draws the ring: a 2 px gap and a 2 px line in the focus colour, on every kind', async ({ page }) => {
        await open(page, theme);
        for (const kind of ['primary', 'secondary', 'ghost', 'danger'] as const) {
          const s = specimen(page, kind, 'md');
          await keyFocus(page, s);
          const ring = await s.evaluate((el) => {
            const probe = document.createElement('span');
            probe.style.boxShadow = 'var(--focus-ring)';
            el.parentElement!.appendChild(probe);
            const v = getComputedStyle(probe).boxShadow;
            probe.remove();
            return v;
          });
          await expect.poll(() => s.evaluate((el) => getComputedStyle(el).boxShadow), `${kind}: the kit ring`).toBe(ring);
          const m = /^(rgba?\([^)]+\)) 0px 0px 0px 2px, (rgba?\([^)]+\)) 0px 0px 0px 4px$/.exec(ring);
          expect(m, `${kind}: a 2 px gap, then a line out to 4 px (${ring})`).not.toBeNull();
          expect(hex(m![2]!), `${kind}: the focus colour`).toBe(L.focus);
          expect(await s.evaluate((el) => getComputedStyle(el).outlineStyle), `${kind}: no outline beside it`).toBe('none');
          // As drawn: the gap's colour 1 and 2 px outside the plate, the focus colour 3 and 4 px outside, then the surface.
          const p = await painted(page, s, { margin: 5, ringed: true });
          const midY = p.h >> 1;
          expect([p.around(-1, midY), p.around(-2, midY), p.around(-3, midY), p.around(-4, midY), p.around(-5, midY)], `${kind}: the ring beside the start line`).toEqual([hex(m![1]!), hex(m![1]!), L.focus, L.focus, p.surface]);
          expect([p.around(p.w >> 1, -3), p.around(p.w >> 1, -4)], `${kind}: the ring above the top line`).toEqual([L.focus, L.focus]);
        }
        // A focusable disabled button (aria-disabled: it says why) keeps the ring, under the pointer too.
        const soft = mark(page, 'btn.ariaDisabled');
        await keyFocus(page, soft);
        const have = () => soft.evaluate((el) => getComputedStyle(el).boxShadow);
        await expect.poll(have).toMatch(/0px 0px 0px 4px$/);
        const ring = await have();
        await soft.hover();
        await expect.poll(have).toBe(ring);
      });

      test('disabled: half opacity; a disabled primary drops the accent and reads as the disabled grey plate; no shadow', async ({ page }) => {
        await open(page, theme);
        for (const row of ['disabled', 'soft'] as const)
          for (const kind of ['primary', 'secondary', 'ghost', 'danger'] as const) {
            const b = await box(specimen(page, kind, row));
            expect([b.opacity, b.shadow], `${kind} ${row}`).toEqual(['0.5', 'none']);
          }
        const grey = await painted(page, specimen(page, 'secondary', 'disabled'));
        for (const s of [specimen(page, 'primary', 'disabled'), specimen(page, 'primary', 'soft'), mark(page, 'btn.disabledPrimary'), mark(page, 'btn.ariaDisabled')]) {
          const p = await painted(page, s);
          expect([p.at(3, p.h >> 1), p.at(p.w >> 1, 0)], 'a disabled primary paints what a disabled secondary paints').toEqual([grey.at(3, grey.h >> 1), grey.at(grey.w >> 1, 0)]);
          expect(hex((await box(s)).color), 'and takes its ink').toBe(await token(matrix(page), '--hx-btn-text'));
        }
        // Half of the grey plate over the surface: between the two, never the accent.
        const live = await painted(page, specimen(page, 'secondary', 'md'));
        expect(grey.at(3, grey.h >> 1), 'the disabled plate is not the live plate').not.toBe(live.at(3, live.h >> 1));
        expect(grey.at(3, grey.h >> 1)).not.toBe(grey.surface);
      });

      test('busy: the spinner takes the glyph\'s place; the label and the width stay', async ({ page }) => {
        await open(page, theme);
        const busy = specimen(page, 'secondary', 'busy');
        await expect(busy.locator('[data-glyph-mark] [data-spinner]')).toHaveCount(1);
        await expect(busy.locator('[data-btn-label]')).toHaveText(gallery['kind.secondary']);
        expect((await box(busy)).w, 'as wide as the same button at rest').toBe((await box(specimen(page, 'secondary', 'md'))).w);
        const b = mark(page, 'btn.busy');
        await expect(b.locator('[data-glyph-mark] [data-spinner]')).toHaveCount(1);
        await expect(b.locator('[data-btn-label]')).toContainText(gallery['btn.busy']);
      });
    });

    test.describe(`plates on a coarse pointer at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });

      test('a button with words is at least 44 both ways by itself; an icon button and a three-dot are 44 x 44; xs draws 24', async ({ page }) => {
        await open(page, theme);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
        const small: string[] = [];
        for (const kind of ['primary', 'secondary', 'ghost', 'danger', 'primaryDanger', 'row'] as const)
          for (const row of ['md', 'sm', 'toolbar'] as const) {
            const b = await box(specimen(page, kind, row));
            if (b.h < 44 || b.w < 44) small.push(`${kind} ${row} ${b.w}x${b.h}`);
            // The width floor is the button's own: its minimum stays its whole words.
            expect(b.minW, `${kind} ${row}`).toBe('max-content');
          }
        expect(small, 'buttons with words under 44').toEqual([]);
        // md and toolbar are exactly the touch height; nothing grows past it.
        expect([(await box(specimen(page, 'secondary', 'md'))).h, (await box(specimen(page, 'primary', 'md'))).h, (await box(specimen(page, 'secondary', 'toolbar'))).h]).toEqual([44, 44, 44]);
        const squares: Record<string, string> = {};
        for (const kind of ['refresh', 'edit', 'add', 'delete'] as const)
          for (const row of ['md', 'sm', 'toolbar'] as const) {
            const b = await box(iconSpecimen(page, kind, row));
            squares[`${kind} ${row}`] = `${b.w}x${b.h}`;
          }
        expect(squares).toEqual(Object.fromEntries(Object.keys(squares).map((k) => [k, '44x44'])));
        const dots: string[] = [];
        for (const asked of ['md', 'sm', 'toolbar'] as const) {
          const b = await box(threeDot(page, asked));
          dots.push(`${b.w}x${b.h}`);
        }
        expect(dots).toEqual(['44x44', '44x44', '44x44']);
        expect([(await box(specimen(page, 'secondary', 'xs'))).h, (await box(iconSpecimen(page, 'edit', 'xs'))).h], 'xs draws at its own height; its press reaches out').toEqual([24, 24]);
        // The glyph stays 12 x 12 inside the taller plate.
        const g = await box(specimen(page, 'primary', 'sm'));
        expect([g.glyph!.w, g.glyph!.h]).toEqual([12, 12]);
      });
    });
  }

/** A button in a place of its own (a footer, a notice, the floating button): its box, its label and its glyph. */
const parts = (b: Locator) =>
  b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const label = el.querySelector<HTMLElement>('[data-btn-label]');
    const glyph = el.querySelector('[data-glyph-mark]')?.getBoundingClientRect();
    const l = label?.getBoundingClientRect();
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      w: round(r.width),
      h: round(r.height),
      right: r.right,
      labelW: l ? round(l.width) : -1,
      labelWhole: !!label && label.scrollWidth <= label.clientWidth && label.clientWidth > 0,
      glyph: glyph ? `${round(glyph.width)}x${round(glyph.height)}` : 'none',
      glyphInside: !!glyph && glyph.left >= r.left && glyph.right <= r.right && glyph.top >= r.top && glyph.bottom <= r.bottom,
      glyphCentred: !!glyph && Math.abs(glyph.left - r.left - (r.right - glyph.right)) <= 1,
    };
  });

// A dialog asks its buttons for no height: the footer's buttons are the kit's own md plates (32) with a mouse at any
// width, a narrow window included, and the touch minimum (44) on a coarse pointer.
for (const [width, touch] of [[390, true], [390, false], [599, true], [600, false], [1350, false]] as const) {
  test.describe(`a dialog footer at ${width}${touch ? ' touch' : ' fine'}`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });

    test(`the primary carries the end glyph, Cancel does not, both the kit height, no label cut (${width})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=overlays&open=confirm');
      const dialog = page.getByRole('alertdialog');
      const primary = dialog.getByRole('button', { name: overlays['confirm.action'], exact: true });
      const cancel = dialog.locator('[data-dialog-cancel]');
      const want = touch ? 44 : 32;
      await expect.poll(async () => (await parts(primary)).h).toBe(want); // after the dialog's opening scale settles
      const p = await parts(primary);
      const c = await parts(cancel);
      await expect(primary).toHaveAttribute('data-glyph', '');
      expect(await cancel.getAttribute('data-glyph')).toBeNull();
      expect([p.h, c.h], 'the primary and Cancel are one height').toEqual([want, want]);
      expect([p.glyph, p.glyphInside]).toEqual(['12x12', true]);
      expect([p.labelWhole, c.labelWhole], 'both labels whole').toEqual([true, true]);
    });
  });
}

test.describe('the Bots notice at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // The notice's Resume (a small glyph button) keeps its whole label; it wraps under the words.
  test('Resume shows its whole label beside its glyph', async ({ page }) => {
    await gotoHub(page, '/bots', { state: 'suspendedNotice' });
    // At this width the note names its computer in its words, so the button keeps its short name.
    const resume = page.getByRole('button', { name: bots['notice.resume'], exact: true });
    await expect(resume).toHaveAccessibleName(bots['notice.resume']);
    await expect(resume.locator('[data-btn-label]')).toHaveText(bots['notice.resume']); // the whole visible label
    const p = await parts(resume);
    expect(p.labelW).toBeGreaterThan(40);
    expect(p.labelWhole).toBe(true);
    expect([p.glyph, p.glyphInside]).toEqual(['12x12', true]);
    expect(p.h, 'the touch minimum, the button\'s own').toBeGreaterThanOrEqual(44);
    expect(p.right).toBeLessThanOrEqual(390);
  });
});

test.describe('the phone\'s floating button', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('expanded: the primary plate 56 tall with its glyph; collapsed: 56 x 56, the glyph alone, same name, focus kept', async ({ page }) => {
    await gotoHub(page, '/bots');
    const fab = page.locator('body > div').getByRole('button', { name: bots['action.new'], exact: true }).last(); // reason: the floating button is drawn after the header's own
    await expect.poll(async () => (await parts(fab)).h).toBe(56);
    const open = await parts(fab);
    await expect(fab).toHaveAttribute('data-variant', 'primary');
    expect([open.glyph, open.glyphInside, open.labelWhole]).toEqual(['12x12', true, true]);
    expect(await fab.evaluate((el) => getComputedStyle(el).clipPath), 'the plate is painted, never clipped').toBe('none');
    await fab.focus();
    // Scroll the content down so the floating button collapses.
    await page.evaluate(() => {
      const main = document.getElementById('hub-main')!;
      main.style.minBlockSize = '0';
      const pad = document.createElement('div');
      pad.style.blockSize = '3000px';
      main.appendChild(pad);
      main.scrollTop = 200;
      main.dispatchEvent(new Event('scroll'));
    });
    // The collapse is a transition: the button can reach 56 while its label is still closing, so wait for the whole
    // collapsed shape (56 wide, the label 0), then read it once.
    await expect.poll(async () => { const c = await parts(fab); return [c.w, c.labelW]; }).toEqual([56, 0]);
    const shut = await parts(fab);
    expect([shut.w, shut.h]).toEqual([56, 56]);
    expect([shut.glyph, shut.glyphInside, shut.glyphCentred], 'the glyph alone, in the middle').toEqual(['12x12', true, true]);
    expect(await fab.evaluate((el) => el.scrollWidth === el.clientWidth)).toBe(true);
    await expect(fab).toHaveAccessibleName(bots['action.new']);
    expect(await fab.evaluate((el) => document.activeElement === el)).toBe(true);
  });
});
