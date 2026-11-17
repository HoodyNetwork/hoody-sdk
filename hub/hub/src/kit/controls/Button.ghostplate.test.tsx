// A ghost action with words is the family's grey plate (its fill, line, cut and states are the base rules; the ghost
// restates only its ink); an icon-only ghost is frameless: no plate at rest, the plate's fill under the pointer. Read
// from the rendered parts and the CSS source (the look lives in Button.module.css alone, kit.ownButtons).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton, LinkButton } from './Button';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const button = read('kit/controls/Button.module.css');
const tokens = read('kit/tokens.css');
const topbar = read('shell/TopBar.module.css');
// The body of an @media block (the first one whose condition matches), to read the rules inside it.
function media(css: string, cond: string): string {
  const i = css.indexOf(`@media ${cond} {`);
  if (i < 0) throw new Error(`no @media ${cond}`);
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(css.indexOf('{', i) + 1, j);
  }
  throw new Error('unclosed @media');
}

function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();

describe('ghost text actions are grey plates; icon-only ghosts are frameless', () => {
  it('a ghost Button and a ghost LinkButton with words are marked data-words; icon-only ones (IconButton, or a Button or LinkButton with only an icon) are not', () => {
    render(
      <>
        <Button variant="ghost">Remove from this list</Button>
        <LinkButton variant="ghost" href="/x">Open</LinkButton>
        <IconButton icon="trash" label="Delete" />
        <Button variant="ghost" icon="x" aria-label="Remove row 1" />
        <LinkButton variant="ghost" icon="external" href="https://example.com/" aria-label="Open in a new tab" />
      </>,
    );
    for (const el of [screen.getByRole('button', { name: 'Remove from this list' }), screen.getByRole('link', { name: 'Open' })]) {
      expect(el.className).toMatch(/ghost/);
      expect(el).toHaveAttribute('data-words', '');
      expect(el).not.toHaveAttribute('data-glyph');
    }
    for (const el of [screen.getByRole('button', { name: 'Delete' }), screen.getByRole('button', { name: 'Remove row 1' }), screen.getByRole('link', { name: 'Open in a new tab' })]) {
      expect(el.className).toMatch(/ghost/);
      expect(el).not.toHaveAttribute('data-words');
      expect(el).not.toHaveAttribute('data-glyph');
      expect(el.querySelector('[data-glyph-mark]')).toBeNull();
    }
  });

  it('its CSS: the ghost restates only its ink, so a text ghost is the family\'s square plate, line and states', () => {
    const ghost = rule(button, '.ghost');
    expect(ghost.split(';').map((d) => d.trim()).filter(Boolean)).toEqual(['color: var(--ghost-text, var(--hx-btn-text))']);
    // No ghost rule with words: the plate is the base rule's, as a secondary's.
    expect(button).not.toMatch(/\.ghost\[data-words\]/);
    const base = rule(button, '.button');
    expect(decl(base, '--plate')).toBe('var(--hx-btn-plate)');
    expect(decl(base, '--plate-line')).toBe('var(--hx-btn-line)');
    expect(decl(base, 'border-radius')).toBe('0');
    expect(decl(rule(button, '.button[data-hovered]'), '--plate')).toBe('var(--hx-btn-plate-hover)');
    expect(decl(rule(button, '.button[data-pressed]'), '--plate')).toBe('var(--hx-btn-plate-press)');
  });

  it('its CSS: an icon-only ghost has no plate, line or cut at rest; the plate\'s fill hovered, one step darker pressed; never a line', () => {
    const FRAMELESS = '.iconOnly.ghost:not(.more, .toolbar, .inStrip)';
    const rest = rule(button, FRAMELESS);
    expect([decl(rest, '--plate'), decl(rest, '--plate-line'), decl(rest, '--plate-cut')]).toEqual(['transparent', 'transparent', '0px']);
    expect(decl(rest, 'color')).toBe('var(--ghost-text, var(--hx-muted))');
    const hover = rule(button, `${FRAMELESS}[data-hovered]`);
    expect([decl(hover, '--plate'), decl(hover, '--plate-line'), decl(hover, 'color')]).toEqual(['var(--hx-btn-plate)', 'transparent', 'var(--ghost-text, var(--hx-ink))']);
    const press = rule(button, `${FRAMELESS}[data-pressed]`);
    expect([decl(press, '--plate'), decl(press, '--plate-line'), decl(press, 'color')]).toEqual(['var(--hx-btn-plate-hover)', 'transparent', 'var(--ghost-text, var(--hx-ink))']);
    // It paints through the plate properties like every button: no background or border of its own.
    for (const body of [rest, hover, press]) expect(body).not.toMatch(/background|border/);
    // A three-dot, a toolbar control and a strip button keep their plate: the frameless rules leave them out.
    expect(button.match(/\.iconOnly\.ghost[^{]*/g)!.every((sel) => sel.startsWith(FRAMELESS))).toBe(true);
    // A toggled frameless button shows the selected wash with no frame, in a rule after the frameless ones and heavier.
    const toggled = rule(button, `${FRAMELESS}.pressed`);
    expect([decl(toggled, '--plate'), decl(toggled, '--plate-line')]).toEqual(['var(--hx-selected)', 'transparent']);
    expect(button.indexOf(`${FRAMELESS}.pressed`)).toBeGreaterThan(button.indexOf(`${FRAMELESS}[data-pressed]`));
    // A toggled framed icon button takes the opaque pressed step (a see-through plate would show the frame layer).
    const framed = rule(button, '.button.iconOnly.pressed');
    expect([decl(framed, '--plate'), decl(framed, '--plate-line')]).toEqual(['var(--hx-btn-plate-press)', 'var(--hx-btn-line-hover)']);
  });

  it('the tokens: #e3e3e3 plate, #7a7a7a line, #d6d6d6 hover, #1c1c1c text in light; the dark plate set; no ghost-only plate token', () => {
    const light = rule(tokens, ':root');
    const dark = rule(tokens, ':root[data-hx-theme="dark"]');
    expect([decl(light, '--hx-btn-plate'), decl(light, '--hx-btn-line'), decl(light, '--hx-btn-plate-hover'), decl(light, '--hx-btn-text')]).toEqual(['#e3e3e3', '#7a7a7a', '#d6d6d6', '#1c1c1c']);
    expect([decl(dark, '--hx-btn-plate'), decl(dark, '--hx-btn-line'), decl(dark, '--hx-btn-plate-hover'), decl(dark, '--hx-btn-text')]).toEqual(['#222225', '#6d6d70', '#2d2d31', '#ececec']);
    expect(tokens).not.toMatch(/--hx-grey-plate-/);
    expect(tokens).toMatch(/--hx-ink: #272727;/);
  });

  it('forced colours: a focused plate draws a Highlight outline, since the box-shadow ring is dropped (the rule every variant shares)', () => {
    const fc = media(button, '(forced-colors: active)');
    const ring = rule(fc, '.button[data-focus-visible]');
    expect(decl(ring, 'outline')).toBe('var(--bw-2) solid Highlight');
    expect(decl(ring, 'outline-offset')).toBe('var(--bw-2)');
    // The painted plate is dropped too: the border becomes a system line, so each button is still a box.
    expect(decl(rule(fc, '.button'), 'border-color')).toBe('ButtonText');
  });

  it("the top bar's Ask: open is the kit toggle (`pressed`), never a top bar rule; no top bar rule paints over a kit button", () => {
    const bar = readFileSync(join(import.meta.dirname, '..', '..', 'shell', 'TopBar.tsx'), 'utf8');
    // Both forms of the Ask control (icon below 1024 px, worded above) say open through the kit's pressed state.
    expect(bar.match(/pressed=\{ask\.isOpen\}/g)?.length).toBe(2);
    expect(topbar).not.toMatch(/askOn/);
    // A background, a border colour, a radius or a plate of its own on a kit button would erase or fake the plate.
    const onButtons = [...topbar.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\[data-words\]|\[data-variant|\[aria-pressed/.test(m[1]!));
    for (const m of onButtons) expect(m[2], m[1]!.trim()).not.toMatch(/(^|[;\s])(background(-color)?|border(-color|-radius)?|--plate(-line)?)\s*:/);
  });
});
