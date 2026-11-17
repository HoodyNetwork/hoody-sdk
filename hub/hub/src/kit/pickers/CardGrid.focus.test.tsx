// CardGrid focusKey never takes the focus from a control the person moved to: a card that arrives late (a load, a
// filter) is focused only while the focus is on nothing (the page body) or already in the grid.
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardGrid } from './CardGrid';
import { PickCard } from './PickCard';

interface P {
  id: string;
  name: string;
}
const ITEMS: P[] = [
  { id: 'kuma', name: 'Uptime Kuma' },
  { id: 'memos', name: 'Memos' },
];
const keyOf = (p: P) => p.id;
const textOf = (p: P) => p.name;
const renderCard = (p: P) => <PickCard title={p.name} />;
const ui = (items: P[]) => (
  <>
    <input aria-label="Search" />
    <CardGrid label="Programs" items={items} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={() => undefined} focusKey="memos" />
  </>
);

describe('CardGrid focusKey and a late card', () => {
  it('a card that arrives while the person types in the search leaves the focus in the search', () => {
    const view = render(ui(ITEMS.slice(0, 1)));
    const search = screen.getByRole('textbox', { name: 'Search' });
    search.focus();
    act(() => view.rerender(ui(ITEMS)));
    expect(document.activeElement).toBe(search);
  });

  it('with the focus on nothing the late card still takes it', () => {
    const view = render(ui(ITEMS.slice(0, 1)));
    act(() => view.rerender(ui(ITEMS)));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Memos');
  });
});
