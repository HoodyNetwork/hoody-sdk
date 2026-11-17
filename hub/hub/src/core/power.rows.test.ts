import { describe, expect, it } from 'vitest';
import { lifecycleProves, lifecycleVerdict, type ComputerWire } from './power';

const id = 'aaaaaaaaaaaaaaaaaaaa0001';
const bad = [null, 'x', 7, ['a'], {}, { id: 123 }] as unknown as ComputerWire[];

describe('lifecycleVerdict over rows that are not computers', () => {
  it('skips them and still reads the computer row', () => {
    expect(lifecycleVerdict({ computer: id, op: 'start' }, [...bad, { id, status: 'running' }])).toBe('applied');
    expect(lifecycleVerdict({ computer: id, op: 'stop' }, [...bad, { id, status: 'running' }])).toBeUndefined();
  });

  it('a list of only bad rows proves nothing', () => {
    expect(lifecycleVerdict({ computer: id, op: 'start' }, bad)).toBeUndefined();
  });

  it('lifecycleProves over an answer page holding a null row', () => {
    expect(lifecycleProves({ computer: id, op: 'pause' }, [[[null, { id, status: 'paused' }]]])).toBe('applied');
  });
});
