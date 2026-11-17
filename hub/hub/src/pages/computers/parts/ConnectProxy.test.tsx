// "Use it as a proxy": the computer's proxy address (masked on screen, copied whole) and setup for browsers, scripts
// and the ways to change the exit. The page keeps the address, Copy and the warning; the rest is in "How to connect":
// the address and its values on the top plate, one choice of browser or tool, and "Good to know" rows under them.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cliCommand, platformHosts } from '@kit';
import { computers } from '../fixtures';
import type { Computer } from '../types';
import { ConnectProxy as Proxy, proxyUrl } from './ConnectProxy';
import strings from './ConnectProxy.strings.en.json';

const c = computers.find((x) => x.status === 'running') as Computer;
const name = (k: keyof typeof strings) => strings[k].replaceAll('{{name}}', c.name);

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
const press = async (label: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
};
const TABS = ['curl', 'unix', 'windows', 'node'] as const;
const BROWSERS = { firefox: 'proxy.tab.firefox', chrome: 'proxy.tab.chromeEdge', system: 'proxy.tab.system' } as const;
/** One choice of a kit SegmentedControl (the browser, the tool), by the group's name and the choice's label. */
const choice = (group: string, label: string) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: label });
const pick = async (group: string, label: string) => userEvent.click(choice(group, label));
/** Opens the "Change the exit" tab of an open How to connect. */
const openExit = async () => userEvent.click(screen.getByRole('tab', { name: strings['proxy.exit.tab'] }));
/** Opens "How to connect" on For scripts (the commands are the second group); returns the drawer. */
const openHow = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings['proxy.scripts'] }));
  return screen.findByRole('dialog', { name: strings['proxy.how'] });
};

describe('Proxy', () => {
  it('builds the egress address on port 443 of the computer', () => {
    expect(proxyUrl(c)).toMatch(new RegExp(`^https://${c.project_id}-${c.id}-egress-1\\..+:443$`));
  });

  it('has no address while the server is unknown', () => {
    expect(proxyUrl({ ...c, server: undefined, server_name: undefined } as unknown as Computer)).toBe('');
  });

  it('leads with keeping the address private and only my IP, and says it reaches public IPv4 only', async () => {
    render(<Proxy c={c} />);
    const lead = screen.getByText(strings['proxy.secret'].replaceAll('{{name}}', c.name));
    expect(lead.parentElement).toHaveTextContent(strings['proxy.onlyMe.docs']);
    // The page holds the address and the warning; how it works and what it reaches is in How to connect.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(document.body).not.toHaveTextContent(name('proxy.limits'));
    const d = await openHow();
    expect(d).toHaveTextContent(name('proxy.limits'));
    expect(d).toHaveTextContent(name('proxy.what'));
    expect(d).toHaveTextContent(name('proxy.check'));
    // Exit IP and destination rules hold only without an upstream (kit/egress.mdx): the text says so, in the
    // panel's own word for an upstream, "another exit" (never "upstream" or "egress program").
    expect(name('proxy.what')).toMatch(/unless you set another exit/);
    expect(name('proxy.limits')).toMatch(/^Without another exit, it reaches public IPv4 addresses only\. Private and local addresses are refused\./);
    expect(name('proxy.limits')).toMatch(/If you set another exit, that exit decides which sites work/);
    expect(name('proxy.check')).toMatch(/its exit's if you set one/);
    // No proxy login text until it is proven live.
    expect(document.body.textContent).not.toMatch(/password@|user:pass|Proxy-Authorization/i);
  });

  it('shows the address masked on every tab but copies it, and each command, whole', async () => {
    render(<Proxy c={c} />);
    const url = proxyUrl(c);
    await press(strings['proxy.copy']);
    expect(written.at(-1)).toBe(url);
    const d = await openHow();
    // The top plate holds the address itself, masked, with its own Copy.
    written = [];
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['proxy.copy'] })); });
    expect(written.at(-1)).toBe(url);
    await press(`Copy ${strings['proxy.curl.page']}`);
    expect(written.at(-1)).toBe(`curl -x "${url}" https://example.com/`);
    for (const k of TABS) {
      await pick(strings['proxy.scripts.pick'], strings[`proxy.tab.${k}`]);
      expect(document.body.textContent).not.toContain(c.id);
    }
    await userEvent.click(screen.getByRole('tab', { name: strings['proxy.browser'] }));
    for (const k of Object.values(BROWSERS)) {
      await pick(strings['proxy.browser.pick'], strings[k]);
      expect(document.body.textContent).not.toContain(c.id);
    }
    await press(`Copy ${strings['proxy.firefox.file']}`);
    expect(written.at(-1)).toBe(`function FindProxyForURL(url, host) {\n  return "HTTPS ${url.replace('https://', '')}";\n}`);
  });

  it('every script tab gives its setup', async () => {
    render(<Proxy c={c} />);
    const d = await openHow();
    for (const k of TABS) {
      await pick(strings['proxy.scripts.pick'], strings[`proxy.tab.${k}`]);
      const panel = within(d).getByRole('tabpanel');
      // One tool at a time: its name as a heading, what the lines do, and the lines.
      expect(within(panel).getByRole('heading', { name: strings[`proxy.${k}.label`] })).toBeInTheDocument();
      expect(panel).toHaveTextContent(strings[`proxy.${k}.help`]);
      expect(within(panel).getAllByRole('figure')).toHaveLength(1);
    }
  });
});

describe('Proxy: leave from another address', () => {
  it('upstream: set, read and clear on the egress program, copied whole, shown masked; refusal, never a fallback, is said', async () => {
    render(<Proxy c={c} />);
    await openHow();
    await openExit();
    const url = proxyUrl(c);
    expect(screen.getByRole('heading', { name: strings['proxy.exit.title'] })).toBeInTheDocument();
    expect(name('proxy.exit.up.body')).toMatch(/refused, never sent from/);
    await press(`Copy ${strings['proxy.exit.up.set']}`);
    expect(written.at(-1)).toBe(`curl --noproxy '*' -X PUT -H 'Content-Type: text/plain' --data-binary 'socks5h://PROXY_HOST:1080' "${url}/api/v1/egress/upstream"`);
    await press(`Copy ${strings['proxy.exit.up.get']}`);
    expect(written.at(-1)).toBe(`curl --noproxy '*' "${url}/api/v1/egress/upstream"`);
    await press(`Copy ${name('proxy.exit.up.off')}`);
    expect(written.at(-1)).toBe(`curl --noproxy '*' -X DELETE "${url}/api/v1/egress/upstream"`);
    // Copy all on the set-up block never carries the line that undoes it.
    const setup = screen.getByRole('figure', { name: strings['proxy.exit.up.label'] });
    await act(async () => { fireEvent.click(within(setup).getByRole('button', { name: /copy all/i })); });
    expect(written.at(-1)).toContain('-X PUT');
    expect(written.at(-1)).not.toContain('DELETE');
    expect(within(screen.getByRole('figure', { name: strings['proxy.exit.off.label'] })).getAllByText(/DELETE/).length).toBeGreaterThan(0);
    // The commands are coloured as shell, and the address stays masked on screen.
    const block = screen.getByRole('figure', { name: strings['proxy.exit.up.label'] });
    expect(block.textContent).toContain('/api/v1/egress/upstream');
    expect(block.textContent).not.toContain(c.id);
  });

  it('own machine: the CLI command shows the id masked and copies it whole', async () => {
    render(<Proxy c={c} />);
    await openHow();
    await openExit();
    await press(`Copy ${strings['proxy.exit.local.run']}`);
    expect(written.at(-1)).toBe(`hoody --computer ${c.id} egress local start`);
    expect(screen.getByRole('figure', { name: strings['proxy.exit.local.label'] }).textContent).not.toContain(c.id);
  });

  // a standalone command names the platform only off hoody.com, the CLI's default.
  it('own machine: on another platform the command names its API', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.example.test', origin: 'https://api.example.test' });
    try {
      render(<Proxy c={c} />);
      await openHow();
      await openExit();
      await press(`Copy ${strings['proxy.exit.local.run']}`);
      expect(written.at(-1)).toBe(cliCommand(`--computer ${c.id} egress local start`, platformHosts('api.example.test')));
      expect(written.at(-1)).toContain('api.example.test');
      expect(screen.getByRole('figure', { name: strings['proxy.exit.local.label'] }).textContent).not.toContain(c.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('VPN: the WireGuard file, not the app (kill switch), SSH key first; every docs link points at its section', async () => {
    render(<Proxy c={c} />);
    await openHow();
    await openExit();
    expect(name('proxy.exit.vpn.body')).toMatch(/WireGuard/);
    expect(name('proxy.exit.vpn.body')).toMatch(/kill switch/);
    expect(name('proxy.exit.vpn.body')).toMatch(/SSH key first/);
    const href = (k: keyof typeof strings) => screen.getByRole('link', { name: strings[k] }).getAttribute('href');
    expect(href('proxy.exit.up.docs')).toBe('https://docs.hoody.com/kit/egress/#upstream-proxies');
    expect(href('proxy.exit.local.docs')).toBe('https://docs.hoody.com/kit/egress/#exit-from-your-own-machine');
    expect(href('proxy.exit.vpn.docs')).toBe('https://docs.hoody.com/foundation/networking/vpn/');
    // Each way is its own block: a heading, its sentences, its docs link.
    for (const k of ['proxy.exit.up.title', 'proxy.exit.local.title', 'proxy.exit.vpn.title'] as const) expect(screen.getByRole('heading', { name: name(k) })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: strings['proxy.how'] })).toHaveTextContent(name('proxy.exit.vpn.body'));
  });

  it('the access-rules link stays on the page beside the key warning', () => {
    render(<Proxy c={c} />);
    expect(screen.getByRole('link', { name: strings['proxy.onlyMe.docs'] }).getAttribute('href')).toBe('https://docs.hoody.com/foundation/proxy/permissions/');
  });
});

describe('Proxy: Node.js and the page (Network redesign)', () => {
  it('the Node.js tab follows the docs (no package, the flag or its variable) and copies the address whole', async () => {
    render(<Proxy c={c} />);
    const url = proxyUrl(c);
    const d = await openHow();
    await pick(strings['proxy.scripts.pick'], strings['proxy.tab.node']);
    const panel = within(d).getByRole('tabpanel');
    expect(panel).toHaveTextContent('node --use-env-proxy app.js');
    expect(panel).toHaveTextContent('NODE_USE_ENV_PROXY=1 node app.js');
    expect(panel.textContent).not.toContain(c.id);
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: /copy all/i })); });
    expect(written.at(-1)).toContain(`export https_proxy="${url}"`);
    expect(written.at(-1)).toContain('node --use-env-proxy app.js');
  });

  it('without an address there is no How to connect; stopped says when the proxy answers again', () => {
    const v = render(<Proxy c={{ ...c, server: undefined, server_name: undefined } as unknown as Computer} />);
    expect(screen.getByText(strings['proxy.noAddress'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['proxy.browser'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['proxy.scripts'] })).toBeNull();
    v.unmount();
    render(<Proxy c={{ ...c, status: 'stopped' } as Computer} />);
    expect(screen.getByText(name('proxy.stopped'))).toBeInTheDocument();
  });

  it('an open How to connect closes when the address goes away, and does not come back on its own', async () => {
    const v = render(<Proxy c={c} />);
    await openHow();
    v.rerender(<Proxy c={{ ...c, server: undefined, server_name: undefined } as unknown as Computer} />);
    expect(screen.queryByRole('dialog', { name: strings['proxy.how'] })).toBeNull();
    expect(document.body.textContent).not.toContain('https_proxy=""');
    v.rerender(<Proxy c={c} />);
    expect(screen.queryByRole('dialog', { name: strings['proxy.how'] })).toBeNull();
  });
});

describe('Proxy: use it in your browser', () => {
  const openBrowser = async () => {
    await userEvent.click(screen.getByRole('button', { name: strings['proxy.browser'] }));
    return screen.findByRole('dialog', { name: strings['proxy.how'] });
  };
  const host = () => proxyUrl(c).replace('https://', '').replace(/:443$/, '');

  it('says at once that every computer is a proxy and what it is for, with Copy and the key warning kept', async () => {
    render(<Proxy c={c} />);
    expect(screen.getByText(new RegExp(name('proxy.lede').slice(0, 40)))).toBeInTheDocument();
    // What it is for is the section's info tip, beside the title.
    await userEvent.click(screen.getByRole('button', { name: `About ${name('proxy.title')}` }));
    expect(await screen.findByText(name('proxy.uses'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['proxy.copy'] })).toBeInTheDocument();
    expect(screen.getByText(name('proxy.secret'))).toBeInTheDocument();
  });

  it('opens on the browser steps; Firefox: download the file, then the exact settings path, with a shared-computer warning', async () => {
    render(<Proxy c={c} />);
    const d = await openBrowser();
    expect(within(d).getByRole('tab', { name: strings['proxy.browser'], selected: true })).toBeInTheDocument();
    const panel = within(d).getByRole('tabpanel');
    // The warning sits with the browser steps, not above the whole panel.
    expect(within(panel).getByText(name('proxy.browser.shared'))).toBeInTheDocument();
    expect(choice(strings['proxy.browser.pick'], strings['proxy.tab.firefox'])).toBeChecked();
    // Five numbered steps, grouped by where they happen; the download is the first step's own control.
    const steps = within(panel).getByRole('group', { name: strings['proxy.set.firefox'] });
    const rows = within(steps).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByRole('button', { name: strings['proxy.ff.download'] })).toBeInTheDocument();
    for (const k of ['proxy.ff.1', 'proxy.ff.2', 'proxy.ff.2.note', 'proxy.ff.3', 'proxy.ff.4', 'proxy.ff.4.note', 'proxy.ff.5', 'proxy.ff.5.note'] as const) expect(steps).toHaveTextContent(strings[k]);
    // Where the file was saved, per system, each with its own Copy.
    await press(strings['proxy.copyField'].replace('{{what}}', strings['proxy.ff.mac']));
    expect(written.at(-1)).toBe('file:///Users/YOU/Downloads/proxy.pac');
    await press(strings['proxy.copyField'].replace('{{what}}', strings['proxy.ff.win']));
    expect(written.at(-1)).toBe('file:///C:/Users/YOU/Downloads/proxy.pac');
    // No step points at a manual proxy field: those speak plaintext to the proxy and are refused.
    expect(panel.textContent).not.toMatch(/Manual proxy configuration/);
  });

  it('the download is the PAC file, made at the press, its object URL revoked after', async () => {
    const made: Blob[] = [];
    const revoked: string[] = [];
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = (b: Blob) => (made.push(b), 'blob:pac');
    URL.revokeObjectURL = (u: string) => void revoked.push(u);
    try {
      render(<Proxy c={c} />);
      const d = await openBrowser();
      expect(made).toHaveLength(0);
      await userEvent.click(within(d).getByRole('button', { name: strings['proxy.ff.download'] }));
      expect(await made[0]!.text()).toBe(`function FindProxyForURL(url, host) {\n  return "HTTPS ${host()}:443";\n}`);
      await new Promise((r) => setTimeout(r, 5));
      expect(revoked).toEqual(['blob:pac']);
    } finally {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });

  it('the values one by one on the top plate: HTTPS, the server (shown masked, copied whole), port 443, no sign-in, what it reaches', async () => {
    render(<Proxy c={c} />);
    const d = await openBrowser();
    const plate = within(d).getByRole('group', { name: strings['proxy.v.label'] });
    expect(plate).toHaveTextContent(name('proxy.v.sentence'));
    // The verdict never claims the computer's own address outright: an exit set elsewhere changes where traffic leaves.
    expect(plate.querySelector('p')?.textContent).toMatch(/unless you set another exit/);
    expect(plate).toHaveTextContent(name('proxy.secret'));
    for (const k of ['proxy.values.type', 'proxy.values.host', 'proxy.values.port', 'proxy.values.signin', 'proxy.values.reaches', 'proxy.values.reach'] as const) expect(plate).toHaveTextContent(strings[k]);
    // What an app that asks for them should choose stays said, under Good to know.
    expect(d).toHaveTextContent(strings['proxy.values.help']);
    await press(strings['proxy.copyField'].replace('{{what}}', `${strings['proxy.values.host']}`));
    expect(written.at(-1)).toBe(host());
    await press(strings['proxy.copyField'].replace('{{what}}', `${strings['proxy.values.port']}`));
    expect(written.at(-1)).toBe('443');
    await press(strings['proxy.copyField'].replace('{{what}}', `${strings['proxy.values.type']}`));
    expect(written.at(-1)).toBe('HTTPS');
    expect(d).toHaveTextContent(strings['proxy.values.login']);
    expect(d.textContent).not.toContain(c.id);
  });

  it('Chrome and Edge: a separate window from Windows+R or Terminal, each line copied whole', async () => {
    render(<Proxy c={c} />);
    const d = await openBrowser();
    await pick(strings['proxy.browser.pick'], strings['proxy.tab.chromeEdge']);
    const url = proxyUrl(c);
    const panel = within(d).getByRole('tabpanel');
    expect(panel).toHaveTextContent(strings['proxy.ce.why']);
    // Windows and Mac each get their own three numbered steps.
    for (const k of ['proxy.ce.win', 'proxy.ce.mac'] as const) expect(within(within(panel).getByRole('group', { name: strings['proxy.ce.steps'].replace('{{where}}', strings[k]) })).getAllByRole('listitem')).toHaveLength(3);
    const copies = within(d).getAllByRole('button', { name: strings['proxy.copyField'].replace('{{what}}', `${strings['proxy.ce.edge']}`) });
    expect(copies).toHaveLength(2);
    await act(async () => { fireEvent.click(copies[0]!); });
    expect(written.at(-1)).toBe(`msedge --proxy-server="${url}" --user-data-dir="%TEMP%\\hoody-proxy-edge"`);
    await act(async () => { fireEvent.click(within(d).getAllByRole('button', { name: strings['proxy.copyField'].replace('{{what}}', `${strings['proxy.ce.chrome']}`) })[1]!); });
    expect(written.at(-1)).toBe(`open -na "Google Chrome" --args --proxy-server="${url}" --user-data-dir="$TMPDIR/hoody-proxy"`);
    expect(d.textContent).not.toContain(c.id);
  });

  it('Safari and phones get no steps: they are listed but cannot be chosen, and one Good to know row says why', async () => {
    render(<Proxy c={c} />);
    const d = await openBrowser();
    for (const k of ['proxy.tab.safari', 'proxy.tab.phone'] as const) {
      expect(choice(strings['proxy.browser.pick'], strings[k])).toBeDisabled();
      await userEvent.click(choice(strings['proxy.browser.pick'], strings[k])).catch(() => undefined);
      expect(choice(strings['proxy.browser.pick'], strings['proxy.tab.firefox'])).toBeChecked();
    }
    const good = within(d).getByRole('group', { name: strings['proxy.good.title'] });
    expect(good).toHaveTextContent(strings['proxy.good.safari']);
    expect(good).toHaveTextContent(strings['proxy.safari.help']);
    expect(good).toHaveTextContent(strings['proxy.phone.help']);
    // The why stays visible whichever tab is open.
    await userEvent.click(within(d).getByRole('tab', { name: strings['proxy.scripts'] }));
    expect(within(d).getByRole('group', { name: strings['proxy.good.title'] })).toHaveTextContent(strings['proxy.safari.help']);
  });

  it('the foot says how to check a setup and opens the address checker', async () => {
    render(<Proxy c={c} />);
    const d = await openBrowser();
    expect(d).toHaveTextContent(name('proxy.check'));
    expect(within(d).getByRole('link', { name: new RegExp(strings['proxy.check.open'].replace(/\./g, '\\.')) }).getAttribute('href')).toBe('https://ip.hoody.com');
    // The foot's Close is there beside the drawer's own close (x), which the kit also names Close.
    expect(within(d).getAllByRole('button', { name: strings['proxy.close'] }).length).toBeGreaterThanOrEqual(2);
  });

});

