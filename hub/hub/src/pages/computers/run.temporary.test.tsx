// Vitest: the Run tab's full terminal is a temporary one. It opens the computer's terminal-0 address with
// only ?ephemeral=true (a new session the terminal kit closes after its window does), never terminal-1, where the
// proxy's forced terminal_id=1 would make the shared terminal 1 temporary; its question says how long it lasts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { programUrl, temporaryTerminalUrl } from './urls';
import type { Computer } from './types';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

afterEach(() => { vi.restoreAllMocks(); });

describe('temporaryTerminalUrl', () => {
  it('is the terminal-0 address of the same computer with only ?ephemeral=true', () => {
    const u = new URL(temporaryTerminalUrl(atlas));
    const shared = new URL(programUrl(atlas, 'terminal'));
    expect(u.hostname).toBe(shared.hostname.replace('-terminal-1.', '-terminal-0.'));
    expect(u.hostname).toContain('-terminal-0.');
    expect(u.search).toBe('?ephemeral=true');
    expect(u.searchParams.has('terminal_id')).toBe(false);
  });
  it("is '' when the computer's server is unknown", () => {
    const bare = { ...atlas, server: undefined, server_name: undefined } as unknown as Computer;
    expect(temporaryTerminalUrl(bare)).toBe('');
  });
});

describe('computers: Run tab, a temporary terminal', () => {
  it('Open a temporary terminal opens the terminal-0 address with ephemeral=true, and its question says how long it lasts', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
    const btn = await screen.findByRole('button', { name: strings['run.openTerminal'] }, { timeout: 8000 });
    // How long it lasts shows beside the button before anything is opened...
    expect(screen.getByText(strings['run.terminalLife'], { exact: false })).toBeVisible();
    // ...and the rest is folded under its question, whose answer ends with the page's question about shells; beside a
    // computer the rail holds no questions, so the link peeks it, and its answer says it whole.
    await userEvent.click(screen.getByRole('button', { name: strings['run.terminalMore'] }));
    expect(screen.getByText(strings['run.terminalWhy'])).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: strings['run.terminalFaq'] }));
    const answer = within(await screen.findByRole('dialog')).getByText(strings['faq.sshAndTerminal.a'], { exact: false });
    expect(answer.textContent).toContain('A temporary terminal closes about a minute after you close its window');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(btn);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const [url, target, features] = open.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.hostname).toContain('-terminal-0.');
    expect(u.hostname).not.toContain('-terminal-1.');
    expect(u.search).toBe('?ephemeral=true');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  }, 30000);
});
