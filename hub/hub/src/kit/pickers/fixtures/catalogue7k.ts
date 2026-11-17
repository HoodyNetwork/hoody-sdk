// The real chat catalogue as a fixture: 206 providers and 7,078 chat models, the agent's own providers.json read the
// way GET /providers and GET /models answer. catalogue7k-chat.json is the compact form
// [id, name, prefix, methods, [[suffix] | [suffix, label]…]] (a label equal to its suffix is left out). Every other
// field the agent sends is the same on every row; a provider is ready (included) when its methods say so, else it
// needs a key.
//
// catalogue7k(scenario) gives what the computer's agent answers for one scenario: the version, providers, models,
// ready-list (models?ready=true), per-provider auth probe and Claude Code (GET /acp/agents) reads, as fixture answers
// ({status, body}). Pure data: a page's fixtures wire them to their routes; tests read them directly.
import compact from './catalogue7k-chat.json?raw';

type Methods = string[];
type CompactRow = [id: string, name: string, prefix: string, methods: Methods, models: Array<[string] | [string, string]>];

export interface FixtureProvider {
  id: string;
  prefix: string;
  display_name: string;
  custom: boolean;
  model_count: number;
  /** Absent on an older agent (no provider status: the Hub then trusts no ready list). */
  status?: {
    state: 'ready' | 'needs_key' | 'unknown';
    via: string | null;
    methods: Methods;
    alternatives: Record<string, boolean>;
    output_cap: boolean;
    shares_with: string[];
  };
}

export interface FixtureModel {
  spec: string;
  display_name: string;
  source: 'provider' | 'fusion';
  members?: string[];
}

/** A fixture answer, in the shape the fake transport takes (core/transport.ts `answers`). */
export type Answer<T> = { status: 200; body: T } | { status: number; body: { error: string } };

export interface AgentReads {
  version: Answer<{ api_version?: string; supported?: string[]; available?: string[]; pinned_realm: null }>;
  providers: Answer<{ providers: FixtureProvider[]; status: 'ok' }>;
  models: Answer<{ models: FixtureModel[]; status: 'ok' }>;
  ready: Answer<{ models: FixtureModel[]; status: 'ok' }>;
  /** GET /providers/:id/auth, the probe an older agent answers (one per provider). */
  auth: (pid: string) => Answer<{ auth: { ready: boolean; api_key_stored: boolean; no_auth_ready: boolean } }>;
  /** GET /acp/agents (Claude Code). */
  acp: Answer<unknown>;
}

export const SCENARIOS = [
  'freeOnly',
  'threeReady',
  'readyReadFailed',
  'catalogueFailed',
  'olderAgent',
  'manyCustom',
  'manyReady',
  'manyEnsembles',
  'claudeRows',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** The size of the real catalogue: chat providers and chat models. */
export const CATALOGUE7K = { providers: 206, models: 7078 } as const;

/** An answer's body when it is a 200, else null (a refusal). */
export const okBody = <T>(a: Answer<T>): T | null => (a.status === 200 ? (a.body as T) : null);

const ok = <T>(body: T): Answer<T> => ({ status: 200, body });
const refused = (status: number, error: string): Answer<never> => ({ status, body: { error } });

const status = (state: 'ready' | 'needs_key' | 'unknown', via: string | null, methods: Methods): FixtureProvider['status'] => ({
  state,
  via,
  methods,
  alternatives: {},
  output_cap: true,
  shares_with: [],
});

interface Base {
  providers: FixtureProvider[];
  models: FixtureModel[];
}

/** The compact rows, parsed once per file: base() only reads them (and copies what it hands out). */
let parsed: readonly CompactRow[] | undefined;
const compactRows = (): readonly CompactRow[] => (parsed ??= JSON.parse(compact) as CompactRow[]);

/** The real catalogue as the agent sends it today (only Hoody AI ready). A fresh copy on each call. */
function base(): Base {
  const providers: FixtureProvider[] = [];
  const models: FixtureModel[] = [];
  for (const [id, name, prefix, methods, list] of compactRows()) {
    const included = methods.includes('included');
    providers.push({
      id,
      prefix,
      display_name: name,
      custom: false,
      model_count: list.length,
      status: included ? status('ready', 'included', [...methods]) : status('needs_key', null, [...methods]),
    });
    for (const [suffix, label] of list) models.push({ spec: prefix + suffix, display_name: label ?? suffix, source: 'provider' });
  }
  return { providers, models };
}

const prefixOf = (spec: string) => spec.slice(0, spec.indexOf('/'));

/** Mark providers ready by a stored key (state ready, via stored_key). */
function setReady(b: Base, ids: ReadonlySet<string>) {
  for (const p of b.providers) if (ids.has(p.id) && p.status) p.status = status('ready', 'stored_key', p.status.methods);
}

/** The providers with the most models, in catalogue order among equals (Hoody AI excluded: it is ready anyway). */
function biggest(b: Base, n: number): string[] {
  return b.providers
    .filter((p) => p.id !== 'hoody-ai')
    .map((p, i) => ({ id: p.id, n: p.model_count, i }))
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .slice(0, n)
    .map((x) => x.id);
}

/** The three-ready overlay: Hoody AI ready; OpenAI ready, every other model on the ready list (the rest
 *  can't tell); DeepSeek ready; Mistral's state unknown; every other provider needs a key. */
function threeReady(b: Base): string[] {
  setReady(b, new Set(['openai', 'deepseek']));
  for (const p of b.providers) if (p.id === 'mistral' && p.status) p.status = status('unknown', null, p.status.methods);
  const openai = b.models.filter((m) => prefixOf(m.spec) === 'openai');
  const half = new Set(openai.filter((_, i) => i % 2 === 0).map((m) => m.spec));
  return b.models.filter((m) => ['hoody-ai', 'deepseek'].includes(prefixOf(m.spec)) || half.has(m.spec)).map((m) => m.spec);
}

/** `n` providers ready by a key (the biggest ones), each with exactly `per` models on the ready list (the rest
 *  can't tell), plus Hoody Free. A provider with fewer than `per` models gets scenario-only ones (`<prefix>extra-NN`)
 *  so the shape is exact. */
function manyReady(b: Base, n: number, per: number): string[] {
  const ids = biggest(b, n);
  setReady(b, new Set(ids));
  const out = ['hoody-ai/hoody-free'];
  for (const id of ids) {
    const p = b.providers.find((x) => x.id === id)!;
    for (let i = p.model_count + 1; i <= per; i++) b.models.push({ spec: `${p.prefix}extra-${String(i).padStart(2, '0')}`, display_name: `${p.display_name} extra ${i}`, source: 'provider' });
    p.model_count = Math.max(p.model_count, per);
    out.push(...b.models.filter((m) => prefixOf(m.spec) === id).slice(0, per).map((m) => m.spec));
  }
  return out;
}

const pick = (b: Base, specs: readonly string[]) => {
  const want = new Set(specs);
  return b.models.filter((m) => want.has(m.spec));
};

/** Claude Code's model set as the agent lists it (family, version): ids claude-<family>-<v>, labels '<Family> <v>'. */
const CLAUDE_MODELS: ReadonlyArray<[string, string]> = [
  ['opus', '5.5'],
  ['sonnet', '5.5'],
  ['haiku', '5.5'],
  ['fable', '5.1'],
];


function authOf(b: Base, readySpecs: readonly string[]): AgentReads['auth'] {
  const keyed = new Set(readySpecs.map(prefixOf));
  return (pid) => {
    const p = b.providers.find((x) => x.id === pid);
    if (!p) return refused(404, 'not_found');
    const included = p.id === 'hoody-ai';
    const stored = !included && keyed.has(p.id);
    return ok({ auth: { ready: included || stored, api_key_stored: stored, no_auth_ready: included } });
  };
}

function reads(b: Base, ready: readonly string[], over: Partial<AgentReads> = {}): AgentReads {
  return {
    version: ok({ api_version: '1', supported: ['1'], available: ['1'], pinned_realm: null }),
    providers: ok({ providers: b.providers, status: 'ok' as const }),
    models: ok({ models: b.models, status: 'ok' as const }),
    ready: ok({ models: pick(b, ready), status: 'ok' as const }),
    auth: authOf(b, ready),
    acp: refused(404, 'not_found'),
    ...over,
  };
}

/** The agent's answers for one scenario (a fresh copy on each call, so a test may change it). */
export function catalogue7k(scenario: Scenario = 'freeOnly'): AgentReads {
  const b = base();
  switch (scenario) {
    case 'freeOnly':
      // Only Hoody Free is ready, 7,077 models need setup.
      return reads(b, ['hoody-ai/hoody-free']);
    case 'threeReady':
      return reads(b, threeReady(b));
    case 'readyReadFailed': {
      // 30 providers ready by a key, but the ready read failed: nothing can be proven ready.
      const ready = manyReady(b, 30, 50);
      return reads(b, ready, { ready: refused(503, 'unavailable') });
    }
    case 'catalogueFailed':
      // A settled failure of the models read (the providers answered): only fallback specs are usable.
      return reads(b, ['hoody-ai/hoody-free'], { models: refused(503, 'unavailable'), ready: refused(503, 'unavailable') });
    case 'olderAgent': {
      // An agent without provider status: the Hub trusts no ready list and probes credentials.
      const ready = threeReady(b);
      for (const p of b.providers) delete p.status;
      return reads(b, ready, { version: ok({ pinned_realm: null }) });
    }
    case 'manyCustom': {
      // 300 custom endpoints that need their key (Needs attention), two models each.
      for (let i = 1; i <= 300; i++) {
        const id = `endpoint-${String(i).padStart(3, '0')}`;
        b.providers.push({ id, prefix: `${id}/`, display_name: `Endpoint ${i}`, custom: true, model_count: 2, status: status('needs_key', null, ['api_key']) });
        b.models.push({ spec: `${id}/chat`, display_name: `Endpoint ${i} chat`, source: 'provider' }, { spec: `${id}/fast`, display_name: `Endpoint ${i} fast`, source: 'provider' });
      }
      return reads(b, ['hoody-ai/hoody-free']);
    }
    case 'manyReady':
      // 40 ready providers with 50 ready models each.
      return reads(b, manyReady(b, 40, 50));
    case 'manyEnsembles': {
      // 40 ensembles over the three-ready overlay: the even-numbered ones on the ready list, the odd ones not.
      const ready = threeReady(b);
      const members = ['hoody-ai/hoody-free', ...ready.filter((s) => s.startsWith('deepseek/')).slice(0, 2)];
      const ens: FixtureModel[] = [];
      for (let i = 1; i <= 40; i++) ens.push({ spec: `fusion/ensemble-${String(i).padStart(2, '0')}`, display_name: `Ensemble ${i}`, source: 'fusion', members });
      b.models.push(...ens);
      return reads(b, [...ready, ...ens.filter((_, i) => (i + 1) % 2 === 0).map((e) => e.spec)]);
    }
    case 'claudeRows':
      // Claude Code on and startable, with the agent's model and effort set.
      return reads(b, threeReady(b), {
        acp: ok({
          report: { agents: [{ name: 'claude', installed: true, enabled: true, startable: true }] },
          claude_code: {
            models: CLAUDE_MODELS.map(([family, v]) => ({ id: `claude-${family}-${v.replace('.', '-')}`, label: `${family[0]!.toUpperCase()}${family.slice(1)} ${v}` })),
            aliases: ['opus', 'sonnet'],
            efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
          },
        }),
      });
  }
}
