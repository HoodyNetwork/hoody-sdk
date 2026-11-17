// The sidebar's groups and order. This table fixes these numbers; a manifest's own
// nav.group/order only places pages this table does not know yet (a new page lands where it says
// until its row is added here).
import type { NavGroup, PageManifest } from '@kit/page';

export const NAV_PLACE: Readonly<Record<string, { group: NavGroup; order: number }>> = {
  home: { group: 'main', order: 10 },
  computers: { group: 'main', order: 20 },
  files: { group: 'main', order: 25 },
  bots: { group: 'main', order: 30 },
  apps: { group: 'main', order: 40 },
  board: { group: 'main', order: 50 },
  programs: { group: 'build', order: 10 },
  schedules: { group: 'build', order: 20 },
  scripts: { group: 'build', order: 30 },
  logs: { group: 'build', order: 40 },
  tunnels: { group: 'build', order: 45 },
  notes: { group: 'build', order: 50 },
  ai: { group: 'build', order: 60 },
  vms: { group: 'build', order: 70 },
  market: { group: 'account', order: 10 },
  billing: { group: 'account', order: 20 },
  referrals: { group: 'account', order: 25 },
  keys: { group: 'account', order: 30 },
  // In the account group, right after Keys. The one line to change if it belongs elsewhere.
  api: { group: 'account', order: 35 },
  notifications: { group: 'account', order: 40 },
  account: { group: 'account', order: 50 },
  guide: { group: 'help', order: 10 },
  support: { group: 'help', order: 20 },
};

export interface NavEntry {
  page: PageManifest;
  group: NavGroup;
  order: number;
}

/** Pages with a nav entry, placed by NAV_PLACE, sorted by order then id. */
export function navEntries(pages: readonly PageManifest[]): NavEntry[] {
  return pages
    .flatMap((page) => {
      if (!page.nav) return [];
      const place = NAV_PLACE[page.id] ?? { group: page.nav.group, order: page.nav.order };
      return [{ page, ...place }];
    })
    .sort((a, b) => a.order - b.order || a.page.id.localeCompare(b.page.id));
}
