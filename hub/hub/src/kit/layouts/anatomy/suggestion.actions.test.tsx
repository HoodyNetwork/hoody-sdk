// Vitest, SuggestionActions:
// a labelled row of suggestions that are all shown, such as New script's examples, each of which fills
// the description. An ActionBar keeps two secondaries and puts the rest in More, and InlineActions draws at most
// three, so either would hide examples. SuggestionActions is the kit place: every one drawn at every width, a list
// named by its visible label, ids and labels distinct, at most eight.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_CONTAINER } from '../../media';
import { SUGGESTIONS_MAX, SuggestionActions } from './ActionBar';
import type { ActionSpec } from './types';

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

afterEach(() => {
  document.getElementById('hub-main')?.remove();
});

/** A marked `content` container of `px`: a phone's (390) is below the ActionBar's 600 px fold. */
function Region({ px, children }: { px: number; children: ReactNode }) {
  return (
    <div
      {...{ [CONTENT_CONTAINER]: '' }}
      ref={(el) => {
        if (el) Object.defineProperty(el, 'clientWidth', { configurable: true, value: px });
      }}
    >
      {children}
    </div>
  );
}

const a = (id: string, label: string, onPress: () => void = () => undefined): ActionSpec => ({ id, label, onPress });
const five = ['One', 'Two', 'Three', 'Four', 'Five'].map((l) => a(l.toLowerCase(), l));

describe('SuggestionActions: every suggestion shown', () => {
  it('at 390 all five are drawn, in order, in a list named by the visible label; no More menu', async () => {
    await show(() => (
      <Region px={390}>
        <SuggestionActions label="Examples" actions={five} />
      </Region>
    ));
    const list = screen.getByRole('list', { name: 'Examples' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['One', 'Two', 'Three', 'Four', 'Five']);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    // The name is text a person sees, not only an aria-label.
    expect(screen.getByText('Examples')).toBeVisible();
    expect(list).not.toHaveAttribute('aria-label');
  });

  it('the eighth still shows: up to the limit nothing folds', async () => {
    const eight = Array.from({ length: SUGGESTIONS_MAX }, (_, i) => a(`s${i}`, `Suggestion ${i}`));
    await show(() => <SuggestionActions label="Examples" actions={eight} />);
    expect(within(screen.getByRole('list', { name: 'Examples' })).getAllByRole('button')).toHaveLength(SUGGESTIONS_MAX);
    expect(SUGGESTIONS_MAX).toBe(8);
  });

  it('each runs its own action on press, as a secondary', async () => {
    const pressed: string[] = [];
    const acts = five.map((x) => a(x.id, x.label, () => pressed.push(x.id)));
    await show(() => <SuggestionActions label="Examples" actions={acts} />);
    await userEvent.click(screen.getByRole('button', { name: 'Three' }));
    await userEvent.click(screen.getByRole('button', { name: 'One' }));
    expect(pressed).toEqual(['three', 'one']);
    expect(screen.getByRole('button', { name: 'Three' })).not.toHaveAttribute('data-variant', 'primary');
  });

  it('the list is a wrapping row, sm by default, md on request', async () => {
    await show(() => (
      <>
        <SuggestionActions label="Small" actions={five} />
        <SuggestionActions label="Medium" size="md" actions={five.map((x) => a(`m-${x.id}`, `M ${x.label}`))} />
      </>
    ));
    const sm = screen.getByRole('list', { name: 'Small' });
    const md = screen.getByRole('list', { name: 'Medium' });
    expect(sm.className).toMatch(/inline/);
    expect(sm.className).toMatch(/suggestList/);
    expect(md.className).toMatch(/inline/);
    // The size is each control's own (the Button's sm plate), not a class of the row.
    for (const btn of sm.querySelectorAll('button')) expect(btn.className.split(' ')).toContain('sm');
    for (const btn of md.querySelectorAll('button')) expect(btn.className.split(' ')).not.toContain('sm');
    expect(md.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('no suggestions draws nothing', async () => {
    await show(() => (
      <div data-testid="host">
        <SuggestionActions label="Examples" actions={[]} />
      </div>
    ));
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });
});

describe('SuggestionActions: refused shapes (dev builds and tests)', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);
  it('more than eight: a longer list is a choice, not a row', () => {
    const e = quiet();
    const nine = Array.from({ length: SUGGESTIONS_MAX + 1 }, (_, i) => a(`s${i}`, `Suggestion ${i}`));
    expect(() => render(<SuggestionActions label="Examples" actions={nine} />)).toThrow(/9 suggestions; at most 8/);
    e.mockRestore();
  });

  it('an empty or blank label', () => {
    const e = quiet();
    expect(() => render(<SuggestionActions label="" actions={five} />)).toThrow(/visible label/);
    expect(() => render(<SuggestionActions label="   " actions={five} />)).toThrow(/visible label/);
    e.mockRestore();
  });

  it('a repeated id or label', () => {
    const e = quiet();
    expect(() => render(<SuggestionActions label="X" actions={[a('1', 'One'), a('1', 'Two')]} />)).toThrow(/id "1" appears twice/);
    expect(() => render(<SuggestionActions label="X" actions={[a('1', 'One'), a('2', 'One')]} />)).toThrow(/label "One" appears twice/);
    e.mockRestore();
  });
});

describe('SuggestionActions CSS', () => {
  it('the list has no marks or inset, and its name is the small muted label', () => {
    const css = readFileSync(join(__dirname, 'anatomy.module.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.suggestList')).toMatch(/margin: 0;[^]*padding: 0;[^]*list-style: none;/);
    expect(rule('.suggest')).toMatch(/flex-direction: column;[^]*gap: var\(--sp-2\);/);
    expect(rule('.suggestLabel')).toMatch(/font: var\(--t-small\);[^]*color: var\(--hx-muted\);/);
    expect(rule('.suggestList')).not.toMatch(/overflow: hidden|flex-wrap: nowrap/);
  });
});
