// The Board's placement table (embed/placement.ts) and the panels drawn here
// (model.ts placementOf) must name the same ids in the same sections and order: a panel cannot draw an
// option the table puts elsewhere, and the table cannot claim a place no panel has.
import { describe, expect, it } from 'vitest';
import type { TileProgram } from '../embed/catalog';
import { PLACEMENT } from '../embed/placement';
import { placementOf } from './model';

const PROGRAMS = Object.keys(PLACEMENT) as TileProgram[];

describe('PLACEMENT matches the panels', () => {
  it('covers the same programs', () => {
    expect([...PROGRAMS].sort()).toEqual(['agent', 'browser', 'code', 'display', 'files', 'notes', 'sqlite', 'terminal']);
  });

  for (const program of PROGRAMS) {
    it(`${program}: same sections in the same order, same Advanced, nothing pending`, () => {
      const drawn = placementOf(program);
      const table = PLACEMENT[program];
      expect(Object.keys(table.sections)).toEqual(Object.keys(drawn.sections));
      expect(table.sections).toEqual(drawn.sections);
      expect(table.advanced).toEqual(drawn.advanced);
      expect(table.pendingDesign).toEqual([]);
    });
  }
});
