// Vitest: the one word/extension → CodeBlock language table that Ask's code blocks and Files'
// previews share.
import { describe, expect, it } from 'vitest';
import { CODE_LANG_WORDS, codeLangOfPath, codeLangOfWord } from './codeLang';

describe('codeLang', () => {
  it.each([
    ['json', 'json'], ['jsonc', 'json'], ['json5', 'json'],
    ['sh', 'shell'], ['bash', 'shell'], ['shell', 'shell'], ['zsh', 'shell'], ['ksh', 'shell'], ['console', 'shell'],
    ['js', 'js'], ['javascript', 'js'], ['jsx', 'js'], ['mjs', 'js'], ['cjs', 'js'], ['node', 'js'],
    ['ts', 'ts'], ['typescript', 'ts'], ['tsx', 'ts'], ['mts', 'ts'], ['cts', 'ts'],
    ['yaml', 'yaml'], ['yml', 'yaml'], ['http', 'http'], ['py', 'python'], ['python', 'python'],
    ['diff', 'diff'], ['patch', 'diff'],
  ] as const)('the word %s names %s', (word, lang) => {
    expect(codeLangOfWord(word)).toBe(lang);
  });

  it('a word is read case-insensitively, leading dots ignored', () => {
    expect(codeLangOfWord('TSX')).toBe('ts');
    expect(codeLangOfWord('.YML')).toBe('yaml');
    expect(codeLangOfWord('..py')).toBe('python');
  });

  it.each(['', 'txt', 'md', 'markdown', 'css', 'html', 'go', 'rust', 'constructor', '__proto__', 'toString'])('%j is plain', (word) => {
    expect(codeLangOfWord(word)).toBeUndefined();
  });

  it('a path names the language of its extension; no extension or an unknown one is plain', () => {
    expect(codeLangOfPath('/a/b/run.py')).toBe('python');
    expect(codeLangOfPath('ci.YML')).toBe('yaml');
    expect(codeLangOfPath('app.min.js')).toBe('js');
    expect(codeLangOfPath('fix-1.PATCH')).toBe('diff');
    expect(codeLangOfPath('Makefile')).toBeUndefined();
    expect(codeLangOfPath('notes.txt')).toBeUndefined();
    expect(codeLangOfPath('weird.')).toBeUndefined();
    expect(codeLangOfPath('file.typescript')).toBeUndefined(); // an extension is 1 to 8 letters or digits
    expect(codeLangOfPath(undefined)).toBeUndefined();
    expect(codeLangOfPath('x.constructor')).toBeUndefined();
  });

  it('the table lists each word once', () => {
    const words = CODE_LANG_WORDS.flatMap(([, w]) => w.split(' '));
    expect(new Set(words).size).toBe(words.length);
  });
});
