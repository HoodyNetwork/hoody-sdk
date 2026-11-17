// A colour dot, realm square or flag keeps 6 px from the text beside it, through
// one token, everywhere in the kit. happy-dom does no layout, so this reads the stylesheets and works out the space the
// cascade leaves between the marker and the next child: the container's column gap plus the marker's trailing margin.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(import.meta.dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const tokens = new Map<string, string>();
// The first declaration is the :root one; themes later redefine colours, never spacing (checked below for the token).
for (const m of read('tokens.css').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!tokens.has(m[1]!)) tokens.set(m[1]!, m[2]!.trim());

/** A length in px: tokens resolved, `calc()` with + and - evaluated. */
function px(value: string): number {
  let v = value.trim();
  for (let i = 0; /var\(/.test(v); i++) {
    if (i > 20) throw new Error(`token loop in ${value}`);
    v = v.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const t = tokens.get(name);
      if (t === undefined) throw new Error(`unknown token ${name}`);
      return t;
    });
  }
  v = v.replace(/^calc\((.*)\)$/, '$1');
  if (v === '0') return 0;
  const terms = v.match(/[+-]?\s*-?[\d.]+px/g);
  if (!terms || terms.join('').replace(/\s/g, '') !== v.replace(/\s/g, '')) throw new Error(`not a px length: ${value}`);
  return terms.reduce((sum, t) => sum + Number(t.replace(/\s|px/g, '')), 0);
}

interface Block {
  selectors: string[];
  decls: Array<[string, string]>;
  nested: boolean;
}

function parse(css: string): Block[] {
  const blocks: Block[] = [];
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const before = css.slice(0, m.index);
    const nested = (before.match(/\{/g)?.length ?? 0) > (before.match(/\}/g)?.length ?? 0);
    const decls = m[2]!
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const at = d.indexOf(':');
        return [d.slice(0, at).trim(), d.slice(at + 1).trim()] as [string, string];
      });
    blocks.push({ selectors: m[1]!.split(',').map((s) => s.trim()), decls, nested });
  }
  return blocks;
}

const subject = (sel: string) => sel.split(/[\s>+~]+/).pop()!;
const plainClasses = (compound: string) => (/^(\.[A-Za-z_][\w-]*)+$/.test(compound) ? compound.slice(1).split('.') : null);
const SPACING = /^(gap|column-gap|margin|margin-inline|margin-inline-start|margin-inline-end|margin-left|margin-right)$/;

/** The declarations the cascade gives an element carrying exactly these classes (plain class selectors only). */
function cascade(blocks: Block[], classes: string[]): Map<string, string> {
  const hits: Array<{ spec: number; order: number; decls: Block['decls'] }> = [];
  blocks.forEach((b, order) => {
    if (b.nested) return;
    for (const sel of b.selectors) {
      const own = plainClasses(sel);
      if (own && own.every((c) => classes.includes(c))) hits.push({ spec: own.length, order, decls: b.decls });
    }
  });
  hits.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const out = new Map<string, string>();
  // Re-inserting keeps the map in declaration order, so a later shorthand still beats an earlier longhand.
  for (const h of hits)
    for (const [k, v] of h.decls) {
      out.delete(k);
      out.set(k, v);
    }
  return out;
}

/** Any rule that could change this class's spacing beyond the plain cascade: a state, attribute, descendant or media rule. */
function overrides(blocks: Block[], cls: string): string[] {
  const found: string[] = [];
  for (const b of blocks) {
    const spacing = b.decls.filter(([k]) => SPACING.test(k));
    if (!spacing.length) continue;
    for (const sel of b.selectors) {
      const subj = subject(sel);
      if (!new RegExp(`\\.${cls}(?![\\w-])`).test(subj)) continue;
      if (b.nested || plainClasses(sel)?.length !== 1 || sel !== subj) found.push(sel);
      // Physical margins flip under RTL and !important skips the cascade this model follows.
      else if (spacing.some(([k, v]) => /left|right/.test(k) || /!important/.test(v))) found.push(`${sel} (physical or important)`);
    }
  }
  return found;
}

/** A shorthand's values, split on the spaces outside parentheses. */
function values(v: string): string[] {
  const out = [''];
  let depth = 0;
  for (const ch of v.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (out[out.length - 1]) out.push('');
    } else out[out.length - 1] += ch;
  }
  return out;
}

function columnGap(d: Map<string, string>): number {
  let gap = 0;
  for (const [k, v] of d) {
    if (k === 'gap') {
      const parts = values(v);
      gap = px(parts[1] ?? parts[0]!);
    } else if (k === 'column-gap') gap = px(v);
  }
  return gap;
}

function trailingMargin(d: Map<string, string>): number {
  let end = 0;
  for (const [k, v] of d) {
    const parts = values(v);
    if (k === 'margin') end = px(parts[1] ?? parts[0]!);
    else if (k === 'margin-inline') end = px(parts[1] ?? parts[0]!);
    else if (k === 'margin-inline-end' || k === 'margin-right') end = px(v);
  }
  return end;
}

const sheets = {
  display: parse(read('data/Display.module.css')),
  widgets: parse(read('widgets/Widgets.module.css')),
  ipinfo: parse(read('data/IpInfo.module.css')),
};

// Every marker that sits right before its text in a kit component: [sheet, container, marker (none: the page's own)].
const PAIRS: Array<[string, keyof typeof sheets, string, string | null]> = [
  ['Tag, before whatever dot or flag a page passes', 'display', 'tag', null],
  ['the StatusPill dot', 'display', 'pill', 'dot'],
  ['the StatStrip label dot', 'display', 'ssLabel', 'ssDot'],
  ['the ContextLine realm square', 'display', 'ctxLink', 'realmSquare'],
  ['the ContextLine computer dot', 'display', 'ctxLink', 'ctxDot'],
  ['the ContextLine server flag', 'display', 'ctxLink', 'ctxFlag'],
  ['the WidgetRow dot', 'widgets', 'row', 'dot'],
  ['the WidgetRow icon', 'widgets', 'row', 'icon'],
  ['the IpInfo flag', 'ipinfo', 'chip', 'flag'],
  ['the IpInfo country code (the flag when there is no emoji)', 'ipinfo', 'chip', 'code'],
];

describe('the dot gap', () => {
  it('is one 6 px token', () => {
    expect(px('var(--gap-dot)')).toBe(6);
    expect(read('tokens.css').match(/--gap-dot\s*:/g)).toHaveLength(1);
    const elsewhere = readdirSync(import.meta.dirname, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.css') && f !== 'tokens.css')
      .filter((f) => /--gap-dot\s*:/.test(read(f)));
    expect(elsewhere).toEqual([]);
  });

  it.each(PAIRS)('%s keeps --gap-dot from its text', (_, sheet, container, marker) => {
    const blocks = sheets[sheet];
    const gap = columnGap(cascade(blocks, [container])) + (marker ? trailingMargin(cascade(blocks, [marker])) : 0);
    expect(gap).toBe(px('var(--gap-dot)'));
    // The gap must come from the token, so changing the token moves every marker together.
    const own = [...cascade(blocks, [container]).entries(), ...(marker ? cascade(blocks, [marker]).entries() : [])];
    expect(own.filter(([k]) => SPACING.test(k)).map(([, v]) => v).join(' ')).toMatch(/var\(--gap-dot\)/);
    expect([...overrides(blocks, container), ...(marker ? overrides(blocks, marker) : [])]).toEqual([]);
  });

  it('a removable tag keeps its tight gap before the remove button', () => {
    expect(columnGap(cascade(sheets.display, ['tag', 'tagRemovable']))).toBe(2);
  });

  it('a widget row centres its dot under where a row\'s icon sits', () => {
    const dot = cascade(sheets.widgets, ['dot']);
    const lead = values(dot.get('margin-inline') ?? '0').map(px)[0]!;
    expect(lead * 2 + px(dot.get('width')!)).toBe(px('var(--icon-sm)'));
  });

  it('the other children of a widget row and an IP chip keep their own spacing', () => {
    expect(columnGap(cascade(sheets.widgets, ['row']))).toBe(8);
    expect(columnGap(cascade(sheets.ipinfo, ['chip']))).toBe(4);
  });
});
