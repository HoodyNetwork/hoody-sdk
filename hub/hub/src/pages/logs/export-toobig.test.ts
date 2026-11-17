// Vitest: an export whose read is too large, or whose file would fill before the newest lines, saves no file, so it ends as a failed export with its own words;
// it never ends "done" with a line that tells the person to export.
import { expect, it } from 'vitest';
import { createLogs, type Computer, type Logs, type Snapshot } from './controller';
import fixtures from './fixtures';
import { DEFAULT_VIEW, type Tx } from './logic';
import strings from './strings.en.json';
import { fixtureApi, type World } from './world';

const computer: Computer = { id: 'c0a7150000000000000000a1', projectId: '6a0000000000000000000001', name: 'atlas', running: true };
const t: Tx = (key) => key;
const world = (fixtures.states.quiet as { world: { data: World } }).world.data;

async function until(l: Logs, ok: (s: Snapshot) => boolean): Promise<Snapshot> {
  for (let i = 0; i < 400; i++) {
    const s = l.get();
    if (ok(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting for the snapshot');
}

it('program output too large to export: the dialog state is an error that says so, and nothing is saved', async () => {
  const base = fixtureApi({ ...world, delayMs: 0 });
  let saved = 0;
  const api = {
    ...base,
    kit: (...a: Parameters<typeof base.kit>) => (a[0] === 'daemon' && /lines=10000/.test(a[1]) ? Promise.reject({ kind: 'too_large', status: 0, code: 'too_large' }) : base.kit(...a)),
    save: (...a: Parameters<typeof base.save>) => { saved++; return base.save(...a); },
  };
  const view = { ...DEFAULT_VIEW, source: 'programs' as const };
  const l = createLogs({ api, computer, initial: view, prefs: { read: () => ({}), write: () => true }, t, visible: () => true, online: () => true });
  l.setView(view);
  await until(l, (s) => !!s.programs && !!s.programs.current);
  l.startExport({ format: 'txt', all: false, ips: false });
  const s = await until(l, (x) => x.exporting.status !== 'working');
  expect(s.exporting).toEqual({ status: 'error', key: 'ex.tooBig' });
  expect(saved).toBe(0);
  const words = (strings as Record<string, string>)['ex.tooBig'];
  expect(words).toBeTruthy();
  expect(words).not.toMatch(/Export it/);
  l.dispose();
});

it('program output that fits the read but not the file: an error that says so, and no cut file is saved', async () => {
  const base = fixtureApi({ ...world, delayMs: 0 });
  let saved = 0;
  const big = Array.from({ length: 10000 }, (_, i) => '<div></div>'.repeat(30) + i).join('\n');
  const api = {
    ...base,
    kit: (...a: Parameters<typeof base.kit>) => (a[0] === 'daemon' && /lines=10000/.test(a[1]) ? Promise.resolve({ logs: big }) : base.kit(...a)),
    save: (...a: Parameters<typeof base.save>) => { saved++; return base.save(...a); },
  };
  const view = { ...DEFAULT_VIEW, source: 'programs' as const };
  const l = createLogs({ api, computer, initial: view, prefs: { read: () => ({}), write: () => true }, t, visible: () => true, online: () => true });
  l.setView(view);
  await until(l, (s) => !!s.programs && !!s.programs.current);
  l.startExport({ format: 'jsonl', all: false, ips: false });
  const s = await until(l, (x) => x.exporting.status !== 'working');
  expect(s.exporting).toEqual({ status: 'error', key: 'ex.tooBig' });
  expect(saved).toBe(0);
  l.dispose();
});
