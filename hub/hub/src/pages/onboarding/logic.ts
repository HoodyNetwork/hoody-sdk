// Pure functions of the onboarding page (no React, no I/O): what the loading screen shows, worked out only from
// what the Hub read. Nothing here counts time as progress: a step is done when a read proves it.
//
// What a read can prove, coarsest first:
//   account   the Hub is signed in (always true on this page)
//   server    the account has its server: a computer row exists, or the free-tier status says its server is claimed
//   computer  a computer row exists in the list
//   running   that row's status is "running"
import type { SetupState } from '@core';

/** A computer row's status in the list answer, parsed: anything this page does not know is 'other', never a guess. */
export type Phase = 'running' | 'making' | 'stopped' | 'failed' | 'other';

/** The statuses of a computer on its way to running: being made (creating, claiming, copying) or coming up (core's
 *  computerState 'starting' words). */
const MAKING: ReadonlySet<string> = new Set(['creating', 'claiming', 'copying', 'starting', 'provisioning', 'pending', 'restarting']);

/** The one parser of a list row's `status` for this page. */
export function phaseOf(status: unknown): Phase {
  if (typeof status !== 'string') return 'other';
  const v = status.toLowerCase();
  if (v === 'running') return 'running';
  if (MAKING.has(v)) return 'making';
  if (v === 'stopped' || v === 'paused') return 'stopped';
  if (v === 'failed') return 'failed';
  return 'other';
}

export interface Row {
  id: string;
  name: string;
  /** name.last4: how a link names it, never the full id. */
  handle: string;
  phase: Phase;
}

/** What blocks the first computer and needs the person; Home's setup panel holds the action for each. */
export type Block = 'invite' | 'capacity' | 'mailbox' | 'expired' | 'reinstalled' | 'unclaimed';

export type Stage =
  /** The first list read is out. */
  | { kind: 'loading' }
  /** The first list read failed: nothing is known. */
  | { kind: 'unread' }
  /** No computer row yet and nothing says why: the setup state is unread, unreadable, or says nothing either way. */
  | { kind: 'looking' }
  /** No computer row yet; the account's server is claimed. */
  | { kind: 'reserved' }
  /** A row exists and is being made. */
  | { kind: 'making'; computer: Row }
  | { kind: 'ready'; computer: Row }
  /** A row exists and is stopped (an account that has been here before). */
  | { kind: 'stopped'; computer: Row }
  | { kind: 'failed'; computer: Row }
  /** A row exists in a state this page does not know (ending, expired, a new word): Computers says what it is. */
  | { kind: 'unknown'; computer: Row }
  /** A shared (token) session that shows no computer: nothing about an account's setup is read for it. */
  | { kind: 'shared' }
  /** This realm holds no computer; another realm of the account does. */
  | { kind: 'elsewhere' }
  | { kind: 'blocked'; why: Block };

export interface Reads {
  /** The computer list: undefined while its first read is out, null when that read failed. */
  rows: readonly Row[] | null | undefined;
  /** The list answer is the whole list (one page): only then does "no row" mean "no computer". */
  whole: boolean;
  /** The setup state: undefined while unread or not asked for, null when its read failed. */
  setup: SetupState | null | undefined;
  /** An account session (default). False: a shared (token) session, for which no setup state is read. */
  account?: boolean;
  /** The computer the shell shows, when it is one of the rows. */
  currentId?: string;
}

const ORDER: readonly Phase[] = ['running', 'making', 'stopped', 'failed'];

/** The computer the screen is about: the shell's own when it is usable, else the furthest along. */
export function pickRow(rows: readonly Row[], currentId?: string): Row | undefined {
  const usable = rows.filter((r) => r.phase !== 'other');
  const current = usable.find((r) => r.id === currentId && r.phase === 'running');
  if (current) return current;
  return [...usable].sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase))[0];
}

function blockOf(s: SetupState): Block | null {
  if (s.kind === 'invite' || s.kind === 'capacity' || s.kind === 'mailbox' || s.kind === 'expired' || s.kind === 'reinstalled') return s.kind;
  // The account can still get its free computer and nothing has claimed it: Home offers it.
  if (s.kind === 'empty' && s.freeSetup === true) return 'unclaimed';
  return null;
}

export function stageOf(r: Reads): Stage {
  if (r.rows === undefined) return { kind: 'loading' };
  if (r.rows === null) return { kind: 'unread' };
  const computer = pickRow(r.rows, r.currentId);
  if (computer) {
    if (computer.phase === 'running') return { kind: 'ready', computer };
    if (computer.phase === 'making') return { kind: 'making', computer };
    if (computer.phase === 'stopped') return { kind: 'stopped', computer };
    return { kind: 'failed', computer };
  }
  // A computer is there in a state this page cannot name: never "looking for your first computer".
  const odd = r.rows.find((x) => x.id === r.currentId) ?? r.rows[0];
  if (odd) return { kind: 'unknown', computer: odd };
  if (r.account === false) return { kind: 'shared' };
  // The list is whole and empty, and the read that says why failed: that is a failed read, not a wait.
  if (r.whole && r.setup === null) return { kind: 'unread' };
  // Rows beyond the first page may exist, or the setup state is not read yet: no claim either way.
  if (!r.whole || !r.setup) return { kind: 'looking' };
  const why = blockOf(r.setup);
  if (why) return { kind: 'blocked', why };
  if (r.setup.kind === 'empty') {
    if (r.setup.accountComputers === true) return { kind: 'elsewhere' };
    // All realms: 'empty' without free setup is the free-tier status saying the server is claimed. In a realm that
    // answer says nothing about the server (accountComputers false or unknown): keep looking.
    if (r.setup.freeSetup === false && r.setup.accountComputers === undefined) return { kind: 'reserved' };
  }
  return { kind: 'looking' };
}

export type StepId = 'account' | 'server' | 'computer' | 'running';
export type StepState = 'done' | 'now' | 'next' | 'stuck';
export interface Step {
  id: StepId;
  state: StepState;
}

const STEPS: readonly StepId[] = ['account', 'server', 'computer', 'running'];
const line = (...states: StepState[]): Step[] => STEPS.map((id, i) => ({ id, state: states[i] ?? 'next' }));

/** The four steps for a stage. A step is 'done' only when the stage proves it. */
export function stepsOf(stage: Stage): Step[] {
  switch (stage.kind) {
    // Nothing past the account is read yet: no step is claimed as under way.
    case 'loading':
    case 'shared':
      return line('done', 'next', 'next', 'next');
    case 'looking':
      return line('done', 'now', 'next', 'next');
    // The read failed: nothing past the account is known, and nothing moves until the person tries again.
    case 'unread':
      return line('done', 'stuck', 'next', 'next');
    // The free server is claimed; nothing says a computer is being made on it (core/setup.ts): no step under way.
    case 'reserved':
      return line('done', 'done', 'next', 'next');
    case 'making':
      return line('done', 'done', 'done', 'now');
    case 'ready':
      return line('done', 'done', 'done', 'done');
    case 'stopped':
    case 'elsewhere':
    case 'unknown':
      return line('done', 'done', 'done', 'next');
    case 'failed':
      return line('done', 'done', 'done', 'stuck');
    case 'blocked':
      return line('done', 'stuck', 'next', 'next');
  }
}

/** The stages a later read can still move without the person doing anything. */
export function waits(stage: Stage): boolean {
  return stage.kind === 'looking' || stage.kind === 'making';
}

/**
 * The end step's line while What next is not there: a stage a later read can still move promises it ('pending'); a settled
 * one points at the buttons under it ('below'); the first read has no end step yet (null), so the tour opens on the first
 * card when it answers.
 */
export function endLine(stage: Stage): 'pending' | 'below' | null {
  if (stage.kind === 'loading') return null;
  return waits(stage) ? 'pending' : 'below';
}

/** Reads again every 5 s for 3 minutes, then every 30 s for 30 more, then stops and offers Check again. */
export const FAST_POLLS = 36;
export const SLOW_POLLS = 60;
export const FAST_MS = 5000;
export const SLOW_MS = 30_000;

/** How long to wait before read number `polls + 1`, or null when the page stops reading on its own. */
export function pollDelay(stage: Stage, polls: number): number | null {
  if (!waits(stage)) return null;
  if (polls < FAST_POLLS) return FAST_MS;
  if (polls < FAST_POLLS + SLOW_POLLS) return SLOW_MS;
  return null;
}

/** The steps as shown: once the page has stopped reading on its own, the step under way waits for the person. */
export function shownSteps(stage: Stage, polls: number): Step[] {
  const steps = stepsOf(stage);
  return waitNote(stage, polls) === 'paused' ? steps.map((x) => (x.state === 'now' ? { ...x, state: 'stuck' as const } : x)) : steps;
}

/** What the note under the plate says about the wait: nothing, "longer than usual", or "stopped checking". */
export function waitNote(stage: Stage, polls: number): 'slow' | 'paused' | null {
  if (!waits(stage) || polls < FAST_POLLS) return null;
  return polls < FAST_POLLS + SLOW_POLLS ? 'slow' : 'paused';
}

/** The first word of the account name; an all-lowercase user name reads as a name ("ada" becomes "Ada"). */
export function firstName(name: string | undefined): string | undefined {
  const word = name?.trim().split(/\s+/)[0];
  if (!word) return undefined;
  return word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** What to do once the computer runs, in the order a newcomer would try them. Each is a link into the page that holds it. */
export const NEXT = ['program', 'bot', 'chat', 'terminal', 'key', 'guide'] as const;
export type NextId = (typeof NEXT)[number];

/** The page that holds each action: an action shows only when this load serves that page. */
export const NEXT_PAGE: Readonly<Record<NextId, string>> = { program: 'programs', bot: 'bots', chat: 'bots', terminal: 'computers', key: 'keys', guide: 'guide' };

/**
 * The actions of the tour's last screen. Only once the computer runs (they act on it); only those whose page this load
 * serves; and making an API key only in a session that may act on the account (an access key session may not).
 */
export function nextActions(o: { stage: Stage; served: (page: string) => boolean; account: boolean }): NextId[] {
  if (o.stage.kind !== 'ready') return [];
  return NEXT.filter((id) => o.served(NEXT_PAGE[id]) && (id !== 'key' || o.account));
}

/** The cards, in the order a newcomer meets the ideas: a computer, what runs on it, who works on it, how it is kept apart. */
export const CARDS = ['computers', 'programs', 'files', 'agent', 'bots', 'scripts', 'realms', 'keys'] as const;
export type CardId = (typeof CARDS)[number];

/** A card's text stays a short read: the layout rule's budget for one region of explanation (anatomy `explain.budget`). */
export const CARD_BUDGET = 150;
