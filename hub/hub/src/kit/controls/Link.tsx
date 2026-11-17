// Links and text buttons. A `Link` goes somewhere and always looks like a link (link colour); an action that reads as
// text is a `TextButton`; a web address shown as itself is an `ExtLink`. Use `LinkButton` (Button.tsx) instead for a
// link drawn as a button. There is no muted-grey link: text that does not look clickable must not be clickable.
//
// Id masking (holdsId/safeShown and the DOM check below) is a heuristic safeguard, not a guarantee: a 24-hex program
// id can still reach the page through other paths (a //host href, portals, input values, late naming targets, other
// renderers). A never-expose guarantee needs an opaque secret-address value from API/core with its own
// display/open/copy components. Never rely on Link alone to hide an id.
import { Fragment, type ReactNode, type Ref, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  Tooltip as AriaTooltip,
  TooltipTrigger,
} from 'react-aria-components';
import { Icon, type IconName } from '../icons';
import { useKeyshortcuts } from '../keyshortcuts';
import { useStrings } from '../strings';
import { ButtonSpinner, ReasonTip, TOOLTIP_DELAY_MS, anchorProps, cx, softDisabled, softDisabledProps, useReasonTip } from './Button';
import btn from './Button.module.css';
import strings from './Link.strings.en.json';
import s from './Link.module.css';
import { BIDI, BULLETS, autolinkPieces, decoded, devNote, hasId, holdsId, leaksAddress, maskedLabel, safeShown, secretHref, secretShape, seen, webAddress } from './Link.pure';

// The pure rules live in Link.pure.ts (shared with the terminal); their names stay importable from here.
export { holdsId, resetExtLinkNotes, safeShown, secretShape, webAddress } from './Link.pure';

export interface LinkProps extends Omit<AriaLinkProps, 'className' | 'style' | 'children'> {
  /** A hash path inside the Hub ('/bots?sel=x') or an absolute https URL (opens in a new tab). */
  href: string;
  /**
   * `inline` (default): a link inside a sentence: the go blue, underlined on hover (the
   * "Blue go").
   * `plain`: inherits the text colour and underlines on hover, for links whose look comes from
   * their content (a row title, a name).
   * `nav`: every link outside a sentence: navigation chrome (View all, breadcrumbs, context
   * parts), a card's or panel's standalone "Docs", an EmptyState's Guide link. The same go blue
   * as inline, at rest and on hover, underlined on hover and keyboard focus.
   * An action ("Open ↗" in a row) is a LinkButton, not a Link.
   */
  variant?: 'inline' | 'plain' | 'nav';
  /** Underlined at rest too, not only on hover: an inline link in a line of muted text whose colour alone does not set
   *  it apart (axe link-in-text-block). Off by default; the design's blue-at-rest rule holds everywhere else. */
  underlined?: boolean;
  /** An icon after the label; drawn only when given (an external link gets none by default). */
  iconEnd?: IconName;
  className?: string;
  children: ReactNode;
}

/** A Link's own attributes that show as text (a tooltip, the spoken name): each goes through safeShown. */
const SHOWN_ATTRS = new Set(['title', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder']);

/** The attributes inside a link that show as text (shownHoldsId reads them; the observer watches them). */
const SHOWN_INNER = ['title', 'aria-label', 'aria-description', 'alt'];

/** The attributes that name or describe an element by other elements' text (their ids). */
const NAMED_BY = ['aria-labelledby', 'aria-describedby'];

const isHex = (c: string): boolean => /^[0-9a-f]$/i.test(c);

/**
 * The longest run of hex digits across a sequence of texts (the text nodes of an element, in order) when any whole text
 * may be hidden (display:none, hidden, clipped, zero-size: CSS decides, and a module class is not readable here). Each
 * text is read as a run reads it (seen); a shown text continues the run through its leading hex digits and starts the
 * next from its trailing ones; a hidden one leaves the run as it was. Fail closed: the longest over every choice. Linear.
 */
function runAcross(parts: readonly string[]): number {
  let best = 0;
  let cur = 0;
  for (const raw of parts) {
    const t = seen(raw);
    if (t === '') continue;
    let lead = 0;
    while (lead < t.length && isHex(t.charAt(lead))) lead += 1;
    if (lead === t.length) {
      cur += t.length;
      best = Math.max(best, cur);
      continue;
    }
    best = Math.max(best, cur + lead);
    let run = 0;
    for (let k = lead; k < t.length; k += 1) {
      run = isHex(t.charAt(k)) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    cur = Math.max(cur, run);
  }
  return best;
}

/** Whether the text of an element holds an id: all of it read as one text (holdsId), and its text nodes read with any
 *  of them possibly hidden (runAcross), written and with their percent-encoding undone. */
function textHoldsId(el: Element): boolean {
  if (holdsId(el.textContent ?? '')) return true;
  const parts: string[] = [];
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.nodeValue ?? '');
  return runAcross(parts) >= 24 || runAcross(parts.map(decoded)) >= 24;
}

/** Whether the text attributes of an element or of any element inside it hold an id. */
function attrsHoldId(el: Element): boolean {
  for (const n of [el, ...el.querySelectorAll('*')]) {
    for (const a of SHOWN_INNER) {
      const v = n.getAttribute(a);
      if (v && holdsId(v)) return true;
    }
  }
  return false;
}

/** The elements an element or any element inside it is named or described by (aria-labelledby, aria-describedby). */
function namedBy(el: Element): Element[] {
  const out: Element[] = [];
  for (const n of [el, ...el.querySelectorAll(NAMED_BY.map((a) => `[${a}]`).join(','))]) {
    for (const a of NAMED_BY) {
      for (const id of (n.getAttribute(a) ?? '').split(/\s+/)) {
        const t = id ? el.ownerDocument.getElementById(id) : null;
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/** Whether what an element puts in the page holds an id: its text (textHoldsId), the text attributes of it and of every
 *  element inside it, and the text and text attributes of every element they are named or described by (a hidden one
 *  included: its text is still the spoken name). */
function shownHoldsId(el: Element): boolean {
  if (textHoldsId(el) || attrsHoldId(el)) return true;
  return namedBy(el).some((t) => textHoldsId(t) || attrsHoldId(t));
}


/**
 * Links inside the Hub go through the router (Back works); external ones open a new tab. An absolute address that holds
 * an id is never put in the page: that Link is the secret ExtLink (its scheme and bullets, or the caller's plain string
 * words; a button that opens it, no href, so no status bar). Everything any other Link shows goes through safeShown:
 * string children and its text attributes as they render; any other children by what they put in the page
 * (shownHoldsId), read after each commit of the Link and on every later change inside it or in an element naming it (a
 * MutationObserver, whose callback re-renders synchronously), both before paint. When that holds an id the link shows
 * the mask in their place, whole, and drops its aria-labelledby and aria-describedby, until its children change.
 */
export function Link(props: LinkProps) {
  if (secretHref(props.href)) {
    // The secret button takes the href, the look, the class and plain string words only: onPress, iconEnd, aria-*, id,
    // data-* and element children are dropped (an element child could show the id; the button opens the href itself).
    // No caller passes them with an absolute id href; one that needs them gets a design, not a prop.
    const { href, variant, children, className } = props;
    return (
      <ExtLink url={href} secret look={variant === 'nav' || variant === 'plain' ? 'nav' : 'inline'} {...(className !== undefined ? { className } : {})}>
        {typeof children === 'string' || typeof children === 'number' ? String(children) : undefined}
      </ExtLink>
    );
  }
  return <PlainLink {...props} />;
}

function PlainLink({ href, variant = 'inline', underlined = false, iconEnd, className, children, ...rest }: LinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [maskedFor, setMaskedFor] = useState<{ readonly c: ReactNode } | null>(null);
  const masked = maskedFor !== null && maskedFor.c === children;
  // The children and whether they are masked, as of the last commit, for the observer below.
  const now = useRef({ children, masked });
  const watched = useRef<MutationObserver | null>(null);
  // No dependency list on purpose: every commit of the Link is read; setMaskedFor runs at most once per `children`
  // (masked stops it), so there is no update loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every commit is read, see above
  useLayoutEffect(() => {
    now.current = { children, masked };
    const el = ref.current;
    if (!el) return;
    // The elements that name it may be new since the last commit: watch them too (observing twice is one watch).
    for (const t of namedBy(el)) watched.current?.observe(t, WATCH);
    if (!masked && shownHoldsId(el)) setMaskedFor({ c: children });
  });
  // A child that updates itself commits without the Link, and an element that names it is elsewhere in the page: either
  // change is read when it lands. The callback is a microtask after the change, before paint; flushSync puts the mask in
  // before paint too.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    const watch = new MutationObserver(() => {
      const { children: c, masked: m } = now.current;
      for (const t of namedBy(el)) watch.observe(t, WATCH);
      if (!m && shownHoldsId(el)) flushSync(() => setMaskedFor({ c }));
    });
    watch.observe(el, WATCH);
    for (const t of namedBy(el)) watch.observe(t, WATCH);
    watched.current = watch;
    return () => {
      watched.current = null;
      watch.disconnect();
    };
  }, []);
  const own: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (masked && NAMED_BY.includes(k)) continue;
    own[k] = typeof v === 'string' && SHOWN_ATTRS.has(k) ? safeShown(v) : v;
  }
  const body = masked ? BULLETS : typeof children === 'string' || typeof children === 'number' ? safeShown(String(children)) : children;
  return (
    <AriaLink
      {...(own as typeof rest)}
      {...anchorProps(href, rest)}
      ref={ref}
      className={cx(s.link, variant === 'plain' ? s.plain : variant === 'nav' ? s.nav : s.inline, underlined && s.underlined, className)}
      data-underlined={underlined ? '' : undefined}
    >
      {body}
      {iconEnd && <Icon name={iconEnd} size="sm" className={s.icon} />}
    </AriaLink>
  );
}

/** What the observer watches: the subtree's nodes and text, and the attributes that show as text or name by others. */
const WATCH: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...SHOWN_INNER, ...NAMED_BY] };

// `isPending` is omitted as on Button: pending is spelled `busy`.
export interface TextButtonProps extends Omit<AriaButtonProps, 'className' | 'style' | 'children' | 'isPending'> {
  icon?: IconName;
  /** A busy pulse in place of the icon, and presses refused. */
  busy?: boolean;
  /** Why a disabled action cannot act (only read with `isDisabled`): it stays focusable and says why (Button's SoftDisabled). */
  disabledReason?: string;
  /** The button element (React 19 ref prop). */
  ref?: Ref<HTMLButtonElement>;
  /** `danger` for a light destructive action ("Forget"). */
  tone?: 'default' | 'danger';
  /**
   * The label is data, shown as written (`data-literal`). Link.module.css sets no case or
   * tracking, so nothing resets here; the prop is what the std `literal` rule reads.
   */
  literal?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * An action that reads as text, "dark do": dark, semibold, over a hairline underline in the grey line; on hover and
 * keyboard focus the underline takes the text colour. Actions are not blue; danger keeps its red. Use `Button`
 * instead for an action that stands on its own outside text.
 */
export function TextButton({ icon, tone = 'default', literal, busy, disabledReason, ref, isDisabled, className, children, ...rest }: TextButtonProps) {
  const soft = softDisabled(disabledReason, isDisabled, busy);
  const { ref: elRef, el: elNode, open: reasonOpen, setOpen: setReasonOpen } = useReasonTip(soft, busy, isDisabled, useKeyshortcuts<HTMLButtonElement>(undefined, ref), { aria: rest['aria-disabled'] });
  const reasonId = useId();
  const el = (
    // data-text-button: a container that lets its children shrink (a stacked PageHeader) keeps a TextButton's touch
    // minimum by this mark, whatever its accessible name (an IconButton carries an aria-label too).
    <AriaButton {...rest} isDisabled={isDisabled && !busy} isPending={busy} {...(soft ? { ...softDisabledProps(rest), 'aria-describedby': reasonId } : {})} ref={elRef} className={cx(s.link, s.textButton, tone === 'danger' ? s.danger : s.ink, className)} data-text-button="" data-literal={literal ? '' : undefined}>
      {busy ? <ButtonSpinner /> : icon && <Icon name={icon} size="sm" className={s.icon} />}
      {children}
    </AriaButton>
  );
  return (
    <>
      {el}
      <ReasonTip reason={disabledReason} shown={soft} id={reasonId} open={reasonOpen} setOpen={setReasonOpen} trigger={elNode} />
    </>
  );
}


export interface ExtLinkProps {
  /** An absolute http(s) URL. Anything else renders as plain text with no link (webAddress). */
  url: string;
  /**
   * Visible words instead of the URL ("Program rules"). Without them the URL itself shows: scheme, host, path; a secret
   * address shows its scheme and bullets. On a secret address the words must be plain: one that holds any 8-character run
   * of the address is refused (a dev error) and the bullets show instead.
   */
  children?: string;
  /**
   * The address grants access (a program address, a share link): it shows its scheme and bullets (nothing of the
   * address) and opens through a button, never an <a href>, so the address is never in the DOM or the status bar. Forced
   * on when a host in it holds a 24-hex run (secretShape): `secret={false}` cannot turn that off.
   */
  secret?: boolean;
  /**
   * The caller shows this secret address whole on purpose, after its own Show (a QR panel): the link's text is the
   * address itself (bidi controls removed), still on the button with no href, so the address never sits in an href or
   * the status bar. It opens like the QR panel's own Open: no opener and no referrer. Never set it on an address the
   * page has not been asked to show. No effect on a public address.
   */
  revealed?: boolean;
  /** `inline` (default): link colour, for a link inside a sentence. `nav`: the look in rows, facts and cells. */
  look?: 'inline' | 'nav';
  /** One line, cut at the end with an ellipsis; the full shown text is in a tooltip on the link. */
  truncate?: boolean;
  /** Words added to the accessible name after the visible text ("Docs: the signup link"). Plain words, as `children`. */
  name?: string;
  /** `false`: no arrow icon after the text, where Open sits right beside it (AddressText). */
  icon?: boolean;
  /** Found among other words (autolink sets it): a nav-look address there keeps its text line on a coarse pointer. */
  inText?: boolean;
  className?: string;
}


/**
 * A web address as a link: the full scheme shown, opening in a new tab without opener. A secret address (asked for, or
 * secret by shape) shows its ids masked and opens through a keyboard-reachable button; Copy, Open and the QR code of
 * the caller take the whole address. Not a web address: plain text. Empty: a dash.
 */
export function ExtLink({ url, children, secret, revealed = false, look = 'inline', truncate, name, icon = true, inText, className }: ExtLinkProps) {
  const t = useStrings(strings);
  if (!url) return <span className={cx(s.extFaint, className)}>—</span>;
  const web = webAddress(url);
  if (!web) {
    return (
      <span className={cx(s.extText, className)} title={t('ext.notWeb')}>
        {secret || hasId(decoded(url)) || holdsId(decoded(url)) ? BULLETS : safeShown(url)}
      </span>
    );
  }
  const shape = secretShape(web) || holdsId(web);
  if (secret === false && shape) devNote('unmask', 'a web address with an access id in a host is always secret; secret={false} is ignored');
  const hidden = secret === true || shape;
  // A secret link's text and name come from the caller's plain words or from the bullets, never from the address.
  // Every shown string goes through safeShown (one with an id anywhere is the mask, whole), and for a secret address
  // leaksAddress compares the caller's words with the address as a person reads them too (letters and digits only).
  let words = children === undefined ? undefined : safeShown(children);
  let extra = name === undefined ? undefined : safeShown(name);
  if (hidden && words !== undefined && children !== undefined && leaksAddress(children, web)) {
    devNote('children', 'the words of a secret address repeat part of the address; the bullets show instead');
    words = undefined;
  }
  if (hidden && extra !== undefined && name !== undefined && leaksAddress(name, web)) {
    devNote('name', 'the name of a secret address repeats part of the address; it is left out');
    extra = undefined;
  }
  const shown = words ?? (hidden ? (revealed ? web.replace(BIDI, '') : maskedLabel(web)) : safeShown(web));
  // The spoken name joins two shown strings: the join is judged again, so an id split between them never reads out. A
  // revealed address is read as it is shown (its words are the address the person asked to see).
  const said = extra ? `${shown}: ${extra}` : shown;
  const label = `${hidden && revealed && words === undefined ? said.replace(BIDI, '') : safeShown(said)} ${t('ext.newTab')}`;
  const cls = cx(s.link, s.ext, look === 'nav' ? s.nav : s.inline, truncate && s.extCut, className);
  const body = (
    <>
      <bdi dir="ltr">{shown}</bdi>
      {icon && <Icon name="external" size="sm" className={s.icon} />}
    </>
  );
  // data-secret-link: the secret link is drawn as a button with no href; app/nesting.ts finds it inside another control by this
  // mark, as it finds a[href].
  const node = hidden ? (
    <button
      type="button"
      className={cx(cls, s.extButton)}
      data-in-text={inText ? '' : undefined}
      data-secret-link=""
      aria-label={label}
      onClick={(e) => {
        // A drag that selects part of the address ends in a click: that one opens nothing. (A double-click to
        // select a word still opens on its first click.)
        // A keyboard activation (detail 0) is never that click: it opens whatever text is selected.
        const sel = window.getSelection();
        const el = e.currentTarget;
        if (e.detail !== 0 && sel && !sel.isCollapsed && (el.contains(sel.anchorNode) || el.contains(sel.focusNode))) return;
        window.open(web, '_blank', revealed ? 'noopener,noreferrer' : 'noopener');
      }}
    >
      {body}
    </button>
  ) : (
    <AriaLink {...anchorProps(web, {})} className={cls} data-in-text={inText ? '' : undefined} aria-label={label}>
      {body}
    </AriaLink>
  );
  // A secret link gets no tooltip: whatever it shows (the fixed text or the caller's own words) already says all it may.
  if (!truncate || hidden) return node;
  return (
    <TooltipTrigger delay={TOOLTIP_DELAY_MS} closeDelay={0}>
      {node}
      <AriaTooltip offset={6} className={btn.tooltip}>
        {shown}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/**
 * Plain text where every http(s) URL without userinfo, a query or a fragment is an ExtLink (the rule the reply Markdown
 * uses for bare links); the reading is autolinkPieces (Link.pure.ts). Text with no link comes back as a string. A link
 * that shares its text with other words is in text (it keeps its line on a coarse pointer); a whole value is not.
 */
export function autolink(text: string, o: { secret?: boolean; look?: 'inline' | 'nav' } = {}): ReactNode {
  const read = autolinkPieces(text, o);
  if (typeof read === 'string') return read;
  const inText = read.length > 1;
  return read.map((n, i) => (
    <Fragment key={i}>
      {typeof n === 'string' ? n : <ExtLink key={n.key} url={n.url} look={o.look ?? 'inline'} {...(o.secret !== undefined ? { secret: o.secret } : {})} {...(inText ? { inText: true } : {})} />}
    </Fragment>
  ));
}

