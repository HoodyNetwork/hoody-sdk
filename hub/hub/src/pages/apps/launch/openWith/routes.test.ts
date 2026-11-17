// Discovery asks only the files program's documented stat (GET /api/v1/files/{path}?stat, hoody-files'
// own stat answer), bounded small and short, and only for paths of the reviewed table.
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { PROBE_PATHS, SCREEN_PROBES, STAT_DEPTH, statCall, statRoutes } from './routes';

type R = { method: string; path: string; query: readonly string[]; scope: string; kit?: string; index?: number; maxBytes?: number; timeoutMs?: number };
const template = (r: R) => `${r.method} ${r.path.replace(/(\/:p\d+)+$/, '/{path}')}`;

describe('open with discovery routes', () => {
  it('declares one documented ?stat route per depth on the files program, 16 KiB and 5 s', () => {
    expect(statRoutes).toHaveLength(STAT_DEPTH);
    statRoutes.forEach((r0, i) => {
      const r = r0 as unknown as R;
      expect(template(r)).toBe('GET /api/v1/files/{path}');
      expect(r.query).toEqual(['stat']);
      expect([r.scope, r.kit, r.index]).toEqual(['kit', 'files', 1]);
      expect(r.maxBytes).toBe(16 * 1024);
      expect(r.timeoutMs).toBe(5000);
      expect(r.path.split('/').filter((x) => x.startsWith(':')).length).toBe(i + 1);
    });
  });

  it('covers every template probe path and both screen tools, each absolute and fixed', () => {
    for (const t of TEMPLATES) for (const p of t.probe) expect(PROBE_PATHS).toContain(p);
    for (const p of SCREEN_PROBES) expect(PROBE_PATHS).toContain(p);
    for (const p of PROBE_PATHS) {
      expect(p).toMatch(/^\/[a-z0-9._/-]+$/);
      expect(p.split('/').filter(Boolean).length).toBeLessThanOrEqual(STAT_DEPTH);
    }
    expect(STAT_DEPTH).toBe(4);
  });

  it('builds a stat call only for a table path, one param per part', () => {
    expect(statCall('/usr/local/bin/nvim')).toEqual({ route: statRoutes[3], params: { p0: 'usr', p1: 'local', p2: 'bin', p3: 'nvim' }, query: { stat: '' } });
    expect(statCall('/usr/bin/xpra')?.route).toBe(statRoutes[2]);
    // A file path, a folder or anything else is never asked.
    for (const p of ['/home/ada/notes.txt', '/usr/bin', '/usr/bin/bash', '', 'usr/bin/nano']) expect(statCall(p)).toBeNull();
  });
});
