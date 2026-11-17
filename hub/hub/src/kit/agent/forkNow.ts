// forkNow.ts: the outcome a host may act on NOW. A Check's answer is decided for one account and then travels through promise reactions before
// a host acts on it; the shown account can change in between. A host calls this in the turn it acts (toast, navigate, say on the row): an outcome decided
// for an account that is no longer shown is unknown (reason `account`), never a definite one. An outcome with no guard is returned as it is.
import type { ForkOutcome } from './source';

export function forkNow(o: ForkOutcome): ForkOutcome {
  const g = o.guard;
  if (!g || g.still()) return o;
  return { k: 'unknown', words: g.moved.words, reason: 'account', k1: g.moved.k1 };
}
