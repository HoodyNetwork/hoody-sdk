// Check's verdict on a held run once (C9): a Hub-made name listed once proves the run was created;
// only the daemon's status `running` says it started, `failed`/`fatal` that it did not, and every other status the
// wire can carry (or none) leaves the start unknown, never a success.
import { describe, expect, it } from 'vitest';
import { judge, startOf, type AddMeta, type Listed } from './add';

const meta = (o: Partial<AddMeta> = {}): AddMeta => ({ mode: 'once', name: 'run-once-abc-xyz', computer: 'p/c', before: [], generated: true, ...o });
const listed = (status: string | null, name = 'run-once-abc-xyz'): Listed => ({ programs: new Map(), temps: [{ name, key: 'temp:quick_1_1', status }] });

// Every status a temporary can report (program-model's states, the daemon's backoff and exited) plus none and junk.
const TABLE: [string | null, 'started' | 'notStarted' | 'unknown'][] = [
  ['running', 'started'],
  ['failed', 'notStarted'],
  ['fatal', 'notStarted'],
  ['starting', 'unknown'],
  ['stopping', 'unknown'],
  ['stopped', 'unknown'],
  ['exited', 'unknown'],
  ['finished', 'unknown'],
  ['ended', 'unknown'],
  ['backoff', 'unknown'],
  ['restarting', 'unknown'],
  ['idle', 'unknown'],
  ['off', 'unknown'],
  ['unknown', 'unknown'],
  ['RUNNING', 'unknown'],
  ['', 'unknown'],
  [null, 'unknown'],
];

describe('run once: what a proved temporary says about its start', () => {
  it.each(TABLE)('status %j -> %s', (status, start) => {
    expect(startOf(status)).toBe(start);
    expect(judge(meta(), listed(status))).toEqual({ kind: 'proved', key: 'temp:quick_1_1', start });
  });

  it('a typed name is only listed, whatever its status; two of a Hub-made name prove nothing', () => {
    for (const [status] of TABLE) expect(judge(meta({ generated: false, name: 'job' }), listed(status, 'job'))).toEqual({ kind: 'listed' });
    const two: Listed = { programs: new Map(), temps: [{ name: 'run-once-abc-xyz', key: 'temp:quick_1_1', status: 'running' }, { name: 'run-once-abc-xyz', key: 'temp:quick_1_2', status: 'running' }] };
    expect(judge(meta(), two)).toEqual({ kind: 'listed' });
  });
});
