// Vitest: the Files preview picks the kit CodeBlock language from the file name, or
// from a shell shebang; anything else, and any text too long to colour cheaply, stays plain.
import { describe, expect, it } from 'vitest';
import { CODE_LANG_WORDS } from '@kit';
import { PREVIEW_HL_MAX, previewLang } from './lang';

describe('previewLang', () => {
  it.each([
    ['package.json', 'json'], ['tsconfig.jsonc', 'json'],
    ['server.js', 'js'], ['index.mjs', 'js'], ['rollup.cjs', 'js'], ['App.jsx', 'js'],
    ['main.ts', 'ts'], ['View.tsx', 'ts'],
    ['config.yaml', 'yaml'], ['ci.YML', 'yaml'],
    ['tool.py', 'python'], ['request.http', 'http'],
    ['deploy.sh', 'shell'], ['setup.bash', 'shell'], ['prompt.zsh', 'shell'],
  ] as const)('%s → %s', (name, lang) => {
    expect(previewLang(name, 'x')).toBe(lang);
  });

  it.each([
    '#!/bin/sh\necho hi', '#!/bin/bash\necho hi', '#!/usr/bin/env bash\necho hi', '#! /bin/zsh\necho hi', '#!/usr/bin/env sh',
  ])('a file without a known extension and a shell shebang is shell: %j', (text) => {
    expect(previewLang('run', text)).toBe('shell');
  });

  it.each([
    ['notes.txt', 'plain words'], ['README.md', '# Title'], ['.env', 'KEY=value'], ['app.env', 'KEY=value'], ['hosts', '127.0.0.1 x'],
    ['Makefile', 'all:\n\tgo build'], ['run', '#!/usr/bin/env node\nconsole.log(1)'], ['run', 'echo no shebang'],
    ['weird.', '{}'], ['noext', '#!/bin/shell-like\n'],
  ])('%s stays plain', (name, text) => {
    expect(previewLang(name, text)).toBeUndefined();
  });

  it('the extension wins over a shebang (a .py script that starts with #!/bin/sh still reads as Python)', () => {
    expect(previewLang('tool.py', '#!/bin/sh\n')).toBe('python');
  });

  it('a text longer than the kit colours cheaply stays plain, shell included (the kit caps only the other languages)', () => {
    const big = 'a'.repeat(PREVIEW_HL_MAX + 1);
    expect(previewLang('data.json', big)).toBeUndefined();
    expect(previewLang('deploy.sh', big)).toBeUndefined();
    expect(previewLang('run', `#!/bin/sh\n${big}`)).toBeUndefined();
    expect(previewLang('data.json', 'a'.repeat(PREVIEW_HL_MAX))).toBe('json');
  });

  it('the extensions are the kit\'s one table, the one Ask uses', () => {
    for (const [lang, words] of CODE_LANG_WORDS) for (const w of words.split(' ')) {
      if (w.length <= 8) expect([w, previewLang(`file.${w}`, 'x')]).toEqual([w, lang]);
    }
  });
});
