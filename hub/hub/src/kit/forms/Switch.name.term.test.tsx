// The kit Switch's name in the terminal is the web's: an `aria-label` wins over the drawn label. A row's switch draws a
// state word ("On", "Off") and names its setting in `aria-label` ("Auto-renew for n12", billing SubscriptionsSection;
// scripts MagicPanel / StepSettings): the web input carries that aria-label, so a screen reader hears the setting. The
// terminal named the switch by its drawn word first, so every such row was a switch "On" or "Off" in the semantics
// tree (what tests and agents read) and none could be told apart. The drawn word stays on screen.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { Switch } from './fields';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const switches = (): Array<{ name: string; checked: boolean }> =>
  queryAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'switch').map((n) => ({ name: n.name, checked: n.states.checked === true }));

test('a drawn state word and an aria-label: named by the aria-label, the word still drawn', async () => {
  t = await drawTest(
    <FocusRoot>
      <Box dir="column">
        <Switch label="On" aria-label="Auto-renew for n12" isSelected onChange={() => {}} />
        <Switch label="Off" aria-label="Auto-renew for Singapore M" isSelected={false} onChange={() => {}} />
      </Box>
    </FocusRoot>,
    { width: 40, height: 6 },
  );
  const frame = await t.settle();
  expect(switches()).toEqual([
    { name: 'Auto-renew for n12', checked: true },
    { name: 'Auto-renew for Singapore M', checked: false },
  ]);
  expect(frame).toContain('On');
  expect(frame).toContain('Off');
  expect(frame).not.toContain('Auto-renew for');
});

test('control: a label alone names the switch (unchanged)', async () => {
  t = await drawTest(<FocusRoot><Switch label="Email me" isSelected={false} onChange={() => {}} /></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  expect(switches()).toEqual([{ name: 'Email me', checked: false }]);
});

test('control: an empty drawn label and an aria-label (schedules row): named by the aria-label', async () => {
  t = await drawTest(<FocusRoot><Switch label="" aria-label="Pause backup" isSelected onChange={() => {}} /></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  expect(switches()).toEqual([{ name: 'Pause backup', checked: true }]);
});
