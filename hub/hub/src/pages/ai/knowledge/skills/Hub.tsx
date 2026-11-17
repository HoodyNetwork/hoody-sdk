// AI → Knowledge → Skills → Skill Hub: search the remote skill hub, read one
// skill before installing it, and install exactly what was read. One band, over both views, says skills are other people's
// and land off and not trusted. Results are a DataTable (the search row above it is the remote query, so the table adds no
// second one). The preview replaces the results; the drawer header's Back returns to them. The preview names where
// the skill comes from as web pages when it has them (ExtLink: anything that is not a web address stays text), its header
// fields sorted by key (the agent's order is a map's, not the file's), its Markdown body as the agent read it in the kit
// MarkdownViewer (images are never fetched; it is the body, not the SKILL.md file, so it is never saved under that name), the
// commands it runs once trusted, and every file with its size. Install sends the preview's package digest, so the agent
// installs that package and no other (it never fetches again). It lands off and not trusted, said before
// and after. Sent once; a lost answer is held until the list shows that folder with this skill's
// record and a new install time, or Stop waiting (C9). A folder already holding a skill is replaced only after a warning.
import {
  Band, Button, CodeBlock, ConfirmDialog, createColumnHelper, DataTable, DetailBody, Drawer, EmptyState, ErrorState, ExtLink, Facts, FaqLink,
  formatBytes, formatNumber, Link, MarkdownViewer, Outcome, Row, scrubSecrets, SearchField, SettingGroup, SettingRow, Skeleton, Stack, SubSection, useDataView, useStrings,
  type Fact,
} from '@kit';
import { refusal } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type SkillsAt, useHubPreview, useHubSearch, useInstall, usePress, useSkills } from './data';
import {
  commitUrl, fromHub, installTimes, newSince, publisherOf, recordedRow, shortCommit, sortedFrontmatter, sourceUrl, takenIn,
  type HubFile, type HubHit, type HubPreview, type HubRef,
} from './logic';
import strings from './strings.en.json';
import { pageFaq } from '../../faq';
import aiStrings from '../../strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function SkillHub({ at, isOpen, onOpenChange, onOpen }: { at: SkillsAt; isOpen: boolean; onOpenChange: (open: boolean) => void; onOpen: (id: string) => void }) {
  const t = useStrings(strings);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<HubRef | null>(null);
  return (
    <Drawer
      resizeKey="ai-hub"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('hub.title')}
      subtitle={t('hub.subtitle')}
      size="lg"
      {...(picked ? { onBack: () => setPicked(null), backLabel: t('hub.back') } : {})}
    >
      <Stack gap={4}>
        <TrustBand t={t} />
        {picked ? (
          <Preview at={at} ref_={picked} t={t} onOpen={onOpen} />
        ) : (
          <>
            <Row gap={2} align="end">
              <SearchField label={t('hub.search')} placeholder={t('hub.searchHint')} value={text} onChange={setText} onSubmit={() => setQuery(text.trim())} />
              <Button variant="secondary" isDisabled={text.trim() === ''} onPress={() => setQuery(text.trim())}>{t('hub.searchGo')}</Button>
            </Row>
            {query === '' ? (
              <EmptyState icon="search" title={t('hub.startTitle')} body={t('hub.startBody')} size="sm" />
            ) : (
              <Results at={at} query={query} t={t} onPick={setPicked} />
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}

/** Skills are other people's: one band over the search, the results and the preview, with the trust question. */
function TrustBand({ t }: { t: T }) {
  const { byId } = pageFaq(useStrings(aiStrings));
  return (
    <Band
      // noDetails: advice before an install, not a rejection.
      tone="warn"
      icon="lock"
    >
      {t('hub.trust')} <FaqLink item={byId.skillTrust}>{t('trust.more')}</FaqLink>
    </Band>
  );
}

const hitCol = createColumnHelper<HubHit>();
const hitId = (h: HubHit) => `${h.ref.provider}\u0000${h.ref.source}\u0000${h.ref.skillId}`;
const uniq = (xs: string[]) => [...new Set(xs)].sort().map((v) => ({ value: v, label: v }));

function Results({ at, query, t, onPick }: { at: SkillsAt; query: string; t: T; onPick: (r: HubRef) => void }) {
  const found = useHubSearch(at, query);
  const hits = found.data?.hits;
  const columns = useMemo(
    () => [
      hitCol.accessor('name', { header: t('hub.col.skill'), meta: { pinned: true, list: 'primary' }, }),
      hitCol.accessor('source', {
        header: t('hub.col.source'),
        meta: { tip: t('hub.col.sourceTip'), list: 'meta', priority: 2 },
        cell: (c) => {
          const url = sourceUrl(c.getValue());
          // Link opens a web page in a new tab without opener; a source with no page stays text.
          return url ? <Link href={url} variant="plain">{c.getValue()}</Link> : c.getValue();
        },
      }),
      hitCol.accessor('installs', {
        header: t('hub.col.installs'),
        meta: { align: 'end', width: '140px', tip: t('hub.col.installsTip'), list: 'status', priority: 1 },
        cell: (c) => t('hub.installs', { count: c.getValue(), n: formatNumber(c.getValue()) }),
      }),
      hitCol.accessor((h) => h.ref.provider, { id: 'hub', header: t('hub.col.hub'), meta: { defaultHidden: true, priority: 3, list: false } }),
    ],
    [t],
  );
  const view = useDataView<HubHit>({
    rows: hits,
    columns,
    getRowId: hitId,
    // The words went to the hub through the field above; the table adds no second search.
    search: false,
    filters: [
      { id: 'hub', label: t('hub.filter.hub'), value: (h) => h.ref.provider, options: uniq((hits ?? []).map((h) => h.ref.provider)) },
      { id: 'publisher', label: t('hub.filter.publisher'), value: (h) => publisherOf(h.source), options: uniq((hits ?? []).map((h) => publisherOf(h.source))) },
    ],
    param: 'hub',
    isLoading: found.isPending,
    error: found.error,
    context: query,
  });
  // The filters and page are the results' own: a new search starts unfiltered on page 1, so a Publisher or Hub picked for
  // the last results never hides every new hit (the URL keeps them, the query does not).
  const { clearAll, isFiltered, page } = view;
  const clearedFor = useRef<string | null>(null);
  useEffect(() => {
    if (clearedFor.current === query) return;
    clearedFor.current = query;
    if (isFiltered || page > 1) clearAll();
  }, [query, clearAll, isFiltered, page]);
  return (
    <>
      {found.data?.old && <Band tone="neutral">{t('hub.old')}</Band>}
      <DataTable
        label={t('hub.label')}
        view={view}
        columns={columns}
        search={false}
        storageKey="ai-skill-hub"
        onRowAction={false}
        actions={(h) => [{ id: 'read', label: t('hub.read', { name: h.name }), short: t('hub.preview'), inline: true, onAction: () => onPick(h.ref) }]}
        onRetry={() => void found.refetch()}
        onRefresh={() => void found.refetch()}
        countLabel={(n) => t('hub.count', { count: n })}
        empty={<EmptyState icon="search" title={t('hub.none', { query })} size="compact" />}
      />
    </>
  );
}

const fileCol = createColumnHelper<HubFile>();

function Preview({ at, ref_, t, onOpen }: { at: SkillsAt; ref_: HubRef; t: T; onOpen: (id: string) => void }) {
  const pv = useHubPreview(at, ref_);
  const fileColumns = useMemo(
    () => [
      fileCol.accessor('path', { header: t('hub.col.path'), meta: { pinned: true, mono: true, list: 'primary' } }),
      fileCol.accessor('size', { header: t('hub.col.size'), meta: { align: 'end', width: '120px', list: 'status' }, cell: (c) => formatBytes(c.getValue()) }),
    ],
    [t],
  );
  if (pv.isPending) return <DetailBody><Skeleton variant="rows" rows={6} /></DetailBody>;
  if (pv.error) return <DetailBody><ErrorState error={pv.error} onRetry={() => void pv.refetch()} size="compact" /></DetailBody>;
  if (!pv.data) return <DetailBody><EmptyState icon="warn" title={t('hub.badPreview')} size="compact" /></DetailBody>;
  const p = pv.data;
  const published = sourceUrl(p.ref.source);
  const commitLink = commitUrl(p.ref.source, p.commit);
  const facts: Fact[] = [
    { label: t('hub.f.name'), value: p.name },
    published ? { label: t('hub.f.source'), url: published } : { label: t('hub.f.source'), value: p.ref.source },
    ...(p.origin ? [{ label: t('hub.f.origin'), url: p.origin }] : []),
    ...(p.commit
      ? [{ label: t('hub.f.commit'), mono: true, value: commitLink ? <ExtLink url={commitLink} look="nav">{shortCommit(p.commit)}</ExtLink> : shortCommit(p.commit) }]
      : []),
    ...(p.stars > 0 ? [{ label: t('hub.f.stars'), value: formatNumber(p.stars) }] : []),
    { label: t('hub.f.size'), value: formatBytes(p.totalBytes) },
    { label: t('hub.f.digest'), value: p.digest, mono: true, copy: p.digest },
  ];
  // The header fields are the hub's text: scrubbed as the viewer scrubs its own, and sorted (never the file's order).
  const header = sortedFrontmatter(p.frontmatter).map(([k, v]) => ({ label: scrubSecrets(k), value: scrubSecrets(v) }));
  return (
    <DetailBody>
      {p.old && <Band tone="neutral">{t('hub.old')}</Band>}
      <Facts items={facts} columns={1} />
      {header.length > 0 && (
        <SubSection title={t('hub.frontmatter')}>
          <Facts items={header} columns={1} />
        </SubSection>
      )}
      <p>{t('hub.bodyNote')}</p>
      <MarkdownViewer label={t('hub.body')} source={p.body} fileName={`${p.ref.skillId}-body.md`} />
      {p.commands.length > 0 ? (
        <>
          <Band
            // noDetails: what the skill would run once trusted, not a rejection.
            tone="warn"
          >
            {t('hub.commands', { count: p.commands.length })}
          </Band>
          <CodeBlock label={t('hub.commandsLabel')} code={p.commands.join('\n')} lang="shell" wrap />
        </>
      ) : (
        <p>{t('hub.noCommands')}</p>
      )}
      {/* The preview's whole file list (it is read with the preview, never in parts): ready once the preview is. */}
      <SubSection title={t('hub.files', { count: p.files.length })} description={t('hub.filesNote')} state={{ kind: 'ready' }}>
        <DataTable
          bare
          fill={false}
          label={t('hub.files', { count: p.files.length })}
          data={p.files}
          columns={fileColumns}
          getRowId={(f) => f.path}
          sortParam={false}
          noViewMenu
          onRowAction={false}
          density="compact"
        />
      </SubSection>
      <Install at={at} p={p} t={t} onOpen={onOpen} />
    </DetailBody>
  );
}

function Install({ at, p, t, onOpen }: { at: SkillsAt; p: HubPreview; t: T; onOpen: (id: string) => void }) {
  const list = useSkills(at);
  const run = useInstall(at, p.ref.skillId);
  const [asked, setAsked] = useState<'replace' | 'stop' | null>(null);
  const known = list.data !== undefined;
  const taken = takenIn(list.data, p.ref.skillId);
  const held = run.outcome?.kind === 'pending';
  const busy = run.busy || held || !known;
  // The folder's install times are read fresh at the press, from a whole list (a lost answer is proved only by a time not among
  // them, so a partial list could make an old install look new); anything less sends nothing.
  const [readFailed, setReadFailed] = useState(false);
  const [notTaken, setNotTaken] = useState(false);
  // This folder's last press from this page, kept across leaving the preview (data.ts usePress).
  const [press, setPress] = usePress(at, 'install', p.ref.skillId);
  const send = async (overwrite: boolean) => {
    setReadFailed(false);
    setNotTaken(false);
    const fresh = await list.refetch();
    if (fresh.error || !fresh.data?.complete) { setReadFailed(true); return; }
    // A Replace confirmed on an older list: the folder must still hold a skill, else nothing is sent (it may now be other files).
    if (overwrite && !takenIn(fresh.data, p.ref.skillId)) { setNotTaken(true); return; }
    const before = installTimes(fresh.data, p.ref.skillId);
    setPress({ before, unknown: false, digest: p.digest });
    await run.run({ ...at, digest: p.digest, ref: p.ref, overwrite, before });
  };
  // The installed row: this folder, this hub skill's untampered record (also what "Open it" opens).
  const installed = recordedRow(list.data, p.ref.skillId, fromHub(p.ref));
  // Done: its answer said so, or a lost answer was proved by the list (this record with an install time not there at the press:
  // core then clears the unknown outcome, and the same fact shows it done here, also after leaving and coming back). Either way
  // only for the package sent: a newer package of the skill read since is offered again.
  const sent = !!press && press.digest === p.digest;
  const proved = sent && !run.outcome && !run.busy && newSince(installed, press.before);
  const done = sent && run.outcome?.kind === 'done' ? (run.outcome.data as { name?: string } | undefined) ?? {} : proved ? {} : undefined;
  return (
    <SettingGroup>
      <SettingRow
        label={t('hub.install')}
        help={taken ? t('hub.taken', { folder: p.ref.skillId }) : t('hub.installHelp')}
        actions={
          done ? undefined : taken ? (
            <Button variant="secondary" tone="danger" isDisabled={busy} onPress={() => setAsked('replace')}>{t('hub.replace')}</Button>
          ) : (
            <Button variant="primary" isDisabled={busy} onPress={() => void send(false)}>{t('hub.install')}</Button>
          )
        }
      >
        {readFailed && (
          <Outcome
            // noDetails: nothing was sent; the list could not be read first.
            outcome={{ kind: 'not_sent' }}
            detail={t('add.readFirst')}
          />
        )}
        {notTaken && (
          <Outcome
            // noDetails: nothing was sent; the folder no longer holds a skill.
            outcome={{ kind: 'not_sent' }}
            detail={t('add.notTaken', { folder: p.ref.skillId })}
          />
        )}
        {done && (
          <>
            <Outcome
              // noDetails: a done install has no rejection.
              outcome={{ kind: 'done' }}
              doneText={t('hub.done', { name: done.name || p.name })}
            />
            {installed && <Button size="sm" variant="secondary" onPress={() => onOpen(installed.id)}>{t('hub.openIt')}</Button>}
          </>
        )}
        {held && (
          <>
            <Outcome
              // noDetails: an install whose answer never came has no rejection; Check again reads the skills list.
              outcome={run.outcome}
              onCheck={run.check}
              detail={run.elsewhere ? t('hub.heldElsewhere') : t('hub.held', { name: p.name })}
            />
            {!run.elsewhere && <Button size="sm" variant="ghost" onPress={() => setAsked('stop')}>{t('use.dismiss')}</Button>}
          </>
        )}
        {run.outcome && run.outcome.kind !== 'pending' && run.outcome.kind !== 'done' && <Outcome outcome={run.outcome} error={refusal(run.outcome)} />}
        <ConfirmDialog
          isOpen={asked === 'replace'}
          onOpenChange={(o) => { if (!o) setAsked(null); }}
          tone="danger"
          title={t('hub.replaceTitle', { folder: p.ref.skillId })}
          body={t('hub.replaceBody', { folder: p.ref.skillId })}
          confirmLabel={t('hub.replace')}
          onConfirm={() => { setAsked(null); void send(true); }}
        />
        <ConfirmDialog
          isOpen={asked === 'stop'}
          onOpenChange={(o) => { if (!o) setAsked(null); }}
          title={t('use.dismissTitle')}
          body={t('use.dismissBody')}
          confirmLabel={t('use.dismiss')}
          onConfirm={() => { setAsked(null); void run.dismiss(); }}
        />
      </SettingRow>
    </SettingGroup>
  );
}
