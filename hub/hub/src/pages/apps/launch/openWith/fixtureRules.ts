// Fake answers for Open with's checks in hub:dev, shots and specs: the files program's `?stat`
// of the probed program paths and the run search's bash row. The fixture computer has nano, mousepad and a screen
// (xpra and xdpyinfo); every other probed path is the files program's plain not-found. A launch from the drawer runs
// on core's kit fake (runOpenFixture): its terminal is created, the command runs and reads running; nothing leaves the
// browser.
import { answers, reply, runOpenFixture, type FixtureRule } from '@core';
import { searchRoute } from '../../data';
import { PROBE_PATHS, statRoutes } from './routes';

/** The program paths the fixture computer has. */
export const FIXTURE_FOUND: readonly string[] = Object.freeze(['/usr/bin/nano', '/usr/bin/mousepad', '/usr/bin/xpra', '/usr/bin/xdpyinfo']);

/** The program path a stat request asks: its request path past the files program's prefix. */
const pathOf = (reqPath: string): string => {
  try {
    return decodeURIComponent(reqPath.replace(/^\/api\/v1\/files/, '').split('?')[0] ?? '');
  } catch {
    return '';
  }
};

/** The system bash row as hoody-run sends it: no top-level `path`, the binary alone in an
 *  argv execution plan (the plan that runs). */
const FIXTURE_BASH = {
  candidate_id: 'system:/usr/bin/bash', title: 'bash', kind: 'any', provider: 'system', source_id: 'system',
  score: 200, reasons: ['found in $PATH'], run_plan: { command: '/usr/bin/bash', env: {}, cwd: null },
  execution_plan: { mode: 'argv', argv: ['/usr/bin/bash'], env: {}, cwd: null, side_effect_hints: [] }, verified: false,
};

/** One rule per stat route; a path outside the probe table is never asked, and reads as not found here too. */
export const openWithFixtureRules: readonly FixtureRule[] = Object.freeze([
  ...statRoutes.map((route) =>
    reply(route, (req) => {
      const path = pathOf(req.path);
      return PROBE_PATHS.includes(path) && FIXTURE_FOUND.includes(path)
        ? { status: 200, body: { path, path_type: 'File', size: 1024 }, delayMs: 120 }
        : { status: 404, body: { success: false, error: 'Not found' }, delayMs: 120 };
    })),
  reply(searchRoute, (req) =>
    req.query.app === 'bash' && req.query.source === 'system'
      ? answers.ok({ set_id: 'set-fx', candidates: [FIXTURE_BASH], warnings: [] }, 150)
      : answers.ok({ set_id: 'set-fx', candidates: [], warnings: [] }, 150)),
  // A launch: the terminal is created in the band, the command runs and reads running (the SDK's kit fake).
  ...runOpenFixture({ delayMs: 80 }).rules,
]);
