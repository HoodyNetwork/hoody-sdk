// Jump to's places on the AI page that the view does not draw now (manifest searchHide; the shell loads this, never
// the page). With no computer shown, Models (/models) draws the shared pick-a-computer state (view.tsx
// ComputerRequired): none of its sections, settings or questions, and none of the manifest commands that open something
// inside Models (connect an account, Claude Code, spending: a link with a query). The plain page links stay, since
// they land on the page and its pick-a-computer state, and so does "Pick the model" (a link whose query is only a pick):
// it lands on that same state, and once a computer is picked there the model choice opens. The same signal as the page's computer read, core's
// current computer, without the read itself. While the shell's computer list is read, or could not be read, nothing
// is left out.
import { useCurrentComputer } from '@core';
import { useShellData, type SearchHide } from '@kit';
import page from './page';

/** Whether a command's link opens a place inside Models: /ai/models with a query that carries more than a pick
 * (a param other than `pick`, read as URL params, never as text). */
export function opensInsideModels(to: string | undefined): boolean {
  if (!to) return false;
  const [path = '', query = ''] = to.split('#')[0]!.split('?');
  if (path !== '/ai/models') return false;
  for (const name of new URLSearchParams(query).keys()) if (name !== 'pick') return true;
  return false;
}

/** The manifest commands that open a place inside Models, read from the manifest so a new one is covered. */
const INTO_MODELS: string[] = [];
for (const c of page.commands ?? []) if (opensInsideModels(c.to)) INTO_MODELS.push(c.id);

/** What the AI page leaves out; null: it draws every place. */
export function aiHide(s: { computer: boolean; read?: 'loading' | 'unknown' }): SearchHide | null {
  return s.computer || s.read ? null : { hide: ['/models'], commands: INTO_MODELS };
}

export default function useAiSearchHide(): SearchHide | null {
  const computer = useCurrentComputer() !== null;
  const read = useShellData().computersRead;
  return aiHide({ computer, read });
}
