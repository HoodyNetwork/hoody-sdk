// Where a log row leads: the places its computer, program, Bot or script live. Pure: the page
// resolves each target through the shell's page link (a hidden page shows no link).
import { links as botsLinks } from '../bots/links';
import { links as computersLinks } from '../computers/links';
import { links as programsLinks } from '../programs/links';
import { links as scriptsLinks } from '../scripts/links';
import { sourceOf, type DataItem } from './logic';

export type LinkPage = 'computers' | 'bots' | 'scripts' | 'programs';
export interface RowLink { id: string; label: 'lk.computer' | 'lk.bots' | 'lk.programs' | 'lk.script'; page: LinkPage; path: string }

/** `handle` is the computer's URL handle (name and the last four of its id); `script` the script the list is showing, when one is. */
export function rowLinks(it: DataItem, ctx: { handle: string; script?: string | null }): RowLink[] {
  const out: RowLink[] = [{ id: 'computer', label: 'lk.computer', page: 'computers', path: computersLinks.item(ctx.handle) }];
  const src = sourceOf(it);
  if (src === 'bots') out.push({ id: 'bots', label: 'lk.bots', page: 'bots', path: botsLinks.byComputer(ctx.handle) });
  if (src === 'visits') out.push({ id: 'programs', label: 'lk.programs', page: 'programs', path: programsLinks.list });
  if (it.kind === 'script') out.push({ id: 'script', label: 'lk.script', page: 'scripts', path: ctx.script ? scriptsLinks.item(ctx.script) : scriptsLinks.list });
  return out;
}

/** The sources whose empty list can say where its entries come from. */
export function sourceHome(source: string): { page: LinkPage; label: 'lk.openPrograms' | 'lk.openBots' | 'lk.openScripts' | 'lk.computers'; path: string } {
  if (source === 'bots') return { page: 'bots', label: 'lk.openBots', path: botsLinks.list };
  if (source === 'scripts') return { page: 'scripts', label: 'lk.openScripts', path: scriptsLinks.list };
  if (source === 'changes' || source === 'account' || source === 'helper' || source === 'decisions') return { page: 'computers', label: 'lk.computers', path: computersLinks.list };
  return { page: 'programs', label: 'lk.openPrograms', path: programsLinks.list };
}
