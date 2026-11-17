// The footer of a drawer whose change may have gone through: the action is gone, Check again only reads the
// state back (C9). Nothing is ever sent a second time from here. Any other way out (Stop tracking, Sign in again)
// sits on the drawer's pending banner, so the foot holds Close and its one primary only.
import { Button, useStrings } from '@kit';
import strings from '../strings.en.json';

export function LockedFooter({ onClose, onCheck, checking }: { onClose: () => void; onCheck: () => void; checking: boolean }) {
  const t = useStrings(strings);
  return (
    <>
      <Button variant="secondary" onPress={onClose}>
        {t('sheet.close')}
      </Button>
      <Button variant="primary" busy={checking} onPress={onCheck}>
        {t('check.again')}
      </Button>
    </>
  );
}
