// Diagnostics as allowlisted records (diagnostic.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A record carries a fixed code (the error's own code, a CODE: prefix, else UNHANDLED), a standard class name, component names and a page id; never the message, a cause, a stack or a body | 'records only' |
// | 2 | Unsafe component names, page ids and class names are dropped or replaced; detail exists only when asked and is sanitised | 'unsafe fields and detail' |
// | 3 | The end reason a host reports: crash, boot failure, expiry, sign-out, suspension, quit, closed | 'end reasons' |
// | 4 | By value, not shape: a code-shaped canary (TOKEN_CANARY_ABC123) as `code` or `CODE:` prefix is UNHANDLED; a trapped member outside STRICT_GLOBALS reads `window.*`; a console `what` must be a console method | 'vocabulary by value' |
// | 6 | A trap's `where`: its first Hub source frames as src-relative file:line (strict-globals skipped); absolute paths, `..` and frames outside src (a ship bundle, node_modules) give nothing | 'trap frames' |
// | 5 | diagnostic-codes.gen.ts equals a fresh scan of the Hub's source | 'vocabulary current' |
// | 7 | A bare TERM_ prefix (`'TERM_X_' + s`, `'TERM_' + s`, `.concat`, a const, `as const`, a template head) is found by line and refuses the scan, as does any TERM_ entry ending in `_` that reaches the vocabulary; a whole code, a `CODE:` template, a template type and another family's prefix are not | 'bare prefixes refused' |
import { expect, test } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { codeOf, diagnosticLine, diagnosticOf, publicDiagnostic, srcFrames, trapLabel } from './diagnostic';
import os from 'node:os';
import { GEN_FILE, renderDiagnosticCodes, termPrefixLiterals, scanDiagnosticCodes, literalTexts } from '../../../scripts/term/diagnostic-codes';
import { endReasonOf } from './lifecycle';

const canary = 'hdy_CANARY_token_abc123';

test('records only', () => {
  const e = Object.assign(new TypeError(`request failed: Bearer ${canary}`), { cause: { body: canary }, response: { body: canary } });
  const d = diagnosticOf('crash', e, { where: ['Keys', 'PageView'] });
  expect(d).toEqual({ kind: 'crash', code: 'UNHANDLED', name: 'TypeError', where: ['Keys', 'PageView'] });
  expect(JSON.stringify(d) + diagnosticLine(d)).not.toContain('CANARY');
  expect(codeOf({ status: 403, code: 'ACCOUNT_BANNED', message: canary })).toBe('ACCOUNT_BANNED');
  expect(codeOf(new Error('TERM_SESSION_ENDED: ' + canary))).toBe('TERM_SESSION_ENDED');
  expect(codeOf({ code: 'not a code ' + canary })).toBe('UNHANDLED');
  expect(codeOf(canary)).toBe('UNHANDLED');
});

test('unsafe fields and detail', () => {
  const e = Object.assign(new Error('Boom \x1b]52;c;evil\x07 ' + canary), { name: 'Secret ' + canary });
  const d = diagnosticOf('page', e, { where: ['Ok', 'bad name with spaces', '<script>'], page: '../../etc', what: 'x y' });
  expect(d.name).toBe('Error');
  expect(d.where).toEqual(['Ok']);
  expect(d.page).toBeUndefined();
  expect(d.what).toBeUndefined();
  expect(d.detail).toBeUndefined();
  const dev = diagnosticOf('page', e, { detail: true });
  expect(dev.detail).toContain('Boom');
  expect(dev.detail).not.toContain('\x1b');
  expect(publicDiagnostic(dev).detail).toBeUndefined();
});

test('end reasons', () => {
  expect(endReasonOf({ reason: 'crash', code: 1, error: new Error('x') }, false)).toBe('crashed');
  expect(endReasonOf({ reason: 'boot-failed', code: 1, error: null }, false)).toBe('boot-failed');
  expect(endReasonOf({ reason: 'expired', code: 0 }, false)).toBe('expired');
  expect(endReasonOf({ reason: 'signed-out', code: 0 }, false)).toBe('signed-out');
  expect(endReasonOf({ reason: 'quit', code: 0 }, true)).toBe('suspended');
  expect(endReasonOf({ reason: 'quit', code: 0 }, false)).toBe('quit');
  expect(endReasonOf({ reason: 'abort', code: 0 }, false)).toBe('closed');
  expect(endReasonOf({ reason: 'signal', code: 143, signal: 'SIGTERM' }, false)).toBe('closed');
});

test('vocabulary by value', () => {
  const shaped = 'TOKEN_CANARY_ABC123';
  expect(codeOf({ code: shaped })).toBe('UNHANDLED');
  expect(codeOf(new Error(`${shaped}: leaked`))).toBe('UNHANDLED');
  expect(codeOf(shaped)).toBe('UNHANDLED');
  expect(codeOf({ code: 'TERM_SESSION_ENDED' })).toBe('TERM_SESSION_ENDED');
  const trap = diagnosticOf('trap', new Error('TERM_GLOBAL: x'), { what: `window.${shaped}` });
  expect(trap.what).toBe('window.*');
  expect(diagnosticOf('trap', new Error('TERM_GLOBAL: x'), { what: 'window.localStorage' }).what).toBe('window.localStorage');
  expect(diagnosticOf('trap', new Error('TERM_GLOBAL: x'), { what: shaped }).what).toBe('global');
  expect(diagnosticOf('console', 'x', { what: shaped }).what).toBeUndefined();
  expect(diagnosticOf('console', 'x', { what: 'warn' }).what).toBe('warn');
  expect(trapLabel(`self.${shaped}`)).toBe('self.*');
  const line = diagnosticLine(publicDiagnostic(diagnosticOf('crash', { code: shaped, message: `${shaped}: x` }, { what: shaped })));
  expect(line).not.toContain(shaped);
});

test('a quoted word in a comment or JSX text is no code; a literal is', () => {
  const src = `// it drew "HOOD" here\nconst a = 'TERM_REAL_CODE';\nconst e = new Error(\`TERM_TPL: \${a}\`);\n/* 'NOT_A_CODE' */\nconst b = <Box>{/* it drew "ALSO_NOT" */}don't "JSX_TEXT"</Box>;\nconst c = ['AFTER_JSX'];\n`;
  const codes = literalTexts(src, 'x.tsx').join(' ');
  expect(codes).toContain("'TERM_REAL_CODE'");
  expect(codes).toContain('TERM_TPL:');
  expect(codes).toContain("'AFTER_JSX'");
  for (const no of ['HOOD', 'NOT_A_CODE', 'ALSO_NOT', 'JSX_TEXT']) expect(codes).not.toContain(no);
});

test('bare prefixes refused', () => {
  const src = [
    "const a = 'TERM_BOOT_' + s;",
    'const b = `TERM_PAGE_${s.toUpperCase()}`;',
    "const c = 'TERM_CAT_'.concat(s);",
    "const P = 'TERM_CONST_';",
    "const f = 'TERM_' + kind;",
    'const g = `TERM_${kind}_FAILED`;',
    "const h = ('TERM_AS_' as const) + s;",
    "const w = 'TERM_WHOLE';",
    'const d = `TERM_X: ${s}`;',
    "const e = 'JOURNAL_' + s;",
    'type T = `TERM_TYPE_${string}`;',
  ].join('\n');
  expect(termPrefixLiterals(src, 'x.ts')).toEqual(["1: 'TERM_BOOT_'", "2: 'TERM_PAGE_'", "3: 'TERM_CAT_'", "4: 'TERM_CONST_'", "5: 'TERM_'", "6: 'TERM_'", "7: 'TERM_AS_'"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-built-'));
  try {
    fs.writeFileSync(path.join(dir, 'boot.ts'), "throw new Error('TERM_BOOT_' + state);\n");
    expect(() => scanDiagnosticCodes(dir)).toThrow("boot.ts:1: 'TERM_BOOT_'");
    // A prefix that reaches the vocabulary by another form (a `CODE:` message) refuses the scan too.
    fs.writeFileSync(path.join(dir, 'boot.ts'), "throw new Error('TERM_BOOT_: ' + state);\n");
    expect(() => scanDiagnosticCodes(dir)).toThrow("vocabulary: 'TERM_BOOT_'");
    fs.writeFileSync(path.join(dir, 'boot.ts'), "throw new Error('TERM_BOOT_FAILED');\n");
    expect(scanDiagnosticCodes(dir)).toEqual(['TERM_BOOT_FAILED', 'UNHANDLED']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('vocabulary current', () => {
  const fresh = renderDiagnosticCodes(scanDiagnosticCodes(path.join(import.meta.dir, '../..')));
  // Out of date: run `bun scripts/term/diagnostic-codes.ts` (a code added to the Hub's source joins the vocabulary).
  expect(fs.readFileSync(GEN_FILE, 'utf8')).toBe(fresh);
}, 60_000); // parses every source file (literals only, comments and JSX text skipped)

test('trap frames', () => {
  const stack = [
    'Error: document',
    '    at trap (/home/someone/hub/src/term/env/strict-globals.ts:120:5)',
    '    at textWidth (/home/someone/hub/src/kit/widgets/agentHints.ts:73:11)',
    '    at Hints (/home/someone/hub/src/kit/widgets/Hints.term.tsx:12:3)',
    '    at render (/home/someone/hub/node_modules/react/cjs/react.js:9:1)',
    '    at x (/opt/hoody/hub-term.js:1:99999)',
    '    at y (/home/someone/hub/src/pages/api/page.ts:4:2)',
    '    at z (/home/someone/hub/src/pages/api/more.ts:5:2)',
  ].join('\n');
  expect(srcFrames(stack)).toEqual(['kit/widgets/agentHints.ts:73', 'kit/widgets/Hints.term.tsx:12', 'pages/api/page.ts:4']);
  expect(srcFrames('Error\n    at a (/opt/hoody/hub-term.js:1:2)')).toEqual([]);
  const d = diagnosticOf('trap', new Error('TERM_GLOBAL: document'), { what: 'document', where: [...srcFrames(stack), '/home/someone/x.ts:1', '../x.ts:1'] });
  expect(d.where).toEqual(['kit/widgets/agentHints.ts:73', 'kit/widgets/Hints.term.tsx:12', 'pages/api/page.ts:4']);
  expect(JSON.stringify(d)).not.toContain('someone');
});
