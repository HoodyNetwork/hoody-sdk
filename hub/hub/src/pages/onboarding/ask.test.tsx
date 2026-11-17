// Vitest: the optional questions of the onboarding page. Rules (questions.ts): a question shows only when the API lists
// it at the version this page has words for and the account has no stored row; a pick keeps the limit and the option
// that stands alone. Rendered on fixtures: one question at a time in the load screen's question block, Next and Skip
// send once and show the next question at once, nothing reports the send, the way out keeps its place and its accent,
// and a read that fails, a shared-access session or a page inside another page shows no question at all.
import { act, fireEvent, renderPage, screen, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import { answers, fixtureSession, reply, type FixtureRule } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORDED, asSent, canPick, openQuestions, pick, shuffled, suggestionOf, type Question } from './questions';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

const framed = vi.hoisted(() => ({ on: false }));
vi.mock('@core', async (original) => ({ ...(await original<typeof Core>()), isFramed: () => framed.on }));

const S = strings as Readonly<Record<string, string>>;
const MAX: Readonly<Record<string, number>> = { first_goal: 2, main_users: 1, found_via: 1, ai_access: 8 };
const catalogue = () => WORDED.map((q) => ({ key: q.key, version: q.version, min_picks: 1, max_picks: MAX[q.key], options: [...q.options], exclusive: q.key === 'ai_access' ? ['none'] : [] }));
const row = (question: string, options: string[] = []) => ({ question, version: 1, state: options.length ? 'answered' : 'skipped', options, answered_at: '2026-11-18T10:00:00.000Z' });
const wire = (stored: unknown[] = [], questions: unknown[] = catalogue()) => ({ questions, answers: stored });
const q = (key: string): Question => openQuestions(wire())!.find((x) => x.key === key)!;

describe('questions: what is asked', () => {
  it('every question the API lists at this page\'s version, in this page\'s order, with the API\'s limits', () => {
    const open = openQuestions(wire())!;
    expect(open.map((x) => x.key)).toEqual(['first_goal', 'main_users', 'found_via', 'ai_access']);
    expect(open.map((x) => x.max)).toEqual([2, 1, 1, 8]);
    expect(open[3]!.exclusive).toEqual(['none']);
    expect(open.map((x) => x.shuffle)).toEqual([true, false, false, false]);
  });

  it('a stored row, answered or skipped, means the question is not asked again', () => {
    expect(openQuestions(wire([row('first_goal', ['files']), row('found_via')]))!.map((x) => x.key)).toEqual(['main_users', 'ai_access']);
  });

  it('another version, a question the API does not list, or one this page has no words for: not asked', () => {
    const other = catalogue().map((x) => (x.key === 'main_users' ? { ...x, version: 2 } : x)).filter((x) => x.key !== 'found_via');
    expect(openQuestions(wire([], [...other, { key: 'new_one', version: 1, min_picks: 1, max_picks: 1, options: ['a', 'b'], exclusive: [] }]))!.map((x) => x.key)).toEqual(['first_goal', 'ai_access']);
  });

  it('an option this page has no words for is left out; the rest stay in the API\'s order', () => {
    const more = catalogue().map((x) => (x.key === 'main_users' ? { ...x, options: ['team', 'robots', 'me'] } : x));
    expect(openQuestions(wire([], more))!.find((x) => x.key === 'main_users')!.options).toEqual(['team', 'me']);
  });

  it('an answer that is not the route\'s shape asks nothing', () => {
    for (const bad of [undefined, null, 'x', {}, { questions: catalogue() }, { questions: 'x', answers: [] }, { questions: catalogue(), answers: [{ question: 7 }] }]) expect(openQuestions(bad)).toBeNull();
    const odd = catalogue().map((x) => (x.key === 'first_goal' ? { ...x, max_picks: '2' } : x));
    expect(openQuestions(wire([], odd))!.map((x) => x.key)).toEqual(['main_users', 'found_via', 'ai_access']);
  });

  it('shuffled: the same options in another order, "other" last', () => {
    const options = q('first_goal').options;
    const turns = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8];
    let i = 0;
    const out = shuffled(options, () => turns[i++ % turns.length]!);
    expect([...out].sort()).toEqual([...options].sort());
    expect(out.at(-1)).toBe('other');
    expect(out).not.toEqual(options);
    expect(shuffled(['a', 'b'], () => 0.999999)).toEqual(['a', 'b']);
  });

  it('pick: the limit holds, and the option that stands alone clears the rest and is cleared by any other', () => {
    const goal = q('first_goal');
    expect(pick(goal, [], ['files'])).toEqual(['files']);
    expect(pick(goal, ['files', 'learn'], ['files', 'learn', 'browser'])).toEqual(['files', 'learn']);
    expect(pick(goal, ['files', 'learn'], ['learn'])).toEqual(['learn']);
    expect(canPick(goal, ['files', 'learn'], 'browser')).toBe(false);
    expect(canPick(goal, ['files', 'learn'], 'learn')).toBe(true);
    const ai = q('ai_access');
    expect(pick(ai, ['cursor', 'gemini'], ['cursor', 'gemini', 'none'])).toEqual(['none']);
    expect(pick(ai, ['none'], ['none', 'cursor'])).toEqual(['cursor']);
    expect(canPick(ai, ['none'], 'cursor')).toBe(true);
    expect(asSent(ai, ['cursor', 'claude_sub'])).toEqual(['claude_sub', 'cursor']);
  });

  it('suggestionOf: the person\'s own AI answer names one next step, or none', () => {
    expect(suggestionOf(['cursor', 'claude_sub', 'api_key'])).toBe('claude');
    expect(suggestionOf(['chatgpt_sub', 'api_key'])).toBe('accounts');
    expect(suggestionOf(['api_key', 'gemini'])).toBe('key');
    expect(suggestionOf(['none'])).toBe('allowance');
    expect(suggestionOf(['gemini', 'other'])).toBeNull();
  });

  it('every question and option has its words, keyed q.<key>.v<version>', () => {
    for (const w of WORDED) {
      expect(S[`q.${w.key}.v${w.version}.title`]).toBeTruthy();
      for (const o of w.options) expect(S[`q.${w.key}.v${w.version}.o.${o}`]).toBeTruthy();
    }
    // The note promises only what is true of the account's own rows.
    expect(strings['ask.note']).toMatch(/deleted with it/);
    expect(strings['ask.note']).not.toMatch(/backup/i);
  });
});

interface Sent { path: string; body: unknown }
/** Rules that answer before the page's own: the read of what to ask, and a write that records what was sent. */
function world(o: { stored?: unknown[]; questions?: unknown[]; read?: FixtureRule; write?: 'ok' | 'fail' | 'lost' } = {}) {
  const sent: Sent[] = [];
  const reads = { n: 0 };
  const rules: FixtureRule[] = [
    o.read ?? reply(routes.answers, () => { reads.n++; return answers.ok({ data: wire(o.stored, o.questions) }); }),
    reply(routes.answer, (req) => {
      sent.push({ path: req.path, body: req.body });
      return o.write === 'fail' ? answers.refused(409, 'ONBOARDING_QUESTION_CHANGED') : o.write === 'lost' ? answers.lost(0) : answers.ok({ data: { changed: true } });
    }),
  ];
  return { sent, reads, rules };
}
const card = () => document.querySelector('[data-load-ask]') as HTMLElement | null;
const shown = async () => {
  await waitFor(() => expect(card()).not.toBeNull(), { timeout: 10000 });
  return card()!;
};
const heading = () => within(card()!).getByRole('heading').textContent;
const press = (name: string) => fireEvent.click(within(card()!).getByRole('button', { name }));
const box = (label: string) => within(card()!).getByRole('checkbox', { name: label }) as HTMLInputElement;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const making = strings['now.making'].replace('{{name}}', 'atlas');

describe('rendered: the question card', () => {
  afterEach(() => {
    framed.on = false;
  });

  it('first question: its place, the question as a heading, a check group with its limit in words, the note', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    const c = await shown();
    expect(within(c).getByText(strings['ask.place'].replace('{{n}}', '1').replace('{{total}}', '4'))).toBeTruthy();
    expect(heading()).toBe(strings['q.first_goal.v1.title']);
    const group = within(c).getByRole('group', { name: strings['q.first_goal.v1.title'] });
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(c).getByText(strings['ask.upTo'].replace('{{max}}', '2'))).toBeTruthy();
    const labels = within(c).getAllByRole('checkbox').map((x) => x.closest('label')?.textContent);
    expect([...labels].sort()).toEqual(WORDED[0].options.map((o) => S[`q.first_goal.v1.o.${o}`]).sort());
    expect(labels.at(-1)).toBe(strings['q.first_goal.v1.o.other']);
    expect(within(c).getByText(strings['ask.note'])).toBeTruthy();
    expect(c.getAttribute('aria-label')).toBe(strings['ask.label']);
    // The choices are one column (the card is narrow); Skip is the quiet button beside Next.
    expect(within(c).getAllByRole('checkbox')[0]!.closest('label')!.parentElement!.className).not.toMatch(/cols2/);
    expect(within(c).getByRole('button', { name: strings['ask.skip'] }).getAttribute('data-variant')).toBe('ghost');
  });

  it('two picks are the limit: the other boxes go off, and Next sends both once and shows the next question at once', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    await shown();
    fireEvent.click(box(strings['q.first_goal.v1.o.learn']));
    fireEvent.click(box(strings['q.first_goal.v1.o.ai_agents']));
    expect(box(strings['q.first_goal.v1.o.files']).disabled).toBe(true);
    expect(box(strings['q.first_goal.v1.o.learn']).disabled).toBe(false);
    press(strings['ask.next']);
    // No wait for the answer: the next question is there in the same turn.
    expect(heading()).toBe(strings['q.main_users.v1.title']);
    await settle();
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]!.path).toMatch(/\/users\/me\/onboarding\/answers\/first_goal$/);
    const body = w.sent[0]!.body as { version: number; options: string[] };
    expect(body.version).toBe(1);
    expect([...body.options].sort()).toEqual(['ai_agents', 'learn']);
    expect(Object.keys(body).sort()).toEqual(['options', 'version']);
  });

  it('Next with nothing picked is off and says why; it sends nothing', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    await shown();
    const next = within(card()!).getByRole('button', { name: strings['ask.next'] });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(next);
    await settle();
    expect(heading()).toBe(strings['q.first_goal.v1.title']);
    expect(w.sent).toEqual([]);
  });

  it('Skip sends a skip and moves on; single choices are radio groups; the last answer ends the questions', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    await shown();
    press(strings['ask.skip']);
    expect(heading()).toBe(strings['q.main_users.v1.title']);
    const radios = within(card()!).getByRole('radiogroup', { name: strings['q.main_users.v1.title'] });
    expect(within(radios).getAllByRole('radio')).toHaveLength(4);
    expect(within(radios).getAllByRole('radio')[0]!.closest('label')!.parentElement!.className).not.toMatch(/cols2/);
    fireEvent.click(within(radios).getByRole('radio', { name: strings['q.main_users.v1.o.team'] }));
    press(strings['ask.next']);
    expect(heading()).toBe(strings['q.found_via.v1.title']);
    expect(within(card()!).getAllByRole('radio')).toHaveLength(10);
    press(strings['ask.skip']);
    expect(heading()).toBe(strings['q.ai_access.v1.title']);
    expect(within(card()!).getByText(strings['ask.any'])).toBeTruthy();
    press(strings['ask.skip']);
    // Nothing answered about AI: no suggestion, the block is gone.
    expect(card()).toBeNull();
    await settle();
    expect(w.sent.map((x) => [x.path.split('/').pop(), x.body])).toEqual([
      ['first_goal', { version: 1, skipped: true }],
      ['main_users', { version: 1, options: ['team'] }],
      ['found_via', { version: 1, skipped: true }],
      ['ai_access', { version: 1, skipped: true }],
    ]);
  });

  it('"None yet" stands alone, and the AI answer suggests one next step from the pick itself', async () => {
    const w = world({ stored: [row('first_goal'), row('main_users'), row('found_via')] });
    await renderPage(page, { state: 'making', rules: w.rules });
    await shown();
    expect(within(card()!).getByText(strings['ask.place'].replace('{{n}}', '1').replace('{{total}}', '1'))).toBeTruthy();
    fireEvent.click(box(strings['q.ai_access.v1.o.cursor']));
    fireEvent.click(box(strings['q.ai_access.v1.o.none']));
    expect(box(strings['q.ai_access.v1.o.cursor']).checked).toBe(false);
    expect(box(strings['q.ai_access.v1.o.none']).checked).toBe(true);
    fireEvent.click(box(strings['q.ai_access.v1.o.claude_sub']));
    expect(box(strings['q.ai_access.v1.o.none']).checked).toBe(false);
    fireEvent.click(box(strings['q.ai_access.v1.o.cursor']));
    press(strings['ask.next']);
    expect(heading()).toBe(strings['suggest.claude.title']);
    expect(within(card()!).getByRole('link', { name: strings['suggest.claude.go'] }).getAttribute('href')).toMatch(/\/ai\/models\?section=claude$/);
    expect(within(card()!).queryByRole('button')).toBeNull();
    await settle();
    expect(w.sent).toEqual([{ path: expect.stringMatching(/ai_access$/), body: { version: 1, options: ['claude_sub', 'cursor'] } }]);
    expect(w.reads.n).toBe(1);
  });

  for (const write of ['fail', 'lost'] as const) {
    it(`a write that is ${write === 'fail' ? 'refused' : 'lost'} changes nothing on the page: the next question shows, nothing is said, nothing is sent again`, async () => {
      const w = world({ write });
      await renderPage(page, { state: 'making', rules: w.rules });
      await shown();
      const before = document.body.textContent!.length;
      fireEvent.click(box(strings['q.first_goal.v1.o.files']));
      press(strings['ask.next']);
      await settle();
      expect(heading()).toBe(strings['q.main_users.v1.title']);
      expect(w.sent).toHaveLength(1);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.body.textContent).not.toMatch(/saved|thank|may have gone/i);
      expect(before).toBeGreaterThan(0);
    });
  }

  it('the way out keeps its place: Open my computer is the one accent before, during and after the questions', async () => {
    const w = world();
    await renderPage(page, { state: 'ready', rules: w.rules });
    await shown();
    const accents = () => [...document.querySelectorAll('a[data-variant="primary"], button[data-variant="primary"]')].map((x) => x.textContent);
    const open = () => screen.getByRole('link', { name: strings['action.open'] });
    expect(accents()).toEqual([strings['action.open']]);
    const href = open().getAttribute('href');
    // The block comes after the buttons in the page: it cannot push them down.
    expect(open().compareDocumentPosition(card()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      expect(open().getAttribute('aria-disabled')).toBeNull();
      press(strings['ask.skip']);
    }
    expect(card()).toBeNull();
    expect(open().getAttribute('href')).toBe(href);
    expect(accents()).toEqual([strings['action.open']]);
  });

  it('while the computer is being made, Next is the page\'s one accent', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    await shown();
    expect([...document.querySelectorAll('a[data-variant="primary"], button[data-variant="primary"]')].map((x) => x.textContent)).toEqual([strings['ask.next']]);
  });
});

describe('rendered: no question, and nothing said about it', () => {
  afterEach(() => {
    framed.on = false;
  });
  const quiet = async () => {
    await screen.findByText(making, undefined, { timeout: 10000 });
    await settle();
    expect(card()).toBeNull();
    expect(screen.queryByText(strings['ask.note'])).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The page is whole without them: its steps and its way out.
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByRole('link', { name: strings['action.skip'] })).toBeTruthy();
  };

  it('every question already has a stored row', async () => {
    await renderPage(page, { state: 'making' });
    await quiet();
  });

  it('the read fails', async () => {
    await renderPage(page, { state: 'askingUnread' });
    await quiet();
  });

  it('the read is lost', async () => {
    const w = world({ read: reply(routes.answers, answers.lost(0)) });
    await renderPage(page, { state: 'making', rules: w.rules });
    await quiet();
  });

  it('the answer is not the route\'s shape', async () => {
    const w = world({ read: reply(routes.answers, answers.ok({ data: { questions: 'none' } })) });
    await renderPage(page, { state: 'making', rules: w.rules });
    await quiet();
  });

  it('the API asks another version of every question', async () => {
    const w = world({ questions: catalogue().map((x) => ({ ...x, version: 2 })) });
    await renderPage(page, { state: 'making', rules: w.rules });
    await quiet();
    expect(w.reads.n).toBe(1);
  });

  it('a page shown inside another page: nothing is read and nothing is asked', async () => {
    framed.on = true;
    const w = world();
    await renderPage(page, { state: 'making', rules: w.rules });
    await quiet();
    expect(w.reads.n).toBe(0);
  });

  it('a shared-access session: nothing is read and nothing is asked', async () => {
    const w = world();
    await renderPage(page, { state: 'making', rules: [fixtureSession({ kind: 'token', caps: ['computers.read'] }), ...w.rules] });
    await settle();
    await settle();
    expect(card()).toBeNull();
    expect(screen.queryByText(strings['ask.note'])).toBeNull();
    expect(w.reads.n).toBe(0);
    expect(w.sent).toEqual([]);
  });
});
