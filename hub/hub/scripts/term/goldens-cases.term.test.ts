// goldens.ts shotCase / casesOf: a shot whose state needs a web action after load (click, keys, act) is drawn only with
// the action replayed (shot-replay.ts); one the terminal cannot replay is no case and says why. Drawn without the action,
// its frame was the page before the action under the action's name (ai shot-impact.120x40 was identical to
// shot-picker).
import { expect, test } from 'bun:test';
import { casesOf, opensScrolledOnPurpose, shotCase, shotSkip } from './goldens';

test('an acting shot is a case with its steps (replayed); one the terminal cannot replay is none, with a reason', () => {
  expect(shotCase({ name: 'impact', path: '?pick=helper', click: 'role=option' }, '/ai')).toEqual({ name: 'shot-impact', fx: null, path: '/ai?pick=helper', steps: [{ click: 'role=option' }] });
  expect(shotCase({ name: 'typed', path: '?x', keys: ['j', 'Enter'] }, '/ai')?.steps).toEqual([{ press: 'j' }, { press: 'Enter' }]);
  // An acting shot with no path opens the page's own path (it is not a state-only shot).
  expect(shotCase({ name: 'acted', act: [{ click: 'Save' }] }, '/ai')).toEqual({ name: 'shot-acted', fx: null, path: '/ai', steps: [{ click: 'Save' }] });
  // Not replayable: a CSS selector, a hover, a Meta key. No case, and shotSkip says why.
  const css = { name: 'css', path: '?x', click: 'css=[role=dialog] button' };
  expect(shotCase(css, '/ai')).toBeNull();
  expect(shotSkip(css)).toMatch(/css= engine/);
  expect(shotSkip({ name: 'hov', act: [{ hover: 'Help' }] })).toMatch(/no pointer hover/);
  expect(shotSkip({ name: 'meta', keys: ['Meta+K'] })).toMatch(/Meta modifier/);
  expect(shotCase({ name: 'other-realm', path: '?x', realm: 'all' }, '/ai')).toBeNull();
  expect(shotSkip({ name: 'other-realm', path: '?x', realm: 'all', click: 'Save' })).toMatch(/another realm/);
  expect(shotCase({ name: 'state-only', state: 'failed' }, '/ai')).toBeNull();
  expect(shotSkip({ name: 'state-only', state: 'failed' })).toBeNull();
  // An empty action list is no action.
  expect(shotCase({ name: 'none', path: '?x', keys: [], act: [] }, '/ai')).toEqual({ name: 'shot-none', fx: null, path: '/ai?x' });
  expect(shotCase({ name: 'deep', state: 'failed', path: '?section=a', scrolled: true }, '/ai')).toEqual({ name: 'shot-deep', fx: 'failed', path: '/ai?section=a', scrolled: true });
  expect(shotCase({ name: 'wait', path: '/knowledge', waitForText: 'Give agents' } as Parameters<typeof shotCase>[0], '/ai')).toEqual({ name: 'shot-wait', fx: null, path: '/ai/knowledge', waitForText: 'Give agents' });
});

test('the ai page: the five click/keys shots are replayed cases now', async () => {
  const skipped: Record<string, string> = {};
  const cases = await casesOf('ai', skipped);
  const by = new Map(cases.map((c) => [c.name, c]));
  for (const n of ['shot-impact', 'shot-impact-pending', 'shot-failed-default', 'shot-row-menu', 'shot-advanced']) expect(by.get(n)?.steps?.length).toBeGreaterThan(0);
  for (const why of Object.values(skipped)) expect(why.length).toBeGreaterThan(10);
}, 60_000);

test('scrolled-open is judged only on a case with no action and no deep link', () => {
  const caseOf = (...a: Parameters<typeof shotCase>): NonNullable<ReturnType<typeof shotCase>> => {
    const c = shotCase(...a);
    if (!c) throw new Error(`shotCase gave no case for ${a[0].name}`);
    return c;
  };
  // A click whose target the replay wheels into view: the scroll is the action's.
  expect(opensScrolledOnPurpose(caseOf({ name: 'act', path: '', click: 'Row actions' }, '/ai'))).toBe(true);
  expect(opensScrolledOnPurpose(caseOf({ name: 'keys', path: '', keys: ['End'] }, '/ai'))).toBe(true);
  // A deep link to one item: the list scrolls to it.
  expect(opensScrolledOnPurpose(caseOf({ name: 'bot', path: '?sel=c-atlas~a1~chief' }, '/bots'))).toBe(true);
  expect(opensScrolledOnPurpose({ path: '/bots?view=x&sel=c-atlas~a1~chief' })).toBe(true);
  // Declared.
  expect(opensScrolledOnPurpose(caseOf({ name: 'deep', path: '?section=a', scrolled: true }, '/ai'))).toBe(true);
  // No action, no deep link: a page opened scrolled is still a fault.
  expect(opensScrolledOnPurpose(caseOf({ name: 'plain', path: '?section=a' }, '/ai'))).toBe(false);
  expect(opensScrolledOnPurpose({ path: '/bots?select=x' })).toBe(false);
  expect(opensScrolledOnPurpose({ steps: [] })).toBe(false);
});
