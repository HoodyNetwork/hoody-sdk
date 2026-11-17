// The passcode lock in the terminal. The terminal Hub keeps no passcode: its host refuses one (HostEnv.passcodeLock is
// false, so core's lockSupport() is false and setPasscode answers 'unsupported'), so no record can exist here and the
// web's Set / Change / Remove / Lock now can never work. The section says so in its own words, with no button that can
// never work, and hands setting a passcode to the web Hub (kit Handoff: the page's web address, Copy link, QR code): a
// passcode locks the Hub in the browser where it is set. The web's unsupported state ("This browser can't keep a
// passcode." and a disabled Set a passcode) speaks of a browser, which a terminal is not.
import { Handoff, SettingRow, useStrings } from '@kit';
import { Box } from '@term/prim';
import strings from '../strings.en.json';
import type * as Web from './LockSection';
import termStrings from './lockTerm.strings.en.json';

export { IDLE_LABEL } from './LockSection.pure';

export const LockSection: typeof Web.LockSection = () => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  return (
    <Box dir="column" shrink={0}>
      <SettingRow label={t('lock.off')} help={tt('term.lock.none')} />
      <Handoff size="line" reason={tt('term.lock.reason')} what={tt('term.lock.what')} />
    </Box>
  );
};
