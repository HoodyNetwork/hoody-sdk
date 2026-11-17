// What the columns offer when ?sub= does not name a server that can
// upgrade now, the catalogue's own prices in the upgrade note, and Free beside every state of the catalogue.
// A ?sub= link is an upgrade hand-off: until it resolves, or after its server stops qualifying, no column buys anything
// (a Get there would buy a second server); the person picks a server or "A new server".
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const column = (name: string) => screen.getByRole('group', { name });
const free = () => screen.findByRole('group', { name: strings['plans.free'] }, { timeout: 15_000 }); // the file's first test loads the lazy page
const ready = () => screen.findByRole('group', { name: 'Small' }, { timeout: 15_000 });
const picker = () => screen.getByRole('radiogroup', { name: strings['plans.for'] });
const noBuy = () => expect(screen.queryByRole('button', { name: /^(Get|Upgrade) / })).toBeNull();

describe('a ?sub= that names no server able to upgrade now', () => {
  it('subscriptions still loading: no Get, no Upgrade, the line says it is looking the server up', async () => {
    await renderPage(page, { state: 'plans-subs-pending', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forPending']);
    expect(within(picker()).getByRole('radio', { name: strings['plans.forNew'] })).not.toBeChecked();
  });
  it('subscriptions unreadable: no Get, no Upgrade, the line says so', async () => {
    await renderPage(page, { state: 'plans-subs-error', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forErr']);
  });
  it('the server is held now: no Get, no Upgrade, the line names it; A new server brings Get back', async () => {
    const { router } = await renderPage(page, { state: 'plans-sub-held', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription("n12 can't upgrade now. Pick one of your servers, or A new server to buy one.");
    // n12 is not a choice any more; nothing is chosen until the person picks.
    expect(within(picker()).queryByRole('radio', { name: /^n12/ })).toBeNull();
    for (const r of within(picker()).getAllByRole('radio')) expect(r).not.toBeChecked();
    await userEvent.click(within(picker()).getByRole('radio', { name: strings['plans.forNew'] }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('sub'));
    expect(await within(column('Medium')).findByRole('button', { name: 'Choose Medium' })).toBeEnabled();
  });
  it('no server has that id: no Get, no Upgrade, the line says the link\'s server cannot upgrade', async () => {
    await renderPage(page, { path: '/billing?sub=ffffffff' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forGone']);
  });
  // Only a whole id names a server. n12's 8-character ending names it alone in this
  // list, yet the link picks nothing: the ending may name another server once the list changes.
  it('an old short link ending like a server that can upgrade: no Upgrade, no Get, the line names no server', async () => {
    await renderPage(page, { path: '/billing?sub=293a4b01' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forGone']);
    for (const r of within(picker()).getAllByRole('radio')) expect(r).not.toBeChecked();
  });
  it('the same short ending on a held server: the line never says that server cannot upgrade', async () => {
    await renderPage(page, { state: 'plans-sub-held', path: '/billing?sub=293a4b01' });
    await ready();
    noBuy();
    expect(picker()).toHaveAccessibleDescription(strings['plans.forGone']);
    expect(screen.queryByText(/^n12 can't upgrade now/)).toBeNull();
  });
  it('the Free column says Your plan only while no paid server is picked or asked for', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column(strings['plans.free'])).queryByText(strings.yourPlan)).toBeNull();
  });
});

describe('Plans for picks by the whole id', () => {
  it('a choice puts the subscription\'s whole id in the address, which picks it', async () => {
    const { router } = await renderPage(page, { path: '/billing' });
    await ready();
    await userEvent.click(within(picker()).getByRole('radio', { name: 'Singapore M · Medium' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'plans', sub: 'a1b2c3d4e5f60718293a4b03' }));
    expect(await within(column('Large')).findByRole('button', { name: 'Upgrade to Large: Singapore M' })).toBeEnabled();
    expect(within(picker()).getByRole('radio', { name: 'Singapore M · Medium' })).toBeChecked();
  });
});

describe('the upgrade note: catalogue prices only', () => {
  it('the server\'s own record says $10, its catalogue version $12: +$17.00 over Small, as the checkout quotes', async () => {
    await renderPage(page, { state: 'plans-own-terms', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Medium')).getByText(/\+\$17\.00 a month over Small\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\+\$19\.00/);
  });
  it('its version is no longer on sale: the note says what Upgrade does, no monthly difference', async () => {
    await renderPage(page, { state: 'plans-own-gone', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Medium')).getByText(/^Upgrades n12 in place\.$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/a month over/);
  });
  it('its version is no longer on sale: the one plan of its family on sale never says the server is on it', async () => {
    await renderPage(page, { state: 'plans-own-gone', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Small')).queryByText(/is on this plan/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/n12 is on this plan/);
  });
  it('an entry no column shows has n12\'s version id as its family: no column says n12 is on it, no monthly difference', async () => {
    await renderPage(page, { state: 'plans-own-hidden-family', path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Medium')).getByText(/^Upgrades n12 in place\.$/)).toBeInTheDocument();
    expect(within(column('Small')).queryByText(/is on this plan/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/a month over|n12 is on this plan/);
  });
});

describe('Free beside every state of the catalogue', () => {
  for (const [state, says] of [
    ['plans-none', strings['buy.noneOnSale']],
    ['plans-read-error', strings['buy.loadErr']],
  ] as const) {
    // 40 s: a missing Free fails as findByRole's own error (15 s), never as the test's timeout.
    it(`${state}: Free with its FAQ answer, and the catalogue's state after it`, { timeout: 40_000 }, async () => {
      await renderPage(page, { state, path: '/billing' });
      const f = await free();
      expect(within(f).getByText('$0')).toBeInTheDocument();
      expect(within(f).getByText(strings['plans.freeDetails'])).toBeInTheDocument();
      expect(await screen.findByText(says)).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Small' })).toBeNull();
      noBuy();
    });
  }
  it('plans-pending: Free is drawn while the catalogue loads', { timeout: 40_000 }, async () => {
    await renderPage(page, { state: 'plans-pending', path: '/billing' });
    const f = await free();
    expect(within(f).getByText('$0')).toBeInTheDocument();
    noBuy();
  });
});

// Upgrade carries the whole id of the server picked, never its 8-character ending, through to the checkout.
describe('Upgrade opens the checkout for the server picked by its whole id', () => {
  const TWIN1 = 'cccccccccccccccc0a0b0c0d';
  const upgradeHref = async () => {
    const { router } = await renderPage(page, { state: 'plans-sub-twins', path: `/billing?sub=${TWIN1}` });
    await ready();
    await userEvent.click(within(column('Medium')).getByRole('button', { name: 'Upgrade to Medium: twin-1' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'upgrade', sub: TWIN1, plan: 'plan-pro-v2', exact: 'true' }));
    return router.state.location.href;
  };
  it('two servers share the id ending: the checkout opens on the one picked', { timeout: 40_000 }, async () => {
    await upgradeHref();
    const d = await screen.findByRole('dialog');
    expect(await within(d).findAllByText(/twin-1/, {}, { timeout: 15_000 })).not.toHaveLength(0);
    expect(within(d).queryByText(/twin-2/)).toBeNull();
    expect(within(d).queryByText(strings.payAmbiguous)).toBeNull();
  });
  it('the picked server leaves the list before the checkout reads it: never the other server with that ending', { timeout: 40_000 }, async () => {
    const href = await upgradeHref();
    await renderPage(page, { state: 'plans-sub-twins-gone', path: href });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payMissing, {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(within(d).queryByText(/twin-2/)).toBeNull();
  });
});

// With two versions of one family on sale, each column's Get opens its own version.
describe('Get opens the version its column shows', () => {
  for (const [name, plan] of [['Medium', 'plan-pro-v2'], ['Medium Plus', 'plan-pro-v3'], ['Large', 'plan-max-v1']] as const) {
    it(`${name}: the buy checkout for ${plan}, which the checkout opens as ${name}`, { timeout: 40_000 }, async () => {
      const { router } = await renderPage(page, { state: 'plans-two-versions', path: '/billing' });
      await ready();
      await userEvent.click(within(column(name)).getByRole('button', { name: `Choose ${name}` }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'buy', plan, exact: 'true' }));
      const d = await screen.findByRole('dialog');
      expect(await within(d).findAllByText(new RegExp(`^${name}( · .*)?$`), {}, { timeout: 15_000 })).not.toHaveLength(0);
      for (const other of ['Medium', 'Medium Plus'].filter((o) => o !== name)) expect(within(d).queryByText(new RegExp(`^${other}( · .*)?$`))).toBeNull();
    });
  }
});

// A subscriptions refresh that fails, with the earlier read still cached, leaves nothing to buy.
describe('a failed subscriptions refresh after a good read', () => {
  it('Upgrade goes away and the line says the servers are unreadable', { timeout: 40_000 }, async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await ready();
    expect(within(column('Medium')).getByRole('button', { name: 'Upgrade to Medium: n12' })).toBeEnabled();
    const q = queryClient.getQueryCache().findAll().find((x) => Array.isArray((x.state.data as { subs?: unknown } | undefined)?.subs));
    expect(q).toBeDefined();
    await act(async () => {
      q!.setState({ ...q!.state, status: 'error', error: new Error('refresh failed'), fetchStatus: 'idle' });
    });
    await waitFor(() => noBuy());
    expect(picker()).toHaveAccessibleDescription(strings['plans.forErr']);
  });
});

// A server on one version of a family is "on this plan" in that version's column only.
describe('two versions of one family on sale, a server on the first', () => {
  it('Medium (its version) says it is on this plan; Medium Plus never does', { timeout: 40_000 }, async () => {
    await renderPage(page, { state: 'plans-two-versions', path: '/billing?sub=a1b2c3d4e5f60718293a4b03' });
    await ready();
    expect(within(column('Medium')).getByText(/^Singapore M is on this plan/)).toBeInTheDocument();
    expect(within(column('Medium Plus')).queryByText(/is on this plan/)).toBeNull();
  });
});

// A version id that another entry names as its family opens no checkout from its column,
// and a link naming that version opens it, whatever entry the catalogue lists first.
describe('a version id that is also another entry\'s family', () => {
  it('Large has no Get; the other columns keep theirs', { timeout: 40_000 }, async () => {
    await renderPage(page, { state: 'plans-handle-collision', path: '/billing' });
    await ready();
    expect(within(column('Small')).getByRole('button', { name: 'Choose Small' })).toBeEnabled();
    expect(within(column('Large')).queryByRole('button', { name: /^Choose / })).toBeNull();
  });
  it('a column\'s exact link to plan-max-v1 opens Large, never the entry of family plan-max-v1 listed first', { timeout: 40_000 }, async () => {
    await renderPage(page, { state: 'plans-handle-collision', path: '/billing?checkout=buy&plan=plan-max-v1&exact=true' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findAllByText(/^Large( · .*)?$/, {}, { timeout: 15_000 })).not.toHaveLength(0);
    expect(within(d).queryByText(/^Odd( · .*)?$/)).toBeNull();
  });
  it('a link without exact keeps the live lookup: the first entry whose id or family is plan-max-v1', { timeout: 40_000 }, async () => {
    await renderPage(page, { state: 'plans-handle-collision', path: '/billing?checkout=buy&plan=plan-max-v1' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findAllByText(/^Odd( · .*)?$/, {}, { timeout: 15_000 })).not.toHaveLength(0);
  });
});

// The version a column linked to left the catalogue, and an entry whose family is its id
// came: the exact link finds the plan gone, for a buy and an upgrade, and never opens that entry.
describe('a column\'s version leaves before the checkout reads the catalogue', () => {
  for (const [kind, path] of [
    ['buy', '/billing?checkout=buy&plan=plan-max-v1&exact=true'],
    ['upgrade', '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=plan-max-v1&exact=true'],
  ] as const) {
    it(`${kind}: the plan is gone, never Odd`, { timeout: 40_000 }, async () => {
      await renderPage(page, { state: 'plans-version-replaced', path });
      const d = await screen.findByRole('dialog');
      expect(await within(d).findByText(strings['co.planGone'], {}, { timeout: 15_000 })).toBeInTheDocument();
      expect(within(d).queryByText(/^Odd( · .*)?$/)).toBeNull();
    });
  }
});
