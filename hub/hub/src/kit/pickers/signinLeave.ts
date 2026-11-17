// A sign-in step left while its job ran (the drawer closed, Back, the Key choice): the step sends
// the job's cancel, and its answer is read here, never dropped. Cancelled, or a job whose end says it saved nothing or
// signed in, leaves nothing to say: a stored sign-in shows on the next read of the provider. Neither known (the cancel's
// answer lost and the job's end unreadable, or the job still open after it) leaves the C9 unknown toast, whose Check
// again only reads the job's end (never a start or a second cancel) and closes once that end is known. It all belongs
// to the scope the step ran in (account, realm, computer): once that ends nothing shows, and an open toast closes.
// Kit-internal (OpenRouterSetup, ChatGptSetup); the AI page's own ChatGPT step keeps its copy in GptStep.
import { providers } from '@core';
import formStrings from '../forms/forms.strings.en.json';
import { closeToast, showToast } from '../states/Toast';
import { makeT, type Translate } from '../strings';
import strings from './ProviderSetup.strings.en.json';

type Cancel = () => Promise<{ state: 'cancelled' | 'complete' | 'not_confirmed' | 'stale' }>;
type End = () => Promise<{ state: 'complete' | 'signed_out' | 'pending' | 'not_confirmed' | 'stale' }>;

// Built on use, not at load: kit modules do nothing when imported (kit/kitpure.conformance.test.ts).
const t: Translate<typeof strings> = (key, vars) => makeT(strings)(key, vars);
const tf: Translate<typeof formStrings> = (key, vars) => makeT(formStrings)(key, vars);

/** Sends the cancel of the job a step left (`provider`: the sign-in's name in the toast) and says what it cannot prove. */
export async function leaveSignIn(sc: providers.StepScope, provider: string, cancel: Cancel, end: End): Promise<void> {
  const r = await cancel();
  if (r.state !== 'not_confirmed' || !providers.stepScopeLive(sc)) return;
  const e = await end();
  if ((e.state !== 'pending' && e.state !== 'not_confirmed') || !providers.stepScopeLive(sc)) return;
  let off = () => {};
  const id = showToast({
    tone: 'unknown',
    title: t('left.title', { provider }),
    body: t('left.body'),
    action: {
      label: tf('outcome.check'),
      // Known (complete or ended): the toast closes. Unreadable: "couldn't check". Still open: as it was.
      onAction: async () => {
        const x = await end();
        if (!providers.stepScopeLive(sc) || x.state === 'stale') return undefined;
        if (x.state === 'complete' || x.state === 'signed_out') {
          off();
          return true;
        }
        return x.state === 'pending' ? undefined : false;
      },
    },
  });
  off = providers.watchStepScope(sc, () => closeToast(id));
}
