// ModelPickPanel in the terminal, in saved mode with a draft that differs from the value: the footer commits the draft
// once and tells the host it is done, Cancel only asks the host, and a disabled panel cannot commit. The panel mounts
// the chooser, which binds to the signed-in context: the fixture session gives it one (no network).
import { providers } from '@core';
import { startFixtureMode } from '@core/transport';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { ModelPickPanel, type ModelPickPanelProps, type PickDraft } from './ModelPick';

const GPT: PickDraft = { spec: 'openai/gpt-5', thinking: '' };
const FREE: PickDraft = { spec: 'hoody-ai/hoody-free', thinking: '' };

let t: TestTerm | null = null;
beforeEach(() => { startFixtureMode(); });
afterEach(() => { t?.renderer.destroy(); t = null; });

const calls = { commit: [] as PickDraft[], done: 0, cancel: 0 };
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
const draw = async (more: Partial<ModelPickPanelProps> = {}) => {
  calls.commit.length = 0; calls.done = 0; calls.cancel = 0;
  t = await drawTest(
    <FocusRoot><OverlayHost><PaneSize>
      <ModelPickPanel label="Model" catalogue={null} computer={null} rules={providers.rulesFor('bot')} purpose="bot" go={() => undefined} value={GPT} draft={FREE}
        onDraft={() => undefined} mode="saved" onCommit={(d) => { calls.commit.push(d); return { kind: 'done' }; }}
        onDone={() => { calls.done += 1; }} onCancel={() => { calls.cancel += 1; }} {...more} />
    </PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 50 });
  return settle();
};
const button = (name: string) => getAllByRole(tree(), 'button', { name })[0]!;

test('Use this model commits the draft once and tells the host it is done', async () => {
  const f = await draw();
  expect(f).toContain('Choose a computer first.');
  act(button('Use this model'), 'press');
  await settle();
  expect(calls.commit).toEqual([FREE]);
  expect(calls.done).toBe(1);
  expect(calls.cancel).toBe(0);
});

test('Cancel only asks the host; nothing is committed', async () => {
  await draw();
  act(button('Cancel'), 'press');
  await settle();
  expect(calls.cancel).toBe(1);
  expect(calls.commit).toHaveLength(0);
});

test('disabled, a changed draft cannot be committed', async () => {
  await draw({ isDisabled: true });
  expect(button('Use this model').states.disabled).toBe(true);
  expect(calls.commit).toHaveLength(0);
});
