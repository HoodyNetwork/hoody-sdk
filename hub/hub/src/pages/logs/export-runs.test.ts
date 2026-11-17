// Vitest: a script-runs export is written oldest first. When the file fills, the runs left out are the oldest ones;
// the newest runs are always in the file, and the file says it is partial.
import { afterEach, expect, it } from 'vitest';
import { createLogs, type Computer, type Logs, type Snapshot } from './controller';
import * as X from './export';
import fixtures from './fixtures';
import { DEFAULT_VIEW, type Tx } from './logic';
import { fixtureApi, type World } from './world';

const computer: Computer = { id: 'c0a7150000000000000000a1', projectId: '6a0000000000000000000001', name: 'atlas', running: true };
const t: Tx = (key) => key;
const world = (fixtures.states.quiet as { world: { data: World } }).world.data;
const limits = X.LIMITS as { rows: number };
const rows = limits.rows;
afterEach(() => { limits.rows = rows; });

async function until(l: Logs, ok: (s: Snapshot) => boolean): Promise<Snapshot> {
  for (let i = 0; i < 400; i++) {
    const s = l.get();
    if (ok(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting for the snapshot');
}

it('14 runs loaded, room for 5: the file holds the 5 newest, oldest first, and is partial', async () => {
  const base = fixtureApi({ ...world, delayMs: 0 });
  const files: string[] = [];
  const api = { ...base, save: (...a: Parameters<typeof base.save>) => { files.push((a[1] as unknown[]).map(String).join('')); return base.save(...a); } };
  const view = { ...DEFAULT_VIEW, source: 'scripts' as const, script: 'deploy-site.sh' };
  const l = createLogs({ api, computer, initial: view, prefs: { read: () => ({}), write: () => true }, t, visible: () => true, online: () => true });
  l.setView(view);
  await until(l, (s) => !s.loading && s.items.filter((i) => i.kind === 'script').length === 14);
  limits.rows = 5;
  l.startExport({ format: 'jsonl', all: false, ips: false });
  const s = await until(l, (x) => x.exporting.status !== 'working');
  expect(s.exporting.status).toBe('done');
  expect(files).toHaveLength(1);
  const ids = [...(files[0] as string).matchAll(/"execution_id":"(run\d+)"/g)].map((m) => m[1]);
  expect(ids).toEqual(['run0005', 'run0004', 'run0003', 'run0002', 'run0001']);
  expect(files[0]).toContain('"partial":true');
  l.dispose();
});

it('2,001 runs paged to the end: the list keeps 2,000, so the file is partial and never says everything is in it', async () => {
  const one = ((world.runs || {})['deploy-site.sh'] || [])[0];
  const runs = Array.from({ length: 2001 }, (_, i) => ({ ...one, executionId: 'cap' + String(i).padStart(4, '0') }));
  const base = fixtureApi({ ...world, delayMs: 0 });
  const files: string[] = [];
  // Three answers (700, 700, 601), the last one with no cursor: the list is paged to its end.
  const page = (path: string): unknown => {
    const before = new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('before');
    const at = before ? runs.findIndex((r) => r.executionId === before) + 1 : 0;
    const executions = runs.slice(at, at + 700);
    return { data: { executions, next: at + 700 < runs.length ? executions[executions.length - 1]?.executionId : null } };
  };
  const api = {
    ...base,
    kit: (...a: Parameters<typeof base.kit>) => (a[0] === 'exec' && a[1].includes('/logs/executions?') ? Promise.resolve(page(a[1])) : base.kit(...a)),
    save: (...a: Parameters<typeof base.save>) => { files.push((a[1] as unknown[]).map(String).join('')); return base.save(...a); },
  };
  const view = { ...DEFAULT_VIEW, source: 'scripts' as const, script: 'deploy-site.sh' };
  const l = createLogs({ api, computer, initial: view, prefs: { read: () => ({}), write: () => true }, t, visible: () => true, online: () => true });
  l.setView(view);
  let s = await until(l, (x) => !x.loading && x.items.some((i) => i.kind === 'script'));
  for (let n = 0; s.moreOlder && n < 5; n++) {
    l.older();
    s = await until(l, (x) => !x.olderBusy);
  }
  expect(s.moreOlder).toBe(false);
  l.startExport({ format: 'jsonl', all: false, ips: false });
  s = await until(l, (x) => x.exporting.status !== 'working');
  expect(s.exporting.status).toBe('done');
  expect(files).toHaveLength(1);
  const ids = [...(files[0] as string).matchAll(/"execution_id":"(cap\d+)"/g)].map((m) => m[1]);
  expect(ids).toHaveLength(2000);
  expect(ids).not.toContain('cap2000');
  expect(files[0]).toContain('"partial":true');
  const keys = (s.exporting as { lines?: { key: string }[] }).lines?.map((x) => x.key) ?? [];
  expect(keys).toContain('done.capped');
  expect(keys).not.toContain('done.complete');
  expect(keys).not.toContain('done.loaded');
  l.dispose();
});
