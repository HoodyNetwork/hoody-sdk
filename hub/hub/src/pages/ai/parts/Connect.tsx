// The connect drawer (provider tiles, then the step for that kind), the endpoint edit drawer and the
// disconnect dialog. Each step keeps its own secrets and C9 state; closing the drawer drops them all.
// A model chooser's trip adds a band with Go back and records what happened here; the record
// itself is core/handoff.ts (never a key or code: only the provider id and how it ended).
// Model picker: the provider choice is the shared directory with verb connect over the
// page's own catalogue bundle (evidenceOfAi: no second read). Connected providers stay listed, to add another method
// or replace a key; Hoody AI is included and has nothing to set up, so its card (Included, View) goes to its account
// row. A failed refresh keeps the bundle's last answer and the directory says how old it is. Other ways:
// "Your own endpoint" opens the endpoint form here. Claude Code is Anthropic's second way: where the computer's agent
// lists Claude Code, Anthropic offers "Use your Claude plan" beside the API key, and that way draws the Claude Code
// section's own rows here (ClaudePlanStep: the same state, setup step and flows), so the drawer stays open. Only when the
// catalogue lists no Anthropic does Claude Code stay under Other ways and go to its section.
// A provider with a sign-in (OpenAI's ChatGPT device code, OpenRouter's own) offers the way to connect as the kit RadioGroup
// ProviderSetup draws, above the step it chose; for a sign-in nothing is picked at first, so none starts before the person
// chooses one (Anthropic opens on the Claude plan, whose step only shows state). Switching ways leaves the step as Back did: a sign-in is cancelled, a key not sent is dropped.
import type { HandoffResult, providers } from '@core';
import { Band, Button, ConfirmDialog, Drawer, EmptyState, Link, ProviderDirectory, RadioGroup, Skeleton, SubSection, TextButton, useStrings } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GONE } from '../api';
import { checkDisconnect, disconnectAtOf, sendDisconnect, stopDisconnect, useHeldDisconnect, useSettleUnlisted } from '../disconnectHold';
import { useSettleGoneEdits } from '../endpointEditHold';
import { checkKeySave, stopKeySave, useHeldKeySave } from '../keySaveHold';
import { CAPS, cap, HOODY, impactOf, names, prefixOf, tk, usedBy, disconnectWhat, type Account } from '../logic';
import { shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import { ClaudePlanStep } from './Claude';
import { useAi } from './ctx';
import { EndpointCreate, EndpointEdit } from './EndpointStep';
import { evidenceOfAi } from './model';
import { sectionEl } from './sectionEl';
import { GptStep } from './GptStep';
import { KeyStep, type Saved } from './KeyStep';
import { OpenRouterStep } from './OpenRouterStep';
import { failedUi, pendingUi, type Ui } from './outcome';
import s from './parts.module.css';

/** No computer or no catalogue: the directory says providers can't be listed, and keeps its Other ways. */
const UNREAD: providers.Evidence = { seq: 0, scope: { account: '', realm: '', computer: '', gen: 0, boot: '' }, at: 0, catalogue: { state: 'failed', err: GONE }, claude: null };

/** Anthropic's own page about Claude Code in other products: linked, never paraphrased. */
const CLAUDE_TERMS = 'https://code.claude.com/docs/en/legal-and-compliance';
const ANTHROPIC = 'anthropic';

type Step =
  | { s: 'pick' }
  | { s: 'choice'; id: string; label: string }
  | { s: 'key'; id: string; label: string; endpoint?: boolean; replace?: boolean }
  | { s: 'gpt' }
  | { s: 'or' }
  | { s: 'plan' }
  | { s: 'endpoint' }
  | { s: 'done'; id: string; label: string; how: Saved['how'] | 'signin' | 'signinOr' };

export interface ConnectTarget {
  providerId?: string;
  replace?: Account;
  /** Open at the endpoint form (a model chooser's "Your own endpoint"). */
  endpoint?: boolean;
}

/** A model chooser's trip to this page, as the drawer and the page band use it. */
export interface Trip {
  /** Public words naming where the person came from ("New Bot"). */
  origin: string;
  /** The computer's name. */
  computer: string;
  back: () => void;
  result: (r: HandoffResult) => void;
}

/** "Setting up for {origin} on {computer}." with Go back. */
export function TripBand({ trip }: { trip: Trip }) {
  const t = useStrings(strings);
  return (
    <Band tone="neutral" actions={<Button variant="secondary" size="sm" onPress={trip.back}>{t('ho.back')}</Button>}>
      {t('ho.band', { origin: trip.origin, computer: trip.computer })}
    </Band>
  );
}

export function ConnectDrawer({ target, onClose, trip = null }: { target: ConnectTarget | null; onClose: () => void; trip?: Trip | null }) {
  const t = useStrings(strings);
  const { m, goto, reload } = useAi();
  const [step, setStep] = useState<Step>({ s: 'pick' });
  // Claude Code jumps to its section: focus goes to that section's heading on close, not back to the header's Connect
  // (whose return would scroll the page back to the top, or leave focus above the view).
  const jumpTo = useRef<string | null>(null);
  const device = cap(m.caps, CAPS.device);
  // The catalogue's own row for an id; never an inherited property (an id such as `constructor` is not a row).
  const rowOf = (id: string) => (m.cat && Object.hasOwn(m.cat.byId, id) ? m.cat.byId[id] : undefined);
  const labelOf = (id: string) => rowOf(id)?.label ?? tk('name.provider');
  // A key goes the built-in way only for a provider the catalogue lists as built-in. One it does not list (no
  // catalogue, a failed read, a deep link to an id it lacks) takes the endpoint way: the revision is read on open and
  // sent with the key (every provider answers one), so a custom endpoint's key never goes without it.
  const strict = (id: string) => {
    const row = rowOf(id);
    return !row || row.custom === true;
  };

  useEffect(() => {
    if (!target) return;
    jumpTo.current = null;
    if (target.replace) setStep({ s: 'key', id: target.replace.id, label: target.replace.label, endpoint: target.replace.custom || strict(target.replace.id), replace: true });
    else if (target.providerId) setStep(start(target.providerId));
    else if (target.endpoint) setStep({ s: 'endpoint' });
    else setStep({ s: 'pick' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  // "Use your Claude plan" is Anthropic's second way wherever the catalogue lists Anthropic and the computer's agent does
  // answers for Claude Code there (a read that failed or has not come still offers it: the step shows what the read
  // says). Without a realm nothing is read (no Claude Code state at all): Anthropic is the key alone.
  const planOffered = !!rowOf(ANTHROPIC) && !!m.claude && m.claude.state !== 'unavailable';
  // OpenRouter's sign-in is offered only when the computer's agent lists it for that provider.
  const hasChoice = (id: string) =>
    (id === 'openai' && device) || (id === 'openrouter' && m.cat?.byId.openrouter?.status?.methods?.includes('signin') === true) || (id === ANTHROPIC && planOffered);
  function start(id: string): Step {
    // Anthropic opens on the Claude plan: that step only shows Claude Code's state, and starts nothing by itself.
    if (id === ANTHROPIC && planOffered) return { s: 'plan' };
    if (hasChoice(id)) return { s: 'choice', id, label: labelOf(id) };
    return { s: 'key', id, label: labelOf(id), endpoint: strict(id) };
  }

  // What happened here goes on the trip: a created endpoint, then a saved key or a completed sign-in.
  const done = (id: string, label: string, how: Extract<Step, { s: 'done' }>['how']) => {
    trip?.result({ status: 'done', provider: id });
    setStep({ s: 'done', id, label, how });
  };

  // The directory's evidence: only while the provider choice shows (a step reads nothing of it).
  const evidence = useMemo(() => (step.s === 'pick' ? evidenceOfAi(m) : null), [m, step.s]);
  const setUp = (id: string) => {
    // Hoody AI is included: nothing to connect. Its account row says how it is used.
    if (id === HOODY) {
      jumpTo.current = 'accounts';
      onClose();
      goto('accounts');
      return;
    }
    setStep(start(id));
  };

  const back = step.s === 'pick' || (step.s === 'key' && step.replace) || step.s === 'done' ? undefined : () => setStep({ s: 'pick' });
  // The way to connect, for a provider that has a choice: shown above the step (or alone, before a choice), never on a
  // replace-key step. `undefined` until the person picks one.
  const ways: { id: string; label: string; how: 'sign' | 'key' | undefined } | null =
    step.s === 'choice' ? { id: step.id, label: step.label, how: undefined }
      : step.s === 'gpt' ? { id: 'openai', label: labelOf('openai'), how: 'sign' }
        : step.s === 'or' ? { id: 'openrouter', label: labelOf('openrouter'), how: 'sign' }
          : step.s === 'plan' ? { id: ANTHROPIC, label: labelOf(ANTHROPIC), how: 'sign' }
          : step.s === 'key' && !step.replace && hasChoice(step.id) ? { id: step.id, label: step.label, how: 'key' } : null;
  const forId = ways ? ways.id : null;
  const title = step.s === 'key' && step.replace ? t('connect.replaceTitle', { provider: step.label }) : forId ? t('connect.titleFor', { provider: labelOf(forId) }) : t('connect.title');

  const here = m.computer?.name || t('connect.planHere');
  const howTitle = ways ? (ways.id === ANTHROPIC ? t('connect.planHow', { computer: here }) : t('connect.how', { provider: ways.label })) : '';

  // The step itself; on a trip the band goes above it (not on the done step, whose primary is Go back).
  const inner = (
    <>
      {step.s === 'pick' &&
        (m.loads.catalogue === 'loading' && m.target ? (
          <Skeleton variant="rows" rows={4} />
        ) : (
          <ProviderDirectory
            idBase="connect-dir"
            evidence={evidence ?? UNREAD}
            purpose="bot"
            verb="connect"
            offer={{ endpoint: true, claude: !planOffered }}
            providerWord={tk('name.provider')}
            onSetup={(id) => setUp(id)}
            // A failed refresh keeps the last answer: the directory says how old it is, Try again reads the page again.
            {...(m.bundle.refreshFailed ? { stale: { onRetry: reload } } : {})}
            onOtherWay={(way) => {
              if (way === 'endpoint') return setStep({ s: 'endpoint' });
              jumpTo.current = 'claude';
              onClose();
              goto('claude');
            }}
          />
        ))}
      {ways && (
        // The step's one question is its heading; the ways are the kit's choice cards under it, then one quiet help link;
        // the chosen way's step follows the block.
        <SubSection title={howTitle}>
          <RadioGroup<'sign' | 'key'>
            variant="cards"
            aria-label={howTitle}
            value={ways.how}
            onChange={(how) => {
              if (how === ways.how) return;
              if (how === 'key') setStep({ s: 'key', id: ways.id, label: ways.label, endpoint: strict(ways.id) });
              else setStep({ s: ways.id === ANTHROPIC ? 'plan' : ways.id === 'openrouter' ? 'or' : 'gpt' });
            }}
            options={[
              ways.id === ANTHROPIC
                ? { value: 'sign' as const, label: t('connect.plan'), description: t('connect.planNote', { computer: here }) }
                : ways.id === 'openrouter'
                  ? { value: 'sign' as const, label: t('connect.openrouter'), description: t('connect.openrouterNote') }
                  : { value: 'sign' as const, label: t('connect.chatgpt'), description: t('connect.chatgptNote') },
              { value: 'key' as const, label: t('connect.apikey'), description: t('connect.apikeyNote') },
            ]}
          />
          {ways.id === ANTHROPIC && (
            <Link href={CLAUDE_TERMS} variant="nav">
              {t('connect.planTerms')}
            </Link>
          )}
        </SubSection>
      )}
      {step.s === 'plan' && <ClaudePlanStep />}
      {step.s === 'key' && <KeyStep key={step.id} providerId={step.id} providerLabel={step.label} endpoint={step.endpoint === true} onSaved={(r) => done(step.id, step.label, r.how)} />}
      {step.s === 'gpt' && <GptStep onBack={() => setStep(start('openai'))} onSigned={() => done('openai', labelOf('openai'), 'signin')} />}
      {step.s === 'or' && <OpenRouterStep onBack={() => setStep(start('openrouter'))} onSigned={() => done('openrouter', labelOf('openrouter'), 'signinOr')} />}
      {step.s === 'endpoint' && (
        <EndpointCreate
          onCreated={(id, label) => {
            trip?.result({ status: 'created', provider: id });
            setStep({ s: 'key', id, label, endpoint: true });
          }}
        />
      )}
      {step.s === 'done' && (
        <EmptyState
          size="sm"
          icon="check-circle"
          // A key that was never checked is saved, not connected.
          title={t(step.how === 'inconclusive' || step.how === 'untested' ? 'done.titleUnchecked' : 'done.title', { provider: step.label })}
          body={t(`done.${step.how}` as never)}
          action={
            trip ? (
              <Button variant="primary" onPress={trip.back}>
                {t('ho.backTo', { origin: trip.origin })}
              </Button>
            ) : (
              <Button variant="primary" onPress={() => { onClose(); goto('default'); }}>
                {t('done.makeDefault')}
              </Button>
            )
          }
          secondary={
            trip ? (
              <Button variant="secondary" onPress={() => { onClose(); goto('default'); }}>
                {t('done.makeDefault')}
              </Button>
            ) : (
              <Button variant="ghost" onPress={onClose}>{t('done.close')}</Button>
            )
          }
        />
      )}
    </>
  );
  // The way to connect sits above its step, with the stack's gap between them.
  const body = ways ? <div className={s.stack}>{inner}</div> : inner;

  return (
    <Drawer resizeKey="ai-connect"
      isOpen={target !== null}
      onOpenChange={(o) => !o && onClose()}
      closeFocus={() => (jumpTo.current ? sectionEl(jumpTo.current, 'h2[tabindex]') : null)}
      title={title}
      size="md"
      onBack={back}
      backLabel={t('connect.back')}
      subtitle={step.s === 'pick' ? t('connect.sub') : undefined}
      // The plan step sends nothing of its own, so it has no form footer: Back and Close sit where the other steps' do.
      {...(step.s === 'plan' && back ? { secondary: <Button chip={false} variant="secondary" onPress={back}>{t('connect.back')}</Button>, cancel: t('connect.planClose') } : {})}
    >
      {trip && step.s !== 'done' ? (
        <div className={s.stack}>
          <TripBand trip={trip} />
          {body}
        </div>
      ) : (
        body
      )}
    </Drawer>
  );
}

export function EditDrawer({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const t = useStrings(strings);
  return (
    <Drawer resizeKey="ai-endpoint-edit" isOpen={account !== null} onOpenChange={(o) => !o && onClose()} title={t('ep.editTitle', { provider: account?.label ?? '' })} size="sm">
      {account && <EndpointEdit providerId={account.id} onSaved={onClose} />}
    </Drawer>
  );
}

export function DisconnectDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const t = useStrings(strings);
  const { m, api, env, reload } = useAi();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ui | undefined>();
  // What the last Check again ('still': a removal read whole and still there, a key save not read back yet; 'unproved': a
  // key save this tab cannot read back) or Stop tracking ('kept') said while the hold stays.
  const [note, setNote] = useState<'still' | 'unproved' | 'kept' | null>(null);
  useEffect(() => {
    setOut(undefined);
    setBusy(false);
    setNote(null);
  }, [account?.id]);
  const a = account;
  // An unknown outcome is core's hold of this computer and provider (disconnectHold.ts), never this dialog's state: opened
  // again for the same account (or after leaving the page, or in another tab) it shows the hold, Confirm stays locked, and
  // Check again reads back what was removed at the press. Every call goes to the computer this render shows (`on`).
  const at = disconnectAtOf(m);
  const on = shownComputer();
  const held = useHeldDisconnect(at, a?.id ?? null, a ? disconnectWhat(a) : null);
  // The page draws this dialog all the time: it is also the reader of holds whose account the list no longer shows, and
  // of held endpoint edits whose endpoint it no longer shows (their form opens only from the endpoint's row).
  // Once per list read (its data time + ids), never per re-render of the model.
  useSettleUnlisted(at, m.accounts, m.bundle?.at ?? null, api);
  useSettleGoneEdits(m.accounts, m.bundle?.at ?? null, api);
  const shown = busy ? null : held;
  // A key save of this provider whose answer is unknown (keySaveHold.ts, on the same credential lock as a key or endpoint
  // removal): a removal sent now could be overtaken by that key landing late, which would leave it stored. Confirm stays
  // locked behind it, with Check again (only the tab that sent the key can read it back) and Stop tracking. A sign-out takes
  // its own lock and waits for no key. A held removal wins the view.
  const saving = useHeldKeySave(at, a && disconnectWhat(a) !== 'signin' ? a.id : null);
  const saveShown = busy || held ? null : saving;
  const cur = shown ?? saveShown;
  // Stop tracking (and its warning) only once no request of it may still be out.
  const stoppable = !!cur && !cur.inFlight;
  // One object per hold shown: the dialog compares outcomes by identity.
  const heldId = cur?.id ?? null;
  const heldUi = useMemo(() => (heldId ? pendingUi() : undefined), [heldId]);
  // A new hold starts with no earlier Check again's words.
  useEffect(() => setNote(null), [heldId]);
  const what = a ? disconnectWhat(a) : 'key';
  const n = a ? usedBy(a, m.defaults, m.bots) : 0;
  const helperHere = !!(a && m.defaults && m.models.find((x) => x.spec === m.defaults?.helper.effective)?.providerId === a.id);
  const imp = m.defaults ? impactOf('both', m.defaults, m.bots) : null;
  // Agents whose own model is on this account (as usedBy counts Bots): one pinned to another provider keeps working.
  const agentsHere = a && m.defaults ? m.defaults.others.filter((o) => prefixOf(o.model) === a.prefix).map((o) => o.agent) : [];
  const finish = () => {
    reload();
    onClose();
  };
  const run = async () => {
    if (!a || held || saving) return;
    setBusy(true);
    setOut(undefined);
    setNote(null);
    const r = at ? await sendDisconnect(api, at, a, on) : ({ state: 'not_held' } as const);
    setBusy(false);
    // Not confirmed, a context that moved on, or already held: the hold shows it (a switch held nothing, sent nothing).
    if (r.state === 'stale' || r.state === 'held' || r.state === 'not_confirmed') return;
    if (r.state === 'removed') return finish();
    setOut(r.state === 'failed' ? failedUi(r.err, { provider: a.label }) : { kind: 'not_sent', message: t('def.notHeld') });
  };
  const check = async (): Promise<boolean> => {
    if (a && saveShown) {
      const r = await checkKeySave(api, env, a.id, saveShown, on);
      setNote(r === 'saved' ? null : r === 'unproved' ? 'unproved' : 'still');
      return r === 'saved';
    }
    if (!a || !shown) return false;
    const r = await checkDisconnect(api, a.id, shown, on);
    if (r === 'removed') {
      finish();
      return true;
    }
    // "Still there" only for a read that showed it; anything else keeps the plain "may have gone through".
    setNote(r === 'present' ? 'still' : null);
    return false;
  };
  const stop = async () => {
    if (saveShown) return setNote((await stopKeySave(saveShown)) ? null : 'kept');
    if (!shown) return;
    setNote((await stopDisconnect(shown)) ? null : 'kept');
  };
  return (
    <ConfirmDialog
      isOpen={a !== null}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={t(`dis.title.${what}` as never, { provider: a?.label ?? '' })}
      confirmLabel={t(`dis.confirm.${what}` as never)}
      tone="danger"
      onConfirm={() => void run()}
      busy={busy}
      outcome={heldUi ?? out}
      onCheck={check}
      // The warned Stop tracking lives on the held outcome (after Check again): its warning is the outcome's line and
      // describes the button; what the last Check again or Stop tracking found is the line after it.
      outcomeDetail={stoppable ? t('dis.stopWarn') : undefined}
      outcomeActions={stoppable ? ({ detailId }) => <TextButton aria-describedby={detailId} onPress={() => void stop()}>{t('dis.stop')}</TextButton> : undefined}
      outcomeNote={stoppable && (note === 'still' || note === 'kept') ? t(note === 'kept' ? 'dis.stopKept' : saveShown ? 'key.saveStill' : 'dis.stillThere') : null}
      // What it ends and what it does not; while a key save holds the removal, why Confirm waits instead. Then what uses
      // this account now: the kit's consequence list.
      body={saveShown ? t(note === 'unproved' ? 'key.saveUnprovedRemove' : 'key.saveHeldRemove') : <>{t('dis.stops')} {t('dis.nothingSwitches')}</>}
      consequences={[
        ...(helperHere ? [t('dis.helper')] : []),
        ...(n > 0 && imp?.known ? [t('dis.bots', { count: n })] : []),
        ...(imp && !imp.known ? [t('dis.botsUnknown')] : []),
        ...(agentsHere.length > 0 ? [t('dis.agents', { names: names(agentsHere) })] : []),
      ]}
    />
  );
}
