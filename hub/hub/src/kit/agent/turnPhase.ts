// turnPhase.ts: what the newest turn of a conversation is doing now, as one value the working row draws (WorkRow in SessionView).
// Pure: it reads a snapshot and the host's one extra fact (a Stop of this turn is still out) and nothing else.
// The host's own `activity` wins when the snapshot carries it; otherwise the phase is derived from the facts every source has.
import type { ConvSnapshot } from './source';

/** The tool step shown beside the phase words: its verb and its one-line input, as the step trail shows them. */
export interface PhaseStep { verb: string; summary?: string }

export type TurnPhase =
  /** Nothing to say: no turn runs, or the chat is still being read (the reading state says so itself). */
  | { k: 'idle' }
  /** The message left this page and the agent has not taken it yet. */
  | { k: 'sending' }
  /** A turn runs. `step`: the tool step running now; `writing`: the reply is streaming; `doing`: what the host says it waits on
   *  (compacting the conversation, or the model thinking). None of them: the row keeps its generic line. */
  | { k: 'working'; step?: PhaseStep; writing?: true; doing?: 'compacting' | 'thinking' }
  /** A gate waits for the person: its card speaks, the working row does not. */
  | { k: 'waiting' }
  /** A Stop of this turn was pressed and the turn has not ended yet. */
  | { k: 'stopping' }
  /** A turn runs but the live connection is being opened again. */
  | { k: 'reconnecting' }
  /** The chat is shown from memory while the agent is asked what happened meanwhile: nothing is proven running. */
  | { k: 'catching_up' }
  /** A turn was running when the computer stopped answering: it may still run there. */
  | { k: 'lost' };

const IDLE: TurnPhase = { k: 'idle' };

/** The running step of the newest step trail, if its trail is the newest activity shown. */
function runningStep(snap: ConvSnapshot): PhaseStep | undefined {
  for (let i = snap.blocks.length - 1; i >= 0; i--) {
    const b = snap.blocks[i]!;
    if (b.k === 'user') return undefined;
    if (b.k !== 'steps') continue;
    if (b.state !== 'running') return undefined;
    const row = [...b.rows].reverse().find((r) => r.state === 'running');
    return row ? { verb: row.verb, ...(row.summary ? { summary: row.summary } : {}) } : undefined;
  }
  return undefined;
}

export function turnPhase(snap: ConvSnapshot, host: { stopping?: boolean } = {}): TurnPhase {
  const f = snap.facts;
  // A saved copy is not live.
  if (snap.saved) return IDLE;
  // The host's word comes before the facts: a host that reconnects or catches up reports no turn and a loading state on purpose
  // (nothing may be sent or stopped then), and still knows what the person is waiting for.
  const said = snap.activity;
  if (said) {
    if (said.phase === 'working') return host.stopping ? { k: 'stopping' } : { k: 'working', ...(said.step ? { step: said.step } : {}) };
    return { k: said.phase };
  }
  // A chat still being read has its own state.
  if (f.state === 'loading') return IDLE;
  if (f.reach !== 'ok') return f.turn ? { k: 'lost' } : IDLE;
  if (snap.gates.some((g) => g.decision === null)) return { k: 'waiting' };
  if (!f.turn) return IDLE;
  if (host.stopping) return { k: 'stopping' };
  if (snap.meta?.status === 'loading') return { k: 'reconnecting' };
  // Compacting is said by the host alone and comes first: no step runs and nothing streams while it lasts.
  if (snap.work === 'compacting') return { k: 'working', doing: 'compacting' };
  const step = runningStep(snap);
  if (step) return { k: 'working', step };
  const last = snap.blocks[snap.blocks.length - 1];
  if (last && last.k === 'reply' && last.streaming) return { k: 'working', writing: true };
  return snap.work === 'thinking' ? { k: 'working', doing: 'thinking' } : { k: 'working' };
}
