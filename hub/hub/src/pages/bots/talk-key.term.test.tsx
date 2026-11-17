// The Bot page in the terminal: the page key `t` ("Talk" in the shortcut sheet) moves the focus to the Talk entry beside
// Send. The host's focus (voice/TalkHost.tsx) asks the DOM for the Mic's button, which a terminal entry
// is not, so `t` did nothing here.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';

const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = () => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};

test('`t` on the Bot page focuses the Talk entry', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: PATH, cols: 120, rows: 40 });
  const until = performance.now() + 20_000;
  while (!/\[⇗ Talk\]/.test(s.frame) && performance.now() < until) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  expect(s.frame).toContain('[⇗ Talk]');
  // Start on a button that is not Talk (a page key never runs while a text field has the focus): the nearest one to Talk
  // in reading order, so the start is in the Bot's dock, not in the shell.
  const buttons = queryAllByRole(tree(), 'button');
  const at = buttons.findIndex((n) => n.name === 'Talk');
  expect(at, s.frame).toBeGreaterThanOrEqual(0);
  const ok = (i: number) => i >= 0 && i < buttons.length && i !== at && buttons[i]!.actions.includes('focus') && !buttons[i]!.states.disabled;
  let other: (typeof buttons)[number] | undefined;
  for (let d = 1; d < buttons.length && !other; d++) other = ok(at - d) ? buttons[at - d] : ok(at + d) ? buttons[at + d] : undefined;
  expect(other, s.frame).toBeDefined();
  act(other!, 'focus');
  await s.settle();
  expect(focusedNode(tree())?.name).toBe(other!.name);
  await s.keys.press('t');
  await s.settle();
  expect(focusedNode(tree())?.name, s.frame).toBe('Talk');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 120_000);
