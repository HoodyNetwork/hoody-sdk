// The script's notice when the agent's list of idea-made scripts is not read and Edit, Delete and links are held off for it (fail
// closed): what stops the read and what the person can do. None of these clears by itself, so each line has its action:
//   - the agent is signed out, or its login was rejected: Sign the agent in, through the shared sign-in (app/AgentSignIn.tsx
//     useAgentSignIn: one sign-in path through core for every place), then this page's status and ownership reads again;
//   - the agent is signed in and still could not open the list, or its sign-in is not known: the true line, and Check again.
// The cause is the classified one (readOnly.ts ownerHeld): an agent that names its sign-in as the cause gets the sign-in even
// while the page's own status read still shows it signed in.
// One line in the notice, as its slot takes: the shared sign-in's outcomes are said here in a sentence each. C9 is the hook's: a
// sign-in that may have gone through is never called failed and never sent again (only Check again, which reads).
// Nothing here polls: a read goes only on a press.
import { Band, Button, TextButton, useStrings } from '@kit';
import { agentLoginOf, capture, refreshFresh, sourceReads } from '@core';
import { useAgentSignIn, type SignInComp } from '@app/AgentSignIn';
import { useMemo } from 'react';
import strings from '../strings.en.json';
import type { CompScripts } from '../types';
import { ownerHeld } from './readOnly';

/** Mounted for as long as the script's ownership is not known, whatever the ownership read does meanwhile: Check again takes that
 *  read through "reading", and a sign-in whose outcome is not known must keep its hold. Draws nothing while there is nothing to say
 *  (the list is read, still being read, or failed some other way: the tabs say that themselves). `old`: the computer runs an older
 *  Scripts program, which stops changes whoever owns the script; the sign-in still shows (links wait for it), and where there is
 *  none to offer the older-program line shows. */
export function OwnerHeld({ comp, onChanged, old = false }: { comp: CompScripts; onChanged: () => unknown; old?: boolean }) {
  const t = useStrings(strings);
  const held = ownerHeld(comp);
  const named = held === 'signedOut' || held === 'rejected';
  const renew = held === 'rejected' || (held !== 'signedOut' && comp.agent.signIn === 'renew');
  const c = useMemo<SignInComp>(() => ({ id: comp.id, name: comp.name, agent: { writer: false, writerWhy: 'login', signIn: renew ? 'renew' : 'offer' } }), [comp.id, comp.name, renew]);
  // After the proof: this computer's status and its ownership read, read again now; then the rest of the page (its own Reload).
  const state = useAgentSignIn(c, null, async (x) => {
    const [f] = await Promise.all([
      refreshFresh(sourceReads('scripts', 'authStatus', { computer: x.id })),
      refreshFresh(sourceReads('scripts', 'instances', { computer: x.id })),
    ]);
    void onChanged();
    return f.state === 'fresh' && f.answers.length > 0 && f.answers.every((a) => agentLoginOf(a.data, capture().account) === 'ready');
  });
  const rest = old ? <Band size="table">{t('notice.old')}</Band> : null;
  if (comp.instances !== null) return rest;
  const computer = comp.name;
  const error = comp.ownerRead?.k === 'failed' ? comp.ownerRead.error : undefined;
  const again = <TextButton onPress={() => void onChanged()}>{t('share.check')}</TextButton>;
  const r = state.shown;

  // Check again after a sign-in: the agent's status, then this page's reads. Never sends.
  const recheck = <TextButton isDisabled={state.busy} onPress={() => void state.check().then(() => onChanged())}>{t('share.check')}</TextButton>;

  if (comp.agent.writerWhy === 'login' || named || r?.kind === 'unknown') {
    // The sign-in may have gone through: only a read follows (the agent's status, then this page's reads).
    if (r?.kind === 'unknown') return <Band size="table" tone="warn" actions={recheck} /* noDetails: the shared sign-in resolves a fixed result, never a rejection */>{t('owner.signInUnknown', { computer })}</Band>;
    // The agent's status said signed in; this page's own reads do not show it (it would not be here): said as the agent's word.
    if (r?.kind === 'signedIn') return <Band size="table" tone="neutral" actions={recheck}>{t('owner.signedIn', { computer })}</Band>;
    if (state.pressing) return <Band size="table" tone="neutral">{t('owner.signingIn', { computer })}</Band>;
    // Not allowed is no refusal of a sign-in: each reason has its own fact (another account may hold the agent).
    // Its Check again goes through the sign-in's own check: only that takes the line back once the agent is signed out there.
    if (r?.kind === 'notAllowed') return <Band size="table" tone="warn" actions={recheck} /* noDetails: the shared sign-in resolves a fixed result, never a rejection */>{r.reason === 'otherAccount' ? t('owner.otherAccount', { computer }) : r.reason === 'admin' ? t('owner.adminAccount', { computer }) : t('owner.signedOutShared', { computer })}</Band>;
    // A refusal the person can answer (a wrong code, the agent said no): the same press again, as the shared sign-in allows.
    if (r?.kind === 'refused' && (r.reason === 'key' || r.reason === 'refused')) return <Band size="table" tone="warn" actions={<Button size="sm" isDisabled={!state.canPress || state.busy} onPress={() => void state.press()}>{t('owner.tryAgain')}</Button>} /* noDetails: the shared sign-in resolves a fixed result, never a rejection */>{t('owner.signInRetry', { computer })}</Band>;
    // Any other refusal changed nothing (cancelling the code prompt and a sign-in still finishing elsewhere leave the offer as it was).
    if (r?.kind === 'refused' && r.reason !== 'cancelled' && r.reason !== 'busy') return <Band size="table" tone="warn" actions={again} /* noDetails: the shared sign-in resolves a fixed result, never a rejection */>{t('owner.signInRefused', { computer })}</Band>;
    // Shared access never signs an agent in: the line says who can.
    if (!state.offered) return <Band size="table" tone="warn" error={error} actions={again}>{t('owner.signedOutShared', { computer })}</Band>;
    return (
      <Band size="table" tone="warn" error={error} actions={<Button size="sm" busy={state.pressing} isDisabled={!state.canPress || state.busy} onPress={() => void state.press()}>{t('owner.signIn')}</Button>}>
        {renew ? t('owner.rejected', { computer }) : t('owner.signedOut', { computer })}
      </Band>
    );
  }
  if (old || (held !== 'noHost' && held !== 'notOpen')) return rest;
  return <Band size="table" tone="warn" error={error} actions={again}>{held === 'noHost' ? t('owner.noHost', { computer }) : t('owner.notOpen', { computer })}</Band>;
}
