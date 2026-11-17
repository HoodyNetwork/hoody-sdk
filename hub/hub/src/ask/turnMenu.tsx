// The Ask column's menu on a finished reply: the kit's one TurnMenu with this engine's Fork item (a keyed create that branches from the turn,
// engine.fork). The kit's tables decide whether Fork is offered (forkGate, the same one the activated source uses);
// the engine decides what it came to. The new chat is opened ONLY for an `opened` outcome, through the AI tab's chat link.
import { useMemo, useRef } from 'react';
import { can, forkGate, forkItems, turnMenuOf, type CapFacts, type ForkOutcome } from '@kit';
import type { TurnMenu } from '@kit/agent/SessionView';
import { forkOutcome } from './active';
import type { AskEngine, Snapshot } from './engine';
import { forkViews, useForkFaq } from './forkBand';
import { useOpenChat, useShowForks } from './links';
import { factsOf } from './source';

/** The facts the table judges: this conversation, writable, with the journal the engine reports (Fork needs no more). */
function factsFor(eng: AskEngine, snap: Snapshot): CapFacts {
  const journal = eng.activation().journal;
  return { ...factsOf(snap), mode: 'active', prereq: { journal, recovery: journal, attachment: true, approver: 'notNeeded' } };
}

export function useAskTurnMenu(eng: AskEngine, snap: Snapshot): TurnMenu {
  const open = useOpenChat();
  const showForks = useShowForks();
  const faq = useForkFaq();
  const live = useRef({ snap, open, showForks, faq });
  live.current = { snap, open, showForks, faq };
  return useMemo(() => turnMenuOf(forkItems({
    source: () => ({
      can: (a) => can(a, factsFor(eng, live.current.snap)),
      fork: async (o): Promise<ForkOutcome> => forkGate(factsFor(eng, live.current.snap)) ?? forkOutcome(await eng.fork(o ? { turn: o.turn, ...(o.pin !== undefined ? { pin: o.pin } : {}) } : null)),
      checkFork: async (k1): Promise<ForkOutcome> => forkOutcome(await eng.checkFork(k1)),
      forks: () => forkViews(eng),
    }),
    open: (sid) => { const ref = eng.chatRefOf(sid); return ref ? live.current.open(ref) : false; },
    showForks: () => { live.current.showForks(); },
    get faq() { return live.current.faq; },
  })), [eng]);
}
