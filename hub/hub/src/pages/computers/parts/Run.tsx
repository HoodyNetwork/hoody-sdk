// Run tab (the quick command box): the folder, one line, Run, and what the computer printed with its exit
// status. The command runs once on pipes, as the computer's default user, in the folder shown; a lost answer is
// "may have run" and is never sent again by itself. Output is untrusted text, drawn as text only.
import { ActionMenu, AnatomySection, Button, CodeBlock, ComputerMark, ConfirmDialog, OutcomeBanner, PathField, TextField, Why, useStrings, type OutcomeKind, openOutside } from '@kit';
import { usePrefUpdate } from '@core';
import { useEffect, useRef, useState } from 'react';
import { addHistory, historyDoc, check, checkFolder, destructive, isCwdCode, looksSecret, type CwdCode } from '../cmd-logic';
import { subjectOf, useRunCommand } from '../data';
import { BoardAddButton } from '../../board/links';
import { Held } from './Held';
import { asUnknown, useHeldChangeOf } from './runner';
import { pageFaq } from '../faq';
import { bucket } from '../logic';
import { noStartReason } from './menu';
import { useFolderPathReads } from '../snapshots/files';
import strings from '../strings.en.json';
import type { CommandResult, Computer } from '../types';
import { programUrl, temporaryTerminalUrl } from '../urls';
import s from './parts.module.css';

// The last commands per computer: core's account preference (the hub_qcmd_v1 document).
type Doc = { v: 1; c: string[] };
const EMPTY: Doc = { v: 1, c: [] };
const parseHistory = (raw: unknown): Doc => {
  const o = raw as { v?: unknown; c?: unknown } | null;
  return o?.v === 1 && Array.isArray(o.c) ? { v: 1, c: o.c.filter((x): x is string => typeof x === 'string') } : EMPTY;
};

// `sent`: the folder the run asked for, which the result's own folder is compared with.
type Shown = { kind: 'none' } | { kind: 'running' } | { kind: 'result'; result: CommandResult; sent: string } | { kind: 'outcome'; outcome: OutcomeKind; error?: unknown };

// The Folder per computer for this visit of the app (never stored): switching computers brings back that computer's
// last folder, else the top folder.
const folders = new Map<string, string>();
const FOLDER_REFUSED = { INVALID_CWD: 'run.folder.refused.missing', CWD_PERMISSION_DENIED: 'run.folder.refused.denied', CWD_PREPARE_FAILED: 'run.folder.refused.failed' } as const satisfies Record<CwdCode, string>;
/** The program's refusal of a folder: kept with the folder and the computer it was about. */
type Refused = { code: CwdCode; cwd: string; computer: string };

export function Run({ c, canStart, onStart, onCheck }: { c: Computer; canStart: boolean; onStart: () => void; onCheck: () => void }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const onLine = t('run.confirm.on', { name: '\u0001' }).split('\u0001');
  const run = useRunCommand();
  const running = bucket(c.status) === 'running';
  // The band's own held change: its hold token is what Dismiss frees (this render's, never read at press time).
  const heldChange = useHeldChangeOf('computer.run', (i) => i.computer === c.id);
  const held = heldChange ? ((heldChange.identity ?? {}) as Record<string, unknown>) : null;
  const [text, setText] = useState('');
  // The Folder field's text, written from the top folder (PathField shows the "/" before it).
  const [folder, setFolderText] = useState(() => folders.get(c.id) ?? '');
  const [refused, setRefused] = useState<Refused | null>(null);
  const reads = useFolderPathReads(c);
  useEffect(() => {
    setFolderText(folders.get(c.id) ?? '');
  }, [c.id]);
  function setFolder(v: string) {
    folders.set(c.id, v);
    setFolderText(v);
  }
  const folderChecked = checkFolder(folder);
  // A refusal shows only while the field holds the folder it refused, on that computer: one that comes back after the
  // field changed is about a folder no longer shown.
  const refusedHere = refused && refused.computer === c.id && folderChecked.ok && folderChecked.cwd === refused.cwd ? refused : null;
  // Every change is a function of the value core holds (usePrefUpdate): a clear and a send, or two tabs, compose
  // instead of one writing back a list it read earlier. A list the browser refused to store is core's page-only value
  // (prefs.ts), which core also drops when the account or this browser's settings end: the page keeps no copy.
  const { value: stored, update } = usePrefUpdate<Doc>('hub_qcmd_v1', parseHistory, { scope: 'account+computer', part: c.id });
  const history = stored.c;
  function changeHistory(fn: (list: readonly string[]) => string[]) {
    update((d) => historyDoc(fn(d.c)));
  }
  const [shown, setShown] = useState<Shown>({ kind: 'none' });
  // What a run ended as is said under the output, which may be below the fold (a short window, a terminal): when an
  // answer arrives (a result, or that it failed, was not sent or may have gone through) its row is brought into view,
  // by the nearest edge, so a run never ends looking as if nothing happened. Focus stays where it is; nothing else
  // (typing, hovering, a held change found on arrival) scrolls.
  const statusRow = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (shown.kind === 'result' || shown.kind === 'outcome') statusRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [shown]);
  // The destructive command's question keeps the command and folder of the press: confirming sends exactly those.
  const [confirm, setConfirm] = useState<{ command: string; cwd: string } | null>(null);
  const [clearAsk, setClearAsk] = useState(false);
  const checked = check(text);
  // The full terminal is a temporary one: a new session that closes after its window does. The Board button keeps a
  // numbered terminal that stays.
  const terminal = temporaryTerminalUrl(c);
  const boardTerminal = programUrl(c, 'terminal');

  // One run out at a time from this tab: a second press that lands before the first render (a confirm pressed twice)
  // is dropped here, so it never asks core for a second send and never writes "not sent" over the run that is out.
  const out = useRef(false);
  async function send(command: string, cwd: string) {
    if (out.current) return;
    out.current = true;
    try {
      await sendOnce(command, cwd);
    } finally {
      out.current = false;
    }
  }
  async function sendOnce(command: string, cwd: string) {
    setShown({ kind: 'running' });
    setRefused(null);
    // Kept before the send's answer: a Clear while it runs is never undone by it.
    changeHistory((list) => addHistory(list, command));
    const r = asUnknown(await run.mutateAsync({ ...subjectOf(c), command, cwd }).catch(() => ({ outcome: 'pending' as OutcomeKind, code: undefined, data: undefined })));
    // A refused folder is the program's answer before anything ran: a definite failure. A 5xx naming the same code
    // proves nothing (core holds every 5xx as may-have-run), so it stays the held "may have run".
    if (r.outcome === 'failed' && isCwdCode(r.code)) setRefused({ code: r.code, cwd, computer: c.id });
    if (r.outcome === 'done' && r.data) setShown({ kind: 'result', result: r.data as CommandResult, sent: cwd });
    else setShown({ kind: 'outcome', outcome: r.outcome === 'done' ? 'pending' : r.outcome, ...(r.outcome === 'failed' ? { error: r } : {}) });
  }

  /** Empties this computer's list (the same per-computer preference); a refused store keeps it empty for this visit. */
  function clearHistory() {
    changeHistory(() => []);
  }

  function submit() {
    if (!running || held || shown.kind === 'running' || !checked.ok || !folderChecked.ok) return;
    if (destructive(checked.command)) setConfirm({ command: checked.command, cwd: folderChecked.cwd });
    else void send(checked.command, folderChecked.cwd);
  }

  return (
    <div className={s.stack}>
      {!running ? (
        <OutcomeBanner
          kind="stale"
          title={t('run.stopped', { name: c.name })}
          body={
            canStart ? (
              <Button size="sm" variant="primary" icon="play" onPress={onStart}>
                {t('menu.start')}
              </Button>
            ) : (
              noStartReason(c, t)
            )
          }
        />
      ) : null}

      <PathField
        label={t('run.folder')}
        value={folder}
        onChange={(v) => setFolder(v.replace(/^\/+/, ''))}
        read={reads}
        mode="folder"
        rootLabel="/"
        computerName={c.name}
        isDisabled={!running}
        {...(refusedHere ? { errorMessage: t(FOLDER_REFUSED[refusedHere.code], { name: c.name }) } : !folderChecked.ok ? { errorMessage: t(`run.folder.invalid.${folderChecked.why}`) } : {})}
      />
      <div className={s.runRow}>
        <TextField
          aria-label={t('run.label')}
          placeholder={t('run.placeholder')}
          mono
          value={text}
          onChange={setText}
          isDisabled={!running}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          isInvalid={!checked.ok && text.trim() ? true : undefined}
          suffix={
            <ActionMenu
              size="sm"
              label={t('run.history')}
              icon="clock"
              items={
                history.length
                  ? [
                      ...history.map((h, i) => ({ id: `h${i}`, label: h.length > 70 ? `${h.slice(0, 69)}…` : h, onAction: () => setText(h) })),
                      '-' as const,
                      { id: 'clear', label: t('run.historyClear'), icon: 'trash' as const, tone: 'danger' as const, opens: true, onAction: () => setClearAsk(true) },
                    ]
                  : [{ id: 'none', label: t('run.historyEmpty'), isDisabled: true, disabledReason: t('run.historyEmptyWhy'), onAction: () => undefined }]
              }
            />
          }
        />
        <Button variant={shown.kind === 'outcome' && shown.outcome === 'pending' ? 'secondary' : 'primary'} icon="play" busy={shown.kind === 'running'} isDisabled={!running || !checked.ok || !folderChecked.ok} onPress={submit}>
          {t('run.go')}
        </Button>
      </div>
      <p className={s.help}>{!checked.ok && text.trim() ? t(`run.invalid.${checked.why}`) : text && looksSecret(text) ? t('run.secretHint') : t('run.hint')}</p>

      <div className={s.outputs}>
        <div className={s.outputPanel}>
          {shown.kind === 'result' ? (
            <>
              {shown.result.out ? <CodeBlock code={shown.result.out} label={t('run.stdout')} wrap lang="ansi" /> : null}
              {shown.result.err ? <CodeBlock code={shown.result.err} label={t('run.stderr')} wrap lang="ansi" /> : null}
              {!shown.result.out && !shown.result.err ? <p className={s.faint}>{t('run.noOutput')}</p> : null}
            </>
          ) : shown.kind === 'outcome' && shown.outcome === 'pending' ? (
            <p className={s.faint}>{t('run.noOutputCame')}</p>
          ) : (
            <p className={s.faint}>{t('run.outputEmpty')}</p>
          )}
        </div>
        {/* Dismiss names this computer (the lock is per computer): with no variables core would take only the
            current computer's change. Another page's change is never this page's to forget. */}
        <div ref={statusRow}>
          {held ? <Held kind="run" name={c.name} onCheck={async () => { await run.readBack().catch(() => false); onCheck(); }} onDismiss={async () => { const hold = heldChange?.hold; if (!hold) return; const v = { ...subjectOf(c), command: '', cwd: '' }; if (await run.heldByOther(v).catch(() => true)) return; await run.dismiss(v, hold); setShown({ kind: 'none' }); }} /> : <RunStatus shown={shown} onCheck={async () => { if (await run.readBack().catch(() => false)) setShown({ kind: 'none' }); onCheck(); }} />}
        </div>
      </div>

      {/* The temporary terminal is a kit section. How long it lasts, said before it is opened, is its description. */}
      <AnatomySection id="run-terminal" title={t('run.terminalTitle')} description={t('run.terminalLife')}>
        <div className={s.row}>
          <Button size="sm" variant="secondary" iconEnd="external" isDisabled={!running || !terminal} onPress={() => openOutside(terminal)}>
            {t('run.openTerminal')}
          </Button>
          {/* A new terminal on the Board: the Board gives it the next free number when it takes the link. */}
          <BoardAddButton computer={subjectOf(c)} program="terminal" session="new" what={t('program.terminal')} labelled isDisabled={!running || !boardTerminal} />
        </div>
        {/* The rest of how a terminal lasts, folded: its answer ends with the page's question about shells. */}
        <Why question={t('run.terminalMore')} faq={{ item: byId.sshAndTerminal, label: t('run.terminalFaq') }}>
          {t('run.terminalWhy')}
        </Why>
      </AnatomySection>

      <ConfirmDialog overlayId="computers-run-confirm"
        isOpen={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('run.confirm.title')}
        body={
          <>
            {/* Which computer the command runs on, with its colour mark between "On" and the name (the name always
                stays beside the mark). The template is split at the name so the mark sits where the name starts. */}
            <div className={s.idRow}>
              {onLine[0]}
              {/* One non-wrapping unit: a long name wraps inside it, never away from the mark. */}
              <span className={s.markedName}>
                <ComputerMark color={c.color} size="md" />
                <strong>{c.name}</strong>
              </span>
              {onLine[1]}
            </div>
            <div>{t('run.confirm.body', { name: c.name })}</div>
          </>
        }
        confirmLabel={t('run.go')}
        tone="danger"
        onConfirm={() => {
          const ask = confirm;
          setConfirm(null);
          if (ask) void send(ask.command, ask.cwd);
        }}
      >
        <CodeBlock code={confirm?.command ?? ''} label={t('run.label')} wrap lang="shell" />
        <CodeBlock code={confirm?.cwd ?? ''} label={t('run.folder')} wrap lang="plain" // reason: a folder path, not code
        />
      </ConfirmDialog>

      <ConfirmDialog overlayId="computers-run-history-clear"
        isOpen={clearAsk}
        onOpenChange={setClearAsk}
        title={t('run.historyClear.title')}
        body={t('run.historyClear.body', { name: c.name })}
        confirmLabel={t('run.historyClear.go')}
        tone="danger"
        onConfirm={() => {
          setClearAsk(false);
          clearHistory();
        }}
      />
    </div>
  );
}

function RunStatus({ shown, onCheck }: { shown: Shown; onCheck: () => void | Promise<void> }) {
  const t = useStrings(strings);
  if (shown.kind === 'none') return <p className={s.runStatus} />;
  if (shown.kind === 'running') return <p className={s.runStatus} role="status">{t('run.running')}</p>; // reason: one-line running hint
  if (shown.kind === 'outcome') {
    return shown.outcome === 'pending' ? (
      <OutcomeBanner kind="pending" title={t('run.unknownShort')} body={t('run.unknown.body')} onCheck={onCheck} />
    ) : (
      <OutcomeBanner kind={shown.outcome} title={shown.outcome === 'failed' ? t('run.failed') : t('run.notSent')} error={shown.error} />
    );
  }
  const r = shown.result;
  const ok = r.state === 'exit' && r.code === 0;
  return (
    <p className={s.runStatus} role="status"> {/* reason: one-line exit summary */}
      <strong className={ok ? undefined : s.dangerText}>{ok ? t('run.exit.ok') : r.state === 'timeout' ? t('run.exit.timeout') : r.state === 'signal' ? t('run.exit.signal', { signal: r.signal }) : t('run.exit.code', { code: r.code ?? '?' })}</strong>
      {/* How long it took and where it ran: the folder the program reports, said against the one asked for. */}
      <span className={s.faint}>{[r.time, r.cwd === null ? t('run.folder.unreported') : r.cwd === shown.sent ? t('run.ranIn', { cwd: r.cwd }) : t('run.ranInAsked', { cwd: r.cwd, sent: shown.sent })].filter(Boolean).join(' · ')}</span>
      {r.outCut || r.errCut ? <span className={s.faint}>{t('run.cut')}</span> : null}
    </p>
  );
}
