// The API page's catalog: every operation of the published API once, as an index row.
//
// Contract, in plain words:
//   - catalog.gen.json is buildCatalog(<SDK generated/openapi.public.json, sdk-mappings.json, cli-mappings.json,
//     cli/commands/*.ts, lib/service-index-params.ts>, <the docs site's API page mapping>) as JSON (catalog.build.ts). hub/scripts/api-catalog-gen.ts writes it;
//     catalog.sync.test.ts (HUB_API_SYNC=1) compares it with the sources; HUB_API_CATALOG_REGEN=1 rewrites it.
//   - It holds no descriptions and no examples: ids, methods, paths, summaries, parameter names, the body's type and
//     required fields, the auth kind, the SDK call, the CLI command and the docs route. Every string in it passed the
//     public-text gate at generation (no development domain, no internal host, no "container").
//   - loadCatalog() is the only way in: the JSON is its own chunk, fetched when the API page opens, never before.

/** How a request is authorised. account: the account API with `Bearer $HOODY_TOKEN`. kit: a program on a computer,
 *  reached through its URL, never the account token. notes: the Notes program's own identity header. public: an
 *  account operation that needs no token (a named allowlist). */
export type AuthKind = 'account' | 'kit' | 'notes' | 'public';

export type BodyType = 'json' | 'multipart' | 'binary' | 'form' | 'text' | 'other';

export interface CatalogBody {
  readonly type: BodyType;
  /** The required top-level fields of a JSON body, in the spec's order. */
  readonly required: readonly string[];
  /** Those whose value is not a string: their placeholder is written bare (`{"rows":<rows>}`), so nothing runs until it
   *  is replaced with the real number, list or object, and no value is made up for it. */
  readonly bare?: readonly string[];
  /** The spec does not mark the body required. */
  readonly optional: boolean;
}

export interface CatalogSdk {
  /** The call from the client: `api.auth.tokens.create` (account) or `browser.instances.start` (one computer). */
  readonly call: string;
  /** Its arguments as its signature names them, in order; an optional one ends in `?` (`options?`). */
  readonly args: readonly string[];
}

export interface CatalogOp {
  readonly id: string;
  readonly service: string;
  /** The tag's name without its service prefix; null for an untagged operation. */
  readonly tag: string | null;
  /** Upper case: the HTTP methods, and the WebDAV and kit verbs of x-additional-paths (MKCOL, PROPFIND, ...). */
  readonly method: string;
  readonly path: string;
  /** The path the program itself serves, where the merged spec key differs (exec `/{path}`). */
  readonly originalPath: string | null;
  /** Other methods the same endpoint accepts (a PATCH twin folded under PUT). */
  readonly also: readonly string[] | null;
  readonly summary: string | null;
  readonly pathParams: readonly string[];
  readonly query: readonly string[];
  readonly headers: readonly string[];
  readonly body: CatalogBody | null;
  readonly auth: AuthKind;
  /** The spec declares no security for this account operation: the snippet still sends the token, with a note. */
  readonly authUndeclared: boolean;
  /** Its host among its service's `hosts`; null for the account API, and for a program operation whose host is not
   *  known (no template of its own, and its siblings disagree): it shows no snippet. */
  readonly host: number | null;
  /** The required query parameter that names the program's instance (`terminal_id`, `id`), or null. The proxy overwrites
   *  it with the host's own index, so a plain request to the first instance's host would act on the first instance
   *  whatever it asked for: this operation has no plain HTTP snippet. */
  readonly instanceBy: string | null;
  readonly sdk: CatalogSdk | null;
  readonly cli: string | null;
  readonly deprecated: boolean;
  /** The docs page route (`/api/projects/`), or null for an operation on the named no-docs allowlist. */
  readonly docs: string | null;
}

/** A program's host on a computer: `<project>-<computer>-<seg>[-<instance>].<server>.<computers domain>`. */
export interface CatalogHost {
  /** The host label (`browser`, `n` for notifications, `logs` for proxy logs). */
  readonly seg: string;
  /** Whether the host carries an instance number (`-1`): every program but egress. */
  readonly indexed: boolean;
}

export interface CatalogService {
  readonly id: string;
  /** The distinct hosts its operations declare; empty for the account API. */
  readonly hosts: readonly CatalogHost[];
}

export interface Catalog {
  readonly v: 1;
  readonly sources: Readonly<Record<'spec' | 'sdkMappings' | 'cliMappings' | 'cliCommands' | 'indexParams' | 'docsMapping', string>>;
  /** The account API's base URL. */
  readonly accountBase: string;
  /** The Notes identity header the notes snippets name (from its security scheme), with a placeholder value. */
  readonly notesAuth: { readonly name: string; readonly prefix: string };
  readonly counts: { readonly ops: number; readonly folded: number; readonly noSdk: number };
  readonly services: readonly CatalogService[];
  readonly ops: readonly CatalogOp[];
}

/** catalog.gen.json: the catalog with every operation as a row of COLS (no repeated keys), its tags and docs routes
 *  as indexes into their own lists, the two fields that follow from others (service: the operationId prefix;
 *  pathParams: the path's `{name}`s) left out, and instanceBy, set on few rows, as its own map. unpackCatalog(packCatalog(c)) equals c. */
export interface PackedCatalog extends Omit<Catalog, 'ops'> {
  readonly cols: readonly string[];
  readonly tags: readonly string[];
  readonly docs: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  readonly instanceBy: Readonly<Record<string, string>>;
}

const COLS = ['id', 'tag', 'method', 'path', 'originalPath', 'also', 'summary', 'query', 'headers', 'body', 'auth', 'authUndeclared', 'host', 'sdk', 'cli', 'deprecated', 'docs'] as const;
type Col = (typeof COLS)[number];

export const serviceOfId = (id: string): string => id.slice(0, Math.max(0, id.indexOf('_')));
const pathParamsOf = (path: string): string[] => [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);

export function packCatalog(c: Catalog): PackedCatalog {
  const tags = [...new Set(c.ops.map((o) => o.tag).filter((t): t is string => t !== null))].sort();
  const docs = [...new Set(c.ops.map((o) => o.docs).filter((d): d is string => d !== null))].sort();
  const rows = c.ops.map((o) => COLS.map((k) => (k === 'tag' ? (o.tag === null ? null : tags.indexOf(o.tag)) : k === 'docs' ? (o.docs === null ? null : docs.indexOf(o.docs)) : o[k as Exclude<Col, 'tag' | 'docs'>])));
  const { ops: _ops, ...rest } = c;
  const instanceBy = Object.fromEntries(c.ops.flatMap((o) => (o.instanceBy === null ? [] : [[o.id, o.instanceBy]])));
  return { ...rest, cols: COLS, tags, docs, rows, instanceBy };
}

export function unpackCatalog(p: PackedCatalog): Catalog {
  if (p.v !== 1 || p.cols.join() !== COLS.join()) throw new Error('api catalog: unknown format');
  const { cols: _c, tags, docs, rows, instanceBy, ...rest } = p;
  const ops = rows.map((r) => {
    const o = Object.fromEntries(COLS.map((k, i) => [k, r[i]])) as Record<Col, unknown>;
    const id = o.id as string, path = o.path as string;
    return {
      ...o,
      service: serviceOfId(id),
      pathParams: pathParamsOf(path),
      instanceBy: instanceBy[id] ?? null,
      tag: o.tag === null ? null : tags[o.tag as number]!,
      docs: o.docs === null ? null : docs[o.docs as number]!,
    } as unknown as CatalogOp;
  });
  return { ...rest, ops };
}

/** The catalog, as its own chunk: the API page is its only importer. */
export const loadCatalog = (): Promise<Catalog> => import('./catalog.gen.json').then((m) => unpackCatalog((m as { default: unknown }).default as PackedCatalog));
