// Playwright: the composed chooser's setup step in a real browser, from the kit gallery
// (/_kit?tab=chooser). For each kind of setup (API key, ChatGPT sign-in, OpenRouter sign-in, endpoint key) and each
// attempt result the gallery reaches (confirming, couldn't confirm, still needs setup), at phone width on a touch screen:
// nothing leaves the screen sideways, every control is at least 44 px tall and axe finds nothing (WCAG 2 A/AA); axe
// again at 1440.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import ps from './ProviderSetup.strings.en.json';

const FRAME = '[data-gallery="model-chooser"]';
const frame = (page: Page) => page.locator(FRAME);

interface Place {
  name: string;
  state: string;
  provider: string;
  /** Type a key and save, then wait for this text. */
  saved?: string | RegExp;
  /** The step offers a sign-in or a key as RadioGroup options (measured as 44 px targets too). */
  radios?: boolean;
}

const PLACES: Place[] = [
  { name: 'the API key step', state: 'key', provider: 'Anthropic' },
  { name: 'ChatGPT sign-in', state: 'chatgpt', provider: 'OpenAI', radios: true },
  { name: 'OpenRouter sign-in', state: 'openrouter', provider: 'OpenRouter', radios: true },
  { name: 'an endpoint key', state: 'endpoint', provider: 'My endpoint' },
  { name: 'confirming', state: 'confirming', provider: 'Anthropic', saved: 'Key saved. Checking Anthropic…' },
  { name: "couldn't confirm", state: 'unconfirmed', provider: 'Anthropic', saved: "Key saved. Couldn't confirm readiness." },
  { name: 'still needs setup', state: 'still', provider: 'Anthropic', saved: 'Anthropic still needs setup.' },
];

async function open(page: Page, p: Place) {
  await gotoHub(page, `/_kit?tab=chooser&ch=${p.state}`);
  await frame(page).waitFor({ timeout: 30_000 });
  await frame(page).getByRole('button', { name: `Set up ${p.provider}` }).click();
  await frame(page).getByRole('heading', { level: 4, name: new RegExp(`^Set up ${p.provider}`) }).waitFor();
  if (p.saved) {
    await frame(page).locator('input[type="password"]').fill('sk-sample');
    await frame(page).getByRole('button', { name: ps['key.save'] }).click();
    await frame(page).getByText(p.saved).waitFor();
  }
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include(FRAME).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('the setup step at 390 on a touch screen', () => {
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
        const step = root.querySelector('section[aria-labelledby$="-setup-h"]') ?? root;
        const wide = [...step.querySelectorAll('button, input, p')]
          .filter(visible)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < box.left - 0.5 || r.right > box.right + 0.5;
          })
          .map((el) => el.textContent?.trim().slice(0, 40) || el.tagName);
        // A kit RadioGroup option (ChatGPT or OpenRouter sign-in, or a key) is measured by its label: the radio input
        // itself is visually hidden.
        const small = [...step.querySelectorAll('button, input:not([type="radio"]), a[href], label:has(input[type="radio"])')]
          .filter(visible)
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => `${el.textContent?.trim().slice(0, 40) || el.tagName} (${Math.round(el.getBoundingClientRect().height)} px)`);
        const radios = [...step.querySelectorAll('label:has(input[type="radio"])')].filter(visible).length;
        return { wide, small, radios };
      });
      if (p.radios) expect(facts.radios, 'the RadioGroup options are drawn (so the 44 px check measures them)').toBeGreaterThan(0);
      await noSideScroll(page);
      expect(facts.wide, 'controls wider than the chooser').toEqual([]);
      expect(facts.small, 'targets under 44 px').toEqual([]);
      expect(await axe(page)).toEqual([]);
    });
  }
});

test.describe('the setup step at 1440', () => {
  for (const p of PLACES) {
    test(`axe: ${p.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await open(page, p);
      expect(await axe(page)).toEqual([]);
    });
  }
});
