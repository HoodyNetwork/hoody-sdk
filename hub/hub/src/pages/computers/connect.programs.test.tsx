// Connect lists every Hoody Kit program a person can use: the ones with a page under "Program links" (copy,
// QR, open), the ones used from code under "Use from code" (copy and QR only), from the one list links.ts KIT_PROGRAMS
// that the Guide's Every link reads too (guide/links.catalogue.test.ts). SSH access is one section
// holding the `ssh` command and whether a key is set as facts, then two folds, the command line and the public gateway
// (`ssh hoody.com`). The gateway is worded as the docs word it: it names only hoody.com and ssh.hoody.com and never says
// it opens the agent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { cliCommand, platformHosts } from '@kit';
import { KIT_PROGRAMS } from './links';
import page from './page';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar');
const OPEN = ['agent', 'terminal', 'screen', 'files', 'browser', 'code', 'notes', 'workspaces', 'sqlite', 'pipe', 'cron', 'notifications'];
// The Connect tab shows the page programs without Workspaces (the catalogue keeps it for the other readers).
const SHOWN = OPEN.filter((k) => k !== 'workspaces');
const CODE = ['exec', 'curl', 'watch'];
const name = (k: string) => strings[`program.${k}` as keyof typeof strings];
const section = (id: string) => document.querySelector(`section#${id}`) as HTMLElement;
const sshSection = () => document.getElementById('connect-ssh') as HTMLElement;
// A fold's trigger is named by its title then its line; the fold is the trigger's heading's parent.
const fold = (title: string) => within(sshSection()).getByRole('button', { name: new RegExp(`^${title}`) });
const gateway = () => fold(strings['ssh.gateway.title']).closest('h1, h2, h3, h4, h5, h6')!.parentElement as HTMLElement;

// The first render of a run also loads the detail view; on a busy host that alone can pass 8 s.
const COLD = { timeout: 30000 };
afterEach(() => vi.restoreAllMocks());

describe('the program catalogue', () => {
  it('lists the page programs, then the code ones; never the control plane or plumbing', () => {
    expect(KIT_PROGRAMS.filter((p) => p.use === 'open').map((p) => p.key)).toEqual(OPEN);
    expect(KIT_PROGRAMS.filter((p) => p.use === 'code').map((p) => p.key)).toEqual(CODE);
    const slugs = KIT_PROGRAMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const out of ['daemon', 'run', 'tunnel', 'logs', 'egress', 'cdp', 'd-tcp', 'desktop']) expect(slugs).not.toContain(out);
    expect(KIT_PROGRAMS.find((p) => p.key === 'screen')?.slug).toBe('display');
  });
});

describe('Connect: program links in two groups', () => {
  it('a running computer: every page program with Open, the code ones with Copy and QR only', async () => {
    if (!atlas) throw new Error('no atlas');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, COLD);
    const pages = within(section('connect-links'));
    for (const k of SHOWN) {
      expect(pages.getByRole('button', { name: `Copy ${name(k)}` })).toBeInTheDocument();
      expect(pages.getByRole('button', { name: strings['connect.open'].replace('{{what}}', name(k)) })).toBeEnabled();
    }
    for (const k of CODE) expect(pages.queryByRole('button', { name: `Copy ${name(k)}` })).toBeNull();
    expect(pages.queryByRole('button', { name: `Copy ${name('workspaces')}` })).toBeNull();
    expect(section('connect-links').textContent).not.toContain(name('workspaces'));
    expect(pages.getAllByRole('button', { name: /^Copy / })).toHaveLength(SHOWN.length);
    const code = within(section('connect-api'));
    expect(code.getByRole('heading', { name: strings['connect.api'] })).toBeInTheDocument();
    expect(code.getAllByRole('listitem')).toHaveLength(CODE.length);
    for (const k of CODE) {
      expect(code.getByRole('button', { name: `Copy ${name(k)}` })).toBeInTheDocument();
      expect(code.queryByRole('button', { name: strings['connect.open'].replace('{{what}}', name(k)) })).toBeNull();
    }
    expect(code.getAllByRole('button', { name: 'QR code' })).toHaveLength(CODE.length);
    // No Open, and a click on the address opens nothing either (it is text, not a button): these programs have no page.
    expect(code.queryAllByRole('button', { name: /^https:\/\// })).toHaveLength(0);
    expect(section('connect-api').querySelectorAll('bdi').length).toBeGreaterThanOrEqual(CODE.length);
    for (const b of section('connect-api').querySelectorAll('bdi')) await userEvent.click(b);
    expect(open).not.toHaveBeenCalled();
    expect(section('connect-api').textContent).not.toContain(atlas.id);
    await userEvent.click(pages.getByRole('button', { name: strings['connect.open'].replace('{{what}}', name('notes')) }));
    expect(open).toHaveBeenLastCalledWith(`https://${atlas.project_id}-${atlas.id}-notes-1.${atlas.server_name}.fixture.invalid`, '_blank', 'noopener,noreferrer');
  }, 60000);

  it('a stopped computer: Open is off for every page program; the code ones still copy', async () => {
    if (!cedar) throw new Error('no cedar');
    await renderPage(page, { path: '/computers?sel=cedar.00c3&tab=connect' });
    await screen.findByRole('heading', { name: strings['connect.links'] }, COLD);
    for (const k of SHOWN) expect(within(section('connect-links')).getByRole('button', { name: strings['connect.open'].replace('{{what}}', name(k)) })).toBeDisabled();
    for (const k of CODE) expect(within(section('connect-api')).getByRole('button', { name: `Copy ${name(k)}` })).toBeEnabled();
  }, 60000);
});

describe('Connect: SSH through hoody.com', () => {
  it('a fold: `ssh hoody.com`, the docs wording, a link to ssh.hoody.com, and no word of the agent', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['ssh.title'] }, { timeout: 8000 });
    await userEvent.click(fold(strings['ssh.gateway.title']));
    const card = gateway();
    const text = card.textContent ?? '';
    expect(text).toContain('ssh hoody.com');
    expect(text).toContain(strings['ssh.gateway.body']);
    expect(strings['ssh.gateway.body']).toBe('ssh hoody.com opens a hosted session with the Hoody CLI from an interactive SSH client; nothing is installed on your device.');
    expect(within(card).getByRole('link', { name: strings['ssh.gateway.link'] })).toHaveAttribute('href', 'https://ssh.hoody.com');
    expect(text).not.toMatch(/agent/i);
    // Hosts it names: only hoody.com and ssh.hoody.com (text nodes read one by one, so no two run together).
    const words: string[] = [];
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) words.push(n.textContent ?? '');
    const hosts = words.join(' ').match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi) ?? [];
    expect(new Set(hosts)).toEqual(new Set(['hoody.com', 'ssh.hoody.com']));
  });

  it('SSH is one section: the command, the key as a fact, the two folds, no cards and no browser-terminal repeat', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['ssh.title'] }, { timeout: 8000 });
    const ssh = within(sshSection());
    expect(sshSection().querySelector('pre, code')?.textContent ?? '').toMatch(/ssh \S+/);
    expect(ssh.getByText(strings['ssh.fact.key'], { selector: 'dt' })).toBeInTheDocument();
    expect(fold(strings['ssh.cli.title'])).toBeInTheDocument();
    expect(fold(strings['ssh.gateway.title'])).toBeInTheDocument();
    // The four cards of before are gone: no browser-terminal card (the Terminal row of Program links is it), no Direct SSH card.
    expect(ssh.queryByRole('heading', { name: /^(In your browser|Direct SSH)$/ })).toBeNull();
    expect(ssh.queryByRole('button', { name: /^Open terminal$/ })).toBeNull();
  });

  it("the command's Copy is always there, and the command-line fold keeps the installer and the libraries for code", async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('heading', { name: strings['ssh.title'] }, { timeout: 8000 });
    const ssh = within(sshSection());
    // The command is a code block with its own Copy button, never the kit's hover-only fact copy.
    expect(sshSection().querySelector('pre, code')?.textContent ?? '').toMatch(/ssh \S+/);
    expect(ssh.getByRole('button', { name: new RegExp(`^Copy`) })).toBeVisible();
    await userEvent.click(fold(strings['ssh.cli.title']));
    // Each link says what it is: the installer, and the libraries for code.
    expect(await ssh.findByRole('link', { name: new RegExp(`^${strings['ssh.cli.from']}`) })).toHaveAttribute('href', 'https://install.hoody.com');
    expect(ssh.getByRole('link', { name: new RegExp(`^${strings['ssh.cli.sdk']}`) })).toHaveAttribute('href', 'https://sdk.hoody.com');
    // On hoody.com, the CLI's default, the sign-in is bare.
    expect(sshSection().textContent).toContain('hoody login');
    expect(sshSection().textContent).not.toContain('--base-url');
  });

  it('the command-line fold follows the platform: its installer, libraries and a sign-in naming its API', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
    try {
      await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
      await screen.findByRole('heading', { name: strings['ssh.title'] }, { timeout: 8000 });
      const ssh = within(sshSection());
      await userEvent.click(fold(strings['ssh.cli.title']));
      expect(await ssh.findByRole('link', { name: new RegExp(`^${strings['ssh.cli.from']}`) })).toHaveAttribute('href', 'https://install.hoody.com');
      expect(ssh.getByRole('link', { name: new RegExp(`^${strings['ssh.cli.sdk']}`) })).toHaveAttribute('href', 'https://sdk.hoody.com');
      expect(sshSection().textContent).toContain('curl -fsSL https://install.hoody.com | sh');
      expect(sshSection().textContent).toContain(cliCommand('login', platformHosts('api.hoody.com')));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Files has one Mount entry (its Use from your PC tab); the Connect row's Mount dialog links there,
// where the command line, sharing and the SDK are.
describe('Connect: Mount on your device', () => {
  it("the files row's Mount dialog links to that computer's Use from your PC tab in Files", async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await userEvent.click(await screen.findByRole('button', { name: 'Mount on your device' }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: 'Mount atlas on your device' });
    const link = within(d).getByRole('link', { name: 'Use from your PC' });
    expect(link.getAttribute('href')).toBe('#/files?computer=atlas.00a1&tab=pc');
  });
});
