// The terminal history asks the blockers registered when a navigation starts, as the browser history does: a blocker
// put on and taken off around one push is asked by that push, after the blockers before it, and never by a later one.
// A blocker taken off later (its page left) is not asked: its question would have nobody to answer it.
import { expect, test } from 'bun:test';
import { createTermHistory } from './history';

const settled = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test('a blocker taken off right after the push is still asked by that push, once the earlier ones let it through', async () => {
  const h = createTermHistory('/home');
  const order: string[] = [];
  h.block({ blockerFn: () => { order.push('first'); return false; }, enableBeforeUnload: false });
  const off = h.block({ blockerFn: () => { order.push('passed'); return false; }, enableBeforeUnload: false });
  h.push('/ai');
  off();
  await settled();
  expect(order).toEqual(['first', 'passed']);
  expect(h.location.pathname).toBe('/ai');
  // A later navigation does not ask it.
  h.push('/files');
  await settled();
  expect(order).toEqual(['first', 'passed', 'first']);
  expect(h.location.pathname).toBe('/files');
});

test('when an earlier blocker keeps the person, the one after it is not asked and nothing moves', async () => {
  const h = createTermHistory('/home');
  let passed = 0;
  h.block({ blockerFn: () => true, enableBeforeUnload: false });
  const off = h.block({ blockerFn: () => { passed++; return false; }, enableBeforeUnload: false });
  h.push('/ai');
  off();
  await settled();
  expect(passed).toBe(0);
  expect(h.location.pathname).toBe('/home');
});

test('a blocker registered after a push started is not asked by it', async () => {
  const h = createTermHistory('/home');
  let late = 0;
  h.block({ blockerFn: () => false, enableBeforeUnload: false });
  h.push('/ai');
  h.block({ blockerFn: () => { late++; return true; }, enableBeforeUnload: false });
  await settled();
  expect(late).toBe(0);
  expect(h.location.pathname).toBe('/ai');
});

test('a blocker taken off after an earlier navigation settled is not asked by one that waited behind it', async () => {
  const h = createTermHistory('/home');
  let asked = 0;
  // A page's guard: it lets the first move through and is taken off when that move lands (the page left).
  const off = h.block({ blockerFn: () => { asked++; return false; }, enableBeforeUnload: false });
  const stop = h.subscribe(() => { off(); });
  h.push('/ai');
  h.push('/files');
  await settled();
  stop();
  expect(asked).toBe(1);
  expect(h.location.pathname).toBe('/files');
});

test('a guard taken off while another guard is still asking is not asked by the navigation waiting behind', async () => {
  const h = createTermHistory('/home');
  // A drawer's guard: it lets a move through at once while the drawer is open; asked after it closed, its question
  // would never be answered.
  let drawerOpen = true;
  let deadAsks = 0;
  const offDrawer = h.block({ blockerFn: () => (drawerOpen ? false : (deadAsks++, new Promise<boolean>(() => {}))), enableBeforeUnload: false });
  // A page's leave question, answered by hand.
  let answer: ((stay: boolean) => void) | null = null;
  let questions = 0;
  h.block({ blockerFn: () => { questions++; return questions === 1 ? new Promise<boolean>((r) => { answer = r; }) : false; }, enableBeforeUnload: false });
  h.push('/a');
  await settled();
  expect(answer).not.toBeNull();
  h.push('/b');
  await settled();
  // The drawer closes while the question is still up.
  drawerOpen = false;
  offDrawer();
  answer!(false);
  await settled();
  expect(deadAsks).toBe(0);
  expect(h.location.pathname).toBe('/b');
  h.push('/c');
  await settled();
  expect(h.location.pathname).toBe('/c');
});

test('a move pressed while a leave question is open still asks its own same-tick blocker when its turn comes', async () => {
  const h = createTermHistory('/home');
  let answer: ((stay: boolean) => void) | null = null;
  let questions = 0;
  h.block({ blockerFn: () => { questions++; return questions === 1 ? new Promise<boolean>((r) => { answer = r; }) : false; }, enableBeforeUnload: false });
  h.push('/a');
  await settled();
  let passed = 0;
  const off = h.block({ blockerFn: () => { passed++; return false; }, enableBeforeUnload: false });
  h.push('/ai');
  off();
  answer!(false);
  await settled();
  expect(passed).toBe(1);
  expect(h.location.pathname).toBe('/ai');
});
