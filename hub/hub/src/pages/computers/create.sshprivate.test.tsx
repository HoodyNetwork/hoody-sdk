// Get a computer, SSH key field and a private key pasted by mistake: once the form refuses it, it does not stay in the
// field; and a key text that is not one public key line goes when the page is hidden, while a public key stays.
// The key text below is made up: it is no key.
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitSsh from '@kit/forms/SshKeyHelp.strings.en.json';
import page from './page';
import strings from './strings.en.json';

const MARK = 'FAKEnotAkey';
const BODY = `${MARK}LINE1`.padEnd(70, 'x');
const PRIVATE = `${['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' ')} ${BODY}`;
const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop';
// The wire form of a key (made-up numbers): what a real .pub line of that type holds. A number is that many bytes.
const field = (f: string | number): string => {
  const v = typeof f === 'number' ? 'k'.repeat(f) : f;
  return String.fromCharCode(0, 0, v.length >> 8, v.length & 255) + v;
};
const wire = (...fields: (string | number)[]): string => btoa(fields.map(field).join(''));
// A certificate: type, nonce, the key's fields, serial and type, id, principals, validity, options, extensions,
// reserved, the signing key, the signature.
const cert = (type: string, ...key: (string | number)[]): string =>
  btoa([type, 32, ...key].map(field).join('') + '\0'.repeat(12) + ['ana', 'ana'].map(field).join('') + '\0'.repeat(16) +
    ['', '', '', ['ssh-ed25519', 32].map(field).join(''), 83].map(field).join(''));
// A complete made-up ed25519 public key, as a real one decodes.
const PUBW = `ssh-ed25519 ${wire('ssh-ed25519', 32)} ana@laptop`;
// Public key lines of types this page does not take, and one behind an options prefix.
const OTHER = [
  `sk-ssh-ed25519@openssh.com ${wire('sk-ssh-ed25519@openssh.com', 32, 'ssh:')}`,
  `sk-ecdsa-sha2-nistp256@openssh.com ${wire('sk-ecdsa-sha2-nistp256@openssh.com', 'nistp256', 65, 'ssh:')}`,
  `ssh-dss ${wire('ssh-dss', 129, 21, 128, 128)}`,
  `ssh-ed25519-cert-v01@openssh.com ${cert('ssh-ed25519-cert-v01@openssh.com', 32)}`,
  `ssh-rsa-cert-v01@openssh.com ${cert('ssh-rsa-cert-v01@openssh.com', 3, 257)}`,
  `ecdsa-sha2-nistp256-cert-v01@openssh.com ${cert('ecdsa-sha2-nistp256-cert-v01@openssh.com', 'nistp256', 65)}`,
].map((key) => `${key} ana@laptop`);
const OPTIONS = `no-pty,command="/bin/true" ${PUBW}`;

async function openMore() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  const field = () => within(d).getByRole('textbox', { name: strings['create.ssh'] }) as HTMLInputElement;
  return { d, field };
}

describe('create: a private key in the SSH key field', () => {
  it('a private key with its BEGIN line is refused as it is pasted', async () => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(PRIVATE);
    expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
  }, 40000);

  // A key body joined onto a public key line is refused as it is pasted: after a space, glued onto the public body
  // itself, quoted onto it (also behind a word), or glued onto a certificate's body.
  it.each([
    `${PUB} ${BODY}`,
    `${PUB.replace(' ana@laptop', '')}${BODY}`,
    `${PUBW.replace(' ana@laptop', '')}${BODY}`,
    `hello ${PUBW.replace(' ana@laptop', '')}"${BODY}"`,
    `${PUBW.replace(' ana@laptop', '')}"${BODY}"`,
    `${(OTHER[2] ?? '').replace(' ana@laptop', '')}"${BODY}"`,
    `${(OTHER[3] ?? '').replace(/=* ana@laptop$/, '')}${BODY}`,
  ])('%s is refused as it is pasted', async (text) => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(text);
    expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
  }, 40000);

  it('a key body with no BEGIN line, on one line, is refused at once; then only a public key line is taken', async () => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(BODY);
    expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
    // Strict now: a short piece with no long run is refused too.
    await userEvent.click(field());
    await userEvent.paste(`${MARK}LAST==`);
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
    await userEvent.click(field());
    await userEvent.paste(PUB);
    expect(field()).toHaveValue(PUB);
    await waitFor(() => expect(within(d).queryByText(strings['create.error.ssh_private'])).toBeNull());
  }, 40000);

  it('page hide: a text that is not one public key line goes, a public key stays', async () => {
    const { field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste('hello');
    expect(field()).toHaveValue('hello');
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await waitFor(() => expect(field()).toHaveValue(''));
    await userEvent.click(field());
    await userEvent.paste(PUB);
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(field()).toHaveValue(PUB);
  }, 40000);

  it.each([...OTHER, OPTIONS])('pasted, %s stays in the field and the form says it is not a public key it takes', async (key) => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(key);
    expect(field()).toHaveValue(key);
    expect(within(d).queryByText(strings['create.error.ssh_private'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    expect(await within(d).findByText(strings['create.error.ssh_notkey'])).toBeInTheDocument();
    expect(field()).toHaveValue(key);
  }, 40000);

  it.each(OTHER)('pasted after a refusal, %s stays in the field', async (key) => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(BODY);
    expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveValue(''));
    await userEvent.click(field());
    await userEvent.paste(key);
    expect(field()).toHaveValue(key);
    expect(within(d).queryByText(strings['create.error.ssh_private'])).toBeNull();
  }, 40000);

  it('after a refusal, "Use this key" fills the field and the private key message goes', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));
    try {
      const { d, field } = await openMore();
      await userEvent.click(field());
      await userEvent.paste(BODY);
      expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.title'] }));
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.make.go'] }));
      await userEvent.click(await within(d).findByRole('button', { name: kitSsh['sshhelp.made.download'] }));
      await userEvent.click(within(d).getByRole('button', { name: kitSsh['sshhelp.saved.use'] }));
      await waitFor(() => expect(field().value).toMatch(/^ssh-ed25519 AAAA/));
      expect(within(d).queryByText(strings['create.error.ssh_private'])).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 40000);

  // The field is one line: a public key line pasted with body lines under it arrives joined.
  it.each([OTHER[0], OTHER[1], OTHER[2], OPTIONS] as string[])('%s with a private body joined onto its line is refused as it is pasted', async (key) => {
    const { d, field } = await openMore();
    await userEvent.click(field());
    await userEvent.paste(`${key} ${BODY}`);
    expect(await within(d).findByText(strings['create.error.ssh_private'])).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
  }, 40000);
});
