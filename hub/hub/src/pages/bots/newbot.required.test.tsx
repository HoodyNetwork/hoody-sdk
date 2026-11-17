// Vitest (forms-bots): the New Bot drawer names what keeps Create off, and what the Bot's agent refused.
//   - the link switch On while the link's address is not read (still loading, or its read failed): the line under the
//     switches says so and what to do (before: Create was off with no word anywhere);
//   - instructions the agent refuses (over 4000 characters): said at the field, the fold that holds the field stays open,
//     and Create waits (before: sent, answered 400, and the drawer said only "The Bot wasn't made");
//   - a name whose identifier is one of the agent's route words: said at the Name field, Create waits (before: sent, 400);
//   - a refusal the agent pinned to a field (400 bad_request, details.field): the banner names the field.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { registerTargets, type Change, type Computer, type LinkOffer, type NewBotResult, type NewBotVars } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

// The drawer takes its computer's create from data.ts (useCreateBot): these cases hand it the stub instead.
const h = vi.hoisted(() => ({ create: undefined as unknown }));
vi.mock('./data', async (real) => ({ ...(await real<typeof Data>()), useCreateBot: () => h.create }));

const atlas: Computer = { id: 'c1', name: 'Atlas', server: 'srv-c1', flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false } as Computer;
const READY: LinkOffer = { door: 'ready', suggestedLabel: 'calm-amber-otter', zone: 'bots.example.test' };
const changeOf = (outcome: string, more: { code?: string; details?: Record<string, unknown> } = {}) =>
  ({ run: async () => ({ outcome }), outcome, data: undefined, code: more.code, details: more.details, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as unknown as Change<NewBotResult, NewBotVars>;

async function mount(offer: LinkOffer | undefined, create: Change<NewBotResult, NewBotVars> = changeOf('idle')) {
  h.create = create;
  registerTargets([{ id: 'c1', project_id: 'p-1', server_name: 'srv-c1' }]);
  const ui = <NewBotDrawer open onClose={() => undefined} computers={[atlas]} realms={[]} bots={[]} models={[]} offer={offer} initialComputer="c1" onOpenBot={() => undefined} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  const d = await screen.findByRole('dialog', { name: strings['newBot.title'] });
  return { d, createButton: () => within(d).getByRole('button', { name: strings['newBot.create'] }) };
}

describe('New Bot: the link switch while the link address is not read', () => {
  it('control: with the switch Off, Create is on and nothing is said about the address', async () => {
    const { d, createButton } = await mount(undefined);
    expect(createButton()).not.toBeDisabled();
    expect(within(d).queryByText(strings['newBot.linkUnread'])).toBeNull();
  });

  it('switch On with no offer: Create waits, and the line under the switches says why and what to do', async () => {
    const { d, createButton } = await mount(undefined);
    await userEvent.click(within(d).getByRole('switch', { name: strings['newBot.link'] }));
    expect(createButton()).toBeDisabled();
    expect(within(d).getByText(strings['newBot.linkUnread'])).toBeVisible();
    // Turning the switch back Off is the way on, as the line says.
    await userEvent.click(within(d).getByRole('switch', { name: strings['newBot.link'] }));
    expect(createButton()).not.toBeDisabled();
    expect(within(d).queryByText(strings['newBot.linkUnread'])).toBeNull();
  });

  it('control: switch On with a ready offer keeps Create on and shows no such line', async () => {
    const { d, createButton } = await mount(READY);
    await userEvent.click(within(d).getByRole('switch', { name: strings['newBot.link'] }));
    expect(createButton()).not.toBeDisabled();
    expect(within(d).queryByText(strings['newBot.linkUnread'])).toBeNull();
  });
});

describe('New Bot: instructions the agent would refuse', () => {
  const open = async (d: HTMLElement) => {
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['newBot.more']) }));
    return within(d).getByRole('textbox', { name: strings['behaviour.instructions'] });
  };

  it('4000 characters are fine', async () => {
    const { d, createButton } = await mount(undefined);
    fireEvent.change(await open(d), { target: { value: 'a'.repeat(4000) } });
    expect(createButton()).not.toBeDisabled();
    expect(within(d).queryByText(strings['newBot.instr.too_long'])).toBeNull();
  });

  it('4001 characters: the field says so and Create waits', async () => {
    const { d, createButton } = await mount(undefined);
    fireEvent.change(await open(d), { target: { value: 'a'.repeat(4001) } });
    expect(createButton()).toBeDisabled();
    expect(within(d).getByText(strings['newBot.instr.too_long'])).toBeVisible();
  });

  it('the fold stays open while its field holds Create off', async () => {
    const { d } = await mount(undefined);
    fireEvent.change(await open(d), { target: { value: 'a'.repeat(4001) } });
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['newBot.more']) }));
    expect(within(d).getByText(strings['newBot.instr.too_long'])).toBeVisible();
  });

  it('an invisible character is named at the field', async () => {
    const { d, createButton } = await mount(undefined);
    fireEvent.change(await open(d), { target: { value: 'Reply‍briefly' } });
    expect(createButton()).toBeDisabled();
    expect(within(d).getByText(strings['newBot.instr.invisible'])).toBeVisible();
  });
});

describe("New Bot: a name whose identifier is one of the agent's route words", () => {
  it('says so at the Name field and Create waits; another name sends', async () => {
    const { d, createButton } = await mount(undefined);
    const name = within(d).getByRole('textbox', { name: strings['newBot.name'] });
    fireEvent.change(name, { target: { value: 'Channels' } });
    expect(within(d).getByText(strings['newBot.name.reserved'])).toBeVisible();
    expect(createButton()).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Channels helper' } });
    expect(within(d).queryByText(strings['newBot.name.reserved'])).toBeNull();
    expect(createButton()).not.toBeDisabled();
  });
});

describe('New Bot: a refusal the agent pinned to a field', () => {
  it('instructions: the banner names them', async () => {
    const { d } = await mount(undefined, changeOf('failed', { code: 'bad_request', details: { field: 'instructions' } }));
    expect(within(d).getByText(strings['newBot.failed'])).toBeVisible();
    expect(within(d).getByText(strings['newBot.refusedInstructions'])).toBeVisible();
  });

  it('the identifier: the banner says it is reserved', async () => {
    const { d } = await mount(undefined, changeOf('failed', { code: 'bad_request', details: { field: 'id' } }));
    expect(within(d).getByText(strings['newBot.name.reserved'])).toBeVisible();
  });

  it('control: a refusal with no field keeps the plain banner', async () => {
    const { d } = await mount(undefined, changeOf('failed', { code: 'bad_request' }));
    expect(within(d).getByText(strings['newBot.failed'])).toBeVisible();
    expect(within(d).queryByText(strings['newBot.refusedInstructions'])).toBeNull();
    expect(within(d).queryByText(strings['newBot.name.reserved'])).toBeNull();
  });
});

describe('New Bot: the identifier under the Name', () => {
  const name = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['newBot.name'] });
  const helpOf = (id: string) => strings['newBot.nameHelp'].replace('{{id}}', id);

  it('a name that is its own identifier is not printed a second time above the field', async () => {
    const { d } = await mount(undefined);
    const typed = (name(d) as HTMLInputElement).value;
    expect(typed).toMatch(/^[a-z]+(-[a-z]+)+$/);
    expect(within(d).queryByText(helpOf(typed))).toBeNull();
  });

  it('a name the identifier differs from says the identifier', async () => {
    const { d } = await mount(undefined);
    fireEvent.change(name(d), { target: { value: 'My Helper' } });
    expect(await within(d).findByText(helpOf('my-helper'))).toBeVisible();
  });
});

