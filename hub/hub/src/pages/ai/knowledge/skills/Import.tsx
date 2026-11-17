// AI → Knowledge → Skills → Import: copy skills that Claude Code or Codex keep on this computer into
// this realm's skills. Scan → read each one (its description, files, the commands it runs once trusted, files that look like
// secrets) → Import it. One skill per request, each sent once: the agent answers each skill's own result, and a lost answer
// is held until the list shows that folder with this import's record and a new install time, or Stop waiting (C9). An imported
// skill lands off and not trusted, said before and after. No path is sent: the agent finds the folder again itself.
// Each skill is one kit ItemList row: its state as one pill (cannot be read > check first > built in), what it brings
// as facts, Import, Replace or Open it as the row's action; its commands and files in one Disclosure under it, then the C9
// outcomes of its import.
import { Band, CodeBlock, ConfirmDialog, Disclosure, Drawer, EmptyState, ErrorState, ItemList, Outcome, SegmentedControl, Skeleton, Stack, TextButton, useStrings, type Fact, type ItemProps } from '@kit';
import { refusal } from '@core';
import { useState } from 'react';
import { type SkillsAt, useImport, useImportScan, usePress, useSkills } from './data';
import { fromImport, importable, installTimes, newSince, recordedRow, rootOf, takenIn, WRITE_ROOT, type ImportEntry, type ImportResult, type ImportSource } from './logic';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const TOOLS: readonly ImportSource[] = ['claude', 'codex'];

export function SkillImport({ at, isOpen, onOpenChange, onOpen }: { at: SkillsAt; isOpen: boolean; onOpenChange: (open: boolean) => void; onOpen: (id: string) => void }) {
  const t = useStrings(strings);
  // Claude Code first (the scan is only a read of that tool's folder).
  const [tool, setTool] = useState<ImportSource>('claude');
  return (
    <Drawer resizeKey="ai-skill-import" isOpen={isOpen} onOpenChange={onOpenChange} title={t('imp.title')} subtitle={t('imp.subtitle')} size="md">
      <SegmentedControl
        label={t('imp.tool')}
        value={tool}
        onChange={(k) => setTool(k === 'codex' ? 'codex' : 'claude')}
        items={TOOLS.map((s) => ({ id: s, label: t(`imp.tool.${s}`) }))}
      />
      <Band
        // noDetails: advice before an import, not a rejection.
        tone="warn"
        icon="lock"
      >
        {t('imp.lands')}
      </Band>
      <Found key={tool} at={at} tool={tool} t={t} onOpen={onOpen} />
    </Drawer>
  );
}

function Found({ at, tool, t, onOpen }: { at: SkillsAt; tool: ImportSource; t: T; onOpen: (id: string) => void }) {
  const scan = useImportScan(at, tool);
  if (scan.isPending) return <Skeleton rows={4} />;
  if (scan.error) return <ErrorState error={scan.error} onRetry={() => void scan.refetch()} size="compact" />;
  if (!scan.data) return (
    <ErrorState
      // noDetails: the read answered, but without a list; there is no rejection to pass.
      title={t('imp.badScan')}
      onRetry={() => void scan.refetch()}
      size="compact"
    />
  );
  if (scan.data.length === 0) return <EmptyState icon="sparkle" title={t('imp.none')} body={t(`imp.where.${tool}`)} size="sm" />;
  return (
    <>
      <p>{t(`imp.where.${tool}`)}</p>
      {scan.data.map((e) => <Entry key={e.relDir} at={at} e={e} t={t} onOpen={onOpen} />)}
    </>
  );
}

function Entry({ at, e, t, onOpen }: { at: SkillsAt; e: ImportEntry; t: T; onOpen: (id: string) => void }) {
  const list = useSkills(at);
  const run = useImport(at, e.destRelDir);
  const [asked, setAsked] = useState<'replace' | 'stop' | null>(null);
  const held = run.outcome?.kind === 'pending';
  // A skill already in the folder it lands in: importing replaces it (overwrite), only after a warning.
  const taken = takenIn(list.data, e.destRelDir);
  // As an install: the folder's install times are read fresh at the press, from a whole list; anything less sends nothing.
  const [readFailed, setReadFailed] = useState(false);
  const [notTaken, setNotTaken] = useState(false);
  // This folder's last press from this page, kept across switching tools or leaving (data.ts usePress).
  const [press, setPress] = usePress(at, 'import', e.destRelDir);
  const send = async (overwrite: boolean) => {
    setReadFailed(false);
    setNotTaken(false);
    const fresh = await list.refetch();
    if (fresh.error || !fresh.data?.complete) { setReadFailed(true); return; }
    // A Replace confirmed on an older list: the folder must still hold a skill, else nothing is sent (it may now be other files).
    if (overwrite && !takenIn(fresh.data, e.destRelDir)) { setNotTaken(true); return; }
    const before = installTimes(fresh.data, e.destRelDir);
    setPress({ before, unknown: false });
    const r = await run.run({ ...at, source: e.source, relDir: e.relDir, dest: e.destRelDir, overwrite, before });
    // Answered without this skill's result: unknown, recorded here (the press store outlives this entry, so an answer that comes
    // after the entry was left still holds the folder).
    if (r.outcome === 'done' && (r.data ?? null) === null) setPress({ before, unknown: true });
  };
  const ok = importable(e);
  // The answer core settled: this skill's own result, or null when the agent answered without it (it may have been imported).
  const result = run.outcome?.kind === 'done' ? ((run.outcome.data ?? null) as ImportResult | null) : undefined;
  // A lost or result-less answer proved by the list (this import's untampered record with an install time not there at the press).
  const row = recordedRow(list.data, e.destRelDir, fromImport(e.source, e.relDir));
  const proved = !!press && !held && !run.busy && (run.outcome === undefined || result === null) && newSince(row, press.before);
  // Unknown until proved or the person stops waiting: nothing more is sent for this folder meanwhile.
  const unknown = !proved && (result === null || press?.unknown === true);
  const busy = run.busy || held || unknown || list.data === undefined;
  const answered: ImportResult | undefined = result ? result : proved ? { ok: true, name: '', kind: '' } : undefined;
  const row0 = list.data?.items.find((r) => r.root === WRITE_ROOT && r.relDir === e.destRelDir && !r.origin?.tampered && r.origin?.provider === e.source && r.origin.refSource === e.relDir);
  // Its one state: cannot be read, then what to check before importing, then built into Codex (a meta note when not shown).
  const warn = e.sensitive.length > 0 || e.commands.length > 0;
  const status: ItemProps['status'] = e.parseErr
    ? { tone: 'danger', label: t('imp.st.broken') }
    : warn
      ? { tone: 'warn', label: t('imp.st.check') }
      : e.system
        ? { tone: 'neutral', label: t('imp.system') }
        : undefined;
  const facts: Fact[] = [
    ...(e.parseErr ? [{ label: t('imp.f.file'), value: t('imp.broken'), wide: true }] : []),
    ...(e.description ? [{ label: t('imp.f.about'), value: e.description, wide: true }] : []),
    // The folder in a sentence, never alone: a bare folder name reads as the skill's own name.
    ...(ok ? [{ label: t('imp.f.into'), value: t('imp.into', { folder: e.destRelDir }) }] : []),
    ...(e.collision ? [{ label: t('imp.f.collision'), value: t('imp.collision', { where: t(`where.${rootOf(e.collision)}`) }), wide: true }] : []),
    ...(e.sensitive.length > 0 ? [{ label: t('imp.f.sensitive'), value: t('imp.sensitive', { files: e.sensitive.join(', ') }), wide: true }] : []),
    ...(e.commands.length > 0 ? [{ label: t('hub.commandsLabel'), value: t('hub.commands', { count: e.commands.length }), wide: true }] : []),
  ];
  // Why the action waits: this skill's own import, else the skills list it reads first.
  const importing = run.busy || held || unknown;
  const wait = busy ? { disabledReason: importing ? t('imp.busy') : t('imp.listReading') } : {};
  const action: ItemProps['actions'] =
    answered?.ok === true
      ? row0
        ? { inline: [{ id: `open-${e.relDir}`, label: t('hub.openIt'), onPress: () => onOpen(row0.id) }] }
        : undefined
      : !ok
        ? undefined
        : taken
          ? { inline: [{ id: `replace-${e.relDir}`, label: t('hub.replace'), tone: 'danger', opens: 'dialog', onPress: () => setAsked('replace'), ...wait }] }
          : { inline: [{ id: `import-${e.relDir}`, label: t('imp.go'), onPress: () => void send(false), ...wait }] };
  const item: ItemProps = {
    id: e.relDir,
    title: e.name,
    ...(status ? { status } : {}),
    ...(e.system && status?.label !== t('imp.system') ? { meta: [t('imp.system')] as const } : {}),
    ...(facts.length > 0 ? { details: facts } : {}),
    ...(action ? { actions: action } : {}),
  };
  return (
    <Stack gap={2}>
      <ItemList label={e.name} items={[item]} />
      {(e.commands.length > 0 || e.files.length > 0) && (
        <Disclosure title={e.commands.length > 0 ? t('imp.cmdsFiles', { count: e.files.length }) : t('imp.files', { count: e.files.length })}>
          {e.commands.length > 0 && <CodeBlock label={t('hub.commandsLabel')} code={e.commands.join('\n')} wrap lang="shell" />}
          {e.files.length > 0 && (
            <CodeBlock label={t('imp.filesLabel')} code={e.files.join('\n')} wrap lang="plain" // reason: the file paths of the imported skill
            />
          )}
        </Disclosure>
      )}
      {readFailed && (
        <Outcome
          // noDetails: nothing was sent; the list could not be read first.
          outcome={{ kind: 'not_sent' }}
          detail={t('add.readFirst')}
        />
      )}
      {notTaken && (
        <Outcome
          // noDetails: nothing was sent; the folder no longer holds a skill.
          outcome={{ kind: 'not_sent' }}
          detail={t('add.notTaken', { folder: e.destRelDir })}
        />
      )}
      {unknown && (
        <>
          <Outcome
            // noDetails: the request was answered without this skill's result; there is no rejection. Check again reads the list.
            outcome={{ kind: 'pending' }}
            onCheck={async () => { await list.refetch(); }}
            detail={t('imp.noResult')}
          />
          <TextButton onPress={() => setAsked('stop')}>{t('use.dismiss')}</TextButton>
        </>
      )}
      {answered?.ok === true && (
        <Outcome
          // noDetails: a done import has no rejection.
          outcome={{ kind: 'done' }}
          doneText={t('imp.done', { name: answered.name || e.name })}
        />
      )}
      {answered && !answered.ok && (
        <Outcome
          // noDetails: the agent's result for this one skill, not a refusal of the request; its own text is never shown (Errors rule).
          outcome={{ kind: 'failed' }}
          detail={answered.kind === 'exists' ? t('imp.exists', { folder: e.destRelDir }) : answered.kind === 'dup_in_batch' ? t('imp.dupInBatch') : t('imp.failedPlain')}
        />
      )}
      {held && (
        <>
          <Outcome
            // noDetails: an import whose answer never came has no rejection; Check again reads the skills list.
            outcome={run.outcome}
            onCheck={run.check}
            detail={run.elsewhere ? t('imp.heldElsewhere') : t('imp.held', { name: e.name })}
          />
          {!run.elsewhere && <TextButton onPress={() => setAsked('stop')}>{t('use.dismiss')}</TextButton>}
        </>
      )}
      {run.outcome && run.outcome.kind !== 'pending' && run.outcome.kind !== 'done' && <Outcome outcome={run.outcome} error={refusal(run.outcome)} />}
      <ConfirmDialog
        isOpen={asked === 'replace'}
        onOpenChange={(o) => { if (!o) setAsked(null); }}
        tone="danger"
        title={t('hub.replaceTitle', { folder: e.destRelDir })}
        body={t('imp.replaceBody', { folder: e.destRelDir })}
        confirmLabel={t('hub.replace')}
        onConfirm={() => { setAsked(null); void send(true); }}
      />
      <ConfirmDialog
        isOpen={asked === 'stop'}
        onOpenChange={(o) => { if (!o) setAsked(null); }}
        title={t('use.dismissTitle')}
        body={t('use.dismissBody')}
        confirmLabel={t('use.dismiss')}
        onConfirm={() => {
          setAsked(null);
          // A result-less answer has no hold in core (its request was answered): stopping only forgets it here.
          if (unknown && !held) { if (press) setPress({ ...press, unknown: false }); run.reset(); return; }
          void run.dismiss();
        }}
      />
    </Stack>
  );
}
