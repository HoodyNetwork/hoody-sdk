// Focus never remounts what is inside the focused element. A raw focusable (the compat runtime, src/term/jsx/dom.ts:
// `tabIndex`, onClick) and the prim Pressable used to add a wrapper around their children only while focused; the
// changed element type made React unmount and mount everything inside on every focus and blur: state inside was
// reset, and a kit SecretField dropped its held secret on that unmount (the keys "shown once" panel lost the key).
// The wrapper is now always there; while its element is not the focused one it passes on the ink it is inside, so
// words in an unfocused element inside a focused control still draw in that control's focus ink.
import { expect, test } from 'bun:test';
import { useEffect, useRef, useState } from 'react';
import { drawTest } from '../prim/testing';
import { FocusRoot, Pressable, Text } from '../prim';

/** A child with state: counts its own mounts and unmounts, and keeps a number a test raises. */
function probe() {
  const seen = { mounts: 0, unmounts: 0, raise: () => {} };
  function Child() {
    const [n, setN] = useState(0);
    seen.raise = () => setN((x) => x + 1);
    useEffect(() => { seen.mounts++; return () => { seen.unmounts++; }; }, []);
    return <span>count {n}</span>;
  }
  return { seen, Child };
}
const W = { width: 50, height: 8 };
type Span = { text: string; fg: { toInts?: () => number[] } & Record<string, unknown>; bg: { toInts?: () => number[] } & Record<string, unknown> };
const rgb = (c: Span['fg']): string => JSON.stringify(typeof c?.toInts === 'function' ? c.toInts() : c);
const spanOf = (t: { captureSpans(): unknown }, word: string): Span => {
  for (const l of (t.captureSpans() as { lines: { spans: Span[] }[] }).lines) for (const sp of l.spans) if (sp.text.includes(word)) return sp;
  throw new Error(`no span holds "${word}"`);
};

test('raw focus target (tabIndex -1): focus() and blur keep the children mounted, their state intact', async () => {
  const { seen, Child } = probe();
  let focusIt: () => void = () => {};
  function Page() {
    const ref = useRef<HTMLDivElement>(null);
    focusIt = () => ref.current?.focus();
    return <FocusRoot><div><button>First</button><div ref={ref} tabIndex={-1}><Child /></div><button>Last</button></div></FocusRoot>;
  }
  const t = await drawTest(<Page />, W);
  seen.raise();
  expect(await t.settle()).toContain('count 1');
  focusIt();
  expect(await t.settle()).toContain('count 1');
  t.mockInput.pressTab();
  expect(await t.settle()).toContain('count 1');
  seen.raise();
  expect(await t.settle()).toContain('count 2');
  expect([seen.mounts, seen.unmounts]).toEqual([1, 0]);
  t.renderer.destroy();
});

test('raw pressable (a div with role=button and onClick): Tab onto it and away keeps the children mounted, their state intact', async () => {
  const { seen, Child } = probe();
  const t = await drawTest(<FocusRoot><div><button>First</button><div role="button" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}><Child /></div><button>Last</button></div></FocusRoot>, W);
  seen.raise();
  expect(await t.settle()).toContain('count 1');
  for (let i = 0; i < 3; i++) { t.mockInput.pressTab(); expect(await t.settle()).toContain('count 1'); }
  expect([seen.mounts, seen.unmounts]).toEqual([1, 0]);
  t.renderer.destroy();
});

test('prim Pressable with children: Tab onto it and away keeps the children mounted, their state intact', async () => {
  const { seen, Child } = probe();
  const t = await drawTest(
    <FocusRoot>
      <Pressable onPress={() => {}}><Text>First</Text></Pressable>
      <Pressable onPress={() => {}}><Child /></Pressable>
      <Pressable onPress={() => {}}><Text>Last</Text></Pressable>
    </FocusRoot>, W);
  seen.raise();
  expect(await t.settle()).toContain('count 1');
  for (let i = 0; i < 3; i++) { t.mockInput.pressTab(); expect(await t.settle()).toContain('count 1'); }
  expect([seen.mounts, seen.unmounts]).toEqual([1, 0]);
  t.renderer.destroy();
});

test('raw button with a stateful child: Tab onto it and away keeps the child mounted, its state intact', async () => {
  const { seen, Child } = probe();
  const t = await drawTest(<FocusRoot><div><button>First</button><button type="button"><Child /></button><button>Last</button></div></FocusRoot>, W);
  seen.raise();
  expect(await t.settle()).toContain('count 1');
  for (let i = 0; i < 3; i++) { t.mockInput.pressTab(); expect(await t.settle()).toContain('count 1'); }
  seen.raise();
  expect(await t.settle()).toContain('count 2');
  expect([seen.mounts, seen.unmounts]).toEqual([1, 0]);
  t.renderer.destroy();
});

test('raw: words in an unfocused focus target inside a focused button draw in the button\'s focus ink', async () => {
  const t = await drawTest(<FocusRoot><button type="button"><span>Outer</span><div tabIndex={-1}>Inner</div></button></FocusRoot>, { width: 30, height: 4 });
  const plain = rgb(spanOf(t, 'Inner').fg);
  t.mockInput.pressTab(); await t.settle();
  const outer = spanOf(t, 'Outer');
  const inner = spanOf(t, 'Inner');
  expect(rgb(inner.fg)).toBe(rgb(outer.fg));
  expect(rgb(inner.bg)).toBe(rgb(outer.bg));
  expect(rgb(inner.fg), t.captureCharFrame()).not.toBe(plain);
  t.renderer.destroy();
});

test('prim: a Text in an unfocused Pressable inside a focused Pressable draws in the outer one\'s focus ink', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Pressable onPress={() => {}}>
        <Text>Outer</Text>
        <Pressable tabStop={false} onPress={() => {}}><Text>Inner</Text></Pressable>
      </Pressable>
    </FocusRoot>, { width: 30, height: 4 });
  const plain = rgb(spanOf(t, 'Inner').fg);
  t.mockInput.pressTab(); await t.settle();
  const outer = spanOf(t, 'Outer');
  const inner = spanOf(t, 'Inner');
  expect(rgb(inner.fg)).toBe(rgb(outer.fg));
  expect(rgb(inner.bg)).toBe(rgb(outer.bg));
  expect(rgb(inner.fg), t.captureCharFrame()).not.toBe(plain);
  t.renderer.destroy();
});

test('mixed: a prim Text in an unfocused raw focus target inside a focused raw button draws in the button\'s focus ink', async () => {
  const t = await drawTest(<FocusRoot><button type="button"><span>Outer</span><div tabIndex={-1}><Text>Inner</Text></div></button></FocusRoot>, { width: 30, height: 4 });
  const plain = rgb(spanOf(t, 'Inner').fg);
  t.mockInput.pressTab(); await t.settle();
  const outer = spanOf(t, 'Outer');
  const inner = spanOf(t, 'Inner');
  expect(rgb(inner.fg)).toBe(rgb(outer.fg));
  expect(rgb(inner.bg)).toBe(rgb(outer.bg));
  expect(rgb(inner.fg), t.captureCharFrame()).not.toBe(plain);
  t.renderer.destroy();
});
