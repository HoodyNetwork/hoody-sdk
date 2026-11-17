// Vitest: a line that blames a stopped program shows only when that source has a schedule it knows of.
// A stopped Curl can't be listed, so it never has one: no "Web-request schedules are paused" on a computer that may
// have none. A source that could not be read while its schedules may still run keeps its line (C9).
import { describe, expect, it } from 'vitest';
import { sourceNote } from './parts/words';
import strings from './strings.en.json';

const t = (k: string, v?: Record<string, unknown>): string => (strings as Record<string, string>)[k]!.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(v?.[n] ?? ''));
const T = t as unknown as Parameters<typeof sourceNote>[0];

describe('sourceNote', () => {
  it('says nothing for a stopped Curl or system scheduler with no schedule known', () => {
    expect(sourceNote(T, 'curl', { state: 'stopped', complete: false, count: 0 })).toBeNull();
    expect(sourceNote(T, 'cron', { state: 'stopped', complete: false, count: 0 })).toBeNull();
  });

  it('names the stopped program when a schedule of it is known', () => {
    expect(sourceNote(T, 'curl', { state: 'stopped', complete: false, count: 2 })).toBe(strings['line.curl_stopped']);
    expect(sourceNote(T, 'cron', { state: 'stopped', complete: false, count: 1 })).toBe(strings['line.cron_stopped']);
  });

  it('keeps the lines about schedules that may still run, with none known', () => {
    expect(sourceNote(T, 'cron', { state: 'down', complete: false, count: 0 })).toBe(strings['line.cron_down']);
    expect(sourceNote(T, 'curl', { state: 'failed', complete: false, count: 0 })).toBe(strings['n.curlFailed']);
    expect(sourceNote(T, 'curl', { state: 'not_checked', complete: false, count: 0 })).not.toBeNull();
  });

  it('says nothing for a source read completely', () => {
    expect(sourceNote(T, 'curl', { state: 'ok', complete: true, count: 0 })).toBeNull();
  });
});
