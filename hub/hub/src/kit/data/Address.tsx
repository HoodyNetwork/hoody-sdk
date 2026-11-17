// A program's web address. The address grants access, so it acts like a password: on screen only its masked form
// (core maskAddress: the middle of every 24-hex id hidden), while Copy, Open and the QR code take the whole address.
import type { ReactNode } from 'react';
import { maskAddress } from '@core';
import { IconButton, cx } from '../controls/Button';
import { ExtLink, webAddress } from '../controls/Link';
import { QrButton } from '../qr/Qr';
import type { QrReachKind } from '../qr/qr';
import { useStrings } from '../strings';
import { CopyButton } from './Ids';
import strings from './Address.strings.en.json';
import s from './Address.module.css';

export { webAddress };

/**
 * The address masked (core maskAddress: the middle of every 24-hex id hidden), with its http:// or https:// scheme. With
 * `open`, a valid web address is an ExtLink. A program address (a 24-hex id in its host) is secret by shape: a button that
 * shows its scheme and bullets (nothing of the address) and opens it in a new tab (noopener), reachable by keyboard, never
 * an <a href> (the whole address would sit in the page and show in the browser's status bar on hover, which the masking
 * exists to avoid). Any other web address (an alias on the user's own domain) is an ordinary new-tab link. `name` says which
 * address it is ("port 8080"), as its accessible name. Leave `open` off for an address a browser should not open (a proxy,
 * an SSH host): it is then masked text, not a link.
 */
export function AddressText({ url, open, name, className }: { url: string; open?: boolean; name?: string; className?: string }) {
  if (open && webAddress(url)) return <ExtLink url={url} look="nav" icon={false} truncate {...(name !== undefined ? { name } : {})} className={cx(s.text, className)} />;
  return (
    <bdi dir="ltr" className={cx(s.text, className)} title={maskAddress(url)}>
      {maskAddress(url)}
    </bdi>
  );
}

export interface AddressFieldProps {
  /** The whole address. */
  url: string;
  /** What it opens, in the button names ("Copy Address", "Open port 8080 in a new tab", "QR code: port 8080"). */
  label: string;
  /** The program is not running: Open still opens, and says the address won't answer until it is started. */
  idle?: boolean;
  /** Closes an open QR code when it changes (the computer shown, say). */
  resetKey?: string;
  /** What the address reaches, for its QR code's caption ('port': the app on a port; default: one program). */
  reach?: QrReachKind;
  className?: string;
}

/**
 * The masked address (a click on it opens it) with Copy, Open (a new tab, noopener) and a QR code. An empty address
 * is a dash. An address that is not an absolute http/https URL still shows and copies, but Open is disabled and the
 * QR code has none.
 */
export function AddressField({ url, label, idle, resetKey, reach, className }: AddressFieldProps) {
  const t = useStrings(strings);
  const web = webAddress(url);
  if (!url) return <span className={cx(s.faint, className)}>—</span>;
  return (
    <span className={cx(s.field, className)}>
      <AddressText url={url} open name={label} />
      <span className={s.actions}>
        <CopyButton text={url} label={t('address.copy', { what: label })} />
        <IconButton
          icon="external"
          size="sm"
          label={t(idle ? 'address.openIdle' : 'address.open', { what: label })}
          isDisabled={!web}
          onPress={() => {
            if (web) window.open(web, '_blank', 'noopener');
          }}
        />
        <QrButton url={web || undefined} name={label} size="sm" {...(resetKey !== undefined ? { resetKey } : {})} {...(reach !== undefined ? { reach } : {})} />
      </span>
    </span>
  );
}

/** A list of address rows (AddressRow), in one bordered box. Its own width lays the rows out (see AddressRow). */
export function AddressList({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul className={cx(s.list, className)} aria-label={label}>
      {children}
    </ul>
  );
}

export interface AddressRowProps {
  /** What the address opens: an icon and a name. */
  name: ReactNode;
  url: string;
  /** A click on the address opens it (see AddressText). */
  open?: boolean;
  /** Plain words that say which address it is, as the address button's accessible name ("Terminal"). */
  label?: string;
  /** The row's buttons (Copy, QR code, Open, Add to Board ...). */
  actions?: ReactNode;
}

/**
 * One address in an AddressList. The list's width lays it out: name, address and actions on one line when
 * there is room; then the name and the actions over the address on a whole line; on the narrowest, name, address and
 * actions each on a line. The address always keeps a usable width.
 */
export function AddressRow({ name, url, open, label, actions }: AddressRowProps) {
  return (
    <li className={s.row}>
      <span className={s.rowName}>{name}</span>
      <AddressText url={url} open={open} {...(label !== undefined ? { name: label } : {})} className={s.rowAddr} />
      {actions && <span className={s.rowActions}>{actions}</span>}
    </li>
  );
}
