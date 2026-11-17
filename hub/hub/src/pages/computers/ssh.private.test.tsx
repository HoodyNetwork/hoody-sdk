// The SSH key drawer and a private key pasted by mistake: it is refused at once and never stays in the box until
// Save, with or without its BEGIN line, on one line or several; after a refusal only what starts as a public key line
// is taken; a text Save refuses does not stay either; and what was typed goes when the page is hidden.
// The key text below is made up: it is no key.
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import { checkSshKey, secretLike, startsLikePublicKey } from './ssh-logic';
import strings from './strings.en.json';

const MARK = 'FAKEnotAkey';
const line = (n: number): string => `${MARK}LINE${n}`.padEnd(70, 'x');
const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop';
// A made-up body that is no key's wire form (it does not decode as one).
const FAKE_BODY = `AAAA${'FakeFixtureOnly0'.repeat(3)}`;
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
    ['', '', '', [ 'ssh-ed25519', 32 ].map(field).join(''), 83].map(field).join(''));
// A complete made-up ed25519 public key, as a real one decodes.
const PUBW = `ssh-ed25519 ${wire('ssh-ed25519', 32)} ana@laptop`;
const OTHER_KEYS: [string, string][] = [
  ['sk-ssh-ed25519@openssh.com', wire('sk-ssh-ed25519@openssh.com', 32, 'ssh:')],
  ['sk-ecdsa-sha2-nistp256@openssh.com', wire('sk-ecdsa-sha2-nistp256@openssh.com', 'nistp256', 65, 'ssh:')],
  ['ssh-dss', wire('ssh-dss', 129, 21, 128, 128)],
  ['ssh-ed25519-cert-v01@openssh.com', cert('ssh-ed25519-cert-v01@openssh.com', 32)],
  ['ssh-rsa-cert-v01@openssh.com', cert('ssh-rsa-cert-v01@openssh.com', 3, 257)],
  ['ecdsa-sha2-nistp256-cert-v01@openssh.com', cert('ecdsa-sha2-nistp256-cert-v01@openssh.com', 'nistp256', 65)],
];
const OTHER_TYPES = OTHER_KEYS.map(([type]) => type);
const WIRED = OTHER_KEYS.slice(0, 3);
// Public key lines of types this page does not take, and one behind an options prefix.
const OTHER = OTHER_KEYS.map(([type, body]) => `${type} ${body} ana@laptop`);
const OPTIONS = `no-pty,command="/bin/true" ${PUBW}`;
// What live judged by: a run of 40 key body characters.
const RUN = /[A-Za-z0-9+/=]{40,}/;
// Each typed step of a key line whose type the page does not take: kept once its body is whole, and before that
// only while no 40-character run of body stands (as before: a body that is not yet whole proves nothing).
const typedSteps = (key: string, body: string): [string, boolean][] => {
  const end = key.indexOf(body) + body.replace(/=+$/, '').length;
  return Array.from({ length: key.length + 1 }, (_, n) => [key.slice(0, n), n >= end || !RUN.test(key.slice(0, n))]);
};
const ARMOUR = ['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' ');

async function openDrawer() {
  await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=connect', state: 'failedOps' });
  await userEvent.click(await screen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 }));
  const d = await screen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'borealis' }) });
  const box = () => within(d).getByRole('textbox', { name: strings['sshd.field'] }) as HTMLTextAreaElement;
  return { d, box };
}

describe('computers ssh-logic: what the key box must not keep', () => {
  it('knows the start of a public key line, typed or whole', () => {
    for (const ok of ['', '  ', 's', 'ssh-', 'ssh-ed2', 'ecdsa-sha2-nistp', 'ecdsa-sha2-nistp256 AAAA', ` ${PUB}`, 'ssh-rsa AAAA']) expect(startsLikePublicKey(ok), ok).toBe(true);
    for (const no of ['-', 'b3Bl', 'hello', 'sshx', 'AAAAC3Nza']) expect(startsLikePublicKey(no), no).toBe(false);
  });
  it('refuses the armour words anywhere, and a long base64 run that is not a public key line', () => {
    expect(secretLike(ARMOUR, false)).toBe(true);
    expect(secretLike(`${PUB}\n${line(1)}`, false)).toBe(true);
    expect(secretLike(line(1), false)).toBe(true);
    expect(secretLike(line(1).slice(0, 39), false)).toBe(false);
    expect(secretLike('hello world, this is not a key at all, just words', false)).toBe(false);
    expect(secretLike(PUB, false)).toBe(false);
    expect(secretLike('', false)).toBe(false);
  });
  it('strict: only what starts as a public key line passes', () => {
    for (const no of ['-', 'hello', `${MARK}LAST==`]) expect(secretLike(no, true), no).toBe(true);
    for (const ok of ['', 'ssh-', PUB, PUB.slice(0, 20)]) expect(secretLike(ok, true), ok).toBe(false);
  });
});

describe('computers ssh-logic: a public key of a type this page does not take is not a private key', () => {
  it.each(OTHER_KEYS)('%s: kept whole, strict or not; typed, kept until a 40 run of an unfinished body; notkey', (type, body) => {
    const key = `${type} ${body} ana@laptop`;
    for (const [text, kept] of typedSteps(key, body)) {
      expect(secretLike(text, true), text).toBe(!kept);
      expect(secretLike(text, false), text).toBe(!kept);
    }
    expect(checkSshKey(key)).toEqual({ ok: false, code: 'notkey' });
  });
  it('a line behind an options prefix is kept when pasted, strict or not; typed, as an unfinished body', () => {
    expect(secretLike(OPTIONS, false)).toBe(false);
    expect(secretLike(OPTIONS, true)).toBe(false);
    for (const [text, kept] of typedSteps(OPTIONS, PUBW.split(' ')[1] ?? '')) expect(secretLike(text, false), text).toBe(!kept);
    expect(checkSshKey(OPTIONS)).toEqual({ ok: false, code: 'notkey' });
    // Behind a prefix only a whole type name is read as one: a certificate's there is refused, as before.
    for (const key of OTHER) expect(secretLike(`restrict ${key}`, true), key).toBe(key.includes('-cert-'));
    // A made-up body proves nothing: behind a prefix, or of another type, it is refused as before.
    for (const type of OTHER_TYPES) expect(secretLike(`${type} ${FAKE_BODY}`, false), type).toBe(true);
    expect(secretLike(`restrict ${PUB}`, false)).toBe(true);
  });
  it('a private body stays refused behind any of those names', () => {
    for (const type of [...OTHER_TYPES, 'ssh-ed25519', 'ssh-rsa']) {
      expect(secretLike(`${type} ${line(1)}`, false), type).toBe(true);
      expect(secretLike(`${type} ${FAKE_BODY}\n${line(1)}`, false), type).toBe(true);
      expect(secretLike(`${type} ${FAKE_BODY}\n${ARMOUR}`, false), type).toBe(true);
    }
    expect(secretLike(`${line(1)} ${PUB}`, false)).toBe(true);
    expect(secretLike(`${OPTIONS}\n${line(1)}`, false)).toBe(true);
    expect(secretLike(`restrict ${line(1)}`, false)).toBe(true);
    expect(secretLike('restrict', true)).toBe(true);
    expect(secretLike(`sk-other@openssh.com ${FAKE_BODY}`, false)).toBe(true);
    // Nothing is glued onto one of the other names, however short.
    for (const type of ['ssh-dss', 'sk-ssh-ed25519@openssh.com']) expect(secretLike(`${type}${MARK}`, true), type).toBe(true);
    expect(secretLike(`sk-ssh-ed25519-cert-v01@openssh.com ${FAKE_BODY}`, false)).toBe(true);
    expect(secretLike(`restrict ssh-ed25519-cert-v01@openssh.com ${FAKE_BODY}`, false)).toBe(true);
  });
  it.each(WIRED)('%s in its wire form: kept alone, typed and behind options; refused with a private body glued onto its body', (type, body) => {
    const key = `${type} ${body}`;
    for (const [text, kept] of typedSteps(key, body)) expect(secretLike(text, true), text).toBe(!kept);
    for (const ok of [key, `${key} ana@laptop`, `restrict ${key} ana@laptop`]) expect(secretLike(ok, true), ok).toBe(false);
    expect(checkSshKey(key)).toEqual({ ok: false, code: 'notkey' });
    const plain = body.replace(/=+$/, '');
    for (const text of [`${type} ${plain}${line(1)}`, `${key}${line(1)}`, `restrict ${type} ${plain}${line(1)}`, `${type} ${plain}${line(1)} ana@laptop`, `${type} ${plain}${line(1).slice(0, 64)}`]) {
      expect(secretLike(text, false), text).toBe(true);
    }
  });
  // A one-line field delivers a public key line and the body lines selected under it as ONE line.
  it.each([...OTHER, OPTIONS, PUB, PUBW, `hello ${PUBW}`])('%s: a private body joined onto the same line is refused', (key) => {
    const bare = key.replace(' ana@laptop', '');
    for (const text of [`${key} ${line(1)}`, `${key}${line(1)}`, `${key} ${line(1)} ${line(2)}`, `${bare} ${line(1)}`, `${key} c\t${line(1)}`]) {
      expect(secretLike(text, false), text).toBe(true);
      expect(secretLike(text, true), text).toBe(true);
    }
    // Joined with no space at all, or with a space that is not a plain one.
    const type = bare.split(' ')[0] ?? '';
    for (const text of [`${type}${line(1)}`, `${type}\u00a0${line(1)}`, `${bare.replace(/ /g, '\u00a0')}\u00a0${line(1)}`]) expect(secretLike(text, false), text).toBe(true);
    // Glued behind the key body's padding.
    expect(secretLike(`${bare}=${line(1)}`, false), 'padding').toBe(true);
    // A real comment stays: user@host, an email, a date, a path, many words; on an accepted key also a fingerprint
    // and 40 hex, as the check takes them (its bound is 64). On any other line a 40 run is refused, as before.
    const notes = ['ana@laptop', 'ana.smith@example.com 2024-11-15', 'rsa-key-20241115', '/home/ana/.ssh/id_key.pub on laptop', 'word '.repeat(40)];
    const runs = [`SHA256:${'aB3'.repeat(14)}x`, 'a1b2c3d4e5'.repeat(4)];
    if (key === PUB || key === PUBW) notes.push(...runs);
    else for (const note of [...runs, line(1).slice(0, 50)]) expect(secretLike(`${bare} ${note}`, false), note).toBe(true);
    for (const note of notes) expect(secretLike(`${bare} ${note}`, false), note).toBe(false);
  });
});

// Shapes checked here: a private body quoted or glued onto a key body, glued onto a certificate, or a
// piece of one as a comment. M is a made-up body shaped as a PKCS#1 one (MII…), P a complete made-up ed25519 key.
describe('computers ssh-logic: a private body glued or quoted onto a key body is refused at once', () => {
  const P = PUBW.replace(' ana@laptop', '');
  const M = `MII${'Q'.repeat(61)}`;
  const M8 = `MC4CAQAwBQYDK2VwBCIEI${'Q'.repeat(43)}`;
  const both = (text: string): void => {
    expect(secretLike(text, false), text).toBe(true);
    expect(secretLike(text, true), text).toBe(true);
  };
  it.each([M, M8])('quoted onto a key body, behind a word, at the start, after another type: %s', (m) => {
    both(`hello ${P}"${m}"`);
    both(`${P}"${m}"`);
    both(`${P}'${m}`);
    for (const [type, body] of WIRED) {
      both(`${type} ${body.replace(/=+$/, '')}"${m}"`);
      both(`restrict ${type} ${body.replace(/=+$/, '')}"${m}"`);
    }
  });
  it.each([M, M8])('glued with no space onto an accepted key body, also behind a word: %s', (m) => {
    both(`${P}${m}`);
    both(`${P}${m} ana@laptop`);
    both(`hello ${P}${m}`);
    expect(checkSshKey(`${P}${m}`)).toEqual({ ok: false, code: 'private' });
  });
  it.each(OTHER_KEYS.slice(3))('glued onto a %s certificate body', (type, body) => {
    both(`${type} ${body.replace(/=+$/, '')}${M}`);
    both(`${type} ${body.replace(/=+$/, '')}${M8} ana@laptop`);
    expect(secretLike(`${type} ${body} ana@laptop`, true)).toBe(false);
  });
  // The comment bound stays 64 on an accepted key (ssh-oneline.test.ts pins real comments with runs of
  // 43-60: a fingerprint, a long path, a long name). A piece under 64 is no usable key; 64 and over is refused.
  it('a piece as the comment of an accepted key: under 64 kept as the check takes it, 64 refused', () => {
    for (const m of [M, M8]) {
      expect(secretLike(`${P} ${m.slice(0, 50)}`, false)).toBe(false);
      both(`${P} ${m.slice(0, 64)}`);
      expect(checkSshKey(`${P} ${m.slice(0, 64)}`)).toEqual({ ok: false, code: 'private' });
    }
    expect(checkSshKey(PUBW)).toEqual({ ok: true, key: PUBW });
  });
});

describe('computers: a public key of another type in the SSH key drawer', () => {
  const saveBtn = (d: HTMLElement) => within(d).getByRole('button', { name: /^(Replace key|Save key)$/ });
  it.each([...OTHER, OPTIONS])('pasted, %s stays in the box and Save says it is not a key this page takes', async (key) => {
    const { d, box } = await openDrawer();
    await userEvent.click(box());
    await userEvent.paste(key);
    expect(box()).toHaveValue(key);
    expect(within(d).queryByText(strings['ssh.error.private'])).toBeNull();
    await userEvent.click(saveBtn(d));
    expect(await within(d).findByText(strings['ssh.error.notkey'])).toBeInTheDocument();
    expect(within(d).queryByText(strings['ssh.error.private'])).toBeNull();
  }, 40000);
  it.each(OTHER)('pasted after a refusal, %s stays in the box', async (key) => {
    const { d, box } = await openDrawer();
    await userEvent.click(box());
    await userEvent.paste(line(1));
    expect(await within(d).findByText(strings['ssh.error.private'])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(''));
    await userEvent.click(box());
    await userEvent.paste(key);
    expect(box()).toHaveValue(key);
    await userEvent.click(saveBtn(d));
    expect(await within(d).findByText(strings['ssh.error.notkey'])).toBeInTheDocument();
  }, 40000);
});

describe('computers: a private key pasted into the SSH key drawer', () => {
  it('a one-line body with no BEGIN line is refused at once; then only a public key line is taken', async () => {
    const { d, box } = await openDrawer();
    await userEvent.click(box());
    // Before any refusal other text stays, for Save to refuse.
    await userEvent.paste('hello');
    expect(box()).toHaveValue('hello');
    await userEvent.clear(box());
    await userEvent.paste(line(1));
    expect(await within(d).findByText(strings['ssh.error.private'])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
    // Strict now: a short piece with no long run is refused too.
    await userEvent.click(box());
    await userEvent.paste(`${MARK}LAST==`);
    await waitFor(() => expect(box()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
    await userEvent.click(box());
    await userEvent.paste(PUB);
    expect(box()).toHaveValue(PUB);
  }, 40000);

  it('a private key with its BEGIN line, and a body under a public key line, never stay until Save', async () => {
    const { d, box } = await openDrawer();
    await userEvent.click(box());
    await userEvent.paste(`${ARMOUR}\n${line(1)}\n${line(2)}`);
    expect(await within(d).findByText(strings['ssh.error.private'])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(''));
    await userEvent.click(box());
    await userEvent.paste(`${PUB}\n${line(1)}`);
    await waitFor(() => expect(box()).toHaveValue(''));
    expect(document.body.textContent ?? '').not.toContain(MARK);
  }, 40000);

  it('a text Save refuses does not stay in the box', async () => {
    const { d, box } = await openDrawer();
    await userEvent.click(box());
    await userEvent.paste('hello');
    await userEvent.click(within(d).getByRole('button', { name: /^(Replace key|Save key)$/ }));
    expect(await within(d).findByText(strings['ssh.error.notkey'])).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(''));
  }, 40000);

  it('what was typed goes when the page is hidden', async () => {
    const { box } = await openDrawer();
    await userEvent.click(box());
    await userEvent.paste('hello');
    expect(box()).toHaveValue('hello');
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await waitFor(() => expect(box()).toHaveValue(''));
  }, 40000);
});
