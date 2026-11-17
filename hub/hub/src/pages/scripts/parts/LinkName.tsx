// The name of a public link: filled with a suggestion (two words and a long random ending, so the address cannot be guessed), checked
// by the API's own rule (core), with a button for another suggestion. One field for the detail's dialog and for New script.
export { useLinkName } from './LinkName.pure';
export type { LinkName } from './LinkName.pure';
import type { LinkName } from './LinkName.pure';
import { IconButton, TextField, useStrings } from '@kit';
import strings from '../strings.en.json';
import s from './parts.module.css';

/** `missing`: the form was sent on while the name is empty (New script's Continue): the empty box then says the rule as
 *  its error, like any other name that does not fit. */
export function LinkNameField({ link, isDisabled, label, missing }: { link: LinkName; isDisabled?: boolean; label?: string; missing?: boolean }) {
  const t = useStrings(strings);
  const error = link.name === '' && !missing ? undefined : link.problem === 'rule' ? t('link.rule') : link.problem === 'reserved' ? t('link.reserved') : undefined;
  return (
    <div className={s.linkName}>
      <TextField
        label={label ?? t('link.name')}
        value={link.name}
        onChange={link.setName}
        mono
        isDisabled={isDisabled}
        errorMessage={error}
        description={error ? undefined : t('link.rule')}
        suffix={<IconButton icon="reload" size="sm" variant="ghost" label={t('link.another')} isDisabled={isDisabled} onPress={link.another} />}
      />
      <p className={s.hint}>{t('link.guess')}</p>
    </div>
  );
}
