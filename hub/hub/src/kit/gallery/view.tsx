// The kit gallery (/_kit): every component in every state, one tab per family. `?tab=` picks the
// family, `?open=<state>` opens an overlay (see the overlays tab) and `?layout=settings|dashboard|wizard|faq|rail|
// ai-conversation|sg-pane|list-side|list-fill` renders that whole-page layout (`sg-pane`: setting groups in a
// ListDetailPage pane), so hub:shots --kit can frame each state without clicks.
import { lazy, type ReactNode, Suspense, useMemo, useState } from 'react';
import { Button, IconButton, LinkButton, type ButtonSize } from '../controls/Button';
import { ButtonStrip } from '../controls/ButtonStrip';
import { CountBadge } from '../controls/CountBadge';
import { ExtLink, Link, autolink } from '../controls/Link';
import { DataTable } from '../data/DataTable';
import { Facts, StatTile, StatusPill, Tag, type Tone } from '../data/Display';
import type { HlLang } from '../data/highlight';
import { CodeBlock, CopyField, IdChip } from '../data/Ids';
import { When } from '../data/When';
import { Checkbox, Switch, TextField } from '../forms/fields';
import { ColorPicker } from '../forms/ColorPicker';
import { Combobox, EntityPicker, Form, FormFooter, NumberField, RadioGroup, SecretField, SecretInput, Select } from '../forms/more';
import { formatDateTime } from '../format';
import { DetailPage, Panel } from '../layouts/Layouts';
import { Row, Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import type { OutcomeLike } from '../outcome';
import { ActionMenu, Popover, Tooltip } from '../overlays/Overlays';
import { GalleryAiConversation } from './aiConversation';
import { OverlaysTab, useOverlaysStrings } from './overlays';
import { ToastsTab, useToastsStrings } from './toasts';
import { EmptyState, ErrorState, OutcomeBanner, Skeleton, Spinner } from '../states/States';
import { useStrings } from '../strings';
import { createColumnHelper } from '@tanstack/react-table';
import strings from './strings.en.json';
import { GalleryDashboard, GalleryFaq, GallerySettings, GalleryWizard } from './layouts';
import { GalleryRail } from './rail';
import { Kit2Feedback, Kit2Nav, Kit2Qr, Kit2Text, Kit2Widgets, useKit2Strings } from './kit2';
import { HubFormsSecure, useHubFormsStrings } from './hubforms';
import { Kit3Pieces, useKit3Strings } from './kit3';
import { GalleryListDetail, TableGallery, useTableStrings } from './table';
import { DataViewGallery } from './dataview';
import { GallerySettingPane, SettingGroupsTab, useSettingGroupsStrings } from './settingGroups';
import dataViewStrings from './dataview.strings.en.json';
import s from './gallery.module.css';
import m from './controls.module.css';
import chooserStrings from './chooser.strings.en.json';
import modelsStrings from './models.strings.en.json';
import modelPickStrings from './modelPick.strings.en.json';
import controlsStrings from './controls.strings.en.json';
import voiceStrings from './voice.strings.en.json';
import loadScreenStrings from './loadScreen.strings.en.json';

// A computer's colour is API data the gallery shows, not a Hub colour (an exception listed in exceptions.ts).
const COMPUTER_COLOR = '#4ECDC4';

// Example addresses for the web-address specimens (the docs one is the public docs page; the others sit on a reserved
// example host): the secret one holds two 24-hex ids in its host.
const DOCS_URL = 'https://hoody.com/docs';
const SECRET_URL = 'https://6a0000000000000000000001-c0ffee0000000000000000aa-http-8080.n12.example.test';
const LONG_URL = 'https://docs.example.test/guides/connect-a-computer/step-by-step/with-a-very-long-path/that-never-fits-one-line';
const SSH_HOST = 'ssh://root@host.example.test:22';

// The models and chooser tabs read the 7k-model fixture: loaded only when the tab opens.
const ModelsTab = lazy(() => import('./models'));
const ChooserTab = lazy(() => import('./chooser'));
// The one model picker: panel, field and chip on the same fixture.
const ModelPickTab = lazy(() => import('./modelPick'));
// The voice tab (kit/voice: Talk button, Talk bar, captions), loaded when it opens.
const VoiceTab = lazy(() => import('./voice').then((m) => ({ default: m.VoiceTab })));
// The load screen tab (kit/states/LoadScreen: a wait drawn as a game's loading screen), loaded when it opens.
const LoadScreenTab = lazy(() => import('./loadScreen').then((m) => ({ default: m.LoadScreenTab })));
// The controls tab: one specimen per cell of the control spec, measured by controls.matrix.spec.ts.
const ControlsTab = lazy(() => import('./controls').then((m) => ({ default: m.ControlsTab })));

type T = ReturnType<typeof useStrings<typeof strings>>;

export default function KitGallery() {
  const t = useStrings(strings);
  const k2 = useKit2Strings();
  const tbl = useTableStrings();
  const hf = useHubFormsStrings();
  const k3 = useKit3Strings();
  const ov = useOverlaysStrings();
  const ts = useToastsStrings();
  const sg = useSettingGroupsStrings();
  const [layout] = useSearchParam('layout');
  // ?dstate=here: DetailPage's kit state in place of the tab content.
  const [dstate] = useSearchParam('dstate');
  if (layout === 'settings') return <GallerySettings />;
  if (layout === 'dashboard') return <GalleryDashboard />;
  if (layout === 'wizard') return <GalleryWizard />;
  if (layout === 'faq') return <GalleryFaq />;
  if (layout === 'rail') return <GalleryRail />;
  if (layout === 'ai-conversation') return <GalleryAiConversation />;
  if (layout === 'sg-pane') return <GallerySettingPane />;
  if (layout === 'list-side' || layout === 'list-fill') return <GalleryListDetail mode={layout === 'list-side' ? 'side' : 'fill'} />;
  return (
    <DetailPage
      header={{ title: t('title'), subtitle: t('subtitle') }}
      accent={COMPUTER_COLOR}
      state={dstate === 'here' ? { kind: 'notHere', icon: 'realm', title: tbl('detail.pickTitle'), body: tbl('detail.pickBody') } : undefined}
      tabs={[
        { id: 'actions', label: t('tab.actions'), content: <Actions t={t} /> },
        { id: 'data', label: t('tab.data'), content: <Data t={t} /> },
        { id: 'forms', label: t('tab.forms'), content: <Forms t={t} /> },
        { id: 'overlays', label: ov('tab'), content: <OverlaysTab /> },
        { id: 'states', label: t('tab.states'), content: <States t={t} /> },
        { id: 'text', label: k2('tab.text'), content: <Kit2Text /> },
        { id: 'feedback', label: k2('tab.feedback'), content: <Kit2Feedback /> },
        { id: 'toasts', label: ts('tab'), content: <ToastsTab /> },
        { id: 'nav', label: k2('tab.nav'), content: <Kit2Nav /> },
        { id: 'qr', label: k2('tab.qr'), content: <Kit2Qr /> },
        { id: 'widgets', label: k2('tab.widgets'), content: <Kit2Widgets /> },
        { id: 'table', label: tbl('tab'), content: <TableGallery /> },
        { id: 'dataview', label: dataViewStrings.tab, content: <DataViewGallery /> },
        { id: 'secure', label: hf('tab.secure'), content: <HubFormsSecure /> },
        { id: 'pieces', label: k3('tab'), content: <Kit3Pieces /> },
        { id: 'groups', label: sg('tab'), content: <SettingGroupsTab /> },
        { id: 'models', label: modelsStrings.tab, content: <Suspense fallback={<Skeleton variant="table" rows={6} />}><ModelsTab /></Suspense> },
        { id: 'chooser', label: chooserStrings.tab, content: <Suspense fallback={<Skeleton variant="table" rows={6} />}><ChooserTab /></Suspense> },
        { id: 'modelpick', label: modelPickStrings.tab, content: <Suspense fallback={<Spinner />}><ModelPickTab /></Suspense> },
        { id: 'voice', label: voiceStrings.tab, content: <Suspense fallback={null}><VoiceTab /></Suspense> },
        { id: 'controls', label: controlsStrings.tab, content: <Suspense fallback={null}><ControlsTab /></Suspense> },
        { id: 'loadscreen', label: loadScreenStrings.tab, content: <Suspense fallback={null}><LoadScreenTab /></Suspense> },
      ]}
    />
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────────────

/** The kinds of labelled button, in the matrix's column order. `danger` is the danger tone and `primaryDanger` the same
 *  tone on a primary: both draw the danger plate. */
const BUTTON_KINDS = ['primary', 'secondary', 'ghost', 'danger', 'primaryDanger', 'row', 'link'] as const;
type ButtonKind = (typeof BUTTON_KINDS)[number];

/** The kinds of icon-only button, in column order, each with its own icon and name. */
const ICON_KINDS = [
  { kind: 'ghost', icon: 'reload', name: 'icon.refresh' },
  { kind: 'secondary', icon: 'pen', name: 'icon.edit' },
  { kind: 'primary', icon: 'plus', name: 'icon.add' },
  { kind: 'danger', icon: 'trash', name: 'icon.delete' },
] as const;

/** What one matrix row varies: a size at rest, or a state at the medium size. */
interface MatrixRow {
  id: 'md' | 'sm' | 'xs' | 'toolbar' | 'pressed' | 'disabled' | 'soft' | 'busy';
  size?: ButtonSize;
  state?: 'pressed' | 'disabled' | 'soft' | 'busy';
}
const SIZE_ROWS: readonly MatrixRow[] = [{ id: 'md' }, { id: 'sm', size: 'sm' }, { id: 'xs', size: 'xs' }, { id: 'toolbar', size: 'toolbar' }];
const STATE_ROWS: readonly MatrixRow[] = [
  { id: 'disabled', state: 'disabled' },
  { id: 'soft', state: 'soft' },
  { id: 'busy', state: 'busy' },
];
const BUTTON_ROWS: readonly MatrixRow[] = [...SIZE_ROWS, ...STATE_ROWS];
// Only an icon button has a pressed (toggled) state.
const ICON_ROWS: readonly MatrixRow[] = [...SIZE_ROWS, { id: 'pressed', state: 'pressed' }, ...STATE_ROWS];

function Actions({ t }: { t: T }) {
  // ?part=buttons, button-states, button-marks or icon-buttons shows that block alone, so a shot frames it whole.
  const [part] = useSearchParam('part');
  const shows = (...parts: string[]) => part === undefined || parts.includes(part);
  const matrix = shows('buttons', 'button-states');
  return (
    <Stack gap={5}>
      {(matrix || shows('button-marks')) && (
        <Panel title={t(matrix ? 'sec.buttons' : 'sec.buttonMarks')} description={t(matrix ? 'sec.buttonsDesc' : 'sec.buttonMarksDesc')}>
          <Stack gap={5}>
            {matrix && <ButtonMatrix t={t} rows={part === 'button-states' ? STATE_ROWS : BUTTON_ROWS} />}
            {shows('button-marks') && <ButtonMarks t={t} />}
          </Stack>
        </Panel>
      )}
      {shows('icon-buttons') && <IconButtons t={t} />}
      {shows() && <Menus t={t} />}
    </Stack>
  );
}

/** The shrink specimen: a ghost sm button whose data label may be cut, inside the slot its row gives it. */
function ShrinkSpecimen({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="sm" literal shrink>
      {label}
    </Button>
  );
}

/** One specimen of the button matrix: a kind of button, its own name as the label, in a row's size or state. */
function KindButton({ kind, row, t }: { kind: ButtonKind; row: MatrixRow; t: T }) {
  const off = row.state === 'disabled' || row.state === 'soft';
  const look = { size: row.size, isDisabled: off, disabledReason: row.state === 'soft' ? t('btn.reason') : undefined };
  const busy = row.state === 'busy';
  if (kind === 'link') {
    // A link is never busy: its place in that row stays empty.
    if (busy) return null;
    return (
      <LinkButton href="/demo" {...look}>
        {t(`kind.${kind}`)}
      </LinkButton>
    );
  }
  if (kind === 'danger' || kind === 'primaryDanger')
    return (
      <Button variant={kind === 'danger' ? 'secondary' : 'primary'} tone="danger" {...look} busy={busy}>
        {t(`kind.${kind}`)}
      </Button>
    );
  return (
    <Button variant={kind} {...look} busy={busy}>
      {t(`kind.${kind}`)}
    </Button>
  );
}

/** One named row of specimens that are no matrix: the name, then the specimens, which wrap. */
function NamedRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <tr className={m.matrixRow}>
      <th scope="row" className={m.matrixName}>
        {name}
      </th>
      <td className={m.matrixCell}>
        <Row wrap gap={3}>
          {children}
        </Row>
      </td>
    </tr>
  );
}

/** The button matrix: one column per kind of button, one row per size and then per state. A real table, so the `row`
 *  kind sits in a table row and turns accent while its row is under the pointer, as it does in a page's table. */
function ButtonMatrix({ t, rows }: { t: T; rows: readonly MatrixRow[] }) {
  return (
    <table className={m.matrix} data-gallery="buttons">
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={m.matrixRow}>
            <th scope="row" className={m.matrixName}>
              {t(`row.${row.id}`)}
            </th>
            {BUTTON_KINDS.map((kind) => (
              <td key={kind} className={m.matrixCell}>
                <KindButton kind={kind} row={row} t={t} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What a button can carry beside its label, one named row each: the end mark, icons, a shortcut, a label shown as
 *  written; then the link button, the busy and off looks, the joined strip and the idea plate. */
function ButtonMarks({ t }: { t: T }) {
  return (
    <table className={m.matrix} data-gallery="button-marks">
      <tbody>
        <NamedRow name={t('mark.end')}>
          <Button variant="primary">{t('btn.primary')}</Button>
          <Button>{t('btn.secondary')}</Button>
          <Button chipIcon="plus">{t('btn.markPlus')}</Button>
          <Button chipIcon="check">{t('btn.markCheck')}</Button>
          <Button chipIcon="mic">{t('btn.markMic')}</Button>
          <Button chipIcon="external">{t('btn.markExternal')}</Button>
        </NamedRow>
        <NamedRow name={t('mark.endSmall')}>
          <Button size="sm">{t('btn.small')}</Button>
          <Button size="sm" variant="primary" chipIcon="plus">
            {t('btn.smallPrimary')}
          </Button>
          {/* An end icon on a button with the end mark: the mark is the icon's pixel twin. */}
          <Button size="sm" iconEnd="external">
            {t('btn.smallEnd')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.none')}>
          <Button chip={false}>{t('btn.noChip')}</Button>
          <Button variant="primary" chip={false}>
            {t('btn.noMarkPrimary')}
          </Button>
          <Button size="sm" chip={false}>
            {t('btn.noMarkSmall')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.start')}>
          <Button chip={false} icon="download">
            {t('btn.startIcon')}
          </Button>
          <Button variant="ghost" icon="reload">
            {t('btn.ghost')}
          </Button>
          <Button tone="danger" icon="trash">
            {t('btn.danger')}
          </Button>
          <Button variant="ghost" size="sm" icon="pen">
            {t('btn.startSmall')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.endIcon')}>
          <Button variant="ghost" iconEnd="chevron-down">
            {t('btn.endIcon')}
          </Button>
          <Button chip={false} iconEnd="external">
            {t('btn.endIconPlain')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.shortcut')}>
          <Button shortcut="Mod+J">{t('btn.shortcutMark')}</Button>
          <Button chip={false} shortcut="Mod+K">
            {t('btn.shortcut')}
          </Button>
          <Button variant="ghost" shortcut="?">
            {t('btn.shortcutHelp')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.literal')}>
          <Button literal>{t('btn.literal')}</Button>
          <Button variant="ghost" literal>
            {t('btn.literalName')}
          </Button>
        </NamedRow>
        {/* shrink: a data label under its parent's cap ends in an ellipsis, the button no wider than the cap. */}
        <NamedRow name={t('mark.shrink')}>
          <span className={m.capSlot} data-gallery-cap="">
            <ShrinkSpecimen label={t('btn.shrinkName')} />
          </span>
          <span className={m.capSqueezed} data-gallery-cap-squeezed="">
            <ShrinkSpecimen label={t('btn.shrinkShort')} />
          </span>
        </NamedRow>
        {/* A worded toggle: on holds the pressed plate (aria-pressed), off is the plate at rest. */}
        <NamedRow name={t('mark.toggle')}>
          <Button variant="ghost" pressed>
            {t('btn.toggleOn')}
          </Button>
          <Button variant="ghost" pressed={false}>
            {t('btn.toggleOff')}
          </Button>
        </NamedRow>
        <NamedRow name={t('mark.link')}>
          <LinkButton href="/demo">{t('btn.link')}</LinkButton>
          <LinkButton href={DOCS_URL} chipIcon="external">
            {t('btn.linkOut')}
          </LinkButton>
          <LinkButton href="/demo" variant="ghost">
            {t('btn.linkGhost')}
          </LinkButton>
        </NamedRow>
        <NamedRow name={t('mark.off')}>
          <Button variant="primary" busy>
            {t('btn.busy')}
          </Button>
          <Button isDisabled>{t('btn.disabled')}</Button>
          {/* A disabled primary, native and aria-disabled (focusable): both drop to the grey plate. */}
          <Button variant="primary" isDisabled>
            {t('btn.disabledPrimary')}
          </Button>
          <Button variant="primary" aria-disabled="true">
            {t('btn.ariaDisabled')}
          </Button>
        </NamedRow>
        {/* Quiet actions joined into one strip, the view's primary button beside it. */}
        <NamedRow name={t('mark.strip')}>
          <ButtonStrip label={t('strip.label')}>
            <Button variant="ghost" size="sm" icon="agent">
              {t('strip.agent')}
            </Button>
            <IconButton icon="dots" label={t('strip.more')} more />
          </ButtonStrip>
          <Button variant="primary" icon="plus">
            {t('strip.new')}
          </Button>
        </NamedRow>
        {/* bubble: Home's idea plate, a sentence, never in capitals. */}
        <NamedRow name={t('mark.bubble')}>
          <Button variant="bubble">{t('btn.bubble')}</Button>
        </NamedRow>
      </tbody>
    </table>
  );
}

/** One specimen of the icon button matrix: a kind of icon-only button in a row's size or state. */
function KindIconButton({ kind, row, t }: { kind: (typeof ICON_KINDS)[number]; row: MatrixRow; t: T }) {
  return (
    <IconButton
      icon={kind.icon}
      label={t(kind.name)}
      variant={kind.kind === 'danger' ? 'ghost' : kind.kind}
      tone={kind.kind === 'danger' ? 'danger' : 'default'}
      size={row.size}
      pressed={row.state === 'pressed' ? true : undefined}
      isDisabled={row.state === 'disabled' || row.state === 'soft'}
      disabledReason={row.state === 'soft' ? t('btn.reason') : undefined}
      busy={row.state === 'busy'}
    />
  );
}

/** The icon-only buttons: a matrix of kind by size and state, then the three-dot button and a tooltip's shortcut. */
function IconButtons({ t }: { t: T }) {
  return (
    <Panel title={t('sec.iconButtons')} description={t('sec.iconButtonsDesc')}>
      <Stack gap={4}>
        <table className={m.matrix} data-gallery="icon-buttons">
          <thead className={m.matrixHead}>
            <tr>
              <td />
              {ICON_KINDS.map((k) => (
                <th key={k.kind} scope="col" className={m.matrixName}>
                  {t(`iconKind.${k.kind}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ICON_ROWS.map((row) => (
              <tr key={row.id} className={m.matrixRow}>
                <th scope="row" className={m.matrixName}>
                  {t(`row.${row.id}`)}
                </th>
                {ICON_KINDS.map((k) => (
                  <td key={k.kind} className={m.matrixCell}>
                    <KindIconButton kind={k} row={row} t={t} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <table className={m.matrix}>
          <tbody>
            {/* A three-dot button is the small plate at any size asked for; a toolbar's keeps the toolbar's. */}
            <NamedRow name={t('mark.more')}>
              <IconButton icon="dots" label={t('icon.more')} more />
              <IconButton icon="dots" label={t('icon.more')} more size="sm" />
              <IconButton icon="dots" label={t('icon.more')} more size="toolbar" />
            </NamedRow>
            <NamedRow name={t('mark.tipShortcut')}>
              <IconButton icon="reload" label={t('icon.refresh')} shortcut="R" />
            </NamedRow>
            {/* The count pinned to an icon or set beside a label: plain, capped, a lower bound, and one that asks for attention. */}
            <NamedRow name={t('mark.count')}>
              <CountBadge count={3} />
              <CountBadge count={120} />
              <CountBadge count={5} atLeast />
              <CountBadge count={7} tone="accent" label={t('badge.waiting')} />
            </NamedRow>
          </tbody>
        </table>
      </Stack>
    </Panel>
  );
}

function Menus({ t }: { t: T }) {
  return (
    <Panel title={t('sec.menus')}>
      <Row wrap gap={3}>
        <ActionMenu
          trigger={<Button iconEnd="chevron-down">{t('btn.menu')}</Button>}
          placement="bottom start"
          items={[
            { id: 'open', label: t('menu.open'), icon: 'external', onAction: () => undefined },
            { id: 'rename', label: t('menu.rename'), icon: 'pen', shortcut: 'F2', onAction: () => undefined },
            { id: 'dup', label: t('menu.duplicate'), icon: 'copy', onAction: () => undefined, isDisabled: true },
            '-',
            { id: 'restart', label: t('menu.restart'), icon: 'reload', onAction: () => undefined },
            { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', onAction: () => undefined },
          ]}
        />
        <ActionMenu items={[{ id: 'open', label: t('menu.open'), onAction: () => undefined }]} />
        <Popover trigger={<Button icon="clock">{t('btn.popover')}</Button>} label={t('popover.title')} title={t('popover.title')}>
          <p className={s.p}>{t('popover.body')}</p>
        </Popover>
        <Tooltip content={t('tip.text')} shortcut="?">
          <Button variant="ghost">{t('btn.tooltip')}</Button>
        </Tooltip>
        <Link href="/demo">{t('link.internal')}</Link>
        <Link href="https://hoody.com/docs">{t('link.external')}</Link>
      </Row>
    </Panel>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────────────

type Status = 'running' | 'stopped' | 'error' | 'starting';
type Region = 'sin' | 'fra' | 'nyc';
interface Box {
  id: string;
  name: string;
  status: Status;
  region: Region;
  cpu: number;
  memory: number;
  updatedAt: string;
}
const TONE: Record<Status, Tone> = { running: 'ok', stopped: 'neutral', error: 'danger', starting: 'info' };
const STATUSES: Status[] = ['running', 'running', 'stopped', 'running', 'error', 'starting'];
const REGIONS: Region[] = ['sin', 'fra', 'nyc'];
const WORDS = ['web', 'api', 'worker', 'db', 'cache', 'build', 'search', 'mail'];
const BOXES: Box[] = Array.from({ length: 240 }, (_, i) => ({
  // A 24-hex id built as text: the number form overflows doubles and every row got one id.
  id: `6512a0f0c4e3b1d2${(0xa0000000 + i * 7919).toString(16).padStart(8, '0')}`,
  name: `${WORDS[i % WORDS.length]}-${Math.floor(i / WORDS.length) + 1}`,
  status: STATUSES[i % STATUSES.length] ?? 'running',
  region: REGIONS[i % REGIONS.length] ?? 'sin',
  cpu: (i * 37) % 100,
  memory: 2 ** ((i % 5) + 1),
  updatedAt: new Date(Date.UTC(2026, 9, 22, 12) - i * 3_600_000 * 3).toISOString(),
}));
const col = createColumnHelper<Box>();

function Data({ t }: { t: T }) {
  const [status, setStatus] = useSearchParam('status');
  const [region, setRegion] = useSearchParam('region');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('col.name'), meta: { pinned: true } }),
      col.accessor('status', {
        header: t('col.status'),
        meta: { width: '120px', priority: 1, list: 'status' },
        cell: (c) => (
          <StatusPill tone={TONE[c.getValue()]} dot>
            {t(`status.${c.getValue()}`)}
          </StatusPill>
        ),
      }),
      col.accessor('region', { header: t('col.region'), cell: (c) => t(`region.${c.getValue()}`), meta: { width: '140px', priority: 2 } }),
      col.accessor('cpu', { header: t('col.cpu'), cell: (c) => `${c.getValue()}%`, meta: { align: 'end', width: '80px', mono: true } }),
      col.accessor('memory', { header: t('col.memory'), cell: (c) => `${c.getValue()} GB`, meta: { align: 'end', width: '104px', priority: 3 } }),
      col.accessor('updatedAt', { header: t('col.updated'), cell: (c) => formatDateTime(c.getValue()), meta: { width: '200px', priority: 4 } }),
    ],
    [t],
  );
  const rows = BOXES.filter((b) => (!status || b.status === status) && (!region || b.region === region));
  return (
    <Stack gap={5}>
      <div className={s.stats}>
        <StatTile label={t('stat.running')} value="18" hint={t('stat.runningHint')} icon="computer" tone="ok" />
        <StatTile label={t('stat.storage')} value="1.2 TB" hint={t('stat.storageHint')} icon="files" />
        <StatTile label={t('stat.alerts')} value="3" hint={t('stat.alertsHint')} icon="bell" tone="warn" />
        <StatTile label={t('stat.spend')} value="$142.80" hint={t('stat.spendHint')} icon="wallet" />
      </div>
      <Panel title={t('sec.table')} description={t('sec.tableDesc')} flush>
        <div className={s.tableBox}>
          <DataTable
            label={t('sec.table')}
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            search
            filters={[
              {
                id: 'status',
                label: t('filter.status'),
                value: status,
                onChange: (v) => setStatus(v, { replace: true }),
                options: (['running', 'stopped', 'error', 'starting'] as const).map((v) => ({ value: v, label: t(`status.${v}`) })),
              },
              {
                id: 'region',
                label: t('filter.region'),
                value: region,
                onChange: (v) => setRegion(v, { replace: true }),
                options: REGIONS.map((v) => ({ value: v, label: t(`region.${v}`) })),
              },
            ]}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={() => (
              <>
                <Button size="sm" icon="stop">
                  {t('bulk.stop')}
                </Button>
                <Button size="sm" icon="reload">
                  {t('bulk.restart')}
                </Button>
              </>
            )}
            actions={() => [{ id: 'open', label: t('row.open'), icon: 'arrow-right', hover: true, onAction: () => undefined }]}
            onRowAction={false}
          />
        </div>
      </Panel>
      <div className={s.twoCol}>
        <Panel title={t('sec.facts')}>
          <Stack gap={4}>
            <Facts
              columns={2}
              items={[
                { label: t('fact.status'), value: <StatusPill tone="ok" dot>{t('status.running')}</StatusPill> },
                { label: t('fact.plan'), value: t('fact.planValue') },
                { label: t('fact.region'), value: t('region.sin') },
                { label: t('fact.created'), value: formatDateTime('2026-09-14T08:30:00Z') },
                { label: t('fact.changed'), value: <When at="2026-09-14T08:30:00Z" /> },
                { label: t('fact.owner'), value: t('fact.ownerValue') },
                { label: t('fact.reference'), value: <IdChip id="6512a0f0c4e3b1d2a0f19c7e" label={t('id.label')} /> },
                { label: t('fact.backups'), value: t('fact.backupsValue'), meter: { value: 30, label: t('fact.backupsMeter') } },
              ]}
            />
            {/* A wrapping group of IdChips 4 px apart (as the key inspector's realm chips): each copy keeps its own press. */}
            <Row wrap gap={1}>
              {['6512a0f0c4e3b1d2a0f19c01', '6512a0f0c4e3b1d2a0f19c02', '6512a0f0c4e3b1d2a0f19c03', '6512a0f0c4e3b1d2a0f19c04'].map((id) => (
                <IdChip key={id} id={id} label={t('id.label')} />
              ))}
            </Row>
            <Row wrap gap={2}>
              <StatusPill tone="neutral">{t('pill.neutral')}</StatusPill>
              <StatusPill tone="ok" dot>
                {t('pill.ok')}
              </StatusPill>
              <StatusPill tone="warn" icon="warn">
                {t('pill.warn')}
              </StatusPill>
              <StatusPill tone="danger" dot>
                {t('pill.danger')}
              </StatusPill>
              <StatusPill tone="info" dot>
                {t('pill.info')}
              </StatusPill>
              <StatusPill tone="accent">{t('pill.accent')}</StatusPill>
            </Row>
            <p className={s.p}>{autolink(t('ext.text', { url: DOCS_URL }))}</p>
            <Facts
              columns={2}
              items={[
                { label: t('ext.fact.docs'), url: DOCS_URL },
                { label: t('ext.fact.address'), url: SECRET_URL, secretUrl: true },
                { label: t('ext.fact.plain'), value: SECRET_URL },
                { label: t('ext.fact.notWeb'), value: SSH_HOST },
              ]}
            />
            <div className={s.narrowCell}>
              <ExtLink url={LONG_URL} look="nav" truncate />
            </div>
          </Stack>
        </Panel>
        <Panel title={t('sec.code')}>
          <Stack gap={4}>
            <CopyField label={t('copy.label')} value="https://5d1c0a9e3b7f2468ace13579-b2d4f6a8c0e1357924680ace-http-8080.quiet-amber-heron-1234-fra.computers.hoody.com" description={t('copy.desc')} />
            <CodeBlock label={t('code.label')} lang="shell" prompt code={'curl -fsSL https://install.hoody.com | sh\nhoody login'} />
            {SYNTAX_SAMPLES.map(([lang, code]: readonly [HlLang | 'bash', string]) => (
              <CodeBlock key={lang} label={t('code.sample', { lang })} lang={lang} code={code} />
            ))}
          </Stack>
        </Panel>
      </div>
    </Stack>
  );
}

// Syntax colour samples for the Code panel (CodeBlock lang): one per language. Shell colours commands, flags and
// variables only; its strings and comments stay plain.
const SYNTAX_SAMPLES: readonly (readonly ['bash' | 'json' | 'ts' | 'yaml' | 'http' | 'python', string])[] = [
  ['bash', 'hoody login\nhoody computers list --realm $HOODY_REALM -o json\nexport API=$HOODY_URL/v1 && curl -fsSL $API/ping'],
  ['json', '{\n  "name": "web-1",\n  "ports": [80, 443],\n  "public": true,\n  "owner": null\n}'],
  ['ts', "// Ask the agent for its bots\nconst res = await fetch(`${base}/bots?limit=${n}`, { headers: { 'X-Realm': realm } });\nif (!res.ok) throw new Error(`status ${res.status}`);\nexport type Bot = { id: string; name: string };"],
  ['yaml', 'name: web # the app\nports:\n  - 8080\n  - "9090"\nenabled: true\nimage: ghcr.io/acme/web:1.4'],
  ['http', 'POST /api/v1/agent/sessions HTTP/1.1\nContent-Type: application/json\nIdempotency-Key: k-42\n\n{"agent": "general", "realm": "global"}'],
  ['python', '@app.get("/health")\ndef health(verbose: bool = False):  # liveness\n    """Report the state."""\n    return {"ok": True, "n": 3}'],
];

// ── Forms ───────────────────────────────────────────────────────────────────────────

function Forms({ t }: { t: T }) {
  const [name, setName] = useState('web-3');
  const [size, setSize] = useState(80);
  const [region, setRegion] = useState<Region | undefined>('sin');
  const [image, setImage] = useState<string | undefined>(undefined);
  const [labels, setLabels] = useState<string[]>([]);
  const [plan, setPlan] = useState<string | undefined>('pro');
  const [access, setAccess] = useState<string | undefined>('private');
  const [backups, setBackups] = useState(true);
  const [terms, setTerms] = useState(false);
  const [colour, setColour] = useState('');
  const [key, setKey] = useState('');
  const [sim, setSim] = useState<string | undefined>('none');
  const outcome: OutcomeLike | undefined =
    sim === 'done' ? { kind: 'done' } : sim === 'failed' ? { kind: 'failed', message: t('outcome.failedMsg') } : sim === 'pending' ? { kind: 'pending' } : undefined;
  return (
    <div className={s.twoCol}>
      <Panel title={t('sec.form')} description={t('sec.formDesc')}>
        <Form onSubmit={() => setSim('done')} fieldErrors={sim === 'failed' ? { name: t('outcome.failedMsg') } : undefined}>
          <TextField name="name" label={t('f.name')} value={name} onChange={setName} placeholder={t('f.namePh')} description={t('f.nameDesc')} isRequired />
          <div className={s.pair}>
            <NumberField label={t('f.size')} value={size} onChange={setSize} minValue={10} maxValue={2000} step={10} unit={t('f.unit')} />
            <Select
              label={t('f.region')}
              value={region}
              onChange={setRegion}
              options={REGIONS.map((v) => ({ value: v, label: t(`region.${v}`), icon: 'globe' as const }))}
            />
          </div>
          <Combobox
            label={t('f.image')}
            placeholder={t('f.imagePh')}
            value={image}
            onChange={setImage}
            options={[
              { value: 'ubuntu', label: t('f.image.ubuntu'), description: t('f.image.desc') },
              { value: 'debian', label: t('f.image.debian') },
              { value: 'fedora', label: t('f.image.fedora') },
              { value: 'alpine', label: t('f.image.alpine') },
            ]}
          />
          {/* Free entry: a listed label is picked, Enter on typed text adds a new one; the page keeps the list. */}
          <Stack gap={1}>
            <Combobox
              label={t('f.labels')}
              description={t('f.labelsDesc')}
              value={undefined}
              onChange={(v) => setLabels((l) => (l.includes(v) ? l : [...l, v]))}
              onCommitText={(typed) => {
                const v = typed.trim();
                if (!/^[a-z0-9-]{1,32}$/.test(v)) return false;
                setLabels((l) => (l.includes(v) ? l : [...l, v]));
                return true;
              }}
              options={['web', 'build', 'staging'].filter((v) => !labels.includes(v)).map((v) => ({ value: v, label: v }))}
            />
            {labels.length > 0 && (
              <Row gap={1} wrap>
                {labels.map((v) => <Tag key={v} onRemove={() => setLabels((l) => l.filter((x) => x !== v))}>{v}</Tag>)}
              </Row>
            )}
          </Stack>
          <div className={s.pair}>
            <EntityPicker label={t('f.projectLoading')} value={undefined} onChange={() => undefined} options={undefined} isLoading />
            <EntityPicker label={t('f.projectError')} value={undefined} onChange={() => undefined} options={undefined} error onRetry={() => undefined} />
          </div>
          <RadioGroup
            label={t('f.plan')}
            variant="cards"
            value={plan}
            onChange={setPlan}
            options={[
              { value: 'basic', label: t('f.plan.basic'), description: t('f.plan.basicDesc') },
              { value: 'pro', label: t('f.plan.pro'), description: t('f.plan.proDesc') },
              { value: 'max', label: t('f.plan.max'), description: t('f.plan.maxDesc') },
            ]}
          />
          <RadioGroup
            label={t('f.access')}
            value={access}
            onChange={setAccess}
            options={[
              { value: 'private', label: t('f.access.private') },
              { value: 'team', label: t('f.access.team') },
              { value: 'public', label: t('f.access.public'), isDisabled: true },
            ]}
          />
          <Switch label={t('f.backups')} description={t('f.backupsDesc')} isSelected={backups} onChange={setBackups} />
          <Checkbox label={t('f.terms')} isSelected={terms} onChange={setTerms} />
          {/* The swatches' focus ring and disabled recipe, enabled and locked. */}
          <ColorPicker label={t('f.colour')} value={colour} onChange={setColour} />
          <ColorPicker label={t('f.colourOff')} value="" onChange={() => undefined} isDisabled />
          <TextField label={t('f.notes')} multiline rows={3} />
          <SecretInput label={t('f.apiKey')} placeholder={t('f.apiKeyPh')} value={key} onChange={setKey} />
          <FormFooter dirty={sim !== 'done'} outcome={outcome} onCheck={() => setSim('none')} onDiscard={() => setSim('none')} />
        </Form>
      </Panel>
      <Stack gap={5}>
        <Panel title={t('outcome.label')}>
          <RadioGroup
            value={sim}
            onChange={setSim}
            options={[
              { value: 'none', label: t('outcome.none') },
              { value: 'done', label: t('outcome.done') },
              { value: 'failed', label: t('outcome.failed') },
              { value: 'pending', label: t('outcome.pending') },
            ]}
          />
        </Panel>
        <Panel title={t('f.newKey')}>
          <SecretField label={t('f.apiKey')} value="hk_live_EXAMPLE_NOT_A_REAL_KEY" />
        </Panel>
      </Stack>
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────────────

function States({ t }: { t: T }) {
  // ?part=outcomes shows the outcome banners alone, so a shot frames them at every width without the skeletons.
  const [part] = useSearchParam('part');
  const outcomes = (
    <Panel title={t('sec.outcomes')} description={t('sec.outcomesDesc')}>
      <Stack gap={3}>
        <OutcomeBanner kind="done" onDismiss={() => undefined} />
        {/* Both actions, as Bots and Computers use it: below 480 px they take their own row under the text. */}
        <OutcomeBanner kind="pending" onCheck={() => undefined} onDismiss={() => undefined} />
        {/* The line shape. Title, then what we know, what Check again reads, what Stop tracking does. */}
        <OutcomeBanner
          kind="pending"
          title={t('outcome.linesTitle')}
          known={t('outcome.linesKnown')}
          checkLine={t('outcome.linesCheck')}
          stopLine={t('outcome.linesStop')}
          onCheck={() => undefined}
          onDismiss={() => undefined}
        />
        <OutcomeBanner kind="failed" body={t('outcome.failedBody')} onDismiss={() => undefined} />
        {/* One recovery action in the banner, before the close, so a drawer's footer keeps Cancel and its primary. */}
        <OutcomeBanner
          kind="failed"
          title={t('outcome.signedOutTitle')}
          body={t('outcome.signedOutBody')}
          actions={<Button size="sm">{t('outcome.signIn')}</Button>}
          onDismiss={() => undefined}
        />
        <OutcomeBanner kind="not_sent" body={t('outcome.notSentBody')} />
        <OutcomeBanner kind="stale" />
      </Stack>
    </Panel>
  );
  if (part === 'outcomes') return outcomes;
  return (
    <Stack gap={5}>
      <Panel title={t('sec.skeletons')}>
        <div className={s.threeCol}>
          <Skeleton variant="table" rows={4} />
          <Skeleton variant="detail" rows={4} />
          <Row gap={2}>
            <Spinner />
            <Button busy variant="primary">
              {t('btn.busy')}
            </Button>
          </Row>
        </div>
      </Panel>
      <Panel title={t('sec.empty')}>
        <div className={s.twoColPlain}>
          <EmptyState
            icon="computer"
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              <Button variant="primary" icon="plus">
                {t('empty.action')}
              </Button>
            }
          />
          <ErrorState onRetry={() => undefined} />
        </div>
      </Panel>
      {outcomes}
    </Stack>
  );
}
