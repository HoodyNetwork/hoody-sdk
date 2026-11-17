// Open with's discovery requests: `?stat` of a fixed program path on the computer's files
// program (kit 'files', port 1), one route per path depth as pages/files/routes.ts declares them. Only the paths of
// the reviewed template table and the two screen tools are ever asked (probes.ts), so the deepest of those sets the
// route count; routes.test.ts pins it. The bash launcher search is the Apps page's own run search route (data.ts).
import { defineRoute } from '@core';
import { TEMPLATES } from './templates';

/** The two tools whose presence lets a window program start a screen: both found → no note. */
export const SCREEN_PROBES = Object.freeze(['/usr/bin/xpra', '/usr/bin/xdpyinfo'] as const);

const partsOf = (path: string): string[] => path.split('/').filter((p) => p !== '');
/** Every path discovery may ask: the template table's probe paths and the screen tools. */
export const PROBE_PATHS: readonly string[] = Object.freeze([...new Set([...TEMPLATES.flatMap((t) => t.probe), ...SCREEN_PROBES])]);
/** The deepest of them, in parts (`/usr/local/bin/nvim` is 4). */
export const STAT_DEPTH = Math.max(...PROBE_PATHS.map((p) => partsOf(p).length));

const kit = { scope: 'kit', kit: 'files', index: 1 } as const;
const partsPath = (n: number) => Array.from({ length: n }, (_, i) => `:p${i}`).join('/');

/** statRoutes[n - 1]: GET ?stat of the path n parts deep. A stat answer is a few hundred bytes; 16 KiB bounds it. */
export const statRoutes = Array.from({ length: STAT_DEPTH }, (_, i) =>
  defineRoute({ method: 'GET', path: `/api/v1/files/${partsPath(i + 1)}`, ...kit, query: ['stat'], maxBytes: 16 * 1024, timeoutMs: 5000 }));

/** The route and call input that stat `path`, or null for a path outside the probe table (never asked). */
export function statCall(path: string): { route: (typeof statRoutes)[number]; params: Record<string, string>; query: { stat: '' } } | null {
  if (!PROBE_PATHS.includes(path)) return null;
  const parts = partsOf(path);
  const route = statRoutes[parts.length - 1];
  if (!route) return null;
  return { route, params: Object.fromEntries(parts.map((s, i) => [`p${i}`, s])), query: { stat: '' } };
}
