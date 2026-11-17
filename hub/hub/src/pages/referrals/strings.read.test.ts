// Every word in strings.en.json is one the page reads. A key counts as read when a source file
// of the page (not a test, a spec or fixtures.ts) has it as a string literal (the TypeScript syntax tree, so comments
// never count and a // or /* inside a string never hides a read), names its plural base (codes.active for
// codes.active_one/_other), or builds it in a t(`…`) call from a dotted template such as `first.${state}.title`. Words the page dropped (the old ladder, "dash", "link.copy") are deleted rather than left
// behind; a test that only pins a string's wording, a fixture or a comment does not keep it. A template still matches any
// one segment in place of its ${…}; FirstUse's states are the only template keys today.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const dir = import.meta.dirname;
const sources = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && e.name !== 'fixtures.ts' ? [p] : [];
  });
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the files read key k: a string literal, its plural base, or a dotted t(`…${x}…`) template, which reads
 *  t(`first.${state}.title`) as /^first\.[^.]+\.title$/. Comments are not in the tree, so they never count. */
const readerOf = (files: { name: string; src: string }[]) => {
  const literals = new Set<string>();
  const templates: RegExp[] = [];
  for (const { name, src } of files) {
    const kind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const visit = (n: ts.Node): void => {
      // A literal inside a type (a union of keys) names a key without reading it.
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isLiteralTypeNode(n.parent)) literals.add(n.text);
      if (ts.isTemplateExpression(n) && ts.isCallExpression(n.parent) && ts.isIdentifier(n.parent.expression) && n.parent.expression.text === 't' && /^[a-zA-Z]\w*\./.test(n.head.text)) {
        templates.push(new RegExp(`^${[n.head.text, ...n.templateSpans.map((sp) => sp.literal.text)].map(esc).join('[^.]+')}$`));
      }
      ts.forEachChild(n, visit);
    };
    visit(ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, kind));
  }
  return (k: string) => literals.has(k) || literals.has(k.replace(/_(one|other)$/, '')) || templates.some((re) => re.test(k));
};
const one = (src: string) => readerOf([{ name: 'x.tsx', src }]);

const read = readerOf(sources(dir).map((f) => ({ name: f, src: readFileSync(f, 'utf8') })));

describe('referrals strings', () => {
  it('every key in strings.en.json is read by the page', () => {
    expect(Object.keys(strings).filter((k) => !read(k))).toEqual([]);
  });

  it('the words the redesign dropped are gone', () => {
    for (const k of ['link.copy', 'dash', 'ladder.creator', 'ladder.creatorHint', 'ladder.next.need', 'ladder.next.unknown', 'ladder.monthly', 'how.title', 'how.join', 'how.share', 'how.earn', 'release.body', 'codes.rule', 'stand.few']) {
      expect(Object.keys(strings)).not.toContain(k);
    }
  });

  it('the check sees a key nobody reads', () => {
    expect(read('ladder.creatorHint')).toBe(false);
    expect(read('codes.active_other')).toBe(true);
    expect(read('first.canJoin.title')).toBe(true);
    // A key named only in a comment is not read, a comment straight after code included; a quoted one is.
    const r = one("// 'a.inLine'\n/* 'a.inBlock' */\nconst j = <i>{/* 'a.inJsx' */}</i>;\ndoWork();// 'a.afterCode'\nt('a.used');");
    expect(['a.inLine', 'a.inBlock', 'a.inJsx', 'a.afterCode'].map(r)).toEqual([false, false, false, false]);
    expect(r('a.used')).toBe(true);
    // A comment marker inside a string hides no read after it on the line.
    const m = one("const u = 'https://x'; const l = ' // text'; t('a.afterSlashes'); const o = 'x /* y'; t('a.afterOpen'); const c = 'w */';");
    expect(['a.afterSlashes', 'a.afterOpen'].map(m)).toEqual([true, true]);
    // Only a dotted template in t(`…`) reads keys: a class-name template reads nothing.
    const c = one('const a = <i className={`${s.p}`} />; const id = `${x}-l`; t(`first.${state}.title`);');
    expect(['title', 'nav', 'first.x.body', 'first.a.b.title', 'first..title'].map(c)).toEqual([false, false, false, false, false]);
    expect(c('first.x.title')).toBe(true);
    // A key named only in a type is not read; the same key in a value is.
    const y = one("type K = 'a.typeOnly' | 'a.both'; const k: K = 'a.both'; t(k);");
    expect([y('a.typeOnly'), y('a.both')]).toEqual([false, true]);
  });
});
