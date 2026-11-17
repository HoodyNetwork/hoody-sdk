// Vitest: scrubSecrets hides every token family the agent's memory
// scrub knows (as pages/logs/scrub.ts ports it), JWTs and private key blocks, read as the sk- keys are read: what a reader
// cannot see may sit inside the token. The list here must name every token family of that port, so a new one cannot be missed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { clean, scrubSecrets, shownText } from './code';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const A20 = 'Ab12Cd34Ef56Gh78Ij90';
const A36 = `${A20}Kl12Mn34Op56Qr78`;
const HEX32 = '0123456789abcdef0123456789ABCDEF';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1rwW1gFWFOEjXk';
const SLACK_HOOK = 'https://hooks.slack.com/services/T0ABCDEF1/B0ABCDEF2/';
const DISCORD_HOOK = 'https://discord.com/api/webhooks/123456789012345678/';

// Every token family of pages/logs/scrub.ts, by its exact source, with a token it finds. A rule whose source starts with flags
// names the value before it (`password=`, `Authorization:`, `"api_key":`): agent text on a pane is not read that way, and those
// rules are counted below instead, so a new one is a decision too.
const TOKEN_RULES: Readonly<Record<string, string>> = {
  'sk-proj-[A-Za-z0-9\\-_]{20,}': `sk-proj-${A20}`,
  '\\b(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\\-_]{19,}': `pk-${A20}`,
  'sk-ant-[A-Za-z0-9\\-_]{20,}': `sk-ant-api03-${A20}`,
  'hdy_[A-Za-z0-9]{20,32}_[A-Za-z0-9]{16,48}': `hdy_${A20}_${A20.slice(0, 16)}`,
  'hbk_[A-Za-z0-9]{20,43}': `hbk_${A20}`,
  'gh[opusr]_[A-Za-z0-9]{36,}': `ghs_${A36}`,
  'github_pat_[A-Za-z0-9_]{22,}': `github_pat_11${A20}`,
  'xox[baprse]-[A-Za-z0-9\\-]{10,}': 'xoxe-1234567890',
  '\\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})([^0-9A-Z]|$)': fake('ASIA', 'IOSFODNN7EXAMPLE'),
  'AIza[A-Za-z0-9\\-_]{35}': `AIza${A20}${A20.slice(0, 15)}`,
  JWT,
  'npm_[A-Za-z0-9]{36}': `npm_${A36}`,
  'glpat-[A-Za-z0-9\\-_]{20,}': `glpat-${A20}`,
  'dop_v1_[A-Za-z0-9]{64}': `dop_v1_${HEX32}${HEX32}`,
  '\\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}': `rk_live_${A20}`,
  '\\bSG\\.[A-Za-z0-9_.\\-]{32,}': `SG.${A20}.${A20.slice(0, 12)}`,
  '\\bSK[0-9a-fA-F]{32}\\b': `SK${HEX32}`,
  'sk-or-[A-Za-z0-9\\-_]{20,}': `sk-or-v1-${A20}`,
  '\\bhf_[A-Za-z0-9]{20,}': `hf_${A20}`,
  '\\bhv[sbr]\\.[A-Za-z0-9_-]{24,}': `hvs.${A20}Ab12`,
  'xapp-\\d-[A-Za-z0-9]{1,15}-\\d{6,}-[A-Za-z0-9]{20,}': `xapp-1-A0123ABCD-1234567890123-${A20}`,
  '\\bwhsec_[A-Za-z0-9+/=]{24,}': `whsec_${A20}Ab1=`,
  '\\b(?:bot)?\\d{8,10}:[A-Za-z0-9_-]{35}([^A-Za-z0-9_-]|$)': `bot123456789:${A20}${A20.slice(0, 15)}`,
  '\\b[MNO][A-Za-z\\d]{23,27}\\.[\\w-]{6}\\.[\\w-]{27,40}': `M${A20}Ab12.Gh78Ij.${A20}Ab12Cd3`,
  '(hooks\\.slack\\.com/services/T[A-Z0-9]{6,}/B[A-Z0-9]{6,}/)[A-Za-z0-9]{20,}': `${SLACK_HOOK}${A20}Ab12`,
  '(discord(?:app)?\\.com/api/webhooks/\\d{15,25}/)[A-Za-z0-9_-]{50,}': `${DISCORD_HOOK}${A20}${A20}${A20.slice(0, 10)}`,
};
// The rules that name a value before it, pinned by value: swapping one for a new token family written
// with flags keeps the count and fails here. A change is a decision: read the new rule, then pin the new digest.
const NAMED_RULES = 23;
const NAMED_DIGEST = '920fa577ac20fd2ee9615ce5e7737f94eee8c9253589a8b24b0c57419ba40070';
const PEM_SOURCE = '(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----.*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|\\z)';

const LOGS = readFileSync(join(__dirname, '../../pages/logs/scrub.ts'), 'utf8');
const unquote = (q: string) => q.replace(/\\(.)/g, '$1');
const SOURCES = [...LOGS.matchAll(/(?<![\w.$])[PL]\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|(JWT)\b)/g)].map((m) => (m[2] ? 'JWT' : unquote(m[1] as string)));
// Every call of P or L, however its source is written (a double-quoted or template literal, another name): one this file cannot
// read fails the count below instead of dropping out of SOURCES unseen.
// Whitespace before the parenthesis is allowed in both counts.
const CALLS = [...LOGS.matchAll(/(?<![\w.$])[PL]\s*\(/g)].length - [...LOGS.matchAll(/\bfunction\s+[PL]\s*\(/g)].length;
const named = (src: string) => /^\(\?[ims]+\)/.test(src);
/** The part of a sample a reader must never see: the token, without a webhook's address. */
const secretOf = (sample: string) => sample.replace(SLACK_HOOK, '').replace(DISCORD_HOOK, '');
/** Whether any 8 characters of the secret show, at any offset, in the text as either reader shows it. */
const shows = (out: string, sample: string) => {
  const secret = secretOf(sample);
  const views = [shownText(out), clean(out).text.replace(/[\p{Cc}\p{Cf}]/gu, '')];
  for (let i = 0; i + 8 <= secret.length; i++) if (views.some((v) => v.includes(secret.slice(i, i + 8)))) return true;
  return false;
};
const SAMPLES = Object.entries(TOKEN_RULES);

describe('the token families match the Logs scrub', () => {
  it('every token family of pages/logs/scrub.ts is listed here, and each listed one is still there', () => {
    const tokens = SOURCES.filter((s) => !named(s));
    expect(tokens.filter((s) => !(s in TOKEN_RULES)), 'a token family of the Logs scrub has no row').toEqual([]);
    expect(Object.keys(TOKEN_RULES).filter((s) => !tokens.includes(s)), 'a row names no rule of the Logs scrub').toEqual([]);
  });
  it('every P and L call of pages/logs/scrub.ts is read here: a source written another way fails, never drops out', () => {
    expect(CALLS).toBe(SOURCES.length);
  });
  it('the counts read a call however it is spaced or quoted', () => {
    const calls = (src: string) => [...src.matchAll(/(?<![\w.$])[PL]\s*\(/g)].length;
    const read = (src: string) => [...src.matchAll(/(?<![\w.$])[PL]\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|(JWT)\b)/g)].length;
    for (const odd of ['P ("x", R)', 'P(`x`, R)', 'P(X, R)', 'L (\n  "x", f)']) {
      expect(calls(odd), odd).toBe(1);
      expect(read(odd), odd).toBe(0);
    }
    expect(read("P ( 'x', R)")).toBe(1);
  });
  it('the rules that name a value before it are pinned by value: a new or changed one is a decision', () => {
    expect(SOURCES.filter(named)).toHaveLength(NAMED_RULES);
    expect(createHash('sha256').update(SOURCES.filter(named).join('\n')).digest('hex')).toBe(NAMED_DIGEST);
  });
  it('the private key block rule is the one this file covers', () => {
    expect(LOGS).toContain(`const PEM = re2('${PEM_SOURCE.replaceAll('\\', '\\\\')}')`);
  });
  it.each(SAMPLES.filter(([src]) => src !== 'JWT'))('the sample for %s is one that rule finds', (src, sample) => {
    expect(new RegExp(src).test(sample)).toBe(true);
  });
});

describe('scrubSecrets hides each token family', () => {
  it.each(SAMPLES)('%s, as plain text between words', (_src, sample) => {
    const out = scrubSecrets(`before ${sample} after`);
    expect(out).toContain('[hidden]');
    expect(shows(out, sample)).toBe(false);
    expect(out.startsWith('before ')).toBe(true);
    expect(out.endsWith(' after')).toBe(true);
  });
  it.each(SAMPLES)('%s, right after an underscore', (_src, sample) => {
    expect(shows(scrubSecrets(`token_${sample}`), sample)).toBe(false);
  });
  const SPLITS: ReadonlyArray<readonly [string, string]> = [
    ['a zero-width space', '\u200b'],
    ['a colour escape', '\u001b[31m'],
    ['a bell', '\u0007'],
    ['a title sequence', '\u001b]0;x\u0007'],
    ['a C1 control', '\u0085'],
  ];
  for (const [name, x] of SPLITS)
    it.each(SAMPLES)(`%s, split by ${name} after its third character and in its body`, (_src, sample) => {
      const s = secretOf(sample);
      const at = sample.length - s.length;
      const split = `${sample.slice(0, at + 3)}${x}${sample.slice(at + 3, at + 14)}${x}${sample.slice(at + 14)}`;
      expect(shows(scrubSecrets(`see ${split} now`), sample)).toBe(false);
    });
  it.each(SAMPLES.filter(([src]) => !src.startsWith('(')))('%s, after a colour escape that ends on a letter', (_src, sample) => {
    expect(shows(scrubSecrets(`x\u001b[1m${sample}`), sample)).toBe(false);
  });
  it('a webhook keeps its address and hides its secret', () => {
    expect(scrubSecrets(`post to ${SLACK_HOOK}${A20}Ab12 now`)).toBe(`post to ${SLACK_HOOK}[hidden] now`);
    expect(scrubSecrets(`${DISCORD_HOOK}${A20}${A20}${A20}`)).toBe(`${DISCORD_HOOK}[hidden]`);
  });
  it.each([
    ['inside services', `https://hooks.slack.com/ser\u200bvices/T0ABCDEF1/B0ABCDEF2/${A20}Ab12`],
    ['inside hooks', `https://ho\u200boks.slack.com/services/T0ABCDEF1/B0ABCDEF2/${A20}Ab12`],
    ['after the T', `https://hooks.slack.com/services/T\u001b[1m0ABCDEF1/B0ABCDEF2/${A20}Ab12`],
    ['before the B', `https://hooks.slack.com/services/T0ABCDEF1/\u0007B0ABCDEF2/${A20}Ab12`],
    ['inside webhooks', `https://discord.com/api/web\u200bhooks/123456789012345678/${A20}${A20}${A20}`],
    ['inside discordapp', `https://discord\u200bapp.com/api/webhooks/123456789012345678/${A20}${A20}${A20}`],
  ])('a webhook with what a reader cannot see %s keeps no secret', (_name, s) => {
    expect(shows(scrubSecrets(s), `${A20}Ab12`)).toBe(false);
  });
  it('a Slack webhook with team and channel ids longer than 40 characters is hidden', () => {
    const long = 'A'.repeat(41);
    expect(scrubSecrets(`https://hooks.slack.com/services/T${long}/B${long}/${A20}Ab12 now`)).toBe(
      `https://hooks.slack.com/services/T${long}/B${long}/[hidden] now`,
    );
  });
  it('a Discord webhook id longer than its rule allows is no webhook, as in Logs', () => {
    const s = `https://discord.com/api/webhooks/${'1'.repeat(26)}/${A20}${A20}${A20}`;
    expect(new RegExp(Object.keys(TOKEN_RULES).find((k) => k.startsWith('(discord')) as string).test(s)).toBe(false);
    expect(scrubSecrets(s)).toBe(s);
  });
  it.each([21, 40, 2000])('a Slack app token with a %i-digit part is hidden', (n) => {
    const tok = `xapp-1-A-${'1'.repeat(n)}-${A20}`;
    expect(new RegExp(Object.keys(TOKEN_RULES).find((k) => k.startsWith('xapp')) as string).test(tok)).toBe(true);
    expect(scrubSecrets(`app ${tok} end`)).toBe('app [hidden] end');
  });
  it('a token longer than its shortest form is hidden whole', () => {
    expect(scrubSecrets(`ghp_${A36}${A36} end`)).toBe('[hidden] end');
    expect(scrubSecrets(`github_pat_${A20}_${A20}_${A20} end`)).toBe('[hidden] end');
  });
  it('a key whose tail is a token of another family is hidden whole, its start with it', () => {
    for (const sep of ['-', '_']) expect(scrubSecrets(fake('bad key sk', sep, '12345678_hf_', A20))).toBe('bad key [hidden]');
    expect(scrubSecrets(fake('x_sk-1234_hf_', A20, ' end'))).toBe('x_[hidden] end');
    expect(scrubSecrets(fake('sk-1\u0007234_hf_', A20))).toBe('[hidden]');
    // A word glued to a token is no key's start: it keeps its letters.
    expect(scrubSecrets(fake('robot_hf_', A20))).toBe('robot_[hidden]');
    expect(scrubSecrets(fake('bot_hf_', A20))).toBe('bot_[hidden]');
  });
  // Every family marker, not only hf_: each family's token as the tail of a longer key, after each form of key start.
  const TAILS = [...Object.values(TOKEN_RULES).filter((v) => !/^(?:sk-|eyJ|https:)/.test(v)), fake('ak-', A20), fake('rk-', A20)];
  it.each(TAILS)('a key whose tail is %s is hidden whole, its start with it', (tail) => {
    for (const start of ['sk-12345678_', 'sk_12345678_', 'sk-12345678-']) expect(scrubSecrets(fake('bad key ', start, tail, ' end'))).toBe('bad key [hidden] end');
    expect(scrubSecrets(fake('x_sk-1234_', tail, ' end'))).toBe('x_[hidden] end');
  });
  it('a token followed by a run as long as a reader allows is hidden whole, in every engine (no pattern repeats past a fixed count)', () => {
    const tail = 'a'.repeat(39000);
    for (const head of [`ghp_${A36}`, `github_pat_${A20}AB`, `hbk_${A20}`, `glpat-${A20}`, `hf_${A20}`])
      expect(scrubSecrets(`${head}${tail}`), head).toBe('[hidden]');
  });
});

describe('a JWT', () => {
  it('in an address keeps the address around it', () => {
    expect(scrubSecrets(`https://x.example/cb?t=${JWT}&a=1`)).toBe('https://x.example/cb?t=[hidden]&a=1');
  });
  it('after a dash, and after a dot part of no token, is hidden', () => {
    expect(scrubSecrets(`a-${JWT}`)).toBe('a-[hidden]');
    expect(scrubSecrets(`id.${JWT}`)).toBe('id.[hidden]');
  });
  it('a second eyJ in the first part does not hide a token the first one starts', () => {
    expect(scrubSecrets('eyJabcdefghijeyJ.abcdefghijk.abcdefghijk end')).toBe('[hidden] end');
  });
  it('two tokens on one line both hide', () => {
    expect(scrubSecrets(`${JWT} and ${JWT}`)).toBe('[hidden] and [hidden]');
  });
  it.each([
    ['the prefix in prose', 'the eyJ prefix is base64 for {"'],
    ['a part one short', 'eyJabcdefghi.abcdefghijk.abcdefghijk'],
    ['a middle part one short', 'eyJabcdefghij.abcdefghi.abcdefghijk'],
    ['a last part one short', 'eyJabcdefghij.abcdefghijk.abcdefghi'],
    ['two parts only', 'eyJabcdefghij.abcdefghijk'],
  ])('%s shows', (_name, s) => {
    expect(scrubSecrets(s)).toBe(s);
  });
});

describe('a private key block', () => {
  const BLOCK = '-----BEGIN OPENSSH PRIVATE\x20KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nQyNTUxOQAAACB\n-----END OPENSSH PRIVATE KEY-----';
  it('is hidden from its first line to its last, the text around it kept', () => {
    expect(scrubSecrets(`key:\n${BLOCK}\ndone`)).toBe('key:\n[hidden]\ndone');
  });
  it('with no last line, a short last line of base64 alone after the body is hidden too; after a blank line it shows', () => {
    expect(scrubSecrets('key:\n-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\nmore')).toBe('key:\n[hidden]');
    expect(scrubSecrets('key:\n-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\nQ2Zh==\n\nDone')).toBe('key:\n[hidden]\n\nDone');
  });
  it.each([
    ['before its words', '-----BEGIN \u200bRSA PRIVATE KEY-----'],
    ['between its words', '-----BEGIN RSA \u200bPRIVATE \u200bKEY\u200b-----'],
  ])('with a zero-width space %s in its first line is still hidden', (_name, head) => {
    expect(scrubSecrets(`${head}\nMIIEowIBAAKCAQEA`)).toBe('[hidden]');
  });
  it('two blocks hide apart, the text between them kept', () => {
    expect(scrubSecrets(`${BLOCK}\nbetween\n${BLOCK}`)).toBe('[hidden]\nbetween\n[hidden]');
  });
  it('with a zero-width space in its first line is still hidden', () => {
    expect(scrubSecrets('-----BEGIN PRIV\u200bATE KEY-----\nMIIEowIBAAKCAQEA')).toBe('[hidden]');
  });
  it.each([81, 400])('with a %i-character label is hidden', (n) => {
    expect(scrubSecrets(`a\n-----BEGIN ${'A'.repeat(n)} PRIVATE KEY-----\nMIIEow\n-----END ${'A'.repeat(n)} PRIVATE KEY-----\nz`)).toBe('a\n[hidden]\nz');
  });
  it.each([40000, 40001, 60000])('with a %i-character label on either line, past the long-run bound, is still read', (n) => {
    const label = 'A'.repeat(n);
    expect(scrubSecrets(`a\n-----BEGIN ${label} PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nz`)).toBe('a\n[hidden]\nz');
    expect(scrubSecrets(`a\n-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\n-----END ${label} PRIVATE KEY-----\nafter`)).toBe('a\n[hidden]\nafter');
  });
  it.each([40000, 60000])('with an escape inside a line only a reader shows and a %i-character label, is still hidden', (n) => {
    const label = 'A'.repeat(n);
    const esc = '\u001bPstuff\u0007';
    const begin = scrubSecrets(`a\n-----BE${esc}GIN ${label} PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nz`);
    expect(begin).not.toContain('MIIEow');
    expect(begin).toContain('z');
    const end = scrubSecrets(`a\n-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\n-----E${esc}ND ${label} PRIVATE KEY-----\nafter`);
    expect(end).not.toContain('MIIEow');
    expect(end).toContain('after');
    const csi = scrubSecrets(`-----BEGIN\u001b[0m ${label} PRIVATE KEY-----\nMIIEowIBAAKCAQEA`);
    expect(csi).not.toContain('MIIEow');
  });
  it('a long label on its last line still ends it: the text after it shows', () => {
    expect(scrubSecrets(`-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEow\n-----END ${'A'.repeat(81)} PRIVATE KEY-----\nafter`)).toBe('[hidden]\nafter');
  });
  it('an end line that is no key line does not end it: with no last line, the block ends after its body', () => {
    expect(scrubSecrets('-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\n-----END CERTIFICATE-----\nMIIBkey')).toBe(
      '[hidden]\n-----END CERTIFICATE-----\nMIIBkey',
    );
    expect(scrubSecrets('-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\n-----END CERTIFICATE-----\n-----END RSA PRIVATE KEY-----\nz')).toBe(
      '[hidden]\nz',
    );
  });
  it.each([
    [
      'a first line quoted in prose',
      'To add a deploy key, paste the file that starts with -----BEGIN OPENSSH PRIVATE\x20KEY----- into the box.\n\nThen click Save. Your repo will now accept pushes.',
      'To add a deploy key, paste the file that starts with [hidden] into the box.\n\nThen click Save. Your repo will now accept pushes.',
    ],
    [
      'a first line in crypto source',
      'if (s.startsWith("-----BEGIN RSA PRIVATE\x20KEY-----")) {\n  return parsePkcs1(s);\n}\nfunction other() { return 1; }',
      'if (s.startsWith("[hidden]")) {\n  return parsePkcs1(s);\n}\nfunction other() { return 1; }',
    ],
    [
      'a first line in backticks',
      'Your key file starts with `-----BEGIN OPENSSH PRIVATE\x20KEY-----`.\n\nNext, run ssh-add.',
      'Your key file starts with `[hidden]`.\n\nNext, run ssh-add.',
    ],
  ])('with no last line, %s hides alone and the text after it shows', (_name, s, want) => {
    expect(scrubSecrets(s)).toBe(want);
  });
  it.each([
    ['its body', '-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\r\n  b3BlbnNzaC1rZXk=\n\nThe key above is cut.', '[hidden]\n\nThe key above is cut.'],
    [
      'an encrypted key\'s headers and body',
      '-----BEGIN RSA PRIVATE\x20KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,0A1B\n\nMIIEowIBAAKCAQEA\nend of paste',
      '[hidden]\nend of paste',
    ],
    ['its body on its first line', '-----BEGIN PRIVATE\x20KEY----- MIIEowIBAAKCAQEA\nnext.', '[hidden]\nnext.'],
    ['its body, then words', '-----BEGIN PRIVATE\x20KEY-----\nMIIEowIBAAKCAQEA\nsee the docs', '[hidden]\nsee the docs'],
    ['a body split by a zero-width space', '-----BEGIN PRIVATE\x20KEY-----\nMIIE\u200bowIBAAKCAQEA\nnext.', '[hidden]\nnext.'],
  ])('with no last line, %s is hidden', (_name, s, want) => {
    expect(scrubSecrets(s)).toBe(want);
  });
  describe('with no last line, a body in any shape a reader reads as key lines is hidden', () => {
    const B1 = 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW';
    const B2 = 'QyNTUxOQAAACDx2nFwlZ1n0bm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZWQyNTUxOQAAAC';
    const SECRET = [B1.slice(8, 40), B2.slice(8, 40)];
    it.each([
      ['read_file line numbers', `1\t-----BEGIN OPENSSH PRIVATE\x20KEY-----\n2\t${B1}\n3\t${B2}`],
      ['cat -n line numbers', `     1\t-----BEGIN OPENSSH PRIVATE\x20KEY-----\n     2\t${B1}\n     3\t${B2}\n`],
      ['a cut JSON string with escaped line breaks', `{"private_key": "-----BEGIN PRIVATE\x20KEY-----\\n${B1}\\n${B2}\\n`],
      ['lines joined by spaces', `-----BEGIN RSA PRIVATE\x20KEY----- ${B1} ${B2}`],
      ['lines joined by tabs', `-----BEGIN RSA PRIVATE\x20KEY-----\t${B1}\t${B2}`],
      ['lines joined by U+2028', `-----BEGIN RSA PRIVATE\x20KEY-----\u2028${B1}\u2028${B2}`],
      ['lines joined by a bare CR', `-----BEGIN RSA PRIVATE\x20KEY-----\r${B1}\r${B2}`],
      ['quoted lines', `> -----BEGIN RSA PRIVATE\x20KEY-----\n> ${B1}\n> ${B2}`],
      ['lines in a source string', `  "-----BEGIN RSA PRIVATE\x20KEY-----\\n" +\n  "${B1}\\n" +\n  "${B2}\\n"`],
      ['removed diff lines', `- -----BEGIN RSA PRIVATE\x20KEY-----\n- ${B1}\n- ${B2}`],
      ['a blank line after the first line', `-----BEGIN RSA PRIVATE\x20KEY-----\n\n${B1}\n${B2}`],
      ['double spacing', `-----BEGIN RSA PRIVATE\x20KEY-----\n${B1}\n\n${B2}\n\n`],
      ['double spacing with CRLF', `-----BEGIN RSA PRIVATE\x20KEY-----\r\n\r\n${B1}\r\n\r\n${B2}`],
      ['a space inside a body line', `-----BEGIN RSA PRIVATE\x20KEY-----\n${B1.slice(0, 20)} ${B1.slice(20)}\n${B2}`],
      ['a cut last line', `-----BEGIN RSA PRIVATE\x20KEY-----\n${B1}\n${B2.slice(0, 40)}... [truncated]`],
      ['CRLF headers of an encrypted key', `-----BEGIN RSA PRIVATE\x20KEY-----\r\nProc-Type: 4,ENCRYPTED\r\nDEK-Info: AES-128-CBC,0A1B\r\n\r\n${B1}\r\n${B2}`],
      ['an answer still streaming', `Here is the key:\n\n\`\`\`\n-----BEGIN OPENSSH PRIVATE\x20KEY-----\n${B1}\n${B2.slice(0, 50)}`],
      ['an answer still streaming its first body line', `-----BEGIN PRIVATE\x20KEY-----\n${B1.slice(0, 15)}`],
      ['a short first body line after a blank line', `-----BEGIN PRIVATE\x20KEY-----\n\n${B1.slice(0, 15)}`],
    ])('%s', (_name, s) => {
      const out = scrubSecrets(s);
      for (const part of SECRET) expect(shownText(out)).not.toContain(part.slice(0, 16));
      for (const part of SECRET) expect(shownText(out)).not.toContain(part.slice(16));
      expect(shownText(out)).not.toContain(B1.slice(0, 12));
    });
    it('the text after the body still shows', () => {
      expect(scrubSecrets(`1\t-----BEGIN OPENSSH PRIVATE\x20KEY-----\n2\t${B1}\n3\t${B2}\n\nThe file is cut here.`)).toBe(
        '1\t[hidden]\n\nThe file is cut here.',
      );
    });
  });
  it.each([
    ['_hf_', 'Ab12Cd34Ef56_hf_Gh78Ij90Kl12Mn34Op56-Qr78St90Uv12Wx34Yz56Ab12Cd34Ef56Gh'],
    ['-ak-', 'Ab12Cd34Ef56Gh78Ij90-ak-Kl12Mn34Op56Qr78St90_Uv12Wx34Yz56Ab12Cd34Ef56'],
  ])('a Discord webhook secret holding %s is hidden whole', (_name, secret) => {
    expect(scrubSecrets(`${DISCORD_HOOK}${secret} end`)).toBe(`${DISCORD_HOOK}[hidden] end`);
  });
  it('a public key shows', () => {
    const pub = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq\n-----END PUBLIC KEY-----';
    expect(scrubSecrets(pub)).toBe(pub);
  });
});

describe('what only looks like a token shows', () => {
  it.each([
    ['a GitHub token one short', `ghp_${A36.slice(0, 35)}`],
    ['a fine-grained token one short', `github_pat_${A20}A`],
    ['an AWS key one short', 'AKIAIOSFODNN7EXAMPL'],
    ['an AWS key one long', fake('AKIA', 'IOSFODNN7EXAMPLEX')],
    ['an npm token one short', `npm_${A36.slice(0, 35)}`],
    ['a Twilio key one short', `SK${HEX32.slice(0, 31)}`],
    ['a commit hash', 'commit 3e35d484ce461948cc5241f954d8d555b9e611a3'],
    ['a sentence', 'Maintenance is scheduled. Monday-through-Friday.'],
    ['a short dash name', 'pk-short'],
    // Accepted gap: a token glued to a letter is not looked for, as kebab and camel names would match.
    ['a GitHub token glued to a letter', `xghp_${A36}`],
  ])('%s', (_name, s) => {
    expect(scrubSecrets(s)).toBe(s);
  });
});

describe('a hostile string cannot stall the new families', () => {
  const LONG = 400000;
  const SHORT = 1000;
  const HEADS = ['ghp_', 'github_pat_', 'hdy_a', 'AKIA', 'SG.', 'SK', 'xapp-1-a-', 'bot1', 'Ma', 'eyJ-', 'eyJ_', 'eyJa.', 'x.', 'hooks.slack.com/services/TAAAAAA/BAAAAAA/', '-----BEGIN PRIVATE\x20KEY-----', '-----BEGIN '];
  const CASES: Array<readonly [string, string]> = [];
  for (const h of HEADS) {
    CASES.push([`${h} repeated`, h.repeat(Math.ceil(LONG / h.length))]);
    CASES.push([`${h} with a gap after each`, `${h}\u200b`.repeat(Math.ceil(LONG / (h.length + 1)))]);
    CASES.push([`${h} with a colour escape after each`, `${h}\u001b[1m`.repeat(Math.ceil(LONG / (h.length + 4)))]);
    CASES.push([`${h} with a long gap after each`, `${h}${'\u200b'.repeat(SHORT)}`.repeat(Math.ceil(LONG / SHORT))]);
    CASES.push([`${h} with a space after each`, `${h} `.repeat(Math.ceil(LONG / (h.length + 1)))]);
  }
  CASES.push(['eyJ parts one short of a token', 'eyJabcdefghi.abcdefghijk.'.repeat(LONG / 25)]);
  CASES.push(['a private key header with no end, then key-like text', `-----BEGIN PRIVATE\x20KEY-----\n${'MIIEow\n'.repeat(LONG / 7)}`]);
  CASES.push(['a first line with no end, then body lines', `-----BEGIN PRIVATE\x20KEY-----\n${'MIIEowIBAAKCAQEA\n'.repeat(LONG / 17)}`]);
  // A first line hidden in an OSC reads as blank, so each one begins a block over the same blank run. The
  // text ends in a line that is not base64 alone, so no block runs to the end and each first line is tried (mutant dead-range-point).
  CASES.push(['first lines hidden in an OSC, one per line', `${'\u001b]-----BEGIN PRIVATE\x20KEY-----\u0007\n'.repeat(LONG / 32)}end.`]);
  CASES.push(['first lines hidden in an OSC ended by ST, one per line', `${'\u001b]-----BEGIN PRIVATE\x20KEY-----\u001b\\\n'.repeat(LONG / 33)}end.`]);
  CASES.push(['first lines hidden in an OSC, with blank lines between', `${'\u001b]-----BEGIN PRIVATE\x20KEY-----\u001b\\\n\n'.repeat(LONG / 34)}end.`]);
  CASES.push(['a line of first lines, then blank lines and no body', `${'-----BEGIN PRIVATE\x20KEY-----'.repeat(1444)}${'\n'.repeat(LONG - 39000)}x`]);
  CASES.push(['a first line with no end, then blank lines and no body', `-----BEGIN PRIVATE\x20KEY-----${'\n'.repeat(LONG)}x`]);
  CASES.push(['first lines on one line, each with short base64 runs', `-----BEGIN PRIVATE\x20KEY----- ${'abcdefghijklmno '.repeat(SHORT / 16)}`.repeat(LONG / SHORT)]);
  CASES.push(['first lines, each followed by blank lines and a line with no body', '-----BEGIN PRIVATE\x20KEY-----\n\n\n\nx -----BEGIN PRIVATE\x20KEY----- y\n'.repeat(LONG / 64)]);
  CASES.push(['key lines with long labels that are no key line', `-----BEGIN ${'A '.repeat(SHORT)}-----\n`.repeat(LONG / (2 * SHORT))]);
  CASES.push(['a key block, then end lines that are no key line', `-----BEGIN PRIVATE\x20KEY-----\n${`-----END ${'A'.repeat(SHORT)}\n`.repeat(LONG / SHORT)}`]);
  CASES.push(['Slack app tokens one dash short', `xapp-1-a-${'1'.repeat(SHORT)} `.repeat(LONG / SHORT)]);
  CASES.push(['Slack webhooks with no secret', `hooks.slack.com/services/T${'A'.repeat(SHORT)}/B`.repeat(LONG / SHORT)]);
  // Runs under the long-run bound, joined by line breaks and spaces, so the JWT, family and webhook scans read every one of them
  // rather than hideLongRuns hiding the whole.
  const RUN = 39000;
  const runs = (unit: string, sep: string) => `${unit.repeat(Math.floor(RUN / unit.length))}${sep}`.repeat(Math.ceil(LONG / RUN));
  const units = [...HEADS, 'eyJabcdefghi.abcdefghijk.', `hooks.slack.com/services/T${'A'.repeat(SHORT)}/B`, `xapp-1-a-${'1'.repeat(SHORT)}`];
  units.forEach((h, i) => {
    for (const [sep, name] of [['\n', 'line breaks'], [' ', 'spaces'], ['\n\n', 'blank lines']] as const)
      CASES.push([`unit ${i} (${h.slice(0, 24)}) in runs between ${name}`, runs(h, sep)]);
  });
  CASES.push(['first lines with no body, then prose', '-----BEGIN PRIVATE\x20KEY----- x\n'.repeat(LONG / 31)]);
  CASES.push(['first lines on one line, each with a long base64 run', `-----BEGIN PRIVATE\x20KEY-----${'A'.repeat(SHORT)}-`.repeat(LONG / SHORT)]);
  CASES.push(['a first line, then encrypted-key headers', `-----BEGIN PRIVATE\x20KEY-----\n${'Proc-Type: 4\n'.repeat(LONG / 13)}`]);
  CASES.push(['first lines with no body, then end lines that are no key line', '-----BEGIN PRIVATE\x20KEY-----\n-----END A-----\n'.repeat(LONG / 44)]);
  // A marker is read back to the start of the run before it (a key whose tail another family hid).
  CASES.push(['key starts glued to markers, in runs between line breaks', runs('x_sk-1_[hidden]', '\n')]);
  it.each(CASES)('%s', (_name, s) => {
    expect(() => runInNewContext('f(s)', { f: scrubSecrets, s }, { timeout: 6000 })).not.toThrow();
  });
});
