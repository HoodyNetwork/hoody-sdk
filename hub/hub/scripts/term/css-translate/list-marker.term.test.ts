// list-style on a classed list reaches the runtime as text.listMarker (Guide's `ol.steps { list-style: decimal }` drew
// no numbers: every list-style declaration was dropped as paint, and a list with a class got no marker at all).
import { describe, expect, test } from 'bun:test';
import { buildTable } from '../css-translate';
import { translateDecls, type Scope, type SrcDecl } from './translate';

const scope = (): Scope => ({ global: () => undefined, module: () => undefined });
let order = 0;
const decls = (css: string): SrcDecl[] => css.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf(':');
  return { prop: x.slice(0, i).trim(), value: x.slice(i + 1).trim(), important: false, order: order++, spec: [0, 1, 0] as [number, number, number], file: 't', line: 0 };
});
const tr = (css: string) => translateDecls(decls(css), scope());
const marker = (css: string) => (tr(css).text as Record<string, unknown> | undefined)?.listMarker;
const kind = (css: string, prop: string) => [...tr(css).outcomes.values()].find((o) => o.decl.startsWith(prop + ':'))?.kind;

describe('list-style', () => {
  test('decimal numbers, disc/circle/square bullet', () => {
    expect(marker('list-style: decimal')).toBe('decimal');
    expect(marker('list-style-type: decimal')).toBe('decimal');
    expect(marker('list-style: disc outside')).toBe('bullet');
    expect(marker('list-style: square')).toBe('bullet');
    expect(marker('list-style: none')).toBeUndefined();
    expect(kind('list-style: none', 'list-style')).toBe('paint');
    expect(kind('list-style: decimal', 'list-style')).toBe('translated');
  });
  test('a marker the terminal has no drawing for stays paint, and so do position and image', () => {
    expect(marker('list-style: lower-roman')).toBeUndefined();
    expect(kind('list-style: lower-roman', 'list-style')).toBe('paint');
    expect(kind('list-style-position: inside', 'list-style-position')).toBe('paint');
  });
  test('Guide steps and the other decimal lists in the tree carry the marker', () => {
    const results = buildTable({ width: 'narrow' }).results;
    const of = (file: string, cls: string) => (results.find((r) => r.path === file)!.entries.find((e) => e.id.endsWith('#' + cls))!.text as Record<string, unknown> | undefined)?.listMarker;
    expect(of('pages/guide/parts/guide.module.css', 'steps')).toBe('decimal');
    expect(of('kit/pickers/ProviderSetup.module.css', 'steps')).toBe('decimal');
    expect(of('kit/agent/Conversation.module.css', 'olist')).toBe('decimal');
  }, 120_000);
});
