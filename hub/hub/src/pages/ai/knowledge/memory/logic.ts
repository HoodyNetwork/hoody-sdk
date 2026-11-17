// Knowledge → Memory as the page shows it. Pure: the agent's answers → the page's shapes, and the proofs of its
// changes. An answer that is not the shape the agent sends throws (core turns a select throw into a failed read), so a
// broken answer is never shown as an empty library.
//
// What the agent says:
//   - getMemoryDataHost: {datahost:{realm, state, host, reason, self_id, can_use_self, hosts[{id, name, is_current,
//     is_self}]}}, one of eight states, each a 200. A named realm whose memory is not connected on the
//     agent answers 503 service_unavailable instead (the gateway's code for memory_realm_cold).
//   - getMemoryStatus: `available` says whether a store resolved, `degraded` tells a fault from an off realm. The other
//     reads answer an EMPTY page for a realm whose memory is off, so rows are shown
//     only under a status that says available.
//   - listMemoryItems rows are each store's own shape: a memory {id, type, title, strength, version, updated_at}, an
//     observation {id, ts, title, tool_name}; lessons and slots are sent without json names (ID, Content, Confidence,
//     UpdatedAt / Name, Content, UpdatedAt), so both spellings are read. The shape is not published yet.

export type Kind = 'memory' | 'lesson' | 'slot' | 'observation';
export const KINDS: readonly Kind[] = ['memory', 'lesson', 'slot', 'observation'];

export type HostState = 'leader' | 'follower' | 'electing' | 'unavailable' | 'stuck' | 'not_realm_member' | 'fleet_disabled' | 'realm_blocked';
const STATES: readonly HostState[] = ['leader', 'follower', 'electing', 'unavailable', 'stuck', 'not_realm_member', 'fleet_disabled', 'realm_blocked'];

export interface HostRow {
  id: string;
  name: string;
  current: boolean;
  self: boolean;
}
export interface DataHost {
  /** The realm the answer is about: 'global', a 24-hex id, or '' (fleet_disabled, realm_blocked: none was decided). */
  realm: string;
  state: HostState;
  host: string;
  reason: string;
  canUseSelf: boolean;
  hosts: readonly HostRow[];
}

export interface MemoryStatus {
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  recoverable: boolean;
  reason: string;
  remedy: string;
  /** The project's last tidy-up: recorded (with its time), never, unreadable; null without a project. */
  consolidated: { kind: 'recorded'; at: string } | { kind: 'never' } | { kind: 'unreadable' } | null;
  degradedReads: readonly string[];
  /** The whole store's sizes; null when the agent could not read them (or sent them malformed): unread, never 0. */
  totals: StoreTotals | null;
  /** The project's sizes (only read with a project); null without a project or when unread. */
  counts: ProjectCounts | null;
  /** How much of the project is embedded for recall (only with a project); null without one or when unread. */
  coverage: EmbedCoverage | null;
  /** The realm the status was read for (set by the read, not the agent). */
  realm: string;
}

/** getMemoryStatus `totals`: what the whole store keeps, every project and the realm-wide scope together. */
export interface StoreTotals { projects: number; memories: number; observations: number; lessons: number; slots: number; sessions: number; graph_nodes: number }
/** getMemoryStatus `counts` (?project=): what that project keeps. */
export interface ProjectCounts { memories: number; observations: number; sessions: number; graph_nodes: number; graph_edges: number }
/** getMemoryStatus `embedding_coverage` (?project=): the project's search documents (`total`) and those embedded with the
 *  current model; `model` '' means embeddings are off (then `embedded` is 0). Shown as sent, never clamped. */
export interface EmbedCoverage { embedded: number; total: number; model: string }

const TOTALS_KEYS = ['projects', 'memories', 'observations', 'lessons', 'slots', 'sessions', 'graph_nodes'] as const;
const COUNTS_KEYS = ['memories', 'observations', 'sessions', 'graph_nodes', 'graph_edges'] as const;

/** One block of sizes: every key a whole number >= 0, else null (the block is unread; the rest of the status stands). */
function sizes<K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | null {
  const r = rec(v);
  if (!r) return null;
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const n = r[k];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

function coverageOf(v: unknown): EmbedCoverage | null {
  const r = rec(v);
  const n = sizes(r, ['embedded', 'total'] as const);
  if (!r || !n || typeof r.model !== 'string') return null;
  return { embedded: n.embedded, total: n.total, model: r.model };
}

export interface ProjectRow {
  /** The project's key; '' for the realm-wide scope (lessons and slots not tied to a project). */
  key: string;
  /** The project's folder; '' for the realm-wide scope (the agent's "(global)" placeholder is not a folder). */
  root: string;
  name: string;
  memories: number;
  lessons: number;
  observations: number;
  slots: number;
  updatedAt: string;
}

export interface ItemRow {
  /** The row id: the record id, a slot's name. */
  id: string;
  kind: Kind;
  /** memory: its type; observation: the tool. */
  type: string;
  /** memory/observation: the title; lesson/slot: the content. */
  text: string;
  /** A slot's name. */
  name: string;
  /** memory: 1..10, else null (unknown or not a memory). */
  strength: number | null;
  /** lesson: 0..1, else null. */
  confidence: number | null;
  when: string;
  /** memory: its version (an edit of content or type makes version+1 under a new id), else null. */
  version: number | null;
}

export interface ItemPage {
  items: readonly ItemRow[];
  total: number;
}

/** One record as getMemoryItem gives it (the fields the page shows). */
export interface MemoryRecord {
  id: string;
  kind: Kind;
  title: string;
  content: string;
  type: string;
  strength: number | null;
  context: string;
  confidence: number | null;
  name: string;
  concepts: readonly string[];
  files: readonly string[];
  version: number | null;
  created: string;
  updated: string;
  forgetAfter: string;
  /** A memory: its storage tier (one of MEMORY_TIERS, or '' when the answer does not say). */
  tier: string;
  tool: string;
  /** A memory: whether this is the newest version (an edit of its content or type makes a new record with a new id,
   *  ParentID naming this one); null when the answer does not say. */
  latest: boolean | null;
  /** A memory: the version it replaced ('' for a first version). */
  parent: string;
  /** An observation: what the agent noted (its narrative), the facts, a subtitle; its time is `created`. */
  facts: readonly string[];
  subtitle: string;
  /** The editable fields the answer carried (null counts: the agent sends an unset list or expiry as null). A field it
   *  left out reads as its empty value above, which is no evidence: an edit's proof needs the field carried. */
  given: readonly ProofField[];
}

/** The record fields an edit's read-back compares. */
export type ProofField = 'content' | 'type' | 'strength' | 'concepts' | 'files' | 'tier' | 'forgetAfter' | 'context' | 'confidence';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null);
// Field readers: an absent field (undefined or null) is its empty value; a field of the wrong type throws, so a
// malformed answer is a failed read, never a plausible blank or zero.
const bad = (what: string): never => {
  throw new Error(`malformed ${what}`);
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : bad('text'));
const strs = (v: unknown): string[] =>
  v === undefined || v === null ? [] : Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : bad('list');
/** A record id: text, or a whole number (lessons are sent with numeric ids). */
const idOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : '');
const int = (v: unknown): number | null => (v === undefined || v === null ? null : typeof v === 'number' && Number.isInteger(v) ? v : bad('number'));
const count = (v: unknown): number => (v === undefined || v === null ? 0 : typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : bad('count'));
const bool = (v: unknown): boolean | null => (v === undefined || v === null ? null : typeof v === 'boolean' ? v : bad('flag'));
/** The first of these keys present on r (snake_case, then the Go name). */
const pick = (r: Rec, ...keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined) return r[k];
  return undefined;
};
/** A Go zero time (never set) reads as unknown, not year 1. */
const time = (v: unknown): string => {
  const s = str(v);
  return s.startsWith('0001-01-01') ? '' : s;
};

/** A strength the page can draw: a whole number 1..10, else null. */
export function strengthOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
}

// The store keeps strength 1..10 and confidence 0..1 (schema CHECKs): absent reads as unknown, anything else present
// is a malformed answer.
const strengthField = (v: unknown): number | null => (v === undefined || v === null ? null : strengthOf(v) ?? bad('strength'));
const confidenceOf = (v: unknown): number | null =>
  v === undefined || v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : bad('confidence');

/** getMemoryDataHost's answer. Throws on anything but one of the eight states. */
export function dataHostOf(raw: unknown): DataHost {
  const d = rec(rec(raw)?.datahost);
  const state = str(d?.state) as HostState;
  if (!d || !STATES.includes(state)) throw new Error('not a data-host answer');
  const hosts = (Array.isArray(d.hosts) ? d.hosts : []).map((h) => {
    const r = rec(h);
    if (!r || !str(r.id)) throw new Error('not a host');
    return { id: str(r.id), name: str(r.name), current: r.is_current === true, self: r.is_self === true };
  });
  return { realm: str(d.realm), state, host: str(d.host), reason: str(d.reason), canUseSelf: d.can_use_self === true, hosts };
}

/** getMemoryStatus's answer. Throws when the three facts the page decides on are not booleans. */
export function statusOf(raw: unknown, realm: string): MemoryStatus {
  const r = rec(raw);
  if (!r || typeof r.enabled !== 'boolean' || typeof r.available !== 'boolean' || typeof r.degraded !== 'boolean') throw new Error('not a memory status');
  const lc = str(r.last_consolidated);
  const consolidated: MemoryStatus['consolidated'] =
    lc === 'recorded' ? (str(r.last_consolidated_at) ? { kind: 'recorded', at: str(r.last_consolidated_at) } : { kind: 'unreadable' })
      : lc === 'never' ? { kind: 'never' }
        : lc === 'unreadable' ? { kind: 'unreadable' }
          : null;
  return {
    enabled: r.enabled,
    available: r.available,
    degraded: r.degraded,
    recoverable: r.recoverable === true,
    reason: str(r.reason),
    remedy: str(r.remedy),
    consolidated,
    degradedReads: strs(r.degraded_reads),
    totals: sizes(r.totals, TOTALS_KEYS),
    counts: sizes(r.counts, COUNTS_KEYS),
    coverage: coverageOf(r.embedding_coverage),
    realm,
  };
}

/** A folder's last name ("~/projects/shop" → "shop"); the key when there is no folder. */
export function projectName(root: string, key: string): string {
  const parts = root.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || key;
}

function items(raw: unknown): unknown[] {
  const r = rec(raw);
  if (!r || !Array.isArray(r.items)) throw new Error('not a listing');
  return r.items;
}

/** listMemoryProjects's answer: the named projects, and the realm-wide scope (key "", listed by the agent only while
 *  lessons or slots are kept for every project) with no folder and no name: the page words it. */
export function projectsOf(raw: unknown): ProjectRow[] {
  return items(raw).flatMap((x) => {
    const r = rec(x);
    if (!r || typeof r.key !== 'string') throw new Error('not a project');
    const root = r.key === '' ? '' : str(r.root);
    return [{
      key: r.key, root, name: r.key === '' ? '' : projectName(root, r.key),
      memories: count(r.memories), lessons: count(r.lessons), observations: count(r.observations), slots: count(r.slots),
      updatedAt: time(r.updated_at),
    }];
  });
}

/** One listMemoryItems row of `kind`. Throws on a row without its id. */
export function itemOf(x: unknown, kind: Kind): ItemRow {
  const r = rec(x);
  if (!r) throw new Error('not a row');
  const base: ItemRow = { id: '', kind, type: '', text: '', name: '', strength: null, confidence: null, when: '', version: null };
  let row: ItemRow;
  if (kind === 'memory') row = { ...base, id: idOf(r.id), type: str(r.type), text: str(r.title), strength: strengthField(r.strength), when: time(r.updated_at), version: int(r.version) };
  else if (kind === 'observation') row = { ...base, id: idOf(r.id), type: str(r.tool_name), text: str(r.title), when: time(r.ts) };
  else if (kind === 'lesson') row = { ...base, id: idOf(pick(r, 'id', 'ID')), text: str(pick(r, 'content', 'Content')), confidence: confidenceOf(pick(r, 'confidence', 'Confidence')), when: time(pick(r, 'updated_at', 'UpdatedAt')) };
  else {
    const name = str(pick(r, 'name', 'Name'));
    row = { ...base, id: name, name, text: str(pick(r, 'content', 'Content')), when: time(pick(r, 'updated_at', 'UpdatedAt')) };
  }
  if (!row.id) throw new Error(`not a ${kind}`);
  return row;
}

/** listMemoryItems's answer for `kind`: the page and the total across pages. */
export function itemPageOf(raw: unknown, kind: Kind): ItemPage {
  const list = items(raw).map((x) => itemOf(x, kind));
  const total = rec(rec(raw)?.meta)?.total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < list.length) throw new Error('not a page total');
  return { items: list, total };
}

/** The stores the agent's ranked search reads (its document kinds obs and memory; lessons and slots are not indexed). */
export const searchable = (k: Kind): boolean => k === 'memory' || k === 'observation';
/** A store's document kind in searchMemory's `kinds`. */
export const searchKindOf = (k: Kind): 'memory' | 'obs' => (k === 'observation' ? 'obs' : 'memory');

/** searchMemory's answer for one store: its hits in the agent's rank order (best first), as rows of `kind`. A hit of
 *  another document kind is not this store's and is left out; a hit without its id, or a malformed field, throws, so
 *  a broken answer is a failed search, never a shorter list. Its total is the hit count (a search has one page). */
export function hitsOf(raw: unknown, kind: Kind): ItemPage {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || !Array.isArray(r.hits)) throw new Error('not a search answer');
  const want = searchKindOf(kind);
  const seen = new Set<string>();
  const list: ItemRow[] = [];
  for (const x of r.hits) {
    const h = rec(x);
    if (!h || typeof h.kind !== 'string') throw new Error('not a hit');
    if (h.kind !== want) continue;
    // Every field the page reads is checked before anything is dropped, so a malformed hit is a failed search even
    // when it repeats a record or its title hides its narrative.
    const id = idOf(h.id);
    if (!id) throw new Error('not a hit');
    const title = str(h.title);
    const narrative = str(h.narrative);
    const type = str(h.type);
    const when = time(h.ts);
    // The store keeps importance (an observation's) and strength (a memory's) 1..10; 0 or none is a hit never given one.
    const imp = h.importance;
    const level = imp === undefined || imp === null || imp === 0 ? null : strengthOf(imp) ?? bad('importance');
    // One row per record: the fusion never answers one twice, and a second row would share the first's row id.
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({
      id, kind, type, text: title || narrative, name: '',
      strength: kind === 'memory' ? level : null,
      confidence: null, when, version: null,
    });
  }
  return { items: list, total: list.length };
}

/** getMemoryItem's answer (`record`, in the store's own spelling). Throws without the record's id. */
export function recordOf(raw: unknown, kind: Kind): MemoryRecord {
  const r = rec(rec(raw)?.record);
  if (!r) throw new Error('not a record');
  const name = str(pick(r, 'name', 'Name'));
  const id = kind === 'slot' ? name : idOf(pick(r, 'id', 'ID'));
  if (!id) throw new Error('not a record');
  // Records are the daemon's Go structs (Memory, Lesson, Slot, Observation) sent without json names, so the Go
  // spelling is read too. An observation's text is its narrative and its time its TS.
  const obs = kind === 'observation';
  const wire: Record<ProofField, unknown> = {
    content: obs ? pick(r, 'narrative', 'Narrative') : pick(r, 'content', 'Content'),
    type: pick(r, 'type', 'Type'), strength: pick(r, 'strength', 'Strength'), concepts: pick(r, 'concepts', 'Concepts'),
    files: pick(r, 'files', 'Files'), tier: pick(r, 'tier', 'Tier'), forgetAfter: pick(r, 'forget_after', 'ForgetAfter'),
    context: pick(r, 'context', 'Context'), confidence: pick(r, 'confidence', 'Confidence'),
  };
  return {
    id, kind, name,
    title: str(pick(r, 'title', 'Title')),
    content: str(obs ? pick(r, 'narrative', 'Narrative') : pick(r, 'content', 'Content')),
    type: str(obs ? pick(r, 'obs_type', 'ObsType') : pick(r, 'type', 'Type')),
    strength: kind === 'memory' ? strengthField(pick(r, 'strength', 'Strength')) : null,
    context: str(pick(r, 'context', 'Context')),
    confidence: kind === 'lesson' ? confidenceOf(pick(r, 'confidence', 'Confidence')) : null,
    concepts: strs(pick(r, 'concepts', 'Concepts')),
    files: strs(pick(r, 'files', 'Files')),
    version: int(pick(r, 'version', 'Version')),
    created: time(obs ? pick(r, 'ts', 'TS') : pick(r, 'created_at', 'CreatedAt')),
    updated: obs ? '' : time(pick(r, 'updated_at', 'UpdatedAt')),
    forgetAfter: time(pick(r, 'forget_after', 'ForgetAfter')),
    tier: kind === 'memory' ? str(pick(r, 'tier', 'Tier')) : '',
    tool: str(pick(r, 'tool_name', 'ToolName')),
    latest: kind === 'memory' ? bool(pick(r, 'is_latest', 'IsLatest')) : null,
    parent: kind === 'memory' ? str(pick(r, 'parent_id', 'ParentID')) : '',
    facts: obs ? strs(pick(r, 'facts', 'Facts')) : [],
    subtitle: obs ? str(pick(r, 'subtitle', 'Subtitle')) : '',
    given: (Object.keys(wire) as ProofField[]).filter((k) => wire[k] !== undefined),
  };
}

/** Which kinds an edit can change, and how (the agent's editMemoryItem: observations are not editable). */
export const editable = (k: Kind): boolean => k !== 'observation';

/** The memory types the agent takes (an edit naming any other is refused). A record
 *  may still hold an older type: it is kept unless the person picks one of these. Pinned to the agent's list by test. */
export const MEMORY_TYPES = ['pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact'] as const;
/** The storage tiers the agent takes. Pinned to the agent's list by test. */
export const MEMORY_TIERS = ['working', 'episodic', 'semantic', 'procedural'] as const;
/** The longest expiry the store can hold, in days; a longer one is refused. */
export const MAX_TTL_DAYS = 106751;

/** What an edit sends: the content always. A memory's type, strength, concepts, files, tier and expiry (ttl_days: 0
 *  makes it permanent, N > 0 forgets it N days after the agent applies the edit), a lesson's context and confidence,
 *  each only when the person changed it. */
export interface EditFields {
  /** Always sent for a memory and a slot; for a lesson only when the person changed it (the agent writes every field a
   *  lesson edit carries, so an untouched content would overwrite a newer one written elsewhere). */
  content?: string;
  type?: string;
  strength?: number;
  concepts?: string[];
  files?: string[];
  tier?: string;
  ttl_days?: number;
  context?: string;
  confidence?: number;
}
export type EditProblem = 'empty' | 'strength' | 'type' | 'tier' | 'ttl' | 'confidence' | 'unchanged';

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, n) => x === b[n]);
/** A list as the edit form writes it: one entry per line, trimmed, blank lines dropped. */
export const listOf = (text: string): string[] => text.split('\n').map((x) => x.trim()).filter((x) => x !== '');

/** Why an edit cannot be sent yet: empty content (a slot needs it; an empty memory is not a memory), a value the agent
 *  refuses (a strength outside 1..10, a type or tier not on its list, an expiry outside 0..MAX_TTL_DAYS whole days, a
 *  confidence outside 0..1), or nothing changed. null when it can be sent. */
export function editProblem(rec0: MemoryRecord, f: EditFields): EditProblem | null {
  if (f.content !== undefined && !f.content.trim()) return 'empty';
  if (f.strength !== undefined && strengthOf(f.strength) === null) return 'strength';
  if (f.type !== undefined && !(MEMORY_TYPES as readonly string[]).includes(f.type)) return 'type';
  if (f.tier !== undefined && !(MEMORY_TIERS as readonly string[]).includes(f.tier)) return 'tier';
  if (f.ttl_days !== undefined && !(Number.isSafeInteger(f.ttl_days) && f.ttl_days >= 0 && f.ttl_days <= MAX_TTL_DAYS)) return 'ttl';
  if (f.confidence !== undefined && !(Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1)) return 'confidence';
  const same =
    (f.content === undefined || f.content === rec0.content) &&
    (f.type === undefined || f.type === rec0.type) &&
    (f.strength === undefined || f.strength === rec0.strength) &&
    (f.concepts === undefined || sameList(f.concepts, rec0.concepts)) &&
    (f.files === undefined || sameList(f.files, rec0.files)) &&
    (f.tier === undefined || f.tier === rec0.tier) &&
    // Permanent already: clearing the expiry changes nothing. A number of days always sets a new date.
    (f.ttl_days === undefined || (f.ttl_days === 0 && rec0.forgetAfter === '')) &&
    (f.context === undefined || f.context === rec0.context) &&
    (f.confidence === undefined || f.confidence === rec0.confidence);
  return same ? 'unchanged' : null;
}

/** An edit's identity: where it went and what it set. */
export interface EditIdentity extends EditFields {
  computer: string;
  realm: string;
  project: string;
  kind: Kind;
  id: string;
}

/** Whether an edit's lost answer can be proved by reading the record back. An expiry of N days cannot: the agent dates it
 *  from its own clock when it applies the edit, and a date of about N days from now can just as well be another writer's
 *  (one the page never read, or one written after this edit was sent). Such an edit stays held until the person stops
 *  waiting; it is never proved, so it is never shown done when it may not have happened. */
export const editProvable = (identity: unknown): boolean => {
  const d = rec(identity)?.ttl_days;
  return !(typeof d === 'number' && d > 0);
};

/** Whether a memory edit may have made a new version: the agent forks one when the content, type, concepts or files
 *  differ from what it holds. Type, concepts and files are sent only when they differ from the record
 *  read; the content always goes, so it counts when it differs from that read. */
export function editMayFork(identity: unknown, x: MemoryRecord | undefined): boolean {
  const i = rec(identity);
  if (!i || i.kind !== 'memory') return false;
  if (i.type !== undefined || i.concepts !== undefined || i.files !== undefined) return true;
  return typeof i.content === 'string' && (x === undefined || i.content !== x.content);
}

/** The words of a held edit: checked elsewhere; proved by Check again; or an N-day expiry no read proves, checked on
 *  this record or, when the edit may have made a new version, on that newer version (this page's date never moves). */
export function heldEditKey(identity: unknown, elsewhere: boolean, x: MemoryRecord | undefined): 'edit.heldElsewhere' | 'edit.held' | 'edit.heldExpiry' | 'edit.heldExpiryNew' {
  if (elsewhere) return 'edit.heldElsewhere';
  if (editProvable(identity)) return 'edit.held';
  return editMayFork(identity, x) ? 'edit.heldExpiryNew' : 'edit.heldExpiry';
}

const sameStrs = (a: unknown, b: readonly string[]) => Array.isArray(a) && sameList(a as string[], b);

/** The record (of a getMemoryItem read, with its read's `at`) that shows an edit applied, by id: the edited record
 *  itself showing every value sent (a strength, tier, expiry or lesson edit keeps the id), or its successor (a content,
 *  type, concepts or files edit makes a new record whose parent is the edited one) showing them, read in the edit's own
 *  realm and project. Every field sent is compared. null when the record shows neither. */
export function editShownBy(identity: unknown, record: unknown): string | null {
  const i = rec(identity) as Partial<EditIdentity> | null;
  const x = rec(record) as (MemoryRecord & { at?: Rec }) | null;
  if (!i || typeof i.id !== 'string' || !x || x.kind !== i.kind || !editProvable(i)) return null;
  if (i.content !== undefined && typeof i.content !== 'string') return null;
  if (x.id !== i.id && x.parent !== i.id) return null;
  if (!x.at || x.at.realm !== i.realm || x.at.project !== i.project) return null;
  // Each field sent must be one the answer carried: a field left out reads empty, which would prove a clear.
  const sent: [keyof EditFields, ProofField][] = [
    ['content', 'content'], ['type', 'type'], ['strength', 'strength'], ['concepts', 'concepts'], ['files', 'files'],
    ['tier', 'tier'], ['ttl_days', 'forgetAfter'], ['context', 'context'], ['confidence', 'confidence'],
  ];
  const given = Array.isArray(x.given) ? x.given : [];
  if (sent.some(([f, g]) => i[f] !== undefined && !given.includes(g))) return null;
  const same =
    (i.content === undefined || x.content === i.content) &&
    (i.type === undefined || x.type === i.type) &&
    (i.strength === undefined || x.strength === i.strength) &&
    (i.concepts === undefined || sameStrs(i.concepts, x.concepts)) &&
    (i.files === undefined || sameStrs(i.files, x.files)) &&
    (i.tier === undefined || x.tier === i.tier) &&
    // Only a cleared expiry (ttl_days 0) can show here: an N-day one is never provable (editProvable).
    (i.ttl_days === undefined || (i.ttl_days === 0 && x.forgetAfter === '')) &&
    (i.context === undefined || x.context === i.context) &&
    (i.confidence === undefined || x.confidence === i.confidence);
  return same ? x.id : null;
}

/** A fresh read-back proves an edit applied when one record read shows it (editShownBy). Answers are getMemoryItem
 *  reads of the change's computer: the open record's, and while an edit is held the reads of its possible successors. */
export function editProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  return answers.some((g) => g.some((a) => editShownBy(identity, a) !== null)) ? 'applied' : undefined;
}

/** A new memory (saveMemoryItem): every field the form sets. strength 1..10; ttl_days absent keeps it forever, N > 0
 *  forgets it N days after the save. */
export interface CreateFields {
  content: string;
  type: string;
  strength: number;
  concepts: string[];
  files: string[];
  ttl_days?: number;
}
/** Where a create went and what it set, plus `before`: the ids of the project's newest memories the page had read when
 *  it was sent (none of them can be this save's record), and `sentAt`: the Hub's clock (epoch ms) at Save. */
export interface CreateIdentity extends CreateFields {
  computer: string;
  realm: string;
  project: string;
  before: string[];
  sentAt: number;
}
/** How far a record's creation time (the agent's clock) may lie before or after the Hub's Save time and still be the
 *  save's: clock skew and request time. Outside it the record is someone else's, made before or long after. */
export const CREATE_EARLY_MS = 10 * 60_000;
export const CREATE_LATE_MS = 60 * 60_000;
export type CreateProblem = 'empty' | 'type' | 'strength' | 'ttl';
/** Why the form cannot save, as the agent would refuse it (memory.save), or null. */
export function createProblem(f: CreateFields): CreateProblem | null {
  if (f.content.trim() === '') return 'empty';
  if (!(MEMORY_TYPES as readonly string[]).includes(f.type)) return 'type';
  if (strengthOf(f.strength) === null) return 'strength';
  if (f.ttl_days !== undefined && !(Number.isSafeInteger(f.ttl_days) && f.ttl_days >= 1 && f.ttl_days <= MAX_TTL_DAYS)) return 'ttl';
  return null;
}
/** Whether a read can show a lost create (createShownBy): not one that sets an expiry of N days (its date can be another
 *  writer's, as an edit's, editProvable). */
export const createProvable = (identity: unknown): boolean => {
  const d = rec(identity)?.ttl_days;
  return !(typeof d === 'number' && d > 0);
};
/** The record (a getMemoryItem read, with its read's `at`) that shows a lost create's values: a first version that is
 *  the latest, in the create's realm and project, made within [sentAt - CREATE_EARLY_MS, sentAt + CREATE_LATE_MS] (its
 *  creation time never moves: an older record that an edit moved up the list is not it), not among the memories read
 *  before it was sent, showing every field it set as the agent keeps them (content trimmed; type, strength, concepts and
 *  files as sent) and no expiry. It may still be another writer's identical save made in that window: what it shows is
 *  that this memory is in the project now; it never ends the hold. null otherwise. */
export function createShownBy(identity: unknown, record: unknown): string | null {
  const i = rec(identity) as Partial<CreateIdentity> | null;
  const x = rec(record) as (MemoryRecord & { at?: Rec }) | null;
  if (!i || !x || x.kind !== 'memory' || !createProvable(i)) return null;
  if (typeof i.content !== 'string' || typeof i.type !== 'string' || typeof i.strength !== 'number') return null;
  if (!Array.isArray(i.concepts) || !Array.isArray(i.files) || !Array.isArray(i.before) || typeof i.sentAt !== 'number') return null;
  if (!x.at || x.at.realm !== i.realm || x.at.project !== i.project) return null;
  if (x.version !== 1 || x.latest !== true || i.before.includes(x.id)) return null;
  const made = Date.parse(x.created);
  if (!(made >= i.sentAt - CREATE_EARLY_MS && made <= i.sentAt + CREATE_LATE_MS)) return null;
  const given = Array.isArray(x.given) ? x.given : [];
  const needed: ProofField[] = ['content', 'type', 'strength', 'concepts', 'files', 'forgetAfter'];
  if (needed.some((g) => !given.includes(g))) return null;
  const same =
    x.content === i.content.trim() && x.type === i.type && x.strength === i.strength &&
    sameStrs(i.concepts, x.concepts) && sameStrs(i.files, x.files) && x.forgetAfter === '';
  return same ? x.id : null;
}
/** The memory rows that may be a lost create's record: first versions of its type not read before it was sent (the
 *  list is newest first), at most 5. */
export function createCandidates(rows: readonly ItemRow[], type: string, before: readonly string[]): ItemRow[] {
  return rows.filter((r) => r.kind === 'memory' && r.version === 1 && r.type === type && !before.includes(r.id)).slice(0, 5);
}
/** Whether a 2xx answer says the save ran: status ok and the new record's id. Anything else may have saved: held. */
export const createAnswered = (raw: unknown): boolean => rec(raw)?.status === 'ok' && idOf(rec(raw)?.id) !== '';
/** Whether a Stop tracking of a held create drops the form's draft: only when it ended the hold (`stopped`), the band
 *  showed Found it at the press, and the draft is unchanged since the press. */
export const stopDropsDraft = (stopped: boolean, foundAtPress: boolean, unchanged: boolean): boolean => stopped && foundAtPress && unchanged;
/** saveMemoryItem's answer: the new record's id. Throws without one. */
export function createReplyOf(raw: unknown): { id: string } {
  const id = idOf(rec(raw)?.id);
  if (!id) throw new Error('not a save answer');
  return { id };
}

/** Whether a 2xx edit answer says the edit ran: status ok and the record it names (a slot by its name, every other
 *  kind by its id). Anything else may have been applied: held. */
export function editAnswered(raw: unknown, kind: unknown): boolean {
  const r = rec(raw);
  if (r?.status !== 'ok') return false;
  return kind === 'slot' ? typeof r.name === 'string' && r.name !== '' : idOf(r.id) !== '';
}
/** editMemoryItem's answer: the record's id now. A content, type, concepts or files edit answers a NEW id (the old
 *  record is kept as history); a strength, tier or expiry edit keeps the id, as a lesson or slot edit does. Throws
 *  without one. */
export function editReplyOf(raw: unknown): { id: string } {
  const id = idOf(rec(raw)?.id);
  if (!id) throw new Error('not an edit answer');
  return { id };
}

/** The memory rows that may be a record's successor (version+1; the list is newest first), at most 3. */
export function successorRows(rows: readonly ItemRow[], version: number | null): ItemRow[] {
  if (version === null) return [];
  return rows.filter((r) => r.kind === 'memory' && r.version === version + 1).slice(0, 3);
}

/** A fresh status read proves the on/off change when it shows the value sent, in the realm it was sent to. */
export function enabledProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = rec(identity);
  if (!i || typeof i.enabled !== 'boolean' || typeof i.realm !== 'string') return undefined;
  for (const group of answers) {
    for (const a of group) {
      const s = rec(a) as Partial<MemoryStatus> | null;
      if (s && s.realm === i.realm && s.enabled === i.enabled) return 'applied';
    }
  }
  return undefined;
}

/** A delete is proved only by the record being gone from a realm the agent still serves: the record read answers
 *  404 not_found AND a status read of the same realm answers. (A realm this login no longer serves is a 404 not_found
 *  too, so the record's 404 alone proves nothing.) */
export function deleteProved(item: { error: { kind: string; code: string | null } | null; ok: boolean }, status: { ok: boolean }): boolean {
  return !item.ok && item.error !== null && item.error.kind === 'not_found' && item.error.code === 'not_found' && status.ok;
}

/** The stores whose records delete by id, several at once (a slot deletes one at a time, by name). */
export const deletesMany = (k: Kind): boolean => k !== 'slot';

/** A delete of several records answered: status ok and a whole `deleted` count. The count is the rows the agent removed,
 *  which for memories includes every earlier version of each one (GovernanceDelete expands the lineage), so it is never
 *  compared with the number of ids sent. Anything else (a 2xx without it) proves nothing and is held. */
export const manyAnswered = (raw: unknown): boolean => rec(raw)?.status === 'ok' && Number.isSafeInteger(rec(raw)?.deleted) && (rec(raw)?.deleted as number) >= 0;

/** A held delete of several records, after Check again read each one: how many reads prove it gone (deleteProved, each
 *  with the same status read), and whether all of them do. Only every id proved frees the hold: the agent deletes in
 *  chunks of 500 ids, and a chunk that fails after an earlier one committed leaves some deleted and the rest unknown. */
export function manyProved(items: readonly { error: { kind: string; code: string | null } | null; ok: boolean }[], status: { ok: boolean }): { gone: number; all: boolean } {
  const gone = items.filter((i) => deleteProved(i, status)).length;
  return { gone, all: items.length > 0 && gone === items.length };
}

/** A failed read as the page words it: a 503 is the realm's memory not connected on the agent right now (the agent's
 *  answer for a named realm whose memory is cold, Retry-After); anything else is a read that did not answer. */
export const failureOf = (e: { status: number | null } | null | undefined): 'cold' | 'unreachable' => (e && e.status === 503 ? 'cold' : 'unreachable');

export type LibraryState = 'loading' | 'cold' | 'unreachable' | 'off' | 'degraded' | 'ready';

/** What the library may show, from the status read alone: rows only when a store resolved (`available`). A failed
 *  status read, a degraded store and an off realm each have their own words, never an empty library. */
export function libraryState(q: { data?: MemoryStatus; error?: { status: number | null } | null; isPending?: boolean }): LibraryState {
  if (q.error) return failureOf(q.error);
  if (!q.data) return 'loading';
  if (q.data.available) return 'ready';
  return q.data.degraded ? 'degraded' : 'off';
}

/** The band's view of where memory is kept, from the data-host read. */
export function bandHost(q: { data?: DataHost; error?: { status: number | null } | null }, hostName: (h: DataHost) => string):
  { kind: 'loading' } | { kind: 'cold' } | { kind: 'unreachable' } | { kind: 'state'; state: HostState; host: string } {
  if (q.error) return { kind: failureOf(q.error) };
  if (!q.data) return { kind: 'loading' };
  return { kind: 'state', state: q.data.state, host: hostName(q.data) };
}

/** The serving host's name: the current host's alias, "this computer"'s own name for the agent's computer, else a
 *  short id (the agent could not name it). */
export function hostName(d: DataHost, computer: string): string {
  const cur = d.hosts.find((h) => h.current) ?? d.hosts.find((h) => h.id === d.host);
  if (cur?.self || (d.state === 'leader' && !cur)) return computer;
  if (cur?.name) return cur.name;
  const id = cur?.id || d.host;
  return id ? (id.length > 12 ? id.slice(0, 12) + '…' : id) : computer;
}

// --- The relation graph (getMemoryGraph) ---

/** One entity of a project's relation graph: a name the agent pulled from what it saw, of a type, with its link count. */
export interface GraphNodeRow {
  id: string;
  type: string;
  name: string;
  /** Links to other entities, in the whole graph (the agent's degree), not only on this page. */
  degree: number;
  /** When it was last seen, '' if never recorded. */
  lastSeen: string;
}

/** One relation between two entities of the same page. */
export interface GraphEdgeRow {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
}

/** One page of the graph: entities by link count (most first), the relations between them, and the whole graph's size. */
export interface GraphPage {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  totalNodes: number;
  totalEdges: number;
  /** The whole graph's entity count per type, by type name. */
  nodesByType: Record<string, number>;
  /** The page holds fewer entities than the graph. */
  truncated: boolean;
  /** Read from the agent's saved top-of-graph copy, not the live graph. */
  fromSnapshot: boolean;
  /** That copy is older than the graph (a rebuild is pending). */
  dirty: boolean;
  /** The agent's own warning: the page may be incomplete, or the graph could not be read. */
  warning: string;
}

const counts = (v: unknown): Record<string, number> => {
  if (v === undefined || v === null) return {};
  const r = rec(v) ?? bad('counts');
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(r)) out[k] = count(n);
  return out;
};
const weight = (v: unknown): number => (v === undefined || v === null ? 0 : typeof v === 'number' && Number.isFinite(v) ? v : bad('weight'));

/** getMemoryGraph's answer (status ok; nodes, edges and stats in the daemon's Go spelling). A malformed entity or
 *  relation throws, so a broken answer is a failed read, never a smaller graph. A relation naming an entity not on the
 *  page is left out (the agent keeps only relations whose two ends are on the page). */
export function graphPageOf(raw: unknown): GraphPage {
  const r = rec(raw);
  // The daemon's lists are Go slices: an empty one (no entities, no relations among them, the no-snapshot warning) is
  // sent as null. A missing list or any other value is not a graph.
  const list = (v: unknown): readonly unknown[] => (v === null ? [] : Array.isArray(v) ? v : bad('graph list'));
  if (!r || r.status !== 'ok' || !('nodes' in r) || !('edges' in r)) throw new Error('not a graph page');
  const rawNodes = list(r.nodes);
  const rawEdges = list(r.edges);
  const nodes: GraphNodeRow[] = [];
  const ids = new Set<string>();
  for (const x of rawNodes) {
    const n = rec(x);
    if (!n) throw new Error('not an entity');
    const id = idOf(pick(n, 'id', 'ID'));
    if (!id) throw new Error('not an entity');
    const row = { id, type: str(pick(n, 'type', 'Type')), name: str(pick(n, 'name', 'Name')), degree: count(pick(n, 'degree', 'Degree')), lastSeen: time(pick(n, 'last_seen_at', 'LastSeenAt')) };
    if (ids.has(id)) continue;
    ids.add(id);
    nodes.push(row);
  }
  const edges: GraphEdgeRow[] = [];
  const seen = new Set<string>();
  for (const x of rawEdges) {
    const e = rec(x);
    if (!e) throw new Error('not a relation');
    const id = idOf(pick(e, 'id', 'ID'));
    const source = idOf(pick(e, 'source_id', 'SourceID'));
    const target = idOf(pick(e, 'target_id', 'TargetID'));
    if (!id || !source || !target) throw new Error('not a relation');
    const row = { id, source, target, type: str(pick(e, 'type', 'Type')), weight: weight(pick(e, 'weight', 'Weight')) };
    if (seen.has(id) || !ids.has(source) || !ids.has(target)) continue;
    seen.add(id);
    edges.push(row);
  }
  const st = r.stats === undefined || r.stats === null ? {} : rec(r.stats) ?? bad('stats');
  const totalNodes = count(pick(st, 'total_nodes', 'TotalNodes'));
  return {
    nodes, edges,
    totalNodes: Math.max(totalNodes, nodes.length),
    totalEdges: count(pick(st, 'total_edges', 'TotalEdges')),
    nodesByType: counts(pick(st, 'nodes_by_type', 'NodesByType')),
    truncated: bool(r.truncated) ?? false,
    fromSnapshot: bool(r.from_snapshot) ?? false,
    dirty: bool(r.dirty) ?? false,
    warning: str(r.warning),
  };
}

/** An entity's relations on the page, as the other end and the relation's direction, heaviest first. */
export function relationsOf(page: GraphPage, id: string): { edge: GraphEdgeRow; other: GraphNodeRow; outgoing: boolean }[] {
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const out: { edge: GraphEdgeRow; other: GraphNodeRow; outgoing: boolean }[] = [];
  for (const e of page.edges) {
    const outgoing = e.source === id;
    if (!outgoing && e.target !== id) continue;
    const other = byId.get(outgoing ? e.target : e.source);
    if (other) out.push({ edge: e, other, outgoing });
  }
  return out.sort((a, b) => b.edge.weight - a.edge.weight || a.other.name.localeCompare(b.other.name));
}
