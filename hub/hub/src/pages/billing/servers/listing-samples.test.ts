// The facts samples core shares with Billing's fixtures are exactly what the Market's own fixture rows say.
import { SAMPLE_FACTS } from '@core';
import { describe, expect, it } from 'vitest';
import { listings } from './fixtures';
import { factsOf } from './logic';

describe('core SAMPLE_FACTS are the Market fixture rows', () => {
  it('has one entry per Market listing, equal to its facts input', () => {
    expect(Object.keys(SAMPLE_FACTS).sort()).toEqual(listings.map((l) => `${l.kind}:${l.id}`).sort());
    for (const l of listings) expect(SAMPLE_FACTS[`${l.kind}:${l.id}`], `${l.kind}:${l.id}`).toEqual(factsOf(l));
  });
});
