// A file input in the terminal: there is no file picker, so a press on it (the page's own button calling `click()`) opens
// one field for local paths, one per line (one only without `multiple`). Paths are taken as typed: a leading `~` is the
// home folder, a relative path is read from the current folder; no globbing, no folder walk. Every path is checked before
// anything is handed on: it must be a file this process can open, no larger than the web upload's own per-file limit.
// The first path that fails is said in plain words and nothing is handed on. The files that pass reach the page's
// `onChange` as the web's do (`target.files`), so what the page does with them (its own dialog, plan and sending) is the
// web's, unchanged. The File objects stay backed by the files on disk (nothing is read here beyond the checks):
// fs.openAsBlob, the same lazy file under Bun and Node.
import { closeSync, openAsBlob, openSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, resolve } from 'node:path';
import { createElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { Box } from '../prim/Box';
import { FieldInput } from '../prim/FieldInput';
import { focusInk } from '../prim/FocusInk';
import { Layer } from '../prim/Overlay';
import { Pressable } from '../prim/Pressable';
import { Text } from '../prim/Text';
import strings from '../shell/strings.en.json';

const GiB = 1024 ** 3;
/** The most one file may be: the web upload's per-file limit (pages/files/upload.ts LIMITS.fileBytes; a test pins it). */
export const PICK_MAX_BYTES = 10 * GiB;

type Key = keyof typeof strings;
const fill = (key: Key, vars: Readonly<Record<string, string>> = {}): string => strings[key].replace(/\{\{(\w+)\}\}/g, (_m, n: string) => vars[n] ?? '');

export type Picked = { ok: true; files: File[] } | { ok: false; why: string };

/** The typed lines as files, or the plain reason the first path that fails cannot be used. */
export async function readPicked(text: string, opts: { multiple: boolean; maxBytes?: number; cwd?: string; home?: string }): Promise<Picked> {
  const max = opts.maxBytes ?? PICK_MAX_BYTES;
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const typed = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  if (!typed.length) return { ok: false, why: fill('filepick.none') };
  if (!opts.multiple && typed.length > 1) return { ok: false, why: fill('filepick.onlyOne') };
  const files: File[] = [];
  for (const path of typed) {
    const full = path === '~' ? home : path.startsWith('~/') ? resolve(home, path.slice(2)) : isAbsolute(path) ? path : resolve(cwd, path);
    let st: ReturnType<typeof statSync>;
    try { st = statSync(full); } catch (e) {
      return { ok: false, why: fill((e as { code?: string }).code === 'EACCES' ? 'filepick.noAccess' : 'filepick.notFound', { path }) };
    }
    if (st.isDirectory()) return { ok: false, why: fill('filepick.folder', { path }) };
    if (!st.isFile()) return { ok: false, why: fill('filepick.notFile', { path }) };
    if (st.size > max) return { ok: false, why: fill('filepick.tooBig', { path, max: `${Math.round((max / GiB) * 10) / 10} GiB` }) };
    try { closeSync(openSync(full, 'r')); } catch { return { ok: false, why: fill('filepick.noAccess', { path }) }; }
    let blob: Blob;
    try { blob = await openAsBlob(full); } catch { return { ok: false, why: fill('filepick.noAccess', { path }) }; }
    files.push(new File([blob], basename(full), { lastModified: st.mtimeMs }));
  }
  return { ok: true, files };
}

/** The open field: `onFiles` with the files that passed, `onClose` on Cancel or Esc. */
export function FilePicker({ multiple, onFiles, onClose }: { multiple: boolean; onFiles: (files: File[]) => void; onClose: () => void }): ReactElement {
  const [text, setText] = useState('');
  const [why, setWhy] = useState<string | null>(null);
  // One pick at a time: a second press while the paths are being checked does nothing. A pick still being checked when
  // the field closes (Cancel, Esc, the page going away) hands nothing on.
  const picking = useRef(false);
  const open = useRef(true);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);
  const close = (): void => { open.current = false; onClose(); };
  const use = (): void => {
    if (picking.current) return;
    picking.current = true;
    void readPicked(text, { multiple }).then((r) => {
      picking.current = false;
      if (!open.current) return;
      if (!r.ok) { setWhy(r.why); return; }
      close();
      onFiles(r.files);
    }, () => { picking.current = false; });
  };
  const title = fill(multiple ? 'filepick.titleMany' : 'filepick.titleOne');
  const button = (label: string, onPress: () => void): ReactElement => createElement(Pressable, { dir: 'row', onPress, sem: { role: 'button', name: label }, children: ({ focused }: { focused: boolean }) => createElement(Text, focusInk(focused), `[${label}]`) });
  return createElement(Layer, {
    open: true, kind: 'modal', place: { at: 'center', width: 72, top: 'fifth' }, padX: 1, initialFocus: 'first',
    sem: { role: 'dialog', name: title }, onEscape: close,
  } as never,
  createElement(Box, { dir: 'column', gap: 1, shrink: 0 },
    createElement(Text, { bold: true }, title),
    createElement(Text, { colour: 'muted' }, fill(multiple ? 'filepick.helpMany' : 'filepick.helpOne')),
    createElement(Box, { dir: 'row', border: true, borderColour: 'line', padX: 1, shrink: 0 },
      createElement(FieldInput, {
        value: text, onChange: (v: string) => { setText(v); setWhy(null); }, onSubmit: () => { if (!multiple) use(); },
        lines: multiple ? 4 : 1, autoFocus: true, grow: 1, sem: { role: 'textbox', name: title },
      } as never)),
    why ? createElement(Text, { colour: 'danger' }, `! ${why}`) : null,
    createElement(Box, { dir: 'row', gap: 2, justify: 'end', shrink: 0 },
      button(fill('filepick.cancel'), close),
      button(fill(multiple ? 'filepick.useMany' : 'filepick.useOne'), use))));
}
