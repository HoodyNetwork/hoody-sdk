// The workflow source editor's state: one workflow's definition as JSON text, an
// edit of it, and a save that can only land on the revision it was read at. The model is the agent source editor's
// (pages/ai/agents/source.ts); what differs is how a save is read back:
//   - load(): getWorkflow ?include_revision=true. The output's first line is `revision: <opaque>`, a project workflow's
//     second line says so (`project: true …`), and the rest is the definition as JSON. Any other shape is a failed read,
//     never an empty workflow.
//   - save(): the draft must be a JSON object with an entry point and steps whose top-level fields are the agent's, of the
//     types it decodes (checked here, nothing sent otherwise). The four fields the agent sets itself (name, system,
//     created_at, updated_at) are left out of what is sent: the agent decodes them before overwriting them, so a bad
//     value there would refuse the save, and a field never sent cannot. Then putWorkflow {definition,
//     expected_revision}, sent once, one at a time. The answer is
//       saved     the agent says it saved. It answers no revision, so the workflow is read again for the next save's base;
//                 until that read answers, Save waits (a save without its revision would not be checked),
//       conflict  revision_conflict: the agent refused and wrote nothing, because the workflow changed since the read,
//       refused   the agent said no before writing (paused, a definition its validation refused, with its reason; or a
//                 request core did not send): the draft stays editable,
//       unsure    the answer was lost, or the agent answered an error that may have come after it wrote (its validation
//                 errors carry no code, so they read this way too). Nothing is sent again; check() reads the workflow back.
//                 The agent stores what it was sent re-stamped (dates, name, the shipped flag) and normalized, so only a
//                 read whose definition equals the sent one exactly, after the agent's own input rules, settles it
//                 (saved): canonicalOf() applies those rules (a string entry point or step reference
//                 becomes {id}, an array of steps a map keyed by id, a step's inner id equal to its key is dropped;
//                 labels trimmed, lowercased, deduped; a label the agent refuses, or one outside ASCII, where Go's and
//                 JavaScript's case and space rules differ, proves nothing). Nothing else is
//                 assumed: no key may be missing on either side (an empty value the agent leaves out, a field it
//                 defaults, a legacy tool name it renames all leave the save unsure). Unsure means the outcome is
//                 unknown: the draft is kept, and abandon() bases it on the current version.
//                 Anything else (the same workflow, another one, none, a failed read) proves nothing: it stays unsure with
//                 what was seen, and abandon() (the UI asks) bases the draft on the workflow as last seen, sending nothing.
//   - A conflict is resolved by the person: compare() reads the workflow as it is now, keepMine() takes that revision as
//     the base (the next Save replaces it, still checked), reload() takes theirs and drops the draft.
//   - The draft is the editor's text, kept verbatim; only Save parses it.
//   - Answers that arrive after reset() change nothing.
import { utf8Bytes } from '@core/pure';
import type { Refusal, Settled, WorkflowSourceApi } from './sourceApi';

/** A workflow file the agent will take; more than this is refused here, unsent. */
export const MAX_SOURCE_BYTES = 1 << 20;

export interface SourceDoc {
  content: string;
  revision: string;
  /** The project's own workflow file: a save writes your own copy over it. */
  project: boolean;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const REV = /^revision: (\S{1,256})$/;
const PROJECT = 'project: true ';

/** getWorkflow's envelope (include_revision); null when the output is not `revision:` + (project line) + a JSON object. */
export function sourceOf(x: unknown): SourceDoc | null {
  if (!obj(x) || x.is_error === true || typeof x.output !== 'string') return null;
  const out = x.output;
  const nl = out.indexOf('\n');
  if (nl < 0) return null;
  const m = REV.exec(out.slice(0, nl));
  if (!m) return null;
  let rest = out.slice(nl + 1);
  let project = false;
  if (rest.startsWith(PROJECT)) {
    const n2 = rest.indexOf('\n');
    if (n2 < 0) return null;
    rest = rest.slice(n2 + 1);
    project = true;
  }
  try {
    if (!obj(JSON.parse(rest))) return null;
  } catch {
    return null;
  }
  return { content: rest, revision: m[1]!, project };
}

export const bytesOf = utf8Bytes;

export type DraftProblem = 'json' | 'object' | 'entry' | 'steps' | 'tooBig' | 'unknownKey' | 'type' | 'blankOutput';

/** Keys the agent sets itself on every save; never sent. */
const STAMPED = new Set(['name', 'system', 'created_at', 'updated_at']);

const isInt = (x: unknown): boolean => typeof x === 'number' && Number.isSafeInteger(x);
/** Go's decoder takes JSON null for any field or map value and leaves the zero value (a nil pointer, an empty string). */
const orNull = (f: (x: unknown) => boolean) => (x: unknown): boolean => x === null || f(x);
const strMap = (x: unknown): boolean => obj(x) && Object.values(x).every((s) => s === null || typeof s === 'string');
/** The other top-level fields of the agent's workflow definition and the JSON types its decoder takes for them.
 *  The agent refuses any other key (DisallowUnknownFields). entry_point and steps are checked above (null there is no
 *  entry point / no steps). A null elsewhere is taken; canonicalOf treats it as the agent stores it (NULL_OMITTED).
 *  An outputs template the agent refuses once decoded (null or blank) is refused
 *  below. Inside steps the reread's exact comparison decides. */
const FIELDS: Record<string, (x: unknown) => boolean> = {
  entry_point: (x) => typeof x === 'string' || obj(x),
  steps: (x) => Array.isArray(x) || obj(x),
  summary: orNull((x) => typeof x === 'string'),
  params: orNull(Array.isArray),
  labels: orNull((x) => Array.isArray(x) && x.every((l) => typeof l === 'string')),
  max_concurrency: orNull(isInt),
  env: orNull(strMap),
  timeout_sec: orNull(isInt),
  outputs: orNull(strMap),
};

/** The draft as the definition putWorkflow takes (without the stamped fields), or why it cannot be sent. */
export function definitionOf(text: string): { def: Record<string, unknown> } | { problem: DraftProblem; line?: number; key?: string } {
  if (bytesOf(text) > MAX_SOURCE_BYTES) return { problem: 'tooBig' };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { problem: 'json', ...lineOf(text, e) };
  }
  if (!obj(v)) return { problem: 'object' };
  if (!entryOk(v.entry_point)) return { problem: 'entry' };
  const steps = v.steps;
  const n = Array.isArray(steps) ? steps.length : obj(steps) ? Object.keys(steps).length : 0;
  if (n === 0) return { problem: 'steps' };
  const def: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (STAMPED.has(k)) continue;
    const ok = Object.prototype.hasOwnProperty.call(FIELDS, k) ? FIELDS[k]! : null;
    if (!ok) return { problem: 'unknownKey', key: k };
    if (!ok(x)) return { problem: 'type', key: k };
    if (k === 'outputs' && obj(x)) {
      const blank = Object.keys(x).find((o) => blankTemplate(x[o]));
      if (blank !== undefined) return { problem: 'blankOutput', key: blank };
    }
    def[k] = x;
  }
  return { def };
}

/** A template the agent refuses as blank: null (decoded to "") or only spaces as Go's TrimSpace or JavaScript sees them
 *  (\s takes U+FEFF, Go takes U+0085; refusing either is only stricter). */
const blankTemplate = (t: unknown): boolean => t === null || (typeof t === 'string' && /^[\s\u0085]*$/.test(t));

/** The entry point as the agent stores it ({"id": "<step>", params?, execute_if?}) or its string shorthand. */
function entryOk(e: unknown): boolean {
  if (typeof e === 'string') return e.trim() !== '';
  return obj(e) && typeof e.id === 'string' && e.id.trim() !== '';
}

/** The line a JSON.parse error points at, when the engine names a position. */
function lineOf(text: string, e: unknown): { line?: number } {
  const m = /position (\d+)/.exec(e instanceof Error ? e.message : '');
  if (!m) return {};
  const at = Math.min(Number(m[1]), text.length);
  return { line: text.slice(0, at).split('\n').length };
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }
  if (!obj(a) || !obj(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}

const clone = (v: unknown): unknown => JSON.parse(JSON.stringify(v)) as unknown;
const refList = (v: unknown): unknown => {
  if (typeof v === 'string') return [{ id: v }];
  if (obj(v) && typeof v.id === 'string') return [v];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? { id: x } : x));
  return v;
};

/** Top-level fields whose JSON null the agent decodes to nil or a zero value that its `omitempty` then leaves out of
 *  what it stores (string, int, slices, maps, the *int timeout), and whose zero value its validation
 *  takes (summary "", max_concurrency 0, no params/labels/env/outputs, no timeout). Only null: an
 *  empty or zero value sent is not assumed away. */
const NULL_OMITTED = ['summary', 'params', 'labels', 'max_concurrency', 'env', 'timeout_sec', 'outputs'];

/** `sent` as the agent stores it (its own input rules, and label
 *  cleaning, and Go's decoding of null: a null field above is left out, a null
 *  env value is stored as "", which the agent takes); null when the agent would refuse it, so nothing proves it (a
 *  null or blank outputs template decodes to a blank one, which the agent refuses). */
export function canonicalOf(sent: Record<string, unknown>): Record<string, unknown> | null {
  const d = clone(sent) as Record<string, unknown>;
  for (const k of NULL_OMITTED) if (d[k] === null) Reflect.deleteProperty(d, k);
  if (obj(d.env)) for (const [mk, mv] of Object.entries(d.env)) if (mv === null) d.env[mk] = '';
  if (obj(d.outputs) && Object.values(d.outputs).some(blankTemplate)) return null;
  if (typeof d.entry_point === 'string') d.entry_point = { id: d.entry_point };
  if (Array.isArray(d.steps)) {
    const map: Record<string, unknown> = {};
    for (const raw of d.steps) {
      if (!obj(raw) || typeof raw.id !== 'string' || raw.id.trim() === '' || raw.id in map) return null;
      const { id, ...rest } = raw;
      map[id] = rest;
    }
    d.steps = map;
  }
  if (obj(d.steps)) {
    for (const [id, raw] of Object.entries(d.steps)) {
      if (!obj(raw)) continue;
      if ('id' in raw) { if (raw.id !== id) return null; delete raw.id; }
      if ('next_steps' in raw) raw.next_steps = refList(raw.next_steps);
      if (Array.isArray(raw.options)) for (const o of raw.options) if (obj(o) && 'steps' in o) o.steps = refList(o.steps);
    }
  }
  if (Array.isArray(d.labels)) {
    const out: string[] = [];
    for (const l of d.labels) {
      // The agent refuses a label that is empty once trimmed or holds a comma or newline (cleanWorkflowLabels).
      // Outside ASCII, Go's ToLower/TrimSpace and JavaScript's differ (a final sigma, U+FEFF): no proof there.
      if (typeof l !== 'string' || l.trim() === '' || /[,\n\r]/.test(l) || /[^\x00-\x7f]/.test(l)) return null;
      const c = l.trim().toLowerCase();
      if (!out.includes(c)) out.push(c);
    }
    d.labels = out;
  }
  return d;
}

/** Does the stored definition (`stored`, a read's JSON) show exactly what was sent (`sent`, definitionOf's def), after
 *  the agent's input rules? Only the stored side's stamped keys are set aside (they are never sent, so a `sent` holding
 *  one can never equal it); everything else must be equal, key for key (objects in any key order). */
export function holdsSent(stored: string, sent: Record<string, unknown>): boolean {
  let v: unknown;
  try { v = JSON.parse(stored); } catch { return false; }
  const want = canonicalOf(sent);
  if (!obj(v) || !want) return false;
  return same(Object.fromEntries(Object.entries(v).filter(([k]) => !STAMPED.has(k))), want);
}

export type SavePhase = 'idle' | 'saving' | 'saved' | 'unsure' | 'refused' | 'conflict';
export type Theirs =
  | { phase: 'reading' }
  | { phase: 'failed'; code: string; status: number }
  | { phase: 'gone' }
  | { phase: 'read'; content: string; revision: string };

export interface SourceView {
  load: 'idle' | 'loading' | 'ready' | 'failed' | 'gone';
  loadError: { code: string; status: number } | null;
  project: boolean;
  /** The revision the draft is based on; null after a save until the read for the next base answers. */
  revision: string | null;
  base: string | null;
  draft: string;
  dirty: boolean;
  /** Why the draft cannot be sent as it is (null: it can). */
  problem: { kind: DraftProblem; line: number | null; key: string | null } | null;
  save: SavePhase;
  /** The agent's refusal of a save (save 'refused'): nothing was written. `reason`: the agent's own words, cleaned. */
  refusal: { code: string; status: number; unsent: boolean; reason?: string } | null;
  /** After a check of a lost save: what the read found. */
  checked: 'same' | 'changed' | 'failed' | 'gone' | null;
  /** A read for the base failed after a save or a reset: what shows may be out of date, and Save waits for a reload. */
  stale: boolean;
  theirs: Theirs | null;
  /** The text a lost save carried (save 'unsure'). */
  sent: string | null;
  /** A read of the workflow (check, compare, reload, the base after a save) is out. */
  reading: boolean;
}

export interface SourceStore {
  view(): SourceView;
  subscribe(fn: () => void): () => void;
  load(): Promise<void>;
  setDraft(text: string): void;
  save(): Promise<void>;
  check(): Promise<void>;
  abandon(): void;
  compare(): Promise<void>;
  keepMine(): void;
  /** Take the workflow as it is now and drop the draft (reads it first when compare has not). */
  reload(): Promise<void>;
  reset(): void;
}

const EMPTY: SourceView = {
  load: 'idle', loadError: null, project: false, revision: null, base: null, draft: '', dirty: false, problem: null,
  save: 'idle', refusal: null, checked: null, stale: false, theirs: null, sent: null, reading: false,
};

const LOST: Refusal = { kind: 'pending', code: '', status: 0, notApplied: false };

export function createSourceStore(deps: { api: Pick<WorkflowSourceApi, 'get' | 'put'> }): SourceStore {
  const subs = new Set<() => void>();
  let v: SourceView = EMPTY;
  let gen = 0, flight = false;
  let sentRev: string | null = null;
  let sentDef: Record<string, unknown> | null = null;
  let seen: SourceDoc | null = null;

  const put = (p: Partial<SourceView>): void => {
    const next = { ...v, ...p };
    next.dirty = next.base !== null && next.draft !== next.base;
    const d = definitionOf(next.draft);
    next.problem = 'problem' in d ? { kind: d.problem, line: d.line ?? null, key: d.key ?? null } : null;
    v = next;
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };
  const adopt = (d: SourceDoc): void => {
    put({ load: 'ready', loadError: null, project: d.project, revision: d.revision, base: d.content, draft: d.content, save: 'idle', refusal: null, checked: null, stale: false, theirs: null, sent: null });
    sentRev = null; sentDef = null; seen = null;
  };
  const read = async (): Promise<{ doc: SourceDoc } | { gone: true } | { fail: { code: string; status: number } } | null> => {
    const mine = gen;
    let r: Settled;
    try { r = await deps.api.get(); } catch { r = { ok: false, err: LOST }; }
    if (mine !== gen) return null;
    if (r.ok) { const doc = sourceOf(r.body); return doc ? { doc } : { fail: { code: 'unreadable', status: 0 } }; }
    if (r.err.kind === 'stale') return null;
    if (r.err.status === 404 || r.err.code === 'not_found') return { gone: true };
    return { fail: { code: r.err.code, status: r.err.status } };
  };

  async function load(): Promise<void> {
    if (v.load === 'loading' || v.load === 'ready' || flight) return;
    const mine = gen;
    put({ load: 'loading', reading: true });
    const got = await read();
    if (mine !== gen) return;
    if (got === null) { put({ load: 'idle', reading: false }); return; }
    if ('doc' in got) { adopt(got.doc); put({ reading: false }); return; }
    if ('gone' in got) { put({ load: 'gone', reading: false }); return; }
    put({ load: 'failed', loadError: got.fail, reading: false });
  }

  function setDraft(text: string): void {
    if (v.load !== 'ready') return;
    put({ draft: text, ...(v.save === 'saved' || v.save === 'refused' ? { save: 'idle' as const, refusal: null } : {}), checked: null });
  }

  // The base for the next save after an answered save: the workflow read again. The draft keeps anything typed since.
  async function rebase(text: string): Promise<void> {
    const mine = gen;
    put({ reading: true });
    const got = await read();
    if (mine !== gen) return;
    if (got && 'doc' in got) {
      const d = got.doc;
      put({ reading: false, revision: d.revision, project: d.project, base: d.content, ...(v.draft === text ? { draft: d.content } : {}), stale: false });
      return;
    }
    if (got && 'gone' in got) { put({ reading: false, load: 'gone' }); return; }
    put({ reading: false, stale: true });
  }

  async function save(): Promise<void> {
    if (v.load !== 'ready' || flight || v.reading || v.revision === null || !v.dirty || v.stale) return;
    if (v.save === 'unsure' || v.save === 'conflict' || v.save === 'saving') return;
    const d = definitionOf(v.draft);
    if ('problem' in d) return;
    const mine = gen, text = v.draft, atRev = v.revision;
    flight = true;
    put({ save: 'saving', refusal: null, checked: null });
    let r: Settled;
    try { r = await deps.api.put(d.def, atRev); } catch { r = { ok: false, err: LOST }; }
    if (mine !== gen) return;
    flight = false;
    if (r.ok) {
      // A 200 that is not an envelope saying it ran cannot be read as saved.
      if (obj(r.body) && r.body.is_error === false) {
        put({ save: 'saved', revision: null, refusal: null, sent: null });
        await rebase(text);
        return;
      }
      sentRev = atRev; sentDef = d.def; put({ save: 'unsure', sent: text });
      return;
    }
    const e = r.err;
    if (e.kind === 'stale') { put({ save: 'idle' }); return; }
    if (e.kind === 'pending') { sentRev = atRev; sentDef = d.def; put({ save: 'unsure', sent: text }); return; }
    if (e.code === 'revision_conflict' && e.notApplied) { put({ save: 'conflict', theirs: null }); return; }
    put({ save: 'refused', refusal: { code: e.code, status: e.status, unsent: e.kind === 'not_sent', ...(e.reason ? { reason: e.reason } : {}) } });
  }

  async function check(): Promise<void> {
    if (v.save !== 'unsure' || flight || v.reading || !sentDef) return;
    const mine = gen, def = sentDef, was = sentRev;
    seen = null;
    put({ reading: true, checked: null });
    const got = await read();
    if (mine !== gen) return;
    if (got === null || 'fail' in got) { put({ reading: false, checked: 'failed' }); return; }
    if ('gone' in got) { put({ reading: false, checked: 'gone' }); return; }
    const d = got.doc;
    if (holdsSent(d.content, def)) {
      // The workflow holds what was sent. The draft keeps whatever was typed since.
      put({ reading: false, save: 'saved', revision: d.revision, project: d.project, base: d.content, ...(v.draft === v.sent ? { draft: d.content } : {}), sent: null, checked: null });
      sentRev = null; sentDef = null;
      return;
    }
    // The same workflow as before the send, or another: neither says the save did nothing (it may still land, or have
    // landed before another writer). It stays unknown, with what was seen.
    seen = d;
    put({ reading: false, checked: d.revision === was ? 'same' : 'changed' });
  }

  function abandon(): void {
    if (v.save !== 'unsure' || v.reading) return;
    const d = seen;
    put({ save: 'idle', sent: null, checked: null, ...(d ? { revision: d.revision, base: d.content, project: d.project } : {}) });
    sentRev = null; sentDef = null; seen = null;
  }

  async function compare(): Promise<void> {
    if (v.save !== 'conflict' || v.reading) return;
    const mine = gen;
    put({ reading: true, theirs: { phase: 'reading' } });
    const got = await read();
    if (mine !== gen) return;
    if (got === null || 'fail' in got) { put({ reading: false, theirs: { phase: 'failed', code: got && 'fail' in got ? got.fail.code : '', status: got && 'fail' in got ? got.fail.status : 0 } }); return; }
    if ('gone' in got) { put({ reading: false, theirs: { phase: 'gone' } }); return; }
    put({ reading: false, project: got.doc.project, theirs: { phase: 'read', content: got.doc.content, revision: got.doc.revision } });
  }

  function keepMine(): void {
    const t = v.theirs;
    if (v.save !== 'conflict' || !t || t.phase !== 'read') return;
    put({ save: 'idle', revision: t.revision, base: t.content, theirs: null, refusal: null, checked: null });
  }

  async function reload(): Promise<void> {
    if (flight || v.reading || v.save === 'unsure') return;
    const t = v.theirs;
    if (t && t.phase === 'read') { adopt({ content: t.content, revision: t.revision, project: v.project }); return; }
    const mine = gen;
    put({ reading: true });
    const got = await read();
    if (mine !== gen) return;
    if (got && 'doc' in got) { adopt(got.doc); put({ reading: false }); return; }
    if (got && 'gone' in got) {
      if (v.save === 'conflict') put({ reading: false, theirs: { phase: 'gone' } });
      else put({ reading: false, load: 'gone', save: 'idle', sent: null });
      return;
    }
    put({ reading: false, stale: true, ...(v.save === 'conflict' && got && 'fail' in got ? { theirs: { phase: 'failed' as const, ...got.fail } } : {}) });
  }

  function subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

  return {
    view: () => v,
    subscribe,
    load, setDraft, save, check, abandon, compare, keepMine, reload,
    reset() {
      gen++; flight = false; sentRev = null; sentDef = null; seen = null;
      v = EMPTY;
      for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
    },
  };
}
