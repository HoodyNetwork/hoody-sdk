// axe label-content-name-mismatch: a realm row's accessible name starts with the words it shows,
// so a voice user can say what they see. The row is named by its own visible words (no aria-label over them).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setRealm = vi.fn();
const A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
let selected = A;

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useShellData: () => ({ setRealm }) }));
vi.mock('@core', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useRealms: () => ({
    selected,
    pinned: null,
    rows: [
      { id: A, name: { text: 'Personal' }, tint: 'red', computers: 3 },
      { id: B, name: { text: 'Studio' }, tint: '', computers: null },
    ],
  }),
}));

import { RealmsCard } from './RealmsCard';

const rows = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-realm]'));

beforeEach(() => {
  setRealm.mockReset();
  selected = A;
});

describe('RealmsCard rows: label in name', () => {
  it('realm_row_name_starts_with_shown_text: every row is named from its visible words, none by an aria-label over them', () => {
    render(<RealmsCard title="Your realms" />);
    expect(rows()).toHaveLength(3);
    for (const b of rows()) {
      expect(b.hasAttribute('aria-label')).toBe(false);
      expect(b.hasAttribute('aria-labelledby')).toBe(false);
      expect((b.textContent ?? '').trim()).not.toBe('');
    }
    expect(screen.getByRole('button', { name: /^All realms/ })).toBe(rows()[0]);
    expect(screen.getByRole('button', { name: /^Personal\s*3 computers\s*Showing$/ })).toBe(rows()[1]);
    expect(screen.getByRole('button', { name: /^Studio$/ })).toBe(rows()[2]);
  });

  it('realm_row_still_switches: pressing a row that is not shown switches to it; the shown row does nothing', async () => {
    render(<RealmsCard title="Your realms" />);
    await userEvent.click(screen.getByRole('button', { name: /^Studio$/ }));
    expect(setRealm).toHaveBeenCalledWith(B);
    await userEvent.click(screen.getByRole('button', { name: /^All realms/ }));
    expect(setRealm).toHaveBeenLastCalledWith('all');
    setRealm.mockReset();
    await userEvent.click(screen.getByRole('button', { name: /^Personal/ }));
    expect(setRealm).not.toHaveBeenCalled();
    expect(rows()[1]!.getAttribute('aria-current')).toBe('true');
    expect(rows()[2]!.hasAttribute('aria-current')).toBe(false);
  });
});
