// The read-only actions' requests, declared once, one route per depth up to MAX_DEPTH: a preview's
// thumbnail and first lines, and a search below a folder. Downloads, .zip and the program's viewer and editor are
// plain links (ro.ts fileLink), never requests of the Hub.
import { defineRoute } from '@core';
import { MAX_DEPTH } from './logic';

const kit = { scope: 'kit', kit: 'files', index: 1 } as const;
const at = (n: number) => `/api/v1/files/${Array.from({ length: n }, (_, i) => `:p${i}`).join('/')}`;
const depths = <T>(fn: (n: number) => T): T[] => Array.from({ length: MAX_DEPTH }, (_, i) => fn(i + 1));

/** thumbRoutes[n - 1]: ?thumbnail&size, an image n parts deep as a small picture (403 where thumbnails are off). */
export const thumbRoutes = depths((n) => defineRoute({ method: 'GET', path: at(n), ...kit, query: ['thumbnail', 'size'] }));
/** linesRoutes[n - 1]: ?lines=1-400, the first lines of a file as text/plain. */
export const linesRoutes = depths((n) => defineRoute({ method: 'GET', path: at(n), ...kit, query: ['lines'] }));
/** findRoutes[n - 1]: ?q=, names and paths below a folder n parts deep (at most 1,000 matches; 403 where search is
 *  off). The top folder has no documented search (GET /api/v1/files answers 404), so a search starts one part deep. */
export const FIND_BYTES = 4 * 1024 * 1024;
export const findRoutes = depths((n) => defineRoute({ method: 'GET', path: at(n), ...kit, query: ['q'], maxBytes: FIND_BYTES, timeoutMs: 30_000 }));
