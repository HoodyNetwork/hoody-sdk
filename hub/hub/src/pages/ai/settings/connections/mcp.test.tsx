// MCP servers on a live page: the real core over a fake fetch and a scripted settings session manager. Entering opens the
// settings chat BEFORE the first listMCPServers (the agent answers MCP only for a live session); leaving closes it; a place
// switch replaces it and never shows the old list; a lost session is replaced once and the list read again. A change mints its
// one-time permission at the press and is checked against the layer hash the person saw (expect_hash); its confirm names the
// command it starts or the host it sends to; env and header VALUES are never shown, and a value typed for a change goes only
// into that change's request. A lost answer is held as unknown and never resent.
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { heldChanges, queryClient, useCurrentComputer, useRealms } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpSection } from './Mcp';
import { MCP_LOCK, notFoundOf } from './mcp.data';
import { createSettingsSessions, setSettingsSessionsForTests, type SessionApi, type SettingsSessions } from '../rules/Session';
import strings from './Mcp.strings.en.json';
import formWords from '@kit/forms/forms.strings.en.json';
import newStrings from '../../new/NewChat.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const FOLDER = '/home/ada/shop';
const SECRET = 'hunter2-not-shown';
type Hook = (c: { url: URL; method: string; body: Record<string, unknown> | null }) => Reply | Promise<Reply> | undefined;
type Over = Partial<Record<'list' | 'begin' | 'upsert' | 'remove' | 'enable' | 'reconnect' | 'parse' | 'import', Hook>>;
let over: Over = {};
let seq = 0;

interface Srv { name: string; scope: string; transport: string; enabled: boolean; command?: string; args?: string[]; url?: string; env_keys: string[]; header_keys: string[]; require_confirmation?: boolean; connected?: boolean; tool_count?: number; allowed_tools?: string[]; stderr_tail?: string; revoked?: boolean; revoked_reason?: string }
let servers: Srv[] = [];
/** The loader's warnings the next lists carry. */
let warnings: string[] = [];
/** Extra raw entries the next lists carry as they are (to test entries the page cannot read). */
let rawExtra: Record<string, unknown>[] = [];
let hashes: Record<string, string> = {};
let hashSeq = 1;
/** Which session ids the agent still has (a lost one answers 404 session not found). */
let alive = new Set<string>();

const u = (s: string) => new URL(s);
const path = (c: { url: string }) => u(c.url).pathname.split('/agent')[1] ?? '';
const mcpCalls = () => calls.filter((c) => path(c).startsWith('/mcp'));
const writes = () => calls.filter((c) => c.method !== 'GET' && /^\/mcp\/servers/.test(path(c)));
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await settle(); }); };

/** The agent's reconnect answer, real shape. */
const reconnected = (o: Record<string, unknown> = {}) => ({
  status: 'ok', sessions: 1, revoked: 0, partial_sessions: 0, deferred_sessions: 0, deferred_started: true, servers: [], warnings: [], ...o,
});

// ---- the scripted session manager ----
let created = 0;
let closed: string[] = [];
const order: string[] = [];
function sessions(): SettingsSessions {
  const api: SessionApi = {
    status: async () => ({ connected: true, account_id: 'acct', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' }),
    version: async () => ({ session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })) }),
    create: async (a) => { created++; const sid = `s${created}`; alive.add(sid); order.push(`create ${sid}`); return { session_id: sid, started: { realm_selector: a.realm, computer_id: 'c1', owner_fingerprint: 'fp' } }; },
    close: async (_a, sid) => { closed.push(sid); alive.delete(sid); },
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

let setShown: (v: boolean) => void = () => undefined;
/** The place's realm when it is not the top bar's (a Global place under a realm at the top); null: the top bar's. */
let placeRealm: string | null = null;
function Host() {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  const [shown, set] = useState(true);
  setShown = set;
  return target && shown ? <McpSection computer="atlas" target={target} realm={placeRealm ?? realm} /> : null;
}
async function show() {
  const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/ai/connections'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
}

const scopeOf = (b: Record<string, unknown> | null) => String(b?.scope ?? 'user');
const bump = (scope: string) => { hashes = { ...hashes, [scope]: `h-${scope}-${++hashSeq}` }; };
const listBody = () => ({
  status: 'ok',
  servers: [...servers.map((s) => ({ args: s.command ? [] : undefined, connected: false, require_confirmation: false, ...s })), ...rawExtra],
  files: Object.entries(hashes).map(([scope, hash]) => ({ scope, path: `/x/${scope}.json`, exists: true, hash })),
  warnings,
});
const notFound = (msg: string): Reply => ({ status: 404, body: { code: 'not_found', message: msg } });

/** The agent's import parser for the two dialects these tests paste: the name lifted from a map key, every
 *  entry off, an address given a type. */
let parseWarnings: string[] = [];
function agentParse(doc: string): { dialect: string; entries: Record<string, unknown>[]; warnings: string[] } | null {
  let j: unknown;
  try { j = JSON.parse(doc); } catch { return null; }
  const r = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const lift = (e: Record<string, unknown>, name: string) => ({ ...e, name, enabled: false, ...(e.url && !e.type ? { type: 'http' } : {}) });
  let entries: Record<string, unknown>[];
  let dialect: string;
  if (r.mcpServers && typeof r.mcpServers === 'object') { dialect = 'claude'; entries = Object.entries(r.mcpServers as Record<string, Record<string, unknown>>).map(([n, e]) => lift(e, n)); }
  else if (Array.isArray(r.mcp_servers)) { dialect = 'hoody'; entries = (r.mcp_servers as Record<string, unknown>[]).map((e) => lift(e, String(e.name))); }
  else return null;
  // As the agent: a ${…} in an env or header value that is not a plain variable name is quoted whole in the warning.
  const warnings: string[] = [];
  for (const e of entries) {
    for (const m of ['env', 'headers'] as const) {
      for (const [k, v] of Object.entries((e[m] ?? {}) as Record<string, string>)) {
        for (const whole of String(v).match(/\$\{[^}]*\}/g) ?? []) {
          if (!/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(whole)) warnings.push(`${String(e.name)}: ${m}.${k} references ${whole}, which hoody cannot resolve — it would expand to EMPTY; replace it with a value or a \${VAR} before enabling`);
        }
      }
    }
  }
  return { dialect, entries, warnings };
}
/** redactMCPEntryForDisplay: env and headers become their sorted key names. */
function redacted(e: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k.toLowerCase() === 'env' || k.toLowerCase() === 'headers') out[k.toLowerCase() === 'env' ? 'env_keys' : 'header_keys'] = Object.keys(v as object).sort();
    else out[k] = v;
  }
  return out;
}

let mgr: SettingsSessions;
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  placeRealm = null;
  over = {};
  seq = 0;
  hashSeq = 1;
  created = 0;
  closed = [];
  order.length = 0;
  alive = new Set();
  hashes = { user: 'h-user-1' };
  warnings = [];
  rawExtra = [];
  parseWarnings = [];
  servers = [
    { name: 'pg', scope: 'user', transport: 'stdio', enabled: true, command: 'npx', args: ['-y', '@mcp/pg'], env_keys: ['PGPASSWORD'], header_keys: [], connected: true, tool_count: 4 },
    { name: 'linear', scope: 'user', transport: 'http', enabled: false, url: 'https://mcp.linear.app/mcp', env_keys: [], header_keys: ['Authorization'] },
  ];
  mgr = sessions();
  setSettingsSessionsForTests(mgr);
  onFetch((c) => {
    const p = path(c);
    const body = c.body as Record<string, unknown> | null;
    const x = { url: u(c.url), method: c.method, body };
    const sid = c.method === 'GET' ? u(c.url).searchParams.get('session_id') : String(body?.session_id ?? '');
    const hit = (k: keyof Over, d: () => Reply): Reply | Promise<Reply> => over[k]?.(x) ?? d();
    if (p === '/sessions/cwds') return { status: 200, body: { cwds: [FOLDER] } };
    if (p.startsWith('/mcp')) {
      if (c.method === 'GET') order.push(`list ${sid}`);
      if (!sid || !alive.has(sid)) return notFound('session not found');
    }
    if (p === '/mcp/servers' && c.method === 'GET') return hit('list', () => ({ status: 200, body: listBody() }));
    if (p === '/mcp/write-intents') return hit('begin', () => ({ status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, path: '/x', hash: hashes[scopeOf(body)] } }));
    const cas = (scope: string): Reply | null => (body?.expect_hash !== hashes[scope] ? { status: 409, body: { code: 'mcp_conflict', message: 'changed' } } : null);
    if (p === '/mcp/servers' && c.method === 'PUT') {
      return hit('upsert', () => {
        const scope = scopeOf(body);
        const conflict = cas(scope);
        if (conflict) return conflict;
        const s = body?.server as Record<string, unknown>;
        const old = servers.find((v) => v.name === s.name);
        // The agent's merge: a null field is refused; allowed_tools left out keeps the saved one.
        if (Object.values(s).some((v) => v === null)) return { status: 400, body: { code: 'bad_request', message: 'null' } };
        const allowed = 'allowed_tools' in s ? (s.allowed_tools as string[]) : old?.allowed_tools;
        // A re-point (type, command, args or url changed) keeps no saved value the write does not set again.
        const repoint = !!old && (old.transport !== s.type || (old.command ?? '') !== (s.command ?? '') || JSON.stringify(old.args ?? []) !== JSON.stringify(s.args ?? []) || (old.url ?? '') !== (s.url ?? ''));
        const env = { ...Object.fromEntries((repoint ? [] : old?.env_keys ?? []).map((k) => [k, 'x'])), ...(s.env as Record<string, unknown> | undefined) };
        const next: Srv = {
          name: String(s.name), scope, transport: String(s.type), enabled: (s.enabled as boolean | undefined) ?? old?.enabled ?? true,
          ...(s.command ? { command: String(s.command), args: s.args as string[] } : {}), ...(s.url ? { url: String(s.url) } : {}),
          env_keys: Object.entries(env).filter(([, v]) => v !== null).map(([k]) => k).sort(), header_keys: Object.keys((s.headers as object | undefined) ?? {}),
          require_confirmation: s.require_confirmation === true,
          ...(allowed !== undefined ? { allowed_tools: allowed } : {}),
        };
        servers = [...servers.filter((v) => v.name !== next.name), next];
        bump(scope);
        return { status: 200, body: { status: 'ok', hash: hashes[scope], servers: [], warnings: [] } };
      });
    }
    if (p === '/mcp/servers' && c.method === 'DELETE') {
      return hit('remove', () => {
        const scope = scopeOf(body);
        const conflict = cas(scope);
        if (conflict) return conflict;
        if (!servers.some((v) => v.name === body?.name && v.scope === scope)) return notFound('no such MCP server in this settings layer');
        servers = servers.filter((v) => v.name !== body?.name);
        bump(scope);
        return { status: 200, body: { status: 'ok', hash: hashes[scope], servers: [], warnings: [] } };
      });
    }
    if (p === '/mcp/servers/enable') {
      return hit('enable', () => {
        const scope = scopeOf(body);
        const conflict = cas(scope);
        if (conflict) return conflict;
        servers = servers.map((v) => (v.name === body?.name ? { ...v, enabled: body?.enabled === true } : v));
        bump(scope);
        return { status: 200, body: { status: 'ok', hash: hashes[scope], servers: [], warnings: [] } };
      });
    }
    if (p === '/mcp/reconnect') return hit('reconnect', () => ({ status: 200, body: reconnected() }));
    if (p === '/mcp/parse') {
      return hit('parse', () => {
        const parsed = agentParse(String(body?.document ?? ''));
        if (!parsed) return { status: 400, body: { code: 'bad_request', message: 'document is not an MCP config' } };
        return { status: 200, body: { status: 'ok', dialect: parsed.dialect, servers: parsed.entries.map(redacted), count: parsed.entries.length, warnings: [...parsed.warnings, ...parseWarnings] } };
      });
    }
    if (p === '/mcp/import') {
      return hit('import', () => {
        const scope = scopeOf(body);
        const conflict = cas(scope);
        if (conflict) return conflict;
        const parsed = agentParse(String(body?.document ?? ''));
        if (!parsed) return { status: 400, body: { code: 'bad_request', message: 'document is not an MCP config' } };
        // MCPImportServers indexes the layer's names exactly: another spelling is a new entry, never a collision.
        const taken = (n: string) => servers.some((v) => v.scope === scope && v.name === n);
        const clash = parsed.entries.find((e) => taken(String(e.name)));
        if (clash && body?.replace !== true) return { status: 400, body: { code: 'bad_request', message: `"${String(clash.name)}" already exists in this settings layer; pass replace to overwrite it` } };
        for (const e of parsed.entries) {
          const env = (e.env ?? {}) as Record<string, unknown>;
          const headers = (e.headers ?? {}) as Record<string, unknown>;
          servers = [...servers.filter((v) => !(v.scope === scope && v.name === String(e.name))), {
            name: String(e.name), scope, transport: String(e.type ?? 'stdio'), enabled: false,
            ...(e.command ? { command: String(e.command), args: (e.args as string[] | undefined) ?? [] } : { url: String(e.url) }),
            env_keys: Object.keys(env).sort(), header_keys: Object.keys(headers).sort(),
          }];
        }
        bump(scope);
        return { status: 200, body: { status: 'ok', hash: hashes[scope], imported: parsed.entries.length, servers: [], warnings: [] } };
      });
    }
    return { status: 404, body: {} };
  });
});
afterEach(() => { cleanup(); mgr.reset(); setSettingsSessionsForTests(null); });

const rowOf = (el: HTMLElement): HTMLElement => {
  let n: HTMLElement | null = el;
  while (n && !n.querySelector('[data-row-menu]')) n = n.parentElement;
  return n as HTMLElement;
};
const rowMenu = async (text: RegExp, item: string) => {
  const row = rowOf(await screen.findByText(text));
  await userEvent.click(row.querySelector('[data-row-menu] button') as HTMLElement);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(item) }));
};
const effectRuns = (command: string) => strings['effect.runs'].replace('{{command}}', command).replace('{{computer}}', 'atlas');
const changedText = strings['conflict.before'].replace('{{computer}}', 'atlas');
const conflictText = strings.conflict.replace('{{computer}}', 'atlas');
const names = (k: 'cleared.env' | 'cleared.headers', n: string) => strings[k].replace('{{names}}', n);
/** The agent's refusal of a write whose layer moved after the page's last read (the pre-send read cannot see it). */
const agentConflict = (): Reply => { bump('user'); return { status: 409, body: { code: 'mcp_conflict', message: 'changed' } }; };
const confirmDialog = async () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));

/** Fills the add dialog for a command server and presses Review. */
async function fillAdd(o: { name: string; command: string; args?: string; env?: [string, string] }) {
  await userEvent.click(await screen.findByRole('button', { name: strings.add }));
  const dlg = await screen.findByRole('dialog');
  await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.name']}`) }), o.name);
  await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.command']}`) }), o.command);
  if (o.args) await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) }), o.args);
  if (o.env) {
    const names = within(dlg).getAllByRole('textbox', { name: new RegExp(`^${strings['dlg.newName']}`) });
    await userEvent.type(names[names.length - 1]!, o.env[0]);
    await userEvent.type(dlg.querySelector('input[type="password"]') as HTMLElement, o.env[1]);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.addValue'] }));
  }
  await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
  await flush();
}
const confirmSave = async () => {
  const c = await confirmDialog();
  await userEvent.click(within(c).getByRole('button', { name: strings['save.confirm'] }));
  await flush();
};

describe('the settings session', () => {
  it('opens the settings chat before the first listMCPServers, and lists on it', async () => {
    await show();
    expect(await screen.findByText(/^pg/)).toBeInTheDocument();
    expect(order[0]).toBe('create s1');
    expect(order[1]).toBe('list s1');
    expect(mcpCalls().every((c) => c.method !== 'GET' || u(c.url).searchParams.get('session_id') === 's1')).toBe(true);
    // Where the list comes from is a fact of the place, not a strip of prose.
    const facts = screen.getByLabelText(strings['facts.label']);
    expect(within(facts).getByText(strings['facts.from.realm'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
  });

  it('leaving closes the settings chat', async () => {
    await show();
    await screen.findByText(/^pg/);
    await act(async () => { setShown(false); });
    await flush();
    expect(closed).toEqual(['s1']);
  });

  it('a folder replaces the session and never shows the realm list under it', async () => {
    await show();
    await screen.findByText(/^pg/);
    servers = [{ name: 'shop-db', scope: 'project', transport: 'stdio', enabled: true, command: 'node', args: ['db.js'], env_keys: [], header_keys: [] }];
    hashes = { user: 'h-user-1', project: 'h-project-1' };
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(closed).toContain('s1');
    expect(await screen.findByText(/^shop-db/)).toBeInTheDocument();
    expect(screen.queryByText(/^pg ·/)).toBeNull();
    expect(order.filter((x) => x.startsWith('list'))).toEqual(['list s1', 'list s2']);
  });

  it('a typed folder opens one settings chat, on Enter, never one per keystroke', async () => {
    await show();
    await screen.findByText(/^pg/);
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    const before = created;
    await userEvent.click(screen.getByRole('button', { name: new RegExp(newStrings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: newStrings['folder.another'] }));
    await flush();
    await userEvent.type(screen.getByRole('combobox', { name: newStrings['folder.path'] }), '/srv/data');
    await flush();
    // "Another folder" with nothing typed chose none, so the folder's chat closed and no other opened while typing
    expect(created).toBe(before);
    await userEvent.keyboard('{Enter}');
    await flush();
    expect(created).toBe(before + 1);
    expect(screen.getByRole('combobox', { name: newStrings['folder.path'] })).toHaveValue('/srv/data');
  });

  it('a lost session is replaced once and the list read again on the new one', async () => {
    let first = true;
    over.list = () => {
      if (first) { first = false; return notFound('session not found'); }
      return undefined;
    };
    await show();
    expect(await screen.findByText(/^pg/)).toBeInTheDocument();
    expect(created).toBe(2);
    expect(order).toEqual(['create s1', 'list s1', 'create s2', 'list s2']);
  });

  it('while a lost session is replaced, the header actions wait for the new list: Add, Import and Reconnect are off and send nothing', async () => {
    await show();
    await screen.findByText(/^pg ·/);
    let open = () => {};
    const gate = new Promise<void>((r) => { open = r; });
    over.list = (c) => (c.url.searchParams.get('session_id') === 's2' ? gate.then(() => ({ status: 200, body: listBody() })) : undefined);
    alive.delete('s1');
    await userEvent.click(screen.getByRole('button', { name: /^Refresh$/ }));
    await flush();
    expect(created).toBe(2);
    expect(screen.getByText(strings.opening.replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    const off = (name: string) => { const b = screen.getByRole('button', { name }); return b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true'; };
    expect([off(strings.add), off(strings.import), off(strings.reconnect)]).toEqual([true, true, true]);
    for (const name of [strings.add, strings.import, strings.reconnect]) await userEvent.click(screen.getByRole('button', { name }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mcpCalls().filter((c) => c.method !== 'GET')).toHaveLength(0);
    await act(async () => open());
    await flush();
    expect(await screen.findByText(/^pg ·/)).toBeInTheDocument();
    expect([off(strings.add), off(strings.import), off(strings.reconnect)]).toEqual([false, false, false]);
  });

  it('a session lost again right after its replacement is not replaced a third time', async () => {
    over.list = () => notFound('session not found');
    await show();
    expect(await screen.findByText(strings.lost)).toBeInTheDocument();
    expect(created).toBe(2);
  });
});

describe('names, never values', () => {
  it('shows env and header names nowhere as values, and a typed value only in its own request', async () => {
    await show();
    await fillAdd({ name: 'gh', command: 'npx', args: '-y{enter}@mcp/github', env: ['GITHUB_TOKEN', SECRET] });
    await confirmSave();
    const put = writes().find((c) => c.method === 'PUT')!;
    expect(put.body.server.env).toEqual({ GITHUB_TOKEN: SECRET });
    await flush();
    expect(document.body.textContent).not.toContain(SECRET);
    // the read the agent answers holds names only; the edit dialog lists the saved name, never a value
    await rowMenu(/^gh ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('GITHUB_TOKEN')).toBeInTheDocument();
    expect(within(dlg).getAllByText(strings['dlg.kept']).length).toBeGreaterThan(0);
    expect(dlg.textContent).not.toContain(SECRET);
    expect((dlg.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
  });

  it('a held change records names only, never the value it sent', async () => {
    over.upsert = () => ({ status: 0, network: true });
    await show();
    await fillAdd({ name: 'gh', command: 'npx', env: ['GITHUB_TOKEN', SECRET] });
    await confirmSave();
    expect(await screen.findByText(/Check again reads the servers only/)).toBeInTheDocument();
    const held = heldChanges(MCP_LOCK, { realm: R1 });
    expect(held).toHaveLength(1);
    expect(JSON.stringify(held)).not.toContain(SECRET);
    expect(JSON.stringify(held[0]!.identity)).toContain('GITHUB_TOKEN');
  });
});

describe('changes', () => {
  it('add: the confirm names the command it starts; the nonce is minted at the press; the write carries the hash the person saw', async () => {
    await show();
    await fillAdd({ name: 'files', command: 'npx', args: '@mcp/fs' });
    const c = await confirmDialog();
    expect(within(c).getByText(effectRuns('npx @mcp/fs'))).toBeInTheDocument();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    await userEvent.click(within(c).getByRole('button', { name: strings['save.confirm'] }));
    await flush();
    const begin = calls.filter((x) => path(x) === '/mcp/write-intents');
    expect(begin).toHaveLength(1);
    expect(begin[0]!.body).toEqual({ session_id: 's1', op: 'upsert', scope: 'user' });
    const put = writes()[0]!;
    expect(put.body).toMatchObject({ session_id: 's1', nonce: 'nonce-1', scope: 'user', expect_hash: 'h-user-1' });
    expect(put.body.server).toMatchObject({ name: 'files', type: 'stdio', command: 'npx', args: ['@mcp/fs'], enabled: true });
    expect(await screen.findByText(strings.saved)).toBeInTheDocument();
  });

  it('add an address: the confirm names the host it sends to', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.name']}`) }), 'notion');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['dlg.kind']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['dlg.kind.http'] }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.url']}`) }), 'https://mcp.notion.com/mcp');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    const c = await confirmDialog();
    expect(within(c).getByText(strings['effect.sends'].replace('{{host}}', 'mcp.notion.com'))).toBeInTheDocument();
  });

  it('turning a server on confirms what it does first; turning one off sends at once; both carry nonce and hash', async () => {
    await show();
    await rowMenu(/^linear ·/, strings.turnOn);
    const c = await confirmDialog();
    expect(within(c).getByText(strings['effect.sends'].replace('{{host}}', 'mcp.linear.app'))).toBeInTheDocument();
    await userEvent.click(within(c).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    expect(writes()[0]!.body).toMatchObject({ name: 'linear', enabled: true, nonce: 'nonce-1', expect_hash: 'h-user-1', scope: 'user' });
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(writes()[1]!.body).toMatchObject({ name: 'pg', enabled: false, nonce: 'nonce-2', expect_hash: hashes.user === 'h-user-3' ? 'h-user-2' : expect.any(String) });
    expect(calls.filter((x) => path(x) === '/mcp/write-intents').map((x) => x.body.op)).toEqual(['set_enabled', 'set_enabled']);
  });

  it('remove: the red confirm names the command, then a DELETE with its body', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    const c = await confirmDialog();
    expect(within(c).getByText(strings['rm.effectRuns'].replace('{{command}}', 'npx -y @mcp/pg').replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    await userEvent.click(within(c).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    const del = writes().find((x) => x.method === 'DELETE')!;
    expect(del.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', name: 'pg', expect_hash: 'h-user-1' });
    expect(screen.queryByText(/^pg ·/)).toBeNull();
  });

  it('a server not in its file any more is a refusal, never a lost session', async () => {
    over.remove = () => notFound('no such MCP server in this settings layer');
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(await screen.findByText(strings['refused.mcp_not_in_layer'])).toBeInTheDocument();
    expect(created).toBe(1);
    expect(writes()).toHaveLength(1);
  });

  it('a lost session at the write is replaced once and the change made again with a new nonce', async () => {
    let first = true;
    over.enable = () => {
      if (first) { first = false; alive.delete('s1'); return notFound('session not found'); }
      return undefined;
    };
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(created).toBe(2);
    const sent = writes();
    expect(sent.map((x) => [x.body.session_id, x.body.nonce])).toEqual([['s1', 'nonce-1'], ['s2', 'nonce-2']]);
  });

  it('a change made meanwhile is caught by the read just before the send: nothing is sent; Compare reopens the kept draft', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    const args = within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) });
    await userEvent.clear(args);
    await userEvent.type(args, '-y{enter}@mcp/pg@2');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    // someone else changed the file meanwhile
    hashes = { user: 'h-user-other' };
    await confirmSave();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const again = await screen.findByRole('dialog');
    expect((within(again).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) }) as HTMLTextAreaElement).value).toContain('@mcp/pg@2');
    expect(writes()).toHaveLength(0);
  });

  it('a change made after that read is refused by the agent and shown: nothing is resent; Compare reopens the kept draft beside what is saved now', async () => {
    over.upsert = agentConflict;
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    const args = within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) });
    await userEvent.clear(args);
    await userEvent.type(args, '-y{enter}@mcp/pg@2');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    over.upsert = undefined;
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const again = await screen.findByRole('dialog');
    expect(within(again).getByText(strings['conflict.now'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    expect((within(again).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) }) as HTMLTextAreaElement).value).toContain('@mcp/pg@2');
    expect(writes()).toHaveLength(1);
  });

  it('a re-point says which saved values go, in the confirm', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    const cmd = within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.command']}`) });
    await userEvent.clear(cmd);
    await userEvent.type(cmd, 'node');
    expect(within(dlg).getByText(`${strings['dlg.repoint']} ${names('cleared.env', 'PGPASSWORD')}`)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    const c = await confirmDialog();
    expect(within(c).getByText(strings['save.cleared'])).toBeInTheDocument();
    expect(within(c).getByText(names('cleared.env', 'PGPASSWORD'))).toBeInTheDocument();
  });

  it('warns before saving a credential typed into the arguments', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) }), '--api-key=sk-live-123456789');
    expect(within(dlg).getByText(strings['dlg.credInText'])).toBeInTheDocument();
  });
});

describe('a lost answer', () => {
  it('is held as unknown: nothing is resent; no list proves it, and only Stop tracking ends the hold', async () => {
    let applied = false;
    over.remove = (c) => {
      if (!applied) return { status: 0, network: true };
      void c;
      return undefined;
    };
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['rm.confirm'] }));
    expect(await screen.findByText(/Check again reads the servers only/)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    // nothing changed on the agent: the same hash proves nothing
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Check again reads the servers only/)).toBeInTheDocument();
    // it did apply after all, and the list shows it gone under a new hash: the list cannot show the layer's own bytes (a
    // top-level key no hash covers can hide an entry), so it still proves nothing
    applied = true;
    servers = servers.filter((s) => s.name !== 'pg');
    bump('user');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Check again reads the servers only/)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(1);
    // the person ends it
    await userEvent.click(screen.getByRole('button', { name: /^Stop tracking/ }));
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['held.stopConfirm'] }));
    await flush();
    expect(screen.queryByText(/Check again reads the servers only/)).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('a lost mint sent no write and holds nothing', async () => {
    over.begin = () => ({ status: 0, network: true });
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(writes()).toHaveLength(0);
    expect(screen.queryByText(/Check again reads the servers only/)).toBeNull();
  });

  it('never probes a server (the agent refuses probes over HTTP)', async () => {
    await show();
    await fillAdd({ name: 'files', command: 'npx' });
    await confirmSave();
    expect(calls.some((x) => path(x) === '/mcp/probe')).toBe(false);
  });
});

const refreshList = async () => { await act(async () => { await queryClient.refetchQueries(); }); await flush(); };
const held = () => screen.queryByText(/Check again reads the servers only/);

describe('the hash a change is checked against is the one reviewed', () => {
  it('Turn on: a newer list showing its layer changed closes the open confirm and sends nothing (rule 3), with Compare', async () => {
    await show();
    await rowMenu(/^linear ·/, strings.turnOn);
    await confirmDialog();
    // meanwhile someone re-points linear and the list is read again under the open confirm
    servers = servers.map((v) => (v.name === 'linear' ? { ...v, url: 'https://evil.example/mcp' } : v));
    bump('user');
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(strings['conflict.before'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    expect(servers.find((v) => v.name === 'linear')!.enabled).toBe(false);
    // Compare: the entry as reviewed beside the entry now, then Reload; no second mint or write
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const cmp = await screen.findByRole('dialog');
    expect(within(cmp).getByText(strings['conflict.reviewed'])).toBeInTheDocument();
    expect(within(cmp).getByText(strings['effect.sends'].replace('{{host}}', 'mcp.linear.app'))).toBeInTheDocument();
    expect(within(cmp).getByText(strings['effect.sends'].replace('{{host}}', 'evil.example'))).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
  });

  it('Turn on with a change the page has not read yet: the read just before the send sees it, and nothing is sent', async () => {
    await show();
    await rowMenu(/^linear ·/, strings.turnOn);
    const c = await confirmDialog();
    bump('user');
    await userEvent.click(within(c).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['conflict.compare'] })).toBeInTheDocument();
  });

  it('Turn on with a change after that read: the write carries the reviewed hash and the agent answers a conflict', async () => {
    over.enable = agentConflict;
    await show();
    await rowMenu(/^linear ·/, strings.turnOn);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    expect(writes()[0]!.body).toMatchObject({ name: 'linear', enabled: true, expect_hash: 'h-user-1' });
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['conflict.compare'] })).toBeInTheDocument();
  });

  it('Edit is bound to the file its dialog opened on: after a newer list, Review sends nothing and Compare keeps the draft', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    servers = servers.map((v) => (v.name === 'pg' ? { ...v, command: 'node' } : v));
    bump('user');
    await refreshList();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['dlg.confirmCalls'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(strings['conflict.before'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const again = await screen.findByRole('dialog');
    expect((within(again).getByRole('checkbox', { name: strings['dlg.confirmCalls'] }) as HTMLInputElement).checked).toBe(true);
    expect(within(again).getByText(effectRuns('node -y @mcp/pg'))).toBeInTheDocument();
  });

  it('Remove and Turn off conflicts offer Compare and Reload, with nothing sent again', async () => {
    over.remove = agentConflict;
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    const c = await confirmDialog();
    await userEvent.click(within(c).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['conflict.compare'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['conflict.reload'] })).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
});

describe('what a Check again can prove', () => {
  it('a lost change that sets a credential value stays held after an unrelated change, even with its name shown', async () => {
    over.upsert = () => ({ status: 0, network: true });
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.newName']}`) }), 'PGPASSWORD');
    await userEvent.type(dlg.querySelector('input[type="password"]') as HTMLElement, SECRET);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.addValue'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect(held()).not.toBeNull();
    // someone else turns linear on: the file's hash moves, pg still shows PGPASSWORD
    servers = servers.map((v) => (v.name === 'linear' ? { ...v, enabled: true } : v));
    bump('user');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('a lost remove stays held when the entry is missing only because the agent dropped it with a warning', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(held()).not.toBeNull();
    servers = servers.filter((v) => v.name !== 'pg');
    warnings = ['user settings: dropped MCP server "pg": args must be a list'];
    bump('user');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    // read whole (no warning) and pg gone: still no proof (a list cannot show a removal from the layer's own bytes)
    warnings = [];
    bump('user');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
  });

  it('an entry missing a required field is shown as unreadable, never as a row, and proves nothing', async () => {
    rawExtra = [{ name: 'half', scope: 'user', transport: 'stdio', enabled: true, require_confirmation: false, connected: false, command: 'npx', header_keys: [] }];
    await show();
    await screen.findByText(/^pg ·/);
    expect(screen.getByText(/could not be read: half\./)).toBeInTheDocument();
    expect(screen.queryByText(/^half ·/)).toBeNull();
  });
});

describe('the editor', () => {
  it('stdio to address names the saved environment values it clears, in the editor and the confirm', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['dlg.kind']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['dlg.kind.http'] }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.url']}`) }), 'https://pg.example/mcp');
    // The env rows are gone with the switch, so the warning names what goes (class 5).
    expect(within(dlg).getByText(`${strings['dlg.repoint']} ${names('cleared.env', 'PGPASSWORD')}`)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    const c = await confirmDialog();
    expect(within(c).getByText(names('cleared.env', 'PGPASSWORD'))).toBeInTheDocument();
    expect(within(c).queryByText(/Header values removed/)).toBeNull();
  });

  it('address to stdio names the saved headers it clears', async () => {
    await show();
    await rowMenu(/^linear ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['dlg.kind']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['dlg.kind.stdio'] }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.command']}`) }), 'npx');
    expect(within(dlg).getByText(`${strings['dlg.repoint']} ${names('cleared.headers', 'Authorization')}`)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    const c = await confirmDialog();
    expect(within(c).getByText(names('cleared.headers', 'Authorization'))).toBeInTheDocument();
    expect(within(c).queryByText(/Environment values removed/)).toBeNull();
  });

  it('changing only the confirmation keeps odd saved arguments byte for byte and keeps the saved values', async () => {
    servers = servers.map((v) => (v.name === 'pg' ? { ...v, args: ['', ' padded ', 'two\nlines'] } : v));
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['dlg.confirmCalls'] }));
    expect(within(dlg).queryByText(strings['dlg.repoint'])).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    const put = writes()[0]!;
    expect(put.body.server.args).toEqual(['', ' padded ', 'two\nlines']);
    expect('env' in put.body.server).toBe(false);
    expect(servers.find((v) => v.name === 'pg')!.env_keys).toEqual(['PGPASSWORD']);
  });

  it('a conflicted add in a folder keeps the layer it was for when Compare reopens it', async () => {
    servers = [{ name: 'shop-db', scope: 'project', transport: 'stdio', enabled: true, command: 'node', args: ['db.js'], env_keys: [], header_keys: [] }];
    hashes = { user: 'h-user-1', project: 'h-project-1', local: 'h-local-1' };
    await show();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await screen.findByText(/^shop-db ·/);
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.name']}`) }), 'files');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.command']}`) }), 'npx');
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`${strings['dlg.savedIn']}$`) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['scope.local'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    bump('local');
    await confirmSave();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const again = await screen.findByRole('dialog');
    expect(within(again).getByRole('button', { name: new RegExp(`${strings['dlg.savedIn']}$`) }).textContent).toContain(strings['scope.local']);
    // reopened by Compare, it is checked against the file as it is now (the hash seen at that reopen)
    const seen = hashes.local;
    await userEvent.click(within(again).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect(writes()[0]!.body).toMatchObject({ scope: 'local', expect_hash: seen });
  });
});

describe('a Global place under a realm at the top', () => {
  it('a lost change in Global is filed under Global and keeps its notice, Check again and Stop tracking', async () => {
    placeRealm = 'global';
    over.enable = () => ({ status: 0, network: true });
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    // filed under the realm the change names (sentIn), so the top bar's view leaves it out: the page must not look there
    expect(heldChanges(MCP_LOCK, { realm: 'global' })).toHaveLength(1);
    expect(heldChanges(MCP_LOCK, { realm: R1 })).toHaveLength(0);
    expect(held()).not.toBeNull();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    const sent = writes().length;
    await userEvent.click(screen.getByRole('button', { name: /^Stop tracking/ }));
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['held.stopConfirm'] }));
    await flush();
    expect(held()).toBeNull();
    expect(heldChanges(MCP_LOCK, { realm: 'global' })).toHaveLength(0);
    expect(writes()).toHaveLength(sent);
  });
});

describe('the session and a held change elsewhere', () => {
  it('a change held in the realm shows from a folder where it blocks changes, with a way to it', async () => {
    over.enable = () => ({ status: 0, network: true });
    hashes = { user: 'h-user-1', project: 'h-project-1' };
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(held()).toBeNull();
    expect(screen.getByText(strings['elsewhere.realm'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['elsewhere.go'] }));
    await flush();
    expect(held()).not.toBeNull();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });

  it('Go to it wins over a typed path left mid-edit: the page opens the held change\'s folder', async () => {
    over.enable = () => ({ status: 0, network: true });
    hashes = { user: 'h-user-1', project: 'h-project-1', local: 'h-local-1' };
    servers = [{ name: 'pg', scope: 'project', transport: 'stdio', enabled: true, command: 'npx', args: ['-y', '@mcp/pg'], env_keys: [], header_keys: [] }];
    await show();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await screen.findByText(/^pg ·/);
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    // another folder, typed and chosen: the held change is elsewhere now
    await userEvent.click(screen.getByRole('button', { name: new RegExp(newStrings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: newStrings['folder.another'] }));
    const path = () => screen.getByRole('combobox', { name: newStrings['folder.path'] });
    await userEvent.type(path(), '/srv/other');
    await userEvent.keyboard('{Escape}{Enter}');
    await flush();
    expect(held()).toBeNull();
    // an edit not yet chosen, then Go to it: the blur it causes never replaces the held change's folder
    await userEvent.type(path(), '-x');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: strings['elsewhere.go'] }));
    await flush();
    expect(held()).not.toBeNull();
    expect(screen.queryByText(strings['elsewhere.folder'].replace('{{folder}}', FOLDER))).toBeNull();
  });

  it('a held change says only Stop tracking unblocks: here, in the other place, and after Check again', async () => {
    over.enable = () => ({ status: 0, network: true });
    hashes = { user: 'h-user-1', project: 'h-project-1' };
    const folderText = strings['elsewhere.folder'].replace('{{folder}}', FOLDER);
    for (const k of ['waiting', 'elsewhere.realm', 'elsewhere.folder'] as const) expect(strings[k]).toMatch(/Stop tracking/);
    // no list proves a held change, so no text says a check can settle or unblock one
    for (const k of ['waiting', 'elsewhere.realm', 'elsewhere.folder', 'unreadableRows'] as const) {
      expect(strings[k]).not.toMatch(/until it is checked|Check it|can be checked/);
    }
    await show();
    // held in the realm: the local guidance names Stop tracking, and Check again leaves it held and blocking
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    const sent = writes().length;
    expect(screen.getByText(strings.waiting)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(screen.getByText(strings.waiting)).toBeInTheDocument();
    // from a folder: the other-place guidance points at it
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(screen.getByText(strings['elsewhere.realm'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['elsewhere.go'] }));
    await flush();
    // Stop tracking ends the hold: no guidance here, none in the folder, and nothing was sent again
    await userEvent.click(screen.getByRole('button', { name: /^Stop tracking/ }));
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['held.stopConfirm'] }));
    await flush();
    expect(held()).toBeNull();
    expect(writes()).toHaveLength(sent);
    expect(screen.queryByText(strings.waiting)).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(screen.queryByText(strings['elsewhere.realm'])).toBeNull();
    expect(screen.queryByText(strings.waiting)).toBeNull();
    // held in the folder: the realm names the folder
    await screen.findByText(/^pg ·/);
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    await flush();
    expect(screen.getByText(folderText)).toBeInTheDocument();
    expect(writes()).toHaveLength(sent + 1);
  });

  it('a session lost on a write and lost again on its replacement is not opened a third time', async () => {
    await show();
    await screen.findByText(/^pg ·/);
    over.begin = (c) => { alive.delete(String(c.body?.session_id)); return notFound('session not found'); };
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    await flush();
    expect(created).toBe(2);
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(strings.lost)).toBeInTheDocument();
    // Try again is the person's: one new session
    over.begin = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    await flush();
    expect(created).toBe(3);
  });

  it('a lost session never says a held change changed nothing', async () => {
    over.enable = () => ({ status: 0, network: true });
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    over.list = () => notFound('session not found');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    await flush();
    expect(held()).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/Nothing was changed/);
  });
});

describe('an open dialog across a session replacement', () => {
  /** The replacement session's first list waits until `release()`: the window in which the page has no list of the new session.
   *  Later reads (the one just before a send) answer at once. */
  let release: () => void = () => undefined;
  const holdNewList = (sid: string) => {
    let held = false;
    over.list = (x) => {
      if (held || x.url.searchParams.get('session_id') !== sid) return undefined;
      held = true;
      return new Promise<Reply>((r) => { release = () => r({ status: 200, body: listBody() }); });
    };
  };
  const loseSession = async (sid: string) => { alive.delete(sid); await refreshList(); await flush(); };
  const commandBox = (dlg: HTMLElement) => within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.command']}`) }) as HTMLInputElement;
  const nextOf = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: strings['dlg.next'] });

  it('keeps the draft while the new session is read, sends nothing until then, and sends on the NEW session', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.clear(commandBox(dlg));
    await userEvent.type(commandBox(dlg), 'node');
    holdNewList('s2');
    await loseSession('s1');
    expect(created).toBe(2);
    // the same dialog, the same draft; no rows of either session; Review waits
    expect(screen.getByRole('dialog')).toBe(dlg);
    expect(commandBox(dlg).value).toBe('node');
    expect(screen.queryByText(/^linear ·/)).toBeNull();
    expect(nextOf(dlg)).toBeDisabled();
    await userEvent.click(nextOf(dlg));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    release();
    await flush();
    expect(nextOf(dlg)).not.toBeDisabled();
    await userEvent.click(nextOf(dlg));
    await confirmSave();
    const put = writes();
    expect(put).toHaveLength(1);
    expect(put[0]!.body.session_id).toBe('s2');
    expect((put[0]!.body.server as Record<string, unknown>).command).toBe('node');
    expect(calls.filter((x) => path(x) === '/mcp/write-intents').every((x) => (x.body as Record<string, unknown>).session_id === 's2')).toBe(true);
  });

  it('an edit whose server the new list no longer has takes the changed path, never a silent create', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.clear(commandBox(dlg));
    await userEvent.type(commandBox(dlg), 'node');
    holdNewList('s2');
    await loseSession('s1');
    // meanwhile pg is removed from the file
    servers = servers.filter((v) => v.name !== 'pg');
    bump('user');
    release();
    await flush();
    await userEvent.click(nextOf(dlg));
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    expect(servers.some((v) => v.name === 'pg')).toBe(false);
  });

  it('a conflict banner open across the swap claims nothing about the entry until the new list is read (2b)', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.clear(commandBox(dlg));
    await userEvent.type(commandBox(dlg), 'node');
    await userEvent.click(nextOf(dlg));
    bump('user');
    await confirmSave();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    holdNewList('s2');
    await loseSession('s1');
    // the banner stays; it never says the entry is gone, and Compare and Reload wait for the new list
    expect(screen.getByText(changedText)).toBeInTheDocument();
    expect(screen.queryByText(strings['conflict.gone'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['conflict.compare'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: strings['conflict.reload'] })).toBeDisabled();
    release();
    await flush();
    // pg is still there: still not gone, and Compare works again
    expect(screen.queryByText(strings['conflict.gone'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['conflict.compare'] })).not.toBeDisabled();
    expect(writes()).toHaveLength(0);
  });

  it('a confirm open at the swap is held, then judged by the new list and sent on the new session (2b)', async () => {
    await show();
    await rowMenu(/^linear ·/, strings.turnOn);
    await confirmDialog();
    holdNewList('s2');
    await loseSession('s1');
    // hidden while the new list is unread: nothing to press, nothing sent
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    release();
    await flush();
    // the unchanged list keeps it as reviewed: it shows again, not closed as changed
    const c = await confirmDialog();
    expect(screen.queryByText(changedText)).toBeNull();
    await userEvent.click(within(c).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    const sent = calls.filter((x) => path(x) === '/mcp/servers/enable');
    expect(sent).toHaveLength(1);
    expect((sent[0]!.body as Record<string, unknown>).session_id).toBe('s2');
    expect(servers.find((v) => v.name === 'linear')!.enabled).toBe(true);
  });

  it('a switch to another place still drops the open dialog and its draft', async () => {
    hashes = { user: 'h-user-1', project: 'h-project-1', local: 'h-local-1' };
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.name']}`) }), 'files');
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByText(/^pg ·/);
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: strings.add }));
    const fresh = await screen.findByRole('dialog');
    expect((within(fresh).getByRole('textbox', { name: new RegExp(`^${strings['dlg.name']}`) }) as HTMLInputElement).value).toBe('');
    expect(writes()).toHaveLength(0);
  });
});

describe('reconnect, read at the boundary', () => {
  const press = async () => {
    await show();
    await screen.findByText(/^pg ·/);
    await userEvent.click(screen.getByRole('button', { name: strings.reconnect }));
    await flush();
  };
  it('a clean reconcile says the servers were reconnected', async () => {
    await press();
    expect(await screen.findByText(strings['reconnect.done'])).toBeInTheDocument();
  });
  it('a layer that did not load is not shown as reconnected', async () => {
    over.reconnect = () => ({ status: 200, body: reconnected({ partial_sessions: 1, warnings: ['settings.json: bad json'] }) });
    await press();
    expect(await screen.findByText(strings['reconnect.partial'])).toBeInTheDocument();
    expect(screen.queryByText(strings['reconnect.done'])).toBeNull();
  });
  it('an answer that cannot be read or contradicts itself claims nothing', async () => {
    over.reconnect = () => ({ status: 200, body: reconnected({ sessions: 1, deferred_sessions: 2 }) });
    await press();
    expect(await screen.findByText(strings['reconnect.pending'])).toBeInTheDocument();
    expect(screen.queryByText(strings['reconnect.done'])).toBeNull();
  });
});

describe('no server yet (anatomy: the section is a Widget)', () => {
  it('with no server the table says to add one above; the head keeps Add and Reconnect reachable, and an add goes through', async () => {
    servers = [];
    await show();
    expect(await screen.findByText(strings['empty.body'])).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings.reconnect }));
    await flush();
    expect(await screen.findByText(strings['reconnect.done'])).toBeInTheDocument();
    await fillAdd({ name: 'files', command: 'npx' });
    await confirmSave();
    expect(writes()[0]!.body).toMatchObject({ scope: 'user', expect_hash: 'h-user-1' });
    expect((writes()[0]!.body as { server: unknown }).server).toMatchObject({ name: 'files', command: 'npx' });
  });
});

// ---- one red-first test per class ----

const folderWith = async (srv: Srv[]) => {
  servers = srv;
  hashes = { user: 'h-user-1', project: 'h-project-1', local: 'h-local-1' };
  await show();
  await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
  await flush();
};
const projectPg: Srv = { name: 'pg', scope: 'project', transport: 'stdio', enabled: true, command: 'npx', args: ['-y', '@mcp/pg'], env_keys: [], header_keys: [] };
const editArgs = async (to: string) => {
  await rowMenu(/^pg ·/, strings.edit);
  const dlg = await screen.findByRole('dialog');
  const args = within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.args']}`) });
  await userEvent.clear(args);
  await userEvent.type(args, to);
  await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
  await confirmSave();
};

describe('class 1: a confirmation binds to the merged entry and every layer', () => {
  it('a newer list showing ANOTHER layer changed closes the open confirm; nothing is sent', async () => {
    await folderWith([projectPg]);
    await rowMenu(/^pg ·/, strings.remove);
    await confirmDialog();
    bump('user');
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('another layer changed and not read yet: the read just before the send sees it, and nothing is sent', async () => {
    await folderWith([projectPg]);
    await rowMenu(/^pg ·/, strings.remove);
    const c = await confirmDialog();
    bump('user');
    await userEvent.click(within(c).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
  });

  it('a lost add is not proved by a matching entry that is off (it asked for on)', async () => {
    over.upsert = () => {
      servers = [...servers, { name: 'files', scope: 'user', transport: 'stdio', enabled: false, command: 'npx', args: [], env_keys: [], header_keys: [] }];
      bump('user');
      return { status: 0, network: true };
    };
    await show();
    await fillAdd({ name: 'files', command: 'npx' });
    await confirmSave();
    expect(held()).not.toBeNull();
    over.upsert = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(writes()).toHaveLength(1);
  });
});

describe('class 2: Compare never edits', () => {
  it('an entry now declared by another layer is shown, never reopened as an edit of that layer', async () => {
    over.upsert = (c) => {
      if (c.body?.scope !== 'project') return undefined;
      servers = servers.map((v) => (v.name === 'pg' ? { ...v, scope: 'user' } : v));
      bump('project');
      return { status: 409, body: { code: 'mcp_conflict', message: 'changed' } };
    };
    await folderWith([projectPg]);
    await editArgs('-y{enter}@mcp/pg@2');
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['conflict.compare'] }));
    const cmp = await screen.findByRole('dialog');
    expect(within(cmp).getByText(strings['conflict.otherLayer'].replace('{{scope}}', strings['scope.user']))).toBeInTheDocument();
    expect(within(cmp).queryByRole('button', { name: strings['dlg.next'] })).toBeNull();
    expect(within(cmp).queryByRole('textbox')).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('an entry that cannot be read now is never reset to an editable one', async () => {
    over.upsert = () => {
      servers = servers.filter((v) => v.name !== 'pg');
      rawExtra = [{ name: 'pg', scope: 'user', transport: 'stdio' }];
      bump('user');
      return { status: 409, body: { code: 'mcp_conflict', message: 'changed' } };
    };
    await show();
    await editArgs('-y{enter}@mcp/pg@2');
    await userEvent.click(await screen.findByRole('button', { name: strings['conflict.compare'] }));
    const cmp = await screen.findByRole('dialog');
    expect(within(cmp).getByText(strings['conflict.unreadable'])).toBeInTheDocument();
    expect(within(cmp).queryByRole('textbox')).toBeNull();
    expect(writes()).toHaveLength(1);
  });
});

describe('class 3: unknown stays unknown', () => {
  it('a 404 with no readable message on a write is held: no new session, no resend', async () => {
    over.enable = () => ({ status: 404, body: { code: 'not_found' } });
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    expect(created).toBe(1);
    expect(writes()).toHaveLength(1);
  });

  it('a 404 with a message that is neither agent answer is held, never "not in its file"', async () => {
    over.remove = () => notFound('not here');
    await show();
    await rowMenu(/^pg ·/, strings.remove);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(held()).not.toBeNull();
    expect(screen.queryByText(strings['refused.mcp_not_in_layer'])).toBeNull();
    expect(created).toBe(1);
    expect(writes()).toHaveLength(1);
  });

  it('a 404 with no readable message on the nonce starts no replacement and sends nothing', async () => {
    over.begin = () => ({ status: 404, body: { code: 'not_found', message: 7 } });
    await show();
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).toBeNull();
    expect(created).toBe(1);
    expect(writes()).toHaveLength(0);
  });

  it('a skipped background reconnect is never shown as reconnected', async () => {
    over.reconnect = () => ({ status: 200, body: reconnected({ sessions: 2, deferred_sessions: 1, deferred_started: false }) });
    await show();
    await screen.findByText(/^pg ·/);
    await userEvent.click(screen.getByRole('button', { name: strings.reconnect }));
    await flush();
    expect(await screen.findByText(strings['reconnect.skipped'])).toBeInTheDocument();
    expect(screen.queryByText(strings['reconnect.done'])).toBeNull();
  });

  it('an entry whose scope is no layer name is unreadable, never a read-only row', async () => {
    rawExtra = [{ name: 'odd', scope: 'team', transport: 'stdio', enabled: true, require_confirmation: false, connected: false, command: 'x', args: [], env_keys: [], header_keys: [] }];
    await show();
    expect(await screen.findByText(strings.unreadableRows_one.replace('{{count}}', '1').replace('{{names}}', 'odd'))).toBeInTheDocument();
    expect(screen.queryByText(/^odd ·/)).toBeNull();
  });
});

describe('class 3: a 404 read once, exactly (notFoundOf)', () => {
  const nf = (status: number, data: unknown, code: unknown = 'not_found') => ({ status, code, data });
  it.each([
    ['the agent\'s session answer', nf(404, { code: 'not_found', message: 'session not found' }), 'session_lost'],
    ['a 410', nf(410, {}, 'gone'), 'session_lost'],
    ['the agent\'s server answer', nf(404, { code: 'not_found', message: 'no such MCP server in this settings layer' }), 'server_missing'],
    ['no message', nf(404, { code: 'not_found' }), 'unknown'],
    ['a message that is not a string', nf(404, { message: 7 }), 'unknown'],
    ['a message close to the session answer', nf(404, { message: 'Session not found' }), 'unknown'],
    ['a message close to the server answer', nf(404, { message: 'no such MCP server' }), 'unknown'],
    ['another message', nf(404, { message: 'not here' }), 'unknown'],
    ['the session answer under another code (a contradiction)', nf(404, { message: 'session not found' }, 'attachment_expired'), 'unknown'],
    ['the session answer with no code', { status: 404, data: { message: 'session not found' } }, 'unknown'],
    ['no data', nf(404, undefined), 'unknown'],
    ['not a 404', nf(409, { message: 'session not found' }), null],
    ['not an error object', 'session not found', null],
  ])('%s', (_why, e, want) => {
    expect(notFoundOf(e)).toBe(want);
  });
  it('a reconnect answered by an unreadable 404 starts no replacement and claims nothing', async () => {
    over.reconnect = () => ({ status: 404, body: { code: 'not_found' } });
    await show();
    await screen.findByText(/^pg ·/);
    await userEvent.click(screen.getByRole('button', { name: strings.reconnect }));
    await flush();
    expect(await screen.findByText(strings['reconnect.pending'])).toBeInTheDocument();
    expect(created).toBe(1);
  });
  it('a list 404 under another code is a failed read, not a lost session', async () => {
    over.list = () => ({ status: 404, body: { code: 'attachment_expired' } });
    await show();
    expect(await screen.findByText(strings.loadFailed)).toBeInTheDocument();
    expect(created).toBe(1);
  });
});

describe('class 4: one recovery budget for the list and the writes', () => {
  it('a write loses s1, the replacement s2 is lost on its first list while the write waits: two sessions, then Try again', async () => {
    await show();
    await screen.findByText(/^pg ·/);
    let mints = 0;
    over.begin = (c) => {
      mints++;
      if (mints === 1) { alive.delete(String(c.body?.session_id)); return notFound('session not found'); }
      return new Promise<Reply>(() => undefined);
    };
    over.list = (c) => {
      const sid = c.url.searchParams.get('session_id');
      if (sid === 's2') { alive.delete('s2'); return notFound('session not found'); }
      return undefined;
    };
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    await flush();
    expect(created).toBe(2);
    expect(await screen.findByText(strings.lost)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
});

describe('class 5: no valid name drops from the request', () => {
  it('an env value named __proto__ is its own key in the request', async () => {
    await show();
    await fillAdd({ name: 'files', command: 'npx', env: ['__proto__', SECRET] });
    await confirmSave();
    const env = (writes()[0]!.body.server as Record<string, unknown>).env as Record<string, unknown>;
    expect(Object.keys(env)).toEqual(['__proto__']);
  });
});

// ---- the agent's settings files as its loader reads them ----
/** The settings files as the agent reads them:
 *  a file whose version is not 1 is skipped whole, with a warning, while its hash stays the same;
 *  the top-level key is matched without case and the last matching key wins (Go json, both for the entries and for the layer
 *  an entry is named from, which reads no version), but only the exact `mcp_servers` key is hashed; entries merge field by
 *  field over the lower layers (user, then project, then local). */
type Doc = Record<string, unknown>;
type Docs = Partial<Record<'user' | 'project' | 'local', Doc>>;
const LAYERS = ['user', 'project', 'local'] as const;
const entriesOf = (d: Doc): Doc[] => {
  const k = Object.keys(d).filter((x) => x.toLowerCase() === 'mcp_servers').pop();
  return k && Array.isArray(d[k]) ? (d[k] as Doc[]) : [];
};
function loaded(docs: Docs): { servers: Srv[]; hashes: Record<string, string>; warnings: string[] } {
  const merged = new Map<string, Doc>();
  const origin = new Map<string, string>();
  const warns: string[] = [];
  for (const layer of LAYERS) {
    const d = docs[layer];
    if (!d) continue;
    for (const e of entriesOf(d)) origin.set(String(e.name), layer);
    if ((d.version ?? 1) !== 1) { warns.push(`${layer} settings: unsupported version, skipped`); continue; }
    for (const e of entriesOf(d)) merged.set(String(e.name), { ...merged.get(String(e.name)), ...e });
  }
  return {
    servers: [...merged.values()].map((e) => ({
      name: String(e.name), scope: origin.get(String(e.name)) ?? '', transport: 'stdio', enabled: e.enabled !== false,
      command: String(e.command), args: (e.args as string[] | undefined) ?? [], env_keys: [], header_keys: [], require_confirmation: false,
    })),
    hashes: Object.fromEntries(LAYERS.filter((l) => docs[l]).map((l) => [l, `h:${JSON.stringify(docs[l]!.mcp_servers ?? [])}`])),
    warnings: warns,
  };
}
const setDocs = (d: Docs) => { ({ servers, hashes, warnings } = loaded(d)); };
const docsFolder = async (d: Docs) => {
  setDocs(d);
  await show();
  await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
  await flush();
};
const turnOnConfirm = async () => { await rowMenu(/^pg ·/, strings.turnOn); return confirmDialog(); };

describe('class 1: a version-only skip of an inherited layer, every hash unchanged', () => {
  // user gives arguments B, project overrides them with A, local declares the command and keeps pg off: the confirm shows A.
  const docs = (projectVersion: number): Docs => ({
    user: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx', args: ['B'] }] },
    project: { version: projectVersion, mcp_servers: [{ name: 'pg', args: ['A'] }] },
    local: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx', enabled: false }] },
  });

  it('a refreshed list closes the open Turn on confirm: nothing is sent, review again', async () => {
    await docsFolder(docs(1));
    await turnOnConfirm();
    const before = { ...hashes };
    setDocs(docs(2));
    expect(hashes).toEqual(before);
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('the read just before the send refuses it: nothing is sent, review again', async () => {
    await docsFolder(docs(1));
    const c = await turnOnConfirm();
    setDocs(docs(2));
    await userEvent.click(within(c).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
  });
});

describe('class 1: rows and hashes read apart', () => {
  // project pg inherits user arguments and is off. The first lists carry user arguments A with the hash of B (the agent loaded
  // the entries, then the file changed before it hashed it); the next lists carry B under exactly those hashes.
  const at = (args: string): Docs => ({
    user: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx', args: [args] }] },
    project: { version: 1, mcp_servers: [{ name: 'pg', enabled: false }] },
  });
  const skewed = async () => {
    const b = loaded(at('B'));
    await docsFolder(at('A'));
    hashes = b.hashes;
    await refreshList();
    expect(screen.getByText(effectRuns('npx A'))).toBeInTheDocument();
  };

  it('a refreshed list showing B closes the confirm reviewed on A: nothing is sent', async () => {
    await skewed();
    await turnOnConfirm();
    setDocs(at('B'));
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('the read just before the send shows B: nothing is sent', async () => {
    await skewed();
    const c = await turnOnConfirm();
    setDocs(at('B'));
    await userEvent.click(within(c).getByRole('button', { name: strings['on.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
  });
});

describe('class 1: an inherited state is never a proof', () => {
  it('a lost Turn off stays held when the state shown comes from an unhashed MCP_SERVERS key of another layer', async () => {
    const docs = (projectOn: boolean, x: string): Docs => ({
      user: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx', enabled: true }] },
      project: { version: 1, MCP_SERVERS: [{ name: 'pg', enabled: projectOn }] },
      local: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx' }, { name: 'x', command: x }] },
    });
    await docsFolder(docs(true, 'echo'));
    over.enable = () => ({ status: 0, network: true });
    await rowMenu(/^pg ·/, strings.turnOff);
    await flush();
    expect(held()).not.toBeNull();
    // another writer turns pg off in project's variant key (no hash covers it) and changes an unrelated local entry
    setDocs(docs(false, 'echo2'));
    over.enable = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(writes()).toHaveLength(1);
  });
});

describe('class 1: a list never proves a lost change', () => {
  it('a lost edit stays held when its arguments now come from a lower layer\'s unhashed MCP_SERVERS key', async () => {
    // user gives pg arguments A under MCP_SERVERS; project declares pg canonically without arguments, and an unrelated x
    const docs = (args: string, x: string): Docs => ({
      user: { version: 1, MCP_SERVERS: [{ name: 'pg', command: 'npx', args: [args] }] },
      project: { version: 1, mcp_servers: [{ name: 'pg', command: 'npx' }, { name: 'x', command: x }] },
    });
    await docsFolder(docs('A', 'echo'));
    over.upsert = () => ({ status: 0, network: true });
    await editArgs('B');
    await flush();
    expect(held()).not.toBeNull();
    // another writer gives user's variant key arguments B and changes only project's x: project's hash moves, pg reads B, from
    // project, while project's pg was never written
    setDocs(docs('B', 'echo2'));
    expect(servers.find((v) => v.name === 'pg')).toMatchObject({ scope: 'project', args: ['B'] });
    over.upsert = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('a lost remove stays held when a later MCP_SERVERS array hides the entry its canonical array still holds', async () => {
    const pg = { name: 'pg', command: 'npx' };
    setDocs({ user: { version: 1, mcp_servers: [pg, { name: 'x', command: 'echo' }] } });
    await show();
    over.remove = () => ({ status: 0, network: true });
    await rowMenu(/^pg ·/, strings.remove);
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['rm.confirm'] }));
    await flush();
    expect(held()).not.toBeNull();
    // another writer changes x and appends a top-level MCP_SERVERS holding only x: the loader reads that one, pg is gone with no
    // warning, the hash moves, and the canonical array still holds pg
    setDocs({ user: { version: 1, mcp_servers: [pg, { name: 'x', command: 'echo2' }], MCP_SERVERS: [{ name: 'x', command: 'echo2' }] } });
    expect(servers.map((v) => v.name)).toEqual(['x']);
    expect(warnings).toEqual([]);
    over.remove = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(held()).not.toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('the loader names an entry from a layer that declares it only under MCP_SERVERS (as mcpNamesInFile reads it)', () => {
    const l = loaded({ user: { mcp_servers: [{ name: 'pg', command: 'npx' }] }, project: { MCP_SERVERS: [{ name: 'pg', args: ['A'] }] } });
    expect(l.servers[0]).toMatchObject({ scope: 'project', args: ['A'] });
    expect(l.hashes.project).toBe('h:[]');
  });
});

// ---- import ----
const ENV_VALUE = 'sk-live-ENVVALUE-9d3f';
const HDR_VALUE = 'Bearer HDRVALUE-77ab';
const docOf = (m: Record<string, unknown>) => JSON.stringify({ mcpServers: m }, null, 2);
const DOC = docOf({
  files: { command: 'npx', args: ['-y', '@mcp/fs'], env: { FS_TOKEN: ENV_VALUE } },
  docs: { url: 'https://docs.example/mcp', headers: { Authorization: HDR_VALUE } },
});
const importCalls = () => calls.filter((c) => path(c) === '/mcp/import');
const parseCalls = () => calls.filter((c) => path(c) === '/mcp/parse');
const impRuns = (name: string, command: string) => strings['imp.effect.runs'].replace('{{name}}', name).replace('{{command}}', command).replace('{{computer}}', 'atlas');
const impSends = (name: string, host: string) => strings['imp.effect.sends'].replace('{{name}}', name).replace('{{host}}', host);
const impReplaces = (name: string) => strings['imp.effect.replaces'].replace('{{name}}', name).replace('{{scope}}', strings['scope.userRealm']);

async function openImport(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: strings.import }));
  return screen.findByRole('dialog');
}
const docBox = (dlg: HTMLElement) => within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['imp.doc']}`) });
async function paste(dlg: HTMLElement, doc: string) {
  await userEvent.click(docBox(dlg));
  await userEvent.paste(doc);
}
async function preview(dlg: HTMLElement) {
  await userEvent.click(within(dlg).getByRole('button', { name: strings['imp.preview'] }));
  await flush();
}
const reviewImport = async (dlg: HTMLElement) => { await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] })); await flush(); };
const confirmImport = async () => {
  const c = await confirmDialog();
  await userEvent.click(within(c).getByRole('button', { name: strings['imp.confirm'] }));
  await flush();
};
/** The page as markup, the paste box's own text left out (the person typed it there). */
const pageOutsideBox = (): string => {
  const c = document.documentElement.cloneNode(true) as HTMLElement;
  for (const t of c.querySelectorAll('textarea')) t.remove();
  return c.outerHTML + document.title;
};
/** Everything the page could keep after a press: storage, core's held changes and every cached read. */
const kept = (): string => JSON.stringify([
  // eslint-disable-next-line no-restricted-globals -- the test reads the browser's storage to prove the page kept no value there
  Object.entries(sessionStorage), Object.entries(localStorage), heldChanges(MCP_LOCK, { realm: R1 }),
  queryClient.getQueryCache().getAll().map((q) => q.state.data), queryClient.getMutationCache().getAll().map((m) => m.state.data),
]);

describe('import: names, never values', () => {
  it('no env or header value reaches the page outside the paste box, the logs or anything kept; only the import request carries it', async () => {
    const logged: unknown[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logged.push(a); }));
    try {
      await show();
      const dlg = await openImport();
      await paste(dlg, DOC);
      await preview(dlg);
      // the preview names what each server runs or where it sends, and its value NAMES
      expect(within(dlg).getByText(impRuns('files', 'npx -y @mcp/fs'))).toBeInTheDocument();
      expect(within(dlg).getByText(impSends('docs', 'docs.example'))).toBeInTheDocument();
      expect(within(within(dlg).getByLabelText('files')).getByText('FS_TOKEN')).toBeInTheDocument();
      expect(within(within(dlg).getByLabelText('docs')).getByText('Authorization')).toBeInTheDocument();
      expect(pageOutsideBox()).not.toContain(ENV_VALUE);
      expect(pageOutsideBox()).not.toContain(HDR_VALUE);
      await reviewImport(dlg);
      expect(pageOutsideBox()).not.toContain(ENV_VALUE);
      await confirmImport();
      expect(await screen.findByText(strings['imp.done'].replace('{{count}}', '2'))).toBeInTheDocument();
      // the paste box is gone with its dialog: no value is left anywhere on the page
      expect(document.documentElement.outerHTML).not.toContain(ENV_VALUE);
      expect(document.documentElement.outerHTML).not.toContain(HDR_VALUE);
      expect(kept()).not.toContain(ENV_VALUE);
      expect(kept()).not.toContain(HDR_VALUE);
      expect(JSON.stringify(logged)).not.toContain(ENV_VALUE);
      expect(JSON.stringify(logged)).not.toContain(HDR_VALUE);
      // the values left only in the preview's and the import's own requests
      const carrying = calls.filter((c) => JSON.stringify(c.body ?? null).includes(ENV_VALUE) || c.url.includes(ENV_VALUE));
      expect(carrying.map(path)).toEqual(['/mcp/parse', '/mcp/import']);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it('a held import records names only, never the document', async () => {
    over.import = () => ({ status: 0, network: true });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(await screen.findByText(/Check again reads the servers only/)).toBeInTheDocument();
    const h = heldChanges(MCP_LOCK, { realm: R1 });
    expect(h).toHaveLength(1);
    expect(JSON.stringify(h)).not.toContain(ENV_VALUE);
    expect(JSON.stringify(h)).not.toContain('mcpServers');
    expect(JSON.stringify(h[0]!.identity)).toContain('files');
    expect(kept()).not.toContain(ENV_VALUE);
    expect(document.documentElement.outerHTML).not.toContain(ENV_VALUE);
  });

  it('a preview that carries a value map is unreadable: nothing of it is shown and nothing can be imported', async () => {
    over.parse = () => ({ status: 200, body: { status: 'ok', dialect: 'claude', servers: [{ name: 'files', enabled: false, command: 'npx', env: { FS_TOKEN: ENV_VALUE } }], count: 1, warnings: [] } });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.unreadable'])).toBeInTheDocument();
    expect(pageOutsideBox()).not.toContain(ENV_VALUE);
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
  });

  it('a document the agent cannot read is refused in plain words, with nothing of it shown back', async () => {
    over.parse = () => ({ status: 400, body: { code: 'bad_request', message: `cannot read value ${ENV_VALUE}` } });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.refused'])).toBeInTheDocument();
    // forms-required: one entry the agent refuses (no valid name, no command, no address) refuses the whole config with the
    // same 400, so the fixed words name those causes too, not only an unreadable document.
    for (const cause of [/valid name/, /command/, /address/]) expect(within(dlg).getByText(strings['imp.refused']).textContent).toMatch(cause);
    expect(pageOutsideBox()).not.toContain(ENV_VALUE);
    expect(importCalls()).toHaveLength(0);
  });
});

describe('import: what is sent', () => {
  it('sends the document exactly as previewed, with an import nonce and the hash the person reviewed; servers land off', async () => {
    parseWarnings = ['something new the page does not know'];
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.adv.other'])).toBeInTheDocument();
    expect(within(dlg).queryByText(/something new/)).toBeNull();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    await reviewImport(dlg);
    const c = await confirmDialog();
    expect(within(c).getByText(impRuns('files', 'npx -y @mcp/fs'))).toBeInTheDocument();
    expect(within(c).getByText(impSends('docs', 'docs.example'))).toBeInTheDocument();
    expect(within(c).getByText(strings['imp.effect.off'])).toBeInTheDocument();
    await confirmImport();
    const begin = calls.filter((x) => path(x) === '/mcp/write-intents');
    expect(begin.map((x) => x.body)).toEqual([{ session_id: 's1', op: 'import', scope: 'user' }]);
    expect(importCalls()).toHaveLength(1);
    expect(importCalls()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', expect_hash: 'h-user-1', document: DOC, replace: false });
    expect(servers.filter((s) => s.name === 'files' || s.name === 'docs').map((s) => s.enabled)).toEqual([false, false]);
    expect(await screen.findByText(/^files ·/)).toBeInTheDocument();
  });

  it('a paste edited after its preview cannot be imported until it is previewed again, then sends the new text', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    // before any preview Review is off and says what it waits for; pressing it opens nothing
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toHaveAccessibleDescription(strings['imp.needPreview']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await preview(dlg);
    await userEvent.type(docBox(dlg), ' ');
    expect(within(dlg).getByText(strings['imp.stale'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toHaveAccessibleDescription(strings['imp.needPreview']);
    expect(within(dlg).queryByText(impRuns('files', 'npx -y @mcp/fs'))).toBeNull();
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(importCalls()[0]!.body.document).toBe(`${DOC} `);
    expect(parseCalls().map((x) => x.body.document)).toEqual([DOC, `${DOC} `]);
  });

  it('an empty paste is never previewed or sent', async () => {
    await show();
    const dlg = await openImport();
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.problem.empty'])).toBeInTheDocument();
    expect(parseCalls()).toHaveLength(0);
  });
});

describe('import: an expect_hash mismatch sends nothing', () => {
  it('a newer list showing the layer changed closes the open confirm; no nonce, no import', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmDialog();
    bump('user');
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    expect(importCalls()).toHaveLength(0);
  });

  it('a change the page has not read yet: the read just before the send sees it, and nothing is sent', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    bump('user');
    await confirmImport();
    expect(importCalls()).toHaveLength(0);
    expect(await screen.findByText(changedText)).toBeInTheDocument();
  });

  it('a server of a previewed name added meanwhile closes the confirm too, every hash unchanged', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmDialog();
    // another layer's spelling no hash covers can add a name: the names present must stay as reviewed
    servers = [...servers, { name: 'docs', scope: 'user', transport: 'http', enabled: true, url: 'https://elsewhere.example/mcp', env_keys: [], header_keys: [] }];
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(importCalls()).toHaveLength(0);
  });

  it('a change after that read is the agent\'s conflict: shown, nothing resent; Review again reopens the paste, to preview again', async () => {
    over.import = () => agentConflict();
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    expect(importCalls()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings['imp.reviewAgain'] }));
    const again = await screen.findByRole('dialog');
    // the paste is back in the box, hidden; Show gives it back as it was
    expect((docBox(again) as HTMLTextAreaElement).value).not.toContain(ENV_VALUE);
    await userEvent.click(within(again).getByRole('button', { name: formWords['secretInput.show'] }));
    expect((docBox(again) as HTMLTextAreaElement).value).toBe(DOC);
    // off either way: natively while the list is read again, else soft-disabled with its reason (no preview yet)
    expect(within(again).getByRole('button', { name: strings['dlg.next'] }).matches(':disabled, [aria-disabled="true"]')).toBe(true);
    expect(importCalls()).toHaveLength(1);
  });
});

describe('import: the paste box is a secret entry', () => {
  it('hides what was pasted, its own text included, until Show; a page hide empties the box and imports nothing', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    for (const v of [ENV_VALUE, HDR_VALUE]) {
      expect((docBox(dlg) as HTMLTextAreaElement).value).not.toContain(v);
      expect(document.documentElement.outerHTML).not.toContain(v);
    }
    // hidden, the box still holds the paste byte for byte: the preview reads exactly it
    await preview(dlg);
    expect(parseCalls().map((x) => x.body.document)).toEqual([DOC]);
    expect(within(dlg).getByText(impRuns('files', 'npx -y @mcp/fs'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: formWords['secretInput.show'] }));
    expect((docBox(dlg) as HTMLTextAreaElement).value).toBe(DOC);
    await userEvent.click(within(dlg).getByRole('button', { name: formWords['secretInput.hide'] }));
    expect(document.documentElement.outerHTML).not.toContain(ENV_VALUE);
    // A page hide closes the section's settings chat, but the page went away: nothing failed. The list (and the dialog
    // opened from it) stays; the box empties itself (the kit's wipe), and nothing was imported.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await flush();
    expect(closed).toEqual(['s1']);
    expect(screen.queryByText(strings['open.failed']), 'a page hide is not a failure').toBeNull();
    expect(dlg.isConnected).toBe(true);
    expect((docBox(dlg) as HTMLTextAreaElement).value).toBe('');
    for (const v of [ENV_VALUE, HDR_VALUE]) expect(document.documentElement.outerHTML).not.toContain(v);
    expect(importCalls()).toHaveLength(0);
    // Shown again (a page back from the back/forward cache): the settings chat opens again, once.
    const before = created;
    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await flush();
    expect(created).toBe(before + 1);
    expect(screen.queryByText(strings['open.failed'])).toBeNull();
  });
});

describe('import: replace', () => {
  const SAME = docOf({ pg: { command: 'node', args: ['pg.js'] }, files: { command: 'npx', args: ['@mcp/fs'] } });

  it('names the servers already saved in the layer; without Replace nothing is overwritten and the refusal says nothing was imported', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, SAME);
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.overlap'].replace('{{names}}', 'pg').replace('{{scope}}', strings['scope.userRealm']))).toBeInTheDocument();
    await reviewImport(dlg);
    const c = await confirmDialog();
    expect(within(c).queryByText(impReplaces('pg'))).toBeNull();
    await confirmImport();
    expect(importCalls()[0]!.body.replace).toBe(false);
    expect(await screen.findByText(strings['imp.refused.bad_request'])).toBeInTheDocument();
    expect(servers.find((s) => s.name === 'pg')!.command).toBe('npx');
  });

  it('with Replace the confirm names EVERY incoming server: absence from the list proves nothing about the layer', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, docOf({ pg: { command: 'node', args: ['pg.js'] }, files: { command: 'npx', args: ['@mcp/fs'] }, fresh: { command: 'uvx', args: ['x'] } }));
    await preview(dlg);
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['imp.replace'] }));
    await reviewImport(dlg);
    const c = await confirmDialog();
    for (const n of ['pg', 'files', 'fresh']) expect(within(c).getByText(impReplaces(n))).toBeInTheDocument();
    await confirmImport();
    expect(importCalls()[0]!.body.replace).toBe(true);
  });

  it('a name differing only in case from a saved one is refused before anything is sent', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, docOf({ PG: { command: 'node', args: ['pg.js'] } }));
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.block.case'].replace('{{name}}', 'PG').replace('{{existing}}', 'pg'))).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['imp.replace'] }));
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
  });
});

describe('an exact match does not hide a case-only one', () => {
  const pgUser = { name: 'pg', scope: 'user', transport: 'stdio', enabled: false, command: 'npx', args: [], env_keys: [], header_keys: [] };
  const pgProject = { name: 'PG', scope: 'project', transport: 'stdio', enabled: false, command: 'node', args: [], env_keys: [], header_keys: [] };
  it.each([['pg then PG', [pgUser, pgProject]], ['PG then pg', [pgProject, pgUser]]])('%s: importing pg into user settings is refused, Replace or not', async (_why, listed) => {
    hashes = { user: 'h-user-1', project: 'h-project-1' };
    servers = listed;
    await show();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await screen.findByText(/^PG/);
    const dlg = await openImport();
    await paste(dlg, docOf({ pg: { command: 'evil', args: [] } }));
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.block.case'].replace('{{name}}', 'pg').replace('{{existing}}', 'PG'))).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['imp.replace'] }));
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    expect(importCalls()).toHaveLength(0);
  });
});

describe('a name set in another layer', () => {
  it('is refused: that layer would override the imported entry, so nothing is sent', async () => {
    hashes = { user: 'h-user-1', project: 'h-project-1' };
    servers = [{ name: 'shop-db', scope: 'project', transport: 'stdio', enabled: true, command: 'node', args: ['db.js'], env_keys: [], header_keys: [] }];
    await show();
    await userEvent.click(screen.getByRole('radio', { name: strings['place.folder'] }));
    await flush();
    await screen.findByText(/^shop-db/);
    const dlg = await openImport();
    await paste(dlg, docOf({ 'shop-db': { command: 'evil', args: [] } }));
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.block.otherLayer'].replace('{{name}}', 'shop-db').replace('{{layer}}', strings['scope.project']))).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
    expect(calls.filter((x) => path(x) === '/mcp/write-intents')).toHaveLength(0);
    expect(importCalls()).toHaveLength(0);
  });

  it('an entry of a previewed name turned on meanwhile, every hash unchanged, closes the open confirm', async () => {
    servers = servers.map((v) => (v.name === 'pg' ? { ...v, enabled: false } : v));
    await show();
    const dlg = await openImport();
    await paste(dlg, docOf({ pg: { command: 'node', args: ['pg.js'] } }));
    await preview(dlg);
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['imp.replace'] }));
    await reviewImport(dlg);
    await confirmDialog();
    // another spelling no hash covers turns it on: the effective entry is bound, not only the hashes and the names
    servers = servers.map((v) => (v.name === 'pg' ? { ...v, enabled: true } : v));
    await refreshList();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(changedText)).toBeInTheDocument();
    expect(importCalls()).toHaveLength(0);
  });

  it('an incomplete list blocks the import', async () => {
    warnings = ['a settings layer was skipped'];
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.block.incomplete'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['dlg.next'] })).toBeDisabled();
  });
});

describe('advisories and reserved fields', () => {
  const PH_ENV = '${input:ENVSECRET-31f}';
  const PH_HDR = '${input:HDRSECRET-88c}';
  it('a value quoted by a parser warning never reaches the page outside the box, the logs or anything kept: fixed words only', async () => {
    const logged: unknown[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logged.push(a); }));
    try {
      await show();
      const dlg = await openImport();
      await paste(dlg, docOf({ files: { command: 'npx', args: [], env: { FS_TOKEN: PH_ENV } }, docs: { url: 'https://docs.example/mcp', headers: { Authorization: `Bearer ${PH_HDR}` } } }));
      await preview(dlg);
      expect(within(dlg).getByText(strings['imp.adv.unresolved'].replace('{{name}}', 'files'))).toBeInTheDocument();
      expect(within(dlg).getByText(strings['imp.adv.unresolved'].replace('{{name}}', 'docs'))).toBeInTheDocument();
      for (const v of ['ENVSECRET-31f', 'HDRSECRET-88c']) {
        expect(pageOutsideBox()).not.toContain(v);
        expect(kept()).not.toContain(v);
        expect(JSON.stringify(logged)).not.toContain(v);
      }
      await reviewImport(dlg);
      await confirmImport();
      for (const v of ['ENVSECRET-31f', 'HDRSECRET-88c']) {
        expect(document.documentElement.outerHTML).not.toContain(v);
        expect(kept()).not.toContain(v);
        expect(JSON.stringify(logged)).not.toContain(v);
      }
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
  });

  it('a paste carrying env_keys or header_keys is refused before any preview', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, docOf({ files: { command: 'npx', env: { FS_TOKEN: ENV_VALUE }, env_keys: [] } }));
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.problem.reserved'])).toBeInTheDocument();
    expect(parseCalls()).toHaveLength(0);
  });

  it('a paste that is not JSON is refused before any preview', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, '{"mcpServers": {');
    await preview(dlg);
    expect(within(dlg).getByText(strings['imp.problem.not_json'])).toBeInTheDocument();
    expect(parseCalls()).toHaveLength(0);
  });
});

describe('session loss on the secret routes, by status and code', () => {
  it('a preview whose session is gone replaces it once, through the shared budget, and previews on the new one', async () => {
    let first = true;
    over.parse = (c) => { if (first) { first = false; alive.delete(String(c.body?.session_id)); return notFound('session not found'); } return undefined; };
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(created).toBe(2);
    expect(parseCalls().map((x) => x.body.session_id)).toEqual(['s1', 's2']);
    // the section shows nothing of the old session's list while the new one loads, so the dialog goes with it (and the paste
    // with it); the person opens Import again on the new session
    expect(await screen.findByText(/^pg ·/)).toBeInTheDocument();
  });

  it('a preview losing the replacement too stops: no third session', async () => {
    over.parse = (c) => { alive.delete(String(c.body?.session_id)); return notFound('session not found'); };
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(created).toBe(2);
    expect(within(dlg).queryByText(impRuns('files', 'npx -y @mcp/fs'))).toBeNull();
  });

  it('an import whose session is gone at the write was refused before anything: replaced once and sent again with a new nonce', async () => {
    let first = true;
    over.import = (c) => { if (first) { first = false; alive.delete(String(c.body?.session_id)); return notFound('session not found'); } return undefined; };
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(importCalls().map((x) => [x.body.session_id, x.body.nonce])).toEqual([['s1', 'nonce-1'], ['s2', 'nonce-2']]);
    expect(held()).toBeNull();
    expect(await screen.findByText(/^files ·/)).toBeInTheDocument();
  });

  it('a 404 under another code on the import is held: no new session, no resend', async () => {
    over.import = () => ({ status: 404, body: { code: 'gone_elsewhere', message: 'x' } });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(await screen.findByText(/Check again reads the servers only/)).toBeInTheDocument();
    expect(created).toBe(1);
    expect(importCalls()).toHaveLength(1);
  });

  it('an add (upsert, also a secret route) whose session is gone at the write is replaced once and sent again', async () => {
    let first = true;
    over.upsert = (c) => { if (first) { first = false; alive.delete(String(c.body?.session_id)); return notFound('session not found'); } return undefined; };
    await show();
    await fillAdd({ name: 'files', command: 'npx' });
    await confirmSave();
    expect(writes().map((x) => [x.body.session_id, x.body.nonce])).toEqual([['s1', 'nonce-1'], ['s2', 'nonce-2']]);
    expect(held()).toBeNull();
  });

  it('a 404 under another code on the preview starts no new session', async () => {
    over.parse = () => ({ status: 404, body: { code: 'gone_elsewhere', message: 'x' } });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(created).toBe(1);
  });
});

describe('import: a lost answer', () => {
  it('is held as unknown: nothing is resent, no list proves it, and only Stop tracking ends the hold', async () => {
    let applied = false;
    over.import = () => (applied ? undefined : { status: 0, network: true });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(await screen.findByText(/Check again reads the servers only/)).toBeInTheDocument();
    expect(screen.queryByText(strings['imp.done'].replace('{{count}}', '2'))).toBeNull();
    // it went through after all: the servers show, under a new hash, and that still proves nothing
    applied = true;
    servers = [...servers, { name: 'files', scope: 'user', transport: 'stdio', enabled: false, command: 'npx', args: ['-y', '@mcp/fs'], env_keys: ['FS_TOKEN'], header_keys: [] }];
    bump('user');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Check again reads the servers only/)).toBeInTheDocument();
    expect(importCalls()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /^Stop tracking/ }));
    await userEvent.click(within(await confirmDialog()).getByRole('button', { name: strings['held.stopConfirm'] }));
    await flush();
    expect(screen.queryByText(/Check again reads the servers only/)).toBeNull();
    expect(importCalls()).toHaveLength(1);
  });

  it('a held change blocks a new import, as any change', async () => {
    over.import = () => ({ status: 0, network: true });
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    await screen.findByText(/Check again reads the servers only/);
    const imp = screen.getByRole('button', { name: new RegExp(`^${strings.import}`) });
    expect(imp.hasAttribute('disabled') || imp.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});

// Which tools agents get. No list (every tool) and an empty list (none) stay apart; a restricted
// server cannot be set back to every tool here (the agent keeps a list a write leaves out and refuses null), so All tools is
// off with the reason. Details reads the entry: its tools, how many agents get, and the last lines of its error output.
const toolsGroup = (dlg: HTMLElement) => within(dlg).getByRole('radiogroup', { name: new RegExp(strings['dlg.tools']) });
const upsertBody = (i = 0) => (writes().filter((c) => c.method === 'PUT')[i]!.body as { server: Record<string, unknown> }).server;
describe('the tools a server gives agents', () => {
  it('editing an unrestricted server without touching its tools sends no allowed_tools, so it keeps every tool', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    expect(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.all'] })).toBeChecked();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['dlg.confirmCalls'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect('allowed_tools' in upsertBody()).toBe(false);
    expect(servers.find((v) => v.name === 'pg')!.allowed_tools).toBeUndefined();
  });

  it('Only these tools sends the names typed; the confirm names them; None of its tools sends an empty list, never null', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    let dlg = await screen.findByRole('dialog');
    await userEvent.click(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.only'] }));
    await userEvent.type(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.toolNames']}`) }), 'query{Enter}list_tables');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    const c = await confirmDialog();
    expect(within(c).getByText(strings['save.toolsOnly'].replace('{{names}}', 'query, list_tables'))).toBeInTheDocument();
    await confirmSave();
    expect(upsertBody(0).allowed_tools).toEqual(['query', 'list_tables']);
    await flush();
    await rowMenu(/^pg ·/, strings.edit);
    dlg = await screen.findByRole('dialog');
    await userEvent.click(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.none'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    expect(within(await confirmDialog()).getByText(strings['save.toolsNone'])).toBeInTheDocument();
    await confirmSave();
    expect(upsertBody(1).allowed_tools).toEqual([]);
    expect(servers.find((v) => v.name === 'pg')!.allowed_tools).toEqual([]);
  });

  it('a restricted server: All tools is off with the reason on it; the saved names are shown; an unchanged save sends no list', async () => {
    servers[0] = { ...servers[0]!, allowed_tools: ['query'] };
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    const all = within(toolsGroup(dlg)).getByRole('radio', { name: new RegExp(`^${strings['dlg.tools.all']}`) });
    expect(all).toBeDisabled();
    expect(within(dlg).getByText(strings['dlg.tools.allLocked'])).toBeInTheDocument();
    expect(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.only'] })).toBeChecked();
    expect(within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['dlg.toolNames']}`) })).toHaveValue('query');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect('allowed_tools' in upsertBody()).toBe(false);
    expect(servers.find((v) => v.name === 'pg')!.allowed_tools).toEqual(['query']);
  });

  it('a server restricted to no tool reads as None of its tools, never as every tool', async () => {
    servers[0] = { ...servers[0]!, allowed_tools: [] };
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    expect(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.none'] })).toBeChecked();
    expect(within(toolsGroup(dlg)).getByRole('radio', { name: new RegExp(`^${strings['dlg.tools.all']}`) })).toBeDisabled();
  });

  it('Only these tools with no name typed sends nothing and says why', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(toolsGroup(dlg)).getByRole('radio', { name: strings['dlg.tools.only'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    expect(within(dlg).getByText(strings['problem.tools_empty'])).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('Details: the tools agents get, how many, and the last lines of its error output; nothing is sent', async () => {
    servers[0] = { ...servers[0]!, allowed_tools: ['query'], tool_count: 1, stderr_tail: 'warn: slow start\nerror: no PGHOST' };
    await show();
    await rowMenu(/^pg ·/, strings.details);
    const dlg = await screen.findByRole('dialog', { name: strings['details.title'].replace('{{name}}', 'pg') });
    expect(dlg).toHaveAttribute('data-hub-overlay', 'ai.mcp.details');
    expect(within(dlg).getByText(strings['tools.only'].replace('{{names}}', 'query'))).toBeInTheDocument();
    expect(within(dlg).getByText(strings['details.offers'])).toBeInTheDocument();
    expect(within(dlg).getByText(strings['details.offersCount'].replace('{{count}}', '1'))).toBeInTheDocument();
    expect(within(dlg).getByText(/error: no PGHOST/)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  // The agent matches raw names and keys the server on its list, so an edit of another field never rewrites it.
  it('editing a server whose saved list holds a comma or a name twice, without touching its tools, sends no list', async () => {
    servers[0] = { ...servers[0]!, allowed_tools: ['query,admin', 'query,admin'] };
    await show();
    await rowMenu(/^pg ·/, strings.edit);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: strings['dlg.confirmCalls'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dlg.next'] }));
    await confirmSave();
    expect('allowed_tools' in upsertBody()).toBe(false);
    expect(servers.find((v) => v.name === 'pg')!.allowed_tools).toEqual(['query,admin', 'query,admin']);
  });

  // tool_count counts the server's last build even while it is off, not connected or stopped, so Details never
  // calls that number what agents get now.
  it('Details of a server that is not connected says the count applies once it connects', async () => {
    servers[0] = { ...servers[0]!, connected: false, tool_count: 4 };
    await show();
    await rowMenu(/^pg ·/, strings.details);
    const dlg = await screen.findByRole('dialog', { name: strings['details.title'].replace('{{name}}', 'pg') });
    expect(within(dlg).getByText(strings['details.offersIdle'].replace('{{count}}', '4'))).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['details.offersCount'].replace('{{count}}', '4'))).not.toBeInTheDocument();
  });
  it('Details of a stopped server (its tools taken away) gives no count of tools agents get', async () => {
    servers[0] = { ...servers[0]!, connected: true, tool_count: 4, revoked: true, revoked_reason: 'policy changed' };
    await show();
    await rowMenu(/^pg ·/, strings.details);
    const dlg = await screen.findByRole('dialog', { name: strings['details.title'].replace('{{name}}', 'pg') });
    expect(within(dlg).getByText(strings['details.offersStopped'])).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['details.offersCount'].replace('{{count}}', '4'))).not.toBeInTheDocument();
  });

  it('Details of a server that wrote no error output says so; an unrestricted one says all its tools', async () => {
    await show();
    await rowMenu(/^pg ·/, strings.details);
    const dlg = await screen.findByRole('dialog', { name: strings['details.title'].replace('{{name}}', 'pg') });
    expect(within(dlg).getByText(strings['details.noStderr'])).toBeInTheDocument();
    expect(within(dlg).getByText(strings['tools.all'])).toBeInTheDocument();
  });
});

describe('MCP servers is kit structure (no unstructured sections)', () => {
  const head = () => screen.getByRole('heading', { level: 2, name: strings.title }).closest('header')!;
  it('the head holds the actions, Add the one primary, Import and Reconnect a quiet strip; the place a choice in a setting group', async () => {
    await show();
    expect(await screen.findByText(/^pg/)).toBeInTheDocument();
    const h = head();
    for (const n of [strings.add, strings.import, strings.reconnect]) expect(within(h).getByRole('button', { name: new RegExp(`^${n}`) })).toBeInTheDocument();
    expect(within(h).getByRole('button', { name: new RegExp(`^${strings.add}`) })).toHaveAttribute('data-variant', 'primary');
    expect(within(h).getByRole('button', { name: new RegExp(`^${strings.import}`) })).not.toHaveAttribute('data-variant', 'primary');
    expect(within(h).getByRole('group', { name: strings.more })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: strings.place }).closest('[data-setting-group]')).not.toBeNull();
    expect(screen.getByText(/^pg/).closest('table')).not.toBeNull();
  });

  it('no server: the empty state is in the table and says in one line to add one above; the actions stay in the head', async () => {
    servers = [];
    await show();
    const empty = await screen.findByText(strings['empty.body']);
    expect(strings['empty.body']).toBe('Add a server above.');
    // The table's own empty place (the kit draws no rows and no toolbar while nothing exists yet).
    const place = empty.closest<HTMLElement>('[data-dataview-empty]')!;
    expect(place).not.toBeNull();
    const h = head();
    for (const n of [strings.add, strings.import, strings.reconnect]) expect(within(h).getByRole('button', { name: new RegExp(`^${n}`) })).toBeInTheDocument();
    // No button inside the empty state: the head's are the section's only ones.
    expect(within(place).queryAllByRole('button', { name: new RegExp(`^(${strings.add}|${strings.import}|${strings.reconnect})`) })).toHaveLength(0);
  });
});

describe('import: a page hide drops every copy of the paste', () => {
  const hide = async () => { await act(async () => { window.dispatchEvent(new Event('pagehide')); }); await flush(); };
  const back = async () => { await act(async () => { window.dispatchEvent(new Event('pageshow')); }); await flush(); };
  const nextOff = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: strings['dlg.next'] }).matches(':disabled, [aria-disabled="true"]');

  it('the preview goes with the box: the same text pasted again after the hide needs a new preview', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    expect(nextOff(dlg)).toBe(false);
    await hide();
    await back();
    expect(within(dlg).queryByText(impRuns('files', 'npx -y @mcp/fs'))).toBeNull();
    await paste(dlg, DOC);
    expect(within(dlg).queryByText(impRuns('files', 'npx -y @mcp/fs')), 'no preview from before the hide').toBeNull();
    expect(nextOff(dlg)).toBe(true);
    expect(parseCalls()).toHaveLength(1);
    expect(importCalls()).toHaveLength(0);
  });

  it('a preview answer still out at the hide writes nothing', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    over.parse = () => gate.then(() => ({ status: 200, body: { status: 'ok', dialect: 'claude', servers: [{ name: 'files', enabled: false, command: 'npx', env: { FS_TOKEN: ENV_VALUE } }], count: 1, warnings: [] } }));
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['imp.preview'] }));
    await hide();
    await back();
    await paste(dlg, DOC);
    await act(async () => { release(); });
    await flush();
    expect(parseCalls()).toHaveLength(1);
    // Whatever it answered (the hide also ended the session, so here a failure), nothing of it is shown.
    for (const k of ['imp.failed', 'imp.refused', 'imp.unreadable'] as const) expect(within(dlg).queryByText(strings[k]), k).toBeNull();
    expect(within(dlg).queryByText('files'), 'no preview either').toBeNull();
    expect(nextOff(dlg)).toBe(true);
  });

  it('an open import confirm closes on the hide and sends nothing after the page is back', async () => {
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    expect(within(await confirmDialog()).getByRole('button', { name: strings['imp.confirm'] })).toBeInTheDocument();
    await hide();
    await back();
    // The toolbar's own button has the same name: no dialog is the check.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(importCalls()).toHaveLength(0);
  });

  it('a refused import kept for Review again is dropped on the hide', async () => {
    over.import = () => agentConflict();
    await show();
    const dlg = await openImport();
    await paste(dlg, DOC);
    await preview(dlg);
    await reviewImport(dlg);
    await confirmImport();
    expect(await screen.findByText(conflictText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['imp.reviewAgain'] })).toBeInTheDocument();
    await hide();
    await back();
    expect(screen.queryByRole('button', { name: strings['imp.reviewAgain'] })).toBeNull();
    expect(importCalls()).toHaveLength(1);
  });
});
