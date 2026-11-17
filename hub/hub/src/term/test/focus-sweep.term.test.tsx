// The hidden-focus sweep (src/term/prim/focus.ts): an auto focus that lands under a hidden ancestor (a list hidden by
// the detail that replaced it) is dropped, never handed to the first tab stop in the top bar or the sidebar (which one
// depended on frame timing: the keys and billing goldens flipped a stray '›' between runs). A focus a person asked for,
// hidden in place, still goes to the nearest tab stop.
import { expect, test } from 'bun:test';
import { createElement, useEffect, useState, type ReactElement } from 'react';
import { drawTest } from '../prim/testing';
import { FocusRoot, useFocusable, useFocusControl } from '../prim';

function Stop({ name, auto }: { name: string; auto?: boolean }): ReactElement {
  const f = useFocusable({ auto: auto === true });
  return createElement('box', { ref: f.ref, height: 1 }, createElement('text', {}, (f.focused ? '>' : ' ') + name));
}

function Page({ listShown }: { listShown: boolean }): ReactElement {
  return createElement('box', { flexDirection: 'column' },
    createElement(Stop, { name: 'top' }),
    createElement('box', { visible: listShown, flexDirection: 'column' }, createElement(Stop, { name: 'row', auto: true })),
    createElement(Stop, { name: 'detail' }));
}

const marked = (frame: string): string[] => frame.split('\n').filter((l) => l.startsWith('>')).map((l) => l.trim());

test('an auto focus under a hidden ancestor is dropped, not handed to the top bar', async () => {
  // As ListDetailPage: the list mounts shown (its row takes the auto focus), then the detail hides it.
  function Replaced(): ReactElement {
    const [shown, setShown] = useState(true);
    useEffect(() => { setShown(false); }, []);
    return createElement(Page, { listShown: shown });
  }
  const t = await drawTest(createElement(FocusRoot, null, createElement(Replaced)), { width: 20, height: 5 });
  for (let i = 0; i < 4; i++) await t.renderOnce();
  expect(marked(t.captureCharFrame())).toEqual([]);
  t.renderer.destroy();
});

test('a focus a person asked for, then hidden in place, goes to the nearest tab stop after it', async () => {
  let hide: (v: boolean) => void = () => {};
  let ctl: ReturnType<typeof useFocusControl> | null = null;
  function Asked(): ReactElement {
    const [shown, setShown] = useState(true);
    hide = (v) => setShown(!v);
    ctl = useFocusControl();
    return createElement(Page, { listShown: shown });
  }
  const t = await drawTest(createElement(FocusRoot, null, createElement(Asked)), { width: 20, height: 5 });
  for (let i = 0; i < 3; i++) await t.renderOnce();
  // The row took the auto focus while shown; Tab twice from it makes the focus asked, back on the row.
  ctl!.moveFocus(1); ctl!.moveFocus(-1);
  await t.renderOnce();
  expect(marked(t.captureCharFrame())).toEqual(['>row']);
  hide(true);
  for (let i = 0; i < 4; i++) await t.renderOnce();
  expect(marked(t.captureCharFrame())).toEqual(['>detail']);
  t.renderer.destroy();
});
