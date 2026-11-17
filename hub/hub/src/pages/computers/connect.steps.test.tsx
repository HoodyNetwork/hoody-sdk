// The command-line and gateway folds on Connect are numbered steps (kit StepList) whose commands each
// have their own Copy (kit CodeLine); Run's temporary terminal is a kit section (title, description, body).
// The steps are checked by behaviour too: each Copy copies its own command, the commands and links follow
// the platform, and the terminal section keeps its controls (open, Board, the question's link).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { cliCommand, platformHosts } from '@kit';
import page from './page';
import strings from './strings.en.json';

const steps = (name: string) => screen.getByRole('group', { name });
const fold = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('computers: Connect and Run as kit sections, the SSH folds as steps', () => {
  it('the command-line fold is two numbered steps and the gateway fold one, each Copy copying its own command', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, { timeout: 8000 });

    await userEvent.click(fold(strings['ssh.cli.title']));
    const cli = steps(strings['ssh.cli.title']);
    expect(within(cli).getByText('01')).toBeInTheDocument();
    expect(within(cli).getByText('02')).toBeInTheDocument();
    expect(cli.textContent).toContain('curl -fsSL https://install.hoody.com | sh');
    expect(cli.textContent).toContain(cliCommand('login', platformHosts('api.hoody.com')));
    await userEvent.click(within(cli).getByRole('button', { name: strings['ssh.cli.installCopy'] }));
    await userEvent.click(within(cli).getByRole('button', { name: strings['ssh.cli.loginCopy'] }));
    await waitFor(() => expect(written).toEqual(['curl -fsSL https://install.hoody.com | sh', cliCommand('login', platformHosts('api.hoody.com'))]));
    expect(within(cli).getByRole('link', { name: new RegExp(`^${strings['ssh.cli.from']}`) })).toHaveAttribute('href', 'https://install.hoody.com');
    expect(within(cli).getByRole('link', { name: new RegExp(`^${strings['ssh.cli.sdk']}`) })).toHaveAttribute('href', 'https://sdk.hoody.com');

    await userEvent.click(fold(strings['ssh.gateway.title']));
    const gw = steps(strings['ssh.gateway.title']);
    expect(gw.textContent).toContain('ssh hoody.com');
    await userEvent.click(within(gw).getByRole('button', { name: strings['ssh.gateway.copy'] }));
    await waitFor(() => expect(written.at(-1)).toBe('ssh hoody.com'));
    expect(within(gw).getByRole('link', { name: new RegExp(`^${strings['ssh.gateway.link']}`) })).toHaveAttribute('href', 'https://ssh.hoody.com');
  }, 40000);

  it('on another platform the steps copy that platform’s installer and sign-in, and link its pages', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, { timeout: 8000 });
    await userEvent.click(fold(strings['ssh.cli.title']));
    const cli = steps(strings['ssh.cli.title']);
    await userEvent.click(within(cli).getByRole('button', { name: strings['ssh.cli.installCopy'] }));
    await userEvent.click(within(cli).getByRole('button', { name: strings['ssh.cli.loginCopy'] }));
    await waitFor(() => expect(written).toEqual(['curl -fsSL https://install.hoody.com | sh', cliCommand('login', platformHosts('api.hoody.com'))]));
    expect(within(cli).getByRole('link', { name: new RegExp(`^${strings['ssh.cli.from']}`) })).toHaveAttribute('href', 'https://install.hoody.com');
    expect(within(cli).getByRole('link', { name: new RegExp(`^${strings['ssh.cli.sdk']}`) })).toHaveAttribute('href', 'https://sdk.hoody.com');
  }, 40000);

  it('the temporary terminal on Run is a kit section that says how long it lasts and keeps its controls', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
    await screen.findByRole('heading', { name: strings['run.terminalTitle'] }, { timeout: 8000 });
    const term = screen.getByRole('heading', { name: strings['run.terminalTitle'] }).closest('section') as HTMLElement;
    expect(term).toHaveAttribute('data-hub-section');
    expect(within(term).getByText(strings['run.terminalLife'])).toBeInTheDocument();
    expect(within(term).getByRole('button', { name: 'Put on Board' })).toBeEnabled();
    await userEvent.click(within(term).getByRole('button', { name: strings['run.terminalMore'] }));
    expect(within(term).getByRole('link', { name: strings['run.terminalFaq'] })).toBeInTheDocument();
    const go = within(term).getByRole('button', { name: strings['run.openTerminal'] });
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const [url, target, features] = open.mock.calls[0]!;
    expect(new URL(String(url)).search).toBe('?ephemeral=true');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  }, 40000);
});
