// Vitest: the thread's "what happens next" line sits with the reply box (one block, under the messages), so it stays in
// view beside the action it explains however long the thread is. A thread with no reply box keeps its own end state.
import { renderPage, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { T_CLOSED, T_GOOD, T_OPEN } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 10000 };

describe('the what-next line', () => {
  it('is in the reply box of a ticket waiting for support', async () => {
    await renderPage(page, { path: `/support?sel=${String(T_OPEN.id)}` });
    const line = await screen.findByText(strings['thread.waitingSupport'], undefined, SLOW);
    expect(line.parentElement).toContainElement(screen.getByRole('textbox', { name: strings['reply.label'] }));
    expect(screen.getAllByText(strings['thread.waitingSupport'])).toHaveLength(1);
  });

  it('is in the reply box of a closed ticket that a reply opens again', async () => {
    await renderPage(page, { path: `/support?sel=${String(T_CLOSED.id)}` });
    const line = await screen.findByText(/Reply within 30 days of closing to open it again\./, undefined, SLOW);
    expect(line.parentElement).toContainElement(screen.getByRole('textbox', { name: strings['reply.label'] }));
  });

  it('a ticket closed for good keeps its own end state, once', async () => {
    await renderPage(page, { path: `/support?sel=${String(T_GOOD.id)}` });
    expect(await screen.findAllByText(strings['thread.closedForGood'], undefined, SLOW)).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: strings['reply.label'] })).toBeNull();
  });
});
