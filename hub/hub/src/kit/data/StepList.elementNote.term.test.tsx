// StepList in the terminal, a note that is an element (Bots People: the issued invite code, a SecretField, under the
// "Send the code" row): it takes the text column's width and wraps inside it. In the word flow (a wrapping row) an
// element kept its own natural width and ran one cell past the column at 80x24 ("PeopleSection 38x6 past its box 37x6").
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { SecretField } from '../forms/Secret';
import { StepList } from './StepList';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (width: number, note: React.ReactNode) => {
  t = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <StepList label="Steps" groups={[{ items: [{ id: 'a', text: 'Pick their rights and create the code.' }, { id: 'b', text: 'Send the code to the person.', note }] }]} />
    </Box></FocusRoot>,
    { width: 80, height: 24 },
  );
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  return { f, cuts: layoutFaults(t.renderer.root as never, { cols: 80, rows: 24 }).filter((x) => x.kind === 'cut' || x.kind === 'overdraw').map((x) => `${x.kind} ${x.path}: ${x.detail}`) };
};

for (const w of [40, 41, 42, 43, 44, 45]) {
  test(`an element note (a secret field) at ${w} cells: inside the text column, no cut`, async () => {
    const { cuts } = await draw(w, <SecretField label="Invite code" value="ABCD-EFGH-JK" description="Send this code to the person. It works once and is not shown again." />);
    expect(cuts).toEqual([]);
  }, 30_000);
}

test('control: a text note still flows as words under its row', async () => {
  const { f, cuts } = await draw(44, 'Works once, for fifteen minutes.');
  expect(f).toContain('Works once, for fifteen');
  expect(cuts).toEqual([]);
}, 30_000);
