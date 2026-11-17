// Handoff in the terminal: the one way a part that only exists on the web is handed to a browser.
//   ⇗ The chart needs a browser to draw.
//   Open the chart on the web:                          (block only)
//   https://hub.example.com/auth/home?realm=…&computer=…#/schedules
//   [o Open] [c Copy link] [r QR code]
// - The reason is always drawn, in both sizes (a line hand-off is the reason and its keys on one row, wrapped, then the
//   address): nothing required is dropped.
// - The address carries the DECLARED page path the current route (or `to`) falls under, nothing below it and never its
//   search or fragment (handoff.pure declaredRoute: a search value or a sub-path may hold anything, and the
//   address is drawn, linked, copied, opened and QR-encoded), plus the realm and the active computer through their
//   allowlist (placeQuery; `computer`, when given, in place of the active one). The declared paths are the router's own page routes; outside a router there are none and
//   the address is the Hub root. It is drawn whole (wrapped, never cut) and, when the web origin is known, as the
//   terminal's own link (OSC 8).
// - Actions, each a key while any of them has the focus: o opens it in the host's browser (only when the host has
//   openExternal and the origin is known); c copies it (OSC 52; always); r shows it as a QR code for a phone (only when
//   the address can be drawn as one: a whole https address). Never q: the shell quits on a q no control took, so a
//   q pressed with the focus elsewhere would leave the Hub. Over SSH with no opener it prints and copies.
// - A block hand-off takes the focus when nothing has it (its first action, autoFocus): on a page that is a hand-off
//   the drawn keys work at once, and Tab does not start in the sidebar. It never takes the focus from a control that
//   has it, and a line hand-off (one row inside a form or a list) never asks for it.
// - Every word is in Handoff.term.strings.en.json; `reason` and `what` are the caller's (already translated).
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type * as Web from './Handoff';
import { hostEnv } from '../../core/host-env';
import { usePathname, useSearch } from '../nav';
import { declaredPaths, hasRepeatedKey, hubWebAddress as address, recordHandoffDraw, routeOf, shownAddress, type HandoffPlace } from './handoff.pure';
import { useLocationPart } from '../navPart';
import { Box, Pressable, Text, type Key } from '../../term/prim';
import { useCopyText, COPIED_MS } from './termCopy';
import { useRouter } from '@tanstack/react-router';
import { PX_GLYPHS, iconText } from '../icons.glyphs';
import { useShellData } from '../../shell/context';
import { useStrings } from '../strings';
import { qrMatrix } from '../qr/qr';
import { QrAddressDialog } from '../qr/termQrDialog';
import strings from './Handoff.term.strings.en.json';
import { focusInk } from '@term/kit';

/** The widest the hand-off card draws: a notice of two sentences and a link, not a banner. On a big screen it stays
 *  a card at the start edge instead of a frame across the whole terminal. 120: a whole Hub address with its realm and
 *  computer (about 110 cells) still fits on one line inside it. */
const HANDOFF_CARD_MAX = 120;

export type { HandoffProps } from './Handoff';
export { HUB_WEB_PATH } from './handoff.pure';
export const hubWebAddress: typeof Web.hubWebAddress = address;

/** The web Hub's origin, only as the host gave it (HubTermOptions.webOrigin → session pageAddress); never guessed:
 *  unknown = the path form. */
function webOrigin(): string | null {
  try { return hostEnv().pageAddress?.origin ?? null; } catch { return null; }
}

/** The host's browser opener, when it has one. */
function opener(): ((url: string) => boolean) | null {
  try {
    const open = hostEnv().openExternal;
    return open ? (url: string) => open(url) !== false : null;
  } catch {
    return null;
  }
}

/** The arrow mark, from the icon map (never an emoji-capable code point). */
const EXT = iconText(PX_GLYPHS.external);

/** The current page's path and the router's declared page paths, read only under a router (its search is never read:
 *  it does not travel). */
function RoutedHandoff(p: BodyProps & { router: unknown }): ReactElement {
  const pathname = usePathname();
  const search = useSearch();
  const { router, ...rest } = p;
  const declared = useMemo(() => declaredPaths(router), [router]);
  // Subscribes to each navigation (its key), so a move between two searches the router folds alike still re-reads the
  // raw entry below.
  useLocationPart((l) => (l.state as { __TSR_key?: unknown } | undefined)?.__TSR_key ?? l.href);
  // The router keeps one value per key (the last); the history entry still holds what was given. A repeated key is
  // ambiguous: nothing of the search travels. The raw entry is read only while it is this page's.
  const raw = rawSearchOf(router, pathname);
  // The current route with its search: hubWebAddress keeps only what pageRoute allows for the page (none for most).
  const here = useMemo(() => (hasRepeatedKey(raw) ? pathname || '/' : routeOf(pathname || '/', search)), [pathname, search, raw]);
  return <HandoffBody {...rest} route={p.to ?? here} declared={declared} />;
}

/** The search of the router's current history entry, as given (repeats kept), when that entry is at `pathname`; ''
 *  otherwise (a page drawn from its held location reads only the folded search). */
function rawSearchOf(router: unknown, pathname: string): string {
  const loc = (router as { history?: { location?: { pathname?: unknown; search?: unknown } } } | null)?.history?.location;
  if (!loc || typeof loc.search !== 'string' || typeof loc.pathname !== 'string') return '';
  let at = loc.pathname;
  try { at = decodeURI(at); } catch { /* keep it as given */ }
  return at === pathname ? loc.search : '';
}

/** No router, no declared page: the address is the Hub root. */
const NO_PAGES: readonly string[] = [];

type BodyProps = { reason: string; to?: string; computer?: string | null; what: string; size: 'line' | 'block'; route?: string; declared?: readonly string[] };

// Outside a router (an isolated render, a form field's own scenario) there is no current route and no declared page:
// the address is the Hub's root, whatever `to` says. The router's presence never changes for a mounted component, so
// the branch is stable.
export const Handoff: typeof Web.Handoff = ({ reason, to, computer, what = 'this', size = 'block' }) => {
  // The reason is the hand-off's whole point (the person must learn why it is not here): a blank one is a caller bug,
  // refused at run time as the graph check refuses it in source.
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('HANDOFF_REASON_EMPTY: a Handoff needs a reason');
  const router = useRouter({ warn: false }) as unknown;
  const p = { reason, what, size, ...(to !== undefined ? { to } : {}), ...(computer !== undefined ? { computer } : {}) };
  return router ? <RoutedHandoff {...p} router={router} /> : <HandoffBody {...p} route={to ?? '/'} declared={NO_PAGES} />;
};

/** A short-lived answer on a key ("Opened" / "Couldn't open"), cleared after COPIED_MS and on unmount. */
function useFlash(): ['yes' | 'no' | null, (ok: boolean) => void] {
  const [state, setState] = useState<'yes' | 'no' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return [state, (ok) => {
    setState(ok ? 'yes' : 'no');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setState(null); }, COPIED_MS);
  }];
}

function HandoffBody({ reason, computer, what, size, route = '/', declared = NO_PAGES }: BodyProps): ReactElement {
  const t = useStrings(strings);
  const shell = useShellData();
  // The realm only once the shell knows the realms (outside a shell the default 'all' is no choice anyone made).
  // Each field only once the shell's own list holds it (placeQuery): a shape is not a verification.
  const place: HandoffPlace = { realm: shell.realmId, computer: computer !== undefined ? computer : shell.computerId ?? null, realms: shell.realms };
  const origin = webOrigin();
  // Board extras travel only when they name a computer of this list (pageRoute).
  const url = address(route, origin, place, declared, shell.computers);
  const open = origin ? opener() : null;
  const canQr = origin !== null && qrMatrix(url) !== null;
  const [copyText, copied] = useCopyText();
  const [opened, flashOpened] = useFlash();
  const [qr, setQr] = useState(false);
  const thing = what === 'this' ? null : what;
  useEffect(() => { recordHandoffDraw({ what, reason }); }, [what, reason]);

  const act = { o: () => { if (open) flashOpened(open(url)); }, c: () => { copyText(url); }, r: () => { if (canQr) setQr(true); } };
  // A failed copy points at an action that still carries the whole address: the QR code, else the browser;
  // selecting the drawn text is offered only when nothing in it is masked (it would copy "…" in place of ids).
  const shownUrl = shownAddress(url);
  const copyFailed = canQr ? t('handoff.copyFailedQr') : open ? t('handoff.copyFailedOpen') : shownUrl === url ? t('handoff.copyFailed') : t('handoff.copyFailedBare');
  const onKey = (k: Key): boolean => {
    if (k.ctrl || k.meta || k.option) return false;
    const run = (act as Record<string, (() => void) | undefined>)[k.name];
    if (!run || (k.name === 'o' && !open) || (k.name === 'r' && !canQr)) return false;
    run();
    return true;
  };
  const keyText = (key: string, label: string, focused: boolean, tone: 'ok' | 'warn' | null): ReactElement => (
    <Text colour={tone === 'warn' ? 'warn' : 'blueText'} {...focusInk(focused)}>{tone ? `[${tone === 'ok' ? '✓' : '!'} ${label}]` : `[${key} ${label}]`}</Text>
  );
  // The first drawn action of a block hand-off asks for the focus when nothing has it.
  const first = size === 'block';
  const actions = (
    <Box dir="row" wrap gapX={1} gapY={0} shrink={0} sem={{ role: 'group', name: t('handoff.actions') }}>
      {open ? (
        <Pressable dir="row" shrink={0} autoFocus={first} onPress={act.o} onKey={onKey} sem={{ name: t('handoff.open') }}>
          {({ focused }) => keyText('o', opened === 'yes' ? t('handoff.opened') : opened === 'no' ? t('handoff.openFailed') : t('handoff.open'), focused, opened === 'yes' ? 'ok' : opened === 'no' ? 'warn' : null)}
        </Pressable>
      ) : null}
      <Pressable dir="row" shrink={0} autoFocus={first && !open} onPress={act.c} onKey={onKey} sem={{ name: t('handoff.copy') }}>
        {({ focused }) => keyText('c', copied === 'yes' ? t('handoff.copied') : copied === 'no' ? copyFailed : t('handoff.copy'), focused, copied === 'yes' ? 'ok' : copied === 'no' ? 'warn' : null)}
      </Pressable>
      {canQr ? (
        <Pressable dir="row" shrink={0} onPress={act.r} onKey={onKey} sem={{ name: t('handoff.qr'), expanded: qr }}>
          {({ focused }) => keyText('r', t('handoff.qr'), focused, null)}
        </Pressable>
      ) : null}
    </Box>
  );
  // Drawn with ids masked (shownAddress; CONTRIBUTING.md "Secrets and ids"); the link, open, copy and QR take the whole one.
  const shown = <Text colour="blueText" underline {...(origin ? { href: url } : {})}>{shownUrl}</Text>;
  const dialog = canQr ? <QrAddressDialog url={url} name={thing ? t('handoff.qrName', { what: thing }) : t('handoff.qrNameIt')} open={qr} onClose={() => setQr(false)} /> : null;
  const where = origin ? '' : ` ${t('handoff.noOrigin')}`;

  if (size === 'line') {
    return (
      <Box dir="column" shrink={0}>
        <Box dir="row" wrap gapX={2} gapY={0} shrink={0}>
          <Text colour="muted"><Text colour="blueText">{EXT}</Text> {reason}{where}</Text>
          {actions}
        </Box>
        {shown}
        {dialog}
      </Box>
    );
  }
  return (
    <Box dir="column" border borderColour="line" padX={1} shrink={0} maxWidth={HANDOFF_CARD_MAX}>
      <Text><Text colour="blueText" bold>{EXT}</Text> {reason}</Text>
      <Text colour="muted">{(thing ? t('handoff.openThing', { what: thing }) : t('handoff.openIt')) + where}</Text>
      {shown}
      {actions}
      {dialog}
    </Box>
  );
}
