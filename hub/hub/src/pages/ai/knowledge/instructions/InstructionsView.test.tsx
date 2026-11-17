// Knowledge → Instructions on real core (fixture transport). One read of the top bar's computer and realm shows the text and
// its switch with what agents get; Save sends both together with the revision read; a conflict offers Compare / Keep mine / Load
// theirs; a local-file refusal names its field; a lost save says it may have been saved and only reads back. A failed read, an answer
// of the wrong shape and an agent without the route each say so and never read as "no instructions"; All realms reads and writes in
// the computer's own realm (aiRealm.ts), and nothing for a computer in several realms.
import { answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, realmsView, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { bump, setRealm } from '@core/ctx';
import { StrictMode } from 'react';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { computerRealms } from '../../realmRules.testing';
import InstructionsView from './InstructionsView';
import { instructionsRoutes } from './routes';
import strings from './strings.en.json';

/** Every agent call the transport sent: method, path and the realm read from its URL. kit.ts sends an agent call's realm in
 *  its URL only (admit: never in the built query), so a fixture request's query never carries it; the recorder is how a test
 *  reads it (as the GitHub Global case in settings/connections/accounts.test.tsx reads the fetched URLs). */
type AgentCall = { method: string; path: string; realm: string | null };
let agentCalls: AgentCall[] = [];
function recordAgentCalls(t: ReturnType<typeof bootFixtureCore>, first?: (c: AgentCall) => Response | undefined): void {
  agentCalls = [];
  const real = t.fetch.bind(t);
  t.fetch = (url, init, meta) => {
    const c: AgentCall = { method: meta.method.toUpperCase(), path: meta.path, realm: new URL(url, 'http://fixture.invalid').searchParams.get('realm') };
    agentCalls.push(c);
    const own = first?.(c);
    return own ? Promise.resolve(own) : real(url, init, meta);
  };
}
/** The realms the agent calls to `path` sent, in order. */
const realmsOf = (path: string, method = 'GET'): (string | null)[] => agentCalls.filter((c) => c.path === path && c.method === method).map((c) => c.realm);
let gets: FixtureRequest[] = [];
let puts: FixtureRequest[] = [];
type Answer = (r: FixtureRequest, n: number) => FixtureAnswer | Promise<FixtureAnswer>;
const TEXT = 'Answer in English.\nKeep pull requests small.';
const body = (over: Record<string, unknown> = {}) => ({ text: TEXT, enabled: true, revision: 'rev-1', ...over });
const refused = (status: number, code: string, details?: Record<string, unknown>): FixtureAnswer => ({ status, body: { code, message: code, ...(details ? { details } : {}) } });

async function show(get: Answer, put: Answer = () => answers.ok(body({ revision: 'rev-2' })), realm?: string, strict = false, extra: FixtureRule[] = []) {
  gets = [];
  puts = [];
  recordAgentCalls(bootFixtureCore({
    rules: [
      ...extra,
      reply(instructionsRoutes.get, (r) => (gets.push(r), get(r, gets.length))),
      reply(instructionsRoutes.put, (r) => (puts.push(r), put(r, puts.length))),
    ],
    ...(realm !== undefined ? { realm } : {}),
  }));
  const router = createRouter({ routeTree: createRootRoute({ component: InstructionsView }), history: createMemoryHistory({ initialEntries: ['/ai/knowledge/instructions'] }) });
  await act(async () => {
    const app = <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
    render(strict ? <StrictMode>{app}</StrictMode> : app);
    await router.load();
  });
}
const noBlank = () => expect(screen.queryByText(strings['effect.blank'])).toBeNull();
const textBox = () => screen.getByRole('textbox', { name: strings['text.label'] }) as HTMLTextAreaElement;
const toggle = () => screen.getByRole('switch', { name: strings['switch.label'] });
const save = () => screen.getByRole('button', { name: strings.save });
// The realm of the rule's n-th call, read from the URL the transport sent (agentCalls): the shown realm.
const realmIs = (r: FixtureRequest) => { expect(realmsOf(r.path, r.method)[r.n - 1]).toBe(realmsView().selected); };

afterEach(() => {
  cleanup();
  queryClient.clear();
  // Kept edits (held.ts) live in the module: a sign-out drops them, so no test sees another's.
  bump('signout');
});

describe('instructions: read', () => {
  it('shows the text and switch from one read of this computer and realm, with what agents get', async () => {
    await show(() => answers.ok(body()));
    expect(await screen.findByText(strings['effect.given'])).toBeInTheDocument();
    expect(screen.getByText(strings['state.on'])).toBeInTheDocument();
    expect(screen.getByText(strings['effect.running'])).toBeInTheDocument();
    expect(textBox().value).toBe(TEXT);
    expect(toggle()).toBeChecked();
    expect(gets).toHaveLength(1);
    expect(gets[0]!.method).toBe('GET');
    realmIs(gets[0]!);
    expect(save()).toBeDisabled(); // nothing changed yet
  });

  it('Read again is the header toolbar icon, as on list pages: named for screen readers, no visible word', async () => {
    await show(() => answers.ok(body()));
    const btn = await screen.findByRole('button', { name: strings.refresh });
    expect(btn.textContent ?? '').not.toContain(strings.refresh);
  });

  it('off keeps the text and says agents get none of it', async () => {
    await show(() => answers.ok(body({ enabled: false })));
    expect(await screen.findByText(strings['effect.off'])).toBeInTheDocument();
    expect(screen.getByText(strings['state.off'])).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
    expect(textBox().value).toBe(TEXT);
  });

  it('blank text says none is written for instructions built from now on (a read that worked)', async () => {
    await show(() => answers.ok(body({ text: '  ' })));
    expect(await screen.findByText(strings['effect.blank'])).toBeInTheDocument();
  });

  it('All realms, a computer in several realms: reads nothing and asks for one realm', async () => {
    const atlas = fixtureWorld.computers[0]!;
    const [r1, r2] = [fixtureWorld.realms[0]!.id, fixtureWorld.realms[1]!.id];
    await show(() => answers.ok(body()), undefined, 'all', false, [computerRealms(atlas.id, [r1, r2])]);
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(gets).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('All realms, a computer in one realm: reads and saves in that realm', async () => {
    const atlas = fixtureWorld.computers[0]!;
    const r1 = fixtureWorld.realms[0]!.id;
    await show(() => answers.ok(body()), undefined, 'all', false, [computerRealms(atlas.id, [r1])]);
    await screen.findByText(strings['effect.given']);
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    expect(gets.length).toBeGreaterThan(0);
    expect(realmsOf('/settings/agent-instructions').length).toBeGreaterThan(0);
    for (const r of realmsOf('/settings/agent-instructions')) expect(r).toBe(r1);
    await userEvent.clear(textBox());
    await userEvent.type(textBox(), 'Be brief.');
    await userEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(realmsOf('/settings/agent-instructions', 'PUT')).toEqual([r1]);
  });

  it('All realms, a computer in no realm: reads Global\'s instructions', async () => {
    const atlas = fixtureWorld.computers[0]!;
    await show(() => answers.ok(body()), undefined, 'all', false, [computerRealms(atlas.id, [])]);
    await screen.findByText(strings['effect.given']);
    expect(gets.length).toBeGreaterThan(0);
    expect(realmsOf('/settings/agent-instructions').length).toBeGreaterThan(0);
    for (const r of realmsOf('/settings/agent-instructions')) expect(r).toBe('global');
  });

  it('an unreadable settings file (500 store_failed) is an error with Try again, never "no instructions"', async () => {
    await show(() => refused(500, 'store_failed'));
    expect(await screen.findByText(strings.failed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    noBlank();
  });

  it.each([
    ['without enabled', { enabled: undefined }],
    ['without revision', { revision: undefined }],
    ['with text not a string', { text: 7 }],
  ])('an answer %s is a failed read, never blank or an editor', async (_n, over) => {
    await show(() => answers.ok(body(over)));
    expect(await screen.findByText(strings.failed)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    noBlank();
  });

  it('an agent without the route (bare 404) says it cannot show them; a coded 404 is an error', async () => {
    await show(() => ({ status: 404, body: '404 page not found\n', raw: true, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    expect(await screen.findByText(strings['old.title'])).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(strings['state.on'])).toBeNull();
    cleanup();
    queryClient.clear();
    await show(() => refused(404, 'not_found'));
    expect(await screen.findByText(strings.failed)).toBeInTheDocument();
    expect(screen.queryByText(strings['old.title'])).toBeNull();
  });
});

describe('instructions: write', () => {
  it('Save sends the text and the switch together with the revision read, in this realm; the answer becomes what is shown', async () => {
    await show(() => answers.ok(body()), () => answers.ok(body({ text: 'Be brief.', enabled: false, revision: 'rev-2' })));
    await screen.findByText(strings['effect.given']);
    await userEvent.clear(textBox());
    await userEvent.type(textBox(), 'Be brief.');
    await userEvent.click(toggle());
    expect(screen.getByText(strings['effect.off'])).toBeInTheDocument(); // the effect line follows the draft
    expect(screen.getByText(strings['state.on'])).toBeInTheDocument(); // the pill says what is saved
    await userEvent.click(save());
    await waitFor(() => expect(screen.getByText(strings['state.off'])).toBeInTheDocument());
    expect(puts).toHaveLength(1);
    expect(puts[0]!.method).toBe('PUT');
    expect(puts[0]!.body).toEqual({ text: 'Be brief.', enabled: false, expected_revision: 'rev-1' });
    realmIs(puts[0]!);
    expect(save()).toBeDisabled();
  });

  it('turning the switch alone still sends the text as it was read', async () => {
    await show(() => answers.ok(body()), () => answers.ok(body({ enabled: false, revision: 'rev-2' })));
    await screen.findByText(strings['effect.given']);
    await userEvent.click(toggle());
    await userEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.body).toEqual({ text: TEXT, enabled: false, expected_revision: 'rev-1' });
  });

  it('409 revision_conflict: nothing saved; Compare shows how theirs would change; Keep mine saves over their revision', async () => {
    await show(
      (_r, n) => answers.ok(n === 1 ? body() : body({ text: 'Answer in French.', enabled: false, revision: 'rev-5' })),
      (_r, n) => (n === 1 ? refused(409, 'revision_conflict', { current_revision: 'rev-5' }) : answers.ok(body({ text: 'mine', revision: 'rev-6' }))),
    );
    await screen.findByText(strings['effect.given']);
    await userEvent.clear(textBox());
    await userEvent.type(textBox(), 'mine');
    await userEvent.click(save());
    expect(await screen.findByText(strings.conflict)).toBeInTheDocument();
    expect(textBox().value).toBe('mine');
    expect(textBox()).toBeDisabled();
    expect(screen.queryByRole('button', { name: strings['conflict.keep'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const cmp = (await screen.findByText(strings['diff.title'])).closest('section')!;
    expect(within(cmp).getByText('Theirs Off, yours On')).toBeInTheDocument();
    expect(within(cmp).getByText('1 lines added, 1 removed')).toBeInTheDocument();
    // Two actions in the band: Keep mine takes Compare's place once theirs is read.
    expect(screen.queryByRole('button', { name: strings['conflict.compare'] })).toBeNull();
    expect(screen.getByRole('button', { name: strings['conflict.reload'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.keep'] }));
    expect(screen.queryByText(strings.conflict)).toBeNull();
    await userEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.body).toEqual({ text: 'mine', enabled: true, expected_revision: 'rev-5' });
  });

  it('409 revision_conflict, Load theirs (after confirming the drop) shows theirs and sends nothing', async () => {
    await show((_r, n) => answers.ok(n === 1 ? body() : body({ text: 'theirs', revision: 'rev-5' })), () => refused(409, 'revision_conflict', { current_revision: 'rev-5' }));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), ' more');
    await userEvent.click(save());
    await screen.findByText(strings.conflict);
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.reload'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['reload.confirm'] }));
    await waitFor(() => expect(textBox().value).toBe('theirs'));
    expect(puts).toHaveLength(1);
  });

  it.each([
    [['enabled'], 'overridden.enabled'],
    [['text'], 'overridden.text'],
    [['text', 'enabled'], 'overridden.both'],
    [['nonsense'], 'overridden.unknown'],
  ] as const)('409 instructions_overridden %j: says the local settings file wins and nothing was saved', async (fields, key) => {
    await show(() => answers.ok(body()), () => refused(409, 'instructions_overridden', { fields: [...fields] }));
    await screen.findByText(strings['effect.given']);
    await userEvent.click(toggle());
    await userEvent.click(save());
    expect(await screen.findByText(strings[key])).toBeInTheDocument();
    expect(screen.getByText(strings['state.on'])).toBeInTheDocument(); // what is saved did not change
    expect(toggle()).not.toBeDisabled(); // the person can change the value
  });

  it('500 store_failed on save may have been saved (core: a 5xx to a change): said so, Check offered, nothing resent', async () => {
    await show(() => answers.ok(body()), () => refused(500, 'store_failed'));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), '!');
    await userEvent.click(save());
    expect(await screen.findByText(strings.unsure)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['unsure.check'] })).toBeInTheDocument();
    expect(textBox().value).toBe(`${TEXT}!`);
    expect(puts).toHaveLength(1);
  });

  it('a lost save may have been saved: no second send; Check reads back, and only what was sent settles it', async () => {
    await show(
      (_r, n) => answers.ok(n === 1 ? body() : n === 2 ? body() : body({ text: `${TEXT}!`, revision: 'rev-3' })),
      () => answers.lost(10),
    );
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), '!');
    await userEvent.click(save());
    expect(await screen.findByText(strings.unsure)).toBeInTheDocument();
    expect(textBox()).toBeDisabled();
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['unsure.check'] }));
    expect(await screen.findByText(strings['unsure.same'])).toBeInTheDocument();
    expect(screen.getByText(strings.unsure)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['unsure.check'] }));
    await waitFor(() => expect(screen.queryByText(strings.unsure)).toBeNull());
    expect(textBox()).not.toBeDisabled();
    expect(puts).toHaveLength(1);
  });
});

describe('instructions: the edit follows its computer and realm', () => {
  const atlas = () => fixtureWorld.computers.find((c) => c.name === 'atlas')!;
  const other = () => fixtureWorld.computers.find((c) => c.name === 'borealis')!;
  const pick = async (c: Parameters<typeof chooseComputer>[0]) => { await act(async () => { chooseComputer(c); }); };

  it('Compare shows the whole difference, past 400 lines, while Keep mine is offered', async () => {
    const long = Array.from({ length: 450 }, (_, i) => `their line ${i + 1}`).join('\n');
    await show(
      (_r, n) => answers.ok(n === 1 ? body() : body({ text: long, revision: 'rev-5' })),
      () => refused(409, 'revision_conflict', { current_revision: 'rev-5' }),
    );
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), '!');
    await userEvent.click(save());
    await userEvent.click(await screen.findByRole('button', { name: strings['conflict.compare'] }));
    const cmp = (await screen.findByText(strings['diff.title'])).closest('section')!;
    expect(cmp.textContent).toContain('their line 450');
    expect(cmp.textContent).toContain('their line 401');
    expect(screen.getByRole('button', { name: strings['conflict.keep'] })).toBeInTheDocument();
  });

  it.each([
    ['without a draft', false],
    ['with a draft', true],
  ])('a failed Read again %s says what is shown is the last read, keeps it, and Try again reads', async (_n, typed) => {
    await show((_r, n) => (n === 2 ? refused(403, 'forbidden') : answers.ok(body(n === 3 ? { text: 'newer', revision: 'rev-3' } : {}))));
    await screen.findByText(strings['effect.given']);
    if (typed) await userEvent.type(textBox(), '!');
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    if (typed) await userEvent.click(await screen.findByRole('button', { name: strings['reload.confirm'] }));
    expect(await screen.findByText(strings.refreshFailed.replace('{{code}}', 'forbidden'))).toBeInTheDocument();
    expect(textBox().value).toBe(typed ? `${TEXT}!` : TEXT);
    await userEvent.click(screen.getByRole('button', { name: strings['refreshFailed.retry'] }));
    if (typed) await userEvent.click(await screen.findByRole('button', { name: strings['reload.confirm'] }));
    await waitFor(() => expect(textBox().value).toBe('newer'));
    expect(screen.queryByText(strings.refreshFailed.replace('{{code}}', 'forbidden'))).toBeNull();
  });

  it('a refusal and a failed Read again show together, each its own band in the page notices, with no wrapper of the page', async () => {
    await show((_r, n) => (n === 2 ? refused(403, 'forbidden') : answers.ok(body())), () => refused(409, 'instructions_overridden', { fields: ['enabled'] }));
    await screen.findByText(strings['effect.given']);
    await userEvent.click(toggle());
    await userEvent.click(save());
    await screen.findByText(strings['overridden.enabled']);
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await userEvent.click(await screen.findByRole('button', { name: strings['reload.confirm'] }));
    const failed = await screen.findByText(strings.refreshFailed.replace('{{code}}', 'forbidden'));
    const refusal = screen.getByText(strings['overridden.enabled']);
    // The page's notices area (DetailPage .noticeStack / .paneNotice) holds the two bands as separate children, the
    // refusal first: a page-local wrapper around both (the old Stack) would make them one child.
    const area = refusal.closest('.noticeStack, .paneNotice')!;
    expect(area).not.toBeNull();
    expect(area.contains(failed)).toBe(true);
    const kids = Array.from(area.children);
    const [a, b] = [kids.findIndex((k) => k.contains(refusal)), kids.findIndex((k) => k.contains(failed))];
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
  });

  it('a draft outlives picking the same computer again and going to another computer and back; nothing is read again', async () => {
    await show(() => answers.ok(body()));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), ' kept');
    await pick(atlas()); // the same computer: a new Target object
    expect(textBox().value).toBe(`${TEXT} kept`);
    await pick(other());
    await waitFor(() => expect(gets.some((g) => g.target?.container.id === other().id)).toBe(true));
    await pick(atlas());
    await waitFor(() => expect(textBox().value).toBe(`${TEXT} kept`));
    expect(gets.filter((g) => g.target?.container.id === atlas().id)).toHaveLength(1);
  });

  it('a save out while the page is away still lands: answered saved, coming back reads what is saved, nothing resent', async () => {
    let answer: (a: FixtureAnswer) => void = () => {};
    await show((_r, n) => answers.ok(n === 1 ? body() : body({ enabled: false, revision: 'rev-2' })), () => new Promise<FixtureAnswer>((res) => { answer = res; }));
    await screen.findByText(strings['effect.given']);
    await userEvent.click(toggle());
    await userEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    await pick(other());
    await act(async () => { answer(answers.ok(body({ enabled: false, revision: 'rev-2' }))); });
    await pick(atlas());
    await waitFor(() => expect(screen.getByText(strings['state.off'])).toBeInTheDocument());
    expect(toggle()).not.toBeChecked();
    expect(puts).toHaveLength(1);
  });

  it('a lost save stays unsure across a computer switch and back, and is named to a switch or sign-out', async () => {
    const { switchLosses } = await import('@core');
    await show(() => answers.ok(body()), () => answers.lost(10));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), '!');
    await userEvent.click(save());
    await screen.findByText(strings.unsure);
    await pick(other());
    expect(switchLosses()).toContain(strings['held.loss_one']);
    await pick(atlas());
    expect(await screen.findByText(strings.unsure)).toBeInTheDocument();
    expect(puts).toHaveLength(1);
  });

  it('a sign-out drops kept edits: the page reads afresh and names nothing', async () => {
    const { switchLosses } = await import('@core');
    await show(() => answers.ok(body()));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), ' gone');
    await pick(other());
    expect(switchLosses()).toContain(strings['held.loss_one']);
    act(() => { bump('signout'); });
    expect(switchLosses()).not.toContain(strings['held.loss_one']);
    await pick(atlas());
    await waitFor(() => expect(textBox().value).toBe(TEXT));
  });

  it('mounts under StrictMode: one shown read, edits and Save work', async () => {
    await show(() => answers.ok(body()), () => answers.ok(body({ enabled: false, revision: 'rev-2' })), undefined, true);
    await screen.findByText(strings['effect.given']);
    await userEvent.click(toggle());
    await userEvent.click(save());
    await waitFor(() => expect(screen.getByText(strings['state.off'])).toBeInTheDocument());
    expect(puts).toHaveLength(1);
  });

  it('Keep mine is not pressable while Load theirs reads: their answer cannot replace what was compared', async () => {
    let theirs: (a: FixtureAnswer) => void = () => {};
    await show(
      (_r, n) => (n === 1 ? answers.ok(body()) : n === 2 ? answers.ok(body({ text: 'theirs', revision: 'rev-5' })) : new Promise<FixtureAnswer>((res) => { theirs = res; })),
      () => refused(409, 'revision_conflict', { current_revision: 'rev-5' }),
    );
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), '!');
    await userEvent.click(save());
    await userEvent.click(await screen.findByRole('button', { name: strings['conflict.compare'] }));
    const keep = await screen.findByRole('button', { name: strings['conflict.keep'] });
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.reload'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['reload.confirm'] }));
    await waitFor(() => expect(gets).toHaveLength(3));
    expect(keep).toBeDisabled();
    await act(async () => { theirs(answers.ok(body({ text: 'theirs again', revision: 'rev-6' }))); });
    await waitFor(() => expect(textBox().value).toBe('theirs again'));
    expect(puts).toHaveLength(1);
  });

  it('a realm switch keeps the edit of the realm left: back in it, the draft is there and nothing was read again', async () => {
    const A = realmsView().selected;
    const other = fixtureWorld.realms.map((r) => r.id).find((id) => id !== A)!;
    await show(() => answers.ok(body()));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), ' kept');
    await act(async () => { setRealm(other); bump('switch'); });
    await waitFor(() => expect(gets.length).toBe(2));
    await waitFor(() => expect(textBox().value).toBe(TEXT));
    await act(async () => { setRealm(A); bump('switch'); });
    await waitFor(() => expect(textBox().value).toBe(`${TEXT} kept`));
    expect(gets).toHaveLength(2);
  });

  it('leaving the page says the change stays while the Hub is open, never that it is lost', async () => {
    await show(() => answers.ok(body()));
    await screen.findByText(strings['effect.given']);
    expect(strings['leave.body']).toMatch(/stay/);
    expect(strings['leave.body.unsure']).toMatch(/stay|come back/i);
  });

  it('a draft kept on another computer still asks before the tab closes while a clean computer is shown', async () => {
    const asks = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    await show(() => answers.ok(body()));
    await screen.findByText(strings['effect.given']);
    await userEvent.type(textBox(), ' kept');
    await pick(other());
    await waitFor(() => expect(gets.some((g) => g.target?.container.id === other().id)).toBe(true));
    await waitFor(() => expect(textBox().value).toBe(TEXT));
    expect(asks()).toBe(true);
    await pick(atlas());
    await waitFor(() => expect(textBox().value).toBe(`${TEXT} kept`));
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));
    await waitFor(() => expect(textBox().value).toBe(TEXT));
    expect(asks()).toBe(false);
  });
});

