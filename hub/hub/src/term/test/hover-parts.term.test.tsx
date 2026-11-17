// Hover on the parts that are rows and tabs (prim/Hover.ts): the part under the pointer stands on the `hover` ground,
// the cells of its words included, and nothing else about it changes. The focused part keeps its focus plate; a part
// that cannot be pressed takes none. Parts: the section menu's items, the tab strips (Tabs, TabStrip), the side tabs.
import { afterEach, expect, test } from 'bun:test';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot, Text } from '../prim';
import { __resetHover } from '../prim/Hover';
import { TRUECOLOR } from '../prim/tokens';
import { TabStrip } from '../../kit/layouts/termTabs';
import { SectionMenuItem, SectionMenuList } from '../../kit/layouts/SectionMenu';
import { Tabs, type TabItem } from '../../kit/controls/Tabs';
import { SideTabs } from '../../kit/controls/SideTabs';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetHover(); });

const dark = TRUECOLOR.dark;
const hex = (c: { toInts(): number[] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
/** The background of the cell at column x of row y. */
function bgAt(x: number, y: number): string {
  let c = 0;
  for (const sp of t!.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return hex(sp.bg);
    c += w;
  }
  throw new Error(`no cell at ${x},${y}`);
}
/** Where a word is drawn: its row and the column of its first letter. */
function at(frame: string, word: string): { x: number; y: number } {
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(word));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  return { x: lines[y]!.indexOf(word), y };
}
/** Moves the pointer onto a word and says what its first and last letter stand on; the frame's text must not change. */
async function over(word: string): Promise<string[]> {
  const rest = await t!.settle();
  const p = at(rest, word);
  await t!.mockMouse.moveTo(p.x + 1, p.y);
  expect(await t!.settle()).toBe(rest);
  return [bgAt(p.x, p.y), bgAt(p.x + word.length - 1, p.y)];
}
async function groundOf(word: string): Promise<string> {
  const p = at(await t!.settle(), word);
  return bgAt(p.x, p.y);
}

function Routed({ children }: { children: ReactNode }) {
  const [r] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={r as never} />;
}

test('the tab strip of a page: a tab under the pointer stands on the hover ground; the focused tab and a disabled tab do not', async () => {
  t = await drawTest(
    <FocusRoot><TabStrip items={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma', isDisabled: true }]} value="b" onChange={() => {}} /></FocusRoot>,
    { width: 40, height: 3 },
  );
  const rest = await groundOf('Alpha');
  expect(await over('Alpha')).toEqual([dark.hover, dark.hover]);
  // One part at a time: the open tab takes it, the first gives it back.
  expect(await over('Beta')).toEqual([dark.hover, dark.hover]);
  expect(await groundOf('Alpha')).toBe(rest);
  expect(await over('Gamma')).toEqual([rest, rest]);
  // Focused (Tab reaches the first tab): the focus plate, with the pointer on it too.
  t.mockInput.pressTab();
  await t.settle();
  expect(await over('Alpha')).toEqual([dark.focus, dark.focus]);
  // And no hover ground shows beside its words (the cell after the label is the tab's too).
  const p = at(await t.settle(), 'Alpha');
  expect(bgAt(p.x + 'Alpha'.length, p.y)).toBe(rest);
});

test('Tabs: a closed tab under the pointer stands on the hover ground; a disabled one does not', async () => {
  const items: TabItem[] = [
    { id: 'over', label: 'Overview', content: <Text>overview body</Text> },
    { id: 'tasks', label: 'Tasks', content: <Text>tasks body</Text> },
    { id: 'off', label: 'Billing', isDisabled: true, content: <Text>billing body</Text> },
  ];
  t = await drawTest(<FocusRoot><Tabs label="Sections" items={items} value="over" onChange={() => {}} /></FocusRoot>, { width: 60, height: 5 });
  const rest = await groundOf('Tasks');
  expect(await over('Tasks')).toEqual([dark.hover, dark.hover]);
  expect(await over('Billing')).toEqual([rest, rest]);
  expect(await groundOf('Tasks')).toBe(rest);
});

test('the section menu: the item under the pointer stands on the hover ground; a disabled item does not', async () => {
  const item = (name: string, o: { current?: boolean; disabled?: boolean } = {}) => <SectionMenuItem current={o.current === true} {...(o.disabled ? { disabled: true } : {})} onClick={() => {}}>{name}</SectionMenuItem>;
  t = await drawTest(<Routed><FocusRoot><SectionMenuList>{item('Profile', { current: true })}{item('Security')}{item('Billing', { disabled: true })}</SectionMenuList></FocusRoot></Routed>, { width: 30, height: 5 });
  const rest = await groundOf('Security');
  expect(await over('Security')).toEqual([dark.hover, dark.hover]);
  // The current item has no plate of its own (a bar and bold words): it takes the hover ground too.
  expect(await over('Profile')).toEqual([dark.hover, dark.hover]);
  expect(await over('Billing')).toEqual([rest, rest]);
});

test('the side tabs: the tab under the pointer stands on the hover ground', async () => {
  t = await drawTest(<FocusRoot><SideTabs label="Kind" items={[{ id: 'ssh', label: 'Terminal' }, { id: 'web', label: 'Browser' }]} value="ssh" onChange={() => {}} /></FocusRoot>, { width: 30, height: 5 });
  const rest = await groundOf('Browser');
  expect(await over('Browser')).toEqual([dark.hover, dark.hover]);
  expect(await over('Terminal')).toEqual([dark.hover, dark.hover]);
  expect(await groundOf('Browser')).toBe(rest);
});
