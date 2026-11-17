// Vitest: the Cards / List choice is one remembered setting per group, shared by every list of
// the group at once, under the table-preference prefix (cleared at sign-out); anything else stored reads as the fallback.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PresentationSwitch, usePresentation } from './Presentation';

const KEY = 'hub.v3.table.present.machines';

function Probe({ name, fallback }: { name: string; fallback?: 'cards' | 'list' }) {
  const [value, set] = usePresentation('machines', fallback);
  return (
    <section aria-label={name}>
      <output>{value}</output>
      <PresentationSwitch value={value} onChange={set} />
    </section>
  );
}

const shown = (name: string) => screen.getByRole('region', { name }).querySelector('output')?.textContent;

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe('usePresentation', () => {
  it('starts at the fallback, and a switch in one list moves every list of the group and is kept', async () => {
    render(
      <>
        <Probe name="Computers" />
        <Probe name="Servers" />
      </>,
    );
    expect(shown('Computers')).toBe('list');
    expect(shown('Servers')).toBe('list');
    const cards = screen.getAllByRole('radio', { name: 'Cards' });
    await userEvent.click(cards[0]!);
    expect(shown('Computers')).toBe('cards');
    expect(shown('Servers')).toBe('cards');
    expect(localStorage.getItem(KEY)).toBe('cards');
  });

  it('reads a kept choice, and anything else stored as the fallback', () => {
    localStorage.setItem(KEY, 'cards');
    const one = render(<Probe name="Projects" />);
    expect(shown('Projects')).toBe('cards');
    one.unmount();
    localStorage.setItem(KEY, 'grid<script>');
    render(<Probe name="Projects" fallback="cards" />);
    expect(shown('Projects')).toBe('cards');
  });
});
