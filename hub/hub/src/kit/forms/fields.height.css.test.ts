// Every text and search field is 40 px, the height of a large button (--ctl-h, as --ctl-h-md). Read from
// source: the kit's text and search inputs take it through the one field box, never the compact height or a fixed size.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every top-level rule whose selector list is exactly `sel`, in source order (rules inside @media are not read). */
function rules(css: string, sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) {
        const head = css.slice(start, i).trim();
        const end = css.indexOf('}', i);
        if (head === sel) out.push(css.slice(i + 1, end));
      }
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  return out;
}
/** The declarations of `sel` as the cascade reads them: every matching rule, later ones last. */
function decls(css: string, sel: string): string {
  const all = rules(css, sel);
  if (!all.length) throw new Error(`no rule ${sel}`);
  return all.join(';');
}
/** The value that wins: the last `height` declaration across the rules (a later rule overrides an earlier one). */
const heightOf = (body: string) => [...body.matchAll(/(?:^|[;{\s])height\s*:\s*([^;]+)(?=;|$)/g)].at(-1)?.[1]?.trim() ?? null;

// Every rule that sizes a kit text or search input (and the command palette's search).
// A kit field names the field token (--ctl-h-md, an alias of --ctl-h): button heights have their own tokens and must
// never move a field.
const INPUTS: [file: string, sel: string, height: string][] = [
  ['shell/CommandPalette.module.css', '.input', 'var(--ctl-h)'],
  ['kit/forms/CodeEditor.module.css', '.findInput', 'var(--ctl-h-md)'],
];

describe('the reader follows the cascade', () => {
  it('a later rule for the same selector wins over an earlier one', () => {
    const css = '.a {\n  height: var(--ctl-h);\n}\n.b { height: 1px; }\n.a { height: 28px; }';
    expect(heightOf(decls(css, '.a'))).toBe('28px');
  });

  it('a later height in the same rule wins, with no space after the semicolon or no final semicolon', () => {
    expect(heightOf(decls('.a { height: var(--ctl-h);height: 28px; }', '.a'))).toBe('28px');
    expect(heightOf(decls('.a { height: var(--ctl-h); }\n.a { height: 28px }', '.a'))).toBe('28px');
    expect(heightOf(decls('.a { min-height: 50px; height: var(--ctl-h); line-height: 2; }', '.a'))).toBe('var(--ctl-h)');
  });
});

describe('text and search fields are 40 px', () => {
  for (const [file, sel, height] of INPUTS) {
    it(`${file} ${sel} takes the large control height`, () => {
      expect(heightOf(decls(read(file), sel))).toBe(height);
    });
  }

  it('the large control height is 40 px, and the one field box takes it', () => {
    expect(/--ctl-h:\s*40px;/.test(read('kit/tokens.css'))).toBe(true);
    expect(/--ctl-h-md:\s*var\(--ctl-h\);/.test(read('kit/tokens.css'))).toBe(true);
    expect(heightOf(decls(read('kit/forms/fieldBox.module.css'), '.box'))).toBe('var(--ctl-h-md)');
  });

  it('no field rule sets a height over the box but the two that must', () => {
    for (const sel of ['.input', '.searchInput']) expect(heightOf(decls(read('kit/forms/fields.module.css'), sel))).toBeNull();
    expect(heightOf(decls(read('kit/forms/more.module.css'), '.searchInput'))).toBeNull();
  });

  it('no kit field or search sizes itself with the compact control height', () => {
    for (const f of ['kit/forms/fields.module.css', 'kit/forms/more.module.css', 'kit/forms/CodeEditor.module.css']) {
      for (const m of read(f).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/input|Input/.test(m[1]!)) continue;
        expect(m[2], `${f} ${m[1]!.trim()}`).not.toMatch(/(?:^|;|\s)(?:min-)?height\s*:\s*var\(--ctl-h-sm\)/);
      }
    }
  });
});
