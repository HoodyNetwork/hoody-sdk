// CodeBlock lang="shell": shell commands get colour (the command word, flags and variables;
// strings, comments and operators stay plain) for sh and PowerShell alike. Colour only: what shows, its reading order
// and what Copy gives are the same characters as without it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup as cleanupRender, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CodeBlock, SHELL_START, shellTokens, type ShellToken } from './Ids';

const css = readFileSync(path.join(import.meta.dirname, 'Ids.module.css'), 'utf8');
const kinds2 = (toks: readonly ShellToken[]) => toks.filter((t) => t.kind !== 'text').map((t) => `${t.kind}:${t.text}`);
const kinds = (src: string) => kinds2(shellTokens(src).tokens);

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});

describe('shellTokens', () => {
  it('reads the command, its flags and the operators that start the next command', () => {
    expect(kinds('ssh -i ~/.ssh/hoody-a atlas.example')).toEqual(['cmd:ssh', 'flag:-i']);
    expect(kinds('mkdir -p ~/.ssh && mv ~/Downloads/k ~/.ssh/ && chmod 600 ~/.ssh/k')).toEqual([
      'cmd:mkdir', 'flag:-p', 'op:&&', 'cmd:mv', 'op:&&', 'cmd:chmod',
    ]);
    expect(kinds('curl -fsSL https://install.example | sh')).toEqual(['cmd:curl', 'flag:-fsSL', 'op:|', 'cmd:sh']);
    expect(kinds('pbcopy < ~/.ssh/k.pub')).toEqual(['cmd:pbcopy', 'op:<']);
  });

  it('reads strings, variables and comments; an assignment before the command is not the command', () => {
    expect(kinds(`HTTPS_PROXY=$P curl --proxy "$P" 'https://a b' # check`)).toEqual([
      'var:$P', 'cmd:curl', 'flag:--proxy', 'str:"$P"', "str:'https://a b'", 'com:# check',
    ]);
    expect(kinds('echo ${HOME}/x $1 a#b')).toEqual(['cmd:echo', 'var:${HOME}', 'var:$1']);
  });

  it('reads PowerShell: Verb-Noun commands, -Parameters and $env: variables', () => {
    expect(kinds('Get-Content $env:USERPROFILE\\.ssh\\k.pub | Set-Clipboard')).toEqual([
      'cmd:Get-Content', 'var:$env:USERPROFILE', 'op:|', 'cmd:Set-Clipboard',
    ]);
    expect(kinds('New-Item -ItemType Directory -Force $env:USERPROFILE\\.ssh | Out-Null')).toEqual([
      'cmd:New-Item', 'flag:-ItemType', 'flag:-Force', 'var:$env:USERPROFILE', 'op:|', 'cmd:Out-Null',
    ]);
  });

  it('an escaped quote or operator is part of the word: no command hides in a string, none is made up', () => {
    expect(kinds('echo \\"; printf executed')).toEqual(['cmd:echo', 'op:;', 'cmd:printf']);
    expect(kinds('echo hello\\; rm -rf /tmp/example')).toEqual(['cmd:echo', 'flag:-rf']);
    expect(kinds("echo it\\'s fine")).toEqual(['cmd:echo']);
  });

  it('redirections are one operator and never start a command; a (glued to a word is that word', () => {
    expect(kinds('curl https://example.com 2>&1')).toEqual(['cmd:curl', 'op:2>&1']);
    expect(kinds('run &>/dev/null; ls')).toEqual(['cmd:run', 'op:&>', 'op:;', 'cmd:ls']);
    expect(kinds('mv ~/Downloads/key(1) ~/.ssh/key')).toEqual(['cmd:mv', 'op:)']);
    expect(kinds('(cd /tmp && ls)')).toEqual(['op:(', 'cmd:cd', 'op:&&', 'cmd:ls', 'op:)']);
    // After a closing ) the words are arguments again.
    expect(kinds('echo $() x')).toEqual(['cmd:echo', 'op:(', 'op:)']);
  });

  it('a trailing \\ goes on with the same command, without being one; what follows stays plain', () => {
    const a = shellTokens('curl -fsSL https://install.example | \\');
    expect(kinds2(a.tokens)).toEqual(['cmd:curl', 'flag:-fsSL', 'op:|', 'op:\\']);
    expect(a.state.cont).toBe(true);
    // The rest of a continued line is plain text: it may look like a command, never like a comment or a string.
    expect(kinds('mkdir -p d && \\\n  chmod 600 d # x y\nls')).toEqual(['cmd:mkdir', 'flag:-p', 'op:&&', 'op:\\', 'cmd:ls']);
    expect(shellTokens('a \\\n  b "c # d').tokens.slice(-1)).toEqual([{ kind: 'text', text: '\n  b "c # d' }]);
  });

  it('an open quote goes on into the next piece, and a comment ends at its line', () => {
    const a = shellTokens("printf '%s\\n' 'first");
    expect(a.state.quote).toBe("'");
    const b = shellTokens('rm -rf /tmp/example', a.state);
    expect(b.tokens).toEqual([{ kind: 'str', text: 'rm -rf /tmp/example' }]);
    const c = shellTokens("last'", b.state);
    expect(c.tokens).toEqual([{ kind: 'str', text: "last'" }]);
    expect(c.state.quote).toBeNull();
    expect(kinds('echo ok # note\nls -l')).toEqual(['cmd:echo', 'com:# note', 'cmd:ls', 'flag:-l']);
  });

  it('a # right after an operator opens a comment; inside a word it does not', () => {
    expect(kinds('echo ok;# "comment\nprintf executed')).toEqual(['cmd:echo', 'op:;', 'com:# "comment', 'cmd:printf']);
    expect(kinds('ls|# x\nwc')).toEqual(['cmd:ls', 'op:|', 'com:# x', 'cmd:wc']);
    expect(kinds('echo a#b; ls')).toEqual(['cmd:echo', 'op:;', 'cmd:ls']);
    // A word ending a piece goes on into the next: its # is not a comment.
    const a = shellTokens('echo a');
    expect(kinds2(shellTokens('#b; ls', a.state).tokens)).toEqual(['op:;', 'cmd:ls']);
  });

  it('a comment goes on into the next piece until its newline', () => {
    const a = shellTokens('echo ok # ');
    expect(a.state.comment).toBe(true);
    const b = shellTokens("'s setup\nprintf executed", a.state);
    expect(kinds2(b.tokens)).toEqual(["com:'s setup", 'cmd:printf']);
    expect(b.state.comment).toBe(false);
  });

  it('only a \\ that really continues the line makes the next one plain', () => {
    expect(kinds('echo ok # note \\\nprintf executed')).toEqual(['cmd:echo', 'com:# note \\', 'cmd:printf']);
    expect(kinds('echo ok \\\\\nprintf executed')).toEqual(['cmd:echo', 'cmd:printf']);
    // A blank line after a continued one ends the command: the line after it is read again.
    expect(kinds('echo ok \\\n\nprintf executed')).toEqual(['cmd:echo', 'op:\\', 'cmd:printf']);
    // A plain stretch whose line is continued again stays plain on the next one too.
    expect(kinds('a \\\nb \\\n# c\nls')).toEqual(['cmd:a', 'op:\\', 'cmd:ls']);
    expect(kinds('a \\\nb \\\\\n# c')).toEqual(['cmd:a', 'op:\\', 'com:# c']);
    // A comment's \ continues nothing, read in two pieces too.
    const c = shellTokens('ls # x \\');
    expect(kinds2(shellTokens('\nwc', c.state).tokens)).toEqual(['cmd:wc']);
  });

  it('a continued newline or an escape split across pieces never shows a command as comment or string', () => {
    // Inside a word or after a space, the joined line stays plain to its end.
    expect(kinds('echo "foo"\\\n#bar; printf executed')).toEqual(['cmd:echo', 'str:"foo"', 'op:\\']);
    expect(kinds('echo foo\\\n#bar; printf executed\nls')).toEqual(['cmd:echo', 'op:\\', 'cmd:ls']);
    // A \ ending one piece escapes what the next starts with: that piece is plain to the end of its line.
    const e = shellTokens('echo \\');
    expect(e.state.cont).toBe(true);
    expect(shellTokens('"; printf executed', e.state).tokens).toEqual([{ kind: 'text', text: '"; printf executed' }]);
    expect(shellTokens(' #literal; printf executed', e.state).tokens).toEqual([{ kind: 'text', text: ' #literal; printf executed' }]);
    // The continued newline at the start of the next piece: plain too, then a new line reads as usual.
    expect(kinds2(shellTokens('\n#bar; printf x\nls', e.state).tokens)).toEqual(['cmd:ls']);
    const w = shellTokens('echo foo\\');
    expect(w.state).toMatchObject({ cont: true, atCmd: false });
    // A plain stretch goes on into the next piece of the same line.
    const p = shellTokens('#x y', shellTokens('echo \\').state);
    expect(p.state).toMatchObject({ plain: true, lost: false });
    expect(kinds2(shellTokens(' z; ls\nwc', p.state).tokens)).toEqual(['cmd:wc']);
  });

  it('where the quoting cannot be followed, all the rest stays plain', () => {
    const q2Lost = () => shellTokens('a <<EOF').state;
    // A quote inside a plain stretch: the string it may open is not followed, so nothing later is a string.
    expect(kinds('echo a \\\nb "x\ny"; rm -rf /tmp/example')).toEqual(['cmd:echo', 'op:\\']);
    const sc = shellTokens('docker run \\');
    const l2 = shellTokens('-e A="multi', { ...SHELL_START, atCmd: false, plain: true });
    expect(l2.state.lost).toBe(true);
    expect(shellTokens('line" && foo', l2.state).tokens).toEqual([{ kind: 'text', text: 'line" && foo' }]);
    expect(sc.state.cont).toBe(true);
    // A heredoc body, a $'…' string: plain to the end.
    expect(kinds("cat <<EOF\ndon't\nEOF\nrm -rf /tmp/example")).toEqual(['cmd:cat']);
    expect(kinds("echo $'it\\'s'; rm x")).toEqual(['cmd:echo']);
    // A \ ending a part inside "…" escapes the next part's first character: the rest is lost.
    const q = shellTokens('echo "a\\');
    expect(q.state).toMatchObject({ quote: '"', cont: true });
    expect(shellTokens('" b "; rm -rf /tmp/example', q.state).tokens).toEqual([{ kind: 'text', text: '" b "; rm -rf /tmp/example' }]);
    // Once lost, later lines stay plain too.
    expect(kinds2(shellTokens('x\nls # c', q2Lost()).tokens)).toEqual([]);
    // A \ ending a later part of an open "…" string escapes too.
    const o = shellTokens('b\\', shellTokens('echo "a').state);
    expect(o.state).toMatchObject({ quote: '"', cont: true });
    expect(shellTokens('" ; rm x', o.state).state.lost).toBe(true);
    // A plain part ending in a continuing \ joins the next part's leading newline: still plain, no comment.
    const p = shellTokens('x', { ...SHELL_START, plain: true, cont: false });
    const p2 = shellTokens('y \\', p.state);
    expect(p2.state).toMatchObject({ plain: true, cont: true });
    expect(kinds2(shellTokens('\n#c\nls', p2.state).tokens)).toEqual(['cmd:ls']);
  });

  it('never changes a character: the pieces join back to the input, for any input', () => {
    const alphabet = ` \t\n-$#'"|&;<>(){}=\\/:~.aZ09_é`;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 2000; n++) {
      const len = Math.floor(rnd() * 24);
      let src = '';
      for (let k = 0; k < len; k++) src += alphabet[Math.floor(rnd() * alphabet.length)];
      const toks: ShellToken[] = shellTokens(src).tokens;
      expect(toks.map((t) => t.text).join('')).toBe(src);
      expect(toks.every((t) => t.text.length > 0)).toBe(true);
      // Read in two pieces, the state carried between them: still every character, once.
      const cut = Math.floor(rnd() * (len + 1));
      const a = shellTokens(src.slice(0, cut));
      const b = shellTokens(src.slice(cut), a.state);
      expect([...a.tokens, ...b.tokens].map((t) => t.text).join('')).toBe(src);
      expect([...a.tokens, ...b.tokens].every((t) => t.text.length > 0)).toBe(true);
    }
  });
});

describe('CodeBlock lang="shell"', () => {
  it('never gives any text a string or comment colour, whatever the input', () => {
    const alphabet = ` \t\r\n -$#'"\`|&;<>(){}=\\/:~.aZ09_é`;
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 150; n++) {
      let src = '';
      const len = Math.floor(rnd() * 30);
      for (let k = 0; k < len; k++) src += alphabet[Math.floor(rnd() * alphabet.length)];
      const cut = Math.floor(rnd() * (len + 1));
      const { container } = render(
        <CodeBlock label="x" lang="shell" code={src || 'x'} lines={undefined} />,
      );
      const r2 = render(<CodeBlock label="y" lang="shell" lines={[{ code: [src.slice(0, cut), { placeholder: 'p' }, src.slice(cut)] }]} />);
      for (const root of [container, r2.container]) {
        // No string, comment or dimmed operator colour; a variable span starts at its $.
        expect(root.querySelector('[class*="sh_str"], [class*="sh_com"], [class*="sh_op"]')).toBeNull();
        for (const el of root.querySelectorAll('[class*="sh_var"]')) expect(el.textContent).toMatch(/^\$/);
      }
      // The same text shows as without colour, whole and split by a placeholder.
      const plain = render(<CodeBlock lang="plain" label="z" code={src || 'x'} lines={undefined} />);
      const plain2 = render(<CodeBlock lang="plain" label="y" lines={[{ code: [src.slice(0, cut), { placeholder: 'p' }, src.slice(cut)] }]} />);
      expect((container.querySelector('pre') as HTMLElement).textContent).toBe((plain.container.querySelector('pre') as HTMLElement).textContent);
      expect(r2.container.textContent).toBe(plain2.container.textContent);
      cleanupRender();
    }
  });

  it('never dims a word glued to a redirection: "python"2>&1 runs python2', () => {
    for (const code of ['"python"2>&1', "''2>&1 x"]) {
      const { container } = render(<CodeBlock label="x" lang="shell" code={code} />);
      const r2 = render(<CodeBlock label="y" lang="shell" lines={[{ code: [code.slice(0, 2), code.slice(2)] }]} />);
      for (const root of [container, r2.container]) {
        expect(root.querySelector('[class*="sh_op"]')).toBeNull();
        expect([...root.querySelectorAll('[class*="sh_"]')].some((e) => e.textContent?.includes('2'))).toBe(false);
      }
      expect((container.querySelector('pre') as HTMLElement).textContent).toBe(code);
      cleanupRender();
    }
  });

  it('a line\'s copyLabel names its Copy button; without one it is "Copy {caption}"', () => {
    render(<CodeBlock lang="plain" label="x" lines={[{ caption: 'Copy the key', code: 'pbcopy < k.pub', copyLabel: 'Copy the command: Copy the key' }, { caption: 'Sign in', code: 'hoody login' }]} />);
    expect(screen.getByRole('button', { name: 'Copy the command: Copy the key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Sign in' })).toBeInTheDocument();
  });

  it('colours a variable at its $ reference', () => {
    const { container } = render(<CodeBlock label="x" lang="shell" code='cd "$HOME" && ls $DIR' />);
    expect([...container.querySelectorAll('[class*="sh_var"]')].map((e) => e.textContent)).toEqual(['$DIR']);
  });

  it('colours a single command; the text and Copy are unchanged', () => {
    const cmd = 'ssh -i ~/.ssh/k atlas.example # here';
    const { container } = render(<CodeBlock code={cmd} label="Connect" lang="shell" prompt />);
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre.textContent).toBe(cmd);
    expect(pre.querySelector('[class*="sh_cmd"]')?.textContent).toBe('ssh');
    expect(pre.querySelector('[class*="sh_flag"]')?.textContent).toBe('-i');
    // A comment stays plain text: no colour can hide a command as a comment.
    expect(pre.querySelector('[class*="sh_com"], [class*="sh_str"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(written).toEqual([cmd]);
  });

  it('colours steps line by line and keeps placeholders as tokens Copy refuses', () => {
    const { container } = render(
      <CodeBlock
        label="Steps"
        lang="shell"
        lines={[
          { caption: 'Install', code: 'curl -fsSL https://install.example | sh' },
          { caption: 'Connect', code: ['ssh ', { placeholder: 'computer' }, ' -v'] },
        ]}
      />,
    );
    const codes = [...container.querySelectorAll('code')];
    expect(codes.map((c) => c.textContent)).toEqual(['curl -fsSL https://install.example | sh', 'ssh computer -v']);
    expect([...(codes[0] as HTMLElement).querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['curl', 'sh']);
    // An operator stays plain text.
    expect((codes[0] as HTMLElement).querySelector('[class*="sh_op"]')).toBeNull();
    expect(screen.getByRole('img', { name: /computer/ })).toBeInTheDocument();
    expect((codes[1] as HTMLElement).querySelector('[class*="sh_flag"]')?.textContent).toBe('-v');
  });

  it('a line ending in \\ goes on with the same command; a new line starts a new one', () => {
    const { container } = render(<CodeBlock code={'docker run \\\n  --rm image\nls -la'} lang="shell" />);
    expect([...container.querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['docker', 'ls']);
  });

  it('a quoted string over several lines stays a string in both branches; a placeholder in an assignment keeps the command', () => {
    const { container } = render(<CodeBlock code={"printf '%s\\n' 'first\nrm -rf /tmp/example\nlast'\nls"} lang="shell" />);
    expect([...container.querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['printf', 'ls']);
    cleanupRender();
    const r = render(
      <CodeBlock
        label="Steps"
        lang="shell"
        lines={[
          { code: "echo 'a\necho ok # x\nb'\nls" },
          { code: ['URL=https://', { placeholder: 'bot' }, '.example KEY="$K" claude'] },
        ]}
      />,
    );
    const codes = [...r.container.querySelectorAll('code')];
    expect([...(codes[0] as HTMLElement).querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['echo', 'ls']);
    expect((codes[0] as HTMLElement).querySelector('[class*="sh_com"]')).toBeNull();
    expect([...(codes[1] as HTMLElement).querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['claude']);
  });

  it('a later command is never coloured as comment or string, in both branches', () => {
    const cmds = (root: ParentNode) => [...root.querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent);
    const { container } = render(<CodeBlock code={'echo ok;# "comment\nprintf executed\necho ok # note \\\nls'} lang="shell" />);
    expect(cmds(container)).toEqual(['echo', 'printf', 'echo', 'ls']);
    cleanupRender();
    const r = render(
      <CodeBlock
        label="Steps"
        lang="shell"
        lines={[
          { code: ['echo ok # ', { placeholder: 'computer' }, "'s setup\nprintf executed"] },
          { code: 'echo ok;# "comment' },
          { code: 'printf executed' },
          { code: 'ls # note \\' },
          { code: 'wc' },
          { code: ['echo \\', '"; printf executed'] },
          { code: ['echo \\', ' #literal; printf executed'] },
          { code: ['echo \\', { placeholder: 'computer' }, ' # x "y'] },
        ]}
      />,
    );
    const codes = [...r.container.querySelectorAll('code')];
    expect(cmds(codes[0] as HTMLElement)).toEqual(['echo', 'printf']);
    expect((codes[0] as HTMLElement).querySelector('[class*="sh_str"]')).toBeNull();
    expect(cmds(codes[2] as HTMLElement)).toEqual(['printf']);
    expect(cmds(codes[4] as HTMLElement)).toEqual(['wc']);
    // After a split escape the rest of the line is plain: never a string or comment colour.
    for (const k of [5, 6, 7]) {
      expect(cmds(codes[k] as HTMLElement)).toEqual(['echo']);
      expect((codes[k] as HTMLElement).querySelector('[class*="sh_str"], [class*="sh_com"]')).toBeNull();
    }
    cleanupRender();
    const c = render(<CodeBlock code={'echo "foo"\\\n#bar; printf executed\necho foo\\\nls\nwc'} lang="shell" />);
    expect(cmds(c.container)).toEqual(['echo', 'echo', 'wc']);
    expect(c.container.querySelector('[class*="sh_com"]')).toBeNull();
    cleanupRender();
    // Line by line: a plain line continued again keeps the next one plain too.
    const d = render(<CodeBlock code={'a \\\nb \\\n# c d\nls'} lang="shell" />);
    expect(cmds(d.container)).toEqual(['a', 'ls']);
    expect(d.container.querySelector('[class*="sh_com"], [class*="sh_str"]')).toBeNull();
    cleanupRender();
    // A quote in a continued line: the lines after it stay plain, whatever they hold.
    const q = render(<CodeBlock code={'docker run \\\n-e A="multi\nline" && foo\nls # x'} lang="shell" />);
    expect(cmds(q.container)).toEqual(['docker']);
    expect(q.container.querySelector('[class*="sh_com"], [class*="sh_str"]')).toBeNull();
  });

  it('without lang the block stays plain text', () => {
    const { container } = render(<CodeBlock lang="plain" code="ssh -i k host" lines={undefined} />);
    expect(container.querySelector('[class*="sh_"]')).toBeNull();
    render(<CodeBlock lang="plain" label="x" lines={[{ code: 'ssh host' }]} />);
    expect(document.querySelector('code [class*="sh_"]')).toBeNull();
  });

  it('every colour is a theme-aware token, never a fixed colour', () => {
    for (const k of ['cmd', 'flag', 'var']) expect(css).toMatch(new RegExp(`\\.sh_${k}[^{]*\\{[^}]*`));
    // Strings, comments and operators have no colour at all.
    expect(css).not.toMatch(/\.sh_(str|com|op)\b/);
    const block = css.slice(css.indexOf('.sh_cmd'), css.indexOf('.sh_var') + 40);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
