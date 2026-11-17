// ctx.ts: the Hub's context and the one liveness check: capture/alive and the
// realm selection and its generation.
//
// Contract:
//   - The core state is one small store: the page identity (frozen at boot), the identity the page shows
//     (from GET /users/auth/me), the realm selection and its generation, the selected computer (target),
//     the view generation and the sign-out flag. Only core modules write it; React reads it through
//     subscribe/snapshot (useSyncExternalStore).
//   - capture(target?) takes {account, realm, target, gen, page, view, vgen} when an action starts.
//   - alive(ctx) is false once: sign-out has started, the realm generation moved (switch, account change,
//     suspension, sign-out), storage no longer holds ctx.page (or, without a page, the account's session),
//     or the shown identity is not ctx.account. Accounts are compared as strings.
//   - vgen counts view changes. It is not part of alive: a caller bound to one view compares it itself.
//   - bump(reason) moves the generation and tells every listener; nothing captured before answers again.
import { holds, sessionUid, type PageIdentity } from './session';
import { createListeners } from './listeners';

export interface Target {
  readonly project: { readonly id: string };
  readonly container: { readonly id: string; readonly server_name?: string };
}

export interface ShownIdentity {
  readonly id: string | null;
  readonly email?: string;
  readonly username?: string;
  /** The account's display name (`alias` on /users/auth/me), trimmed; absent when it has none. */
  readonly alias?: string;
  readonly onboarding?: unknown;
  banned: boolean;
}

export interface Ctx {
  readonly account: string | null;
  readonly realm: string;
  readonly target: Target | null;
  readonly gen: number;
  readonly page: PageIdentity | null;
  readonly view: string;
  readonly vgen: number;
  /** Set once a pending notice was shown for this context (one notice per context). */
  pendingShown?: boolean;
}

export type BumpReason = 'switch' | 'fallback' | 'account' | 'signout' | 'logout' | 'suspended' | string;

export interface CoreSnapshot {
  readonly account: string | null;
  readonly realm: string;
  readonly gen: number;
  readonly target: Target | null;
  readonly identity: ShownIdentity | null;
  readonly switching: string | null;
  readonly loggingOut: boolean;
  readonly vgen: number;
}

interface State {
  page: PageIdentity | null;
  tokenRealm: string | null;
  identity: ShownIdentity | null;
  realm: string;
  gen: number;
  target: Target | null;
  view: string;
  vgen: number;
  loggingOut: boolean;
  switching: string | null;
}

const st: State = {
  page: null, tokenRealm: null, identity: null, realm: 'all', gen: 0, target: null, view: 'home', vgen: 0,
  loggingOut: false, switching: null,
};

type Listener = () => void;
type BumpListener = (reason: BumpReason, gen: number) => void;
// A listener's throw must not break the core: createListeners isolates it.
const listeners = createListeners();
const bumpListeners = new Set<BumpListener>();
let snap: CoreSnapshot | null = null;

function changed(): void {
  snap = null;
  listeners.emit();
}

/** Boot: the frozen page identity and, for a token session, its pinned realm. Called once by the shell. */
export function initCore(o: { page: PageIdentity | null; tokenRealm?: string | null; realm?: string }): void {
  st.page = o.page ? Object.freeze({ ...o.page }) : null;
  st.tokenRealm = o.page && o.page.kind === 'token' ? o.tokenRealm ?? null : null;
  if (o.realm !== undefined) st.realm = o.realm;
  changed();
}

export const page = (): PageIdentity | null => st.page;
export const tokenSession = (): boolean => !!st.page && st.page.kind === 'token';
export const tokenRealm = (): string | null => st.tokenRealm;
export const realm = (): string => st.realm;
export const gen = (): number => st.gen;
export const identity = (): ShownIdentity | null => st.identity;
export const loggingOut = (): boolean => st.loggingOut;
export const target = (): Target | null => st.target;
export const vgen = (): number => st.vgen;

/** The identity the page shows, as a string, or null before GET /users/auth/me answered. */
export function shownId(): string | null {
  return st.identity && st.identity.id != null ? String(st.identity.id) : null;
}

export function setIdentity(id: ShownIdentity | null): void {
  st.identity = id;
  changed();
}

export function setTarget(t: Target | null): void {
  st.target = t;
  changed();
}

/** A view change (the shell's navigation): vgen counts them. */
export function setView(view: string): void {
  st.view = view;
  st.vgen++;
  changed();
}

/** realm.ts only: the selection itself (the generation moves through bump). */
export function setRealm(r: string): void {
  st.realm = r;
  changed();
}

/** realm.ts only: the switch in progress (its target), or null. */
export function setSwitching(t: string | null): void {
  st.switching = t;
  changed();
}

/** Sign-out started: alive() is false for every context from here on. One way. */
export function startLoggingOut(): void {
  st.loggingOut = true;
  changed();
}

/** Moves the generation; every context captured before is dead. */
export function bump(reason: BumpReason): number {
  st.gen++;
  changed();
  for (const l of [...bumpListeners]) {
    try { l(reason, st.gen); } catch { /* the listener's own */ }
  }
  return st.gen;
}

export function onBump(l: BumpListener): () => void {
  bumpListeners.add(l);
  return () => { bumpListeners.delete(l); };
}

export function subscribe(l: Listener): () => void {
  return listeners.add(l);
}

export function snapshot(): CoreSnapshot {
  if (!snap) {
    snap = Object.freeze({
      account: shownId() || sessionUid(st.page), realm: st.realm, gen: st.gen, target: st.target, identity: st.identity,
      switching: st.switching, loggingOut: st.loggingOut, vgen: st.vgen,
    });
  }
  return snap;
}

/** The context of an action that starts now. */
export function capture(t?: Target | null): Ctx {
  return {
    account: shownId() || sessionUid(st.page), realm: st.realm, target: t || st.target || null, gen: st.gen,
    page: st.page, view: st.view, vgen: st.vgen,
  };
}

/** The context's session is gone: storage no longer holds its page (or, without one, its account's session). */
export function sessionGone(ctx: Ctx): boolean {
  return ctx.page ? !holds(ctx.page) : !!ctx.account && sessionUid(st.page) !== ctx.account;
}

/**
 * False for every context once sign-out has started. Otherwise the generation must be the captured one,
 * storage must still hold the captured session, and both the stored session's user and the shown
 * identity (once one is shown) must be the captured account.
 */
export function alive(ctx: Ctx | null | undefined): boolean {
  if (!ctx || st.loggingOut || ctx.gen !== st.gen || sessionGone(ctx)) return false;
  if (!ctx.account) return true;
  const shown = shownId();
  return sessionUid(st.page) === ctx.account && (shown === null || shown === ctx.account);
}

/** Back to the boot state; module-level listeners stay registered (session disposal, dispose.ts; tests). The generation
 *  only moves forward: a context captured before the reset never becomes alive again, not even for the same session
 *  booted again. */
export function resetCore(): void {
  const next = st.gen + 1;
  Object.assign(st, {
    page: null, tokenRealm: null, identity: null, realm: 'all', gen: next, target: null, view: 'home', vgen: 0,
    loggingOut: false, switching: null,
  });
  snap = null;
}
