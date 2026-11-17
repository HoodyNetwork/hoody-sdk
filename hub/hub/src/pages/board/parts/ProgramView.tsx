// The program view: one program full-area, the same tile in solo mode, with "Add to Board".
//
// Contract, in plain words:
//   - The route names the computer by handle and the program by name-N, or a port (port-N) or an Exec script by its
//     route; nothing else (no URL, no token). A port or a script has no options (Options is not offered).
//   - Add to <active Board> is the view's one primary: it adds the program to the realm's active Board (first empty
//     slot, else a split of its active tile). A session already there is noted "Already on Main" and may still be
//     added (two tiles of one session are allowed). While a card shows, the card's action leads and Add turns
//     secondary. Other Board ▾ lists every Board ("Full" ones disabled) and New Board.
//   - "Added to <Board>" carries Open Board. With the Board kept loaded (useKeepPage) a hidden Board's navigation is
//     dropped, so that toast closes when the Board hides; without keep it stays, as before.
//   - A realm switch that leaves the computer outside the selected realm unmounts the frame and offers Switch back
//     (the shell's realm switch) and Open Board. Never a frame for a computer outside the selected realm.
//   - A link is called missing ("doesn't match a computer here", "not in <realm>") only from a list that answered: a
//     failed first read, or a failed read over the empty list an earlier read left, says the read failed (Try again).
import { useRealms, realmLabel } from '@core';
import {
  ActionMenu, Button, CanvasPage, closeToast, Dialog, ErrorState, IconButton, LinkButton, Skeleton, showToast, Tooltip, useChromeHidden, useGo, useIsPhone, usePageShortcuts,
  useShellData, usePageLink, useServedPageLink, followPageLink, type MenuEntry,
} from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computersAt, computersDomain, findByHandle, handleOf, useBoardComputers } from '../computers';
import { useBoards, type LockedRefusal, type UPDATING } from '../data';
import { links, programViewPath, type ViewRef } from '../links';
import {
  activeBoard, addTile, boardSlots, createBoard, isRefusal, MAX_BOARDS, MAX_SLOTS, onActive, pushRecent, setActiveBoard,
  isProgramTile, isPortTile, clearRecents, dropRecent, restoreRecents, type Board, type RealmBoards, type Refusal, type Tile as TileKind,
} from '../model/boards';
import { hiddenSenderHold, useComputerLinks, useHeldFromLinks } from './computerLinks';
import { useBoardPower } from './lifecycle';
import { useT } from './text';
import s from './board.module.css';
import type { FrameHandle, FrameState } from './Frame';
import { Picker } from './Picker';
import { recentScope } from './recentUndo';
import { Tile } from './Tile';
import { TileCard } from './TileCard';
import { boardDefaults, browserTarget, infoFor, shellShown, shellTarget, terminalMenu } from './tileInfo';
import { RestartDialog } from './RestartDialog';
import { ShellDialog } from './ShellDialog';
import { DevToolsDialog, type DevToolsTarget } from './DevToolsDialog';
import { sameTerminal, type ShellAt, type ShellTarget } from './shellChange';
import { useCatalog } from './useCatalog';
import { CATALOG, startView } from '../embed/catalog';
import { refusedParams } from '../embed/options';
import { OptionsPanel, type Saved } from '../options';
import { useHubScheme } from './scheme';

const rand = () => Math.random();
let lastSeen: { handle: string; realm: string } | null = null;

export function ProgramView({ target }: { target: ViewRef }) {
  const t = useT();
  // Another tab's value is opening (data.ts UPDATING): this view has no notice band, so the refusal is a toast.
  const updatingToast = () => showToast({ title: t('notice.updating'), tone: 'info' });
  const api = useBoards();
  const comps = useBoardComputers();
  const scheme = useHubScheme();
  const power = useBoardPower(comps.rows, comps.retry);
  const billingLink = usePageLink('billing');
  const cat = useCatalog();
  const realms = useRealms();
  const shell = useShellData();
  const phone = useIsPhone();
  const go = useGo();
  const computersLink = usePageLink('computers');
  const computersServed = useServedPageLink('computers');
  const computerLinks = useComputerLinks(t);
  const heldFromLink = useHeldFromLinks(t);
  const [focus, setFocus] = useState(false);
  useChromeHidden(focus, () => setFocus(false));
  const [frameState, setFrameState] = useState<FrameState>('loading');
  const [reload, setReload] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [shellFor, setShellFor] = useState<ShellTarget | null>(null);
  const [restartFor, setRestartFor] = useState<ShellTarget | null>(null);
  const [devtoolsFor, setDevtoolsFor] = useState<DevToolsTarget | null>(null);
  const [inside, setInside] = useState(false);
  const frame = useRef<FrameHandle | null>(null);

  const computer = comps.rows ? findByHandle(comps.rows, target.handle) ?? null : null;
  // The terminal shown now: a Change shell settling later reloads the frame only while it still shows that one.
  const shownAt = useRef<ShellAt | null>(null);
  shownAt.current = computer && 'program' in target && target.program === 'terminal' ? { computer: computer.id, session: target.session } : null;
  // The realm the computer was last seen in (kept across the remount a realm switch causes): Switch back returns there.
  const seenIn = useRef<string | null>(lastSeen && lastSeen.handle === target.handle ? lastSeen.realm : null);
  if (computer) { seenIn.current = realms.selected; lastSeen = { handle: target.handle, realm: realms.selected }; }
  // Options set here last for this visit (memory only) and ride along with Add to Main; the view starts on the
  // program's start view, as a new tile.
  const [opts, setOpts] = useState<Saved | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const prog = 'program' in target ? target : null;
  const view = !prog ? undefined : opts ? opts.view : startView(CATALOG, prog.program);
  const tile: TileKind | null = !computer ? null
    : prog ? { project: computer.project_id, computer: computer.id, program: prog.program, session: prog.session, ...(view !== undefined ? { view } : {}), ...(opts && Object.keys(opts.params).length ? { params: opts.params } : {}) }
    : 'protocol' in target ? { project: computer.project_id, computer: computer.id, protocol: target.protocol, port: target.port, ...(target.path !== undefined ? { path: target.path } : {}) }
    : null;
  const targetKey = JSON.stringify(target);
  // The same realm projection as the Board: the tile's stripe and mark are the computer's, its realm a chip in All realms.
  const realmCtx = useMemo(() => ({ selected: realms.selected, rows: realms.rows }), [realms.selected, realms.rows]);
  const info = useMemo(
    // parentKeys off: this view has no parent-key listener, so the hint must not promise Ctrl+Alt+B.
    () => (tile ? { ...infoFor('solo', tile, { computers: comps.rows, failed: comps.failed, cat, domain: computersDomain(), origin: typeof window !== 'undefined' ? window.location.origin : '', scheme, t }, realmCtx), parentKeys: false } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computer?.id, computer?.project_id, targetKey, opts, comps.rows, comps.failed, cat, scheme, t, realmCtx],
  );
  const board = api.ready ? activeBoard(api.state) : null;
  const boardName = (b: Board) => b.name || t('board.main');
  const boardFull = (b: Board) => boardSlots(b).length >= MAX_SLOTS && !boardSlots(b).some((x) => !b.tiles[x]);
  const sameAs = (x: TileKind | null): boolean => {
    if (!tile || !x) return false;
    if (isProgramTile(tile)) return isProgramTile(x) && x.computer === tile.computer && x.program === tile.program && x.session === tile.session;
    return isPortTile(tile) && isPortTile(x) && x.computer === tile.computer && x.protocol === tile.protocol && x.port === tile.port && (x.path ?? '') === (tile.path ?? '');
  };
  const already = !!board && Object.values(board.tiles).some(sameAs);
  // The Open Board toasts this view showed, closed when a kept Board hides (effect cleanups run on a hide); the choice
  // read is the latest one (a ref), since the cleanup was set up at mount.
  const openToasts = useRef(new Set<string>());
  const keptNow = useRef(false);
  keptNow.current = !!api.state.keep;
  // Whether the view is shown now: a New Board's add lands after the cross-tab lock, maybe after a kept Board hid.
  const shownNow = useRef(false);
  useEffect(() => {
    const open = openToasts.current;
    shownNow.current = true;
    return () => {
      shownNow.current = false;
      if (!keptNow.current) return;
      for (const id of open) closeToast(id);
      open.clear();
    };
  }, []);
  const cardShows = !!info && !(info.state === 'live' && info.url);

  useEffect(() => {
    const check = () => setTimeout(() => setInside(!!document.activeElement && !!frame.current?.element()?.contains(document.activeElement)), 0);
    window.addEventListener('blur', check);
    document.addEventListener('focusin', check);
    return () => { window.removeEventListener('blur', check); document.removeEventListener('focusin', check); };
  }, []);

  const realmName = (id: string) => { const n = realmLabel(id); return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('view.allRealms') : t('realm.global'); };
  const addTo = (id: string | 'new') => {
    if (!tile) return;
    let target: Board | null = null;
    const op = (st: RealmBoards, r: () => number, held: ReadonlySet<string>): RealmBoards | Refusal => {
      let base = st;
      if (id === 'new') { const c = createBoard(st, r, t('board.numbered', { n: st.boards.length + 1 })); if (isRefusal(c)) return c; base = c; }
      else { const c = setActiveBoard(st, id); if (isRefusal(c)) return c; base = c; }
      const out = onActive(base, (b, taken) => { const x = addTile(b, tile, r, taken); return isRefusal(x) ? x : x.board; }, held);
      if (isRefusal(out)) return out;
      target = activeBoard(out);
      // Adding to another Board keeps the realm's active Board as it was.
      const kept = id === 'new' || id === st.active ? out : { ...out, active: st.active };
      return isProgramTile(tile) ? pushRecent(kept, tile) : kept;
    };
    const said = (r: Refusal | LockedRefusal | typeof UPDATING | null) => {
      const b = target as Board | null;
      // Another tab's value is opening: nothing was added; say so (the Board view's band is not on this page).
      if (r?.refused === 'UPDATING') { updatingToast(); return; }
      if (r?.refused === 'NOT_KNOWN') { showToast({ title: t('board.unknown'), tone: 'unknown' /* noDetails: the store was accepted and its answer not seen yet (data.ts NOT_KNOWN); there is no rejection */ }); return; }
      if (r?.refused === 'NOT_ADDED') { showToast({ title: t('board.notAdded'), tone: 'info' }); return; }
      if (r?.refused === 'BOARDS_FULL') { showToast({ title: realms.selected === 'all' ? t('board.fullAll') : t('board.fullRealm', { realm: realmName(realms.selected) }), tone: 'info' }); return; }
      if (r || !b) { showToast({ title: board ? t(phone ? 'view.fullPhone' : 'view.full', { board: boardName(board) }) : t('board.full'), tone: 'info' }); return; }
      // A kept Board that hid meanwhile closes its Added toasts (above): one that lands now would offer an Open Board a
      // hidden Board cannot follow, so it is not shown. Not kept, the page unloaded and Open Board still works.
      if (keptNow.current && !shownNow.current) return;
      const toast = showToast({ title: t('view.added', { board: boardName(b) }), action: { label: t('tile.openBoard'), onAction: () => go(links.boardById(b.id)) } });
      openToasts.current.add(toast);
    };
    // A new Board is made under the cross-tab lock against the Boards as stored (data.ts applyLocked), as the Board
    // view's New does: two tabs near the Board cap cannot both make one and both say it was added.
    if (id === 'new') { void api.applyLocked(op).then(said); return; }
    said(api.apply((st, held) => op(st, rand, held)));
  };

  usePageShortcuts([
    { key: 'KeyB', mods: ['ctrl', 'alt'], whileTyping: true, label: t('key.leave'), run: () => { if (inside) { (document.activeElement as HTMLElement | null)?.blur(); setInside(false); } else frame.current?.focus(); } },
    { key: 'r', label: t('key.reload'), enabled: !!info?.url, run: () => setReload((n) => n + 1) },
    { key: 'f', label: t('key.focus'), run: () => setFocus((f) => !f) },
    { key: 'a', label: t('key.addToBoard'), enabled: !!tile && !!board, run: () => { if (board) addTo(board.id); } },
    { key: 'o', label: t('key.options'), enabled: isProgramTile(tile), run: () => setOptionsOpen(true) },
  ]);

  // ---- not here ----
  if (!api.ready || (comps.rows === null && !comps.failed)) return <Skeleton variant="card" />;
  // The list is not known (a read failed and the rows left, if any, do not hold the computer, or the rows are a first page
  // of a longer list): the link is not called missing; the read failed (Try again), or the list is longer than the page
  // read. Old rows that still resolve the target keep the view.
  if (!computer && (comps.failed || !comps.complete)) {
    return (
      <CanvasPage title={t('title')}>
        {comps.failed ? (
          <TileCard note={<ErrorState title={t('picker.failed')} onRetry={comps.retry} size="sm" />} actions={<LinkButton href={links.board}>{t('tile.openBoard')}</LinkButton>} />
        ) : (
          <TileCard title={t('view.listPartialTitle')} body={t('view.listPartial')} actions={<LinkButton href={links.board}>{t('tile.openBoard')}</LinkButton>} />
        )}
      </CanvasPage>
    );
  }
  if (!computer || !info || !tile) {
    const old = seenIn.current;
    const moved = old !== null && old !== realms.selected;
    return (
      <CanvasPage title={t('title')}>
        <TileCard
          icon="computer"
          title={moved ? t('view.notInRealm', { computer: target.handle.slice(0, target.handle.lastIndexOf('.')), realm: realms.selected === 'all' ? t('view.allRealms') : realmName(realms.selected) }) : t('view.notFound')}
          body={moved ? t('view.notInRealmBody', { old: realmName(old as string) }) : undefined}
          actions={
            <>
              {moved && shell.setRealm && (
                <Button variant="primary" onPress={() => shell.setRealm?.(old as string)}>
                  {t('view.switchBack')}
                </Button>
              )}
              <LinkButton href={links.board}>{t('tile.openBoard')}</LinkButton>
            </>
          }
        />
      </CanvasPage>
    );
  }

  const otherMenu: MenuEntry[] = [
    ...api.state.boards.map((b): MenuEntry => ({
      id: 'b-' + b.id,
      label: boardName(b) + ' · ' + t('board.count', { n: boardSlots(b).length }),
      isDisabled: boardFull(b),
      disabledReason: boardFull(b) ? t('view.fullTag') : undefined,
      onAction: () => addTo(b.id),
    })),
    '-',
    { id: 'new', label: t('view.newBoard'), isDisabled: api.state.boards.length >= MAX_BOARDS, disabledReason: api.state.boards.length >= MAX_BOARDS ? t('move.boardsFull', { n: MAX_BOARDS }) : undefined, onAction: () => addTo('new') },
  ];
  const full = !!board && boardFull(board);
  const addLabel = phone ? t(already ? 'view.addAgain' : 'view.addShort') : api.state.boards.length > 1 || board ? t('view.add', { board: board ? boardName(board) : '' }) : t('view.addShort');
  const addButton = (
    <Button variant={cardShows ? 'secondary' : 'primary'} size="sm" shortcut="A" isDisabled={full} aria-label={full && board ? t(phone ? 'view.fullPhone' : 'view.full', { board: boardName(board) }) : undefined} onPress={() => board && addTo(board.id)}>
      {addLabel}
    </Button>
  );
  const headExtra = (
    <span className={s.viewHeadExtra}>
      {already && !phone && <span className={s.already}>{t('view.already', { board: board ? boardName(board) : '' })}</span>}
      {phone && already ? <Tooltip content={t('view.already', { board: board ? boardName(board) : '' })}>{addButton}</Tooltip> : addButton}
      {!phone && <ActionMenu items={otherMenu} label={t('view.other')} trigger={<Button variant="ghost" size="sm" iconEnd="chevron-down">{t('view.other')}</Button>} />}
      <IconButton icon="maximize" label={t('focus.on')} shortcut="F" size="sm" onPress={() => setFocus((f) => !f)} />
    </span>
  );
  const menu: MenuEntry[] = [
    ...(isProgramTile(tile) ? [{ id: 'options', label: t('tile.options'), opens: true, onAction: () => setOptionsOpen(true) } as MenuEntry] : []),
    ...(info.shareUrl ? [{ id: 'copy', label: t('tile.copyLink'), copy: info.shareUrl, onAction: () => undefined } as MenuEntry] : []),
    ...terminalMenu(info, t),
    ...(shellTarget(info) ? [{ id: 'shell', label: t('tile.shell'), opens: true, onAction: () => setShellFor(shellTarget(info)) } as MenuEntry] : []),
    ...(shellTarget(info) ? [{ id: 'restart', label: t('tile.restart'), opens: true, onAction: () => setRestartFor(shellTarget(info)) } as MenuEntry] : []),
    ...(browserTarget(info) ? [{ id: 'devtools', label: t('tile.devtools'), opens: true, onAction: () => setDevtoolsFor(browserTarget(info)) } as MenuEntry] : []),
    ...computerLinks(info.computer, power(info.computer)),
    { id: 'reload', label: t('tile.reload'), shortcut: 'R', isDisabled: !info.url, onAction: () => setReload((n) => n + 1) },
    { id: 'focus', label: t('focus.on'), shortcut: 'F', onAction: () => setFocus((f) => !f) },
    ...(phone ? ['-' as const, ...otherMenu.map((m) => (m === '-' ? m : { ...m, label: t('view.otherMenu') + ': ' + m.label }))] : []),
  ];

  return (
    <CanvasPage title={info.title}>
      <div className={s.view}>
        <Tile
          info={info}
          domId="board-solo"
          style={{ position: 'relative', flex: 1 }}
          active
          maximised={false}
          hidden={false}
          solo
          narrow={phone}
          inside={inside}
          reloadKey={reload}
          frameState={frameState}
          frameRef={frame}
          keys={false}
          menu={menu}
          menuOpen={menuOpen}
          onMenuOpen={setMenuOpen}
          onActivate={() => undefined}
          onReload={() => setReload((n) => n + 1)}
          onFrameState={setFrameState}
          onRegister={() => undefined}
          onBack={() => (document.activeElement as HTMLElement | null)?.blur()}
          onRetry={comps.retry}
          onOpenComputers={computersLink ? () => followPageLink(computersAt(computersLink, info.computer), go) : null}
          onOpenBilling={billingLink ? () => followPageLink(billingLink, go) : null}
          power={power(info.computer)}
          heldFrom={heldFromLink(power(info.computer), info.computer)}
          headExtra={headExtra}
          cardActions={
            <>
              {info.state === 'gone' && (
                <Button variant="primary" onPress={() => setPicking(true)}>
                  {t('tile.pickAnother')}
                </Button>
              )}
              <LinkButton href={links.board}>{t('tile.openBoard')}</LinkButton>
            </>
          }
        />
      </div>
      <ShellDialog target={shellFor} onClose={() => setShellFor(null)} onChanged={(at) => { if (sameTerminal(shownAt.current, at)) setReload((n) => n + 1); }} />
      <RestartDialog target={restartFor} onClose={() => setRestartFor(null)} onChanged={(at) => { if (sameTerminal(shownAt.current, at)) setReload((n) => n + 1); }} />
      <DevToolsDialog target={devtoolsFor} onClose={() => setDevtoolsFor(null)} />
      <Dialog isOpen={picking} onOpenChange={setPicking} title={t('tile.pickAnother')}>
        <Picker
          computers={comps.rows}
          failed={comps.failed}
          // As the Board's own Picker (BoardView pickerBase): a partial list is not "no match", and a stopped computer
          // shows its Start or Resume and why apps wait.
          complete={comps.complete}
          power={power}
          heldFrom={heldFromLink}
          onRetry={comps.retry}
          recents={api.state.recents}
          onRecent={{
            drop: (r) => { if (api.apply((s) => dropRecent(s, r))?.refused === 'UPDATING') updatingToast(); },
            clear: () => {
              const before = api.state.recents;
              // The list is this realm's and this account's, and its Undo puts it back only there (as the Board's own
              // Clear does, BoardView.tsx): the scope is taken now and asked at the press. After a realm, account or
              // Forget switch nothing is restored, and the toast says so.
              const still = recentScope();
              if (api.apply(clearRecents)?.refused === 'UPDATING') { updatingToast(); return; }
              showToast({ title: t('recent.cleared'), action: { label: t('undo.label'), onAction: () => {
                if (!still()) { showToast({ title: t('recent.notRestored'), tone: 'info' }); return; }
                if (api.apply((s) => restoreRecents(s, before))?.refused === 'UPDATING') updatingToast();
              } } });
            },
          }}
          known={[]}
          onBoard={[]}
          realmName={realms.selected === 'all' ? null : realmName(realms.selected)}
          onComputers={computersLink ? () => followPageLink(computersLink, go) : null}
          programsOnly
          onPick={(x) => {
            setPicking(false);
            if (!isProgramTile(x)) return;
            const c = comps.rows?.find((r) => r.id === x.computer);
            if (c) go(programViewPath({ handle: handleOf(c), program: x.program, session: x.session }), { replace: true });
          }}
        />
      </Dialog>
      {isProgramTile(tile) && info && (
        <OptionsPanel
          isOpen={optionsOpen}
          onOpenChange={setOptionsOpen}
          cat={cat}
          program={tile.program}
          defaults={boardDefaults(tile.program, scheme)}
          tileName={info.name}
          computerName={info.computerName}
          onOpenComputer={computersLink && info.computer && !hiddenSenderHold(power(info.computer), computersServed) ? () => followPageLink(computersAt(computersLink, info.computer), go) : null}
          view={tile.view}
          params={tile.params}
          running={info.state === 'live' && !!info.url}
          shell={(() => { const shown = shellShown(info); const target = shellTarget(info); return shown ? { target: shown, onChange: target ? () => setShellFor(target) : null } : null; })()}
          onSave={(next) => {
            setOptionsOpen(false);
            setOpts(next);
            const refused = refusedParams(next.params).length;
            if (refused) showToast({ title: t('tile.tokenNotSaved', { count: refused }), tone: 'warn' });
            if (info.state === 'live' && info.url) setReload((n) => n + 1);
          }}
        />
      )}
    </CanvasPage>
  );
}

