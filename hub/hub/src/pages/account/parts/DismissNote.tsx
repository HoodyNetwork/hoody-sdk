// "Nothing was dismissed": the answer of a warned Dismiss whose holds were already replaced or freed. The band that
// offered it stays (the change may still have gone through); this says why the press changed nothing, never "failed".
import { useStrings } from '@kit';
import strings from '../strings.en.json';

export function DismissNote({ show }: { show: boolean }) {
  const t = useStrings(strings);
  return <span aria-live="polite">{show ? t('check.nothing') : null}</span>;
}
