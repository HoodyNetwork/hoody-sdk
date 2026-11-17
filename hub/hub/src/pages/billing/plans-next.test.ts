// Plans: the facts behind each column's "Next" hint and the Bare metal band (plans-next.ts).
import { describe, expect, it } from 'vitest';
import type { PlanCard } from './logic';
import { bareFacts, nextHint } from './plans-next';
import { listings } from './servers/fixtures';
import type { Listing } from './servers/logic';
import strings from './strings.en.json';

// `ram` is the row's text; `gb` the catalogue number behind it (planRows sets both), the text's own number by default.
const col = (title: string, priceCents: number | null, ram: string | null, computers: number | null, gb: number = ram === null ? 0 : parseFloat(ram)): PlanCard => ({
  id: title.toLowerCase(),
  family: title.toLowerCase(),
  title,
  label: '',
  tier: null,
  mult: null,
  priceCents,
  computers,
  desc: '',
  features: [],
  holdDays: null,
  rows: ram === null ? [] : [{ id: 'ram', label: 'buy.resRam', value: ram, gb }],
});
const plus = col('Plus', 1000, '6 GB', 12);
const pro = col('Pro', 2500, '16 GB', 30);

describe('nextHint', () => {
  it('the words agree with the nearer count: one computer gets tight, more get tight', () => {
    expect(strings['plans.nextWhen_one']).toBe('When {{ram}} of memory or {{count}} computer gets tight.');
    expect(strings['plans.nextWhen_other']).toBe('When {{ram}} of memory or {{count}} computers get tight.');
  });
  it('Free points to the first plan with the free server\'s computers, never a memory', () => {
    expect(nextHint([plus, pro], 0, 3, true)).toEqual({ kind: 'plan', plan: 'Plus', ram: null, computers: 3 });
    expect(nextHint([plus, pro], 0, null, true)).toEqual({ kind: 'plan', plan: 'Plus', ram: null, computers: null });
    expect(nextHint([plus, pro], 0, 0, true)).toEqual({ kind: 'plan', plan: 'Plus', ram: null, computers: null });
  });
  it('a plan points to the next column with its own memory and computers', () => {
    expect(nextHint([plus, pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: '6 GB', computers: 12 });
    expect(nextHint([col('Plus', 1000, null, null), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: null, computers: null });
    // A count of 0 is not a count to grow out of: no "or 0 computers".
    expect(nextHint([col('Plus', 1000, '6 GB', 0), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: '6 GB', computers: null });
    // No memory either: 0 GB is "Not included" in the comparison; 0.5 GB is a size.
    expect(nextHint([col('Plus', 1000, '0 GB', 12), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: null, computers: 12 });
    expect(nextHint([col('Plus', 1000, '0 GB', 0), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: null, computers: null });
    expect(nextHint([col('Plus', 1000, '0.5 GB', 12), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: '0.5 GB', computers: 12 });
    // The number decides, not the words: a 0 shown in other words is still none, and a
    // real size whose words start with 0 is still a size.
    expect(nextHint([col('Plus', 1000, 'none', 12, 0), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: null, computers: 12 });
    expect(nextHint([col('Plus', 1000, '0 TB', 12, 512), pro], 1, 3, true)).toEqual({ kind: 'plan', plan: 'Pro', ram: '0 TB', computers: 12 });
  });
  it('the last plan points to bare metal only when the band is drawn', () => {
    expect(nextHint([plus, pro], 2, 3, true)).toEqual({ kind: 'bare' });
    expect(nextHint([plus, pro], 2, 3, false)).toBeNull();
    expect(nextHint([], 0, 3, true)).toEqual({ kind: 'bare' });
    expect(nextHint([], 0, 3, false)).toBeNull();
  });
  it('a next column that is not a step up in price, or has no price or name, says nothing', () => {
    expect(nextHint([pro, plus], 1, 3, true)).toBeNull();
    expect(nextHint([plus, col('Twin', 1000, '6 GB', 12)], 1, 3, true)).toBeNull();
    expect(nextHint([col('Plus', null, '6 GB', 12), pro], 1, 3, true)).toBeNull();
    expect(nextHint([plus, col('', 2500, '16 GB', 30)], 1, 3, true)).toBeNull();
    expect(nextHint([plus, pro], 3, 3, true)).toBeNull();
    expect(nextHint([plus, pro], -1, 3, true)).toBeNull();
  });
});

describe('bareFacts', () => {
  const term = (days: number, priceCents: number | null) => ({ days, priceCents, feeCents: null, totalCents: priceCents ?? 0, holdDays: null });
  const l = (over: Partial<Listing>): Listing => ({ ...(listings[0] as Listing), ...over });
  it('ranges, countries and the cheapest 30-day rental over the machines rentable for 30 days', () => {
    const read = {
      listings: [
        l({ cores: 4, ramGb: 32, diskGb: 500, bandwidthMbps: 1000, country: 'DE', terms: [term(30, 2900)] }),
        l({ cores: 32, ramGb: 512, diskGb: 20000, bandwidthMbps: 10000, country: 'SG', terms: [term(30, 9900), term(90, 25000)] }),
        l({ cores: 8, ramGb: 64, diskGb: 1000, bandwidthMbps: null, country: 'DE', terms: [term(30, 4900)] }),
        // Not rentable for 30 days at a price: none of its facts count.
        l({ cores: 128, ramGb: 2048, diskGb: 90000, bandwidthMbps: 40000, country: 'US', terms: [term(90, 1000)] }),
        l({ cores: 1, ramGb: 1, diskGb: 1, bandwidthMbps: 100, country: 'FR', terms: [term(30, null)] }),
      ],
      failed: [],
    };
    expect(bareFacts(read)).toEqual({ fromCents: 2900, cores: [4, 32], ramGb: [32, 512], diskGb: [500, 20000], netMbps: [1000, 10000], countries: 2 });
  });
  it('a fact no machine lists is left out; a country no machine names counts none', () => {
    const read = { listings: [l({ cores: null, ramGb: null, diskGb: 0, bandwidthMbps: null, country: '', terms: [term(30, 2900)] })], failed: [] };
    expect(bareFacts(read)).toEqual({ fromCents: 2900, cores: null, ramGb: null, diskGb: null, netMbps: null, countries: 0 });
  });
  it('no whole read, or no machine rentable for 30 days: nothing', () => {
    expect(bareFacts(undefined)).toBeNull();
    expect(bareFacts({ listings: [l({ terms: [term(30, 2900)] })], failed: ['offers'] })).toBeNull();
    expect(bareFacts({ listings: [l({ terms: [term(90, 2900)] })], failed: [] })).toBeNull();
    expect(bareFacts({ listings: [], failed: [] })).toBeNull();
  });
  it('the fixture market: some machine is rentable for 30 days', () => {
    expect(bareFacts({ listings, failed: [] })?.fromCents).toBeGreaterThan(0);
  });
});
