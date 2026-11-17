// Resume in a new chat, the create half (money may be spent): which runs it fits (the agent resumes only from a chat with the run's realm,
// folder, computer and account), the create sent once and proven only by its own answer (session id plus the agent's frozen
// binding), a lost answer never sent again and never read as made or as not made, and the listing fields it needs.
import { describe, expect, it } from 'vitest';
import type { Ctx, Target } from '@core';
import { createNewChatStore, newChatFits, type NewChatBody, type NewChatIo } from './newChat';
import { parseRun, type Run } from './runs';

const ACCOUNT = 'acct-1';
const OWNER = 'fp-1';
const TARGET: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const ctx = { account: ACCOUNT, realm: 'global', target: TARGET, gen: 1, page: null, view: '', vgen: 0 } as unknown as Ctx;
const run = (o: Partial<Run> = {}): Run => ({
  id: 'run-1', workflow: 'deploy', sid: 's-1', realm: 'global', state: 'failed', step: null, startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_100_000, cost: 0.5, error: 'exit 1', lastStep: 'build', resumedFrom: null, cwd: '/home/u/app',
  folder: '/home/u/app', binding: 'c1', ...o,
});
const VERSION = {
  session_protocol_version: 3,
  capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })),
};
const STATUS = { account_id: ACCOUNT, auth_active: true, owner_fingerprint: OWNER, restriction: 'none' };
const started = (sid: string, o: Record<string, unknown> = {}) => ({ session_id: sid, started: { realm_selector: 'global', computer_id: 'c1', owner_fingerprint: OWNER, ...o } });
const LOST = Object.assign(new Error('lost'), { kind: 'pending', pending: true, status: 0 });
const REFUSED = Object.assign(new Error('refused'), { kind: 'failed', status: 400, code: 'bad_request', notApplied: true });

function fakeIo(o: { status?: unknown; version?: unknown; create?: Array<unknown | Error> } = {}) {
  const sent = { creates: [] as Array<{ realm: string; body: NewChatBody; key: string }>, closes: [] as string[], reads: 0 };
  const io: NewChatIo = {
    status: async () => { sent.reads++; return o.status ?? STATUS; },
    version: async () => { sent.reads++; return o.version ?? VERSION; },
    create: async (_c, realm, body, key) => {
      sent.creates.push({ realm, body, key });
      const next = o.create && o.create.length > 0 ? o.create.shift() : started('s-new');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  // The io has no delete; a delete added back to it would be recorded here.
  Object.assign(io, { close: async (_c: unknown, _realm: unknown, sid: string) => { sent.closes.push(sid); } });
  return { io, sent };
}
let n = 0;
const keys = () => `key-${++n}`;

describe('which runs a new chat fits', () => {
  it('a run bound to the computer shown, with a folder', () => {
    expect(newChatFits(run(), TARGET)).toBe(true);
  });
  it('not a run of another computer, a local run, a run with no folder, or no computer shown', () => {
    expect(newChatFits(run({ binding: 'c2' }), TARGET)).toBe(false);
    expect(newChatFits(run({ binding: undefined }), TARGET)).toBe(false);
    expect(newChatFits(run({ folder: undefined }), TARGET)).toBe(false);
    expect(newChatFits(run(), null)).toBe(false);
  });
});

describe('the listing fields a new chat needs', () => {
  const row = (o: Record<string, unknown> = {}) => ({
    run_id: 'run-1', workflow_name: 'release', session_id: 'sess-1', started_at: '2026-11-02T10:00:00Z', finished_at: '2026-11-02T10:05:00Z',
    current_idx: 2, total_steps: 5, status: 'failed', realm: 'global', ...o,
  });
  it('keeps the exact folder and the computer binding (the display folder is still cleaned)', () => {
    const long = '/home/u/' + 'a'.repeat(300);
    const r = parseRun(row({ cwd: long, computer_binding: 'c1' }));
    expect(r?.folder).toBe(long);
    expect(r?.binding).toBe('c1');
    expect(r?.cwd).not.toBe(long);
  });
  it('a relative folder or one with a control character is no exact folder; the row is still shown', () => {
    expect(parseRun(row({ cwd: 'home/u' }))?.folder).toBeUndefined();
    expect(parseRun(row({ cwd: '/home/u\napp' }))?.folder).toBeUndefined();
    expect(parseRun(row({ cwd: '/home/../etc' }))?.folder).toBeUndefined();
    expect(parseRun(row({ cwd: '/home/u' }))).not.toBeNull();
  });
  it('a local run has no binding; a malformed binding makes the row unreadable', () => {
    expect(parseRun(row())?.binding).toBeUndefined();
    expect(parseRun(row({ computer_binding: '' }))?.binding).toBeUndefined();
    expect(parseRun(row({ computer_binding: 7 }))).toBeNull();
    expect(parseRun(row({ computer_binding: ' c1' }))).toBeNull();
  });
});

describe('the create', () => {
  it('reads the agent first, sends the create once with the run\'s realm, computer and folder, and proves it by its answer', async () => {
    const { io, sent } = fakeIo();
    const s = createNewChatStore(io, keys);
    const sid = await s.make(run(), ctx);
    expect(sid).toBe('s-new');
    expect(s.view()).toEqual({ phase: 'made', sid: 's-new' });
    expect(sent.creates).toHaveLength(1);
    expect(sent.creates[0]!.realm).toBe('global');
    expect(sent.creates[0]!.body).toEqual({
      agent: 'chat', realm: 'global', computer: 'c1', cwd: '/home/u/app', tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' },
      expected_binding: { realm: 'global', computer: 'c1', cwd: '/home/u/app' },
    });
    expect(sent.creates[0]!.key).toMatch(/^key-/);
  });
  it('an agent that is not signed in as this account, or cannot bind the computer: nothing is created', async () => {
    for (const o of [{ status: { ...STATUS, account_id: 'other' } }, { status: { ...STATUS, auth_active: false } }, { version: { session_protocol_version: 2, capabilities: [] } }]) {
      const { io, sent } = fakeIo(o);
      const s = createNewChatStore(io, keys);
      expect(await s.make(run(), ctx)).toBeNull();
      expect(s.view()).toEqual({ phase: 'refused', why: 'notReady' });
      expect(sent.creates).toHaveLength(0);
    }
  });
  it('no place (the page moved): nothing is read or sent', async () => {
    const { io, sent } = fakeIo();
    const s = createNewChatStore(io, keys);
    expect(await s.make(run(), () => null)).toBeNull();
    expect(s.view()).toEqual({ phase: 'refused', why: 'notSent' });
    expect(sent.reads + sent.creates.length).toBe(0);
  });
  it('a run this computer cannot make a chat for: nothing is read or sent', async () => {
    const { io, sent } = fakeIo();
    const s = createNewChatStore(io, keys);
    expect(await s.make(run({ binding: 'c2' }), ctx)).toBeNull();
    expect(s.view()).toEqual({ phase: 'refused', why: 'notSent' });
    expect(sent.reads + sent.creates.length).toBe(0);
  });
  it('a refusal the agent proved: nothing was made; another try uses a new key', async () => {
    const { io, sent } = fakeIo({ create: [REFUSED] });
    const s = createNewChatStore(io, keys);
    expect(await s.make(run(), ctx)).toBeNull();
    expect(s.view()).toEqual({ phase: 'refused', why: 'refused' });
    expect(s.offers()).toBe(true);
    expect(await s.make(run(), ctx)).toBe('s-new');
    expect(new Set(sent.creates.map((c) => c.key)).size).toBe(2);
  });
  it('a lost answer is unsure: never sent again, never read as made, and offered again only after Stop tracking', async () => {
    const { io, sent } = fakeIo({ create: [LOST] });
    const s = createNewChatStore(io, keys);
    expect(await s.make(run(), ctx)).toBeNull();
    expect(s.view()).toEqual({ phase: 'unsure' });
    expect(s.offers()).toBe(false);
    expect(await s.make(run(), ctx)).toBeNull();
    expect(sent.creates).toHaveLength(1);
    s.clear();
    expect(s.view()).toEqual({ phase: 'unsure' });
    s.forget();
    expect(s.view()).toEqual({ phase: 'idle' });
    expect(s.offers()).toBe(true);
  });
  it('an answer naming another binding: not this place; that chat is never used and never deleted (the answer does not prove it is ours)', async () => {
    for (const o of [{ computer_id: 'c2' }, { realm_selector: 'aaaaaaaaaaaaaaaaaaaaaaa1' }, { owner_fingerprint: 'fp-2' }]) {
      const { io, sent } = fakeIo({ create: [started('s-x', o)] });
      const s = createNewChatStore(io, keys);
      expect(await s.make(run(), ctx)).toBeNull();
      expect(s.view()).toEqual({ phase: 'refused', why: 'binding' });
      expect(sent.closes).toEqual([]);
    }
  });
  it('an answer without the binding evidence, or without a session id, proves nothing: unsure, and nothing is deleted', async () => {
    for (const ans of [{ session_id: 's-x' }, { session_id: 's-x', started: { realm_selector: 'global', computer_id: 'c1' } }, { started: started('').started }, null]) {
      const { io, sent } = fakeIo({ create: [ans] });
      const s = createNewChatStore(io, keys);
      expect(await s.make(run(), ctx)).toBeNull();
      expect(s.view()).toEqual({ phase: 'unsure' });
      expect(sent.creates).toHaveLength(1);
      expect(sent.closes).toEqual([]);
    }
  });
  it('an unproven answer naming a chat that already exists (in use elsewhere) never deletes it', async () => {
    const { io, sent } = fakeIo({ create: [{ session_id: 's-existing', started: { realm_selector: 'global', container_id: 'c1', owner_fingerprint: OWNER } }] });
    const s = createNewChatStore(io, keys);
    expect(await s.make(run(), ctx)).toBeNull();
    expect(s.view()).toEqual({ phase: 'unsure' });
    await Promise.resolve(); await Promise.resolve();
    expect(sent.closes).toEqual([]);
  });
  it('one create at a time: a second make while the first is out sends nothing', async () => {
    let release: (v: unknown) => void = () => {};
    const sent: string[] = [];
    const io: NewChatIo = {
      status: async () => STATUS, version: async () => VERSION,
      create: (_c, _r, _b, key) => { sent.push(key); return new Promise((res) => { release = res; }); },
    };
    const s = createNewChatStore(io, keys);
    const first = s.make(run(), ctx);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(await s.make(run(), ctx)).toBeNull();
    release(started('s-new'));
    expect(await first).toBe('s-new');
    expect(sent).toHaveLength(1);
  });
});
