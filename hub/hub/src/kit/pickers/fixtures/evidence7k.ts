// The model chooser's evidence for one catalogue7k scenario, built synchronously the way readCatalogue (core/providers/
// read.ts) builds it from the same answers: a refused providers or models read fails the part, a refused ready read
// does not (ready is withheld), an agent without provider status gets its credential probes. Fixture builds
// only (tests and the kit gallery); pages read through the chooser's hook.
import { agent, providers } from '@core';
import { catalogue7k, okBody, type Answer, type Scenario } from './catalogue7k';

type Evidence = providers.Evidence;
type Scope = providers.Scope;

export const FIXTURE_SCOPE: Scope = { account: 'acct', realm: 'global', computer: 'p|c|atlas', gen: 1, boot: 'gallery' };

const refusal = (a: Answer<unknown>): providers.Outcome => ({
  kind: 'failed',
  code: a.status === 200 ? 'failed' : String((a.body as { error?: string }).error ?? 'failed'),
  status: a.status,
  retryAfter: null,
  details: {},
});

export interface Evidence7kOptions {
  seq?: number;
  scope?: Scope;
  at?: number;
  /** Read Claude Code too (the caller offers it). */
  claude?: boolean;
  /** Change the agent's answers before they are read (a test's own overlay). */
  edit?: (r: ReturnType<typeof catalogue7k>) => void;
}

type Parts = Pick<Evidence, 'catalogue' | 'claude'>;

/** Freezes a fixture value all the way down, so a test that changes a shared one fails at once. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/** The parts of an unedited scenario, built once per scenario and Claude choice (the 7,078-model catalogue is the
 *  costly part) and frozen: they never change, and a test that tries to change them throws. */
const shared = new Map<string, Parts>();

/** One scenario's evidence. With `edit`, a fresh catalogue on each call; without it, the scenario's catalogue and Claude
 *  parts are shared and frozen (the head is fresh). `'loading'` gives the part before it settles. */
export function evidence7k(scenario: Scenario | 'loading', o: Evidence7kOptions = {}): Evidence {
  const head = { seq: o.seq ?? 1, scope: o.scope ?? FIXTURE_SCOPE, at: o.at ?? 0 };
  if (scenario === 'loading' || o.edit) return { ...head, ...parts(scenario, o) };
  const key = `${scenario}|${o.claude ? 1 : 0}`;
  let p = shared.get(key);
  if (!p) shared.set(key, (p = deepFreeze(parts(scenario, o))));
  return { ...head, ...p };
}

function parts(scenario: Scenario | 'loading', o: Evidence7kOptions): Parts {
  const claudePart = (r: ReturnType<typeof catalogue7k>): Evidence['claude'] => {
    if (!o.claude) return null;
    const acp = r.acp;
    const settled: providers.Settled<unknown> = acp.status === 200 ? { ok: true, body: acp.body } : { ok: false, err: refusal(acp) };
    return { state: 'ok', value: agent.claudeSetOf(settled) };
  };
  if (scenario === 'loading') return { catalogue: { state: 'loading' }, claude: o.claude ? { state: 'loading' } : null };
  const r = catalogue7k(scenario);
  o.edit?.(r);
  const p = okBody(r.providers);
  const m = okBody(r.models);
  if (!p) return { catalogue: { state: 'failed', err: refusal(r.providers) }, claude: claudePart(r) };
  if (!m) return { catalogue: { state: 'failed', err: refusal(r.models) }, claude: claudePart(r) };
  const ready = okBody(r.ready);
  const base = providers.catalogue({ providers: p, models: m, ready: ready ?? undefined });
  if (base.am1) return { catalogue: { state: 'ok', value: { cat: base, ready: ready ? 'ok' : 'failed', sig: providers.catalogueSig(base) } }, claude: claudePart(r) };
  const auth: Record<string, providers.AuthBody> = {};
  for (const id of providers.probeSet(base, [])) {
    const a = r.auth(id);
    if (a.status === 200) auth[id] = a.body as providers.AuthBody;
  }
  const cat = providers.catalogue({ providers: p, models: m, auth });
  return { catalogue: { state: 'ok', value: { cat, ready: 'legacy', sig: providers.catalogueSig(cat) } }, claude: claudePart(r) };
}
