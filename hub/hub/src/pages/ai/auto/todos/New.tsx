// New TODO on AI > TODOs (and from AI > New chat's "Or keep a TODO."). One drawer, two ways:
//   - Write it: title, details and priority up front, the folder (preselected with the most recent folder this computer's
//     chats used, else the agent's home folder when it reports one; shown and editable; empty and required when neither), tags under More options. Sent once through
//     create.ts (refused, never cut, past the agent's limits; a lost answer is never sent again: Check again lists the
//     look-alikes and the person picks one or stops tracking it).
//   - Ask the agent (Ask on only). The words go to a NEW Agent conversation (kit
//     startAgentConversation); the agent files the TODO with its own create_todo and answers there. This drawer never says a
//     TODO was made: only that the words were sent, were not, or may have been.
// One switch at the top, Write it | Ask the agent, moves between the two; each side keeps its words. A side
// that is sending, or whose answer is unknown, holds the switch: the form while an Add is out or not yet settled, the ask side while a start is on its way or unknown.
import { capture, chooseComputer, useCurrentComputer, type Target } from '@core';
import {
  Button, Disclosure, Drawer, FormFooter, Outcome, Row, SegmentedControl, Select, Stack, TextButton, TextField, askOn, formatDateTime, showToast, startAgentConversation,
  useAskDock, useShellData, useStrings, type AskStartOutcome, type OutcomeLike,
} from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolders } from '../../new/data';
import { FolderField } from '../../new/Options';
import { useKept, useView } from '../kept';
import {
  BODY_MAX, EMPTY_TODO, PRIORITIES, TAGS_MAX, TAG_MAX, TITLE_MAX, bodyOf, createApi, createTodoStore, placeOf, problemsOf, runes, tagsOf, type CreateStore, type TodoDraft,
} from './create';
import strings from './New.strings.en.json';

/** The ask step's example plates. */
export const TODO_ASK_EXAMPLES = ['backups', 'deps', 'disk'] as const;

/** An example after the words, once: an untouched start (empty or just the prompt) becomes the example, as does a last
 *  paragraph that is just the prompt; other words stay and the example follows on a new paragraph (schedules' withAsk). */
export function withExample(text: string, prompt: string, example: string): string {
  const full = `${prompt}${example}`;
  if (text.includes(full)) return text;
  const kept = text.replace(/\s+$/, '');
  const last = kept.split(/\n[ \t]*\n/).pop() ?? '';
  if (last.trim() === '' || last.trim() === prompt.trim()) return kept.slice(0, kept.length - last.length) + full;
  return `${kept}\n\n${full}`;
}

export interface NewTodoProps {
  computer: string;
  /** The realm shown: the TODO is filed there. */
  realm: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** A TODO was added (or picked as the one a lost filing made): the list opens it. */
  onAdded: (id: string) => void;
}

/** The header button; the drawer is the page's (it also opens from a link). */
export function NewTodoButton({ onPress }: { onPress: () => void }) {
  const t = useStrings(strings);
  return (
    <Button size="sm" variant="secondary" icon="plus" onPress={onPress}>
      {t('new')}
    </Button>
  );
}

export function NewTodoDrawer(p: NewTodoProps) {
  // One drawer per realm and computer: a switch never carries the words, folder or store to the new context.
  const target = useCurrentComputer();
  return p.isOpen ? <Open key={`${p.realm}\n${target?.container.id ?? ''}`} {...p} /> : null;
}

function Open({ computer, realm, onOpenChange, onAdded }: NewTodoProps) {
  const t = useStrings(strings);
  const target = useCurrentComputer();
  const asks = askOn();
  const [step, setStep] = useState<'form' | 'ask'>('form');
  const close = () => onOpenChange(false);

  // ---- write it ----
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_TODO);
  const [touchedCwd, setTouchedCwd] = useState(false);
  const [tried, setTried] = useState(false);
  const [more, setMore] = useState(false);
  const set = (patch: Partial<TodoDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // As New chat: a stopped computer's agent is not read, and nothing read from it before (its home included) is offered.
  const shell = useShellData();
  const stopped = shell.computers.find((x) => x.id === target?.container.id)?.running === false;
  const folders = useFolders(stopped ? null : ((target as Target | null) ?? null), realm);
  // The most recent folder this computer's chats used is preselected, shown up front, until the person edits the field; with
  // none, the agent's home folder when it reports one. An unknown home leaves the field empty and required.
  // A folder put there by the page (never the person's own) stays only while the read that offered it still does: a stopped
  // computer or a failed read takes it back out, so Add never sends a folder nothing shows.
  const [auto, setAuto] = useState<string | null>(null);
  useEffect(() => {
    const first = folders.folders[0] ?? folders.home;
    if (!touchedCwd && folders.state === 'ok' && first && draft.cwd === '') {
      set({ cwd: first });
      setAuto(first);
      return;
    }
    const offered = folders.state === 'ok' && (folders.folders.includes(auto ?? '') || folders.home === auto);
    if (!touchedCwd && auto !== null && draft.cwd === auto && !offered && folders.state !== 'loading') {
      set({ cwd: '' });
      setAuto(null);
    }
  }, [folders.state, folders.folders, folders.home, touchedCwd, draft.cwd, auto]);
  const store = useKept<CreateStore>(`todo-new\n${realm}\n${target?.container.id ?? ''}`, (ctx) => createTodoStore({ api: createApi(realm, ctx), ctx, place: placeOf(ctx, realm) }));
  const v = useView(store);
  const problems = problemsOf(draft);
  const has = (k: (typeof problems)[number]) => problems.includes(k);
  // A long field or bad tags say so at once; an empty title or folder only after a press of Add.
  const show = (k: (typeof problems)[number]) => has(k) && (tried || (k !== 'title' && k !== 'cwd'));
  const tags = tagsOf(draft.tags);
  const tagsBad = has('tagsMany') || has('tagLong');
  useEffect(() => {
    if (tagsBad) setMore(true);
  }, [tagsBad]);
  useEffect(() => {
    if (v.phase === 'done' && v.todo) onAdded(v.todo.id);
    // onAdded is the page's; a done store reports once per TODO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.phase, v.todo?.id]);
  const busy = v.phase === 'running' || v.phase === 'unsure';
  const ready = bodyOf(draft);
  // The same words as a lost filing the person stopped tracking: it may still arrive, so they are not sent again.
  const repeat = !!ready && v.phase === 'idle' && store.mayBeFiled(ready);
  const add = () => {
    setTried(true);
    const b = bodyOf(draft);
    if (!b || busy || v.phase === 'done' || store.mayBeFiled(b)) return;
    void store.send(b);
  };
  const edit = (patch: Partial<TodoDraft>) => {
    set(patch);
    if (v.phase === 'refused') store.clear();
  };
  const formDirty = draft.title.trim() !== '' || draft.details.trim() !== '' || draft.tags.trim() !== '';

  const form = (
    <Stack gap={4}>
      <TextField
        label={t('f.title')}
        value={draft.title}
        onChange={(x) => edit({ title: x })}
        isRequired
        isDisabled={busy || v.phase === 'done'}
        errorMessage={show('title') ? t('f.title.empty') : show('titleLong') ? t('f.title.long', { max: TITLE_MAX, n: runes(draft.title.trim()) }) : repeat ? t('f.repeat') : undefined}
      />
      <TextField
        label={t('f.details')}
        value={draft.details}
        onChange={(x) => edit({ details: x })}
        multiline
        rows={4}
        isDisabled={busy || v.phase === 'done'}
        errorMessage={show('detailsLong') ? t('f.details.long', { max: BODY_MAX, n: runes(draft.details.trim()) }) : undefined}
      />
      <Select
        label={t('f.priority')}
        options={PRIORITIES.map((n) => ({ value: String(n), label: t(`f.prio.${n}` as 'f.prio.0') }))}
        value={String(draft.priority)}
        onChange={(x) => edit({ priority: Number(x) })}
        isDisabled={busy || v.phase === 'done'}
      />
      {/* New chat's folder choice: the agent's home folder by its path (when reported), the folders chats ran in, or a typed absolute path. */}
      <FolderField
        computer={computer}
        folders={folders}
        value={draft.cwd}
        noHome
        onChange={(x) => { setTouchedCwd(true); edit({ cwd: x ?? '' }); }}
        isDisabled={busy || v.phase === 'done'}
        {...(show('cwd') ? { errorMessage: t('f.folder.bad') } : {})}
      />
      <Disclosure title={t('f.more')} isExpanded={more} onExpandedChange={setMore}>
        <TextField
          label={t('f.tags')}
          description={t('f.tags.help')}
          value={draft.tags}
          onChange={(x) => edit({ tags: x })}
          isDisabled={busy || v.phase === 'done'}
          errorMessage={show('tagsMany') ? t('f.tags.many', { max: TAGS_MAX, n: tags.length }) : show('tagLong') ? t('f.tags.long', { max: TAG_MAX }) : undefined}
        />
      </Disclosure>
    </Stack>
  );

  // ---- ask the agent ----
  const dock = useAskDock();
  const prompt = t('ask.prompt');
  const [words, setWords] = useState(prompt);
  const [sent, setSent] = useState<AskStartOutcome | 'sending' | null>(null);
  const empty = words.trim() === '' || words.trim() === prompt.trim();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (step !== 'ask') return;
    const el = box.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [step]);
  const askOutcome = useMemo<OutcomeLike | undefined>(
    () => (sent === 'notSent' ? { kind: 'not_sent', message: t('ask.notSent') } : sent === 'unknown' ? { kind: 'pending', message: t('ask.unknown') } : undefined),
    [sent, t],
  );
  const toPanel = (text: string, was = capture().target) => {
    if (was && capture().target?.container.id !== was.container.id) {
      chooseComputer({ id: was.container.id, project_id: was.project.id, ...(was.container.server_name !== undefined ? { server_name: was.container.server_name } : {}) });
    }
    dock.open({ text, source: t('new.title'), ...(was ? { computer: was.container.id } : {}) });
  };
  const send = () => {
    if (empty || sent === 'sending' || sent === 'unknown') return;
    setSent('sending');
    // The start goes to the computer shown now: a start that did not leave after the drawer closed puts its words back there.
    const was = capture().target;
    const text = words;
    void startAgentConversation({
      text,
      source: t('new.title'),
      onStart: (o) => {
        if (live.current) {
          setSent(o);
          if (o === 'sent') close();
          return;
        }
        if (o !== 'notSent') return;
        showToast({
          // noDetails: a start that did not leave carries no rejection (kit startAgentConversation tells only notSent).
          title: t('ask.late', { computer }),
          body: t('ask.lateBody'),
          tone: 'error',
          action: { label: t('ask.lateGo'), onAction: () => toPanel(text, was) },
        });
      },
    });
  };
  const ask = (
    <Stack gap={4}>
      <TextField
        label={t('ask.what')}
        description={t('ask.help')}
        value={words}
        onChange={(x) => { setWords(x); if (sent === 'notSent') setSent(null); }}
        multiline
        rows={4}
        isDisabled={sent === 'sending'}
        isReadOnly={sent === 'unknown'}
        inputRef={box}
      />
      <Row wrap gap={2}>
        {TODO_ASK_EXAMPLES.map((id) => (
          <Button key={id} variant="bubble" literal isDisabled={sent === 'sending' || sent === 'unknown'} onPress={() => setWords((w) => withExample(w, prompt, t(`ask.ex.${id}` as 'ask.ex.backups')))}>
            {t(`ask.ex.${id}` as 'ask.ex.backups')}
          </Button>
        ))}
      </Row>
      {sent !== 'unknown' && (
        <TextButton isDisabled={sent === 'sending'} onPress={() => { toPanel(empty ? prompt : words); close(); }}>{t('ask.panel')}</TextButton>
      )}
    </Stack>
  );

  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && close()}
      title={step === 'ask' ? t('ask.title') : t('new.title')}
      size="md"
      resizeKey="ai-todo-new"
      overlayId="ai-todos-new"
      {...(step === 'ask'
        ? {
            dirty: !empty && sent !== 'sending',
            busy: false,
            footer: (
              <FormFooter
                dirty={!empty && sent !== 'sending'}
                requireDirty={false}
                submitDisabled={empty || sent === 'sending'}
                {...(askOutcome ? { outcome: askOutcome } : {})}
                // The panel holds the conversation and says how it went: Check again goes there; closing leaves no toast.
                // noDetails: a start's outcome carries no rejection (sent, notSent or unknown, kit startAgentConversation).
                onCheck={() => dock.open()}
                toastOnLeave={false}
                submitLabel={sent === 'sending' ? t('ask.sending') : t('ask.send')}
                onSubmit={send}
              />
            ),
          }
        : {
            dirty: formDirty && !busy && v.phase !== 'done',
            busy: v.phase === 'running',
            outcome: <AddOutcome store={store} />,
            primary:
              v.phase === 'done' ? undefined : (
                <Button variant="primary" isDisabled={busy || repeat || (tried && problems.length > 0)} onPress={add}>
                  {t('f.add')}
                </Button>
              ),
          })}
    >
      <Stack gap={4}>
        {asks && (
          <SegmentedControl<'form' | 'ask'>
            label={t('new.mode')}
            value={step}
            onChange={setStep}
            items={[
              { id: 'form', label: t('new.mode.write'), isDisabled: step === 'ask' && (sent === 'sending' || sent === 'unknown') },
              { id: 'ask', label: t('new.mode.ask'), isDisabled: step === 'form' && v.phase !== 'idle' },
            ]}
          />
        )}
        {step === 'ask' ? ask : form}
      </Stack>
    </Drawer>
  );
}

function AddOutcome({ store }: { store: CreateStore }) {
  const t = useStrings(strings);
  const v = useView(store);
  if (v.phase === 'done' && v.todo) {
    return (
      <Outcome
        variant="block"
        outcome="done"
        title={v.picked ? t('o.picked', { num: v.todo.num }) : v.deduped ? t('o.deduped', { num: v.todo.num }) : t('o.done', { num: v.todo.num })}
        detail={v.deduped && !v.picked ? t('o.dedupedBody') : null}
      />
    );
  }
  if (v.phase === 'refused') return <Outcome variant="block" outcome="failed" title={t('o.refused')} error={v.refusal?.error} onDismiss={() => store.clear()} />;
  if (v.phase !== 'unsure') return null;
  // What the last Check again saw: the read failed, nothing matched, or how many match (each one offered by its number).
  const seen = v.observed === 'failed' ? t('o.readFailed') : v.observed === 'read' ? (v.lookalikes.length === 0 ? t('cand.none') : t('cand.match', { count: v.lookalikes.length })) : t('o.unsureBody');
  return (
    <Stack gap={2}>
      <Outcome variant="block" outcome="pending" title={t('o.unsure')} detail={seen} error={v.refusal?.error} onCheck={() => store.check()} checking={v.reading} />
      <Row wrap gap={2}>
        {v.observed === 'read' && v.lookalikes.map((c) => {
          const at = Date.parse(c.createdAt);
          return (
            <Button key={c.id} size="sm" variant="secondary" literal isDisabled={v.reading} onPress={() => store.pick(c.id)}>
              {t('cand.mine', { num: c.num, when: Number.isFinite(at) ? formatDateTime(at) : '—' })}
            </Button>
          );
        })}
        <TextButton isDisabled={v.reading} onPress={() => store.forget()}>{t('o.forget')}</TextButton>
      </Row>
    </Stack>
  );
}
