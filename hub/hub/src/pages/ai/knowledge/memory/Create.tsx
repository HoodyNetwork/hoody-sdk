// A new memory in one project (saveMemoryItem): content, type, strength, concepts, files and when to forget it. It is
// sent once (C9): the agent takes no idempotency key and every save makes a new record, so a lost answer is never sent
// again. A lost or unknown answer (a 2xx without status ok and the new id included) is held, this project's only, until
// the person presses Stop tracking: no read ever ends it. While it is held the page looks for a record that shows it
// (createShownBy: the latest first version in the project, made within a window around the Save time, not on the list
// read before the save, every value sent) and, when one is there, says so and offers Open it. Such a record may be
// another writer's identical save, so the page says only that a memory with exactly these words is in the project. A save
// that sets an expiry of N days is never shown as found (its date can be another writer's). The draft is never dropped
// by the page on its own: only a finished save, or the person's Stop tracking of a save shown as found, clears it.
import { Band, Button, Disclosure, Drawer, FormFooter, FormSection, Select, Stack, TextField, useStrings } from '@kit';
import { refusal, type SourceError } from '@core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type MemoryAt, useCreate, useCreateCandidates, useItems } from './data';
import { Held } from './Detail';
import { MAX_TTL_DAYS, MEMORY_TYPES, createProblem, createProvable, createShownBy, listOf, stopDropsDraft, type CreateFields } from './logic';
import { FormBlock } from '../../parts/raw';
import strings from './Memory.strings.en.json';
import s from './Memory.module.css';

type Expiry = 'never' | 'days';
interface Draft { content: string; type: string; strength: string; concepts: string; files: string; expiry: Expiry; days: string }
const EMPTY: Draft = { content: '', type: 'fact', strength: '7', concepts: '', files: '', expiry: 'never', days: '' };

/** The page's New memory: its header action (the button and its form) and its toolbar notice (a held save, found or
 *  not); `on` false reads nothing. `onOpen` opens a memory of this project by id (the saved one, or the one a read found). */
export function useNewMemory(at: MemoryAt, project: string, on: boolean, onOpen: (id: string) => void): { action: ReactNode; notice: ReactNode } {
  const t = useStrings(strings);
  const runner = useCreate(at, project);
  // The project's newest memories (the list's first page, every type): their ids go with a save as `before`.
  const list = useItems({ ...at, project, kind: 'memory', q: '', page: 1 }, on);
  const pending = runner.outcome?.kind === 'pending';
  const held = pending ? runner.held : null;
  const candidates = useCreateCandidates(at, project, held);
  // Derived each render from the reads of this hold's own identity: nothing a late answer can write.
  const found = held ? candidates.records.map((r) => createShownBy(held, r.data)).find((x): x is string => x !== null) ?? null : null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Check again reads the project's list and the candidate records again; it settles nothing.
  const check = async (): Promise<boolean> => {
    await Promise.all([candidates.list.refetch(), ...candidates.records.map((r) => r.refetch())]);
    return true;
  };
  // Stop tracking is the only way a hold ends here, and the only press that can drop the draft (stopDropsDraft): a
  // Stop tracking while the band shows Found it drops the draft only when it is unchanged since the press (the form
  // closes, so the same words are not saved twice); a Stop tracking with nothing found keeps it; changed words always
  // survive.
  const dismiss = async (): Promise<boolean> => {
    const wasFound = found !== null;
    const before = draftRef.current;
    const ok = await runner.dismiss();
    if (stopDropsDraft(ok, wasFound, draftRef.current === before)) {
      setOpen(false);
      setDraft(EMPTY);
    }
    return ok;
  };
  const openFound = found === null ? undefined : () => { setOpen(false); onOpen(found); };
  const send = async (fields: CreateFields) => {
    const before = (list.data?.items ?? []).map((r) => r.id);
    const r = await runner.run({ ...at, project, fields, before, sentAt: Date.now() });
    const id = (r.data as { id?: unknown } | undefined)?.id;
    if (r.outcome === 'done') {
      setOpen(false);
      setDraft(EMPTY);
      if (typeof id === 'string') onOpen(id);
    }
    return r;
  };
  const heldKey = runner.elsewhere ? 'create.heldElsewhere' : found !== null ? 'create.foundHeld' : createProvable(runner.held) ? 'create.held' : 'create.heldExpiry';
  const notice = pending ? <Held text={t(heldKey)} readOnly={runner.elsewhere !== null} onCheck={check} onDismiss={dismiss} onOpen={openFound} dismissBody={t('create.dismissBody')} /> : null;
  const action = (
    <>
      <Button size="sm" variant="secondary" icon="plus" onPress={() => setOpen(true)}>{t('create.new')}</Button>
      {open && (
        <CreateDrawer
          draft={draft}
          onDraft={setDraft}
          runner={runner}
          listReady={list.isSuccess}
          listError={list.error}
          onRetryList={() => void list.refetch()}
          held={pending}
          heldKey={heldKey}
          onOpenFound={openFound}
          onDismiss={dismiss}
          onSend={send}
          onCheck={check}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
  return { action, notice };
}

type Runner = ReturnType<typeof useCreate>;
type HeldKey = 'create.heldElsewhere' | 'create.foundHeld' | 'create.held' | 'create.heldExpiry';

/** The form. Concepts and files are one entry per line. Forget: never, or N days after the save. Save waits for the
 *  project's list read (its ids go with the save). The draft lives with the page: while a save is held the form shows
 *  the held band in its place, and the draft is there again after Stop tracking unless the save was shown as found. */
function CreateDrawer({ draft, onDraft, runner, listReady, listError, onRetryList, held, heldKey, onOpenFound, onDismiss, onSend, onCheck, onClose }: { draft: Draft; onDraft: (d: Draft) => void; runner: Runner; listReady: boolean; listError: SourceError | null; onRetryList: () => void; held: boolean; heldKey: HeldKey; onOpenFound: (() => void) | undefined; onDismiss: () => Promise<boolean>; onSend: (f: CreateFields) => Promise<{ outcome: string }>; onCheck: () => Promise<boolean>; onClose: () => void }) {
  const t = useStrings(strings);
  const set = (k: keyof Draft, v: string) => onDraft({ ...draft, [k]: v });
  const dayCount = /^\d+$/.test(draft.days.trim()) ? Number(draft.days.trim()) : NaN;
  const fields: CreateFields = {
    content: draft.content,
    type: draft.type,
    strength: Number(draft.strength),
    concepts: listOf(draft.concepts),
    files: listOf(draft.files),
    ...(draft.expiry === 'days' ? { ttl_days: dayCount } : {}),
  };
  const problem = createProblem(fields);
  const dirty = draft.content.trim() !== '' || draft.concepts.trim() !== '' || draft.files.trim() !== '';
  const blocked = problem !== null || !listReady;
  // What Save waits for when no field says it: no content yet, or "N days" chosen with the count still empty (a typed bad
  // count is named at its field). The list wait has its own band.
  // Concepts, files and the forget choice fold under More options: open from the start when the draft holds one of
  // them (it lives with the page), and held open while a forget date blocks Save, so its refusal is never hidden (it stays
  // open once the refusal goes; a close is ignored while it shows).
  const [more, setMore] = useState(() => draft.concepts.trim() !== '' || draft.files.trim() !== '' || draft.expiry !== 'never');
  const mustShow = draft.expiry === 'days' && !(dayCount >= 1 && dayCount <= MAX_TTL_DAYS);
  useEffect(() => {
    if (mustShow) setMore(true);
  }, [mustShow]);
  return (
    <Drawer
      resizeKey="ai-memory-create"
      overlayId="ai-memory-create"
      isOpen
      onOpenChange={(o) => !o && !runner.busy && onClose()}
      title={t('create.title')}
      subtitle={t('create.lede')}
      size="md"
      dirty={dirty && !held && !runner.busy}
      footer={
        held ? undefined : (
          <FormFooter
            dirty={dirty}
            requireDirty={false}
            submitDisabled={blocked}
            reason={runner.busy ? undefined : problem === 'empty' ? t('create.needContent') : problem === 'ttl' && draft.days.trim() === '' ? t('edit.needDays') : undefined}
            busy={runner.busy}
            busyLabel={t('edit.busy')}
            outcome={runner.outcome}
            error={refusal(runner.outcome)}
            onCheck={onCheck}
            doneText={t('edit.done')}
            submitLabel={t('edit.go')}
            onSubmit={() => {
              if (blocked || held) return;
              void onSend(fields);
            }}
          />
        )
      }
    >
      {held ? (
        <Held text={t(heldKey)} readOnly={runner.elsewhere !== null} onCheck={onCheck} onDismiss={onDismiss} onOpen={onOpenFound} dismissBody={t('create.dismissBody')} />
      ) : (
        <Stack gap={0}>
          <FormSection>
            {!listReady && (listError ? (
              <Band tone="warn" size="table" error={listError} actions={<Button size="sm" onPress={onRetryList}>{t('retry')}</Button>}>{t('create.listFailed')}</Band>
            ) : (
              <Band tone="neutral" size="table" /* noDetails: still reading, nothing failed */>{t('create.needList')}</Band>
            ))}
            <TextField label={t('edit.content')} value={draft.content} onChange={(v) => set('content', v)} multiline rows={8} errorMessage={problem === 'empty' && dirty ? t('edit.empty') : undefined} />
          </FormSection>
          <FormSection title={t('create.sec.recall')}>
            <Select label={t('edit.type')} value={draft.type} onChange={(v) => set('type', v)} options={MEMORY_TYPES.map((v) => ({ value: v, label: v }))} />
            <Select
              label={t('edit.strength')}
              description={t('edit.strengthHelp')}
              value={draft.strength}
              onChange={(v) => set('strength', v)}
              options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
          </FormSection>
          <FormSection>
            <Disclosure title={t('edit.more')} isExpanded={more || mustShow} onExpandedChange={(v) => setMore(v || mustShow)}>
              <FormBlock className={s.form}>
                <TextField label={t('edit.concepts')} value={draft.concepts} onChange={(v) => set('concepts', v)} multiline rows={3} />
                <TextField label={t('edit.files')} value={draft.files} onChange={(v) => set('files', v)} multiline rows={3} mono />
                <Select<Expiry>
                  label={t('edit.forget')}
                  value={draft.expiry}
                  onChange={(v) => set('expiry', v)}
                  options={[
                    { value: 'never', label: t('edit.forget.never') },
                    { value: 'days', label: t('create.forget.days') },
                  ]}
                />
                {draft.expiry === 'days' && (
                  <TextField label={t('create.days')} value={draft.days} onChange={(v) => set('days', v)} inputMode="numeric" errorMessage={problem === 'ttl' && draft.days.trim() !== '' ? t('edit.daysBad', { max: String(MAX_TTL_DAYS) }) : undefined} />
                )}
              </FormBlock>
            </Disclosure>
          </FormSection>
        </Stack>
      )}
    </Drawer>
  );
}
