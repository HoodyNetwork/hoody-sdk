// The agent source editor's state: one agent's whole source file, an edit of it, and a
// save that can only land on the revision it was read at.
//
//   - load(): getAgentSource {path, content, revision}. `path` "" is an embedded default with no file yet: a save then
//     creates the realm's own copy. A read that is not that shape is a failed read, never an empty file.
//   - save(): putAgentSource {content, expected_revision}, sent once, one at a time. The answer is
//       done      the new revision; the saved text is the new base,
//       conflict  409 revision_conflict: the agent refused and wrote nothing, because the file changed since the read,
//       refused   the agent said no (nothing written),
//       unsure    the answer was lost or unreadable: it MAY have been saved. Nothing is sent again; check() reads the
//                 file back. Only a file that holds the sent text settles it (saved). Any other sight (the same file,
//                 a different one, no file, a failed read) proves nothing: a slow request may still land, another
//                 writer may have come after it, and a revision is a hash of the bytes, not a receipt. So it stays
//                 unsure, with the observation, and Reset / Delete stay held. The person's way out is abandon(): an
//                 informed choice (the UI asks) that sends nothing, keeps the draft, and bases it on the file as last
//                 seen so the next Save is checked against it. The earlier request may still land later.
//   - A conflict is resolved by the person: compare() reads the file as it is now and the view shows how saving the
//     draft over it would change it; keepMine() takes that revision as the new base (the next Save then replaces it,
//     still checked); reload() takes their file and drops the draft.
//   - The draft is the editor's text and is kept verbatim: no trimming, no re-serialising, so a `tools: none` line (or any
//     frontmatter line) the person did not touch is sent byte for byte as it was read.
//   - Answers that arrive after reset() change nothing.
import { isRecord } from '@core';
import { utf8Bytes } from '@core/pure';
import type { Refusal, Settled, SourceApi } from './sourceApi';

/** The agent's own cap on a source file. */
export const MAX_SOURCE_BYTES = 1 << 20;

export interface SourceDoc { path: string; content: string; revision: string }

const rev = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;

/** getAgentSource's answer; null when any of path, content, revision is missing or of another type. */
export function sourceOf(x: unknown): SourceDoc | null {
  if (!isRecord(x) || typeof x.path !== 'string' || typeof x.content !== 'string' || !rev(x.revision)) return null;
  return { path: x.path, content: x.content, revision: x.revision };
}

/** putAgentSource's answer {path, revision}; null when not that shape. */
export function savedOf(x: unknown): { path: string; revision: string } | null {
  if (!isRecord(x) || typeof x.path !== 'string' || !rev(x.revision)) return null;
  return { path: x.path, revision: x.revision };
}

export const bytesOf = utf8Bytes;

export type SavePhase = 'idle' | 'saving' | 'saved' | 'unsure' | 'refused' | 'conflict';
export type Theirs =
  | { phase: 'reading' }
  | { phase: 'failed'; code: string; status: number }
  | { phase: 'gone' }
  | { phase: 'read'; content: string; revision: string; path: string };

export interface SourceView {
  load: 'idle' | 'loading' | 'ready' | 'failed' | 'gone';
  /** Why the first read failed (load 'failed'). */
  loadError: { code: string; status: number } | null;
  /** The file (null: none yet, an embedded default) and the revision/text the draft is based on. */
  path: string | null;
  revision: string | null;
  base: string | null;
  draft: string;
  dirty: boolean;
  tooBig: boolean;
  save: SavePhase;
  /** The agent's refusal of a save (save 'refused'): nothing was written. */
  refusal: { code: string; status: number; unsent: boolean } | null;
  /** After a check of a lost save: what the read found. */
  checked: 'same' | 'changed' | 'failed' | 'gone' | null;
  /** The file as the last check saw it (an unsure save), the base abandon() takes. */
  observed: { revision: string } | null;
  /** A fresh read after a reset is out: the editor and Save wait for it, so no edit is replaced under the person's hands. */
  refreshing: boolean;
  /** A reload after a reset or delete could not read the file: what shows may be out of date. */
  stale: boolean;
  /** A conflict: the file as it is now, once compare() has read it. */
  theirs: Theirs | null;
  /** The text a lost save carried (save 'unsure'). */
  sent: string | null;
  /** A read of the file (check, compare, reload) is out. */
  reading: boolean;
}

export interface SourceStore {
  view(): SourceView;
  subscribe(fn: () => void): () => void;
  load(): Promise<void>;
  setDraft(text: string): void;
  save(): Promise<void>;
  /** Read the file back after a lost save. */
  check(): Promise<void>;
  /** The person stops watching an unsure save (the UI asks first): nothing is sent, the draft stays, and it is based on the
   *  file as the last check saw it (else as it was before the send). The earlier request may still land later. */
  abandon(): void;
  /** After a reset: read the file fresh (never the cached comparison), replacing the draft. Does nothing while a save runs or
   *  its outcome is unknown. */
  refresh(): Promise<void>;
  /** After a conflict: read the file as it is now. */
  compare(): Promise<void>;
  /** After compare: base the draft on the file as read, so the next Save replaces it (checked). */
  keepMine(): void;
  /** Take the file as it is now and drop the draft (reads it first when compare has not). */
  reload(): Promise<void>;
  /** Forget everything; answers still on their way change nothing. */
  reset(): void;
}

const EMPTY: SourceView = {
  load: 'idle', loadError: null, path: null, revision: null, base: null, draft: '', dirty: false, tooBig: false,
  save: 'idle', refusal: null, checked: null, observed: null, stale: false, refreshing: false, theirs: null, sent: null, reading: false,
};

export function createSourceStore(deps: { api: Pick<SourceApi, 'get' | 'put'>; blocked?: () => boolean }): SourceStore {
  const subs = new Set<() => void>();
  let v: SourceView = EMPTY;
  let gen = 0, flight = false, reads = 0;
  let sentRev: string | null = null;
  let seen: SourceDoc | null = null;

  const put = (p: Partial<SourceView>): void => {
    const next = { ...v, ...p };
    next.dirty = next.base !== null && next.draft !== next.base;
    next.tooBig = bytesOf(next.draft) > MAX_SOURCE_BYTES;
    v = next;
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };
  const adopt = (d: SourceDoc): void => {
    put({ load: 'ready', loadError: null, path: d.path === '' ? null : d.path, revision: d.revision, base: d.content, draft: d.content, save: 'idle', refusal: null, checked: null, observed: null, stale: false, theirs: null, sent: null });
    sentRev = null;
    seen = null;
  };
  const failure = (r: Refusal): { code: string; status: number } => ({ code: r.code, status: r.status });
  const read = async (): Promise<{ doc: SourceDoc } | { gone: true } | { fail: { code: string; status: number } } | null> => {
    const mine = gen;
    let r: Settled;
    try { r = await deps.api.get(); } catch { r = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } }; }
    if (mine !== gen) return null;
    if (r.ok) { const doc = sourceOf(r.body); return doc ? { doc } : { fail: { code: 'unreadable', status: 0 } }; }
    if (r.err.kind === 'stale') return null;
    if (r.err.status === 404 || r.err.code === 'not_found') return { gone: true };
    return { fail: failure(r.err) };
  };

  async function load(): Promise<void> {
    if (v.load === 'loading' || v.load === 'ready' || flight) return; // an open draft is only ever replaced by reload()
    const mine = gen, seq = ++reads;
    put({ load: 'loading', reading: true });
    const got = await read();
    if (mine !== gen || seq !== reads || got === null) { if (mine === gen && seq === reads) put({ load: v.base === null ? 'idle' : 'ready', reading: false }); return; }
    if ('doc' in got) { adopt(got.doc); put({ reading: false }); return; }
    // A read that failed or found the file gone keeps an open draft: the person's text is not dropped by a failed read.
    if ('gone' in got) { put({ load: 'gone', loadError: null, reading: false }); return; }
    put({ load: v.base === null ? 'failed' : 'ready', loadError: got.fail, reading: false });
  }

  function setDraft(text: string): void {
    if (v.load !== 'ready' || v.refreshing) return;
    put({ draft: text, ...(v.save === 'saved' || v.save === 'refused' ? { save: 'idle' as const, refusal: null } : {}), checked: null });
  }

  async function save(): Promise<void> {
    if (v.load !== 'ready' || flight || v.revision === null || !v.dirty || v.tooBig || v.refreshing || deps.blocked?.()) return;
    if (v.save === 'unsure' || v.save === 'conflict' || v.save === 'saving') return;
    const mine = gen, text = v.draft, atRev = v.revision;
    flight = true;
    put({ save: 'saving', refusal: null, checked: null });
    let r: Settled;
    try { r = await deps.api.put(text, atRev); } catch { r = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } }; }
    if (mine !== gen) return;
    flight = false;
    if (r.ok) {
      const done = savedOf(r.body);
      if (done) { put({ save: 'saved', path: done.path === '' ? v.path : done.path, revision: done.revision, base: text, refusal: null, sent: null }); return; }
      sentRev = atRev; put({ save: 'unsure', sent: text });
      return;
    }
    const e = r.err;
    if (e.kind === 'stale') { put({ save: 'idle' }); return; }
    if (e.kind === 'pending') { sentRev = atRev; put({ save: 'unsure', sent: text }); return; }
    if (e.code === 'revision_conflict' && e.notApplied) { put({ save: 'conflict', theirs: null }); return; }
    put({ save: 'refused', refusal: { code: e.code, status: e.status, unsent: e.kind === 'not_sent' } });
  }

  async function check(): Promise<void> {
    if (v.save !== 'unsure' || flight || v.reading) return;
    const mine = gen, sent = v.sent, was = sentRev;
    seen = null;
    put({ reading: true, checked: null, observed: null });
    const got = await read();
    if (mine !== gen || got === null) { if (mine === gen) put({ reading: false, checked: 'failed' }); return; }
    if ('fail' in got) { put({ reading: false, checked: 'failed' }); return; }
    // The draft, the sent text and the unknown outcome stay whatever the file looks like: only its content can settle it.
    if ('gone' in got) { put({ reading: false, checked: 'gone', observed: null }); return; }
    const d = got.doc;
    if (d.content === sent) {
      // The file holds what was sent. The draft keeps whatever was typed since.
      put({ reading: false, save: 'saved', path: d.path === '' ? null : d.path, revision: d.revision, base: d.content, sent: null, checked: null, observed: null });
      sentRev = null;
      seen = null;
      return;
    }
    if (d.revision === was) {
      // Same file as before the send. That does not say the send did nothing (it may still land, or a restore wrote the
      // same bytes): it stays unknown, and the person may save again from this file.
      seen = d;
      put({ reading: false, checked: 'same', observed: { revision: d.revision } });
      return;
    }
    // A different file. That does not say the save failed (it may have landed before another writer, or still be on its way):
    // it stays unknown, with what was seen.
    seen = d;
    put({ reading: false, checked: 'changed', observed: { revision: d.revision } });
  }

  function abandon(): void {
    if (v.save !== 'unsure' || v.reading) return;
    const d = seen;
    put({
      save: 'idle', sent: null, checked: null, observed: null,
      ...(d ? { revision: d.revision, base: d.content, path: d.path === '' ? null : d.path } : {}),
    });
    sentRev = null;
    seen = null;
  }

  async function compare(): Promise<void> {
    if (v.save !== 'conflict' || v.reading) return;
    const mine = gen;
    put({ reading: true, theirs: { phase: 'reading' } });
    const got = await read();
    if (mine !== gen || got === null) { if (mine === gen) put({ reading: false, theirs: { phase: 'failed', code: '', status: 0 } }); return; }
    if ('fail' in got) { put({ reading: false, theirs: { phase: 'failed', ...got.fail } }); return; }
    if ('gone' in got) { put({ reading: false, theirs: { phase: 'gone' } }); return; }
    put({ reading: false, theirs: { phase: 'read', content: got.doc.content, revision: got.doc.revision, path: got.doc.path } });
  }

  function keepMine(): void {
    const t = v.theirs;
    if (v.save !== 'conflict' || !t || t.phase !== 'read') return;
    put({ save: 'idle', revision: t.revision, base: t.content, path: t.path === '' ? null : t.path, theirs: null, refusal: null, checked: null });
  }

  async function reload(): Promise<void> {
    if (flight || v.reading || deps.blocked?.()) return;
    const t = v.theirs;
    if (t && t.phase === 'read') { adopt({ path: t.path, content: t.content, revision: t.revision }); return; }
    await fresh();
  }

  async function fresh(): Promise<void> {
    const mine = gen;
    put({ reading: true });
    const got = await read();
    if (mine !== gen || got === null) { if (mine === gen) put({ reading: false, stale: true }); return; }
    if ('doc' in got) { adopt(got.doc); put({ reading: false }); return; }
    if ('gone' in got) {
      if (v.save === 'conflict') put({ reading: false, theirs: { phase: 'gone' } });
      else put({ reading: false, load: 'gone', save: 'idle', sent: null, theirs: null });
      return;
    }
    put({ reading: false, stale: true, loadError: got.fail, ...(v.save === 'conflict' ? { theirs: { phase: 'failed' as const, ...got.fail } } : {}) });
  }

  // After a reset the file on screen is out of date whatever was read before: wait out a read in flight, then read fresh.
  async function refresh(): Promise<void> {
    if (v.refreshing || v.save === 'saving' || v.save === 'unsure' || deps.blocked?.()) return;
    const mine = gen;
    put({ stale: true, refreshing: true });
    try {
      if (flight || v.reading) {
        await new Promise<void>((resolve) => {
          const off = subscribe(() => { if (!flight && !v.reading) { off(); resolve(); } });
        });
        if (mine !== gen) return;
      }
      await fresh();
    } finally {
      if (mine === gen) put({ refreshing: false });
    }
  }

  function subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

  return {
    view: () => v,
    subscribe,
    load, setDraft, save, check, abandon, compare, keepMine, reload, refresh,
    reset() {
      gen++; flight = false; reads = 0; sentRev = null; seen = null;
      v = EMPTY;
      for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
    },
  };
}
