// capability.ts: `can(action, facts)` decides every composer chip, menu item and button of an agent conversation from
// the backend, state, policy, leases and busy facts, in one table; the UI never re-derives it.
//   - A write needs an ACTIVE source (activate.ts). A read-only source answers every write `read_only`.
//   - A send or a decision needs the activation prerequisites: the journal, by-key recovery, the attachment
//     lease and, for a Strict chat, the approver lease. While any is missing every send, stop, decision and
//     answer is unavailable (`prerequisites`, with the missing names): no surface can send around them. `check` is a
//     read and needs the journal and recovery only.
//   - Reasons are codes; the words live with the screen that shows them. `unsupported` is never given by this table: a source
//     whose operations refuse an action whatever the facts say answers it so from its own can(), so no surface offers it.
// Pure and engine-free: the host maps its snapshot to `CapFacts`.

export type Action =
  | 'send' | 'followUp' | 'interruptSend' | 'autoApproveTurn' | 'attachImages'
  | 'stopTurn' | 'stopChat' | 'stopJob' | 'decide' | 'answer' | 'check' | 'compact'
  | 'setModel' | 'setAgent' | 'setEffort' | 'setVerbosity' | 'setApproval' | 'setRules' | 'setYolo' | 'setFolderAccess'
  | 'fork' | 'trim' | 'rename' | 'close' | 'reopen' | 'delete'
  | 'resend' | 'retry' | 'takeBack' | 'withdraw';

export const ACTIONS: readonly Action[] = [
  'send', 'followUp', 'interruptSend', 'autoApproveTurn', 'attachImages', 'stopTurn', 'stopChat', 'stopJob', 'decide', 'answer', 'check', 'compact',
  'setModel', 'setAgent', 'setEffort', 'setVerbosity', 'setApproval', 'setRules', 'setYolo', 'setFolderAccess', 'fork', 'trim', 'rename', 'close', 'reopen', 'delete',
  'resend', 'retry', 'takeBack', 'withdraw',
];

/** Everything that sends or decides (and so needs the activation prerequisites). */
export const SENDING: ReadonlySet<Action> = new Set<Action>([
  'send', 'followUp', 'interruptSend', 'autoApproveTurn', 'stopTurn', 'stopChat', 'stopJob', 'decide', 'answer', 'compact', 'resend', 'retry',
]);

export type Reason =
  | 'loading' | 'unreachable' | 'forbidden' | 'missing' | 'gone' | 'closed' | 'open'
  | 'read_only' | 'prerequisites' | 'approver_elsewhere'
  | 'turn_running' | 'no_turn' | 'turn_in_flight' | 'gate_parked' | 'session_busy'
  | 'no_gate' | 'gate_policy' | 'gate_helper' | 'gate_addressing' | 'gate_held' | 'decision_pending'
  | 'nothing_to_check' | 'images_wait'
  | 'strict_refuses_automatic' | 'strict_refuses_rules' | 'locked_by_policy' | 'approval_unknown'
  | 'fixed_after_start' | 'bot' | 'no_completed_turn' | 'no_later_turn' | 'unsupported'
  | 'asleep';

export type Capability = { ok: true } | { ok: false; reason: Reason; missing?: readonly Prerequisite[] };
export type Prerequisite = 'journal' | 'recovery' | 'attachment' | 'approver';

export interface CapFacts {
  /** 'read': a source nothing was activated on (it reads and streams only). */
  mode: 'read' | 'active';
  backend: 'native' | 'acp' | 'bot';
  /** Can the conversation be read at all (its computer resolves, the agent answers)? */
  reach: 'ok' | 'unreachable' | 'forbidden' | 'missing';
  state: 'loading' | 'idle' | 'running' | 'closed' | 'gone';
  /** The daemon is paused: messages are taken and wait, a step already running finishes, so no action here
   *  is refused for it; the host shows the paused band. */
  daemonPaused: boolean;
  approval: 'default' | 'always' | 'locked' | 'unknown';
  /** The first turn has started: the folder access and tool mode are fixed. */
  firstTurnStarted: boolean;
  /** A turn is in flight. */
  turn: boolean;
  gate: 'none' | 'confirm' | 'question';
  /** Why the open gate cannot be answered here, when it cannot. */
  gateBlocked: false | 'policy' | 'helper' | 'addressing' | 'held';
  /** A decision on the open gate is on its way or its outcome is unknown. */
  decisionPending: boolean;
  /** Queued turns, background children or interactive shells: they make the approval mode busy. */
  queued: boolean;
  children: boolean;
  shells: boolean;
  /** Sends whose outcome is not known yet (something to check). */
  unsettledSends: number;
  /** How many turns of the conversation are complete, when the host knows. Absent: not reported (fork keeps its old answer). 0: nothing
   *  to fork. */
  completedTurns?: number;
  /** The agent let this chat go idle (asleep on the computer): it keeps the history and wakes on the next message, but refuses every
   *  live-only change meanwhile (model, agent, effort, reply length, Auto-approve, trim). Absent: awake, or not known. */
  asleep?: boolean;
  /** Auto-approve as the chat's own stream last said it (another client's switch included); null: not known. Absent: this source
   *  does not follow it. Only a signal to read the approvals again: what the page shows comes from that read. */
  auto?: boolean | null;
  prereq: {
    journal: boolean;
    recovery: boolean;
    attachment: boolean;
    /** 'held' here, 'elsewhere' (another window holds it) or 'missing'; 'notNeeded' only for a chat that is not Strict. */
    approver: 'held' | 'elsewhere' | 'missing' | 'notNeeded';
  };
}

const no = (reason: Reason, missing?: readonly Prerequisite[]): Capability => (missing ? { ok: false, reason, missing } : { ok: false, reason });
const yes: Capability = { ok: true };

/** What is missing before this source may send or decide. Empty when it may. */
export function missingPrerequisites(f: CapFacts): Prerequisite[] {
  const m: Prerequisite[] = [];
  if (!f.prereq.journal) m.push('journal');
  if (!f.prereq.recovery) m.push('recovery');
  if (!f.prereq.attachment) m.push('attachment');
  // A Strict chat needs a HELD lease: `notNeeded` (a default-mode fact) is never evidence of one. A chat asleep on the computer cannot
  // have one (the agent grants it to a live chat) and needs none to be woken: the message wakes it, and a gate its turn parks takes the
  // lease the usual way. A lease held elsewhere still holds the send back.
  if (f.approval === 'always' && f.prereq.approver !== 'held' && !(f.asleep && f.prereq.approver === 'missing')) m.push('approver');
  return m;
}

const open = (f: CapFacts) => f.state === 'idle' || f.state === 'running';

export function can(action: Action, f: CapFacts): Capability {
  // Nothing is answered about a conversation that cannot be read.
  if (f.reach !== 'ok') return no(f.reach);
  if (f.state === 'loading') return no('loading');
  if (f.state === 'gone') return no('gone');
  // Writes need an activated source; sends and decisions also its prerequisites.
  if (f.mode === 'read') return no('read_only');
  if (action === 'check') {
    const m = missingPrerequisites(f).filter((x) => x === 'journal' || x === 'recovery');
    if (m.length) return no('prerequisites', m);
    return f.unsettledSends > 0 ? yes : no('nothing_to_check');
  }
  if (SENDING.has(action)) {
    const m = missingPrerequisites(f);
    if (m.length === 1 && m[0] === 'approver' && f.prereq.approver === 'elsewhere') return no('approver_elsewhere', m);
    if (m.length) return no('prerequisites', m);
  }
  if (f.backend === 'bot' && !['send', 'check', 'decide', 'answer', 'stopTurn', 'fork', 'rename', 'close', 'reopen', 'delete'].includes(action)) return no('bot');
  const busy = f.turn || f.gate !== 'none';
  switch (action) {
    case 'send':
      if (f.state === 'closed') return no('closed');
      return f.turn || f.gate !== 'none' ? no('turn_running') : yes;
    case 'followUp':
    case 'interruptSend':
      if (f.state === 'closed') return no('closed');
      return f.turn || f.gate !== 'none' ? yes : no('no_turn');
    case 'autoApproveTurn':
      if (f.state === 'closed') return no('closed');
      if (f.approval === 'always') return no('strict_refuses_automatic');
      if (f.approval === 'locked') return no('locked_by_policy');
      if (f.approval === 'unknown') return no('approval_unknown');
      return yes;
    case 'attachImages':
      if (f.state === 'closed') return no('closed');
      return f.turn ? no('images_wait') : yes;
    case 'stopTurn':
      return f.turn ? yes : no('no_turn');
    case 'stopChat':
      return f.state === 'closed' ? no('closed') : yes;
    case 'stopJob':
      // One shell job of this chat: the agent stops jobs of an open session only.
      return f.state === 'closed' ? no('closed') : yes;
    case 'decide':
    case 'answer': {
      const want = action === 'decide' ? 'confirm' : 'question';
      if (f.gate !== want) return no('no_gate');
      if (f.gateBlocked === 'policy') return no('gate_policy');
      if (f.gateBlocked === 'helper') return no('gate_helper');
      if (f.gateBlocked === 'addressing') return no('gate_addressing');
      if (f.gateBlocked === 'held') return no('gate_held');
      return f.decisionPending ? no('decision_pending') : yes;
    }
    case 'compact':
      if (f.state === 'closed') return no('closed');
      return f.gate !== 'none' ? no('gate_parked') : yes;
    case 'setModel':
    case 'setAgent':
    case 'setEffort':
    case 'setVerbosity':
      if (f.state === 'closed') return no('closed');
      if (f.asleep) return no('asleep');
      if (f.gate !== 'none') return no('gate_parked');
      return f.turn ? no('turn_in_flight') : yes;
    case 'setApproval':
      if (f.state === 'closed') return no('closed');
      if (f.approval === 'locked') return no('locked_by_policy');
      return busy || f.queued || f.children || f.shells ? no('session_busy') : yes;
    case 'setRules':
      if (f.approval === 'always') return no('strict_refuses_rules');
      return yes;
    case 'setYolo':
      if (f.approval === 'always') return no('strict_refuses_automatic');
      if (f.approval === 'locked') return no('locked_by_policy');
      if (f.approval === 'unknown') return no('approval_unknown');
      return f.asleep ? no('asleep') : yes;
    case 'setFolderAccess':
      return f.firstTurnStarted ? no('fixed_after_start') : yes;
    case 'reopen':
      return f.state === 'closed' ? yes : no('open');
    case 'close':
      return open(f) ? yes : no('closed');
    case 'fork':
      // The agent forks only a live conversation (a closed one is reopened first), and a chat with no finished turn has nothing to copy.
      if (f.state === 'closed') return no('closed');
      return f.completedTurns === 0 ? no('no_completed_turn') : yes;
    case 'trim':
      // Trim keeps the history through one finished reply and removes what follows it, between turns only. A chat with fewer than two
      // finished turns has nothing to remove; which reply is the last is the menu's own check (this table takes no index).
      if (f.state === 'closed') return no('closed');
      if (f.turn) return no('turn_in_flight');
      if (f.gate !== 'none') return no('gate_parked');
      if (f.completedTurns !== undefined && f.completedTurns < 2) return no('no_later_turn');
      return f.asleep ? no('asleep') : yes;
    case 'resend':
    case 'retry':
      // Send again and Retry put a message on its way, so they are a send: a closed chat takes none, nor one with a turn or gate in
      // the way. Which ROW may offer them is the host's own fact (the row's state), carried on the block.
      if (f.state === 'closed') return no('closed');
      return f.turn || f.gate !== 'none' ? no('turn_running') : yes;
    case 'takeBack':
      // Taking a message back sends nothing: it moves a Not sent message into the draft. Only an activated source offers it (above).
      return yes;
    case 'withdraw':
      // Taking a queued message back asks the agent (its queue decides), but puts nothing on its way: no send prerequisite, and a turn
      // running is when a message is queued at all. A closed chat holds no queue to take it from.
      return f.state === 'closed' ? no('closed') : yes;
    case 'rename':
    case 'delete':
      return yes;
  }
}
