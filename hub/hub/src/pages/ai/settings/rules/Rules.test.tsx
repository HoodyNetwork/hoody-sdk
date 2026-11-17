// The checked rules on a live page: the real core over a fake fetch and a scripted session manager. A rules-only view
// opens nothing (getHookRules, with X-Hoody-Cwd for a folder); the first change opens one settings chat, mints a one-time
// permission on it and sends the scope's COMPLETE list with the revision it was read at; a lost answer is held as unknown
// until a fresh read proves it (never resent, never failed); a place that cannot be shown whole is read only with its reason.
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient, refreshFresh, sourceReads, useCurrentComputer, useRealms } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
import stateStrings from '@kit/states/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceBar, PlaceProvider } from './Place';
import { RulesSection } from './Rules';
import { RULES_SOURCE } from './data';
import { createSettingsSessions, setSettingsSessionsForTests, type SessionApi, type SettingsSessions } from './Session';
import strings from './Rules.strings.en.json';
import aiStrings from '../../strings.en.json';
import newStrings from '../../new/NewChat.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const FOLDER = '/home/ada/shop';
/** A string the page must have: fails loudly instead of matching `undefined`. */
const said = (k: string): string => {
  const v = (strings as Record<string, string>)[k];
  if (v === undefined) throw new Error(`missing string ${k}`);
  return v;
};
type Hook = (c: { url: URL; method: string; body: Record<string, unknown> | null; headers: Record<string, string> }) => Reply | Promise<Reply> | undefined;
type Over = Partial<Record<'rules' | 'begin' | 'set' | 'cwds' | 'agents' | 'tools', Hook>>;
let over: Over = {};
let seq = 0;
let rev = 1;

interface Row { id: string; text: string; kind: string; tools?: string[]; agents?: string[]; scope?: string; folder?: string; when?: unknown }
let live: Row[] = [];
let revs: Record<string, string> = {};
let complete = true;

const u = (s: string) => new URL(s);
const hooks = () => calls.filter((c) => u(c.url).pathname.includes('/agent/hooks'));
const writes = () => calls.filter((c) => c.method !== 'GET' && u(c.url).pathname.endsWith('/hooks/rules'));
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await settle(); }); };

// ---- the scripted session manager ----
let created = 0;
/** The folder each settings chat was opened for (undefined: the realm's own). */
let createdAt: Array<string | undefined> = [];
let closed: string[] = [];
/** Whether the scripted agent lists call_when in GET /version. */
let callWhen = true;
/** `create`: the agent's answer to opening a settings chat, in place of a normal session. */
function sessions(create?: SessionApi['create']): SettingsSessions {
  const api: SessionApi = {
    status: async () => ({ connected: true, account_id: 'acct', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' }),
    version: async () => ({ session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', ...(callWhen ? ['call_when'] : [])].map((name) => ({ name, supported: true, available: true })) }),
    create: create ?? (async (a) => { created++; createdAt.push(a.cwd); return { session_id: `s${created}`, started: { realm_selector: a.realm, computer_id: 'c1', owner_fingerprint: 'fp' } }; }),
    close: async (_a, sid) => { closed.push(sid); },
  };
  const leases: LeaseManager = {
    track: (_ref: LeaseRef): LeaseHandle => ({ set: () => undefined, close: () => undefined }),
    ensure: async () => undefined,
    state: () => ({ phase: 'held' as never }),
    subscribe: () => () => undefined,
    forget: () => undefined,
    releaseAll: () => undefined,
    resume: () => undefined,
    reset: () => undefined,
  };
  let k = 0;
  return createSettingsSessions({ api, leases, newKey: () => `key-${++k}`, account: () => 'acct' });
}

function Host() {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  // The page's shape (Settings.tsx): one provider, its bar, then the section.
  return target ? (
    <PlaceProvider target={target} realm={realm}>
      <PlaceBar computer="atlas" />
      <RulesSection target={target} realm={realm} />
    </PlaceProvider>
  ) : null;
}
async function show() {
  const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
}
const rulesBody = () => ({
  status: 'ok',
  rules: {
    live: live.map((r) => ({ tools: [], agents: [], ...r })),
    scopes: Object.entries(revs).map(([scope, revision]) => ({ scope, revision })),
    rules_complete: complete,
    rule_warnings: [],
    warnings: [],
    exec_trust: [],
  },
});

let mgr: SettingsSessions;
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  over = {};
  seq = 0;
  rev = 1;
  created = 0;
  createdAt = [];
  closed = [];
  callWhen = true;
  complete = true;
  revs = { user: 'rev-1' };
  live = [
    { id: 'no-rm', text: 'Never run rm -rf', kind: 'limit', tools: ['bash'], scope: 'user' },
    { id: 'tests', text: 'Run the tests before saying done', kind: 'guidance', scope: 'user' },
  ];
  mgr = sessions();
  setSettingsSessionsForTests(mgr);
  onFetch((c) => {
    const url = u(c.url);
    const p = url.pathname;
    const x = { url, method: c.method, body: c.body as Record<string, unknown> | null, headers: c.headers };
    const hit = (k: keyof Over, d: () => Reply): Reply | Promise<Reply> => over[k]?.(x) ?? d();
    // What the rule dialog offers to pick from: the realm's agents and the agent's tool catalogue (reads only).
    if (p.endsWith('/agent/agents')) return hit('agents', () => ({ status: 200, body: { items: [{ name: 'general', provenance: 'user' }, { name: 'reviewer', provenance: 'user' }], meta: { total: 2 } } }));
    if (p.endsWith('/agent/tools')) return hit('tools', () => ({ status: 200, body: { items: [{ name: 'bash', description: 'Run a command', read_only: false }, { name: 'read_file', description: 'Read a file', read_only: true }], meta: { total: 2 } } }));
    if (p.endsWith('/sessions/cwds')) return hit('cwds', () => ({ status: 200, body: { cwds: [FOLDER] } }));
    if (p.endsWith('/hooks/begin-write')) return hit('begin', () => ({ status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, op: 'rules_set', scope: c.body?.scope } }));
    if (p.endsWith('/hooks/rules') && c.method === 'POST') {
      return hit('set', () => {
        const scope = String(c.body?.scope);
        revs = { ...revs, [scope]: `rev-${++rev + 1}` };
        live = [...live.filter((r) => (r.scope ?? 'user') !== scope), ...((c.body?.rules as Row[]) ?? []).map((r) => ({ ...r, scope }))];
        return { status: 200, body: { status: 'ok', revision: revs[scope], warnings: [] } };
      });
    }
    if (p.endsWith('/hooks/rules')) return hit('rules', () => ({ status: 200, body: rulesBody() }));
    return { status: 404, body: {} };
  });
});
afterEach(() => { cleanup(); mgr.reset(); setSettingsSessionsForTests(null); });

const addRule = async (text: string) => {
  await userEvent.click(await screen.findByRole('button', { name: strings.add }));
  const dlg = await screen.findByRole('dialog');
  expect(dlg).toHaveAttribute('data-hub-overlay', 'ai-rule-edit'); // the dialog names its overlay
  await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), text);
  await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
  await flush();
};

describe('rules: a rules-only view', () => {
  it('the section links to the rules and hooks question, which opens its answer in place', async () => {
    await show();
    await userEvent.click(await screen.findByRole('link', { name: strings.more }));
    expect(await screen.findByText(aiStrings['faq.rulesHooks.a'])).toBeInTheDocument();
  });

  it('reads getHookRules and opens no session, no permission and no write', async () => {
    await show();
    expect(await screen.findByText('Never run rm -rf')).toBeInTheDocument();
    expect(hooks().map((c) => `${c.method} ${u(c.url).pathname.split('/agent')[1]}`)).toEqual(['GET /hooks/rules']);
    expect(created).toBe(0);
    expect(writes()).toHaveLength(0);
  });

  it('the realm view names no folder; the folder view sends X-Hoody-Cwd and still opens nothing', async () => {
    await show();
    expect(hooks()[0]!.headers['x-hoody-cwd']).toBeUndefined();
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    const withCwd = hooks().filter((c) => c.headers['x-hoody-cwd'] !== undefined);
    expect(withCwd.length).toBeGreaterThan(0);
    expect(withCwd[0]!.headers['x-hoody-cwd']).toBe(FOLDER);
    expect(created).toBe(0);
  });

  it('says how the settings chat is used in the card\'s own FAQ answer, not on the card', async () => {
    await show();
    const card = await rulesCard();
    expect(within(card).getByRole('link', { name: strings.more })).toBeInTheDocument();
    expect(aiStrings['faq.rulesHooks.a']).toMatch(/settings chat: no tools, kept open while you are on the page, closed when you leave/);
    expect(within(card).queryByText(/settings chat/)).toBeNull();
  });
});

// The rules are one kit card titled
// Rules (Guidance and Playbook are not checked), one line on what they are, the realm's counts as one line under the list, and
// loading, failure, an unreadable answer and "choose a folder" as the card's own states. The settings-chat words are the card's
// FAQ answer (the card's one explanation region has no room for an About beside its description and note).
const rulesCard = async () => (await screen.findByRole('heading', { name: strings.title })).closest('section')!;

describe('rules: the Rules card', () => {
  it('is titled Rules and says what rules are in one line; the settings-chat words are not on the card', async () => {
    await show();
    expect(strings.title).toBe('Rules');
    const card = await rulesCard();
    expect(within(card).getByText(said('description'))).toBeInTheDocument();
    expect(said('description')).toMatch(/limit/i);
    expect(said('description')).toMatch(/guidance/i);
    expect(within(card).queryByText(/settings chat/)).toBeNull();
  });

  it('the realm\'s counts are one line under the list, not a table of places', async () => {
    live = [{ id: 'a', text: 'Never push to main', kind: 'limit', scope: 'user' }, { id: 'b', text: 'Answer in British English', kind: 'guidance', scope: 'user' }];
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('caps.note').replace('{{checked}}', '1').replace('{{prompt}}', '1'))).toBeInTheDocument();
    expect(within(card).queryByText(said('caps.label'))).toBeNull();
    expect(within(card).queryByLabelText(said('caps.label'))).toBeNull();
  });

  it('a folder keeps the counts of each place it holds (realm, shared, just me)', async () => {
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    const card = await rulesCard();
    expect(await within(card).findByText(said('scope.project'))).toBeInTheDocument();
    expect(within(card).getByText(said('scope.local'))).toBeInTheDocument();
  });

  it('an answer that cannot be read whole is the card\'s unknown state, with nothing to add or edit', async () => {
    over.rules = () => ({ status: 200, body: { status: 'ok', rules: { live: [{ id: 5 }], scopes: [] } } });
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('unreadable'))).toBeInTheDocument();
    expect(card).toHaveAttribute('data-hub-state', 'unknown');
    expect(screen.queryByRole('button', { name: strings.add })).toBeNull();
  });

  it('a read that fails is the card\'s failed state, with Try again', async () => {
    over.rules = () => ({ status: 500, body: { error: 'boom' } });
    await show();
    const card = await rulesCard();
    await vi.waitFor(() => expect(card).toHaveAttribute('data-hub-state', 'failed'));
    expect(screen.queryByRole('button', { name: strings.add })).toBeNull();
  });

  it('with no folder chosen the card says to choose one (its not-here state), and reads nothing for it', async () => {
    over.cwds = () => ({ status: 200, body: { cwds: [] } });
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    const card = await rulesCard();
    expect(card).toHaveAttribute('data-hub-state', 'notHere');
    expect(within(card).getByText(said('place.noFolder.title'))).toBeInTheDocument();
    expect(within(card).getByText(said('place.noFolder'))).toBeInTheDocument();
  });
});

/** The scripted answer with fields of its own over the usual one. */
const answerWith = (extra: Record<string, unknown>) => () => {
  const b = rulesBody();
  return { status: 200, body: { ...b, rules: { ...b.rules, ...extra } } };
};
const capsLine = (checked: number, prompt: number) => said('caps').replace('{{checked}}', String(checked)).replace('{{prompt}}', String(prompt));
const realmNote = (checked: number, prompt: number) => said('caps.note').replace('{{checked}}', String(checked)).replace('{{prompt}}', String(prompt));

describe('rules: counts only from a whole list', () => {
  it('a list the agent says may not be complete shows no realm counts, only its warning', async () => {
    complete = false;
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('readonly.incomplete'))).toBeInTheDocument();
    expect(within(card).getByText('Never run rm -rf')).toBeInTheDocument();
    expect(within(card).queryByText(/^In this realm:/)).toBeNull();
  });

  it('a list with rule warnings is not whole either: no realm counts', async () => {
    over.rules = answerWith({ rule_warnings: ['rule 3 could not be read'] });
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('readonly.incomplete'))).toBeInTheDocument();
    expect(within(card).queryByText(/^In this realm:/)).toBeNull();
  });

  it('a folder whose list may not be complete shows no counts per place', async () => {
    scoped();
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    let card = await rulesCard();
    // whole: realm 1 checked; shared 2 guidance; just me 1 guidance
    expect(await within(card).findByText(capsLine(0, 2))).toBeInTheDocument();
    expect(within(card).getByText(capsLine(0, 1))).toBeInTheDocument();
    expect(within(card).getByLabelText(said('caps.label'))).toBeInTheDocument();
    complete = false;
    await act(async () => { await refreshFresh(sourceReads(RULES_SOURCE, ['rules'])); });
    await flush();
    card = await rulesCard();
    expect(await within(card).findByText(said('readonly.incomplete'))).toBeInTheDocument();
    expect(within(card).queryByLabelText(said('caps.label'))).toBeNull();
    expect(within(card).queryByText(capsLine(0, 2))).toBeNull();
    expect(within(card).queryByText(capsLine(1, 0))).toBeNull();
  });

  it('a realm with command access granted shows the counts note and the grants, under the grants label', async () => {
    over.rules = answerWith({ exec_trust: [{ computer_id: 'c-9', realm: R1, name: 'build-box' }] });
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(realmNote(1, 1))).toBeInTheDocument();
    // the grant is a row of the list its label names, not a list of its own beside an empty one
    expect(within(within(card).getByLabelText(said('grants.label'))).getByText('build-box')).toBeInTheDocument();
    expect(within(card).queryByLabelText(said('caps.label'))).toBeNull();
  });

  it('a partial list with command access granted shows the grants, in their labelled list, and no counts', async () => {
    over.rules = answerWith({ rules_complete: false, exec_trust: [{ computer_id: 'c-9', realm: R1, name: 'build-box' }] });
    await show();
    let card = await rulesCard();
    expect(await within(card).findByText(said('readonly.incomplete'))).toBeInTheDocument();
    expect(within(within(card).getByLabelText(said('grants.label'))).getByText('build-box')).toBeInTheDocument();
    expect(within(card).queryByText(/^In this realm:/)).toBeNull();
    // the same in a folder
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    card = await rulesCard();
    expect(await within(card).findByText(said('readonly.incomplete'))).toBeInTheDocument();
    expect(within(within(card).getByLabelText(said('grants.label'))).getByText('build-box')).toBeInTheDocument();
    expect(within(card).queryByLabelText(said('caps.label'))).toBeNull();
  });

  it('a partial list counts the rules it received, never as a total', async () => {
    complete = false;
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('count.partial').replace('{{count}}', '2'))).toBeInTheDocument();
    expect(within(card).queryByText(said('count').replace('{{count}}', '2'))).toBeNull();
  });

  it('a partial list with no rows received does not say there are no rules', async () => {
    complete = false;
    live = [];
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('empty.partial.title'))).toBeInTheDocument();
    expect(within(card).getByText(said('empty.partial.body'))).toBeInTheDocument();
    expect(within(card).queryByText(said('empty.title'))).toBeNull();
    expect(within(card).queryByText(said('empty.body'))).toBeNull();
  });
});

describe('rules: a realm with no rule can add its first one', () => {
  it('the empty card offers Add a rule, which opens the add dialog and saves the rule', async () => {
    live = [];
    await show();
    const card = await rulesCard();
    expect(await within(card).findByText(said('empty.title'))).toBeInTheDocument();
    await addRule('Never push to main');
    expect(writes()).toHaveLength(1);
    expect((writes()[0]!.body as { rules: Row[] }).rules.map((r) => r.text)).toEqual(['Never push to main']);
  });
});

describe('rules: the card states keep their controls', () => {
  it('the failed state offers Try again, which reads the rules again', async () => {
    let n = 0;
    over.rules = () => { n++; return { status: 500, body: { error: 'boom' } }; };
    await show();
    const card = await rulesCard();
    await vi.waitFor(() => expect(card).toHaveAttribute('data-hub-state', 'failed'));
    const before = n;
    await userEvent.click(within(card).getByRole('button', { name: /Try again/i }));
    await flush();
    expect(n).toBeGreaterThan(before);
  });

  it('the unknown state offers Check again, which reads the rules again', async () => {
    let n = 0;
    over.rules = () => { n++; return { status: 200, body: { status: 'ok', rules: { live: [{ id: 5 }], scopes: [] } } }; };
    await show();
    const card = await rulesCard();
    await vi.waitFor(() => expect(card).toHaveAttribute('data-hub-state', 'unknown'));
    const before = n;
    await userEvent.click(within(card).getByRole('button', { name: /Check again/i }));
    await flush();
    expect(n).toBeGreaterThan(before);
  });

  it('with no folder chosen nothing is read for a folder', async () => {
    over.cwds = () => ({ status: 200, body: { cwds: [] } });
    await show();
    const realmReads = hooks().filter((c) => c.method === 'GET').length;
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect((await rulesCard())).toHaveAttribute('data-hub-state', 'notHere');
    const after = hooks().filter((c) => c.method === 'GET');
    expect(after.length).toBe(realmReads);
    expect(after.some((c) => c.headers['x-hoody-cwd'] !== undefined)).toBe(false);
  });

  it('the Stop tracking confirm closes by itself once a read proves the held change', async () => {
    over.set = () => ({ status: 0, network: true });
    await show();
    await addRule('Ask before deleting branches');
    await screen.findByText(/Check again reads the rules/);
    const sent = writes()[0]!.body.rules as Row[];
    // the change did go through; the read that shows it is still on its way when the person asks to stop tracking
    revs = { user: 'rev-9' };
    live = sent.map((r) => ({ ...r, scope: 'user' }));
    let answer: (r: Reply) => void = () => undefined;
    over.rules = () => new Promise<Reply>((res) => { answer = res; });
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await userEvent.click(screen.getByRole('button', { name: /Stop tracking/ }));
    expect(await screen.findByRole('alertdialog', { name: said('stop.title') })).toBeInTheDocument();
    await act(async () => { answer({ status: 200, body: rulesBody() }); });
    await flush();
    expect(screen.queryByText(/Check again reads the rules/)).toBeNull();
    expect(screen.queryByRole('alertdialog', { name: said('stop.title') })).toBeNull();
  });
});

describe('rules: the first change', () => {
  it('opens one settings chat, mints a nonce on it, then sends the COMPLETE list with the revision it was read at', async () => {
    await show();
    await addRule('Ask before deleting branches');
    expect(created).toBe(1);
    const begin = calls.filter((c) => u(c.url).pathname.endsWith('/hooks/begin-write'));
    expect(begin).toHaveLength(1);
    expect(begin[0]!.body).toMatchObject({ session_id: 's1', op: 'rules_set', scope: 'user' });
    const w = writes();
    expect(w).toHaveLength(1);
    const body = w[0]!.body;
    expect(body).toMatchObject({ session_id: 's1', nonce: 'nonce-1', scope: 'user', expected_revision: 'rev-1' });
    // the two rules that were there stay, in order, and the new one comes last
    expect((body.rules as Row[]).map((r) => r.text)).toEqual(['Never run rm -rf', 'Run the tests before saying done', 'Ask before deleting branches']);
    // exec_trust and the timeout are never sent
    expect('exec_trust' in body).toBe(false);
    expect('timeout_ms' in body).toBe(false);
  });

  it('says saved only after a fresh read shows the new version', async () => {
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(strings.saved)).toBeInTheDocument();
    expect(screen.getByText('Ask before deleting branches')).toBeInTheDocument();
  });

  it('a second change reuses the open session and mints a new nonce', async () => {
    await show();
    await addRule('First new rule');
    await addRule('Second new rule');
    expect(created).toBe(1);
    expect(writes().map((c) => c.body.nonce)).toEqual(['nonce-1', 'nonce-2']);
  });

  it('a refused version (409) says nothing was saved and shows the current list', async () => {
    over.set = () => ({ status: 409, body: { error: 'x', code: 'revision_conflict' } });
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(strings['refused.revision_conflict'])).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  it('a refused nonce (409 write_intent_invalid) is said as such and is not resent', async () => {
    over.set = () => ({ status: 409, body: { error: 'x', code: 'write_intent_invalid' } });
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(strings['refused.write_intent_invalid'])).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  it('a nonce that could not be minted sends no write', async () => {
    over.begin = () => ({ status: 503, body: { error: 'x', code: 'unavailable' } });
    await show();
    await addRule('Ask before deleting branches');
    expect(writes()).toHaveLength(0);
  });

  it('a lost answer to the write is held as unknown: nothing is resent, no saved, no failed', async () => {
    over.set = () => ({ status: 0, network: true });
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(/Check again reads the rules/)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(strings.saved)).toBeNull();
    expect(screen.queryByText(strings['refused.revision_conflict'])).toBeNull();
  });

  it('Check again reads only: the old version proves nothing, the sent list under a new version ends the hold', async () => {
    over.set = () => ({ status: 0, network: true });
    await show();
    await addRule('Ask before deleting branches');
    await screen.findByText(/Check again reads the rules/);
    const sent = writes()[0]!.body.rules as Row[];
    const before = writes().length;
    // the old version is still there: nothing is proven, the hold stays
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Check again reads the rules/)).toBeInTheDocument();
    // a different list under a new version (someone else wrote) proves nothing either
    revs = { user: 'rev-8' };
    live = [{ id: 'other', text: 'Somebody else wrote this', kind: 'guidance', scope: 'user' }];
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Check again reads the rules/)).toBeInTheDocument();
    // the write did apply after all: exactly the list that was sent, under a new version
    revs = { user: 'rev-9' };
    live = sent.map((r) => ({ ...r, scope: 'user' }));
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.queryByText(/Check again reads the rules/)).toBeNull();
    // nothing was ever sent again
    expect(writes().length).toBe(before);
    expect(calls.filter((c) => u(c.url).pathname.endsWith('/hooks/begin-write'))).toHaveLength(1);
  });

  it('an applied write whose answer was lost stays held until Check again: no other read frees it', async () => {
    over.set = (c) => {
      // the agent applied it, the answer never arrived
      const scope = String(c.body?.scope);
      revs = { ...revs, [scope]: 'rev-applied' };
      live = ((c.body?.rules as Row[]) ?? []).map((r) => ({ ...r, scope }));
      return { status: 0, network: true };
    };
    await show();
    await addRule('Ask before deleting branches');
    await screen.findByText(/Check again reads the rules/);
    // a refresh by anyone else reads the applied state and proves nothing
    await act(async () => { await refreshFresh(sourceReads(RULES_SOURCE, ['rules'])); });
    await flush();
    expect(screen.getByText(/Check again reads the rules/)).toBeInTheDocument();
    // the person's own Check again does
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.queryByText(/Check again reads the rules/)).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('says saved only when a fresh read shows the new version: an ok answer the list does not confirm says nothing', async () => {
    over.set = () => ({ status: 200, body: { status: 'ok', revision: 'rev-claimed', warnings: [] } });
    await show();
    await addRule('Ask before deleting branches');
    await flush();
    expect(screen.queryByText(strings.saved)).toBeNull();
  });

  it('a lost answer to the nonce mint sent no write and holds nothing', async () => {
    over.begin = () => ({ status: 0, network: true });
    await show();
    await addRule('Ask before deleting branches');
    await flush();
    expect(writes()).toHaveLength(0);
    expect(screen.queryByText(/Check again reads the rules/)).toBeNull();
  });

  it('an ok answer the page cannot read is held as unknown, never saved', async () => {
    over.set = () => ({ status: 200, body: { status: 'ok' } });
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(/Check again reads the rules/)).toBeInTheDocument();
    expect(screen.queryByText(strings.saved)).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('a lost session is replaced once and the write is made again with a new nonce', async () => {
    let first = true;
    over.begin = (c) => {
      if (first) { first = false; return { status: 404, body: { error: 'x', code: 'not_found' } }; }
      return { status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, op: 'rules_set', scope: c.body?.scope } };
    };
    await show();
    await addRule('Ask before deleting branches');
    expect(created).toBe(2);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body.session_id).toBe('s2');
  });
});

/** The smallest element around `el` that holds the row's menu button: the row, whatever the presentation. */
const rowOf = (el: HTMLElement): HTMLElement => {
  let n: HTMLElement | null = el;
  while (n && !n.querySelector('[data-row-menu]')) n = n.parentElement;
  return n as HTMLElement;
};
const rowMenu = async (text: string, item: string) => {
  const row = rowOf(await screen.findByText(text));
  await userEvent.click(row.querySelector('[data-row-menu] button') as HTMLElement);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(item) }));
};
const scoped = () => {
  revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
  live = [
    { id: 'u1', text: 'User rule', kind: 'limit', tools: ['bash'], scope: 'user' },
    { id: 'p1', text: 'Project rule', kind: 'guidance', scope: 'project', folder: FOLDER },
    { id: 'p2', text: 'Second project rule', kind: 'guidance', scope: 'project', folder: FOLDER },
    { id: 'l1', text: 'Local rule', kind: 'guidance', scope: 'local', folder: FOLDER },
  ];
};

describe('rules: a folder keeps each saved place apart', () => {
  it('removing a project rule sends only the project list, with the project revision, without the other places', async () => {
    scoped();
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await rowMenu('Project rule', strings.remove);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    const begin = calls.filter((c) => u(c.url).pathname.endsWith('/hooks/begin-write'));
    expect(begin[0]!.body).toMatchObject({ op: 'rules_set', scope: 'project' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toMatchObject({ scope: 'project', expected_revision: 'p-1' });
    expect((writes()[0]!.body.rules as Row[]).map((r) => r.id)).toEqual(['p2']);
    // the folder rides the write's session, not the body
    expect(created).toBe(1);
  });

  it('editing keeps the rule in its place in the list and changes only that rule', async () => {
    scoped();
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await rowMenu('Project rule', strings.edit);
    const dlg = await screen.findByRole('dialog');
    const box = within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) });
    await userEvent.clear(box);
    await userEvent.type(box, 'Project rule, reworded');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    const sent = writes()[0]!.body.rules as Row[];
    expect(sent.map((r) => [r.id, r.text])).toEqual([['p1', 'Project rule, reworded'], ['p2', 'Second project rule']]);
    expect(writes()[0]!.body).toMatchObject({ scope: 'project', expected_revision: 'p-1' });
  });

  it('shows where each rule is saved', async () => {
    scoped();
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    const row = rowOf(await screen.findByText('Local rule'));
    expect(within(row).getByText(strings['scope.local'])).toBeInTheDocument();
  });

  it('opens nothing and sends nothing until a change is made', async () => {
    scoped();
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(created).toBe(0);
    expect(writes()).toHaveLength(0);
  });
});

describe('rules: the session follows the place', () => {
  it('leaving the page closes the settings chat', async () => {
    await show();
    await addRule('Ask before deleting branches');
    cleanup();
    await flush();
    expect(closed).toEqual(['s1']);
  });

  it('switching to a folder closes the chat of the old place and shows no rule of it', async () => {
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    await show();
    await addRule('Ask before deleting branches');
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(closed).toEqual(['s1']);
  });
});

describe('rules: caps', () => {
  it('a place holding 32 limits and check-ins refuses a 33rd before anything is sent', async () => {
    live = Array.from({ length: 32 }, (_, i) => ({ id: `r${i}`, text: `Rule ${i}`, kind: 'limit', scope: 'user' }));
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'One too many');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(within(dlg).getByText(strings['problem.cap_checked'])).toBeInTheDocument();
    expect(created).toBe(0);
    expect(writes()).toHaveLength(0);
  });

  it('32 checked do not stop a guidance rule: the two caps are counted apart', async () => {
    live = Array.from({ length: 32 }, (_, i) => ({ id: `r${i}`, text: `Rule ${i}`, kind: 'limit', scope: 'user' }));
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Be brief');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['dlg.kind']) }));
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(strings['kind.guidance']) }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
  });
});

describe('rules: read only', () => {
  it('an incomplete list is read only, says why, and cannot be added to', async () => {
    complete = false;
    await show();
    expect(await screen.findByText(strings['readonly.incomplete'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.add })?.hasAttribute('disabled') ?? true).toBe(true);
    expect(created).toBe(0);
  });

  it('a scope with no revision is read only', async () => {
    revs = {};
    await show();
    expect(await screen.findByText(strings['readonly.no_revision'])).toBeInTheDocument();
  });

  it('in a folder, rules the agent does not place (an older agent) make every place read only', async () => {
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    live = [{ id: 'old', text: 'An old rule', kind: 'limit' }];
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(await screen.findByText(strings['readonly.unplaced'])).toBeInTheDocument();
  });

  it('an answer that cannot be read as a whole shows nothing editable', async () => {
    over.rules = () => ({ status: 200, body: { status: 'ok', rules: { live: [{ id: 5 }], scopes: [] } } });
    await show();
    expect(await screen.findByText(said('unreadable'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.add })).toBeNull();
  });
});

describe('rules: an open editor follows what is on screen', () => {
  it('a list that turns read only under an open editor closes it, and nothing more is sent', async () => {
    // the first save is refused as stale; the list read after it is incomplete (a rule is gone from it)
    over.set = () => {
      complete = false;
      live = live.slice(0, 1);
      return { status: 409, body: { error: 'x', code: 'revision_conflict' } };
    };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before deleting branches');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(await screen.findByText(strings['readonly.incomplete'])).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(calls.filter((c) => u(c.url).pathname.endsWith('/hooks/begin-write'))).toHaveLength(1);
  });

  it('an editor opened in one place does not follow the person to another, even when the other place is already cached', async () => {
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    await show();
    // visit the folder first so both places are cached, then come back
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.realm'] }));
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});

describe('rules: an editor does not follow a changed folder', () => {
  it('a folder the list stops naming stays chosen under an open editor: the draft never moves to another folder', async () => {
    const OTHER = '/home/ada/other';
    let folders = [FOLDER, OTHER];
    over.cwds = () => ({ status: 200, body: { cwds: folders } });
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    live = [{ id: 'same', text: 'Project rule', kind: 'guidance', scope: 'project', folder: FOLDER }];
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    // visit the other folder so both are cached, then come back to the first
    const pick = async (v: string) => { await act(async () => { fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: v } }); }); await flush(); };
    live = [{ id: 'same', text: 'Other folder rule', kind: 'guidance', scope: 'project', folder: OTHER }];
    await pick(OTHER);
    live = [{ id: 'same', text: 'Project rule', kind: 'guidance', scope: 'project', folder: FOLDER }];
    await pick(FOLDER);
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    await screen.findByRole('dialog');
    // the folder list no longer holds this folder
    folders = [OTHER];
    live = [{ id: 'same', text: 'Other folder rule', kind: 'guidance', scope: 'project', folder: OTHER }];
    await act(async () => { await refreshFresh(sourceReads('ai-new', ['cwds'])); });
    await flush();
    // the folder chosen stays chosen: the open editor still writes to it and nowhere else
    const dlg = screen.getByRole('dialog');
    expect(hooks().filter((c) => c.method === 'GET').at(-1)!.headers['x-hoody-cwd']).toBe(FOLDER);
    expect(writes()).toHaveLength(0);
    // the draft, saved, goes to that folder's settings chat and nowhere else
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Keep it here');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(createdAt).toEqual([FOLDER]);
  });
});

describe('rules: a folder typed or browsed', () => {
  const another = async () => {
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(newStrings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: newStrings['folder.another'] }));
    await flush();
  };
  const cwdsRead = () => hooks().filter((c) => c.method === 'GET').map((c) => c.headers['x-hoody-cwd']);

  it('a typed folder is read only on Enter, once, and stays chosen though no chat ran in it', async () => {
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    await show();
    await another();
    const before = cwdsRead().length;
    await userEvent.type(screen.getByRole('combobox', { name: newStrings['folder.path'] }), '/srv/data');
    await flush();
    expect(cwdsRead().slice(before), 'no read per keystroke').toEqual([]);
    expect(screen.getByText(strings['place.noFolder'])).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await flush();
    expect(cwdsRead().slice(before)).toEqual(['/srv/data']);
    expect(screen.queryByText(strings['place.noFolder'])).toBeNull();
  });

  it('with no folder listed the field says so, and a path can still be entered', async () => {
    over.cwds = () => ({ status: 200, body: { cwds: [] } });
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(screen.getByText(strings['place.noFolders'])).toBeInTheDocument();
    expect(screen.getByText(strings['place.noFolder'])).toBeInTheDocument();
  });
});

describe('rules: saved needs a fresh read', () => {
  it('an unchanged rule answers with the revision already shown: "saved" waits for the read that follows', async () => {
    await show();
    await screen.findByText('Never run rm -rf');
    // the agent answers ok with the revision the page already has; every read after the write waits
    over.set = () => ({ status: 200, body: { status: 'ok', revision: 'rev-1', warnings: [] } });
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    over.rules = async () => { await gate; return { status: 200, body: rulesBody() }; };
    await addRule('Ask before deleting branches');
    expect(screen.queryByText(strings.saved)).toBeNull();
    release();
    await flush();
    expect(await screen.findByText(strings.saved)).toBeInTheDocument();
  });

  it('a confirming read that is cancelled while every reply is blocked says nothing: the cache is not a confirmation', async () => {
    await show();
    await screen.findByText('Never run rm -rf');
    over.set = () => ({ status: 200, body: { status: 'ok', revision: 'rev-1', warnings: [] } });
    const waiting: (() => void)[] = [];
    over.rules = () => new Promise<Reply>((res) => { waiting.push(() => res({ status: 200, body: rulesBody() })); });
    await addRule('Ask before deleting branches');
    // someone else's fresh read cancels the confirming one; its replacement stays blocked too
    void refreshFresh(sourceReads(RULES_SOURCE, ['rules']), { own: true }).catch(() => undefined);
    await flush();
    expect(screen.queryByText(strings.saved)).toBeNull();
    // answers that arrive later were not asked for by the confirming read: still nothing
    waiting.splice(0).forEach((f) => f());
    await flush();
    expect(screen.queryByText(strings.saved)).toBeNull();
  });

  it('"saved" goes when the list shown stops being a complete one', async () => {
    await show();
    await addRule('Ask before deleting branches');
    expect(await screen.findByText(strings.saved)).toBeInTheDocument();
    complete = false;
    await act(async () => { await refreshFresh(sourceReads(RULES_SOURCE, ['rules'])); });
    await flush();
    expect(screen.queryByText(strings.saved)).toBeNull();
  });

  it('a confirming read that is incomplete does not say saved', async () => {
    over.set = (c) => {
      revs = { user: 'rev-5' };
      live = ((c.body?.rules as Row[]) ?? []).map((r) => ({ ...r, scope: 'user' }));
      complete = false;
      return { status: 200, body: { status: 'ok', revision: 'rev-5', warnings: [] } };
    };
    await show();
    await addRule('Ask before deleting branches');
    await flush();
    expect(screen.queryByText(strings.saved)).toBeNull();
  });
});

describe('rules: a write whose hold or session ended', () => {
  it('a write already sent when the person moved to another place stays held as unknown: not saved, not "not sent", never resent', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    revs = { user: 'rev-1', project: 'p-1', local: 'l-1' };
    over.set = async () => { await gate; return { status: 200, body: { status: 'ok', revision: 'rev-2', warnings: [] } }; };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before deleting branches');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    release();
    await flush();
    expect(await screen.findByText(/Saving rules .* may have gone through/)).toBeInTheDocument();
    expect(screen.queryByText(strings.saved)).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('a nonce that arrives after the person left starts no write', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    over.begin = async () => { await gate; return { status: 200, body: { status: 'ok', nonce: 'late', op: 'rules_set', scope: 'user' } }; };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before deleting branches');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    cleanup();
    release();
    await flush();
    expect(writes()).toHaveLength(0);
  });

  it('a change the terminal demo stopped before any chat opened says it is the demo in the dialog, and nothing is sent', async () => {
    mgr.reset();
    // What the demo client answers every change: refused unsent with its own code.
    mgr = sessions(async () => { throw Object.assign(new Error('x'), { status: 0, code: 'DEMO_READ_ONLY', kind: 'not_sent', notSent: true }); });
    setSettingsSessionsForTests(mgr);
    await show();
    await addRule('Ask before deleting branches');
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(stateStrings['err.demoReadOnly'])).toBeInTheDocument();
    expect(hooks().filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});

describe('rules: what a rule covers', () => {
  it('a limit with no tools named does not claim every tool; guidance is not tied to tools', async () => {
    live = [
      { id: 'l', text: 'A limit with no tools', kind: 'limit', scope: 'user' },
      { id: 'g', text: 'A piece of guidance', kind: 'guidance', scope: 'user' },
    ];
    await show();
    await screen.findByText('A limit with no tools');
    expect(screen.getByText(new RegExp(strings['applies.judged'].replace(/[()]/g, '\\$&')))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/every tool/i);
    await userEvent.click(screen.getByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Read-only tools count only when you name them/)).toBeInTheDocument();
    expect(dlg.textContent).not.toMatch(/every tool/i);
  });
});

// The condition line spelled out here, not read from the strings file, so a run on the old code fails on the behaviour itself.
const whenLine = (atoms: string): string => `Runs only when: ${atoms}`;
// A limit or check-in may carry `when` (call_when). The page shows it on one read-only line and carries it verbatim through every
// write of its scope (the agent refuses a list that drops it); it never edits it.
describe('rule conditions', () => {
  const W = ['+edit_file|write_file', '-bash(command=\\bgo test\\b):success'];
  const withWhen = (when: unknown = W) => {
    live = [
      { id: 'no-rm', text: 'Never run rm -rf', kind: 'limit', tools: ['bash'], scope: 'user' },
      { id: 'tested', text: 'Test before done', kind: 'check_in', scope: 'user', when },
    ];
  };
  it('shows one read-only "Runs only when" line, as plain text cleaned of control and direction characters', async () => {
    withWhen(['+edit_file\u202e|write_file', '-bash\u0007']);
    await show();
    expect(await screen.findByText(whenLine('+edit_file|write_file, -bash'))).toBeInTheDocument();
    expect(screen.queryAllByText(/Runs only when/)).toHaveLength(1);
  });
  it('adding a rule sends the conditional rule back with its when, verbatim, and the new one with no when key', async () => {
    withWhen();
    await show();
    await addRule('Ask before deleting branches');
    const sent = writes()[0]!.body.rules as Row[];
    expect(sent.map((r) => r.id)).toEqual(['no-rm', 'tested', expect.any(String)]);
    expect(sent[1]!.when).toEqual(W);
    expect('when' in sent[0]!).toBe(false);
    expect('when' in sent[2]!).toBe(false);
    // The agent kept it: the fresh read still shows the condition.
    expect(await screen.findByText(whenLine(W.join(', ')))).toBeInTheDocument();
  });
  it('editing the conditional rule keeps its condition', async () => {
    withWhen();
    await show();
    await rowMenu('Test before done', strings.edit);
    const dlg = await screen.findByRole('dialog');
    const box = within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) });
    await userEvent.clear(box);
    await userEvent.type(box, 'Test before saying done');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    const sent = writes()[0]!.body.rules as Row[];
    expect(sent[1]).toMatchObject({ id: 'tested', text: 'Test before saying done', when: W });
  });
  it('an edit saved after the list moved under the open dialog sends the condition the list has now, never the one it opened with', async () => {
    withWhen();
    const B = ['+bash'];
    // The first save is refused as stale: meanwhile the rule's condition was changed elsewhere, and the read after the refusal shows it.
    let n = 0;
    over.set = () => {
      if (++n > 1) return undefined;
      live = live.map((r) => (r.id === 'tested' ? { ...r, when: B } : r));
      revs = { ...revs, user: 'rev-2' };
      return { status: 409, body: { error: 'x', code: 'revision_conflict' } };
    };
    await show();
    await rowMenu('Test before done', strings.edit);
    const dlg = await screen.findByRole('dialog');
    const box = within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) });
    await userEvent.clear(box);
    await userEvent.type(box, 'Test before saying done');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    expect(await screen.findByText(strings['refused.revision_conflict'])).toBeInTheDocument();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    expect(writes()).toHaveLength(2);
    expect(writes()[1]!.body).toMatchObject({ expected_revision: 'rev-2' });
    expect((writes()[1]!.body.rules as Row[])[1]).toMatchObject({ id: 'tested', text: 'Test before saying done', when: B });
  });
  it('an agent that does not list call_when gets nothing: no permission is minted and no list is sent', async () => {
    withWhen();
    callWhen = false;
    await show();
    await addRule('Ask before deleting branches');
    expect(calls.filter((c) => u(c.url).pathname.endsWith('/hooks/begin-write'))).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(strings['notsent.CAPABILITY_MISSING'])).toBeInTheDocument();
  });
  it('without any condition in the scope, an agent without call_when saves as before and no when is sent', async () => {
    callWhen = false;
    await show();
    await addRule('Ask before deleting branches');
    expect(writes()).toHaveLength(1);
    expect((writes()[0]!.body.rules as Row[]).every((r) => !('when' in r))).toBe(true);
  });
  it('a condition the page cannot carry makes its place read only, and the row says why in words', async () => {
    withWhen('not a list');
    await show();
    expect(await screen.findByText(strings['readonly.when'])).toBeInTheDocument();
    expect(screen.getByText(strings['when.unreadable'])).toBeInTheDocument();
    expect(screen.getAllByText(strings['readonly.reasonShort.when']).length).toBeGreaterThan(0);
  });
});

// In a folder, a narrow rules table keeps the condition, the rule's type and where it is saved. jsdom has
// no layout, so the table's width is given through ResizeObserver; the kit then sheds columns or draws the two-line list.
describe('a narrow folder rules table keeps the condition, the type and the saved place', () => {
  const atWidth = (width: number) =>
    class {
      constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
      observe() { this.cb([{ contentRect: { width } }]); }
      unobserve() {}
      disconnect() {}
    };
  afterEach(() => { vi.unstubAllGlobals(); });
  // 584 px is the least the table needs here (Rule 220 + Condition 200 + Type 120 + actions 44); below it the list.
  const drawnAsTable = () => document.querySelector('table colgroup') !== null;
  const open = async (width: number) => {
    vi.stubGlobal('ResizeObserver', atWidth(width));
    scoped();
    live = [...live, { id: 'l2', text: 'Test before done', kind: 'check_in', scope: 'local', folder: FOLDER, when: ['+edit_file'] }];
    await show();
    await userEvent.click(await screen.findByRole('radio', { name: strings['place.folder'] }));
    await flush();
    return within(rowOf(await screen.findByText('Test before done')));
  };
  for (const width of [300, 360, 450, 560, 583]) {
    it(`at ${width} px (the list) a conditional rule still shows its condition, its type and where it is saved`, async () => {
      const r = await open(width);
      expect(drawnAsTable()).toBe(false);
      expect(r.getByText(whenLine('+edit_file'))).toBeInTheDocument();
      expect(r.getByText(strings['kind.check_in'])).toBeInTheDocument();
      expect(r.getByText(strings['scope.local'])).toBeInTheDocument();
      // A rule with no condition keeps its own fields too.
      const l = within(rowOf(screen.getByText('Local rule')));
      expect(l.getByText(strings['kind.guidance'])).toBeInTheDocument();
      expect(l.getByText(strings['scope.local'])).toBeInTheDocument();
    });
  }
  for (const width of [584, 700]) {
    it(`at ${width} px (still a table) the Condition column and the Type column are both drawn`, async () => {
      const r = await open(width);
      expect(drawnAsTable()).toBe(true);
      expect(screen.getByRole('columnheader', { name: strings['col.when'] })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: strings['col.kind'] })).toBeInTheDocument();
      expect(r.getByText(whenLine('+edit_file'))).toBeInTheDocument();
      expect(r.getByText(strings['kind.check_in'])).toBeInTheDocument();
    });
  }
});

describe('rules: the Tools and Agents pickers', () => {
  // The body the dialog sends for: a check-in "Ask before pushing", tools bash then mcp__gh__push, agent general, in the
  // realm's list after the two rules there. Recorded from the comma-separated text fields this picker replaces
  // ("bash, mcp__gh__push" and "general"): the same choices must send the same bytes.
  const BODY = '[{"id":"no-rm","text":"Never run rm -rf","kind":"limit","tools":["bash"],"agents":[]},{"id":"tests","text":"Run the tests before saying done","kind":"guidance","tools":[],"agents":[]},{"id":"rule-1","text":"Ask before pushing","kind":"check_in","tools":["bash","mcp__gh__push"],"agents":["general"]}]';
  // A new rule's id is drawn at random (newRuleId): the one place the bytes may differ, and not from the picker.
  const bytes = (rules: unknown) => JSON.stringify(rules).replace(/"id":"rule-[a-z0-9]{8}"/g, '"id":"rule-1"');
  const pick = async (dlg: HTMLElement, label: string, name: string) => {
    await userEvent.click(within(dlg).getByRole('combobox', { name: new RegExp(`^${label}`) }));
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));
    await flush();
  };
  // A name the list does not hold: typed into the same field, Enter adds it.
  const typeOther = async (dlg: HTMLElement, label: string, name: string) => {
    await userEvent.type(within(dlg).getByRole('combobox', { name: new RegExp(`^${label}`) }), `${name}{Enter}`);
    await flush();
  };
  const openAdd = async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await flush();
    return dlg;
  };
  // A section of the dialog: what sits between its heading and the next one.
  const fieldset = (dlg: HTMLElement, title: string) => {
    let el: HTMLElement | null = within(dlg).getByRole('heading', { name: title });
    while (el && el !== dlg && !el.querySelector('[role="combobox"]')) el = el.parentElement;
    return el as HTMLElement;
  };

  it('picked and typed names send the same body, byte for byte, as the text fields did', async () => {
    const dlg = await openAdd();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before pushing');
    await pick(dlg, strings['dlg.toolsPick'], 'bash');
    await typeOther(dlg, strings['dlg.toolsPick'], 'mcp__gh__push');
    await pick(dlg, strings['dlg.agentsPick'], 'general');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(bytes(writes()[0]!.body.rules)).toBe(BODY);
  });

  it('nothing chosen sends empty lists, as empty fields did, and says what that covers', async () => {
    const dlg = await openAdd();
    expect(within(fieldset(dlg, strings['dlg.agents'])).getByText(strings['dlg.agentsNone'])).toBeInTheDocument();
    expect(within(fieldset(dlg, strings['dlg.tools'])).getByText(strings['dlg.toolsNone'])).toBeInTheDocument();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask first');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    const sent = writes()[0]!.body.rules as Row[];
    expect(JSON.parse(bytes(sent))[2]).toEqual({ id: 'rule-1', text: 'Ask first', kind: 'check_in', tools: [], agents: [] });
  });

  it('an edited rule shows its names as tags; one this computer does not list is kept and marked', async () => {
    live = [{ id: 'gh', text: 'Ask before pushing', kind: 'check_in', tools: ['bash', 'mcp__gh__push'], agents: ['ghost', 'general'], scope: 'user' }];
    await show();
    await rowMenu('Ask before pushing', strings.edit);
    const dlg = await screen.findByRole('dialog');
    await flush();
    const tools = within(fieldset(dlg, strings['dlg.tools']));
    const agents = within(fieldset(dlg, strings['dlg.agents']));
    expect(tools.getByText('bash')).toBeInTheDocument();
    expect(tools.getByText('mcp__gh__push')).toBeInTheDocument();
    expect(agents.getByText('ghost')).toBeInTheDocument();
    // The names already chosen are not offered again.
    await userEvent.click(within(dlg).getByRole('combobox', { name: new RegExp(`^${strings['dlg.agentsPick']}`) }));
    expect(await screen.findByRole('option', { name: /^reviewer/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^general/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // Not found on this computer: a mark on the tags of the names the lists do not hold, and only on them.
    await userEvent.click(agents.getByRole('button', { name: 'ghost' }));
    expect(await screen.findByText(strings['dlg.notFound'])).toBeInTheDocument();
    expect(agents.queryByRole('button', { name: 'general' })).toBeNull();
    // The tool list here holds bash and read_file: the MCP tool is kept, and marked too.
    expect(tools.getByRole('button', { name: 'mcp__gh__push' })).toBeInTheDocument();
    expect(tools.queryByRole('button', { name: 'bash' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // Saved untouched, the names go back as they were, in their order.
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    expect((writes()[0]!.body.rules as Row[])[0]).toMatchObject({ tools: ['bash', 'mcp__gh__push'], agents: ['ghost', 'general'] });
  });

  it('removing a tag removes only that name', async () => {
    live = [{ id: 'gh', text: 'Ask before pushing', kind: 'check_in', tools: ['bash'], agents: ['general', 'reviewer'], scope: 'user' }];
    await show();
    await rowMenu('Ask before pushing', strings.edit);
    const dlg = await screen.findByRole('dialog');
    await flush();
    await userEvent.click(within(fieldset(dlg, strings['dlg.agents'])).getByRole('button', { name: /general/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    expect((writes()[0]!.body.rules as Row[])[0]).toMatchObject({ tools: ['bash'], agents: ['reviewer'] });
  });

  it('a typed name of the wrong shape is refused and not added', async () => {
    const dlg = await openAdd();
    await typeOther(dlg, strings['dlg.agentsPick'], 'Bad Name!');
    expect(within(dlg).getByText(strings['problem.agent_name'])).toBeInTheDocument();
    // The text stays in the field, to be put right.
    expect(within(dlg).getByRole('combobox', { name: new RegExp(`^${strings['dlg.agentsPick']}`) })).toHaveValue('Bad Name!');
    expect(within(fieldset(dlg, strings['dlg.agents'])).getByText(strings['dlg.agentsNone'])).toBeInTheDocument();
  });

  // While a name is being typed the field's list is open, and the rest of the dialog is hidden from assistive technology
  // until it closes (React Aria's combo box); a press still reaches it, so these queries look past that.
  const hidden = { hidden: true } as const;

  it('a name typed but not yet added is saved with the rule: pressing Add leaves the field, which adds it', async () => {
    const dlg = await openAdd();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before reading');
    await userEvent.type(within(dlg).getByRole('combobox', { name: new RegExp(`^${strings['dlg.toolsPick']}`) }), 'read_file');
    await userEvent.type(within(dlg).getByRole('combobox', { ...hidden, name: new RegExp(`^${strings['dlg.agentsPick']}`) }), 'reviewer');
    await userEvent.click(within(dlg).getByRole('button', { ...hidden, name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(bytes(writes()[0]!.body.rules))[2]).toEqual({ id: 'rule-1', text: 'Ask before reading', kind: 'check_in', tools: ['read_file'], agents: ['reviewer'] });
  });

  it('a typed name of the wrong shape left in the field stops the save, and the field says why', async () => {
    const dlg = await openAdd();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask first');
    await userEvent.type(within(dlg).getByRole('combobox', { name: new RegExp(`^${strings['dlg.agentsPick']}`) }), 'Bad Name!');
    await userEvent.click(within(dlg).getByRole('button', { ...hidden, name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(within(dlg).getByText(strings['problem.agent_name'])).toBeInTheDocument();
    // Cleared, the rule saves for every agent.
    await userEvent.clear(within(dlg).getByRole('combobox', { ...hidden, name: new RegExp(`^${strings['dlg.agentsPick']}`) }));
    await userEvent.click(within(dlg).getByRole('button', { ...hidden, name: strings['dlg.add'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(bytes(writes()[0]!.body.rules))[2]).toMatchObject({ agents: [] });
  });

  it('a name typed twice is one tag and is sent once (the checker reads the names as a set)', async () => {
    const dlg = await openAdd();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask first');
    await typeOther(dlg, strings['dlg.toolsPick'], 'bash, bash');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(JSON.parse(bytes(writes()[0]!.body.rules))[2]).toMatchObject({ tools: ['bash'] });
  });

  it('a stored rule naming a tool twice is shown and saved as stored', async () => {
    live = [{ id: 'gh', text: 'Ask before pushing', kind: 'check_in', tools: ['bash', 'bash'], agents: [], scope: 'user' }];
    await show();
    await rowMenu('Ask before pushing', strings.edit);
    const dlg = await screen.findByRole('dialog');
    await flush();
    expect(within(fieldset(dlg, strings['dlg.tools'])).getAllByText('bash')).toHaveLength(2);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.save'] }));
    await flush();
    expect((writes()[0]!.body.rules as Row[])[0]).toMatchObject({ tools: ['bash', 'bash'] });
  });

  it('when the lists cannot be read, names can still be typed', async () => {
    over.agents = () => ({ status: 500, body: {} });
    over.tools = () => ({ status: 200, body: { items: [{ name: 'bash', read_only: false }], meta: { total: 5 } } });
    const dlg = await openAdd();
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(strings['dlg.text']) }), 'Ask before pushing');
    await typeOther(dlg, strings['dlg.toolsPick'], 'bash, mcp__gh__push');
    await typeOther(dlg, strings['dlg.agentsPick'], 'general');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.add'] }));
    await flush();
    expect(bytes(writes()[0]!.body.rules)).toBe(BODY);
  });
});
