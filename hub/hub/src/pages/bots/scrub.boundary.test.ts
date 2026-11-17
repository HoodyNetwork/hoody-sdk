// Vitest: hidden today stays hidden on the Bots lines that scrub. Cases that leak when the steps run in the other
// order: a key right after an invisible character, and one joined by an underscore in a stage reason, which turns to a space first.
import { describe, expect, it } from 'vitest';
import { messageText, plainLine, scrubSecrets, stageWords } from './logic';

const KEY = 'sk-live0123456789abcdef';

describe('the Bots lines keep a key hidden', () => {
  it.each([
    ['a zero-width space', '\u200b'],
    ['a bell', '\u0007'],
    ['a word joiner', '\u2060'],
    ['a soft hyphen', '\u00ad'],
    ['a combining grapheme joiner', '\u034f'],
    ['a combining mark', '\u0301'],
    ['a reset escape', '\u001b[0m'],
  ])('straight after a word and %s', (_name, x) => {
    const out = plainLine(scrubSecrets(`note${x}${KEY} end`));
    expect(out).toContain('[hidden]');
    expect(out).not.toContain('0123456789abcdef');
  });

  it('a key whose tail is a token of another family (-ak-) is hidden whole on a Bots line', () => {
    expect(plainLine(scrubSecrets(['note sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90 end'].join('')))).toBe('note [hidden] end');
  });

  it('a key glued by an underscore hides through the raw scrub too, before any call site turns the underscore to a space', () => {
    expect(scrubSecrets(`failed_${KEY}`)).toBe('failed_[hidden]');
  });

  it('in a stage reason joined by an underscore', () => {
    expect(stageWords({ message: '', reason: `failed_${KEY}`, code: '' })).toBe('failed [hidden]');
    expect(stageWords({ message: '', reason: '', code: `failed_${KEY}` })).toBe('failed [hidden]');
  });

  it.each([
    ['a bell', '\u0007'],
    ['a reset escape', '\u001b[0m'],
    ['a two-byte escape', '\u001b7'],
    ['a C1 control', '\u0085'],
    ['a bidi override', '\u202e'],
  ])('in a message, straight after a word and %s: cleaning cannot glue it out of reach', (_name, x) => {
    const out = messageText(`note${x}${KEY} end`);
    expect(out).toContain('[hidden]');
    expect(out).not.toContain('0123456789abcdef');
  });

  it.each([
    ['the underscore form', 'sk_live0123456789abcdef'],
    ['underscores inside a key', 'sk-live_0123_456789_abcdef_ghij'],
    ['underscores inside a chat-bot token', '123456789:FAKEtokenFAKEtoken_FAKEtokenFAKE000'],
  ])('a stage reason with %s hides before the underscores turn to spaces', (_name, key) => {
    const out = stageWords({ message: '', reason: key, code: '' });
    expect(out).toBe('[hidden]');
  });

  it('a chat-bot token glued by an underscore hides through the raw scrub, and in a stage reason', () => {
    const token = '123456789:FAKEtokenFAKEtoken_FAKEtokenFAKE000';
    expect(scrubSecrets(`failed_${token}`)).toBe('failed_[hidden]');
    expect(stageWords({ message: '', reason: `failed_${token}`, code: '' })).toBe('failed [hidden]');
  });

  it('a stage reason with no key still reads as words', () => {
    expect(stageWords({ message: '', reason: 'turn_failed_early', code: '' })).toBe('turn failed early');
  });

  it('in a stage reason or message split by what a reader cannot see', () => {
    expect(stageWords({ message: '', reason: 'failed_sk-live\u200b0123456789abcdef', code: '' })).toBe('failed [hidden]');
    expect(stageWords({ message: 'no sk-live\u00070123456789abcdef', reason: '', code: '' })).not.toContain('0123456789abcdef');
  });
});
