// The bubble variant (Home's idea plate), the absence of a size `lg`, and the nav link's touch box, read from the
// rendered parts and the CSS source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton, LinkButton, chipFor } from './Button';
import { ExtLink, autolink } from './Link';

/** The coarse nav box: every nav link but a secret, cut or in-text web address. */
const NAV_BOX = ':where(.nav:not(.ext), .ext.nav:not(.extButton, .extCut, [data-in-text]))';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const button = read('kit/controls/Button.module.css');
const link = read('kit/controls/Link.module.css');
const tokens = read('kit/tokens.css');
const homeParts = read('pages/home/parts/parts.module.css');

/** The declarations of the rule whose selector list is exactly `sel`. */
function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();
/** The body of the first `@media <cond>` block, nested rules included. */
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
/** Every rule that names the bubble, outside forced colours: `selector { declarations }` joined. */
const bubbleRules = [...button.slice(0, button.indexOf('@media (forced-colors: active)')).matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.bubble\b/.test(m[1]!)).map((m) => m[0]);

describe('Button variant bubble', () => {
  it('is a plain flat button: named, without the end glyph, with its variant on the element', () => {
    render(<Button variant="bubble">Start a Bot</Button>);
    const b = screen.getByRole('button', { name: 'Start a Bot' });
    expect(b).toHaveAttribute('data-variant', 'bubble');
    expect(b).not.toHaveAttribute('data-glyph');
    expect(b.querySelector('[data-glyph-mark]')).toBeNull();
  });
  it('never carries the end glyph, whatever the size, end icon, link or request', () => {
    for (const size of ['sm', 'md'] as const)
      for (const hasEnd of [false, true]) {
        expect(chipFor({ variant: 'bubble', size, hasEnd })).toBe(false);
        expect(chipFor({ variant: 'bubble', size, hasEnd, chip: true })).toBe(false);
        expect(chipFor({ variant: 'bubble', size, hasEnd, link: true })).toBe(false);
      }
  });
  it('a LinkButton takes it too and stays without the glyph', () => {
    render(<LinkButton href="/x" variant="bubble">Go</LinkButton>);
    const a = screen.getByRole('link', { name: 'Go' });
    expect(a).not.toHaveAttribute('data-glyph');
    expect(a.querySelector('[data-glyph-mark]')).toBeNull();
  });
  // The family's plate without a frame: a square grey plate, no line, a 9 px cut at the bottom end painted by the
  // background (never a clip-path, which would cut the focus ring away), the accent plate with its own ink on hover.
  it('its CSS: a square line-less plate, the cut painted at the bottom end (mirrored in rtl), the accent on hover, the kit focus ring', () => {
    const root = rule(button, '.button.bubble');
    expect(decl(root, 'font-size')).toBe('var(--fs-bubble)');
    expect(decl(root, 'border')).toBe('0');
    expect(decl(root, 'padding-block')).toBe('calc(var(--sp-2) + var(--sp-half))');
    expect(decl(root, 'padding-inline')).toBe('calc(var(--sp-3) + var(--sp-half)) var(--sp-5)');
    // It paints through the family's plate properties: its own fill and cut, one layer (no frame layer).
    expect(decl(root, '--plate')).toBe('var(--hx-bubble-plate)');
    expect(decl(root, '--plate-cut')).toBe('var(--hx-bubble-cut)');
    expect(decl(root, 'background')).toBe('linear-gradient(var(--plate-angle), transparent var(--plate-cut-at), var(--plate) var(--plate-cut-at))');
    expect(decl(root, 'block-size')).toBe('auto');
    expect(decl(root, 'text-transform')).toBe('none');
    expect(decl(root, 'white-space')).toBe('normal');
    // Square, flat, mirrored and ringed by the family's own rules: the bubble restates none of them.
    expect(decl(rule(button, '.button'), 'border-radius')).toBe('0');
    expect(decl(rule(button, '.button:dir(rtl)'), '--plate-angle')).toBe('45deg');
    expect(decl(rule(button, '.button[data-focus-visible]'), 'box-shadow')).toBe('var(--focus-ring)');
    expect(bubbleRules.length).toBeGreaterThanOrEqual(2);
    for (const r of bubbleRules) expect(r, r.slice(0, 40)).not.toMatch(/(?<![\w-])(?:clip-path|border-radius|box-shadow|transform|transition|--plate-angle)\s*:/);
    expect(button).not.toMatch(/\.button\.bubble::(before|after)/);
    // The same weight as the family's hover and press rules and after both, so the accent wins over the grey steps.
    const hover = rule(button, '.bubble[data-hovered],\n.bubble[data-pressed]');
    const at = (sel: string) => button.indexOf(`\n${sel} {`);
    expect(at('.button[data-hovered]')).toBeGreaterThan(0);
    expect(at('.button[data-pressed]')).toBeGreaterThan(at('.button[data-hovered]'));
    expect(button.indexOf('\n.bubble[data-hovered],\n.bubble[data-pressed] {')).toBeGreaterThan(at('.button[data-pressed]'));
    expect(decl(hover, '--plate')).toBe('var(--hx-acc)');
    expect(decl(hover, 'color')).toBe('var(--hx-acc-ink)');
    // The ink swaps with the plate: only the ring eases (a colour fade would pass light ink over the accent).
    expect(decl(rule(button, '.button'), 'transition')).toBe('box-shadow var(--dur-press) var(--ease-out)');
  });
  it('in forced colours an idea keeps a system-colour line, and focus a Highlight outline outside it (the rule every variant shares)', () => {
    const block = media(button, '(forced-colors: active)');
    expect(decl(rule(block, '.button.bubble'), 'border')).toBe('var(--bw) solid ButtonText');
    const focus = rule(block, '.button[data-focus-visible]');
    expect(decl(focus, 'outline')).toBe('var(--bw-2) solid Highlight');
    expect(decl(focus, 'outline-offset')).toBe('var(--bw-2)');
  });
  it('the plate tokens: #d6d6d6 and a 9 px cut, a derived dark plate; it has no line or corner token', () => {
    expect(tokens).toMatch(/--hx-bubble-plate: #d6d6d6;/);
    expect(tokens).toMatch(/--hx-bubble-cut: 9px;/);
    expect(tokens).toMatch(/--hx-bubble-plate: var\(--hx-fill\);/);
    expect(tokens).not.toMatch(/--hx-bubble-line|--r-bubble/);
  });
  it('--fs-bubble is defined once, as 14px, in the tokens; the bubble rules hold no raw size', () => {
    expect(tokens.match(/--fs-bubble\s*:/g)).toHaveLength(1);
    expect(tokens).toMatch(/--fs-bubble:\s*14px;/);
    const block = bubbleRules.join('\n');
    expect(block).toMatch(/font-size:\s*var\(--fs-bubble\)/);
    expect(block).not.toMatch(/font-size:\s*[\d.]+(px|rem|em)/);
    expect(block).not.toMatch(/calc\(var\(--fs-md\)/);
  });
  it("Home keeps no copy of the bubble: its Ask ideas are the kit's variant", () => {
    expect(homeParts).not.toMatch(/\.chips\s+\.chip|\.chips\s+li\s*>\s*\.chip/);
    expect(readFileSync(join(SRC, 'pages/home/parts/AskStrip.tsx'), 'utf8')).toMatch(/variant="bubble"/);
  });
});

describe('Button has no size lg', () => {
  it('no .lg or .iconOnly.lg rule is left, and no size class lg is emitted', () => {
    expect(button).not.toMatch(/\.lg\b/);
    const { container } = render(
      <>
        <Button size="sm">a</Button>
        <Button>b</Button>
        <IconButton icon="plus" label="c" />
      </>,
    );
    expect(container.querySelector('[class*="lg"]')).toBeNull();
  });
  it('the size type has no lg', () => {
    // @ts-expect-error lg was removed
    const lg = <Button size="lg">x</Button>;
    // @ts-expect-error lg was removed
    const lgIcon = <IconButton icon="plus" label="x" size="lg" />;
    expect([lg, lgIcon]).toHaveLength(2);
  });
  it('no lg token is left either: md reads --btn-h, the tallest button token', () => {
    expect(decl(rule(button, '.button'), '--plate-h')).toBe('var(--btn-h)');
    expect(tokens).not.toMatch(/--btn-h-lg\b/);
    expect(button).not.toMatch(/--btn-h-lg\b/);
    expect(tokens).not.toMatch(/--ctl-h-lg:/);
  });
});

describe('Link nav touch box (3.4)', () => {
  const coarse = /@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/.exec(link)![1]!;
  it('on a coarse pointer a nav link is a 44px box, centred, at zero specificity', () => {
    const body = rule(coarse, NAV_BOX);
    expect(decl(body, 'display')).toBe('inline-flex');
    expect(decl(body, 'align-items')).toBe('center');
    expect(decl(body, 'min-block-size')).toBe('var(--touch-min)');
    expect(decl(body, 'min-inline-size')).toBe('var(--touch-min)');
    expect(body).not.toMatch(/justify-content/);
  });
  it('plain and inline links are untouched, and no ::after hit layer exists', () => {
    expect(coarse).not.toMatch(/\.plain|\.inline/);
    expect(link).not.toMatch(/::after/);
  });
  it('the box is coarse-only: no .nav box outside the media block', () => {
    const outside = link.replace(coarse, '');
    expect(outside).not.toMatch(/:where\(\.nav/);
    expect(outside).not.toMatch(/\.nav\s*\{[^}]*min-(block|inline)-size/);
  });
  it('a standalone web address is boxed; one autolink found among other words keeps its line ([data-in-text])', () => {
    expect(coarse).not.toMatch(/:where\(\.nav\)\s*\{/);
    // The cut one-line address: a 44 px line, never a flex box (that would lose its ellipsis).
    const cut = rule(coarse, ':where(.ext.nav.extCut:not(.extButton, [data-in-text]))');
    expect(decl(cut, 'min-block-size')).toBe('var(--touch-min)');
    expect(decl(cut, 'line-height')).toBe('var(--touch-min)');
    expect(cut).not.toMatch(/display/);
    const inText = render(<>{autolink('see https://docs.example.test/start now', { look: 'nav' })}</>).container.querySelector('a')!;
    expect(inText.className).toMatch(/\bext\b/);
    expect(inText.className).toMatch(/\bnav\b/);
    expect(inText.hasAttribute('data-in-text')).toBe(true);
    const whole = render(<>{autolink('https://docs.example.test/start', { look: 'nav' })}</>).container.querySelector('a')!;
    expect(whole.hasAttribute('data-in-text')).toBe(false);
    const fact = render(<ExtLink url="https://docs.example.test/commit" look="nav" />).container.querySelector('a')!;
    expect(fact.className).toMatch(/\bnav\b/);
    expect(fact.hasAttribute('data-in-text')).toBe(false);
  });
  it('AskPanel keeps nav on its standalone agent link; running-text links (NoteFrame, Scripts meta lines) are inline', () => {
    expect(readFileSync(join(SRC, 'ask/AskPanel.tsx'), 'utf8')).toMatch(/<Link href=\{agentUrl\} variant="nav"/);
    expect(readFileSync(join(SRC, 'pages/notes/parts/NoteFrame.tsx'), 'utf8')).toMatch(/<Link href=\{tabUrl\} variant="inline"/);
    // The kit ComputerLink is inline unless a call asks for nav: the two meta-line calls ask for nothing.
    expect(readFileSync(join(SRC, 'pages/scripts/parts/Detail.tsx'), 'utf8')).toMatch(/<ComputerLink (?![^>]*variant="nav")[^>]*\/>/);
    expect(readFileSync(join(SRC, 'pages/scripts/parts/DeletedDrawer.tsx'), 'utf8')).toMatch(/<ComputerLink (?![^>]*variant="nav")[^>]*\/>/);
  });
});
