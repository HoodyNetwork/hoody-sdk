// Vitest: what one followed computer's group says about the
// chats it may be missing, judged per computer by coverage.logic's one judge. Not read (stopped, starting, needs
// attention, past the cap), its feed refused, its own read not proven whole, or still reading (the group waits out the
// grace before it says so: never a flash); nothing when it is whole. Gaps that name no computer (the computer list) stay the list's own.
import { describe, expect, it } from 'vitest';
import { computerGap, followedComputers, type AllComputer } from './allChats.logic';
import type { Source } from './coverage.logic';

const pc = (id: string, status = 'running'): AllComputer => ({ id, name: id, project: 'p1', server: 'sg-1', status });
const f = (status = 'running') => followedComputers([pc('c1', status)], 'c1')[0]!;
const src = (state: Source['state']): Source[] => [{ kind: 'sessions', computer: 'c1', state } as Source];

describe('a followed computer\'s own gap', () => {
  it('not read: says why (stopped, starting, needs attention), at once', () => {
    expect(computerGap(f('stopped'), undefined)).toEqual({ kind: 'notRead', why: 'stopped' });
    expect(computerGap(f('creating'), undefined)).toEqual({ kind: 'notRead', why: 'starting' });
    expect(computerGap(f('failed'), undefined)).toEqual({ kind: 'notRead', why: 'attention' });
  });

  it('past the cap: not read, cap', () => {
    const many = followedComputers(Array.from({ length: 10 }, (_, i) => pc(`c${i}`)), 'c0', 8);
    expect(computerGap(many[9]!, undefined)).toEqual({ kind: 'notRead', why: 'cap' });
  });

  it('its feed refused: refused, whatever its read had', () => {
    expect(computerGap(f(), { refused: true })).toEqual({ kind: 'refused' });
  });

  it('read and not proven whole: partial; whole: nothing', () => {
    expect(computerGap(f(), { refused: false, sources: src('more') })).toEqual({ kind: 'partial' });
    expect(computerGap(f(), { refused: false, sources: src('failed') })).toEqual({ kind: 'partial' });
    expect(computerGap(f(), { refused: false, sources: src('complete') })).toBeNull();
  });

  it('a read still out is reading (its group says so only after the grace), and no answer yet is reading too', () => {
    expect(computerGap(f(), { refused: false, sources: src('pending') })).toEqual({ kind: 'reading' });
    expect(computerGap(f(), undefined)).toEqual({ kind: 'reading' });
  });
});
