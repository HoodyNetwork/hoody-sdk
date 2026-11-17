// Memory logic: answers → shapes (a broken answer throws, never an empty library), the library's state from the
// status read alone, the band's failures (503 vs the rest), and the proofs of an edit, an on/off change and a delete.
import { describe, expect, it } from 'vitest';
import {
  bandHost, createAnswered, CREATE_EARLY_MS, CREATE_LATE_MS, createCandidates, createProblem, createProvable, createReplyOf, stopDropsDraft, createShownBy, dataHostOf, deleteProved, deletesMany, editAnswered, editMayFork, editProblem, editProvable, editProved, editReplyOf, editShownBy, enabledProved, failureOf, graphPageOf, heldEditKey, hitsOf, hostName, itemOf, itemPageOf,
  libraryState, listOf, manyAnswered, manyProved, MAX_TTL_DAYS, projectName, projectsOf, recordOf, relationsOf, searchable, searchKindOf, statusOf, strengthOf, successorRows,
  type ItemRow, type MemoryRecord, type MemoryStatus, type ProofField,
} from './logic';

const R = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const st = (o: Partial<MemoryStatus> = {}): MemoryStatus => ({ enabled: true, available: true, degraded: false, recoverable: false, reason: '', remedy: '', consolidated: null, degradedReads: [], totals: null, counts: null, coverage: null, realm: R, ...o });

describe('dataHostOf', () => {
  it.each(['leader', 'follower', 'electing', 'unavailable', 'stuck', 'not_realm_member', 'fleet_disabled', 'realm_blocked'])('reads %s', (state) => {
    expect(dataHostOf({ datahost: { state, hosts: [] } }).state).toBe(state);
  });
  it('throws on another state, no datahost, or a host without an id', () => {
    expect(() => dataHostOf({ datahost: { state: 'odd' } })).toThrow();
    expect(() => dataHostOf({})).toThrow();
    expect(() => dataHostOf({ datahost: { state: 'leader', hosts: [{ name: 'x' }] } })).toThrow();
  });
  it('reads the hosts', () => {
    expect(dataHostOf({ datahost: { state: 'leader', host: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_current: true, is_self: true }] } }))
      .toMatchObject({ host: 'c1', canUseSelf: true, hosts: [{ id: 'c1', name: 'atlas', current: true, self: true }] });
  });
});

describe('statusOf', () => {
  it('throws without the three booleans', () => {
    expect(() => statusOf({ enabled: true, available: true }, R)).toThrow();
    expect(() => statusOf({ enabled: 'yes', available: true, degraded: false }, R)).toThrow();
    expect(() => statusOf(null, R)).toThrow();
  });
  it('reads the last tidy-up: recorded with a time, never, unreadable; recorded without a time is unreadable', () => {
    const base = { enabled: true, available: true, degraded: false };
    expect(statusOf({ ...base, last_consolidated: 'recorded', last_consolidated_at: '2026-10-01T00:00:00Z' }, R).consolidated).toEqual({ kind: 'recorded', at: '2026-10-01T00:00:00Z' });
    expect(statusOf({ ...base, last_consolidated: 'recorded' }, R).consolidated).toEqual({ kind: 'unreadable' });
    expect(statusOf({ ...base, last_consolidated: 'never' }, R).consolidated).toEqual({ kind: 'never' });
    expect(statusOf({ ...base, last_consolidated: 'unreadable' }, R).consolidated).toEqual({ kind: 'unreadable' });
    expect(statusOf(base, R).consolidated).toBeNull();
    expect(statusOf(base, R).realm).toBe(R);
  });
  it('reads the store totals, the project counts and the embedding coverage as sent', () => {
    const base = { enabled: true, available: true, degraded: false };
    const totals = { projects: 3, memories: 40, observations: 900, lessons: 5, slots: 2, sessions: 31, graph_nodes: 120 };
    const counts = { memories: 12, observations: 300, sessions: 9, graph_nodes: 44, graph_edges: 61 };
    const st = statusOf({ ...base, totals, counts, embedding_coverage: { embedded: 310, total: 312, model: 'local-minilm' } }, R);
    expect(st.totals).toEqual(totals);
    expect(st.counts).toEqual(counts);
    expect(st.coverage).toEqual({ embedded: 310, total: 312, model: 'local-minilm' });
    // Embeddings off: model '' is a fact, not unread.
    expect(statusOf({ ...base, embedding_coverage: { embedded: 0, total: 312, model: '' } }, R).coverage).toEqual({ embedded: 0, total: 312, model: '' });
    // Stale embeddings may outnumber the documents: shown as sent, never clamped or refused.
    expect(statusOf({ ...base, embedding_coverage: { embedded: 315, total: 312, model: 'm' } }, R).coverage).toEqual({ embedded: 315, total: 312, model: 'm' });
  });
  it('an absent or malformed block is unread (null), never 0, and the rest of the status stands', () => {
    const base = { enabled: true, available: true, degraded: true, degraded_reads: ['totals'] };
    const st = statusOf(base, R);
    expect(st.totals).toBeNull();
    expect(st.counts).toBeNull();
    expect(st.coverage).toBeNull();
    expect(st.degradedReads).toEqual(['totals']);
    const good = { projects: 1, memories: 1, observations: 1, lessons: 1, slots: 1, sessions: 1, graph_nodes: 1 };
    for (const bad of [{ ...good, memories: -1 }, { ...good, memories: 1.5 }, { ...good, memories: '3' }, (({ slots: _s, ...rest }) => rest)(good), [], 'x']) {
      const r = statusOf({ ...base, totals: bad }, R);
      expect(r.totals).toBeNull();
      expect(r.enabled).toBe(true);
    }
    expect(statusOf({ ...base, embedding_coverage: { embedded: 1, total: 2 } }, R).coverage).toBeNull();
    expect(statusOf({ ...base, counts: { memories: 1 } }, R).counts).toBeNull();
  });
});

describe('libraryState: rows only when a store resolved', () => {
  it('ready only when available', () => {
    expect(libraryState({ data: st() })).toBe('ready');
    expect(libraryState({ data: st({ available: false, degraded: true }) })).toBe('degraded');
    expect(libraryState({ data: st({ available: false, enabled: false }) })).toBe('off');
    expect(libraryState({})).toBe('loading');
  });
  it('a failed read wins over old data: 503 is cold, anything else unreachable', () => {
    expect(libraryState({ data: st(), error: { status: 503 } })).toBe('cold');
    expect(libraryState({ data: st(), error: { status: 500 } })).toBe('unreachable');
    expect(libraryState({ error: { status: null } })).toBe('unreachable');
    expect(failureOf({ status: 404 })).toBe('unreachable');
  });
});

describe('band host', () => {
  const d = (o: object) => dataHostOf({ datahost: { state: 'follower', hosts: [], ...o } });
  it('failures and loading', () => {
    expect(bandHost({ error: { status: 503 } }, () => '')).toEqual({ kind: 'cold' });
    expect(bandHost({ error: { status: 502 } }, () => '')).toEqual({ kind: 'unreachable' });
    expect(bandHost({}, () => '')).toEqual({ kind: 'loading' });
  });
  it('names the current host: this computer, the alias, else a short id', () => {
    expect(hostName(d({ host: 'c1', hosts: [{ id: 'c1', name: 'atlas', is_current: true, is_self: true }] }), 'atlas-local')).toBe('atlas-local');
    expect(hostName(d({ host: 'c2', hosts: [{ id: 'c2', name: 'borealis', is_current: true }] }), 'atlas')).toBe('borealis');
    expect(hostName(d({ host: 'abcdefabcdefabcdef', hosts: [] }), 'atlas')).toBe('abcdefabcdef…');
  });
});

describe('projects and rows', () => {
  it('keeps the realm-wide row (no folder, no name: the page words it) and names projects by folder', () => {
    const p = projectsOf({ items: [{ key: '', root: '(global)', lessons: 2, slots: 1 }, { key: 'k1', root: '/home/ada/shop/', memories: 3 }] });
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ key: '', root: '', name: '', lessons: 2, slots: 1, memories: 0 });
    expect(p[1]).toMatchObject({ key: 'k1', name: 'shop', memories: 3, lessons: 0 });
    expect(projectName('', 'k9')).toBe('k9');
    expect(() => projectsOf({ items: [{ root: '/x' }] })).toThrow();
    expect(() => projectsOf({})).toThrow();
  });
  it('reads each store’s own row shape (Go spelling for lessons and slots)', () => {
    expect(itemOf({ id: 'm', type: 't', title: 'T', strength: 7, version: 3 }, 'memory')).toMatchObject({ id: 'm', text: 'T', strength: 7, version: 3 });
    expect(itemOf({ id: 'm', title: 'T' }, 'memory')).toMatchObject({ strength: null, version: null });
    expect(itemOf({ ID: 4, Content: 'c', Confidence: 0.5 }, 'lesson')).toMatchObject({ id: '4', text: 'c', confidence: 0.5 });
    expect(recordOf({ record: { ID: 4, Content: 'c' } }, 'lesson').id).toBe('4');
    expect(() => itemOf({ ID: 4.5, Content: 'c' }, 'lesson')).toThrow();
    expect(itemOf({ Name: 'focus', Content: 'x', UpdatedAt: '0001-01-01T00:00:00Z' }, 'slot')).toMatchObject({ id: 'focus', name: 'focus', when: '' });
    expect(itemOf({ id: 'o', title: 'ran', tool_name: 'bash' }, 'observation')).toMatchObject({ type: 'bash' });
    expect(() => itemOf({ title: 'no id' }, 'memory')).toThrow();
  });
  it('a page needs a whole total at least its rows', () => {
    expect(itemPageOf({ items: [{ id: 'a' }], meta: { total: 9 } }, 'memory').total).toBe(9);
    expect(() => itemPageOf({ items: [{ id: 'a' }], meta: { total: 0 } }, 'memory')).toThrow();
    expect(() => itemPageOf({ items: [] }, 'memory')).toThrow();
  });
  it('strength is a whole 1..10', () => {
    expect([0, 1, 10, 11, 2.5, '3'].map(strengthOf)).toEqual([null, 1, 10, null, null, null]);
  });
  it('malformed fields are errors, never a plausible blank or zero (absent fields read as unknown)', () => {
    expect(() => projectsOf({ items: [{ key: 'k', memories: '3' }] })).toThrow();
    expect(() => projectsOf({ items: [{ key: 'k', memories: -1 }] })).toThrow();
    expect(() => projectsOf({ items: [{ key: 'k', lessons: 1.5 }] })).toThrow();
    expect(() => itemOf({ id: 'm', title: 7 }, 'memory')).toThrow();
    expect(() => itemOf({ id: 'm', strength: 11 }, 'memory')).toThrow();
    expect(() => itemOf({ id: 'm', strength: '5' }, 'memory')).toThrow();
    expect(() => itemOf({ ID: 4, Confidence: 2 }, 'lesson')).toThrow();
    expect(() => recordOf({ record: { ID: 'm', Content: 42 } }, 'memory')).toThrow();
    expect(() => recordOf({ record: { ID: 'm', Concepts: ['a', 1] } }, 'memory')).toThrow();
    expect(() => recordOf({ record: { ID: 'm', IsLatest: 'yes' } }, 'memory')).toThrow();
    expect(recordOf({ record: { ID: 'm', Files: null } }, 'memory')).toMatchObject({ content: '', files: [], strength: null, latest: null });
  });
  it('a memory record in the Go spelling: strength, version, lineage', () => {
    const r = recordOf({ record: { ID: 'm3', Content: 'c', Type: 'decision', Strength: 8, Version: 3, ParentID: 'm2', IsLatest: false, UpdatedAt: '2026-10-27T08:00:00Z', ForgetAfter: '0001-01-01T00:00:00Z' } }, 'memory');
    expect(r).toMatchObject({ id: 'm3', content: 'c', type: 'decision', strength: 8, version: 3, parent: 'm2', latest: false, updated: '2026-10-27T08:00:00Z', forgetAfter: '' });
  });
  it('an observation: its narrative is its text, its time is TS, with facts and subtitle', () => {
    const r = recordOf({ record: { ID: 'o1', TS: '2026-10-27T09:30:00Z', ToolName: 'bash', ObsType: 'command', Title: 'Ran', Subtitle: 'sub', Narrative: 'n', Facts: ['a', 'b'] } }, 'observation');
    expect(r).toMatchObject({ id: 'o1', content: 'n', type: 'command', created: '2026-10-27T09:30:00Z', updated: '', facts: ['a', 'b'], subtitle: 'sub', tool: 'bash', latest: null, parent: '' });
  });
  it('a record needs its id (a slot its name)', () => {
    expect(recordOf({ record: { Name: 's', Content: 'c' } }, 'slot').id).toBe('s');
    expect(() => recordOf({ record: { Content: 'c' } }, 'lesson')).toThrow();
    expect(() => recordOf({}, 'memory')).toThrow();
  });
});

const ALL_GIVEN: ProofField[] = ['content', 'type', 'strength', 'concepts', 'files', 'tier', 'forgetAfter', 'context', 'confidence'];
const rec = (o: Partial<MemoryRecord> = {}): MemoryRecord => ({ id: 'm1', kind: 'memory', title: '', content: 'a', type: 't', strength: 5, context: '', confidence: null, name: '', concepts: [], files: [], version: 1, created: '', updated: '', forgetAfter: '', tier: '', tool: '', latest: true, parent: '', facts: [], subtitle: '', given: ALL_GIVEN, ...o });

describe('edits', () => {
  it('editProblem', () => {
    expect(editProblem(rec(), { content: '  ' })).toBe('empty');
    expect(editProblem(rec(), { content: 'a' })).toBe('unchanged');
    expect(editProblem(rec(), { content: 'a', strength: 11 })).toBe('strength');
    expect(editProblem(rec(), { content: 'a', strength: 6 })).toBeNull();
    expect(editProblem(rec(), { content: 'b' })).toBeNull();
  });
  it('editProved: only a read of the same record, realm and project showing every value sent', () => {
    const id = { computer: 'c1', realm: R, project: 'p', kind: 'memory', id: 'm1', content: 'new', strength: 7 };
    const at = { realm: R, project: 'p' };
    expect(editProved(id, [[{ ...rec({ content: 'new', strength: 7 }), at }]])).toBe('applied');
    expect(editProved(id, [[{ ...rec({ content: 'new', strength: 6 }), at }]])).toBeUndefined();
    expect(editProved(id, [[{ ...rec({ content: 'new', strength: 7 }), at: { realm: 'bbbbbbbbbbbbbbbbbbbbbbb2', project: 'p' } }]])).toBeUndefined();
    expect(editProved(id, [[{ ...rec({ content: 'new', strength: 7 }), at: { realm: R, project: 'q' } }]])).toBeUndefined();
    expect(editProved(id, [[{ ...rec({ id: 'm2', content: 'new', strength: 7 }), at }]])).toBeUndefined();
    expect(editProved(id, [[{ ...rec({ content: 'new', strength: 7 }) }]])).toBeUndefined();
  });
  it('editShownBy / editProved: the successor of a content edit (parent = the edited id) showing every value, same realm and project', () => {
    const id = { computer: 'c1', realm: R, project: 'p', kind: 'memory', id: 'm1', content: 'new', type: 'gotcha' };
    const at = { realm: R, project: 'p' };
    const next = { ...rec({ id: 'm1v2', parent: 'm1', content: 'new', type: 'gotcha', version: 2 }), at };
    expect(editShownBy(id, next)).toBe('m1v2');
    expect(editProved(id, [[{ ...rec({ latest: false }), at }, next]])).toBe('applied');
    expect(editShownBy(id, { ...next, content: 'other' })).toBeNull();
    expect(editShownBy(id, { ...next, type: 't' })).toBeNull();
    expect(editShownBy(id, { ...next, parent: 'm0' })).toBeNull();
    expect(editShownBy(id, { ...next, at: { realm: R, project: 'q' } })).toBeNull();
    expect(editShownBy(id, { ...next, kind: 'lesson' })).toBeNull();
    expect(editProved(id, [[{ ...rec({ latest: false }), at }]])).toBeUndefined();
  });
  it('editReplyOf takes the id the agent answered; successorRows: version+1, at most 3', () => {
    expect(editReplyOf({ status: 'ok', id: 'm1v3', version: 3, superseded: 'm1' })).toEqual({ id: 'm1v3' });
    expect(() => editReplyOf({ status: 'ok' })).toThrow();
    const row = (id: string, version: number): ItemRow => ({ id, kind: 'memory', type: '', text: '', name: '', strength: null, confidence: null, when: '', version });
    const rows = [row('a', 3), row('b', 2), row('c', 3), row('d', 3), row('e', 3)];
    expect(successorRows(rows, 2).map((r) => r.id)).toEqual(['a', 'c', 'd']);
    expect(successorRows(rows, null)).toEqual([]);
  });
  it('enabledProved: the same realm showing the value', () => {
    expect(enabledProved({ realm: R, enabled: false }, [[st({ enabled: false })]])).toBe('applied');
    expect(enabledProved({ realm: R, enabled: false }, [[st({ enabled: true })]])).toBeUndefined();
    expect(enabledProved({ realm: R, enabled: false }, [[st({ enabled: false, realm: 'x' })]])).toBeUndefined();
  });
  it('deleteProved: the record 404 not_found AND the status answering', () => {
    const nf = { ok: false, error: { kind: 'not_found', code: 'not_found' } };
    expect(deleteProved(nf, { ok: true })).toBe(true);
    expect(deleteProved(nf, { ok: false })).toBe(false);
    expect(deleteProved({ ok: false, error: { kind: 'server', code: null } }, { ok: true })).toBe(false);
    expect(deleteProved({ ok: true, error: null }, { ok: true })).toBe(false);
    expect(deleteProved({ ok: false, error: { kind: 'not_found', code: null } }, { ok: true })).toBe(false);
  });
});

describe('the whole record', () => {
  const at = { realm: R, project: 'p' };
  const DAY = 86_400_000;
  const sent = Date.parse('2026-11-06T10:00:00Z');
  it('recordOf reads a memory\'s tier (Go spelling and json), never a lesson\'s', () => {
    expect(recordOf({ record: { ID: 'm1', Tier: 'semantic' } }, 'memory').tier).toBe('semantic');
    expect(recordOf({ record: { id: 'm1', tier: 'working' } }, 'memory').tier).toBe('working');
    expect(recordOf({ record: { ID: 'm1' } }, 'memory').tier).toBe('');
    expect(recordOf({ record: { ID: 7, Tier: 'semantic' } }, 'lesson').tier).toBe('');
    expect(() => recordOf({ record: { ID: 'm1', Tier: 3 } }, 'memory')).toThrow();
  });
  it('listOf: one entry per line, trimmed, blanks dropped', () => {
    expect(listOf(' deploy \n\n staging\n')).toEqual(['deploy', 'staging']);
    expect(listOf('')).toEqual([]);
  });
  it('editProblem refuses what the agent refuses, and an edit that changes nothing', () => {
    expect(editProblem(rec(), { content: 'a', type: 'decision' })).toBe('type');
    expect(editProblem(rec(), { content: 'a', type: 'fact' })).toBeNull();
    expect(editProblem(rec(), { content: 'a', tier: 'cold' })).toBe('tier');
    expect(editProblem(rec(), { content: 'a', tier: 'semantic' })).toBeNull();
    for (const n of [-1, 1.5, MAX_TTL_DAYS + 1, Number.NaN]) expect(editProblem(rec(), { content: 'a', ttl_days: n })).toBe('ttl');
    expect(editProblem(rec(), { content: 'a', ttl_days: MAX_TTL_DAYS })).toBeNull();
    for (const c of [-0.1, 1.01, Number.NaN]) expect(editProblem(rec({ kind: 'lesson' }), { content: 'a', confidence: c })).toBe('confidence');
    expect(editProblem(rec({ kind: 'lesson', confidence: 0.5 }), { content: 'a', confidence: 0.5 })).toBe('unchanged');
    expect(editProblem(rec({ kind: 'lesson', confidence: 0.5 }), { content: 'a', confidence: 1 })).toBeNull();
    expect(editProblem(rec({ concepts: ['x', 'y'] }), { content: 'a', concepts: ['x', 'y'] })).toBe('unchanged');
    expect(editProblem(rec({ concepts: ['x', 'y'] }), { content: 'a', concepts: ['y', 'x'] })).toBeNull();
    expect(editProblem(rec({ files: ['a.go'] }), { content: 'a', files: [] })).toBeNull();
    expect(editProblem(rec({ context: 'c' }), { content: 'a', context: 'c' })).toBe('unchanged');
    // Never on a record that is already kept for good changes nothing; a number of days always does.
    expect(editProblem(rec({ forgetAfter: '' }), { content: 'a', ttl_days: 0 })).toBe('unchanged');
    expect(editProblem(rec({ forgetAfter: '2027-01-01T00:00:00Z' }), { content: 'a', ttl_days: 0 })).toBeNull();
    expect(editProblem(rec(), { content: 'a', ttl_days: 30 })).toBeNull();
  });
  it('editShownBy compares every field sent: each one wrong alone is no proof', () => {
    const id = {
      computer: 'c1', realm: R, project: 'p', kind: 'memory', id: 'm1', content: 'new', type: 'fact', strength: 7,
      concepts: ['deploy', 'staging'], files: ['a.go'], tier: 'semantic', ttl_days: 0,
    };
    const next = { ...rec({ id: 'm1v2', parent: 'm1', content: 'new', type: 'fact', strength: 7, concepts: ['deploy', 'staging'], files: ['a.go'], tier: 'semantic', forgetAfter: '' }), at };
    expect(editShownBy(id, next)).toBe('m1v2');
    const wrong: Partial<MemoryRecord>[] = [
      { content: 'old' }, { type: 'bug' }, { strength: 6 }, { concepts: ['staging', 'deploy'] }, { concepts: ['deploy'] }, { files: [] },
      { tier: 'working' }, { forgetAfter: new Date(sent + 29 * DAY).toISOString() },
    ];
    for (const w of wrong) expect(editShownBy(id, { ...next, ...w })).toBeNull();
  });
  it('an expiry of N days is never proved by a read, even one matching it to the second', () => {
    // The read cannot tell this edit's expiry from one an unseen earlier writer, or a writer after it, set.
    const id = { computer: 'c1', realm: R, project: 'p', kind: 'memory', id: 'm1', content: 'a', ttl_days: 10 };
    expect(editProvable(id)).toBe(false);
    expect(editProvable({ ...id, ttl_days: 1 })).toBe(false);
    expect(editProvable({ ...id, ttl_days: 0 })).toBe(true);
    expect(editProvable({ computer: 'c1', id: 'm1', content: 'a', tier: 'semantic' })).toBe(true);
    const due = new Date(sent + 10 * DAY).toISOString();
    expect(editShownBy(id, { ...rec({ forgetAfter: due }), at })).toBeNull();
    // an earlier writer set 10 days five minutes before; a later one two minutes after: still no proof
    expect(editShownBy(id, { ...rec({ forgetAfter: new Date(sent + 10 * DAY - 300_000).toISOString() }), at })).toBeNull();
    expect(editShownBy(id, { ...rec({ forgetAfter: new Date(sent + 10 * DAY + 120_000).toISOString() }), at })).toBeNull();
    expect(editShownBy({ ...id, tier: 'semantic' }, { ...rec({ forgetAfter: due, tier: 'semantic' }), at })).toBeNull();
    // Never: proved only by no expiry at all.
    const never = { ...id, ttl_days: 0 };
    expect(editShownBy(never, { ...rec({ forgetAfter: '' }), at })).toBe('m1');
    expect(editShownBy(never, { ...rec({ forgetAfter: due }), at })).toBeNull();
  });
  it('a held edit\'s words: elsewhere, provable, N days on this record, or N days on a new version', () => {
    const x = rec({ content: 'a', type: 'fact' });
    const base = { computer: 'c1', realm: R, project: 'p', kind: 'memory', id: 'm1', content: 'a' };
    expect(heldEditKey({ ...base, ttl_days: 7 }, true, x)).toBe('edit.heldElsewhere');
    expect(heldEditKey({ ...base, tier: 'semantic' }, false, x)).toBe('edit.held');
    expect(heldEditKey({ ...base, ttl_days: 0 }, false, x)).toBe('edit.held');
    expect(heldEditKey({ ...base, ttl_days: 7, tier: 'semantic', strength: 3 }, false, x)).toBe('edit.heldExpiry');
    for (const f of [{ content: 'b' }, { type: 'bug' }, { concepts: [] }, { files: ['a.go'] }]) {
      expect(heldEditKey({ ...base, ttl_days: 7, ...f }, false, x), JSON.stringify(f)).toBe('edit.heldExpiryNew');
      expect(editMayFork({ ...base, ...f }, x)).toBe(true);
    }
    expect(editMayFork(base, x)).toBe(false);
    expect(editMayFork(base, undefined)).toBe(true);
    expect(editMayFork({ ...base, kind: 'lesson', content: 'b' }, x)).toBe(false);
  });
  it('a lesson edit is shown by the same record with its context and confidence', () => {
    const id = { computer: 'c1', realm: R, project: 'p', kind: 'lesson', id: '7', content: 'Ask first', context: 'Keys', confidence: 0.75 };
    const x = { ...rec({ id: '7', kind: 'lesson', content: 'Ask first', context: 'Keys', confidence: 0.75 }), at };
    expect(editShownBy(id, x)).toBe('7');
    expect(editShownBy(id, { ...x, context: 'keys' })).toBeNull();
    expect(editShownBy(id, { ...x, confidence: 0.7 })).toBeNull();
  });
  it('a field sent that the answer left out is no proof (a clear reads as its empty value)', () => {
    const base = { computer: 'c1', realm: R, project: 'p', id: 'm1' };
    const cases: [Record<string, unknown>, Record<string, unknown>, 'memory' | 'lesson'][] = [
      [{ kind: 'memory', content: 'a', concepts: [] }, { ID: 'm1', Content: 'a' }, 'memory'],
      [{ kind: 'memory', content: 'a', files: [] }, { ID: 'm1', Content: 'a' }, 'memory'],
      [{ kind: 'memory', content: 'a', ttl_days: 0 }, { ID: 'm1', Content: 'a' }, 'memory'],
      [{ kind: 'lesson', context: '' }, { ID: 'm1', Content: 'a' }, 'lesson'],
    ];
    for (const [sentFields, wire, kind] of cases) {
      const id = { ...base, ...sentFields };
      expect(editShownBy(id, { ...recordOf({ record: wire }, kind), at }), JSON.stringify(sentFields)).toBeNull();
    }
    // The same clears carried explicitly (null as the Go struct sends an unset list or expiry, or the empty value) prove.
    expect(editShownBy({ ...base, kind: 'memory', content: 'a', concepts: [] }, { ...recordOf({ record: { ID: 'm1', Content: 'a', Concepts: null } }, 'memory'), at })).toBe('m1');
    expect(editShownBy({ ...base, kind: 'memory', content: 'a', files: [] }, { ...recordOf({ record: { ID: 'm1', Content: 'a', Files: [] } }, 'memory'), at })).toBe('m1');
    expect(editShownBy({ ...base, kind: 'memory', content: 'a', ttl_days: 0 }, { ...recordOf({ record: { ID: 'm1', Content: 'a', ForgetAfter: null } }, 'memory'), at })).toBe('m1');
    expect(editShownBy({ ...base, kind: 'lesson', context: '' }, { ...recordOf({ record: { ID: 'm1', Content: 'a', Context: '' } }, 'lesson'), at })).toBe('m1');
  });
  it('a lesson edit may leave its content out; it is then neither checked nor needed', () => {
    expect(editProblem(rec({ kind: 'lesson', context: 'c' }), { context: 'd' })).toBeNull();
    expect(editProblem(rec({ kind: 'lesson', context: 'c' }), { context: 'c' })).toBe('unchanged');
    const id = { computer: 'c1', realm: R, project: 'p', kind: 'lesson', id: '7', context: 'd' };
    expect(editShownBy(id, { ...rec({ id: '7', kind: 'lesson', content: 'written elsewhere', context: 'd' }), at })).toBe('7');
  });
});

describe('a new memory', () => {
  const fields = { content: 'Tag releases on Fridays', type: 'workflow', strength: 9, concepts: ['release'], files: [] as string[] };
  const sentAt = Date.parse('2026-11-06T10:00:00Z');
  const ident = { computer: 'c', realm: R, project: 'p', before: ['old'], sentAt, ...fields };
  const iso = (ms: number) => new Date(ms).toISOString();
  const raw = (o: Record<string, unknown> = {}) => ({ record: { ID: 'n1', Type: 'workflow', Title: 't', Content: 'Tag releases on Fridays', Strength: 9, Concepts: ['release'], Files: null, Version: 1, IsLatest: true, CreatedAt: iso(sentAt + 1000), ForgetAfter: null, ...o } });
  const read = (o: Record<string, unknown> = {}, at = { realm: R, project: 'p' }) => ({ ...recordOf(raw(o), 'memory'), at });

  it('createProblem: empty content, a type off the list, a strength or day count out of range', () => {
    expect(createProblem(fields)).toBeNull();
    expect(createProblem({ ...fields, content: '  ' })).toBe('empty');
    expect(createProblem({ ...fields, type: 'decision' })).toBe('type');
    expect(createProblem({ ...fields, strength: 0 })).toBe('strength');
    expect(createProblem({ ...fields, strength: 11 })).toBe('strength');
    expect(createProblem({ ...fields, ttl_days: 0 })).toBe('ttl');
    expect(createProblem({ ...fields, ttl_days: MAX_TTL_DAYS + 1 })).toBe('ttl');
    expect(createProblem({ ...fields, ttl_days: 1.5 })).toBe('ttl');
    expect(createProblem({ ...fields, ttl_days: MAX_TTL_DAYS })).toBeNull();
  });

  it('createShownBy: a first version in the realm and project, not read before, every value as the agent keeps it', () => {
    expect(createShownBy(ident, read())).toBe('n1');
    // content is trimmed by the agent
    expect(createShownBy({ ...ident, content: '  Tag releases on Fridays \n' }, read())).toBe('n1');
  });

  it.each([
    ['another strength', { Strength: 2 }],
    ['another type', { Type: 'fact' }],
    ['other words', { Content: 'Tag releases on Mondays' }],
    ['other concepts', { Concepts: ['tags'] }],
    ['files', { Files: ['a.go'] }],
    ['an expiry', { ForgetAfter: '2027-01-01T00:00:00Z' }],
    ['a later version', { Version: 2 }],
    ['a record read before the save', { ID: 'old' }],
    ['an answer that leaves out a field', { Concepts: undefined }],
    ['a superseded record (an edit replaced it)', { IsLatest: false }],
    ['an answer that does not say it is the latest', { IsLatest: undefined }],
    ['a record made long before the save (an older one an edit moved up the list)', { CreatedAt: iso(sentAt - CREATE_EARLY_MS - 1000) }],
    ['a record made long after the save', { CreatedAt: iso(sentAt + CREATE_LATE_MS + 1000) }],
    ['a record with no creation time', { CreatedAt: undefined }],
  ])('createShownBy: %s proves nothing', (_n, o) => {
    expect(createShownBy(ident, read(o))).toBeNull();
  });

  it('createShownBy: another realm or project, or a create of N days, proves nothing', () => {
    expect(createShownBy(ident, read({}, { realm: 'global', project: 'p' }))).toBeNull();
    expect(createShownBy(ident, read({}, { realm: R, project: 'q' }))).toBeNull();
    expect(createProvable(ident)).toBe(true);
    expect(createProvable({ ...ident, ttl_days: 30 })).toBe(false);
    expect(createShownBy({ ...ident, ttl_days: 30 }, read({ ForgetAfter: '2027-01-01T00:00:00Z' }))).toBeNull();
    expect(createShownBy({ ...ident, before: undefined }, read())).toBeNull();
    expect(createShownBy({ ...ident, sentAt: undefined }, read())).toBeNull();
    // inside the window either side
    expect(createShownBy(ident, read({ CreatedAt: iso(sentAt - CREATE_EARLY_MS + 1000) }))).toBe('n1');
    expect(createShownBy(ident, read({ CreatedAt: iso(sentAt + CREATE_LATE_MS - 1000) }))).toBe('n1');
  });

  it('createCandidates: first versions of the type not read before, newest first, at most 5', () => {
    const row = (id: string, o: Partial<ItemRow> = {}): ItemRow => ({ id, kind: 'memory', type: 'workflow', text: '', name: '', strength: 9, confidence: null, when: '', version: 1, ...o });
    const rows = [row('a'), row('old'), row('b', { version: 2 }), row('c', { type: 'fact' }), row('d'), row('e'), row('f'), row('g'), row('h')];
    expect(createCandidates(rows, 'workflow', ['old']).map((r) => r.id)).toEqual(['a', 'd', 'e', 'f', 'g']);
  });

  it('createAnswered: only status ok with the new id says the save ran', () => {
    expect(createAnswered({ status: 'ok', id: 'n1' })).toBe(true);
    expect(createAnswered({ status: 'ok' })).toBe(false);
    expect(createAnswered({ id: 'n1' })).toBe(false);
    expect(createAnswered({ status: 'error', id: 'n1' })).toBe(false);
    expect(createAnswered(null)).toBe(false);
  });

  it('createReplyOf: the new id, else a failed answer', () => {
    expect(createReplyOf({ status: 'ok', id: 'n1', version: 1 })).toEqual({ id: 'n1' });
    expect(() => createReplyOf({ status: 'ok' })).toThrow();
  });
});

describe('memhub-edit-settles: editAnswered', () => {
  it('status ok and the record named: an id, or a slot\'s name', () => {
    expect(editAnswered({ status: 'ok', id: 'm1' }, 'memory')).toBe(true);
    expect(editAnswered({ status: 'ok', id: '7' }, 'lesson')).toBe(true);
    expect(editAnswered({ status: 'ok', name: 'focus' }, 'slot')).toBe(true);
    expect(editAnswered({ status: 'ok' }, 'memory')).toBe(false);
    expect(editAnswered({ status: 'ok', id: 'focus' }, 'slot')).toBe(false);
    expect(editAnswered({ status: 'ok', name: 'm1' }, 'memory')).toBe(false);
    expect(editAnswered({ id: 'm1' }, 'memory')).toBe(false);
    expect(editAnswered({ status: 'error', id: 'm1' }, 'memory')).toBe(false);
    expect(editAnswered(null, 'memory')).toBe(false);
  });
});

describe('a new memory: Stop tracking and the draft', () => {
  it('found and unchanged since the press: dropped', () => expect(stopDropsDraft(true, true, true)).toBe(true));
  it('nothing found: kept', () => expect(stopDropsDraft(true, false, true)).toBe(false));
  it('changed words: kept, found or not', () => {
    expect(stopDropsDraft(true, true, false)).toBe(false);
    expect(stopDropsDraft(true, false, false)).toBe(false);
  });
  it('a Stop tracking that did not end the hold: kept', () => expect(stopDropsDraft(false, true, true)).toBe(false));
});

describe('delete selected', () => {
  const gone = { ok: false, error: { kind: 'not_found', code: 'not_found' } };
  const kept = { ok: true, error: null };
  const lost = { ok: false, error: { kind: 'network', code: null } };
  it('every store but slots deletes many', () => {
    expect(deletesMany('memory')).toBe(true);
    expect(deletesMany('lesson')).toBe(true);
    expect(deletesMany('observation')).toBe(true);
    expect(deletesMany('slot')).toBe(false);
  });
  it('an answer is status ok with a whole deleted count (lineage may make it larger than the ids sent)', () => {
    expect(manyAnswered({ status: 'ok', deleted: 3 })).toBe(true);
    expect(manyAnswered({ status: 'ok', deleted: 0 })).toBe(true);
    expect(manyAnswered({ status: 'ok', deleted: 900 })).toBe(true);
    for (const raw of [null, {}, { status: 'ok' }, { deleted: 2 }, { status: 'ok', deleted: -1 }, { status: 'ok', deleted: 1.5 }, { status: 'ok', deleted: '2' }, { status: 'partial', deleted: 2 }, { status: 'ok', deleted: Number.NaN }]) expect(manyAnswered(raw)).toBe(false);
  });
  it('a 501-id delete (two agent chunks of 500) is proved only when every record reads gone and the status answers', () => {
    const all = Array.from({ length: 501 }, () => gone);
    expect(manyProved(all, { ok: true })).toEqual({ gone: 501, all: true });
    // The first chunk committed, the second failed: 500 gone, one still there.
    const part = [...Array.from({ length: 500 }, () => gone), kept];
    expect(manyProved(part, { ok: true })).toEqual({ gone: 500, all: false });
    // A read that failed for another reason proves nothing about its record.
    const unread = [...Array.from({ length: 500 }, () => gone), lost];
    expect(manyProved(unread, { ok: true })).toEqual({ gone: 500, all: false });
    // The realm's status not answering: a 404 may be a realm no longer served, so nothing counts as gone.
    expect(manyProved(all, { ok: false })).toEqual({ gone: 0, all: false });
  });
  it('no reads prove nothing', () => {
    expect(manyProved([], { ok: true })).toEqual({ gone: 0, all: false });
  });
});

describe('the ranked search answer', () => {
  const hit = (o: Record<string, unknown>) => ({ kind: 'memory', id: 'm1', score: 0.5, bm25_rank: 1, vec_rank: 2, graph_rank: 0, type: 'decision', title: 'T', narrative: 'N', ts: '2026-10-27T08:00:00Z', importance: 8, ...o });
  it('keeps the agent order, this store\'s hits only, one row per record', () => {
    const page = hitsOf({ status: 'ok', hits: [hit({ id: 'b' }), hit({ kind: 'obs', id: 'o' }), hit({ id: 'a' }), hit({ id: 'b' })] }, 'memory');
    expect(page.items.map((r) => r.id)).toEqual(['b', 'a']);
    expect(page.total).toBe(2);
    expect(page.items[0]).toEqual({ id: 'b', kind: 'memory', type: 'decision', text: 'T', name: '', strength: 8, confidence: null, when: '2026-10-27T08:00:00Z', version: null });
  });
  it('observations read the obs hits; a title-less hit shows its narrative; strength only for memories', () => {
    const page = hitsOf({ status: 'ok', hits: [hit({ kind: 'obs', id: 'o1', title: '', importance: 4 })] }, 'observation');
    expect(page.items[0]).toMatchObject({ id: 'o1', kind: 'observation', text: 'N', strength: null });
  });
  it('an unset strength or time reads as unknown', () => {
    expect(hitsOf({ status: 'ok', hits: [hit({ importance: 0, ts: '' })] }, 'memory').items[0]).toMatchObject({ strength: null, when: '' });
    expect(hitsOf({ status: 'ok', hits: [hit({ importance: null, ts: '0001-01-01T00:00:00Z' })] }, 'memory').items[0]).toMatchObject({ strength: null, when: '' });
  });
  it('a broken answer throws, never a shorter list', () => {
    for (const raw of [null, {}, { status: 'error', hits: [] }, { status: 'ok' }, { status: 'ok', hits: {} }, { status: 'ok', hits: [hit({ id: '' })] },
      { status: 'ok', hits: [hit({ id: undefined })] }, { status: 'ok', hits: [hit({ kind: 3 })] }, { status: 'ok', hits: ['x'] },
      { status: 'ok', hits: [hit({ title: 5 })] }, { status: 'ok', hits: [hit({ importance: '8' })] }, { status: 'ok', hits: [hit({ ts: 1 })] },
      // A repeat is checked too; a title does not hide a broken narrative; a present importance is 1..10 (0: none).
      { status: 'ok', hits: [hit({}), hit({ title: 5 })] }, { status: 'ok', hits: [hit({ narrative: 5 })] }, { status: 'ok', hits: [hit({ type: 1 })] },
      { status: 'ok', hits: [hit({ importance: 99 })] }, { status: 'ok', hits: [hit({ importance: 1.5 })] }, { status: 'ok', hits: [hit({ importance: -1 })] }]) {
      expect(() => hitsOf(raw, 'memory'), JSON.stringify(raw)).toThrow();
    }
  });
  it('an observation hit is checked as strictly (importance 1..10)', () => {
    expect(() => hitsOf({ status: 'ok', hits: [hit({ kind: 'obs', importance: 11 })] }, 'observation')).toThrow();
  });
  it('an empty hit list is no match, not a failure', () => {
    expect(hitsOf({ status: 'ok', hits: [] }, 'memory')).toEqual({ items: [], total: 0 });
  });
  it('only memories and observations are searched, as the agent\'s memory and obs kinds', () => {
    expect(['memory', 'lesson', 'slot', 'observation'].filter((k) => searchable(k as never))).toEqual(['memory', 'observation']);
    expect(searchKindOf('memory')).toBe('memory');
    expect(searchKindOf('observation')).toBe('obs');
  });
});

describe('the relation graph page', () => {
  // The daemon sends GraphNode / GraphEdge / GraphStats without json names: the Go spelling.
  const node = (id: string, name: string, degree: number, type = 'tool') => ({ ID: id, Project: 'p', Type: type, Name: name, NormalizedName: name.toLowerCase(), Properties: {}, Degree: degree, CreatedAt: '2026-10-20T00:00:00Z', UpdatedAt: '2026-10-21T00:00:00Z', LastSeenAt: '2026-10-22T00:00:00Z' });
  const edge = (id: string, s: string, t: string, type = 'uses', w = 1) => ({ ID: id, Project: 'p', SourceID: s, TargetID: t, Type: type, Weight: w, CreatedAt: '2026-10-20T00:00:00Z', LastSeenAt: '0001-01-01T00:00:00Z' });
  const page = (over: Record<string, unknown> = {}) => ({
    status: 'ok',
    nodes: [node('n1', 'bun', 3), node('n2', 'vitest', 2), node('n3', 'Hub', 1, 'project')],
    edges: [edge('e1', 'n3', 'n1', 'uses', 2), edge('e2', 'n2', 'n1', 'runs on', 0.5), edge('e3', 'n3', 'n9')],
    stats: { TotalNodes: 40, TotalEdges: 90, NodesByType: { tool: 30, project: 10 }, EdgesByType: { uses: 90 } },
    limit: 500, offset: 0, truncated: true, from_snapshot: true, dirty: false, warning: '',
    ...over,
  });

  it('reads the entities, the relations between them and the whole graph\'s size', () => {
    const g = graphPageOf(page());
    expect(g.nodes).toEqual([
      { id: 'n1', type: 'tool', name: 'bun', degree: 3, lastSeen: '2026-10-22T00:00:00Z' },
      { id: 'n2', type: 'tool', name: 'vitest', degree: 2, lastSeen: '2026-10-22T00:00:00Z' },
      { id: 'n3', type: 'project', name: 'Hub', degree: 1, lastSeen: '2026-10-22T00:00:00Z' },
    ]);
    // A relation to an entity not on the page is left out.
    expect(g.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(g).toMatchObject({ totalNodes: 40, totalEdges: 90, nodesByType: { tool: 30, project: 10 }, truncated: true, fromSnapshot: true, dirty: false, warning: '' });
  });

  it('an empty page with the agent\'s warning keeps the warning (the graph could not be read), and empty stats read as zero', () => {
    const g = graphPageOf({ status: 'ok', nodes: [], edges: [], stats: { TotalNodes: 0, TotalEdges: 0, NodesByType: null, EdgesByType: null }, truncated: false, warning: 'graph query exceeded budget and no snapshot is available' });
    expect(g).toMatchObject({ nodes: [], edges: [], totalNodes: 0, nodesByType: {}, warning: 'graph query exceeded budget and no snapshot is available' });
  });

  // The wire as the daemon sends it: nil Go slices arrive as null.
  it('null lists are empty lists: a healthy empty graph, entities with no relations among them, and the warning page', () => {
    expect(graphPageOf({ status: 'ok', nodes: null, edges: null, stats: { TotalNodes: 0, TotalEdges: 0, NodesByType: {}, EdgesByType: {} }, truncated: false, warning: '' })).toMatchObject({ nodes: [], edges: [], totalNodes: 0, warning: '' });
    expect(graphPageOf(page({ edges: null })).edges).toEqual([]);
    expect(graphPageOf(page({ edges: null })).nodes).toHaveLength(3);
    expect(graphPageOf({ status: 'ok', nodes: null, edges: null, stats: { TotalNodes: 0, TotalEdges: 0, NodesByType: {}, EdgesByType: {} }, limit: 500, offset: 0, truncated: false, warning: 'graph query exceeded budget and no snapshot is available' })).toMatchObject({ nodes: [], warning: 'graph query exceeded budget and no snapshot is available' });
  });

  it('a total smaller than the page is never shown: the page counts', () => {
    expect(graphPageOf(page({ stats: { TotalNodes: 1 } })).totalNodes).toBe(3);
  });

  it('a malformed answer throws, never a smaller graph', () => {
    expect(() => graphPageOf({ status: 'error', message: 'x' })).toThrow();
    // A reply that is not ok is never read as a graph, even with node and edge lists in it.
    expect(() => graphPageOf({ ...page({}), status: 'error' })).toThrow();
    expect(() => graphPageOf({ status: 'ok', edges: [] })).toThrow();
    expect(() => graphPageOf({ status: 'ok', nodes: [] })).toThrow();
    expect(() => graphPageOf({ status: 'ok', nodes: {}, edges: [] })).toThrow();
    expect(() => graphPageOf({ status: 'ok', nodes: [], edges: 'none' })).toThrow();
    expect(() => graphPageOf(page({ nodes: [{ Name: 'no id' }] }))).toThrow();
    expect(() => graphPageOf(page({ nodes: [{ ...node('n1', 'bun', 3), Degree: -1 }] }))).toThrow();
    expect(() => graphPageOf(page({ nodes: [{ ...node('n1', 'bun', 3), Name: 5 }] }))).toThrow();
    expect(() => graphPageOf(page({ edges: [{ ID: 'e1', SourceID: 'n1' }] }))).toThrow();
    expect(() => graphPageOf(page({ edges: [{ ...edge('e1', 'n1', 'n2'), Weight: 'heavy' }] }))).toThrow();
    // Checked before a repeat is dropped.
    expect(() => graphPageOf(page({ nodes: [node('n1', 'bun', 3), { ...node('n1', 'bun', 3), Degree: 1.5 }] }))).toThrow();
    expect(() => graphPageOf(page({ stats: { NodesByType: { tool: -2 } } }))).toThrow();
    expect(() => graphPageOf(page({ truncated: 'yes' }))).toThrow();
  });

  it('an entity\'s relations name the other end and the direction, heaviest first; other entities\' are not listed', () => {
    const g = graphPageOf(page());
    expect(relationsOf(g, 'n1').map((r) => [r.edge.type, r.other.name, r.outgoing])).toEqual([['uses', 'Hub', false], ['runs on', 'vitest', false]]);
    expect(relationsOf(g, 'n3').map((r) => [r.other.name, r.outgoing])).toEqual([['bun', true]]);
    expect(relationsOf(g, 'nx')).toEqual([]);
  });
});
