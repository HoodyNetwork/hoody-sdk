// core agent: a conversation's settings are read from the agent's own fields; a change is "saved" only when the
// read-back shows it (a lost answer or an unchanged read is never saved, and nothing is sent twice); Claude Code's
// models and efforts come only from the agent's report (an older agent offers Claude's default only); the rows
// show ensembles only where they run, and effort only for a reasoning model or Claude Code with efforts.
import { describe, expect, it } from 'vitest';
import { catalogue } from '../providers/catalogue';
import type { Outcome, Settled } from '../providers/types';
import { applyDraft, confirmField, createFields, modelOf, readSettings, saveField, settingsOf, type AgentApi } from './api';
import { agentChoices, effortOffered, reasoningOf } from './choices';
import { claudeModelOf, claudeSetOf, claudeSpec } from './claude';

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: Outcome['kind'], status = 0, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

/** A fake agent: `row` is the conversation as GET /sessions/{id} answers, changed by `apply` when a write lands. */
function fake(row: Record<string, unknown>, opts: { write?: Settled<unknown>; lands?: boolean; yolo?: boolean } = {}) {
  const sent: string[] = [];
  let yolo = opts.yolo ?? false;
  const land = (k: string, v: unknown) => {
    if (opts.lands === false) return;
    if (k === 'yolo') yolo = v as boolean;
    else row[k] = v;
  };
  const write = (k: string, v: unknown) => {
    sent.push(`${k}=${String(v)}`);
    land(k, v);
    return Promise.resolve(opts.write ?? ok({ status: 'ok' }));
  };
  const api: AgentApi = {
    session: () => Promise.resolve(ok({ session: { ...row } })),
    approval: () => Promise.resolve(ok({ mode: 'default', locked: false, revision: 0, yolo })),
    setEffort: (_id, e) => write('effort', e),
    setVerbosity: (_id, l) => write('verbosity', l),
    setYolo: (_id, on) => write('yolo', on),
    acp: () => Promise.resolve(ok({})),
  };
  return { api, sent };
}

const LIVE = { id: 's1', model: 'hoody-ai/hoody-free', verbosity: 'normal' };

describe('settingsOf', () => {
  it('reads a live Hoody conversation: no effort field means the model default', () => {
    expect(settingsOf('s1', ok({ session: LIVE }), ok({ mode: 'default', locked: false, revision: 0, yolo: true }))).toEqual({
      id: 's1', fresh: false, backend: 'hoody', model: 'hoody-ai/hoody-free', effort: '', verbosity: 'normal', yolo: true,
    });
  });

  it('a conversation that is not live reports no effort or reply length: both stay unknown', () => {
    const s = settingsOf('s1', ok({ session: { id: 's1', model: 'x/y' } }), null);
    expect(s).toMatchObject({ effort: null, verbosity: null, yolo: null });
  });

  it('reads a Claude Code conversation as claude-code specs, with its live effort', () => {
    const s = settingsOf('s1', ok({ session: { id: 's1', model: 'anthropic/x', backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'sonnet', effort: 'high', verbosity: 'terse' } }), null);
    expect(s).toMatchObject({ backend: 'claude_code', model: 'claude-code/sonnet', effort: 'high', verbosity: 'terse' });
    const d = settingsOf('s1', ok({ session: { id: 's1', backend_kind: 'acp', delegated_agent: 'claude' } }), null);
    expect(d?.model).toBe('claude-code');
  });

  it('a dormant Claude Code conversation\'s effort stays unknown: delegated_effort is never the live effort', () => {
    const s = settingsOf('s1', ok({ session: { id: 's1', backend_kind: 'acp', delegated_agent: 'claude', delegated_effort: 'high' } }), null);
    expect(s).toMatchObject({ effort: null, verbosity: null });
    const live = settingsOf('s1', ok({ session: { id: 's1', backend_kind: 'acp', delegated_agent: 'claude', delegated_effort: 'high', verbosity: 'normal' } }), null);
    expect(live?.effort).toBe('');
  });

  it('Check again never confirms an effort from a dormant read', async () => {
    const f = fake({ id: 's1', backend_kind: 'acp', delegated_agent: 'claude', delegated_effort: 'high' });
    expect((await confirmField(f.api, 's1', { field: 'effort', value: 'high' })).state).toBe('not_confirmed');
  });

  it('refuses another conversation\'s answer and odd values', () => {
    expect(settingsOf('s1', ok({ session: { id: 's2' } }), null)).toBeNull();
    // The agent always sends the row's id: a row without one is not this conversation either.
    expect(settingsOf('s1', ok({ session: { model: 'x/y', verbosity: 'normal' } }), null)).toBeNull();
    expect(settingsOf('s1', err('failed', 404), null)).toBeNull();
    const s = settingsOf('s1', ok({ session: { id: 's1', effort: 'turbo', verbosity: 'loud', started: false } }), ok({ yolo: 'yes' }));
    expect(s).toMatchObject({ fresh: true, effort: null, verbosity: null, yolo: null });
  });
});

describe('saveField', () => {
  it('saved only when the read-back shows the value, sent once', async () => {
    const f = fake({ ...LIVE });
    const r = await saveField(f.api, 's1', { field: 'verbosity', value: 'concise' });
    expect(r.state).toBe('saved');
    expect(f.sent).toEqual(['verbosity=concise']);
  });

  it('an accepted change the read-back does not show is not confirmed, never saved', async () => {
    const f = fake({ ...LIVE }, { lands: false });
    expect((await saveField(f.api, 's1', { field: 'effort', value: 'high' })).state).toBe('not_confirmed');
  });

  it('a lost answer reads back; one that landed is saved, nothing is resent', async () => {
    const f = fake({ ...LIVE }, { write: err('pending') });
    const r = await saveField(f.api, 's1', { field: 'yolo', value: true });
    expect(r.state).toBe('saved');
    expect(f.sent).toEqual(['yolo=true']);
  });

  it('a definite refusal is failed with its code; a stale answer ends quietly', async () => {
    const f = fake({ ...LIVE }, { write: err('failed', 409, 'approval_policy_locked'), lands: false });
    const r = await saveField(f.api, 's1', { field: 'yolo', value: true });
    expect(r).toMatchObject({ state: 'failed', err: { code: 'approval_policy_locked' } });
    const g = fake({ ...LIVE }, { write: err('stale') });
    expect((await saveField(g.api, 's1', { field: 'yolo', value: true })).state).toBe('stale');
  });

  it('Check again sends nothing', async () => {
    const f = fake({ ...LIVE, effort: 'low' });
    expect((await confirmField(f.api, 's1', { field: 'effort', value: 'low' })).state).toBe('saved');
    expect(f.sent).toEqual([]);
  });

  it('readSettings reports a failed conversation read', async () => {
    const f = fake({ ...LIVE });
    f.api.session = () => Promise.resolve(err('failed', 500));
    const r = await readSettings(f.api, 's1');
    expect(r.settings).toBeNull();
    expect(r.err).not.toBeNull();
  });
});

describe('applyDraft', () => {
  it('reads the new conversation and sends each draft value it does not show, Normal included, each confirmed', async () => {
    // The computer's reply-length default is Terse: a draft showing Normal must still be sent.
    const f = fake({ ...LIVE, verbosity: 'terse' });
    const out = await applyDraft(f.api, 's1', { effort: 'max', verbosity: 'normal', yolo: true });
    expect(f.sent).toEqual(['effort=max', 'verbosity=normal', 'yolo=true']);
    expect(out.map((o) => o.result.state)).toEqual(['saved', 'saved', 'saved']);
  });

  it('sends nothing the conversation already shows', async () => {
    const f = fake({ ...LIVE, verbosity: 'terse' });
    expect(await applyDraft(f.api, 's1', { effort: '', verbosity: 'terse', yolo: false })).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  it('an inherited effort is cleared when the draft says the model default', async () => {
    const f = fake({ ...LIVE, effort: 'high' });
    await applyDraft(f.api, 's1', { effort: '', verbosity: 'normal', yolo: false });
    expect(f.sent).toEqual(['effort=']);
  });

  it('a failed read sends every draft value once', async () => {
    const f = fake({ ...LIVE });
    const real = f.api.session;
    let first = true;
    f.api.session = (id) => {
      if (first) {
        first = false;
        return Promise.resolve(err('failed', 500));
      }
      return real(id);
    };
    await applyDraft(f.api, 's1', { effort: '', verbosity: 'normal', yolo: false });
    expect(f.sent).toEqual(['effort=', 'verbosity=normal', 'yolo=false']);
  });
});

describe('Claude Code set', () => {
  const report = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) => ok({ status: 'ok', report: { agents: [{ name: 'claude', ...row }] }, ...extra });

  it('an older agent (no claude_code field) offers Claude\'s default only, with no efforts', () => {
    expect(claudeSetOf(report({ enabled: true, startable: true }))).toEqual({ state: 'ready', models: [], efforts: [] });
  });

  it('reads the agent\'s models, aliases and efforts, keeps only route levels, drops odd ids and cleans labels', () => {
    const set = claudeSetOf(report({ enabled: true, startable: false }, {
      claude_code: {
        models: [{ id: 'claude-opus-4-8', label: 'Claude\u0000 Opus\u202e 4.8' }, { id: '../x', label: 'bad' }, 'claude-sonnet-4-5[1m]', { id: 'claude-opus-4-8', label: 'dup' }],
        aliases: ['opus', 'OPUS'],
        efforts: ['max', 'turbo', 'low'],
      },
    }));
    expect(set.state).toBe('setup');
    expect(set.models).toEqual([
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-5[1m]', label: 'claude-sonnet-4-5[1m]' },
      { id: 'opus', label: 'opus' },
    ]);
    expect(set.efforts).toEqual(['low', 'max']);
  });

  it('reads the field only where the agent sends it, beside the report', () => {
    expect(claudeSetOf(report({ enabled: true, startable: true, claude_code: { efforts: ['high'] } })).efforts).toEqual([]);
    expect(claudeSetOf(report({ enabled: true, startable: true }, { claude_code: { efforts: ['high'] } })).efforts).toEqual(['high']);
  });

  it('no claude row or a 404 is absent; a failed read is unknown', () => {
    expect(claudeSetOf(ok({ report: { agents: [] } })).state).toBe('absent');
    expect(claudeSetOf(err('failed', 404, 'unknown_agent')).state).toBe('absent');
    expect(claudeSetOf(err('failed', 500)).state).toBe('unknown');
  });

  it('specs round-trip; other specs are not Claude Code picks', () => {
    expect(claudeSpec('')).toBe('claude-code');
    expect(claudeModelOf(claudeSpec('opus'))).toBe('opus');
    expect(claudeModelOf('claude-code/../x')).toBeNull();
    expect(claudeModelOf('anthropic/claude-x')).toBeNull();
  });
});

describe('models and create', () => {
  it('modelOf and createFields: Claude Code runs as backend acp, Hoody models ride model only', () => {
    expect(createFields(modelOf('hoody-ai/hoody-free')!)).toEqual({ model: 'hoody-ai/hoody-free' });
    expect(createFields(modelOf('claude-code')!)).toEqual({ backend: 'acp', delegated_agent: 'claude' });
    expect(createFields(modelOf('claude-code/opus')!)).toEqual({ backend: 'acp', delegated_agent: 'claude', model: 'opus' });
    expect(modelOf('claude-codex/x')).toBeNull();
    expect(modelOf('nonsense')).toBeNull();
  });
});

describe('agentChoices', () => {
  const cat = catalogue({
    providers: { providers: [{ id: 'hoody-ai', display_name: 'Hoody AI', status: { state: 'ready' } }, { id: 'openai', display_name: 'OpenAI', status: { state: 'needs_key' } }] },
    models: { models: [
      { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
      { spec: 'openai/o9', display_name: 'O9', reasoning: true },
      { spec: 'fusion/duo', display_name: 'Duo', source: 'fusion', members: ['hoody-ai/hoody-free'] },
    ] },
    ready: { models: [{ spec: 'hoody-ai/hoody-free' }] },
  });
  const names = { model: 'A model', provider: 'The AI provider', claude: 'Claude Code', claudeDefault: 'Claude default' };
  const claude = { state: 'ready' as const, models: [{ id: 'opus', label: 'Opus' }], efforts: ['high' as const] };

  it('ensembles only with fusion; Claude Code only when offered, its default first', () => {
    expect(agentChoices({ cat, claude, names }).map((c) => c.spec)).toEqual(['hoody-ai/hoody-free', 'openai/o9']);
    expect(agentChoices({ cat, claude, names, fusion: true }).map((c) => c.spec)).toContain('fusion/duo');
    const rows = agentChoices({ cat, claude, names, claudeCode: true });
    expect(rows.slice(-2).map((c) => [c.spec, c.label, c.source, c.ready])).toEqual([
      ['claude-code', 'Claude default', 'claude_code', 'ready'],
      ['claude-code/opus', 'Opus', 'claude_code', 'ready'],
    ]);
  });

  it('effort only for a reasoning model, or Claude Code with efforts', () => {
    const rows = agentChoices({ cat, claude, names, claudeCode: true });
    const by = (s: string) => rows.find((c) => c.spec === s);
    expect(reasoningOf(cat, 'openai/o9')).toBe(true);
    expect(effortOffered(by('openai/o9'))).toBe(true);
    expect(effortOffered(by('hoody-ai/hoody-free'))).toBe(false);
    expect(effortOffered(by('claude-code'))).toBe(true);
    const old = agentChoices({ cat, claude: { state: 'ready', models: [], efforts: [] }, names, claudeCode: true });
    expect(old.filter((c) => c.source === 'claude_code').map((c) => [c.spec, effortOffered(c)])).toEqual([['claude-code', false]]);
  });

  it('Claude Code that needs setup reads Needs setup; unknown stays unknown; absent adds nothing', () => {
    const at = (state: 'setup' | 'unknown' | 'absent') => agentChoices({ cat: null, claude: { state, models: [], efforts: [] }, names, claudeCode: true }).map((c) => c.ready);
    expect(at('setup')).toEqual(['needs_key']);
    expect(at('unknown')).toEqual(['unknown']);
    expect(at('absent')).toEqual([]);
  });
});
