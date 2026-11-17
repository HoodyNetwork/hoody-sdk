// JumpToNewest: the way back to the end of a conversation the reader has scrolled away from. It is a row
// of its own below the transcript, never an overlay: it takes layout space and covers nothing (the geometry rule, 2.1).
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import strings from './JumpToNewest.strings.en.json';
import s from './JumpToNewest.module.css';

export function JumpToNewest({ onPress }: { onPress: () => void }) {
  const t = useStrings(strings);
  return (
    <div className={s.row}>
      <Button size="sm" variant="secondary" icon="arrow-down" onPress={onPress}>{t('jump.label')}</Button>
    </div>
  );
}
