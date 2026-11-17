// types.ts: the shapes the journal's files share. Types only; no behaviour lives here.

/** The five journaled routes. An attach has no key and is not journaled. */
export type Route = 'create' | 'turn' | 'command' | 'confirm' | 'answer';
export type Kind = 'create' | 'turn' | 'message' | 'interrupt' | 'stop' | 'decision' | 'answer';

/** A stored request entry, "<h>:<k>" in hub_ai_req_v1; written once by the door, never rewritten. */
export interface Entry {
  k: string;
  kind: Kind;
  /** The computer's handle, the chat's realm, its session (null: a create without one yet), the chat's create key. */
  h: string;
  r: string;
  s: string | null;
  c: string;
  /** The container id the request went to. */
  ct: string;
  /** A decision or answer: the gate id and its generation (a migrated decision has no gn). */
  g?: string;
  gn?: number;
  /** A turn that carried files. */
  f?: 1;
  at: number;
  /** Scan view only: 1 = an imported member (hub_ai_mig_v1), 2 = shown from the legacy source. Never stored on an entry. */
  m?: 1 | 2;
  /** Scan view only: the command id a migrated message carried. Never stored on an entry. */
  ci?: string;
}

interface OpBase { acct: string; container: string; h: string; r: string; key: string }
export type Op =
  | (OpBase & { route: 'create' })
  | (OpBase & { route: 'turn'; sid: string; c: string; files: boolean })
  // `td` (interrupt only, required there): the digest of the interrupt's text (textDigest), held in memory so the ticket binds the exact
  // body; it is not part of the stored entry (no text, and no hash of it, is stored).
  | (OpBase & { route: 'command'; sid: string; c: string; cmd: 'message' | 'interrupt' | 'stop'; td?: string })
  | (OpBase & { route: 'confirm' | 'answer'; sid: string; c: string; gate: string; gen: number });

/** What the run's held door admits (no handle, no chat key): the hold stores the request. */
interface HeldBase { acct: string; container: string; r: string; key: string }
export type HeldOp =
  | (HeldBase & { route: 'create' })
  | (HeldBase & { route: 'turn'; sid: string })
  | (HeldBase & { route: 'command'; sid: string; cmd: 'stop' })
  | (HeldBase & { route: 'confirm' | 'answer'; sid: string; gate: string; gen: number });

export type NotSentWhy = 'cancelled' | 'invalid' | 'notMinted' | 'account' | 'unreadable' | 'exists' | 'full' | 'notKept'
  | 'lockRefused' | 'decided' | 'noCall' | 'noTicket' | 'consumed'
  // The chat's create key is marked bound elsewhere (records.ts): nothing more is sent to it from this browser.
  | 'elsewhere';
export type NotSent = { kind: 'notSent'; why: NotSentWhy };

/** The identity every verdict, proof and owed item is bound to. */
export interface Ident { acct: string; h: string; k: string }
