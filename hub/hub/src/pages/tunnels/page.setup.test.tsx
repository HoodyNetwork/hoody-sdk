// The Setup drawer: how to connect a laptop, with copy-paste commands built from the person's
// choices, the warnings that go with them, and the New mark on rows that appear while it was open.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliCommand, interpolate, platformHosts } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// The fixture world's current computer, named in the drawer.
const named = (key: keyof typeof strings) => interpolate(strings[key], { name: 'atlas' });
const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
  return screen.findByRole('dialog', { name: named('setup.title') });
};
// The computer port and the password box sit under Advanced, closed by default.
const openAdvanced = (dlg: HTMLElement) => userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) }));
const codeText = (root: HTMLElement) => root.textContent ?? '';

// The sign-in line names the platform (--base-url) only when the Hub is not on hoody.com,
// the CLI's default; the install line points at the platform's own installer.
describe('tunnels setup: the CLI lines follow the platform', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('on hoody.com the sign-in is a bare "hoody login"', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
    await renderPage(page);
    const dlg = await open();
    expect(codeText(dlg)).toContain('hoody login');
    expect(codeText(dlg)).not.toContain('--base-url');
    expect(codeText(dlg)).toContain('curl -fsSL https://install.hoody.com | sh');
  });
  it('on a platform with its own hosts the sign-in, the installer and the SDK example are that platform\'s', async () => {
    const hosts = platformHosts('api.hoody.com');
    const com = platformHosts('api.hoody.com');
    // No host of hoody.com that the platform has its own of.
    const noneReplaced = (text: string) => { for (const k of ['root', 'api', 'install', 'sdk'] as const) if (hosts[k] !== com[k]) expect(text, k).not.toContain(com[k]); };
    vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
    await renderPage(page);
    const dlg = await open();
    expect(codeText(dlg)).toContain(cliCommand('login', hosts));
    expect(codeText(dlg)).toContain('curl -fsSL https://install.hoody.com | sh');
    noneReplaced(codeText(dlg));
    // The SDK example calls the platform's API too.
    await userEvent.click(within(dlg).getByRole('radio', { name: strings['setup.tool.sdk'] }));
    expect(codeText(dlg)).toContain("baseURL: 'https://api.hoody.com'");
    // The copied program is the same (the copy, not only the screen).
    expect(codeText(dlg)).toContain('process.env.HOODY_TOKEN');
    noneReplaced(codeText(dlg));
  });
  it('on another platform the sign-in and the SDK example name its API', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.example.test', origin: 'https://api.example.test' });
    await renderPage(page);
    const dlg = await open();
    expect(codeText(dlg)).toContain(cliCommand('login', platformHosts('api.example.test')));
    expect(codeText(dlg)).toContain('--base-url');
    await userEvent.click(within(dlg).getByRole('radio', { name: strings['setup.tool.sdk'] }));
    expect(codeText(dlg)).toContain("baseURL: 'https://api.example.test'");
    expect(codeText(dlg)).not.toContain('api.hoody.com');
  });
});

describe('tunnels setup: the drawer', () => {
  it('opens from the header and gives the expose command for the computer, the id masked on screen', async () => {
    const { router } = await renderPage(page);
    const dlg = await open();
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).setup).toBe('new'));
    // Why there are two ways (public addresses carry web traffic only) is the first step's Why, closed until asked.
    await userEvent.click(within(dlg).getByRole('button', { name: strings['setup.twoWays.more'] }));
    expect((await within(dlg).findByText(strings['setup.what.why'])).textContent).toMatch(/^Public addresses carry web traffic only/);
    expect(codeText(dlg)).toMatch(/hoody --computer \S+ tunnel expose 3000/);
    // The full 24-hex id is never on screen (Copy gives it).
    expect(codeText(dlg)).not.toMatch(/--computer [0-9a-f]{24}\b/);
    expect(within(dlg).getByText(strings['access.line'])).toBeInTheDocument();
    expect(within(dlg).getByText(strings['setup.address.later'])).toBeInTheDocument();
  });

  it('a database port warns; Bring into this computer gives the pull command', async () => {
    await renderPage(page);
    const dlg = await open();
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '5432');
    expect(await within(dlg).findByText(strings['setup.warn.risky'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp(strings['setup.pull']) }));
    await waitFor(() => expect(codeText(dlg)).toMatch(/tunnel pull 5432/));
    expect(within(dlg).getByText(strings['setup.inside.later'])).toBeInTheDocument();
  });

  it('a fixed computer port previews the place inside the computer (pull) and the web address (expose)', async () => {
    await renderPage(page);
    const dlg = await open();
    await openAdvanced(dlg);
    await userEvent.type(await within(dlg).findByRole('textbox', { name: named('setup.computerPort') }), '8080');
    await waitFor(() => expect(codeText(dlg)).toMatch(/tunnel expose 3000 --port 8080/));
    expect(within(dlg).queryByText(strings['setup.address.later'])).toBeNull();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp(strings['setup.pull']) }));
    expect(await within(dlg).findByText('127.0.0.1:8080')).toBeInTheDocument();
  });

  it('a password-protected computer adds the flags only: the password is never in any command', async () => {
    await renderPage(page);
    const dlg = await open();
    await openAdvanced(dlg);
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: new RegExp(named('setup.login')) }));
    expect(await within(dlg).findByText(strings['setup.fixFirst'])).toBeInTheDocument();
    await userEvent.type(within(dlg).getByRole('textbox', { name: strings['setup.user'] }), 'ops');
    await waitFor(() => expect(codeText(dlg)).toMatch(/--kit-auth password --kit-user ops tunnel expose 3000/));
    expect(codeText(dlg)).not.toMatch(/HOODY_KIT_PASSWORD=|password=/);
    await userEvent.click(within(dlg).getByRole('radio', { name: strings['setup.tool.sdk'] }));
    await waitFor(() => expect(codeText(dlg)).toContain('password: kitPassword'));
  });

  it('an IPv6 host is refused at the field with the IPv4-only line, and no command is shown', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.type(within(dlg).getByRole('textbox', { name: strings['setup.host'] }), '::1');
    expect(await within(dlg).findByText(strings['setup.err.v4only'])).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['setup.err.host'])).toBeNull();
    expect(codeText(dlg)).not.toMatch(/tunnel expose/);
  });
  it('a computer port below 80 is refused at the field and no command is shown', async () => {
    await renderPage(page);
    const dlg = await open();
    await openAdvanced(dlg);
    await userEvent.type(await within(dlg).findByRole('textbox', { name: named('setup.computerPort') }), '79');
    expect(await within(dlg).findByText(strings['setup.err.low'])).toBeInTheDocument();
    expect(within(dlg).getByText(strings['setup.fixFirst'])).toBeInTheDocument();
    expect(codeText(dlg)).not.toMatch(/tunnel expose/);
  });

  it('the Hub was refused by the access settings: the password box starts ticked', async () => {
    await renderPage(page, { state: 'forbidden' });
    // The page moves from the loading table to Not allowed first (a new header).
    expect(await screen.findByText(strings['st.forbidden'])).toBeInTheDocument();
    const dlg = await open();
    expect(within(dlg).getByRole('checkbox', { name: new RegExp(named('setup.login')) })).toBeChecked();
  });

  it('a computer without the tunnel program offers no Setup', async () => {
    await renderPage(page, { state: 'not-installed' });
    expect(await screen.findByText(strings['st.none'], { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['setup.open'] })).toBeNull();
  });
});

describe('tunnels setup: New rows', () => {
  it('rows that appear after the panel opened are marked New', async () => {
    await renderPage(page, { state: 'appears' });
    expect(await screen.findByText(strings['st.idle'])).toBeInTheDocument();
    await open();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: strings.refresh }));
    const tb = await screen.findByRole('table', { name: strings.title });
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    // Five shared places of the two sessions, each new.
    expect(within(tb).getAllByText(strings.new)).toHaveLength(5);
  });

  it('rows already there when it opened are not', async () => {
    await renderPage(page);
    const tb = await screen.findByRole('table', { name: strings.title });
    await within(tb).findByText('127.0.0.2:5432');
    await open();
    expect(within(tb).queryByText(strings.new)).toBeNull();
  });
});

// The overview's own poll (30 s) is a TanStack interval: only setInterval is faked, answers keep real time.
const nextOverviewPoll = () => act(async () => { vi.advanceTimersByTime(30_000); });

describe('tunnels setup: a laptop connecting while the drawer is open', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stopped, then a laptop connects while the drawer is open: its rows are New', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderPage(page, { state: 'starts' });
    expect(await screen.findByText(strings['st.stopped'])).toBeInTheDocument();
    await open();
    await nextOverviewPoll();
    const tb = await screen.findByRole('table', { name: strings.title });
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(within(tb).getAllByText(strings.new)).toHaveLength(5);
  });

  it('stopped, drawer opened and closed, then a laptop connects: its rows are New', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderPage(page, { state: 'starts' });
    expect(await screen.findByText(strings['st.stopped'])).toBeInTheDocument();
    await open();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await nextOverviewPoll();
    const tb = await screen.findByRole('table', { name: strings.title });
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(within(tb).getAllByText(strings.new)).toHaveLength(5);
  });

  it('a place that was there when the drawer opened is not New while its session reconnects', async () => {
    await renderPage(page, { state: 'reconnects' });
    const tb = await screen.findByRole('table', { name: strings.title });
    await within(tb).findByText('127.0.0.1:5432');
    await open();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: strings.refresh }));
    expect(await within(tb).findByText(strings['group.reconnecting'])).toBeInTheDocument();
    expect(within(tb).queryByText(strings.new)).toBeNull();
  });

  it('a failed overview read keeps the drawer open with what was typed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderPage(page, { state: 'overview-flaky' });
    const dlg = await open();
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '8443');
    await nextOverviewPoll();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const still = screen.getByRole('dialog', { name: named('setup.title') });
    expect(within(still).getByRole('textbox', { name: strings['setup.port'] })).toHaveValue('8443');
  });

  it('an overview that did not answer still offers Setup (unreadable is not "no program")', async () => {
    await renderPage(page, { state: 'daemon-error' });
    expect(await screen.findByText(strings['st.daemon'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['setup.open'] })).toBeInTheDocument();
  });
});
