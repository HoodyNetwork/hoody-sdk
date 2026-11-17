// Resume in a new chat (money may be spent). A failed or cancelled run resumes only from a chat whose realm, folder, computer and
// account are the run's (the agent refuses any other). When the run's own chat cannot take the Resume (busy, gone, asks
// before every tool, cannot be kept open), the page can make a new chat in the run's place and resume the run there.
// Two sends, chained, each sent once:
//   1. The create (this file): a `chat` agent in the run's folder, realm and computer, keyed. Only its own answer proves
//      it: the session id plus the agent's frozen binding (realm, computer, account) naming the place asked for. Another
//      binding is refused and that chat never used; an answer without the evidence, or a lost one, is `unsure`. No answer
//      proves the chat it names is this create's, so the page never deletes one: an unused chat is an empty draft the agent
//      discards by itself.
//   2. The Resume into the chat the create proved, through the run's action store (runActions.ts `chat`), so the
//      one-Resume fence and the listing checks stay in one place. Runs.tsx sends it only with the id `make` returned.
// A lost create answer cannot be read back from here: reading a create by its key belongs to the chat journal
// (ask/journal), so `unsure` stays until the person stops tracking it, and the create is never sent again. A chat made that
// way is an empty draft the agent discards once no client has held it for 5 minutes; nothing was resumed into it.
import { agentLoginOf, agentSignInRoutes, api, isRealmOrGlobal, newKey, outcomeOf, type Ctx, type Target } from '@core';
import { capsOk, checkStarted, gatedCreate, routes as askRoutes, seg } from '@ask/io';
import { sessionRoutes } from '../../settings/rules/routes';
import type { Run } from './runs';

/** The create body: the agent's plain chat in the run's folder, default approvals, and the binding it must start with. */
export interface NewChatBody {
  agent: 'chat'; realm: string; computer: string; cwd: string;
  tool_mode: 'standard'; dir_scope: 'home'; approval: { mode: 'default' };
  expected_binding: { realm: string; computer: string; cwd: string };
}
/** The calls, each in the context it is given. */
export interface NewChatIo {
  status(ctx: Ctx): Promise<unknown>;
  version(ctx: Ctx): Promise<unknown>;
  create(ctx: Ctx, realm: string, body: NewChatBody, key: string): Promise<unknown>;
}
/** Why no chat was made: the agent is not ready for this account or cannot bind the computer (`notReady`), nothing left
 *  (`notSent`), the agent refused the create (`refused`), or the chat it named has another binding (`binding`, never used). */
export type NewChatWhy = 'notReady' | 'notSent' | 'refused' | 'binding';
export type NewChatView =
  | { phase: 'idle' }
  | { phase: 'making' }
  /** Proven by the create's answer; the Resume into it is the action store's. */
  | { phase: 'made'; sid: string }
  | { phase: 'refused'; why: NewChatWhy }
  /** A chat may have been made (lost or unreadable answer). Never sent again; only Stop tracking ends it. */
  | { phase: 'unsure' };
/** A context, or a reader of it called right before each step: null sends nothing. */
export type CtxIn = Ctx | null | (() => Ctx | null);
const ctxOf = (c: CtxIn): Ctx | null => (typeof c === 'function' ? c() : c);

export interface NewChatStore {
  view(): NewChatView;
  subscribe(fn: () => void): () => void;
  /** Makes the chat for `run` once; the proven session id, or null (refused, unsure, or not allowed now). */
  make(run: Run, ctx: CtxIn): Promise<string | null>;
  /** Whether a create may be sent now: none is out or unsure. */
  offers(): boolean;
  /** The run's own chat refused its Resume for its state: from now on the new chat is offered for this run. */
  want(): void;
  wanted(): boolean;
  /** Stop tracking an unsure create (the person's choice). */
  forget(): void;
  /** Dismisses a settled message (refused); an unsure one stays. */
  clear(): void;
}

/** Whether a new chat can carry `run` here: the run was bound to the computer shown and has an exact folder. */
export function newChatFits(run: Run, target: Target | null): boolean {
  return !!target && !!run.binding && run.binding === target.container.id && !!run.folder && isRealmOrGlobal(run.realm);
}

export function bodyOf(run: Run, computer: string): NewChatBody {
  const cwd = run.folder ?? '';
  return {
    agent: 'chat', realm: run.realm, computer, cwd, tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' },
    expected_binding: { realm: run.realm, computer, cwd },
  };
}

export function createNewChatStore(io: NewChatIo, key: () => string = newKey): NewChatStore {
  let v: NewChatView = { phase: 'idle' };
  let wants = false;
  const subs = new Set<() => void>();
  const set = (n: NewChatView) => { v = n; for (const f of [...subs]) f(); };
  const no = (why: NewChatWhy) => { set({ phase: 'refused', why }); return null; };
  return {
    view: () => v,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    offers: () => v.phase !== 'making' && v.phase !== 'unsure',
    want() { if (!wants) { wants = true; for (const f of [...subs]) f(); } },
    wanted: () => wants,
    async make(run, ctxIn) {
      if (v.phase === 'making' || v.phase === 'unsure') return null;
      set({ phase: 'making' });
      const first = ctxOf(ctxIn);
      if (!first || !newChatFits(run, first.target)) return no('notSent');
      const computer = first.target!.container.id;
      // The agent must be signed in as this account (its owner is the binding the answer is checked against) and bind
      // the computer a create names.
      let status: unknown, version: unknown;
      try { status = await io.status(first); version = await io.version(first); } catch { return no('notSent'); }
      const owner = (status as { owner_fingerprint?: unknown } | null)?.owner_fingerprint;
      if (agentLoginOf(status, first.account) !== 'ready' || typeof owner !== 'string' || !owner || !capsOk(version)) return no('notReady');
      // The place is read again right before the send: a page that moved meanwhile sends nothing.
      const ctx = ctxOf(ctxIn);
      if (!ctx || ctx.gen !== first.gen || ctx.target?.container.id !== computer) return no('notSent');
      let res: unknown;
      try {
        res = await io.create(ctx, run.realm, bodyOf(run, computer), key());
      } catch (e) {
        // gatedCreate refuses before the create leaves when the gateway stopped binding the computer: nothing left.
        if ((e as { gate?: unknown } | null)?.gate === 'computer_binding') return no('notReady');
        const o = outcomeOf(e, true);
        if (o === 'pending') { set({ phase: 'unsure' }); return null; }
        return no(o === 'not_sent' || o === 'stale' ? 'notSent' : 'refused');
      }
      const sid = (res as { session_id?: unknown } | null)?.session_id;
      const bad = checkStarted(res, { realm: run.realm, container: computer, owner });
      if (!seg(sid)) { set({ phase: 'unsure' }); return null; }
      // MISMATCH: well-formed evidence of another place. MISSING: the answer lacks the evidence, so nothing is proven
      // (unsure). Either way that chat is never used, and never deleted: the answer does not prove it is this create's (it
      // may name a chat someone already uses).
      if (bad) {
        if (bad === 'MISMATCH') return no('binding');
        set({ phase: 'unsure' });
        return null;
      }
      set({ phase: 'made', sid });
      return sid;
    },
    forget() { if (v.phase === 'unsure') set({ phase: 'idle' }); },
    clear() { if (v.phase === 'refused') set({ phase: 'idle' }); },
  };
}

export const liveNewChatIo: NewChatIo = {
  status: (ctx) => api(agentSignInRoutes.status, { ctx, recovers: true }),
  version: (ctx) => api(askRoutes.version, { ctx, recovers: true }),
  create: (ctx, realm, body, k) => gatedCreate(() => api(askRoutes.version, { ctx, recovers: true }), () => api(sessionRoutes.create, { ctx, realm, body, idem: k, recovers: true })),
};
