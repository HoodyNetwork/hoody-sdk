/**
 * SQLite SQL helpers — `sql.query` and `sql.run` on the sqlite namespace.
 *
 * `box.sqlite.sql.query({ db, sql, params })` resolves to
 * `{ rows, columns, truncated }` and `box.sqlite.sql.run({ db, sql, params })`
 * to `{ rowsUpdated }`: plain values, no `{ statusCode, message, data }`
 * envelope. Both send ONE item through `sql.runTransaction`
 * (`POST /api/v1/sqlite/db`): `query` a `query` item, the kit's form that
 * answers rows (a SELECT, or a write with RETURNING), and `run` a `statement`
 * item, which answers the count of changed rows. `sql.query` is this POST helper
 * (writes with RETURNING allowed); the restricted read-only GET is the generated
 * `sql.queryReadOnly`. A statement whose SQL
 * produces columns (a write with RETURNING) is answered with its rows
 * instead, so `run` then resolves to `{ rowsUpdated, rows }`, one row per
 * changed row. The kit's own query/statement split is unchanged; these only
 * name it.
 *
 * Same declare-module + prototype-patch pattern as lib/files-service-extensions.ts.
 * The methods live on the SqlService prototype and send through the service's own
 * `runTransaction`, so a client needs no per-instance wiring.
 */

import { SqlService } from '../generated/sqlite/sql.service.js';
import type { SqlServiceBase } from '../generated/sqlite/sql.service.generated.js';
import type { main_requestItem, main_responseItem } from '../generated/types.js';
import { ValidationError } from '../generated/errors.js';

const SQLITE_HELPERS_PATCH_MARKER = Symbol.for('hoody.sdk.sqlite.sql.helpers');

type TemplateVars = {
  projectId?: string;
  containerId?: string;
  serviceIndex?: string | number;
  serverName?: string;
  server?: string;
};

/** A value one placeholder binds: a JSON scalar, or a bigint for an INTEGER past 2^53-1. */
export type SqliteBindValue = string | number | bigint | boolean | null;

/**
 * Placeholder values: an array for positional `?`, an object for named `:name` / `@name` / `$name`.
 * Each value is a string, a finite number, a bigint within the signed 64-bit INTEGER range, a
 * boolean or null; anything else (NaN, Infinity, undefined, a wider bigint, bytes, a nested
 * value) is refused with a ValidationError before sending.
 */
export type SqliteParams = readonly SqliteBindValue[] | Record<string, SqliteBindValue>;

type TransactionOptions = Parameters<SqlServiceBase['runTransaction']>[1];

/**
 * The request of `sql.query` / `sql.run`. `db` and `sql` are required.
 * The other keys are the options of `sql.runTransaction`
 * (`create_db_if_missing`, `timeout`, and per-call request options).
 */
export type SqliteSqlRequest = Omit<TransactionOptions, 'db' | 'rawResponse' | 'responseType' | 'cache'> & {
  /** A bare name (`'app'` → `/hoody/databases/app.db`) or a path. */
  db: string;
  /** One SQL statement. */
  sql: string;
  /** Placeholder values. */
  params?: SqliteParams | null;
  /** The kit's name for `params`; give one of the two. */
  values?: SqliteParams | null;
};

/** What `sql.query` resolves to. */
export interface SqliteQueryResult<Row = Record<string, unknown>> {
  /** One object per row, keyed by column name. Empty when nothing matched. */
  rows: Row[];
  /** The column names, in order. */
  columns: string[];
  /** True when the kit stopped at its row cap: `rows` is not the whole result. */
  truncated: boolean;
}

/** What `sql.run` resolves to. */
export interface SqliteRunResult<Row = Record<string, unknown>> {
  /** Rows the statement changed. */
  rowsUpdated: number;
  /**
   * The rows a write with RETURNING returned, one per changed row; absent for
   * a statement that returns none. `rowsUpdated` is then their count.
   */
  rows?: Row[];
  /**
   * Set when the kit stopped returning rows at its row cap: `rows` and
   * `rowsUpdated` then count only the rows it returned.
   */
  truncated?: true;
}

declare module '../generated/sqlite/sql.service.js' {
  interface SqlService {
    /**
     * Run one SQL statement that answers rows (a SELECT, or a write with
     * RETURNING) and resolve to `{ rows, columns, truncated }`, no envelope.
     * `db` is required; the database must exist, or pass
     * `create_db_if_missing: true`. Kit errors reject with the `ApiError`.
     * The restricted read-only GET form is `queryReadOnly`.
     */
    query<Row = Record<string, unknown>>(
      request: SqliteSqlRequest,
      templateVars?: TemplateVars,
    ): Promise<SqliteQueryResult<Row>>;
    /**
     * Run one SQL statement for its effect (CREATE, INSERT, UPDATE, DELETE)
     * and resolve to `{ rowsUpdated }`, no envelope. A write with RETURNING
     * resolves to `{ rowsUpdated, rows }`: the rows it returned, one per
     * changed row. Use `query` for a SELECT.
     */
    run<Row = Record<string, unknown>>(request: SqliteSqlRequest, templateVars?: TemplateVars): Promise<SqliteRunResult<Row>>;
  }
}

type ItemKind = 'query' | 'statement';

/** sqlite's INTEGER is a signed 64-bit value: a bigint past either end has no column form. */
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

function describeBinding(value: unknown): string {
  if (value === undefined) return 'undefined (pass null for SQL NULL)';
  if (typeof value === 'number') return `${value} (JSON would send it as null)`;
  if (typeof value === 'bigint') return `${value}n, outside the 64-bit INTEGER range (pass a string to store it as text)`;
  if (typeof value !== 'object' || value === null) return typeof value;
  if (ArrayBuffer.isView(value) || Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return 'bytes (the kit binds JSON values only, no blobs)';
  }
  return Array.isArray(value) ? 'an array' : 'an object';
}

/**
 * Each placeholder value must be one the kit binds as sent: a string, a
 * finite number, a bigint inside sqlite's signed 64-bit INTEGER, a boolean or
 * null. The client writes a bigint in the JSON body as an integer, and
 * returns an INTEGER above 2^53-1 as one, so a value read back binds again.
 * The kit reads `values` as JSON
 * (hoody-sqlite raw2params), and JSON.stringify turns NaN and Infinity into
 * null and drops an undefined key, so an INSERT would store NULL without an
 * error; a nested value or bytes would bind as a JSON array or map.
 */
function checkBindings(label: string, field: 'params' | 'values', bind: unknown): void {
  const tag = Object.prototype.toString.call(bind);
  if (!Array.isArray(bind) && tag !== '[object Object]') {
    throw new ValidationError(`${label}: ${field} must be an array (for ?) or an object (for :name)`, field);
  }
  const entries: Array<[string, unknown]> = Array.isArray(bind)
    ? bind.map((v, i): [string, unknown] => [`[${i}]`, v])
    : Object.keys(bind as object).map((k): [string, unknown] => [
      /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`,
      (bind as Record<string, unknown>)[k],
    ]);
  for (const [slot, v] of entries) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
    if (typeof v === 'number' && Number.isFinite(v)) continue;
    if (typeof v === 'bigint' && v >= INT64_MIN && v <= INT64_MAX) continue;
    throw new ValidationError(
      `${label}: ${field}${slot} must be a string, a finite number, a bigint, a boolean or null, got ${describeBinding(v)}`,
      field,
    );
  }
}

async function sendOne(
  sql: Pick<SqlServiceBase, 'runTransaction'>,
  method: 'query' | 'run',
  kind: ItemKind,
  request: SqliteSqlRequest,
  templateVars: TemplateVars | undefined,
): Promise<main_responseItem> {
  const label = `sqlite.sql.${method}`;
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new ValidationError(`${label} takes one object: ${label}({ db: 'app', sql: '…', params: [] })`);
  }
  const { sql: statement, params, values, ...rest } = request as SqliteSqlRequest & { query?: unknown; statement?: unknown };
  const misplaced = (['query', 'statement'] as const).find((k) => k in rest);
  if (misplaced) {
    throw new ValidationError(`${label}: pass the SQL as \`sql\`, not \`${misplaced}\``, misplaced);
  }
  if (typeof rest.db !== 'string' || rest.db === '') {
    throw new ValidationError(`${label}: db is required, a bare name ('app') or a path`, 'db');
  }
  if (typeof statement !== 'string' || statement.trim() === '') {
    throw new ValidationError(`${label}: sql is required`, 'sql');
  }
  if (params != null && values != null) {
    throw new ValidationError(`${label}: give params or values, not both`, 'params');
  }
  const bind = params ?? values;
  if (bind != null) checkBindings(label, params != null ? 'params' : 'values', bind);

  const item = kind === 'query' ? { query: statement } : { statement };
  const response = await sql.runTransaction(
    { transaction: [bind == null ? item : {
      ...item,
      // The generated type lists the JSON scalars; a bigint goes out as a JSON integer.
      values: bind as NonNullable<main_requestItem['values']>,
    }] },
    // Forced after the caller's options: the result is read from the envelope.
    { ...rest, rawResponse: false, responseType: 'json' },
    templateVars,
  );
  const results = (response as { data?: { results?: unknown } } | undefined)?.data?.results;
  const first = Array.isArray(results) ? (results[0] as main_responseItem | undefined) : undefined;
  if (!first || typeof first !== 'object') {
    throw new Error(`${label}: malformed response, no results[0] in the answer of POST /api/v1/sqlite/db`);
  }
  if (first.success === false || first.error) {
    throw Object.assign(new Error(`${label}: ${first.error ?? 'the statement failed'}`), {
      code: first.code,
      item: first,
    });
  }
  return first;
}

async function query<Row = Record<string, unknown>>(
  this: Pick<SqlServiceBase, 'runTransaction'>,
  request: SqliteSqlRequest,
  templateVars?: TemplateVars,
): Promise<SqliteQueryResult<Row>> {
  const item = await sendOne(this, 'query', 'query', request, templateVars);
  if (!Array.isArray(item.resultSet)) {
    throw new Error('sqlite.sql.query: malformed response, results[0] has no resultSet');
  }
  return {
    rows: item.resultSet as Row[],
    // The kit omits an empty header list.
    columns: Array.isArray(item.resultHeaders) ? item.resultHeaders : [],
    truncated: item.truncated === true,
  };
}

async function run<Row = Record<string, unknown>>(
  this: Pick<SqlServiceBase, 'runTransaction'>,
  request: SqliteSqlRequest,
  templateVars?: TemplateVars,
): Promise<SqliteRunResult<Row>> {
  const item = await sendOne(this, 'run', 'statement', request, templateVars);
  // The kit answers a statement whose SQL produces columns (INSERT/UPDATE/DELETE
  // … RETURNING) with its rows, like a query, and no rowsUpdated.
  if (Array.isArray(item.resultSet) && typeof item.rowsUpdated !== 'number') {
    const rows = item.resultSet as Row[];
    return item.truncated === true ? { rowsUpdated: rows.length, rows, truncated: true } : { rowsUpdated: rows.length, rows };
  }
  if (typeof item.rowsUpdated !== 'number') {
    throw new Error('sqlite.sql.run: malformed response, results[0] has no rowsUpdated');
  }
  return { rowsUpdated: item.rowsUpdated };
}

/** Attach `query` / `run` to the SqlService prototype (idempotent). */
export function patchSqliteHelpersPrototype(): void {
  const proto = SqlService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[SQLITE_HELPERS_PATCH_MARKER]) return;
  proto.query = query;
  proto.run = run;
  proto[SQLITE_HELPERS_PATCH_MARKER] = true;
}

patchSqliteHelpersPrototype();
