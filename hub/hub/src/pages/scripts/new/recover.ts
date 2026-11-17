// Whether a stored draft can be brought back in this tab: ONE predicate that every
// consumer asks (Flow's start, the leave guards, StepBuild's settle, StepLive's Check and Try again), so no step keeps a rule
// of its own. Pure: the caller reads the record, the containers list and the attempt's stored prompt, and passes them in.
//
//   yes      the record, its computer (project-aware) and the attempt's prompt all read back: the inputs are rebuilt from them.
//   confirm  the record and its computer read back, but the prompt is not the Hub's shape (or there is none): the binding and
//            the attempt come back, the description only when Length proves the cut, and the settings wait for the person.
//            Whether that attempt was a fix is not known, so it settles as one (its answer reads map_lost, never applied).
//   unknown  can't tell yet (C9): hold, Check again; never cleared into a restore or DraftGone without a definite read.
//   no       definitely not here: DraftGone (never a fresh draft under that id).
import { type DraftRecord } from '@core';
import { bindingOfDraft } from './record';
import { newDraft, type Draft, type StepId } from './draft';
import { parsePrompt } from './prompt';
import { routeOf } from '../logic';
import { compIdOf, type Binding } from '../data';
import type { RecordRead } from './records';

/** The attempt's stored user prompt, as read for attempt `n`: its text, 'none' when no stored ask names that attempt, or
 *  'unreadable' when the store, the session or its transcript cannot say yet. */
export type PromptRead = { n: number; text: string } | { n: number; none: true } | 'unreadable';

export type Recover =
  | { k: 'yes'; binding: Binding; draft: Draft; fix: boolean; land: StepId; record: DraftRecord }
  | { k: 'confirm'; binding: Binding; draft: Draft; land: 'where'; record: DraftRecord }
  | { k: 'unknown'; why: 'list' | 'read' }
  | { k: 'no'; why: 'gone' | 'project' | 'generation' };

/** The attempt whose prompt rebuilds the inputs: the current one of an open draft; 0 = none to read. A draft past open
 *  recovers from its record alone (Make it live reads the deploy's own metadata, never the inputs). */
export function attemptOfRecord(r: DraftRecord): number {
  return r.state === 'open' ? r.current : 0;
}

/** Where a restore needs a prompt read: the record's binding and attempt. null when nothing needs reading (yet). */
export function promptToRead(record: RecordRead, computers: unknown): { binding: Binding; n: number } | null {
  if (!record || record === 'unreadable') return null;
  const b = bindingOfDraft(record, computers);
  const n = attemptOfRecord(record);
  return b && b !== 'unknown' && n > 0 ? { binding: b, n } : null;
}

/** The step a restored draft opens on: Make it live once past open, Build while an attempt exists, else the first step. */
function landOf(r: DraftRecord): StepId {
  if (r.state !== 'open') return 'live';
  if (r.current > 0) return r.mode === 'write' ? 'write' : 'build';
  return 'what';
}

/** A restored attempt's draft with its build baseline: the inputs it was rebuilt with (for a prompt that did not read back,
 *  the record's, which the person must confirm on Where anyway). */
const asked = (d: Draft): Draft => ({ ...d, builtWith: { description: d.description, route: d.route, schedule: d.schedule, compId: d.binding ? compIdOf(d.binding) : '' } });

export function recoverable(record: RecordRead, computers: unknown, prompt: PromptRead | undefined): Recover {
  if (record === 'unreadable') return { k: 'unknown', why: 'read' };
  if (record === null || record.state === 'discarded') return { k: 'no', why: 'gone' };
  const binding = bindingOfDraft(record, computers);
  if (binding === 'unknown') return { k: 'unknown', why: 'list' };
  if (binding === null) return { k: 'no', why: 'project' };
  const n = attemptOfRecord(record);
  // The link choice is never stored: every restore asks for it again.
  const base: Draft = { ...newDraft(record.draftId, record.mode), binding, attempt: record.current, restored: true, linkAcknowledged: false };
  // A draft past open shows its reservation's own address (the deployed script's), never one suggested afresh.
  const reserved = record.state !== 'open' && record.deploy ? routeOf(record.deploy.path) : null;
  if (n === 0) return { k: 'yes', binding, draft: reserved ? { ...base, route: reserved, routeTouched: true } : base, fix: false, land: landOf(record), record };
  if (prompt === undefined || prompt === 'unreadable') return { k: 'unknown', why: 'read' };
  if (prompt.n !== n) return { k: 'no', why: 'generation' };
  const confirm = (description: string | null): Recover => ({
    k: 'confirm', binding, record, land: 'where',
    draft: asked({ ...base, description: description ?? '', settingsConfirmed: false }),
  });
  if ('none' in prompt) return confirm(null);
  const p = parsePrompt(prompt.text);
  if (!p.ok) return confirm(p.description);
  // A block that names another folder than the record's binding is not this draft's settings as stored: ask, never guess.
  if (p.block.exec !== record.exec) return confirm(p.description);
  return {
    k: 'yes', binding, record, fix: promptIsFix(prompt.text), land: landOf(record),
    draft: asked({ ...base, description: p.description, route: p.block.address, routeTouched: true, schedule: p.block.schedule }),
  };
}

/** The draft a reload would rebuild, as the leave guard compares against: only a definite restore of the draft's own attempt. */
export function guardBaseline(r: Recover, attempt: number): Draft | null {
  return r.k === 'yes' && r.record.current === attempt ? r.draft : null;
}

/** Whether an attempt's answer settles as a fix (its secret map must be in this tab), from the attempt's stored prompt only,
 *  never from tab memory. A prompt that is not the Hub's shape (or no prompt) settles as a fix: a repair whose kind is not
 *  known is never applied as a plain build (it reads map_lost without the map). */
export function promptIsFix(text: string | null): boolean {
  const p = parsePrompt(text);
  return p.ok ? p.fix : true;
}
