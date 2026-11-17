// Changing loops (C9 outcomes). In a loop's detail header (useLoopActions): Pause / Resume / Start
// again (a stopped loop: with the limits it has, counted from zero) as the primary, Run now beside it, and Change end time,
// Change timing or prompt (delete, then a new one in its chat) and Delete under ⋯, each as offered for the loop's state
// (edit.ts actionsFor). In the list's header: New loop in a chat.
//   - A confirm (and the Replace drawer) is bound to the loop it was opened on (confirm.ts): its open reads the chat's
//     loops, the send reads them again and sends nothing if the loop is gone or no longer offers it, and a selection
//     or state change discards it in an effect, so it never comes back.
//   - One change at a time per loop; a change whose answer was lost is "This may have gone through": Check again reads the
//     chat's loops (never sends it again) and settles a pause, resume, start again or delete only when the loop reads in
//     that state (told as what the list shows); a lost run now or end time is never settled, Check again shows the loop
//     as it is now. Stop tracking lets it go.
//   - A lost new loop is never started again or claimed: Check again lists the chat's loops with the same prompt and timing
//     made since it was sent, and the person says which one is theirs, or dismisses.
//   - The stores of a change still out or unknown are kept by the context they were made in (account, realm generation,
//     computer ids) and the loop, so leaving and coming back shows the same outcome; every request carries that context.
//   - The lines stay short; each links to its answer in the tab's questions (faq.ts): the confirms through the kit Dialog
//     faq, the form through a Why, an outcome through a FaqLink beside it.
import { chatListRoutes, coreSource, providers, versionRoute } from '@core';
import {
  ActionBar, Band, Button, DetailBody, DetailHeader, Facts, Verdict, Checkbox, ConfirmDialog, Drawer, FaqLink, ItemList, LinkButton, Outcome, ReasonButton, Row, Select, Stack, StatusLine, TextButton, TextField, Why,
  formatDateTime, useStrings, type ActionSpec, type Fact, type MenuList, type Translate,
} from '@kit';
import { useEffect, useState, type ReactNode } from 'react';
import { pageFaq } from '../../faq';
import { links } from '../../links';
import aiStrings from '../../strings.en.json';
import { useBoundConfirm } from '../confirm';
import { useHeld, useKept, useView } from '../kept';
import { sessionsOf, titleOf, type Session } from '../../parts/chats.logic';
import {
  ENDS, EMPTY_DRAFT, LOOP_PRECOND_CAP, actionsFor, bodyOf, createChangeStore, draftOf, limitsOf, loopsApi, type Action, type ChangeStore, type ChangeView, type Draft, type End, type Unit,
} from './edit';
import { everyOf, type LoopRow } from './logic';
import strings from './Edit.strings.en.json';
import listStrings from './List.strings.en.json';
import s from './Edit.module.css';

type T = Translate<typeof strings>;

/** The loops list read again (each change's done). */
function refreshLoops() {
  void listSource.invalidate(['auto.loops']);
}

const listSource = coreSource('ai', {
  reads: {
    'auto.chatsToLoop': {
      route: chatListRoutes.sessionsHere,
      input: () => ({ query: { limit: 50, page: 1, order: 'last_active' } }),
      select: (raw) => sessionsOf(raw).sessions,
    },
    // The agent's capabilities: with LOOP_PRECOND_CAP each change names the loop as read (edit.ts guardOf).
    'auto.agentVersion': { route: versionRoute },
  },
});

/** The agent reports LOOP_PRECOND_CAP (false while its version read is loading or failed: then nothing extra is sent). */
function useLoopPrecond(): boolean {
  const q = listSource.useQuery<unknown>('auto.agentVersion');
  // Only a read that succeeded: a failed refetch keeps its old data, and a capability not read now sends unguarded.
  return q.status === 'success' && providers.cap(providers.parseVersion(q.data), LOOP_PRECOND_CAP);
}

// ---- outcome words ----

function outcomeOf(t: T, v: ChangeView, computer: string): { kind: 'done' | 'pending' | 'failed'; title: string; detail?: string } | null {
  const a = v.action;
  if (v.phase === 'done') {
    if (a === 'replace') return { kind: 'done', title: t(v.hadOld ? 'o.done.replace' : 'o.done.create') };
    return a ? { kind: 'done', title: t(`${v.fromRead ? 'o.seen' : 'o.done'}.${a}` as 'o.done.pause') } : null;
  }
  if (v.phase === 'refused') {
    if (v.notSent) return { kind: 'failed', title: t(v.notSent === 'changed' ? 'o.notSent.changed' : 'o.notSent.read') };
    // A 404 never says the loop or chat is gone: the agent answers it for another owner's or realm's too. Only a
    // complete listing can show that.
    const notFound = v.refusal?.status === 404;
    if (v.refusal?.code === 'loop_changed') return { kind: 'failed', title: t('o.refused.changed') };
    if (v.step === 'create') return { kind: 'failed', title: notFound ? t('o.refused.chatNotFound', { computer }) : t(v.hadOld ? 'o.refused.replaceCreate' : 'o.refused.create', { computer }) };
    return { kind: 'failed', title: notFound ? t('o.refused.notFound') : t('o.refused') };
  }
  if (v.phase === 'unsure') {
    const detail = v.observed === 'failed' ? t('o.readFailed') : v.observed === 'same' && v.step !== 'create' ? t('o.same') : undefined;
    if (v.step === 'create') return { kind: 'pending', title: t('o.unsure'), detail: detail ?? t('o.unsure.create') };
    if (a === 'replace') return { kind: 'pending', title: t('o.unsure'), detail: detail ?? t('o.unsure.replaceDelete') };
    const never = a === 'runNow' || a === 'extend';
    const now = never && v.now ? t('o.now', { runs: v.now.runCount, ends: v.now.expiresAt ? t('o.now.ends', { when: formatDateTime(Date.parse(v.now.expiresAt)) }) : t('o.now.noEnd') }) : null;
    const said = detail ?? t(never ? 'o.unsure.noProof' : 'o.unsure.detail');
    return { kind: 'pending', title: t('o.unsure'), detail: now ? `${said} ${now}` : said };
  }
  return null;
}

function runningText(t: T, v: ChangeView): string | null {
  if (v.phase !== 'running') return null;
  if (v.step === 'create') return t(v.hadOld ? 'o.running.replace.create' : 'o.running.create');
  if (v.action === 'replace') return t('o.running.replace.delete');
  return v.action ? t(`o.running.${v.action}` as 'o.running.pause') : null;
}

/** The outcome of a change, with Check again, the look-alikes of a lost new loop, and Dismiss. */
function ChangeOutcome({ store, computer, intervalText }: { store: ChangeStore; computer: string; intervalText: (ms: number) => string }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const v = useView(store);
  const running = runningText(t, v);
  const o = outcomeOf(t, v, computer);
  return (
    // No live region of its own: the change in flight is one kit StatusLine
    // that stays mounted and changes only its words; Outcome and Bands beside it carry their own role.
    <div className={s.outcome}>
      <StatusLine>{running}</StatusLine>
      {o && (
        <Outcome
          variant="block"
          outcome={o.kind}
          title={o.title}
          detail={o.detail}
          error={v.refusal?.error}
          onCheck={v.phase === 'unsure' ? () => store.check() : undefined}
          checking={v.reading}
          onDismiss={v.phase === 'done' || v.phase === 'refused' ? () => store.clear() : undefined}
        />
      )}
      {/* The kit shows no Dismiss on an unknown outcome: stopping to watch one is its own, worded press. */}
      {v.phase === 'unsure' && (
        <Row gap={2}>
          <TextButton isDisabled={v.reading} onPress={() => store.forget()}>
            {t('o.forget')}
          </TextButton>
          <FaqLink item={byId.autoUnsure}>{t('more.unsure')}</FaqLink>
        </Row>
      )}
      {o && v.phase !== 'unsure' && (
        <Row gap={2}>
          {v.notSent ? (
            <FaqLink item={byId.autoNotSent}>{t('more.notSent')}</FaqLink>
          ) : (
            <FaqLink item={byId.loopChange}>{t('more.change')}</FaqLink>
          )}
        </Row>
      )}
      {v.phase === 'unsure' && v.step === 'create' && v.observed === 'same' && (
        v.candidates.length === 0 ? (
          <Band tone="neutral" size="table" /* noDetails: what the loop list reads; nothing was refused */>{t('cand.none')}</Band>
        ) : (
          <Stack gap={2}>
            <Band tone="neutral" size="table" /* noDetails: what the loop list reads; nothing was refused */>{t('cand.title')}</Band>
            <ItemList
              label={t('cand.title')}
              items={v.candidates.map((c) => {
                const id = String(c.id);
                const at = Date.parse(String(c.created_at ?? ''));
                return {
                  id,
                  title: t('cand.line', { when: Number.isFinite(at) ? formatDateTime(at) : '—', every: intervalText(Number(c.interval_ms) || 0) }),
                  actions: { inline: [{ id: `cand-${id}`, label: t('cand.mine'), onPress: () => store.pick(id) }] as const },
                };
              })}
            />
          </Stack>
        )
      )}
      {v.awaitingCreate && (
        <Band
          tone="warn"
          size="table" /* noDetails: the old loop read gone; nothing was refused */
          actions={
            <>
              <Button size="sm" variant="primary" onPress={() => void store.startNew()}>
                {t('o.startNew')}
              </Button>
              <TextButton onPress={() => store.forget()}>{t('o.noNew')}</TextButton>
            </>
          }
        >
          {t('o.awaiting')} <FaqLink item={byId.loopChange}>{t('more.change')}</FaqLink>
        </Band>
      )}
    </div>
  );
}

// A limit is shown as it is kept, to 6 decimals of a dollar (cents at least: $0.004 stays $0.004) and to the millisecond (90 s stays 90 seconds).
const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 });
const secs = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

/** A running-time limit in words: whole hours or minutes when it is one, else seconds (to the millisecond). */
function wallText(t: T, ms: number): string {
  const e = everyOf(ms);
  return e.unit === 's' ? `${secs.format(ms / 1000)} ${t('u.s')}` : `${e.n} ${t(`u.${e.unit}` as 'u.min')}`;
}

/** The limits a start again keeps, in words. */
function limitsText(t: T, row: LoopRow): string {
  const parts = [
    row.maxCostUsd > 0 ? t('restart.cost', { usd: usd.format(row.maxCostUsd) }) : '',
    row.maxWallMs > 0 ? t('restart.wall', { time: wallText(t, row.maxWallMs) }) : '',
  ].filter(Boolean);
  return parts.length > 0 ? t('restart.limits', { limits: parts.join(t('restart.and')) }) : t('restart.noLimits');
}

const useEvery = () => {
  const t = useStrings(strings);
  return (ms: number) => {
    const e = everyOf(ms);
    return `${e.n} ${t(`u.${e.unit === 's' ? 'min' : e.unit}` as 'u.min')}`;
  };
};

// ---- the form ----

/** `prefilled`: the draft came from a loop (Replace), so what is wrong with it shows at once: the confirm is disabled for it
 *  and nothing else would say why (an old loop's limit too large to write again). `faq`: the question the form's Why links. */
function LoopForm({ draft, onChange, computer, prefilled = false, promptRequired = false }: { draft: Draft; onChange: (d: Draft) => void; computer: string; prefilled?: boolean; promptRequired?: boolean }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const b = bodyOf(draft);
  const problem = 'problem' in b ? b.problem : null;
  const [touched, setTouched] = useState(prefilled);
  const shown = touched ? problem : null;
  const set = (p: Partial<Draft>) => {
    setTouched(true);
    onChange({ ...draft, ...p });
  };
  const units = (['min', 'h', 'd'] as const).map((u) => ({ value: u, label: t(`u.${u}`) }));
  return (
    <Stack gap={4}>
      <TextField label={t('f.prompt')} description={t('f.promptHelp')} multiline rows={4} value={draft.prompt} onChange={(v) => set({ prompt: v })} {...(promptRequired ? { isRequired: true } : {})} errorMessage={shown === 'prompt' ? t('p.prompt') : undefined} />
      <Row gap={3} align="start" wrap>
        <TextField className={s.every} label={t('f.every')} inputMode="numeric" value={draft.every} onChange={(v) => set({ every: v })} errorMessage={shown === 'every' ? t('p.every') : undefined} />
        <Select<Unit> className={s.unit} label={t('f.unit')} value={draft.unit} onChange={(u) => set({ unit: u })} options={units} />
      </Row>
      <Row gap={3} align="start" wrap>
        <Select<End>
          width="sm"
          label={t('f.ends')}
          value={draft.ends}
          onChange={(e) => set({ ends: e })}
          options={(Object.keys(ENDS) as End[]).map((e) => ({ value: e, label: t(`end.${e}`) }))}
          errorMessage={shown === 'endsShort' ? t('p.endsShort') : undefined}
        />
        <TextField className={s.every} label={t('f.maxRuns')} inputMode="numeric" value={draft.maxRuns} onChange={(v) => set({ maxRuns: v })} errorMessage={shown === 'maxRuns' ? t('p.maxRuns') : undefined} />
      </Row>
      <Checkbox label={t('f.fireNow')} isSelected={draft.fireNow} onChange={(v) => set({ fireNow: v })} />
      <Row gap={3} align="start" wrap>
        <TextField
          width="sm"
          label={t('f.maxCost')}
          description={t('f.maxCostHelp')}
          inputMode="decimal"
          value={draft.maxCost}
          onChange={(v) => set({ maxCost: v })}
          errorMessage={shown === 'maxCost' ? t('p.maxCost') : shown === 'maxCostBig' ? t('p.tooBig') : undefined}
        />
        <TextField
          width="sm"
          label={t('f.maxWall')}
          description={t('f.maxWallHelp')}
          inputMode="numeric"
          value={draft.maxWall}
          onChange={(v) => set({ maxWall: v })}
          errorMessage={shown === 'maxWall' ? t('p.maxWall') : shown === 'maxWallBig' ? t('p.tooBig') : undefined}
        />
        <Select<Unit> width="sm" label={t('f.maxWallUnit')} value={draft.wallUnit} onChange={(u) => set({ wallUnit: u })} options={units} />
      </Row>
      {/* A Replace links the loop-change answer; a new loop the loop basics. */}
      {prefilled ? (
        <Why question={t('f.memoryQ')} faq={{ item: byId.loopChange, label: t('more.change') }}>{t('f.memory', { computer })}</Why>
      ) : (
        <Why question={t('f.memoryQ')} faq={{ item: byId.autoKinds, label: t('more.kinds') }}>{t('f.memory', { computer })}</Why>
      )}
    </Stack>
  );
}

// ---- a loop's actions ----

export interface LoopActionsProps {
  row: LoopRow;
  computer: string;
}

/** A loop's detail with its changes: the header (state pill, and the ActionBar of what the loop offers), then in the body a
 *  paused loop's one-line Verdict, the change's outcome, the confirms and the Replace drawer, then the loop's facts. */
export function LoopDetailFrame({ row, computer, status, facts }: LoopActionsProps & { status: ReactNode; facts: readonly Fact[] }) {
  const t = useStrings(strings);
  const tl = useStrings(listStrings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const every = useEvery();
  const store = useKept(`loop\n${row.key}`, (ctx) => createChangeStore({ api: loopsApi(row.sid, row.realm, ctx), loopId: row.id, ctx }));
  const v = useView(store);
  const [end, setEnd] = useState<End>('1d');
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const busy = v.phase === 'running' || v.phase === 'unsure' || v.awaitingCreate;
  const gone = v.phase === 'done' && (v.action === 'delete' || v.action === 'replace');
  useEffect(() => {
    if (v.phase === 'done') refreshLoops();
  }, [v.phase]);

  const acts = gone ? [] : actionsFor(row.state);
  // What this loop offers now: a confirm whose loop or action it no longer is is discarded, and sends nothing.
  // An expired loop's new end time starts it again: an end-time confirm carries that meaning (its pid), and a change of
  // it is a change of what is offered, so the confirm is discarded and says so.
  const starts = row.state === 'expired' ? 'starts' : '';
  // A start again keeps the limits shown in its confirm: a change of them is a change of what is offered.
  const limits = limitsOf({ max_cost_usd: row.maxCostUsd, max_wall_ms: row.maxWallMs });
  const pidOf = (a: Action) => (a === 'extend' ? starts : a === 'restart' || a === 'replace' ? limits : '');
  const c = useBoundConfirm<Action>({ target: row.key, offered: (a, pid) => acts.includes(a) && pid === pidOf(a), identify: (a, pid) => store.identify(a, pid) });
  // An end the dialog no longer offers (Never, once the loop expired) is reset, never sent.
  useEffect(() => {
    if (row.state === 'expired' && end === 'never') setEnd('1d');
  }, [row.state, end]);
  const ask = c.ask?.action ?? null;
  const guarded = useLoopPrecond();
  const send = (a: Exclude<Action, 'replace'>, i?: Parameters<ChangeStore['run']>[1]) => {
    const b = c.take();
    if (b && b.action === a) void store.run(a, i, b.ident, guarded);
  };
  const dialog = (a: Action) => ({
    isOpen: ask === a,
    onOpenChange: (o: boolean) => void (!o && c.close()),
    confirmDisabled: c.reading || c.unreadable || !c.ask?.ident,
  });
  const readNote = c.unreadable ? t('confirm.unreadable') : c.reading ? t('confirm.reading') : '';
  const press = (a: Action) => {
    if (a === 'resume' || a === 'runNow') return void store.run(a, undefined, null, guarded);
    if (a === 'replace') setDraft(draftOf(row));
    c.open(a, pidOf(a));
  };
  // Pause, Resume or Start again is the primary (an expired loop's is Change end time: it starts it again); Run now beside
  // it; the rest under ⋯ with Delete last, apart. While a change is out or unknown every action says why it waits.
  const head = acts.find((a) => a === 'pause' || a === 'resume' || a === 'restart') ?? (acts.includes('extend') ? 'extend' : undefined);
  const spec = (a: Action): ActionSpec => ({
    id: `loop-${a}`, label: t(`a.${a}` as 'a.pause'), onPress: () => press(a),
    ...(a === 'resume' || a === 'runNow' ? {} : { opens: 'dialog' as const }),
    ...(busy ? { disabledReason: t('a.busy') } : {}),
  });
  const rest = acts.filter((a) => a !== head && a !== 'runNow' && a !== 'delete');
  const item = (a: Action) => ({ id: `loop-${a}`, label: t(`a.${a}` as 'a.pause'), onAction: () => press(a), opens: a !== 'delete', ...(a === 'delete' ? { tone: 'danger' as const } : {}), ...(busy ? { isDisabled: true, disabledReason: t('a.busy') } : {}) });
  const menu: MenuList = [...rest.map(item), ...(acts.includes('delete') ? (rest.length > 0 ? ['-' as const, item('delete')] : [item('delete')]) : [])];
  const bar = acts.length === 0 ? null : (
    <ActionBar
      label={t('a.label')}
      {...(head ? { primary: spec(head) } : {})}
      {...(acts.includes('runNow') ? { secondary: [spec('runNow')] as const } : {})}
      {...(menu.length > 0 ? { menu } : {})}
    />
  );
  const body = (
    <Stack gap={3}>
      {c.changed && !c.ask && (
        <Band tone="warn" size="table" /* noDetails: the confirm closed because the loop moved; nothing was sent */>
          {t('changed')} <FaqLink item={byId.autoNotSent}>{t('more.notSent')}</FaqLink>
        </Band>
      )}
      <ChangeOutcome store={store} computer={computer} intervalText={every} />

      <ConfirmDialog
        {...dialog('pause')}
        overlayId="ai-loops-pause"
        title={t('pause.title')}
        body={readNote ? `${t('pause.effect')} ${t('pause.note')} ${readNote}` : `${t('pause.effect')} ${t('pause.note')}`}
        confirmLabel={t('a.pause')}
        faq={{ item: byId.loopChange, label: t('more.change') }}
        onConfirm={() => send('pause')}
      />
      <ConfirmDialog
        {...dialog('delete')}
        overlayId="ai-loops-delete"
        title={t('delete.title')}
        tone="danger"
        body={readNote ? `${t('delete.effect')} ${readNote}` : t('delete.effect')}
        confirmLabel={t('a.delete')}
        faq={{ item: byId.loopChange, label: t('more.change') }}
        onConfirm={() => send('delete')}
      />
      <ConfirmDialog
        {...dialog('restart')}
        overlayId="ai-loops-restart"
        title={t('restart.title')}
        body={[row.stopReason ? t('restart.why', { why: tl(`stop.${row.stopReason}`) }) : '', t('restart.effect'), limitsText(t, row),
          row.stopReason === 'stop_when' ? t('restart.again') : '', t('restart.cap', { computer }), readNote].filter(Boolean).join(' ')}
        confirmLabel={t('restart.confirm')}
        faq={{ item: byId.loopChange, label: t('more.change') }}
        onConfirm={() => send('restart', { k: 'restart', maxCostUsd: row.maxCostUsd, maxWallMs: row.maxWallMs })}
      />
      <ConfirmDialog
        {...dialog('extend')}
        overlayId="ai-loops-extend"
        title={t('extend.title')}
        body={[row.state === 'expired' ? t('extend.expired') : '', readNote].filter(Boolean).join(' ') || undefined}
        confirmLabel={t('extend.confirm')}
        faq={{ item: byId.loopChange, label: t('more.change') }}
        onConfirm={() => send('extend', { k: 'extend', expiresIn: end === 'never' ? '' : end, ms: ENDS[end] })}
      >
        <Select<End>
          label={t('extend.label')}
          value={end}
          onChange={setEnd}
          // An expired loop is offered only a real end time: it starts again with it.
          options={(Object.keys(ENDS) as End[]).filter((e) => row.state !== 'expired' || e !== 'never').map((e) => ({ value: e, label: t(`end.${e}`) }))}
        />
      </ConfirmDialog>
      <Drawer
        isOpen={ask === 'replace'}
        onOpenChange={(o) => !o && c.close()}
        title={t('replace.title')}
        subtitle={t('replace.body')}
        size="md"
        resizeKey="ai-loop-replace"
        overlayId="ai-loops-replace"
        primary={
          <Button
            variant="primary"
            isDisabled={busy || 'problem' in bodyOf(draft) || c.reading || c.unreadable || !c.ask?.ident}
            onPress={() => {
              const b = bodyOf(draft);
              if ('problem' in b) return;
              const k = c.take();
              if (k && k.action === 'replace') void store.replace(b.body, b.intervalMs, k.ident);
            }}
          >
            {t('replace.confirm')}
          </Button>
        }
      >
        <LoopForm draft={draft} onChange={setDraft} computer={computer} prefilled />
      </Drawer>
    </Stack>
  );
  return (
    <>
      <DetailHeader title={row.prompt} status={status} actions={bar} />
      <DetailBody>
        <Stack gap={4}>
          {row.group === 'paused' ? <Verdict label={tl('d.pausedLabel')} next={tl('d.pausedNext')}>{tl('d.pausedNote')}</Verdict> : null}
          {body}
          <Facts items={facts} columns={1} />
        </Stack>
      </DetailBody>
    </>
  );
}

/** Where a loop's row went away (deleted, or replaced with an answer lost): its change, while one is kept. Nothing when
 *  none is. */
export function HeldLoopChange({ loopKey, computer }: { loopKey: string; computer: string }) {
  const every = useEvery();
  const store = useHeld<ChangeStore>(`loop\n${loopKey}`);
  return store ? <ChangeOutcome store={store} computer={computer} intervalText={every} /> : null;
}

// ---- a new loop ----

export function NewLoop({ computer }: { computer: string }) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" icon="plus" onPress={() => setOpen(true)}>
        {t('new')}
      </Button>
      {open && <NewLoopDrawer computer={computer} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewLoopDrawer({ computer, onClose }: { computer: string; onClose: () => void }) {
  const t = useStrings(strings);
  const every = useEvery();
  const chats = listSource.useQuery<Session[]>('auto.chatsToLoop');
  const open = (chats.data ?? []).filter((c) => c.state !== 'closed');
  const [pick, setPick] = useState<string | undefined>(undefined);
  const chat = open.find((c) => `${c.realm}/${c.id}` === pick);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const store = useKept(`new\n${pick ?? ''}`, (ctx) => createChangeStore({ api: loopsApi(chat?.id ?? '', chat?.realm ?? '', ctx), loopId: null, ctx }));
  const v = useView(store);
  const busy = v.phase === 'running' || v.phase === 'unsure';
  useEffect(() => {
    if (v.phase === 'done') refreshLoops();
  }, [v.phase]);
  const b = bodyOf(draft);
  // No open chat: nothing to add a loop to, so the drawer offers a new chat instead of the form.
  const none = !chats.isPending && !chats.error && open.length === 0;
  // Why Start loop is off, said at the button, for the two blockers no field names by itself: no chat picked (a Select
  // has no error of its own here) and an empty prompt (the form marks a field only after one of its fields changed, and
  // picking a chat is not one). Any other problem is marked at its field, so the button stays plainly off for it.
  const why = busy ? null : !chat ? (chats.isPending || chats.error ? null : t('new.needChat')) : 'problem' in b && b.problem === 'prompt' ? t('p.prompt') : null;
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('new.title')}
      subtitle={t('new.subtitle', { computer })}
      size="md"
      resizeKey="ai-loop-new"
      overlayId="ai-loops-new"
      busy={v.phase === 'running'}
      dirty={!busy && v.phase !== 'done' && (draft.prompt.trim() !== '' || pick !== undefined)}
      outcome={<ChangeOutcome store={store} computer={computer} intervalText={every} />}
      primary={
        v.phase === 'done' || none ? undefined : why !== null ? (
          <ReasonButton variant="primary" reason={why}>{t('new.confirm')}</ReasonButton>
        ) : (
          <Button
            variant="primary"
            isDisabled={busy || !chat || 'problem' in b}
            onPress={() => {
              if (!chat || 'problem' in b) return;
              void store.replace(b.body, b.intervalMs);
            }}
          >
            {t('new.confirm')}
          </Button>
        )
      }
    >
      <Stack gap={4}>
        {chats.isPending ? (
          <Band tone="neutral" size="table" icon="clock" /* noDetails: the chats are being read */>{t('new.chatsLoading')}</Band>
        ) : chats.error ? (
          <Band tone="warn" size="table" error={chats.error} actions={<TextButton onPress={() => void chats.refetch()}>{t('retry')}</TextButton>}>
            {t('new.chatsFailed')}
          </Band>
        ) : none ? (
          <Band tone="neutral" size="table" actions={<LinkButton size="sm" href={links.newChat} variant="primary">{t('new.newChat')}</LinkButton>} /* noDetails: the chat list reads none open; nothing was refused */>
            {t('new.noChats')}
          </Band>
        ) : (
          <Select<string>
            label={t('new.chat')}
            placeholder={t('new.chatPick')}
            value={pick}
            isRequired
            isDisabled={busy || v.phase === 'done'}
            onChange={setPick}
            options={open.map((c) => ({ value: `${c.realm}/${c.id}`, label: titleOf(c) || c.id.slice(0, 8) }))}
          />
        )}
        {none ? null : <LoopForm draft={draft} onChange={setDraft} computer={computer} promptRequired />}
      </Stack>
    </Drawer>
  );
}
