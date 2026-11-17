// Vitest: a Guardrails save on an old revision goes through the page's own change hook (useSaveGuardrails:
// the context merge, the locked change, guardrailsFlow) to an agent that holds a newer revision and refuses with a real
// 412 revision_mismatch. The restriction another writer set survives (nothing is written over it), the edits stay, the
// drawer says the Bot changed elsewhere, and after the page reads the agent again Reload shows the restriction; the next
// save carries the new revision and keeps it.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useSaveGuardrails, useSaveSettings, type BotView, type Computer } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const BOT_KEY = 'c1~global~chief';
const ctx = { botKey: BOT_KEY, uid: 'u-chief' };
const comp = (id: string, name: string): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false });
const computers: Computer[] = [comp('c1', 'Atlas'), comp('c2', 'Borealis')];

const bot = {
  key: BOT_KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
  provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
  pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
  guardrailRevision: 5, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
  speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
} as BotView;

/** The agent's copy of the Bot: another writer already restricted it to Atlas (revision 6). Each owner write checks the fence. */
type Agent = { revision: number; allowed_computers: string[]; guardrails: string; guardrail_check: string };
let agent: Agent;
type Sent = { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> };
let sent: Sent[] = [];
/** Another writer that saves right after this form's PATCH lands, before its rules PUT. */
let raceAfterPatch = false;
/** The Bot's card is at its bound: the agent refuses any rules that grow it (400 bad_request, details.field guardrails). */
let cardFull = false;
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
// A live transport (not the fixture one): the page's change takes the locked path, as on a real page.
const live: Transport = {
  hoody: () => Promise.resolve({ data: {} }),
  fetch(url, init) {
    const u = new URL(String(url), 'http://x');
    const method = init.method ?? 'GET';
    if (method === 'GET') return json({});
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    sent.push({ method, path: u.pathname, query: u.searchParams, body });
    const fence = u.searchParams.get('expect_revision');
    if (u.searchParams.get('expect_uid') !== 'u-chief') return json({ error: 'bot_changed' }, 412);
    if (fence !== null && Number(fence) !== agent.revision) return json({ error: 'revision_mismatch' }, 412);
    if (method === 'PUT' && cardFull) return json({ code: 'bad_request', message: 'the card would be too long', details: { field: 'guardrails' } }, 400);
    if (method === 'PATCH') {
      if (Array.isArray(body.allowed_computers)) agent.allowed_computers = body.allowed_computers as string[];
      if (typeof body.guardrail_check === 'string') agent.guardrail_check = body.guardrail_check;
    } else if (typeof body.guardrails === 'string') agent.guardrails = body.guardrails;
    agent.revision += 1;
    const answered = agent.revision;
    if (method === 'PATCH' && raceAfterPatch) {
      raceAfterPatch = false;
      agent.revision += 1;
      agent.guardrails = 'Ask before any deploy';
    }
    return json({ revision: answered });
  },
};

let setLiveBot: (b: BotView) => void = () => undefined;
function Drawer() {
  const [b, setB] = useState<BotView>(bot);
  setLiveBot = setB;
  const save = useSaveSettings(ctx);
  const saveRules = useSaveGuardrails(ctx);
  return <SettingsDrawer section="guardrails" onSection={() => undefined} onClose={() => undefined} bot={b} models={[]} computers={computers} save={save} saveRules={saveRules} />;
}
async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
/** The page's next read of the Bot: what the agent holds now. */
const readAgent = (): BotView => ({ ...bot, guardrailRevision: agent.revision, allowedComputers: agent.allowed_computers.length ? [...agent.allowed_computers] : null, guardrails: agent.guardrails ? agent.guardrails.split('\n') : [], guardrailCheck: agent.guardrail_check as BotView['guardrailCheck'] });
const rulesBox = () => screen.getByRole('textbox', { name: strings['guard.rules'] });

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 's1' }]);
  queryClient.clear();
  sent = [];
  agent = { revision: 6, allowed_computers: ['c1'], guardrails: '', guardrail_check: 'off' };
  raceAfterPatch = false;
  cardFull = false;
});
afterEach(() => {
  cleanup();
  installTransport(null);
});

describe('Guardrails: a save another writer overtook', () => {
  it('is refused 412 by the agent: the restriction stays, the edits stay, and Reload then Save keeps the restriction', async () => {
    await show(<Drawer />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('Never deploy on Fridays');
    // The form still shows "any computer" (revision 5): only the agent's 412 tells it the Bot moved on.
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(await screen.findByText(strings['settings.stale'], undefined, { timeout: 8000 })).toBeInTheDocument();
    // One write went out, fenced with the form's revision and uid through the change's context; the rules were never sent.
    expect(sent.map((s) => s.method)).toEqual(['PATCH']);
    expect(sent[0]?.path).toMatch(/\/bots\/chief$/);
    expect(sent[0]?.query.get('expect_revision')).toBe('5');
    expect(sent[0]?.query.get('expect_uid')).toBe('u-chief');
    // Refused, never merged: the agent still holds the other writer's restriction.
    expect(agent).toEqual({ revision: 6, allowed_computers: ['c1'], guardrails: '', guardrail_check: 'off' });
    // No Try again (it would be refused the same way); what was typed is still there.
    expect(screen.queryByRole('button', { name: /^Try again/ })).toBeNull();
    expect(rulesBox()).toHaveValue('Never deploy on Fridays');

    // The page reads the agent; Reload shows what the Bot holds: Atlas only, not "any computer".
    await act(async () => setLiveBot(readAgent()));
    await userEvent.click(screen.getByRole('button', { name: strings['settings.reload'] }));
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['guard.anyComputer'] })).not.toBeChecked());
    expect(within(screen.getByRole('group', { name: strings['guard.computersLabel'] })).getByRole('checkbox', { name: /Atlas/ })).toBeChecked();
    expect(rulesBox()).toHaveValue('');

    // Typing the rule again and saving now carries revision 6: both writes land and the restriction is kept.
    sent = [];
    await userEvent.click(rulesBox());
    await userEvent.keyboard('Never deploy on Fridays');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(sent.map((s) => s.method)).toEqual(['PATCH', 'PUT']), { timeout: 8000 });
    expect(sent.map((s) => s.query.get('expect_revision'))).toEqual(['6', '7']);
    await waitFor(() => expect(agent).toEqual({ revision: 8, allowed_computers: ['c1'], guardrails: 'Never deploy on Fridays', guardrail_check: 'off' }));
    expect(screen.queryByText(strings['settings.stale'])).toBeNull();
  });

  it('a write between its PATCH and its rules PUT: the PUT is refused 412, said as Changed elsewhere, edits kept, the other rules kept', async () => {
    agent = { revision: 5, allowed_computers: [], guardrails: '', guardrail_check: 'off' };
    raceAfterPatch = true;
    await show(<Drawer />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('Never deploy on Fridays');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(await screen.findByText(strings['settings.stale'], undefined, { timeout: 8000 })).toBeInTheDocument();
    // The PATCH landed at 5 (answered 6); the PUT carried 6 while the agent was at 7 (the other writer): refused.
    expect(sent.map((s) => [s.method, s.query.get('expect_revision')])).toEqual([['PATCH', '5'], ['PUT', '6']]);
    expect(agent.guardrails).toBe('Ask before any deploy');
    expect(agent.revision).toBe(7);
    // Never said as a failed or unknown rules save; no Try again; what was typed is still there.
    expect(screen.queryByText(strings['settings.rules.failed.title'])).toBeNull();
    expect(screen.queryByText(strings['settings.rules.unknown.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: /^Try again/ })).toBeNull();
    expect(rulesBox()).toHaveValue('Never deploy on Fridays');
  });
});

describe('Guardrails: rules the agent refuses as too long', () => {
  it('says too long at the Rules field and in the banner, never "Press Save again"; the edits stay and nothing is sent again', async () => {
    agent.revision = 5;
    cardFull = true;
    await show(<Drawer />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('Never deploy on Fridays');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(await screen.findByText(strings['settings.rules.too_long.body'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(strings['guard.rulesTooLong']).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['settings.rules.failed.body'])).toBeNull();
    // The mode write went through, the rules write was refused once: neither is sent again by itself.
    expect(sent.map((s) => s.method)).toEqual(['PATCH', 'PUT']);
    expect(agent.guardrails).toBe('');
    expect(rulesBox()).toHaveValue('Never deploy on Fridays');
    // Nothing of the agent's own words is shown.
    expect(screen.queryByText(/the card would be too long/)).toBeNull();
  });
});
