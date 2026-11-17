// PathField in the terminal: the path is typed after the root's label (drawn like the kit TextField, prefix "~/"; a combobox to a reader), and while the field
// has focus the entries of the folder being typed are offered under it with the web's rules (pathPick.ts: dotfiles only
// after a ".", folders first, nothing outside the root, at most PATH_MAX). ↓/↑ move through them, Enter picks one (a
// folder opens its own entries next). Browse (the web's folder dialog) is a Handoff line to the web Hub. The host is
// asked for one folder at a time through `read.want`, and told want(null) on leaving, unmount or lock. Enter and leaving
// the field tell `onCommit`, as the web's box does; so does the field going away while it has the focus.
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type * as Web from './PathField';
import { Box, Text } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import { Handoff } from '../states/Handoff';
import { useStrings } from '../strings';
import { FieldInput } from '../../term/prim/FieldInput';
import { ControlRow, FieldFrame, fieldSem, useTermForm } from './termField';
import { useFieldLock } from './lock';
import { pathJoin, pathMatches, pathSplit, type PathEntry, type PathReads } from './pathPick';
import strings from './PathField.strings.en.json';
import termStrings from './term.strings.en.json';

export type { PathFieldProps, PathEntry, PathReads } from './PathField';

/** Rows shown at once under the field (the rest scroll with the highlight). */
const ROWS = 8;

const entriesOf = (read: PathReads, dir: string): readonly PathEntry[] | null => (read.dir === dir ? read.entries : null);
const insideOf = (entries: readonly PathEntry[] | null, dir: string): readonly PathEntry[] | null =>
  entries === null ? null : entries.filter((e) => pathSplit(pathJoin(dir, e)) !== 'outside');

export const PathField: typeof Web.PathField = ({ label, description, errorMessage, value, onChange, read, mode = 'any', rootLabel, placeholder, width, onCommit, ...rest }): ReactNode => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(-1);
  // The field can be taken away while it has the focus (the place switched from outside it, the page left), and FieldInput
  // reports no focus change on unmount: removed while it has the focus, the field tells onCommit as it goes, as leaving it
  // does. A layout cleanup: it runs before any useEffect cleanup of the host, so a host that runs a waiting commit in one
  // when it goes away finds this one.
  const hasFocus = useRef(false);
  const commitNow = useRef(onCommit);
  useLayoutEffect(() => { commitNow.current = onCommit; });
  useLayoutEffect(() => () => { if (hasFocus.current) commitNow.current?.(); }, []);
  const form = useTermForm();
  const split = pathSplit(value);
  const typedDir = split === 'outside' ? null : split.dir;
  const name = split === 'outside' ? '' : split.name;
  // No root (the host lists no folders): nothing is asked for and the path is typed only, as on the web.
  const asked = rootLabel !== null && focused ? typedDir : null;
  const want = read.want;
  useEffect(() => {
    want(isDisabled ? null : asked);
    return () => want(null);
  }, [want, asked, isDisabled]);

  const typedAll = typedDir === null ? null : insideOf(entriesOf(read, typedDir), typedDir);
  const shown = useMemo(() => (typedAll === null ? [] : pathMatches(mode === 'folder' ? typedAll.filter((e) => e.dir) : typedAll, name)), [typedAll, mode, name]);
  const note = ((): string => {
    if (rootLabel === null) return t('path.typeOnly');
    if (split === 'outside' || read.outside) return t('path.outside', { root: rootLabel });
    if (read.failed && read.dir !== typedDir) return t('path.failed');
    const all = typedDir === null ? null : entriesOf(read, typedDir);
    if (all === null) return read.failed ? t('path.failed') : t('path.reading');
    if (all.length === 0) return t('path.empty');
    if (shown.length > 0) return '';
    if (!name.startsWith('.') && all.some((e) => e.name.startsWith('.') && (mode !== 'folder' || e.dir))) return t('path.hidden');
    if (mode === 'folder' && !all.some((e) => e.dir)) return t('path.noFolders');
    return t('path.noMatch');
  })();
  const at = hi >= shown.length ? shown.length - 1 : hi;
  const pick = (e: PathEntry) => {
    if (typedDir === null) return;
    onChange(pathJoin(typedDir, e), 'picked');
    setHi(-1);
  };
  const top = Math.max(0, Math.min(at - ROWS + 1, shown.length - ROWS));
  const absolute = value.startsWith('/');
  return (
    <Box dir="column" shrink={0}>
      <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} description={description} error={errorMessage} width={width}>
        <ControlRow focused={focused} invalid={Boolean(errorMessage)} disabled={isDisabled}>
          {absolute || rootLabel === null ? null : <Text colour="faint">{rootLabel.endsWith('/') ? rootLabel : `${rootLabel}/`}</Text>}
          <FieldInput
            value={value}
            onChange={(v) => { setHi(-1); onChange(v, 'typed'); }}
            placeholder={placeholder}
            disabled={isDisabled}
            colour="ink"
            // The web's combobox: the entries offered are its list (expanded while rows show).
            sem={{ ...fieldSem({ label: label ?? rest['aria-label'], description, error: errorMessage, invalid: Boolean(errorMessage), required: rest.isRequired }),
              role: 'combobox', expanded: focused && !isDisabled && shown.length > 0 }}
            onSubmit={() => form?.submit()}
            onFocusChange={(f) => { hasFocus.current = f; setFocused(f); if (!f) { setHi(-1); onCommit?.(); } }}
            onKey={(k) => {
              if ((k.name === 'down' || k.name === 'up') && shown.length > 0) {
                setHi((h) => (k.name === 'down' ? Math.min(shown.length - 1, h + 1) : Math.max(-1, h - 1)));
                return true;
              }
              if (k.name === 'return' || k.name === 'linefeed') {
                // The web's Enter: a highlighted entry is picked, and onCommit is told either way; with none it submits.
                const row = at >= 0 ? shown[at] : undefined;
                if (row) pick(row);
                onCommit?.();
                return row !== undefined;
              }
              if (k.name === 'escape' && at >= 0) { setHi(-1); return true; }
              return false;
            }}
          />
        </ControlRow>
      </FieldFrame>
      {focused && !isDisabled ? (
        <Box dir="column" padX={2} shrink={0}>
          {note ? <Text colour="muted">{note}</Text> : null}
          {shown.slice(top, top + ROWS).map((e, i) => {
            const on = top + i === at;
            return (
              <Text key={e.name} colour={on ? 'ink' : 'muted'} {...focusInk(on)}>
                {on ? '› ' : '  '}{e.dir ? `${e.name}/` : e.name}
              </Text>
            );
          })}
          {shown.length > ROWS ? <Text colour="faint">{`${top + 1}–${Math.min(top + ROWS, shown.length)} of ${shown.length}`}</Text> : null}
        </Box>
      ) : null}
      <Handoff size="line" reason={tt('path.browseReason')} what={tt('path.browseWhat')} />
    </Box>
  );
};
