/**
 * Which client a service belongs to.
 *
 * Several hand-written helpers live on a generated service (`terminal.sessions.createSsh`,
 * `daemon.programs.attachTerminal`, `agent.importLocalConfig`) but need more than the service
 * itself: the client's URL templates, its other namespaces, its credentials. A service does not
 * know its client, so `patchHoodyClientMetrics` stamps each such service object with its owner,
 * under a registry symbol, and the helpers read it back here.
 *
 * Browser-safe: no Node builtins, no import of the client class.
 */

/** Registry symbol: the same key survives duplicate module instances. */
export const SERVICE_OWNER = Symbol.for('hoody.sdk.service.owner');

/** The service paths helpers read their owner from, as accessor segments under the client. */
export const OWNED_SERVICE_PATHS: ReadonlyArray<readonly string[]> = [
  ['terminal'],
  ['terminal', 'sessions'],
  ['terminal', 'commands'],
  ['display', 'screenshots'],
  ['browser', 'page'],
  ['curl', 'channel'],
  ['agent'],
  ['files'],
  ['files', 'images'],
  ['notes', 'files'],
  ['notes', 'files', 'uploads'],
  ['daemon', 'programs'],
  ['sqlite', 'sql'],
  ['sqlite', 'kv'],
];

/** Stamp every service a helper needs an owner for. Idempotent; a missing path is skipped. */
export function claimOwnedServices(client: object): void {
  for (const path of OWNED_SERVICE_PATHS) {
    let node: unknown = client;
    for (const segment of path) {
      node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined;
    }
    if (node === null || (typeof node !== 'object' && typeof node !== 'function')) continue;
    if (Object.prototype.hasOwnProperty.call(node, SERVICE_OWNER)) continue;
    Object.defineProperty(node, SERVICE_OWNER, { value: client, enumerable: false, configurable: true });
  }
}

/** The client that owns `service`. Throws when the service was built outside a HoodyClient. */
export function ownerOf<TClient extends object = object>(service: object, helper: string): TClient {
  const owner = (service as Record<symbol, unknown>)[SERVICE_OWNER];
  if (owner === undefined || owner === null) {
    throw new Error(`${helper} needs a service that belongs to a HoodyClient`);
  }
  return owner as TClient;
}
