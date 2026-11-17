// Keys > SSH key: a failed read of the top bar's computer says why, each with its own way on, instead of one
// generic line. A computer of another realm (the realm's host answers 403 INSUFFICIENT_PERMISSIONS) offers Show all
// realms (the shell's switch; none when the session is pinned to one realm) and Choose another computer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { computerReadFail } from './data';
import { sent } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const shell = vi.hoisted(() => ({ setRealm: vi.fn() as ((id: string) => void) | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    useShellData: () => ({ ...(kit.useShellData as () => object)(), setRealm: shell.setRealm }),
    usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }),
  };
});

afterEach(() => {
  shell.setRealm = vi.fn();
});

const openSsh = async (state: string, realm?: string) => {
  await renderPage(page, { state, ...(realm !== undefined && { realm }) });
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
};
const chooseLink = () => screen.getByRole('link', { name: strings['ssh.read.choose'] });

describe('keys: the SSH tab when the computer cannot be read', () => {
  it('a computer of another realm says so, and Show all realms switches the shell to all realms', async () => {
    const setRealm = vi.fn();
    shell.setRealm = setRealm;
    await openSsh('sshReadRealm');
    expect(await screen.findByText(strings['ssh.read.realm.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.read.realm.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.loadFailed'])).toBeNull();
    expect(chooseLink()).toHaveAttribute('href', expect.stringMatching(/\/computers$/));
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.read.showAll'] }));
    expect(setRealm).toHaveBeenCalledWith('all');
  }, 30000);

  it('a session pinned to one realm gets no Show all realms, only Choose another computer', async () => {
    shell.setRealm = undefined;
    await openSsh('sshReadRealm');
    expect(await screen.findByText(strings['ssh.read.realm.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.read.realm.bodyPinned'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['ssh.read.showAll'] })).toBeNull();
    expect(chooseLink()).toBeInTheDocument();
  }, 30000);

  it('the same refusal while all realms are shown is a missing right, not a realm', async () => {
    await openSsh('sshReadRealm', 'all');
    expect(await screen.findByText(strings['ssh.read.access.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.read.realm.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['ssh.read.showAll'] })).toBeNull();
    expect(chooseLink()).toBeInTheDocument();
  }, 30000);

  it('a 403 with another code in one realm is a missing right too', async () => {
    await openSsh('sshReadForbidden');
    expect(await screen.findByText(strings['ssh.read.access.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.read.realm.title'])).toBeNull();
    expect(chooseLink()).toBeInTheDocument();
  }, 30000);

  it('an ended sign-in says so', async () => {
    await openSsh('sshReadSignin');
    expect(await screen.findByText(strings['ssh.read.signin.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.read.signin.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.loadFailed'])).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  }, 30000);

  it('a computer that is no longer available (404) says so and offers another', async () => {
    await openSsh('sshReadGone');
    expect(await screen.findByText(strings['ssh.read.gone.title'])).toBeInTheDocument();
    expect(chooseLink()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  }, 30000);

  it('a server failure says so, and Try again reads the computer once more', async () => {
    await openSsh('sshReadServer');
    expect(await screen.findByText(strings['ssh.read.server.title'])).toBeInTheDocument();
    const before = sent.computer;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('button', { name: strings['ssh.replace'] })).toBeInTheDocument();
    expect(sent.computer).toBe(before + 1);
  }, 30000);

  it('no answer at all says the server could not be reached, and Try again reads it', async () => {
    await openSsh('sshReadOffline');
    expect(await screen.findByText(strings['ssh.read.offline.title'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('button', { name: strings['ssh.replace'] })).toBeInTheDocument();
  }, 30000);

  it('a refusal this page has no words for keeps the general line with Try again', async () => {
    await openSsh('sshReadOther');
    expect(await screen.findByText(strings['ssh.loadFailed'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  }, 30000);

  it('the classifier reads core\'s error shapes: dead contexts and core\'s timeout are not the server\'s answer', () => {
    const one = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    expect(computerReadFail({ status: 401, superseded: true }, one)).toBe('other');
    expect(computerReadFail({ stale: true }, one)).toBe('other');
    expect(computerReadFail({ status: 0, code: 'CANCELLED', cancelled: true }, one)).toBe('other');
    expect(computerReadFail({ status: 0 }, one)).toBe('offline');
    expect(computerReadFail({ status: 0, code: 'TIMEOUT' }, one)).toBe('offline');
    expect(computerReadFail(new TypeError('Failed to fetch'), one)).toBe('offline');
    expect(computerReadFail({ status: 403, code: 'INSUFFICIENT_PERMISSIONS' }, one)).toBe('realm');
    expect(computerReadFail({ status: 403, code: 'INSUFFICIENT_PERMISSIONS' }, 'all')).toBe('access');
    expect(computerReadFail({ status: 401, code: null }, one)).toBe('signin');
    expect(computerReadFail({ status: 404, code: 'NOT_FOUND' }, one)).toBe('gone');
    expect(computerReadFail({ status: 502, code: null }, one)).toBe('server');
    expect(computerReadFail({ status: 409, code: 'CONFLICT' }, one)).toBe('other');
    expect(computerReadFail(null, one)).toBe('other');
  });
});
