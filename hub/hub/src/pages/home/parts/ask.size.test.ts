// The Home Ask text field is exactly as high as the Ask button.
// jsdom has no layout, so the proof is the rules. Every kit field's height is set once, on the field box
// (forms/fieldBox.module.css .box: --ctl-h-md, which is --ctl-h). A md button is 32 (--btn-h), so Ask is a
// kit primary Button at the toolbar size (controls/Button.module.css .button.toolbar: --plate-h = --tb-ctl-h), which is
// 40 like the field with a mouse and 44 like it on a coarse pointer. Home sets no height on the button.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'parts.module.css'), 'utf8');
const kit = readFileSync(join(__dirname, '../../../kit/forms/fieldBox.module.css'), 'utf8');
const tokens = readFileSync(join(__dirname, '../../../kit/tokens.css'), 'utf8');
const button = readFileSync(join(__dirname, '../../../kit/controls/Button.module.css'), 'utf8');
const strip = readFileSync(join(__dirname, 'AskStrip.tsx'), 'utf8');
const coarse = tokens.match(/@media \(pointer: coarse\) \{\s*:root \{([^}]*)\}/)?.[1] ?? '';
// the coarse-pointer toolbar height, written as its own one-line media rule
const coarseTb = tokens.match(/@media \(pointer: coarse\) \{\s*:root \{ --tb-ctl-h-default: ([^;]+); \}/)?.[1];
const token = (src: string, name: string) => src.match(new RegExp(`(?:^|[\\s;{])${name}: ([^;]+);`, 'm'))?.[1];
const rule = (src: string, sel: string) => src.match(new RegExp(`^${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('Home Ask field height', () => {
  it('the field and the Ask button share one height', () => {
    expect(rule(kit, '.box').match(/(?:^|\s)height: ([^;]+);/)?.[1]).toBe('var(--ctl-h-md)');
    expect(tokens.match(/^\s*--ctl-h-md: ([^;]+);/m)?.[1], 'the field box height is the control height').toBe('var(--ctl-h)');
    expect(strip, 'Ask is a kit primary Button at the toolbar size').toMatch(/<Button type="submit" variant="primary" size="toolbar" className=\{s\.askBtn\}>/);
    expect(css, 'Home sets no height on the Ask button').not.toMatch(/\.askBtn[^{]*\{[^}]*(?:block-size|height|--btn-|--plate)/);
    expect(rule(button, '.button.toolbar')).toMatch(/--plate-h: var\(--tb-ctl-h\);/);
    expect(rule(button, '.button')).toMatch(/block-size: var\(--plate-h\);/);
    expect([token(tokens, '--ctl-h'), token(tokens, '--tb-ctl-h-default')], 'with a mouse: field 40, button 40').toEqual(['40px', '40px']);
    expect(tokens, 'a default toolbar control is the default toolbar height').toMatch(/^\s*--tb-ctl-h: var\(--tb-ctl-h-default\);/m);
    expect([token(coarse, '--ctl-h'), coarseTb], 'on a coarse pointer: field 44, button 44').toEqual(['44px', '44px']);
  });

  it('keeps no big Ask variant (nothing calls one)', () => {
    expect(css).not.toMatch(/\.askBig\b/);
  });
});
