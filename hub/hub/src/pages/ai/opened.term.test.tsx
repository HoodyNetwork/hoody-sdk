// What the AI page hands outside the Hub in the terminal: the ChatGPT sign-in step's "Open the sign-in page" (GptStep)
// opens the provider's device page through the host's browser (openOutside -> TermHostServices.openExternal), whole.
// renderPage's `openExternal` records it as the scenario `opened` expectation does. The web half is not covered here
// (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** Presses the first node of that role and name, settling up to 5 times first: ?connect=openai opens the drawer only
 *  after the page's first load. */
async function press(role: Role, name: string | RegExp): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  let n;
  for (let i = 0; i < 5 && !n; i++) {
    [n] = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
    if (!n) await s!.settle();
  }
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}

test('Sign in with ChatGPT: Open the sign-in page opens the device page whole', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'ai', path: '/ai/models?connect=openai', cols: 140, rows: 60, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  // The way to connect is a choice of two (radios); the sign-in way shows the step with the page to open.
  await press('radio', /Sign in with ChatGPT/);
  await press('button', 'Open the sign-in page');
  expect(opened).toEqual(['https://auth.openai.com/codex/device']);
}, 180_000);
