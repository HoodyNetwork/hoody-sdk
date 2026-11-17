// Network > Exit address: where requests through the computer's proxy leave from. Shows the
// egress program's upstream (GET /api/v1/egress/upstream), sets another one (PUT, the proxy URL as plain text) or
// goes back to the computer's own address (DELETE). An upstream that cannot be used is refused, never bypassed:
// the program answers 502 rather than send from the computer's own address, and the page says so before a set.
// The login rides only the one PUT: typed into the form (never prefilled), taken out of it when sent, kept by the
// mutation only until its send settles (reset), never in a lock key, identity, log or URL; a read reports only
// that a login is set. Each change is sent once (C9): a lost answer is held until a fresh read proves it or its
// sender dismisses that hold after a warning, and it is shown as unknown, never as failed.
// The setting reads as a diagram (your app, the computer's proxy,
// the exit, the internet); the current exit is one button that opens the choice.
// The choice offers what the egress program accepts: the computer's own address (DELETE), another computer of yours
// on another server (PUT of that computer's proxy as an https upstream, so traffic leaves from its server), or your
// own proxy (the form). The other computer's proxy address works like a password: it rides only the one PUT; the
// change's identity names that computer by its ids (`via`), never by address, and the page shows its name, never the
// address (a read of the exit keeps the host in the query cache only, as for any exit).
import { EXIT_LOCK, DOCS_EXIT, DOCS_VPN, SCHEMES, isScheme, proxyLabel, viaOf, viaKey, serverKey, looksLocal, formProblem, formReady, formMissing, upstreamLine, placed, useUpstream, useSet, useClear, ownHold, EMPTY } from './ExitIp.pure';
export { EXIT_LOCK, SCHEMES, exitStateOf, proxyLabel, viaOf, looksLocal, validHost, validPort, formProblem, formReady, upstreamLine, setProved, clearProved, exitTable, useExitGlance } from './ExitIp.pure';
export type { Scheme, ExitState, ExitForm, FormProblem, SetVars, ClearVars, ExitGlance } from './ExitIp.pure';
import type { Scheme, ExitState, ExitForm, SetVars, ClearVars } from './ExitIp.pure';
import { AnatomySection, Band, ComputerPicker, ConfirmDialog, Drawer, ErrorState, FormFooter, HeldBand, Icon, Outcome, Notice, PickerField, RadioGroup, SecretInput, Select, Skeleton, TextField, Why, useComputerChoice, useStrings, useWipeOn, type OutcomeLike } from '@kit';
import { useEffect, useState, type ReactNode } from 'react';
import { subjectOf, useComputers } from '../data';
import { bucket, serverLabel } from '../logic';
import type { Computer } from '../types';
import { proxyUrl } from './ConnectProxy';
import type { NoInternetHandle } from './NoInternet.logic';
import { useHeldChangeOf, useRunner } from './runner';
import { pageFaq } from '../faq';
import pageStrings from '../strings.en.json';
import strings from './ExitIp.strings.en.json';
import s from './parts.module.css';
import n from './Network.module.css';
/** 'off': not an exit but no internet at all, asked of Internet access above; the exit stays as it is. */
type Choice = 'own' | 'computer' | 'proxy' | 'off';

/** `noInternet`: Internet access on the same tab (Firewall renders this section), for the "Disable internet" choice;
 *  absent, no such choice. */
export function ExitIp({ c, canWrite, noInternet }: { c: Computer; canWrite: boolean; noInternet?: NoInternetHandle }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(pageStrings));
  const subject = subjectOf(c);
  const running = bucket(c.status) === 'running';
  const up = useUpstream(subject, running);
  const pickSet = (i: Record<string, unknown>) => i.computer === c.id && i.act === 'set';
  const pickClear = (i: Record<string, unknown>) => i.computer === c.id && i.act === 'clear';
  // core keeps a mutation's variables (the login, in `line`) until reset: the form resets it once the send settles.
  const setM = useSet();
  const set = useRunner(setM, { lock: EXIT_LOCK, pick: pickSet, vars: (i): SetVars => ({ ...subject, scheme: isScheme(i.scheme) ? i.scheme : 'socks5h', host: String(i.host ?? ''), port: Number(i.port ?? 0), login: i.login === true, line: '', ...(typeof i.via === 'string' ? { via: i.via } : {}) }) });
  const clear = useRunner(useClear(), { lock: EXIT_LOCK, pick: pickClear, vars: (): ClearVars => subject });
  const own = { set: ownHold('set', useHeldChangeOf(EXIT_LOCK, pickSet)), clear: ownHold('clear', useHeldChangeOf(EXIT_LOCK, pickClear)) };

  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState<ExitForm>(EMPTY);
  const [choice, setChoice] = useState<Choice>('proxy');
  const [viaPick, setViaPick] = useState<string | undefined>(undefined);
  // The computers this one can leave through: running, on another server, with a proxy address. Names only on screen.
  const list = useComputers().data;
  const names = new Map((list ?? []).map((x) => [viaKey(x), x.name] as const));
  const choiceOf = useComputerChoice();
  const others = (list ?? []).filter((x) => x.id !== c.id && bucket(x.status) === 'running' && !!serverKey(x) && serverKey(x) !== serverKey(c) && !!proxyUrl(x));
  // Another computer as the exit, as a noun for sentences and the diagram: its name when listed, never its address.
  const viaName = (v: string): string => { const other = names.get(v); return other ? t('net.exit.via', { other }) : t('net.exit.viaUnknown'); };
  const exitName = (x: { scheme: string; host: string; port: number | null }): string => {
    const v = x.host ? viaOf(x.host) : null;
    return v ? viaName(v) : proxyLabel(x);
  };
  const wipe = () => setForm((f) => ({ ...f, user: '', password: '' }));
  // Another computer, a route change or the end of the session: the login typed does not survive.
  useWipeOn(wipe, c.id);
  useEffect(() => {
    setEditing(false);
    setAsking(false);
    setForm(EMPTY);
    setViaPick(undefined);
    setM.reset();
    set.reset();
    clear.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);
  // The drawer and the "own address" question can close without the person: the computer stops, loses its address, or
  // the access to change it. The typed exit and login go with them; a send already made keeps its hold (no runner is
  // reset here), and a refused one stays said on the tab.
  const eligible = canWrite && running && placed(subject);
  useEffect(() => {
    if (eligible) return;
    setEditing(false);
    setAsking(false);
    setForm(EMPTY);
  }, [eligible]);

  // A failed re-read, or one waiting for the network, keeps the old answer in the cache: it is not the exit now, so
  // nothing acts on it.
  const unread = up.isError || up.fetchStatus === 'paused';
  const st = unread ? undefined : up.data;
  const current = st && st.kind !== 'direct' && st.kind !== 'unknown' ? st : null;
  // An open "Use its own address" keeps what it warned about (a login that can't be recovered) through a failed re-read,
  // from the last good read, but sends nothing until a read succeeds.
  const lastLogin = !!(up.data && up.data.kind !== 'direct' && up.data.kind !== 'unknown' && up.data.login);
  const heldAny = set.held !== null || clear.held !== null;
  const locked = !canWrite || set.busy || clear.busy || heldAny;
  // A failed re-read, or one that answered nothing readable: an open drawer keeps its draft and the last read's login
  // warning, but sends no exit change and marks nothing as "now" until a read succeeds.
  const stale = unread || (!up.isPending && up.data?.kind === 'unknown');
  const problem = formProblem(form);
  const close = () => {
    setEditing(false);
    setForm(EMPTY);
    setViaPick(undefined);
  };
  const currentVia = current?.host ? viaOf(current.host) : null;
  const open = () => {
    set.reset();
    clear.reset();
    setChoice(currentVia ? 'computer' : 'proxy');
    setViaPick(currentVia ? others.find((x) => viaKey(x) === currentVia)?.id : undefined);
    setEditing(true);
  };
  const canOpen = canWrite && !locked && !!st && st.kind !== 'unknown';
  const viaTarget = others.find((x) => x.id === viaPick);
  // Disable internet blocks outgoing connections only, with Internet access's own question; it sends nothing to the
  // exit, so the exit chosen stays set and applies again once internet access is allowed.
  const canBlock = !!noInternet && noInternet.state === 'off' && noInternet.canChange;
  const ready = choice === 'off' ? canBlock : choice === 'own' ? !!current : choice === 'computer' ? !!viaTarget : formReady(form);
  // "Use this exit" is off while a required box is empty: the footer names which one (a bad value shows at its own
  // field, and a change on its way or an unread exit already say why above).
  const missing = formMissing(form);
  const need = locked || stale || ready ? undefined : choice === 'proxy' ? (missing && problem === null ? t(`exit.form.need.${missing}`) : undefined) : choice === 'computer' && others.length > 0 ? t('exit.computer.need') : undefined;
  const sendOff = () => {
    if (!canBlock || !noInternet) return;
    close();
    noInternet.block();
  };
  const sendVia = () => {
    if (!viaTarget || locked || stale) return;
    const host = new URL(proxyUrl(viaTarget)).hostname;
    // The address goes into the one PUT body only; the change is named by the computer's ids.
    const vars: SetVars = { ...subject, scheme: 'https', host: '', port: 443, login: false, line: `https://${host}:443`, via: viaKey(viaTarget) };
    void set.run(vars).then((r) => {
      setM.reset();
      void up.refetch();
      if (r.outcome === 'done') close();
    });
  };
  const sendOwn = () => {
    if (!current || locked || stale) return;
    void clear.run(subject).then((r) => {
      void up.refetch();
      if (r.outcome === 'done') close();
    });
  };
  const submit = () => (choice === 'off' ? sendOff() : choice === 'own' ? sendOwn() : choice === 'computer' ? sendVia() : send());
  const send = () => {
    if (!formReady(form) || locked || stale) return;
    const line = upstreamLine(form);
    const host = form.host.trim().toLowerCase();
    // Another computer's proxy typed by hand is still that computer's key: named by its ids, the host only in `line`.
    const via = viaOf(host);
    const vars: SetVars = { ...subject, scheme: form.scheme, host: via ? '' : host, port: Number(form.port.trim()), login: !!form.user, line, ...(via ? { via } : {}) };
    // The login leaves the form now: `line` is its only copy, handed to the one send. So does a computer's proxy host
    // (a key): the drawer may stay open on a pending or lost answer, and must not keep showing it.
    setForm((f) => ({ ...f, user: '', password: '', ...(via ? { host: '' } : {}) }));
    void set.run(vars).then((r) => {
      // Settled, whatever the outcome: the send's variables (the login) leave the mutation cache now.
      setM.reset();
      void up.refetch();
      if (r.outcome === 'done') close();
    });
  };
  const clearNow = () => {
    if (stale) return;
    setAsking(false);
    if (locked) return;
    void clear.run(subject).then(() => void up.refetch());
  };
  const setOutcome: OutcomeLike | undefined = set.outcome?.kind === 'failed' ? { ...set.outcome, message: t('exit.form.failed', { name: c.name }) } : set.outcome;
  // The change in flight or held answers in the footer, whichever choice shows (the choice is locked meanwhile).
  const showsClear = clear.busy || clear.held !== null ? true : set.busy || set.held !== null ? false : choice === 'own';
  const formOutcome = showsClear ? clear.outcome : setOutcome;

  const fields = !!(form.host || form.port || form.user || form.password);

  return (
    <AnatomySection
      id="net-exit"
      title={t('exit.title')}
      description={t('exit.lede', { name: c.name })}
      actions={{
        ...(eligible ? { primary: { id: 'exit-change', label: t('exit.change'), opens: 'dialog' as const, onPress: open, ...(canOpen ? {} : { disabledReason: t(!st || st.kind === 'unknown' ? 'exit.reason.unread' : 'exit.reason.wait', { name: c.name }) }) } } : {}),
        secondary: [{ id: 'exit-docs', label: t('exit.docs'), href: DOCS_EXIT }, { id: 'exit-vpn', label: t('exit.vpn.docs'), href: DOCS_VPN }],
        ...(eligible && current ? { menu: [{ id: 'exit-own', label: t('exit.clear'), opens: true, isDisabled: locked, ...(locked ? { disabledReason: t('exit.reason.wait', { name: c.name }) } : {}), onAction: () => setAsking(true) }] } : {}),
      }}
      notices={
        <>
          {set.held && !editing ? (
            <HeldBand overlayId="computers-exit-ip-held-dismiss-set" text={t(set.held.login === false ? 'exit.held.set' : 'exit.held.setLogin', { proxy: typeof set.held.via === 'string' ? viaName(set.held.via) : proxyLabel({ scheme: String(set.held.scheme ?? ''), host: String(set.held.host ?? ''), port: typeof set.held.port === 'number' ? set.held.port : null }), name: c.name })} dismissTitle={t('exit.held.dismissTitle')} dismissBody={t('exit.held.dismissBody', { name: c.name })} dismissGo={t('exit.held.dismissGo')} elsewhere={t('exit.held.elsewhere')} readOnly={!own.set} onCheck={() => set.check()} onDismiss={set.dismiss} />
          ) : null}
          {clear.held ? <HeldBand overlayId="computers-exit-ip-held-dismiss-clear" text={t('exit.held.clear', { name: c.name })} dismissTitle={t('exit.held.dismissTitle')} dismissBody={t('exit.held.dismissBody', { name: c.name })} dismissGo={t('exit.held.dismissGo')} elsewhere={t('exit.held.elsewhere')} readOnly={!own.clear} onCheck={() => clear.check()} onDismiss={clear.dismiss} /> : null}
          <Outcome outcome={clear.held ? undefined : clear.outcome} doneText={t('exit.clear.done', { name: c.name })} />
          {/* A set the program refused, after its drawer closed (by the person or the page): said here until Change, also
              while the computer is stopped or has no address. */}
          {!editing && set.outcome?.kind === 'failed' ? <Outcome outcome={setOutcome} doneText={t('exit.form.done')} /* noDetails: the runner keeps only the outcome; the send's mutation, with its error, is reset at settle so the login leaves the cache */ /> : null}
          {!canWrite && running && placed(subject) ? <Band size="table">{t('exit.noWrite')}</Band> : null}
        </>
      }
      state={{ kind: 'ready' }}
    >
      {!running ? (
        <>
          <Diagram name={c.name} st={undefined} stopped />
          <Notice>{t('exit.stopped', { name: c.name })}</Notice>
        </>
      ) : !placed(subject) ? (
        <Notice>{t('exit.noAddress', { name: c.name })}</Notice>
      ) : (
        <div className={s.stack}>
          {!up.isPending && (!st || st.kind === 'unknown' || up.isError) ? (
            <ErrorState size="compact" title={t('exit.readFailed', { name: c.name })} error={up.error} onRetry={() => void up.refetch()} retrying={up.isFetching} />
          ) : null}
          <Diagram name={c.name} st={up.isPending ? 'pending' : up.isError ? undefined : st} label={exitName} />
          <div role="status" /* reason: the exit setting in words, announced when it changes */>
            {up.isPending || !st || st.kind === 'unknown' || up.isError ? null : st.kind === 'direct' ? (
              <p className={n.srOnly}>{t('exit.direct', { name: c.name })}</p>
            ) : (
              <>
                <p className={n.srOnly}>{t(!st.host ? 'exit.unnamed' : st.kind === 'active' ? 'exit.active' : st.kind === 'unavailable' ? 'exit.unavailable' : 'exit.setOld', { proxy: exitName(st), name: c.name })}</p>
                {st.login ? <p className={n.srOnly}>{t('exit.login')}</p> : null}
                {st.kind === 'set' && st.host ? <Notice>{t('net.exit.notReported', { name: c.name })}</Notice> : null}
                {!st.host || st.kind === 'unavailable' ? (
                  <p className={s.help} aria-hidden /* reason: the sentence above says it in full */>
                    {t(!st.host ? 'net.refused.unnamed' : 'net.refused', { name: c.name })}
                  </p>
                ) : null}
                {looksLocal(st.host) ? <Notice level="warn">{t('exit.local', { name: c.name })}</Notice> : null}
              </>
            )}
          </div>

        </div>
      )}
      <Drawer overlayId="computers-exit-ip" resizeKey="computers-exit-ip"
        isOpen={eligible && editing}
        onOpenChange={(o) => !o && close()}
        title={t('exit.form.title')}
        subtitle={t('exit.form.why', { name: c.name })}
        size="md"
        dirty={fields}
        busy={set.busy || clear.busy}
        footer={
          <FormFooter
            dirty={ready}
            requireDirty={false}
            submitDisabled={!ready || locked || (choice !== 'off' && stale)}
            busy={set.busy || clear.busy}
            busyLabel={t('exit.form.busy')}
            doneText={choice === 'own' ? t('exit.clear.done', { name: c.name }) : t('exit.form.done')}
            outcome={formOutcome}
            reason={need}
            onCheck={() => (showsClear ? clear.check() : set.check())}
            submitLabel={choice === 'off' ? t('exit.off.go') : choice === 'own' ? t('exit.clear.go') : t('exit.form.go')}
            onSubmit={submit}
            onCancel={close}
          />
        }
      >
        {/* A group, not a <form>: the footer's button is the one way to send, so one press is one send. */}
        <div className={s.stack} role="group" aria-label={t('exit.form.title')}>
          {stale ? <Band /* noDetails: the failed read shows its Details in the section */ tone="warn" size="table">{t('exit.reason.unread')}</Band> : null}
          <RadioGroup<Choice>
            label={t('exit.pick.label')}
            description={choice === 'off' ? t('exit.off.body', { name: c.name }) : choice === 'own' ? (lastLogin ? t('exit.clear.bodyLogin', { name: c.name }) : t('exit.clear.body', { name: c.name })) : lastLogin ? t('exit.form.replaceLogin') : undefined}
            isDisabled={set.busy || clear.busy || heldAny}
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'own', label: current || stale ? t('exit.pick.own', { name: c.name }) : `${t('exit.pick.own', { name: c.name })} (${t('net.exit.now')})`, description: t('exit.pick.own.desc', { name: c.name }), isDisabled: !current },
              // Each choice's own fields sit under it while it is picked.
              {
                value: 'computer',
                label: t('exit.pick.computer'),
                description: t('exit.pick.computer.desc'),
                reveal: others.length ? (
                  <>
                    {/* The kit's computer picker: each row shows its state, place (city · server) and flag. */}
                    <PickerField label={t('exit.computer.label')} description={t('exit.computer.rules', { name: c.name, other: viaTarget?.name ?? t('exit.computer.that') })}>
                      <ComputerPicker
                        label={t('exit.computer.label')}
                        computers={others.map((x) => choiceOf({ ...x, server_label: serverLabel(x).name, city: x.server?.city, country: x.server?.country }))}
                        value={viaPick}
                        onChange={setViaPick}
                      />
                    </PickerField>
                    {/* The one warning of this choice sits under the picker it is about. */}
                    <Band tone="warn" size="table" /* noDetails: a caution about the chosen exit, not a failed request */>
                      {t('exit.form.permissions', { name: c.name })} {t('exit.form.refuse', { name: c.name })}
                    </Band>
                  </>
                ) : (
                  <Notice>{t('exit.computer.none', { name: c.name })}</Notice>
                ),
              },
              {
                value: 'proxy',
                label: t('exit.pick.proxy'),
                description: t('exit.pick.proxy.desc'),
                reveal: (
                  <>
                    <Select<Scheme>
                      label={t('exit.form.scheme')}
                      options={SCHEMES.map((v) => ({ value: v, label: t(`exit.form.scheme.${v}`) }))}
                      value={form.scheme}
                      onChange={(v) => setForm((f) => ({ ...f, scheme: v }))}
                    />
                    {/* The warning is about the proxy typed here, so it rides the host field. */}
                    <Band
                      tone="warn" /* noDetails: a caution about the proxy typed here, not a failed request */
                      attach={
                        <TextField
                          label={t('exit.form.host')}
                          description={t('exit.form.host.help')}
                          value={form.host}
                          onChange={(v) => setForm((f) => ({ ...f, host: v }))}
                          errorMessage={problem === 'host' ? t('exit.form.host.bad') : undefined}
                          mono
                          isRequired
                        />
                      }
                    >
                      {t('exit.form.permissions', { name: c.name })} {t('exit.form.refuse', { name: c.name })}
                    </Band>
                    <TextField
                      label={t('exit.form.port')}
                      inputMode="numeric"
                      value={form.port}
                      onChange={(v) => setForm((f) => ({ ...f, port: v }))}
                      errorMessage={problem === 'port' ? t('exit.form.port.bad') : undefined}
                      mono
                      isRequired
                    />
                    <TextField label={t('exit.form.user')} value={form.user} onChange={(v) => setForm((f) => ({ ...f, user: v }))} autoComplete="off" />
                    <SecretInput
                      label={t('exit.form.password')}
                      description={t('exit.form.password.help', { name: c.name })}
                      value={form.password}
                      onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                      errorMessage={problem === 'needsUser' ? t('exit.form.password.needsUser') : undefined}
                      resetKey={c.id}
                    />
                  </>
                ),
              },
              ...(noInternet ? [{
                value: 'off' as const,
                label: noInternet.state === 'on' ? `${t('exit.pick.off')} (${t('net.exit.now')})` : t('exit.pick.off'),
                description: noInternet.state === 'on' ? t('exit.pick.off.on', { name: c.name }) : t('exit.pick.off.desc', { name: c.name }),
                isDisabled: !canBlock,
              }] : []),
            ]}
          />
          {noInternet ? (
            <Why question={t('exit.pick.off.whyQ')} faq={{ item: byId.firewall, label: t('exit.pick.off.more') }}>
              {t('exit.pick.off.why')}
            </Why>
          ) : null}
        </div>
      </Drawer>
      <ConfirmDialog overlayId="computers-exit-ip-clear"
        isOpen={eligible && asking}
        onOpenChange={(o) => !o && setAsking(false)}
        title={t('exit.clear.title', { name: c.name })}
        body={lastLogin ? t('exit.clear.bodyLogin', { name: c.name }) : t('exit.clear.body', { name: c.name })}
        confirmLabel={t('exit.clear.go')}
        confirmDisabled={stale}
        onConfirm={clearNow}
      >
        {stale ? <Band /* noDetails: the failed read shows its Details in the section */ tone="warn" size="table">{t('exit.reason.unread')}</Band> : null}
      </ConfirmDialog>
    </AnatomySection>
  );
}

/** Your app → the computer's proxy → the exit → the internet. `st`: the last read (`pending` while the first is on its
 *  way; undefined or unknown when it could not be read). Every box is text; the current exit says so to a reader.
 *  The exit box is text: the section head's Use another exit opens the choice. `label`: how an exit is named (another computer by its name, never its address). */
function Diagram({ name, st, stopped = false, label = proxyLabel }: { name: string; st: ExitState | 'pending' | undefined; stopped?: boolean; label?: (x: { scheme: string; host: string; port: number | null }) => string}) {
  const t = useStrings(strings);
  const known = st && st !== 'pending' && st.kind !== 'unknown' ? st : null;
  const set = known && known.kind !== 'direct' ? known : null;
  const refused = !!set && (set.kind === 'unavailable' || !set.host);
  const arrow = (extra?: string) => (
    <li className={`${n.arrow} ${extra ?? ''}`} aria-hidden /* reason: drawn arrows between the boxes */>
      <span className={n.arrowRight}>
        <Icon name="arrow-right" size="sm" />
      </span>
      <span className={n.arrowDown}>
        <Icon name="arrow-down" size="sm" />
      </span>
    </li>
  );
  let exit: ReactNode;
  if (st === 'pending') exit = <Skeleton rows={1} variant="text" />;
  else if (!known) exit = <span className={n.boxMain}>{t('net.exit.unknown')}</span>;
  else if (!set)
    exit = (
      <span className={n.boxMain}>
        <span className={n.dot} aria-hidden /* reason: the "now" tag says it */ />
        <span>{t('net.exit.own', { name })}</span>{' '}
        <span className={n.tags}>({t('net.exit.now')})</span>
      </span>
    );
  else if (!set.host) exit = <span className={n.boxMain}>{t('net.exit.unread', { name })}</span>;
  else {
    const via = viaOf(set.host);
    const tags = [set.kind === 'active' ? t('net.exit.now') : set.kind === 'set' ? t('net.exit.set') : null, via ? t('net.exit.another') : null, set.login ? t('net.exit.login') : null, looksLocal(set.host) ? t('net.exit.local') : null].filter(Boolean);
    const shown = label(set);
    exit = (
      <>
        <span className={n.boxMain}>
          {set.kind === 'active' ? <span className={n.dot} aria-hidden /* reason: the "now" tag says it */ /> : null}
          {via ? <span>{t('net.exit.through', { what: shown })}</span> : <span className={n.mono}>{shown}</span>}
          {set.kind === 'unavailable' ? <> <span>{t('net.exit.cant')}</span></> : null}
        </span>
        {tags.length ? <> <span className={n.tags}>{tags.join(' · ')}</span></> : null}
      </>
    );
  }
  return (
    <div className={n.wrap}>
      <ol className={`${n.flow} ${stopped ? n.faded : ''}`} aria-label={t('exit.title')}>
        <li className={n.box}>{t('net.app')}</li>
        {arrow()}
        <li className={n.box}>{stopped ? t('net.proxy.stopped', { name }) : t('net.proxy', { name })}</li>
        {arrow()}
        <li className={`${n.box} ${n.exit} ${refused ? n.danger : ''}`}>
          <span className={n.caption}>{t('net.exit.label')}</span>
          {exit}
          {known ? <> <span className={n.srOnly}>{t('net.exit.current')}</span></> : null}
        </li>
        {refused ? (
          <li className={n.broken} aria-hidden /* reason: the line under the diagram says requests are refused */>
            <Icon name="x" size="sm" /> {t('net.broken')}
          </li>
        ) : known ? (
          arrow(set?.kind === 'set' ? n.dashed : undefined)
        ) : null /* stopped or unknown: no route to the website is claimed */}
        <li className={n.box}>
          <span>{t('net.site')}</span>
          <span className={n.tags}>{t('net.site.sub')}</span>
        </li>
      </ol>
    </div>
  );
}
