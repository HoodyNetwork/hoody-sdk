// Links and text buttons in the terminal. A Link goes to a Hub path through the router; every string it shows goes
// through safeShown, and an href that holds an id (secretHref) shows the mask. An ExtLink is a terminal link (OSC 8)
// where the terminal has them, its address shown with the scheme; a secret one shows only its scheme and bullets,
// carries no link, and is a button that opens the whole address through openOutside (the web's button opens it by
// script), the address never drawn. A disabled TextButton with a reason stays focusable and says why (SoftPress). The rules are the web's
// (Link.pure.ts).
import type * as Web from './Link';
import { useRouter } from '@tanstack/react-router';
import { useGoTerm } from '../../term/app/nav';
import { Text } from '../../term/prim';
import { textOf } from '../../term/prim/semantics';
import { useStrings } from '../strings';
import strings from './Link.strings.en.json';
import { softDisabled } from './Button.pure';
import { BULLETS, autolinkPieces, decoded, hasId, holdsId, leaksAddress, maskedLabel, safeShown, secretHref, secretShape, webAddress } from './Link.pure';
import { PRESS, SoftPress } from './termPress';
import { focusInk } from '../../term/prim/FocusInk';
import { PX_GLYPHS, iconText } from '../icons.glyphs';

/** The new-tab mark: the icon map's `external` (⇗, never the emoji-capable ↗). */
const EXT = iconText(PX_GLYPHS.external);
import { useSubmitTarget } from '../forms/termField';
import { openOnWeb, openOutside } from '../states/openOutside';

export type { LinkProps, TextButtonProps, ExtLinkProps } from './Link';
export { holdsId, resetExtLinkNotes, safeShown, secretShape, webAddress } from './Link.pure';

export const TextButton: typeof Web.TextButton = ({ tone = 'default', busy, isDisabled, disabledReason, onPress, children, autoFocus, type, form, 'aria-label': ariaLabel }) => {
  const submit = useSubmitTarget(type, form, () => isDisabled === true || busy === true);
  const soft = softDisabled(disabledReason, isDisabled, busy);
  const off = isDisabled === true && !busy;
  return (
    <SoftPress off={isDisabled === true} busy={busy === true} soft={soft} reason={disabledReason} shrink autoFocus={autoFocus} onPress={() => { onPress?.(PRESS); submit(); }}
      // An aria-label names the button, as on the web ("Stop npm run dev" for one of several "Stop"s).
      sem={{ name: ariaLabel ? safeShown(ariaLabel) : typeof children === 'string' ? safeShown(children) : textOf(children), busy: busy || undefined }}>
      {({ focused }) => (
        <Text colour={off ? 'faint' : tone === 'danger' ? 'danger' : 'blueText'} underline truncate {...focusInk(focused)}>
          {busy ? '… ' : ''}
          {typeof children === 'string' ? safeShown(children) : children}
        </Text>
      )}
    </SoftPress>
  );
};

export const Link: typeof Web.Link = ({ href, onPress, isDisabled, children, autoFocus }) => {
  const go = useGoTerm();
  // An absolute http(s) address is the web's new tab: here openOutside (the host's browser, else the address copied
  // and shown, never nothing), also when the address holds an id: the web opens that one from a button with no href,
  // and here its words stay masked on the page and in the toast (the mask, one rule with ExtLink). Outside a router (a bare component harness) a press reports itself and goes nowhere.
  const routed = Boolean(useRouter({ warn: false }));
  const secret = secretHref(href);
  const shown = secret ? (typeof children === 'string' && !holdsId(children) ? safeShown(children) : BULLETS) : typeof children === 'string' ? safeShown(children) : children;
  return (
    <SoftPress off={isDisabled === true} soft={false} shrink autoFocus={autoFocus} onPress={() => { onPress?.(PRESS); if (/^https?:\/\//i.test(href)) openOutside(href, secret ? { shownAs: maskedLabel(href) } : {}); else if (href.startsWith('/auth/')) openOnWeb(href); else if (!secret && routed) go(href); }}
      sem={{ role: 'link', name: typeof shown === 'string' ? shown : textOf(shown) }}>
      {({ focused }) => <Text colour={isDisabled ? 'faint' : 'blueText'} underline truncate {...focusInk(focused)}>{shown}</Text>}
    </SoftPress>
  );
};

export const ExtLink: typeof Web.ExtLink = ({ url, children, secret, truncate, name, icon = true }) => {
  const t = useStrings(strings);
  if (!url) return <Text colour="faint">—</Text>;
  const web = webAddress(url);
  if (!web) return <Text colour="muted">{secret || hasId(decoded(url)) || holdsId(decoded(url)) ? BULLETS : safeShown(url)}</Text>;
  const hidden = secret === true || secretShape(web) || holdsId(web);
  const words = children === undefined || (hidden && leaksAddress(children, web)) ? undefined : safeShown(children);
  const shown = words ?? (hidden ? maskedLabel(web) : safeShown(web));
  // The spoken name as the web's: the shown words, the caller's extra words (never for a secret address that they
  // would repeat), then "opens in a new tab"; a secret one is a button there (it opens by script, with no href).
  const extra = name === undefined || (hidden && leaksAddress(name, web)) ? undefined : safeShown(name);
  const label = `${safeShown(extra ? `${shown}: ${extra}` : shown)} ${t('ext.newTab')}`;
  // The secret one is the web's button: Tab reaches it, Enter or a click opens the whole address outside the Hub
  // (it drew as a button nothing could press). What a toast may show of it is its mask. The mask itself ("https://••••")
  // never shrinks, so it never breaks at its slash: what stands beside it gives way first. A caller's words may wrap.
  if (hidden) {
    return (
      <SoftPress off={false} soft={false} shrink={words !== undefined} onPress={() => { openOutside(web, { shownAs: maskedLabel(web) }); }} sem={{ role: 'button', name: label }}>
        {({ focused }) => (
          <Text colour="blueText" underline truncate={truncate} {...focusInk(focused)}>
            {shown}
            {icon ? ` ${EXT}` : ''}
          </Text>
        )}
      </SoftPress>
    );
  }
  return (
    <Text colour="blueText" underline truncate={truncate} href={web} sem={{ role: 'link', name: label }}>
      {shown}
      {icon ? ` ${EXT}` : ''}
    </Text>
  );
};

export const autolink: typeof Web.autolink = (text, o = {}) => {
  const read = autolinkPieces(text, o);
  if (typeof read === 'string') return read;
  return read.map((n) => (typeof n === 'string' ? n : <ExtLink key={n.key} url={n.url} {...(o.secret !== undefined ? { secret: o.secret } : {})} />));
};
