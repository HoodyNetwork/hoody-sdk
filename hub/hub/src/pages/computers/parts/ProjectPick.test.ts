// The copy destination rule (ProjectPick): only a project the shown realm lists, never a guess while the list is
// unread or being read again; and which refusal is the realm's.
import { describe, expect, it } from 'vitest';
import { realmProject, realmRefused } from './ProjectPick';

const A = { id: 'a', name: 'A' };
const B = { id: 'b', name: 'B' };

describe('realmProject', () => {
  it('keeps a wanted project the list holds; otherwise a pick is owed', () => {
    expect(realmProject([A, B], undefined, false, 'b', 'r1', 'b')).toEqual({ listed: [A, B], dest: 'b', state: 'ok', outside: false });
    // The source's own project is not in the shown realm: the pick is owed because it is outside.
    expect(realmProject([A], undefined, false, 'z', 'r1', 'z')).toEqual({ listed: [A], dest: '', state: 'pick', outside: true });
    // A picked project the list lost owes a pick too, but not because the source is outside.
    expect(realmProject([A], undefined, false, 'y', 'r1', 'z')).toEqual({ listed: [A], dest: '', state: 'pick', outside: false });
  });
  it('in All realms the source\'s own project stays, listed or not (no realm rule applies), and stays offered', () => {
    expect(realmProject([A], undefined, false, 'z', 'all', 'z')).toEqual({ listed: [A], dest: 'z', state: 'ok', own: 'z' });
    expect(realmProject(undefined, undefined, true, 'z', 'all', 'z')).toEqual({ listed: [], dest: 'z', state: 'ok', own: 'z' });
    // Another project picked: the source's own stays an option (own), so the person can go back to it.
    expect(realmProject([A], undefined, false, 'a', 'all', 'z')).toEqual({ listed: [A], dest: 'a', state: 'ok', own: 'z' });
    // A listed source needs no extra option.
    expect(realmProject([A], undefined, false, 'a', 'all', 'a')).toEqual({ listed: [A], dest: 'a', state: 'ok', own: undefined });
    expect(realmProject([A], undefined, false, '', 'all', 'z').state).toBe('pick');
  });
  it('in All realms a picked project the list no longer holds (or while it is read again) is never sent: a pick is owed', () => {
    expect(realmProject([A], undefined, false, 'b', 'all', 'z')).toEqual({ listed: [A], dest: '', state: 'pick', own: 'z' });
    expect(realmProject([A, B], undefined, true, 'b', 'all', 'z')).toMatchObject({ dest: '', state: 'loading' });
    expect(realmProject([A, B], new Error('x'), false, 'b', 'all', 'z')).toMatchObject({ dest: '', state: 'unread' });
    // Only the source's own project left to offer: still a pick, never "no project".
    expect(realmProject([], undefined, false, 'b', 'all', 'z')).toEqual({ listed: [], dest: '', state: 'pick', own: 'z' });
  });
  it('an empty list is none; unread, unanswered or being read again is never ok', () => {
    expect(realmProject([], undefined, false, 'a', 'r1', 'a').state).toBe('none');
    expect(realmProject([A], new Error('x'), false, 'a', 'r1', 'a').state).toBe('unread');
    expect(realmProject(undefined, undefined, false, 'a', 'r1', 'a').state).toBe('loading');
    expect(realmProject([A], undefined, true, 'a', 'r1', 'a').state).toBe('loading');
  });
});

describe('realmRefused', () => {
  it('only a failed INSUFFICIENT_PERMISSIONS while one realm is shown', () => {
    expect(realmRefused({ kind: 'failed', code: 'INSUFFICIENT_PERMISSIONS' }, 'r1')).toBe(true);
    expect(realmRefused({ kind: 'failed', code: 'INSUFFICIENT_PERMISSIONS' }, 'all')).toBe(false);
    expect(realmRefused({ kind: 'pending', code: 'INSUFFICIENT_PERMISSIONS' }, 'r1')).toBe(false);
    expect(realmRefused({ kind: 'failed', code: 'COMPUTER_NAME_IN_USE' }, 'r1')).toBe(false);
    expect(realmRefused(undefined, 'r1')).toBe(false);
  });
});
