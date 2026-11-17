// The Code tab's state, held by the detail so the header (Save in the tab bar, the AI drawer) and the tab share it.
// The caller key never enters the text: it is put back into the file when the file is saved.
import { showToast } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFile, useRestore, useSettle, useValidate, useVersions, useWrite } from '../data';
import { changesOf, diff, expectRoute, folderOf, isConflict, itemKey, newOpId, routeOf, settleView, splitKey, verdictOf, withKeys, type Change, type Verdict } from '../logic';
import type { CompScripts, ScriptItem } from '../types';
import { forScript, ofPath, ownHoldOf, useChange } from './ops';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export function useEditor(item: ScriptItem, comp: CompScripts, onSaved: () => void, t: (k: never, v?: Record<string, string | number>) => string) {
  const file = useFile(item.id);
  const versions = useVersions(item.id, !!comp.caps?.history);
  const validate = useValidate();
  const write = useWrite();
  const restore = useRestore();
  const settle = useSettle();
  // Only this script's holds on this computer show here and are freed by its Dismiss (the lock identity of both is the path).
  const mine = ofPath(item.path, comp.id);
  const save = useChange(`${comp.id}\u0000${item.path}`, forScript(write, mine), forScript(restore, mine));
  const [text, setText] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [conflict, setConflict] = useState(false);
  const [checking, setChecking] = useState(false);
  // What the last save attempt left to say. `pending` is an outcome nobody knows yet: never worded or tagged as not sent.
  const [note, setNote] = useState<{ kind: 'not_sent' | 'failed' | 'pending'; text: string } | null>(null);
  const sent = useRef<string | null>(null);
  // The send a proof concerns: its op, which mutation sent it, its variables and its hold (the pending answer's own hold, else the
  // one held row of this script on this computer, taken the moment the send answers: ownHoldOf, never a lookup by the computer the
  // shell shows by then), so a check that answers after a later send leaves that send held. `p` is already resolved; a Check awaits it.
  const holds = useRef<{ opId: string; kind: 'write' | 'restore'; vars: never; p: Promise<string | undefined> } | null>(null);
  // The script the text in the editor was loaded from (computer + full path, itemKey: two folders' a.ts share an id): a save
  // for any other script is refused.
  const base = useRef<string | null>(null);
  const key = itemKey(item);
  const canWrite = !!comp.caps?.revisions && comp.instances !== null && !item.managed;

  const split = useMemo(() => (file.data ? splitKey(file.data.content) : null), [file.data]);
  useEffect(() => {
    if (split && text === null) {
      base.current = key;
      setText(split.body);
    }
  }, [split, text, key]);

  const dirty = split !== null && text !== null && text !== split.body;
  const changes = useMemo<Change[]>(() => (dirty && split && text !== null ? changesOf(split.body, text) : []), [dirty, split, text]);
  const stat = useMemo(() => {
    if (!dirty || !split || text === null) return null;
    const d = diff(split.body, text);
    return 'tooBig' in d ? null : d;
  }, [dirty, split, text]);
  const errorLines = useMemo(() => new Set(verdict?.verdict === 'needs_fix' ? verdict.errors.flatMap((e) => (e.line ? [e.line] : [])) : []), [verdict]);

  const reload = useCallback(async () => {
    setText(null);
    setVerdict(null);
    await file.refetch();
  }, [file]);

  const doSave = useCallback(async () => {
    if (!file.data || !split || text === null || save.locked || !canWrite || !dirty || base.current !== key) return;
    setVerdict(null);
    setConflict(false);
    setNote(null);
    const placed = split.keys.length > 0 ? withKeys(text, split.keys) : { text, replaced: false };
    if ('error' in placed) return setVerdict({ verdict: 'needs_fix', errors: [{ line: null, message: t('code.keyUnplaceable' as never) }], blocking: [] });
    const v = await validate.mutateAsync({ code: placed.text, exec: folderOf(item.path) }).catch(() => null);
    const vv = verdictOf(v?.data ?? null);
    setVerdict(vv);
    if (vv.verdict === 'needs_fix') return;
    const opId = newOpId(rand);
    sent.current = opId;
    const r = await save.run(() => write.mutateAsync({ compId: comp.id, path: item.path, content: placed.text, ifRevision: file.data?.revision ?? null, opId, expectRoute: expectRoute(routeOf(item.path), item.path) }));
    if (r?.outcome === 'pending') {
      const vars = { compId: comp.id, path: item.path, content: '', ifRevision: null, opId };
      holds.current = { opId, kind: 'write', vars: vars as never, p: Promise.resolve(ownHoldOf(write, item.path, comp.id, r.hold)) };
      await holds.current.p;
    }
    if (isConflict(r)) setConflict(true);
    if (r?.outcome === 'done') {
      setText(null);
      await file.refetch();
      onSaved();
      showToast({ title: t('code.saved' as never), tone: 'ok' });
    }
  }, [file, split, text, save, canWrite, dirty, validate, write, comp.id, item.path, key, onSaved, t]);

  const check = useCallback(async () => {
    // After a remount this mount sent nothing: the send to check is the one held row of this script on this computer, by the op
    // id its identity names (write and restore both record it). None, or more than one, and there is nothing to check by op.
    if (!sent.current) {
      const rows = (['write', 'restore'] as const).flatMap((kind) => ((kind === 'write' ? write : restore).held?.() ?? []).filter(ofPath(item.path, comp.id)).map((row) => ({ kind, row })));
      const only = rows.length === 1 ? rows[0] : undefined;
      const id = only && only.row.identity && typeof only.row.identity === 'object' ? (only.row.identity as { opId?: unknown }).opId : undefined;
      if (!only || typeof id !== 'string' || !id) return;
      sent.current = id;
      const vars = only.kind === 'write' ? { compId: comp.id, path: item.path, content: '', ifRevision: null, opId: id } : { compId: comp.id, path: item.path, version: '', ifRevision: null, opId: id };
      holds.current = { opId: id, kind: only.kind, vars: vars as never, p: Promise.resolve(only.row.hold) };
    }
    const opId = sent.current;
    setChecking(true);
    // Bound to the send this check is about, before the read: a later send is a different hold.
    const cap = holds.current?.opId === opId ? holds.current : null;
    const hold = cap ? await cap.p : undefined;
    const mine = cap && hold ? { kind: cap.kind, vars: cap.vars, hold } : null;
    const r = await settle.mutateAsync({ compId: comp.id, opId, sentAfter: 0, exec: folderOf(item.path) }).catch(() => null);
    setChecking(false);
    if (sent.current !== opId) return;
    const free = (how: 'complete' | 'discard') => {
      if (!mine) return;
      const m = mine.kind === 'write' ? write : restore;
      void m[how](mine.vars, mine.hold);
    };
    const v = settleView(r?.data ?? null);
    // A proof with no hold to free would orphan the lock: the note stays pending, with its warned Dismiss.
    if (!mine && (v.state === 'done' || v.state === 'not_sent' || v.state === 'failed')) {
      setNote({ kind: 'pending', text: t('code.unknown' as never) });
      return;
    }
    if (v.state === 'done') {
      // The op is settled: release the change's own lock with a fresh read of what it touched.
      // Name the script this note is about: the lock key is its path, so only that change is completed.
      free('complete');
      save.settle();
      await reload();
      onSaved();
    } else if (v.state === 'not_sent') {
      free('discard');
      save.settle();
      setNote({ kind: 'not_sent', text: t('code.notSent' as never) });
    } else if (v.state === 'failed') {
      free('discard');
      save.settle();
      setNote({ kind: 'failed', text: t('code.refused' as never) });
    } else setNote({ kind: 'pending', text: t('code.unknown' as never) });
  }, [settle, write, restore, comp.id, item.path, save, reload, onSaved, t]);

  const doRestore = useCallback(
    async (version: string | number) => {
      if (!file.data || save.locked || !canWrite) return;
      const opId = newOpId(rand);
      sent.current = opId;
      const r = await save.run(() => restore.mutateAsync({ compId: comp.id, path: item.path, version, ifRevision: file.data?.revision ?? null, opId }));
      if (r?.outcome === 'pending') {
        const vars = { compId: comp.id, path: item.path, version: '', ifRevision: null, opId };
        holds.current = { opId, kind: 'restore', vars: vars as never, p: Promise.resolve(ownHoldOf(restore, item.path, comp.id, r.hold)) };
        await holds.current.p;
      }
      if (isConflict(r)) setConflict(true);
      if (r?.outcome === 'done') {
        await reload();
        void versions.refetch();
        onSaved();
        showToast({ title: t('code.restored' as never), tone: 'ok' });
      }
    },
    [file.data, save, canWrite, restore, comp.id, item.path, reload, versions, onSaved, t],
  );

  /** Keep mine: read the new revision, keep my text; the next save is made against it. */
  const keepMine = useCallback(async () => {
    setConflict(false);
    await file.refetch();
  }, [file]);
  const loadTheirs = useCallback(async () => {
    setConflict(false);
    await reload();
  }, [reload]);

  return {
    file,
    versions,
    text,
    setText,
    dirty,
    canWrite,
    verdict,
    conflict,
    keepMine,
    loadTheirs,
    out: save.out,
    locked: save.locked,
    busy: save.busy,
    dismiss: save.settle,
    save: doSave,
    discard: () => {
      setText(split?.body ?? '');
      setVerdict(null);
    },
    check,
    /** The kit could not say (forgotten): the person closes the hold knowingly. */
    force: () => {
      // The hold the banner showed: this mount's own send by its captured hold; an earlier mount's by token (save.force).
      const h = holds.current;
      if (h) void h.p.then((hold) => (hold ? (h.kind === 'write' ? write : restore).settle(h.vars, hold) : undefined));
      save.force();
      setNote(null);
    },
    checking,
    note,
    setNote,
    restoreVersion: doRestore,
    changes,
    stat,
    errorLines,
    hasKey: split?.key != null,
  };
}

export type EditorState = ReturnType<typeof useEditor>;
