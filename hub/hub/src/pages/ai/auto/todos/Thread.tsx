// One TODO beside the list, read only: what triage asks, the details, the proposed runs and the activity
// thread, oldest first. Its own read (GET /todos/{id}) is re-read with the list when the store cursor moves.
// Run, approve, deny and cancel run are Actions.tsx: Run or Cancel run in the header beside the TODO's state, the
// waiting runs once under it, so "Proposed runs" lists only the others; the Hub claims no TODO.
import { Button, DetailBody, DetailHeader, ErrorState, Section, Skeleton, Stack, StatusPill, Tag, When, formatDateTime, useStrings } from '@kit';
import { TodoActions, useTodoActions } from './Actions';
import { useTodo } from './data';
import type { Proposal, ThreadEntry, TodoRow } from './logic';
import strings from './List.strings.en.json';
import actionStrings from './Actions.strings.en.json';
import s from './List.module.css';

const KINDS = ['filed', 'comment', 'note', 'triage', 'state', 'run_start', 'run_end', 'proposal', 'agent_msg', 'lease', 'snooze'] as const;
const ACTORS = ['human', 'agent', 'triage', 'orchestrator', 'worker', 'daemon'] as const;
type Kind = (typeof KINDS)[number] | 'other';
type Actor = (typeof ACTORS)[number] | 'other';
const kindOf = (k: string): Kind => ((KINDS as readonly string[]).includes(k) ? (k as Kind) : 'other');
const actorOf = (a: string): Actor => ((ACTORS as readonly string[]).includes(a) ? (a as Actor) : 'other');
const STATES = ['inbox', 'ready', 'blocked', 'in_progress', 'review', 'done', 'dropped'] as const;
const P_TONE = { pending: 'warn', approved: 'ok', denied: 'neutral', expired: 'neutral', unknown: 'neutral' } as const;

const when = (iso: string) => (Number.isFinite(Date.parse(iso)) ? <When at={iso} /> : null);

/** A TODO's state as one pill, in the list's state column and its detail header: what triage asks a person, the runs
 *  waiting for one, a worker running it, else its state. */
export function TodoStatePill({ tab, needsHuman, pending, state }: { tab: TodoRow['tab']; needsHuman: boolean; pending: number; state: string }) {
  const t = useStrings(strings);
  if (tab === 'waiting') return <StatusPill tone="warn">{needsHuman ? t('tab.waiting') : t('waiting.proposals', { count: pending })}</StatusPill>;
  if (tab === 'running') return <StatusPill tone="ok" dot>{t('st.in_progress')}</StatusPill>;
  const known = (STATES as readonly string[]).includes(state) ? (state as (typeof STATES)[number]) : 'other';
  return <StatusPill tone={known === 'blocked' ? 'warn' : 'neutral'}>{t(`st.${known}`)}</StatusPill>;
}

export function TodoThread({ row }: { row: TodoRow }) {
  const t = useStrings(strings);
  const tt = useStrings(actionStrings);
  const q = useTodo(row.id);
  const th = q.data;
  const acts = useTodoActions(row);
  const others = th ? th.proposals.filter((p) => !acts.waiting.has(p.id)) : [];
  return (
    <div>
      <DetailHeader
        title={row.title}
        status={<TodoStatePill tab={row.tab} needsHuman={row.needsHuman} pending={row.pendingProposals} state={row.state} />}
        meta={<Tag>{t('num', { n: row.num })}</Tag>}
        actions={
          acts.head?.action === 'cancelRun' ? (
            <Button variant="secondary" tone="danger" chip={false} isDisabled={acts.head.busy} onPress={acts.head.open}>
              {tt('a.cancelRun')}
            </Button>
          ) : acts.head ? (
            <Button variant="secondary" isDisabled={acts.head.busy} onPress={acts.head.open}>
              {tt('a.run')}
            </Button>
          ) : null
        }
      />
      <DetailBody>
        <Stack gap={4}>
          <TodoActions ctl={acts.ctl} />
          {row.question && (
            <Section title={t('t.question')}>
              <p className={s.prose}>
                <bdi>{row.question}</bdi>
              </p>
            </Section>
          )}
          {row.wakeAt !== null && <p className={s.note}>{t('t.snoozed', { when: formatDateTime(row.wakeAt) })}</p>}
          {q.isPending ? (
            <Skeleton rows={4} variant="text" />
          ) : q.error ? (
            <ErrorState size="sm" title={t('t.error')} error={q.error} onRetry={() => void q.refetch()} />
          ) : !th ? null : (
            <>
              {th.body && (
                <Section title={t('t.body')}>
                  <p className={s.prose}>
                    <bdi>{th.body}</bdi>
                  </p>
                </Section>
              )}
              {others.length > 0 && (
                <Section title={t('t.proposals')}>
                  <ul className={s.entries}>
                    {others.map((p) => (
                      <ProposalLine key={p.id} p={p} />
                    ))}
                  </ul>
                </Section>
              )}
              <Section title={t('t.thread')}>
                {th.entries.length === 0 ? (
                  <p className={s.note}>{t('t.empty')}</p>
                ) : (
                  <ol className={s.entries}>
                    {th.entries.map((e, i) => (
                      <EntryLine key={e.id || i} e={e} />
                    ))}
                  </ol>
                )}
              </Section>
            </>
          )}
        </Stack>
      </DetailBody>
    </div>
  );
}

function ProposalLine({ p }: { p: Proposal }) {
  const t = useStrings(strings);
  return (
    <li className={s.entry}>
      <div className={s.entryHead}>
        <span>{p.agent ? t('t.proposal', { agent: p.agent }) : t('t.proposalAny')}</span>
        <StatusPill tone={P_TONE[p.status]}>{t(`p.${p.status}`)}</StatusPill>
      </div>
      {p.prompt && (
        <p className={s.prose}>
          <bdi>{p.prompt}</bdi>
        </p>
      )}
    </li>
  );
}

function EntryLine({ e }: { e: ThreadEntry }) {
  const t = useStrings(strings);
  return (
    <li className={s.entry}>
      <div className={s.entryHead}>
        <span>{t('by', { what: t(`k.${kindOf(e.kind)}`), who: t(`a.${actorOf(e.actor)}`) })}</span>
        <span className={s.when}>{when(e.ts)}</span>
      </div>
      {e.body && (
        <p className={s.prose}>
          <bdi>{e.body}</bdi>
        </p>
      )}
    </li>
  );
}
