// A Talk band with nothing live (denied, busy elsewhere, ended) stands above the composer, whose Send and Mic stay.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import type { BotView } from './data';
import { Say } from './parts/Say';

vi.mock('./voice/TalkHost', () => ({
  useTalkSlots: () => ({ mic: <button type="button">Talk</button>, talk: null, band: <p>the band</p>, captions: null, notes: [] }),
}));
vi.mock('./data', async (real) => ({
  ...(await real<typeof Data>()),
  useSay: () => ({ send: vi.fn(), held: false, clear: vi.fn(), check: vi.fn() }),
}));

describe('a Talk band', () => {
  it('shows above a composer that keeps Send and the Mic', () => {
    render(<Say bot={{ name: 'Juno', gate: null } as unknown as BotView} botKey="c1~r1~juno" />);
    expect(screen.getByText('the band')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Talk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /send/i })).toBeTruthy();
  });
});
