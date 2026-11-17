// registry.test.ts: the fixture copy of the storage registry stays equal to shared.js AUTH_STORAGE_REGISTRY, row for row,
// apart from the differences INTENDED_DIFFERENCES names.
import sharedSource from '../../../public/auth/shared.js?raw';
import { describe, expect, it } from 'vitest';
import { registryEntry, STORAGE_REGISTRY } from './registry';

type Row = Record<string, unknown>;

function liveRegistry(): Row[] {
  const src = sharedSource as string;
  const start = src.indexOf('var AUTH_STORAGE_REGISTRY = [');
  const end = src.indexOf('\n];', start);
  expect(start).toBeGreaterThan(0);
  const consts: Record<string, string> = {};
  for (const m of src.matchAll(/^(?:var|const) ([A-Z_]+) = '([^']*)';$/gm)) consts[m[1] as string] = m[2] as string;
  return new Function(...Object.keys(consts), 'return ' + src.slice(start + 'var AUTH_STORAGE_REGISTRY = '.length, end + 2))(...Object.values(consts)) as Row[];
}

/** A row's identity: its area and its key or prefix ("local key hoody_ref_v1"). */
const rowId = (r: Row): string => `${String(r.area)} ${r.key !== undefined ? `key ${String(r.key)}` : `prefix ${String(r.prefix)}`}`;
/**
 * A row's fields in a fixed order, so two rows written in a different field order still compare equal. A field present
 * with the value undefined stays distinct from an absent one (JSON would drop it, or turn it into null).
 */
const canon = (r: Row): string => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] === undefined ? 'undefined' : JSON.stringify(r[k])]));
/** The ids that occur more than once: the first match wins in authStorageEntry, so a later twin would hide from the comparison. */
const twins = (rows: readonly Row[]): string[] => rows.map(rowId).filter((id, i, ids) => ids.indexOf(id) !== i);

/**
 * Rows by rowId where fixture mode is meant to differ from the live page, each with its reason. Empty: fixture mode stores,
 * purges and forgets exactly as shared.js. An entry whose row no longer differs fails, so a stale reason cannot linger.
 */
const INTENDED_DIFFERENCES: Readonly<Record<string, string>> = {};

/** Every row that differs, by rowId: missing from the copy, missing from shared.js, or with other fields. */
function differences(copy: readonly Row[], live: readonly Row[]): Record<string, string> {
  const mine = new Map(copy.map((r) => [rowId(r), r]));
  const theirs = new Map(live.map((r) => [rowId(r), r]));
  const out: Record<string, string> = {};
  for (const [id, r] of theirs) {
    const m = mine.get(id);
    if (!m) out[id] = 'in shared.js, missing from registry.ts';
    else if (canon(m) !== canon(r)) out[id] = `registry.ts ${JSON.stringify(m)}, shared.js ${JSON.stringify(r)}`;
  }
  for (const id of mine.keys()) if (!theirs.has(id)) out[id] = 'in registry.ts, missing from shared.js';
  return out;
}

describe('fixture storage registry', () => {
  const copy = STORAGE_REGISTRY as unknown as Row[];
  const live = liveRegistry();
  const diff = differences(copy, live);

  it('names each row once on each side (the comparison matches rows by area and key or prefix)', () => {
    expect(twins(copy), 'registry.ts holds these rows twice').toEqual([]);
    expect(twins(live), 'shared.js holds these rows twice').toEqual([]);
  });

  it('differs from shared.js only where INTENDED_DIFFERENCES says why', () => {
    const unintended = Object.fromEntries(Object.entries(diff).filter(([id]) => !(id in INTENDED_DIFFERENCES)));
    expect(unintended, 'make core/registry.ts match public/auth/shared.js, or name the row in INTENDED_DIFFERENCES with its reason').toEqual({});
  });

  it('names no intended difference that is gone', () => {
    const stale = Object.keys(INTENDED_DIFFERENCES).filter((id) => !(id in diff));
    expect(stale, 'these rows no longer differ: remove them from INTENDED_DIFFERENCES').toEqual([]);
  });

  it('keeps the rows both hold in the order shared.js does (the first match wins, as in authStorageEntry)', () => {
    const both = new Set(copy.map(rowId).filter((id) => live.some((r) => rowId(r) === id)));
    expect(copy.map(rowId).filter((id) => both.has(id))).toEqual(live.map(rowId).filter((id) => both.has(id)));
  });

  it('looks up exact keys and prefixes per area, like authStorageEntry', () => {
    expect(registryEntry('local', 'access_token')).toMatchObject({ purge: true });
    expect(registryEntry('local', 'hub_home_v1')).toMatchObject({ purge: true });
    expect(registryEntry('local', 'hub_notif:summary')).toMatchObject({ prefix: 'hub_notif:', purge: true });
    expect(registryEntry('session', 'access_token')).toBeNull();
    expect(registryEntry('local', 'not_a_hub_key')).toBeNull();
    // Kept like hub.v3.changes: no purge, only Forget this browser (scripts asks).
    expect(registryEntry('local', 'hub.v3.script-asks')).toEqual({ area: 'local', key: 'hub.v3.script-asks', purge: false, forget: true });
  });

  // Fixture mode kept the referral after Forget this browser and did not know its revision fence.
  it('forgets the referral only on Forget this browser and never purges its revision fence', () => {
    expect(registryEntry('local', 'hoody_ref_v1')).toEqual({ area: 'local', key: 'hoody_ref_v1', purge: false, forget: true });
    expect(registryEntry('local', 'hoody_ref_rev_v1')).toEqual({ area: 'local', key: 'hoody_ref_rev_v1', purge: false });
  });
});
