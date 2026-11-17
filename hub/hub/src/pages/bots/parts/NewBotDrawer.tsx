// New Bot, read top to bottom: where it runs (a computer, started on the one the top bar shows when it can host a Bot),
// what it is called (a suggestion you can re-roll), which model answers, what it may do (Auto-approve) and how you reach
// it (a public link). The steps run in order (Bot, link, first key); an unknown outcome is read back, never re-sent
// blindly, and the step header says exactly where it stopped.
// The model is one row that names the held model, with Change: Change swaps the drawer's body for the kit chooser on the
// chosen computer (a sub-flow with Back), and a pick returns to the form. It starts on an explicit Hoody Free, and Create
// judges the held choice against the newest evidence for that computer first. Not ok: the Model row says why (with Use
// it anyway when only consent is missing), focus goes there, and nothing is created. A computer change voids consent.
// A trip to the AI page carries the typed draft; its return seeds the fields and reopens the chooser, which takes the trip.
import { capture, hostEnv, providers, useCore } from '@core';
import { Band, Button, ComputerPicker, ConfirmDialog, Disclosure, Drawer, IconButton, ModelChooser, Notice, OutcomeBanner, PickerField, PropagatingNote, ReasonButton, Row, SecretField, SettingGroup, SettingRow, SettingSwitch, Stack, Tag, TextField, Track, TrackStep, Widget, useComputerChoice, usePageLink, useStrings, type TrackState } from '@kit';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { links as aiLinks } from '../../ai/links';
import { useCreateBot, type BotRow, type Computer, type HeldSend, type LinkOffer, type ModelRow, type NewBotResult, type RealmInfo } from '../data';
import { links } from '../links';
import { DEFAULT_MODEL, botIdFromName, canHostBot, nameProblem, previewUrl, startComputer, suggestName } from '../logic';
import { labelOf, specOf, useBotChooser, useReturnTrip, whyText } from '../model-adapters';
import { instructionsProblem } from '../textRules';
import strings from '../strings.en.json';
import { DrawerFooter } from './Bits';
import { KeyShare, issueKey } from './KeyShare';
import s from './pane.module.css';

type Choice = providers.Choice;
type Why = Extract<providers.Verdict, { ok: false }>['why'];

interface Props {
  open: boolean;
  onClose: () => void;
  computers: readonly Computer[];
  /** The realms the page knows: a computer's first known realm shows as a chip in the picker. */
  realms?: readonly RealmInfo[];
  bots: readonly BotRow[];
  models: readonly ModelRow[];
  offer: LinkOffer | undefined;
  initialComputer?: string;
  /** The computer the top bar shows: the drawer starts on it when it can host a Bot, and says why when it cannot. */
  currentComputer?: string;
  onOpenBot: (key: string, giveLink: boolean) => void;
}

type StepState = 'todo' | 'done' | 'unknown' | 'failed';
type Result = NewBotResult['state'];

/** Where each step stands after a run that stopped at `state`. */
function stepStates(state: Result, withLink: boolean): [StepState, StepState, StepState] {
  const link: StepState = withLink ? 'done' : 'todo';
  switch (state) {
    case 'done':
      return ['done', link, link];
    case 'botunknown':
    case 'stale':
      return ['unknown', 'todo', 'todo'];
    case 'linkmaybe':
      return ['done', 'unknown', 'todo'];
    case 'nolink':
      return ['done', 'failed', 'todo'];
    case 'nokey':
    case 'keylocked':
      return ['done', 'done', 'failed'];
    case 'keyunknown':
      return ['done', 'done', 'unknown'];
    case 'keylost':
      return ['done', 'done', 'unknown'];
    case 'nametaken':
    case 'exists':
      return ['done', 'done', 'failed'];
  }
}

/** The kit Track's state of a step: a failed step needs the person (the stop says why), a step still to come is later, and
 *  while the create runs the first step not done waits on its answer. */
const trackState = (st: StepState, waiting: boolean): TrackState => (st === 'failed' ? 'now' : st === 'todo' ? (waiting ? 'wait' : 'later') : st);

/** The steps as a kit Track, rows only (no step opens a body here); shown once creation runs, never over the empty form.
 *  Only the steps the create was sent with: a link and key the person left out are not steps of this create (a Track row would
 *  read "to do" for them). */
function StepHeader({ states, withLink, running }: { states: readonly StepState[]; withLink: boolean; running: boolean }) {
  const t = useStrings(strings);
  const ids = ['bot', 'link', 'key'] as const;
  const names = [t('newBot.step.bot'), t('newBot.step.link'), t('newBot.step.key')];
  const firstOpen = states.findIndex((x) => x === 'todo');
  return (
    <Track label={t('newBot.steps')} open={null}>
      {ids.map((id, i) => {
        const st = states[i] ?? 'todo';
        if (i > 0 && !withLink && st === 'todo') return null;
        return <TrackStep key={id} id={id} state={trackState(st, running && i === firstOpen)} {...(st === 'failed' ? { tone: 'danger' as const } : {})} name={names[i] ?? ''} />;
      })}
    </Track>
  );
}

/** After the body the press swapped in is drawn: a web page's next frame. A terminal has no frames (asking for one is a
 *  TERM_GLOBAL trap in a press): a timer of its own, which runs after the commit all the same. */
const nextFrame = (run: () => void): void => {
  if (hostEnv().browserPage === true) requestAnimationFrame(run);
  else setTimeout(run, 0);
};

/**
 * The held creates a warning showed, taken when it arms (it turns on, or the drawer's computer changes under it) and kept
 * until it disarms: its Dismiss frees those and no other, however the live holds moved meanwhile. `read` reads the creates
 * the warning is about. `retake` takes them again: after a Dismiss press, a warning still up stands for what is held then.
 */
function useArmedHolds(armed: boolean, read: () => ReadonlyArray<HeldSend>, key: unknown): { shown: () => ReadonlyArray<HeldSend>; retake: () => void } {
  const snap = useRef<ReadonlyArray<HeldSend> | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    snap.current = armed ? readRef.current() : null;
  }, [armed, key]);
  return {
    shown: () => snap.current ?? readRef.current(),
    retake: () => {
      snap.current = readRef.current();
    },
  };
}

export function NewBotDrawer({ open, onClose, computers, realms = [], bots, models, offer, initialComputer, currentComputer, onOpenBot }: Props) {
  const t = useStrings(strings);
  const running = useMemo(() => computers.filter(canHostBot), [computers]);
  // The kit ComputerPicker rows: name, place (city · server, public), realm,
  // state, colour; the page's own flag wins (the list gives it already made).
  const choice = useComputerChoice();
  const pickRows = running.map((c) => {
    const realm = realms.find((r) => c.realmIds?.includes(r.id));
    return { ...choice({ id: c.id, name: c.name, status: 'running', server_name: c.server, ...(c.city ? { city: c.city } : {}), ...(c.color ? { color: c.color } : {}) }, realm ? { realm: { name: realm.name } } : undefined), ...(c.flag ? { flag: c.flag } : {}) };
  });
  const [computer, setComputer] = useState<string | undefined>(undefined);
  // The create of the computer the drawer is on (its own lock and outcome): another computer's create that may have gone
  // through never shows here, never holds this Create, and is never freed from here.
  const create = useCreateBot(computer);
  // From the press of Create until its run settles. create.running reads true only once core's lock runs the send, after
  // the press's digests are taken (core/locked.ts), so for that first moment the press itself holds Create and the
  // picker: a second press there, or another computer picked there, would draw the first answer (the key shown once) in
  // a slot not on screen.
  const [pressed, setPressed] = useState(false);
  // The person chose (or a trip back brought) the computer: the start rule never moves it again in this opening.
  const chosen = useRef(false);
  // The model chooser is the drawer's body (a sub-flow with Back) while the person changes the model.
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  // The name as offered (the suggestion, a re-roll, or the one a trip back brought): a name that differs was typed, and
  // typed input makes every close of the form ask first.
  const [offered, setOffered] = useState('');
  // Said beside the computer, before the send: with All realms selected the new Bot is a Global Bot (createBotFlow). A token
  // session pinned to All realms has no realm menu, so its line names the key instead; it cannot give a Global Bot a link
  // (core refuses that create unsent in any token session), so the link switch is off there and says why.
  const allRealms = useCore().realm === 'all';
  const tokenAll = allRealms && capture().page?.kind === 'token';
  const realmLine = tokenAll ? t('newBot.realmTokenAll') : allRealms ? t('newBot.realmGlobal') : undefined;
  // The held model ('' = the Agent's default) and the choice that put it there (null = the starting Hoody Free, not picked).
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [held, setHeld] = useState<Choice | null>(null);
  // Why the last Create did not go: shown at the Model field until the person acts on it.
  const [why, setWhy] = useState<Why | null>(null);
  const [link, setLink] = useState(false);
  // The link choice the create was sent with: the steps and the result read it, never the switch as it is now.
  const [sentLink, setSentLink] = useState(false);
  // A new Bot starts with Auto-approve On; it is part of the create, so the choice is made before anything exists.
  const [yolo, setYolo] = useState(true);
  // Turning it back On after the person turned it Off names the effect first (the default itself asks nothing).
  const [askYolo, setAskYolo] = useState(false);
  const [instructions, setInstructions] = useState('');
  // What the Bot's agent would refuse in the instructions (too long, a control or invisible character): said at the field,
  // and Create waits on it. The field sits folded under More options, so a problem keeps that fold open: the words that
  // hold Create off are always in view.
  const textProblem = instructionsProblem(instructions);
  const [moreOpen, setMoreOpen] = useState(false);
  // What the person typed. It makes the drawer dirty on the form only, never in the chooser: a trip to the AI page leaves
  // from the chooser and carries the typed draft (leave.draft), and the Drawer's leave guard cannot tell a trip from any
  // other leave (a dirty drawer stops the trip's navigation on "Discard changes?"). A close asked from the chooser goes
  // back to the form first, so typed input is never dropped without that ask.
  const typed = instructions !== '' || name !== offered;
  const modelNames = { free: providers.FREE_NAME, any: t('model.anyName') };
  const mc = useBotChooser(computer, computers, models, model, modelNames);
  const modelRef = useRef<HTMLDivElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);
  const aiPage = usePageLink('ai');
  // A trip back from the AI page for this drawer's computer: its draft seeds the fields once.
  const restore = useReturnTrip(open ? initialComputer : undefined, 'newBot');
  // The trip the chooser has had: the chooser unmounts on Back, so it would take the same trip (and its consent) again on
  // every Change. Once the chooser closes after a trip, the trip is not passed again.
  const [tripTaken, setTripTaken] = useState<string | null>(null);
  const trip = restore?.draft?.kind === 'newBot' && restore.id !== tripTaken ? restore : null;

  const offerName = (n: string) => {
    setName(n);
    setOffered(n);
  };
  const reroll = () => offerName(suggestName(Math.random));
  useEffect(() => {
    if (!open) return;
    // A trip back seeds what was typed (never its consent: the chooser hands that back only for the same scope).
    const d = restore?.draft?.kind === 'newBot' ? restore.draft : null;
    chosen.current = d !== null;
    setComputer(d ? d.computer : startComputer(computers, initialComputer, currentComputer).id);
    // A trip back left from the chooser: it opens again and takes the trip (its consent, the provider set up there).
    setPicking(d !== null);
    offerName(d ? d.name : suggestName(Math.random));
    setModel(d ? d.model.spec : DEFAULT_MODEL);
    setHeld(null);
    setWhy(null);
    setLink(d !== null && !tokenAll && d.link);
    setYolo(true);
    setAskYolo(false);
    setInstructions(d ? d.instructions : '');
    setMoreOpen(false);
    create.reset();
    // Re-initialise only when the drawer opens, or when a trip back arrives for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, restore?.id]);
  // Each computer's create keeps its own outcome: the computer the drawer is on starts clean at every opening and at every
  // change of computer, so an earlier opening's banner never shows again. A running create keeps running; reset never frees
  // a create that may have gone through.
  useEffect(() => {
    if (open && !create.running) create.reset();
    // Only when the drawer opens or its computer changes (the create follows the computer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, computer]);
  // The start rule again once the computers are read (the drawer may open before the list arrives), until the person chooses.
  const start = startComputer(computers, initialComputer, currentComputer);
  useEffect(() => {
    if (open && !chosen.current && computer === undefined && start.id !== undefined) setComputer(start.id);
  }, [open, computer, start.id]);
  // Consent belongs to the computer: another computer voids it at once, and the old reason with it.
  const pickComputer = (id: string | undefined) => {
    chosen.current = true;
    if (id === computer) return;
    if (pressed) return;
    setComputer(id);
    setHeld((c) => (c?.kind === 'model' ? null : c));
    setWhy(null);
  };
  // Into the chooser and back: the body is replaced each way, so focus follows it (the chooser; then the Model row,
  // which names what is held now).
  const openChooser = () => {
    setPicking(true);
    nextFrame(() => chooserRef.current?.focus());
  };
  const closeChooser = () => {
    if (trip) setTripTaken(trip.id);
    setPicking(false);
    nextFrame(() => modelRef.current?.focus());
  };
  // Escape in the chooser is its Back, never the drawer's close. React order: the chooser's own Escapes (clearing its
  // search, leaving a consent bar, a popover of its own) run first and stop it; what reaches here goes back to the form.
  const chooserKeys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    closeChooser();
  };
  const onChoose = (c: Choice) => {
    setHeld(c);
    setModel(specOf(c));
    setWhy(null);
    closeChooser();
  };
  /** Use it anyway: consent for the held model on this computer, against the evidence shown now. */
  const consent = () => {
    const ev = mc.catalogue.evidence;
    if (!ev || model === '') return;
    setHeld({ kind: 'model', spec: model, readiness: 'unknown', consent: true, scope: ev.scope, seq: ev.seq });
    setWhy(null);
  };

  const taken = bots.filter((b) => b.computerId === computer).map((b) => b.id);
  const problem = nameProblem(name, taken);
  const result = create.data;
  const ready = offer?.door === 'ready';
  const canSubmit = computer !== undefined && problem === null && textProblem === null && create.outcome !== 'pending' && !(link && !ready);
  // A refusal the agent pinned to one field (400 bad_request, details.field): an id it reserves that this page's list does
  // not know yet, or instructions it will not take (a <system-reminder> tag): the banner names the field.
  const refusedField = create.outcome === 'failed' && create.code === 'bad_request' ? create.details?.field : undefined;
  const failedWhy =
    create.code === 'bot_exists' ? t('newBot.name.taken') : create.code === 'model_unavailable' ? t('newBot.model.refused') : refusedField === 'id' ? t('newBot.name.reserved') : refusedField === 'instructions' ? t('newBot.refusedInstructions') : undefined;
  const done = create.outcome === 'done' && result;
  const stop = done && result.state !== 'done' ? result.state : null;
  const states = done ? stepStates(result.state, sentLink) : create.outcome === 'pending' ? stepStates('botunknown', sentLink) : (['todo', 'todo', 'todo'] as const);
  const sending = create.running || pressed;
  const busy = sending || create.outcome === 'pending';
  // The warning below is this computer's (its create is its own change). Its Dismiss frees the holds it showed, taken when
  // it armed, and no create held after them.
  const armed = useArmedHolds(create.outcome === 'pending', () => create.held() ?? [], computer);
  const dismiss = () => {
    void create.dismissShown(armed.shown()).then(() => armed.retake());
  };
  /** Create: judged on the newest evidence for the drawer's computer; not ok says why at the Model field and sends nothing. */
  const submit = () => {
    if (!computer || pressed) return;
    const v = mc.judge(held, model);
    if (!v.ok) {
      setWhy(v.why);
      // A web page focuses a frame later (after the error renders); the terminal has no frames: at once.
      if (hostEnv().browserPage === true) requestAnimationFrame(() => modelRef.current?.focus());
      else modelRef.current?.focus();
      return;
    }
    setWhy(null);
    setSentLink(link);
    setPressed(true);
    void create.run({ name, computerId: computer, model, instructions, withLink: link, label: offer?.suggestedLabel ?? '', yolo }).finally(() => setPressed(false));
  };
  const modelName = labelOf(model, models, modelNames);
  const computerName = mc.name;
  // The trip to the AI page: only within this Hub load, and never while Create runs or may have gone through.
  const leave =
    aiPage && computer
      ? {
          origin: { page: 'bots' as const, href: links.newBot(computer), label: t('newBot.title'), focus: 'nb-mc-h' },
          draft: () => ({ kind: 'newBot' as const, name, instructions, link, computer, model: { spec: model, consent: held?.kind === 'model' && held.consent } }),
          blocked: busy ? t('model.wait') : null,
          // Auto-approve is never carried on a trip (a new Bot comes back On): leaving with it Off says so first.
          unsaved: () => (yolo ? [] : [t('newBot.auto')]),
          to: aiLinks.handoff,
        }
      : null;
  // The secret leaves with the drawer: closing resets the change that holds it.
  const close = () => {
    create.reset();
    onClose();
  };

  const model0 = model === '';
  // One truth beside the held model's name: what the chosen computer says about it now (nothing for the Agent's default,
  // which names no model, and nothing before a computer is chosen).
  const ev = mc.catalogue.evidence;
  const readiness = computer === undefined || model0 ? null : !ev || ev.catalogue.state === 'loading' ? 'checking' : providers.readinessOf(ev, model);
  const modelTag =
    readiness === null ? null : readiness === 'checking' ? (
      <Tag>{t('newBot.model.checking')}</Tag>
    ) : readiness === 'ready' ? (
      model === DEFAULT_MODEL ? <Tag>{t('newBot.model.included')}</Tag> : <Tag tone="ok">{t('newBot.model.ready')}</Tag>
    ) : readiness === 'needs_key' ? (
      <Tag tone="warn">{t('newBot.model.needsSetup')}</Tag>
    ) : readiness === 'gone' ? (
      <Tag tone="warn">{t('newBot.model.gone')}</Tag>
    ) : (
      <Tag>{t('newBot.model.cantTell')}</Tag>
    );
  const hostWhy = computer === undefined ? start.why : null;
  // What it may do, and how it is reached. Under the group, about the link: why it cannot be given here (Create waits on
  // it), else the address it will get.
  const access = (
    <SettingGroup variant="field" title={t('newBot.g.access')}>
      <SettingSwitch label={t('newBot.auto')} help={yolo ? t('newBot.autoOn') : t('newBot.autoOff')} isSelected={yolo} onChange={(on) => (on ? setAskYolo(true) : setYolo(false))} isDisabled={busy} />
      <SettingSwitch label={t('newBot.link')} help={tokenAll ? t('newBot.linkTokenAll') : link ? t('newBot.linkOn') : t('newBot.linkHelp')} isSelected={link} onChange={setLink} isDisabled={busy || tokenAll} />
    </SettingGroup>
  );
  const address = offer ? previewUrl('', offer.zone, offer.suggestedLabel) : '';
  const doorShut = link && offer !== undefined && offer.door !== 'ready';
  // The link switch is on and the offer is not read (still loading, or its read failed): Create waits on it, so the line
  // under the switches says so and what to do, as a shut door does.
  const linkUnread = link && offer === undefined;
  const linkLine =
    !link ? undefined : !offer ? t('newBot.linkUnread') : offer.door !== 'ready' ? t(`link.door.${offer.door}`) : offer.zoneFrom === 'platform' ? t('link.platformPreview', { url: address }) : address || (offer.suggestedLabel ? t('link.nameOnly', { name: offer.suggestedLabel }) : t('link.noZone'));

  return (
    <Drawer overlayId="bots-new-bot-drawer" resizeKey="bots-new-bot"
      isOpen={open}
      onOpenChange={(o) => {
        if (o) return;
        if (picking && typed) closeChooser();
        else close();
      }}
      size="md"
      title={picking ? t('newBot.model.pick') : t('newBot.title')}
      {...(picking ? { onBack: closeChooser, backLabel: t('newBot.model.back') } : {})}
      dirty={Boolean(result?.secret) || (!done && !picking && typed)}
      discardText={result?.secret ? t('secret.closeAsk') : undefined}
      discardLabel={result?.secret ? t('secret.closeNow') : undefined}
      footer={
        picking ? undefined : done ? (
          <DrawerFooter
            cancelLabel={t('ui.close')}
            submitLabel={t('newBot.open')}
            isDisabled={!result.botKey}
            onSubmit={() => {
              if (result.botKey) {
                const key = result.botKey;
                close();
                onOpenBot(key, sentLink && result.state === 'nolink');
              }
            }}
          />
        ) : (
          <DrawerFooter
            cancelLabel={t('ui.cancel')}
            submitLabel={t('newBot.create')}
            busy={sending}
            pending={create.outcome === 'pending'}
            isDisabled={!canSubmit}
            onSubmit={submit}
            note={
              <>
                {create.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('newBot.maybe')} body={t('newBot.maybeBody')} onCheck={() => create.readBack()} onDismiss={dismiss} />}
                {create.outcome === 'not_sent' && <OutcomeBanner kind="failed" title={t('newBot.notSent')} body={t('newBot.notSentBody')} />}
                {create.outcome === 'failed' && <OutcomeBanner kind="failed" title={t('newBot.failed')} body={failedWhy} />}
              </>
            }
          />
        )
      }
    >
      <div className={s.drawerForm}>
        {(create.running || create.outcome === 'pending' || done) && <StepHeader states={states} withLink={sentLink} running={create.running} />}
        {done ? (
          <>
            {stop ? (
              <OutcomeBanner kind={stop === 'nametaken' || stop === 'exists' || stop === 'keylocked' ? 'failed' : 'pending'} title={t(`newBot.stop.${stop}.title`)} body={t(`newBot.stop.${stop}.body`)} />
            ) : (
              <OutcomeBanner kind="done" title={t('newBot.done')} />
            )}
            {/* A link just made can take about a minute to start working. */}
            {!stop && result.link ? <PropagatingNote variant="created" /> : null}
            {result.secret && (
              <>
                <SecretField label={t('secret.title', { name: 'default' })} value={result.secret} description={t('secret.note')} onWipe={() => create.reset()} />
                <KeyShare key={issueKey(result)} secret={result.secret} url={result.link?.url || undefined} />
              </>
            )}
          </>
        ) : picking ? (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape from anything in the chooser is its Back; the chooser's own controls stay the interactive elements
          <div ref={chooserRef} tabIndex={-1} onKeyDown={chooserKeys}>
            <ModelChooser
              id="nb-mc"
              label={t('model.title')}
              catalogue={computer ? mc.catalogue : null}
              computer={mc.computer}
              value={model}
              choice={held}
              onChoose={onChoose}
              rules={mc.rules}
              purpose="bot"
              defaultSpec={DEFAULT_MODEL}
              fallback={mc.fallback}
              offer={{ endpoint: true }}
              leave={leave}
              restore={trip}
              isDisabled={busy}
            />
          </div>
        ) : (
          <>
            <Widget size="l" fit>
              <SettingGroup variant="field" title={t('newBot.g.bot')}>
                <SettingRow label={t('picker.computer.label')} help={t('newBot.hostHelp')}>
                  <PickerField label={t('picker.computer.label')} showLabel={false} {...(hostWhy ? { description: hostWhy.kind === 'none' ? t('newBot.host.none') : t(`newBot.host.${hostWhy.kind}`, { name: hostWhy.name }) } : realmLine ? { description: realmLine } : {})}>
                    {/* Held while Create runs: its answer (the first key, shown once) is drawn on this computer. */}
                    <ComputerPicker label={t('picker.computer.label')} computers={pickRows} value={computer} onChange={pickComputer} placeholder={t('picker.computer.placeholder')} isDisabled={sending} />
                  </PickerField>
                </SettingRow>
                {/* The identifier is said only when it differs from the name as typed: the same value twice tells nothing. */}
                <SettingRow label={t('newBot.name')} help={botIdFromName(name) === name ? undefined : t('newBot.nameHelp', { id: botIdFromName(name) || '—' })}>
                  {(ids) => (
                    <TextField
                      aria-label={t('newBot.name')}
                      aria-describedby={ids.helpId}
                      value={name}
                      onChange={setName}
                      errorMessage={problem ? t(`newBot.name.${problem}`) : undefined}
                      suffix={<IconButton icon="reload" size="sm" label={t('newBot.reroll')} onPress={reroll} />}
                    />
                  )}
                </SettingRow>
                <SettingRow
                  label={t('model.title')}
                  help={t('newBot.model.help')}
                  actions={
                    computer === undefined ? (
                      <ReasonButton variant="secondary" size="sm" reason={t('newBot.model.needComputer')} name={t('newBot.model.changeName')}>
                        {t('newBot.model.change')}
                      </ReasonButton>
                    ) : (
                      <Button variant="secondary" size="sm" aria-label={t('newBot.model.changeName')} isDisabled={busy} onPress={openChooser}>
                        {t('newBot.model.change')}
                      </Button>
                    )
                  }
                >
                  <div className={s.field} ref={modelRef} tabIndex={-1} id="nb-model">
                    <Stack gap={2}>
                      <Row>
                        {model0 ? t('newBot.model.inherit') : modelName}
                        {modelTag}
                      </Row>
                      {why && (
                        <Band
                          tone="warn"
                          size="table"
                          /* noDetails: Create judged the held model here and sent nothing, so there is no rejection; the person must act first */
                          actions={
                            why === 'needs_consent' ? (
                              <Button variant="secondary" size="sm" onPress={consent}>
                                {t('model.useAnyway')}
                              </Button>
                            ) : undefined
                          }
                        >
                          {why === 'needs_setup' ? t('newBot.model.setup', { model: modelName, computer: computerName }) : whyText(t, why, modelName, computerName)}
                        </Band>
                      )}
                    </Stack>
                  </div>
                </SettingRow>
              </SettingGroup>
            </Widget>
            <Widget size="l" fit>
              {/* One Band, always mounted: the switches never remount (and keep focus) as its line comes and goes. */}
              <Band tone={doorShut || linkUnread ? 'warn' : 'neutral'} attach={access} /* noDetails: read from the offer (why a link cannot be given here, or its address); nothing was sent */>
                {linkLine}
              </Band>
            </Widget>
            <Disclosure title={t('newBot.more')} description={t('newBot.moreWhat')} isExpanded={moreOpen || textProblem !== null} onExpandedChange={setMoreOpen}>
              <div className={s.drawerForm}>
                <TextField label={t('behaviour.instructions')} description={t('newBot.instructionsHelp')} multiline rows={4} value={instructions} onChange={setInstructions} errorMessage={textProblem ? t(`newBot.instr.${textProblem}`) : undefined} />
                <Notice>{t('newBot.moreGuard')}</Notice>
              </div>
            </Disclosure>
          </>
        )}
      </div>
      <ConfirmDialog
        overlayId="bots-new-bot-autoapprove"
        isOpen={askYolo}
        onOpenChange={setAskYolo}
        title={t('autoapprove.confirmTitle')}
        body={t('autoapprove.confirmBody')}
        confirmLabel={t('autoapprove.confirmGo')}
        onConfirm={() => {
          setYolo(true);
          setAskYolo(false);
        }}
      />
    </Drawer>
  );
}
