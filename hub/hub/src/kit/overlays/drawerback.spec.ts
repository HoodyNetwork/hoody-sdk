// Playwright: a drawer's head is one grid of fixed slots, [leading | title, subtitle | actions, ×], at every width. For
// every drawer the kit gallery opens by its link and the page drawers below (with and without a way back), at 1440 and
// 1024 (mouse) and 390 (touch, a coarse pointer), measured in the page:
// - at most one back-looking control (an arrow or a chevron pointing back): never a closing arrow and a back control
//   together; a drawer with a way back shows it as the leading control and closes with its ×, a phone too;
// - the leading control's centre is the title line's centre (within 1 px), and so is the × (when drawn);
// - the title and the subtitle start at one edge (within 1 px), the subtitle right under the title's line on every
//   pointer (the 44 px touch controls overhang the title row, they do not stretch it);
// - the head's inline padding is the body's; what is DRAWN first in the head (the leading arrow's stroke, else the
//   title) starts at the body's padding edge, and the ×'s stroke ends at the body's other padding edge (within 1 px);
// - every child of the head stays inside the head (the icon boxes may hang into its padding, their strokes never), and
//   no two overlap.
// Values come from the page (no length pinned here).
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import bots from '../../pages/bots/strings.en.json';
import keys from '../../pages/keys/strings.en.json';
import schedules from '../../pages/schedules/strings.en.json';
import strings from './strings.en.json';

interface Panel {
  name: string;
  path: string;
  /** Opens the panel after the load (none: the path opens it). */
  open?: (page: Page) => Promise<void>;
  /** The way back's name, when the panel has one. */
  back?: string;
}

const GALLERY = ['drawer-sm', 'drawer-md', 'drawer-lg', 'drawer-dirty', 'drawer-pending', 'drawer-busy', 'drawer-sub', 'drawer-setup'];

const newSchedule = (page: Page) => page.getByRole('button', { name: schedules['action.new'] }).first().click(); // the toolbar's; an empty state's shares the name

const PANELS: Panel[] = [
  ...GALLERY.map((open) => ({ name: `gallery ${open}`, path: `/_kit?tab=overlays&open=${open}`, ...(open === 'drawer-sub' ? { back: gallery['drawer.sub.back'] } : {}) })),
  { name: 'New schedule chooser', path: '/schedules', open: newSchedule },
  {
    name: 'New command schedule',
    path: '/schedules',
    open: async (page) => {
      await newSchedule(page);
      await page.getByRole('button', { name: new RegExp(schedules['new.cmd']) }).click();
    },
    back: schedules['new.back'],
  },
  { name: 'New Bot', path: '/bots?drawer=new&initial=c-atlas' },
  {
    name: 'New Bot model chooser',
    path: '/bots?drawer=new&initial=c-atlas',
    open: (page) => page.getByRole('dialog').getByRole('button', { name: bots['newBot.model.changeName'] }).click(),
    back: bots['newBot.model.back'],
  },
  { name: 'New key', path: '/keys', open: (page) => page.getByRole('button', { name: keys['action.new'], exact: true }).click() },
];

// The kit's two back-pointing glyphs (icons.tsx: arrow-left, chevron-left).
const BACK_GLYPHS = ['M20 12H4M11 5l-7 7 7 7', 'm15 5-7 7 7 7'];

interface Box {
  name: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Read {
  backLooking: string[];
  lead: Box | null;
  close: Box | null;
  title: Box;
  subtitle: Box | null;
  kids: Box[];
  leadGlyph: Box | null;
  closeGlyph: Box | null;
  head: { top: number; bottom: number };
  content: { left: number; right: number; top: number; bottom: number };
  headPad: number[];
  bodyPad: number[];
  bodyContentLeft: number;
  bodyContentRight: number;
}

async function read(page: Page): Promise<Read> {
  // The drawer's own head: the first header in it (a section in the body may have its own).
  const head = page.getByRole('dialog').last().locator('header').first(); // the top dialog; its own head comes before any header in its body
  await expect(head).toBeVisible();
  await expect(page.locator('[data-entering]'), 'the drawer has finished sliding in').toHaveCount(0);
  return head.evaluate(
    (head, { glyphs, closeName }) => {
      const box = (e: Element, name = ''): Box => {
        const r = e.getBoundingClientRect();
        return { name: name || (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).slice(0, 40), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const px = (v: string) => parseFloat(v) || 0;
      const cs = getComputedStyle(head);
      const heading = head.querySelector('h1, h2, h3, h4')!;
      const buttons = [...head.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
      const backLooking = buttons
        .filter((b) => [...b.querySelectorAll('svg path')].some((p) => glyphs.includes(p.getAttribute('d') ?? '')) || /^\s*[‹←]/.test(b.textContent ?? ''))
        .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
      // The leading control: a button before the title in the head's order.
      const lead = buttons.find((b) => b.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
      const close = buttons.find((b) => b.getAttribute('aria-label') === closeName && (heading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? null;
      const sub = heading.nextElementSibling?.tagName === 'P' ? heading.nextElementSibling : null;
      const r = head.getBoundingClientRect();
      const body = head.parentElement!.querySelector('[data-drawer-body]')!;
      const bcs = getComputedStyle(body);
      const glyph = (b: Element | null) => {
        const path = b?.querySelector('svg path');
        return path ? box(path, 'glyph') : null;
      };
      return {
        backLooking,
        leadGlyph: glyph(lead),
        closeGlyph: glyph(close),
        head: { top: r.top, bottom: r.bottom },
        lead: lead ? box(lead) : null,
        close: close ? box(close) : null,
        title: box(heading),
        subtitle: sub ? box(sub) : null,
        kids: [...head.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => box(k)),
        content: { left: r.left + px(cs.paddingLeft), right: r.right - px(cs.paddingRight), top: r.top + px(cs.paddingTop), bottom: r.bottom - px(cs.paddingBottom) },
        headPad: [px(cs.paddingLeft), px(cs.paddingRight)],
        bodyPad: [px(bcs.paddingLeft), px(bcs.paddingRight)],
        bodyContentLeft: body.getBoundingClientRect().left + body.clientLeft + px(bcs.paddingLeft),
        bodyContentRight: body.getBoundingClientRect().left + body.clientLeft + body.clientWidth - px(bcs.paddingRight),
      };
    },
    { glyphs: BACK_GLYPHS, closeName: strings.close },
  );
}

const mid = (b: Box) => (b.top + b.bottom) / 2;

function check(r: Read, p: Panel): void {
  expect(r.backLooking.length, `at most one back-looking control (${r.backLooking.join(' | ')})`).toBeLessThanOrEqual(1);
  if (p.back) {
    expect(r.backLooking, 'the way back is the one back-looking control').toEqual([p.back]);
    expect(r.lead?.name, 'the way back is the leading control').toBe(p.back);
    expect(r.close, 'a drawer with a way back closes with its ×').not.toBeNull();
  }
  if (r.lead) expect(Math.abs(mid(r.lead) - mid(r.title)), 'the leading control is centred on the title line').toBeLessThanOrEqual(1);
  if (r.close) expect(Math.abs(mid(r.close) - mid(r.title)), 'the × is centred on the title line').toBeLessThanOrEqual(1);
  if (r.subtitle) {
    expect(Math.abs(r.subtitle.left - r.title.left), 'the subtitle starts where the title starts').toBeLessThanOrEqual(1);
    expect(Math.abs(r.subtitle.top - r.title.bottom), "the subtitle sits right under the title's line").toBeLessThanOrEqual(1);
  }
  expect(r.headPad, "the head's inline padding is the body's").toEqual(r.bodyPad);
  const firstDrawn = r.leadGlyph ? r.leadGlyph.left : r.title.left;
  expect(Math.abs(firstDrawn - r.bodyContentLeft), "the head's first drawn edge is the body's padding edge").toBeLessThanOrEqual(1);
  if (r.closeGlyph) expect(Math.abs(r.closeGlyph.right - r.bodyContentRight), "the ×'s stroke ends at the body's padding edge").toBeLessThanOrEqual(1);
  const hangs = new Set([r.lead?.name, r.close?.name].filter(Boolean));
  for (const k of r.kids) {
    expect(k.top, `${k.name} stays inside the head`).toBeGreaterThanOrEqual(r.head.top - 0.5);
    expect(k.bottom, `${k.name} stays inside the head`).toBeLessThanOrEqual(r.head.bottom + 0.5);
    if (hangs.has(k.name) || (r.close && k.right >= r.close.right - 0.5)) continue; // an icon box hangs into the padding by its glyph's inset
    expect(k.left, `${k.name} stays inside the head's padding`).toBeGreaterThanOrEqual(r.content.left - 0.5);
    expect(k.right, `${k.name} stays inside the head's padding`).toBeLessThanOrEqual(r.content.right + 0.5);
  }
  for (const g of [r.leadGlyph, r.closeGlyph]) {
    if (!g) continue;
    expect(g.left, 'a stroke stays inside the padding').toBeGreaterThanOrEqual(r.content.left - 1);
    expect(g.right, 'a stroke stays inside the padding').toBeLessThanOrEqual(r.content.right + 1);
  }
  for (const [i, a] of r.kids.entries())
    for (const b of r.kids.slice(i + 1)) {
      const apart = a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
      expect(apart, `${a.name} and ${b.name} do not overlap`).toBe(true);
    }
}

for (const p of PANELS) {
  for (const width of [1440, 1024])
    test(`${p.name}, ${width}: the head's slots line up`, async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, p.path);
      await p.open?.(page);
      check(await read(page), p);
    });

  test(`${p.name}, 390 touch: the head's slots line up`, async ({ hubPageCoarse: page }) => {
    await gotoHub(page, p.path);
    await p.open?.(page);
    check(await read(page), p);
  });
}
