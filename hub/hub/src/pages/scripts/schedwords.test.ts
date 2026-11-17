// Vitest: a schedule in words, on the shared preset model (kit/cron.ts via @kit/pure). The three old
// presets read as they always did; the other preset shapes now have words too; any other expression (and none) is null,
// shown as written.
import { makeT } from '@kit';
import { describe, expect, it } from 'vitest';
import { cronOf, schedText } from './parts/schedWords';
import strings from './strings.en.json';

const t = makeT(strings);

describe('schedText', () => {
  it('keeps the words the list always used for the three old presets', () => {
    expect(schedText(t, '0 * * * *')).toBe(strings['sched.hourly']);
    expect(schedText(t, '0 8 * * *')).toBe(strings['sched.daily']);
    expect(schedText(t, '0 8 * * 1')).toBe(strings['sched.weekly']);
    expect(schedText(t, '  0   8 * *  1 ')).toBe('Every Monday at 8:00');
  });

  it('names every preset shape of the Schedules editor', () => {
    expect(schedText(t, '*/15 * * * *')).toBe('Every 15 minutes');
    expect(schedText(t, '30 * * * *')).toBe('Every hour at 30 minutes past');
    expect(schedText(t, '5 9 * * 1-5')).toBe('Weekdays at 9:05');
    expect(schedText(t, '0 18 * * 1,3,5')).toBe('Every Monday, Wednesday, Friday at 18:00');
    expect(schedText(t, '0 6 15 * *')).toBe('On day 15 of each month at 6:00');
  });

  it('leaves any other expression and no schedule unnamed', () => {
    expect(schedText(t, '*/7 * * * *')).toBeNull();
    expect(schedText(t, '0 9 * 1 *')).toBeNull();
    expect(schedText(t, '@daily')).toBeNull();
    expect(schedText(t, '')).toBeNull();
    expect(schedText(t, undefined)).toBeNull();
    expect(cronOf(' 0  8 * * * ')).toBe('0 8 * * *');
  });
});
