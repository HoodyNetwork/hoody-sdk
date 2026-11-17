// scripts/build-single-assemble.ts: the assembled file loads nothing from outside itself, its CSP names every inline block,
// and it carries the package's notices in one comment.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_LICENSES, assemble, buildCsp, externalRefs, inlineFonts, noticeComment, rawTextProblem } from '../../scripts/build-single-assemble';
import { FILE_MEMORY_SCRIPT } from './fileMemory';

const STAGE = `<!DOCTYPE html>
<html data-hub-standalone="">
<head>
  <meta charset="UTF-8">
  <title>Hub</title>
  <!-- hub:single-head -->
  <script type="module" crossorigin src="../../assets/hub-AAA.js"></script>
  <link rel="stylesheet" crossorigin href="../../assets/style-BBB.css">
</head>
<body><div id="root"></div></body>
</html>`;
const sha = (t: string) => `'sha256-${createHash('sha256').update(t, 'utf8').digest('base64')}'`;
const NOTICES = [['THIRD-PARTY-NOTICES.md', '| react | MIT |'], ['LICENSE', 'Apache License, Version 2.0']] as const;

function input(js = 'const w=new URL(`voice-x.worklet-1.js`,import.meta.url).href;console.log("</script>")', extra: Record<string, string> = {}) {
  return {
    stageHtml: STAGE,
    assets: new Map(Object.entries({ 'hub-AAA.js': js, 'style-BBB.css': 'body{color:red}', 'voice-x.worklet-1.js': 'registerProcessor("x",class{})', ...extra })),
    scripts: [['shared.js', 'var a = 1;']] as const,
    fontsCss: '@font-face{src:url("data:font/woff2;base64,AA")}',
    faviconSvg: Buffer.from('<svg/>'),
    notices: NOTICES,
  };
}
const build = (js?: string, extra?: Record<string, string>) => assemble(input(js, extra));

describe('assemble', () => {
  it('one file: CSP first, every inline block hashed, the worklet as a blob URL, no outside reference', () => {
    const { html, problems } = build();
    expect(problems).toEqual([]);
    expect(html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(html.indexOf('<script'));
    expect(html).not.toContain('assets/');
    expect(html).not.toContain('hub:single-head');
    expect(html).toContain('URL.createObjectURL(new Blob([');
    expect(html).toContain('<\\/script>');
    // The file knows its Hoody (shared.js): no runtime block names one.
    expect(html).not.toContain('hub-runtime');
    const csp = /content="([^"]+)"/.exec(html)?.[1] ?? '';
    for (const m of html.matchAll(/<(script|style)(?: type="module")?>([\s\S]*?)<\/\1>/g)) expect(csp).toContain(sha(m[2] ?? ''));
    expect(csp).not.toContain('unsafe-inline');
    expect(externalRefs(html)).toEqual([]);
  });

  it('the memory-only guard for file:// is the first script of the page, hashed like the rest', () => {
    const { html, problems } = build();
    expect(problems).toEqual([]);
    const first = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(first).toBe(FILE_MEMORY_SCRIPT);
    expect(html.indexOf(FILE_MEMORY_SCRIPT)).toBeLessThan(html.indexOf('var a = 1;'));
    expect(/content="([^"]+)"/.exec(html)?.[1]).toContain(sha(FILE_MEMORY_SCRIPT));
  });

  it('refuses an asset the bundle does not name exactly once, and a second entry', () => {
    expect(build('let a=1', {}).problems).toContainEqual(expect.stringContaining('voice-x.worklet-1.js'));
    expect(build(undefined, { 'other.js': 'x' }).problems).toContainEqual(expect.stringContaining('other.js'));
    expect(assemble({ stageHtml: STAGE.replace('</head>', '<script type="module" src="assets/two.js"></script></head>'), assets: new Map([['hub-AAA.js', 'x'], ['two.js', 'y']]), scripts: [], fontsCss: '', faviconSvg: Buffer.from(''), notices: NOTICES }).problems)
      .toContainEqual(expect.stringContaining('one module script'));
  });

  it('refuses inline text the HTML parser would end early', () => {
    expect(rawTextProblem('a</script>b', 'script')).toMatch(/<\/script/);
    expect(rawTextProblem('a<!--b', 'script')).toMatch(/<!--/);
    expect(rawTextProblem('a</style>', 'style')).toMatch(/<\/style/);
    expect(assemble({ stageHtml: STAGE, assets: new Map([['hub-AAA.js', 'x'], ['style-BBB.css', '']]), scripts: [['shared.js', 'x="</script>"']], fontsCss: '', faviconSvg: Buffer.from(''), notices: NOTICES }).problems)
      .toContainEqual(expect.stringContaining('shared.js'));
  });
});

describe('externalRefs', () => {
  it('names every src/href that is not data:, blob: or a fragment, and file-loading links', () => {
    expect(externalRefs('<img src="https://x.test/a.png"><a href="#/x"></a><link rel="icon" href="data:x">')).toEqual(['src="https://x.test/a.png"']);
    expect(externalRefs('<link rel="stylesheet" href="data:text/css,">')).toContainEqual(expect.stringContaining('<link>'));
    expect(externalRefs('<script src="data:text/javascript,1"></script>')).toContainEqual(expect.stringContaining('<script src>'));
    // Text inside inline code is not an attribute.
    expect(externalRefs('<script>const s = \'<img src="https://x.test">\';</script>')).toEqual([]);
  });
});

describe('inlineFonts and buildCsp', () => {
  it('turns each font file into a data: URL', () => {
    expect(inlineFonts('src:url("fonts/a.woff2") format("woff2")', () => Buffer.from('hi'))).toBe('src:url("data:font/woff2;base64,aGk=") format("woff2")');
  });
  it('the policy allows no inline code by keyword and no outside script', () => {
    const csp = buildCsp(["'sha256-a'"], ["'sha256-b'"]);
    expect(csp).toMatch(/script-src 'sha256-a' blob:;/);
    expect(csp).toMatch(/style-src 'sha256-b';/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
});

describe('notices', () => {
  const csp = (html: string) => /content="([^"]+)"/.exec(html)?.[1];

  it('one comment right after the CSP meta carries every notice; the charset stays in the first 1024 bytes; no hash changes', () => {
    const { html, problems } = build();
    expect(problems).toEqual([]);
    const comments = html.match(/<!--[\s\S]*?-->/g) ?? [];
    expect(comments).toHaveLength(1);
    const comment = comments[0] ?? '';
    expect(comment).toContain('===== THIRD-PARTY-NOTICES.md =====\n\n| react | MIT |');
    expect(comment).toContain('===== LICENSE =====\n\nApache License, Version 2.0');
    expect(html.indexOf(comment)).toBeGreaterThan(html.indexOf('http-equiv="Content-Security-Policy"'));
    expect(html.indexOf(comment)).toBeLessThan(html.indexOf('<style'));
    expect(html.indexOf(comment)).toBeLessThan(html.indexOf('<script'));
    const charset = '<meta charset="UTF-8">';
    expect(Buffer.byteLength(html.slice(0, html.indexOf(charset) + charset.length), 'utf8')).toBeLessThanOrEqual(1024);
    // A comment is no inline code: other notices, the same policy.
    expect(csp(assemble({ ...input(), notices: [['LICENSE', 'other text']] }).html)).toBe(csp(html));
  });

  it('refuses the file without notices, with an empty one, or with text that would end the comment', () => {
    expect(assemble({ ...input(), notices: [] }).problems).toContainEqual(expect.stringContaining('notices'));
    for (const bad of ['', ' \n ', 'a --> b', 'a <!-- b', 'a --!> b']) {
      expect(assemble({ ...input(), notices: [['LICENSE', bad]] }).problems, JSON.stringify(bad)).toContainEqual(expect.stringContaining('notices: LICENSE'));
    }
    expect(noticeComment([['LICENSE', 'x']])).toEqual({ text: expect.stringContaining('===== LICENSE =====\n\nx') });
  });

  it('the real ones: every package of the Hub section of THIRD-PARTY-NOTICES.md and every license text reach the file', () => {
    const hubRoot = path.resolve(__dirname, '../../..');
    const read = (file: string) => fs.readFileSync(file, 'utf8');
    const notices = read(path.join(hubRoot, '..', 'THIRD-PARTY-NOTICES.md'));
    const start = notices.indexOf('\n## Hoody Hub');
    expect(start).toBeGreaterThan(0);
    const section = notices.slice(start, notices.indexOf('\n## ', start + 1));
    // First column of each table row whose license is MIT, ISC or Apache-2.0: the packages the one file bundles.
    const packages = [...section.matchAll(/^\| ([^|]+) \| (?:MIT|ISC|Apache-2\.0) \|/gm)].flatMap((m) => (m[1] ?? '').split(',').map((s) => s.trim()));
    expect(packages).toEqual(expect.arrayContaining(['react', 'react-dom', 'react-aria-components', '@tanstack/react-query', '@tanstack/react-router', 'qrcode']));
    // The named font licenses are the folder's, and each family hub-fonts.css inlines has one.
    const fonts = path.join(hubRoot, 'public', 'auth', 'fonts', 'LICENSES');
    expect(fs.readdirSync(fonts).filter((n) => n.endsWith('.txt')).sort()).toEqual([...FONT_LICENSES].sort());
    const families = new Set([...read(path.join(hubRoot, 'public', 'auth', 'hub-fonts.css')).matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1] ?? ''));
    expect(families.size).toBeGreaterThan(0);
    for (const f of families) expect(FONT_LICENSES, f).toContain(`OFL-${(f.split(' ')[0] ?? '').toLowerCase()}.txt`);
    const parts = [
      ['THIRD-PARTY-NOTICES.md', notices] as const,
      ['LICENSE', read(path.join(hubRoot, 'LICENSE'))] as const,
      ...FONT_LICENSES.map((n) => [`public/auth/fonts/LICENSES/${n}`, read(path.join(fonts, n))] as const),
    ];
    const { html, problems } = assemble({ ...input(), notices: parts });
    expect(problems).toEqual([]);
    const comment = /<!--[\s\S]*?-->/.exec(html)?.[0] ?? '';
    for (const p of packages) expect(comment, p).toContain(p);
    expect(comment).toContain('Permission is hereby granted, free of charge'); // MIT
    expect(comment).toContain('Permission to use, copy, modify, and/or distribute'); // ISC
    expect(comment).toContain('Apache License');
    expect(comment.match(/SIL OPEN FONT LICENSE/g)).toHaveLength(FONT_LICENSES.length);
  });
});
