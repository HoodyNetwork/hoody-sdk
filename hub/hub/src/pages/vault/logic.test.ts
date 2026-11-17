import { describe, expect, it } from 'vitest';
import {
  ALIAS_KEY, GLOBAL, KEY_MAX, METADATA_MAX_BYTES, heldIdentity, isHoodyKey, keyProblem, looksEncrypted, partitionOf, partitionQuery,
  putProved, rowsOf, typedConfirmMatches, writeMetadata, type VaultRow,
} from './logic';
import { sdkVectors } from './crypto.vectors';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const envelope = sdkVectors[0]!.envelope;
const row = (key: string, metadata: VaultRow['metadata'] = null): VaultRow => ({ key, realm_id: '', metadata, size_bytes: 1, created_at: '', updated_at: '' });

describe('partitions', () => {
  it('Global sends no realm_id at all; a realm sends its id in lower case', () => {
    expect(partitionQuery(GLOBAL)).toEqual({});
    expect('realm_id' in partitionQuery(GLOBAL)).toBe(false);
    expect(partitionQuery(A)).toEqual({ realm_id: A });
    expect(partitionQuery('AAAAAAAAAAAAAAAAAAAAAAAA')).toEqual({ realm_id: A });
  });
  it("'all' and junk are never a partition", () => {
    expect(partitionOf('all')).toBeNull();
    expect(partitionOf('abc')).toBeNull();
    expect(partitionOf(undefined)).toBeNull();
    expect(() => partitionQuery('all')).toThrow();
    expect(() => partitionQuery('x'.repeat(24))).toThrow();
  });
  it('Global spellings and realm ids', () => {
    expect(partitionOf('')).toBe(GLOBAL);
    expect(partitionOf('global')).toBe(GLOBAL);
    expect(partitionOf('AAAAAAAAAAAAAAAAAAAAAAAA')).toBe(A);
  });
});

describe('key names', () => {
  it('accepts what the API takes, up to 100 characters', () => {
    expect(keyProblem('api-key.v2_prod')).toBeNull();
    expect(keyProblem('k'.repeat(KEY_MAX))).toBeNull();
  });
  it('refuses empty, too long, other characters and hoody.*', () => {
    expect(keyProblem('')).toBe('empty');
    expect(keyProblem('k'.repeat(KEY_MAX + 1))).toBe('too_long');
    for (const bad of ['a b', 'a/b', 'é', 'a%2Fb', '../x', 'a\nb']) expect(keyProblem(bad)).toBe('chars');
    expect(keyProblem('hoody.anything')).toBe('reserved');
    expect(keyProblem(ALIAS_KEY)).toBe('reserved');
  });
  it('hoody.* is Hoody-owned; a look-alike is not', () => {
    expect(isHoodyKey(ALIAS_KEY)).toBe(true);
    expect(isHoodyKey('hoody')).toBe(false);
    expect(isHoodyKey('my.hoody.key')).toBe(false);
  });
});

describe('list rows and the lock hint', () => {
  it('reads metadata-only rows and drops malformed ones', () => {
    const rows = rowsOf({ data: [{ key: 'a', realm_id: '', metadata: { encrypted: true }, size_bytes: 10, created_at: 'c', updated_at: 'u' }, { nokey: 1 }, null, { key: 'b', metadata: [1] }] });
    expect(rows.map((r) => r.key)).toEqual(['a', 'b']);
    expect(rows[1]!.metadata).toBeNull();
    expect(rowsOf({ data: [] })).toEqual([]);
  });
  it('an answer without a data array is no list: BAD_LIST, never an empty partition', () => {
    for (const bad of [{ data: 'x' }, { data: {} }, {}, null, 'x']) expect(() => rowsOf(bad)).toThrow(expect.objectContaining({ code: 'BAD_LIST' }));
  });
  it('encrypted = the reserved marker, or seen as an envelope in this view', () => {
    expect(looksEncrypted(row('a', { encrypted: true }), new Set())).toBe(true);
    expect(looksEncrypted(row('a', { encrypted: 'true' }), new Set())).toBe(false);
    expect(looksEncrypted(row('a'), new Set(['a']))).toBe(true);
    expect(looksEncrypted(row('a'), new Set())).toBe(false);
  });
});

describe('the metadata a write sends', () => {
  it('keeps other tools\' keys, replaces the write id, marks an envelope', () => {
    expect(writeMetadata({ filename: 'x.pdf', write_id: 'old' }, 'w1', envelope)).toEqual({ filename: 'x.pdf', write_id: 'w1', encrypted: true });
  });
  it('a plain value drops a stale encrypted marker', () => {
    expect(writeMetadata({ encrypted: true, note: 1 }, 'w2', 'plain')).toEqual({ note: 1, write_id: 'w2' });
  });
  it('is never empty (always sent, so the server cannot keep a stale marker)', () => {
    expect(writeMetadata(null, 'w3', 'plain')).toEqual({ write_id: 'w3' });
  });
  it('a raw envelope typed in is marked encrypted too', () => {
    expect(writeMetadata({}, 'w4', envelope)?.encrypted).toBe(true);
  });
  it('null past the API limit', () => {
    expect(writeMetadata({ big: 'x'.repeat(METADATA_MAX_BYTES) }, 'w5', 'v')).toBeNull();
  });
});

describe('held writes', () => {
  it('reads back only our identities', () => {
    expect(heldIdentity({ partition: A, op: 'put', key: 'k', write_id: 'w' })).toEqual({ partition: A, op: 'put', key: 'k', write_id: 'w' });
    expect(heldIdentity({ partition: '', op: 'clear' })).toEqual({ partition: '', op: 'clear' });
    expect(heldIdentity({ partition: 'all', op: 'clear' })).toBeNull();
    expect(heldIdentity({ partition: A.toUpperCase(), op: 'clear' })).toBeNull();
    expect(heldIdentity({ partition: A, op: 'put', key: 'k' })).toBeNull();
    expect(heldIdentity({ partition: A })).toBeNull();
    expect(heldIdentity(null)).toBeNull();
  });
  it('a PUT is proved only by its own write id', () => {
    const id = { partition: A, op: 'put', key: 'k', write_id: 'w1' } as const;
    expect(putProved(id, [row('k', { write_id: 'w1' })])).toBe(true);
    expect(putProved(id, [row('k', { write_id: 'w0' })])).toBe(false);
    expect(putProved(id, [row('k')])).toBe(false);
    expect(putProved(id, [])).toBe(false);
    expect(putProved(id, [row('other', { write_id: 'w1' })])).toBe(false);
  });
  it('DELETE and Clear are never proved by a read', () => {
    expect(putProved({ partition: B, op: 'delete', key: 'k' }, [])).toBe(false);
    expect(putProved({ partition: B, op: 'clear' }, [])).toBe(false);
  });
});

describe('typed confirmation', () => {
  it('exact name, ends trimmed', () => {
    expect(typedConfirmMatches(' Global ', 'Global')).toBe(true);
    expect(typedConfirmMatches('global', 'Global')).toBe(false);
    expect(typedConfirmMatches('', '')).toBe(false);
  });
});

describe('rowsOf keeps metadata only', () => {
  it('a value in a list row is never carried into the rows', () => {
    const rows = rowsOf({ data: [{ key: 'a', value: 'fixture-secret-value-xyz', metadata: { owner: 'ops' }, size_bytes: 3 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('value');
    expect(JSON.stringify(rows)).not.toContain('fixture-secret-value-xyz');
  });
});
