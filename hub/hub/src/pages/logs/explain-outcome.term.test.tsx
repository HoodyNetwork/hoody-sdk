// Logs, Explain: what the drawer says when the answer does not come back as an answer. A lost answer (the fixture
// state explainLost: the completion's answer never arrives) may still have spent the person's AI budget, so the drawer
// says so as "may have gone through" (C9) and offers "Ask again": nothing is sent again until the person presses it.
// A refusal for load (explainBusy: 429 rate_limited) is a plain failure that says to try again in a moment.
//
// Each completion the drawer sends is counted at the page's fixture seam (fixtureApiSeam.ts): the test installs a
// counting wrapper over world.ts's fixtureApi after the fixture boot and before the page is built (data.ts asks the
// seam once per page life), and puts the plain one back afterwards.
//
// | # | State | Pins |
// |---|---|---|
// | 1 | explainLost | the pending banner, the button reads "Ask again", one completion sent, none more on its own |
// | 2 | explainLost | "Ask again" sends exactly one more (the press is the only resend) |
// | 3 | explainBusy | the failure banner says busy, not the lost words |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { rendererHitAt, replay, shotSteps, type Node } from '../../../scripts/term/shot-replay';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import type { LogsApi } from './api';
import './fixtures';
import { installFixtureApi } from './fixtureApiSeam';
import shots from './shots';
import strings from './strings.en.json';
import { fixtureApi, type World } from './world';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; installFixtureApi(fixtureApi); });

/** The first sentence of a banner's words: one drawer line at both sizes (the rest may wrap beside the list). */
const lead = (words: string): string => words.split('. ')[0]! + '.';
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}

/** Completions sent since the page was built. */
let completions = 0;
function countCompletions(): void {
  completions = 0;
  installFixtureApi((world: World): LogsApi => {
    const api = fixtureApi(world);
    return { ...api, call: (method, path, body, extra) => { if (path === '/completions') completions += 1; return api.call(method, path, body, extra); } };
  });
}

/** The explain-lost shot's steps (More actions, Explain, Ask your AI helper), in the given fixture state. */
async function ask(fx: string, cols: number, rows: number): Promise<PageSession> {
  const shot = shots.find((x) => x.name === 'explain-lost')!;
  const p = await renderPage({ page: 'logs', fx, cols, rows, path: `/logs${shot.path ?? ''}`, afterBoot: countCompletions });
  const r = p.renderer as unknown as { root: unknown; stdin: never };
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, shotSteps(shot), { tree: () => semanticsOf({ root: r.root as never, stdin: r.stdin }) as unknown as Node[], cols, rows, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  return p;
}

test('explainLost: "may have gone through" with Ask again, and nothing is sent again without a press', async () => {
  s = await ask('explainLost', 120, 40);
  const p = s;
  let frame = await until(p, () => p.frame.includes(lead(strings['explain.out.lost'])));
  expect(frame).toContain(lead(strings['explain.out.lost']));
  expect(frame).not.toContain(lead(strings['explain.out.busy']));
  expect(queryAllByRole(tree(p), 'button', { name: strings['explain.again'] }).length).toBe(1);
  expect(queryAllByRole(tree(p), 'button', { name: strings['explain.ask'] })).toEqual([]);
  expect(completions).toBe(1);
  // The held long timers and a while of real time: still the one send.
  await p.releaseHeld();
  await pause(1_500);
  frame = await p.settle();
  expect(completions).toBe(1);
  expect(frame).toContain(lead(strings['explain.out.lost']));
  expect(p.failures).toEqual([]);
}, 240_000);

test('explainLost: Ask again sends exactly one more completion', async () => {
  s = await ask('explainLost', 120, 40);
  const p = s;
  await until(p, () => p.frame.includes(lead(strings['explain.out.lost'])));
  expect(completions).toBe(1);
  act(queryAllByRole(tree(p), 'button', { name: strings['explain.again'] })[0]!, 'press');
  await until(p, () => completions >= 2);
  await pause(1_000);
  const frame = await until(p, () => p.frame.includes(lead(strings['explain.out.lost'])));
  expect(completions).toBe(2);
  // The second answer is lost too (the fault stays): the same outcome, still nothing sent on its own.
  expect(frame).toContain(lead(strings['explain.out.lost']));
  expect(p.failures).toEqual([]);
}, 240_000);

test('explainBusy: the failed banner says the AI helper is busy', async () => {
  s = await ask('explainBusy', 120, 40);
  const p = s;
  const frame = await until(p, () => p.frame.includes(lead(strings['explain.out.busy'])));
  expect(frame).toContain(lead(strings['explain.out.busy']));
  expect(frame).not.toContain(lead(strings['explain.out.lost']));
  expect(completions).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);
