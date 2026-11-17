// ScriptAddress.pure.ts: the address rules ScriptAddress (web) and its terminal twin share, with nothing that draws.

/** The whole address of a script: the computer's Exec origin and the path, or the path alone when the origin is not known. */
export const fullAddress = (origin: string, path: string): string => (origin ? `${origin}${path}` : path);

/** An address a browser can open as it is: its origin is known and its path has no variable part (`/orders/[id]`). */
export const opensAsIs = (origin: string, path: string): boolean => !!origin && !path.includes('[');
