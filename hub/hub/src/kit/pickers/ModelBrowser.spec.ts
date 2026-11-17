// Playwright: the model chooser in a real browser, from the kit gallery (/_kit?tab=models).
// At phone width on a touch screen, in every state and in each view the shots open by acting (Directory, a 598-model
// drill-in on page 2, search, consent):
//   - nothing leaves the screen sideways (no page overflow, no row wider than the chooser);
//   - every control and option is at least 44 px tall;
//   - every option's accessible name starts with the model's full name, and a cut label keeps it in its title;
//   - axe finds nothing (WCAG 2 A/AA), at 390 and at 1440.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import mc from './ModelChooser.strings.en.json';

// The gallery frame around the chooser (a CSS selector: axe takes no Playwright selectors).
const FRAME = '[data-gallery="model-chooser"]';

interface Place {
  name: string;
  state: string;
  act?: (page: Page) => Promise<void>;
}

const frame = (page: Page) => page.locator(FRAME);

const PLACES: Place[] = [
  { name: 'ready, free only', state: 'free' },
  { name: 'ready, three providers', state: 'three' },
  { name: 'ready read failed', state: 'readyFailed' },
  { name: 'catalogue failed', state: 'catFailed' },
  { name: 'the connect verb', state: 'connect' },
  { name: "the Agent's default", state: 'agent' },
  { name: 'loading', state: 'loading' },
  { name: 'an older agent', state: 'legacy' },
  {
    name: 'the Directory',
    state: 'dir',
    act: async (page) => {
      await frame(page).getByRole('button', { name: mc['mc.setupOpen'] }).click();
      await frame(page).getByRole('heading', { name: mc['dir.other'] }).waitFor();
    },
  },
  {
    name: 'a 598-model drill-in, page 2',
    state: 'drill',
    act: async (page) => {
      await frame(page).getByRole('searchbox').fill('nanogpt');
      await frame(page).getByRole('button', { name: /^NanoGPT/ }).click();
      await frame(page).getByRole('navigation', { name: 'NanoGPT models pages' }).getByRole('button', { name: mc['page.next'] }).click();
      await frame(page).getByText('101–200 of 598').first().waitFor(); // the pager states its range twice: the visible line and its live region
    },
  },
  {
    name: 'search "gpt"',
    state: 'search',
    act: async (page) => {
      await frame(page).getByRole('searchbox').fill('gpt');
      await frame(page).getByRole('group', { name: new RegExp(`^${mc['search.ready']} `) }).waitFor();
    },
  },
  {
    name: 'consent',
    state: 'consent',
    act: async (page) => {
      await frame(page).locator('[role="option"][data-spec^="mistral/"]').first().click();
      await frame(page).getByRole('button', { name: mc['unk.use'] }).waitFor();
    },
  },
];

async function open(page: Page, p: Place) {
  await gotoHub(page, `/_kit?tab=models&mc=${p.state}`);
  await frame(page).waitFor({ timeout: 30_000 });
  await frame(page).locator('[data-mc-row], [role="alert"], h4').first().waitFor({ timeout: 30_000 });
  await p.act?.(page);
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include(FRAME).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('the model chooser at 390 on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const p of PLACES) {
    test(p.name, async ({ page }) => {
      test.setTimeout(90_000);
      await open(page, p);
      const facts = await frame(page).evaluate((root) => {
        const box = root.getBoundingClientRect();
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const wide = [...root.querySelectorAll('[data-mc-row], [role="option"], button')]
          .filter(visible)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < box.left - 0.5 || r.right > box.right + 0.5;
          })
          .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName);
        // A kit xs button (Clear search, IconButton xs) draws 24 and takes its 44 press from ::after, centred on
        // it: judged by that press box, as touch-targets.spec.ts targetBox does. Every other control by what it draws.
        const pressHeight = (el: Element) => {
          const h = el.getBoundingClientRect().height;
          const xs = [...el.classList].some((c) => /(^|_)xs(_|$)/.test(c));
          const after = getComputedStyle(el, '::after');
          return xs && after.position === 'absolute' ? Math.max(h, parseFloat(after.height) || 0) : h;
        };
        const small = [...root.querySelectorAll('button, [role="option"], input, a[href]')]
          .filter(visible)
          .filter((el) => !el.closest('[aria-hidden="true"]'))
          .filter((el) => pressHeight(el) < 44)
          .map((el) => `${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName} (${Math.round(el.getBoundingClientRect().height)} px)`);
        // An option's name is its content minus the aria-hidden parts (state, facts): computed the same way here.
        const named = (el: Element) => {
          const copy = el.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
          return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
        };
        const names = [...root.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => {
          const label = o.querySelector<HTMLElement>('[title]');
          const full = label?.getAttribute('title') ?? '';
          return { name: o.getAttribute('aria-label') ?? named(o), full, shown: label?.textContent ?? '' };
        });
        return {
          wide,
          small,
          names,
        };
      });
      await noSideScroll(page);
      expect(facts.wide, 'rows wider than the chooser').toEqual([]);
      expect(facts.small, 'targets under 44 px').toEqual([]);
      for (const n of facts.names) {
        expect(n.full, 'the label keeps the full name').toBe(n.shown);
        expect(n.name.startsWith(n.full), `the option's name starts with "${n.full}"`).toBe(true);
      }
      expect(await axe(page)).toEqual([]);
    });
  }
});

test.describe('the model chooser at 1440', () => {
  for (const p of PLACES) {
    test(`axe: ${p.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await open(page, p);
      expect(await axe(page)).toEqual([]);
    });
  }
});
