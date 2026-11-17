// ModelPickPanel in the terminal: the commit's outcomes. ModelPick.term.tsx keeps its own copy of the web panel's
// commit rules ("line for line"), and only the web test (ModelPick.test.tsx) pinned them. Saved mode, a draft that
// differs from the value, no computer (the chooser draws "Choose a computer first."; the footer still commits):
//   - refused: its words as an alert, Use this model offered again; pending: "Not confirmed yet", Use this model off
//   - a commit that throws reads as pending, never as saved
//   - while the answer is out the button is busy and Enter sends nothing more (a sent change is never resent)
//   - pending ends only when the caller's value becomes what was sent: not on an unrelated change, nor a change and back
//   - an answer that finds the value already moved to what was sent leaves nothing waiting; a change and back before it
//     proves nothing
//   - an answer after the panel went closes nothing
import { providers } from '@core';
import { startFixtureMode } from '@core/transport';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { ModelPickPanel, type ModelPickPanelProps, type PickDraft, type PickOutcome } from './ModelPick';

const GPT: PickDraft = { spec: 'openai/gpt-5', thinking: '' };
const GPT_HIGH: PickDraft = { spec: 'openai/gpt-5', thinking: 'high' };
const FREE: PickDraft = { spec: 'hoody-ai/hoody-free', thinking: '' };
const PENDING = 'Not confirmed yet.';

let t: TestTerm | null = null;
beforeEach(() => { startFixtureMode(); });
afterEach(() => { t?.renderer.destroy(); t = null; });

const calls = { commit: [] as PickDraft[], done: 0 };
let setValueOut: (v: PickDraft) => void = () => {};
let setShownOut: (on: boolean) => void = () => {};
/** The page around the panel: it holds the saved value (a save that landed moves it) and can take the panel away. */
function Host({ onCommit }: { onCommit: ModelPickPanelProps['onCommit'] }) {
  const [value, setValue] = useState<PickDraft>(GPT);
  const [shown, setShown] = useState(true);
  setValueOut = setValue;
  setShownOut = setShown;
  return (
    <FocusRoot><OverlayHost><PaneSize>
      {shown ? (
        <ModelPickPanel label="Model" catalogue={null} computer={null} rules={providers.rulesFor('bot')} purpose="bot" go={() => undefined} value={value} draft={FREE}
          onDraft={() => undefined} mode="saved" onCommit={onCommit} onDone={() => { calls.done += 1; }} onCancel={() => undefined} />
      ) : null}
    </PaneSize></OverlayHost></FocusRoot>
  );
}
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
const draw = async (onCommit: ModelPickPanelProps['onCommit']) => {
  calls.commit.length = 0; calls.done = 0;
  t = await drawTest(<Host onCommit={onCommit} />, { width: 100, height: 50 });
  return settle();
};
const useIt = () => getAllByRole(tree(), 'button', { name: 'Use this model' })[0]!;
const step = async (fn: () => void) => { fn(); return settle(); };
/** An onCommit whose answer the test gives later. */
function deferred() {
  let give: (o: PickOutcome) => void = () => undefined;
  const answer = new Promise<PickOutcome>((r) => { give = r; });
  return { onCommit: (d: PickDraft) => { calls.commit.push(d); return answer; }, give: (o: PickOutcome) => give(o) };
}

// Catches the outcome lines (ModelPick.term.tsx 208-217) and the footer's `busy` (186).
test('refused: its words as an alert and Use this model offered again; then pending: not confirmed, Use this model off', async () => {
  let answer: PickOutcome = { kind: 'refused', text: 'This model needs an output cap here.' };
  let f = await draw((d) => { calls.commit.push(d); return answer; });
  expect(f).toContain('Choose a computer first.');
  f = await step(() => act(useIt(), 'press'));
  expect(calls.commit).toEqual([FREE]);
  expect(f).toContain('This model needs an output cap here.');
  expect(f).not.toContain(PENDING);
  expect(useIt().states.disabled).toBeUndefined();
  expect(calls.done).toBe(0);
  answer = { kind: 'pending' };
  f = await step(() => act(useIt(), 'press'));
  expect(calls.commit).toEqual([FREE, FREE]);
  expect(f).toContain(PENDING);
  expect(f).not.toContain('This model needs an output cap here.');
  expect(useIt().states.disabled).toBe(true);
  expect(calls.done).toBe(0);
});

// Catches the catch around onCommit (lines 113-116): a throw is a lost answer, never "saved".
test('a commit that throws reads as pending, never as saved', async () => {
  await draw((d) => { calls.commit.push(d); return Promise.reject(new Error('lost')); });
  const f = await step(() => act(useIt(), 'press'));
  expect(calls.commit).toEqual([FREE]);
  expect(f).toContain(PENDING);
  expect(calls.done).toBe(0);
});

// Catches `busy` on the footer button (line 186; SoftPress drops its press while busy): Enter again sends nothing.
test('while the answer is out the button is busy and Enter sends nothing more; done then tells the host once', async () => {
  const d = deferred();
  await draw(d.onCommit);
  await step(() => act(useIt(), 'press'));
  expect(useIt().states.busy).toBe(true);
  await step(() => t!.mockInput.pressEnter());
  await step(() => t!.mockInput.pressEnter());
  expect(calls.commit).toEqual([FREE]);
  expect(calls.done).toBe(0);
  d.give({ kind: 'done' });
  await settle();
  expect(calls.done).toBe(1);
  expect(calls.commit).toEqual([FREE]);
});

// Catches pendingFor (lines 72, 82-87, 126): only the value it sent ends a pending save.
test('pending waits through an unrelated change and a change and back; it ends when the value becomes what it sent', async () => {
  await draw((d) => { calls.commit.push(d); return { kind: 'pending' }; });
  let f = await step(() => act(useIt(), 'press'));
  expect(f).toContain(PENDING);
  f = await step(() => setValueOut(GPT_HIGH)); // another field's level moved, not this save
  expect(f).toContain(PENDING);
  f = await step(() => setValueOut(GPT)); // and back
  expect(f).toContain(PENDING);
  f = await step(() => setValueOut(FREE)); // the save landed
  expect(f).not.toContain(PENDING);
  expect(calls.commit).toEqual([FREE]);
  expect(calls.done).toBe(0);
});

// Catches the late-answer check (lines 120-125): the value already moved to what was sent = nothing waits.
test('a value that becomes what was sent before a pending answer arrives leaves nothing waiting', async () => {
  const d = deferred();
  await draw(d.onCommit);
  await step(() => act(useIt(), 'press'));
  await step(() => setValueOut(FREE));
  d.give({ kind: 'pending' });
  const f = await settle();
  expect(f).not.toContain(PENDING);
});

// Catches the same check's other half (`atValue !== draftKey(sent)` and valueNow): a change and back is no answer.
test('a change and back before a pending answer is no answer: the panel waits', async () => {
  const d = deferred();
  await draw(d.onCommit);
  await step(() => act(useIt(), 'press'));
  await step(() => setValueOut(GPT_HIGH));
  await step(() => setValueOut(GPT));
  d.give({ kind: 'pending' });
  const f = await settle();
  expect(f).toContain(PENDING);
  expect(useIt().states.disabled).toBe(true);
});

// Catches `alive` (lines 55, 62-67, 117): an answer for a panel that is gone closes nothing.
test('an answer after the panel went closes nothing', async () => {
  const d = deferred();
  await draw(d.onCommit);
  await step(() => act(useIt(), 'press'));
  const f = await step(() => setShownOut(false));
  expect(f).not.toContain('Use this model');
  d.give({ kind: 'done' });
  await settle();
  expect(calls.done).toBe(0);
  expect(calls.commit).toEqual([FREE]);
});
