// computer.test.ts: the computer handle shared by Home, Guide, Bots and Computers.
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from './ctx';
import { chooseComputer, chooseNoComputer, computerHandle, pickComputer, rememberedComputerId } from './index';
import { boot } from './test/env';

describe('computerHandle', () => {
  it('is the name and the last four characters of the id, never the full id', () => {
    const id = '0123456789abcdef01234567';
    expect(computerHandle({ id, name: 'web' })).toBe('web.4567');
    expect(computerHandle({ id, name: 'web' })).not.toContain(id);
    expect(computerHandle({ id: 'ab', name: 'x' })).toBe('x.ab');
  });
});

describe('chooseNoComputer: the person chose none', () => {
  const rows = [{ id: 'c-run', project_id: 'p1', status: 'running' }, { id: 'c-start', project_id: 'p1', status: 'starting' }];
  beforeEach(() => { boot(); });
  it('clears the target, and no list answer picks a computer until one is chosen again', () => {
    expect(chooseComputer(rows[0]!)).toBe(true);
    expect(snapshot().target?.container.id).toBe('c-run');
    expect(chooseNoComputer()).toBe(true);
    expect(snapshot().target).toBe(null);
    expect(pickComputer(rows)).toBe(null);
    expect(rememberedComputerId()).toBe(null); // the choice is no computer, never an id named '*'
    expect(chooseComputer(rows[1]!)).toBe(true);
    expect(pickComputer(rows)?.id).toBe('c-start');
    expect(rememberedComputerId()).toBe('c-start');
  });
  it('without a choice the pick rule is unchanged (the first running computer)', () => {
    expect(pickComputer(rows)?.id).toBe('c-run');
    expect(pickComputer(rows, { remembered: '*' })).toBe(null);
    expect(pickComputer(rows, { remembered: null })?.id).toBe('c-run');
  });
});
