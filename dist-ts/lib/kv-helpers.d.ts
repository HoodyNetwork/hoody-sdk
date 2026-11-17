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
 * one object: `{ key, ...options }`, plus `value` for `set` and `kv.arrays.push`
 * (and an optional one for `kv.arrays.remove`). It sends the same request as the
 * positional call. The object form leaves out `rawResponse` and
 * `responseType`, which choose what the call resolves to: pass those
 * positionally. The batch calls and `list` keep their shapes.
 *
 * `set` stores every JS value as JSON. A string is sent quoted under
 * `application/json`, so it reads back as the same string (`''` included),
 * can be written at a `path`, and `'123'` stays a string. The generated call
 * labelled a string `text/plain`, which the kit stores verbatim and refuses at
 * a `path`. Raw text is still one option away: `contentType: 'text/plain'`,
 * or a `Content-Type` in `headers`.
 *
 * `exists` answers a boolean: true, or false when the kit answers 404. The
 * generated HEAD call (now the protected `__exists`) rejected a missing key
 * with an ApiError, so "no" had to be caught. Any other failure still rejects.
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
import { KvArraysService } from '../generated/sqlite/kv-arrays.service.js';
import type { KvArraysServiceBase } from '../generated/sqlite/kv-arrays.service.generated.js';
import type { KvTableService } from '../generated/sqlite/kv-table.service.js';
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
/**
 * The options of `kv.exists`: those of the HEAD request (`db` required;
 * `table`, `timeout`, request options), without the response-shape options:
 * the answer is a boolean.
 */
export type KvExistsOptions = Omit<Parameters<KvServiceBase['__exists']>[1], ShapeOptions>;
type ExistsTarget = Parameters<KvServiceBase['__exists']>[2];
/**
 * The options of a raw-text `kv.set`: those of `set`, with the media type the
 * string is stored under (`text/plain`, `text/markdown`, ...). Without
 * `contentType` a string is stored as a JSON string.
 */
export type KvSetTextOptions = Omit<Parameters<KvServiceBase['set']>[2], 'contentType'> & {
    contentType: string;
};
/** The KV calls whose positional form is `(key, options, templateVars?)`. */
export type KvKeyMethod = 'get' | 'delete' | 'exists' | 'increment' | 'decrement' | 'listHistory' | 'rollback' | 'getSnapshot';
/** The `kv.arrays` calls whose positional form is `(key, options, templateVars?)`. */
export type KvArraysKeyMethod = 'pop';
/** The `kv.arrays` calls whose positional form is `(key, value, options, templateVars?)`. */
export type KvArraysKeyValueMethod = 'push' | 'remove';
/** The positional form of a key call: the generated one, or the hand-written `exists`. */
type KvKeyCall<M extends KvKeyMethod> = M extends 'exists' ? (key: string, options: KvExistsOptions, templateVars?: ExistsTarget) => Promise<boolean> : KvServiceBase[Exclude<M, 'exists'>];
/** The KV calls whose positional form is `(key, value, options, templateVars?)`. */
export type KvKeyValueMethod = 'set';
/** The object form of a key call: `{ key, ...options }`, e.g. `get({ db: 'app', key: 'prefs' })`. */
export type KvKeyArgs<M extends KvKeyMethod> = {
    key: string;
} & Omit<Parameters<KvKeyCall<M>>[1], ShapeOptions>;
/**
 * The object form of `set`: `{ key, value, ...options }`. `value` is what `set` stores (the request body).
 * A string value may name its own media type (raw text); every other value is JSON or bytes.
 */
export type KvKeyValueArgs<M extends KvKeyValueMethod> = {
    key: string;
    value: Parameters<KvServiceBase[M]>[1];
} & Omit<Parameters<KvServiceBase[M]>[2], ShapeOptions | 'contentType'> & {
    contentType?: string;
};
/** The object form of `kv.arrays.pop`: `{ key, ...options }`. */
export type KvArraysKeyArgs<M extends KvArraysKeyMethod> = {
    key: string;
} & Omit<Parameters<KvArraysServiceBase[M]>[1], ShapeOptions>;
/**
 * The object form of `kv.arrays.push` and `kv.arrays.remove`: `{ key, value, ...options }`. `value` is what
 * `push` appends (the request body). For `remove` it is the element to remove, any JSON value: the call sends
 * the kit's `{ value }` body for it (an explicit null included), and none without it, where the `index` option
 * picks the element.
 */
export type KvArraysKeyValueArgs<M extends KvArraysKeyValueMethod> = (M extends 'remove' ? {
    key: string;
    value?: unknown;
} : {
    key: string;
    value: Parameters<KvArraysServiceBase[M]>[1];
}) & Omit<Parameters<KvArraysServiceBase[M]>[2], ShapeOptions>;
/** The object form of `read`: `{ key, ...options }`. */
export type KvReadArgs = {
    key: string;
} & KvReadOptions;
type KeyTarget<M extends KvKeyMethod> = Parameters<KvKeyCall<M>>[2];
type KeyValueTarget<M extends KvKeyValueMethod> = Parameters<KvServiceBase[M]>[3];
type ArraysKeyTarget<M extends KvArraysKeyMethod> = Parameters<KvArraysServiceBase[M]>[2];
type ArraysKeyValueTarget<M extends KvArraysKeyValueMethod> = Parameters<KvArraysServiceBase[M]>[3];
/** The object form of each generated key call, e.g. `get({ db: 'app', key: 'prefs' })`. */
export interface KvStoreObjectForms {
    get(args: KvKeyArgs<'get'>, templateVars?: KeyTarget<'get'>): ReturnType<KvServiceBase['get']>;
    delete(args: KvKeyArgs<'delete'>, templateVars?: KeyTarget<'delete'>): ReturnType<KvServiceBase['delete']>;
    exists(args: KvKeyArgs<'exists'>, templateVars?: KeyTarget<'exists'>): Promise<boolean>;
    increment(args: KvKeyArgs<'increment'>, templateVars?: KeyTarget<'increment'>): ReturnType<KvServiceBase['increment']>;
    decrement(args: KvKeyArgs<'decrement'>, templateVars?: KeyTarget<'decrement'>): ReturnType<KvServiceBase['decrement']>;
    listHistory(args: KvKeyArgs<'listHistory'>, templateVars?: KeyTarget<'listHistory'>): ReturnType<KvServiceBase['listHistory']>;
    rollback(args: KvKeyArgs<'rollback'>, templateVars?: KeyTarget<'rollback'>): ReturnType<KvServiceBase['rollback']>;
    getSnapshot(args: KvKeyArgs<'getSnapshot'>, templateVars?: KeyTarget<'getSnapshot'>): ReturnType<KvServiceBase['getSnapshot']>;
    set(args: KvKeyValueArgs<'set'>, templateVars?: KeyValueTarget<'set'>): ReturnType<KvServiceBase['set']>;
    /** Raw text: the string is stored verbatim under `contentType`, not as a JSON string. */
    set(key: string, value: string, options: KvSetTextOptions, templateVars?: KeyValueTarget<'set'>): ReturnType<KvServiceBase['set']>;
}
/** The object form of each `kv.arrays` call, e.g. `push({ db: 'app', key: 'queue', value: 1 })`. */
export interface KvArraysObjectForms {
    pop(args: KvArraysKeyArgs<'pop'>, templateVars?: ArraysKeyTarget<'pop'>): ReturnType<KvArraysServiceBase['pop']>;
    push(args: KvArraysKeyValueArgs<'push'>, templateVars?: ArraysKeyValueTarget<'push'>): ReturnType<KvArraysServiceBase['push']>;
    remove(args: KvArraysKeyValueArgs<'remove'>, templateVars?: ArraysKeyValueTarget<'remove'>): ReturnType<KvArraysServiceBase['remove']>;
}
/** The type of `client.sqlite.kv.arrays`: KvArraysService with the object form of each call ahead of its positional form. */
export type SqliteKvArraysStore = KvArraysObjectForms & KvArraysService;
/**
 * The type of `client.sqlite.kv`: KvService with the object form of
 * each key call ahead of its positional form, so `Parameters` / `ReturnType`
 * still read the positional one. Assignable to KvService.
 */
export type SqliteKvStore = KvStoreObjectForms & KvService & {
    arrays: SqliteKvArraysStore;
    table: KvTableService;
};
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
        /**
         * Whether `key` exists: true, or false when the kit answers 404. Any other
         * failure rejects with its ApiError.
         *
         *   if (await box.sqlite.kv.exists('prefs:ada', { db: 'app' })) { ... }
         */
        exists(key: string, options: KvExistsOptions, templateVars?: ExistsTarget): Promise<boolean>;
    }
}
/**
 * Attach `read`, and the object form of the key calls, to the KvService
 * prototype (idempotent). The generated methods stay as they are; the object
 * form forwards to them positionally.
 */
export declare function patchKvHelpersPrototype(): void;
export {};
