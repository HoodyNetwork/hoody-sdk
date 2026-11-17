// One place's asks of the writing assistant, shared by New script and the Ask drawer: the single-flight change (C9: a second
// press while one is out sends nothing), the Check again that reads a pending ask back (its turn is never sent again), the warned
// close of an ask whose outcome stays unknown, and Stop. Whether an ask is open at the place is what the store says (writer.ts):
// the banner follows it, so a view opened again, another tab or a reload finds the ask pending (with Check again and the warned
// close) and a press there continues it. A view that shows the place delivers an answer with one claim of the stored ask: the
// winner shows it, any other caller (a late read, another view, the warned close) shows nothing and changes no banner.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAiTurn, useAskStore } from '../data';
import type { AiAnswer } from '../writer';
import type { CompScripts } from '../types';
import type { Place } from '../writer';
import { useChange } from './ops';

export interface AskResult {
  /** The assistant's whole answer, only when it finished. */
  reply?: string;
  /** What ended it when it did not finish (the agent's code, or the page's: NO_CEILING, BINDING, NOT_WIRED...); undefined: pending or finished. */
  code?: string;
  outcome: AiAnswer['outcome'];
  /** The ask's own banner already says why it ended (a failed or unsent ask): the caller adds no second line. */
  banner?: true;
  /** What the press hid from the ask's text, as the writer holds it for the ask this answer is of (undefined: none held). Never stored. */
  values?: unknown;
  /** The press found an ask already out at its place and continued it: the answer is of that ask, not of the prompt this press made. */
  joined: boolean;
}

const keyOf = (p: Place | null): string => (p ? JSON.stringify([p.compId, p.path, p.realm ?? null, p.owner ?? null]) : '');
const final = (o: AiAnswer['outcome']): boolean => o === 'done' || o === 'failed' || o === 'not_sent';

export function useAsk(scope: string, comp: CompScripts | undefined, path: string | null) {
  const ai = useAiTurn();
  useAskStore();
  const place = useMemo<Place | null>(() => (comp ? { compId: comp.id, path, realm: comp.agentRealm ?? null, owner: comp.agent.writerOwner } : null), [comp, path]);
  // The banner belongs to the whole place (computer, script, realm and owner), not only to the caller's scope.
  const at = `${scope}\u0000${keyOf(place)}`;
  // An ask stored at this place (by this view, an earlier one, another tab or before a reload) is pending whenever the place is shown.
  const opened = place ? ai.open(place) : false;
  const openNow = opened === true;
  const ch = useChange(at, { pending: openNow });
  // The banner follows the store: pending while an ask is open at the place, free once none is (it was delivered, or closed
  // knowingly, by whichever view or tab). A press in flight owns its own banner (busy), and a failure banner is left alone. A store
  // that cannot be read proves nothing either way: the banner stays as it is until a read says whether the ask is out.
  const kind = ch.out?.kind;
  const { hold, settle } = ch;
  useEffect(() => {
    if (!place || opened === 'unreadable') return;
    if (!openNow && kind === 'pending') settle();
    else if (openNow && kind === undefined) hold();
  }, [place, opened, openNow, kind, hold, settle]);
  // Where the view is now: an answer is shown only by a view that still shows the place that asked for it.
  const here = useRef<string | null>(at);
  useEffect(() => {
    here.current = at;
    return () => { here.current = null; };
  });
  // Asked by the claim once it holds the store: only a view that still shows the place consumes the stored answer.
  const eligible = useCallback((): boolean => here.current === at, [at]);
  const ask = useCallback(async (text: string, values?: unknown): Promise<AskResult | null> => {
    if (!comp || !text.trim() || !place) return null;
    let took = false;
    let held: unknown;
    let joined = false;
    const r = await ch.run(async () => {
      const a = await ai.mutateAsync({ compId: comp.id, path, text, realm: comp.agentRealm ?? undefined, owner: comp.agent.writerOwner, values });
      // Read before the claim: the claim ends the ask and deletes them.
      held = ai.valuesOf(a);
      joined = ai.joined(a);
      // Pending is the ask's own banner; a run that lost its ask (stale, SUPERSEDED) has nothing to show and frees the banner.
      if (!final(a.outcome)) { took = a.outcome === 'pending'; return a; }
      // The answer is delivered by one claim, made before the banner records anything: a view that left the place leaves it stored
      // (the next view there reads it again), and the loser of the claim shows nothing and is not locked by it.
      if (here.current !== at) return a;
      if (await ai.claim(a, eligible)) { took = here.current === at; return a; }
      return { outcome: 'pending' as const, code: 'ASK_CLAIMED' };
    });
    if (!r || !took) return null;
    return { outcome: r.outcome, ...(r.data ? { reply: r.data.reply } : {}), ...(r.code ? { code: r.code } : {}), ...(r.outcome === 'failed' || r.outcome === 'not_sent' ? { banner: true as const } : {}), ...(held !== undefined && r.outcome === 'done' ? { values: held } : {}), joined };
  }, [ai, ch, comp, path, place, at, eligible]);
  /** Read the pending ask again: its answer when it is in, what ended it, or null when it is still out (the banner stays). */
  const check = useCallback(async (): Promise<AskResult | null> => {
    if (!place) return null;
    const r = await ai.check(place);
    // A read cut off by a change of account or computer proves nothing: the ask stays pending.
    if (!r || r.outcome === 'pending' || r.outcome === 'stale') return null;
    // Only a view that still shows the place takes the answer, and only the winner of the claim shows it. The loser changes no banner:
    // the banner follows the store (the ask is gone, or it is a newer ask's).
    // The hidden values are read before the claim, which ends the ask and deletes them.
    const held = ai.valuesOf(r);
    if (here.current !== at || !(await ai.claim(r, eligible)) || here.current !== at) return null;
    ch.settle();
    return { outcome: r.outcome, ...(r.data ? { reply: r.data.reply } : {}), ...(r.code ? { code: r.code } : {}), ...(held !== undefined && r.outcome === 'done' ? { values: held } : {}), joined: false };
  }, [ai, ch, place, at, eligible]);
  /** The warned "Close without knowing": the stored ask is ended (its turn is not read again). The banner follows the store and closes with it. */
  const force = useCallback((): void => {
    if (place) void ai.discard(place);
  }, [ai, place]);
  const stop = useCallback(async (): Promise<void> => { if (place) await ai.cancel(place); }, [ai, place]);
  return { ...ch, force, ask, check, stop };
}

export type WriterNote = 'new.noWriter' | 'new.writerShared' | 'signin.shared' | 'new.writerOtherAccount' | 'new.writerIdentity' | 'new.writerPickRealm';

/** Why the assistant is not there, one line per state (AgentSignIn shows it): nothing while the agent's report is still coming, nor
 *  for a signed-out agent this session may sign in (the sign-in box shows instead). `offered`: core's signInOffered (never in a
 *  shared-access session); `myself`: the place has Write the code myself, which the shared-access line names. */
export function writerNote(agent: CompScripts['agent'] | undefined, o: { offered: boolean; myself: boolean }): WriterNote | null {
  if (!agent || agent.writer || agent.writerWhy === 'loading') return null;
  switch (agent.writerWhy) {
    case 'realm': return 'new.writerPickRealm';
    case 'login': return o.offered ? null : o.myself ? 'new.writerShared' : 'signin.shared';
    case 'account': return 'new.writerOtherAccount';
    case 'identity': return 'new.writerIdentity';
    default: return 'new.noWriter';
  }
}

/** The agent's turn codes for a turn it ended at once, each with its own sentence (the agent: no model credential,
 *  another unconfigured session, a delegated agent not signed in, the realm gate unreadable or refusing). */
const AGENT_TURN_NOTES = {
  no_credentials: 'ai.err.noCredentials',
  session_unconfigured: 'ai.err.unconfigured',
  auth: 'ai.err.agentAuth',
  restriction_unknown: 'ai.err.realmUnknown',
  realm_not_allowed: 'ai.err.realmNotAllowed',
} as const;

/** An agent's own code as a receipt carries it (lower case, writer.ts receiptOf); the Hub's own codes are upper case, and
 *  `failed` is a turn state that names no reason. */
const AGENT_CODE = /^[a-z][a-z0-9_.-]{0,63}$/;

type AskNoteKey = 'ai.err.cancelled' | 'ai.err.ceiling' | 'ai.err.binding' | 'ai.err.unavailable' | 'ai.err.norecord' | 'ai.err.notkept' | 'ai.err.earlier' | 'ai.err.unknown' | 'ai.err.unknownCode' | (typeof AGENT_TURN_NOTES)[keyof typeof AGENT_TURN_NOTES];

/** The line for what ended an ask without an answer (its code), as the drawer, the form and the banner say it. An agent code with
 *  no sentence of its own is shown in the line (`ai.err.unknownCode`, `{{code}}` from askNoteVars). */
export function askNoteKey(code: string | undefined): AskNoteKey {
  if (code === 'cancelled') return 'ai.err.cancelled';
  if (code === 'NO_CEILING') return 'ai.err.ceiling';
  if (code === 'BINDING') return 'ai.err.binding';
  if (code === 'NOT_WIRED' || code === 'NO_REALM') return 'ai.err.unavailable';
  if (code === 'NO_RECORD') return 'ai.err.norecord';
  if (code === 'NOT_KEPT') return 'ai.err.notkept';
  if (code === 'EARLIER_UNSENT') return 'ai.err.earlier';
  if (code !== undefined && Object.prototype.hasOwnProperty.call(AGENT_TURN_NOTES, code)) return AGENT_TURN_NOTES[code as keyof typeof AGENT_TURN_NOTES];
  if (code !== undefined && code !== 'failed' && AGENT_CODE.test(code)) return 'ai.err.unknownCode';
  return 'ai.err.unknown';
}

/** The values askNoteKey's line takes: the code, for `ai.err.unknownCode`. */
export function askNoteVars(code: string | undefined): { code: string } {
  return { code: code ?? '' };
}
