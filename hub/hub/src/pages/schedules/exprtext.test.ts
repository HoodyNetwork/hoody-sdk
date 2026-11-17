// Vitest: what a typed cron expression means, in words, under the editor's Cron expression field. The
// common shapes read as the list reads them; anything else has no words (its next runs still show).
import { describe, expect, it } from 'vitest';
import { exprText } from './parts/words';
import strings from './strings.en.json';

// The page's own spelling of keys: plural keys pick _one/_other; {{x}} placeholders are filled.
const t = ((k: string, o?: Record<string, unknown>) => {
  const n = o?.count as number | undefined;
  const raw = (strings as Record<string, string>)[n === undefined ? k : `${k}_${n === 1 ? 'one' : 'other'}`] ?? k;
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, x: string) => String(o?.[x] ?? ''));
}) as never;

describe('exprText', () => {
  it('reads every minute, every n minutes and the presets', () => {
    expect(exprText(t, 'cron', '* * * * *')).toBe('Every minute');
    expect(exprText(t, 'cron', '*/15 * * * *')).toBe('Every 15 minutes');
    expect(exprText(t, 'cron', '*/20 * * * *')).toBe('Every 20 minutes');
    expect(exprText(t, 'cron', '5 * * * *')).toBe('Every hour at :05');
    expect(exprText(t, 'cron', '0 8 * * *')).toBe('Every day at 08:00');
    expect(exprText(t, 'cron', '30 9 * * 1-5')).toBe('Weekdays at 09:30');
    expect(exprText(t, 'cron', '0 3 1 * *')).toBe('Monthly on day 1 at 03:00');
    expect(exprText(t, 'cron', '  0  8 * *  * ')).toBe('Every day at 08:00');
  });

  it('reads web requests with their seconds field', () => {
    expect(exprText(t, 'curl', '0 * * * * *')).toBe('Every minute');
    expect(exprText(t, 'curl', '0 0 8 * * *')).toBe('Every day at 08:00');
    expect(exprText(t, 'curl', ' 0 */15 * * * * ')).toBe('Every 15 minutes');
  });

  it('a step that does not divide the hour has no words: cron restarts it each hour (*/7 runs at :56 then :00)', () => {
    expect(exprText(t, 'cron', '*/7 * * * *')).toBeNull();
    expect(exprText(t, 'cron', '*/59 * * * *')).toBeNull();
    expect(exprText(t, 'cron', '*/45 * * * *')).toBeNull();
    expect(exprText(t, 'curl', '0 */7 * * * *')).toBeNull();
  });

  it('a web request the save would refuse for its spacing has no words', () => {
    expect(exprText(t, 'curl', '0  0 8 * * *')).toBeNull();
    expect(exprText(t, 'curl', '0\t0 8 * * *')).toBeNull();
    expect(exprText(t, 'curl', '0 0  8 * * *')).toBeNull();
  });

  it('has no words for anything else, an out-of-range field or an empty field', () => {
    expect(exprText(t, 'cron', '0 9-17 * * *')).toBeNull();
    expect(exprText(t, 'cron', '*/0 * * * *')).toBeNull();
    expect(exprText(t, 'cron', '*/60 * * * *')).toBeNull();
    expect(exprText(t, 'cron', '61 * * * *')).toBeNull();
    expect(exprText(t, 'cron', '')).toBeNull();
    expect(exprText(t, 'cron', '* * * *')).toBeNull();
  });
});
