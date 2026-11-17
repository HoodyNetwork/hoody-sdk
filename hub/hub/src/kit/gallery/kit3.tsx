// The pieces gallery tab (/_kit?tab=pieces): CopyButton (read at press, disabled, full size), Meter
// the removable Tag and Tile, Ask the Agent (askAgent.tsx), every state rendered at once for shots. view.tsx mounts it. PathField (typed or browsed path).
import { useCallback, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../data/BrandMark';
import { ComputerMark } from '../data/ComputerMark';
import { Facts, StatusToggle, Tag } from '../data/Display';
import { ProblemList } from '../data/ProblemList';
import { ApprovalModePieces } from './approvalMode';
import { AskAgentPieces } from './askAgent';
import { GlancePieces } from './glance';
import { WorkCellsPieces } from './workCells';
import { LedgerPieces } from './ledger';
import { DraftyPieces } from './drafty';
import { IpInfoPieces } from './ipInfo';
import { ComputerPickerPieces } from './computerPicker';
import { FileChooserPieces } from './fileChooser';
import { PickCardPieces } from './pickCards';
import { ProjectProgramPickerPieces } from './projectProgramPicker';
import { CopyButton } from '../data/Ids';
import { DateTimeField } from '../forms/DateTimeField';
import { PathField, type PathEntry, type PathReads } from '../forms/PathField';
import { Row, Stack } from '../layouts/Stack';
import { Panel, Tile } from '../layouts/Layouts';
import { AnatomySection } from '../layouts/anatomy/Section';
import { useStrings } from '../strings';
import { useSearchParam } from '../nav';
import { Meter, ScaleBar } from '../widgets/Widgets';
import { NodeLink, type NodeLinkEdge, type NodeLinkNode } from '../widgets/NodeLink';
import { PlanCard, PlanGrid } from '../widgets/PlanCard';
import { Button } from '../controls/Button';
import { Shortcut } from '../controls/Kbd';
import strings from './kit3.strings.en.json';
import s from './kit3.module.css';

// PathField's made-up folders (gallery only), read after a short wait like a computer's folder.
const TREE: Record<string, PathEntry[]> = {
  '': [{ name: 'projects', dir: true }, { name: 'notes.md', dir: false }, { name: '.config', dir: true }],
  'projects/': [{ name: 'shop', dir: true }, { name: 'blog', dir: true }, { name: 'README.md', dir: false }],
  'projects/shop/': [{ name: 'src', dir: true }, { name: 'package.json', dir: false }],
  'projects/blog/': [],
  'projects/shop/src/': [{ name: 'index.ts', dir: false }],
  '.config/': [{ name: 'hoody', dir: true }],
  '.config/hoody/': [],
};

/** A fake host for PathField: reads TREE after 300 ms; `broken` fails every read. */
function useSampleReads(broken = false): PathReads {
  const [state, setState] = useState<{ dir: string | null; reading: boolean; failed: boolean }>({ dir: null, reading: false, failed: false });
  const asked = useRef<string | null>(null);
  const want = useCallback((dir: string | null) => {
    asked.current = dir;
    if (dir === null) return;
    setState({ dir: null, reading: true, failed: false });
    setTimeout(() => {
      if (asked.current !== dir) return;
      setState(broken || !(dir in TREE) ? { dir: null, reading: false, failed: true } : { dir, reading: false, failed: false });
    }, 300);
  }, [broken]);
  return { entries: state.dir === null ? [] : (TREE[state.dir] ?? []), dir: state.dir, reading: state.reading, failed: state.failed, want };
}

function PathSpecimen() {
  const t = useKit3Strings();
  const [folder, setFolder] = useState('projects/');
  const [file, setFile] = useState('projects/shop/missing.ts');
  const [bad, setBad] = useState('');
  const folders = useSampleReads();
  const files = useSampleReads();
  const failing = useSampleReads(true);
  return (
    <Row gap={6} wrap align="start">
      <PathField label={t('path.folder')} mode="folder" rootLabel="~" value={folder} onChange={setFolder} read={folders} description={t('path.folderHelp')} width="md" />
      <PathField label={t('path.file')} mode="file" rootLabel="~" value={file} onChange={setFile} read={files} errorMessage={file.endsWith('missing.ts') ? t('path.fileRefused') : undefined} width="md" />
      <PathField label={t('path.failing')} rootLabel="/srv" value={bad} onChange={setBad} read={failing} width="md" />
    </Row>
  );
}

// Computer colours for the mark row: an ordinary one, white and near-black (the ring keeps them visible), the surface
// grey, and a value that is not a hex colour (draws no mark).
const MARKS = ['#3B82F6', '#FFFFFF', '#111111', '#EDEAEA', 'red;x:url()'];
/** The ordinary sample colour, for other gallery specimens that draw a computer's mark (a detail header's leading). */
export const SAMPLE_MARK = MARKS[0]!;
// Made-up sample (gallery only; never a real credential).
const SAMPLE_TOKEN = 'hk_demo_7c2e5b8d1a0f4e6c';
const SAMPLE_HOST = 'atlas.example.net';
const SAMPLE_WHEN = new Date(2026, 9, 23, 9, 30).getTime();

/** ProblemList with onJump (rows with a line are presses) and without (plain rows). */
function ProblemListSpecimen() {
  const t = useKit3Strings();
  return (
    <Stack gap={4}>
      <ProblemList label={t('problems.label')} problems={PROBLEMS(t)} onJump={() => undefined} />
      <ProblemList label={t('problems.labelPlain')} problems={PROBLEMS(t)} />
    </Stack>
  );
}

/** Three diagnostics: an error with a line, a warning with a line, and one with no line. */
const PROBLEMS = (t: ReturnType<typeof useKit3Strings>) => [
  { line: 12, message: t('problems.notDefined') },
  { line: 40, message: t('problems.unused'), tone: 'warn' as const },
  { line: null, message: t('problems.noExport') },
];

export function useKit3Strings() {
  return useStrings(strings);
}

/** NodeLink's specimen: twenty entities around n0, a long name among them, a few links between the others. */
function NodeLinkSpecimen() {
  const t = useKit3Strings();
  const [selected, setSelected] = useState('n0');
  const { nodes, edges } = useMemo(() => {
    const ns: NodeLinkNode[] = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: i === 3 ? t('nodelink.long') : `entity-${i}` }));
    const es: NodeLinkEdge[] = ns.slice(1).map((n, i) => ({ id: `e${i}`, source: i % 3 === 2 ? n.id : 'n0', target: i % 3 === 2 ? 'n0' : n.id, relation: i % 2 ? t('nodelink.reads') : t('nodelink.uses') }));
    return { nodes: ns, edges: [...es, { id: 'e-x', source: 'n3', target: 'n1', relation: t('nodelink.reads') }] };
  }, [t]);
  return <NodeLink nodes={nodes} edges={edges} selected={selected} onSelect={setSelected} label={t('nodelink.label')} />;
}

export function Kit3Pieces() {
  const t = useKit3Strings();
  const [tags, setTags] = useState(['gpu', 'eu-west', 'nightly']);
  const [when, setWhen] = useState<number | null>(SAMPLE_WHEN);
  const [bad, setBad] = useState<number | null>(null);
  const [, setRetries] = useState(0);
  // ?part=ledgers shows the ledger pieces alone (StaticTable, ActionCards), so a shot frames them without the skeletons.
  // ?part=approval shows the approval-mode chip and its confirm alone (approvalMode.tsx).
  const [part] = useSearchParam('part');
  if (part === 'ledgers') return <LedgerPieces />;
  if (part === 'approval') return <ApprovalModePieces />;
  return (
    <Stack gap={5}>
      <Panel title={t('copy.title')}>
        <Stack gap={3}>
          <Row gap={3} wrap>
            <span className={s.what}>{t('copy.text')}</span>
            <code>{SAMPLE_HOST}</code>
            <CopyButton text={SAMPLE_HOST} label={t('copy.host')} />
          </Row>
          <Row gap={3} wrap>
            <span className={s.what}>{t('copy.atPress')}</span>
            <code>{t('copy.hidden')}</code>
            <CopyButton getValue={() => SAMPLE_TOKEN} label={t('copy.token')} withLabel />
          </Row>
          <Row gap={3} wrap>
            <span className={s.what}>{t('copy.md')}</span>
            <CopyButton text={SAMPLE_HOST} label={t('copy.host')} size="md" withLabel />
          </Row>
          <Row gap={3} wrap>
            <span className={s.what}>{t('copy.disabled')}</span>
            <CopyButton text={SAMPLE_HOST} label={t('copy.host')} isDisabled withLabel />
          </Row>
        </Stack>
      </Panel>
      <Panel title={t('meter.title')}>
        <Stack gap={3}>
          {[10, 30, 80, 95].map((v) => (
            <Row key={v} gap={3} wrap>
              <span className={s.what}>{t('meter.disk', { pct: String(v) })}</span>
              <Meter value={v} label={t('meter.diskName')} />
            </Row>
          ))}
          <Row gap={3} wrap>
            <span className={s.what}>{t('meter.neutral')}</span>
            <Meter value={95} tone="neutral" label={t('meter.diskName')} />
          </Row>
          <Row gap={3} wrap>
            <span className={s.what}>{t('meter.busy')}</span>
            <Meter indeterminate label={t('meter.busyName')} />
          </Row>
          <div className={s.fill}>
            <span className={s.what}>{t('meter.fill')}</span>
            <Meter value={62} size="fill" label={t('meter.diskName')} />
          </div>
        </Stack>
      </Panel>
      <AnatomySection id="scale-bar" title={t('scale.title')}>
        {/* ScaleBar: a plan's multiple on the scale of the largest one (one step each up to ten), and a scale past ten steps. */}
        <div data-gallery="scale-bar">
          <Facts
            layout="spec"
            columns={1}
            items={[
              ...[1, 2, 5].map((n) => ({ label: t('scale.row', { n: String(n), max: '5' }), value: <ScaleBar value={n} max={5} label={t('scale.name', { n: String(n) })} /> })),
              { label: t('scale.long'), value: <ScaleBar value={20} max={40} label={t('scale.name', { n: '20' })} /> },
            ]}
          />
        </div>
      </AnatomySection>
      <Panel title={t('dt.title')}>
        <Row gap={6} wrap align="start">
          <DateTimeField label={t('dt.around')} value={when} onChange={setWhen} description={t('dt.help')} />
          <DateTimeField label={t('dt.empty')} value={bad} onChange={setBad} errorMessage={t('dt.refused')} />
          <DateTimeField label={t('dt.disabled')} value={SAMPLE_WHEN} onChange={() => undefined} isDisabled />
        </Row>
      </Panel>
      <AnatomySection id="path-field" title={t('path.title')}>
        {/* PathField: a folder (Browse has Use this folder), a file with a refusal, a folder that can't be read. */}
        <div data-gallery="path-field"><PathSpecimen /></div>
      </AnatomySection>
      <Panel title={t('mark.title')}>
        <Stack gap={2}>
          {MARKS.map((color) => (
            <div key={color} data-gallery-mark={color}>
              <Row gap={2}>
                <ComputerMark color={color} />
                <ComputerMark color={color} size="md" />
                <span>{t('mark.name', { color })}</span>
              </Row>
            </div>
          ))}
        </Stack>
      </Panel>
      <AnatomySection id="brand-mark" title={t('brand.title')}>
        {/* BrandMark: beside the navigation and on the lock screen (sm), the first word alone, the mark alone (a collapsed rail), and an auth card's (lg). */}
        <div data-gallery="brand-mark">
          <Row gap={6} wrap>
            <BrandMark />
            <BrandMark hub={false} />
            <BrandMark words={false} />
            <BrandMark size="lg" />
          </Row>
        </div>
      </AnatomySection>
      <AnatomySection id="node-link" title={t('nodelink.title')}>
        {/* NodeLink: an entity with more links than the drawing holds (the over-limit line), and a long name. Press a neighbour to move. */}
        <div data-gallery="node-link"><NodeLinkSpecimen /></div>
      </AnatomySection>
      <AnatomySection id="problem-list" title={t('problems.title')}>
        {/* ProblemList: a code check's diagnostics; with onJump each row with a line is a press, without it plain rows. */}
        <div data-gallery="problem-list"><ProblemListSpecimen /></div>
      </AnatomySection>
      <AnatomySection id="plan-cards" title={t('plan.title')}>
        {/* PlanCard: a ready card, the accent one, a plan the person has (with label | value rows), a long name and price, loading, error. */}
        <PlanGrid data-gallery="plan-cards">
          <PlanCard
            name={t('plan.free')}
            price={{ amount: '$0' }}
            specs={[t('plan.cores', { n: '2' }), t('plan.memory', { n: '2 GB' })]}
            marks={<><Tag>{t('plan.yours')}</Tag><Tag tone="accent">{t('plan.next')}</Tag></>}
            action={<Button>{t('plan.open')}</Button>}
          />
          <PlanCard
            name={t('plan.pro')}
            chip={t('plan.shared')}
            tone="accent"
            price={{ amount: '$12', per: t('plan.perMonth') }}
            lead={t('plan.lead')}
            specs={[t('plan.cores', { n: '4' }), t('plan.memory', { n: '8 GB' }), t('plan.disk', { n: '80 GB' })]}
            more={[t('plan.snapshots'), t('plan.aliases')]}
            marks={<Tag tone="accent">{t('plan.next')}</Tag>}
            footnote={t('plan.hold')}
            action={<Button variant="primary">{t('plan.upgrade')}</Button>}
          />
          <PlanCard
            name={t('plan.team')}
            tone="current"
            price={{ amount: '$48', per: t('plan.perMonth') }}
            rows={[
              { id: 'ram', label: t('plan.rowMemory'), value: '32 GB' },
              { id: 'disk', label: t('plan.rowDisk'), value: '500 GB' },
            ]}
            specs={[t('plan.cores', { n: '16' }), t('plan.memory', { n: '32 GB' })]}
            marks={<Tag>{t('plan.have')}</Tag>}
            action={<Button>{t('plan.manage')}</Button>}
          />
          <PlanCard
            name={t('plan.long')}
            price={{ amount: '$1,234,567.89', per: t('plan.perMonth') }}
            specs={[t('plan.cores', { n: '128' })]}
            action={<Button>{t('plan.upgrade')}</Button>}
          />
          <PlanCard name={t('plan.pro')} state="loading" />
          <PlanCard name={t('plan.pro')} state="error" note={t('plan.failed')} onRetry={() => setRetries((n) => n + 1)} />
        </PlanGrid>
        {/* A wide card: the grid's last child, on a row of its own under the others; its price is its price row, and its
            other rows sit side by side, one column of them under each column of cards. */}
        <PlanGrid data-gallery="plan-cards-wide" wide>
          <PlanCard name={t('plan.free')} fill="calm" price={{ amount: '$0', per: t('plan.perMonth') }} rows={[{ id: 'ram', label: t('plan.rowMemory'), value: '2 GB' }]} />
          <PlanCard name={t('plan.pro')} fill="calm" price={{ amount: '$12', per: t('plan.perMonth') }} rows={[{ id: 'ram', label: t('plan.rowMemory'), value: '8 GB' }]} action={<Button>{t('plan.upgrade')}</Button>} />
          <PlanCard name={t('plan.team')} fill="plan" tone="accent" price={{ amount: '$48', per: t('plan.perMonth') }} rows={[{ id: 'ram', label: t('plan.rowMemory'), value: '32 GB' }]} action={<Button variant="primary">{t('plan.upgrade')}</Button>} />
          <PlanCard
            wide
            name={t('plan.whole')}
            subTitle={t('plan.wholeAbout')}
            tone="accent"
            fill="lift"
            rows={[
              { id: 'from', label: t('plan.from'), value: t('plan.fromAmount'), price: true },
              { id: 'region', label: t('plan.rowRegion'), value: t('plan.rowRegionPick') },
              { id: 'cores', label: t('plan.rowCores'), value: '8–64' },
              { id: 'ram', label: t('plan.rowMemory'), value: '32–512 GB' },
              { id: 'disk', label: t('plan.rowDisk'), value: '500 GB–4 TB' },
            ]}
            action={<Button>{t('plan.browse')}</Button>}
          />
        </PlanGrid>
      </AnatomySection>
      <ComputerPickerPieces />
      <FileChooserPieces />
      <PickCardPieces />
      <ProjectProgramPickerPieces />
      <AskAgentPieces />
      <ApprovalModePieces />
      <GlancePieces />
      <WorkCellsPieces />
      <LedgerPieces />
      <DraftyPieces />
      <IpInfoPieces />
      <Panel title={t('tag.title')}>
        <Row gap={2} wrap>
          {tags.map((tag) => (
            <Tag key={tag} onRemove={() => setTags((all) => all.filter((x) => x !== tag))}>
              {tag}
            </Tag>
          ))}
          <Tag tone="warn" onRemove={() => undefined}>
            {t('tag.warn')}
          </Tag>
          <Tag>{t('tag.plain')}</Tag>
        </Row>
        {/* StatusToggle: a StatusPill that is its own switch, on, cannot tell (mixed) and off. */}
        <Row gap={2} wrap>
          <StatusToggle tone="warn" isPressed onPress={() => undefined}>
            {t('toggle.on')}
          </StatusToggle>
          <StatusToggle isPressed="mixed" onPress={() => undefined}>
            {t('toggle.mixed')}
          </StatusToggle>
          <StatusToggle isPressed={false} onPress={() => undefined}>
            {t('toggle.off')}
          </StatusToggle>
        </Row>
      </Panel>
      <AnatomySection id="tiles" title={t('tile.title')}>
        {/* Tile: the filled stacked tile (a keycap above its words, as on Home's Shortcuts) and the plain centred one. */}
        <Row gap={3} wrap>
          <Tile>
            <Shortcut keys="Mod+K" />
            {t('tile.fill')}
          </Tile>
          <Tile plain layout="center">
            {t('tile.plain')}
          </Tile>
        </Row>
      </AnatomySection>
    </Stack>
  );
}
