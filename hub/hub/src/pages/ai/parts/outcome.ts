// A flow's result as the kit's OutcomeLike (what a banner or a form footer shows). Words come from
// words.ts; an unconfirmed result is `pending` ("may have gone through"), never a failure.
import type { OutcomeLike } from '@kit';
import { errorText } from '../words';
import { t } from '../logic';
import type { Outcome } from '../types';

export type Ui = OutcomeLike & { message?: string };

export function pendingUi(): Ui {
  return { kind: 'pending', message: t('err.notConfirmed') };
}

export function failedUi(err: Outcome, o: { provider?: string; computer?: string } = {}): Ui {
  const e = errorText(err, { write: true, ...o });
  return { kind: err.kind === 'pending' || err.code === 'READ_BACK_FIRST' ? 'pending' : err.kind === 'not_sent' ? 'not_sent' : 'failed', code: err.code, message: e.text };
}
