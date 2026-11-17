// The seam between the Logs page and its fixture world (world.ts, fixture-only). The page's fixtures.ts installs
// world.ts's fixtureApi when it loads, which is before any fixture `world` answer exists; the page asks this seam, so no
// live module imports world.ts (the terminal ship build refuses any import of a fixture module, even an unused one).
import type { LogsApi } from './api';
import type { World } from './world';

let make: ((world: World) => LogsApi) | null = null;

/** Called by fixtures.ts only. */
export function installFixtureApi(f: (world: World) => LogsApi): void {
  make = f;
}

/** The fixture api over a world, or null before fixtures.ts loaded (never in a live build). */
export function fixtureApiOf(world: World): LogsApi | null {
  return make ? make(world) : null;
}
