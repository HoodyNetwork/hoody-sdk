// "Waiting for you": one approval or question from the Bot: at the end of the Activity thread, directly above the chat box;
// pinned between the header and the tabs on the other tabs (and on the Board tile). The host's alert hint is its last line. It is the kit GateCard through the Bots adapter (model-adapters.ts gateViewOf, gateShowOf): Allow once [Y] and
// Deny [N] with Add a reason, or the question's answer; never a session choice, since a decision covers one call
// (remember: false). A decision is sent once; a lost answer is the card's "may have gone through" with Check again,
// which only reads back, never a second send (C9). The card never takes focus by itself: the page owns that rule.
import { DecidedLine, GateCard as KitGateCard, OutcomeBanner, useStrings, type GateChoice } from '@kit';
import { forwardRef, useState, type ReactNode } from 'react';
import type { BotView, Change } from '../data';
import { decisionWasOurs, gateStateOf } from '../logic';
import { gateShowOf, gateViewOf, type GateSent } from '../model-adapters';
import strings from '../strings.en.json';
import s from './pane.module.css';

// The card's first enabled decision control outside a code block: Allow once, or the answer. Never a link: a link in the
// delegate's summary comes before the buttons, and Y or N pressed there would still decide. With every control waiting on a
// decision on its way, the card itself. Scrolled into view: the card may sit off screen.
const CONTROLS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])';
export function focusGate(wrap: HTMLElement): void {
  const card = wrap.querySelector<HTMLElement>('[data-ask-gate]') ?? wrap;
  const target = Array.from(card.querySelectorAll<HTMLElement>(CONTROLS)).find((el) => !el.closest('figure'));
  if (target) {
    target.focus({ preventScroll: false });
    return;
  }
  if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
  card.focus({ preventScroll: false });
}

interface Props {
  bot: BotView;
  change: Change<{ replayed: boolean }, { approve: boolean; reason?: string; answer?: string }>;
  /** The decision sent, held by the host when the card can remount (the Bot page moves it between tabs); else the card's own. */
  sent?: GateSent | null;
  onSent?: (v: GateSent) => void;
  /** The alert hint (NotifyHint): the card's last line. */
  hint?: ReactNode;
}

export const GateCard = forwardRef<HTMLDivElement, Props>(function GateCard({ bot, change, sent: heldSent, onSent, hint }, ref) {
  const t = useStrings(strings);
  const gate = bot.gate;
  const [ownSent, setOwnSent] = useState<GateSent | null>(null);
  const sent = onSent ? (heldSent ?? null) : ownSent;
  const setSent = onSent ?? setOwnSent;
  if (!gate) return null;
  const show = gateShowOf(gateStateOf(change.outcome, change.code, sent !== null), sent, decisionWasOurs(change.details, change.idem));
  const busy = show.k !== 'open' || show.sending || change.running;
  const send = (what: GateSent, v: { approve: boolean; reason?: string; answer?: string }) => {
    if (busy) return;
    setSent(what);
    void change.run(v);
  };
  const onDecide = (c: GateChoice, reason?: string) => {
    if (c === 'deny') send('deny', reason ? { approve: false, reason } : { approve: false });
    else send('once', { approve: true });
  };
  const onAnswer = (a: string | Record<string, string>) => {
    if (typeof a === 'string') send('answer', { approve: true, answer: a });
  };
  if (show.k === 'decided') {
    return (
      <div ref={ref} className={s.gate} data-gate-wrap="">
        <DecidedLine d={{ kind: show.kind, tool: '', text: '' }} />
        {hint}
      </div>
    );
  }
  const unknown = show.k === 'unknown';
  return (
    <div ref={ref} className={s.gate} data-gate-wrap="">
      <KitGateCard
        gate={gateViewOf(gate)}
        pending={!unknown && busy}
        unknown={unknown}
        sent={sent === 'answer' || sent === null ? undefined : sent}
        agentUrl=""
        typing
        onDecide={onDecide}
        onAnswer={onAnswer}
        onCheck={() => void change.readBack()}
        onDismiss={() => change.dismiss()}
      />
      {gate.type === 'confirm' && !unknown && <p className={s.help}>{t('gate.why')}</p>}
      {show.k === 'open' && show.failed && <OutcomeBanner kind="failed" title={t('gate.failed')} />}
      {hint}
    </div>
  );
});
