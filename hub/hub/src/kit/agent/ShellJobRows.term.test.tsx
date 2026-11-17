// ShellJobRows.term: each job is a block that can be told from the next (a state mark, the command, its Stop on the same
// row; the rest indented under it). The web markup through the compat runtime drew every line of every job flush left
// with nothing between jobs and Stop as a line of its own, so the mark, indent and same-row tests fail on that drawing.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, setColourTier } from '../../term/prim';
import { ShellJobRows, shownShellJobs } from './ShellJobRows';
import type { JobRow } from './jobStop';
import type { JobAttemptView, ShellJobStops } from './shellJobStop';

const NOW = 1_761_800_000_000;
const LONG = 'find /srv/www -name "*.log" -mtime +30 -exec gzip {} + && rsync -az /srv/www/ backup@atlas:/var/backups/www/ && systemctl reload nginx';
const job = (jobId: string, command: string, o: Partial<JobRow> = {}): JobRow => ({ jobId, command, startedMs: NOW - 7 * 60_000, state: 'running', lastLine: '', remote: false, ...o });
type Can = ReturnType<ShellJobStops['canStop']>;
function fake(rows: JobRow[], o: { attempts?: [string, JobAttemptView][]; gone?: JobRow[]; can?: Record<string, Can> } = {}) {
  const attempts = new Map(o.attempts ?? []);
  const attemptRows = new Map([...rows, ...(o.gone ?? [])].filter((r) => attempts.has(r.jobId)).map((r) => [r.jobId, r] as const));
  const snap = { rows, listUnreadable: false, attempts, attemptRows };
  const calls: string[] = [];
  const stops: ShellJobStops = {
    snapshot: () => snap, subscribe: () => () => {}, refresh: async () => {},
    canStop: (id) => o.can?.[id] ?? { k: 'ok' },
    stop: async (id) => { calls.push('stop ' + id); return { k: 'refused', why: 'busy' }; },
    check: async (id) => { calls.push('check ' + id); },
  };
  return { stops, calls };
}
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; setColourTier('truecolor'); });
async function draw(stops: ShellJobStops, width: number): Promise<TestTerm> {
  term = await drawTest(<FocusRoot><Box dir="column" width={width}><ShellJobRows stops={stops} now={NOW} /></Box></FocusRoot>, { width, height: 24 });
  return term;
}

test('two jobs at 80 cells: mark + command + Stop on one row, the rest indented under it', async () => {
  const { stops } = fake([job('j1', 'npm run dev', { lastLine: 'ready in 412 ms' }), job('j2', 'pytest -x', { startedMs: NOW - 20_000 })]);
  const t = await draw(stops, 80);
  expect(lines(await t.settle())).toEqual([
    '● npm run dev' + ' '.repeat(63) + 'Stop',
    '  Running for 7 minutes',
    '  │ ready in 412 ms',
    '● pytest -x' + ' '.repeat(65) + 'Stop',
    '  Running · started just now',
  ]);
}, 60_000);

test('a long command wraps whole and Stop stays on its first row; a long last line is cut with one ellipsis (80 and 120)', async () => {
  for (const width of [80, 120]) {
    const { stops } = fake([job('j1', LONG, { lastLine: 'x'.repeat(200) })]);
    const t = await draw(stops, width);
    const rows = lines(await t.settle());
    expect(rows[0], String(width)).toMatch(/^● find \/srv\/www .* Stop$/);
    const at = rows.findIndex((r) => r.startsWith('  Running'));
    // Every character of the command is on screen: the name rows, joined, are the command.
    expect(rows.slice(0, at).map((r, i) => (i === 0 ? r.slice(2).replace(/ +Stop$/, '') : r)).join('').replace(/\s+/g, '')).toBe(LONG.replace(/\s+/g, ''));
    const last = rows[at + 1]!;
    expect(last.startsWith('  │ xxx')).toBe(true);
    expect(last.endsWith('…')).toBe(true);
    expect(last.length).toBeLessThanOrEqual(width);
    expect(rows).toHaveLength(at + 2);
    t.renderer.destroy();
    term = null;
  }
}, 60_000);

test('an unknown Stop: "?" on the job, a marked warn line with Check again beside it, the hint under it, no Stop', async () => {
  const { stops, calls } = fake([job('j1', 'sleep 600', { state: 'unknown' })], { attempts: [['j1', { phase: 'unknown', checking: false }]], can: { j1: { k: 'refused', why: 'busy' } } });
  const t = await draw(stops, 80);
  expect(lines(await t.settle())).toEqual([
    '? sleep 600',
    '  May still be running',
    '  ! This may have gone through.  Check again',
    '  Reads what happened; never sends it again.',
  ]);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls).toEqual(['check j1']);
}, 60_000);

test('keys and mouse: Tab walks the Stops in order, Enter stops the focused job, a click stops the clicked one', async () => {
  const { stops, calls } = fake([job('j1', 'npm run dev'), job('j2', 'pytest -x')]);
  const t = await draw(stops, 80);
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls).toEqual([]);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(calls).toEqual(['stop j2']);
  const rows = t.captureCharFrame().split('\n');
  await t.mockMouse.click(rows[0]!.indexOf('Stop') + 1, 0);
  await t.settle();
  expect(calls).toEqual(['stop j2', 'stop j1']);
}, 60_000);

test('a gated chat has no Stop and says why; a job no longer listed keeps its row and its open Stop, marked "·"', async () => {
  const { stops } = fake([job('g1', 'npm run dev')], { gone: [job('j9', 'tail -f app.log')], attempts: [['j9', { phase: 'sending' }]], can: { g1: { k: 'refused', why: 'capability' }, j9: { k: 'refused', why: 'not_listed' } } });
  const t = await draw(stops, 80);
  expect(lines(await t.settle())).toEqual([
    '● npm run dev',
    "  Running for 7 minutes · Stops with this chat's Stop",
    '· tail -f app.log',
    '  No longer listed',
    '  Stopping…',
  ]);
}, 60_000);

test('mono: the marks and words carry every state', async () => {
  setColourTier('mono');
  const { stops } = fake([job('j1', 'npm run dev'), job('j2', 'sleep 600', { state: 'unknown' })], { attempts: [['j2', { phase: 'unknown', checking: false }]], can: { j2: { k: 'refused', why: 'busy' } } });
  const t = await draw(stops, 80);
  const f = await t.settle();
  expect(f).toContain('● npm run dev');
  expect(f).toContain('? sleep 600');
  expect(f).toContain('! This may have gone through.');
}, 60_000);

test('nothing to show draws nothing; shownShellJobs is the shared rule', async () => {
  const { stops } = fake([job('j1', 'npm run dev', { state: 'ended' })]);
  expect(shownShellJobs(stops.snapshot())).toEqual([]);
  const t = await draw(stops, 80);
  expect(lines(await t.settle())).toEqual([]);
}, 60_000);
