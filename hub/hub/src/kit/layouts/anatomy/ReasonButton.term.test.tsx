// ReasonButton in the terminal: a soft-disabled kit Button that tells the page about a press (the web's
// ReasonButton.press.test.tsx; no terminal test had it). It stays a Tab stop, its reason shows under it while it has the
// focus and is read with its name, and Enter, Space or a click reach the page's `onPress` and nothing else.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, FocusRoot } from '../../../term/prim';
import { focusedNode, getByRole, semanticsOf } from '../../../term/prim/semantics';
import { Button } from '../../controls/Button';
import { ReasonButton } from './ReasonButton';

const WHY = 'Add funds first';
let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as never);

async function draw(heard: string[], o: { notice?: boolean; name?: string } = {}): Promise<string> {
  t = await drawTest(
    <FocusRoot>
      <Box dir="column" gap={1}>
        <Button autoFocus onPress={() => heard.push('first')}>First</Button>
        <ReasonButton reason={WHY} {...(o.name ? { name: o.name } : {})} {...(o.notice === false ? {} : { onPress: () => heard.push('notice') })}>Confirm</ReasonButton>
      </Box>
    </FocusRoot>,
    { width: 50, height: 8 },
  );
  return t.settle();
}

// Catches the notice (ReasonButton.term.tsx line 15: SoftPressNotice carries `onPress`) and the soft state (line 16:
// isDisabled with disabledReason): a Tab stop, read as disabled with its reason, the reason drawn while focused.
test('Enter and Space on it tell the page; it stays focused, disabled to a reader, and shows its reason', async () => {
  const heard: string[] = [];
  let f = await draw(heard);
  expect(f).toContain('[Confirm]');
  expect(f).not.toContain(WHY);
  t!.mockInput.pressTab();
  f = await t!.settle();
  const node = focusedNode(tree());
  expect(node?.name).toBe('Confirm');
  expect(node?.states.disabled).toBe(true);
  expect(node?.description).toBe(WHY);
  expect(f).toContain(WHY);
  t!.mockInput.pressEnter();
  await t!.settle();
  t!.mockInput.pressKey(' ');
  f = await t!.settle();
  expect(heard).toEqual(['notice', 'notice']);
  expect(focusedNode(tree())?.name).toBe('Confirm');
  expect(f).toContain(WHY);
});

// Catches the same line 15 for the pointer: a click is a press too.
test('a click on it tells the page once', async () => {
  const heard: string[] = [];
  const f = await draw(heard);
  const rows = f.split('\n');
  const y = rows.findIndex((l) => l.includes('[Confirm]'));
  expect(y).toBeGreaterThanOrEqual(0);
  await t!.mockMouse.click(rows[y]!.indexOf('[Confirm]') + 2, y);
  await t!.settle();
  expect(heard).toEqual(['notice']);
});

// Catches the name (line 16: `name` becomes aria-label) and a missing `onPress` (nothing hears the press, nothing runs).
test('`name` names it; with no onPress, Enter does nothing and the reason still shows', async () => {
  const heard: string[] = [];
  await draw(heard, { notice: false, name: 'Confirm the order' });
  expect(getByRole(tree(), 'button', { name: 'Confirm the order' }).states.disabled).toBe(true);
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  const f = await t!.settle();
  expect(heard).toEqual([]);
  expect(focusedNode(tree())?.name).toBe('Confirm the order');
  expect(f).toContain(WHY);
});
