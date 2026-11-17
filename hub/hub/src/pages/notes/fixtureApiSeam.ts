// The seam between the Notes page and its fixture Api (fixtureApi.ts, fixture-only): fixtures.ts installs it when it
// loads; data.ts asks here, so no live module imports a fixture module (the terminal ship build refuses one as an input).
import type { NotesApi } from './api';

let make: (() => NotesApi) | null = null;

/** Called by fixtures.ts only. */
export function installFixtureApi(f: () => NotesApi): void {
  make = f;
}

/** The fixture Api. Only asked while fixtures are on; before fixtures.ts loaded that is a missing import in a test or
 *  boot, never a reason to fall back to live (as core's fixture seam). */
export function fixtureApiOf(): NotesApi {
  if (!make) throw new Error("FIXTURES_NOT_INSTALLED: the notes fixture Api is not installed (load the page's fixtures.ts)");
  return make();
}
