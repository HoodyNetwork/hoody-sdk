// Jump to's places on Tunnels that the view does not draw now (manifest searchHide; the shell loads this, never the
// page). With no computer shown the page asks for one (view.tsx ComputerRequired), and with a stopped one it says so:
// neither draws its tabs or its questions. While the shell's computer list is read, or could not be read, nothing is
// left out.
import type { SearchHide } from '@kit';
import { useComputer } from './data';

const NONE: SearchHide = { only: [] };

/** What Tunnels leaves out for the computer shown (the page's own useComputer); null: it draws every place. */
export function tunnelsHide(c: { data: { running: boolean } | null; read?: 'loading' | 'unknown' }): SearchHide | null {
  if (c.data === null) return c.read ? null : NONE;
  return c.data.running ? null : NONE;
}

export default function useTunnelsSearchHide(): SearchHide | null {
  return tunnelsHide(useComputer());
}
