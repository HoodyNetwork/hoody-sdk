// LoadScreen: the bar, its count and the step list say exactly the stages given (nothing counts time); the status line
// is one polite live region that stays mounted; the cards rotate only while nobody uses them and are read out once a
// person steps through them; still (Performance mode, reduced motion) every card is drawn at once and nothing rotates;
// inline style holds custom properties only; every looping animation has its stop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { PERF_ATTR } from '../perf';
import { LOAD_CARD_MS, LoadScreen, type LoadCard, type LoadStage } from './LoadScreen';

const css = readFileSync(join(__dirname, 'LoadScreen.module.css'), 'utf8');

const stages = (...states: LoadStage['state'][]): LoadStage[] => states.map((state, i) => ({ id: `s${i}`, label: `Step ${i + 1}`, state }));
const CARDS: LoadCard[] = [
  { id: 'a', icon: 'computer', title: 'Computers', body: 'A machine that is yours.' },
  { id: 'b', icon: 'files', title: 'Files', body: 'Browse and edit.' },
  { id: 'c', icon: 'bot', title: 'Bots', body: 'An assistant on a computer.' },
];
const shown = () => document.querySelector('[data-card]')?.getAttribute('data-card');
const live = () => document.querySelector('[data-card]')?.parentElement;
const draw = (st: LoadStage[], extra: Partial<Parameters<typeof LoadScreen>[0]> = {}) =>
  render(<LoadScreen title="Setting up" status="Working on it." stages={st} stagesLabel="Setup steps" items={CARDS} itemsLabel="What you can do" {...extra} />);

beforeEach(() => {
  boot();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute(PERF_ATTR);
});

describe('LoadScreen: the card', () => {
  it('holds the title with the state word, the count of finished steps, the status line and the page\'s buttons, in that order', () => {
    draw(stages('done', 'now', 'next', 'next'), { actions: <button type="button">Skip</button> });
    const title = screen.getByRole('heading', { name: 'Setting up' });
    const word = screen.getByText('Step 2 of 4');
    const count = screen.getByText('1/4');
    // The count is for the eye: the bar says the same to a screen reader.
    expect(count.closest('[aria-hidden="true"]')).toBeTruthy();
    const status = screen.getByRole('status');
    const skip = screen.getByRole('button', { name: 'Skip' });
    const inOrder = [title, word, count, screen.getByRole('progressbar'), status, skip];
    for (let i = 1; i < inOrder.length; i++) expect(inOrder[i - 1]!.compareDocumentPosition(inOrder[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the page\'s line is first in the document, then the card, then the cards', () => {
    draw(stages('done', 'done'), { intro: 'Welcome, Ada' });
    expect(screen.getByText('2/2')).toBeTruthy();
    const intro = screen.getByText('Welcome, Ada');
    const title = screen.getByRole('heading', { name: 'Setting up' });
    const cards = document.querySelector('[data-card]') as HTMLElement;
    expect(intro.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Wide, the line sits over the cards and the card spans both rows at the end side.
    expect(css).toMatch(/\.intro \{\s*grid-row: 1;\s*grid-column: 1;\s*\}/);
    expect(css).toMatch(/\.side \{\s*grid-row: 1 \/ span 2;\s*grid-column: 2;\s*\}/);
    expect(css).toMatch(/\.main \{\s*grid-row: 2;\s*grid-column: 1;\s*\}/);
    expect(css).toMatch(/column-gap: var\(--sp-7\);\s*\/\*[^*]*\*\/\s*grid-template-rows: auto 1fr;/);
    // With no line the cards start at the top.
    expect(css).toMatch(/\.side:first-child ~ \.main \{\s*grid-row: 1 \/ span 2;\s*\}/);
  });

  it('CSS: two columns only where there is room, the card at the end side; a stuck block is striped and never moves', () => {
    expect(css).toMatch(/@container \(inline-size >= 880px\) \{\s*\.column \{\s*grid-template-columns: minmax\(0, 1fr\) calc\(6 \* var\(--sp-10\)\);/);
    const stuck = css.slice(css.indexOf('.seg_stuck {'), css.indexOf('}', css.indexOf('.seg_stuck {')));
    expect(stuck).toMatch(/repeating-linear-gradient\(-45deg, var\(--hx-acc\)/);
    expect(stuck).not.toMatch(/animation/);
    expect(css).not.toMatch(/\.seg_stuck::after/);
  });
});

describe('LoadScreen: progress is the stages given', () => {
  it('the bar counts done stages, is named as the step list is and says which step is under way', () => {
    draw(stages('done', 'now', 'next', 'next'));
    const bar = screen.getByRole('progressbar', { name: 'Setup steps' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(bar.getAttribute('aria-valuetext')).toBe('Step 2 of 4');
    expect(bar.children.length).toBe(4);
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('busy');
  });

  it('time passing moves nothing: the bar changes only when the stages do', () => {
    const view = draw(stages('done', 'now', 'next'));
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 20));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    view.rerender(<LoadScreen title="Setting up" status="Done." stages={stages('done', 'done', 'done')} stagesLabel="Setup steps" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuetext')).toBe('Ready');
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('done');
  });

  it('with no stage under way the caption only counts, and the screen is idle unless the page says it waits', () => {
    const view = draw(stages('done', 'done', 'next'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('2 of 3 done');
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('idle');
    view.rerender(<LoadScreen title="Setting up" status="Reading." stages={stages('done', 'next', 'next')} stagesLabel="Setup steps" waiting />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('1 of 3 done');
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('busy');
  });

  it('"Step n" names the stage that is under way, wherever it is', () => {
    draw(stages('done', 'next', 'now'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Step 3 of 3');
  });

  it('a stuck stage says so, on the bar and in the list', () => {
    draw(stages('done', 'stuck', 'next'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Needs you');
    expect(document.querySelector('[data-load-screen]')?.getAttribute('data-load-screen')).toBe('stuck');
    const items = within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Step 1 (done)', 'Step 2 (needs you)', 'Step 3 (not started)']);
    expect(items.map((li) => li.getAttribute('data-state'))).toEqual(['done', 'stuck', 'next']);
  });

  it('the status line is one polite live region that stays mounted across a change', () => {
    const view = draw(stages('now'));
    const line = screen.getByRole('status');
    expect(line.getAttribute('aria-live')).toBe('polite');
    expect(line.textContent).toBe('Working on it.');
    view.rerender(<LoadScreen title="Setting up" status="Ready." stages={stages('done')} stagesLabel="Setup steps" />);
    expect(screen.getByRole('status')).toBe(line);
    expect(line.textContent).toBe('Ready.');
  });

  it('notice and actions are drawn as given; with neither nothing stands in', () => {
    const view = draw(stages('now'), { notice: <p>Needs an invite</p>, actions: <button type="button">Skip</button> });
    expect(screen.getByText('Needs an invite')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('now')} stagesLabel="Setup steps" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('LoadScreen: what next', () => {
  it('without cards (or when still) it is a block after the page\'s buttons', () => {
    draw(stages('done'), { items: undefined, actions: <button type="button">Open</button>, nextTitle: 'What next', next: <ul aria-label="Next things"><li>One</li></ul> });
    const block = document.querySelector('[data-load-next]') as HTMLElement;
    expect(block.closest('[data-card]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' }).compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Next on the last card goes to the end step and nothing wraps: Next and Pause are off there, Previous goes back', () => {
    draw(stages('now'), { nextTitle: 'What next', nextPending: 'Soon.' });
    const next = () => screen.getByRole('button', { name: 'Next card' });
    fireEvent.click(next());
    fireEvent.click(next());
    expect(shown()).toBe('c');
    fireEvent.click(next());
    expect(shown()).toBe('end');
    expect(within(document.querySelector('[data-load-next]') as HTMLElement).getByRole('heading', { name: 'What next' })).toBeTruthy();
    expect(screen.getByText('Soon.')).toBeTruthy();
    expect(next().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(next());
    expect(shown()).toBe('end');
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(shown()).toBe('c');
  });

  it('a control that is off at an end keeps the focus: it is soft-disabled with its reason, never a disabled button (a browser drops focus from one)', () => {
    const view = draw(stages('now'), { nextTitle: 'What next', nextPending: 'Soon.' });
    const btn = (name: string) => screen.getByRole('button', { name });
    // Stepping pauses the cards, so this one is named Play by then.
    const pause = () => screen.getByRole('button', { name: /^(Pause|Play) the cards$/ });
    const off = (el: HTMLElement, reason: string) => {
      expect(el.getAttribute('aria-disabled')).toBe('true');
      expect(el.hasAttribute('disabled')).toBe(false);
      expect(el).toHaveAccessibleDescription(reason);
    };
    off(btn('Previous card'), 'This is the first card.');
    expect(btn('Next card').getAttribute('aria-disabled')).toBeNull();
    expect(btn('Next card')).not.toHaveAccessibleDescription();
    btn('Next card').focus();
    for (let i = 0; i < 3; i++) fireEvent.click(btn('Next card'));
    expect(shown()).toBe('end');
    off(btn('Next card'), 'This is the last step.');
    off(pause(), 'The cards stop at the last step.');
    expect(document.activeElement).toBe(btn('Next card'));
    expect(btn('Previous card').getAttribute('aria-disabled')).toBeNull();
    // What next arriving under the focus: the same, soft.
    fireEvent.click(btn('Previous card'));
    pause().focus();
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('done')} stagesLabel="Setup steps" items={CARDS} itemsLabel="What you can do" nextTitle="What next" next={<ul aria-label="Next things"><li>One</li></ul>} />);
    expect(shown()).toBe('end');
    off(pause(), 'The cards stop at the last step.');
    expect(document.activeElement).toBe(pause());
  });

  it('without what next nothing is off at the ends: the cards wrap as before', () => {
    draw(stages('now'));
    for (const name of ['Previous card', 'Pause the cards', 'Next card']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBeNull();
  });

  it('a page that re-renders faster than a card lasts (it polls every 5 s) does not hold the rotation back', () => {
    const props = { title: 'Setting up', status: 'Working on it.', stages: stages('now'), stagesLabel: 'Setup steps', items: CARDS, itemsLabel: 'What you can do', nextTitle: 'What next', nextPending: 'Soon.' };
    const view = render(<LoadScreen {...props} />);
    act(() => void vi.advanceTimersByTime(5000));
    view.rerender(<LoadScreen {...props} />);
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS - 5000));
    expect(shown()).toBe('b');
  });

  it('the rotation stops at the end step instead of wrapping', () => {
    draw(stages('now'), { nextTitle: 'What next', nextPending: 'Soon.' });
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('end');
    for (let i = 0; i < 4; i++) act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('end');
    expect(screen.getByRole('group', { name: 'What you can do' }).getAttribute('data-load-cards')).toBe('held');
  });

  it('when what next arrives (the wait is over) the cards go to it; Previous still reaches the cards', () => {
    const view = draw(stages('now'), { nextTitle: 'What next', nextPending: 'Soon.' });
    expect(shown()).toBe('a');
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('done')} stagesLabel="Setup steps" items={CARDS} itemsLabel="What you can do" nextTitle="What next" next={<ul aria-label="Next things"><li>One</li></ul>} />);
    expect(shown()).toBe('end');
    expect(screen.getByRole('list', { name: 'Next things' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(shown()).toBe('c');
  });

  it('a screen that opens with What next already there starts at the first card (the person asked for the tour)', () => {
    draw(stages('done'), { nextTitle: 'What next', next: <ul aria-label="Next things"><li>One</li></ul> });
    expect(shown()).toBe('a');
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(shown()).toBe('end');
  });

  it('What next arriving when no step was under way (a first read came back) leaves the cards where they are', () => {
    const view = draw(stages('done', 'next'), { waiting: true, nextTitle: 'What next' });
    expect(shown()).toBe('a');
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('done')} stagesLabel="Setup steps" items={CARDS} itemsLabel="What you can do" nextTitle="What next" next={<ul aria-label="Next things"><li>One</li></ul>} />);
    expect(shown()).toBe('a');
  });

  it('draws the next block in the last step of the cards, under its own heading one level below the title; without it nothing stands in', () => {
    const view = draw(stages('done'), { actions: <button type="button">Open</button>, nextTitle: 'What next', next: <ul aria-label="Next things"><li>One</li></ul> });
    // The cards' last step (reached with Next); the page's buttons are in the card, which comes first in the document.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(shown()).toBe('end');
    const block = document.querySelector('[data-load-next]') as HTMLElement;
    expect(within(block).getByRole('heading', { name: 'What next' }).tagName).toBe('H3');
    expect(within(block).getByRole('list', { name: 'Next things' })).toBeTruthy();
    expect(block.closest('[data-card]')).toBeTruthy();
    expect(block.compareDocumentPosition(screen.getByRole('button', { name: 'Open' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('done')} stagesLabel="Setup steps" nextTitle="What next" />);
    expect(document.querySelector('[data-load-next]')).toBeNull();
  });
});

describe('LoadScreen: cards', () => {
  it('rotate by themselves, one at a time, and are not announced while they do', () => {
    draw(stages('now'));
    expect(shown()).toBe('a');
    expect(document.querySelectorAll('[data-card]').length).toBe(1);
    expect(live()?.getAttribute('aria-live')).toBe('off');
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('b');
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('a');
    expect(screen.getByRole('group', { name: 'What you can do' }).getAttribute('data-load-cards')).toBe('rotating');
  });

  it('Next and Previous step, wrap, stop the rotation and make the card announced; the live region is not replaced', () => {
    draw(stages('now'));
    const region = live();
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(shown()).toBe('c');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(shown()).toBe('a');
    expect(live()?.getAttribute('aria-live')).toBe('polite');
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 3));
    expect(shown()).toBe('a');
    expect(live()).toBe(region);
    fireEvent.click(screen.getByRole('button', { name: 'Play the cards' }));
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('b');
  });

  it('Play goes on at once, although the focus that pressed it is still inside the cards', () => {
    draw(stages('now'));
    const pause = screen.getByRole('button', { name: 'Pause the cards' });
    act(() => pause.focus());
    fireEvent.click(pause);
    const play = screen.getByRole('button', { name: 'Play the cards' });
    fireEvent.click(play);
    expect(document.activeElement).toBe(play);
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('b');
  });

  it('Pause holds the card until Play', () => {
    draw(stages('now'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause the cards' }));
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 3));
    expect(shown()).toBe('a');
    expect(screen.getByRole('button', { name: 'Play the cards' })).toBeTruthy();
  });

  it('focus inside the cards holds them; leaving lets them go on', () => {
    draw(stages('now'));
    const next = screen.getByRole('button', { name: 'Next card' });
    act(() => next.focus());
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 2));
    expect(shown()).toBe('a');
    act(() => next.blur());
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('b');
  });

  it('the pointer leaving does not let go while the focus is still inside the cards', () => {
    draw(stages('now'));
    const group = screen.getByRole('group', { name: 'What you can do' });
    const next = screen.getByRole('button', { name: 'Next card' });
    fireEvent.pointerEnter(group);
    act(() => next.focus());
    fireEvent.pointerLeave(group);
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 2));
    expect(shown()).toBe('a');
    act(() => next.blur());
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS));
    expect(shown()).toBe('b');
  });

  it('one card has no controls and no rotation', () => {
    draw(stages('now'), { items: CARDS.slice(0, 1) });
    expect(screen.queryByRole('button', { name: 'Next card' })).toBeNull();
    act(() => void vi.advanceTimersByTime(LOAD_CARD_MS * 2));
    expect(shown()).toBe('a');
  });

  it('still (Performance mode): every card at once as a list, no controls, nothing rotates', () => {
    document.documentElement.setAttribute(PERF_ATTR, 'on');
    draw(stages('now'));
    const list = screen.getByRole('list', { name: 'What you can do' });
    expect(list.getAttribute('data-load-cards')).toBe('all');
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-card'))).toEqual(['a', 'b', 'c']);
    expect(screen.queryByRole('button', { name: 'Pause the cards' })).toBeNull();
    for (const c of CARDS) expect(screen.getByRole('heading', { name: c.title })).toBeTruthy();
  });

  it('still (the system asks for reduced motion): the same list', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      draw(stages('now'));
      expect(screen.getByRole('list', { name: 'What you can do' }).getAttribute('data-load-cards')).toBe('all');
    } finally {
      window.matchMedia = real;
    }
  });
});

describe('LoadScreen: markup and CSS', () => {
  it('headings: the title, then each card one level below it', () => {
    draw(stages('now'));
    const title = screen.getByRole('heading', { name: 'Setting up' });
    const card = screen.getByRole('heading', { name: 'Computers' });
    expect(Number(card.tagName.slice(1))).toBe(Number(title.tagName.slice(1)) + 1);
  });

  it('inline style holds custom properties only: the step count, and the kit frame\'s cut', () => {
    const { container } = draw(stages('now', 'next'));
    const styles = [...container.querySelectorAll('[style]')].map((el) => el.getAttribute('style'));
    expect(styles).toContain('--load-steps: 2;');
    for (const st of styles) expect(st).toMatch(/^--[\w-]+: [^;]+;$/);
  });

  it('CSS: every animation is stopped under reduced motion and under Performance mode', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf(':root[data-hx-perf]'));
    const perf = css.slice(css.indexOf(':root[data-hx-perf]'), css.indexOf('@media (forced-colors: active)'));
    expect(reduce).toMatch(/animation: none/);
    expect(perf).toMatch(/animation: none/);
    // What loops moves by transform or opacity only (never a layout or paint property), and reads a motion role.
    const frames = css.slice(css.indexOf('@keyframes'), css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const moved = [...frames.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect([...new Set(moved)].sort()).toEqual(['opacity', 'transform']);
    expect(css).not.toMatch(/var\(--dur-\d\)/);
    // No colour literal and no dashed line.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/dashed/);
  });
});

describe('LoadScreen: the question block', () => {
  const ask = (over: Partial<NonNullable<Parameters<typeof LoadScreen>[0]['ask']>> = {}) => ({
    label: 'A few questions',
    place: 'Question 1 of 2',
    title: 'What first?',
    hint: 'Pick up to 2.',
    children: (ids: { title: string; hint: string | undefined }) => <div role="group" aria-labelledby={ids.title} aria-describedby={ids.hint} data-choices="" />,
    actions: <button type="button">Next</button>,
    note: 'Optional.',
    ...over,
  });

  it('without `ask` nothing of it is drawn', () => {
    draw(stages('now', 'next'), { actions: <button type="button">Skip</button> });
    expect(document.querySelector('[data-load-ask]')).toBeNull();
  });

  it('is a named group last in the column: after the page\'s buttons, so it never moves them', () => {
    draw(stages('now', 'next'), { actions: <a href="#/x">Open</a>, ask: ask() });
    const block = screen.getByRole('group', { name: 'A few questions' });
    expect(block.hasAttribute('data-load-ask')).toBe(true);
    const open = screen.getByRole('link', { name: 'Open' });
    expect(open.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(block).getByText('Question 1 of 2')).toBeTruthy();
  });

  it('the question is its heading, one level below the screen\'s, with the hint under it; both name and describe the choices', () => {
    draw(stages('now', 'next'), { ask: ask() });
    const block = document.querySelector('[data-load-ask]') as HTMLElement;
    const head = within(block).getByRole('heading', { name: 'What first?' });
    const title = screen.getByRole('heading', { name: 'Setting up' });
    expect(Number(head.tagName[1])).toBe(Number(title.tagName[1]) + 1);
    const hint = within(block).getByText('Pick up to 2.');
    expect(head.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const choices = block.querySelector('[data-choices]') as HTMLElement;
    expect(choices.getAttribute('aria-labelledby')).toBe(head.id);
    expect(choices.getAttribute('aria-describedby')).toBe(hint.id);
    // Then the choices, the buttons, the note: in that order.
    const order = [hint, choices, within(block).getByRole('button', { name: 'Next' }), within(block).getByText('Optional.')];
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no hint: the choices are described by nothing; no choices, buttons or note: none of their boxes', () => {
    draw(stages('now', 'next'), { ask: ask({ hint: undefined }) });
    expect(document.querySelector('[data-choices]')?.getAttribute('aria-describedby')).toBeNull();
    cleanup();
    draw(stages('now', 'next'), { ask: { label: 'Next step', place: 'A good next step', title: 'Do this' } });
    const block = document.querySelector('[data-load-ask]') as HTMLElement;
    expect(within(block).getByRole('heading', { name: 'Do this' })).toBeTruthy();
    expect(block.querySelectorAll('p').length).toBe(0);
    expect(block.querySelector('button')).toBeNull();
  });

  it('CSS: the block sits in the card past a rule, under the page\'s buttons', () => {
    const rule = css.slice(css.indexOf('.ask {'), css.indexOf('}', css.indexOf('.ask {')));
    expect(rule).toMatch(/border-block-start: var\(--bw\) solid var\(--hx-panel-line\)/);
    expect(rule).toMatch(/padding-block-start: var\(--sp-4\)/);
  });

  it('`steps` draws one small segment per question at the end of the place line, the first `at` marked; without it none', () => {
    const view = draw(stages('now', 'next'), { ask: ask({ steps: { at: 2, total: 4 } }) });
    const row = within(document.querySelector('[data-load-ask]') as HTMLElement).getByText('Question 1 of 2').parentElement as HTMLElement;
    const segs = row.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(segs.children.length).toBe(4);
    expect([...segs.children].filter((x) => /askStepAt/.test(x.className)).length).toBe(2);
    view.rerender(<LoadScreen title="Setting up" status="x" stages={stages('now')} stagesLabel="Setup steps" ask={ask()} />);
    expect((within(document.querySelector('[data-load-ask]') as HTMLElement).getByText('Question 1 of 2').parentElement as HTMLElement).querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
