// The Permissions drawer of one project: what the project passes
// to every computer in it. Overview, Access rules (read by every member; changed by the owner and a Full control
// member, ProjectRulesChange) and People (add, change and remove people up to the caller's own level,
// ProjectPeople) and Computers (the project's computers, for its owner and members, ProjectComputers). A
// shared-access (key) session sends no member or rules read at all and says why (useCan('account') is false exactly
// on a key session). An unknown owner claims nothing: no owner line, rows shown as members. The
// rules are read as rulesFrom keeps them: no password, key or token reaches the page.
// Structure: the Overview is one "At a glance" block of facts with the Agent action in its head, never buttons that
// only switch tabs; Access rules is one section whose Verdict says what holds now, with the change under it; People and
// Computers are each one section holding one table. A section shows at most one Band: several things to say at once
// are its sentences, each in its own span (tests and readers find each sentence whole).
import { useCan, useCore } from '@core';
import { AnatomySection, Band, Button, createColumnHelper, DataTable, Disclosure, Drawer, EmptyState, ErrorState, Facts, Row, Stack, StatusPill, Tabs, Tag, useStrings, Verdict, VerdictMark, type Fact, type RowActionEntry, type SectionState, openOutside } from '@kit';
import { useEffect, useState } from 'react';
import { useMembers, useProjectComputerList, useProjectRules } from '../data';
import strings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { summaryOf } from './access.logic';
import accStrings from './AccessDrawer.strings.en.json';
import { AccessDrawer, RulesFacts, RulesSummaryText, useExplainProject } from './AccessDrawer';
import { DOCS_PERMISSIONS, OutsideTag, STATE_TONE } from './Bits';
import { bucket } from '../logic';
import { Line } from './PartBits';
import { ProjectPeople } from './ProjectPeople';
import { ProjectRulesChange } from './ProjectRulesChange';
import { counts, LEVEL_LINES, LEVEL_TAGS, LEVELS, mayChangeRules, myLevel, type Own, ownOf, peopleOf, projectFact, projectMode, type ProjectComputer, rosterWhole, rulesReadProblem, sourceOf, type Level } from './projectPerms.logic';

export type PermsTab = 'overview' | 'rules' | 'people' | 'computers';

export function ProjectPerms({ project, computers = [], tab: startTab = 'overview', onDeleteExpired, onClose }: {
  project: Project | null;
  /** The project's computers this page holds (for the Agent snapshot only: never a count or a completeness claim). */
  computers?: readonly Computer[];
  tab?: PermsTab;
  /** Opens the page's delete dialog for an expired computer of the Computers tab (absent: no Delete there). */
  onDeleteExpired?: (c: Computer) => void;
  onClose: () => void;
}) {
  const t = useStrings(strings);
  const tt = useStrings(accStrings);
  const account = useCan('account');
  const uid = useCore().account;
  const [tab, setTab] = useState<PermsTab>(startTab);
  // Each opening starts on the tab it was opened for.
  useEffect(() => {
    if (project) setTab(startTab);
  }, [project?.id, startTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const roster = useMembers(project ?? undefined, account && project !== null);
  const rules = useProjectRules(project ?? undefined, account && project !== null);
  const people = roster.data ? peopleOf(roster.data) : undefined;
  const mine = project ? myLevel(project, roster.data, uid) : 'unknown';
  // The project's computers: read by the owner and members alike, only once the Computers tab is shown. The
  // Overview reads nothing more: its count is the last read's, or a pointer to the tab.
  const list = useProjectComputerList(project ?? undefined, account && tab === 'computers');
  const doc = !rules.isError && rules.fetchStatus !== 'paused' ? rules.data : undefined;
  const explain = useExplainProject(project, doc, computers.map((c) => ({ name: c.name, own: ownOf(c) })));
  if (!project) return null;
  // A read paused offline is not current: cached rows are never shown as what holds now.
  const peopleState = !account ? 'key' : roster.isError || roster.fetchStatus === 'paused' ? 'failed' : roster.data ? 'ok' : 'loading';
  // The same for the rules; the server's own refusal (403: a member below Full control) says who may see them.
  const rulesState = !account ? 'key' : rules.isError ? rulesReadProblem(rules.error) : rules.fetchStatus === 'paused' ? 'failed' : rules.data ? 'ok' : 'loading';
  const rulesNone = doc ? projectFact(doc) === 'pp.fact.rules.none' : false;
  // The verdict's sentence: the document in plain words, read straight from it (no AI: it wins over any Agent answer),
  // or why there is none to show. The address switch being off is the one marked phrase.
  const ruleLines = doc && !rulesNone ? summaryOf(doc, 'no', 'project') : [];
  const offAt = ruleLines.findIndex((l) => l.key === 'sum.off' || l.key === 'sum.offProject');
  const rulesSentence = !doc
    ? t(rulesState === 'key' ? 'pp.rules.cantRead.key' : rulesState === 'level' ? 'pp.rules.cantRead.level' : 'pp.rules.loading')
    : rulesNone ? t('pp.rules.none')
    : ruleLines.map((l, i) => {
        const text = tt(l.key as never, l.vars as never);
        return <span key={l.key}>{i > 0 ? ' ' : null}{i === offAt ? <VerdictMark tone="warn">{text}</VerdictMark> : text}</span>;
      });
  const readsFailed = [rulesState === 'failed' ? rules : null, peopleState === 'failed' ? roster : null].filter((q) => q !== null);

  const glance: Fact[] = [
    {
      label: t('pp.ov.fact.rules'),
      value: rulesState === 'key' ? t('pp.rules.cantRead.key')
        : rulesState === 'level' ? t('pp.rules.cantRead.level')
        : rulesState === 'failed' ? t('pp.fact.rules.failed')
        : !doc ? t('pp.ov.fact.reading')
        : rulesNone ? t('pp.ov.rules.none')
        // Read straight from the document (no AI), and never counted: a computer's own rules keep their own answer.
        : <><RulesSummaryText rules={doc} project="no" subject="project" /> {t('pp.ov.rules.noCounts')}</>,
    },
    {
      label: t('pp.ov.fact.people'),
      value: peopleState === 'key' ? t('pp.fact.people.key')
        : peopleState === 'failed' ? t('pp.fact.people.failed')
        : peopleState === 'loading' || !roster.data || !people ? t('pp.ov.fact.reading')
        : people.length === 0 && rosterWhole(roster.data) ? t('pp.ov.people.none')
        : people.length === 0 ? t('pp.ov.people.uncounted')
        : `${t(rosterWhole(roster.data) ? 'pp.fact.people' : 'pp.fact.peopleAtLeast', { count: people.length })}: ${levelCounts(people, t)}`,
    },
    { label: t('pp.ov.fact.computers'), value: computersFact(account, list, t) },
    { label: t('pp.ov.fact.realms'), value: t('pp.ov.realms.value') },
  ];

  const overview = (
    <AnatomySection
      id="pp-glance"
      title={t('pp.ov.glance')}
      description={t('pp.ov.lede')}
      // What the Agent is given (a privacy promise), shown with its action only.
      {...(explain.action ? { promise: t('pp.ov.explainPromise') } : {})}
      actions={{
        ...(explain.action ? { primary: explain.action } : {}),
        menu: [{ id: 'how', label: t('pp.ov.how'), icon: 'external', onAction: () => openOutside(DOCS_PERMISSIONS) }],
      }}
      // Undefined when no band shows: an empty fragment is truthy and the section would draw an empty notices box.
      notices={peopleState === 'key' || peopleState === 'failed' || rulesState === 'failed' || explain.notice ? (
        <>
          {/* One band per read that failed, each with its own details for support and its own Try again. */}
          {readsFailed.map((q) => (
            <Band key={q === rules ? 'rules' : 'people'} tone="danger" size="table" error={q.error} actions={<Button size="sm" onPress={() => void q.refetch()}>{t('pp.ov.retry')}</Button>}>
              {t(q === rules ? 'pp.rules.error' : 'pp.people.error')}
            </Band>
          ))}
          {readsFailed.length === 0 && peopleState === 'key' ? <Band size="table">{t('pp.people.cantRead.key')}</Band> : null}
          {explain.notice}
        </>
      ) : undefined}
      state={{ kind: 'ready' }}
    >
      <Facts items={glance} columns={1} label={t('pp.ov.glance')} />
    </AnatomySection>
  );

  const rulesTab = (
    <Stack gap={3}>
      <AnatomySection
        id="pp-rules"
        title={t('pp.rules.title', { name: project.name })}
        description={[t('pp.rules.ledeFull'), t('pp.rules.ledeAdded')].join(' ')}
        {...(doc && doc.hooks > 0 ? { note: t('pp.rules.hooksIgnored') } : {})}
        state={{ kind: 'ready' }}
      >
        {!doc && rulesState === 'failed' ? (
          <ErrorState size="compact" error={rules.error} title={t('pp.rules.error')} onRetry={() => void rules.refetch()} />
        ) : (
          <Verdict label={t('pp.rules.now')} {...(doc && !rulesNone ? { facts: <RulesFacts rules={doc} label={t('pp.rules.facts')} /> } : {})}>
            {rulesSentence}
          </Verdict>
        )}
      </AnatomySection>
      {/* The choices only over a document that is one of the three (anything else would be lost), for whoever may
          change it; a send's tracking stays mounted whatever the latest read says (it failed, or reads as set elsewhere). */}
      {account ? <ProjectRulesChange key={project.id} project={project} doc={doc} editable={!!doc && projectMode(doc) !== 'advanced' && mayChangeRules(mine)} owner={mine === 'owner'} /> : null}
    </Stack>
  );

  const peopleTab = (
    <Stack gap={3}>
      {peopleState === 'ok' && roster.data ? (
        <ProjectPeople project={project} roster={roster.data} mine={mine} onRead={() => roster.refetch()} />
      ) : (
        <AnatomySection
          id="pp-people"
          title={t('pp.tab.people')}
          notices={peopleState === 'key' ? <Band size="table">{t('pp.people.cantRead.key')}</Band> : undefined}
          {...(peopleState === 'failed' ? { state: { kind: 'failed', error: roster.error, onRetry: () => void roster.refetch(), busy: roster.isFetching } satisfies SectionState } : peopleState === 'loading' ? { state: { kind: 'loading', rows: 2, variant: 'table' } satisfies SectionState } : {})}
        />
      )}
      <Disclosure title={t('pp.levels.disclosure')}>
        <LevelTable member={mine !== 'owner' && mine !== 'unknown'} />
      </Disclosure>
    </Stack>
  );

  return (
    <Drawer overlayId="computers-project-perms" resizeKey="computers-project-perms" isOpen onOpenChange={(o) => !o && onClose()} title={t('pp.title', { name: project.name })} subtitle={project.outside ? <OutsideTag /> : undefined} size="md">
      <Tabs
        label={t('pp.title', { name: project.name })}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: t('pp.tab.overview'), content: overview },
          { id: 'rules', label: t('pp.tab.rules'), content: rulesTab },
          { id: 'people', label: t('pp.tab.people'), content: peopleTab },
          { id: 'computers', label: t('pp.tab.computers'), content: <ProjectComputers project={project} account={account} owner={mine === 'owner'} list={list} projectHas={!doc ? 'unknown' : rulesNone ? 'no' : 'yes'} onDeleteExpired={onDeleteExpired} onLanded={onClose} /> },
        ]}
      />
    </Drawer>
  );
}

type T = ReturnType<typeof useStrings<typeof strings>>;
type CxList = ReturnType<typeof useProjectComputerList>;

/** The Overview's count of the project's computers, from the Computers tab's last read only (the Overview never reads
 *  the list itself): of the rows it answered, "at least" when the API holds more than it sent. Not read yet, or a failed
 *  or paused read, points at the tab, never a count. */
function computersFact(account: boolean, list: CxList, t: T): string {
  if (!account) return t('pp.fact.people.key');
  if (list.isError || list.fetchStatus === 'paused' || !list.data) return t('pp.ov.cx.inTab');
  const { rows, total } = list.data;
  if (rows.length === 0 && total === 0) return t('pp.ov.cx.none');
  return t(total > rows.length ? 'pp.ov.cx.atLeast' : 'pp.ov.cx.count', { count: rows.length });
}

const OWN_KEY: Record<Own, 'pp.cx.own.yes' | 'pp.cx.own.no' | 'pp.cx.own.unknown' | 'pp.cx.own.failed'> = { yes: 'pp.cx.own.yes', no: 'pp.cx.own.no', notKnown: 'pp.cx.own.unknown', failed: 'pp.cx.own.failed' };
const col = createColumnHelper<ProjectComputer>();

/** The Computers tab: the project's computers as the API answered it, counted only "of the computers
 *  shown". The owner and members read the same list (a member gets the API's member view, without proxy documents,
 *  so only the owner gets an Access button). A failed or refused read is an error, never "no computers". "Gets in by" is
 *  shown only where both facts are certain (sourceOf, with this caller's own rules read), else "—". */
function ProjectComputers({ project, account, owner, list, projectHas, onDeleteExpired, onLanded }: {
  project: Project;
  account: boolean;
  owner: boolean;
  list: CxList;
  projectHas: 'yes' | 'no' | 'unknown';
  onDeleteExpired?: (c: ProjectComputer) => void;
  /** A row's Access moved to that computer's Permissions tab: this drawer closes. */
  onLanded: () => void;
}) {
  const t = useStrings(strings);
  const canAccess = useCan('resources.proxy_aliases');
  const canDelete = useCan('computers.delete');
  const [accessFor, setAccessFor] = useState<ProjectComputer | null>(null);
  const title = t('pp.cx.title', { name: project.name });
  if (!account) return <Band size="table">{t('pp.cx.cantRead.key')}</Band>;
  // A read paused offline is not current: cached rows are never shown as what holds now.
  const failed = list.isError || list.fetchStatus === 'paused';
  const state: SectionState = failed
    ? { kind: 'failed', error: list.error, onRetry: () => void list.refetch(), busy: list.isFetching }
    : !list.data ? { kind: 'loading', rows: 3, variant: 'table' } : { kind: 'ready' };
  const rows = !failed && list.data ? list.data.rows : [];
  const total = !failed && list.data ? list.data.total : 0;
  const c = counts(rows);
  const owns = new Map(rows.map((x) => [x.id, ownOf(x)] as const));
  const ownOfRow = (x: ProjectComputer): Own => owns.get(x.id) ?? ownOf(x);
  const actions = (x: ProjectComputer): RowActionEntry[] => {
    const access: RowActionEntry[] = owner && canAccess ? [{ id: 'access', label: t('pp.cx.accessOf', { name: x.name }), short: t('pp.cx.access'), inline: true, opens: true, onAction: () => setAccessFor(x) }] : [];
    // Only an expired computer (its server ended or was reinstalled) is deleted from here, by its owner: a live one is
    // deleted from its own page. The page's one delete dialog opens for it (onDeleteExpired).
    const del: RowActionEntry[] = x.server_expired === true && owner && canDelete && onDeleteExpired
      ? [{ id: 'delete', label: t('pp.cx.deleteOf', { name: x.name }), tone: 'danger', opens: true, onAction: () => onDeleteExpired(x) }]
      : [];
    return access.length > 0 && del.length > 0 ? [...access, '-', ...del] : [...access, ...del];
  };
  // Who gets in, in one column: how it is reached where both facts are certain (sourceOf), else what is known of
  // its own rules. Each source already says whether it has rules of its own, so nothing the two columns showed is lost, and
  // the one column has the room for its longest words at drawer width (no table cell wraps). A reinstalled computer's
  // story is its State and a band above the table, so its cell is a dash.
  const whoText = (x: ProjectComputer): string => {
    if (bucket(x.status) === 'reinstalled') return t('pp.cx.by.none');
    const own = ownOfRow(x);
    const src = sourceOf(own, projectHas);
    return t(src ?? (own === 'yes' ? 'pp.cx.by.hasOwn' : own === 'no' ? 'pp.cx.by.noOwn' : OWN_KEY[own]));
  };
  const columns = [
    // The floors (name 140, not the pinned 220; State 100, not the default 120) leave Who gets in the room for its longest
    // words in the drawer, and it is never dropped: there is no view menu to bring a column back.
    col.display({ id: 'name', header: t('pp.cx.col.name'), meta: { pinned: true, minWidth: 140, list: 'primary', label: t('pp.cx.col.name') }, cell: (x) => x.row.original.name }),
    col.display({
      id: 'state',
      header: t('pp.cx.col.state'),
      // fitPad: the pill's dot and padding beside its words (fitText measures the words only).
      meta: { size: 'fit', fitPad: 28, minWidth: 100, list: 'status', label: t('pp.cx.col.state'), fitText: (r: ProjectComputer) => t(`state.${bucket(r.status)}`) },
      cell: (x) => {
        const b = bucket(x.row.original.status);
        return <StatusPill tone={STATE_TONE[b] ?? 'neutral'} dot>{t(`state.${b}`)}</StatusPill>;
      },
    }),
    col.display({
      id: 'by',
      header: t('pp.cx.col.by'),
      meta: { size: 'fit', priority: 1, listLabel: true, label: t('pp.cx.col.by'), fitText: (r: ProjectComputer) => whoText(r) },
      cell: (x) => whoText(x.row.original),
    }),
  ];
  const facts: Fact[] = [
    { label: t('pp.cx.fact.shown'), value: total > rows.length ? t('pp.cx.fact.shownOf', { count: rows.length, total }) : String(rows.length) },
    { label: t('pp.cx.fact.full'), value: String(c.full) },
    { label: t('pp.cx.fact.own'), value: String(c.own) },
    { label: t('pp.cx.fact.unknown'), value: String(c.unknown) },
  ];
  const notKnown = rows.some((x) => ownOfRow(x) === 'notKnown');
  const reinstalled = rows.filter((x) => bucket(x.status) === 'reinstalled');
  // What the table leaves out or cannot say, as the sentences of the section's one band.
  const cxNotes = [
    ...(total > rows.length ? [{ key: 'more', text: t('pp.cx.more', { count: rows.length }) }] : []),
    // The owner's note points at Access, which a member does not get.
    ...(notKnown ? [{ key: 'unknown', text: t(owner ? 'pp.cx.unknownNote' : 'pp.cx.unknownNoteMember') }] : []),
    // What happened to a reinstalled computer, whole and wrapping (a table cell is one cut line).
    ...reinstalled.map((x) => ({ key: x.id, text: t('pp.cx.reinstalledOf', { name: x.name }) })),
  ];
  return (
    <Stack gap={3}>
      {state.kind === 'ready' && rows.length > 0 ? (
        <AnatomySection id="pp-cx-glance" title={t('pp.ov.glance')} description={t('pp.cx.factsOf')} state={{ kind: 'ready' }}>
          <Facts items={facts} columns={2} label={t('pp.ov.glance')} />
        </AnatomySection>
      ) : null}
      <AnatomySection
        id="pp-cx"
        title={title}
        description={t('pp.cx.lede')}
        // Undefined when no band shows: an empty fragment is truthy and the section would draw an empty notices box.
        notices={cxNotes.length > 0 ? (
          <Band size="table">
            {cxNotes.map((n, i) => <Line key={n.key}>{i > 0 ? ' ' : null}{n.text}</Line>)}
          </Band>
        ) : undefined}
        state={state}
        flush
      >
        <DataTable
          label={title}
          data={rows}
          columns={columns}
          getRowId={(x) => x.id}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          empty={<EmptyState size="sm" title={t('pp.cx.empty')} />}
          actions={actions}
        />
      </AnatomySection>
      {owner && canAccess && accessFor ? <AccessDrawer c={accessFor} isOpen onClose={() => setAccessFor(null)} onLanded={onLanded} /> : null}
    </Stack>
  );
}

/** "1 Work on, 2 See": the people per level, highest first, levels with nobody left out. */
export function levelCounts(people: readonly { level: Level }[], t: T): string {
  return [...LEVELS]
    .reverse()
    .map((l) => ({ l, n: people.filter((p) => p.level === l).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${t(`pp.lvl.${x.l}`)}`)
    .join(', ');
}

/** What each level can do, as one table of facts: a row per level holding its own lines over the level below it
 *  (LEVEL_LINES), then what stays the owner's. A member also reads why some of it works only by a computer's ID. */
function LevelTable({ member }: { member: boolean }) {
  const t = useStrings(strings);
  const items: Fact[] = [
    ...LEVELS.map((l, i) => ({
      label: t(`pp.lvl.${l}`),
      value: (
        <Stack gap={1}>
          {LEVEL_TAGS[l].length > 0 ? (
            <Row gap={2} wrap>
              {LEVEL_TAGS[l].map((k) => (
                <Tag key={k}>{t(k as never)}</Tag>
              ))}
            </Row>
          ) : null}
          {i > 0 ? <Line>{t('pp.levels.plus', { level: t(`pp.lvl.${LEVELS[i - 1]!}`) })}</Line> : null}
          {LEVEL_LINES[l].map((k) => (
            <Line key={k}>{t(k as never)}</Line>
          ))}
        </Stack>
      ),
    })),
    { label: t('pp.owner.row'), value: t('pp.levels.ownerOnly') },
  ];
  return (
    <Stack gap={3}>
      <Facts items={items} columns={1} label={t('pp.levels.disclosure')} />
      {member ? <Band size="table">{t('pp.levels.byId')}</Band> : null}
    </Stack>
  );
}
