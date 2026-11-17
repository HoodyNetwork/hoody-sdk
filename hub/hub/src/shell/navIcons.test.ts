// Every page in the navigation (sidebar, palette, phone bottom bar) shows its Hoody brand icon.
// The page manifests are read as text: the shell never imports a page module.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_TABS } from './BottomNav';

const PAGES = path.resolve(__dirname, '../pages');
// /apps has no nav entry (it only redirects to Programs > Apps), and /market none (it
// redirects to Plans & billing), so neither is listed.
const NAV_ICON: Record<string, string> = {
  home: 'hoody-overview',
  computers: 'hoody-virtual-server',
  bots: 'hoody-bots',
  board: 'hoody-canvas',
  ai: 'hoody-ai',
  keys: 'hoody-private-key',
  programs: 'hoody-services',
  vms: 'hoody-kit',
  schedules: 'hoody-cron',
  notes: 'hoody-notes',
  scripts: 'hoody-code',
  logs: 'hoody-logs',
  account: 'hoody-account',
  // The Market moved into Plans & billing as its Bare metal view; billing took the market's icon
  // and nav slot, and /market only redirects (no nav entry).
  billing: 'hoody-marketplace',
  // No Hoody brand icon for the referral program yet: the kit's share icon.
  referrals: 'share',
  notifications: 'hoody-notifications',
  guide: 'hoody-docs',
};
const navIcon = (id: string) => {
  const src = readFileSync(path.join(PAGES, id, 'page.ts'), 'utf8');
  return /nav:\s*\{[^}]*\bicon:\s*['"]([\w-]+)['"]/.exec(src)?.[1];
};

describe('navigation icons', () => {
  it.each(Object.entries(NAV_ICON))('the %s page shows %s', (id, icon) => {
    expect(navIcon(id)).toBe(icon);
  });

  it('the phone bottom bar uses the same icons as the pages it opens', () => {
    for (const tab of BOTTOM_TABS) expect(tab.icon).toBe(NAV_ICON[tab.id]);
  });
});
