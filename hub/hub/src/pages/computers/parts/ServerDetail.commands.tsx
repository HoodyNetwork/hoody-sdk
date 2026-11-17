// The server's control commands, inside the server detail: one Section, "Server control", with one row per
// command the API offers this person on this server, its Run inline and its result directly under it. Words come from the
// command's identity (its slug), never from its risk word: the restart is said plainly ("Restart now…"), and anything else
// keeps its API name and description. A run is sent once (C9): a lost answer is "may have run", held under its row with
// Check again (re-reads the usage, frees nothing, never resends) and a warned Dismiss, the one way out: nothing the page
// can read proves what became of a lost answer. Anything that is not a plain reading is confirmed first, naming the
// server and saying that every computer on it goes down until the host is back.
import { AnatomySection, Band, Button, Checkbox, CodeBlock, ConfirmDialog, ItemList, Notice, OutcomeBanner, Select, Stack, TextField, useStrings, type ActionSpec, type ItemProps } from '@kit';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import pageStrings from '../strings.en.json';
import { asUnknown, useRunner } from './runner';
import { useRunServerCommand, useServerCommands } from './ServerDetail.data';
import { paramsOf, refusalOf, spanParts, waitParts, type CommandList, type Field, type RefusalKind, type RunResult, type RunVars, type ServerCommand, type Values } from './ServerDetail.commands.logic';
import detailStrings from './ServerDetail.strings.en.json';

// Held-band words come from the page's table (held.*), the panel's own from the detail table.
const strings = { ...pageStrings, ...detailStrings };

/** The one command whose words are its own: the API's immediate kernel restart. */
const RESTART = 'kexec-reboot';
/** Confirmed before it is sent: anything that is not a plain reading, and the restart whatever the API says of it (its
 *  risk and confirmation are stored settings that may differ from the defaults). */
const asksFirst = (c: ServerCommand): boolean => !c.readOnly || c.slug === RESTART;

/** What the last press of this panel came to, under the row of its command (`id`). */
type Shown =
  | { kind: 'result'; id: string; name: string; result: RunResult }
  | { kind: 'refused'; id: string; name: string; why: RefusalKind; wait: number | null }
  | { kind: 'notSent' | 'stale' | 'inFlight'; id: string; name: string }
  | { kind: 'unproved'; id: ''; name: string };

export function ServerControl({ serverId, rentalId, serverName, computerCount }: { serverId: string; rentalId: string; serverName: string; computerCount: number | undefined }) {
  const t = useStrings(strings);
  const list = useServerCommands(serverId, true);
  const runner = useRunner(useRunServerCommand(), {
    lock: 'server.command',
    pick: (i) => i.serverId === serverId,
    vars: (i): RunVars => ({
      serverId: String(i.serverId ?? ''),
      rentalId: String(i.rentalId ?? ''),
      serverName: String(i.serverName ?? ''),
      commandId: '',
      commandName: String(i.commandName ?? ''),
      slug: String(i.slug ?? ''),
      readOnly: i.readOnly === true,
      params: {},
    }),
  });
  const [values, setValues] = useState<Readonly<Record<string, Values>>>({});
  const [confirm, setConfirm] = useState<{ cmd: ServerCommand; params: RunVars['params'] } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [asked, setAsked] = useState<{ go: () => unknown; command: string; server: string } | null>(null);
  // One send at a time from this panel, decided in the same tick as the press (React state would lag a double press).
  const sending = useRef(false);
  const [checking, setChecking] = useState(false);

  // A failed refresh leaves older commands in the query: they are not offered as if they were current.
  const cmds = list.isError ? null : (list.data ?? null);
  const held = runner.held;
  const heldName = held ? String(held.commandName ?? '') : '';
  const blocked = !!held || runner.busy || cmds?.ready === false || cmds?.active === false;

  async function send(cmd: ServerCommand, params: RunVars['params']) {
    // The warned confirm may have been open while the server stopped being ready or another send took the lock: nothing
    // is sent then (and it is said so, because it is true: no request was made).
    if (sending.current) return;
    if (blocked || !cmds) {
      setShown({ kind: 'notSent', id: cmd.id, name: cmd.name });
      return;
    }
    sending.current = true;
    setShown(null);
    try {
      await run(cmd, params);
    } finally {
      sending.current = false;
    }
  }

  async function run(cmd: ServerCommand, params: RunVars['params']) {
    const r = asUnknown(await runner.run({ serverId, rentalId, serverName, commandId: cmd.id, commandName: cmd.name, slug: cmd.slug, readOnly: cmd.readOnly, params }));
    if (r.outcome === 'done') {
      setShown(r.data ? { kind: 'result', id: cmd.id, name: cmd.name, result: r.data as RunResult } : { kind: 'stale', id: cmd.id, name: cmd.name });
    } else if (r.outcome === 'failed') {
      // Core hands a refused send's HTTP status and code (and a 429's retryAfter): nothing was run, so it is shown as such.
      const x = r as { status?: number; retryAfter?: number };
      const why = refusalOf(r.code, x.status);
      setShown({ kind: 'refused', id: cmd.id, name: cmd.name, why, wait: why === 'limit' ? (x.retryAfter ?? null) : why === 'cooldown' ? cmd.cooldownS : null });
    }
    // Core's BUSY: an earlier send of this lock (another mount's, another tab's) is still out and may apply, so it is
    // "still being sent", never "not sent".
    else if (r.outcome === 'not_sent') setShown({ kind: r.code === 'BUSY' ? 'inFlight' : 'notSent', id: cmd.id, name: cmd.name });
    else if (r.outcome === 'stale') setShown({ kind: 'stale', id: cmd.id, name: cmd.name });
    // 'pending': core holds it and the band below says so.
  }

  function press(cmd: ServerCommand) {
    if (blocked) return;
    const { params, missing } = paramsOf(cmd.fields, values[cmd.id] ?? {});
    if (missing.length) return;
    if (asksFirst(cmd)) setConfirm({ cmd, params });
    else void send(cmd, params);
  }

  // Check again only re-reads the usage shown above; it frees nothing and sends nothing. Only the warned
  // Dismiss ends a hold.
  async function check() {
    setChecking(true);
    await runner.check().catch(() => false);
    setChecking(false);
    setShown({ kind: 'unproved', id: '', name: heldName });
  }

  // The runner's Dismiss names its variables and the hold shown (runner.ts), never a no-argument settle.
  const dismissShown = runner.dismiss;
  async function dismiss() {
    if (await dismissShown()) setShown(null);
  }

  const notReady = cmds?.ready === false || cmds?.active === false;
  const heldServer = held ? String(held.serverName ?? serverName) : serverName;
  const heldSlug = held ? String(held.slug ?? '') : '';
  const heldBlock = held ? (
    <>
      <Band
        tone="warn"
        size="table"
        actions={
          <>
            <Button size="sm" onPress={() => void check()} busy={checking}>
              {t('held.check')}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setAsked({ go: dismiss, command: heldName, server: heldServer })}>
              {t('sd.cmd.stop')}
            </Button>
          </>
        }
      >
        {t('sd.cmd.held', { command: heldName, server: heldServer })}
      </Band>
      {shown?.kind === 'unproved' && shown.name === heldName ? <Notice>{t('sd.cmd.stillUnknown', { command: shown.name })}</Notice> : null}
    </>
  ) : null;
  const rows = readState(list.isPending, cmds);
  // A hold, or a result, shows under the row of its command; when that row is not shown (the list changed or can no longer
  // be read), it shows at the head of the section instead, so a run that may have happened is never hidden.
  const heldRow = held && rows.kind === 'ready' ? cmds?.commands.find((c) => c.slug === heldSlug) : undefined;
  const shownRow = !held && shown && shown.kind !== 'unproved' && rows.kind === 'ready' ? cmds?.commands.find((c) => c.id === shown.id) : undefined;
  const notices: ReactNode[] = [];
  if (rows.kind === 'ready' && notReady)
    notices.push(
      <Band key="ready" tone="warn" size="table" /* noDetails: the server's own ready state from a good read, not a rejection */>
        {t('sd.cmd.notReady')}
      </Band>,
    );
  if (held && !heldRow) notices.push(<Fragment key="held">{heldBlock}</Fragment>);
  if (!held && shown && !shownRow) notices.push(<Outcome key="shown" shown={shown} server={serverName} t={t} /* noDetails: same outcome as the row's, at the section head */ />);

  // Why a Run waits, in the order a person can act on: a run that may still be going, then the server, then the form.
  const why = (missing: boolean): string | undefined => (held ? t('sd.cmd.why.held') : notReady ? t('sd.cmd.notReady') : missing ? t('sd.cmd.why.fields') : undefined);

  function item(c: ServerCommand, missing: boolean): ItemProps {
    const restart = c.slug === RESTART;
    const rate = rateWords(c, t);
    const describe = restart ? t('sd.cmd.restart.meta') : c.description;
    const meta = [describe, rate].filter((x) => x !== '');
    const reason = why(missing);
    const action: ActionSpec = {
      id: `run-${c.id}`,
      label: restart ? t('sd.cmd.restart.run') : t('sd.cmd.run'),
      ...(restart ? {} : { name: t('sd.cmd.runNamed', { name: c.name }) }),
      onPress: () => press(c),
      ...(asksFirst(c) ? { opens: 'dialog' as const } : {}),
      ...(restart ? { tone: 'danger' as const } : {}),
      ...(reason !== undefined ? { disabledReason: reason } : runner.busy ? { busy: true } : {}),
    };
    return {
      id: c.id,
      title: c.name,
      ...(meta.length === 2 ? { meta: [meta[0] as string, meta[1] as string] as const } : meta.length === 1 ? { meta: [meta[0] as string] as const } : {}),
      ...(!asksFirst(c) ? {} : { status: { tone: 'neutral' as const, label: t('sd.cmd.asks'), tip: restart ? t('sd.cmd.restart.tip') : t('sd.cmd.asksTip', { server: serverName }) } }),
      actions: { inline: [action] },
    };
  }

  return (
    <>
      <AnatomySection
        id="server-control"
        title={t('sd.control')}
        info={t('sd.cmd.help')}
        notices={notices.length ? <>{notices}</> : undefined}
        state={rows.kind === 'failed' ? { kind: 'failed', error: list.error, onRetry: () => void list.refetch(), busy: list.isFetching } : rows}
        {...(rows.kind === 'ready' && cmds && !cmds.commands.length ? { note: t('sd.cmd.none') } : {})}
      >
        {cmds?.commands.map((c) => {
          const { missing } = paramsOf(c.fields, values[c.id] ?? {});
          return (
            <Stack key={c.id} gap={2}>
              <ItemList label={c.name} items={[item(c, missing.length > 0)]} />
              {c.fields.map((f) => (
                <FieldInput key={f.name} f={f} value={values[c.id]?.[f.name]} onChange={(v) => setValues((all) => ({ ...all, [c.id]: { ...all[c.id], [f.name]: v } }))} />
              ))}
              {heldRow === c ? heldBlock : shownRow === c ? <Outcome shown={shown} server={serverName} t={t} /> : null}
            </Stack>
          );
        })}
      </AnatomySection>

      <ConfirmDialog overlayId="computers-server-command-confirm"
        isOpen={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('sd.cmd.confirm.title', { command: confirm?.cmd.name ?? '', server: serverName })}
        body={t('sd.cmd.confirm.body', { command: confirm?.cmd.name ?? '', server: serverName })}
        confirmLabel={t('sd.cmd.confirm.go', { command: confirm?.cmd.name ?? '' })}
        tone="danger"
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) void send(c.cmd, c.params);
        }}
      >
        <Notice>{computerCount === undefined ? t('sd.cmd.confirm.unknown') : t('sd.cmd.confirm.on', { count: computerCount })}</Notice>
      </ConfirmDialog>

      <ConfirmDialog overlayId="computers-server-command-dismiss"
        isOpen={asked !== null}
        onOpenChange={(o) => !o && setAsked(null)}
        title={t('sd.cmd.dismiss.title', { command: asked?.command ?? '', server: asked?.server ?? '' })}
        body={t('sd.cmd.dismiss.body', { command: asked?.command ?? '', server: asked?.server ?? '' })}
        confirmLabel={t('sd.cmd.stopGo')}
        onConfirm={() => {
          const go = asked;
          setAsked(null);
          if (go) void go.go();
        }}
      />
    </>
  );
}

/** The section's state from the read: loading, a list it cannot use (refused, unreadable, or a failed refresh), or ready. */
function readState(pending: boolean, cmds: CommandList | null): { kind: 'loading'; rows: number } | { kind: 'ready' } | { kind: 'failed' } {
  if (pending) return { kind: 'loading', rows: 2 };
  return cmds ? { kind: 'ready' } : { kind: 'failed' };
}
type T = ReturnType<typeof useStrings<typeof strings>>;

/** The rate words, exact, from the answer's own fields: the spacing between runs (unrounded) and the daily limit, each only when sent. */
function rateWords(c: ServerCommand, t: T): string {
  const out: string[] = [];
  const span = spanParts(c.cooldownS);
  if (span?.length) out.push(t('sd.cmd.rate.cooldown', { wait: span.map((p) => t(`sd.cmd.wait.${p.unit}`, { count: p.count })).join(' ') }));
  if (c.perDay !== null) out.push(t('sd.cmd.rate.perDay', { count: c.perDay }));
  return out.join(' ');
}

function FieldInput({ f, value, onChange }: { f: Field; value: string | boolean | undefined; onChange: (v: string | boolean) => void }) {
  if (f.kind === 'boolean') return <Checkbox label={f.name} isSelected={value === true} onChange={onChange} />;
  if (f.kind === 'choice') return <Select label={f.name} value={typeof value === 'string' && value ? value : undefined} onChange={onChange} options={f.choices.map((c) => ({ value: c, label: c }))} />;
  return <TextField label={f.name} {...(f.hint ? { description: f.hint } : {})} value={typeof value === 'string' ? value : ''} onChange={onChange} isRequired={f.required} />;
}

function Outcome({ shown, server, t }: { shown: Shown | null; server: string; t: T }) {
  if (!shown) return null;
  if (shown.kind === 'result') {
    const r = shown.result;
    if (r.accepted) return <OutcomeBanner kind="done" title={t('sd.cmd.accepted', { command: shown.name, server })} />;
    const ok = r.status === 'completed' && (r.exitCode === null || r.exitCode === 0);
    return (
      <Stack gap={2}>
        <OutcomeBanner kind={ok ? 'done' : 'failed'} title={t(ok ? 'sd.cmd.out.ok' : 'sd.cmd.out.bad', { command: shown.name })} />
        {r.output ? <CodeBlock code={r.output} label={t('sd.cmd.out.label', { command: shown.name })} wrap lang="ansi" /> : null}
      </Stack>
    );
  }
  if (shown.kind === 'refused') {
    const w = shown.why === 'limit' || shown.why === 'cooldown' ? waitParts(shown.wait) : null;
    const key = w ? `sd.cmd.refused.${shown.why}In` : `sd.cmd.refused.${shown.why}`;
    const wait = w ? t(`sd.cmd.wait.${w.unit}`, { count: w.count }) : '';
    return <OutcomeBanner kind="failed" title={t(key as `sd.cmd.refused.${RefusalKind}`, { command: shown.name, wait })} />;
  }
  if (shown.kind === 'inFlight') return <OutcomeBanner kind="pending" title={t('sd.cmd.inFlight', { command: shown.name, server })} />;
  if (shown.kind === 'notSent') return <OutcomeBanner kind="not_sent" title={t('sd.cmd.notSent', { command: shown.name })} />;
  if (shown.kind === 'stale') return <OutcomeBanner kind="stale" title={t('sd.cmd.stale', { command: shown.name })} />;
  return null;
}
