// Vitest: Escape in the New Bot drawer. In the model chooser (the drawer's sub-flow) Escape is its
// Back: the form comes back with what was typed, the drawer stays. A name the person typed is unsaved input: Escape on
// the form asks "Discard changes?" first. A name left as suggested (or re-rolled) is not: Escape closes at once.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import kitStrings from '@kit/overlays/strings.en.json';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { registerTargets, type Change, type Computer, type NewBotResult, type NewBotVars } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

// The drawer takes its computer's create from data.ts (useCreateBot): these cases hand it the stub instead.
const h = vi.hoisted(() => ({ create: undefined as unknown }));
vi.mock('./data', async (real) => ({ ...(await real<typeof Data>()), useCreateBot: () => h.create }));

const atlas: Computer = { id: 'c1', name: 'Atlas', server: 'srv-c1', flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false };
const create = {
  run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<NewBotResult, NewBotVars>;
let closes = 0;

async function mount() {
  h.create = create;
  closes = 0;
  registerTargets([{ id: atlas.id, project_id: 'p-1', server_name: atlas.server }]);
  const ui = <NewBotDrawer open onClose={() => (closes += 1)} computers={[atlas]} realms={[]} bots={[]} models={[]} offer={undefined} initialComputer="c1" onOpenBot={() => undefined} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  return screen.findByRole('dialog', { name: strings['newBot.title'] });
}
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['newBot.name'] });
async function typeName(d: HTMLElement, name: string) {
  await userEvent.clear(nameBox(d));
  await userEvent.type(nameBox(d), name);
}

describe('New Bot: Escape', () => {
  it('in the model chooser goes back to the form: the drawer stays and the typed name with it', async () => {
    const d = await mount();
    await typeName(d, 'quiet-heron');
    await userEvent.click(within(d).getByRole('button', { name: strings['newBot.model.changeName'] }));
    const chooser = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] });
    await waitFor(() => expect(chooser.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    expect(closes).toBe(0);
    const form = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    expect(nameBox(form)).toHaveValue('quiet-heron');
    expect(within(form).queryByText(kitStrings.discardAsk)).toBeNull();
  });

  it('on the form with a typed name asks before closing; Keep editing keeps the name', async () => {
    const d = await mount();
    await typeName(d, 'quiet-heron');
    await userEvent.keyboard('{Escape}');
    expect(closes).toBe(0);
    expect(await within(d).findByText(kitStrings.discardAsk)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: kitStrings.keepEditing }));
    expect(nameBox(d)).toHaveValue('quiet-heron');
    expect(closes).toBe(0);
  });

  it('with the suggested name closes at once: nothing was typed', async () => {
    const d = await mount();
    act(() => nameBox(d).focus());
    await userEvent.keyboard('{Escape}');
    expect(closes).toBe(1);
  });

  it('with a re-rolled name closes at once: a suggestion is not typed input', async () => {
    const d = await mount();
    await typeName(d, 'quiet-heron');
    await userEvent.click(within(d).getByRole('button', { name: strings['newBot.reroll'] }));
    expect(nameBox(d)).not.toHaveValue('quiet-heron');
    act(() => nameBox(d).focus());
    await userEvent.keyboard('{Escape}');
    expect(closes).toBe(1);
  });
});
