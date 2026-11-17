// The pure half of hub:build-single (build-single.ts runs the build and writes the file): assembling the one HTML
// file from the stage, its CSP and the refusals. No file system, no process: unit-tested in
// hub/src/standalone/bundle.single.test.ts, which the web tsconfig also checks.
import crypto from 'node:crypto';
import { FILE_MEMORY_SCRIPT } from '../src/standalone/fileMemory';

export const SIZE_BUDGET = 14 * 1024 * 1024;
/** The classic scripts the page runs before the bundle, in order (served order: fouc, shared; then the on-demand two). */
export const INLINE_SCRIPTS = ['fouc.js', 'shared.js', 'token-auth.js', 'hub-boot-token.js'] as const;
const HEAD_MARK = '<!-- hub:single-head -->';

const sha = (text: string): string => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** Text safe inside <script> or <style>: no closing tag and no comment opener the HTML parser would act on. */
export function rawTextProblem(text: string, tag: 'script' | 'style'): string | null {
  if (new RegExp(`</${tag}`, 'i').test(text)) return `holds </${tag}`;
  if (tag === 'script' && /<!--/.test(text)) return 'holds <!--';
  return null;
}

/** `</script` inside the bundle can only sit in a string, template or regex literal (comments are stripped): `<\/` reads
 *  the same there. */
const escapeScript = (js: string): string => js.replace(/<\/(script)/gi, '<\\/$1');

const dataUrl = (type: string, bytes: Buffer): string => `data:${type};base64,${bytes.toString('base64')}`;

/** A stylesheet of plain rules (hub-fonts.css) without its comments and line breaks. Run it before inlineFonts: a data:
 *  URL is base64, which can hold `/` but never `*`, yet there is no reason to scan 150 KB of it. */
export function minifyPlainCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').trim();
}

// The next five are copied from the API's own build step, which makes the served copies of these same
// scripts: the one-file build keeps the same two promises (strict stays strict, every `window.*` assignment survives)
// by the same rules. Change them there and here together (bundle.single.minify.test.ts compares the two files).
/** Crude comment removal, used only to decide what the checks compare, never to produce output. */
export function stripCommentsForComparison(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
/** `window.*` assignment targets (`window.Foo =`, `window.Hub.open =`, `window['Foo'] =`) of comment-free code, sorted. */
export function assignedGlobals(bare: string): string[] {
  const found = new Set<string>();
  for (const m of bare.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) found.add(m[1] as string);
  for (const m of bare.matchAll(/window\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*=(?![=>])/g)) found.add(m[1] as string);
  for (const m of bare.matchAll(/window\[['"]([^'"]+)['"]\]\s*=(?![=>])/g)) found.add(m[1] as string);
  return [...found].sort();
}
/** The same of a source file: its comments are removed first (prose there names assignments the code does not make). */
export function globalSurface(code: string): string[] {
  return assignedGlobals(stripCommentsForComparison(code));
}
export const FILE_PROLOGUE = /^(['"])use strict\1\s*;?/;
/** `(function () { 'use strict';` and `window.X = (function () { 'use strict';` */
export const WRAPPER_DIRECTIVE =
  /^(?:[\w.$]+(?:\[['"][^'"]+['"]\])?\s*=\s*)?\(?\s*function\s*\w*\s*\([^)]*\)\s*\{\s*(['"])use strict\1\s*;/;
/** True when the source runs under strict mode: a file prologue, or the first statement of the function wrapping it. */
export function hasUseStrictDirective(code: string): boolean {
  const body = stripCommentsForComparison(code).replace(/^#!.*\n/, '').replace(/^\s+/, '');
  return FILE_PROLOGUE.test(body) || WRAPPER_DIRECTIVE.test(body);
}
const ANY_STRICT = /(['"])use strict\1/;

/**
 * A classic auth script after the minifier, checked the way the served copies are (by the API's
 * own build step). Bun's transpiler drops `'use strict'` directives (the file's own and a wrapper
 * function's), so one is put back at the top of the file when the source runs strict. Answers the text, or a problem
 * (the build is refused) when the output is empty, when it no longer assigns the same `window.*` names as the source,
 * or when the source holds a directive this rule cannot keep.
 *
 * One difference from the served rule, on purpose: the output is scanned as it is (assignedGlobals), not through
 * stripCommentsForComparison. The minified output is one line with no comments, and that crude strip cuts a line at the
 * first `//` it meets, inside a string too, which here would be nearly the whole script (measured on shared.js: every
 * assignment "lost").
 */
export function keepStrict(name: string, src: string, min: string): { text: string } | { problem: string } {
  if (!min.trim()) return { problem: `${name}: the minifier answered nothing` };
  const before = globalSurface(src);
  const after = assignedGlobals(min);
  if (before.join(',') !== after.join(',')) return { problem: `${name}: global surface changed: source defines [${before.join(', ')}], output defines [${after.join(', ')}]` };
  if (hasUseStrictDirective(src)) return { text: FILE_PROLOGUE.test(min) ? min : `"use strict";${min}` };
  if (ANY_STRICT.test(stripCommentsForComparison(src)) && !ANY_STRICT.test(min)) return { problem: `${name}: holds a 'use strict' the minifier dropped and the file does not open with` };
  return { text: min };
}

/** hub-fonts.css with every url("fonts/x.woff2") as a data: URL. */
export function inlineFonts(css: string, readFont: (rel: string) => Buffer): string {
  return css.replace(/url\("?(fonts\/[\w.-]+\.woff2)"?\)/g, (_m, rel: string) => `url("${dataUrl('font/woff2', readFont(rel))}")`);
}

/** The license of each font family hub-fonts.css inlines (public/auth/fonts/LICENSES/): Geist and Geist Mono, Oxanium.
 *  Named, not listed from the folder, so a missing one refuses the file. A new font family adds its file here. */
export const FONT_LICENSES = ['OFL-geist.txt', 'OFL-oxanium.txt'] as const;

/** Text that ends an HTML comment early or opens another one. */
const COMMENT_BREAKERS = /<!--|-->|--!>/;

/**
 * The text of the one comment that carries the file's notices: a short head, then each notice file under its name
 * (build-single.ts reads them: the package's THIRD-PARTY-NOTICES.md, the Apache License 2.0, the font licenses).
 * Answers a problem (the build is refused) when there is no notice, when one is empty, or when one holds text that
 * would end the comment early.
 */
export function noticeComment(parts: ReadonlyArray<readonly [string, string]>): { text: string } | { problem: string } {
  if (parts.length === 0) return { problem: 'notices: none to carry' };
  for (const [name, text] of parts) {
    if (!text.trim()) return { problem: `notices: ${name} is missing or empty` };
    if (COMMENT_BREAKERS.test(text)) return { problem: `notices: ${name} holds text that would end the HTML comment` };
  }
  const head = [
    'Hoody Hub, one-file build. Copyright Hoody Pte Ltd. Licensed under the Apache License, Version 2.0 (LICENSE below).',
    'It bundles the third-party code, fonts and marks named in the "Hoody Hub" section of THIRD-PARTY-NOTICES.md below;',
    'their license texts follow.',
  ].join('\n');
  return { text: [head, ...parts.map(([name, text]) => `===== ${name} =====\n\n${text.trim()}`)].join('\n\n') };
}

/** The page's CSP: inline code only by hash; the API, realm hosts and computers are chosen at run time (https). */
export function buildCsp(scriptHashes: readonly string[], styleHashes: readonly string[]): string {
  return [
    "default-src 'none'",
    `script-src ${scriptHashes.join(' ')} blob:`,
    `style-src ${styleHashes.join(' ')}`,
    'connect-src https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*',
    'img-src data: blob: https:',
    'media-src data: blob: https:',
    'font-src data:',
    'worker-src blob:',
    'frame-src https:',
    'form-action https:',
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export interface Assembled {
  html: string;
  problems: string[];
}

/** The one file from the vite stage: `stageHtml` and its assets (name → text), the auth scripts, the fonts css and the
 *  notices (name → text, see noticeComment). */
export function assemble(o: {
  stageHtml: string;
  assets: ReadonlyMap<string, string>;
  scripts: ReadonlyArray<readonly [string, string]>;
  fontsCss: string;
  faviconSvg: Buffer;
  notices: ReadonlyArray<readonly [string, string]>;
}): Assembled {
  const problems: string[] = [];
  const notice = noticeComment(o.notices);
  if ('problem' in notice) problems.push(notice.problem);
  const moduleTag = /<script type="module"[^>]*\bsrc="(?:\.\.\/)*assets\/([\w.-]+\.js)"[^>]*><\/script>\s*/g;
  const styleTag = /<link rel="stylesheet"[^>]*\bhref="(?:\.\.\/)*assets\/([\w.-]+\.css)"[^>]*>\s*/g;
  const entries = [...o.stageHtml.matchAll(moduleTag)].map((m) => m[1] as string);
  const styles = [...o.stageHtml.matchAll(styleTag)].map((m) => m[1] as string);
  if (entries.length !== 1) problems.push(`expected one module script in the stage html, found ${entries.length}`);
  if (styles.length > 1) problems.push(`expected at most one stylesheet, found ${styles.length}`);
  const entry = entries[0] ?? '';
  let js = o.assets.get(entry) ?? '';
  if (!js) problems.push(`missing bundle ${entry}`);

  // Every other emitted .js is a worklet the bundle names as new URL(`<file>`, import.meta.url).href: a blob URL here.
  const used = new Set<string>([entry, ...styles]);
  for (const [name, code] of o.assets) {
    if (used.has(name) || !name.endsWith('.js')) continue;
    const ref = `new URL(\`${name}\`,import.meta.url).href`;
    const n = js.split(ref).length - 1;
    if (n !== 1) { problems.push(`asset ${name}: expected one reference as ${ref}, found ${n}`); continue; }
    js = js.replace(ref, `URL.createObjectURL(new Blob([${JSON.stringify(code)}],{type:"text/javascript"}))`);
    used.add(name);
  }
  for (const name of o.assets.keys()) if (!used.has(name)) problems.push(`asset ${name} is not inlined`);
  js = escapeScript(js);

  const css = styles.map((n) => o.assets.get(n) ?? '').join('\n');
  const fonts = o.fontsCss;
  // The memory-only guard for a page opened as a file runs before every other script (src/standalone/fileMemory.ts).
  const inlineScripts = [['fileMemory', FILE_MEMORY_SCRIPT] as const, ...o.scripts].map(([name, text]) => {
    const p = rawTextProblem(text, 'script');
    if (p) problems.push(`${name} ${p}`);
    return text;
  });
  for (const [label, text, tag] of [['bundle', js, 'script'], ['css', css, 'style'], ['fonts', fonts, 'style']] as const) {
    const p = rawTextProblem(text, tag);
    if (p) problems.push(`${label} ${p}`);
  }

  const scriptHashes = [...inlineScripts, js].map(sha);
  const styleHashes = [fonts, css].map(sha);
  const csp = buildCsp(scriptHashes, styleHashes);
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<link rel="icon" href="${dataUrl('image/svg+xml', o.faviconSvg)}" type="image/svg+xml">`,
    `<style>${fonts}</style>`,
    `<style>${css}</style>`,
    ...inlineScripts.map((s) => `<script>${s}</script>`),
  ].join('\n  ');

  let html = o.stageHtml.replace(moduleTag, '').replace(styleTag, '');
  if (!html.includes(HEAD_MARK)) problems.push(`stage html lacks ${HEAD_MARK}`);
  // The CSP meta must come before every script: it goes right after <meta charset>. The notices follow it, never before
  // the charset: a page opened from disk has no other label, and a browser looks for one in the first 1024 bytes only.
  html = html.replace(HEAD_MARK, () => '');
  const comment = 'text' in notice ? `\n<!--\n${notice.text}\n-->` : '';
  html = html.replace(/(<meta charset="UTF-8">)/i, (m) => `${m}\n  ${head.split('\n  ')[0]}${comment}`);
  html = html.replace('</head>', () => `  ${head.split('\n  ').slice(1).join('\n  ')}\n  <script type="module">${js}</script>\n</head>`);
  problems.push(...externalRefs(html));
  return { html, problems };
}

/** Anything the page would still load from outside itself. */
export function externalRefs(html: string): string[] {
  const out: string[] = [];
  // Attributes only (outside the inline code): strip script and style bodies first.
  const tags = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf('>') + 1)).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style>');
  for (const m of tags.matchAll(/\b(src|href)="([^"]*)"/gi)) {
    const v = m[2] ?? '';
    if (!/^(data:|blob:|#)/.test(v)) out.push(`${m[1]}="${v.slice(0, 80)}"`);
  }
  if (/<link\b[^>]*rel="(stylesheet|manifest|modulepreload|preload)"/i.test(tags)) out.push('a <link> that loads a file');
  if (/<script\b[^>]*\bsrc=/i.test(tags)) out.push('a <script src>');
  return out;
}
