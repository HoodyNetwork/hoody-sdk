// On a coarse pointer the kit Button with words is 44 px tall and wide as its own box (Button.module.css, the
// :where(.button) touch floor), whatever its size token says. So no consumer re-floors a kit button for touch: a page or
// kit part that did (a 44 px min-height, a button token set to 44) only hid a kit size, and those floors stay gone. The
// Board tile head reads the kit's tile sizes, and the focus-mode restore is an IconButton xs (24 drawn, the kit's own 44
// press on touch, all on the screen: it sits the kit's --xs-press-out in from the corner there; a narrow window keeps 44
// drawn).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The bodies of every `@media (...pointer: coarse...)` block, nested braces included. */
function coarseBlocks(css: string): string[] {
  const out: string[] = [];
  const re = /@media[^{]*pointer:\s*coarse[^{]*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** One rule's body by its exact selector, or null. */
function rule(css: string, sel: string): string | null {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
}

const cssFiles = (readdirSync(SRC, { recursive: true }) as string[]).map((f) => f.split('\\').join('/')).filter((f) => f.endsWith('.css') && !f.includes('node_modules/')).sort();

describe('no consumer re-floors a kit button for touch', () => {
  it('the kit Button floors itself: under a coarse pointer every button with words is at least --touch-min, at zero specificity', () => {
    const coarse = coarseBlocks(noComments(read('kit/controls/Button.module.css'))).join('\n');
    expect(rule(coarse, ':where(.button:not(.iconOnly, .xs))')).toMatch(/min-block-size: var\(--touch-min\);/);
    expect(rule(coarse, ':where(.button:not(.iconOnly) > .label)')).toMatch(/min-inline-size: calc\(var\(--touch-min\) - 2 \* var\(--btn-pad\)\);/);
    // The size tokens themselves never change with the pointer: the floor is the Button's, not a token's.
    expect(coarseBlocks(noComments(read('kit/tokens.css'))).join('\n')).not.toMatch(/--btn-/);
  });

  it('a shrink button still floors itself on a coarse pointer: the box keeps --touch-min across, so a squeezed slot never cuts the press', () => {
    const css = noComments(read('kit/controls/Button.module.css'));
    const coarse = coarseBlocks(css).join('\n');
    expect(rule(coarse, '.shrink'), 'the coarse shrink rule').toMatch(/min-inline-size: var\(--touch-min\);/);
    // One class, as heavy as the plain .shrink rule and after it, so it wins on a coarse pointer; a mouse keeps no minimum.
    expect(css.lastIndexOf('.shrink {')).toBeGreaterThan(css.indexOf('.shrink {'));
    expect(rule(css, '.shrink')).toMatch(/min-inline-size: 0;/);
  });

  it('no CSS but the tokens sets a button token (a height, a padding, a retired --btn-req) under a coarse pointer: the kit already gives 44', () => {
    const found = cssFiles.filter((f) => f !== 'kit/tokens.css').filter((f) => coarseBlocks(noComments(read(f))).some((b) => /--btn-[\w-]+\s*:/.test(b)));
    expect(found).toEqual([]);
  });

  it('the removed touch floors stay gone', () => {
    const coarse = (f: string) => coarseBlocks(noComments(read(f))).join('\n');
    expect(coarse('shell/RenameRealms.module.css'), 'RenameRealms Save/Cancel (Button sm)').not.toMatch(/\.action\s*\{/);
    expect(coarse('pages/billing/parts/FreeBadge.module.css'), 'the Free badge and its offers').not.toMatch(/\.badge|\.offers/);
    expect(coarse('pages/home/parts/parts.module.css'), 'home .touch').not.toMatch(/\.touch\s*\{/);
    expect(coarse('pages/home/parts/home.module.css'), 'home .touch').not.toMatch(/\.touch\s*\{/);
    expect(coarse('kit/widgets/AgentHint.module.css'), 'the hint trigger and footer button').not.toMatch(/\.trigger|\.footer/);
    // Ask may ask for room for its words (a width); its height, its press and its plate stay the kit's.
    const parts = noComments(read('pages/home/parts/parts.module.css'));
    expect(rule(parts, '\n.askBtn') ?? '', 'Ask: the default button height is the kit\'s').not.toMatch(/block-size|height|touch-min|--btn-|--plate|--ctl-h|44px/);
    expect(coarseBlocks(parts).join('\n'), 'Ask has no coarse-pointer rule').not.toMatch(/\.askBtn/);
    expect(rule(noComments(read('kit/voice/Voice.module.css')), '\n.hit'), 'TalkBar .hit').toBeNull();
    expect(read('kit/voice/TalkBar.tsx')).not.toMatch(/s\.hit\b/);
    expect(`${read('pages/home/parts/Welcome.tsx')}${read('pages/home/parts/AskStrip.tsx')}`).not.toMatch(/s\.touch\b/);
  });

  it('a text link is not a kit button: home keeps its coarse target for links', () => {
    expect(coarseBlocks(noComments(read('pages/home/parts/home.module.css'))).join('\n')).toMatch(/\.touchLink\s*\{[^}]*min-block-size: var\(--ctl-h\);/);
  });
});

describe('the Board tile head and the focus-mode restore take kit sizes', () => {
  it('the Board head reads the kit tile tokens, not the small control height', () => {
    const board = noComments(read('pages/board/parts/board.module.css'));
    const fine = rule(board, '.page:not(.coarse)');
    expect(fine).toMatch(/--board-head-h: var\(--tile-head-h\);/);
    expect(fine).toMatch(/--board-btn: var\(--strip-btn\);/);
    expect(board).not.toMatch(/var\(--ctl-h-sm\)/);
    const tokens = read('kit/tokens.css');
    expect(tokens).toMatch(/--tile-head-h: calc\(var\(--ctl-h-sm\) \+ var\(--bw\)\);/);
    expect(tokens).toMatch(/--strip-btn: var\(--ctl-h-sm\);/);
  });

  it('the restore is an IconButton xs drawn by the kit on every window (no page 44 of its own)', () => {
    expect(read('shell/chrome.tsx')).toMatch(/<IconButton icon="minimize"[^>]*size="xs"/);
    const css = noComments(read('shell/chrome.module.css'));
    // The stylesheet places the button and fades it; it never sizes, presses or fills it, on any window or pointer.
    expect(css).toMatch(/\.restore \{/);
    expect(rule(css, '.button'), 'no rule for the button itself').toBeNull();
    expect(css, 'no button rule inside any at-rule either').not.toMatch(/\.button\b/);
    expect(css, 'no fill of its own').not.toMatch(/background/);
    expect(css, 'no size of its own on any window or pointer').not.toMatch(/(min-|max-)?(inline-size|block-size)\s*:|(^|[\s;{])(width|height)\s*:/);
    // The coarse 44 press is the kit's own (IconButton xs ::after), so the whole press stays on the screen: the restore sits
    // at least --xs-press-out in from the corner.
    const restore = rule(css, '.restore') ?? '';
    expect(restore, 'the whole coarse press on the screen: at least --xs-press-out in from the corner').toMatch(/inset-inline-end: max\(var\(--sp-2\), var\(--xs-press-out\)\);/);
    expect(restore).toMatch(/inset-block-end: calc\(max\(var\(--sp-2\), var\(--xs-press-out\)\) \+ var\(--restore-lift, 0px\)\);/);
    expect(read('kit/tokens.css')).toMatch(/--xs-press-out: max\(0px, calc\(\(var\(--touch-min\) - var\(--ctl-h-xs\)\) \/ 2 \+ var\(--bw\)\)\);/);
    const button = noComments(read('kit/controls/Button.module.css'));
    expect(rule(button, '.xs::after'), 'the kit press reads the same token').toMatch(/inset-block: calc\(-1 \* var\(--xs-press-out\)\);/);
    expect(rule(button, '.iconOnly.xs::after')).toMatch(/inset-inline: calc\(-1 \* var\(--xs-press-out\)\);/);
  });
});

describe('a fold inside a list row is a touch press', () => {
  it('Disclosure heading={false}: under a coarse pointer the row fold trigger is at least --touch-min tall', () => {
    const coarse = coarseBlocks(noComments(read('kit/controls/Disclosure.module.css'))).join('\n');
    expect(rule(coarse, '.rowFold .trigger')).toMatch(/min-block-size: var\(--touch-min\);/);
  });

  it('every Disclosure trigger (a heading fold such as "Details" too) is at least --touch-min tall under a coarse pointer', () => {
    const coarse = coarseBlocks(noComments(read('kit/controls/Disclosure.module.css'))).join('\n');
    // The bare selector at a rule's start, not the row fold's descendant one.
    expect(coarse).toMatch(/(^|[{}])\s*\.trigger \{[^}]*min-block-size: var\(--touch-min\);/);
  });
});
