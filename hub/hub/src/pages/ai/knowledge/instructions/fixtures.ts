// Knowledge → Instructions in fixture mode (dev and shots): one {text, enabled, revision} per computer and realm. A save
// checks the revision it carries and answers the instructions after the write; `save` makes every save a revision_conflict (another
// writer came first) or a lost answer (it may have been saved).
import { answers, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { instructionsRoutes } from './routes';

const SEED = 'Answer in English.\nKeep pull requests small and explain why a change is needed.\nRun the tests before you say a change is done.';
const THEIRS = 'Answer in English.\nKeep pull requests small.\nAsk before you add a dependency.';

// The agent's 409 with its details (answers.refused carries a code only).
const conflict = (rev: string): FixtureAnswer => ({ status: 409, body: { code: 'revision_conflict', message: 'revision_conflict', details: { current_revision: rev } } });

export interface InstructionsOpts { save?: 'conflict' | 'lost' }

export function instructionsRules(o: InstructionsOpts = {}): FixtureRule[] {
  const stored = new Map<string, { text: string; enabled: boolean; n: number }>();
  const of = (r: FixtureRequest) => {
    const id = `${r.target?.container.id ?? ''}\u0000${String(r.query.realm ?? '')}`;
    if (!stored.has(id)) stored.set(id, { text: SEED, enabled: true, n: 1 });
    return stored.get(id)!;
  };
  const body = (v: { text: string; enabled: boolean; n: number }) => ({ text: v.text, enabled: v.enabled, revision: `rev-${v.n}` });
  return [
    reply(instructionsRoutes.get, (r) => answers.ok(body(of(r)))),
    reply(instructionsRoutes.put, (r) => {
      const v = of(r);
      if (o.save === 'lost') return answers.lost(10);
      if (o.save === 'conflict') {
        // Another writer came first: theirs is what Compare reads.
        Object.assign(v, { text: THEIRS, enabled: false, n: v.n + 1 });
        return conflict(`rev-${v.n}`);
      }
      const sent = (r.body ?? {}) as { text?: unknown; enabled?: unknown; expected_revision?: unknown };
      if (sent.expected_revision !== `rev-${v.n}`) return conflict(`rev-${v.n}`);
      if (typeof sent.text !== 'string' || typeof sent.enabled !== 'boolean') return answers.refused(400, 'bad_request');
      Object.assign(v, { text: sent.text, enabled: sent.enabled, n: v.n + 1 });
      return answers.ok(body(v));
    }),
  ];
}
