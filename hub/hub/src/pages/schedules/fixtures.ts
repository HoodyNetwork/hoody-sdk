// Fake-API states of the schedules page for hub:dev, hub:shots, tests and specs.
import { defineFixtures } from '@app/fixtures';
import { WORLD_NOW, fixtureWorld } from '@core';
import type { HistoryRun } from './data';
import { type Caps, type RawCronEntry, type RawCurl, type RawExec, type RawLoop, type RawSchedules, type Source, model } from './logic';

const NOW = WORLD_NOW;
const MIN = 60000;
const HOUR = 3600000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const inn = (ms: number) => new Date(NOW + ms).toISOString();
const run = (id: string, startedAgo: number, exit: number, tookMs = 4200) => ({ run_id: id, status: 'finished' as const, started_at: ago(startedAgo), finished_at: ago(startedAgo - tookMs), exit_code: exit });


// The computer (atlas, in Singapore) reads UTC+8. The next time its clock shows a given moment, so rows agree with their words.
const OFFSET = 8 * 3600000;
function nextLocal(match: (d: Date) => boolean, h: number, m: number): number {
  for (let day = 0; day < 40; day++) {
    const d = new Date(NOW + OFFSET + day * 24 * HOUR);
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - OFFSET;
    if (at > NOW && match(new Date(at + OFFSET))) return at;
  }
  return NOW + 24 * HOUR;
}
const daily = (h: number, m: number) => nextLocal(() => true, h, m);
const weekly = (dow: number, h: number, m: number) => nextLocal((d) => d.getUTCDay() === dow, h, m);
const monthly = (dom: number, h: number, m: number) => nextLocal((d) => d.getUTCDate() === dom, h, m);
const iso = (ms: number) => new Date(ms).toISOString();

const atlas = fixtureWorld.current.name;
const computer = { name: atlas, status: 'running', tz: 'Asia/Singapore' };
const caps: Caps = { runs: true, run_now: true, loop_receipts: true, loop_list_titles: true, trigger_receipts: true };

const complete = <T,>(items: T[]): Source<T> => ({ state: 'ok', complete: true, items });
const missing = <T,>(state: Source<T>['state']): Source<T> => ({ state, complete: false, items: [] });

const entries: RawCronEntry[] = [
  { user: 'user', id: 'a1', name: 'Nightly backup', command: 'restic backup /home --password-file /root/.pw', schedule: '0 2 * * *', schedule_human: 'At 02:00', enabled: true, run_reports: true, last_run: run('r1', 15 * HOUR, 0, 94000), next_runs: [0, 1, 2, 3, 4].map((d) => iso(daily(2, 0) + d * 24 * HOUR)) },
  { user: 'user', id: 'a2', name: 'rotate-logs', command: 'logrotate /etc/logrotate.conf', schedule: '30 3 * * 1', schedule_human: 'At 03:30 on Monday', enabled: true, run_reports: true, last_run: run('r2', 3 * 24 * HOUR + 5 * HOUR, 0, 3200), next_runs: [0, 1, 2, 3, 4].map((w) => iso(weekly(1, 3, 30) + w * 7 * 24 * HOUR)) },
  { user: 'user', id: 'a3', name: 'sync-photos', command: 'rclone sync ~/photos remote:photos', schedule: '*/15 * * * *', schedule_human: 'Every 15 minutes', enabled: true, run_reports: true, last_run: run('r3', 7 * MIN, 1, 41000), next_runs: [8, 23, 38, 53, 68].map((n) => inn(n * MIN)) },
  { user: 'user', id: 'a4', name: 'old-report', command: 'bash ~/bin/report.sh', schedule: '0 7 * * 1-5', schedule_human: 'At 07:00 on weekdays', enabled: false, run_reports: true, last_run: run('r4', 9 * 24 * HOUR, 0, 5200), next_runs: [] },
  { user: 'root', id: 'a5', name: '', command: '/usr/local/bin/cleanup-tmp --older-than 7d', schedule: '15 4 1 * *', schedule_human: 'At 04:15 on day 1', enabled: true, run_reports: true, next_runs: [iso(monthly(1, 4, 15))] },
  { user: 'user', id: 'a6', name: 'hoody-timer-morning-check', command: 'hoody-agent timer fire morning-check', schedule: '0 8 * * *', schedule_human: 'At 08:00', enabled: true, run_reports: true, last_run: run('r6', 1 * HOUR, 0, 21000), next_runs: [iso(daily(8, 0))] },
  { user: 'user', id: 'a7', name: 'warm-cache', command: 'curl -H "Authorization: Bearer abc123" https://example.com/warm', schedule: '@reboot', enabled: true, run_reports: true, next_runs: [] },
];
// More commands than one page (50) holds, for the pager and reload tests.
const manyEntries: RawCronEntry[] = Array.from({ length: 60 }, (_, i) => ({ user: 'user', id: `m${String(i + 1).padStart(2, '0')}`, name: `Nightly backup ${i + 2}`, command: `restic backup /srv/data-${i + 2}`, schedule: '0 2 * * *', schedule_human: 'At 02:00', enabled: true, run_reports: true, next_runs: [0, 1, 2, 3, 4].map((d) => iso(daily(2, 0) + d * 24 * HOUR)) }));
const hand = [{ user: 'user', line: 12, schedule: '*/7 * * * *', schedule_human: 'Every 7 minutes', command: '/opt/legacy/poll.sh' }];

const execs: RawExec[] = [
  { scriptRel: 'default/1/nightly-digest.ts', expression: '0 6 * * *', enabled: true, nextFire: iso(daily(6, 0)), lastFireAt: ago(3 * HOUR), lastFireStatus: 'ok' },
  { scriptRel: 'default/1/queue-drain.ts', expression: '*/10 * * * *', enabled: true, nextFire: inn(4 * MIN), lastFireAt: ago(6 * MIN), lastFireStatus: 'error' },
  { scriptRel: 'default/1/archive.ts', expression: '0 0 1 * *', enabled: false, lastFireStatus: 'disabled', lastFireAt: ago(30 * 24 * HOUR) },
];
const curls: RawCurl[] = [
  { id: 'c1', name: 'ping-api', cron: '0 */5 * * * *', enabled: true, next_run: inn(3 * MIN), last_run: ago(2 * MIN), last_status: 'completed', request: { url: 'https://api.example.com/health?token=hidden', method: 'GET' } },
  { id: 'c2', cron: '0 0 9 * * MON-FRI', enabled: true, next_run: inn(20 * HOUR), last_run: ago(4 * HOUR), last_status: 'failed', request: { url: 'https://hooks.example.org/daily', method: 'POST' } },
];
const loops: RawLoop[] = [
  { id: 'loop_1a2b3c4d', session_id: 'sess_01', session_title: 'Watch the build', interval_ms: 10 * MIN, state: 'running', next_run_at: inn(4 * MIN), last_fire: { outcome: 'ok', started_at: ago(6 * MIN), ended_at: ago(5 * MIN) } },
  { id: 'loop_5e6f7a8b', session_id: 'sess_02', interval_ms: HOUR, state: 'error', last_error: 'loop turn reported an error', last_fire: { outcome: 'error', started_at: ago(HOUR), ended_at: ago(HOUR) } },
];

const base = (over: Partial<RawSchedules> = {}): RawSchedules => ({
  now: NOW,
  utcOffset: 8 * 3600,
  cron: { ...complete(entries), hand, caps },
  exec: complete(execs),
  curl: complete(curls),
  loop: { ...complete(loops), caps },
  programsRunning: 9,
  ...over,
});

// A schedule's history follows its own cadence, newest first, and its newest run is its Last result.
function runs(every: number, lastAgo: number, results: readonly ('ok' | 'failed' | 'lost')[], took: number, output?: string): HistoryRun[] {
  return results.map((result, i) => ({
    id: `h${every}-${i}`,
    at: NOW - lastAgo - i * every,
    result,
    exit: result === 'failed' ? 1 : null,
    tookMs: took + ((i * 7919) % 5000),
    ...(result === 'failed' && output ? { output } : {}),
  }));
}
const okRuns = (n: number, failAt?: number): ('ok' | 'failed')[] => Array.from({ length: n }, (_, i) => (i === failAt ? 'failed' : 'ok'));
const fail = 'rclone: Failed to sync: couldn\'t connect to remote:photos (dial tcp: i/o timeout)\nexit status 1';
const HISTORY: Record<string, HistoryRun[]> = {
  'cron:user/a1': runs(24 * HOUR, 15 * HOUR, okRuns(14, 5), 94000, 'restic: repository is locked by another run\nexit status 1'),
  'cron:user/a2': runs(7 * 24 * HOUR, 3 * 24 * HOUR + 5 * HOUR, okRuns(6), 3200),
  'cron:user/a3': runs(15 * MIN, 7 * MIN, ['failed', 'failed', ...okRuns(14)], 38000, fail),
  'cron:user/a4': runs(24 * HOUR, 9 * 24 * HOUR, okRuns(8), 5200),
  'cron:root/a5': [],
  'timer:user/a6': runs(24 * HOUR, 1 * HOUR, okRuns(7), 21000),
  'exec:default/1/nightly-digest.ts': runs(24 * HOUR, 3 * HOUR, okRuns(10), 12000),
  'exec:default/1/queue-drain.ts': runs(10 * MIN, 6 * MIN, ['failed', ...okRuns(11)], 8000, 'queue-drain: lock held by pid 4411\nexit status 1'),
};
const historyFor = (key: string): { data: { runs: HistoryRun[] } } => ({ data: { runs: HISTORY[key] ?? runs(24 * HOUR, 4 * HOUR, okRuns(3), 4000) } });
const histories = Object.fromEntries(model(base()).rows.map((r) => [`history:${r.key}`, historyFor(r.key)]));

const press = { outcome: 'done' as const };
const same = { ...histories, reveal: { outcome: 'done' as const, data: { text: 'restic backup /home --password-file /root/.pw --token=abc123' } }, describe: { outcome: 'done' as const, data: { next: [1, 2, 3, 4, 5].map((n) => NOW + n * 24 * HOUR) } }, act: press, save: press };

const small = base({
  cron: { ...complete(entries.slice(0, 2)), hand: [], caps },
  exec: complete([]),
  curl: complete([]),
  loop: { ...complete([]), caps },
  programsRunning: 3,
});

export default defineFixtures({
  default: 'many',
  states: {
    many: { computer: { data: computer }, schedules: { data: base() }, ...same },
    small: { computer: { data: computer }, schedules: { data: small }, ...same },
    attention: {
      computer: { data: computer },
      schedules: { data: base({ cron: { ...complete(entries.filter((e) => e.id === 'a3')), hand: [], caps }, exec: complete([execs[1] as RawExec]), curl: complete([curls[1] as RawCurl]), loop: { ...complete([loops[1] as RawLoop]), caps } }) },
      ...same,
    },
    empty: { computer: { data: computer }, schedules: { data: base({ cron: { ...complete([]), hand: [], caps }, exec: complete([]), curl: complete([]), loop: { ...complete([]), caps } }) }, ...same },
    loading: { computer: { data: computer }, schedules: { pending: true }, ...same },
    error: { computer: { data: computer }, schedules: { error: 'server' }, ...same },
    private: { computer: { data: computer }, schedules: { error: 'forbidden' }, ...same },
    stopped: { computer: { data: { name: atlas, status: 'stopped' } }, schedules: { pending: true }, ...same },
    'no-computer': { computer: { data: null }, schedules: { pending: true }, ...same },
    // The computer list is not known yet (no computer chosen): loading, then a failed read.
    'computers-loading': { computer: { pending: true }, schedules: { pending: true }, ...same },
    'computers-unknown': { computer: { error: 'server' }, schedules: { pending: true }, ...same },
    long: { computer: { data: computer }, schedules: { data: base({ cron: { ...complete([...entries, ...manyEntries]), hand, caps } }) }, ...same },
    // Some sources did not answer: the list is incomplete and says which.
    partial: {
      computer: { data: computer },
      schedules: { data: base({ curl: missing('stopped'), exec: missing('old'), loop: { ...missing('private'), caps } }) },
      ...same,
    },
    // The agent's platform login is gone (restriction_unknown): its loops can't be read.
    'signed-out': { computer: { data: computer }, schedules: { data: base({ loop: { ...missing('signed_out'), caps } }) }, ...same },
    // Nothing listed yet, and a source did not answer: still a way to add one.
    'partial-empty': { computer: { data: computer }, schedules: { data: base({ cron: { ...complete([]), hand: [], caps }, exec: complete([]), curl: missing('stopped'), loop: { ...complete([]), caps } }) }, ...same },
    'history-empty': { computer: { data: computer }, schedules: { data: base() }, ...same, 'history:cron:user/a1': { data: { runs: [] } } },
    'history-error': { computer: { data: computer }, schedules: { data: base() }, ...same, 'history:cron:user/a1': { error: 'server' } },
    // Changes that do not end well: the row keeps the outcome until the user checks or dismisses it.
    'act-pending': { computer: { data: computer }, schedules: { data: base() }, ...same, act: { outcome: 'pending' } },
    'act-failed': { computer: { data: computer }, schedules: { data: base() }, ...same, act: { outcome: 'failed', code: 'disabled' } },
    'act-refused': { computer: { data: computer }, schedules: { data: base() }, ...same, act: { outcome: 'not_sent' } },
    // Core refuses a repeat press while an earlier try may have gone through.
    'act-readback': { computer: { data: computer }, schedules: { data: base() }, ...same, act: { outcome: 'not_sent', code: 'READ_BACK_FIRST' } },
    'act-slow': { computer: { data: computer }, schedules: { data: base() }, ...same, act: { outcome: 'done', delayMs: 4000 } },
    'save-pending': { computer: { data: computer }, schedules: { data: base() }, ...same, save: { outcome: 'pending' } },
    'save-failed': { computer: { data: computer }, schedules: { data: base() }, ...same, save: { outcome: 'failed', code: 'invalid' } },
    // A saved line from before the kit checked the hour: the editor opens on it and says which part is wrong.
    'preview-error': { computer: { data: computer }, schedules: { data: base({ cron: { ...complete([...entries, { user: 'user', id: 'a8', name: 'night-sweep', command: 'bash ~/bin/sweep.sh', schedule: '0 24 * * *', schedule_human: '', enabled: true, run_reports: true, next_runs: [] }]), hand, caps } }) }, ...same },
  },
});
