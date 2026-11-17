// Playwright: every right-hand panel is the kit Drawer, built the same way. For each reference panel
// (Customize Home, Get a computer, Connect a laptop) and two more (New key, New Bot), light and dark:
// - wide (1350): the head and the foot (each of these panels has one) are one grey (--drawer-bar-bg) and the body,
//   as seen (the first opaque background from the body up), another (--drawer-body-bg), the two differ; the body pads
//   its content by --pad-drawer; the title starts where the body's content starts and sits at least --sp-4 below the
//   top edge; a focused control's ring gap (the first ring of --focus-ring) is the grey it sits on: the head's close
//   button and the foot's first button on the bar grey, a kit Button in the body (when the panel has one) on the body grey;
// - phone (390, touch and a coarse pointer, as a phone): the body pads by --pad-surface and the head keeps its compact
//   padding: --sp-2 above and below, or more when the touch-sized arrow, centred on the title's line, overhangs it
//   further (the head's padding takes the overhang: (--icon-hit - the title line) / 2).
// Values come from the tokens, resolved in the page (none pinned here).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { focusRingGap } from '@app/e2e-focus';
import strings from './strings.en.json';

interface Panel {
  name: string;
  path: string;
  /** Opens the panel after the load (none: the path opens it). */
  open?: (page: Page) => Promise<void>;
}

const PANELS: Panel[] = [
  { name: 'Customize Home', path: '/home?customize=1' },
  { name: 'Connect a laptop', path: '/tunnels?setup=new' },
  {
    name: 'Get a computer',
    path: '/computers',
    open: (page) => page.getByRole('button', { name: 'Get a computer' }).first().click(), // the toolbar's; an empty state's call to action shares the name
  },
  { name: 'New key', path: '/keys', open: (page) => page.getByRole('button', { name: 'New key', exact: true }).click() },
  { name: 'New Bot', path: '/bots?drawer=new&initial=c-atlas' },
];

interface Read {
  tokens: { bar: string; body: string; pad: number; padPhone: number; sp2: number; sp4: number; overhang: number };
  head: string;
  foot: string | null;
  /** The body's background as seen: the first opaque one from the body up to the drawer. */
  body: string;
  /** The head's block padding, top and bottom. */
  headPad: number[];
  /** The body's own padding, per side. */
  bodyPad: number[];
  /** The title's left edge less the body's content-box left edge. */
  titleShift: number;
  /** The title's top less the head's top. */
  titleTop: number;
}

async function read(page: Page): Promise<Read> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const colour = (css: string) => {
      probe.style.color = '';
      probe.style.color = css;
      return getComputedStyle(probe).color;
    };
    const length = (css: string) => {
      probe.style.display = 'block';
      probe.style.width = css;
      const w = probe.getBoundingClientRect().width;
      probe.style.width = '';
      return w;
    };
    const dialog = document.querySelector('[data-drawer-body]')?.closest('[role="dialog"]');
    const drawer = dialog?.parentElement;
    const head = dialog?.querySelector('header');
    const body = dialog?.querySelector('[data-drawer-body]');
    const foot = dialog?.querySelector(':scope > footer, footer');
    const title = head?.querySelector('h1, h2, h3, [slot="title"]');
    if (!dialog || !drawer || !head || !body || !title) throw new Error('no drawer');
    // The panel's own variables, resolved where they are declared.
    const ds = getComputedStyle(drawer);
    const tokens = {
      bar: colour(ds.getPropertyValue('--drawer-bar-bg')),
      body: colour(ds.getPropertyValue('--drawer-body-bg')),
      pad: length('var(--pad-drawer)'),
      padPhone: length('var(--pad-surface)'),
      sp2: length('var(--sp-2)'),
      overhang: length('calc((var(--icon-hit) - var(--lh-box-heading)) / 2)'),
      sp4: length('var(--sp-4)'),
    };
    probe.remove();
    const bs = getComputedStyle(body);
    const bodyPad = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(bs[`padding${k}` as 'paddingTop']));
    const br = body.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    const clear = (c: string) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
    let seen = 'transparent';
    for (let e: Element | null = body; e && clear(seen); e = e === drawer ? null : e.parentElement) seen = getComputedStyle(e).backgroundColor;
    const hs = getComputedStyle(head);
    return {
      tokens,
      head: hs.backgroundColor,
      foot: foot ? getComputedStyle(foot).backgroundColor : null,
      body: seen,
      headPad: [parseFloat(hs.paddingTop), parseFloat(hs.paddingBottom)],
      bodyPad,
      titleShift: tr.left - (br.left + (bodyPad[3] ?? 0)),
      titleTop: tr.top - hr.top,
    };
  });
}

async function openPanel(page: Page, p: Panel, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await gotoHub(page, p.path, { theme });
  await p.open?.(page);
  await expect(page.locator('[data-drawer-body]')).toBeVisible();
  // The slide-in has finished.
  // Finite animations only: a page behind may run an endless one (a Bot that is working shows a pulsing spinner).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

for (const theme of ['light', 'dark'] as const) {
  for (const p of PANELS) {
    test(`${p.name} at 1350: two greys, roomy padding, the title clear of the top edge (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
      await openPanel(page, p, 1350, theme);
      const w = await read(page);
      expect.soft(w.head, 'head bar grey').toBe(w.tokens.bar);
      expect.soft(w.foot, 'foot bar grey (the panel has a foot)').toBe(w.tokens.bar);
      expect.soft(w.body, 'body grey, as seen').toBe(w.tokens.body);
      expect.soft(w.tokens.bar, 'the bars and the body are two greys').not.toBe(w.tokens.body);
      expect.soft(w.bodyPad, 'body padding: --pad-drawer on every side').toEqual([w.tokens.pad, w.tokens.pad, w.tokens.pad, w.tokens.pad]);
      expect.soft(Math.abs(w.titleShift), 'the title starts where the body content starts').toBeLessThanOrEqual(1);
      expect.soft(w.titleTop, 'the title sits at least --sp-4 below the top edge').toBeGreaterThanOrEqual(w.tokens.sp4);

      const panel = page.getByRole('dialog');
      expect.soft(await focusRingGap(page, panel.locator('header').getByRole('button', { name: strings.close })), 'close button ring gap: bar grey').toBe(w.tokens.bar);
      expect.soft(await focusRingGap(page, panel.locator('footer button:visible').first()), 'foot button ring gap: bar grey').toBe(w.tokens.bar);
      // kit Buttons: they draw --focus-ring. Enabled only: a disabled one (Customize Home's first row cannot move up) never takes focus.
      const inBody = panel.locator('[data-drawer-body] [class*="Button-module__button"]:visible:not([disabled]):not([aria-disabled="true"])');
      if ((await inBody.count()) > 0) expect.soft(await focusRingGap(page, inBody.first()), 'body button ring gap: body grey').toBe(w.tokens.body); // the first is enough: one ring rule
    });
  }

  test.describe(`on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    for (const p of PANELS) {
      test(`${p.name} at 390: phone padding and the compact head (${theme})`, async ({ page }) => {
      test.setTimeout(120_000); // Tab walks and an evaluate per step, slow under host load
        await openPanel(page, p, 390, theme);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a coarse pointer, as a phone').toBe(true);
        const n = await read(page);
        expect.soft(n.bodyPad, 'phone body padding: --pad-surface').toEqual([n.tokens.padPhone, n.tokens.padPhone, n.tokens.padPhone, n.tokens.padPhone]);
        const pad = Math.max(n.tokens.sp2, n.tokens.overhang);
        expect.soft(n.headPad, 'phone head padding: --sp-2 above and below, or the arrow overhang when larger').toEqual([pad, pad]);
        expect.soft(n.head, 'head bar grey').toBe(n.tokens.bar);
      });
    }
  });
}
