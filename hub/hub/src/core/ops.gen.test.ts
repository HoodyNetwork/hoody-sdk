// core/ops.gen.ts against the Hoody API's part of the SDK's public spec (generated/openapi.public.json, `api_` operations
// with the prefix dropped: publicApiOperations). The committed file must equal what hub/scripts/ops-gen.ts makes from it
// today; HUB_OPS_REGEN=1 writes it again instead (then commit the file).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENAPI_FILE, OPS_GEN_FILE, generateOps, publicApiOperations } from '../../scripts/ops-gen';
import { OPS, OPS_INPUT_SHA } from './ops.gen';

// The public spec is build output of the SDK: a checkout that has not generated it cannot compare, so the comparison is
// skipped there, visibly. Where the spec exists, a stale table fails.
const hasSpec = existsSync(OPENAPI_FILE);
// console.error is the one console method the Hub's lint allows; the skip must be visible in the run log.
if (!hasSpec) console.error('ops.gen.test.ts: SKIPPED the comparison with the public spec; generated/openapi.public.json is not in this checkout.');
const spec = (hasSpec ? publicApiOperations(JSON.parse(readFileSync(OPENAPI_FILE, 'utf8'))) : { paths: {} }) as { paths: Record<string, Record<string, { operationId?: string }>> };
const op = (operationId: unknown, extra: Record<string, unknown> = {}) => ({ operationId, description: 'd', ...extra });

describe.skipIf(!hasSpec)('core/ops.gen.ts is current', () => {
  it('equals what ops-gen makes from the public spec (HUB_OPS_REGEN=1 rewrites it)', () => {
    const fresh = generateOps(spec);
    if (process.env.HUB_OPS_REGEN === '1') writeFileSync(OPS_GEN_FILE, fresh);
    expect(readFileSync(OPS_GEN_FILE, 'utf8') === fresh, 'core/ops.gen.ts is stale: run HUB_OPS_REGEN=1 bun run hub:vitest hub/src/core/ops.gen.test.ts').toBe(true);
  });

  it('holds every published operation, under its own id, once', () => {
    const published: string[] = [];
    for (const [p, item] of Object.entries(spec.paths)) {
      for (const [m, o] of Object.entries(item)) if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) published.push(`${o.operationId} ${m.toUpperCase()} ${p}`);
    }
    const listed = Object.entries(OPS).flatMap(([id, pairs]) => pairs.map(([m, p]) => `${id} ${m} ${p}`));
    expect(listed.sort()).toEqual(published.sort());
  });

  it('every id is an own key of OPS, which has no prototype to shadow', () => {
    const ids = [...new Set(Object.values(spec.paths).flatMap((item) => Object.entries(item).filter(([m]) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map(([, o]) => o.operationId)))];
    expect(ids.filter((id) => !Object.hasOwn(OPS, id as string))).toEqual([]);
    expect(Object.getPrototypeOf(OPS)).toBe(null);
  });
});

describe('publicApiOperations', () => {
  it('keeps the api_ operations under their id without the prefix and drops every other service', () => {
    const unified = { paths: { '/api/v1/a': { get: op('api_listA'), parameters: [] }, '/files/b': { get: op('files_listB') }, '/api/v1/c': { put: op('api_setC'), patch: op('api_setC_patch') }, '/x': { get: op('listX') } } };
    expect(publicApiOperations(unified)).toEqual({ paths: { '/api/v1/a': { get: { operationId: 'listA' } }, '/api/v1/c': { put: { operationId: 'setC' }, patch: { operationId: 'setC_patch' } } } });
    expect(() => publicApiOperations({})).toThrow(/no paths/);
  });
});

describe('ops-gen', () => {
  const two = { paths: { '/a/{id}': { put: op('setA'), patch: op('setA') }, '/b/': { get: op('listB'), parameters: [] }, '/z': { get: op('moveC') }, '/y': { post: op('moveC') } } };

  it('one id keeps every pair, sorted by path then method; paths stay as published', () => {
    const text = generateOps(two);
    expect(text).toContain("  setA: [['PATCH', '/a/{id}'], ['PUT', '/a/{id}']],");
    expect(text).toContain("  listB: [['GET', '/b/']],");
    expect(text).toContain("  moveC: [['POST', '/y'], ['GET', '/z']],");
    expect(text).toContain("export type OperationId =\n  | 'listB'\n  | 'moveC'\n  | 'setA';");
  });

  it('the input sha moves with the operation set and ignores everything else', () => {
    const sha = (s: unknown) => /OPS_INPUT_SHA = '([0-9a-f]{64})'/.exec(generateOps(s))?.[1];
    const reworded = { paths: { ...two.paths, '/a/{id}': { put: op('setA', { description: 'other' }), patch: op('setA') }, '/b/': { get: op('listB', { summary: 's' }) } } };
    const more = { paths: { ...two.paths, '/c': { delete: op('dropC') } } };
    expect(sha(reworded)).toBe(sha(two));
    expect(sha(more)).not.toBe(sha(two));
    expect(OPS_INPUT_SHA).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed on anything it cannot write as published', () => {
    expect(() => generateOps({ paths: { '/a': { get: op(undefined) } } })).toThrow(/no usable operationId/);
    expect(() => generateOps({ paths: { '/a': { get: op(7) } } })).toThrow(/no usable operationId/);
    expect(() => generateOps({ paths: { '/a': { get: op("x'y") } } })).toThrow(/no usable operationId/);
    expect(() => generateOps({ paths: { '/a': { head: op('h') } } })).toThrow(/method outside/);
    expect(() => generateOps({ paths: { "/a'": { get: op('g') } } })).toThrow(/characters outside/);
    expect(() => generateOps({ paths: { '/a': { get: op('one') }, '/a/': { get: op('two') } } })).toThrow(/published twice/);
    for (const id of [...Object.getOwnPropertyNames(Object.prototype), 'prototype']) {
      expect(() => generateOps({ paths: { '/a': { get: op(id) } } }), id).toThrow(/reserved object key/);
    }
    expect(() => generateOps({ paths: { '/t': { get: op('getT') }, '/alias': { $ref: '#/paths/~1t' } } })).toThrow(/\$ref/);
    expect(() => generateOps({ paths: {} })).toThrow(/no operations/);
    expect(() => generateOps({})).toThrow(/no paths/);
  });
});
