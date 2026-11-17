// Export vault: every entry of ONE partition in one file (exportVault.ts). Encrypted is the default (a password typed
// twice; names and metadata stay readable); Readable asks a danger confirm before anything is read.
// The passwords live only in this dialog's state: never prefilled, cleared on every press, on a mode change and on
// close. The read values live only in the run; a file with entries left out waits for an explicit Save file, held in a
// ref that a close or a new run drops. Nothing here logs or toasts a value; the page says the download started (the
// browser may still be asked where to save it, or refuse), never that the file was saved.
import { Band, ConfirmDialog, RadioGroup, SecretInput, Stack, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { canEncrypt } from '../crypto';
import { exportFileName, runExport, saveExport, type ExportMode, type ExportProgress, type ExportRun } from '../exportVault';
import type { Partition } from '../logic';
import strings from '../strings.en.json';

export interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  partition: Partition;
  partitionName: string;
  /** A file was handed to the browser as a download (not known to be saved): its name and how many entries it holds. */
  onSaved: (file: string, count: number) => void;
  /** Tests: the clock the file name uses. */
  now?: () => Date;
}

type FileRun = Extract<ExportRun, { ok: true }>;

/** The left-out entries named in the warning: the first few by name, then "and N more". */
const LEFT_NAMES = 5;
function leftNames(names: readonly string[], more: string): string {
  const shown = names.slice(0, LEFT_NAMES).join(', ');
  return names.length > LEFT_NAMES ? `${shown} ${more}` : shown;
}

export function ExportDialog({ isOpen, onOpenChange, partition, partitionName, onSaved, now = () => new Date() }: ExportDialogProps) {
  const t = useStrings(strings);
  const cryptoOk = canEncrypt();
  const [mode, setMode] = useState<ExportMode>('encrypted');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwRefused, setPwRefused] = useState<'required' | 'mismatch' | null>(null);
  const [askReadable, setAskReadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [locking, setLocking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A finished read with entries left out: the text waits here for Save file (never in state, never rendered).
  const held = useRef<FileRun | null>(null);
  const [heldInfo, setHeldInfo] = useState<{ failed: readonly string[]; gone: number } | null>(null);
  const run = useRef<AbortController | null>(null);

  const reset = () => {
    run.current?.abort();
    run.current = null;
    held.current = null;
    setHeldInfo(null);
    setPassword('');
    setRepeat('');
    setPwRefused(null);
    setAskReadable(false);
    setBusy(false);
    setProgress(null);
    setLocking(false);
    setProblem(null);
  };
  // Closing (Cancel, Escape, outside press, the page closing it) stops a run and drops everything typed or read.
  useEffect(() => {
    if (!isOpen) {
      reset();
      setMode('encrypted');
    }
  }, [isOpen]);
  // A partition change while open: what was read belongs to the old one.
  useEffect(() => reset, [partition]);

  const save = (r: FileRun) => {
    const file = exportFileName(partitionName, now());
    saveExport(r.text, file);
    held.current = null;
    onOpenChange(false);
    onSaved(file, r.count);
  };

  const start = async (m: ExportMode, pw: string) => {
    // Claimed before anything else: a second confirm before React renders (busy is state) must not start a second run.
    if (run.current) return;
    const ac = new AbortController();
    run.current = ac;
    held.current = null;
    setHeldInfo(null);
    setProblem(null);
    setBusy(true);
    setProgress(null);
    setLocking(false);
    let r: ExportRun | null = null;
    try {
      r = await runExport(partition, {
        mode: m,
        password: pw,
        signal: ac.signal,
        onProgress: (p) => {
          if (run.current !== ac) return;
          setProgress(p);
          if (m === 'encrypted' && p.done === p.total && p.waiting === 0) setLocking(true);
        },
      });
    } catch {
      r = null; // a failure the run did not turn into a result: shown as a fixed message below, never its text
    }
    if (run.current !== ac) return; // closed or restarted meanwhile: this run's result is dropped
    run.current = null;
    setBusy(false);
    setProgress(null);
    setLocking(false);
    if (r === null) {
      setProblem(t('export.failed'));
      return;
    }
    if (r.ok) {
      if (r.failed.length === 0 && r.gone === 0) save(r);
      else {
        held.current = r;
        setHeldInfo({ failed: r.failed, gone: r.gone });
      }
      return;
    }
    if (r.why === 'cancelled') return;
    setProblem(
      r.why === 'crypto'
        ? t('export.noCrypto')
        : r.why === 'refused'
          ? t('export.refused')
          : t(`export.${r.why}`),
    );
  };

  const press = () => {
    if (busy) return;
    if (held.current) return save(held.current);
    // Every press clears both password fields, whatever happens next; the checks read the snapshot.
    const pw = mode === 'encrypted' ? password : '';
    const again = mode === 'encrypted' ? repeat : '';
    setPassword('');
    setRepeat('');
    if (mode === 'readable') {
      setAskReadable(true);
      return;
    }
    const why = !pw ? 'required' : pw !== again ? 'mismatch' : null;
    setPwRefused(why);
    if (why || !cryptoOk) return;
    void start('encrypted', pw);
  };

  const status = locking
    ? t('export.locking')
    : progress && progress.waiting > 0
      ? t('export.waiting', { seconds: progress.waiting })
      : progress
        ? t('export.reading', { done: progress.done, total: progress.total })
        : null;
  const pwErr = mode === 'encrypted' && pwRefused === 'required' && !password ? t('password.required') : undefined;
  const repeatErr = mode === 'encrypted' && pwRefused === 'mismatch' && !password && !repeat ? t('password.mismatch') : undefined;

  return (
    <>
      <ConfirmDialog
        overlayId="vault-export"
        isOpen={isOpen && !askReadable}
        onOpenChange={(open) => {
          if (!open) onOpenChange(false);
        }}
        title={t('export.title', { partition: partitionName })}
        body={t('export.body', { partition: partitionName })}
        confirmLabel={heldInfo ? t('export.save') : t('export.confirm')}
        // Not `busy`: the kit refuses to close a busy dialog (a write in flight), and an export only reads, so Cancel and
        // Escape stay live while it runs and stop it. Only the primary button waits.
        confirmDisabled={busy || (!heldInfo && mode === 'encrypted' && !cryptoOk)}
        onConfirm={press}
      >
        <Stack gap={3}>
          <RadioGroup<ExportMode>
            label={t('export.mode')}
            value={mode}
            isDisabled={busy || !!heldInfo}
            onChange={(m) => {
              setMode(m);
              setPassword('');
              setRepeat('');
              setPwRefused(null);
            }}
            options={[
              { value: 'encrypted', label: t('export.encrypted'), description: cryptoOk ? t('export.encryptedDesc') : t('export.noCrypto') },
              { value: 'readable', label: t('export.readable'), description: t('export.readableDesc') },
            ]}
          />
          {mode === 'encrypted' && cryptoOk && !heldInfo && (
            <>
              <SecretInput label={t('export.password')} value={password} onChange={setPassword} errorMessage={pwErr} resetKey={partition} isDisabled={busy} />
              <SecretInput label={t('export.repeat')} value={repeat} onChange={setRepeat} errorMessage={repeatErr} resetKey={partition} isDisabled={busy} />
            </>
          )}
          {status && <Band tone="neutral">{status}</Band>}
          {heldInfo && (
            <Band tone="warn" /* noDetails: the names and counts of entries left out, no rejection to show */>
              {[
                heldInfo.failed.length ? t('export.left', { count: heldInfo.failed.length }) : '',
                heldInfo.failed.length ? t('export.leftNames', { names: leftNames(heldInfo.failed, t('export.more', { count: heldInfo.failed.length - LEFT_NAMES })) }) : '',
                heldInfo.gone ? t('export.gone', { count: heldInfo.gone }) : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </Band>
          )}
          {problem && <Band tone="warn" /* noDetails: the run keeps only the refusal's category */>{problem}</Band>}
        </Stack>
      </ConfirmDialog>
      <ConfirmDialog
        overlayId="vault-export-readable"
        isOpen={isOpen && askReadable}
        onOpenChange={(open) => {
          if (!open) setAskReadable(false);
        }}
        tone="danger"
        title={t('export.readableTitle')}
        body={t('export.readableBody')}
        confirmLabel={t('export.readableConfirm')}
        onConfirm={() => {
          setAskReadable(false);
          void start('readable', '');
        }}
      />
    </>
  );
}
