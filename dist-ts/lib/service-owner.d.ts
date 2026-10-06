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
export declare const SERVICE_OWNER: unique symbol;
/** The service paths helpers read their owner from, as accessor segments under the client. */
export declare const OWNED_SERVICE_PATHS: ReadonlyArray<readonly string[]>;
/** Stamp every service a helper needs an owner for. Idempotent; a missing path is skipped. */
export declare function claimOwnedServices(client: object): void;
/** The client that owns `service`. Throws when the service was built outside a HoodyClient. */
export declare function ownerOf<TClient extends object = object>(service: object, helper: string): TClient;
