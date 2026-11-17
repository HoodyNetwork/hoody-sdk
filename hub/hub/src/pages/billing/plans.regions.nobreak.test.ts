// Vitest: the Compare table's Locations line never breaks inside a flag and its name, and breaks only after a separator,
// so no line starts with a bare name or a "·".
import { describe, expect, it } from 'vitest';
import { regionsLine } from './parts/PlansCompare';
import type { PlanRegion } from './plans-regions';

const R = (id: string, country: string, name: string): PlanRegion => ({ id, country, name });

describe('regionsLine', () => {
  const line = regionsLine([R('sg', 'SG', 'Singapore'), R('ny', 'US', 'New York, United States'), R('de', 'DE', 'Frankfurt, Germany')]);
  it('keeps every location whole, separators between them', () => {
    expect(line.replace(/\u00a0/g, ' ')).toMatch(/Singapore · .+New York, United States · .+Frankfurt, Germany$/);
  });
  it('has an ordinary space only right after a separator: a line breaks only there', () => {
    const spaces = [...line.matchAll(/ /g)].map((m) => m.index ?? -1);
    expect(spaces.length).toBe(2);
    for (const i of spaces) expect(line[i - 1]).toBe('·');
  });
  it('a location with no country code has no flag and no stray space', () => {
    expect(regionsLine([R('x', '', 'Somewhere')])).toBe('Somewhere');
  });
});

describe('a plan whose locations cannot be read', () => {
  it('a failed read is "not readable right now"; one the Hub refused itself (an access key without the right) says that, and never points at the checkout', async () => {
    const { planRegions } = await import('./plans-regions');
    const strings = (await import('./strings.en.json')).default as Record<string, string>;
    const failed = { isPending: false, isError: true, data: undefined };
    expect(planRegions(failed)).toEqual({ state: 'unknown' });
    expect(planRegions(failed, true)).toEqual({ state: 'refused' });
    // Refused is about a failed read only: a list that was read is the list.
    expect(planRegions({ isPending: false, isError: false, data: [] }, true)).toEqual({ state: 'list', regions: [] });
    expect(strings['plans.regionsRefused']).not.toMatch(/checkout/i);
  });
});
