// The environment variables of a new computer: one row per variable, the value masked (a secret, wiped with
// the form). The create form keeps the NAME=value text; this editor reads and writes that text. The rows are the
// kit's EnvRows; this keeps the text, the wipe and the words.
import { EnvRows, type EnvRow, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import strings from '../strings.en.json';

const toText = (rows: readonly EnvRow[]): string =>
  rows.filter((r) => r.key !== '' || r.value !== '').map((r) => `${r.key}=${r.value}`).join('\n');

/** The rows of text this editor wrote (one NAME=value per line), for an editor mounted again over a kept form
 *  (More options folded and opened, or a copy shown and left): what is sent is always what is shown. */
const fromText = (text: string): EnvRow[] =>
  text === '' ? [] : text.split('\n').map((line, i) => {
    const at = line.indexOf('=');
    return at < 0 ? { id: i + 1, key: line, value: '' } : { id: i + 1, key: line.slice(0, at), value: line.slice(at + 1) };
  });

export function EnvEditor({ value, onChange, error }: { value: string; onChange: (text: string) => void; error?: string | undefined }) {
  const t = useStrings(strings);
  const [rows, setRows] = useState<EnvRow[]>(() => fromText(value));
  const next = useRef(rows.length + 1);
  // The form wiped the text (tab left, page locked, drawer closed): the rows go with it.
  useEffect(() => {
    if (value === '') setRows((r) => (r.some((x) => x.value !== '') ? [] : r));
  }, [value]);
  const set = (list: EnvRow[]) => {
    setRows(list);
    onChange(toText(list));
  };
  return (
    <EnvRows
      rows={rows}
      onEdit={(id, p) => set(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))}
      onRemove={(id) => set(rows.filter((x) => x.id !== id))}
      onAdd={() => setRows((l) => [...l, { id: next.current++, key: '', value: '' }])}
      titled
      label={t('create.env')}
      description={t('create.envHelp')}
      labels={{
        key: (n) => t('create.envKey', { n }),
        value: (n) => t('create.envValue', { n }),
        remove: (n) => t('create.envRemove', { n }),
        keyHint: t('create.envKeyHint'),
        valueHint: t('create.envValueHint'),
        add: t('create.envAdd'),
      }}
      errorMessage={error}
    />
  );
}
