// ModelPickField in the terminal, read as a screen reader or an agent reads it: one group named by its label and
// described by the reason Change is off (or the caller's why line) and by the caller's error, as the web field's
// aria-labelledby / aria-describedby do.
import { providers } from '@core';
import { startFixtureMode } from '@core/transport';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { ModelPickField, type ModelPickFieldProps, type PickDraft } from './ModelPick';

const GPT: PickDraft = { spec: 'openai/gpt-5', thinking: '' };
const WHY = 'Only the owner can change this.';
const ERR = 'Pick a model first.';

let t: TestTerm | null = null;
beforeEach(() => { startFixtureMode(); });
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (more: Partial<ModelPickFieldProps>): Promise<string> => {
  t = await drawTest(
    <FocusRoot><OverlayHost><PaneSize>
      <ModelPickField label="Model" catalogue={null} computer={null} rules={providers.rulesFor('bot')} purpose="bot" go={() => undefined} value={GPT}
        onCommit={() => ({ kind: 'done' })} resizeKey="test-model-pick-field" {...more} />
    </PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 20 });
  await t.settle();
  await new Promise((r) => setTimeout(r, 40));
  return t.settle();
};
const groups = (name: string) => queryAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'group').filter((g) => g.name === name);

// Catches the label and reason Texts carrying only an id: the walker reads a bare Text as text and never registers its
// id, so the group had no name and no description.
test('the field is one group named by its label, described by the reason Change is off and the error', async () => {
  const f = await draw({ disabledReason: WHY, error: ERR });
  expect(f).toContain('Model');
  expect(f).toContain(WHY);
  expect(f).toContain(ERR);
  const g = groups('Model');
  expect(g).toHaveLength(1);
  expect(g[0]!.description).toBe(`${WHY} ${ERR}`);
});

test("the caller's why line describes the field when Change is on", async () => {
  const f = await draw({ whyOverride: 'Set here, used from the next conversation.' });
  expect(f).toContain('Set here, used from the next conversation.');
  const g = groups('Model');
  expect(g).toHaveLength(1);
  expect(g[0]!.description).toBe('Set here, used from the next conversation.');
});

// The why line may be a component: the description is what it draws, not the element's props.
function Why() {
  return <>Applies from the next conversation.</>;
}
test('a why line drawn by a component describes the field with the words it draws', async () => {
  const f = await draw({ whyOverride: <Why /> });
  expect(f).toContain('Applies from the next conversation.');
  const g = groups('Model');
  expect(g).toHaveLength(1);
  expect(g[0]!.description).toBe('Applies from the next conversation.');
});
