// Behaviour contract of the custom code form (web and terminal). Mounted alone it cannot render: its check reads core's
// session (useCheck), so a case here would prove nothing. Its callbacks are proved on the page instead: create and the
// note after it by the shot referrals/create-pending (fill New code, press Create, wait for the pending note), and the
// check's "can't make codes now" (onGone) by the shot referrals/check-gone. The referrals page tests pin both too.
import { scenarios } from '../../../kit/scenario-types';
import { CodeForm } from './CodeForm';

export default scenarios('CodeForm', CodeForm, {
  pageProof: { create: 'referrals/create-pending', onNote: 'referrals/create-pending', onGone: 'referrals/check-gone' },
  cases: [],
});
