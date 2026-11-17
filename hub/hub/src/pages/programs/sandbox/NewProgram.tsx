// New program: the Programs header's button and its drawer. Keep it adds a program to the computer (programs/add);
// Run once starts a temporary one (quick-start). The fields follow the sandbox editor's form (Drawer, Stack of kit
// fields, Outcome line in the footer); the send and its proofs are add.ts's. A refusal stays in the drawer, where
// the person fixes it; a send that reached the computer closes it, and the page opens the new row. A send whose
// outcome is unknown stays held in core (any tab, after a reload): the drawer shows it, with Check (a read, never a
// resend) and a warned Dismiss. A result that comes back after a switch to another account, realm or computer is
// still told (toast) and touches nothing else: its row is the old computer's, and the drawer (maybe a new draft for
// the new computer) is not its. A program kept may carry Advanced fields and a sandbox (the Sandbox panel's own fields,
// SandboxFields, judged against the draft); its environment values never appear in a note, a toast or a log.
import { useAttemptsVersion, type Target } from '@core';
import { Band, Button, Disclosure, Drawer, EnvRows, HeldBand, Outcome, RadioGroup, Row, SegmentedControl, Stack, Switch, TextField, Why, showToast, useStrings, type EnvRow as KitEnvRow, type FaqItem, type StringKey } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { checkHeld, dismissAdd, heldAdds, sendAdd, type AddOutcome, type CheckResult } from './add';
import { EMPTY_ADD, checkAdd, withMode, type AddField, type AddForm, type AddMode, type PortMode, type Policy } from './addform';
import { EMPTY_ADVANCED, advancedBody, checkAdvanced, draftFacts, type AdvField, type AdvProblem, type Advanced } from './advanced';
import { usePart } from './data';
import { EMPTY_FORM, applyPreset, check as checkSandbox, formRestricts, toBlock, type Field as SbField, type Form as SbForm, type Preset } from './form';
import { text as sbText } from './SandboxEditor';
import { SandboxFields } from './SandboxFields';
import strings from './strings.en.json';

type Key = StringKey<typeof strings>;

export interface NewProgramProps {
  target: Target | null;
  /** The send made this row (its key; '' when the answer named none): the page reads the list and opens it. */
  onAdded: (key: string) => void | Promise<void>;
  /** The page's answer to when a start counts as done: linked under the start-time field when given. */
  startDone?: FaqItem;
  /** The page's answer to what Keep it and Run once differ in: linked under the choice when given. */
  keepOrOnce?: FaqItem;
  /** A link asked for the form (links.newProgram): it opens once a computer is shown, then `onOpenTaken` drops the ask. */
  openAsked?: boolean;
  onOpenTaken?: () => void;
}

type Shown = Extract<AddOutcome, { kind: 'refused' | 'notSent' | 'stale' }> | null;

export function NewProgram({ target, onAdded, startDone, keepOrOnce, openAsked = false, onOpenTaken }: NewProgramProps) {
  const t = useStrings(strings);
  useAttemptsVersion();
  const part = usePart();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_ADD);
  const [adv, setAdv] = useState<Advanced>(EMPTY_ADVANCED);
  // The environment rows, as the kit editor keeps them (row ids); `advIn` reads them as name/value.
  const [env, setEnv] = useState<KitEnvRow[]>([]);
  const envNext = useRef(1);
  const [sb, setSb] = useState<SbForm>(EMPTY_FORM);
  const [sbUsed, setSbUsed] = useState<Preset | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);
  // Bumped by a submit that found problems: after that render, focus goes to the first marked field.
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);
  const [policyTouched, setPolicyTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ hold: string; r: CheckResult['kind']; name: string } | null>(null);
  const mounted = useRef(true);
  // Set in setup too: StrictMode runs cleanup then setup again on a live mount.
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  // Another account, realm or computer: the form and its notes belong to the old one.
  const partRef = useRef(part);
  useEffect(() => {
    if (partRef.current === part) return;
    partRef.current = part;
    setOpen(false);
    setForm(EMPTY_ADD);
    setAdv(EMPTY_ADVANCED);
    setEnv([]);
    setSb(EMPTY_FORM);
    setSbUsed(null);
    setAdvOpen(false);
    setSbOpen(false);
    setPolicyTouched(false);
    setShowErrors(false);
    setShown(null);
    setChecked(null);
    // An old part's send or Check still in flight is its own (core holds it); this part's drawer is free.
    setBusy(false);
    setChecking(false);
  }, [part]);

  // The link's ask opens the form on the computer shown, once: the ask is dropped as it is taken.
  // After the part reset above, so a part that changes in the same commit (the computer shown arriving) never closes it.
  useEffect(() => {
    if (!openAsked || !target) return;
    setOpen(true);
    onOpenTaken?.();
  }, [openAsked, target, onOpenTaken]);

  const held = heldAdds(target);
  const pend = held[0];
  const keep = form.mode === 'keep';
  // Advanced and the sandbox belong to a program kept: a run once neither shows nor sends them.
  const sandboxed = keep && formRestricts(sb);
  const advIn: Advanced = { ...adv, env: env.map((r) => ({ name: r.key, value: r.value })) };
  const facts = draftFacts(form, advIn);
  const advProblems = keep ? checkAdvanced(advIn, sandboxed) : [];
  // A touched sandbox form is checked even when it restricts nothing yet, so a mistyped limit is never dropped quietly.
  const sbTouched = keep && JSON.stringify(sb) !== JSON.stringify(EMPTY_FORM);
  const sbProblems = sbTouched ? checkSandbox(sb, facts) : [];
  const problems = [...checkAdd(form), ...advProblems, ...sbProblems];
  const errOf = (f: AddField) => {
    const p = showErrors ? problems.find((x) => x.field === f) : undefined;
    return p ? t(`np.err.${p.code}` as Key) : undefined;
  };
  // The sandbox's refusals of the program's own folder: marked on the Working folder field too, so it is in sight.
  const sbDirProblem = sbProblems.find((x) => x.field === 'program' && (x.code === 'runUser' || x.code === 'privateTmpDirectory'));
  const advErr = (f: Exclude<AdvField, 'env'>) => {
    if (!showErrors) return undefined;
    const hit = advProblems.find((x) => x.field === f);
    if (hit) return t(`np.err.${hit.code}` as Key);
    return f === 'directory' && sbDirProblem ? sbText(t, sbDirProblem) : undefined;
  };
  const sbErrOf = (f: SbField) => {
    const hit = sbProblems.find((x) => x.field === f);
    return hit && showErrors ? sbText(t, hit) : undefined;
  };
  // The environment's sandbox refusals are marked on its rows (checkAdvanced), not repeated here.
  const sbProgramProblems = sbProblems.filter((x) => x.field === 'program' && !x.code.startsWith('env.'));
  const set = <K extends keyof AddForm>(k: K) => (v: AddForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setShown(null);
  };
  // While a send is in flight the Advanced and sandbox handlers change nothing (the fields are held too): what was
  // sent is what stays shown, whatever reaches a handler.
  const setA = <K extends keyof Advanced>(k: K) => (v: Advanced[K]) => {
    if (busy) return;
    setAdv((a) => ({ ...a, [k]: v }));
    setShown(null);
  };
  const setS = <K extends keyof SbForm>(k: K) => (v: SbForm[K]) => {
    if (busy) return;
    setSb((f) => ({ ...f, [k]: v }));
    setSbUsed(null);
    setShown(null);
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_ADD) || JSON.stringify(advIn) !== JSON.stringify(EMPTY_ADVANCED) || JSON.stringify(sb) !== JSON.stringify(EMPTY_FORM);

  const reset = () => {
    setForm(EMPTY_ADD);
    setAdv(EMPTY_ADVANCED);
    setEnv([]);
    setSb(EMPTY_FORM);
    setSbUsed(null);
    setAdvOpen(false);
    setSbOpen(false);
    setPolicyTouched(false);
    setShowErrors(false);
    setShown(null);
  };

  // `from`: the part the send or check started in. After a switch the drawer is the new part's: left as it is.
  const opened = async (key: string, from: string) => {
    if (partRef.current !== from) return;
    setOpen(false);
    reset();
    await onAdded(key);
  };

  const send = async () => {
    setShowErrors(true);
    // A marked field must be in sight: open every section that holds one, then focus the first (after the render).
    if (advProblems.length || sbDirProblem) setAdvOpen(true);
    if (sbProblems.length) setSbOpen(true);
    if (problems.length) setFocusTick((n) => n + 1);
    if (problems.length || !target || busy) return;
    setBusy(true);
    setShown(null);
    const from = partRef.current;
    const block = sandboxed ? toBlock(sb) : null;
    const extra = keep ? { body: { ...advancedBody(advIn), ...(block ? { sandbox: block } : {}) }, env: advIn.env } : undefined;
    const out = await sendAdd(form, target, extra);
    if (!mounted.current) return;
    if (partRef.current === from) setBusy(false);
    if (out.kind === 'done') {
      showToast({ title: t(out.key.startsWith('temp:') ? 'np.done.once' : 'np.done.keep', { name: out.name }), tone: 'ok' });
      await opened(out.key, from);
    } else if (out.kind === 'doneProblem') {
      const body = out.withheld ? t('np.out.withheld') : out.text;
      showToast({ title: t(out.key.startsWith('temp:') ? 'np.problem.once' : 'np.problem.keep', { name: out.name }), ...(body ? { body } : {}), tone: 'warn' /* noDetails: the row exists; add.ts keeps the daemon's cleaned text (body), never the rejection, and withholds one that holds an environment value */ });
      await opened(out.key, from);
    } else if (partRef.current !== from) {
      // A pending send is the old part's band (core holds it); a refusal is the old form's.
      return;
    } else if (out.kind === 'pending') {
      // The send is the band's now (held in core); the form starts over, so closing asks nothing.
      setChecked(null);
      reset();
    } else {
      setShown(out);
    }
  };

  const check = async (hold: string, name: string) => {
    if (!target || checking) return;
    setChecking(true);
    const from = partRef.current;
    const r = await checkHeld(hold, target);
    if (!mounted.current) return;
    if (partRef.current === from) setChecking(false);
    if (r.kind === 'proved') {
      setChecked(null);
      if (r.start === 'started') showToast({ title: t('np.found.once'), tone: 'ok' });
      else if (r.start === 'notStarted') showToast({ title: t('np.problem.once', { name }), tone: 'warn' /* noDetails: read from the list (status failed); there is no rejection */ });
      else showToast({ title: t('np.found.onceUnknown', { name }), tone: 'info' });
      await opened(r.key, from);
      return;
    }
    if (r.kind === 'found') {
      // Not this send's success: the list cannot say who made it (add.ts).
      setChecked(null);
      showToast({ title: t('np.found.keep', { name }), tone: 'info' });
      await opened(r.key, from);
      return;
    }
    if (partRef.current === from) setChecked({ hold, r: r.kind, name });
  };

  useEffect(() => {
    if (!focusTick) return;
    const first = formRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"], [role="radiogroup"][aria-invalid="true"] input, [data-np-focus]');
    first?.focus();
  }, [focusTick]);

  const name = pend?.meta.name ?? '';
  // What the last Check of the shown hold said while it stays held: the band's one line, until the next check.
  const checkLine =
    pend && checked && checked.hold === pend.hold.id && (checked.r === 'notYet' || checked.r === 'readFailed' || checked.r === 'inFlight' || checked.r === 'listed')
      ? t(`np.check.${checked.r}` as Key, { name: checked.name })
      : undefined;
  const footer = shown ? <NoteLine t={t} out={shown} mode={form.mode} name={form.name.trim()} /> : showErrors && problems.length > 0 ? <Outcome outcome="not_sent" title={t('np.fixFirst')} wrap /* noDetails: the Hub's own field checks; nothing was sent */ /> : undefined;

  return (
    <>
      <Button variant="secondary" icon="plus" onPress={() => setOpen(true)} isDisabled={!target}>
        {t('np.new')}
      </Button>
      <Drawer overlayId="programs-new-program" resizeKey="programs-new-program"
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={t('np.title')}
        subtitle={t('np.sub')}
        size="md"
        dirty={dirty}
        busy={busy}
        outcome={footer}
        primary={
          <Button variant="primary" onPress={() => void send()} isDisabled={busy || !target}>
            {busy ? t(keep ? 'np.adding' : 'np.starting') : t(keep ? 'np.add' : 'np.run')}
          </Button>
        }
      >
        <div ref={formRef} data-np-form>
        <Stack gap={4}>
          {pend && (
            <div data-np-held={pend.hold.id}>
              {/* Keyed by the hold: a newer send's band starts with no check under way and no question open. */}
              <HeldBand
                key={pend.hold.id}
                text={t(pend.meta.mode === 'keep' ? 'np.held.keep' : 'np.held.once', { name })}
                readOnly={false}
                inFlight={!!pend.hold.inFlight}
                note={checkLine ?? t(pend.hold.inFlight ? 'np.check.inFlight' : 'np.held.body')}
                onCheck={() => check(pend.hold.id, name)}
                onDismiss={() => {
                  dismissAdd(pend.hold.id);
                  setChecked(null);
                }}
                overlayId="programs-new-program-dismiss"
                dismissTitle={t('np.dismissT')}
                dismissBody={t('np.dismissBody', { name })}
                dismissGo={t('np.dismissGo')}
              />
            </div>
          )}
          <Stack gap={1}>
            <RadioGroup
              label={t('np.mode')}
              value={form.mode}
              onChange={(m: AddMode) => {
                setForm((f) => withMode(f, m, policyTouched));
                setShown(null);
              }}
              isDisabled={busy}
              variant="cards"
              options={(['keep', 'once'] as const).map((m) => ({ value: m, label: t(`np.mode.${m}` as Key), description: t(`np.mode.${m}.d` as Key) }))}
            />
            {keepOrOnce && (
              <Why question={t('np.mode.q')} faq={{ item: keepOrOnce, label: t('np.mode.more') }}>
                {t('np.mode.why')}
              </Why>
            )}
          </Stack>
          <TextField
            label={t('np.name')}
            description={t(keep ? 'np.name.d' : 'np.name.dOnce')}
            mono
            isRequired={keep}
            value={form.name}
            onChange={set('name')}
            errorMessage={errOf('name')}
            isDisabled={busy}
          />
          <TextField
            label={t('np.command')}
            description={t('np.command.d')}
            mono
            isRequired
            value={form.command}
            onChange={set('command')}
            errorMessage={errOf('command')}
            isDisabled={busy}
          />
          <TextField label={t('np.user')} description={t('np.user.d')} mono isRequired value={form.user} onChange={set('user')} errorMessage={errOf('user')} isDisabled={busy} />
          {keep && (
            <Stack gap={2}>
              <SegmentedControl<PortMode>
                label={t('np.ports')}
                showLabel
                fullWidth
                value={form.ports}
                onChange={(v) => set('ports')(v)}
                isDisabled={busy}
                items={(['none', 'one', 'range'] as const).map((m) => ({ id: m, label: t(`np.ports.${m}` as Key) }))}
              />
              {form.ports === 'one' && (
                <TextField label={t('np.port')} description={t('np.port.d')} mono inputMode="numeric" value={form.port} onChange={set('port')} errorMessage={errOf('port')} isDisabled={busy} />
              )}
              {form.ports === 'range' && (
                <Stack gap={2}>
                  <Row gap={2} align="start" wrap>
                    <TextField label={t('np.rangeStart')} description={t('np.range.d')} mono inputMode="numeric" value={form.rangeStart} onChange={set('rangeStart')} errorMessage={errOf('rangeStart')} isDisabled={busy} />
                    <TextField label={t('np.rangeEnd')} mono inputMode="numeric" value={form.rangeEnd} onChange={set('rangeEnd')} errorMessage={errOf('rangeEnd')} isDisabled={busy} />
                  </Row>
                  <TextField label={t('np.portParam')} description={t('np.portParam.d')} mono placeholder={t('np.portParam.ph')} value={form.portParam} onChange={set('portParam')} errorMessage={errOf('portParam')} isDisabled={busy} />
                </Stack>
              )}
            </Stack>
          )}
          <SegmentedControl<Policy>
            label={t('np.policy')}
            showLabel
            fullWidth
            value={form.policy}
            onChange={(v) => {
              setPolicyTouched(true);
              set('policy')(v);
            }}
            isDisabled={busy}
            items={(['unexpected', 'true', 'false'] as const).map((p) => ({ id: p, label: t(`np.policy.${p}` as Key) }))}
          />
          {keep && <Switch label={t('np.boot')} description={t('np.boot.d')} isSelected={form.boot} onChange={set('boot')} isDisabled={busy} />}
          {keep && (
            <Disclosure title={t('np.adv')} isExpanded={advOpen} onExpandedChange={setAdvOpen}>
              <Stack gap={3}>
                <TextField label={t('np.directory')} description={t('np.directory.d')} mono value={adv.directory} onChange={setA('directory')} errorMessage={advErr('directory')} isDisabled={busy} />
                <TextField label={t('np.description')} description={t('np.description.d')} value={adv.description} onChange={setA('description')} isDisabled={busy} />
                <EnvRows
                  rows={env}
                  onEdit={(id, p) => {
                    if (busy) return;
                    setEnv((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r)));
                    setShown(null);
                  }}
                  onRemove={(id) => {
                    if (busy) return;
                    setEnv((l) => l.filter((r) => r.id !== id));
                    setShown(null);
                  }}
                  onAdd={() => !busy && setEnv((l) => [...l, { id: envNext.current++, key: '', value: '' }])}
                  label={t('np.env')}
                  description={t('np.env.d')}
                  helpBelow
                  labels={{
                    key: (n) => t('np.envKey', { n }),
                    value: (n) => t('np.envValue', { n }),
                    remove: (n) => t('np.envRemove', { n }),
                    keyHint: t('np.envKeyHint'),
                    valueHint: t('np.envValueHint'),
                    add: t('np.envAdd'),
                  }}
                  isDisabled={busy}
                />
                <EnvProblems t={t} problems={showErrors ? advProblems : []} />
                <TextField label={t('np.startSecs')} description={t('np.startSecs.d')} mono inputMode="numeric" value={adv.startSecs} onChange={setA('startSecs')} errorMessage={advErr('startSecs')} isDisabled={busy} />
                {startDone && (
                  <Why question={t('np.startSecs.q')} faq={{ item: startDone, label: t('np.startSecs.more') }}>
                    {t('np.startSecs.why')}
                  </Why>
                )}
                <Switch label={t('np.logs')} description={t('np.logs.d')} isSelected={adv.logs} onChange={setA('logs')} isDisabled={busy} />
                {adv.logs && (
                  <Row gap={2} align="start" wrap>
                    <TextField label={t('np.logSize')} description={t('np.logSize.d')} mono inputMode="numeric" value={adv.logSizeMb} onChange={setA('logSizeMb')} errorMessage={advErr('logSizeMb')} isDisabled={busy} />
                    <TextField label={t('np.logBackups')} description={t('np.logBackups.d')} mono inputMode="numeric" value={adv.logBackups} onChange={setA('logBackups')} errorMessage={advErr('logBackups')} isDisabled={busy} />
                  </Row>
                )}
              </Stack>
            </Disclosure>
          )}
          {keep && (
            <Disclosure title={t('np.sb')} description={sandboxed ? t('np.sb.on') : t('np.sb.d')} isExpanded={sbOpen} onExpandedChange={setSbOpen}>
              <div data-np-sandbox>
              <Stack gap={4}>
                {showErrors && sbProgramProblems.length > 0 && (
                  <Band tone="danger" /* noDetails: the Hub's own checks of the draft; nothing was sent */>
                    <div data-np-focus tabIndex={-1}>
                      <Stack gap={1}>
                        <span>{t('np.sb.programProblems')}</span>
                        {sbProgramProblems.map((x) => (
                          <span key={x.code + (x.vars?.name ?? '')} data-sb-program-problem>
                            {sbText(t, x)}
                          </span>
                        ))}
                      </Stack>
                    </div>
                  </Band>
                )}
                <SandboxFields
                  form={sb}
                  known={facts}
                  used={sbUsed}
                  busy={busy}
                  locked={busy}
                  set={setS}
                  errOf={sbErrOf}
                  onPreset={(pr) => {
                    if (busy) return;
                    setSb(applyPreset(sb, pr, facts));
                    setSbUsed(pr);
                    setShown(null);
                  }}
                />
              </Stack>
              </div>
            </Disclosure>
          )}
        </Stack>
        </div>
      </Drawer>
    </>
  );
}

function NoteLine({ t, out, mode, name }: { t: (k: Key, v?: Record<string, string | number>) => string; out: NonNullable<Shown>; mode: AddMode; name: string }) {
  if (out.kind === 'stale') return <Outcome outcome="not_sent" title={t('np.out.stale')} wrap /* noDetails: core refused before the send; add.ts keeps only the outcome */ />;
  if (out.kind === 'refused') {
    const title = out.tooLarge ? t('np.out.tooLarge') : t(mode === 'keep' ? 'np.out.refused' : 'np.out.refusedOnce');
    const detail = out.withheld ? t('np.out.withheld') : out.text;
    return <Outcome outcome="failed" title={title} {...(detail && !out.tooLarge ? { detail } : {})} wrap /* noDetails: add.ts keeps the daemon's cleaned text (detail), never the rejection, and withholds one that holds an environment value */ />;
  }
  const words: Record<typeof out.why, Key> = {
    read: 'np.out.read',
    taken: mode === 'keep' ? 'np.out.taken' : 'np.out.takenOnce',
    held: 'np.out.held',
    storage: 'np.out.storage',
    full: 'np.out.full',
    account: 'np.out.generic',
    core: 'np.out.generic',
  };
  return <Outcome outcome="not_sent" title={t(words[out.why], { name })} wrap /* noDetails: nothing was sent, so there is no rejection */ />;
}

/** The environment rows' problems, by variable name and row, never by value. */
function EnvProblems({ t, problems }: { t: (k: Key, v?: Record<string, string | number>) => string; problems: readonly AdvProblem[] }) {
  const env = problems.filter((p) => p.field === 'env');
  if (!env.length) return null;
  return (
    <Band tone="danger" /* noDetails: the Hub's own checks of the rows; nothing was sent */>
      <div data-np-focus tabIndex={-1}>
        <Stack gap={1}>
          <span>{t('np.err.env')}</span>
          {env.map((p) => (
            <span key={`${p.row}:${p.code}`} data-np-env-problem={p.row}>
              {p.code === 'envName' && !p.name ? t('np.err.envNameEmpty', { n: (p.row ?? 0) + 1 }) : t(`np.err.${p.code}` as Key, { name: p.name ?? '' })}
            </span>
          ))}
        </Stack>
      </div>
    </Band>
  );
}
