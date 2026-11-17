import { describe, expect, it } from 'vitest';
import { runningTargets } from './bots';

const good = { id: 'c1', project_id: 'p1', server_name: 's1', status: 'running' };

describe('runningTargets', () => {
  it('skips rows that are not computers and keeps the running one', () => {
    const rows: unknown[] = [{}, null, { id: '' }, { id: 123 }, 'c1', ['c1'], undefined, 7, good];
    expect(runningTargets(rows)).toEqual([{ project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } }]);
  });

  it('answers no targets for a list of only bad rows or no list', () => {
    expect(runningTargets([null, 'x', 0])).toEqual([]);
    expect(runningTargets(undefined)).toEqual([]);
  });
});
