// The inspector: what happened (a verdict line), the actions, a script run's recent output and the
// technical details in two blocks (the request, then the rest), always open (that is what the inspector is for).
// The actions are one kit ActionBar: Explain first, "Around this moment" and "This computer" beside
// it, and the other places plus "Copy for support" in ⋯; at a narrow width the two secondaries fold into ⋯ too.
import { ActionBar, Band, CodeBlock, DetailBody, DetailHeader, ErrorState, Facts, Skeleton, Stack, StatusPill, SubSection, Verdict, VerdictMark, formatNumber, webAddress, type ActionSpec, type Fact, type MenuList } from '@kit';
import type { OutState } from '../controller';
import { durationOf, outcomeOf, sourceOf, supportLine, techGroups, titleOf, toneOf, type BotRow, type DataItem } from '../logic';
import { asTx, shortClock, type T } from './words';

export interface InspectorProps {
  t: T;
  item: DataItem;
  out: OutState | undefined;
  onAround: (ms: number) => void;
  onExplain: (it: DataItem) => void;
  /** Read this run's output again. */
  onRetryOut?: () => void;
  /** Where this row's computer, program, Bot or script live. */
  links?: ReadonlyArray<{ id: string; label: string; onPress: () => void }>;
}

export function Inspector({ t, item, out, onAround, onExplain, onRetryOut, links }: InspectorProps) {
  const tx = asTx(t);
  const o = outcomeOf(item);
  const d = durationOf(item);
  // The outcome is the verdict's one coloured phrase; when, how long and where from follow it in plain words.
  const src = t(`src.${sourceOf(item)}`);
  const rest = d !== null ? t('ins.restTook', { time: shortClock(item.t), took: t('row.ms', { n: formatNumber(d) }), source: src }) : t('ins.rest', { time: shortClock(item.t), source: src });
  const tone = toneOf(o) === 'danger' ? 'danger' : toneOf(o) === 'ok' ? 'ok' : 'warn';
  return (
    <div>
      <DetailHeader
        title={titleOf(item, tx)}
        {...(o === 'neutral' ? {} : { status: <StatusPill tone={tone} dot>{t(`out.${o}`)}</StatusPill> })}
      />
      <DetailBody>
        <Stack gap={4}>
          <Verdict label={t('ins.what')}>
            {o !== 'neutral' && <><VerdictMark tone={tone === 'ok' ? 'good' : tone}>{t(`out.${o}`)}</VerdictMark>{' · '}</>}
            {rest}
          </Verdict>
          {item.row.truncated === true && <Band size="table" tone="warn" /* noDetails: says the row was cut short, not a failed request */>{t('row.bigWhy')}</Band>}
          <ActionBar label={t('act.group')} {...actionsOf(t, item, tx, onAround, onExplain, links ?? [])} />
          {item.kind === 'script' && <RunOutput t={t} out={out} onRetry={onRetryOut} />}
          {techGroups(item).map((g) => (
            <SubSection key={g.id} title={t(`det.group_${g.id}`)}>
              <Facts columns={2} label={t(`det.group_${g.id}`)} items={g.rows.map(factOf(t))} />
            </SubSection>
          ))}
        </Stack>
      </DetailBody>
    </div>
  );
}

/** One place a row leads to, as the page resolves it. */
type PlaceLink = NonNullable<InspectorProps['links']>[number];

/** The inspector's one group of actions: Explain, then Around and This computer, then the other places and the copy. */
function actionsOf(t: T, item: DataItem, tx: ReturnType<typeof asTx>, onAround: (ms: number) => void, onExplain: (it: DataItem) => void, links: readonly PlaceLink[]) {
  const secondary: ActionSpec[] = [];
  if (item.kind !== 'helper') secondary.push({ id: 'around', label: t('act.around'), onPress: () => onAround(item.t) });
  const computer = links.find((l) => l.id === 'computer');
  if (computer) secondary.push({ id: 'computer', label: computer.label, onPress: computer.onPress });
  const places: MenuList = links.filter((l) => l !== computer).map((l) => ({ id: l.id, label: l.label, onAction: l.onPress }));
  const copy: MenuList = [{ id: 'copy', label: t('act.copy'), icon: 'copy', copy: supportLine(item, tx), onAction: () => undefined }];
  return {
    primary: { id: 'explain', label: t('act.explain'), icon: 'sparkle', onPress: () => onExplain(item) } satisfies ActionSpec,
    ...(secondary.length > 0 ? { secondary: secondary as [ActionSpec] | [ActionSpec, ActionSpec] } : {}),
    menu: places.length > 0 ? [...places, '-' as const, ...copy] : copy,
  };
}

/** Resource, request and run ids are shown masked and copied whole. */
const ID_KEYS: ReadonlySet<string> = new Set(['item', 'request', 'exec']);

/** A long address, message or error takes the whole width under the grid. */
const WIDE_KEYS: ReadonlySet<string> = new Set(['address', 'message', 'error']);

function factOf(t: T) {
  return (r: BotRow): Fact => {
    const label = t(`det.${r.key}` as never);
    if (ID_KEYS.has(r.key) || r.id) return { label, id: r.value };
    // A whole web address is a link whose ids show masked (it can grant access); Copy still takes all of it.
    if (r.key === 'address' && webAddress(r.value)) return { label, url: r.value, secretUrl: true, copy: r.value, wide: true };
    return { label, value: r.value, mono: true, ...(r.key === 'ip' ? {} : { copy: r.value }), ...(WIDE_KEYS.has(r.key) ? { wide: true } : {}) };
  };
}

function RunOutput({ t, out, onRetry }: { t: T; out: OutState | undefined; onRetry?: () => void }) {
  if (!out) return null;
  if ('busy' in out) return <Skeleton variant="detail" />;
  if ('err' in out) return out.err === 'needs_update' || out.err === 'gone' ? null : <ErrorState size="sm" title={t('row.outErr')} {...(onRetry ? { onRetry } : {})} />;
  const label = t('lbl.recent_output');
  // A run that wrote nothing says so as the section's own sentence, with no empty block under it.
  if (!out.out.lines.length) return <SubSection title={label} description={t('row.noOut')} />;
  return (
    <SubSection title={label}>
      <CodeBlock code={out.out.text} label={label} wrap lang="ansi" />
    </SubSection>
  );
}
