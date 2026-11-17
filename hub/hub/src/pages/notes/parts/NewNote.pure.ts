// The notes program's address (split out of NewNote.tsx so the terminal build shares it; NewNote.tsx re-exports it).
import { buildPortUrl } from '@core';
import type { Computer } from '../types';

export function notesUrl(c: Computer): string | null {
  const u = buildPortUrl({ id: c.projectId }, { id: c.id, ...(c.serverName ? { server_name: c.serverName } : {}) }, 'notes', 1) as string | null | undefined;
  return u || null;
}
