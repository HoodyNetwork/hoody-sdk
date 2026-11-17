// The Bare metal block of the Plans view, the wide last card of the plans' grid: beside the market's live facts it says two things that need no read:
// the hardware is dedicated (the words open their explanation, as "Shared hardware" does on the plan cards) and the
// region comes with the listing. "Browse machines" is the block's one primary: it only goes to the Bare metal view; it
// buys nothing. The block never shows a price of its own: "From" is the market read's, or absent.
// It is a card as the plans are (framed, the lifted fill), in their grid, so it lines up with them at every width.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const band = () => screen.findByRole('group', { name: strings['plans.bareMetal'] }, { timeout: 15_000 });
/** A fact's value by its label. */
const fact = (el: HTMLElement, label: string) => within(el).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('the Bare metal block', () => {
  it('says the hardware is dedicated, and the words open the explanation', async () => {
    await renderPage(page, { path: '/billing' });
    const b = await band();
    const hardware = fact(b, strings['plans.hardware']);
    expect(hardware).toHaveTextContent(strings['plans.dedicated']);
    expect(screen.queryByText(strings['plans.dedicatedTip'])).toBeNull();
    await userEvent.click(within(hardware).getByRole('button', { name: new RegExp(strings['plans.dedicated']) }));
    expect(await screen.findByText(strings['plans.dedicatedTip'])).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(strings['plans.dedicatedTip'])).toBeNull());
  });

  it('the region comes with the listing: one line, no region tags', async () => {
    await renderPage(page, { path: '/billing' });
    const b = await band();
    expect(fact(b, strings['plans.regions'])).toHaveTextContent(new RegExp(`^${strings['plans.regionsBare']}$`));
    expect(within(b).queryByText(/France|Germany|Singapore/)).toBeNull();
  });

  it('Browse machines is the standard button beside a plan card that holds the accent button, enabled, and only goes to the Bare metal view', async () => {
    const { router } = await renderPage(page, { path: '/billing' });
    const b = await band();
    const buttons = within(b).getAllByRole('button');
    // One accent button per screen: the framed plan's action holds it, so the band's button is the standard one.
    const all = [...document.querySelectorAll<HTMLElement>('[data-section="plans"] [data-kit="plan-grid"] button[data-variant="primary"]')];
    expect(all).toHaveLength(1);
    expect(b.contains(all[0] as HTMLElement)).toBe(false);
    const primaries = [within(b).getByRole('button', { name: strings['plans.browseMachines'] })];
    expect(primaries[0]).toHaveAttribute('data-variant', 'secondary');
    expect(primaries[0]).toBeEnabled();
    // The only other control is the explanation's own trigger; nothing in the block buys, pays or rents.
    expect(buttons).toHaveLength(2);
    for (const x of buttons) expect(x.textContent ?? '').not.toMatch(/^(Get|Choose|Buy|Upgrade|Pay|Rent|Reserve|Add funds)/);
    expect(within(b).queryAllByRole('link')).toEqual([]);
    await userEvent.click(primaries[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'servers' }));
    // Going there opened no checkout and no payment drawer.
    expect(router.state.location.search).not.toHaveProperty('sheet');
    expect(router.state.location.search).not.toHaveProperty('listing');
  });

  it('is a card of the plans\' grid: the wide last one, framed and lifted, its price line and its button inside', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    expect(b).toHaveAttribute('data-kit', 'plan-card');
    expect(b).toHaveAttribute('data-wide');
    expect(b).toHaveAttribute('data-tone', 'accent');
    expect(b).toHaveAttribute('data-fill', 'lift');
    const grid = document.querySelector<HTMLElement>('[data-section="plans"] [data-kit="plan-grid"]')!;
    expect(b.parentElement).toBe(grid);
    expect(grid.lastElementChild).toBe(b);
    expect(grid).toHaveAttribute('data-wide');
    // The cards beside it: Free and the plans on sale.
    expect(grid.style.getPropertyValue('--plan-cards')).toBe(String(grid.querySelectorAll('[data-kit="plan-card"]:not([data-wide])').length));
    // No section of its own any more.
    expect(document.querySelector('[data-section="bare-metal"]')).toBeNull();
    // What it is sits under the name; "From" and the market's price are the card's price line, never a row.
    expect(b.querySelector('[data-plan-part="marks"]')).toHaveTextContent(strings['plans.bareMetalBody']);
    await waitFor(() => expect(b.querySelector('[data-plan-part="price-line"]')).not.toBeNull());
    const price = b.querySelector('[data-plan-part="price-line"]') as HTMLElement;
    expect(price.firstElementChild).toHaveTextContent(new RegExp(`^${strings['plans.bareFromLabel']}$`));
    expect(price.querySelector('[data-plan-part="price"]')?.textContent).toMatch(/^\$[\d,.]+ a month$/);
    expect(within(b).queryByText(strings['plans.bareFromLabel'], { selector: 'dt' })).toBeNull();
    // The button is inside the card, at its end.
    const action = b.querySelector('[data-plan-part="action"]') as HTMLElement;
    expect(within(action).getByRole('button', { name: strings['plans.browseMachines'] })).toBeEnabled();
    expect(b.querySelector('[data-plan-part="body"]')?.lastElementChild).toBe(action);
  });

  it('the card and the Compare plans table show one market read: the same "from", and one caller of the read', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    await waitFor(() => expect(b.querySelector('[data-plan-part="price"]')).not.toBeNull());
    const amount = /^(\$[\d,.]+) a month$/.exec(b.querySelector('[data-plan-part="price"]')?.textContent ?? '')?.[1] ?? '';
    expect(amount).not.toBe('');
    const table = screen.getByRole('region', { name: strings['plans.cmp.title'] });
    expect(within(table).getByText(strings['plans.cmp.priceFrom'].replace('{{price}}', amount))).toBeInTheDocument();
    // The screen reads the market's facts once (BareFactsRead); the card and the table take that read.
    const src = (f: string) => readFileSync(join(import.meta.dirname, 'parts', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const calls = ['PlansExtras.tsx', 'PlansSection.tsx', 'PlansCompare.tsx'].map((f) => (src(f).match(/(?<!function )\buseBareFacts\(\)/g) ?? []).length);
    expect(calls).toEqual([1, 0, 0]);
    expect(src('PlansExtras.tsx')).toMatch(/function BareFactsRead[\s\S]*?const facts = useBareFacts\(\);/);
    // Only a screen with a way to the market mounts the read.
    expect(src('PlansSection.tsx')).toMatch(/\{market && <BareFactsRead cell=\{bare\} \/>\}/);
  });

  for (const state of ['servers-both-failed', 'servers-loading'])
    it(`${state}: the two rows stay, with no price and no range beside them`, { timeout: 40_000 }, async () => {
      await renderPage(page, { state, path: '/billing' });
      const b = await band();
      expect(fact(b, strings['plans.hardware'])).toHaveTextContent(strings['plans.dedicated']);
      expect(fact(b, strings['plans.regions'])).toHaveTextContent(strings['plans.regionsBare']);
      expect(within(b).queryByText(strings['plans.bareFromLabel'])).toBeNull();
      expect(within(b).queryByText(strings['plans.bareCores'])).toBeNull();
      expect(b.textContent).not.toMatch(/\$\d/);
    });
});

describe('the band beside plans that offer nothing', () => {
  it('with no accent button on a plan card (a link to a server that is gone), Browse machines is the accent button', async () => {
    await renderPage(page, { path: '/billing?sub=ffffffffffffffffffffffff' });
    const b = await band();
    await screen.findByText(strings['plans.forGone'], {}, { timeout: 15_000 });
    const all = [...document.querySelectorAll<HTMLElement>('[data-section="plans"] [data-kit="plan-grid"] button[data-variant="primary"]')];
    expect(all).toEqual([within(b).getByRole('button', { name: strings['plans.browseMachines'] })]);
  });
});

describe('the plan a person has', () => {
  // One accent per screen: the framed plan's action is the grid's one primary, every
  // other plan's is secondary.
  it('Free with a free server: "Your plan" and no button that buys; only the framed plan\'s action is primary', async () => {
    await renderPage(page, { path: '/billing' });
    const free = await screen.findByRole('group', { name: strings['plans.free'] }, { timeout: 15_000 });
    expect(within(free).getByText(strings.yourPlan)).toBeInTheDocument();
    for (const x of within(free).queryAllByRole('button')) expect(x).not.toHaveAttribute('data-variant', 'primary');
    expect(within(free).queryByRole('button', { name: /^(Get|Choose|Start|Buy|Upgrade)/ })).toBeNull();
    // The plan columns: the Bare metal band is the grid's wide last card, with its own way to the market (above).
    const cards = [...document.querySelectorAll<HTMLElement>('[data-section="plans"] [data-kit="plan-card"]:not([data-wide])')].filter((c) => c !== free && !free.contains(c));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      const want = c.getAttribute('data-tone') === 'accent' ? 1 : 0;
      expect(within(c).getAllByRole('button').filter((x) => x.getAttribute('data-variant') === 'primary')).toHaveLength(want);
    }
    expect(cards.filter((c) => c.getAttribute('data-tone') === 'accent')).toHaveLength(1);
  });
});
