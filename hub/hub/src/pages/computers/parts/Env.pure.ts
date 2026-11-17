// A computer's environment variables after it was made (Overview > Environment variables): the rules, the routes
// and the source table of parts/Env.tsx.
//   - Values are write-only here: the read's answer has every value nulled at the response boundary (scrubEnvValues,
//     the same on the answer of each change), so a value the computer holds never reaches the page, its cache or a
//     log. The page lists names, and sends a new value, a replacement, or a removal.
//   - One send per variable (PUT /computers/:id/env/:key with {value}, DELETE /computers/:id/env/:key): the API's
//     bulk PUT takes a free map of names, which no declared route can carry.
//   - Each send is made once (C9). A lost answer is kept under the computer's one environment lock until a fresh
//     read shows it (a new name now listed, a removed name gone) or the person stops tracking it. A replaced value
//     cannot be told from a read (values are never read), so only the person frees that one.
//   - The names and values a person may send follow the create form's rules (create-logic parseEnv), one line each.
import { coreSource, defineRoute, type HeldChange, type SourceTable } from '@core';
import { LIMITS, parseEnv } from '../create-logic';

export const ENV_LOCK = 'computer.env';
/** The fixed codes a refusal of an environment change may keep (the routes are secret: nothing else of it is kept). */
export const ENV_CODES = ['ENV_UNREPRESENTABLE', 'ENV_BLOCK_TOO_LARGE', 'ENV_REVISION_EXHAUSTED', 'COMPUTER_EXPIRED', 'SUBSERVER_DORMANT', 'computer_quarantined'] as const;

export const envRoutes = Object.freeze({
  read: defineRoute({ method: 'GET', path: '/computers/:id/env', scope: 'realm', secret: true }),
  set: defineRoute({ method: 'PUT', path: '/computers/:id/env/:key', scope: 'realm', secret: true, codes: ENV_CODES, body: ['value'] }),
  remove: defineRoute({ method: 'DELETE', path: '/computers/:id/env/:key', scope: 'realm', secret: true, codes: ENV_CODES }),
});

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Every value of an environment answer becomes null before anything else sees the answer; the names stay. An answer
 *  whose map is not where it is expected throws: core then settles the call SCRUB_FAILED and keeps no answer, so
 *  values in a shape this does not know never reach the query cache. */
export function scrubEnvValues(answer: unknown): void {
  const vars = rec(rec(rec(answer)?.data)?.environment_vars);
  if (!vars) throw new Error('env answer without its map');
  for (const k of Object.keys(vars)) vars[k] = null;
}

/** What the page keeps of a read: the names, and whether the computer has not taken the last change yet. */
export interface EnvState { computer: string; names: string[]; syncing: boolean }
/** An answer without the map is not "no variables": it throws, and the read shows as failed. */
export function envStateOf(raw: unknown, computer: string): EnvState {
  const data = rec(rec(raw)?.data);
  const vars = rec(data?.environment_vars);
  if (!vars) throw new Error('env answer without its map');
  return { computer, names: Object.keys(vars).sort(), syncing: rec(data?.env_sync)?.pending === true };
}

/** What the person asked of a listed variable: a new value, or its removal. */
export type EnvEdit = { kind: 'replace'; value: string } | { kind: 'remove' };
/** One send. `fresh`: the name was not listed when it was sent (a read can then show it). */
export interface EnvStep { act: 'set' | 'remove'; name: string; value?: string; fresh?: boolean }
export interface EnvProblem { code: string; name: string }

function valueProblem(name: string, value: string): string | null {
  // The name goes into the address as typed: the create form's parser would trim it first.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'envKeyShape';
  if (/[\r\n]/.test(value)) return 'envValueUnicode';
  const one = parseEnv(`${name}=${value}`);
  if (one.errors[0]) return one.errors[0].code;
  // A line the create form would skip (a name that starts with #) is never a variable.
  return one.count === 1 ? null : 'envKeyShape';
}

/**
 * The sends an edit asks for, new values first and removals last, or the first thing wrong with it (then nothing is
 * sent). `rows` are the new variables typed; a row with neither a name nor a value is not there.
 */
export function planOf(names: readonly string[], edits: Readonly<Record<string, EnvEdit>>, rows: readonly { key: string; value: string }[]): { steps: EnvStep[]; problem: EnvProblem | null } {
  const sets: EnvStep[] = [];
  const removes: EnvStep[] = [];
  const listed = new Set(names);
  for (const name of names) {
    // An own entry only: a variable may be named constructor, toString or __proto__.
    const e = Object.hasOwn(edits, name) ? edits[name] : undefined;
    if (!e) continue;
    if (e.kind === 'remove') removes.push({ act: 'remove', name });
    else {
      const code = valueProblem(name, e.value);
      if (code) return { steps: [], problem: { code, name } };
      sets.push({ act: 'set', name, value: e.value });
    }
  }
  const typed = new Set<string>();
  for (const r of rows) {
    if (r.key === '' && r.value === '') continue;
    if (listed.has(r.key)) return { steps: [], problem: { code: 'listed', name: r.key } };
    if (typed.has(r.key)) return { steps: [], problem: { code: 'envDuplicate', name: r.key } };
    const code = valueProblem(r.key, r.value);
    if (code) return { steps: [], problem: { code, name: r.key } };
    typed.add(r.key);
    sets.push({ act: 'set', name: r.key, value: r.value, fresh: true });
  }
  if (names.length - removes.length + typed.size > LIMITS.envEntries) return { steps: [], problem: { code: 'envTooMany', name: '' } };
  return { steps: [...sets, ...removes], problem: null };
}

/** What one Save did, name by name. `stop`: the send that ended it early: refused by the API, refused by the Hub
 *  before sending ('notSent', then its name is in `notSent` too), or its answer lost ('unknown'). */
export interface EnvReport {
  saved: string[];
  removed: string[];
  stop: { act: 'set' | 'remove'; name: string; kind: 'refused' | 'unknown' | 'notSent'; code: string | null } | null;
  notSent: string[];
}

/**
 * Sends the steps in order, each once, and stops at the first that does not end done. `live` is asked before every
 * send: when the place the Save started in is gone (another session or realm), the rest is not sent.
 */
export async function runSteps(steps: readonly EnvStep[], send: (st: EnvStep) => Promise<{ outcome: string; code?: string }>, live: () => boolean): Promise<EnvReport> {
  const saved: string[] = [];
  const removed: string[] = [];
  for (let n = 0; n < steps.length; n++) {
    const st = steps[n];
    if (!st) break;
    if (!live()) return { saved, removed, stop: null, notSent: steps.slice(n).map((x) => x.name) };
    const r = await send(st);
    if (r.outcome === 'done') {
      (st.act === 'set' ? saved : removed).push(st.name);
      continue;
    }
    // 'failed': the API refused it. 'not_sent': the Hub refused it before sending. Anything else: its answer is not known.
    const kind = r.outcome === 'failed' ? 'refused' : r.outcome === 'not_sent' ? 'notSent' : 'unknown';
    return { saved, removed, stop: { act: st.act, name: st.name, kind, code: r.code ?? null }, notSent: steps.slice(kind === 'notSent' ? n : n + 1).map((x) => x.name) };
  }
  return { saved, removed, stop: null, notSent: [] };
}

type Answers = readonly (readonly unknown[])[];
/** A lost send is shown by a fresh read of that computer: a new name now listed, or a removed name gone. A replaced
 *  value, and a name still listed after its removal was sent, prove nothing. */
export function stepProved(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; act?: string; name?: string; fresh?: boolean };
  const read = (answers[0] ?? []).filter((x): x is EnvState => rec(x)?.computer === i.computer && Array.isArray(rec(x)?.names));
  const last = read[read.length - 1];
  if (!last || !i.name) return undefined;
  if (i.act === 'remove') return last.names.includes(i.name) ? undefined : 'applied';
  return i.act === 'set' && i.fresh === true && last.names.includes(i.name) ? 'applied' : undefined;
}

/** `id` the computer. The value rides only the one PUT: never in the lock key or the identity. */
export interface EnvStepVars extends EnvStep { id: string }
const identityOf = (v: EnvStepVars) => ({ computer: v.id, act: v.act, name: v.name, fresh: v.fresh === true });

export const envTable: SourceTable = {
  reads: {
    env: { route: envRoutes.read, input: (p: { id: string }) => ({ params: { id: p.id }, scrub: scrubEnvValues }), select: (raw, p: { id: string }): EnvState => envStateOf(raw, p.id), staleTime: 0 },
  },
  changes: {
    envSet: {
      route: envRoutes.set,
      input: (v: EnvStepVars) => ({ params: { id: v.id, key: v.name }, body: { value: v.value ?? '' }, scrub: scrubEnvValues }),
      select: () => undefined,
      reads: ['env'],
      lock: ENV_LOCK,
      lockKey: (v: EnvStepVars) => ({ computer: v.id }),
      identity: identityOf,
      // A computer is the same computer in every realm view: a lost send shows, and keeps Save off, in each of them.
      acrossRealms: true,
      proves: stepProved,
    },
    envRemove: {
      route: envRoutes.remove,
      input: (v: EnvStepVars) => ({ params: { id: v.id, key: v.name }, scrub: scrubEnvValues }),
      select: () => undefined,
      reads: ['env'],
      lock: ENV_LOCK,
      lockKey: (v: EnvStepVars) => ({ computer: v.id }),
      identity: identityOf,
      // A computer is the same computer in every realm view: a lost send shows, and keeps Save off, in each of them.
      acrossRealms: true,
      proves: stepProved,
    },
  },
};

const source = coreSource('computers', envTable);
export const useEnv = (id: string, enabled: boolean) => source.useQuery<EnvState, { id: string }>('env', { id }, { enabled });
export const useEnvSet = () => source.useMutation<unknown, EnvStepVars>('envSet');
export const useEnvRemove = () => source.useMutation<unknown, EnvStepVars>('envRemove');
/** Whether this page sent the change a lock shows (another page's is only read here). */
export const envHeldBy = (key: 'envSet' | 'envRemove', h: HeldChange): 'self' | 'other' | undefined => source.heldBy(key, h);
