/**
 * Whether this page can sign in: crypto.subtle (PKCE) and the vault need a secure context (https:, localhost). Some
 * browsers report a file opened from this computer as not secure; such a page still counts when the browser gives it
 * a usable crypto.subtle, and is refused otherwise (no way to sign in may start and then stall). The file:// memory
 * guard decides on its own whether sign-in is offered there. Plain http on another host stays refused.
 */
export const secureEnough = (
  loc: { protocol?: string } | undefined = globalThis.location,
  secureContext: boolean | undefined = globalThis.isSecureContext,
  subtle: unknown = globalThis.crypto?.subtle,
): boolean =>
  secureContext === true ||
  (loc?.protocol === 'file:' && typeof (subtle as { digest?: unknown } | undefined)?.digest === 'function');
