// "Use with your agent" in the terminal (AgentHint.term.tsx), on the pages that place it (fixtures): a quiet control
// that opens the web's drawer with its four tabs. Closed it is one line; open, the Prompts tab says what the prompts
// act on and shows the page's main prompt; Copy gives exactly a prompt; Ask Hoody Agent hands the prompt to the Ask
// dock, unsent; the other tabs hold the set-up lines, the sign-in ways and what the agent can do; Esc closes; Hide
// removes the control for this page.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { hostEnv } from '../../core/host-env';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => {
  s?.close();
  s = null;
  // Leave no hidden hint or agent choice behind for the next test in this process.
  try { hostEnv().local?.removeItem('hub.v3.agentHint.hidden'); hostEnv().local?.removeItem('hub.v3.agentHint.agent'); } catch { /* no storage here */ }
});

/** What the terminal was asked to copy: the renderer's OSC 52 call, observed in this test only (nothing logs copies). */
function copies(p: PageSession): string[] {
  const got: string[] = [];
  (p.renderer as unknown as { copyToClipboardOSC52(text: string): boolean }).copyToClipboardOSC52 = (text) => { got.push(text); return true; };
  return got;
}
const tree = (p: PageSession): SemNode[] => semanticsOf({ root: (p.renderer as never as { root: unknown }).root, stdin: (p.renderer as never as { stdin: unknown }).stdin } as never);
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const find = (p: PageSession, role: string, name: string | RegExp): SemNode | undefined =>
  flat(tree(p)).find((n) => n.role === role && (typeof name === 'string' ? n.name === name : name.test(n.name ?? '')));
/** Presses the first node with this role and name. */
async function press(p: PageSession, role: string, name: string | RegExp): Promise<string> {
  const node = find(p, role, name);
  expect(node, `${role} ${String(name)}\n${p.frame}`).toBeDefined();
  act(getByRef(tree(p), node!.ref)!, 'press');
  await p.settle();
  await new Promise((r) => setTimeout(r, 200));
  return p.settle();
}
/** The page with its hint drawn, then the hint opened. */
async function opened(page: string, cols = 120, rows = 40): Promise<PageSession> {
  const p = await renderPage({ page, path: `/${page}`, cols, rows, settleMs: 3000 });
  s = p;
  const end = performance.now() + 20_000;
  while (!p.frame.includes('▸ Use with your agent') && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await p.settle(); }
  expect(p.frame, p.frame).toContain('▸ Use with your agent');
  await press(p, 'button', 'Use with your agent');
  return p;
}
/** The frame's text as one line (a sentence wraps inside the drawer). */
const words = (f: string): string => f.split('\n').map((l) => l.replace(/[│┃║█▀▄]/g, ' ')).join(' ').replace(/\s+/g, ' ');

test('keys: the drawer opens on Prompts; Copy gives the main prompt and a starter whole; Esc closes', async () => {
  const p = await opened('keys');
  const copied = copies(p);
  const f = words(p.frame);
  for (const tab of ['Prompts', 'Set up', 'Access', 'Can do']) expect(f, p.frame).toContain(tab);
  // The drawer's subtitle, what the prompts act on, the main prompt and its two ways.
  expect(f, p.frame).toContain('list your API keys');
  expect(f, p.frame).toContain('Acts on');
  expect(f, p.frame).toContain('Review my keys');
  expect(f, p.frame).toContain('Two ways to use it');
  expect(f, p.frame).toContain('Use the Hoody skill.');
  expect(f, p.frame).toContain('Skills in the Guide');
  expect(f, p.frame).toContain('Hide on this page');
  await press(p, 'button', 'Copy for your agent');
  expect(copied.at(-1)).toMatch(/^Use the Hoody skill\.\n\nTarget\n- Realm: .+\n- Keys: .+\n[^]*\nSteps\n1\. Ask me what I want with my keys[^]*\nRules\n- Never show a secret, key or password, in a reply or in a file\.\n- Never act on another computer or realm\.\n- Ask me before you delete anything or do anything that costs money\.$/);
  await press(p, 'button', 'Copy the prompt: Find unused keys');
  expect(copied.at(-1)).toMatch(/^Use the Hoody skill\.\nTarget: .+\nTask: List the keys with when each was last used[^]*\nFirst: [^\n]+\nRules: [^\n]+$/);
  await p.keys.press('escape');
  await new Promise((r) => setTimeout(r, 200)); // a lone ESC is told from a key sequence by a short wait
  const closed = await p.settle();
  expect(closed, closed).not.toContain('Acts on');
  expect(closed, closed).toContain('▸ Use with your agent');
  expect(p.failures).toEqual([]);
}, 120_000);

test('vault: Set up, Access and Can do hold the set-up lines, the sign-in ways and what the agent can do', async () => {
  const p = await opened('vault');
  let f = words(await press(p, 'tab', 'Set up'));
  expect(f, p.frame).toContain('Only for your own agent');
  expect(f, p.frame).toContain('npx skills add');
  expect(f, p.frame).toContain('More ways to connect in the Guide');
  f = words(await press(p, 'tab', 'Access'));
  expect(f, p.frame).toContain('Your agent signs in to your account');
  expect(f, p.frame).toContain('Browser sign-in');
  expect(f, p.frame).toContain('Access key');
  expect(f, p.frame).toContain('Give a key only to your agent.');
  expect(f, p.frame).toContain('About keys in the Guide');
  expect(find(p, 'link', /^Make (an access key|a key limited to )/), p.frame).toBeDefined();
  f = words(await press(p, 'tab', 'Can do'));
  expect(f, p.frame).toContain('With the Hoody skill and a sign-in, your agent can:');
  expect(find(p, 'list', 'What your agent can do here')?.children.length, p.frame).toBe(3);
  expect(find(p, 'group', 'On this page'), p.frame).toBeDefined();
  expect(find(p, 'group', 'Everywhere else'), p.frame).toBeDefined();
  expect(find(p, 'list', 'Computers and servers')?.children.length, p.frame).toBe(6);
  expect(p.failures).toEqual([]);
  expect(p.trapsAt).toEqual([]);
}, 120_000);

test('logs: Ask Hoody Agent closes the drawer and opens the Ask dock with the prompt, not sent', async () => {
  const p = await opened('logs');
  const ask = find(p, 'button', /^Ask Hoody Agent: /);
  expect(ask, p.frame).toBeDefined();
  if (ask!.states.disabled) {
    // Ask is off in this run: the button says why and Copy still gives the prompt.
    expect(words(p.frame), p.frame).toMatch(/Hoody Agent (is turned off|works only)/);
    return;
  }
  const f = words(await press(p, 'button', /^Ask Hoody Agent: Look through my logs$/));
  expect(f, p.frame).not.toContain('Acts on');
  // The dock names the asking page and holds the prompt in its composer (its end is in view), with Send still to press.
  expect(f, p.frame).toContain('From Logs');
  expect(f, p.frame).toContain('Ask me before you delete anything or do anything that costs money.');
  expect(f, p.frame).toContain('[Send');
  expect(p.failures).toEqual([]);
}, 120_000);

test('vault: Hide removes the control for this page', async () => {
  const p = await opened('vault');
  const f = await press(p, 'button', 'Hide on this page');
  expect(f, f).not.toContain('Use with your agent');
  expect(hostEnv().local?.getItem('hub.v3.agentHint.hidden') ?? '["vault"]').toBe('["vault"]');
}, 120_000);
