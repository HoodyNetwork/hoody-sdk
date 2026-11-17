// The delete check hook (split out of DeletePlanner.tsx so the terminal build shares it; DeletePlanner.tsx re-exports
// it).
import { useFilesChange } from './data';

/** A held delete's Check again (reads only), for the held-changes band: it cannot send. */
export function useDeleteCheck(): { readBack: (only?: { hold: string }) => Promise<boolean> } {
  const del = useFilesChange('delete');
  return { readBack: del.readBack };
}
