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
import { ValidationError, isApiError } from '../generated/errors.js';

const KV_HELPERS_PATCH_MARKER = Symbol.for('hoody.sdk.sqlite.kv.helpers');

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
export type KvSetTextOptions = Omit<Parameters<KvServiceBase['set']>[2], 'contentType'> & { contentType: string };

/** The KV calls whose positional form is `(key, options, templateVars?)`. */
export type KvKeyMethod =
  | 'get' | 'delete' | 'exists' | 'increment' | 'decrement' | 'pop' | 'listHistory' | 'rollback' | 'getSnapshot';

/** The positional form of a key call: the generated one, or the hand-written `exists`. */
type KvKeyCall<M extends KvKeyMethod> = M extends 'exists'
  ? (key: string, options: KvExistsOptions, templateVars?: ExistsTarget) => Promise<boolean>
  : KvServiceBase[Exclude<M, 'exists'>];

/** The KV calls whose positional form is `(key, value, options, templateVars?)`. */
export type KvKeyValueMethod = 'set' | 'push' | 'remove';

/** The object form of a key call: `{ key, ...options }`, e.g. `get({ db: 'app', key: 'prefs' })`. */
export type KvKeyArgs<M extends KvKeyMethod> =
  { key: string } & Omit<Parameters<KvKeyCall<M>>[1], ShapeOptions>;

/**
 * The object form of `set`, `push` and `remove`: `{ key, value, ...options }`.
 * `value` is what `set` stores and `push` appends (the request body). For
 * `remove` it is the element to remove, any JSON value: the call sends the
 * kit's `{ value }` body for it (an explicit null included), and none without it,
 * where the `index` option picks the element.
 */
export type KvKeyValueArgs<M extends KvKeyValueMethod> =
  (M extends 'remove'
    ? { key: string; value?: unknown }
    : { key: string; value: Parameters<KvServiceBase[M]>[1] })
  & (M extends 'set'
    // A string value may name its own media type (raw text); every other value is JSON or bytes.
    ? Omit<Parameters<KvServiceBase[M]>[2], ShapeOptions | 'contentType'> & { contentType?: string }
    : Omit<Parameters<KvServiceBase[M]>[2], ShapeOptions>);

/** The object form of `read`: `{ key, ...options }`. */
export type KvReadArgs = { key: string } & KvReadOptions;

type KeyTarget<M extends KvKeyMethod> = Parameters<KvKeyCall<M>>[2];
type KeyValueTarget<M extends KvKeyValueMethod> = Parameters<KvServiceBase[M]>[3];

/** The object form of each generated key call, e.g. `get({ db: 'app', key: 'prefs' })`. */
export interface KvStoreObjectForms {
  get(args: KvKeyArgs<'get'>, templateVars?: KeyTarget<'get'>): ReturnType<KvServiceBase['get']>;
  delete(args: KvKeyArgs<'delete'>, templateVars?: KeyTarget<'delete'>): ReturnType<KvServiceBase['delete']>;
  exists(args: KvKeyArgs<'exists'>, templateVars?: KeyTarget<'exists'>): Promise<boolean>;
  increment(args: KvKeyArgs<'increment'>, templateVars?: KeyTarget<'increment'>): ReturnType<KvServiceBase['increment']>;
  decrement(args: KvKeyArgs<'decrement'>, templateVars?: KeyTarget<'decrement'>): ReturnType<KvServiceBase['decrement']>;
  pop(args: KvKeyArgs<'pop'>, templateVars?: KeyTarget<'pop'>): ReturnType<KvServiceBase['pop']>;
  listHistory(args: KvKeyArgs<'listHistory'>, templateVars?: KeyTarget<'listHistory'>): ReturnType<KvServiceBase['listHistory']>;
  rollback(args: KvKeyArgs<'rollback'>, templateVars?: KeyTarget<'rollback'>): ReturnType<KvServiceBase['rollback']>;
  getSnapshot(args: KvKeyArgs<'getSnapshot'>, templateVars?: KeyTarget<'getSnapshot'>): ReturnType<KvServiceBase['getSnapshot']>;
  set(args: KvKeyValueArgs<'set'>, templateVars?: KeyValueTarget<'set'>): ReturnType<KvServiceBase['set']>;
  /** Raw text: the string is stored verbatim under `contentType`, not as a JSON string. */
  set(key: string, value: string, options: KvSetTextOptions, templateVars?: KeyValueTarget<'set'>): ReturnType<KvServiceBase['set']>;
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
    /**
     * Whether `key` exists: true, or false when the kit answers 404. Any other
     * failure rejects with its ApiError.
     *
     *   if (await box.sqlite.kv.exists('prefs:ada', { db: 'app' })) { ... }
     */
    exists(key: string, options: KvExistsOptions, templateVars?: ExistsTarget): Promise<boolean>;
  }
}

const KEY_METHODS: readonly KvKeyMethod[] = [
  'get', 'delete', 'exists', 'increment', 'decrement', 'pop', 'listHistory', 'rollback', 'getSnapshot',
];
const KEY_VALUE_METHODS: readonly KvKeyValueMethod[] = ['set', 'push', 'remove'];

/** Whether a first argument is the object form: a key is a string, so any plain object is not one. */
function isArgsObject(first: unknown): first is Record<string, unknown> {
  return first !== null && typeof first === 'object' && !Array.isArray(first);
}

/** The key and options of an object-form call, checked as the positional call would check them. */
function splitArgs(method: string, args: Record<string, unknown>, value: 'required' | 'optional' | 'none') {
  const { key, value: given, ...options } = args;
  if (typeof key !== 'string' || key === '') {
    throw new ValidationError(`sqlite.kv.${method}: key must be a non-empty string`, 'key');
  }
  for (const shape of ['rawResponse', 'responseType'] as const) {
    if (shape in options) {
      throw new ValidationError(
        `sqlite.kv.${method}: ${shape} is not taken by the object form; pass it positionally: ${method}(key, ${value === 'none' ? '' : 'value, '}{ db, ${shape} })`,
        shape,
      );
    }
  }
  if (value === 'none' && 'value' in args) {
    throw new ValidationError(`sqlite.kv.${method}: takes no value`, 'value');
  }
  if (value === 'required' && !('value' in args)) {
    throw new ValidationError(`sqlite.kv.${method}: value is required ({ db, key, value })`, 'value');
  }
  return { key, value: given, options };
}

type Positional = (this: unknown, ...args: unknown[]) => Promise<unknown>;

function keyCall(method: KvKeyMethod, positional: Positional): Positional {
  return async function (this: unknown, first: unknown, ...rest: unknown[]) {
    if (!isArgsObject(first)) return positional.call(this, first, ...rest);
    const { key, options } = splitArgs(method, first, 'none');
    return positional.call(this, key, options, rest[0]);
  };
}

function keyValueCall(method: KvKeyValueMethod, positional: Positional): Positional {
  return async function (this: unknown, first: unknown, ...rest: unknown[]) {
    if (!isArgsObject(first)) return positional.call(this, first, ...rest);
    const { key, value, options } = splitArgs(method, first, method === 'remove' ? 'optional' : 'required');
    // remove's body is the kit's { value } wrapper (main.kvRemoveRequest), not the element.
    const body = method === 'remove' ? ('value' in first ? { value } : undefined) : value;
    return positional.call(this, key, body, options, rest[0]);
  };
}

/**
 * `set` with a string stored as JSON. The generated call sends a string
 * verbatim as `text/plain` unless a Content-Type is already set, and
 * JSON-encodes it once when that type is JSON: so the type is set here.
 * An explicit `contentType`, or a `Content-Type` among `headers`, keeps the
 * string as raw text under that type. Every other value goes through untouched.
 */
function jsonStringSet(positional: Positional): Positional {
  return function (this: unknown, key: unknown, value: unknown, options: unknown, ...rest: unknown[]) {
    if (typeof value !== 'string' || !isArgsObject(options)) return positional.call(this, key, value, options, ...rest);
    const headers = isArgsObject(options.headers) ? options.headers : {};
    if (Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
      return positional.call(this, key, value, options, ...rest);
    }
    const contentType = typeof options.contentType === 'string' && options.contentType !== ''
      ? options.contentType
      : 'application/json';
    return positional.call(this, key, value, { ...options, headers: { ...headers, 'Content-Type': contentType } }, ...rest);
  };
}

/** `exists` as a boolean over the generated HEAD call: 404 is the answer "no", not a failure. */
async function exists(this: unknown, key: unknown, options: unknown, templateVars?: unknown): Promise<boolean> {
  const head = (this as { __exists: Positional }).__exists;
  try {
    // The generated HEAD resolves false itself on a 404 the kit marks KEY_NOT_FOUND / KEY_EXPIRED.
    return (await head.call(this, key, options, templateVars)) !== false;
  } catch (err) {
    if (isApiError(err) && err.status === 404) return false;
    throw err;
  }
}

async function read<T = unknown>(
  this: KvServiceBase,
  keyOrArgs: string | KvReadArgs,
  optionsOrTarget?: KvReadOptions | GetTarget,
  templateVars?: GetTarget,
): Promise<T> {
  let key: unknown = keyOrArgs;
  let options = optionsOrTarget as KvReadOptions;
  if (isArgsObject(keyOrArgs)) {
    const split = splitArgs('read', keyOrArgs, 'none');
    key = split.key;
    options = split.options as KvReadOptions;
    templateVars = optionsOrTarget as GetTarget;
  }
  if (typeof key !== 'string' || key === '') {
    throw new ValidationError('sqlite.kv.read: key must be a non-empty string', 'key');
  }
  if (!options || typeof options !== 'object') {
    throw new ValidationError('sqlite.kv.read: options with db are required', 'db');
  }
  // Whatever the caller passed for the shape options, the body comes back as is.
  const getOptions = { ...options, responseType: 'auto', rawResponse: true } as GetOptions;
  return (await this.get(key, getOptions, templateVars)) as unknown as T;
}

/**
 * Attach `read`, and the object form of the key calls, to the KvService
 * prototype (idempotent). The generated methods stay as they are; the object
 * form forwards to them positionally.
 */
export function patchKvHelpersPrototype(): void {
  const proto = KvService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[KV_HELPERS_PATCH_MARKER]) return;
  // The positional method as the prototype chain has it now: the generated one,
  // or an override in the hand-written KvService.
  const positional = (method: string) => proto[method] as Positional;
  proto.exists = exists;
  proto.set = jsonStringSet(positional('set'));
  for (const method of KEY_METHODS) proto[method] = keyCall(method, positional(method));
  for (const method of KEY_VALUE_METHODS) proto[method] = keyValueCall(method, positional(method));
  proto.read = read;
  proto[KV_HELPERS_PATCH_MARKER] = true;
}

patchKvHelpersPrototype();
