// The whole-Hub run loads every page's default rules; the page being opened must answer first.
import { beforeAll, describe, expect, it } from 'vitest';
import { computerLifecycleRoute, type FixtureRule } from '@core';
import { bootPageOrder, loadCoreRules, loadFixtures, stateRules } from './fixtures';

// The first load of a page's fixtures transforms its whole import tree cold, which under load outlives a test's own
// timeout: load the four pages once here, with the import's own budget (loadFixtures keeps them).
beforeAll(async () => {
  await Promise.all(['home', 'guide', 'computers', 'board'].map((id) => loadFixtures(id)));
}, 120_000);

describe('bootPageOrder', () => {
  const ids = ['home', 'guide', 'computers', 'keys'];
  it('puts the page named by the hash first, keeping the rest in order', () => {
    expect(bootPageOrder(ids, '#/computers')).toEqual(['computers', 'home', 'guide', 'keys']);
    expect(bootPageOrder(ids, '#/keys?sel=a')).toEqual(['keys', 'home', 'guide', 'computers']);
    expect(bootPageOrder(ids, '#/computers/servers')[0]).toBe('computers');
  });
  it('leaves the order alone for an unknown, empty or missing hash', () => {
    expect(bootPageOrder(ids, '')).toEqual(ids);
    expect(bootPageOrder(ids, '#/')).toEqual(ids);
    expect(bootPageOrder(ids, '#/nowhere')).toEqual(ids);
  });
  it('does not mutate its input', () => {
    const copy = [...ids];
    bootPageOrder(copy, '#/keys');
    expect(copy).toEqual(ids);
  });
});

describe('rule order under the whole-Hub run', () => {
  it('the opened page answers the computer list before Home and Guide do', async () => {
    const computers = stateRules(((await loadFixtures('computers')) as unknown as { default: string; states: Record<string, unknown> }).states.many);
    const asBooted = await loadCoreRules(bootPageOrder(['home', 'guide', 'computers'], '#/computers'), null);
    expect(asBooted[0]).toBe(computers[0]);
  });
});

// loadCoreRules order: core answers from the first matching rule, so in the whole-Hub run (every
// page visible, nav order) a page that has the asked ?fx= state must put its rules before another page's
// default. Computers (nav 20) answers a computer Start with success by default; Board (nav 50) names the
// state powerUnknown, whose Start answers 502 (may have gone through).
const startAnswer = (rules: readonly FixtureRule[]) => rules.find((r) => r.route === computerLifecycleRoute)?.answer as { status?: number } | undefined;

describe('loadCoreRules: the asked state wins over other pages’ defaults', () => {
  it('a page that has the state answers first, whatever the page order', async () => {
    expect(startAnswer(await loadCoreRules(['computers', 'board'], 'powerUnknown'))?.status).toBe(502);
    expect(startAnswer(await loadCoreRules(['board', 'computers'], 'powerUnknown'))?.status).toBe(502);
  });

  it('with no page having the state, every page gives its default in page order', async () => {
    const rules = await loadCoreRules(['computers', 'board'], 'no-such-state');
    expect(startAnswer(rules)?.status ?? 200).toBeLessThan(300);
    const [first] = rules;
    expect(first).toBe((await loadCoreRules(['computers'], null))[0]);
  });

  it('every page’s rules are still there (defaults after the named state)', async () => {
    const both = await loadCoreRules(['computers', 'board'], 'powerUnknown');
    const board = await loadCoreRules(['board'], 'powerUnknown');
    const computers = await loadCoreRules(['computers'], 'powerUnknown');
    expect(both).toEqual([...board, ...computers]);
  });
});
