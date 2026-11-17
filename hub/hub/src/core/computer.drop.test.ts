// dropComputer: a target the selected realm's
// list does not hold is dropped, not forgotten. It clears the core target without remembering "no computer", so a
// later list answer picks again, and going back to the computer's realm picks the remembered one, provided no choice
// in between replaced it (one remembered id per account, not one per realm).
import { beforeEach, describe, expect, it } from 'vitest';
import { gen, snapshot } from './ctx';
import { chooseComputer, dropComputer, pickComputer, rememberedComputerId } from './index';
import { boot } from './test/env';

const rows = [{ id: 'c-a', project_id: 'p1', status: 'running' }, { id: 'c-b', project_id: 'p1', status: 'running' }];

describe('dropComputer', () => {
  beforeEach(() => { boot(); });
  it('clears the target and keeps the remembered id: a list that holds it picks it again', () => {
    expect(chooseComputer(rows[1]!)).toBe(true);
    const g = gen();
    dropComputer();
    expect(snapshot().target).toBe(null);
    expect(rememberedComputerId()).toBe('c-b');
    expect(gen()).toBe(g); // no bump
    expect(pickComputer(rows)?.id).toBe('c-b');
  });
  it('a list without the remembered computer still picks one (unlike chooseNoComputer)', () => {
    expect(chooseComputer(rows[1]!)).toBe(true);
    dropComputer();
    expect(pickComputer([rows[0]!])?.id).toBe('c-a');
  });
  it('with no target it keeps the target, the remembered id and the generation as they are', () => {
    boot({ target: null });
    expect(chooseComputer(rows[1]!)).toBe(true);
    dropComputer();
    const g = gen();
    dropComputer();
    expect(snapshot().target).toBe(null);
    expect(rememberedComputerId()).toBe('c-b');
    expect(gen()).toBe(g);
  });
});
