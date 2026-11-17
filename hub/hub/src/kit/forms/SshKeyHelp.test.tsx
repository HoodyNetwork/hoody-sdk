// SshKeyHelp: how to get an SSH key, per system. A key made in the browser is downloaded once and
// then wiped (never stored, shown or sent); its public line shows only after that download. The terminal steps name
// the key file for the computer, since a computer refuses a key another computer already uses.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interpolate } from '../strings';
import strings from './SshKeyHelp.strings.en.json';
import { guessKeyOs, sshKeyCommands, SshKeyHelp } from './SshKeyHelp';
import { Form } from './more';
import type * as CoreMod from '@core';
import * as real from './sshKey';
import type * as SshKeyMod from './sshKey';
import { openSshPrivate, sshKeyFileName } from './sshKey';

// A shell line is coloured in parts (CodeBlock lang="shell"): find it by the whole line's text, on the innermost element.
const shLine = (want: string | RegExp) => (_: string, el: Element | null) => {
  const is = (t: string | null) => (typeof want === 'string' ? t === want : want.test(t ?? ''));
  return !!el && is(el.textContent) && ![...el.children].some((c) => is(c.textContent));
};

// Every private file the component got, by reference, so a test can prove it was wiped (all zero).
const handed: Uint8Array[] = [];
let gate: Promise<void> | null = null;
let unsupported = false;
let failSave = false;
// Tags handed out in order, then 'ab12'.
const tags: string[] = [];
vi.mock('./sshKey', async (orig) => {
  const mod = await orig<typeof SshKeyMod>();
  return {
    ...mod,
    // Fixed so the names are known; the real tag is tested on its own below.
    sshKeyTag: () => tags.shift() ?? 'ab12',
    makeSshKey: async (comment?: string) => {
      if (gate) await gate;
      if (unsupported) return null;
      const pair = await mod.makeSshKey(comment);
      if (pair) handed.push(pair.privateFile);
      return pair;
    },
  };
});

// What each download got: the file name and its text, read at the moment of the download.
const saved: Array<{ name: string; text: string }> = [];
vi.mock('@core', async (orig) => {
  const mod = await orig<typeof CoreMod>();
  return {
    ...mod,
    save: (name: unknown, parts: unknown) => {
      if (failSave) throw new Error('blocked');
      const bytes = (parts as Uint8Array[])[0] ?? new Uint8Array(0);
      saved.push({ name: String(name), text: new TextDecoder().decode(bytes) });
      return { ok: true, name: String(name), bytes: bytes.length };
    },
  };
});

const open = () => userEvent.click(screen.getByRole('button', { name: strings['sshhelp.title'] }));
const zero = (b: Uint8Array) => b.every((x) => x === 0);

beforeEach(() => {
  handed.length = 0;
  saved.length = 0;
  gate = null;
  unsupported = false;
  failSave = false;
  tags.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('kit SshKeyHelp: the terminal steps', () => {
  it('each system gets its own commands, all on a key file named for the computer', async () => {
    render(<SshKeyHelp computer="Atlas One" os="linux" />);
    await open();
    expect(screen.getByText(shLine('mkdir -p ~/.ssh'))).toBeInTheDocument();
    expect(screen.getByText(shLine('ssh-keygen -t ed25519 -f ~/.ssh/hoody-atlas-one-ab12 -C hoody-atlas-one-ab12'))).toBeInTheDocument();
    expect(screen.getByText(shLine('cat ~/.ssh/hoody-atlas-one-ab12.pub'))).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['sshhelp.one'], { file: 'hoody-atlas-one-ab12' }))).toBeInTheDocument();
    const os = screen.getByRole('radiogroup', { name: strings['sshhelp.os'] });
    await userEvent.click(within(os).getByRole('radio', { name: strings['sshhelp.os.mac'] }));
    expect(screen.getByText(shLine('pbcopy < ~/.ssh/hoody-atlas-one-ab12.pub'))).toBeInTheDocument();
    await userEvent.click(within(os).getByRole('radio', { name: strings['sshhelp.os.windows'] }));
    expect(screen.getByText(shLine('New-Item -ItemType Directory -Force "$env:USERPROFILE\\.ssh" | Out-Null'))).toBeInTheDocument();
    expect(screen.getByText(shLine('ssh-keygen -t ed25519 -f "$env:USERPROFILE\\.ssh\\hoody-atlas-one-ab12" -C hoody-atlas-one-ab12'))).toBeInTheDocument();
    expect(screen.getByText(shLine('Get-Content "$env:USERPROFILE\\.ssh\\hoody-atlas-one-ab12.pub" | Set-Clipboard'))).toBeInTheDocument();
    expect(screen.getByText(strings['sshhelp.intro.windows'])).toBeInTheDocument();
  });

  it('each step\'s Copy button names the command, never "Copy Copy …"', async () => {
    render(<SshKeyHelp computer="Atlas One" host="atlas.n12.fixture.invalid" os="mac" />);
    await open();
    expect(screen.getByRole('button', { name: 'Copy the command: Copy the public key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy the command: Make the key' })).toBeInTheDocument();
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(names.filter((n) => /^copy\s+copy\b/i.test(n))).toEqual([]);
  });

  it('Windows paths are quoted (a profile folder may hold a space); the ssh config keeps ~/', () => {
    const c = sshKeyCommands('windows', 'hoody-k', 'h.example');
    expect(c.move).toBe('Move-Item -LiteralPath "$env:USERPROFILE\\Downloads\\hoody-k" -Destination "$env:USERPROFILE\\.ssh\\hoody-k"');
    expect(c.connect).toBe('ssh -i "$env:USERPROFILE\\.ssh\\hoody-k" -o IdentitiesOnly=yes h.example');
    expect(c.config).toBe('Host h.example\n  IdentityFile ~/.ssh/hoody-k\n  IdentitiesOnly yes');
    const l = sshKeyCommands('linux', 'hoody-k', 'h.example');
    expect(l.move).toBe('mv -n ~/Downloads/"hoody-k" ~/.ssh/hoody-k && chmod 600 ~/.ssh/hoody-k');
    expect(l.connect).toBe('ssh -i ~/.ssh/hoody-k -o IdentitiesOnly=yes h.example');
  });

  it('with an address: connect with that key file, and the config lines for plain ssh; without: the later note', async () => {
    const { unmount } = render(<SshKeyHelp computer="atlas" host="atlas.n12.fixture.invalid" os="mac" />);
    await open();
    expect(screen.getByText(shLine('ssh -i ~/.ssh/hoody-atlas-ab12 -o IdentitiesOnly=yes atlas.n12.fixture.invalid'))).toBeInTheDocument();
    expect(screen.getByText(shLine(/Host atlas\.n12\.fixture\.invalid/))).toBeInTheDocument();
    expect(screen.getByText(shLine(/IdentityFile ~\/\.ssh\/hoody-atlas-ab12\s*$/))).toBeInTheDocument();
    // Only this key is offered: the proxy picks the computer from the first key it accepts.
    expect(screen.getByText(shLine(/^\s*IdentitiesOnly yes\s*$/))).toBeInTheDocument();
    expect(screen.queryByText(strings['sshhelp.connectLater'])).toBeNull();
    unmount();
    render(<SshKeyHelp os="mac" />);
    await open();
    expect(screen.queryByText(shLine(/^ssh -i /))).toBeNull();
    expect(screen.getByText(strings['sshhelp.connectLater'])).toBeInTheDocument();
    expect(screen.getByText(shLine('ssh-keygen -t ed25519 -f ~/.ssh/hoody-key-ab12 -C hoody-key-ab12'))).toBeInTheDocument();
  });

  it('says to keep the private half, and how to answer the passphrase and file-exists questions', async () => {
    render(<SshKeyHelp computer="atlas" os="linux" />);
    await open();
    expect(screen.getByText(interpolate(strings['sshhelp.private'], { file: 'hoody-atlas-ab12' }))).toBeInTheDocument();
    expect(screen.getByText(strings['sshhelp.passphrase'])).toBeInTheDocument();
  });

  it('guesses the system from the browser, Linux when unknown; file names keep letters, digits and dashes', () => {
    expect(guessKeyOs('Win32')).toBe('windows');
    expect(guessKeyOs('MacIntel')).toBe('mac');
    expect(guessKeyOs('Linux x86_64')).toBe('linux');
    expect(guessKeyOs('')).toBe('linux');
    expect(sshKeyFileName('Atlas One!')).toBe('hoody-atlas-one');
    expect(sshKeyFileName('Atlas One!', 'x9z0')).toBe('hoody-atlas-one-x9z0');
    expect(sshKeyFileName('--')).toBe('hoody-key');
    expect(sshKeyFileName(undefined)).toBe('hoody-key');
    expect(sshKeyFileName('a; rm -rf ~')).toBe('hoody-a-rm-rf');
    expect(sshKeyFileName('x'.repeat(60))).toBe(`hoody-${'x'.repeat(40)}`);
    expect(sshKeyCommands('linux', 'hoody-a').move).toBe('mv -n ~/Downloads/"hoody-a" ~/.ssh/hoody-a && chmod 600 ~/.ssh/hoody-a');
    // SSH reads its config itself: ~/ on every system, never PowerShell's $env:.
    expect(sshKeyCommands('windows', 'hoody-a', 'h.example').config).toBe('Host h.example\n  IdentityFile ~/.ssh/hoody-a\n  IdentitiesOnly yes');
  });
});

describe('kit SshKeyHelp: a key made in the browser', () => {
  it('downloads the private key once, wipes it, then shows the public line and its steps', async () => {
    render(<SshKeyHelp computer="atlas" host="atlas.n12.fixture.invalid" os="linux" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    const dl = await screen.findByRole('button', { name: strings['sshhelp.made.download'] });
    // Nothing public before the download: a key whose private half was never saved cannot be set.
    expect(screen.queryByText(/^ssh-ed25519 /)).toBeNull();
    expect(handed).toHaveLength(1);
    await userEvent.click(dl);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe('hoody-atlas-ab12');
    expect(saved[0]?.text).toMatch(/^-----BEGIN OPENSSH PRIVATE(?:) KEY-----\n[A-Za-z0-9+/=\n]+\n-----END OPENSSH PRIVATE KEY-----\n$/);
    expect(zero(handed[0] as Uint8Array)).toBe(true);
    expect(screen.queryByRole('button', { name: strings['sshhelp.made.download'] })).toBeNull();
    expect(screen.getByText(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-ab12$/)).toBeInTheDocument();
    expect(screen.getByText(shLine('mv -n ~/Downloads/"hoody-atlas-ab12" ~/.ssh/hoody-atlas-ab12 && chmod 600 ~/.ssh/hoody-atlas-ab12'))).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['sshhelp.saved.body'], { file: 'hoody-atlas-ab12' }))).toBeInTheDocument();
    // The private key's text is nowhere on the page.
    expect(document.body.textContent ?? '').not.toContain('PRIVATE KEY');
  });

  it('"Use this key" fills the form with the public line only', async () => {
    const got: string[] = [];
    render(<SshKeyHelp computer="atlas" os="linux" onKey={(k) => { got.push(k); }} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    expect(screen.queryByRole('button', { name: strings['sshhelp.saved.use'] })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: strings['sshhelp.made.download'] }));
    // The live region is there, empty, before the press, so the confirmation is announced.
    const before = screen.getAllByRole('status');
    expect(screen.queryByText(strings['sshhelp.saved.used'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.saved.use'] }));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-ab12$/);
    const live = screen.getByText(strings['sshhelp.saved.used']).closest('[role="status"]');
    expect(live).not.toBeNull();
    expect(before).toContain(live);
  });

  // Once the key is taken, "How do I get a key?" folds away; opened again it still holds everything. Only a
  // taken key folds it: a use the host refused, or whose outcome is not known, keeps it open (C9).
  describe('after "Use this key"', () => {
    const toSaved = async () => {
      await open();
      await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
      await userEvent.click(await screen.findByRole('button', { name: strings['sshhelp.made.download'] }));
    };
    const title = () => screen.getByRole('button', { name: strings['sshhelp.title'] });
    const use = () => screen.getByRole('button', { name: strings['sshhelp.saved.use'] });

    it('a taken key folds the help away, focus goes to its title, and opening it again shows the same key and steps', async () => {
      render(<SshKeyHelp computer="atlas" os="linux" onKey={() => true} />);
      await toSaved();
      const line = screen.getByText(/^ssh-ed25519 /).textContent;
      await userEvent.click(use());
      await vi.waitFor(() => expect(title()).toHaveAttribute('aria-expanded', 'false'));
      expect(document.activeElement).toBe(title());
      await userEvent.click(title());
      expect(title()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/^ssh-ed25519 /).textContent).toBe(line);
      expect(screen.getByText(shLine('mv -n ~/Downloads/"hoody-atlas-ab12" ~/.ssh/hoody-atlas-ab12 && chmod 600 ~/.ssh/hoody-atlas-ab12'))).toBeInTheDocument();
      expect(screen.getByText(strings['sshhelp.saved.used'])).toBeInTheDocument();
    });

    it('a key the host takes later (a send that answers done) folds it then', async () => {
      let done!: (v: boolean) => void;
      render(<SshKeyHelp computer="atlas" os="linux" useSets onKey={() => new Promise<boolean>((r) => { done = r; })} />);
      await toSaved();
      await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.saved.useSet'] }));
      expect(title()).toHaveAttribute('aria-expanded', 'true');
      await act(async () => { done(true); });
      await vi.waitFor(() => expect(title()).toHaveAttribute('aria-expanded', 'false'));
    });

    it('a late answer folds it but leaves focus where the person moved to', async () => {
      let done!: (v: boolean) => void;
      render(
        <>
          <SshKeyHelp computer="atlas" os="linux" useSets onKey={() => new Promise<boolean>((r) => { done = r; })} />
          <input aria-label="elsewhere" />
        </>,
      );
      await toSaved();
      await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.saved.useSet'] }));
      const elsewhere = screen.getByRole('textbox', { name: 'elsewhere' });
      await userEvent.click(elsewhere);
      await act(async () => { done(true); });
      await vi.waitFor(() => expect(title()).toHaveAttribute('aria-expanded', 'false'));
      expect(document.activeElement).toBe(elsewhere);
    });

    it('a refused use, an unknown outcome, or a form that says nothing keeps it open', async () => {
      for (const onKey of [() => false, () => Promise.resolve(false), () => Promise.reject(new Error('lost')), () => undefined]) {
        const { unmount } = render(<SshKeyHelp computer="atlas" os="linux" onKey={onKey} />);
        await toSaved();
        await userEvent.click(use());
        await act(async () => { await Promise.resolve(); });
        expect(title()).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/^ssh-ed25519 /)).toBeInTheDocument();
        unmount();
      }
    });

    it('an answer that lands after the key was made again folds nothing', async () => {
      let done!: (v: boolean) => void;
      render(<SshKeyHelp computer="atlas" os="linux" onKey={() => new Promise<boolean>((r) => { done = r; })} />);
      await toSaved();
      await userEvent.click(use());
      await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.saved.again'] }));
      await act(async () => { done(true); });
      expect(title()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('once downloaded, the ssh config names the browser key, not the terminal steps\' file', async () => {
    tags.push('term', 'brws');
    render(<SshKeyHelp computer="atlas" host="atlas.n12.fixture.invalid" os="linux" />);
    await open();
    expect(screen.getByText(shLine(/IdentityFile ~\/\.ssh\/hoody-atlas-term\s*$/))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['sshhelp.made.download'] }));
    expect(saved[0]?.name).toBe('hoody-atlas-brws');
    expect(screen.getByText(shLine(/IdentityFile ~\/\.ssh\/hoody-atlas-brws\s*$/))).toBeInTheDocument();
    expect(screen.queryByText(shLine(/IdentityFile ~\/\.ssh\/hoody-atlas-term\s*$/))).toBeNull();
  });

  it('Discard and unmount wipe a key not yet downloaded; nothing is downloaded', async () => {
    const { unmount } = render(<SshKeyHelp computer="atlas" os="linux" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    await screen.findByRole('button', { name: strings['sshhelp.made.download'] });
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.made.discard'] }));
    expect(zero(handed[0] as Uint8Array)).toBe(true);
    expect(screen.getByRole('button', { name: strings['sshhelp.make.go'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    await screen.findByRole('button', { name: strings['sshhelp.made.download'] });
    expect(zero(handed[1] as Uint8Array)).toBe(false);
    unmount();
    expect(zero(handed[1] as Uint8Array)).toBe(true);
    expect(saved).toHaveLength(0);
  });

  it('a key that arrives after the place ended is wiped as it arrives, never offered', async () => {
    let release = () => {};
    gate = new Promise<void>((r) => (release = r));
    const { unmount } = render(<SshKeyHelp computer="atlas" os="linux" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    unmount();
    await act(async () => {
      release();
      await gate;
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(handed).toHaveLength(1);
    expect(zero(handed[0] as Uint8Array)).toBe(true);
    expect(saved).toHaveLength(0);
  });

  it('a browser without Ed25519 gets the terminal steps instead', async () => {
    unsupported = true;
    render(<SshKeyHelp computer="atlas" os="linux" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    expect(await screen.findByText(strings['sshhelp.make.unsupported'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['sshhelp.made.download'] })).toBeNull();
    expect(screen.getByText(shLine('ssh-keygen -t ed25519 -f ~/.ssh/hoody-atlas-ab12 -C hoody-atlas-ab12'))).toBeInTheDocument();
  });
});

describe('kit SshKeyHelp: a download that fails', () => {
  it('wipes the key and offers nothing public when the download throws', async () => {
    failSave = true;
    render(<SshKeyHelp computer="atlas" os="linux" onKey={() => {}} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['sshhelp.made.download'] }));
    expect(zero(handed[0] as Uint8Array)).toBe(true);
    expect(screen.getByText(strings['sshhelp.made.notSaved'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['sshhelp.saved.use'] })).toBeNull();
    expect(screen.queryByText(/^ssh-ed25519 /)).toBeNull();
    expect(screen.getByRole('button', { name: strings['sshhelp.make.go'] })).toBeInTheDocument();
  });
});

describe('kit sshKey: the tag', () => {
  it('is four lowercase letters or digits, and new each time', async () => {
    const actual = await vi.importActual<typeof SshKeyMod>('./sshKey');
    const tags = new Set(Array.from({ length: 50 }, () => actual.sshKeyTag()));
    for (const x of tags) expect(x).toMatch(/^[a-z0-9]{4}$/);
    expect(tags.size).toBeGreaterThan(40);
  });
});

describe('kit sshKey: OpenSSH formats', () => {
  it('the private file is openssh-key-v1 with no cipher, matching check numbers and the public key inside', async () => {
    const pair = await real.makeSshKey('t');
    if (!pair) throw new Error('this runtime has no Ed25519');
    const text = new TextDecoder().decode(pair.privateFile);
    const body = Uint8Array.from(atob(text.split('\n').slice(1, -2).join('')), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(body.slice(0, 15))).toBe('openssh-key-v1\0');
    expect(text.split('\n').slice(1, -3).every((l) => l.length === 70)).toBe(true);
    // The public blob sits in the file as bytes (compared as char codes: no text decoder remaps any byte).
    const pubBlob = atob(pair.publicLine.split(' ')[1] ?? '');
    expect(String.fromCharCode(...body)).toContain(pubBlob);
    // The seed in, wiped buffers out: the same seed gives the same file twice (nothing else random but `check`).
    const seed = new Uint8Array(32).fill(7);
    const pub = new Uint8Array(32).fill(9);
    const a = openSshPrivate(seed, pub, 'c', 1);
    const b = openSshPrivate(seed, pub, 'c', 1);
    expect(a).toEqual(b);
    expect(seed.every((x) => x === 7)).toBe(true);
  });
});

// "Use this key" fills the form, so it waits while the enclosing Form is locked (C9). Making
// another key sends nothing to the form and stays live.
describe('kit SshKeyHelp: inside a locked Form', () => {
  it('"Use this key" is disabled and the form gets no key; Make another stays live', async () => {
    const got: string[] = [];
    const Host = ({ locked }: { locked: boolean }) => (
      <Form locked={locked} onSubmit={() => undefined}>
        <SshKeyHelp computer="atlas" os="linux" onKey={(k) => { got.push(k); }} />
      </Form>
    );
    const { rerender } = render(<Host locked={false} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: strings['sshhelp.make.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['sshhelp.made.download'] }));
    const use = screen.getByRole('button', { name: strings['sshhelp.saved.use'] });
    expect(use).toBeEnabled();
    rerender(<Host locked />);
    expect(use).toBeDisabled();
    await userEvent.click(use);
    expect(got).toEqual([]);
    expect(screen.getByRole('button', { name: strings['sshhelp.saved.again'] })).toBeEnabled();
  });
});
