// The instructions editor's state: a realm's {text, enabled} on one computer, an edit of both, and a
// save that can only land on the revision it was read at (the agents/source.ts shape).
//
//   - load(): GET {text, enabled, revision}. Anything else is a failed read, never blank instructions.
//   - save(): PUT {text, enabled, expected_revision}: text and on/off always together, sent once, one at a time. The answer is
//       saved       the instructions after the write become the new base,
//       conflict    409 revision_conflict: nothing written, they changed since the read,
//       overridden  409 instructions_overridden: nothing written, the realm's settings.local.json sets `fields` and would win,
//       refused     any other refusal (nothing written, or not sent),
//       unsure      the answer was lost or unreadable: it MAY have been saved. Nothing is sent again; check() reads them back,
//                   and only {text, enabled} equal to what was sent settles it as saved. Any other sight proves nothing (a slow
//                   request may still land, another writer may have come after it), so it stays unsure with the observation.
//                   abandon() is the informed way out: it sends nothing and keeps the draft on the revision it was read at, so
//                   the next Save meets a conflict (and Compare) if anything landed since, the lost save included. What a
//                   check saw is never taken as the base: that would let the next Save replace a change nobody compared.
//   - A conflict is resolved by the person: compare() reads them as they are now; keepMine() takes that revision as the new base
//     (the next Save replaces them, still checked), never while a read is out; reload() takes theirs and drops the draft.
//   - A failed reload changes nothing shown: the draft and base stay, and refreshFailed says the read failed until a read works.
//   - A read core dropped (kind 'stale': the top bar moved while it was out, and the edit is kept, held.ts) did not happen: it sets
//     nothing, and the action can be pressed again.
//   - The text is kept verbatim: no trimming.
//   - Answers that arrive after reset() change nothing.
import type { InstructionsApi, Refusal, Settled } from './api';
import { instructionsOf, sameAs, type Instructions, type InstructionsDraft } from './logic';

export type SavePhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'overridden' | 'refused' | 'unsure';
export type Theirs = { phase: 'reading' } | { phase: 'failed'; code: string; status: number } | { phase: 'read'; i: Instructions };

export interface EditView {
  load: 'loading' | 'ready' | 'failed';
  /** Why the read failed (load 'failed'). */
  loadError: Refusal | null;
  /** What the draft is based on (the last read or save). */
  base: Instructions | null;
  draft: InstructionsDraft;
  dirty: boolean;
  save: SavePhase;
  /** The refusal of the last save (conflict, overridden, refused). */
  refusal: Refusal | null;
  /** A conflict: them as they are now, once compare() has read them. */
  theirs: Theirs | null;
  /** What a lost save carried (save 'unsure'). */
  sent: InstructionsDraft | null;
  /** After a check of a lost save: what the read found. */
  checked: 'same' | 'changed' | 'failed' | null;
  /** Them as the last check saw them (save 'unsure'). Shown only: never a base. */
  observed: Instructions | null;
  /** The last Read again failed (outside a conflict): what is shown is from the read before. Cleared by a read that works (Read again, Compare, a check that settles) or a save that works. */
  refreshFailed: { code: string; status: number } | null;
  /** A read (check, compare, reload) is out. */
  reading: boolean;
}

export interface EditStore {
  subscribe(fn: () => void): () => void;
  view(): EditView;
  load(): Promise<void>;
  setText(text: string): void;
  setEnabled(enabled: boolean): void;
  /** Drop the draft back to the base. */
  discard(): void;
  save(): Promise<void>;
  compare(): Promise<void>;
  keepMine(): void;
  reload(): Promise<void>;
  check(): Promise<void>;
  abandon(): void;
  reset(): void;
}

const EMPTY: InstructionsDraft = { text: '', enabled: true };

export function createEditStore(api: InstructionsApi): EditStore {
  let v: EditView = { load: 'loading', loadError: null, base: null, draft: EMPTY, dirty: false, save: 'idle', refusal: null, theirs: null, sent: null, checked: null, observed: null, refreshFailed: null, reading: false };
  const subs = new Set<() => void>();
  // Bumped by reset(): an answer of an earlier generation changes nothing.
  let gen = 0;
  const set = (p: Partial<EditView>) => {
    const n = { ...v, ...p };
    n.dirty = n.base !== null && !sameAs(n.base, n.draft);
    v = n;
    for (const f of subs) f();
  };
  const fresh = (i: Instructions): Partial<EditView> => ({ base: i, draft: { text: i.text, enabled: i.enabled }, save: 'idle', refusal: null, theirs: null, sent: null, checked: null, observed: null, refreshFailed: null });
  /** A save is out, may have landed, or waits for the person: the draft is held. */
  const held = () => v.save === 'saving' || v.save === 'unsure' || v.save === 'conflict' || v.reading || v.load !== 'ready';
  const read = async (): Promise<{ ok: true; i: Instructions } | { ok: false; err: Refusal }> => {
    const r: Settled = await api.get();
    if (!r.ok) return r;
    const i = instructionsOf(r.body);
    return i ? { ok: true, i } : { ok: false, err: { kind: 'failed', code: 'unreadable', status: 200, notApplied: false, currentRevision: null, fields: null } };
  };
  const dropped = (r: { ok: boolean; err?: Refusal }): boolean => !r.ok && r.err?.kind === 'stale';
  const edit = (p: Partial<InstructionsDraft>) => {
    if (held()) return;
    // An edit after a refusal or a save starts over: the band was about the earlier text.
    set({ draft: { ...v.draft, ...p }, ...(v.save === 'saved' || v.save === 'refused' || v.save === 'overridden' ? { save: 'idle' as const, refusal: null } : {}) });
  };

  return {
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    view: () => v,
    async load() {
      const g = gen;
      set({ load: 'loading', loadError: null });
      const r = await read();
      if (g !== gen) return;
      if (r.ok) set({ load: 'ready', ...fresh(r.i) });
      else set({ load: 'failed', loadError: r.err });
    },
    setText: (text) => edit({ text }),
    setEnabled: (enabled) => edit({ enabled }),
    discard() {
      if (held() || !v.base) return;
      set(fresh(v.base));
    },
    async save() {
      if (held() || !v.base || !v.dirty) return;
      const g = gen;
      const sent = { ...v.draft };
      set({ save: 'saving', refusal: null, sent: null, checked: null, observed: null });
      const r = await api.put(sent, v.base.revision);
      if (g !== gen) return;
      if (r.ok) {
        const i = instructionsOf(r.body);
        // A 200 that cannot be read: the write may have happened, and with what revision is not known.
        if (!i) { set({ save: 'unsure', sent }); return; }
        set({ base: i, save: 'saved', sent: null, refreshFailed: null });
        return;
      }
      const e = r.err;
      if (e.kind === 'pending') set({ save: 'unsure', sent });
      else if (e.code === 'revision_conflict' && e.notApplied) set({ save: 'conflict', refusal: e });
      else if (e.code === 'instructions_overridden' && e.notApplied) set({ save: 'overridden', refusal: e });
      else set({ save: 'refused', refusal: e });
    },
    async compare() {
      if (v.save !== 'conflict' || v.reading) return;
      const g = gen;
      set({ reading: true, theirs: { phase: 'reading' } });
      const r = await read();
      if (g !== gen) return;
      if (dropped(r)) { set({ reading: false, theirs: null }); return; }
      // A read that works also ends an earlier failed Read again's band (what is shown is no longer from an old read).
      set(r.ok ? { reading: false, theirs: { phase: 'read', i: r.i }, refreshFailed: null } : { reading: false, theirs: { phase: 'failed', code: r.err.code, status: r.err.status } });
    },
    keepMine() {
      // Not while Load theirs reads: its answer would replace what was compared.
      if (v.save !== 'conflict' || v.reading || v.theirs?.phase !== 'read') return;
      // Their revision is the new base: the next Save replaces exactly what was compared, and is still checked against it.
      set({ base: v.theirs.i, save: 'idle', refusal: null, theirs: null });
    },
    async reload() {
      if (v.reading || v.save === 'saving' || v.save === 'unsure') return;
      const g = gen;
      set({ reading: true });
      const r = await read();
      if (g !== gen) return;
      if (r.ok) set({ reading: false, ...fresh(r.i) });
      else if (dropped(r)) set({ reading: false });
      else if (v.save === 'conflict') set({ reading: false, theirs: { phase: 'failed', code: r.err.code, status: r.err.status } });
      else set({ reading: false, refreshFailed: { code: r.err.code, status: r.err.status } });
    },
    async check() {
      if (v.save !== 'unsure' || v.reading || !v.sent) return;
      const g = gen;
      const sent = v.sent;
      set({ reading: true });
      const r = await read();
      if (g !== gen) return;
      if (dropped(r)) { set({ reading: false }); return; }
      if (!r.ok) { set({ reading: false, checked: 'failed' }); return; }
      if (sameAs(r.i, sent)) { set({ reading: false, base: r.i, save: 'saved', sent: null, checked: null, observed: null, refreshFailed: null }); return; }
      set({ reading: false, checked: v.base && sameAs(r.i, v.base) ? 'same' : 'changed', observed: r.i });
    },
    abandon() {
      if (v.save !== 'unsure' || v.reading) return;
      set({ save: 'idle', sent: null, checked: null, observed: null });
    },
    reset() {
      gen++;
    },
  };
}
