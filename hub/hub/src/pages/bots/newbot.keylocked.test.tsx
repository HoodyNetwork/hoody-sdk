// Vitest: a New Bot whose first key the API refused because two-step codes are locked (too many wrong codes). The link is
// made and no key is; the drawer says the lock and its fix (wait, then make the key), never only "make a key", which the
// same lock would refuse again. The key is sent once.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The drawer on the page's fixture create (state newBotNameTaken: a create that stopped at its key), its stop state replaced.
const world = vi.hoisted(() => ({ stop: null as string | null }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useCreateBot: (computerId: string | undefined) => {
      const c = real.useCreateBot(computerId);
      return world.stop && c.data ? { ...c, data: { ...c.data, state: world.stop } } : c;
    },
  };
});

import { MINT_LOCKED } from './logic';
import type * as dataModule from './data';
import { ROUTES, createBotFlow, registerTargets, type NewBotVars } from './data';
import page from './page';
import strings from './strings.en.json';

const vars: NewBotVars = { name: 'Support', computerId: 'c-atlas', model: 'hoody-ai/hoody-free', instructions: '', withLink: true, label: 'support', yolo: true };
const bot = { id: 'support', realm: 'global', uid: 'u-1' };
const link = { data: { id: 'l-1', label: 'support', url: 'https://x.example/', status: 'active', keys: [] } };

describe('New Bot: the first key refused by the two-step lock', () => {
  beforeEach(() => { world.stop = null; });

  it('the flow keeps the link, says the key is locked, and sends the key once', async () => {
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    const sent: string[] = [];
    const rec = (name: 'create' | 'urlCreate' | 'keyCreate', answer: Parameters<typeof reply>[1]) =>
      reply(ROUTES[name], (req: FixtureRequest) => { sent.push(name); return typeof answer === 'function' ? answer(req) : answer; });
    bootFixtureCore({ rules: [rec('create', answers.ok(bot)), rec('urlCreate', answers.ok(link)), rec('keyCreate', answers.refused(429, MINT_LOCKED))] });
    const r = await createBotFlow(vars);
    expect(r.state).toBe('keylocked');
    expect(r.link?.id).toBe('l-1');
    expect(r.secret).toBeNull();
    expect(sent).toEqual(['create', 'urlCreate', 'keyCreate']);
  });

  it('the drawer says the lock and its fix, as a refusal', async () => {
    world.stop = 'keylocked';
    await renderPage(page, { state: 'newBotNameTaken', path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    const sw = within(dialog).getByRole('switch', { name: strings['newBot.link'] });
    if (!(sw as HTMLInputElement).checked) await userEvent.click(sw);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['newBot.create'] }));
    const said = await within(dialog).findByText(strings['newBot.stop.keylocked.title']);
    // The lock is a refusal: its banner carries the failed outcome, never the pending one a "may have gone through" stop
    // draws (both are role alert; the outcome mark is what tells them apart).
    const banner = said.closest('[data-outcome]');
    expect(banner?.getAttribute('data-outcome')).toBe('failed');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(dialog.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(within(dialog).getByText(strings['newBot.stop.keylocked.body'])).toBeInTheDocument();
    expect(strings['newBot.stop.keylocked.body']).toMatch(/two-step codes/);
    expect(within(dialog).queryByText(strings['newBot.stop.nokey.body'])).toBeNull();
  }, 30000);
});
