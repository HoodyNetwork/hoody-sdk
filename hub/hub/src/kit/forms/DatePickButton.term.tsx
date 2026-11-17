// DatePickButton in the terminal: the calendar is a pointer picker, and its date is typed in the field beside it
// (DateField / DateTimeField take YYYY-MM-DD). The button keeps the web's name and its disabled state; pressing it
// opens a one-line hand-off to the web calendar (a second press closes it). `onChange` is never called here.
// The terminal draws no calendar: typed and stepped dates are the terminal's date picker.
import { useEffect, useState } from 'react';
import type * as Web from './DatePickButton';
import { Box } from '../../term/prim';
import { Button } from '../controls/Button';
import { Handoff } from '../states/Handoff';
import { useStrings } from '../strings';
import strings from './DatePickButton.strings.en.json';
import termStrings from './term.strings.en.json';

export type { DatePickButtonProps } from './DatePickButton';

export const DatePickButton: typeof Web.DatePickButton = ({ isDisabled = false }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const [open, setOpen] = useState(false);
  // A field locked or disabled while the hand-off is open closes it (the web closes its open calendar).
  useEffect(() => { if (isDisabled) setOpen(false); }, [isDisabled]);
  return (
    <Box dir="column" shrink={0}>
      <Button size="sm" variant="ghost" isDisabled={isDisabled} onPress={() => setOpen((o) => !o)}>{t('datepick.open')}</Button>
      {open && !isDisabled ? (
        <Handoff size="line" what={tt('datepick.handoffWhat')} reason={tt('datepick.handoffReason')} />
      ) : null}
    </Box>
  );
};
