// TODOs, pure parts: the tab each todo belongs to, the thread from getTodo, and when the store poll cursor
// says the list is out of date.
import { describe, expect, it } from 'vitest';
import { cursorOf, moved, threadOf, todoList, todoRow } from './logic';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const raw = (o: Record<string, unknown> = {}) => ({ id: 'todo_1', num: 1, title: 'Rotate keys', state: 'ready', priority: 1, rank: 1, realm: 'global', revision: 3, ...o });
const tab = (o: Record<string, unknown>) => todoRow(raw(o), NOW).tab;

describe('todos: tabs', () => {
  it('open: inbox, ready, blocked and review with nothing else going on', () => {
    for (const state of ['inbox', 'ready', 'blocked', 'review']) expect(tab({ state })).toBe('open');
  });
  it('done: done and dropped, whatever else the row says', () => {
    expect(tab({ state: 'done', needs_human: true })).toBe('done');
    expect(tab({ state: 'dropped', lease: { daemon_id: 'd' } })).toBe('done');
  });
  it('running: in progress or holding a worker lease', () => {
    expect(tab({ state: 'in_progress' })).toBe('running');
    expect(tab({ state: 'ready', lease: { daemon_id: 'd', acquired_at: 'x', expires_at: 'y' } })).toBe('running');
  });
  it('waiting for you: triage asks a person', () => {
    expect(tab({ needs_human: true, question_for_human: 'Which key?' })).toBe('waiting');
    expect(todoRow(raw({ needs_human: true, question_for_human: ' Which key? ' }), NOW).question).toBe('Which key?');
  });
  it('waiting for you: a proposed run waiting for a person (pending_proposals), with the same precedence as triage\'s question', () => {
    expect(tab({ pending_proposals: 1 })).toBe('waiting');
    expect(todoRow(raw({ pending_proposals: 2 }), NOW).pendingProposals).toBe(2);
    // Absent is 0 (the agent omits it when no proposal waits); 0 changes nothing.
    expect(tab({})).toBe('open');
    expect(tab({ pending_proposals: 0 })).toBe('open');
    expect(todoRow(raw(), NOW).pendingProposals).toBe(0);
    // Done and running win, as they do over needs_human; a snoozed todo with a proposal waiting is waiting.
    expect(tab({ state: 'done', pending_proposals: 1 })).toBe('done');
    expect(tab({ state: 'in_progress', pending_proposals: 1 })).toBe('running');
    expect(tab({ wake_at: '2026-10-28T00:00:00Z', pending_proposals: 1 })).toBe('waiting');
  });
  it('a pending_proposals that is not a whole number of at least 0 fails the read, never "none waiting"', () => {
    for (const bad of [-1, 1.5, '2', null, true, Number.NaN]) {
      expect(() => todoRow(raw({ pending_proposals: bad }), NOW)).toThrow();
      expect(() => todoList({ items: [raw({ pending_proposals: bad })], revision: 1 }, NOW)).toThrow();
    }
  });
  it('snoozed: a wake time still ahead; a past one is open again', () => {
    expect(tab({ wake_at: '2026-10-28T00:00:00Z' })).toBe('snoozed');
    expect(tab({ wake_at: '2026-10-26T00:00:00Z' })).toBe('open');
    expect(tab({ wake_at: 'soon' })).toBe('open');
  });
});

describe('todos: list and thread', () => {
  it('keeps the list revision; a non-listing, a member without an id or no cursor fails the read', () => {
    const l = todoList({ items: [raw()], meta: { total: 1 }, revision: 42 }, NOW);
    expect(l.rows).toHaveLength(1);
    expect(l.revision).toBe(42);
    // Not a listing, a member that is not a todo, or no cursor: the read fails, never "nothing here" or a dead poll.
    expect(() => todoList(null, NOW)).toThrow();
    expect(() => todoList({ revision: 3 }, NOW)).toThrow();
    expect(() => todoList({ items: [{ title: 'no id' }], revision: 3 }, NOW)).toThrow();
    expect(() => todoList({ items: ['x'], revision: 3 }, NOW)).toThrow();
    expect(() => todoList({ items: [], revision: null }, NOW)).toThrow();
    expect(() => todoList({ items: [], revision: '3' }, NOW)).toThrow();
    expect(todoList({ items: [], revision: 0 }, NOW).rows).toEqual([]);
  });
  it('the thread keeps the timeline in order and the proposals with their status', () => {
    const t = threadOf({ status: 'ok', todo: { ...raw(), body: 'Body', timeline: [
      { id: 'e1', ts: '2026-10-27T10:00:00Z', kind: 'filed', actor: { kind: 'human' } },
      { id: 'e2', ts: '2026-10-27T11:00:00Z', kind: 'comment', actor: { kind: 'human' }, body: 'Use the vault' },
    ], proposals: [{ id: 'p1', action: 'run_worker', agent: 'implementer', prompt: 'Do it', status: 'pending', todo_revision: 1, created_at: 'x', expires_at: 'y' }, { id: 'p2', status: 'odd' }] } }, NOW)!;
    expect(t.entries.map((e) => [e.kind, e.actor, e.body])).toEqual([['filed', 'human', ''], ['comment', 'human', 'Use the vault']]);
    expect(t.proposals.map((p) => p.status)).toEqual(['pending', 'unknown']);
    expect(t.body).toBe('Body');
    expect(() => threadOf({ status: 'ok' }, NOW)).toThrow();
  });
  it('a thread with a timeline or proposals of the wrong shape fails the read; omitted ones are empty', () => {
    expect(threadOf({ todo: raw() }, NOW).entries).toEqual([]);
    expect(threadOf({ todo: raw() }, NOW).proposals).toEqual([]);
    expect(() => threadOf({ todo: { ...raw(), timeline: 'x' } }, NOW)).toThrow();
    expect(() => threadOf({ todo: { ...raw(), timeline: [null] } }, NOW)).toThrow();
    expect(() => threadOf({ todo: { ...raw(), timeline: null } }, NOW)).toThrow();
    expect(() => threadOf({ todo: { ...raw(), proposals: null } }, NOW)).toThrow();
    expect(() => threadOf({ todo: { ...raw(), proposals: {} } }, NOW)).toThrow();
    expect(() => threadOf({ todo: { ...raw(), proposals: [{ status: 'pending' }] } }, NOW)).toThrow();
  });
  it('a poll cursor must be an integer', () => {
    expect(cursorOf(7)).toBe(7);
    for (const bad of ['7', null, undefined, 1.5]) expect(() => cursorOf(bad)).toThrow();
  });
  it('the list is out of date only when both cursors are known and differ', () => {
    expect(moved(3, 4)).toBe(true);
    expect(moved(3, 3)).toBe(false);
    expect(moved(undefined, 4)).toBe(false);
    expect(moved(3, undefined)).toBe(false);
  });
});
