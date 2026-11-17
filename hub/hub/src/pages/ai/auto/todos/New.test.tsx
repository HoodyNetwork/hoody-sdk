// New TODO on AI > TODOs, over the real core and a fake fetch (every request counted). The header offers it on a
// computer in one realm only; `?new=1` (New chat's "Or keep a TODO.") opens it. The folder is preselected with the most
// recent folder this computer's chats used. Add sends POST /todos once, in the realm shown; past the agent's limits the form
// refuses and sends nothing. A lost answer is never sent again: Check again only reads, lists the look-alikes and says how
// many. With Ask on, "ask the agent" is a step of the drawer: it starts a NEW Agent conversation and never says a TODO was
// made; the Write it | Ask the agent switch moves between the sides and each keeps its words.
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@core';
import { ASK_ENABLED, setAskForFixtures, useAskDock } from '@kit';
import { bump, setRealm, setTarget, target as shownTarget } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for a stopped computer, not page code
import { ShellDataProvider } from '@shell/context';
import { boot, calls, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetKeptForTests } from '../kept';
import { resetLedgerForTests } from './create';
import { TITLE_MAX } from './create';
import { TodosList } from './List';
import strings from './New.strings.en.json';
import chat from '../../new/NewChat.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const todo = (o: Record<string, unknown>) => ({ num: 1, state: 'ready', priority: 2, rank: 1, cwd: '/w', source: { kind: 'manual' }, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z', realm: R1, revision: 1, ...o });
let items: Array<Record<string, unknown>> = [];
let cwds: unknown = { cwds: ['/home/ada/shop', '/home/ada/blog', '/srv/data'] };
let post: (c: Call) => Reply = () => ({ status: 201, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false } });

// An account route's address is relative (/api/v1/…), an agent's is absolute: both read against a base.
const path = (u: string) => new URL(u, 'https://h.invalid').pathname;
const posts = () => calls.filter((c) => c.method === 'POST' && path(c.url).endsWith('/agent/todos'));
const listReads = () => calls.filter((c) => c.method === 'GET' && path(c.url).endsWith('/agent/todos')).length;
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
const dock = () => renderHook(() => useAskDock()).result.current;
/** The shell lists the computer as stopped from now on (show() renders it running unless asked). */
let stopNow: () => void = () => {};

async function show(url = '/ai/auto/todos', o: { stopped?: boolean } = {}) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <TodosList computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(async () => {
    const page = <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
    const id = shownTarget()?.container.id ?? '';
    const tree = (running: boolean) => <ShellDataProvider value={{ realms: [], realmId: R1, computers: [{ id, name: 'atlas', running }] } as never}>{page}</ShellDataProvider>;
    const r = render(tree(!o.stopped));
    stopNow = () => act(() => { r.rerender(tree(false)); });
    await router.load();
  });
  await flush();
  return router;
}
const drawer = () => screen.getByRole('dialog', { name: strings['new.title'] });
async function openDrawer() {
  await userEvent.click(screen.getByRole('button', { name: strings.new }));
  await flush();
  return drawer();
}
const field = (d: HTMLElement, name: string) => within(d).getByRole('textbox', { name: new RegExp(`^${name}`) }) as HTMLInputElement;
const folder = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(chat['folder.legend']) });
async function pick(d: HTMLElement, name: string) {
  await userEvent.click(folder(d));
  await userEvent.click(await screen.findByRole('option', { name }));
  await flush();
}
const addButton = (d?: HTMLElement) => within(d ?? drawer()).getByRole('button', { name: strings['f.add'] });

beforeEach(() => {
  boot({ realm: R1 });
  resetKeptForTests();
  resetLedgerForTests();
  queryClient.clear();
  setAskForFixtures(false);
  items = [todo({ id: 'todo_a', num: 1, title: 'Prune the old snapshots' })];
  cwds = { cwds: ['/home/ada/shop', '/home/ada/blog', '/srv/data'] };
  post = () => {
    items = [...items, todo({ id: 'todo_new', num: 12, title: 'Rotate the keys' })];
    return { status: 201, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false } };
  };
  onFetch(answer);
});

// The agent's answers (and 404 for anything else: under All realms the computer list too, so its realms are not told).
function answer(c: Call): Reply {
  const p = path(c.url);
  if (c.method === 'GET' && p.endsWith('/agent/todos')) return { status: 200, body: { items, meta: { total: items.length }, revision: 3 } };
  if (c.method === 'GET' && p.endsWith('/agent/todos/revision')) return { status: 200, body: { revision: 3 } };
  if (c.method === 'GET' && p.endsWith('/sessions/cwds')) return { status: 200, body: cwds };
  if (c.method === 'POST' && p.endsWith('/agent/todos')) return post(c);
  const m = /\/agent\/todos\/([^/]+)$/.exec(p);
  if (c.method === 'GET' && m) {
    const t = items.find((x) => x.id === m[1]);
    return t ? { status: 200, body: { status: 'ok', todo: t } } : { status: 404, body: { error: 'not found', code: 'not_found' } };
  }
  return { status: 404, body: { code: 'not_found', error: 'nope' } };
}

afterEach(() => {
  const d = dock();
  act(() => { d.close(); d.takeDraft(); });
  setAskForFixtures(false);
  cleanup();
});

describe('New TODO: where it is offered', () => {
  it('on a computer in one realm, the header offers it', async () => {
    await show();
    expect(screen.getByRole('button', { name: strings.new })).toBeInTheDocument();
  });
  it('under All realms with the computer\'s realms not told, the page asks for a realm and offers nothing (no dead button); ?new=1 opens nothing', async () => {
    boot({ realm: 'all' });
    await show('/ai/auto/todos?new=1');
    expect(screen.queryByRole('button', { name: strings.new })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts()).toHaveLength(0);
  });
  it('under All realms with the computer in one realm, the header offers it and Add files the TODO in that realm', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.method === 'GET' && path(c.url).endsWith('/computers')
      ? { status: 200, body: { data: { computers: [{ id: shownTarget()?.container.id, name: 'atlas', realm_ids: [R1] }] } } }
      : answer(c)));
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts()).toHaveLength(1);
    expect(new URL(posts()[0]!.url).searchParams.get('realm')).toBe(R1);
  });
  it('with no computer it is not offered, and ?new=1 is cleared without opening anything', async () => {
    boot({ realm: R1, target: null });
    const router = await show('/ai/auto/todos?new=1');
    expect(screen.queryByRole('button', { name: strings.new })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((router.state.location.search as Record<string, unknown>).new).toBeUndefined();
  });
  it('?new=1 (New chat\'s link) opens the drawer once and leaves the address', async () => {
    const router = await show('/ai/auto/todos?new=1');
    expect(drawer()).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).new).toBeUndefined();
  });
});

describe('New TODO: the form', () => {
  it('the most recent folder is preselected, shown and editable: another listed one, or a typed path', async () => {
    await show();
    const d = await openDrawer();
    expect(folder(d)).toHaveTextContent('/home/ada/shop');
    await pick(d, '/srv/data');
    expect(folder(d)).toHaveTextContent('/srv/data');
    await pick(d, chat['folder.another']);
    const typed = within(d).getByRole('combobox', { name: chat['folder.path'] }) as HTMLInputElement;
    expect(typed.value, 'another folder starts empty and stays so: the first one is not put back').toBe('');
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['f.folder.bad'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    await userEvent.type(typed, '/opt/app{Escape}');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts().map((c) => c.body.cwd)).toEqual(['/opt/app']);
  });
  it('with no folders but a home the agent reports, the home folder is preselected and sent', async () => {
    cwds = { cwds: [], home: '/home/ada' };
    await show();
    const d = await openDrawer();
    expect(folder(d)).toHaveTextContent(chat['folder.homeAt'].replace('{{path}}', '/home/ada'));
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts().map((c) => c.body.cwd)).toEqual(['/home/ada']);
  });
  it('a folder chats ran in still comes first; the home folder is offered once, by its path', async () => {
    cwds = { cwds: ['/home/ada/shop', '/home/ada'], home: '/home/ada' };
    await show();
    const d = await openDrawer();
    expect(folder(d)).toHaveTextContent('/home/ada/shop');
    await userEvent.click(folder(d));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([chat['folder.homeAt'].replace('{{path}}', '/home/ada'), '/home/ada/shop', chat['folder.another']]);
  });
  it('a home put there by the page is taken back when the computer stops while the drawer is open', async () => {
    cwds = { cwds: [], home: '/home/ada' };
    await show();
    const d = await openDrawer();
    expect(folder(d)).toHaveTextContent('/home/ada');
    stopNow();
    await flush();
    expect(folder(d)).not.toHaveTextContent('/');
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts()).toHaveLength(0);
  });
  it('a folder the person chose stays when the computer stops', async () => {
    cwds = { cwds: ['/home/ada/shop'], home: '/home/ada' };
    await show();
    const d = await openDrawer();
    await pick(d, chat['folder.homeAt'].replace('{{path}}', '/home/ada'));
    stopNow();
    await flush();
    expect(folder(d)).toHaveTextContent('/home/ada');
  });
  it('a stopped computer\'s agent is not read for folders: no home is offered or preselected', async () => {
    cwds = { cwds: [], home: '/home/ada' };
    await show('/ai/auto/todos', { stopped: true });
    const d = await openDrawer();
    expect(folder(d)).not.toHaveTextContent('/');
    expect(calls.filter((c) => path(c.url).endsWith('/sessions/cwds'))).toHaveLength(0);
  });
  it.each([
    ['reports no home (older)', { cwds: [] }],
    ['reports an empty home', { cwds: [], home: '' }],
    ['reports a home that is not a path', { cwds: [], home: 'ada' }],
  ])('an agent that %s: no home choice, the field stays empty and required, never ""', async (_, body) => {
    cwds = body;
    await show();
    const d = await openDrawer();
    expect(folder(d)).not.toHaveTextContent('/');
    await userEvent.click(folder(d));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([chat['folder.another']]);
    await userEvent.keyboard('{Escape}');
    await flush();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['f.folder.bad'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
  it('with no folders the field is empty and required: Add says so and sends nothing', async () => {
    cwds = { cwds: [] };
    await show();
    const d = await openDrawer();
    expect(folder(d)).not.toHaveTextContent('/');
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['f.folder.bad'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
  it('Add sends POST /todos once, in the realm shown, with what was written; the new TODO opens beside the list', async () => {
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), '  Rotate the keys ');
    await userEvent.type(field(d, strings['f.details']), 'Before Friday');
    await userEvent.click(within(d).getByRole('button', { name: strings['f.more'] }));
    await userEvent.type(field(d, strings['f.tags']), '#ops, db');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts()).toHaveLength(1);
    const c = posts()[0]!;
    expect(c.body).toEqual({ title: 'Rotate the keys', body: 'Before Friday', priority: 2, tags: ['ops', 'db'], cwd: '/home/ada/shop' });
    expect(JSON.stringify(c.headers) + c.url).toContain(R1);
    expect(within(d).getByText('TODO #12 added')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['f.add'] })).toBeNull();
    expect(listReads()).toBeGreaterThan(1);
  });
  it('past the agent\'s limit the form refuses at once and sends nothing (never cut)', async () => {
    await show();
    const d = await openDrawer();
    await userEvent.click(field(d, strings['f.title']));
    await userEvent.paste('x'.repeat(TITLE_MAX + 1));
    await flush();
    expect(within(d).getByText(`Make it ${TITLE_MAX} characters or fewer (now ${TITLE_MAX + 1}).`)).toBeInTheDocument();
    await userEvent.click(addButton(d));
    await flush();
    expect(posts()).toHaveLength(0);
  });
  it('an open TODO with the same words: deduped, nothing new', async () => {
    post = () => ({ status: 200, body: { status: 'ok', todo: { id: 'todo_a', num: 1 }, deduped: true } });
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Prune the old snapshots');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText('You already have this TODO open: #1')).toBeInTheDocument();
    expect(within(d).getByText(strings['o.dedupedBody'])).toBeInTheDocument();
  });
  it('a lost answer is never sent again; Check again only reads and says how many match', async () => {
    post = () => {
      const made = (n: number, id: string, ms: number) => todo({ id, num: n, title: 'Rotate the keys', cwd: '/home/ada/shop', created_at: new Date(Date.now() + ms).toISOString() });
      items = [...items, made(13, 'todo_m2', 0), made(12, 'todo_m1', 1000)];
      return { status: 0, network: true };
    };
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['o.unsure'])).toBeInTheDocument();
    expect(within(d).queryByText(/added$/)).toBeNull();
    expect(addButton(d)).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await flush();
    expect(within(d).getByText('2 open TODOs with these words were made around then. Pick the one you added, if any.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('open_only=true')), 'Check again read the open TODOs').toHaveLength(1);
    const mine = within(d).getAllByRole('button', { name: /: this is mine$/ });
    expect(mine).toHaveLength(2);
    expect(mine.map((b) => b.textContent?.split(',')[0]), 'newest first').toEqual(['#12', '#13']);
    await userEvent.click(mine[0]!);
    await flush();
    expect(within(d).getByText('Marked #12 as the TODO you added')).toBeInTheDocument();
    expect(posts(), 'sent once, whatever was pressed').toHaveLength(1);
  });
  it('Stop tracking a lost filing: the same words cannot be added again (they may still arrive); changed words can', async () => {
    post = () => ({ status: 0, network: true });
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    await userEvent.click(within(d).getByRole('button', { name: strings['o.forget'] }));
    await flush();
    expect(within(d).getByText(strings['f.repeat'])).toBeInTheDocument();
    expect(addButton(d)).toBeDisabled();
    expect(posts()).toHaveLength(1);
    post = () => ({ status: 201, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false } });
    await userEvent.type(field(d, strings['f.title']), ' today');
    expect(within(d).queryByText(strings['f.repeat'])).toBeNull();
    await userEvent.click(addButton(d));
    await flush();
    expect(posts().map((c) => c.body.title)).toEqual(['Rotate the keys', 'Rotate the keys today']);
  });
  it('after Stop tracking, leaving the page and coming back still refuses the same filing', async () => {
    post = () => ({ status: 0, network: true });
    await show();
    let d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    await userEvent.click(within(d).getByRole('button', { name: strings['o.forget'] }));
    await flush();
    cleanup();
    resetKeptForTests();
    await show();
    d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'rotate  THE keys');
    expect(within(d).getByText(strings['f.repeat'])).toBeInTheDocument();
    expect(addButton(d)).toBeDisabled();
    expect(posts()).toHaveLength(1);
  });
  it('a realm switch closes the drawer and never carries the words; a filing still out stays with its own realm', async () => {
    post = () => ({ status: 0, network: true });
    await show();
    let d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['o.unsure'])).toBeInTheDocument();
    await act(async () => { setRealm('global'); bump('switch'); });
    await flush();
    expect(screen.queryByRole('dialog', { name: strings['new.title'] }), 'closed on the switch').toBeNull();
    d = await openDrawer();
    expect(field(d, strings['f.title']).value, 'the other realm starts empty').toBe('');
    expect(within(d).queryByText(strings['o.unsure'])).toBeNull();
    await userEvent.type(field(d, strings['f.title']), 'Prune');
    await act(async () => { setRealm(R1); bump('switch'); });
    await flush();
    expect(screen.queryByRole('dialog', { name: strings['new.title'] })).toBeNull();
    d = await openDrawer();
    expect(within(d).getByText(strings['o.unsure']), 'R1\'s lost filing is still tracked there').toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });
  it('a computer switch (no context bump, so the kit drawer keeps itself open) closes the drawer; the new computer starts empty', async () => {
    await show();
    let d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await act(async () => { setTarget({ project: { id: 'p2' }, container: { id: 'other-computer' } }); });
    await flush();
    expect(screen.queryByRole('dialog', { name: strings['new.title'] }), 'closed on the computer switch').toBeNull();
    d = await openDrawer();
    expect(field(d, strings['f.title']).value).toBe('');
    expect(posts()).toHaveLength(0);
  });
  it('an answer that comes after a realm switch and back: still tracked, never sent again, found by Check again', async () => {
    post = () => {
      items = [...items, todo({ id: 'todo_new', num: 12, title: 'Rotate the keys', cwd: '/home/ada/shop', created_at: new Date().toISOString() })];
      return { status: 201, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false }, delayMs: 400 };
    };
    await show();
    let d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await act(async () => { setRealm('global'); bump('switch'); });
    await act(async () => { setRealm(R1); bump('switch'); });
    await flush();
    d = await openDrawer();
    expect(within(d).getByText(strings['o.unsure']), 'the filing still out shows in its realm').toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    await flush();
    expect(within(d).getByText(strings['o.unsure']), 'answered to a context that ended: may have gone through').toBeInTheDocument();
    expect(addButton(d), 'never sent again').toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await flush();
    await userEvent.click(within(d).getByRole('button', { name: /: this is mine$/ }));
    await flush();
    expect(within(d).getByText('Marked #12 as the TODO you added')).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });
  it('a refusal keeps the words to change; editing clears the refusal and Add sends again', async () => {
    let n = 0;
    post = () => (++n === 1 ? { status: 400, body: { code: 'bad_request', error: 'cwd: required' } } : { status: 201, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false } });
    await show();
    const d = await openDrawer();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts(), 'the server got the POST and refused it (not a refusal before sending)').toHaveLength(1);
    expect(within(d).getByText(strings['o.refused'])).toBeInTheDocument();
    expect(field(d, strings['f.title']).value).toBe('Rotate the keys');
    await userEvent.type(field(d, strings['f.title']), '!');
    await userEvent.click(addButton(d));
    await flush();
    expect(posts()).toHaveLength(2);
    expect(within(d).getByText('TODO #12 added')).toBeInTheDocument();
  });
});

describe('New TODO: asking the agent', () => {
  it.skipIf(ASK_ENABLED)('Ask off: only the form', async () => {
    await show();
    const d = await openDrawer();
    expect(within(d).queryByRole('radiogroup', { name: strings['new.mode'] })).toBeNull();
    expect(within(d).queryByRole('radio', { name: strings['new.mode.ask'] })).toBeNull();
  });
  it('Ask on: the step starts a new Agent conversation with the words, never claims a TODO, and the switch keeps the words', async () => {
    setAskForFixtures(true);
    await show();
    const d = await openDrawer();
    expect(within(d).getByRole('radio', { name: strings['new.mode.write'] })).toBeChecked();
    expect(within(d).queryByRole('button', { name: strings['new.title'] }), 'the switch is the only way across: no Back').toBeNull();
    await userEvent.click(within(d).getByRole('radio', { name: strings['new.mode.ask'] }));
    await flush();
    const step = screen.getByRole('dialog', { name: strings['ask.title'] });
    const box = within(step).getByRole('textbox', { name: strings['ask.what'] }) as HTMLTextAreaElement;
    expect(box.value).toBe(strings['ask.prompt']);
    await userEvent.type(box, 'renew the certificate');
    expect(within(step).queryByRole('button', { name: strings['new.title'] }), 'no Back beside the switch').toBeNull();
    await userEvent.click(within(step).getByRole('radio', { name: strings['new.mode.write'] }));
    await flush();
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['new.mode.ask'] }));
    await flush();
    const again = screen.getByRole('dialog', { name: strings['ask.title'] });
    const box2 = within(again).getByRole('textbox', { name: strings['ask.what'] }) as HTMLTextAreaElement;
    expect(box2.value).toBe(`${strings['ask.prompt']}renew the certificate`);
    await userEvent.click(within(again).getByRole('button', { name: strings['ask.send'] }));
    const held = dock().draft;
    expect(held).toMatchObject({ text: `${strings['ask.prompt']}renew the certificate`, start: true });
    expect(posts(), 'the agent files it, not this drawer').toHaveLength(0);
    expect(screen.queryByText(/ added$|already have this TODO|as the TODO you added/)).toBeNull();
    await act(async () => { held?.onStart?.('sent'); });
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
  });  it('an Add whose answer is lost holds the switch on the form; the drawer has no padding of its own', async () => {
    setAskForFixtures(true);
    post = () => ({ status: 0, network: true });
    await show();
    const d = await openDrawer();
    const ask = within(d).getByRole('radio', { name: strings['new.mode.ask'] });
    expect(ask).toBeEnabled();
    expect(d.querySelector('[class~="p_md"]'), 'one padding: the drawer body\'s').toBeNull();
    await userEvent.type(field(d, strings['f.title']), 'Rotate the keys');
    await userEvent.click(addButton(d));
    await flush();
    expect(within(d).getByText(strings['o.unsure'])).toBeInTheDocument();
    expect(within(d).getByRole('radio', { name: strings['new.mode.ask'] }), 'the unknown Add stays in view').toBeDisabled();
    expect(within(d).getByRole('radio', { name: strings['new.mode.write'] })).toBeChecked();
  });
  it('a start whose answer is unknown holds the switch on the ask side', async () => {
    setAskForFixtures(true);
    await show();
    const d = await openDrawer();
    await userEvent.click(within(d).getByRole('radio', { name: strings['new.mode.ask'] }));
    await flush();
    const step = screen.getByRole('dialog', { name: strings['ask.title'] });
    await userEvent.type(within(step).getByRole('textbox', { name: strings['ask.what'] }), 'renew the certificate');
    expect(within(step).getByRole('radio', { name: strings['new.mode.write'] })).toBeEnabled();
    await userEvent.click(within(step).getByRole('button', { name: strings['ask.send'] }));
    const held = dock().draft;
    await flush();
    expect(within(step).getByRole('radio', { name: strings['new.mode.write'] }), 'sending: the form waits').toBeDisabled();
    await act(async () => { held?.onStart?.('unknown'); });
    await flush();
    expect(within(step).getByText(strings['ask.unknown'])).toBeInTheDocument();
    expect(within(step).getByRole('radio', { name: strings['new.mode.write'] }), 'unknown: the form waits').toBeDisabled();
    expect(within(step).getByRole('radio', { name: strings['new.mode.ask'] })).toBeChecked();
  });
});
