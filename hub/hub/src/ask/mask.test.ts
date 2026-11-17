// Three shapes a failed step's reason can carry in the Agent panel. Each value
// must be masked whole; the text around it stays.
import { describe, expect, it } from 'vitest';
import { maskSecrets } from './logic';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const SECRET = 'can\\\'t keep this private';

describe('maskSecrets: glued key names and single-quoted values', () => {
  it('a key name glued to the word before it (a control taken out) is still masked', () => {
    expect(maskSecrets(fake('notepassword=', 'hunter22'))).toBe('notepassword=•••');
    expect(maskSecrets(fake('a subtoken: ', 'abcdef b'))).toBe('a subtoken: ••• b');
  });
  it('a single-quoted value with an escaped quote is masked to its closing quote', () => {
    const out = maskSecrets(`config {'password': '${SECRET}', 'user': 'ann'}`);
    expect(out).not.toContain('keep this private');
    expect(out).not.toContain('private');
    expect(out).toContain("'user': 'ann'");
  });

  it('the same for a credential flag with a single-quoted value', () => {
    const out = maskSecrets(`run --password '${SECRET}' --verbose`);
    expect(out).not.toContain('private');
  });

  it('a cookie under a quoted key is masked', () => {
    const out = maskSecrets('request {"Cookie":"remember_me=c2Vzc2lvbi12YWx1ZQ; lang=en"}');
    expect(out).not.toContain('remember_me=c2Vzc2lvbi12YWx1ZQ');
    expect(out).not.toContain('lang=en');
    expect(out).toContain('request {"Cookie":');
  });

  it("a single-quoted 'set-cookie' key too", () => {
    const out = maskSecrets("headers {'set-cookie': 'sid2=abcdef123'}");
    expect(out).not.toContain('abcdef123');
  });

  it('a URL password longer than 200 characters is masked, and the host stays', () => {
    const pw = 'p'.repeat(150) + '!' + 'q'.repeat(150);
    const out = maskSecrets(`fetch https://ann:${pw}@db.example.com/x failed`);
    expect(out).not.toContain('ppp');
    expect(out).not.toContain('qqq');
    expect(out).toContain('https://•••@db.example.com/x failed');
  });

  it('a short URL password is still masked the same way', () => {
    expect(maskSecrets(fake('fetch https://ann:', 'hunter2@db.example.com/x'))).toBe('fetch https://•••@db.example.com/x');
  });

  it('a host with a port and an @ later in its path is not read as a password', () => {
    const line = 'GET https://db.example.com:5432/x?to=ann@example.com failed';
    expect(maskSecrets(line)).toBe(line);
  });

  it('an @ in a query or fragment after host:port is not read as a password, however long', () => {
    for (const line of [
      'GET https://db.example.com:5432?note=' + 'a!'.repeat(150) + '@mail.example failed',
      fake('GET https://db.example.com:', '5432?to=ann@mail.example failed'),
      fake('GET https://db.example.com:', '5432#ann@mail.example failed'),
      'GET https://ann?x=1:pw@mail.example failed',
    ]) expect(maskSecrets(line)).toBe(line);
  });

  it('a key that only ends in "-cookie" is ordinary text; Cookie as a key, or glued to a word, still masks', () => {
    const line = '{"fortune-cookie":"invalid input", "host":"db.example.com", "path":"/jobs"}';
    expect(maskSecrets(line)).toBe(line);
    // A letter before the key is no boundary: a control taken out can glue it to the word before it.
    expect(maskSecrets('mycookie: plain text here')).toBe('mycookie: •••');
    expect(maskSecrets('{"Cookie":"sid=abcdef123"}')).not.toContain('abcdef123');
    expect(maskSecrets('Cookie: sid=abcdef123')).toBe('Cookie: •••');
    expect(maskSecrets("x 'set-cookie': 'sid=abcdef123'")).not.toContain('abcdef123');
  });

  it('a long run with no @ after a URL user stays fast (one line at the length the panel masks)', () => {
    const s = ('a://u:' + 'x'.repeat(2000) + ' ').repeat(4).slice(0, 8192);
    const t0 = performance.now();
    maskSecrets(s);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
