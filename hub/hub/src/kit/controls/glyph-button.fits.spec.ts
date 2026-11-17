// Playwright: one fit case per place a glyph button (a plate with its end glyph) once did not fit. Each one checked has
// its whole label, sits inside its box (band, card, table cell) and inside the window: the AI summary band with Connect
// and Use Hoody Free, Ask's stopped band with Start for a long-named computer at the dock's default 360, its least 320
// and on a phone, Home's Welcome Open for a long-named computer, Plans' Upgrade to {plan} with a long server name, and
// the launcher's Open with its row menu in the table and in the phone list (Options sits in the menu).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, hubUrl } from '@app/e2e';
import ai from '../../pages/ai/strings.en.json';
import apps from '../../pages/apps/strings.en.json';
import billing from '../../pages/billing/strings.en.json';
import ask from '../../ask/strings.en.json';
import shell from '../../shell/strings.en.json';
import home from '../../pages/home/strings.en.json';

/** A glyph button (a plate with its end glyph) is whole: its label is not cut, and it ends inside `box` and inside the window. */
async function whole(page: Page, b: Locator, box: Locator, what: string) {
  await expect(b, what).toBeVisible();
  expect(await b.getAttribute('data-glyph'), what).not.toBeNull();
  const cut = await b.locator('[data-btn-label]').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(cut, `${what}: label cut by ${cut}px`).toBeLessThanOrEqual(1);
  const r = (await b.boundingBox())!;
  const c = (await box.boundingBox())!;
  expect(r.x, `${what}: starts inside its box`).toBeGreaterThanOrEqual(c.x - 1);
  expect(r.x + r.width, `${what}: ends inside its box`).toBeLessThanOrEqual(c.x + c.width + 1);
  expect(r.x + r.width, `${what}: inside the window`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

const coarse390 = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

// A cold /ai/models or /home boot takes ~10 s alone. In a full run on a loaded host the default 30 s test budget ran
// out before the band was read. The budget grows; no check is loosened.
const COLD = 60_000;

// The AI summary band (Models & keys, the default model's account has no key) holds both actions in order.
async function aiBand(page: Page, what: string) {
  await gotoHub(page, '/ai/models', { state: 'needsKey' });
  const freeIn = (l: Locator | Page) => l.getByRole('button', { name: ai['now.useFree'], exact: true });
  const band = page.locator('[role="alert"]').filter({ has: freeIn(page) }).last(); // reason: the innermost warn band holding Use Hoody Free
  const connect = band.getByRole('button', { name: new RegExp(`^${ai['now.connect'].replace('{{provider}}', '')}`) });
  const free = freeIn(band);
  await expect(band, `${what}: the band is read`).toBeVisible({ timeout: 30_000 });
  await whole(page, connect, band, `${what} Connect`);
  await whole(page, free, band, `${what} Use Hoody Free`);
  const a = (await connect.boundingBox())!;
  const f = (await free.boundingBox())!;
  expect(a.y < f.y - 1 || (Math.abs(a.y - f.y) <= 1 && a.x < f.x), `${what}: Connect comes before Use Hoody Free`).toBe(true);
}
test.describe('the AI summary band', () => {
  test.describe.configure({ timeout: COLD });
  for (const [w, h] of [
    [1350, 900],
    [2400, 1300],
  ] as const)
    test(`at ${w}: Connect and Use Hoody Free whole, in order, inside the band`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await aiBand(page, `${w}`);
    });
});
test.describe('the AI summary band on a phone (coarse pointer)', () => {
  test.describe.configure({ timeout: COLD });
  test.use(coarse390);
  test('Connect and Use Hoody Free whole, in order, inside the band', async ({ page }) => {
    await aiBand(page, 'coarse 390');
  });
});

// Ask on a stopped computer with a long name (Home's longName state). Start is the visible word; the name says
// which computer, and the band's sentence names it whole.
const LONG = 'production-build-runner-singapore-01'; // Home's longName state
async function askStopped(page: Page) {
  await page.goto(hubUrl('/home', { state: 'longName' }).replace('/?', '/?ask=1&askfx=stopped&'));
  await page.locator('#hub-main').waitFor();
  await page.keyboard.press('Control+j');
  const start = page.getByRole('button', { name: `${ask['ask.startShort']} ${LONG}`, exact: true });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await expect(start.locator('[data-btn-label]')).toHaveText(ask['ask.startShort']);
  const band = page.locator('[role="status"]').filter({ has: start }).last(); // reason: the stopped band, the innermost status holding Start
  await expect(band, 'the stopped band is read').toBeVisible({ timeout: 30_000 });
  return { start, band };
}
/** The band's sentence names the long computer and stays inside the band. */
async function sentenceInside(band: Locator, what: string) {
  const text = band.getByText(LONG);
  await expect(text, what).toBeVisible();
  const r = (await text.boundingBox())!;
  const c = (await band.boundingBox())!;
  expect(r.x + r.width, `${what}: the sentence ends inside the band`).toBeLessThanOrEqual(c.x + c.width + 1);
}
test.describe('Ask stopped, long name, at 1350', () => {
  test.describe.configure({ timeout: COLD });
  test('the dock default 360 and its least 320: Start whole inside its band', async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    const { start, band } = await askStopped(page);
    const grip = page.getByRole('separator', { name: shell['ask.resize'] });
    await expect(grip).toHaveAttribute('aria-valuenow', '360');
    await whole(page, start, band, 'dock 360');
    await sentenceInside(band, 'dock 360');
    await grip.focus();
    await page.keyboard.press('Home');
    await expect(grip).toHaveAttribute('aria-valuenow', '320');
    await whole(page, start, band, 'dock 320');
    await sentenceInside(band, 'dock 320');
  });
});
test.describe('Ask stopped, long name, on a phone (coarse pointer)', () => {
  test.describe.configure({ timeout: COLD });
  test.use(coarse390);
  test('Start is whole inside its band', async ({ page }) => {
    const { start, band } = await askStopped(page);
    await whole(page, start, band, 'coarse 390');
    await sentenceInside(band, 'coarse 390');
  });
});

// Home's Welcome Open for a computer with a long name: the button says Open and its accessible name names the computer;
// the name is not drawn beside it (on a phone it wrapped next to the tour button), the header above names it.
async function welcomeOpen(page: Page, what: string) {
  await gotoHub(page, '/home?intro=1', { state: 'longName' });
  const open = page.getByRole('link', { name: `${home['intro.openShort']} ${LONG}`, exact: true });
  const section = page.locator('section').filter({ has: open }).last(); // reason: the Welcome section, the innermost holding Open
  await whole(page, open, section, `${what} Open`);
  await expect(open.locator('[data-btn-label]')).toHaveText(home['intro.openShort']);
  await expect(section.getByText(LONG, { exact: true }), `${what}: no name beside Open`).toHaveCount(0);
  const r = (await open.boundingBox())!;
  expect(r.x + r.width, `${what}: Open ends inside the window`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}
test('Home Welcome at 1350: Open whole, named for the long computer name', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await welcomeOpen(page, '1350');
});
test.describe('Home Welcome on a phone (coarse pointer)', () => {
  test.use(coarse390);
  test('Open whole, named for the long computer name', async ({ page }) => {
    await welcomeOpen(page, 'coarse 390');
  });
});

/** Every part of `el` (each line box of its text when `text`) is drawn where it is: centred in the window, the topmost
 *  element at every point of a 3 px grid inside each box (and 2 px inside each edge) is `el` or inside it, it and every
 *  ancestor up to the document are visible (opacity above 0, visibility visible), and every text run paints (its
 *  colour and text fill not transparent). A clip by any ancestor (overflow,
 *  clip-path, the PlanCard's cut corner, a notch anywhere), the window's edges, a cover or a transparent part fails it. */
async function drawn(l: Locator, text: boolean): Promise<string[]> {
  return l.evaluate((el, asText) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const boxes = asText
      ? (() => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return [...r.getClientRects()].filter((b) => b.width > 2 && b.height > 2);
        })()
      : [el.getBoundingClientRect()];
    const missed: string[] = [];
    if (boxes.length === 0) missed.push('no box');
    const shown = (n: Element | null): boolean => {
      for (let a = n; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (Number(cs.opacity) <= 0 || cs.visibility !== 'visible') return false;
      }
      return true;
    };
    // A colour with alpha 0 ("transparent", rgba(..., 0)) paints nothing.
    const clear = (c: string) => c === 'transparent' || /^rgba\(.*,\s*0(\.0+)?\)$/.test(c) || /\/\s*0(\.0+)?\)$/.test(c);
    const paints = (n: Element | null) => {
      if (!n) return false;
      const cs = getComputedStyle(n);
      return !clear(cs.color) && !clear(cs.getPropertyValue('-webkit-text-fill-color'));
    };
    for (const b of boxes) {
      const xs: number[] = [];
      for (let x = b.left + 2; x < b.right - 2; x += 3) xs.push(x);
      xs.push(b.right - 2);
      const ys: number[] = [];
      for (let y = b.top + 2; y < b.bottom - 2; y += 3) ys.push(y);
      ys.push(b.bottom - 2);
      for (const x of xs)
        for (const y of ys) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === el || el.contains(hit)) || !shown(hit)) {
            missed.push(`${Math.round(x)},${Math.round(y)}`);
            if (missed.length > 8) return missed;
          }
        }
    }
    // Every text of it is drawn too: no transparent or hidden run inside (a span the grid's hits may not reach), and none
    // set too small to read (a run at font-size 0 hit-tests and paints).
    const tiny = (n: Element | null) => !n || parseFloat(getComputedStyle(n).fontSize) < 8;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode())
      if (t.textContent?.trim() && !(shown(t.parentElement) && paints(t.parentElement) && !tiny(t.parentElement))) missed.push(`hidden text "${t.textContent.trim().slice(0, 20)}"`);
    return missed;
  }, text);
}

/**
 * The paint proof: the window's pixels where `l` is, against the same element drawn unobstructed.
 * The reference moves it into the
 * top layer: a manual popover pinned to its own box, a hidden copy keeping the layout, and the clip-path, mask,
 * overflow and legacy clip of it and of every element inside it cleared. The top layer is drawn above everything and clipped by no ancestor, so
 * every whole device pixel of its box must match (an RGB sum difference over 6 counts).
 * A cover painted over any part of it (pointer-events none included, low contrast included), a clip or cut by any
 * ancestor or by anything inside it however thin or small, or the window's edge leaves pixels that differ.
 * It refuses, as not proven, an element whose ancestors draw it through an effect the top layer does not repeat
 * (opacity under 1, a filter, a transform, a blend mode, perspective) and an element that is a popover already.
 * Returns what did not match or could not be proven.
 */
async function painted(page: Page, l: Locator): Promise<string[]> {
  const el = await l.elementHandle();
  try {
    const b = await el.evaluate((n) => {
      n.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = n.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, dpr: window.devicePixelRatio };
    });
    const vp = page.viewportSize()!;
    if (b.x < 0 || b.y < 0 || b.x + b.w > vp.width || b.y + b.h > vp.height) return ['not wholly inside the window'];
    // Whole device pixels inside the box: its anti-aliased outer edge belongs to what is under it too.
    const inward = (v: number, up: boolean) => (up ? Math.ceil(v * b.dpr) : Math.floor(v * b.dpr)) / b.dpr;
    const x0 = inward(b.x, true);
    const y0 = inward(b.y, true);
    const clip = { x: x0, y: y0, width: inward(b.x + b.w, false) - x0, height: inward(b.y + b.h, false) - y0 };
    if (clip.width <= 0 || clip.height <= 0) return ['no box'];
    const shot = async () => (await page.screenshot({ clip, animations: 'disabled', caret: 'hide', scale: 'device' })).toString('base64');
    const where = await shot();
    // Set up the reference in one step: every change is recorded before it is made, and undone if any later step throws.
    const refused = await el.evaluate((n) => {
      const h = n as HTMLElement & { paintUndo?: () => void };
      if (h.hasAttribute('popover')) return 'it is a popover already';
      for (let a = h.parentElement; a; a = a.parentElement) {
        const c = getComputedStyle(a);
        const effect =
          Number(c.opacity) < 1 ? `opacity ${c.opacity}` : c.filter !== 'none' ? `filter ${c.filter}` : c.transform !== 'none' || c.translate !== 'none' || c.scale !== 'none' || c.rotate !== 'none' ? 'a transform' : c.mixBlendMode !== 'normal' ? `blend ${c.mixBlendMode}` : c.perspective !== 'none' ? 'perspective' : '';
        if (effect) return `an ancestor (${a.tagName.toLowerCase()}) draws it with ${effect}: not proven here`;
      }
      const styles: [HTMLElement, string | null][] = [];
      const undo: (() => void)[] = [];
      const touch = (x: HTMLElement) => {
        styles.push([x, x.getAttribute('style')]);
      };
      const restore = () => {
        for (const f of undo.reverse()) f();
        for (const [x, st] of styles.reverse()) {
          if (st === null) x.removeAttribute('style');
          else x.setAttribute('style', st);
        }
      };
      try {
        const r = h.getBoundingClientRect();
        const cs = getComputedStyle(h);
        // What the popover user-agent styles would change, kept as drawn in place.
        const keep: [string, string][] = ['color', 'background-color', 'box-sizing'].map((p) => [p, cs.getPropertyValue(p)]);
        for (const side of ['top', 'right', 'bottom', 'left'])
          for (const k of [`border-${side}-style`, `border-${side}-width`, `border-${side}-color`, `padding-${side}`]) keep.push([k, cs.getPropertyValue(k)]);
        const copy = h.cloneNode(true) as HTMLElement;
        copy.style.visibility = 'hidden';
        copy.removeAttribute('id');
        h.before(copy);
        undo.push(() => copy.remove());
        touch(h);
        for (const [k, v] of keep) h.style.setProperty(k, v, 'important');
        const pin: [string, string][] = [['position', 'fixed'], ['inset', 'auto'], ['left', `${r.left}px`], ['top', `${r.top}px`], ['width', `${r.width}px`], ['height', `${r.height}px`], ['margin', '0']];
        for (const [k, v] of pin) h.style.setProperty(k, v, 'important');
        // Nothing of it or inside it clips in the reference: what clips in place shows as a difference.
        for (const x of [h, ...h.querySelectorAll<HTMLElement>('*')]) {
          const c = getComputedStyle(x);
          if (x !== h && c.clipPath === 'none' && c.maskImage === 'none' && c.overflowX === 'visible' && c.overflowY === 'visible' && c.clip === 'auto') continue;
          if (x !== h) touch(x);
          for (const [k, v] of [['clip-path', 'none'], ['mask', 'none'], ['overflow', 'visible'], ['clip', 'auto']] as const) x.style.setProperty(k, v, 'important');
        }
        h.setAttribute('popover', 'manual');
        undo.push(() => h.removeAttribute('popover'));
        h.showPopover();
        undo.push(() => h.hidePopover());
        h.paintUndo = () => {
          restore();
          delete h.paintUndo;
        };
        return '';
      } catch (e) {
        restore();
        throw e;
      }
    });
    if (refused) return [refused];
    let free: string;
    try {
      free = await shot();
    } finally {
      await el.evaluate((n) => (n as HTMLElement & { paintUndo?: () => void }).paintUndo?.());
    }
    return await page.evaluate(
      async ({ where, free }) => {
        const pixels = async (b64: string) => {
          const i = new Image();
          i.src = `data:image/png;base64,${b64}`;
          await i.decode();
          const c = document.createElement('canvas');
          c.width = i.naturalWidth;
          c.height = i.naturalHeight;
          const x = c.getContext('2d')!;
          x.drawImage(i, 0, 0);
          return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
        };
        const [a, f] = await Promise.all([pixels(where), pixels(free)]);
        if (a.w !== f.w || a.h !== f.h) return [`shots differ in size ${a.w}x${a.h} / ${f.w}x${f.h}`];
        let n = 0;
        let first = '';
        for (let k = 0; k < a.d.length; k += 4) {
          const d = Math.abs(a.d[k]! - f.d[k]!) + Math.abs(a.d[k + 1]! - f.d[k + 1]!) + Math.abs(a.d[k + 2]! - f.d[k + 2]!);
          if (d > 6) {
            if (!n) first = `${(k / 4) % a.w},${Math.floor(k / 4 / a.w)}`;
            n++;
          }
        }
        return n ? [`${n} device pixels differ from it drawn unobstructed (first at ${first} in its box)`] : [];
      },
      { where, free },
    );
  } finally {
    await el.dispose();
  }
}

/** drawn() and painted(): hit-tested, visible and painting, and its pixels proven on screen. */
async function drawnAndPainted(page: Page, l: Locator, text: boolean): Promise<string[]> {
  const d = await drawn(l, text);
  return d.length ? d : painted(page, l);
}

// Plans' upgrade for a server with a long name: the button says Upgrade to {plan}; its plan card's note names the
// server (the cards are kit PlanCards: the note sits above the action).
async function plansUpgrade(page: Page, what: string) {
  await gotoHub(page, '/billing?sub=a1b2c3d4e5f60718293a4b01', { state: 'long' });
  const server = 'production-eu-central-primary-database-and-api-gateway-node-01';
  // The server is on Small: every bigger plan, Medium and Large, offers its Upgrade, and nothing else does.
  const ups = page.getByRole('button', { name: new RegExp(`^Upgrade to .+: ${server}$`) });
  await expect(ups).toHaveCount(2, { timeout: 15_000 });
  for (const plan of ['Medium', 'Large']) {
    const box = page.locator(`[data-kit="plan-card"][aria-label="${plan}"]`); // reason: the kit PlanCard of this plan (its group name)
    await expect(box, `${what} ${plan}: one card`).toHaveCount(1);
    const b = box.getByRole('button', { name: `Upgrade to ${plan}: ${server}`, exact: true });
    await expect(b, `${what} ${plan}: one Upgrade, named for the server`).toHaveCount(1);
    await whole(page, b, box, `${what} Upgrade to ${plan}`);
    expect(await drawnAndPainted(page, b, false), `${what} ${plan}: the Upgrade is drawn whole (no clip, cut corner or window edge)`).toEqual([]);
    const r = (await b.boundingBox())!;
    const c = (await box.boundingBox())!;
    expect(r.x, `${what} ${plan}: the Upgrade starts inside the window`).toBeGreaterThanOrEqual(-1);
    expect(r.y, `${what} ${plan}: the Upgrade starts inside its card`).toBeGreaterThanOrEqual(c.y - 1);
    expect(r.y + r.height, `${what} ${plan}: the Upgrade ends inside its card`).toBeLessThanOrEqual(c.y + c.height + 1);
    // The card's note slot (kit PlanCard `data-plan-part="note"`) says "Upgrades {server} in place." (plans.upgradeNote).
    const note = box.locator('[data-plan-part="note"]'); // reason: the PlanCard note slot has no role
    await expect(note, `${what} ${plan}: one note`).toHaveCount(1);
    await expect(note, `${what} ${plan}: the note names the server`).toContainText(billing['plans.upgradeNote'].replace('{{server}}', server));
    expect(await drawnAndPainted(page, note, true), `${what} ${plan}: every line of the note is drawn (no clip, cut corner or window edge)`).toEqual([]);
    const cut = await note.evaluate((el) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }));
    expect(cut.x, `${what} ${plan}: the note is not cut across`).toBeLessThanOrEqual(1);
    expect(cut.y, `${what} ${plan}: the note is not cut down`).toBeLessThanOrEqual(1);
    const l = (await note.boundingBox())!;
    const k = (await box.boundingBox())!; // measured again: drawn() scrolled the note to the middle
    expect(l.x + l.width, `${what} ${plan}: the note wraps inside its card`).toBeLessThanOrEqual(k.x + k.width + 1);
    expect(l.y + l.height, `${what} ${plan}: the note ends inside its card`).toBeLessThanOrEqual(k.y + k.height + 1);
  }
}
test('Plans upgrade with a long server name at 1350: Upgrade to {plan} whole, the server named beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await plansUpgrade(page, '1350');
});
test.describe('Plans upgrade with a long server name on a phone', () => {
  test.use(coarse390);
  test('Upgrade to {plan} whole in each card, the server named beside it', async ({ page }) => {
    await plansUpgrade(page, 'coarse 390');
  });
});

// The proof itself bites: each defect a
// hit-test grid and style checks let through is put on the Plans page's Medium Upgrade or its note, and
// drawnAndPainted() must report it. Covers are opaque and pointer-events none; cuts are an ancestor's clip (the card's).
test.describe('drawnAndPainted catches what a hit-test grid misses (negative controls)', () => {
  const server = 'production-eu-central-primary-database-and-api-gateway-node-01';
  async function medium(page: Page) {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/billing?sub=a1b2c3d4e5f60718293a4b01', { state: 'long' });
    const box = page.locator('[data-kit="plan-card"][aria-label="Medium"]'); // reason: the kit PlanCard of Medium
    const b = box.getByRole('button', { name: `Upgrade to Medium: ${server}`, exact: true });
    const note = box.locator('[data-plan-part="note"]'); // reason: the PlanCard note slot has no role
    await expect(b).toBeVisible({ timeout: 15_000 });
    expect(await drawnAndPainted(page, b, false), 'control: the clean Upgrade passes').toEqual([]);
    expect(await drawnAndPainted(page, note, true), 'control: the clean note passes').toEqual([]);
    return { b, note };
  }
  /** An opaque pointer-events:none cover over `part` of `l`'s box (fractions of its width and height), `l` centred
   *  first as drawn() centres it, so the fixed cover stays over it. */
  const cover = (l: Locator, part: { x: number; y: number; w: number; h: number }) =>
    l.evaluate((el, p) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const c = document.createElement('div');
      Object.assign(c.style, { position: 'fixed', left: `${r.left + p.x * r.width}px`, top: `${r.top + p.y * r.height}px`, width: `${p.w * r.width}px`, height: `${p.h * r.height}px`, background: 'rgb(128, 128, 128)', pointerEvents: 'none', zIndex: '2147483647' });
      document.body.append(c);
    }, part);
  /** The card clips away the polygon `cut` (points in the Upgrade's own coordinates, px), evenodd against the card. */
  async function cardCut(b: Locator, cut: (w: number, h: number) => [number, number][]) {
    await b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const r = (await b.boundingBox())!;
    await b.evaluate((el, pts) => {
      const card = el.closest('[data-kit="plan-card"]') as HTMLElement;
      const c = card.getBoundingClientRect();
      const q = el.getBoundingClientRect();
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x + q.left - c.left} ${y + q.top - c.top}`).join(' ');
      card.style.clipPath = `path(evenodd, "M0 0 H${c.width} V${c.height} H0 Z ${d} Z")`;
    }, cut(r.width, r.height));
  }
  test('a cover over the whole Upgrade', async ({ page }) => {
    const { b } = await medium(page);
    await cover(b, { x: 0, y: 0, w: 1, h: 1 });
    expect(await drawnAndPainted(page, b, false), 'a cover over the Upgrade is caught').not.toEqual([]);
  });
  test('a cover over half of one glyph of the label', async ({ page }) => {
    const { b } = await medium(page);
    await b.locator('[data-btn-label]').evaluate((span) => {
      span.scrollIntoView({ block: 'center', inline: 'nearest' });
      const t = span.firstChild!;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 1);
      const q = r.getBoundingClientRect();
      const c = document.createElement('div');
      Object.assign(c.style, { position: 'fixed', left: `${q.left}px`, top: `${q.top + q.height / 2}px`, width: `${q.width / 2}px`, height: `${q.height / 2}px`, background: 'rgb(128, 128, 128)', pointerEvents: 'none', zIndex: '2147483647' });
      document.body.append(c);
    });
    expect(await drawnAndPainted(page, b, false), 'half a glyph covered is caught').not.toEqual([]);
  });
  test('a cover over the note', async ({ page }) => {
    const { note } = await medium(page);
    await cover(note, { x: 0, y: 0, w: 1, h: 1 });
    expect(await drawnAndPainted(page, note, true), 'a cover over the note is caught').not.toEqual([]);
  });
  test('a cover over a small part of the note (a tenth of its width, a third of its height)', async ({ page }) => {
    const { note } = await medium(page);
    await cover(note, { x: 0.3, y: 0.1, w: 0.1, h: 0.34 });
    expect(await drawnAndPainted(page, note, true), 'a small cover on the note is caught').not.toEqual([]);
  });
  test('the card cuts the outer 1.5 px of the Upgrade\'s end edge, thinner than the grid', async ({ page }) => {
    const { b } = await medium(page);
    await cardCut(b, (w, h) => [[w - 1.5, -1], [w + 1, -1], [w + 1, h + 1], [w - 1.5, h + 1]]);
    expect(await drawnAndPainted(page, b, false), 'an edge cut by the card is caught').not.toEqual([]);
  });
  test('the card cuts a 1 px notch across a third of the Upgrade, between the grid rows', async ({ page }) => {
    const { b } = await medium(page);
    await cardCut(b, (w) => [[w / 3, 3.5], [(2 * w) / 3, 3.5], [(2 * w) / 3, 4.5], [w / 3, 4.5]]);
    expect(await drawnAndPainted(page, b, false), 'a short thin notch cut by the card is caught').not.toEqual([]);
  });
  test('the card cuts a 5 px corner off the Upgrade', async ({ page }) => {
    const { b } = await medium(page);
    await cardCut(b, () => [[-1, -1], [5, -1], [-1, 5]]);
    expect(await drawnAndPainted(page, b, false), 'a corner cut by the card is caught').not.toEqual([]);
  });
  test('its own clip, thinner than the grid (inset 1.5 px)', async ({ page }) => {
    const { b } = await medium(page);
    await b.evaluate((el) => {
      (el as HTMLElement).style.clipPath = 'inset(1.5px)';
    });
    expect(await drawnAndPainted(page, b, false), 'its own outer cut is caught').not.toEqual([]);
  });
  test('a clip on the label\'s own text span (inside the Upgrade) cuts a glyph', async ({ page }) => {
    const { b } = await medium(page);
    await b.locator('[data-btn-label]').evaluate((span) => {
      (span as HTMLElement).style.clipPath = 'inset(0 0 40% 0)';
    });
    expect(await drawnAndPainted(page, b, false), 'a clip inside the Upgrade is caught').not.toEqual([]);
  });
  test('a legacy clip: rect() on the label\'s text span, absolutely positioned where it was', async ({ page }) => {
    const { b } = await medium(page);
    const span = b.locator('[data-btn-label]');
    // The span pinned absolutely at its own place (legacy clip applies only to absolutely positioned boxes), the button
    // kept at its size: the clean pinned Upgrade passes first, then the clip cuts its lower 40%.
    await span.evaluate((el) => {
      const btn = el.closest('button') as HTMLElement;
      const br = btn.getBoundingClientRect();
      const sr = el.getBoundingClientRect();
      Object.assign(btn.style, { width: `${br.width}px`, height: `${br.height}px`, position: 'relative' });
      Object.assign((el as HTMLElement).style, { position: 'absolute', left: `${sr.left - br.left - btn.clientLeft}px`, top: `${sr.top - br.top - btn.clientTop}px`, width: `${sr.width}px`, whiteSpace: 'nowrap' });
    });
    expect(await drawnAndPainted(page, b, false), 'control: the pinned span alone passes').toEqual([]);
    await span.evaluate((el) => {
      const r = el.getBoundingClientRect();
      (el as HTMLElement).style.clip = `rect(0px, ${r.width}px, ${Math.round(r.height * 0.6)}px, 0px)`;
    });
    expect(await drawnAndPainted(page, b, false), 'a legacy clip inside the Upgrade is caught').not.toEqual([]);
  });
  test('a cover the colour of what is under it, over low-contrast note text', async ({ page }) => {
    const { note } = await medium(page);
    // What is under the note, read off the screen just outside its text, then the text a shade from it.
    const r = (await note.boundingBox())!;
    const px = await page.screenshot({ clip: { x: Math.ceil(r.x + r.width) - 2, y: Math.ceil(r.y), width: 1, height: 1 }, scale: 'css' });
    const under = await page.evaluate(async (b64) => {
      const i = new Image();
      i.src = `data:image/png;base64,${b64}`;
      await i.decode();
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      const x = c.getContext('2d')!;
      x.drawImage(i, 0, 0);
      return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    }, px.toString('base64'));
    await note.evaluate((el, [r0, g0, b0]) => {
      const shade = (v: number) => (v > 127 ? v - 6 : v + 6);
      (el as HTMLElement).style.color = `rgb(${shade(r0!)}, ${shade(g0!)}, ${shade(b0!)})`;
    }, under);
    await note.evaluate((el, [r0, g0, b0]) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const q = el.getBoundingClientRect();
      const c = document.createElement('div');
      Object.assign(c.style, { position: 'fixed', left: `${q.left}px`, top: `${q.top}px`, width: `${q.width * 0.3}px`, height: `${q.height}px`, background: `rgb(${r0}, ${g0}, ${b0})`, pointerEvents: 'none', zIndex: '2147483647' });
      document.body.append(c);
    }, under);
    expect(await drawnAndPainted(page, note, true), 'a background-coloured cover over faint text is caught').not.toEqual([]);
  });
  test('a text run at font-size 0 inside the note', async ({ page }) => {
    const { note } = await medium(page);
    await note.evaluate((el) => {
      const s = document.createElement('span');
      s.textContent = ' hidden words';
      s.style.fontSize = '0';
      el.append(s);
    });
    expect(await drawnAndPainted(page, note, true), 'a zero-size text run is caught').not.toEqual([]);
  });
  test('a text run at 4 px inside the note: it paints, but below the 8 px floor', async ({ page }) => {
    const { note } = await medium(page);
    await note.evaluate((el) => {
      const s = document.createElement('span');
      s.textContent = ' small words';
      s.style.fontSize = '4px';
      el.append(s);
    });
    expect(await drawnAndPainted(page, note, true), 'a 4 px text run is caught').not.toEqual([]);
  });
});
test.describe('drawnAndPainted at device pixel ratio 2 (negative control)', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the card cuts 0.75 px off the Upgrade\'s end edge (1.5 device pixels); the clean Upgrade passes first', async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, '/billing?sub=a1b2c3d4e5f60718293a4b01', { state: 'long' });
    const box = page.locator('[data-kit="plan-card"][aria-label="Medium"]'); // reason: the kit PlanCard of Medium
    const b = box.getByRole('button', { name: /^Upgrade to Medium: /, exact: false });
    await expect(b).toBeVisible({ timeout: 15_000 });
    expect(await drawnAndPainted(page, b, false), 'control: the clean Upgrade passes at DPR 2').toEqual([]);
    await b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await b.evaluate((el) => {
      const card = el.closest('[data-kit="plan-card"]') as HTMLElement;
      const c = card.getBoundingClientRect();
      const q = el.getBoundingClientRect();
      const x = q.right - c.left;
      const y = q.top - c.top;
      card.style.clipPath = `path(evenodd, "M0 0 H${c.width} V${c.height} H0 Z M${x - 0.75} ${y - 1} L${x + 1} ${y - 1} L${x + 1} ${y + q.height + 1} L${x - 0.75} ${y + q.height + 1} Z")`;
    });
    expect(await drawnAndPainted(page, b, false), 'a 0.75 px edge cut is caught at DPR 2').not.toEqual([]);
  });

});

// A launcher row's Open is its one inline action and Options is
// in its ⋯ menu (std row actions). In the drawer's table and in its phone list, Open is whole and, with the ⋯, inside
// the row: top, bottom and end; on a phone both sit in line 2, over none of its fields. No row shows an Options button any more.
async function launcher(page: Page, what: string, phone = false) {
  await gotoHub(page, '/programs?tab=apps');
  await page.getByRole('button', { name: apps['launch.action'] }).first().click(); // reason: the page header and the empty table may both offer it
  const d = page.getByRole('dialog');
  // The find pane's rows are the ones with a row menu; the drawer's other cards (installed agents) have their own Open.
  const menus = d.getByRole('button', { name: /^(Row actions|More actions for )/ });
  await expect(menus.first()).toBeVisible({ timeout: 15_000 }); // reason: one menu per ready app; each row is checked below
  expect(await d.getByRole('button', { name: apps['act.options'], exact: true }).count(), `${what}: no Options button in a row`).toBe(0);
  let pairs = 0;
  let belowLine2 = 0;
  let fields = 0;
  for (const more of (await menus.all()).slice(0, 6)) {
    const row = more.locator('xpath=ancestor::*[@role="row" or self::tr or self::li][1]');
    const open = row.getByRole('button', { name: apps['act.open'], exact: true });
    expect(await open.count(), `${what}: the row has one Open beside its menu`).toBe(1);
    const o = open.first(); // reason: the count above is exactly one
    await expect(o, `${what} Open`).toBeVisible();
    const cut = await o.evaluate((el) => Math.max(0, ...Array.from(el.querySelectorAll('span'), (x) => x.scrollWidth - x.clientWidth), el.scrollWidth - el.clientWidth));
    expect(cut, `${what}: Open label cut by ${cut}px`).toBeLessThanOrEqual(1);
    pairs++;
    const r = (await row.boundingBox())!;
    const line2 = row.locator('[class*="listLine2"]');
    const l2 = (await line2.count()) ? await line2.first().boundingBox() : null; // reason: a list row has one line 2
    for (const [c, n] of [[(await o.boundingBox())!, 'Open'], [(await more.boundingBox())!, 'the row menu']] as const) {
      expect(c.x, `${what}: ${n} starts inside the row`).toBeGreaterThanOrEqual(r.x - 1);
      expect(c.x + c.width, `${what}: ${n} stays inside the row`).toBeLessThanOrEqual(r.x + r.width + 1);
      expect(c.x + c.width, `${what}: ${n} inside the window`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      // Top and bottom too: buttons hanging over the row's border take a tap meant for the row above.
      expect(c.y, `${what}: ${n} starts below the row's top`).toBeGreaterThanOrEqual(r.y - 1);
      expect(c.y + c.height, `${what}: ${n} ends above the row's bottom`).toBeLessThanOrEqual(r.y + r.height + 1);
      if (l2) {
        // The kit list sets a row's actions at the end of line 2 (std row actions): they sit inside line 2 and cover
        // none of its meta fields, so a tap on a field lands on neither (1 px for rounding).
        expect(c.y, `${what}: ${n} inside line 2 (top)`).toBeGreaterThanOrEqual(l2.y - 1);
        expect(c.y + c.height, `${what}: ${n} inside line 2 (bottom)`).toBeLessThanOrEqual(l2.y + l2.height + 1);
        for (const f of await row.locator('[class*="listLine2"] [class*="listItem"]').all()) {
          const m = await f.boundingBox();
          if (!m || m.width === 0) continue;
          fields++;
          const over = c.x < m.x + m.width - 1 && m.x < c.x + c.width - 1 && c.y < m.y + m.height - 1 && m.y < c.y + c.height - 1;
          expect(over, `${what}: ${n} covers no meta field of line 2`).toBe(false);
        }
        belowLine2++;
      }
    }
  }
  // Never vacuous: some row had Open and its menu, and on a phone the line-2 check really ran.
  expect(pairs, `${what}: some row has Open and its menu`).toBeGreaterThan(0);
  if (phone) expect(belowLine2, `${what}: line 2 was checked against both`).toBeGreaterThan(0);
  if (phone) expect(fields, `${what}: some meta field was checked against the buttons`).toBeGreaterThan(0);
  // Options is one press away in the first row's menu.
  await d.getByRole('button', { name: /^(Row actions|More actions for )/ }).first().click(); // reason: any row's menu holds its Options
  await expect(page.getByRole('menuitem', { name: new RegExp(`^${apps['act.options']}`) })).toBeVisible();
}
test('the launcher table at 1350: Open whole with the row menu beside it, Options in the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await launcher(page, 'table 1350');
});
test.describe('the launcher list on a phone (fine pointer)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('Open whole with the row menu beside it, both inside the row', async ({ page }) => {
    await launcher(page, 'list fine 390', true);
  });
});
test.describe('the launcher list on a phone (coarse pointer)', () => {
  test.use(coarse390);
  test('Open whole with the row menu beside it', async ({ page }) => {
    await launcher(page, 'list coarse 390', true);
  });
});

// The bounded verb is the visible word everywhere above; the name keeps the rest (label in name).
test('billing strings: the upgrade name starts with the visible words', () => {
  expect(billing['up.toPlanNamed'].startsWith(billing['up.toPlanShort'].replace('{{plan}}', ''))).toBe(true);
  expect(ask['ask.start'].startsWith(ask['ask.startShort'])).toBe(true);
  expect(home['intro.open'].startsWith(home['intro.openShort'])).toBe(true);
});
