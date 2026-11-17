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
import { KvArraysService } from '../generated/sqlite/kv-arrays.service.js';
import { ValidationError, isApiError, refuseRetiredOptions } from '../generated/errors.js';
const KV_HELPERS_PATCH_MARKER = Symbol.for('hoody.sdk.sqlite.kv.helpers');
const KEY_METHODS = [
    'get', 'delete', 'exists', 'increment', 'decrement', 'listHistory', 'rollback', 'getSnapshot',
];
const KEY_VALUE_METHODS = ['set'];
const ARRAYS_KEY_METHODS = ['pop'];
const ARRAYS_KEY_VALUE_METHODS = ['push', 'remove'];
/** Whether a first argument is the object form: a key is a string, so any plain object is not one. */
function isArgsObject(first) {
    return first !== null && typeof first === 'object' && !Array.isArray(first);
}
/**
 * A copy of an options object that keeps every key the positional call reads by name: own or inherited,
 * enumerable or not, a getter's value included, minus `omit`. A non-enumerable function (a class method) is not an
 * option. An object spread keeps own enumerable keys only: a retired key that was inherited, non-enumerable or a
 * getter then escaped the generated call's refusal, and an inherited `ifMatch` was dropped without a word.
 */
function copyOptions(given, omit = []) {
    const out = {};
    const seen = new Set();
    for (let level = given; level !== null && level !== Object.prototype; level = Object.getPrototypeOf(level)) {
        for (const name of Object.getOwnPropertyNames(level)) {
            if (seen.has(name))
                continue;
            seen.add(name);
            if (omit.includes(name))
                continue;
            const value = given[name];
            if (value === undefined)
                continue;
            if (typeof value === 'function' && Object.getOwnPropertyDescriptor(level, name)?.enumerable !== true)
                continue;
            out[name] = value;
        }
    }
    return out;
}
/** The key and options of an object-form call, checked as the positional call would check them. */
function splitArgs(method, args, value) {
    const { key, value: given } = args;
    const options = copyOptions(args, ['key', 'value']);
    if (typeof key !== 'string' || key === '') {
        throw new ValidationError(`sqlite.kv.${method}: key must be a non-empty string`, 'key');
    }
    for (const shape of ['rawResponse', 'responseType']) {
        if (shape in args) {
            throw new ValidationError(`sqlite.kv.${method}: ${shape} is not taken by the object form; pass it positionally: ${method}(key, ${value === 'none' ? '' : 'value, '}{ db, ${shape} })`, shape);
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
function keyCall(method, positional) {
    return async function (first, ...rest) {
        if (!isArgsObject(first))
            return positional.call(this, first, ...rest);
        const { key, options } = splitArgs(method, first, 'none');
        return positional.call(this, key, options, rest[0]);
    };
}
function keyValueCall(method, positional) {
    return async function (first, ...rest) {
        if (!isArgsObject(first))
            return positional.call(this, first, ...rest);
        const { key, value, options } = splitArgs(method, first, method === 'arrays.remove' ? 'optional' : 'required');
        // remove's body is the kit's { value } wrapper (main.kvRemoveRequest), not the element.
        const body = method === 'arrays.remove' ? ('value' in first ? { value } : undefined) : value;
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
function jsonStringSet(positional) {
    return function (key, value, options, ...rest) {
        if (typeof value !== 'string' || !isArgsObject(options))
            return positional.call(this, key, value, options, ...rest);
        const headers = isArgsObject(options.headers) ? options.headers : {};
        if (Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
            return positional.call(this, key, value, options, ...rest);
        }
        const contentType = typeof options.contentType === 'string' && options.contentType !== ''
            ? options.contentType
            : 'application/json';
        return positional.call(this, key, value, { ...copyOptions(options), headers: { ...headers, 'Content-Type': contentType } }, ...rest);
    };
}
/** `exists` as a boolean over the generated HEAD call: 404 is the answer "no", not a failure. */
async function exists(key, options, templateVars) {
    const head = this.__exists;
    try {
        // The generated HEAD resolves false itself on a 404 the kit marks KEY_NOT_FOUND / KEY_EXPIRED.
        return (await head.call(this, key, options, templateVars)) !== false;
    }
    catch (err) {
        if (isApiError(err) && err.status === 404)
            return false;
        throw err;
    }
}
async function read(keyOrArgs, optionsOrTarget, templateVars) {
    let key = keyOrArgs;
    let options = optionsOrTarget;
    if (isArgsObject(keyOrArgs)) {
        const split = splitArgs('read', keyOrArgs, 'none');
        key = split.key;
        options = split.options;
        templateVars = optionsOrTarget;
    }
    if (typeof key !== 'string' || key === '') {
        throw new ValidationError('sqlite.kv.read: key must be a non-empty string', 'key');
    }
    if (!options || typeof options !== 'object') {
        throw new ValidationError('sqlite.kv.read: options with db are required', 'db');
    }
    // sqlite.kv.get refuses this too, but under its own name; check it here so
    // the error names sqlite.kv.read.
    refuseRetiredOptions(options, 'sqlite.kv.read', [['IfNoneMatch', 'ifNoneMatch']]);
    // Whatever the caller passed for the shape options, the body comes back as is.
    const getOptions = { ...copyOptions(options), responseType: 'auto', rawResponse: true };
    try {
        return (await this.get(key, getOptions, templateVars));
    }
    catch (err) {
        throw relabelRefusal(err, 'sqlite.kv.get', 'sqlite.kv.read');
    }
}
/**
 * A refusal the backing call raised names that call (`sqlite.kv.get does not take "stat"`); the caller
 * used sqlite.kv.read. Relabel it in place, keeping its class, field and replacement text. Any other error
 * (transport, HTTP) passes through untouched.
 */
function relabelRefusal(err, backing, helper) {
    if (!(err instanceof ValidationError) || !err.message.startsWith(backing))
        return err;
    const next = err.message.charAt(backing.length);
    if (next !== ' ' && next !== ':' && next !== '(')
        return err;
    err.message = helper + err.message.slice(backing.length);
    if (typeof err.stack === 'string')
        err.stack = err.stack.replace(backing, helper);
    const retired = err;
    if (retired.method === backing)
        Object.defineProperty(err, 'method', { value: helper });
    return err;
}
/**
 * Attach `read`, and the object form of the key calls, to the KvService
 * prototype (idempotent). The generated methods stay as they are; the object
 * form forwards to them positionally.
 */
export function patchKvHelpersPrototype() {
    const proto = KvService.prototype;
    if (proto[KV_HELPERS_PATCH_MARKER])
        return;
    // The positional method as the prototype chain has it now: the generated one,
    // or an override in the hand-written KvService.
    const positional = (method) => proto[method];
    proto.exists = exists;
    proto.set = jsonStringSet(positional('set'));
    for (const method of KEY_METHODS)
        proto[method] = keyCall(method, positional(method));
    for (const method of KEY_VALUE_METHODS)
        proto[method] = keyValueCall(method, positional(method));
    proto.read = read;
    proto[KV_HELPERS_PATCH_MARKER] = true;
    // `kv.arrays` (pop, push, remove): the same object forms, labelled `sqlite.kv.arrays.<method>`.
    const arrays = KvArraysService.prototype;
    if (arrays[KV_HELPERS_PATCH_MARKER])
        return;
    for (const method of ARRAYS_KEY_METHODS)
        arrays[method] = keyCall(`arrays.${method}`, arrays[method]);
    for (const method of ARRAYS_KEY_VALUE_METHODS)
        arrays[method] = keyValueCall(`arrays.${method}`, arrays[method]);
    arrays[KV_HELPERS_PATCH_MARKER] = true;
}
patchKvHelpersPrototype();
