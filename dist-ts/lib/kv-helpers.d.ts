/**
 * SQLite KV helpers on the sqlite namespace: `kv.read`, and the object
 * form of the KV calls that take a key.
 *
 * `box.sqlite.kv.read(key, { db })` resolves to the stored value itself:
 * the parsed JSON for a JSON value (`set(key, { a: 1 }, { db })` reads back
 * `{ a: 1 }`), a string for a text value, an ArrayBuffer for bytes. No
 * `{ statusCode, message, data }` envelope, so a stored object that happens to
 * have a `data` key is returned as stored. It is `get` with the body taken as
 * is (`rawResponse`), the way `files.readJson` / `readText` read a file.
 *
 * A key that does not exist rejects with the ApiError of `get`
 * (`err.status === 404`), as `files.readJson` does for a missing file.
 *
 * Object form. `list({ db, prefix })` takes one options object while `get`,
 * `set`, `delete` and the other key calls take the key first, and callers
 * guess the object form for all of them (`get({ db, key })` was refused with
 * "db is required"). Each key call, and `read`, also accepts its arguments as
 * one object: `{ key, ...options }`, plus `value` for `set` and `push` (and an
 * optional one for `remove`). It sends the same request as the
 * positional call. The object form leaves out `rawResponse` and
 * `responseType`, which choose what the call resolves to: pass those
 * positionally. The batch calls and `list` keep their shapes.
 *
 * The object forms of the generated calls are typed on the client's
 * `sqlite.kv` (`SqliteKvStore`), not on KvService: declaring them on
 * the class would widen its methods, and a consumer subclass that overrides
 * one with the positional signature (or a mock typed from the class) would no
 * longer compile. `read` is new, so it carries both forms on the class.
 *
 * Same declare-module + prototype-patch pattern as lib/files-service-extensions.ts.
 */
import { KvService } from '../generated/sqlite/kv.service.js';
import type { KvServiceBase } from '../generated/sqlite/kv.service.generated.js';
type GetOptions = Parameters<KvServiceBase['get']>[1];
type GetTarget = Parameters<KvServiceBase['get']>[2];
/**
 * The options of `kv.read`: those of `kv.get` (`db` required; `table`,
 * `path`, `at_timestamp`, request options), without the response-shape options,
 * which `read` sets itself.
 */
export type KvReadOptions = Omit<GetOptions, 'rawResponse' | 'responseType'>;
/** The response-shape options, which only the positional form takes. */
type ShapeOptions = 'rawResponse' | 'responseType';
/** The KV calls whose positional form is `(key, options, templateVars?)`. */
export type KvKeyMethod = 'get' | 'delete' | 'exists' | 'increment' | 'decrement' | 'pop' | 'listHistory' | 'rollback' | 'getSnapshot';
/** The KV calls whose positional form is `(key, value, options, templateVars?)`. */
export type KvKeyValueMethod = 'set' | 'push' | 'remove';
/** The object form of a key call: `{ key, ...options }`, e.g. `get({ db: 'app', key: 'prefs' })`. */
export type KvKeyArgs<M extends KvKeyMethod> = {
    key: string;
} & Omit<Parameters<KvServiceBase[M]>[1], ShapeOptions>;
/**
 * The object form of `set`, `push` and `remove`: `{ key, value, ...options }`.
 * `value` is what `set` stores and `push` appends (the request body). For
 * `remove` it is the element to remove, any JSON value: the call sends the
 * kit's `{ value }` body for it (an explicit null included), and none without it,
 * where the `index` option picks the element.
 */
export type KvKeyValueArgs<M extends KvKeyValueMethod> = (M extends 'remove' ? {
    key: string;
    value?: unknown;
} : {
    key: string;
    value: Parameters<KvServiceBase[M]>[1];
}) & Omit<Parameters<KvServiceBase[M]>[2], ShapeOptions>;
/** The object form of `read`: `{ key, ...options }`. */
export type KvReadArgs = {
    key: string;
} & KvReadOptions;
type KeyTarget<M extends KvKeyMethod> = Parameters<KvServiceBase[M]>[2];
type KeyValueTarget<M extends KvKeyValueMethod> = Parameters<KvServiceBase[M]>[3];
/** The object form of each generated key call, e.g. `get({ db: 'app', key: 'prefs' })`. */
export interface KvStoreObjectForms {
    get(args: KvKeyArgs<'get'>, templateVars?: KeyTarget<'get'>): ReturnType<KvServiceBase['get']>;
    delete(args: KvKeyArgs<'delete'>, templateVars?: KeyTarget<'delete'>): ReturnType<KvServiceBase['delete']>;
    exists(args: KvKeyArgs<'exists'>, templateVars?: KeyTarget<'exists'>): ReturnType<KvServiceBase['exists']>;
    increment(args: KvKeyArgs<'increment'>, templateVars?: KeyTarget<'increment'>): ReturnType<KvServiceBase['increment']>;
    decrement(args: KvKeyArgs<'decrement'>, templateVars?: KeyTarget<'decrement'>): ReturnType<KvServiceBase['decrement']>;
    pop(args: KvKeyArgs<'pop'>, templateVars?: KeyTarget<'pop'>): ReturnType<KvServiceBase['pop']>;
    listHistory(args: KvKeyArgs<'listHistory'>, templateVars?: KeyTarget<'listHistory'>): ReturnType<KvServiceBase['listHistory']>;
    rollback(args: KvKeyArgs<'rollback'>, templateVars?: KeyTarget<'rollback'>): ReturnType<KvServiceBase['rollback']>;
    getSnapshot(args: KvKeyArgs<'getSnapshot'>, templateVars?: KeyTarget<'getSnapshot'>): ReturnType<KvServiceBase['getSnapshot']>;
    set(args: KvKeyValueArgs<'set'>, templateVars?: KeyValueTarget<'set'>): ReturnType<KvServiceBase['set']>;
    push(args: KvKeyValueArgs<'push'>, templateVars?: KeyValueTarget<'push'>): ReturnType<KvServiceBase['push']>;
    remove(args: KvKeyValueArgs<'remove'>, templateVars?: KeyValueTarget<'remove'>): ReturnType<KvServiceBase['remove']>;
}
/**
 * The type of `client.sqlite.kv`: KvService with the object form of
 * each key call ahead of its positional form, so `Parameters` / `ReturnType`
 * still read the positional one. Assignable to KvService.
 */
export type SqliteKvStore = KvStoreObjectForms & KvService;
declare module '../generated/sqlite/kv.service.js' {
    interface KvService {
        /**
         * The value stored under `key`, as stored: parsed JSON, a string, or an
         * ArrayBuffer for bytes. A missing key rejects with the ApiError of `get`
         * (`err.status === 404`).
         *
         *   const prefs = await box.sqlite.kv.read('prefs:ada', { db: 'app' });
         */
        read<T = unknown>(key: string, options: KvReadOptions, templateVars?: GetTarget): Promise<T>;
        /** `read({ db, key, ...options })`: the object form of `read(key, { db, ...options })`. */
        read<T = unknown>(args: KvReadArgs, templateVars?: GetTarget): Promise<T>;
    }
}
/**
 * Attach `read`, and the object form of the key calls, to the KvService
 * prototype (idempotent). The generated methods stay as they are; the object
 * form forwards to them positionally.
 */
export declare function patchKvHelpersPrototype(): void;
export {};
