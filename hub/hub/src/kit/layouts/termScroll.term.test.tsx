// PageOutlet: the shell's default page scroll owner. A page with no kit layout scrolls under it (Page keys, Tab follows
// the focus); a page whose layout draws its own PageBody claims it, and the outlet stands down so that PageBody is the
// one bounded scroll (its header stays put while its body scrolls).
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Pressable, Text } from '../../term/prim';
import type { BoxRenderable } from '../../term/prim/otui';
import { clearOfSticky, useSticky, type StickySpec } from '../../term/jsx/sticky';
import { PageBody, PageOutlet, revealAnchor } from './termScroll';
import { beginTermSession } from '../../term/env/session';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

// mockInput has no PageDown name ('pagedown' would type its letters): the terminal's own escape sequence.
const PAGE_DOWN = '\x1b[6~';
const rows = (n: number, p: string) => Array.from({ length: n }, (_, i) => <Text key={i}>{`${p} ${i + 1}`}</Text>);
const Btn = ({ label }: { label: string }) => <Pressable sem={{ name: label }} onPress={() => {}}>{({ focused }) => <Text inverse={focused}>[{label}]</Text>}</Pressable>;

test('a page with no layout scrolls under the outlet: PageDown, and Tab to a button below the fold', async () => {
  t = await drawTest(<FocusRoot><Box dir="column" height={10}><PageOutlet>{rows(30, 'line')}<Btn label="Bottom" /></PageOutlet></Box></FocusRoot>, { width: 40, height: 10 });
  let f = await t.settle();
  expect(f).toContain('line 1');
  expect(f).not.toContain('[Bottom]');
  t.mockInput.pressKey(PAGE_DOWN);
  f = await t.settle();
  expect(f).not.toMatch(/^line 1 /m);
  t.mockInput.pressKey('HOME');
  await t.settle();
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('[Bottom]');
});

test('a layout with its own PageBody claims the outlet: its header stays, its body scrolls, one owner', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}>
      <PageOutlet>
        <Box dir="column" grow={1} minHeight={0}>
          <Text shrink={0}>HEADER</Text>
          <PageBody>{rows(30, 'item')}<Btn label="Last" /></PageBody>
        </Box>
      </PageOutlet>
    </Box></FocusRoot>, { width: 40, height: 10 });
  let f = await t.settle();
  expect(f.split('\n')[0]).toContain('HEADER');
  t.mockInput.pressKey(PAGE_DOWN);
  f = await t.settle();
  expect(f.split('\n')[0]).toContain('HEADER');
  expect(f).not.toMatch(/^item 1 /m);
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f.split('\n')[0]).toContain('HEADER');
  expect(f).toContain('[Last]');
});

// Sticky-aware focus (the web's scroll-padding effect): a control the focus moves to never ends under a sticky header
// or footer of the scroll owner it is in.
test('clearOfSticky: moves as little as possible to clear the covered edges; a too-tall thing shows its top', () => {
  // Viewport 10 rows, footer covers the last 2: a thing on content rows 9-9 at scrollTop 0 needs scrollTop 2.
  expect(clearOfSticky({ top: 9, height: 1 }, 0, 10, { top: 0, bottom: 2 })).toBe(2);
  // Already clear: unchanged.
  expect(clearOfSticky({ top: 4, height: 1 }, 0, 10, { top: 0, bottom: 2 })).toBe(0);
  // Header covers the first row: a thing at row 5 with scrollTop 5 moves up one.
  expect(clearOfSticky({ top: 5, height: 1 }, 5, 10, { top: 1, bottom: 0 })).toBe(4);
  // Taller than the room left: its top shows, under the header.
  expect(clearOfSticky({ top: 20, height: 12 }, 0, 10, { top: 1, bottom: 2 })).toBe(19);
  expect(clearOfSticky({ top: 0, height: 1 }, 3, 10, { top: 2, bottom: 0 })).toBe(0);
});

function Sticky({ spec, children }: { spec: StickySpec; children: ReactNode }) {
  const ref = useRef<BoxRenderable | null>(null);
  useSticky(ref, spec);
  return <Box shrink={0} bg="bg" boxRef={ref}>{children}</Box>;
}

test('Tab to a control below the fold: it lands clear of the sticky footer, never under it', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageOutlet>
      {rows(20, 'line')}<Btn label="Next" />{rows(20, 'more')}
      <Sticky spec={{ bottom: 0 }}><Box dir="column"><Text>FOOT 1</Text><Text>FOOT 2</Text></Box></Sticky>
    </PageOutlet></Box></FocusRoot>, { width: 40, height: 10 });
  let f = (await t.settle()).split('\n');
  expect(f[8]).toContain('FOOT 1');
  t.mockInput.pressTab();
  f = (await t.settle()).split('\n');
  const at = f.findIndex((l) => l.includes('[Next]'));
  expect(at).toBeGreaterThanOrEqual(0);
  expect(at).toBeLessThan(8);
  expect(f[8]).toContain('FOOT 1');
  expect(f[9]).toContain('FOOT 2');
});

test('Shift+Tab back up to a control: it lands clear of a sticky header', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageOutlet>
      <Box dir="column" shrink={0}>
        <Sticky spec={{ top: 0 }}><Text>HEAD</Text></Sticky>
        {rows(3, 'top')}<Btn label="Up" />{rows(30, 'line')}<Btn label="Down" />
      </Box>
    </PageOutlet></Box></FocusRoot>, { width: 40, height: 10 });
  await t.settle();
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  let f = await t.settle();
  expect(f).toContain('[Down]');
  t.mockInput.pressTab({ shift: true });
  f = await t.settle();
  const lines = f.split('\n');
  expect(lines[0]).toContain('HEAD');
  expect(lines.findIndex((l) => l.includes('[Up]'))).toBeGreaterThanOrEqual(1);
});

test('kept places belong to one mount: a second mount in the same process opens the same page at the top', async () => {
  const PAGE_DOWN_KEY = '\x1b[6~';
  const page = () => <FocusRoot><Box dir="column" height={10}><PageBody keep="/same">{rows(40, 'row')}</PageBody></Box></FocusRoot>;
  const mount = async () => {
    const s = beginTermSession();
    const term = await drawTest(page(), { width: 40, height: 10 });
    await term.settle();
    return { s, term };
  };
  // Mount A scrolls, then the page goes away (its place is kept) and the mount ends.
  let a = await mount();
  a.term.mockInput.pressKey(PAGE_DOWN_KEY);
  expect(await a.term.settle()).not.toMatch(/^row 1 /m);
  a.term.renderer.destroy();
  a.s.end();
  // Mount B: a fresh mount of the same route starts at the top.
  const b = await mount();
  t = b.term;
  expect(await b.term.settle()).toMatch(/^row 1 /m);
  b.term.renderer.destroy();
  t = null;
  b.s.end();
  // Within one mount the place is still kept across a page change (the web keeps it on coming back).
  a = await mount();
  a.term.mockInput.pressKey(PAGE_DOWN_KEY);
  await a.term.settle();
  a.term.renderer.destroy();
  const again = await drawTest(page(), { width: 40, height: 10 });
  t = again;
  expect(await again.settle()).not.toMatch(/^row 1 /m);
  again.renderer.destroy();
  t = null;
  a.s.end();
});

// Content above a revealed anchor that grows later (a table loading above a ?section= deep link): the web keeps the
// anchor where it is (overflow-anchor); so does the owner, until the reader scrolls.
let growAbove: ((n: number) => void) | null = null;
function Above() {
  const [n, set] = useState(3);
  useEffect(() => { growAbove = set; return () => { growAbove = null; }; }, []);
  return <Box dir="column">{rows(n, 'above')}</Box>;
}
test('scroll anchoring: a revealed anchor keeps its row while content above it grows, until the reader scrolls', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageBody>
      <Above />
      <Box dir="column" shrink={0} raw={{ id: 'anchor-claude' }}><Text>CLAUDE SECTION</Text></Box>
      {rows(40, 'below')}
    </PageBody></Box></FocusRoot>, { width: 40, height: 10 });
  await t.settle();
  expect(revealAnchor('anchor-claude')).toBe(true);
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('CLAUDE SECTION');
  // The table above finishes loading: ten more rows.
  growAbove!(13);
  f = (await t.settle()).split('\n');
  expect(f[0]).toContain('CLAUDE SECTION');
  // The reader scrolls: the anchor is let go, and a later change above moves the content as it does without one.
  t.mockInput.pressKey('\x1b[5~');
  await t.settle();
  growAbove!(16);
  f = (await t.settle()).split('\n');
  const at = f.findIndex((l) => l.includes('CLAUDE SECTION'));
  expect(at === -1 || at > 0).toBe(true);
});

// A 'start' reveal asks for the anchor on the first row. On a page that is still short when it is revealed (a
// ?section= deep link fired before the page's last rows were laid out) the scroll is clamped at the page's end and the
// anchor sits lower. The row asked for is kept: as the page grows below the anchor it moves up with the page's end,
// to the first row at most, until the reader scrolls.
let growBelow: ((n: number) => void) | null = null;
function Below() {
  const [n, set] = useState(3);
  useEffect(() => { growBelow = set; return () => { growBelow = null; }; }, []);
  return <Box dir="column" shrink={0}>{rows(n, 'below')}</Box>;
}
test('scroll anchoring: a start reveal clamped on a page still short reaches its place once the page has grown below it', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageBody>
      {rows(12, 'above')}
      <Box dir="column" shrink={0} raw={{ id: 'anchor-last' }}><Text>LAST SECTION</Text></Box>
      <Below />
    </PageBody></Box></FocusRoot>, { width: 40, height: 10 });
  await t.settle();
  // 16 rows in a 10-row view: the page ends 6 rows down, the anchor (row 12) cannot reach the first row.
  expect(revealAnchor('anchor-last')).toBe(true);
  let f = (await t.settle()).split('\n');
  expect(f[6]).toContain('LAST SECTION');
  expect(f[9]).toContain('below 3');
  // Two more rows arrive below: the page's end moves, and the anchor with it.
  growBelow!(5);
  f = (await t.settle()).split('\n');
  expect(f[4]).toContain('LAST SECTION');
  expect(f[9]).toContain('below 5');
  // Many more: the anchor stops on the first row (what the reveal asked for), not at the new end.
  growBelow!(30);
  f = (await t.settle()).split('\n');
  expect(f[0]).toContain('LAST SECTION');
  // The reader scrolls: the anchor is let go; later rows move nothing.
  t.mockInput.pressKey('\x1b[5~');
  // The rows shown, without the scroll bar's column (its thumb shrinks as the page gets longer).
  const shown = (frame: string): string[] => frame.split('\n').map((l) => l.slice(0, 30).trimEnd());
  const moved = shown(await t.settle());
  expect(moved[0]).not.toContain('LAST SECTION');
  growBelow!(40);
  expect(shown(await t.settle())).toEqual(moved);
});

test('scroll anchoring: once the reader moves the focus, a clamped start reveal stays on its row while the page grows', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column" height={10}><PageBody>
      {rows(12, 'above')}
      <Box dir="column" shrink={0} raw={{ id: 'anchor-last' }}><Text>LAST SECTION</Text></Box>
      <Btn label="Open" />
      <Below />
    </PageBody></Box></FocusRoot>, { width: 40, height: 10 });
  await t.settle();
  expect(revealAnchor('anchor-last')).toBe(true);
  expect((await t.settle()).split('\n')[5]).toContain('LAST SECTION');
  // Tab lands on the button under the section (on screen: nothing scrolls). What the reader opens next grows the page.
  t.mockInput.pressTab();
  const shown = (frame: string): string[] => frame.split('\n').map((l) => l.slice(0, 30).trimEnd());
  const before = shown(await t.settle());
  expect(before[5]).toContain('LAST SECTION');
  growBelow!(8);
  expect(shown(await t.settle())).toEqual(before);
});
