// The plan columns' rows (each column draws them in this order). Every plan fact in one numbered group; a dash says "not included" (a count of 0) or
// "not listed" (a field left out); the AI row is on every plan, with the tier word alone below ×2, core's rule.
import { describe, expect, it } from 'vitest';
import { commerceRules } from '@core';
import { COMPARE_GROUPS, checkoutPlan, columnMode, comparison, isOwnColumn, ownCatalogue, planByHandle, planRows, plansForSubs, priceShort, serversOn, subLabels, upgradeDelta, type CompareCell } from './logic';
import strings from './strings.en.json';
import type { RawPlan } from './types';

const T = strings as Record<string, string>;
const res = { cpu_cores: 2, ram_gb: 4, disk_limit_gb: 60, disk_io_read_mib: 400, disk_io_write_mib: 400, network_limit_mbps: 500, max_computers: 3, snapshots_per_computer: 3, ai_multiplier: 4 };
const plan = (over: Record<string, unknown> = {}, r: Record<string, unknown> = {}) =>
  ({ id: 'p1', family_id: 'f1', price_cents_per_month: 1000, hold_days: 7, ai_tier: 'plus', max_proxy_aliases: 6, max_bot_urls: 3, ...over, resources: { ...res, ...r } }) as unknown as RawPlan;
const cellOf = (plans: RawPlan[], id: string, at = 0): CompareCell | undefined => comparison(plans).groups.flatMap((g) => g.rows).find((r) => r.id === id)?.cells[at];

describe('the compare table groups', () => {
  it('every plan fact sits in exactly one group', () => {
    const inGroups = COMPARE_GROUPS.flatMap((g) => g.facts);
    expect([...inGroups].sort()).toEqual([...commerceRules.PLAN_FACT_IDS].sort());
    expect(new Set(inGroups).size).toBe(inGroups.length);
  });
  it('usage first, then server, then network, numbered from 00, each row with its title and grey line', () => {
    const { groups } = comparison([plan()]);
    expect(groups.map((g) => [g.num, g.id])).toEqual([['00', 'usage'], ['01', 'server'], ['02', 'network']]);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['ai'], ['cores', 'ram', 'disk', 'io', 'computers', 'snapshots'], ['net', 'aliases', 'boturls']]);
    for (const r of groups.flatMap((g) => g.rows)) {
      expect(T[r.label]).toBeTruthy();
      expect(r.hint).toBe(`plans.hint.${r.id}`);
      expect(T[r.hint]).toBeTruthy();
    }
  });
  it('a group with no row is not drawn, and the numbers stay consecutive', () => {
    const bare = plan({}, { cpu_cores: undefined, ram_gb: undefined, disk_limit_gb: undefined, disk_io_read_mib: undefined, disk_io_write_mib: undefined, max_computers: undefined, snapshots_per_computer: undefined });
    expect(comparison([bare]).groups.map((g) => [g.num, g.id])).toEqual([['00', 'usage'], ['01', 'network']]);
  });
  it('the AI row stays when no plan has AI facts: every column has its AI line', () => {
    const none = plan({ ai_tier: undefined }, { ai_multiplier: undefined });
    expect(comparison([none]).groups[0]).toMatchObject({ id: 'usage', rows: [{ id: 'ai', cells: [{ kind: 'none', why: 'notListed' }] }] });
  });
  it('plans given out of order: every cell lands under its own plan', () => {
    const late = plan({ id: 'late', sort_order: 2, ai_tier: 'pro' }, { cpu_cores: 8, ai_multiplier: 10 });
    const early = plan({ id: 'early', sort_order: 1 }, { cpu_cores: 2, snapshots_per_computer: undefined });
    const c = comparison([late, early]);
    expect(c.plans.map((p) => p.id)).toEqual(['early', 'late']);
    const row = (id: string) => c.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.cells;
    expect(row('cores')).toEqual([{ kind: 'value', value: '2' }, { kind: 'value', value: '8' }]);
    expect(row('ai')).toEqual([{ kind: 'ai', tier: 'plus', mult: 4 }, { kind: 'ai', tier: 'pro', mult: 10 }]);
    expect(row('snapshots')).toEqual([{ kind: 'none', why: 'notListed' }, { kind: 'value', value: '3' }]);
  });
  it('an id the read lists twice is no column, in either order, nor any fact cell; an entry no column shows counts too', () => {
    const a = plan({ id: 'dup', sort_order: 1 }, { cpu_cores: 2 });
    const b = plan({ id: 'dup', family_id: 'f2', sort_order: 2 }, { cpu_cores: 4 });
    const other = plan({ id: 'other', sort_order: 3 }, { cpu_cores: 8 });
    for (const read of [[a, b, other], [b, a, other], [a, { id: 'dup', family_id: 'f3', price_cents_per_month: 0 } as unknown as RawPlan, other]]) {
      const c = comparison(read);
      expect(c.plans.map((p) => p.id)).toEqual(['other']);
      expect(c.groups.flatMap((g) => g.rows).find((r) => r.id === 'cores')?.cells).toEqual([{ kind: 'value', value: '8' }]);
    }
    expect(comparison([a, other]).plans.map((p) => p.id)).toEqual(['dup', 'other']);
  });
  it('a row no plan has is not drawn; a row one plan has shows the others as not listed', () => {
    const none = plan({}, { snapshots_per_computer: undefined });
    expect(cellOf([none], 'snapshots')).toBeUndefined();
    expect(cellOf([none, plan({ id: 'p2' })], 'snapshots', 0)).toEqual({ kind: 'none', why: 'notListed' });
    expect(cellOf([none, plan({ id: 'p2' })], 'snapshots', 1)).toEqual({ kind: 'value', value: '3' });
  });
});

describe('a dash says which', () => {
  it('a count of 0 is not included, for the plan that has 0 only', () => {
    const zero = plan({ max_bot_urls: 0 });
    expect(cellOf([zero, plan({ id: 'p2' })], 'boturls', 0)).toEqual({ kind: 'none', why: 'notIncluded' });
    expect(cellOf([zero, plan({ id: 'p2' })], 'boturls', 1)).toEqual({ kind: 'value', value: '3' });
  });
  it('a malformed field is not listed, never 0 and never "not included"', () => {
    const odd = plan({ max_bot_urls: 'many' });
    expect(cellOf([odd, plan({ id: 'p2' })], 'boturls', 0)).toEqual({ kind: 'none', why: 'notListed' });
  });
  it('a disk that reads at 0 but writes keeps its words', () => {
    expect(cellOf([plan({}, { disk_io_read_mib: 0, disk_io_write_mib: 200 })], 'io')).toEqual({ kind: 'value', value: { k: 'buy.resDiskIoSplit', v: { r: 0, w: 200 } } });
  });
});

describe('the AI row: for every plan', () => {
  it('below ×2 the tier word alone: equal multiples never read as equal allowances (live Plus and Pro are both ×1)', () => {
    const plus = plan({ ai_tier: 'plus' }, { ai_multiplier: 1 });
    const pro = plan({ id: 'p2', ai_tier: 'pro' }, { ai_multiplier: 1 });
    expect(cellOf([plus, pro], 'ai', 0)).toEqual({ kind: 'ai', tier: 'plus', mult: null });
    expect(cellOf([plus, pro], 'ai', 1)).toEqual({ kind: 'ai', tier: 'pro', mult: null });
    expect(cellOf([plan({ ai_tier: undefined }, { ai_multiplier: 1 })], 'ai')).toEqual({ kind: 'none', why: 'notListed' });
    expect(cellOf([plan({}, { ai_multiplier: 2 })], 'ai')).toEqual({ kind: 'ai', tier: 'plus', mult: 2 });
    expect(cellOf([plan()], 'ai')).toEqual({ kind: 'ai', tier: 'plus', mult: 4 });
    expect(T['plans.aiMult']).toBe('{{n}}×');
  });
  it('one side missing shows the other; both missing is not listed', () => {
    expect(cellOf([plan({ ai_tier: undefined })], 'ai')).toEqual({ kind: 'ai', tier: null, mult: 4 });
    expect(cellOf([plan({}, { ai_multiplier: undefined })], 'ai')).toEqual({ kind: 'ai', tier: 'plus', mult: null });
    expect(cellOf([plan({ ai_tier: undefined }, { ai_multiplier: undefined }), plan({ id: 'p2' })], 'ai', 0)).toEqual({ kind: 'none', why: 'notListed' });
  });
  it('core and the rows the Market and checkout read keep their rule: ×1 is no fact there', () => {
    const one = plan({}, { ai_multiplier: 1 });
    expect(commerceRules.planFacts(one).some((f) => f.id === 'ai')).toBe(false);
    expect(planRows(one).some((r) => r.id === 'ai')).toBe(false);
  });
  it('the grey lines claim no exact limit, no bigger allowance, and no speed beyond a ceiling', () => {
    expect(T['plans.hint.ai']).not.toMatch(/\d|bigger|more/i);
    expect(T['plans.hint.io']).toMatch(/^Up to/);
    expect(T['plans.hint.net']).toMatch(/^Up to.*each direction/);
    expect(T['plans.hint.cores']).toMatch(/vCPU/);
    expect(T['plans.hint.cores']).not.toMatch(/processor|cores/i);
  });
});

// The plans table: the column helpers.
const sub = (o: Record<string, unknown> = {}) =>
  ({ id: 'a1b2c3d4e5f60718293a4b01', state: 'active', server_name: 'n12', plan_id: 'p-small', plan: { family_id: 'small', price_cents_per_month: 1200 }, paid_through: new Date(Date.now() + 86_400_000 * 9).toISOString(), active_operation_id: null, ...o }) as never;

describe('the plan column helpers', () => {
  it('a whole-dollar price drops its cents, any other keeps them; a non-count is a dash', () => {
    expect(priceShort(1000)).toBe('$10');
    expect(priceShort(0)).toBe('$0');
    expect(priceShort(123456700)).toBe('$1,234,567');
    expect(priceShort(1250)).toBe('$12.50');
    expect(priceShort(1001)).toBe('$10.01');
    expect(priceShort(-1)).toBe('—');
    expect(priceShort(10.5)).toBe('—');
  });
  it('a server counts on its plan\'s version while it holds it; ended and wiped ones do not', () => {
    const card = { id: 'p-small', family: 'small' };
    const subs = [sub(), sub({ state: 'held' }), sub({ state: 'past_due' }), sub({ state: 'terminated' }), sub({ state: 'host_wiped' }), sub({ state: 'wiping' }), sub({ plan_id: 'other', plan: { family_id: 'other' } })];
    expect(serversOn(card, subs)).toBe(3);
    expect(serversOn(card, null)).toBe(0);
  });
  it('the count is by version: a server on retired pro-v1 is not on the pro-v2 column, nor a plan_id naming the family', () => {
    const card = { id: 'pro-v2', family: 'pro' };
    expect(serversOn(card, [sub({ plan_id: 'pro-v1', plan: { family_id: 'pro' } })])).toBe(0);
    expect(serversOn(card, [sub({ plan_id: 'pro', plan: { family_id: 'pro' } })])).toBe(0);
    expect(serversOn(card, [sub({ plan_id: 'pro-v2', plan: { family_id: 'pro' } }), sub({ plan_id: 'pro-v1', plan: { family_id: 'pro' } })])).toBe(1);
  });
  it('"Plans for" offers only the servers that can upgrade now', () => {
    const ok = sub();
    expect(plansForSubs([ok, sub({ state: 'held' }), sub({ active_operation_id: 'op-1' }), sub({ paid_through: new Date(Date.now() - 1000).toISOString() })])).toEqual([ok]);
    expect(plansForSubs(undefined)).toEqual([]);
  });
  it('the upgrade difference comes from the two catalogue prices, only when it is above 0', () => {
    const cat = [{ id: 'p-small', family: 'small', priceCents: 1200 }];
    expect(upgradeDelta(sub(), { priceCents: 2900 }, cat)).toBe(1700);
    expect(upgradeDelta(sub(), { priceCents: 1200 }, cat)).toBeNull();
    expect(upgradeDelta(sub(), { priceCents: 900 }, cat)).toBeNull();
    expect(upgradeDelta(sub(), { priceCents: null }, cat)).toBeNull();
    expect(upgradeDelta(sub({ plan: { family_id: 'small' }, plan_id: 'unknown' }), { priceCents: 2900 }, cat)).toBeNull();
  });
  it('the server\'s own price is the catalogue\'s, never its recorded terms', () => {
    // Recorded $10, its catalogue version $12, the plan $25: the note says +$13, the checkout quote's own arithmetic.
    const rec = sub({ plan_id: 'p-small', plan: { family_id: 'small', price_cents_per_month: 1000 } });
    expect(upgradeDelta(rec, { priceCents: 2500 }, [{ id: 'p-small', family: 'small', priceCents: 1200 }])).toBe(1300);
    // Its version is not on sale: no difference, even with a price on record and another version of the family listed.
    expect(upgradeDelta(rec, { priceCents: 2500 }, [{ id: 'p-small-v2', family: 'small', priceCents: 1200 }])).toBeNull();
    expect(upgradeDelta(rec, { priceCents: 2500 }, [])).toBeNull();
    // plan_id naming a family names no version: no difference, even with one plan of the family listed (the
    // server may run another version of it, off sale).
    const fam = sub({ plan_id: 'small', plan: { family_id: 'small', price_cents_per_month: 1000 } });
    expect(upgradeDelta(fam, { priceCents: 2500 }, [{ id: 'p-small-v2', family: 'small', priceCents: 1500 }])).toBeNull();
    expect(upgradeDelta(fam, { priceCents: 2500 }, [{ id: 'p-small-v2', family: 'small', priceCents: 1500 }, { id: 'p-small-v3', family: 'small', priceCents: 1600 }])).toBeNull();
  });
  it('"Plans for" labels never read the same: a shared name adds the id ending, a shared ending the whole id', () => {
    const a = { id: 'aaaaaaaaaaaaaaaa11112222', server_name: 'web' };
    const b = { id: 'bbbbbbbbbbbbbbbb11112222', server_name: 'web' };
    const c = { id: 'cccccccccccccccc33334444', server_name: 'web' };
    const d = { id: 'dddddddddddddddd55556666', server_name: 'db' };
    expect(subLabels([d])).toEqual(['db']);
    expect(subLabels([c, d, { ...c, id: 'eeeeeeeeeeeeeeee77778888' }])).toEqual(['web #33334444', 'db', 'web #77778888']);
    expect(subLabels([a, b, d])).toEqual(['web #aaaaaaaaaaaaaaaa11112222', 'web #bbbbbbbbbbbbbbbb11112222', 'db']);
  });
  it('a column offers Get with no server picked, Upgrade to a candidate, nothing on the server\'s own plan or a plan it cannot move to', () => {
    const ups = new Set(['p-mid']);
    const cols = [{ id: 'p-small-v2', family: 'small' }, { id: 'p-mid', family: 'mid' }, { id: 'p-tiny', family: 'tiny' }];
    expect(columnMode({ id: 'p-mid', family: 'mid' }, null, ups, cols)).toBe('get');
    expect(columnMode({ id: 'p-mid', family: 'mid' }, sub(), ups, cols)).toBe('upgrade');
    // Its version (p-small) is off sale and its family has one plan on sale: that sibling is not its plan:
    // Upgrade when it is a candidate, else nothing.
    expect(columnMode({ id: 'p-small-v2', family: 'small' }, sub(), new Set(['p-small-v2']), cols)).toBe('upgrade');
    expect(columnMode({ id: 'p-small-v2', family: 'small' }, sub(), ups, cols)).toBe('notUp');
    // Its version on sale: that column is its plan.
    expect(columnMode({ id: 'p-small', family: 'small' }, sub(), new Set(), [...cols, { id: 'p-small', family: 'small' }])).toBe('current');
    expect(columnMode({ id: 'p-tiny', family: 'tiny' }, sub(), ups, cols)).toBe('notUp');
  });
  it('the server\'s own column is its version, never a sibling version of its family', () => {
    const on = (plan_id: string) => sub({ plan_id, plan: { family_id: 'pro' } });
    const two = [{ id: 'pro-v2', family: 'pro' }, { id: 'pro-v3', family: 'pro' }];
    expect(isOwnColumn(two[0]!, on('pro-v2'), two)).toBe(true);
    expect(isOwnColumn(two[1]!, on('pro-v2'), two)).toBe(false);
    expect(columnMode(two[1]!, on('pro-v2'), new Set(), two)).toBe('notUp');
    expect(columnMode(two[1]!, on('pro-v2'), new Set(['pro-v3']), two)).toBe('upgrade');
    // Its version off sale with two of its family on sale: neither column is its plan.
    expect(isOwnColumn(two[0]!, on('pro-v1'), two)).toBe(false);
    expect(isOwnColumn(two[1]!, on('pro-v1'), two)).toBe(false);
    // Off sale with one of its family on sale: still not its plan (the server is not on
    // pro-v3). plan_id naming the family: not its plan either, and no Upgrade there (it may be its version).
    expect(isOwnColumn(two[1]!, on('pro-v1'), [two[1]!])).toBe(false);
    expect(columnMode(two[1]!, on('pro-v1'), new Set(), [two[1]!])).toBe('notUp');
    expect(isOwnColumn(two[1]!, on('pro'), [two[1]!])).toBe(false);
    expect(columnMode(two[1]!, on('pro'), new Set(['pro-v3']), [two[1]!])).toBe('notUp');
  });
});

// plan_id is a version id or (older records) a family name. When the catalogue reads it
// both ways, or the version found is of another family than the server's record says, it names no entry.
describe('ownCatalogue: the catalogue entry of the server\'s own plan', () => {
  const on = (plan_id: string, family_id?: string) => sub({ plan_id, plan: family_id ? { family_id } : {} });
  it('its version, of the family its record names', () => {
    const cat = [{ id: 'pro-v1', family: 'pro' }, { id: 'pro-v2', family: 'pro' }];
    expect(ownCatalogue(on('pro-v1', 'pro'), cat)?.id).toBe('pro-v1');
    expect(ownCatalogue(on('pro-v1'), cat)?.id).toBe('pro-v1');
  });
  it('plan_id names a version of another family and this family too: none, and no column says the server is on it', () => {
    const cat = [{ id: 'pro-v1', family: 'pro' }, { id: 'pro', family: 'other' }];
    expect(ownCatalogue(on('pro', 'pro'), cat)).toBeNull();
    expect(ownCatalogue(on('pro'), cat)).toBeNull();
    for (const c of cat) expect(isOwnColumn(c, on('pro', 'pro'), cat)).toBe(false);
    expect(columnMode(cat[1]!, on('pro', 'pro'), new Set(), cat)).toBe('notUp');
    expect(upgradeDelta(on('pro', 'pro'), { priceCents: 9900 }, cat.map((c) => ({ ...c, priceCents: 100 })))).toBeNull();
  });
  it('the version found is of another family than the record says: none', () => {
    expect(ownCatalogue(on('pro', 'pro'), [{ id: 'pro', family: 'other' }])).toBeNull();
  });
  it('plan_id is a version id that is also another entry\'s family: none', () => {
    const cat = [{ id: 'pro-v1', family: 'pro' }, { id: 'x', family: 'pro-v1' }];
    expect(ownCatalogue(on('pro-v1', 'pro'), cat)).toBeNull();
    expect(isOwnColumn(cat[0]!, on('pro-v1', 'pro'), cat)).toBe(false);
  });
  it('plan_id naming a family names no entry, even its one plan on sale: the server may run another version', () => {
    const cat = [{ id: 'pro-v3', family: 'pro' }];
    expect(ownCatalogue(on('pro', 'pro'), cat)).toBeNull();
    expect(ownCatalogue(on('pro'), cat)).toBeNull();
    expect(ownCatalogue(on('pro', 'zzz'), cat)).toBeNull();
    expect(columnMode(cat[0]!, on('pro', 'pro'), new Set(['pro-v3']), cat)).toBe('notUp');
  });
  it('plan_id is the id and the family of its one entry: none, the record may name the family', () => {
    const cat = [{ id: 'pro', family: 'pro' }];
    expect(ownCatalogue(on('pro', 'pro'), cat)).toBeNull();
    expect(isOwnColumn(cat[0]!, on('pro', 'pro'), cat)).toBe(false);
    expect(columnMode(cat[0]!, on('pro', 'pro'), new Set(['pro']), cat)).toBe('notUp');
  });
  it('the whole catalogue read counts, entries without a column too: a family named plan_id, or its id twice, names none', () => {
    const cat = [{ id: 'pro-v1', family: 'pro', priceCents: 1000 }];
    const free = { id: 'free', family_id: 'pro-v1' };
    const v1 = { id: 'pro-v1', family_id: 'pro' };
    expect(ownCatalogue(on('pro-v1', 'pro'), cat, [v1])?.id).toBe('pro-v1');
    expect(ownCatalogue(on('pro-v1', 'pro'), cat, [free, v1])).toBeNull();
    expect(ownCatalogue(on('pro-v1', 'pro'), cat, [v1, free])).toBeNull();
    expect(ownCatalogue(on('pro-v1', 'pro'), cat, [v1, { id: 'pro-v1', family_id: 'pro' }])).toBeNull();
    expect(isOwnColumn(cat[0]!, on('pro-v1', 'pro'), cat, [v1, free])).toBe(false);
    expect(columnMode(cat[0]!, on('pro-v1', 'pro'), new Set(['pro-v1']), cat, [v1, free])).toBe('notUp');
    expect(upgradeDelta(on('pro-v1', 'pro'), { priceCents: 2500 }, cat, [v1])).toBe(1500);
    expect(upgradeDelta(on('pro-v1', 'pro'), { priceCents: 2500 }, cat, [v1, free])).toBeNull();
  });
});

// The checkout takes the first catalogue entry whose id or family_id is the link's plan; a column's link names
// its own version alone, or the column has no action.
describe('checkoutPlan: the plan a column opens', () => {
  const raw = [
    { id: 'pro-v2', family_id: 'pro' },
    { id: 'pro-v3', family_id: 'pro' },
    { id: 'max-v1', family_id: 'max' },
    { id: 'odd', family_id: 'max-v1' },
  ];
  it('Get carries the version id even when its family names one entry (a second version may be added)', () => {
    expect(checkoutPlan({ id: 'solo-v1' }, [...raw, { id: 'solo-v1', family_id: 'solo' }])).toBe('solo-v1');
  });
  it('a family with two versions: Get on each opens that version, never the first of the family', () => {
    expect(checkoutPlan({ id: 'pro-v2' }, raw)).toBe('pro-v2');
    expect(checkoutPlan({ id: 'pro-v3' }, raw)).toBe('pro-v3');
  });
  it('Upgrade carries the version id', () => {
    expect(checkoutPlan({ id: 'pro-v3' }, raw)).toBe('pro-v3');
  });
  it('a version id that is another entry\'s family names two entries: no action, never its family', () => {
    // The family would open whichever of its versions the drawer's later catalogue read lists first.
    // A whole column (its family included), as PlansSection passes it.
    const max = { id: 'max-v1', family: 'max' };
    expect(checkoutPlan(max, raw)).toBeNull();
  });
});

// The drawer's lookup of a link's plan. A Plans column's link is exact: that
// version id only, in any later read, or nothing (the plan is gone), never an entry whose family has that name. Any
// other link (a family hand-off, a website Get link) keeps the live lookup: the first entry whose id or family is the
// handle.
describe('planByHandle: the plan the checkout drawer opens', () => {
  const v = { id: 'max-v1', family_id: 'max' };
  const odd = { id: 'odd', family_id: 'max-v1' };
  it('exact: the version id wins over another entry\'s family of that name, in any order', () => {
    expect(planByHandle([odd, v], 'max-v1', true)).toBe(v);
    expect(planByHandle([v, odd], 'max-v1', true)).toBe(v);
  });
  it('exact: the version left and an entry of family max-v1 came: none, the plan is gone', () => {
    expect(planByHandle([odd], 'max-v1', true)).toBeNull();
    expect(planByHandle([{ id: 'max-v2', family_id: 'max' }], 'max-v1', true)).toBeNull();
    expect(planByHandle([v], 'max', true)).toBeNull();
  });
  it('exact: a later read listing that id twice opens none, in either order', () => {
    const twin = { id: 'max-v1', family_id: 'other' };
    expect(planByHandle([twin, v], 'max-v1', true)).toBeNull();
    expect(planByHandle([v, twin], 'max-v1', true)).toBeNull();
    expect(planByHandle([v, twin], 'max-v1')).toBe(v);
  });
  it('a family hand-off: the first entry of the family or id, as before, even when a version id equals the family', () => {
    const p1 = { id: 'pro-v1', family_id: 'pro' };
    const other = { id: 'pro', family_id: 'other' };
    expect(planByHandle([p1, other], 'pro')).toBe(p1);
    expect(planByHandle([p1, other], 'pro', false)).toBe(p1);
    expect(planByHandle([{ id: 'pro-v2', family_id: 'pro' }, v], 'max')).toBe(v);
  });
  it('an unknown or missing handle opens none', () => {
    expect(planByHandle([v], 'nope')).toBeNull();
    expect(planByHandle(undefined, 'max')).toBeNull();
    expect(planByHandle([v], undefined, true)).toBeNull();
  });
});

// When the server's own entry cannot be told (ownCatalogue null while plan_id names one or
// more columns), no column plan_id could name offers Upgrade or says it is the server's plan: it may be the server's own.
describe('an unresolved plan_id never offers its own version', () => {
  const on = (plan_id: string, family_id?: string) => sub({ plan_id, plan: family_id ? { family_id } : {} });
  it('plan_id names a family with two versions on sale, both candidates: neither column offers Upgrade', () => {
    const cat = [{ id: 'pro-v1', family: 'pro' }, { id: 'pro-v2', family: 'pro' }];
    const ups = new Set(['pro-v1', 'pro-v2', 'max-v1']);
    for (const c of cat) expect(columnMode(c, on('pro', 'pro'), ups, cat)).toBe('notUp');
    expect(columnMode({ id: 'max-v1', family: 'max' }, on('pro', 'pro'), ups, [...cat, { id: 'max-v1', family: 'max' }])).toBe('upgrade');
  });
  it('plan_id is both a version of another family and this family: no Upgrade on either', () => {
    const cat = [{ id: 'pro-v1', family: 'pro' }, { id: 'pro', family: 'other' }];
    for (const c of cat) expect(columnMode(c, on('pro', 'pro'), new Set(['pro-v1', 'pro']), cat)).toBe('notUp');
  });
  it('a version off sale (plan_id names no column): a sibling can still be an upgrade', () => {
    expect(columnMode({ id: 'pro-v2', family: 'pro' }, on('pro-v1', 'pro'), new Set(['pro-v2']), [{ id: 'pro-v2', family: 'pro' }])).toBe('upgrade');
  });
});
