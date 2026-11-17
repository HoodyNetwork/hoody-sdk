// The kit FileChooser in the gallery (/_kit?tab=pieces&fc=<state>): one file, several files, a folder, a file or folder,
// one place with no computers, and a folder whose read fails. Its host is a fake that answers from this file: two sample
// computers with a few folders, one stopped computer, a text preview, and a search by name. Nothing is read or sent.
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../controls/Button';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Row } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import type { ComputerChoice } from '../pickers/ComputerPicker';
import { FileChooser, type FileChooserProps } from '../pickers/FileChooser';
import { acceptExtensions, fileOriginText, fileReferenceText, type ChooserEntry, type ChooserFileRef, type ChooserFindAsk, type ChooserFound, type ChooserPlace, type ChooserReads, type ChooserResult } from '../pickers/fileChooser';
import { useStrings } from '../strings';
import strings from './fileChooser.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const DAY = 86_400_000;
const AT = Date.UTC(2026, 10, 10, 9, 30);
const dir = (name: string, days = 1): ChooserEntry => ({ name, dir: true, modified: AT - days * DAY });
const file = (name: string, size: number, days = 1): ChooserEntry => ({ name, dir: false, size, modified: AT - days * DAY });

// Sample folders by computer and path (gallery only).
const TREE: Record<string, Record<string, ChooserEntry[]>> = {
  atlas: {
    '': [dir('home', 30), dir('srv', 12), dir('tmp', 0), file('.profile', 807, 90)],
    'home/': [dir('ada', 2)],
    'home/ada/': [dir('projects', 2), dir('.config', 40), file('notes.md', 1_240, 3), file('todo.txt', 212, 1)],
    'home/ada/projects/': [dir('shop', 1), dir('site', 9)],
    'home/ada/projects/shop/': [
      dir('src', 1), dir('public', 6), file('README.md', 2_310, 4), file('package.json', 1_104, 2), file('server.ts', 8_420, 1),
      file('screenshot-of-the-checkout-page-before-the-new-payment-step-2026-11-09.png', 412_000, 2),
      file('orders-export.csv', 3_400_000, 5), file('.env.example', 96, 20), { name: 'latest.log', dir: false, size: 18_200, modified: AT, link: true },
    ],
    'home/ada/projects/shop/src/': [file('cart.ts', 4_100, 1), file('checkout.ts', 6_900, 1), file('index.ts', 640, 3)],
    'home/ada/projects/shop/public/': [],
    'home/ada/projects/site/': [file('index.html', 5_300, 9)],
    'srv/': [dir('locked', 3)],
    'tmp/': [],
  },
  borealis: {
    '': [dir('srv', 4), dir('var', 60)],
    'srv/': [dir('api', 4)],
    'srv/api/': [file('app.log', 96_000, 0), file('config.yaml', 730, 14)],
    'var/': [dir('log', 1)],
    'var/log/': [file('syslog', 1_900_000, 0)],
  },
};
const TEXT = '# Shop\n\nThe storefront and its checkout.\n\n## Run it\n\n    bun install\n    bun run dev\n';
const MAX = 1_000_000;

function useFakeHost(t: T, single: boolean): Pick<FileChooserProps, 'reads' | 'computers' | 'places'> {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const [shown, setShown] = useState<ChooserFileRef | null>(null);
  const [ask, setAsk] = useState<ChooserFindAsk | null>(null);
  const [tries, setTries] = useState(0);
  const want = useCallback((p: ChooserPlace | null) => setPlace(p), []);
  const wantPreview = useCallback((f: ChooserFileRef | null) => setShown(f), []);
  const wantFind = useCallback((a: ChooserFindAsk | null) => setAsk(a), []);
  const retry = useCallback(() => setTries((n) => n + 1), []);
  const treeOf = useCallback((c: string | null) => TREE[single ? 'atlas' : c ?? ''] ?? {}, [single]);

  const reads = useMemo((): ChooserReads => {
    const entries = place ? treeOf(place.computer)[place.dir] : undefined;
    const locked = place?.dir === 'srv/locked/';
    const found: ChooserFound[] = [];
    if (ask) {
      const q = ask.query.toLowerCase();
      for (const [d, list] of Object.entries(treeOf(ask.computer))) {
        if (!d.startsWith(ask.dir) || d === ask.dir) continue;
        for (const e of list) if (e.name.toLowerCase().includes(q)) found.push({ ...e, dir_in: d });
      }
    }
    return {
      folder: locked
        ? { place: null, entries: [], failed: true, error: { kind: 'unavailable', status: 503, tries }, retry }
        : { place: entries ? place : null, entries: entries ?? [], reading: place !== null && !entries, hidden: place?.dir === 'home/ada/' ? 2 : 0 },
      want,
      preview: {
        of: shown,
        state: !shown ? { kind: 'loading' }
          : /\.(md|txt|ts|json|yaml|html|log)$/.test(shown.name) ? { kind: 'text', text: TEXT, more: shown.name.endsWith('.log'), lang: shown.name.endsWith('.ts') ? 'ts' : 'plain' }
            : { kind: 'none', why: t('noPreview') },
        want: wantPreview,
      },
      find: { of: ask, items: found, off: (p) => (p.dir === '' ? t('findOff') : null), want: wantFind },
    };
  }, [place, shown, ask, tries, treeOf, want, wantPreview, wantFind, retry, t]);

  const computers = useMemo((): ComputerChoice[] => [
    { id: 'atlas', name: 'atlas', realm: { name: 'Personal', color: 'teal' }, running: true, state: t('running') },
    { id: 'borealis', name: 'borealis', realm: { name: 'Personal', color: 'teal' }, running: true, state: t('running') },
    { id: 'cedar', name: 'cedar', realm: { name: 'Personal', color: 'teal' }, running: false, state: t('stopped'), disabledReason: t('startFirst') },
  ], [t]);
  const places = useCallback((c: string | null) => (single || c === 'atlas'
    ? [{ id: 'projects', label: t('place.projects'), dir: 'home/ada/projects/', icon: 'files' as const }]
    : c === 'borealis' ? [{ id: 'logs', label: t('place.logs'), dir: 'var/log/', icon: 'files' as const }] : []), [single, t]);
  return { reads, computers: single ? undefined : computers, places };
}

const STATES = ['file', 'files', 'folder', 'any', 'one', 'failed'] as const;
type State = (typeof STATES)[number];

function Specimen({ state, onClose, onPicked }: { state: State; onClose: () => void; onPicked: (p: readonly ChooserResult[]) => void }) {
  const t = useStrings(strings);
  const host = useFakeHost(t, state === 'one');
  const accept = useCallback((e: ChooserEntry) => ((e.size ?? 0) > MAX ? t('tooBig') : null), [t]);
  const shared = {
    isOpen: true, onClose, ...host, current: 'atlas', rootLabel: state === 'one' ? '~' : '/',
    onChoose: (p: readonly ChooserResult[]) => { onPicked(p); onClose(); },
  } as const;
  // One literal overlay id per state: each is its own overlay on this page.
  if (state === 'files') return <FileChooser {...shared} overlayId="kit-fc-files" mode="files" start="home/ada/projects/shop/" accept={accept} limits={{ maxFiles: 3, note: t('limit') }} />;
  if (state === 'folder') return <FileChooser {...shared} overlayId="kit-fc-folder" mode="folder" start="home/ada/projects/" home="home/ada/" />;
  if (state === 'any') return <FileChooser {...shared} overlayId="kit-fc-any" mode="any" start="home/ada/" />;
  if (state === 'one') return <FileChooser {...shared} overlayId="kit-fc-one" mode="file" computerName="atlas" start="home/ada/projects/shop/src/" accept={acceptExtensions(['ts'], t('onlyTs'))} />;
  if (state === 'failed') return <FileChooser {...shared} overlayId="kit-fc-failed" mode="file" start="srv/locked/" />;
  return <FileChooser {...shared} overlayId="kit-fc-file" mode="file" start="home/ada/projects/shop/" accept={accept} />;
}

export function FileChooserPieces() {
  const t = useStrings(strings);
  const [first] = useSearchParam('fc');
  const [open, setOpen] = useState<State | null>(() => ((STATES as readonly string[]).includes(first ?? '') ? (first as State) : null));
  const [picked, setPicked] = useState<readonly ChooserResult[]>([]);
  const last = picked.length === 0 ? t('nothing') : picked.map((p) => t('pickedOne', { from: fileOriginText(p), written: fileReferenceText(p, 'atlas') })).join(' · ');
  return (
    <>
      <AnatomySection id="file-chooser" title={t('title')} description={t('about')} note={t('picked', { last })}>
        <div data-gallery="file-chooser">
          <Row gap={2} wrap>
            <Button onPress={() => setOpen('file')}>{t('open.file')}</Button>
            <Button onPress={() => setOpen('files')}>{t('open.files')}</Button>
            <Button onPress={() => setOpen('folder')}>{t('open.folder')}</Button>
            <Button onPress={() => setOpen('any')}>{t('open.any')}</Button>
            <Button onPress={() => setOpen('one')}>{t('open.one')}</Button>
            <Button onPress={() => setOpen('failed')}>{t('open.failed')}</Button>
          </Row>
        </div>
      </AnatomySection>
      {open && <Specimen key={open} state={open} onClose={() => setOpen(null)} onPicked={setPicked} />}
    </>
  );
}
