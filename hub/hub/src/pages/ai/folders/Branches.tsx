// A folder's Branches view in the Repository tab. With the page's
// writes: New branch, and per row Switch to it and Delete. Each is one of the folder's writes (writes.ts): the folder's one
// lock, sent once and never again; its answer, or its unknown outcome with Check again, shows in the band under the page's
// head (Commit.tsx WriteBand), so it stays in sight from every view. Delete is confirmed here, saying the delete is forced
// (the agent runs git branch -D: unmerged commits are lost from the folder; a branch on GitHub stays) and naming the
// computer: the agent asks nothing more. The folder's current branch can be neither switched to nor deleted.
// The Worktrees view is here too: the repository's worktrees, Add (a path, a new branch or an existing ref) and
// Remove, both writes of the folder like the branch changes. Remove is confirmed, naming the computer; git refuses a
// worktree with changes or a lock, and only then does its row offer Remove anyway: a second, separate confirm saying its
// changes are discarded (force). The main folder is never removed.
import { errorInfo } from '@core';
import { Band, ConfirmDialog, DataTable, RowNote, Tag, TextField, createColumnHelper, useStrings, type RowActionEntry } from '@kit';
import { useMemo, useState } from 'react';
import { refusedRemove, type FolderWrites } from './Commit';
import type { useRepoBranches, FolderAt } from './data';
import { accountFailureOf, type Branch } from './logic';
import { AccountFailure, type FolderNames } from './Repository';
import strings from './strings.en.json';
import type { useRepoWorktrees, Worktree } from './writes';

const branchCol = createColumnHelper<Branch>();

/** A ref name the agent refuses with a 400 before git runs (its ref-name check, on a
 *  non-empty name): a leading dash, slash or dot, a final slash or dot, "..", "@{", a final ".lock", a space or control
 *  character, or one of ~ ^ : ? * [ \. Kept the same as that rule: never stricter, so no name the agent takes is held back. */
export function unsafeRef(name: string): boolean {
  if (/^[-/.]|[/.]$|\.\.|@\{|\.lock$|[~^:?*[\\]/.test(name)) return true;
  return [...name].some((c) => (c.codePointAt(0) ?? 0) <= 0x20 || c.codePointAt(0) === 0x7f);
}

/** A name for a new branch, as typed (trimmed): blank, one the agent's ref rule refuses ('bad', see unsafeRef), or one the
 *  list already has (git would refuse it too). The dialog names 'bad' and 'taken' at the field. */
export function newBranchProblem(name: string, branches: readonly Branch[] | undefined): 'empty' | 'bad' | 'taken' | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (unsafeRef(n)) return 'bad';
  return branches?.some((b) => b.name === n) ? 'taken' : null;
}

export function Branches({ at, names, q, flow }: { at: FolderAt; names: FolderNames; q: ReturnType<typeof useRepoBranches>; flow?: FolderWrites }) {
  const t = useStrings(strings);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Branch | null>(null);
  const columns = useMemo(() => [
    branchCol.accessor('name', { header: t('branches.name'), cell: (c) => <>{c.getValue()}{c.row.original.current ? <> <Tag>{t('branches.current')}</Tag></> : null}</>, meta: { pinned: true, list: 'primary' } }),
    branchCol.accessor('upstream', { header: t('branches.upstream'), cell: (c) => c.getValue() || <RowNote>{t('branches.noUpstream')}</RowNote>, meta: { list: 'meta' } }),
  ], [t]);
  const account = q.error ? accountFailureOf(errorInfo(q.error).code) : null;
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void q.refetch()} size="sm" />;
  const writes = flow?.writes;
  // Another write of the folder in flight or held (any of them: one lock) keeps every branch change waiting.
  const blocked = !writes || writes.blocked || !writes.ok;
  const blockedReason = writes?.busy ? t('write.busyReason') : t('write.heldReason');
  const send = (op: 'branchCreate' | 'branchSwitch' | 'branchDelete', branch: string) => { if (flow) void flow.send({ op, branch }); };
  const actions = (b: Branch): readonly RowActionEntry[] => {
    const off = b.current || blocked;
    const reason = b.current ? t('branches.currentReason') : blockedReason;
    return [
      { id: 'switch', label: t('branches.switch'), inline: true, isDisabled: off, ...(off ? { disabledReason: reason } : {}), onAction: () => send('branchSwitch', b.name) },
      { id: 'delete', label: t('branches.delete'), opens: true, tone: 'danger', isDisabled: off, ...(off ? { disabledReason: reason } : {}), onAction: () => setDeleting(b) },
    ];
  };
  const problem = newBranchProblem(name, q.data);
  return (
    <>
      <DataTable<Branch>
        label={t('branches.table')}
        countLabel={(n) => t('branches.count', { count: n })}
        data={q.data}
        columns={columns}
        getRowId={(b) => b.name}
        isLoading={q.isLoading}
        error={q.error ?? undefined}
        onRetry={() => void q.refetch()}
        {...(flow ? {
          actions,
          toolbarActions: [{ id: 'new', label: t('branches.new'), icon: 'plus' as const, isDisabled: blocked, onPress: () => { setName(''); setCreating(true); } }],
          // A toolbar action carries no reason of its own: the line under the toolbar says why New branch (and every row's
          // Switch and Delete) waits, also when the table has no rows.
          ...(writes?.blocked ? { toolbarNote: <Band tone="neutral" size="table">{blockedReason}</Band> } : {}),
        } : {})}
        noViewMenu
        sortParam={false}
      />
      {flow ? (
        <>
          <ConfirmDialog
            overlayId="ai-folders-branch-new"
            isOpen={creating}
            onOpenChange={(o) => { if (!o) setCreating(false); }}
            title={t('branches.new.title')}
            body={t('branches.new.help')}
            confirmLabel={t('branches.new.create')}
            confirmDisabled={problem !== null || blocked}
            onConfirm={() => { const n = name.trim(); setCreating(false); if (!newBranchProblem(n, q.data) && !blocked) send('branchCreate', n); }}
          >
            <TextField
              label={t('branches.new.name')}
              value={name}
              onChange={setName}
              isRequired
              // The dialog opens on the name to type, on the web and in a terminal (a terminal confirm opens on a field
              // only when the field asks for it, else on Cancel, where typing went nowhere).
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the one field this dialog is for; the web dialog focuses it too
              autoFocus
              {...(problem === 'taken' ? { errorMessage: t('branches.new.taken') } : problem === 'bad' ? { errorMessage: t('branches.new.bad') } : {})}
            />
          </ConfirmDialog>
          <ConfirmDialog
            overlayId="ai-folders-branch-delete"
            isOpen={deleting !== null}
            onOpenChange={(o) => { if (!o) setDeleting(null); }}
            title={deleting ? t('branches.delete.title', { branch: deleting.name }) : ''}
            body={t('branches.delete.body', { computer: names.computer })}
            confirmLabel={t('branches.delete.confirm')}
            tone="danger"
            confirmDisabled={blocked}
            onConfirm={() => { const b = deleting; setDeleting(null); if (b && !b.current && !blocked) send('branchDelete', b.name); }}
          />
        </>
      ) : null}
    </>
  );
}

const worktreeCol = createColumnHelper<Worktree>();

/** A worktree path as typed (trimmed): the agent takes only an absolute, clean path (no . or .. part, no doubled or final
 *  slash, no control character) and refuses anything else with a 400; here it is held back first. */
export function worktreePathProblem(path: string): boolean {
  const p = path.trim();
  if (!p.startsWith('/') || p.length < 2 || p.endsWith('/') || p.includes('//')) return true;
  if (p.split('/').some((part) => part === '.' || part === '..')) return true;
  return [...p].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
}

/** An optional ref as typed (new branch, start from), trimmed: empty is fine; otherwise the agent's ref rule (unsafeRef). */
const refProblem = (ref: string): boolean => ref.trim() !== '' && unsafeRef(ref.trim());

export function Worktrees({ at, names, q, flow }: { at: FolderAt; names: FolderNames; q: ReturnType<typeof useRepoWorktrees>; flow?: FolderWrites }) {
  const t = useStrings(strings);
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('');
  const [start, setStart] = useState('');
  const [removing, setRemoving] = useState<{ readonly worktree: Worktree; readonly force: boolean } | null>(null);
  const columns = useMemo(() => [
    worktreeCol.accessor('path', { header: t('worktrees.path'), meta: { pinned: true, list: 'primary' } }),
    worktreeCol.accessor('branch', { header: t('worktrees.branch'), cell: (c) => c.getValue() || t('worktrees.detached'), meta: { list: 'meta' } }),
    worktreeCol.display({
      id: 'state',
      header: t('worktrees.state'),
      cell: (c) => (c.row.original.main ? <Tag>{t('worktrees.main')}</Tag> : c.row.original.locked ? <Tag>{t('worktrees.locked')}</Tag> : null),
      meta: { list: 'meta' },
    }),
  ], [t]);
  const account = q.error ? accountFailureOf(errorInfo(q.error).code) : null;
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void q.refetch()} size="sm" />;
  const writes = flow?.writes;
  // Another write of the folder in flight or held (one lock) keeps every worktree change waiting, as for the branches.
  const blocked = !writes || writes.blocked || !writes.ok;
  const blockedReason = writes?.busy ? t('write.busyReason') : t('write.heldReason');
  // The path whose plain remove git just refused: only its row offers Remove anyway.
  const refused = refusedRemove(flow?.answer ?? null);
  const actions = (w: Worktree): readonly RowActionEntry[] => {
    const off = w.main || blocked;
    const reason = w.main ? t('worktrees.mainReason') : blockedReason;
    return [
      { id: 'remove', label: t('worktrees.remove'), opens: true, tone: 'danger', isDisabled: off, ...(off ? { disabledReason: reason } : {}), onAction: () => setRemoving({ worktree: w, force: false }) },
      ...(refused !== null && refused === w.path && !w.main
        ? [{ id: 'removeAnyway', label: t('worktrees.removeAnyway'), opens: true, tone: 'danger' as const, isDisabled: blocked, ...(blocked ? { disabledReason: blockedReason } : {}), onAction: () => setRemoving({ worktree: w, force: true }) }]
        : []),
    ];
  };
  const badPath = path.trim() !== '' && worktreePathProblem(path);
  // Typed like newBranchProblem: what holds the form back, or null.
  const addProblem: 'path' | 'ref' | null = worktreePathProblem(path) ? 'path' : refProblem(branch) || refProblem(start) ? 'ref' : null;
  const add = () => {
    setAdding(false);
    if (!flow || addProblem !== null || blocked) return;
    const b = branch.trim();
    const r = start.trim();
    void flow.send({ op: 'worktreeAdd', path: path.trim(), ...(b ? { branch: b } : {}), ...(r ? { startRef: r } : {}) });
  };
  const remove = () => {
    const r = removing;
    setRemoving(null);
    if (!flow || !r || r.worktree.main || blocked) return;
    void flow.send({ op: 'worktreeRemove', path: r.worktree.path, force: r.force });
  };
  return (
    <>
      <DataTable<Worktree>
        label={t('worktrees.table')}
        countLabel={(n) => t('worktrees.count', { count: n })}
        data={q.data}
        columns={columns}
        getRowId={(w) => w.path}
        isLoading={q.isLoading}
        error={q.error ?? undefined}
        onRetry={() => void q.refetch()}
        {...(flow ? {
          actions,
          toolbarActions: [{ id: 'add', label: t('worktrees.new'), icon: 'plus' as const, isDisabled: blocked, onPress: () => { setPath(''); setBranch(''); setStart(''); setAdding(true); } }],
          ...(writes?.blocked ? { toolbarNote: <Band tone="neutral" size="table">{blockedReason}</Band> } : {}),
        } : {})}
        noViewMenu
        sortParam={false}
      />
      {flow ? (
        <>
          <ConfirmDialog
            overlayId="ai-folders-worktree-add"
            isOpen={adding}
            onOpenChange={(o) => { if (!o) setAdding(false); }}
            title={t('worktrees.new.title')}
            body={t('worktrees.new.help')}
            confirmLabel={t('worktrees.new.add')}
            confirmDisabled={addProblem !== null || blocked}
            onConfirm={add}
          >
            <TextField
              label={t('worktrees.new.path')}
              value={path}
              onChange={setPath}
              mono
              isRequired
              // The dialog opens on its first field, the one it needs, on the web and in a terminal (see New branch).
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the needed field this dialog opens for; the web dialog focuses it too
              autoFocus
              description={t('worktrees.new.pathHelp')}
              placeholder={t('worktrees.new.pathExample', { path: `${at.cwd}-next` })}
              {...(badPath ? { errorMessage: t('worktrees.new.pathBad') } : {})}
            />
            <TextField
              label={t('worktrees.new.branch')}
              value={branch}
              onChange={setBranch}
              description={t('worktrees.new.branchHelp')}
              {...(refProblem(branch) ? { errorMessage: t('worktrees.new.refBad') } : {})}
            />
            <TextField
              label={t('worktrees.new.start')}
              value={start}
              onChange={setStart}
              description={t('worktrees.new.startHelp')}
              {...(refProblem(start) ? { errorMessage: t('worktrees.new.refBad') } : {})}
            />
          </ConfirmDialog>
          <ConfirmDialog
            overlayId="ai-folders-worktree-remove"
            isOpen={removing !== null && !removing.force}
            onOpenChange={(o) => { if (!o) setRemoving(null); }}
            title={removing ? t('worktrees.remove.title', { path: removing.worktree.path }) : ''}
            body={t('worktrees.remove.body', { computer: names.computer })}
            confirmLabel={t('worktrees.remove.confirm')}
            tone="danger"
            confirmDisabled={blocked}
            onConfirm={remove}
          />
          <ConfirmDialog
            overlayId="ai-folders-worktree-force"
            isOpen={removing !== null && removing.force}
            onOpenChange={(o) => { if (!o) setRemoving(null); }}
            title={removing ? t('worktrees.force.title', { path: removing.worktree.path }) : ''}
            body={t('worktrees.force.body', { computer: names.computer })}
            confirmLabel={t('worktrees.force.confirm')}
            tone="danger"
            confirmDisabled={blocked}
            onConfirm={remove}
          />
        </>
      ) : null}
    </>
  );
}
