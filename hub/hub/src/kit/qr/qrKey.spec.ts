// Every code that carries a key wears the key
// badge on top of it and its caption under it, on the real pages (a QR panel instead starts its caption with the key
// mark: its layout is measured at the end of this file). The badge sits above the code box (outside the code and
// its quiet zone), inside the window; the code keeps its size; the code is described by the caption. Light and dark,
// desktop and phone.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

const NOTE = 'Contains a key. Only share it with people you trust.';
const NOTE_2FA = 'Contains your sign-in key: anyone who scans it can make your sign-in codes';
// A realm share's code says what it opens and until when (pages/keys ShareShown: the caption is the warning).
const NOTE_SHARE = /^This code holds the token: anyone who scans it can open Personal until \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\.$/;

// The surfaces live on several pages: a one-page dev server (HUB_PAGE set to one page) cannot show them all.
const ONE_PAGE = !!process.env.HUB_PAGE && process.env.HUB_PAGE !== '*';
test.skip(ONE_PAGE, 'the key badge surfaces span Keys, Bots, Home and Account');

interface Surface {
  /** Opens the surface and returns the element holding the code, its badge and its caption. */
  open: (page: Page, theme: 'light' | 'dark') => Promise<Locator>;
  /** The caption under the code (a page may write its own, as the realm share does). */
  note: string | RegExp;
  /** The code box's side, in px. */
  box: number;
  /** The drawn code's side, in px: pinned, so a box that keeps its size but grows its padding (a smaller code) fails. */
  drawn: number;
}

const SURFACES: Record<string, Surface> = {
  'Keys share with the token': {
    note: NOTE_SHARE,
    box: 200,
    drawn: 200,
    open: async (page, theme) => {
      await gotoHub(page, '/keys/shared', { theme });
      await page.getByRole('button', { name: 'Share this realm', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByRole('button', { name: 'Review', exact: true }).click();
      await d.getByRole('button', { name: 'Create share', exact: true }).click();
      // The QR code, the switch and the agent prompt sit in one closed fold under the message.
      await d.getByRole('button', { name: /^QR code and agent prompt/ }).click();
      await d.getByRole('switch', { name: 'Include the token' }).click({ force: true });
      await d.getByRole('button', { name: 'Show code' }).click();
      return d;
    },
  },
  'Bot key share': {
    note: NOTE,
    box: 200,
    drawn: 200,
    open: async (page, theme) => {
      await gotoHub(page, `/bots?sel=${encodeURIComponent('c-atlas~a1b2c3d4e5f60718293a4b5c~chief')}&tab=link&drawer=key`, { theme });
      await page.getByRole('dialog', { name: 'New key' }).getByRole('button', { name: 'Make key' }).click();
      await page.getByRole('button', { name: 'Show the code with the key', exact: true }).click();
      return page.getByRole('dialog').last();
    },
  },
  'two-step sign-in setup': {
    note: NOTE_2FA,
    box: 200,
    // The 2FA image sits inside its framed box: 200 less a 1 px border and an 8 px padding on each side.
    drawn: 182,
    open: async (page, theme) => {
      await gotoHub(page, '/account', { state: 'twofa-off', theme });
      await page.getByRole('button', { name: 'Turn on' }).last().click();
      const d = page.getByRole('dialog', { name: 'Turn on two-step sign-in' });
      await d.getByLabel('Current password').fill('password');
      await d.getByRole('button', { name: 'Continue' }).click();
      return d;
    },
  },
};

async function check(page: Page, root: Locator, s: Surface, width: number) {
  const mark = root.locator('svg[data-qr-key]');
  await expect(mark).toHaveCount(1, { timeout: 20_000 });
  await expect(mark).toBeVisible();
  // The code is described by the visible caption.
  const described = await root.locator('svg[role="img"][aria-describedby], img[aria-describedby]').first().evaluate((el) => document.getElementById(el.getAttribute('aria-describedby')!)?.textContent?.trim());
  if (typeof s.note === 'string') expect(described).toBe(s.note);
  else expect(described).toMatch(s.note);
  await expect(root.getByText(s.note, { exact: true })).toBeVisible();
  // The badge (the mark's parent) and the box it sits on, the bordered box that holds the code: QrSecret's own box (the
  // badge's next sibling) when the page draws the border on it (boxClassName), else that box's first child (the code
  // itself, or the bordered box of a QR panel).
  const badge = mark.locator('xpath=..');
  await expect(badge).toHaveText('Key');
  // A tall surface on a narrow phone may open scrolled to its field: bring the badge into view before measuring it.
  await badge.scrollIntoViewIfNeeded();
  const box = (await badge.evaluate((el) => {
    const own = el.nextElementSibling as HTMLElement;
    const bx = parseFloat(getComputedStyle(own).borderTopWidth) > 0 ? own : (own.firstElementChild as HTMLElement);
    const r = bx.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }))!;
  const b = (await badge.boundingBox())!;
  // On top: wholly above the box, so no row of the code (or of its quiet zone) has it beside it; centred over it.
  expect(b.y + b.height, 'badge above the box').toBeLessThanOrEqual(box.y);
  expect(Math.abs(b.x + b.width / 2 - (box.x + box.w / 2)), 'badge centred over the box').toBeLessThanOrEqual(1);
  expect((await mark.boundingBox())!.width).toBeGreaterThanOrEqual(16);
  // The caption is under the box.
  const caption = (await root.getByText(s.note, { exact: true }).boundingBox())!;
  expect(caption.y, 'caption under the box').toBeGreaterThanOrEqual(box.y + box.h);
  // The code keeps its size (a phone sheet's 280 px fits a 320 px screen too).
  expect(Math.round(box.w), 'box width').toBe(s.box === 240 && width < 600 ? 280 : s.box);
  expect(Math.round(box.h), 'box height').toBe(Math.round(box.w));
  // The drawing itself, at its pinned size and square (the code may be the box itself, or sit in a framed box): no size
  // change can hide inside a box that kept its size, a grown padding included.
  const drawn = await badge.evaluate((el) => {
    const own = el.nextElementSibling as HTMLElement;
    const bx = parseFloat(getComputedStyle(own).borderTopWidth) > 0 ? own : (own.firstElementChild as HTMLElement);
    const code = bx.matches('svg, img') ? bx : bx.querySelector<HTMLElement>('svg[role="img"], img');
    const r = code!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  expect(Math.round(drawn.h), 'code height').toBe(Math.round(drawn.w));
  expect(Math.round(drawn.w), 'code width').toBe(s.drawn);
  // Inside its surface and the window, and the page does not scroll sideways.
  const r = (await root.boundingBox())!;
  expect(b.y, 'badge inside its surface').toBeGreaterThanOrEqual(r.y);
  expect(b.x + b.width, 'badge inside the window').toBeLessThanOrEqual(width);
  await noSideScroll(page);
}

for (const [name, s] of Object.entries(SURFACES))
  for (const theme of ['light', 'dark'] as const)
    for (const width of [1440, 1350, 390, 320]) {
      test(`${name}: key badge and caption, ${theme}, ${width}`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 900 });
        const root = await s.open(page, theme);
        expect(await page.evaluate(() => document.documentElement.dataset.hxTheme)).toBe(theme);
        await check(page, root, s, width);
        if (process.env.SHOTS_DIR) {
          const base = `${process.env.SHOTS_DIR}/${name.replace(/\W+/g, '-')}-${theme}-${width}`;
          await page.screenshot({ path: `${base}.png` });
          // Scrolled to the caption (and the controls under it on a phone): proof they are reachable, not cut off.
          await root.getByText(s.note, { exact: true }).scrollIntoViewIfNeeded();
          const toggle = root.getByRole('button', { name: /^(Show|Hide)\b/ });
          if (await toggle.count()) await toggle.last().scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${base}-caption.png` });
        }
      });
    }

// A program address once shown: the address is the kit's new-tab link (a button, never an href that holds the key), the
// trust sentence opens its note on hover, focus and tap, and the size control sits beside Close.
for (const width of [1440, 390]) {
  test(`a program address: link, trust note and size control, ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const d = await openProgramQr(page, 'light', true);
    const link = d.locator('[data-secret-link]');
    await expect(link).toHaveCount(1, { timeout: 20_000 });
    const url = (await link.textContent())!.trim();
    expect(url).toMatch(/^https:\/\/[0-9a-f]{24}-[0-9a-f]{24}-terminal-1\./);
    expect(await page.locator('a[href*="-terminal-1."]').count()).toBe(0);
    const tip = d.getByRole('button', { name: 'Only share it with people you trust.' });
    if (width > 600) await tip.hover();
    else await tip.click();
    await expect(page.getByRole('dialog', { name: 'Only share it with people you trust.' })).toContainText('the whole computer');
    // The QR surface is still open with the note over it.
    await expect(d.getByRole('button', { name: 'Hide' })).toBeVisible();
    await d.getByRole('button', { name: 'Hide' }).click();
    await expect(d.locator('[data-secret-link]')).toHaveCount(0);
    expect(await d.textContent()).not.toContain(url);
  });
}

/** Opens a program address's QR surface on Home (Show pressed when `show`): the popover on a desktop, the sheet on a phone. */
async function openProgramQr(page: Page, theme: 'light' | 'dark', show: boolean): Promise<Locator> {
  await gotoHub(page, '/home', { theme });
  await page.getByRole('group', { name: /^Terminal/ }).first().getByRole('button', { name: 'QR code' }).click(); // reason: Home has a Terminal launch row per computer; any one opens a secret address
  const d = page.getByRole('dialog', { name: 'QR code: Terminal' }).last();
  await expect(d.getByRole('button', { name: 'Show' })).toBeVisible({ timeout: 20_000 });
  if (show) await d.getByRole('button', { name: 'Show' }).click();
  return d;
}

interface Measured {
  content: { l: number; r: number };
  lefts: Record<string, number>;
  rights: Record<string, number>;
  headCentres: number[];
  actionCentres: number[];
  code: { w: number; h: number };
  badges: number;
  captionMark: boolean;
}

/** The panel's slots measured in the page: every slot's left (and right) edge, the head's and the action row's centres. */
function measure(d: Locator): Promise<Measured> {
  return d.evaluate((dialog) => {
    const panel = dialog.firstElementChild as HTMLElement;
    const pr = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const content = { l: pr.left + parseFloat(cs.paddingLeft), r: pr.right - parseFloat(cs.paddingRight) };
    const head = panel.children[0] as HTMLElement;
    const title = head.querySelector('h2, h3, [slot="title"], [role="heading"]') as HTMLElement;
    const headButtons = [...head.querySelectorAll('button')] as HTMLElement[];
    const code = panel.querySelector('svg[role="img"]')!.parentElement as HTMLElement;
    const caption = panel.querySelector('p[id]') as HTMLElement;
    const address = panel.querySelector('p[translate="no"], p[aria-hidden="true"]') as HTMLElement;
    const actions = [...(panel.lastElementChild as HTMLElement).querySelectorAll(':scope > button')] as HTMLElement[];
    const box = (el: Element) => el.getBoundingClientRect();
    const mid = (el: Element) => box(el).top + box(el).height / 2;
    return {
      content,
      lefts: { title: box(title).left, code: box(code).left, caption: box(caption).left, address: box(address).left, firstAction: box(actions[0]!).left },
      rights: { lastHeadButton: box(headButtons[headButtons.length - 1]!).right, code: box(code).right, lastAction: box(actions[actions.length - 1]!).right },
      headCentres: [mid(title), ...headButtons.map(mid)],
      actionCentres: actions.map(mid),
      code: { w: box(code).width, h: box(code).height },
      badges: panel.querySelectorAll('svg[data-qr-key]').length,
      captionMark: !!caption.querySelector('svg'),
    };
  });
}

function checkSlots(m: Measured, codeSide: number | null) {
  for (const [k, v] of Object.entries(m.lefts)) expect(Math.abs(v - m.content.l), `${k} starts at the column's left edge`).toBeLessThanOrEqual(1);
  for (const [k, v] of Object.entries(m.rights)) expect(Math.abs(v - m.content.r), `${k} ends at the column's right edge`).toBeLessThanOrEqual(1);
  for (const c of m.headCentres) expect(Math.abs(c - m.headCentres[0]!), 'title, size and Close on one centre line').toBeLessThanOrEqual(1);
  expect(m.actionCentres.length).toBe(3);
  for (const c of m.actionCentres) expect(Math.abs(c - m.actionCentres[0]!), 'the actions on one row').toBeLessThanOrEqual(1);
  expect(Math.abs(m.code.w - m.code.h), 'the code is square').toBeLessThanOrEqual(1);
  if (codeSide !== null) expect(Math.abs(m.code.w - codeSide), 'the code fills its column').toBeLessThanOrEqual(1);
  // No floating badge: the caption starts with the key mark.
  expect(m.badges).toBe(0);
  expect(m.captionMark).toBe(true);
}

// A QR panel is one column of fixed slots: head (title | size | Close), code, caption, address, one action row. Every
// slot starts at the column's left edge and the code, the last head button and the last action end at its right edge
// (within 1 px), forced by the grid, at a desktop and a phone width, hidden and shown, light and dark.
for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390])
    for (const show of [false, true]) {
      test(`a program address QR panel: one column of slots, ${show ? 'shown' : 'hidden'}, ${theme}, ${width}`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 900 });
        const d = await openProgramQr(page, theme, show);
        // The popover's code spans its column (the 320 px popover less its frame and padding); the phone sheet's spans the
        // screen less its padding.
        checkSlots(await measure(d), width > 600 ? null : width - 32);
        await noSideScroll(page);
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/program-address-${show ? 'shown' : 'hidden'}-${theme}-${width}.png` });
        if (width > 600) {
          await d.getByRole('button', { name: 'Make larger' }).click();
          const big = page.getByRole('dialog', { name: 'QR code: Terminal' }).last();
          await expect(big.getByRole('button', { name: 'Make smaller' })).toBeVisible();
          checkSlots(await measure(big), 440);
          if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/program-address-large-${show ? 'shown' : 'hidden'}-${theme}-${width}.png` });
        }
      });
    }
