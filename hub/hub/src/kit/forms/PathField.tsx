// PathField: the one field for picking a file or folder on a computer, by writing the path or by browsing. A path is typed, with the entries of the folder being typed offered under it (the kit Combobox's popover and
// rows; the "@" picker's rules, pathPick.ts), or chosen with Browse (the kit FileChooser on the same reads: the place, Up, the
// folder's entries, Use this folder). The path is relative to a root the host chose (shown before it as `rootLabel`, with one "/" after it) and never leaves it by name; the host
// reads the folders through `read` (PathReads, the composer's ComposerMention shape) and never goes into a link. The typed text
// is always the value: the field never refuses it, the page checks it (errorMessage).
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ButtonContext, ComboBox, ComboBoxStateContext, FieldError, Input, Label, ListBox, ListBoxItem, Popover, Text } from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { SrOnly } from '../data/Display';
import { Icon } from '../icons';
import { FileChooser } from '../pickers/FileChooser';
import { chooserFolderOf, type ChooserPlace, type ChooserReads } from '../pickers/fileChooser';
import { useStrings } from '../strings';
import b from './fieldBox.module.css';
import f from './fields.module.css';
import { fieldWidthClass, type FieldChrome, type FieldWidth } from './fields';
import { useFieldLock } from './lock';
import m from './more.module.css';
import { pageErrorProps } from './pageError';
import { pathJoin, pathMatches, pathSplit, type PathEntry, type PathReads } from './pathPick';
import strings from './PathField.strings.en.json';
import s from './PathField.module.css';

export type { PathEntry, PathReads } from './pathPick';

export interface PathFieldProps extends FieldChrome {
  /** The typed path, relative to the root ('' for the root itself; a folder may end in "/"). */
  value: string;
  /** `how`: typed, picked from the list, or chosen in Browse ("Use this folder" at the root writes '', which a host may read
   *  as the root itself, while an emptied box is nothing typed). */
  onChange: (path: string, how: 'typed' | 'picked' | 'browsed') => void;
  /** The host's reads of the folder being typed or browsed. `want` is called only when the folder asked for changes; it must be
   *  stable (useCallback): a new `want` is another host, so the old one is told want(null) and the new one asked. */
  read: PathReads;
  /** What may be chosen: a folder (files are listed in Browse but cannot be picked, and are not offered while typing), a file
   *  (Browse has no Use this folder), or either. */
  mode?: 'folder' | 'file' | 'any';
  /** How the root reads (the folder's own path), shown before the typed path and in Browse. null: the host knows no root
   *  (nothing can be listed here), so the field is a plain typed path: no prefix, no Browse, and its list only says
   *  that the path is typed (never a Browse or a list that can only say the folder couldn't be read). */
  rootLabel: string | null;
  placeholder?: string;
  width?: FieldWidth;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Called on Enter in the box and when the box loses focus (after a pick from the list too): a host that chooses the typed
   *  path only then, not per keystroke, chooses it here. */
  onCommit?: () => void;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  /** Browse shows the whole computer, not the root alone: these reads list folders from the computer's top folder "/"
   *  (paths under it, as `read`'s are under the root). Used only when `rootLabel` is an absolute folder: Browse opens
   *  there and offers it as Home. What is chosen is written back as its absolute path ("/etc/"), which the field reads as
   *  itself; the typed list still lists under the root. */
  browseComputer?: PathReads;
  /** The computer's name, for Browse's title ("Choose a folder on shop-1"). */
  computerName?: string;
}

type Mode = NonNullable<PathFieldProps['mode']>;

/** The entries `read` holds for `dir`, or null while it holds another folder's (or none). */
const entriesOf = (read: PathReads, dir: string): readonly PathEntry[] | null => (read.dir === dir ? read.entries : null);

/** The entries that can be written as a path inside the root (a name starting with "~" at the root, or holding "..", reads as
 *  outside when typed, so it is neither offered nor opened). */
const insideOf = (entries: readonly PathEntry[] | null, dir: string): readonly PathEntry[] | null =>
  entries === null ? null : entries.filter((e) => pathSplit(pathJoin(dir, e)) !== 'outside');

/** The line a list shows instead of rows: why there is nothing to pick. */
function useNote(read: PathReads, dir: string, shown: readonly PathEntry[], name: string, mode: Mode, root: string): string {
  const t = useStrings(strings);
  if (read.outside) return t('path.outside', { root });
  if (read.failed && read.dir !== dir) return t('path.failed');
  const all = entriesOf(read, dir);
  if (all === null) return read.failed ? t('path.failed') : t('path.reading');
  if (all.length === 0) return t('path.empty');
  if (shown.length > 0) return '';
  if (!name.startsWith('.') && all.some((e) => e.name.startsWith('.') && (mode !== 'folder' || e.dir))) return t('path.hidden');
  if (mode === 'folder' && !all.some((e) => e.dir)) return t('path.noFolders');
  return t('path.noMatch');
}

/** After a pick: the list opens again on a folder (react-aria closes it on every pick: the next level is offered at once), and
 *  stays closed on a file (react-aria opens it again when the box's text changes under focus, so it is closed after that). */
function AfterPick({ pick }: { pick: { n: number; dir: boolean } }): null {
  const state = useContext(ComboBoxStateContext);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (pick.n === 0) return;
    if (pick.dir) { latest.current?.open(null, 'manual'); return; }
    const t = setTimeout(() => latest.current?.close(), 0);
    return () => clearTimeout(t);
  }, [pick]);
  return null;
}

export function PathField({ label, description, errorMessage, className, value, onChange, read, mode = 'any', rootLabel, placeholder, width, onCommit, browseComputer, computerName, ...rest }: PathFieldProps): ReactNode {
  const t = useStrings(strings);
  const isDisabled = useFieldLock(rest.isDisabled);
  const [listOpen, setListOpen] = useState(false);
  const [picked, setPicked] = useState({ n: 0, dir: false });
  // The folder Browse shows, or null while it is closed.
  const [browse, setBrowse] = useState<string | null>(null);
  const split = pathSplit(value);
  const typedDir = split === 'outside' ? null : split.dir;
  const name = split === 'outside' ? '' : split.name;
  // One folder is asked for at a time: the one Browse shows, else the typed one while its list is open; none otherwise.
  // With browseComputer, Browse asks its own host: this one is asked only for the typed list.
  const homeAt = rootLabel?.startsWith('/') ? rootLabel.split('/').filter(Boolean).map((p) => `${p}/`).join('') : null;
  const whole = homeAt === null || !browseComputer ? undefined : { read: browseComputer, at: homeAt };
  const asked = rootLabel === null ? null : whole ? (browse === null && listOpen ? typedDir : null) : (browse ?? (listOpen ? typedDir : null));
  // One host asks at a time: when the folder asked for changes, the field goes, or the host's `want` is replaced (another host),
  // the host that was asked is told want(null) and the current one is asked. `want` must be stable (useCallback), as the
  // composer's ComposerMention is: a new one each render is a new host each render.
  const want = read.want;
  // DEV only (the Link/UpgradeLink pattern): a host whose `want` changes on every render while the folder asked stays the same
  // breaks that contract (each render tells it null, then asks again); said once per mount.
  const churn = useRef({ want, asked, isDisabled, n: 0, said: false });
  useEffect(() => {
    const c = churn.current;
    c.n = want !== c.want && asked === c.asked && isDisabled === c.isDisabled ? c.n + 1 : 0;
    Object.assign(c, { want, asked, isDisabled });
    if (import.meta.env.DEV && c.n >= 3 && !c.said) {
      c.said = true;
      console.error('hub PathField: read.want changes every render; pass a stable want (useCallback)');
    }
    want(isDisabled ? null : asked);
    return () => want(null);
  }, [want, asked, isDisabled]);
  useEffect(() => {
    if (isDisabled) setBrowse(null);
  }, [isDisabled]);
  // Browse's host when it shows the whole computer: asked for the folder Browse shows, and told want(null) when it closes.
  const wholeWant = whole?.read.want;
  useEffect(() => {
    if (!wholeWant) return;
    wholeWant(isDisabled ? null : browse);
    return () => wholeWant(null);
  }, [wholeWant, browse, isDisabled]);

  const typedAll = typedDir === null ? null : insideOf(entriesOf(read, typedDir), typedDir);
  const shown = useMemo(() => (typedAll === null ? [] : pathMatches(mode === 'folder' ? typedAll.filter((e) => e.dir) : typedAll, name)), [typedAll, mode, name]);
  const note = useNote(split === 'outside' ? { ...read, outside: true } : read, typedDir ?? '', shown, name, mode, rootLabel ?? '');

  // Browse reads through this field: the chooser's folder is the one asked of the host (one host is asked at a time).
  const browseWant = useCallback((place: ChooserPlace | null) => { if (place) setBrowse(place.dir); }, []);
  const browseRead = whole ? whole.read : read;
  const browseReads = useMemo<ChooserReads>(() => ({ folder: chooserFolderOf(browseRead), want: browseWant }), [browseRead, browseWant]);
  // Where Browse opens: the typed folder (an absolute one as typed, on the whole computer), else the root.
  const absTyped = value.startsWith('/') ? pathSplit(value.slice(1)) : 'outside';
  const browseStart = !whole ? (typedDir ?? '') : absTyped !== 'outside' ? absTyped.dir : whole.at + (typedDir ?? '');

  const pick = (e: PathEntry) => {
    if (typedDir === null) return;
    onChange(pathJoin(typedDir, e), 'picked');
    setPicked((p) => ({ n: p.n + 1, dir: e.dir }));
  };

  return (
    <>
      <ComboBox
        aria-label={rest['aria-label']}
        isRequired={rest.isRequired}
        items={shown}
        inputValue={value}
        onInputChange={(v) => onChange(v, 'typed')}
        allowsCustomValue
        allowsEmptyCollection
        selectedKey={null}
        onSelectionChange={(k) => {
          const e = k === null ? undefined : shown.find((x) => x.name === k);
          if (e) pick(e);
        }}
        onOpenChange={setListOpen}
        menuTrigger="focus"
        isDisabled={isDisabled}
        isInvalid={errorMessage ? true : undefined}
        {...pageErrorProps(errorMessage)}
        className={cx(f.field, fieldWidthClass(width), className)}
      >
        <AfterPick pick={picked} />
        {label && <Label className={f.label}>{label}</Label>}
        <div className={cx(b.box, f.slotBox)}>
          {/* A typed absolute path reads as itself: no root before it (the host decides whether it takes one). */}
          {rootLabel !== null && !value.startsWith('/') && (
            <div className={f.prefix} data-literal="">
              {rootLabel.endsWith('/') ? rootLabel : `${rootLabel}/`}
            </div>
          )}
          <Input
            className={cx(f.boxInput, f.mono)} placeholder={placeholder} spellCheck={false} autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onCommit?.(); }}
            onBlur={() => onCommit?.()}
          />
          {rootLabel !== null && <div className={f.suffix}>
            {/* Not the ComboBox's own trigger: its ButtonContext would name and wire this button as "show suggestions". */}
            <ButtonContext.Provider value={null}>
              <IconButton icon="files" size="sm" variant="ghost" label={t('path.browse')} isDisabled={isDisabled} onPress={() => setBrowse(browseStart)} />
            </ButtonContext.Provider>
          </div>}
        </div>
        {/* The root is read with the field (the prefix is drawn only): "Paths are inside ~." after any description. */}
        <Text slot="description" className={description ? f.description : undefined}>
          {description}
          {/* Said with the prefix only: a typed absolute path is not inside the root, and is not said to be. */}
          {rootLabel !== null && !value.startsWith('/') && <SrOnly>{t('path.inside', { root: rootLabel })}</SrOnly>}
        </Text>
        <FieldError className={f.error}>{errorMessage}</FieldError>
        <Popover className={m.popover}>
          <ListBox className={m.listbox} renderEmptyState={() => <div className={m.empty}>{rootLabel === null ? t('path.typeOnly') : note}</div>}>
            {(e: PathEntry) => (
              <ListBoxItem id={e.name} textValue={typedDir === null ? e.name : pathJoin(typedDir, e)} className={m.option}>
                <Icon name={e.dir ? 'files' : 'file'} size="sm" />
                <span className={s.name}>{e.dir ? `${e.name}/` : e.name}</span>
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
      {browse !== null && rootLabel !== null && (
        <FileChooser
          isOpen
          overlayId="path-browse"
          mode={mode}
          rootLabel={whole ? '/' : rootLabel}
          start={browse}
          {...(whole ? { home: whole.at } : {})}
          {...(computerName ? { computerName } : {})}
          reads={browseReads}
          onClose={() => setBrowse(null)}
          onChoose={([picked]) => {
            if (picked) onChange(whole ? picked.fullPath : picked.path, 'browsed');
            setBrowse(null);
          }}
        />
      )}
    </>
  );
}
