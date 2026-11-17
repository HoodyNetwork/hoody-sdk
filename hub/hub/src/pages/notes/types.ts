// Types of the Notes page.
/** A kit rejection as core hands it on (the fields the rules read). */
export interface Rejection {
  kind?: string;
  status?: number;
  code?: string | null;
  data?: Record<string, unknown>;
  retryAfterMs?: number | null;
  notSent?: boolean;
  pending?: boolean;
  stale?: boolean;
  superseded?: boolean;
}

export type NotesState = 'ok' | 'older' | 'protected' | 'cantTell' | 'unreachable' | 'unexpected' | 'busy' | 'noAccess' | 'notOwner' | 'dropped';
export type CreateOutcome = 'created' | 'notSent' | 'unknown' | 'cantAdd' | 'protected' | 'noPlace' | 'gone' | 'taken';

export interface Me {
  userId: string;
  notebookId: string;
  role: string;
}
export interface NoteRow {
  id: string;
  title: string;
  section: string;
  /** Epoch ms of the last change; null when unreadable. */
  at: number | null;
  hasBody: boolean;
}
export interface Recent {
  items: NoteRow[];
  /** Some recent notes may be missing. */
  partial: boolean;
  /** Where New note puts a page; null: Notes gives no place. */
  create: { parentId: string; section: string } | null;
}
export interface SentNote {
  id: string;
  parentId: string;
  name: string;
}
export interface CreateBody {
  id: string;
  type: 'page';
  parentId: string;
  attributes: { name: string };
}

/** A computer the page can read (from the account's computer list). */
export interface Computer {
  id: string;
  projectId: string;
  name: string;
  serverName?: string;
  state: 'running' | 'stopped' | 'starting' | 'attention';
  /** The computer's colour as the API gives it (ComputerMark normalises it; anything else draws no mark). */
  color?: string;
  /** The realms the computer is in (realm_ids): a note's Copy link under All realms takes the first along. */
  realms?: readonly string[];
}

/** What one computer's Notes gave. */
export type Loaded =
  | { state: 'loading' }
  | { state: 'ok'; me: Me; recent: Recent }
  | { state: Exclude<NotesState, 'ok' | 'dropped'>; waiting?: boolean };

/** One table row: a note of one computer. */
export interface Row {
  /** `<computer id>~<note id>` */
  id: string;
  computerId: string;
  computer: string;
  /** The viewer's own user id in the notebook (the Notes address of the note names it). */
  userId: string;
  note: NoteRow;
  title: string;
  section: string;
  at: number | null;
}

/** One computer's Notes in a fixture state (fixtures.ts, fixtureApi.ts). */
export interface FxNotes {
  state: Exclude<NotesState, 'dropped'>;
  notes?: NoteRow[];
  partial?: boolean;
  /** Where New note puts a page; absent: the first section. null: Notes gives no place. */
  place?: { parentId: string; section: string } | null;
  /** The read never answers. */
  hang?: boolean;
  /** The notebook id Notes answers with; absent: the fixtures' one. */
  notebookId?: string;
}
