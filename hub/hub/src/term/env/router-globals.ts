// The one browser global the router calls without a guard: scrollTo, a no-op in a terminal (strict-globals.ts defines
// the same no-op when it is installed).
const g = globalThis as { scrollTo?: unknown };
if (typeof g.scrollTo !== 'function') Object.defineProperty(globalThis, 'scrollTo', { value: (): void => {}, configurable: true, writable: true });
