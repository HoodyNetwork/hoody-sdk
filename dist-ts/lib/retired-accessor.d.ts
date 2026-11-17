/**
 * Retired getters of hand-written public classes and handles: a
 * synchronous local read is a method, `get<X>()` for a value and `is<X>()` for a boolean. A getter that
 * shipped before the rename is kept only as a refusal: reading it throws, naming the method. It is
 * defined here, at run time and non-enumerable, so it is in no type, no `.d.ts`, no spread and no
 * `JSON.stringify`, and it is never an alias.
 */
/** The message a retired getter throws: `<Owner>.<old> was renamed to <new>. Call <new> instead.` */
export declare function retiredAccessorMessage(owner: string, retired: string, current: string): string;
/**
 * Define throwing getters on `target` (a class prototype or one handle object) for each
 * `retired -> current` pair, e.g. `{ connected: 'isConnected()' }`. Returns `target`.
 */
export declare function retireAccessors<T extends object>(target: T, owner: string, renames: Readonly<Record<string, string>>): T;
/**
 * Marks a refusal `retireMethods` installs (`fn[RETIRED_MEMBER] === true`), so a surface walk
 * (the SDK surface check) does not count a retired name as a public method.
 */
export declare const RETIRED_MEMBER: unique symbol;
/** The message a retired method throws: `<Owner>.<old>() was retired. Call <new> instead.` */
export declare function retiredMethodMessage(owner: string, retired: string, current: string): string;
/**
 * Define throwing methods on `target` for each `retired -> current` pair, e.g.
 * `{ getState: 'getLifecycleState()' }`: a method whose name now stands for a different value set is
 * refused rather than kept, so no caller gets other values under the same name. Non-enumerable and in
 * no type. Returns `target`.
 */
export declare function retireMethods<T extends object>(target: T, owner: string, renames: Readonly<Record<string, string>>): T;
