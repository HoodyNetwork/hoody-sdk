// pictures.tsx: the dock's reader for the pictures its conversation shows (the kit draws them: StepPictureHost). The files a
// step made are read from the conversation's computer; a picture sent with a message is read back from the agent's record of
// this chat. Both are bounded reads through core, in the conversation's own realm: a step's files when the step is opened, a
// message's pictures when its row comes near the screen (shared with the AI page showing the same chat: StepPictureHost).
import { useMemo, type ReactNode } from 'react';
import { StepPictureHost, readSessionImage, type StepPictureReader } from '@kit';
import { FILE_READ_MAX, readFileBytes } from '../pages/files/readBytes';
import type { AskEngine } from './engine';

const PICTURE_MAX = Math.min(FILE_READ_MAX, 16 * 1024 * 1024);

export function DockPictures({ eng, children }: { eng: AskEngine; children: ReactNode }) {
  const slot = eng.slot, rec = eng.record ?? null;
  const project = slot?.project ?? '', computer = slot?.computer ?? '', server = slot?.server ?? '', realm = rec?.r ?? '', sid = rec?.s ?? '';
  const reader = useMemo<StepPictureReader | null>(() => (project && computer && server && sid ? {
    read: (path, signal) => readFileBytes({ id: computer, name: '', project_id: project, server_name: server, status: '', rules: 'unknown' }, path, { maxBytes: PICTURE_MAX, signal }),
    stored: (id, signal) => readSessionImage({ project: { id: project }, container: { id: computer, server_name: server } }, realm, sid, id, signal),
  } : null), [project, computer, server, realm, sid]);
  return <StepPictureHost value={reader} session={`${computer}|${realm}|${sid}`}>{children}</StepPictureHost>;
}
