// A page's FAQ: explanations live in a "Questions" section at the bottom of
// the page; a dialog, card or empty state keeps one short line and a FaqLink.
//   Faq      the section: one Disclosure per item (anchor `#faq-<id>`), and the landing that opens, scrolls to and focuses
//            the item a `#faq-<id>` location names.
//   FaqLink  on the page: a link to the item's anchor when the item can be reached; otherwise, and always inside an
//            overlay, a peek (a Popover with the whole answer). Targets are found by their anchor id in the DOM, never
//            through a registry, so a FaqLink works beside any archetype.
// An answer is plain text. A blank line in it starts a new block: a paragraph, a list (every line starts "- ") or numbered
// steps (every line starts "1. ", "2. "…). The section and the peek draw the blocks the same way; an answer with no blank
// line is one paragraph, as it always was.
import { type MouseEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Disclosure } from '../controls/Disclosure';
import { Link, type LinkProps } from '../controls/Link';
import { useFaqHref, useFaqPush, useGo, useLandedMark, useLocationEntry, useLocationHash } from '../nav';
import { Popover } from '../overlays/Popover';
import { afterFrames, onOverlayClosed, onOverlaysIdle, overlaysBusy } from '../overlays/shared';
import { motionOff } from '../perf';
import strings from '../strings.en.json';
import { useStrings } from '../strings';
import { isFaqHash, targetOf, validate } from './faq.pure';
import s from './Faq.module.css';

export { isFaqHash };

export interface FaqItem {
  /** /^[a-z][a-zA-Z0-9]*$/, unique on the page; the anchor is `#faq-<id>`. */
  id: string;
  /** A question the person would ask; ends with "?". */
  q: string;
  /** The answer, plain text. A blank line starts a new block: a paragraph, a list (each line "- …") or steps (each line "1. …"). */
  a: string;
  /** One optional navigation link after the answer (program rules, a Guide topic). */
  action?: { label: string; href: LinkProps['href'] };
}

/** Descriptors only, never a ReactNode. An empty `items` throws in dev. */
export interface FaqSpec {
  items: readonly FaqItem[];
}

export interface FaqProps {
  faq: FaqSpec;
  /** Heading levels: the section title and its questions. 2 and 3 on a page root; 3 and 4 in a ListDetail list pane or inspector. */
  titleLevel?: 2 | 3;
  /** Extra class for the section (the archetype's width/placement). */
  className?: string;
}

export interface FaqLinkProps {
  item: FaqItem;
  children: string;
}

const anchorId = (id: string): string => `faq-${id}`;

// ── Answer ────────────────────────────────────────────────────────────────────────────

type AnswerBlock = { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

const BULLET = /^- +/;
const STEP = /^[0-9]{1,2}\. +/;

/** The blocks of an answer: split at blank lines; a block is a list or steps only when every line of it is marked, else a
 *  paragraph (its lines joined by a space). Markers are dropped: the list draws its own. */
function answerBlocks(a: string): AnswerBlock[] {
  const out: AnswerBlock[] = [];
  for (const raw of a.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const mark = lines.every((l) => BULLET.test(l)) ? BULLET : lines.every((l) => STEP.test(l)) ? STEP : null;
    if (mark) out.push({ kind: mark === BULLET ? 'ul' : 'ol', items: lines.map((l) => l.replace(mark, '')) });
    else out.push({ kind: 'p', text: lines.join(' ') });
  }
  return out;
}

/** An item's answer: one paragraph as it is written, or its blocks in order. */
function FaqAnswer({ text }: { text: string }): ReactNode {
  const blocks = answerBlocks(text);
  if (blocks.length <= 1 && blocks[0]?.kind !== 'ul' && blocks[0]?.kind !== 'ol') return <p className={s.answer}>{text}</p>;
  return (
    <div className={s.blocks}>
      {blocks.map((b, i) => {
        if (b.kind === 'p') return <p key={i} className={s.answer}>{b.text}</p>;
        const List = b.kind;
        return (
          <List key={i} className={`${s.answerList} ${b.kind === 'ul' ? s.bullets : s.steps}`}>
            {b.items.map((it, j) => <li key={j}>{it}</li>)}
          </List>
        );
      })}
    </div>
  );
}

// ── Reachable ─────────────────────────────────────────────────────────────────────────

/** An ancestor that takes the target off the page for the person: inert (a modal open), hidden or aria-hidden. */
const SHUT = '[inert], [hidden], [aria-hidden="true"]';

/**
 * Whether the person could land on `el` now: connected, drawn (checkVisibility with the visibility property; where the
 * engine has none, a box and a computed visibility), and under no inert, hidden or aria-hidden ancestor. A ListDetail
 * list hidden by a selection at narrow widths or by `?list=0`, and a page under an open modal, are not reachable.
 */
function reachable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected || el.closest(SHUT) !== null) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The question button of the item `id`, found by its anchor in the DOM. */
function triggerOf(id: string): HTMLElement | null {
  return document.getElementById(anchorId(id))?.querySelector<HTMLElement>('button[aria-expanded]') ?? null;
}

// ── "Here" mark and scroll ────────────────────────────────────────────────────────────

/** How long a landed question says "here": the length of --dur-4 (Layouts' HERE_MS), which reduced motion zeroes. */
const HERE_MS = 1200;
let here: { el: HTMLElement; timer: number } | null = null;

function clearHere(): void {
  if (!here) return;
  // A test file's environment may be gone by the time a stray mark is cleared: there is then no timer left to stop.
  if (typeof window !== 'undefined') window.clearTimeout(here.timer);
  here.el.removeAttribute('data-hub-here');
  here = null;
}

/** Tints `el` for HERE_MS with the kit's data-hub-here pulse (global, styled in here.css); a new mark restarts it. */
function markHere(el: HTMLElement): void {
  clearHere();
  // Off for one style pass (cleared above) so the pulse starts over.
  void el.offsetWidth;
  el.setAttribute('data-hub-here', '');
  here = { el, timer: window.setTimeout(() => here?.el === el && clearHere(), HERE_MS) };
}

/** The element the item scrolls in: the nearest ancestor that scrolls (overflow auto or scroll, with room), else the page's. */
function scrollParentOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.getElementById('hub-main') ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Scrolls the item's scroller so its top sits at its scroll margin; no smooth scroll under reduced motion. */
function scrollToItem(el: HTMLElement): void {
  const parent = scrollParentOf(el);
  const base = parent === document.documentElement || parent === document.scrollingElement ? 0 : parent.getBoundingClientRect().top;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = Math.max(0, parent.scrollTop + el.getBoundingClientRect().top - base - margin);
  if (typeof parent.scrollTo === 'function') parent.scrollTo({ top, behavior: motionOff() ? 'auto' : 'smooth' });
  else parent.scrollTop = top;
}

// ── Landing ───────────────────────────────────────────────────────────────────────────

/** Inside a dialog, drawer or sheet (the kit's, or any with the role). */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [data-hub-overlay]';

/**
 * A kit modal still mounted may be closing, and one just unmounted has its focus restore a frame away (`overlaysBusy`):
 * React Aria lifts the page's hiding when the exit starts, but the modal's focus scope holds focus, and gives it back to the
 * opener, past the unmount. Nothing lands before then, observers included, whichever modal hid the target or sits above
 * it (landing is for the page: an overlay's FAQ is read through a FaqLink's peek); the idle signal and the overlay's close
 * notice bring the landing back.
 */
const behindOverlay = (): boolean => overlaysBusy();


export function Faq({ faq, titleLevel = 2, className }: FaqProps) {
  if (import.meta.env.DEV) validate(faq.items);
  const t = useStrings(strings);
  const hash = useLocationHash();
  const entry = useLocationEntry();
  const titleId = useId();
  const section = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const items = faq.items;
  const ids = items.map((i) => i.id).join('|');
  const target = targetOf(hash);
  const key = `${entry}|${hash}`;
  // Without a history key (a router that gives none) the section remembers for itself.
  const own = useRef<string | null>(null);
  // The mark lives on the history entry itself (its state), however many entries the person has been through.
  const mark = useLandedMark();
  const landed = () => (entry ? mark.has(hash) : own.current === key);
  // What the current entry has already done: scrolled and marked once, however often the retry runs.
  const placed = useRef<string | null>(null);

  const setItemOpen = useCallback((id: string, isOpen: boolean) => {
    setOpen((cur) => {
      if (cur.has(id) === isOpen) return cur;
      const next = new Set(cur);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // One attempt at landing, always the latest closure (the observers and the overlay notice call through the ref).
  const attempt = useRef<() => void>(() => undefined);
  attempt.current = () => {
    if (!target || landed()) return;
    if (target.kind === 'section') {
      const el = section.current;
      if (!reachable(el) || behindOverlay()) return;
      if (placed.current !== key) {
        placed.current = key;
        scrollToItem(el);
        markHere(el);
      }
      const head = el.querySelector<HTMLElement>('[data-faq-title]');
      head?.focus({ preventScroll: true });
      if (head && document.activeElement === head) {
        if (entry) mark.set(hash);
        else own.current = key;
      }
      return;
    }
    const trigger = triggers.current.get(target.id);
    // An unknown id does nothing and leaves the URL; an unreachable target waits (never reveals a hidden pane itself).
    if (!trigger || !reachable(trigger) || behindOverlay()) return;
    const root = document.getElementById(anchorId(target.id));
    if (!root) return;
    setItemOpen(target.id, true);
    if (placed.current !== key) {
      placed.current = key;
      scrollToItem(root);
      markHere(root);
    }
    trigger.focus({ preventScroll: true });
    // Landed only when the question really has focus (an overlay's focus restore may still be on its way).
    if (document.activeElement === trigger) {
      if (entry) mark.set(hash);
      else own.current = key;
    }
  };

  // Retry while the entry is pending: on every render that changes the items or an item's open state (the disclosure's
  // expand commit), on size and visibility changes of the target and its scroller (a list shown at a wider width, a pane
  // revealed by CSS alone), and when a kit overlay has finished closing (a modal that was hiding the page).
  useEffect(() => {
    if (!target || landed()) return;
    attempt.current();
    if (landed()) return;
    const cleanups: Array<() => void> = [];
    let pendingFrames: (() => void) | null = null;
    const retry = () => attempt.current();
    cleanups.push(
      onOverlayClosed(() => {
        pendingFrames?.();
        pendingFrames = afterFrames(retry);
      }),
    );
    cleanups.push(() => pendingFrames?.());
    // The gate above may hold the first attempt (or any later one): it ends here, even for a section drawn inside the window.
    cleanups.push(onOverlaysIdle(retry));
    const watched = target.kind === 'item' ? document.getElementById(anchorId(target.id)) : section.current;
    if (watched) {
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(retry);
        ro.observe(watched);
        const parent = scrollParentOf(watched);
        if (parent !== watched) ro.observe(parent);
        cleanups.push(() => ro.disconnect());
      }
      if (typeof IntersectionObserver === 'function') {
        const io = new IntersectionObserver(retry);
        io.observe(watched);
        cleanups.push(() => io.disconnect());
      }
    }
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` and `landed` read the latest render through refs
  }, [hash, entry, ids, open]);

  // The mark belongs to the section: it goes with it. The section is read when the effect runs: by the time the cleanup
  // runs React has already let go of the ref, so a read then would leave the mark and its timer behind.
  useEffect(() => {
    const host = section.current;
    return () => {
      if (here && host?.contains(here.el)) clearHere();
    };
  }, []);

  const H = `h${titleLevel}` as 'h2' | 'h3';
  const level = (titleLevel + 1) as 3 | 4;
  return (
    <section id="faq" ref={section} className={[s.faq, className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <H id={titleId} className={s.title} data-faq-title="" tabIndex={-1}>
        {t('faq.title')}
      </H>
      <div className={s.items}>
        {items.map((item) => (
          <Disclosure
            key={item.id}
            id={anchorId(item.id)}
            level={level}
            title={item.q}
            className={s.item}
            isExpanded={open.has(item.id)}
            onExpandedChange={(isOpen) => setItemOpen(item.id, isOpen)}
            triggerRef={(el) => {
              if (el) triggers.current.set(item.id, el);
              else triggers.current.delete(item.id);
            }}
          >
            <div className={s.body}>
              <FaqAnswer text={item.a} />
              {item.action && (
                <Link variant="nav" href={item.action.href} iconEnd="chevron-right">
                  {item.action.label}
                </Link>
              )}
            </div>
          </Disclosure>
        ))}
      </div>
    </section>
  );
}

// ── FaqLink ───────────────────────────────────────────────────────────────────────────

/** A plain primary-button click: a Cmd/Ctrl/Shift/Alt click, or any other button, keeps the browser default. */
const plain = (e: MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** An action the kit routes (a hub path); an absolute URL opens its own tab and is left alone. */
const routed = (href: string): boolean => !/^https?:\/\//i.test(href);

/**
 * A link to a FAQ question. On the page, with the question reachable, it is a link to the question's anchor (a pushed
 * history entry that the section lands on). Otherwise, and always inside an overlay, a press opens a peek instead: a
 * Popover with the whole answer. Inside an overlay the peek shows no `action` (the answer is complete, and no
 * navigation can start under a drawer's leave guard); on the page the action closes the peek and then navigates.
 * Escape or an outside press closes only the peek and focus returns here.
 */
export function FaqLink({ item, children }: FaqLinkProps): ReactNode {
  const t = useStrings(strings);
  const href = useFaqHref(item.id);
  const go = useGo();
  const push = useFaqPush();
  const atAnchor = useLocationHash() === anchorId(item.id);
  const [peek, setPeek] = useState<'page' | 'overlay' | null>(null);
  // The capture handler sees the press before the link (and before the popover trigger's own press), so a peek stops the
  // link's navigation and a navigation is left entirely to the link.
  const onPressCapture = (e: MouseEvent<HTMLSpanElement>) => {
    if (!plain(e)) return;
    const from = e.target instanceof Element ? e.target : null;
    const mode = from?.closest(OVERLAY) ? 'overlay' : reachable(triggerOf(item.id)) ? null : 'page';
    if (!mode && !atAnchor) return;
    e.preventDefault();
    e.stopPropagation();
    // Already at this anchor: the router would take the press for a reload, so push the entry ourselves (it lands again).
    if (mode) setPeek(mode);
    else push(item.id);
  };
  return (
    <Popover
      trigger={
        <span className={s.inText} onClickCapture={onPressCapture}>
          <Link variant="nav" href={href}>
            {children}
          </Link>
        </span>
      }
      label={t('faq.peek')}
      width="wide"
      isOpen={peek !== null}
      // The popover only closes itself (Escape, an outside press, the action); opening is the press handler's.
      onOpenChange={(isOpen) => {
        if (!isOpen) setPeek(null);
      }}
    >
      {(close) => (
        <div className={s.peek}>
          <FaqAnswer text={item.a} />
          {peek === 'page' && item.action && (
            <span
              className={s.linkWrap}
              onClickCapture={(e) => {
                if (!plain(e) || !routed(item.action!.href)) return;
                e.preventDefault();
                e.stopPropagation();
                close();
                go(item.action!.href);
              }}
            >
              <Link variant="nav" href={item.action.href} iconEnd="chevron-right">
                {item.action.label}
              </Link>
            </span>
          )}
        </div>
      )}
    </Popover>
  );
}
