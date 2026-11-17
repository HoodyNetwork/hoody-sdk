// The API page: Endpoints (one list of every operation, each service a category over its tags, searched by path,
// summary and operationId, filtered by service; the open one at ?op=<operationId>) and Overview (the two kinds of
// address and how each is authorised, and links). A deep link to an endpoint the filter hides still opens it: the
// detail reads the whole catalog, not the list.
import { hostEnv, proxyDomain, save, useAgentScopeFacts, useCurrentComputer, type Target } from '@core';
import {
  AgentHint,
  AnatomySection,
  Button,
  CodeBlock,
  createColumnHelper,
  currentPlatformHosts,
  DataTable,
  DetailPage,
  Facts,
  fitWidth,
  ListDetailPage,
  platformText,
  SegmentedControl,
  Tag,
  useDataView,
  useSearchParam,
  useSelection,
  usePageLink,
  useStrings,
  type Fact,
  type TableGroup,
} from '@kit';
import { useMemo, useState } from 'react';
import type { Catalog, CatalogOp } from './catalog';
import { links as guideLinks } from '../guide/links';
import { useCatalog } from './data';
import { OP_LIST_FILE, OP_LIST_MAX_BYTES, opListText } from './export';
import { accountBase, jsKind, langsFor, PLACEHOLDER, snippet, type Lang, type Place } from './logic';
import { groupKey, methodTone, serviceGroupId, serviceWord, summaryOf } from './words';
import strings from './strings.en.json';

type View = 'endpoints' | 'overview';
const DOCS_ORIGIN = 'https://docs.hoody.com';
const SDK_REPO = 'https://github.com/HoodyNetwork/hoody-sdk';
const SDK_CHANGELOG = 'https://github.com/HoodyNetwork/hoody-sdk/blob/main/CHANGELOG.md';
/** The two ways the Guide's Skills section installs the Hoody skill (the SDK README's own commands). */
const SKILL_URL = 'npx skills add https://hoody.com/SKILLS/SKILL.md';
const SKILL_REPO = 'npx skills add HoodyNetwork/hoody-sdk';
/** The OpenAPI description, in the public hoody-sdk repository on GitHub (the page of each file, and the raw address an
 *  importer takes) and as the published hoody-sdk package ships it (its exports map hoody-sdk/openapi.json and
 *  hoody-sdk/openapi.yaml to these files). No Hoody address serves the file itself. */
const SPEC_GITHUB_JSON = 'https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.json';
const SPEC_GITHUB_YAML = 'https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.yaml';
const SPEC_RAW_JSON = 'https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.json';
const SPEC_RAW_YAML = 'https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.yaml';
const SPEC_INSTALL = 'npm install hoody-sdk';
const SPEC_JSON = 'cp node_modules/hoody-sdk/generated/openapi.public.json openapi.json';
const SPEC_YAML = 'cp node_modules/hoody-sdk/generated/openapi.public.yaml openapi.yaml';
const col = createColumnHelper<CatalogOp>();
/** A Tag's sides beyond its words: --hx-tag-pad (7 px) and a --bw (1 px) edge, each side. */
const TAG_SIDES = 2 * 7 + 2 * 1;
/** The nested groups' lead in the first cell: two levels (service, then resource) of the kit's 24 px group indent. */
const NESTED_LEAD = 2 * 24;

export default function ApiView() {
  const t = useStrings(strings);
  const read = useCatalog();
  const { catalog } = read;
  const [viewParam, setView] = useSearchParam('view');
  const view: View = viewParam === 'overview' ? 'overview' : 'endpoints';
  const [selected, select] = useSelection('op');
  const views = {
    label: t('views.label'),
    items: [
      { id: 'endpoints' as const, label: t('view.endpoints') },
      { id: 'overview' as const, label: t('view.overview') },
    ],
    value: view,
    onChange: (v: View) => setView(v === 'endpoints' ? undefined : v),
  };
  const [saved, setSaved] = useState<'refused' | undefined>();
  // The API is the account's: its prompts name the selected realm, never one computer.
  const agentFacts = useAgentScopeFacts(null);
  const header = {
    title: t('title'),
    subtitle: t('subtitle'),
    // "Use with your agent" is the control every page places; then the catalog this page holds, public index fields
    // only (export.ts); never the spec file. Saving a file to the device is a web page's (core save): a terminal saves
    // none, so it has no such button.
    actions: (
      <>
        <AgentHint page="api" facts={agentFacts} />
        {catalog && hostEnv().browserPage === true && (
          <Button
            size="sm"
            onPress={() => setSaved('refused' in save(OP_LIST_FILE, [opListText(catalog)], { maxBytes: OP_LIST_MAX_BYTES }) ? 'refused' : undefined)}
          >
            {saved === 'refused' ? t('export.refused') : t('export.label')}
          </Button>
        )}
      </>
    ),
  };

  // The longest verb the catalog holds, as the method cell draws it, with the nested lead: the method column's floor, so
  // the table never keeps the column narrower than its verb (the planner grows a 'fit' column only from spare room, and
  // decides table-or-list on floors): too narrow for it, the page shows the list instead.
  const methodFloor = useMemo(() => fitWidth((catalog?.ops ?? []).map((o) => o.method), { mono: true, extra: TAG_SIDES }) + NESTED_LEAD, [catalog]);
  const columns = useMemo(
    () => [
      // The method column fits the longest verb in the rows shown (the kit's 'fit' rule, which also adds the nested
      // groups' lead): a fixed width cut the WebDAV and kit verbs (CHECKAUTH, PROPPATCH). Measured in the 12 px mono cell
      // font, a little wider than the Tag's 11 px, plus the Tag's sides (--hx-tag-pad 7 px and a 1 px edge each). Its
      // floor (methodFloor) holds the catalog's longest verb whatever the room.
      col.accessor('method', {
        header: t('col.method'),
        meta: { size: 'fit', mono: true, fitText: (o: CatalogOp) => o.method, fitPad: TAG_SIDES, minWidth: methodFloor, list: 'status' },
        cell: (c) => <Tag tone={methodTone(c.getValue())}>{c.getValue()}</Tag>,
      }),
      col.accessor('path', { header: t('col.path'), meta: { pinned: true, list: 'primary' } }),
      col.accessor((o) => summaryOf(t, o), { id: 'summary', header: t('col.summary'), enableSorting: false, meta: { priority: 1, list: 'meta' } }),
    ],
    [t, methodFloor],
  );
  const services = useMemo(() => [...new Set((catalog?.ops ?? []).map((o) => o.service))], [catalog]);
  const list = useDataView<CatalogOp>({
    rows: catalog?.ops as CatalogOp[] | undefined,
    columns,
    getRowId: (o) => o.id,
    search: (o) => [o.path, o.summary, o.id],
    filters: [{ id: 'service', label: t('filter.service'), value: (o) => o.service, options: services.map((s) => ({ value: s, label: serviceWord(t, s) })) }],
    isLoading: catalog === undefined && !read.failed,
    error: read.failed,
  });
  // Each service is a category over its resources (tags), in catalog order. With no search or
  // filter every service starts closed, showing how many resources and endpoints it holds; a search or the service filter
  // opens every group with a match (the table's own rule). The page holds what is open, so it survives the Overview
  // switch; a deep link (?op=) opens its endpoint's service.
  const op = view === 'endpoints' && selected && catalog ? catalog.ops.find((o) => o.id === selected) : undefined;
  const groups = useMemo(() => {
    const kids = new Map<string, { service: string; tag: string | null; n: number }>();
    for (const o of catalog?.ops ?? []) if (!kids.has(groupKey(o))) kids.set(groupKey(o), { service: o.service, tag: o.tag, n: 0 });
    for (const o of list.rows) {
      const k = kids.get(groupKey(o));
      if (k) k.n++;
    }
    const out: TableGroup[] = [];
    const seen = new Set<string>();
    for (const [id, k] of kids) {
      if (!seen.has(k.service)) {
        seen.add(k.service);
        const mine = [...kids.values()].filter((c) => c.service === k.service && c.n > 0);
        const endpoints = mine.reduce((sum, c) => sum + c.n, 0);
        out.push({
          id: serviceGroupId(k.service),
          label: serviceWord(t, k.service),
          countLabel: t('group.counts', { resources: t('count.resources', { count: mine.length }), endpoints: t('list.count', { count: endpoints }) }),
        });
      }
      out.push({ id, label: k.tag ?? t('tag.none'), parent: serviceGroupId(k.service), countLabel: t('list.count', { count: k.n }) });
    }
    return out;
  }, [catalog, list.rows, t]);
  const [open, setOpen] = useState<{ services: ReadonlySet<string>; closedKids: ReadonlySet<string> }>({ services: new Set(), closedKids: new Set() });
  // A deep link or a press on another endpoint opens its service (once: closing it again is the person's choice).
  const [openedFor, setOpenedFor] = useState<string | undefined>(undefined);
  if (op && openedFor !== op.id) {
    setOpenedFor(op.id);
    const id = serviceGroupId(op.service);
    if (!open.services.has(id) || open.closedKids.has(groupKey(op))) {
      const closedKids = new Set(open.closedKids);
      closedKids.delete(groupKey(op));
      setOpen({ services: new Set([...open.services, id]), closedKids });
    }
  }
  const collapsedGroups = useMemo(
    () => [...groups.filter((g) => !g.parent && !open.services.has(g.id)).map((g) => g.id), ...open.closedKids],
    [groups, open],
  );
  const onCollapsedGroupsChange = (ids: string[]) => {
    const closed = new Set(ids);
    setOpen({
      services: new Set(groups.filter((g) => !g.parent && !closed.has(g.id)).map((g) => g.id)),
      closedKids: new Set(groups.filter((g) => g.parent && closed.has(g.id)).map((g) => g.id)),
    });
  };

  // A bookmark to an endpoint this catalog no longer has says so, and clears from one press.
  const gone = view === 'endpoints' && !!selected && !!catalog && !op;
  return (
    <ListDetailPage
      mode="fill"
      storageKey="api"
      header={header}
      views={views}
      selected={gone ? selected : op?.id}
      onClose={() => select(undefined)}
      list={
        view === 'overview' ? (
          <Overview catalog={catalog} failed={read.failed} retry={read.retry} />
        ) : (
        <DataTable
          label={t('list.label')}
          view={list}
          columns={columns}
          search={t('list.search')}
          groupBy={groupKey}
          groups={groups}
          groupHeader="inline"
          stickyGroups
          collapsedGroups={collapsedGroups}
          onCollapsedGroupsChange={onCollapsedGroupsChange}
          activeId={op?.id}
          onRowAction={(o) => select(o.id)}
          onRetry={read.retry}
          onRefresh={read.retry}
          noViewMenu
          countLabel={(n) => t('list.count', { count: n })}
          noMatch={t('list.noMatch')}
        />
        )
      }
      detail={op && catalog ? <Endpoint key={op.id} catalog={catalog} op={op} /> : gone ? <DetailPage header={{ title: t('detail.gone'), subtitle: t('detail.goneBody'), actions: <Button onPress={() => select(undefined)}>{t('detail.backList')}</Button> }} /> : null}
    />
  );
}

const placeOf = (t: Target | null): Place | null =>
  t && t.container.server_name ? { project: t.project.id, computer: t.container.id, server: t.container.server_name } : null;

/** One endpoint: authorisation, how to call it (one language at a time), and its facts and docs page. A program
 *  operation's examples name placeholders, or the computer the Hub has chosen (masked on screen, whole in Copy). */
function Endpoint({ catalog, op }: { catalog: Catalog; op: CatalogOp }) {
  const t = useStrings(strings);
  const domain = proxyDomain();
  const current = placeOf(useCurrentComputer());
  const program = op.service !== 'api';
  const [mine, setMine] = useState<'placeholder' | 'current'>('placeholder');
  const place = program && mine === 'current' && current ? current : PLACEHOLDER;
  const langs = useMemo(() => langsFor(catalog, op, domain), [catalog, op, domain]);
  const [langParam, setLang] = useSearchParam('lang');
  const lang = langs.find((l) => l === langParam) ?? langs[0];
  const s = lang ? snippet(catalog, op, lang, place, domain, currentPlatformHosts()) : null;
  const langName = (l: Lang) => (l === 'js' && jsKind(op) === 'fetch' ? t('lang.fetch') : t(`lang.${l}`));

  const authText =
    op.auth === 'account' ? t('auth.account') : op.auth === 'public' ? t('auth.public') : op.auth === 'notes' ? t('auth.notes') : t('auth.kit');
  const facts: Fact[] = [
    { label: t('fact.id'), value: op.id, mono: true, copy: op.id },
    { label: t('fact.service'), value: serviceWord(t, op.service) },
    ...(op.also ? [{ label: t('fact.also'), value: op.also.join(', ') }] : []),
    ...(op.originalPath ? [{ label: t('fact.served'), value: op.originalPath, mono: true }] : []),
    op.docs ? { label: t('fact.docs'), url: DOCS_ORIGIN + op.docs } : { label: t('fact.docs'), value: t('docs.none') },
  ];

  return (
    <DetailPage
      header={{
        title: `${op.method} ${op.path}`,
        subtitle: summaryOf(t, op),
        meta: op.deprecated ? <Tag>{t('detail.deprecated')}</Tag> : undefined,
        actions:
          program && current && langs.length > 0 ? (
            <SegmentedControl
              label={t('computer.label')}
              items={[
                { id: 'placeholder', label: t('computer.placeholder') },
                { id: 'current', label: t('computer.mine') },
              ]}
              value={mine}
              onChange={setMine}
            />
          ) : undefined,
      }}
    >
      <AnatomySection
        id="auth"
        title={t('auth.title')}
        description={authText}
        note={op.auth === 'account' && op.authUndeclared ? t('auth.undeclared') : undefined}
      />
      <AnatomySection id="call" title={t('snip.label')} description={s ? undefined : t('snip.none')} note={lang === 'url' && s ? t('snip.urlNote') : undefined}>
        {lang && s && (
          <>
            <SegmentedControl label={t('snip.lang')} items={langs.map((l) => ({ id: l, label: langName(l) }))} value={lang} onChange={(l) => setLang(l === langs[0] ? undefined : l, { replace: true })} />
            {lang === 'python' ? (
              <CodeBlock label={t('snip.code', { lang: langName(lang) })} lang="python" lines={[{ code: s.code, copy: s.copy }]} wrap />
            ) : lang === 'js' ? (
              <CodeBlock label={t('snip.code', { lang: langName(lang) })} lang="js" lines={[{ code: s.code, copy: s.copy }]} wrap />
            ) : lang === 'url' ? (
              <CodeBlock label={t('snip.code', { lang: langName(lang) })} lines={[{ code: s.code, copy: s.copy }]} wrap lang="plain" // reason: one link to open or share, not code to run
              />
            ) : (
              <CodeBlock label={t('snip.code', { lang: langName(lang) })} lang="shell" lines={[{ code: s.code, copy: s.copy }]} wrap />
            )}
          </>
        )}
      </AnatomySection>
      <AnatomySection id="facts" title={t('facts.title')}>
        <Facts items={facts} label={t('facts.title')} />
      </AnatomySection>
    </DetailPage>
  );
}

interface OverviewProps {
  catalog: Catalog | undefined;
  failed: unknown;
  retry: () => void;
}

/** The two kinds of address, how each is authorised, and where to read more. Keys is linked, never copied. */
function Overview({ catalog, failed, retry }: OverviewProps) {
  const t = useStrings(strings);
  const keys = usePageLink('keys');
  const guide = usePageLink('guide');
  const hosts = useMemo(() => currentPlatformHosts(), []);
  const state = catalog ? ({ kind: 'ready' } as const) : failed ? ({ kind: 'failed', error: failed, onRetry: retry } as const) : ({ kind: 'loading' } as const);
  return (
    <>
      <AnatomySection
        id="agent"
        title={t('agent.title')}
        description={t('agent.desc')}
        note={t('agent.note')}
        actions={guide ? { secondary: [{ id: 'agent-guide', label: t('agent.guide'), href: guideLinks.section('skills') }] } : undefined}
      >
        <CodeBlock
          label={t('agent.install')}
          prompt
          lang="shell"
          lines={[
            { caption: t('agent.cap.url'), code: platformText(SKILL_URL, hosts) },
            { caption: t('agent.cap.repo'), code: SKILL_REPO },
          ]}
        />
      </AnatomySection>
      <AnatomySection id="openapi" title={t('spec.title')} description={t('spec.desc')}>
        <Facts
          label={t('spec.github')}
          items={[
            { label: t('spec.github.json'), url: SPEC_GITHUB_JSON, wide: true },
            { label: t('spec.github.yaml'), url: SPEC_GITHUB_YAML, wide: true },
          ]}
        />
        <CodeBlock
          label={t('spec.raw')}
          lang="plain" // reason: two web addresses to paste into an importer, not code to run
          lines={[
            { caption: t('spec.raw.json'), code: SPEC_RAW_JSON },
            { caption: t('spec.raw.yaml'), code: SPEC_RAW_YAML },
          ]}
        />
        <CodeBlock
          label={t('spec.pkg')}
          prompt
          lang="shell"
          lines={[
            { caption: t('spec.cap.install'), code: SPEC_INSTALL },
            { caption: t('spec.cap.json'), code: SPEC_JSON },
            { caption: t('spec.cap.yaml'), code: SPEC_YAML },
          ]}
        />
      </AnatomySection>
      <AnatomySection id="about" title={t('ov.title')} description={t('ov.desc')} state={state}>
        {catalog && (
          <Facts
            label={t('ov.title')}
            items={[
              { label: t('fact.account'), value: t('fact.accountValue', { base: accountBase(catalog, currentPlatformHosts()) }) },
              { label: t('fact.programs'), value: t('fact.programsValue') },
              { label: t('fact.count'), value: t('fact.countValue', { ops: catalog.counts.ops, services: catalog.services.length }) },
            ]}
          />
        )}
      </AnatomySection>
      <AnatomySection id="links" title={t('ov.links')}>
        <Facts
          label={t('ov.links')}
          items={[
            { label: t('link.docs'), url: `${DOCS_ORIGIN}/` },
            { label: t('link.sdk'), url: SDK_REPO },
            { label: t('link.changelog'), url: SDK_CHANGELOG },
            ...(keys ? [{ label: t('link.keys'), value: t('link.keys'), href: keys.href }] : []),
          ]}
        />
      </AnatomySection>
    </>
  );
}
