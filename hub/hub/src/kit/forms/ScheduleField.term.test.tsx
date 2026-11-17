// ScheduleField in the terminal (ScheduleField.term.tsx on ScheduleField.pure.ts and kit/cron.ts). The scenario file
// holds the custom box, its lock and its error; these hold the presets a person builds with the keyboard:
//   - the kind list (8 kinds: it has a search box) picks a preset; its time box and the next runs (UTC) show under it
//   - ↑ in the time box moves the run by 15 minutes and reports the new expression
//   - a time that is not a time says so and never reports a broken expression; finishing it reschedules
//   - weekly: the one ticked day is locked (Tab skips it, so a schedule can never lose its last day); ticking another frees it
//   - the page error sits under the kind select for a preset, in place of the next runs
//   - disabled: nothing opens and nothing is reported
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { ScheduleField } from './ScheduleField';

/** Monday 2026-01-05 12:00 UTC: the next daily 08:00 runs are 01-06, 01-07, 01-08. */
const NOW = Date.UTC(2026, 0, 5, 12, 0, 0);
/** The frame with every run of blanks (line ends included) as one space: a wrapped sentence reads whole. */
const flat = (f: string) => f.replace(/\s+/g, ' ');

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Sched({ seen, initial, disabled, error }: { seen: (string | null)[]; initial: string | null; disabled?: boolean; error?: string }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <FocusRoot>
      <ScheduleField label="Schedule" value={v} now={NOW} isDisabled={disabled} errorMessage={error} onChange={(x) => { seen.push(x); setV(x); }} />
    </FocusRoot>
  );
}
const draw = async (p: Parameters<typeof Sched>[0]): Promise<string> => {
  t = await drawTest(<Sched {...p} />, { width: 100, height: 30 });
  return t.settle();
};
const tab = async (n = 1, shift = false) => { for (let i = 0; i < n; i++) { t!.mockInput.pressTab(shift ? { shift: true } : undefined); await t!.settle(); } };

// Catches pick() / set() (ScheduleField.pure.ts) or the kind Select's onChange (ScheduleField.term.tsx line 19) not
// reaching the page, and the time box (line 24) or the preview (the Select's description) not following the kind.
test('Never → Every day: the kind list picks it; 08:00 daily, the time box and the next three runs in UTC', async () => {
  const seen: (string | null)[] = [];
  let f = await draw({ seen, initial: null });
  expect(f).toMatch(/Never\s+▾/);
  expect(f).not.toContain('Time (UTC)');
  await tab();
  t!.mockInput.pressEnter();
  await t!.settle();
  // Eight kinds: the list opens on its search box.
  await t!.mockInput.typeText('every day');
  await t!.settle();
  t!.mockInput.pressEnter(); // search → list
  await t!.settle();
  t!.mockInput.pressEnter(); // pick the one row left
  f = await t!.settle();
  expect(seen).toEqual(['0 8 * * *']);
  expect(f).toMatch(/Every day\s+▾/);
  expect(f).toContain('Time (UTC)');
  expect(f).toMatch(/[│┃] 08:00/);
  expect(flat(f)).toContain('Next runs, calculated here (UTC): 2026-01-06 08:00 · 2026-01-07 08:00 · 2026-01-08 08:00');
});

// Catches onTime (ScheduleField.pure.ts) or the TimeField wiring (line 24): ↑ is the TimeField's 15-minute step.
test('↑ in the time box moves the run to 08:15 and reports it', async () => {
  const seen: (string | null)[] = [];
  await draw({ seen, initial: '0 8 * * *' });
  await tab(2);
  t!.mockInput.pressArrow('up');
  const f = await t!.settle();
  expect(seen).toEqual(['15 8 * * *']);
  expect(f).toMatch(/[│┃] 08:15/);
  expect(flat(f)).toContain('2026-01-06 08:15');
});

// Catches timeBad / the time box's errorMessage (line 24): an empty box and "08:" are not a time, so the field says so
// and the page gets no expression built from them; typing the rest of a time reschedules and the error goes.
test('a time that is not a time says so and reports nothing broken; finishing it reschedules', async () => {
  const seen: (string | null)[] = [];
  await draw({ seen, initial: '0 8 * * *' });
  await tab(2);
  t!.mockInput.pressKey('u', { ctrl: true }); // clear the box
  await t!.mockInput.typeText('08:');
  let f = await t!.settle();
  expect(flat(f)).toContain('Write the time as HH:MM, for example 08:30.');
  expect(seen).toEqual([]);
  await t!.mockInput.typeText('45');
  f = await t!.settle();
  expect(seen.at(-1)).toBe('45 8 * * *');
  expect(flat(f)).not.toContain('Write the time as HH:MM');
  expect(flat(f)).toContain('2026-01-06 08:45');
});

// Catches the last-day lock (line 33: isDisabled when it is the only day): without it Tab lands on Monday and Space
// unticks it, leaving no day (no expression can be made of that).
test('weekly: the only ticked day is locked and skipped by Tab; ticking Tuesday frees Monday', async () => {
  const seen: (string | null)[] = [];
  let f = await draw({ seen, initial: '0 8 * * 1' });
  expect(f).toMatch(/On chosen days\s+▾/);
  expect(f).toContain('[x] Monday');
  expect(f).toContain('[ ] Tuesday');
  await tab(3); // kind, time, then Tuesday (Monday is locked)
  t!.mockInput.pressKey(' ');
  f = await t!.settle();
  expect(seen).toEqual(['0 8 * * 1,2']);
  expect(f).toContain('[x] Tuesday');
  // Monday is no longer the only day: it takes the focus and unticks.
  await tab(1, true);
  t!.mockInput.pressKey(' ');
  f = await t!.settle();
  expect(seen).toEqual(['0 8 * * 1,2', '0 8 * * 2']);
  expect(f).toContain('[ ] Monday');
  expect(f).toContain('[x] Tuesday');
});

// Catches the error routing on line 19 (`kind !== 'custom' ? errorMessage : undefined`): for a preset the error is
// under the kind select, once, and the next runs give way to it.
test('a page error on a preset sits under the kind select, once, in place of the next runs', async () => {
  const f = await draw({ seen: [], initial: '0 8 * * *', error: 'The computer refused this schedule.' });
  expect(f).toContain('✗ The computer refused this schedule.');
  expect(f.split('The computer refused this schedule.').length - 1).toBe(1);
  expect(flat(f)).not.toContain('Next runs');
  expect(f.indexOf('The computer refused')).toBeLessThan(f.indexOf('Time (UTC)'));
});

// Catches isDisabled not reaching the kind select or the time box (lines 19, 24).
test('disabled: the time box reads unavailable; keys open nothing and report nothing', async () => {
  const seen: (string | null)[] = [];
  let f = await draw({ seen, initial: '0 8 * * *', disabled: true });
  expect(f).toContain('Time (UTC) (unavailable)');
  await tab();
  t!.mockInput.pressEnter();
  await t!.settle();
  t!.mockInput.pressArrow('up');
  f = await t!.settle();
  expect(seen).toEqual([]);
  expect(f).not.toContain('Every hour');
  expect(f).toMatch(/[│┃] 08:00/);
});
