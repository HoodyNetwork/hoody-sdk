// The "All computers" chat list rules: which computers are followed, the change-feed
// frames, and one list of every followed computer's rows.
import { describe, expect, it } from 'vitest';
import { ALL_MAX, allComputerOf, applyFrame, followedComputers, listGap, mergeRows, type AllComputer } from './allChats.logic';
import type { ChatRow } from './chats.logic';

const pc = (id: string, o: Partial<AllComputer> = {}): AllComputer => ({ id, name: id.toUpperCase(), project: 'p1', server: 'sg-1', status: 'running', ...o });

describe('the computers the list follows', () => {
  it('reads a containers row: id, name (else the id end), project, server, status; a row without id or project is none', () => {
    expect(allComputerOf({ id: 'c0000aa1', name: 'atlas', project_id: 'p1', server_name: 'sg-1', server: { name: 'sunny-red-lemur' }, status: 'running' })).toEqual({ id: 'c0000aa1', name: 'atlas', project: 'p1', server: 'sg-1', status: 'running' });
    expect(allComputerOf({ id: 'c0000aa1', project_id: 'p1', server_name: 'sg-2', status: 'stopped' })).toMatchObject({ name: '0aa1', server: 'sg-2' });
    expect(allComputerOf({ name: 'x', project_id: 'p1' })).toBeNull();
    expect(allComputerOf({ id: 'c1', name: 'x' })).toBeNull();
  });

  it('the top-bar computer first, then the list order; each has its target and handle', () => {
    const f = followedComputers([pc('c1'), pc('c2'), pc('c3')], 'c2');
    expect(f.map((x) => x.computer.id)).toEqual(['c2', 'c1', 'c3']);
    expect(f[0]).toMatchObject({ read: true, handle: 'C2.c2', target: { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sg-1' } } });
  });

  it('a computer that is not running is listed, not read, with its state as the reason (never as empty)', () => {
    const f = followedComputers([pc('c1', { status: 'stopped' }), pc('c2', { status: 'starting' }), pc('c3', { status: 'error' }), pc('c4')], null);
    expect(f.map((x) => [x.computer.id, x.read, x.why])).toEqual([['c1', false, 'stopped'], ['c2', false, 'starting'], ['c3', false, 'attention'], ['c4', true, undefined]]);
  });

  it(`at most ${ALL_MAX} running computers are read at once; the rest say so`, () => {
    const many = Array.from({ length: ALL_MAX + 2 }, (_, i) => pc(`c${i}`));
    const f = followedComputers([pc('off', { status: 'stopped' }), ...many], null);
    expect(f.filter((x) => x.read)).toHaveLength(ALL_MAX);
    expect(f.filter((x) => x.why === 'cap').map((x) => x.computer.id)).toEqual([`c${ALL_MAX}`, `c${ALL_MAX + 1}`]);
    // A stopped computer never takes a place.
    expect(f.find((x) => x.computer.id === 'off')).toMatchObject({ read: false, why: 'stopped' });
  });
});

describe('the computer list itself (core useComputersAll)', () => {
  const l = (o: Partial<Parameters<typeof listGap>[0]> = {}) => listGap({ complete: true, unproven: false, more: false, capped: false, failed: false, ...o });

  it('only a whole list read in one page proves which computers exist; anything else is a gap with its reason', () => {
    expect(l()).toBeNull();
    // A failed refresh keeps the rows shown before: they do not prove the computers of now.
    expect(l({ failed: true })).toBe('failed');
    expect(l({ failed: true, complete: false })).toBe('failed');
    expect(l({ complete: false, more: true })).toBe('reading');
    expect(l({ complete: false, capped: true })).toBe('capped');
    expect(l({ complete: false, unproven: true })).toBe('unproven');
    expect(l({ complete: false })).toBe('unproven');
  });
});

describe('change-feed frames (GET /changes/stream)', () => {
  const snap = (scope: string, tokens: Record<string, string>) => JSON.stringify({ scope, tokens });

  it('snapshot replaces the tokens; changed moves one topic; a null token drops it', () => {
    const a = applyFrame(null, 'snapshot', snap('s1', { sessions: 't1', gates: 'g1' }));
    expect(a).toEqual({ scope: 's1', tokens: { sessions: 't1', gates: 'g1' } });
    const b = applyFrame(a, 'changed', JSON.stringify({ topic: 'sessions', token: 't2' }));
    expect(b).toEqual({ scope: 's1', tokens: { sessions: 't2', gates: 'g1' } });
    expect(applyFrame(b, 'changed', JSON.stringify({ topic: 'gates', token: null }))).toEqual({ scope: 's1', tokens: { sessions: 't2' } });
    expect(applyFrame(b, 'snapshot', snap('s2', { sessions: 't9' }))).toEqual({ scope: 's2', tokens: { sessions: 't9' } });
  });

  it('a changed frame before any snapshot, an unreadable frame, end and other events change nothing', () => {
    expect(applyFrame(null, 'changed', JSON.stringify({ topic: 'sessions', token: 't2' }))).toBeNull();
    const a = applyFrame(null, 'snapshot', snap('s1', { sessions: 't1' }));
    expect(applyFrame(a, 'changed', '{nope')).toBe(a);
    expect(applyFrame(a, 'changed', JSON.stringify({ token: 'x' }))).toBe(a);
    expect(applyFrame(a, 'end', JSON.stringify({ reason: 'x' }))).toBe(a);
    expect(applyFrame(a, 'message', 'x')).toBe(a);
    expect(applyFrame(null, 'snapshot', '[]')).toBeNull();
  });
});

describe('one list of every followed computer', () => {
  const row = (sid: string, o: Partial<ChatRow> = {}): ChatRow => ({ key: `global/${sid}`, sid, realm: 'global', title: sid, cwd: '/', at: 1, claude: false, group: 'today', mark: null, rowState: true, ...o });

  it('each row keeps its chat and names its computer: the key carries the computer, so equal sids never collide', () => {
    const [c1, c2] = followedComputers([pc('c1'), pc('c2')], null);
    const out = mergeRows([{ f: c1!, rows: [row('a'), row('b', { mark: 'needs' })] }, { f: c2!, rows: [row('a')] }]);
    expect(out.map((r) => [r.key, r.computer, r.handle, r.sid])).toEqual([
      ['c1|global/a', 'c1', 'C1.c1', 'a'],
      ['c1|global/b', 'c1', 'C1.c1', 'b'],
      ['c2|global/a', 'c2', 'C2.c2', 'a'],
    ]);
    expect(out[1]!.mark).toBe('needs');
  });
});

