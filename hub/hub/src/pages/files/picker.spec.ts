// Playwright: a pane's computer picker with a long realm name keeps everything inside its field:
// the realm gives way within its share, the computer name stays readable, nothing leaves the trigger or the
// pane. Layout needs a real browser, not jsdom. The fixture computers and realms have short names, so both texts are set
// long in place, as the title spec does.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const LONG_REALM = 'Research and development, Frankfurt office, second floor';
const LONG_NAME = 'build-runner-eu-west-nightly';
// The kit names a picker by the words it shows, then this label: atlas runs in the Personal realm, whose chip the
// trigger shows, and its state is read after them (Label in Name).
const paneLabel = (pane: string) => strings['pick.label'].replace('{{pane}}', pane);
const pickerName = (pane: string) => `atlas Personal ${strings['pick.running']} ${paneLabel(pane)}`;

/** Sets the trigger's computer and realm texts long and measures the trigger, its text parts and its pane. */
async function measure(page: Page, label: string, width?: string) {
  return page.evaluate(
    ({ label, realm, long, width }) => {
      const button = [...document.querySelectorAll<HTMLElement>('button[aria-label]')].find((b) => b.getAttribute('aria-label') === label);
      if (!button) throw new Error(`no picker named ${label}`);
      if (width) button.style.width = width;
      // The trigger's name reads its text span first (aria-labelledby), then its own aria-label.
      const text = document.getElementById(button.getAttribute('aria-labelledby')?.split(' ')[0] ?? '');
      if (!text) throw new Error('no picker text');
      const name = text.firstElementChild as HTMLElement;
      const chip = text.children[1] as HTMLElement; // the realm chip, after the name (the spoken state follows it)
      const chipName = chip.lastElementChild as HTMLElement;
      name.textContent = long;
      chipName.textContent = realm;
      const r = (el: Element) => el.getBoundingClientRect();
      const pane = button.closest('section') ?? document.body;
      return {
        button: { left: r(button).left, right: r(button).right },
        pane: { right: r(pane).right },
        viewport: document.documentElement.clientWidth,
        parts: [name, chip].map((el) => ({ left: r(el).left, right: r(el).right })),
        nameWidth: r(name).width,
        nameText: name.textContent ?? '',
      };
    },
    { label, realm: LONG_REALM, long: LONG_NAME, width },
  );
}

function expectInside(m: Awaited<ReturnType<typeof measure>>) {
  for (const p of m.parts) {
    expect(p.left).toBeGreaterThanOrEqual(m.button.left - 1);
    expect(p.right).toBeLessThanOrEqual(m.button.right + 1);
  }
  expect(m.button.right).toBeLessThanOrEqual(Math.min(m.pane.right, m.viewport) + 1);
  // A few characters of the computer's name stay in view (at least about three letters) beside the long realm.
  expect(m.nameText).toBe(LONG_NAME);
  expect(m.nameWidth).toBeGreaterThanOrEqual(24);
}

test('a long realm name stays inside the picker at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fsrv');
  await expect(page.getByRole('button', { name: pickerName(strings['pane.a']), exact: true })).toContainText('atlas');
  expectInside(await measure(page, paneLabel(strings['pane.a'])));
});

test('a long realm name stays inside the picker of a narrow split pane', async ({ page }) => {
  // Just above the two-pane width with the sidebar collapsed to its rail: each pane is about 430 px.
  await page.setViewportSize({ width: 1024, height: 800 });
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=%2Fsrv');
  const b = page.getByRole('button', { name: pickerName(strings['pane.b']), exact: true });
  await expect(b).toContainText('atlas');
  expectInside(await measure(page, paneLabel(strings['pane.b'])));
});

test('a long realm name leaves the computer name readable in a narrow field', async ({ page }) => {
  // The gallery's narrow sample: a 16rem field, where the realm must not take the name's room.
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fsrv');
  await expect(page.getByRole('button', { name: pickerName(strings['pane.a']), exact: true })).toContainText('atlas');
  expectInside(await measure(page, paneLabel(strings['pane.a']), '16rem'));
});
