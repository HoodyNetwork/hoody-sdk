// The Shell row of a terminal's Options: what terminal-N runs now, and Change, which opens the same
// Change shell dialog as the tile menu (parts/ShellDialog.tsx). The row only reads (the computer's sessions, a GET);
// the change, its confirmation and its outcomes are the dialog's. Nothing here goes in the draft or Save.
//
// Contract, in plain words:
//   - It reads the sessions on open, again whenever terminal-N's kept change in shellChanges starts, settles or moves
//     its read generation (so the row never keeps a shell that is gone), and on Read again after a failed read.
//   - While a change of terminal-N is kept (running, or its outcome not known yet) it says so; the dialog has the rest.
//   - onChange null (an ssh tile: its shell is the remote one) or a program's own terminal: no Change. ssh says where
//     it goes; not listed yet keeps Change (the dialog starts it); a failed read says so, Change stays.
import { Button } from '@kit';
import { useEffect, useState } from 'react';
import { readSessions, type TermSession } from '../termSessions';
import type { ShellTarget } from '../parts/shellChange';
import { useShellChange } from '../parts/shellChanges';
import { useT } from './Rows';
import s from './options.module.css';

export function ShellRow({ target, onChange }: { target: ShellTarget; onChange: (() => void) | null }) {
  const t = useT();
  const key = target.computer.id + '/' + target.session;
  const { rec, gen } = useShellChange(key);
  const changing = !!rec;
  const [again, setAgain] = useState(0);
  // One read per (terminal, change generation, kept change or not, Read again); a result is shown only for its own read.
  const readKey = `${key}|${gen}|${changing}|${again}`;
  const [read, setRead] = useState<{ k: string; rows: readonly TermSession[] | 'failed' } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    readSessions(target.computer, ac.signal).then(
      (rows) => { if (!ac.signal.aborted) setRead({ k: readKey, rows }); },
      () => { if (!ac.signal.aborted) setRead({ k: readKey, rows: 'failed' }); },
    );
    return () => ac.abort();
    // readKey names the terminal and why it is read; the computer object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey]);
  const rows = read && read.k === readKey ? read.rows : null;
  const row = rows && rows !== 'failed' ? rows.find((r) => r.n === target.session) : undefined;
  // A program's own terminal has no shell to change (the dialog says so too): no Change here.
  const program = !!row && !row.offered;
  const now = changing
    ? t('shell.changing')
    : rows === null
      ? t('shell.reading')
      : rows === 'failed'
        ? t('shell.failed')
        : !row
          ? t('shell.notListed', { name: target.name })
          : row.ssh
            ? t('shell.ssh', { to: row.ssh })
            : program
              ? t('shell.program')
              : row.shell ?? t('shell.unknown');
  return (
    <div className={s.shellRow} data-opt="shell">
      <span className={s.shellLabel}>{t('shell.label')}</span>
      <span className={s.shellNow}>{now}</span>
      {rows === 'failed' && !changing && (
        <Button variant="ghost" onPress={() => setAgain((n) => n + 1)}>
          {t('shell.readAgain')}
        </Button>
      )}
      {onChange && !program && (
        <Button variant="secondary" onPress={onChange} aria-label={t('shell.changeFor', { name: target.name })}>
          {t('shell.change')}
        </Button>
      )}
    </div>
  );
}
