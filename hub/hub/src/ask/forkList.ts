// forkList.ts (ask): the provider behind kit/agent/forkList - the unconfirmed forks of one computer and realm, over the page's journal and that computer's
// agent connection, with no chat's engine (registry.forkRecoveryFor). Registered in ask/index.ts.
import type { ForkListProvider } from '@kit/agent/forkList';
import { forkOutcome } from './active';
import { forkRecoveryFor } from './registry';

export const askForkList: ForkListProvider = {
  open(account, scope, at) {
    const fr = forkRecoveryFor(account, scope, at);
    if (!fr) return null;
    return {
      rows: () => fr.pending()?.map((x) => ({ k1: x.k1, parent: x.parent, turn: x.turn, bad: x.bad, hidden: x.hidden, mine: x.mine })) ?? null,
      elsewhere: () => fr.pendingElsewhere()?.map((x) => ({ computer: x.h, realm: x.r, n: x.n })) ?? null,
      check: async (k1) => forkOutcome(await fr.check(k1)),
      hide: (k1) => fr.hide(k1),
    };
  },
};
