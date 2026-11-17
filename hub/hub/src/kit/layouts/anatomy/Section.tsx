// The strict Section, exported as AnatomySection (the legacy Section of Layouts.tsx still holds the plain name; use
// this one for every new section). A card: the kit head (title, whole count, About, actions), one description, notices, the promise, then the body as
// its state allows, then a note. The kit draws loading, empty, no-match, partial, stale, unknown, failed and not-here
// itself (StateBody), so a page never says "empty" without core's proof and never shows a count for a list it did not
// read whole.
import { useId } from 'react';
import { cx } from '../../controls/Button';
import { useStrings } from '../../strings';
import { InfoTip } from '../../overlays/InfoTip';
import { CardEdge, CardScope, useCardCut } from '../CardEdge';
import lay from '../Layouts.module.css';
import { ActionBar } from './ActionBar';
import { Heading, HeadingLevel, StrictScope } from './Heading';
import { useFocusFollow } from './focusFollow';
import { markElement } from './provenance';
import { useGroupMember } from './SectionGroup';
import { StateBody } from './StateBody';
import { headPrimary, primaryMoved } from './section.pure';
import type { SectionProps, SubSectionProps } from './types';
import strings from './strings.en.json';
import s from './anatomy.module.css';

export { headPrimary, primaryMoved } from './section.pure';

/** The space kept between the sticky bars and a landed section when the section sets no scroll margin (--sp-3). */
const LAND_GAP = 12;

/**
 * The height the sticky bars over `el` take at the top of `root` once `el` is scrolled up to them: each sticky element
 * that comes before `el` in a box that also holds `el` (a DetailPage header, its tab bar, the settings strip) stays stuck
 * there, at its own `top`. A sticky header of another box (an earlier table's) has scrolled away with its box: not counted.
 */
function barsOver(el: HTMLElement, root: HTMLElement): number {
  let bars = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (!(sib instanceof HTMLElement)) continue;
      const cs = getComputedStyle(sib);
      if (cs.position !== 'sticky') continue;
      bars = Math.max(bars, (parseFloat(cs.top) || 0) + sib.getBoundingClientRect().height);
    }
  }
  return bars;
}

/** The nearest box between `el` and `main` that scrolls vertically and has more to show, else `main`. */
function scrollerOf(el: HTMLElement, main: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node && node !== main; node = node.parentElement) {
    const y = getComputedStyle(node).overflowY;
    if ((y === 'auto' || y === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return main;
}

/**
 * Focus a section's heading (deep links, a jump from the settings rail, a link into another tab). False when no such
 * section is shown. In its scroller (a pane's own, else #hub-main) a heading is scrolled to just under the sticky bars (a plain focus
 * scroll would leave it behind the header and tab bar), then focused without a second scroll, unless it already sits in
 * the first third of the view under the bars.
 */
export function focusSection(id: string): boolean {
  const el = document.getElementById(id);
  const heading = el?.querySelector<HTMLElement>('[data-hub-heading]');
  if (!el || !heading) return false;
  heading.tabIndex = -1;
  const main = document.getElementById('hub-main');
  if (!main || !main.contains(el)) {
    heading.focus();
    return true;
  }
  // The box that scrolls the section: a pane with its own scroller (a list-detail pane at desktop widths) before the page.
  const root = scrollerOf(el, main);
  const view = root.getBoundingClientRect();
  const h = heading.getBoundingClientRect();
  // The bars as measured; when they leave no room for the heading under them, it lands at the top of the view instead.
  const measured = barsOver(el, root);
  const bars = measured + h.height > view.height ? 0 : measured;
  // Only a heading already in the first third of the clear area stays put; lower down its section starts below the
  // fold, which the jump was meant to show.
  const clearTop = view.top + bars;
  if (h.top < clearTop || h.bottom > view.bottom || h.top > clearTop + (view.bottom - clearTop) / 3) {
    const margin = parseFloat(getComputedStyle(el).scrollMarginBlockStart) || LAND_GAP;
    const top = el.getBoundingClientRect().top - view.top + root.scrollTop - bars - margin;
    root.scrollTo({ top: Math.min(Math.max(0, top), Math.max(0, root.scrollHeight - root.clientHeight)) });
  }
  heading.focus({ preventScroll: true });
  return true;
}

export function AnatomySection({ id, title, count, description, promise, info, actions, notices, state, empty, note, tone = 'default', flush, children }: SectionProps) {
  const ts = useStrings(strings);
  const cut = useCardCut();
  const titleId = useId();
  if (import.meta.env.DEV && state?.kind === 'empty' && !empty) throw new Error(`AnatomySection "${id}": state "empty" needs an \`empty\` spec`);
  const moved = primaryMoved(state, empty);
  const primary = headPrimary(actions?.primary, state, { loading: ts('stillReading'), notRead: ts('notRead') });
  const member = useGroupMember(id, state, actions?.primary);
  const showCount = count !== undefined && count.total > 0 && (state === undefined || state.kind === 'ready');
  // Focus follows the primary between the head and the empty state.
  const follow = useFocusFollow(moved);
  if (member.collapsed)
    // The group shows its first-use card instead; this section keeps only what must stay visible during setup.
    // With nothing to keep it leaves a hidden marker, so the group still knows where it sits.
    return notices || promise ? (
      <div ref={member.place} className={s.keep}>
        {notices}
        {promise && <p className={s.promise}>{promise}</p>}
      </div>
    ) : (
      <span ref={member.place} hidden data-hub-member={id} />
    );
  return (
    <section
      {...cut}
      ref={(el) => {
        follow.root.current = el;
        member.place(el);
        markElement(el);
      }}
      onFocus={follow.onFocus}
      onBlur={follow.onBlur}
      id={id}
      aria-labelledby={titleId}
      className={cx(lay.panel, tone === 'danger' && lay.panelDanger, s.section)}
      data-hub-section=""
      data-hub-state={state?.kind ?? 'ready'}
    >
      <CardEdge />
      <CardScope>
        <header className={lay.panelHead}>
          <div className={lay.panelTitles}>
            <div className={s.titleLine}>
              <Heading id={titleId}>{title}</Heading>
              {showCount && <span className={s.count}>{count.total}</span>}
              {info && <InfoTip text={info} subject={title} />}
            </div>
            {description && <p className={lay.panelDesc}>{description}</p>}
          </div>
          {actions && <ActionBar label={title} {...actions} primary={primary} withoutPrimary={moved} />}
        </header>
        <div className={cx(lay.panelBody, flush && lay.flush, s.body)}>
          {notices && <div className={s.notices}>{notices}</div>}
          {promise && <p className={cx(s.promise, flush && s.inset)}>{promise}</p>}
          <HeadingLevel>
            <StrictScope>
              <StateBody state={state} empty={empty} primary={actions?.primary}>
                {children}
              </StateBody>
            </StrictScope>
          </HeadingLevel>
          {note && <p className={cx(s.note, flush && s.inset)}>{note}</p>}
        </div>
      </CardScope>
    </section>
  );
}

/** A flat block inside a Section: a title, one description, and body leaves; it never nests another SubSection. */
export function SubSection({ id, title, description, actions, state, empty, children }: SubSectionProps) {
  const titleId = useId();
  if (import.meta.env.DEV && state?.kind === 'empty' && !empty) throw new Error(`SubSection "${title}": state "empty" needs an \`empty\` spec`);
  return (
    <section ref={markElement} id={id} aria-labelledby={titleId} className={s.sub} data-hub-section="sub" data-hub-state={state?.kind ?? 'ready'}>
      <header className={s.subHead}>
        <div className={s.titleLine}>
          <Heading id={titleId}>{title}</Heading>
        </div>
        {actions && <ActionBar label={title} size="sm" {...actions} />}
      </header>
      {description && <p className={lay.panelDesc}>{description}</p>}
      <HeadingLevel>
        <StateBody state={state} empty={empty} primary={undefined}>
          {children}
        </StateBody>
      </HeadingLevel>
    </section>
  );
}
