// New note, as plain async functions over the Api (the C9 rules are testable without a browser):
//   - the note's id is picked here and held (opts.hold) before the send; a resend of a held note keeps its id;
//   - 409 (the id is taken) mints a new id and sends once more (only once the page says it holds that id);
//   - an unknown outcome gets reads only ("Check again"): matching or unsure, never "created".
import type { Api } from './api';
import { createBody, createOutcome, newId, readBack } from './logic';
import type { Computer, CreateOutcome, SentNote } from './types';

export interface Env {
  /** A fresh page id (the clock and random bytes). */
  newId(): string;
}
const realEnv: Env = {
  newId: () => newId(Date.now(), crypto.getRandomValues(new Uint8Array(5))),
};

export type CreateResult =
  | { kind: 'created'; sent: SentNote }
  | { kind: 'notSent' }
  | { kind: 'unknown'; sent: SentNote }
  | { kind: 'final'; outcome: Exclude<CreateOutcome, 'created' | 'notSent' | 'unknown' | 'taken'> | 'taken' };

export interface Place {
  nb: string;
  parentId: string;
}

export interface CreateOpts {
  /** An earlier create whose answer is unknown: it is sent again with the same id and fields, never a new id. */
  held?: SentNote;
  /** Called with the note just before every send, so the page holds it before the answer can be lost. A page whose
   *  hold is confirmed (the Board's New page) returns false when the store did not keep it: that note is not sent. */
  hold?: (sent: SentNote) => unknown;
}

export async function createNote(api: Api, c: Computer, place: Place, name: string, env: Env = realEnv, opts: CreateOpts = {}): Promise<CreateResult> {
  const { held } = opts;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent: SentNote = held && attempt === 0 ? held : { id: env.newId(), parentId: place.parentId, name };
    // Not held, so not sent: nothing of this note left; a held note's earlier send may still have applied.
    if ((await opts.hold?.(sent)) === false) return held ? { kind: 'unknown', sent: held } : { kind: 'notSent' };
    const r = await api.send(c, place.nb, createBody(sent.id, sent.parentId, sent.name));
    const o = createOutcome(r, sent.id);
    if (o === 'created') return { kind: 'created', sent };
    // A resend of a held create that never left (or was refused) still leaves the first send possibly applied: it stays held.
    if (held && (o === 'notSent' || (o !== 'taken' && o !== 'unknown'))) return { kind: 'unknown', sent };
    if (o === 'notSent') return { kind: 'notSent' };
    if (o === 'unknown') return { kind: 'unknown', sent };
    // A held id that is "taken" may be our own earlier create: read it back, never mint another id.
    if (o === 'taken' && held) return { kind: 'unknown', sent };
    if (o === 'taken' && attempt === 0) continue;
    return { kind: 'final', outcome: o };
  }
  return { kind: 'final', outcome: 'taken' };
}

/** "Check again": one read of the note that may have been added. It never sends anything. */
export async function checkNote(api: Api, c: Computer, nb: string, sent: SentNote): Promise<'matching' | 'unsure'> {
  return readBack(await api.node(c, nb, sent), sent);
}
