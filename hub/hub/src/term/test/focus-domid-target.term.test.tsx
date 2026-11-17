// Two ways the web moves the focus by program, held in the terminal:
// | # | Web behaviour | Test |
// | 1 | document.getElementById(id).focus() on a control | 'focusDomId focuses the control that carries the id' |
// | 2 | The same on a disabled or hidden control, or an unknown id, does nothing | 'focusDomId: disabled, hidden and unknown ids answer false' |
// | 3 | A kit Button passes its `id` on | 'a kit Button is found by its id' |
// | 4 | An element with tabIndex -1 (a view's heading) takes focus() but is no Tab stop | 'tabIndex -1: focus() reaches it, Tab never stops on it' |
// | 6 | A focused tabIndex -1 element shows the focus (the web's focus ring): here the kit's focus fill and ink, on its words only | 'a focused tabIndex -1 heading is painted as a focused control' |
// | 5 | A hidden tabIndex -1 element is not focusable and never takes the focus from a sweep | 'a hidden tabIndex -1 element takes no focus' |
import { expect, test } from 'bun:test';
import { useRef } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Text, useFocusControl, type FocusControl } from '../prim';
import { focusedNode, semanticsOf, type SemRoot } from '../prim/semantics';
import { Button } from '../../kit/controls/Button';

let fc: FocusControl | null = null;
function Grab() { fc = useFocusControl(); return null; }
const focused = (t: { renderer: unknown }) => { const n = focusedNode(semanticsOf(t.renderer as unknown as SemRoot)); return n ? `${n.role} ${n.name}` : null; };

test('focusDomId focuses the control that carries the id', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><Grab />
    <Pressable domId="a" onPress={() => log.push('A')}><Text>[A]</Text></Pressable>
    <Pressable domId="b" onPress={() => log.push('B')}><Text>[B]</Text></Pressable>
  </FocusRoot>, { width: 30, height: 4 });
  await t.settle();
  expect(fc!.focusDomId('b')).toBe(true);
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['B']);
  t.renderer.destroy();
});

test('focusDomId: disabled, hidden and unknown ids answer false', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><Grab />
    <Pressable domId="a" autoFocus onPress={() => log.push('A')}><Text>[A]</Text></Pressable>
    <Pressable domId="off" disabled onPress={() => log.push('off')}><Text>[off]</Text></Pressable>
    <Box hidden><Pressable domId="gone" onPress={() => log.push('gone')}><Text>[gone]</Text></Pressable></Box>
  </FocusRoot>, { width: 30, height: 5 });
  await t.settle();
  expect([fc!.focusDomId('off'), fc!.focusDomId('gone'), fc!.focusDomId('nope')]).toEqual([false, false, false]);
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['A']);
  t.renderer.destroy();
});

test('a kit Button is found by its id', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot><Grab />
    <Button onPress={() => log.push('one')}>One</Button>
    <Button id="two" onPress={() => log.push('two')}>Two</Button>
  </FocusRoot>, { width: 30, height: 4 });
  await t.settle();
  expect(fc!.focusDomId('two')).toBe(true);
  await t.settle();
  expect(focused(t)).toBe('button Two');
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['two']);
  t.renderer.destroy();
});

function Headed({ hide, grab }: { hide?: boolean; grab: (h: HTMLElement | null) => void }) {
  const h = useRef<HTMLHeadingElement>(null);
  grab(h.current);
  return (
    <FocusRoot><Grab />
      <button type="button">First</button>
      <div hidden={hide}><h3 tabIndex={-1} ref={(e) => { h.current = e; grab(e); }}>The view</h3></div>
      <button type="button">Second</button>
    </FocusRoot>
  );
}

test('tabIndex -1: focus() reaches it, Tab never stops on it', async () => {
  let el: HTMLElement | null = null;
  const t = await drawTest(<Headed grab={(e) => { if (e) el = e; }} />, { width: 30, height: 6 });
  await t.settle();
  // Tab goes round the two buttons only.
  const seen: Array<string | null> = [];
  for (let i = 0; i < 4; i++) { t.mockInput.pressTab(); await t.settle(); seen.push(focused(t)); }
  expect(seen).toEqual(['button First', 'button Second', 'button First', 'button Second']);
  el!.focus();
  await t.settle();
  expect(focused(t)).toBe('heading The view');
  // Tab from the heading goes on in reading order.
  t.mockInput.pressTab();
  await t.settle();
  expect(focused(t)).toBe('button Second');
  t.renderer.destroy();
});

test('a hidden tabIndex -1 element takes no focus', async () => {
  let el: HTMLElement | null = null;
  const t = await drawTest(<Headed hide grab={(e) => { if (e) el = e; }} />, { width: 30, height: 6 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  expect(focused(t)).toBe('button First');
  (el as HTMLElement | null)?.focus();
  await t.settle();
  expect(focused(t)).toBe('button First');
  t.mockInput.pressTab();
  await t.settle();
  expect(focused(t)).toBe('button Second');
  t.renderer.destroy();
});

test('a focused tabIndex -1 heading is painted as a focused control', async () => {
  type Span = { text: string; width?: number; fg?: { toInts?: () => number[] }; bg?: { toInts?: () => number[] } };
  const rgb = (c: Span['fg']): string => JSON.stringify(typeof c?.toInts === 'function' ? c.toInts() : c);
  let el: HTMLElement | null = null;
  // The heading takes its row's width (a column child); only its words are filled, as a focused link's are.
  const t = await drawTest(<Headed grab={(e) => { if (e) el = e; }} />, { width: 30, height: 6 });
  await t.settle();
  const row = () => (t.captureSpans().lines as unknown as { spans: Span[] }[]).find((l) => l.spans.some((x) => x.text.includes('The view')))!;
  const before = row().spans.find((x) => x.text.includes('The view'))!;
  // A focused kit control, for the colours to match.
  t.mockInput.pressTab();
  await t.settle();
  const button = (t.captureSpans().lines as unknown as { spans: Span[] }[]).flatMap((l) => l.spans).find((x) => x.text.includes('First'))!;
  el!.focus();
  await t.settle();
  const after = row().spans.find((x) => x.text.includes('The view'))!;
  expect(rgb(after.bg)).not.toBe(rgb(before.bg));
  expect(rgb(after.bg)).toBe(rgb(button.bg));
  // Its words in the focus ink: not the colour they had, and not the fill's.
  expect(rgb(after.fg)).not.toBe(rgb(before.fg));
  expect(rgb(after.fg)).not.toBe(rgb(after.bg));
  // The fill is the extent of the words: no other cell of that row has it (the heading's box is 30 cells wide).
  const filled = row().spans.filter((x) => rgb(x.bg) === rgb(button.bg)).map((x) => x.text).join('');
  expect(filled).toBe('The view');
  // Away again: the paint goes with the focus.
  t.mockInput.pressTab();
  await t.settle();
  const left = row().spans.find((x) => x.text.includes('The view'))!;
  expect(rgb(left.bg)).toBe(rgb(before.bg));
  expect(rgb(left.fg)).toBe(rgb(before.fg));
});
