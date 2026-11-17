// Edit a program the person added (its name and its command): the page's one hook (the ask, the save, Check again,
// Dismiss), the drawer and the note of an edit that is not settled. The rules of the send are edit.ts's.
// A refusal stays in the drawer, where the person fixes it; a save that reached the computer, or may have, closes it.
import { useChangesVersion, type Target } from '@core';
import { Band, Button, ConfirmDialog, Drawer, Outcome, OutcomeBanner, Spinner, Stack, TextButton, TextField, Verdict, showToast, useStrings } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Row } from '../logic';
import { EMPTY_ADD, checkAdd } from '../sandbox/addform';
import { editOut } from '../sandbox/busy';
import { daemonText } from '../sandbox/data';
import sbStrings from '../sandbox/strings.en.json';
import strings from '../strings.en.json';
import { checkEdit, dismissEditAttempt, editBusy, editHolds, editStore, readEditable, runEdit, useEditAttempts, type EditAttempt, type Editable } from './edit';
import { opKey } from './ops';

/** The drawer, bound to what it was opened for: the partition (account, realm, computer), the computer itself and
 *  the program by id. Any of them changing closes it, and nothing is sent for it any more. */
export interface EditAsk {
  part: string;
  target: Target;
  key: string;
  id: string;
  /** The name when it was asked (the drawer's title). */
  name: string;
}

export interface EditApi {
  /** Edit is offered for this row at all: a program the person added, never a system or a temporary one. */
  offers: (row: Row) => boolean;
  /** The row's edit that is being sent, not known yet, refused or not sent. */
  attempt: (rowKey: string) => EditAttempt | undefined;
  /** An edit of the row is being sent or is not known yet: every action of the program waits. */
  busy: (rowKey: string) => boolean;
  ask: (row: Row) => void;
  asked: EditAsk | null;
  /** Another change of the asked program is held or being sent (a start or stop, a sandbox save, a removal; this
   *  tab's or another's): a drawer with something typed stays open, and nothing is saved until that change settles. */
  waiting: boolean;
  /** The open drawer says whether something is typed in it that is not saved. */
  touched: (dirty: boolean) => void;
  cancel: () => void;
  /** The names of the computer's other programs (a name must be its own). */
  taken: (rowKey: string) => string[];
  /** One Save of the drawer opened for `ask`: `next` over what was read (`was`). Only changed fields are sent. */
  save: (ask: EditAsk, was: Editable, next: { name: string; command: string }) => void;
  check: (rowKey: string, shown: EditAttempt) => void;
  dismiss: (rowKey: string, shown: EditAttempt) => Promise<boolean>;
}

export interface EditOptions {
  part: string;
  target: Target | null;
  /** The rows of the last overview read (undefined: none read yet). */
  rows: readonly Row[] | undefined;
  /** Reads the list again (after an edit that is known, and after a check). */
  refetch: () => void;
  /** Another change of the row is held or being sent (a start or stop, a sandbox save, a removal): no edit is
   *  opened or sent. */
  blocked: (row: Row) => boolean;
}

const sameComputer = (a: Target, b: Target) => a.container.id === b.container.id && a.project.id === b.project.id;
export const editable = (row: Row): boolean => row.scope === 'yours';

export function useEditProgram({ part, target, rows, refetch, blocked }: EditOptions): EditApi {
  const t = useStrings(strings);
  const all = useEditAttempts();
  const changes = useChangesVersion();
  const [asked, setAsked] = useState<EditAsk | null>(null);

  const said = useCallback(
    (end: 'saved' | 'notApplied', name: string) => {
      const v = { name: name || t('unnamed') };
      if (end === 'notApplied') showToast({ tone: 'warn', title: t('ed.notAppliedT', v), body: t('ed.notApplied') } /* noDetails: the edit was stored; edit.ts keeps no rejection for it (the daemon's text may quote the program's settings) */, 12000);
      else showToast({ tone: 'ok', title: t('ed.done', v) });
    },
    [t],
  );

  // The drawer belongs to the program it was opened for: another computer, realm or account, or the program leaving
  // the list closes it. Another change of the program starting (this tab's or another's) closes it only while nothing
  // is typed in it: what the person typed is never dropped for it. Such a drawer stays open and waits: no Save until
  // that change settles (`waiting`), and it stays even if the fields are put back meanwhile. (Its own send closes
  // nothing: a refusal is shown in it.)
  const askedRow = asked ? rows?.find((r) => r.key === asked.key) : undefined;
  const fits = !!asked && asked.part === part && !!target && sameComputer(asked.target, target) && !!askedRow && editable(askedRow);
  const waiting = fits && !!askedRow && blocked(askedRow);
  // Read when another change starts, never a reason to re-run: set by the open drawer (EditForm), cleared at each ask.
  const typed = useRef(false);
  const touched = useCallback((dirty: boolean) => {
    typed.current = dirty;
  }, []);
  useEffect(() => {
    if (asked && (!fits || (waiting && !typed.current))) setAsked(null);
  }, [asked, fits, waiting]);

  // Core's holds of this page's edits on this computer, with no attempt here (a reload, a realm switch, another tab):
  // shown held with their token, so Check again and the warned Dismiss stay reachable. An unknown attempt whose hold
  // core let go elsewhere is over: the list says where it stands.
  useEffect(() => {
    void changes;
    if (!target) return;
    const holds = editHolds(target).filter((h) => h.own);
    for (const h of holds) {
      const k = opKey(part, `prog:${h.id}`);
      if (!editBusy(editStore.get(k))) editStore.set(k, { id: h.id, name: h.name, mark: h.mark, target, status: 'unknown', ...(h.hold ? { hold: h.hold } : {}) });
    }
    const pre = `${part}|`;
    for (const [k, a] of editStore.snapshot()) {
      if (k.startsWith(pre) && a.status === 'unknown' && a.hold !== undefined && !a.checking && !holds.some((h) => h.id === a.id && h.hold === a.hold)) {
        editStore.clear(k);
        refetch();
      }
    }
  }, [changes, all, part, target, refetch]);

  const check = useCallback(
    (rowKey: string, shown: EditAttempt) => {
      void checkEdit(opKey(part, rowKey), shown).then((saved) => {
        if (saved) said('saved', shown.name);
        refetch();
      });
    },
    [part, said, refetch],
  );

  return useMemo<EditApi>(() => {
    void changes; // the change signal for core's lists read by editOut
    const attempt = (rowKey: string) => all.get(opKey(part, rowKey));
    // This tab's attempt, or an edit of the program out or held in any tab (core's lists: another tab's send has no
    // attempt here, and its outcome is as unknown): every action of the program waits, Edit and Remove included.
    const busy = (rowKey: string) => {
      if (editBusy(attempt(rowKey))) return true;
      const row = rows?.find((r) => r.key === rowKey);
      return !!row && editable(row) && editOut(target, row.id);
    };
    return {
      offers: editable,
      attempt,
      busy,
      ask: (row) => {
        if (!target || !editable(row) || blocked(row) || busy(row.key)) return;
        // A definite earlier outcome on the row (refused, not sent) gives way to the new drawer.
        editStore.clear(opKey(part, row.key));
        typed.current = false;
        setAsked({ part, target, key: row.key, id: row.id, name: row.name });
      },
      asked: fits ? asked : null,
      waiting,
      touched,
      cancel: () => {
        // A refusal belonged to the drawer that is closing: it does not stay behind as a note.
        if (asked) {
          const k = opKey(asked.part, asked.key);
          const left = editStore.get(k);
          if (left && (left.status === 'refused' || left.status === 'notSent')) editStore.clear(k);
        }
        setAsked(null);
      },
      taken: (rowKey) => (rows ?? []).filter((r) => r.key !== rowKey && r.key.startsWith('prog:')).map((r) => r.name),
      save: (a, was, next) => {
        // The captured target, checked again at the press: nothing is sent for a drawer that no longer fits, or while
        // another change of the program is held or out.
        if (a !== asked || !fits || waiting) return;
        const k = opKey(a.part, a.key);
        const body = { ...(next.name !== was.name ? { name: next.name } : {}), ...(next.command !== was.command ? { command: next.command } : {}) };
        if (!('name' in body) && !('command' in body)) return;
        void runEdit(k, { id: a.id, name: next.name, command: next.command, body, target: a.target }).then((end) => {
          if (end) said(end, next.name);
          refetch();
          // A refusal (or a send that never left) stays in the drawer; everything else closes the drawer it came from.
          const left = editStore.get(k);
          if (!(left && (left.status === 'refused' || left.status === 'notSent'))) setAsked((cur) => (cur === a ? null : cur));
        });
      },
      check,
      dismiss: (rowKey, shown) => dismissEditAttempt(opKey(part, rowKey), shown),
    };
  }, [all, changes, part, target, rows, blocked, asked, fits, waiting, touched, check, said, refetch]);
}

/** The drawer. Mounted only while asked: each opening reads the program afresh. */
export function EditDrawer({ api }: { api: EditApi }) {
  const a = api.asked;
  return a ? <EditForm key={`${a.part}|${a.key}`} api={api} ask={a} /> : null;
}

function EditForm({ api, ask }: { api: EditApi; ask: EditAsk }) {
  const t = useStrings(strings);
  const ts = useStrings(sbStrings);
  const [was, setWas] = useState<Editable | null | 'loading'>('loading');
  const [form, setForm] = useState({ name: ask.name, command: '' });
  const [reads, setReads] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const { id, target } = ask;

  useEffect(() => {
    let live = true;
    setWas('loading');
    void readEditable(id, target).then((e) => {
      if (!live) return;
      setWas(e);
      if (e) setForm({ name: e.name, command: e.command });
    });
    return () => {
      live = false;
    };
  }, [id, target, reads]);

  const read = was === 'loading' ? null : was;
  const at = api.attempt(ask.key);
  const busy = at?.status === 'working';
  const name = form.name.trim();
  const problems = checkAdd({ ...EMPTY_ADD, name: form.name, command: form.command }, api.taken(ask.key)).filter((p) => p.field === 'name' || p.field === 'command');
  const errOf = (f: 'name' | 'command') => {
    const p = showErrors ? problems.find((x) => x.field === f) : undefined;
    return p ? ts(`np.err.${p.code}` as 'np.err.required') : undefined;
  };
  const dirty = !!read && (name !== read.name || form.command !== read.command);
  // Another change of this program is held or out: the drawer keeps what was typed and Save waits for it.
  const waiting = api.waiting;
  const { touched } = api;
  useEffect(() => {
    touched(dirty);
  }, [touched, dirty]);
  const set = (k: 'name' | 'command') => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // A refusal answered what was typed then.
    if (at && (at.status === 'refused' || at.status === 'notSent')) void api.dismiss(ask.key, at);
  };
  const onSave = () => {
    setShowErrors(true);
    if (!read || !dirty || busy || waiting || problems.length) return;
    api.save(ask, read, { name, command: form.command });
  };
  const v = { name: ask.name || t('unnamed') };
  const refusedText = at?.status === 'refused' ? daemonText(at.error) : '';
  const outcome =
    waiting ? <Outcome outcome="not_sent" title={t('ed.waits', v)} wrap /* noDetails: nothing was sent; Save waits for another change of the program to settle */ />
    : at?.status === 'refused' ? <Outcome outcome="failed" title={refusedText ? t('ed.refusedText', { text: refusedText }) : t('ed.refused', v)} error={at.error} wrap />
    : at?.status === 'notSent' ? <Outcome outcome="not_sent" title={t('op.refused')} wrap /* noDetails: core refused before the send, so there is no rejection */ />
    : showErrors && problems.length ? <Outcome outcome="not_sent" title={t('ed.fix')} wrap /* noDetails: the Hub's own checks of the form; nothing was sent */ />
    : undefined;

  return (
    <Drawer
      overlayId="programs-edit"
      resizeKey="programs-edit"
      isOpen
      onOpenChange={(open) => !open && api.cancel()}
      title={t('ed.title', v)}
      dirty={dirty}
      busy={busy}
      outcome={outcome}
      primary={
        <Button variant="primary" onPress={onSave} isDisabled={!read || !dirty || busy || waiting} disabledReason={waiting ? t('ed.waits', v) : undefined}>
          {busy ? t('ed.saving') : t('ed.save')}
        </Button>
      }
    >
      <Stack gap={4}>
        {was === 'loading' && <Spinner label={t('ed.loading')} />}
        {was === null && (
          <Band tone="warn" /* noDetails: the read's rejection is not kept (edit.ts readEditable answers null); Read again reads it anew */ actions={<TextButton onPress={() => setReads((n) => n + 1)}>{t('ed.readAgain')}</TextButton>}>
            {t('ed.readFailed')}
          </Band>
        )}
        {read && (
          <>
            <Verdict label={t('ed.verdict')}>{t(read.appliesNow ? 'ed.now' : 'ed.next', v)}</Verdict>
            {/* Short on purpose (the drawer's explanation budget): the name's rules are said by its error when one is
                broken, and the command has one line of help. */}
            <TextField label={ts('np.name')} mono isRequired value={form.name} onChange={set('name')} errorMessage={errOf('name')} isDisabled={busy} />
            <TextField label={ts('np.command')} description={t('ed.command.d')} mono isRequired value={form.command} onChange={set('command')} errorMessage={errOf('command')} isDisabled={busy} />
          </>
        )}
      </Stack>
    </Drawer>
  );
}

export interface EditNoteProps {
  attempt: EditAttempt;
  compact?: boolean;
  /** Each control names the attempt it showed: a Check or Dismiss acts on exactly that send. */
  onCheck: (shown: EditAttempt) => void;
  onDismiss: (shown: EditAttempt) => Promise<boolean>;
}

/** An edit that is not settled: working, "may have gone through" with Check again (reads only), refused, not sent. */
export function EditNote({ attempt: a, compact, onCheck, onDismiss }: EditNoteProps) {
  const t = useStrings(strings);
  // Dismissing a held edit frees it, so the next Save sends again: asked first, for the attempt it was raised on.
  const [askedFor, setAskedFor] = useState<EditAttempt | null>(null);
  const [moved, setMoved] = useState(false);
  const v = { name: a.name || t('unnamed') };

  if (a.status === 'working') {
    // The kit Spinner is the status announcement (role status, labelled).
    return <Spinner label={t('ed.working', v)} />;
  }
  if (compact) {
    if (a.status === 'unknown') return <Outcome outcome="pending" title={t('op.pendingRow')} onCheck={() => onCheck(a)} checking={a.checking} /* noDetails: the answer was lost or carried no text, so there is no rejection to show */ />;
    if (a.status === 'notSent') return <Outcome outcome="not_sent" title={t('op.refusedShort')} onDismiss={() => void onDismiss(a)} /* noDetails: core refused before the send, so there is no rejection */ />;
    return <Outcome outcome="failed" title={t('ed.refusedShort')} error={a.error} onDismiss={() => void onDismiss(a)} />;
  }
  if (a.status === 'unknown') {
    return (
      <>
        <OutcomeBanner
          /* noDetails: the answer was lost or carried no text, so there is no rejection to show */
          kind="pending"
          known={a.accepted ? t('ed.accepted', v) : t('ed.unk', v)}
          checkLine={a.stuck ? t('ed.stuck') : t('ed.checkLine')}
          stopLine={moved ? t('op.moved') : undefined}
          onCheck={() => onCheck(a)}
          checking={a.checking}
          onDismiss={() => {
            setMoved(false);
            // Asked first for every edit that is not known, held by core or not: it may have gone through.
            setAskedFor(a);
          }}
          dismissWarned
        />
        <ConfirmDialog
          overlayId="programs-edit-dismiss"
          isOpen={askedFor === a}
          onOpenChange={(o) => !o && setAskedFor(null)}
          title={t('op.dismissTitle')}
          body={t('ed.dismissBody')}
          confirmLabel={t('op.dismissGo')}
          onConfirm={() => {
            const shown = askedFor;
            setAskedFor(null);
            if (shown) void onDismiss(shown).then((freed) => !freed && setMoved(true));
          }}
        />
      </>
    );
  }
  const close = () => void onDismiss(a);
  if (a.status === 'notSent') return <OutcomeBanner kind="not_sent" body={t('op.refused')} onDismiss={close} /* noDetails: core refused before the send, so there is no rejection */ />;
  // The kit maps the rejection to its words and keeps the facts under Details.
  if (a.error) return <OutcomeBanner kind="failed" title={t('ed.refused', v)} error={a.error} onDismiss={close} />;
  return <OutcomeBanner kind="failed" title={t('ed.refused', v)} body={t('rm.nothing')} onDismiss={close} /* noDetails: this refusal came with no rejection to show */ />;
}
