// The `?` sheet in a terminal: this page's keys first (usePageShortcutGroups, the live page keys), then the shell's
// groups from useShortcuts, which in a terminal is generated from the live keymap (shell/shortcuts.term.ts): only keys
// that work here, the terminal's own keys and limits last. Arrows, Page Up/Down scroll; Esc or ? closes.
// Keys are bold in the page's ink (blue is for links and the focused control, and says nothing without colour); a
// blank row stands before each group after the first.
import { useEffect, useState } from 'react';
import { useStrings } from '@kit/strings';
import { usePageShortcutGroups } from '../../shell/pageShortcuts';
import { useShortcuts } from '../../shell/shortcuts';
import shellStrings from '../../shell/strings.en.json';
import { Box, Text, useTerminalSize } from '../prim';
import { centerWidth } from '../prim/Overlay';
import { Modal, MODAL_HEAD_ROWS } from './layer';
import type { HubKey } from './hubKey';
import strings from './strings.en.json';

interface Line { head?: string; keys?: string; label?: string }

/** Words of `text` in lines of at most `w` cells (a longer word is cut). */
function wrapWords(text: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > w) { out.push(line); line = ''; }
    line = line ? `${line} ${word}` : word.slice(0, w);
  }
  if (line || out.length === 0) out.push(line);
  return out;
}

/** Key rows as sheet lines: a label too long for its column wraps under itself; keys too long for theirs take a line of
 *  their own with the label below (never cut: the terminal's conflict rows name several keys). */
function rowLines(keys: string, label: string, keysW: number, labelW: number): Line[] {
  if (keys.length + 1 > keysW) return [{ keys, label: '' }, ...wrapWords(label, labelW).map((l) => ({ keys: '', label: l }))];
  return wrapWords(label, labelW).map((l, i) => ({ keys: i === 0 ? keys : '', label: l }));
}

const SHEET_WIDTH = 78;
const KEYS_MAX = 18;

export function Sheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useStrings(shellStrings);
  const tt = useStrings(strings);
  const page = usePageShortcutGroups();
  const global = useShortcuts();
  const { width, height } = useTerminalSize();
  const [top, setTop] = useState(0);
  useEffect(() => { if (open) setTop(0); }, [open]);
  const groups: Array<{ head: string; rows: Array<{ keys: string; label: string }> }> = [
    ...page.map((g) => ({ head: g.title ? t('keys.group.pageNamed', { group: g.title }) : t('keys.group.page'), rows: g.rows.map((r) => ({ keys: r.alts.map((a) => a.join('+')).join(` ${t('keys.or')} `), label: r.label })) })),
    ...global.map((g) => ({ head: g.title, rows: g.rows.map((r) => ({ keys: r.keys.join(' '), label: r.label })) })),
  ];
  const keysW = Math.min(KEYS_MAX, Math.max(6, ...groups.flatMap((g) => g.rows.map((r) => (r.keys.length + 1 > KEYS_MAX ? 0 : r.keys.length + 1)))));
  // The modal's inside: the width it is placed at (centerWidth) less frame and padding (2 + 2).
  const labelW = Math.max(16, centerWidth(SHEET_WIDTH, width) - 4 - keysW);
  const lines: Line[] = [];
  for (const g of groups) {
    // A blank row sets each group apart from the rows above it (the heads ran straight on from the last key row).
    if (lines.length > 0) lines.push({});
    lines.push({ head: g.head });
    for (const r of g.rows) lines.push(...rowLines(r.keys, r.label, keysW, labelW));
  }
  const rows = Math.max(4, Math.min(lines.length, height - 7 - MODAL_HEAD_ROWS));
  const maxTop = Math.max(0, lines.length - rows);
  const onKey = (k: HubKey) => {
    if (k.key === 'Escape' || k.key === '?' || k.key === 'q') { onClose(); return; }
    if (k.key === 'ArrowDown' || k.key === 'j') setTop((v) => Math.min(maxTop, v + 1));
    else if (k.key === 'ArrowUp' || k.key === 'k') setTop((v) => Math.max(0, v - 1));
    else if (k.key === 'PageDown' || k.key === ' ') setTop((v) => Math.min(maxTop, v + rows));
    else if (k.key === 'PageUp') setTop((v) => Math.max(0, v - rows));
    else if (k.key === 'Home') setTop(0);
    else if (k.key === 'End') setTop(maxTop);
  };
  if (!open) return null;
  const at = Math.min(top, maxTop);
  return (
    <Modal onKey={onKey} title={t('keys.title')} width={SHEET_WIDTH} onClose={onClose} footer={`${at > 0 ? '↑ ' : ''}${at < maxTop ? '↓ more · ' : ''}${tt('sheet.close')}`}>
      <Box dir="column" height={rows}>
        {lines.slice(at, at + rows).map((l, i) =>
          l.head !== undefined ? (
            <Text key={i} colour="faint" bold truncate>{l.head.toUpperCase()}</Text>
          ) : (
            <Box key={i} dir="row" height={1}>
              {l.label === '' ? <Text bold truncate grow={1}>{l.keys ?? ''}</Text> : <>
                <Text bold width={keysW} truncate>{l.keys ?? ''}</Text>
                <Text truncate grow={1}>{l.label ?? ''}</Text>
              </>}
            </Box>
          ),
        )}
      </Box>
    </Modal>
  );
}
