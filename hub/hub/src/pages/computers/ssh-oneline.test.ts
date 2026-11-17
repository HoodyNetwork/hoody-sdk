// Get a computer, Copy and the SSH key drawer take ONE public key line (the Keys page's rule): a public key line with
// more under it passed the check and was sent whole. The key text below is made up: it is no key.
import { describe, expect, it } from 'vitest';
import { checkSshKey } from './ssh-logic';

const line = (n: number): string => `FAKEnotAkeyLINE${n}`.padEnd(70, 'x');
const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop';
const PUB2 = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABFakeFixtureKeyOnly1111111111111111 ana@desk';

describe('computers: one public key is one line', () => {
  it('takes one line, with blank lines and spaces around it', () => {
    for (const ok of [PUB, `${PUB}\n`, `${PUB}\r\n\r\n`, `\n ${PUB} \n\n`, PUB.split(' ').slice(0, 2).join(' '), `${PUB} two words`])
      expect(checkSshKey(ok), JSON.stringify(ok)).toEqual({ ok: true, key: ok.trim() });
  });
  it('refuses a private key body under a public key line as a private key', () => {
    for (const sep of ['\n', '\r\n', '\r', '\u2028', '\v'])
      expect(checkSshKey([PUB, line(1), line(2)].join(sep)), JSON.stringify(sep)).toEqual({ ok: false, code: 'private' });
  });
  it('refuses two public keys and a note under the key', () => {
    for (const no of [`${PUB}\n${PUB2}`, `${PUB}\r\n${PUB2}\r\n`, `${PUB}\nhello`]) expect(checkSshKey(no), JSON.stringify(no)).toEqual({ ok: false, code: 'notkey' });
  });
  // Get a computer's key field is ONE line (an input): a browser drops the line ends of a multi-line paste, so the .pub
  // line and a headerless private body arrive as one line, the body glued to the comment or to the public body.
  it('refuses a private key body joined onto the public key line (the one-line field)', () => {
    const NC = PUB.split(' ').slice(0, 2).join(' ');
    const BODY = ['b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW', line(2), 'FAKEnotAkeyLAST=='];
    for (const joined of [[PUB, ...BODY].join(''), [NC, ...BODY].join(''), [PUB, ...BODY].join(' '), [NC, ...BODY].join('\t'), `${PUB} ${line(1)}`])
      expect(checkSshKey(joined), JSON.stringify(joined)).toEqual({ ok: false, code: 'private' });
  });
  // Only a run of 64+ key body characters in the comment is a private key line (OpenSSH 70, PEM 64): real comments with
  // a shorter run are still taken.
  it('takes real comments that hold a shorter run of key body characters', () => {
    const NC = PUB.split(' ').slice(0, 2).join(' ');
    for (const comment of ['SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU ana', 'ana@laptop 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b', '/Users/johnappleseed/Documents/Keys/Production', 'MyCompanyProductionDeploymentKeyForGithubActions', 'averyveryverylongusernamewithoutanydotsatall1234@example.com']) {
      const ok = `${NC} ${comment}`;
      expect(checkSshKey(ok), ok).toEqual({ ok: true, key: ok });
    }
    expect(checkSshKey(`${NC} ana@laptop ${'A'.repeat(64)}`)).toEqual({ ok: false, code: 'private' });
  });
  // A PEM private key body glued with no separator onto a real (unpadded) ed25519 public body passed KEY_RE: the key
  // body is now read as the wire blob of its type, and a long leftover is a private key. Real keys of each type: ok.
  it('refuses a private key body glued onto a real public key body; real keys of each type are taken', () => {
    const ED = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIeWgk0NqcsBos3j2bM4U3Xpses/AuBLHQuHNq5lveFW me@laptop';
    const REAL = [ED, 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBLaZi7nyQbIT+Ao8/IWTidikRezWT/bEsVZzpsJxTWVZzIwdPEgNDWQAo4z0hWpOJ0052X5TER8SWx0yrgclOiU= me@laptop', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC9tdBoEaNbAG4iU3Zi4Tmzx0Zfi1YbVHkoabx84gCGXAPJ+F7uKiA7DgncgmHfwN3sdLzjDAonnnUeMTU8jz1cL/Y+52W0leTQeXflXfcUVZQyZA6gyA8FD3Iq7z8N2TLWGrFMtf8TGguHjdjaSdcUBDQkHt7vybuKBXm5bb0nQOPlz43QILKn6LU2ppyHowjt/LkcNTYLhzX0m1xLiklKADRtRan1aXzeuFmV1OzZx/OpJmKzMLQhRoLVf877BIekPjXkw8umiuRsQxpNw6WdY0yr25RGu76UMaXWT+e8YPwW2kwQQeA/GGGIsJ2ZJGvIKUWdzEK85d0F+ib1odvlaW2NCW8icJJFhugYlIlGHgTEIk9fJ9rB7nRRdyvc/h2jrq4o1qZ9oNy9sfQoTA5Kh0am0NkbUrgFCZN1rXJeJzGJ+pkhU4aM2eIBPKorR3wC0+NnyRoF00Mp8ivVJ1LTVr11xbFrS4xXGgnHsQdjUH8iga5lHyMb9Za7L1LTjh8= me@laptop'];
    for (const ok of REAL) expect(checkSshKey(ok), ok).toEqual({ ok: true, key: ok });
    const pemDirect = `${ED.split(' ').slice(0, 2).join(' ')}MIIEowIBAAKCAQEA${'FakePemBodyNotAKey'.repeat(4)}`;
    expect(checkSshKey(pemDirect), pemDirect).toEqual({ ok: false, code: 'private' });
    // A glued text of any length is read: 1 mod 4 (no whole-text decode) and cut short by 1-3 characters.
    for (const cut of ['x', 'xy', 'xyz']) expect(checkSshKey(pemDirect + cut), cut).toEqual({ ok: false, code: 'private' });
    // A glued body that breaks base64: its last 3 characters cut (1 mod 4), or a stray '=' left by a cut.
    for (const glued of [pemDirect.slice(0, -3), `${pemDirect}AB=`]) expect(checkSshKey(glued), glued).toEqual({ ok: false, code: 'private' });
    const edBody = ED.split(' ').slice(0, 2).join(' ');
    for (const short of [`${edBody}AAAAA`, `${edBody}A=`]) expect(checkSshKey(short), short).toEqual({ ok: false, code: 'notkey' });
    expect(checkSshKey(`${ED.split(' ').slice(0, 2).join(' ')}AAAA`)).toEqual({ ok: false, code: 'notkey' });
  });
  // The space before the comment is ONE character: a run of spaces both before and inside the comment made the check
  // try every split (50,000 spaces and a second line froze the page for seconds).
  it('answers a long run of spaces before a second line at once', () => {
    const text = `${PUB.split(' ').slice(0, 2).join(' ')}${' '.repeat(50_000)}x\nmore`;
    const t0 = performance.now();
    expect(checkSshKey(text)).toEqual({ ok: false, code: 'notkey' });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
