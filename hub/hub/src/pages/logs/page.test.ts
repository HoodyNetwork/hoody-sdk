// Vitest: the logs page in its fixture states (the pure logic has its own test files).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('logs page', () => {
  it('shows the activity list for a running computer', async () => {
    renderPage(page, { state: 'quiet' });
    expect(await screen.findByRole('region', { name: strings.list }, { timeout: 6000 })).toBeTruthy();
  });

  it('says the computer is stopped', async () => {
    renderPage(page, { state: 'stopped' });
    expect(await screen.findByText(/is stopped/i)).toBeTruthy();
  });

  it('offers "Use with your agent" in the header (AgentHint)', async () => {
    renderPage(page, { state: 'quiet' });
    expect(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 6000 })).toBeTruthy();
  });

  it('asks to pick a computer when none is selected', async () => {
    renderPage(page, { state: 'noComputer' });
    expect(await screen.findByText(strings['st.pick'])).toBeTruthy();
  });

  it('shows the private-logs state with its fix', async () => {
    renderPage(page, { state: 'private' });
    await waitFor(() => expect(screen.getByText(strings['st.private'])).toBeTruthy(), { timeout: 6000 });
  });

  it('says nothing happened when there is nothing to show', async () => {
    renderPage(page, { state: 'empty' });
    await waitFor(() => expect(screen.getByText(/Nothing happened/)).toBeTruthy(), { timeout: 6000 });
  });
});
