// Vitest: CardGrid is one Tab stop over its PickCards; the row owns the press (no button inside a card), names
// each card by its text value, moves with arrow keys, Home and End and type-ahead, picks with Enter or a click, and
// gives focus to `focusKey`.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CardGrid } from './CardGrid';
import { PickCard } from './PickCard';

interface P {
  id: string;
  name: string;
  line: string;
}
const ITEMS: P[] = [
  { id: 'kuma', name: 'Uptime Kuma', line: 'Uptime monitor' },
  { id: 'gitea', name: 'Gitea', line: 'Code hosting' },
  { id: 'ollama', name: 'Ollama', line: 'Runs AI models' },
  { id: 'memos', name: 'Memos', line: 'Quick notes' },
];
const keyOf = (p: P) => p.id;
const textOf = (p: P) => `${p.name}, ${p.line}`;
const renderCard = (p: P) => <PickCard title={p.name} line={p.line} meta={`${p.id}/${p.id}`} here={p.id === 'gitea' ? 'You opened this' : undefined} />;

function grid(props: Partial<Parameters<typeof CardGrid<P>>[0]> = {}) {
  const picks: string[] = [];
  const view = render(<CardGrid label="Programs" items={ITEMS} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={(k) => picks.push(k)} {...props} />);
  return { picks, view };
}
const rows = () => screen.getAllByRole('row');
const focusedName = () => document.activeElement?.getAttribute('aria-label');

describe('CardGrid', () => {
  it('a grid named by its label; each row named by its text value; no button inside a card', () => {
    grid();
    expect(screen.getByRole('grid', { name: 'Programs' })).toBeInTheDocument();
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual(ITEMS.map(textOf));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(document.querySelectorAll('[data-pick-card]')).toHaveLength(4);
  });

  it('is one Tab stop: Tab lands on the first card, the next Tab leaves the grid', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <CardGrid label="Programs" items={ITEMS} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={() => undefined} />
        <button type="button">after</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(focusedName()).toBe(textOf(ITEMS[0]!));
    await user.tab();
    expect(document.activeElement).toHaveTextContent('after');
  });

  it('arrow keys, End and Home move; a letter jumps to a name; Enter picks', async () => {
    const user = userEvent.setup();
    const { picks } = grid();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(focusedName()).toBe(textOf(ITEMS[1]!));
    await user.keyboard('{End}');
    expect(focusedName()).toBe(textOf(ITEMS[3]!));
    await user.keyboard('{Home}');
    expect(focusedName()).toBe(textOf(ITEMS[0]!));
    await user.keyboard('o');
    expect(focusedName()).toBe(textOf(ITEMS[2]!));
    await user.keyboard('{Enter}');
    expect(picks).toEqual(['ollama']);
  });

  it('the focused row draws its ring on the card; hover is drawn on the card too', async () => {
    const user = userEvent.setup();
    grid();
    await user.tab();
    const card = rows()[0]!.querySelector('[data-pick-card]')!;
    expect(card).toHaveAttribute('data-focus-visible');
    expect(card).toHaveAttribute('data-card-ring');
    await user.hover(rows()[1]!);
    expect(rows()[1]!.querySelector('[data-pick-card]')).toHaveAttribute('data-hovered');
  });

  it('a click picks that card', () => {
    const { picks } = grid();
    fireEvent.pointerDown(rows()[3]!, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(rows()[3]!, { pointerType: 'mouse', button: 0 });
    fireEvent.click(rows()[3]!);
    expect(picks).toEqual(['memos']);
  });

  it('focusKey gives focus to that card (the one you came back from); an unknown key moves nothing', () => {
    const { view } = grid();
    act(() => view.rerender(<CardGrid label="Programs" items={ITEMS} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={() => undefined} focusKey="gitea" />));
    expect(focusedName()).toBe(textOf(ITEMS[1]!));
    expect(document.activeElement!.querySelector('[data-here-words]')).toHaveTextContent('You opened this');
    (document.activeElement as HTMLElement).blur();
    act(() => view.rerender(<CardGrid label="Programs" items={ITEMS} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={() => undefined} focusKey="nope" />));
    expect(document.activeElement).toBe(document.body);
  });

  it('the focused row says "you were here": its name is the text value plus those words; other rows the text value', async () => {
    const user = userEvent.setup();
    grid();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAccessibleName(`${textOf(ITEMS[1]!)} You opened this`);
    expect(rows()[0]!).toHaveAccessibleName(textOf(ITEMS[0]!));
  });

  it('focusKey that arrives later (a filter, a load) is focused when its card appears, and only once', () => {
    const picks = () => undefined;
    const view = render(<CardGrid label="Programs" items={ITEMS.slice(0, 1)} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={picks} focusKey="memos" />);
    expect(document.activeElement).toBe(document.body);
    act(() => view.rerender(<CardGrid label="Programs" items={ITEMS} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={picks} focusKey="memos" />));
    expect(focusedName()).toBe(textOf(ITEMS[3]!));
    (document.activeElement as HTMLElement).blur();
    act(() => view.rerender(<CardGrid label="Programs" items={[...ITEMS]} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={picks} focusKey="memos" />));
    expect(document.activeElement).toBe(document.body);
  });

  it('no items: shows the empty node', () => {
    grid({ items: [], empty: <p>No programs match</p> });
    expect(screen.getByText('No programs match')).toBeInTheDocument();
    expect(screen.queryAllByRole('row').filter((r) => r.querySelector('[data-pick-card]'))).toHaveLength(0);
  });
});
