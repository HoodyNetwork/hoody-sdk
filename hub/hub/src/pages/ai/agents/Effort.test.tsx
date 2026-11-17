// An agent's reasoning effort changes on its page, in the row's inline Select of the route's
// levels (no dialog); a pick is one PATCH /agents/<name>/effort {effort}, called saved only when the agents list read back
// shows it. A lost answer is core's hold: "may have gone through" with Check again (a read, never a second send) and Stop
// tracking under it, kept across a remount, the Select off meanwhile. A 400 refusal says which in the page's
// words. The Bot gets no row (a fact only).
// On real core (fixture transport).
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the overview, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the overview, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import { agentsOf } from './logic';
import { AgentOverview } from './Overview';
import forms from '@kit/forms/forms.strings.en.json';
import strings from './strings.en.json';

/** Every agents-list read and effort PATCH the agent was sent, in order. */
let sent: FixtureRequest[] = [];
/** The agent's stored effort, as the next GET /agents shows it. */
let stored = '';

type Mode = 'applies' | 'notYet' | 'refuse';
async function show(mode: Mode, opts: { agent?: Record<string, unknown> } = {}) {
  sent = [];
  stored = '';
  const onSaved = vi.fn();
  bootFixtureCore({
    rules: [
      reply(routes.agents, (r) => {
        sent.push(r);
        // Unset is omitted, as the daemon's list does.
        return answers.ok({ items: [{ name: 'helper', provenance: 'user', model: 'openai/gpt-5', ...(stored === '' ? {} : { effort: stored }) }], meta: { total: 1 } });
      }),
      reply(routes.agentEffort, (r) => {
        sent.push(r);
        if (mode === 'refuse') return answers.refused(400, 'bad_request');
        if (mode === 'applies') stored = String((r.body as { effort?: unknown }).effort);
        return answers.ok({ status: 'ok' });
      }),
    ],
  });
  await renderPage(onSaved, opts.agent);
  return onSaved;
}

async function renderPage(onSaved: () => void, agent: Record<string, unknown> = {}) {
  const row = agentsOf({ items: [{ name: 'helper', provenance: 'user', model: 'openai/gpt-5', ...agent }], meta: { total: 1 } })![0]!;
  const Page = () => <AgentOverview agent={row} onEffortSaved={onSaved} />;
  const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/ai/agents/helper'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

const patches = () => sent.filter((r) => r.method === 'PATCH');
/** The row's inline Select (its trigger button, named for the setting). */
const change = () => screen.getByRole('button', { name: new RegExp(strings['ov.effort']) });
/** While a change is held the Select cannot be opened (it is off). */
const noChange = () => {
  const b = screen.queryByRole('button', { name: new RegExp(strings['ov.effort']) });
  return b === null || (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true';
};

/** Open the row's Select and pick `label`: the pick is the send. */
async function pick(label: string) {
  await userEvent.click(change());
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('the effort on the agent page', () => {
  it('a pick is one PATCH /agents/<name>/effort {effort}; saved only once the list read back shows it', async () => {
    const saved = await show('applies');
    await pick(strings['effort.high']);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.path).toBe('/agents/helper/effort');
    expect(patches()[0]!.body).toEqual({ effort: 'high' });
    // The read-back came after the answer.
    expect(sent.map((r) => r.method)).toEqual(['PATCH', 'GET']);
    expect(screen.getByText(strings['effort.saved'].replace('{{name}}', 'helper').replace('{{effort}}', strings['effort.high']))).toBeTruthy();
  });

  it('Model default sends the empty level (the line removed) and reads back an absent effort as saved', async () => {
    const saved = await show('applies', { agent: { effort: 'low' } });
    await pick(strings['ov.effortUnset']);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(patches()[0]!.body).toEqual({ effort: '' });
  });

  it('a lost answer is held: may have gone through, no Change, kept across a remount; Check again only reads', async () => {
    const saved = await show('notYet');
    await pick(strings['effort.max']);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forms['outcome.pendingShort']);
    expect(noChange()).toBe(true);
    expect(patches()).toHaveLength(1);
    expect(saved).not.toHaveBeenCalled();
    // The old level stays shown until the read-back proves the new one.
    expect(change()).toHaveTextContent(strings['ov.effortUnset']);
    // Stop tracking is a text button under the row's outcome.
    expect(screen.getByRole('button', { name: strings['model.stop'] })).toBeTruthy();
    cleanup();
    await renderPage(saved);
    const again = await screen.findByRole('alert');
    expect(again).toHaveTextContent(forms['outcome.pendingShort']);
    expect(noChange()).toBe(true);
    // Check again: the list still does not show it.
    await userEvent.click(within(again).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(screen.getByText(strings['model.stillNot'])).toBeInTheDocument());
    // Then it does (it went through): saved, the hold let go, and still one PATCH.
    stored = 'max';
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: forms['outcome.check'] }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(patches()).toHaveLength(1);
    await waitFor(() => expect(change()).not.toBeDisabled());
  });

  it('a 400 on Extra high names the possible causes, none as the cause; nothing is held', async () => {
    await show('refuse');
    await pick(strings['effort.xhigh']);
    await waitFor(() => expect(screen.getByText(strings['effort.refused'].replace('{{name}}', 'helper'))).toBeTruthy());
    expect(patches()).toHaveLength(1);
    expect(change()).not.toBeDisabled();
    // The Select is back on the stored level, never the refused one.
    expect(change()).toHaveTextContent(strings['ov.effortUnset']);
    expect(change()).not.toHaveTextContent(strings['effort.xhigh']);
  });

  // The daemon also refuses a level when another model setting in the file is invalid (an unrelated temperature): the
  // same refusal, so the page must not blame thinking or the model.
  it('a 400 on another level, the file holding an invalid unrelated setting, gets the same truthful refusal', async () => {
    await show('refuse', { agent: { temperature: 9 } });
    await pick(strings['effort.medium']);
    await waitFor(() => expect(screen.getByText(strings['effort.refused'].replace('{{name}}', 'helper'))).toBeTruthy());
    expect(screen.queryByText(/turns thinking off, so/)).toBeNull();
    expect(change()).not.toBeDisabled();
  });

  it('picking the current level sends nothing, and no dialog opens on the way', async () => {
    await show('applies', { agent: { effort: 'high' } });
    await pick(strings['effort.high']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patches()).toHaveLength(0);
  });

  it('Stop tracking in the held outcome, after its warning, lets the change go and sends nothing', async () => {
    await show('notYet');
    await pick(strings['effort.max']);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: strings['model.stop'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['model.stop.title'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['model.stop.confirm'] }));
    await waitFor(() => expect(noChange()).toBe(false));
    expect(patches()).toHaveLength(1);
  });

  it('the Bot (product-owned) gets no Change effort, only the fact', async () => {
    await show('applies', { agent: { name: 'helper', provenance: 'product-owned (read-only)', effort: 'low' } });
    expect(screen.queryByRole('button', { name: new RegExp(strings['ov.effort']) })).toBeNull();
    expect(screen.getByText('low')).toBeTruthy();
  });
});
