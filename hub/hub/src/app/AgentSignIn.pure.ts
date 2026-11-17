// The agent sign-in's hook and its state types (split out of AgentSignIn.tsx so the terminal build shares them; the
// rules are at the top of AgentSignIn.tsx). AgentSignIn.tsx re-exports every name here and keeps the box.
import { capture, checkAgentLogin, signInAgent, signInOffered, signInUnsure, subscribeSignInUnsure, watchComputer, type SignInResult, type Target } from '@core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** What the box needs of a computer. `agent.writer`: the place's work can go (the assistant is ready); `writerWhy` says why not
 *  ('login': signed out; 'account': another account; 'identity': it has not said which). `agentRealm` null: no realm chosen, and
 *  the place needs one (undefined: the place needs none). */
export interface SignInComp {
  id: string;
  name: string;
  agentRealm?: string | null;
  agent: { writer: boolean; writerWhy?: string; signIn?: 'offer' | 'renew' };
}

/** The page's own status read, read again now: true when it shows the agent ready for this account. */
export type Reread = (comp: SignInComp) => Promise<boolean>;

/** What the last press or Check again found, as the box shows it. 'continue': signed in, but the page does not show it ready yet. */
export type SignInShown = Exclude<SignInResult, { kind: 'stale' } | { kind: 'signedIn' }> | { kind: 'signedIn'; continue: boolean };

export interface AgentSignInState {
  /** The box shows: the agent is signed out and this session may sign it in ('renew': its login was rejected). */
  box: 'offer' | 'renew' | null;
  /** This session may sign agents in (a live account session, never shared access), whatever the box shows now: the notes read
   *  this, never the box (a hold hides the box, it does not make the owner a shared-access viewer). */
  offered: boolean;
  checked: boolean;
  setChecked: (v: boolean) => void;
  /** The press may go: the place's work is ready; or a sign-in is proven (the press reads the status again); or the box is shown,
   *  ticked, a realm chosen where one is needed, and no result holds it (may have been signed in, or not allowed). */
  canPress: boolean;
  busy: boolean;
  /** A sign-in is under way (the press), not a status read. */
  pressing: boolean;
  shown: SignInShown | null;
  /** The press: the place's work now when it is ready, else sign in first (when ticked). */
  press: () => Promise<void>;
  /** Check again: one status read, then the page's own status read. Never sends. */
  check: () => Promise<void>;
}

/** What a place shows for core's hold (below): the unknown outcome, as if its own press had found it. */
const UNSURE_SHOWN: SignInShown = { kind: 'unknown' };

/** The computer the Hub shows, when it is `comp`'s; else null (the press does nothing). */
const shownAs = (comp: SignInComp | undefined): Target | null => {
  const t = capture().target;
  return comp && t && t.container?.id === comp.id ? t : null;
};

/** The sign-in of one place. `send`: the place's own work after the sign-in (the ask), read at each render and called with the page
 *  as it is then; null when the sign-in is all the place does. `reread`: the page's own status read. `view`: the place's own
 *  lifetime (the drawer passes open or closed); a new one, like another computer, starts over and drops what an older press or
 *  Check again would still show or send. */
export function useAgentSignIn(comp: SignInComp | undefined, send: (() => void) | null, reread: Reread, view = ''): AgentSignInState {
  const agent = comp?.agent;
  const offered = signInOffered(capture());
  // On by default and never remembered: a new view, or another computer, starts ticked again.
  const [checked, setChecked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [shown, setShown] = useState<SignInShown | null>(null);
  // What this view already did, kept apart from what it shows: 'proven' (a status read said signed in) or 'unknown' (a sign-in may
  // have gone through). Either way no second sign-in in this view (C9), whatever the words show later; a new view starts over.
  const [hold, setHold] = useState<'proven' | 'unknown' | null>(null);
  // Core's hold (agent-signin.ts, C9): a sign-in of this computer that ended unknown anywhere (an earlier view, a list since
  // unmounted, another place, the Ask dock) holds this view too, until a status read ends it there: no box, its words and
  // Check again. A new view never starts over past it.
  const unsureNow = useCallback(() => { const t = shownAs(comp); return !!t && signInUnsure(capture(), t); }, [comp]);
  const unsure = useSyncExternalStore(subscribeSignInUnsure, unsureNow, unsureNow);
  const held = hold ?? (unsure ? 'unknown' : null);
  const box = agent && !agent.writer && agent.writerWhy === 'login' && offered && !held ? (agent.signIn ?? 'offer') : null;
  // The page says another account holds the agent, or it has not said which: its note wins over any earlier result's words.
  const blocker = agent?.writerWhy === 'account' || agent?.writerWhy === 'identity';
  const viewKey = `${comp?.id ?? ''}\u0000${view}`;
  const compId = comp?.id ?? '';
  // This view's number: bumped on another computer or a new view. A press or Check again publishes only into the view it began in.
  const gen = useRef(0);
  // The ask held for after the proof: the view it is for. Sent once, when the page shows the place ready there.
  const owed = useRef<number | null>(null);
  // Bumped when an ask is held: recording it runs the reconciliation below again, against the page as it is now.
  const [owedRev, setOwedRev] = useState(0);
  useEffect(() => { gen.current++; owed.current = null; setChecked(true); setShown(null); setHold(null); }, [viewKey]);
  // Core moves the Hub's computer before React renders the move: leaving it at all, even away and back between two renders, ends
  // what this view started.
  useEffect(() => (compId ? watchComputer(compId, () => { gen.current++; owed.current = null; }) : undefined), [compId]);
  const sendNow = useRef(send);
  const rereadNow = useRef(reread);
  const flight = useRef(false);
  useEffect(() => { sendNow.current = send; rereadNow.current = reread; });
  const sendOwed = useCallback(() => { owed.current = null; setShown(null); sendNow.current?.(); }, []);
  useEffect(() => {
    if (owed.current === null) return;
    if (owed.current !== gen.current) { owed.current = null; return; }
    if (agent?.writer) { sendOwed(); return; }
    // The page now says something else stops the place (another account, no realm, an old agent): nothing is sent; its note shows
    // (the renderer), and the hold keeps any new sign-in out.
    if (agent?.writerWhy && agent.writerWhy !== 'login' && agent.writerWhy !== 'loading') { owed.current = null; setShown(null); }
  }, [viewKey, agent?.writer, agent?.writerWhy, owedRev, sendOwed]);

  // The page's status read again, after a proof. With an ask: it goes once the page shows the place ready (the effect above, which
  // recording the held ask runs again, so a page already ready sends it); not ready per this read: the proven words, the person
  // presses again. Without one: the proven words, and Check again while the page does not show it ready yet.
  const followProof = useCallback(async (c: SignInComp, g: number) => {
    if (gen.current !== g) return;
    if (!sendNow.current) {
      const ready = await rereadNow.current(c);
      if (gen.current === g) setShown({ kind: 'signedIn', continue: !ready });
      return;
    }
    owed.current = g;
    setOwedRev((n) => n + 1);
    const ready = await rereadNow.current(c);
    if (gen.current !== g || owed.current !== g) return; // another view since, or the effect already sent it
    if (ready) return; // the owed effect sends it, now or once the page shows the place ready
    owed.current = null;
    setShown({ kind: 'signedIn', continue: true });
  }, []);

  const press = useCallback(async () => {
    if (!comp || flight.current) return;
    if (comp.agent.writer) {
      if (!send) return;
      owed.current = null; setShown(null); send(); return;
    }
    // C9: after "may have been signed in" only Check again reads; after "not allowed" nothing is sent. Never a second sign-in.
    if (held === 'unknown' || shown?.kind === 'notAllowed') return;
    if (held === 'proven' && blocker) return;
    if (!held && (!box || !checked || comp.agentRealm === null)) return;
    const g = gen.current;
    flight.current = true;
    setBusy(true);
    try {
      // Already proven signed in: read the page's status again, never sign in again.
      if (hold === 'proven') { await followProof(comp, g); return; }
      setShown(null);
      const t = shownAs(comp);
      if (!t) return;
      setPressing(true);
      const r = await signInAgent(capture(), t);
      if (r.kind === 'stale' || gen.current !== g) return;
      if (r.kind === 'unknown') setHold('unknown');
      if (r.kind !== 'signedIn') { setShown(r); return; }
      // Proven by the agent's status. The page's own status read follows; the ask goes once it shows the place ready.
      setHold('proven');
      await followProof(comp, g);
    } finally {
      flight.current = false;
      setBusy(false);
      setPressing(false);
    }
  }, [comp, box, checked, send, shown, hold, held, blocker, followProof]);

  const check = useCallback(async () => {
    const t = shownAs(comp);
    if (!comp || !t || flight.current) return;
    const g = gen.current;
    flight.current = true;
    setBusy(true);
    try {
      const r = await checkAgentLogin(capture(), t);
      if (r === 'stale' || gen.current !== g) return;
      if (r === 'unread') return; // nothing new: what was shown stays
      const ready = await rereadNow.current(comp);
      if (gen.current !== g) return; // another computer or view since: nothing from this read shows there
      // Signed out now does not end "may have been signed in": that sign-in may still finish, so no second one (C9). Only a
      // ready read turns it into proven; a new view starts over. Without a send (the box's own button), "signed in" needs the
      // page's own read too; until then the unconfirmed words and Check again stay (the hold hides the box, so they are all
      // the place shows).
      const own = !sendNow.current;
      if (r === 'ready') setHold('proven');
      setShown((was) => (r === 'ready' ? { kind: 'signedIn', continue: own ? !ready : true }
        : was?.kind === 'unknown' ? was
          : own && was?.kind === 'signedIn' ? { kind: 'signedIn', continue: true } : null));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }, [comp]);

  const canPress = !!agent && ((agent.writer && !!send) || (held === 'proven' && !blocker) || (!held && shown?.kind !== 'notAllowed' && !!box && checked && comp?.agentRealm !== null));
  return { box, offered, checked, setChecked, canPress, busy, pressing, shown: shown ?? (!hold && unsure && !!agent && !agent.writer && agent.writerWhy === 'login' ? UNSURE_SHOWN : null), press, check };
}
