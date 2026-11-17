// Vitest: the Programs page's own words. No tracking jargon ("settled": pages/plainwords.test.ts names it) in any of
// its strings; the restart setting has one set of names, and none of them is "Runs once" (that is the Run once mode);
// a range program's menu names its ports as the page does; a program with the Always setting next to "Stopped" does not
// claim it starts again whenever it stops; the header with no computer shown asks for no pick (zero computers too).
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';
import sandbox from './sandbox/strings.en.json';

describe('Programs words', () => {
  it('says confirmed, never settled', () => {
    const settled = Object.entries({ ...strings, ...sandbox }).filter(([, v]) => /settle/i.test(v)).map(([k]) => k);
    expect(settled).toEqual([]);
  });

  it('the restart setting: Always / After a failure / Never in the table, and the same in the detail sentences', () => {
    expect([strings['policy.always'], strings['policy.crash'], strings['policy.once']]).toEqual(['Always', 'After a failure', 'Never']);
    expect(strings['pol.crash']).toContain('after a failure');
    expect(strings['pol.once']).not.toMatch(/runs once/i);
    expect(strings['pol.always']).not.toMatch(/stops/);
  });

  it('the header with no computer shown names what the page holds, not a pick', () => {
    expect(strings['subtitle.none']).not.toMatch(/pick/i);
  });

  it('the sandbox Resources group stays within one region of explanation (150 characters)', () => {
    const keys = ['maxMemory', 'maxPids', 'maxOpenFiles', 'maxCpu', 'maxFileSize', 'tmpSize'] as const;
    expect(keys.reduce((n, k) => n + sandbox[`sb.ed.${k}.d`].length, 0)).toBeLessThanOrEqual(150);
  });

  it('a range program names its ports, not parts', () => {
    for (const k of ['restartAll', 'stopAll', 'action.restartAllName', 'action.stopAllName'] as const) expect(strings[k]).toMatch(/ ports\b/);
  });
});
