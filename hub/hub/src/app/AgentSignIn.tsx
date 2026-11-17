// The agent sign-in where the person is: one
// hook and one box for every place that needs a computer's agent signed in (New script, the Ask drawer, Schedules). The sign-in
// itself is core's (signInAgent: one sign-in, proven by the agent's own status); the Ask dock calls the same core path.
// Two shapes: 'writer' (a box with a checkbox, on by default and never remembered, says the place's own press signs the agent in
// first; the ask goes only once the page shows the assistant ready) and 'own' (the box has its own Sign the agent in button; the
// press is the consent, and nothing else is sent). C9: "signed in" only after a status read says so; "could not" only from a
// refusal; anything else is "may have been signed in", with Check again, which only reads. Never a second sign-in in a view after
// an unknown outcome or a proof; the ask is never sent before the proof, and never twice.
import { Band, Button, Checkbox, Link, useStrings, type Translate } from '@kit';
export { useAgentSignIn } from './AgentSignIn.pure';
export type { SignInComp, Reread, SignInShown, AgentSignInState } from './AgentSignIn.pure';
import type { SignInComp, SignInShown, AgentSignInState } from './AgentSignIn.pure';
import { agentBaseFor, useCore } from '@core';
import { useId, type ReactNode } from 'react';
import strings from './agentSignIn.strings.en.json';
import s from './AgentSignIn.module.css';

type T = Translate<typeof strings>;

function failWords(t: T, r: Extract<SignInShown, { kind: 'refused' }>, computer: string, own: boolean): string {
  const why = { key: 'signin.why.key', disabled: 'signin.why.disabled', notThisBox: 'signin.why.notThisBox', computerLogin: 'signin.why.computerLogin', refused: 'signin.why.refused', cancelled: '', busy: '' }[r.reason];
  return `${t(own ? 'signin.notDone.own' : 'signin.notDone')} ${t(why as never, { computer })}`;
}

/** The box, the note for why the agent cannot work for the place, and what a press or Check again found. Its own row.
 *  `place` 'writer': `button` is the label of the place's own press (Write it for me, Send) and `myself` says the place has Write it
 *  myself; 'own': the box's own Sign the agent in button, and `need` the place's own sentence for a signed-out agent.
 *  `pageNote`: the place's own note for any other reason (shown when no account, identity or shared-access note does).
 *  `blocked`: why the place's own press cannot go now, in the place's words (an empty idea, an ask under way); empty when it can.
 *  Try again is that press again, so it cannot go either, and the reason shows under it, tied to it (aria-describedby). */
export function AgentSignIn({ comp, state, place = 'writer', button = '', myself = false, need, pageNote, blocked = '' }: {
  comp: SignInComp | undefined; state: AgentSignInState; place?: 'writer' | 'own'; button?: string; myself?: boolean; need?: string; pageNote?: ReactNode; blocked?: string;
}) {
  const t = useStrings(strings);
  const { target } = useCore();
  const whyId = useId();
  if (!comp) return null;
  const own = place === 'own';
  const computer = comp.name;
  const agentUrl = target && target.container?.id === comp.id ? agentBaseFor(target.project, target.container) : '';
  const openAgent = agentUrl ? <Link href={agentUrl} target="_blank" rel="noopener noreferrer" iconEnd="external">{t('signin.openAgent')}</Link> : null;
  const checkBtn = <Button size="sm" variant="ghost" busy={state.busy} onPress={() => void state.check()}>{t('signin.check')}</Button>;
  // Try again goes only when the press could: the hook's own checks (ticked, a realm, nothing holding it), and the place's.
  const retryBtn = <Button size="sm" variant="ghost" isDisabled={!state.canPress || state.busy || blocked !== ''} aria-describedby={blocked ? whyId : undefined} onPress={() => void state.press()}>{t('signin.retry')}</Button>;
  const why = comp.agent.writer ? undefined : comp.agent.writerWhy;
  // The page's newer account or identity note wins over an earlier proof's or unknown outcome's words (they no longer say what
  // stops the agent); the hook's hold still keeps any new sign-in out.
  const pageBlocks = why === 'account' || why === 'identity';
  const r = pageBlocks && (state.shown?.kind === 'signedIn' || state.shown?.kind === 'unknown') ? null : state.shown;

  let result: ReactNode = null;
  if (state.pressing && !r) result = <p className={s.hint} role="status">{t('signin.busy')}</p>; // reason: one-line busy hint while the press runs
  // The box's own button: "signed in" only while the page's own read shows it (any later read that does not takes it back);
  // until then the agent's word is reported as such, with Check again.
  else if (r?.kind === 'signedIn' && own && (r.continue || !comp.agent.writer)) result = <Band tone="neutral" actions={checkBtn}>{t('signin.unconfirmed.own', { computer })}</Band>;
  else if (r?.kind === 'signedIn') result = <Band tone="neutral" icon="check-circle">{t(!own && r.continue ? 'signin.doneContinue' : 'signin.done', { computer, button })}</Band>;
  else if (r?.kind === 'unknown') result = <Band tone="warn" actions={checkBtn} /* noDetails: signInAgent resolves a fixed result, never a rejection (the sign-in route is secret: no detail to show) */>{t(own ? 'signin.unknown.own' : 'signin.unknown')}</Band>;
  else if (r?.kind === 'refused' && r.reason === 'busy') result = <Band tone="warn" /* noDetails: signInAgent resolves a fixed result, never a rejection (nothing was asked or sent) */ actions={retryBtn}>{t('signin.stillFinishing')}</Band>;
  else if (r?.kind === 'refused' && r.reason === 'cancelled') result = <p className={s.hint} role="status">{t('signin.cancelled')}</p>; // reason: one-line quiet hint, nothing changed
  else if (r?.kind === 'refused') result = <Band tone="danger" /* noDetails: signInAgent resolves a fixed result, never a rejection (the sign-in route is secret: no detail to show) */ actions={<>{r.reason === 'key' || r.reason === 'refused' ? retryBtn : null}{openAgent}</>}>{failWords(t, r, computer, own)}</Band>;
  else if (r?.kind === 'notAllowed') result = <Band tone="warn" /* noDetails: signInAgent resolves a fixed result, never a rejection (the sign-in route is secret: no detail to show) */ actions={r.reason === 'shared' ? undefined : openAgent}>{t(r.reason === 'shared' ? (!own && myself ? 'signin.sharedMyself' : 'signin.shared') : r.reason === 'admin' ? 'signin.admin' : own ? 'signin.otherAccount' : 'signin.otherAccount.writer', { computer })}</Band>;

  // Try again shows in the result (the bands above): its reason, when the place blocks it, goes under it.
  const retryShown = r?.kind === 'refused' && (r.reason === 'busy' || r.reason === 'key' || r.reason === 'refused');
  const retryWhy = retryShown && blocked ? <p id={whyId} className={s.hint}>{blocked}</p> : null; // reason: one-line hint, why Try again cannot go yet

  // What the page shows now. The account and identity notes always show (above); a refusal or not-allowed result shows beside them.
  let note: ReactNode = null;
  if (why === 'account') note = <Band tone="warn" actions={openAgent} /* noDetails: a fact the page's status read shows, not a rejection */>{t(own ? 'signin.otherAccount' : 'signin.otherAccount.writer', { computer })}</Band>;
  else if (why === 'identity') note = <Band tone="neutral" actions={checkBtn}>{t('signin.identity', { computer })}</Band>;
  else if (why === 'login' && !state.offered) note = <p className={s.hint}>{t(!own && myself ? 'signin.sharedMyself' : 'signin.shared')}</p>;
  else if (pageNote) note = pageNote;
  // Signed out with no realm chosen where the place needs one: the box stays, and this says why the press cannot go yet.
  else if (state.box && comp.agentRealm === null) note = <p className={s.hint}>{t(own ? 'signin.pickRealm.own' : 'signin.pickRealm')}</p>;

  // The box asks for consent to a sign-in: not while a result says it may have happened, is not allowed, or is proven.
  const showBox = !!state.box && r?.kind !== 'unknown' && r?.kind !== 'notAllowed' && r?.kind !== 'signedIn';
  if (!showBox && !note && !result) return null;
  return (
    <div className={s.signIn} data-testid="agent-signin">
      {showBox && own ? (
        <div className={s.signInBox}>
          <p className={s.signInText}>{need ?? t('signin.need.own', { computer })}</p>
          <Button size="sm" busy={state.pressing} isDisabled={!state.canPress || state.busy} onPress={() => void state.press()}>{t('signin.press')}</Button>
          <p className={s.hint}>{t('signin.hint.own')}</p>
        </div>
      ) : showBox ? (
        <div className={s.signInBox}>
          <p className={s.signInText}>{t(state.box === 'renew' ? 'signin.needAgain' : 'signin.need', { computer })}</p>
          <Checkbox isSelected={state.checked} onChange={state.setChecked} isDisabled={state.busy} label={t(state.box === 'renew' ? 'signin.tickAgain' : 'signin.tick')} description={t('signin.hint', { button })} />
          {!state.checked ? <p className={s.hint} role="status">{t(myself ? 'signin.offMyself' : 'signin.off')}{openAgent ? <> {openAgent}</> : null}</p> : null} {/* reason: one-line hint when the box is unticked */}
        </div>
      ) : null}
      {note}
      {result}
      {retryWhy}
    </div>
  );
}
