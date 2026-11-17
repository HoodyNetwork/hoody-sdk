// CodeBlock syntax colour for json, js/ts, yaml, http, python and diff (kit/data/highlight.ts), plus `bash`/`sh` as names of
// the shell reading. Colour only: the tokens of a text join back to exactly that text, nothing is ever parsed as
// markup, and Copy gives the plain text.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup as cleanupRender, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CodeBlock } from './Ids';
import { HL_LANGS, HL_MAX, highlight, highlightLines, type HlLang, type HlToken } from './highlight';

const css = readFileSync(path.join(import.meta.dirname, 'Ids.module.css'), 'utf8');
const marks = (toks: readonly HlToken[]) => toks.filter((t) => t.kind !== 'text' && t.kind !== 'punct').map((t) => `${t.kind}:${t.text}`);
const k = (src: string, lang: HlLang) => marks(highlight(src, lang));

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});

describe('highlight: json', () => {
  it('tells keys from string values, and reads numbers and literals', () => {
    expect(k('{"name": "atlas", "port": 8080, "ok": true, "x": null, "f": -1.5e3}', 'json')).toEqual([
      'key:"name"', 'str:"atlas"', 'key:"port"', 'num:8080', 'key:"ok"', 'lit:true', 'key:"x"', 'lit:null', 'key:"f"', 'num:-1.5e3',
    ]);
  });
  it('keeps an escaped quote inside its string', () => {
    expect(k('{"a\\"b": "c\\"d"}', 'json')).toEqual(['key:"a\\"b"', 'str:"c\\"d"']);
  });
  it('reads a key across a newline before its colon, as one pretty-printed object', () => {
    expect(k('{\n  "rules": [\n    "a"\n  ]\n}', 'json')).toEqual(['key:"rules"', 'str:"a"']);
  });
});

describe('highlight: js/ts', () => {
  it('reads keywords, strings, numbers, calls and comments', () => {
    expect(k("const r = await fetch('/api', { method: \"POST\" }); // send", 'js')).toEqual([
      'kw:const', 'kw:await', 'fn:fetch', "str:'/api'", 'str:"POST"', 'com:// send',
    ]);
    expect(k('let n = 0x1f + 2.5; /* a\nb */ return n', 'ts')).toEqual(['kw:let', 'num:0x1f', 'num:2.5', 'com:/* a\nb */', 'kw:return']);
  });
  it('reads a template string across lines, and true/false/null/undefined as literals', () => {
    expect(k('x = `a\n${b}` ?? null || undefined && true', 'js')).toEqual(['str:`a\n${b}`', 'lit:null', 'lit:undefined', 'lit:true']);
  });
  it('reads TS type words as keywords', () => {
    expect(k('interface A { b: string }', 'ts')).toEqual(['kw:interface', 'kw:string']);
  });
});

describe('highlight: yaml', () => {
  it('reads keys, values, list items and comments', () => {
    expect(k('name: web # the app\nports:\n  - 8080\n  - "x: y"\nenabled: true\n', 'yaml')).toEqual([
      'key:name', 'com:# the app', 'key:ports', 'num:8080', 'str:"x: y"', 'key:enabled', 'lit:true',
    ]);
  });
  it('a number glued to a colon or dash is part of a plain word', () => {
    expect(k('image: ghcr.io/acme/web:1.4\ntag: v-2', 'yaml')).toEqual(['key:image', 'key:tag']);
  });
  it('a # inside a word is not a comment', () => {
    expect(k('url: http://a/b#c', 'yaml')).toEqual(['key:url']);
  });
});

describe('highlight: http', () => {
  it('reads the request line, header names and a JSON body', () => {
    expect(k('POST /api/v1/x HTTP/1.1\nContent-Type: application/json\n\n{"a": 1}', 'http')).toEqual([
      'kw:POST', 'meta:HTTP/1.1', 'key:Content-Type', 'key:"a"', 'num:1',
    ]);
  });
  it('reads a status line', () => {
    expect(k('HTTP/1.1 404 Not Found\nX-Request-Id: r1', 'http')).toEqual(['meta:HTTP/1.1', 'num:404', 'key:X-Request-Id']);
  });
});

describe('highlight: python', () => {
  it('reads keywords, def names, decorators, strings, numbers and comments', () => {
    expect(k('@app.get("/")\ndef read(x: int = 3):  # hi\n    return None', 'python')).toEqual([
      'meta:@app.get', 'str:"/"', 'kw:def', 'fn:read', 'kw:int', 'num:3', 'com:# hi', 'kw:return', 'lit:None',
    ]);
  });
  it('reads the name after def or class as a name, called or not', () => {
    expect(k('class Foo:\n    pass', 'python')).toEqual(['kw:class', 'fn:Foo', 'kw:pass']);
  });
  it('reads triple-quoted and prefixed strings', () => {
    expect(k('s = f"a{b}" + r\'\\d\' + """x\n"y"\n"""', 'python')).toEqual(['str:f"a{b}"', "str:r'\\d'", 'str:"""x\n"y"\n"""']);
  });
});

describe('highlight: lossless', () => {
  const samples = [
    '', '\n', '"', '`', "'''", '/*', '{"a":', '<img src=x onerror=alert(1)>', 'a\r\nb', '\u{1F600} "\u00e9"', '#', '@', '---\n- a: [1, {b: "c"}]',
    'GET / HTTP/1.1\nHost: x\n\n<b>hi</b>', 'def f():\n    """unterminated', 'x = /re"g/; y = "s"', '\\', '"\\', '  -   ', ':::',
  ];
  it('the tokens join back to exactly the text, in every language', () => {
    for (const lang of HL_LANGS) for (const src of samples) expect(highlight(src, lang).map((t) => t.text).join(''), `${lang} ${JSON.stringify(src)}`).toBe(src);
  });
  it('the same holds for random text', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
    const alphabet = ' \n\t"\'`#/*{}[]:,-@\\$<>=.0123456789abcdeHTP';
    for (let n = 0; n < 300; n++) {
      const src = Array.from({ length: Math.floor(rnd() * 60) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      for (const lang of HL_LANGS) expect(highlight(src, lang).map((t) => t.text).join('')).toBe(src);
    }
  });
  it('lines split at every newline and only there', () => {
    const lines = highlightLines('/* a\nb */ x\n"y"', 'js');
    expect(lines.map((l) => l.map((t) => t.text).join(''))).toEqual(['/* a', 'b */ x', '"y"']);
    expect(lines[1]![0]).toEqual({ kind: 'com', text: 'b */' });
  });
  it('a very long text is left as one plain token (no colour, no slow reading)', () => {
    const big = '{"a": 1}'.repeat(40_000);
    expect(highlight(big, 'json')).toEqual([{ kind: 'text', text: big }]);
  });
});

// A long digit run before a letter was read once per digit (quadratic, seconds below the cap).
describe('highlight: hostile input below the cap stays quick', () => {
  const n = HL_MAX - 10;
  const cases: [HlLang, string][] = [];
  for (const lang of HL_LANGS) {
    for (const tail of ['a', 'x', '$', '_', '.a', 'e', 'j']) cases.push([lang, '9'.repeat(n) + tail]);
    cases.push([lang, '0x' + 'f'.repeat(n) + 'g']);
    cases.push([lang, '1.' + '9'.repeat(n) + 'a']);
    cases.push([lang, '1e' + '9'.repeat(n) + 'a']);
    cases.push([lang, 'a: ' + '9'.repeat(n) + 'a']);
    cases.push([lang, '- '.repeat(n / 2)]);
    cases.push([lang, ('9a ').repeat(n / 3)]);
    // A word list: the def/class look-back once re-read the whole merged text before every word.
    cases.push([lang, 'a '.repeat(n / 2)]);
  }
  it.each(cases.map(([l, s]) => [l, s.slice(0, 12), s] as const))('%# %s %s…', (lang, _label, src) => {
    const t0 = performance.now();
    const toks = highlight(src, lang);
    const ms = performance.now() - t0;
    expect(toks.map((t) => t.text).join('')).toBe(src);
    // Linear input of this size reads in well under 200 ms; the quadratic readings took 10 s and more.
    expect(ms).toBeLessThan(2000);
  });
});

describe('a 100k digit run then a letter (the length bound)', () => {
  it.each(['js', 'ts', 'python'] as const)('%s reads it in under 50 ms', (lang) => {
    const src = '9'.repeat(HL_MAX - 1) + 'a';
    highlight('9a', lang); // warm the patterns so the bound measures the reading, not the first compile
    const t0 = performance.now();
    const toks = highlight(src, lang);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(toks.map((t) => t.text).join('')).toBe(src);
  });
});

describe('CodeBlock with a language', () => {
  it('shows coloured spans, never markup from the text, and copies the plain text', () => {
    const code = '{"html": "<img src=x onerror=alert(1)>", "n": 1}';
    const { container } = render(<CodeBlock code={code} lang="json" label="Rules" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('pre')!.textContent).toBe(code);
    expect(container.querySelector('pre')!.innerHTML).toContain('&lt;img');
    expect(container.querySelector('[class*="hl_key"]')!.textContent).toBe('"html"');
    expect(container.querySelector('[class*="hl_num"]')!.textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(written).toEqual([code]);
    cleanupRender();
  });

  it('colours each line of a multi-line block and keeps a string that spans lines', () => {
    const code = 'x = """a\nb"""\nprint(x)\n';
    const { container } = render(<CodeBlock code={code} lang="python" />);
    const lines = [...container.querySelectorAll('pre > span')];
    expect(lines).toHaveLength(3);
    expect(lines[1]!.querySelector('[class*="hl_str"]')!.textContent).toBe('b"""');
    expect(lines[2]!.querySelector('[class*="hl_fn"]')!.textContent).toBe('print');
    expect(container.querySelector('pre')!.textContent).toBe(code.slice(0, -1));
    cleanupRender();
  });

  it('bash and sh are the shell reading', () => {
    for (const lang of ['bash', 'sh'] as const) {
      const { container } = render(<CodeBlock code="curl -fsSL https://x | sh" lang={lang} prompt />);
      expect([...container.querySelectorAll('[class*="sh_cmd"]')].map((e) => e.textContent)).toEqual(['curl', 'sh']);
      expect(container.querySelector('[class*="sh_flag"]')!.textContent).toBe('-fsSL');
      cleanupRender();
    }
  });

  it('a step line in a language keeps its placeholder and colours its text; Copy stays off', () => {
    const { container } = render(<CodeBlock lang="json" lines={[{ code: ['{"id": "', { placeholder: 'computer' }, '"}'], caption: 'Body' }]} />);
    expect(screen.getByRole('img', { name: /computer/ })).toBeInTheDocument();
    expect(container.querySelector('[class*="hl_key"]')!.textContent).toBe('"id"');
    cleanupRender();
  });

  it('plain and unknown-to-colour blocks render no colour spans', () => {
    const { container } = render(<CodeBlock lang="plain" code={'{"a": 1}'} />);
    expect(container.querySelector('[class*="hl_"]')).toBeNull();
    cleanupRender();
  });
});

// Unified diffs. A hunk's counts decide which lines are content, so a removed line that
// starts with `--` is still removed text, and the next file's `---`/`+++` headers are headers again.
describe('highlight: diff', () => {
  const src = [
    'diff --git a/x.js b/x.js',
    'index 1a2b3c4..5d6e7f8 100644',
    '--- a/x.js',
    '+++ b/x.js',
    '@@ -1,3 +1,3 @@ function f() {',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    ' return a + b;',
  ].join('\n');
  it('reads file headers, the hunk line, removed and added lines; context stays plain', () => {
    expect(k(src, 'diff')).toEqual([
      'com:diff --git a/x.js b/x.js',
      'com:index 1a2b3c4..5d6e7f8 100644',
      'com:--- a/x.js',
      'com:+++ b/x.js',
      'meta:@@ -1,3 +1,3 @@',
      'del:-const b = 2;',
      'ins:+const b = 3;',
    ]);
  });
  it('inside a hunk, a removed `---` line and an added `+++` line are content, not headers', () => {
    const d = ['--- a/m.sql', '+++ b/m.sql', '@@ -1 +1 @@', '--- old note', '+++ new note', '--- a/n.sql', '+++ b/n.sql', '@@ -4 +4 @@', '-x', '+y'].join('\n');
    expect(k(d, 'diff')).toEqual([
      'com:--- a/m.sql', 'com:+++ b/m.sql', 'meta:@@ -1 +1 @@', 'del:--- old note', 'ins:+++ new note',
      'com:--- a/n.sql', 'com:+++ b/n.sql', 'meta:@@ -4 +4 @@', 'del:-x', 'ins:+y',
    ]);
  });
  it('context lines count toward both sides of the hunk, so the next file\'s headers are headers', () => {
    expect(k(['@@ -1,2 +1,2 @@', ' ctx', '-a', '+b', '--- a/next', '+++ b/next'].join('\n'), 'diff')).toEqual([
      'meta:@@ -1,2 +1,2 @@', 'del:-a', 'ins:+b', 'com:--- a/next', 'com:+++ b/next',
    ]);
  });
  // A blank CRLF context line read as "\r" once stopped counting, so the next file's headers read as lines.
  it('CRLF text reads as LF text: an empty context line counts, the next headers are headers, the text joins back', () => {
    const lf = ['@@ -1,2 +1,2 @@', '', '-old', '+new', '--- a/next', '+++ b/next', '@@ @@', '-x'].join('\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    const kinds = (src: string) => highlight(src, 'diff').filter((t) => t.kind !== 'text').map((t) => t.kind);
    expect(kinds(lf)).toEqual(['meta', 'del', 'ins', 'com', 'com', 'meta', 'del']);
    expect(kinds(crlf)).toEqual(kinds(lf));
    expect(highlight(crlf, 'diff').map((t) => t.text).join('')).toBe(crlf);
    expect(k(crlf, 'diff')).toContain('com:--- a/next\r');
  });
  it('a hunk line without counts (as models often write) still colours its lines; a `diff` line ends the hunk', () => {
    expect(k(['@@ @@', '-a', '+b', '--- not a header', ' c', 'diff --git a/q b/q', '--- a/q'].join('\n'), 'diff')).toEqual([
      'meta:@@ @@', 'del:-a', 'ins:+b', 'del:--- not a header', 'com:diff --git a/q b/q', 'com:--- a/q',
    ]);
  });
  it('a bare +/- list with no headers still reads as added and removed lines; `\\ No newline` is a comment', () => {
    expect(k('-old\n+new\n\\ No newline at end of file\n', 'diff')).toEqual(['del:-old', 'ins:+new', 'com:\\ No newline at end of file']);
  });
  it('CodeBlock lang="diff" draws added and removed lines in their colours, and Copy gives the plain text', async () => {
    const { container } = render(<CodeBlock lang="diff" code={src} label="patch" />);
    expect(container.querySelector('[class*="hl_del"]')!.textContent).toBe('-const b = 2;');
    expect(container.querySelector('[class*="hl_ins"]')!.textContent).toBe('+const b = 3;');
    expect(container.querySelector('pre')!.textContent).toBe(src);
    cleanupRender();
    // Copy gives the text as given: CRLF and the ending newline kept.
    const crlf = src.replace(/\n/g, '\r\n') + '\r\n';
    render(<CodeBlock lang="diff" code={crlf} label="patch" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(written).toEqual([crlf]);
    cleanupRender();
  });
});

describe('colour tokens', () => {
  // Each colour is a kit token checked at 4.5:1 or more on --hx-fill in both themes.
  const READABLE = new Set(['--hx-code-blue', '--hx-code-purple', '--hx-code-pink', '--hx-ok', '--hx-warn', '--hx-muted', '--hx-danger']);
  it('every hl_ class uses one of the readable kit colour tokens, nothing hard-coded', () => {
    const rules = [...css.matchAll(/\.hl_(\w+)\s*\{([^}]*)\}/g)];
    const kinds = rules.map((r) => r[1]);
    for (const kind of ['kw', 'str', 'num', 'lit', 'com', 'key', 'fn', 'meta', 'ins', 'del']) expect(kinds, kind).toContain(kind);
    for (const [, kind, body] of rules) {
      const colour = /(?:^|;|\s)color:\s*var\((--[\w-]+)\)/.exec(body!);
      expect(colour, `hl_${kind}`).not.toBeNull();
      expect(READABLE.has(colour![1]!), `hl_${kind} uses ${colour![1]}`).toBe(true);
    }
  });
});
