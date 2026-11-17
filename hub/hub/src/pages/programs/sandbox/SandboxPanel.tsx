// The program's Sandbox panel: three honest rows (the saved policy, what the next start uses, the inbound
// firewall read back) and a fourth that says the running program is not reported. Every problem the computer
// reports is shown in its own words; the UNCONFINED line leads, prominently. System programs are view only;
// temporary programs have no sandbox, so no panel.
//
// Saves (data.ts) settle here once they reached the computer, or may have: a core-held save (5xx, timeout,
// network) and an unclear refusal (a 400 with no readable text, which core has already let go of: this panel
// keeps it, for this tab, until a status read shows the sent block or the person lets it go) both block every
// further send for the program until settled.
import { useChangesVersion, useCurrentComputer } from '@core';
import { AnatomySection, Band, Button, CodeBlock, ConfirmDialog, Disclosure, Facts, IdChip, OutcomeBanner, Stack, TextButton, Verdict, VerdictMark, useStrings, type StringKey } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { stateTest, type Row as ProgramRow } from '../logic';
import { opsStore, useOps } from '../parts/ops';
import { editBusy, editStore, useEditAttempts } from '../parts/edit';
import { removeBusy, removeStore, useRemoveAttempts } from '../parts/remove';
import { fingerprint, owesInbound, restricts, type HostSupport } from './block';
import { lifecycleBusy, opKey } from './busy';
import { Line } from './Line';
import { checkHold, dismissHold, proofOf, readStatusFresh, refreshStatus, sandboxHold, save, useHost, usePart, useStatus, type SaveOutcome } from './data';
import { isUnconfinedLine, missingFor, type SandboxStatus } from './model';
import { getNote, putNote, swapNote, useNotesVersion, type Shown } from './notes';
import { SandboxEditor, type SentOutcome } from './SandboxEditor';
import css from './SandboxPanel.module.css';
import strings from './strings.en.json';
import { blockLines, partsText } from './words';

type Key = StringKey<typeof strings>;
export { resetSandboxNotesForTests } from './notes';

/** What a Dismiss warning was opened for: the core hold it showed, or the unclear note (by its token). */
type Asked = { hold: string } | { seq: number };

/** `onRestart` is the program's own whole Restart (the page's press path; a sent press answers with its outcome);
 *  `restartHeld` is true while its actions wait (a send of it held, or a sandbox change still out), as for the
 *  header's Restart. */
export function SandboxPanel({ row, onRestart, restartHeld = false }: { row: ProgramRow; onRestart?: () => void | Promise<string | undefined>; restartHeld?: boolean }) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const part = usePart();
  useChangesVersion();
  useNotesVersion();
  const ops = useOps();
  const removes = useRemoveAttempts();
  const edits = useEditAttempts();
  const saved = row.scope !== 'temporary';
  const status = useStatus(row.id, target, saved && !!target);
  const host = useHost(target, saved);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [askRestart, setAskRestart] = useState(false);
  const at = `${part}|${row.key}`;
  const shown = getNote(at);
  // A switch of account, realm, computer or program closes the editor and any warning (opened for another one).
  useEffect(() => {
    setOpen(false);
    setAsked(null);
    setAskRestart(false);
  }, [at]);
  // The program runs now (never a system program: view only). A save that settles while it runs says so once, in
  // its note, decided then: whether a later start or restart has picked the policy up is not something this page
  // can tell, so the note never claims either way afterwards. Restart now is offered only while a restart is
  // possible now, and its question closes when that ends.
  const runningNow = row.scope !== 'system' && stateTest(row, 'running');
  const canRestartNow = !!onRestart && row.can.restart && runningNow;
  useEffect(() => {
    if (askRestart && !canRestartNow) setAskRestart(false);
  }, [askRestart, canRestartNow]);
  // Read when a save or a Check settles, not when it started (an overview refresh may land during its reads): the
  // latest render's state of the same program. One that settles after a switch to another program has only the
  // state it started with. A state the computer did not report counts as running here: the note then offers a
  // restart, which asks first, rather than claiming the save is already in use.
  const settleRunning = row.scope !== 'system' && (runningNow || row.state === 'unknown');
  const live = useRef({ at, running: settleRunning });
  live.current = { at, running: settleRunning };
  const runningAt = (forAt: string, started: boolean) => (live.current.at === forAt ? live.current.running : started);

  if (!saved) return null;
  const name = row.name || t('sb.title');
  const hold = sandboxHold(row.id, target);
  const unclear = shown?.outcome.kind === 'unclear' ? shown : null;
  // A start, stop, restart or boot change of this program still waiting: no sandbox change is sent meanwhile.
  // A removal of this program being sent or not yet known holds the sandbox the same way (parts/remove.ts; `removes`, read above).
  const lifeBusy = lifecycleBusy(target, ops.get(opKey(part, row.key)), row.key, row.id) || removeBusy(removes.get(opKey(part, row.key))) ||
    // So does an edit of it (parts/edit.ts): its save can restart the program.
    editBusy(edits.get(opKey(part, row.key)));
  const blocked = !!hold || !!unclear || lifeBusy;
  // The same, read live (not from this render): a send checks it again after its fresh read.
  const blockedNow = () =>
    !!sandboxHold(row.id, target) || getNote(at)?.outcome.kind === 'unclear' || lifecycleBusy(target, opsStore.get(opKey(part, row.key)), row.key, row.id) ||
    removeBusy(removeStore.get(opKey(part, row.key))) || editBusy(editStore.get(opKey(part, row.key)));

  // Every write names the partition and program it was made for (`at` when the action started).
  const take = (s: SentOutcome, reapply = false) => {
    putNote(at, { ...s, ...(reapply ? { reapply } : {}), ...(s.outcome.kind === 'saved' && runningAt(at, settleRunning) ? { wasRunning: true } : {}) });
    setOpen(false);
    if (s.outcome.kind === 'saved' || s.outcome.kind === 'savedNotApplied') void refreshStatus();
  };

  const st = status.data ?? null;
  // Re-apply sends exactly the stored block as a FRESH read returns it (never a block rebuilt here), and only while
  // that block is the failed save's own (the fingerprint the note names): anything else stored since sends nothing
  // and says so. A failed removal has none to send: the daemon re-applies only an effective policy, so its text
  // says what to do. There is no compare-and-swap on the route; the read just before the send is the condition.
  // While the status is unreadable (a malformed answer), the failed save's own note still offers Re-apply: the
  // press reads fresh and sends nothing unless that read shows the block.
  const again =
    shown?.outcome.kind === 'savedNotApplied' && shown.sentBlock && restricts(shown.sentBlock) && fingerprint(shown.sentBlock) === shown.sentFp && (!st || fingerprint(st.configured) === shown.sentFp)
      ? shown
      : null;
  const reapply = async () => {
    if (!target || !again || blocked || busy) return;
    const from = again.seq;
    setBusy(true);
    const got = await readStatusFresh(row.id, target);
    const stored = got?.status?.configured ?? null;
    if (!got || !got.status || !stored || !restricts(stored) || fingerprint(stored) !== again.sentFp || blockedNow()) {
      setBusy(false);
      const changed = !!got?.status && fingerprint(got.status.configured) !== again.sentFp;
      // Nothing readable (a failed or malformed read): the failed save stays, with Re-apply, and says not sent.
      if (!got?.status) swapNote(at, from, { ...again, reapplyReadFailed: true });
      if (changed) {
        swapNote(at, from, { outcome: { kind: 'refused', text: '', tooLarge: false }, sentFp: again.sentFp, sentBlock: again.sentBlock, beforeFp: again.beforeFp, reapplyChanged: true });
        void refreshStatus();
      }
      return;
    }
    const out = await save({ id: row.id, block: stored, beforeFp: again.sentFp, target });
    setBusy(false);
    take({ outcome: out, sentFp: again.sentFp, sentBlock: stored, beforeFp: again.sentFp }, true);
  };

  const onCheck = async () => {
    if (!target || checking) return;
    setChecking(true);
    // The note this Check started from: a newer outcome that came meanwhile is never replaced.
    const from = shown?.seq;
    const carried = (o: SaveOutcome, base: Pick<SentOutcome, 'sentFp' | 'beforeFp' | 'sentBlock'>, note?: Shown['note']) =>
      swapNote(at, from, { outcome: o, ...base, ...(shown?.reapply ? { reapply: true } : {}), ...(note ? { note } : {}), ...(o.kind === 'saved' && runningAt(at, settleRunning) ? { wasRunning: true } : {}) });
    try {
      if (hold) {
        // The block is this tab's only when its note names the same send (another tab's hold reads as own too).
        const sentFp = hold.identity?.sentFp ?? '';
        const base = { sentFp, beforeFp: hold.identity?.beforeFp ?? '', sentBlock: shown && shown.sentFp === sentFp ? shown.sentBlock : null };
        const v = await checkHold({ id: row.id, target }, hold);
        if (v === 'applied') carried({ kind: 'saved' }, base);
        else if (v === 'savedNotApplied') carried({ kind: 'savedNotApplied', text: '' }, base);
        else carried({ kind: 'pending', hold: hold.hold }, base, v === 'readFailed' ? 'readFailed' : v === 'storedUnconfirmed' ? 'storedUnconfirmed' : 'stillUnknown');
        if (v === 'applied' || v === 'savedNotApplied') void refreshStatus();
      } else if (unclear) {
        const got = await readStatusFresh(row.id, target);
        const base = { sentFp: unclear.sentFp, beforeFp: unclear.beforeFp, sentBlock: unclear.sentBlock };
        if (!got || !got.status) carried(unclear.outcome, base, 'readFailed');
        else {
          const v = proofOf(got.status, unclear.sentFp, unclear.beforeFp);
          if (v === 'applied') carried({ kind: 'saved' }, base);
          else if (v === 'savedNotApplied') carried({ kind: 'savedNotApplied', text: '' }, base);
          else carried(unclear.outcome, base, v === 'storedUnconfirmed' ? 'storedUnconfirmed' : 'stillUnknown');
          if (v !== 'unknown') void refreshStatus();
        }
      }
    } finally {
      setChecking(false);
    }
  };
  // The warned Dismiss frees exactly what the warning was opened for: a hold that replaced it since, or a newer
  // note, stays.
  const onDismissConfirmed = async (a: Asked) => {
    setAsked(null);
    if ('hold' in a) {
      const now = sandboxHold(row.id, target);
      if (!target || !now || now.hold !== a.hold) return;
      const note = getNote(at);
      // The tab's note goes only when it is about this send (an unrelated unclear note stays).
      if ((await dismissHold({ id: row.id, target }, now)) && note && note.sentFp === (now.identity?.sentFp ?? '')) swapNote(at, note.seq, null);
    } else swapNote(at, a.seq, null);
  };
  const onDismiss = () => {
    if (hold?.hold !== undefined) setAsked({ hold: hold.hold });
    else if (unclear) setAsked({ seq: unclear.seq });
  };

  const system = row.scope === 'system';
  const canEdit = !system && !!target && !!st && !blocked;

  return (
    <AnatomySection
      id="sandbox"
      title={t('sb.title')}
      description={t('sb.desc')}
      {...(!system && st ? { actions: { secondary: [{ id: 'sb-edit', label: st.configured ? t('sb.edit') : t('sb.add'), opens: 'dialog' as const, onPress: () => setOpen(true), ...(canEdit ? {} : { disabledReason: t('sb.editOff') }) }] as const } } : {})}
    >
      <Stack gap={3}>
        {/* The outcome and the busy line come first, right under Edit: below a long policy a phone never shows them. */}
        {lifeBusy && !system && <p>{t('sb.lifeBusy')}</p>}
        <SaveNote
          shown={shown}
          hold={hold}
          checking={checking}
          busy={busy}
          onCheck={() => void onCheck()}
          onDismiss={onDismiss}
          onClear={() => swapNote(at, shown?.seq, null)}
          onReapply={again && !blocked ? () => void reapply() : undefined}
          name={name}
          onRestart={canRestartNow ? () => setAskRestart(true) : undefined}
          restartHeld={restartHeld}
        />
        {status.isPending && !st ? (
          <p>{t('sb.chip.checking')}</p>
        ) : !st ? (
          <Band tone="warn" actions={<TextButton onPress={() => void status.refetch()}>{t('sb.retry')}</TextButton>}>
            {status.error ? t('sb.readFailed') : t('sb.malformed')}
          </Band>
        ) : (
          <>
            {status.isError && (
              <Band tone="warn" actions={<TextButton onPress={() => void status.refetch()}>{t('sb.retry')}</TextButton>}>
                {t('sb.staleData')}
              </Band>
            )}
            <StatusBody status={st} row={row} host={host.data ?? null} />
          </>
        )}
        <ConfirmDialog overlayId="programs-sandbox-dismiss"
          isOpen={asked !== null}
          onOpenChange={(o) => !o && setAsked(null)}
          title={t('sb.out.dismissT')}
          body={t('sb.out.dismissBody')}
          confirmLabel={t('sb.out.dismissOk')}
          tone="danger"
          onConfirm={() => {
            if (asked) void onDismissConfirmed(asked);
          }}
        />
        {/* Restart now always asks first (a restart interrupts what the program is doing), and sends only while its
            actions are free, as the header's Restart. */}
        <ConfirmDialog overlayId="programs-sandbox-restart"
          isOpen={askRestart && canRestartNow}
          onOpenChange={(o) => !o && setAskRestart(false)}
          title={t('sb.restartAskT', { name })}
          body={t('sb.restartAskBody', { name })}
          confirmLabel={t('sb.restartAskGo')}
          onConfirm={() => {
            setAskRestart(false);
            if (!onRestart || !canRestartNow || restartHeld) return;
            // The note this restart was asked from closes on the press's known success only; an unknown or failed
            // outcome keeps it (the action's own note says which), and a newer note is never touched.
            const from = getNote(at)?.seq;
            void Promise.resolve(onRestart()).then((outcome) => {
              if (outcome === 'done') swapNote(at, from, null);
            });
          }}
        />
      </Stack>
      {open && target && st && (
        <SandboxEditor
          isOpen
          onOpenChange={setOpen}
          name={name}
          id={row.id}
          target={target}
          stored={st.configured}
          enabled={row.enabled}
          host={host.data ?? null}
          blocked={blocked}
          blockedNow={blockedNow}
          onSent={(s) => take(s)}
        />
      )}
    </AnatomySection>
  );
}

function StatusBody({ status, row, host }: { status: SandboxStatus; row: ProgramRow; host: HostSupport | null }) {
  const t = useStrings(strings);
  const c = status.configured;
  const unconfined = status.problems.filter(isUnconfinedLine);
  const others = status.problems.filter((p) => !isUnconfinedLine(p));
  const missing = row.enabled ? missingFor(status, host) : [];
  const inboundWeak = host?.firewall === 'degraded' && owesInbound(c);
  // Each applies on its own: a turned-off system program with a policy says both.
  const system = row.scope === 'system';
  const off = !row.enabled && !!c;

  const configured = !c ? (
    t('sb.configured.none')
  ) : status.rev === null && !restricts(c) ? (
    t('sb.configured.inactive')
  ) : (
    <ul className={css.lines} aria-label={t('sb.row.configured')}>
      {blockLines(t, c).map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
  // The policy's id is a value to copy, never read out whole: the kit id chip, masked, with its copy button.
  const effective = status.rev !== null ? <IdChip id={String(status.rev)} label={t('sb.effective.revLabel')} /> : c && restricts(c) ? t('sb.effective.notValid') : t('sb.effective.none');
  const live =
    status.firewall === 'degraded'
      ? t('sb.live.degraded')
      : status.firewall === 'draining'
        ? t('sb.live.draining')
        : status.firewall === 'ok'
          ? t('sb.live.ok', { count: status.live.rules.length })
          : t('sb.live.none');

  return (
    <Stack gap={3}>
      {/* One plate for what is true now: a degraded inbound firewall is its one marked phrase; a system or
          turned-off program says what that means for the policy. */}
      {(inboundWeak || system || off) && (
        // A turned-off system program says both in one sentence: view only, and when the policy applies.
        <Verdict label={t('sb.now')}>
          {inboundWeak && <VerdictMark tone="warn">{t('sb.hostFirewall')}</VerdictMark>}
          {inboundWeak && (system || off) ? ' ' : null}
          {system && off ? t('sb.systemOff') : system ? t('sb.system') : off ? t('sb.disabled') : null}
        </Verdict>
      )}
      {/* One Band for what is broken or reported: an earlier copy running unconfined, parts the computer lacks, then the
          computer's own lines. */}
      {(unconfined.length > 0 || missing.length > 0 || others.length > 0) && (
        <Band tone={unconfined.length > 0 || missing.length > 0 ? 'danger' : 'warn'} icon="warn">
          <Stack gap={1}>
            {unconfined.length > 0 && <Line>{t('sb.unconfined')}</Line>}
            {unconfined.map((u) => (
              <span key={u} data-sb-problem>
                {u}
              </span>
            ))}
            {missing.length > 0 && <Line>{t('sb.missing', { parts: partsText(t, missing) })}</Line>}
            {others.length > 0 && <Line>{t('sb.problems')}</Line>}
            {others.map((p) => (
              <span key={p} data-sb-problem>
                {p}
              </span>
            ))}
          </Stack>
        </Band>
      )}
      <Facts
        columns={1}
        label={t('sb.title')}
        items={[
          { label: t('sb.row.configured'), value: configured },
          { label: t('sb.row.effective'), value: effective },
          { label: t('sb.row.live'), value: live },
          { label: t('sb.row.process'), value: t('sb.process.unconfirmed') },
        ]}
      />
      {(status.effective || status.live.tablePresent || status.live.rules.length > 0) && (
        <Disclosure title={t('sb.tech')}>
          <Stack gap={2}>
            {status.effective && status.effective.bwrap.length > 0 && <CodeBlock label={t('sb.tech.launch')} code={status.effective.bwrap.join('\n')} wrap lang="plain" // reason: the launcher's arguments one per line, not a command to run
            />}
            {status.effective && status.effective.scope.length > 0 && <CodeBlock label={t('sb.tech.limits')} code={status.effective.scope.join('\n')} wrap lang="plain" // reason: resource limit settings, data not code
            />}
            {!status.live.tablePresent && <Line>{t('sb.tech.noTable')}</Line>}
            {status.live.chain && <Line>{t('sb.tech.chain', { chain: status.live.chain })}</Line>}
            {status.live.rules.length > 0 && <CodeBlock label={t('sb.tech.rules')} code={JSON.stringify(status.live.rules, null, 2)} wrap lang="json" />}
          </Stack>
        </Disclosure>
      )}
    </Stack>
  );
}

interface SaveNoteProps {
  shown: Shown | null;
  hold: ReturnType<typeof sandboxHold>;
  checking: boolean;
  busy: boolean;
  onCheck: () => void;
  onDismiss: () => void;
  onClear: () => void;
  onReapply: (() => void) | undefined;
  name: string;
  onRestart: (() => void) | undefined;
  restartHeld: boolean;
}

/** The outcome of the last save, where the person sees the policy (C9 words for "may have gone through"). */
function SaveNote({ shown, hold, checking, busy, onCheck, onDismiss, onClear, onReapply, name, onRestart, restartHeld }: SaveNoteProps) {
  const t = useStrings(strings);
  if (hold && !hold.own) return <OutcomeBanner kind="pending" title={t('sb.out.unknownT')} body={t('sb.out.elsewhere')} />;
  const unknownBody = (note?: Shown['note']) => (note ? t(`sb.out.${note}` as Key) : t('sb.out.unknown'));
  if (hold) {
    return (
      <OutcomeBanner
        kind="pending"
        title={t('sb.out.unknownT')}
        body={unknownBody(shown?.note)}
        onCheck={onCheck}
        checking={checking}
        onDismiss={onDismiss}
        dismissWarned
      />
    );
  }
  if (!shown) return null;
  const o: SaveOutcome = shown.outcome;
  if (o.kind === 'unclear') {
    return (
      <OutcomeBanner
        kind="pending"
        title={t('sb.out.unknownT')}
        body={unknownBody(shown.note)}
        onCheck={onCheck}
        checking={checking}
        onDismiss={onDismiss}
        dismissWarned
      />
    );
  }
  if (o.kind === 'saved') {
    if (!shown.wasRunning || shown.reapply) return <OutcomeBanner kind="done" body={shown.reapply ? t('sb.out.reapplied') : t('sb.out.saved')} onDismiss={onClear} />;
    return (
      <Stack gap={2}>
        <OutcomeBanner kind="done" body={t('sb.out.savedRunning', { name })} onDismiss={onClear} />
        {onRestart && (
          <div>
            <Button variant="secondary" onPress={onRestart} isDisabled={restartHeld}>
              {t('sb.restartNow')}
            </Button>
          </div>
        )}
      </Stack>
    );
  }
  if (o.kind === 'savedNotApplied') {
    return (
      <Stack gap={2}>
        {/* A removal is known by the send's own fingerprint: sentBlock null may only mean the block is not held
            here (another tab's save, a reload). */}
        {shown.sentFp === fingerprint(null) ? (
          <OutcomeBanner kind="failed" title={t('sb.out.removeNotAppliedT')} body={o.text ? t('sb.out.removeNotApplied', { text: o.text }) : t('sb.out.removeNotAppliedPlain')} onDismiss={onClear} />
        ) : (
          <OutcomeBanner kind="failed" title={t('sb.out.notAppliedT')} body={o.text ? t('sb.out.notApplied', { text: o.text }) : t('sb.out.notAppliedPlain')} onDismiss={onClear} />
        )}
        {shown.reapplyReadFailed && <OutcomeBanner kind="not_sent" body={t('sb.out.reapplyReadFailed')} />}
        {onReapply && (
          <div>
            <Button variant="secondary" onPress={onReapply} isDisabled={busy}>
              {t('sb.reapply')}
            </Button>
          </div>
        )}
      </Stack>
    );
  }
  // A re-apply's refusal lands here (the editor shows its own).
  if (shown.reapplyChanged) return <OutcomeBanner kind="not_sent" body={t('sb.out.reapplyChanged')} onDismiss={onClear} />;
  if (o.kind === 'refused')
    return (
      <OutcomeBanner
        kind="failed"
        body={o.tooLarge ? t('sb.out.tooLarge') : o.text ? t('sb.out.refused', { text: o.text }) : t('sb.out.refusedPlain')}
        onDismiss={onClear}
      />
    );
  if (o.kind === 'notSent') return <OutcomeBanner kind="not_sent" body={t('sb.out.notSentGeneric')} onDismiss={onClear} />;
  if (o.kind === 'stale') return <OutcomeBanner kind="stale" body={t('sb.out.stale')} onDismiss={onClear} />;
  // 'pending' without a hold: the hold was settled elsewhere (another tab's Check); nothing to show.
  return null;
}
