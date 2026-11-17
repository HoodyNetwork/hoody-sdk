// The first computer of a realm becomes the current one once its create is
// proved, only when nobody chose since the press. The row comes from a fresh read (never the shell's rendered list),
// a person's pick between press and proof always wins, and All computers chosen before the press is kept.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, bootFixtureCore, capture, chooseComputer, chooseNoComputer, computersPage, fixtureWorld, queryClient, reply } from '@core';
import { setRealm } from '@core/ctx';
import { containersRoute } from '@core/shell';
import { afterProof, knownEmpty, markPress, resetFirstPick } from './firstPick';
import strings from './strings.en.json';

const toasts = vi.hoisted(() => ({ calls: [] as { title: string; action?: { label: string; onAction: () => unknown } }[] }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.calls.push(c); } }));

const W = fixtureWorld;
const realm = W.realms[0]!.id;
const pid = W.projects[0]!.id;
const made = { project: pid, name: 'birch' };
const NEW = { id: 'c-bbbbbbbbbbbbbbbbbbbbbbb', name: 'birch', project_id: pid, status: 'creating', server_name: 'sv1', realm_ids: [realm] };
const X = { id: 'c-xxxxxxxxxxxxxxxxxxxxxxx', name: 'oak', project_id: pid, status: 'stopped', server_name: 'sv1', realm_ids: [W.realms[1]?.id ?? 'zzzzzzzzzzzzzzzzzzzzzzzz'] };
const t = (k: string, v?: Record<string, string>) => (strings as Record<string, string>)[k]!.replace('{{name}}', v?.name ?? '');

let rows: unknown[] = [];
let fail = false;
function boot(o: { first?: unknown[] } = {}) {
  rows = o.first ?? [];
  fail = false;
  bootFixtureCore({ target: null, rules: [reply(containersRoute, () => (fail ? answers.refused(500, 'INTERNAL') : answers.ok({ data: { computers: rows, pagination: { totalPages: 1 } } })))] });
  queryClient.clear();
  resetFirstPick();
  toasts.calls = [];
}
/** The top bar's list as cached at the press (computersPage, one entry with the shell's read). */
async function cacheList() { await queryClient.fetchQuery(computersPage.options(undefined)); }
const shown = () => capture().target?.container.id;

describe('firstPick: select the first computer only with proof of no pick since the press', () => {
  beforeEach(() => boot());

  it('a realm known empty at the press: the proved row becomes current, with the toast', async () => {
    await cacheList();
    expect(knownEmpty()).toBe(true);
    markPress(made);
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('chosen');
    expect(shown()).toBe(NEW.id);
    expect(toasts.calls.map((c) => c.title)).toEqual([t('said.current', { name: 'birch' })]);
  });

  it('3. the cached list is still the stale empty one at the proof: the fetched row is used, so it still selects', async () => {
    await cacheList();
    markPress(made);
    rows = [NEW];
    // Nothing re-read the cache since the press: it still says the realm is empty.
    expect((queryClient.getQueryData(computersPage.key(undefined)) as { data: { computers: unknown[] } }).data.computers).toEqual([]);
    expect(await afterProof(made, t)).toBe('chosen');
    expect(shown()).toBe(NEW.id);
  });

  it('4. the shell auto-picked the same row before the proof: the "now your current computer" toast still shows', async () => {
    await cacheList();
    markPress(made);
    rows = [NEW];
    chooseComputer(NEW, { auto: true });
    expect(await afterProof(made, t)).toBe('chosen');
    expect(toasts.calls.map((c) => c.title)).toEqual([t('said.current', { name: 'birch' })]);
  });

  it('5. a pick of X then All computers between press and proof: no auto-select, the toast offers Make current', async () => {
    await cacheList();
    markPress(made);
    chooseComputer(X);
    chooseNoComputer();
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBeUndefined();
    const c = toasts.calls[0]!;
    expect(c.title).toBe(t('first.ready', { name: 'birch' }));
    expect(c.action?.label).toBe(strings['menu.makeCurrent']);
    c.action!.onAction();
    expect(shown()).toBe(NEW.id);
  });

  it('6. a single pick between press and proof is kept', async () => {
    await cacheList();
    markPress(made);
    chooseComputer(X);
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBe(X.id);
  });

  it('7. All computers remembered at the press: no auto-select', async () => {
    chooseNoComputer();
    await cacheList();
    markPress(made);
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBeUndefined();
  });

  it('a realm that already held a computer: the new one is offered, never selected', async () => {
    boot({ first: [{ ...NEW, id: 'c-aaaaaaaaaaaaaaaaaaaaaaa', name: 'atlas', status: 'stopped' }] });
    await cacheList();
    expect(knownEmpty()).toBe(false);
    markPress(made);
    rows = [...rows, NEW];
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBeUndefined();
  });

  it('an empty list not known whole, never read, or failed since: not known empty', async () => {
    expect(knownEmpty()).toBe(false);
    await cacheList();
    fail = true;
    await queryClient.refetchQueries({ queryKey: computersPage.key(undefined) }).catch(() => undefined);
    expect(knownEmpty()).toBe(false);
  });

  it('a proof whose fresh read does not list the row selects nothing and says nothing (an unknown create)', async () => {
    await cacheList();
    markPress(made);
    expect(await afterProof(made, t)).toBe('none');
    expect(shown()).toBeUndefined();
    expect(toasts.calls).toEqual([]);
  });

  it('a proof with no press mark (another tab, a reload) never selects', async () => {
    await cacheList();
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBeUndefined();
  });

  it('a mark is used once: a second proof of the same create only offers it', async () => {
    await cacheList();
    markPress(made);
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('chosen');
    chooseNoComputer();
    expect(await afterProof(made, t)).toBe('ready');
  });

  it('Make current pressed after a realm switch does nothing: the row was the earlier realm\'s', async () => {
    await cacheList();
    markPress(made);
    chooseComputer(X);
    rows = [NEW];
    expect(await afterProof(made, t)).toBe('ready');
    setRealm(W.realms[1]!.id);
    toasts.calls[0]!.action!.onAction();
    expect(shown()).not.toBe(NEW.id);
  });

  it('a malformed entry in the fresh list is skipped: the created row is still found and chosen', async () => {
    await cacheList();
    markPress(made);
    rows = [null, 7, { name: 'birch' }, NEW];
    expect(await afterProof(made, t)).toBe('chosen');
    expect(shown()).toBe(NEW.id);
  });

  it('the shell auto-picked another computer of the realm before the proof (made elsewhere meanwhile): it is kept, the new one offered', async () => {
    await cacheList();
    markPress(made);
    const other = { ...NEW, id: 'c-ccccccccccccccccccccccc', name: 'cedar' };
    rows = [other, NEW];
    chooseComputer(other, { auto: true });
    expect(await afterProof(made, t)).toBe('ready');
    expect(shown()).toBe(other.id);
  });
});
