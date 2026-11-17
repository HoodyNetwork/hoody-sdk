// Vitest: the Explain drawer's skeleton. Before an answer, what the AI helper will read
// stays open (it is the consent view) and nothing claims an answer. Once an answer is in, it is the verdict at the top of the
// drawer, and what was read folds under a closed "What it read" disclosure. The model is a setting row with its Change.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { providers } from '@core';
import { ExplainDrawer } from './parts/ExplainDrawer';
import type { ExplainFlow, ExplainView } from './explain-flow';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

function flowOf(over: Partial<ExplainView>, live?: { set: (o: Partial<ExplainView>) => void }): ExplainFlow {
  let v: ExplainView = {
    subject: 's', name: null, text: 'THE EXACT TEXT', system: 'y', fewer: null, loading: false, rows: [{ spec: 'p/a', label: 'Alpha', ready: 'ready', price: null }],
    pick: 'p/a', label: 'Alpha', ready: 'ready', choice: null, rules: providers.rulesFor('explain'), defaultSpec: null,
    cost: ['cost.free', {}], note: null, picker: false, busy: false, asked: false, out: null, closed: false, ...over,
  } as ExplainView;
  const fns = new Set<() => void>();
  if (live) live.set = (o) => { v = { ...v, ...o } as ExplainView; fns.forEach((f) => f()); };
  return {
    get: () => v, subscribe: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; }, start() {}, choose() {}, consent() {}, setEvidence() {}, costOf: () => ['cost.unknown'], togglePicker() {}, ask() {}, close() {},
    session: {} as never,
  };
}
const drawer = () => screen.getByRole('dialog', { name: strings['explain.title'] });
const exact = () => screen.queryByRole('textbox', { name: strings['explain.exactly'] });

describe('the Explain drawer skeleton', () => {
  afterEach(cleanup);

  it('before an answer: what will be read is open, no verdict; the model is a setting row with its cost and Change', () => {
    render(<ExplainDrawer t={t} flow={flowOf({})} onClose={() => {}} />);
    expect((exact() as HTMLTextAreaElement).value).toBe('THE EXACT TEXT');
    expect(within(drawer()).queryByRole('group', { name: strings['explain.answer.label'] })).toBeNull();
    expect(within(drawer()).queryByRole('button', { name: strings['explain.read'] })).toBeNull();
    const model = document.querySelector('[data-explain-model]') as HTMLElement;
    expect(model.textContent).toContain('Alpha');
    expect(drawer().textContent).toContain(strings['explain.cost.free']);
    expect(within(drawer()).getByRole('button', { name: strings['explain.model.change'] })).toBeInTheDocument();
  });

  it('after an answer: the answer is the verdict at the top, and what was read folds under a closed disclosure', async () => {
    render(<ExplainDrawer t={t} flow={flowOf({ asked: true, out: { kind: 'answer', text: 'The same download failed three times.\n\nCheck the address.', cut: true } as never })} onClose={() => {}} />);
    const verdict = within(drawer()).getByRole('group', { name: strings['explain.answer.label'] });
    expect(verdict.textContent).toContain(strings['explain.answer.done']);
    const answer = verdict.closest('[aria-live]') as HTMLElement;
    expect(answer.getAttribute('aria-live')).toBe('polite');
    expect(answer.textContent).toContain('The same download failed three times.');
    expect(answer.textContent).toContain('Check the address.');
    expect(answer.textContent).toContain(strings['explain.cut']);
    // The verdict comes before everything else in the body.
    const fold = within(drawer()).getByRole('button', { name: strings['explain.read'] });
    expect(verdict.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(exact()).toBeNull();
    await userEvent.click(fold);
    expect((exact() as HTMLTextAreaElement).value).toBe('THE EXACT TEXT');
  });

  it('the answer is Markdown through the kit renderer: bold, a list, code; no literal marks; links only to the web; markup stays text', () => {
    const text = 'A request to the **schedules list API** was canceled.\n\n- **HTTP 499** usually means the caller closed the connection.\n- The request ran for about **1.07 seconds**.\n\nRun `hoody logs` or see [the docs](https://example.com/docs), never [this](javascript:alert(1)).\n\n<img src=x onerror=alert(1)>';
    render(<ExplainDrawer t={t} flow={flowOf({ asked: true, out: { kind: 'answer', text, cut: false } as never })} onClose={() => {}} />);
    const answer = document.querySelector('[data-explain-answer]') as HTMLElement;
    expect([...answer.querySelectorAll('strong')].map((el) => el.textContent)).toEqual(['schedules list API', 'HTTP 499', '1.07 seconds']);
    expect(answer.querySelectorAll('ul')).toHaveLength(1);
    expect(answer.querySelectorAll('li')).toHaveLength(2);
    expect(answer.querySelector('code')?.textContent).toBe('hoody logs');
    expect(answer.textContent).not.toContain('**');
    expect(answer.textContent).not.toMatch(/^- /m);
    const hrefs = [...answer.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs).toContain('https://example.com/docs');
    expect(hrefs.some((h) => /^javascript:/i.test(h))).toBe(false);
    // Markup in the answer is text, never an element.
    expect(answer.querySelector('img')).toBeNull();
    expect(answer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('the polite region is there before the answer, and the answer arrives inside that same region; a later pick does not re-label it', () => {
    const live = { set: (_: Partial<ExplainView>) => {} };
    render(<ExplainDrawer t={t} flow={flowOf({ asked: true, out: { kind: 'asking' } as never }, live)} onClose={() => {}} />);
    const region = document.querySelector('[data-explain-answer]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    act(() => live.set({ out: { kind: 'answer', text: 'The same download failed three times.', cut: false } as never }));
    expect(document.querySelector('[data-explain-answer]')).toBe(region);
    expect(region.textContent).toContain('The same download failed three times.');
    // A deferred list refresh can change the pick after the answer is in: the verdict names no model, so it never lies.
    act(() => live.set({ pick: 'p/b', label: 'Beta' }));
    expect(region.textContent).not.toContain('Beta');
    expect(region.textContent).not.toContain('Alpha');
  });

  it('a failed or judged ask keeps what was read open, with no verdict', () => {
    render(<ExplainDrawer t={t} flow={flowOf({ asked: true, out: { kind: 'lost' } as never })} onClose={() => {}} />);
    expect(exact()).not.toBeNull();
    expect(within(drawer()).queryByRole('group', { name: strings['explain.answer.label'] })).toBeNull();
    expect(drawer().textContent).toContain(strings['explain.out.lost']);
  });
});
