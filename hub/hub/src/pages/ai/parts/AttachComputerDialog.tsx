// From a computer… and Mention a file… of the chat composer's add menu: the kit FileChooser on the Files reads, over every
// computer of the shown realm (the chat's own first, opened at the chat's folder).
//   - Attach: each chosen file's folder is listed fresh (the path must still name a file there, and its size is known
//     before a byte is read), the file is read once through the Files read and handed to the composer's own add path as a
//     File that knows where it came from. Nothing is attached when a read fails, and nothing is sent. The agent takes
//     file contents, never a path on another computer, so this is how a file on another computer reaches a chat.
//   - Mention: nothing is read; the file's path is written into the message as the agent's "@" mention, followed by the
//     computer's name when it is not the chat's own (the agent reads its own computer's files only).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Target } from '@core';
import { FileChooser, fileOriginText, fileReferenceText, formatBytes, formatNumber, useStrings, type ChooserEntry, type ChooserPlaceLink, type ChooserResult } from '@kit';
import { attach as A } from '@ask/io';
import { FILE_READ_MAX, blockedPath, chooserAbs, chooserDir, freshListing, parentOf, readFileBytes, useFileChooserHost } from '../../files/links';
import { fileFrom } from './attachOrigin';
import { filesComputerOf } from './mentionFiles';
import strings from './Conversation.strings.en.json';

export interface AttachComputerProps {
  /** The chat's computer and folder while it is the computer shown: the dialog opens there. */
  at: { target: Target; cwd: string } | null;
  /** Attach: the composer's own add path (its rules decide what is kept). */
  onAdd: (files: readonly File[]) => void;
  /** Mention: writes the reference into the message. With it the dialog reads no file. */
  onMention?: (text: string) => void;
  /** How many more files the message takes (images and text files together). */
  room?: number;
  onClose: () => void;
}

/** What a picked file is sent as, by its name's ending. The composer reads the bytes themselves (an image by its first bytes,
 *  anything else as text), so this only labels the File. */
const TYPES: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  md: 'text/markdown', json: 'application/json', csv: 'text/csv', html: 'text/html', xml: 'application/xml', yaml: 'application/yaml', yml: 'application/yaml',
};
export function typeOfName(name: string): string {
  const ext = /\.([A-Za-z0-9]+)$/u.exec(name)?.[1]?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'text/plain';
}

/** The chat's folder as the chooser's first folder: under the top folder, ending in "/". */
export const startPath = chooserDir;

type Problem = { k: 'folder' | 'missing' | 'path'; name: string } | { k: 'big'; name: string; size: number };

export function AttachComputerDialog({ at, onAdd, onMention, room = A.IMG_MAX, onClose }: AttachComputerProps) {
  const t = useStrings(strings);
  const own = at?.target.container.id;
  const ownTarget = at?.target;
  const extra = useMemo(() => (ownTarget ? filesComputerOf(ownTarget) : undefined), [ownTarget?.container.id, ownTarget?.project.id, ownTarget?.container.server_name]); // eslint-disable-line react-hooks/exhaustive-deps -- the ids name the computer
  const host = useFileChooserHost(extra);
  const [problem, setProblem] = useState<Problem | null>(null);
  const mention = onMention !== undefined;

  // A read that ends after the dialog left (closed, or another chat) adds nothing.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cwd = at?.cwd ?? '';
  const places = useCallback((computer: string | null): readonly ChooserPlaceLink[] => [
    ...(own !== undefined && computer === own && cwd ? [{ id: 'chat', label: t('conv.add.computer.chatFolder'), dir: chooserDir(cwd), icon: 'ai' as const }] : []),
    ...host.places,
  ], [own, cwd, host.places, t]);

  // What the composer could never take is refused in the list, before anything is read: a file past the read bound, and a
  // file that is no picture by its name and is past a text file's size.
  const accept = useCallback((e: ChooserEntry): string | null => {
    if (mention || e.size === null || e.size === undefined) return null;
    if (e.size > FILE_READ_MAX) return t('conv.add.computer.why.bigRow', { max: formatBytes(FILE_READ_MAX) });
    if (!typeOfName(e.name).startsWith('image/') && e.size > A.TXT_BYTES) return t('conv.add.computer.why.textBig', { max: formatBytes(A.TXT_BYTES) });
    return null;
  }, [mention, t]);

  const choose = async (picked: readonly ChooserResult[]) => {
    setProblem(null);
    if (onMention) {
      const one = picked[0];
      if (one) onMention(fileReferenceText(one, own ?? null));
      onClose();
      return;
    }
    const files: File[] = [];
    for (const x of picked) {
      const c = x.computer ? host.computerOf(x.computer.id) : undefined;
      const full = chooserAbs(x.path);
      if (!c || blockedPath(full) || !c.project_id || !c.server_name) { setProblem({ k: 'path', name: x.name }); return; }
      const listed = await freshListing(c, parentOf(full));
      if (!alive.current) return;
      if (listed === 'failed') throw { kind: 'unavailable' }; // core's rejection shape, shown by the chooser with its details
      const e = listed.entries.find((y) => y.name === x.name);
      if (!e) { setProblem({ k: 'missing', name: x.name }); return; }
      if (e.dir) { setProblem({ k: 'folder', name: x.name }); return; }
      if (e.size !== null && e.size > FILE_READ_MAX) { setProblem({ k: 'big', name: x.name, size: e.size }); return; }
      const bytes = await readFileBytes(c, full, { maxBytes: FILE_READ_MAX });
      if (!alive.current) return;
      if (!bytes) { setProblem({ k: 'path', name: x.name }); return; }
      files.push(fileFrom(new File([bytes as BlobPart], x.name, { type: typeOfName(x.name) }), fileOriginText(x)));
    }
    onAdd(files);
    onClose();
  };

  const why = problem === null ? undefined
    : problem.k === 'big' ? t('conv.add.computer.why.big', { name: problem.name, size: formatBytes(problem.size), max: formatBytes(FILE_READ_MAX) })
      : t(`conv.add.computer.why.${problem.k}`, { name: problem.name });
  const shared = {
    isOpen: true, onClose, reads: host.reads, computers: host.computers, computersStatus: host.computersStatus, current: own,
    rootLabel: '/', start: at ? chooserDir(at.cwd) : '', places, recents: 'ai-attach', onChoose: choose, problem: why,
  } as const;
  // Two literal overlay ids: a mention and an attach are different overlays to the back button and to the layer stack.
  return mention
    ? <FileChooser {...shared} overlayId="ai-mention-computer" mode="file" title={t('conv.add.mention.title')} primaryLabel={t('conv.add.mention.do')} limits={{ note: t('conv.add.mention.note') }} />
    : (
      <FileChooser
        {...shared}
        overlayId="ai-attach-computer"
        mode="files"
        title={t('conv.add.computer.title')}
        primaryLabel={t('conv.add.attach')}
        accept={accept}
        limits={{ maxFiles: Math.max(1, room), note: t('conv.add.computer.note', { img: formatBytes(A.IMG_BYTES), text: formatBytes(A.TXT_BYTES), texts: formatNumber(A.TXT_MAX) }) }}
      />
    );
}
