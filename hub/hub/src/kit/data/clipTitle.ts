// clipTitle: a table cell cut off by its column gets a native tooltip with its whole shown text. A pointer affordance
// only: the text stays in the cell and the accessibility tree, and no name, description or tab stop is added. The host
// that asked (a DataTable body cell, the Logs list's What) owns the title while the pointer is over it; the helper
// watches the host and rechecks as its layout or content changes, and only ever removes a title that is still its own.
import { holdsId, safeShown } from '../controls/Link';

/** A host that is, or holds, one of these keeps no tooltip of its own: a control or a link names itself (a title over
 * it would read twice; ExtLink truncate shows its own tooltip), a secret link is a button that may show only what it
 * shows, an element with an ARIA description already has its tooltip, and an element with its own native title (a
 * <time> with the full date) keeps that tooltip. The host and what is inside it only: an enclosing row button (Logs)
 * is not the host's. */
const SELF_OWNERS = 'a, button, input, select, textarea, [role="link"], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [aria-describedby]';
const OWNERS = `${SELF_OWNERS}, [title]`;
/** Holds the title this helper set, so it only ever changes or removes its own. */
const MARK = 'data-clip-title';

/** What clipTitle decides for one host (pure: every DOM read is done before). */
export interface ClipFacts {
  /** The host or a box inside it shows less than its text (an ellipsis). */
  cut: boolean;
  /** The host is or holds a control, a link, an ARIA-described element or an element with its own title. */
  owned: boolean;
  /** Every character of the host's text, hidden text included: what the id check reads. */
  raw: string;
  /** The text the host shows (hidden elements left out). */
  shown: string;
}

/** The title a host gets, or null for none. The id check reads the raw text BEFORE anything is joined or trimmed, so
 * an id split by a newline, a tab or a hidden element still masks the whole title (safeShown's own rule). */
export function clipTitleText(f: ClipFacts): string | null {
  if (!f.cut || f.owned) return null;
  if (holdsId(f.raw)) return safeShown(f.raw);
  const text = safeShown(f.shown).replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/** Is `el`'s text wider than its box? One px of slack for rounding. */
function isCut(el: Element): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function hidden(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const cs = view.getComputedStyle(el);
  return cs.display === 'none' || cs.visibility === 'hidden';
}

/** The host's shown text: its text nodes outside any element that is display: none or visibility: hidden. */
function shownText(host: Element): string {
  let out = '';
  const walk = (el: Element) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out += n.nodeValue ?? '';
      else if (n.nodeType === 1 && !hidden(n as Element)) walk(n as Element);
    }
  };
  walk(host);
  return out;
}

/** Read the facts of `host` from the DOM. */
export function clipFacts(host: HTMLElement): ClipFacts {
  const boxes = [host, ...host.querySelectorAll('*')].filter((el) => el === host || !hidden(el));
  const cutBox = boxes.find(isCut);
  return {
    cut: cutBox !== undefined,
    owned: host.matches(SELF_OWNERS) || host.querySelector(OWNERS) !== null || (host.hasAttribute('title') && !ownTitle(host)),
    raw: host.textContent ?? '',
    shown: shownText(host),
  };
}

/** Whether `host`'s title is still the one this helper set. Read only: a title another renderer has since put there
 * (or taken away) is theirs, and `settle` drops the stale marker. */
function ownTitle(host: Element): boolean {
  const mine = host.getAttribute(MARK);
  return mine !== null && host.getAttribute('title') === mine;
}

/** Forget a marker whose title is no longer ours, so that title is never changed or removed. */
function settle(host: Element): void {
  if (host.hasAttribute(MARK) && !ownTitle(host)) host.removeAttribute(MARK);
}

/** Set or take away `host`'s title from its facts of this moment. A title someone else set is never touched. */
function update(host: HTMLElement): void {
  settle(host);
  if (host.hasAttribute('title') && !ownTitle(host)) return;
  const title = clipTitleText(clipFacts(host));
  if (title === null) {
    if (ownTitle(host)) { host.removeAttribute('title'); host.removeAttribute(MARK); }
    return;
  }
  if (host.getAttribute('title') !== title) host.setAttribute('title', title);
  host.setAttribute(MARK, title);
}

/** The hosts being watched now, each with its stop. */
const watched = new WeakMap<Element, () => void>();

/** Attributes whose change can change the decision: the box (class, style, hidden) and ownership (a title, an ARIA name
 * or description, a role, a link's href). Ownership is not watched live: it is
 * decided at pointerenter and again at every recheck, and a child that becomes an owner triggers one. The helper's own
 * title write on the host fires one recheck that changes nothing. */
const RECHECK_ATTRS = ['class', 'style', 'hidden', 'title', 'aria-describedby', 'aria-labelledby', 'role', 'href'];

/** Recheck `host` whenever its content, its boxes or an owner attribute in it change, until `clearClipTitle`: a
 * ResizeObserver on the host and on every element in it (a part a breakpoint hides goes to 0 × 0), re-armed when its
 * children change, and a MutationObserver over the subtree for text, children and RECHECK_ATTRS. */
function watch(host: HTMLElement): void {
  if (watched.has(host)) return;
  const view = host.ownerDocument.defaultView;
  let ro: ResizeObserver | undefined;
  const recheck = () => {
    if (!host.isConnected) return clearClipTitle(host);
    update(host);
  };
  const observeBoxes = () => {
    if (!ro) return;
    ro.disconnect();
    ro.observe(host);
    for (const el of host.querySelectorAll('*')) ro.observe(el);
  };
  if (typeof ResizeObserver !== 'undefined') ro = new ResizeObserver(recheck);
  observeBoxes();
  const mo = view?.MutationObserver ? new view.MutationObserver(() => { observeBoxes(); recheck(); }) : undefined;
  mo?.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: RECHECK_ATTRS });
  watched.set(host, () => { ro?.disconnect(); mo?.disconnect(); });
}

/** The pointer is over `host`: own its title from now on (set it while the host is cut, recheck it as the host changes)
 * until `clearClipTitle`. Calling it again only rechecks. */
export function clipTitle(host: HTMLElement): void {
  watch(host);
  update(host);
}

/** The pointer left (or the host is no longer the one pointed at): stop watching and take away the title clipTitle set,
 * if it is still the one it set. */
export function clearClipTitle(host: Element): void {
  watched.get(host)?.();
  watched.delete(host);
  settle(host);
  if (!ownTitle(host)) return;
  host.removeAttribute('title');
  host.removeAttribute(MARK);
}

/** A pointer that hovers: a mouse or a pen. Touch fires pointerenter on a tap, and a tooltip there would only cover. */
export function hoverPointer(pointerType: string): boolean {
  return pointerType === 'mouse' || pointerType === 'pen';
}
