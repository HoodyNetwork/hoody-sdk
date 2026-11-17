// commerce-pure.ts: the money rules: the Market's pure functions, their behaviour cases and the pure cases of the
// buy panel and the subscription list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advisoryMatch, applyFilters, buy, canonicalDayKey, cardView, classifyError, claimPending, claimShown, defaultFilters,
  definitive, denyRowTiers, dropPending, errData, failedOutcome, findPlan, hostLabel, infoFor, isAccountBannedError,
  isAmbiguous, lang, lruPollPick, market, normRuleMap, normalizeAmount, normalizeOfferRow, normalizeStockRow,
  parseIntent, parsePending, parseResume, planIndex, pmCanClose, postEventFor, purchaseTransition, quoteFor,
  readAvailableDays, readIntent, readPendingAll, readResumeMarker, returnProviderPrefix, setLang, setTranslator,
  sortSubs, stateView, subs, tierValidity, validEnvelope, validPlan, validResumeMarker, validSub, wallet,
  writeResumeMarker, clearResumeMarker, hasResume, fmtUtcDate, dropIntent, withPendingLock, findPending,
  pendingBody, writePendingAll, PENDING_KEY, INTENT_KEY, INTENT_TTL_MS, MONEY_DEFINITIVE, PM_TERMINALS,
  RENTAL_DAYS_MAX, REFETCH_AFTER, RETURN_POLL_MAX, RETURN_POLL_MS, CARD_HOST_RE, CRYPTO_HOST_RE,
  type MarketRow, type Maps, type PendingEntry,
} from './commerce-pure';

const fmtCents = market.fmtCents;
const centsFromUsdString = market.centsFromUsdString;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setLang(null);
  setTranslator(null);
  delete (globalThis as { _hoodyInitialLang?: unknown })._hoodyInitialLang;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A stand-in Storage for the named global (happy-dom's own methods are not reachable through the prototype).
function stubStorage(name: 'localStorage' | 'sessionStorage', over: Partial<Storage>) {
  vi.stubGlobal(name, { getItem: () => null, setItem: () => {}, removeItem: () => {}, ...over });
}

// ── row fixtures (the real wire shapes) ──
function stockRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'rack-us-1', country: 'US', region: 'us-east', city: 'New York',
    datacenter: 'NYC-DC1', model: 'Intel Xeon E5-2680 v4', is_vm: false, category: 'compute',
    featured: false, popularity_rank: 1, setup_time_minutes: 15, delivery_hours: 0,
    pricing: {
      prices: { '1': '12.00' }, setup_fee: '25.00', setup_fee_cents: 2500,
      price_tiers: { '1': { price: '12.00', hold_days: 1, total_first_payment: '37.00' } },
    },
    specs: {
      cpu: { model: 'Xeon E5', cores: 8 }, ram: { capacity_gb: 32 },
      disks: { total_gb: 500 }, network: {}, additional: { ipv4_count: 1 },
    },
    ...over,
  };
}
function offerRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1', name: 'epyc-fra-1', country: 'DE', region: 'eu-central', city: 'Frankfurt',
    datacenter: 'FRA-DC2', cpu_model: 'AMD EPYC 7763', cpu_cores: 64, cpu_threads: 128,
    ram_gb: 256, disks: [{ count: 2, capacity_gb: 1000, type: 'NVMe' }],
    bandwidth_mbps: 10000, traffic_tb: 100, traffic_unlimited: false, ipv4_count: 5,
    pricing_rules: { '7': 7000 }, hold_rules: { '7': 2 }, setup_fee_cents: 2500,
    setup_fee_rules: null, delivery_hours: 48, setup_time_minutes: 30, stock: 3,
    ...over,
  };
}
const typedErr = (status: number, code: string | null, details?: unknown) => ({
  status, code, message: 'err', data: { statusCode: status, error: code, message: 'err', data: details ?? {} },
});
const BANNED_ERR = { status: 403, code: 'ACCOUNT_BANNED', message: 'Your account is banned.' };
const FAM = 'a'.repeat(24);

describe('market: isAccountBannedError (strict)', () => {
  const cases: Array<[unknown, boolean, string]> = [
    [BANNED_ERR, true, 'the exact thrown pair'],
    [{ status: 403, code: 'FORBIDDEN' }, false, '403 with another code'],
    [{ status: 401, code: 'ACCOUNT_BANNED' }, false, 'right code, wrong status'],
    [{ status: '403', code: 'ACCOUNT_BANNED' }, false, 'string status must not coerce'],
    [{ status: 403 }, false, 'code missing'],
    [{ status: 0, code: 'TIMEOUT' }, false, 'transport-ambiguous'],
    [null, false, 'null'],
    [undefined, false, 'undefined'],
  ];
  for (const [err, want, why] of cases) {
    it(`${want} (${why})`, () => { expect(isAccountBannedError(err)).toBe(want); });
  }
});

describe('market: normRuleMap', () => {
  it('null and undefined are null', () => {
    expect(normRuleMap(null)).toBe(null);
    expect(normRuleMap(undefined)).toBe(null);
  });
  it('{} passes through by identity (empty is a real, readable map)', () => {
    const empty = {};
    expect(normRuleMap(empty)).toBe(empty);
  });
  it('an array, a string and a number are not rule maps', () => {
    expect(normRuleMap([1, 2])).toBe(null);
    expect(normRuleMap('{"7":1}')).toBe(null);
    expect(normRuleMap(42)).toBe(null);
  });
  it('a valid map passes through by identity', () => {
    const m = { '7': 7000 };
    expect(normRuleMap(m)).toBe(m);
  });
  it('an offer with hold_rules:null normalizes without throwing and is unbuyable', () => {
    const row = normalizeOfferRow(offerRow({ hold_rules: null }), 0);
    expect(row.buyable).toBe(false);
    expect(row.days).toEqual([]);
    expect(row.fromCents).toBe(null);
  });
});

describe('market: centsFromUsdString (bounded)', () => {
  const accepts: Array<[string, number]> = [
    ['37.00', 3700], ['0.05', 5], ['0.00', 0], ['12.34', 1234],
    ['1234567890123.99', 123456789012399], // 13 integer digits: the inclusive bound
  ];
  for (const [input, want] of accepts) {
    it(`accepts "${input}" as ${want}`, () => { expect(centsFromUsdString(input)).toBe(want); });
  }
  const rejects: Array<[unknown, string]> = [
    ['5.5', 'one fractional digit'], ['5.005', 'three fractional digits'], ['05.00', 'leading zero'],
    ['00.10', 'double leading zero'], ['', 'empty string'], ['.50', 'missing integer part'], ['5', 'missing fraction'],
    ['-5.00', 'negative'], ['+5.00', 'signed'], ['1e3.00', 'exponent'], [' 5.00', 'leading whitespace'],
    ['5.00 ', 'trailing whitespace'], ['12345678901234.00', '14 integer digits'], [3700, 'number input'],
    [null, 'null'], [undefined, 'undefined'],
  ];
  for (const [input, why] of rejects) {
    it(`rejects ${JSON.stringify(input) ?? 'undefined'} (${why})`, () => { expect(centsFromUsdString(input)).toBe(null); });
  }
});

describe('market: fmtCents (integer string math)', () => {
  it('renders 2dp from integer cents', () => {
    expect(fmtCents(3700)).toBe('$37.00');
    expect(fmtCents(5)).toBe('$0.05');
    expect(fmtCents(0)).toBe('$0.00');
    expect(fmtCents(123)).toBe('$1.23');
    expect(fmtCents(999999999999999)).toBe('$9999999999999.99');
  });
  it('off-contract input renders the unknown marker, never a fabricated price', () => {
    expect(fmtCents(-1)).toBe('—');
    expect(fmtCents(1.5)).toBe('—');
    expect(fmtCents(NaN)).toBe('—');
    expect(fmtCents(2 ** 53)).toBe('—');
    expect(fmtCents('3700')).toBe('—');
  });
});

describe('market: canonicalDayKey', () => {
  it('accepts canonical keys 1..3650 only', () => {
    expect(RENTAL_DAYS_MAX).toBe(3650);
    expect(canonicalDayKey('1')).toBe(true);
    expect(canonicalDayKey('3650')).toBe(true);
    for (const bad of ['0', '3651', '07', '7.0', '7 ', '-3', 'x', '', 7, null, undefined]) expect(canonicalDayKey(bad)).toBe(false);
  });
});

describe('market: tierValidity', () => {
  const offerMaps = (over: Partial<Maps> = {}): Maps => ({
    pricing: { '7': 7000 }, hold: { '7': 2 }, fees: null, feeCents: 2500, ...over,
  });

  it('a valid offer tier with the scalar fee fallback is valid', () => {
    expect(tierValidity('offer', '7', offerMaps())).toBe(true);
  });
  it('a non-canonical "07" key is invalid even when the maps carry it', () => {
    expect(tierValidity('offer', '07', offerMaps({ pricing: { '07': 7000 }, hold: { '07': 2 } }))).toBe(false);
  });
  it('the day range: 3651 and 0 and negatives are invalid, 3650 is valid', () => {
    expect(tierValidity('offer', '3651', offerMaps({ pricing: { '3651': 1 }, hold: { '3651': 1 } }))).toBe(false);
    expect(tierValidity('offer', '3650', offerMaps({ pricing: { '3650': 1 }, hold: { '3650': 1 } }))).toBe(true);
    expect(tierValidity('offer', '0', offerMaps({ pricing: { '0': 1 }, hold: { '0': 1 } }))).toBe(false);
    expect(tierValidity('offer', '-3', offerMaps({ pricing: { '-3': 1 }, hold: { '-3': 1 } }))).toBe(false);
  });
  it('non-string and non-canonical key forms are invalid', () => {
    expect(tierValidity('offer', 7, offerMaps())).toBe(false);
    expect(tierValidity('offer', '7.0', offerMaps({ pricing: { '7.0': 1 }, hold: { '7.0': 1 } }))).toBe(false);
    expect(tierValidity('offer', '7 ', offerMaps())).toBe(false);
  });
  it('a negative, fractional or unsafe price is invalid', () => {
    expect(tierValidity('offer', '7', offerMaps({ pricing: { '7': -1 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ pricing: { '7': 12.5 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ pricing: { '7': 2 ** 53 } }))).toBe(false);
  });
  it('price 0 is a legitimate tier (free is a price; unknown is not)', () => {
    expect(tierValidity('offer', '7', offerMaps({ pricing: { '7': 0 }, fees: { '7': 0 } }))).toBe(true);
  });
  it('hold: missing, 0, negative, fractional or null are invalid; 1 is valid', () => {
    expect(tierValidity('offer', '7', offerMaps({ hold: {} }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ hold: { '7': 0 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ hold: { '7': 1 } }))).toBe(true);
    expect(tierValidity('offer', '7', offerMaps({ hold: { '7': -2 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ hold: { '7': 1.5 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ hold: null }))).toBe(false);
  });
  it('fee: a present 0 override wins over the scalar; an invalid override poisons the tier; an absent scalar (NaN) is invalid', () => {
    expect(tierValidity('offer', '7', offerMaps({ fees: { '7': 0 }, feeCents: NaN }))).toBe(true);
    expect(tierValidity('offer', '7', offerMaps({ fees: { '7': -5 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ fees: { '7': 12.5 } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ feeCents: NaN }))).toBe(false);
  });
  it('an unsafe total (price + fee) is invalid even when both parts are safe', () => {
    expect(tierValidity('offer', '7', offerMaps({ pricing: { '7': Number.MAX_SAFE_INTEGER }, fees: { '7': 2 } }))).toBe(false);
  });
  it('stock: the tier is valid when total_first_payment parses; off-contract totals invalidate', () => {
    const tiers = (t: unknown): Maps => ({ tiers: { '1': t } as Record<string, unknown> });
    expect(tierValidity('stock', '1', tiers({ price: '12.00', hold_days: 1, total_first_payment: '37.00' }))).toBe(true);
    expect(tierValidity('stock', '1', tiers({ total_first_payment: '5.5' }))).toBe(false);
    expect(tierValidity('stock', '1', tiers({ total_first_payment: 3700 }))).toBe(false);
    expect(tierValidity('stock', '1', tiers({}))).toBe(false);
    expect(tierValidity('stock', '1', tiers(null))).toBe(false);
    expect(tierValidity('stock', '1', tiers([]))).toBe(false);
    expect(tierValidity('stock', '2', { tiers: { '1': { total_first_payment: '37.00' } } })).toBe(false);
    expect(tierValidity('stock', '1', { tiers: null })).toBe(false);
  });
  it('null or absent maps and an unknown kind are invalid, never a throw', () => {
    expect(tierValidity('offer', '7', null)).toBe(false);
    expect(tierValidity('stock', '1', undefined)).toBe(false);
    expect(tierValidity('other', '1', { tiers: {} })).toBe(false);
  });
  it('the charge path denial outranks the advertisement', () => {
    expect(tierValidity('offer', '7', offerMaps({ denied: { '7': true } }))).toBe(false);
    expect(tierValidity('offer', '7', offerMaps({ denied: { '30': true } }))).toBe(true);
    expect(tierValidity('stock', '1', { tiers: { '1': { total_first_payment: '37.00' } }, denied: { '1': true } })).toBe(false);
  });
});

describe('market: quoteFor', () => {
  it('offer: scalar fee fallback (fee map absent) gives price + scalar', () => {
    const row = normalizeOfferRow(offerRow(), 0);
    expect(quoteFor(row, '7')).toEqual({ priceCents: 7000, feeCents: 2500, totalCents: 9500, holdDays: 2 });
  });
  it('offer: a present 0 override wins over the scalar', () => {
    const row = normalizeOfferRow(offerRow({ setup_fee_rules: { '7': 0 } }), 0);
    expect(quoteFor(row, '7')).toEqual({ priceCents: 7000, feeCents: 0, totalCents: 7000, holdDays: 2 });
  });
  it('stock: the total is read from total_first_payment, never recomputed', () => {
    const row = normalizeStockRow(stockRow(), 0);
    const q = quoteFor(row, '1');
    expect(q).toEqual({ priceCents: 1200, feeCents: null, totalCents: 3700, holdDays: 1 });
  });
  it('stock: a missing or non-finite hold_days is null', () => {
    const row = normalizeStockRow(stockRow({ pricing: { price_tiers: { '1': { price: '12.00', total_first_payment: '37.00' } } } }), 0);
    expect(quoteFor(row, '1')?.holdDays).toBe(null);
  });
  it('an invalid tier or no row is null (never a partial quote)', () => {
    const row = normalizeOfferRow(offerRow({ hold_rules: { '7': 0 } }), 0);
    expect(quoteFor(row, '7')).toBe(null);
    expect(quoteFor(null, '7')).toBe(null);
    expect(quoteFor(undefined, '7')).toBe(null);
  });
});

describe('market: unified row model', () => {
  it('stock row: unified fields, valid days, min total, search text', () => {
    const row = normalizeStockRow(stockRow(), 3);
    expect(row.kind).toBe('stock');
    expect(row.seq).toBe(3);
    expect(row.deliveryHours).toBe(0);
    expect(row.stockLeft).toBe(null);
    expect(row.setupMinutes).toBe(15);
    expect(row.cores).toBe(8);
    expect(row.ramGb).toBe(32);
    expect(row.diskGb).toBe(500);
    expect(row.days).toEqual(['1']);
    expect(row.fromCents).toBe(3700);
    expect(row.fromDays).toBe('1');
    expect(row.buyable).toBe(true);
    expect(row.searchText).toContain('rack-us-1');
    expect(row.searchText).toContain('new york');
  });
  it('stock row: the top-level model wins over specs.cpu.model; the spec surface is value-or-null', () => {
    const row = normalizeStockRow(stockRow(), 0);
    expect(row.model).toBe('Intel Xeon E5-2680 v4');
    expect(normalizeStockRow(stockRow({ model: null }), 0).model).toBe('Xeon E5');
    expect(row.ipv4Count).toBe(1);
    expect(row.threads).toBe(null);
    expect(row.trafficUnlimited).toBe(false);
    const rich = normalizeStockRow(stockRow({
      featured: true,
      specs: {
        cpu: { cores: 8, threads: 16, score: 9000, score_type: 'passmark' }, ram: { capacity_gb: 32, type: 'DDR4', speed_mhz: 3200 },
        disks: { total_gb: 500, summary: '2x NVMe' }, network: { bandwidth_mbps: 1000, bandwidth_formatted: '1 Gbps', traffic_tb: 10, traffic_unlimited: true },
        additional: { ipv4_count: 2 },
      },
    }), 0);
    expect(rich).toMatchObject({
      featured: true, threads: 16, cpuScore: 9000, cpuScoreType: 'passmark', ramType: 'DDR4', ramMhz: 3200,
      diskSummary: '2x NVMe', bandwidthMbps: 1000, bandwidthFmt: '1 Gbps', trafficTb: 10, trafficUnlimited: true, ipv4Count: 2,
    });
  });
  it('stock row: setup_time_minutes null stays null (nullable on the stock rail)', () => {
    expect(normalizeStockRow(stockRow({ setup_time_minutes: null }), 0).setupMinutes).toBe(null);
  });
  it('stock row: pricing null is the defensive unbuyable path', () => {
    const row = normalizeStockRow(stockRow({ pricing: null }), 0);
    expect(row.buyable).toBe(false);
    expect(row.fromCents).toBe(null);
    expect(row.days).toEqual([]);
  });
  it('a non-object raw row normalizes to an empty unbuyable row', () => {
    const row = normalizeStockRow(null, 0);
    expect(row.id).toBe(null);
    expect(row.buyable).toBe(false);
    expect(normalizeOfferRow('junk', 1).buyable).toBe(false);
  });
  it('offer row: unified fields, disks summed count x capacity, finite stock counter', () => {
    const row = normalizeOfferRow(offerRow(), 5);
    expect(row.kind).toBe('offer');
    expect(row.seq).toBe(5);
    expect(row.deliveryHours).toBe(48);
    expect(row.setupMinutes).toBe(30);
    expect(row.cores).toBe(64);
    expect(row.ramGb).toBe(256);
    expect(row.diskGb).toBe(2000);
    expect(row.stockLeft).toBe(3);
    expect(row.featured).toBe(false);
    expect(row.days).toEqual(['7']);
    expect(row.fromCents).toBe(9500);
    expect(row.fromDays).toBe('7');
    expect(row.buyable).toBe(true);
    expect(row.cpuScore).toBe(null);
    expect(row.threads).toBe(128);
  });
  it('offer row: stock null = unlimited, never coerced to 0', () => {
    expect(normalizeOfferRow(offerRow({ stock: null }), 0).stockLeft).toBe(null);
  });
  it('offer row: an off-contract scalar fee is NaN so the tier is invalid, not free', () => {
    const row = normalizeOfferRow(offerRow({ setup_fee_cents: '2500' }), 0);
    expect(Number.isNaN(row.maps.feeCents)).toBe(true);
    expect(row.buyable).toBe(false);
  });
  it('offer row: multi-duration days sort numerically ascending, invalid tiers dropped', () => {
    const row = normalizeOfferRow(offerRow({
      pricing_rules: { '30': 20000, '7': 7000, '365': 90000, '07': 1, '9999': 1 },
      hold_rules: { '30': 2, '7': 2, '365': 3 },
    }), 0);
    expect(row.days).toEqual(['7', '30', '365']);
    expect(row.fromCents).toBe(9500);
    expect(row.fromDays).toBe('7');
  });
  it('offer disks: an unprovable count is NOT "1" — the total is unknown', () => {
    expect(normalizeOfferRow(offerRow({ disks: [{ capacity_gb: 1000, type: 'NVMe' }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 0, capacity_gb: 1000 }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 1.5, capacity_gb: 1000 }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: '2', capacity_gb: 1000 }] }), 0).diskGb).toBe(null);
  });
  it('offer disks: one malformed sibling withholds the whole total', () => {
    const good = { count: 2, capacity_gb: 1000, type: 'NVMe' };
    expect(normalizeOfferRow(offerRow({ disks: [good, { capacity_gb: 500 }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [good, 'junk'] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [good, null] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 1, capacity_gb: 0 }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 1, capacity_gb: '1000' }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [good, { count: 1, capacity_gb: 500 }] }), 0).diskGb).toBe(2500);
  });
  it('offer disks: an overflowed or unsafe sum is no total at all', () => {
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 2, capacity_gb: 1e308 }] }), 0).diskGb).toBe(null);
    expect(normalizeOfferRow(offerRow({ disks: [{ count: 9007199254740991, capacity_gb: 2 }] }), 0).diskGb).toBe(null);
  });
  it('hostile strings pass through normalization unmangled', () => {
    const hostile = '<img src=x onerror="window.__xss=1">‮evil‬' + 'A'.repeat(10240);
    const row = normalizeOfferRow(offerRow({ name: hostile, city: '<script>alert(1)</script>' }), 0);
    expect(row.name).toBe(hostile);
    expect(row.city).toBe('<script>alert(1)</script>');
    expect(row.searchText).toContain('<img src=x');
  });
});

describe('market: applyFilters', () => {
  function fixtureRows(): MarketRow[] {
    return [
      normalizeStockRow(stockRow(), 0), // US, 8 cores, 32GB, $37.00
      normalizeStockRow(stockRow({
        id: 's2', name: 'rack-de-9', country: 'DE', city: 'Frankfurt', featured: true,
        pricing: { price_tiers: { '1': { price: '10.00', hold_days: 1, total_first_payment: '10.00' } } },
        specs: { cpu: { cores: 4 }, ram: { capacity_gb: 16 }, disks: { total_gb: 250 } },
      }), 1), // DE, 4 cores, $10.00
      normalizeOfferRow(offerRow(), 2), // DE, 64 cores, $95.00, delivery 48h
      normalizeOfferRow(offerRow({
        id: 'o2', name: 'ryzen-us-dal-2', country: 'US', city: 'Dallas',
        cpu_model: 'AMD Ryzen 9 7950X', cpu_cores: null, ram_gb: null, disks: null,
        pricing_rules: null, hold_rules: null, delivery_hours: 24,
      }), 3), // US, unknown specs, UNBUYABLE, delivery 24h
    ];
  }
  const ids = (rows: MarketRow[]) => rows.map((r) => r.id);

  it('the default filters', () => {
    expect(defaultFilters()).toEqual({
      q: '', kind: 'all', country: '', maxTotalCents: null, minCores: null, minRamGb: null, minDiskGb: null, sort: 'featured',
    });
  });
  it('kind chips split on the API rule (stock vs offer)', () => {
    const rows = fixtureRows(), f = defaultFilters();
    expect(ids(applyFilters(rows, { ...f, kind: 'stock' }))).toEqual(['s1', 's2']);
    expect(ids(applyFilters(rows, { ...f, kind: 'offer' }))).toEqual(['o1', 'o2']);
  });
  it('text search is case-insensitive over name/country/region/city/datacenter/model', () => {
    const rows = fixtureRows(), f = defaultFilters();
    expect(ids(applyFilters(rows, { ...f, q: 'FRANKFURT' }))).toEqual(['s2', 'o1']);
    expect(ids(applyFilters(rows, { ...f, q: '  epyc ' }))).toEqual(['o1']);
    expect(applyFilters(rows, { ...f, q: 'nope-nothing' })).toEqual([]);
  });
  it('country filter is exact', () => {
    expect(ids(applyFilters(fixtureRows(), { ...defaultFilters(), country: 'DE' }))).toEqual(['s2', 'o1']);
  });
  it('numeric mins hide under-spec rows AND unknown-spec rows', () => {
    const rows = fixtureRows(), f = defaultFilters();
    expect(ids(applyFilters(rows, { ...f, minCores: 8 }))).toEqual(['s1', 'o1']);
    expect(ids(applyFilters(rows, { ...f, minRamGb: 64 }))).toEqual(['o1']);
    expect(ids(applyFilters(rows, { ...f, minDiskGb: 400 }))).toEqual(['s1', 'o1']);
  });
  it('disk floor: fabricated totals drop', () => {
    const rows = [
      normalizeOfferRow(offerRow({ id: 'fab-nocount', disks: [{ capacity_gb: 1000 }] }), 0),
      normalizeOfferRow(offerRow({ id: 'fab-overflow', disks: [{ count: 2, capacity_gb: 1e308 }] }), 1),
      normalizeOfferRow(offerRow({ id: 'proven', disks: [{ count: 2, capacity_gb: 1000, type: 'NVMe' }] }), 2),
    ];
    expect(ids(applyFilters(rows, { ...defaultFilters(), minDiskGb: 500 }))).toEqual(['proven']);
  });
  it('max total price compares against the min buyable tier; unquotable rows drop under a cap', () => {
    expect(ids(applyFilters(fixtureRows(), { ...defaultFilters(), maxTotalCents: 4000 }))).toEqual(['s1', 's2']);
  });
  it('Featured sort = server parity: stock in arrival order first, offers appended', () => {
    const rows = fixtureRows(), f = defaultFilters();
    expect(ids(applyFilters(rows, f))).toEqual(['s1', 's2', 'o1', 'o2']);
    const shuffled = [rows[2], rows[0], rows[3], rows[1]];
    expect(ids(applyFilters(shuffled, f))).toEqual(['s1', 's2', 'o1', 'o2']);
    // an OFFER with a lower seq than a stock row still ranks after it
    const offerFirst = [normalizeOfferRow(offerRow(), 0), normalizeStockRow(stockRow({ id: 's9' }), 1)];
    expect(ids(applyFilters(offerFirst, f))).toEqual(['s9', 'o1']);
  });
  it('buyable rows rank before dead ones within the default sort', () => {
    const dead = normalizeStockRow(stockRow({ id: 'dead', pricing: null }), 0);
    const live = normalizeStockRow(stockRow({ id: 'live' }), 1);
    expect(ids(applyFilters([dead, live], defaultFilters()))).toEqual(['live', 'dead']);
  });
  it('price sorts put unquotable rows LAST in both directions', () => {
    const rows = fixtureRows(), f = defaultFilters();
    expect(ids(applyFilters(rows, { ...f, sort: 'priceAsc' }))).toEqual(['s2', 's1', 'o1', 'o2']);
    expect(ids(applyFilters(rows, { ...f, sort: 'priceDesc' }))).toEqual(['o1', 's1', 's2', 'o2']);
  });
  it('equal prices fall back to arrival order', () => {
    const a = normalizeStockRow(stockRow({ id: 'a' }), 0), b = normalizeStockRow(stockRow({ id: 'b' }), 1);
    expect(ids(applyFilters([b, a], { ...defaultFilters(), sort: 'priceAsc' }))).toEqual(['a', 'b']);
    expect(ids(applyFilters([b, a], { ...defaultFilters(), sort: 'priceDesc' }))).toEqual(['a', 'b']);
  });
  it('delivery sort ascends with buyable first', () => {
    expect(ids(applyFilters(fixtureRows(), { ...defaultFilters(), sort: 'delivery' }))).toEqual(['s1', 's2', 'o1', 'o2']);
    const noDelivery = normalizeOfferRow(offerRow({ id: 'nd', delivery_hours: null }), 0);
    const fast = normalizeOfferRow(offerRow({ id: 'fast', delivery_hours: 1 }), 1);
    expect(ids(applyFilters([noDelivery, fast], { ...defaultFilters(), sort: 'delivery' }))).toEqual(['fast', 'nd']);
  });
  it('a non-array list is empty and a missing filter set means the defaults', () => {
    expect(applyFilters(null)).toEqual([]);
    expect(ids(applyFilters(fixtureRows()))).toEqual(['s1', 's2', 'o1', 'o2']);
    expect(ids(applyFilters([null, undefined, normalizeStockRow(stockRow(), 0)]))).toEqual(['s1']);
  });
  it('1000-row normalize+filter stays correct', () => {
    const rows: MarketRow[] = [];
    for (let i = 0; i < 500; i++) {
      rows.push(normalizeStockRow(stockRow({
        id: `s${i}`, name: `stock-node-${i}`, country: i % 2 ? 'US' : 'DE',
        specs: { cpu: { cores: (i % 32) + 1 }, ram: { capacity_gb: 32 }, disks: { total_gb: 500 } },
      }), i));
    }
    for (let i = 0; i < 500; i++) {
      rows.push(normalizeOfferRow(offerRow({
        id: `o${i}`, name: `offer-node-${i}`, country: i % 2 ? 'US' : 'DE', cpu_cores: (i % 32) + 1,
      }), 500 + i));
    }
    const out = applyFilters(rows, { ...defaultFilters(), q: 'node', country: 'US', minCores: 16, sort: 'priceAsc' });
    expect(out.length).toBeGreaterThan(100);
    for (const r of out) {
      expect(r.country).toBe('US');
      expect(r.cores).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('market: errData and isAmbiguous', () => {
  it('errData reads err.data.data — the envelope level, not the envelope', () => {
    const err = typedErr(400, 'INSUFFICIENT_BALANCE', { required_cents: 9000, available_cents: 1000 });
    expect(errData(err)).toEqual({ required_cents: 9000, available_cents: 1000 });
    expect(errData(err)).not.toHaveProperty('statusCode');
  });
  it('errData is null for no err, no data, non-object or null details', () => {
    expect(errData(null)).toBeNull();
    expect(errData({ status: 500 })).toBeNull();
    expect(errData({ data: { data: 'oops' } })).toBeNull();
    expect(errData({ data: { data: null } })).toBeNull();
    expect(errData({ data: { data: 7 } })).toBeNull();
  });
  it('isAmbiguous: no err / missing status / status 0 is true; any numeric status is false', () => {
    expect(isAmbiguous(undefined)).toBe(true);
    expect(isAmbiguous(new TypeError('fetch failed'))).toBe(true);
    expect(isAmbiguous({ status: 0, code: 'TIMEOUT' })).toBe(true);
    expect(isAmbiguous({ status: '500' })).toBe(true);
    expect(isAmbiguous({ status: 500 })).toBe(false);
    expect(isAmbiguous({ status: 404 })).toBe(false);
  });
});

describe('market: postEventFor', () => {
  const cases: Array<[string, unknown, string, string]> = [
    ['rent', BANNED_ERR, 'http_403_banned', 'ban first, before any shape rule'],
    ['reserve', BANNED_ERR, 'http_403_banned', 'ban on reserve too'],
    ['rent', { status: 0, code: 'OP_DEADLINE' }, 'posting_budget_expired', 'the withDeadline sentinel is the budget event'],
    ['rent', { status: 0, code: 'TIMEOUT' }, 'transport_ambiguous', 'request timeout is transport-ambiguous'],
    ['rent', new TypeError('fetch failed'), 'transport_ambiguous', 'raw network rejection'],
    ['rent', typedErr(429, null), 'http_429', 'limiter refusal'],
    ['rent', typedErr(409, 'SERVER_UNAVAILABLE'), 'rent_409_server_unavailable', 'the one ambiguous typed 4xx — rent only'],
    ['reserve', typedErr(409, 'SERVER_UNAVAILABLE'), 'typed_4xx', 'NOT special on the reserve rail'],
    ['reserve', typedErr(409, 'IDEMPOTENCY_INTENT_MISMATCH'), 'http_409_intent_mismatch', 'mismatch is its own event'],
    ['reserve', typedErr(500, 'PRICING_INVALID'), 'http_5xx_pricing_invalid', 'the one provably pre-commit 5xx'],
    ['rent', typedErr(500, 'PRICING_INVALID'), 'http_5xx_pricing_invalid', 'same on rent'],
    ['rent', typedErr(500, null), 'http_5xx_other', 'generic 500 can be commit-then-500'],
    ['reserve', typedErr(503, null), 'http_5xx_other', '502/503/504 too'],
    ['rent', typedErr(409, 'CHARGE_EXCEEDS_MAX'), 'typed_4xx', 'ordinary business refusal'],
    ['reserve', typedErr(400, 'INVALID_DURATION'), 'typed_4xx', 'ordinary 400'],
    ['rent', undefined, 'transport_ambiguous', 'no error at all'],
  ];
  for (const [rail, err, want, why] of cases) {
    it(`${rail}: ${why} gives ${want}`, () => { expect(postEventFor(rail, err)).toBe(want); });
  }
});

describe('market: purchaseTransition (full event x state x mode matrix)', () => {
  const STATES = ['idle', 'posting', 'reconciling', 'confirmed', 'failed', 'not-found', 'indeterminate'];
  const MODES = ['initial', 'replay'];
  const EVENTS = [
    'confirm',
    'http_2xx', 'http_429', 'http_403_banned', 'typed_4xx', 'http_409_intent_mismatch',
    'rent_409_server_unavailable', 'http_5xx_pricing_invalid', 'http_5xx_other',
    'transport_ambiguous', 'posting_budget_expired',
    'read_match', 'reads_clean_no_match', 'reads_exhausted_failure', 'read_403_banned', 'reconcile_budget_expired',
    'ambiguity_read_match', 'ambiguity_read_no_match', 'ambiguity_read_failure', 'ambiguity_read_403_banned', 'replay_dispatch',
    'check_again', 'retry_replay', 'retry_rent', 'dismiss',
    'refresh_read_match', 'refresh_read_no_match', 'refresh_read_failure', 'refresh_read_403_banned',
    'not_an_event', // hostile/unknown token must be a no-op everywhere
  ];
  type Want = { state: string; mode?: string; fx?: string[] };
  const rows: Record<string, Want> = {};
  const put = (state: string, modes: string[], event: string, want: Want) => {
    for (const m of modes) rows[`${state}|${m}|${event}`] = want;
  };
  const BOTH = MODES;
  put('idle', BOTH, 'confirm', { state: 'posting', mode: 'initial' });
  put('posting', ['initial'], 'http_2xx', { state: 'confirmed' });
  put('posting', ['initial'], 'http_429', { state: 'failed', fx: ['retryAfter'] });
  put('posting', ['initial'], 'http_403_banned', { state: 'failed', fx: ['bannedNow'] });
  put('posting', ['initial'], 'typed_4xx', { state: 'failed' });
  put('posting', ['initial'], 'http_409_intent_mismatch', { state: 'indeterminate', fx: ['advisory'] });
  put('posting', ['initial'], 'rent_409_server_unavailable', { state: 'reconciling' });
  put('posting', ['initial'], 'http_5xx_pricing_invalid', { state: 'failed' });
  put('posting', ['initial'], 'http_5xx_other', { state: 'reconciling' });
  put('posting', ['initial'], 'transport_ambiguous', { state: 'reconciling' });
  put('posting', ['initial'], 'posting_budget_expired', { state: 'reconciling' });
  put('posting', ['replay'], 'http_2xx', { state: 'confirmed' });
  put('posting', ['replay'], 'http_429', { state: 'indeterminate', fx: ['retryAfter'] });
  put('posting', ['replay'], 'http_403_banned', { state: 'indeterminate', fx: ['bannedNow'] });
  put('posting', ['replay'], 'http_409_intent_mismatch', { state: 'indeterminate', fx: ['advisory'] });
  for (const ev of ['typed_4xx', 'rent_409_server_unavailable', 'http_5xx_pricing_invalid', 'http_5xx_other', 'transport_ambiguous', 'posting_budget_expired']) {
    put('posting', ['replay'], ev, { state: 'indeterminate' });
  }
  // A rent has no key: a matching active rental is evidence only, the attempt stays unknown.
  put('reconciling', BOTH, 'read_match', { state: 'indeterminate', fx: ['advisory'] });
  put('reconciling', BOTH, 'reads_clean_no_match', { state: 'not-found' });
  put('reconciling', BOTH, 'reads_exhausted_failure', { state: 'indeterminate' });
  put('reconciling', BOTH, 'read_403_banned', { state: 'indeterminate', fx: ['bannedNow'] });
  put('reconciling', BOTH, 'reconcile_budget_expired', { state: 'indeterminate' });
  put('reconciling', BOTH, 'ambiguity_read_match', { state: 'reconciling', fx: ['advisory'] });
  put('reconciling', BOTH, 'ambiguity_read_no_match', { state: 'reconciling' });
  put('reconciling', BOTH, 'ambiguity_read_failure', { state: 'reconciling' });
  put('reconciling', BOTH, 'ambiguity_read_403_banned', { state: 'indeterminate', fx: ['bannedNow', 'suppressReplay'] });
  put('reconciling', BOTH, 'replay_dispatch', { state: 'posting', mode: 'replay' });
  for (const t of ['confirmed', 'failed', 'not-found', 'indeterminate']) put(t, BOTH, 'dismiss', { state: 'idle' });
  put('not-found', BOTH, 'check_again', { state: 'reconciling' });
  put('not-found', BOTH, 'retry_rent', { state: 'idle', fx: ['reconfirm'] });
  put('indeterminate', BOTH, 'check_again', { state: 'reconciling' });
  put('indeterminate', BOTH, 'retry_replay', { state: 'posting', mode: 'replay' });
  put('indeterminate', BOTH, 'refresh_read_match', { state: 'indeterminate', fx: ['advisory'] });
  put('indeterminate', BOTH, 'refresh_read_no_match', { state: 'indeterminate' });
  put('indeterminate', BOTH, 'refresh_read_failure', { state: 'indeterminate' });
  put('indeterminate', BOTH, 'refresh_read_403_banned', { state: 'indeterminate', fx: ['bannedNow'] });

  const FX = ['bannedNow', 'advisory', 'suppressReplay', 'retryAfter', 'reconfirm'];

  it('every listed row maps exactly; every unlisted pair is a no-op; canClose derives from the next state', () => {
    let listed = 0, unlisted = 0, terminalEntries = 0;
    for (const state of STATES) for (const mode of MODES) for (const event of EVENTS) {
      const want = rows[`${state}|${mode}|${event}`];
      const got = purchaseTransition(state, event, mode);
      const label = `${state} x ${event} x ${mode}`;
      if (!want) {
        expect(got, `${label} must be a no-op`).toBeNull();
        unlisted++;
        continue;
      }
      listed++;
      expect(got, `${label} must be listed`).not.toBeNull();
      const g = got as NonNullable<typeof got>;
      expect(g.state, label).toBe(want.state);
      expect(g.canClose, `${label} canClose`).toBe(want.state !== 'posting' && want.state !== 'reconciling');
      if (want.state === 'confirmed' || want.state === 'failed' || want.state === 'not-found' || want.state === 'indeterminate') {
        expect(g.canClose, `${label}: a terminal entry restores canClose`).toBe(true);
        terminalEntries++;
      }
      if (want.mode) expect(g.mode, `${label} mode`).toBe(want.mode);
      if (want.state === 'idle') expect(g.mode, `${label}: idle carries no mode`).toBeNull();
      for (const f of FX) {
        expect(!!(g as unknown as Record<string, unknown>)[f], `${label} effect ${f}`).toBe(!!(want.fx && want.fx.includes(f)));
      }
    }
    expect(listed).toBeGreaterThanOrEqual(60);
    expect(unlisted).toBeGreaterThanOrEqual(300);
    expect(terminalEntries).toBeGreaterThanOrEqual(36);
  });

  it('a state keeps the mode it was given when the row names none; a bad mode is initial', () => {
    expect(purchaseTransition('posting', 'http_2xx', 'replay')?.mode).toBe('replay');
    expect(purchaseTransition('posting', 'http_2xx', undefined)?.mode).toBe('initial');
    expect(purchaseTransition('posting', 'http_429', 'bogus')?.state).toBe('failed');
    expect(purchaseTransition('posting', 'http_429', null)?.state).toBe('failed');
  });
  it('initial-429 is failed (the limiter refused pre-handler) with the Retry-After flag', () => {
    const r = purchaseTransition('posting', 'http_429', 'initial');
    expect(r?.state).toBe('failed');
    expect(r?.retryAfter).toBe(true);
    expect(r?.canClose).toBe(true);
  });
  it('replay-429 is indeterminate (the original is still unknown)', () => {
    const r = purchaseTransition('posting', 'http_429', 'replay');
    expect(r?.state).toBe('indeterminate');
    expect(r?.retryAfter).toBe(true);
  });
  it('initial-banned is failed + bannedNow; replay-banned is indeterminate + bannedNow', () => {
    expect(purchaseTransition('posting', 'http_403_banned', 'initial')).toMatchObject({ state: 'failed', bannedNow: true });
    expect(purchaseTransition('posting', 'http_403_banned', 'replay')).toMatchObject({ state: 'indeterminate', bannedNow: true });
  });
  it('initial generic 5xx reconciles; only PRICING_INVALID stays failed; replay mode is indeterminate for both', () => {
    expect(purchaseTransition('posting', 'http_5xx_other', 'initial')?.state).toBe('reconciling');
    expect(purchaseTransition('posting', 'http_5xx_pricing_invalid', 'initial')?.state).toBe('failed');
    expect(purchaseTransition('posting', 'http_5xx_other', 'replay')?.state).toBe('indeterminate');
    expect(purchaseTransition('posting', 'http_5xx_pricing_invalid', 'replay')?.state).toBe('indeterminate');
  });
  it('the banned ambiguity-read row is indeterminate + bannedNow + replay suppressed', () => {
    expect(purchaseTransition('reconciling', 'ambiguity_read_403_banned', 'initial'))
      .toMatchObject({ state: 'indeterminate', bannedNow: true, suppressReplay: true });
  });
  it('all four refresh-reservations outcomes preserve the indeterminate state', () => {
    for (const ev of ['refresh_read_match', 'refresh_read_no_match', 'refresh_read_failure', 'refresh_read_403_banned']) {
      const r = purchaseTransition('indeterminate', ev, 'replay');
      expect(r, ev).not.toBeNull();
      expect(r?.state, ev).toBe('indeterminate');
      expect(r?.canClose).toBe(true);
    }
  });
  it('pmCanClose and PM_TERMINALS', () => {
    expect(pmCanClose('posting')).toBe(false);
    expect(pmCanClose('reconciling')).toBe(false);
    for (const s of ['idle', 'confirmed', 'failed', 'not-found', 'indeterminate']) expect(pmCanClose(s)).toBe(true);
    expect(Object.keys(PM_TERMINALS).sort()).toEqual(['confirmed', 'failed', 'indeterminate', 'not-found']);
  });
});

describe('market: advisoryMatch, validResumeMarker, resume marker store', () => {
  it('advisoryMatch: offer_id + days + created_at at or after the attempt, any state', () => {
    const at = '2026-08-25T10:00:00.000Z';
    const mk = (over: Record<string, unknown>) => ({ offer_id: 'o1', days: 7, state: 'pending', created_at: '2026-08-25T10:00:01.000Z', ...over });
    expect(advisoryMatch([mk({})], 'o1', '7', at)).not.toBeNull();
    expect(advisoryMatch([mk({ state: 'refunded' })], 'o1', '7', at)).not.toBeNull();
    expect(advisoryMatch([mk({ offer_id: 'o2' })], 'o1', '7', at)).toBeNull();
    expect(advisoryMatch([mk({ days: 30 })], 'o1', '7', at)).toBeNull();
    expect(advisoryMatch([mk({ days: '7' })], 'o1', '7', at)).toBeNull(); // days must be a number on the row
    expect(advisoryMatch([mk({ created_at: '2026-08-25T09:59:59.000Z' })], 'o1', '7', at)).toBeNull();
    expect(advisoryMatch([mk({ created_at: 'garbage' })], 'o1', '7', at)).toBeNull();
    expect(advisoryMatch([null, mk({})], 'o1', '7', at)).not.toBeNull();
    expect(advisoryMatch(null, 'o1', '7', at)).toBeNull();
    expect(advisoryMatch([mk({})], 'o1', '7', 'not-a-date')).toBeNull();
  });

  it('validResumeMarker: shape-strict with a 24h expiry', () => {
    const now = Date.now();
    const good = { kind: 'offer', id: 'o1', days: '7', at: now - 1000 };
    expect(validResumeMarker(good, now)).toBe(true);
    expect(validResumeMarker({ ...good, kind: 'stock' }, now)).toBe(true);
    expect(validResumeMarker({ ...good, kind: 'weird' }, now)).toBe(false);
    expect(validResumeMarker({ ...good, id: '' }, now)).toBe(false);
    expect(validResumeMarker({ ...good, days: 7 }, now)).toBe(false);
    expect(validResumeMarker({ ...good, days: '07' }, now)).toBe(false);
    expect(validResumeMarker({ ...good, at: 'yesterday' }, now)).toBe(false);
    expect(validResumeMarker({ ...good, at: Infinity }, now)).toBe(false);
    expect(validResumeMarker({ ...good, at: now - 25 * 3600 * 1000 }, now)).toBe(false);
    expect(validResumeMarker({ ...good, at: now - 23 * 3600 * 1000 }, now)).toBe(true);
    expect(validResumeMarker(null, now)).toBe(false);
    expect(validResumeMarker([], now)).toBe(false);
    expect(market.RESUME_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('write/read/clear round-trip with the exact stored shape (kind/id/days/at only)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    expect(hasResume()).toBe(false);
    writeResumeMarker('offer', 'o1', '7');
    expect(market.RESUME_KEY).toBe('hub_market_resume');
    const raw = sessionStorage.getItem('hub_market_resume') as string;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['at', 'days', 'id', 'kind']);
    expect(readResumeMarker()).toEqual({ kind: 'offer', id: 'o1', days: '7', at: Date.now() });
    expect(hasResume()).toBe(true);
    clearResumeMarker();
    expect(sessionStorage.getItem('hub_market_resume')).toBeNull();
    expect(readResumeMarker()).toBeNull();
  });
  it('an expired, malformed or non-JSON marker reads as none', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    sessionStorage.setItem('hub_market_resume', JSON.stringify({ kind: 'offer', id: 'o1', days: '7', at: Date.now() - 25 * 3600 * 1000 }));
    expect(readResumeMarker()).toBeNull();
    sessionStorage.setItem('hub_market_resume', '{not json');
    expect(readResumeMarker()).toBeNull();
    sessionStorage.setItem('hub_market_resume', JSON.stringify({ kind: 'offer', id: 'o1', days: '7', at: Date.now() - 1000 }));
    expect(hasResume()).toBe(true);
  });
  it('storage that throws never throws out of the marker functions', () => {
    const boom = () => { throw new Error('denied'); };
    stubStorage('sessionStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => writeResumeMarker('offer', 'o1', '7')).not.toThrow();
    expect(readResumeMarker()).toBeNull();
    expect(() => clearResumeMarker()).not.toThrow();
  });
});

describe('market: lruPollPick', () => {
  it('never-polled rows go first, FIFO (tracking order) on ties', () => {
    const tracked = { c: { lastPolledAt: 0, seq: 2 }, a: { lastPolledAt: 0, seq: 0 }, b: { lastPolledAt: 0, seq: 1 } };
    expect(lruPollPick(tracked, {}, 5)).toEqual(['a', 'b', 'c']);
  });
  it('least-recently-polled first when stamps differ; seq breaks equal stamps', () => {
    const tracked = {
      a: { lastPolledAt: 300, seq: 0 }, b: { lastPolledAt: 100, seq: 1 },
      c: { lastPolledAt: 200, seq: 2 }, d: { lastPolledAt: 100, seq: 0 },
    };
    expect(lruPollPick(tracked, {}, 5)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('excluded ids are skipped', () => {
    const tracked = { a: { lastPolledAt: 0, seq: 0 }, b: { lastPolledAt: 0, seq: 1 }, c: { lastPolledAt: 0, seq: 2 } };
    expect(lruPollPick(tracked, { b: true }, 5)).toEqual(['a', 'c']);
  });
  it('cap bounds the pick; cap 0 or a non-number cap picks none', () => {
    const tracked: Record<string, unknown> = {};
    for (let i = 0; i < 7; i++) tracked['p' + i] = { lastPolledAt: 0, seq: i };
    expect(lruPollPick(tracked, {}, 5)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(lruPollPick(tracked, {}, 0)).toEqual([]);
    expect(lruPollPick(tracked, {}, 'x')).toEqual([]);
    expect(lruPollPick(tracked, {}, -1)).toEqual([]);
  });
  it('hostile shapes never throw', () => {
    expect(lruPollPick(null, {}, 5)).toEqual([]);
    expect(lruPollPick('nope', {}, 5)).toEqual([]);
    expect(lruPollPick({ a: null, b: 7, c: { lastPolledAt: 'x', seq: 'y' } }, null, 5)).toEqual(['a', 'b', 'c']);
  });
  it('starvation-free rotation: 7 persistent pendings are all picked within 2 cycles', () => {
    const tracked: Record<string, { lastPolledAt: number; seq: number }> = {};
    for (let i = 0; i < 7; i++) tracked['p' + i] = { lastPolledAt: 0, seq: i };
    const cycle1 = lruPollPick(tracked, {}, 5);
    let now = 1000;
    for (const id of cycle1) (tracked[id] as { lastPolledAt: number }).lastPolledAt = now++;
    const cycle2 = lruPollPick(tracked, {}, 5);
    expect(cycle2.slice(0, 2).sort()).toEqual(['p5', 'p6']);
    const seen = new Set([...cycle1, ...cycle2]);
    for (let i = 0; i < 7; i++) expect(seen.has('p' + i)).toBe(true);
  });
});

describe('market: readAvailableDays and denyRowTiers', () => {
  const TWO_TIER = { pricing_rules: { '7': 7000, '30': 21000 }, hold_rules: { '7': 2, '30': 3 } };

  it('readAvailableDays: wire strings kept, numbers normalized, junk dropped, [] sells nothing, absent is null', () => {
    const r = readAvailableDays;
    expect(r({ available_days: ['30', '60'] })).toEqual({ '30': true, '60': true });
    expect(r({ available_days: [30, 60] })).toEqual({ '30': true, '60': true });
    expect(r({ available_days: ['0', '07', '3651', 'x', null, {}] })).toEqual({});
    expect(r({ available_days: [] })).toEqual({});
    expect(r({})).toBeNull();
    expect(r(null)).toBeNull();
    expect(r({ available_days: 'not-an-array' })).toBeNull();
  });
  it('denyRowTiers: the allow-set intersects the advertised map, the refused day is always denied, cached fields recomputed', () => {
    const row = () => normalizeOfferRow(offerRow(TWO_TIER), 0);
    let r = denyRowTiers(row(), { allow: { '30': true }, deny: '7' });
    expect(r.days).toEqual(['30']);
    expect(r.buyable).toBe(true);
    expect(r.fromDays).toBe('30');
    expect(r.fromCents).toBe(21000 + 2500);
    expect(tierValidity('offer', '7', r.maps)).toBe(false);
    expect(tierValidity('offer', '30', r.maps)).toBe(true);
    r = denyRowTiers(row(), { allow: {}, deny: '7' });
    expect(r.days).toEqual([]);
    expect(r.buyable).toBe(false);
    expect(r.fromCents).toBeNull();
    r = denyRowTiers(row(), { allow: null, deny: '7' });
    expect(r.days).toEqual(['30']);
    expect(tierValidity('offer', '7', r.maps)).toBe(false);
  });
  it('denyRowTiers on a stock row prunes its tier map', () => {
    const r = denyRowTiers(normalizeStockRow(stockRow(), 0), { allow: null, deny: '1' });
    expect(r.days).toEqual([]);
    expect(r.buyable).toBe(false);
  });
});

describe('market and buy: newIdemKey', () => {
  it('uses crypto.randomUUID when present', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
    expect(market.newIdemKey()).toBe('00000000-0000-4000-8000-000000000000');
    expect(buy.newIdemKey()).toBe('00000000-0000-4000-8000-000000000000');
  });
  it('market falls back to mk- + 32 hex', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => { throw new Error('no'); });
    expect(market.newIdemKey()).toMatch(/^mk-[0-9a-f]{32}$/);
  });
  it('buy falls back to sb- + 32 hex from getRandomValues, then from Math.random', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => { throw new Error('no'); });
    expect(buy.newIdemKey()).toMatch(/^sb-[0-9a-f]{32}$/);
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => { throw new Error('no'); });
    expect(buy.newIdemKey()).toMatch(/^sb-[0-9a-f]{32}$/);
  });
  it('keys are within the route 1..128 bound and unique', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const k = buy.newIdemKey();
      expect(k.length).toBeGreaterThan(0);
      expect(k.length).toBeLessThanOrEqual(128);
      keys.add(k);
    }
    expect(keys.size).toBe(200);
  });
});

describe('section objects', () => {
  it('each section keeps its own version of the duplicated names', () => {
    expect(market.RESUME_KEY).toBe('hub_market_resume');
    expect(buy.RESUME_KEY).toBe('hub_buy_resume');
    expect(market.RESUME_TTL_MS).toBe(buy.RESUME_TTL_MS);
    expect(market.centsFromUsdString('0.05')).toBe(5);
    expect(buy.centsFromUsdString('0.05')).toBe(5);
    expect(market.fmtCents(5)).toBe(buy.fmtCents(5));
  });
  it('the objects expose the old API names', () => {
    expect(Object.keys(market).sort()).toEqual([
      'PM_TERMINALS', 'RENTAL_DAYS_MAX', 'RESUME_KEY', 'RESUME_TTL_MS', 'advisoryMatch', 'applyFilters', 'clearResumeMarker',
      'centsFromUsdString', 'defaultFilters', 'denyRowTiers', 'errData', 'fmtCents', 'hasResume', 'isAccountBannedError', 'isAmbiguous',
      'lruPollPick', 'newIdemKey', 'normRuleMap', 'normalizeOfferRow', 'normalizeStockRow', 'pmCanClose', 'postEventFor',
      'purchaseTransition', 'quoteFor', 'readAvailableDays', 'readResumeMarker', 'tierValidity', 'validMarketReceipt', 'validResumeMarker',
      'writeResumeMarker',
    ].sort());
    expect(Object.keys(subs).sort()).toEqual(['cardView', 'hostLabel', 'infoFor', 'planIndex', 'sortSubs', 'stateView', 'validSub']);
    expect(Object.keys(wallet).sort()).toEqual(['CARD_HOST_RE', 'CRYPTO_HOST_RE', 'REFETCH_AFTER', 'RETURN_POLL_MAX', 'RETURN_POLL_MS', 'normalizeAmount', 'returnProviderPrefix']);
    expect(market.tierValidity).toBe(tierValidity);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// buy
// ════════════════════════════════════════════════════════════════════════════

describe('buy: parseIntent', () => {
  const NOW = 1_800_000_000_000;
  it('valid, wrong kind, bad id, stale, future, garbage', () => {
    const ok = JSON.stringify({ kind: 'subserver', plan: FAM, at: NOW - 1000 });
    expect(parseIntent(ok, NOW)).toBe(FAM);
    expect(parseIntent(JSON.stringify({ kind: 'server', plan: FAM, at: NOW }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ kind: 'subserver', plan: FAM.toUpperCase(), at: NOW }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ kind: 'subserver', plan: FAM, at: NOW - INTENT_TTL_MS - 1 }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ kind: 'subserver', plan: FAM, at: NOW + 60_000 }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ kind: 'subserver', plan: FAM }), NOW)).toBeNull();
    expect(parseIntent('{not json', NOW)).toBeNull();
    expect(parseIntent('null', NOW)).toBeNull();
  });
  it('the TTL is one hour, inclusive', () => {
    expect(INTENT_TTL_MS).toBe(3_600_000);
    expect(parseIntent(JSON.stringify({ kind: 'subserver', plan: FAM, at: NOW - INTENT_TTL_MS }), NOW)).toBe(FAM);
  });
});

describe('buy: readIntent and dropIntent', () => {
  const now = Date.now();
  const fresh = () => JSON.stringify({ kind: 'subserver', plan: FAM, at: now - 5 * 60_000 });
  it('the new tab (empty sessionStorage) reads the cross-tab copy', () => {
    localStorage.setItem(INTENT_KEY, fresh());
    expect(readIntent(now)).toBe(FAM);
  });
  it('this tab wins over the cross-tab copy', () => {
    const other = 'b'.repeat(24);
    sessionStorage.setItem(INTENT_KEY, fresh());
    localStorage.setItem(INTENT_KEY, JSON.stringify({ kind: 'subserver', plan: other, at: now }));
    expect(readIntent(now)).toBe(FAM);
  });
  it('a stale or garbage copy reads as none and is dropped from both stores', () => {
    const old = JSON.stringify({ kind: 'subserver', plan: FAM, at: now - 61 * 60_000 });
    sessionStorage.setItem(INTENT_KEY, old);
    localStorage.setItem(INTENT_KEY, old);
    expect(readIntent(now)).toBeNull();
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();
    expect(localStorage.getItem(INTENT_KEY)).toBeNull();
    localStorage.setItem(INTENT_KEY, 'garbage');
    expect(readIntent(now)).toBeNull();
    expect(localStorage.getItem(INTENT_KEY)).toBeNull();
  });
  it('nothing stored reads as none; dropIntent clears both', () => {
    expect(readIntent(now)).toBeNull();
    sessionStorage.setItem(INTENT_KEY, fresh());
    localStorage.setItem(INTENT_KEY, fresh());
    dropIntent();
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();
    expect(localStorage.getItem(INTENT_KEY)).toBeNull();
  });
  it('throwing storage never throws out', () => {
    const boom = () => { throw new Error('denied'); };
    stubStorage('sessionStorage', { getItem: boom, removeItem: boom });
    stubStorage('localStorage', { getItem: boom, removeItem: boom });
    expect(readIntent(now)).toBeNull();
    expect(() => dropIntent()).not.toThrow();
  });
});

describe('buy: parseResume', () => {
  const now = Date.now();
  it('the buy continuation: shape, id, 24 h TTL, title display-only and capped', () => {
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, title: 'Builder', at: now }), now))
      .toEqual({ user: 'u1', plan: FAM, title: 'Builder' });
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, at: now - 25 * 3600_000 }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, at: now - 23 * 3600_000 }), now)).not.toBeNull();
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, at: now + 1000 }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: 'stock', user: 'u1', plan: FAM, at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: 'x', at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: 'subserver', plan: FAM, title: 'Builder', at: now }), now)).toBeNull(); // no owner
    expect(parseResume('{', now)).toBeNull();
    const t = parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, title: 'y'.repeat(500), at: now }), now);
    expect((t as { title: string }).title.length).toBe(80);
    expect(parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, title: 7, at: now }), now)).toEqual({ user: 'u1', plan: FAM, title: '' });
  });
  it('the pay continuation: sub id shape, capped display fields, hold days a count', () => {
    const base = { kind: 'subserver-pay', user: 'u1', sub: 'sub_1-x', title: 'T', name: 'n'.repeat(200), paid_through: '2026-11-01T00:00:00.000Z' + 'z'.repeat(100), hold_days: 30, at: now };
    const got = parseResume(JSON.stringify(base), now) as { pay: string; name: string; paid_through: string; holdDays: number };
    expect(got.pay).toBe('sub_1-x');
    expect(got.name.length).toBe(80);
    expect(got.paid_through.length).toBe(40);
    expect(got.holdDays).toBe(30);
    expect(parseResume(JSON.stringify({ ...base, sub: '../x' }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, sub: undefined }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, name: 5, paid_through: 5, hold_days: -1 }), now))
      .toMatchObject({ name: '', paid_through: null, holdDays: null });
  });
});

describe('buy: money formatting', () => {
  it('fmtCents: integer string math, never a float, never a guess', () => {
    expect(buy.fmtCents(1900)).toBe('$19.00');
    expect(buy.fmtCents(5)).toBe('$0.05');
    expect(buy.fmtCents(0)).toBe('$0.00');
    expect(buy.fmtCents(123456789)).toBe('$1234567.89');
    expect(buy.fmtCents(-1)).toBe('—');
    expect(buy.fmtCents(1.5)).toBe('—');
    expect(buy.fmtCents('1900')).toBe('—');
  });
  it('centsFromUsdString: the wallet wire format only', () => {
    expect(buy.centsFromUsdString('42.50')).toBe(4250);
    expect(buy.centsFromUsdString('0.00')).toBe(0);
    expect(buy.centsFromUsdString('1234567890123.99')).toBe(123456789012399);
    expect(buy.centsFromUsdString('12345678901234.00')).toBeNull();
    expect(buy.centsFromUsdString('42.5')).toBeNull();
    expect(buy.centsFromUsdString('-1.00')).toBeNull();
    expect(buy.centsFromUsdString('01.00')).toBeNull();
    expect(buy.centsFromUsdString(42.5)).toBeNull();
  });
});

describe('buy: fmtUtcDate and language', () => {
  const iso = '2026-08-27T12:00:00.000Z';
  const medium = (tag: string) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC';
  it('invalid or absent gives null', () => {
    for (const bad of [null, undefined, '', 'garbage', 5]) expect(fmtUtcDate(bad)).toBeNull();
  });
  it('formats in UTC with the language tag (zht -> zh-TW, br -> pt-BR, default en)', () => {
    expect(fmtUtcDate(iso)).toBe(medium('en'));
    expect(buy.fmtUtcDate(iso)).toBe(medium('en'));
    setLang('zht');
    expect(fmtUtcDate(iso)).toBe(medium('zh-TW'));
    setLang('br');
    expect(fmtUtcDate(iso)).toBe(medium('pt-BR'));
    setLang('ru');
    expect(fmtUtcDate(iso)).toBe(medium('ru'));
  });
  it('lang(): override, then the page initial language, then en', () => {
    expect(lang()).toBe('en');
    (globalThis as { _hoodyInitialLang?: unknown })._hoodyInitialLang = 'de';
    expect(lang()).toBe('de');
    setLang('fr');
    expect(lang()).toBe('fr');
    setLang(null);
    expect(lang()).toBe('de');
    (globalThis as { _hoodyInitialLang?: unknown })._hoodyInitialLang = '';
    expect(lang()).toBe('en');
    (globalThis as { _hoodyInitialLang?: unknown })._hoodyInitialLang = 5;
    expect(lang()).toBe('en');
  });
  it('an unsupported language tag falls back to the ISO date', () => {
    setLang('not a tag!!');
    expect(fmtUtcDate(iso)).toBe('2026-08-27 UTC');
  });
});

describe('buy: plans', () => {
  it('findPlan matches the family and skips off-contract rows', () => {
    const good = { id: 'v1', family_id: FAM, price_cents_per_month: 1900, hold_days: 30 };
    expect(findPlan([good], FAM)).toBe(good);
    expect(findPlan([good], 'f'.repeat(24))).toBeNull();
    expect(findPlan([{ ...good, price_cents_per_month: 0 }], FAM)).toBeNull();
    expect(findPlan([{ ...good, price_cents_per_month: '19.00' }], FAM)).toBeNull();
    expect(findPlan([{ ...good, hold_days: undefined }], FAM)).toBeNull();
    expect(findPlan([{ ...good, id: '' }], FAM)).toBeNull();
    expect(findPlan([null, { ...good, id: '' }, good], FAM)).toBe(good);
    expect(findPlan(null, FAM)).toBeNull();
  });
  it('validPlan: hold_days 0 is a valid count, a zero price is not', () => {
    const good = { id: 'v1', family_id: FAM, price_cents_per_month: 1900, hold_days: 0 };
    expect(validPlan(good)).toBe(true);
    expect(validPlan({ ...good, price_cents_per_month: 0 })).toBe(false);
    expect(validPlan(null)).toBe(false);
  });
});

describe('buy: classifyError', () => {
  const cases: Array<[unknown, string]> = [
    [{ status: 0, code: 'TIMEOUT' }, 'unknown'],
    [{}, 'unknown'],
    [null, 'unknown'],
    [new TypeError('Failed to fetch'), 'unknown'],
    [{ status: 502 }, 'unknown'],
    [{ status: 401 }, 'auth'],
    [{ status: 429 }, 'rate'],
    [{ status: 403, code: 'FORBIDDEN' }, 'permission'],
    [{ status: 409, code: 'PLAN_NOT_AVAILABLE' }, 'gone'],
    [{ status: 400, code: 'INSUFFICIENT_BALANCE' }, 'funds'],
    [{ status: 409, code: 'CHARGE_EXCEEDS_MAX' }, 'priceChanged'],
    [{ status: 409, code: 'CHARGE_CONFIRMATION_REQUIRED' }, 'priceChanged'],
    [{ status: 409, code: 'PAID_SUBSERVER_LIMIT_REACHED' }, 'limit'],
    [{ status: 409, code: 'NO_PAID_CAPACITY' }, 'capacity'],
    [{ status: 409, code: 'HOST_UNAVAILABLE' }, 'capacity'],
    [{ status: 409, code: 'IDEMPOTENCY_INTENT_MISMATCH' }, 'intent'],
    [{ status: 400, code: 'VALIDATION_ERROR' }, 'refused'],
  ];
  for (const [err, kind] of cases) {
    it(`${JSON.stringify(err)} is ${kind}`, () => { expect(classifyError(err)).toBe(kind); });
  }
});

describe('buy: the pending-key store (hub_money_pending)', () => {
  const U = 'c'.repeat(24);
  const NOW = Date.UTC(2026, 9, 1, 12);
  const buyEntry: PendingEntry = { kind: 'buy', user_id: U, family_id: FAM, plan_id: 'b'.repeat(24), key: 'k-1', max_charge_cents: 1900, at: NOW - 60_000 };
  const payEntry: PendingEntry = { kind: 'pay', user_id: U, sub_id: 's'.repeat(24), key: 'k-2', max_charge_cents: 1900, at: NOW - 60_000 };

  it('the keys', () => {
    expect(PENDING_KEY).toBe('hub_money_pending');
    expect(buy.PENDING_KEY).toBe(PENDING_KEY);
    expect(buy.INTENT_KEY).toBe('hub_buy_intent');
  });

  it('parsePending keeps only well-formed entries, and never expires one', () => {
    const ancient = { ...buyEntry, at: NOW - 400 * 24 * 3600_000 };
    const bad = [
      { ...buyEntry, family_id: 'nope' }, { ...buyEntry, max_charge_cents: -1 }, { ...payEntry, user_id: '' },
      { ...payEntry, sub_id: '../x' }, { ...buyEntry, kind: 'upgrade' }, { ...buyEntry, title: 7 },
      { ...buyEntry, key: 'k'.repeat(129) }, { ...buyEntry, at: 'x' }, { ...buyEntry, plan_id: '' }, null,
    ];
    expect(parsePending(JSON.stringify([buyEntry, payEntry, ancient, ...bad]))).toEqual([buyEntry, payEntry, ancient]);
    expect(parsePending(JSON.stringify([{ ...buyEntry, title: null }]))).toHaveLength(1);
    expect(parsePending('{not json')).toEqual([]);
    expect(parsePending('{"kind":"buy"}')).toEqual([]);
  });

  it('readPendingAll / writePendingAll round-trip; an empty list removes the key', () => {
    expect(readPendingAll()).toEqual([]);
    writePendingAll([buyEntry]);
    expect(readPendingAll()).toEqual([buyEntry]);
    writePendingAll([]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('claimPending adopts the stored entry for the same user + target and never overwrites it', async () => {
    expect(await claimPending(buyEntry)).toEqual(buyEntry);
    const otherTab = { ...buyEntry, key: 'k-other', max_charge_cents: 2500 };
    expect(await claimPending(otherTab)).toEqual(buyEntry);
    expect(readPendingAll()).toEqual([buyEntry]);
    expect(await claimPending(payEntry)).toEqual(payEntry);
    const otherUser = { ...buyEntry, user_id: 'd'.repeat(24) };
    expect(await claimPending(otherUser)).toEqual(otherUser);
    expect(JSON.parse(localStorage.getItem(PENDING_KEY) as string)).toHaveLength(3);
  });

  it('dropPending removes exactly that key: a definitive answer to one key never clears another', async () => {
    await claimPending(buyEntry);
    await claimPending(payEntry);
    await dropPending({ ...buyEntry, key: 'k-someone-else' });
    expect(readPendingAll()).toEqual([buyEntry, payEntry]);
    await dropPending(buyEntry);
    expect(readPendingAll()).toEqual([payEntry]);
    await expect(dropPending(null)).resolves.toBeUndefined();
  });

  it('findPending is per user + target', async () => {
    await claimPending(buyEntry);
    expect(findPending({ ...buyEntry, key: 'x' })).toEqual(buyEntry);
    expect(findPending({ ...buyEntry, user_id: 'z' })).toBeNull();
    expect(findPending({ ...payEntry })).toBeNull();
  });

  it('a throwing setItem (quota, private mode): claimPending rejects before anything is sent', async () => {
    stubStorage('localStorage', { setItem: () => { throw new Error('QuotaExceededError'); } });
    await expect(claimPending(buyEntry)).rejects.toEqual({ preflight: 'store' });
  });

  it('a setItem that silently drops the write is caught by the read-back', async () => {
    stubStorage('localStorage', { setItem: () => {} });
    await expect(claimPending(buyEntry)).rejects.toEqual({ preflight: 'store' });
  });

  it('claimShown: another tab\'s stored attempt is never sent behind this review', async () => {
    const other = { ...buyEntry, key: 'k-other', max_charge_cents: 1900 };
    localStorage.setItem(PENDING_KEY, JSON.stringify([other]));
    await expect(claimShown(buyEntry)).rejects.toEqual({ preflight: 'adopted', entry: other });
    await expect(claimShown(other)).resolves.toEqual(other);
  });

  it('withPendingLock runs fn through navigator.locks when present, else directly; a throw rejects', async () => {
    const request = vi.fn((_name: string, cb: () => unknown) => Promise.resolve(cb()));
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      await expect(withPendingLock(() => 5)).resolves.toBe(5);
      expect(request).toHaveBeenCalledWith(PENDING_KEY, expect.any(Function));
    } finally {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    }
    await expect(withPendingLock(() => 6)).resolves.toBe(6);
    await expect(withPendingLock(() => { throw new Error('x'); })).rejects.toThrow('x');
  });

  it('pendingBody: a buy sends the plan, a pay does not', () => {
    expect(pendingBody(buyEntry)).toEqual({ plan_id: 'b'.repeat(24), idempotency_key: 'k-1', max_charge_cents: 1900 });
    expect(pendingBody(payEntry)).toEqual({ idempotency_key: 'k-2', max_charge_cents: 1900 });
  });

  it('definitive: only the refusals each route gives after its idempotency lookup', () => {
    for (const code of MONEY_DEFINITIVE.buy) expect(definitive('buy', { status: 409, code })).toBe(true);
    for (const code of MONEY_DEFINITIVE.pay) expect(definitive('pay', { status: 409, code })).toBe(true);
    // The earlier operation under the key may have charged: never definitive.
    expect(definitive('buy', { status: 409, code: 'IDEMPOTENCY_INTENT_MISMATCH' })).toBe(false);
    expect(definitive('pay', { status: 409, code: 'IDEMPOTENCY_INTENT_MISMATCH' })).toBe(false);
    for (const e of [{ status: 401 }, { status: 403, code: 'FORBIDDEN' }, { status: 404, code: 'NOT_FOUND' }, { status: 429, code: 'RATE_LIMITED' },
      { status: 400, code: 'VALIDATION_ERROR' }, { status: 409, code: 'SOMETHING_NEW' }, { status: 0, code: 'OP_DEADLINE' }, { status: 500 }, { status: 502 },
      { status: 403, code: 'INSUFFICIENT_BALANCE' }, new TypeError('net'), null]) {
      expect(definitive('buy', e)).toBe(false);
      expect(definitive('pay', e)).toBe(false);
    }
    expect(definitive('buy', { status: 409, code: 'SUBSERVER_DORMANT' })).toBe(false);
    expect(definitive('other', { status: 409, code: 'INSUFFICIENT_BALANCE' })).toBe(false);
    // api() makes an answer pending once its context died (the send may repeat an earlier one
    // whose outcome is unknown): a listed refusal carried that way settles nothing, the key stays (unknown).
    for (const code of ['CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE']) {
      expect(definitive('buy', { kind: 'pending', pending: true, status: 409, code })).toBe(false);
      expect(definitive('pay', { pending: true, status: 409, code })).toBe(false);
      expect(definitive('buy', { kind: 'pending', status: 409, code })).toBe(false);
    }
  });

  // The route's own answer to a buy of plan p1 (subserver-subscription.routes.ts accepted()).
  const BUY = { kind: 'buy', planId: 'p1' } as const;
  const okBuy = { operation: { id: 'o1', subscription_id: 's1', kind: 'purchase', target_plan_id: 'p1', result: null }, subscription: { id: 's1', state: 'provisioning' }, replayed: false };

  it('validEnvelope: a 2xx counts only with the route\'s operation + subscription; a truncated {} is unknown', () => {
    expect(validEnvelope(okBuy, BUY)).toBe(true);
    for (const bad of [{}, null, undefined, { operation: okBuy.operation }, { subscription: okBuy.subscription },
      { ...okBuy, operation: { id: '', subscription_id: 's1' } }, { ...okBuy, subscription: { id: 's1' } }]) expect(validEnvelope(bad, BUY)).toBe(false);
  });

  it('validEnvelope: the operation is the subscription\'s, its result is one of this contract, and pay/upgrade name the request\'s', () => {
    for (const result of [null, 'succeeded', 'failed']) expect(validEnvelope({ ...okBuy, operation: { ...okBuy.operation, result } }, BUY)).toBe(true);
    for (const result of [undefined, 'pending', 'superseded', 'ok', 1]) expect(validEnvelope({ ...okBuy, operation: { ...okBuy.operation, result } }, BUY)).toBe(false);
    expect(validEnvelope({ ...okBuy, operation: { ...okBuy.operation, subscription_id: 's2' } }, BUY)).toBe(false);
    const pay = { ...okBuy, operation: { ...okBuy.operation, kind: 'resume', target_plan_id: null } };
    expect(validEnvelope(pay, { kind: 'pay', subId: 's1' })).toBe(true);
    expect(validEnvelope(pay, { kind: 'pay', subId: 's2' })).toBe(false);
  });

  // The operation is the one this action admits (buy: purchase, upgrade:
  // upgrade, pay: resume), a buy's or an upgrade's of the plan sent, and replayed is the route's boolean.
  it('validEnvelope: the operation kind and target plan are this request\'s; replayed is a boolean', () => {
    expect(validEnvelope({ ...okBuy, replayed: true }, BUY)).toBe(true);
    for (const replayed of [undefined, 'true', 1, null]) expect(validEnvelope({ ...okBuy, replayed }, BUY)).toBe(false);
    for (const kind of ['upgrade', 'resume', 'wipe', 'hold', undefined]) expect(validEnvelope({ ...okBuy, operation: { ...okBuy.operation, kind } }, BUY)).toBe(false);
    for (const target_plan_id of ['p2', null, undefined]) expect(validEnvelope({ ...okBuy, operation: { ...okBuy.operation, target_plan_id } }, BUY)).toBe(false);
    const up = { ...okBuy, operation: { ...okBuy.operation, kind: 'upgrade', target_plan_id: 'p2' }, subscription: { id: 's1', state: 'active' } };
    expect(validEnvelope(up, { kind: 'upgrade', subId: 's1', planId: 'p2' })).toBe(true);
    expect(validEnvelope(up, { kind: 'upgrade', subId: 's1', planId: 'p3' })).toBe(false);
    expect(validEnvelope({ ...up, operation: { ...up.operation, kind: 'purchase' } }, { kind: 'upgrade', subId: 's1', planId: 'p2' })).toBe(false);
    const pay = { ...okBuy, operation: { ...okBuy.operation, kind: 'resume', target_plan_id: null } };
    for (const kind of ['purchase', 'upgrade', 'wipe']) expect(validEnvelope({ ...pay, operation: { ...pay.operation, kind } }, { kind: 'pay', subId: 's1' })).toBe(false);
  });

  it('validMarketReceipt: reserve needs a boolean replayed and, unless it is a replay, its reservation; rent needs its rental, naming the rented server', () => {
    const v = market.validMarketReceipt;
    const sent = { id: 'off1', days: 30 };
    expect(v('reserve', { replayed: false, reservation: { id: 'r1', state: 'pending' } }, sent)).toBe(true);
    expect(v('reserve', { replayed: false, reservation: { id: 'r1', state: 'pending', offer_id: 'off1', days: 30 } }, sent)).toBe(true);
    expect(v('reserve', { replayed: true }, sent)).toBe(true);
    expect(v('reserve', { replayed: true, reservation: { id: 'r1', state: 'fulfilled', offer_id: 'off1', days: 30 } }, sent)).toBe(true);
    for (const bad of [null, undefined, [], {}, { replayed: 'false' }, { replayed: false }, { replayed: false, reservation: null }, { replayed: false, reservation: {} },
      { replayed: false, reservation: { id: '' } }, { replayed: false, reservation: [] }, { replayed: false, reservation: { id: 'r1' } },
      { replayed: false, reservation: { id: 'r1', state: 'pending', offer_id: 'off2' } }, { replayed: true, reservation: { id: 'r1', state: 'pending', offer_id: 'off2' } },
      { replayed: false, reservation: { id: 'r1', state: 'pending', days: 7 } }, { replayed: false, reservation: { id: 'r1', state: 'pending', days: '30' } }]) expect(v('reserve', bad, sent)).toBe(false);
    const st = { id: 'st1', days: 30 };
    expect(v('rent', { rental: { id: 'x', server_id: 'st1' }, transaction: { id: 't' } }, st)).toBe(true);
    for (const bad of [null, {}, { rental: null }, { rental: 'x' }, { rental: [] }, { replayed: false }, { rental: {} }, { rental: { id: '' } },
      { rental: { id: 'x' } }, { rental: { id: 'x', server_id: 'st2' } }, { rental: { id: 'x', server_id: null } }]) expect(v('rent', bad, st)).toBe(false);
  });

  it('failedOutcome: a failed operation or a delivery_failed subscription', () => {
    expect(failedOutcome({ operation: { result: 'failed' }, subscription: { state: 'held' } })).toBe(true);
    expect(failedOutcome({ operation: { result: null }, subscription: { state: 'delivery_failed' } })).toBe(true);
    expect(failedOutcome({ operation: { result: null }, subscription: { state: 'provisioning' } })).toBe(false);
    expect(failedOutcome(null)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// wallet
// ════════════════════════════════════════════════════════════════════════════

describe('wallet', () => {
  it('normalizeAmount: two decimals, refusing junk and over-precision', () => {
    expect(normalizeAmount('10')).toBe('10.00');
    expect(normalizeAmount('10.5')).toBe('10.50');
    expect(normalizeAmount('10.55')).toBe('10.55');
    expect(normalizeAmount(' 7 ')).toBe('7.00');
    expect(normalizeAmount(12)).toBe('12.00');
    expect(normalizeAmount('0')).toBe('0.00'); // zero is refused by the caller, not here
    expect(normalizeAmount('0.05')).toBe('0.05');
    for (const bad of ['1.234', 'abc', '', null, undefined, '-1', '01', '1.', '.5', '1e3', '1,5']) expect(normalizeAmount(bad)).toBeNull();
  });
  it('provider hosts are https-only and anchored', () => {
    expect(CARD_HOST_RE.test('https://checkout.stripe.com/c/pay')).toBe(true);
    expect(CARD_HOST_RE.test('https://' + 'stripe.com'.toUpperCase() + '/x')).toBe(true);
    expect(CARD_HOST_RE.test('http://checkout.stripe.com/x')).toBe(false);
    expect(CARD_HOST_RE.test('https://evilstripe.com/x')).toBe(false);
    expect(CARD_HOST_RE.test('https://stripe.com.evil.com/x')).toBe(false);
    expect(CRYPTO_HOST_RE.test('https://nowpayments.io/payment/?iid=1')).toBe(true);
    expect(CRYPTO_HOST_RE.test('https://x.nowpayments.io/p')).toBe(true);
    expect(CRYPTO_HOST_RE.test('https://nowpayments.io.evil.com/p')).toBe(false);
  });
  it('constants and the return provider prefix', () => {
    expect(RETURN_POLL_MAX).toBe(10);
    expect(RETURN_POLL_MS).toBe(2000);
    expect(Object.keys(REFETCH_AFTER).sort()).toEqual(['already_claimed', 'granted', 'not_linked', 'retry']);
    expect(returnProviderPrefix('crypto')).toBe('crypto');
    expect(returnProviderPrefix('card')).toBe('card');
    expect(returnProviderPrefix(undefined)).toBe('card');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// subs
// ════════════════════════════════════════════════════════════════════════════

describe('subs: cardView and stateView', () => {
  const sub = (o: Record<string, unknown>) => ({ id: 's1', plan_id: 'v1', state: 'active', auto_renew: true, active_operation_id: null, ...o });

  it('plain words for every state; held names the UTC deletion date only when the API gives one', () => {
    expect(stateView(sub({ state: 'provisioning' }))).toEqual({ tone: 'busy', text: 'Being set up — usually a few minutes' });
    expect(stateView(sub({})).text).toBe('Active');
    expect(stateView(sub({ state: 'past_due' })).text).toBe('Payment due');
    expect(stateView(sub({ state: 'held', delete_at: undefined })).text).toBe('On hold — pay to resume before it is permanently deleted');
    expect(stateView(sub({ state: 'held', delete_at: '2026-12-01T10:00:00.000Z' })).text).toMatch(/^On hold — will be deleted .*2026 UTC$/);
    expect(stateView(sub({ state: 'wiping' })).text).toBe('Being permanently deleted');
    expect(stateView(sub({ state: 'terminated' })).text).toBe('Ended');
    expect(stateView(sub({ state: 'host_wiped' })).text).toBe('Ended');
    expect(stateView(sub({ state: 'delivery_failed' })).text).toBe('Setup didn\'t complete — our team has been alerted');
    expect(stateView(sub({ state: 'change_stuck' })).text).toBe('A change is being finished — our team is checking it');
    expect(stateView(sub({ state: 'archived' })).text).toBe('Unavailable right now');
    expect(stateView(null).text).toBe('Unavailable right now');
  });
  it('tones and pay actions per state', () => {
    const tp = (o: Record<string, unknown>) => { const v = cardView(sub(o)); return [v.tone, v.pay]; };
    expect(tp({ state: 'provisioning' })).toEqual(['busy', null]);
    expect(tp({})).toEqual(['ok', null]);
    expect(tp({ state: 'past_due' })).toEqual(['warn', 'pay']);
    expect(tp({ state: 'wiping' })).toEqual(['danger', null]);
    expect(tp({ state: 'terminated' })).toEqual(['muted', null]);
    expect(tp({ state: 'delivery_failed' })).toEqual(['warn', null]);
    expect(tp({ state: 'change_stuck' })).toEqual(['warn', null]);
    expect(tp({ state: 'nope' })).toEqual(['muted', null]);
  });
  it('held + paid + resume op in flight: resuming, no Pay now', () => {
    expect(cardView(sub({ state: 'held', delete_at: null, active_operation_id: 'op1' }))).toEqual({ tone: 'busy', text: 'Payment received — starting again', pay: null });
  });
  it('held + paid, no op (the resume failed): a retry, never "will be deleted"', () => {
    const v = cardView(sub({ state: 'held', delete_at: null }));
    expect(v.pay).toBe('retry');
    expect(v.text).toBe('Payment received — starting again didn\'t complete');
  });
  it('held + unpaid (the server gave a deletion date): Pay now, also while a wipe is admitted', () => {
    const d = '2026-12-01T10:00:00.000Z';
    expect(cardView(sub({ state: 'held', delete_at: d })).pay).toBe('pay');
    expect(cardView(sub({ state: 'held', delete_at: d, active_operation_id: 'wipe1' })).pay).toBe('pay');
    expect(cardView(sub({ state: 'held', delete_at: d })).tone).toBe('danger');
    expect(cardView(sub({ state: 'held' })).pay).toBe('pay'); // delete_at absent is not "paid"
  });
  it('paid vs unpaid is the server verdict, never the browser clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    expect(cardView(sub({ state: 'held', delete_at: '2026-12-01T10:00:00.000Z' })).pay).toBe('pay');
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    expect(cardView(sub({ state: 'held', delete_at: null })).pay).toBe('retry');
  });
  it('past_due while its hold is stopping it: no Pay now, says when it can be paid', () => {
    expect(cardView(sub({ state: 'past_due', active_operation_id: 'hold1' })))
      .toEqual({ tone: 'busy', text: 'Stopping for non-payment — you can pay in a few minutes', pay: null });
  });
  it('a hold because auto-renew is OFF is not called non-payment', () => {
    const v = cardView(sub({ state: 'past_due', active_operation_id: 'hold1', auto_renew: false }));
    expect(v).toEqual({ tone: 'busy', text: 'Auto-renew is off, so it is stopping — you can pay to resume in a few minutes', pay: null });
    expect(v.text.toLowerCase()).not.toContain('non-payment');
  });
});

describe('subs: translator', () => {
  const held = { id: 'x', state: 'held', delete_at: '2026-11-02T10:00:00.000Z', plan_id: 'v1', server_id: 'y', auto_renew: true };
  it('the default fills {{date}} into the English fallback', () => {
    expect(cardView(held).text).toBe('On hold — will be deleted ' + (fmtUtcDate(held.delete_at) as string));
  });
  it('an injected translator supplies the strings and the variables', () => {
    const DE: Record<string, string> = { 'auth.hub.subs.stHeld': 'Angehalten — wird am {{date}} gelöscht', 'auth.hub.subs.stActive': 'Aktiv' };
    const calls: Array<[string, string]> = [];
    setTranslator((key, fb, vars) => {
      calls.push([key, fb]);
      return (DE[key] ?? fb).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (vars && vars[k] != null ? String(vars[k]) : ''));
    });
    expect(cardView(held).text).toBe('Angehalten — wird am ' + (fmtUtcDate(held.delete_at) as string) + ' gelöscht');
    expect(stateView({ ...held, state: 'active' }).text).toBe('Aktiv');
    expect(cardView({ id: 'x', state: 'wiping' }).text).toBe('Being permanently deleted'); // no German string: its fallback
    expect(calls[0]?.[0]).toBe('auth.hub.subs.stHeld');
  });
  it('setTranslator(null) restores the default', () => {
    setTranslator(() => 'X');
    expect(stateView({ id: 'x', state: 'active' }).text).toBe('X');
    setTranslator(null);
    expect(stateView({ id: 'x', state: 'active' }).text).toBe('Active');
  });
});

describe('subs: planIndex and infoFor', () => {
  const sub = (o: Record<string, unknown>) => ({ id: 's1', plan_id: 'v1', state: 'active', ...o });
  it('planIndex indexes valid plans by version id and skips the rest', () => {
    const idx = planIndex([
      { id: 'v1', price_cents_per_month: 1900, hold_days: 30, text: { title: 'Builder' } },
      { id: 'v2', price_cents_per_month: 5.5, hold_days: -1, text: { type_label: 'Big' } },
      null, { id: '' }, { id: 'v3' },
    ]);
    expect(Object.keys(idx).sort()).toEqual(['v1', 'v2', 'v3']);
    expect(idx.v1).toEqual({ title: 'Builder', priceCents: 1900, holdDays: 30 });
    expect(idx.v2).toEqual({ title: 'Big', priceCents: null, holdDays: null });
    expect(idx.v3).toEqual({ title: '', priceCents: null, holdDays: null });
    expect(planIndex(null)).toEqual({});
  });
  it('infoFor: catalogue by version id; an unlisted version gets no price; the API\'s own plan wins', () => {
    const idx = planIndex([{ id: 'v1', price_cents_per_month: 1900, hold_days: 30, text: { title: 'Builder' } }, null, { id: '' }]);
    expect(infoFor(sub({}), idx)).toEqual({ title: 'Builder', priceCents: 1900, holdDays: 30 });
    expect(infoFor(sub({ plan_id: 'old' }), idx)).toEqual({ title: '', priceCents: null, holdDays: null });
    expect(infoFor(sub({ plan_id: 'old', plan: { title: 'Legacy', price_cents_per_month: 900, hold_days: 7 } }), idx))
      .toEqual({ title: 'Legacy', priceCents: 900, holdDays: 7 });
    expect(infoFor(sub({ plan_id: '__proto__' }), idx)).toEqual({ title: '', priceCents: null, holdDays: null });
    expect(infoFor(sub({ plan: { title: 'T' } }), idx)).toEqual({ title: 'T', priceCents: 1900, holdDays: 30 });
    expect(infoFor(null, null)).toEqual({ title: '', priceCents: null, holdDays: null });
  });
});

describe('subs: sortSubs, validSub, hostLabel', () => {
  const sub = (o: Record<string, unknown>) => ({ id: 's1', plan_id: 'v1', state: 'active', ...o });
  it('sortSubs: needs-action first, ended last, unknown states between; the input is not mutated', () => {
    const input = [sub({ id: 'a', state: 'terminated' }), sub({ id: 'b' }), sub({ id: 'c', state: 'held' }), sub({ id: 'd', state: 'past_due' }),
      sub({ id: 'e', state: 'provisioning' }), sub({ id: 'f', state: 'weird' }), sub({ id: 'g', state: 'wiping' })];
    const before = input.map((x) => x.id);
    expect(sortSubs(input).map((x) => x.id)).toEqual(['c', 'd', 'e', 'b', 'g', 'f', 'a']);
    expect(input.map((x) => x.id)).toEqual(before);
  });
  it('sortSubs is stable within a state', () => {
    expect(sortSubs([sub({ id: 'x' }), sub({ id: 'y' }), sub({ id: 'z' })]).map((s) => s.id)).toEqual(['x', 'y', 'z']);
  });
  it('validSub needs a non-empty id and a string state', () => {
    expect(validSub(sub({}))).toBe(true);
    expect(validSub(sub({ id: '' }))).toBe(false);
    expect(validSub(sub({ state: 3 }))).toBe(false);
    expect(validSub(null)).toBe(false);
  });
  it('hostLabel: the slice name, else a short id of the server, else of the subscription', () => {
    expect(hostLabel({ id: 's1', server_id: 'a'.repeat(24), server_name: 'builder-eu-1' })).toBe('builder-eu-1');
    expect(hostLabel({ id: 's1', server_id: 'a'.repeat(24), server_name: 'paid-66fa1c2b9e8d7f0a1b2c3d4e' })).toBe('#1b2c3d4e');
    expect(hostLabel({ id: 's1', server_id: 'a'.repeat(24), server_name: 'paid-66FA1C2B9E8D7F0A1B2C3D4E' })).toBe('paid-66FA1C2B9E8D7F0A1B2C3D4E');
    expect(hostLabel({ id: 's1', server_id: 'a'.repeat(24), server_name: 'paid-66fa1c2b9e8d7f0a1b2c3d4e0' })).toBe('paid-66fa1c2b9e8d7f0a1b2c3d4e0');
    expect(hostLabel({ id: 's1', server_id: '0123456789abcdef01234567', server_name: null })).toBe('#01234567');
    expect(hostLabel({ id: 'sub-0123456789abcdef', server_id: null })).toBe('#89abcdef');
    expect(hostLabel({ id: 's1', server_id: 'x', server_name: 'n'.repeat(200) })).toHaveLength(80);
  });
});
