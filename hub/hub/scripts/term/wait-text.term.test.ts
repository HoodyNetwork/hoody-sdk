// wait-text.ts: a shot's waitForText must be on its terminal frame; misses are owned debt rows that only shrink.
import { expect, test } from 'bun:test';
import { actionNoop, awaitText, debtListed, frameShows, stepsAct, waitShown, waitTextProblems, type WaitDebt } from './wait-text';
import { shotCase } from './goldens';

const row = (c: string, t: string): WaitDebt => ({ case: c, text: t, owner: 'pages', reason: 'seeded' });
const hit = (c: string, t: string) => ({ case: c, text: t, file: `f/${c}.120x40.txt` });
const run = (hits: ReturnType<typeof hit>[], judged: string[], debt: unknown[], o = { complete: true, update: false }) => waitTextProblems('p', 'allowance.json', hits, new Set(judged), debt, o);

test('the frame shows the text across line ends and runs of spaces', () => {
  expect(frameShows('│ Give agents   these\n│ instructions', 'Give agents these')).toBe(true);
  expect(frameShows('Give agents\nthese instructions', 'agents these instructions')).toBe(true);
  expect(frameShows('Give agents', 'Give agents these')).toBe(false);
});

test('a label the terminal draws in capitals shows its wait text (case is not compared)', () => {
  const frame = [' Home  ┃ ┌───────────────────────┐', ' VMs   ┃ │ WHAT YOU GET          │', '       ┃ │ A Linux VM in atlas.  │', '       ┃ └───────────────────────┘'].join('\n');
  expect(frameShows(frame, 'What you get')).toBe(true);
  expect(frameShows(frame, 'a linux vm in ATLAS.')).toBe(true);
  expect(frameShows(frame, 'What you got')).toBe(false);
});

test('text wrapped beside the nav column (or inside a card) is read in its own region', () => {
  // notifications shot-ack-unconfirmed at 120x40: row by row, "Programs" sat between the halves.
  const frame = [
    ' Home         │  Check again before trying it',
    ' Programs     │  twice. Nothing was sent.',
    ' Schedules    │  ┌──────────────┐',
    '              │  │ Saved for    │ side words',
    '              │  │ later today. │ more words',
    '              │  └──────────────┘',
  ].join('\n');
  expect(frameShows(frame, 'Check again before trying it twice.')).toBe(true);
  expect(frameShows(frame, 'Saved for later today.')).toBe(true);
  expect(frameShows(frame, 'trying it Programs')).toBe(true); // the row-by-row reading still counts
  expect(frameShows(frame, 'Check again before trying it three times')).toBe(false);
  expect(frameShows(frame, 'today. twice')).toBe(false);
});

test('a new miss fails; a listed miss passes and is kept', () => {
  expect(run([hit('shot-a', 'Hello')], ['shot-a'], []).problems.map((p) => p.rule)).toEqual(['shot-wait-text']);
  const r = run([hit('shot-a', 'Hello')], ['shot-a'], [row('shot-a', 'Hello')]);
  expect(r.problems).toEqual([]);
  expect(r.kept).toEqual([row('shot-a', 'Hello')]);
});

test('a listed row that no longer misses fails (fixed, or the shot is gone); --update drops it, never adds', () => {
  expect(run([], ['shot-a'], [row('shot-a', 'Hello')]).problems.map((p) => p.rule)).toEqual(['wait-text-debt-stale']);
  expect(run([], [], [row('shot-gone', 'Hi')]).problems[0]!.message).toContain('no such shot');
  const u = run([hit('shot-b', 'New')], ['shot-a', 'shot-b'], [row('shot-a', 'Hello')], { complete: true, update: true });
  expect(u.kept).toEqual([]);
  expect(u.problems.map((p) => p.rule)).toEqual(['shot-wait-text']);
  // An incomplete run (a crash) leaves the debt alone.
  expect(run([], [], [row('shot-a', 'Hello')], { complete: false, update: true }).kept).toEqual([row('shot-a', 'Hello')]);
});

test('rows need case, text, owner and reason', () => {
  expect(run([], [], [{ case: 'shot-a', text: 'x', owner: '', reason: 'r' }]).problems.map((p) => p.rule)).toContain('wait-text-debt-malformed');
});

test('shotCase carries waitForText into the case', () => {
  expect(shotCase({ name: 'w', path: '/x', waitForText: 'Give agents' }, '/ai')).toEqual({ name: 'shot-w', fx: null, path: '/ai/x', waitForText: 'Give agents' });
});

// An acting shot's wait text is judged BEFORE its steps, as the web runner does (it waits for the text, then
// clicks). account shot-name-saved waits for "Save name" and presses it: the screen after the press has no such button.
test('an acting shot: the text is waited for on the page before its steps, where it is; not after them', async () => {
  const s = { frame: ' Name  │ ada\n [Save name]', settle: async () => s.frame };
  expect(await awaitText(s, () => waitShown(s.frame, null, 'Save name'), { ms: 0 })).toBe(true);
  s.frame = ' Name  │ ada\n ✓ Saved'; // the steps ran
  expect(await awaitText(s, () => waitShown(s.frame, null, 'Save name'), { ms: 0 })).toBe(false);
});

// ai shot-instructions at 80x24: the page is idle for a moment before a late read is asked for; the shot check
// waits for the shot's text at every size instead of taking the loading frame.
test('awaitText: waits through further settles until the text shows; false when it never comes in time', async () => {
  let n = 0;
  const s = { frame: ' ░░░░░░ ', settle: async () => { if (++n === 3) s.frame = ' Instructions\n Tell the agent'; return s.frame; } };
  expect(await awaitText(s, () => waitShown(s.frame, null, 'Tell the agent'), { ms: 5000, stepMs: 1 })).toBe(true);
  expect(n).toBe(3);
  const never = { frame: ' ░░░░░░ ', settle: async () => never.frame };
  const t0 = performance.now();
  expect(await awaitText(never, () => waitShown(never.frame, null, 'Tell the agent'), { ms: 60, stepMs: 5 })).toBe(false);
  expect(performance.now() - t0).toBeGreaterThanOrEqual(55);
});

test('waitShown: the frame; below the largest size also the tree (text under the fold), case not compared', () => {
  const tree = 'main "Account"\n  text "Go through support to change it"';
  expect(waitShown(' Account\n Name', null, 'go through support')).toBe(false);
  expect(waitShown(' Account\n Name', tree, 'go through support')).toBe(true);
  expect(waitShown(' Account\n go through support', null, 'go through support')).toBe(true);
});

test('debtListed: a listed miss keeps its frame; any other miss is not stored', () => {
  const debt = [{ case: 'shot-a', text: 'Try  again', owner: 'x', reason: 'y' }, { case: 'bad' }];
  expect(debtListed(debt, 'shot-a', 'Try again')).toBe(true);
  expect(debtListed(debt, 'shot-b', 'Try again')).toBe(false);
  expect(debtListed(debt, 'bad', '')).toBe(false);
});

test('shot-action-noop: steps that act and leave frame and tree as they were', () => {
  const click = [{ click: 'Save name' }];
  expect(stepsAct(click)).toBe(true);
  expect(stepsAct([{ fill: 'Name', text: 'ada' }])).toBe(true);
  expect(stepsAct([{ press: 'Escape' }])).toBe(true);
  expect(stepsAct([{ waitFor: 'text=Saved' }, { hover: 'role=heading' }])).toBe(false);
  expect(actionNoop({ steps: click }, 'page A', 'page A')).toBe(true);
  // The page changed (the drawn text, or only the tree: a focus that moved).
  expect(actionNoop({ steps: click }, 'page A', 'page B')).toBe(false);
  // Declared: the shot expects no change.
  expect(actionNoop({ steps: click, noChange: true }, 'page A', 'page A')).toBe(false);
  // Nothing acted: a wait alone, or no steps.
  expect(actionNoop({ steps: [{ waitFor: 'text=Saved' }] }, 'page A', 'page A')).toBe(false);
  expect(actionNoop({}, null, 'page A')).toBe(false);
});

test('shotCase carries noChange to the case of an acting shot', () => {
  expect(shotCase({ name: 'ignored-key', keys: ['Escape'], noChange: true }, '/p')?.noChange).toBe(true);
  expect(shotCase({ name: 'pressed', click: 'Save' }, '/p')?.noChange).toBeUndefined();
});

// The VMs page's vector: the form shows the Verdict label in capitals; Create VM replaces the form
// with the held band, on the web too, so only the frame before the steps can show "What you get".
test('vms create-pending: the wait text is on the form before Create VM, not on the held band after it', () => {
  const before = [' VMs   ┃ New VM', '       ┃ ┌──────────────────────┐', '       ┃ │ WHAT YOU GET         │', '       ┃ │ A Linux VM in atlas. │', '       ┃ └──────────────────────┘', '       ┃ [Cancel]  [Create VM]'].join('\n');
  const after = [' VMs   ┃ New VM', '       ┃ │ ! new-1 may have been created.', '       ┃ │   [↻ Check again]'].join('\n');
  const shot = { steps: [{ fill: 'Name', text: 'new-1' }, { press: 'Tab' }, { click: 'An empty disk' }, { click: 'Create VM' }, { waitFor: 'text=may have been created' }] };
  expect(frameShows(before, 'What you get')).toBe(true);
  expect(frameShows(after, 'What you get')).toBe(false);
  expect(actionNoop(shot, before, after)).toBe(false);
});
