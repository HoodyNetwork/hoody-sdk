// The top bar (32 px controls and hairline zones), measured through the real bar in both themes.
// The actions do not touch: every two actions are one 8 px step apart,
// the bell is a framed plate like its neighbours, and the avatar's picture ends where the page's content ends.
// On a fine pointer every top-bar control (the realm and computer pickers, search, AI, bell, SKILLS / SDK, avatar) is the
// kit's compact control height (--ctl-h-compact, 32 px); search is 260 px wide on --hx-topbar-search-bg (white in
// light); the avatar button is 36 x 32 with a 24 px avatar; a 1 px hairline (--hx-topbar-zone-line), 4 px in from top
// and bottom, closes the realm zone 14 px after its last picker and opens the action cluster 14 px before its first
// control.
// On a coarse pointer every control keeps --touch-min (44 both ways) inside the bar, which stays 48 px. The height is
// the token whatever the density; a focused picker's ring paints above the zone frame; the zones mirror right to left;
// a phone has no zone padding, frame or hairlines.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const PATH = '/_kit?tab=text';

type Box = { x: number; y: number; w: number; h: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const box = async (l: Locator): Promise<Box> => {
  const r = await l.evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  return { x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height) };
};
const wh = (b: Box) => ({ w: b.w, h: b.h });

/** The bar's controls, each by its own name or hook. AI, the bell and the computer picker may be off in a load; the
 *  rest must be there. */
function controls(top: Locator) {
  return {
    realm: top.locator('[data-hub-switch="realm"]'),
    computer: top.locator('[data-hub-switch="computer"]'),
    search: top.locator('button[aria-keyshortcuts="Control+K"], button[aria-keyshortcuts="Meta+K"]'),
    ai: top.locator('button[aria-keyshortcuts="Control+J"], button[aria-keyshortcuts="Meta+J"]'),
    bell: top.getByRole('button', { name: new RegExp(`^${strings['top.notifications']}`) }),
    skills: top.locator('[data-hub-topbar-part="guide:links"] button'),
    avatar: top.getByRole('button', { name: strings['top.account'] }),
  };
}
const MUST = ['realm', 'search', 'skills', 'avatar'] as const;

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

/** The two zone hairlines in the viewport: the realm zone's ::after and the action cluster's ::before (absolute boxes
 *  inside their zone, so their place is the zone's border box, its borders and the pseudo's offsets). */
async function hairlines(top: Locator) {
  return top.evaluate((h) => {
    const zones = [...h.querySelectorAll(':scope > div')];
    const line = (e: Element | undefined, pseudo: '::after' | '::before') => {
      if (!e) return null;
      const s = getComputedStyle(e, pseudo);
      if (s.content === 'none' || s.position !== 'absolute') return { drawn: false, seen: false, x1: 0, x2: 0, y1: 0, y2: 0, w: 0, color: '' };
      const z = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const px = (v: string) => parseFloat(v) || 0;
      const w = px(s.width);
      const x1 = s.left !== 'auto' ? r.left + px(z.borderLeftWidth) + px(s.left) : r.right - px(z.borderRightWidth) - px(s.right) - w;
      const y1 = r.top + px(z.borderTopWidth) + px(s.top);
      const y2 = r.bottom - px(z.borderBottomWidth) - px(s.bottom);
      const round = (v: number) => Math.round(v * 10) / 10;
      // Seen: not hidden by opacity, visibility or display (the colour is checked on its own).
      const seen = s.opacity === '1' && s.visibility === 'visible' && s.display !== 'none';
      return { drawn: true, seen, x1: round(x1), x2: round(x1 + w), y1: round(y1), y2: round(y2), w, color: s.backgroundColor };
    };
    return { realm: line(zones[0], '::after'), end: line(zones[zones.length - 1], '::before') };
  });
}

async function open(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, PATH, { theme });
  const top = page.locator('header').first();
  await top.getByRole('button', { name: strings['top.account'] }).waitFor({ timeout: 15_000 });
  await top.locator('[data-hub-topbar-part="guide:links"] button').waitFor({ timeout: 15_000 });
  return top;
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`top bar, ${theme}`, () => {
    for (const width of [1350, 2400]) {
      test(`every control is the compact height, search 260 on its fill, the avatar 36 x 32 / 24, two hairlines (${width})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const top = await open(page, theme);
        const c = controls(top);
        expect.soft(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a fine pointer').toBe(false);
        const compact = await top.evaluate((h) => getComputedStyle(h).getPropertyValue('--ctl-h-compact').trim());
        expect.soft(compact, 'the kit compact control height is 32 px').toBe('32px');
        expect.soft((await box(top)).h, 'the bar itself stays 48 px').toBe(48);
        for (const k of MUST) expect.soft(await c[k].count(), `the ${k} is drawn`).toBe(1);
        for (const k of ['realm', 'computer', 'search', 'ai', 'bell', 'skills', 'avatar'] as const) {
          if ((await c[k].count()) === 0) continue;
          expect.soft((await box(c[k].first())).h, `the ${k} is 32 px tall`).toBe(32);
        }
        expect.soft((await box(c.search)).w, 'search is 260 px wide').toBe(260);
        const fill = await c.search.evaluate((e) => getComputedStyle(e).backgroundColor);
        expect.soft(fill, 'search sits on --hx-topbar-search-bg').toBe(await tokenBg(c.search, '--hx-topbar-search-bg'));
        const frame1 = await c.search.evaluate((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopStyle, getComputedStyle(e).borderTopColor]);
        expect.soft(frame1, 'search has a 1 px strong frame').toEqual(['1px', 'solid', await tokenBg(c.search, '--hx-line-strong')]);
        if (theme === 'light') expect.soft(fill, 'light: search is white').toBe('rgb(255, 255, 255)');
        else expect.soft(fill, 'dark: search sits on the input fill (derived)').toBe(await tokenBg(c.search, '--hx-input-bg'));
        expect.soft(wh(await box(c.avatar)), 'the avatar button is 36 x 32').toEqual({ w: 36, h: 32 });
        expect.soft(wh(await box(c.avatar.locator('span').first())), 'the avatar is 24 x 24').toEqual({ w: 24, h: 24 });
        const want = await tokenBg(top, '--hx-topbar-zone-line');
        expect.soft(want, 'the zone line is 20% ink: black in light, white in dark').toBe(theme === 'light' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)');
        // The pickers' frame: from the realm picker to the last picker (the computer one when it is drawn).
        const pickers = [await box(c.realm), ...((await c.computer.count()) ? [await box(c.computer)] : [])];
        const frame = { x: pickers[0]!.x, y: pickers[0]!.y, h: pickers[0]!.h, w: r1(Math.max(...pickers.map((p) => p.x + p.w)) - pickers[0]!.x) };
        const end = await box(top.locator(':scope > div').last());
        const first = await box(c.ai.or(c.bell).or(c.skills).first());
        const hl = await hairlines(top);
        for (const [zone, l] of [['realm zone', hl.realm], ['action cluster', hl.end]] as const) {
          expect.soft(l?.drawn, `the ${zone} has a hairline`).toBe(true);
          if (!l?.drawn) continue;
          expect.soft(l.w, `the ${zone} hairline is 1 px`).toBe(1);
          expect.soft(l.seen, `the ${zone} hairline is not hidden`).toBe(true);
          expect.soft(l.color, `the ${zone} hairline takes the zone-line token`).toBe(want);
          expect.soft([r1(l.y1 - frame.y), r1(frame.y + frame.h - l.y2)], `the ${zone} hairline sits 4 px in`).toEqual([4, 4]);
        }
        if (hl.realm?.drawn) expect.soft(r1(hl.realm.x2 - (frame.x + frame.w)), 'the realm hairline closes 14 px after the frame').toBe(14);
        if (hl.end?.drawn) {
          expect.soft(r1(hl.end.x1 - end.x), 'the action hairline opens the cluster').toBe(0);
          expect.soft(r1(first.x - end.x), 'the first action sits 14 px after its hairline').toBe(14);
        }
        // The pickers sit in one frame (an inner-edge outline) on the picker fill; two side by side share one line.
        const line = await tokenBg(c.realm, '--hx-line-strong');
        const pick = await tokenBg(c.realm, '--hx-topbar-pick-bg');
        expect.soft(pick, 'the picker fill: white 35% in light, the hover tint in dark (derived)').toBe(theme === 'light' ? 'rgba(255, 255, 255, 0.35)' : await tokenBg(c.realm, '--hx-hover'));
        const zone = await top.locator(':scope > div').first().evaluate((e) => {
          const z = getComputedStyle(e);
          return { ow: z.outlineWidth, os: z.outlineStyle, oc: z.outlineColor, off: z.outlineOffset, bg: z.backgroundColor };
        });
        expect.soft([zone.ow, zone.os, zone.off], 'the pickers have a 1 px frame on their inner edge').toEqual(['1px', 'solid', '-1px']);
        expect.soft(zone.oc, 'the pickers frame is the strong line').toBe(line);
        expect.soft(zone.bg, 'the pickers sit on --hx-topbar-pick-bg').toBe(pick);
        if (await c.computer.count()) {
          const [a, b] = [await box(c.realm), await box(c.computer)];
          expect.soft(r1(b.x - (a.x + a.w)), 'the two pickers touch').toBe(0);
          const sep = await c.computer.evaluate((e) => [getComputedStyle(e).borderInlineStartWidth, getComputedStyle(e).borderInlineStartColor]);
          expect.soft(sep, 'the two pickers share one strong line').toEqual(['1px', line]);
        }
        // The action cluster is one row with one gap: every two controls are --sp-2 (8 px) apart.
        const step = await top.evaluate((h) => getComputedStyle(h).getPropertyValue('--sp-2').trim());
        expect.soft(step, 'the spacing step between actions is 8 px').toBe('8px');
        const acts: Box[] = [];
        for (const k of ['ai', 'bell', 'skills', 'avatar'] as const) for (const l of await c[k].all()) if (await l.isVisible()) acts.push(await box(l));
        acts.sort((p, q) => p.x - q.x);
        expect.soft(acts.length, 'the actions are drawn').toBeGreaterThan(2);
        for (let i = 1; i < acts.length; i++) expect.soft(r1(acts[i]!.x - (acts[i - 1]!.x + acts[i - 1]!.w)), `action ${i} sits 8 px after the one before it`).toBe(8);
        // The bell is a framed plate like its worded neighbours: the kit's plate fill and line, never see-through.
        if (await c.bell.count()) {
          const plate = await c.bell.evaluate((e) => [getComputedStyle(e).getPropertyValue('--plate').trim(), getComputedStyle(e).getPropertyValue('--plate-line').trim()]);
          const want = await c.skills.evaluate((e) => [getComputedStyle(e).getPropertyValue('--plate').trim(), getComputedStyle(e).getPropertyValue('--plate-line').trim()]);
          expect.soft(plate, 'the bell takes the same plate and line as Skills / SDK').toEqual(want);
          expect.soft(plate[0], 'the bell plate is not see-through').not.toBe('transparent');
        }
        // The avatar's picture ends where the page's content ends: one page padding before the end of the content's
        // inner box (#hub-main without its scrollbar room). The bar keeps the same room at its end as the content
        // under it, so the bar's own end is not the mark: measured from it, the room would count as padding.
        const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#hub-main > *') ?? document.body).getPropertyValue('--pad-page')));
        const main = await page.locator('#hub-main').evaluate((m) => {
          const r = m.getBoundingClientRect();
          return { end: Math.round(r.right * 10) / 10, inner: Math.round((r.left + m.clientLeft + m.clientWidth) * 10) / 10 };
        });
        const barBox = await box(top);
        const pic = await box(c.avatar.locator('span').first());
        expect.soft(pad, 'the page padding is known').toBeGreaterThan(0);
        expect.soft(r1(barBox.x + barBox.w), 'the bar and the content end at the same edge').toBe(main.end);
        expect.soft(r1(main.inner - (pic.x + pic.w)), 'the avatar picture ends one page padding before the content ends').toBe(pad);
        expect(test.info().errors).toEqual([]);
      });
    }

    test('the controls follow the kit token, whatever the density', async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      const top = await open(page, theme);
      const c = controls(top);
      const heights = async () => {
        const out: number[] = [];
        for (const k of MUST) out.push((await box(c[k])).h);
        return out;
      };
      await page.evaluate(() => document.documentElement.setAttribute('data-density', 'compact'));
      expect.soft(await heights(), 'compact density keeps the compact 32 px (never --ctl-h-sm)').toEqual([32, 32, 32, 32]);
      await page.addStyleTag({ content: ':root { --ctl-h-compact: 30px; }' });
      expect.soft(await heights(), 'the height is the token, not a literal: 30 when the token is 30').toEqual([30, 30, 30, 30]);
      expect(test.info().errors).toEqual([]);
    });

    test('a focused picker draws its ring above the zone frame', async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      const top = await open(page, theme);
      const c = controls(top);
      await page.keyboard.press('Tab'); // keyboard modality, so focus is visible
      await c.realm.focus();
      const f = await c.realm.evaluate((e) => {
        const z = getComputedStyle(e);
        return { fv: e.hasAttribute('data-focus-visible'), ring: z.boxShadow.includes('inset'), layer: [z.position, z.zIndex] };
      });
      expect.soft(f.fv, 'the realm picker shows keyboard focus').toBe(true);
      expect.soft(f.ring, 'the picker draws its inset focus ring').toBe(true);
      // The zone's outline paints over its own non-positioned children; a positioned picker with z-index 1 paints over it.
      expect.soft(f.layer, 'the focused picker paints above the zone outline').toEqual(['relative', '1']);
      expect(test.info().errors).toEqual([]);
    });

    test('right to left: the hairlines and the zone padding mirror', async ({ page }) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      const top = await open(page, theme);
      const c = controls(top);
      await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
      const pickers = [await box(c.realm), ...((await c.computer.count()) ? [await box(c.computer)] : [])];
      const frameStart = r1(Math.min(...pickers.map((p) => p.x)));
      const end = await box(top.locator(':scope > div').last());
      const acts: Box[] = [];
      for (const k of ['ai', 'bell', 'skills', 'avatar'] as const) for (const l of await c[k].all()) if (await l.isVisible()) acts.push(await box(l));
      const firstEnd = r1(Math.max(...acts.map((a) => a.x + a.w)));
      const hl = await hairlines(top);
      expect.soft([hl.realm?.drawn, hl.end?.drawn], 'both hairlines are drawn right to left').toEqual([true, true]);
      if (hl.realm?.drawn) expect.soft(r1(frameStart - hl.realm.x1), 'the realm hairline closes 14 px after the frame, on its left').toBe(14);
      if (hl.end?.drawn) {
        expect.soft(r1(end.x + end.w - hl.end.x2), 'the action hairline opens the cluster on its right').toBe(0);
        expect.soft(r1(end.x + end.w - firstEnd), 'the first action sits 14 px after its hairline, to its left').toBe(14);
      }
      expect(test.info().errors).toEqual([]);
    });

    test('below 1024 search is a compact square icon; the bar keeps compact controls', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 900 });
      const top = await open(page, theme);
      const c = controls(top);
      expect.soft(wh(await box(c.search)), 'search is a 32 x 32 icon').toEqual({ w: 32, h: 32 });
      // Below 1024 the actions sit half a step apart (--sp-1, 4 px), one gap for every pair.
      const near: Box[] = [];
      for (const k of ['ai', 'bell', 'skills', 'avatar'] as const) for (const l of await c[k].all()) if (await l.isVisible()) near.push(await box(l));
      near.sort((p, q) => p.x - q.x);
      for (let i = 1; i < near.length; i++) expect.soft(r1(near[i]!.x - (near[i - 1]!.x + near[i - 1]!.w)), `action ${i} sits 4 px after the one before it`).toBe(4);
      expect.soft((await box(c.realm)).h, 'the realm picker is 32 px tall').toBe(32);
      expect.soft((await box(c.avatar)).h, 'the avatar is 32 px tall').toBe(32);
      expect(test.info().errors).toEqual([]);
    });

    test.describe('on a coarse pointer', () => {
      test.use({ viewport: { width: 1350, height: 900 }, hasTouch: true, isMobile: true });
      test('every control keeps the touch minimum, 44 both ways', async ({ page }) => {
        const top = await open(page, theme);
        const c = controls(top);
        expect.soft(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a coarse pointer').toBe(true);
        const bar = await box(top);
        expect.soft(bar.h, 'the bar stays 48 px on a coarse pointer').toBe(48);
        let seen = 0;
        for (const k of ['realm', 'computer', 'search', 'ai', 'bell', 'skills', 'avatar'] as const) {
          for (const l of await c[k].all()) {
            if (!(await l.isVisible())) continue;
            seen++;
            const b = await box(l);
            expect.soft(b.h, `the ${k} is at least 44 tall`).toBeGreaterThanOrEqual(44);
            expect.soft(b.w, `the ${k} is at least 44 wide`).toBeGreaterThanOrEqual(44);
            expect.soft(b.y >= bar.y && b.y + b.h <= bar.y + bar.h, `the ${k} fits inside the bar's height`).toBe(true);
            expect.soft(b.x >= bar.x && b.x + b.w <= bar.x + bar.w, `the ${k} fits inside the bar's width`).toBe(true);
          }
        }
        expect.soft(seen, 'the controls are drawn on a coarse pointer').toBeGreaterThan(3);
        const hl = await hairlines(top);
        expect.soft([hl.realm?.drawn, hl.end?.drawn], 'both hairlines are drawn on a coarse pointer').toEqual([true, true]);
        expect(test.info().errors).toEqual([]);
      });
    });

    for (const coarse of [false, true]) {
      test.describe(`on a phone with a ${coarse ? 'coarse' : 'fine'} pointer`, () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: coarse, isMobile: coarse });
        test('the context chip, search and the bell fit the bar; no zone padding, frame or hairlines', async ({ page }) => {
          await gotoHub(page, PATH, { theme });
          const top = page.locator('header').first();
          const chip = top.locator('[data-hub-switch="context"]');
          await chip.waitFor({ timeout: 15_000 });
          const c = controls(top);
          const bar = await box(top);
          expect.soft(bar.h, 'the bar stays 48 px on a phone').toBe(48);
          for (const [k, l] of [['context chip', chip], ['search', c.search], ['bell', c.bell]] as const) {
            if ((await l.count()) === 0) continue;
            const b = await box(l.first());
            if (coarse) {
              expect.soft(b.h, `the ${k} is at least 44 tall`).toBeGreaterThanOrEqual(44);
              expect.soft(b.w, `the ${k} is at least 44 wide`).toBeGreaterThanOrEqual(44);
            } else expect.soft(b.h, `the ${k} is 32 tall`).toBe(32);
            expect.soft(b.y >= bar.y && b.y + b.h <= bar.y + bar.h && b.x >= bar.x && b.x + b.w <= bar.x + bar.w, `the ${k} fits inside the bar`).toBe(true);
          }
          const zones = top.locator(':scope > div');
          expect.soft(await zones.last().evaluate((e) => getComputedStyle(e).paddingInlineStart), 'the action zone has no padding on a phone').toBe('0px');
          expect.soft(await zones.first().evaluate((e) => [getComputedStyle(e).outlineStyle, getComputedStyle(e).marginInlineEnd]), 'the context zone has no frame or zone gap on a phone').toEqual(['none', '0px']);
          const hl = await hairlines(top);
          expect.soft([hl.realm?.drawn, hl.end?.drawn], 'no hairlines on a phone').toEqual([false, false]);
          await noSideScroll(page);
          expect(test.info().errors).toEqual([]);
        });
      });
    }
  });
}
