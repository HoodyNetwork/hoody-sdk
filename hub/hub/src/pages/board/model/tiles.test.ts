import { describe, expect, it } from 'vitest';
import { addTile, applyPreset, isRefusal, newBoard, type Board, type TileRef } from './boards';
import { boardStates, frameSlots, slotState } from './tiles';
import { slots } from './tree';

const t = (computer: string, project = 'p1'): TileRef => ({ project, computer, program: 'terminal', session: 1 });
const rows = [
  { id: 'c1', project_id: 'p1', status: 'running' },
  { id: 'c2', project_id: 'p1', status: 'stopped' },
  { id: 'c3', project_id: 'p1', status: 'paused' },
  { id: 'c4', project_id: 'p1', status: 'starting' },
  { id: 'c5', project_id: 'p1', status: 'failed' },
];

describe('slot states', () => {
  it('maps the computer status to what the slot shows', () => {
    expect(slotState(null, rows)).toBe('empty');
    expect(slotState(t('c1'), null)).toBe('loading');
    expect(slotState(t('c1'), rows)).toBe('live');
    expect(slotState(t('c2'), rows)).toBe('stopped');
    expect(slotState(t('c3'), rows)).toBe('stopped');
    expect(slotState(t('c4'), rows)).toBe('starting');
    expect(slotState(t('c5'), rows)).toBe('attention');
  });
  it('a computer missing from the realm\'s list, or under another project, is gone', () => {
    expect(slotState(t('c9'), rows)).toBe('gone');
    expect(slotState(t('c1', 'p2'), rows)).toBe('gone');
  });
  it('a listed computer without a project never matches a tile', () => {
    expect(slotState(t('c1'), [{ id: 'c1', status: 'running' }])).toBe('gone');
  });
  it('only live tiles get frames', () => {
    let b: Board = newBoard(() => 0.5);
    const r = (() => { let i = 0; return () => (i++ % 97) / 97; })();
    const g = applyPreset(b, 'grid', r);
    if (isRefusal(g)) throw new Error('refused');
    b = g;
    for (const c of ['c1', 'c2', 'c9']) { const a = addTile(b, t(c), r); if (isRefusal(a)) throw new Error('refused'); b = a.board; }
    const ids = slots(b.layout);
    expect(Object.values(boardStates(b, rows))).toEqual(['live', 'stopped', 'gone', 'empty']);
    expect(frameSlots(b, rows)).toEqual([ids[0]]);
    expect(frameSlots(b, null)).toEqual([]);
  });
});
