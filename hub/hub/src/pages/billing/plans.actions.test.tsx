// Plans: what each plan column offers on the page's own fixtures. Each plan appears once, with
// one action: Get on a plain visit, Upgrade (named for the server) for a picked server, nothing on the server's own plan.
// A banned account: every button is disabled. Live-shaped data: ×1 is never printed, the description stays off the page.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const column = (name: string) => screen.getByRole('group', { name });
// The plan columns; the Bare metal band, the grid's wide last card, is not one of them.
const columns = () => [...document.querySelectorAll<HTMLElement>('[data-section="plans"] [data-kit="plan-card"]:not([data-wide])')];
const ready = () => screen.findByRole('group', { name: 'Small' }, { timeout: 15_000 }); // the file's first test loads the lazy page, slow on a busy host

describe('each plan once', () => {
  it('Free then the catalogue plans, one column each, one button each, and no table among the cards', async () => {
    await renderPage(page, { path: '/billing' });
    await ready();
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual([strings['plans.free'], 'Small', 'Medium', 'Large']);
    // The plan cards hold no table (their facts are label | value rows); the Compare plans section under them is the
    // page's one table.
    expect(document.querySelector('[data-section="plans"]')?.querySelector('table, [role="table"]') ?? null).toBeNull();
    expect(screen.getAllByRole('table')).toEqual([within(screen.getByRole('region', { name: strings['plans.cmp.title'] })).getByRole('table')]);
    for (const name of ['Small', 'Medium', 'Large']) {
      expect(screen.getAllByRole('button', { name: `Choose ${name}` })).toHaveLength(1);
      expect(within(column(name)).getByRole('button', { name: `Choose ${name}` })).toBeEnabled();
    }
    // Free is not for sale: no button, the FAQ answer instead.
    expect(within(column(strings['plans.free'])).queryByRole('button', { name: /^Choose / })).toBeNull();
  });
});

describe('the plans view with a server to upgrade', () => {
  it('Upgrade on the bigger plans, named for the server; its own plan says so and offers nothing', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    for (const name of ['Medium', 'Large']) {
      const b = within(column(name)).getByRole('button', { name: `Upgrade to ${name}: n12` });
      expect(b).toBeEnabled();
      expect(b).toHaveTextContent(`Upgrade to ${name}`);
      expect(within(column(name)).getByText(/^Upgrades n12 in place\./)).toBeInTheDocument();
    }
    const small = column('Small');
    expect(within(small).queryByRole('button', { name: /^(Get|Upgrade) / })).toBeNull();
    expect(within(small).getByText(/^n12 is on this plan, paid until /)).toBeInTheDocument();
    // No Get anywhere while a server is picked: a Get would buy a new server, not change n12.
    expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull();
  });
  it('the upgrade note gives the monthly difference from catalogue prices only', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Medium')).getByText(/\+\$17\.00 a month over Small\./)).toBeInTheDocument();
    expect(within(column('Large')).getByText(/\+\$47\.00 a month over Small\./)).toBeInTheDocument();
  });
  it('a server on a middle plan: the smaller plan is not an upgrade for it', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b03' });
    await ready();
    expect(within(column('Small')).getByText('Not an upgrade for Singapore M.')).toBeInTheDocument();
    expect(within(column('Small')).queryByRole('button', { name: /^(Get|Upgrade) / })).toBeNull();
    expect(within(column('Large')).getByRole('button', { name: 'Upgrade to Large: Singapore M' })).toBeEnabled();
  });
});

describe('pressing a plan button', () => {
  for (const [name, plan] of [['Medium', 'plan-pro-v2'], ['Large', 'plan-max-v1']] as const) {
    it(`Upgrade to ${name}: this server's upgrade checkout to that plan version`, async () => {
      const { router } = await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
      await ready();
      await userEvent.click(within(column(name)).getByRole('button', { name: new RegExp(`^Upgrade to ${name}`) }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'upgrade', sub: 'a1b2c3d4e5f60718293a4b01', plan }));
    });
  }
  it('Get Medium: the buy checkout for its version', async () => {
    const { router } = await renderPage(page, { path: '/billing' });
    await ready();
    await userEvent.click(within(column('Medium')).getByRole('button', { name: 'Choose Medium' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'buy', plan: 'plan-pro-v2' }));
  });
});

describe('the plans view on a banned account', () => {
  // Off, and saying why: the account is suspended (the kit's soft-disabled reason).
  const off = (b: HTMLElement) => {
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(strings['mkt.suspended']);
  };
  it('every Get is disabled', async () => {
    await renderPage(page, { state: 'banned', path: '/billing' });
    await ready();
    for (const name of ['Small', 'Medium', 'Large']) off(within(column(name)).getByRole('button', { name: `Choose ${name}` }));
  });
  it('every Upgrade is disabled', async () => {
    await renderPage(page, { state: 'banned', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    for (const name of ['Medium', 'Large']) off(within(column(name)).getByRole('button', { name: new RegExp(`^Upgrade to ${name}`) }));
  });
});

describe('live-shaped catalogue data', () => {
  it('Plus ×2 and Pro ×5 as the tier and its multiple over bars; the description is not shown; whole-dollar prices', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const plus = await screen.findByRole('group', { name: 'Plus' }, { timeout: 15_000 });
    const pro = column('Pro');
    const ai = (col: HTMLElement) => within(col).getByText(strings['plans.aiLabel'], { selector: 'dt' }).nextElementSibling;
    expect(ai(plus)).toHaveTextContent(/^Plus 2×$/);
    expect(ai(pro)).toHaveTextContent(/^Pro 5×$/);
    expect(within(plus).getByRole('img', { name: 'Free AI: 2 times the Free plan' })).toBeInTheDocument();
    expect(within(pro).getByRole('img', { name: 'Free AI: 5 times the Free plan' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/containers?/i);
    expect(within(plus).getByText('$10')).toBeInTheDocument();
    // A whole-dollar price is not drawn a second time as "$10.00": one price, then where it is paid from.
    expect(within(plus).getByText(strings['plans.fromWallet'])).toBeInTheDocument();
    expect(plus.textContent).not.toContain('$10.00');
    expect(plus.textContent?.match(/\$10/g)).toHaveLength(1);
    // The catalogue's type label ("Standard") on both plans says nothing, so it is not drawn.
    expect(within(plus).queryByText('Standard')).toBeNull();
  });
});
