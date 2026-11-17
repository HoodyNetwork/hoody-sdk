// The broadcast's names. The viewer link is a pinned proxy alias (link.ts); behind it the pipe name is the only thing
// that ties a link to a stream, so it is random and unguessable: 32 symbols of 64 from crypto.getRandomValues (192
// bits), never derived from the Board, the account or the time. The transfer id (the pipe's ?transfer=, 16-64 of
// [A-Za-z0-9_-]) and the sender key are drawn the same way.
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** n symbols of A, each from one random byte's low 6 bits (64 symbols: no bias). Throws without Web Crypto. */
export function token(n: number, fill: (b: Uint8Array<ArrayBuffer>) => void = (b) => { globalThis.crypto.getRandomValues(b); }): string {
  const b = new Uint8Array(new ArrayBuffer(n));
  fill(b);
  let s = '';
  for (const x of b) s += A.charAt(x & 63);
  return s;
}

export const PIPE_NAME = /^bc-[A-Za-z0-9_-]{32}$/;
export const newPipeName = (): string => 'bc-' + token(32);
export const newTransferId = (): string => 'bc-' + token(24);
/** The pipe's sender key for one Start (hoody-pipe: 16-128 of [A-Za-z0-9_-]): it holds the name for this sender, so
 *  nobody holding the viewer link can stream to it. Memory only, never stored, logged or put in a URL. */
export const SENDER_KEY = /^[A-Za-z0-9_-]{32}$/;
export const newSenderKey = (): string => token(32);

/** The alias target: the pipe's live player for the name (`video` and `live` pinned by the alias). */
export const targetPathOf = (name: string): string => `/api/v1/pipe/${name}?video=1&live=1`;
const TARGET = /^\/api\/v1\/pipe\/(bc-[A-Za-z0-9_-]{32})\?video=1&live=1$/;

/** The pipe name a broadcast alias points at, or null for any other target. */
export function nameOfTarget(path: unknown): string | null {
  const m = typeof path === 'string' ? TARGET.exec(path) : null;
  return m ? (m[1] as string) : null;
}
