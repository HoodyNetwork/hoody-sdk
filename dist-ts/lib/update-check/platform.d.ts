/**
 * Platform detection + update-command rendering.
 *
 * `process.platform` strings we recognize: 'linux' | 'darwin' | 'win32'.
 * Anything else (freebsd, openbsd, sunos, aix, android, cygwin) falls through
 * to the docs page URL — we don't ship binaries for those yet.
 *
 * Multi-domain: `INSTALL_URL` and `DOCS_INSTALL_URL` are derived per-call
 * from the active domain (selected via `selectDomain()`). No hardcoded
 * `hoody.com` constant — same render logic serves every realm.
 */
export type Platform = 'posix' | 'windows' | 'other';
/** Build the install-script URL for a given domain (used by curl|sh / iex). */
export declare function installUrlFor(domain: string): string;
/** Build the docs landing page URL for a given domain. Note: docs live on the
 *  apex (`hoody.com/install`), not the install. subdomain. */
export declare function docsInstallUrlFor(domain: string): string;
export declare function detectPlatform(p?: NodeJS.Platform): Platform;
export interface UpdateCommandLines {
    /** Primary copy-pasteable command (or docs URL for unknown platforms). */
    primary: string;
    /** Additional options shown on `hoody update` (empty on "up-to-date"). */
    alternatives: string[];
}
/** Render the update-command block for a given platform + domain. */
export declare function renderUpdateCommands(platform: Platform, version: string, domain: string): UpdateCommandLines;
