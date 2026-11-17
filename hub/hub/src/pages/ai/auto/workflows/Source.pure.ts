// The workflow editor's kept-editor table and its actions, the pure part (split out of Source.tsx so the terminal build
// shares it; the design notes are at the top of Source.tsx). One `kept` map, never copied. Source.tsx re-exports the
// public names and keeps the editor, the beforeunload hook and useWorkflowSource; kept, losing, holding, drop, prune,
// settle and Kept are for Source.tsx.
import { alive, type Ctx } from '@core';
import { useStrings, type MenuAction, type SectionActions } from '@kit';
import { refreshWorkflows } from './data';
import type { DangerStore, DangerView } from './danger';
import type { Workflow } from './logic';
import type { SourceStore, SourceView } from './source';
import strings from './Source.strings.en.json';

export interface Kept {
  source: SourceStore;
  danger: DangerStore;
  open: boolean;
  /** The context the entry's requests carry. */
  ctx: Ctx;
  /** The last completion (DangerView.seq) acted on. */
  consumed: number;
  /** Mounted editors showing it. */
  mounted: number;
  /** Stops acting on the entry's completions (null: not hooked, as after a drop). */
  unhook: (() => void) | null;
  /** The last hide or show answered (its DangerView.seq) and when (Date.now(), taken in its completion notice, before the
   *  list is read again): the answer holds over list reads that completed no later than that. */
  hideAnswer: { seq: number; at: number } | null;
}
export const kept = new Map<string, Kept>();

/** Typed text or a save whose outcome is unknown: what a reload would lose. */
export function losing(k: Kept): boolean {
  if (!alive(k.ctx)) return false;
  const v = k.source.view();
  return (k.open && v.dirty) || v.save === 'saving' || v.save === 'unsure' || v.save === 'conflict';
}

/** Does this workflow's editor hold something that leaving it would lose? */
export function holding(k: Kept): boolean {
  if (!alive(k.ctx)) return false;
  const d = k.danger.view();
  return losing(k) || d.phase === 'running' || d.phase === 'unsure';
}

export function drop(key: string, k: Kept): void {
  if (kept.get(key) === k) kept.delete(key);
  k.unhook?.();
  k.unhook = null;
  k.source.reset();
  k.danger.reset();
}

export function prune(): void {
  for (const [key, k] of kept) if (k.mounted === 0 && !holding(k)) drop(key, k);
}

/** Each answered change, once (its seq): the list and graph show what the agent has now; a reset replaced the source, so
 *  an open editor reads it again (nothing typed is kept over a reset); a delete took the workflow, and its draft goes with
 *  it. Runs from the danger store's own notice, so it also acts while no editor is mounted. */
export function settle(key: string, k: Kept): void {
  const dv = k.danger.view();
  if (dv.phase !== 'done' || dv.seq === k.consumed) return;
  k.consumed = dv.seq;
  if (dv.kind === 'hide' || dv.kind === 'show') k.hideAnswer = { seq: dv.seq, at: Date.now() };
  refreshWorkflows();
  if (dv.kind === 'reset' && k.open) { k.source.reset(); void k.source.load(); }
  if (dv.kind === 'delete') { k.open = false; k.source.reset(); }
  // Not from inside the store's own notice.
  queueMicrotask(() => { if (kept.get(key) === k && k.mounted === 0 && !holding(k)) drop(key, k); });
}

/** How many editors are kept (tests). */
export const keptSourceCount = (): number => kept.size;

/** Drops every kept editor (tests). */
export function dropKeptSources(): void {
  for (const [key, k] of [...kept]) drop(key, k);
}

/** What a workflow of this origin offers besides editing. */
export function dangerKinds(origin: Workflow['origin']): readonly ('delete' | 'reset' | 'hide')[] {
  if (origin === 'yours') return ['delete'];
  if (origin === 'system') return ['hide'];
  if (origin === 'customized') return ['reset', 'hide'];
  return [];
}

/** One workflow's source and its changes, as the detail shows them: the stores (kept while they hold something), the
 *  fold, the confirms, and whether it is hidden. The detail's ActionBar (useSourceActions) and its Source section
 *  (WorkflowSource) share one. */
export interface WorkflowSourceCtl {
  readonly w: Workflow;
  readonly stores: Kept;
  readonly view: SourceView;
  readonly dv: DangerView;
  /** The Definition fold is open (the source read, or being read). */
  readonly open: boolean;
  /** The entry came back holding something (typed text, an unknown save). */
  readonly wasKept: boolean;
  readonly kinds: readonly ('delete' | 'reset' | 'hide')[];
  /** A save is out, unknown, or the source is being read: Delete and Reset wait. */
  readonly saveBusy: boolean;
  /** A delete or reset is out or unknown: Edit source and the other changes wait. */
  readonly dangerBusy: boolean;
  /** A save is out or unknown: Edit source, Hide and Show wait too. */
  readonly saveOut: boolean;
  /** With the capability: whether it is hidden (a hide's own answer wins over the row it was sent from, until the
   *  list is read again). Without it: null (the agent does not say). */
  readonly hidden: boolean | null;
  /** Edit source: opens the fold, reads the source, and puts the cursor in the editor once it is read. */
  edit(): void;
  /** The fold's own button. Closing with typed text asks first; while a save is out or unknown it stays open. */
  toggle(open: boolean): void;
  ask(kind: 'delete' | 'reset'): void;
  readonly asking: 'delete' | 'reset' | null;
  closeAsk(): void;
  readonly closeAsking: boolean;
  setCloseAsking(open: boolean): void;
  readonly forgetAsking: boolean;
  setForgetAsking(open: boolean): void;
  close(): void;
  /** Edit source asked for the cursor; the editor takes it once the source is read. */
  readonly focusWanted: { current: boolean };
  readonly focusNonce: number;
}

/** The detail's actions for this workflow (one ActionBar): Edit source first; in "...", Make a copy… (with `onCopy`),
 *  Hide or Show, Reset to shipped (a changed shipped one) and Delete (yours). With the capability only the one of Hide and Show that changes
 *  something is offered; without it both are, each saying what hiding does. Nothing once the workflow is gone. */
export function useSourceActions(c: WorkflowSourceCtl, onCopy?: (name: string) => void): SectionActions | undefined {
  const t = useStrings(strings);
  if (c.dv.gone) return undefined;
  const held = c.dangerBusy ? t('danger.busyReason') : undefined;
  // Edit source, Hide and Show also wait for a save that is out or unknown.
  const saveHeld = held ?? (c.saveOut ? t('source.busyReason') : undefined);
  const menu: MenuAction[] = [];
  // Make a copy… opens New workflow on a copy of this one (List.tsx owns the drawer); it changes nothing here.
  if (onCopy) menu.push({ id: 'wf-copy', label: t('copy'), opens: true, onAction: () => onCopy(c.w.name) });
  if (c.kinds.includes('hide')) {
    const hide: MenuAction = { id: 'wf-hide', label: t('danger.hide'), disabledReason: saveHeld, isDisabled: saveHeld !== undefined, onAction: () => void c.stores.danger.run('hide') };
    const show: MenuAction = { id: 'wf-show', label: t('danger.show'), disabledReason: saveHeld, isDisabled: saveHeld !== undefined, onAction: () => void c.stores.danger.run('show') };
    if (c.hidden !== null) menu.push(c.hidden ? show : hide);
    else {
      const hint = t('danger.hideHint');
      if (c.dv.hidden !== true) menu.push({ ...hide, description: hint });
      if (c.dv.hidden !== false) menu.push({ ...show, description: hint });
    }
  }
  const changeHeld = held ?? (c.saveBusy ? t('source.busyReason') : undefined);
  if (c.kinds.includes('reset'))
    menu.push({ id: 'wf-reset', label: t('danger.reset'), tone: 'danger', opens: true, disabledReason: changeHeld, isDisabled: changeHeld !== undefined, onAction: () => c.ask('reset') });
  if (c.kinds.includes('delete'))
    menu.push({ id: 'wf-delete', label: t('danger.delete'), tone: 'danger', opens: true, disabledReason: changeHeld, isDisabled: changeHeld !== undefined, onAction: () => c.ask('delete') });
  return {
    primary: { id: 'wf-edit', label: t('edit'), icon: 'pen', onPress: c.edit, disabledReason: saveHeld },
    ...(menu.length ? { menu } : {}),
  };
}
