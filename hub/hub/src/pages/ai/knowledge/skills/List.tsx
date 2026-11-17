// AI → Knowledge → Skills, installed: the computer's skills in this realm as a list, and one skill's
// detail with its on/off switch. On and trust are shown apart and the switch never changes trust (enable ≠ trust): an untrusted
// skill that is on says its instructions are withheld. On/off is sent once; a lost answer is "may have gone through" with Check
// again (a read) until a fresh list shows the value, never sent again on its own (C9). Search, filters, sort, page and the open
// skill live in the URL (useDataView). Mounted by the /ai routes; it reads the top bar's computer and realm, and the
// tab passes the shown computer's record (name, handle, running) for the skill's files (Files.tsx).
import {
  Button, ComputerRequired, ConfirmDialog, DataTable, DetailPage, EmptyState, FaqLink, Facts, ListDetailPage, Outcome, Section, StatusPill, Switch,
  createColumnHelper, useDataView, useStrings, type Fact, type RowActionEntry, type Tone,
} from '@kit';
import { refusal, useCurrentComputer } from '@core';
import { useMemo, useState } from 'react';
import { type SkillsAt, useSkills, useSkillsAt, useToggle } from './data';
import { SkillFiles, type ShownComputer } from './Files';
import { SkillHub } from './Hub';
import { SkillImport } from './Import';
import { type Root, type SkillRow, type SkillState, type TrustState, attentionRank, canSwitch } from './logic';
import strings from './strings.en.json';
import { SkillTrust } from './Trust';
import { useAiRealm } from '../../aiRealm';
import { pageFaq } from '../../faq';
import aiStrings from '../../strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<SkillRow>();
const STATES: readonly SkillState[] = ['on', 'off', 'shadowed', 'broken'];
const ROOTS: readonly Root[] = ['project', 'user', 'config', 'bundled', 'other'];
const STATE_TONE: Record<SkillState, Tone> = { on: 'ok', off: 'neutral', shadowed: 'neutral', broken: 'danger' };
const TRUST_TONE: Record<TrustState, Tone> = { local: 'neutral', trusted: 'ok', untrusted: 'warn', changed: 'danger' };

export default function SkillsView({ computer: shown }: { computer?: ShownComputer } = {}) {
  const t = useStrings(strings);
  const computer = useCurrentComputer();
  const at = useSkillsAt();
  const { deciding } = useAiRealm();
  const header = { title: t('title'), subtitle: t('subtitle') };
  if (!computer) return <ComputerRequired state="none" header={header} />;
  // Under All realms, while the computer's realms are read (aiRealm.ts): loading, not the realm question.
  if (!at && deciding) return <ListDetailPage header={header} state={{ kind: 'loading' }} list={null} detail={null} />;
  if (!at) return <ListDetailPage header={header} state={{ kind: 'notHere', icon: 'realm', title: t('allRealms.title'), body: t('allRealms.body') }} list={null} detail={null} />;
  // Keyed by computer and realm: a switch's local state and outcome belong to one place, never carried to another computer
  // whose list has a skill in the same folder.
  return <SkillsList key={`${at.target.container.id}\u0000${at.realm}`} at={at} computer={shown} />;
}

function SkillsList({ at, computer }: { at: SkillsAt; computer: ShownComputer | undefined }) {
  const t = useStrings(strings);
  const skills = useSkills(at);
  const rows = skills.data?.items;
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('col.name'), meta: { pinned: true } }),
      col.accessor((r) => STATES.indexOf(r.state), {
        id: 'state',
        header: t('col.state'),
        meta: { width: '132px', priority: 1, list: 'status' },
        cell: (c) => <StatusPill tone={STATE_TONE[c.row.original.state]} dot>{t(`state.${c.row.original.state}`)}</StatusPill>,
      }),
      col.accessor((r) => attentionRank(r), {
        id: 'trust',
        header: t('col.trust'),
        meta: { width: '200px', priority: 2 },
        cell: (c) => <StatusPill tone={TRUST_TONE[c.row.original.trust]}>{t(`trust.${c.row.original.trust}`)}</StatusPill>,
      }),
      col.accessor((r) => t(`where.${r.root}`), { id: 'where', header: t('col.where'), meta: { width: '160px', priority: 3 } }),
      col.accessor('description', { header: t('col.description'), meta: { priority: 4 } }),
    ],
    [t],
  );
  const view = useDataView<SkillRow>({
    rows,
    columns,
    getRowId: (r) => r.id,
    search: ['name', 'description'],
    filters: [
      { id: 'state', label: t('filter.state'), value: (r) => r.state, options: STATES.map((s) => ({ value: s, label: t(`state.${s}`) })) },
      { id: 'where', label: t('filter.where'), value: (r) => r.root, options: ROOTS.map((s) => ({ value: s, label: t(`where.${s}`) })) },
    ],
    sort: 'name',
    pageSize: 50,
    isLoading: skills.isPending,
    error: skills.error,
  });
  const current = rows?.find((r) => r.id === view.activeId);
  const actions = (r: SkillRow): readonly RowActionEntry[] => [{ id: 'open', label: t('action.open'), icon: 'arrow-right', onAction: () => view.open(r.id) }];
  // The Skill Hub and Import drawers. "Open it" after an install shows that skill in this list.
  const [adding, setAdding] = useState<'hub' | 'import' | null>(null);
  const openIt = (id: string) => { setAdding(null); view.open(id); };
  return (
    <>
    <ListDetailPage
      storageKey="ai-skills"
      header={{
        title: t('title'),
        subtitle: t('subtitle'),
        actions: (
          <>
            <Button variant="secondary" icon="download" onPress={() => setAdding('import')}>{t('list.import')}</Button>
            <Button variant="secondary" icon="market" onPress={() => setAdding('hub')}>{t('list.hub')}</Button>
          </>
        ),
      }}
      list={
        <DataTable
          label={t('title')}
          columns={columns}
          view={view}
          onRetry={() => void skills.refetch()}
          onRefresh={() => void skills.refetch()}
          noMatch={t('noMatch')}
          countLabel={(n) => t('count', { count: n })}
          onRowAction={(r) => view.open(r.id)}
          actions={actions}
          storageKey="ai-skills"
          empty={<EmptyState icon="sparkle" title={t('empty.title')} body={t('empty.body')} />}
        />
      }
      detail={
        view.activeId === undefined ? null : current ? (
          <SkillDetail key={current.id} row={current} rows={rows ?? []} at={at} computer={computer} />
        ) : rows ? (
          <EmptyState icon="warn" title={t('detail.notFound')} action={<Button onPress={() => view.open(undefined)}>{t('detail.back')}</Button>} />
        ) : null
      }
    />
    <SkillHub at={at} isOpen={adding === 'hub'} onOpenChange={(o) => setAdding(o ? 'hub' : null)} onOpen={openIt} />
    <SkillImport at={at} isOpen={adding === 'import'} onOpenChange={(o) => setAdding(o ? 'import' : null)} onOpen={openIt} />
    </>
  );
}

function SkillDetail({ row, rows, at, computer }: { row: SkillRow; rows: readonly SkillRow[]; at: SkillsAt; computer: ShownComputer | undefined }) {
  const t = useStrings(strings);
  return (
    <DetailPage
      header={{
        title: row.name,
        meta: <StatusPill tone={STATE_TONE[row.state]} dot>{t(`state.${row.state}`)}</StatusPill>,
        subtitle: row.description || undefined,
      }}
    >
      <Use row={row} rows={rows} at={at} t={t} />
      <SkillTrust row={row} at={at} />
      <SkillFiles row={row} at={at} computer={computer} />
      <Section title={t('facts.title')}>
        <Facts items={factsOf(row, t)} columns={1} />
      </Section>
    </DetailPage>
  );
}

function factsOf(row: SkillRow, t: T): Fact[] {
  const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : t('none'));
  const out: Fact[] = [];
  if (row.from) out.push({ label: t('fact.from'), value: row.from });
  out.push({ label: t('fact.where'), value: t(`where.${row.root}`) }, { label: t('fact.folder'), value: row.id, mono: true, copy: row.id, wide: true });
  // The parser's own text is never shown (Errors rule): a fixed sentence says it could not be read.
  if (row.parseErr) out.push({ label: t('fact.error'), value: t('fact.errorValue'), wide: true });
  else {
    if (row.model) out.push({ label: t('fact.model'), value: row.model, mono: true });
    out.push({ label: t('fact.tools'), value: list(row.allowedTools) });
    if (row.commands.length) out.push({ label: t('fact.commands'), value: row.commands.join('\n'), mono: true, wide: true });
  }
  return out;
}

/** The on/off switch (only the copy in use, parsed), its words, and the change's outcome. */
function Use({ row, rows, at, t }: { row: SkillRow; rows: readonly SkillRow[]; at: SkillsAt; t: T }) {
  const runner = useToggle(at, row.name);
  const { byId } = pageFaq(useStrings(aiStrings));
  const [asked, setAsked] = useState(false);
  // The value the last press sent: "Turned on/off" names it, whatever the list shows while it is re-read.
  const [last, setLast] = useState<boolean | null>(null);
  const held = runner.outcome?.kind === 'pending';
  if (!canSwitch(row)) {
    const used = rows.find((r) => r.name === row.name && canSwitch(r));
    const text = row.state === 'broken' ? t('use.broken') : t('use.shadowed', { where: used ? t(`where.${used.root}`) : t('where.other') });
    return <Section title={t('use.title')}><p>{text}</p></Section>;
  }
  const on = row.disabled === false;
  const sent = runner.held as { disabled?: unknown } | null;
  const heldState = sent && typeof sent.disabled === 'boolean' ? t(sent.disabled ? 'use.off' : 'use.on') : '';
  return (
    <Section title={t('use.title')}>
      <Switch
        label={t('use.switch')}
        isSelected={on}
        isDisabled={runner.busy || held}
        onChange={(next) => { setLast(next); void runner.run({ ...at, name: row.name, disabled: !next }); }}
        description={t('use.note', { name: row.name })}
      />
      {on && (row.trust === 'untrusted' || row.trust === 'changed') && <p>{t('use.untrustedOn')} <FaqLink item={byId.skillTrust}>{t('trust.more')}</FaqLink></p>}
      <Outcome
        outcome={runner.outcome}
        onCheck={held ? runner.check : undefined}
        doneText={t((last ?? on) ? 'use.done.on' : 'use.done.off')}
        detail={held ? (runner.elsewhere ? t('use.heldElsewhere', { name: row.name }) : heldState ? t('use.held', { name: row.name, state: heldState }) : undefined) : undefined}
        error={refusal(runner.outcome)}
      />
      {held && !runner.elsewhere && (
        <Button size="sm" variant="ghost" onPress={() => setAsked(true)}>{t('use.dismiss')}</Button>
      )}
      <ConfirmDialog
        isOpen={asked}
        onOpenChange={setAsked}
        title={t('use.dismissTitle')}
        body={t('use.dismissBody')}
        confirmLabel={t('use.dismiss')}
        onConfirm={() => { setAsked(false); void runner.dismiss(); }}
      />
    </Section>
  );
}
