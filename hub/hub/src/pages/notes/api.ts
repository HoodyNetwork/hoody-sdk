// What the page needs from a computer's Notes, as one interface. Every call settles and never rejects, so a flow
// reads each answer once and decides. coreApi.ts is the real one (core's api()); fixtureApi.ts answers from the
// page's fixtures; tests build fakes.
import type { Computer, CreateBody, Loaded, NoteRow, Rejection, SentNote } from './types';

export type Settled<T = unknown> = { ok: true; body: T } | { ok: false; err: Rejection };
export type DownloadResult = 'saved' | 'tooBig' | 'failed' | 'dropped';

export interface Api {
  /** Capabilities, then who the user is, then the recent notes. null: the read was dropped (context changed). */
  load(c: Computer): Promise<Loaded | null>;
  /** The one send of a new note. Never retried here. */
  send(c: Computer, nb: string, body: CreateBody): Promise<Settled>;
  /** One note, read back after an unknown outcome. */
  node(c: Computer, nb: string, sent: SentNote): Promise<Settled>;
  /** The note as a Markdown file, saved through the browser. */
  download(c: Computer, nb: string, n: NoteRow): Promise<DownloadResult>;
}

/** Delete a note (remove.ts). Kept beside Api, so a fake of the reads and the create needs neither. */
export interface RemoveApi {
  /** The one send of a delete. Never retried here. */
  remove(c: Computer, nb: string, id: string): Promise<Settled>;
  /** One note by its id, read after a delete whose answer is unknown. It never sends a change. */
  present(c: Computer, nb: string, id: string): Promise<Settled>;
}

/** What coreApi.ts and fixtureApi.ts give. */
export type NotesApi = Api & RemoveApi;
