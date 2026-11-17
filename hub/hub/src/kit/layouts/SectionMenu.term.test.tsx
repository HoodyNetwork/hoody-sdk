// Section menus in the terminal (SettingsPage's menu, the Guide's index). No terminal test had them: the current item
// carries the bar '▌' and is current to a reader; a button item calls onClick and a link item goes to its href; a
// disabled button item is no Tab stop and does nothing when clicked.
import { afterEach, expect, test } from 'bun:test';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { focusedNode, getByRole, semanticsOf } from '../../term/prim/semantics';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; navs.length = 0; });
const tree = () => semanticsOf(t!.renderer as never);
const line = (f: string, word: string) => f.split('\n').find((l) => l.includes(word)) ?? '';

/** Every navigation asked of the router (useGoTerm calls router.navigate({ href })); nothing is routed for real. */
const navs: string[] = [];
function Routed({ children }: { children: ReactNode }) {
  const [r] = useState(() => {
    const x = createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never) as unknown as { navigate: (o: { href?: string }) => Promise<void> };
    x.navigate = (o) => { navs.push(o.href ?? ''); return Promise.resolve(); };
    return x;
  });
  return <RouterProvider router={r as never} />;
}

/** SettingsPage's use: button items, the page moves `current` to the section a press picked. */
function Settings({ log }: { log: string[] }) {
  const [cur, setCur] = useState('Profile');
  const item = (name: string, o: { disabled?: boolean } = {}) => (
    <SectionMenuItem current={cur === name} {...(o.disabled ? { disabled: true } : {})} onClick={() => { log.push(name); setCur(name); }}>{name}</SectionMenuItem>
  );
  return <SectionMenuList>{item('Profile')}{item('Security')}{item('Billing', { disabled: true })}{item('Logs')}</SectionMenuList>;
}

// Catches the mark and weight of the current item (SectionMenu.term.tsx line 42), its reader state (line 39), the
// press calling onClick (line 34), and a disabled button item being off (lines 31, 33, 38).
test('button items: the bar marks the current one; Enter picks and the bar moves; a disabled one is skipped and does nothing', async () => {
  const log: string[] = [];
  t = await drawTest(<FocusRoot><Settings log={log} /></FocusRoot>, { width: 40, height: 8 });
  let f = await t.settle();
  expect(line(f, 'Profile')).toContain('▌Profile');
  expect(line(f, 'Security')).not.toContain('▌');
  expect(getByRole(tree(), 'button', { name: 'Profile' }).states.current).toBe(true);
  expect(getByRole(tree(), 'button', { name: 'Security' }).states.current).toBeUndefined();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Security');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(log).toEqual(['Security']);
  expect(line(f, 'Security')).toContain('▌Security');
  expect(line(f, 'Profile')).not.toContain('▌');
  expect(getByRole(tree(), 'button', { name: 'Security' }).states.current).toBe(true);
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Logs'); // Billing is no stop
  expect(getByRole(tree(), 'button', { name: 'Billing' }).states.disabled).toBe(true);
  const rows = f.split('\n');
  const y = rows.findIndex((l) => l.includes('Billing'));
  await t.mockMouse.click(rows[y]!.indexOf('Billing') + 1, y);
  f = await t.settle();
  expect(log).toEqual(['Security']);
  expect(line(f, 'Billing')).not.toContain('▌');
});

// Catches the link form (line 35 go(href), line 39 role link and the caller's aria-current token, line 29 aria-label as
// the name).
test('link items: read as links, the shown page current as "page"; Enter goes to the href; aria-label names an item', async () => {
  t = await drawTest(
    <FocusRoot>
      <Routed>
        <SectionMenuList>
          <SectionMenuItem href="/guide/start" current aria-current="page">Start</SectionMenuItem>
          <SectionMenuItem href="/guide/keys" aria-label="Keyboard keys">Keys</SectionMenuItem>
        </SectionMenuList>
      </Routed>
    </FocusRoot>,
    { width: 40, height: 6 },
  );
  const f = await t.settle();
  expect(line(f, 'Start')).toContain('▌Start');
  expect(getByRole(tree(), 'link', { name: 'Start' }).states.current).toBe('page');
  const keys = getByRole(tree(), 'link', { name: 'Keyboard keys' });
  expect(keys.states.current).toBeUndefined();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Keyboard keys');
  t.mockInput.pressEnter();
  await t.settle();
  expect(navs).toEqual(['/guide/keys']);
});

// A label wider than the menu wraps under itself instead of ending mid-word; the item has no trailing cell (the focus
// plate's end padding is gone), so a label exactly as wide as the menu stays on one line.
test('a label as wide as the menu stays on one line; a wider one wraps under itself, never cut mid-word', async () => {
  const menu = (w: number) => (
    <FocusRoot><Box width={w} dir="column"><SectionMenuList>
      <SectionMenuItem current onClick={() => {}}>Guardrails and limits</SectionMenuItem>
      <SectionMenuItem onClick={() => {}}>Advanced</SectionMenuItem>
    </SectionMenuList></Box></FocusRoot>
  );
  t = await drawTest(menu(23), { width: 40, height: 4 });
  let f = await t.settle();
  expect(f).toContain('│▌Guardrails and limits');
  expect(f).toContain('│ Advanced');
  expect(f).not.toContain('…');
  t.renderer.destroy();
  t = await drawTest(menu(22), { width: 40, height: 4 });
  f = await t.settle();
  expect(f).not.toContain('…');
  const rows = f.split('\n');
  expect(rows[0]).toContain('│▌Guardrails and');
  expect(rows[1]).toContain('│ limits');
  expect(rows[2]).toContain('│ Advanced');
});
