/**
 * Multi-domain minisign trust map. The runtime selects which domain to
 * verify against via selectDomain() (lib/update-check/domain.ts) — flag
 * → env → config-file → fail-closed. Lookup MUST go through
 * Object.prototype.hasOwnProperty.call() to defend against
 * `__proto__` / `constructor` prototype-pollution probes.
 */
export declare const HOODY_PINNED_DOMAINS: Record<string, {
    pubkey: string;
    previous?: string;
}>;
/** Binary version, baked from package.json at build time. */
export declare const HOODY_VERSION = "1.0.0-beta.8";
/** Version floor. checkForUpdate refuses any channel.json
 *  whose `latest` is strictly less than this value, even when the
 *  signature verifies via `previous`. Stops a compromised previous-key
 *  from signing a downgrade. */
export declare const HOODY_VERSION_FLOOR = "1.0.0-beta.8";
