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
/** Build the install-script URL for a given domain (used by curl|sh / iex). */
export function installUrlFor(domain) {
    return `https://install.${domain}`;
}
/** Build the docs landing page URL for a given domain. Note: docs live on the
 *  apex (`hoody.com/install`), not the install. subdomain. */
export function docsInstallUrlFor(domain) {
    return `https://${domain}/install`;
}
export function detectPlatform(p = process.platform) {
    if (p === 'linux' || p === 'darwin')
        return 'posix';
    if (p === 'win32')
        return 'windows';
    return 'other';
}
/** Render the update-command block for a given platform + domain. */
export function renderUpdateCommands(platform, version, domain) {
    const installUrl = installUrlFor(domain);
    const docsUrl = docsInstallUrlFor(domain);
    const versionedBinaryUrl = `${installUrl}/${encodeURIComponent(version)}/`;
    if (platform === 'posix') {
        return {
            primary: `curl -fsSL ${installUrl} | sh`,
            alternatives: [
                `wget -qO-  ${installUrl} | sh`,
                `# Download the binary directly (for manual verification)`,
                versionedBinaryUrl,
                `# Other methods (package managers, etc.)`,
                docsUrl,
            ],
        };
    }
    if (platform === 'windows') {
        return {
            primary: `irm ${installUrl}/install.ps1 | iex`,
            alternatives: [
                `# Download the binary directly (for manual verification)`,
                versionedBinaryUrl,
                `# Other methods`,
                docsUrl,
            ],
        };
    }
    return {
        primary: `See ${docsUrl}`,
        alternatives: [],
    };
}
