// The shipped bundle's module headers name no build location (scripts/term/build.ts rewrites them after the artifact
// check with shipHeaders): a header outside the working directory once spelled the checkout's or a scratch copy's path.
import { describe, expect, test } from 'bun:test';
import { bundleModuleList, outsideHeaders, shipHeaders, shippedHeaderPath } from './verify';

describe('shipped module headers', () => {
  test('a package header keeps the path from the first node_modules on', () => {
    expect(shippedHeaderPath('../../../../../../../../work/x/hub/node_modules/@opentui/core/index.node.js')).toBe('node_modules/@opentui/core/index.node.js');
    expect(shippedHeaderPath('../node_modules/react-reconciler/node_modules/scheduler/cjs/scheduler.production.js')).toBe('node_modules/react-reconciler/node_modules/scheduler/cjs/scheduler.production.js');
    expect(shippedHeaderPath('/opt/b/hub/node_modules/react/index.js')).toBe('node_modules/react/index.js');
  });
  test('any other header outside the working directory keeps its file name only', () => {
    expect(shippedHeaderPath('../../../../tmp/hub-term-styles-wmJCE9/css-tables.json')).toBe('css-tables.json');
  });
  test('only outside headers change; code, hub headers, virtual modules and licence banners stay byte for byte', () => {
    const code = [
      'var a = 1;',
      '',
      '// ../../../../../../../../work/sdk/hub/node_modules/react/cjs/react.production.js',
      '/**',
      ' * @license React',
      ' * react.production.js',
      ' */',
      'var r = 1;',
      '// ../../../../tmp/hub-term-styles-wmJCE9/css-tables.json',
      'var t = {};',
      '// /opt/b/hub/node_modules/scheduler/index.js',
      'var s = 1;',
      '// src/term/app/App.tsx',
      'var app = 1;',
      '// hub-term-styles:hub-term:style-tables',
      'var x = "// ../not/a/header.js";',
      '  // ../indented/comment.js',
      '',
    ].join('\n');
    const out = shipHeaders(code);
    expect(out).not.toMatch(/work\/sdk|\/opt\/|hub-term-styles-wmJCE9/);
    expect(outsideHeaders(code)).toHaveLength(3);
    expect(outsideHeaders(out)).toEqual([]);
    expect(out.split('\n')).toEqual(code.split('\n').map((l) => ({
      '// ../../../../../../../../work/sdk/hub/node_modules/react/cjs/react.production.js': '// node_modules/react/cjs/react.production.js',
      '// ../../../../tmp/hub-term-styles-wmJCE9/css-tables.json': '// css-tables.json',
      '// /opt/b/hub/node_modules/scheduler/index.js': '// node_modules/scheduler/index.js',
    } as Record<string, string>)[l] ?? l));
    expect(bundleModuleList(out).modules).toEqual(['node_modules/react/cjs/react.production.js', 'css-tables.json', 'node_modules/scheduler/index.js', 'src/term/app/App.tsx']);
  });
  test('a header whose path holds a space is rewritten like any other', () => {
    const code = 'var a = 1;\n// ../../my builds/hub/node_modules/react/index.js\nvar r = 1;\n// /opt/my builds/css-tables.json\nvar t = {};\n';
    const out = shipHeaders(code);
    expect(out).toBe('var a = 1;\n// node_modules/react/index.js\nvar r = 1;\n// css-tables.json\nvar t = {};\n');
    expect(out).not.toContain('my builds');
    expect(outsideHeaders(code)).toEqual(['../../my builds/hub/node_modules/react/index.js', '/opt/my builds/css-tables.json']);
    expect(outsideHeaders(out)).toEqual([]);
  });
  test('an outside header of a file type shipHeaders does not rewrite stays listed (the build fails on it)', () => {
    const code = 'var a = 1;\n// ../../../../work/x/hub/node_modules/@opentui/core/assets/parser.wasm\nvar w = 1;\n// /tmp/hub-term-x/LICENSE\nvar l = 1;\n';
    const out = shipHeaders(code);
    expect(out).toBe(code);
    expect(outsideHeaders(out)).toEqual(['../../../../work/x/hub/node_modules/@opentui/core/assets/parser.wasm', '/tmp/hub-term-x/LICENSE']);
  });
  test('a bundle with no outside header is returned unchanged', () => {
    const code = '// src/core/live.ts\nfunction live() { return 1; }\n// node_modules/react/index.js\nvar r = 1;\n';
    expect(shipHeaders(code)).toBe(code);
  });
});
