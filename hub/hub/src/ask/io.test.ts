// Vitest: pages reach Ask's agent IO only through @ask/io (data.ts + logic.ts, no React). Two additive
// changes for the GitHub install: an optional `model` on the create body and a `stop` command. Ask's own requests
// stay byte for byte what they were: the create body with no options and the message command.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';

const sent = vi.hoisted(() => ({ fail: null as unknown, calls: [] as { route: { method: string; path: string; body?: readonly string[]; idem?: boolean }; opts: Record<string, unknown> }[] }));
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  capture: () => ({}),
  api: (route: never, opts: Record<string, unknown>) => {
    sent.calls.push({ route, opts });
    const f = sent.fail;
    sent.fail = null;
    // A session create reads /version first (gatedCreate): the gateway binds a session to its computer.
    if (route && (route as { path?: string }).path === '/version') return Promise.resolve({ session_protocol_version: 3, capabilities: [{ name: 'computer_binding', supported: true, available: true }] });
    return f ? Promise.reject(f) : Promise.resolve({});
  },
}));

import * as io from './io';
import * as data from './data';
import * as logic from './logic';
import * as attach from './attach';
import * as attachio from './attachio';
import * as pauseBus from './pauseBus';

const T = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24) } } as never;
const bytes = (o: unknown) => JSON.stringify(o);
const last = () => sent.calls[sent.calls.length - 1]!;

beforeEach(() => void (sent.calls.length = 0));

describe('Ask\'s existing requests are unchanged, byte for byte', () => {
  it('the create body with no options is today\'s, byte for byte; follow_realm_backend is never sent', () => {
    expect(bytes(logic.createBody('global', 'c1'))).toBe(
      '{"realm":"global","computer":"c1","tool_mode":"standard","dir_scope":"home","approval":{"mode":"default"},"expected_binding":{"realm":"global","computer":"c1"}}',
    );
    expect(data.routes.create.body).not.toContain('follow_realm_backend');
  });

  it('create and the message command send the same body, key and route as before', async () => {
    const live = data.liveIO(T);
    await live.create(logic.createBody('global', 'c1')!, 'k1', 'global');
    expect(last().route).toBe(data.routes.create);
    expect(last().opts.idem).toBe('k1');
    expect(bytes(last().opts.body)).toBe(bytes(logic.createBody('global', 'c1')));
    await live.command('s1', 'hi', 'k3', 'global');
    expect(last().route).toBe(data.routes.command);
    expect(last().opts.params).toEqual({ id: 's1' });
    expect(last().opts.idem).toBe('k3');
    expect(bytes(last().opts.body)).toBe('{"kind":"message","text":"hi","on_gate":"wait"}');
  });
});

describe('an optional model on the create body', () => {
  it('is added last, only when given, and the route accepts it', () => {
    const b = logic.createBody('global', 'c1', { model: 'hoody-ai/hoody-free' });
    expect(b?.model).toBe('hoody-ai/hoody-free');
    expect(Object.keys(b!).at(-1)).toBe('model');
    expect(bytes({ ...b, model: undefined })).toBe(bytes(logic.createBody('global', 'c1')));
    for (const k of Object.keys(b!)) expect(data.routes.create.body).toContain(k);
  });

  it('refuses a model that is not provider/model (nothing is built)', () => {
    for (const m of ['', 'hoody-free', '/x', 'x/', 'a b/c', 'a/b c', 'a/b\n', 'x'.repeat(65) + '/m', 'p/' + 'm'.repeat(200), 7, null, {}]) {
      expect(logic.createBody('global', 'c1', { model: m as string }), String(m)).toBeNull();
    }
  });
});

describe('the explicit create body', () => {
  const full = (o: logic.CreateOpts) => bytes(logic.createBody('global', 'c1', o));
  it('a Hoody chat: agent, model, folder (asserted in the binding), Strict, helper approvals, in wire order', () => {
    expect(full({ agent: 'general', model: 'hoody-ai/hoody-free', cwd: '/home/u/app', strict: true, helperGates: true })).toBe(
      '{"realm":"global","computer":"c1","agent":"general","tool_mode":"standard","dir_scope":"home","cwd":"/home/u/app","approval":{"mode":"always"},"helper_gates":true,"expected_binding":{"realm":"global","computer":"c1","cwd":"/home/u/app"},"model":"hoody-ai/hoody-free"}',
    );
  });
  it('a Claude Code chat: backend acp + delegated_agent claude, its model only when chosen, never a Hoody model', () => {
    expect(full({ agent: 'chat', claude: { model: '' }, helperGates: true })).toBe(
      '{"realm":"global","computer":"c1","agent":"chat","tool_mode":"standard","dir_scope":"home","backend":"acp","delegated_agent":"claude","approval":{"mode":"default"},"helper_gates":true,"expected_binding":{"realm":"global","computer":"c1"}}',
    );
    expect(logic.createBody('global', 'c1', { claude: { model: 'anthropic/claude-sonnet-5-5' } })).toMatchObject({ backend: 'acp', delegated_agent: 'claude', delegated_model: 'anthropic/claude-sonnet-5-5' });
    expect(logic.createBody('global', 'c1', { claude: { model: '' }, model: 'hoody-ai/hoody-free' })).toBeNull();
  });
  it('every field it can send is on the create route\'s body list', () => {
    const b = logic.createBody('global', 'c1', { agent: 'a', claude: { model: 'p/m' }, cwd: '/x', strict: true, helperGates: true })!;
    for (const k of Object.keys(b)) expect(data.routes.create.body).toContain(k);
  });
  it('refuses an agent name, a folder or a Claude model it cannot vouch for (nothing is built)', () => {
    for (const agent of ['', ' a', 'a b', '-a', 'x'.repeat(65)]) expect(logic.createBody('global', 'c1', { agent }), agent).toBeNull();
    for (const cwd of ['', 'rel', '/a/../b', '/a\u0000b', '/' + 'x'.repeat(4096)]) expect(logic.createBody('global', 'c1', { cwd }), cwd).toBeNull();
    expect(logic.createBody('global', 'c1', { claude: { model: 'sonnet' } })).toBeNull();
  });
});

describe('a stop command', () => {
  it('sends {kind:"stop"} on the command route with its own key, and nothing else', async () => {
    await data.liveIO(T).stop('s1', 'k9', 'global');
    expect(sent.calls).toHaveLength(1);
    expect(last().route).toBe(data.routes.command);
    expect(last().route.idem).toBeTruthy();
    expect(last().opts.params).toEqual({ id: 's1' });
    expect(last().opts.idem).toBe('k9');
    expect(last().opts.realm).toBe('global');
    expect(last().opts.recovers).toBe(true);
    expect(bytes(last().opts.body)).toBe('{"kind":"stop"}');
    for (const k of Object.keys(last().opts.body as object)) expect(data.routes.command.body).toContain(k);
  });
  it('a lost answer comes back to the caller as it is (pending), with nothing sent again', async () => {
    const lost = { status: 0, pending: true };
    sent.fail = lost;
    await expect(data.liveIO(T).stop('s1', 'k9', 'global')).rejects.toBe(lost);
    expect(sent.calls).toHaveLength(1);
  });
});

describe('@ask/io is data.ts and logic.ts, plus the journal door the GitHub run uses and the attachment rules', () => {
  it('re-exports exactly their exports', () => {
    // The journal's part is named, not starred: the held door and its guard (production), two test helpers (tests only).
    const journal = ['held', 'heldVerdict', 'guardIO', 'SendToken', 'bindDestForTests', 'resetPageForTests', 'readBotMessage', 'classifyBotMessage', 'botMessageByKey'];
    // The AI tab composer's files: the dock's own rules as one namespace, and its two browser reads, named.
    const files = ['attach', 'readFiles', 'revoke'];
    // The computer's pause_state, read-only: the bus's subscribe door, the one name a page may take from pauseBus.
    const pause = ['subscribePause'];
    const want = new Set([...Object.keys(data), ...Object.keys(logic), ...journal, ...files, ...pause]);
    expect(new Set(Object.keys(io))).toEqual(want);
    for (const [k, v] of Object.entries(io)) if (!journal.includes(k) && !files.includes(k) && !pause.includes(k)) expect(v).toBe((data as Record<string, unknown>)[k] ?? (logic as Record<string, unknown>)[k]);
    expect({ ...(io.attach as object) }).toEqual({ ...attach });
    expect(io.readFiles).toBe(attachio.readFiles);
    expect(io.revoke).toBe(attachio.revoke);
    expect(io.subscribePause).toBe(pauseBus.subscribePause);
    expect(Object.keys(io).filter((k) => k.toLowerCase().includes('pause'))).toEqual(['subscribePause']);
  });
  it('is what the alias @ask/io resolves to (tsconfig paths and vite resolve.alias)', async () => {
    expect(await import('@ask/io')).toBe(io);
  });
  it('imports nothing but ./data, ./logic, the journal, the Bot message read (./recover), the attachment rules (./attach, ./attachio) and the pause bus (./pauseBus)', () => {
    const text = readFileSync(join(import.meta.dirname, 'io.ts'), 'utf8');
    const specs = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(['./data', './logic', './journal', './journal/pageReset', './recover', './attach', './attachio', './pauseBus']).toContain(s);
    expect(text).not.toMatch(/\bimport\s*\(|require\(/);
  });
});
