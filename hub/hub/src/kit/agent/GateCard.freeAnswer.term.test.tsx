// GateCard.term: a question whose agent already offers a free-answer choice shows it once, in the agent's words, never the
// card's own "Something else" beside it; picking it opens the field and the typed words are the answer.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { getByRole, semanticsOf } from '../../term/prim/semantics';
import { GateCard, type GateView } from './GateCard';
import { withGateArm } from './gateArm';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

test('the agent\'s "Something else (I\'ll describe it)" is the only free answer, and it opens the field', async () => {
  restore = withGateArm(0);
  const got: unknown[] = [];
  const q: GateView = { kind: 'question', risk: '', question: 'Which port?', options: ['3000', "Something else (I'll describe it)"] };
  const t = await drawTest(
    <FocusRoot><Box width={60}><GateCard gate={q} pending={false} unknown={false} agentUrl="" typing={false} onDecide={() => {}} onAnswer={(a) => got.push(a)} onCheck={() => {}} /></Box></FocusRoot>,
    { width: 62, height: 24 },
  );
  let f = await t.settle();
  expect(f.match(/Something else/g)?.length).toBe(1);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressArrow('up'); // from the first option back round to the last: the agent's own free answer
  f = await t.settle();
  expect(f).toContain("(•) Something else (I'll describe it)");
  expect(f).toContain('Your answer');
  getByRole(semanticsOf(t.renderer as never), 'button', { name: 'Send answer', disabled: true });
  t.mockInput.pressTab(); // the field
  await t.settle();
  await t.mockInput.typeText('9090 please');
  f = await t.settle();
  expect(f).toContain('9090 please');
  t.mockInput.pressTab(); // Send answer
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['9090 please']);
  t.renderer.destroy();
});
