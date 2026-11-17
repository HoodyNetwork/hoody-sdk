// The password TextField (kit/forms/fields.term.tsx) and its wipe: when its context ends (here a route change, the
// field staying mounted) the value is emptied, controlled or not (defaultValue), and the field forgets what was typed:
// redo and undo bring nothing back, also when the field was already empty at the wipe. The keys use the keyboard
// protocol that tells Ctrl+- and Ctrl+. apart (redo reaches the field only through it); redo is proven to work right
// before each wipe and is seeded when the wipe comes.
import { expect, test } from 'bun:test';
import '../env/router-globals';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { parseSearch, stringifySearch } from '../app/router';
import { inputHeld, testRender, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim';
import { TextField } from '../../kit/forms/fields';

const W = { width: 60, height: 12 };

/** A password field in the root route of a two-path router, drawn with the Kitty keyboard: the field stays mounted
 *  while the path changes under it (the wipe, not an unmount). */
async function wipeBed(field: (got: string[]) => ReactNode): Promise<{ t: TestTerm; got: string[]; wipe: () => Promise<void>; undo: () => void; redo: () => void }> {
  const got: string[] = [];
  const P = () => <FocusRoot>{field(got)}</FocusRoot>;
  const root = createRootRoute({ component: P });
  const a = createRoute({ getParentRoute: () => root, path: '/a', component: () => null });
  const b = createRoute({ getParentRoute: () => root, path: '/b', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([a, b]), history: createMemoryHistory({ initialEntries: ['/a'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  const t = await testRender(<RouterProvider router={router as never} />, { ...W, kittyKeyboard: true }) as TestTerm;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  t.settle = async () => {
    let last = '';
    for (let same = 0, i = 0; same < 3 && i < 100; i++) {
      await t.renderOnce();
      const f = t.captureCharFrame();
      same = f === last && !inputHeld(t.renderer) ? same + 1 : 0;
      last = f;
      await new Promise((r) => setTimeout(r, 5));
    }
    return last;
  };
  await t.settle();
  // The only field: Tab puts the focus in it.
  t.mockInput.pressTab();
  await t.settle();
  let at = '/a';
  return {
    t, got,
    wipe: async () => { at = at === '/a' ? '/b' : '/a'; await router.navigate({ to: at } as never); },
    undo: () => t.mockInput.pressKey('-', { ctrl: true }),
    redo: () => t.mockInput.pressKey('.', { ctrl: true }),
  };
}
function Controlled({ got, initial }: { got: string[]; initial: string }) {
  const [v, setV] = useState(initial);
  return <TextField label="Password" type="password" value={v} onChange={(x) => { got.push(x); setV(x); }} />;
}

for (const mode of ['controlled', 'uncontrolled (defaultValue)'] as const) {
  test(`password ${mode}: a wipe (route change) empties the field; redo and undo bring nothing typed back`, async () => {
    const { t, got, wipe, undo, redo } = await wipeBed((g) => (mode === 'controlled'
      ? <Controlled got={g} initial="old1" />
      : <TextField label="Password" type="password" defaultValue="old1" onChange={(x) => { g.push(x); }} />));
    await t.mockInput.typeText('pw3rd');
    await t.settle();
    expect(got.at(-1)).toBe('old1pw3rd');
    undo();
    await t.settle();
    // What undo leaves is not empty (the value the field started with is still there): the wipe has something to clear.
    const undone = got.at(-1)!;
    expect(undone).not.toBe('old1pw3rd');
    expect(undone.startsWith('old1')).toBe(true);
    // Redo works before the wipe.
    redo();
    await t.settle();
    expect(got.at(-1)).toBe('old1pw3rd');
    // Seeded: one step to redo is waiting when the wipe comes (no edit in between).
    undo();
    let f = await t.settle();
    expect(got.at(-1)).toBe(undone);
    expect(f).toContain('•');
    await wipe();
    f = await t.settle();
    expect(got.at(-1)).toBe('');
    expect(f).not.toContain('•');
    const before = got.length;
    redo();
    await t.settle();
    undo();
    await t.settle();
    undo();
    await t.settle();
    redo();
    f = await t.settle();
    expect(got.slice(before).filter((x) => x !== '')).toEqual([]);
    expect(f).not.toContain('•');
    // The field still works after the wipe.
    await t.mockInput.typeText('n');
    expect(await t.settle()).toContain('•');
    expect(got.at(-1)).toBe('n');
    t.renderer.destroy();
  }, 30_000);
}

test('password: a wipe while the field is already empty still forgets what was typed (redo seeded)', async () => {
  const { t, got, wipe, undo, redo } = await wipeBed((g) => <Controlled got={g} initial="" />);
  await t.mockInput.typeText('pw3rd');
  await t.settle();
  expect(got.at(-1)).toBe('pw3rd');
  undo();
  await t.settle();
  expect(got.at(-1)).toBe('');
  // Redo works before the wipe.
  redo();
  await t.settle();
  expect(got.at(-1)).toBe('pw3rd');
  // Seeded: the field is empty and the whole password is one redo away when the wipe comes.
  undo();
  let f = await t.settle();
  expect(got.at(-1)).toBe('');
  expect(f).not.toContain('•');
  const before = got.length;
  await wipe();
  await t.settle();
  redo();
  await t.settle();
  undo();
  await t.settle();
  redo();
  f = await t.settle();
  expect(got.slice(before).filter((x) => x !== '')).toEqual([]);
  expect(f).not.toContain('•');
  t.renderer.destroy();
}, 30_000);
