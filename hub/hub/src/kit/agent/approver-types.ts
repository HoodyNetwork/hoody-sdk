// The approver lease module's public shapes. Types only.
import type { Route, Target, Ticket, agent } from '@core';
import type { Clock, Custody, createCustody } from './approver-custody';

export type ApproverPhase = 'none' | 'acquiring' | 'held' | 'elsewhere' | 'expired' | 'failing' | 'gone';
export interface ApproverState { phase: ApproverPhase; generation?: number; expiresAt?: number; refusedAt?: number }
/** `target`: the computer's address for its calls (the computer id alone names the record; `approvers()` needs it to send). */
export interface ApproverRef { readonly computer: string; readonly realm: string; readonly sid: string | null; readonly target?: Target }
export interface ApproverHandle {
  readonly sid: string | null;
  setStrict(on: boolean): void;
  /** create: (routes.create, key) from a sid-less handle; attach: (routes.attach, null). null when closed, of another account, or reset. */
  mintTicket(route: Route, idem: string | null): Ticket | null;
  /** Displayed held only. `lease_generation` goes on routes.confirm. */
  decide(route: Route): { ticket: Ticket; lease_generation?: number } | null;
  close(): void;
}
export type ApproverApi = agent.ApproverApi;
export interface ApproverRoutes { acquire: Route; renew: Route; release: Route }
export interface ApproverDeps {
  api(ref: ApproverRef): ApproverApi;
  routes: ApproverRoutes;
  clock?: Clock;
  holder?: string;
  account?: () => string;
  claim?: Parameters<typeof createCustody>[0]['claim'];
  /** Tests only: sees the custody once, to read ground truth (never a capability). */
  spy?: (c: Custody) => void;
}
export interface ApproverManager {
  open(ref: ApproverRef, o?: { strict?: boolean }): ApproverHandle;
  state(ref: ApproverRef): ApproverState;
  takeOver(ref: ApproverRef): Promise<ApproverState>;
  subscribe(fn: (key: string, s: ApproverState) => void): () => void;
  stamp(): number;
  noteEpoch(ref: ApproverRef, epoch: string, stamp: number): void;
  gap(): void;
  /** pagehide / pageshow, and the account listener (rows 3, 4, 26). */
  hide(): void; show(): void; accountChanged(): void;
  releaseAll(): void; resume(): void; reset(): void;
}
