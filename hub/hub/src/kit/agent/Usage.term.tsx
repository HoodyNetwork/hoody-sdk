// Usage.term: Details → Usage in the terminal. The totals are the kit's (SubSection, Facts, the Update action), as on the
// web. By model is a table sized to what it holds: the three figure columns are as wide as their widest value and
// right-aligned so digits line up, and the model name takes the rest and wraps whole (never cut: it is what a row is
// about). Where the pane leaves the name under NAME_MIN cells the table stacks: the name, then its figures labelled by
// their column headers on the line under it. A turn is a block: its label with the request count and cost at the end of
// the row, its requests indented under it (the model and its marks, then the figures), a blank row before the next turn.
// The figures, grouping and every word are the web's (usage.ts, Usage.pure): nothing here reads anything by itself.
import { useEffect, useMemo } from 'react';
import type * as Web from './Usage';
import { Box, Text, cellWidth, useBoxSize } from '@term/prim';
import { Band, EmptyState, ErrorState, Facts, InlineActions, Skeleton, StatusPill, SubSection, TextButton, useStrings } from '@kit';
import { byModel, groupTurns, sideOf, speechOf, type UsageRequest } from './usage';
import { useUsageView } from './useUsage';
import { errWord, int, money, usageFacts, type UsageWords } from './Usage.pure';
import strings from './Usage.strings.en.json';

export type { UsageTabProps, UsageTurn } from './Usage';

/** The model column's least width beside the figure columns; under it the table stacks. */
const NAME_MIN = 16;
/** Cells between two columns. */
const GAP = 2;

export const UsageTab: typeof Web.UsageTab = ({ store, turns }) => {
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
    <Box dir="column" gap={1} shrink={0}>
      <SubSection title={t('title')}>
        {v.stale && <Band tone="warn" size="table" /* noDetails: the update did not come through; Update tries again */ actions={<TextButton onPress={() => void store.refresh()} isDisabled={v.reading}>{t('retry')}</TextButton>}>{t('stale')}</Band>}
        {facts.length > 0 && <Facts items={facts} columns={2} />}
        <InlineActions size="sm" actions={[{ id: 'usage-update', label: v.reading ? t('updating') : t('update'), onPress: () => void store.refresh(), busy: v.reading }]} />
        {speechCalls > 0 && <Text colour="muted">{t('speech', { count: speechCalls, cost: money(speechCost) })}</Text>}
        {side.calls > 0 && <Text colour="muted">{t('side', { count: side.calls, cost: money(side.cost) })}</Text>}
        {(v.more || v.heldPast) && <Band tone="neutral" size="table">{v.heldPast ? t('more.held') : t('more')}</Band>}
        {v.requests.length === 0 && <EmptyState size="compact" title={t('empty')} />}
      </SubSection>
      {v.requests.length > 0 && (
        <>
          <SubSection title={t('model.title')}>
            <ModelTable t={t} models={models} />
          </SubSection>
          {grouped.turns.length > 0 && (
            <SubSection title={t('turns.title')} description={t('turns.note')}>
              <Box dir="column" gap={1} shrink={0}>
                {grouped.turns.map((g, i) => (
                  <Box key={g.key} dir="column" shrink={0}>
                    <Box dir="row" gap={GAP} shrink={0}>
                      <Box grow={1} shrink={1}><Text bold>{turns[i]?.label ?? g.key}</Text></Box>
                      <Box shrink={0}>
                        <Text colour="muted">{`${g.requests.length === 1 ? t('turn.requests.one') : t('turn.requests.many', { n: String(g.requests.length) })} · ${money(g.cost)}`}</Text>
                      </Box>
                    </Box>
                    <Box dir="column" shrink={0} padX={2}>
                      {g.requests.length === 0 ? <Text colour="muted">{t('turn.empty')}</Text> : <Requests t={t} list={g.requests.map((x) => x.request)} inferred={new Set(g.requests.filter((x) => x.ambiguous).map((x) => x.request.id))} />}
                      {g.ambiguous > 0 && <Warn>{t('turn.ambiguous', { n: String(g.ambiguous) })}</Warn>}
                      {g.unmatched > 0 && <Warn>{t('turn.unmatched', { n: String(g.unmatched) })}</Warn>}
                    </Box>
                  </Box>
                ))}
              </Box>
            </SubSection>
          )}
          {grouped.other.length > 0 && (
            <SubSection title={t('other.title')} description={t('other.note')}>
              <Requests t={t} list={grouped.other} />
            </SubSection>
          )}
        </>
      )}
    </Box>
  );
};

/** A warn line: its mark, then the words wrapping beside it. */
function Warn({ children }: { children: string }) {
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Box shrink={0}><Text colour="warn" bold>!</Text></Box>
      <Box grow={1} shrink={1}><Text colour="warn">{children}</Text></Box>
    </Box>
  );
}

function ModelTable({ t, models }: { t: UsageWords; models: ReturnType<typeof byModel> }) {
  const [size, onSize] = useBoxSize();
  const head = [t('model.col.requests'), t('model.col.tokens'), t('model.col.cost')] as const;
  const rows = models.map((m) => ({ m, cells: [int.format(m.requests), `${int.format(m.input + m.cacheRead + m.cacheWrite)} / ${int.format(m.output)}`, money(m.cost)] as const }));
  const widths = head.map((h, i) => Math.max(cellWidth(h), ...rows.map((r) => cellWidth(r.cells[i]!))));
  const figures = widths.reduce((a, b) => a + b + GAP, 0);
  const stacked = size !== null && size.width - figures < NAME_MIN;
  const name = (m: (typeof models)[number]) => (
    <Text bold={stacked}>
      {m.model}
      {m.failed > 0 && <Text colour="danger">{` · ${t('model.failed', { n: String(m.failed) })}`}</Text>}
      {m.open > 0 && <Text colour="warn">{` · ${t('model.open', { n: String(m.open) })}`}</Text>}
    </Text>
  );
  if (stacked) {
    return (
      <Box dir="column" shrink={0} onSize={onSize} sem={{ role: 'table' }}>
        {rows.map(({ m, cells }) => (
          <Box key={`${m.provider}/${m.model}`} dir="column" shrink={0} sem={{ role: 'row' }}>
            <Box shrink={0} sem={{ role: 'rowheader' }}>{name(m)}</Box>
            <Box dir="row" wrap gapX={GAP} shrink={0} padX={2}>
              {cells.map((c, i) => (
                <Box key={head[i]} shrink={0} sem={{ role: 'cell' }}><Text colour="muted">{`${head[i]} `}<Text>{c}</Text></Text></Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <Box dir="column" shrink={0} onSize={onSize} sem={{ role: 'table' }}>
      <Box dir="row" gap={GAP} shrink={0} border={['bottom']} borderColour="line" sem={{ role: 'row' }}>
        <Box grow={1} shrink={1} sem={{ role: 'columnheader' }}><Text colour="muted" truncate>{t('model.col.model')}</Text></Box>
        {head.map((h, i) => <Box key={h} width={widths[i]!} shrink={0} sem={{ role: 'columnheader' }}><Text colour="muted" align="right" width={widths[i]!}>{h}</Text></Box>)}
      </Box>
      {rows.map(({ m, cells }) => (
        <Box key={`${m.provider}/${m.model}`} dir="row" gap={GAP} shrink={0} sem={{ role: 'row' }}>
          <Box grow={1} shrink={1} sem={{ role: 'rowheader' }}>{name(m)}</Box>
          {cells.map((c, i) => <Box key={head[i]} width={widths[i]!} shrink={0} sem={{ role: 'cell' }}><Text align="right" width={widths[i]!}>{c}</Text></Box>)}
        </Box>
      ))}
    </Box>
  );
}

function Requests({ t, list, inferred }: { t: UsageWords; list: readonly UsageRequest[]; inferred?: ReadonlySet<string> }) {
  return (
    <Box dir="column" shrink={0} sem={{ role: 'list' }}>
      {list.map((q) => (
        <Box key={q.id} dir="column" shrink={0} sem={{ role: 'listitem' }}>
          <Box dir="row" wrap gapX={1} shrink={0}>
            <Box shrink={1}><Text>{q.model}</Text></Box>
            {q.kind !== 'chat' && <Box shrink={0}><Text colour="muted">{t(`req.kind.${q.kind === 'speech' ? 'side' : q.kind}` as 'req.kind.side')}</Text></Box>}
            {q.state === 'failed' && <Box shrink={0}><StatusPill tone="danger">{t('req.failed')}</StatusPill></Box>}
            {q.state === 'open' && <Box shrink={0}><StatusPill tone="warn">{t('req.open')}</StatusPill></Box>}
            {q.state !== 'ok' && q.errorCode !== '' && <Box shrink={0}><Text colour="muted">{errWord(t, q.errorCode)}</Text></Box>}
            {q.retries > 0 && <Box shrink={0}><Text colour="muted">{q.retries === 1 ? t('req.retries.one') : t('req.retries.many', { n: String(q.retries) })}</Text></Box>}
          </Box>
          <Box shrink={0} padX={2}>
            <Text colour="muted">
              {t('req.tokens', { input: int.format(q.billed.input + q.billed.cacheRead + q.billed.cacheWrite), output: int.format(q.billed.output) })}
              {q.billed.cacheRead > 0 ? ` · ${t('req.cached', { n: int.format(q.billed.cacheRead) })}` : ''}
              {` · ${money(q.cost)}`}
              {q.uncertain && <Text colour="warn">{` · ${t('req.uncertain')}`}</Text>}
              {inferred?.has(q.id) && <Text colour="warn">{` · ${t('req.inferred')}`}</Text>}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
