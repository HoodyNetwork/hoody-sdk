// --shell-main-pad-end (the BottomNav overlap): the strip the shell's
// chrome covers at the viewport's end. On :root (portalled overlays read it too): 0 by default, the
// bottom bar plus the safe area below 768, 0 again in focus mode, where no bar is drawn. main keeps it
// (plus the action button's room on phones while a page draws one, none on a canvas page or in focus mode) below the content,
// and main and the viewport scroll-pad by it so scrollIntoView and keyboard focus stop above the bar.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'AppShell.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (from: string, sel: string) => {
  const i = from.indexOf(`${sel} {`);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  return from.slice(i, from.indexOf('}', i));
};
const phone = css.slice(css.indexOf('@media (width < 768px)'));
const lastPhone = css.slice(css.lastIndexOf('@media (width < 768px)'));

describe('--shell-main-pad-end', () => {
  it('is a :root variable, 0 by default; the bottom bar plus the safe area on phones', () => {
    expect(rule(css, ':root')).toMatch(/--shell-main-pad-end:\s*0px;/);
    expect(rule(css, ':root')).toMatch(/scroll-padding-block-end:\s*var\(--shell-main-pad-end\);/);
    expect(rule(phone, '  :root')).toMatch(/--shell-main-pad-end:\s*calc\(var\(--bottom-nav-h\) \+ var\(--safe-bottom\)\);/);
  });

  it('main pads its end by it plus the button room, and scroll-pads by it', () => {
    const main = rule(css, '.main');
    expect(main).toMatch(/padding-block-end:\s*calc\(var\(--shell-main-pad-end\) \+ var\(--shell-fab-room\)\);/);
    expect(main).toMatch(/scroll-padding-block-end:\s*var\(--shell-main-pad-end\);/);
    expect(main).toMatch(/--shell-fab-room:\s*0px;/);
    // The room is reserved only while a floating action button is drawn (shell/fabroom.shell.spec.ts at 390).
    expect(rule(phone, '  .main')).toMatch(/--shell-fab-room:\s*var\(--shell-fab-reserve, 0px\);/);
    expect(rule(phone, '  :root:has([data-hub-fab])')).toMatch(/--shell-fab-reserve:\s*calc\(var\(--fab-h\) \+ var\(--sp-8\)\);/);
  });

  it('a canvas page keeps the bar strip only; focus mode keeps nothing', () => {
    expect(rule(lastPhone, '  .canvas')).toMatch(/--shell-fab-room:\s*0px;/);
    // A wizard has no action button either: the bar strip only, on phones only.
    expect(rule(lastPhone, '  .wizard')).toMatch(/--shell-fab-room:\s*0px;/);
    expect(css.slice(0, css.lastIndexOf('@media (width < 768px)'))).not.toMatch(/\.wizard\b/);
    expect(rule(lastPhone, '  :root:has(.focus)')).toMatch(/--shell-main-pad-end:\s*0px;/);
    expect(rule(lastPhone, '  .focus .main')).toMatch(/--shell-fab-room:\s*0px;/);
  });

  it('nothing else pads main or scroll-pads (only :root, for a scrolling document, and main)', () => {
    expect(css.match(/(?<!scroll-)padding-block-end:/g)?.length).toBe(1);
    expect(css.match(/scroll-padding-block-end:/g)?.length).toBe(2);
  });
});
