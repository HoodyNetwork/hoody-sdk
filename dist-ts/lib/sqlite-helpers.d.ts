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
import type { SqlServiceBase } from '../generated/sqlite/sql.service.generated.js';
type TemplateVars = {
    projectId?: string;
    containerId?: string;
    serviceIndex?: string | number;
    serverName?: string;
    server?: string;
};
/** A value one placeholder binds: a JSON scalar. */
export type SqliteBindValue = string | number | boolean | null;
/**
 * Placeholder values: an array for positional `?`, an object for named `:name` / `@name` / `$name`.
 * Each value is a string, a finite number, a boolean or null; anything else (NaN, Infinity,
 * undefined, a bigint, bytes, a nested value) is refused with a ValidationError before sending.
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
        query<Row = Record<string, unknown>>(request: SqliteSqlRequest, templateVars?: TemplateVars): Promise<SqliteQueryResult<Row>>;
        /**
         * Run one SQL statement for its effect (CREATE, INSERT, UPDATE, DELETE)
         * and resolve to `{ rowsUpdated }`, no envelope. A write with RETURNING
         * resolves to `{ rowsUpdated, rows }`: the rows it returned, one per
         * changed row. Use `query` for a SELECT.
         */
        run<Row = Record<string, unknown>>(request: SqliteSqlRequest, templateVars?: TemplateVars): Promise<SqliteRunResult<Row>>;
    }
}
/** Attach `query` / `run` to the SqlService prototype (idempotent). */
export declare function patchSqliteHelpersPrototype(): void;
export {};
