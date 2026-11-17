// Vitest: the New Bot drawer's "may have gone through" warning is its computer's own. Each computer's create is its own
// change (useCreateBot: the id carries the computer), so a create held for another computer shows no warning here, does not
// hold this computer's Create and is never freed from here; the drawer's Stop tracking frees its own computer's held create
// and nothing else; picking the other computer shows that computer's warning. The real core and the page's own change hook
// over a fake fetch: every create's answer is lost (502).
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import kitStates from '@kit/states/strings.en.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useCreateBot, type Change, type Computer, type NewBotResult, type NewBotVars } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const comp = (id: string, name: string): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false });
const computers: Computer[] = [comp('c1', 'Atlas'), comp('c2', 'Borealis')];
const vars = (computerId: string): NewBotVars => ({ name: 'Support', computerId, model: '', instructions: '', withLink: false, label: '', yolo: true });

// The page's hook once more for each computer: the same changes as the drawer's own (core keeps a change's holds by its id,
// for every mount), as an earlier opening of the drawer on that computer would have left them. The drawer opens on Atlas.
let atlas!: Change<NewBotResult, NewBotVars>;
let borealis!: Change<NewBotResult, NewBotVars>;
function Page() {
  atlas = useCreateBot('c1');
  borealis = useCreateBot('c2');
  return <NewBotDrawer open onClose={() => undefined} computers={computers} realms={[]} bots={[]} models={[]} offer={undefined} initialComputer="c1" onOpenBot={() => undefined} />;
}
async function show(): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Page /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
}
/** The creates that went out (POST /bots on a computer's agent). */
const creates = () => calls.filter((c) => c.method === 'POST' && new URL(c.url).pathname.endsWith('/bots')).length;
/** A create for one computer through that computer's hook, as a press there sends it. */
async function press(computerId: 'c1' | 'c2') {
  let r: Awaited<ReturnType<Change<NewBotResult, NewBotVars>['run']>> | undefined;
  await act(async () => {
    r = await (computerId === 'c1' ? atlas : borealis).run(vars(computerId));
    await settle();
  });
  return r!;
}
/** The drawer's warning: its title, and its Stop tracking. */
const warned = () => screen.queryAllByText(strings['newBot.maybe']).length > 0;
const stopButton = () => screen.queryByRole('button', { name: kitStates['err.stopTracking'] });
const createButton = () => screen.getByRole('button', { name: strings['newBot.create'] });
const picker = () => screen.getByRole('button', { name: new RegExp(strings['picker.computer.label']) });
/** The banner's Stop tracking, then the kit's warning confirmed. */
async function stopTracking() {
  await userEvent.click(await screen.findByRole('button', { name: kitStates['err.stopTracking'] }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }));
  await act(async () => {
    await settle();
  });
}

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets(computers.map((c) => ({ id: c.id, project_id: 'p1', server_name: c.server })));
  onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: {} } }));
});
afterEach(() => cleanup());

describe("New Bot: the warning is the drawer's computer's own", () => {
  it('a create held for another computer shows nothing here and does not hold this Create', async () => {
    await show();
    expect((await press('c2')).outcome).toBe('pending');
    expect(borealis.outcome).toBe('pending');
    // On Atlas: no warning, no Stop tracking, Create offered. Before, one change stood for every computer: Borealis's create
    // showed here, held Create, and this Stop tracking freed nothing.
    expect(warned()).toBe(false);
    expect(stopButton()).toBeNull();
    expect(createButton()).not.toBeDisabled();
    expect(atlas.outcome).toBe('idle');
    // Atlas's own create goes out.
    expect((await press('c1')).outcome).toBe('pending');
    expect(creates()).toBe(2);
  });

  it("Stop tracking frees Atlas's held create only: Borealis's stays held, and pressed again is read back first", async () => {
    await show();
    expect((await press('c1')).outcome).toBe('pending');
    expect((await press('c2')).outcome).toBe('pending');
    expect(creates()).toBe(2);
    expect(await screen.findByRole('button', { name: kitStates['err.stopTracking'] })).toBeInTheDocument();
    await stopTracking();
    expect(stopButton()).toBeNull();
    expect(warned()).toBe(false);
    // Borealis is still held: nothing is sent.
    expect(await press('c2')).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(creates()).toBe(2);
    // Atlas was freed: its create goes out again.
    expect((await press('c1')).outcome).toBe('pending');
    expect(creates()).toBe(3);
  });

  it("picking Borealis shows Borealis's own warning, and its Stop tracking frees Borealis's create", async () => {
    await show();
    expect((await press('c2')).outcome).toBe('pending');
    expect(stopButton()).toBeNull();
    await userEvent.click(picker());
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['picker.computer.label'] })).getByText('Borealis'));
    expect(await screen.findByRole('button', { name: kitStates['err.stopTracking'] })).toBeInTheDocument();
    expect(warned()).toBe(true);
    expect(createButton()).toBeDisabled();
    await stopTracking();
    expect(stopButton()).toBeNull();
    expect((await press('c2')).outcome).toBe('pending');
    expect(creates()).toBe(2);
  });
});
