// Focus ring gap conformance. kit/tokens.css declares
// --focus-ring: 0 0 0 2px var(--ring-gap), ... on :root, and a custom property resolves the var() inside it where it is
// declared: a surface that only sets --ring-gap changes nothing, every ring keeps the :root gap. So every selector that
// sets --ring-gap must also get --focus-ring in the same stylesheet (in the same rule or one naming that selector), with
// the token's exact value, so the shape never forks. The ring must hold wherever the gap does: an unconditional ring
// covers a gap under any @media/@container/@supports, a conditional ring only a gap under the same conditions.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssRules, lineOf, splitTop, stripCssComments } from './conformance/cssScan';

const SRC = join(import.meta.dirname, '..');
const CSS = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .map((f) => f.split(sep).join('/'))
  .filter((f) => f.endsWith('.css'));
const tokens = readFileSync(join(SRC, 'kit/tokens.css'), 'utf8');
const RING = cssRules(tokens)
  .find((r) => r.sel.trim() === ':root' && r.decls.some((d) => d.prop === '--focus-ring'))
  ?.decls.find((d) => d.prop === '--focus-ring')?.value;

/** The at-rule preludes (@media, @container, @supports) enclosing offset `at`, outermost first, whitespace folded.
 *  cssRules keeps a declaration's rule but not its conditions, so they are read again from the text here. */
function conditionsAt(text: string, at: number): string[] {
  const s = stripCssComments(text);
  const stack: (string | null)[] = [];
  let start = 0, paren = 0, quote = '';
  for (let i = 0; i < at; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote && s[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') { paren++; continue; }
    if (ch === ')') { paren = Math.max(0, paren - 1); continue; }
    if (paren) continue;
    if (ch === '{') {
      const head = s.slice(start, i).trim().replace(/\s+/g, ' ');
      stack.push(head.startsWith('@') ? head : null);
      start = i + 1;
    } else if (ch === '}') { stack.pop(); start = i + 1; }
    else if (ch === ';') start = i + 1;
  }
  return stack.filter((h): h is string => h !== null);
}

/** What is wrong with one stylesheet: gaps no ring covers, and rings that differ from the token. */
function problems(f: string, text: string, ring: string): string[] {
  const bad: string[] = [];
  const rules = cssRules(text);
  const rings: { sel: string; cond: string[] }[] = [];
  for (const r of rules) {
    for (const d of r.decls.filter((x) => x.prop === '--focus-ring')) {
      if (f !== 'kit/tokens.css' && d.value !== ring) bad.push(`${f}:${lineOf(text, d.at)} --focus-ring differs from the token: ${d.value}`);
      for (const sel of splitTop(r.sel)) rings.push({ sel: sel.trim(), cond: conditionsAt(text, d.at) });
    }
  }
  for (const r of rules) {
    for (const gap of r.decls.filter((x) => x.prop === '--ring-gap')) {
      const cond = conditionsAt(text, gap.at);
      for (const sel of splitTop(r.sel).map((x) => x.trim())) {
        if (f === 'kit/tokens.css' && sel === ':root' && cond.length === 0) continue;
        const covered = rings.some((g) => g.sel === sel && g.cond.every((c) => cond.includes(c)));
        if (!covered) bad.push(`${f}:${lineOf(text, gap.at)} ${sel} sets --ring-gap${cond.length ? ` (${cond.join(' / ')})` : ''} without --focus-ring wherever the gap holds`);
      }
    }
  }
  return bad;
}

describe('a surface that sets its own --ring-gap declares --focus-ring again (kit/tokens.css Focus)', () => {
  it('reads the token', () => {
    expect(RING, 'kit/tokens.css :root --focus-ring').toMatch(/var\(--ring-gap\)/);
  });

  it('every --ring-gap selector also gets --focus-ring, with the token value, wherever the gap holds', () => {
    const bad = CSS.flatMap((f) => problems(f, readFileSync(join(SRC, f), 'utf8'), RING ?? ''));
    expect(bad, 'declare --focus-ring again where --ring-gap changes (copy the kit/tokens.css value)').toEqual([]);
  });

  describe('the check itself', () => {
    const R = '0 0 0 2px var(--ring-gap), 0 0 0 4px var(--hx-focus)';
    const run = (css: string) => problems('x.module.css', css, R);
    it('refuses a gap with no ring', () => {
      expect(run('.s { --ring-gap: red; }')).toHaveLength(1);
    });
    it('refuses an unconditional gap whose ring is only under a condition', () => {
      expect(run(`.s { --ring-gap: red; }\n@media (width < 600px) { .s { --focus-ring: ${R}; } }`)).toHaveLength(1);
    });
    it('refuses a gap and a ring under disjoint conditions', () => {
      expect(run(`@media (width < 600px) { .s { --ring-gap: red; } }\n@media (width >= 600px) { .s { --focus-ring: ${R}; } }`)).toHaveLength(1);
    });
    it('refuses a gap nested under a condition inside a rule whose ring is under another', () => {
      expect(run(`.s { @container c (width < 600px) { --ring-gap: red; } @media print { --focus-ring: ${R}; } }`)).toHaveLength(1);
    });
    it('refuses a ring that differs from the token', () => {
      expect(run('.s { --ring-gap: red; --focus-ring: 0 0 0 3px var(--ring-gap); }')).toHaveLength(1);
    });
    it('accepts the ring beside the gap', () => {
      expect(run(`.s { --ring-gap: red; --focus-ring: ${R}; }`)).toEqual([]);
    });
    it('accepts an unconditional ring for a gap under a condition (it resolves the gap on the same element)', () => {
      expect(run(`.s { --ring-gap: red; --focus-ring: ${R}; }\n@container c (width < 600px) { .s { --ring-gap: blue; } }`)).toEqual([]);
    });
    it('accepts a ring under the same condition as its gap', () => {
      expect(run(`@media (width < 600px) { .s { --ring-gap: red; } }\n@media (width  <  600px) { .s { --focus-ring: ${R}; } }`)).toEqual([]);
    });
    it('accepts a shared comma-list ring rule (the Drawer shape)', () => {
      expect(run(`.a { --ring-gap: red; }\n.b { --ring-gap: blue; }\n.a, .b { --focus-ring: ${R}; }`)).toEqual([]);
    });
  });
});
