// The working row's words in the terminal are the web's: what the turn waits on when that is known, else the phase's line.
import { expect, test } from 'bun:test';
import { workWord } from './SessionView';

test('a working turn names compacting, then its step, then the reply being written, then thinking', () => {
  const step = { verb: 'Reading', summary: 'notes.md' };
  expect(workWord({ k: 'working' })).toBe('sv.work.working');
  expect(workWord({ k: 'working', doing: 'thinking' })).toBe('sv.work.thinking');
  expect(workWord({ k: 'working', writing: true, doing: 'thinking' })).toBe('sv.work.writing');
  expect(workWord({ k: 'working', step, writing: true })).toBe('sv.work.step');
  expect(workWord({ k: 'working', step, doing: 'compacting' })).toBe('sv.work.compacting');
});

test('every other phase has its own line', () => {
  expect((['sending', 'waiting', 'stopping', 'reconnecting', 'catching_up', 'lost'] as const).map((k) => workWord({ k }))).toEqual([
    'sv.work.sending', 'sv.work.waiting', 'sv.work.stopping', 'sv.work.reconnecting', 'sv.work.catchingUp', 'sv.work.lost',
  ]);
});
