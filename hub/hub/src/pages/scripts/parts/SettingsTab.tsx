// The Settings tab: the script's magic comments (on or off, schedule, key and the rest, from the computer's own field list), its secret
// values, and its deletion. Every change names what it does before it is sent; a delete asks to confirm.
import { aliasLock, heldChanges, refreshFresh, sendingChanges, sourceReads, useChangesVersion } from '@core';
import { Button, ConfirmDialog, EmptyState, Notice, Panel, SecretInput, SettingGroup, SettingRow, Stack, TextField, Why, showToast, useStrings, type FaqItem, type SettingRowProps } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { useAliasCreate, useAliasHeldElsewhere, useAliasRemove, useAliasState, useEnv, useEnvUpdate, useFile, useRemove, useRemoveManaged, useResolve, useScriptsTarget, useTests, useTestsDelete } from '../data';
import { beginSequence, endSequence, moveSequence, sequenceKey, sequenceOf, useSequenceBusy, type Sequence } from '../deleteSequence';
import { addressText, aliasesFor, aliasesOf, deleteBlock, envFromKind, folderOf, itemKey, newOpId } from '../logic';
import { envNameOk, isSensitiveName } from '../secrets';
import strings from '../strings.en.json';
import type { Alias, CompScripts, ResolveAnswer, ScriptItem } from '../types';
import { InlineOutcome } from './Bits';
import { forScript, heldByOther, ofIdentity, ofPath, readBackOf, useChange } from './ops';
import { sentOf, useOpCheck } from './opcheck';
import { MagicPanel } from './MagicPanel';
import { readOnlyNote } from './readOnly';
import s from './parts.module.css';

const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/** `askDelete`: a count of asks to open the delete confirmation (the header menu's Delete, a list row's); `onAsked` tells the owner it was seen. */
/** `secretsFaq` and `settingsFaq`: the page's answers; each link shows only when its answer is given (the page gives them). */
export function SettingsTab({ item, comp, onChanged, onDeleted, askDelete = 0, onAsked, secretsFaq, settingsFaq, focusSchedule = 0, onScheduleFocused }: { item: ScriptItem; comp: CompScripts; onChanged: () => unknown; onDeleted: () => void; askDelete?: number; onAsked?: () => void; secretsFaq?: FaqItem; settingsFaq?: FaqItem; focusSchedule?: number; onScheduleFocused?: () => void }) {
  const t = useStrings(strings);
  const file = useFile(item.id);
  const env = useEnv(item.id, !!comp.caps?.env);
  const remove = useRemove();
  const removeManaged = useRemoveManaged();
  const envUpdate = useEnvUpdate();
  const aliasState = useAliasState();
  const aliasCreate = useAliasCreate();
  const aliasRemove = useAliasRemove();
  const testsDelete = useTestsDelete();
  const resolve = useResolve();
  const tests = useTests(item.id, !!comp.caps?.tests);
  const target = useScriptsTarget();
  // Only this script's holds on this computer show here and are freed by a Dismiss: the lock identity of each of these changes is its path.
  const mine = ofPath(item.path, comp.id);
  const removeH = forScript(remove, mine);
  const removeManagedH = forScript(removeManaged, mine);
  const envUpdateH = forScript(envUpdate, mine);
  const testsDeleteH = forScript(testsDelete, mine);
  // The public links that open this script (their holds name the link, not the path): turned off before it is deleted.
  const links = aliasesFor(comp.aliases, item.path);
  // The computer's links as the latest render read them: a delete judges them again after its resolves, never only as they were at the
  // press. A delete whose tab closed while its resolves were out can no longer read them: `shown` is false and it stops.
  const aliasesNow = useRef(comp.aliases);
  aliasesNow.current = comp.aliases;
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => { shown.current = false; };
  }, []);
  // Whether a link to this target (in this Exec folder) would open this script: the file's own pattern, a concrete path under a
  // dynamic file's pattern included (a link made for /users/43 belongs to users/[id].ts), or its address as written.
  const targetMine = (target: unknown, exec: unknown): boolean =>
    typeof target === 'string' && (exec ?? 1) === folderOf(item.path)
    && (target === item.route || aliasesFor([{ id: '', target_path: target, program: 'exec', index: folderOf(item.path) } as unknown as Alias], item.path).length > 0);
  const linkIds = links.map((a) => a.id);
  const linkField = (id: unknown, k: string): unknown => (id && typeof id === 'object' ? (id as Record<string, unknown>)[k] : undefined);
  const linksH = forScript(aliasState, ofIdentity((id) => linkIds.includes(String(linkField(id, 'alias')))));
  // Every other alias change that touches this script's links or its address, whatever the cached `enabled` of a link says: one that
  // is out (this page's remove or make, or another page's, read-only here) can still change which links point at the script.
  const linkCreateMine = ofIdentity((id) => linkField(id, 'compId') === comp.id && targetMine(linkField(id, 'target'), linkField(id, 'exec')));
  const linkRemoveMine = ofIdentity((id) => linkIds.includes(String(linkField(id, 'alias'))));
  const linkHeldElsewhere = !!useAliasHeldElsewhere({ ids: linkIds, compId: comp.id, target: item.route, exec: folderOf(item.path) });
  // An alias change that touches this script's links or its address and is out or held right now, from any page or tab: a request
  // still out is listed by sendingChanges (a hold is listed only once it is pending), a hold of another page's by heldChanges (the
  // mutations here list only their own sender's). One whose subject core cannot name holds Delete back too, a hold included (core strips
  // the identity of an older record it converts to a hold, and that proves neither done nor failed; a hold of unknown shape too). Re-read on every change
  // core reports, and again at the press.
  useChangesVersion();
  const aliasMine = (id: unknown): boolean => (linkField(id, 'compId') === comp.id && targetMine(linkField(id, 'target'), linkField(id, 'exec'))) || linkIds.includes(String(linkField(id, 'alias')));
  // A hold passes as another script's only when its identity names what it is about: an existing link (`alias`), a link made for an
  // address (`compId` and `target`), or an HTTP or pipe address made on a computer (`computer` and `name`). Anything else, `{}` too, says
  // nothing about which script it touches.
  const aliasKnown = (id: unknown): boolean => {
    const str = (k: string): boolean => typeof linkField(id, k) === 'string';
    return str('alias') || (str('compId') && str('target')) || (str('computer') && str('name'));
  };
  const aliasOut = (): boolean => sendingChanges(aliasLock.lock).some((c) => !c.attributed || aliasMine(c.identity)) || heldChanges(aliasLock.lock).some((h) => !aliasKnown(h.identity) || aliasMine(h.identity));
  // Core's `pending` is a boolean taken when the hook rendered; a decision made at a press or after an await asks the rows, read now.
  // `liveOf` is the change seen through `accepts` with `pending` from those rows, so a read-back over it asks every hold that is there.
  const liveOf = (m: Parameters<typeof forScript>[0], accepts: Parameters<typeof forScript>[1]) => {
    const f = forScript(m, accepts);
    return { ...f, pending: f.held().length > 0 };
  };
  const liveHeld = (m: Parameters<typeof forScript>[0], accepts: Parameters<typeof forScript>[1]): boolean => liveOf(m, accepts).pending;
  const place = `${comp.id}\u0000${item.path}`;
  const del = useChange(place, removeH, removeManagedH);
  // The delete is three changes, each its own lock and outcome: its public links off, the script gone, its saved tests gone.
  const linkOff = useChange(place, linksH);
  const testsDel = useChange(place, testsDeleteH);
  const opSecrets = useOpCheck();
  const opDel = useOpCheck();
  // Check of a delete reads back BOTH delete routes' holds, never one picked from the script's metadata now (it may have changed since
  // the send). A proof for one op ends the banner only through the same read-back of whichever route still holds: the other route's
  // hold is read, not assumed done.
  const opTests = useOpCheck();
  // One delete is one sequence (links off, the script, its saved tests), and its state is kept by script outside this tab
  // (deleteSequence.ts): a second press, or a tab left and entered again, finds a step still out and sends nothing; a step that went
  // pending keeps its own change lock (Delete stays off) and its banner.
  const key = sequenceKey(comp.id, item.path);
  const seqBusy = useSequenceBusy(key);
  // The sequence is over: the page is told once, whichever Check or step gets here first.
  const finish = (e: Sequence) => {
    endSequence(key, e);
    if (!e.told) {
      e.told = true;
      onDeleted();
    }
  };
  // Check again of the saved-tests step. A proof by the computer's own answer for its op ends it; nothing else can prove it (no read
  // shows a saved set gone), so without that proof the hold stays until the warned Dismiss. It is a closure kept by a toast that may
  // outlive this render: it reads no render-time state.
  const checkTests = async (): Promise<boolean> => {
    let ended = false;
    const end = testsDel.settle;
    const e = sequenceOf(key);
    // A refusal leaves no send here (the script is gone and the page closes): its toast says the saved tests stay.
    await opTests.checkWith(place, () => { ended = true; end(); }, async () => undefined, undefined, 'check.failedTests');
    // Whatever the proof (committed, or never run, or refused), the saved-tests step is over and the script is gone: the page is told once.
    if (ended) {
      if (e) finish(e);
      else onDeleted();
    }
    return ended;
  };
  // The tests step may have gone through (or an earlier removal of them is still out). The script is already gone from the list, so a toast
  // that outlives the page carries the Check again (it closes only on proof).
  const testsPendingToast = (): void => {
    showToast({ title: t('delete.testsPending'), body: t('delete.testsPendingBody'), tone: 'unknown', action: { label: t('delete.testsCheck'), onAction: checkTests } });
  };
  // The saved-tests step: run once per sequence, whoever asks (the sequence itself, or any Check that proves a pending script delete).
  const cleanupTests = (e: Sequence): Promise<'done' | 'pending'> => {
    e.cleanup ??= (async (): Promise<'done' | 'pending'> => {
      // A tests read that never answered says nothing about whether a saved set exists: say so, never skip it silently.
      if (e.tests === undefined) {
        showToast({ title: t('delete.testsUnread'), tone: 'warn' });
        return 'done';
      }
      if (e.tests === null) return 'done';
      moveSequence(key, e, 'tests-running');
      const tid = newOpId(rand);
      const tvars = { compId: comp.id, path: item.path, ifRevision: e.tests, opId: tid, ...(e.target ? { target: e.target } : {}) };
      const tr = await testsDel.run(() => testsDelete.mutateAsync(tvars));
      opTests.remember(sentOf(testsDelete, { compId: comp.id, path: item.path, opId: tid, vars: tvars }, tr), place);
      if (tr?.outcome === 'pending') {
        // The tests step may have gone through. Its banner is beside Delete while this script is shown; the script is already gone from
        // the list, so a toast that outlives the page carries the same Check again (it closes only on proof).
        moveSequence(key, e, 'tests-pending');
        testsPendingToast();
        return 'pending';
      }
      // A step that was not sent because an earlier removal of the saved tests is still out has not run: it stays pending, never a
      // completed cleanup. That removal was sent by another view (the Tests tab, an earlier visit, another tab: this delete's own step
      // runs once), so no op of it is known here and a Check again from this toast could never answer. The toast says so and carries
      // no action; the hold stays with its sender, and Settings or Tests of a script at this path shows it with Check again and the
      // warned close.
      if (tr === null && liveHeld(testsDelete, mine)) {
        moveSequence(key, e, 'tests-pending');
        showToast({ title: t('delete.testsHeldOlder'), body: t('delete.testsHeldOlderBody'), tone: 'unknown' /* noDetails: nothing was sent, so there is no rejection; the held removal is another view's */ });
        return 'pending';
      }
      if (tr?.outcome !== 'done') showToast({ title: t('delete.testsLeft'), tone: 'warn' });
      return 'done';
    })();
    // A step that threw leaves nothing running: the entry must not keep Delete off for good.
    e.cleanup.catch(() => { if (e.stage === 'tests-running') endSequence(key, e); });
    return e.cleanup;
  };
  // A pending script delete that a Check proves committed carries on with what the sequence still owes. No sequence on record (the page
  // was reloaded since the send) owes nothing this page knows of.
  const afterDeleteProved = async () => {
    const e = sequenceOf(key);
    if (!e) {
      onDeleted();
      return;
    }
    if ((await cleanupTests(e)) === 'done') finish(e);
  };
  // The read-back proof (the script is gone from a fresh list) carries on with the saved tests like the computer's own op proof does:
  // either way the delete is proven, and what the sequence still owed is done once. A hold that is simply gone proves nothing.
  const readDeletes = async (): Promise<void> => {
    const rs = liveOf(remove, mine);
    const rm = liveOf(removeManaged, mine);
    const open = rs.pending || rm.pending;
    let proved = false;
    const end = del.settle;
    await readBackOf(() => { proved = true; end(); }, rs, rm);
    if (open && proved) await afterDeleteProved();
  };
  const checkDelete = () => opDel.checkWith(place, () => void readBackOf(del.settle, removeH, removeManagedH), readDeletes, () => void afterDeleteProved());
  // A warned Dismiss of a hold ends what the sequence owed: nothing was proven, so nothing more is sent for it.
  const forceDelete = () => { endSequence(key); del.force(); };
  const forceTests = () => { endSequence(key); testsDel.force(); };
  const secrets = useChange(place, envUpdateH);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Did THIS confirmation start a delete? Only then do a step still out or an outcome keep it open; an earlier attempt's outcome
  // (refused, failed, closed) never does. Cleared each time the confirmation opens; set once its own sequence has begun.
  const [ranHere, setRanHere] = useState(false);
  const openConfirm = () => { setRanHere(false); setConfirmDelete(true); };
  const [envName, setEnvName] = useState('');
  const [envValue, setEnvValue] = useState('');

  useEffect(() => () => setEnvValue(''), []);

  const canWrite = !!comp.caps?.revisions && comp.instances !== null;
  const block = deleteBlock(item, comp.caps, comp.agent.guardedDelete, comp.aliasesRead !== false);
  // The one predicate of Delete: the button, and a request from a menu, ask it. A refused request lands here, where the reason is shown beside the button.
  // A hold that core still lists is read here, not through `locked`: useChange shows it one effect later, and a request from the header
  // menu arrives on the first render of this tab, before that.
  // Read again at the press: the confirmation can stay open while a hold arrives.
  const holdsNow = (): boolean =>
    liveHeld(remove, mine) || liveHeld(removeManaged, mine) || liveHeld(aliasState, ofIdentity((id) => linkIds.includes(String(linkField(id, 'alias')))))
    || liveHeld(testsDelete, mine) || liveHeld(aliasCreate, linkCreateMine) || liveHeld(aliasRemove, linkRemoveMine) || aliasOut();
  const deleteOffWith = (heldNow: boolean): boolean => block !== null || seqBusy || heldNow || linkHeldElsewhere || del.locked || linkOff.locked || testsDel.locked || heldByOther(linkOff.out);
  const deleteOff = deleteOffWith(holdsNow());
  const asked = useRef(0);
  useEffect(() => {
    if (!askDelete) { asked.current = 0; return; }
    if (asked.current === askDelete) return;
    asked.current = askDelete;
    if (!deleteOff) openConfirm();
    onAsked?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on a new ask only (the ref guards a repeat); deleteOff is read as it is then
  }, [askDelete]);
  // An unsent confirmation does not outlive the reason to have it: when Delete goes off with no delete of this dialog under way, it closes.
  const underway = ranHere && (seqBusy || del.busy || linkOff.busy || testsDel.busy || !!del.out || !!linkOff.out || !!testsDel.out);
  useEffect(() => {
    if (confirmDelete && deleteOff && !underway) setConfirmDelete(false);
  }, [confirmDelete, deleteOff, underway]);
  const rev = file.data?.revision ?? null;
  const baseOk = canWrite && !item.managed && rev !== null;
  // Why nothing here can be changed, as one sentence above the groups; nothing is said while the script's file is only still being read.
  const roNote = readOnlyNote(item, comp);
  // Each sentence is written out with its own key, so the page's text checks count it where it is shown.
  const roText = !roNote ? null
    : roNote.title === 'code.managed' ? `${t('code.managed')}. ${t('code.managedBody')}`
    : roNote.title === 'code.oldKit' ? `${t('code.oldKit')}. ${t('code.oldKitBody')}`
    : roNote.title === 'code.ownerReading' ? `${t('code.ownerReading')}. ${t('code.ownerReadingBody')}`
    : roNote.title === 'code.ownerSignedOut' ? `${t('code.ownerSignedOut')}. ${t('code.ownerSignedOutBody')}`
    : roNote.title === 'code.ownerRejected' ? `${t('code.ownerRejected')}. ${t('code.ownerRejectedBody')}`
    : roNote.title === 'code.ownerNoHost' ? `${t('code.ownerNoHost')}. ${t('code.ownerNoHostBody')}`
    : roNote.title === 'code.ownerNotOpen' ? `${t('code.ownerNotOpen')}. ${t('code.ownerNotOpenBody')}`
    : `${t('code.unknownOwner')}. ${t('code.unknownOwnerBody')}`;

  // The reveal row's Save: it resolves once the value is saved (the editor closes) and rejects otherwise, so the editor stays
  // open with its name (the value is cleared after every answer: it is never kept in the page).
  const saveSecret = async (): Promise<void> => {
    if (!envName.trim() || !envNameOk(envName.trim()) || !envValue || !baseOk) throw new Error('not ready');
    const opId = newOpId(rand);
    const value = envValue;
    const r = await secrets.run(() => envUpdate.mutateAsync({ compId: comp.id, path: item.path, scope: 'script', set: { [envName.trim()]: value }, ifRevision: env.data?.files.find((f) => f.scope === 'script')?.revision ?? null, opId }));
    setEnvValue('');
    opSecrets.remember(sentOf(envUpdate, { compId: comp.id, path: item.path, opId, vars: { compId: comp.id, path: item.path } }, r), place);
    if (r?.outcome !== 'done') throw new Error('not saved');
    setEnvName('');
    void env.refetch();
    showToast({ title: t('secrets.saved'), tone: 'ok' });
  };

  const doDelete = async () => {
    if (!rev) return;
    // Eligibility is judged again here, as the button judges it: a hold or a lost capability that arrived after the confirmation opened
    // stops the delete (the confirmation closes; Settings shows why).
    if (deleteOffWith(holdsNow())) {
      setConfirmDelete(false);
      return;
    }
    // The computer this delete was confirmed on: every step names it, so a later step goes there even when the shell has moved on.
    // The links list is read at this press: links that could not be read are not "no links".
    if ((target && target.container.id !== comp.id) || comp.aliasesRead === false) {
      setConfirmDelete(false);
      return;
    }
    // Undefined: the saved-tests read never answered (not the same as an answer with no saved set).
    const testsRev: string | null | undefined = !comp.caps?.tests ? null : tests.data ? tests.data.revision ?? null : undefined;
    // Taken synchronously with the press, before any await: a second press (or a returning tab) finds it and sends nothing.
    const e = beginSequence(key, testsRev, target);
    if (!e) return;
    setRanHere(true);
    try {
      await runDelete(e, rev);
    } finally {
      // Still running = no step is held and nothing is owed (done, refused, stopped, a step that threw); a held step keeps its entry.
      if (e.stage === 'running' || e.stage === 'tests-running') endSequence(key, e);
    }
  };

  // The enabled links that open this script, judged at the press. The file's pattern can match a link Exec answers with a sibling (static
  // beats dynamic: users/me.ts beside users/[id].ts; users.ts beside users/index.ts), so each matching link is resolved on the computer
  // this delete was confirmed on and kept on when another script of the folder answers it. A resolve that does not answer says nothing
  // about whose link it is: null, and the delete stops with nothing changed. So does a link change while the resolves were out: one that
  // is held or still out from any view (a link being made for a path this script answers included), a matching link enabled, made or
  // moved since the press (it was never resolved), or a tab closed meanwhile (its links can no longer be read). The links are read
  // again from the computer after the resolves (a finished change's own refresh may not have reached the page yet); a read that fails
  // stops it too. Only when no page holds that read (a fixture) are the rendered links what is compared.
  const ownLinks = async (e: Sequence): Promise<typeof links | null> => {
    const enabled = (rows: typeof links) => rows.filter((a) => a.enabled !== false);
    const shape = (rows: typeof links) => enabled(rows).map((a) => `${a.id}\u0000${a.target_path}`).sort().join('\u0001');
    const moved = (): boolean => !shown.current || holdsNow();
    // No enabled link at the press is checked the same way: a link made or turned on since may not have reached the page.
    const on = enabled(links);
    const answers: Record<string, ResolveAnswer> = {};
    for (const p of new Set(on.map((a) => a.target_path.split('?')[0] || '/'))) {
      const r = await resolve.mutateAsync({ path: p, exec: folderOf(item.path), ...(e.target ? { target: e.target } : {}) });
      const ans = r?.outcome === 'done' ? (r.data as ResolveAnswer | undefined) : undefined;
      if (!ans || typeof ans !== 'object' || typeof ans.matched !== 'boolean') return null;
      answers[p] = ans;
    }
    if (moved()) return null;
    const fresh = await refreshFresh((k) => sourceReads('scripts', 'aliases')(k) && linkField(k[7], 'compId') === comp.id, { own: true });
    if (fresh.state === 'failed' || moved()) return null;
    const rows = fresh.state === 'fresh' ? fresh.answers.flatMap((a) => aliasesOf(a.data)) : aliasesNow.current;
    if (shape(aliasesFor(rows, item.path)) !== shape(links)) return null;
    const own = new Set(aliasesFor(links, item.path, answers).map((a) => a.id));
    return on.filter((a) => own.has(a.id));
  };

  const runDelete = async (e: Sequence, ifRevision: string) => {
    const bound = e.target ? { target: e.target } : {};
    // 1. Its public links go off first, so that no other script can take the address over while this one is being deleted. Each
    // link is its own change: one that did not finish stops the delete (nothing was deleted), and a link already off is skipped.
    const on = await ownLinks(e);
    if (on === null) {
      setConfirmDelete(false);
      showToast({ title: t('delete.linksUnchecked'), tone: 'warn' /* noDetails: nothing was sent; a resolve or read that did not answer, or a link change meanwhile, has no rejection to show */ });
      return;
    }
    for (const a of on) {
      const lr = await linkOff.run(() => aliasState.mutateAsync({ id: a.id, enabled: false }));
      if (lr?.outcome !== 'done') {
        setConfirmDelete(false);
        if (lr?.outcome !== 'pending') showToast({ title: t('delete.linksStopped'), tone: 'warn' });
        return;
      }
    }
    // 2. The script itself.
    const opId = newOpId(rand);
    const dvars = { compId: comp.id, path: item.path, ifRevision, opId, keepCopy: true };
    // A script the agent manages goes only through the agent's guarded delete (it frees the ledger row and the key).
    const r = await del.run(() =>
      item.managed
        ? removeManaged.mutateAsync({ ...dvars, ...bound, ...((comp.agentRealm ?? comp.ownerRealm) ? { realm: (comp.agentRealm ?? comp.ownerRealm) as string } : {}) })
        : remove.mutateAsync({ ...dvars, ...bound }),
    );
    opDel.remember(sentOf(item.managed ? removeManaged : remove, { compId: comp.id, path: item.path, opId, vars: dvars }, r), place);
    if (r?.outcome !== 'done') {
      // A delete that may have gone through is shown by the banner beside the button (Check again, then the warned close of exactly the
      // holds it shows), where a visit that finds it still held shows it too; the confirmation has no way out of it. Only a pending one
      // may still turn out committed: its sequence stays on record so its Check carries on with the saved tests; a refused one deleted
      // nothing and the sequence ends with this call.
      if (r?.outcome === 'pending') {
        moveSequence(key, e, 'script-pending');
        setConfirmDelete(false);
      }
      if (on.length > 0) showToast({ title: t('delete.linksOff'), tone: 'info' });
      return;
    }
    // 3. Its saved tests, only after the delete is proven: they would otherwise outlive it under the same path.
    const out = await cleanupTests(e);
    setConfirmDelete(false);
    if (out === 'done') finish(e);
  };

  // The secrets group's one way to add a value, offered only where a value can be written.
  const addReveal: SettingRowProps['reveal'] = baseOk
    ? {
        label: t('secrets.add'),
        saveLabel: t('secrets.save'),
        canSave: !!envName.trim() && envNameOk(envName.trim()) && !!envValue && !secrets.locked,
        onSave: saveSecret,
        onCancel: () => { setEnvName(''); setEnvValue(''); },
        editor: (
          <Stack gap={2}>
            {/* The computer takes only this shape of name (its 400 INVALID_ENV_KEY): said here, before anything is sent. */}
            <TextField label={t('secrets.name')} value={envName} onChange={setEnvName} mono description={t('secrets.nameRule')} errorMessage={envName.trim() && !envNameOk(envName.trim()) ? t('secrets.nameBad') : undefined} />
            <SecretInput label={t('secrets.value')} value={envValue} onChange={setEnvValue} description={envName && !isSensitiveName(envName) ? t('secrets.notSecretName') : undefined} />
          </Stack>
        ),
      }
    : undefined;

  return (
    <Stack gap={4}>
      {roText ? <Notice>{roText}</Notice> : null}

      <MagicPanel key={`${comp.id}\u0000${itemKey(item)}`} item={item} comp={comp} editable={canWrite && !item.managed} onChanged={onChanged} faq={settingsFaq} focusSchedule={focusSchedule} onScheduleFocused={onScheduleFocused} />

      <Panel title={t('secrets.title')} description={t('secrets.body')}>
        <Stack gap={3}>
          {secretsFaq ? (
            <Why question={t('secrets.why.q')} faq={{ item: secretsFaq, label: t('secrets.more') }}>
              {t('secrets.why.a')}
            </Why>
          ) : null}
          {!comp.caps?.env ? (
            <EmptyState size="sm" icon="info" title={t('secrets.oldKit')} body={t('secrets.oldKitBody')} />
          ) : (
            <SettingGroup label={t('secrets.title')}>
              {(env.data?.effective ?? []).map(({ name, from }) => (
                <SettingRow key={name} label={name} help={envFromKind(from) ? t(`secrets.from.${envFromKind(from)}` as never) : from} />
              ))}
              {/* The one way to add a value: a quiet "Add a value…" opens the name and the value in place. */}
              <SettingRow
                label={t('secrets.new')}
                help={env.data && env.data.effective.length > 0 ? undefined : t('secrets.none')}
                {...(addReveal ? { reveal: addReveal } : {})}
              />
            </SettingGroup>
          )}
          {comp.caps?.env ? <InlineOutcome out={secrets.out} what="secrets" onDismiss={secrets.settle} onCheck={() => opSecrets.checkWith(place, secrets.settle, () => readBackOf(secrets.settle, envUpdateH), () => { void env.refetch(); })} onForce={secrets.force} /> : null}
        </Stack>
      </Panel>

      {/* The danger group: the tab's last group, its title in the danger colour, its button the danger tone. */}
      <SettingGroup tone="danger" title={t('delete.title')}>
        <SettingRow
          label={t('delete.action')}
          help={t('delete.body')}
          tone="danger"
          actions={
            <Button tone="danger" icon="trash" isDisabled={deleteOff} onPress={openConfirm}>
              {t('delete.action')}
            </Button>
          }
        >
          {block ? <span className={s.faint}>{t(`delete.block.${block}` as never)}</span> : null}
          {!block && !seqBusy && (holdsNow() || linkHeldElsewhere) && !del.out && !linkOff.out && !testsDel.out ? <span className={s.faint}>{t('delete.block.held')}</span> : null}
          {linkOff.out && linkOff.out.kind !== 'done' ? <InlineOutcome out={linkOff.out} what="links" onDismiss={linkOff.settle} onCheck={() => readBackOf(linkOff.settle, linksH)} onForce={linkOff.force} /> : null}
          {del.out?.kind === 'pending' ? <InlineOutcome out={del.out} what="delete" onDismiss={del.settle} onCheck={() => checkDelete()} onForce={forceDelete} /> : null}
          {testsDel.out?.kind === 'pending' ? <InlineOutcome out={testsDel.out} what="tests" onDismiss={testsDel.settle} onCheck={() => void checkTests()} onForce={forceTests} /> : null}
        </SettingRow>
      </SettingGroup>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title={t('delete.confirmTitle', { name: item.name })}
        body={(item.served ? t('delete.c1', { route: item.pattern }) : t('delete.c1.unserved', { file: addressText(item.path) })) + ' ' + t('delete.c2')}
        confirmLabel={t('delete.confirm')}
        onConfirm={() => void doDelete()}
        confirmDisabled={deleteOff && !underway}
        busy={seqBusy || del.busy || linkOff.busy || testsDel.busy}
        outcome={del.out && del.out.kind !== 'busy' ? { kind: del.out.kind, ...(del.out.code ? { code: del.out.code } : {}) } : undefined}
        onCheck={() => checkDelete()}
      />
    </Stack>
  );
}
