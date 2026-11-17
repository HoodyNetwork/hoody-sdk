// Vitest: with no computer yet, the invite zero state is one card. The invite card
// (Code and Redeem) is the box; the empty state above it is the plain small look, never a second card stacked over it.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('the Computers invite zero state', () => {
  it('is one card: the invite card under a plain small empty state', async () => {
    await renderPage(page, { state: 'empty', path: '/computers' });
    await screen.findByLabelText(strings['zero.invite.label'], {}, { timeout: 8000 });
    // No empty card: the empty state above the invite card is plain, with its title.
    expect(document.querySelectorAll('[data-empty-place]')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: strings['zero.invite.title'] })).toBeInTheDocument();
    // The invite card is still there, with its field and Redeem.
    expect(screen.getByText(strings['zero.invite.card'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['zero.invite.go'] })).toBeInTheDocument();
  });
});
