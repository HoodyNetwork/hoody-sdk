// An agent's model changes on its page. Change model opens the shared model chooser; a pick is sent once as
// PATCH /agents/<name>/model {model} and called saved only when the agents list, read back, shows it (flows-default.ts
// setModel); then the page reads its list again. An answer the list does not show yet stays "may have gone through"
// with Check again (a read, never a second send); a refusal says so and the old model stays. On real core (fixture
// transport): the chooser's catalogue and the agent's routes are answered here.
import { answers, bootFixtureCore, providers, queryClient, reply, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the chooser's navigation, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the overview, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import aiStrings from '../strings.en.json';
import forms from '@kit/forms/forms.strings.en.json';
import chooser from '@kit/pickers/ModelChooser.strings.en.json';
import { agentsOf } from './logic';
import { AgentOverview } from './Overview';
import strings from './strings.en.json';

const FREE = 'hoody-ai/hoody-free';
const GPT = 'openai/gpt-5';
const st = (state: string) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });
/** The ready read fails (nothing can be proven ready on this computer): a pick's readiness is unknown. */
let readyFails = false;
const catalogueRules = [
  reply(providers.providerRoutes.version, answers.ok({ api_version: '1', supported: ['1'], available: ['1'], pinned_realm: null })),
  reply(providers.providerRoutes.providers, answers.ok({ providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready') },
  ] })),
  reply(providers.providerRoutes.models, (req: FixtureRequest) => req.query.ready === 'true' && readyFails ? answers.refused(500, 'INTERNAL') : answers.ok({
    models: req.query.ready === 'true' ? [{ spec: FREE }, { spec: GPT }] : [{ spec: FREE, display_name: 'Hoody Free' }, { spec: GPT, display_name: 'GPT-5' }],
  })),
];

/** Every request the agent was sent for the agents list and the model, in order. */
let sent: FixtureRequest[] = [];
/** The agent's stored model, as the next GET /agents shows it. */
let stored = FREE;

type Mode = 'applies' | 'notYet' | 'refuse';
async function show(mode: Mode, onModelSaved = vi.fn(), opts: { readyFails?: boolean } = {}) {
  sent = [];
  stored = FREE;
  readyFails = !!opts.readyFails;
  bootFixtureCore({
    rules: [
      ...catalogueRules,
      reply(routes.agents, (r) => {
        sent.push(r);
        return answers.ok({ items: [{ name: 'helper', provenance: 'user', model: stored }], meta: { total: 1 } });
      }),
      reply(routes.agentModel, (r) => {
        sent.push(r);
        if (mode === 'refuse') return answers.refused(422, 'model_unavailable');
        if (mode === 'applies') stored = String((r.body as { model?: unknown }).model);
        return answers.ok({ status: 'ok' });
      }),
    ],
  });
  await renderPage(onModelSaved);
  return onModelSaved;
}

/** The agent's overview, mounted (again): the host's row still shows the model the list had (Hoody Free). */
async function renderPage(onModelSaved: () => void) {
  const row = agentsOf({ items: [{ name: 'helper', provenance: 'user', model: FREE }], meta: { total: 1 } })![0]!;
  const Page = () => <AgentOverview agent={row} onModelSaved={onModelSaved} />;
  const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/ai/agents/helper'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

/** Leaving the page and coming back: the overview unmounts, then mounts again on the same core (nothing is booted again). */
async function remount(onModelSaved: () => void) {
  cleanup();
  await renderPage(onModelSaved);
}

/** Change model, then GPT-5 in the chooser (ready on this computer). */
async function pickGpt() {
  const change = screen.queryByRole('button', { name: strings['model.change'] });
  expect(change).not.toBeNull();
  await userEvent.click(change!);
  const drawer = await screen.findByRole('dialog');
  await userEvent.click(await within(drawer).findByRole('option', { name: /GPT-5/ }));
}
const patches = () => sent.filter((r) => r.method === 'PATCH');

afterEach(() => {
  cleanup();
  queryClient.clear();
});

// As Settings → Default model (def.savedUnknown): a pick whose readiness on this computer is unknown is saved with that caveat.
const caveat = new RegExp(aiStrings['def.savedUnknown'].split('{{computer}}')[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const pickUnknownGpt = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings['model.change'] }));
  const drawer = await screen.findByRole('dialog');
  // Narrowed to GPT-5 first (as default.chooser.test does): every unknown row offers its own Use it anyway.
  await userEvent.type(within(drawer).getByRole('searchbox'), 'gpt-5');
  await userEvent.click(await within(drawer).findByRole('option', { name: /GPT-5/ }));
  await userEvent.click(within(drawer).getByRole('button', { name: chooser['unk.use'] }));
};

describe('the model on the agent page', () => {
  it('a pick is one PATCH /agents/<name>/model {model}; it is saved only once the list read back shows it', async () => {
    const saved = await show('applies');
    // The spec is an id: it shows in code type, as the read-only overview showed it.
    expect(screen.getByText(FREE).tagName).toBe('CODE');
    await pickGpt();
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.path).toBe('/agents/helper/model');
    expect(patches()[0]!.body).toEqual({ model: GPT });
    // The read-back: the agents list, read after the answer, showed the new model before it was called saved.
    const at = sent.indexOf(patches()[0]!);
    expect(sent.slice(at + 1).some((r) => r.method === 'GET' && r.path === '/agents')).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an answer the list does not show yet may have gone through: nothing more is sent; Check again reads and saves once it shows', async () => {
    const saved = await show('notYet');
    await pickGpt();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forms['outcome.pendingShort']);
    expect(saved).not.toHaveBeenCalled();
    // The old model stays shown: the change is not applied on the page before the read-back confirms it.
    expect(screen.getByText(FREE)).toBeInTheDocument();
    stored = GPT;
    await userEvent.click(within(alert).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(patches()).toHaveLength(1);
  });

  it('an unknown-readiness pick is saved with the caveat, not as a plain save', async () => {
    const saved = await show('applies', vi.fn(), { readyFails: true });
    await pickUnknownGpt();
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
    expect(screen.queryByText(strings['model.saved'].replace('{{name}}', 'helper').replace('{{model}}', GPT))).toBeNull();
  });
  it('an unknown-readiness pick confirmed later by Check again keeps the caveat', async () => {
    const saved = await show('notYet', vi.fn(), { readyFails: true });
    await pickUnknownGpt();
    const alert = await screen.findByRole('alert');
    stored = GPT;
    await userEvent.click(within(alert).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
  });

  it('a refusal shows the error and keeps the old model; nothing is read as saved', async () => {
    const saved = await show('refuse');
    await pickGpt();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forms['outcome.failedShort']);
    expect(alert).toHaveTextContent(aiStrings['use.unsupported']);
    expect(screen.getByText(FREE)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    expect(patches()).toHaveLength(1);
  });
});

// A change whose outcome is unknown is held by core (attempts), keyed by the computer, the
// realm and the agent, so leaving the page and coming back shows it again: never an editable row a second change could go over.
describe('agent-model-held-write: an unknown change outlives the page', () => {
  const changeButton = () => screen.getByRole('button', { name: strings['model.change'] });
  // While the change is held the row offers no way to change the model: the kit row takes its actions away while the outcome
  // is pending, and the button itself is off too. No Change model button that could be pressed.
  const expectNoChange = () =>
    expect(screen.queryAllByRole('button', { name: strings['model.change'] }).filter((b) => !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true')).toEqual([]);

  it('a pending change shows again after leaving and coming back: Check again, Change disabled, nothing sent again', async () => {
    const saved = await show('notYet');
    await pickGpt();
    expect(await screen.findByRole('alert')).toHaveTextContent(forms['outcome.pendingShort']);
    await remount(saved);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forms['outcome.pendingShort']);
    expect(alert).toHaveTextContent(aiStrings['err.notConfirmed']);
    expect(within(alert).getByRole('button', { name: forms['outcome.check'] })).toBeInTheDocument();
    expectNoChange();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patches()).toHaveLength(1);
    expect(saved).not.toHaveBeenCalled();
  });

  it('after coming back, Check again only reads: once the list shows the model the hold is released and the row says saved', async () => {
    const saved = await show('notYet');
    await pickGpt();
    await screen.findByRole('alert');
    await remount(saved);
    // Not there yet: the read keeps it held.
    const before = sent.length;
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: forms['outcome.check'] }));
    expect(await screen.findByText(strings['model.stillNot'])).toBeInTheDocument();
    expectNoChange();
    stored = GPT;
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(strings['model.saved'].replace('{{name}}', 'helper').replace('{{model}}', GPT))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(changeButton()).not.toBeDisabled();
    // Check again read the list and sent nothing.
    expect(patches()).toHaveLength(1);
    expect(sent.slice(before).every((r) => r.method === 'GET' && r.path === '/agents')).toBe(true);
    // Gone for good: coming back once more shows no held change.
    await remount(saved);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(changeButton()).not.toBeDisabled();
  });

  it('an unknown-readiness pick keeps its caveat through leaving, coming back and Check again', async () => {
    const saved = await show('notYet', vi.fn(), { readyFails: true });
    await pickUnknownGpt();
    await screen.findByRole('alert');
    await remount(saved);
    stored = GPT;
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
    expect(patches()).toHaveLength(1);
  });

  it('Stop tracking, after its warning, lets the change go: Change works again and nothing is sent', async () => {
    const saved = await show('notYet');
    await pickGpt();
    await screen.findByRole('alert');
    await remount(saved);
    await userEvent.click(await screen.findByRole('button', { name: strings['model.stop'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['model.stop.title'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['model.stop.confirm'] }));
    await waitFor(() => expect(changeButton()).not.toBeDisabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(patches()).toHaveLength(1);
    expect(saved).not.toHaveBeenCalled();
  });
});

