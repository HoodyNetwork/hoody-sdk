// The engine capability check of the ship bundle (ship-entry.ts): what the patched OpenTUI adds and the Hub needs.
//   0001 setHostTextFilter (@opentui/react)  every host string through prim/safe.ts; stock = no filter at all
//   0005 isStorableLinkUrl (@opentui/core)   OSC 8 with native URL checks; stock = raw URLs, detection-only
//   0007 version 0.8.4-hoody.N on every @opentui package (the build reads it, ship-entry carries it): a lockfile or a
//        copy can never mix our engine with an npm prebuilt of the same number
// (0002 loose text, 0003/0004 colour modes, 0006 single inversion are behaviour, not exports: their tests live in the
// fork; a missing native symbol of 0003/0005 fails at load, when core binds the library.)
/** The fork's version line (src/term/docs/fork.md: `<upstream>-hoody.<N>`). */
export const HOODY_ENGINE_VERSION = /^0\.8\.4-hoody\.[1-9]\d*$/;

export function engineCapabilities(react: object, core: object, version = ''): { hostTextFilter: boolean; linkUrlCheck: boolean; version: boolean } {
  return {
    version: HOODY_ENGINE_VERSION.test(version),
    hostTextFilter: typeof (react as Record<string, unknown>).setHostTextFilter === 'function',
    linkUrlCheck: typeof (core as Record<string, unknown>).isStorableLinkUrl === 'function',
  };
}

export function assertPatchedEngine(react: object, core: object, version: string): void {
  const missing = Object.entries(engineCapabilities(react, core, version)).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) {
    throw Object.assign(new Error(`TERM_ENGINE_UNPATCHED: this terminal Hub needs the patched OpenTUI (missing: ${missing.join(', ')}); rebuild with scripts/term/build.ts --engine patched`), { code: 'TERM_ENGINE_UNPATCHED' });
  }
}

/** Build time: the version of each engine package the bundle links (core, react, the native package, and core's pin
 *  on the native package) must be one hoody version. Returns it; throws TERM_ENGINE_VERSION otherwise. */
export function engineVersion(read: (pkg: string) => { version?: string; optionalDependencies?: Record<string, string> }, nativePkg: string): string {
  const core = read('@opentui/core');
  const seen: Record<string, string | undefined> = {
    '@opentui/core': core.version,
    '@opentui/react': read('@opentui/react').version,
    [nativePkg]: read(nativePkg).version,
    [`@opentui/core -> ${nativePkg}`]: core.optionalDependencies?.[nativePkg],
  };
  const v = core.version ?? '';
  const bad = Object.entries(seen).filter(([, x]) => x !== v || !HOODY_ENGINE_VERSION.test(x ?? ''));
  if (bad.length) throw Object.assign(new Error(`TERM_ENGINE_VERSION: the engine must be one 0.8.4-hoody.N build (${Object.entries(seen).map(([k, x]) => `${k} ${x ?? 'missing'}`).join(', ')})`), { code: 'TERM_ENGINE_VERSION' });
  return v;
}
