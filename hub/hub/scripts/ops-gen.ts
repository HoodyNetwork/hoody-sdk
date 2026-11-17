// The Hoody API operations catalogue: the SDK's public spec (generated/openapi.public.json) → core/ops.gen.ts.
// The public spec holds every Hoody service; the Hoody API's own operations are the ones whose id starts with `api_`
// (publicApiOperations keeps those and drops the prefix), so the catalogue never names an operation that is not published.
// generateOps is pure (no file access): core/ops.gen.test.ts fails when the committed file no longer matches the spec
// and writes it again with HUB_OPS_REGEN=1. `bun hub/scripts/ops-gen.ts` does the same write from the command line.
//
// Output: OperationId (every operationId), OpMethod, OPS (each id's method/path pairs, paths spelled as published) and
// OPS_INPUT_SHA, the sha256 of the operation set only ([id, METHOD, path] triples, sorted), so a description or schema
// edit never makes the catalogue stale; only adding, removing or renaming an operation does.
// Fails closed: a missing or odd operationId, a method outside the five, a path with characters a literal could not hold
// as written, or one (method, path) under two ids (trailing '/' ignored when comparing) throws and nothing is written.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const ID_RE = /^[A-Za-z_$][\w$]*$/;
const PATH_RE = /^\/[A-Za-z0-9_\-{}/.:~]*$/;
// Names an object already answers to (Object.prototype members, prototype): as OPS keys they would set the prototype or
// shadow an Object member. Refused here, and OPS is emitted with a null prototype as well.
const RESERVED_IDS = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

type Triple = [id: string, method: string, path: string];

function triples(spec: unknown): Triple[] {
  const paths = (spec as { paths?: unknown } | null)?.paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) throw new Error('ops-gen: the openapi has no paths object');
  const out: Triple[] = [];
  const seen = new Map<string, string>();
  for (const [p, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!PATH_RE.test(p)) throw new Error(`ops-gen: path ${JSON.stringify(p)} has characters outside ${PATH_RE}`);
    if (!item || typeof item !== 'object') throw new Error(`ops-gen: path ${p} is not an object`);
    for (const [m, op] of Object.entries(item as Record<string, unknown>)) {
      const method = m.toUpperCase();
      // A referenced Path Item would hide its operations from the catalogue: refuse it until ops-gen resolves $ref.
      if (method === '$REF') throw new Error(`ops-gen: path ${p} is a $ref Path Item, which ops-gen does not resolve`);
      if (['PARAMETERS', 'SUMMARY', 'DESCRIPTION', 'SERVERS'].includes(method) || m.startsWith('x-')) continue;
      if (!(OP_METHODS as readonly string[]).includes(method)) throw new Error(`ops-gen: ${m} ${p} uses a method outside ${OP_METHODS.join('/')}`);
      const id = (op as { operationId?: unknown } | null)?.operationId;
      if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`ops-gen: ${method} ${p} has no usable operationId (${JSON.stringify(id)})`);
      if (RESERVED_IDS.has(id)) throw new Error(`ops-gen: ${method} ${p} has operationId ${id}, a reserved object key`);
      const key = `${method} ${p.length > 1 ? p.replace(/\/+$/, '') : p}`;
      const other = seen.get(key);
      if (other !== undefined) throw new Error(`ops-gen: ${key} is published twice (${other}, ${id})`);
      seen.set(key, id);
      out.push([id, method, p]);
    }
  }
  if (out.length === 0) throw new Error('ops-gen: the openapi has no operations');
  return out;
}

const API_ID_PREFIX = 'api_';

/** The Hoody API's part of the public spec: the operations whose id starts with `api_`, under the id without that prefix. */
export function publicApiOperations(spec: unknown): { paths: Record<string, Record<string, unknown>> } {
  const paths = (spec as { paths?: unknown } | null)?.paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) throw new Error('ops-gen: the public spec has no paths object');
  const out: Record<string, Record<string, unknown>> = {};
  for (const [p, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') continue;
    for (const [m, op] of Object.entries(item as Record<string, unknown>)) {
      const id = (op as { operationId?: unknown } | null)?.operationId;
      if (typeof id === 'string' && id.startsWith(API_ID_PREFIX)) (out[p] ??= {})[m] = { operationId: id.slice(API_ID_PREFIX.length) };
    }
  }
  return { paths: out };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const q = (s: string): string => `'${s}'`;

/** The text of core/ops.gen.ts for an openapi document. */
export function generateOps(spec: unknown): string {
  const all = triples(spec).sort((a, b) => cmp(a[0], b[0]) || cmp(a[2], b[2]) || cmp(a[1], b[1]));
  const sha = createHash('sha256').update(JSON.stringify(all)).digest('hex');
  const byId = new Map<string, Triple[]>();
  for (const t of all) byId.set(t[0], [...(byId.get(t[0]) ?? []), t]);
  const ids = [...byId.keys()];
  return [
    '// Generated by hub/scripts/ops-gen.ts from the public Hoody API spec (hoody-sdk generated/openapi.public.json): regenerate (HUB_OPS_REGEN=1 bun run hub:vitest hub/src/core/ops.gen.test.ts),',
    '// never edit by hand. Every Hoody API operation by operationId, with each method/path pair it is published under.',
    '',
    `export type OpMethod = ${OP_METHODS.map(q).join(' | ')};`,
    '',
    'export type OperationId =',
    ...ids.map((id, i) => `  | ${q(id)}${i === ids.length - 1 ? ';' : ''}`),
    '',
    '/** sha256 of the sorted [operationId, METHOD, path] triples this file was generated from. */',
    `export const OPS_INPUT_SHA = ${q(sha)};`,
    '',
    'type OpsTable = Readonly<Record<OperationId, readonly (readonly [OpMethod, string])[]>>;',
    '',
    'const TABLE: OpsTable = {',
    ...ids.map((id) => `  ${id}: [${(byId.get(id) ?? []).map((t) => `[${q(t[1])}, ${q(t[2])}]`).join(', ')}],`),
    '};',
    '',
    '/** Every operation by operationId. Null prototype: no id can reach or shadow an Object member. */',
    'export const OPS: OpsTable = Object.assign(Object.create(null) as object, TABLE);',
    '',
  ].join('\n');
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OPS_GEN_FILE = path.join(HERE, '..', 'src', 'core', 'ops.gen.ts');
export const OPENAPI_FILE = path.join(HERE, '..', '..', '..', 'generated', 'openapi.public.json');

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = generateOps(publicApiOperations(JSON.parse(fs.readFileSync(OPENAPI_FILE, 'utf8'))));
  fs.writeFileSync(OPS_GEN_FILE, text);
  console.log(`ops-gen: wrote ${path.relative(process.cwd(), OPS_GEN_FILE)}`);
}
