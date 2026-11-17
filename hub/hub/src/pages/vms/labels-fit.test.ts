// A fact label wider than the facts' label column wraps to a second row in a terminal (the kit's label cap, 22 cells).
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const LABEL_CAP = 22;

describe('fact labels fit their column', () => {
  it.each(['host.fits', 'vm.fact.autostart'] as const)('%s is one row', (key) => {
    expect([...strings[key]].length).toBeLessThanOrEqual(LABEL_CAP);
  });
});
