// Vitest: the line Last result shows of a failed run is the run's masked output, never the raw text,
// and only the newest run counts (a failure under a later success is not "why the last run failed").
import { describe, expect, it } from 'vitest';
import type { HistoryRun } from './data';
import { firstOutputLine, newestFailed } from './parts/failLine';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const run = (result: HistoryRun['result'], output?: string): HistoryRun => ({ id: `r-${result}`, at: 1, result, ...(output !== undefined ? { output } : {}) });

describe('firstOutputLine', () => {
  it('masks before it shows: a password and URL credentials never appear', () => {
    expect(firstOutputLine('login failed password=hunter2')).not.toContain('hunter2');
    expect(firstOutputLine(fake('fetch https://bob:', 's3cret@example.org/x: 401'))).not.toContain('s3cret');
    expect(firstOutputLine('API_KEY=abc123 rejected')).not.toContain('abc123');
  });

  it('takes the first line with text, trimmed, and cuts a long one', () => {
    expect(firstOutputLine('\n   \n  rclone: timeout  \nexit status 1')).toBe('rclone: timeout');
    const long = firstOutputLine('x'.repeat(400));
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
    expect(firstOutputLine(undefined)).toBe('');
  });
});

describe('newestFailed', () => {
  it('is the newest run when it failed or was lost', () => {
    expect(newestFailed([run('failed', 'a'), run('ok')])?.result).toBe('failed');
    expect(newestFailed([run('lost'), run('ok')])?.result).toBe('lost');
  });

  it('is nothing when the newest run did not fail, even if an older one did', () => {
    expect(newestFailed([run('ok'), run('failed', 'a')])).toBeNull();
    expect(newestFailed([run('running'), run('failed', 'a')])).toBeNull();
    expect(newestFailed([])).toBeNull();
    expect(newestFailed(undefined)).toBeNull();
  });
});
