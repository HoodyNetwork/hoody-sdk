// What a New script create says when it did not end live: a refusal code from the
// write route (exec) or the instantiate route (the agent), plus an optional fresh read, become a title, a body and the
// action that fixes it. Pure: the words are page string keys with their values; the page renders them.
//
// The route contract (routes.ts) decides what reaches here: core keeps a refusal's code only when the route lists it,
// and a listed unknownCode (OP_IN_PROGRESS, OP_OUTCOME_UNKNOWN) or a 5xx arrives as pending, never as failed. So
// `failed` here is always a definite refusal, `pending` always "may have been made" (C9).

/** How the create was sent: written by exec (code the person or the assistant wrote) or made from an idea by the agent. */
export type LiveVia = 'write' | 'idea';

/** The action that fixes the case, primary first. The page shows the words; wiring the actions is up to it. */
export type LiveAction = 'changeAddress' | 'tryAgain' | 'makeLive' | 'checkCode' | 'checkAgain' | 'back' | 'openScripts';

export interface LiveWordKey {
  key: string;
  vars?: Record<string, string | number>;
}

export interface LiveError {
  /** refused: nothing was changed (role=alert). unknown: it may have been made (role=status). not_sent: nothing left. */
  tone: 'refused' | 'unknown' | 'not_sent';
  title: LiveWordKey;
  body: LiveWordKey;
  /** A second line from a fresh read (ROUTE_EFFECT_CHANGED: what answers the address now), when one answered. */
  extra?: LiveWordKey;
  actions: LiveAction[];
}

/** A fresh route/resolve read made after the refusal: null = it answered "nothing", undefined = no read (or it failed). */
export type FreshAnswer = { name: string } | null | undefined;

export interface LiveInput {
  via: LiveVia;
  /** The create's outcome kind as the page holds it. */
  kind: 'failed' | 'pending' | 'not_sent';
  /** The refusal code core kept (listed codes only), if any. */
  code?: string | null;
  /** The computer's name and the address, as they were sent. */
  computer: string;
  route: string;
  /** An earlier send of this same create (same computer and path, this mount) ended unknown: its effect may be what refuses now. */
  afterUnknown?: boolean;
  /** For ROUTE_EFFECT_CHANGED: a separate fresh read of what answers the address now. */
  fresh?: FreshAnswer;
}

const k = (key: string, vars?: Record<string, string | number>): LiveWordKey => (vars ? { key, vars } : { key });

/** The write route's definite refusal codes and its may-have-gone-through codes (routes.ts carries the same lists). */
export const WRITE_CODES = ['REVISION_MISMATCH', 'ROUTE_EFFECT_CHANGED', 'UNROUTABLE_PATH', 'INVALID_REVISION', 'INVALID_PATH', 'INVALID_EXPECT_ROUTE', 'OP_FENCED', 'OP_ID_REUSED'] as const;
export const WRITE_UNKNOWN_CODES = ['OP_IN_PROGRESS', 'OP_OUTCOME_UNKNOWN'] as const;
/** The instantiate route's codes. `outcome_unknown` may have gone through, but it is a 503: core already makes every 5xx
 *  pending (unknownCodes are for 404/409 only), so it is listed here just to keep its code, never as a refusal.
 *  `not_logged_in` and `hoody_auth_expired` (409) are the agent's own sign-in state (deploy.ts LOGIN_REFUSALS): listed so the
 *  page can say so and offer the sign-in, instead of "refused it". */
export const INSTANTIATE_CODES = ['script_exists', 'path_reserved', 'template_needs_token', 'caller_key_unplaceable', 'idempotency_key_reused', 'outcome_unknown', 'not_logged_in', 'hoody_auth_expired'] as const;

/**
 * script_exists after an unknown send of the same idea (same computer and path, this mount) may be that send's own effect:
 * the agent made the script and the later key finds it. It is not a refusal (C9): the page takes it as pending, so the
 * banner, the lock and Check again (which reads the computer's list) are an unknown outcome's, never a failed one's.
 * Any other answer passes through unchanged.
 */
export function promoteAfterUnknown<A extends { outcome: string; code?: string }>(answer: A, afterUnknown: boolean): A {
  return afterUnknown && answer.outcome === 'failed' && answer.code === 'script_exists' ? { ...answer, outcome: 'pending' } : answer;
}

export function liveError(x: LiveInput): LiveError {
  const at = { route: x.route, computer: x.computer };
  if (x.kind === 'not_sent') return { tone: 'not_sent', title: k('live.notMade'), body: k('live.notSent'), actions: ['tryAgain'] };
  const unknown = (): LiveError => ({ tone: 'unknown', title: k('live.unknown.title'), body: k('live.unknown.body', { computer: x.computer }), actions: ['checkAgain'] });
  // A promoted script_exists (promoteAfterUnknown) keeps its own words: an earlier try may have made it.
  if (x.kind === 'pending' && x.via === 'idea' && x.code === 'script_exists') return { tone: 'unknown', title: k('live.unknown.title'), body: k('live.existsAfterUnknown', at), actions: ['checkAgain', 'openScripts'] };
  if (x.kind === 'pending') return unknown();
  const refused = (title: LiveWordKey, body: LiveWordKey, actions: LiveAction[], extra?: LiveWordKey): LiveError => ({ tone: 'refused', title, body, ...(extra ? { extra } : {}), actions });
  const code = x.code ?? null;
  if (x.via === 'write') {
    // A create is sent with ifRevision null: a revision refusal means a script was saved at the path after the check.
    if (code === 'REVISION_MISMATCH') return refused(k('live.taken.title'), k('live.taken.body', at), ['changeAddress']);
    if (code === 'ROUTE_EFFECT_CHANGED') {
      const extra = x.fresh === undefined ? undefined : x.fresh === null ? k('live.route.none', { route: x.route }) : k('live.route.now', { name: x.fresh.name });
      return refused(k('live.route.title'), k('live.route.body', { route: x.route }), ['changeAddress', 'tryAgain'], extra);
    }
    if (code === 'UNROUTABLE_PATH') return refused(k('live.unroutable.title'), k('live.unroutable.body', { route: x.route }), ['changeAddress']);
    if (code === 'OP_FENCED') return refused(k('live.notMade'), k('live.fenced.body', { computer: x.computer }), ['makeLive']);
    // A 400 without a code (a validation failure, an excluded path, malformed content) is neutral: it never says the code
    // has problems; Check the code again asks for a fresh validation.
    if (code === null) return refused(k('live.notMade'), k('live.refused.body', { computer: x.computer }), ['checkCode', 'back']);
    return refused(k('live.notMade'), k('live.refused.body', { computer: x.computer }), ['back']);
  }
  // From an idea: script_exists after an unknown first send may be that send's own effect (the agent makes the script
  // once per key, a later key finds it): read as unknown until a read of the computer decides.
  // (The page never gets here with afterUnknown: promoteAfterUnknown made it pending. Kept unknown for any other caller.)
  if (code === 'script_exists') return x.afterUnknown ? { tone: 'unknown', title: k('live.unknown.title'), body: k('live.existsAfterUnknown', at), actions: ['checkAgain', 'openScripts'] } : refused(k('live.exists.title'), k('live.exists.body', at), ['changeAddress']);
  if (code === 'path_reserved') return refused(k('live.reserved.title'), k('live.reserved.body', { route: x.route }), ['changeAddress', 'tryAgain']);
  if (code === 'template_needs_token' || code === 'caller_key_unplaceable') return refused(k('live.notMade'), k('live.ideaHere'), ['back']);
  // The agent's own sign-in state: nothing was made. No action of its own: the step shows the sign-in beside it, and the
  // reservation's Try again sends the same request once the agent is signed in (deploy.ts stores it didnt).
  if (code === 'not_logged_in') return refused(k('live.notMade'), k('live.agentSignedOut', { computer: x.computer }), []);
  if (code === 'hoody_auth_expired') return refused(k('live.notMade'), k('live.agentRejected', { computer: x.computer }), []);
  return refused(k('live.notMade'), k('live.refused.body', { computer: x.computer }), ['back']);
}
