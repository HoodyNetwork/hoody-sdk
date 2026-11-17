// navigator.locks for tests, as every https browser has it (happy-dom has none): exclusive, first come first served
// per name, granted asynchronously (never inside request(), so no test passes on a synchronous grant), and released
// when the callback's promise settles, resolved or rejected. app/test-setup.ts installs a fresh one before every
// test, and env.ts boot() installs one when none is there; a test of the no-locks path calls removeTestLocks().
type Callback = (lock: { name: string; mode: 'exclusive' }) => unknown;

export function installTestLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const request = (name: string, ...rest: unknown[]): Promise<unknown> => {
    const cb = rest[rest.length - 1] as Callback;
    const run = (tails.get(name) ?? Promise.resolve()).then(() => cb({ name, mode: 'exclusive' }));
    const tail = run.then(() => undefined, () => undefined);
    tails.set(name, tail);
    void tail.then(() => { if (tails.get(name) === tail) tails.delete(name); });
    return run;
  };
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, writable: true, value: { request } });
}

/** This tab has no navigator.locks from here on (the no-locks path). */
export function removeTestLocks(): void { Reflect.deleteProperty(globalThis.navigator, 'locks'); }
