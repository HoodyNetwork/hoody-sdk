// FaqLink in the terminal lands on its question only where the question can be seen; elsewhere it unfolds the answer
// under itself, as the web's does (Faq.tsx: a link inside an overlay peeks, so does one whose question it cannot reach).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | revealAnchor reveals nothing under a hidden box (a list pane a one-pane detail hides); in sight it reveals | 'hidden anchor' |
// | 2 | A link whose question sits in a hidden pane unfolds the answer under itself | 'hidden pane' |
// | 3 | A link inside a drawer unfolds the answer in the drawer, though the page under it holds the question | 'drawer' |
// | 4 | A link on the page whose question is in sight lands there and opens it; nothing unfolds under the link | 'in sight' |
//
// Seen on the tunnels page: the setup drawer's "Which ports are flagged?" and the detail pane's links drew nothing
// (the answer opened on the page under the drawer, or in the list pane the detail hides).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getByRole, queryAllByText, semanticsOf, within, type SemRoot } from '../../term/prim/semantics';
import { Drawer } from '../overlays/Drawer';
import { Faq, FaqLink } from './Faq';
import { routed } from './termHarness';
import { PageBody, revealAnchor } from './termScroll';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);

const ANSWER = 'Ports that open a database to the world.';
const items = [
  { id: 'ports', q: 'Which ports are flagged?', a: ANSWER },
  { id: 'other', q: 'Another question?', a: 'Short.' },
];
const LINK = 'Which ports?';

test('hidden anchor: revealAnchor reveals nothing under a hidden box; the same anchor in sight is revealed', async () => {
  const page = (hide: boolean) => (
    <FocusRoot><Box dir="column" height={10}><PageBody>
      <Box dir="column" hidden={hide}>
        <Box dir="column" shrink={0} raw={{ id: 'anchor-pane' }}><Text>IN THE PANE</Text></Box>
      </Box>
    </PageBody></Box></FocusRoot>
  );
  t = await drawTest(page(true), { width: 40, height: 10 });
  await t.settle();
  // A regression would answer true (the owner finds the node and scrolls to it; nothing is shown).
  expect(revealAnchor('anchor-pane')).toBe(false);
  t.renderer.destroy();
  t = await drawTest(page(false), { width: 40, height: 10 });
  await t.settle();
  expect(revealAnchor('anchor-pane')).toBe(true);
});

test('hidden pane: a link whose question sits in a pane hidden at this size unfolds the answer under itself', async () => {
  t = await drawTest(routed(() => (
    <Box dir="column" height={20}><PageBody>
      <Box dir="column" hidden><Faq faq={{ items }} /></Box>
      <FaqLink item={items[0]!}>{LINK}</FaqLink>
    </PageBody></Box>
  )).element, { width: 80, height: 20 });
  expect(await t.settle()).not.toContain(ANSWER);
  act(getByRole(tree(), 'link', { name: LINK }), 'press');
  await t.settle();
  // A regression would land the press (#faq-ports) and open the answer in the hidden pane: nothing new on screen.
  expect(await t.settle()).toContain(ANSWER);
});

test('drawer: a link inside a drawer unfolds the answer in the drawer, though the page under it holds the question', async () => {
  const { element, router } = routed(() => (
    <OverlayHost>
      <Box dir="column" height={24}><PageBody><Faq faq={{ items }} /></PageBody></Box>
      <Drawer isOpen onOpenChange={() => {}} title="New tunnel" size="sm" resizeKey="test-faq-reach">
        <Text>Port 5432</Text>
        <FaqLink item={items[0]!}>{LINK}</FaqLink>
      </Drawer>
    </OverlayHost>
  ));
  t = await drawTest(element, { width: 120, height: 24 });
  await t.settle();
  act(getByRole(tree(), 'link', { name: LINK }), 'press');
  await t.settle();
  await t.settle();
  const dialog = getByRole(tree(), 'dialog', { name: 'New tunnel' });
  expect(queryAllByText(within(dialog), 'Ports that open a database').length).toBe(1);
  // A regression would land the press on the page's question under the drawer.
  expect(router.state.location.hash).not.toContain('faq-ports');
});

test('in sight: a link on the page whose question is shown lands on it and opens it; nothing unfolds under the link', async () => {
  const { element, router } = routed(() => (
    <Box dir="column" height={20}><PageBody>
      <FaqLink item={items[0]!}>{LINK}</FaqLink>
      <Faq faq={{ items }} />
    </PageBody></Box>
  ));
  t = await drawTest(element, { width: 80, height: 20 });
  await t.settle();
  act(getByRole(tree(), 'link', { name: LINK }), 'press');
  await t.settle();
  await t.settle();
  expect(router.state.location.hash).toContain('faq-ports');
  getByRole(tree(), 'button', { name: items[0]!.q, expanded: true });
  // One answer: under its question, none under the link.
  expect(queryAllByText(tree(), 'Ports that open a database').length).toBe(1);
});
