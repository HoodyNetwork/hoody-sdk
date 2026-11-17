// Vitest: the kit Ledger (label and amount rows, a note under a row, a total after a
// rule) and ShortcutTable (each row's keys as Kbd, then what they do; a group title as a kit Heading).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ledger, ShortcutTable } from '@kit';

describe('Ledger', () => {
  it('a named list of label and amount pairs, a note in its row, the total last', () => {
    render(
      <Ledger
        label="Credit"
        rows={[
          { id: 'pending', label: 'Pending', amount: '$12.00', note: 'Released on Dec 1' },
          { id: 'reversed', label: 'Reversed', amount: '$0.00', tone: 'muted' },
        ]}
        total={{ label: 'Available', amount: '$40.00' }}
      />,
    );
    const dl = screen.getByLabelText('Credit');
    expect(dl.tagName).toBe('DL');
    const terms = within(dl).getAllByRole('term').map((x) => x.textContent);
    expect(terms).toEqual(['Pending', 'Reversed', 'Available']);
    const defs = within(dl).getAllByRole('definition').map((x) => x.textContent);
    expect(defs).toEqual(['$12.00', 'Released on Dec 1', '$0.00', '$40.00']);
    expect(within(dl).getByText('Available').closest('[data-ledger-total]')).not.toBeNull();
  });

  it('without a total there is no total row', () => {
    const { container } = render(<Ledger label="Fees" rows={[{ id: 'a', label: 'Setup', amount: '$1.00' }]} />);
    expect(container.querySelector('[data-ledger-total]')).toBeNull();
  });
});

describe('ShortcutTable', () => {
  it('keys as Kbd, combos split, then the label; a group title is a heading', () => {
    render(
      <ShortcutTable
        label="Keyboard shortcuts"
        groups={[
          {
            id: 'nav',
            title: 'Moving around',
            rows: [
              { keys: ['Ctrl K'], label: 'Search' },
              { keys: ['G', 'H'], then: true, label: 'Go home' },
              { keys: ['j', 'k'], label: 'Move down or up' },
            ],
          },
          { id: 'edit', rows: [{ keys: ['?'], label: 'All shortcuts' }] },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Moving around' })).toBeInTheDocument();
    const search = screen.getByText('Search').closest('[data-shortcut-row]') as HTMLElement;
    expect([...search.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl', 'K']);
    const home = screen.getByText('Go home').closest('[data-shortcut-row]') as HTMLElement;
    expect([...home.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['G', 'H']);
    // The term reads as words, not joined chips: a space inside a chord, ", then" between chords pressed in order.
    expect(search.querySelector('dt')?.textContent).toBe('Ctrl K');
    expect(home.querySelector('dt')?.textContent).toBe('G, then H');
    // Alternatives (the default) read "or", never as a sequence.
    const move = screen.getByText('Move down or up').closest('[data-shortcut-row]') as HTMLElement;
    expect(move.querySelector('dt')?.textContent).toBe('j, or k');
    // Each group is its own list, named by its title, or by the table's label when it has none.
    expect(screen.getByLabelText('Moving around').tagName).toBe('DL');
    expect(screen.getByLabelText('Keyboard shortcuts').tagName).toBe('DL');
  });

  it('the space bar: written Space, or a bare space, reads Space and never an empty chip', () => {
    render(<ShortcutTable label="Keys" groups={[{ id: 'g', rows: [{ keys: ['Shift Space'], label: 'Page up' }, { keys: [' '], label: 'Play' }] }]} />);
    const up = screen.getByText('Page up').closest('[data-shortcut-row]') as HTMLElement;
    expect([...up.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Shift', 'Space']);
    const play = screen.getByText('Play').closest('[data-shortcut-row]') as HTMLElement;
    expect([...play.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Space']);
  });
});
