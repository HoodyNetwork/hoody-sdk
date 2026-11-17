// source.ts: the conversation source, the one seam every agent surface reads a conversation through (the dock, the AI
// tab, a Board tile, Bots Activity). The read side lives here: a snapshot, a subscription and a watch level.
// Sending, stopping, deciding, answering and checking exist only on an ACTIVE source (activate.ts), which needs the journal,
// by-key recovery, the attachment lease and, for a Strict chat, the approver lease. A read-only
// source has no such method at all, so no surface can send around the prerequisites.
// Engine-free: ask/ implements it; nothing here imports ask/, a page or the shell.
import type { Capability, Action, CapFacts } from './capability';
import type { DecidedView, GateView, GateChoice } from './GateCard';
import type { RateLimitReading } from './rateLimit';
import type { ShellJobStops } from './shellJobStop';

/** The canonical conversation reference: a computer by handle, a realm, a session id. */
export interface ConvRef {
  /** The computer's handle (name.last4), never its id. */
  computer: string;
  /** 'global' or a 24-hex realm id. */
  realm: string;
  sid: string;
}
export const convKey = (r: ConvRef): string => `${r.computer}|${r.realm}|${r.sid}`;

/** How much of the conversation this holder wants live: the stream, the state reads, or nothing (aggregated per handle). */
export type Watch = 'stream' | 'state' | 'off';
/** Where this holder's stream ranks in the stream budget (core/stream-budget.ts), best first: the open chat, a focused tile, the
 *  dock, a tile in view, a Bot's own session. A holder that never says counts as `dock`. */
export type WatchRank = 'open' | 'focused' | 'dock' | 'visible' | 'bot';

/** What a send or decision came to. `unknown` is never shown as done or failed (C9). */
export type SendOutcome = { k: 'done' } | { k: 'refused'; code: string } | { k: 'unknown' };

export interface GateRef { id: string; generation: number }
export type Decision = { choice: GateChoice; reason?: string };
export type Answer = string | Record<string, string>;
export interface Draft {
  text: string;
  images?: readonly { name: string; mime: string; data: string }[];
  /** Text files, each its own part of the message (the host's file and message size rules), never folded into `text`. */
  files?: readonly { name: string; text: string; from?: string }[];
  /** The person's explicit "Send anyway" for a message the host holds as a possible duplicate. Honoured only by a send `can('send')`
   *  allows; it never makes a refused send go. */
  anyway?: boolean;
}
/** A send whose outcome is not known: what Check again reads. */
export interface PendingRef { key: string; kind: 'create' | 'turn' | 'message' | 'interrupt' | 'stop' | 'decision' }

/** What a user row offers besides Check. Only a DEFINITE outcome offers one: `resend` a message the agent did not take
 *  (Not sent), `retry` the prompt of a turn that failed, `takeBack` a Not sent message into the draft. A row whose outcome is
 *  unknown or still sending offers none of them (Check only). A queued follow-up offers `editQueued` and `withdraw` (Edit, Remove):
 *  both ASK the agent to take it back (the source's `withdraw`); the row goes, and Edit's text comes back, only on `withdrawn`. */
export type RowAction = 'resend' | 'retry' | 'takeBack' | 'editQueued' | 'withdraw' | 'check';
/** What asking the agent to take a queued message back came to. `withdrawn`: it will never be delivered (with Edit, its text, when the
 *  host still had it). `taken`: the agent already had it; nothing was taken back. `ended`: it had ended without being delivered. `refused`:
 *  nothing was taken back (`not_found`: this agent cannot take it back). `unknown`: the answer was lost; never asked again, only read. */
export type WithdrawOutcome = { k: 'withdrawn'; text?: string } | { k: 'taken' } | { k: 'ended' } | { k: 'refused'; code: string } | { k: 'unknown' };
/** What taking a message back came to: its text (the files, when it had any, stay in the host's draft and only their count crosses),
 *  or a refusal. Nothing is sent either way. */
export type TakeBack = { k: 'text'; text: string; files: number } | { k: 'refused'; code: string };

// ---- the read model (strings are the host's words; the kit draws them) ----
/** A picture a step saved where the agent runs: the path its tool named (the host reads it), the file's name, its size. */
export interface StepPicture { path: string; name: string; size?: number }
export interface StepView {
  id: string;
  state: 'running' | 'ok' | 'failed' | 'unknown';
  verb: string;
  /** What the step worked on, on one line, already cleaned: the agent's own summary of the call (a command as `$ …`, a path, a
   *  pattern), not the call itself. */
  summary?: string;
  /** The same text with its line breaks kept, for a row that opens; absent: `summary` is all there is. */
  text?: string;
  /** The text is not all of it (the agent cut a long command, or the host's own bound did): it is then named as shortened and
   *  never offered as the exact command. */
  cut?: boolean;
  /** `note`: the agent's own words between steps, not a tool call (drawn as prose and not counted as a step). */
  kind?: 'note';
  time?: string;
  /** Why it failed, or "may have run". */
  note?: string;
  /** The pictures the step made, shown in its open detail. */
  pictures?: readonly StepPicture[];
}
export interface FileView {
  id: string; kind: 'image' | 'text'; name: string; url?: string | null; meta?: string;
  /** A picture the agent keeps for this chat (a reopened chat): its id there, read through the host when the row is drawn. */
  stored?: string;
  /** A picture that was sent but can no longer be shown (the agent cannot serve it). */
  gone?: true;
}
export type ConvBlock =
  | { k: 'user'; key: string; text: string; at: number; files?: readonly FileView[]; note?: { text: string; bad?: boolean };
      /** The request this row stands for, named as the journal names it (the identity Check, resend, retry and take-back bind to; the
       *  block `key` is not one). Absent when the host cannot name it. */
      req?: PendingRef;
      /** The row actions on offer now, in display order; absent or empty: none. */
      actions?: readonly RowAction[];
      /** Queued for the agent and not read by it yet: while a card waits, such a message at the end is drawn after the cards. */
      queued?: true;
      /** Sent into a turn that was already running (the agent reads it at a later step): it does not start a turn of its own. */
      followUp?: true }
  // `label` names the trail in one line (while it runs: the running step's input). `count`: how many steps and, once known, how
  // long ("3 steps · 7 s"), whatever runs; a view that previews the step itself beside the trail's name reads this one.
  | { k: 'steps'; key: string; label: string; count?: string; state: 'running' | 'ok' | 'failed' | 'unknown'; rows: readonly StepView[] }
  // The agent's summary of the conversation before this point (it compacted its context): a note, folded, opened to the summary
  // drawn as a reply's markdown; never a message of the person's (no "You", no row actions).
  | { k: 'summary'; key: string; text: string }
  | { k: 'reply'; key: string; text: string; streaming: boolean; final: boolean; cost: number | null; at: number | null; cut?: string;
      /** The 0-based index of the completed turn this reply closes (the transcript's turn_boundaries, the index fork and trim take). Absent
       *  while the reply streams, for the live tail, or when the host has not read the boundaries: such a reply has no turn menu. */
      turn?: number;
      /** A finished turn's last reply only: how many files its edit tools changed (or may have). A count: the files themselves are
       *  the snapshot's `edits` (memory only), never a block's. */
      files?: number }
  | { k: 'decided'; key: string; d: DecidedView }
  // `recheck`: the turn's outcome is not known ("Couldn't tell"); an active source with `recheckOutcome` offers Check again on it.
  // `stop`: the line says a Stop's answer never came (it may have gone through): a composer adds no Stop note beside it
  // (useConvComposer stopShown), so the chat says it once.
  // `link`: the Hub page where the next step is taken (a failure no Retry helps: the models page), drawn as a button beside it.
  // `agentApp`: the next step is taken in the computer's Agent app (hooks to trust); the words of a button there, drawn only
  // when the view knows the app's address (SessionView agentUrl).
  | { k: 'line'; key: string; text: string; tone: 'muted' | 'bad' | 'info'; recheck?: true; stop?: true; link?: { label: string; href: string }; agentApp?: string };

export interface GateEntry {
  key: string;
  /** The gate this card was drawn for: a decision names it, never a gate that replaced it before the repaint. */
  ref: GateRef;
  gate: GateView;
  /** A helper's gate (asked by a sub-task). Answered here like the lead's when the source can decide it (`can()`). */
  helper: boolean;
  /** The helper's name as the agent gives it (its id), when the host knows it. */
  helperName?: string;
  addressing: boolean;
  held: 'claiming' | 'full' | null;
  /** 'sending': on its way; 'unknown': the answer was lost. */
  decision: 'sending' | 'unknown' | null;
  /** With 'unknown': the gate no longer waits and no evidence (our request_id named, another decision named, or an end
   *  without a decision) says what happened, so it stays unknown. */
  gone?: boolean;
  /** The decision this page sent, for the lost-answer words; absent when the host does not know it. */
  sent?: GateChoice;
}

/** Where and how a conversation runs, in the host's words (the header and Details read the same record). */
export interface ConvMeta {
  /** The computer as the person knows it, never an id. */
  computer: string;
  /** The realm's name. */
  realm: string;
  folder?: string;
  agent?: string;
  /** Where that agent's own page is, when the host has one: its name then links there. */
  agentHref?: string;
  model?: string;
  status: 'loading' | 'idle' | 'running' | 'needs' | 'paused' | 'closed' | 'unreachable';
}
/** One file the chat's edit tools changed, from the tools' own inputs: `diff` is an edit's replaced and new text (each
 *  possibly cut, `cut`), `meta` the host's one-line size, `unsure` a call whose outcome is not known (it may have run),
 *  `open` the Hub path that shows the file's folder in Files (absent when the host cannot name one). Memory only: a host never
 *  stores these. 'written' is a whole-file write: its content is never kept or shown. */
export interface EditView {
  id: string;
  path: string;
  verb: 'edited' | 'written' | 'created' | 'deleted';
  meta?: string;
  diff?: { old: string; new: string; all?: boolean };
  cut?: boolean;
  unsure?: boolean;
  /** The call named another computer than the chat's: the row says which, as written. */
  computer?: string;
  open?: string;
}

/** What the newest turn is doing now, when the host can say more than the facts do (the working row, turnPhase.ts). `sending`: the
 *  message left this page and the agent has not taken it yet. `catching_up`: the chat is shown from what this browser remembers
 *  while the agent is asked what happened meanwhile (nothing is proven running). `step`: the tool step running now, in the trail's
 *  own words. */
export interface ConvActivity {
  phase: 'sending' | 'working' | 'waiting' | 'stopping' | 'reconnecting' | 'catching_up' | 'lost';
  step?: { verb: string; summary?: string };
}

export interface ConvSnapshot {
  /** What `can()` reads. */
  facts: CapFacts;
  /** The host's own word on the running turn; absent: the working row derives its phase from `facts`, `gates` and `blocks`. */
  activity?: ConvActivity;
  /** What a running turn waits on while no step runs and no reply streams, when the host knows: `compacting` (the agent is making
   *  the conversation shorter) or `thinking` (the model is working on the next step). Absent: the working row keeps its generic line. */
  work?: 'compacting' | 'thinking';
  title: string | null;
  blocks: readonly ConvBlock[];
  gates: readonly GateEntry[];
  /** True while the transcript above the first block has not been read (a gap). */
  gapTop?: boolean;
  /** The blocks are this browser's saved copy of the chat (`at`: when it was kept), shown while its computer is read; they go
   *  as soon as the computer answers. A saved copy is never merged with the answer and nothing in it can be acted on. */
  saved?: { at: number };
  /** Where it runs; absent while unknown. */
  meta?: ConvMeta;
  /** The running turn's id as the agent named it; absent while no turn runs or before the agent named it. The same turn keeps
   *  it across follow-ups, transcript rebuilds and reopened sources, so it is the one turn identity an attempt may bind to
   *  (a transcript row's key is not). */
  turnId?: string;
  /** The turn facts agree with the agent's own state, read since this source opened (the turn it names is the one shown running,
   *  or none runs and it names none). Without it they may come from a stored record only, so an idle chat or a missing turnId is
   *  no proof that an earlier turn ended. */
  turnConfirmed?: true;
  /** The newest turn shown ended (its end came from the agent: a done frame or its receipt), by its agent id. */
  endedTurnId?: string;
  /** Edits made with the edit tools in this chat (inputs only; commands and shell changes are not listed). */
  edits?: readonly EditView[];
  /** How many more files changed than `edits` lists (it lists the newest; a host caps it). */
  editsMore?: number;
  /** Details > Usage: the turns this viewer saw run, in order, one entry per turn whatever its blocks are, with the foreground model
   *  responses the stream reported for it (the four counts a usage row carries); kept when the chat is rebuilt from its transcript or
   *  opened again in this tab. `key`: the turn's own, the same across follow-ups and rebuilds. `turn`: its 1-based place among the turns
   *  shown. `asked`: the turn's own question, '' when it is not shown (a turn started elsewhere, above the read part). A turn with none
   *  (one this viewer did not see run, every count unreadable) is not listed: its requests stay Other spend. */
  usage?: readonly { key: string; turn: number; asked: string; responses: readonly { input: number; output: number; cacheRead: number; cacheWrite: number }[] }[];
}

/** The read side. */
export interface ConversationSource {
  readonly kind: 'session' | 'bot';
  readonly ref: ConvRef | { bot: string };
  snapshot(): ConvSnapshot;
  subscribe(fn: () => void): () => void;
  watch(w: Watch, rank?: WatchRank): void;
  can(a: Action): Capability;
}

/** Why a fork came to what it did (ActiveSource.fork / checkFork): the host chooses tone and actions from this alone, never from the words. */
export type ForkReason =
  | 'opened' | 'none' | 'gone' | 'unconfirmed' | 'busy' | 'pending' | 'lost' | 'handoff' | 'inFlight'
  | 'untracked' | 'full' | 'refused' | 'notOpen' | 'changed' | 'approval' | 'notRead' | 'notRemembered' | 'unreadable' | 'account';
/** What a fork came to (ActiveSource.fork), in the host's words. `opened` is the only outcome a host navigates on, and it exists only
 *  once the create is settled. `refused`: this action ended with nothing of its own pending (for `gone` and `unconfirmed` the target is
 *  free again, which does not mean that none was made). `unknown`: a record of this fork remains pending under create key `k1`, and
 *  `checkFork(k1)` recovers it. */
export type ForkOutcome =
  | { k: 'opened'; sid: string; guard?: ForkGuard }
  | { k: 'refused'; words: string; reason: ForkReason; guard?: ForkGuard }
  | { k: 'unknown'; words: string; reason: ForkReason; k1: string; guard?: ForkGuard };
/** Set by a host that decided an outcome for ONE account. `still()` says whether that account is the shown one; a host reads it in the very turn it
 *  acts on the outcome (`forkNow`), because a Check's answer travels through promise reactions in which the shown account can change. `moved` is what
 *  the outcome then becomes: unknown (reason `account`) under the create key that was checked. */
export interface ForkGuard {
  readonly still: () => boolean;
  readonly moved: { readonly words: string; readonly k1: string };
}

/** One unconfirmed fork as a list or a band shows it. */
export interface ForkRowView {
  readonly k1: string;
  /** The parent chat and the 0-based turn it copies through (null: the whole chat). Null parent: its stored origin could not be read. */
  readonly parent: string | null;
  readonly turn: number | null;
  readonly bad: boolean;
  readonly hidden: boolean;
  /** A press on this page is making it now. */
  readonly mine: boolean;
}

/** One file of the draft the host holds for this chat (a Not sent message taken back brings its files here). Never its bytes. */
export interface DraftFile {
  id: string;
  kind: 'image' | 'text';
  name: string;
  /** A thumbnail URL for an image, else null. */
  url: string | null;
  bytes: number;
  lines: number;
  resized?: { from: number; to: number };
}

/** The activated source: the only way to send, stop, decide, answer or check. */
export interface ActiveSource extends ConversationSource {
  send(d: Draft, o?: { autoApproveTurn?: boolean }): Promise<SendOutcome>;
  stop(scope: 'turn' | 'chat'): Promise<SendOutcome>;
  decide(g: GateRef, d: Decision): Promise<SendOutcome>;
  answer(g: GateRef, a: Answer): Promise<SendOutcome>;
  /** A read (by key, or the row's read), then a by-key retire after a miss; never sends again. */
  check(p: PendingRef): Promise<SendOutcome>;
  /** Reads the conversation again for a turn whose outcome is not known (a line with `recheck`); never sends. Absent on a
   *  source whose host cannot. */
  recheckOutcome?(): void;
  /** Send again a message the agent definitely did not take (a row with `resend` on offer): the host's own resend, which never asks
   *  a key that was tried again. `done` only on proof it was taken; a refusal when the row is no longer Not sent; otherwise `unknown`.
   *  Absent on a source whose host offers no row actions (no row then lists any). */
  resend?(p: PendingRef): Promise<SendOutcome>;
  /** Retry the prompt of a turn that failed (a row with `retry` on offer), as a new message with its own text and files. */
  retry?(p: PendingRef): Promise<SendOutcome>;
  /** Take a Not sent message back to the draft (a row with `takeBack` on offer). A local change: nothing is sent. */
  takeBack?(p: PendingRef): TakeBack;
  /** Ask the agent to take a queued follow-up back (a row with `withdraw` or `editQueued` on offer). `then`: what the press was for; with
   *  'edit' a withdrawn message's text comes back in the outcome. Once sent it is never sent again for that row: a lost answer is read
   *  back by the row's Check. Absent on a source whose host cannot. */
  withdraw?(p: PendingRef, then: 'remove' | 'edit'): Promise<WithdrawOutcome>;
  /** The person dismisses a "not sure" decision whose gate is gone from the agent and that no read could settle: the
   *  decision's entry is removed and the card is answerable again. Nothing is sent (engine.dismissDecision). */
  dismissDecision(g: GateRef): void;
  /** Whether the engine can dismiss that gate's "not sure" decision (a journaled engine with such a decision): the card
   *  offers Dismiss only then. */
  canDismiss(g: GateRef): boolean;
  /** Switch auto-approve ("Allow everything") for this chat on or off as the person's own choice: the host's write, which the
   *  host then keeps (a host that guards its sends puts back an On it did not make itself). Sent once, under the conversation's
   *  shared approval attempt (kit/agent/useApproval.ts), so Details and every other switch see it; what it came to is what the
   *  approvals read shows. False: nothing was sent (no session yet, another change unsettled, the host busy with one, or
   *  `can('setYolo')` refuses). Absent on a source whose host cannot. The caller asks the person first before `true`.
   *  `at`: the computer as the caller's own approvals read names it, so that read sees this attempt (default: the host's own). */
  setAutoApprove?(want: boolean, at?: { project: { id: string }; container: { id: string; server_name?: string } }): boolean;
  /** This chat's approvals were changed outside the host (the mode, from a page): the host reads its own copy again. */
  approvalChanged?(): void;
  /** Forks this chat: from a turn (`turn`: its 0-based index in the chat's turn boundaries, the `turn` a reply block carries; `pin`: the
   *  boundary the page read for it, which is re-read at press, and which the source supplies from what it shows when left out) or,
   *  without `o`, the whole chat. Absent on a source that cannot fork. */
  fork?(o?: { turn: number; pin?: number }): Promise<ForkOutcome>;
  /** Checks a fork that is pending under create key `k1` (what `unknown` carried, or a row): what the computer holds under the key, and
   *  when nothing does and nobody can be making it, a retire that proves it was never made. Never sends it. Absent with `fork`. */
  checkFork?(k1: string): Promise<ForkOutcome>;
  /** Hides the row of a pending fork (display only: it still counts and still blocks its target). */
  hideFork?(k1: string): Promise<boolean>;
  /** This chat's unconfirmed forks (its computer and realm; the host filters by parent), or null when they cannot be read now. */
  forks?(): readonly ForkRowView[] | null;
  /** The chat's shell jobs from the agent's per-session list, with a Stop of one (shellJobStop.ts): the same store for
   *  as long as this source is held, its Stop checked against can('stopJob') at the press. Absent for a source that has no shell
   *  jobs (a Bot); null while the chat's computer cannot be read. */
  shellJobs?(): ShellJobStops | null;
  /** The Claude Code account's last usage-limit reading for this chat (rateLimit.ts), or null when none arrived. It
   *  changes only with a frame that supersedes it, so a host reads it under subscribe. Absent for a source with no agent
   *  stream (a Bot). */
  rateLimit?(): RateLimitReading | null;
  /** The files the host already holds for this chat's NEXT message (a Not sent message taken back brings its files here; they go with the
   *  next send), read-only; it changes only with the host's draft, so a surface reads it under subscribe, and the same list is returned until it
   *  does. A composer that offers Edit on a row with files draws these as chips the person can remove, or it must not offer it: they would
   *  otherwise go with a send unseen. Declared together with `dropDraftFile`. Absent for a source whose host keeps no such draft. */
  draftFiles?(): readonly DraftFile[];
  /** Removes one of `draftFiles` from the host's draft (nothing is sent). */
  dropDraftFile?(id: string): void;
}

/** A gate card's identity in the page (its wrap's data-gate-key): key, gate id and generation. */
export const gateIdOf = (g: GateEntry): string => `${g.key}:${g.ref.id}:${g.ref.generation}`;

export const isActive = (s: ConversationSource): s is ActiveSource => typeof (s as Partial<ActiveSource>).send === 'function';
