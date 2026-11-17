// The overlays gallery tab (/_kit?tab=overlays): every overlay in every state. `?open=<state>`
// opens one without clicks so hub:shots can frame it; `?menu=1` opens the row menu.
import { useState } from 'react';
import { Autocomplete, Menu, MenuItem, MenuSection, MenuTrigger, Popover as AriaPopover, useFilter } from 'react-aria-components';
import { Button, IconButton } from '../controls/Button';
import { ComputerMark } from '../data/ComputerMark';
import { StatusPill, Tag } from '../data/Display';
import { CodeBlock } from '../data/Ids';
import { Outcome } from '../forms/Outcome';
import { Select } from '../forms/more';
import { SettingGroup } from '../forms/SettingGroup';
import { SettingRow } from '../forms/SettingRow';
import { SearchField, Switch, TextField } from '../forms/fields';
import { Panel } from '../layouts/Layouts';
import { Row, Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import { ActionMenu, ConfirmDialog, DangerConfirm, Dialog, Drawer, InfoTip, MenuThumb, Popover, Tooltip, menuFooterSectionClass, menuSearchClass } from '../overlays/Overlays';
import ms from '../overlays/Menu.module.css';
import overlayStrings from '../overlays/strings.en.json';
import { PopoverAnchorSpecimen } from '../overlays/PopoverAnchorSpecimen';
import { StatusLinePieces } from './statusLine';
import { HUB_LOCALE, HUB_LOCALES, localeName } from '../locales';
import { LanguageMenu } from '../pickers/LanguageMenu';
import { PickerPanel } from '../pickers/PickerPanel';
import { showToast } from '../states/Toast';
import { useStrings } from '../strings';
import strings from './overlays.strings.en.json';
import s from './overlays.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function useOverlaysStrings(): T {
  return useStrings(strings);
}

// A computer's colour is API data the gallery shows, not a Hub colour (a recorded exception, exceptions.ts).
const COMPUTER_COLOR = '#4ECDC4';

/** The long tray's plain rows. */
const LONG = ['logs', 'files', 'terminal', 'ports', 'domains', 'backups', 'schedules', 'env', 'keys', 'usage', 'move', 'clone'] as const;

/** The footer demos' 20 realms: enough rows that the menu and the picker scroll. */
const REALMS20 = Array.from({ length: 20 }, (_, n) => n + 1);

const DRAWERS = ['drawer-sm', 'drawer-md', 'drawer-lg', 'drawer-dirty', 'drawer-pending', 'drawer-busy', 'drawer-sub', 'drawer-setup'] as const;
const DIALOGS = ['confirm', 'danger-plain', 'danger', 'rename', 'forced', 'confirm-pending', 'code'] as const;
type Open = (typeof DRAWERS)[number] | (typeof DIALOGS)[number];

const OPEN_LABEL: Record<Open, keyof typeof strings> = {
  'drawer-sm': 'open.drawerSm',
  'drawer-md': 'open.drawerMd',
  'drawer-lg': 'open.drawerLg',
  'drawer-dirty': 'open.drawerDirty',
  'drawer-pending': 'open.drawerPending',
  'drawer-busy': 'open.drawerBusy',
  'drawer-sub': 'open.drawerSub',
  'drawer-setup': 'open.drawerSetup',
  confirm: 'open.confirm',
  'danger-plain': 'open.dangerPlain',
  danger: 'open.danger',
  rename: 'open.rename',
  code: 'open.code',
  forced: 'open.forced',
  'confirm-pending': 'open.confirmPending',
};

export function OverlaysTab() {
  const t = useOverlaysStrings();
  const [open, setOpen] = useSearchParam('open');
  const [menu, setMenu] = useSearchParam('menu');
  const close = (o: boolean) => {
    if (!o) setOpen(undefined, { replace: true });
  };
  const is = (v: Open) => open === v;
  return (
    <Stack gap={5}>
      <Panel title={t('sec.drawers')} description={t('sec.drawersDesc')}>
        <Row wrap gap={2}>
          {DRAWERS.map((d) => (
            <Button key={d} icon="panel-right" onPress={() => setOpen(d)}>
              {t(OPEN_LABEL[d])}
            </Button>
          ))}
        </Row>
      </Panel>
      <Panel title={t('sec.dialogs')} description={t('sec.dialogsDesc')}>
        <Row wrap gap={2}>
          {DIALOGS.map((d) => (
            <Button key={d} {...(d.startsWith('danger') ? { tone: 'danger' as const, icon: 'trash' as const } : {})} onPress={() => setOpen(d)}>
              {t(OPEN_LABEL[d])}
            </Button>
          ))}
        </Row>
      </Panel>
      <Panel title={t('sec.menus')} description={t('sec.menusDesc')}>
        <Row wrap gap={3}>
          <ActionMenu
            label={t('btn.menu')}
            isOpen={menu === '1'}
            onOpenChange={(o) => setMenu(o ? '1' : undefined, { replace: true })}
            items={[
              { id: 'current', label: t('menu.makeCurrent'), icon: 'computer', onAction: () => undefined },
              { id: 'open', label: t('menu.open'), icon: 'external', shortcut: 'T', onAction: () => undefined },
              { id: 'copy', label: t('menu.copy'), icon: 'copy', shortcut: 'C', copy: 'atlas', description: t('menu.copyDesc'), onAction: () => undefined },
              '-',
              { id: 'rename', label: t('menu.rename'), icon: 'pen', shortcut: 'F2', opens: true, onAction: () => undefined },
              { id: 'start', label: t('menu.start'), icon: 'play', isDisabled: true, disabledReason: t('menu.startWhy'), onAction: () => undefined },
              { id: 'restart', label: t('menu.restart'), icon: 'reload', shortcut: 'R', onAction: () => undefined },
              { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', opens: true, onAction: () => undefined },
            ]}
          />
          {/* Groups (one-of with pictures and the current mark, on/off boxes, a plain group whose danger item
              keeps its group's name), a reason two presets share said once as a note, a group note. */}
          <ActionMenu
            label={t('btn.layoutMenu')}
            trigger={<Button iconEnd="chevron-down">{t('btn.layoutMenu')}</Button>}
            isOpen={menu === 'groups'}
            onOpenChange={(o) => setMenu(o ? 'groups' : undefined, { replace: true })}
            items={[
              { id: 'presets', label: t('menu.g.presets'), select: 'one', current: 'side', items: [
                { id: 'grid', label: t('menu.g.grid'), picture: <MenuThumb cells={[[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]]} />, onAction: () => undefined },
                { id: 'side', label: t('menu.g.side'), picture: <MenuThumb cells={[[0, 0, 1, 1], [1, 0, 1, 1]]} />, onAction: () => undefined },
                { id: 'stacked', label: t('menu.g.stacked'), picture: <MenuThumb cells={[[0, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1]]} />, isDisabled: true, disabledReason: t('menu.g.tooNarrow'), onAction: () => undefined },
                { id: 'three', label: t('menu.g.three'), picture: <MenuThumb cells={[[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]]} />, isDisabled: true, disabledReason: t('menu.g.tooNarrow'), onAction: () => undefined },
              ] },
              { id: 'show', label: t('menu.g.show'), select: 'many', items: [
                { id: 'names', label: t('menu.g.names'), checked: true, onAction: () => undefined },
                { id: 'labels', label: t('menu.g.labels'), checked: false, onAction: () => undefined },
                { id: 'lines', label: t('menu.g.lines'), checked: false, isDisabled: true, disabledReason: t('menu.g.linesWhy'), onAction: () => undefined },
              ] },
              { id: 'board', label: t('menu.g.board'), note: t('menu.g.saving'), items: [
                { id: 'rename', label: t('menu.g.renameBoard'), icon: 'pen', isDisabled: true, onAction: () => undefined },
                { id: 'undo', label: t('menu.g.undo'), icon: 'reload', shortcut: 'Z', onAction: () => undefined },
                { id: 'delete-board', label: t('menu.g.deleteBoard'), icon: 'trash', tone: 'danger', isDisabled: true, onAction: () => undefined },
              ] },
            ]}
          />
          {/* The language choice: as the Hub has it today (English only, the rest coming soon), then with every
              language available, where a choice is kept. */}
          <LanguageMenu available={[HUB_LOCALE]} current={HUB_LOCALE} />
          <LanguageSample />
          {/* Below 600 px an ActionMenu is a tray; `phone="popover"` keeps the popover (the menufit
              geometry), and a long tray scrolls its rows under the head, with a copy item and an item that opens a dialog (left
              uncontrolled, so only the menu's own close-on-leave closes it on Back). */}
          <ActionMenu
            label={t('btn.popoverMenu')}
            phone="popover"
            isOpen={menu === 'popover'}
            onOpenChange={(o) => setMenu(o ? 'popover' : undefined, { replace: true })}
            items={LONG.slice(0, 8).map((k) => ({ id: k, label: t(`menu.long.${k}`), onAction: () => undefined }))}
          />
          <ActionMenu
            label={t('btn.longMenu')}
            title={t('menu.long.title')}
            trigger={<Button iconEnd="chevron-down">{t('btn.longMenu')}</Button>}
            items={[
              { id: 'copy', label: t('menu.copy'), icon: 'copy', copy: 'atlas', onAction: () => undefined },
              { id: 'rename', label: t('menu.rename'), icon: 'pen', opens: true, onAction: () => setOpen('rename') },
              ...LONG.map((k) => ({ id: k, label: t(`menu.long.${k}`), onAction: () => undefined })),
              '-',
              { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', opens: true, onAction: () => setOpen('danger') },
            ]}
          />
          {/* A reason and a description long enough to wrap to several lines, beside a two-line row
              and a one-line row. The row grows to hold every line, on a phone tray as in a popover; the tray reserves
              its tallest row as drawn (trayrow and traytoast specs). */}
          <ActionMenu
            label={t('btn.reasonMenu')}
            items={[
              { id: 'move', label: t('menu.long.move'), icon: 'computer', isDisabled: true, disabledReason: t('menu.r.moveWhy'), onAction: () => undefined },
              { id: 'copy', label: t('menu.copy'), icon: 'copy', copy: 'atlas', description: t('menu.r.copyDesc'), onAction: () => undefined },
              { id: 'restart', label: t('menu.restart'), icon: 'reload', description: t('menu.r.restartDesc'), onAction: () => undefined },
              { id: 'logs', label: t('menu.long.logs'), icon: 'external', onAction: () => undefined },
            ]}
          />
          {/* A footer of at most two actions stays at the bottom of a scrolling menu and picker; in
              the menu it is the last section (arrows reach it), in the picker a group after the options (Tab reaches it). */}
          <ActionMenu
            label={t('btn.footerMenu')}
            isOpen={menu === 'footer'}
            onOpenChange={(o) => setMenu(o ? 'footer' : undefined, { replace: true })}
            items={[{ id: 'realms', name: t('btn.footerMenu'), select: 'one', current: 'r1', items: REALMS20.map((n) => ({ id: `r${n}`, label: t('menu.realm', { n }), onAction: () => undefined })) }]}
            footer={[
              { id: 'share', label: t('menu.footer.share'), icon: 'share', onAction: () => undefined },
              { id: 'new', label: t('menu.footer.new'), icon: 'plus', onAction: () => undefined },
            ]}
          />
          <FooterPicker t={t} />
          <CappedPicker t={t} />
          <SearchMenu t={t} isOpen={menu === 'search'} onOpenChange={(o) => setMenu(o ? 'search' : undefined, { replace: true })} />
          <Popover trigger={<Button icon="info">{t('btn.popover')}</Button>} label={t('popover.title')} title={t('popover.title')} width="sm">
            <p className={s.p}>{t('popover.body')}</p>
          </Popover>
          <Popover trigger={<Button iconEnd="chevron-down">{t('btn.browse')}</Button>} label={t('browse.title')} title={t('browse.title')} width="browse" phone="sheet">
            <p className={s.p}>{t('browse.body')}</p>
          </Popover>
          <Popover trigger={<Button iconEnd="chevron-down">{t('btn.picker')}</Button>} label={t('picker.label')} width="picker" phone="sheet" flush>
            {(done) => (
              <ul className={s.list}>
                {(['pc.atlas', 'pc.build'] as const).map((k) => (
                  <li key={k}>
                    <Button variant="ghost" fullWidth className={s.pick} onPress={done}>
                      <span className={s.pickName}>{t(k)}</span>
                      <StatusPill tone="ok" dot>
                        {t('pc.running')}
                      </StatusPill>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
          <PopoverAnchorSpecimen labels={{ region: t('anchored.region'), open: t('anchored.open'), title: t('anchored.label'), body: t('anchored.body') }} />
          <Tooltip content={t('tip')} shortcut="R">
            <Button>{t('btn.tooltip')}</Button>
          </Tooltip>
          <IconButton icon="reload" label={t('tip')} shortcut="R" />
        </Row>
        {/* InfoTip in its icon form after a label, its term form, and a Tag and a StatusPill that explain themselves. */}
        <Stack gap={3}>
          <SettingGroup>
            <SettingRow label={t('infotip.realm')} info={t('infotip.realmText')}>
              {t('infotip.realmValue')}
            </SettingRow>
          </SettingGroup>
          <Row wrap gap={4}>
            <InfoTip text={t('infotip.toolsText')} subject={t('infotip.tools')}>
              {t('infotip.tools')}
            </InfoTip>
            <Tag tip={t('infotip.systemText')}>{t('infotip.system')}</Tag>
            <StatusPill tone="warn" dot tip={t('infotip.uncheckedText')}>
              {t('infotip.unchecked')}
            </StatusPill>
          </Row>
        </Stack>
      </Panel>
      {/* Toasts beside a phone tray: fire some, then open a menu at 390 px. */}
      <StatusLinePieces />
      <Panel title={t('sec.toasts')} description={t('sec.toastsDesc')}>
        <Row wrap gap={2}>
          <Button onPress={() => showToast({ title: t('toast.timed'), tone: 'info' }, 60_000)}>{t('btn.toastTimed')}</Button>
          <Button onPress={() => showToast({ title: t('toast.sticky'), body: t('toast.stickyBody'), tone: 'unknown', action: { label: t('outcome.check'), onAction: () => undefined } })}>
            {t('btn.toastSticky')}
          </Button>
          <Button onPress={() => showToast({ title: t('toast.long'), body: t('toast.longBody'), tone: 'error' })}>{t('btn.toastLong')}</Button>
          <Button onPress={() => showToast({ title: t('toast.huge'), body: t('toast.hugeBody'), tone: 'error' })}>{t('btn.toastHuge')}</Button>
          <Button onPress={() => showToast({ title: t('toast.short'), tone: 'info' }, 3000)}>{t('btn.toastShort')}</Button>
          {/* Arrives while a menu is open: fired 1.5 s after the press, so a menu can be opened first. */}
          <Button onPress={() => window.setTimeout(() => showToast({ title: t('toast.later'), tone: 'unknown' }), 1500)}>{t('btn.toastLater')}</Button>
        </Row>
      </Panel>

      <SampleDrawers open={open} close={close} t={t} />

      <ConfirmDialog isOpen={is('confirm')} onOpenChange={close} title={t('confirm.title')} titleMark={<ComputerMark color={COMPUTER_COLOR} />} body={t('confirm.body')} confirmLabel={t('confirm.action')} onConfirm={() => close(false)} />
      <ConfirmDialog isOpen={is('danger-plain')} onOpenChange={close} tone="danger" title={t('plain.title')} body={t('plain.body')} confirmLabel={t('plain.action')} onConfirm={() => close(false)} />
      <DangerConfirm
        isOpen={is('danger')}
        onOpenChange={close}
        title={t('danger.title')}
        body={t('danger.body')}
        confirmText={t('danger.name')}
        confirmLabel={t('danger.action')}
        consequences={[t('danger.c1'), t('danger.c2'), t('danger.c3')]}
        onConfirm={() => close(false)}
      />
      <RenameDialog isOpen={is('rename')} close={close} t={t} />
      <CodeDialog isOpen={is('code')} close={close} t={t} />
      <Dialog isOpen={is('forced')} onOpenChange={close} title={t('forced.title')} body={t('forced.body')} primaryLabel={t('forced.action')} onPrimary={() => close(false)} hideCancel isDismissable={false} />
      <ConfirmDialog
        isOpen={is('confirm-pending')}
        onOpenChange={close}
        title={t('pending.title')}
        body={t('pending.body')}
        confirmLabel={t('pending.action')}
        onConfirm={() => undefined}
        outcome={{ kind: 'pending' }}
        onCheck={() => close(false)}
      />
    </Stack>
  );
}

function RenameDialog({ isOpen, close, t }: { isOpen: boolean; close: (o: boolean) => void; t: T }) {
  const [name, setName] = useState('atlas');
  return (
    <Dialog isOpen={isOpen} onOpenChange={close} size="lg" title={t('rename.title')} primaryLabel={t('rename.action')} primaryDisabled={name.trim() === ''} primaryDisabledReason={t('rename.reason')} onPrimary={() => close(false)}>
      <TextField label={t('f.newName')} value={name} onChange={setName} description={t('f.nameHelp')} mono />
    </Dialog>
  );
}

/** The xl size: a dialog that holds code to read and copy (Files' Mount, a script's version diff). */
const MOUNT_CMD = 'hoody mount https://atlas-files.fixture.invalid ./hoody';
const UNMOUNT_CMD = 'hoody unmount ./hoody';
function CodeDialog({ isOpen, close, t }: { isOpen: boolean; close: (o: boolean) => void; t: T }) {
  return (
    <Dialog overlayId="gallery-code" isOpen={isOpen} onOpenChange={close} size="xl" title={t('code.title')} body={t('code.body')} cancelLabel={t('code.close')}>
      <CodeBlock
        label={t('code.label')}
        lang="shell"
        lines={[
          { caption: t('code.mount'), code: MOUNT_CMD },
          { caption: t('code.unmount'), code: UNMOUNT_CMD },
        ]}
      />
    </Dialog>
  );
}

function SampleDrawers({ open, close, t }: { open: string | undefined; close: (o: boolean) => void; t: T }) {
  const startDirty = open === 'drawer-dirty';
  const [name, setName] = useState(startDirty ? 'atlas-3' : 'atlas-2');
  const [key, setKey] = useState('');
  const [server, setServer] = useState('n12');
  const md = open === 'drawer-md' || open === 'drawer-dirty' || open === 'drawer-pending' || open === 'drawer-busy';
  const pending = open === 'drawer-pending';
  const busy = open === 'drawer-busy';
  const createForm = (
    <Stack gap={4}>
      <TextField label={t('f.name')} value={name} onChange={setName} description={t('f.nameHelp')} mono isDisabled={pending || busy} />
      <Select
        label={t('f.server')}
        value={server}
        onChange={setServer}
        isDisabled={pending || busy}
        options={[
          { value: 'n12', label: t('srv.n12') },
          { value: 'fra-7', label: t('srv.n7') },
        ]}
      />
      <Switch label={t('f.backups')} description={t('f.backupsHelp')} defaultSelected isDisabled={pending || busy} />
    </Stack>
  );
  return (
    <>
      <Drawer resizeKey="gallery-overlays"
        isOpen={open === 'drawer-sm'}
        onOpenChange={close}
        size="sm"
        title={t('drawer.sm.title')}
        subtitle={t('drawer.sm.sub')}
        dirty={key !== ''}
        primary={
          <Button variant="primary" isDisabled={key.trim() === ''} onPress={() => close(false)}>
            {t('act.add')}
          </Button>
        }
      >
        <Stack gap={4}>
          <TextField label={t('f.key')} value={key} onChange={setKey} placeholder={t('f.keyPh')} multiline rows={5} mono />
          <TextField label={t('f.label')} defaultValue={t('f.labelValue')} />
          {/* A row menu inside a Drawer: on a phone its tray opens above the Drawer, and Escape closes only the tray. */}
          <ActionMenu
            label={t('btn.drawerMenu')}
            items={[
              { id: 'copy', label: t('menu.copy'), icon: 'copy', copy: 'ssh-ed25519', onAction: () => undefined },
              { id: 'rename', label: t('menu.rename'), icon: 'pen', onAction: () => undefined },
            ]}
          />
        </Stack>
      </Drawer>
      <Drawer resizeKey="gallery-overlays-2"
        isOpen={md}
        onOpenChange={close}
        size="md"
        title={t('drawer.md.title')}
        subtitle={t('drawer.md.sub')}
        dirty={name !== 'atlas-2'}
        busy={busy}
        outcome={pending ? <Outcome outcome="pending" onCheck={() => undefined} /> : busy ? <span>{t('outcome.sending')}</span> : undefined}
        cancel={pending ? t('act.close') : true}
        primary={
          pending ? undefined : (
            <Button variant="primary" busy={busy} onPress={() => close(false)}>
              {t('act.get')}
            </Button>
          )
        }
      >
        {createForm}
      </Drawer>
      <Drawer resizeKey="gallery-overlays-3"
        isOpen={open === 'drawer-lg'}
        onOpenChange={close}
        size="lg"
        title={t('drawer.lg.title')}
        subtitle={t('drawer.lg.sub')}
        primary={
          <Button variant="primary" onPress={() => close(false)}>
            {t('act.save')}
          </Button>
        }
      >
        <div className={s.railed}>
          <nav className={s.rail} aria-label={t('drawer.lg.title')}>
            <span className={s.railCur}>{t('rail.general')}</span>
            <span>{t('rail.access')}</span>
            <span>{t('rail.channels')}</span>
          </nav>
          <Stack gap={4}>
            <TextField label={t('f.model')} defaultValue={t('f.modelValue')} mono />
            <TextField label={t('f.instructions')} defaultValue={t('f.instructionsValue')} multiline rows={6} />
          </Stack>
        </div>
      </Drawer>
      <Drawer resizeKey="gallery-overlays-4"
        isOpen={open === 'drawer-sub'}
        onOpenChange={close}
        size="md"
        title={t('drawer.sub.title')}
        onBack={() => close(false)}
        backLabel={t('drawer.sub.back')}
        primary={
          <Button variant="primary" onPress={() => close(false)}>
            {t('act.use')}
          </Button>
        }
      >
        <Stack gap={2}>
          <Button fullWidth onPress={() => setServer('n12')}>
            {t('srv.n12')}
          </Button>
          <Button fullWidth onPress={() => setServer('fra-7')}>
            {t('srv.n7')}
          </Button>
        </Stack>
      </Drawer>
      {/* A guided setup. The open step's primary sits in the step on a wide drawer; under
          600 px of body the sticky footer mirrors it (primaryOnPhone) and the step hides its own (data-foot-primary).
          The footer's reason line says what pressing it does, at every width. */}
      <Drawer resizeKey="gallery-overlays-5"
        overlayId="gallery-drawer-setup"
        isOpen={open === 'drawer-setup'}
        onOpenChange={close}
        size="lg"
        title={t('drawer.setup.title')}
        reason={t('drawer.setup.reason')}
        primaryOnPhone={
          <Button variant="primary" onPress={() => close(false)}>
            {t('act.connect')}
          </Button>
        }
      >
        <Stack gap={3} className={s.setupStep}>
          <TextField label={t('drawer.setup.field')} description={t('drawer.setup.step')} />
          <Button className={s.setupFoot} variant="primary" onPress={() => close(false)}>
            {t('act.connect')}
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}

/** The menu search row demo (the topbar realm menu's shape): a host React Aria Menu in a scrolling popover, a kit
 *  SearchField in `menuSearchClass` first, 20 realms that filter by name, and a `menuFooterSectionClass` footer. */
function SearchMenu({ t, isOpen, onOpenChange }: { t: T; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const tk = useStrings(overlayStrings);
  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Button iconEnd="chevron-down">{t('btn.searchMenu')}</Button>
      <AriaPopover className={ms.popover} placement="bottom start" data-search-menu="">
        <div className={s.searchScroll}>
          <Autocomplete filter={(text, input, node) => String(node.key).startsWith('f-') || contains(text, input)}>
            <div className={menuSearchClass} data-search-row="">
              {/* The search row's demo opens to be typed into, as the realm menu does. */}
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <SearchField label={t('menu.search')} placeholder={t('menu.search')} autoFocus />
            </div>
            <Menu className={s.searchList} aria-label={t('btn.searchMenu')}>
              {REALMS20.map((n) => (
                <MenuItem key={n} id={`r${n}`} className={ms.item} textValue={t('menu.realm', { n })}>
                  {t('menu.realm', { n })}
                </MenuItem>
              ))}
              <MenuSection aria-label={tk('menuActions')} className={menuFooterSectionClass}>
                <MenuItem id="f-share" className={ms.item}>
                  {t('menu.footer.share')}
                </MenuItem>
                <MenuItem id="f-new" className={ms.item}>
                  {t('menu.footer.new')}
                </MenuItem>
              </MenuSection>
            </Menu>
          </Autocomplete>
        </div>
      </AriaPopover>
    </MenuTrigger>
  );
}

/** maxRows: 20 realms, about six shown, the rows scroll inside; the search box and "n selected" stay put. */
function CappedPicker({ t }: { t: T }) {
  const [v, setV] = useState<string[]>([]);
  return (
    <PickerPanel
      label={t('btn.cappedPicker')}
      showLabel
      items={REALMS20.map((n) => ({ id: `r${n}`, label: t('menu.realm', { n }) }))}
      mode="multi"
      value={v}
      onChange={setV}
      maxRows={6}
    />
  );
}

/** The picker footer demo: 20 realms in a short scrolling box, "Use this realm" / Cancel after the options. */
function FooterPicker({ t }: { t: T }) {
  const [v, setV] = useState<string[]>(['r1']);
  return (
    <div className={s.footerBox} data-footer-picker="">
      <PickerPanel
        label={t('btn.footerPicker')}
        items={REALMS20.map((n) => ({ id: `r${n}`, label: t('menu.realm', { n }) }))}
        mode="single"
        searchable={false}
        value={v}
        onChange={setV}
        footer={[
          { id: 'use', label: t('picker.footer.use'), onPress: () => undefined },
          { id: 'cancel', label: t('picker.footer.cancel'), dismiss: true, onPress: () => undefined },
        ]}
      />
    </div>
  );
}

/** Every language available: choosing one keeps it and says so. */
function LanguageSample() {
  const [current, setCurrent] = useState('fr');
  return (
    <LanguageMenu
      available={HUB_LOCALES.map((l) => l.code)}
      current={current}
      onChange={(code) => {
        setCurrent(code);
        showToast({ title: localeName(code), tone: 'info' }, 3000);
      }}
    />
  );
}
