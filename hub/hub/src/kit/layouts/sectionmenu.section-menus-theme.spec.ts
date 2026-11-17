// Section menus ("Dashed rail, ink bar"), measured on every caller of the kit SectionMenu:
// SettingsPage's rail (Account, AI models, Notifications Learn) and the Guide's index, in both themes.
// At 1350 with a fine pointer: the list draws a 1 px dashed rail (--hx-section-rail; #9c9c9c in light) on its start side;
// the items touch (gap 0), each 34 px, no fill, in --hx-section-text (#606060 in light), --hx-section-text-hover on hover;
// the current one takes a 3 px --hx-section-bar (#1c1c1c in light) bar over the rail, the same colour for its text and
// weight 600. The text reaches 4.5:1 on the page. Keyboard focus shows the focus ring; SettingsPage's j / k still rove.
// A coarse pointer keeps the touch minimum (44). At 390 each caller keeps its own strip: no rail and no bar.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test, noSideScroll } from '@app/e2e';

type Surface = { name: string; path: string; item: string; current: string; settings: boolean };
const SURFACES: Surface[] = [
  { name: 'Account', path: '/account', item: 'main nav button[data-nav]', current: 'main nav button[data-nav][aria-current]', settings: true },
  { name: 'AI models', path: '/ai/models', item: 'main nav button[data-nav]', current: 'main nav button[data-nav][aria-current]', settings: true },
  { name: 'Notifications Learn', path: '/notifications/learn', item: 'main nav button[data-nav]', current: 'main nav button[data-nav][aria-current]', settings: true },
  { name: 'Guide', path: '/guide', item: 'main nav a[href^="#"]', current: 'main nav a[aria-current="location"]', settings: false },
];

type Box = { x: number; y: number; w: number; h: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const box = async (l: Locator): Promise<Box> => {
  const r = await l.evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  return { x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height) };
};

/** A token's colour as the browser resolves it, read as a background (an unset token reads transparent). */
const tokenBg = (l: Locator, name: string) =>
  l.evaluate((e, n) => {
    const p = document.createElement('i');
    p.style.backgroundColor = `var(${n})`;
    e.append(p);
    const c = getComputedStyle(p).backgroundColor;
    p.remove();
    return c;
  }, name);

/** WCAG contrast of the element's text on the first opaque background above it (alpha composited once). */
const textContrast = (l: Locator) =>
  l.evaluate((e) => {
    const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number).concat([1]).slice(0, 4) as [number, number, number, number];
    let bg: [number, number, number, number] | null = null;
    for (let n: Element | null = e; n && !bg; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] >= 1) bg = c;
    }
    bg ??= [255, 255, 255, 1];
    const [r, g, b, a] = rgba(getComputedStyle(e).color);
    const fg = [r, g, b].map((v, i) => v * a + bg![i]! * (1 - a));
    const lum = (c: number[]) => {
      const [R, G, B] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
    };
    const [L1, L2] = [lum(fg), lum(bg)].sort((p, q) => q - p);
    return Math.round(((L1! + 0.05) / (L2! + 0.05)) * 100) / 100;
  });

async function open(page: Page, s: Surface, theme: 'light' | 'dark') {
  await gotoHub(page, s.path, { theme });
  await page.locator(s.current).first().waitFor({ timeout: 15_000 });
  const items = page.locator(s.item);
  const list = items.first().locator('..');
  return { items, list, current: page.locator(s.current).first() };
}

const look = (l: Locator) =>
  l.evaluate((e) => {
    const z = getComputedStyle(e);
    return {
      bw: z.borderInlineStartWidth,
      bs: z.borderInlineStartStyle,
      bc: z.borderInlineStartColor,
      color: z.color,
      bg: z.backgroundColor,
      weight: z.fontWeight,
      gap: z.rowGap,
      dir: z.flexDirection,
      shadow: z.boxShadow,
      pad: `${z.paddingInlineStart} ${z.paddingInlineEnd}`,
      deco: z.textDecorationLine,
      mask: z.maskImage,
    };
  });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`section menus, ${theme}`, () => {
    for (const s of SURFACES) {
      test(`${s.name}: dashed rail, 34 px rows, the ink bar on the current one (1350)`, async ({ hubPage: page }) => {
        await page.setViewportSize({ width: 1350, height: 900 });
        const { items, list, current } = await open(page, s, theme);
        const n = await items.count();
        expect.soft(n, 'the menu lists at least two sections').toBeGreaterThan(1);
        const [rail, text, hover, bar] = [
          await tokenBg(list, '--hx-section-rail'),
          await tokenBg(list, '--hx-section-text'),
          await tokenBg(list, '--hx-section-text-hover'),
          await tokenBg(list, '--hx-section-bar'),
        ];
        if (theme === 'light') {
          expect.soft([rail, text, hover, bar], 'light: the quoted #9c9c9c rail, #606060 text, #272727 hover, #1c1c1c bar').toEqual([
            'rgb(156, 156, 156)',
            'rgb(96, 96, 96)',
            'rgb(39, 39, 39)',
            'rgb(28, 28, 28)',
          ]);
        } else {
          expect.soft(rail, 'dark: the rail is a white 30% line (derived)').toBe('rgba(255, 255, 255, 0.3)');
          expect.soft([text, hover, bar], 'dark: text, hover and bar follow the muted text, the ink and the do text').toEqual([
            await tokenBg(list, '--hx-muted-text'),
            await tokenBg(list, '--hx-ink'),
            await tokenBg(list, '--hx-do-text'),
          ]);
        }
        const L = await look(list);
        expect.soft([L.bw, L.bs, L.bc], 'the list draws a 1 px dashed rail on its start side').toEqual(['1px', 'dashed', rail]);
        expect.soft([L.dir, L.gap], 'the items stack with no gap').toEqual(['column', '0px']);
        const lb = await box(list);
        // The rail never overflows: no item label is cut, no strip fade or scroll chevron shows on the column.
        expect.soft(await list.evaluate((e) => e.scrollWidth <= e.clientWidth), 'the rail list does not overflow its column').toBe(true);
        for (let i = 0; i < n; i++)
          expect.soft(await items.nth(i).evaluate((e) => e.scrollWidth <= e.clientWidth), `rail item ${i} label fits`).toBe(true);
        expect.soft(L.mask, 'the rail has no strip fade').toBe('none');
        expect.soft(await page.locator('main nav [data-more]').count(), 'the rail shows no strip chevron').toBe(0);
        const boxes: Box[] = [];
        for (let i = 0; i < n; i++) boxes.push(await box(items.nth(i)));
        for (let i = 0; i < n; i++) {
          expect.soft(boxes[i]!.h, `row ${i} is 34 px`).toBe(34);
          if (i) expect.soft(r1(boxes[i]!.y - (boxes[i - 1]!.y + boxes[i - 1]!.h)), `row ${i} touches the one above`).toBe(0);
        }
        const cur = await look(current);
        expect.soft([cur.bw, cur.bs, cur.bc], 'the current section has a 3 px solid bar').toEqual(['3px', 'solid', bar]);
        expect.soft([cur.color, cur.weight], 'the current section is in the bar colour, weight 600').toEqual([bar, '600']);
        expect.soft(cur.bg, 'the current section has no fill').toBe('rgba(0, 0, 0, 0)');
        const cb = await box(current);
        expect.soft(r1(cb.x - lb.x), 'the bar starts 1 px before the rail, so it covers it').toBe(-1);
        // A section that is not the current one: muted text, no bar, no fill; ink on hover.
        let other: Locator | null = null;
        for (let i = 0; i < n; i++) if ((await items.nth(i).getAttribute('aria-current')) === null) { other = items.nth(i); break; }
        expect.soft(other, 'a section other than the current one is listed').not.toBeNull();
        if (other) {
          const o = await look(other);
          expect.soft([o.color, o.bc, o.bg, o.weight], 'other sections: muted text, a transparent bar, no fill, weight 400').toEqual([text, 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', '400']);
          expect.soft(await textContrast(other), 'the muted text reaches 4.5:1 on its surface').toBeGreaterThanOrEqual(4.5);
          expect.soft(o.pad, 'rail items pad 16 at the start, 12 at the end').toBe('16px 12px');
          const ob = await box(other);
          expect.soft(r1(ob.x + ob.w - (lb.x + lb.w)), 'an item reaches the list end: it stretches, 2 px wider than the list content').toBe(0);
          await other.hover();
          const h = await look(other);
          expect.soft([h.color, h.bg], 'hover turns the text to the hover ink, still no fill').toEqual([hover, 'rgba(0, 0, 0, 0)']);
          expect.soft(h.deco, 'a hovered item is never underlined').toBe('none');
          await page.mouse.move(0, 0);
          await page.keyboard.press('Shift');
          await other.focus();
          expect.soft((await look(other)).shadow, 'keyboard focus on a resting section shows the focus ring').not.toBe('none');
          await other.blur();
        }
        await current.hover();
        const ch = await look(current);
        expect.soft(ch.color, 'the current section keeps the bar colour when hovered').toBe(bar);
        expect.soft(ch.deco, 'the hovered current section is never underlined').toBe('none');
        expect.soft(await textContrast(current), 'the current text reaches 4.5:1').toBeGreaterThanOrEqual(4.5);
        // Keyboard: focus shows the ring; SettingsPage's j moves to the next section.
        const resting = (await look(current)).shadow;
        await page.keyboard.press('Shift');
        await current.focus();
        const focused = (await look(current)).shadow;
        expect.soft(focused !== 'none' && focused !== resting, 'keyboard focus adds the focus ring').toBe(true);
        if (s.settings) {
          const id = await current.getAttribute('data-nav');
          await page.keyboard.press('j');
          const now = await page.evaluate(() => document.activeElement?.getAttribute('data-nav') ?? null);
          expect.soft(now !== null && now !== id, 'j moves focus to the next section').toBe(true);
        }
        expect(test.info().errors).toEqual([]);
      });

      test(`${s.name}: a coarse pointer keeps the touch minimum (1350)`, async ({ hubPageCoarse: page }) => {
        await page.setViewportSize({ width: 1350, height: 900 });
        const { items } = await open(page, s, theme);
        const n = await items.count();
        for (let i = 0; i < n; i++) expect.soft((await box(items.nth(i))).h, `row ${i} is at least 44 px`).toBeGreaterThanOrEqual(44);
        expect(test.info().errors).toEqual([]);
      });

      test(`${s.name}: the phone strip keeps its own look, no rail and no bar (390)`, async ({ hubPageCoarse: page }) => {
        const { items, list, current } = await open(page, s, theme);
        const L = await look(list);
        expect.soft([L.dir, L.bw], 'the strip is a row with no rail').toEqual(['row', '0px']);
        const n = await items.count();
        for (let i = 0; i < n; i++) {
          const it = await look(items.nth(i));
          expect.soft(it.bw, `strip item ${i} has no bar`).toBe('0px');
        }
        const cur = await look(current);
        const first = await look(items.first());
        expect.soft(first.pad, 'strip items pad 12 on both sides').toBe('12px 12px');
        // Every phone strip has the one look (the settings strip's; the Guide's index takes the same section-menu hooks):
        // no fills, the current item underlined in the selected-bar colour, items max(32 px, the touch minimum) tall,
        // which is the touch minimum on this coarse pointer.
        expect.soft(cur.bg, 'the current strip item has no fill').toBe('rgba(0, 0, 0, 0)');
        const rest = page.locator(`${s.item}:not([aria-current])`).first();
        await rest.hover();
        expect.soft((await look(rest)).bg, 'a hovered strip item has no fill').toBe('rgba(0, 0, 0, 0)');
        expect.soft(cur.shadow, 'the strip marks the current item with its underline').toContain('inset');
        expect.soft(cur.shadow, 'the underline is the selected-bar colour').toContain(await tokenBg(list, '--hx-selected-bar'));
        for (let i = 0; i < n; i++) expect.soft((await box(items.nth(i))).h, `strip item ${i} is the touch minimum, 44 px`).toBe(44);
        await noSideScroll(page);
        expect(test.info().errors).toEqual([]);
      });
    }
  });
}
