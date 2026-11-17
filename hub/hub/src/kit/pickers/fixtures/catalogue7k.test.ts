import { describe, expect, it } from 'vitest';
import { CATALOGUE7K, SCENARIOS, catalogue7k, type AgentReads, type FixtureModel, type FixtureProvider } from './catalogue7k';

const body = <T>(a: { status: number; body: unknown }): T => {
  expect(a.status).toBe(200);
  return a.body as T;
};
const providersOf = (r: AgentReads) => body<{ providers: FixtureProvider[] }>(r.providers).providers;
const modelsOf = (r: AgentReads) => body<{ models: FixtureModel[] }>(r.models).models;
const readyOf = (r: AgentReads) => body<{ models: FixtureModel[] }>(r.ready).models.map((m) => m.spec);
const stateOf = (r: AgentReads, id: string) => providersOf(r).find((p) => p.id === id)?.status?.state;

describe('catalogue7k fixture', () => {
  it('expands to the real chat catalogue: 206 providers, 7,078 models, grouped by provider', () => {
    const r = catalogue7k('freeOnly');
    const providers = providersOf(r);
    const models = modelsOf(r);
    expect(providers).toHaveLength(CATALOGUE7K.providers);
    expect(models).toHaveLength(CATALOGUE7K.models);
    expect(new Set(models.map((m) => m.spec)).size).toBe(CATALOGUE7K.models);
    // Every model belongs to a listed provider, and each provider's count is its own rows.
    const count = new Map<string, number>();
    for (const m of models) {
      const p = providers.find((x) => m.spec.startsWith(x.prefix));
      expect(p, m.spec).toBeDefined();
      count.set(p!.id, (count.get(p!.id) ?? 0) + 1);
    }
    for (const p of providers) expect(count.get(p.id) ?? 0, p.id).toBe(p.model_count);
    // 205 providers take an API key.
    expect(providers.filter((p) => p.status?.methods.includes('api_key'))).toHaveLength(205);
  });

  it('freeOnly: only Hoody Free is ready', () => {
    const r = catalogue7k('freeOnly');
    expect(readyOf(r)).toEqual(['hoody-ai/hoody-free']);
    expect(providersOf(r).filter((p) => p.status?.state === 'ready').map((p) => p.id)).toEqual(['hoody-ai']);
    expect(r.acp.status).toBe(404);
  });

  it('threeReady: OpenAI half proven, DeepSeek whole, Mistral unknown', () => {
    const r = catalogue7k('threeReady');
    const ready = readyOf(r);
    expect(stateOf(r, 'openai')).toBe('ready');
    expect(stateOf(r, 'deepseek')).toBe('ready');
    expect(stateOf(r, 'mistral')).toBe('unknown');
    expect(stateOf(r, 'anthropic')).toBe('needs_key');
    expect(ready.filter((s) => s.startsWith('openai/'))).toHaveLength(44);
    expect(ready.filter((s) => s.startsWith('deepseek/'))).toHaveLength(4);
    expect(ready).toContain('hoody-ai/hoody-free');
    expect(ready.some((s) => s.startsWith('mistral/'))).toBe(false);
  });

  it('readyReadFailed and catalogueFailed refuse the reads they name', () => {
    const a = catalogue7k('readyReadFailed');
    expect(a.ready).toEqual({ status: 503, body: { error: 'unavailable' } });
    expect(providersOf(a).filter((p) => p.status?.state === 'ready')).toHaveLength(31);
    const b = catalogue7k('catalogueFailed');
    expect(b.models.status).toBe(503);
    expect(b.ready.status).toBe(503);
    expect(providersOf(b)).toHaveLength(206);
  });

  it('olderAgent: providers carry no status; the auth probe answers per provider', () => {
    const r = catalogue7k('olderAgent');
    expect(providersOf(r).every((p) => p.status === undefined)).toBe(true);
    expect(body<{ auth: { ready: boolean } }>(r.auth('hoody-ai')).auth).toMatchObject({ ready: true, no_auth_ready: true });
    expect(body<{ auth: { ready: boolean } }>(r.auth('openai')).auth).toMatchObject({ ready: true, api_key_stored: true });
    expect(body<{ auth: { ready: boolean } }>(r.auth('anthropic')).auth).toMatchObject({ ready: false, api_key_stored: false });
    expect(r.auth('nope').status).toBe(404);
  });

  it('manyCustom, manyReady and manyEnsembles grow the catalogue as named', () => {
    const c = catalogue7k('manyCustom');
    expect(providersOf(c).filter((p) => p.custom)).toHaveLength(300);
    expect(modelsOf(c)).toHaveLength(CATALOGUE7K.models + 600);
    const m = catalogue7k('manyReady');
    expect(providersOf(m).filter((p) => p.status?.via === 'stored_key')).toHaveLength(40);
    // Exactly 50 ready models for each of the 40 providers (scenario-only ones fill the smaller ones), plus Hoody Free.
    expect(readyOf(m)).toHaveLength(2001);
    for (const p of providersOf(m).filter((x) => x.status?.via === 'stored_key')) {
      expect(readyOf(m).filter((s) => s.startsWith(p.prefix)), p.id).toHaveLength(50);
      expect(modelsOf(m).filter((x) => x.spec.startsWith(p.prefix)), p.id).toHaveLength(p.model_count);
    }
    const e = catalogue7k('manyEnsembles');
    const ens = modelsOf(e).filter((x) => x.source === 'fusion');
    expect(ens).toHaveLength(40);
    expect(ens.every((x) => x.members?.length === 3)).toBe(true);
    expect(readyOf(e).filter((s) => s.startsWith('fusion/'))).toEqual(
      Array.from({ length: 20 }, (_, i) => `fusion/ensemble-${String((i + 1) * 2).padStart(2, '0')}`),
    );
  });

  it('claudeRows: Claude Code is on and startable with its model and effort set', () => {
    const r = catalogue7k('claudeRows');
    const acp = body<{ report: { agents: Array<{ name: string; startable: boolean }> }; claude_code: { models: unknown[]; efforts: string[] } }>(r.acp);
    expect(acp.report.agents[0]).toMatchObject({ name: 'claude', startable: true });
    expect(acp.claude_code.models).toHaveLength(4);
    expect(acp.claude_code.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('keeps the success envelope (status ok) the agent sends on the catalogue reads', () => {
    const r = catalogue7k('freeOnly');
    for (const a of [r.providers, r.models, r.ready]) expect(body<{ status: string }>(a).status).toBe('ok');
  });

  it('gives a fresh copy on each call, for every scenario: a change to one call never reaches the next', () => {
    for (const s of SCENARIOS) {
      const a = catalogue7k(s);
      a.providers.body = { error: 'changed' };
      (a.version.body as Record<string, unknown>).api_version = 'changed';
      ((a.version.body as { supported?: string[] }).supported ?? []).push('changed');
      (a.acp.body as Record<string, unknown>).error = 'changed';
      const b = catalogue7k(s);
      expect(b.providers.status === 200 && providersOf(b).length).toBeGreaterThan(0);
      expect((b.version.body as Record<string, unknown>).api_version, s).not.toBe('changed');
      expect((b.version.body as { supported?: string[] }).supported ?? [], s).not.toContain('changed');
      expect((b.acp.body as Record<string, unknown>).error, s).not.toBe('changed');
    }
  });
});
