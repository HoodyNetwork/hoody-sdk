// Vitest: mask reads the text as written, then as each reader shows it. An escape or invisible character inside a secret's name cannot
// hide its value from the masks; output with nothing to mask keeps its bytes. Best effort: see the screen's words.
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cleanAgentText } from '@kit';
import { stripAnsi } from '@kit/data/highlight';
import { mask } from './logic';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const VALUE = 'abcdef0123456789';

describe.each([
  ['a zero-width space', '\u200b'],
  ['a bell', '\u0007'],
  ['a soft hyphen', '\u00ad'],
  ['a variation selector', '\ufe0f'],
  ['a combining grapheme joiner', '\u034f'],
  ['a Hangul filler', '\u3164'],
  ['a blank braille cell', '\u2800'],
  ['a tag character', '\u{e0020}'],
  ['a reset escape', '\u001b[0m'],
])('a name split by %s', (_name, x) => {
  it.each([
    ['token=', `curl to${x}ken=${VALUE}`],
    ['--password', `run --pass${x}word ${VALUE}`],
    ['Bearer', `Bea${x}rer ${VALUE}`],
    ['authorization', `Author${x}ization: ${VALUE}`],
    ['an upper-case variable', `run; TOK${x}EN=${VALUE}`],
  ])('%s still masks its value', (_where, text) => {
    const out = mask(text);
    expect(out).not.toContain(VALUE);
    expect(out).toContain('••••');
  });
});

// Judged by what each reader shows, not by a copy of their grammar.
describe('a value only a reader shows', () => {
  it.each([
    ['a two-byte escape in the name', `to\u001b7ken=${VALUE}`],
    ['a reset escape in the name', `to\u001bcken=${VALUE}`],
    ['a charset escape in the name', `to\u001b(Bken=${VALUE}`],
    ['a C1 colour in the name', `to\u009b0mken=${VALUE}`],
    ['a C1 title string in the name', `to\u009dx\u0007ken=${VALUE}`],
    ['an application string in the name', `to\u001b_x\u001b\\ken=${VALUE}`],
    ['a charset escape in a flag', `run --pass\u001b(Bword ${VALUE}`],
    ['a two-byte escape in Bearer', `Bea\u001b7rer ${VALUE}`],
    ['an open string cut at the line, read only by the cleaner', `\u001b]x\nto\u001b7ken=${VALUE}`],
    ['a line of output under a colour', `\u001b[32mTOKEN=${VALUE}\u001b[0m`],
    ['masking as written would cut the title sequence in two', `to\u001b]token=x\u0007ken="${VALUE}" to\u200bken=other`],
    ['the same, with nothing more to mask after it', `to\u001b]token=x\u0007ken="${VALUE}"`],
    ['the same, in single quotes', `to\u001b]password=x\u0007ken='${VALUE}' next`],
  ])('%s: hidden as raw text and in both readers', (_name, text) => {
    const out = mask(text);
    expect(out).not.toContain(VALUE);
    expect(stripAnsi(out)).not.toContain(VALUE);
    expect(cleanAgentText(out).text).not.toContain(VALUE);
    expect(out).toContain('••••');
  });

  it('a mask applied twice changes nothing more', () => {
    for (const text of [`to\u001b7ken=${VALUE}`, `\u001b[32mok token=${VALUE}\u001b[0m`, `a=1 to\u200bken=${VALUE}`]) {
      expect(mask(mask(text))).toBe(mask(text));
    }
  });

  it.each([
    ['a control inside the value', `token=abcdef\u00070123456789`, '0123456789'],
    ['an escape inside the value', `token=abcdef\u001b[0m0123456789`, '0123456789'],
    ['a control inside a quoted value', `token="abcdef\u00070123456789"`, '0123456789'],
    ['a control inside a bearer value', `Bearer abcdef\u00070123456789`, '0123456789'],
    ['a control inside an address password', fake('https://u:', 'abcdef\u00070123456789@example.com'), '0123456789'],
  ])('%s: no part of it shows', (_name, text, part) => {
    const out = mask(text);
    expect(stripAnsi(out)).not.toContain(part);
    expect(cleanAgentText(out).text).not.toContain(part);
    expect(out).not.toContain(part);
  });

  it('a value at the end of a colour keeps the colours', () => {
    expect(mask(`\u001b[32mok token=${VALUE}\u001b[0m next`)).toBe('\u001b[32mok token=••••\u001b[0m next');
  });

  it('a name glued to a word by a control keeps the mask it got as written', () => {
    expect(mask(`note\u0007password=${VALUE}`)).not.toContain(VALUE);
  });
});

// A blow-up must fail, not hang the run: the vm timeout interrupts a running pattern. On tip the address mask started at every
// letter, so 80k characters of hex took 6 s and a million took minutes.
describe('a long string cannot stall the masks', () => {
  const LONG = 2000000;
  const run = (s: string) => runInNewContext('f(s)', { f: mask, s }, { timeout: 10000 }) as string;
  it.each([
    ['one run of letters', 'a'.repeat(LONG)],
    ['one run of hex', 'deadbeef01'.repeat(LONG / 10)],
    ['one run of capitals after a space', ` ${'A'.repeat(LONG)}`],
    ['one open quote', `token="${'a'.repeat(LONG)}`],
    ['open quotes', 'token="'.repeat(LONG / 7)],
    ['address starts', 'a://'.repeat(LONG / 4)],
    ['an address with no end', `a://${'b'.repeat(LONG)}`],
    ['names with no value', 'api_key '.repeat(LONG / 8)],
    ['spaces after a name', `api_key${' '.repeat(LONG)}`],
    ['one open title sequence', `\u001b]${'a'.repeat(LONG)}`],
    ['two-byte escapes', '\u001b7'.repeat(LONG / 2)],
    ['C1 colours', '\u009b0m'.repeat(LONG / 3)],
  ])('%s', (_name, text) => {
    expect(() => run(text)).not.toThrow();
  });

  it('a value before a long open string stays hidden', () => {
    expect(run(`token=${VALUE} \u001b]${'a'.repeat(LONG)}`)).not.toContain(VALUE);
  });
});

describe('a mask never takes an escape apart', () => {
  it('an address inside a title sequence leaves the text after the sequence showing', () => {
    const text = '\u001b]a://x\u0007y@h done';
    expect(mask(text)).toBe(text);
  });
  it('a bearer word inside a title sequence leaves the text after the sequence showing', () => {
    expect(stripAnsi(mask('\u001b]bearer x\u0007done next'))).toBe('done next');
  });
});

// A reader takes a control out, and the word break with it, so a name reads as glued to the word before it.
describe('a removed control does not hide a name behind the word before it', () => {
  it.each([
    ['a quoted value holding a bell', 'note\u0007password="abcdef\u00070123456789"'],
    ['a bare value holding a bell', 'note\u0007password=abcdef\u00070123456789'],
    ['a name an escape splits, after a bell', 'note\u0007pass\u001b7word=abcdef0123456789'],
    ['a name right after an escape', 'note\u001b7password=abcdef0123456789'],
    ['a value in two parts around an escape, after a bell', 'note\u0007pass\u001b7word=abcdef\u001b70123456789'],
  ])('%s', (_name, s) => {
    const out = stripAnsi(mask(s));
    expect(out).not.toContain('abcdef');
    expect(out).not.toContain('0123456789');
    expect(out).toContain('••••');
  });
  it('the reading it returns holds no mark', () => {
    expect(mask('note\u001b7password=abcdef next')).toBe('notepassword=•••• next');
  });
  it('a mark already in the text does not reach the screen with a masked value', () => {
    expect(mask('one\ufffctwo\u001b7password=abcdef')).toBe('onetwopassword=••••');
  });
  it('text with nothing to mask keeps a mark it already held, and its colours', () => {
    const text = '\u001b[31mone\ufffctwo\u001b[0m next';
    expect(mask(text)).toBe(text);
  });
  it('a mark already in the text makes no name out of a word', () => {
    const text = 'pass\ufffcword\u0007 next';
    expect(mask(text)).toBe(text);
  });
  it('a masked value before a control keeps the colours of the output', () => {
    const text = '\u001b[31m token=abc\u001b[0m next';
    expect(mask(text)).toBe('\u001b[31m token=••••\u001b[0m next');
  });
  it('a bell ends a title in the reading with marks, so the name after it is read', () => {
    expect(stripAnsi(mask('\u001b]0;t\u0007note\u0007pass\u001b7word=abcdef'))).toBe('notepassword=••••');
  });
  it('a quoted value is masked whole, escape and all', () => {
    expect(mask('password="a\u001b[31mb\u001b[0mc" next')).toBe('password=•••• next');
  });
});

// The value must never be the scheme word, or a token after a colour code shows.
describe('a token after its scheme and a colour code or control', () => {
  it.each([
    ['a reset before a bearer token', 'curl -H "Authorization: Bearer \u001b[0mS3cr3tVal99"'],
    ['bold around a bearer token', '> Authorization: Bearer \u001b[1mS3cr3tVal99\u001b[22m'],
    ['dim before a basic token', 'Authorization: Basic \u001b[2mS3cr3tVal99'],
    ['an underline in a proxy header', 'proxy-authorization=Basic \u001b[4mS3cr3tVal99'],
    ['a bell before a token', 'Authorization: token \u0007S3cr3tVal99'],
    ['a NUL before a bearer token', 'Authorization: Bearer \u0000S3cr3tVal99'],
    ['a title before a bearer token', 'Authorization: Bearer \u001b]0;t\u0007S3cr3tVal99'],
    ['an api key header', 'x-api-key: token \u001b[0mS3cr3tVal99'],
  ])('%s', (_name, s) => {
    const out = mask(s);
    expect(stripAnsi(out)).not.toContain('S3cr3tVal99');
    expect(out).not.toContain('S3cr3tVal99');
    expect(stripAnsi(out)).toContain('••••');
  });
  it('the scheme word stays beside the dots', () => {
    expect(stripAnsi(mask('Authorization: Bearer \u001b[0mS3cr3tVal99'))).toBe('Authorization: Bearer ••••');
  });
  it('a plain header is masked as before, its scheme kept', () => {
    expect(mask('Authorization: Bearer S3cr3tVal99 next')).toBe('Authorization: Bearer •••• next');
    expect(mask('Authorization: S3cr3tVal99')).toBe('Authorization: ••••');
  });
  // Only the bare scheme word is refused as a value, never a value that starts with one.
  it.each([
    ['a key that starts with token and a dash', 'x-api-key: token-abc123', 'x-api-key: ••••'],
    ['a key that starts with token and a dot', 'X-API-Key: token.3f9a8b7c', 'X-API-Key: ••••'],
    ['a value that starts with Basic and a dash', 'Authorization: Basic-dXNlcjpwYXNz', 'Authorization: ••••'],
    ['a value that starts with basic and a colon', 'authorization=basic:abc', 'authorization=••••'],
    ['a scheme, then a value that starts with its word', 'Authorization: token token-abc123', 'Authorization: token ••••'],
    ['a value that starts with bearer letters', 'api_key=bearerish0123', 'api_key=••••'],
  ])('%s', (_name, s, want) => {
    expect(mask(s)).toBe(want);
  });
  it('a bare scheme word with nothing after it shows as written: there is no value to hide', () => {
    expect(mask('Authorization: Bearer')).toBe('Authorization: Bearer');
    expect(mask('x-api-key: token')).toBe('x-api-key: token');
    expect(mask('Authorization: Basic ; next')).toBe('Authorization: Basic ; next');
    expect(mask('x-api-key: "token"')).toBe('x-api-key: ••••');
  });
});

describe('an address with a password in it', () => {
  it.each([
    ['https', fake('https://user:', VALUE, '@example.com/x'), 'https://••••@example.com/x'],
    ['a scheme with a plus', `git+ssh://user:${VALUE}@example.com`, 'git+ssh://••••@example.com'],
    ['capitals', `HTTPS://user:${VALUE}@example.com`, 'HTTPS://••••@example.com'],
    ['in a line of output', `cloning redis://:${VALUE}@db:6379 now`, 'cloning redis://••••@db:6379 now'],
  ])('%s: the password goes, the rest stays', (_name, text, want) => {
    expect(mask(text)).toBe(want);
  });
  it.each([
    ['no password', 'https://example.com/a@b'],
    ['a bare mail address', 'mail me@example.com now'],
    ['a colon with no slashes', 'time: 12:30@home'],
    ['slashes with no scheme', 'see ://a@b'],
  ])('%s stays', (_name, text) => {
    expect(mask(text)).toBe(text);
  });
});

describe('mask', () => {
  it('a value masked as written stays masked when a split name beside it needs the cleaned reading', () => {
    const out = mask(`note\u200bpassword=${VALUE} to\u0007ken=${VALUE}`);
    expect(out).not.toContain(VALUE);
  });

  it.each([
    ['colours', 'done \u001b[32mok\u001b[0m in 3s\n'],
    ['a joined emoji', 'family \u{1F468}\u200d\u{1F469}\u200d\u{1F467} here'],
    ['tabs and lines', 'a\tb\nc\n'],
    ['a zero-width space between plain words', 'a\u200bb c'],
    ['carriage returns', 'starting\u000ddone\u000d\u000anext'],
    ['two-byte escapes', '\u001b7done\u001b8 ok'],
    ['C1 colours', '\u009b32mok\u009b0m'],
    ['an open title sequence', 'done \u001b]0;half a title'],
  ])('output with nothing to mask keeps %s byte for byte', (_name, text) => {
    expect(mask(text)).toBe(text);
  });

  it('colours stay on output whose secret is masked as written', () => {
    expect(mask(`\u001b[32mok\u001b[0m token=${VALUE}`)).toBe('\u001b[32mok\u001b[0m token=••••');
  });
});
