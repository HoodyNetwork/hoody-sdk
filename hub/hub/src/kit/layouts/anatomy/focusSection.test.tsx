// focusSection lands a section's heading just under the page's sticky bars (a DetailPage header and its tab bar), never
// behind them: it scrolls #hub-main itself, then focuses without a second scroll. A heading already in the clear stays put.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusSection } from './Section';

const VIEW = 600;

/** #hub-main (600 px tall, content 2000 px) holding a sticky header (60 px at top 0), an earlier table box with its own
 *  sticky head (30 px), then a tab box: a sticky tab bar (44 px at top 60) and a panel with section `s` at `at`. */
function lay({ at, scrollTop = 0, withRoot = true, margin, headH = 60 }: { at: number; scrollTop?: number; withRoot?: boolean; margin?: string; headH?: number }) {
  document.body.innerHTML = `
    <div id="${withRoot ? 'hub-main' : 'other'}">
      <header id="head" style="position: sticky; top: 0px"></header>
      <div id="table"><div id="thead" style="position: sticky; top: 0px"></div></div>
      <div id="tabs">
        <div id="tablist" role="tablist" style="position: sticky; top: 60px"></div>
        <div id="panel"><section id="s"${margin ? ` style="scroll-margin-block-start: ${margin}"` : ''}><h2 data-hub-heading>Firewall</h2></section></div>
      </div>
    </div>`;
  const root = document.body.firstElementChild as HTMLElement;
  const rect = (top: number, height: number) => () => ({ top, bottom: top + height, height }) as DOMRect;
  root.scrollTop = scrollTop;
  Object.defineProperty(root, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(root, 'clientHeight', { value: VIEW, configurable: true });
  root.getBoundingClientRect = rect(0, VIEW);
  document.getElementById('head')!.getBoundingClientRect = rect(0, headH);
  document.getElementById('thead')!.getBoundingClientRect = rect(0, 30);
  document.getElementById('tablist')!.getBoundingClientRect = rect(60, 44);
  const section = document.getElementById('s')!;
  section.getBoundingClientRect = rect(at - scrollTop, 200);
  const heading = section.querySelector('h2') as HTMLElement;
  heading.getBoundingClientRect = rect(at - scrollTop, 30);
  root.scrollTo = vi.fn() as unknown as typeof root.scrollTo;
  const focus = vi.spyOn(heading, 'focus');
  return { root, heading, focus };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusSection', () => {
  it('bars taller than half the view count whole: 340 px of bars in a 600 px view, a heading at 320 is behind them and lands at 340 + 12', () => {
    const { root } = lay({ at: 800, scrollTop: 480, headH: 340 });
    focusSection('s');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 800 - 340 - 12 });
  });

  it('bars that leave no room for the heading: it lands at the top of the view', () => {
    const { root } = lay({ at: 800, headH: 590 });
    focusSection('s');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 800 - 12 });
  });

  it('a heading below the fold lands just under the header and tab bar (60 + 44, gap 12), focused without a second scroll', () => {
    const { root, heading, focus } = lay({ at: 800 });
    expect(focusSection('s')).toBe(true);
    // the earlier table's sticky head is not counted: its box has scrolled away by then
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 800 - 104 - 12 });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(heading);
  });

  it('a heading hidden behind the bars is brought out from under them', () => {
    const { root } = lay({ at: 800, scrollTop: 750 });
    focusSection('s');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 800 - 104 - 12 });
  });

  it('the section\'s own scroll margin replaces the gap', () => {
    const { root } = lay({ at: 800, margin: '16px' });
    focusSection('s');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 800 - 104 - 16 });
  });

  it('a heading already high in the clear (first third under the bars) stays where it is', () => {
    const { root, heading } = lay({ at: 200 });
    expect(focusSection('s')).toBe(true);
    expect(root.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
  });

  it('a heading in view but below the first third under the bars lands too: its section would stay below the fold', () => {
    // clear area 104..600: a third down is 104 + 165.33; a heading at 560 (the 1440 firewall case, near the bottom) or 300
    for (const at of [560, 300]) {
      const { root } = lay({ at });
      focusSection('s');
      expect(root.scrollTo, String(at)).toHaveBeenCalledWith({ top: at - 104 - 12 });
    }
    // at 250 it is high enough: nothing moves
    const high = lay({ at: 250 });
    focusSection('s');
    expect(high.root.scrollTo).not.toHaveBeenCalled();
  });

  it('a pane with its own scroller is the one that scrolls (a list-detail pane at desktop widths), not #hub-main', () => {
    const { root } = lay({ at: 800 });
    const panel = document.getElementById('panel')!;
    const tabs = document.getElementById('tabs')!;
    tabs.style.overflowY = 'auto';
    Object.defineProperty(tabs, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(tabs, 'clientHeight', { value: VIEW, configurable: true });
    tabs.getBoundingClientRect = () => ({ top: 0, bottom: VIEW, height: VIEW }) as DOMRect;
    tabs.scrollTo = vi.fn() as unknown as typeof tabs.scrollTo;
    expect(panel.contains(document.getElementById('s'))).toBe(true);
    focusSection('s');
    // inside the pane only its own tab bar (44 at top 60) stays over the section; the page header is outside it
    expect(tabs.scrollTo).toHaveBeenCalledWith({ top: 800 - 104 - 12 });
    expect(root.scrollTo).not.toHaveBeenCalled();
  });

  it('never past the end of the page', () => {
    const { root } = lay({ at: 1900 });
    focusSection('s');
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 2000 - VIEW });
  });

  it('no page scroller: a plain focus; no section: false', () => {
    const { root, heading, focus } = lay({ at: 800, withRoot: false });
    expect(focusSection('s')).toBe(true);
    expect(root.scrollTo).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith();
    expect(document.activeElement).toBe(heading);
    expect(focusSection('nope')).toBe(false);
  });
});
