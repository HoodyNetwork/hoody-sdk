// Vitest: what the one-file build does to the code it inlines beside the bundle. The four auth scripts go through a
// minifier (no comments, no spare white space) and stay strict where their source was; hub-fonts.css loses its comment
// and line breaks before the fonts are inlined. The bundle and its CSS are minified by vite itself (production build,
// no source map, no comments: vite.config.mts `build`), which the last block pins.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as assembleLib from '../../scripts/build-single-assemble';

const lib = assembleLib as unknown as {
  keepStrict?: (name: string, src: string, min: string) => { text: string } | { problem: string };
  minifyPlainCss?: (css: string) => string;
  hasUseStrictDirective?: (code: string) => boolean;
  globalSurface?: (code: string) => string[];
  inlineFonts: (css: string, read: (rel: string) => Buffer) => string;
};
const HUB = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(HUB, rel), 'utf8');

describe('keepStrict: a minified auth script is strict where its source was', () => {
  const keep = (src: string, min: string) => (lib.keepStrict as NonNullable<typeof lib.keepStrict>)('x.js', src, min);

  it('a file that opens with the directive, after comments, gets it back at the top', () => {
    expect(keep("// note\n/* more */\n'use strict';\nvar a = 1;\n", 'var a=1;')).toEqual({ text: '"use strict";var a=1;' });
    expect(keep('"use strict";var a = 1;', '"use strict";var a=1;')).toEqual({ text: '"use strict";var a=1;' });
  });

  it('a wrapper function that opens with it makes the whole file strict', () => {
    expect(keep("window.X = (function () {\n  'use strict';\n  return 1;\n})();", 'window.X=function(){return 1}();')).toEqual({ text: '"use strict";window.X=function(){return 1}();' });
    expect(keep("(function () { 'use strict'; go(); })();", '(function(){go()})();')).toEqual({ text: '"use strict";(function(){go()})();' });
  });

  it('a sloppy file stays sloppy', () => {
    expect(keep('(function () { var p = 1; })();', '(function(){var p=1})();')).toEqual({ text: '(function(){var p=1})();' });
  });

  it('a directive it cannot keep, or an empty answer, is a problem and never a silent change', () => {
    expect(keep("var a = 1;\nfunction f() { 'use strict'; return a; }", 'var a=1;function f(){return a}')).toHaveProperty('problem');
    expect(keep('var a = 1;', '  ')).toHaveProperty('problem');
  });

  it('the four real scripts: two open with the directive, one with a strict wrapper, one is sloppy', () => {
    const strict = lib.hasUseStrictDirective as NonNullable<typeof lib.hasUseStrictDirective>;
    expect(['shared.js', 'token-auth.js', 'hub-boot-token.js', 'fouc.js'].map((n) => strict(read(`../public/auth/${n}`)))).toEqual([true, true, true, false]);
  });

  it('an output that lost or gained a window.* assignment refuses the build', () => {
    expect(keep('window.A = 1; window.Hub.open = f; window["B"] = 2;', 'window.A=1;window.Hub.open=f;window["B"]=2;')).toHaveProperty('text');
    const lost = keep('window.A = 1; window.Hub.open = f;', 'window.A=1;');
    expect(lost).toHaveProperty('problem');
    expect((lost as { problem: string }).problem).toContain('global surface changed');
    expect(keep('var a = 1;', 'var a=1;window.Z=a;')).toHaveProperty('problem');
    // A comment naming an assignment is not one, and a comparison is not an assignment.
    expect(keep('// window.Old = 1\nif (window.A === 1) go();', 'if(window.A===1)go();')).toEqual({ text: 'if(window.A===1)go();' });
    expect((lib.globalSurface as NonNullable<typeof lib.globalSurface>)(read('../public/auth/hub-boot-token.js'))).toContain('HubBootToken');
    // The output is one line: a `//` in a string before an assignment must not hide it (the output has no comments).
    expect(keep('var u = "https://x";\nwindow.A = u;', 'var u="https://x";window.A=u;')).toEqual({ text: 'var u="https://x";window.A=u;' });
    expect(keep('var u = "https://x";\nwindow.A = u;', 'var u="https://x";')).toHaveProperty('problem');
  });
});

describe('minifyPlainCss: hub-fonts.css without its comment', () => {
  it('drops comments and line breaks, keeps every rule and the font addresses for inlineFonts', () => {
    const css = (lib.minifyPlainCss as NonNullable<typeof lib.minifyPlainCss>)(read('../public/auth/hub-fonts.css'));
    expect(css).not.toMatch(/\/\*|\n/);
    expect(css.startsWith('@font-face{')).toBe(true);
    expect(css.match(/@font-face\{/g)).toHaveLength(6);
    const seen: string[] = [];
    const inlined = lib.inlineFonts(css, (rel) => { seen.push(rel); return Buffer.from('f'); });
    expect(seen).toHaveLength(6);
    expect(inlined).not.toContain('url("fonts/');
  });
});

describe('the one-file build minifies everything it inlines', () => {
  it('build-single.ts sends each auth script through the minifier and the fonts css through minifyPlainCss', () => {
    const script = read('scripts/build-single.ts');
    expect(script).toContain("new Bun.Transpiler({ loader: 'js', target: 'browser', minifyWhitespace: true })");
    expect(script).toContain('keepStrict(n, src, minifier.transformSync(src))');
    expect(script).toContain("inlineFonts(minifyPlainCss(fs.readFileSync(path.join(PUBLIC_AUTH, 'hub-fonts.css'), 'utf8'))");
    expect(script).toContain('problems.push(...minifyProblems);');
  });

  it('vite builds it in production mode with no source map and no comments, and nothing turns minify off', () => {
    const single = read('vite.single.config.mts');
    const base = read('vite.config.mts');
    expect(single).toContain("command: 'build', mode: 'production'");
    expect(base).toContain('sourcemap: false');
    expect(base).toContain('comments: false');
    for (const cfg of [single, base]) expect(cfg).not.toMatch(/\b(?:minify|cssMinify)\s*:/);
    expect(read('scripts/build-single.ts')).toContain("NODE_ENV: 'production'");
  });
});
