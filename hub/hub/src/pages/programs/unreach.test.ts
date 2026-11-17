// The programs page when the computer does not answer.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { lostReads } from './fixtures';
import page from './page';
import strings from './strings.en.json';

describe('programs: a computer that does not answer', () => {
  it("shows the not-reachable state with the computer's name and Try again, not the generic error", async () => {
    await renderPage(page, { state: 'unreachable' });
    const heading = await screen.findByRole('heading', { name: /isn't reachable right now$/ }, { timeout: 8000 });
    expect(heading.textContent).not.toMatch(/^This computer/);
    expect(screen.getByRole('status')).toHaveTextContent('It may be off, restarting or offline.');
    expect(screen.queryByText(/Couldn't read the programs/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('Try again reads again', async () => {
    await renderPage(page, { state: 'unreachable' });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toBeEnabled());
    const before = lostReads.overview;
    await userEvent.click(retry);
    await waitFor(() => expect(lostReads.overview).toBeGreaterThan(before));
    expect(await screen.findByRole('heading', { name: /isn't reachable right now$/ })).toBeInTheDocument();
  });

  it('a computer that answered with an error keeps the page error (reachable)', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /isn't reachable right now$/ })).toBeNull();
    expect(strings['st.failed']).toBeTruthy();
  });
});
