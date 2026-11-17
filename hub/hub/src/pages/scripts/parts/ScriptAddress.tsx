// A script's address, said once: what it is for, then the whole web address (the computer's Exec program, `-exec-1`, then the path)
// with Copy. The address acts like a password for the computer, so it is shown the way Programs shows theirs (the middle of every
// id hidden, `exec-1` readable) and Copy takes it whole. Opening a script's address runs it, so Open is offered only where the
// caller asks (`open`: New script's "It's live", for a script made a moment ago): the kit Link, which for an address that holds
// an id is a button with plain words that opens it in a new tab, the address never in the page. No QR code.
import { AddressText, CopyButton, Link, useStrings } from '@kit';
import strings from '../strings.en.json';
import s from './parts.module.css';
import { fullAddress, opensAsIs } from './ScriptAddress.pure';

export { fullAddress, opensAsIs } from './ScriptAddress.pure';

export function ScriptAddress({ origin, path, label, explain = true, open = false }: { origin: string; path: string; label: string; explain?: boolean; /** Offer Open (a new tab): only for an address that answers now. */ open?: boolean }) {
  const t = useStrings(strings);
  const url = fullAddress(origin, path);
  return (
    <div className={s.fullAddress}>
      {explain ? <p className={s.hint}>{t('address.what')}</p> : null}
      <span className={s.addressLine}>
        <AddressText url={url} className={s.addressText} />
        <CopyButton text={url} label={t('address.copyWhat', { what: label })} />
        {open && opensAsIs(origin, path) ? <span className={s.addressOpen}><Link href={url} variant="nav">{t('address.open')}</Link></span> : null}
      </span>
      {origin ? <p className={s.faint}>{t('address.where')}</p> : null}
    </div>
  );
}
