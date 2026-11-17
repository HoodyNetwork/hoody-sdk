// loadPhase.ts: what the open chat is waiting on right now, as one value read from one engine snapshot. Pure: no clock, no
// network, no memory of earlier snapshots. The sources (source.ts) turn it into the kit's `activity`, so the dock and the AI
// tab draw the same working row for the same state, and nothing has to guess a phase from the blocks.
import * as C from './conv';
import type { Snapshot } from './engine';

export type LoadPhase =
  /** The chat is being read for the first time here: nothing of it is shown yet. */
  | 'opening'
  /** The chat is shown from what this browser remembers while the agent is asked what happened meanwhile: a turn the record says
   *  runs has no receipt yet, or a turn that ended unseen is being read back from the transcript. Nothing is proven running. */
  | 'catching_up'
  /** A message of this page is on its way and the agent has not taken it: a first message (create, then turn) or a turn on an
   *  idle chat. A follow-up sent while a turn runs is not this: that turn's phase stands, and the row says its own state. */
  | 'sending'
  /** A turn runs. */
  | 'working'
  /** A turn runs and a card waits for the person. */
  | 'waiting'
  /** Stop for the running turn left this page and the turn has not ended. */
  | 'stopping'
  /** A turn runs and its live connection is being opened again. */
  | 'reconnecting'
  /** A turn was running when the connection was lost: it may still run there. */
  | 'lost'
  /** Nothing is waited on (or a band, a blocked state or a row's own note says what is). */
  | 'idle';

export type LoadView = Pick<Snapshot, 'phase' | 'band' | 'status' | 'conv' | 'catchingUp'>;

/** The message this page is sending that no turn has taken yet: the prompt of a turn the agent has not named, or a first
 *  message or turn still loose, in state `sending`. A follow-up (via command) never counts. */
function sendingFirst(c: C.Conv): boolean {
  const t = C.current(c);
  const open = t && C.running(t) && !t.s.turnId ? t.users : [];
  return [...open, ...c.loose].some((id) => { const u = c.users[id]; return !!u && u.state === 'sending' && u.via !== 'command'; });
}

/** A turn block the agent has not named whose prompt is no longer on its way (its answer was lost, or it was refused and waits
 *  to be taken back): the block stands for a turn nothing proves, so it is not "working". */
function unprovenTurn(c: C.Conv): boolean {
  const t = C.current(c);
  return !!t && C.running(t) && !t.s.turnId;
}

export function loadPhase(s: LoadView): LoadPhase {
  // A band (stopped, starting, being set up, can't reach, connection lost) or a blocked or ended engine says what is waited on.
  if (s.band && s.band.k !== 'busy') return 'idle';
  if (s.phase === 'checking') return 'opening';
  if (s.phase !== 'ready') return 'idle';
  if (s.status === 'lost') return 'lost';
  if (s.catchingUp) return 'catching_up';
  if (sendingFirst(s.conv)) return 'sending';
  if (s.status === null || unprovenTurn(s.conv)) return 'idle';
  return s.status;
}
