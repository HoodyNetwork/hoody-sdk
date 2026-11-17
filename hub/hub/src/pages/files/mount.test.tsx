// Vitest: "Mount on your device". Hoody Files speaks WebDAV, so a computer's files address mounts as a network drive on
// the person's own device. The dialog shows that address (built by the same helper Connect uses, never by hand) in the
// kit AddressField, copies it, gives the numbered steps for the system picked (a kit StepList, one action a row; what a
// system may need besides is in a Disclosure), links to the "Use from your PC" tab for the command line and SDK, and says
// the address is the key (managed in Keys). No password field: there is no access model of its own.
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import type * as Kit from '@kit';
import type * as Core from '@core';
import { MountButton, links } from './links';
import { systemOfAgent as systemOf } from '@kit';
import page from './page';
import strings from './Mount.strings.en.json';
import files from './strings.en.json';
import pcs from './pc/pc.strings.en.json';

const S = vi.hoisted(() => ({ went: [] as string[], keys: true }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    // A sentinel only the core helper can produce: the panel must show and copy exactly what portAddress gives for the
    // files program of this computer.
    portAddress: (...a: Parameters<typeof real.portAddress>) => {
      const [project, container, port, protocol] = a;
      if (protocol !== 'files') return real.portAddress(...a);
      return `https://${project?.id ?? ''}-${container?.id ?? ''}-files-${port}.${container?.server_name ?? ''}.example.test`;
    },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    usePageLink: (id: string) => (id === 'keys' ? (S.keys ? { kind: 'hub', href: '/keys' } : null) : real.usePageLink(id)),
    useGo: () => {
      const go = real.useGo();
      return (to: string, opts?: Parameters<typeof go>[1]) => { if (to.startsWith('/keys')) S.went.push(to); else go(to, opts); };
    },
  };
});

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
/** The address as the screen shows it: whole, scheme included, every 24-hex id masked (core maskAddress). */
const masked = (u: string) => u.replace(/[0-9a-f]{24}/gi, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
const written: string[] = [];
function clip() {
  written.length = 0;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
}
const world = (name: string) => fixtureWorld.computers.find((c) => c.name === name)!;
/** What the core helper gives for this world computer's files program (the sentinel above, every argument in it). */
const addressOf = (name: string) => { const c = world(name); return `https://${c.project_id}-${c.id}-files-1.${c.server_name}.example.test`; };
/** The Mount entry of the Use from your PC tab (the one entry in Files), for the tab's computer. */
const pcMount = async () => {
  const tab = await screen.findByRole('tabpanel', { name: pcs['tab.pc'] });
  return within(tab).findByRole('button', { name: strings['mount.short'] }, { timeout: 8000 });
};
async function openPanel(name = 'atlas', handle = 'atlas.00a1', realm?: string) {
  await renderPage(page, { path: links.pc(handle), ...(realm ? { realm } : {}) });
  await userEvent.click(await pcMount());
  return screen.findByRole('dialog', { name: fill(strings['mount.title'], { name }) });
}

/** The kit AddressField's Copy ("Copy {{what}}"). */
const copyAddress = fill('Copy {{what}}', { what: strings['mount.address'] });
/** Pick a system in the dialog's picker. */
const pick = async (d: HTMLElement, os: 'mac' | 'windows' | 'linux' | 'phone') => userEvent.click(within(d).getByRole('radio', { name: strings[`mount.os.${os}`] }));
const picker = (d: HTMLElement) => within(d).getByRole('radiogroup', { name: strings['mount.system'] });
type Key = keyof typeof strings;
/** Each system's numbered rows, in order. */
const ROWS = {
  mac: ['mount.mac.1', 'mount.mac.2', 'mount.mac.3', 'mount.mac.4'],
  windows: ['mount.windows.1', 'mount.windows.2', 'mount.windows.3', 'mount.windows.4'],
  linux: ['mount.linux.gnome.1', 'mount.linux.gnome.2', 'mount.linux.kde.1', 'mount.linux.kde.2'],
  phone: ['mount.phone.1', 'mount.phone.2', 'mount.phone.3'],
} as const satisfies Record<string, readonly Key[]>;
/** Each system's step lists: what the list is named for, and its rows (Linux has one list a file manager). */
const LISTS: Record<keyof typeof ROWS, readonly (readonly [Key, readonly Key[]])[]> = {
  mac: [['mount.os.mac', ROWS.mac]],
  windows: [['mount.os.windows', ROWS.windows]],
  linux: [['mount.linux.gnome', ROWS.linux.slice(0, 2)], ['mount.linux.kde', ROWS.linux.slice(2)]],
  phone: [['mount.os.phone', ROWS.phone]],
};

describe('Files: Mount on your device', () => {
  it("shows (masked) and copies exactly the core files address of the pane's computer, and its davs:// form for Linux", async () => {
    S.keys = true;
    const d = await openPanel();
    clip();
    const want = addressOf('atlas');
    // The kit AddressField: the address is secret by shape, so nothing of it is in the dialog; Copy takes it whole.
    expect(d.textContent).not.toMatch(/[0-9a-f]{24}/i);
    await userEvent.click(within(d).getByRole('button', { name: copyAddress }));
    expect(written.at(-1)).toBe(want);
    await pick(d, 'linux');
    await userEvent.click(within(d).getByRole('button', { name: strings['mount.copyDavs'] }));
    expect(written.at(-1)).toBe(`davs://${want.slice('https://'.length)}`);
  });

  it("the tab's panel carries the tab's computer, and closing gives focus back to its button", async () => {
    S.keys = true;
    const d = await openPanel('granite', 'granite.0107', 'all');
    clip();
    await userEvent.click(within(d).getByRole('button', { name: copyAddress }));
    expect(written.at(-1)).toBe(addressOf('granite'));
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === strings['mount.close'] && !el.hasAttribute('data-dialog-close') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Focus comes back after the close, not in it: React Aria's focus scope restores it on an animation frame and the kit's
    // own return checks on timers (kit/overlays/shared.ts), so wait for it: a synchronous check lost that race under load.
    const mount = await pcMount();
    await waitFor(() => expect(mount).toHaveFocus());
  });

  // Browse has no Mount of its own; the Use from your PC tab is the one entry (it has the dialog and
  // everything else: the command line, sharing and the SDK).
  it('Browse offers no Mount: neither pane, for a running computer either', async () => {
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2F` });
    for (const name of [files['pane.a'], files['pane.b']]) {
      const r = await screen.findByRole('region', { name });
      await within(r).findByRole('table', {}, { timeout: 8000 });
      expect(within(r).queryByRole('button', { name: strings['mount.short'] })).toBeNull();
      expect(within(r).queryByRole('button', { name: strings['mount.action'] })).toBeNull();
    }
  });

  it('a stopped computer offers no Mount in Browse (its address answers nothing)', async () => {
    await renderPage(page, { path: '/files?a=cedar.00c3' });
    const r = await screen.findByRole('region', { name: files['pane.a'] });
    await within(r).findByText(fill(files['st.stopped'], { name: 'cedar' }), {}, { timeout: 8000 });
    expect(within(r).queryByRole('button', { name: strings['mount.short'] })).toBeNull();
  });

  it('a system picker gives one line and the numbered steps for the system picked, and only that system\'s', async () => {
    S.keys = true;
    const d = await openPanel();
    const systems = ['mac', 'windows', 'linux', 'phone'] as const;
    for (const os of systems) {
      await pick(d, os);
      expect(within(d).getByRole('radio', { name: strings[`mount.os.${os}`] })).toBeChecked();
      expect(picker(d)).toHaveAccessibleDescription(strings[`mount.step.${os}`]);
      for (const other of systems.filter((x) => x !== os)) {
        expect(within(d).queryByText(strings[`mount.step.${other}`])).toBeNull();
        for (const row of ROWS[other]) expect(within(d).queryByText(strings[row])).toBeNull();
      }
      // The steps are numbered rows in the order written, each list named for its system or file manager.
      for (const [name, rows] of LISTS[os]) {
        const list = within(d).getByRole('group', { name: fill(strings['mount.steps'], { system: strings[name] }) });
        const items = within(list).getAllByRole('listitem');
        expect(items.map((li) => li.textContent?.slice(0, 2))).toEqual(rows.map((_, n) => String(n + 1).padStart(2, '0')));
        rows.forEach((row, n) => expect(items[n]).toHaveTextContent(strings[row]));
      }
      // The davs:// and webdavs:// copies and davfs2 are Linux's only; the WebClient lines are Windows' only.
      expect(within(d).queryByRole('button', { name: strings['mount.copyDavs'] }) !== null).toBe(os === 'linux');
      expect(within(d).queryByRole('button', { name: strings['mount.copyKde'] }) !== null).toBe(os === 'linux');
      expect(within(d).queryByRole('button', { name: new RegExp(`^${strings['mount.windows.fix.title']}`) }) !== null).toBe(os === 'windows');
    }
    // Facts: Finder mounts a DAV class 1 server read-only and needs nothing installed; File Explorer maps the address
    // from This PC (More on Windows 11, the Computer tab on Windows 10); Ctrl+L opens the address bar on every GNOME
    // Files; a click right of the path makes Dolphin's location bar editable; iOS Files' Connect to Server is SMB only. The size limit and gvfs-backends are in the page's
    // questions (faq.test.ts).
    expect(strings['mount.step.mac']).toMatch(/read-only/);
    expect(strings['mount.mac.1']).toMatch(/Go > Connect to Server/);
    expect(strings['mount.windows.1']).toMatch(/This PC/);
    expect(strings['mount.windows.2']).toMatch(/Map network drive/);
    expect(strings['mount.windows.2.note']).toMatch(/Windows 10.*Computer tab/);
    expect(strings['mount.linux.gnome.1']).toMatch(/Ctrl\+L/);
    expect(strings['mount.linux.kde.1']).toMatch(/right of the path/);
    expect(strings['mount.step.phone']).toMatch(/iPhone, iPad and Android.*WebDAV/);
    expect(strings['mount.step.phone']).not.toMatch(/Connect to Server/);
    // A password rule may protect the files: the phone row leaves room for it, like the davfs2 line.
    expect(strings['mount.phone.3']).toMatch(/empty, unless a rule sets them/);
    // The line read with the picker stays short, and a step is one line (kit StepList: 70 characters at most).
    for (const os of systems) {
      expect(strings[`mount.step.${os}`].length).toBeLessThanOrEqual(150);
      for (const row of ROWS[os]) expect(strings[row].length).toBeLessThanOrEqual(70);
      expect(ROWS[os].length).toBeGreaterThanOrEqual(3);
      expect(ROWS[os].length).toBeLessThanOrEqual(5);
    }
  });

  it('Windows is asked for nothing first: the steps name no service, and what to do when it cannot connect is one press away', async () => {
    S.keys = true;
    const d = await openPanel();
    clip();
    await pick(d, 'windows');
    // Nothing on the Windows side reads as a requirement, and no step names the service.
    for (const [k, v] of Object.entries(strings)) if (k.startsWith('mount.')) expect(v).not.toMatch(/\bNeeds\b|\bneeds the\b/);
    for (const k of ['mount.step.windows', ...ROWS.windows, 'mount.windows.2.note'] as const) expect(strings[k]).not.toMatch(/WebClient|service/i);
    // Closed at first; it says the service is part of Windows, and opened it gives the two lines that start it.
    const fix = within(d).getByRole('button', { name: new RegExp(`^${strings['mount.windows.fix.title']}`) });
    expect(fix).toHaveAttribute('aria-expanded', 'false');
    expect(strings['mount.windows.fix']).toMatch(/part of Windows.*does not connect.*start it/);
    // Only what the maker of Windows documents: no promise that the service starts on its own.
    expect(strings['mount.windows.fix']).not.toMatch(/by itself|automatically/);
    await userEvent.click(fix);
    const code = within(d).getByRole('figure', { name: strings['mount.windows.fix.label'] });
    expect(code.textContent).toContain('sc.exe config webclient start= demand');
    expect(code.textContent).toContain('net start webclient');
    await userEvent.click(within(code).getByRole('button', { name: 'Copy all' }));
    expect(written.at(-1)).toBe('sc.exe config webclient start= demand\nnet start webclient');
  });

  it('Linux: each file manager gets the address in the form it takes, by a Copy in its row', async () => {
    S.keys = true;
    const d = await openPanel();
    clip();
    const want = addressOf('atlas');
    await pick(d, 'linux');
    const row = (system: 'mount.linux.gnome' | 'mount.linux.kde', text: string) =>
      within(within(d).getByRole('group', { name: fill(strings['mount.steps'], { system: strings[system] }) })).getAllByRole('listitem').find((li) => li.textContent?.includes(text))!;
    await userEvent.click(within(row('mount.linux.gnome', strings['mount.linux.gnome.2'])).getByRole('button', { name: strings['mount.copyDavs'] }));
    expect(written.at(-1)).toBe(`davs://${want.slice('https://'.length)}`);
    await userEvent.click(within(row('mount.linux.kde', strings['mount.linux.kde.2'])).getByRole('button', { name: strings['mount.copyKde'] }));
    expect(written.at(-1)).toBe(`webdavs://${want.slice('https://'.length)}`);
    // Neither form is shown: the address is secret by shape.
    expect(d.textContent).not.toMatch(/[0-9a-f]{24}/i);
  });

  it('the first pick is the browser\'s own system (kit systemOfAgent, which SystemSteps starts on), Mac when it cannot tell', () => {
    const ua = (userAgent: string, maxTouchPoints = 0) => systemOf({ userAgent, maxTouchPoints });
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15')).toBe('mac');
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15', 5)).toBe('phone');
    expect(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe('windows');
    expect(ua('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0')).toBe('linux');
    expect(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile')).toBe('phone');
    expect(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('phone');
    expect(ua('')).toBe('mac');
    expect(systemOf(undefined)).toBe('mac');
  });

  it('Linux without a desktop: davfs2 in a Disclosure, masked on screen; each Copy takes the real command', async () => {
    S.keys = true;
    const d = await openPanel();
    clip();
    const want = addressOf('atlas');
    await pick(d, 'linux');
    // Closed at first: the step is the one line; davfs2 is one press away.
    const more = within(d).getByRole('button', { name: new RegExp(`^${strings['mount.davfs.title']}`) });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    const dav = within(d).getByRole('figure', { name: strings['mount.davfs.label'] });
    // Owned by the person running it and private.
    const mountLine = `sudo mount -t davfs -o uid=$(id -u),gid=$(id -g),dir_mode=0700,file_mode=0600 ${want} /mnt/hoody`;
    expect(dav.textContent).toContain('sudo mkdir -p /mnt/hoody');
    expect(dav.textContent).toContain(mountLine.replace(want, masked(want)));
    const copy = async (name: string) => { await userEvent.click(within(dav).getByRole('button', { name })); return written.at(-1); };
    expect(await copy(fill('Copy {{c}}', { c: strings['mount.davfs.mount'] }))).toBe(mountLine);
    expect(await copy('Copy all')).toBe(`sudo mkdir -p /mnt/hoody\n${mountLine}`);
    expect(strings['mount.davfs']).toMatch(/sudo apt install davfs2, or sudo dnf install davfs2.*unless a password rule/s);
    expect(d.textContent).not.toMatch(/[0-9a-f]{24}/i);
  });

  it('the command line and the SDK are on Use from your PC: the dialog opened there holds no CLI or SDK line, and no link to the tab it is on', async () => {
    S.keys = true;
    const d = await openPanel();
    expect(d.textContent).not.toMatch(/hoody mount|hoody-sdk|rclone/);
    expect(within(d).queryByRole('link', { name: strings['mount.pcLink'] })).toBeNull();
    expect(links.pc('atlas.00a1')).toBe('/files?computer=atlas.00a1&tab=pc');
  });

  it('says the address is the key and links to Keys; no password field', async () => {
    S.keys = true;
    S.went = [];
    const d = await openPanel();
    expect(within(d).getByText(strings['mount.key'])).toBeInTheDocument();
    expect(within(d).queryByRole('textbox')).toBeNull();
    expect(d.querySelector('input[type="password"]')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['mount.keys'] }));
    expect(S.went.some((x) => x.startsWith('/keys'))).toBe(true);
  });

  it('keeps the key line but hides the Keys link where this load does not serve Keys', async () => {
    S.keys = false;
    const d = await openPanel();
    expect(within(d).getByText(strings['mount.key'])).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['mount.keys'] })).toBeNull();
    S.keys = true;
  });

  // Rendered alone (no router): with Keys not served and no PC tab link the panel needs no navigation.
  it('the Connect entry (from links.ts) is off while the computer is not running, opens the same panel when on, and shows nothing without an address', async () => {
    S.keys = false;
    const url = 'https://sentinel-beef-files-1.example.test';
    const off = render(<MountButton name="kiln" url={url} isDisabled compact />);
    expect(screen.getByRole('button', { name: strings['mount.action'] })).toBeDisabled();
    off.unmount();
    render(<MountButton name="kiln" url={url} compact />);
    await userEvent.click(screen.getByRole('button', { name: strings['mount.action'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['mount.title'], { name: 'kiln' }) });
    expect(within(d).getByText('https://sentinel-beef-files-1.example.test')).toBeInTheDocument();
    expect(within(d).queryByRole('link', { name: strings['mount.pcLink'] })).toBeNull();
    cleanup();
    render(<MountButton name="kiln" url="" compact />);
    expect(screen.queryByRole('button', { name: strings['mount.action'] })).toBeNull();
    S.keys = true;
  });

  it('the open panel follows a computer change: title, shown address and both copies are the new computer\'s', async () => {
    S.keys = true;
    const r = render(<MountButton name="kiln" url="https://sentinel-beef-files-1.example.test" compact />);
    await userEvent.click(screen.getByRole('button', { name: strings['mount.action'] }));
    await screen.findByRole('dialog', { name: fill(strings['mount.title'], { name: 'kiln' }) });
    r.rerender(<MountButton name="forge" url="https://sentinel-cafe-files-1.example.test" compact />);
    const d = await screen.findByRole('dialog', { name: fill(strings['mount.title'], { name: 'forge' }) });
    expect(within(d).getByText('https://sentinel-cafe-files-1.example.test')).toBeInTheDocument();
    expect(within(d).queryByText('https://sentinel-beef-files-1.example.test')).toBeNull();
    clip();
    await userEvent.click(within(d).getByRole('button', { name: copyAddress }));
    expect(written.at(-1)).toBe('https://sentinel-cafe-files-1.example.test');
    await pick(d, 'linux');
    await userEvent.click(within(d).getByRole('button', { name: strings['mount.copyDavs'] }));
    expect(written.at(-1)).toBe('davs://sentinel-cafe-files-1.example.test');
  });
});
