// Vitest: the Run tab puts a NEW terminal of this computer on the Board: its Put on Board goes to the Board's
// new-terminal Add link (the Board gives the terminal the next free number), never terminal 1. The button's words are
// the Board's (board/boardAdd.strings.en.json, which a page may not import).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { computers } from './fixtures';
import page from './page';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

describe('computers: Run tab, a new terminal on the Board', () => {
  it('Put on Board opens the Board with a new terminal of this computer', async () => {
    const r = await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
    const put = await screen.findByRole('button', { name: 'Put on Board' }, { timeout: 8000 });
    await userEvent.click(put);
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/board'));
    const q = new URLSearchParams(r.router.state.location.searchStr);
    expect(q.get('add')).toBe('terminal-new');
    expect(q.get('cid')).toBe(atlas.id);
  }, 30000);
});
