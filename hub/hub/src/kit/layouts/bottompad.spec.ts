// Playwright: on a phone (390 × 844) the bottom bar never covers the last action of a detail, a drawer or a
// sheet. For each place: open it, find its last action by name (and check
// it is still the box's last button), scroll it into view with block 'end', then scroll the main area to its
// end; at each point the element at the button's centre must be the button or inside it, never the bottom bar.
// A page that wraps ListDetailPage in a fixed-height frame is covered too: an overflow there leaves the last rows under the bar.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '../strings.en.json';
import shell from '../../shell/strings.en.json';

test.use({ viewport: { width: 390, height: 844 } });

interface Place {
  name: string;
  path: string;
  /** Opens the place after the load (a drawer from a button). */
  open?: (page: Page) => Promise<void>;
  /** Where the last action lives. */
  box: (page: Page) => Locator;
  /** The accessible name of the box's last action: a page that adds a button after it fails here, not silently. */
  last: string;
}

// The ListDetailPage detail pane by its own aria-label: a detail may hold a section titled the same ("Details", the
// computers Overview's facts, pages/computers/parts/Overview.tsx), which a role query would also match.
const detail = (page: Page) => page.locator(`section[aria-label="${kit['listDetail.detail']}"]`);
const dialog = (page: Page) => page.getByRole('dialog');

const PLACES: Place[] = [
  { name: 'keys inspector (Delete)', path: '/keys?sel=hdy_9e37.3779b1', box: detail, last: 'Delete…' },
  { name: 'computers detail', path: '/computers?sel=atlas.00a1', box: detail, last: 'Debian 13' }, // the facts section's image, last since "About usage" left (Overview.tsx)
  { name: 'programs detail', path: '/programs?sel=prog%3A1', box: detail, last: 'Technical details' },
  { name: 'apps detail', path: '/apps?sel=a1b2c3', box: detail, last: 'Remove' },
  { name: 'bots detail', path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', box: detail, last: 'Send' },
  {
    name: 'keys new-key drawer footer',
    path: '/keys',
    open: (page) => page.getByRole('button', { name: 'New key', exact: true }).click(),
    box: dialog,
    last: 'Make key',
  },
  { name: 'account password sheet footer', path: '/account?sheet=password', box: dialog, last: 'Change password' },
];

/**
 * What sits at the centre of the button: 'ok' when it is the button or inside it, else what covers it.
 * With `bottomOnly`, only the bottom of the screen counts: a long page scrolled to its end may carry
 * the button up under the top bar or out of view, which is not what this spec is about.
 */
async function hitAt(button: Locator, bottomOnly = false): Promise<string> {
  return button.evaluate(
    (b, { barLabel, bottomOnly }) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === b || b.contains(hit))) return 'ok';
      if (hit?.closest(`nav[aria-label="${barLabel}"]`)) return 'under the bottom bar';
      if (r.top >= window.innerHeight) return `below the screen (top ${Math.round(r.top)})`;
      if (bottomOnly) return 'ok';
      return hit ? `covered by <${hit.tagName.toLowerCase()} class="${hit.className}">` : `off screen (top ${Math.round(r.top)})`;
    },
    { barLabel: shell['bottom.label'], bottomOnly },
  );
}

for (const place of PLACES) {
  test(`@bottompad ${place.name}: the last action is reachable above the bottom bar at 390`, async ({ page }) => {
    await gotoHub(page, place.path);
    await place.open?.(page);
    const box = place.box(page);
    await expect(box, 'the detail, drawer or sheet is open').toBeVisible();
    // The last action of the box is the one the bar can cover: named, and checked to be the box's last button.
    const button = box.getByRole('button', { name: place.last, exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate((b, lastShown) => b === lastShown, await box.locator('button:visible').last().elementHandle()), `"${place.last}" is the last button of ${place.name}`).toBe(true);

    await button.evaluate((b) => b.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(100);
    expect(await hitAt(button), `"${place.last}" after scrolling it into view`).toBe('ok');

    await page.locator('#hub-main').evaluate((m) => m.scrollTo({ top: m.scrollHeight }));
    await page.waitForTimeout(100);
    expect(await hitAt(button, true), `"${place.last}" with the main area scrolled to its end`).toBe('ok');
  });
}
