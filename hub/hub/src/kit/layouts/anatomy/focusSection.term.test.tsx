// focusSection in a terminal: the web scrolls the section's heading into view and focuses it (tabIndex -1), so the
// next Tab goes to the section's first control and Shift-Tab to the control before it. The terminal only scrolled:
// the focus stayed where it was, so after "Open firewall rules" (the Permissions tab, which a tab change removes) the
// next Tab went to the sidebar, and from a control still shown it went on from there, away from the section.
//  1. The section comes to the top; nothing has the focus; Tab goes to the section's first control.
//  2. Shift-Tab goes to the last control before the section.
//  3. An id no section has: false, and the focus stays where it was.
//  4. The landing's own focus drop is not the reader's move: a section revealed on a page still short reaches the top
//     once the page grows below it (the scroll owner's seeking anchor, termScroll.tsx).
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, FocusRegion, FocusRoot, Pressable, Text } from '../../../term/prim';
import { focusedNode, semanticsOf, type SemRoot } from '../../../term/prim/semantics';
import { PageBody } from '../termScroll';
import { AnatomySection, focusSection } from './Section';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const focused = (): string | undefined => focusedNode(tree())?.name;
const lines = (n: number, p: string) => Array.from({ length: n }, (_, i) => <Text key={i}>{`${p} ${i + 1}`}</Text>);
const Btn = ({ label }: { label: string }) => <Pressable sem={{ name: label }} onPress={() => {}}>{({ focused: on }) => <Text inverse={on}>[{label}]</Text>}</Pressable>;

async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    t!.mockInput.pressTab();
    await t!.settle();
    if (focused() === name) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

/** The shell's shape: a sidebar region beside the page's scroll owner, two sections, the second below the fold. */
function Page() {
  return (
    <FocusRoot>
      <Box dir="row" width="100%" height="100%">
        <FocusRegion order={0}><Box dir="column" width={10} shrink={0}><Btn label="Side" /></Box></FocusRegion>
        <FocusRegion order={2}>
          <Box dir="column" grow={1} minHeight={0}>
            <PageBody>
              <AnatomySection id="first" title="FIRST SECTION"><Btn label="One A" /><Btn label="One B" />{lines(20, 'first')}</AnatomySection>
              <AnatomySection id="second" title="SECOND SECTION"><Btn label="Two A" /><Btn label="Two B" /></AnatomySection>
              {lines(20, 'after')}
            </PageBody>
          </Box>
        </FocusRegion>
      </Box>
    </FocusRoot>
  );
}

test('focusSection: the section comes to the top, the focus is dropped, and Tab goes to its first control', async () => {
  t = await drawTest(<Page />, { width: 60, height: 12 });
  await t.settle();
  await tabTo('One A');
  expect(focusSection('second')).toBe(true);
  const f = await t.settle();
  expect(f.split('\n').slice(0, 2).join('\n')).toContain('SECOND SECTION');
  expect(focused()).toBeUndefined();
  t.mockInput.pressTab();
  await t.settle();
  expect(focused()).toBe('Two A');
});

test('focusSection: Shift-Tab goes to the last control before the section', async () => {
  t = await drawTest(<Page />, { width: 60, height: 12 });
  await t.settle();
  await tabTo('One A');
  expect(focusSection('second')).toBe(true);
  await t.settle();
  t.mockInput.pressTab({ shift: true });
  await t.settle();
  expect(focused()).toBe('One B');
});

test('focusSection: an id no section has answers false and leaves the focus where it was', async () => {
  t = await drawTest(<Page />, { width: 60, height: 12 });
  await t.settle();
  await tabTo('One A');
  expect(focusSection('nowhere')).toBe(false);
  await t.settle();
  expect(focused()).toBe('One A');
});

let growBelow: ((n: number) => void) | null = null;
function Below() {
  const [n, set] = useState(3);
  useEffect(() => { growBelow = set; return () => { growBelow = null; }; }, []);
  return <Box dir="column" shrink={0}>{lines(n, 'below')}</Box>;
}
test('focusSection on a page still short: its own focus drop does not stop the section reaching the top as the page grows', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageBody>
      <Btn label="Top" />
      {lines(11, 'above')}
      <AnatomySection id="last" title="LAST SECTION"><Btn label="In" /></AnatomySection>
      <Below />
    </PageBody></Box></FocusRoot>, { width: 40, height: 10 });
  await t.settle();
  await tabTo('Top');
  // The page ends a few rows under the section: a 'start' reveal is clamped, the section sits lower (its frame's top
  // border on one row, its title on the next).
  const titleRow = (frame: string): number => frame.split('\n').findIndex((l) => l.includes('LAST SECTION'));
  expect(focusSection('last')).toBe(true);
  let f = await t.settle();
  expect(titleRow(f)).toBeGreaterThan(1);
  expect(focused()).toBeUndefined();
  // The rest of the page arrives below: the section moves up to the first row, as the reveal asked.
  growBelow!(30);
  f = await t.settle();
  expect(titleRow(f)).toBe(1);
  t.mockInput.pressTab();
  await t.settle();
  expect(focused()).toBe('In');
});
