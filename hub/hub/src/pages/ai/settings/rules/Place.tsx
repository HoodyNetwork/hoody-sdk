// The one place the rules and the hooks of Settings → Rules & hooks are edited for: the
// realm's own settings, or one folder (its project and local settings as well). The settings session (Session.ts) serves ONE
// place at a time, so both sections read this one choice; two pickers would close each other's chat. On the page the bar
// sits above both sections (Settings.tsx), named "Showing", so a folder chosen there visibly moves both.
import type { Target } from '@core';
import { SegmentedControl, useStrings } from '@kit';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFolders, type FoldersRead } from '../../new/data';
import { FolderField } from '../../new/Options';
import type { SettingsAt } from './data';
import strings from './Rules.strings.en.json';

export interface PlaceState {
  target: Target;
  realm: string;
  place: 'realm' | 'folder';
  setPlace: (p: 'realm' | 'folder') => void;
  /** The folder chosen ('' while none is). */
  folder: string;
  /** The field's generation: a folder chosen from outside the field (goTo) starts a new one. */
  gen: number;
  /** A folder chosen in the field of generation `gen` (listed, typed with commitTyped, browsed); null = none valid. A field of
   *  an older generation (one left as goTo replaced it) chooses nothing. */
  pickAt: (gen: number, f: string | null) => void;
  /** The folders chats ran in and the agent's home folder (the choices; a path may also be typed or browsed). */
  folders: FoldersRead;
  /** The place as a settings scope: null while a folder is wanted and none is chosen yet. */
  at: SettingsAt | null;
}

const Ctx = createContext<PlaceState | null>(null);
// Named for what it is, so the explanation rule (layout.explain) reads it as a provider that only shows its children.
const PlaceCtxProvider = Ctx.Provider;

/** One folder place: the folder chosen, and the reads FolderField offers. The first folder a chat ran in is preselected only until
 *  the person picks or types one, so a typed folder the list does not name stays chosen. Also the MCP section's (Mcp.tsx). */
export function usePlaceFolder(target: Target, realm: string, on: boolean): PlaceFolderState {
  const [folder, setFolder] = useState('');
  const [chosen, setChosen] = useState(false);
  const [gen, setGen] = useState(0);
  const live = useRef(0);
  const folders = useFolders(on ? target : null, realm);
  const first = folders.folders[0] ?? '';
  useEffect(() => {
    if (on && !chosen && folder === '' && first !== '') setFolder(first);
  }, [on, chosen, folder, first]);
  const pickAt = useCallback((g: number, f: string | null) => {
    if (g !== live.current) return;
    setChosen(true);
    setFolder(f ?? '');
  }, []);
  // A folder chosen from outside the field (MCP's held change): a new field shows it, and the old one's last commit (a blur
  // still pending as it unmounts) is of an older generation, so it never replaces this choice.
  const goTo = useCallback((f: string) => {
    live.current += 1;
    setGen(live.current);
    setChosen(true);
    setFolder(f);
  }, []);
  return { folder, gen, pickAt, goTo, folders };
}

export interface PlaceFolderState {
  folder: string;
  gen: number;
  pickAt: (gen: number, f: string | null) => void;
  goTo: (f: string) => void;
  folders: FoldersRead;
}

/** The place of a computer and one realm. */
export function PlaceProvider({ target, realm, children }: { target: Target; realm: string; children: ReactNode }) {
  const [place, setPlace] = useState<'realm' | 'folder'>('realm');
  const { folder, gen, pickAt, folders } = usePlaceFolder(target, realm, place === 'folder');
  const at = useMemo<SettingsAt | null>(() => (place === 'realm' ? { target, realm } : folder !== '' ? { target, realm, cwd: folder } : null), [place, folder, target, realm]);
  const value = useMemo<PlaceState>(() => ({ target, realm, place, setPlace, folder, gen, pickAt, folders, at }), [target, realm, place, folder, gen, pickAt, folders, at]);
  return <PlaceCtxProvider value={value}>{children}</PlaceCtxProvider>;
}

/** The place in force, or null outside a provider. */
export function usePlaceOrNull(): PlaceState | null { return useContext(Ctx); }
export function usePlace(): PlaceState {
  const p = useContext(Ctx);
  if (!p) throw new Error('usePlace outside PlaceProvider');
  return p;
}

/** The folder of a place: the shared folder choice, a typed path chosen on Enter or leaving the box (each choice opens a
 *  settings chat). `noFolders` is said while the agent lists none. */
export function PlaceFolder({ computer, folder, gen, pickAt, folders, noFolders }: { computer: string; folder: string; gen: number; pickAt: (gen: number, f: string | null) => void; folders: FoldersRead; noFolders: string }) {
  const onChange = useCallback((f: string | null) => pickAt(gen, f), [pickAt, gen]);
  return (
    <FolderField
      key={gen}
      computer={computer}
      folders={folders}
      value={folder}
      onChange={onChange}
      noHome
      commitTyped
      {...(folders.state === 'ok' && folders.folders.length === 0 ? { description: noFolders } : {})}
    />
  );
}

/** The picker: This realm | One folder, and the folder to choose. `shared` (the page's one bar, above both sections) shows
 *  its label, "Showing". (No help line under it yet: the folder field's alternative lines are counted together with it, over
 *  the explanation budget.) */
export function PlaceBar({ computer, shared }: { computer: string; shared?: boolean }) {
  const t = useStrings(strings);
  const { place, setPlace, folder, gen, pickAt, folders } = usePlace();
  return (
    <>
      {shared ? (
        <SegmentedControl
          label={t('place')}
          items={[{ id: 'realm', label: t('place.realm') }, { id: 'folder', label: t('place.folder') }]}
          value={place}
          onChange={setPlace}
          showLabel
        />
      ) : (
        <SegmentedControl
          label={t('place')}
          items={[{ id: 'realm', label: t('place.realm') }, { id: 'folder', label: t('place.folder') }]}
          value={place}
          onChange={setPlace}
        />
      )}
      {place === 'folder' && <PlaceFolder computer={computer} folder={folder} gen={gen} pickAt={pickAt} folders={folders} noFolders={t('place.noFolders')} />}
    </>
  );
}
