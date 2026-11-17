// One address of a program: name, the address with the computer id masked (ids are never shown whole),
// Copy (the full address) and Open (only a program with a page to open). A full id is never drawn.
import { CopyButton, IconButton, Row, useStrings, openOutside } from '@kit';
import strings from '../strings.en.json';
import { maskAddress } from '../logic';
import s from './guide.module.css';

interface Props {
  program: string;
  url: string;
  /** Long ids inside the address, masked on screen and kept in what is copied. */
  ids: readonly string[];
  /** Offers Open: false for a program used from code only (no page to open). */
  open?: boolean;
}

export function AddressRow({ program, url, ids, open = true }: Props) {
  const t = useStrings(strings);
  return (
    <li className={s.address}>
      <span className={s.addressName}>{program}</span>
      <span className={s.addressValue} translate="no" >
        {maskAddress(url, ids)}
      </span>
      <Row gap={1}>
        <CopyButton text={url} label={t('links.copy', { program })} />
        {open ? <IconButton icon="external" size="sm" label={t('links.open', { program })} onPress={() => openOutside(url)} /> : null}
      </Row>
    </li>
  );
}
