// Vitest: a computer list the Hub does not know never reads as "no computer" (C9, the knc rule). Loading reads as
// loading, a failed read as not loaded with Try again, and "No computer selected" only once the list is known.
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, dropComputer, fixtureWorld } from '@core';
import { installTransport } from '@core/transport';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the live computer read, not page code
import { ShellDataProvider } from '@shell/context';
import { useComputer } from './data';
import page from './page';
import strings from './strings.en.json';

const base: ShellData = { realms: [], realmId: 'all', computers: [] };
const live = (shell: Partial<ShellData>) => {
  installTransport(null);
  const wrapper = ({ children }: { children: ReactNode }) => <ShellDataProvider value={{ ...base, ...shell }}>{children}</ShellDataProvider>;
  return renderHook(() => useComputer(), { wrapper }).result.current;
};

afterEach(() => { installTransport(null); });

describe('schedules: the live computer read', () => {
  it('reads a list still loading as loading, not as no computer', () => {
    dropComputer();
    const c = live({ computersRead: 'loading' });
    expect(c.data).toBeNull();
    expect(c.read).toBe('loading');
  });

  it('reads a failed list as unknown, with the shell\'s Try again', () => {
    dropComputer();
    const retry = vi.fn();
    const c = live({ computersRead: 'unknown', retryComputers: retry });
    expect(c.data).toBeNull();
    expect(c.read).toBe('unknown');
    c.retry?.();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reads none only on a known list', () => {
    dropComputer();
    const c = live({});
    expect(c.data).toBeNull();
    expect(c.read).toBeUndefined();
  });

  it('reads a chosen computer the list does not hold as unnamed and running, never from fixtures', () => {
    const w = fixtureWorld.computers[0]!;
    chooseComputer(w);
    const c = live({ computers: [] });
    expect(c.data).toEqual({ name: '', status: 'running' });
    dropComputer();
  });

  it('leaves a chosen computer as it was, whatever the list read says', () => {
    const w = fixtureWorld.computers[0]!;
    chooseComputer(w);
    const c = live({ computersRead: 'unknown', computers: [{ id: w.id, name: 'atlas-row', running: true }] as ShellData['computers'] });
    expect(c.data).toEqual({ name: 'atlas-row', status: 'running' });
    expect(c.read).toBeUndefined();
    dropComputer();
  });
});

describe('schedules: the page while the computer list is not known', () => {
  it('shows loading, never "No computer selected", while the list loads', async () => {
    await renderPage(page, { state: 'computers-loading' });
    expect(await screen.findByRole('heading', { name: strings['title'] })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(strings['st.title.noComputer'])).toBeNull();
    expect(screen.queryByText(strings['st.pick'])).toBeNull();
  });

  it('shows not loaded with Try again, never "No computer selected", when the list read failed', async () => {
    await renderPage(page, { state: 'computers-unknown' });
    expect(await screen.findByText(strings['st.title.computersUnknown'])).toBeInTheDocument();
    expect(screen.getByText(strings['st.computersUnknown'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText(strings['st.title.noComputer'])).toBeNull();
    // Nothing is listed, so no editor can open: no New schedule.
    expect(screen.queryByRole('button', { name: strings['action.new'] })).toBeNull();
  });

  it('keeps Try again on screen, busy, through the read it started', { timeout: 30000 }, async () => {
    await renderPage(page, { state: 'computers-unknown', latency: 'slow' });
    const again = await screen.findByRole('button', { name: /Try again/ }, { timeout: 8000 });
    await userEvent.click(again);
    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).toHaveAttribute('data-pending', 'true'));
    expect(screen.queryByText(strings['st.title.noComputer'])).toBeNull();
    // That read fails too: not loaded again, Try again ready for another press.
    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).not.toHaveAttribute('data-pending', 'true'), { timeout: 8000 });
    expect(screen.getByText(strings['st.title.computersUnknown'])).toBeInTheDocument();
  });

  it('keeps keyboard focus on the same Try again through its read and after it fails', { timeout: 30000 }, async () => {
    await renderPage(page, { state: 'computers-unknown', latency: 'slow' });
    const again = await screen.findByRole('button', { name: /Try again/ }, { timeout: 8000 });
    again.focus();
    expect(again).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(again).toHaveAttribute('data-pending', 'true'));
    expect(again).toBeInTheDocument();
    expect(again).toHaveFocus();
    await waitFor(() => expect(again).not.toHaveAttribute('data-pending', 'true'), { timeout: 8000 });
    expect(again).toBeInTheDocument();
    expect(again).toHaveFocus();
  });

  it('shows loading again for a later read the person did not ask for', { timeout: 30000 }, async () => {
    const { queryClient } = await renderPage(page, { state: 'computers-unknown', latency: 'normal' });
    await userEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 8000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).not.toHaveAttribute('data-pending', 'true'), { timeout: 8000 });
    // Another read of the list (not the person's Try again): loading, not a busy Try again.
    void queryClient.refetchQueries();
    await waitFor(() => expect(screen.queryByText(strings['st.title.computersUnknown'])).toBeNull());
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(strings['st.title.noComputer'])).toBeNull();
  });

  it('still says "No computer selected" once the list is known and nothing is chosen', async () => {
    await renderPage(page, { state: 'no-computer' });
    expect(await screen.findByText(strings['st.title.noComputer'])).toBeInTheDocument();
    expect(screen.queryByText(strings['st.title.computersUnknown'])).toBeNull();
  });
});
