// The basics gallery tabs (/_kit): keys, links, command steps, compact states, skeletons and
// toasts; later navigation, QR and widget rows. view.tsx mounts each tab.
import { Button, IconButton } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { CountryFlag } from '../controls/CountryFlag';
import { FileButton } from '../controls/FileButton';
import { Kbd, Shortcut } from '../controls/Kbd';
import { ListItemButton } from '../controls/ListItemButton';
import { Link, TextButton } from '../controls/Link';
import { PageLinkTo } from '../controls/PageLinkTo';
import { ComputerLink } from '../controls/ComputerLink';
import { SegmentedControl } from '../controls/SegmentedControl';
import { SideTabs } from '../controls/SideTabs';
import { Tabs, type TabsEditHandle } from '../controls/Tabs';
import { Fragment, useRef, useState } from 'react';
import { ContextLine, Facts, Monogram, StatStrip, Tag } from '../data/Display';
import { CodeBlock } from '../data/Ids';
import { ExamplePicker, SYSTEM_IDS, SystemSteps, systemOfAgent } from '../data/Steps';
import { Panel, Widget } from '../layouts/Layouts';
import { ActionMenu } from '../overlays/Menu';
import { QrButton, QrImage, QrSecret } from '../qr/Qr';
import { matrixPath, qrTextMatrix } from '../qr/qr';
import { SectionMenuItem, SectionMenuList } from '../layouts/SectionMenu';
import { Row, Stack } from '../layouts/Stack';
import { Band, Notice } from '../states/Band';
import { HeldBand } from '../states/HeldBand';
import { ProviderMark } from '../pickers/ProviderMark';
import { FirstUseState, NoAccessState, NoMatchState, OfflineState } from '../states/Recipes';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../states/States';
import { HoodyLoader } from '../states/HoodyLoader';
import { showToast } from '../states/Toast';
import { Sparkline, WidgetActions, WidgetList, WidgetProgress, WidgetRow, WidgetStat, WidgetTitle } from '../widgets/Widgets';
import { Icon, type IconTone } from '../icons';
import { useStringParts, useStrings } from '../strings';
import strings from './kit2.strings.en.json';
import s from './kit2.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

// Key names are not translated text.
const KEY_J = 'J';
const KEY_N = 'N';
/** The specimen's six names (string keys), three to a row. */
const EMPTY_TAGS = ['emptyTags.a', 'emptyTags.b', 'emptyTags.c', 'emptyTags.d', 'emptyTags.e', 'emptyTags.f'] as const;
const FACT_ID = '64f1a2b3c4d5e6f7a8b9c0d1';
const FLAG_SG = '🇸🇬';
// Prop values, shown as their own names.
const ICON_SIZES = ['sm', 'md', 'lg'] as const;
const ICON_TONES: (IconTone | undefined)[] = [undefined, 'ink', 'muted', 'faint', 'ok', 'warn', 'danger'];

export function useKit2Strings(): T {
  return useStrings(strings);
}

/** FileButton, PageLink and CountryFlag. */
function PartsDemo({ t }: { t: T }) {
  const tp = useStringParts(strings);
  const [picked, setPicked] = useState<string[]>([]);
  const pick = (files: File[]) => setPicked(files.map((f) => f.name));
  return (
    <Stack gap={3}>
      <Row wrap gap={4}>
        <FileButton label={t('parts.pick')} icon="upload" onFiles={pick} />
        <FileButton label={t('parts.pickMany')} accept="application/json,.json" multiple onFiles={pick} />
        <FileButton label={t('parts.pickOff')} isDisabled onFiles={pick} />
      </Row>
      <Row wrap gap={2}>
        <Tag>{picked.length ? t('parts.picked', { names: picked.join(', ') }) : t('parts.none')}</Tag>
      </Row>
      <Row wrap gap={4}>
        <PageLinkTo href="/computers">{t('parts.link')}</PageLinkTo>
        <PageLinkTo href="/computers" variant="plain">{t('parts.linkPlain')}</PageLinkTo>
        <PageLinkTo href="/nowhere" plain>{t('parts.linkLabel')}</PageLinkTo>
      </Row>
      <Row wrap gap={4}>
        <span>{tp('parts.computerLine', { name: <ComputerLink name="daring-mint-walrus" handle="daring-mint-walrus.4b5c" />, count: 19, running: 13 })}</span>
        <ComputerLink name="daring-mint-walrus" handle="daring-mint-walrus.4b5c" variant="nav" />
        <ComputerLink name="a-deleted-computer" />
      </Row>
      <Row wrap gap={4}>
        <CountryFlag code="SG" />
        <CountryFlag code="de" label={t('parts.flagName')} />
        <CountryFlag code="zz9" />
      </Row>
    </Stack>
  );
}

/** Icon: its three sizes and the tones page icons use. Without a tone an icon takes the text colour around it. */
function IconDemo({ t }: { t: T }) {
  return (
    <Stack gap={3}>
      <div data-gallery="icon-sizes">
        <Row wrap gap={4}>
          {ICON_SIZES.map((size) => (
            <Row key={size} gap={2}>
              <Icon name="computer" size={size} />
              <Tag>{size}</Tag>
            </Row>
          ))}
        </Row>
      </div>
      <div data-gallery="icon-tones">
        <Row wrap gap={4}>
          {ICON_TONES.map((tone) => (
            <Row key={tone ?? 'none'} gap={2}>
              <Icon name="check" size="sm" tone={tone} />
              <Tag>{tone ?? t('icon.noTone')}</Tag>
            </Row>
          ))}
        </Row>
      </div>
    </Stack>
  );
}

// ── Text and keys ───────────────────────────────────────────────────────────────────

export function Kit2Text() {
  const t = useKit2Strings();
  return (
    <Stack gap={5}>
      <div className={s.grid}>
        <Panel title={t('sec.keys')} description={t('sec.keysDesc')}>
          <Stack gap={3}>
            <p className={s.p}>
              <Shortcut keys={['j', 'k']} /> {t('keys.move')}
            </p>
            <p className={s.p}>
              <Shortcut keys="Mod+K" /> {t('keys.palette')}
            </p>
            <Row gap={2}>
              <Button variant="primary" shortcut="Mod+J">
                {t('keys.ask')}
              </Button>
              <Button>
                {t('keys.ask')} <Kbd>{KEY_J}</Kbd>
              </Button>
            </Row>
          </Stack>
        </Panel>
        <Panel title={t('sec.links')} description={t('sec.linksDesc')}>
          <Stack gap={3}>
            <Row wrap gap={4}>
              <Link href="/guide">{t('link.docs')}</Link>
              <Link href="https://hoody.com/docs" iconEnd="external">
                {t('link.external')}
              </Link>
              <Link href="/computers" variant="plain">
                {t('link.plain')}
              </Link>
              <Link href="/computers" variant="nav">
                {t('link.nav')}
              </Link>
            </Row>
            <Row wrap gap={4}>
              <TextButton icon="reload">{t('text.retry')}</TextButton>
              <TextButton>{t('text.markRead')}</TextButton>
              <TextButton tone="danger">{t('text.forget')}</TextButton>
              <TextButton isDisabled>{t('text.disabled')}</TextButton>
            </Row>
            <PartsDemo t={t} />
          </Stack>
        </Panel>
      </div>
      <Panel title={t('sec.context')} description={t('sec.contextDesc')}>
        <div className={s.ctxStack}>
          <ContextLine
            realm={{ name: t('ctx.realm'), color: 'blue', href: '/computers' }}
            computer={{ name: t('ctx.computer'), tone: 'ok', state: t('ctx.state'), href: '/computers' }}
            server={{ name: t('ctx.server'), flag: FLAG_SG }}
          />
          <div className={s.narrowLine}>
            <ContextLine
              realm={{ name: t('ctx.realm'), color: 'blue', href: '/computers' }}
              computer={{ name: t('ctx.computer'), tone: 'ok', state: t('ctx.state'), href: '/computers' }}
              server={{ name: t('ctx.server'), flag: FLAG_SG }}
            />
          </div>
        </div>
      </Panel>
      <Panel title={t('sec.facts')} description={t('sec.factsDesc')}>
        <Facts
          items={[
            { label: t('facts.state'), value: t('facts.stateValue') },
            { label: t('facts.server'), value: t('facts.serverValue'), href: '/computers' },
            { label: t('facts.host'), value: t('facts.hostValue'), copy: t('facts.hostValue'), mono: true },
            { label: t('facts.box'), id: FACT_ID },
            { label: t('facts.access'), value: t('facts.accessValue') },
            { label: t('facts.notes'), value: t('facts.notesValue'), wide: true },
          ]}
        />
      </Panel>
      <Panel title={t('sec.disclosure')} description={t('sec.disclosureDesc')}>
        <Stack gap={1}>
          <Disclosure title={t('disc.title')} description={t('disc.desc')}>
            {t('disc.body')}
          </Disclosure>
          <Disclosure title={t('disc.openTitle')} description={t('disc.openDesc')} defaultExpanded>
            {t('disc.body')}
          </Disclosure>
        </Stack>
      </Panel>
      <Panel title={t('sec.stats')} description={t('sec.statsDesc')}>
        <StatStrip
          label={t('sec.stats')}
          items={[
            { label: t('stats.computers'), value: 12, detail: t('stats.computersDetail') },
            { label: t('stats.servers'), value: 2, detail: t('stats.serversDetail') },
            { label: t('stats.slots'), value: t('stats.slotsValue'), detail: t('stats.slotsDetail') },
            { label: t('stats.alerts'), value: 3, detail: t('stats.alertsDetail'), status: 'accent', statusLabel: t('stats.alertsDetail') },
          ]}
        />
      </Panel>
      <Panel title={t('sec.tags')} description={t('sec.tagsDesc')}>
        <Stack gap={4}>
          <Row wrap gap={2}>
            <Monogram name={t('tag.provider')} />
            <Monogram name={t('tag.provider')} size="md" />
            <Tag>{t('tag.included')}</Tag>
            <Tag tone="ok">{t('tag.current')}</Tag>
            <Tag tone="warn">{t('tag.needsKey')}</Tag>
            <Tag tone="accent">{t('tag.recommended')}</Tag>
          </Row>
          <Stack gap={0}>
            <ListItemButton leading={<ProviderMark id="openai" name={t('rows.openai')} />} meta={t('rows.openaiFacts')} onPress={() => showToast({ title: t('rows.opened', { provider: t('rows.openai') }), tone: 'info' })}>
              {t('rows.openai')}
            </ListItemButton>
            <ListItemButton leading={<ProviderMark id="example-cloud" name={t('rows.other')} />} meta={t('rows.otherFacts')} onPress={() => showToast({ title: t('rows.opened', { provider: t('rows.other') }), tone: 'info' })}>
              {t('rows.other')}
            </ListItemButton>
            <ListItemButton leading={<ProviderMark id="mistral" name={t('rows.off')} />} meta={t('rows.offFacts')} isDisabled>
              {t('rows.off')}
            </ListItemButton>
            <ListItemButton leading={<ProviderMark id="deepseek" name={t('rows.plain')} />} onPress={() => showToast({ title: t('rows.opened', { provider: t('rows.plain') }), tone: 'info' })}>
              {t('rows.plain')}
            </ListItemButton>
          </Stack>
        </Stack>
      </Panel>
      <Panel title={t('sec.code')} description={t('sec.codeDesc', { system: t(`steps.os.${systemOfAgent(typeof navigator === 'undefined' ? undefined : navigator)}`) })}>
        {/* The code blocks keep a grid of their own: next to the steps and picker the auto-fit grid takes a third column and
            a 329 px block wraps its install line (a 34 px step line). */}
        <Stack gap={5}>
          <div className={s.grid}>
            <CodeBlock
              label={t('code.title')}
              lang="shell"
              prompt
              lines={[
                { caption: t('code.install'), code: 'curl -fsSL https://install.hoody.com | sh' },
                { caption: t('code.signIn'), code: 'hoody login' },
                { caption: t('code.list'), code: 'hoody computers' },
              ]}
            />
            <CodeBlock
              label={t('code.title')}
              lang="shell"
              prompt
              placeholderReason={t('code.reason')}
              footer={<Link href="/computers" variant="nav">{t('code.footer')}</Link>}
              lines={[
                { caption: t('code.install'), code: 'curl -fsSL https://install.hoody.com | sh' },
                { caption: t('code.agent'), code: ['hoody agent --computer ', { placeholder: t('code.placeholder') }] },
              ]}
            />
          </div>
          <div className={s.grid}>
            <SystemSteps
              label={t('steps.label')}
              systems={SYSTEM_IDS.map((id) => ({
                id,
                label: t(`steps.os.${id}`),
                step: t(`steps.step.${id}`),
                ...(id === 'phone' ? {} : { code: { label: t('code.title'), lang: 'shell' as const, lines: [{ caption: t('code.install'), code: id === 'windows' ? 'npm install -g hoody-sdk' : 'curl -fsSL https://install.hoody.com | sh' }] } }),
                ...(id === 'linux' ? { need: t('steps.need.linux') } : {}),
              }))}
            />
            <ExamplePicker
              label={t('ex.label')}
              examples={[
                { id: 'shell', name: t('ex.shell'), label: t('ex.code', { lang: t('ex.shell') }), lang: 'shell', lines: [{ code: 'curl https://api.hoody.com/api/v1/computers' }] },
                { id: 'js', name: t('ex.js'), label: t('ex.code', { lang: t('ex.js') }), lang: 'js', lines: [{ code: "const list = await hoody.computers.list();" }], note: t('ex.jsNote') },
              ]}
            />
          </div>
        </Stack>
      </Panel>
      <IconDemo t={t} />
    </Stack>
  );
}

// ── Compact states, skeletons and toasts ────────────────────────────────────────────

export function Kit2Feedback() {
  const t = useKit2Strings();
  return (
    <Stack gap={5}>
      <Panel title={t('sec.bands')} description={t('sec.bandsDesc')}>
        <div className={s.stack}>
          <Band actions={<TextButton icon="reload">{t('band.retry')}</TextButton>}>{t('band.stale')}</Band>
          <Band tone="warn" actions={<><Button size="sm">{t('band.check')}</Button><TextButton>{t('band.new')}</TextButton></>}>
            {t('band.recover')}
          </Band>
          <Band tone="danger" onDismiss={() => undefined}>{t('band.danger')}</Band>
          <Band size="table" tone="warn" actions={<TextButton icon="reload">{t('band.retry')}</TextButton>}>
            {t('band.table')}
          </Band>
          <Band size="table">{t('band.note')}</Band>
          <HeldBand overlayId="kit-gallery-held-dismiss" text={t('band.held')} readOnly={false} onCheck={() => undefined} onDismiss={() => undefined} />
          <HeldBand overlayId="kit-gallery-held-dismiss-elsewhere" text={t('band.held')} readOnly onCheck={() => undefined} onDismiss={() => undefined} />
          <Notice>{t('notice.calm')}</Notice>
          <Notice level="warn">{t('notice.warn')}</Notice>
          <p>
            <Notice level="warn" inline icon={null}>
              {t('notice.inline')}
            </Notice>
          </p>
          {/* block + title: structured content in the warning frame, a section named by its heading. */}
          <Notice level="warn" block title={t('notice.blockTitle')}>
            {t('notice.blockOne')}
          </Notice>
        </div>
      </Panel>
      <div className={s.grid}>
        <Panel title={t('sec.firstUse')} description={t('sec.firstUseDesc')}>
          <FirstUseState
            icon="computer"
            title={t('recipe.firstTitle')}
            body={t('recipe.firstBody')}
            action={<Button variant="primary" icon="plus">{t('recipe.firstAction')}</Button>}
            learn={<Link href="/guide" variant="nav">{t('recipe.firstLearn')}</Link>}
            size="sm"
          />
        </Panel>
        <Panel title={t('sec.noMatch')} description={t('sec.noMatchDesc')}>
          <div className={s.stack}>
            <NoMatchState onClear={() => undefined} />
            <div className={s.box}>
              <NoMatchState onClear={() => undefined} size="compact" />
            </div>
          </div>
        </Panel>
        <Panel title={t('sec.noAccess')} description={t('sec.noAccessDesc')}>
          <NoAccessState size="sm" action={<Link href="/computers" variant="nav">{t('recipe.noAccessBack')}</Link>} />
        </Panel>
        <Panel title={t('sec.offline')} description={t('sec.offlineDesc')}>
          <div className={s.stack}>
            <OfflineState size="sm" onRetry={() => undefined} />
            <div className={s.box}>
              <OfflineState size="compact" onRetry={() => undefined} />
            </div>
          </div>
        </Panel>
      </div>
      <div className={s.grid}>
        <Panel title={t('sec.compact')} description={t('sec.compactDesc')}>
          <div className={s.stack}>
            <div className={s.box}>
              <EmptyState size="compact" icon="bot" title={t('compact.empty')} action={<TextButton>{t('compact.emptyAction')}</TextButton>} />
            </div>
            <div className={s.box}>
              <ErrorState size="compact" title={t('compact.error')} onRetry={() => undefined} />
            </div>
            <div className={s.box}>
              <ErrorState size="compact" onRetry={() => undefined} retrying />
            </div>
          </div>
        </Panel>
        <Panel title={t('sec.spinner')} description={t('sec.spinnerDesc')}>
          <Row gap={4}>
            <span className={s.spinnerDemo}>
              <Spinner label={t('spinner.label')} /> {t('spinner.label')}
            </span>
            <Button busy>{t('spinner.button')}</Button>
            <HoodyLoader text={t('hoody.text')} />
            <HoodyLoader size="md" label={t('spinner.label')} />
          </Row>
          <HoodyLoader size="lg" text={t('hoody.text')} />
        </Panel>
        <Panel title={t('sec.skeleton')} description={t('sec.skeletonDesc')}>
          <Skeleton variant="widget" immediate />
        </Panel>
      </div>
      <Panel title={t('sec.emptyPage')}>
        <div className={s.grid}>
          <EmptyState
            icon="computer"
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              <Button variant="primary" icon="plus">
                {t('empty.action')}
              </Button>
            }
            secondary={<Link href="/guide" variant="nav">{t('empty.guide')}</Link>}
            hint={
              <>
                <Kbd>{KEY_N}</Kbd> {t('empty.hint')}
              </>
            }
          />
          <ErrorState
            title={t('error.title')}
            body={t('error.body')}
            onRetry={() => undefined}
            secondary={<Link href="/guide" variant="nav">{t('error.status')}</Link>}
          />
          {/* Tags written inline into the body wrap in rows a line gap apart. */}
          <EmptyState
            size="sm"
            icon="link"
            title={t('emptyTags.title')}
            body={
              <>
                {t('emptyTags.lead')}
                {'\n'}
                {EMPTY_TAGS.slice(0, 3).map((k) => (
                  <Fragment key={k}>
                    <Tag>
                      <Monogram name={t(k)} />
                      {t(k)}
                    </Tag>{' '}
                  </Fragment>
                ))}
                {'\n'}
                {EMPTY_TAGS.slice(3).map((k) => (
                  <Fragment key={k}>
                    <Tag>
                      <Monogram name={t(k)} />
                      {t(k)}
                    </Tag>{' '}
                  </Fragment>
                ))}
                {'\n'}
                {t('emptyTags.more')}
              </>
            }
          />
        </div>
      </Panel>
      <Panel title={t('sec.skeleton')} flush>
        <Skeleton variant="table" rows={5} columns={5} immediate />
      </Panel>
      <Panel title={t('sec.toasts')} description={t('sec.toastsDesc')}>
        <Row wrap gap={2}>
          <Button onPress={() => showToast({ title: t('toast.okTitle'), action: { label: t('toast.undo'), onAction: () => undefined } })}>
            {t('toast.ok')}
          </Button>
          <Button onPress={() => showToast({ title: t('toast.infoTitle'), tone: 'info' })}>{t('toast.info')}</Button>
          <Button
            onPress={() =>
              showToast({ title: t('toast.errorTitle'), body: t('toast.errorBody'), tone: 'error', action: { label: t('toast.retry'), onAction: () => undefined } })
            }
          >
            {t('toast.error')}
          </Button>
          <Button
            onPress={() =>
              showToast({ title: t('toast.unknownTitle'), body: t('toast.unknownBody'), tone: 'unknown', action: { label: t('toast.check'), onAction: () => undefined } })
            }
          >
            {t('toast.unknown')}
          </Button>
        </Row>
      </Panel>
    </Stack>
  );
}

// ── Segmented and tabs ──────────────────────────────────────────────────────────────

/** Editable tabs, the page owning the list (rename and move apply here). `buttonless`: no ⋯ button,
 *  the page's own menu renames the open tab in place. */
function EditableTabsDemo({ buttonless }: { buttonless?: boolean }) {
  const t = useKit2Strings();
  const [views, setViews] = useState(() => (['overview', 'run', 'history'] as const).map((id) => ({ id: id as string, label: t(`tabs.${id}`) })));
  const [open, setOpen] = useState('overview');
  const editRef = useRef<TabsEditHandle>(null);
  // Without the ⋯ button the page's own controls ride the tabs' row: its menu before the tabs, New view right
  // after the last one.
  const slots = buttonless
    ? {
        before: <ActionMenu label={t('tabs.pageMenu')} placement="bottom start" items={[{ id: 'rename', label: t('tabs.renameOpen'), icon: 'pen', shortcut: 'F2', onAction: () => editRef.current?.rename(open) }]} />,
        after: (
          <IconButton
            icon="plus"
            label={t('tabs.newView')}
            onPress={() => setViews((v) => [...v, { id: `v${v.length + 1}`, label: t('tabs.newViewName', { n: v.length + 1 }) }])}
          />
        ),
      }
    : {};
  return (
    <Tabs
      {...slots}
      label={t('tabs.boardLabel')}
      items={views}
      value={open}
      onChange={setOpen}
      editRef={editRef}
      edit={{
        ...(buttonless ? { menuButton: false } : {}),
        onRename: (id, label) => setViews((v) => v.map((x) => (x.id === id ? { ...x, label } : x))),
        onMove: (id, to) =>
          setViews((v) => {
            const next = v.filter((x) => x.id !== id);
            const it = v.find((x) => x.id === id);
            if (it) next.splice(to, 0, it);
            return next;
          }),
        menu: (id) => [{ id: 'toast', label: t('tabs.duplicate'), icon: 'copy', onAction: () => showToast({ title: t('tabs.duplicated', { name: views.find((x) => x.id === id)?.label ?? '' }) }) }],
      }}
    />
  );
}

export function Kit2Nav() {
  const t = useKit2Strings();
  const [pay, setPay] = useState('card');
  const [state, setState] = useState('running');
  const [menu, setMenu] = useState<'overview' | 'connect' | 'run'>('connect');
  const [way, setWay] = useState<'cli' | 'sdk' | 'http' | 'ssh'>('sdk');
  const tabs = (['overview', 'connect', 'run', 'programs', 'advanced', 'sharing', 'history'] as const).map((id) => ({
    id,
    label: t(`tabs.${id}`),
    badge: id === 'programs' ? 9 : undefined,
    badgeUnit: id === 'programs' ? (n: number) => t('tabs.programsUnit', { count: n }) : undefined,
    content: <p className={s.p}>{t('tabs.body', { name: t(`tabs.${id}`) })}</p>,
  }));
  return (
    <Stack gap={5}>
      <Panel title={t('sec.segmented')} description={t('sec.segmentedDesc')}>
        <div className={s.stack}>
          <Row wrap gap={4}>
            <SegmentedControl
              label={t('seg.view')}
              param="view"
              items={[
                { id: 'computers', label: t('seg.computers') },
                { id: 'servers', label: t('seg.servers') },
              ]}
            />
            <SegmentedControl
              label={t('seg.state')}
              value={state}
              onChange={setState}
              items={[
                { id: 'all', label: t('seg.all'), count: 14 },
                { id: 'running', label: t('seg.running'), count: 9 },
                { id: 'stopped', label: t('seg.stopped'), count: 4 },
                { id: 'problems', label: t('seg.problems'), count: 1 },
              ]}
            />
            <SegmentedControl
              label={t('seg.list')}
              items={[
                { id: 'list', label: t('seg.listView'), icon: 'logs' },
                { id: 'grid', label: t('seg.gridView'), icon: 'apps' },
              ]}
            />
            <SegmentedControl
              label={t('seg.pay')}
              value={pay}
              onChange={setPay}
              items={[
                { id: 'card', label: t('seg.card') },
                { id: 'crypto', label: t('seg.crypto'), isDisabled: true },
              ]}
            />
          </Row>
          <SegmentedControl
            label={t('seg.start')}
            fullWidth
            items={[
              { id: 'describe', label: t('seg.describe'), icon: 'sparkle' },
              { id: 'idea', label: t('seg.idea') },
              { id: 'blank', label: t('seg.blank') },
            ]}
          />
        </div>
      </Panel>
      <Panel title={t('sec.tabs')} description={t('sec.tabsDesc')}>
        <div className={s.stack}>
          <Tabs label={t('tabs.label')} param="ctab" items={tabs} />
          <p className={s.p}>{t('tabs.narrow')}</p>
          <div className={s.narrow}>
            <Tabs label={t('tabs.label')} items={tabs} value="advanced" />
          </div>
          <p className={s.p}>{t('tabs.five')}</p>
          <div className={s.narrow} data-shot="tabs-five">
            <Tabs label={t('tabs.label')} items={tabs.slice(0, 5)} />
          </div>
          <p className={s.p}>{t('tabs.editable')}</p>
          <div data-shot="tabs-editable">
            <EditableTabsDemo />
          </div>
          <div data-shot="tabs-buttonless">
            <EditableTabsDemo buttonless />
          </div>
          <div data-spec="tabs-end">
            <Tabs label={t('tabs.endLabel')} items={tabs.slice(0, 3)} end={<Button variant="ghost" size="sm">{t('tabs.endAction')}</Button>} />
          </div>
          <div className={s.sectionMenu} data-shot="section-menu">
            <SectionMenuList>
              {(['overview', 'connect', 'run'] as const).map((id) => (
                <SectionMenuItem key={id} current={id === menu} aria-current={id === menu ? 'true' : undefined} onClick={() => setMenu(id)}>
                  {t(`tabs.${id}`)}
                </SectionMenuItem>
              ))}
            </SectionMenuList>
          </div>
          {/* SideTabs: a vertical pick list beside the panel it opens (the Guide's ways to connect). */}
          <div className={s.sideTabs} data-shot="side-tabs">
            <SideTabs
              label={t('sideTabs.label')}
              value={way}
              onChange={setWay}
              items={(['cli', 'sdk', 'http', 'ssh'] as const).map((id) => ({ id, label: t(`sideTabs.${id}`) }))}
            />
            <div className={s.sideTabsPanel} role="region" aria-label={t(`sideTabs.${way}`)}>
              <CodeBlock label={t(`sideTabs.${way}`)} lang="shell" prompt lines={[{ caption: t('code.signIn'), code: 'hoody login' }]} />
            </div>
          </div>
        </div>
      </Panel>
    </Stack>
  );
}

// ── QR ──────────────────────────────────────────────────────────────────────────────

const SAMPLE_SECRET = 'https://atlas-terminal-1.n12.hoody.example/?k=7f3a9c41d2';

/** A server-made QR image as the 2FA set-up answer carries one (a data URL), drawn here from a sample address. */
const SAMPLE_QR_IMAGE = (() => {
  const m = qrTextMatrix('otpauth://totp/Hoody%20(sample)?secret=JBSWY3DPEHPK3PXP&issuer=Hoody');
  if (!m) return '';
  const side = m.size + 8;
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 6}" height="${side * 6}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${matrixPath(m)}" fill="#000"/></svg>`)}`;
})();

export function Kit2Qr() {
  const t = useKit2Strings();
  const rows = [
    { label: t('qr.rowSecret'), el: <QrButton url={SAMPLE_SECRET} name={t('qr.terminal')} reach="terminal" shortcut="Alt+Q" /> },
    { label: t('qr.rowPublic'), el: <QrButton url="https://hoody.com/download" name={t('qr.download')} secret={false} /> },
    { label: t('qr.rowBot'), el: <QrButton url="https://quiet-amber-heron-bot.hoody.bot" name={t('qr.bot')} secret={false} logo="bot" /> },
    { label: t('qr.rowNone'), el: <QrButton url="http://plain.example.com/" name={t('qr.plain')} /> },
    // A code the API sent as an image is always a secret one (the 2FA key): it is shown in its QrSecret.
    { label: t('qr.rowImage'), el: <QrSecret><QrImage src={SAMPLE_QR_IMAGE} alt={t('qr.imageAlt')} /></QrSecret> },
  ];
  return (
    <Panel title={t('sec.qr')} description={t('sec.qrDesc')}>
      <div className={s.stack}>
        {rows.map((r) => (
          <div key={r.label} className={s.qrRow}>
            <span className={s.p}>{r.label}</span>
            {r.el}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Widget rows ─────────────────────────────────────────────────────────────────────

const SPARK = [0, 1, 0, 0, 2, 1, 0, 0, 1, 3, 7, 12, 9, 4, 2, 1, 0, 1, 0, 0, 2, 1, 0, 1] as const;

export function Kit2Widgets() {
  const t = useKit2Strings();
  return (
    <div className={s.widgets}>
      <Widget size="s" title={<WidgetTitle count={3}>{t('w.bots')}</WidgetTitle>} viewAll={{ href: '/bots' }}>
        <WidgetList label={t('w.bots')}>
          <WidgetRow label={t('w.chief')} href="/bots" tone="accent" pill={{ tone: 'accent', text: t('w.waiting') }} action={<Button size="sm">{t('w.review')}</Button>} />
          <WidgetRow label={t('w.support')} tone="ok" pill={{ tone: 'ok', text: t('w.working'), dot: true }} />
          <WidgetRow label={t('w.docs')} pill={{ tone: 'neutral', text: t('w.idle') }} />
        </WidgetList>
      </Widget>
      <Widget size="s" title={<WidgetTitle count={9}>{t('w.programs')}</WidgetTitle>} viewAll={{ href: '/programs' }}>
        <WidgetList label={t('w.programs')}>
          <WidgetRow label={t('w.worker')} icon="warn" tone="danger" pill={{ tone: 'danger', text: t('w.fatal') }} action={<Button size="sm" icon="reload">{t('w.restart')}</Button>} />
          <WidgetRow label={t('w.web')} tone="ok" meta={t('w.3d')} />
          <WidgetRow label={t('w.api')} tone="ok" meta={t('w.1h')} />
        </WidgetList>
      </Widget>
      <Widget size="s" title={<WidgetTitle count={3} note={t('w.failedToday')} noteTone="danger">{t('w.schedules')}</WidgetTitle>} viewAll={{ href: '/schedules' }}>
        <WidgetList label={t('w.schedules')}>
          <WidgetRow label={t('w.backup')} meta={t('w.in2h')} pill={{ tone: 'ok', text: t('w.ok') }} />
          <WidgetRow label={t('w.ping')} meta={t('w.in3m')} pill={{ tone: 'danger', text: t('w.failed') }} />
          <WidgetRow label={t('w.report')} meta={t('w.mon')} pill={{ tone: 'ok', text: t('w.ok') }} />
        </WidgetList>
      </Widget>
      <Widget size="s" title={<WidgetTitle>{t('w.logs')}</WidgetTitle>} viewAll={{ href: '/logs' }}>
        <WidgetStat value={t('w.logsValue')} caption={t('w.logsCaption')} tone="danger" chart={<Sparkline label={t('w.logsChart')} points={SPARK} tone="danger" />} />
        <WidgetActions>
          <TextButton>{t('w.logsAction')}</TextButton>
        </WidgetActions>
      </Widget>
      <Widget size="s" title={<WidgetTitle>{t('w.wallet')}</WidgetTitle>}>
        <WidgetStat value={t('w.walletValue')} caption={t('w.walletCaption')} />
        <WidgetActions>
          <Button size="sm" icon="plus">
            {t('w.addFunds')}
          </Button>
        </WidgetActions>
      </Widget>
      <Widget size="s" title={<WidgetTitle>{t('w.start')}</WidgetTitle>}>
        <Stack gap={3}>
          <WidgetProgress done={2} total={4} />
          <WidgetList label={t('w.start')}>
            <WidgetRow label={t('w.key')} icon="key" action={<Button size="sm">{t('w.makeOne')}</Button>} />
            <WidgetRow label={t('w.bot')} icon="bot" action={<Button size="sm">{t('w.newBot')}</Button>} />
          </WidgetList>
        </Stack>
      </Widget>
      <Widget size="s" title={<WidgetTitle count={0}>{t('w.bots')}</WidgetTitle>}>
        <EmptyState size="compact" icon="bot" title={t('w.empty')} action={<TextButton>{t('w.newBot')}</TextButton>} />
      </Widget>
      <Widget size="s" title={<WidgetTitle>{t('w.notifications')}</WidgetTitle>}>
        <ErrorState size="compact" title={t('w.error')} onRetry={() => undefined} />
      </Widget>
      <Widget size="s" title={<WidgetTitle>{t('w.loading')}</WidgetTitle>}>
        <Skeleton variant="widget" immediate />
      </Widget>
    </div>
  );
}
