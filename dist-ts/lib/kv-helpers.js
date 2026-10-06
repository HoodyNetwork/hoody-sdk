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
import { ValidationError } from '../generated/errors.js';
const KV_HELPERS_PATCH_MARKER = Symbol.for('hoody.sdk.sqlite.kv.helpers');
const KEY_METHODS = [
    'get', 'delete', 'exists', 'increment', 'decrement', 'pop', 'listHistory', 'rollback', 'getSnapshot',
];
const KEY_VALUE_METHODS = ['set', 'push', 'remove'];
/** Whether a first argument is the object form: a key is a string, so any plain object is not one. */
function isArgsObject(first) {
    return first !== null && typeof first === 'object' && !Array.isArray(first);
}
/** The key and options of an object-form call, checked as the positional call would check them. */
function splitArgs(method, args, value) {
    const { key, value: given, ...options } = args;
    if (typeof key !== 'string' || key === '') {
        throw new ValidationError(`sqlite.kv.${method}: key must be a non-empty string`, 'key');
    }
    for (const shape of ['rawResponse', 'responseType']) {
        if (shape in options) {
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
        const { key, value, options } = splitArgs(method, first, method === 'remove' ? 'optional' : 'required');
        // remove's body is the kit's { value } wrapper (main.kvRemoveRequest), not the element.
        const body = method === 'remove' ? ('value' in first ? { value } : undefined) : value;
        return positional.call(this, key, body, options, rest[0]);
    };
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
    // Whatever the caller passed for the shape options, the body comes back as is.
    const getOptions = { ...options, responseType: 'auto', rawResponse: true };
    return (await this.get(key, getOptions, templateVars));
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
    for (const method of KEY_METHODS)
        proto[method] = keyCall(method, positional(method));
    for (const method of KEY_VALUE_METHODS)
        proto[method] = keyValueCall(method, positional(method));
    proto.read = read;
    proto[KV_HELPERS_PATCH_MARKER] = true;
}
patchKvHelpersPrototype();
