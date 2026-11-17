// "Download the endpoint list (JSON)": the catalog the page holds, each operation reduced to the public
// index fields named in OP_EXPORT_KEYS (and BODY_EXPORT_KEYS / SDK_EXPORT_KEYS inside them). Built key by key from
// those lists, never by copying an operation, so a field later added to the catalog (a host, a description) stays out
// until it is named here; export.test.ts pins the lists. It never holds the account base, the services' hosts, the
// catalog's sources or any URL: the docs field is the docs route, as in the catalog.
import type { Catalog, CatalogOp } from './catalog';

export const OP_EXPORT_KEYS = ['id', 'service', 'tag', 'method', 'path', 'summary', 'pathParams', 'query', 'headers', 'body', 'auth', 'sdk', 'cli', 'deprecated', 'docs'] as const;
export const BODY_EXPORT_KEYS = ['type', 'required', 'optional'] as const;
export const SDK_EXPORT_KEYS = ['call', 'args'] as const;
/** The file's own keys around the list. */
export const LIST_EXPORT_KEYS = ['v', 'count', 'operations'] as const;

export const OP_LIST_FILE = 'hoody-api-operations.json';
/** Far above the whole catalog (about 1 MB as JSON); past it nothing is saved. */
export const OP_LIST_MAX_BYTES = 8 * 1024 * 1024;

type Plain = string | number | boolean | null | readonly Plain[] | { readonly [k: string]: Plain };
const pick = (from: object, keys: readonly string[]): Record<string, Plain> =>
  Object.fromEntries(keys.map((k) => [k, ((from as Record<string, unknown>)[k] ?? null) as Plain]));

function exportOp(o: CatalogOp): Record<string, Plain> {
  const row = pick(o, OP_EXPORT_KEYS);
  row.body = o.body ? pick(o.body, BODY_EXPORT_KEYS) : null;
  row.sdk = o.sdk ? pick(o.sdk, SDK_EXPORT_KEYS) : null;
  return row;
}

/** The operation list as the file holds it (an object; `opListText` writes it). */
export function opList(c: Pick<Catalog, 'ops'>): Record<string, Plain> {
  const operations = c.ops.map(exportOp);
  return pick({ v: 1, count: operations.length, operations }, LIST_EXPORT_KEYS);
}

export const opListText = (c: Pick<Catalog, 'ops'>): string => `${JSON.stringify(opList(c), null, 2)}\n`; // reason: the downloaded file, never shown
