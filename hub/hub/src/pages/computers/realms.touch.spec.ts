// Playwright: on a phone with a coarse pointer, the Overview's realm actions (Manage, and Add to a realm for a
// computer in no realm; the realm list's opener with several realms) are 44 px touch targets (the page's own .touch box), no two of the fact's buttons
// overlap even when the row wraps, each button owns its own edges, and a tap opens the computer's Realms drawer.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const interpolate = (text: string, v: { name: string }) => text.replaceAll('{{name}}', v.name);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const drawer = (page: Page) => page.getByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
const fact = (page: Page) => page.locator('dt', { hasText: strings['fact.realms'] }).locator('xpath=..');
/** On a phone the Overview's Details sit below the Open on tiles: the measures below read elementFromPoint,
 *  which sees only the viewport and not what the fixed bottom bar covers, so the Realms fact is scrolled to the middle. */
const showFact = async (page: Page) => {
  await fact(page).waitFor();
  await fact(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
};
/** The touch target's height: how far above and below its centre a tap still lands on the button. A hit layer (an
 *  invisible ::after) counts, as a finger would find it; the drawn box alone may be shorter. */
const height = async (page: Page, name: string) =>
  fact(page)
    .getByRole('button', { name, exact: true })
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hits = (dy: number) => {
        const at = document.elementFromPoint(x, y + dy);
        return at !== null && (at === el || el.contains(at));
      };
      let up = 0;
      while (up < 40 && hits(-(up + 1))) up++;
      let down = 0;
      while (down < 40 && hits(down + 1)) down++;
      return up + down + 1;
    });

test('@realms the Realms fact actions are 44 px targets, and a tap on Manage opens the drawer', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1');
  await showFact(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expect(fact(page).getByRole('button', { name: strings['realm.manage'], exact: true })).toBeVisible();
  expect(await height(page, strings['realm.manage'])).toBeGreaterThanOrEqual(44);
  await fact(page).getByRole('button', { name: strings['realm.manage'], exact: true }).tap();
  await expect(drawer(page)).toBeVisible();
});

test('@realms a computer in no realm: Add to a realm is a 44 px target, and a tap opens the drawer', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1', { state: 'noRealm' });
  await showFact(page);
  await expect(fact(page).getByRole('button', { name: strings['realm.add'], exact: true })).toBeVisible();
  expect(await height(page, strings['realm.add'])).toBeGreaterThanOrEqual(44);
  await fact(page).getByRole('button', { name: strings['realm.add'], exact: true }).tap();
  await expect(drawer(page)).toBeVisible();
});

/** Ownership: every button in the Realms fact (Manage, Add to a realm, id copy buttons, the no-realm
 *  note) has a box that meets no other's, and a point 2 px inside each of its four edges lands on that button and on
 *  no neighbour. `wrapAt` narrows the fact's value so its rows wrap first. */
const owns = async (page: Page, wrapAt?: number) =>
  fact(page).evaluate((row, w) => {
    const dd = row.querySelector('dd');
    if (w !== undefined && dd) (dd as HTMLElement).style.inlineSize = `${w}px`;
    const buttons = [...row.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
    const rects = buttons.map((b) => b.getBoundingClientRect());
    const overlaps: string[] = [];
    rects.forEach((a, i) =>
      rects.forEach((b, j) => {
        if (j <= i) return;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${i}/${j}`);
      }),
    );
    const strays: string[] = [];
    buttons.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const points: [number, number][] = [[cx, r.top + 2], [cx, r.bottom - 2], [r.left + 2, cy], [r.right - 2, cy]];
      for (const [x, y] of points) {
        const at = document.elementFromPoint(x, y);
        if (!(at !== null && (at === el || el.contains(at)))) strays.push(`${el.getAttribute('aria-label') ?? el.textContent}@${Math.round(x)},${Math.round(y)}`);
      }
    });
    return { count: buttons.length, overlaps, strays, ddWidth: dd ? Math.round(dd.getBoundingClientRect().width) : null };
  }, wrapAt);

/** Wrapping, proven on one pair: the button named `name` and its neighbour (the button named `other`, else the next
 *  button in its own row) sit on separate lines, one wholly below the other. */
const splitLines = async (page: Page, name: string, other?: string) =>
  fact(page).evaluate(
    (row, [n, o]) => {
      const named = (b: Element, x: string) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === x;
      const buttons = [...row.querySelectorAll('button')];
      const a = buttons.find((b) => named(b, n!));
      // Manage sits in its own "· Manage" group, so the other button is the row's first one that is not it.
      const b = o ? buttons.find((x) => named(x, o)) : buttons.find((x) => x !== a);
      if (!a || !b) return null;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top >= rb.bottom || rb.top >= ra.bottom;
    },
    [name, other] as const,
  );

test('@realms wrapped at 390 px on a coarse pointer, the Realms fact buttons never overlap and each owns its edges', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1');
  await showFact(page);
  const manage = fact(page).getByRole('button', { name: strings['realm.manage'], exact: true });
  await expect(manage).toBeVisible();
  // One realm: its id copy button and Manage. At 90 px they wrap onto separate lines.
  for (const w of [undefined, 160, 90]) {
    const o = await owns(page, w);
    if (w !== undefined) expect(o.ddWidth).toBe(w);
    expect(o.count).toBeGreaterThanOrEqual(2);
    expect(o.overlaps).toEqual([]);
    expect(o.strays).toEqual([]);
  }
  expect(await splitLines(page, strings['realm.manage'])).toBe(true);
  // A tap at the top edge of Manage runs its action.
  const box = await manage.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + 2);
  await expect(drawer(page)).toBeVisible();
});

test('@realms a computer in no realm, wrapped at 390 px: Add to a realm and the note never overlap, and an edge tap opens the drawer', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1', { state: 'noRealm' });
  await showFact(page);
  const add = fact(page).getByRole('button', { name: strings['realm.add'], exact: true });
  await expect(add).toBeVisible();
  const note = await fact(page).locator('button').first().evaluate((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());
  // At 390 px the row already wraps: Add to a realm sits wholly below the note at every width.
  for (const w of [undefined, 120, 60]) {
    const o = await owns(page, w);
    if (w !== undefined) expect(o.ddWidth).toBe(w);
    expect(o.count).toBeGreaterThanOrEqual(2);
    expect(o.overlaps).toEqual([]);
    expect(o.strays).toEqual([]);
    expect(await splitLines(page, strings['realm.add'], note)).toBe(true);
  }
  const box = await add.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height - 2);
  await expect(drawer(page)).toBeVisible();
});

test('@realms thirty realms at 390 px on a coarse pointer: the list opens as a sheet, its ‹ closes it, and Manage realms hands over to the drawer', async ({ page }) => {
  await gotoHub(page, '/computers?sel=atlas.00a1', { state: 'realms30' });
  await showFact(page);
  const opener = fact(page).getByRole('button', { name: /^\+\d+ more: all 30 realms of atlas/ });
  const list = page.getByRole('dialog', { name: interpolate(strings['realm.listTitle'], { name: 'atlas' }).replaceAll('{{count}}', '30') });
  await opener.tap();
  await expect(list).toBeVisible();
  // The phone list is the kit's full-screen sheet: its ‹ closes it and gives focus back to the opener.
  await list.getByRole('button', { name: 'Close' }).tap();
  await expect(list).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.tap();
  await list.getByRole('button', { name: strings['realm.manageAll'], exact: true }).tap();
  await expect(drawer(page)).toBeVisible();
  await expect(list).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(opener).toBeFocused();
});
