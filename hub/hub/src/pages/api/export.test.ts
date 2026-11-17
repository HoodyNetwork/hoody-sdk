// The operation list download carries only public catalog fields, named by an allow-list, so it cannot grow
// descriptions, hosts or internal URLs later. It is built from the catalog the page holds (catalog.gen.json).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unpackCatalog, type Catalog, type CatalogOp, type PackedCatalog } from './catalog';
import { BODY_EXPORT_KEYS, LIST_EXPORT_KEYS, OP_EXPORT_KEYS, opList, opListText, SDK_EXPORT_KEYS } from './export';

const catalog: Catalog = unpackCatalog(JSON.parse(readFileSync(path.resolve(__dirname, 'catalog.gen.json'), 'utf8')) as PackedCatalog);
const file = JSON.parse(opListText(catalog)) as { v: number; count: number; operations: Record<string, unknown>[] };

describe('the operation list download', () => {
  it('the allow-lists are exactly these keys (a new key is a reviewed change here)', () => {
    expect([...LIST_EXPORT_KEYS]).toEqual(['v', 'count', 'operations']);
    expect([...OP_EXPORT_KEYS]).toEqual(['id', 'service', 'tag', 'method', 'path', 'summary', 'pathParams', 'query', 'headers', 'body', 'auth', 'sdk', 'cli', 'deprecated', 'docs']);
    expect([...BODY_EXPORT_KEYS]).toEqual(['type', 'required', 'optional']);
    expect([...SDK_EXPORT_KEYS]).toEqual(['call', 'args']);
  });

  it('every operation of the catalog, once, in its order, with only allow-listed keys at every level', () => {
    expect(Object.keys(file)).toEqual([...LIST_EXPORT_KEYS]);
    expect(file.count).toBe(catalog.ops.length);
    expect(file.operations.map((o) => o.id)).toEqual(catalog.ops.map((o) => o.id));
    for (const o of file.operations) {
      expect(Object.keys(o)).toEqual([...OP_EXPORT_KEYS]);
      if (o.body !== null) expect(Object.keys(o.body as object)).toEqual([...BODY_EXPORT_KEYS]);
      if (o.sdk !== null) expect(Object.keys(o.sdk as object)).toEqual([...SDK_EXPORT_KEYS]);
    }
  });

  it('a field added to the catalog later does not reach the file (a description, a host, a URL)', () => {
    const op = { ...catalog.ops[0]!, description: 'internal words', host: 3, url: 'https://internal.example/x', body: { type: 'json', required: [], optional: false, example: '{}' }, sdk: { call: 'a.b', args: [], internal: 'x' } } as unknown as CatalogOp;
    const [row] = (opList({ ops: [op] }).operations as Record<string, unknown>[]);
    expect(Object.keys(row!)).toEqual([...OP_EXPORT_KEYS]);
    expect(JSON.stringify(row)).not.toMatch(/internal|example/);
  });

  it('no address of any kind: not the account base, no service host, no scheme, no proxy domain, no catalog sources', () => {
    const text = opListText(catalog);
    expect(text).not.toContain(catalog.accountBase);
    expect(text).not.toMatch(/:\/\//);
    expect(text).not.toMatch(/hoody\.(?!com\b)[a-z]{2,}(?![a-z0-9(_-]|\.[a-z])|localhost|127\.0\.0\.1/);
    for (const s of Object.values(catalog.sources)) if (s.length > 8) expect(text).not.toContain(s);
    // As keys (a query parameter may well be named `host`: that is the API's own word, not an address).
    expect(text).not.toMatch(/"(hosts|accountBase|sources|notesAuth|host|instanceBy|originalPath|description|example)":/);
  });
});

describe('method colours', () => {
  it('existing Tag tones only: GET ok, POST accent, DELETE warn, the rest neutral', async () => {
    const { methodTone } = await import('./words');
    expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'MKCOL', 'PROPFIND'].map(methodTone)).toEqual(['ok', 'accent', 'neutral', 'neutral', 'warn', 'neutral', 'neutral']);
  });
});
