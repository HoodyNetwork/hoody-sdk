// Details → Usage: this chat's tokens, cost and requests, by model and by turn.
// Self-contained: the host gives the store (one per chat, kept for as long as the
// chat is open; `refresh()` after each turn) and the chat's turns as the stream's `stream_done` counts (see usage.ts).
// A usage `turn_id` is a model request, not a chat turn: requests are placed under turns only where a response's counts
// match one; the rest is "Other spend". Words are fixed; the server's text is never shown.
import { useEffect, useMemo } from 'react';
import { Band, EmptyState, ErrorState, Facts, InlineActions, Skeleton, StatusPill, SubSection, TextButton, useStrings } from '@kit';
import { byModel, groupTurns, sideOf, speechOf, type UsageRequest, type TurnResponses } from './usage';
import { useUsageView, type UsageStore } from './useUsage';
import { errWord, int, money, usageFacts, type UsageWords } from './Usage.pure';
import strings from './Usage.strings.en.json';
import s from './Usage.module.css';

export interface UsageTurn extends TurnResponses {
  /** The turn as the person knows it ("Turn 3", or the start of what they asked). */
  label: string;
}

export interface UsageTabProps {
  store: UsageStore;
  turns: readonly UsageTurn[];
}

type T = UsageWords;

export function UsageTab({ store, turns }: UsageTabProps) {
  const t = useStrings(strings);
  const v = useUsageView(store);
  useEffect(() => { void store.load(); }, [store]);
  const grouped = useMemo(() => groupTurns(v.requests, turns, { partial: v.more }), [v.requests, turns, v.more]);
  const models = useMemo(() => byModel(v.requests), [v.requests]);
  const speech = useMemo(() => speechOf(v.rows), [v.rows]);
  const side = useMemo(() => sideOf(v.rows), [v.rows]);

  if (v.phase === 'idle' || v.phase === 'loading') return <Skeleton />;
  if (v.phase === 'failed') {
    const e = v.error;
    return (
      <ErrorState
        /* noDetails: fixed words only; the agent's code and text are never shown */
        title={t('failed.title')}
        body={e?.code === 'unreadable' ? t('failed.unreadable') : e?.code === 'stale' ? t('failed.stale') : e && e.status > 0 ? t('failed.status', { status: String(e.status) }) : t('failed.generic')}
        onRetry={() => void store.load()}
      />
    );
  }

  const { facts, speechCost, speechCalls } = usageFacts(t, v, speech, side);

  return (
    <div className={s.stack}>
      {/* Kit sections with their headers (each a named region): the totals, then By model, By turn and Other
          spend, each with its note as the description. The totals' facts take the section's name, so they carry no second
          label of their own. Update stays an inline action under the facts it reads again: a header ActionBar would fold
          it into More below 600 px of content, and Details is often narrower than that. */}
      <SubSection title={t('title')}>
        {v.stale && <Band tone="warn" size="table" /* noDetails: the update did not come through; Update tries again */ actions={<TextButton onPress={() => void store.refresh()} isDisabled={v.reading}>{t('retry')}</TextButton>}>{t('stale')}</Band>}
        {facts.length > 0 && <Facts items={facts} columns={2} />}
        <InlineActions size="sm" actions={[{ id: 'usage-update', label: v.reading ? t('updating') : t('update'), onPress: () => void store.refresh(), busy: v.reading }]} />
        {speechCalls > 0 && <p className={s.note}>{t('speech', { count: speechCalls, cost: money(speechCost) })}</p>}
        {side.calls > 0 && <p className={s.note}>{t('side', { count: side.calls, cost: money(side.cost) })}</p>}
        {(v.more || v.heldPast) && <Band tone="neutral" size="table">{v.heldPast ? t('more.held') : t('more')}</Band>}
        {v.requests.length === 0 && <EmptyState size="compact" title={t('empty')} />}
      </SubSection>
      {v.requests.length > 0 && (
        <>
          <SubSection title={t('model.title')}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">{t('model.col.model')}</th>
                  <th scope="col" className={s.num}>{t('model.col.requests')}</th>
                  <th scope="col" className={s.num}>{t('model.col.tokens')}</th>
                  <th scope="col" className={s.num}>{t('model.col.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={`${m.provider}/${m.model}`}>
                    <th scope="row" className={s.name}>
                      {m.model}
                      {m.failed > 0 && <span className={s.bad}> · {t('model.failed', { n: String(m.failed) })}</span>}
                      {m.open > 0 && <span className={s.warn}> · {t('model.open', { n: String(m.open) })}</span>}
                    </th>
                    <td className={s.num}>{int.format(m.requests)}</td>
                    <td className={s.num}>
                      {int.format(m.input + m.cacheRead + m.cacheWrite)} / {int.format(m.output)}
                      {/* Of the tokens in: how many the provider served from its cache (the figure a request row calls cached),
                          said only when there are some, as a request row does. */}
                      {m.cacheRead > 0 && <span className={s.sub}>{t('req.cached', { n: int.format(m.cacheRead) })}</span>}
                    </td>
                    <td className={s.num}>{money(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SubSection>
          {grouped.turns.length > 0 && (
            <SubSection title={t('turns.title')} description={t('turns.note')}>
              {grouped.turns.map((g, i) => (
                <div key={g.key} className={s.turn}>
                  <div className={s.turnHead}>
                    <strong>{turns[i]?.label ?? g.key}</strong>
                    <span className={s.dim}>
                      {g.requests.length === 1 ? t('turn.requests.one') : t('turn.requests.many', { n: String(g.requests.length) })} · {money(g.cost)}
                    </span>
                  </div>
                  {g.requests.length === 0 ? <p className={s.note}>{t('turn.empty')}</p> : <Requests t={t} list={g.requests.map((x) => x.request)} inferred={new Set(g.requests.filter((x) => x.ambiguous).map((x) => x.request.id))} />}
                  {g.ambiguous > 0 && <p className={s.warn}>{t('turn.ambiguous', { n: String(g.ambiguous) })}</p>}
                  {g.unmatched > 0 && <p className={s.warn}>{t('turn.unmatched', { n: String(g.unmatched) })}</p>}
                </div>
              ))}
            </SubSection>
          )}
          {grouped.other.length > 0 && (
            <SubSection title={t('other.title')} description={t('other.note')}>
              <Requests t={t} list={grouped.other} />
            </SubSection>
          )}
        </>
      )}
    </div>
  );
}

function Requests({ t, list, inferred }: { t: T; list: readonly UsageRequest[]; inferred?: ReadonlySet<string> }) {
  return (
    <ul className={s.list}>
      {list.map((q) => (
        <li key={q.id} className={s.req}>
          <span className={s.reqMain}>
            <span className={s.name}>{q.model}</span>
            {q.kind !== 'chat' && <span className={s.dim}>{t(`req.kind.${q.kind === 'speech' ? 'side' : q.kind}` as 'req.kind.side')}</span>}
            {q.state === 'failed' && <StatusPill tone="danger">{t('req.failed')}</StatusPill>}
            {q.state === 'open' && <StatusPill tone="warn">{t('req.open')}</StatusPill>}
            {q.state !== 'ok' && q.errorCode !== '' && <span className={s.dim}>{errWord(t, q.errorCode)}</span>}
            {q.retries > 0 && <span className={s.dim}>{q.retries === 1 ? t('req.retries.one') : t('req.retries.many', { n: String(q.retries) })}</span>}
          </span>
          <span className={s.dim}>
            {t('req.tokens', { input: int.format(q.billed.input + q.billed.cacheRead + q.billed.cacheWrite), output: int.format(q.billed.output) })}
            {q.billed.cacheRead > 0 && ` · ${t('req.cached', { n: int.format(q.billed.cacheRead) })}`}
            {' · '}{money(q.cost)}
            {q.uncertain && <span className={s.warn}> · {t('req.uncertain')}</span>}
            {inferred?.has(q.id) && <span className={s.warn}> · {t('req.inferred')}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
