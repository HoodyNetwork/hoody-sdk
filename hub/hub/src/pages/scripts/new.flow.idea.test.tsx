// Vitest (New script): the idea way. ?idea= opens on that idea, picked; step 2 says
// when it runs as a fact (no schedule control); an idea with fields gets "Fill it in", and Continue says which field is
// empty; an idea without fields goes from Where straight to Check.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ templates: true, realm: 'global' as string | null }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: () => fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1', { templates: io.templates }), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')].map((c) => ({ ...c, agentRealm: io.realm }) as ReturnType<typeof fx.comp>))(),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const cont = () => screen.getByRole('button', { name: strings['flow.continue'] });

async function toWhere(idea: string) {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: `/scripts/new/aaaaaaaaaa?idea=${idea}` });
  const picked = await screen.findByRole('radio', { name: new RegExp(strings[`idea.${idea}` as keyof typeof strings]) }, SLOW);
  expect(picked.getAttribute('aria-checked')).toBe('true');
  await user.click(cont());
  await waitFor(() => expect(loc(r)).toMatch(/step=where/));
  const address = screen.getByRole('textbox', { name: strings['new.address'] });
  await user.clear(address);
  await user.type(address, '/health');
  return { r, user };
}


// The draft map is per tab: each test starts with none.
beforeEach(() => { clearDrafts(); mintDraft('aaaaaaaaaa'); io.templates = true; io.realm = 'global'; });

describe('New script flow: the idea way', () => {
  it('opens on the ?idea= idea; a schedulable idea runs on its own schedule, said as a fact, not a control', async () => {
    await toWhere('http-healthcheck-notify');
    expect(screen.getByText(strings['flow.where.ideaOwn'])).toBeTruthy();
    expect(screen.getByText(strings['flow.rail.ideaOwn'])).toBeTruthy();
    // Its code carries an @schedule: never "only when called".
    expect(screen.queryByText(strings['flow.where.onlyCalled'])).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: strings['flow.where.when'] })).toBeNull();
  });

  it('an idea that is not schedulable runs only when called (step and rail)', async () => {
    await toWhere('kv-note');
    expect(screen.getAllByText(strings['flow.where.onlyCalled']).length).toBe(2);
    expect(screen.queryByText(strings['flow.where.ideaOwn'])).toBeNull();
  });

  it('an idea with fields gets Fill it in; Continue with one empty says so and stays', async () => {
    const { r, user } = await toWhere('http-healthcheck-notify');
    expect(screen.getByText(strings['flow.step.fill'])).toBeTruthy();
    await user.click(cont());
    await waitFor(() => expect(loc(r)).toMatch(/step=fill/));
    await user.click(cont());
    expect(await screen.findByText(strings['flow.fill.empty'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).toMatch(/step=fill/);
    await user.type(screen.getByRole('textbox', { name: strings['var.target_url'] }), 'https://example.com');
    await user.click(cont());
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
  });

  it('an idea without fields has no Fill step: Where goes straight to Check', async () => {
    const { r, user } = await toWhere('kv-note');
    expect(screen.queryByText(strings['flow.step.fill'])).toBeNull();
    await user.click(cont());
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
  });

  it('Continue on the idea way with no idea picked asks for one', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.ideaCard']) }, SLOW));
    await user.click(cont());
    expect(await screen.findByText(strings['flow.what.pickFirst'], undefined, SLOW)).toBeTruthy();
    expect(loc(r)).toBe('/scripts/new/aaaaaaaaaa');
  });
});

describe('New script flow: when ideas cannot be offered', () => {
  const ideaCard = () => screen.findByRole('button', { name: new RegExp(strings['flow.what.ideaCard']) }, SLOW);

  it('with the agent not answering, the idea card is off, says why, and no idea is offered', async () => {
    io.templates = false;
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const card = await ideaCard();
    expect((card as HTMLButtonElement).disabled || card.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(card.textContent).toContain(strings['new.ideasOffline']);
    expect(screen.queryByRole('radiogroup', { name: strings['new.pickIdea'] })).toBeNull();
  });

  it('on a computer in several realms with every realm shown, the idea card asks for one realm to be picked', async () => {
    io.realm = null;
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const card = await ideaCard();
    expect((card as HTMLButtonElement).disabled || card.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(card.textContent).toContain(strings['new.ideasPickRealm']);
  });

  // The reasons the flow shows on a card that is off point at the way that is there, by its own name.
  it.each(['new.noWriter', 'new.writerShared', 'new.writerPickRealm', 'new.ideasOffline'] as const)('%s names the write card the flow shows', (key) => {
    expect(strings[key]).toContain(strings['flow.what.writeCard']);
    expect(strings[key]).not.toMatch(/Choose another way to start|code below/i);
  });
});
