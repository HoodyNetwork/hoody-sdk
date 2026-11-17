// Vitest: scrubSecrets finds a key however it will be shown. What a reader cannot see may sit inside the
// key or right before it; the text around a key keeps its bytes.
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { stripAnsi } from '../data/highlight';
import { clean, replyModel, scrubSecrets, shownText } from './code';

const TAIL = '0123456789abcdef';
const SEPARATORS: ReadonlyArray<readonly [string, string]> = [
  ['a bell', '\u0007'],
  ['a C1 control', '\u0085'],
  ['a lone escape', '\u001b'],
  ['a colour escape', '\u001b[31m'],
  ['a reset escape', '\u001b[0m'],
  ['a title sequence', '\u001b]0;x\u0007'],
  ['a zero-width space', '\u200b'],
  ['a word joiner', '\u2060'],
  ['a byte order mark', '\ufeff'],
  ['a soft hyphen', '\u00ad'],
  ['a bidi override', '\u202e'],
  ['a variation selector', '\ufe0f'],
  ['a combining grapheme joiner', '\u034f'],
  ['a combining mark', '\u0301'],
  ['an invisible Khmer vowel', '\u17b4'],
  ['a Hangul filler', '\u3164'],
  ['a blank braille cell', '\u2800'],
  ['a tag character', '\u{e0001}'],
  ['an unassigned character', '\u0378'],
  ['a private-use character', '\ue000'],
];

describe.each(SEPARATORS)('a key with %s', (_name, x) => {
  // A lone ESC right before the marker goes: `ESC [hidden]` reads as the
  // sequence `ESC [ h` and a reader eats the marker's start. Every other byte around a key stays.
  const kept = x === '\u001b' ? '' : x;
  it.each([
    ['inside the body', `a sk-live${x}${TAIL} b`, 'a [hidden] b'],
    ['inside the prefix', `a s${x}k-live${TAIL} b`, 'a [hidden] b'],
    ['after the dash', `a sk-${x}live${TAIL} b`, 'a [hidden] b'],
    ['inside a Slack prefix', `a xo${x}xb-${TAIL} b`, 'a [hidden] b'],
    ['inside a bot prefix', `a b${x}ot_${TAIL} b`, 'a [hidden] b'],
    ['inside a chat-bot id', `t 12345${x}6789:${'a'.repeat(32)} b`, 't [hidden] b'],
    ['after a chat-bot colon', `t 123456789:${x}${'a'.repeat(32)} b`, 't [hidden] b'],
    ['before a chat-bot colon', `t 123456789${x}:${'a'.repeat(32)} b`, 't [hidden] b'],
    ['before it, right after an underscore', `failed_${x}sk-live${TAIL} b`, `failed_${kept}[hidden] b`],
    ['before it, right after a word', `note${x}sk-live${TAIL} b`, `note${kept}[hidden] b`],
    ['before it and inside it', `note${x}sk-live${x}${TAIL} b`, `note${kept}[hidden] b`],
  ])('%s', (_where, text, want) => {
    expect(scrubSecrets(text)).toBe(want);
  });
});

describe('scrubSecrets', () => {
  // A key whose tail is a token of another family (-ak-): its start goes with the family's marker, never left showing.
  it('a key whose tail is another family\'s token is hidden whole', () => {
    expect(scrubSecrets(['bad key sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90'].join(''))).toBe('bad key [hidden]');
  });
  it.each([
    ['a word ending in a prefix', 'task-management-system-x'],
    ['a longer one', 'desk_lamp_controller_v2'],
    ['a word ending in bot', 'robot-arm-control-unit'],
    ['a short key shape', 'sk-short'],
    ['a short token shape', '12345:abc'],
    ['colours and no key', 'done \u001b[32mok\u001b[0m'],
    ['a joined emoji', 'family \u{1F468}\u200d\u{1F469}\u200d\u{1F467} here'],
    ['an accent beside a long word', 'cafe\u0301 risk-assessment-long-name'],
    ['a key split by a real space', `sk live${TAIL}`],
    ['a key split by a newline', 'sk-live0123\n456789abcdefgh'],
    ['a key split by a tab', 'sk-live0123\t456789abcdefgh'],
    ['right-to-left marks', '\u200fhello\u200e world \u202bשלום\u202c'],
    ['Arabic with marks', 'م\u064eر\u0652ح\u064eب\u064bا sk-short'],
    ['Chinese and Japanese', '密钥 sk-短い bot-日本語のテキストです'],
    ['a key shape cut by Chinese', 'sk-abcdef密钥0123456789'],
    ['soft-hyphenated words', 'in\u00adter\u00adna\u00adtion\u00adal con\u00adtrol'],
    ['a soft hyphen before a short suffix', 'a\u00adsk-now'],
    ['colours around a word', '\u001b[1;31mERROR\u001b[0m: \u001b[33mdisk-full\u001b[0m'],
    ['a title sequence and no key', '\u001b]0;build\u0007done'],
    ['an emoji with its selector', 'ok ❤\ufe0f and \u{1F44D}\u{1F3FD}'],
  ])('leaves %s byte for byte', (_name, text) => {
    expect(scrubSecrets(text)).toBe(text);
  });

  it.each([
    ['an escape that reads as swallowing a letter', `s\u001bk-live${TAIL}`],
    ['a control sequence that reads as swallowing the prefix', `\u001b[sk-live${TAIL}`],
    ['an unterminated title holding the key', `before \u001b]sk-live${TAIL} after`],
    ['a C1 sequence before the key', `\u009bsk-live${TAIL}`],
  ])('hides %s', (_name, text) => {
    const out = scrubSecrets(text);
    expect(out).toContain('[hidden]');
    expect(out).not.toContain(TAIL);
  });

  it('hides each of two keys and keeps what is between them', () => {
    expect(scrubSecrets(`a sk-live${TAIL} b hk\u200b_${TAIL} c`)).toBe('a [hidden] b [hidden] c');
  });

  it('hides whole keys', () => {
    expect(scrubSecrets('use sk-abcdefghijklmnop now')).toBe('use [hidden] now');
    expect(scrubSecrets('123456789:FAKEtokenFAKEtoken_FAKEtokenFAKE000')).toBe('[hidden]');
  });

  it.each([
    ['colour before the key, right after a word', `note\u001b[0msk-live${TAIL} b`, 'note\u001b[0m[hidden] b'],
    ['a key in colour', `\u001b[31msk-live${TAIL}\u001b[0m b`, '\u001b[31m[hidden]\u001b[0m b'],
    ['a two-byte escape before the key', `note\u001bmsk-live${TAIL} b`, 'note\u001bm[hidden] b'],
    ['a chat-bot token after colour', `note\u001b[0m123456789:${'a'.repeat(32)} b`, 'note\u001b[0m[hidden] b'],
    ['marks, right-to-left text and Chinese around a key', `\u200fשלום\u200f 密钥 sk-live${TAIL} 密钥 cafe\u0301`, '\u200fשלום\u200f 密钥 [hidden] 密钥 cafe\u0301'],
    ['a joined emoji beside a key', `\u{1F468}\u200d\u{1F469} sk-live${TAIL} \u{1F468}\u200d\u{1F469}`, '\u{1F468}\u200d\u{1F469} [hidden] \u{1F468}\u200d\u{1F469}'],
  ])('keeps the bytes around %s', (_name, text, want) => {
    expect(scrubSecrets(text)).toBe(want);
  });

  // The readers differ here: the cleaner ends an open title sequence at the line, the terminal reader runs on to its terminator.
  it('a title sequence that ends at a line for one reader and not the other hides what either shows', () => {
    expect(scrubSecrets(`sk-live\u001b]0;x\n${TAIL}`)).toBe(`sk-live\u001b]0;x\n${TAIL}`);
    expect(scrubSecrets(`sk-live\u001b]0;x\ny\u0007${TAIL}`)).toBe('[hidden]');
    expect(scrubSecrets(`\u001b[31mok\u001b[0m sk-live\u001b]0;x\ny\u0007${TAIL}`)).toBe('ok [hidden]');
  });

  it('a key ends at its last word character, so a closing dash stays, as before', () => {
    expect(scrubSecrets(`a sk-live${TAIL}- b`)).toBe('a [hidden]- b');
  });

  it.each([
    ['an API key', `failed_sk-live${TAIL}`, 'failed_[hidden]'],
    ['another prefix', `failed_hk-live${TAIL} b`, 'failed_[hidden] b'],
    ['a bot key', `failed_bot-live${TAIL}`, 'failed_[hidden]'],
    ['a Slack token', `failed_xoxb-${TAIL}`, 'failed_[hidden]'],
    ['a key split inside', `failed_sk-live\u200b${TAIL}`, 'failed_[hidden]'],
    ['a key split before its dash', `failed_sk\u200b-live${TAIL}`, 'failed_[hidden]'],
  ])('a dash-form key glued to a word by an underscore is hidden: %s', (_name, text, want) => {
    expect(scrubSecrets(text)).toBe(want);
  });

  it.each([
    ['the underscore form', 'run_bot_configuration_file'],
    ['the underscore form of a key prefix', `failed_sk_live${TAIL}`],
    ['a short dash form', 'task_sk-short'],
    ['a dash form glued with no underscore', `tasksk-live${TAIL}`],
    ['a prefix inside a word after the underscore', `failed_ask-live${TAIL}`],
  ])('leaves %s after an underscore byte for byte', (_name, text) => {
    expect(scrubSecrets(text)).toBe(text);
  });

  it('two keys on one line, one whole and one split, both hide', () => {
    expect(scrubSecrets(`a sk-live${TAIL} b sk-\u200blive${TAIL} c`)).toBe('a [hidden] b [hidden] c');
  });

  it('a key split and straight after a word hides', () => {
    expect(scrubSecrets(`note\u200bs\u200bk-live${TAIL} c`)).toBe('note\u200b[hidden] c');
  });
});

describe('shownText', () => {
  it('takes out everything the key patterns read past, and nothing else', () => {
    for (const [, x] of SEPARATORS) if (x !== '\u001b') expect(shownText(`a${x}b`)).toBe('ab');
    expect(shownText('a\u001b[1;31mb\u001bc')).toBe('ab');
    expect(shownText('a\u001b7b\u001b(Bc\u009b0md')).toBe('abcd');
    expect(shownText('a\u000db\u000d\u000ac')).toBe('a\u000ab\u000ac');
    expect(shownText('tab\tline\nspace \u00a0密钥 \u{1F44D}')).toBe('tab\tline\nspace \u00a0密钥 \u{1F44D}');
  });
});

// The pattern reads colour and title sequences; every other escape form is read by the two readers themselves.
describe('a key only a reader shows', () => {
  const KEYS = `sk-live${TAIL}`;
  it.each([
    ['a two-byte escape inside it', `s\u001b7k-live${TAIL}`],
    ['a two-byte escape straight before it', `\u001b7${KEYS}`],
    ['a reset escape straight before it', `\u001bc${KEYS}`],
    ['a charset escape inside it', `s\u001b(Bk-live${TAIL}`],
    ['a C1 colour straight before it', `\u009b0m${KEYS}`],
    ['a C1 colour inside it', `s\u009b0mk-live${TAIL}`],
    ['an application string inside it', `s\u001b_x\u001b\\k-live${TAIL}`],
    ['a device string inside it', `s\u001bPx\u001b\\k-live${TAIL}`],
    ['a privacy string inside it', `s\u001b^x\u0007k-live${TAIL}`],
    ['a start-of-string inside it', `s\u001bXx\u0007k-live${TAIL}`],
    ['a C1 title string inside it, read only as terminal text', `s\u009dx\u0007k-live${TAIL}`],
    ['an open string cut at the line, read only by the cleaner', `\u001b]x\ns\u001b7k-live${TAIL}`],
    ['a chat-bot token split by a two-byte escape', `123456\u001b7789:${'a'.repeat(32)}`],
  ])('%s: hidden in every reading, and stable', (_name, text) => {
    const out = scrubSecrets(text);
    expect(out).toContain('[hidden]');
    expect(stripAnsi(out)).toContain('[hidden]');
    expect(clean(out).text).toContain('[hidden]');
    expect(`${out} ${stripAnsi(out)} ${clean(out).text}`).not.toMatch(/live0123|aaaaaaaa/);
    expect(scrubSecrets(out)).toBe(out);
  });

  it.each([
    ['a two-byte escape', '\u001b7'],
    ['a reset escape', '\u001bc'],
    ['a charset escape', '\u001b(B'],
    ['a C1 colour', '\u009b0m'],
  ])('straight after a word and %s: hidden with the bytes beside it kept', (_name, x) => {
    expect(scrubSecrets(`\u001b[31mnote${x}sk-live${TAIL} end`)).toBe(`\u001b[31mnote${x}[hidden] end`);
  });

  it('comes back as the reading: the text beside it stays, without its colours', () => {
    expect(scrubSecrets(`\u001b[31mok\u001b[0m s\u001b7k-live${TAIL} done`)).toBe('ok [hidden] done');
  });

  it('a key the pattern reads keeps the colours beside it', () => {
    expect(scrubSecrets(`\u001b[31mok\u001b[0m s\u001b[0mk-live${TAIL} done`)).toBe('\u001b[31mok\u001b[0m [hidden] done');
  });

  it.each([
    ['two-byte escapes', '\u001b7done\u001b8 ok'],
    ['C1 colours', '\u009b31mok\u009b0m'],
    ['an open title sequence', 'done \u001b]0;half a title'],
    ['a charset escape', '\u001b(Bplain text'],
  ])('text with %s and no key keeps its bytes', (_name, text) => {
    expect(scrubSecrets(text)).toBe(text);
  });
});

describe('a chat-bot token after an underscore', () => {
  const BODY = 'AAEhBOweik6ad9r_QXMENQjcrLI3k6j2Mh4';
  it.each([
    ['whole', `failed_123456789:${BODY}`],
    ['split by what a reader cannot see', `failed_1234\u200b56789:\u200b${BODY}`],
  ])('%s: hidden, the word before it kept', (_name, text) => {
    expect(scrubSecrets(text)).toBe('failed_[hidden]');
  });
  it.each([
    ['too short a body', `failed_123456789:${'a'.repeat(29)}`],
    ['too short an id', `failed_12345:${BODY}`],
    ['no colon', `failed_123456789_${BODY}`],
    ['a digit name in snake case', 'run_123456_configuration_file'],
  ])('%s stays', (_name, text) => {
    expect(scrubSecrets(text)).toBe(text);
  });
});

describe('a reply cleaned for showing', () => {
  it.each([['a bell', '\u0007'], ['a reset escape', '\u001b[0m'], ['a bidi override', '\u202e']])('a key after a word and %s stays hidden', (_name, x) => {
    const shown = replyModel(`note${x}sk-live${TAIL} end`).segs.map((g) => g.s).join('');
    expect(shown).toContain('[hidden]');
    expect(shown).not.toContain(TAIL);
  });
  it('anything but a string is an empty reply', () => {
    expect(replyModel(undefined).segs.map((g) => g.s).join('')).toBe('');
  });
});

describe('a line break ends what is read together', () => {
  it.each([
    ['a CR', 'bot-starting\u000dbot-complete'],
    ['a CRLF', 'bot-starting\u000d\u000abot-complete'],
    ['a CR with an escape after it', 'bot-starting\u000d\u001b[0mbot-complete'],
    ['a CR under a two-byte escape, so the readers run', '\u001b7bot-starting\u000dbot-complete'],
    ['a CR inside a key shape', 'sk-live01\u000d23456789abcdef'],
  ])('%s: both short names stay', (_name, text) => {
    expect(scrubSecrets(text)).toBe(text);
  });
  it('a CR after a whole key does not protect the key', () => {
    expect(scrubSecrets(`sk-live${TAIL}\u000dnext`)).toBe('[hidden]\u000dnext');
  });
});

// A reader takes a control out, and the word break with it, so a key in two parts reads as glued to the word before it.
describe('a removed control does not hide a key behind the word before it', () => {
  const KEY = 'sk-live0123456789abcdef';
  it.each([
    ['a bell before it, an escape inside it', 'note\u0007s\u001b7k-live0123456789abcdef'],
    ['an escape before it and inside it', 'note\u001b7s\u001b7k-live0123456789abcdef'],
    ['a C1 control before it, an escape inside it', 'note\u0085s\u001b7k-live0123456789abcdef'],
    ['an escape before the whole key, an escape in its body', 'note\u001b7sk-li\u001b7ve0123456789abcdef'],
    ['a chat-bot token', `note\u00071\u001b723456789:${'A'.repeat(35)}`],
  ])('%s: no reader shows it', (_name, s) => {
    const out = scrubSecrets(s);
    expect(out).toContain('[hidden]');
    expect(clean(out).text).toBe('note[hidden]');
    expect(stripAnsi(out)).toBe('note[hidden]');
  });
  it('a key split by a bell and a cursor-save escape shows no key', () => {
    expect(clean(scrubSecrets('note\u0007s\u001b7k-live0123456789abcdef')).text).not.toContain(KEY);
  });
  it('the reading it returns holds no mark', () => {
    expect(scrubSecrets('note\u0007s\u001b7k-live0123456789abcdef and more')).toBe('note[hidden] and more');
  });
  it('a word that only looks glued keeps its bytes and colours', () => {
    const text = '\u001b[31mnote\u001b[0m\u0007 task-live0123456789abcdef';
    expect(scrubSecrets(text)).toBe(text);
  });
  it('a mark already in the text does not reach the screen with a hidden key', () => {
    expect(scrubSecrets('no\u200bte\u0007s\u001b7k-live0123456789abcdef')).toBe('note[hidden]');
    expect(scrubSecrets('note\u200bs\u001b7k-live0123456789abcdef')).toBe('note[hidden]');
  });
  it('a mark already in the text makes no key out of a word, and text with nothing hidden keeps it', () => {
    const text = 'ta\u200bsk-run\u001b[31m red\u001b[0m';
    expect(scrubSecrets(text)).toBe(text);
    const glued = 'note\u200btask\u001b7-live0123456789abcdef';
    expect(scrubSecrets(glued)).toBe(glued);
  });
  it('a title sequence still ends at its bell, so what follows is read', () => {
    expect(clean(scrubSecrets('\u001b]0;title\u0007note\u0007s\u001b7k-live0123456789abcdef')).text).toBe('note[hidden]');
  });
});

// JavaScriptCore stops matching a repeated group after about 97k rounds, without throwing: a long run is hidden whole first.
describe('a run past what every engine can match is hidden whole', () => {
  const K = 'sk-live0123456789abcdef';
  it('a run of 40000 characters with no space hides, key-shaped or not, and the text around it keeps its bytes', () => {
    expect(scrubSecrets(`a ${'x'.repeat(40000)} b`)).toBe('a [hidden] b');
    expect(scrubSecrets(`a\t${'Q'.repeat(50000)}\nb`)).toBe('a\t[hidden]\nb');
  });
  it('one character shorter is left alone', () => {
    const text = `a ${'x'.repeat(39999)} b`;
    expect(scrubSecrets(text)).toBe(text);
  });
  it('a key after a long key-shaped run is hidden too, and so is the run', () => {
    const out = scrubSecrets(`xoxb-${'A'.repeat(120000)} then ${K} end`);
    expect(out).toBe('[hidden] then [hidden] end');
  });
  it('a space inside a colour or title sequence does not end the run, as it does not end a key', () => {
    expect(scrubSecrets(`a ${'xxxx\u001b]0;a b\u0007'.repeat(10000)} b`)).toBe('a [hidden] b');
    expect(scrubSecrets(`a ${'xxxx\u001b[ q'.repeat(10000)} b`)).toBe('a [hidden] b');
  });
  it('a run hidden as written keeps the colours around it: the scan skips sequences itself, so no reading has to', () => {
    const red = '\u001b[31mred\u001b[0m';
    expect(scrubSecrets(`${red} a ${'xxxx\u001b]0;a b\u0007'.repeat(10000)} b`)).toBe(`${red} a [hidden] b`);
    expect(scrubSecrets(`${red} a ${'xxxx\u001b[ q'.repeat(10000)} b`)).toBe(`${red} a [hidden] b`);
  });
  it('a title cut by a line break is no sequence: the line break ends the run', () => {
    const text = `a ${'x'.repeat(30000)}\u001b]0;a\u000a${'x'.repeat(30000)}\u0007 b`;
    expect(scrubSecrets(text)).toBe(text);
  });
  it('a space after an unclosed title does end the run', () => {
    const text = `a ${'x'.repeat(30000)}\u001b]0;a ${'x'.repeat(30000)} b`;
    expect(scrubSecrets(text)).toBe(text);
  });
  it('invisible characters count toward the run', () => {
    expect(scrubSecrets(`a ${'x\u200b'.repeat(20000)} b`)).toBe('a [hidden] b');
  });
  it('the marks a control gets count toward the run in the reading', () => {
    const out = scrubSecrets(`a ${'x\u0007'.repeat(19999)}\u001b7 ${K}`);
    expect(clean(out).text).not.toContain(K);
  });
});

// A blow-up must fail, not hang the run: the vm timeout interrupts a running pattern. Each string is long enough that a pattern
// quadratic in it would take minutes; the slowest case takes under 200 ms unloaded, so the bound leaves room for a loaded host.
describe('a hostile string cannot stall the scrub', () => {
  const LONG = 400000;
  const SHORT = 1000;
  const run = <T>(f: (s: string) => T, s: string) => runInNewContext('f(s)', { f, s }, { timeout: 6000 }) as T;
  const CASES: ReadonlyArray<readonly [string, string]> = [
    ['a key shape in a run of bells and escapes, read with its marks', `note\u0007s\u001b7k-${'\u0007\u001b7'.repeat(LONG / 3)}!`],
    ['one mark per start, read back', `s\u0007\u001b7`.repeat(LONG / 4)],
    ['a key shape with one long run of separators', `sk-live${'\u200b'.repeat(LONG)}!`],
    ['separators after every character, with no end', `sk-${'-\u200b'.repeat(LONG / 2)} `],
    ['a start at every second character', 's\u200b'.repeat(LONG / 2)],
    ['a digit start at every second character', '1\u200b'.repeat(LONG / 2)],
    ['starts with a long gap after each, rescanned per start', `s${'\u200b'.repeat(SHORT)}`.repeat(LONG / SHORT)],
    ['digit starts with a long gap after each, rescanned per start', `1${'\u200b'.repeat(SHORT)}`.repeat(LONG / SHORT)],
    ['key shapes that stop one short of a key', `sk-${'a\u200b'.repeat(11)} `.repeat(LONG / 26)],
    ['chat-bot ids that stop before the colon', `${'1\u200b'.repeat(6)} `.repeat(LONG / 13)],
    ['chat-bot tokens one short', `123456789:${'a\u200b'.repeat(29)} `.repeat(LONG / 69)],
    ['escapes in a key that could read two ways', `sk-${'\u001b_'.repeat(LONG / 2)}`],
    ['colour escapes in a key, with no end', `sk-${'\u001b[1m'.repeat(LONG / 4)}!`],
    ['open title sequences in a key', `sk-${'\u001b]a'.repeat(LONG / 3)}`],
    ['one open title sequence per start', `sk-\u001b]${'a'.repeat(SHORT)}`.repeat(LONG / SHORT)],
    ['open control sequences', '\u001b[1;'.repeat(LONG / 4)],
    ['a long parameter run before each letter', `\u001b[${'1'.repeat(SHORT)}a`.repeat(LONG / SHORT)],
    ['parameter runs with no escape before each letter', `${'1'.repeat(SHORT)}a`.repeat(LONG / SHORT)],
    ['intermediates before each letter', `${' '.repeat(SHORT)}a`.repeat(LONG / SHORT)],
    ['dashes only', `sk-${'-'.repeat(LONG)} `],
    ['key prefixes only', 'sk_'.repeat(LONG / 3)],
    ['underscore starts', '_sk-'.repeat(LONG / 4)],
    ['underscore starts one short of a key', `_sk-${'a'.repeat(11)} `.repeat(LONG / 16)],
    ['underscore starts with a long gap after each', `_s${'\u200b'.repeat(SHORT)}`.repeat(LONG / SHORT)],
    ['underscores only', '_'.repeat(LONG)],
    ['separators only', '\u200b'.repeat(LONG)],
    ['digits only', '1'.repeat(LONG)],
    ['two-byte escapes in a key', `sk-${'\u001b7'.repeat(LONG / 2)}`],
    ['a start at every two-byte escape', '\u001b7s'.repeat(LONG / 3)],
    ['C1 colours in a key, each readable two ways', `sk-${'\u009b0m'.repeat(LONG / 3)}`],
    ['C1 colours with no end', '\u009b1'.repeat(LONG / 2)],
    ['C1 strings in a key', `sk-${'\u009da'.repeat(LONG / 2)}`],
    ['one open string per line', '\u001b]a\u000a'.repeat(LONG / 4)],
    ['escapes only', '\u001b'.repeat(LONG)],
    ['underscore digit starts', '_1'.repeat(LONG / 2)],
    ['underscore chat-bot ids one short of a colon', '_123456789012 '.repeat(LONG / 14)],
    ['underscore digit starts with a long gap after each', `_1${'\u200b'.repeat(SHORT)}`.repeat(LONG / SHORT)],
    ['a C1 parameter run before each letter', `\u009b${'1'.repeat(SHORT)}a`.repeat(LONG / SHORT)],
    ['intermediates after an escape before each letter', `\u001b${' '.repeat(SHORT)}a`.repeat(LONG / SHORT)],
    ['C1 only', '\u009b'.repeat(LONG)],
    ['line breaks in a key shape', `sk-${'a\u000d'.repeat(LONG / 2)}`],
  ];
  it.each([
    ['one run of key characters', `sk-${'a'.repeat(30000000)}!`],
    ['one run of split key characters', `sk-${'a\u200b'.repeat(15000000)}!`],
    ['a key shape and one run of separators', `sk-live${'\u200b'.repeat(30000000)}0123456789abcdef`],
    ['one run of key characters behind an escape', `\u001b7sk-${'a'.repeat(30000000)}!`],
  ])('past what the pattern engine can hold, %s: fails closed', (_name, s) => {
    const out = runInNewContext('f(s)', { f: scrubSecrets, s }, { timeout: 60000 }) as string;
    expect(out).toContain('[hidden]');
    expect(out).not.toContain('aaaaaaaaaaaaaaaa');
    expect(out).not.toContain('0123456789abcdef');
  });

  it.each(CASES)('%s: scrubSecrets', (_name, s) => {
    expect(() => run(scrubSecrets, s)).not.toThrow();
  });
  it.each(CASES)('%s: shownText', (_name, s) => {
    expect(() => run(shownText, s)).not.toThrow();
  });
});

// The run bound keeps every test above away from the catch, so the catch is proved here: a pattern that throws hides the whole text.
describe('a pattern that throws', () => {
  it('hides the whole text, never shows it unchecked', () => {
    const real = String.prototype.replace;
    const spy = vi.spyOn(String.prototype, 'replace').mockImplementation(function (this: string, ...a: unknown[]) {
      if (a[0] instanceof RegExp && a[0].flags.includes('g')) throw new RangeError('engine gave up');
      return (real as (...x: unknown[]) => string).apply(this, a);
    });
    let out: string;
    try { out = scrubSecrets(`note sk-live${TAIL}`); } finally { spy.mockRestore(); }
    expect(out).toBe('[hidden]');
  });
});

// The marker the scrub writes reads as [hidden] after either reader, whatever escape stood
// open before the key; an opened string loses only its opener. Text that held the marker's words itself is left as it was.
describe('the marker survives an open escape before the key', () => {
  const K = `sk-live${TAIL}`;
  it.each([
    ['ESC', `a \u001b${K} b`, 'a [hidden] b'],
    ['CSI', `a \u009b${K} b`, 'a [hidden] b'],
    ['ESC [', `a \u001b[${K} b`, 'a [hidden] b'],
    ['ESC [ with parameters and an intermediate', `a \u001b[31;1 ${K} b`, 'a [hidden] b'],
    ['CSI with parameters and an intermediate', `a \u009b2 ${K} b`, 'a [hidden] b'],
    // an ESC-opened string goes with its text: both readers had swallowed it
    ['an open OSC', `a \u001b]0;title ${K} b`, 'a [hidden] b'],
    ['an open DCS', `a \u001bPq ${K} b`, 'a [hidden] b'],
    ['an open APC', `a \u001b_q ${K} b`, 'a [hidden] b'],
    // a C1-opened string loses only its opener: the non-code reader shows its text
    ['an open C1 OSC', `a \u009d0;t ${K} b`, 'a 0;t [hidden] b'],
    ['ESC with an intermediate only', `a \u001b ${K} b`, 'a [hidden] b'],
    // A lone ESC goes first, then the string opened before it (the scan alone stops at that ESC)
    ['a lone ESC after an open OSC', `\u001b]x\u001b${K}`, '[hidden]'],
    ['a lone ESC after an open DCS', `\u001bPnote\u001b${K}`, '[hidden]'],
    ['a lone ESC after an open C1 OSC', `\u009dnote\u001b${K}`, 'note[hidden]'],
  ])('%s', (_name, text, want) => {
    const out = scrubSecrets(text);
    expect(out).toBe(want);
    expect(clean(out).text).toBe(want);
    expect(stripAnsi(out)).toBe(want);
  });
  // A string's body both readers had swallowed is never shown, so a key there glued by a C1 CSI (which the
  // raw pattern does not bridge, and the readers join once the CSI is cleaned) cannot show.
  const A = `sk-${'A'.repeat(20)}`;
  const glued = [`sk\u009b1m-${'A'.repeat(20)}`, `sk\u009bm-${'A'.repeat(20)}`];
  it.each([
    ...glued.flatMap((g) => ['\u001b]', '\u001bP', '\u001bX', '\u001b^', '\u001b_', '\u009d', '\u0090'].map((op) => [`${JSON.stringify(op)} ${JSON.stringify(g)}`, `${op}x ${g} ${K}`])),
    ['a DCS in the middle of a command', `run \u001bP sk\u009bm-${'A'.repeat(20)} then ${K}`],
  ])('the body a dropped opener shows is scrubbed too: %s', (_name, text) => {
    const out = scrubSecrets(text);
    for (const view of [out, clean(out).text, stripAnsi(out), shownText(out)]) {
      expect(view).not.toMatch(/AAAA/);
      expect(view).not.toContain(A);
    }
    expect(clean(out).text).toContain('[hidden]');
  });
  it.each([']', 'P', 'X', '^', '_'])('an ESC an earlier escape consumed opens nothing, so the text after it stays: ESC %s', (op) => {
    const out = scrubSecrets(`\u001b \u001b${op}VISIBLE ${K}`);
    expect(out).toBe(`\u001b \u001b${op}VISIBLE [hidden]`);
    expect(clean(out).text).toContain('VISIBLE');
    for (const view of [out, clean(out).text, stripAnsi(out)]) expect(view).not.toMatch(/sk-li|live/);
  });
  // An open string runs past the marker, so dropping its opener could show the tail too;
  // a C1 opener inside a string still open for clean; the BREAK marks change how clean reads an nF escape.
  // No piece of the glued key shows in any view.
  const Q = 'Q'.repeat(20);
  const K1 = `sk-${'R'.repeat(20)}`;
  it.each([
    ...['\u001b]', '\u001bP', '\u001bX', '\u001b^', '\u001b_'].flatMap((op) => [
      [`${JSON.stringify(op)} C1 CSI 1m`, `${op}x ${K1} sk\u009b1m-${Q}`],
      [`${JSON.stringify(op)} C1 CSI m`, `${op}x ${K1} sk\u009bm-${Q}`],
    ]),
    ['an OSC title, the key after the marker', `\u001b]0;title ${K1} then sk\u009bm-${Q} end`],
    ['in the middle of a command', `run \u001b]x ${K1} and sk\u009b1m-${Q} and ${K1}`],
    ['a C1 opener inside a string clean keeps open', `\u001b]T\u009c \u009d sk\u009b1m-${Q} ${K1}`],
    ['ESC space before an OSC', `a \u001b \u001b] sk\u009b1m-${Q} b`],
    ['ESC ( before a DCS', `\u001b(\u001bPsee sk\u009bm-${Q}`],
  ])('no key shows through any reader: %s', (_name, text) => {
    const out = scrubSecrets(text);
    // The oracle: a view, with what never shows taken out, holds no key shape (the raw bytes may keep an unjoined
    // `sk CSI 1m -Q…`, which no reader shows as a key)
    const keyIn = (v: string) => /(?:^|[^A-Za-z0-9_])(?:sk|hk)[-_][A-Za-z0-9_-]{12,}/.test(v.replace(/[\p{Cc}\p{Cf}]/gu, ''));
    for (const view of [clean(out).text, clean(out, 300).text, clean(out, undefined, { code: true }).text, stripAnsi(out), shownText(out), clean(stripAnsi(out)).text])
      expect(keyIn(view), JSON.stringify(view)).toBe(false);
  });
  it('a string ended by C1 ST on a later line still shows its text to stripAnsi', () => {
    const out = scrubSecrets(`\u001b]x sk\u009b1m-${'A'.repeat(20)} ${K}\n\u001b]title\u009cVISIBLE`);
    expect(out).not.toMatch(/AAAA/);
    expect(clean(out).text).not.toMatch(/AAAA/);
    expect(stripAnsi(out)).not.toMatch(/AAAA/);
    expect(stripAnsi(out)).toContain('VISIBLE');
    expect(out).toBe(`[hidden]\n\u001b]title\u009cVISIBLE`);
  });
  it('a string opened on an earlier line keeps its opener: the line break ended it for the readers', () => {
    expect(scrubSecrets(`a \u001b]title\n${K} b`)).toBe('a \u001b]title\n[hidden] b');
  });
  it('text that already held "[hidden]" after an escape is left as it was', () => {
    expect(scrubSecrets('a \u001b[hidden] b')).toBe('a \u001b[hidden] b');
    expect(scrubSecrets(`a \u001b[hidden] and ${K}`)).toBe('a \u001b[hidden] and [hidden]');
  });
});
