// Download folders: pick folders of this computer and
// download each as a .zip through its files program. A read: nothing is sent to change anything, so nothing is held.
// Before a folder's Download shows, a cheap count asks the program about the folder's size. It is an estimate
// (files.ts FolderCount), so the download always stays: over 100,000 found, the row says it may be too big and its ⋯
// menu offers its subfolders; under, or when the count cannot say, the row says so in a few words. The download itself
// is a plain link to the computer's own files-program address (programUrl, no token in it): the browser streams it to
// disk and shows the progress. The Hub never holds the archive and never claims a download finished, since it cannot
// see that. Add folder (the card head) opens a drawer with the typed path and the folder picker.
import { AnatomySection, Band, Button, CodeLine, DataTable, Disclosure, Drawer, InlineActions, ItemList, LinkButton, Notice, TextField, createColumnHelper, formatDateTime, useStrings, type ActionSpec, type RowActionEntry } from '@kit';
import { useCallback, useEffect, useState } from 'react';
import type { Computer } from '../types';
import { programUrl } from '../urls';
import { MAX_DEPTH, useFolderCount, useSubfolders, type FolderCount } from './files';
import { BROWSE_START, MAX_FOLDERS, START_FOLDERS, zipName, zipPath, zipUrl } from './zip';
import strings from './strings.en.json';
import s from './snapshots.module.css';

const col = createColumnHelper<string>();
/** A path reads left to right in a right-to-left page too (Unicode isolates: text only). */
const ltr = (path: string): string => `\u2066${path}\u2069`;

export function ZipBackup({ computer: c }: { computer: Computer }) {
  const t = useStrings(strings);
  const [folders, setFolders] = useState<string[]>([...START_FOLDERS]);
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState<Record<string, number>>({});
  // The Add folder drawer, and its picker's open folder: null until Browse folders is pressed, so a typed path reads
  // nothing; a path, the picker is open there.
  const [adding, setAdding] = useState(false);
  const [browsing, setBrowsing] = useState<string | null>(null);
  // Each listed folder's count, as its row read it (the ⋯ menu offers subfolders only for one found too big).
  const [counts, setCounts] = useState<Record<string, FolderCount | undefined>>({});
  // A list per computer: folders, the picker and started marks never carry over to another one.
  useEffect(() => {
    setFolders([...START_FOLDERS]);
    setTyped('');
    setStarted({});
    setAdding(false);
    setBrowsing(null);
    setCounts({});
  }, [c.id]);
  const onCount = useCallback((path: string, n: FolderCount | undefined) => setCounts((m) => (m[path] === n ? m : { ...m, [path]: n })), []);

  const base = programUrl(c, 'files');
  const running = c.status === 'running';
  const live = running && !!base;
  const clean = zipPath(typed);
  const full = folders.length >= MAX_FOLDERS;
  const addFolder = (p: string) => {
    if (full || folders.includes(p)) return;
    setFolders([...folders, p]);
  };
  const add = () => {
    if (!clean || full) return;
    addFolder(clean);
    setTyped('');
  };
  // A typed folder can be added whatever the computer's state (as before the redesign); only browsing and downloading
  // need its files program.
  const addAction: ActionSpec = { id: 'zip-add', label: t('zip.add'), icon: 'plus', opens: 'dialog', onPress: () => { setBrowsing(null); setAdding(true); }, ...(full ? { disabledReason: t('zip.full', { max: MAX_FOLDERS }) } : {}) };
  const browseWhy = !running ? t('zip.notRunning') : !base ? t('zip.noAddress') : undefined;
  // Not running, or no address yet: the list stays (each Download off), and the card says why in its notices.
  const notice = !running ? t('zip.notRunning') : !base ? t('zip.noAddress') : null;

  const columns = [
    col.display({ id: 'folder', header: t('zip.col.folder'), meta: { pinned: true, mono: true, list: 'primary', label: t('zip.col.folder') }, cell: (x) => ltr(x.row.original) }),
    col.display({
      id: 'size',
      header: t('zip.col.size'),
      meta: { list: 'meta', label: t('zip.col.size'), grow: 2 },
      cell: (x) => <ZipNote c={c} path={x.row.original} live={live} at={started[x.row.original]} onCount={onCount} />,
    }),
    col.display({
      id: 'download',
      header: t('zip.col.download'),
      meta: { list: 'status', label: t('zip.col.download'), size: 'fit', fitText: () => t('zip.go'), fitPad: 76 },
      cell: (x) => <ZipLink c={c} path={x.row.original} url={live && base ? zipUrl(base, x.row.original) : ''} at={started[x.row.original]} onStart={() => setStarted((m) => ({ ...m, [x.row.original]: Date.now() }))} />,
    }),
  ];
  const rowActions = (f: string): RowActionEntry[] => [
    ...(live && counts[f] === 'over' ? [{ id: 'subfolders', label: t('zip.subfolders'), opens: true, onAction: () => { setBrowsing(f); setAdding(true); } }] : []),
    { id: 'remove', label: t('zip.removeShort'), onAction: () => setFolders((all) => all.filter((x) => x !== f)) },
  ];

  return (
    <>
      <AnatomySection id="zip" title={t('zip.title')} description={t('zip.lede', { name: c.name })} actions={{ primary: addAction }} notices={notice ? <Band size="table">{notice}</Band> : undefined} state={{ kind: 'ready' }} flush>
        <DataTable
          label={t('zip.list')}
          data={folders}
          columns={columns}
          getRowId={(f) => f}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('zip.countRows', { count: n })}
          actions={rowActions}
        />
      </AnatomySection>
      {/* Add folder and Close are the drawer's footer, the field takes the width, and the folder browser is a fold
          (the ⋯ menu's Subfolders opens it at that folder). */}
      <Drawer overlayId="computers-snapshots-tab-zip-add" resizeKey="computers-snapshot-zip-add"
        isOpen={adding}
        onOpenChange={(o) => { if (!o) { setAdding(false); setBrowsing(null); } }}
        title={t('zip.drawer.title')}
        size="md"
        cancel={t('zip.close')}
        primary={
          <Button variant="primary" onPress={add} isDisabled={!clean || full}>
            {t('zip.add')}
          </Button>
        }
      >
        <div className={s.stack}>
          <TextField
            label={t('zip.field')}
            value={typed}
            onChange={setTyped}
            description={full ? t('zip.full', { max: MAX_FOLDERS }) : t('zip.fieldHelp')}
            errorMessage={typed.trim() && !clean ? t('zip.fieldHelp') : undefined}
          />
          {live ? (
            <Disclosure title={t('pick.open')} isExpanded={browsing !== null} onExpandedChange={(o) => setBrowsing(o ? (browsing ?? BROWSE_START) : null)}>
              {browsing !== null ? <Picker c={c} path={browsing} onGo={setBrowsing} onAdd={addFolder} full={full} listed={folders} /> : null}
            </Disclosure>
          ) : (
            <Band size="table">{browseWhy}</Band>
          )}
        </div>
      </Drawer>
    </>
  );
}

/** A folder's up-front count in a few words, or its started mark; it hands the count to the list for the ⋯ menu. */
function ZipNote({ c, path, live, at, onCount }: { c: Computer; path: string; live: boolean; at: number | undefined; onCount: (path: string, n: FolderCount | undefined) => void }) {
  const t = useStrings(strings);
  const { count, checking } = useFolderCount(c, path, live);
  useEffect(() => onCount(path, count), [path, count, onCount]);
  const note = !live ? zipName(path)
    : at ? t('zip.started', { when: formatDateTime(new Date(at).toISOString()) })
    : checking ? t('zip.checking')
    : count === 'over' ? t('zip.over')
    : count === 'unknown' ? t('zip.unknown')
    : count === 'under' ? t('zip.under')
    : t('zip.checking');
  return note;
}

/** The folder's Download: a plain link once its count has answered, off before that. */
function ZipLink({ c, path, url, at, onStart }: { c: Computer; path: string; url: string; at: number | undefined; onStart: () => void }) {
  const t = useStrings(strings);
  const { count } = useFolderCount(c, path, url !== '');
  const name = t('zip.goName', { path });
  return url !== '' && count !== undefined ? (
    <LinkButton size="sm" href={url} icon="download" onPress={onStart} aria-label={at ? t('zip.againName', { path }) : name}>
      {at ? t('zip.again') : t('zip.go')}
    </LinkButton>
  ) : (
    <Button size="sm" icon="download" isDisabled aria-label={name}>
      {t('zip.go')}
    </Button>
  );
}

const QUICK = [BROWSE_START, ...START_FOLDERS] as const;
const START_LABEL = { '/': 'pick.start.top', '/root': 'pick.start.root', '/home': 'pick.start.home', '/etc': 'pick.start.etc' } as const satisfies Record<(typeof QUICK)[number], string>;

/** The folder picker: a folder's subfolders, one level at a time, read from the files program. It opens at the top of
 *  the computer (`/`); the quick buttons jump to well-known folders; Up goes one level back, to `/` from a top folder.
 *  The top itself cannot be added: one .zip holds a folder, not a whole computer. */
function Picker({ c, path, onGo, onAdd, full, listed }: { c: Computer; path: string; onGo: (p: string) => void; onAdd: (p: string) => void; full: boolean; listed: readonly string[] }) {
  const t = useStrings(strings);
  const subs = useSubfolders(c, path, true);
  const parts = path.split('/').filter(Boolean);
  const up = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : parts.length === 1 ? BROWSE_START : null;
  const top = parts.length === 0;
  const deep = parts.length >= MAX_DEPTH;
  const listedHere = listed.includes(path);
  const addWhy = top ? t('pick.topWhy') : full ? t('zip.full', { max: MAX_FOLDERS }) : listedHere ? t('pick.added') : undefined;
  return (
    <section className={s.stack} aria-label={t('pick.title')}>
      <InlineActions
        label={t('pick.starts')}
        actions={QUICK.slice(0, 3).map((f) => ({ id: `start-${f}`, label: t(START_LABEL[f]), onPress: () => onGo(f) }))}
        more={QUICK.slice(3).map((f) => ({ id: `start-${f}`, label: t(START_LABEL[f]), onAction: () => onGo(f) }))}
      />
      <CodeLine value={path} />
      <InlineActions
        label={t('pick.here')}
        actions={[
          ...(up ? [{ id: 'up', label: t('pick.up'), icon: 'arrow-up' as const, onPress: () => onGo(up) }] : []),
          { id: 'add', label: listedHere ? t('pick.added') : t('pick.add'), onPress: () => onAdd(path), ...(addWhy ? { disabledReason: addWhy } : {}) },
        ]}
      />
      {top ? <Notice>{t('pick.top')}</Notice> : null}
      {subs.isError || subs.data === null ? (
        <Notice level="warn">{t('pick.error')}</Notice>
      ) : subs.data === undefined ? (
        <Notice>{t('pick.loading')}</Notice>
      ) : subs.data.length === 0 ? (
        <Notice>{t('pick.none')}</Notice>
      ) : deep ? (
        <Notice>{t('pick.deep')}</Notice>
      ) : (
        <ItemList
          label={t('pick.list', { path })}
          items={subs.data.map((name) => {
            const child = (path === '/' ? '' : path) + '/' + name;
            const why = full ? t('zip.full', { max: MAX_FOLDERS }) : listed.includes(child) ? t('pick.added') : undefined;
            return {
              id: child,
              title: name,
              name: t('pick.open.one', { name }),
              mono: true,
              onOpen: () => onGo(child),
              actions: { inline: [{ id: `add-${child}`, label: t('pick.addShort'), name: t('pick.add.one', { name }), icon: 'plus' as const, onPress: () => onAdd(child), ...(why ? { disabledReason: why } : {}) }] as const },
            };
          })}
        />
      )}
    </section>
  );
}
