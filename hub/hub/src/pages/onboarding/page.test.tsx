// Vitest: the onboarding page. Logic: a step is done only when a read proves it (stageOf, stepsOf), the page reads again
// on a bounded schedule (pollDelay) and never counts time as progress. Rendered on fixtures: the way out is always
// there, the accent button appears only once the computer runs, a blocked setup points at Home, a failed read says so,
// and still (Performance mode) every card is on the page at once. Every card's text fits the explain budget.
import { act, fireEvent, renderPage, screen, waitFor, within } from '@app/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { SetupState } from '@core';
import { inRealm, rereadAll, rowOf, staleRead } from './data';
import { CARDS, CARD_BUDGET, NEXT, NEXT_PAGE, endLine, nextActions, FAST_MS, FAST_POLLS, SLOW_MS, SLOW_POLLS, firstName, phaseOf, pickRow, pollDelay, shownSteps, stageOf, stepsOf, waitNote, waits, type Reads, type Row, type Stage } from './logic';
import page from './page';
import strings from './strings.en.json';

const row = (phase: Row['phase'], id = 'c1'): Row => ({ id, name: 'atlas', handle: 'atlas.0001', phase });
const reads = (over: Partial<Reads>): Reads => ({ rows: [], whole: true, setup: undefined, ...over });
const setup = (s: Record<string, unknown>) => s as unknown as SetupState;
const states = (stage: Stage) => stepsOf(stage).map((s) => s.state);

describe('logic: what a read proves', () => {
  it('phaseOf parses the list status; an unknown word is never a guess', () => {
    expect(phaseOf('running')).toBe('running');
    expect(['creating', 'claiming', 'copying', 'CREATING'].map(phaseOf)).toEqual(['making', 'making', 'making', 'making']);
    // On its way up after being made (core computerState's 'starting' words): still not running, never "no computer".
    expect(['starting', 'provisioning', 'pending', 'restarting'].map(phaseOf)).toEqual(['making', 'making', 'making', 'making']);
    expect(['stopped', 'paused'].map(phaseOf)).toEqual(['stopped', 'stopped']);
    expect(phaseOf('failed')).toBe('failed');
    expect([undefined, 7, 'deleting', 'host_reinstalled', ''].map(phaseOf)).toEqual(['other', 'other', 'other', 'other', 'other']);
  });

  it('pickRow: the shell\'s computer when it runs, else the furthest along; rows it cannot read are left out', () => {
    const a = row('stopped', 'a'), b = row('running', 'b'), c = row('making', 'c'), d = row('running', 'd');
    expect(pickRow([a, b, c, d], 'd')).toBe(d);
    expect(pickRow([a, b, c], 'a')).toBe(b);
    expect(pickRow([a, c])).toBe(c);
    expect(pickRow([row('other')])).toBeUndefined();
  });

  it('stageOf: the list unread, failed, and each row phase', () => {
    expect(stageOf(reads({ rows: undefined })).kind).toBe('loading');
    expect(stageOf(reads({ rows: null })).kind).toBe('unread');
    expect(stageOf(reads({ rows: [row('running')] })).kind).toBe('ready');
    expect(stageOf(reads({ rows: [row('making')] })).kind).toBe('making');
    expect(stageOf(reads({ rows: [row('stopped')] })).kind).toBe('stopped');
    expect(stageOf(reads({ rows: [row('failed')] })).kind).toBe('failed');
  });

  it('stageOf: a computer in a state the page cannot name is never "no computer"', () => {
    const odd = stageOf(reads({ rows: [row('other')], setup: setup({ kind: 'empty', freeSetup: false }) }));
    expect(odd).toEqual({ kind: 'unknown', computer: row('other') });
    expect(waits(odd)).toBe(false);
    expect(states(odd)).toEqual(['done', 'done', 'done', 'next']);
  });

  it('stageOf: the setup read failed on an empty whole list is a failed read, not a wait', () => {
    const s = stageOf(reads({ setup: null }));
    expect(s.kind).toBe('unread');
    expect(waits(s)).toBe(false);
    // An unfinished list answers nothing either way.
    expect(stageOf(reads({ setup: null, whole: false })).kind).toBe('looking');
  });

  it('stageOf: a shared session with no computer claims nothing and does not wait', () => {
    const s = stageOf(reads({ account: false }));
    expect(s.kind).toBe('shared');
    expect(waits(s)).toBe(false);
    expect(states(s)).toEqual(['done', 'next', 'next', 'next']);
    expect(stageOf(reads({ account: false, rows: [row('running')] })).kind).toBe('ready');
  });

  it('stageOf with no row: claims nothing unless the list is whole and the setup state answered', () => {
    const claimed = setup({ kind: 'empty', freeSetup: false });
    expect(stageOf(reads({ setup: claimed })).kind).toBe('reserved');
    expect(stageOf(reads({ setup: claimed, whole: false })).kind).toBe('looking');
    expect(stageOf(reads({ setup: undefined })).kind).toBe('looking');
    // In a realm the free-tier answer says nothing about this realm's server.
    expect(stageOf(reads({ setup: setup({ kind: 'empty', freeSetup: false, accountComputers: false }) })).kind).toBe('looking');
    expect(stageOf(reads({ setup: setup({ kind: 'empty', accountComputers: true }) })).kind).toBe('elsewhere');
    expect(stageOf(reads({ setup: setup({ kind: 'provisioning' }) })).kind).toBe('looking');
  });

  it('stageOf: a setup that needs the person is blocked, with its reason', () => {
    for (const kind of ['invite', 'capacity', 'mailbox', 'expired', 'reinstalled'] as const) expect(stageOf(reads({ setup: setup({ kind }) }))).toEqual({ kind: 'blocked', why: kind });
    expect(stageOf(reads({ setup: setup({ kind: 'empty', freeSetup: true }) }))).toEqual({ kind: 'blocked', why: 'unclaimed' });
  });

  it('stepsOf: the account is always done; later steps only when proven; all four only when the computer runs', () => {
    expect(states({ kind: 'loading' })).toEqual(['done', 'next', 'next', 'next']);
    expect(states({ kind: 'looking' })).toEqual(['done', 'now', 'next', 'next']);
    expect(states({ kind: 'unread' })).toEqual(['done', 'stuck', 'next', 'next']);
    // A claimed server proves no computer is being made: the computer step is not shown as under way.
    expect(states({ kind: 'reserved' })).toEqual(['done', 'done', 'next', 'next']);
    expect(states({ kind: 'making', computer: row('making') })).toEqual(['done', 'done', 'done', 'now']);
    expect(states({ kind: 'ready', computer: row('running') })).toEqual(['done', 'done', 'done', 'done']);
    expect(states({ kind: 'stopped', computer: row('stopped') })).toEqual(['done', 'done', 'done', 'next']);
    expect(states({ kind: 'failed', computer: row('failed') })).toEqual(['done', 'done', 'done', 'stuck']);
    expect(states({ kind: 'blocked', why: 'invite' })).toEqual(['done', 'stuck', 'next', 'next']);
    const all: Stage[] = [{ kind: 'loading' }, { kind: 'unread' }, { kind: 'looking' }, { kind: 'reserved' }, { kind: 'making', computer: row('making') }, { kind: 'stopped', computer: row('stopped') }, { kind: 'failed', computer: row('failed') }, { kind: 'elsewhere' }, { kind: 'blocked', why: 'capacity' }];
    for (const s of all) expect(states(s).every((x) => x === 'done')).toBe(false);
  });

  it('pollDelay: 5 s reads, then 30 s reads, then none; only while a read can still move the stage', () => {
    const making: Stage = { kind: 'making', computer: row('making') };
    expect(pollDelay(making, 0)).toBe(FAST_MS);
    expect(pollDelay(making, FAST_POLLS - 1)).toBe(FAST_MS);
    expect(pollDelay(making, FAST_POLLS)).toBe(SLOW_MS);
    expect(pollDelay(making, FAST_POLLS + SLOW_POLLS)).toBeNull();
    for (const s of [{ kind: 'reserved' }, { kind: 'ready', computer: row('running') }, { kind: 'blocked', why: 'invite' }, { kind: 'unread' }, { kind: 'loading' }, { kind: 'stopped', computer: row('stopped') }] as Stage[]) {
      expect(waits(s)).toBe(false);
      expect(pollDelay(s, 0)).toBeNull();
    }
    expect(waitNote(making, 0)).toBeNull();
    expect(waitNote(making, FAST_POLLS)).toBe('slow');
    expect(waitNote(making, FAST_POLLS + SLOW_POLLS)).toBe('paused');
    expect(waitNote({ kind: 'ready', computer: row('running') }, 999)).toBeNull();
  });

  it('shownSteps: once the page stopped reading on its own, the step under way waits for the person', () => {
    const making: Stage = { kind: 'making', computer: row('making') };
    expect(shownSteps(making, 0).map((s) => s.state)).toEqual(['done', 'done', 'done', 'now']);
    expect(shownSteps(making, FAST_POLLS).map((s) => s.state)).toEqual(['done', 'done', 'done', 'now']);
    expect(shownSteps(making, FAST_POLLS + SLOW_POLLS).map((s) => s.state)).toEqual(['done', 'done', 'done', 'stuck']);
  });

  it('rereadAll: a poll never cancels a read still under way (a slow answer would never land)', () => {
    const calls: unknown[] = [];
    rereadAll((o) => void calls.push(['list', o]), (o) => void calls.push(['setup', o]), true);
    expect(calls).toEqual([['list', { cancelRefetch: false }], ['setup', { cancelRefetch: false }]]);
    calls.length = 0;
    rereadAll((o) => void calls.push(['list', o]), (o) => void calls.push(['setup', o]), false);
    expect(calls).toEqual([['list', { cancelRefetch: false }]]);
  });

  it('staleRead: a failed read again over a kept answer is said, never hidden behind it', () => {
    expect(staleRead({ isRefetchError: false, data: {} }, { isRefetchError: false, data: undefined })).toBe(false);
    expect(staleRead({ isRefetchError: true, data: {} }, { isRefetchError: false, data: undefined })).toBe(true);
    // A first read that failed has no kept answer: that is the error band, not this one.
    expect(staleRead({ isRefetchError: true, data: undefined }, { isRefetchError: false, data: undefined })).toBe(false);
    expect(staleRead({ isRefetchError: false, data: {} }, { isRefetchError: true, data: {} })).toBe(true);
  });

  it('data: rows of another realm are left out; a computer without a name is shown by its masked id', () => {
    const A = 'a'.repeat(24), B = 'b'.repeat(24);
    const rows = [{ id: '1'.repeat(24), name: 'atlas', status: 'running', project_id: 'p', realm_ids: [A] }, { id: '2'.repeat(24), name: 'ember', status: 'running', project_id: 'p', realm_ids: [B] }];
    expect(inRealm(rows, A).map((r) => (r as { name: string }).name)).toEqual(['atlas']);
    expect(inRealm(rows, 'all').length).toBe(2);
    expect(inRealm([null, 7, {}], 'all')).toEqual([]);
    const nameless = rowOf({ id: 'c'.repeat(24), status: 'creating' });
    expect(nameless?.name).toBe('cccc…cccc');
    expect(nameless?.phase).toBe('making');
  });

  it('firstName: the first word, a lowercase user name capitalised', () => {
    expect(firstName('Ada Lovelace')).toBe('Ada');
    expect(firstName('ada')).toBe('Ada');
    expect(firstName('McKay')).toBe('McKay');
    expect(firstName('  ')).toBeUndefined();
    expect(firstName(undefined)).toBeUndefined();
  });
});

describe('logic: what next', () => {
  const all = () => true;
  it('only once the computer runs', () => {
    expect(nextActions({ stage: { kind: 'ready', computer: row('running') }, served: all, account: true })).toEqual([...NEXT]);
    for (const stage of [{ kind: 'making', computer: row('making') }, { kind: 'stopped', computer: row('stopped') }, { kind: 'looking' }, { kind: 'loading' }, { kind: 'blocked', why: 'invite' }] as Stage[])
      expect(nextActions({ stage, served: all, account: true })).toEqual([]);
  });

  it('an action whose page this load does not serve is left out', () => {
    const ready: Stage = { kind: 'ready', computer: row('running') };
    expect(nextActions({ stage: ready, served: (p) => p !== 'bots', account: true })).toEqual(['program', 'terminal', 'key', 'guide']);
    expect(nextActions({ stage: ready, served: (p) => p === 'guide', account: true })).toEqual(['guide']);
    expect(nextActions({ stage: ready, served: () => false, account: true })).toEqual([]);
  });

  it('a session that may not act on the account (an access key) gets no "Make an API key"', () => {
    expect(nextActions({ stage: { kind: 'ready', computer: row('running') }, served: all, account: false })).toEqual(['program', 'bot', 'chat', 'terminal', 'guide']);
  });

  it('endLine: a stage a later read can still move promises What next; a settled one points at the buttons; the first read has no end step', () => {
    expect(endLine({ kind: 'loading' })).toBeNull();
    for (const stage of [{ kind: 'looking' }, { kind: 'making', computer: row('making') }] as Stage[]) expect(endLine(stage)).toBe('pending');
    const settled: Stage[] = [{ kind: 'ready', computer: row('running') }, { kind: 'reserved' }, { kind: 'unread' }, { kind: 'elsewhere' }, { kind: 'shared' }, { kind: 'stopped', computer: row('stopped') }, { kind: 'failed', computer: row('failed') }, { kind: 'unknown', computer: row('other') }, { kind: 'blocked', why: 'invite' }];
    for (const stage of settled) expect(endLine(stage)).toBe('below');
  });

  it('every action names the page that holds it and has its strings', () => {
    for (const id of NEXT) {
      expect(NEXT_PAGE[id]).toMatch(/^[a-z]+$/);
      expect((strings as Record<string, string>)[`next.${id}`]).toBeTruthy();
    }
  });
});

describe('strings: the cards stay a short, plain read', () => {
  const S = strings as Record<string, string>;
  it.each(CARDS)('card %s has a name and a body within the budget', (id) => {
    expect(S[`card.${id}`]?.length).toBeGreaterThan(0);
    const body = S[`card.${id}.body`] ?? '';
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(CARD_BUDGET);
  });

  it('no string names an internal word or a backend', () => {
    // The words are joined from parts, so this file does not spell them out either.
    const words = [['pre', 'spawn'], ['expo', 'sure'], ['pro', 'xy'], ['in', 'cus'], ['con', 'tainer']].map((w) => w.join(''));
    const named = new RegExp(words.join('|'), 'i');
    for (const v of Object.values(S)) expect(v).not.toMatch(named);
  });
});

const find = (text: string) => screen.findByText(text, undefined, { timeout: 10000 });
const link = (name: string) => screen.queryByRole('link', { name });
// The cards open on the first one; Next walks them to the end step (What next).
const toEnd = () => {
  for (let i = 0; i < CARDS.length; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
};

describe('rendered', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-hx-perf');
  });

  it('ready: every step done, Open my computer is the one accent, Home beside it, the Guide once (in What next)', async () => {
    await renderPage(page);
    await find(strings['now.ready'].replace('{{name}}', 'atlas'));
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('4');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    const open = link(strings['action.open']);
    expect(open?.getAttribute('href')).toMatch(/computers/);
    expect(document.querySelectorAll('a[data-variant="primary"], button[data-variant="primary"]').length).toBe(1);
    expect(link(strings['action.home'])).toBeTruthy();
    expect(link(strings['action.skip'])).toBeNull();
    // The Guide is one of the next actions now, so the button row does not say it a second time.
    toEnd();
    expect(screen.getAllByRole('link', { name: strings['next.guide'] })).toHaveLength(1);
    const next = document.querySelector('[data-load-next]') as HTMLElement;
    expect(within(next).getByRole('link', { name: strings['next.guide'] })).toBeTruthy();
  });

  it('ready: the tour opens on the first card, never on What next (the person asked for the tour)', async () => {
    await renderPage(page);
    await find(strings['now.ready'].replace('{{name}}', 'atlas'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[data-card]')?.getAttribute('data-card')).toBe(CARDS[0]);
    expect(screen.getByRole('button', { name: 'Previous card' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('ready: the last screen offers what to do next, each a link into its page', async () => {
    await renderPage(page);
    await find(strings['now.ready'].replace('{{name}}', 'atlas'));
    toEnd();
    const block = document.querySelector('[data-load-next]') as HTMLElement;
    expect(within(block).getByRole('heading', { name: strings['next.title'] })).toBeTruthy();
    const list = within(block).getByRole('list', { name: strings['next.label'] });
    expect([...list.querySelectorAll('[data-hub-item]')].map((x) => x.getAttribute('data-hub-item'))).toEqual([...NEXT]);
    const href = (id: string) => list.querySelector(`[data-hub-item="${id}"] a`)?.getAttribute('href') ?? '';
    expect(href('program')).toMatch(/\/programs$/);
    expect(href('bot')).toMatch(/\/bots\?drawer=new/);
    expect(href('chat')).toMatch(/\/bots$/);
    expect(href('terminal')).toMatch(/\/computers\?sel=atlas/);
    expect(href('key')).toMatch(/\/keys\?new=1/);
    expect(href('guide')).toMatch(/\/guide$/);
    // Still one accent on the page: Open my computer.
    expect(document.querySelectorAll('a[data-variant="primary"], button[data-variant="primary"]').length).toBe(1);
  });

  it('making: no "what next" yet', async () => {
    await renderPage(page, { state: 'making' });
    await find(strings['now.making'].replace('{{name}}', 'atlas'));
    expect(document.querySelector('[data-load-next]')).toBeNull();
  });

  it('making: three steps done, the fourth under way, Skip to the Hub and no Open button', async () => {
    await renderPage(page, { state: 'making' });
    await find(strings['now.making'].replace('{{name}}', 'atlas'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
    const steps = within(screen.getByRole('list', { name: strings['steps.label'] })).getAllByRole('listitem');
    expect(steps.map((li) => li.getAttribute('data-state'))).toEqual(['done', 'done', 'done', 'now']);
    expect(link(strings['action.skip'])).toBeTruthy();
    expect(link(strings['action.open'])).toBeNull();
    expect(document.querySelectorAll('[data-variant="primary"]').length).toBe(0);
  });

  it.each([
    ['making', 'now.making', 'next.pending'],
    ['invite', 'now.blocked.invite', 'next.below'],
    ['reserved', 'now.reserved', 'next.below'],
  ] as const)('%s (%s): the end step of the cards says %s', async (state, now, key) => {
    await renderPage(page, state === 'reserved' ? { state, realm: 'all' } : { state });
    await find(strings[now].replace('{{name}}', 'atlas'));
    toEnd();
    const end = document.querySelector('[data-card="end"]') as HTMLElement;
    expect(within(end).getByText(strings[key])).toBeTruthy();
    expect(within(end).queryByText(strings[key === 'next.pending' ? 'next.below' : 'next.pending'])).toBeNull();
  });

  it('did not start: Computers is the one accent button, Home and the Guide stay quiet', async () => {
    await renderPage(page, { state: 'failed' });
    await find(strings['now.failed'].replace('{{name}}', 'atlas'));
    const primary = document.querySelectorAll('a[data-variant="primary"], button[data-variant="primary"]');
    expect(primary.length).toBe(1);
    expect(primary[0]!.textContent).toContain(strings['action.computers']);
    expect(screen.getByRole('heading', { name: strings.started })).toBeTruthy();
  });

  it('reserved: the server step is done only because the status read says so', async () => {
    await renderPage(page, { state: 'reserved', realm: 'all' });
    await find(strings['now.reserved']);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    // No claim that the computer is on its way: Computers is where to add one, Home the way on.
    expect(screen.queryByText(/on its way/i)).toBeNull();
    expect(link(strings['action.computers'])).toBeTruthy();
    expect(link(strings['action.home'])).toBeTruthy();
  });

  it('unknown: a row without a readable status says its state is unknown, never that it is not running', async () => {
    await renderPage(page, { state: 'unknown' });
    await find(strings['now.unknown'].replace('{{name}}', 'atlas'));
    expect(screen.queryByText(/not running/i)).toBeNull();
    expect(link(strings['action.computers'])).toBeTruthy();
  });

  it('looking: with no answer about the server only the account step is done', async () => {
    await renderPage(page, { state: 'looking' });
    await find(strings['now.looking']);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    expect(link(strings['action.skip'])).toBeTruthy();
  });

  it('needs an invite: the step is stuck and Home is the way on', async () => {
    await renderPage(page, { state: 'invite' });
    await find(strings['now.blocked.invite']);
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('stuck');
    expect(link(strings['action.home'])).toBeTruthy();
    expect(link(strings['action.open'])).toBeNull();
  });

  it.each([
    ['stopped', 'now.stopped'],
    ['failed', 'now.failed'],
  ] as const)('%s: says so and offers Computers, never Open my computer', async (state, key) => {
    await renderPage(page, { state });
    await find(strings[key].replace('{{name}}', 'atlas'));
    expect(link(strings['action.computers'])).toBeTruthy();
    expect(link(strings['action.open'])).toBeNull();
  });

  it('a failed read: says the account could not be read, offers Try again, and the way out stays', async () => {
    await renderPage(page, { state: 'error' });
    await waitFor(() => expect(screen.getAllByText(strings['now.unread']).length).toBeGreaterThan(0), { timeout: 10000 });
    expect(screen.getByRole('button', { name: strings['note.retry'] })).toBeTruthy();
    expect(link(strings['action.skip'])).toBeTruthy();
  });

  it('while the first read is out the way out is already there', async () => {
    await renderPage(page, { state: 'loading' });
    await find(strings['now.loading']);
    expect(link(strings['action.skip'])).toBeTruthy();
    expect(link(strings['action.guide'])).toBeTruthy();
  });

  it('the cards rotate one at a time; still (Performance mode) all eight are on the page as a list', async () => {
    await renderPage(page);
    await find(strings['card.computers']);
    expect(document.querySelectorAll('[data-card]').length).toBe(1);
    expect(screen.getByRole('button', { name: 'Next card' })).toBeTruthy();
    // The switch flips while the page is open (the account menu's Performance mode): the cards follow it.
    await act(async () => {
      document.documentElement.setAttribute('data-hx-perf', 'on');
      await Promise.resolve();
    });
    const list = await screen.findByRole('list', { name: strings['cards.label'] }, { timeout: 10000 });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-card'))).toEqual([...CARDS]);
    expect(screen.queryByRole('button', { name: 'Next card' })).toBeNull();
  });
});
