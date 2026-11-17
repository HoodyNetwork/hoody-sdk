// core agent live: the conversation read as Live (busy from state/pending_gate, the fixed fields), one change
// sent once and not decided (busy refusals, lost answers, `persisted` only from an answer), and the agents a chat may
// switch to (never the product's own).
import { describe, expect, it, vi } from 'vitest';
import { agentNamesOf, liveOf, sendLive, type LiveApi } from './live';

const calls = vi.hoisted(() => [] as Array<{ path: string; body: unknown; write: boolean }>);
vi.mock('../providers/call', () => ({
  call: (route: { path: string }, input: { body?: unknown }, write: boolean) => {
    calls.push({ path: route.path, body: input.body, write });
    return Promise.resolve({ ok: true, body: { status: 'ok' } });
  },
}));

type S = Parameters<typeof liveOf>[1];
const ok = (body: unknown): S => ({ ok: true, body });
const err = (kind: 'failed' | 'pending' | 'stale' | 'not_sent', code = ''): S => ({ ok: false, err: { kind, code, status: kind === 'failed' ? 409 : 0, retryAfter: null, details: {} } });
const row = (extra: Record<string, unknown> = {}) => ok({ session: { id: 's1', model: 'hoody-ai/hoody-free', agent: 'general', state: 'idle', cwd: '/w', ...extra } });

function api(answer: S, seen: string[] = []): LiveApi {
  return {
    session: () => Promise.resolve(row()),
    setModel: (_id, m) => {
      seen.push(`model=${m}`);
      return Promise.resolve(answer);
    },
    setAgent: (_id, a) => {
      seen.push(`agent=${a}`);
      return Promise.resolve(answer);
    },
  };
}

describe('liveOf', () => {
  it('busy: running, parked or a waiting gate; idle is not busy; an unknown state is not known', () => {
    expect(liveOf('s1', row({ state: 'running' }))!.busy).toBe(true);
    expect(liveOf('s1', row({ state: 'parked' }))!.busy).toBe(true);
    expect(liveOf('s1', row({ state: 'idle', pending_gate: true }))!.busy).toBe(true);
    expect(liveOf('s1', row({ state: 'idle' }))!.busy).toBe(false);
    expect(liveOf('s1', row({ state: undefined }))!.busy).toBeNull();
  });

  it('fixed fields as reported; tool mode standard when omitted; a realm only when well formed', () => {
    const l = liveOf('s1', row({ dir_scope: 'full', realm: '0123456789abcdef01234567' }))!;
    expect(l.fixed).toEqual({ folder: '/w', backend: 'hoody', dirScope: 'full', toolMode: 'standard', realm: '0123456789abcdef01234567' });
    expect(liveOf('s1', row({ realm: 'Work' }))!.fixed.realm).toBeNull();
  });

  it('only this conversation\'s row: another id, no id, or an id of another type is not taken', () => {
    expect(liveOf('s1', row())).not.toBeNull();
    expect(liveOf('s1', row({ id: 's2' }))).toBeNull();
    expect(liveOf('s1', row({ id: undefined }))).toBeNull();
    expect(liveOf('s1', row({ id: 1 }))).toBeNull();
    expect(liveOf('s1', ok({ session: { model: 'hoody-ai/hoody-free', state: 'idle' } }))).toBeNull();
  });

  it('a Claude Code chat: its model as claude-code/<id>; another conversation or a failed read is null', () => {
    expect(liveOf('s1', row({ backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'opus' }))!.model).toBe('claude-code/opus');
    expect(liveOf('s1', row({ id: 's2' }))).toBeNull();
    expect(liveOf('s1', err('failed'))).toBeNull();
  });
});

describe('sendLive', () => {
  it('409 gate_parked / turn_in_flight are busy; another refusal is failed', async () => {
    expect(await sendLive(api(err('failed', 'gate_parked')), 's1', { field: 'model', value: 'a/b' }, 'hoody')).toEqual({ state: 'busy', code: 'gate_parked' });
    expect(await sendLive(api(err('failed', 'turn_in_flight')), 's1', { field: 'agent', value: 'x' }, 'hoody')).toEqual({ state: 'busy', code: 'turn_in_flight' });
    expect((await sendLive(api(err('failed', 'model_unavailable')), 's1', { field: 'model', value: 'a/b' }, 'hoody')).state).toBe('failed');
  });

  it('persisted only from an answer; a lost answer is unknown; deferred only for the agent', async () => {
    expect(await sendLive(api(ok({ status: 'ok', persisted: false, scope: 'session' })), 's1', { field: 'model', value: 'a/b' }, 'hoody')).toEqual({ state: 'sent', persisted: false, defaultChanged: false, deferred: false });
    expect(await sendLive(api(err('pending')), 's1', { field: 'model', value: 'a/b' }, 'hoody')).toEqual({ state: 'unknown' });
    expect(await sendLive(api(ok({ status: 'ok', deferred: true })), 's1', { field: 'agent', value: 'x' }, 'hoody')).toEqual({ state: 'sent', persisted: null, defaultChanged: false, deferred: true });
    expect(await sendLive(api(err('stale')), 's1', { field: 'agent', value: 'x' }, 'hoody')).toEqual({ state: 'stale' });
  });

  it('a Claude Code chat sends the model id; Claude\'s default is never sent', async () => {
    const seen: string[] = [];
    await sendLive(api(ok({ status: 'ok' }), seen), 's1', { field: 'model', value: 'claude-code/opus' }, 'claude_code');
    const r = await sendLive(api(ok({ status: 'ok' }), seen), 's1', { field: 'model', value: 'claude-code' }, 'claude_code');
    expect(seen).toEqual(['model=opus']);
    expect(r.state).toBe('failed');
  });
});

describe('the session-only model switch', () => {
  it('the model is sent with scope "session"; the agent switch carries no scope', async () => {
    calls.length = 0;
    // The test setup has loaded core already; a fresh copy of this module takes the mocked call.
    vi.resetModules();
    const live = (await import('./live')).liveApi();
    await live.setModel('s1', 'a/b');
    await live.setAgent('s1', 'x');
    expect(calls).toEqual([
      { path: '/sessions/:id/model', body: { model: 'a/b', scope: 'session' }, write: true },
      { path: '/sessions/:id/agent', body: { agent: 'x' }, write: true },
    ]);
  });

  it('the scope echo decides defaultChanged: session no, agent yes; none or another value is unknown (never "changed"); never on Claude Code', async () => {
    const m = { field: 'model' as const, value: 'a/b' };
    const dc = async (body: Record<string, unknown>, backend: 'hoody' | 'claude_code' = 'hoody') => {
      const r = await sendLive(api(ok({ status: 'ok', ...body })), 's1', backend === 'claude_code' ? { field: 'model', value: 'claude-code/opus' } : m, backend);
      return r.state === 'sent' ? r.defaultChanged : 'not sent';
    };
    expect(await dc({ scope: 'session' })).toBe(false);
    expect(await dc({})).toBeNull();
    expect(await dc({ scope: 'agent' })).toBe(true);
    expect(await dc({ scope: '' })).toBeNull();
    expect(await dc({ scope: 'galaxy' })).toBeNull();
    expect(await dc({}, 'claude_code')).toBe(false);
  });
});

describe('agentNamesOf', () => {
  it('drops bot, script-writer and product-owned rows; a malformed row makes it unreadable', () => {
    expect(agentNamesOf(ok({ items: [{ name: 'chat' }, { name: 'bot' }, { name: 'script-writer' }, { name: 'x', provenance: 'product-owned (read-only)' }, { name: 'general' }] }))).toEqual(['chat', 'general']);
    expect(agentNamesOf(ok({ items: [{ name: 'Bad Name' }] }))).toBeNull();
    expect(agentNamesOf(err('failed'))).toBeNull();
  });
});
