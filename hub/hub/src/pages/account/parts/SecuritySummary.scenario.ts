// Behaviour contract of the account's security checklist (web and terminal). Its one callback, onOpen('setup'), is the
// "Turn on" button of the two-step line, which shows only when two-step sign-in is off. Mounted without a signed-in
// session and account data the checklist cannot render (it reads core's session through the account hooks), so any
// case here would pass without proving anything: onOpen is proved on the page instead, by the shot account/twofa-turn-on
// (fixture twofa-off: press the checklist's Turn on, wait for the setup sheet's first step).
import { scenarios } from '../../../kit/scenario-types';
import { SecuritySummary } from './SecuritySummary';

export default scenarios('SecuritySummary', SecuritySummary, {
  pageProof: { onOpen: 'account/twofa-turn-on' },
  cases: [],
});
