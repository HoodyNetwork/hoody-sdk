// What an empty storage list says under its title: the best-known storage kinds the picker connects, each one unit (a
// kit Tag: its mark, the kit's Monogram, then its name; never split across lines), three to a row, then how many more.
// It reads as the plain sentence ("Works with Amazon S3, … and 93 more": the marks are decoration, the commas are for
// screen readers only). The terminal draws the sentence alone (EmptyBody.term.tsx).
import { Monogram, SrOnly, Tag, useStrings } from '@kit';
import strings from './strings.en.json';

/** A row break: the empty state's body keeps written line breaks. */
const BR = '\n';

export interface EmptyBodyProps {
  /** The six kinds named, in order (their shown names). */
  names: readonly string[];
  /** How many more kinds the picker connects. */
  more: number;
}

export function EmptyBody({ names, more }: EmptyBodyProps) {
  const t = useStrings(strings);
  const [a = '', b = '', c = '', d = '', e = '', f = ''] = names;
  const sep = <SrOnly>{t('works.sep')}</SrOnly>;
  return (
    <>
      {t('works.lead')}{BR}
      <Tag><Monogram name={a} />{a}{sep}</Tag>{' '}
      <Tag><Monogram name={b} />{b}{sep}</Tag>{' '}
      <Tag><Monogram name={c} />{c}{sep}</Tag>{BR}
      <Tag><Monogram name={d} />{d}{sep}</Tag>{' '}
      <Tag><Monogram name={e} />{e}{sep}</Tag>{' '}
      <Tag><Monogram name={f} />{f}</Tag>{BR}
      {t('works.more', { count: more })}
    </>
  );
}
